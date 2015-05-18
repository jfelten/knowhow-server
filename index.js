var serverData = require('yargs').argv;
var KHServer = require('./server');

var port=3001;

if (serverData.port) {
	port = serverData.port;
}

var server = new KHServer(port, function(err) {
	
});