/* math, constants and helper functions */

var ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function'
  , ENVIRONMENT_IS_WEB = typeof window === 'object'
  , ENVIRONMENT_IS_WORKER = typeof importScripts === 'function'
  ;

var DEBUG = false
  , VERBOSE = true 
  ;

var MSG = {
    INFO: 0
  , WARN: 1
  , ERROR: 2
  , DEBUG: 3
};

var ROOT = 0
  , LEAF = 1
  , SHOOT = 2 /* seems not correct: means stem */
  , STORAGE_ORGAN = 3
  ;

var abs    = Math.abs
  , acos   = Math.acos
  , asin   = Math.asin
  , atan   = Math.atan
  , ceil   = Math.ceil
  , cos    = Math.cos
  , exp    = Math.exp
  , floor  = Math.floor
  , int    = function (x) {
      return x | 0;
    }
  , log    = Math.log
  , log10  = function (x) { 
      return Math.log(x) / Math.LN10; 
    }
  , max    = Math.max
  , min    = Math.min
  , pow    = Math.pow
  , round  = Math.round
  , fixed  = function (n, x) {
      if (x === null) return x; 
      return x.toFixed(n);
    }
  , roundN = function (n, x) { 
      return parseFloat(x.toFixed(n));
    }
  , sin    = Math.sin
  , sqrt   = Math.sqrt
  , sum    = function (array) {
      return array.reduce(function (a, b) { return a + b; } );
    }
  , tan    = Math.tan
  , PI     = Math.PI
  , MS_PER_DAY = 1000 * 60 * 60 * 24
  , SQM_PER_HA = 10000
  ;

var ORGANIC_CONSTANTS = {
    PO_UREAMOLECULARWEIGHT: 0.06006 //[kg mol-1]
  , PO_UREA_TO_N: 0.46667 //Converts 1 kg urea to 1 kg N
  , PO_NH3MOLECULARWEIGHT: 0.01401 //[kg mol-1]
  , PO_NH4MOLECULARWEIGHT: 0.01401 //[kg mol-1]
  , PO_H2OIONCONCENTRATION: 1.0
  , PO_PKAHNO2: 3.29 // [] pKa value for nitrous acid
  , PO_PKANH3: 6.5 // [] pKa value for ammonium
  , PO_SOM_TO_C: 0.57 //: 0.58, // [] converts soil organic matter to carbon
  , PO_AOM_TO_C: 0.45 // [] converts added organic matter to carbon
};

var WEATHER = {
    TMIN: 0
  , TMAX: 1
  , TAVG: 2
  , GLOBRAD: 3
  , WIND: 4
  , PRECIP: 5
  , SUNHOURS: 6
  , RELHUMID: 7
  , PPF: 8            /* [μmol m-2 d-1] photosynthetic photon flux. required by grassland model */
  , DAYLENGTH: 9      /* [seconds]      daylength. required by grassland model */
  , F_DIRECTRAD: 10   /* [h h-1]        fraction direct solar radiation. required by grassland model */
  , ISODATESTRING: 11 /* ISO date string */
  , DOY: 12           /* day of year */
  , EXRAD: 13         /* [MJ m-2] extraterrestrial radiation */
};

// TODO: do not change JS types. Instead create own type.

Date.prototype.isValid = function () { 
  return (this.toDateString() !== 'Invalid Date'); 
};

Date.prototype.isLeapYear = function () { 
  return (ceil((new Date(this.getFullYear() + 1, 0, 1) - new Date(this.getFullYear(), 0, 1)) / (24 * 60 * 60 * 1000)) === 366); 
};

/* log function */
var logger = function (type, msg) {


  if (ENVIRONMENT_IS_WORKER) {

    if (!(type === MSG.INFO && !VERBOSE)) {

      if (typeof msg === 'object')
        msg = JSON.stringify(msg, null, 2);

      switch(type) {
        case MSG.INFO:
          postMessage({ info: msg });
          break;
        case MSG.WARN:
          postMessage({ warn: msg });
          break;
        case MSG.ERROR:
          postMessage({ error: msg });
          break;
        case MSG.DEBUG:
          postMessage({ debug: msg });
          break;
        default:
          postMessage({ msg: msg });
      }

    }

  } else {

    if (!(type === MSG.INFO && !VERBOSE)) {

      if (typeof msg === 'object')
        msg = JSON.stringify(msg, null, 2);

      switch(type) {
        case MSG.INFO:
          console.log('info: ' + msg);
          break;
        case MSG.WARN:
          console.log('warn: ' + msg);
          break;
        case MSG.ERROR:
          console.log('error: ' + msg);
          break;
        case MSG.DEBUG:
          console.log('debug: ' + msg);
          break;
        default:
          console.log(msg);
      }

    }

  }

};

