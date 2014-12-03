var agent_module = angular.module('qs_agent', []);

agent_module.factory("qs_agent", ["$http","$modal", function ($http,$modal,qs_agent) {

	
	
	var updateAgent = function(watchedAgents, agent) {
		if (agent) {
			for (agentIndex in watchedAgents) {
				if (agent._id==watchedAgents[agentIndex]._id 
					|| (agent.host == watchedAgents[agentIndex].host && agent.port == watchedAgents[agentIndex].port)) {
					watchedAgents[agentIndex]._id=agent._id;
					watchedAgents[agentIndex].user=agent.user;
					watchedAgents[agentIndex].progress=agent.progress;
					watchedAgents[agentIndex].status=agent.status;
					watchedAgents[agentIndex].message=agent.message;
					//watchedAgents[listAgent]=listAgent;
					break;
				}
			}
			return watchedAgents;  		
	    }
	  
	};

    var loadAgentList = function(callback) {
    	$http.get('/api/connectedAgents').
	    success(function(data) {
	    	this.agentList = data;
	    	if (callback) {
	    		callback(this.agentList);
	    	}
	    });
	 };
	 var getAgentList = function() {
	 	return this.agentList;
	 }
	

    var addAgent = function (agent) {
    	$scope.message = undefined;
    	$scope.master = angular.copy(agent);
    	$http.post('/api/addAgent', agent).
        success(function(data) {
        	$scope.connectedAgents = data;
        	//location.reload(); 
        });
    };
    
    var deleteAgent = function (agent_id) {
    	$scope.message = undefined;
    	$http.post('/api/deleteAgent', agent_id).
        success(function(data) {
        	$scope.connectedAgents = data;
        	//location.reload(); 
        });
    };
    
    
    var listenForAgentEvents = function($scope, watchedAgentList, socket) {
    	loadAgentList(function () {
    		console.log(watchedAgentList);
			var self = this;
			socket.on('agent-update', function(agent){
			     console.log('agent update message received');
			     watchedAgentList = updateAgent(watchedAgentList,agent);
			     $scope.$apply();
			 }.bind({watchedAgents: watchedAgentList}));
			    
		    socket.on('agent-error', function(agent){
		        console.log('agent error message received');
		       	watchedAgentList =  updateAgent(watchedAgentList,agent);
		        $scope.$apply();
		      }.bind({watchedAgents: watchedAgentList}));
		      
		    socket.on('agent-add', function(agent){
		    	watchedAgentList = updateAgent(watchedAgentList,agent);
		    	$scope.$apply();
		    }.bind({watchedAgents: watchedAgentList}));
	    });

	};
    return {
   	  	listenForAgentEvents: listenForAgentEvents,
   	  	loadAgentList: loadAgentList.bind(),
   	  	getAgentList: getAgentList.bind(),
   	  	updateAgent: updateAgent.bind({agentList: this.agentList}),
   	  	addAgent: addAgent,
   	  	deleteAgent: deleteAgent
   	  }


   }]);