'use strict';

/* Controllers */

var myModule = angular.module('myApp.controllers', []).
  controller('AppCtrl', function ($scope, $http) {

    $http({
      method: 'GET',
      url: '/api/serverInfo'
    }).
    success(function (data, status, headers, config) {
      $scope.serverInfo = data;
    }).
    error(function (data, status, headers, config) {
      $scope.name = 'Error!';
    });

  }).
  controller('AddAgentController', function ($scope, $http, $location) {
	
	console.log('starting add agent controller');  
	$scope.master = {};
	  
	    
    $scope.form = {};
    $scope.test = ['sd','sdsds','dsdsd'];

    var socket = io();

    socket.on('agent-update', function(agent){
      console.log('agent update message received');
//      var agent_status_box = document.getElementById(agent._id+'_status');
//      var agent_message_box = document.getElementById(agent._id+'_messages');
//      if (agent_message_box != undefined) {
//    	  agent_message_box.textContent = agent.message;
//      }
//      if (agent_status_box != undefined) {
//    	  agent_status_box.textContent = agent.status;
//      }
      $http.get('/api/connectedAgents').
      success(function(data) {
      	$scope.connectedAgents = data;
      });
      
    });
    
    socket.on('agent-error', function(agent){
        console.log('agent error message received');
//        var agent_status_box = document.getElementById(agent._id+'_status');
//        var agent_message_box = document.getElementById(agent._id+'_messages');
//        if (agent_message_box != undefined) {
//      	  agent_message_box.textContent = agent.message;
//        }
//        if (agent_status_box != undefined) {
//      	  agent_status_box.textContent = agent.status;
//        }
		$scope.message = agent.message;
		$http.get('/api/connectedAgents').
	      success(function(data) {
	      	$scope.connectedAgents = data;
	      });
        
      });
    socket.on('agent-add', function(agent){
    	$http.get('/api/connectedAgents').
        success(function(data) {
        	$scope.connectedAgents = data;
        });
    });
    
    $http.get('/api/connectedAgents').
    success(function(data) {
    	$scope.connectedAgents = data;
    });
    

    $scope.addAgent = function (agent) {
    	$scope.message = undefined;
    	$scope.master = angular.copy(agent);
    	$http.post('/api/addAgent', agent).
        success(function(data) {
        	$scope.connectedAgents = data;
        	//location.reload(); 
        }).error(function(data, status, headers, config) {
        	$scope.message="Unable to start agent: "+data.message;
        });
    };
    
    $scope.deleteAgent = function (agent_id) {
    	$scope.message = undefined;
    	$http.post('/api/deleteAgent', agent_id).
        success(function(data) {
        	$scope.connectedAgents = data;
        	//location.reload(); 
        });
    };
	  
    $scope.tabs = [
                   { title:'Dynamic Title 1', content:'Dynamic content 1' },
                   { title:'Dynamic Title 2', content:'Dynamic content 2', disabled: true }
                 ];

     $scope.alertMe = function() {
       setTimeout(function() {
         alert('You\'ve selected the alert tab!');
       });
     };
  }).
  controller('JobsController', function ($scope, $modal, $http, $timeout, $log, qs_repo, qs_agent) {
  
    
    $scope.runningJobs = {};
    $scope.output="";
    var loadJobs = function() {
    	$http.get('/api/runningJobsList').
	    success(function(data) {
	    	$scope.runningJobs = data;
	    });
    };
    loadJobs();
    $scope.job_tabs = [
	    { title:'Edit ', content:'Edit', disabled: false  },
	    { title:'Logs', content:'Logs', disabled: false }
	];
    
	    
  	var socket = io();
  	qs_agent.loadAgentList(function(agentList) {
		$scope.connectedAgents = agentList;
		console.log($scope.connectedAgents);
		qs_agent.listenForAgentEvents($scope, $scope.connectedAgents, socket);
	});
	
    socket.on('job-update', function(agent,job){
      
      //loadJobs();
      updateRunningJobs(agent,job);
      $scope.$apply();
 
    });
    socket.on('job-start', function(agent,job){
      console.log('job start message received');
      if (agent && job && !$scope.runningJobs[agent._id]) {
	    $scope.runningJobs[agent._id] = {};
	  }
	  $scope.runningJobs[agent._id][job.id] = {}

      job.progress=0;
      updateRunningJobs(agent,job);
      $scope.message=job.id+" started";
	  $scope.$apply();
      
    });
    socket.on('job-complete', function(agent,job){
      console.log('job complete message received');
      job.progress=0;
      //updateRunningJobs(agent,job);
      if ($scope.runningJobs[agent._id] && $scope.runningJobs[agent._id][job.id]) {
      	delete $scope.runningJobs[agent._id][job.id];
	  }
      $scope.message=job.id+" completed";
	  $scope.$apply();
      
    });
    socket.on('job-cancel', function(agent,job){
      console.log('job cancel message received');
      //updateRunningJobs(agent,job);
      if ($scope.runningJobs[agent._id] && $scope.runningJobs[agent._id][job.id]) {
      	delete $scope.runningJobs[agent._id][job.id];
      }
      $scope.message=job.id+" cancelled "+job.status;
	  $scope.$apply();
      
    });
    socket.on('job-error', function(agent,job){
      console.log('job error message received');
      //updateRunningJobs(agent,job);
      if ($scope.runningJobs[agent._id] && $scope.runningJobs[agent._id][job.id]) {
      	delete $scope.runningJobs[agent._id][job.id];
	  }
	  if (job.status) {
      	$scope.message="error "+job.id+": "+job.status;
      }
	  $scope.$apply();
      
    });
    
    socket.on('execution-complete', function(agent,command) {
    	 console.log(command);
    	 //$scope.runningJobs[agent._id].output+=command.output
    	 $scope.output+=command.command+"\n";
    	 $scope.output+=command.output+"\n";
    });
    socket.on('execution-error', function(agent,command) {
    	 console.log('execution error message received');
    	 //$scope.runningJobs[agent._id].output+=command.output
    	 $scope.output+=command.output;
    });
    $scope.clearOutput = function() {
    	$scope.output = "";
    }
    
    var updateRunningJobs = function(agent,job) {
    	if (agent && job && $scope.runningJobs[agent._id] && $scope.runningJobs[agent._id][job.id]) {
	        
	      	$scope.runningJobs[agent._id][job.id].progress=job.progress;

	      	$scope.runningJobs[agent._id][job.id].status=job.status;
	      	$scope.runningJobs[agent._id][job.id].id=job.id;
	      	$scope.runningJobs[agent._id].agent={_id: agent._id, user: agent.user, host: agent.host, port: agent.port};
	    }
	  
    };
    
	$scope.toggled = function(open) {
		    console.log('Dropdown is now: ', open);
		  };
	
	  $scope.toggleDropdown = function($event) {
	    $event.preventDefault();
	    $event.stopPropagation();
	    $scope.status.isopen = !$scope.status.isopen;
	    
	  };
  
  	  $http.get('/repo/listRepositories').
	    success(function(data) {
	    	$scope.fileRepos = data;
	    });
  	
	  var options = {
	    mode: 'code',
	    modes: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
	    error: function (err) {
	      console.log(err.toString);
	      alert(err.toString());
	    }
	  };
	  
	  var container;
	  var editor;
	  $timeout(function() {
        container = document.getElementById('jsoneditor');
		console.log('container='+container);
		if (container) {
			editor = new JSONEditor(container,options);
		}
    }, 1000);
	  
	  var tree_handler = function(branch) {
	  	  //console.log(branch);
	      console.log('selection='+branch.label+ ' navigating='+navigating+' ext='+branch.ext+' type='+branch.type);
	      $scope.selectedFile = branch; 
	      $scope.message = undefined;
	      if (branch.type == 'file') {
	    	  qs_repo.loadFile($scope.selectedRepo, branch.path, function(err,data) {
	    	    console.log("data="+data);
	    	  	if (branch.ext=='.json') {
	    	  		
  		    		editor.setText(data);
  		    		editor.setMode('code')
  		      	} else {
  		    		editor.setText(data);
  		    		editor.setMode('text')
  		    	}
  		      });
	      		    		
	      }		    	
	    	  

	     
	    	  
    	};
	  //tree controls
	
	  //$scope.addFile = addFile;
	  $scope.deleteFile = function () {
	  	qs_repo.deleteFile($scope.selectedFile, false, function(err,data) {
	  		var deleted_branch = $scope.selectedFile;
	  		if (tree.get_parent_branch(deleted_branch)) {
	  			var parent_branch = tree.get_parent_branch(deleted_branch);
	  			tree.select_branch(parent_branch);
	  			var newChildren = [];
	  			var oldChildren = tree.get_children(parent_branch);
	  			for (var child in oldChildren) {
	  				console.log(child.path+" "+deleted_branch.path);
	  				if (oldChildren[child].path != deleted_branch.path) {
	  					newChildren.push(oldChildren[child]);
	  				} else {
	  					console.log("removing deleted branch from tree");
	  				}
	  			}
	  			console.log(parent_branch);
	  			console.log(newChildren);
	  			parent_branch.children =  newChildren;
	  		} else {
	  			$scope.selectRepo($scope.selectedRepoName);
	  		}
	  	});
	  };
	  $scope.jobs_tree_handler = tree_handler;
	  $scope.saveJob = function() {
	  	if($scope.selectedFile) {
			  qs_repo.saveFile($scope.selectedFile.path, editor.getText(), function(err, message) {
			  	$scope.message = message;
			  });
		}
	  };
	  var jobs = [] ;
	  var tree;
	  $scope.job_tree = tree = {};
	  $scope.jobs = jobs;
	  $scope.loading_jobs = false;
	  
	
	$scope.addFile = function() {
		qs_repo.openNewFileModal($scope.selectedFile, $scope.selectedRepoName, tree,'addFile');
		
	}	

	  
  $scope.selectAgent = function(agent) {
	  $scope.selectedAgent = agent;
	  console.log('selected agent: '+agent);
	  $scope.status.isopen = !$scope.status.isopen;
	  var selectAgent = document.getElementById('selectAgent');
	  selectAgent.textContent=agent.user+'@'+agent.host+':'+agent.port;
  };
	  
	  $scope.selectRepo = function(selectedRepo) {
		  console.log('selected repo: '+selectedRepo.label);
		  $scope.selectedRepoName = selectedRepo.label;
	      $scope.selectedRepo = selectedRepo;
	  	  qs_repo.loadRepo(selectedRepo,'jobs',function(err, data) {
	  		if(err) {
	  			alert("unable to load repository");
	  			
	  		}
	  		$scope.jobs=data;
	  	  });
		  $scope.repoSelect.isopen = !$scope.repoSelect.isopen;
		  var selectRepo = document.getElementById('selectRepo');
		  selectRepo.textContent=selectedRepo.label;
	  };
	  
	  var navigating = false;

	  
	  $scope.cancel = function(agent, job) {


		    var data = {
		    	agent: agent,
		    	job: job
		    };
		    $http({
			      method: 'POST',
			      url: '/api/cancelJob',
			      data: data
			    }).success(function (data, status, headers, config) {
			        $scope.agentInfo = data;
			        $scope.message = job.id+' cancel request submitted to agent: '+agent.user+'@'+agent.host+':'+agent.port
			        console.log("submitted job request");
			    }).
			    error(function (data, status, headers, config) {
			    	$scope.message = data.message+' : '+status;
			    });
	  };
	  $scope.execute = function() {
		  if (!$scope.selectedAgent) {
			  $scope.message='Please select an agent to execute';
			  return;
		  }
		   $scope.job_tabs[1].active=true
		  //get the content from the json editor
		  var job;
		  try {
			  job = editor.get();
		      //JSON.parse(jjob);
		    } catch (e) {
		    	console.log('error getting job data: '+e.message);
		    	$scope.message=e.message;
		        return;
		    }
		    var data = {
		    	agent: $scope.selectedAgent,
		    	job: job
		    };
		    $http({
			      method: 'POST',
			      url: '/api/execute',
			      data: data
			    }).success(function (data, status, headers, config) {
			    
			        $scope.agentInfo = data;
			        
			        loadJobs();
			        console.log("submitted job request");
			        $scope.message="submitted "+job.id+" to "+$scope.selectedAgent.host+":"+$scope.selectedAgent.port;
			        //$scope.$apply();
			        
			    }).
			    error(function (data, status, headers, config) {
			    	$scope.message = data.message+' : '+status;
			    	//$scope.apply();
			    });
	  };
	  
  }).controller('LogsController', function ($scope, $http) {
	  var socket = io.connect();
	  var container = document.getElementById('log-container');
	  
	  socket.on('new-data', function(data) {
		  var message = JSON.parse(data.value);
		  addMessage(message);//message.timestamp+':'+message.level+' '+message.message);


	  });
	  $http({
	      method: 'POST',
	      url: '/api/logs',
    	  data: {
    		  numLogs:20
    		  }
	    }).
	    success(function (data, status, headers, config) {
	      $scope.logs = data.file;
	      for(var message in data.file) {
	    	  addMessage(data.file[message]);
	      }
	    });
	  
	  function addMessage(message) {
		  var newDiv = document.createElement('div');
		  var logText=document.createTextNode(message.timestamp+':'+message.level+' '+message.message);
		  newDiv.appendChild(logText);
		  container.appendChild(newDiv);  
	  }
  }).controller('WorkflowsController', function ($scope, $modal, $http, $log, qs_repo, qs_workflow) {
  
  	
    $scope.runningWorkflows = {};
    var loadWorkflows = function() {
    	$http.get('/api/runningWorkflowsList').
	    success(function(data) {
	    	$scope.runningJobs = data;
	    });
    };
    loadWorkflows();
    
	    
  	
    
  
  	  $http.get('/repo/listRepositories').
	    success(function(data) {
	    	$scope.fileRepos = data;
	    });
  
	  var options = {
	    mode: 'code',
	    modes: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
	    error: function (err) {
	      console.log(err.toString);
	      alert(err.toString());
	    }
	  };
	  
	  var container = document.getElementById('jsoneditor');
	  var editor = new JSONEditor(container,options);
	  var env_container;
	  var env_editor;
	  
	  
	  var workflows = [] ;
	  var tree;
	  $scope.workflow_tree = tree = {};
	  $scope.workflows = workflows;
	  $scope.loading_workflows = false;
	  
	  var environments = [] ;
	  $scope.environments_tree = {};
	  $scope.environments = environments;
	  $scope.loading_environments = false;
	  
	  $scope.workflow = {};
	  $scope.environment = {};
	  var loadAgentsForEnvironment = function(environment) {
	  		console.log("loading agents...");
	  		var data = {
		    	environment: environment
		    };
		    
	  		$http({
			      method: 'POST',
			      url: '/api/loadAgentsForEnvironment',
			      data: data
			    }).
			    success(function(data) {
			    	console.log(data);
			    	qs_workflow.watchEnvironment(data);
			    	var socket = io();
				  	qs_workflow.listenForAgentEvents($scope, socket);
				  	qs_workflow.listenForJobEvents($scope, socket);
				  	qs_workflow.listenForWorkflowEvents($scope, socket);
				  	$scope.environment = qs_workflow.watchedEnvironment;
		    });
	  
	  }
	  
	 $scope.initAgents = function(credentials) {
	  		console.log("init agents...");
	  		console.log(credentials);
	  		$scope.master = angular.copy(credentials);
	  		var data = {
	  			credentials: credentials,
		    	environment: $scope.environment
		    };
		    
	  		$http({
			      method: 'POST',
			      url: '/api/initAgents',
			      data: data
		    }).
		    success(function(data) {
		    	$scope.workflow.agents = data;
		    }).error( function(data) {
		    	scope.message = data.message
		    });
	  
	  };
	  
	  $scope.selectRepo = function(selectedRepo) {
		  console.log('selected repo: '+selectedRepo.name);
		  $scope.selectedRepo=selectedRepo
		  qs_repo.loadRepo(selectedRepo,'environments',function(err, data) {
	  		if(err) {
	  			alert("unable to load repository");
	  			
	  		}
	  		if (!env_container) {
	  			env_container = document.getElementById('env_editor');
	  			console.log('env_container='+env_container);
	  			env_editor = new JSONEditor(env_container,options);
	  		}
	  		$scope.environments=data;
			  qs_repo.loadRepo(selectedRepo,'workflows',function(err, data) {
		  		if(err) {
		  			alert("unable to load repository");
		  			
		  		}
		  		$scope.workflows=data;
		  	  });
		  });
		  $scope.repoSelect.isopen = !$scope.repoSelect.isopen;
		  var selectRepo = document.getElementById('selectRepo');
		  selectRepo.textContent=selectedRepo.label;
	  };
	  
	  $scope.toggled = function(open) {
		    console.log('Dropdown is now: ', open);
		  };

	  $scope.toggleDropdown = function($event) {
	    $event.preventDefault();
	    $event.stopPropagation();
	    $scope.status.isopen = !$scope.status.isopen;
	    
	  };
	$scope.addEnv = function() {
		qs_repo.openNewFileModal( $scope.selectedEnvBranch, $scope.selectedRepoName, $scope.environments_tree, 'addFile');
		
	}
	$scope.deleteEnv = function () {
	  	qs_repo.deleteFile($scope.selectedEnvBranch, false, function(err,data) {
	  		var deleted_branch =  $scope.selectedEnvBranch;
	  		if ( $scope.environments_tree.get_parent_branch(deleted_branch)) {
	  			var parent_branch =  $scope.environments_tree.get_parent_branch(deleted_branch);
	  			 $scope.environments_tree.select_branch(parent_branch);
	  			var newChildren = [];
	  			var oldChildren =  $scope.environments_tree.get_children(parent_branch);
	  			for (var child in oldChildren) {
	  				console.log(child.path+" "+deleted_branch.path);
	  				if (oldChildren[child].path != deleted_branch.path) {
	  					newChildren.push(oldChildren[child]);
	  				} else {
	  					console.log("removing deleted branch from tree");
	  				}
	  			}
	  			console.log(parent_branch);
	  			console.log(newChildren);
	  			parent_branch.children =  newChildren;
	  		} else {
	  			$scope.selectRepo($scope.selectedRepoName);
	  		}
	  	});
	  };
	  
	$scope.addFile = function() {
		qs_repo.openNewFileModal($scope.selectedFile, $scope.selectedRepoName, tree, 'addFile');
		
	}
	$scope.deleteFile = function () {
	  	qs_repo.deleteFile($scope.selectedFile, false, function(err,data) {
	  		var deleted_branch = $scope.selectedFile;
	  		if (tree.get_parent_branch(deleted_branch)) {
	  			var parent_branch = tree.get_parent_branch(deleted_branch);
	  			tree.select_branch(parent_branch);
	  			var newChildren = [];
	  			var oldChildren = tree.get_children(parent_branch);
	  			for (var child in oldChildren) {
	  				console.log(child.path+" "+deleted_branch.path);
	  				if (oldChildren[child].path != deleted_branch.path) {
	  					newChildren.push(oldChildren[child]);
	  				} else {
	  					console.log("removing deleted branch from tree");
	  				}
	  			}
	  			console.log(parent_branch);
	  			console.log(newChildren);
	  			parent_branch.children =  newChildren;
	  		} else {
	  			$scope.selectRepo($scope.selectedRepoName);
	  		}
	  	});
	  };
	  var navigating = false;
	  $scope.tree_handler = function(branch) {
	  	  //console.log(branch);
	      console.log('selection='+branch.label+ ' navigating='+navigating+' ext='+branch.ext+' type='+branch.type);
	      $scope.selectedFile = branch; 
	      $scope.message = undefined;
	      $scope.env_message = undefined;
	      if (branch.type == 'file') {
	    	  qs_repo.loadFile($scope.selectedRepo, branch.path, function(err,data) {
	    	    //console.log("data="+data);
	    	  	if (branch.ext=='.json') {
	    	  		editor.setText(data);
  		    		editor.setMode('code');
  		      	} else {
  		    		editor.setMode('text');
  		    		editor.setText(data);
  		    	}
  		      });
	      		    		
	      }		    	
	    	 	  
    	};
    	
    	$scope.env_tabs = [
		    { title:'Connect ', content:'Connect ', disabled: false  },
		    { title:'Edit', content:'Edit', disabled: false }
		  ];
    	
      	$scope.env_tree_handler = function(branch) {
	  	  //console.log(branch);
	      console.log('selection='+branch.label+ ' navigating='+navigating+' ext='+branch.ext+' type='+branch.type);
	     
	      $scope.env_message = undefined;
	      $scope.selectedEnvBranch = branch;
	      if (branch.type == 'file') {
	    	  qs_repo.loadFile($scope.selectedRepo, branch.path, function(err,data) {
	    	    //console.log("data="+data);
	    	  	if (branch.label=='environment.json') {
	    	  		$scope.env_tabs[0].active = true
	    	  		$scope.selectedEnv = branch; 
  		    		env_editor.setMode('text');
  		    		var environment = JSON.parse(data)
  		    		loadAgentsForEnvironment(environment);
  		    		env_editor.set(environment);
  		    		$scope.env_tabs[0].title = 'connect '+environment.id;
  		    		$scope.env_tabs[1].title = 'Edit '+$scope.selectedEnvBranch.label;
  		    		
  		      	} else {
  		      		console.log("loading text")
  		    		env_editor.setMode('text');
  		    		env_editor.setText(data);
  		    		$scope.env_tabs[1].title = 'Edit '+$scope.selectedEnvBranch.label;
  		    		$scope.env_tabs[1].active = true
  		    	}
  		      });
	      		    		
	      }		    	  
	    	  
    	};
	  //tree controls
	
	  //$scope.addFile = addFile;
	  $scope.deleteFile = function () {
	  	qs_repo.deleteFile($scope.selectedFile, false, function(err,data) {
	  		var deleted_branch = $scope.selectedFile;
	  		if (tree.get_parent_branch(deleted_branch)) {
	  			var parent_branch = tree.get_parent_branch(deleted_branch);
	  			tree.select_branch(parent_branch);
	  			var newChildren = [];
	  			var oldChildren = tree.get_children(parent_branch);
	  			for (var child in oldChildren) {
	  				console.log(child.path+" "+deleted_branch.path);
	  				if (oldChildren[child].path != deleted_branch.path) {
	  					newChildren.push(oldChildren[child]);
	  				} else {
	  					console.log("removing deleted branch from tree");
	  				}
	  			}
	  			console.log(parent_branch);
	  			console.log(newChildren);
	  			parent_branch.children =  newChildren;
	  		} else {
	  			$scope.selectRepo($scope.selectedRepoName);
	  		}
	  	});
	  };

	    
	  $scope.saveWorkflow = function() {
	  	if($scope.selectedFile) {
	  		  try {
				  qs_repo.saveFile($scope.selectedFile.path, editor.get(), function(err, message) {
				  	$scope.message = message;
				  });
			  } catch(err) {
			  	$scope.message = err.message
			  }
		}
	  };
	  
	  $scope.saveEnv = function() {
	  	if ($scope.selectedEnv && $scope.selectedEnvBranch.ext=='.json') {
	  		  try {
	  		  	JSON.parse(env_editor.getText());
	  		  } catch(err) {
	  		  	console.log(err);
	  		  	//console.log(env_editor.get());
	  		  	$scope.env_message = "JSON must be valid before saving: "+err.message;
	  		  	return;
	  		  }
  
		 }
		 console.log("saving env file");
  		 qs_repo.saveFile($scope.selectedEnvBranch.path, env_editor.getText(), function(err, message) {
		  	 $scope.env_message = message;
		  	 

	    	  if ($scope.selectedEnvBranch.label=='environment.json') {
	    	  	$scope.env_tabs[0].active = true
  		    	env_editor.setMode('text');
  		    	var environment = JSON.parse(env_editor.getText())
  		    	loadAgentsForEnvironment(environment);
  		    	env_editor.set(environment);
  		    	$scope.env_tabs[0].title = 'connect '+environment.id;
  		    	$scope.env_tabs[1].title = 'Edit '+$scope.selectedEnvBranch.label;
  		    		
  		      } 

		 });

	  };
	  
	  $scope.executeWorkflow = function() {
		  if (!qs_workflow.checkAgents()) {
			  $scope.message='Please connect all agents before attempting a workflow';
			  return;
		  }
		  $scope.message='';
		  //get the content from the json editor
		  var workflow;
		  try {
			  workflow = editor.get();
		      //JSON.parse(jjob);
		    } catch (e) {
		    	console.log('error loading workflow.')
		    	$scope.message='Invalid JSON - please fix.';
		        return;
		    }
		    var data = {
		    	environment: $scope.environment,
		    	workflow: workflow
		    };
		    $http({
			      method: 'POST',
			      url: '/api/executeWorkflow',
			      data: data
			    }).success(function (data, status, headers, config) {
			        $scope.agentInfo = data;
			        console.log("submitted workflow request");
			        $scope.message = "executing workflow";
			    }).
			    error(function (data, status, headers, config) {
			    	$scope.message = data.message+' : '+status;
			    	//$scope.message = 'Unable to contact server http status: '+status;
			    });
	  };
	  
	  $scope.cancel = function(agent, job) {
		  
		    var data = {
		    	agent: agent,
		    	job: job
		    };
		    $http({
			      method: 'POST',
			      url: '/api/cancelWorkflow',
			      data: data
			    }).success(function (data, status, headers, config) {
			        $scope.agentInfo = data;
			        $scope.message = job.id+' cancel request submitted to agent: '+$scope.selectedAgent.user+'@'+$scope.selectedAgent.host+':'+$scope.selectedAgent.port
			        console.log("submitted job request");
			    }).
			    error(function (data, status, headers, config) {
			    	$scope.message = data.message+' : '+status;
			    });
	  };
	  
	  
  }).controller('RepositoriesController', function ($scope, $modal, $http, $log, $timeout, qs_repo, $upload) {
  	$scope.repoData = [];
  	$scope.repoTree = {};
  	
  	$http({
      method: 'GET',
      url: '/api/serverInfo'
	    }).
	    success(function (data, status, headers, config) {
	      $scope.serverInfo = data;
	    }).
	    error(function (data, status, headers, config) {
	      $scope.serverInfo = {};
	});
	    
	$scope.newRepo = {
    	name: 'MyRepo',
    	path:  $scope.serverInfo.workingDir+'/MyRepo'
    };
    var loadRepos = function() {
    	$http.get('/repo/listRepositories').
	    success(function(data) {
	    	$scope.repoData = data;
	    });
    };
    loadRepos();
    
    var options = {
	    mode: 'code',
	    modes: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
	    error: function (err) {
	      console.log(err.toString);
	      alert(err.toString());
	    }
	  };
	
	var repo_container, repo_editor; 
	$timeout(function() {
        repo_container = document.getElementById('jsoneditor');
		console.log('repo_container='+repo_container);
		if (repo_container) {
			repo_editor = new JSONEditor(repo_container,options);
		}
    }, 1000);
    
	
    $scope.repo_tabs = [
	      	{ title:'Edit File', content:'Edit', disabled: false  },
		    { title:'Edit Repo', content:'Edit Repo', disabled: false  },
		    { title:'New Repository', content:'New Repository', active: true, disabled: false }
		  ];
	$scope.repo_message = undefined;
    
    $scope.repo_tree_handler = function(branch) {
	  	  console.log(branch);
	      console.log('selection='+branch.label+ ' ext='+branch.ext+' type='+branch.type);
	      $scope.currentFile = branch;
	      if (branch.type == 'repo') {
	         $scope.selectedRepo = branch;
	         qs_repo.loadRepo(branch,'',function(err, data) {
		  		if(err) {
		  			alert("unable to load repository: "+err.message);
		  			
		  		}
		  		console.log(data);
		  		branch.children=data[0].children;
		  		//$scope.repoTree.expand_branch(branch);
		  		$scope.repo_tabs[1].title = 'Edit Repo '+branch.label;
  		        $scope.repo_tabs[1].active = true
		  		
		  		
		  	  });
	      	console.log("loading repo");
	      } else if (branch.type == 'file') {
	      	  $scope.selectedFile = branch;
	    	  qs_repo.loadFile($scope.selectedRepo, branch.path, function(err,data) {
	    	    //console.log("data="+data);
	    	  	
  		      console.log("loading text");
  		      repo_editor.setMode('text');
  		      repo_editor.setText(data);
  		      $scope.repo_tabs[0].title = 'Edit '+branch.label;
  		      $scope.repo_tabs[0].active = true
  		    
  		      });
  		   }    	  
	    	  
    	};
    	
    $scope.addRepo = function(newRepo) {
    	qs_repo.addRepo(newRepo,function(err, addedRepo) {
    		if (err) {
    			$scope.repo_message="unable to create repo: "+err.message
    			return;
    		}
    		loadRepos();
    		//$scope.repoTree.select_branch(addedRepo);
    		$scope.repo_message="repo: "+addedRepo.name+" created.";
    	});
    }
    
    $scope.updateRepo = function(existingRepo) {
    	qs_repo.updateRepo(existingRepo,function(err, updatedRepo) {
    		if (err) {
    			$scope.repo_message="unable to update repo: "+err.message
    			return;
    		}
    		loadRepos();
    		$scope.repoTree.select_branch(updatedRepo);
    		$scope.repo_message="repo: "+updatedRepo.name+" updated.";
    	});
    }
    
    $scope.addFile = function() {
		qs_repo.openNewFileModal($scope.currentFile, $scope.selectedRepoName, $scope.repoTree,'addFile');
		
	}
    
    $scope.deleteFile = function() {
    	if ($scope.currentFile) {
    		if ($scope.currentFile.label == 'jobs' || $scope.currentFile.label == 'environments'
    			|| $scope.currentFile.label == 'workflows') {
    			$scope.repo_message="cannot delete environments, jobs, or workflows directories.";
    			return;
    			
    		}
    		var type = $scope.currentFile.type;
    		var repoName = $scope.currentFile.label;
    		var deleted_branch = {
    			_id: $scope.currentFile._id,
    			type:  $scope.currentFile.type,
    			label: $scope.currentFile.label,
    			name: $scope.currentFile.label,
    			path: $scope.currentFile.path
    		};
    		console.log(deleted_branch);
	    	qs_repo.deleteFile(deleted_branch, false, function(err,data) {
	    		var repoTree = $scope.repoTree;
	    		if (err) {
	    			$scope.repo_message="unable to delete repo: "+err.message
	    			return;
	    		}
	    		
	    		if (type == "repo") {
		    		loadRepos();
		    		//repoTree.select_branch(addedRepo);
		    		$scope.repo_message="repo: "+repoName+" deleted.";
		    		$scope.selectedRepo=undefined;
		    		 $scope.repo_tabs[2].active = true
		    			
		    	} else if (repoTree.get_parent_branch(deleted_branch)) {
		  			var parent_branch = repoTree.get_parent_branch(deleted_branch);
		  			repoTree.select_branch(parent_branch);
		  			var newChildren = [];
		  			var oldChildren = tree.get_children(parent_branch);
		  			for (var child in oldChildren) {
		  				console.log(child.path+" "+deleted_branch.path);
		  				if (oldChildren[child].path != deleted_branch.path) {
		  					newChildren.push(oldChildren[child]);
		  				} else {
		  					console.log("removing deleted branch from tree");
		  				}
		  			}
		  			console.log(parent_branch);
		  			console.log(newChildren);
		  			parent_branch.children =  newChildren;
		    	}
	    	});
   		 }
    
    }
    
    $scope.onFileSelect = function($files, newRepo) {
	    //$files: an array of files selected, each file has name, size, and type.
	    var re = new RegExp('/', 'g');
	    var createRepo = {
	    	path: newRepo.path.replace(re,'~'),
	    	name: newRepo.name
	    }
	    console.log(createRepo);
	    for (var i = 0; i < $files.length; i++) {
	      var file = $files[i];
	      $scope.upload = $upload.upload({
	        url: '/repo/uploadRepoTarBall', //upload.php script, node.js route, or servlet url
	        //method: 'POST' or 'PUT',
	        //headers: {'header-key': 'header-value'},
	        //withCredentials: true,
	        //data: {newRepo: newRepo},
	        file: file, // or list of files ($files) for html5 only
	        fileName: JSON.stringify(createRepo),//'doc.jpg' or ['1.jpg', '2.jpg', ...] // to modify the name of the file(s)
	        // customize file formData name ('Content-Disposition'), server side file variable name. 
	        //fileFormDataName: myFile, //or a list of names for multiple files (html5). Default is 'file' 
	        // customize how data is added to formData. See #40#issuecomment-28612000 for sample code
	        //formDataAppender: function(formData, key, val){}
	      }).progress(function(evt) {
	      	$scope.uploadProgress = parseInt(100.0 * evt.loaded / evt.total);
	        console.log('percent: ' + parseInt(100.0 * evt.loaded / evt.total));
	      }).success(function(data, status, headers, config) {
	      	console.log(data);
	        loadRepos();
    		//$scope.repoTree.select_branch(data);
    		$scope.repo_message="repo: "+ newRepo.name+" imported from "+newRepo.fileName;
    		$scope.uploadProgress = undefined;
	        
	      }).error(function(data, status, headers, config) {
	      	$scope.repo_message="unable to import repo: "+data;
	      	console.log(data);
	      	console.log(headers);
	      	console.log(config);
	      	$scope.uploadProgress = undefined;
	      });
	      //.then(success, error, progress); 
	      // access or attach event listeners to the underlying XMLHttpRequest.
	      //.xhr(function(xhr){xhr.upload.addEventListener(...)})
	    }
	    /* alternative way of uploading, send the file binary with the file's content-type.
	       Could be used to upload files to CouchDB, imgur, etc... html5 FileReader is needed. 
	       It could also be used to monitor the progress of a normal http post/put request with large data*/
	    // $scope.upload = $upload.http({...})  see 88#issuecomment-31366487 for sample code.
  };
  
   $scope.downloadTarBall = function(repo) {
    	
    	var data = {
		    	repo: repo,
		    }
    	$http({
		      method: 'POST',
		      url: '/repo/downloadRepoTarBall',
		      data: data
		    }).success(function (data, status, headers, config) {
		        console.log("got tarball");
		    }).
		    error(function (data, status, headers, config) {
		    	$scope.repo_message="unable to download: "+data;
		    });
    }
    
    $scope.importFromHost = function(newRepo) {
    	if (!newRepo.name || !newRepo.path) {
    		$scope.repo_message="Repo name and file path must be defined.";
    		return;
    	}
    	var data = {
		    	newRepo: newRepo,
		    }
		$scope.repo_message="importing...";
    	$http({
		      method: 'POST',
		      url: '/repo/importRepoFromServer',
		      data: data
		    }).success(function (data, status, headers, config) {
		        loadRepos();
    			//$scope.repoTree.select_branch(data);
    			$scope.repo_message="repo: "+ newRepo.name+" imported from: "+newRepo.host+":"+newRepo.port;
		    }).
		    error(function (data, status, headers, config) {
		    	$scope.repo_message="unable to import repo: "+data;
		    });
    }
    
    $scope.importFromGIT = function(newRepo) {
    	if (!newRepo.name || !newRepo.path) {
    		$scope.repo_message="Repo name and file path must be defined.";
    		return;
    	}
    	var data = {
		    	newRepo: newRepo,
		    }
		$scope.repo_message="importing...";
    	$http({
		      method: 'POST',
		      url: '/repo/importRepoFromGIT',
		      data: data
		    }).success(function (data, status, headers, config) {
		        loadRepos();
    			//$scope.repoTree.select_branch(data);
    			$scope.repo_message="repo: "+ newRepo.name+" imported from: "+newRepo.gitRepo;
		    }).
		    error(function (data, status, headers, config) {
		    	$scope.repo_message="unable to import repo: "+data;
		    });
    }
    
    $scope.saveFile = function() {
	  	if($scope.selectedFile) {
			  qs_repo.saveFile($scope.currentFile.path, editor.get(), function(err, message) {
			  	$scope.message = message;
			  });
		}
	  };
    
    
 });