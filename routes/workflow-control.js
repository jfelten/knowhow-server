var logger=require('./log-control').logger;
var async = require('async');
var EventEmitter = require('events').EventEmitter;
var eventEmitter = new EventEmitter();
var agentControl=require('./agent-control');
var fileControl=require('./file-control');
var executeControl = require('./execution-control')
var api = require('./api')

var activeJobs={};
var runningTasks = {};
var completedTasks = {};

exports.initAgents = function(req, res) {
	var credentials = req.body.credentials;
	var environment = req.body.environment;
	if (environment && environment.agents) {
		initAgents(credentials, environment.agents, function(err, agents) {
			if (err) {
				logger.error(err.message);
				res.send(500, err);
			} else {
				res.json(agents);
			}
		});
	} else {
		if (!environment) {
			logger.error("environment is not defined.")
		}
		if (!credentials) {
			logger.error("credentials is not defined.")
		}
		if (credentials && !credentials.login) {
			logger.error("no login passed")
		}
		if (credentials && !credentials.password) {
			logger.error("no password")
		}
		res.send(500, new Error("agents and credentials are required"));
	}
}

initAgents = function(credentials, agents, callback) {
	var agentInits = new Array(agents.length);
	logger.info("workflow-control init agents");
	logger.debug(agents);
	var index=0;
	for (designation in agents) {
		logger.debug("initializing: "+designation);
		agentInits[index] = function(callback) {
			var initAgent = this.agent;
			logger.debug("initAgent status="+initAgent.status);
			if (initAgent.status != 'READY') {
				logger.debug(initAgent);
				agentControl.deleteAgent(initAgent, function(err, numRemoved) {
					if (err) {
						logger.error("unable to delete agent: "+initAgent.login+"@"+initAgent.host+":"+initAgent.port);
						callback(err, agents);
						return;
					}
					newAgent = {}; //order of the attributes matters
					newAgent.host =  initAgent.host;
					newAgent.port =  parseInt(initAgent.port);
					if (credentials) {
						newAgent.login = credentials.login;
						newAgent.password = credentials.password;
						
						
						if (credentials.user) {
							newAgent.user = credentials.user;
						} else {
							newAgent.user = credentials.login;
						}
					}
					
					logger.info("initializing agent: "+newAgent.user+"@"+newAgent.host+":"+newAgent.port);
					agentControl.addAgent(newAgent, api.getServerInfo(), function (err) {
						if (err) {
							callback(err);
						} else {
							callback();
						}
					});
					
				});
			} else if (callback) {
				callback();
			}
		}.bind({agent: agents[designation]}) ;
		index++;
	}
	async.parallel(agentInits,function(err) {
			if (err) {
				if (callback) {
					callback(err);
				}
			}
			else {
				if (callback) {
					callback(undefined, agents);
				}
			}
			return;
		});
	
}



exports.loadAgentsForEnvironment = function(req, res) {
	var environment = req.body.environment;
	loadAgentsForEnvironment(environment, function (err, loadedEnvironment) {
		if (err) {
			res.send(500, err);
			return;
		} else {
			logger.debug("loaded env: ");
			logger.debug(loadedEnvironment);
			res.json(loadedEnvironment);
		}
	});
};

loadAgentsForEnvironment = function(environment, callback) {

	if (environment.agents) {
		this.environment = environment;
		var queries = new Array(environment.agents.length);
		var i = 0;
		for (designation in environment.agents) {
			queries[i] = function(callback) {
				var designation = this.designation;
				logger.debug("loading agent for: "+designation);
				logger.debug(environment.agents[designation]);
				agentControl.loadAgent(environment.agents[designation], function(err, loadedAgent) {
					if (loadedAgent) {
						environment.agents[designation]=loadedAgent;
					}
					logger.debug(environment.agents[designation]);
					callback();
				});
			}.bind({designation: designation});
			i++;
		}
		async.parallel(queries,function(err) {
			if (err) {
				if (callback) {
					callback(err);
				}
			}
			else {
				if (callback) {
					logger.debug(environment);
					callback(undefined, environment);
				}
			}
			return;
		});
	} else if (callback) {
		callback(undefined,environment);
	}
}

execute = function(environment,workflow,callback) {

	var agents = workflow.agents;
			
	var executeQueue = new Array( workflow.taskList.length);
	var initTasks = new Array( workflow.taskList.length);
	async.series([function(cb) {
			initializeWorkflow(workflow);
			cb();
		},
		function(cb) {
			for (taskIndex in workflow.taskList) {
				var task =  workflow.taskList[taskIndex];
				for (envVar in workflow.env) {
					var envValue = workflow.env[envVar];
					if (!workflow.taskList[taskIndex].env) {
						workflow.taskList[taskIndex].env = {};
					}
					workflow.taskList[taskIndex].env[envVar] = envValue;
					logger.debug("set: "+envVar+" to "+workflow.taskList[taskIndex].env[envVar]);
				}
				
				logger.debug(task);
				this.initTasks[taskIndex] = function (icallback) {
					initRunningTask(environment,this.task, function(err, initializedTask){
						if (err) {
							icallback(err);
							return;
						}
						if (!runningTasks[task.id]) {
							runningTasks[task.id] = {};
						}
						
						logger.debug(task.id+" initialized");
						icallback();
					}.bind({task: task, environment: environment}));
				}.bind({task: task, environment: environment});	
				executeQueue[taskIndex] = function(tcallback) {
					var task = this.task;
					var environment = this.environment;
					logger.info("starting: "+this.task.id);
					
					performTask(environment, task, function(err, agent, job){
						if(err) {
							logger.error(task.id+" task error: "+err.message);
							completedTasks[task.id] = {
								status : "ERROR",
								message: err.message
							};
							eventEmitter.emit("task-error", this.environment, task);
							tcallback(err,task,agent,job)
							return;
						}
						if (!runningTasks[task.id]) {
							runningTasks[task.id] = {};
						}
						runningTasks[task.id].callback= tcallback;
						completedTasks[task.id] = {
								status : "COMPLETE",
								message: "success"
						};
						eventEmitter.emit("task-complete", environment, task);
						tcallback(undefined,task);
						
					});
				}.bind({task: task, environment: environment});
			};
			logger.debug("init tasks defined.");
			cb();
		}.bind({initTasks: initTasks, executeQueue: executeQueue}),
		function(cb) {
			logger.debug(this.initTasks);
			logger.debug(workflow.id+" workflow initialization start");
			async.series(this.initTasks, function(err) {
				if (err) {
					cb(err);
					callback(err);
					return;
				}
				cb();
				callback(undefined, workflow);
				logger.debug(workflow.id+" workflow initialization complete");
			});
		}.bind({initTasks: initTasks}),
		function(cb) {
			logger.debug(workflow.id+" workflow execution start");
			async.series(executeQueue, function(err) {
				if (err) {
		
					logger.error('workflow error:' + err.message);
					workflow.progress=0;
					workflow.status=err.message+" "+err.syscall+" "+err.code;
					//callback(err,workflow);
					cb(err);
					return;
				}
				workflow.progress=0;
				workflow.status="submitted for execution.";
				
				if (workflow.progressCheck) {		
					clearInterval(workflow.progressCheck);
				}
				if (workflow.timeout) {
					clearTimeout(workflow.timeout);
				}
		        logger.info("done");
		        eventEmitter.emit("workflow-complete",workflow);
		        cb();
		        
			});
		}], function(err) {
			if (err) {
				logger.error(err.message);
				logger.error(err.stack);
				workflow.status = "ERROR";
				eventEmitter.emit("workflow-error", workflow);
				return;
			}
			workflow.status = "COMPLETE";
			eventEmitter.emit("workflow-complete", workflow);
			return;
			
		});
		
	
	console.log(executeQueue);
	
	
	
	//});

};

exports.executeWorkflow = function(req, res) {
	var environment = req.body.environment;
	var workflow = req.body.workflow;
	if (environment && workflow && environment.agents) {
		execute(environment, workflow, function(err, runWorkflow) {
			if (err) {
				logger.error(err.message);
				res.json(500, {"message": err.message} );
				//res.send(500, err);
				return;
			} 

			res.json({ "message": workflow.id+" initialized for execution"});
		});
		
	} else {
		if (!environment || !environment.agents) {
			logger.error("environment is not selected.")
			res.json(500, {"message": "environment is not selected."} );
		}
		if (!workflow) {
			logger.error("workflow is not defined.")
			res.json(500, {"message": "workflow is not selected."} );
		} else {
			res.json(500, {"message": "General Error."} );
		}
	}
};


seriesTask = function(environment, task, scallback) {
	logger.info("executing series task");
	logger.debug(task.executeTasks);
	logger.debug(task);
	
	async.series(task.executeTasks,function(err,task,agent,job) {
		if (err) {

			logger.error('job error' + err);
			task.progress=0;
			task.status=err.syscall+" "+err.code;
			eventEmitter.emit('task-error',task, agent, job);
			scallback(err,task,agent,job);
			return;
		}
		task.progress=0;
		eventEmitter.emit("task-update", task);
		scallback(undefined);
        logger.info("done");
        
    });
		
};

paralellTask = function(environment, task, pcallback) {

	logger.info("executing paralell task");
	logger.debug(task);
	
	
	async.parallel(task.executeTasks,function(err,task, agent, job) {
		if (err) {

			logger.error('job error' + err);
			task.progress=0;
			task.status=err.syscall+" "+err.code;
			eventEmitter.emit('task-error',task, agent, job);
			pcallback(err);
			return;
		}
		task.progress=0;
		eventEmitter.emit("task-update", task);
		
        logger.info(task.id+" done");
        pcallback();
        
    });
	
};

var initRunningTask = function(environment, task, callback) {

	if (!task.id) {
		callback(new Error("Missing task.id"));
	}
	if (!taskTypes[task.type]) {
		callback(new Error("invalid task type"));
	}
	if (!task.job && !task.jobref) {
		callback(new Error("no job defined for "+task.id));
	}
	if (!task.agents || task.agents.length == 0) {
		callback(new Error("no agents defined for "+task.id));
	}
	init = function(loadedTask) {
		loadTaskAgents(environment, loadedTask, function(err) {
			if (err) {
				logger.error(err.message);
				callback(err);
				return;
			}
			runningTasks[environment.id][loadedTask.id] = {};
			runningTasks[environment.id][loadedTask.id].agentJobs={};
			logger.debug(loadedTask);
			task.executeTasks = new Array(task['agents'].length);
			for (index in loadedTask.agents) {
				var agent = loadedTask.agents[index];
				var job = loadedTask.job;
				if (agent) {
					
					runningTasks[environment.id][loadedTask.id].agentJobs[agent._id]={};
					runningTasks[environment.id][loadedTask.id].agentJobs[agent._id][loadedTask.job.id] = loadedTask.job;
					task.executeTasks[index] = function(pcallback) {
						logger.debug("submitting "+this.job.id+" to: "+agent.designation);
						jobTask(this.environment, this.task, this.agent, this.job, pcallback);
					}.bind({agent: agent, job: loadedTask.job, environment: environment, task: loadedTask });
				} else {
					callback(new Error("invalid agent: "+loadedTask.agents[index]+" Please verify agent name."));
					return;
				}
				
			}
			callback(undefined,loadedTask);
		});
	};
	if (!runningTasks[environment.id]) {
		runningTasks[environment.id] = {};
	}
	if (!runningTasks[environment.id][task.id]) {
		runningTasks[environment.id][task.id] = {};
		runningTasks[environment.id][task.id].agentJobs = {};
	}
	for (designation in environment.agents) {
		var agent = environment.agents[designation];
		if (!runningTasks[environment.id][task.id][agent._id]) {
			runningTasks[environment.id][task.id].agentJobs[agent._id] = {};
		}
	}
	if (task.jobref) {	
		logger.debug("loading: "+task.jobref);
		fileControl.load(task.jobref, function(err,content) {
			if (err) {
				callback(err);
				return;
			}
			try {
				job = JSON.parse(content);
			} catch(err) {
				callback(err);
				return;
			}
			task.job = job;
			init(task);
		});
	}  else {
		init(task);
	}
	

	
};

var loadTaskAgents = function(environment, task, callback) {
	logger.debug(task.agents);
	for (var agentIndex=0; agentIndex < task.agents.length; agentIndex++) {
		var designation = task.agents[agentIndex];
		logger.debug("loading agent info for: "+designation);
		if (environment.agents[designation]) {
			task.agents[agentIndex] = environment.agents[designation];
		} else {
			callback(new Error("Invalid agent designation: "+designation));
			return;
		}
	}
	callback();
};

jobTask = function(environment, task, agent, job, callback) {
	if (environment && task && agent && job) {
		logger.info("executing: "+job.id+" of "+task.id+" on "+agent.host);
		logger.debug(task);
		logger.debug(job);
		logger.debug(agent);
		for (envVar in task.env) {
			var envValue = task.env[envVar];
			job.script.env[envVar] = envValue;
		}
		
		executeControl.executeJob(agent, job, function(err, scriptRuntime) {
			if (err) {
				logger.error("unable to start task");
				eventEmitter.emit('task-error',task,agent,job);
				callback(err,task,agent,job);
				return;
			}
			logger.info(job.id+" submitted for execution to "+agent.host);
			if (!activeJobs[agent._id]){
				activeJobs[agent._id] = {};
			}
			activeJobs[agent._id][job.id] = job;
			activeJobs[agent._id][job.id].callback = callback;
			activeJobs[agent._id][job.id].taskId = task.id;
			activeJobs[agent._id][job.id].environmentId = environment.id;

		});
		
	} 
	else {
		logger.error("Unable execute: ");
		var taskOutput = (!task ? "task is defined" : task.id )
		logger.error(taskOutput);
		var agentOutput = (!agent ? "agent is undefined" : "on "+agent.designation+" "+agent.user+"@"+agent.host+":"+agent.port);
		logger.error(agentOutput);
		var jobOutput = (!job ? "job is undefined" : job.id);
		logger.error(jobOutput);
		callback(new Error("unable to execute task"),task,agent.job);
	}

};


var taskTypes = {
	series : seriesTask,
	paralell: paralellTask,
	job: jobTask
};

performTask = function(environment, task,callback) {
	
	if (!taskTypes[task.type]) {
		callback(new Error("invalid task type"));
	}
	taskTypes[task.type](environment,task, callback);
};

var lookupEnvironmentForAgent = function(agent, callback) {
	if (runningTasks && agent) {
		for (environment in runningTasks) {
			for (envAgent in runningTasks[environment.id]) {
				if(envAgent && envAgent.id = agent._id) {
					callback(environment);
				}
			}
		}
	}
	callback(undefined);
};

var eventHandler = function() {
	logger.info("listening for events");
	agentControl.eventEmitter.on('agent-error', function(agent) {
		if (agent) {
			lookupEnvironmentForAgent(agent, function(environment) {
			//see if the agent is part of a running task
				if (environment) {
					for (task in runningTasks[environment.id]) {
						var index = task.agentJobs.map(function(e) { return e.agentId; }).indexOf(agent._id);
						if (index > -1) {
							completeTask(task.id,new Error("Agent: "+agent.designation+"("+agent.user+"@"+agent.host+":"+agent.host+") errored out before task"));
						
						}
					}
				}
			});
		}
		
	});

	agentControl.eventEmitter.on('agent-delete', function(agent) {
		var environmentId = agent.environmentId;
		if (agent) {
			if (agent) {
				lookupEnvironmentForAgent(agent, function(environment) {
				//see if the agent is part of a running task
					if (environment) {
						//see if the agent is part of a running task
						for (task in runningTasks[environmentId]) {
							var index = task.agentJobs.map(function(e) { return e.agentId; }).indexOf(agent._id);
							if (index > -1) {
								completeTask(task.id,new Error("Agent: "+agent.designation+"("+agent.user+"@"+agent.host+":"+agent.host+") was deleted before task completion"));
							
							}
						}
					}
				});
			}
		}
	});

	executeControl.eventEmitter.on('job-update', function(agent, job) {
		logger.info('received workflow job update.');
		
		if (agent && job) {
			 //var taskId = activeJobs[agent._id][job.id].taskId;
			 //var environmentId = activeJobs[agent._id][job.id].environmentId;
			//runningTasks[environmentId][taskId].agentJobs[job.id] = job;
		}

	});
	executeControl.eventEmitter.on('job-cancel', function(agent, job) {
		
		if (agent && job && activeJobs[agent._id] && activeJobs[agent._id][job.id]) {
			 var taskId = activeJobs[agent._id][job.id].taskId;
			 var environmentId = activeJobs[agent._id][job.id].environmentId;
			 completeTaskJob(environmentId, taskId, agent, job, new Error(job.id+" cancelled."));
		}
	});
	executeControl.eventEmitter.on('job-complete', function(agent, job) {
		console.log("JOB_COMPLETE!!!!!");
		if (agent && job && activeJobs[agent._id] && activeJobs[agent._id][job.id]) {
			 var taskId = activeJobs[agent._id][job.id].taskId;
			 var environmentId = activeJobs[agent._id][job.id].environmentId;
			 completeTaskJob(environmentId,taskId, agent, job);
		}

	});
	executeControl.eventEmitter.on('job-error', function(agent, job) {
		if (agent && job && activeJobs[agent._id] && activeJobs[agent._id][job.id]) {
			 var taskId = activeJobs[agent._id][job.id].taskId;
			 var environmentId = activeJobs[agent._id][job.id].environmentId;
			 completeTaskJob(environmentId,taskId, agent, job, new Error(job.status));
		}
	});

}

var completeTaskJob = function(environmentId, taskId, agent, job, err) {

	if (err) {
		//activeJobs[agent._id][job.id].callback(err);
		//runningTasks[environmentId][taskId].callback(err);
		completeTask(environmentId,taskId,err);
		return;
	}
	
	activeJobs[agent._id][job.id].callback();
	delete activeJobs[agent._id][job.id];
		
}

var completeTask = function(environmentId,taskId, err) {
	logger.info(taskId+" completed for "+environmentId);
	if (err) {
		if (runningTasks[environmentId][taskId].callback) {
			runningTasks[environmentId][taskId].callback(err);
		}
		runningTasks[environmentId][taskId].status = "ERROR";
		eventEmitter.emit("task-error", runningTasks[taskId]);
		return;
	} else {
		if (runningTasks[environmentId][taskId].callback) {
			runningTasks[environmentId][taskId].callback();
		}
		runningTasks[environmentId][taskId].status = "COMPLETE";
		eventEmitter.emit("task-complete", runningTasks[taskId]);
		
	}
}

var initializeWorkflow = function(workflow) {
	workflow.progressCheck = setInterval(function() {
	    workflow.progress++;
	    eventEmitter.emit('workflow-update',{id: workflow.id, status: workflow.status, progress: workflow.progress});

	},15000);
	
	var timeoutms=36000000;//default timeout of 1 hour
    if (workflow.options != undefined && job.options.timeoutms != undefined) {
    	timeoutms=job.options.timeoutms;
    }
   workflow.timeout = setTimeout(function() {
   			if (workflow.progressCheck) {
	    		clearInterval(workflow.progressCheck);
	    	}
	    	workflow.status=("Timeout - job cancelled");
	    	logger.error("workflow timed out for: "+workflow.id);
	        //currentJobs[agentId][jobId].eventSocket.emit('job-cancel',jobId);
	        clearTimeout(workflow.timeout);
    }, timeoutms);
    
    
};

var cancelWorkflow = function(workflow) {

};
	
eventHandler();

