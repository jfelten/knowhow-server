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
		port: 3000
	};
exports.defaultAgent = defaultAgent;

addDefaultAgent = function(callback) {
	
	db.findOne(defaultAgent,function(err, doc) {
		if(err) {
			logger.error(err.message);
			return;
		}
		if (!doc) {
			db.insert(defaultAgent, function (err, newDoc) {   
			    logger.debug("added agent: "+newDoc);
			    agent=newDoc;
				eventEmitter.emit('agent-add',agent);
				
			});
		}
		
		getStatus.bind({agent: defaultAgent})(function() {
			logger.info("default agent added");
		});
		
	
	});
	
}

exports.addDefaultAgent = addDefaultAgent;

updateAgent = function(agent, callback) {
	db.update({ '_id': agent._id}, agent, function(err,docs) {
		if (callback) {
			callback(err,docs[0]);
		}
	});
};

exports.updateAgent = updateAgent;

heartbeat = function(agent, callback) {

	logger.debug('heartbeat checking status for: '+agent.host);
	
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
        logger.debug(options.host + ' ' + res.statusCode);
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            output += chunk;
        });

        res.on('end', function() {
        	logger.info("done.");
            //obj = JSON.parse(output);
        	//logger.debug("agent status check: "+obj.status);        
        	callback(undefined, agent);
            
        });
        //res.end();
	});
	request.on('error', function(er) {
		//logger.error(er.stack);
		logger.error('heartbeat could not connect to agent: '+agent.host,er);
		callback(new Error("unable to connect"),agent);
	});
	request.end();

};

exports.heartbeat = heartbeat;

function listAgents(callback) {
	db.find({}, function(err, docs) {
		if (err) {
			callback(err);
			return;
		}
		logger.debug('found '+docs.length+' agents');
		logger.debug(docs);
//		docs.forEach(function(agent) {
//			console.log(agent);
//		});
		if (callback) {
			callback(undefined, docs);
		}
	  });
};

exports.listAgents = listAgents;

function loadAgent(agent, callback) {
	if (!agent) {
		callback(new Error("no agent provided"));
		return;
	}
	var queryParams = {};
	
	//order of the query params matters
	if (agent.host) {
		//queryParams.push({"host": agent.host});
		queryParams.host=agent.host;
	}
	if (agent.port) {
		//queryParams.push({"port": agent.port});
		queryParams.port=parseInt(agent.port);
	}
	if (agent.user) {
		queryParams.user=agent.user;
	}
	logger.debug("query agents:");
	logger.debug(queryParams);
	db.find(queryParams, function(err, doc) {
		logger.debug(doc);
		if (err) {
			callback(err);
			return;
		}
//		docs.forEach(function(agent) {
//			console.log(agent);
//		});
		if (callback) {
			callback(undefined, doc[0]);
		}
	  });
};

exports.loadAgent = loadAgent;

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

initAgent = function(agent) {
	agent_prototype = {
		host: "",
		port: "3000",
		login: "",
		password: "",
		user: "",
		status: "unknown",
		type: "linux",
		status: "INSTALLING",
		progress: 1
	};
	var props = Object.getOwnPropertyNames(agent_prototype);
	props.forEach(function(prop){
		 if (Object.getOwnPropertyNames(agent).indexOf(prop) < 0) {
			 agent[prop]=agent_prototype[prop];
			 logger.debug('initAgent: adding property: '+agent[prop]);
		 }
	});
	
	if (agent.login != undefined && agent.user == "") {
		agent.user = agent.login;
	}
	agent.password=encrypt(agent.password, serverInfo.cryptoKey);
	logger.info("initialized agent: "+agent.user+"@"+agent.host+":"+agent.port);
	return agent;
};

exports.deleteAgent = function( agent, callback) {
	logger.info("deleting agent: "+agent.host+":"+agent.port);
	var options = {
		    host : agent.host,
		    port : agent.port,
		    path : '/delete',
		    method : 'GET',
		    headers: {
		        'Content-Type': 'application/json'
		    }
		};
	var request = http.request(options, function(response) {
		logger.debug("processing delete response: ");
		
		var output = '';
		logger.debug(options.host + ' ' + response.statusCode);
        response.setEncoding('utf8');

        response.on('data', function (chunk) {
            output += chunk;
        });

        response.on('end', function() {
        	logger.info("request to delete done.");
            //var obj = JSON.parse(output);
        	//logger.info(obj.status);
        	db.remove({ _id: agent._id }, {}, function (err, numRemoved) {
        		callback(err, numRemoved);
          	});
        	eventEmitter.emit('agent-delete',agent);
        });
	});
	request.on('error', function(er) {
		logger.error('no agent running on: '+agent.host,er);
		db.remove({ _id: agent._id }, {}, function (err, numRemoved) {
    		callback(err, numRemoved);
      	});
	});
	request.end();

};

install = function(main_callback) {
    agent=this.agent;
    fileControl.load("InternalRepo:///jobs/agent/installKHAgent.json", function(err,content) {
			if (err) {
				main_callback(err);
				return;
			}
			try {
				job = JSON.parse(content);
				job.script.env.USER=agent.login;
				job.script.env.PASSWORD=decrypt(agent.password,this.serverInfo.cryptoKey);
				job.script.env.HOST=agent.host;
			} catch(err) {
				main_callback(err);
				return;
			}
			executionControl.executeJob(defaultAgent,job,main_callback);
		});
	
};

startAgent = function(main_callback) {
    agent=this.agent;
    fileControl.load("InternalRepo:///jobs/agent/startKHAgent.json", function(err,content) {
			if (err) {
				main_callback(err);
				return;
			}
			try {
				job = JSON.parse(content);
				job.script.env.USER=agent.login;
				job.script.env.PASSWORD=decrypt(agent.password,this.serverInfo.cryptoKey);
				job.script.env.HOST=agent.host;
			} catch(err) {
				main_callback(err);
				return;
			}
			executionControl.executeJob(defaultAgent,job,main_callback);
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
        logger.debug(options.host + ' ' + res.statusCode);
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            output += chunk;
        });

        res.on('end', function() {
        	logger.info("done.");
            obj = JSON.parse(output);
        	logger.debug("agent status check: "+obj.status);
        	if (obj.status != undefined) {
				
        		agent.type=obj.type,
				agent.startTime=obj.startTime
				agent.status=obj.status;
				agent.mode=obj.mode;
        		updateAgent(agent);
        	}            
            callback();
            
        });
        //res.end();
	});
	request.on('error', function(er) {
		logger.error('no agent running on agent: '+agent.host,er);
		
		callback();
	});
	request.end();

};

registerServer = function(callback) {
	var agent = this.agent;
	var serverInfo = this.serverInfo
	logger.info('registering this server to listen for events on: '+agent.host+':'+agent.port);
	// prepare the header
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
	    console.log("statusCode: ", res.statusCode);
	    // uncomment it for header details
	  console.log("headers: ", res.headers);

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

};

updateAgentInfoOnAgent = function(callback) {
	var agent = this.agent;
	var serverInfo = this.serverInfo
	logger.info('updating agent properties on: '+agent.host+':'+agent.port);
	// prepare the header
	var headers = {
	    'Content-Type' : 'application/json',
	    'Content-Length' : Buffer.byteLength(JSON.stringify(agent) , 'utf8'),
	    'Content-Disposition' : 'form-data; name="agents'
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
	    console.log("statusCode: ", res.statusCode);
	    // uncomment it for header details
	  console.log("headers: ", res.headers);

	    res.on('data', function(data) {
	    	if (JSON.parse(data).registered) {
	    		logger.info('updated agent properties');
	    		callback();
	    	} else {
	    		agent.message = 'Unable to update agent properties';
	    		eventEmitter.emit('agent-error',agent);
	    		callback(new Error('Unable to update agent properties'));
	    	}
	        logger.info('update agent complete');
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
	if (agent.port == undefined || agent.port == "") {agent.port=3000;};
	logger.debug("checking agent user:"+agent.user);
	db.find({$and: [{user: agent.user}, {port: agent.port}, {host: agent.host}]}, function(err, docs) {
		logger.debug("found: "+docs.length);
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



waitForAgentStartUp = function(callback) {
	
	
	var agent = this.agent;
    agent.message = 'starting agent';
    eventEmitter.emit('agent-update', agent);
    //timeout after 20 secs
    var timeout = setTimeout(function() {
    	clearInterval(heartbeatCheck);
    	agent.message=("agent failed to start");
    	callback(new Error("agent failed to start"));
    }, 20000);
    
    
    //wait until a heartbeat is received
    var heartbeatCheck = setInterval(function() {
    	heartbeat(agent, function (err) {
    		if (!err) {
    			clearTimeout(timeout);
    			clearInterval(heartbeatCheck);
    			callback();
    		}
    	});
    }, 1000);
};

deliverAgent = function(callback) {
    var agent = this.agent;
    agent.message = 'transferring agent';
	eventEmitter.emit('agent-update', agent);
	var Client = require('scp2').Client;

	var client = new Client({
		host: agent.host,
	    username: agent.login,
	    password: decrypt(agent.password,this.serverInfo.cryptoKey),
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
exports.addAgent = function(agent,serverInfo,callback) {
	

	logger.info("adding agent: "+agent);

		
	
	function_vars = {agent: agent};
	
	var exec = [checkAgent.bind(function_vars)
	            
	            ];
	async.series(exec,function(err) {
		if (err) {
			logger.error('agent error' + err);
			agent.message = ""+err;
			eventEmitter.emit('agent-error',agent,err.syscall+" "+err.code);
			if (callback) {
				callback(err);
			}
			return;
		}
		
        agent=initAgent(agent,serverInfo);
    	db.insert(agent, function (err, newDoc) {
    		if (err) {
    			logger.error(err.message);
    			logger.error(err.stack);
	    		if (callback) {
					callback(err);
				}
				return;
			}
		    logger.debug("added agent: "+newDoc);
		    agent=newDoc;
			eventEmitter.emit('agent-add',agent);

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
			            waitForAgentStartUp.bind(function_vars),
			            registerServer.bind(function_vars),
			            updateAgentInfoOnAgent.bind(function_vars),
			            getStatus.bind(function_vars)];
			            
			heartbeat(agent, function(err) {
				if (!err) {
					logger.info("Agent already exists");
					exec = [
			            waitForAgentStartUp.bind(function_vars),
			            registerServer.bind(function_vars),
			            updateAgentInfoOnAgent.bind(function_vars),
			            getStatus.bind(function_vars)];
				}
				try {
					async.series(exec,function(err) {
						if (err) {
							logger.error('agent error' + err);
							eventEmitter.emit('agent-error',agent,err.syscall+" "+err.code);
							if (callback) {
								callback(err);
							}
							return;
						}
						//set the progress back to 0
						db.find({_id: agent._id}, function(err, docs) {
							if (docs.length > 0) {
								agent = docs[0];
								agent.status='READY';
								agent.message=undefined
								agent.progress =0;
								eventEmitter.emit('agent-update',agent);
							}
							
						  });
						if (callback) {
							callback();
						}
					
					});
				} catch(err) {
					if (callback) {
						callback(err);
					}
					logger.error("agent install failed for: "+agent.host+":"+agent.port);
				}
				
			});	
				
		});
		
	});
};

function encrypt(text, cryptoKey){
	var cipher = crypto.createCipher('aes-256-cbc',cryptoKey)
	var crypted = cipher.update(text,'utf8','hex')
	crypted += cipher.final('hex');
	return crypted;
}
 
function decrypt(text, cryptoKey){
	var decipher = crypto.createDecipher('aes-256-cbc',cryptoKey)
	var dec = decipher.update(text,'hex','utf8')
	dec += decipher.final('utf8');
	return dec;
}



