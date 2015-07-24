var logger=require('../log-control').logger;
var agentUtils = require('./agent-utils');

var io;

function listenForEvents(agent, socket) {
		var jobControl = this.jobControl;
		var eventEmitter = this.eventEmitter;
		
		socket.on('execution-start', function(command) {
    		if (command) {
				logger.debug("execution start");
				logger.debug(command);
				eventEmitter.emit('execution-start',agent, command);
			}
			
		});

		socket.on('execution-complete', function(command) {
    		if (command) {
				logger.debug("execution complete");
				logger.debug(command);
				eventEmitter.emit('execution-complete',agent, command);
			}
			
		});
		socket.on('execution-error', function(command) {
    		if (command) {
				logger.debug("execution error: ");
				logger.debug(command);
				eventEmitter.emit('execution-error',agent, command);
			}
			
		});
		socket.on('execution-output', function(output) {
			logger.debug("execution-output");
    		if (output) {
				logger.debug("execution-output="+output.output);
				eventEmitter.emit('execution-output',agent, output);
			}
			
		});
		
		socket.on('execution-password-prompt', function(command) {
    		if (command) {
				logger.debug("execution error");
				eventEmitter.emit('execution-password-prompt',agent, command);
			}
			
		});
		
		
		socket.on('job-update', function(job){
    		if (job) {
				logger.debug("job update");
				logger.debug(job.id+" progress="+job.progress+" status="+job.status);
				jobControl.updateJob(agent, job, this.eventEmitter, function() {
					eventEmitter.emit('job-update',agent, job);
				});
			}
			
		});
		socket.on('job-complete', function(job){
			if (job) {
				logger.info('Completed Job: '+job.id+" on "+agent.host+":"+agent.port+"("+agent._id+")");
				jobControl.completeJob(agent, job, eventEmitter);
			}
			//jobControl.eventEmitter.emit('job-complete',agent, job);
		});
		socket.on('job-error', function(job){
			if (job) {
				logger.info('Stopping Job: '+job.id+ ' due to error on agent('+agent._id+') '+agent.user+'@'+agent.host+':'+agent.port);
				//agentSockets[agent._id].eventSocket.emit('job-cancel',job);
				jobControl.cancelJob(agent, job, eventEmitter);
				eventEmitter.emit('job-error',agent, job);
			} else {
				logger.error("empty job error message received.");
			}
		});
		socket.on('job-cancel', function(job){
			logger.debug("job-cancel message received");
			if (job) {
				logger.info('job: '+job.id+ ' cancelled.');
				jobControl.cancelJob(agent, job, eventEmitter);
			}
		});

}

/**
 * listen for agents that reconnect themselvers and register their event socket
 */
var listenForAgentEventConnection = function(io) {
	var eventListener = io.of('/agent-events');
	var nextIndex = connectedSockets.length;
	
	eventListener.on('connection', function (socket) {
		logger.info('new event listener connected');
		//listenForAgentEvents(agent,socket)
		eventListener.on('register-agent', function (agent) {
			logger.info('adding file socket for: '+agent.user+'@'+agent.host+':'+agent.port);
			openFileSocket(agent,socket, function() {
				logger.info('added file socket for: '+agent.user+'@'+agent.host+':'+agent.port);
			});
			
		});
		
	});
	
};

/**
 * listens for incoming agent file connections and registers their file socket
 */
var listenForAgentFileConnection  = function(io) { 
	var fileListener = io.of('/agent-files');
	
		fileListener.on('connection', function (socket) {
			logger.info('new file socket connected');
			fileListener.on('register-agent', function (agent) {
				logger.info('adding event listener for: '+agent.user+'@'+agent.host+':'+agent.port);
				listenForAgentEvents(agent,socket)
			});
		});
};

/**
 * configures handler for agent event socket events
 */
function listenForAgentEvents(agent, callback) {
	var agentSockets = this.agentSockets;
	var eventEmitter = this.eventEmitter;
	if (!agentSockets[agent._id]) {
		agentSockets[agent._id] = {};
	}

	agentSockets[agent._id].eventSocket = require('socket.io-client')('http://'+agent.host+':'+agent.port+'/agent-events');
	agentSockets[agent._id].eventSocket.open();
	listenForEvents(agent, agentSockets[agent._id].eventSocket);
	logger.info("connecting to http://: "+agent.host+":"+agent.port+'/agent-events' ); 
    agentSockets[agent._id].eventSocket.on('connect', function() {
    	logger.info("connected");
    	 agentUtils.heartbeat(agent, function (err, connectedAgent) {
			if (err) {
				connectedAgent.status='ERROR'
				connectedAgent.message='no heartbeat';
				agentUtils.updateAgent(connectedAgent, function() {
					eventEmitter.emit('agent-update',connectedAgent);
				});
				logger.error("unable to contact agent: "+connectedAgent.user+"@"+connectedAgent.host+":"+connectedAgent.port);
			};
			connectedAgent.status='READY';
	    	agentUtils.updateAgent(connectedAgent, function() {
				eventEmitter.emit('agent-update',connectedAgent);
			});
    		
    	});
    	 
    }).on('error', function(err) {
    	logger.error("event connection error");
    	logger.error(err.stack);
    }).on('reconnect', function() {
    	logger.info("reconnected to : "+agent.host+":"+agent.port);
    	agentUtils.heartbeat(agent, function (err, connectedAgent) {
			if (err) {
				connectedAgent.status='ERROR'
				connectedAgent.message='no heartbeat';
				agentUtils.updateAgent(connectedAgent, function() {
					eventEmitter.emit('agent-update',connectedAgent);
				});
				logger.error("unable to contact agent: "+connectedAgent.user+"@"+connectedAgent.host+":"+connectedAgent.port);
			};
			connectedAgent.status='READY';
	    	agentUtils.updateAgent(connectedAgent, function() {
				eventEmitter.emit('agent-update',connectedAgent);
			});
    	});
    }).on('disconnect', function() {
    	agentSockets[agent._id].eventSocket.removeAllListeners();
    	agentSockets[agent._id].eventSocket.close();
    	delete agentSockets[agent._id].eventSocket;
    	agentUtils.heartbeat(agent, function (err, connectedAgent) {
			if (err) {
				connectedAgent.status='ERROR'
				connectedAgent.message='no heartbeat';
				agentUtils.updateAgent(connectedAgent, function() {
					eventEmitter.emit('agent-update',connectedAgent);
				});
				logger.error("unable to contact agent: "+connectedAgent.user+"@"+connectedAgent.host+":"+connectedAgent.port);
			};
			connectedAgent.status='READY';
	    	agentUtils.updateAgent(connectedAgent, function() {
				eventEmitter.emit('agent-update',connectedAgent);
			});
		});
    });
    callback(undefined, agent);
	
}

/**
 * configures handler for file sockets and register the socket for this agent
 */
function openFileSocket(agent, callback) {
	var agentSockets = this.agentSockets;
	var jobControl = this.jobControl;

	logger.info('connecting to: http://'+agent.host+':'+agent.port+'/upload');
	agentSockets[agent._id].fileSocket = require('socket.io-client')('http://'+agent.host+':'+agent.port+'/upload');
	agentSockets[agent._id].fileSocket.open();

	
	agentSockets[agent._id].fileSocket.on('disconnect' ,function () {
		logger.info("file socket disconnected");
		agentSockets[agent._id].fileSocket.removeAllListeners();
		agentSockets[agent._id].fileSocket.close();
		delete agentSockets[agent._id].fileSocket;
	});
	
	agentSockets[agent._id].fileSocket.on('reconnect' ,function () {
		logger.info("file socket reconnected");
		agentSockets[agent._id].fileSocket.on('End' ,function (job) {
		  logger.info(job);
	      if (job) {
		      logger.info("done uploading for job: "+job.id);
		      jobControl.uploadComplete(agent, job, eventEmitter);
		   }
		      
	    });
		agentSockets[agent._id].fileSocket.on ('Error', function(data) {
			if (data) {
	    		logger.error("socket error: "+data);
	        	//agentSockets[agent._id].fileSocket.emit('client-upload-error', {name: data.fileName, jobId: data.jobId} );
	        	var job = jobControl.lookupJob(data.jobId);
	        	jobControl.cancelJob(agent, job, eventEmitter);
	        }

		});
		agentSockets[agent._id].fileSocket.on ('Error', function(data) {
			if (data) {
	    		logger.error("file transfer error: "+data.message);
	        	//agentSockets[agent._id].fileSocket.emit('client-upload-error', {name: data.fileName, jobId: data.jobId} );
	        	var job = jobControl.lookupJob(data.jobId);
	        	jobControl.cancelJob(agent, job, eventEmitter);
	        }

		});
		//callback(undefined,agent);
	});
	
	agentSockets[agent._id].fileSocket.on('error' ,function () {
		logger.info("unable to connect to file socket.");
		//callback(new Error("unable to connect to file socket."),agent);
	});
	
	agentSockets[agent._id].fileSocket.on('connect' ,function () {
		logger.info("connected to "+agent.host+':'+agent.port+" now accepting uploads.");
		agentSockets[agent._id].fileSocket.on('End' ,function (job) {
		  logger.info(job);
	      if (job) {
		      logger.info("done uploading for job: "+job.id);
		      jobControl.uploadComplete(agent, job,eventEmitter);
		   }
		      
	    });
		agentSockets[agent._id].fileSocket.on ('Error', function(data) {
			if (data) {
	    		logger.error("file transfer error: "+data.message);
	        	//agentSockets[agent._id].fileSocket.emit('client-upload-error', {name: data.fileName, jobId: data.jobId} );
	        	var job = jobControl.lookupJob(data.jobId);
	        	jobControl.cancelJob(agent, job, eventEmitter);
	        }

		});
		
	}); 
   	
	callback(undefined,agent);
};


/**
 * Constructor for the agent event handler.  This objects encapsulates everything necessary handling and routing
 * events for this server.  It acts as a mini esb for routing events for all agents on this server.
 *
 * @param io - io component for this server
 * @param jobControl - the job control for this server
 */
function AgentEventHandler(io, jobControl) {
	logger.info('setting event io to:'+io);
	this.agentSockets = {};
	this.io = io;
	var EventEmitter = require('events').EventEmitter;
	this.eventEmitter = new EventEmitter();
	this.jobControl = jobControl;
	this.registerAgent = function registerAgent(agent) {
	  logger.info(agent);
	};
	this.listenForAgentEvents = listenForAgentEvents.bind({agentSockets: this.agentSockets, jobControl: jobControl, eventEmitter: this.eventEmitter});
	this.openFileSocket = openFileSocket.bind({agentSockets: this.agentSockets, jobControl: jobControl, eventEmitter: this.eventEmitter});
	
	this.eventEmitter.on('agent-update', function(agent) {
		agentUtils.updateAgent(agent);
		try {
			io.emit('agent-update',agent);
		} catch(err) {
			logger.debug("no clients to broad cast event");
		}
	});

	this.eventEmitter.on('agent-error', function(agent) {
		
		logger.info('agent error detected.');
		agent.progress = 0;
		agentUtils.updateAgent(agent);
		agent.status='ERROR';
		try {
			io.emit('agent-error',agent);
		} catch(err) {
		
		}
		
	});

	this.eventEmitter.on('agent-delete', function(agent) {
		agent.status='DELETED';
		try {
			io.emit('agent-delete',agent);
		} catch (err) {
		
		}
	});
	this.eventEmitter.on('agent-add', function(agent) {
		agent.status='READY';
		try {
			io.emit('agent-add',agent);
		} catch (err) {
		
		}
	});
	this.eventEmitter.on('job-start', function(agent, job) {
		
		try {
			logger.info("broadcasting "+job.id+' start.');
			io.emit('job-start', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
								, {id: job.id, status: job.status, progress: job.progress});
		} catch(err) {
			logger.error("unable to broadcast job start event");
		}
	});
	this.eventEmitter.on('job-update', function(agent, job) {
		logger.info('broadcasting job update.');
		
		//logger.debug(agent);
		//logger.debug(job);
		//try {
		if(job) {
			jobControl.updateJob(agent,job,this.eventEmitter);
			io.emit('job-update',{_id: agent._id, host: agent. host, port: agent.port, user: agent.user} 
								,{id: job.id, status: job.status, progress: job.progress});
		}
		//} catch(err) {
			
		//}
	});
	this.eventEmitter.on('job-cancel', function(agent, job) {
		
		try {
			logger.info(job.id+' cancelled on agent('+agent._id+'): '+agent.user+'@'+agent.host+':'+agent.port);
			eventAgent = {};
			if (agent) {
				eventAgent = {_id: agent._id, host: agent.host, port: agent.port, user: agent.user};
			}
			evenntJob = {};
			if (job) {
				eventJob = {id: job.id, status: job.status, progress: job.progress};
			}
			io.emit('job-cancel',eventAgent,eventJob);
		} catch(err) {
			logger.error("unable to broadcast cancel event: "+err.message);
		}
	});
	this.eventEmitter.on('job-complete', function(agent, job) {
		
		try {
			logger.info("broadcasting "+job.id+' complete on agent('+agent._id+'): '+agent.user+'@'+agent.host+':'+agent.port);
			io.emit('job-complete', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
								, {id: job.id, status: job.status, progress: job.progress});
		} catch(err) {
			logger.error("unable to broadcast job complete event");
		}
	});
	this.eventEmitter.on('job-error', function(agent, job) {
		if (job) {
			logger.info("broadcasting "+job.id+' error on agent('+agent._id+'): '+agent.user+'@'+agent.host+':'+agent.port);
			try {
				io.emit('job-error', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
									, {id: job.id, status: job.status, progress: job.progress});
			} catch(err) {
				logger.error("unable to broadcast job error event");
			}
		 } else {
		 	logger.error("invalid job error event");
		 }
	});
	this.eventEmitter.on('cancel-job-on-agent', function(agent, job) {
		if (job && agent) {
			logger.info("sending cancel for "+job.id+' on agent('+agent._id+'): '+agent.user+'@'+agent.host+':'+agent.port);
			//console.log(this.agentSockets);
			if (this.agentSockets && this.agentSockets[agent._id] && this.agentSockets[agent._id].eventSocket) {
				this.agentSockets[agent._id].eventSocket.emit('job-cancel',job);
			}
		 } else {
		 	logger.error("invalid job error event");
		 }
	});
	this.eventEmitter.on('execution-start', function(agent, command) {
		try {
			logger.info("broadcasting execution start.");
			io.emit('execution-start', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
								, command);
		} catch(err) {
			logger.error("unable to broadcast execution complete event");
		}
	});
	this.eventEmitter.on('execution-complete', function(agent, command) {
		
		try {
			logger.info("broadcasting execution complete.");
			io.emit('execution-complete', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
								, command);
		} catch(err) {
			logger.error("unable to broadcast execution complete event");
		}
	});
	this.eventEmitter.on('execution-error', function(agent, command) {
		
		try {
			logger.info("broadcasting execution error for agent");
			io.emit('execution-error', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
								, command);
		} catch(err) {
			logger.error("unable to broadcast execution error event");
		}
	});
	this.eventEmitter.on('execution-password-prompt', function(agent, command) {
		
		try {
			logger.info("broadcasting execution password prompt");
			io.emit('execution-password-prompt', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
								, command);
		} catch(err) {
			logger.error("unable to broadcast execution error event");
		}
	});
	this.eventEmitter.on('execution-output', function(agent, output) {
		
		try {
			logger.info("broadcasting execution output");
			io.emit('execution-output', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
								, output);
		} catch(err) {
			logger.error("unable to broadcast execution output event");
		}
	});
	
	return this;
}

AgentEventHandler.prototype.registerAgent = function registerAgent(agent) {
  logger.info(agent);
};
AgentEventHandler.prototype.listenForAgentEvents = listenForAgentEvents;
AgentEventHandler.prototype.openFileSocket = openFileSocket;
module.exports = AgentEventHandler;
