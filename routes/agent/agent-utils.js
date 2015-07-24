/**
 * Utility class for common agent functions
 */
var KnowhowShell = require('knowhow-shell');
//var KnowhowShell = require('../../knowhow-shell/knowhow-shell');
//var ttyPool = new require('../../knowhow-shell/tty-pool')(2,10);
//var ttyPool = new require('knowhow-shell/tty-pool')(2,10);
var KHShell = new KnowhowShell()
var Datastore = require('nedb');

var os = require("os");
var crypto = require('crypto');
var logger=require('../log-control').logger;
var async = require('async');
var http = require('http');

db = new Datastore({ filename: './agents.db', autoload: true });
exports.db = db;

/**
 * Updates an agent in the database
 */
var updateAgent = function(agent, callback) {
	loadAgent(agent, function(err, loadedAgent) {
		if (!loadedAgent) {
			loadedAgent = agent;
		} else {
			var props = Object.getOwnPropertyNames(agent);
			props.forEach(function(prop){
				 //logger.debug('updateAgent: updating property: agent.'+prop);
				 loadedAgent[prop]=agent[prop];
			});
		}
		if (agent.message) {
			loadedAgent.message = agent.message;
		}
		if (agent.status) {
			loadedAgent.status = agent.status;
		}
		if (agent.progress) {
			loadedAgent.progress = agent.progress;
		}
		db.update({ '_id': loadedAgent._id}, loadedAgent, function(err,docs) {
			if(err) {
				callback(err);
			} else if (callback) {
				callback(undefined,docs[0]);
			}
		});
	});
};

exports.updateAgent = updateAgent;

/**
 * checks if an agent is alive
 *
 * @param the agent to check
 * @param callback to run afterwards
 */
var heartbeat = function(agent, callback) {
	if (this.agent) {
		agent=this.agent;
	}
	//logger.debug('heartbeat checking status for: '+agent.user+'@'+agent.host+':'+agent.port);
	
	var options = {
		    host : agent.host,
		    port : agent.port,
		    path : '/api/agentInfo',
		    method : 'GET',
		    headers: {
		        'Content-Type': 'application/json'
		    }
		};
	
	var request = http.request(options, function(res) {
		//logger.debug("processing status response: ");
		
		var output = '';
        //logger.debug(options.host + ' ' + res.statusCode);
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            output += chunk;
        });

        res.on('end', function() {
        	//logger.info("done.");
            obj = JSON.parse(output);
            console.log(output);
        	logger.debug("agent status check: "+obj.status);
        	if (obj.status == 'READY') {
        		agent.progress=0;
        		agent.message='';        
        		callback(undefined, agent);
        	} else {
        		callback(new Error("unable to connect"),agent);
        	}
            
        });
        //res.end();
	});
	request.on('error', function(er) {
		//logger.error(er.stack);
		logger.error('heartbeat could not connect to agent: '+agent.user+'@'+agent.host+':'+agent.port, er);
		callback(new Error("unable to connect"),agent);
	});
	request.end();

};

exports.heartbeat = heartbeat;

/**
 * Lists all agents
 */
function listAgents(serverInfo, callback) {
	db.find({}, function(err, docs) {
		if (err) {
			callback(err);
			return;
		}
		//logger.debug('found '+docs.length+' agents');
		//logger.debug(docs);
//		docs.forEach(function(agent) {
//			console.log(agent);
//		});
		var agentSort = function (agent1, agent2) {
			var agentName1 = agent1.host+agent1.port+agent1.user;
			var agentName2 = agent2.host+agent2.port+agent2.user
		    return (agentName1 > agentName2);
		}


		var result = docs.sort(agentSort);
		for (index in docs) {
			if (serverInfo.newestVersions && ((docs[index].shellversion < serverInfo.newestVersions['knowhow-shell']) || !docs[index].shellversion) ) {
				docs[index].shellUpgradeAvailable = true;
				if (!docs[index].message) {
					docs[index].message = "knowhow-shell upgrade available";
				}
			} else {
				delete docs[index].shellUpgradeAvailable
			}
			if (serverInfo.newestVersions && ((docs[index].version < serverInfo.newestVersions['knowhow-agent']) || !docs[index].version) ) {
				docs[index].agentUpgradeAvailable = true;
				if (!docs[index].message) {
					docs[index].message = "agent upgrade available";
				}
			} else {
				delete docs[index].agentUpgradeAvailable;
			}
			
		}
		if (callback) {
			callback(undefined, result);
		}
	  });
};

exports.listAgents = listAgents;

/**
 * Loads an agent from the database
 * @param agent
 * @param callback
 */
function loadAgent(agent, callback) {
	if (!agent) {
		logger.error("no agent data provided to loadAgent");
		if (callback) {
			callback(new Error("no agent provided"));
		}
		return;
	}

	var queryParams = {};
	//order of the query params matters
	
	if (agent._id) {
		queryParams._id=agent._id;
	} else {
		queryParams = {$and: []};
		
		if (agent.user) {
			queryParams.$and.push({user: agent.user});
		}
		if (agent.port) {
			queryParams.$or=[{port: +agent.port}, {port: ""+agent.port} ];
		}
		if (agent.host) {
			queryParams.$and.push({host: agent.host});
		}
	}
	
	//logger.debug("query agents:");
	//console.log(queryParams);
	db.find(queryParams, function(err, doc) {
		logger.debug(doc);
		if (err) {
			callback(err);
			return;
		}
//		docs.forEach(function(agent) {
//			console.log(agent);
//		});
		logger.debug("found: "+doc.length);
		if (callback) {
			callback(undefined, doc[0]);
		}
	  });
};

exports.loadAgent = loadAgent;

/**
 * looks up a password for a user
 *
 * @param userName - the user to look up
 * @param callback
 */
function lookupPasswordForUser(userName, callback) {
	if (!userName) {
		callback(new Error("no username provided"));
		return;
	}

	
	logger.debug("searching for password for: "+userName);
	db.find({user: userName, passwordEnc: { $exists: true } }, function(err, doc) {
		logger.debug("password search complete");
		if (err) {
			logger.error(err.stack)
			callback(err);
			return;
		}
		//console.log("found "+doc.length);		
		//doc.forEach(function(agent) {
		//	console.log(agent);
		//});
		if (callback) {
			if (doc[0])
				callback(undefined, doc[0].passwordEnc);
			else 
				callback(new Error("unable to find password for user: "+userName));
		}
	  });
};

exports.lookupPasswordForUser = lookupPasswordForUser;

/**
 * Checks if an agent id exists
 *
 * @param the agentId
 * @param callback
 */
exports.doesAgentIdExist = function(agentId, callback) {
	var queryParams = {}
	queryParams._id = agentId;
	db.findOne(queryParams, function(err, doc) {
		if (err) {
			if (callback) {
				callback(err);
			}
			return false;
		}
		if (!doc) {
			if (callback) {
				callback(new Error("Agent does not exist"));
			}
			return false;
		}
//		docs.forEach(function(agent) {
//			console.log(agent);
//		});
		if (callback) {
			callback(undefined, doc);
		}
		return true;
	  });
}

var deleteAgent = function(agent, callback) {
	if (!agent) {
		callback(new Error("deleteAgent: no agent provided"));
		return;
	}
	var gotResponse = false;
	loadAgent( agent, function(err, loadedAgent) {
		
		if (!loadedAgent) {
			//agent.message = 'agent does not exist';
			//eventEmitter.emit('agent-error',agent);
			logger.error("agent does not exist: "+agent.user+"@"+agent.host+":"+agent.port);
			callback(new Error("agent does not exist: "+agent.host+":"+agent.port));
			return;
		}
		if (err) {
			logger.error(err.stack);
			callback(err);
			return;
		}
		logger.info("deleting agent: "+loadedAgent.host+":"+loadedAgent.port);
		var options = {
			    host : loadedAgent.host,
			    port : loadedAgent.port,
			    path : '/delete',
			    method : 'GET',
			    headers: {
			        'Content-Type': 'application/json'
			    }
			};
		var request = http.request(options, function(response) {
			gotResponse = true;
			logger.debug("processing delete response: ");
			
			var output = '';
			//logger.debug(options.host + ' ' + response.statusCode);
	        response.setEncoding('utf8');
	
	        response.on('data', function (chunk) {
	            output += chunk;
	        });
	
	        response.on('end', function() {
	        	logger.info("request to delete done.");
	            //var obj = JSON.parse(output);
	        	//logger.info(obj.status);
	        	
	        	db.remove({ _id: loadedAgent._id }, {}, function (err, numRemoved) {
	        		callback(err, numRemoved);
	        		eventEmitter.emit('agent-delete',agent);
	          	});
	        	
	        });
		});
		request.on('error', function(er) {
			logger.error('no agent running on: '+loadedAgent.user+'@'+loadedAgent.host+':'+loadedAgent.port+" "+er.message);
			db.remove({ _id: loadedAgent._id }, {}, function (err, numRemoved) {
				if (err) {
					logger.error(err.stack);
				}
				logger.info("removed agent " +loadedAgent.user+'@'+loadedAgent.host+':'+loadedAgent.port+" num removed="+numRemoved);
	    		
	    		if (!gotResponse) {
	    			callback(new Error("unable to contact agent, but removed from internal database."));
	    		}
	    		eventEmitter.emit('agent-delete',loadedAgent);
	      	});
		});
		request.end();
	});

};
exports.deleteAgent = deleteAgent;

/**
 * executes a job url on a particular agent using ssh
 */
exports.executeJob = function(jobURL, agent, callback) {

    fileControl.load(jobURL, function(err,content) {
			if (err) {
				main_callback(err);
				return;
			}
			try {
				job = JSON.parse(content);
				if (agent.login && !agent.user) {
					job.script.env.USER=agent.login;
				} else {
					job.script.env.USER=agent.user;
				}
				if (agent.passwordEnc) {
					job.script.env.PASSWORD=decrypt(agent.passwordEnc,serverInfo.cryptoKey);
				} else if (agent.password) {
					job.script.env.PASSWORD=agent.password;
				}
				job.script.env.HOST=agent.host;
				if (agent.ip) {
					job.script.env.HOST=agent.ip;
				}
				job.script.env.LOGIN=agent.login;
				job.script.env.PORT=agent.port;
				job.script.env.AGENT_ID=agent._id;
			} catch(err) {
				callback(err);
				return;
			}
			KHShell.executeJobAsSubProcess(job,function(err) {
				if (err) {
					callback(err);
				} else {
					callback();
				}
			});
		});
	
};

/**
 * Encrypts a value using an encryption key
 *
 * @param text to encrypt
 * @param cryptoKey - the crypto key to use
 */
function encrypt(text, cryptoKey){
	var cipher = crypto.createCipher('aes-256-cbc',cryptoKey)
	var crypted = cipher.update(text,'utf8','hex')
	crypted += cipher.final('hex');
	return crypted;
}

/**
 * Decrypts a value using an encrpytion key
 * 
 * @param text to decrypt
 * @param cryptoKEy - the crypto key to use
 */ 
function decrypt(text, cryptoKey){
	logger.debug("deciphering: "+text+" with key: "+cryptoKey);
	var decipher = crypto.createDecipher('aes-256-cbc',cryptoKey)
	var dec = decipher.update(text,'hex','utf8')
	dec += decipher.final('utf8');
	return dec;
}

exports.encrypt = encrypt;
exports.decrypt = decrypt;