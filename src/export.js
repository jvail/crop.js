if (ENVIRONMENT_IS_NODE) {

  var fs = require('fs');
  exports.Configuration = Configuration;
  exports.config = example_config;

} else if (ENVIRONMENT_IS_WORKER) {

  crop.Configuration = Configuration;
  crop.config = example_config;
  var fs = null;

  onmessage = function (evt) {
    if (evt.data.hasOwnProperty('run')) {
      var config = evt.data.run;
      /* callbacks vis importScript */
      var cfg = new Configuration(config.weather, config.debug, config.verbose, callbacks || []);
      postMessage(cfg.run(config.sim, config.siteAndProd));
    } else {
      postMessage(null);
    }
  };

} else {

  crop.Configuration = Configuration;
  crop.config = example_config;
  var fs = null;

}
