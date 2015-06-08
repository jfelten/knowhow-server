var logger=require('./log-control').logger;
var agentControl = require('./agent-control');
var fileControl = require('./file-control');
var executionControl = require('./execution-control');
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


exports.listAgents = function(req, res) {
	agentControl.listAgents(function (err, agents) {
		if (err) {
			res.send(500, err.message);
		} else {
			res.json(agents);
		}
	});
};

var usernameVar = "unknown";
username(function (err, username) {
    if (err) {logger.error(err.stack); callback(err);}
    else {
    	console.log(username);
	    usernameVar = username;
	    agentControl.addDefaultAgent(usernameVar);
	}
});


getServerInfo = function() {

	
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
		    username: usernameVar
	};
	
	return serverInfo;
};
exports.getServerInfo = getServerInfo;


exports.serverInfo = function (req, res) {
  var os = require("os");
  logger.info(req.connection.remoteAddress+" "+usernameVar);
  res.json(getServerInfo());
};

exports.fileListForDir = function (req,res) {
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

exports.fileContent = function (req,res) {
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


exports.addFile = function(req,res) {
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

exports.deleteFile = function(req,res) {
	var fileName = req.query.fileName;
	fileControl.deleteFile(fileName,function(err) {
		if (err) {
			res.send(500, err.message);
			return;
		}
		
		res.json({ok:true});
	});
};


exports.saveFile = function(req,res) {
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
		console.log(err.stack);
		res.send(500, err.message);
	}
	
};

exports.addAgent = function (req, res) {
  logger.info('add agent: '+req.body.host);
  for (i in req.params) {
	  logger.debug(params[i]);
  }
  var agent = req.body;
  try {
	  agentControl.addAgent(agent, server.agentEventHandler, serverInfo, function(err, newAgent) {
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

exports.agentEvent = function (req, res) {
	  logger.info('agent event: '+req.body.host);
	  for (i in req.params) {
		  logger.debug(params[i]);
	  }
	  var agent = req.body;
	  agentControl.eventEmitter.emit('agent-update',agent);
	  
	  res.json({ok:true});

};

exports.deleteAgent = function (req, res) {
	  logger.info('delete agent: '+req.body._id);

	  var agent = req.body;
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
exports.getAgentInfo = function(req,res) {

	var agent = req.body;
	console.log(agent);
	agentControl.loadAgent(agent,function (err, loadedAgent) {
		if (err) {
			res.send(500, err.message);
		} else {
			console.log(loadedAgent);
			res.json(loadedAgent);
		}
	});

}
	
exports.logs = function(req,res) {
    numLogs=req.body.numLogs;
    console.log("num logs requested="+numLogs);
    require('./log-control').getLastXLogs(numLogs,res);

};



exports.execute = function(req,res) {

	var agent = req.body.khAgent;
	var job =  req.body.job;
	console.log(require('util').inspect(job, {depth:null}));
	agentControl.loadAgent(agent, function (agentError, loadedAgent) {
		
		console.log(req.body);
		
		executionControl.executeJob(loadedAgent, job, function(err){
			if (err) {
				var jobName = "undefined id";
				if (job) {
					jobName = job.id;
				}
				logger.error(jobName+" failed to start.");
				logger.error(err.message);
				res.json(500, {"message": err.message} );
				return;
			} else {
				logger.info(job.id+" launched.");
				res.json({ok:true});
			}
		});
	});
};

exports.cancelJob = function(req,res) {
	var agent = req.body.khAgent;
	var job =  req.body.job;
	
	executionControl.cancelJobOnAgent(agent, job, function(err){
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

exports.repoList = function(req, res) {
	res.json(fileControl.repos);
};

exports.runningJobList = function(req, res) {
	executionControl.getRunningJobsList(function(runningJobList) {
		logger.debug(runningJobList);
		res.json(runningJobList);
	});
	
};
