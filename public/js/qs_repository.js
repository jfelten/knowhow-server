var repo_module = angular.module('qs_repository', []);

var addRepo = function(newRepo,callback) {
    	var data = {
		    	newRepo: newRepo,
		    };
	    this.$http({
		      method: 'POST',
		      url: '/repo/newFileRepo',
		      data: data
		    }).success(function (data, status, headers, config) {
		        console.log("added new Repo");
		        callback(undefined, data)
		    }).
		    error(function (data, status, headers, config) {
		    	callback(new Error(data));
		    	//$scope.message = 'Unable to contact server http status: '+status;
		    });
    }
    
var updateRepo = function(existingRepo,callback) {
    	var data = {
		    	existingRepo: existingRepo,
		    };
	    this.$http({
		      method: 'POST',
		      url: '/repo/updateFileRepo',
		      data: data
		    }).success(function (data, status, headers, config) {
		        console.log("updated Repo");
		        callback(undefined, data)
		    }).
		    error(function (data, status, headers, config) {
		    	callback(new Error(data));
		    	//$scope.message = 'Unable to contact server http status: '+status;
		    });
    }

var deleteRepo = function(repo,callback) {
		console.log("deleting repo: "+repo._id);
    	var data = {
		    	repo: repo,
		    };
	    this.$http({
		      method: 'POST',
		      url: '/repo/deleteFileRepo',
		      data: data
		    }).success(function (data, status, headers, config) {
		        console.log("deleted");
		        callback(undefined, data)
		    }).
		    error(function (data, status, headers, config) {
		    	callback(new Error(data.message+' : '+status));
		    	//$scope.message = 'Unable to contact server http status: '+status;
		    });
    }

var loadRepo = function(repo, subDir, callback) {

	    this.$http.get('/api/fileListForDir?dir='+repo.path+'/'+subDir).
	    success(function(data) {
	    	var files = data.children;
	    	if (callback){
	    		callback(undefined, files);
	    	}
	        return files   	
	    }).error(function(data) {
	    	console.log("error");
	    	if (callback) {
	    		callback(new Error(data));
	    	}
	    });
	    
};
	  
var loadFile = function(repo, path, callback) {
  	  console.log('load file');
	  this.$http.get('/api/fileContent?repo='+repo+'&file='+path,{
          transformResponse: function (data, headers) {
              //console.log(headers['content-type']);
              //console.log(data);
              if (headers['Content-Type'] == 'text/json' && data.length >0) {
                  try {
                	  var jsonObject = JSON.parse(data);
                	  if (jsonObject == undefined) {
                	  	jsonObject = {};
                	  }
                	return jsonObject;
                  } 
                  catch (e) {
                	  alert(e);
                	  //editor.setText(data, function(err) {
        		    	//	console.log(err);
                	  //});
                	  callback(err,data);
                	 // return data;//.replace(/\n/g, '\\n');
                  }
              }
              return data;
        	  
          }
      }).success(function(data) {
    	  callback(undefined,data);
      });
      
 };

	  
var addFile = function(selectedNode, repo, newFile, tree, isDirectory) {
  
	  if (selectedNode.type != "folder") {
	  	console.log("selecting parent folder for type: "+selectedNode.type );
	  	selectedNode = tree.get_parent_branch(selectedNode);
	  }
	  
	  
	  //submit the add request

	  this.$http.get('/api/addFile?path='+selectedNode.path+'&fileName='+newFile+'&isDirectory='+isDirectory
      ).success(function(data) {
    	  selectedNode.children.push(data);
          //tree.expand_all(selectedNode);
          //tree.select_branch(selectedNode);
      });
      
};
  
var deleteFile = function(selectedNode, force, callback) {
	  console.log("delete file: selectedFile="+selectedNode.path+" type="+selectedNode.type );
	
	  
	  //pop up warning if a dir
	  if (force != true && selectedNode.type == "folder") {
		 console.log("directory check");
		 openDeleteFileModal(selectedNode, this.$modal, callback);
	  } else if (force != true && selectedNode.type == "repo") {
		 console.log("directory check");
		 openDeleteFileModal(selectedNode, this.$modal, callback);
	  } 
	  
	  
	  else {//submit the delete request
	  	if (selectedNode.type == "repo") {
	  		var data = {
		    	repo: selectedNode,
		    };
		    this.$http({
			      method: 'POST',
			      url: '/repo/deleteFileRepo',
			      data: data
			    }).success(function (data, status, headers, config) {
			        console.log("deleted");
			        callback(undefined, data)
			    }).
			    error(function (data, status, headers, config) {
			    	callback(new Error(data.message+' : '+status));
			    	//$scope.message = 'Unable to contact server http status: '+status;
			    });
	  	} else {
	  		this.$http.get('/api/deleteFile?fileName='+selectedNode.path).success(function(data) {
	    	  callback(data);
	      });
	  	}
			  
	  
		
	 }
      
};

var openDeleteFileModal = function(selectedNode, $modal, callback) {
	var modalInstance ={};
	var dirWarningModalController=  function ($rootScope, $scope, $modal, $log, qs_repo) {


	  $scope.ok = function () {
	    qs_repo.deleteFile(selectedNode, true, callback);
	    modalInstance.close('ok');
	  };
	
	  $scope.cancel = function () {
	    console.log("nope I really don't want to do it");
	    modalInstance.dismiss('cancel');
	  };

    };
    modalInstance = $modal.open({
      templateUrl: 'directoryWarning',
      controller: dirWarningModalController,
      size: ''
    });

    modalInstance.result.then(function (selectedItem) {
      //$scope.selected = selectedItem;
    }, function () {
      $log.info('Modal dismissed at: ' + new Date());
    });
	    
	    
  
}
	    
var saveFile =  function(fileName,fileContent,callback) {
	  console.log('save file');

	    this.$http({
		      method: 'GET',
		      url: '/api/saveFile',
		      params: {fileName: fileName,
		    	  	   data: fileContent
		    	  }
		    }).success(function (data, status, headers, config) {

		        callback(undefined, data.message);
		    }).
		    error(function (data, status, headers, config) {
		    	var message = 'Unable to save file status: '+status;
		    	callback(new Error(message),message);
		    });  
	  
};


var openNewFileModal = function (selectedNode, repo, tree, templateURL) {
			console.log("getting file form");
			var modalInstance ={};
			
		    modalInstance = this.$modal.open({
		      templateUrl: templateURL,
		      controller:function($scope, qs_repo) {
		      	$scope.selectedNode = selectedNode;
				  //var modalInstance ={};
				  console.log(selectedNode);
				  $scope.addFile = function (fileName) {
				  	console.log("creating: "+fileName);
				    qs_repo.addFile(selectedNode,repo,fileName,tree,false)
				   	modalInstance.close('ok');
				  };
				  $scope.addDirectory = function (fileName) {
				    qs_repo.addFile(selectedNode,repo,fileName,tree,true)
				    modalInstance.close('ok');
				  };
				
				  $scope.cancel = function () {
				    console.log("nope I really don't want to do it");
				    modalInstance.dismiss('cancel');
				  };
				
				},
		      size: '',
		      resolve: {modalInstance: modalInstance}
		      
		    });
		
		    modalInstance.result.then(function (selectedItem) {

		    }, function () {
		      console.log('Modal dismissed at: ' + new Date());
		    });

		   
	
	};
	
repo_module.controller('newFileModalController', function($scope) {
  //var modalInstance ={};
			
  var selectedNode = $scope.selectedFile;
  console.log(selectedNode);
  $scope.addFile = function (fileName) {
  	console.log("creating: "+fileName);
    qs_repo.addFile(selectedNode,fileName,false)
   $scope.modalInstance.close('ok');
  };
  $scope.addDirectory = function (fileName) {
    qs_repo.addFile(selectedNode,fileName,true)
    $scope.modalInstance.close('ok');
  };

  $scope.cancel = function () {
    console.log("nope I really don't want to do it");
    $scope.modalInstance.dismiss('cancel');
  };

});	
	

repo_module.factory("qs_repo", ["$http","$modal", function ($http,$modal,qs_repo) {
   	return {
   		addRepo : addRepo.bind({$http: $http}),
   		deleteRepo : addRepo.bind({$http: $http}),
   	  	loadRepo: loadRepo.bind({$http: $http}),
   	  	loadFile: loadFile.bind({$http: $http}),
   	  	saveFile: saveFile.bind({$http: $http}),
   	  	addFile: addFile.bind({$http: $http}),
   	  	deleteFile: deleteFile.bind({$http: $http, $modal: $modal}),
   	  	openNewFileModal: openNewFileModal.bind({$modal: $modal}),
   	  	openDeleteFileModal: openNewFileModal.bind({$modal: $modal})
   	  }

   }]);