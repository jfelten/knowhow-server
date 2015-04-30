
var logger=require('./log-control').logger;
var async = require('async');
var agentControl = require('./agent-control');
var agentEvents = require('./agent-events');
var http = require('http');
var io =  require('socket.io-client');
var fileControl = require('../routes/file-control');
var repoControl = require('./repository-control');
var ss = require('socket.io-stream');
var zlib = require('zlib');
var fstream = require('fstream');
var tar = require('tar');
var domain = require('domain');
//deliver the agent files

var pathlib = require('path');

var EventEmitter = require('events').EventEmitter;
var eventEmitter = new EventEmitter();
exports.eventEmitter = eventEmitter;
var currentJobs = {};

setFileSocket = function(agent, socket) {
	if (agent && agent._id) {
		agentId=agent._id;
		if(!currentJobs[agentId]) {
			currentJobs[agentId] = {};
			currentJobs[agentId].fileSocket=socket;
		} 
	}

};
exports.setFileSocket = setFileSocket;

updateJob = function(agent, job, callback ) {
	if (agent && agent._id && job && job.id) {
		logger.debug("updating: "+job.id);
		agentId=agent._id;
		if(!currentJobs[agentId]) {
			currentJobs[agentId] = {};
			currentJobs[agentId].agent=agent;
			currentJobs[agentId][job.id] = job;
		} 
		else if (!currentJobs[agentId][job.id]) {
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

exports.updateJob = updateJob;

checkFiles = function(job, callback) {
	files=job.files;

	for (uploadFile in files) {
	    
	    
		var file = files[uploadFile];
		file.source = replaceVars(file.source, job.script.env) 
		job.files[uploadFile] = file;
				
		var filepath= repoControl.getFilePath(file.source, function(err, filepath) {
			if (!filepath || !fs.existsSync(filepath))  {
				if (callback) {
					callback(new Error(file.source+" does not exist."));
				}
			return false;
			}
		});
			
		

	}
	if (callback) {
		callback(undefined, job);
	}
}

replaceVars = function(input, envVars) {
	var output = input;
	if (envVars) {
		logger.debug("input="+input);
	    replaceVar = function(inputString, regEx,varName) {
		    var iteration=0;
			while( res = regEx.exec( inputString) ){
				 for (i=0; i < res.length; i++) {
			        var replaceVal = res[i];
			    	var value = envVars[replaceVal.replace('\${','').replace('}','')];
			    	inputString=inputString.replace(replaceVal,value);
			      }
			      if (regEx.exec(inputString) ) {
			      	inputString = replaceVar(inputString, regEx,varName);
			      }
			}
			//logger.debug(inputString);
			return inputString;
		}
		
		var dollarRE = /\$\w+/g
		var dollarBracketRE = /\${\w*}/g
		for (variable in envVars) {
			//logger.debug("replacing: "+variable);
			output = replaceVar(output, dollarRE,variable);
			output =  replaceVar(output, dollarBracketRE,variable);
		}
		logger.debug("output="+output);
	}	
	return output;
};

initiateJob = function(agentId, jobId, callback ) {
	if (currentJobs[agentId] && currentJobs[agentId][jobId] &&  currentJobs[agentId][jobId].progress >0) {
		logger.debug(currentJobs[agentId][jobId]);
		cancelJob(agentId, jobId);
		if (callback) {
			callback(new Error("job: "+jobId+" already running on "+agentId));
		}
	} else {
		if (!currentJobs[agentId]) {
			currentJobs[agentId] = {};
		}
		currentJobs[agentId][jobId] = {};
		currentJobs[agentId][jobId].status="initiated";
		currentJobs[agentId][jobId].progres=1;
		
		if (callback) {
	    	callback();
	    }
	}
}

exports.initiateJob = initiateJob;

cancelJob = function(agentId, jobId, callback ) {
	if (currentJobs[agentId] != undefined && currentJobs[agentId][jobId] != undefined) {
	/*
		for (uploadFile in currentJobs[agentId][jobId].fileProgress) {
			if (currentJobs[agentId][jobId].fileProgress[uploadFile] && 
				currentJobs[agentId][jobId].fileProgress[uploadFile].gzip) {
			
				currentJobs[agentId][jobId].fileProgress[uploadFile].gzip.close();
			}
			if (currentJobs[agentId][jobId].fileProgress[uploadFile] && 
				currentJobs[agentId][jobId].fileProgress[uploadFile].tar) {
			
				currentJobs[agentId][jobId].fileProgress[uploadFile].tar.close();
			}
			if (currentJobs[agentId][jobId].fileProgress[uploadFile].readStream != null) {
				currentJobs[agentId][jobId].fileProgress[uploadFile].readStream.close();
			}
	    }*/
		clearTimeout(currentJobs[agentId][jobId].timeout);
	    clearInterval(currentJobs[agentId][jobId].fileCheck);
	    eventEmitter.emit('job-cancel',currentJobs[agentId].agent, currentJobs[agentId][jobId]);
	    delete currentJobs[agentId][jobId];
	}
	 
    if (callback) {
    	callback();
    }
}

exports.cancelJob = cancelJob;

completeJob = function(agent,job) {
	if (agent && job) {
		
		var jobId = job.id;
		var agentId = agent._id;
		logger.info("completing "+jobId+" on "+agentId);
		if (currentJobs[agentId][jobId]) {
			logger.debug("closing read streams.");
			if (currentJobs[agentId][jobId].fileProgress && currentJobs[agentId][jobId].fileProgress.length >0 ) {
				logger.debug("closing files.");
				/*
				for (uploadFile in currentJobs[agentId][jobId].fileProgress) {
					if (currentJobs[agentId][jobId].fileProgress[uploadFile] && 
						currentJobs[agentId][jobId].fileProgress[uploadFile].gzip) {
					
						currentJobs[agentId][jobId].fileProgress[uploadFile].gzip.close();
					}
					if (currentJobs[agentId][jobId].fileProgress[uploadFile] && 
						currentJobs[agentId][jobId].fileProgress[uploadFile].tar) {
					
						currentJobs[agentId][jobId].fileProgress[uploadFile].tar.close();
					}
				
					if (currentJobs[agentId][jobId].fileProgress[uploadFile] && 
					currentJobs[agentId][jobId].fileProgress[uploadFile].readStream) {
					
						currentJobs[agentId][jobId].fileProgress[uploadFile].readStream.close();
					}
			    }*/
			}
			logger.debug("removed read streams.");
			if (currentJobs[agentId][jobId].timeout) {
				logger.debug("removing timeout for: "+jobId);
				clearTimeout(currentJobs[agentId][jobId].timeout);
			}
			logger.debug("removed timeout.");
			if (currentJobs[agentId][jobId].fileCheck) {
				logger.debug("removing file check for: "+jobId);
		    	clearInterval(currentJobs[agentId][jobId].fileCheck);
		    }
		    logger.debug("removed file checks");
		    currentJobs[agentId][jobId] = undefined;
		   
		   
		 }
		 job.complete = true;
		 logger.info("completed.");
		 eventEmitter.emit('job-complete',agent, job);
	 }
}
exports.completeJob = completeJob;

var cancelJobOnAgent = function(agent,job,callback) {

	var jobId = job.id;
	var agentId = agent._id;
	if (currentJobs[agentId].eventSocket) {
		currentJobs[agentId].eventSocket.emit('job-cancel',job);
	}
	eventEmitter.emit('cancel-job-on-agent',agent,job);
	cancelJob(agentId,jobId, function() {
		if (callback) {
			callback();
		}
	});
	

}

exports.cancelJobOnAgent = cancelJobOnAgent;

exports.executeJob = function(agent,job,callback) {
	
	if (!agent || agent.status != 'READY') {
		var agentName = undefined;
		if (agent) {
			agentName = agent.user+'@'+agent.host+':'+agent.port;
		}
		callback(new Error('invalid agent or agent state is not \'READY\' agent:'+agentName));
		return;
	} else if (!job) {
		callback(new Error('no job passed'));
		return;
	}
	var d = domain.create();
	
	d.on('error', function(er) {
	      logger.error('execution error', er.stack);
	
	      // Note: we're in dangerous territory!
	      // By definition, something unexpected occurred,
	      // which we probably didn't want.
	      // Anything can happen now!  Be very careful!
	
	      //try {
	        // make sure we close down within 30 seconds
	        //var killtimer = setTimeout(function() {
	        //  process.exit(1);
	        //}, 30000);
	        // But don't keep the process open just for that!
	        //killtimer.unref();
	        cancelJobOnAgent(agent,job, function() {
	        	cancelJob(agent._id,job.id);
	        });
	        
	
	      //} catch (er2) {
	        // oh well, not much we can do at this point.
	       // console.error('Error sending 500!', er2.stack);
	      //}
	});
	d.run(function() {
		var jobId = job.id;
		var agentId = agent._id;
		
		checkFiles(job, function(err,checkedJob) {
			if (err) {
				callback(err);
				return;
			}
			job=checkedJob;
			var headers = {
			    'Content-Type' : 'application/json',
			    'Content-Length' : Buffer.byteLength(JSON.stringify(job) , 'utf8'),
			    'Content-Disposition' : 'form-data; name="script"'
			};
	
			// the post options
			var options = {
			    host : agent.host,
			    port : agent.port,
			    path : '/api/execute',
			    method : 'POST',
			    headers : headers
			};
		
			logger.info('Starting Job: '+job.id+' on '+agent.user+'@'+agent.host+':'+agent.port);
			if (currentJobs[agentId] == undefined) {
				currentJobs[agentId] = {};
			}
			
	    	logger.info("initializing: "+job.id+" on: "+agent.host+":"+agent.port);
	    	initiateJob(agentId, jobId, function(err) {//cancel the existing job if it is running
	    		if (err) {
	    			callback(err);
	    			return;
	    		}
	    		logger.info("job: "+job.id+" initialized on: "+agent.host+":"+agent.port);
	    		currentJobs[agentId][jobId] = job;
	    		currentJobs[agentId].agent=agent;
				// do the POST call
				var reqPost = http.request(options, function(res) {
					logger.debug("statusCode: ", res.statusCode);
				    // uncomment it for header details
					//logger.debug("headers: ", res.headers);
			
					 
			
				    res.on('data', function(d) {
				    	logger.debug('result:\n');
				        process.stdout.write(d+'\n');
				        if (res.statusCode != 200) {
						 	logger.error("Unable to execute Job. Response code:"+res.statusCode);
						 	callback(new Error(JSON.parse(d).message));
						 	return;
						 }
				        logger.debug('\n\nJob request sent. Listening for events and uploading files');
				        job.status="initializing job"
				        job.progress=1;
				        eventEmitter.emit('job-start',agent,job);
			        
					
				    //do the work
	
						
						
				   		uploadFiles(agent,job,function(err) {
				    			if (err) {
				    				callback(err);
				    				return;
				    			} else {
				    				setJobTimer(agent, job);
				    				callback(null,jobId+' execution started');
				    			}
					    		});
		
				    	});
				    	
				    	
		//		    } catch (err) {
		//		      currentJobs[agentId][jobId].eventSocket.emit('job-cancel',jobId);
		//		    	logger.error(err);
		//		    	logger.error("problem uploading files");
		//		    	cancelJob(agentId, jobId);
		//		    	callback(new Error("Unable to start job id: "+jobId));
		//		    	return;
		//		    }
				    
			    });
			    reqPost.write(JSON.stringify(job));
				reqPost.end();
				reqPost.on('error', function(e) {
				    logger.error(e);
				    callback(e);
				    return;
				});
			});
		
		
			
		});
		});
		
}

	
function uploadFiles(agent,job, callback) {
	logger.info("uploading files for: "+job.id+" to "+agent.host+":"+agent.port);
 	var agentId = agent._id;
	var jobId=job.id;
	if (!job || !job.files || job.files == null) {
		callback();
		return;
	}
	currentJobs[agentId][jobId].fileProgress = {};
	async.eachSeries(job.files, function(file,fcallback) {
	    
		var file = files[uploadFile];
		var filepath= repoControl.getFilePath(file.source, function(err, filepath) {
			if (err) {
				logger.error(err.message);
				fcallback(err);
				return;
			}
			var fileName = pathlib.basename(filepath);
			currentJobs[agentId][jobId].fileProgress[fileName] = {}
		    currentJobs[agentId][jobId].fileProgress[fileName].fileName=fileName;
			
			var name = filepath.split(pathlib.sep).pop();
			
			
			
			var total = 0;
			try {
				if (fs.existsSync(filepath))  {
				
					var stats = fs.statSync(filepath);
					var fileSizeInBytes = stats["size"];
					var isDirectory = stats.isDirectory();	
				    logger.info("uploading "+filepath);
					var stream = ss.createStream();
					
					if(isDirectory) {
						currentJobs[agentId][jobId].gzip = zlib.Gzip();
						currentJobs[agentId][jobId].tar = tar.Pack();
						currentJobs[agentId][jobId].fileProgress[fileName].readStream = fstream.Reader({ 'path': filepath, 'type': 'Directory' })
						.pipe(currentJobs[agentId][jobId].tar).on('error', function(err) {/* Convert the directory to a .tar file */
							logger.error("tar pack interrupted: "+err.message);
						}) 
						.pipe(currentJobs[agentId][jobId].gzip).on('error', function(err) {
							logger.error("gzip compression interrupted: "+err.message);
						});
					} else {
						//currentJobs[agentId][jobId].fileProgress[fileName].readStream = fs.createReadStream(filepath,{autoClose: true, highWaterMark: 32 * 1024});
						currentJobs[agentId][jobId].gzip = zlib.Gzip();
						currentJobs[agentId][jobId].fileProgress[fileName].readStream = fstream.Reader(filepath)
						.pipe(currentJobs[agentId][jobId].gzip).on('error', function(err) {
							logger.error("gzip compression interrupted: "+err.message);
						});
					}
					ss(currentJobs[agentId].fileSocket).emit('agent-upload', stream, {name: fileName, jobId: jobId, fileSize: fileSizeInBytes, destination: file.destination, isDirectory: isDirectory });
					currentJobs[agentId][jobId].fileProgress[fileName].readStream.pipe(stream );
					fcallback();
				} else {
					throw new Error(filepath+" does not exist");
				}
			    
			} catch(err) {
			    var badFile = fileControl.getFilePath(files[uploadFile].source);
				logger.error("unable to start upload for: "+ badFile)
				logger.error(err.message+" "+err.call+" "+err.sys);
				if (currentJobs[agentId].fileSocket) {
					currentJobs[agentId].fileSocket.emit('client-upload-error', {name: fileName, jobId: jobId, fileSize: fileSizeInBytes, destination: file.destination } );
				} else {
					logger.error("unable to notify server of upload failure");
				}
				
	        //    currentJobs[agentId][jobId].fileProgress.error=true;
	        //    logger.error('requesting cancel of: '+jobId);
			//	currentJobs[agentId].eventSocket.emit('job-cancel',jobId);
			//	cancelJob(agent, job);
			//	callback(new Error("Problem starting file upload"));
			    
				fcallback(new Error("unable to start upload for: "+badFile));
				error=true;
				return;
			}
		});
		
		
	}, function(err) {
		if(err) {
			callback(err);
		} else {
			callback();
		}
	});
	   
	
}

function uploadComplete(agent, job) {
	var agentId = agent._id;
	var jobId = job.id;
//	logger.debug("closing all file uploads for: "+jobId+" on agent: "+agentId);
//	if (currentJobs[agentId] && currentJobs[agentId][jobId]) {
//	 	currentJobs[agentId][jobId].uploadComplete=true;
//	 	logger.debug("clearing file check.");
//	 	clearTimeout(currentJobs[agentId][jobId].timeout);
//		clearInterval(currentJobs[agentId][jobId].fileCheck);
//	}
	logger.info("upload completed for: "+job.id+" on agent: "+agentId);
}

exports.uploadComplete = uploadComplete;

function setJobTimer(agent, job) {
	var jobId = job.id;
	var agentId = agent._id;
	//wait and make sure all files get uploaded
	//close all sockets when done.
	timeoutms=300000;//default timeout of 5 minutes
    if (job.options != undefined && job.options.timeoutms != undefined) {
    	timeoutms=job.options.timeoutms;
    }
    if (job && job.files && job.files.length >0 ) {
	   currentJobs[agentId][jobId].timeout = setTimeout(function() {
	   		if (currentJobs[agentId][jobId]) {
		    	clearInterval(currentJobs[agentId][jobId].fileCheck);
		    	currentJobs[agentId][jobId].status=("Timeout - job cancelled");
		    	logger.error("job timed out for: "+jobId);
		        //currentJobs[agentId][jobId].eventSocket.emit('job-cancel',jobId);
		    }
	    }, timeoutms);
	    
	    var checkInterval = 10000; //10 seconds
	    //wait until all files are received
	    
	    var missedHeartbeats =0;
	    currentJobs[agentId][jobId].fileCheck = setInterval(function() {
	    	
	    	if (!currentJobs[agentId][jobId]) {
	    		logger.info(jobId+ " not found.");
	    		clearInterval(this);
	    		return;
	    	}
	    	
	    	maxMissedHeartbeats =10;
	    	agentControl.heartbeat(agent, function(err) {
		    	if (err) {
		    		missedHeartbeats++;
		    		if (missedHeartbeats>= maxMissedHeartbeats) {
				    	logger.info(jobId+" lost contact with agent.");
		    			//for (index in currentJobs[agentId][jobId].fileProgress) {
				    	//	currentJobs[agentId][jobId].fileProgress[index].readStream.close();
				        //}
				        //agentEvents.agentSockets[agentId].fileSocket.close();
				        if (currentJobs[agentId][jobId]) {
					        currentJobs[agentId][jobId].error=true;
					       	clearTimeout(currentJobs[agentId][jobId].timeout);
			    			clearInterval(currentJobs[agentId][jobId].fileCheck);
			    			eventEmitter.emit("job-error",job);
			    			cancelJob(agentId, jobId);
			    		}	
		    		}
		    		return;
		    	}
		    	missedHeartbeats=0;
		    	
		    	if (currentJobs[agentId][jobId] && (
		    	!currentJobs[agentId][jobId].uploadComplete || currentJobs[agentId][jobId].uploadComplete != true)) {
		    		numFilesUploaded=0;
			    	for (index in currentJobs[agentId][jobId].fileProgress) {
			    		var uploadFile = currentJobs[agentId][jobId].fileProgress[index];
			    		if (uploadFile.uploadComplete == true) {
			    		    numFilesUploaded++;
			    		    if (numFilesUploaded >= job.files.length) {
			    		    	logger.info("all files are uploaded.");
			    		    	logger.info(jobId+" all files sent...");
				    			//for (index in currentJobs[agentId][jobId].fileProgress) {
						    	//	currentJobs[agentId][jobId].fileProgress[index].readStream.close();
						        //}
						        //currentJobs[agentId].fileSocket.close();
						        currentJobs[agentId][jobId].uploadComplete=true;
						       	clearTimeout(currentJobs[agentId][jobId].timeout);
				    			clearInterval(currentJobs[agentId][jobId].fileCheck);
				    		}  		
			    		} else if (uploadFile.error == true) {
			    			logger.error(jobId+" error aborting upload.");
			    			uploadFile.socket.emit('client-upload-error', {name: fileName, jobId: jobId, fileSize: fileSizeInBytes, destination: file.destination } );	
			        		//for (index in currentJobs[agentId][jobId].fileProgress) {
					    	//	fileProgress[index].readStream.close();
					    	//	socket.emit('client-upload-error', {name: fileName, jobId: jobId, fileSize: fileSizeInBytes, destination: file.destination } );
					        //}
					        //currentJobs[agentId][jobId].eventSocket.emit('job-cancel',jobId);
			    		}
			    	}
			    	if (currentJobs[agentId][jobId].files != undefined) {
			    		logger.debug(numFilesUploaded+ " of "+job.files.length+" files sent.");
			    	} else {
			    		logger.info("no files defined so none sent.");
			    		//currentJobs[agentId].fileSocket.close();
						currentJobs[agentId][jobId].uploadComplete=true;
		    		}
			    }
	    	});
	    }, checkInterval);
	}
	
}

exports.getRunningJobsList = function(callback) {
	var runningJobs = {}
	async.each(Object.keys(currentJobs), function(agentId, callback) {
		logger.info("getting jobs for: "+agentId);
		agentControl.doesAgentIdExist(agentId, function(err, existingAgent) {
			if (err) {
				if (existingAgent) {
					delete currentJobs[existingAgent._id];
				}
			} else {
				//logger.debug(currentJobs[agentId]);
				for (key in currentJobs[existingAgent._id]) {
					logger.info("found: "+key);
					if (currentJobs[existingAgent._id][key] && currentJobs[existingAgent._id][key].progress
						&& currentJobs[existingAgent._id][key].progress >0 ) {
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

var getDirectoryCompressionStream = function(fstream, callback) {
	
	var agent = this.agent;
	//create agent archive
	logger.info('compressing directory to stream');
	return fstream.Reader({ 'path': file, 'type': 'Directory' }) /* Read the source directory */
	.pipe(tar.Pack()) /* Convert the directory to a .tar file */
	.pipe(zlib.Gzip());
	callback();
	
};