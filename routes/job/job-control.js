var async = require('async');
var agentUtils = require('../agent/agent-utils');

var logger=require('../log-control').logger;
/**
 * Looks up a job from the list of current jobs
 */
 var lookupJob = function(agentId, jobId) {
 	if(!this.currentJobs[agentId]) {
			currentJobs[agentId] = {};
	}
 	return this.currentJobs[agentId][jobId];
 }

/** 
 * Updates a job state
 */
var updateJob = function(agent, job, eventEmitter, callback ) {
	if (agent && agent._id && job && job.id && job.progress > 0) {
		var currentJobs = this.currentJobs;
		logger.debug("updating: "+job.id);
		agentId=agent._id;
		if(!currentJobs[agentId]) {
			currentJobs[agentId] = {};
			currentJobs[agentId].agent=agent;
		} 
        if (!currentJobs[agentId][job.id] ) {
			currentJobs[agentId][job.id] = job;
		} else {
			currentJobs[agentId][job.id].progress=job.progress;
			currentJobs[agentId][job.id].status=currentJobs[agentId][job.id].status;
		}
		logger.debug("updated: "+job.id);
	}
	if (callback) {
		callback();
	}
		
	
};

/**
 * Cancels a running job
 */
var cancelJob = function(agent, job, eventEmitter, callback ) {
	if (job) {
		logger.error("cancelling job: "+job.id+ "on agennt id:"+agent._id);
		clearTimeout(job.timeout);
	    clearInterval(job.fileCheck);
	    eventEmitter.emit('job-cancel',agent, job);
	    if (job.callback) {
			logger.debug("executing callback for: "+job.id);
	    	job.callback(new Error(job.message), job);
	    }
	    console.log(this.currentJobs[agent._id][job.id])
	    if( this.currentJobs[agent._id] && this.currentJobs[agent._id][job.id]) {
	    	delete this.currentJobs[agent._id][job.id];
	    }
	}
	 
    if (callback) {
    	callback();
    }
}

/**
 * Completes a running job and removes from the currents jobs hash
 */
var completeJob = function(agent, job, eventEmitter) {
	if (agent && job) {
		
		var jobId = job.id;
		var agentId = agent._id;
		logger.info("completing "+jobId+" on "+agent.user+"@"+agent.host+":"+agent.port+"("+agentId+")");
		if (this.currentJobs[agent._id] && this.currentJobs[agent._id][job.id]) {
	    	job = this.currentJobs[agent._id][job.id];
	    }
		   
		if (job) {
			logger.debug("closing read streams.");
			if (job.fileProgress && job.fileProgress.length >0 ) {
				logger.debug("closing files.");

			}
			logger.debug("removed read streams.");
			if (job.timeout) {
				logger.debug("removing timeout for: "+job.id);
				clearTimeout(job.timeout);
			}
			logger.debug("removed timeout.");
			if (job.fileCheck) {
				logger.debug("removing file check for: "+job.id);
		    	clearInterval(job.fileCheck);
		    }
		    logger.debug("removed file checks");
		    if (job.callback) {
				logger.debug("executing callback for: "+job.id);
		    	job.callback(undefined, job);
		    }
		    if (this.currentJobs[agent._id] && this.currentJobs[agent._id][job.id]) {
		    	delete this.currentJobs[agent._id][job.id];
		    }
		   
		   
		 }
		 job.complete = true;
		 logger.info("completed.");
		 eventEmitter.emit('job-complete',agent, job);
	 }
}

/**
 * cancels the job on agent by sending a socket message to the agent as well as executing the cancel job method
 */
var cancelJobOnAgent = function(agent,job, eventEmitter, eventSocket, callback) {

	var jobId = job.id;
	var agentId = agent._id;
	if (this.currentJobs[agentId] && eventSocket) {
		eventSocket.emit('job-cancel',job);
	}
	eventEmitter.emit('cancel-job-on-agent',agent,job);
	cancelJob(agent,job, eventEmitter, function() {
		if (callback) {
			callback();
		}
	});
	

}

/**
 * returns a list of currently running jobs
 *
 * @param callback when complete
 */
 var getRunningJobsList = function(callback) {
	var runningJobs = {};
	var currentJobs = this.currentJobs;
	async.each(Object.keys(currentJobs), function(agentId, callback) {
		logger.info("getting jobs for: "+agentId);
		agentUtils.doesAgentIdExist(agentId, function(err, existingAgent) {
			if (err) {
				if (existingAgent) {
					delete currentJobs[existingAgent._id];
				}
			} else {
				//logger.debug(currentJobs[agentId]);
				for (key in currentJobs[existingAgent._id]) {
					logger.info("found: "+key);
					if (this.currentJobs[existingAgent._id][key] && this.currentJobs[existingAgent._id][key].progress
						&& this.currentJobs[existingAgent._id][key].progress >0 ) {
							runningJobs[existingAgent._id] = {};
							runningJobs[existingAgent._id][key] = {};
							runningJobs[existingAgent._id][key].id = currentJobs[existingAgent._id][key].id;
							runningJobs[existingAgent._id][key].progress = currentJobs[existingAgent._id][key].progress;
							runningJobs[existingAgent._id][key].status = currentJobs[existingAgent._id][key].status;
							runningJobs[existingAgent._id].agent = currentJobs[existingAgent._id].agent;
					}
				}
			}
			callback();
		});
	}, function(err) {
		if (err) {
			logger.error("problem getting running jobs: "+err.message);
		}
		if (callback) {
			callback(runningJobs);
		}
	});
}

/**
 * starts a new job
 */
var initiateJob = function(agent, job, eventEmitter, callback ) {
	var agentId = agent._id;
	var jobId = job.id;
	
	if (this.currentJobs[agentId] && this.currentJobs[agentId][jobId] &&  this.currentJobs[agentId][jobId].progress >0) {
		logger.debug(this.currentJobs[agentId][jobId]);
		cancelJob(agent, job, eventEmitter);
		if (callback) {
			callback(new Error("job: "+jobId+" already running on "+agentId));
		}
	} else {
		if (!this.currentJobs[agentId]) {
			this.currentJobs[agentId] = {};
		}
		this.currentJobs[agentId][jobId] = {};
		this.currentJobs[agentId][jobId].status="initiated";
		this.currentJobs[agentId][jobId].progres=1;
		
		if (callback) {
	    	callback();
	    }
	}
}


/**
 * Constructor - this object holds the state of active jobs and containers methods to change state as job execution progresses
 */
var JobControl = function() {

	var self = this;
	self.currentJobs = {};
	
	self.cancelJobOnAgent = cancelJobOnAgent.bind({currentJobs: self.currentJobs});
	self.completeJob = completeJob.bind({currentJobs: self.currentJobs});
	self.cancelJob = cancelJob.bind({currentJobs: self.currentJobs});
	self.updateJob = updateJob.bind({currentJobs: self.currentJobs});
	self.lookupJob = lookupJob.bind({currentJobs: self.currentJobs});
	self.initiateJob = initiateJob.bind({currentJobs: self.currentJobs});
	self.getRunningJobsList = getRunningJobsList.bind({currentJobs: self.currentJobs});
	return self;
}	
	
module.exports = JobControl;