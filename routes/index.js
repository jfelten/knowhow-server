var logger=require('./log-control').logger;
/*
 * GET home page.
 */

exports.index = function(req, res){
  res.render('index');
};

exports.partials = function (req, res) {
  var name = req.params.name;
  res.render('partials/' + name);
};

exports.modals = function (req, res) {
  var name = req.params.name;
  res.render('modals/' + name);
};