var fileControl = require('../routes/file-control');

var KnowhowShell = require('knowhow-shell');
//var KnowhowShell = require('../../knowhow-shell/knowhow-shell');
var KHShell = new KnowhowShell(eventEmitter);
var async = require('async');

var EventEmitter = require('events').EventEmitter;
var eventEmitter = new EventEmitter();
var logger=require('./log-control').logger;

var getPackageVersion = function(packageName, callback) {
	
	var versionJob = {
	  "id": "get package version",
	  "working_dir": "/tmp/KHAgent",
	  "options": {
	    "timeoutms": 40000,
	    "noEcho": true
	  },
	  "files": [],
	  "script": {
	    "env": {
	      "PATH": '/opt/local/bin:/opt/local/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
	      "PACKAGE_NAME": packageName
	    },
	    "commands": [
	      {
	        "command": "npm show ${PACKAGE_NAME} version"
	      }
	    ]
	  }
	}
	var KnowhowShell = require('knowhow-shell');
	var knowhowShell = new KnowhowShell();
	knowhowShell.executeJobAsSubProcess(versionJob, function(err, jobRuntime) {
		if(err) {
			logger.error("unable to get version for package: "+packageName+" "+err.message);
			callback(err);	
			
		} else {
			//console.log(jobRuntime);
			callback(undefined, jobRuntime.scriptRuntime.completedCommands[0].output.split(/[ \r\n]/)[0]);
		}
	});
};

var getGlobalInstallVersion = function(packageName, callback) {
	var KnowhowShell = require('knowhow-shell');
	var knowhowShell = new KnowhowShell();
	knowhowShell.executeSingleCommand("npm -g view "+packageName+" version", function(err, runTime) {
		if (err || !runTime || !runTime.output) {
			callback(err);
		}
		else if (!runTime || !runTime.output) {
			callback(new Error("unable to get version for: "+packageName));
		} else {
			var version = runTime.output.split(/[ \r\n]/)[0];
			callback(undefined, version);
		}
	
	});
	

}

var getInstalledVersions = function(callback) {

	var knowhowServer = require('../package.json');
	var knowhowShell = require('knowhow-shell/package.json');
	//var knowhowApi = require('knowhow-api/package.json');
	//var knowhowServer = require('knowhow-server/package.json');
	//var knowhowAgent = require('knowhow-agent/package.json');
	
	var versions = {
		//'knowhow': knowhow.version,
		'knowhow-shell': knowhowShell.version,
		//'knowhow-api': knowhowApi.version,
		'knowhow-server': knowhowServer.version
		//'knowhow-agent': knowhowAgent.version
	};
	var packages = ['knowhow', 'knowhow-shell', 'knowhow-api', 'knowhow-agent'];
	async.each(packages, function(package, cb) {
			getGlobalInstallVersion(package, function(err, version) {
				if (err) {
					cb(err);
				} else {
					versions[package] = version;
					cb();
				}
			});
		},
		function(err) {
			if (err && callback) {
				callback(err);
			} else if(callback){
				callback(undefined, versions);
			}
		}
	);
}

var getNewestVersions = function(callback) {

	var packages = ['knowhow', 'knowhow-shell', 'knowhow-api', 'knowhow-server', 'knowhow-agent'];
	var versions = {};
	
	async.each(packages, function(package, cb) {
		getPackageVersion(package, function(err, version) {
			if (err) {
				//cb(err);
			} else {
				versions[package] = version;
				cb();
			}
		});
	}, function(err) {
		if (err) {
			callback(err);
		} else {
			//console.log(versions);
			callback(undefined, versions);
		}
	});

}

exports.getNewestVersions = getNewestVersions;
exports.getInstalledVersions = getInstalledVersions;


var upgradeServer = function(sudoPwd, callback) {

	 fileControl.load("InternalRepo:///jobs/knowhow/upgradeKnowhow.json", function(err,content) {
	 	var job = JSON.parse(content);
	 	job.script.env['PASSWORD'] = sudoPwd;
	 	KHShell.executeJobAsSubProcess(job, function(err, runtime){
	 		if (err) {
	 			if (runtime && runtime.output) {
	 				callback(new Error(runtime.output));
	 			}
	 			else {
	 				callback(err);
	 			}
	 		} else {
	 			callback();
	 			process.exit(0);
	 		}
	 	});
	 });

}

var upgradeAgent = function(agent, server, callback) {

	 
	 fileControl.load("InternalRepo:///jobs/knowhow/upgradeKnowhow.json", function(err,content) {
	 	var job = JSON.parse(content);
		server.agentControl.loadAgent(agent, function (agentError, loadedAgent) {
			if (agentError) {
				callback(agentError);
			} else {
			
			 	server.executionControl.executeJob(loadedAgent, job, function(err, finishedJob) {
			 			logger.info("submitted upgrade request");
			 			if(err) {
			 				logger.error(err.message);
			 				logger.error(err.stack);
			 				callback(err);
			 			} else {
			 				agent.progress=1;
	 						agent.status='INSTALLING'
	 						agent.message='Upgrading...';
	 						server.agentControl.eventEmitter.emit('agent-update', agent);
			 				callback(undefined, finishedJob);
			 			}
			 		},
			 		function(err, finishedJob) {
			 			logger.debug("upgrade callback");
				 		if(err) {
				 			//logger.error(err.message);
				 			logger.error(finishedJob);
				 			loadedAgent.message = 'Upgrade failed. '+finishedJob.message;
				 			loadedAgent.status = 'READY';
				 			delete loadedAgent.shellUpgradeAvailable;
				 			delete loadedAgent.agentUpgradeAvailable;
				 			server.agentControl.updateAgent(loadedAgent, function() {});
				 			server.agentControl.eventEmitter.emit('agent-update', loadedAgent);
				 		} else {
					 		server.agentControl.resetAgent(loadedAgent, server.agentEventHandler, server.api.serverInfo, function(err) {
					 			if(err) {
						 			 //agent.progress=1;
									 //agent.status='ERROR'
									 //agent.message='Upgrade Failed';
									 //server.agentControl.eventEmitter.emit('agent-update', agent);
						 		} else {
					 				loadedAgent.message = 'Upgrade complete. Restarting';
				 					loadedAgent.status = 'READY';
				 					server.agentControl.updateAgent(loadedAgent, function() {});
				 					server.agentControl.eventEmitter.emit('agent-update', loadedAgent);
				 					server.agentControl.updateAgent(loadedAgent, function() {});
					 			}
					 		});
					 	}
					 }
			 	);
			 }
		});
	 });

}

/**
 * Upgrades all agents
 */
 var upgradeAllAgents = function(server, callback) {
 
 	server.agentControl.listAgents(server.serverInfo, function (err, agents) {
				if (err) {
					callback(err);
				} else {
					async.each(agents, function(agent, cb) {
						if (agent.agentUpgradeAvailable || agent.shellUpgradeAvailable) {
							upgradeAgent(agent,server,cb);
						} else {
							cb();
						}
					
					},
					function(err) {
						callback(err);
					});
				}
			});
 
 }

/**
 * Exposed API call to upgrade this server to the latest version in npm
 */
var upgradeServerAPI = function(req, res) {
	var sudoPwd = req.body.sudoPwd;
	upgradeServer(sudoPwd, function(err) {
		if (err) {
			res.status(500).send({message: err.message, stack: err.stack})
		} else {
			res.json({"message": "upgrade complete - restarting server"});
		}
	});
	

}

/**
 * API call to upgrade an agent
 */
var upgradeAgentAPI = function(req, res) {
	upgradeAgent(req.body.agent, this.server, function (err) {
		if(err) {
			res.send(500, err);
		} else {
			res.json({"message": "processing upgrade"});
		}
	
	});

}

/**
 * API call to upgrade all agents on a knowhow server
 */
var upgradeAllAgentsAPI = function(req, res) {
	upgradeAllAgents(this.server, function(err) {
		if(err) {
			res.send(500, err);
		} else {
			res.json({"message": "all agents upgraded"});
		}
	});

}


var UpgradeControl = function(server) {

	var self = this;
	
	self.server = server;

	self.upgradeServerAPI=upgradeServerAPI.bind({server: self.server});
	self.upgradeAgentAPI=upgradeAgentAPI.bind({server: self.server});
	self.upgradeAllAgentsAPI = upgradeAllAgentsAPI.bind({server: self.server});
	self.getInstalledVersions = getInstalledVersions;
	self.getNewestVersions = getNewestVersions;
	self.upgradeServer = upgradeServer;
	self.upgradeAgent = upgradeAgent;
	self.upgradeAllAgents = upgradeAllAgents;
	
	return self;
}	
	
module.exports = UpgradeControl;