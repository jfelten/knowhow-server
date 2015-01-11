var Datastore = require('nedb'), 
db = new Datastore({ filename: './repos.db', autoload: true });


var EventEmitter = require('events').EventEmitter;
var logger=require('./log-control').logger;
var mkdirp = require('mkdirp');
var fstream = require('fstream');
var zlib = require('zlib');
var tar = require('tar');
var rimraf = require('rimraf');
var pathlib=require("path");
var os = require("os");
var inspect = require('util').inspect;
var domain = require('domain');
var url = require('url') ;

var KnowhowShell = require('knowhow-shell');


var baseDirs = ["environments", "jobs", "workflows"];

exports.getFilePath = function(repofilename, callback) {
	try {
		fileURL =url.parse(repofilename);
		repoName = repofilename.split(':')[0];
		logger.debug("repo="+repoName);
		logger.debug("file="+fileURL.pathname);
		db.findOne({name: repoName}, function(err, doc) {
			if (err) {
				callback(err);
				return;
			} else {
				if (!doc) {
					callback(new Error("invalid repo: "+repoName));
					return;
				}
				var filePath = doc.path+fileURL.path;
				callback(undefined, filePath);
			}
		});
	} catch (err) {
		callback(err);
	}
};

var loadRepository = function(repoId, callback) {
	db.findOne({_id: repoId}, function(err, doc) {
		if (err) {
			callback(err);
			return;
		} else {
			callback(undefined, doc);
		}
	});
};

exports.loadRepository = loadRepository;

var importFromServer = function(newRepo, callback) {
	
	
	var options ={
  		path: newRepo.path,
  		strip: 0, // how many path segments to strip from the root when extracting
	}
	var request = require('request');
	var error = undefined;
	var d = domain.create();
	d.on('error',function(err) {
  		callback(err);
		return;
	});
	d.run(function () {
		request('http://'+newRepo.host+':'+newRepo.port+'/repo/downloadRepoTarBall?name='+newRepo.hostRepoName)
			.pipe(zlib.createGunzip())
			.pipe(tar.Extract(options))
			.on('close',function() {
				addFileRepo(newRepo, false, function(err, createdRepo) {
				  	if(err) {
				  		logger.error("unable to create repo: "+err.message);
						callback(err);
						return;
					}
					callback(undefined, createdRepo)
				});
			});
	});

}

function listRepositories(callback) {
	db.find({}, function(err, docs) {
		if (err) {
			callback(err);
			return;
		}
		logger.debug('found '+docs.length+' repos');
		logger.debug(docs);
//		docs.forEach(function(agent) {
//			console.log(agent);
//		});
		if (callback) {
			callback(undefined, docs);
		}
	  });
};

var updateFileRepo = function(fileRepo, callback) {
	
	//verify reuqired fields
	if (!fileRepo || !fileRepo.name || !fileRepo.path || !fileRepo._id) {
		if(callback) {
			callback(new Error("required file repo data missing"));
		}
		return;
		
	}
	
	db.findOne({_id: fileRepo._id}, function(err, doc) {
		if (doc && doc.name == fileRepo.name) {
			callback(new Error(fileRepo.name+" not found in database."));
			return;
		}
		
		if (doc.path != fileRepo.path) { // change file location
			fs.rename(doc.path, fileRepo.path, function() {
				db.update({ _id: doc._id }, { $set: { name: fileRepo.name, path: fileRepo.path} }, { }, function (err, numReplaced) {
				  if (err) {
				  	callback(err);
				  } else {
				  	callback(undefined, fileRepo);
				  }
				});
			});
		}
	
	});
};

var addFileRepo = function(fileRepo, useExistingDir, callback) {
	
	//verify reuqired fields
	logger.info(inspect(fileRepo));
	if (!fileRepo || !fileRepo.name || !fileRepo.path) {
		if(callback) {
			callback(new Error("required file repo data missing"));
		}
		return;
		
	}
	
	if (useExistingDir != true && fs.existsSync(fileRepo.path)) {
		callback(new Error("The directory: "+fileRepo.path+" already exists.  Please choose another file path."));
		return;
	}
	//make sure name is unique
	db.findOne({name: fileRepo.name}, function(err, doc) {
		if (doc && doc.name == fileRepo.name) {
			callback(new Error("A repository with name: "+fileRepo.name+" already exists.  Please choose another name."));
			return;
		}
		db.findOne({path: fileRepo.path}, function(err, doc) {
			if (doc && doc.path == fileRepo.path) {
				callback(new Error("A repository with path: "+fileRepo.path+" already exists.  Please choose another path."));
				return;
			}
	
			var repoDir = pathlib.resolve(fileRepo.path);
			//create if it doesn't exist
			if (!fs.existsSync(repoDir)) {
				logger.info("repo dir does not exist - creating dir: "+repoDir);
		    	try {
		    		mkdirp.sync(repoDir, {});
		    	} catch(err) {
		    		logger.error("cannot create: "+repoDir+" "+err.message);
				    callback(err);
					return;
		    	}
		    	logger.info('Directory ' + repoDir + ' created.');
			}
				    
		    //add an entry to the database
			db.insert(fileRepo, function (err, newDoc) {
				if (err) {
					if (callback) {
						callback(err);
					}
					return;
				} else {  
					logger.debug("inserted repo: "+fileRepo.name);
					//initialize the directory structure
					initializeFileRepo(repoDir, function(err) {
						if (err) {
							logger.error("unable to initialize filerepo: "+fileRepo.name);
							if (callback) {
								callback(err);
							}
							return;
						} else {
							logger.info("done creating filerepo: "+fileRepo.name);
							if (callback) {
								callback(undefined, newDoc);
							}
						}
					});
				}
			});
		});
	});
};

var deleteFileRepo = function(fileRepo, callback) {
	if (!fileRepo || !fileRepo._id || !fileRepo.path) {
		if(callback) {
			callback(new Error("required file repo data missing"));
		}
		return;
		
	}
	var repoDir = pathlib.resolve(fileRepo.path+pathlib.sep+fileRepo.name);
	
	db.remove({ _id: fileRepo._id }, {}, function (err, numRemoved) {
		if (err) {
			logger.error(err.message);
			if (callback) {
				callback(err);
				return;
			}
		}
		logger.info("removing: "+fileRepo.path);
		rimraf.sync(fileRepo.path);
		if (callback) {
			callback();
		}
		logger.info("removed repo: "+fileRepo.label);

     });
	
}

var exportFileRepoToFile = function(fileRepo, destFile, callback) {

	pipeFileRepoToStream(fileRepo, function(err, stream) {
		stream.pipe(
			fstream.Writer({ 'path': agent_archive_name }).on("close", function () {
				if (this.agent) {
					agent.message = 'package-complete';
					agent.progress+=10;
					eventEmitter.emit('agent-update', agent);
				}
				logger.info('agent packaged.');
			}).on("error",function(){
				if (this.agent) {
					eventEmitter.emit('agent-error', agent);
				}
				logger.error('error packing agent: ', err);
				if (callback) {
					callback(new Error("Unable to pack agent"));
				}
			}));
	});
	
	
};

exportRepoToSCP = function(fileRepo, dest,callback) {
    var agent = this.agent;
    agent.message = 'transferring agent';
	eventEmitter.emit('agent-update', agent);
	var Client = require('scp2').Client;

	var client = new Client({
		host: agent.host,
	    username: agent.login,
	    password: decrypt(agent.password,this.serverInfo.cryptoKey),
	    path: '/tmp/'+agent_archive_name
	});

	client.upload(__dirname+"/../"+agent_archive_name, '/tmp/'+agent_archive_name, function(err){
		if (err) {
			logger.info(err);
			callback(err);
			return;
		}
		agent.message = 'transfer complete';
		eventEmitter.emit('agent-update', agent);
		logger.info('transfer complete');
		
		//start the agent
		logger.info('starting agent on: '+agent.host);
		client.close();
		callback();
	});


	client.on('close',function (err) {
		//callback();
	    });
	client.on('error',function (err) {
		logger.error(err.stack);
		agent.progress=0;
		agent.message = 'unable to transfer agent: '+err.message;
		eventEmitter.emit('agent-error', agent);
		logger.error('error delivering agent: ', err);
		callback(new Error("stop"));
	});
	
	client.on('transfer', function(buffer, uploaded, total) {
		var rem = uploaded % 5;
		if (rem ==0) {
			agent.progress+=1;
			eventEmitter.emit('agent-update', agent);
		}
		//logger.debug("uploaded="+uploaded+" total="+total);
	});

};

var pipeFileRepoToStream = function(fileRepo, destStream, callback) {
	if (!fileRepo || !fileRepo.name || !fileRepo.path) {
		if(callback) {
			callback(new Error("required file repo data missing"));
		}
		return;
		
	}
	var repoDir = pathlib.resolve(fileRepo.path+pathlib.sep+fileRepo.name);
	fstream.Reader({ 'path': repoDir, 'type': 'Directory' }) /* Read the source directory */
		.pipe(tar.Pack()) /* Convert the directory to a .tar file */
		.pipe(zlib.Gzip()) /* Compress the .tar file */
		.pipe(destStream);
	
};

var initializeFileRepo = function(repoDir, callback) {
	
	for (index in baseDirs) {
		var dir = pathlib.resolve(repoDir+pathlib.sep+baseDirs[index]);
		try {
			mkdirp.sync(dir);
    	} catch (err) {
    		logger.error("unable to create: "+dir);
		    logger.error(err.message);
		    if (callback) {
				callback(err);
			}
			return;
		} 
		logger.info('Directory ' + dir + ' created.');     
	}
	if (callback) {
		callback();
	}
	
};

var importFromGIT = function(newRepo, callback) {
	if (newRepo.gitUser && newRepo.gitPassword) {
			var url = require('url');
		gitURL = url.parse(newRepo.gitRepo);
		if (gitURL.protocol == "ssh:") {
			gitURL.auth=newRepo.gitUser;
		} else {
			gitURL.auth=encodeURIComponent(newRepo.gitUser+':'+newRepo.gitPassword);
		}
		logger.debug(gitURL);
		newRepo.gitRepo=url.format(gitURL);
		//gitRepo=gitURL.protocol+'//'+userpassword+gitURL.host+'/'+gitRepo.pathname;
		logger.debug(newRepo.gitRepo);
		
	}
	cloneJob = {
		script: {
			commands: [
				{
					command: 'git clone '+newRepo.gitRepo+' '+newRepo.path,
					responses : {
						'password': newRepo.gitPassword
					}
				}
			]
		}
	};
	knowhowShell = new KnowhowShell();
	knowhowShell.executeJob(cloneJob, function(err, completedJobRuntime) {
		if (err) {
			logger.error(err.message);
			callback(err);
		} else {
		  	addFileRepo(newRepo, true, function(err, createdRepo) {
		  	  	if (err) {
	  				callback(err);
	  				return;
	  			}
	  			else {
	  				callback();
				}
			});
		}
	});
}

exports.api = {
	"routes": [
		{
			APICall: "/repo/listRepositories",
			callback: function(req, res) {
						listRepositories(function(err, repos) {
								if (err) {
									logger.error(err.message);
									res.send(500, err);
								} else {
									var repoTree = new Array()
									for (index in repos) {
										info = {
									        path: repos[index].path,
									        label: repos[index].name,
									        type: "repo",
									        _id: repos[index]._id
									    };
									    repoTree.push(info)
									}
									res.json(repoTree);
								}
						});
					},
			httpType: "GET"
		},
		{	
			APICall: "/repo/newFileRepo",
			callback: function(req,res) {
						var newRepo = req.body.newRepo;
						addFileRepo(newRepo, true, function(err, createdRepo) {
							if (err) {
								logger.error(err.message);
								res.send(500, err.message);
								return;
							} else {
								logger.info("sending new repos response");
								res.json(createdRepo);
							}
						});
					
					},
			httpType: "POST"
		},
		{	
			APICall: "/repo/updateRepo",
			callback: function(req,res) {
						var existingRepo = req.body.existingRepo;
						updateFileRepo(existingRepo, function(err, updatedRepo) {
							if (err) {
								logger.error(err.message);
								res.send(500, err.message);
								return;
							} else {
								logger.info("sending new repos response");
								res.json(updatedRepo);
							}
						});
					
					},
			httpType: "POST"
		},
		{	
			APICall: "/repo/deleteFileRepo",
			callback: function(req,res) {
						var repo = req.body.repo;
						console.log("delete repo: "+repo._id);
						deleteFileRepo(repo, function(err) {
							if (err) {
								logger.error(err.message);
								res.send(500, err);
								return;
							} else {
								logger.info("sending new repos response");
								res.json({message: repo.name+" deleted."});
							}
						});
					
					},
			httpType: "POST"
		},
		{	
			APICall: "/repo/uploadRepoTarBall",
			callback: function(req,res) {
				var emitter = new EventEmitter();
				var d = domain.create();
				d.add(emitter);
				d.on('error',function(err) {
					logger.error("repo error: "+err.message);
					logger.error(err.stack);
			  		
			  		res.setHeader('Connection','close');
			  		res.setHeader('Location', '/');
			  		res.send(500,err.message);
			  		//res.writeHead(500, { Connection: 'close', Location: '/', message: err.message });
      				//res.write(err.message);
      				//res.end();
					return;
				});
				d.run(function () {
					var Busboy = require('busboy');
					var busboy = new Busboy({ headers: req.headers });
					var newRepo = undefined; 
				    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
						logger.debug(fieldname);
						logger.debug(filename);
						try {
							newRepo = JSON.parse(filename);
						} catch(err) {
							emitter.emit(err);
							return;
						}
						var re = new RegExp('~', 'g');
						newRepo.path=newRepo.path.replace(re,'/');
						console.log('File [' + fieldname + ']: filename: ' + filename + ', encoding: ' + encoding + ', mimetype: ' + mimetype);
	
						logger.info("repository to: "+newRepo.path);
						
							var options ={
						  		path: newRepo.path,
						  		strip: 0, // how many path segments to strip from the root when extracting
							}
							addFileRepo(newRepo, false, function(err, createdRepo) {
							  	if(err) {
							  		logger.error("unable to create repo: "+err.message);
									emitter.emit('error',err);
									return;
								} else {
									file.pipe(zlib.createGunzip())
									.	pipe(tar.Extract(options))
										.on('close',function() {
										res.json({upload: "complete"});
										
									});
								}
							});
							
					});
	    			return req.pipe(busboy);
	    			res.writeHead(404);
	    			res.end();
	  			});

			},
			httpType: "POST"
		},
		{	
			APICall: "/repo/downloadRepoTarBall",
			callback: function(req,res) {
				var path = req.query.path;
				var name = req.query.name;
				var filename = name+'.tar.gz';
				res.setHeader('Pragma', 'public'); // required
    			res.setHeader('Expires', '0');
   				res.setHeader('Cache-Control', 'must-revalidate, post-check=0, pre-check=0');
   				res.setHeader('Cache-Control', 'private",false'); // required for certain browsers
    			res.setHeader('Content-disposition', 'attachment; filename=' + filename);
				res.setHeader('Content-type', 'application/x-gzip');
    			res.setHeader('Content-Transfer-Encoding','binary');
    			//res.setHeader('Content-Length', );;
				
				logger.info("downloading: "+ filename);
				var filestream = fstream.Reader({ 'path': path, 'type': 'Directory' }).on('error', function(err) {
					logger.error(err.message);
					res.send(500, err.message);
					return;
				});
				filestream.pipe(tar.Pack()).on('error', function(err) {
					logger.error(err.message);
					res.send(500, err.message);
					return;
				}).pipe(zlib.Gzip()).on('error', function(err) {
					logger.error(err.message);
					res.send(500, err.message);
					return;
				}).pipe(res);
			},
			httpType: "GET"
		},
		{	
			APICall: "/repo/importRepoFromServer",
			callback: function(req,res) {
						var newRepo = req.body.newRepo;
						importFromServer(newRepo, function(err, createdRepo) {
							if (err) {
								logger.error(err.message);
								res.send(500, err.message);
								return;
							} else {
								logger.info("sending new repos response");
								res.json(createdRepo);
							}
						});
					
					},
			httpType: "POST"
		},
		{	
			APICall: "/repo/importRepoFromGIT",
			callback: function(req,res) {
						var newRepo = req.body.newRepo;
						importFromGIT(newRepo, function(err, _repo) {
							if (err) {
								logger.error(err.message);
								res.send(500, err.message);
								return;
							} else {
								logger.info("sending new repos response");
								res.json(newRepo);
							}
						});
					
					},
			httpType: "POST"
		},
	]
}