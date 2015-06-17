var logger=require('./log-control').logger;
var async = require('async');

var api = require('./api')

var activeJobs={};
var runningTasks = {};
var completedTasks = {};

var EventEmitter = require('events').EventEmitter;
var eventEmitter = new EventEmitter();

var initAgentsAPICall = function(req, res) {
	var credentials = req.body.credentials;
	var environment = req.body.environment;
	if (environment && environment.agents) {
		initAgents(credentials, environment.agents, this.server.agentEventHandler, this.server.serverInfo, function(err, agents) {
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

initAgents = function(credentials, agents, eventHandler, serverInfo, callback) {
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
					agentControl.addAgent(newAgent, eventHandler, serverInfo, function (err) {
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



var loadAgentsForEnvironmentAPICall = function(req, res) {
	var environment = req.body.environment;
	loadAgentsForEnvironment(environment, this.server.agentEventHandler, this.server.serverInfo, function (err, loadedEnvironment) {
		if (err) {
			logger.error(err.stack);
			res.json(500, {"message": err.message, environment: environment } );
			return;
		} else {
			logger.debug("loaded env: ");
			logger.debug(loadedEnvironment);
			res.json(loadedEnvironment);
		}
	});
};

loadAgentsForEnvironment = function(environment, eventHandler, serverInfo, callback) {

	if (environment.agents) {
	  	var agentControl = this.server.agentControl;
		this.environment = environment;
		console.log("loading "+Object.keys(environment.agents).length+" agents.");
		console.log(environment.agents);
		async.eachSeries(Object.keys(environment.agents), function(designation, cb ) {
				var envAgent = environment.agents[designation];
				logger.debug("loading agent for: "+envAgent.designation);
				logger.debug(envAgent);
				agentControl.loadAgent(envAgent, function(err, loadedAgent) {
					if (loadedAgent && loadedAgent.status =="READY" ) {
						environment.agents[designation]=loadedAgent;
						cb();
					} else {
						console.log("no agent found for: "+designation);
						console.log(environment.agents[this.designation]);
						agentControl.deleteAgent(envAgent, function(err, numRemoved) {
							agentControl.addAgent(envAgent, eventHandler, this.server.api.serverInfo, function(err, newAgent) {
								console.log("added agent found for: "+designation+" "+envAgent.port);
								if (err) {
									cb(err);
									return;
								}
								environment.agents[this.designation]=newAgent;
								cb();
							}.bind({agent: envAgent}));
						});


						
					}
					
				});

		}, function(err) {
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
		});
		
	} else if (callback) {
		callback(undefined,environment);
	}
}

var execute = function(environment,workflow, executeControl, agentControl, callback) {

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
					initRunningTask(environment,this.task, executeControl, agentControl, function(err, initializedTask){
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
					
					performTask(environment, task, executeControl, function(err, agent, job){
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

var executeWorkflowAPICall = function(req, res) {
	var environment = req.body.environment;
	var workflow = req.body.workflow;
	if (environment && workflow && environment.agents) {
		execute(environment, workflow, this.server.executionControl, this.server.agentControl, function(err, runWorkflow) {
			if (err) {
				logger.error(err.stack);
				logger.error(err.message);
				res.json(500, {"message": err.message} );
				//res.send(500, err);
				return;
			} 

			res.json({ "message": workflow.id+" initialized for execution"});
		});
		
	} else {
		if (!environment || !environment.agents) {
			logger.error(environment);
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


seriesTask = function(environment, task, executeControl, scallback) {
	logger.info("executing series task");
	logger.debug(task.executeTasks);
	logger.debug(task);
	
	async.series(task.executeTasks,function(err,task,agent,job) {
		if (err) {

			logger.error('task error' + err);
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

paralellTask = function(environment, task, executeControl, pcallback) {

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

var initRunningTask = function(environment, task, executeControl, agentControl, callback) {

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
		loadTaskAgents(environment, loadedTask, agentControl, function(err) {
			if (err) {
				logger.error(err.message);
				callback(err);
				return;
			}
			runningTasks[environment.id][loadedTask.id] = {};
			runningTasks[environment.id][loadedTask.id].agentJobs={};
			logger.debug(loadedTask);
			task.executeTasks = new Array();
			for (index in loadedTask.agents) {
				var agent = loadedTask.agents[index].agent;
				var repeat = loadedTask.agents[index].repeat;
				var job = loadedTask.job;
				if (agent) {
					
					runningTasks[environment.id][loadedTask.id].agentJobs[agent._id]={};
					runningTasks[environment.id][loadedTask.id].agentJobs[agent._id][loadedTask.job.id] = loadedTask.job;
					if (repeat) {
						for (repeatIndex in repeat) {
							var varHash = repeat[repeatIndex];
							var name = Object.keys(varHash)[0];
							var value = varHash[name];
							console.log(varHash);
							console.log("name="+name+" value="+value);
							var numericRepeatRE = /\[\d+\-\d+\]/;
							var firstNum = /\[\d+/;
							var lastNum = /\d+\]/;
							if (value.match(numericRepeatRE)[0]) {
								var start = parseInt(value.match(numericRepeatRE)[0].match(firstNum)[0].replace("[",""));
								var end = parseInt(value.match(numericRepeatRE)[0].match(lastNum)[0].replace("]",""));
								
								for (var i = start; i<end; i++ ) {
									var newJob = JSON.parse( JSON.stringify( loadedTask.job ) );
									var envValue = value.replace(numericRepeatRE,i);
									newJob.script.env.name = envValue;
									newJob .id=loadedTask.job.id+"("+name+"="+envValue+")";
									task.executeTasks.push(function(pcallback) {
										logger.debug("submitting "+this.job.id+" to: "+agent.designation);
										jobTask(this.environment, this.task, this.agent, this.job, executeControl, pcallback);
									}.bind({agent: loadedTask.agents[index].agentObject, job: newJob, environment: environment, task: loadedTask }));
								}
							}
						}
					} else {
						task.executeTasks.push(function(pcallback) {
							logger.debug("submitting "+this.job.id+" to: "+agent.designation);
							jobTask(this.environment, this.task, this.agent, this.job, executeControl, pcallback);
						}.bind({agent: loadedTask.agents[index].agentObject, job: loadedTask.job, environment: environment, task: loadedTask }));
					}
				} else {
					console.log("INVALID agent");
					console.log(loadedTask.agents[index]);
					callback(new Error("invalid agent: "+loadedTask.agents[index].agent+" Please verify agent name."));
					return;
				}
				
			}
			console.log("EXECUTE TASKS="+task.executeTasks.length);
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

var loadTaskAgents = function(environment, task, agentControl, callback) {
	logger.debug(task.agents);
	async.eachSeries(task.agents, function(taskAgent, cb) {
		var designation = taskAgent.agent;
		logger.debug("loading agent info for: "+designation);
		if (environment.agents[designation]) {
			agentControl.loadAgent(environment.agents[designation], function(err, loadedAgent) {
				taskAgent.agentObject = loadedAgent;
				cb();
			});
		} else {
			cb(new Error("Invalid agent designation: "+designation));
			return;
		}
	}, function(err) {
		if (err) {
			callback(err);
		} else {
			callback();
		}
	});
};

var jobTask = function(environment, task, agent, job, executeControl, callback) {
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
				logger.error(err.stack);
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

performTask = function(environment, task, executeControl, callback) {
	
	if (!taskTypes[task.type]) {
		callback(new Error("invalid task type"));
	}
	taskTypes[task.type](environment,task, executeControl, callback);
};

var lookupEnvironmentForAgent = function(agent, callback) {
	if (runningTasks && agent) {
		for (environment in runningTasks) {
			for (envAgent in runningTasks[environment.id]) {
				if(envAgent && envAgent.id == agent._id) {
					callback(environment);
				}
			}
		}
	}
	callback(undefined);
};

var handleWorkflowEvents = function(agentControl, executeControl) {

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
		
		
		if (agent && job && activeJobs[agent._id] && activeJobs[agent._id][job.id]) {
			logger.info('received workflow job update.');
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
	
var WorkflowControl = function(server) {

	var self = this;
	
	self.server = server;

	self.loadAgentsForEnvironmentAPICall=loadAgentsForEnvironmentAPICall.bind({server: self.server});
	self.executeWorkflowAPICall=executeWorkflowAPICall.bind({server: self.server});
	self.initAgentsAPICall = initAgentsAPICall.bind({server: self.server});
	
	handleWorkflowEvents(server.agentControl, server.executionControl);
	
	return self;
}	
	
module.exports = WorkflowControl;

