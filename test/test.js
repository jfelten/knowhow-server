
require('../server.js')(3001, function(err) {
	if (err) {
		process.exit(1);
	} else {
		process.exit(0);
	}
});