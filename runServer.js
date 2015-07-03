var respawn = require('respawn')

var monitor = respawn(['node', 'index.js'], {
  env: {ENV_VAR:'test'}, // set env vars
  cwd: '.',              // set cwd
  maxRestarts: -1,        // how many restarts are allowed within 60s
                         // or -1 for infinite restarts
  sleep:1000,            // time to sleep between restarts,
  kill:30000            // wait 30s before force killing after stopping
});

var buf = [];
monitor.on('stdout', function(data) {
    buf.push(data);
    console.log(Buffer.concat(buf).toString('utf-8'))
  });
  
monitor.on('stderr', function(data) {
    buf.push(data);
    console.log(Buffer.concat(buf).toString('utf-8'))
  });
  

monitor.start() // spawn and watch

exports.restart = function() {
	
	// hard restart (wait for old process to die)
	monitor.stop(function() {
	  monitor.start()
	});
}