var os = require("os");
var crypto = require('crypto');
var logger=require('./log-control').logger;
var async = require('async');
var zlib = require('zlib');
var fstream = require('fstream');
var tar = require('tar');
var Connection = require('ssh2');
var Datastore = require('nedb'), 
db = new Datastore({ filename: './agents.db', autoload: true });
var EventEmitter = require('events').EventEmitter;
var eventEmitter = new EventEmitter();
var nextAgentId =1;
var http = require('http');
var io =  require('socket.io-client');
var fileControl = require('../routes/file-control');
var ss = require('socket.io-stream');
var fs = require('fs');
var executionControl = require('./execution-control');
var KnowhowShell = require('knowhow-shell');
//var KnowhowShell = require('../../knowhow-shell/knowhow-shell');
//var ttyPool = new require('../../knowhow-shell/tty-pool')(2,10);
//var ttyPool = new require('knowhow-shell/tty-pool')(2,10);
var KHShell = new KnowhowShell(eventEmitter)

//deliver the agent files
var pathlib = require('path');
var agent_archive_name = 'knowhow_agent.tar.gz';
var agent_archive_path = pathlib.join(fs.realpathSync(require('process').cwd()), agent_archive_name);
var node_archive_name = 'node-v0.10.28-linux-x64.tar.gz';
var node_archive_path = pathlib.join(__dirname+'../../',node_archive_name);


eventEmitter.on('package-complete',function(agent){
	logger.info("agent contol packaged agent: "+agent);
});

exports.eventEmitter = eventEmitter;

defaultAgent = {
		host: "localhost",
		port: 3141
	};
exports.defaultAgent = defaultAgent;

addDefaultAgent = function(username,callback) {
	defaultAgent.user = username;
	db.findOne(defaultAgent,function(err, doc) {
		if(err) {
			logger.error(err.message);
			return;
		}
		if (!doc) {
			db.insert(defaultAgent, function (err, newDoc) { 
				if (err) {
					logger.error(err.stack);
				}  
			    logger.debug("added default agent: "+newDoc._id);
			    agent=newDoc;
			    getStatus.bind({agent:defaultAgent})();
				eventEmitter.emit('agent-add',agent);
				
			});
		}
		
		getStatus.bind({agent: defaultAgent})(function() {
			logger.info("default agent added");
		});
		
	
	});
	
}

exports.addDefaultAgent = addDefaultAgent;

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

initAgent = function(agent, serverInfo, callback) {
	agent_prototype = {
		login: "",
		host: "",
		user: serverInfo.username,
		port: 3141,
		status: "READY",
		type: "linux",
		progress: 1
	};
	//console.log(serverInfo);
	//console.log(agent_prototype);
	var props = Object.getOwnPropertyNames(agent);
	props.forEach(function(prop){
		 agent_prototype[prop]=agent[prop];
		 logger.debug('initAgent: adding property: '+prop);
	});
	
	if (agent_prototype.login != undefined && agent_prototype.user == "") {
		agent_prototype.user = agent_prototype.login;
	}
	if(agent_prototype.password) {
		agent_prototype.passwordEnc=encrypt(agent_prototype.password, serverInfo.cryptoKey);
		callback(undefined, agent_prototype);
		logger.info("initialized agent: "+agent_prototype.user+"@"+agent_prototype.host+":"+agent_prototype.port);
	}
	else if (!agent_prototype.password) {
		lookupPasswordForUser(agent_prototype.user, function(err, password) {
			if (err && callback) {
				callback(err);
				return;
			}
			agent_prototype.passwordEnc=password;
			if (callback) {
				callback(undefined, agent_prototype);
			}
			logger.info("initialized agent with password: "+agent_prototype.user+"@"+agent_prototype.host+":"+agent_prototype.port);
		});
	} 
	delete agent_prototype.version;
	delete agent_prototype.shellversion;
	delete agent_prototype._id;
	return agent_prototype;
};

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

exports.resetAgent = function(agent, eventHandler, serverInfo, callback) {
	agent.progress=1;
	agent.status='INSTALLING'
	eventEmitter.emit('agent-update', agent);
	loadAgent(agent, function(error, loadedAgent) {
		if (!loadedAgent) {
			loadedAgent = agent;
		}
		console.log("reset loaded agent");
		deleteAgent(loadedAgent, function(err, oldAgent) {
			if (err) {
				//callback(err);
				//return;
			}
			delete loadedAgent._id;
			if (loadedAgent.passwordEnc && serverInfo && serverInfo.cryptoKey) {
				loadedAgent.password=decrypt(loadedAgent.passwordEnc,serverInfo.cryptoKey);
			}
			addAgent(loadedAgent, eventHandler, serverInfo, function(err, newAgent) {
				if (err) {
					callback(err);
					return;
				}
				callback();
			
			});
		});
	});

}

install = function(main_callback) {
    agent=this.agent;
    serverInfo = this.serverInfo;
    if (!agent.user && (!agent.password || !agent.passwordEnc) ) {
    	//console.log("AGENT=");
    	//console.log(agent);
    	main_callback(new Error("agent user and or password are missing: user="+agent.user)+" password=");
    	return;
    }
    fileControl.load("InternalRepo:///jobs/agent/installKHAgent.json", function(err,content) {
			if (err) {
				main_callback(err);
				return;
			}
			try {
				job = JSON.parse(content);
				if (agent.login) {
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
				main_callback(err);
				return;
			}
			KHShell.executeJobAsSubProcess(job,function(err) {
				if (err) {
					main_callback(err);
				} else {
					main_callback();
				}
			});
		});
	
};

startAgent = function(main_callback) {
    agent=this.agent;
    logger.debug(agent);
    fileControl.load("InternalRepo:///jobs/agent/startKHAgent.json", function(err,content) {
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
				main_callback(err);
				return;
			}
			KHShell.executeJobAsSubProcess(job,function(err) {
				if (err) {
					main_callback(err);
				} else {
					main_callback();
				}
			});
			//executionControl.executeJob(defaultAgent,job,main_callback);
		});
	
};

getStatus = function(callback) {
	var agent = this.agent;
	logger.info('checking status for: '+agent.host);
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
		logger.info("processing status response: ");
		
		var output = '';
        //logger.debug(options.host + ' ' + res.statusCode);
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            output += chunk;
        });

        res.on('end', function() {
        	logger.info("done.");
        	try {
            	obj = JSON.parse(output);
	        	//logger.debug("agent status check: "+obj.status);
	        	if (obj.status != undefined) {
					
	        		agent.type=obj.type,
					agent.startTime=obj.startTime
					agent.status=obj.status;
					agent.mode=obj.mode;
	        		updateAgent(agent);
	        	}            
	            if (callback) callback();
	        } catch(err) {
	        	logger.error(err.message);
	        	logger.error(err.stack);
	        	if (callback) callback(err);
	        }
            
        });
        //res.end();
	});
	request.on('error', function(er) {
		console.error(er);
		logger.error('no agent running on agent: '+agent.host,er);
		
		if (callback) callback();
	});
	request.end();

};

registerServer = function(callback) {
	var agent = this.agent;
	var serverInfo = this.serverInfo;
	if (!serverInfo) {
		serverInfo = {};
	}
	logger.info('registering this server: '+serverInfo.name+':'+serverInfo.port+' to listen for events on: '+agent.host+':'+agent.port);
	// prepare the header
	try {
		var headers = {
		    'Content-Type' : 'application/json',
		    'Content-Length' : Buffer.byteLength(JSON.stringify(serverInfo) , 'utf8'),
		    'Content-Disposition' : 'form-data; name="serverInfo"'
		};
	
		// the post options
		var options = {
		    host : agent.host,
		    port : agent.port,
		    path : '/api/registerServer',
		    method : 'POST',
		    headers : headers
		};
	
		// do the POST call
		var reqPost = http.request(options, function(res) {
		    //console.log("statusCode: ", res.statusCode);
		    // uncomment it for header details
		  	//console.log("headers: ", res.headers);
	
		    res.on('data', function(data) {
		    	if (JSON.parse(data).registered) {
		    		logger.info('server registration complete');
		    		callback();
		    	} else {
		    		agent.message = 'Unable to register server';
		    		eventEmitter.emit('agent-error',agent);
		    		callback(new Error('Unable to register server'));
		    	}
		        logger.info('server registration complete');
		    });
		});
	
		// write the json data
		reqPost.write(JSON.stringify(serverInfo));
		reqPost.end();
		reqPost.on('error', function(e) {
		    logger.error("Unable to register server - connection error");
		    agent.message = 'Unable to register server';
			eventEmitter.emit('agent-error',agent);
			callback(e);
		});
	} catch (error ) {
		callback(error);
		return;
	}

};

updateAgentInfoOnAgent = function(callback) {
	var serverInfo = this.serverInfo
	var agent = this.agent;
	agent.status='READY';
	agent.encyrptKey = serverInfo.cryptoKey;
	agent.passwordEnc = agent.passwordEnc;
	
	logger.info('updating agent properties on: '+agent.host+':'+agent.port);
	// prepare the header
	var headers = {
	    'Content-Type' : 'application/json',
	    'Content-Length' : Buffer.byteLength(JSON.stringify(agent) , 'utf8'),
	    'Content-Disposition' : 'form-data; name="agent'
	};

	// the post options
	var options = {
	    host : agent.host,
	    port : agent.port,
	    path : '/api/updateAgentInfo',
	    method : 'POST',
	    headers : headers
	};

	// do the POST call
	var reqPost = http.request(options, function(res) {
	    //console.log("statusCode: ", res.statusCode);
	    // uncomment it for header details
	  //console.log("headers: ", res.headers);
		var output = '';
        //logger.debug(options.host + ' ' + res.statusCode);
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            output += chunk;
        });

        res.on('end', function() {
        	try {
	    		var agentData = JSON.parse(output);
	    		updateAgent(agentData, function(err, updatedAgent) {
	    			if (err) {
	    				callback(new Error("unable to update agent"));
	    				return;
	    			}
	    			logger.info('update agent complete');
	    			callback();
	    		});
	    		
		        
		    } catch (err) {
		    	logger.error(err.stack);
		    	callback(err);
		    }
            
        });
	});

	// write the json data


	reqPost.write(JSON.stringify(agent));
	reqPost.end();
	reqPost.on('error', function(e) {
	    logger.error("Unable to update agent properties - connection error");
	    agent.message = 'Unable to update agent properties';
		eventEmitter.emit('agent-error',agent);
		callback(e);
	});

};

checkAgent = function(callback) {
	var agent = this.agent;
	
	if (agent.login != undefined && (agent.user == "" || agent.user == undefined)) {
		agent.user = agent.login;
	}
	if (agent.port == undefined || agent.port == "") {agent.port=3141;};
	logger.debug("checking agent user:"+agent.user);
	db.find({$and: [{user: agent.user}, {port: agent.port}, {host: agent.host}]}, function(err, docs) {
		logger.debug("check agent found: "+docs.length);
		if (docs.length > 0) {
			logger.error('agent: '+agent.user+'@'+agent.host+':'+agent.port+' already exists.');
			callback(new Error("Agent already exists"));
		} else {
			//heartbeat(agent, function(err) {
			//	if (!err) {
			//		callback(new Error("Agent already exists"));
			//	}
				callback();
			//});
			
		}
		
	  });

};

exports.packAgent = function(callback) {

	var agent = this.agent;
	//create agent archive
	logger.info('packaging agent');
	fstream.Reader({ 'path': __dirname+'../../../knowhow-agent' , 'type': 'Directory' }) /* Read the source directory */
	.pipe(tar.Pack()) /* Convert the directory to a .tar file */
	.pipe(zlib.Gzip()) /* Compress the .tar file */
	.pipe(fstream.Writer({ 'path': agent_archive_path }).on("close", function () {
		logger.info('agent packaged.');
		if (this.agent) {
			this.agent.message = 'package-complete';
			this.agent.progress+=10;
			eventEmitter.emit('agent-update', this.agent);
		}
		if (callback) {
			callback();
		}
	}).on("error",function(){
		if (this.agent) {
			eventEmitter.emit('agent-error', agent);
		}
		logger.error('error packing agent: ', err);
		if (callback) {
			callback(new Error("Unable to pack agent"));
		}
	}));
	
};



var waitForAgentStartup = function(callback) {
	var agent = this.agent;
	//console.log(this);
	logger.debug("waiting for agent: "+agent.user+'@'+agent.host+':'+agent.port);
	
    agent.message = 'starting agent';
    eventEmitter.emit('agent-update', agent);
    //timeout after 60 secs
    var timeout = setTimeout(function() {
    	clearInterval(heartbeatCheck);
    	agent.message=("agent failed to start");
    	callback(new Error("agent failed to start"));
    }, 60000);
    
    
    //wait until a heartbeat is received
    var heartbeatCheck = setInterval.bind({agent: agent})(function() {
    	heartbeat.call({agent: agent}, agent, function (err) {
    		if (!err) {
    			clearTimeout(timeout);
    			clearInterval(heartbeatCheck);
    			callback();
    		}
    	});
    }, 500);
};

exports.waitForAgentStartup = waitForAgentStartup;

deliverAgent = function(callback) {
    var agent = this.agent;
    agent.message = 'transferring agent';
	eventEmitter.emit('agent-update', agent);
	var Client = require('scp2').Client;

	var client = new Client({
		host: agent.host,
	    username: agent.login,
	    password: decrypt(agent.passwordEnc,this.serverInfo.cryptoKey),
	    path: '/tmp/'+agent_archive_name
	});

	client.upload(agent_archive_path, '/tmp/'+agent_archive_name, function(err){
		if (err) {
			logger.info(err);
			callback(err);
			return;
		}
		agent.message = 'agent transfer complete - delivering node runtime';
		client.upload(node_archive_path, '/tmp/'+node_archive_name, function(err){
			if (err) {
				logger.info(err);
				callback(err);
				return;
			}
			eventEmitter.emit('agent-update', agent);
			logger.info('node runtime transfer complete');
			
			//start the agent
			logger.info('starting agent on: '+agent.host);
			client.close();
			callback();
		});
	});


	client.on('close',function (err) {
		//callback();
	    });
	client.on('error',function (err) {
		logger.error(err.stack);
		agent.progress=0;
		agent.message = 'unable to transfer agent: '+err.message;
		eventEmitter.emit('agent-error', agent);
		logger.error('error delivering agent: ', err);
		callback(new Error("stop"));
	});
	
	client.on('transfer', function(buffer, uploaded, total) {
		var rem = uploaded % 5;
		if (rem ==0) {
			agent.progress+=1;
			eventEmitter.emit('agent-update', agent);
		}
		//logger.debug("uploaded="+uploaded+" total="+total);
	});

};

var addAgent = function(agent,agentEventHandler,serverInfo,callback) {
	
	initAgent(agent,serverInfo, function(err, initedAgent) {
		
		if (err) {
			callback(err);
			return;
		}
		agent=initedAgent;
		agent.callback = callback;
		logger.info('adding agent: '+agent.user+'@'+agent.host+':'+agent.port);
		logger.debug(agent);
		logger.debug(serverInfo);
			
		
		function_vars = {agent: agent};
		
		var exec = [checkAgent.bind(function_vars)
		     ];
		async.series(exec,function(err) {
			if (err) {
				logger.error('agent error' + err);
				agent.message = ""+err.message;
				eventEmitter.emit('agent-error',agent,err.syscall+" "+err.code);
				if (agent.callback) {
					delete agent.callback;
					callback(err);
					
				}
				return;
			} else {
			
	        	logger.debug("inserting agent: "+agent.user+"@"+agent.host+":"+agent.port);
		    	db.insert(agent, function (err, newDoc) {
		    		if (err) {
		    			logger.error(err.message);
		    			logger.error(err.stack);
		    			agent.message = ""+err.message;
				 		eventEmitter.emit('agent-error',agent,err.syscall+" "+err.code);
			    		if (agent.callback) {
			    			delete agent.callback;
							callback(err);
							
						}
						return;
					}
					agent.message = "installing on agent";
					agent.status = "INSTALLING";
					eventEmitter.emit('agent-update',agent);
				    logger.debug("added agent: "+newDoc._id);
				    agent=newDoc;
					
		
					var agentDirName = 'knowhow-agent';
					var agentArchive = os.tmpdir()+pathlib.sep+agent_archive_name;
					var agentExtractedDir = os.tmpdir()+pathlib.sep+agent._id;
					install_commands=['rm -rf '+agentExtractedDir,
									'mkdir -p '+agentExtractedDir,
					  	          	'tar xzf '+agentArchive+' -C '+agentExtractedDir,
					  	            'tar xzf '+os.tmpdir()+pathlib.sep+'node*.tar.gz -C '+agentExtractedDir,
					  	            'nohup '+agentExtractedDir+pathlib.sep+'node*/bin/node '+agentExtractedDir+pathlib.sep+agentDirName+pathlib.sep+'agent.js --port='+agent.port+' --user='+agent.user+' --login='+agent.login+' --_id='+agent._id+' --mode=production --workingDir='+agentExtractedDir+' > /dev/null 2>&1&'
					  	];
		
					function_vars = {agent: agent, commands: install_commands, serverInfo: serverInfo};
					var exec = [
					            //packAgent.bind(function_vars), 
					            //deliverAgent.bind(function_vars), 
					            install.bind(function_vars),
					            startAgent.bind(function_vars),
					            waitForAgentStartup.bind(function_vars),
					            registerServer.bind(function_vars),
					            updateAgentInfoOnAgent.bind(function_vars)
					            //getStatus.bind(function_vars)
					            ];
					            
					heartbeat.call({agent: agent},agent, function(err) {
						if (!err) {
							logger.info("Agent already exists");
							exec = [
					            waitForAgentStartup.bind(function_vars),
					            registerServer.bind(function_vars),
					            updateAgentInfoOnAgent.bind(function_vars)
					            //getStatus.bind(function_vars)
					            ];
						}
						async.series(exec,function(err) {
							if (err) {
								agent.message = ""+err.message;
								agent.status='ERROR';
				 				eventEmitter.emit('agent-error',agent,err.syscall+" "+err.code);
								logger.error('agent error - ' + err);
								logger.error(err.stack);
								eventEmitter.emit('agent-error',agent,err.syscall+" "+err.code);
								if (agent.callback) {
									logger.error(err.stack);
									delete agent.callback;
									callback(err);
								}
								return;
							} else {
								agent.status='READY';
								agent.message=''
								agent.progress =0;
								eventEmitter.emit('agent-update',agent);
								//set the progress back to 0
								db.find({_id: agent._id}, function(err, docs) {
									if (docs.length > 0) {
										agent = docs[0];
										agent.status='READY';
										agent.message=''
										agent.progress =0;
										eventEmitter.emit('agent-update',agent);
									}
									
								  });
								if (!agentEventHandler.agentSockets || !agentEventHandler.agentSockets[agent._id] || !agentEventHandler.agentSockets[agent._id].eventSocket) {
									agentEventHandler.listenForAgentEvents(agent, function(err, eventAgent) {
										if(err) {
											eventAgent.status='ERROR'
											eventAgentmessage='event socket error';
											agentControl.updateAgent(eventAgent, function() {
												agentControl.eventEmitter.emit('agent-update',eventAgent);
											});
											
											logger.error("unable to receive events for: "+eventAgent.user+"@"+eventAgent.host+":"+eventAgent.port);
											callback(new Error("unable to receive events for: "+eventAgent.user+"@"+eventAgent.host+":"+eventAgent.port));
											return;
										}
										logger.info("receiving events from: "+eventAgent.user+"@"+eventAgent.host+":"+eventAgent.port);
										if (!agentEventHandler.agentSockets || !agentEventHandler.agentSockets[agent._id] || !agentEventHandler.agentSockets[agent._id].fileSocket) {
											agentEventHandler.openFileSocket(agent, function(err, registeredAgent) {
												if(err) {
													registeredAgent.status='ERROR'
													registeredAgent.message='file socket error';
													agentControl.updateAgent(registeredAgent, function() {
														agentControl.eventEmitter.emit('agent-update',registeredAgent);
													});
													logger.error("unable to upload files to: "+registeredAgent.user+"@"+registeredAgent.host+":"+registeredAgent.port);
													callback(new Error("unable to upload files to: "+registeredAgent.user+"@"+registeredAgent.host+":"+registeredAgent.port));
													return;
												}
												logger.info("can now upload files to: "+registeredAgent.user+"@"+registeredAgent.host+":"+registeredAgent.port);
												if (agent.callback) {
													delete agent.callback;
													callback(undefined, agent);
													
												}
												//console.log("emitting agent-add event for agent: "+agent._id);
												agent.status='READY';
												agent.message="";
												eventEmitter.emit('agent-add',agent);
											});
										}
									});
								} 
								
								
							}
						
						});
	
						
					});	
						
				});
			}
			
		});
	});
};

exports.addAgent = addAgent;

function encrypt(text, cryptoKey){
	var cipher = crypto.createCipher('aes-256-cbc',cryptoKey)
	var crypted = cipher.update(text,'utf8','hex')
	crypted += cipher.final('hex');
	return crypted;
}
 
function decrypt(text, cryptoKey){
	logger.debug("deciphering: "+text+" with key: "+cryptoKey);
	var decipher = crypto.createDecipher('aes-256-cbc',cryptoKey)
	var dec = decipher.update(text,'hex','utf8')
	dec += decipher.final('utf8');
	return dec;
}



