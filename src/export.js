if (ENVIRONMENT_IS_NODE) {

  var fs = require('fs');
  var sql = require('./sql.js');
  var filebuffer = fs.readFileSync('./monica.sqlite');
  var db = new sql.Database(filebuffer);
  exports.Configuration = Configuration;
  exports.config = example_config;
  exports.db = db;

} else if (ENVIRONMENT_IS_WORKER) {

  importScripts('./sql.js');
  var db = null;
  var req = new XMLHttpRequest();
  req.open('GET', './monica.sqlite', true);
  req.responseType = "arraybuffer";
  req.onload = function (evt) {
    var arrayBuffer = req.response;
    if (arrayBuffer) {
      var byteArray = new Uint8Array(arrayBuffer);
      db = new SQL.Database(byteArray);  
      monica.db = db;
    }
  };
  req.send(null);

  monica.Configuration = Configuration;
  monica.config = example_config;
  var fs = null;

  onmessage = function (evt) {
    if (evt.data.hasOwnProperty('sql')) {
      postMessage(monica.db.exec(evt.data.sql));
    } else if (evt.data.hasOwnProperty('run')) {
      var config = evt.data.run;
      var cfg = new Configuration(null, config.weather, config.debug);
      postMessage(cfg.run(config.sim, config.site, config.crop));
    } else {
      postMessage(null);
    }
  };

} else {

  /* we expect that window.SQL is available */
  var db = null;
  var req = new XMLHttpRequest();
  req.open('GET', './monica.sqlite', true);
  req.responseType = "arraybuffer";
  req.onload = function (evt) {
    var arrayBuffer = req.response;
    if (arrayBuffer) {
      var byteArray = new Uint8Array(arrayBuffer);
      db = new SQL.Database(byteArray);  
      monica.db = db;
    }
  };
  req.send(null);

  monica.Configuration = Configuration;
  monica.config = example_config;
  var fs = null;

}
