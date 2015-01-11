var logger=require('./log-control').logger;
var fs = require('fs');
var os = require("os")
var filepath = require('path');
var url = require('url') ;
var mkdirp = require('mkdirp');
var mime = require('mime');
var repoControl = require('./repository-control');



getDirTree= function(dir, callback) {
	logger.info("loading dir: "+dir);
	var tree=  dirTree(dir);
	callback(undefined, tree);
};

exports.getDirTree = getDirTree;

dirTree = function (filename) {
	filename = fs.realpathSync(filename);
	logger.debug("basename="+filepath.basename(filename)+" filename="+filename+" hidden file="+isUnixHiddenPath(filename));
	if (fs.existsSync(filename)) {
	    var stats = fs.lstatSync(filename),
	    info = {
	        path: filename,
	        label: filepath.basename(filename),
	        ext:  filepath.extname(filename)
	    };
	    
	
	    if (stats.isDirectory()) {
	        info.type = "folder";
	        info.children = [];
	        fs.readdirSync(filename).map(function(child) {
	        	if (!isUnixHiddenPath(child)) {
	        		info.children.push(dirTree(filename + '/' + child));
	        		//return dirTree(filename + '/' + child);
	        	}
	        });
	        
	    } else {
	        // Assuming it's a file. In real life it could be a symlink or
	        // something else!
	        info.type = "file";
	    	//return path.basename(filename);
	    }
	    console.log(info);
	    return info;
	}    

    
};

var isUnixHiddenPath = function (path) {
    return (/(^|.\/)\.+[^\/\.]/g).test(path);
};

if (module.parent == undefined) {
    // node dirTree.js ~/foo/bar
    var util = require('util');
    logger.info(util.inspect(dirTree(process.argv[2]), false, null));
}

saveFile = function(file, data, res) {

	fs.writeFile(file, data, function(err) {
	    if(err) {
	        res.json({
	        	message: err.msg
	        });
	    } else {
	    	res.json({
	        	message: 'File Saved.'
	        });
	    }
	});
};

exports.deleteFile = function(filename, callback) {

	logger.debug("deleting: "+filename);
	stat = fs.statSync(filename);
	
	if (stat.isDirectory()) {
		logger.debug("recursively deleting directory");
		rmdir = require('rimraf');
		rmdir(filename, function(err){
			if (err) {
				callback(new Error("unable to delete: "+filename));
				return;
			}
			callback();
		});
	} else {

		fs.unlink(filename, function(err) {
			if (err) {
				callback(new Error("unable to delete: "+filename));
				return;
			}
			callback();
		});
	}
}

exports.addFile = function(addPath, fileName, isDirectory, callback) {
	
	
	//create the directory if it does not exist
	var isNewDirectory = (isDirectory === 'true' || isDirectory === true );
	var newPath = addPath;
	var absolutePath = filepath.resolve(addPath+filepath.sep+fileName);
	var fileType = 'file'
	if (isNewDirectory == true) {
		newPath = absolutePath;
		fileType='folder';
	}
	var fileInfo = {
        path: absolutePath,
        label: filepath.basename(absolutePath),
        ext:  filepath.extname(absolutePath),
        type: fileType
    };
	//logger.debug('isNewDirectory='+isNewDirectory+' path='+newPath);
	fs.stat(newPath, function (err, stat) {
	   //logger.debug(stat);
       if (err) {
         logger.error(err);
          // file does not exist
          if (err.errno == 2 || err.errno == 34) {
        		logger.info("download dir does not exist - creating dir: "+newPath);
	        	mkdirp.sync(newPath, function (err) {
            	  if (err) {
        		    logger.error(err);
        		     callback(new Error("unable to create: "+newPath),fileInfo);
        		     return;
        		  } else {
        		    logger.info('Directory ' + newPath + ' created.');
        		  }
	            
	            });
          } else {
          	logger.error("unable to create dir: "+newPath);
          	callback(new Error("unable to create dir: "+newPath),fileInfo);
          	return;
          }
        } else if (isNewDirectory == true) {
        	logger.error("unable to create dir: "+newPath);
          	callback(new Error("unable to create dir: "+newPath),fileInfo);
          	return;
        }
        if (isNewDirectory != true && fileName != undefined) {
		
		
		if (fs.existsSync(absolutePath)) {
		    logger.error(absolutePath+" already exists");
		    callback(new Error(absolutePath+" already exists"),fileInfo);
		    return;
		} else {
			logger.info("creating file: "+absolutePath);
			try {
				fs.writeFileSync(absolutePath,"{}");
			} catch (err) {
				callback(err,fileInfo);
				return;
			}
			
		}
	}
	
	callback(undefined, fileInfo);	
	});

};

exports.load = function(repoURL, callback) {
	repoControl.getFilePath(repoURL, function(err, filePath) {
		if (err) {
			callback(err);
			return;
		}
		if (fs.existsSync(filePath)) {
	
		fs.readFile(filePath, 'utf8', function (err,data) {
		  if (err) {
		    return logger.error(err.message);
		    callback(err);
		  }
		  console.log(data);
		  callback(undefined, data);
		});
		
		} else {
			callback(new Error('job does not exist: '+repoURL));
		}
	});

	
	
	
}

fileContent = function (filePath,repo,callback) {
	require('istextorbinary').isText(filePath, new Buffer(8), function(err, result){
		if (err) {
			callback(err,undefined);
			return;
		}
		logger.debug(result);
		var stat = fs.statSync(filePath);
		if (!stat.isDirectory()) {
			var headers = {
	        	'Content-Type': mime.lookup(filePath),
	        	'Content-Length': stat.size
	    	}
    		callback(undefined, headers, filePath);
    	} else{ 
    		callback(new Error("file is a directory" ,undefined));
    	}
		return;
	});

	//callback(new Error("unable to retrieve file content"),undefined,undefined);
};
exports.fileContent=fileContent;

exports.dirTree = dirTree;
exports.saveFile = saveFile;
