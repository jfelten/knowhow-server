var workflow_module = angular.module('qs_workflow', []);

workflow_module.factory("qs_workflow", ["$http","$modal", function ($http,$modal,qs_workflow) {

	var watchEnvironment = function(environment) {
		
		this.watchedEnvironment = environment;
		console.log('watching:');
		console.log(this.watchedEnvironment);
	}
	
	var listenForAgentEvents = function($scope, socket) {
		console.log(this.watchedEnvironment);
		var self = this;
		socket.on('agent-update', function(agent){
		     console.log('agent update message received');
		     console.log(self.watchedEnvironment);
		     console.log(this.env);
		     self.watchedEnvironment = updateWatchedEnvironment(this.env, agent);
		     $scope.$apply();
		 }.bind({env: this.watchedEnvironment})
		 );
		    
	    socket.on('agent-error', function(agent){
	        console.log('agent error message received');
	       	self.watchedEnvironment = updateWatchedEnvironment(this.env, agent);
	        $scope.$apply();
	      }.bind({env: this.watchedEnvironment})
	      );
	      
	    socket.on('agent-add', function(agent){
	    	self.watchedEnvironment = updateWatchedEnvironment(this.env,agent);
	    	$scope.$apply();
	    }.bind({env: this.watchedEnvironment})
	    );
	};
	
	var listenForJobEvents = function($scope, socket) {
		var self = this;
	    socket.on('job-update', function(agent,job){
	      
	      //loadJobs();
	      self.watchedEnvironment = updateJobsForEnvironment(this.env,agent,job);
	      $scope.$apply();
		 
	      
	    }.bind({env: this.watchedEnvironment})
	    );
	    socket.on('job-complete', function(agent,job){
	      console.log('job complete message received');
	      self.watchedEnvironment = updateJobsForEnvironment(this.env,agent,job);
	      $scope.message=job.id+" completed";
		  $scope.$apply();
	      
	    }.bind({env: this.watchedEnvironment})
	    );
	    socket.on('job-cancel', function(agent,job){
	      console.log('job cancel message received');
	      self.watchedEnvironment = updateJobsForEnvironment(this.env,agent,job);
	      $scope.message=job.id+" "+cancelled;
		  $scope.$apply();
	      
	    }.bind({env: this.watchedEnvironment})
	    );
	    socket.on('job-error', function(agent,job){
	      console.log('job error message received');
	      self.watchedEnvironment = updateJobsForEnvironment(this.env,agent,job);
		  if (job.status) {
	      	$scope.env_message="error "+job.id+": "+job.status;
	      }
		  $scope.$apply();
	      
	    }.bind({env: this.watchedEnvironment})
	    );
	    
	};
	
	var listenForWorkflowEvents = function($scope, socket) {
		var self = this;
		socket.on('task-update', function(task, agent,job){
	      console.log('task update message received');
	      //loadJobs();
	      if (agent && job) {
	        if (!$scope.runningWorkflows[agent._id]) {
	        	$scope.runningWorkflows[agent._id] = {};
	        	$scope.runningWorkflows[agent._id][job.id] = {}
	        } else if (!$scope.runningWorkflows[agent._id][job.id]) {
	        	$scope.runningWorkflows[agent._id][job.id] = {}
	        }
	      	$scope.runningWorkflow[agent._id][job.id].progress=job.progress;
	      	$scope.runningWorkflow[agent._id][job.id].status=job.status;
		  	$scope.$apply();
		  }
	      
	    }.bind({env: this.watchedEnvironment})
	    );
	    socket.on('task-complete', function(task,agent,job){
	      console.log('task complete message received');
	      loadWorkflows();
		  $scope.$apply();
	      
	    }.bind({env: this.watchedEnvironment})
	    );
	    socket.on('task-cancel', function(task,agent,job){
	      console.log('task cancel message received');
	      loadWorkflows();
		  $scope.$apply();
	      
	    }.bind({env: this.watchedEnvironment})
	    );
	    socket.on('task-error', function(task,agent,job){
	      console.log('task error message received');
	      loadJobs();
		  $scope.$apply();
	      
	    }.bind({env: this.watchedEnvironment})
	    );
	};
	
	var updateWatchedEnvironment = function(environment, agent) {
		if (agent) {
			for (envDesignation in environment.agents) {
				//console.log("updating: "+envDesignation+" id: "+agent._id+" host: "+agent.host+" port "+agent.port);
				if (agent._id==environment.agents[envDesignation]._id 
					|| (agent.host == environment.agents[envDesignation].host 
					   && agent.port == environment.agents[envDesignation].port)
					) {
					environment.agents[envDesignation]._id=agent._id;
					environment.agents[envDesignation].user=agent.user;
					environment.agents[envDesignation].progress=agent.progress;
					environment.agents[envDesignation].status=agent.status;
					environment.agents[envDesignation].message=agent.message;
					console.log("updated: "+envDesignation);
					break;
				}
			}	
			return environment;  		
	    }
	  
	};
	
	var updateJobsForEnvironment = function(environment,agent,job) {
	    	if (environment && agent && job ) {
	    		for (envDesignation in environment.agents) {
				//console.log("updating: "+envDesignation+" id: "+agent._id+" host: "+agent.host+" port "+agent.port);
					if (agent._id==environment.agents[envDesignation]._id 
						|| (agent.host == environment.agents[envDesignation].host 
						   && agent.port == environment.agents[envDesignation].port)
						) {
		    		
				  			environment.agents[envDesignation].job = {id: job.id, progress: job.progress, status: job.status};
				  			break;
				  	}
				}
			}
		    return environment;
	};
	
	var checkAgents = function() {
		console.log("checking agents..");
		if (!this.watchedEnvironment || !this.watchedEnvironment.agents) {
			return false;
		}
		for (var index=0; index< this.watchedEnvironment.agents.length; index++ ){ 
			console.log(this.watchedEnvironment.agents[index].status);
			if (this.watchedEnvironment.agents[index].status != 'READY') {
				return false;
			}
		}
		return true;
	
	}

   	return {
   	  	listenForAgentEvents: listenForAgentEvents,
   	  	listenForJobEvents: listenForJobEvents,
   	  	listenForWorkflowEvents: listenForWorkflowEvents,
   	  	watchEnvironment: watchEnvironment,
   	  	watchedEnvironment: {},
   	  	updateWatchedEnvironment: updateWatchedEnvironment.bind({watchedEnvironment: this.watchedEnvironment}),
   	  	checkAgents: checkAgents
   	  	//addFile: addFile.bind({$http: $http}),
   	  	//deleteFile: deleteFile.bind({$http: $http, $modal: $modal}),
   	  	//openNewFileModal: openNewFileModal.bind({$modal: $modal}),
   	  	//openDeleteFileModal: openNewFileModal.bind({$modal: $modal})
   	  }

   }]);