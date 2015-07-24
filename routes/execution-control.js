
var logger=require('./log-control').logger;

var http = require('http');
var repoControl = require('./repository-control');
var ss = require('socket.io-stream');
var zlib = require('zlib');
var fstream = require('fstream');
var tar = require('tar');
var domain = require('domain');
var async = require('async');
var agentUtils = require('./agent/agent-utils');

var pathlib = require('path');
var currentJobs = {};

var checkFiles = function(job, callback) {
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

var replaceVars = function(input, envVars) {
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


var executeJob = function(agent,job,callback,onCompleteCallback) {
	var eventEmitter = this.agentEventHandler.eventEmitter;
	var agentEventHandler = this.agentEventHandler;
	var jobControl = this.jobControl;
	var currentJobs = this.jobControl.currentJobs;
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
	
	        jobControl.cancelJobOnAgent(agent,job, eventEmitter, agentEventHandler.agentSocket[agent._id].eventSocket,function() {
	        	//cancelJob(agent._id,job.id);
	        });
	        
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
	    	this.jobControl.initiateJob(agent, job, agentEventHandler.eventEmitter, function(err) {//cancel the existing job if it is running
	    		if (err) {
	    			callback(err);
	    			return;
	    		}
	    		logger.info("job: "+job.id+" initialized on: "+agent.host+":"+agent.port);
	    		currentJobs[agentId][jobId] = job;
	    		currentJobs[agentId].agent=agent;
	    		currentJobs[agentId][jobId].callback = onCompleteCallback;
				// do the POST call
				var reqPost = http.request(options, function(res) {
					logger.debug("statusCode: ", res.statusCode);
				    // uncomment it for header details
					//logger.debug("headers: ", res.headers);
			
					 
			
				    res.on('data', function(d) {
				    	//logger.debug('result:\n');
				        //process.stdout.write(d+'\n');
				        if (res.statusCode != 200) {
						 	logger.error("Unable to execute Job. Response code:"+res.statusCode);
						 	
						 	callback(new Error(d.message));
						 	return;
						 }
				        logger.debug('\n\nJob request sent. Listening for events and uploading files');
				        job.status="initializing job"
				        job.progress=1;
				        eventEmitter.emit('job-start',agent,job);
			        
					
				    //do the work
	
						
						
				   		uploadFiles(agent, job, jobControl, agentEventHandler, function(err) {
				    			if (err) {
				    				callback(err);
				    				return;
				    			} else {
				    				setJobTimer(agent, this.jobControl, eventEmitter, job);
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

	
function uploadFiles(agent,job, agentEventHandler, jobControl, callback) {
	logger.info("uploading files for: "+job.id+" to "+agent.host+":"+agent.port);
 	var agentId = agent._id;
	var jobId=job.id;
	if (!job || !job.files || job.files == null) {
		callback();
		return;
	}
	jobControl.currentJobs[agentId][jobId].fileProgress = {};
	async.eachSeries(job.files, function(file,fcallback) {
	    
		var file = files[uploadFile];
		var filepath= repoControl.getFilePath(file.source, function(err, filepath) {
			if (err) {
				logger.error(err.message);
				fcallback(err);
				return;
			}
			var fileName = pathlib.basename(filepath);
			jobControl.currentJobs[agentId][jobId].fileProgress[fileName] = {}
		    jobControl.currentJobs[agentId][jobId].fileProgress[fileName].fileName=fileName;
			
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
						jobControl.currentJobs[agentId][jobId].gzip = zlib.Gzip();
						jobControl.currentJobs[agentId][jobId].tar = tar.Pack();
						jobControl.currentJobs[agentId][jobId].fileProgress[fileName].readStream = fstream.Reader({ 'path': filepath, 'type': 'Directory' })
						.pipe(jobControl.currentJobs[agentId][jobId].tar).on('error', function(err) {/* Convert the directory to a .tar file */
							logger.error("tar pack interrupted: "+err.message);
						}) 
						.pipe(jobControl.currentJobs[agentId][jobId].gzip).on('error', function(err) {
							logger.error("gzip compression interrupted: "+err.message);
						});
					} else {
						//jobControl.currentJobs[agentId][jobId].fileProgress[fileName].readStream = fs.createReadStream(filepath,{autoClose: true, highWaterMark: 32 * 1024});
						jobControl.currentJobs[agentId][jobId].gzip = zlib.Gzip();
						jobControl.currentJobs[agentId][jobId].fileProgress[fileName].readStream = fstream.Reader(filepath)
						.pipe(jobControl.currentJobs[agentId][jobId].gzip).on('error', function(err) {
							logger.error("gzip compression interrupted: "+err.message);
						});
					}
					ss(agentEventHandler.agentSockets[agentId].fileSocket).emit('agent-upload', stream, {name: fileName, jobId: jobId, fileSize: fileSizeInBytes, destination: file.destination, isDirectory: isDirectory });
					jobControl.currentJobs[agentId][jobId].fileProgress[fileName].readStream.pipe(stream );
					fcallback();
				} else {
					throw new Error(filepath+" does not exist");
				}
			    
			} catch(err) {
				logger.error(err.message+" "+err.call+" "+err.sys);
				logger.error(err.stack);
				
			    repoControl.getFilePath(files[uploadFile].source, function(error, badFile) {
				
					if (agentEventHandler.agentSockets[agentId].fileSocket) {
						agentEventHandler.agentSockets[agentId].fileSocket.emit('client-upload-error', {name: fileName, jobId: jobId, fileSize: fileSizeInBytes, destination: file.destination } );
					} else {
						logger.error("unable to notify server of upload failure");
					}
			    });
				
				
	        //    jobControl.currentJobs[agentId][jobId].fileProgress.error=true;
	        //    logger.error('requesting cancel of: '+jobId);
			//	jobControl.currentJobs[agentId].eventSocket.emit('job-cancel',jobId);
			//	cancelJob(agent, job);
			//	callback(new Error("Problem starting file upload"));
			    
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
//	if (jobControl.currentJobs[agentId] && jobControl.currentJobs[agentId][jobId]) {
//	 	jobControl.currentJobs[agentId][jobId].uploadComplete=true;
//	 	logger.debug("clearing file check.");
//	 	clearTimeout(jobControl.currentJobs[agentId][jobId].timeout);
//		clearInterval(jobControl.currentJobs[agentId][jobId].fileCheck);
//	}
	logger.info("upload completed for: "+job.id+" on agent: "+agentId);
}

exports.uploadComplete = uploadComplete;

function setJobTimer(agent, jobControl, eventEmitter, job) {

	var jobId = job.id;
	var agentId = agent._id;
	//wait and make sure all files get uploaded
	//close all sockets when done.
	timeoutms=300000;//default timeout of 5 minutes
    if (job.options != undefined && job.options.timeoutms != undefined) {
    	timeoutms=job.options.timeoutms;
    }
    if (job && job.files && job.files.length >0 ) {
	   jobControl.currentJobs[agentId][jobId].timeout = setTimeout(function() {
	   		if (jobControl.currentJobs[agentId][jobId]) {
		    	clearInterval(jobControl.currentJobs[agentId][jobId].fileCheck);
		    	jobControl.currentJobs[agentId][jobId].status=("Timeout - job cancelled");
		    	logger.error("job timed out for: "+jobId);
		        //currentJobs[agentId][jobId].eventSocket.emit('job-cancel',jobId);
		    }
	    }, timeoutms);
	    
	    var checkInterval = 10000; //10 seconds
	    //wait until all files are received
	    
	    var missedHeartbeats =0;
	    console.log(jobControl.currentJobs);
	    if ( jobControl.currentJobs[agentId][jobId] && jobControl.currentJobs[agentId][jobId].files &&  jobControl.currentJobs[agentId][jobId].files.length >0) {
		    jobControl.currentJobs[agentId][jobId].fileCheck = setInterval(function() {
		    	
		    	if (!jobControl.currentJobs[agentId][jobId]) {
		    		logger.info(jobId+ " not found.");
		    		clearInterval(this);
		    		return;
		    	}
		    	
		    	maxMissedHeartbeats =10;
		    	agentUtils.heartbeat(agent, function(err) {
			    	if (err) {
			    		missedHeartbeats++;
			    		if (missedHeartbeats>= maxMissedHeartbeats) {
					    	logger.info(jobId+" lost contact with agent.");
			    			//for (index in jobControl.currentJobs[agentId][jobId].fileProgress) {
					    	//	jobControl.currentJobs[agentId][jobId].fileProgress[index].readStream.close();
					        //}
					        //agentEvents.agentSockets[agentId].fileSocket.close();
					        if (jobControl.currentJobs[agentId][jobId]) {
						        jobControl.currentJobs[agentId][jobId].error=true;
						       	clearTimeout(jobControl.currentJobs[agentId][jobId].timeout);
				    			clearInterval(jobControl.currentJobs[agentId][jobId].fileCheck);
				    			eventEmitter.emit("job-error",agent,job);
				    			jobControl.cancelJob(agent, job, eventEmitter);
				    		}	
			    		}
			    		return;
			    	}
			    	missedHeartbeats=0;
			    	
			    	if (jobControl.currentJobs[agentId] && jobControl.currentJobs[agentId][jobId] && (
			    	!jobControl.currentJobs[agentId][jobId].uploadComplete || jobControl.currentJobs[agentId][jobId].uploadComplete != true)) {
			    		numFilesUploaded=0;
				    	for (index in jobControl.currentJobs[agentId][jobId].fileProgress) {
				    		var uploadFile = jobControl.currentJobs[agentId][jobId].fileProgress[index];
				    		if (uploadFile.uploadComplete == true) {
				    		    numFilesUploaded++;
				    		    if (numFilesUploaded >= job.files.length) {
				    		    	logger.info("all files are uploaded.");
				    		    	logger.info(jobId+" all files sent...");
							        jobControl.currentJobs[agentId][jobId].uploadComplete=true;
							       	clearTimeout(jobControl.currentJobs[agentId][jobId].timeout);
					    			clearInterval(currentJobs[agentId][jobId].fileCheck);
					    		}  		
				    		} else if (uploadFile.error == true) {
				    			logger.error(jobId+" error aborting upload.");
				    			uploadFile.socket.emit('client-upload-error', {name: fileName, jobId: jobId, fileSize: fileSizeInBytes, destination: file.destination } );	
				    		}
				    	}
				    	if (currentJobs[agentId] && currentJobs[agentId][jobId].files) {
				    		logger.debug(numFilesUploaded+ " of "+currentJobs[agentId][jobId].files.length+" files sent.");
				    	} else if (currentJobs[agentId] && !currentJobs[agentId][jobId].files) {
				    		logger.info("no files defined so none sent.");
							currentJobs[agentId][jobId].uploadComplete=true;
			    		}
				    }
		    	});
		    }, checkInterval);
		}
	}
	
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

var ExecutionControl = function(server) {

	var self = this;
	
	self.server = server;
	self.jobControl = server.jobControl;
	self.executeJob = executeJob.bind({agentEventHandler: server.agentEventHandler, jobControl: server.jobControl});
	self.uploadComplete = uploadComplete.bind({agentEventHandler: server.agentEventHandler});

	return self;
}	
	
module.exports = ExecutionControl;