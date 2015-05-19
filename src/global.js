/* math, constants and helper functions */

var ENVIRONMENT_IS_NODE = (typeof process === 'object' && typeof require === 'function')
  , ENVIRONMENT_IS_WEB = (typeof window === 'object')
  , ENVIRONMENT_IS_WORKER = (typeof importScripts === 'function')
  ;

var DEBUG   = false /* strip debug in minified code */
  , VERBOSE = true 
  ;

var MSG_INFO  = 0
  , MSG_WARN  = 1
  , MSG_ERROR = 2
  , MSG_DEBUG = 3
  ;

var ORGAN_ROOT    = 0
  , ORGAN_LEAF    = 1
  , ORGAN_STEM    = 2
  , ORGAN_STORAGE = 3
  ;

var abs    = Math.abs
  , acos   = Math.acos
  , asin   = Math.asin
  , atan   = Math.atan
  , ceil   = Math.ceil
  , cos    = Math.cos
  , exp    = Math.exp
  , floor  = Math.floor
  , toInt    = function (x) {
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
  , MS_PER_DAY    = 1000 * 60 * 60 * 24
  , SEC_PER_HOUR  = 60 * 60
  , SQM_PER_HA    = 10000
    /* [MJ m-2] to [μmol (PAR photons) m-2] */
  , PPF_PER_MJ_GLOBAL_RADIATION = 0.5 * 1e6 / 0.218
  ;

/* C_amb_ref [μmol (CO2) mol-1]  reference ambient CO2 concentration */
var C_amb_ref = 380;

/* Y growth efficiencies. Thornley JHM & Johnson IR (2000), s. 351f */
var Y_cellulose     = 0.95  // 1 - (30 / 44) * (0.018 / 0.226)
  , Y_hemicellulose = 0.94  // 1 - (30 / 44) * (0.015 / 0.167)
  , Y_starch        = 0.95  // 1 - (30 / 44) * (0.013 / 0.161)
  , Y_sucrose       = 0.95  // 1 - (30 / 44) * (0.004 / 0.060)
  , Y_protein_N03   = 0.58  // 1 - (30 / 44) * (0.263 / 0.422) // from nitrate
  , Y_protein_NH4   = 0.84  // 1 - (30 / 44) * (0.069 / 0.290) // from ammonium
  , Y_lignin        = 0.83  // 1 - (30 / 44) * (0.045 / 0.181)
  , Y_lipids        = 0.68  // 1 - (30 / 44) * (0.066 / 0.142)
  , Y_ash           = 1.00  
  , Y_sc            = 0.85  // Johnson (2013) 
  , Y_nc            = 0.95  // non-structural carbon hydrates
  , Y_pn            = 0.55  // Johnson (2013)
  ;

/* carbon fractions [kg (C) kg (d.wt)] */
var fC_cellulose      = 0.44
  , fC_hemicellulose  = 0.40
  , fC_starch         = 0.44
  , fC_sucrose        = 0.42
  , fC_protein        = 0.53
  , fC_lignin         = 0.67
  , fC_lipids         = 0.77
  , fC_ash            = 0.00
  ;

/* carbon fraction carbon hydrate pools [kg (C) kg (d.wt)] */
var fC_sc = 0.6 * fC_cellulose + 0.2 * fC_hemicellulose + 0.2 * fC_lignin
  , fC_nc = 0.7 * fC_starch + 0.3 * fC_sucrose
  , fC_ld = fC_lipids
  , fC_pn = fC_protein
  ;

/* nitrogen fraction in protein [kg (N) kg (d.wt)] */
var fN_pn = 0.16; 

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
  , DAYLENGTH: 8      /* [seconds]      daylength. required by grassland model */
  , F_DIRECTRAD: 9    /* [h h-1]        fraction direct solar radiation. required by grassland model */
  , ISODATESTRING: 10 /* ISO date string */
  , DOY: 11           /* day of year */
  , EXRAD: 12         /* [MJ m-2] extraterrestrial radiation */
};

// TODO: do not change JS types. Instead create own type.

Date.prototype.isValid = function () { 
  return (this.toDateString() !== 'Invalid Date'); 
};

Date.prototype.isLeapYear = function () { 
  return (ceil((new Date(this.getFullYear() + 1, 0, 1) - new Date(this.getFullYear(), 0, 1)) / MS_PER_DAY) === 366); 
};

/* log function */
var logger = function (type, msg) {

  if (ENVIRONMENT_IS_WORKER) {

    if (!(type === MSG_INFO && !VERBOSE)) {

      if (typeof msg === 'object')
        msg = JSON.stringify(msg, null, 2);

      switch(type) {
        case MSG_INFO:
          postMessage({ msg: msg, type: 'info' });
          break;
        case MSG_WARN:
          postMessage({ msg: msg, type: 'warn' });
          break;
        case MSG_ERROR:
          postMessage({ msg: msg, type: 'error' });
          break;
        case MSG_DEBUG:
          postMessage({ msg: msg, type: 'debug' });
          break;
        default:
          postMessage({ msg: msg, type: 'info' });
      }

    }

  } else {

    if (!(type === MSG_INFO && !VERBOSE)) {

      if (typeof msg === 'object')
        msg = JSON.stringify(msg, null, 2);

      switch(type) {
        case MSG_INFO:
          console.log('info: ' + msg);
          break;
        case MSG_WARN:
          console.log('warn: ' + msg);
          break;
        case MSG_ERROR:
          console.log('error: ' + msg);
          break;
        case MSG_DEBUG:
          console.log('debug: ' + msg);
          break;
        default:
          console.log(msg);
      }

    }

  }

  if (type === MSG_ERROR) {
    throw new Error(
      ((typeof msg === 'object' && msg !== null) ?
      JSON.stringify(msg, null, 2) : msg)
    );
  }

};

