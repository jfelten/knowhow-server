connect = require('connect');
socketio = require('socket.io');
var logger = require('winston');
var io;
var fs = require('fs');
var filePath = require('path');

fileName = filePath.join(fs.realpathSync(require('process').cwd()), 'server.log');
logger.info("saving standard out to: "+fileName);

logger.setLevels({debug:0,info: 1,silly:2,warn: 3,error:4,});
logger.addColors({debug: 'green',info:  'cyan',silly: 'magenta',warn:  'yellow',error: 'red'});
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, { level: 'debug', colorize:true });
logger.add(logger.transports.File, { filename: fileName });
exports.logger = logger;

LoggerControl = function(io) {
	logger.info('setting event io to:'+io);
	this.io = io.of('/logs');
	logger.info("Logger initializing.");
	fs.exists(fileName, function(exists) {
	    if (exists) {
	    	Tail = require('tail').Tail;
	    	tail = new Tail(fileName);
	    	tail.on('line', function(data) {
	    		io.sockets.emit('new-data', {
	    			channel: 'stdout',
	    			    value: data
	    		});
	    		  
	    	});
	    }
	});
	


	io.sockets.on('connection', function (socket) {
//		getLastXLogs(20, io);
//		logger.info("tail file #{fileName");
//		socket.emit('new-data', {
//			channel: 'stdout',
//			value: "tail file #{fileName"
//		});
	    
	});
	
};

getLastXLogs = function(numLines,res) {
	var options = {
		    limit: numLines,
		    start: 0,
		    order: 'desc',
		    fields: ['level','timestamp','message']
		  };
	
		  logger.query(options, function (err, results) {
		    if (err) {
		      throw err;
		    }
		    res.json(results);
		  });
};

LoggerControl.prototype.getLastXLogs = getLastXLogs;
exports.getLastXLogs = getLastXLogs;
exports.LoggerControl = LoggerControl;
logger.info("Logger initialized.");


