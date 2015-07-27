var agentUtils = require('./agent-utils');


var os = require("os");
var crypto = require('crypto');
var logger=require('../log-control').logger;
var async = require('async');
var zlib = require('zlib');
var fstream = require('fstream');
var tar = require('tar');
var Connection = require('ssh2');


var http = require('http');
var fs = require('fs');
var KnowhowShell = require('knowhow-shell');
//var KnowhowShell = require('../../knowhow-shell/knowhow-shell');
//var ttyPool = new require('../../knowhow-shell/tty-pool')(2,10);
//var ttyPool = new require('knowhow-shell/tty-pool')(2,10);

//deliver the agent files
var pathlib = require('path');
var agent_archive_name = 'knowhow_agent.tar.gz';
var agent_archive_path = pathlib.join(fs.realpathSync(require('process').cwd()), agent_archive_name);
var node_archive_name = 'node-v0.10.28-linux-x64.tar.gz';
var node_archive_path = pathlib.join(__dirname+'../../',node_archive_name);


defaultAgent = {
		host: "localhost",
		port: 3141
	};
exports.defaultAgent = defaultAgent;

/**
 * adds a default agent running on localhost
 */
addDefaultAgent = function(username,agentEventEmitter, callback) {
	defaultAgent.user = username;
	agentUtils.db.findOne(defaultAgent,function(err, doc) {
		if(err) {
			logger.error(err.message);
			return;
		}
		if (!doc) {
			agentUtils.db.insert(defaultAgent, function (err, newDoc) { 
				if (err) {
					logger.error(err.stack);
				}  
			    logger.debug("added default agent: "+newDoc._id);
			    agent=newDoc;
			    getStatus.bind({agent:defaultAgent})();
				agentEventEmitter.eventEmitter.emit('agent-add',agent);
				
			});
		}
		
		getStatus.bind({agent: defaultAgent})(function() {
			logger.info("default agent added");
		});
		
	
	});
	
}

exports.addDefaultAgent = addDefaultAgent;

/**
 * initializes agent data with default values.  if no password an atttempt is made to retrieve for the same user
 */
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
		agent_prototype.passwordEnc=agentUtils.encrypt(agent_prototype.password, serverInfo.cryptoKey);
		callback(undefined, agent_prototype);
		logger.info("initialized agent: "+agent_prototype.user+"@"+agent_prototype.host+":"+agent_prototype.port);
	}
	else if (!agent_prototype.password) {
		agentUtils.lookupPasswordForUser(agent_prototype.user, function(err, password) {
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

/**
 * deletes and reinstalls an agent
 */
exports.resetAgent = function(agent, eventHandler, serverInfo, callback) {
	agent.progress=1;
	agent.status='INSTALLING'
	eventHandler.eventEmitter.emit('agent-update', agent);
	agentUtils.loadAgent(agent, function(error, loadedAgent) {
		if (!loadedAgent) {
			loadedAgent = agent;
		}
		console.log("reset loaded agent");
		agentUtils.deleteAgent(loadedAgent, function(err, oldAgent) {
			if (err) {
				//callback(err);
				//return;
			}
			delete loadedAgent._id;
			if (loadedAgent.passwordEnc && serverInfo && serverInfo.cryptoKey) {
				loadedAgent.password=agentUtils.decrypt(loadedAgent.passwordEnc,serverInfo.cryptoKey);
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

/**
 * executes the main install job
 */
var install = function(main_callback) {
	agentUtils.executeJob("InternalRepo:///jobs/agent/installKHAgent.json", this.agent, main_callback);
}
   

/**
 * starts an agent
 */
var startAgent = function(main_callback) {
	agentUtils.executeJob("InternalRepo:///jobs/agent/startKHAgent.json", this.agent, main_callback);
}

/**
 * starts an agent from a delivered archive
 */
var startAgentFromArchive = function(main_callback) {
	agentUtils.executeJob("InternalRepo:///jobs/agent/startKHAgentFromArchive.json", this.agent, main_callback);
}

/**
 * starts an agent from a delivered archive
 */
var determineOS = function(main_callback) {
	agentUtils.executeJob("InternalRepo:///jobs/agent/getAgentHostOS.json", this.agent, function(err, result) {
		if (err) {
			main_callback(err);
		} else {
			this.agent.os = result;
		}
		
	});
}


/**
 * Checks agent status
 *
 * @param callback
 */
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
	        		agentUtils.updateAgent(agent);
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
	var eventEmitter = this.eventEmitter;
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
			var output = '';
		    res.on('data', function(data) {
		    	output+=data;
		    });
		    res.on('end', function() {
		    
		        var response = {};
		        try{ 
		        	response = JSON.parse(output);
		        }catch(err) {
		        	callback(err);
		        	return;
		        }
		    	if (response && response.registered) {
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
	var eventEmitter = this.eventEmitter;
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
	    		agentUtils.updateAgent(agentData, function(err, updatedAgent) {
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
	agentUtils.db.find({$and: [{user: agent.user}, {port: agent.port}, {host: agent.host}]}, function(err, docs) {
		logger.debug("check agent found: "+docs.length);
		if (docs.length > 0) {
			logger.error('agent: '+agent.user+'@'+agent.host+':'+agent.port+' already exists.');
			callback(new Error("Agent already exists"));
		} else {
			//agentUtils.heartbeat(agent, function(err) {
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
			this.eventEmitter.emit('agent-update', this.agent);
		}
		if (callback) {
			callback();
		}
	}).on("error",function(){
		if (this.agent) {
			this.eventEmitter.emit('agent-error', agent);
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
    this.eventEmitter.emit('agent-update', agent);
    //timeout after 60 secs
    var timeout = setTimeout(function() {
    	clearInterval(heartbeatCheck);
    	agent.message=("agent failed to start");
    	callback(new Error("agent failed to start"));
    }, 60000);
    
    
    //wait until a heartbeat is received
    var heartbeatCheck = setInterval.bind({agent: agent})(function() {
    	agentUtils.heartbeat.call({agent: agent}, agent, function (err) {
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
    var eventEmitter = this.eventEmitter;
    agent.message = 'transferring agent bundle';
	this.eventEmitter.emit('agent-update', agent);
	var Client = require('scp2').Client;

	var client = new Client({
		host: agent.host,
	    username: agent.login,
	    password: agentUtils.decrypt(agent.passwordEnc,this.serverInfo.cryptoKey),
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
			this.eventEmitter.emit('agent-update', agent);
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
			this.ventEmitter.emit('agent-update', agent);
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
				agentEventHandler.eventEmitter.emit('agent-error',agent,err.syscall+" "+err.code);
				if (agent.callback) {
					delete agent.callback;
					callback(err);
					
				}
				return;
			} else {
			
	        	logger.debug("inserting agent: "+agent.user+"@"+agent.host+":"+agent.port);
		    	agentUtils.db.insert(agent, function (err, newDoc) {
		    		if (err) {
		    			logger.error(err.message);
		    			logger.error(err.stack);
		    			agent.message = ""+err.message;
				 		agentEventHandler.eventEmitter.emit('agent-error',agent,err.syscall+" "+err.code);
			    		if (agent.callback) {
			    			delete agent.callback;
							callback(err);
							
						}
						return;
					}
					agent.message = "installing on agent";
					agent.status = "INSTALLING";
					agentEventHandler.eventEmitter.emit('agent-update',agent);
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
		
					function_vars = {agent: agent, commands: install_commands, serverInfo: serverInfo, eventEmitter: agentEventHandler.eventEmitter};
					
					var npmInstall = [
					            //packAgent.bind(function_vars), 
					            //deliverAgent.bind(function_vars), 
					            install.bind(function_vars),
					            startAgent.bind(function_vars),
					            waitForAgentStartup.bind(function_vars),
					            registerServer.bind(function_vars),
					            updateAgentInfoOnAgent.bind(function_vars)
					            //getStatus.bind(function_vars)
					            ];
					var agentArchiveInstall = [
					            determineOS.bind(function_vars), 
					            deliverAgent.bind(function_vars), 
					            startAgentFromArchive.bind(function_vars),
					            waitForAgentStartup.bind(function_vars),
					            registerServer.bind(function_vars),
					            updateAgentInfoOnAgent.bind(function_vars)
					            ];    
					exec = npmInstall;
					           
					agentUtils.heartbeat.call({agent: agent},agent, function(err) {
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
				 				agentEventHandler.eventEmitter.emit('agent-error',agent,err.syscall+" "+err.code);
								logger.error('agent error - ' + err);
								logger.error(err.stack);
								agentEventHandler.eventEmitter.emit('agent-error',agent,err.syscall+" "+err.code);
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
								agentEventHandler.eventEmitter.emit('agent-update',agent);
								//set the progress back to 0
								agentUtils.db.find({_id: agent._id}, function(err, docs) {
									if (docs.length > 0) {
										agent = docs[0];
										agent.status='READY';
										agent.message=''
										agent.progress =0;
										agentEventHandler.eventEmitter.emit('agent-update',agent);
									}
									
								  });
								if (!agentEventHandler.agentSockets || !agentEventHandler.agentSockets[agent._id] || !agentEventHandler.agentSockets[agent._id].eventSocket) {
									agentEventHandler.listenForAgentEvents(agent, function(err, eventAgent) {
										if(err) {
											eventAgent.status='ERROR'
											eventAgentmessage='event socket error';
											agentUtils.updateAgent(eventAgent, function() {
												agentEventHandler.eventEmitter.emit('agent-update',eventAgent);
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
													agentUtils.updateAgent(registeredAgent, function() {
														agentEventHandler.eventEmitter.emit('agent-update',registeredAgent);
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
												agentEventHandler.eventEmitter.emit('agent-add',agent);
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

var preInstallTasks = function() {
	
	var tasks = ['InternalRepo:///jobs/agent/getAgentHostOS.json']

}