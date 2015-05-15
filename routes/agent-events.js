var logger=require('./log-control').logger;
var agentControl = require('./agent-control');
var executionControl = require('./execution-control');
var agentSockets = {};

var io;

exports.agentSockets=agentSockets;

function listenForEvents(agent, socket) {
		socket.on('execution-complete', function(command) {
    		if (command) {
				logger.debug("execution complete");
				logger.debug(command);
				executionControl.eventEmitter.emit('execution-complete',agent, command);
			}
			
		});
		socket.on('execution-error', function(command) {
    		if (command) {
				logger.debug("execution error");
				executionControl.eventEmitter.emit('execution-error',agent, command);
			}
			
		});
		
		
		socket.on('job-update', function(job){
    		if (job) {
				logger.debug("job update");
				logger.debug(job.id+" progress="+job.progress+" status="+job.status);
				executionControl.updateJob(agent, job, function() {
					executionControl.eventEmitter.emit('job-update',agent, job);
				});
			}
			
		});
		socket.on('job-complete', function(job){
			if (job) {
				logger.info('Completed Job: '+job.id+" on "+agent.host+":"+agent.port);
				executionControl.completeJob(agent, job);
			}
			//executionControl.eventEmitter.emit('job-complete',agent, job);
		});
		socket.on('job-error', function(job){
			if (job) {
				logger.info('Stopping Job: '+job.id+ ' due to error on agent('+agent._id+') '+agent.user+'@'+agent.host+':'+agent.port);
				//agentSockets[agent._id].eventSocket.emit('job-cancel',job);
				executionControl.cancelJob(agent._id, job.id);
				executionControl.eventEmitter.emit('job-error',agent, job);
			} else {
				logger.error("empty job error message received.");
			}
		});
		socket.on('job-cancel', function(job){
			if (job) {
				logger.info('job: '+job.id+ ' cancelled.');
				executionControl.cancelJob(agent._id, job.id);
			}
		});

}

function listenForAgentEvents(agent, callback) {
	if (!agentSockets[agent._id]) {
		agentSockets[agent._id] = {};
	}

	agentSockets[agent._id].eventSocket = require('socket.io-client')('http://'+agent.host+':'+agent.port+'/agent-events');
	listenForEvents(agent, agentSockets[agent._id].eventSocket);
	logger.info("connecting to: "+agent.host+":"+agent.port+'/agent-events' ); 
    agentSockets[agent._id].eventSocket.on('connect', function() { 
    	 agentControl.heartbeat(agent, function (err, connectedAgent) {
			if (err) {
				connectedAgent.status='ERROR'
				connectedAgent.message='no heartbeat';
				agentControl.updateAgent(connectedAgent, function() {
					agentControl.eventEmitter.emit('agent-update',connectedAgent);
				});
				logger.error("unable to contact agent: "+connectedAgent.user+"@"+connectedAgent.host+":"+connectedAgent.port);
			};
			connectedAgent.status='READY';
	    	agentControl.updateAgent(connectedAgent, function() {
				agentControl.eventEmitter.emit('agent-update',connectedAgent);
			});
    		
    	});
    	 
    }).on('error', function(err) {
    	//callback(err, agent);
    }).on('reconnect', function() {
    	logger.info("reconnected to : "+agent.host+":"+agent.port);
    	agentControl.heartbeat(agent, function (err, connectedAgent) {
			if (err) {
				connectedAgent.status='ERROR'
				connectedAgent.message='no heartbeat';
				agentControl.updateAgent(connectedAgent, function() {
					agentControl.eventEmitter.emit('agent-update',connectedAgent);
				});
				logger.error("unable to contact agent: "+connectedAgent.user+"@"+connectedAgent.host+":"+connectedAgent.port);
			};
			connectedAgent.status='READY';
	    	agentControl.updateAgent(connectedAgent, function() {
				agentControl.eventEmitter.emit('agent-update',connectedAgent);
			});
    	});
    }).on('disconnect', function() {
    	agentControl.heartbeat(agent, function (err, connectedAgent) {
			if (err) {
				connectedAgent.status='ERROR'
				connectedAgent.message='no heartbeat';
				agentControl.updateAgent(connectedAgent, function() {
					agentControl.eventEmitter.emit('agent-update',connectedAgent);
				});
				logger.error("unable to contact agent: "+connectedAgent.user+"@"+connectedAgent.host+":"+connectedAgent.port);
			};
			connectedAgent.status='READY';
	    	agentControl.updateAgent(connectedAgent, function() {
				agentControl.eventEmitter.emit('agent-update',connectedAgent);
			});
		});
    });
    callback(undefined, agent);
	
}

function openFileSocket(agent, callback) {
	if (!agentSockets[agent._id]) {
		agentSockets[agent._id] = {};
	}
	logger.info('connecting to: http://'+agent.host+':'+agent.port+'/upload');
		agentSockets[agent._id].fileSocket = require('socket.io-client')('http://'+agent.host+':'+agent.port+'/upload');
		agentSockets[agent._id].fileSocket.open();
		executionControl.setFileSocket(agent, agentSockets[agent._id].fileSocket);

	
	agentSockets[agent._id].fileSocket.on('disconnect' ,function () {
		logger.info("file socket disconnected");
	});
	
	agentSockets[agent._id].fileSocket.on('reconnect' ,function () {
		logger.info("file socket reconnected");
		agentSockets[agent._id].fileSocket.on('End' ,function (job) {
		  logger.info(job);
	      if (job) {
		      logger.info("done uploading for job: "+job.id);
		      executionControl.uploadComplete(agent, job);
		   }
		      
	    });
		agentSockets[agent._id].fileSocket.on ('Error', function(data) {
			if (data) {
	    		logger.error("socket error: "+data);
	        	//agentSockets[agent._id].fileSocket.emit('client-upload-error', {name: data.fileName, jobId: data.jobId} );
	        	executionControl.cancelJob(agent._id, data.jobId);
	        }

		});
		agentSockets[agent._id].fileSocket.on ('Error', function(data) {
			if (data) {
	    		logger.error("file transfer error: "+data.message);
	        	//agentSockets[agent._id].fileSocket.emit('client-upload-error', {name: data.fileName, jobId: data.jobId} );
	        	executionControl.cancelJob(agent._id, data.jobId);
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
		      executionControl.uploadComplete(agent, job);
		   }
		      
	    });
		agentSockets[agent._id].fileSocket.on ('Error', function(data) {
			if (data) {
	    		logger.error("file transfer error: "+data.message);
	        	//agentSockets[agent._id].fileSocket.emit('client-upload-error', {name: data.fileName, jobId: data.jobId} );
	        	executionControl.cancelJob(agent._id, data.jobId);
	        }

		});
		
	}); 
   	
	callback(undefined,agent);
};


exports.openFileSocket = openFileSocket;

//My module
function AgentEventHandler(io) {
	logger.info('setting event io to:'+io);
	this.io = io;
	
	agentControl.eventEmitter.on('agent-update', function(agent) {
		agentControl.updateAgent(agent);
		try {
			io.emit('agent-update',agent);
		} catch(err) {
			logger.debug("no clients to broad cast event");
		}
	});

	agentControl.eventEmitter.on('agent-error', function(agent) {
		
		logger.info('agent error detected.');
		agent.progress = 0;
		agentControl.updateAgent(agent);
		agent.status='ERROR';
		try {
			io.emit('agent-error',agent);
		} catch(err) {
		
		}
		
	});

	agentControl.eventEmitter.on('agent-delete', function(agent) {
		agent.status='DELETED';
		try {
			io.emit('agent-delete',agent);
		} catch (err) {
		
		}
	});
	agentControl.eventEmitter.on('agent-add', function(agent) {
		agent.status='INSTALLING';
		try {
			io.emit('agent-add',agent);
		} catch (err) {
		
		}
	});
	executionControl.eventEmitter.on('job-start', function(agent, job) {
		
		try {
			logger.info("broadcasting "+job.id+' start.');
			io.emit('job-start', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
								, {id: job.id, status: job.status, progress: job.progress});
		} catch(err) {
			logger.error("unable to broadcast job start event");
		}
	});
	executionControl.eventEmitter.on('job-update', function(agent, job) {
		logger.info('broadcasting job update.');
		
		//logger.debug(agent);
		//logger.debug(job);
		//try {
		if(job) {
			executionControl.updateJob(job);
			io.emit('job-update',{_id: agent._id, host: agent. host, port: agent.port, user: agent.user} 
								,{id: job.id, status: job.status, progress: job.progress});
		}
		//} catch(err) {
			
		//}
	});
	executionControl.eventEmitter.on('job-cancel', function(agent, job) {
		
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
	executionControl.eventEmitter.on('job-complete', function(agent, job) {
		
		try {
			logger.info("broadcasting "+job.id+' complete on agent('+agent._id+'): '+agent.user+'@'+agent.host+':'+agent.port);
			io.emit('job-complete', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
								, {id: job.id, status: job.status, progress: job.progress});
		} catch(err) {
			logger.error("unable to broadcast job complete event");
		}
	});
	executionControl.eventEmitter.on('job-error', function(agent, job) {
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
	executionControl.eventEmitter.on('cancel-job-on-agent', function(agent, job) {
		if (job && agent) {
			logger.info("sending cancel for "+job.id+' on agent('+agent._id+'): '+agent.user+'@'+agent.host+':'+agent.port);
			agentSockets[agent._id].eventSocket.emit('job-cancel',job);
		 } else {
		 	logger.error("invalid job error event");
		 }
	});
	executionControl.eventEmitter.on('execution-complete', function(agent, command) {
		
		try {
			logger.info("broadcasting execution complete.");
			io.emit('execution-complete', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
								, command);
		} catch(err) {
			logger.error("unable to broadcast execution complete event");
		}
	});
	executionControl.eventEmitter.on('execution-error', function(agent, command) {
		
		try {
			logger.info("broadcasting execution error for agent");
			io.emit('execution-error', {_id: agent._id, host: agent.host, port: agent.port, user: agent.user} 
								, command);
		} catch(err) {
			logger.error("unable to broadcast execution error event");
		}
	});
	
	
}

AgentEventHandler.prototype.registerAgent = function registerAgent(agent) {
  logger.info(agent);
};
AgentEventHandler.prototype.listenForAgentEvents = listenForAgentEvents;
AgentEventHandler.prototype.openFileSocket = openFileSocket;
AgentEventHandler.prototype.agentSockets = agentSockets;
module.exports = AgentEventHandler;
