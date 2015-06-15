var logger=require('./log-control').logger;
var agentControl = require('./agent-control');
var fileControl = require('./file-control');

var moment = require('moment');
var server = require('../server');
var fs = require('fs');
var async = require('async');
var username = require('username');
/*
 * Serve JSON to our AngularJS client
 */

exports.agentControl = agentControl;
var startTime = moment().format('MMMM Do YYYY, h:mm:ss a');


var listAgents = function(req, res) {
	agentControl.listAgents(function (err, agents) {
		if (err) {
			res.send(500, err.message);
		} else {
			res.json(agents);
		}
	});
};

var usernameVar = "unknown";



var getServerInfo = function(userName) {

	
    var os = require("os");
    var pjson = require('../package.json');
    
   
	serverInfo = {
	  		version: pjson.version,
	  		copyright: moment().format('YYYY'),
			name: os.hostname(),
		    started: startTime,
		    port: server.port,
		    workingDir: require('process').cwd(),
		    cryptoKey: 	'd6F3Efea',
		    username: userName
	};
	
	return serverInfo;
};
exports.getServerInfo = getServerInfo;


var getServerInfoAPI = function (req, res) {
  var os = require("os");
  logger.info(req.connection.remoteAddress);
  res.json(this.serverInfo);
};

var fileListForDir = function (req,res) {
	var dir = req.query.dir;
	
	fileControl.getDirTree(dir, function(err, tree) {
		if (err) {
			res.send(500, err.message);
		} else {
			logger.debug(tree);
			res.json( {children : [tree]});
		}
		
	});
	
};

var fileContent = function (req,res) {
	var filePath = req.query.file;
	var repo = req.query.repo;
	 
	fileControl.fileContent(filePath,repo, function(err, headers, fileToRead) {
   		if(err) {
   			res.send(500, err.message);
   			return;
   		} else  {
   			logger.debug(headers);
   			res.writeHead(200, headers);

   			var fileStream = fs.createReadStream(fileToRead);
   			fileStream.pipe(res);
   		}
   	});
    
};


var addFile = function(req,res) {
	try {
		var fileName = req.query.fileName;
		var path = req.query.path;
		var isDirectory = req.query.isDirectory;
		var content = decodeURIComponent(req.query.content);
		var isEncoded= req.query.isEncoded;
		if (isEncoded == "true" && content != undefined) {
			content = decodeURIComponent(content);
		}
		//logger.debug(content);
		if (!content) {
			content = {};
		}
		fileControl.addNewFile(path,fileName,content,isDirectory,function(err,newFile) {
			if (err) {
				res.send(500, err.message);
				return;
			}
			logger.debug(newFile);
			res.json(newFile);
			
		});
	} catch (err) {
		logger.error(err.stack);
		res.send(500, err.message);
	}
};

var deleteFile = function(req,res) {
	var fileName = req.query.fileName;
	fileControl.deleteFile(fileName,function(err) {
		if (err) {
			res.send(500, err.message);
			return;
		}
		
		res.json({ok:true});
	});
};


var saveFile = function(req,res) {
	try {
		var fileName = req.query.fileName;
		
		var isEncoded= req.query.isEncoded;
		var data = req.query.data;
		var check = (isEncoded == "true" && data != undefined);
		if (isEncoded == "true" && data) {
			data = decodeURIComponent(data);
		}
		fileControl.saveFile(fileName,data,res);
	} catch (err) {
		logger.error(err.stack);
		res.send(500, err.message);
	}
	
};

var addAgent = function (req, res) {
  logger.info('add agent: '+req.body.host);
  for (i in req.params) {
	  logger.debug(params[i]);
  }
  var agent = req.body;
  
  try {
	  agentControl.addAgent(agent, this.agentEventHandler, getServerInfo(), function(err, newAgent) {
	  	if (err) {
	  		res.send(500, {"message": err.message});
	  		return;
	  	} else {
		  	res.json(newAgent);
		}
	  });
  } catch (err) {
 	logger.error(err.message);
  	logger.error(err.stack);
  }
  

};

var resetAgent = function (req, res) {
  logger.info('reset agent: '+req.body.host);
  for (i in req.params) {
	  logger.debug(params[i]);
  }
  var agent = req.body;
  
  try {
	  agentControl.resetAgent(agent, this.agentEventHandler, getServerInfo(), function(err, newAgent) {
	  	if (err) {
	  		res.send(500, {"message": err.message});
	  		return;
	  	} else {
		  	res.json(newAgent);
		}
	  });
  } catch (err) {
 	logger.error(err.message);
  	logger.error(err.stack);
  }
  

};

var agentEvent = function (req, res) {
	  logger.info('agent event: '+req.body.host);
	  for (i in req.params) {
		  logger.debug(params[i]);
	  }
	  var agent = req.body;
	  agentControl.eventEmitter.emit('agent-update',agent);
	  
	  res.json({ok:true});

};

var deleteAgent = function (req, res) {
	  logger.info('delete agent: '+req.body._id);

	  var agent = req.body;
	  console.log(agent);
	  agentControl.deleteAgent(agent, function(err, numdeleted) {
	  	if (err) {
	  		res.send(500, err);
	  	} else {
		  	agentControl.listAgents(function (err, agents) {
				if (err) {
					res.send(500, err);
				} else {
					res.json(agents);
				}
			});
		}
	  });
	  
	  //agentControl.listAgents(req,res);

	};

/**
 *	returns agent Info based on user@host:port
 */	
var getAgentInfo = function(req,res) {

	var agent = req.body;
	agentControl.loadAgent(agent,function (err, loadedAgent) {
		if (err) {
			res.send(500, err.message);
		} else {
			res.json(loadedAgent);
		}
	});

}
	
var logs = function(req,res) {
    numLogs=req.body.numLogs;
    require('./log-control').getLastXLogs(numLogs,res);

};



var execute = function(req,res) {

	var agent = req.body.khAgent;
	var job =  req.body.job;
	logger.debug(require('util').inspect(job, {depth:null}));
	this.agentControl.loadAgent(agent, function (agentError, loadedAgent) {
		
		
		this.executionControl.executeJob(loadedAgent, job, function(err){
			if (err) {
				var jobName = "undefined id";
				if (job) {
					jobName = job.id;
				}
				logger.error(jobName+" failed to start.");
				logger.error(err.message);
				logger.error(err.stack);
				res.json(500, {"message": err.message} );
				return;
			} else {
				logger.info(job.id+" launched.");
				res.json({ok:true});
			}
		});
	}.bind({executionControl: this.executionControl}));
};

var cancelJob = function(req,res) {
	var agent = req.body.khAgent;
	var job =  req.body.job;
	
	this.executionControl.cancelJobOnAgent(agent, job, function(err){
		if (err) {
			logger.error(job.id+" could not be cancelled.");
			logger.error(err);
			res.send(500, err);
			return;
		}
		logger.info(job.id+" cancelled.");
		res.json({ok:true});
	});
};

var repoList = function(req, res) {
	res.json(fileControl.repos);
};

var runningJobList = function(req, res) {
	this.executionControl.getRunningJobsList(function(runningJobList) {
		logger.debug(runningJobList);
		res.json(runningJobList);
	});
	
};

var api = function(server, callback) {
	this.server = server;
	username(function (err, userName) {
		

		this.listAgents = listAgents;
		this.serverInfo = getServerInfo(userName);
		console.log(serverInfo);
		this.getServerInfoAPI = getServerInfoAPI.bind({serverInfo: this.serverInfo});;
		this.fileListForDir = fileListForDir;
		this.fileContent = fileContent;
		this.addFile = addFile;
		this.deleteFile = deleteFile;
		this.saveFile = saveFile;
		this.addAgent = addAgent.bind({serverInfo: this.serverInfo, agentEventHandler: server.agentEventHandler});
		this.resetAgent = resetAgent.bind({serverInfo: this.serverInfo, agentEventHandler: server.agentEventHandler});
		this.agentEvent = agentEvent;
		this.deleteAgent = deleteAgent;
		this.getAgentInfo = getAgentInfo;
		this.logs = logs;
		this.execute = execute.bind({agentControl: server.agentControl, executionControl: server.executionControl});
		this.cancelJob = cancelJob.bind({executionControl: server.executionControl});;
		this.repoList = repoList;
		this.runningJobList = runningJobList.bind({executionControl: server.executionControl});;
	    callback(undefined,this);
	});
	
	
}

module.exports = api;
