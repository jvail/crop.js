var crop = crop || {};
(function () {

var example_config = {
 "simulation": {
  "time": {
   "startDate": "1991-01-01",
   "endDate": "1992-12-31"
  },
  "switches": {
   "useSecondaryYieldOn": false,
   "nitrogenResponseOn": true,
   "waterDeficitResponseOn": true
  },
  "init": {
   "percentageFC": 1
  }
 },
 "site": {
  "latitude": 52.2,
  "slope": 0,
  "heightNN": 1,
  "horizons": [
   {
    "thickness": 0.2,
    "organicMatter": 0.05,
    "sand": 0.6,
    "clay": 0.05,
    "sceleton": 0.02
   },
   {
    "thickness": 0.5,
    "organicMatter": 0.05,
    "sand": 0.6,
    "clay": 0.05,
    "sceleton": 0.02
   },
   {
    "thickness": 2,
    "organicMatter": 0.05,
    "sand": 0.6,
    "clay": 0.05,
    "sceleton": 0.02
   }
  ]
 },
 "production": {
  "crops": [
   {
    "name": "winter rye",
    "sowingDate": "1991-10-01",
    "plantDryWeight": 225,
    "percNTRansplant": 0.07,
    "finalHarvestDate": "1992-08-01",
    "residuesRemoval": 0.85,
    "tillageOperations": [
     {
      "date": "1991-09-01",
      "method": "Plough",
      "depth": 30
     }
    ],
    "irrigations": [
     {
      "date": "1992-06-01",
      "method": "Sprinkler",
      "eventType": "Fixed",
      "threshold": 0.2,
      "area": 1,
      "amount": 5,
      "NConc": 0
     }
    ],
    "organicFertilisers": [
     {
      "name": "cattle slurry",
      "date": "1992-05-01",
      "method": "Fixed",
      "amount": 30
     }
    ],
    "mineralFertilisers": [
     {
      "name": "Ammonium Nitrate",
      "date": "1992-04-01",
      "method": "Fixed",
      "amount": 40
     }
    ]
   }
  ]
 }
};
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



/* JS debugging */

var debugArgs = function (arguments_, funcName) {

  // TODO: recursive

  if (!DEBUG) return; 

  var args = Array.prototype.slice.call(arguments_)
    , funcName = funcName || ''
    , isInvalid = function (x) {
        if (x instanceof Function)
          return false;
        if (typeof x === 'object') 
          return (x === null || x === undefined);
        if (typeof x === 'string' || x === 'boolean')
          return (x === null || x === undefined);
        return (isNaN(x) || x === null || x === undefined || x === Infinity);
      }
    , doLog = function (x) {
        logger(MSG.DEBUG, funcName + ' args: ' + JSON.stringify(x, null, 2));
      }
    ;

  for (var i = 0, is = args.length; i < is; i++) {
    var arg = args[i];
    if (arg && typeof arg === 'object') {
      if (Array.isArray(arg)) {
        arg.forEach(function (e) {
          if (e && typeof e === 'object') {
            if (isTypedArray(e)) {
              for (var i = 0, is = arg.length; i < is; i++) {
                if (isInvalid(arg[i])) {
                  doLog(arg);
                  throw new Error(arg);
                }
              }
            } else if (Array.isArray(e)) {
              e.forEach(function (e2) {
                if (isInvalid(e2)) {
                  doLog(e);
                  throw new Error(e2);
                }
              });
            } else {
              for (var prop in e) {
                if (e.hasOwnProperty(prop)) {
                  if (isInvalid(e[prop])) {
                    doLog(e);
                    throw new Error(prop);
                  }
                }
              }
            }
          } else {
            if (isInvalid(e)) {
              doLog(arg);
              throw new Error(e);
            }
          }
        });
      } else if (isTypedArray(arg)) {
        for (var i = 0, is = arg.length; i < is; i++) {
          if (isInvalid(arg[i])) {
            doLog(arg);
            throw new Error(arg);
          }
        }
      } else {
        for (var prop in arg) {
          if (arg.hasOwnProperty(prop)) {
            if (isInvalid(arg[prop])) {
              doLog(arg);
              throw new Error(arg);
            }
          }
        }
      }
    } else { 
      if (isInvalid(arg)) {
        doLog(args);
        throw new Error(arg);
      }
    }
  }

};

var isTypedArray = function (x) {
  return (
    x instanceof Int8Array ||
    x instanceof Uint8Array || 
    x instanceof Uint8ClampedArray || 
    x instanceof Int16Array ||
    x instanceof Uint16Array || 
    x instanceof Int32Array ||
    x instanceof Uint32Array ||
    x instanceof Float64Array || 
    x instanceof Float64Array
  );
}

var debug = function () {

  if (!DEBUG) return;

  // check if it is an arguments object
  if (
    typeof arguments[0] === 'object' &&
    arguments[0].length != undefined && 
    !Array.isArray(arguments[0]) &&
    !isTypedArray(arguments[0])
  ) return debugArgs(arguments[0], arguments[1]);

  if (arguments.length === 2) {
    if (typeof arguments[1] === 'string')
      logger(MSG.DEBUG, arguments[1] + ' = ' + ((typeof arguments[0] === 'object') ? JSON.stringify(arguments[0], null, 1) : arguments[0]));
    if (typeof arguments[0] === 'string')
      logger(MSG.DEBUG, arguments[0] + ' = ' + ((typeof arguments[1] === 'object') ? JSON.stringify(arguments[1], null, 1) : arguments[1]));
  } else if (typeof arguments[0] === 'string') {
    logger(MSG.DEBUG, arguments[0]);
  } else {
    logger(MSG.DEBUG, arguments[0]);
  }

};


var tools = {

    /*
      sand [m3 m-3]
      clay [m3 m-3]
    */

    texture2KA5: function (sand, clay) {

      sand = sand * 100;
      clay = clay * 100;

      var textureClass = ''
        , silt = 100 - (sand + clay)
        ;

      if ((sand + clay + silt) != 100)
        throw new Error('(sand + clay + silt) != 100: ' + (sand + clay + silt));

      if (clay <= 5) {

        if (silt <= 10)
          textureClass = 'Ss';
        else if (silt <= 25)
          textureClass = 'Su2';
        else if (silt <= 40)
          textureClass = 'Su3';
        else if (silt <= 50)
          textureClass = 'Su4';
        else if (silt <= 80)
          textureClass = 'Us';
        else
          textureClass = 'Uu';

      } else if (clay <= 8) {
        
        if (silt <= 10)
          textureClass = 'St2';
        else if (silt <= 25)
          textureClass = 'Sl2';
        else if (silt <= 40)
          textureClass = 'Su3';
        else if (silt <= 50)
          textureClass = 'Su4';
        else if (silt <= 80)
          textureClass = 'Us';
        else
          textureClass = 'Uu';

      } else if (clay <= 12) {
        
        if (silt <= 10)
          textureClass = 'St2';
        else if (silt <= 40)
          textureClass = 'Sl3';
        else if (silt <= 50)
          textureClass = 'Slu';
        else if (silt <= 65)
          textureClass = 'Uls';
        else
          textureClass = 'Ut2';
      
      } else if (clay <= 17) {
        
        if (silt <= 10)
          textureClass = 'St2';
        else if (silt <= 40)
          textureClass = 'Sl4';
        else if (silt <= 50)
          textureClass = 'Slu';
        else if (silt <= 65)
          textureClass = 'Uls';
        else
          textureClass = 'Ut3';
      
      } else if (clay <= 25) {

        if (silt <= 15)
          textureClass = 'St3';
        else if (silt <= 30)
          textureClass = 'Ls4';
        else if (silt <= 40)
          textureClass = 'Ls3';
        else if (silt <= 50)
          textureClass = 'Ls2';
        else if (silt <= 65)
          textureClass = 'Lu';
        else
          textureClass = 'Ut4';
      
      } else if (clay <= 30) {

        if (silt <= 15)
          textureClass = 'Ts4';
        else if (silt <= 30)
          textureClass = 'Lts';
        else if (silt <= 50)
          textureClass = 'Lt2';
        else if (silt <= 65)
          textureClass = 'Lu';
        else
          textureClass = 'Tu4';

      } else if (clay <= 35) {

        if (silt <= 15)
          textureClass = 'Ts4';
        else if (silt <= 30)
          textureClass = 'Lts';
        else if (silt <= 50)
          textureClass = 'Lt2';
        else if (silt <= 65)
          textureClass = 'Tu3';
        else
          textureClass = 'Tu4';    
      
      } else if (clay <= 45) {

        if (silt <= 15)
          textureClass = 'Ts3';
        else if (silt <= 30)
          textureClass = 'Lts';
        else if (silt <= 50)
          textureClass = 'Lt3';
        else
          textureClass = 'Tu3';

      } else if (clay <= 65) {
        
        if (silt <= 15)
          textureClass = 'Ts2';
        else if (silt <= 30)
          textureClass = 'Tl';
        else
          textureClass = 'Tu2';

      } else {
        textureClass = 'Tt'
      }

      return textureClass;
    }

  , KA52sand: function (soilTextureClass) {
      
      var x = 0.0;

      if(soilTextureClass == "fS")
        x = 0.84;
      else if(soilTextureClass == "fSms")
        x = 0.86;
      else if(soilTextureClass == "fSgs")
        x = 0.88;
      else if(soilTextureClass == "gS")
        x = 0.93;
      else if(soilTextureClass == "mSgs")
        x = 0.96;
      else if(soilTextureClass == "mSfs")
        x = 0.93;
      else if(soilTextureClass == "mS")
        x = 0.96;
      else if(soilTextureClass == "Ss")
        x = 0.93;
      else if(soilTextureClass == "Sl2")
        x = 0.76;
      else if(soilTextureClass == "Sl3")
        x = 0.65;
      else if(soilTextureClass == "Sl4")
        x = 0.60;
      else if(soilTextureClass == "Slu")
        x = 0.43;
      else if(soilTextureClass == "St2")
        x = 0.84;
      else if(soilTextureClass == "St3")
        x = 0.71;
      else if(soilTextureClass == "Su2")
        x = 0.80;
      else if(soilTextureClass == "Su3")
        x = 0.63;
      else if(soilTextureClass == "Su4")
        x = 0.56;
      else if(soilTextureClass == "Ls2")
        x = 0.34;
      else if(soilTextureClass == "Ls3")
        x = 0.44;
      else if(soilTextureClass == "Ls4")
        x = 0.56;
      else if(soilTextureClass == "Lt2")
        x = 0.30;
      else if(soilTextureClass == "Lt3")
        x = 0.20;
      else if(soilTextureClass == "LtS")
        x = 0.42;
      else if(soilTextureClass == "Lu")
        x = 0.19;
      else if(soilTextureClass == "Uu")
        x = 0.10;
      else if(soilTextureClass == "Uls")
        x = 0.30;
      else if(soilTextureClass == "Us")
        x = 0.31;
      else if(soilTextureClass == "Ut2")
        x = 0.13;
      else if(soilTextureClass == "Ut3")
        x = 0.11;
      else if(soilTextureClass == "Ut4")
        x = 0.09;
      else if(soilTextureClass == "Utl")
        x = 0.19;
      else if(soilTextureClass == "Tt")
        x = 0.17;
      else if(soilTextureClass == "Tl")
        x = 0.17;
      else if(soilTextureClass == "Tu2")
        x = 0.12;
      else if(soilTextureClass == "Tu3")
        x = 0.10;
      else if(soilTextureClass == "Ts3")
        x = 0.52;
      else if(soilTextureClass == "Ts2")
        x = 0.37;
      else if(soilTextureClass == "Ts4")
        x = 0.62;
      else if(soilTextureClass == "Tu4")
        x = 0.05;
      else if(soilTextureClass == "L")
        x = 0.35;
      else if(soilTextureClass == "S")
        x = 0.93;
      else if(soilTextureClass == "U")
        x = 0.10;
      else if(soilTextureClass == "T")
        x = 0.17;
      else if(soilTextureClass == "HZ1")
        x = 0.30;
      else if(soilTextureClass == "HZ2")
        x = 0.30;
      else if(soilTextureClass == "HZ3")
        x = 0.30;
      else if(soilTextureClass == "Hh")
        x = 0.15;
      else if(soilTextureClass == "Hn")
        x = 0.15;
      else
        x = 0.66;

      return x;
    }

  , KA52clay: function (soilTextureClass) {
      
      var x = 0.0;

      if(soilTextureClass == "fS")
        x = 0.02;
      else if(soilTextureClass == "fSms")
        x = 0.02;
      else if(soilTextureClass == "fSgs")
        x = 0.02;
      else if(soilTextureClass == "gS")
        x = 0.02;
      else if(soilTextureClass == "mSgs")
        x = 0.02;
      else if(soilTextureClass == "mSfs")
        x = 0.02;
      else if(soilTextureClass == "mS")
        x = 0.02;
      else if(soilTextureClass == "Ss")
        x = 0.02;
      else if(soilTextureClass == "Sl2")
        x = 0.06;
      else if(soilTextureClass == "Sl3")
        x = 0.10;
      else if(soilTextureClass == "Sl4")
        x = 0.14;
      else if(soilTextureClass == "Slu")
        x = 0.12;
      else if(soilTextureClass == "St2")
        x = 0.11;
      else if(soilTextureClass == "St3")
        x = 0.21;
      else if(soilTextureClass == "Su2")
        x = 0.02;
      else if(soilTextureClass == "Su3")
        x = 0.04;
      else if(soilTextureClass == "Su4")
        x = 0.04;
      else if(soilTextureClass == "Ls2")
        x = 0.21;
      else if(soilTextureClass == "Ls3")
        x = 0.21;
      else if(soilTextureClass == "Ls4")
        x = 0.21;
      else if(soilTextureClass == "Lt2")
        x = 0.30;
      else if(soilTextureClass == "Lt3")
        x = 0.40;
      else if(soilTextureClass == "Lts")
        x = 0.35;
      else if(soilTextureClass == "Lu")
        x = 0.23;
      else if(soilTextureClass == "Uu")
        x = 0.04;
      else if(soilTextureClass == "Uls")
        x = 0.12;
      else if(soilTextureClass == "Us")
        x = 0.04;
      else if(soilTextureClass == "Ut2")
        x = 0.10;
      else if(soilTextureClass == "Ut3")
        x = 0.14;
      else if(soilTextureClass == "Ut4")
        x = 0.21;
      else if(soilTextureClass == "Utl")
        x = 0.23;
      else if(soilTextureClass == "Tt")
        x = 0.82;
      else if(soilTextureClass == "Tl")
        x = 0.55;
      else if(soilTextureClass == "Tu2")
        x = 0.55;
      else if(soilTextureClass == "Tu3")
        x = 0.37;
      else if(soilTextureClass == "Ts3")
        x = 0.40;
      else if(soilTextureClass == "Ts2")
        x = 0.55;
      else if(soilTextureClass == "Ts4")
        x = 0.30;
      else if(soilTextureClass == "Tu4")
        x = 0.30;
      else if(soilTextureClass == "L")
        x = 0.31;
      else if(soilTextureClass == "S")
        x = 0.02;
      else if(soilTextureClass == "U")
        x = 0.04;
      else if(soilTextureClass == "T")
        x = 0.82;
      else if(soilTextureClass == "HZ1")
        x = 0.15;
      else if(soilTextureClass == "HZ2")
        x = 0.15;
      else if(soilTextureClass == "HZ3")
        x = 0.15;
      else if(soilTextureClass == "Hh")
        x = 0.1;
      else if(soilTextureClass == "Hn")
        x = 0.1;

      return x;
    }

    /* 
      Bodenkundliche Kartieranleitung (2005) S.125 

      Estimate raw density ("Trockenrohdichte") from "effektive Lagerungsdichte"

      TODO: ldEff unit?
    */

  , ld_eff2trd: function (ldEff, clay) {
      
      var x = 0.0;

      switch (ldEff)
      {
      case 1:
        x = 1.3;
        break;
      case 2:
        x = 1.5;
        break;
      case 3:
        x = 1.7;
        break;
      case 4:
        x = 1.9;
        break;
      case 5:
        x = 2.1;
        break;
      default: // JS!
        x = 1.7;      
      }

      return x - (0.9 * clay);
    }
  ,
    saxton: function (sand, clay, organicMatter, stone) {
      
      /*
        Eq. 15 + 18 (Saxton 2006)
        lambda            slope of logarithmic tension-moisture curve
        Theta_33    [% v] 33 kPa moisture, normal density
        Theta_1500  [% v] 1500 kPa moisture
        B                 coefficient of moisture-tension
      */

      function lambda(Theta_33, Theta_1500) {
        
        var B = (log(1500) - log(33)) / (log(Theta_33) - log(Theta_1500));
        return 1 / B;

      }

      /*
        Eq. 16 (Saxton 2006)
        K_S       [mm h-1]    saturated conductivity (matric soil)
        Theta_S   [% v]       saturated moisture (0 kPa), normal density
        Theta_33  [% v]       33 kPa moisture, normal density
        lambda                Slope of logarithmic tension-moisture curve
      */

      function K_S(Theta_S, Theta_33, lambda) {

        return 1930 * pow(Theta_S - Theta_33, 3 - lambda);
        
      }

      /*
        Eq. 17 (Saxton 2006)
        K_Theta     [mm h-1]  unsaturated conductivity at moisture Theta
        K_S         [mm h-1]  saturated conductivity (matric soil)
        Theta       [% v]     moisture
        Theta_S     [% v]     saturated moisture (0 kPa), normal density
        Theta_1500  [% v]     1500 kPa moisture
        Theta_33    [% v]     33 kPa moisture, normal density
      */

      function K_Theta(K_S, Theta, Theta_S, lambda, Theta_1500, Theta_33) {

        return K_S * pow(Theta / Theta_S, 3 + (2 / lambda));
        
      }

      /*
        Eq. 5 (Saxton 2006)
        Theta_S       [% v]   saturated moisture (0 kPa), normal density
        Theta_33      [% v]   33 kPa moisture, normal density
        Theta_S33     [% v]   SAT-33 kPa moisture, normal density
        S             [% w]   sand
      */

      function Theta_S(Theta_33, Theta_S33, S) {
        
        return Theta_33 + Theta_S33 - 0.097 * S + 0.043;
        
      }

      /*
        Eq. 2 (Saxton 2006)
        Theta_33      [% v]   33 kPa moisture, normal density
        S             [% w]   sand
        C             [% w]   clay
        OM            [% w]   organic matter
      */

      function Theta_33(S, C, OM) {
        
        var Theta_33t = (
          - 0.251 * S + 0.195 * C + 0.011 * OM
          + 0.006 * (S * OM) - 0.027 * (C * OM)
          + 0.452 * (S * C) + 0.299
        );
        
        return Theta_33t + (1.283 * pow(Theta_33t, 2) - 0.374 * Theta_33t - 0.015);
        
      }

      /*
        Eq. 3 (Saxton 2006)
        Theta_S33     [% v]   SAT-33 kPa moisture, normal density
        S             [% w]   sand
        C             [% w]   clay
        OM            [% w]   organic matter
      */

      function Theta_S33(S, C, OM) {
        
        var Theta_S33t = (
            0.278 * S + 0.034 * C + 0.022 * OM
          - 0.018 * (S * OM) - 0.027 * (C * OM) -
          - 0.584 * (S * C) + 0.078
        );
        
        return Theta_S33t + (0.636 * Theta_S33t - 0.107);
        
      }

      /*
        Eq. 1 (Saxton 2006)
        Theta_1500    [% v]   1500 kPa moisture
        S             [% w]   sand
        C             [% w]   clay
        OM            [% w]   organic matter
      */

      function Theta_1500(S, C, OM) {
        
        var Theta_1500t = (
          - 0.024 * S + 0.487 * C + 0.006 * OM
          + 0.005 * (S * OM) - 0.013 * (C * OM)
          + 0.068 * (S * C) + 0.031
        );
        
        return Theta_1500t + (0.14 * Theta_1500t - 0.02);
        
      }

      /* Saxton 2006 */
      var theta_33 = Theta_33(sand, clay, 0);
      var theta_S33 = Theta_S33(sand, clay, 0);
      var theta_S = Theta_S(theta_33, theta_S33, sand);
      var theta_1500 = Theta_1500(sand, clay, 0);
      var bulkDensity = (1 - theta_S) * 2.65;

      /* Saxton 1986 */
      var percent_sand = sand * 100;
      var percent_clay = clay * 100;
      var sand_2 = pow(percent_sand, 2);
      var clay_2 = pow(percent_clay, 2);
      var a = exp(-4.396 - 0.0715 * percent_clay - 4.88e-4 * sand_2 - 4.285e-5 * sand_2 * percent_clay)
      var b = - 3.140 - 0.00222 * clay_2 - 3.484e-5 * sand_2 * percent_clay;
      var SAT = 0.332 - 7.251e-4 * percent_sand + 0.1276 * log10(percent_clay);
      var FC = pow((0.3333 / a), (1.0 / b));
      var PWP = pow((15.0  / a), (1.0 / b));
      var BD = (1 - SAT) * 2.65;

      return {
        saxton_06: { /* experimental! */
          FC: theta_33 * (1 - stone),
          theta_S33: theta_S33,
          PWP: theta_1500 * (1 - stone),
          S: theta_S * (1 - stone),
          BD: bulkDensity * 1000, // [kg m-3]
          lambda: lambda(theta_33, theta_1500) 
        },
        saxton_86: {
          FC: FC * (1 - stone),
          SAT: SAT * (1 - stone),
          PWP: PWP * (1 - stone),
          BD: BD * 1000 // [kg m-3]
        }
      };

    }
  ,  
    texture2lambda: function (sand, clay) {
      return (2.0 * (sand * sand * 0.575)) + (clay * 0.1) + ((1.0 - sand - clay) * 0.35);
    }
  ,
    soilCharacteristicsKA5: function (soilParameter) {

      logger(MSG.INFO, 'Read soil characteristics from KA5');

      var texture = soilParameter.vs_SoilTexture;
      var stoneContent = soilParameter.vs_SoilStoneContent;

      var fc = 0.0;
      var sat = 0.0;
      var pwp = 0.0;

      if (texture != "") {
        var srd = soilParameter.vs_SoilRawDensity() / 1000.0; // [kg m-3] -> [g cm-3]
        var som = soilParameter.vs_SoilOrganicMatter() * 100.0; // [kg kg-1] -> [%]

        // ***************************************************************************
        // *** The following boundaries are extracted from:                        ***
        // *** Wessolek, G., M. Kaupenjohann, M. Renger (2009) Bodenphysikalische  ***
        // *** Kennwerte und Berechnungsverfahren für die Praxis. Bodenökologie    ***
        // *** und Bodengenese 40, Selbstverlag Technische Universität Berlin      ***
        // *** (Tab. 4).                                                           ***
        // ***************************************************************************

        var srd_lowerBound = 0.0;
        var srd_upperBound = 0.0;
        if (srd < 1.1) {
          srd_lowerBound = 1.1;
          srd_upperBound = 1.1;
        }
        else if ((srd >= 1.1) && (srd < 1.3)) {
          srd_lowerBound = 1.1;
          srd_upperBound = 1.3;
        }
        else if ((srd >= 1.3) && (srd < 1.5)) {
          srd_lowerBound = 1.3;
          srd_upperBound = 1.5;
        }
        else if ((srd >= 1.5) && (srd < 1.7)) {
          srd_lowerBound = 1.5;
          srd_upperBound = 1.7;
        }
        else if ((srd >= 1.7) && (srd < 1.9)) {
          srd_lowerBound = 1.7;
          srd_upperBound = 1.9;
        }
        else if (srd >= 1.9) {
          srd_lowerBound = 1.9;
          srd_upperBound = 1.9;
        }

        // special treatment for "torf" soils
        if (texture == "Hh" || texture == "Hn") {
            srd_lowerBound = -1;
            srd_upperBound = -1;
        }

        // Boundaries for linear interpolation
        var lbRes = Tools.readPrincipalSoilCharacteristicData(texture, srd_lowerBound);
        var sat_lowerBound = lbRes.sat;
        var fc_lowerBound = lbRes.fc;
        var pwp_lowerBound = lbRes.pwp;

        var ubRes = Tools.readPrincipalSoilCharacteristicData(texture, srd_upperBound);
        var sat_upperBound = ubRes.sat;
        var fc_upperBound = ubRes.fc;
        var pwp_upperBound = ubRes.pwp;

        if(lbRes.initialized && ubRes.initialized) {
          //    cout << "Soil Raw Density:\t" << vs_SoilRawDensity << endl;
          //    cout << "Saturation:\t\t" << vs_SaturationLowerBoundary << "\t" << vs_SaturationUpperBoundary << endl;
          //    cout << "Field Capacity:\t" << vs_FieldCapacityLowerBoundary << "\t" << vs_FieldCapacityUpperBoundary << endl;
          //    cout << "PermanentWP:\t" << vs_PermanentWiltingPointLowerBoundary << "\t" << vs_PermanentWiltingPointUpperBoundary << endl;
          //    cout << "Soil Organic Matter:\t" << vs_SoilOrganicMatter << endl;

          // ***************************************************************************
          // *** The following boundaries are extracted from:                        ***
          // *** Wessolek, G., M. Kaupenjohann, M. Renger (2009) Bodenphysikalische  ***
          // *** Kennwerte und Berechnungsverfahren für die Praxis. Bodenökologie    ***
          // *** und Bodengenese 40, Selbstverlag Technische Universität Berlin      ***
          // *** (Tab. 5).                                                           ***
          // ***************************************************************************

          var som_lowerBound = 0.0;
          var som_upperBound = 0.0;

          if(som >= 0.0 && som < 1.0) {
            som_lowerBound = 0.0;
            som_upperBound = 0.0;
          }
          else if(som >= 1.0 && som < 1.5) {
            som_lowerBound = 0.0;
            som_upperBound = 1.5;
          }
          else if(som >= 1.5 && som < 3.0) {
            som_lowerBound = 1.5;
            som_upperBound = 3.0;
          }
          else if(som >= 3.0 && som < 6.0) {
            som_lowerBound = 3.0;
            som_upperBound = 6.0;
          }
          else if(som >= 6.0 && som < 11.5) {
            som_lowerBound = 6.0;
            som_upperBound = 11.5;
          }
          else if(som >= 11.5) {
            som_lowerBound = 11.5;
            som_upperBound = 11.5;
          }

          // special treatment for "torf" soils
          if (texture == "Hh" || texture == "Hn") {
            som_lowerBound = 0.0;
            som_upperBound = 0.0;
          }

          // Boundaries for linear interpolation
          var fc_mod_lowerBound = 0.0;
          var sat_mod_lowerBound = 0.0;
          var pwp_mod_lowerBound = 0.0;
          // modifier values are given only for organic matter > 1.0% (class h2)
          if (som_lowerBound != 0.0) {
            var lbRes = Tools.readSoilCharacteristicModifier(texture, som_lowerBound);
            sat_mod_lowerBound = lbRes.sat;
            fc_mod_lowerBound = lbRes.fc;
            pwp_mod_lowerBound = lbRes.pwp;
          }

          var fc_mod_upperBound = 0.0;
          var sat_mod_upperBound = 0.0;
          var pwp_mod_upperBound = 0.0;
          if (som_upperBound != 0.0) {
            var ubRes = Tools.readSoilCharacteristicModifier(texture, som_upperBound);
            sat_mod_upperBound = ubRes.sat;
            fc_mod_upperBound = ubRes.fc;
            pwp_mod_upperBound = ubRes.pwp;
          }

    //      cout << "Saturation-Modifier:\t" << sat_mod_lowerBound << "\t" << sat_mod_upperBound << endl;
    //      cout << "Field capacity-Modifier:\t" << fc_mod_lowerBound << "\t" << fc_mod_upperBound << endl;
    //      cout << "PWP-Modifier:\t" << pwp_mod_lowerBound << "\t" << pwp_mod_upperBound << endl;

          // Linear interpolation
          var fc_unmod = fc_lowerBound;
          if (fc_upperBound < 0.5 && fc_lowerBound >= 1.0)
            fc_unmod = fc_lowerBound;
          else if(fc_lowerBound < 0.5 && fc_upperBound >= 1.0)
            fc_unmod = fc_upperBound;
          else if(srd_upperBound != srd_lowerBound)
            fc_unmod = (srd - srd_lowerBound)/
                       (srd_upperBound - srd_lowerBound)*
                       (fc_upperBound - fc_lowerBound) + fc_lowerBound;

          var sat_unmod = sat_lowerBound;
          if(sat_upperBound < 0.5 && sat_lowerBound >= 1.0)
            sat_unmod = sat_lowerBound;
          else if(sat_lowerBound < 0.5 && sat_upperBound >= 1.0)
            sat_unmod = sat_upperBound;
          else if(srd_upperBound != srd_lowerBound)
            sat_unmod = (srd - srd_lowerBound)/
                        (srd_upperBound - srd_lowerBound)*
                        (sat_upperBound - sat_lowerBound) + sat_lowerBound;

          var pwp_unmod = pwp_lowerBound;
          if(pwp_upperBound < 0.5 && pwp_lowerBound >= 1.0)
            pwp_unmod = pwp_lowerBound;
          else if(pwp_lowerBound < 0.5 && pwp_upperBound >= 1.0)
            pwp_unmod = pwp_upperBound;
          else if(srd_upperBound != srd_lowerBound)
            pwp_unmod = (srd - srd_lowerBound)/
                        (srd_upperBound - srd_lowerBound)*
                        (pwp_upperBound - pwp_lowerBound) + pwp_lowerBound;

          //in this case upper and lower boundary are equal, so doesn't matter.
          var fc_mod = fc_mod_lowerBound;
          var sat_mod = sat_mod_lowerBound;
          var pwp_mod = pwp_mod_lowerBound;
          if(som_upperBound != som_lowerBound) {
            fc_mod = (som - som_lowerBound)/
                     (som_upperBound - som_lowerBound)*
                     (fc_mod_upperBound - fc_mod_lowerBound) + fc_mod_lowerBound;

            sat_mod = (som - som_lowerBound)/
                      (som_upperBound - som_lowerBound)*
                      (sat_mod_upperBound - sat_mod_lowerBound) + sat_mod_lowerBound;

            pwp_mod = (som - som_lowerBound)/
                      (som_upperBound - som_lowerBound)*
                      (pwp_mod_upperBound - pwp_mod_lowerBound) + pwp_mod_lowerBound;
          }

          // Modifying the principal values by organic matter
          fc = (fc_unmod + fc_mod)/100.0; // [m3 m-3]
          sat = (sat_unmod + sat_mod)/100.0; // [m3 m-3]
          pwp = (pwp_unmod + pwp_mod)/100.0; // [m3 m-3]

          // Modifying the principal values by stone content
          fc *= (1.0 - stoneContent);
          sat *= (1.0 - stoneContent);
          pwp *= (1.0 - stoneContent);
        }
      }

      soilParameter.vs_FieldCapacity = fc;
      soilParameter.vs_Saturation = sat;
      soilParameter.vs_PermanentWiltingPoint = pwp;
    }
  ,
    // TODO: refactor soilType -> textureClass
    readPrincipalSoilCharacteristicData: function (soilType, rawDensity) {

      // C++
      // typedef map<int, RPSCDRes> M1;
      // typedef map<string, M1> M2;
      // static M2 m;

      var RPSCDRes = function (initialized) {

        this.sat = 0;
        this.fc = 0;
        this.pwp = 0;
        this.initialized = (initialized === undefined) ? false : initialized;

      };

      var columns = soilCharacteristicData.columns;
      var rows = soilCharacteristicData.rows;

      var m = {};

      for (var r = 0, rs = rows.length; r < rs; r++) {

        var row = rows[r];


        if (row['soil_type'] === soilType) {

          var ac = row['air_capacity'];
          var fc = row['field_capacity'];
          var nfc = row['n_field_capacity'];

          var rp = new RPSCDRes(true);
          rp.sat = ac + fc;
          rp.fc = fc;
          rp.pwp = fc - nfc;

          if (m[soilType] === undefined)
            m[soilType] = {};

          m[soilType][int(row['soil_raw_density*10'])] = rp;

        }
      }

      var rd10 = int(rawDensity * 10);
      if (m[soilType][rd10])
        return m[soilType][rd10];

      //if we didn't find values for a given raw density, e.g. 1.1 (= 11)
      //we try to find the closest next one (up (1.1) or down (1.9))
      while(!m[soilType][rd10] && (11 <= rd10 && rd10 <= 19))
        rd10 += (rd10 < 15) ? 1 : -1;

      return (m[soilType][rd10]) ? m[soilType][rd10] : new RPSCDRes();

    }
  , readSoilCharacteristicModifier: function (soilType, organicMatter) {

      // C++
      // typedef map<int, RPSCDRes> M1;
      // typedef map<string, M1> M2;
      // static M2 m;
      var RPSCDRes = function (initialized) {

        this.sat = 0;
        this.fc = 0;
        this.pwp = 0;
        this.initialized = (initialized === undefined) ? false : initialized;

      };

      var columns = soilAggregationValues.columns;
      var rows = soilAggregationValues.rows;

      var m = {};

      for (var r = 0, rs = rows.length; r < rs; r++) {

        var row = rows[r];

        if (row['soil_type'] === soilType) {

          var ac = row['air_capacity'];
          var fc = row['field_capacity'];
          var nfc = row['n_field_capacity'];

          var rp = new RPSCDRes(true);
          rp.sat = ac + fc;
          rp.fc = fc;
          rp.pwp = fc - nfc;


          if (m[soilType] === undefined)
            m[soilType] = {};

          m[soilType][int(row['organic_matter'])] = rp;

        }
      }

      var rd10 = int(organicMatter * 10);

      return (m[soilType][rd10]) ? m[soilType][rd10] : new RPSCDRes();
  
    }
  , sunshine2globalRadiation: function (yd, sonn, lat, asMJpm2pd) {
      var pi=4.0*atan(1.0);
      var dec=-23.4*cos(2*pi*(yd+10)/365);
      var sinld=sin(dec*pi/180)*sin(lat*pi/180);
      var cosld=cos(dec*pi/180)*cos(lat*pi/180);
      var dl=12*(pi+2*asin(sinld/cosld))/pi;
      var dle=12*(pi+2*asin((-sin(8*pi/180)+sinld)/cosld))/pi;
      var rdn=3600*(sinld*dl+24/pi*cosld*sqrt(1.0-(sinld/cosld)*(sinld/cosld)));
      var drc=1300*rdn*exp(-0.14/(rdn/(dl*3600)));
      var dro=0.2*drc;
      var dtga=sonn/dle*drc+(1-sonn/dle)*dro;
      var t = dtga/10000.0;
      //convert J/cm²/d to MJ/m²/d
      //1cm²=1/(100*100)m², 1J = 1/1000000MJ
      //-> (t * 100.0 * 100.0) / 1000000.0 -> t / 100
      return asMJpm2pd ? t/100.0 : t;
    }
};


// 'use strict';

var YieldComponent = function (oid, yp, ydm) {

  this.organId = oid;
  this.yieldPercentage = yp;
  this.yieldDryMatter = ydm;
  
};


var IrrigationParameters = function (n, s) {
  
  this.nitrateConcentration = n || 0;
  this.sulfateConcentration = s || 0;

};


var AutomaticIrrigationParameters = function (a, t, n, s) {
  
  /* TODO: x || y evaluates to y if x = 0. This is not a problem if default (y) is 0 */
  this.amount = a || 17;
  this.threshold = t || 0.35;
  this.nitrateConcentration = n || 0;
  this.sulfateConcentration = s || 0;

};


var AOM_Properties = function () {

  /* C content in slowly decomposing added organic matter pool [kgC m-3] */
  this.vo_AOM_Slow = 0.0;  
  /* C content in rapidly decomposing added organic matter pool [kgC m-3] */
  this.vo_AOM_Fast = 0.0; 
  /* Rate for slow AOM transformation that will be calculated. */
  this.vo_AOM_SlowDecRate = 0.0; 
  /* Rate for fast AOM transformation that will be calculated. */
  this.vo_AOM_FastDecRate = 0.0; 
  /* Is dependent on environment */
  this.vo_AOM_SlowDecCoeff = 0.0; 
  /* Is dependent on environment */
  this.vo_AOM_FastDecCoeff = 0.0; 
  /* Decomposition rate coefficient for slow AOM pool at standard conditions */
  this.vo_AOM_SlowDecCoeffStandard = 1.0; 
  /* Decomposition rate coefficient for fast AOM pool at standard conditions */
  this.vo_AOM_FastDecCoeffStandard = 1.0; 
  /* Partial transformation from AOM to SMB (soil microbiological biomass) for slow AOMs. */
  this.vo_PartAOM_Slow_to_SMB_Slow = 0.0; 
  /* Partial transformation from AOM to SMB (soil microbiological biomass) for fast AOMs. */
  this.vo_PartAOM_Slow_to_SMB_Fast = 0.0; 
  /* Used for calculation N-value if only C-value is known. Usually a constant value. */
  this.vo_CN_Ratio_AOM_Slow = 1.0; 
  /* C-N-Ratio is dependent on the nutritional condition of the plant. */
  this.vo_CN_Ratio_AOM_Fast = 1.0; 
  /* Fertilization parameter */  
  this.vo_DaysAfterApplication = 0;  /* Fertilization parameter */
  this.vo_AOM_DryMatterContent = 0.0; 
  /* Fertilization parameter */
  this.vo_AOM_NH4Content = 0.0; 
  /* Difference of AOM slow between to timesteps */
  this.vo_AOM_SlowDelta = 0.0; 
  /* Difference of AOM slow between to timesteps */
  this.vo_AOM_FastDelta = 0.0; 
  /* True if organic fertilizer is added with a subsequent incorporation. */
  incorporation = false; // TODO: rename -> doIncorporate

};


var GeneralParameters = function () {

  // TODO: seems ps_LayerThickness is needless -> make GeneralParameters an object literal

  // layer thickness, profil depth and number of layers are constants
  this._ps_LayerThickness = 0.1;
  this.ps_ProfileDepth = 2.0;
  this.ps_LayerThickness = new Float64Array(20);
  this.ps_MaxMineralisationDepth = 0.4;
  this.pc_NitrogenResponseOn = true;
  this.pc_WaterDeficitResponseOn = true;
  this.pc_LowTemperatureStressResponseOn = false;
  this.pc_HighTemperatureStressResponseOn = true;
  this.pc_EmergenceFloodingControlOn = false;
  this.pc_EmergenceMoistureControlOn = false;

  for (var i = 0; i < this.ps_LayerThickness.length; i++)
    this.ps_LayerThickness[i] = this._ps_LayerThickness;

  this.ps_NumberOfLayers = function () { 
    return 20 /*this.ps_LayerThickness.length*/;
  };

};


var SiteParameters = function () {
    
  this.vs_Latitude = 60.0; 
  this.vs_Slope = 0.01; 
  this.vs_HeightNN = 50.0; 
  this.vs_GroundwaterDepth = 70.0; 
  this.vs_Soil_CN_Ratio = 10.0; 
  this.vs_DrainageCoeff = 1.0; 
  this.vq_NDeposition = 30.0; 
  this.vs_MaxEffectiveRootingDepth = 2.0;

};


var SoilParameters = function () {

  this.vs_SoilSandContent = 0.4;
  this.vs_SoilClayContent = 0.05;
  this.vs_SoilpH = 6.9;
  this.vs_SoilStoneContent = -1;
  this.vs_Lambda = -1;
  this.vs_FieldCapacity = -1;
  this.vs_Saturation = -1;
  this.vs_PermanentWiltingPoint = -1;
  this.vs_SoilTexture = '';
  this.vs_SoilAmmonium = -1;
  this.vs_SoilNitrate = -1;
  this._vs_SoilRawDensity = -1;
  this._vs_SoilBulkDensity = -1;
  this._vs_SoilOrganicCarbon = -1;
  this._vs_SoilOrganicMatter = -1;

  this.isValid = function () {

    var is_valid = true;

    if (this.vs_FieldCapacity <= 0) {
        logger(MSG.WARN, "SoilParameters::Error: No field capacity defined in database for " + this.vs_SoilTexture + " , RawDensity: "+ this._vs_SoilRawDensity);
        is_valid = false;
    }

    if (this.vs_Saturation <= 0) {
        logger(MSG.WARN, "SoilParameters::Error: No saturation defined in database for " + this.vs_SoilTexture + " , RawDensity: " + this._vs_SoilRawDensity);
        is_valid = false;
    }
    
    if (this.vs_PermanentWiltingPoint <= 0) {
        logger(MSG.WARN, "SoilParameters::Error: No saturation defined in database for " + this.vs_SoilTexture + " , RawDensity: " + this._vs_SoilRawDensity);
        is_valid = false;
    }

    if (this.vs_SoilSandContent < 0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid soil sand content: "+ this.vs_SoilSandContent);
        is_valid = false;
    }

    if (this.vs_SoilClayContent < 0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid soil clay content: "+ this.vs_SoilClayContent);
        is_valid = false;
    }

    if (this.vs_SoilpH < 0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid soil ph value: "+ this.vs_SoilpH);
        is_valid = false;
    }

    if (this.vs_SoilStoneContent < 0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid soil stone content: "+ this.vs_SoilStoneContent);
        is_valid = false;
    }

    if (this.vs_Saturation < 0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid value for saturation: "+ this.vs_Saturation);
        is_valid = false;
    }

    if (this.vs_PermanentWiltingPoint < 0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid value for permanent wilting point: "+ this.vs_PermanentWiltingPoint);
        is_valid = false;
    }

    // if (this._vs_SoilRawDensity<0) {
    //     logger(MSG.WARN, "SoilParameters::Error: Invalid soil raw density: "+ this._vs_SoilRawDensity);
    //     is_valid = false;
    // }

    return is_valid;
  };

  this.vs_SoilRawDensity = function () {
    // conversion from g cm-3 in kg m-3
    return this._vs_SoilRawDensity * 1000;
  };

  this.set_vs_SoilRawDensity = function (srd) {
    this._vs_SoilRawDensity = srd;
  };

  this.vs_SoilOrganicCarbon = function () {
    if (this._vs_SoilOrganicMatter < 0)
      return this._vs_SoilOrganicCarbon;

    return this._vs_SoilOrganicMatter * ORGANIC_CONSTANTS.PO_SOM_TO_C;
  };

  this.set_vs_SoilOrganicCarbon = function (soc) {
    this._vs_SoilOrganicCarbon = soc;
  };

  this.vs_SoilOrganicMatter = function () {
    if (this._vs_SoilOrganicCarbon < 0)
      return this._vs_SoilOrganicMatter;
    return this._vs_SoilOrganicCarbon / ORGANIC_CONSTANTS.PO_SOM_TO_C;
  };

  this.set_vs_SoilOrganicMatter = function (som) {
    this._vs_SoilOrganicMatter = som;
  };

  this.vs_SoilSiltContent = function () {
    if ((this.vs_SoilSandContent - 0.001) < 0 && (this.vs_SoilClayContent - 0.001) < 0)
      return 0;

    return 1 - this.vs_SoilSandContent - this.s_SoilClayContent;
  };

  /* bulk density [kg m-3] */
  this.vs_SoilBulkDensity = function () {
    if (this._vs_SoilRawDensity < 0)
      return this._vs_SoilBulkDensity;

    return (this._vs_SoilRawDensity + (0.009 * 100 * this.vs_SoilClayContent)) * 1000;
  };

  /* bulk density [kg m-3] */
  this.set_vs_SoilBulkDensity = function (sbd) {
    this._vs_SoilBulkDensity = sbd;
  };

  this.texture2lambda = function (sand, clay) {
    return tools.texture2lambda(sand, clay);
  };

};


var OrganicMatterParameters = function () {

  this.name = 'unnamed';
  this.vo_AOM_DryMatterContent = 0.0;
  this.vo_AOM_NH4Content = 0.0;
  this.vo_AOM_NO3Content = 0.0;
  this.vo_AOM_CarbamidContent = 0.0;
  this.vo_AOM_SlowDecCoeffStandard = 0.0;
  this.vo_AOM_FastDecCoeffStandard = 0.0;
  this.vo_PartAOM_to_AOM_Slow = 0.0;
  this.vo_PartAOM_to_AOM_Fast = 0.0;
  this.vo_CN_Ratio_AOM_Slow = 0.0;
  this.vo_CN_Ratio_AOM_Fast = 0.0;
  this.vo_PartAOM_Slow_to_SMB_Slow = 0.0;
  this.vo_PartAOM_Slow_to_SMB_Fast = 0.0;
  this.vo_NConcentration = 0.0;

};


var ParameterProvider = function () {
  
  this.userCropParameters = {
    pc_Tortuosity: 0.002,
    pc_CanopyReflectionCoefficient: 0.08,
    pc_ReferenceMaxAssimilationRate: 30,
    pc_ReferenceLeafAreaIndex: 1.44,
    pc_MaintenanceRespirationParameter2: 44,
    pc_MaintenanceRespirationParameter1: 0.08,
    pc_MinimumNConcentrationRoot: 0.005,
    pc_MinimumAvailableN: 0.000075,
    pc_ReferenceAlbedo: 0.23,
    pc_StomataConductanceAlpha: 40,
    pc_SaturationBeta: 2.5,
    pc_GrowthRespirationRedux: 0.7,
    pc_MaxCropNDemand: 6,
    pc_GrowthRespirationParameter2: 38,
    pc_GrowthRespirationParameter1: 0.1
  };

  this.userEnvironmentParameters = {
    p_MaxGroundwaterDepth: 18,
    p_MinGroundwaterDepth: 20,
    p_UseAutomaticIrrigation: false,
    p_UseNMinMineralFertilisingMethod: false,
    p_LayerThickness: 0.1,
    p_NumberOfLayers: 20,
    p_StartPVIndex: 0,
    p_Albedo: 0.23,
    p_AthmosphericCO2: 380,
    p_WindSpeedHeight: 2,
    p_UseSecondaryYields: true,
    p_JulianDayAutomaticFertilising: 74,
    p_timeStep: 1,
    p_LeachingDepth: 1.6,
    p_MinGroundwaterDepthMonth: 3
  };

  this.userSoilMoistureParameters = {
    pm_CriticalMoistureDepth: 0.3,
    pm_SaturatedHydraulicConductivity: 8640,
    pm_SurfaceRoughness: 0.02,
    pm_HydraulicConductivityRedux: 0.1,
    pm_SnowAccumulationTresholdTemperature: 1.8,
    pm_KcFactor: 0.75,
    pm_TemperatureLimitForLiquidWater: -3,
    pm_CorrectionSnow: 1.14,
    pm_CorrectionRain: 1,
    pm_SnowMaxAdditionalDensity: 0.25,
    pm_NewSnowDensityMin: 0.1,
    pm_SnowRetentionCapacityMin: 0.05,
    pm_RefreezeParameter2: 0.36,
    pm_RefreezeParameter1: 1.5,
    pm_RefreezeTemperature: -1.7,
    pm_SnowMeltTemperature: 0.31,
    pm_SnowPacking: 0.01,
    pm_SnowRetentionCapacityMax: 0.17,
    pm_EvaporationZeta: 40,
    pm_XSACriticalSoilMoisture: 0.1,
    pm_MaximumEvaporationImpactDepth: 5,
    pm_MaxPercolationRate: 10,
    pm_GroundwaterDischarge: 3
  };

  this.userSoilTemperatureParameters = {
    pt_SoilMoisture: 0.25,
    pt_NTau: 0.65,
    pt_InitialSurfaceTemperature: 10,
    pt_BaseTemperature: 9.5,
    pt_QuartzRawDensity: 2650,
    pt_DensityAir: 1.25,
    pt_DensityWater: 1000,
    pt_SpecificHeatCapacityAir: 1005,
    pt_SpecificHeatCapacityQuartz: 750,
    pt_SpecificHeatCapacityWater: 4192,
    pt_SoilAlbedo: 0.7,
    pt_DensityHumus: 1300,
    pt_SpecificHeatCapacityHumus: 1920
  };

  this.userSoilTransportParameters = {
    pq_DispersionLength: 0.049,
    pq_AD: 0.002,
    pq_DiffusionCoefficientStandard: 0.000214
  };

  this.userSoilOrganicParameters = {
    po_SOM_SlowDecCoeffStandard: 0.000043,
    po_SOM_FastDecCoeffStandard: 0.00014,
    po_SMB_SlowMaintRateStandard: 0.001,
    po_SMB_FastMaintRateStandard: 0.01,
    po_SMB_SlowDeathRateStandard: 0.001,
    po_SMB_FastDeathRateStandard: 0.01,
    po_SMB_UtilizationEfficiency: 0,
    po_SOM_SlowUtilizationEfficiency: 0.4,
    po_SOM_FastUtilizationEfficiency: 0.5,
    po_AOM_SlowUtilizationEfficiency: 0.4,
    po_AOM_FastUtilizationEfficiency: 0.1,
    po_AOM_FastMaxC_to_N: 1000,
    po_PartSOM_Fast_to_SOM_Slow: 0.3,
    po_PartSMB_Slow_to_SOM_Fast: 0.6,
    po_PartSMB_Fast_to_SOM_Fast: 0.6,
    po_PartSOM_to_SMB_Slow: 0.015,
    po_PartSOM_to_SMB_Fast: 0.0002,
    po_CN_Ratio_SMB: 6.7,
    po_LimitClayEffect: 0.25,
    po_AmmoniaOxidationRateCoeffStandard: 0.1,
    po_NitriteOxidationRateCoeffStandard: 0.2,
    po_TransportRateCoeff: 0.1,
    po_SpecAnaerobDenitrification: 0.1,
    po_ImmobilisationRateCoeffNO3: 0.5,
    po_ImmobilisationRateCoeffNH4: 0.5,
    po_Denit1: 0.2,
    po_Denit2: 0.8,
    po_Denit3: 0.9,
    po_HydrolysisKM: 0.00334,
    po_ActivationEnergy: 41000,
    po_HydrolysisP1: 4.259e-12,
    po_HydrolysisP2: 1.408e-12,
    po_AtmosphericResistance: 0.0025,
    po_N2OProductionRate: 0.015,
    po_Inhibitor_NH3: 1
  };

  this.capillaryRiseRates = {
    map: {
      Su3: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.005,
        7: 0.0035,
        8: 0.0028,
        9: 0.0022,
        10: 0.0017,
        11: 0.0014,
        12: 0.0012,
        13: 0.0009,
        14: 0.0008,
        15: 0.0007,
        16: 0.0007,
        17: 0.0005,
        18: 0.0005,
        19: 0.0005,
        20: 0.0003,
        21: 0.0003,
        22: 0.0003,
        23: 0.0003,
        24: 0.0003,
        25: 0.0001,
        26: 0,
        27: 0
      },
      Sl3: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.005,
        5: 0.0025,
        6: 0.0016,
        7: 0.0011,
        8: 0.0007,
        9: 0.0005,
        10: 0.0003,
        11: 0.0002,
        12: 0.0001,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Sl2: {
        1: 0.0055,
        2: 0.0055,
        3: 0.005,
        4: 0.0026,
        5: 0.0013,
        6: 0.0008,
        7: 0.0005,
        8: 0.0003,
        9: 0.0002,
        10: 0.0001,
        11: 0,
        12: 0,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Su4: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.0055,
        7: 0.005,
        8: 0.0039,
        9: 0.0029,
        10: 0.0023,
        11: 0.0018,
        12: 0.0015,
        13: 0.0012,
        14: 0.0009,
        15: 0.0008,
        16: 0.0008,
        17: 0.0005,
        18: 0.0005,
        19: 0.0005,
        20: 0.0003,
        21: 0.0003,
        22: 0.0003,
        23: 0.0003,
        24: 0.0003,
        25: 0.0001,
        26: 0,
        27: 0
      },
      Su2: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.005,
        6: 0.003,
        7: 0.0022,
        8: 0.0017,
        9: 0.0012,
        10: 0.001,
        11: 0.0008,
        12: 0.0006,
        13: 0.0005,
        14: 0.0004,
        15: 0.0003,
        16: 0.0003,
        17: 0.0002,
        18: 0.0002,
        19: 0.0002,
        20: 0.0001,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Sl4: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.005,
        5: 0.0036,
        6: 0.0024,
        7: 0.0016,
        8: 0.0012,
        9: 0.0008,
        10: 0.0006,
        11: 0.0004,
        12: 0.0003,
        13: 0.0002,
        14: 0.0001,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Slu: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.005,
        6: 0.0036,
        7: 0.0026,
        8: 0.0019,
        9: 0.0015,
        10: 0.0011,
        11: 0.0009,
        12: 0.0007,
        13: 0.0005,
        14: 0.0004,
        15: 0.0003,
        16: 0.0003,
        17: 0.0002,
        18: 0.0002,
        19: 0.0002,
        20: 0.0001,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      St2: {
        1: 0.0055,
        2: 0.0055,
        3: 0.005,
        4: 0.0029,
        5: 0.0018,
        6: 0.0011,
        7: 0.0007,
        8: 0.0005,
        9: 0.0004,
        10: 0.0003,
        11: 0.0002,
        12: 0.0001,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      St3: {
        1: 0.0055,
        2: 0.0055,
        3: 0.005,
        4: 0.0029,
        5: 0.0018,
        6: 0.0011,
        7: 0.0007,
        8: 0.0005,
        9: 0.0004,
        10: 0.0003,
        11: 0.0002,
        12: 0.0001,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      fS: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.005,
        6: 0.0033,
        7: 0.0022,
        8: 0.0014,
        9: 0.0009,
        10: 0.0005,
        11: 0.0003,
        12: 0.0002,
        13: 0.0001,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      gS: {
        1: 0.0055,
        2: 0.005,
        3: 0.0014,
        4: 0.0005,
        5: 0.0002,
        6: 0.0001,
        7: 0,
        8: 0,
        9: 0,
        10: 0,
        11: 0,
        12: 0,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      mS: {
        1: 0.0055,
        2: 0.0055,
        3: 0.005,
        4: 0.0016,
        5: 0.0009,
        6: 0.0005,
        7: 0.0003,
        8: 0.0002,
        9: 0.0001,
        10: 0,
        11: 0,
        12: 0,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Ss: {
        1: 0.0055,
        2: 0.0055,
        3: 0.005,
        4: 0.0016,
        5: 0.0009,
        6: 0.0005,
        7: 0.0003,
        8: 0.0002,
        9: 0.0001,
        10: 0,
        11: 0,
        12: 0,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Us: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.0055,
        7: 0.005,
        8: 0.0041,
        9: 0.0033,
        10: 0.0027,
        11: 0.0022,
        12: 0.0018,
        13: 0.0015,
        14: 0.0012,
        15: 0.001,
        16: 0.001,
        17: 0.0007,
        18: 0.0007,
        19: 0.0007,
        20: 0.0004,
        21: 0.0004,
        22: 0.0004,
        23: 0.0004,
        24: 0.0004,
        25: 0.0001,
        26: 0.0001,
        27: 0
      },
      Uu: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.0055,
        7: 0.0055,
        8: 0.0055,
        9: 0.0055,
        10: 0.005,
        11: 0.004,
        12: 0.0033,
        13: 0.0028,
        14: 0.0024,
        15: 0.002,
        16: 0.002,
        17: 0.0015,
        18: 0.0015,
        19: 0.0015,
        20: 0.001,
        21: 0.001,
        22: 0.001,
        23: 0.001,
        24: 0.001,
        25: 0.0005,
        26: 0.0003,
        27: 0.0001
      },
      Uls: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.0055,
        7: 0.0055,
        8: 0.0055,
        9: 0.005,
        10: 0.0044,
        11: 0.0036,
        12: 0.003,
        13: 0.0026,
        14: 0.0022,
        15: 0.0019,
        16: 0.0019,
        17: 0.0014,
        18: 0.0014,
        19: 0.0014,
        20: 0.0009,
        21: 0.0009,
        22: 0.0009,
        23: 0.0009,
        24: 0.0009,
        25: 0.0005,
        26: 0.0003,
        27: 0.0001
      },
      Ut2: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.0055,
        7: 0.0055,
        8: 0.005,
        9: 0.0035,
        10: 0.0028,
        11: 0.0023,
        12: 0.0019,
        13: 0.0015,
        14: 0.0013,
        15: 0.0011,
        16: 0.0011,
        17: 0.0007,
        18: 0.0007,
        19: 0.0007,
        20: 0.0004,
        21: 0.0004,
        22: 0.0004,
        23: 0.0004,
        24: 0.0004,
        25: 0.0001,
        26: 0.0001,
        27: 0
      },
      Ut3: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.0055,
        7: 0.0055,
        8: 0.005,
        9: 0.0035,
        10: 0.0028,
        11: 0.0022,
        12: 0.0018,
        13: 0.0015,
        14: 0.0013,
        15: 0.0011,
        16: 0.0011,
        17: 0.0007,
        18: 0.0007,
        19: 0.0007,
        20: 0.0004,
        21: 0.0004,
        22: 0.0004,
        23: 0.0004,
        24: 0.0004,
        25: 0.0001,
        26: 0.0001,
        27: 0
      },
      Ut4: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.0055,
        7: 0.005,
        8: 0.0036,
        9: 0.0028,
        10: 0.0022,
        11: 0.0018,
        12: 0.0015,
        13: 0.0012,
        14: 0.001,
        15: 0.0008,
        16: 0.0008,
        17: 0.0005,
        18: 0.0005,
        19: 0.0005,
        20: 0.0003,
        21: 0.0003,
        22: 0.0003,
        23: 0.0003,
        24: 0.0003,
        25: 0.0001,
        26: 0.0001,
        27: 0
      },
      Ls2: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.0055,
        7: 0.004,
        8: 0.003,
        9: 0.0022,
        10: 0.0017,
        11: 0.0013,
        12: 0.0009,
        13: 0.0007,
        14: 0.0005,
        15: 0.0004,
        16: 0.0004,
        17: 0.0002,
        18: 0.0002,
        19: 0.0002,
        20: 0.0001,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Ls3: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.005,
        7: 0.0033,
        8: 0.0025,
        9: 0.002,
        10: 0.0015,
        11: 0.0012,
        12: 0.001,
        13: 0.0008,
        14: 0.0007,
        15: 0.0005,
        16: 0.0005,
        17: 0.0003,
        18: 0.0003,
        19: 0.0003,
        20: 0.0002,
        21: 0.0002,
        22: 0.0002,
        23: 0.0002,
        24: 0.0002,
        25: 0.0001,
        26: 0,
        27: 0
      },
      Ls4: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.0036,
        7: 0.0026,
        8: 0.002,
        9: 0.0015,
        10: 0.0012,
        11: 0.0009,
        12: 0.0007,
        13: 0.0006,
        14: 0.0005,
        15: 0.0004,
        16: 0.0004,
        17: 0.0003,
        18: 0.0003,
        19: 0.0003,
        20: 0.0001,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Lt2: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.005,
        6: 0.0038,
        7: 0.0028,
        8: 0.0022,
        9: 0.0017,
        10: 0.0013,
        11: 0.0011,
        12: 0.0009,
        13: 0.0007,
        14: 0.0005,
        15: 0.0004,
        16: 0.0004,
        17: 0.0003,
        18: 0.0003,
        19: 0.0003,
        20: 0.0001,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Lt3: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.005,
        6: 0.0034,
        7: 0.0026,
        8: 0.0019,
        9: 0.0015,
        10: 0.0012,
        11: 0.001,
        12: 0.0008,
        13: 0.0007,
        14: 0.0006,
        15: 0.0005,
        16: 0.0005,
        17: 0.0003,
        18: 0.0003,
        19: 0.0003,
        20: 0.0002,
        21: 0.0002,
        22: 0.0002,
        23: 0.0002,
        24: 0.0002,
        25: 0.0001,
        26: 0,
        27: 0
      },
      Lu: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0055,
        6: 0.005,
        7: 0.004,
        8: 0.0031,
        9: 0.0024,
        10: 0.0019,
        11: 0.0015,
        12: 0.0012,
        13: 0.001,
        14: 0.0008,
        15: 0.0007,
        16: 0.0007,
        17: 0.0005,
        18: 0.0005,
        19: 0.0005,
        20: 0.0003,
        21: 0.0003,
        22: 0.0003,
        23: 0.0003,
        24: 0.0003,
        25: 0.0001,
        26: 0.0001,
        27: 0
      },
      Lts: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.0055,
        5: 0.0005,
        6: 0.0032,
        7: 0.0022,
        8: 0.0016,
        9: 0.0012,
        10: 0.0009,
        11: 0.0007,
        12: 0.0005,
        13: 0.0004,
        14: 0.0003,
        15: 0.0002,
        16: 0.0002,
        17: 0.0001,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Tt: {
        1: 0.0055,
        2: 0.005,
        3: 0.002,
        4: 0.001,
        5: 0.0006,
        6: 0.0004,
        7: 0.0003,
        8: 0.0002,
        9: 0.0002,
        10: 0.0001,
        11: 0,
        12: 0,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Tl: {
        1: 0.0055,
        2: 0.005,
        3: 0.0026,
        4: 0.0013,
        5: 0.0008,
        6: 0.0005,
        7: 0.0004,
        8: 0.0003,
        9: 0.0002,
        10: 0.0001,
        11: 0,
        12: 0,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Tu2: {
        1: 0.0055,
        2: 0.005,
        3: 0.0026,
        4: 0.0013,
        5: 0.0008,
        6: 0.0005,
        7: 0.0004,
        8: 0.0003,
        9: 0.0002,
        10: 0.0001,
        11: 0,
        12: 0,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Tu3: {
        1: 0.0055,
        2: 0.0055,
        3: 0.005,
        4: 0.0024,
        5: 0.0014,
        6: 0.0009,
        7: 0.0007,
        8: 0.0005,
        9: 0.0004,
        10: 0.0003,
        11: 0.0003,
        12: 0.0002,
        13: 0.0002,
        14: 0.0001,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Tu4: {
        1: 0.0055,
        2: 0.0055,
        3: 0.0055,
        4: 0.005,
        5: 0.0024,
        6: 0.0016,
        7: 0.0012,
        8: 0.0008,
        9: 0.0006,
        10: 0.0005,
        11: 0.0004,
        12: 0.0003,
        13: 0.0003,
        14: 0.0002,
        15: 0.0002,
        16: 0.0002,
        17: 0.0001,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Ts2: {
        1: 0.0055,
        2: 0.0055,
        3: 0.005,
        4: 0.002,
        5: 0.0012,
        6: 0.0008,
        7: 0.0005,
        8: 0.0004,
        9: 0.0003,
        10: 0.0002,
        11: 0.0002,
        12: 0.0001,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Ts3: {
        1: 0.0055,
        2: 0.0055,
        3: 0.005,
        4: 0.0029,
        5: 0.0018,
        6: 0.0011,
        7: 0.0007,
        8: 0.0005,
        9: 0.0004,
        10: 0.0003,
        11: 0.0002,
        12: 0.0001,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Ts4: {
        1: 0.0055,
        2: 0.0055,
        3: 0.005,
        4: 0.0029,
        5: 0.0018,
        6: 0.0011,
        7: 0.0007,
        8: 0.0005,
        9: 0.0004,
        10: 0.0003,
        11: 0.0002,
        12: 0.0001,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Hh: {
        1: 0.005,
        2: 0.005,
        3: 0.003,
        4: 0.002,
        5: 0.0013,
        6: 0.0008,
        7: 0.0004,
        8: 0.0003,
        9: 0.0002,
        10: 0.0002,
        11: 0.00005,
        12: 0.00005,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      },
      Hn: {
        1: 0.004,
        2: 0.004,
        3: 0.0022,
        4: 0.0011,
        5: 0.0006,
        6: 0.0003,
        7: 0.0002,
        8: 0.0001,
        9: 0.00005,
        10: 0,
        11: 0,
        12: 0,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        21: 0,
        22: 0,
        23: 0,
        24: 0,
        25: 0,
        26: 0,
        27: 0
      }
    },
    addRate: function (textureClass, distance, value) {
      if (this.map[textureClass] === undefined)
        this.map[textureClass] = {};
      this.map[textureClass][distance] = value;
    },
    getRate: function (textureClass, distance) {
      distance = int(distance);
      var map = this.getMap(textureClass);
      return (map[distance] === undefined) ? 0.0 : map[distance];
    },
    getMap: function (textureClass) {
      if (this.map[textureClass] === undefined) {
        logger(MSG.WARN, "No capillary rise rates for texture '"+texture+"' available: using default (Sl4)");
        textureClass = 'Sl4';
      }      
      return this.map[textureClass];
    },
    size: function () { 
      var size = 0;
      for (var prop in this.map) {
        if (this.map.hasOwnProperty(prop))
          size++;
      } 
      return size;
    }
  };

  this.userInitValues = {
    p_initPercentageFC: 0.8,
    p_initSoilNitrate: 0.0001,
    p_initSoilAmmonium: 0.0001
  };

};

// TODO: refactor soilType -> textureClass
var soilCharacteristicData = {
  "columns":[
    "soil_type",
    "soil_raw_density*10",
    "air_capacity",
    "field_capacity",
    "n_field_capacity"
  ],
  "rows":[
    {
      "soil_type":"Hh",
      "soil_raw_density*10":-10.0,
      "air_capacity":10,
      "field_capacity":82,
      "n_field_capacity":65
    },
    {
      "soil_type":"Hn",
      "soil_raw_density*10":-10.0,
      "air_capacity":18,
      "field_capacity":59,
      "n_field_capacity":29
    },
    {
      "soil_type":"Ls2",
      "soil_raw_density*10":11.0,
      "air_capacity":24,
      "field_capacity":34,
      "n_field_capacity":18
    },
    {
      "soil_type":"Ls2",
      "soil_raw_density*10":13.0,
      "air_capacity":20,
      "field_capacity":31,
      "n_field_capacity":15
    },
    {
      "soil_type":"Ls2",
      "soil_raw_density*10":15.0,
      "air_capacity":13,
      "field_capacity":30,
      "n_field_capacity":14
    },
    {
      "soil_type":"Ls2",
      "soil_raw_density*10":17.0,
      "air_capacity":8,
      "field_capacity":28,
      "n_field_capacity":12
    },
    {
      "soil_type":"Ls2",
      "soil_raw_density*10":19.0,
      "air_capacity":3,
      "field_capacity":26,
      "n_field_capacity":10
    },
    {
      "soil_type":"Ls3",
      "soil_raw_density*10":11.0,
      "air_capacity":24,
      "field_capacity":34,
      "n_field_capacity":18
    },
    {
      "soil_type":"Ls3",
      "soil_raw_density*10":13.0,
      "air_capacity":21,
      "field_capacity":30,
      "n_field_capacity":14
    },
    {
      "soil_type":"Ls3",
      "soil_raw_density*10":15.0,
      "air_capacity":15,
      "field_capacity":28,
      "n_field_capacity":12
    },
    {
      "soil_type":"Ls3",
      "soil_raw_density*10":17.0,
      "air_capacity":9,
      "field_capacity":27,
      "n_field_capacity":11
    },
    {
      "soil_type":"Ls3",
      "soil_raw_density*10":19.0,
      "air_capacity":4,
      "field_capacity":25,
      "n_field_capacity":9
    },
    {
      "soil_type":"Ls4",
      "soil_raw_density*10":11.0,
      "air_capacity":25,
      "field_capacity":33,
      "n_field_capacity":18
    },
    {
      "soil_type":"Ls4",
      "soil_raw_density*10":13.0,
      "air_capacity":22,
      "field_capacity":29,
      "n_field_capacity":14
    },
    {
      "soil_type":"Ls4",
      "soil_raw_density*10":15.0,
      "air_capacity":16,
      "field_capacity":27,
      "n_field_capacity":12
    },
    {
      "soil_type":"Ls4",
      "soil_raw_density*10":17.0,
      "air_capacity":10,
      "field_capacity":26,
      "n_field_capacity":11
    },
    {
      "soil_type":"Ls4",
      "soil_raw_density*10":19.0,
      "air_capacity":5,
      "field_capacity":24,
      "n_field_capacity":9
    },
    {
      "soil_type":"Lt2",
      "soil_raw_density*10":11.0,
      "air_capacity":23,
      "field_capacity":35,
      "n_field_capacity":15
    },
    {
      "soil_type":"Lt2",
      "soil_raw_density*10":13.0,
      "air_capacity":19,
      "field_capacity":32,
      "n_field_capacity":12
    },
    {
      "soil_type":"Lt2",
      "soil_raw_density*10":15.0,
      "air_capacity":13,
      "field_capacity":30,
      "n_field_capacity":10
    },
    {
      "soil_type":"Lt2",
      "soil_raw_density*10":17.0,
      "air_capacity":8,
      "field_capacity":28,
      "n_field_capacity":8
    },
    {
      "soil_type":"Lt3",
      "soil_raw_density*10":11.0,
      "air_capacity":20,
      "field_capacity":38,
      "n_field_capacity":14
    },
    {
      "soil_type":"Lt3",
      "soil_raw_density*10":13.0,
      "air_capacity":16,
      "field_capacity":35,
      "n_field_capacity":11
    },
    {
      "soil_type":"Lt3",
      "soil_raw_density*10":15.0,
      "air_capacity":10,
      "field_capacity":33,
      "n_field_capacity":9
    },
    {
      "soil_type":"Lt3",
      "soil_raw_density*10":17.0,
      "air_capacity":5,
      "field_capacity":31,
      "n_field_capacity":7
    },
    {
      "soil_type":"Lts",
      "soil_raw_density*10":11.0,
      "air_capacity":21,
      "field_capacity":37,
      "n_field_capacity":16
    },
    {
      "soil_type":"Lts",
      "soil_raw_density*10":13.0,
      "air_capacity":17,
      "field_capacity":34,
      "n_field_capacity":13
    },
    {
      "soil_type":"Lts",
      "soil_raw_density*10":15.0,
      "air_capacity":11,
      "field_capacity":32,
      "n_field_capacity":11
    },
    {
      "soil_type":"Lts",
      "soil_raw_density*10":17.0,
      "air_capacity":6,
      "field_capacity":30,
      "n_field_capacity":9
    },
    {
      "soil_type":"Lu",
      "soil_raw_density*10":11.0,
      "air_capacity":21,
      "field_capacity":37,
      "n_field_capacity":18
    },
    {
      "soil_type":"Lu",
      "soil_raw_density*10":13.0,
      "air_capacity":18,
      "field_capacity":34,
      "n_field_capacity":15
    },
    {
      "soil_type":"Lu",
      "soil_raw_density*10":15.0,
      "air_capacity":11,
      "field_capacity":32,
      "n_field_capacity":13
    },
    {
      "soil_type":"Lu",
      "soil_raw_density*10":17.0,
      "air_capacity":6,
      "field_capacity":30,
      "n_field_capacity":11
    },
    {
      "soil_type":"Sl2",
      "soil_raw_density*10":13.0,
      "air_capacity":28,
      "field_capacity":23,
      "n_field_capacity":15
    },
    {
      "soil_type":"Sl2",
      "soil_raw_density*10":15.0,
      "air_capacity":22,
      "field_capacity":21,
      "n_field_capacity":13
    },
    {
      "soil_type":"Sl2",
      "soil_raw_density*10":17.0,
      "air_capacity":17,
      "field_capacity":19,
      "n_field_capacity":11
    },
    {
      "soil_type":"Sl2",
      "soil_raw_density*10":19.0,
      "air_capacity":11,
      "field_capacity":18,
      "n_field_capacity":10
    },
    {
      "soil_type":"Sl3",
      "soil_raw_density*10":13.0,
      "air_capacity":26,
      "field_capacity":25,
      "n_field_capacity":15
    },
    {
      "soil_type":"Sl3",
      "soil_raw_density*10":15.0,
      "air_capacity":20,
      "field_capacity":23,
      "n_field_capacity":13
    },
    {
      "soil_type":"Sl3",
      "soil_raw_density*10":17.0,
      "air_capacity":14,
      "field_capacity":22,
      "n_field_capacity":12
    },
    {
      "soil_type":"Sl3",
      "soil_raw_density*10":19.0,
      "air_capacity":9,
      "field_capacity":20,
      "n_field_capacity":10
    },
    {
      "soil_type":"Sl4",
      "soil_raw_density*10":13.0,
      "air_capacity":23,
      "field_capacity":28,
      "n_field_capacity":15
    },
    {
      "soil_type":"Sl4",
      "soil_raw_density*10":15.0,
      "air_capacity":18,
      "field_capacity":25,
      "n_field_capacity":12
    },
    {
      "soil_type":"Sl4",
      "soil_raw_density*10":17.0,
      "air_capacity":12,
      "field_capacity":24,
      "n_field_capacity":11
    },
    {
      "soil_type":"Sl4",
      "soil_raw_density*10":19.0,
      "air_capacity":4,
      "field_capacity":22,
      "n_field_capacity":9
    },
    {
      "soil_type":"Slu",
      "soil_raw_density*10":13.0,
      "air_capacity":22,
      "field_capacity":29,
      "n_field_capacity":18
    },
    {
      "soil_type":"Slu",
      "soil_raw_density*10":15.0,
      "air_capacity":16,
      "field_capacity":27,
      "n_field_capacity":15
    },
    {
      "soil_type":"Slu",
      "soil_raw_density*10":17.0,
      "air_capacity":10,
      "field_capacity":26,
      "n_field_capacity":14
    },
    {
      "soil_type":"Slu",
      "soil_raw_density*10":19.0,
      "air_capacity":4,
      "field_capacity":25,
      "n_field_capacity":13
    },
    {
      "soil_type":"Ss",
      "soil_raw_density*10":13.0,
      "air_capacity":39,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"Ss",
      "soil_raw_density*10":15.0,
      "air_capacity":31,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"Ss",
      "soil_raw_density*10":17.0,
      "air_capacity":24,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"St2",
      "soil_raw_density*10":13.0,
      "air_capacity":30,
      "field_capacity":21,
      "n_field_capacity":13
    },
    {
      "soil_type":"St2",
      "soil_raw_density*10":15.0,
      "air_capacity":25,
      "field_capacity":18,
      "n_field_capacity":10
    },
    {
      "soil_type":"St2",
      "soil_raw_density*10":17.0,
      "air_capacity":20,
      "field_capacity":16,
      "n_field_capacity":8
    },
    {
      "soil_type":"St2",
      "soil_raw_density*10":19.0,
      "air_capacity":14,
      "field_capacity":15,
      "n_field_capacity":7
    },
    {
      "soil_type":"St3",
      "soil_raw_density*10":13.0,
      "air_capacity":22,
      "field_capacity":29,
      "n_field_capacity":15
    },
    {
      "soil_type":"St3",
      "soil_raw_density*10":15.0,
      "air_capacity":17,
      "field_capacity":26,
      "n_field_capacity":12
    },
    {
      "soil_type":"St3",
      "soil_raw_density*10":17.0,
      "air_capacity":13,
      "field_capacity":23,
      "n_field_capacity":9
    },
    {
      "soil_type":"St3",
      "soil_raw_density*10":19.0,
      "air_capacity":8,
      "field_capacity":21,
      "n_field_capacity":7
    },
    {
      "soil_type":"Su2",
      "soil_raw_density*10":13.0,
      "air_capacity":30,
      "field_capacity":21,
      "n_field_capacity":16
    },
    {
      "soil_type":"Su2",
      "soil_raw_density*10":15.0,
      "air_capacity":23,
      "field_capacity":20,
      "n_field_capacity":15
    },
    {
      "soil_type":"Su2",
      "soil_raw_density*10":17.0,
      "air_capacity":18,
      "field_capacity":18,
      "n_field_capacity":13
    },
    {
      "soil_type":"Su2",
      "soil_raw_density*10":19.0,
      "air_capacity":12,
      "field_capacity":17,
      "n_field_capacity":12
    },
    {
      "soil_type":"Su3",
      "soil_raw_density*10":13.0,
      "air_capacity":25,
      "field_capacity":26,
      "n_field_capacity":19
    },
    {
      "soil_type":"Su3",
      "soil_raw_density*10":15.0,
      "air_capacity":19,
      "field_capacity":24,
      "n_field_capacity":17
    },
    {
      "soil_type":"Su3",
      "soil_raw_density*10":17.0,
      "air_capacity":14,
      "field_capacity":22,
      "n_field_capacity":15
    },
    {
      "soil_type":"Su3",
      "soil_raw_density*10":19.0,
      "air_capacity":9,
      "field_capacity":20,
      "n_field_capacity":13
    },
    {
      "soil_type":"Su4",
      "soil_raw_density*10":13.0,
      "air_capacity":24,
      "field_capacity":27,
      "n_field_capacity":20
    },
    {
      "soil_type":"Su4",
      "soil_raw_density*10":15.0,
      "air_capacity":18,
      "field_capacity":25,
      "n_field_capacity":18
    },
    {
      "soil_type":"Su4",
      "soil_raw_density*10":17.0,
      "air_capacity":12,
      "field_capacity":24,
      "n_field_capacity":17
    },
    {
      "soil_type":"Su4",
      "soil_raw_density*10":19.0,
      "air_capacity":7,
      "field_capacity":22,
      "n_field_capacity":15
    },
    {
      "soil_type":"Tl",
      "soil_raw_density*10":11.0,
      "air_capacity":12,
      "field_capacity":46,
      "n_field_capacity":14
    },
    {
      "soil_type":"Tl",
      "soil_raw_density*10":13.0,
      "air_capacity":8,
      "field_capacity":43,
      "n_field_capacity":12
    },
    {
      "soil_type":"Tl",
      "soil_raw_density*10":15.0,
      "air_capacity":4,
      "field_capacity":39,
      "n_field_capacity":8
    },
    {
      "soil_type":"Tl",
      "soil_raw_density*10":17.0,
      "air_capacity":2,
      "field_capacity":35,
      "n_field_capacity":6
    },
    {
      "soil_type":"Ts2",
      "soil_raw_density*10":11.0,
      "air_capacity":15,
      "field_capacity":43,
      "n_field_capacity":15
    },
    {
      "soil_type":"Ts2",
      "soil_raw_density*10":13.0,
      "air_capacity":11,
      "field_capacity":40,
      "n_field_capacity":13
    },
    {
      "soil_type":"Ts2",
      "soil_raw_density*10":15.0,
      "air_capacity":6,
      "field_capacity":37,
      "n_field_capacity":10
    },
    {
      "soil_type":"Ts2",
      "soil_raw_density*10":17.0,
      "air_capacity":2,
      "field_capacity":34,
      "n_field_capacity":8
    },
    {
      "soil_type":"Ts3",
      "soil_raw_density*10":11.0,
      "air_capacity":19,
      "field_capacity":39,
      "n_field_capacity":17
    },
    {
      "soil_type":"Ts3",
      "soil_raw_density*10":13.0,
      "air_capacity":15,
      "field_capacity":35,
      "n_field_capacity":14
    },
    {
      "soil_type":"Ts3",
      "soil_raw_density*10":15.0,
      "air_capacity":12,
      "field_capacity":31,
      "n_field_capacity":10
    },
    {
      "soil_type":"Ts3",
      "soil_raw_density*10":17.0,
      "air_capacity":6,
      "field_capacity":30,
      "n_field_capacity":9
    },
    {
      "soil_type":"Ts4",
      "soil_raw_density*10":11.0,
      "air_capacity":22,
      "field_capacity":36,
      "n_field_capacity":17
    },
    {
      "soil_type":"Ts4",
      "soil_raw_density*10":13.0,
      "air_capacity":18,
      "field_capacity":33,
      "n_field_capacity":14
    },
    {
      "soil_type":"Ts4",
      "soil_raw_density*10":15.0,
      "air_capacity":14,
      "field_capacity":29,
      "n_field_capacity":11
    },
    {
      "soil_type":"Ts4",
      "soil_raw_density*10":17.0,
      "air_capacity":8,
      "field_capacity":28,
      "n_field_capacity":10
    },
    {
      "soil_type":"Tt",
      "soil_raw_density*10":11.0,
      "air_capacity":9,
      "field_capacity":49,
      "n_field_capacity":13
    },
    {
      "soil_type":"Tt",
      "soil_raw_density*10":13.0,
      "air_capacity":6,
      "field_capacity":45,
      "n_field_capacity":11
    },
    {
      "soil_type":"Tt",
      "soil_raw_density*10":15.0,
      "air_capacity":3,
      "field_capacity":41,
      "n_field_capacity":7
    },
    {
      "soil_type":"Tt",
      "soil_raw_density*10":17.0,
      "air_capacity":2,
      "field_capacity":37,
      "n_field_capacity":6
    },
    {
      "soil_type":"Tu2",
      "soil_raw_density*10":11.0,
      "air_capacity":12,
      "field_capacity":46,
      "n_field_capacity":15
    },
    {
      "soil_type":"Tu2",
      "soil_raw_density*10":13.0,
      "air_capacity":8,
      "field_capacity":43,
      "n_field_capacity":13
    },
    {
      "soil_type":"Tu2",
      "soil_raw_density*10":15.0,
      "air_capacity":4,
      "field_capacity":39,
      "n_field_capacity":9
    },
    {
      "soil_type":"Tu2",
      "soil_raw_density*10":17.0,
      "air_capacity":2,
      "field_capacity":35,
      "n_field_capacity":6
    },
    {
      "soil_type":"Tu3",
      "soil_raw_density*10":11.0,
      "air_capacity":15,
      "field_capacity":43,
      "n_field_capacity":17
    },
    {
      "soil_type":"Tu3",
      "soil_raw_density*10":13.0,
      "air_capacity":11,
      "field_capacity":39,
      "n_field_capacity":14
    },
    {
      "soil_type":"Tu3",
      "soil_raw_density*10":15.0,
      "air_capacity":7,
      "field_capacity":36,
      "n_field_capacity":12
    },
    {
      "soil_type":"Tu3",
      "soil_raw_density*10":17.0,
      "air_capacity":3,
      "field_capacity":33,
      "n_field_capacity":10
    },
    {
      "soil_type":"Tu4",
      "soil_raw_density*10":11.0,
      "air_capacity":18,
      "field_capacity":40,
      "n_field_capacity":18
    },
    {
      "soil_type":"Tu4",
      "soil_raw_density*10":13.0,
      "air_capacity":13,
      "field_capacity":37,
      "n_field_capacity":15
    },
    {
      "soil_type":"Tu4",
      "soil_raw_density*10":15.0,
      "air_capacity":9,
      "field_capacity":33,
      "n_field_capacity":13
    },
    {
      "soil_type":"Tu4",
      "soil_raw_density*10":17.0,
      "air_capacity":4,
      "field_capacity":31,
      "n_field_capacity":11
    },
    {
      "soil_type":"Uls",
      "soil_raw_density*10":11.0,
      "air_capacity":27,
      "field_capacity":31,
      "n_field_capacity":20
    },
    {
      "soil_type":"Uls",
      "soil_raw_density*10":13.0,
      "air_capacity":21,
      "field_capacity":30,
      "n_field_capacity":19
    },
    {
      "soil_type":"Uls",
      "soil_raw_density*10":15.0,
      "air_capacity":14,
      "field_capacity":29,
      "n_field_capacity":18
    },
    {
      "soil_type":"Uls",
      "soil_raw_density*10":17.0,
      "air_capacity":9,
      "field_capacity":27,
      "n_field_capacity":16
    },
    {
      "soil_type":"Us",
      "soil_raw_density*10":11.0,
      "air_capacity":26,
      "field_capacity":32,
      "n_field_capacity":22
    },
    {
      "soil_type":"Us",
      "soil_raw_density*10":13.0,
      "air_capacity":20,
      "field_capacity":31,
      "n_field_capacity":21
    },
    {
      "soil_type":"Us",
      "soil_raw_density*10":15.0,
      "air_capacity":14,
      "field_capacity":29,
      "n_field_capacity":19
    },
    {
      "soil_type":"Us",
      "soil_raw_density*10":17.0,
      "air_capacity":9,
      "field_capacity":27,
      "n_field_capacity":17
    },
    {
      "soil_type":"Ut2",
      "soil_raw_density*10":11.0,
      "air_capacity":26,
      "field_capacity":32,
      "n_field_capacity":21
    },
    {
      "soil_type":"Ut2",
      "soil_raw_density*10":13.0,
      "air_capacity":20,
      "field_capacity":31,
      "n_field_capacity":20
    },
    {
      "soil_type":"Ut2",
      "soil_raw_density*10":15.0,
      "air_capacity":14,
      "field_capacity":29,
      "n_field_capacity":18
    },
    {
      "soil_type":"Ut2",
      "soil_raw_density*10":17.0,
      "air_capacity":8,
      "field_capacity":28,
      "n_field_capacity":17
    },
    {
      "soil_type":"Ut3",
      "soil_raw_density*10":11.0,
      "air_capacity":24,
      "field_capacity":34,
      "n_field_capacity":20
    },
    {
      "soil_type":"Ut3",
      "soil_raw_density*10":13.0,
      "air_capacity":19,
      "field_capacity":33,
      "n_field_capacity":19
    },
    {
      "soil_type":"Ut3",
      "soil_raw_density*10":15.0,
      "air_capacity":12,
      "field_capacity":31,
      "n_field_capacity":17
    },
    {
      "soil_type":"Ut3",
      "soil_raw_density*10":17.0,
      "air_capacity":6,
      "field_capacity":30,
      "n_field_capacity":16
    },
    {
      "soil_type":"Ut4",
      "soil_raw_density*10":11.0,
      "air_capacity":23,
      "field_capacity":35,
      "n_field_capacity":18
    },
    {
      "soil_type":"Ut4",
      "soil_raw_density*10":13.0,
      "air_capacity":17,
      "field_capacity":34,
      "n_field_capacity":17
    },
    {
      "soil_type":"Ut4",
      "soil_raw_density*10":15.0,
      "air_capacity":12,
      "field_capacity":33,
      "n_field_capacity":16
    },
    {
      "soil_type":"Ut4",
      "soil_raw_density*10":17.0,
      "air_capacity":4,
      "field_capacity":31,
      "n_field_capacity":14
    },
    {
      "soil_type":"Uu",
      "soil_raw_density*10":11.0,
      "air_capacity":22,
      "field_capacity":36,
      "n_field_capacity":25
    },
    {
      "soil_type":"Uu",
      "soil_raw_density*10":13.0,
      "air_capacity":17,
      "field_capacity":34,
      "n_field_capacity":23
    },
    {
      "soil_type":"Uu",
      "soil_raw_density*10":15.0,
      "air_capacity":11,
      "field_capacity":32,
      "n_field_capacity":21
    },
    {
      "soil_type":"Uu",
      "soil_raw_density*10":17.0,
      "air_capacity":6,
      "field_capacity":30,
      "n_field_capacity":19
    },
    {
      "soil_type":"fS",
      "soil_raw_density*10":13.0,
      "air_capacity":35,
      "field_capacity":15,
      "n_field_capacity":11
    },
    {
      "soil_type":"fS",
      "soil_raw_density*10":15.0,
      "air_capacity":28,
      "field_capacity":15,
      "n_field_capacity":11
    },
    {
      "soil_type":"fS",
      "soil_raw_density*10":17.0,
      "air_capacity":21,
      "field_capacity":15,
      "n_field_capacity":11
    },
    {
      "soil_type":"fSgs",
      "soil_raw_density*10":13.0,
      "air_capacity":35,
      "field_capacity":15,
      "n_field_capacity":11
    },
    {
      "soil_type":"fSgs",
      "soil_raw_density*10":15.0,
      "air_capacity":28,
      "field_capacity":15,
      "n_field_capacity":11
    },
    {
      "soil_type":"fSgs",
      "soil_raw_density*10":17.0,
      "air_capacity":21,
      "field_capacity":15,
      "n_field_capacity":11
    },
    {
      "soil_type":"fSms",
      "soil_raw_density*10":13.0,
      "air_capacity":35,
      "field_capacity":15,
      "n_field_capacity":11
    },
    {
      "soil_type":"fSms",
      "soil_raw_density*10":15.0,
      "air_capacity":28,
      "field_capacity":15,
      "n_field_capacity":11
    },
    {
      "soil_type":"fSms",
      "soil_raw_density*10":17.0,
      "air_capacity":21,
      "field_capacity":15,
      "n_field_capacity":11
    },
    {
      "soil_type":"gS",
      "soil_raw_density*10":13.0,
      "air_capacity":43,
      "field_capacity":8,
      "n_field_capacity":5
    },
    {
      "soil_type":"gS",
      "soil_raw_density*10":15.0,
      "air_capacity":35,
      "field_capacity":8,
      "n_field_capacity":5
    },
    {
      "soil_type":"gS",
      "soil_raw_density*10":17.0,
      "air_capacity":28,
      "field_capacity":8,
      "n_field_capacity":5
    },
    {
      "soil_type":"mS",
      "soil_raw_density*10":13.0,
      "air_capacity":38,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"mS",
      "soil_raw_density*10":15.0,
      "air_capacity":31,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"mS",
      "soil_raw_density*10":17.0,
      "air_capacity":24,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"mSfs",
      "soil_raw_density*10":13.0,
      "air_capacity":38,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"mSfs",
      "soil_raw_density*10":15.0,
      "air_capacity":31,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"mSfs",
      "soil_raw_density*10":17.0,
      "air_capacity":24,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"mSgs",
      "soil_raw_density*10":13.0,
      "air_capacity":38,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"mSgs",
      "soil_raw_density*10":15.0,
      "air_capacity":24,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"mSgs",
      "soil_raw_density*10":17.0,
      "air_capacity":31,
      "field_capacity":12,
      "n_field_capacity":9
    }
  ]
};

var soilAggregationValues = {
  "columns":[
    "soil_type",
    "organic_matter*10",
    "air_capacity",
    "field_capacity",
    "n_field_capacity"
  ],
  "rows":[
    {
      "soil_type":"Ls2",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Ls2",
      "organic_matter*10":30.0,
      "air_capacity":0,
      "field_capacity":4,
      "n_field_capacity":3
    },
    {
      "soil_type":"Ls2",
      "organic_matter*10":60.0,
      "air_capacity":1,
      "field_capacity":7,
      "n_field_capacity":5
    },
    {
      "soil_type":"Ls2",
      "organic_matter*10":115.0,
      "air_capacity":2,
      "field_capacity":13,
      "n_field_capacity":9
    },
    {
      "soil_type":"Ls3",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":2
    },
    {
      "soil_type":"Ls3",
      "organic_matter*10":30.0,
      "air_capacity":0,
      "field_capacity":4,
      "n_field_capacity":4
    },
    {
      "soil_type":"Ls3",
      "organic_matter*10":60.0,
      "air_capacity":1,
      "field_capacity":7,
      "n_field_capacity":6
    },
    {
      "soil_type":"Ls3",
      "organic_matter*10":115.0,
      "air_capacity":2,
      "field_capacity":13,
      "n_field_capacity":9
    },
    {
      "soil_type":"Ls4",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"Ls4",
      "organic_matter*10":30.0,
      "air_capacity":0,
      "field_capacity":5,
      "n_field_capacity":4
    },
    {
      "soil_type":"Ls4",
      "organic_matter*10":60.0,
      "air_capacity":1,
      "field_capacity":8,
      "n_field_capacity":7
    },
    {
      "soil_type":"Ls4",
      "organic_matter*10":115.0,
      "air_capacity":2,
      "field_capacity":13,
      "n_field_capacity":10
    },
    {
      "soil_type":"Lt2",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Lt2",
      "organic_matter*10":30.0,
      "air_capacity":1,
      "field_capacity":4,
      "n_field_capacity":3
    },
    {
      "soil_type":"Lt2",
      "organic_matter*10":60.0,
      "air_capacity":2,
      "field_capacity":6,
      "n_field_capacity":4
    },
    {
      "soil_type":"Lt2",
      "organic_matter*10":115.0,
      "air_capacity":3,
      "field_capacity":10,
      "n_field_capacity":7
    },
    {
      "soil_type":"Lt3",
      "organic_matter*10":15.0,
      "air_capacity":1,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Lt3",
      "organic_matter*10":30.0,
      "air_capacity":2,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"Lt3",
      "organic_matter*10":60.0,
      "air_capacity":3,
      "field_capacity":5,
      "n_field_capacity":3
    },
    {
      "soil_type":"Lt3",
      "organic_matter*10":115.0,
      "air_capacity":4,
      "field_capacity":10,
      "n_field_capacity":6
    },
    {
      "soil_type":"Lts",
      "organic_matter*10":15.0,
      "air_capacity":1,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Lts",
      "organic_matter*10":30.0,
      "air_capacity":2,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"Lts",
      "organic_matter*10":60.0,
      "air_capacity":3,
      "field_capacity":6,
      "n_field_capacity":4
    },
    {
      "soil_type":"Lts",
      "organic_matter*10":115.0,
      "air_capacity":4,
      "field_capacity":10,
      "n_field_capacity":7
    },
    {
      "soil_type":"Lu",
      "organic_matter*10":15.0,
      "air_capacity":1,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Lu",
      "organic_matter*10":30.0,
      "air_capacity":2,
      "field_capacity":4,
      "n_field_capacity":2
    },
    {
      "soil_type":"Lu",
      "organic_matter*10":60.0,
      "air_capacity":3,
      "field_capacity":7,
      "n_field_capacity":5
    },
    {
      "soil_type":"Lu",
      "organic_matter*10":115.0,
      "air_capacity":4,
      "field_capacity":12,
      "n_field_capacity":8
    },
    {
      "soil_type":"Sl2",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Sl2",
      "organic_matter*10":30.0,
      "air_capacity":-1,
      "field_capacity":5,
      "n_field_capacity":3
    },
    {
      "soil_type":"Sl2",
      "organic_matter*10":60.0,
      "air_capacity":-2,
      "field_capacity":8,
      "n_field_capacity":5
    },
    {
      "soil_type":"Sl2",
      "organic_matter*10":115.0,
      "air_capacity":-3,
      "field_capacity":16,
      "n_field_capacity":10
    },
    {
      "soil_type":"Sl3",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Sl3",
      "organic_matter*10":30.0,
      "air_capacity":-1,
      "field_capacity":4,
      "n_field_capacity":3
    },
    {
      "soil_type":"Sl3",
      "organic_matter*10":60.0,
      "air_capacity":-2,
      "field_capacity":8,
      "n_field_capacity":5
    },
    {
      "soil_type":"Sl3",
      "organic_matter*10":115.0,
      "air_capacity":-3,
      "field_capacity":15,
      "n_field_capacity":10
    },
    {
      "soil_type":"Sl4",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Sl4",
      "organic_matter*10":30.0,
      "air_capacity":-1,
      "field_capacity":4,
      "n_field_capacity":3
    },
    {
      "soil_type":"Sl4",
      "organic_matter*10":60.0,
      "air_capacity":-2,
      "field_capacity":8,
      "n_field_capacity":5
    },
    {
      "soil_type":"Sl4",
      "organic_matter*10":115.0,
      "air_capacity":-3,
      "field_capacity":14,
      "n_field_capacity":10
    },
    {
      "soil_type":"Slu",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Slu",
      "organic_matter*10":30.0,
      "air_capacity":-1,
      "field_capacity":4,
      "n_field_capacity":3
    },
    {
      "soil_type":"Slu",
      "organic_matter*10":60.0,
      "air_capacity":-2,
      "field_capacity":8,
      "n_field_capacity":5
    },
    {
      "soil_type":"Slu",
      "organic_matter*10":115.0,
      "air_capacity":-3,
      "field_capacity":4,
      "n_field_capacity":10
    },
    {
      "soil_type":"Ss",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":4,
      "n_field_capacity":2
    },
    {
      "soil_type":"Ss",
      "organic_matter*10":30.0,
      "air_capacity":-1,
      "field_capacity":8,
      "n_field_capacity":4
    },
    {
      "soil_type":"Ss",
      "organic_matter*10":60.0,
      "air_capacity":-3,
      "field_capacity":12,
      "n_field_capacity":7
    },
    {
      "soil_type":"Ss",
      "organic_matter*10":115.0,
      "air_capacity":-5,
      "field_capacity":21,
      "n_field_capacity":13
    },
    {
      "soil_type":"St2",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"St2",
      "organic_matter*10":30.0,
      "air_capacity":0,
      "field_capacity":6,
      "n_field_capacity":4
    },
    {
      "soil_type":"St2",
      "organic_matter*10":60.0,
      "air_capacity":-1,
      "field_capacity":9,
      "n_field_capacity":5
    },
    {
      "soil_type":"St2",
      "organic_matter*10":115.0,
      "air_capacity":-2,
      "field_capacity":15,
      "n_field_capacity":7
    },
    {
      "soil_type":"St3",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"St3",
      "organic_matter*10":30.0,
      "air_capacity":0,
      "field_capacity":6,
      "n_field_capacity":4
    },
    {
      "soil_type":"St3",
      "organic_matter*10":60.0,
      "air_capacity":0,
      "field_capacity":8,
      "n_field_capacity":6
    },
    {
      "soil_type":"St3",
      "organic_matter*10":115.0,
      "air_capacity":1,
      "field_capacity":14,
      "n_field_capacity":8
    },
    {
      "soil_type":"Su2",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"Su2",
      "organic_matter*10":30.0,
      "air_capacity":-1,
      "field_capacity":6,
      "n_field_capacity":4
    },
    {
      "soil_type":"Su2",
      "organic_matter*10":60.0,
      "air_capacity":-2,
      "field_capacity":10,
      "n_field_capacity":7
    },
    {
      "soil_type":"Su2",
      "organic_matter*10":115.0,
      "air_capacity":-3,
      "field_capacity":16,
      "n_field_capacity":10
    },
    {
      "soil_type":"Su3",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"Su3",
      "organic_matter*10":30.0,
      "air_capacity":-1,
      "field_capacity":6,
      "n_field_capacity":4
    },
    {
      "soil_type":"Su3",
      "organic_matter*10":60.0,
      "air_capacity":-2,
      "field_capacity":10,
      "n_field_capacity":6
    },
    {
      "soil_type":"Su3",
      "organic_matter*10":115.0,
      "air_capacity":-3,
      "field_capacity":15,
      "n_field_capacity":9
    },
    {
      "soil_type":"Su4",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"Su4",
      "organic_matter*10":30.0,
      "air_capacity":0,
      "field_capacity":6,
      "n_field_capacity":4
    },
    {
      "soil_type":"Su4",
      "organic_matter*10":60.0,
      "air_capacity":-1,
      "field_capacity":9,
      "n_field_capacity":6
    },
    {
      "soil_type":"Su4",
      "organic_matter*10":115.0,
      "air_capacity":-2,
      "field_capacity":14,
      "n_field_capacity":9
    },
    {
      "soil_type":"Tl",
      "organic_matter*10":15.0,
      "air_capacity":2,
      "field_capacity":1,
      "n_field_capacity":1
    },
    {
      "soil_type":"Tl",
      "organic_matter*10":30.0,
      "air_capacity":3,
      "field_capacity":2,
      "n_field_capacity":2
    },
    {
      "soil_type":"Tl",
      "organic_matter*10":60.0,
      "air_capacity":4,
      "field_capacity":4,
      "n_field_capacity":3
    },
    {
      "soil_type":"Tl",
      "organic_matter*10":115.0,
      "air_capacity":5,
      "field_capacity":7,
      "n_field_capacity":5
    },
    {
      "soil_type":"Ts2",
      "organic_matter*10":15.0,
      "air_capacity":1,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"Ts2",
      "organic_matter*10":30.0,
      "air_capacity":2,
      "field_capacity":5,
      "n_field_capacity":4
    },
    {
      "soil_type":"Ts2",
      "organic_matter*10":60.0,
      "air_capacity":3,
      "field_capacity":8,
      "n_field_capacity":6
    },
    {
      "soil_type":"Ts2",
      "organic_matter*10":115.0,
      "air_capacity":5,
      "field_capacity":12,
      "n_field_capacity":8
    },
    {
      "soil_type":"Ts3",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"Ts3",
      "organic_matter*10":30.0,
      "air_capacity":1,
      "field_capacity":5,
      "n_field_capacity":4
    },
    {
      "soil_type":"Ts3",
      "organic_matter*10":60.0,
      "air_capacity":2,
      "field_capacity":8,
      "n_field_capacity":6
    },
    {
      "soil_type":"Ts3",
      "organic_matter*10":115.0,
      "air_capacity":5,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"Ts4",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"Ts4",
      "organic_matter*10":30.0,
      "air_capacity":1,
      "field_capacity":5,
      "n_field_capacity":4
    },
    {
      "soil_type":"Ts4",
      "organic_matter*10":60.0,
      "air_capacity":2,
      "field_capacity":8,
      "n_field_capacity":6
    },
    {
      "soil_type":"Ts4",
      "organic_matter*10":115.0,
      "air_capacity":4,
      "field_capacity":12,
      "n_field_capacity":9
    },
    {
      "soil_type":"Tt",
      "organic_matter*10":15.0,
      "air_capacity":3,
      "field_capacity":1,
      "n_field_capacity":1
    },
    {
      "soil_type":"Tt",
      "organic_matter*10":30.0,
      "air_capacity":4,
      "field_capacity":2,
      "n_field_capacity":2
    },
    {
      "soil_type":"Tt",
      "organic_matter*10":60.0,
      "air_capacity":5,
      "field_capacity":3,
      "n_field_capacity":3
    },
    {
      "soil_type":"Tt",
      "organic_matter*10":115.0,
      "air_capacity":7,
      "field_capacity":6,
      "n_field_capacity":5
    },
    {
      "soil_type":"Tu2",
      "organic_matter*10":15.0,
      "air_capacity":2,
      "field_capacity":1,
      "n_field_capacity":1
    },
    {
      "soil_type":"Tu2",
      "organic_matter*10":30.0,
      "air_capacity":3,
      "field_capacity":2,
      "n_field_capacity":2
    },
    {
      "soil_type":"Tu2",
      "organic_matter*10":60.0,
      "air_capacity":4,
      "field_capacity":4,
      "n_field_capacity":3
    },
    {
      "soil_type":"Tu2",
      "organic_matter*10":115.0,
      "air_capacity":5,
      "field_capacity":7,
      "n_field_capacity":5
    },
    {
      "soil_type":"Tu3",
      "organic_matter*10":15.0,
      "air_capacity":1,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Tu3",
      "organic_matter*10":30.0,
      "air_capacity":2,
      "field_capacity":3,
      "n_field_capacity":2
    },
    {
      "soil_type":"Tu3",
      "organic_matter*10":60.0,
      "air_capacity":3,
      "field_capacity":5,
      "n_field_capacity":4
    },
    {
      "soil_type":"Tu3",
      "organic_matter*10":115.0,
      "air_capacity":5,
      "field_capacity":8,
      "n_field_capacity":6
    },
    {
      "soil_type":"Tu4",
      "organic_matter*10":15.0,
      "air_capacity":1,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Tu4",
      "organic_matter*10":30.0,
      "air_capacity":2,
      "field_capacity":4,
      "n_field_capacity":2
    },
    {
      "soil_type":"Tu4",
      "organic_matter*10":60.0,
      "air_capacity":3,
      "field_capacity":6,
      "n_field_capacity":4
    },
    {
      "soil_type":"Tu4",
      "organic_matter*10":115.0,
      "air_capacity":5,
      "field_capacity":9,
      "n_field_capacity":7
    },
    {
      "soil_type":"Uls",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Uls",
      "organic_matter*10":30.0,
      "air_capacity":1,
      "field_capacity":4,
      "n_field_capacity":3
    },
    {
      "soil_type":"Uls",
      "organic_matter*10":60.0,
      "air_capacity":2,
      "field_capacity":7,
      "n_field_capacity":5
    },
    {
      "soil_type":"Uls",
      "organic_matter*10":115.0,
      "air_capacity":3,
      "field_capacity":12,
      "n_field_capacity":8
    },
    {
      "soil_type":"Us",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Us",
      "organic_matter*10":30.0,
      "air_capacity":0,
      "field_capacity":4,
      "n_field_capacity":3
    },
    {
      "soil_type":"Us",
      "organic_matter*10":60.0,
      "air_capacity":1,
      "field_capacity":7,
      "n_field_capacity":5
    },
    {
      "soil_type":"Us",
      "organic_matter*10":115.0,
      "air_capacity":2,
      "field_capacity":12,
      "n_field_capacity":8
    },
    {
      "soil_type":"Ut2",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Ut2",
      "organic_matter*10":30.0,
      "air_capacity":1,
      "field_capacity":5,
      "n_field_capacity":3
    },
    {
      "soil_type":"Ut2",
      "organic_matter*10":60.0,
      "air_capacity":2,
      "field_capacity":9,
      "n_field_capacity":6
    },
    {
      "soil_type":"Ut2",
      "organic_matter*10":115.0,
      "air_capacity":3,
      "field_capacity":13,
      "n_field_capacity":8
    },
    {
      "soil_type":"Ut3",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Ut3",
      "organic_matter*10":30.0,
      "air_capacity":1,
      "field_capacity":5,
      "n_field_capacity":3
    },
    {
      "soil_type":"Ut3",
      "organic_matter*10":60.0,
      "air_capacity":2,
      "field_capacity":9,
      "n_field_capacity":6
    },
    {
      "soil_type":"Ut3",
      "organic_matter*10":115.0,
      "air_capacity":3,
      "field_capacity":13,
      "n_field_capacity":8
    },
    {
      "soil_type":"Ut4",
      "organic_matter*10":15.0,
      "air_capacity":1,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Ut4",
      "organic_matter*10":30.0,
      "air_capacity":2,
      "field_capacity":5,
      "n_field_capacity":3
    },
    {
      "soil_type":"Ut4",
      "organic_matter*10":60.0,
      "air_capacity":3,
      "field_capacity":9,
      "n_field_capacity":6
    },
    {
      "soil_type":"Ut4",
      "organic_matter*10":115.0,
      "air_capacity":4,
      "field_capacity":13,
      "n_field_capacity":8
    },
    {
      "soil_type":"Uu",
      "organic_matter*10":15.0,
      "air_capacity":0,
      "field_capacity":2,
      "n_field_capacity":1
    },
    {
      "soil_type":"Uu",
      "organic_matter*10":30.0,
      "air_capacity":0,
      "field_capacity":4,
      "n_field_capacity":2
    },
    {
      "soil_type":"Uu",
      "organic_matter*10":60.0,
      "air_capacity":1,
      "field_capacity":7,
      "n_field_capacity":4
    },
    {
      "soil_type":"Uu",
      "organic_matter*10":115.0,
      "air_capacity":2,
      "field_capacity":12,
      "n_field_capacity":7
    }
  ]
};


'use strict';

var MineralFertilizer = function (name, carbamid, no3, nh4) {

  var _name = (name !== undefined && name !== null) ? name.toLowerCase() : ''
    , _vo_Carbamid = carbamid || 0 // [kg (N) kg-1 (N)]
    , _vo_NO3 = no3 || 0           // [kg (N) kg-1 (N)]
    , _vo_NH4 = nh4 || 0           // [kg (N) kg-1 (N)]
    ;

  if (_name === 'ammonium nitrate') {
    _vo_NO3 = 0.5;
    _vo_NH4 = 0.5;
    _vo_Carbamid = 0;
  } else if (_name === 'ammonium phosphate') {
    _vo_NO3 = 0;
    _vo_NH4 = 1;
    _vo_Carbamid = 0;
  } else if (_name === 'ammonium sulphate') {
    _vo_NO3 = 0;
    _vo_NH4 = 1;
    _vo_Carbamid = 0;
  } else if (_name === 'potassium nitrate') {
    _vo_NO3 = 1;
    _vo_NH4 = 0;
    _vo_Carbamid = 0;
  } else if (_name === 'compound fertiliser (0 no3, 100 nh4)') {
    _vo_NO3 = 0;
    _vo_NH4 = 1;
    _vo_Carbamid = 0;
  } else if (_name === 'compound fertiliser (35 no3, 65 nh4)') {
    _vo_NO3 = 0.35;
    _vo_NH4 = 0.65;
    _vo_Carbamid = 0;
  } else if (_name === 'compound fertiliser (43 no3, 57 nh4)') {
    _vo_NO3 = 0.435;
    _vo_NH4 = 0.565;
    _vo_Carbamid = 0;
  } else if (_name === 'compound fertiliser (50 no3, 50 nh4)') {
    _vo_NO3 = 0.5;
    _vo_NH4 = 0.5;
    _vo_Carbamid = 0;
  } else if (_name === 'urea') {
    _vo_NO3 = 0;
    _vo_NH4 = 0;
    _vo_Carbamid = 1;
  } else if (_name === 'urea ammonium nitrate') {
    _vo_NO3 = 0.25;
    _vo_NH4 = 0.25;
    _vo_Carbamid = 0.5;
  } else if (_name === 'urea ammonium sulphate') {
    _vo_NO3 = 0;
    _vo_NH4 = 0.18;
    _vo_Carbamid = 0.82;
  } else if (_name !== undefined) {
    logger(MSG.INFO, 'Custom mineral fertilzer.');
  }

  return {

    getName: function () { 
      return _name; 
    },
    getCarbamid: function () { 
      return _vo_Carbamid; 
    },
    getNH4: function () { 
      return _vo_NH4; 
    },
    getNO3: function () { 
      return _vo_NO3; 
    }
    
  };

};


var OrganicFertilizer = function (name, carbamid, no3, nh4, dm) {

  this.name = (name !== undefined && name !== null) ? name.toLowerCase() : '';

  this.vo_AOM_DryMatterContent = dm || 0.0;       // [kg (DM) kg-1 (FM)]
  this.vo_AOM_NH4Content = nh4 || 0.0;            // [kg (N)  kg-1 (DM)]
  this.vo_AOM_NO3Content = no3 || 0.0;            // [kg (N)  kg-1 (DM)]
  this.vo_AOM_CarbamidContent = carbamid || 0.0;  // [kg (N)  kg-1 (DM)]
  this.vo_AOM_SlowDecCoeffStandard = 0.0002;
  this.vo_AOM_FastDecCoeffStandard = 0.002;
  this.vo_PartAOM_to_AOM_Slow = 0.72;
  this.vo_PartAOM_to_AOM_Fast = 0.18;
  this.vo_CN_Ratio_AOM_Slow = 100;
  this.vo_CN_Ratio_AOM_Fast = 6.5;
  this.vo_PartAOM_Slow_to_SMB_Slow = 0;
  this.vo_PartAOM_Slow_to_SMB_Fast = 1;
  this.vo_NConcentration = 0.00;
  this.vo_DaysAfterApplication = 0;

  if (this.name === 'cattle deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.289;
    this.vo_AOM_NH4Content = 0.007;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 7.3;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'cattle manure') {
    this.vo_AOM_DryMatterContent = 0.196;
    this.vo_AOM_NH4Content = 0.007;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 6.5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'cattle slurry') {
    this.vo_AOM_DryMatterContent = 0.103;
    this.vo_AOM_NH4Content = 0.032;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 6.1;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'cattle urine') {
    this.vo_AOM_DryMatterContent = 0.033;
    this.vo_AOM_NH4Content = 0.146;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 8.4;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'duck or goose deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.35;
    this.vo_AOM_NH4Content = 0.024;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 2.1;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'green-waste compost') {
    this.vo_AOM_DryMatterContent = 0.5;
    this.vo_AOM_NH4Content = 0.002;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 8;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'horse deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.26;
    this.vo_AOM_NH4Content = 0.008;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 5.3;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'maize straw') {
    this.vo_AOM_DryMatterContent = 0.85;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 50;
    this.vo_CN_Ratio_AOM_Fast = 6;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'mushroom compost') {
    this.vo_AOM_DryMatterContent = 0.39;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 6;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'oilseed-rape cake fert. (5-1-10)') {
    this.vo_AOM_DryMatterContent = 0.9;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.012;
    this.vo_AOM_FastDecCoeffStandard = 0.05;
    this.vo_PartAOM_to_AOM_Slow = 0.38;
    this.vo_PartAOM_to_AOM_Fast = 0.62;
    this.vo_CN_Ratio_AOM_Slow = 47.7;
    this.vo_CN_Ratio_AOM_Fast = 6;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'pig deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.33;
    this.vo_AOM_NH4Content = 0.009;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 4.8;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'pig manue') {
    this.vo_AOM_DryMatterContent = 0.039;
    this.vo_AOM_NH4Content = 0.014;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'pig slurry') {
    this.vo_AOM_DryMatterContent = 0.054;
    this.vo_AOM_NH4Content = 0.068;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 5.7;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'pig slurry-dk') {
    this.vo_AOM_DryMatterContent = 0.05;
    this.vo_AOM_NH4Content = 0.08;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 85;
    this.vo_CN_Ratio_AOM_Fast = 5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'pig urine') {
    this.vo_AOM_DryMatterContent = 0.02;
    this.vo_AOM_NH4Content = 0.162;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 7.3;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'potato liquid waste') {
    this.vo_AOM_DryMatterContent = 0.02;
    this.vo_AOM_NH4Content = 0.028;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 4.5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'poultry deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.633;
    this.vo_AOM_NH4Content = 0.037;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 1.3;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'poultry manure') {
    this.vo_AOM_DryMatterContent = 0.4;
    this.vo_AOM_NH4Content = 0.019;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 3.5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'sewage sludge') {
    this.vo_AOM_DryMatterContent = 0.141;
    this.vo_AOM_NH4Content = 0.089;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 0.5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'soybean straw') {
    this.vo_AOM_DryMatterContent = 0.85;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 30;
    this.vo_CN_Ratio_AOM_Fast = 6;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'turkey deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.48;
    this.vo_AOM_NH4Content = 0.038;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 1.3;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'weeds') {
    this.vo_AOM_DryMatterContent = 0.85;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 30;
    this.vo_CN_Ratio_AOM_Fast = 6;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'wheat straw') {
    this.vo_AOM_DryMatterContent = 0.85;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 8;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'wood ashes') {
    this.vo_AOM_DryMatterContent = 1;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.9;
    this.vo_PartAOM_to_AOM_Fast = 0.1;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 10;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name !== undefined) {
    logger(MSG.INFO, 'Custom organic fertilzer.');
  }

  this.vo_NConcentration = this.vo_AOM_NO3Content + this.vo_AOM_NH4Content + this.vo_AOM_CarbamidContent;

};


/*
  Changes
    - Cutting.apply() 
      prim. yield auskommentiert, p.yield immer 0.00, da organId 0 ????
      store results
    - var Cutting = function ()
      + cropResult
*/

var WorkStep = function (date) {

  this._date = date;

  this.date = function () { 
    return this._date; 
  };

  this.setDate = function (date) {
    this._date = date; 
  };

  //! do whatever the workstep has to do
  this.apply = function (model) {};

  this.clone = function () {};

  this.toString = function () {
    return "date: " + this.date().toString();
  };

};


var Seed = function (date, crop) {

  WorkStep.call(this, date);

  this._date = date;
  this._crop = crop;

  this.setDate = function (date) {
    this._date = date;
    this._crop.setSeedAndHarvestDate(this.date(), this._crop.harvestDate());
  };

  this.apply = function (model) {
    logger(MSG.INFO, "seeding crop: " + this._crop.name() + " at: " + this.date().toISOString().split('T')[0]);
    model.seedCrop(this._crop);
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

  this.toString = function () {
    return "seeding at: " + this.date().toString() + " crop: " + this._crop.toString();
  };

};

Seed.prototype = Object.create(WorkStep);
Seed.prototype.constructor = Seed;


var Harvest = function (at, crop, cropResult) {

  WorkStep.call(this, at);
  
  this._date = at;
  this._crop = crop;
  this._cropResult = cropResult;

  this.setDate = function (date) {
    this._date = date;
    this._crop.setSeedAndHarvestDate(this._crop.seedDate(), this.date());
  };

  this.apply = function (model) {
  
    if (model.cropGrowth()) {

      logger(MSG.INFO, "harvesting crop: " + this._crop.name() + " at: " + this.date().toString());

      if (model.currentCrop() == this._crop) {

        if (model.cropGrowth()) {
          this._crop.setHarvestYields(
            model.cropGrowth().get_FreshPrimaryCropYield() /
            100.0, model.cropGrowth().get_FreshSecondaryCropYield() / 100.0
          );
          this._crop.setHarvestYieldsTM(
            model.cropGrowth().get_PrimaryCropYield() / 100.0,
            model.cropGrowth().get_SecondaryCropYield() / 100.0
          );
          this._crop.setYieldNContent(
            model.cropGrowth().get_PrimaryYieldNContent(),
            model.cropGrowth().get_SecondaryYieldNContent()
          );
          this._crop.setSumTotalNUptake(model.cropGrowth().get_SumTotalNUptake());
          this._crop.setCropHeight(model.cropGrowth().get_CropHeight());
          this._crop.setAccumulatedETa(model.cropGrowth().get_AccumulatedETa());
        }

        //store results for this crop
        this._cropResult['id'] = this._crop.id();
        this._cropResult['name'] = this._crop.name();
        this._cropResult['primaryYield'] = roundN(2, this._crop.primaryYield());
        this._cropResult['secondaryYield'] = roundN(2, this._crop.secondaryYield());
        this._cropResult['primaryYieldTM'] = roundN(2, this._crop.primaryYieldTM());
        this._cropResult['secondaryYieldTM'] = roundN(2, this._crop.secondaryYieldTM());
        this._cropResult['sumIrrigation'] = roundN(2, this._crop.appliedIrrigationWater());
        this._cropResult['biomassNContent'] = roundN(2, this._crop.primaryYieldN());
        this._cropResult['aboveBiomassNContent'] = roundN(2, this._crop.aboveGroundBiomasseN());
        this._cropResult['daysWithCrop'] = roundN(2, model.daysWithCrop());
        this._cropResult['sumTotalNUptake'] = roundN(2, this._crop.sumTotalNUptake());
        this._cropResult['cropHeight'] = roundN(2, this._crop.cropHeight());
        this._cropResult['sumETaPerCrop'] = roundN(2, this._crop.get_AccumulatedETa());
        this._cropResult['NStress'] = roundN(2, model.getAccumulatedNStress());
        this._cropResult['WaterStress'] = roundN(2, model.getAccumulatedWaterStress());
        this._cropResult['HeatStress'] = roundN(2, model.getAccumulatedHeatStress());
        this._cropResult['OxygenStress'] = roundN(2, model.getAccumulatedOxygenStress());
        this._cropResult['sumFertiliser'] = roundN(2, model.sumFertiliser());

        model.harvestCurrentCrop();

      } else {
          logger(MSG.INFO, "Crop: " + model.currentCrop().toString()
            + " to be harvested isn't actual crop of this Harvesting action: "
            + this._crop.toString());
      }
    }
  
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

  this.toString = function () {
    return "harvesting at: " + this.date().toString() + " crop: " + this._crop.toString();
  };

};

Harvest.prototype = Object.create(WorkStep);
Harvest.prototype.constructor = Harvest;

var Cutting = function (at, crop, cropResult) {

  WorkStep.call(this, at);
  
  this._date = at;
  this._crop = crop;
  this._cropResult = cropResult;

  this.apply = function (model) {
  
    logger(MSG.INFO, "Cutting crop: " + this._crop.name() + " at: " + this.date().toString());
    if (model.currentCrop() == this._crop) {
      // if (model.cropGrowth()) {
        // this._crop.setHarvestYields(
        //   model.cropGrowth().get_FreshPrimaryCropYield() /
        //   100.0, model.cropGrowth().get_FreshSecondaryCropYield() / 100.0
        // );
        // this._crop.setHarvestYieldsTM(
        //   model.cropGrowth().get_PrimaryCropYield() / 100.0,
        //   model.cropGrowth().get_SecondaryCropYield() / 100.0
        // );
        // this._crop.addCuttingYieldDM(model.cropGrowth().get_PrimaryCropYield() / 100.0);
      // }
      // this._crop.setYieldNContent(
      //   model.cropGrowth().get_PrimaryYieldNContent(),
      //   model.cropGrowth().get_SecondaryYieldNContent()
      // );
      // this._crop.setSumTotalNUptake(model.cropGrowth().get_SumTotalNUptake());
      // this._crop.setCropHeight(model.cropGrowth().get_CropHeight());

      var cut = {
          id: this._crop.id()
        , name: this._crop.name()
        , date: this._date
        , primaryYieldTM: model.cropGrowth().get_PrimaryCropYield() / 100.0
      };

      if (fs) {
        var str = '';
        str += this._date.getFullYear() + ';' + round(cut.primaryYieldTM) + '\n';
        fs.appendFileSync('./out/cutting_yields.csv', str, { encoding: 'utf8' });

      }
      //store results for this crop
      if (!this._cropResult.cuts)
        this._cropResult.cuts = [];
      this._cropResult.cuts.push(cut);

      if (model.cropGrowth())
          model.cropGrowth().applyCutting();
    }
  
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

  this.toString = function () {
    return "Cutting at: " + this.date().toString() + " crop: " + this._crop.toString();
  };
};

Cutting.prototype = Object.create(WorkStep);
Cutting.prototype.constructor = Cutting;


var MineralFertiliserApplication = function (at, partition, amount) {

  WorkStep.call(this, at);

  this._date = at;
  this._partition = partition;
  this._amount = amount;

  this.apply = function (model) {
    model.applyMineralFertiliser(this._partition, this._amount);
  };

  this.partition = function () {
    return this._partition;
  };

  this.amount = function () { 
    return this._amount; 
  };

  this.toString = function () {
    return "applying mineral fertiliser at: " + this._date.toString() + " amount: " + this._amount + " partition: "
        + this.partition().toString();
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

};

MineralFertiliserApplication.prototype = Object.create(WorkStep);
MineralFertiliserApplication.prototype.constructor = MineralFertiliserApplication;


var OrganicFertiliserApplication = function (at, parameters, amount, incorp) {

  WorkStep.call(this, at);

  this._date = at;
  this._parameters = parameters;
  this._amount = amount; /* [kg (FM) ha-1] */
  this._incrop = (incorp === undefined) ? true : incorp;

  this.apply = function (model) {
    model.applyOrganicFertiliser(this._parameters, this._amount, this._incrop);
  };

  this.parameters = function () {
    return this._parameters;
  };

  this.amount = function () { 
    return this._amount; 
  };

  this.incorporation = function () { 
    return this._incorporation; 
  };

  this.toString = function () {
    return (
      "applying organic fertiliser at: " + this.date().toString() + " amount: " + 
      this.amount() + "\tN percentage: " + this._parameters.vo_NConcentration + "\tN amount: " + 
      this.amount() * this._parameters.vo_NConcentration
    );
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

};

OrganicFertiliserApplication.prototype = Object.create(WorkStep);
OrganicFertiliserApplication.prototype.constructor = OrganicFertiliserApplication;


var TillageApplication = function (at, depth) {

  WorkStep.call(this, at);

  this._date = at;
  this._depth = depth;

  this.apply = function (model) {
    model.applyTillage(this._depth);
  };

  this.toString = function () {
    return "applying tillage at: " + this.date().toString() + " depth: " + this._depth;
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

};

TillageApplication.prototype = Object.create(WorkStep);
TillageApplication.prototype.constructor = TillageApplication;


var IrrigationApplication = function (at, amount, parameters) {

  WorkStep.call(this, at);

  this._date = at;
  this._amount = amount;
  this._parameters = parameters;

  this.apply = function (model) {
    model.applyIrrigation(this.amount(), this.nitrateConcentration());
  };

  this.amount = function () { 
    return this._amount; 
  };

  this.nitrateConcentration = function () { 
    return this._parameters.nitrateConcentration; 
  };

  this.sulfateConcentration = function () { 
    return this._parameters.sulfateConcentration; 
  };

  this.toString = function () {
    return "applying irrigation at: " + this.date().toString() + " amount: " + this.amount() + " nitrateConcentration: "
      + this.nitrateConcentration() + " sulfateConcentration: " + this.sulfateConcentration();
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

};

IrrigationApplication.prototype = Object.create(WorkStep);
IrrigationApplication.prototype.constructor = IrrigationApplication;


/*

  Changes:
    - var getWorkstep = function (date)

*/

var ProductionProcess = function (name, crop) {

var that = this
  , _name = name
  , _crop = crop
  , _worksteps = []
  , _cropResult = []
  ;
  
  _worksteps.equal_range = function (date) {
  var ws = [];
  this.forEach(function (w, i) {
    if (w.date().setHours(0,0,0,0) === date.setHours(0,0,0,0)) 
      ws.push(w)
  });
  return ws;
};

_worksteps.upper_bound = function (date) {
  for (var i = 0, is = this.length; i < is; i++) {
    if (this[i].date().setHours(0,0,0,0) > date.setHours(0,0,0,0))
      return this[i];
  }
  return null;
};

var addApplication = function (app) {

  _worksteps.push(app);
  _worksteps.sort(function (a_, b_) {
    var a = a_.date()
      , b = b_.date()
      ;
    return (a < b) ? -1 : ((a > b) ? 1 : 0);
  });

};

if ((crop.seedDate().setHours(0,0,0,0) != new Date(1951, 0, 1).setHours(0,0,0,0)) && (crop.seedDate().setHours(0,0,0,0) != new Date(0,0,0).setHours(0,0,0,0)))
  addApplication(new Seed(crop.seedDate(), crop));
if ((crop.harvestDate().isValid() && crop.harvestDate().setHours(0,0,0,0) != new Date(1951, 0, 1).setHours(0,0,0,0)) && (crop.harvestDate().setHours(0,0,0,0) != new Date(0,0,0).setHours(0,0,0,0)))
{
  addApplication(new Harvest(crop.harvestDate(), crop , _cropResult));
}

var cuttingDates = crop.getCuttingDates();
var size = cuttingDates.length;

for (var i=0; i<size; i++) {
  //    if (i<size-1) {
  addApplication(new Cutting(Date(cuttingDates.at(i)), crop));
  //    } else {
  //      addApplication(Harvest(crop.harvestDate(), crop, _cropResult));
  //    }
}

/**
 * @brief Copy constructor
 * @param new_pp
 */
/*
ProductionProcess::ProductionProcess(const ProductionProcess& other)
{
  _name = other._name;
  _crop = CropPtr(new Crop(*(other._crop.get())));
  _cropResult = PVResultPtr(new PVResult(*(other._cropResult.get())));

  _worksteps = other._worksteps;
}
*/

var deepCloneAndClearWorksteps = function () {
  // TODO:
  // ProductionProcess clone(name(), CropPtr(new Crop(*(crop().get()))));
  // clone._cropResult = PVResultPtr(new PVResult(*(_cropResult.get())));
  // return clone;
};

var apply = function (date, model) {
  var p = _worksteps.equal_range(date);
  p.forEach(function (ws) {
    ws.apply(model);
  });
};

var nextDate = function (date) {
  var p = _worksteps.upper_bound(date);
  return !p ? new Date(Infinity) : p.date();
};

var getWorkstep = function (date) {
  var ws_ = null;
  _worksteps.forEach(function (ws) {
    if (ws.date().setHours(0, 0, 0, 0) === date.setHours(0, 0, 0, 0))
      ws_ = ws;
  });
  return ws_;
};

var start = function () {
  if (_worksteps.length === 0)
    return new Date(Infinity);
  return _worksteps[0].date();
};

var end = function () {
  if (_worksteps.length === 0)
    return new Date(Infinity);
  return _worksteps[_worksteps.length - 1];
};

var toString = function () {
  var s = "";
  s += "name: " + _name + " start: " + start().toString()
      + " end: " + end().toString() + "\n";
  s += "worksteps:" + "\n";
  _worksteps.forEach(function (ws) {
    s += "at: " + ws.date().toString()
        + " what: " + ws.toString() + "\n";
  });
  return s;
};


return {
  getWorkstep: getWorkstep,
  deepCloneAndClearWorksteps: deepCloneAndClearWorksteps,
  addApplication: addApplication,
  apply: apply,
  nextDate: nextDate,
  name: function () { 
    return _name; 
  },
  crop: function () { 
    return _crop; 
  },
  isFallow: function () { 
    return !_crop.isValid();  
  },
  //! when does the PV start
  start: start,
  //! when does the whole PV end
  end: end,
  getWorksteps:function () { 
    return _worksteps; 
  },
  clearWorksteps: function () { 
    _worksteps = []; 
  },
  toString: toString,
  // cropResult() const { return *(_cropResult.get()); }
  // cropResultPtr() const { return _cropResult; }
  //the custom id is used to keep a potentially usage defined
  //mapping to entity from another domain,
  //e.g. the an Carbiocial CropActivity which is ProductionProcess was based on
  setCustomId: function (cid) { 
    _customId = cid; 
  },
  // customId: function () { 
  //   return _customId; 
  // }
  cropResult: function () { 
    return _cropResult; 
  }
};

};



var Weather = function (startDate, endDate) {

  this._startDate = startDate;
  this._endDate = endDate;
  this._data = [];
  this._numberOfSteps = 0;
  this._offset = 0;
  this._dates = [];

  this.setData = function (data) {
    
    this._data = data;
    this._offset = data[WEATHER.ISODATESTRING].indexOf(this._startDate.toISOString().split('T')[0]);

    var endIdx = data[WEATHER.ISODATESTRING].indexOf(this._endDate.toISOString().split('T')[0]);
    
    if (this._offset < 0) {
      this._numberOfSteps = 0;
      logger(MSG.ERROR, 'Start date not valid: no. of steps is 0');
      throw new Error('Start date not valid: no. of steps is 0');
    }

    if (endIdx < 0) {
      endIdx = this._data[WEATHER.ISODATESTRING].length - 1;
      this._endDate = new Date(Date.parse(this._data[WEATHER.ISODATESTRING][endIdx]));
      logger(MSG.WARN, 'End date not found: end date adjusted to ' + this._endDate.toISOString().split('T')[0]);
    }

    for (var i = 0; i < this._numberOfSteps; i++)
      this._dates[i] = new Date(Date.parse(this._data[WEATHER.ISODATESTRING][i]));

    this._numberOfSteps = endIdx - this._offset;

  };

  this.date = function (stepNo) {
    return this._dates[stepNo + this._offset];
  };

  this.isValid = function () { 
    return this._numberOfSteps > 0;
  };

  this.dataForTimestep = function (index, dayOfSimulation) {
    return this._data[index][dayOfSimulation + this._offset];
  };

  this.noOfStepsPossible = function () {
    return this._numberOfSteps; 
  };

  this.startDate = function () {
    return this._startDate; 
  };

  this.endDate = function () {
    return this._endDate; 
  };

  this.julianDayForStep = function (stepNo) {

    if (this._data[WEATHER.DOY].length > 0) {
      return this._data[WEATHER.DOY][stepNo + this._offset];
    } else {
      var newDate = new Date(this._startDate.getFullYear(), this._startDate.getMonth(), this._startDate.getDate() + stepNo);
      return ceil((newDate - new Date(newDate.getFullYear(), 0, 1)) / 86400000) + 1;
    }
  
  };

  this.isAvailable = function (index) {
    return this._data[index].length > 0;
  };

};


'use strict';

var FieldCrop = function (name) {

  var _id = -1
    , _name = name.toLowerCase()
    , _accumulatedETa = 0.0
    , _appliedAmountIrrigation = 0
    , _cropHeight = 0.0
    , _crossCropAdaptionFactor = 1 
    , _cuttingDates = []
    , _cuttingYieldsDM = []
    , _harvestDate = new Date(Infinity)
    , _seedDate = new Date(Infinity)
    , _primaryYield = 0
    , _primaryYieldN = 0
    , _primaryYieldTM = 0
    , _secondaryYield = 0
    , _secondaryYieldN = 0
    , _secondaryYieldTM = 0
    , _sumTotalNUptake = 0
    , _residueParams = null
    , _cropParams = null
    ;

  if (_name === 'winter wheat') {
    _id = 1;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.5, 0.5, 0, 0],
        [0.2, 0.2, 0.6, 0],
        [0.13, 0.2, 0.67, 0],
        [0, 0, 0.03, 0.97],
        [0, 0, 0, 1],
        [0, 0, 0, 0]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.05, 0, 0],
        [0, 0.05, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [0, 1, 1, 1, 9, 9],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 20, 0, 0],
      pc_DroughtStressThreshold: [1, 0.9, 1, 1, 0.9, 0.8],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.0018, 0.0017, 0.0016, 0.0015, 0.0015],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.1, 0.8, 0.25],
      pc_StageTemperatureSum: [148, 284, 380, 200, 420, 25],
      pc_VernalisationRequirement: [0, 50, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.85, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [
        {organId: 2, yieldPercentage: 0.85, yieldDryMatter: 0.86},
        {organId: 3, yieldPercentage: 0.9, yieldDryMatter: 0.86}
      ],
      organIdsForCutting: [],
      pc_CropName: 'winter wheat',
      pc_MaxAssimilationRate: 52,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 4,
      pc_CropSpecificMaxRootingDepth: 1.3,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 1.6,
      pc_NConcentrationB0: 2,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 1,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.3,
      pc_MaxCropHeight: 0.83,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 230,
      pc_TargetN30: 120,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 6,
      pc_CropHeightP2: 0.5,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.005,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 461,
      pc_HeatSumIrrigationEnd: 1676,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 220,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0011,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 620,
      pc_EndSensitivePhaseHeatStress: 740,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'winter wheat',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 200,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'winter barley') {
    _id = 2;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.5, 0.5, 0, 0],
        [0.3, 0.2, 0.5, 0],
        [0.1, 0.2, 0.4, 0.3],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 0]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.05, 0, 0],
        [0, 0.05, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [1, 1, 1, 1, 9, 9],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 20, 0, 0],
      pc_DroughtStressThreshold: [0.8, 0.8, 0.8, 0.75, 0.6, 0.5],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.0019, 0.0018, 0.0017, 0.0016, 0.0016],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.1, 0.8, 0.25],
      pc_StageTemperatureSum: [108, 284, 300, 120, 260, 25],
      pc_VernalisationRequirement: [0, 33, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.04, 0.04, 0.04, 0.04, 0.04],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.85, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [
        {organId: 2, yieldPercentage: 0.85, yieldDryMatter: 0.86},
        {organId: 3, yieldPercentage: 0.9, yieldDryMatter: 0.86}
      ],
      organIdsForCutting: [],
      pc_CropName: 'winter barley',
      pc_MaxAssimilationRate: 40,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 4,
      pc_CropSpecificMaxRootingDepth: 1.3,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 1.6,
      pc_NConcentrationB0: 2,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 1,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.3,
      pc_MaxCropHeight: 0.87,
      pc_ResidueNRatio: 0.3,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 200,
      pc_TargetN30: 120,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 12,
      pc_CropHeightP2: 0.6,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.004,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 560,
      pc_HeatSumIrrigationEnd: 1032,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 220,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0011,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'winter barley',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 180,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'winter rye') {
    _id = 3;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.53, 0.47, 0, 0],
        [0.2, 0.6, 0.2, 0],
        [0.13, 0.37, 0.5, 0],
        [0, 0, 0.25, 0.75],
        [0, 0, 0, 1],
        [0, 0, 0, 0]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.03, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [1, 1, 1, 1, 9, 9],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 20, 0, 0],
      pc_DroughtStressThreshold: [1, 0.7, 0.75, 0.75, 0.6, 0.5],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.002, 0.002, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.1, 0.8, 0.25],
      pc_StageTemperatureSum: [148, 284, 200, 400, 350, 25],
      pc_VernalisationRequirement: [0, 50, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.95, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [
        {organId: 2, yieldPercentage: 0.85, yieldDryMatter: 0.86},
        {organId: 3, yieldPercentage: 0.9, yieldDryMatter: 0.86}
      ],
      organIdsForCutting: [],
      pc_CropName: 'winter rye',
      pc_MaxAssimilationRate: 38,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 3,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 1.6,
      pc_NConcentrationB0: 2,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 1,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.3,
      pc_MaxCropHeight: 1.5,
      pc_ResidueNRatio: 0.3,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 200,
      pc_TargetN30: 120,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 12,
      pc_CropHeightP2: 0.55,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.004,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 406,
      pc_HeatSumIrrigationEnd: 934,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 220,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'winter rye',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 200,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'spring barley') {
    _id = 4;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.5, 0.5, 0, 0],
        [0.25, 0.23, 0.52, 0],
        [0.17, 0.23, 0.5, 0.1],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 0]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0.002, 0],
        [0, 0.03, 0.002, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 0, 0, 0],
      pc_BaseTemperature: [1, 1, 1, 1, 9, 9],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 0, 0, 0],
      pc_DroughtStressThreshold: [0.8, 0.8, 0.8, 0.75, 0.6, 0.5],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.0019, 0.0018, 0.0017, 0.0016, 0.0016],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.4, 0.6, 1, 1, 0.8, 0.25],
      pc_StageTemperatureSum: [108, 284, 330, 120, 200, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.04, 0.04, 0.04, 0.04, 0.04],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.95, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [
        {organId: 2, yieldPercentage: 0.85, yieldDryMatter: 0.86},
        {organId: 3, yieldPercentage: 0.85, yieldDryMatter: 0.86}
      ],
      organIdsForCutting: [],
      pc_CropName: 'spring barley',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 4,
      pc_CropSpecificMaxRootingDepth: 1.3,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 1.6,
      pc_NConcentrationB0: 2,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 1,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.3,
      pc_MaxCropHeight: 0.87,
      pc_ResidueNRatio: 0.3,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 200,
      pc_TargetN30: 120,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 12,
      pc_CropHeightP2: 0.6,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.004,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 560,
      pc_HeatSumIrrigationEnd: 1032,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 220,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0011,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 550,
      pc_EndSensitivePhaseHeatStress: 670,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'spring barley',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 180,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'grain maize') {
    _id = 5;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.4, 0, 0],
        [0.55, 0.25, 0.2, 0],
        [0.2, 0.2, 0.6, 0],
        [0.05, 0.05, 0.65, 0.25],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0.005, 0.001, 0, 0],
        [0.1, 0.003, 0, 0],
        [0.1, 0.005, 0.013, 0],
        [0, 0.02, 0.02, 0]
      ],
      pc_BaseDaylength: [0, 0, 0, 0, 0, 0, 0],
      pc_BaseTemperature: [7, 6, 6, 6, 9, 9, 9],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_DroughtStressThreshold: [0.5, 0.5, 0.5, 0.5, 0.6, 0.6, 0.2],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.01, 0.007],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.01, 0.007],
      pc_SpecificLeafArea: [0.0028, 0.002, 0.002, 0.0019, 0.0018, 0.0018, 0.0018],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.4, 1, 1, 1.2, 1.25, 1.25, 1],
      pc_StageTemperatureSum: [68, 284, 190, 250, 200, 400, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [12, 12, 0, 0],
      pc_CriticalOxygenContent: [0.04, 0.02, 0.02, 0.02, 0.02, 0.02, 0.04],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.78, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'grain maize',
      pc_MaxAssimilationRate: 96,
      pc_CarboxylationPathway: 2,
      pc_MinimumTemperatureForAssimilation: 6,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.004,
      pc_NConcentrationPN: 1,
      pc_NConcentrationB0: 5,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 2,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 200,
      pc_TargetN30: 60,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.025,
      pc_StageAtMaxDiameter: 4,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 993,
      pc_MaxNUptakeParam: 7.4,
      pc_RootDistributionParam: 0.0035,
      pc_PlantDensity: 10,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 9,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0014,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 0,
      pc_EndSensitivePhaseHeatStress: 0,
      pc_DroughtImpactOnFertilityFactor: 0.5,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'grain maize',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.61,
      vo_PartAOM_to_AOM_Fast: 0.39,
      vo_CN_Ratio_AOM_Slow: 225,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'silage maize') {
    _id = 7;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.65, 0.35, 0, 0],
        [0.6, 0.2, 0.2, 0],
        [0.2, 0.2, 0.6, 0],
        [0.05, 0.05, 0.65, 0.25],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0.005, 0.001, 0, 0],
        [0.1, 0.003, 0, 0],
        [0.1, 0.005, 0.013, 0],
        [0, 0.02, 0.02, 0]
      ],
      pc_BaseDaylength: [0, 0, 0, 0, 0, 0, 0],
      pc_BaseTemperature: [7, 6, 6, 6, 9, 9, 9],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_DroughtStressThreshold: [0.5, 0.5, 0.5, 0.5, 0.6, 0.6, 0.2],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.01, 0.007],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.01, 0.007],
      pc_SpecificLeafArea: [0.0025, 0.0017, 0.0015, 0.0014, 0.0012, 0.0012, 0.0012],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.4, 1, 1, 1.2, 1.25, 1.25, 1],
      pc_StageTemperatureSum: [68, 284, 190, 250, 200, 400, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [12, 12, 0, 0],
      pc_CriticalOxygenContent: [0.04, 0.02, 0.02, 0.02, 0.02, 0.02, 0.04],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [
        {organId: 2, yieldPercentage: 0.9, yieldDryMatter: 0.32},
        {organId: 3, yieldPercentage: 0.9, yieldDryMatter: 0.32},
        {organId: 4, yieldPercentage: 1, yieldDryMatter: 0.32}
      ],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'silage maize',
      pc_MaxAssimilationRate: 96,
      pc_CarboxylationPathway: 2,
      pc_MinimumTemperatureForAssimilation: 6,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.004,
      pc_NConcentrationPN: 1,
      pc_NConcentrationB0: 5,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 2,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 200,
      pc_TargetN30: 60,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.025,
      pc_StageAtMaxDiameter: 4,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 993,
      pc_MaxNUptakeParam: 7.4,
      pc_RootDistributionParam: 0.0035,
      pc_PlantDensity: 10,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 9,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0014,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 0,
      pc_EndSensitivePhaseHeatStress: 0,
      pc_DroughtImpactOnFertilityFactor: 0.5,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'silage maize',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.61,
      vo_PartAOM_to_AOM_Fast: 0.39,
      vo_CN_Ratio_AOM_Slow: 225,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'winter rape') {
    _id = 9;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.5, 0.5, 0, 0],
        [0.2, 0.4, 0.4, 0],
        [0.13, 0.17, 0.7, 0],
        [0, 0, 0.1, 0.9],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.01, 0, 0],
        [0, 0.01, 0, 0],
        [0, 0.01, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [0, 1, 1, 1, 1, 1],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 20, 0, 0],
      pc_DroughtStressThreshold: [1, 0.8, 0.8, 0.8, 0.8, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.002, 0.002, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.6, 1.1, 1.3, 1.1, 0.8, 0.6],
      pc_StageTemperatureSum: [130, 284, 160, 160, 900, 25],
      pc_VernalisationRequirement: [0, 35, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.03],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.55, yieldDryMatter: 0.91}],
      organIdsForSecondaryYield: [
        {organId: 2, yieldPercentage: 0.85, yieldDryMatter: 0.35},
        {organId: 3, yieldPercentage: 0.85, yieldDryMatter: 0.35}
      ],
      organIdsForCutting: [],
      pc_CropName: 'winter rape',
      pc_MaxAssimilationRate: 50,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 4,
      pc_CropSpecificMaxRootingDepth: 1.5,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 1.35,
      pc_NConcentrationB0: 3.5,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.1,
      pc_MaxCropHeight: 0.8,
      pc_ResidueNRatio: 0.3,
      pc_SamplingDepth: 0.6,
      pc_TargetNSamplingDepth: 340,
      pc_TargetN30: 120,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 450,
      pc_HeatSumIrrigationEnd: 1000,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 100,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.002,
      pc_RootFormFactor: 1.5,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 0,
      pc_EndSensitivePhaseHeatStress: 0,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'winter rape',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.78,
      vo_PartAOM_to_AOM_Fast: 0.22,
      vo_CN_Ratio_AOM_Slow: 227,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'sugar beet') {
    _id = 10;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.54, 0.28, 0.18, 0],
        [0.15, 0.41, 0.41, 0.02],
        [0, 0.15, 0.27, 0.58],
        [0, 0.01, 0.01, 0.98],
        [0, 0, 0.01, 0.99],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.001, 0, 0],
        [0.08, 0.005, 0, 0],
        [0.08, 0.01, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 0, 0, 0, 0],
      pc_BaseTemperature: [3, 3, 0, 0, 0, 0],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 0, 0, 0, 0, 0],
      pc_DroughtStressThreshold: [1, 0.7, 0.8, 0.8, 0.8, 0.7],
      pc_OrganMaintenanceRespiration: [0.015, 0.03, 0.003, 0.01],
      pc_OrganGrowthRespiration: [0.015, 0.03, 0.003, 0.01],
      pc_SpecificLeafArea: [0.0009, 0.001, 0.001, 0.0009, 0.0009, 0.0009],
      pc_StageMaxRootNConcentration: [0.02, 0.015, 0.012, 0.01, 0.009, 0.009],
      pc_StageKcFactor: [0.4, 0.8, 1, 1.35, 0.85, 0.4],
      pc_StageTemperatureSum: [100, 300, 565, 608, 1600, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [5, 10, 0, 0],
      pc_CriticalOxygenContent: [0.03, 0.03, 0.03, 0.03, 0.03, 0.03],
      pc_AbovegroundOrgan: [false, true, true, false],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 1, yieldDryMatter: 0.23}],
      organIdsForSecondaryYield: [{organId: 2, yieldPercentage: 0.95, yieldDryMatter: 0.16}],
      organIdsForCutting: [],
      pc_CropName: 'sugar beet',
      pc_MaxAssimilationRate: 100,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 7,
      pc_CropSpecificMaxRootingDepth: 1.6,
      pc_MinimumNConcentration: 0.004,
      pc_NConcentrationPN: 1.35,
      pc_NConcentrationB0: 3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.65,
      pc_MaxCropHeight: 0.5,
      pc_ResidueNRatio: 2,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 200,
      pc_TargetN30: 200,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 600,
      pc_HeatSumIrrigationEnd: 1691,
      pc_MaxNUptakeParam: 5.645,
      pc_RootDistributionParam: 0.0012,
      pc_PlantDensity: 8,
      pc_RootGrowthLag: -60,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.06,
      pc_RootPenetrationRate: 0.0011,
      pc_RootFormFactor: 2,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 0,
      pc_EndSensitivePhaseHeatStress: 0,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'sugar beet',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.38,
      vo_PartAOM_to_AOM_Fast: 0.62,
      vo_CN_Ratio_AOM_Slow: 47.7,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'mustard') {
    _id = 11;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.5, 0.5, 0.2, 0],
        [0.2, 0.6, 0.2, 0],
        [0.13, 0.33, 0.54, 0],
        [0, 0, 0.04, 0.96],
        [0, 0, 0, 1],
        [0, 0, 0, 0]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.03, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [1, 1, 1, 1, 1, 1],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 20, 0, 0],
      pc_DroughtStressThreshold: [1, 0.8, 0.8, 0.8, 0.8, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.002, 0.002, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.6, 1.1, 1.3, 1.1, 0.8, 0.6],
      pc_StageTemperatureSum: [40, 284, 200, 400, 350, 25],
      pc_VernalisationRequirement: [0, 50, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.03],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [
        {organId: 2, yieldPercentage: 0.01, yieldDryMatter: 0.15},
        {organId: 3, yieldPercentage: 0.01, yieldDryMatter: 0.15},
        {organId: 4, yieldPercentage: 0.01, yieldDryMatter: 0.15}
      ],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'mustard',
      pc_MaxAssimilationRate: 65,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 4,
      pc_CropSpecificMaxRootingDepth: 1.5,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 2.5,
      pc_NConcentrationB0: 2.5,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 1,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 20,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.6,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 450,
      pc_HeatSumIrrigationEnd: 1000,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 600,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0008,
      pc_RootFormFactor: 2,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 0,
      pc_EndSensitivePhaseHeatStress: 0,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'mustard',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.005,
      vo_AOM_FastDecCoeffStandard: 0.025,
      vo_PartAOM_to_AOM_Slow: 0.38,
      vo_PartAOM_to_AOM_Fast: 0.62,
      vo_CN_Ratio_AOM_Slow: 47.7,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'oil raddich') {
    _id = 17;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.5, 0.5, 0, 0],
        [0.2, 0.6, 0.2, 0],
        [0.13, 0.33, 0.54, 0],
        [0, 0, 0.04, 0.96],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [1, 1, 1, 1, 1, 1],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 20, 0, 0],
      pc_DroughtStressThreshold: [1, 0.8, 0.8, 0.8, 0.8, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.002, 0.002, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.3, 0.7, 0.9, 0.99, 0.6, 0.6],
      pc_StageTemperatureSum: [148, 150, 200, 200, 325, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.03],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [
        {organId: 2, yieldPercentage: 0.85, yieldDryMatter: 0.3},
        {organId: 3, yieldPercentage: 0.85, yieldDryMatter: 0.3},
        {organId: 4, yieldPercentage: 0.85, yieldDryMatter: 0.91}
      ],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'oil raddich',
      pc_MaxAssimilationRate: 60.08,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 4,
      pc_CropSpecificMaxRootingDepth: 1.5,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 2,
      pc_NConcentrationB0: 9.492,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 1,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.1,
      pc_MaxCropHeight: 0.8,
      pc_ResidueNRatio: 0.3,
      pc_SamplingDepth: 0.6,
      pc_TargetNSamplingDepth: 340,
      pc_TargetN30: 120,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 8.77,
      pc_CropHeightP2: 0.428,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 450,
      pc_HeatSumIrrigationEnd: 1000,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 100,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.002,
      pc_RootFormFactor: 1.5,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 0,
      pc_EndSensitivePhaseHeatStress: 0,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'oil raddich',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.78,
      vo_PartAOM_to_AOM_Fast: 0.22,
      vo_CN_Ratio_AOM_Slow: 227,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'winter triticale') {
    _id = 19;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.5, 0.5, 0, 0],
        [0.2, 0.3, 0.5, 0],
        [0.13, 0.3, 0.57, 0],
        [0, 0, 0.06, 0.94],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.04, 0, 0],
        [0, 0.04, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [0, 1, 1, 1, 9, 9],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 0, 0, 0],
      pc_DroughtStressThreshold: [1, 0.7, 0.75, 0.75, 0.6, 0.5],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.0018, 0.0017, 0.0016, 0.0015, 0.0015],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.04, 0.7, 1, 1.1, 0.8, 0.25],
      pc_StageTemperatureSum: [300, 650, 200, 250, 300, 25],
      pc_VernalisationRequirement: [0, 50, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.85, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [
        {organId: 2, yieldPercentage: 0.85, yieldDryMatter: 0.86},
        {organId: 3, yieldPercentage: 0.85, yieldDryMatter: 0.86}
      ],
      organIdsForCutting: [],
      pc_CropName: 'winter triticale',
      pc_MaxAssimilationRate: 48,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 3,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 1.6,
      pc_NConcentrationB0: 2,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 1,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.3,
      pc_MaxCropHeight: 1.1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 230,
      pc_TargetN30: 120,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 6.84,
      pc_CropHeightP2: 0.53,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.005,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 461,
      pc_HeatSumIrrigationEnd: 1676,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 220,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 0,
      pc_EndSensitivePhaseHeatStress: 0,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'winter triticale',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 200,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'spring rye') {
    _id = 20;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.53, 0.47, 0, 0],
        [0.2, 0.6, 0.2, 0],
        [0.13, 0.37, 0.5, 0],
        [0, 0, 0.25, 0.75],
        [0, 0, 0, 1],
        [0, 0, 0, 0]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.03, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [1, 1, 1, 1, 9, 9],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 20, 0, 0],
      pc_DroughtStressThreshold: [1, 0.3, 0.3, 0.3, 0.3, 0.3],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.002, 0.002, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.1, 0.8, 0.25],
      pc_StageTemperatureSum: [148, 284, 200, 400, 350, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.95, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [
        {organId: 2, yieldPercentage: 0.85, yieldDryMatter: 0.86},
        {organId: 3, yieldPercentage: 0.9, yieldDryMatter: 0.86}
      ],
      organIdsForCutting: [],
      pc_CropName: 'spring rye',
      pc_MaxAssimilationRate: 38,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 3,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 1.6,
      pc_NConcentrationB0: 2,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 1,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.3,
      pc_MaxCropHeight: 1.3,
      pc_ResidueNRatio: 0.3,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 200,
      pc_TargetN30: 120,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 12,
      pc_CropHeightP2: 0.55,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.004,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 406,
      pc_HeatSumIrrigationEnd: 934,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 220,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'spring rye',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 200,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'oat compound') {
    _id = 22;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.53, 0.47, 0, 0],
        [0.2, 0.6, 0.2, 0],
        [0.13, 0.37, 0.5, 0],
        [0, 0, 0.25, 0.75],
        [0, 0, 0, 1],
        [0, 0, 0, 0]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.03, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [1, 1, 1, 1, 9, 9],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 20, 0, 0],
      pc_DroughtStressThreshold: [1, 0.7, 0.75, 0.75, 0.6, 0.5],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.002, 0.002, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.4244, 0.7, 0.9, 0.9, 0.61, 0.25],
      pc_StageTemperatureSum: [100, 299.9, 419.2, 200, 200, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.95, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [
        {organId: 2, yieldPercentage: 0.85, yieldDryMatter: 0.86},
        {organId: 3, yieldPercentage: 0.9, yieldDryMatter: 0.86}
      ],
      organIdsForCutting: [],
      pc_CropName: 'oat compound',
      pc_MaxAssimilationRate: 38.32,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 3,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 2,
      pc_NConcentrationB0: 1.963,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 1,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.2,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.3,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 200,
      pc_TargetN30: 120,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 3.74,
      pc_CropHeightP2: 0.55,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.004,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 406,
      pc_HeatSumIrrigationEnd: 934,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 220,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0011,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'oat compound',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.38,
      vo_PartAOM_to_AOM_Fast: 0.62,
      vo_CN_Ratio_AOM_Slow: 47.7,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'spring triticale') {
    _id = 23;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.5, 0.5, 0, 0],
        [0.2, 0.3, 0.5, 0],
        [0.13, 0.3, 0.57, 0],
        [0, 0, 0.06, 0.94],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.04, 0, 0],
        [0, 0.04, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [0, 1, 1, 1, 9, 9],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 0, 0, 0],
      pc_DroughtStressThreshold: [0, 0, 0, 0, 0, 0],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.0018, 0.0017, 0.0016, 0.0015, 0.0015],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.1, 0.3, 0.6, 0.7, 0.7, 0.25],
      pc_StageTemperatureSum: [150, 200, 400, 350, 300, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.85, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [
        {organId: 2, yieldPercentage: 0.85, yieldDryMatter: 0.86},
        {organId: 3, yieldPercentage: 0.85, yieldDryMatter: 0.86}
      ],
      organIdsForCutting: [],
      pc_CropName: 'spring triticale',
      pc_MaxAssimilationRate: 45,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 3,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 1.6,
      pc_NConcentrationB0: 2,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 1,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.3,
      pc_MaxCropHeight: 0.9,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 230,
      pc_TargetN30: 120,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 12,
      pc_CropHeightP2: 0.55,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.005,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 461,
      pc_HeatSumIrrigationEnd: 1676,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 220,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 0,
      pc_EndSensitivePhaseHeatStress: 0,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'spring triticale',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 200,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'field pea') {
    _id = 24;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.5, 0.5, 0, 0],
        [0.2, 0.5, 0.3, 0],
        [0.13, 0.33, 0.54, 0],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 0]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [1, 1, 1, 1, 1, 1],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 20, 0, 0],
      pc_DroughtStressThreshold: [1, 0.7, 0.75, 0.75, 0.6, 0.5],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.0018, 0.0017, 0.0016, 0.0015, 0.0015],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.1, 0.8, 0.25],
      pc_StageTemperatureSum: [25, 160, 210, 180, 480, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.8, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [
        {organId: 2, yieldPercentage: 0.9, yieldDryMatter: 0.86},
        {organId: 3, yieldPercentage: 0.9, yieldDryMatter: 0.86}
      ],
      organIdsForCutting: [],
      pc_CropName: 'field pea',
      pc_MaxAssimilationRate: 60,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 3,
      pc_CropSpecificMaxRootingDepth: 0.7,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 1.35,
      pc_NConcentrationB0: 3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.74,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 0.5,
      pc_ResidueNRatio: 0.8,
      pc_SamplingDepth: 0.6,
      pc_TargetNSamplingDepth: 110,
      pc_TargetN30: 40,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.005,
      pc_StageAtMaxDiameter: 4,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 993,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 220,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.06,
      pc_RootPenetrationRate: 0.0007,
      pc_RootFormFactor: 1,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 0,
      pc_EndSensitivePhaseHeatStress: 0,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'field pea',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.38,
      vo_PartAOM_to_AOM_Fast: 0.62,
      vo_CN_Ratio_AOM_Slow: 47.7,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'spring wheat') {
    _id = 25;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 6,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.5, 0.5, 0, 0],
        [0.2, 0.2, 0.6, 0],
        [0.13, 0.2, 0.67, 0],
        [0, 0, 0.03, 0.97],
        [0, 0, 0, 1],
        [0, 0, 0, 0.8]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.05, 0, 0],
        [0, 0.05, 0, 0]
      ],
      pc_BaseDaylength: [0, 0, 7, 7, 0, 0],
      pc_BaseTemperature: [0, 1, 1, 1, 9, 9],
      pc_OptimumTemperature: [30, 30, 30, 30, 30, 30],
      pc_DaylengthRequirement: [0, 20, 20, 20, 0, 0],
      pc_DroughtStressThreshold: [1, 0.9, 1, 1, 0.9, 0.8],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.002, 0.0018, 0.0017, 0.0016, 0.0015, 0.0015],
      pc_StageMaxRootNConcentration: [0.02, 0.02, 0.012, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.6, 0.7, 1.1, 1.1, 0.8, 0.25],
      pc_StageTemperatureSum: [120, 284, 380, 180, 435, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [53, 53, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.85, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [
        {organId: 2, yieldPercentage: 0.85, yieldDryMatter: 0.86},
        {organId: 3, yieldPercentage: 0.9, yieldDryMatter: 0.86}
      ],
      organIdsForCutting: [],
      pc_CropName: 'spring wheat',
      pc_MaxAssimilationRate: 52,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 4,
      pc_CropSpecificMaxRootingDepth: 1.3,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 1.6,
      pc_NConcentrationB0: 2,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 1,
      pc_FixingN: 0,
      pc_LuxuryNCoeff: 1.3,
      pc_MaxCropHeight: 0.83,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 230,
      pc_TargetN30: 120,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 6,
      pc_CropHeightP2: 0.5,
      pc_StageAtMaxHeight: 3,
      pc_MaxCropDiameter: 0.005,
      pc_StageAtMaxDiameter: 2,
      pc_HeatSumIrrigationStart: 461,
      pc_HeatSumIrrigationEnd: 1676,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 220,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 0,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0011,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 780,
      pc_EndSensitivePhaseHeatStress: 900,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: 0,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'spring wheat',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 200,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean 000') {
    _id = 28;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -22.35, -22.35, -22.35, -22.35, -22.35, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 25, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -14.6, -14.6, -14.6, -14.6, -14.6, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 457, 323, 500, 770, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean 000',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1.2,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean 000',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean 00') {
    _id = 29;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -21.1, -21.1, -21.1, -21.1, -21.1, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 25],
      pc_DaylengthRequirement: [0, -14.35, -14.35, -14.35, -14.35, -14.35, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.01],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 473, 323, 500, 783, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean 00',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean 00',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean 0') {
    _id = 30;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 0]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -19.95, -19.95, -19.95, -19.95, -19.95, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -14.1, -14.1, -14.1, -14.1, -14.1, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 500, 350, 500, 804, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean 0',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean 0',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean i') {
    _id = 31;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -18.75, -18.75, -18.75, -18.75, -18.75, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -13.84, -13.84, -13.84, -13.84, -13.84, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 506, 350, 500, 825, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean i',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean i',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean ii') {
    _id = 32;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -17.6, -17.6, -17.6, -17.6, -17.6, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -13.59, -13.59, -13.59, -13.59, -13.59, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 519, 363, 500, 846, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean ii',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean ii',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean iii') {
    _id = 33;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -16.9, -16.9, -16.9, -16.9, -16.9, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -13.4, -13.4, -13.4, -13.4, -13.4, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 571, 377, 500, 867, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean iii',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean iii',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean iv') {
    _id = 34;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -16.5, -16.5, -16.5, -16.5, -16.5, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -13.09, -13.09, -13.09, -13.09, -13.09, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 584, 404, 500, 887, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean iv',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean iv',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean v') {
    _id = 35;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -16.1, -16.1, -16.1, -16.1, -16.1, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -12.83, -12.83, -12.83, -12.83, -12.83, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 597, 417, 500, 908, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean v',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean v',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean vi') {
    _id = 36;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -15.8, -15.8, -15.8, -15.8, -15.8, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -12.58, -12.58, -12.58, -12.58, -12.58, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 611, 430, 500, 929, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean vi',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean vi',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean vii') {
    _id = 37;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -15.45, -15.45, -15.45, -15.45, -15.45, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -12.33, -12.33, -12.33, -12.33, -12.33, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.7, 0.9, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 630, 430, 500, 950, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean vii',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean vii',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean viii') {
    _id = 38;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -15.1, -15.1, -15.1, -15.1, -15.1, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -12.07, -12.07, -12.07, -12.07, -12.07, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 653, 430, 500, 971, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean viii',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean viii',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean ix') {
    _id = 39;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -14.82, -14.82, -14.82, -14.82, -14.82, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -11.88, -11.88, -11.88, -11.88, -11.88, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 702, 430, 500, 976, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean ix',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean ix',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean x') {
    _id = 40;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -14.65, -14.65, -14.65, -14.65, -14.65, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -11.78, -11.78, -11.78, -11.78, -11.78, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 718, 430, 500, 976, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean x',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean x',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean xi') {
    _id = 41;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -14.5, -14.5, -14.5, -14.5, -14.5, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -11.7, -11.7, -11.7, -11.7, -11.7, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 630, 430, 500, 950, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean xi',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean xi',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  } else if (_name === 'soy bean xii') {
    _id = 42;
    _cropParams = {
      pc_NumberOfDevelopmentalStages: 7,
      pc_NumberOfOrgans: 4,
      pc_AssimilatePartitioningCoeff: [
        [0.6, 0.3, 0.1, 0],
        [0.55, 0.3, 0.15, 0],
        [0.2, 0.2, 0.6, 0],
        [0, 0.37, 0.6, 0.03],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1]
      ],
      pc_OrganSenescenceRate: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0.03, 0, 0],
        [0, 0.05, 0.05, 0],
        [0, 0.05, 0.05, 0]
      ],
      pc_BaseDaylength: [0, -14.4, -14.4, -14.4, -14.4, -14.4, 0],
      pc_BaseTemperature: [8, 8, 6, 6, 6, -15, -15],
      pc_OptimumTemperature: [30, 30, 30, 25, 25, 25, 30],
      pc_DaylengthRequirement: [0, -11.65, -11.65, -11.65, -11.65, -11.65, 0],
      pc_DroughtStressThreshold: [1, 1, 1, 1, 1, 1, 1],
      pc_OrganMaintenanceRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_OrganGrowthRespiration: [0.01, 0.03, 0.015, 0.01],
      pc_SpecificLeafArea: [0.0035, 0.0032, 0.003, 0.0025, 0.002, 0.002, 0.002],
      pc_StageMaxRootNConcentration: [0.0155, 0.012, 0.01, 0.01, 0.01, 0.01, 0.1],
      pc_StageKcFactor: [0.4, 0.7, 1.1, 1.3, 1.3, 1.1, 0.4],
      pc_StageTemperatureSum: [148, 50, 630, 430, 500, 950, 25],
      pc_VernalisationRequirement: [0, 0, 0, 0, 0, 0, 0],
      pc_InitialOrganBiomass: [25, 25, 0, 0],
      pc_CriticalOxygenContent: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
      pc_AbovegroundOrgan: [false, true, true, true],
      pc_StorageOrgan: [false, false, false, true],
      organIdsForPrimaryYield: [{organId: 4, yieldPercentage: 0.79, yieldDryMatter: 0.86}],
      organIdsForSecondaryYield: [],
      organIdsForCutting: [],
      pc_CropName: 'soy bean xii',
      pc_MaxAssimilationRate: 30,
      pc_CarboxylationPathway: 1,
      pc_MinimumTemperatureForAssimilation: 5,
      pc_CropSpecificMaxRootingDepth: 1.4,
      pc_MinimumNConcentration: 0.005,
      pc_NConcentrationPN: 5,
      pc_NConcentrationB0: 0.3,
      pc_NConcentrationAbovegroundBiomass: 0.06,
      pc_NConcentrationRoot: 0.02,
      pc_InitialKcFactor: 0.4,
      pc_DevelopmentAccelerationByNitrogenStress: 0,
      pc_FixingN: 0.55,
      pc_LuxuryNCoeff: 1,
      pc_MaxCropHeight: 1,
      pc_ResidueNRatio: 0.5,
      pc_SamplingDepth: 0.9,
      pc_TargetNSamplingDepth: 50,
      pc_TargetN30: 0,
      pc_DefaultRadiationUseEfficiency: 0.5,
      pc_CropHeightP1: 9,
      pc_CropHeightP2: 0.35,
      pc_StageAtMaxHeight: 4,
      pc_MaxCropDiameter: 0.006,
      pc_StageAtMaxDiameter: 3,
      pc_HeatSumIrrigationStart: 113,
      pc_HeatSumIrrigationEnd: 900,
      pc_MaxNUptakeParam: 3.145,
      pc_RootDistributionParam: 0.002787,
      pc_PlantDensity: 30,
      pc_RootGrowthLag: -30,
      pc_MinimumTemperatureRootGrowth: 6,
      pc_InitialRootingDepth: 0.1,
      pc_RootPenetrationRate: 0.0012,
      pc_RootFormFactor: 3,
      pc_SpecificRootLength: 300,
      pc_StageAfterCut: 0,
      pc_CriticalTemperatureHeatStress: 31,
      pc_LimitingTemperatureHeatStress: 40,
      pc_BeginSensitivePhaseHeatStress: 420,
      pc_EndSensitivePhaseHeatStress: 540,
      pc_DroughtImpactOnFertilityFactor: 0,
      pc_CuttingDelayDays: null,
      pc_FieldConditionModifier: 1
    };
    _residueParams = {
      name: 'soy bean xii',
      vo_AOM_DryMatterContent: 1,
      vo_AOM_NH4Content: 0,
      vo_AOM_NO3Content: 0.001,
      vo_AOM_CarbamidContent: 0,
      vo_AOM_SlowDecCoeffStandard: 0.012,
      vo_AOM_FastDecCoeffStandard: 0.05,
      vo_PartAOM_to_AOM_Slow: 0.67,
      vo_PartAOM_to_AOM_Fast: 0.33,
      vo_CN_Ratio_AOM_Slow: 75,
      vo_CN_Ratio_AOM_Fast: 0,
      vo_PartAOM_Slow_to_SMB_Slow: 0.5,
      vo_PartAOM_Slow_to_SMB_Fast: 0.5,
      vo_NConcentration: 0
    };
  }

  return {

    type: 'fieldcrop',
    id: function () { 
      return _id; 
    },
    name: function () { 
      return _name;
    },
    isValid: function () { 
      return _id > -1; 
    },
    cropParameters: function () { 
      return _cropParams; 
    },
    setCropParameters: function (cps) { 
      _cropParams = cps; 
    },
    residueParameters: function () {
      return _residueParams;
    },
    setResidueParameters: function (rps) {
      _residueParams = rps;
    },
    seedDate: function () { 
      return _seedDate; 
    },
    harvestDate: function () { 
      return _harvestDate; 
    },
    getCuttingDates: function () { 
      return _cuttingDates; 
    },
    setSeedAndHarvestDate: function (sd, hd) {
      _seedDate = sd;
      _harvestDate = hd;
    },
    addCuttingDate: function (cd) { 
      _cuttingDates.push(cd); 
    },
    setHarvestYields: function (primaryYield, secondaryYield) {
      _primaryYield += primaryYield;
      _secondaryYield += secondaryYield;
    },
    setHarvestYieldsTM: function (primaryYieldTM, secondaryYieldTM) {
      _primaryYieldTM += primaryYieldTM;
      _secondaryYieldTM += secondaryYieldTM;
    },
    addCuttingYieldDM: function (cut) {
      _cuttingYieldsDM.push(cut);
    },
    getCuttingYieldsDM: function () {
      return _cuttingYieldsDM;
    },
    setYieldNContent: function (primaryYieldN, secondaryYieldN) {
      _primaryYieldN += primaryYieldN;
      _secondaryYieldN += secondaryYieldN;
    },
    addAppliedIrrigationWater: function (amount) { 
      _appliedAmountIrrigation += amount; 
    },
    setSumTotalNUptake: function (sum) { 
      _sumTotalNUptake = sum; 
    },
    setCropHeight: function (height) { 
      _cropHeight = height; 
    },
    setAccumulatedETa: function (eta) { 
      _accumulatedETa = eta; 
    },
    appliedIrrigationWater: function () { 
      return _appliedAmountIrrigation; 
    },
    sumTotalNUptake: function () { 
      return _sumTotalNUptake; 
    },
    primaryYield: function () { 
      return _primaryYield * _crossCropAdaptionFactor; 
    },
    secondaryYield: function () { 
      return _secondaryYield * _crossCropAdaptionFactor; 
    },
    primaryYieldTM: function () { 
      return _primaryYieldTM * _crossCropAdaptionFactor; 
    },
    secondaryYieldTM: function () { 
      return _secondaryYieldTM * _crossCropAdaptionFactor; 
    },
    primaryYieldN: function () { 
      return _primaryYieldN; 
    },
    aboveGroundBiomasseN: function () { 
      return _primaryYieldN + _secondaryYieldN; 
    },
    secondaryYieldN: function () { 
      return _secondaryYieldN; 
    },
    cropHeight: function () { 
      return _cropHeight; 
    },
    reset: function () {
      _primaryYield = _secondaryYield = _appliedAmountIrrigation = 0;
      _primaryYieldN = _secondaryYieldN = _accumulatedETa = 0.0;
      _primaryYieldTM = _secondaryYield = 0.0;
    },
    get_AccumulatedETa: function ()  {
      return _accumulatedETa;
    }
  };

};


/*
  JS Changes:
    - applyCutting(): reset LAI
    - get_PrimaryCropYield(): bestimme yield auch nach cutting
    - get_FreshPrimaryCropYield(): bestimme yield auch nach cutting
*/

var FieldCropGrowth = function (sc, gps, cps, stps, cpp) {

  var soilColumn = sc
    , generalParams = gps
    , cropParams = cps
    , centralParameterProvider = cpp
    , vs_NumberOfLayers  = sc.vs_NumberOfLayers() 
    , vs_Latitude  = stps.vs_Latitude
    ;

  var vc_AbovegroundBiomass = 0.0 
    , vc_AbovegroundBiomassOld = 0.0 
    , pc_AbovegroundOrgan = cropParams.pc_AbovegroundOrgan 
    , vc_ActualTranspiration = 0.0 
    , pc_AssimilatePartitioningCoeff = cropParams.pc_AssimilatePartitioningCoeff
    , vc_Assimilates = 0.0 
    , vc_AssimilationRate = 0.0 
    , vc_AstronomicDayLenght = 0.0
    , pc_BaseDaylength = cropParams.pc_BaseDaylength
    , pc_BaseTemperature = cropParams.pc_BaseTemperature
    , pc_BeginSensitivePhaseHeatStress = cropParams.pc_BeginSensitivePhaseHeatStress
    , vc_BelowgroundBiomass = 0.0 
    , vc_BelowgroundBiomassOld = 0.0 
    , pc_CO2Method = 3 
    , pc_CarboxylationPathway = cropParams.pc_CarboxylationPathway 
    , vc_ClearDayRadiation = 0.0 
    , vc_CriticalNConcentration = 0.0 
    , pc_CriticalOxygenContent = cropParams.pc_CriticalOxygenContent 
    , pc_CriticalTemperatureHeatStress = cropParams.pc_CriticalTemperatureHeatStress 
    , vc_CropDiameter = 0.0 
    , vc_CropHeatRedux = 1.0 
    , vc_CropHeight = 0.0 
    , pc_CropHeightP1 = cropParams.pc_CropHeightP1 
    , pc_CropHeightP2 = cropParams.pc_CropHeightP2 
    , vc_CropNDemand = 0.0 
    , vc_CropNRedux = 1.0 
    , pc_CropName = cropParams.pc_CropName 
    , pc_CropSpecificMaxRootingDepth = cropParams.pc_CropSpecificMaxRootingDepth 
    , vc_CurrentTemperatureSum = new Float64Array(cropParams.pc_NumberOfDevelopmentalStages) 
    , vc_CurrentTotalTemperatureSum = 0.0 
    , vc_CurrentTotalTemperatureSumRoot = 0.0 
    , vc_DaylengthFactor = 0.0 
    , pc_DaylengthRequirement = cropParams.pc_DaylengthRequirement 
    , vc_DaysAfterBeginFlowering = 0 
    , vc_Declination = 0.0
    , pc_DefaultRadiationUseEfficiency = cropParams.pc_DefaultRadiationUseEfficiency
    , vm_DepthGroundwaterTable = 0
    , pc_DevelopmentAccelerationByNitrogenStress = cropParams.pc_DevelopmentAccelerationByNitrogenStress
    , vc_DevelopmentalStage = 0
    , vc_DroughtImpactOnFertility = 1.0
    , pc_DroughtImpactOnFertilityFactor = cropParams.pc_DroughtImpactOnFertilityFactor
    , pc_DroughtStressThreshold = cropParams.pc_DroughtStressThreshold
    , vc_EffectiveDayLength = 0.0
    , pc_EmergenceFloodingControlOn = generalParams.pc_EmergenceFloodingControlOn
    , pc_EmergenceMoistureControlOn = generalParams.pc_EmergenceMoistureControlOn
    , pc_EndSensitivePhaseHeatStress = cropParams.pc_EndSensitivePhaseHeatStress
    , vc_ErrorStatus = false
    , vc_EvaporatedFromIntercept = 0.0
    , vc_ExtraterrestrialRadiation = 0.0
    , vc_FinalDevelopmentalStage = 0
    , vc_FixedN = 0
    , pc_FixingN = cropParams.pc_FixingN
    , vo_FreshSoilOrganicMatter = new Float64Array(vs_NumberOfLayers)
    , vc_GlobalRadiation = 0.0
    , vc_GreenAreaIndex = 0.0
    , vc_GrossAssimilates = 0.0
    , vc_GrossPhotosynthesis = 0.0
    , vc_GrossPhotosynthesisReference_mol = 0.0
    , vc_GrossPhotosynthesis_mol = 0.0
    , vc_GrossPrimaryProduction = 0.0
    , vc_GrowthRespirationAS = 0.0
    , vs_HeightNN = stps.vs_HeightNN
    , pc_InitialKcFactor = cropParams.pc_InitialKcFactor
    , pc_InitialOrganBiomass = cropParams.pc_InitialOrganBiomass
    , pc_InitialRootingDepth = cropParams.pc_InitialRootingDepth
    , vc_InterceptionStorage = 0.0
    , vc_KcFactor = 0.6
    , vc_LeafAreaIndex = 0.0
    , pc_LimitingTemperatureHeatStress = cropParams.pc_LimitingTemperatureHeatStress
    , pc_LuxuryNCoeff = cropParams.pc_LuxuryNCoeff
    , vc_MaintenanceRespirationAS = 0.0
    , pc_MaxAssimilationRate = cropParams.pc_MaxAssimilationRate
    , pc_MaxCropDiameter = cropParams.pc_MaxCropDiameter
    , pc_MaxCropHeight = cropParams.pc_MaxCropHeight
    , vs_MaxEffectiveRootingDepth = stps.vs_MaxEffectiveRootingDepth
    , vc_MaxNUptake = 0.0
    , pc_MaxNUptakeParam = cropParams.pc_MaxNUptakeParam
    , vc_MaxRootingDepth = 0.0
    , pc_MinimumNConcentration = cropParams.pc_MinimumNConcentration
    , pc_MinimumTemperatureForAssimilation = cropParams.pc_MinimumTemperatureForAssimilation
    , pc_MinimumTemperatureRootGrowth = cropParams.pc_MinimumTemperatureRootGrowth
    , pc_NConcentrationAbovegroundBiomass = cropParams.pc_NConcentrationAbovegroundBiomass
    , vc_NConcentrationAbovegroundBiomass = 0.0
    , vc_NConcentrationAbovegroundBiomassOld = 0.0
    , pc_NConcentrationB0 = cropParams.pc_NConcentrationB0
    , pc_NConcentrationPN = cropParams.pc_NConcentrationPN
    , pc_NConcentrationRoot = cropParams.pc_NConcentrationRoot
    , vc_NConcentrationRoot = 0.0
    , vc_NConcentrationRootOld = 0.0
    , vc_NContentDeficit = 0.0
    , vc_NUptakeFromLayer = new Float64Array(vs_NumberOfLayers)
    , vc_NetMaintenanceRespiration = 0.0
    , vc_NetPhotosynthesis = 0.0
    , vc_NetPrecipitation = 0.0
    , vc_NetPrimaryProduction = 0.0
    , pc_NitrogenResponseOn = generalParams.pc_NitrogenResponseOn
    , pc_NumberOfDevelopmentalStages = cropParams.pc_NumberOfDevelopmentalStages
    , pc_NumberOfOrgans = cropParams.pc_NumberOfOrgans
    , pc_OptimumTemperature = cropParams.pc_OptimumTemperature
    , vc_OrganBiomass = new Float64Array(cropParams.pc_NumberOfOrgans)
    , vc_OrganDeadBiomass = new Float64Array(cropParams.pc_NumberOfOrgans)
    , vc_OrganGreenBiomass = new Float64Array(cropParams.pc_NumberOfOrgans)
    , vc_OrganGrowthIncrement = new Float64Array(cropParams.pc_NumberOfOrgans)
    , pc_OrganGrowthRespiration = cropParams.pc_OrganGrowthRespiration
    , pc_OrganMaintenanceRespiration = cropParams.pc_OrganMaintenanceRespiration
    , vc_OrganSenescenceIncrement = new Float64Array(cropParams.pc_NumberOfOrgans)
    , pc_OrganSenescenceRate = cropParams.pc_OrganSenescenceRate
    , vc_OvercastDayRadiation = 0.0
    , vc_OxygenDeficit = 0.0
    , vc_PhotActRadiationMean = 0.0
    , vc_PhotoperiodicDaylength = 0.0
    , pc_PlantDensity = cropParams.pc_PlantDensity
    , vc_PotentialTranspiration = 0.0
    , vc_ReferenceEvapotranspiration = 0.0
    , vc_RelativeTotalDevelopment = 0.0
    , vc_RemainingEvapotranspiration = 0.0
    , vc_ReserveAssimilatePool = 0.0
    , pc_ResidueNRatio = cropParams.pc_ResidueNRatio
    , vc_Respiration = 0.0
    , vc_RootBiomass = 0.0
    , vc_RootBiomassOld = 0.0
    , vc_RootDensity = new Float64Array(vs_NumberOfLayers)
    , vc_RootDiameter = new Float64Array(vs_NumberOfLayers)
    , pc_RootDistributionParam = cropParams.pc_RootDistributionParam
    , vc_RootEffectivity = new Float64Array(vs_NumberOfLayers)
    , pc_RootFormFactor = cropParams.pc_RootFormFactor
    , pc_RootGrowthLag = cropParams.pc_RootGrowthLag
    , pc_RootPenetrationRate = cropParams.pc_RootPenetrationRate
    , vc_RootingDepth = 0
    , vc_RootingDepth_m = 0.0
    , vc_RootingZone = 0
    , vm_SaturationDeficit = 0.0
    , vc_SoilCoverage = 0.0
    , vs_SoilMineralNContent = new Float64Array(vs_NumberOfLayers)
    , vc_SoilSpecificMaxRootingDepth = 0.0
    , vs_SoilSpecificMaxRootingDepth = 0.0
    , pc_SpecificLeafArea = cropParams.pc_SpecificLeafArea
    , pc_SpecificRootLength = cropParams.pc_SpecificRootLength
    , pc_StageAtMaxDiameter = cropParams.pc_StageAtMaxDiameter
    , pc_StageAtMaxHeight = cropParams.pc_StageAtMaxHeight
    , pc_StageKcFactor = cropParams.pc_StageKcFactor
    , pc_StageMaxRootNConcentration = cropParams.pc_StageMaxRootNConcentration
    , pc_StageTemperatureSum = cropParams.pc_StageTemperatureSum
    , vc_StomataResistance = 0.0
    , pc_StorageOrgan = cropParams.pc_StorageOrgan
    , vc_StorageOrgan = 4
    , vc_SumTotalNUptake = 0.0
    , vc_TargetNConcentration = 0.0
    , vc_TimeStep = 1.0
    , vc_TimeUnderAnoxia = 0
    , vs_Tortuosity = 0.0
    , vc_TotalBiomass = 0.0
    , vc_TotalBiomassNContent = 0.0
    , vc_TotalCropHeatImpact = 0.0
    , vc_TotalNUptake = 0.0
    , vc_TotalRespired = 0.0
    , vc_TotalRootLength = 0.0
    , vc_TotalTemperatureSum = 0.0
    , vc_Transpiration = new Float64Array(vs_NumberOfLayers)
    , vc_TranspirationDeficit = 1.0
    , vc_TranspirationRedux = new Float64Array(vs_NumberOfLayers)
    , vc_VernalisationDays = 0.0
    , vc_VernalisationFactor = 0.0
    , pc_VernalisationRequirement = cropParams.pc_VernalisationRequirement
    , pc_WaterDeficitResponseOn = generalParams.pc_WaterDeficitResponseOn
    , vc_accumulatedETa = 0.0
    , cutting_delay_days = 0
    , dyingOut = false
    ;

    // , vc_CropWaterUptake = new Array() // JS! unused

  // for (var i = 0; i < cropParams.pc_NumberOfDevelopmentalStages; i++) 
  //   vc_CurrentTemperatureSum[i] = 0.0;

  for (var i = 0; i < vs_NumberOfLayers; i++) {
    // vc_NUptakeFromLayer[i] = 0.0;
    // vc_RootDensity[i] = 0.0;
    // vc_RootDiameter[i] = 0.0;
    // vc_RootEffectivity[i] = 0.0;
    // vs_SoilMineralNContent[i] = 0.0
    // vc_Transpiration[i] = 0.0;
    vc_TranspirationRedux[i] = 1.0;
  }

  // for (var i = 0; i < pc_NumberOfOrgans; i++) {
  //   vc_OrganBiomass[i] = 0.0;
  //   vc_OrganDeadBiomass[i] = 0.0;
  //   vc_OrganGreenBiomass[i] = 0.0;
  //   vc_OrganGrowthIncrement[i] = 0.0;
  //   vc_OrganSenescenceIncrement[i] = 0.0;
  // }

  // Initialising the crop
  vs_Tortuosity = centralParameterProvider.userCropParameters.pc_Tortuosity;

  // Determining the total temperature sum of all developmental stages after
  // emergence (that's why i_Stage starts with 1) until before senescence
  for (var i_Stage = 1; i_Stage < pc_NumberOfDevelopmentalStages - 1; i_Stage++)
     vc_TotalTemperatureSum += pc_StageTemperatureSum[i_Stage];

  vc_FinalDevelopmentalStage = pc_NumberOfDevelopmentalStages - 1;

  // Determining the initial crop organ's biomass
  for (var i_Organ = 0; i_Organ < pc_NumberOfOrgans; i_Organ++) {

    vc_OrganBiomass[i_Organ] = pc_InitialOrganBiomass[i_Organ]; // [kg ha-1]

    if (pc_AbovegroundOrgan[i_Organ] == 1)
      vc_AbovegroundBiomass += pc_InitialOrganBiomass[i_Organ]; // [kg ha-1]

    vc_TotalBiomass += pc_InitialOrganBiomass[i_Organ]; // [kg ha-1]

    // Define storage organ
    if (pc_StorageOrgan[i_Organ] == 1) /* make sure it is == instead of === so that (true == 1) is also true */
      vc_StorageOrgan = i_Organ;

    // Define storage organ
    if (pc_StorageOrgan[i_Organ] == 1)
        vc_StorageOrgan = i_Organ;

  } // for

  vc_RootBiomass = pc_InitialOrganBiomass[0]; // [kg ha-1]

  // Initialisisng the leaf area index
  vc_LeafAreaIndex = vc_OrganBiomass[1] * pc_SpecificLeafArea[vc_DevelopmentalStage]; // [ha ha-1]

  if (vc_LeafAreaIndex <= 0.0)
    vc_LeafAreaIndex = 0.001;

  // Initialising the root
  vc_RootBiomass = vc_OrganBiomass[0];

  /** @todo Christian: Umrechnung korrekt wenn Biomasse in [kg m-2]? */
  vc_TotalRootLength = (vc_RootBiomass * 100000.0 * 100.0 / 7.0) / (0.015 * 0.015 * PI);

  vc_TotalBiomassNContent = (vc_AbovegroundBiomass * pc_NConcentrationAbovegroundBiomass)
      + (vc_RootBiomass * pc_NConcentrationRoot);
  vc_NConcentrationAbovegroundBiomass = pc_NConcentrationAbovegroundBiomass;
  vc_NConcentrationRoot = pc_NConcentrationRoot;

  // Initialising the initial maximum rooting depth
  var vc_SandContent = soilColumn[0].vs_SoilSandContent; // [kg kg-1]
  var vc_BulkDensity = soilColumn[0].vs_SoilBulkDensity(); // [kg m-3]
  if (vc_SandContent < 0.55) vc_SandContent = 0.55;
  if (vs_SoilSpecificMaxRootingDepth > 0.0) {
    vc_SoilSpecificMaxRootingDepth  = vs_SoilSpecificMaxRootingDepth;
  } else {
    vc_SoilSpecificMaxRootingDepth = vc_SandContent * ((1.1 - vc_SandContent)
             / 0.275) * (1.4 / (vc_BulkDensity / 1000.0)
             + (vc_BulkDensity * vc_BulkDensity / 40000000.0)); // [m]
  }

  vc_MaxRootingDepth = (vc_SoilSpecificMaxRootingDepth + (pc_CropSpecificMaxRootingDepth * 2.0)) / 3.0; //[m]

  var calculateCropGrowthStep = function (
    vw_MeanAirTemperature, 
    vw_MaxAirTemperature,
    vw_MinAirTemperature,
    vw_GlobalRadiation,
    vw_SunshineHours,
    vs_JulianDay,
    vw_RelativeHumidity,
    vw_WindSpeed,
    vw_WindSpeedHeight,
    vw_AtmosphericCO2Concentration,
    vw_GrossPrecipitation
  ) {

    if (cutting_delay_days>0) {
        cutting_delay_days--;
    }

    fc_Radiation(vs_JulianDay, vs_Latitude, vw_GlobalRadiation, vw_SunshineHours);

    vc_OxygenDeficit = fc_OxygenDeficiency(pc_CriticalOxygenContent[vc_DevelopmentalStage]);

    fc_CropDevelopmentalStage(
      vw_MeanAirTemperature,
      pc_BaseTemperature,
      pc_OptimumTemperature,
      pc_StageTemperatureSum,
      vc_TimeStep,
      soilColumn[0].get_Vs_SoilMoisture_m3(),
      soilColumn[0].get_FieldCapacity(),
      soilColumn[0].get_PermanentWiltingPoint(),
      pc_NumberOfDevelopmentalStages,
      vc_VernalisationFactor,
      vc_DaylengthFactor,
      vc_CropNRedux
    );  

    vc_DaylengthFactor =
      fc_DaylengthFactor(
      pc_DaylengthRequirement[vc_DevelopmentalStage],
      vc_EffectiveDayLength,
      vc_PhotoperiodicDaylength,
      pc_BaseDaylength[vc_DevelopmentalStage]
    );

    // C++: returns pair<double, double> 
    var fc_VernalisationResult =
      fc_VernalisationFactor(
      vw_MeanAirTemperature,
      vc_TimeStep,
      pc_VernalisationRequirement[vc_DevelopmentalStage],
      vc_VernalisationDays
    );    

    vc_VernalisationFactor = fc_VernalisationResult[0];
    vc_VernalisationDays = fc_VernalisationResult[1];

    vc_RelativeTotalDevelopment = vc_CurrentTotalTemperatureSum / vc_TotalTemperatureSum;

    if (vc_DevelopmentalStage == 0) {
      vc_KcFactor = 0.4; /** @todo Claas: muss hier etwas Genaueres hin, siehe FAO? */
    } else {
      vc_KcFactor = 
        fc_KcFactor(
          vc_DevelopmentalStage,
          pc_StageTemperatureSum[vc_DevelopmentalStage],
          vc_CurrentTemperatureSum[vc_DevelopmentalStage],
          pc_InitialKcFactor,
          pc_StageKcFactor[vc_DevelopmentalStage],
          pc_StageKcFactor[vc_DevelopmentalStage - 1]
        );
    }

    if (vc_DevelopmentalStage > 0) {

      fc_CropSize(pc_MaxCropHeight,
        pc_MaxCropDiameter,
        pc_StageAtMaxHeight,
        pc_StageAtMaxDiameter,
        pc_StageTemperatureSum,
        vc_CurrentTotalTemperatureSum,
        pc_CropHeightP1,
        pc_CropHeightP2
      );

      fc_CropGreenArea(
        vc_OrganGrowthIncrement[1],
        vc_OrganSenescenceIncrement[1],
        vc_CropHeight,
        vc_CropDiameter,
        pc_SpecificLeafArea[vc_DevelopmentalStage - 1],
        pc_SpecificLeafArea[vc_DevelopmentalStage],
        pc_SpecificLeafArea[1],
        pc_StageTemperatureSum[vc_DevelopmentalStage],
        vc_CurrentTemperatureSum[vc_DevelopmentalStage],
        pc_PlantDensity,
        vc_TimeStep
      );

      vc_SoilCoverage = fc_SoilCoverage(vc_LeafAreaIndex);

      fc_CropPhotosynthesis(
        vw_MeanAirTemperature,
        vw_MaxAirTemperature,
        vw_MinAirTemperature,
        vc_GlobalRadiation,
        vw_AtmosphericCO2Concentration,
        vs_Latitude,
        vc_LeafAreaIndex,
        pc_DefaultRadiationUseEfficiency,
        pc_MaxAssimilationRate,
        pc_MinimumTemperatureForAssimilation,
        vc_AstronomicDayLenght,
        vc_Declination,
        vc_ClearDayRadiation,
        vc_EffectiveDayLength,
        vc_OvercastDayRadiation
      );

      fc_HeatStressImpact(
        vw_MaxAirTemperature,
        vw_MinAirTemperature,
        vc_CurrentTotalTemperatureSum
      );

      fc_DroughtImpactOnFertility(vc_TranspirationDeficit);

      fc_CropNitrogen();

      fc_CropDryMatter(
        vs_NumberOfLayers,
        soilColumn.vs_LayerThickness(),
        vc_DevelopmentalStage,
        vc_Assimilates,
      /*vc_NetMaintenanceRespiration,*/   // hermes o. agrosim
      /*pc_CropSpecificMaxRootingDepth,*/ // JS! unused
      /*vs_SoilSpecificMaxRootingDepth,*/ // JS! unused
        vw_MeanAirTemperature
      );

      vc_ReferenceEvapotranspiration = 
        fc_ReferenceEvapotranspiration(
          vs_HeightNN,
          vw_MaxAirTemperature,
          vw_MinAirTemperature,
          vw_RelativeHumidity,
          vw_MeanAirTemperature,
          vw_WindSpeed,
          vw_WindSpeedHeight,
          vc_GlobalRadiation,
          vw_AtmosphericCO2Concentration,
          vc_GrossPhotosynthesisReference_mol
        );

      fc_CropWaterUptake(
        vs_NumberOfLayers,
        soilColumn.vs_LayerThickness(),
        vc_SoilCoverage,
        vc_RootingZone, // JS! int TODO crop.h vc_RootingDepth?
        soilColumn.vm_GroundwaterTable, // JS! int
        vc_ReferenceEvapotranspiration,
        vw_GrossPrecipitation,
        vc_CurrentTotalTemperatureSum,
        vc_TotalTemperatureSum
      );

      fc_CropNUptake(
        vs_NumberOfLayers,
        soilColumn.vs_LayerThickness(),
        vc_RootingZone, // JS! int TODO crop.h vc_RootingDepth?
        soilColumn.vm_GroundwaterTable, // JS! int
        vc_CurrentTotalTemperatureSum,
        vc_TotalTemperatureSum
      );

      vc_GrossPrimaryProduction = fc_GrossPrimaryProduction(vc_GrossAssimilates);

      vc_NetPrimaryProduction = fc_NetPrimaryProduction(vc_GrossPrimaryProduction, vc_TotalRespired);
    }

  };

  var fc_Radiation = function (
    vs_JulianDay,
    vs_Latitude,
    vw_GlobalRadiation,
    vw_SunshineHours
  ) {


    var vc_DeclinationSinus = 0.0; // old SINLD
    var vc_DeclinationCosinus = 0.0; // old COSLD

    // Calculation of declination - old DEC
    vc_Declination = -23.4 * cos(2.0 * PI * ((vs_JulianDay + 10.0) / 365.0));

    vc_DeclinationSinus = sin(vc_Declination * PI / 180.0) * sin(vs_Latitude * PI / 180.0);
    vc_DeclinationCosinus = cos(vc_Declination * PI / 180.0) * cos(vs_Latitude * PI / 180.0);

    // Calculation of the atmospheric day lenght - old DL
    vc_AstronomicDayLenght = 12.0 * (PI + 2.0 * asin(vc_DeclinationSinus / vc_DeclinationCosinus)) / PI;


    // Calculation of the effective day length - old DLE

    var EDLHelper = (-sin(8.0 * PI / 180.0) + vc_DeclinationSinus) / vc_DeclinationCosinus;

    if ((EDLHelper < -1.0) || (EDLHelper > 1.0))
    {
        vc_EffectiveDayLength = 0.01;
    } else {
        vc_EffectiveDayLength = 12.0 * (PI + 2.0 * asin(EDLHelper)) / PI;
    }

    // old DLP
    vc_PhotoperiodicDaylength = 12.0 * (PI + 2.0 * asin((-sin(-6.0 * PI / 180.0) + vc_DeclinationSinus)
        / vc_DeclinationCosinus)) / PI;

    // Calculation of the mean photosynthetically active radiation [J m-2] - old RDN
    vc_PhotActRadiationMean = 3600.0 * (vc_DeclinationSinus * vc_AstronomicDayLenght + 24.0 / PI * vc_DeclinationCosinus
        * sqrt(1.0 - ((vc_DeclinationSinus / vc_DeclinationCosinus) * (vc_DeclinationSinus / vc_DeclinationCosinus))));

    // Calculation of radiation on a clear day [J m-2] - old DRC
    vc_ClearDayRadiation = 0.5 * 1300.0 * vc_PhotActRadiationMean * exp(-0.14 / (vc_PhotActRadiationMean
        / (vc_AstronomicDayLenght * 3600.0)));

    // Calculation of radiation on an overcast day [J m-2] - old DRO
    vc_OvercastDayRadiation = 0.2 * vc_ClearDayRadiation;

    // Calculation of extraterrestrial radiation - old EXT
    var pc_SolarConstant = 0.082; //[MJ m-2 d-1] Note: Here is the difference to HERMES, which calculates in [J cm-2 d-1]!
    var SC = 24.0 * 60.0 / PI * pc_SolarConstant *(1.0 + 0.033 * cos(2.0 * PI * vs_JulianDay / 365.0));
    var vc_SunsetSolarAngle = acos(-tan(vs_Latitude * PI / 180.0) * tan(vc_Declination * PI / 180.0));
    vc_ExtraterrestrialRadiation = SC * (vc_SunsetSolarAngle * vc_DeclinationSinus + vc_DeclinationCosinus * sin(vc_SunsetSolarAngle)); // [MJ m-2]

    if (vw_GlobalRadiation > 0.0)
      vc_GlobalRadiation = vw_GlobalRadiation;
    else
      vc_GlobalRadiation = vc_ExtraterrestrialRadiation * (0.19 + 0.55 * vw_SunshineHours / vc_AstronomicDayLenght);
  };
      
  var fc_DaylengthFactor = function (
  d_DaylengthRequirement,
  _vc_EffectiveDayLength, /* JS! overwrites public var */ 
  _vc_PhotoperiodicDaylength, /* JS! overwrites public var */ 
  d_BaseDaylength
  ) {

    if (d_DaylengthRequirement > 0.0) {

      // ************ Long-day plants **************
      // * Development acceleration by day length. *
      // *  (Day lenght requirement is positive.)  *
      // *******************************************

      vc_DaylengthFactor = (vc_PhotoperiodicDaylength - d_BaseDaylength) /
        (d_DaylengthRequirement - d_BaseDaylength);

    } else if (d_DaylengthRequirement < 0.0) {

      // ************* Short-day plants **************
      // * Development acceleration by night lenght. *
      // *  (Day lenght requirement is negative and  *
      // *      represents critical day length.)     *
      // *********************************************

      var vc_CriticalDayLenght = -d_DaylengthRequirement;
      var vc_MaximumDayLength = -d_BaseDaylength;
      
      if (vc_EffectiveDayLength <= vc_CriticalDayLenght)
        vc_DaylengthFactor = 1.0;
      else
        vc_DaylengthFactor = (vc_EffectiveDayLength - vc_MaximumDayLength) / (vc_CriticalDayLenght - vc_MaximumDayLength);

    } else vc_DaylengthFactor = 1.0;

    if (vc_DaylengthFactor > 1.0) vc_DaylengthFactor = 1.0;

    if (vc_DaylengthFactor < 0.0) vc_DaylengthFactor = 0.0;

    return vc_DaylengthFactor;
  };

  /*std::pair<double, double>*/    
  var fc_VernalisationFactor = function (
    vw_MeanAirTemperature, 
    vc_TimeStep,
    d_VernalisationRequirement,
    d_VernalisationDays
  ) {

    var vc_EffectiveVernalisation;

    if (d_VernalisationRequirement == 0.0) {
      vc_VernalisationFactor = 1.0;
    } else {
      if ((vw_MeanAirTemperature > -4.0) && (vw_MeanAirTemperature <= 0.0))
        vc_EffectiveVernalisation = (vw_MeanAirTemperature + 4.0) / 4.0;
      else if ((vw_MeanAirTemperature > 0.0) && (vw_MeanAirTemperature <= 3.0))
        vc_EffectiveVernalisation = 1.0;
      else if ((vw_MeanAirTemperature > 3.0) && (vw_MeanAirTemperature <= 7.0))
        vc_EffectiveVernalisation = 1.0 - (0.2 * (vw_MeanAirTemperature - 3.0) / 4.0);
      else if ((vw_MeanAirTemperature > 7.0) && (vw_MeanAirTemperature <= 9.0))
        vc_EffectiveVernalisation = 0.8 - (0.4 * (vw_MeanAirTemperature - 7.0) / 2.0);
      else if ((vw_MeanAirTemperature > 9.0) && (vw_MeanAirTemperature <= 18.0))
        vc_EffectiveVernalisation = 0.4 - (0.4 * (vw_MeanAirTemperature - 9.0) / 9.0);
      else if ((vw_MeanAirTemperature <= -4.0) || (vw_MeanAirTemperature > 18.0))
        vc_EffectiveVernalisation = 0.0;
      else
        vc_EffectiveVernalisation = 1.0;
      
      // old VERNTAGE
      d_VernalisationDays += vc_EffectiveVernalisation * vc_TimeStep;

      // old VERSCHWELL
      var vc_VernalisationThreshold = min(d_VernalisationRequirement, 9.0) - 1.0;

      if (vc_VernalisationThreshold >= 1) {
        vc_VernalisationFactor = (d_VernalisationDays - vc_VernalisationThreshold) / (d_VernalisationRequirement - vc_VernalisationThreshold);
        if (vc_VernalisationFactor < 0)
          vc_VernalisationFactor = 0.0;
      } else {
        vc_VernalisationFactor = 1.0;
      }
    }

    return [
      vc_VernalisationFactor, 
      d_VernalisationDays
    ];
  };

  var fc_OxygenDeficiency = function (
    d_CriticalOxygenContent, 
    vc_AirFilledPoreVolume, 
    vc_MaxOxygenDeficit
  ) {


    var vc_AirFilledPoreVolume = vc_AirFilledPoreVolume || 0.0;
    var vc_MaxOxygenDeficit = vc_MaxOxygenDeficit || 0.0;

    // Reduktion bei Luftmangel Stauwasser berücksichtigen!!!!
    vc_AirFilledPoreVolume = ((soilColumn[0].get_Saturation() + soilColumn[1].get_Saturation()
        + soilColumn[2].get_Saturation()) - (soilColumn[0].get_Vs_SoilMoisture_m3() + soilColumn[1].get_Vs_SoilMoisture_m3()
        + soilColumn[2].get_Vs_SoilMoisture_m3())) / 3.0;
    if (vc_AirFilledPoreVolume < d_CriticalOxygenContent) {
      vc_TimeUnderAnoxia += int(vc_TimeStep);
      if (vc_TimeUnderAnoxia > 4)
        vc_TimeUnderAnoxia = 4;
      if (vc_AirFilledPoreVolume < 0.0)
        vc_AirFilledPoreVolume = 0.0;
      vc_MaxOxygenDeficit = vc_AirFilledPoreVolume / d_CriticalOxygenContent;
      // JS! c++ : double (int / int) -> js int(double / double) !! took hours to debug!
      vc_OxygenDeficit = 1.0 - int(vc_TimeUnderAnoxia / 4) * (1.0 - vc_MaxOxygenDeficit);
    } else {
      vc_TimeUnderAnoxia = 0;
      vc_OxygenDeficit = 1.0;
    }
    if (vc_OxygenDeficit > 1.0)
      vc_OxygenDeficit = 1.0;

    return vc_OxygenDeficit;
  };

  var fc_CropDevelopmentalStage = function (
    vw_MeanAirTemperature,
    pc_BaseTemperature,
    pc_OptimumTemperature,
    pc_StageTemperatureSum,
    vc_TimeStep,
    d_SoilMoisture_m3,
    d_FieldCapacity,
    d_PermanentWiltingPoint,
    pc_NumberOfDevelopmentalStages,
    vc_VernalisationFactor,
    vc_DaylengthFactor,
    vc_CropNRedux
  ) {

    var vc_CapillaryWater;
    var vc_DevelopmentAccelerationByNitrogenStress = 0.0; // old NPROG
    var vc_DevelopmentAccelerationByWaterStress = 0.0; // old WPROG
    var vc_DevelopmentAccelerationByStress = 0.0; // old DEVPROG
    var vc_SoilTemperature = soilColumn[0].get_Vs_SoilTemperature();

    if (vc_DevelopmentalStage == 0) {

      if (vc_SoilTemperature > pc_BaseTemperature[vc_DevelopmentalStage]) {

        vc_CapillaryWater = d_FieldCapacity - d_PermanentWiltingPoint;

        /** @todo Claas: Schränkt trockener Boden das Aufsummieren der Wärmeeinheiten ein, oder
         sollte nicht eher nur der Wechsel in das Stadium 1 davon abhängen? --> Christian */

        if (pc_EmergenceMoistureControlOn == true && pc_EmergenceFloodingControlOn == true) {

          if (d_SoilMoisture_m3 > ((0.2 * vc_CapillaryWater) + d_PermanentWiltingPoint)
            && (soilColumn.vs_SurfaceWaterStorage < 0.001)) {
          // Germination only if soil water content in top layer exceeds
          // 20% of capillary water, but is not beyond field capacity and
          // if no water is stored on the soil surface.

            vc_CurrentTemperatureSum[vc_DevelopmentalStage] += (vc_SoilTemperature
              - pc_BaseTemperature[vc_DevelopmentalStage]) * vc_TimeStep;

            if (vc_CurrentTemperatureSum[vc_DevelopmentalStage] >= pc_StageTemperatureSum[vc_DevelopmentalStage]) {
              vc_DevelopmentalStage++;
            }
          }
        } else if (pc_EmergenceMoistureControlOn == true && pc_EmergenceFloodingControlOn == false) {

          if (d_SoilMoisture_m3 > ((0.2 * vc_CapillaryWater) + d_PermanentWiltingPoint)) {
          // Germination only if soil water content in top layer exceeds
          // 20% of capillary water, but is not beyond field capacity.

            vc_CurrentTemperatureSum[vc_DevelopmentalStage] += (vc_SoilTemperature
              - pc_BaseTemperature[vc_DevelopmentalStage]) * vc_TimeStep;

            if (vc_CurrentTemperatureSum[vc_DevelopmentalStage] >= pc_StageTemperatureSum[vc_DevelopmentalStage]) {
              vc_DevelopmentalStage++;

            }
          }
        } else if (pc_EmergenceMoistureControlOn == false && pc_EmergenceFloodingControlOn == true) {

          if (soilColumn.vs_SurfaceWaterStorage < 0.001) {
            // Germination only if no water is stored on the soil surface.

            vc_CurrentTemperatureSum[vc_DevelopmentalStage] += (vc_SoilTemperature
              - pc_BaseTemperature[vc_DevelopmentalStage]) * vc_TimeStep;

            if (vc_CurrentTemperatureSum[vc_DevelopmentalStage] >= pc_StageTemperatureSum[vc_DevelopmentalStage]) {
              vc_DevelopmentalStage++;
            }
          }

        } else {
          vc_CurrentTemperatureSum[vc_DevelopmentalStage] += (vc_SoilTemperature
                - pc_BaseTemperature[vc_DevelopmentalStage]) * vc_TimeStep;

          if (vc_CurrentTemperatureSum[vc_DevelopmentalStage] >= pc_StageTemperatureSum[vc_DevelopmentalStage]) {
            vc_DevelopmentalStage++;
          }
        }
      }
    } else if (vc_DevelopmentalStage > 0) {

      // Development acceleration by N deficit in crop tissue
      if ((pc_DevelopmentAccelerationByNitrogenStress == 1) &&
          (pc_AssimilatePartitioningCoeff[vc_DevelopmentalStage][vc_StorageOrgan] > 0.9)){

        vc_DevelopmentAccelerationByNitrogenStress = 1.0 + ((1.0 - vc_CropNRedux) * (1.0 - vc_CropNRedux));

      } else {

        vc_DevelopmentAccelerationByNitrogenStress = 1.0;
      }

      // Development acceleration by water deficit
      if ((vc_TranspirationDeficit < pc_DroughtStressThreshold[vc_DevelopmentalStage]) &&
          (pc_AssimilatePartitioningCoeff[vc_DevelopmentalStage][vc_StorageOrgan] > 0.9)){

        if (vc_OxygenDeficit < 1.0) {
          vc_DevelopmentAccelerationByWaterStress = 1.0;
        } else {
          vc_DevelopmentAccelerationByWaterStress = 1.0 + ((1.0 - vc_TranspirationDeficit)
          * (1.0 - vc_TranspirationDeficit));
        }

      } else {
        vc_DevelopmentAccelerationByWaterStress = 1.0;
      }

      vc_DevelopmentAccelerationByStress = max(vc_DevelopmentAccelerationByNitrogenStress,
          vc_DevelopmentAccelerationByWaterStress);

      if (vw_MeanAirTemperature > pc_BaseTemperature[vc_DevelopmentalStage]) {

        if (vw_MeanAirTemperature > pc_OptimumTemperature[vc_DevelopmentalStage]){
                  vw_MeanAirTemperature = pc_OptimumTemperature[vc_DevelopmentalStage];
        }

        vc_CurrentTemperatureSum[vc_DevelopmentalStage] += (vw_MeanAirTemperature
            - pc_BaseTemperature[vc_DevelopmentalStage]) * vc_VernalisationFactor * vc_DaylengthFactor
            * vc_DevelopmentAccelerationByStress * vc_TimeStep;

        vc_CurrentTotalTemperatureSum += (vw_MeanAirTemperature - pc_BaseTemperature[vc_DevelopmentalStage])
            * vc_VernalisationFactor * vc_DaylengthFactor * vc_DevelopmentAccelerationByStress * vc_TimeStep;

      }

      if (vc_CurrentTemperatureSum[vc_DevelopmentalStage] >= pc_StageTemperatureSum[vc_DevelopmentalStage]) {

        if (vc_DevelopmentalStage < (pc_NumberOfDevelopmentalStages - 1)) {

          vc_DevelopmentalStage++;
        }
      }

    } else {
      logger(MSG.WARN, "irregular developmental stage");
    }

  };

  // double 
  var fc_KcFactor = function (
  vc_DevelopmentalStage, 
  d_StageTemperatureSum,
  d_CurrentTemperatureSum,
  pc_InitialKcFactor,
  d_StageKcFactor,
  d_EarlierStageKcFactor
  ) {

    var vc_KcFactor;

    var vc_RelativeDevelopment = d_CurrentTemperatureSum / d_StageTemperatureSum; // old relint

    if (vc_RelativeDevelopment > 1.0) vc_RelativeDevelopment = 1.0;

    if (vc_DevelopmentalStage == 0)
      vc_KcFactor = pc_InitialKcFactor + (d_StageKcFactor - pc_InitialKcFactor) * vc_RelativeDevelopment;
    else // Interpolating the Kc Factors
      vc_KcFactor = d_EarlierStageKcFactor + ((d_StageKcFactor - d_EarlierStageKcFactor) * vc_RelativeDevelopment);

    return vc_KcFactor;
  };

  var fc_CropSize = function (
    pc_MaxCropHeight,
    pc_MaxCropDiameter,
    pc_StageAtMaxHeight,
    pc_StageAtMaxDiameter,
    pc_StageTemperatureSum,
    vc_CurrentTotalTemperatureSum,
    pc_CropHeightP1,
    pc_CropHeightP2
  ) {

    var vc_TotalTemperatureSumForHeight = 0.0;
    for (var i_Stage = 1; i_Stage < pc_StageAtMaxHeight + 1; i_Stage++)
      vc_TotalTemperatureSumForHeight += pc_StageTemperatureSum[i_Stage];

    var vc_TotalTemperatureSumForDiameter = 0.0;
    for (var i_Stage = 1; i_Stage < pc_StageAtMaxDiameter + 1; i_Stage++)
      vc_TotalTemperatureSumForDiameter += pc_StageTemperatureSum[i_Stage];

    var vc_RelativeTotalDevelopmentForHeight = vc_CurrentTotalTemperatureSum / vc_TotalTemperatureSumForHeight;
    if (vc_RelativeTotalDevelopmentForHeight > 1.0)
      vc_RelativeTotalDevelopmentForHeight = 1.0;

    var vc_RelativeTotalDevelopmentForDiameter = vc_CurrentTotalTemperatureSum / vc_TotalTemperatureSumForDiameter;
    if (vc_RelativeTotalDevelopmentForDiameter > 1.0)
      vc_RelativeTotalDevelopmentForDiameter = 1.0;

    if (vc_RelativeTotalDevelopmentForHeight > 0.0)
      vc_CropHeight = pc_MaxCropHeight / (1.0 + exp(-pc_CropHeightP1 * (vc_RelativeTotalDevelopmentForHeight- pc_CropHeightP2)));
    else 
      vc_CropHeight = 0.0;

    if (vc_RelativeTotalDevelopmentForDiameter > 0.0)
      vc_CropDiameter = pc_MaxCropDiameter * vc_RelativeTotalDevelopmentForDiameter;
    else
      vc_CropDiameter = 0.0;
  };

  var fc_CropGreenArea = function (
    d_LeafBiomassIncrement,
    d_LeafBiomassDecrement,
    vc_CropHeight,
    vc_CropDiameter,
    d_SpecificLeafAreaStart,
    d_SpecificLeafAreaEnd,
    d_SpecificLeafAreaEarly,
    d_StageTemperatureSum,
    d_CurrentTemperatureSum,
    pc_PlantDensity,
    vc_TimeStep
  ) {

    vc_LeafAreaIndex += (
      (d_LeafBiomassIncrement * (d_SpecificLeafAreaStart + (d_CurrentTemperatureSum /
      d_StageTemperatureSum * (d_SpecificLeafAreaEnd - d_SpecificLeafAreaStart))) * vc_TimeStep) -
      (d_LeafBiomassDecrement * d_SpecificLeafAreaEarly * vc_TimeStep)
    ); // [ha ha-1]

    if (vc_LeafAreaIndex <= 0.0)
      vc_LeafAreaIndex = 0.001;

    vc_GreenAreaIndex = vc_LeafAreaIndex + (vc_CropHeight * PI * vc_CropDiameter * pc_PlantDensity); // [m2 m-2]
    };

    // double 
    var fc_SoilCoverage = function (vc_LeafAreaIndex) {

    vc_SoilCoverage = 1.0 - (exp(-0.5 * vc_LeafAreaIndex));

    return vc_SoilCoverage;

  };

  var fc_CropPhotosynthesis = function (
    vw_MeanAirTemperature,
    vw_MaxAirTemperature,
    vw_MinAirTemperature,
    vc_GlobalRadiation,
    vw_AtmosphericCO2Concentration,
    vs_Latitude,
    vc_LeafAreaIndex,
    pc_DefaultRadiationUseEfficiency,
    pc_MaxAssimilationRate,
    pc_MinimumTemperatureForAssimilation,
    vc_AstronomicDayLenght,
    vc_Declination,
    vc_ClearDayRadiation,
    vc_EffectiveDayLength,
    vc_OvercastDayRadiation
  ) {

    var vc_CO2CompensationPoint = 0.0; // old COcomp
    var vc_CO2CompensationPointReference = 0.0;
    var vc_RadiationUseEfficiency = 0.0; // old EFF
    var vc_RadiationUseEfficiencyReference = 0.0;
    var KTvmax = 0.0; // old KTvmax
    var KTkc = 0.0; // old KTkc
    var KTko = 0.0; // old KTko
    var vc_AmaxFactor = 0.0; // old fakamax
    var vc_AmaxFactorReference = 0.0;
    var vc_Vcmax = 0.0; // old vcmax
    var vc_VcmaxReference = 0.0;
    var Mkc = 0.0; // old Mkc
    var Mko = 0.0; // old Mko
    var Oi = 0.0; // old Oi
    var Ci = 0.0; // old Ci
    var vc_AssimilationRateReference = 0.0;
    var vc_HoffmannK1 = 0.0; // old KCo1
    var vc_HoffmannC0 = 0.0; // old coco
    var vc_HoffmannKCO2 = 0.0; // old KCO2
    var vc_NetRadiationUseEfficiency = 0.0; // old EFFE;
    var vc_NetRadiationUseEfficiencyReference = 0.0;
    var SSLAE = 0.0; // old SSLAE;
    var X = 0.0; // old X;
    var XReference = 0.0;
    var PHCH1 = 0.0; // old PHCH1;
    var PHCH1Reference = 0.0;
    var Y = 0.0; // old Y;
    var YReference = 0.0;
    var PHCH2 = 0.0; // old PHCH2;
    var PHCH2Reference = 0.0;
    var PHCH = 0.0; // old PHCH;
    var PHCHReference = 0.0;
    var PHC3 = 0.0; // old PHC3;
    var PHC3Reference = 0.0;
    var PHC4 = 0.0; // old PHC4;
    var PHC4Reference = 0.0;
    var PHCL = 0.0; // old PHCL;
    var PHCLReference = 0.0;
    var Z = 0.0; // old Z;
    var PHOH1 = 0.0; // old PHOH1;
    var PHOH = 0.0; // old PHOH;
    var PHO3 = 0.0; // old PHO3;
    var PHO3Reference = 0.0;
    var PHOL = 0.0; // old PHOL;
    var PHOLReference = 0.0;
    var vc_ClearDayCO2AssimilationReference = 0.0;
    var vc_OvercastDayCO2AssimilationReference = 0.0;
    var vc_ClearDayCO2Assimilation = 0.0; // old DGAC;
    var vc_OvercastDayCO2Assimilation = 0.0; // old DGAO;
    //var vc_GrossAssimilates = 0.0;
    var vc_GrossCO2Assimilation = 0.0; // old DTGA;
    var vc_GrossCO2AssimilationReference = 0.0; // used for ET0 calculation
    var vc_OvercastSkyTimeFraction = 0.0; // old FOV;
    var vc_MaintenanceTemperatureDependency = 0.0; // old TEFF
    var vc_MaintenanceRespiration = 0.0; // old MAINTS
    var vc_DroughtStressThreshold = 0.0; // old VSWELL;
    var vc_PhotoTemperature = 0.0;
    var vc_NightTemperature = 0.0;
    var vc_PhotoMaintenanceRespiration = 0.0;
    var vc_DarkMaintenanceRespiration = 0.0;
    var vc_PhotoGrowthRespiration = 0.0;
    var vc_DarkGrowthRespiration = 0.0;

    var user_crops = centralParameterProvider.userCropParameters;
    var pc_ReferenceLeafAreaIndex = user_crops.pc_ReferenceLeafAreaIndex;
    var pc_ReferenceMaxAssimilationRate = user_crops.pc_ReferenceMaxAssimilationRate;
    var pc_MaintenanceRespirationParameter_1 = user_crops.pc_MaintenanceRespirationParameter1;
    var pc_MaintenanceRespirationParameter_2 = user_crops.pc_MaintenanceRespirationParameter2;

    var pc_GrowthRespirationParameter_1 = user_crops.pc_GrowthRespirationParameter1;
    var pc_GrowthRespirationParameter_2 = user_crops.pc_GrowthRespirationParameter2;
    var pc_CanopyReflectionCoeff = user_crops.pc_CanopyReflectionCoefficient; // old REFLC;

    // Calculation of CO2 impact on crop growth
    if (pc_CO2Method == 3) {

      //////////////////////////////////////////////////////////////////////////
      // Method 3:
      // Long, S.P. 1991. Modification of the response of photosynthetic
      // productivity to rising temperature by atmospheric CO2
      // concentrations - Has its importance been underestimated. Plant
      // Cell Environ. 14(8): 729-739.
      // and
      // Mitchell, R.A.C., D.W. Lawlor, V.J. Mitchell, C.L. Gibbard, E.M.
      // White, and J.R. Porter. 1995. Effects of elevated CO2
      // concentration and increased temperature on winter-wheat - Test
      // of ARCWHEAT1 simulation model. Plant Cell Environ. 18(7):736-748.
      //////////////////////////////////////////////////////////////////////////

      KTvmax = exp(68800.0 * ((vw_MeanAirTemperature + 273.0) - 298.0)
          / (298.0 * (vw_MeanAirTemperature + 273.0) * 8.314)) * pow(((vw_MeanAirTemperature + 273.0) / 298.0), 0.5);

      KTkc = exp(65800.0 * ((vw_MeanAirTemperature + 273.0) - 298.0) / (298.0 * (vw_MeanAirTemperature + 273.0) * 8.314))
          * pow(((vw_MeanAirTemperature + 273.0) / 298.0), 0.5);

      KTko = exp(1400.0 * ((vw_MeanAirTemperature + 273.0) - 298.0) / (298.0 * (vw_MeanAirTemperature + 273.0) * 8.314))
          * pow(((vw_MeanAirTemperature + 273.0) / 298.0), 0.5);

      // Berechnung des Transformationsfaktors fr pflanzenspez. AMAX bei 25 grad
      vc_AmaxFactor = pc_MaxAssimilationRate / 34.668;
      vc_AmaxFactorReference = pc_ReferenceMaxAssimilationRate / 34.668;
      vc_Vcmax = 98.0 * vc_AmaxFactor * KTvmax;
      vc_VcmaxReference = 98.0 * vc_AmaxFactorReference * KTvmax;

      Mkc = 460.0 * KTkc; //[µmol mol-1]
      Mko = 330.0 * KTko; //[mmol mol-1]

      Oi = 210.0 + (0.047 - 0.0013087 * vw_MeanAirTemperature + 0.000025603 * (vw_MeanAirTemperature
          * vw_MeanAirTemperature) - 0.00000021441 * (vw_MeanAirTemperature * vw_MeanAirTemperature
          * vw_MeanAirTemperature)) / 0.026934;

      Ci = vw_AtmosphericCO2Concentration * 0.7 * (1.674 - 0.061294 * vw_MeanAirTemperature + 0.0011688
          * (vw_MeanAirTemperature * vw_MeanAirTemperature) - 0.0000088741 * (vw_MeanAirTemperature
          * vw_MeanAirTemperature * vw_MeanAirTemperature)) / 0.73547;

      vc_CO2CompensationPoint = 0.5 * 0.21 * vc_Vcmax * Oi / (vc_Vcmax * Mko);
      vc_CO2CompensationPointReference = 0.5 * 0.21 * vc_VcmaxReference * Oi / (vc_VcmaxReference * Mko);

      vc_RadiationUseEfficiency = min((0.77 / 2.1 * (Ci - vc_CO2CompensationPoint) / (4.5 * Ci + 10.5
          * vc_CO2CompensationPoint) * 8.3769), 0.5);
      vc_RadiationUseEfficiencyReference = min((0.77 / 2.1 * (Ci - vc_CO2CompensationPointReference) / (4.5 * Ci + 10.5
          * vc_CO2CompensationPointReference) * 8.3769), 0.5);

    } else {
      vc_RadiationUseEfficiency = pc_DefaultRadiationUseEfficiency;
      vc_RadiationUseEfficiencyReference = pc_DefaultRadiationUseEfficiency;
    }

    if (pc_CarboxylationPathway == 1) {

      if (pc_CO2Method == 2) {

        //////////////////////////////////////////////////////////////////////////
        // Method 2:
        // Hoffmann, F. 1995. Fagus, a model for growth and development of
        // beech. Ecol. Mod. 83 (3):327-348.
        //////////////////////////////////////////////////////////////////////////

        if (vw_MeanAirTemperature < pc_MinimumTemperatureForAssimilation) {
          vc_AssimilationRate = 0.0;
          vc_AssimilationRateReference = 0.0;
        } else if (vw_MeanAirTemperature < 10.0) {
          vc_AssimilationRate = pc_MaxAssimilationRate * vw_MeanAirTemperature / 10.0 * 0.4;
          vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * vw_MeanAirTemperature / 10.0 * 0.4;
        } else if (vw_MeanAirTemperature < 15.0) {
          vc_AssimilationRate = pc_MaxAssimilationRate * (0.4 + (vw_MeanAirTemperature - 10.0) / 5.0 * 0.5);
          vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * (0.4 + (vw_MeanAirTemperature - 10.0) / 5.0
              * 0.5);
        } else if (vw_MeanAirTemperature < 25.0) {
          vc_AssimilationRate = pc_MaxAssimilationRate * (0.9 + (vw_MeanAirTemperature - 15.0) / 10.0 * 0.1);
          vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * (0.9 + (vw_MeanAirTemperature - 15.0) / 10.0
              * 0.1);
        } else if (vw_MeanAirTemperature < 35.0) {
          vc_AssimilationRate = pc_MaxAssimilationRate * (1.0 - (vw_MeanAirTemperature - 25.0) / 10.0);
          vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * (1.0 - (vw_MeanAirTemperature - 25.0) / 10.0);
        } else {
          vc_AssimilationRate = 0.0;
          vc_AssimilationRateReference = 0.0;
        }


        /** @FOR_PARAM */
        vc_HoffmannK1 = 220.0 + 0.158 * (vc_GlobalRadiation * 86400.0 / 1000000.0);

        // PAR [MJ m-2], Hoffmann's model requires [W m-2] ->
        // conversion of [MJ m-2] to [W m-2]

        vc_HoffmannC0 = 80.0 - 0.036 * (vc_GlobalRadiation * 86400.0 / 1000000.0);


        vc_HoffmannKCO2 = ((vw_AtmosphericCO2Concentration - vc_HoffmannC0) / (vc_HoffmannK1
            + vw_AtmosphericCO2Concentration - vc_HoffmannC0)) / ((350.0 - vc_HoffmannC0) / (vc_HoffmannK1 + 350.0
            - vc_HoffmannC0));

        vc_AssimilationRate = vc_AssimilationRate * vc_HoffmannKCO2;
        vc_AssimilationRateReference = vc_AssimilationRateReference * vc_HoffmannKCO2;

      } else if (pc_CO2Method == 3) {

        vc_AssimilationRate = (Ci - vc_CO2CompensationPoint) * vc_Vcmax / (Ci + Mkc * (1.0 + Oi / Mko)) * 1.656;
        vc_AssimilationRateReference = (Ci - vc_CO2CompensationPointReference) * vc_VcmaxReference / (Ci + Mkc * (1.0
            + Oi / Mko)) * 1.656;

        if (vw_MeanAirTemperature < pc_MinimumTemperatureForAssimilation) {
          vc_AssimilationRate = 0.0;
          vc_AssimilationRateReference = 0.0;
        }
      }


    } else { //if pc_CarboxylationPathway = 2
      if (vw_MeanAirTemperature < pc_MinimumTemperatureForAssimilation) {
        vc_AssimilationRate = 0;
        vc_AssimilationRateReference = 0.0;

        // Sage & Kubien (2007): The temperature response of C3 and C4 phtotsynthesis.
        // Plant, Cell and Environment 30, 1086 - 1106.

      } else if (vw_MeanAirTemperature < 9.0) {
        vc_AssimilationRate = pc_MaxAssimilationRate * vw_MeanAirTemperature / 10.0 * 0.08;
        vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * vw_MeanAirTemperature / 10.0 * 0.08;
      } else if (vw_MeanAirTemperature < 14.0) {
        vc_AssimilationRate = pc_MaxAssimilationRate * (0.071 + (vw_MeanAirTemperature - 9.0) * 0.03);
        vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * (0.071 + (vw_MeanAirTemperature - 9.0) * 0.03);
      } else if (vw_MeanAirTemperature < 20.0) {
        vc_AssimilationRate = pc_MaxAssimilationRate * (0.221 + (vw_MeanAirTemperature - 14.0) * 0.09);
        vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * (0.221 + (vw_MeanAirTemperature - 14.0) * 0.09);
      } else if (vw_MeanAirTemperature < 24.0) {
        vc_AssimilationRate = pc_MaxAssimilationRate * (0.761 + (vw_MeanAirTemperature - 20.0) * 0.04);
        vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * (0.761 + (vw_MeanAirTemperature - 20.0) * 0.04);
      } else if (vw_MeanAirTemperature < 32.0) {
        vc_AssimilationRate = pc_MaxAssimilationRate * (0.921 + (vw_MeanAirTemperature - 24.0) * 0.01);
        vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * (0.921 + (vw_MeanAirTemperature - 24.0) * 0.01);
      } else if (vw_MeanAirTemperature < 38.0) {
        vc_AssimilationRate = pc_MaxAssimilationRate;
        vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate;
      } else if (vw_MeanAirTemperature < 42.0) {
        vc_AssimilationRate = pc_MaxAssimilationRate * (1.0 - (vw_MeanAirTemperature - 38.0) * 0.01);
        vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * (1.0 - (vw_MeanAirTemperature - 38.0) * 0.01);
      } else if (vw_MeanAirTemperature < 45.0) {
        vc_AssimilationRate = pc_MaxAssimilationRate * (0.96 - (vw_MeanAirTemperature - 42.0) * 0.04);
        vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * (0.96 - (vw_MeanAirTemperature - 42.0) * 0.04);
      } else if (vw_MeanAirTemperature < 54.0) {
        vc_AssimilationRate = pc_MaxAssimilationRate * (0.84 - (vw_MeanAirTemperature - 45.0) * 0.09);
        vc_AssimilationRateReference = pc_ReferenceMaxAssimilationRate * (0.84 - (vw_MeanAirTemperature - 45.0) * 0.09);
      } else {
        vc_AssimilationRate = 0;
        vc_AssimilationRateReference = 0;
      }
    }

    if (cutting_delay_days>0) {
        vc_AssimilationRate = 0.0;
        vc_AssimilationRateReference = 0.0;
    }

    if (vc_AssimilationRate < 0.1) {
      vc_AssimilationRate = 0.1;
    }

    if (vc_AssimilationRateReference < 0.1) {
      vc_AssimilationRateReference = 0.1;
    }

    ///////////////////////////////////////////////////////////////////////////
    // Calculation of light interception in the crop
    //
    // Penning De Vries, F.W.T and H.H. van Laar (1982): Simulation of
    // plant growth and crop production. Pudoc, Wageningen, The
    // Netherlands, p. 87-97.
    ///////////////////////////////////////////////////////////////////////////

    vc_NetRadiationUseEfficiency = (1.0 - pc_CanopyReflectionCoeff) * vc_RadiationUseEfficiency;
    vc_NetRadiationUseEfficiencyReference = (1.0 - pc_CanopyReflectionCoeff) * vc_RadiationUseEfficiencyReference;

    SSLAE = sin((90.0 + vc_Declination - vs_Latitude) * PI / 180.0); // = HERMES

    X = log(1.0 + 0.45 * vc_ClearDayRadiation / (vc_EffectiveDayLength * 3600.0) * vc_NetRadiationUseEfficiency / (SSLAE
        * vc_AssimilationRate)); // = HERMES
    XReference = log(1.0 + 0.45 * vc_ClearDayRadiation / (vc_EffectiveDayLength * 3600.0)
        * vc_NetRadiationUseEfficiencyReference / (SSLAE * vc_AssimilationRateReference));

    PHCH1 = SSLAE * vc_AssimilationRate * vc_EffectiveDayLength * X / (1.0 + X); // = HERMES
    PHCH1Reference = SSLAE * vc_AssimilationRateReference * vc_EffectiveDayLength * XReference / (1.0 + XReference);

    Y = log(1.0 + 0.55 * vc_ClearDayRadiation / (vc_EffectiveDayLength * 3600.0) * vc_NetRadiationUseEfficiency / ((5.0
        - SSLAE) * vc_AssimilationRate)); // = HERMES
    YReference = log(1.0 + 0.55 * vc_ClearDayRadiation / (vc_EffectiveDayLength * 3600.0) * vc_NetRadiationUseEfficiency
        / ((5.0 - SSLAE) * vc_AssimilationRateReference));

    PHCH2 = (5.0 - SSLAE) * vc_AssimilationRate * vc_EffectiveDayLength * Y / (1.0 + Y); // = HERMES
    PHCH2Reference = (5.0 - SSLAE) * vc_AssimilationRateReference * vc_EffectiveDayLength * YReference / (1.0
        + YReference);

    PHCH = 0.95 * (PHCH1 + PHCH2) + 20.5; // = HERMES
    PHCHReference = 0.95 * (PHCH1Reference + PHCH2Reference) + 20.5;

    PHC3 = PHCH * (1.0 - exp(-0.8 * vc_LeafAreaIndex));
    PHC3Reference = PHCHReference * (1.0 - exp(-0.8 * pc_ReferenceLeafAreaIndex));

    PHC4 = vc_AstronomicDayLenght * vc_LeafAreaIndex * vc_AssimilationRate;
    PHC4Reference = vc_AstronomicDayLenght * pc_ReferenceLeafAreaIndex * vc_AssimilationRateReference;

    if (PHC3 < PHC4) {
      PHCL = PHC3 * (1.0 - exp(-PHC4 / PHC3));
    } else {
      PHCL = PHC4 * (1.0 - exp(-PHC3 / PHC4));
    }

    if (PHC3Reference < PHC4Reference) {
      PHCLReference = PHC3Reference * (1.0 - exp(-PHC4Reference / PHC3Reference));
    } else {
      PHCLReference = PHC4Reference * (1.0 - exp(-PHC3Reference / PHC4Reference));
    }

    Z = vc_OvercastDayRadiation / (vc_EffectiveDayLength * 3600.0) * vc_NetRadiationUseEfficiency / (5.0
        * vc_AssimilationRate);

    PHOH1 = 5.0 * vc_AssimilationRate * vc_EffectiveDayLength * Z / (1.0 + Z);
    PHOH = 0.9935 * PHOH1 + 1.1;
    PHO3 = PHOH * (1.0 - exp(-0.8 * vc_LeafAreaIndex));
    PHO3Reference = PHOH * (1.0 - exp(-0.8 * pc_ReferenceLeafAreaIndex));

    if (PHO3 < PHC4) {
      PHOL = PHO3 * (1.0 - exp(-PHC4 / PHO3));
    } else {
      PHOL = PHC4 * (1.0 - exp(-PHO3 / PHC4));
    }

    if (PHO3Reference < PHC4Reference) {
      PHOLReference = PHO3Reference * (1.0 - exp(-PHC4Reference / PHO3Reference));
    } else {
      PHOLReference = PHC4Reference * (1.0 - exp(-PHO3Reference / PHC4Reference));
    }

    if (vc_LeafAreaIndex < 5.0) {
      vc_ClearDayCO2Assimilation = PHCL; // [J m-2]
      vc_OvercastDayCO2Assimilation = PHOL; // [J m-2]
    } else {
      vc_ClearDayCO2Assimilation = PHCH; // [J m-2]
      vc_OvercastDayCO2Assimilation = PHOH; // [J m-2]
    }

    vc_ClearDayCO2AssimilationReference = PHCLReference;
    vc_OvercastDayCO2AssimilationReference = PHOLReference;

    // Calculation of time fraction for overcast sky situations by
    // comparing clear day radiation and measured PAR in [J m-2].
    // HERMES uses PAR as 50% of global radiation

    vc_OvercastSkyTimeFraction = (vc_ClearDayRadiation - (1000000.0 * vc_GlobalRadiation * 0.50)) / (0.8
        * vc_ClearDayRadiation); // [J m-2]

    if (vc_OvercastSkyTimeFraction > 1.0) {
      vc_OvercastSkyTimeFraction = 1.0;
    }

    if (vc_OvercastSkyTimeFraction < 0.0) {
      vc_OvercastSkyTimeFraction = 0.0;
    }

    // Calculation of gross CO2 assimilation in dependence of cloudiness
    vc_GrossCO2Assimilation = vc_OvercastSkyTimeFraction * vc_OvercastDayCO2Assimilation + (1.0
        - vc_OvercastSkyTimeFraction) * vc_ClearDayCO2Assimilation;

    vc_GrossCO2AssimilationReference = vc_OvercastSkyTimeFraction * vc_OvercastDayCO2AssimilationReference + (1.0
        - vc_OvercastSkyTimeFraction) * vc_ClearDayCO2AssimilationReference;

    if (vc_OxygenDeficit < 1.0) {

      // vc_OxygenDeficit separates drought stress (ETa/Etp) from saturation stress.
      vc_DroughtStressThreshold = 0.0;
    } else {
      vc_DroughtStressThreshold = pc_DroughtStressThreshold[vc_DevelopmentalStage];
    }

    // Gross CO2 assimilation is used for reference evapotranspiration calculation.
    // For this purpose it must not be affected by drought stress, as the grass
    // reference is defined as being always well supplied with water. Water stress
    // is acting at a later stage.

    if (vc_TranspirationDeficit < vc_DroughtStressThreshold) {
      vc_GrossCO2Assimilation = vc_GrossCO2Assimilation; // *  vc_TranspirationDeficit;
    }

    // Calculation of photosynthesis rate from [kg CO2 ha-1 d-1] to [kg CH2O ha-1 d-1]
    vc_GrossPhotosynthesis = vc_GrossCO2Assimilation * 30.0 / 44.0;

    // Calculation of photosynthesis rate from [kg CO2 ha-1 d-1]  to [mol m-2 s-1] or [cm3 cm-2 s-1]
    vc_GrossPhotosynthesis_mol = vc_GrossCO2Assimilation * 22414.0 / (10.0 * 3600.0 * 24.0 * 44.0);
    vc_GrossPhotosynthesisReference_mol = vc_GrossCO2AssimilationReference * 22414.0 / (10.0 * 3600.0 * 24.0 * 44.0);

    // Converting photosynthesis rate from [kg CO2 ha leaf-1 d-1] to [kg CH2O ha-1  d-1]
    vc_Assimilates = vc_GrossCO2Assimilation * 30.0 / 44.0;

    // reduction value for assimilate amount to simulate field conditions;
    vc_Assimilates *= cropParams.pc_FieldConditionModifier;

    if (vc_TranspirationDeficit < vc_DroughtStressThreshold) {
      vc_Assimilates = vc_Assimilates * vc_TranspirationDeficit;

    }

    vc_GrossAssimilates = vc_Assimilates;

    // ########################################################################
    // #                              AGROSIM                                 #
    // ########################################################################

    // AGROSIM night and day temperatures
    vc_PhotoTemperature = vw_MaxAirTemperature - ((vw_MaxAirTemperature - vw_MinAirTemperature) / 4.0);
    vc_NightTemperature = vw_MinAirTemperature + ((vw_MaxAirTemperature - vw_MinAirTemperature) / 4.0);

    var vc_MaintenanceRespirationSum = 0.0;
    // AGOSIM night and day maintenance and growth respiration
    for (var i_Organ = 0; i_Organ < pc_NumberOfOrgans; i_Organ++) {
      vc_MaintenanceRespirationSum += (vc_OrganBiomass[i_Organ] - vc_OrganDeadBiomass[i_Organ])
          * pc_OrganMaintenanceRespiration[i_Organ]; // [kg CH2O ha-1]
      // * vc_ActiveFraction[i_Organ]; wenn nicht schon durch acc dead matter abgedeckt
    }

    var vc_NormalisedDayLength = 2.0 - (vc_PhotoperiodicDaylength / 12.0);

    vc_PhotoMaintenanceRespiration = vc_MaintenanceRespirationSum * pow(2.0, (pc_MaintenanceRespirationParameter_1
                      * (vc_PhotoTemperature - pc_MaintenanceRespirationParameter_2))) * (2.0 - vc_NormalisedDayLength);// @todo: [g m-2] --> [kg ha-1]

    vc_DarkMaintenanceRespiration = vc_MaintenanceRespirationSum * pow(2.0, (pc_MaintenanceRespirationParameter_1
                     * (vc_NightTemperature - pc_MaintenanceRespirationParameter_2))) * vc_NormalisedDayLength; // @todo: [g m-2] --> [kg ha-1]

    vc_MaintenanceRespirationAS = vc_PhotoMaintenanceRespiration + vc_DarkMaintenanceRespiration; // [kg CH2O ha-1]


    vc_Assimilates -= vc_PhotoMaintenanceRespiration + vc_DarkMaintenanceRespiration; // [kg CH2O ha-1]
    var vc_GrowthRespirationSum = 0.0;

    for (var i_Organ = 0; i_Organ < pc_NumberOfOrgans; i_Organ++) {
      vc_GrowthRespirationSum += (vc_OrganBiomass[i_Organ] - vc_OrganDeadBiomass[i_Organ])
          * pc_OrganGrowthRespiration[i_Organ];
    }

    if (vc_Assimilates > 0.0) {
      vc_PhotoGrowthRespiration = vc_GrowthRespirationSum * pow(2.0, (pc_GrowthRespirationParameter_1
          * (vc_PhotoTemperature - pc_GrowthRespirationParameter_2))) * (2.0 - vc_NormalisedDayLength); // [kg CH2O ha-1]
      if (vc_Assimilates > vc_PhotoGrowthRespiration) {
        vc_Assimilates -= vc_PhotoGrowthRespiration;

      } else {
        vc_PhotoGrowthRespiration = vc_Assimilates; // in this case the plant will be restricted in growth!
        vc_Assimilates = 0.0;
      }
    }

    if (vc_Assimilates > 0.0) {
      vc_DarkGrowthRespiration = vc_GrowthRespirationSum * pow(2.0, (pc_GrowthRespirationParameter_1
          * (vc_PhotoTemperature - pc_GrowthRespirationParameter_2))) * vc_NormalisedDayLength; // [kg CH2O ha-1]
      if (vc_Assimilates > vc_DarkGrowthRespiration) {

        vc_Assimilates -= vc_DarkGrowthRespiration;
      } else {
        vc_DarkGrowthRespiration = vc_Assimilates; // in this case the plant will be restricted in growth!
        vc_Assimilates = 0.0;
      }

    }
    vc_GrowthRespirationAS = vc_PhotoGrowthRespiration + vc_DarkGrowthRespiration; // [kg CH2O ha-1]
    vc_TotalRespired = vc_GrossAssimilates - vc_Assimilates; // [kg CH2O ha-1]

    /** to reactivate HERMES algorithms, needs to be vc_NetPhotosynthesis
     * used instead of  vc_Assimilates in the subsequent methods */

    // #########################################################################
    // HERMES calculation of maintenance respiration in dependence of temperature

    vc_MaintenanceTemperatureDependency = pow(2.0, (0.1 * vw_MeanAirTemperature - 2.5));

    vc_MaintenanceRespiration = 0.0;

    for (var i_Organ = 0; i_Organ < pc_NumberOfOrgans; i_Organ++) {
      vc_MaintenanceRespiration += (vc_OrganBiomass[i_Organ] - vc_OrganDeadBiomass[i_Organ])
          * pc_OrganMaintenanceRespiration[i_Organ];
    }

    if (vc_GrossPhotosynthesis < (vc_MaintenanceRespiration * vc_MaintenanceTemperatureDependency)) {
      vc_NetMaintenanceRespiration = vc_GrossPhotosynthesis;
    } else {
      vc_NetMaintenanceRespiration = vc_MaintenanceRespiration * vc_MaintenanceTemperatureDependency;
    }

    if (vw_MeanAirTemperature < pc_MinimumTemperatureForAssimilation) {
      vc_GrossPhotosynthesis = vc_NetMaintenanceRespiration;
    }
    // This section is now inactive
    // #########################################################################

  };

  var fc_HeatStressImpact = function (
    vw_MaxAirTemperature,
    vw_MinAirTemperature,
    vc_CurrentTotalTemperatureSum
  ) {

    // AGROSIM night and day temperatures
    var vc_PhotoTemperature = vw_MaxAirTemperature - ((vw_MaxAirTemperature - vw_MinAirTemperature) / 4.0);
    var vc_FractionOpenFlowers = 0.0;
    var vc_YesterdaysFractionOpenFlowers = 0.0;

    if ((pc_BeginSensitivePhaseHeatStress == 0.0) && (pc_EndSensitivePhaseHeatStress == 0.0)){
      vc_TotalCropHeatImpact = 1.0;
    }

    if ((vc_CurrentTotalTemperatureSum >= pc_BeginSensitivePhaseHeatStress) &&
        vc_CurrentTotalTemperatureSum < pc_EndSensitivePhaseHeatStress){

      // Crop heat redux: Challinor et al. (2005): Simulation of the impact of high
      // temperature stress on annual crop yields. Agricultural and Forest
      // Meteorology 135, 180 - 189.

      var vc_CropHeatImpact = 1.0 - ((vc_PhotoTemperature - pc_CriticalTemperatureHeatStress)
               / (pc_LimitingTemperatureHeatStress - pc_CriticalTemperatureHeatStress));

      if (vc_CropHeatImpact > 1.0)
        vc_CropHeatImpact = 1.0;

      if (vc_CropHeatImpact < 0.0)
        vc_CropHeatImpact = 0.0;

      // Fraction open flowers from Moriondo et al. (2011): Climate change impact
      // assessment: the role of climate extremes in crop yield simulation. Climatic
      // Change 104 (3-4), 679-701.

      vc_FractionOpenFlowers = 1.0 / (1.0 + ((1.0 / 0.015) - 1.0) * exp(-1.4 * vc_DaysAfterBeginFlowering));
      if (vc_DaysAfterBeginFlowering > 0){
        vc_YesterdaysFractionOpenFlowers = 1.0 / (1.0 + ((1.0 / 0.015) - 1.0) * exp(-1.4 * (vc_DaysAfterBeginFlowering - 1)));
      } else {
        vc_YesterdaysFractionOpenFlowers = 0.0;
      }

      var vc_DailyFloweringRate = vc_FractionOpenFlowers - vc_YesterdaysFractionOpenFlowers;

      // Total effect: Challinor et al. (2005): Simulation of the impact of high
      // temperature stress on annual crop yields. Agricultural and Forest
      // Meteorology 135, 180 - 189.
      vc_TotalCropHeatImpact += vc_CropHeatImpact * vc_DailyFloweringRate;

      vc_DaysAfterBeginFlowering += 1;

    }

    if (vc_CurrentTotalTemperatureSum >= pc_EndSensitivePhaseHeatStress){
      if (vc_TotalCropHeatImpact < vc_CropHeatRedux){
        vc_CropHeatRedux = vc_TotalCropHeatImpact;
      }
    }


    };

    var fc_DroughtImpactOnFertility = function (vc_TranspirationDeficit) {

    if (vc_TranspirationDeficit < 0.0) vc_TranspirationDeficit = 0.0;

    // Fertility of the crop is reduced in cases of severe drought during bloom
    if ((vc_TranspirationDeficit < (pc_DroughtImpactOnFertilityFactor *
         pc_DroughtStressThreshold[vc_DevelopmentalStage])) &&
         (pc_AssimilatePartitioningCoeff[vc_DevelopmentalStage][vc_StorageOrgan] > 0.0)){

      var vc_TranspirationDeficitHelper = vc_TranspirationDeficit /
          (pc_DroughtImpactOnFertilityFactor * pc_DroughtStressThreshold[vc_DevelopmentalStage]);

      if (vc_OxygenDeficit < 1.0) {
        vc_DroughtImpactOnFertility = 1.0;
      } else {
        vc_DroughtImpactOnFertility = 1.0 - ((1.0 - vc_TranspirationDeficitHelper) * (1.0 - vc_TranspirationDeficitHelper));
      }

    } else {
      vc_DroughtImpactOnFertility = 1.0;
    }

  }

  var fc_CropNitrogen = function () {

    var vc_RootNRedux        = 0.0; // old REDWU
    var vc_RootNReduxHelper  = 0.0; // old WUX
    //var vc_MinimumNConcentration   = 0.0; // old MININ
    var vc_CropNReduxHelper  = 0.0; // old AUX

    vc_CriticalNConcentration = pc_NConcentrationPN *
          (1.0 + (pc_NConcentrationB0 *
          exp(-0.26 * (vc_AbovegroundBiomass + vc_BelowgroundBiomass) / 1000.0))) / 100.0;
          // [kg ha-1 -> t ha-1]

    vc_TargetNConcentration = vc_CriticalNConcentration * pc_LuxuryNCoeff;

    vc_NConcentrationAbovegroundBiomassOld = vc_NConcentrationAbovegroundBiomass;
    vc_NConcentrationRootOld = vc_NConcentrationRoot;

    if (vc_NConcentrationRoot < 0.01) {

      if (vc_NConcentrationRoot <= 0.005) {
        vc_RootNRedux = 0.0;
      }
      else {

        vc_RootNReduxHelper = (vc_NConcentrationRoot - 0.005) / 0.005;
        vc_RootNRedux = 1.0 - sqrt(1.0 - vc_RootNReduxHelper * vc_RootNReduxHelper);
      }
    }
    else {
      vc_RootNRedux = 1.0;
    }

    if (pc_FixingN == 0){
      if (vc_NConcentrationAbovegroundBiomass < vc_CriticalNConcentration) {

        if (vc_NConcentrationAbovegroundBiomass <= pc_MinimumNConcentration) {
          vc_CropNRedux = 0.0;
        } else {

          vc_CropNReduxHelper = (vc_NConcentrationAbovegroundBiomass - pc_MinimumNConcentration)
        / (vc_CriticalNConcentration - pc_MinimumNConcentration);

    //       // New Monica appraoch
         vc_CropNRedux = 1.0 - exp(pc_MinimumNConcentration - (5.0 * vc_CropNReduxHelper));

    //        // Original HERMES approach
    //        vc_CropNRedux = (1.0 - exp(1.0 + 1.0 / (vc_CropNReduxHelper - 1.0))) *
    //                    (1.0 - exp(1.0 + 1.0 / (vc_CropNReduxHelper - 1.0)));
        }
      } else {
        vc_CropNRedux = 1.0;
      }
    } else if (pc_FixingN == 1){
      if (vc_NConcentrationAbovegroundBiomass < vc_CriticalNConcentration) {
        vc_FixedN = vc_CriticalNConcentration - vc_NConcentrationAbovegroundBiomass;
        vc_NConcentrationAbovegroundBiomass = vc_CriticalNConcentration;
        vc_CropNRedux = 1.0;
      }
    } else {
      vc_CropNRedux = 1.0;
    }

    if (pc_NitrogenResponseOn == false){
      vc_CropNRedux = 1.0;
    }

  };

  var fc_CropDryMatter = function (
    vs_NumberOfLayers,
    vs_LayerThickness,
    vc_DevelopmentalStage,
    vc_Assimilates,
    /*vc_NetMaintenanceRespiration,*/   // hermes o. agrosim
    /*pc_CropSpecificMaxRootingDepth,*/ // JS! unused
    /*vs_SoilSpecificMaxRootingDepth,*/ // JS! unused
    vw_MeanAirTemperature
  ) {

    var vc_MaxRootNConcentration                         = 0.0; // old WGM
    var vc_NConcentrationOptimum                         = 0.0; // old DTOPTN
    var vc_RootNIncrement                                = 0.0; // old WUMM
    var vc_AssimilatePartitioningCoeffOld                = 0.0;
    var vc_AssimilatePartitioningCoeff                   = 0.0;

    var user_crops = centralParameterProvider.userCropParameters;
    var pc_MaxCropNDemand = user_crops.pc_MaxCropNDemand;

    // var pc_GrowthRespirationRedux = user_crops.pc_GrowthRespirationRedux;
    // throw pc_GrowthRespirationRedux;

    // Assuming that growth respiration takes 30% of total assimilation --> 0.7 [kg ha-1]
    // vc_NetPhotosynthesis = (vc_GrossPhotosynthesis - vc_NetMaintenanceRespiration + vc_ReserveAssimilatePool) * pc_GrowthRespirationRedux; // from HERMES algorithms

    vc_NetPhotosynthesis = vc_Assimilates; // from AGROSIM algorithms
    vc_ReserveAssimilatePool = 0.0;

    vc_AbovegroundBiomassOld = vc_AbovegroundBiomass;
    vc_AbovegroundBiomass = 0.0;
    vc_BelowgroundBiomassOld = vc_BelowgroundBiomass;
    vc_BelowgroundBiomass = 0.0;
    vc_TotalBiomass = 0.0;

    //old PESUM [kg m-2 --> kg ha-1]
    vc_TotalBiomassNContent += soilColumn.vq_CropNUptake * 10000.0;

    // Dry matter production
    // old NRKOM
    // double assimilate_partition_shoot = 0.7;
    var assimilate_partition_leaf = 0.3;

    for (var i_Organ = 0; i_Organ < pc_NumberOfOrgans; i_Organ++) {

        vc_AssimilatePartitioningCoeffOld = pc_AssimilatePartitioningCoeff[vc_DevelopmentalStage - 1][i_Organ];
        vc_AssimilatePartitioningCoeff = pc_AssimilatePartitioningCoeff[vc_DevelopmentalStage][i_Organ];

        //Identify storage organ and reduce assimilate flux in case of heat stress
        if (pc_StorageOrgan[i_Organ] == 1){
            vc_AssimilatePartitioningCoeffOld = vc_AssimilatePartitioningCoeffOld * vc_CropHeatRedux * vc_DroughtImpactOnFertility;
            vc_AssimilatePartitioningCoeff = vc_AssimilatePartitioningCoeff * vc_CropHeatRedux * vc_DroughtImpactOnFertility;
        }


        if ((vc_CurrentTemperatureSum[vc_DevelopmentalStage] / pc_StageTemperatureSum[vc_DevelopmentalStage]) > 1) {

            // Pflanze ist ausgewachsen
            vc_OrganGrowthIncrement[i_Organ] = 0.0;
            vc_OrganSenescenceIncrement[i_Organ] = 0.0;
        } else {

            // test if there is a positive bilance of produced assimilates
            // if vc_NetPhotosynthesis is negativ, the crop needs more for
            // maintenance than for building new biomass
            if (vc_NetPhotosynthesis < 0.0) {

                // reduce biomass from leaf and shoot because of negative assimilate
                //! TODO: hard coded organ ids; must be more generalized because in database organ_ids can be mixed
                vc_OrganBiomass[i_Organ];

                if (i_Organ == LEAF) { // leaf

                    var incr = assimilate_partition_leaf * vc_NetPhotosynthesis;
                    if (abs(incr) <= vc_OrganBiomass[i_Organ]){
                      logger(MSG.INFO, "LEAF - Reducing organ biomass - default case (" + (vc_OrganBiomass[i_Organ] + vc_OrganGrowthIncrement[i_Organ]) + ")");
                      vc_OrganGrowthIncrement[i_Organ] = incr;
                    } else {
                        // temporary hack because complex algorithm produces questionable results
                        logger(MSG.INFO, "LEAF - Not enough biomass for reduction - Reducing only what is available ");
                        vc_OrganGrowthIncrement[i_Organ] = (-1) * vc_OrganBiomass[i_Organ];


    //                      debug() << "LEAF - Not enough biomass for reduction; Need to calculate new partition coefficient" << endl;
    //                      // calculate new partition coefficient to detect, how much of organ biomass
    //                      // can be reduced
    //                      assimilate_partition_leaf = abs(vc_OrganBiomass[i_Organ] / vc_NetPhotosynthesis);
    //                      assimilate_partition_shoot = 1.0 - assimilate_partition_leaf;
    //                      debug() << "LEAF - New Partition: " << assimilate_partition_leaf << endl;
    //
    //                      // reduce biomass for leaf
    //                      incr = assimilate_partition_leaf * vc_NetPhotosynthesis; // should be negative, therefor the addition
    //                      vc_OrganGrowthIncrement[i_Organ] = incr;
    //                      debug() << "LEAF - Reducing organ by " << incr << " (" << vc_OrganBiomass[i_Organ] + vc_OrganGrowthIncrement[i_Organ] << ")"<< endl;
                    }

                } else if (i_Organ == SHOOT) { // shoot
                    // JV! Why not (1 - assimilate_partition_leaf)?
                    var incr = assimilate_partition_leaf * vc_NetPhotosynthesis; // should be negative

                    if (abs(incr) <= vc_OrganBiomass[i_Organ]){
                        vc_OrganGrowthIncrement[i_Organ] = incr;
                        logger(MSG.INFO, "SHOOT - Reducing organ biomass - default case (" + (vc_OrganBiomass[i_Organ] + vc_OrganGrowthIncrement[i_Organ]) + ")");
                    } else {
                        // temporary hack because complex algorithm produces questionable results
                        logger(MSG.INFO, "SHOOT - Not enough biomass for reduction - Reducing only what is available");
                        vc_OrganGrowthIncrement[i_Organ] = (-1) * vc_OrganBiomass[i_Organ];


    //                      debug() << "SHOOT - Not enough biomass for reduction; Need to calculate new partition coefficient" << endl;
    //
    //                      assimilate_partition_shoot = abs(vc_OrganBiomass[i_Organ] / vc_NetPhotosynthesis);
    //                      assimilate_partition_leaf = 1.0 - assimilate_partition_shoot;
    //                      debug() << "SHOOT - New Partition: " << assimilate_partition_shoot << endl;
    //
    //                      incr = assimilate_partition_shoot * vc_NetPhotosynthesis;
    //                      vc_OrganGrowthIncrement[i_Organ] = incr;
    //                      debug() << "SHOOT - Reducing organ (" << vc_OrganBiomass[i_Organ] + vc_OrganGrowthIncrement[i_Organ] << ")"<< endl;
    //
    //                      // test if there is the possibility to reduce biomass of leaf
    //                      // for remaining assimilates
    //                      incr = assimilate_partition_leaf * vc_NetPhotosynthesis;
    //                      double available_leaf_biomass = vc_OrganBiomass[LEAF] + vc_OrganGrowthIncrement[LEAF];
    //                      if (incr<available_leaf_biomass) {
    //                          // leaf biomass is big enough, so reduce biomass furthermore
    //                          vc_OrganGrowthIncrement[LEAF] += incr; // should be negative, therefor the addition
    //                          debug() << "LEAF - Reducing leaf biomasse further (" << vc_OrganBiomass[LEAF] + vc_OrganGrowthIncrement[LEAF] << ")"<< endl;
    //                      } else {
    //                          // worst case - there is not enough biomass available to reduce
    //                          // maintenaince respiration requires more assimilates that can be
    //                          // provided by plant itselft
    //                          // now the plant is dying - sorry
    //                          dyingOut = true;
    //                          cout << "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! " << endl;
    //                          cout << "Oh noo - I am dying - There has not been enough biomass required by " <<
    //                              "maintenance respiration etc.\n Not long now and I am death ... " << endl;
    //                          cout << "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" << endl;
    //                      }

                    }

                } else {
                    // root or storage organ - do nothing in case of negative photosynthesis
                    vc_OrganGrowthIncrement[i_Organ] = 0.0;
                }

            } else { // if (vc_NetPhotosynthesis < 0.0) {

                vc_OrganGrowthIncrement[i_Organ] = vc_NetPhotosynthesis *
                     (vc_AssimilatePartitioningCoeffOld
                     + ((vc_AssimilatePartitioningCoeff - vc_AssimilatePartitioningCoeffOld)
                     * (vc_CurrentTemperatureSum[vc_DevelopmentalStage]
                     / pc_StageTemperatureSum[vc_DevelopmentalStage]))) * vc_CropNRedux; // [kg CH2O ha-1]
    
            }
            vc_OrganSenescenceIncrement[i_Organ] = (vc_OrganBiomass[i_Organ] - vc_OrganDeadBiomass[i_Organ]) *
                 (pc_OrganSenescenceRate[vc_DevelopmentalStage - 1][i_Organ]
                 + ((pc_OrganSenescenceRate[vc_DevelopmentalStage][i_Organ]
                 - pc_OrganSenescenceRate[vc_DevelopmentalStage - 1][i_Organ])
                 * (vc_CurrentTemperatureSum[vc_DevelopmentalStage] / pc_StageTemperatureSum[vc_DevelopmentalStage]))); // [kg CH2O ha-1]

        }

        if (i_Organ != vc_StorageOrgan) {
          // Wurzel, Sprossachse, Blatt
          vc_OrganBiomass[i_Organ] += (vc_OrganGrowthIncrement[i_Organ] * vc_TimeStep)
          - (vc_OrganSenescenceIncrement[i_Organ] * vc_TimeStep); // [kg CH2O ha-1]
          vc_OrganBiomass[vc_StorageOrgan] += 0.35 * vc_OrganSenescenceIncrement[i_Organ]; // [kg CH2O ha-1]
        } else {
            if (vc_DevelopmentalStage < pc_NumberOfDevelopmentalStages) {
                // Reallocation of asimilates to storage organ in final developmental stage

                vc_OrganBiomass[i_Organ] += (vc_OrganGrowthIncrement[i_Organ] * vc_TimeStep)
                        - (vc_OrganSenescenceIncrement[i_Organ] * vc_TimeStep)
                        + 0.3 * ((vc_OrganSenescenceIncrement[i_Organ - 1] * vc_TimeStep)
                            + (vc_OrganSenescenceIncrement[i_Organ - 2] * vc_TimeStep)
                            + vc_OrganSenescenceIncrement[i_Organ  - 3] * vc_TimeStep); // [kg CH2O ha-1]
            } else {
                vc_OrganBiomass[i_Organ] += (vc_OrganGrowthIncrement[i_Organ] * vc_TimeStep)
                        - (vc_OrganSenescenceIncrement[i_Organ] * vc_TimeStep); // [kg CH2O ha-1]
            }
        }

        vc_OrganDeadBiomass[i_Organ] += vc_OrganSenescenceIncrement[i_Organ] * vc_TimeStep; // [kg CH2O ha-1]
        vc_OrganGreenBiomass[i_Organ] = vc_OrganBiomass[i_Organ] - vc_OrganDeadBiomass[i_Organ]; // [kg CH2O ha-1]

        if ((vc_OrganGreenBiomass[i_Organ]) < 0.0) {

            vc_OrganDeadBiomass[i_Organ] = vc_OrganBiomass[i_Organ];
            vc_OrganGreenBiomass[i_Organ] = 0.0;
        }

        if (pc_AbovegroundOrgan[i_Organ] == 1) {

            vc_AbovegroundBiomass += vc_OrganBiomass[i_Organ]; // [kg CH2O ha-1]

        } else if ((pc_AbovegroundOrgan[i_Organ] == 0) && (i_Organ > 0)){

            vc_BelowgroundBiomass += vc_OrganBiomass[i_Organ]; // [kg CH2O ha-1]

        }

        vc_TotalBiomass += vc_OrganBiomass[i_Organ]; // [kg CH2O ha-1]

    }

    /** @todo N redux noch ausgeschaltet */
    vc_ReserveAssimilatePool = 0.0; //+= vc_NetPhotosynthesis * (1.0 - vc_CropNRedux);
    vc_RootBiomassOld = vc_RootBiomass;
    vc_RootBiomass = vc_OrganBiomass[0];

    if (vc_DevelopmentalStage > 0) {

      vc_MaxRootNConcentration = pc_StageMaxRootNConcentration[vc_DevelopmentalStage - 1]
         - (pc_StageMaxRootNConcentration[vc_DevelopmentalStage - 1] - pc_StageMaxRootNConcentration[vc_DevelopmentalStage])
         * vc_CurrentTemperatureSum[vc_DevelopmentalStage] / pc_StageTemperatureSum[vc_DevelopmentalStage]; //[kg kg-1]
    } else {
      vc_MaxRootNConcentration = pc_StageMaxRootNConcentration[vc_DevelopmentalStage];
    }

    vc_CropNDemand = ((vc_TargetNConcentration * vc_AbovegroundBiomass)
      + (vc_RootBiomass * vc_MaxRootNConcentration)
      + (vc_TargetNConcentration * vc_BelowgroundBiomass / pc_ResidueNRatio)
      - vc_TotalBiomassNContent) * vc_TimeStep; // [kg ha-1]

    vc_NConcentrationOptimum = ((vc_TargetNConcentration
         - (vc_TargetNConcentration - vc_CriticalNConcentration) * 0.15) * vc_AbovegroundBiomass
        + (vc_TargetNConcentration
           - (vc_TargetNConcentration - vc_CriticalNConcentration) * 0.15) * vc_BelowgroundBiomass / pc_ResidueNRatio
        + (vc_RootBiomass * vc_MaxRootNConcentration) - vc_TotalBiomassNContent) * vc_TimeStep; // [kg ha-1]


    if (vc_CropNDemand > (pc_MaxCropNDemand * vc_TimeStep)) {
      // Not more than 6kg N per day to be taken up.
      vc_CropNDemand = pc_MaxCropNDemand * vc_TimeStep;
    }

    if (vc_CropNDemand < 0) {
      vc_CropNDemand = 0.0;
    }

    if (vc_RootBiomass < vc_RootBiomassOld) {
      /** @todo: Claas: Macht die Bedingung hier Sinn? Hat sich die Wurzel wirklich zurückgebildet? */
      vc_RootNIncrement = (vc_RootBiomassOld - vc_RootBiomass) * vc_NConcentrationRoot;
    } else {
      vc_RootNIncrement = 0;
    }

    // In case of drought stress the root will grow deeper
    if ((vc_TranspirationDeficit < (0.95 * pc_DroughtStressThreshold[vc_DevelopmentalStage])) &&
        (vc_RootingDepth_m > 0.95 * vc_MaxRootingDepth) &&
        (vc_DevelopmentalStage < (pc_NumberOfDevelopmentalStages - 1))){
      vc_MaxRootingDepth += 0.005;
    }

    if (vc_MaxRootingDepth > (vs_NumberOfLayers * vs_LayerThickness)) {
      vc_MaxRootingDepth = vs_NumberOfLayers * vs_LayerThickness;
    }

    // ***************************************************************************
    // *** Taken from Pedersen et al. 2010: Modelling diverse root density     ***
    // *** dynamics and deep nitrogen uptake - a simple approach.              ***
    // *** Plant & Soil 326, 493 - 510                                         ***
    // ***************************************************************************

    // Determining temperature sum for root growth
    var pc_MaximumTemperatureRootGrowth = pc_MinimumTemperatureRootGrowth + 20.0;
    var vc_DailyTemperatureRoot = 0.0;
    if (vw_MeanAirTemperature >= pc_MaximumTemperatureRootGrowth){
      vc_DailyTemperatureRoot = pc_MaximumTemperatureRootGrowth - pc_MinimumTemperatureRootGrowth;
    } else {
      vc_DailyTemperatureRoot= vw_MeanAirTemperature - pc_MinimumTemperatureRootGrowth;
    }
    if (vc_DailyTemperatureRoot < 0.0){
      vc_DailyTemperatureRoot = 0.0;
    }
    vc_CurrentTotalTemperatureSumRoot += vc_DailyTemperatureRoot ;

    // Determining root penetration rate according to soil clay content [m °C-1 d-1]
    var vc_RootPenetrationRate = 0.0; // [m °C-1 d-1]
    if (soilColumn[vc_RootingDepth].vs_SoilClayContent <= 0.02 ){
      vc_RootPenetrationRate = 0.5 * pc_RootPenetrationRate;
    } else if (soilColumn[vc_RootingDepth].vs_SoilClayContent <= 0.08 ){
      vc_RootPenetrationRate = ((1.0 / 3.0) + (0.5 / 0.06 * soilColumn[vc_RootingDepth].vs_SoilClayContent))
               * pc_RootPenetrationRate; // [m °C-1 d-1]
    } else {
      vc_RootPenetrationRate = pc_RootPenetrationRate; // [m °C-1 d-1]
    }

    // Calculating rooting depth [m]
    if (vc_CurrentTotalTemperatureSumRoot <= pc_RootGrowthLag) {
      vc_RootingDepth_m = pc_InitialRootingDepth; // [m]
    } else {
      // corrected because oscillating rooting depth at layer boundaries with texture change
     /* vc_RootingDepth_m = pc_InitialRootingDepth
          + ((vc_CurrentTotalTemperatureSumRoot - pc_RootGrowthLag)
          * vc_RootPenetrationRate); // [m] */
          
      vc_RootingDepth_m += (vc_DailyTemperatureRoot * vc_RootPenetrationRate); // [m]

    }

    if (vc_RootingDepth_m <= pc_InitialRootingDepth){
      vc_RootingDepth_m = pc_InitialRootingDepth;
    }

    if (vc_RootingDepth_m > vc_MaxRootingDepth) {
      vc_RootingDepth_m = vc_MaxRootingDepth; // [m]
    }

    if (vc_RootingDepth_m > vs_MaxEffectiveRootingDepth) {
        vc_RootingDepth_m = vs_MaxEffectiveRootingDepth;
    }

    // Calculating rooting depth layer []
    vc_RootingDepth = int(floor(0.5 + (vc_RootingDepth_m / vs_LayerThickness))); // []

    if (vc_RootingDepth > vs_NumberOfLayers) {
      vc_RootingDepth = vs_NumberOfLayers;
    }

    vc_RootingZone = int(floor(0.5 + ((1.3 * vc_RootingDepth_m) / vs_LayerThickness))); // []

    if (vc_RootingZone > vs_NumberOfLayers){
      vc_RootingZone = vs_NumberOfLayers;
    }

    vc_TotalRootLength = vc_RootBiomass * pc_SpecificRootLength; //[m m-2]

    // Calculating a root density distribution factor []
    var vc_RootDensityFactor = new Array(vs_NumberOfLayers);
    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      if (i_Layer < vc_RootingDepth){
        vc_RootDensityFactor[i_Layer] = exp(-pc_RootFormFactor * (i_Layer * vs_LayerThickness)); // []
      } else if (i_Layer < vc_RootingZone){
        vc_RootDensityFactor[i_Layer] = exp(-pc_RootFormFactor * (i_Layer * vs_LayerThickness))
          * (1.0 - int((i_Layer - vc_RootingDepth) / (vc_RootingZone - vc_RootingDepth))); // JS! int division
      } else {
        vc_RootDensityFactor[i_Layer] = 0.0; // []
      }
    }

    // Summing up all factors to scale to a relative factor between [0;1]
    var vc_RootDensityFactorSum = 0.0;
    for (var i_Layer = 0; i_Layer < vc_RootingZone; i_Layer++) {
      vc_RootDensityFactorSum += vc_RootDensityFactor[i_Layer]; // []
    }

    // Calculating root density per layer from total root length and
    // a relative root density distribution factor
    for (var i_Layer = 0; i_Layer < vc_RootingZone; i_Layer++) {
      vc_RootDensity[i_Layer] = (vc_RootDensityFactor[i_Layer] / vc_RootDensityFactorSum)
        * vc_TotalRootLength; // [m m-3]
    }

    for (var i_Layer = 0; i_Layer < vc_RootingZone; i_Layer++) {
      // Root diameter [m]
      if (pc_AbovegroundOrgan[3] == 0) {
        vc_RootDiameter[i_Layer] = 0.0001; //[m]
      } else {
        vc_RootDiameter[i_Layer] = 0.0002 - ((i_Layer + 1) * 0.00001); // [m]
      }

      // Default root decay - 10 %
      vo_FreshSoilOrganicMatter[i_Layer] += vc_RootNIncrement * vc_RootDensity[i_Layer]
            * 10.0 / vc_TotalRootLength;

    }

    // Limiting the maximum N-uptake to 26-13*10^-14 mol/cm W./sec
    vc_MaxNUptake = pc_MaxNUptakeParam - (vc_CurrentTotalTemperatureSum / vc_TotalTemperatureSum); // [kg m Wurzel-1]

    if ((vc_CropNDemand / 10000.0) > (vc_TotalRootLength * vc_MaxNUptake * vc_TimeStep)) {
      vc_CropNDemand = vc_TotalRootLength * vc_MaxNUptake * vc_TimeStep; //[kg m-2]
    } else {
      vc_CropNDemand = vc_CropNDemand / 10000.0; // [kg ha-1 --> kg m-2]
    }
  };

  // double 
  var fc_ReferenceEvapotranspiration = function (
    vs_HeightNN,
    vw_MaxAirTemperature,
    vw_MinAirTemperature,
    vw_RelativeHumidity,
    vw_MeanAirTemperature,
    vw_WindSpeed,
    vw_WindSpeedHeight,
    vc_GlobalRadiation,
    vw_AtmosphericCO2Concentration,
    vc_GrossPhotosynthesisReference_mol
  ) {

    var vc_AtmosphericPressure; //[kPA]
    var vc_PsycrometerConstant; //[kPA °C-1]
    var vc_SaturatedVapourPressureMax; //[kPA]
    var vc_SaturatedVapourPressureMin; //[kPA]
    var vc_SaturatedVapourPressure; //[kPA]
    var vc_VapourPressure; //[kPA]
    var vc_SaturationDeficit; //[kPA]
    var vc_SaturatedVapourPressureSlope; //[kPA °C-1]
    var vc_WindSpeed_2m; //[m s-1]
    var vc_AerodynamicResistance; //[s m-1]
    var vc_SurfaceResistance; //[s m-1]
    var vc_ReferenceEvapotranspiration; //[mm]
    var vw_NetRadiation; //[MJ m-2]

    var user_crops = centralParameterProvider.userCropParameters;
    var pc_SaturationBeta = user_crops.pc_SaturationBeta; // Original: Yu et al. 2001; beta = 3.5
    var pc_StomataConductanceAlpha = user_crops.pc_StomataConductanceAlpha; // Original: Yu et al. 2001; alpha = 0.06
    var pc_ReferenceAlbedo = user_crops.pc_ReferenceAlbedo; // FAO Green gras reference albedo from Allen et al. (1998)

    // Calculation of atmospheric pressure
    vc_AtmosphericPressure = 101.3 * pow(((293.0 - (0.0065 * vs_HeightNN)) / 293.0), 5.26);

    // Calculation of psychrometer constant - Luchtfeuchtigkeit
    vc_PsycrometerConstant = 0.000665 * vc_AtmosphericPressure;

    // Calc. of saturated water vapour pressure at daily max temperature
    vc_SaturatedVapourPressureMax = 0.6108 * exp((17.27 * vw_MaxAirTemperature) / (237.3 + vw_MaxAirTemperature));

    // Calc. of saturated water vapour pressure at daily min temperature
    vc_SaturatedVapourPressureMin = 0.6108 * exp((17.27 * vw_MinAirTemperature) / (237.3 + vw_MinAirTemperature));

    // Calculation of the saturated water vapour pressure
    vc_SaturatedVapourPressure = (vc_SaturatedVapourPressureMax + vc_SaturatedVapourPressureMin) / 2.0;

    // Calculation of the water vapour pressure
    if (vw_RelativeHumidity <= 0.0){
      // Assuming Tdew = Tmin as suggested in FAO56 Allen et al. 1998
      vc_VapourPressure = vc_SaturatedVapourPressureMin;
    } else {
      vc_VapourPressure = vw_RelativeHumidity * vc_SaturatedVapourPressure;
    }

    // Calculation of the air saturation deficit
    vc_SaturationDeficit = vc_SaturatedVapourPressure - vc_VapourPressure;

    // Slope of saturation water vapour pressure-to-temperature relation
    vc_SaturatedVapourPressureSlope = (4098.0 * (0.6108 * exp((17.27 * vw_MeanAirTemperature) / (vw_MeanAirTemperature
        + 237.3)))) / ((vw_MeanAirTemperature + 237.3) * (vw_MeanAirTemperature + 237.3));

    // Calculation of wind speed in 2m height
    vc_WindSpeed_2m = vw_WindSpeed * (4.87 / (log(67.8 * vw_WindSpeedHeight - 5.42)));

    // Calculation of the aerodynamic resistance
    vc_AerodynamicResistance = 208.0 / vc_WindSpeed_2m;

    if (vc_GrossPhotosynthesisReference_mol <= 0.0) {
      vc_StomataResistance = 999999.9; // [s m-1]
    } else {
      vc_StomataResistance = // [s m-1]
          (vw_AtmosphericCO2Concentration * (1.0 + vc_SaturationDeficit / pc_SaturationBeta))
              / (pc_StomataConductanceAlpha * vc_GrossPhotosynthesisReference_mol);
    }

    vc_SurfaceResistance = vc_StomataResistance / 1.44;

    // vc_SurfaceResistance = vc_StomataResistance / (vc_CropHeight * vc_LeafAreaIndex);

    // vw_NetRadiation = vc_GlobalRadiation * (1.0 - pc_ReferenceAlbedo); // [MJ m-2]

    var vc_ClearSkyShortwaveRadiation = (0.75 + 0.00002 * vs_HeightNN) * vc_ExtraterrestrialRadiation;
    var vc_RelativeShortwaveRadiation = vc_GlobalRadiation / vc_ClearSkyShortwaveRadiation;
    var vc_NetShortwaveRadiation = (1.0 - pc_ReferenceAlbedo) * vc_GlobalRadiation;

    var pc_BolzmanConstant = 0.0000000049; // Bolzmann constant 4.903 * 10-9 MJ m-2 K-4 d-1
    vw_NetRadiation = vc_NetShortwaveRadiation - (pc_BolzmanConstant
      * (pow((vw_MinAirTemperature + 273.16), 4.0) + pow((vw_MaxAirTemperature
      + 273.16), 4.0)) / 2.0 * (1.35 * vc_RelativeShortwaveRadiation - 0.35)
      * (0.34 - 0.14 * sqrt(vc_VapourPressure)));

    // Calculation of reference evapotranspiration
    // Penman-Monteith-Method FAO
    vc_ReferenceEvapotranspiration = ((0.408 * vc_SaturatedVapourPressureSlope * vw_NetRadiation)
        + (vc_PsycrometerConstant * (900.0 / (vw_MeanAirTemperature + 273.0)) * vc_WindSpeed_2m * vc_SaturationDeficit))
        / (vc_SaturatedVapourPressureSlope + vc_PsycrometerConstant * (1.0 + (vc_SurfaceResistance / vc_AerodynamicResistance)));

    return vc_ReferenceEvapotranspiration;

  };

  var fc_CropWaterUptake = function (
    vs_NumberOfLayers,
    vs_LayerThickness,
    vc_SoilCoverage,
    vc_RootingZone,
    vc_GroundwaterTable,
    vc_ReferenceEvapotranspiration,
    vw_GrossPrecipitation,
    vc_CurrentTotalTemperatureSum ,
    vc_TotalTemperatureSum
  ) {

    // JS! make sure it is an "int"
    vc_RootingZone = int(vc_RootingZone);
    vc_GroundwaterTable = int(vc_GroundwaterTable);


    var vc_PotentialTranspirationDeficit = 0.0; // [mm]
    vc_PotentialTranspiration = 0.0; // old TRAMAX [mm]
    var vc_PotentialEvapotranspiration = 0.0; // [mm]
    var vc_TranspirationReduced = 0.0; // old TDRED [mm]
    vc_ActualTranspiration = 0.0; // [mm]
    var vc_RemainingTotalRootEffectivity = 0.0; //old WEFFREST [m]
    var vc_CropWaterUptakeFromGroundwater  = 0.0; // old GAUF [mm]
    var vc_TotalRootEffectivity = 0.0; // old WEFF [m]
    var vc_ActualTranspirationDeficit = 0.0; // old TREST [mm]
    var vc_Interception = 0.0;
    vc_RemainingEvapotranspiration = 0.0;

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      vc_Transpiration[i_Layer] = 0.0; // old TP [mm]
      vc_TranspirationRedux[i_Layer] = 0.0; // old TRRED []
      vc_RootEffectivity[i_Layer] = 0.0; // old WUEFF [?]
    }

    // ################
    // # Interception #
    // ################

    var vc_InterceptionStorageOld = vc_InterceptionStorage;

    // Interception in [mm d-1];
    vc_Interception = (2.5 * vc_CropHeight * vc_SoilCoverage) - vc_InterceptionStorage;

    if (vc_Interception < 0) {
      vc_Interception = 0.0;
    }

    // If no precipitation occurs, vm_Interception = 0
    if (vw_GrossPrecipitation <= 0) {
      vc_Interception = 0.0;
    }

    // Calculating net precipitation and adding to surface water
    if (vw_GrossPrecipitation <= vc_Interception) {
      vc_Interception = vw_GrossPrecipitation;
      vc_NetPrecipitation = 0.0;
    } else {
      vc_NetPrecipitation = vw_GrossPrecipitation - vc_Interception;
    }

    // add intercepted precipitation to the virtual interception water storage
    vc_InterceptionStorage = vc_InterceptionStorageOld + vc_Interception;


    // #################
    // # Transpiration #
    // #################

    vc_PotentialEvapotranspiration = vc_ReferenceEvapotranspiration * vc_KcFactor; // [mm]

    // from HERMES:
    if (vc_PotentialEvapotranspiration > 6.5) vc_PotentialEvapotranspiration = 6.5;

    vc_RemainingEvapotranspiration = vc_PotentialEvapotranspiration; // [mm]

    // If crop holds intercepted water, first evaporation from crop surface
    if (vc_InterceptionStorage > 0.0) {
      if (vc_RemainingEvapotranspiration >= vc_InterceptionStorage) {
        vc_RemainingEvapotranspiration -= vc_InterceptionStorage;
        vc_EvaporatedFromIntercept = vc_InterceptionStorage;
        vc_InterceptionStorage = 0.0;
      } else {
        vc_InterceptionStorage -= vc_RemainingEvapotranspiration;
        vc_EvaporatedFromIntercept = vc_RemainingEvapotranspiration;
        vc_RemainingEvapotranspiration = 0.0;
      }
    } else {
      vc_EvaporatedFromIntercept = 0.0;
    }

    // if the plant has matured, no transpiration occurs!
    if (vc_DevelopmentalStage < vc_FinalDevelopmentalStage){
    //if ((vc_CurrentTotalTemperatureSum / vc_TotalTemperatureSum) < 1.0){

      vc_PotentialTranspiration = vc_RemainingEvapotranspiration * vc_SoilCoverage; // [mm]

      for (var i_Layer = 0; i_Layer < vc_RootingZone; i_Layer++) {
        
        var vc_AvailableWater = soilColumn[i_Layer].get_FieldCapacity() - soilColumn[i_Layer].get_PermanentWiltingPoint();
        var vc_AvailableWaterPercentage = (soilColumn[i_Layer].get_Vs_SoilMoisture_m3() 
          - soilColumn[i_Layer].get_PermanentWiltingPoint()) / vc_AvailableWater;
        
        if (vc_AvailableWaterPercentage < 0.0) vc_AvailableWaterPercentage = 0.0;

        if (vc_AvailableWaterPercentage < 0.15) {
          vc_TranspirationRedux[i_Layer] = vc_AvailableWaterPercentage * 3.0; // []
          vc_RootEffectivity[i_Layer] = 0.15 + 0.45 * vc_AvailableWaterPercentage / 0.15; // []
        } else if (vc_AvailableWaterPercentage < 0.3) {
          vc_TranspirationRedux[i_Layer] = 0.45 + (0.25 * (vc_AvailableWaterPercentage - 0.15) / 0.15);
          vc_RootEffectivity[i_Layer] = 0.6 + (0.2 * (vc_AvailableWaterPercentage - 0.15) / 0.15);
        } else if (vc_AvailableWaterPercentage < 0.5) {
          vc_TranspirationRedux[i_Layer] = 0.7 + (0.275 * (vc_AvailableWaterPercentage - 0.3) / 0.2);
          vc_RootEffectivity[i_Layer] = 0.8 + (0.2 * (vc_AvailableWaterPercentage - 0.3) / 0.2);
        } else if (vc_AvailableWaterPercentage < 0.75) {
          vc_TranspirationRedux[i_Layer] = 0.975 + (0.025 * (vc_AvailableWaterPercentage - 0.5) / 0.25);
          vc_RootEffectivity[i_Layer] = 1.0;
        } else {
          vc_TranspirationRedux[i_Layer] = 1.0;
          vc_RootEffectivity[i_Layer] = 1.0;
        }

        if (vc_TranspirationRedux[i_Layer] < 0)
          vc_TranspirationRedux[i_Layer] = 0.0;
        
        if (vc_RootEffectivity[i_Layer] < 0)
          vc_RootEffectivity[i_Layer] = 0.0;
        
        if (i_Layer == vc_GroundwaterTable) { // old GRW
          vc_RootEffectivity[i_Layer] = 0.5;
        }
        
        if (i_Layer > vc_GroundwaterTable) { // old GRW
          vc_RootEffectivity[i_Layer] = 0.0;
        }

        if (((i_Layer + 1) * vs_LayerThickness) >= vs_MaxEffectiveRootingDepth) {
          vc_RootEffectivity[i_Layer] = 0.0;
        }      
        
        vc_TotalRootEffectivity += vc_RootEffectivity[i_Layer] * vc_RootDensity[i_Layer]; //[m m-3]
        vc_RemainingTotalRootEffectivity = vc_TotalRootEffectivity;
      }

      for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
        
        if (i_Layer > min(vc_RootingZone, vc_GroundwaterTable + 1)) {
          vc_Transpiration[i_Layer] = 0.0; //[mm]
        } else {
          vc_Transpiration[i_Layer] = vc_PotentialTranspiration * ((vc_RootEffectivity[i_Layer] * vc_RootDensity[i_Layer])
                   / vc_TotalRootEffectivity) * vc_OxygenDeficit;

          // [mm]
        }

      }

      for (var i_Layer = 0; i_Layer < min(vc_RootingZone, vc_GroundwaterTable + 1); i_Layer++) {

        vc_RemainingTotalRootEffectivity -= vc_RootEffectivity[i_Layer] * vc_RootDensity[i_Layer]; // [m m-3]

        if (vc_RemainingTotalRootEffectivity <= 0.0)
          vc_RemainingTotalRootEffectivity = 0.00001;
        if (((vc_Transpiration[i_Layer] / 1000.0) / vs_LayerThickness) > ((soilColumn[i_Layer].get_Vs_SoilMoisture_m3()
            - soilColumn[i_Layer].get_PermanentWiltingPoint()))) {
            vc_PotentialTranspirationDeficit = (((vc_Transpiration[i_Layer] / 1000.0) / vs_LayerThickness)
                - (soilColumn[i_Layer].get_Vs_SoilMoisture_m3() - soilColumn[i_Layer].get_PermanentWiltingPoint()))
                * vs_LayerThickness * 1000.0; // [mm]
            if (vc_PotentialTranspirationDeficit < 0.0) {
                vc_PotentialTranspirationDeficit = 0.0;
            }
            if (vc_PotentialTranspirationDeficit > vc_Transpiration[i_Layer]) {
                vc_PotentialTranspirationDeficit = vc_Transpiration[i_Layer]; //[mm]
            }
        } else {
            vc_PotentialTranspirationDeficit = 0.0;
        }

       vc_TranspirationReduced = vc_Transpiration[i_Layer] * (1.0 - vc_TranspirationRedux[i_Layer]);

        //! @todo Claas: How can we lower the groundwater table if crop water uptake is restricted in that layer?
        vc_ActualTranspirationDeficit = max(vc_TranspirationReduced, vc_PotentialTranspirationDeficit); //[mm]
        if (vc_ActualTranspirationDeficit > 0.0) {
          if (i_Layer < min(vc_RootingZone, vc_GroundwaterTable + 1)) {
            for (var i_Layer2 = i_Layer + 1; i_Layer2 < min(vc_RootingZone, vc_GroundwaterTable + 1); i_Layer2++) {
                vc_Transpiration[i_Layer2] += vc_ActualTranspirationDeficit * (vc_RootEffectivity[i_Layer2]
                   * vc_RootDensity[i_Layer2] / vc_RemainingTotalRootEffectivity);
            }
          }
        }

        vc_Transpiration[i_Layer] = vc_Transpiration[i_Layer] - vc_ActualTranspirationDeficit;
        
        if (vc_Transpiration[i_Layer] < 0.0)
          vc_Transpiration[i_Layer] = 0.0;
        
        vc_ActualTranspiration += vc_Transpiration[i_Layer];
        
        if (i_Layer == vc_GroundwaterTable) {
          vc_CropWaterUptakeFromGroundwater = (vc_Transpiration[i_Layer] / 1000.0) / vs_LayerThickness; //[m3 m-3]
        }

      }      

      if (vc_PotentialTranspiration > 0) {
        vc_TranspirationDeficit = vc_ActualTranspiration / vc_PotentialTranspiration;
      } else {
        vc_TranspirationDeficit = 1.0; //[]
      }

      var vm_GroundwaterDistance = int(vc_GroundwaterTable - vc_RootingDepth); // JS! just in case ... added int()
      if (vm_GroundwaterDistance <= 1) {
        vc_TranspirationDeficit = 1.0;
      }

      if (pc_WaterDeficitResponseOn == false){
        vc_TranspirationDeficit = 1.0;
      }

    } //if
  };

  var fc_CropNUptake = function (
    vs_NumberOfLayers,
    vs_LayerThickness,
    vc_RootingZone,
    vc_GroundwaterTable,
    vc_CurrentTotalTemperatureSum ,
    vc_TotalTemperatureSum
  ) {

    // JS! make sure it is an "int"
    vc_RootingZone = int(vc_RootingZone);
    vc_GroundwaterTable = int(vc_GroundwaterTable);


    var vc_ConvectiveNUptake = 0.0; // old TRNSUM
    var vc_DiffusiveNUptake = 0.0; // old SUMDIFF
    var vc_ConvectiveNUptakeFromLayer = []; // old MASS
    var vc_DiffusionCoeff = []; // old D
    var vc_DiffusiveNUptakeFromLayer = []; // old DIFF

    for (var i = 0; i < vs_NumberOfLayers; i++) {
      vc_ConvectiveNUptakeFromLayer[i] = 0.0;
      vc_DiffusionCoeff[i] = 0.0;
      vc_DiffusiveNUptakeFromLayer[i] = 0.0;
    }

    var vc_ConvectiveNUptake_1 = 0.0; // old MASSUM
    var vc_DiffusiveNUptake_1 = 0.0; // old DIFFSUM
    var user_crops = centralParameterProvider.userCropParameters;
    var pc_MinimumAvailableN = user_crops.pc_MinimumAvailableN; // kg m-3
    var pc_MinimumNConcentrationRoot = user_crops.pc_MinimumNConcentrationRoot;  // kg kg-1
    var pc_MaxCropNDemand = user_crops.pc_MaxCropNDemand;

    vc_TotalNUptake = 0.0;
    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++){
      vc_NUptakeFromLayer[i_Layer] = 0.0;
    }

    // if the plant has matured, no N uptake occurs!
    if (vc_DevelopmentalStage < vc_FinalDevelopmentalStage){
    //if ((vc_CurrentTotalTemperatureSum / vc_TotalTemperatureSum) < 1.0){

      for (var i_Layer = 0; i_Layer < (min(vc_RootingZone, vc_GroundwaterTable)); i_Layer++) {

        vs_SoilMineralNContent[i_Layer] = soilColumn[i_Layer].vs_SoilNO3; // [kg m-3]

        // Convective N uptake per layer
        vc_ConvectiveNUptakeFromLayer[i_Layer] = (vc_Transpiration[i_Layer] / 1000.0) * //[mm --> m]
                 (vs_SoilMineralNContent[i_Layer] / // [kg m-3]
                  (soilColumn[i_Layer].get_Vs_SoilMoisture_m3())) * // old WG [m3 m-3]
                 vc_TimeStep; // -->[kg m-2]

        vc_ConvectiveNUptake += vc_ConvectiveNUptakeFromLayer[i_Layer]; // [kg m-2]

        /** @todo Claas: Woher kommt der Wert für vs_Tortuosity? */
        /** @todo Claas: Prüfen ob Umstellung auf [m] die folgenden Gleichungen beeinflusst */
        vc_DiffusionCoeff[i_Layer] = 0.000214 * (vs_Tortuosity * exp(soilColumn[i_Layer].get_Vs_SoilMoisture_m3() * 10))
             / soilColumn[i_Layer].get_Vs_SoilMoisture_m3(); //[m2 d-1]


        vc_DiffusiveNUptakeFromLayer[i_Layer] = (vc_DiffusionCoeff[i_Layer] * // [m2 d-1]
                 soilColumn[i_Layer].get_Vs_SoilMoisture_m3() * // [m3 m-3]
                 2.0 * PI * vc_RootDiameter[i_Layer] * // [m]
                 (vs_SoilMineralNContent[i_Layer] / 1000.0 / // [kg m-3]
                  soilColumn[i_Layer].get_Vs_SoilMoisture_m3() - 0.000014) * // [m3 m-3]
                 sqrt(PI * vc_RootDensity[i_Layer])) * // [m m-3]
                       vc_RootDensity[i_Layer] * 1000.0 * vc_TimeStep; // -->[kg m-2]
             
      if(vc_DiffusiveNUptakeFromLayer[i_Layer] < 0.0){
        vc_DiffusiveNUptakeFromLayer[i_Layer] = 0;
      }

        vc_DiffusiveNUptake += vc_DiffusiveNUptakeFromLayer[i_Layer]; // [kg m-2]

      }

      for (var i_Layer = 0; i_Layer < (min(vc_RootingZone, vc_GroundwaterTable)); i_Layer++) {

        if (vc_CropNDemand > 0.0) {

          if (vc_ConvectiveNUptake >= vc_CropNDemand) { // convective N uptake is sufficient
            vc_NUptakeFromLayer[i_Layer] = vc_CropNDemand * vc_ConvectiveNUptakeFromLayer[i_Layer] / vc_ConvectiveNUptake;
          
          } else { // N demand is not covered
            
            if ((vc_CropNDemand - vc_ConvectiveNUptake) < vc_DiffusiveNUptake) {
              vc_NUptakeFromLayer[i_Layer] = (
                vc_ConvectiveNUptakeFromLayer[i_Layer] + 
                (
                  (vc_CropNDemand - vc_ConvectiveNUptake) * 
                  vc_DiffusiveNUptakeFromLayer[i_Layer] / 
                  vc_DiffusiveNUptake
                )
              );
            } else {
              vc_NUptakeFromLayer[i_Layer] = vc_ConvectiveNUptakeFromLayer[i_Layer] + vc_DiffusiveNUptakeFromLayer[i_Layer];
            }

          }

          vc_ConvectiveNUptake_1 += vc_ConvectiveNUptakeFromLayer[i_Layer];
          vc_DiffusiveNUptake_1 += vc_DiffusiveNUptakeFromLayer[i_Layer];

          if (vc_NUptakeFromLayer[i_Layer] > ((vs_SoilMineralNContent[i_Layer] * vs_LayerThickness) - pc_MinimumAvailableN))
            vc_NUptakeFromLayer[i_Layer] = (vs_SoilMineralNContent[i_Layer] * vs_LayerThickness )- pc_MinimumAvailableN;

          if (vc_NUptakeFromLayer[i_Layer] > (pc_MaxCropNDemand / 10000.0 * 0.75))
            vc_NUptakeFromLayer[i_Layer] = (pc_MaxCropNDemand / 10000.0 * 0.75);

          if (vc_NUptakeFromLayer[i_Layer] < 0.0)
            vc_NUptakeFromLayer[i_Layer] = 0.0;

        } else {
          vc_NUptakeFromLayer[i_Layer] = 0.0;
        }

        vc_TotalNUptake += vc_NUptakeFromLayer[i_Layer] * 10000.0; //[kg m-2] --> [kg ha-1]

      } // for
    } // if

    vc_SumTotalNUptake += vc_TotalNUptake;

    if (vc_RootBiomass > vc_RootBiomassOld) {

      // wurzel ist gewachsen
      vc_NConcentrationRoot = ((vc_RootBiomassOld * vc_NConcentrationRoot)
          + ((vc_RootBiomass - vc_RootBiomassOld) / (vc_AbovegroundBiomass
          - vc_AbovegroundBiomassOld + vc_BelowgroundBiomass - vc_BelowgroundBiomassOld
          + vc_RootBiomass - vc_RootBiomassOld) * vc_TotalNUptake)) / vc_RootBiomass;

      vc_NConcentrationRoot = min(vc_NConcentrationRoot, pc_StageMaxRootNConcentration[vc_DevelopmentalStage]);


      if (vc_NConcentrationRoot < pc_MinimumNConcentrationRoot) {
        vc_NConcentrationRoot = pc_MinimumNConcentrationRoot;
      }
    }

    vc_NConcentrationAbovegroundBiomass = (vc_TotalBiomassNContent + vc_TotalNUptake
           - (vc_RootBiomass * vc_NConcentrationRoot))
           / (vc_AbovegroundBiomass + (vc_BelowgroundBiomass / pc_ResidueNRatio));

    if ((vc_NConcentrationAbovegroundBiomass * vc_AbovegroundBiomass) < (vc_AbovegroundBiomassOld
                 * vc_NConcentrationAbovegroundBiomassOld)) {

      vc_NConcentrationAbovegroundBiomass = vc_AbovegroundBiomassOld * vc_NConcentrationAbovegroundBiomassOld
            / vc_AbovegroundBiomass;

      vc_NConcentrationRoot = (vc_TotalBiomassNContent + vc_TotalNUptake
               - (vc_AbovegroundBiomass * vc_NConcentrationAbovegroundBiomass)
               - (vc_NConcentrationAbovegroundBiomass / pc_ResidueNRatio * vc_BelowgroundBiomass)) / vc_RootBiomass;
    }
  };

  var fc_GrossPrimaryProduction = function (vc_Assimilates) {

    var vc_GPP = 0.0;
    // Converting photosynthesis rate from [kg CH2O ha-1 d-1] back to
    // [kg C ha-1 d-1]
    vc_GPP = vc_Assimilates / 30.0 * 12.0;
    return vc_GPP;
    
  };

  var fc_NetPrimaryProduction = function (vc_GrossPrimaryProduction, vc_TotalRespired) {
  
    var vc_NPP = 0.0;
    // Convert [kg CH2O ha-1 d-1] to [kg C ha-1 d-1]
    vc_Respiration = vc_TotalRespired / 30.0 * 12.0;

    vc_NPP = vc_GrossPrimaryProduction - vc_Respiration;
    return vc_NPP;
  
  };

  var pc_NumberOfAbovegroundOrgans = function () {
  
    var count = 0;
    for (var i = 0, size = pc_AbovegroundOrgan.length; i < size; i++) {
      if (pc_AbovegroundOrgan[i]) {
        count++;
      }
    }
    return count;

  };

  var get_OrganGrowthIncrement = function (i_Organ) {
    return vc_OrganGrowthIncrement[i_Organ];
  };

  var get_Transpiration = function (i_Layer) {
    return vc_Transpiration[i_Layer];
  };

  var get_OrganBiomass = function (i_Organ) {
    return vc_OrganBiomass[i_Organ];
  };

  var get_NUptakeFromLayer = function (i_Layer) {
    return vc_NUptakeFromLayer[i_Layer];
  };

  var get_AbovegroundBiomassNContent = function () {
    return vc_AbovegroundBiomass * vc_NConcentrationAbovegroundBiomass;
  };

  var _cropYield = function (v, bmv) {

    var yield = 0;
    for (var i = 0, is = v.length; i < is; i++)
      yield += bmv[v[i].organId - 1] * (v[i].yieldPercentage);
    return yield;
  };

  var _cropFreshMatterYield = function (v, bmv) {
    
    var freshMatterYield = 0;
    for (var i = 0, is = v.length; i < is; i++)
      freshMatterYield += bmv[v[i].organId - 1] * (v[i].yieldPercentage) / (v[i].yieldDryMatter);
    return freshMatterYield;
  };

  var get_PrimaryCropYield = function () {
    // JS: yield auch nach cutting
    if (cropParams.organIdsForPrimaryYield.length === 0)
      return _cropYield(cropParams.organIdsForCutting, vc_OrganBiomass);

    return _cropYield(cropParams.organIdsForPrimaryYield, vc_OrganBiomass);
  };

  var get_SecondaryCropYield = function () {
    return _cropYield(cropParams.organIdsForSecondaryYield, vc_OrganBiomass);
  };

  var get_FreshPrimaryCropYield = function () {
    // JS: yield auch nach cutting
    if (cropParams.organIdsForPrimaryYield.length === 0)
      return _cropFreshMatterYield(cropParams.organIdsForCutting, vc_OrganBiomass);

    return _cropFreshMatterYield(cropParams.organIdsForPrimaryYield, vc_OrganBiomass);
  };

  var get_FreshSecondaryCropYield = function () {
    return _cropFreshMatterYield(cropParams.organIdsForSecondaryYield, vc_OrganBiomass);
  };

  var get_ResidueBiomass = function (useSecondaryCropYields) {
    return vc_TotalBiomass - get_OrganBiomass(0) - get_PrimaryCropYield()
      - (useSecondaryCropYields ? get_SecondaryCropYield() : 0);
  };

  var get_ResiduesNConcentration = function () {
    return (vc_TotalBiomassNContent -
         (get_OrganBiomass(0) * get_RootNConcentration())) /
         ((get_PrimaryCropYield() / pc_ResidueNRatio) +
         (vc_TotalBiomass - get_OrganBiomass(0) - get_PrimaryCropYield()));
  }

  var get_PrimaryYieldNConcentration = function () {
    return (vc_TotalBiomassNContent -
         (get_OrganBiomass(0) * get_RootNConcentration())) /
         (get_PrimaryCropYield() + (pc_ResidueNRatio *
         (vc_TotalBiomass - get_OrganBiomass(0) - get_PrimaryCropYield())));
  }

  var get_ResiduesNContent = function (useSecondaryCropYields)  {
    return (get_ResidueBiomass(useSecondaryCropYields) * get_ResiduesNConcentration());
  };

  var get_PrimaryYieldNContent = function () {
    return (get_PrimaryCropYield() * get_PrimaryYieldNConcentration());
  };

  var get_RawProteinConcentration = function () {
    // Assuming an average N concentration of raw protein of 16%
    return (get_PrimaryYieldNConcentration() * 6.25);
  };

  var get_SecondaryYieldNContent = function () {
    return (get_SecondaryCropYield() * get_ResiduesNConcentration());
  };

  var get_PotNUptake = function () {
    return vc_CropNDemand * 10000.0;
  };

  var get_AutotrophicRespiration = function () {
    return vc_TotalRespired / 30.0 * 12.0;;  // Convert [kg CH2O ha-1 d-1] to [kg C ha-1 d-1]
  };

  var get_OrganSpecificTotalRespired = function (organ) {
    // get total amount of actual biomass
    var total_biomass = totalBiomass();

    // get biomass of specific organ and calculates ratio
    var organ_percentage = get_OrganBiomass(organ) / total_biomass;
    return (get_AutotrophicRespiration() * organ_percentage);
  };

  var get_OrganSpecificNPP = function (organ) {
    // get total amount of actual biomass
    var total_biomass = totalBiomass();

    // get biomass of specific organ and calculates ratio
    var organ_percentage = get_OrganBiomass(organ) / total_biomass;

    return (get_NetPrimaryProduction() * organ_percentage);
  };

  var applyCutting = function () {

    var old_above_biomass = vc_AbovegroundBiomass;
    var removing_biomass = 0.0;

    logger(MSG.INFO, "apply cutting");

    var new_OrganBiomass = [];      //! old WORG
    for (var organ=1; organ<pc_NumberOfOrgans+1; organ++) {

        var cut_organ_count = cropParams.organIdsForCutting.length;
        var biomass = vc_OrganBiomass[organ - 1];
        logger(MSG.INFO, "old biomass: " + biomass  + "\tOrgan: " + organ);
        for (var cut_organ=0; cut_organ<cut_organ_count; cut_organ++) {

            var yc = new YieldComponent(cropParams.organIdsForCutting[cut_organ]);

            if (organ == yc.organId) {
                biomass = vc_OrganBiomass[organ - 1] * ((1-yc.yieldPercentage));
                vc_AbovegroundBiomass -= biomass;

                removing_biomass +=biomass;
            }
        }
        new_OrganBiomass.push(biomass);
        logger(MSG.INFO, "new biomass: " + biomass);
    }

    vc_TotalBiomassNContent = (removing_biomass / old_above_biomass) * vc_TotalBiomassNContent;


    vc_OrganBiomass = new Float64Array(new_OrganBiomass);

    // reset stage and temperature some after cutting
    var stage_after_cutting = cropParams.pc_StageAfterCut-1;
    for (var stage=stage_after_cutting; stage<pc_NumberOfDevelopmentalStages; stage++) {
      vc_CurrentTemperatureSum[stage] = 0.0;
    }
    vc_CurrentTotalTemperatureSum = 0.0;
    vc_DevelopmentalStage = stage_after_cutting;
    cutting_delay_days = cropParams.pc_CuttingDelayDays;
    pc_MaxAssimilationRate  = pc_MaxAssimilationRate * 0.9;

    // JS: Fehler in MONICA C++? LAI bleibt nach Schnitt unverändert
    // Reset leaf area index
    vc_LeafAreaIndex = vc_OrganBiomass[1] * pc_SpecificLeafArea[vc_DevelopmentalStage]; // [ha ha-1]  

  };

  var accumulateEvapotranspiration = function (ETa) { 
    vc_accumulatedETa += ETa;
  };

  var get_RootNConcentration = function () {
    return vc_NConcentrationRoot;
  };

  /**
  * Returns the depth of the maximum active and effective root.
  * [m]
  */
  var getEffectiveRootingDepth = function () {
    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      if (vc_RootEffectivity[i_Layer] == 0.0) {
          return (i_Layer+1) / 10.0;
      } // if
    } // for
    return (vs_NumberOfLayers + 1) / 10.0;
  };

  var get_CropName = function () {
    return pc_CropName;
  };

  var get_GrossPhotosynthesisRate = function () {
    return vc_GrossPhotosynthesis_mol;
  };

  var get_GrossPhotosynthesisHaRate = function () {
    return vc_GrossPhotosynthesis;
  };

  var get_AssimilationRate = function () {
    return vc_AssimilationRate;
  };

  var get_Assimilates = function () {
    return vc_Assimilates;
  };

  var get_NetMaintenanceRespiration = function () {
    return vc_NetMaintenanceRespiration;
  };

  var get_MaintenanceRespirationAS = function () {
    return vc_MaintenanceRespirationAS;
  };

  var get_GrowthRespirationAS = function () {
    return vc_GrowthRespirationAS;
  };

  var get_VernalisationFactor = function () {
    return vc_VernalisationFactor;
  };

  var get_DaylengthFactor = function () {
    return vc_DaylengthFactor;
  };

  var get_NetPhotosynthesis = function () {
    return vc_NetPhotosynthesis;
  };

  var get_ReferenceEvapotranspiration = function () {
    return vc_ReferenceEvapotranspiration;
  };

  var get_RemainingEvapotranspiration = function () {
    return vc_RemainingEvapotranspiration;
  };

  var get_EvaporatedFromIntercept = function () {
    return vc_EvaporatedFromIntercept;
  };

  var get_NetPrecipitation = function () {
    return vc_NetPrecipitation;
  };

  var get_LeafAreaIndex = function () {
    return vc_LeafAreaIndex;
  };

  var get_CropHeight = function () {
    return vc_CropHeight;
  };

  var get_RootingDepth = function () {
    return vc_RootingDepth;
  };

  var get_SoilCoverage = function () {
    return vc_SoilCoverage;
  };

  var get_KcFactor = function () {
    return vc_KcFactor;
  };

  var get_StomataResistance = function () {
    return vc_StomataResistance;
  };

  var get_PotentialTranspiration = function () {
    return vc_PotentialTranspiration;
  };

  var get_ActualTranspiration = function () {
    return vc_ActualTranspiration;
  };

  var get_TranspirationDeficit = function () {
    return vc_TranspirationDeficit;
  };

  var get_OxygenDeficit = function () {
    return vc_OxygenDeficit;
  };

  var get_CropNRedux = function () {
    return vc_CropNRedux;
  };

  var get_HeatStressRedux = function () {
    return vc_CropHeatRedux;
  };

  var get_CurrentTemperatureSum = function () {
    return vc_CurrentTotalTemperatureSum;
  };

  var get_DevelopmentalStage = function () {
    return vc_DevelopmentalStage;
  };

  var get_RelativeTotalDevelopment = function () {
    return vc_RelativeTotalDevelopment;
  };

  var get_AbovegroundBiomass = function () {
    return vc_AbovegroundBiomass;
  };

  var get_TotalBiomassNContent = function () {
    return vc_TotalBiomassNContent;
  };

  var get_TargetNConcentration = function () {
    return vc_TargetNConcentration;
  };

  var get_CriticalNConcentration = function () {
    return vc_CriticalNConcentration;
  };

  var get_AbovegroundBiomassNConcentration = function () {
    return vc_NConcentrationAbovegroundBiomass;
  };

  var get_HeatSumIrrigationStart = function () {
    return cropParams.pc_HeatSumIrrigationStart;
  };

  var get_HeatSumIrrigationEnd = function () {
    return cropParams.pc_HeatSumIrrigationEnd
  };

  var get_SumTotalNUptake = function () {
    return vc_SumTotalNUptake;
  };

  var get_ActNUptake = function () {
    return vc_TotalNUptake;
  };

  var get_GrossPrimaryProduction = function () {
    return vc_GrossPrimaryProduction;
  };

  var get_NetPrimaryProduction = function () {
    return vc_NetPrimaryProduction;
  };

  var get_AccumulatedETa = function () {
    return vc_accumulatedETa;
  };

  var isDying = function () {
    return dyingOut;
  };

  var get_NumberOfOrgans = function () { 
    return pc_NumberOfOrgans; 
  };

  var totalBiomass = function () { 
    return vc_TotalBiomass; 
  };

  // new interface

  var get_numberOfSpecies = function () {
    return 1;
  };


  return {
      step: calculateCropGrowthStep
    , accumulateEvapotranspiration: accumulateEvapotranspiration
    , isDying: isDying
    , totalBiomass: totalBiomass
    , getEffectiveRootingDepth: getEffectiveRootingDepth
    , get_AbovegroundBiomass: get_AbovegroundBiomass
    , get_AbovegroundBiomassNConcentration: get_AbovegroundBiomassNConcentration
    , get_AbovegroundBiomassNContent: get_AbovegroundBiomassNContent
    , get_AccumulatedETa: get_AccumulatedETa
    , get_ActNUptake: get_ActNUptake
    , get_ActualTranspiration: get_ActualTranspiration
    , get_Assimilates: get_Assimilates
    , get_AssimilationRate: get_AssimilationRate
    , get_AutotrophicRespiration: get_AutotrophicRespiration
    , get_CriticalNConcentration: get_CriticalNConcentration
    , get_CropHeight: get_CropHeight
    , get_CropNRedux: get_CropNRedux
    , get_CropName: get_CropName
    , get_CurrentTemperatureSum: get_CurrentTemperatureSum
    , get_DaylengthFactor: get_DaylengthFactor
    , get_DevelopmentalStage: get_DevelopmentalStage
    , get_EvaporatedFromIntercept: get_EvaporatedFromIntercept
    , get_FreshPrimaryCropYield: get_FreshPrimaryCropYield
    , get_FreshSecondaryCropYield: get_FreshSecondaryCropYield
    , get_GrossPhotosynthesisHaRate: get_GrossPhotosynthesisHaRate
    , get_GrossPhotosynthesisRate: get_GrossPhotosynthesisRate
    , get_GrossPrimaryProduction: get_GrossPrimaryProduction
    , get_GrowthRespirationAS: get_GrowthRespirationAS
    , get_HeatStressRedux: get_HeatStressRedux
    , get_HeatSumIrrigationEnd: get_HeatSumIrrigationEnd
    , get_HeatSumIrrigationStart: get_HeatSumIrrigationStart
    , get_KcFactor: get_KcFactor
    , get_LeafAreaIndex: get_LeafAreaIndex
    , get_MaintenanceRespirationAS: get_MaintenanceRespirationAS
    , get_NUptakeFromLayer: get_NUptakeFromLayer
    , get_NetMaintenanceRespiration: get_NetMaintenanceRespiration
    , get_NetPhotosynthesis: get_NetPhotosynthesis
    , get_NetPrecipitation: get_NetPrecipitation
    , get_NetPrimaryProduction: get_NetPrimaryProduction
    , get_NumberOfOrgans: get_NumberOfOrgans
    , get_OrganBiomass: get_OrganBiomass
    , get_OrganGrowthIncrement: get_OrganGrowthIncrement
    , get_OrganSpecificNPP: get_OrganSpecificNPP
    , get_OrganSpecificTotalRespired: get_OrganSpecificTotalRespired
    , get_OxygenDeficit: get_OxygenDeficit
    , get_PotNUptake: get_PotNUptake
    , get_PotentialTranspiration: get_PotentialTranspiration
    , get_PrimaryCropYield: get_PrimaryCropYield
    , get_PrimaryYieldNConcentration: get_PrimaryYieldNConcentration
    , get_PrimaryYieldNContent: get_PrimaryYieldNContent
    , get_RawProteinConcentration: get_RawProteinConcentration
    , get_ReferenceEvapotranspiration: get_ReferenceEvapotranspiration
    , get_RelativeTotalDevelopment: get_RelativeTotalDevelopment
    , get_RemainingEvapotranspiration: get_RemainingEvapotranspiration
    , get_ResidueBiomass: get_ResidueBiomass
    , get_ResiduesNConcentration: get_ResiduesNConcentration
    , get_ResiduesNContent: get_ResiduesNContent
    , get_RootNConcentration: get_RootNConcentration
    , get_RootingDepth: get_RootingDepth
    , get_SecondaryCropYield: get_SecondaryCropYield
    , get_SecondaryYieldNContent: get_SecondaryYieldNContent
    , get_SoilCoverage: get_SoilCoverage
    , get_StomataResistance: get_StomataResistance
    , get_SumTotalNUptake: get_SumTotalNUptake
    , get_TargetNConcentration: get_TargetNConcentration
    , get_TotalBiomassNContent: get_TotalBiomassNContent
    , get_Transpiration: get_Transpiration
    , get_TranspirationDeficit: get_TranspirationDeficit
    , get_VernalisationFactor: get_VernalisationFactor
    , get_numberOfSpecies: get_numberOfSpecies
  };

};



/*
  {
    species: [
      {
        type: 'generic grass',
        constants: { 
          h_m: 0.5, 
          L_half: 2.0 
        } 
      }
    , {
        type: 'generic grass',
        constants: { 
          h_m: 0.4, 
          L_half: 2.0 
        } 
      }
    ],
    DM: [] inital fraction of total dry matter
  }

  LICENSE

  The MIT License (MIT)
  Copywrite (c) 2015 Jan Vaillant (jan.vaillant@zalf.de)


  REFERENCES

  Johnson IR (2008). Biophysical pasture model documentation: model documentation for DairyMod. EcoMod and the SGS Pasture
  Model. (IMJ Consultants: Dorrigo, NSW)

  Johnson IR (2013). DairyMod and the SGS Pasture Model: a mathematical description of the biophysical model structure.
  IMJ Consultants, Dorrigo, NSW, Australia.


  README

  Important (somewhat experimental) deviations from the original approach:

  - Added a different (simpler) height(lai) function to better capture dm removal by height. 
*/

var Grass = function (seedDate, harvestDates, species) {
  
  this.mixture = null;
  this._seedDate = seedDate;
  this._harvestDates = harvestDates;

  var _accumulatedETa = 0.0
    , _appliedAmountIrrigation = 0
    , _cropHeight = 0.0
    , _crossCropAdaptionFactor = 1 
    , _cuttingDates = []
    , _cuttingYieldsDM = []
    , _harvestDate = new Date(Infinity)
    , _seedDate = new Date(Infinity)
    , _primaryYield = 0
    , _primaryYieldN = 0
    , _primaryYieldTM = 0
    , _secondaryYield = 0
    , _secondaryYieldN = 0
    , _secondaryYieldTM = 0
    , _sumTotalNUptake = 0
    ;

  /* species object to store species specific parameters for a mixture */
  var Species = function (options) {

    var that = this;

    /* defaults */
    this.isLegume = false;
    this.isC4 = false;
    this.type = 'generic grass';

    this.cons = {               //                             generic grass constants
        index: 0                // [#]                         index in mixture array at initialization (stored to restore orig. sorting)
      , f_cover: 1              // [m2 m-2]                    coverage (scales height to a full m2)
      , h_m: 0.5                // [m]                         maximum height 
      , L_half: 2.0             // [m2 (leaf) m-2 (ground)]    leaf area at half h_m
      , σ: 20.0                 // [m2 (leaf) kg-1 (DM)]       specific leaf area 
      , d_r_h: 0.15             // [m]                         depth at 50% root mass
      , d_r_mx: 0.4             // [m]                         maximum root depth
      , δ_ndf_live_l_1: 0.8     // [kg kg-1]                   NDF digestibility live leaf 1
      , δ_ndf_live_l_2: 0.5     // [kg kg-1]                   NDF digestibility live leaf 2
      , δ_ndf_live_l_3: 0.3     // [kg kg-1]                   NDF digestibility live leaf 3
      , δ_ndf_dead_l: 0.2       // [kg kg-1]                   NDF digestibility dead leaf
      , δ_ndf_live_s_1: 0.7     // [kg kg-1]                   NDF digestibility live stem 1
      , δ_ndf_live_s_2: 0.4     // [kg kg-1]                   NDF digestibility live stem 2
      , δ_ndf_live_s_3: 0.3     // [kg kg-1]                   NDF digestibility live stem 3
      , δ_ndf_dead_s: 0.2       // [kg kg-1]                   NDF digestibility live leaf
      , δ_nfc: 1                // [kg kg-1]                   NFC digestibility
      , T_mn_high: 5            // [°C]                        critical temperature below which low-temperature stress will occur
      , T_mn_low: 0             // [°C]                        critical temperature at which the low-temperature stress is maximum
      , T_mx_high: 35           // [°C]                        critical temperature at which the high-temperature stress is maximum
      , T_mx_low: 30            // [°C]                        critical temperature above which high-temperature stress will occur
      , T_sum_low: 100          // [°C]               low temperature stress recovery temperature sum
      , T_sum_high: 100          // [°C]              high temperature stress recovery temperature sum
      , photo: {                // photosynthesis
            T_ref: 20           // [°C]                        reference temperature
          , T_mn: 3             // [°C]                        minimum temperature 
          , T_opt_Pm_amb: 23    // [°C]                        optimum temperature
          , ξ: 0.8              // [-]                         non‐rectangular hyperbola curvatur parameter
          , α_amb_15: 0.05      // [mol (CO2) mol-1 (photons)] photosythetic efficiency α at ambient CO2 (C_amb_ref) and 15 °C
          , k: 0.5              // [-]                         leaf extinction coefficient
          , P_m_ref: 16         // [μmol (CO2) m-2 (leaf) s-1] reference value for P_m
          , λ: 1.2              // []                          CO2 response parameter
          , f_C_m: 1.49         // []                          CO2 response parameter
          , γ_Pm: 10            // []                          CO2 & T response parameter
          , λ_α: 0.02           // [°C]                        CO2 & T response parameter
          , γ_α: 6              // [°C]                        CO2 & T response parameter
        }
      , resp: {                 // respiration
            m_ref: 0.025        // [day-1]                     maintenance coeficient at reference temperature
          , T_ref: 20
          , T_m_mn: 3
          , λ_N_up: 0.6         // [kg (C) kg-1 (N)]           N uptake respiration coefficent
          , λ_N_fix: 6          // [kg (C) kg-1 (N)]           N fixation respiration coefficent
        }
      , part: {                 // partitioning
            ρ_shoot_ref: 0.75   // [-]                         reference shoot partitioning fraction
          , ρ_l_max: 0.7        // [-]                         fraction partitioned to leaf
          , GDD_flower: 500     // [C° d]                      growing degree days till flowering
        }
       /* TODO: remove or rename: */
      , N_leaf: {
            opt: 0.04 / 0.45
          , max: 0.045 / 0.45   // [kg (N) kg-1 (C)] AgPasture: 0.05 / 0.4 (NcleafOpt as fraction / C in DM as fraction)
          , ref: 0.04 / 0.45
       }
      , τ_veg: 200
      , fAsh_dm_l_ref: 0.09     // [kg (ash) kg-1 (DM)]       reference ash content leaf
      , fAsh_dm_s_ref: 0.04     // [kg (ash) kg-1 (DM)]       reference ash content stem
      , fAsh_dm_r_ref: 0.04     // [kg (ash) kg-1 (DM)]       reference ash content root
      , fH2O_fm_l_ref: 0.80     // [kg (H20) kg-1 (FM)]       reference water content leaf
      , fH2O_fm_s_ref: 0.70     // [kg (H20) kg-1 (FM)]       reference water content stem
    };

    this.vars = {               //                    variables
        GDD: 0                  // [°C day]           growing degree days
      , Ω_N: 1.0                // [0-1]              growth limiting factor nitrogen (1 = no stress)
      , Ω_water: 1.0            // [0-1]              growth limiting factor water (1 = no stress)
      , τ_T_low: 1.0            // [0-1]              growth limiting factor low temperature (1 = no stress)     
      , τ_T_high: 1.0           // [0-1]              growth limiting factor high temperature (1 = no stress)  
      , ζ_T_low: 0.0            // [0-1]  low temperature stress recovery coefficient 
      , ζ_T_high: 0.0           // [0-1]  low temperature stress recovery coefficient       , P_g_day: 0.0            // [kg (C) m-2]       daily canopy gross photosynthesis
      , R_m: 0.0                // [kg (C) m-2]       daily maintenance respiration
      , R_N: 0                  // [kg (C) m-2]       daily N uptake cost
      , G: 0.0                  // [kg (C) m-2]       daily net growth rate
      , G_leaf: 0               // [kg (C) m-2]       daily leaf growth
      , G_stem: 0               // [kg (C) m-2]       daily stem growth
      , G_root: 0               // [kg (C) m-2]       daily root growth
      , Y: 0.75                 // [-]                total growth efficiency
      , Y_leaf: 0.75            // [-]                leaf efficiency
      , Y_stem: 0.75            // [-]                stem growth efficiency
      , Y_root: 0.75            // [-]                root growth efficiency
      , d_r: 1.0                // [m]                root depth
      , τ: 0                    // [days]             no. of days in pheno. phase (e.g. vegetative) TODO: remove?
      , k_sum: 0                // [-]                pheno. phase developement (0-1)
      , N_up: 0                 // [kg (N) m-2]       daily N uptake
      , N_fix: 0                // [kg (N) m-2]       daily N fixation
      , N_avail: 0              // [kg (N) m-2]       daily N available
      , N_assim: 0              // [kg (N) m-2]       daily N assimilated
      , N_req: 0                // [kg (N) m-2]       daily N required
      , N_remob: 0              // [kg (N) m-2]       daily N remobilized from senecenced tissue
      , N_add: 0                // [kg (N) m-2]       daily N radditionaly assimilated due to over supply (N_avail > N_req)
      , ρ_shoot: 0.7            // [kg (C) kg-1 (C)]  growth fraction partitioned to shoot
      , ρ_root: 0.3             // [kg (C) kg-1 (C)]  growth fraction partitioned to root
      , ρ_l: 0.7                // [kg (C) kg-1 (C)]  growth shoot fraction partitioned to leaf

      , G_l_fC_om: {            // [kg (C) kg-1 (C)]  composition of new leaf tissue (OM), fractions 
            sc: 0.0
          , nc: 0.0
          , pn: 0.0 
        }
      , G_s_fC_om: {            // [kg (C) kg-1 (C)]  composition of new stem tissue (OM), fractions 
            sc: 0.0
          , nc: 0.0
          , pn: 0.0 
        }
      , G_r_fC_om: {            // [kg (C) kg-1 (C)]  composition of new root tissue (OM), fractions 
            sc: 0.0
          , nc: 0.0
          , pn: 0.0 
        }
      , SC: {                    // [kg (C) m-2]      structural carbon hydrate pools 
            live_l_1: 0.0
          , live_l_2: 0.0
          , live_l_3: 0.0
          , dead_l:   0.0
          , live_s_1: 0.0
          , live_s_2: 0.0
          , live_s_3: 0.0
          , dead_s:   0.0
          , r:        0.0
        }
                        
      , dSC: {                   // [kg (C) m-2]      daily structural carbon hydrate growth pool
            live_l_1: 0.0
          , live_l_2: 0.0
          , live_l_3: 0.0
          , dead_l:   0.0
          , live_s_1: 0.0
          , live_s_2: 0.0
          , live_s_3: 0.0
          , dead_s:   0.0
          , r:        0.0
        }
        /*  */
      , NC: {                   // [kg (C) m-2]       non-structural carbon hydrate pool  
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , dNC: {                  // [kg (C) m-2]       daily non-structural carbon hydrate growth pool 
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , PN: {                   // [kg (C) m-2]       protein pool 
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , dPN: {                  // [kg (C) m-2]       daily protein growth pool 
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , AH: {                   // [kg (ash) m-2]      ash pool 
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , dAH: {                  // [kg (ash) m-2]     daily ash growth pool 
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , Λ_litter: {             // [kg (C) m-2]       litter from senecenced leaf and stem 
            sc: 0.0
          , pn: 0.0
          , nc: 0.0 
        } 
      , Λ_r: {                  // [kg (C) m-2]       senecenced root 
            sc: 0
          , pn: 0
          , nc: 0.0 
        }
    };


    /* initialze constants with pre-defined values by type; defaults to generic grass */
    if (options && options.type) {
    
      switch (options.type) {

      case 'white clover':

        this.isLegume = true;
        this.type = 'white clover';

        this.cons.h_m = 0.5;
        this.cons.L_half = 2.0;
        this.cons.σ = 36.8; // Topp (2004)

        /* photosysthesis */
        this.cons.photo.T_ref = 20;
        this.cons.photo.T_mn = 3;
        this.cons.photo.T_opt_Pm_amb = 23;
        this.cons.photo.ξ = 0.8;
        this.cons.photo.k = 0.8;
        this.cons.photo.m = 0.0;
        this.cons.photo.α_amb_15 = 0.05;
        this.cons.photo.P_m_ref = 16;
        this.cons.photo.λ = 1.2;
        this.cons.photo.f_C_m = 1.49;
        this.cons.photo.γ_Pm = 10;
        this.cons.photo.λ_α = 0.02; 
        this.cons.photo.γ_α = 6;

        /* partitioning */
        this.cons.part.ρ_shoot_ref = 0.71;  // Topp (2004)
        this.cons.part.ρ_l = 0.33; // Topp (2004)

        break;
      case 'red clover':

        this.isLegume = true;
        this.type = 'red clover';

        this.cons.h_m = 0.3;
        this.cons.L_half = 2.0;
        this.cons.σ = 24.0; // Topp (2004)

        /* photosysthesis */
        this.cons.photo.T_ref = 25; // Topp (2004)
        this.cons.photo.T_mn = 3;
        this.cons.photo.T_opt_Pm_amb = 25;
        this.cons.photo.ξ = 0.8;
        this.cons.photo.k = 1.0; // Topp (2004)
        this.cons.photo.m = 0.0;
        this.cons.photo.α_amb_15 = 0.05;
        this.cons.photo.P_m_ref = 12.9; // Topp (2004)
        this.cons.photo.λ = 1.2;
        this.cons.photo.f_C_m = 1.49;
        this.cons.photo.γ_Pm = 10;
        this.cons.photo.λ_α = 0.02; 
        this.cons.photo.γ_α = 6;

        /* partitioning */
        this.cons.part.ρ_shoot_ref = 0.71;  // Topp (2004)
        this.cons.part.ρ_l = 0.55; // Topp (2004)

        break;
      case 'ryegrass':

        this.isLegume = false;
        this.type = 'ryegrass';

        this.cons.h_m = 0.5;
        this.cons.L_half = 2.0;
        this.cons.σ = 25.8; // Topp (2004)

        /* photosysthesis */
        this.cons.photo.T_ref = 20;
        this.cons.photo.T_mn = 3;
        this.cons.photo.T_opt_Pm_amb = 23;
        this.cons.photo.ξ = 0.8;
        this.cons.photo.k = 0.5;
        this.cons.photo.m = 0.0;
        this.cons.photo.α_amb_15 = 0.05;
        this.cons.photo.P_m_ref = 16;
        this.cons.photo.λ = 1.2;
        this.cons.photo.f_C_m = 1.49;
        this.cons.photo.γ_Pm = 10;
        this.cons.photo.λ_α = 0.02; 
        this.cons.photo.γ_α = 6;

        /* partitioning */
        this.cons.part.ρ_shoot_ref = 0.8;
        this.cons.part.ρ_l = 0.7;

        break;
      }
    }

    /* overwrite initial values with provided (optional) configuration values */
    if (options) {

      this.isLegume = options.isLegume || false;
      this.isC4 = options.isC4 || false;

      if (options.hasOwnProperty('constants')) {
        var constants = options.constants;
        for (var prop in constants) {
          if (constants.hasOwnProperty(prop) && this.cons.hasOwnProperty(prop) && constants[prop] !== null)
            this.cons[prop] = constants[prop]
        }
      }

    }


    /* shoot protein fraction [kg (protein) kg-1 (DM)] */
    this.fOM_pn = function () {

      var PN = that.vars.PN;

      return ((PN.l + PN.s + PN.dead_l + PN.dead_s) / fC_pn) / that.DM_shoot();

    };


    /* 
      protein digestibility Van Niekerk (1967) 
      TODO: check units (DM or OM?)
      
      pn  [g (CP) kg-1 (DM)]
    */
    this.δ_pn = function (pn) { 

      return 0.956 - (34.3 / pn); 

    };  

    /* shoot digestibility [kg (OM) kg-1 (OM)] */
    this.OMD_shoot = function () {

      var cons = that.cons
        , vars = that.vars
        , SC = that.vars.SC
        , NC = that.vars.NC
        , PN = that.vars.PN
        , δ_pn = that.δ_pn(this.fOM_pn() * 1e3) // kg to grams
        ;

      var NDF_live_l_1 = SC.live_l_1 / fC_sc;
      var NDF_live_l_2 = SC.live_l_2 / fC_sc;
      var NDF_live_l_3 = SC.live_l_3 / fC_sc;
      var NDF_dead_l = SC.dead_l / fC_sc;
      
      var NDF_live_s_1 = SC.live_s_1 / fC_sc;
      var NDF_live_s_2 = SC.live_s_2 / fC_sc;
      var NDF_live_s_3 = SC.live_s_3 / fC_sc;
      var NDF_dead_s = SC.dead_s / fC_sc;

      var NFC = (NC.l + NC.s + vars.NC.dead_l + vars.NC.dead_s) / fC_nc;

      var CP = (PN.l + PN.s + vars.PN.dead_l + vars.PN.dead_s) / fC_pn;

      /* digestible NDF [kg m-2] */
      var DNDF = (
        cons.δ_ndf_live_l_1 * NDF_live_l_1 +
        cons.δ_ndf_live_l_2 * NDF_live_l_2 +
        cons.δ_ndf_live_l_3 * NDF_live_l_3 +
        cons.δ_ndf_dead_l * NDF_dead_l +
        cons.δ_ndf_live_s_1 * NDF_live_s_1 + 
        cons.δ_ndf_live_s_2 * NDF_live_s_2 + 
        cons.δ_ndf_live_s_3 * NDF_live_s_3 + 
        cons.δ_ndf_dead_s * NDF_dead_s
      );

      /* digestible NFC  [kg m-2] */
      var DNFC = cons.δ_nfc * NFC;

      /*  digestible CP [kg m-2]  */
      var DCP = δ_pn * CP;

      return (
        (DNDF + DNFC + DCP) / 
        (
          NDF_live_l_1 + NDF_live_l_2 + NDF_live_l_3 + NDF_dead_l + 
          NDF_live_s_1 + NDF_live_s_2 + NDF_live_s_3 + NDF_dead_s + 
          NFC + CP
        )
      );

    };


    /* NDFD leaf [kg (NDF) kg-1 (NDF)] */
    this.NDFD_leaf = function () {

      var cons = that.cons
        , SC = that.vars.SC
        ;

      var NDF_live_l_1 = SC.live_l_1 / fC_sc;
      var NDF_live_l_2 = SC.live_l_2 / fC_sc;
      var NDF_live_l_3 = SC.live_l_3 / fC_sc;
      var NDF_dead_l = SC.dead_l / fC_sc;

      var DNDF = (
        cons.δ_ndf_live_l_1 * NDF_live_l_1 +
        cons.δ_ndf_live_l_2 * NDF_live_l_2 +
        cons.δ_ndf_live_l_3 * NDF_live_l_3 +
        cons.δ_ndf_dead_l * NDF_dead_l
      );

      return DNDF / (NDF_live_l_1 + NDF_live_l_2 + NDF_live_l_3 + NDF_dead_l);

    };

    /* NDFD stem [kg (NDF) kg-1 (NDF)] */
    this.NDFD_stem = function () {

      var cons = that.cons
        , SC = that.vars.SC
        ;

      var NDF_live_s_1 = SC.live_s_1 / fC_sc;
      var NDF_live_s_2 = SC.live_s_2 / fC_sc;
      var NDF_live_s_3 = SC.live_s_3 / fC_sc;
      var NDF_dead_s = SC.dead_s / fC_sc;

      var DNDF = (
        cons.δ_ndf_live_s_1 * NDF_live_s_1 + 
        cons.δ_ndf_live_s_2 * NDF_live_s_2 + 
        cons.δ_ndf_live_s_3 * NDF_live_s_3 + 
        cons.δ_ndf_dead_s * NDF_dead_s
      );

      return DNDF / (NDF_live_s_1 + NDF_live_s_2 + NDF_live_s_3 + NDF_dead_s);

    };

    /* NDF leaf [g (NDF) kg-1 (DM)] */
    this.NDF_leaf = function () {

      var SC = that.vars.SC;

      return 1e3 * ((SC.live_l_1 + SC.live_l_2 + SC.live_l_3 + SC.dead_l) / fC_sc) / that.DM_leaf();

    };


    /* NDF stem [g (NDF) kg-1 (DM)] */
    this.NDF_stem = function () {

      var SC = that.vars.SC;

      return 1e3 * ((SC.live_s_1 + SC.live_s_2 + SC.live_s_3 + SC.dead_s) / fC_sc) / that.DM_stem();

    };

    /* NFC leaf [g (NFC) kg-1 (DM)] */
    this.NFC_leaf = function () {

      var vars = that.vars;

      return 1e3 * ((vars.NC.l + vars.NC.dead_l) / fC_nc) / that.DM_leaf();

    };


    /* NFC stem [g (NFC) kg-1 (DM)] */
    this.NFC_stem = function () {

      var vars = that.vars;

      return 1e3 * ((vars.NC.s + vars.NC.dead_s) / fC_nc) / that.DM_stem();

    };

    /* CP leaf [g (CP) kg-1 (DM)] */
    this.CP_leaf = function () {

      var vars = that.vars;

      return 1e3 * ((vars.PN.l + vars.PN.dead_l) / fC_pn) / that.DM_leaf();

    };


    /* CP stem [g (CP) kg-1 (DM)] */
    this.CP_stem = function () {

      var vars = that.vars;

      return 1e3 * ((vars.PN.s + vars.PN.dead_s) / fC_pn) / that.DM_stem();

    };

    /* CP shoot [g (CP) kg-1 (DM)] */
    this.CP_shoot = function () {

      var vars = that.vars;

      return 1e3 * ((vars.PN.l + vars.PN.dead_l + vars.PN.s + vars.PN.dead_s) / fC_pn) / (that.DM_leaf() + that.DM_stem());

    };

    /* ASH leaf [g (ASH) kg-1 (DM)] */
    this.ASH_leaf = function () {

      var vars = that.vars;

      return 1e3 * vars.AH.l / (that.DM_leaf() + vars.AH.l);

    };


    /* ASH stem [g (ASH) kg-1 (DM)] */
    this.ASH_stem = function () {

      var vars = that.vars;

      return 1e3 * vars.AH.s / (that.DM_stem() + vars.AH.s);

    };

    /* ASH shoot [g (ASH) kg-1 (DM)] */
    this.ASH_shoot = function () {

      var vars = that.vars;

      return 1e3 * (vars.AH.l + vars.AH.s) / (that.DM_leaf() + vars.AH.l + that.DM_stem() + vars.AH.s);

    };

    /* 
      CF shoot [g (CF) kg-1 (DM)] 
      regressions based on feed table data from Finland (MTT) and France (Feedipedia) and data from an Austrian feed
      laboratory (Rosenau). legumes N = 31, R² = 0.73, grass N = 46, R² = 0.78
    */
    this.CF_shoot= function () {

      var SC = that.vars.SC;
      var NDF = 1e3 * ( 
        (
          (SC.live_l_1 + SC.live_l_2 + SC.live_l_3 + SC.dead_l + SC.live_s_1 + SC.live_s_2 + SC.live_s_3 + SC.dead_s) / 
          fC_sc
        ) / that.DM_shoot()
      );

      if (that.isLegume)
        return 69.58 + 0.453 * NDF;
      else
        return 14.15 + 0.512 * NDF;

    };

    /* C_root [kg (C) m-2] root C */
    this.C_root = function () {

      var vars = that.vars;

      return  vars.SC.r + vars.NC.r + vars.PN.r;

    };


    /* C_live_shoot [kg (C) m-2] live shoot C */
    this.C_live_shoot = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        ;

      return (
        SC.live_l_1 +
        SC.live_l_2 +
        SC.live_l_3 +
        SC.live_s_1 +
        SC.live_s_2 +
        SC.live_s_3 +
        NC.l + NC.s +
        PN.l + PN.s
      );

    };


    /* C_live_leaf [kg (C) m-2] live leaf C */
    this.C_live_leaf = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        ;

      return (
        SC.live_l_1 +
        SC.live_l_2 +
        SC.live_l_3 +
        NC.l + PN.l
      );

    };


    /* C_live_stem [kg (C) m-2] live stem C */
    this.C_live_stem = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        ;

      return (
        SC.live_s_1 +
        SC.live_s_2 +
        SC.live_s_3 +
        NC.s + PN.s
      );

    };


    /* N_root [kg (N) m-2] root N */
    this.N_root = function () {

      return that.vars.PN.r * fN_pn / fC_pn;

    };


    /* N_live_shoot [kg (N) m-2] live shoot N */
    this.N_live_shoot = function () {

      var PN = that.vars.PN;

      return (PN.l + PN.s) * fN_pn / fC_pn;

    };


    /* N_live_leaf [kg (N) m-2] live leaf N */
    this.N_live_leaf = function () {

      return that.vars.PN.l * fN_pn / fC_pn;

    };


    /* N_live_stem [kg (N) m-2] live stem N */
    this.N_live_stem = function () {

      return that.vars.PN.s * fN_pn / fC_pn;

    };


    this.dDM_leaf = function () {

      var vars = that.vars 
        , dSC = vars.dSC
        , dNC = vars.dNC
        , dPN = vars.dPN
        , dAH = vars.dAH
        ;

      return (
        (dSC.live_l_1 + dSC.live_l_2 + dSC.live_l_3 + dSC.dead_l) / fC_sc + 
        (dNC.l + dNC.dead_l) / fC_nc + 
        (dPN.l + dPN.dead_l) / fC_pn +
        dAH.l
      ); 

    };


    this.dDM_stem = function () {

      var vars = that.vars 
        , dSC = vars.dSC
        , dNC = vars.dNC
        , dPN = vars.dPN
        , dAH = vars.dAH
        ;

      return (
        (dSC.live_s_1 + dSC.live_s_2 + dSC.live_s_3 + dSC.dead_s) / fC_sc + 
        (dNC.s + dNC.dead_s) / fC_nc + 
        (dPN.s + dPN.dead_s) / fC_pn +
        dAH.s
      ); 

    };


    this.dDM_root = function () {

      var vars = that.vars 
        , dSC = vars.dSC
        , dNC = vars.dNC
        , dPN = vars.dPN
        , dAH = vars.dAH
        ;

      return dSC.r / fC_sc + dNC.r / fC_nc + dPN.r / fC_pn + dAH.r;

    };


    this.dDM_shoot = function () {

      return that.dDM_leaf() + that.dDM_stem();

    };


    this.DM_shoot = function () {

      return that.DM_leaf() + that.DM_stem();

    };


    /* live leaf [kg (DM) m-2] */
    this.DM_live_leaf = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        (SC.live_l_1 + SC.live_l_2 + SC.live_l_3) / fC_sc + 
        NC.l / fC_nc + 
        PN.l / fC_pn +
        AH.l
      );  

    };


    this.DM_leaf = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        (SC.live_l_1 + SC.live_l_2 + SC.live_l_3 + SC.dead_l) / fC_sc + 
        (NC.l + NC.dead_l) / fC_nc +
        (PN.l + PN.dead_l) / fC_pn +
        AH.l + AH.dead_l
      );  

    };


    this.DM_dead_leaf = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        SC.dead_l / fC_sc + 
        NC.dead_l / fC_nc +
        PN.dead_l / fC_pn +
        AH.dead_l
      );  

    };


    this.DM_live_stem = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        (SC.live_s_1 + SC.live_s_2 + SC.live_s_3) / fC_sc + 
        NC.s / fC_nc + 
        PN.s / fC_pn +
        AH.s
      );   

    };


    this.DM_stem = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        (SC.live_s_1 + SC.live_s_2 + SC.live_s_3 + SC.dead_s) / fC_sc + 
        (NC.s + NC.dead_s) / fC_nc +
        (PN.s + PN.dead_s) / fC_pn +
        AH.s + AH.dead_s
      ); 

    };


    this.DM_dead_stem = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        SC.dead_s / fC_sc + 
        NC.dead_s / fC_nc +
        PN.dead_s / fC_pn +
        AH.dead_s
      ); 

    };


    this.DM_root = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        SC.r / fC_sc +
        NC.r / fC_nc +
        PN.r / fC_pn +
        AH.r
      );

    };


    /* (3.83) L [m2 (leaf) m-2 (ground) leaf area (CO2 dependence not included (3.84)) */
    this.L = function () {

      return that.cons.σ * that.DM_leaf();
      // test: SLA depends on N concentration: Plant Ecology By Ernst-Detlef Schulze, Erwin Beck, Klaus Müller-Hohenstein p. 359
      // Schulze. 1994. The influence of N2-fixation on the carbon balance of leguminous plants
      // return (that.cons.σ + ((that.N_live_leaf() / that.DM_live_leaf()) - that.cons.N_leaf.ref)) * that.DM_live_leaf();

    };


    /* (3.101) h [m] height relationship between canopy height and leaf area */
    this.h_ = function () {

      var h = 0
        , cons = that.cons
        , L = that.L() * 1 / cons.f_cover // scale to a full m2
        , h_m = cons.h_m
        , L_half = cons.L_half
        , ξ = 0.9 // fixed curvatur parameter
        , α = h_m * (2 - ξ) / (2 * L_half)
        ;

      h = 1 / (2 * ξ) * (α * L + h_m - sqrt(pow(α * L  + h_m, 2) - 4 * α * ξ * h_m * L)); 
    
      return h;

    };

    /* */
    this.h = function () {

      var h = 0
        , cons = that.cons
        , L = that.L() * 1 / cons.f_cover // scale to a full m2
        , h_m = cons.h_m
        , L_5 = 1 // LAI at 5 cm height
        , a = log((100 * h_m - 1) / (20 * h_m - 1)) / L_5 // curvatur parameter
        ;

      h = (0.01 * h_m) / (0.01 + (h_m - 0.01) * exp(-a * L));
    
      return h;

    };


    /* f_N_live_leaf  [kg (N) kg-1 (C)] */
    this.f_N_live_leaf = function () {

      return that.N_live_leaf() / that.C_live_leaf();
    
    };

    /* f_N_live_shoot  [kg (N) kg-1 (C)] */
    this.f_N_live_shoot = function () {

      return that.N_live_shoot() / that.C_live_shoot();
    
    };


    /* f_N_live  [kg (N) kg-1 (C)] total biomass incl. root */
    this.f_N_live = function () {

      return (that.N_live_shoot() + that.N_root()) / (that.C_live_shoot() + that.C_root());
    
    };

  }; // Species end


  /* 
    Mixture (array of species)
    Takes a single species config object or an array of species 
    and returns the array with various functions attached 

    dm array [-] fraction of species dry matter share 

  */
  var Mixture = function (species, config) {

    /* pass array of species or single species */
    var mixture = Array.isArray(species) ? species : [species];

    var noPools = 4
      , leaf_share = 0.7
      , stem_share = 1 - leaf_share
      , DM_root = 1000 * 1e-4 // kg ha-1 to kg m-2
      , DM_shoot = 1000 * 1e-4 // kg ha-1 to kg m-2
      , DM = []
      ;
  
    if (config && config.DM) {
      DM = config.DM;
    } else {
      for (var s = 0, ps = species.length; s < ps; s++)
        DM[s] = 1 / ps;
    }

    if (mixture.length > 1)
      mixture.homogeneity = config.hasOwnProperty('homogeneity') ? config.homogeneity : 0.75;
    else
      mixture.homogeneity = 1;

    /*Vergleich der Biomasseproduktion bei Schnittnutzung und Kurzrasenweide
      unter biologischen Bedingungen im ostalpinen Raum*/;
    if (config && config.DM_shoot) 
      DM_shoot = config.DM_shoot * 1e-4 // kg ha-1 to kg m-2
    if (config && config.DM_root) 
      DM_root = 1000 * 1e-4 // kg ha-1 to kg m-2

    // iterate over species and initialize pools
    for (var s = 0, ps = species.length; s < ps; s++) {

      var species = mixture[s] 
        , SC = species.vars.SC
        , NC = species.vars.NC
        , PN = species.vars.PN
        , AH = species.vars.AH
        ;

      /* assume coverge equals initial DM share */
      species.cons.f_cover = DM[s];
        
      /* initialize carbon pools TODO: OM vs DM: include ash in calc. */

      /* leaf */
      SC.live_l_1 = leaf_share * (DM_shoot * DM[s] / noPools) * 0.50 * fC_sc;
      NC.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.25 * fC_nc;
      PN.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.25 * fC_nc;

      SC.live_l_2 = leaf_share * (DM_shoot * DM[s] / noPools) * 0.60 * fC_sc;
      NC.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.20 * fC_nc; 
      PN.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.20 * fC_pn;
      
      SC.live_l_3 = leaf_share * (DM_shoot * DM[s] / noPools) * 0.70 * fC_sc;
      NC.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.15 * fC_nc; 
      PN.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.15 * fC_pn;
      
      SC.dead_l = leaf_share * (DM_shoot * DM[s] / noPools) * 1.00 * fC_sc;
      NC.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.00 * fC_sc;
      PN.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.00 * fC_sc;

      AH.l = leaf_share * (DM_shoot * DM[s]) * species.cons.fAsh_dm_l_ref;

      /* stem */
      SC.live_s_1 = stem_share * (DM_shoot * DM[s] / noPools) * 0.70 * fC_sc;
      NC.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.15 * fC_nc;
      PN.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.15 * fC_nc;

      SC.live_s_2 = stem_share * (DM_shoot * DM[s] / noPools) * 0.80 * fC_sc;
      NC.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.10 * fC_nc; 
      PN.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.10 * fC_pn;
      
      SC.live_s_3 = stem_share * (DM_shoot * DM[s] / noPools) * 0.90 * fC_sc;
      NC.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.05 * fC_nc; 
      PN.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.05 * fC_pn;
      
      SC.dead_s = stem_share * (DM_shoot * DM[s] / noPools) * 1.00 * fC_sc;
      NC.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.00 * fC_sc;
      PN.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.00 * fC_sc;

      AH.s = stem_share * (DM_shoot * DM[s]) * species.cons.fAsh_dm_s_ref;

      /* root */
      SC.r = DM_root * DM[s] * 0.80 * fC_sc;
      NC.r += DM_root * DM[s] * 0.10 * fC_sc;
      PN.r += DM_root * DM[s] * 0.10 * fC_sc;
      AH.r = DM_root * DM[s] * species.cons.fAsh_dm_r_ref;

    }


    mixture.DM_dead_shoot = function () {

      var DM_dead_shoot = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_dead_shoot += this[s].DM_dead_leaf() + this[s].DM_dead_stem();

      return DM_dead_shoot;

    };


    mixture.DM_live_shoot = function () {

      var DM_live_shoot = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_live_shoot += this[s].DM_live_leaf() + this[s].DM_live_stem()

      return DM_live_shoot;

    };
    

    mixture.DM_shoot = function () {

      var DM_shoot = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_shoot += this[s].DM_leaf() + this[s].DM_stem();

      return DM_shoot;

    };


    /* total leaf DM [kg m-2] */
    mixture.DM_leaf = function () {

      var DM_leaf = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_leaf += this[s].DM_leaf()

      return DM_leaf;

    };


    /* total stem DM [kg m-2] */
    mixture.DM_stem = function () {

      var DM_stem = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_stem += this[s].DM_stem()

      return DM_stem;

    };


    /* total root DM [kg m-2] */
    mixture.DM_root = function () {

      var DM_root = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_root += this[s].DM_root()

      return DM_root;

    };


    /* total leaf daily growth [kg (DM) m-2] */
    mixture.dDM_leaf = function () {

      var dDM_leaf = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dDM_leaf += this[p].dDM_leaf();

      return dDM_leaf;

    };


    /* total stem daily growth DM [kg m-2] */
    mixture.dDM_stem = function () {

      var dDM_stem = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dDM_stem += this[p].dDM_stem();

      return dDM_stem;

    };


    /* total root daily growth DM [kg m-2] */
    mixture.dDM_root = function () {

      var dDM_root = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dDM_root += this[p].dDM_root();

      return dDM_root;

    };


    /* total root C [kg m-2] */
    mixture.C_root = function () {

      var C_root = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        C_root += this[s].C_root()

      return C_root;

    };


    /* f_N_live_leaf [kg (N) kg-1 (C) m-2] */
    mixture.f_N_live_leaf = function () {

      var N_live_leaf = 0
        , C_live_leaf = 0
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        N_live_leaf += this[s].N_live_leaf();
        C_live_leaf += this[s].C_live_leaf();
      }

      return N_live_leaf / C_live_leaf;

    };


    /* f_N_live_leaf_DM [kg (N) kg-1 (OM) m-2] */
    mixture.f_N_live_leaf_DM = function () {

      var N_live_leaf = 0
        , DM_live_leaf = 0
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        N_live_leaf += this[s].N_live_leaf();
        DM_live_leaf += this[s].DM_live_leaf();
      }

      return N_live_leaf / DM_live_leaf;

    };


    /* f_N_live_stem_DM [kg (N) kg-1 (OM) m-2] */
    mixture.f_N_live_stem_DM = function () {

      var N_live_stem = 0
        , DM_live_stem = 0
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        N_live_stem += this[s].N_live_stem();
        DM_live_stem += this[s].DM_live_stem();
      }

      return N_live_stem / DM_live_stem;

    };


    /* f_N_root_DM [kg (N) kg-1 (OM) m-2] */
    mixture.f_N_root_DM = function () {

      var N_root = 0
        , DM_root = 0
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        N_root += this[s].N_root();
        DM_root += this[s].DM_root();
      }

      return N_root / DM_root;

    };


    /* total leaf area */
    mixture.L_tot = function () {

      var L_tot = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        L_tot += this[s].L();

      return L_tot;

    };


    /* height of tallest species in mixture */
    mixture.h_mx = function () {

      var h_mx = 0 
        , h = 0
        //, L_tot = this.L_tot()
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        h = this[s].h();
        h_mx = (h > h_mx) ? h : h_mx;
      }

      return h_mx;

    };

    
    /* depth of deepest rooting species in mixture */
    mixture.d_r_mx = function () {

      var d_r_mx = 0;

      for (var s = 0, ps = this.length; s < ps; s++) {
        if (this[s].vars.d_r > d_r_mx)
          d_r_mx = this[s].vars.d_r;
      }

      return d_r_mx;

    };


    /* (3.105) LAI increment used in photosynthesis calculation */
    mixture.δL = 0.1;


    /* (3.106) number of LAI layers */
    mixture.n_L = function () {

      return floor(this.L_tot() / this.δL);

    };


    /* (3.107) starting layer for each species */
    mixture.n_start_p = function (n_L) {
      
      var n_start_p = []
        , L_tot = this.L_tot()
        , h_mx = this.h_mx()
        ;
      
      for (var s = 0, ps = this.length; s < ps; s++) {
        n_start_p[s] = 1 + ceil((1 - this[s].h() / h_mx) * n_L); 
      }
      
      return n_start_p;

    };


    /* (3.108) LAI increment for each species */
    mixture.δL_p = function (n_start_p, n_L) {
      
      var δL_p = [];

      for (var s = 0, ps = this.length; s < ps; s++)
        δL_p[s] = this[s].L() / (n_L - n_start_p[s] === 0 ? n_start_p[s] : n_L - n_start_p[s]);
      // TODO: fix start layer issue: n_L - n_start_p[s] === 0

      return δL_p;

    };

    /* (3.113) total LAI in layer i */
    mixture.δL_i = function (n_start_p, n_L, δL_p) {
      
      var δL_i = [0]
        , ΣδL = 0
        ;

      for (var i = 1; i <= n_L; i++) {
        ΣδL = 0;
        for (var s = 0, ps = this.length; s < ps; s++) {
          /* (3.110) 'i <=' error in SGS documentation? */
          if (n_start_p[s] <= i) // first layer is i = 1
            ΣδL += δL_p[s];
        }
        δL_i[i] = ΣδL;
      }

      return δL_i;

    };


    /* (3.109) 'effective' light extinction coefficient for each LAI layer i*/
    mixture.k_e_i = function (n_L, n_start_p, δL_p)   {
      
      var k_e_i = [0]
        , ΣkδL = 0
        , ΣδL = 0
        ;
      
      for (var i = 1; i <= n_L; i++) {
        ΣkδL = ΣδL = 0;
        for (var s = 0, ps = this.length; s < ps; s++) {
          /* (3.110) 'i <=' error in SGS documentation? */
          if (n_start_p[s] <= i) { // first layer is i = 1
            ΣkδL += this[s].cons.photo.k * δL_p[s];
            ΣδL += δL_p[s];
          }
        }
        k_e_i[i] = ΣkδL / ΣδL;
      }
      
      return k_e_i;
    
    };

    mixture.Ω_water = function () {

      return this.avg('Ω_water');
    
    };

    mixture.Ω_N = function () {

      return this.avg('Ω_N');
    
    };

    mixture.τ_T_low = function () {

      return this.avg('τ_T_low');
    
    };

    mixture.τ_T_high = function () {

      return this.avg('τ_T_high');
    
    };

    mixture.avg = function (prop, parent) {

      return this.reduce(function (a, b) {
        return a + (parent === undefined ? b.vars[prop] : b.vars[parent][prop]); 
      }, 0) / this.length;

    };

    mixture.sum = function (prop, parent) {

      return this.reduce(function (a, b) {
        return a + (parent === undefined ? b.vars[prop] : b.vars[parent][prop]); 
      }, 0);

    };

    /* mixture variables */

    mixture.f_r = []; /* root fraction per species and soil layer */
    mixture.f_r_sum = [];  /* root fraction sum per species TODO: find a way to avoid keeping the sum */
    mixture.W_r = [];  /* root kg DM m-2 per species and soil layer */
    mixture.W_r_sum = []; /* root kg DM m-2 sum per soil layer */
    mixture.N_up = []; /* N uptake kg N m-2 per species and soil layer */
    mixture.N_up_sum = []; /* N uptake kg N m-2 per soil layer */
    mixture.E_T = []; /* actual transpiration per species and layer */
    mixture.E_T_sum = [];  /* actual transpiration per species */
    mixture.f_g = 0;   /* soil coverage */
    mixture.isRegrowth = false; /* tracks if mixture has been harvested */

    return mixture;

  }; // Mixture end

  /* initialization of Species & Mixture */
  var spec = [], dm = [];
  for (var s = 0; s < species.length; s++) {

    spec.push(
      new Species({
        type: species[s].type,
        constants: species[s].constants
      })
    );
    dm.push(species[s].dryMatter);

    spec[s].cons.index = s;
  
  }

  this.mixture = new Mixture(spec, { DM: dm });
  
  this.seedDate = function () {
    return this._seedDate;
  };
  this.harvestDate = function () {
    return new Date(Infinity);
  };
  this.getCuttingDates = function () {
    return [];
  };
  this.name = function () {
    return 'grassland';
  };
  this.isValid = function () {
    return true;
  };
  this.type = 'grassland';
};


/*
  LICENSE

  The MIT License (MIT)
  Copywrite (c) 2015 Jan Vaillant (jan.vaillant@zalf.de)


  REFERENCES

  Johnson IR (2008). Biophysical pasture model documentation: model documentation for DairyMod. EcoMod and the SGS Pasture
  Model. (IMJ Consultants: Dorrigo, NSW)

  Johnson IR (2013). DairyMod and the SGS Pasture Model: a mathematical description of the biophysical model structure.
  IMJ Consultants, Dorrigo, NSW, Australia.


  TODO

  - fix P_g. There is a small difference in P_g and P_g_mix. Check initial lai layer depth.
  - tests with N-Ireland ryegrass data suggest that growthg is systematically under-(over)-estimated in spring (autum).
    Potential solution: There is currently no ("locked") pool to accumulate reserves in autum stored in roots (or in 
    case of clover above the root) that will be released in spring to support initial growth.
  - for consistency remove NH4 uptake (implemented in SGS) because it is not implemented in MONICA's crops 


  README

  Important (somewhat experimental) deviations from the original approach:

  - Added a homogeneity factor to capture the homogeneity of the sward and avoid the complete disappearence of species due
    to light interception (competition).
  - Added a coverage factor that captures how much of a sqm is covered by a species to avoid inconsistencies in the height 
    calculations
*/

var GrasslandGrowth = function (sc, gps, mixture, stps, cpp) { // takes additional grassland param
  'use strict';

  var soilColumn = sc
    , generalParams = gps
    , centralParameterProvider = cpp
    , numberOfSpecies = mixture.length
    , vs_NumberOfLayers  = sc.vs_NumberOfLayers()
    , vs_NumberOfOrganicLayers  = sc.vs_NumberOfOrganicLayers()
    , vs_LayerThickness = soilColumn.vs_LayerThickness()
    , vs_Latitude  = stps.vs_Latitude
    , vs_HeightNN = stps.vs_HeightNN
    , vc_InterceptionStorage = 0.0
    , vc_accumulatedETa = 0
    , pc_NitrogenResponseOn = gps.pc_NitrogenResponseOn
    , waterDeficitResponseOn = gps.pc_WaterDeficitResponseOn
    , lowTemperatureStressResponseOn = gps.pc_LowTemperatureStressResponseOn
    , highTemperatureStressResponseOn = gps.pc_HighTemperatureStressResponseOn
    , vc_NetPrecipitation = 0
    , vc_InterceptionStorage = 0
    , vc_ReferenceEvapotranspiration = 0
    , vc_RemainingEvapotranspiration = 0
    , vc_EvaporatedFromIntercept = 0
    , vc_KcFactor = 0.4 // TODO: source?
    ;

  /* initialize arrays */
  for (var s = 0; s < numberOfSpecies; s++) {
    mixture.f_r[s] = [];
    mixture.W_r[s] = [];
    mixture.N_up[s] = [];
    mixture.E_T[s] = [];
    mixture.f_r_sum[s] = 0;
    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      mixture.f_r[s][i_Layer] = 0;
      mixture.W_r[s][i_Layer] = 0;
      mixture.N_up[s][i_Layer] = 0;
      mixture.E_T[s][i_Layer] = 0;
    }
  }
  for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
    mixture.W_r_sum[i_Layer] = 0;
    mixture.N_up_sum[i_Layer] = 0;
  }


  /*
    (3.58ff) cumulative low temperature stress function 

    T     [C°]  mean daily temperature
    T_mn  [C°]  minimum daily temperature
    T_mx  [C°]  maximum daily temperature
  */
  
  function highAndLowTempStress(T, T_mn, T_mx) {
    
    for (var s = 0; s < numberOfSpecies; s++) {

      var species = mixture[s]
        , vars = species.vars
        , cons = species.cons
        , T_mn_high = cons.T_mn_high
        , T_mn_low = cons.T_mn_low
        , T_mx_high = cons.T_mx_high
        , T_mx_low = cons.T_mx_low
        , ξ_T_low = 1.0               // [0-1]  low temperature stress coefficient      
        , ξ_T_high= 1.0               // [0-1]  low temperature stress coefficient     
        ;

      /* low temp. stress and recovery */
      if (lowTemperatureStressResponseOn) {
        if (T_mn < T_mn_high) {
        
          if (T_mn <= T_mn_low)
            ξ_T_low = 0;
          else
            ξ_T_low = (T_mn - T_mn_low) / (T_mn_high - T_mn_low);

          vars.τ_T_low *= ξ_T_low;
        
        } else {

          vars.ζ_T_low += T / cons.T_sum_low;
          vars.τ_T_low = min(1, vars.τ_T_low + vars.ζ_T_low);
          if (vars.τ_T_low === 1) // full recovery
            vars.ζ_T_low = 0;
        
        }
      }

      /* heigh temp. stress and recovery */
      if (highTemperatureStressResponseOn) {
        if (T_mx > T_mx_low) {
        
          if (T_mx >= T_mx_high)
            ξ_T_high = 0;
          else
            ξ_T_high = (T_mx - T_mx_low) / (T_mx_high - T_mx_low);

          vars.τ_T_high *= ξ_T_high;
        
        } else {

          vars.ζ_T_high += max(0, 25 - T) / cons.T_sum_high;
          vars.τ_T_high = min(1, vars.τ_T_high + vars.ζ_T_high);
          if (vars.τ_T_high === 1) // full recovery
            vars.ζ_T_high = 0;
        
        }
      }

    }

  } // highAndLowTempStress


  /*
    Daily canopy gross photosynthesis in response to irradiance
    
    P_g_day       [kg (C) m-2 d-1]  gross photosynthesis

    T             [C°]              mean daily temperature
    T_mn          [C°]              minimum daily temperature
    T_mx          [C°]              maximum daily temperature
    PPF           [μmol m-2 d-1]    photosynthetic photon flux
    τ             [s]               daylength
    C_amb         [μmol mol-1]      CO2 concentration
    f_s           [-]               fraction direct solar radiation
  */  
  function grossPhotosynthesis(T, T_mn, T_mx, PPF, τ, C_amb, f_s) {

     var P_g_day_mix = [];
     var P_g_day = [];
     /* (1 - mixture.homogeneity) LAI covers (1 - mixture.homogeneity) / numberOfSpecies m-2 */
     var L_scale = (numberOfSpecies === 1 ? 1 : (1 - mixture.homogeneity) / ((1 - mixture.homogeneity) / numberOfSpecies));

    /*
      (4.8b) Diurnal variation (distribution) in irradiance (I) and temperature (T) 
      This is a simplified calculation from Johnson 2005 (2008). Could be any distribution.

      R_s = PPF

      maximum irradiance within a day for 1/2 τ
      I_mx = 4/3 * R_s/τ
      irradiance during in- and decreasing irradiance within a day = 1/2 I_mx
      I_mn = 1/2 I_mx = 2/3 * R_s/τ

      R_s = (1/2 * τ * I_mx) + (x * τ * 1/2 * I_mx)
      R_s = (2/3 * R_s) + (x * 2/3 * R_s) <=> x = 1/2
      R_s = (1/2 * τ * I_mx) + (1/4 * τ * I_mx) <=> τ/2 * (I_mx + I_mx/2) <=> τ/2 * (I_mx + I_mn)

      temperature during max. irradiance within a day  
      T_I_mx = (T_mx + T_mean) / 2
      temperature during 1/2 max. irradiance within a day
      T_I_mn = T_mean

      (τ / 2) * P_g(I_mx, T_I_mx, N) [mg CO2 m-2 day-1] daily gross photosynthesis during max irradiance
      (τ / 2) * P_g(I_mn, T_I_mn, N) [mg CO2 m-2 day-1] daily gross photosynthesis during min irradiance
    */

    var I_mx = (4 / 3) * (PPF / τ)
      , I_mn = (1 / 2) * I_mx
      , T_I_mx = (T_mx + T) / 2
      , T_I_mn = T
      ;

    /* TODO: implement homogeneity */
    if (numberOfSpecies > 1) { 

      // array
      P_g_day_mix = P_g_mix(I_mx, I_mn, T_I_mx, T_I_mn, f_s, C_amb);
      if (mixture.homogeneity < 1)
        P_g_day = P_g(I_mx, I_mn, T_I_mx, T_I_mn, f_s, C_amb, L_scale);
      // if (DEBUG) {
      //   debug('P_g_day', P_g_day);
      //   for (var s = 0; s < numberOfSpecies; s++) {
      //     if (sum(P_g_day) / numberOfSpecies != P_g_day[s])
      //       throw new Error ('sum(P_g_day) / numberOfSpecies != P_g_day[s]');
      //   }
      // }

      /* iterate over mixture array */
      for (var s = 0; s < numberOfSpecies; s++) {

        var vars = mixture[s].vars
          , GLF = vars.Ω_water * sqrt(vars.Ω_N) * vars.τ_T_low * vars.τ_T_high // combined growth limiting factors
          ;

        /* (3.37) conversion of μmol CO2 to mol (1e-6) and mol CO2 to kg C (0.012) mixture[s].vars.Ω_water * sqrt(mixture[s].vars.Ω_N) missing in Johnson (2013) */
        mixture[s].vars.P_g_day = (44 * 12 / 44 * 1e-3) * 1e-6 * (τ / 2) * P_g_day_mix[s] * GLF * mixture.homogeneity;
        if (mixture.homogeneity < 1)
          mixture[s].vars.P_g_day += (44 * 12 / 44 * 1e-3) * 1e-6 * (τ / 2) * P_g_day[s] * GLF / L_scale * (1 - mixture.homogeneity);

      }

    } else {

      P_g_day = P_g(I_mx, I_mn, T_I_mx, T_I_mn, f_s, C_amb, L_scale);
      // P_g_day = P_g_mix(I_mx, I_mn, T_I_mx, T_I_mn, f_s, C_amb);

      var vars = mixture[0].vars
        , GLF = vars.Ω_water * sqrt(vars.Ω_N) * vars.τ_T_low * vars.τ_T_high // combined growth limiting factors
        ;

      /* (3.37) conversion of μmol CO2 to mol (1e-6) and mol CO2 to kg C (0.012) Ω_water missing in Johnson (2013) */
      mixture[0].vars.P_g_day = (44 * 12 / 44 * 1e-3) * 1e-6 * (τ / 2) * P_g_day[0] * GLF;

    }

    /*
      (1.16) CO2 response function
  
      Takes unity at C_amb_ref, λ at double C_amb_ref and f_C_m at C -> ∞
  
      TODO: calculation of parameters required only once: move somewhere else 
      
      f_C   [-]           scale factor
      C     [μmol mol-1]  ambient CO2 concentration
      λ     [-]           f_C at double C_amb_ref
      f_C_m [-]           f_C at saturating C
    */
    
    function f_C(C, λ, f_C_m) {
  
      // check (1.21)
      if (f_C_m >= λ / (2 - λ)) {
        f_C_m = λ / (2 - λ) - 1e-10; // make sure it is smaller
        logger(MSG.WARN, 'Adjusted f_C_m to ' + f_C_m + ' since f_C_m >= λ / (2 - λ)');
      }
  
      var f_C = 1
        , C_amb_ref = 380
        , Φ = (f_C_m * (λ * (f_C_m - 1) - 2 * (f_C_m - λ))) / (pow(λ, 2) * (f_C_m - 1) - 2 * (f_C_m - λ))
        , β = (λ * (f_C_m - Φ * λ)) / (2 * C_amb_ref * (f_C_m - λ))
        ;
  
      f_C = 1 / (2 * Φ) * (β * C + f_C_m - sqrt(pow(β * C + f_C_m, 2) - 4 * Φ * β * f_C_m * C));
  
      return f_C;
  
    }


    /*
      (3.14) N response function

      f_N [kg (N) kg-1 (C)] nitrogen fraction

      TODO: use species.cons.N_ref
    */

    function f_Pm_N(f_N, f_N_ref) {

      return min(1, f_N / f_N_ref); 

    }


    /*
      (3.16 ff) Combiend T & CO2 response function

      T   [°C]
      C_amb [μmol mol-1]  ambient CO2 concentration
    */

    function f_Pm_TC(T, C_amb, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) {

      var f_Pm_TC = 0
        , q = 2 // TODO: value? (vgl. S. 12, Johnson 2013)
        , T_opt_Pm = T_opt_Pm_amb + γ_Pm * (f_C(C_amb, λ, f_C_m) - 1)
        , T_mx = ((1 + q) * T_opt_Pm - T_mn) / q
        ;

      /* (1.40) constrain */
      if (T_ref > T_opt_Pm)
        T_ref = T_opt_Pm;

      /* C4 species constraint ..  "so that the temperature response does not fall when temperatures exceed the optimum." S. 45 */
      T  = (isC4 && T > T_opt_Pm) ? T_opt_Pm : T; 

      if (T <= T_mn || T >= T_mx)
        f_Pm_TC = 0;
      else
        f_Pm_TC = pow((T - T_mn) / (T_ref - T_mn), q) * (((1 + q) * T_opt_Pm - T_mn - q * T) / ((1 + q) * T_opt_Pm - T_mn - q * T_ref));

      return f_Pm_TC; 

    }


    /*
      (3.25 ff) Combiend T & CO2 response function

      T   [°C]
      CO2 [μmol mol-1]  ambient CO2 concentration
    */

    function f_α_TC(T, C_amb, λ_α, γ_α, λ, f_C_m) {

      var f_α_TC = 0
        , C_amb_ref = 380
        , T_opt_α = 15 + γ_α * (f_C(C_amb, λ, f_C_m) - 1)
        ;

      f_α_TC = (T < T_opt_α) ? 1 : (1 - λ_α * (C_amb_ref / C_amb) * (T - T_opt_α));  

      return f_α_TC; 

    }


    /*
      (3.29) N response function

      f_N [kg (N) kg-1 (C)] nitrogen fraction
    */

    function f_α_N(f_N, f_N_ref) {

      var f_α_N = 0;

      f_α_N = (f_N > f_N_ref) ? 1 : (0.5 + 0.5 * (f_N / f_N_ref));

      return f_α_N; 

    }

    
    /*
      P_l [μmol (CO2) m-2 (leaf) s-1] rate of single leaf gross photosynthesis in response to incident PPF
      I   [μmol (photons) m-2 s-1]    incident solar radiation
      T   [°C]                        temperature  
      N
      C   []  ambient CO2
      α   []
      P_m []
    */
    
    function P_l(I_l, α, P_m, ξ) {

      var P_l = 0; 

      P_l = 1 / (2 * ξ) * (α * I_l + P_m - sqrt(pow(α * I_l  + P_m, 2) - 4 * ξ * α * I_l * P_m));

      return P_l;

    }

    
    /*
      (3.33, 3.101 ff) Canopy gross photosynthesis in mixed swards including photorespiration

      P_g [μmol (CO2) m-2 s-1]      instantaneous canopy gross photosynthesis
      
      I_0 [μmol (photons) m-2 s-1]  incident solar radiation on the canopy
      T   [°C]                      temperature
      f_s [-]                       fraction direct solar radiation
      C_amb
    */
    
    function P_g_mix(I_mx, I_mn, T_I_mx, T_I_mn, f_s, C_amb) {

      var P_g = [] // return values 
        , δL = mixture.δL
        , n_L = mixture.n_L()
        , n_start_p = mixture.n_start_p(n_L) // array
        , δL_p = mixture.δL_p(n_start_p, n_L)
        , δL_i = mixture.δL_i(n_start_p, n_L, δL_p)
        , k_e_i = mixture.k_e_i(n_L, n_start_p, δL_p)
        , α_mx = []
        , α_mn = []
        , P_m_mx = []
        , P_m_mn = []
        , ξ = []
        , k = []
        ;

      var I_s_mx = I_mx * f_s
        , I_s_mn = I_mn * f_s
        , I_d_mx = I_mx * (1 - f_s)
        , I_d_mn = I_mn * (1 - f_s)
        ;

      /* iterate over species */
      for (var s = 0; s < numberOfSpecies; s++) {

        P_g[s] = 0;

        var species = mixture[s] 
          , cons = species.cons
          , photo = cons.photo
          , α_amb_15 = photo.α_amb_15
          , P_m_ref = photo.P_m_ref
          , isC4 = species.isC4
          , λ_α = photo.λ_α
          , γ_α = photo.γ_α
          , γ_Pm = photo.γ_Pm // TODO: value?
          , T_mn = photo.T_mn
          , T_ref = photo.T_ref
          , T_opt_Pm_amb = photo.T_opt_Pm_amb
          , λ = photo.λ
          , f_C_m = photo.f_C_m
          , f_N = species.N_live_leaf() / species.C_live_leaf() // TODO: canopy or leaf?
          , f_N_ref = cons.N_leaf.ref
          ;

        k[s] = photo.k;
        ξ[s] = photo.ξ;

        /* (3.23) Photosynthetic efficiency, α */
        if (isC4) {
          α_mx[s] = a_mn[s] = α_amb_15 * f_C(C_amb, λ, f_C_m) * f_α_N(f_N, f_N_ref);
        } else {
          α_mx[s] = α_amb_15 * f_C(C_amb, λ, f_C_m) * f_α_TC(T_I_mx, C_amb, λ_α, γ_α, λ, f_C_m) * f_α_N(f_N, f_N_ref);
          α_mn[s] = α_amb_15 * f_C(C_amb, λ, f_C_m) * f_α_TC(T_I_mn, C_amb, λ_α, γ_α, λ, f_C_m) * f_α_N(f_N, f_N_ref);
        }

        /* (3.8) Light saturated photosynthesis, P_m. TODO: why not related to light extiction (exp(-kl)) any more? */
        P_m_mx[s] = P_m_ref * f_C(C_amb, λ, f_C_m) * f_Pm_TC(T_I_mx, C_amb, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) * f_Pm_N(f_N, f_N_ref);
        P_m_mn[s] = P_m_ref * f_C(C_amb, λ, f_C_m) * f_Pm_TC(T_I_mn, C_amb, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) * f_Pm_N(f_N, f_N_ref);

      } // for s

      /*  
          numerical integration:
        - iterate through the depth of the canopy of species.
        - if a new species appears in layer i (i >= n_start_p[s]) LAI increment 
          increases by δL_p and k_e_i (weighted k) changes
        - the fraction of leafs in direct light declines through the depth of 
          the canopy: exp(-k * l). The fraction in diffuse light increases: 1 - exp(-k * l)
        - the fraction in direct light is always also in diffuse light (2.21) 
      */

      var I_s_l_mx = 0
        , I_s_l_mn = 0
        , I_d_l_mx = 0
        , I_d_l_mn = 0
        , L_s = 1
        , L_d = 0
        ;

      /* iterate over leaf area layers */
      for (var i = 1; i <= n_L; i++) {


        /* include species s in integeration if s has occured in layer i */
        for (var s = 0; s < numberOfSpecies; s++) {
          
          if (n_start_p[s] <= i) {

            I_s_l_mx = k[s] * (I_s_mx + I_d_mx);
            I_s_l_mn = k[s] * (I_s_mn + I_d_mn);
            I_d_l_mx = k[s] * I_d_mx;
            I_d_l_mn = k[s] * I_d_mn;

            P_g[s] += P_l(I_s_l_mx, α_mx[s], P_m_mx[s], ξ[s]) * L_s * δL_p[s];
            P_g[s] += P_l(I_s_l_mn, α_mn[s], P_m_mn[s], ξ[s]) * L_s * δL_p[s];
            P_g[s] += P_l(I_d_l_mx, α_mx[s], P_m_mx[s], ξ[s]) * L_d * δL_p[s];
            P_g[s] += P_l(I_d_l_mn, α_mn[s], P_m_mn[s], ξ[s]) * L_d * δL_p[s];

          } // if s in i

        
        } // for s

        /* diffuse light at layer i+1 */
        I_d_mx = I_d_mx * (1 - k_e_i[i] * δL_i[i]);
        I_d_mn = I_d_mn * (1 - k_e_i[i] * δL_i[i]);

        /* fraction leaves in direct light */
        L_s = L_s * (1 - k_e_i[i] * δL_i[i]);
        /* fraction leaves only in diffuse light */
        L_d = 1 - L_s;

      } // for i

      return P_g;
      
    } // P_g_mix


    function P_g(I_mx, I_mn, T_I_mx, T_I_mn, f_s, C_amb, L_scale) {

      var P_g = []; // return values 

      /* iterate over species */
      for (var s = 0; s < numberOfSpecies; s++) {

        P_g[s] = 0;

        var species = mixture[s] 
          , cons = species.cons
          , photo = cons.photo
          , α_amb_15 = photo.α_amb_15
          , P_m_ref = photo.P_m_ref
          , k = photo.k
          , isC4 = species.isC4
          , α = 0
          , P_m = 0
          , ξ = photo.ξ
          , λ_α = photo.λ_α
          , γ_α = photo.γ_α
          , γ_Pm = photo.γ_Pm
          , T_mn = photo.T_mn
          , T_ref = photo.T_ref
          , T_opt_Pm_amb = photo.T_opt_Pm_amb
          , λ = photo.λ
          , f_C_m = photo.f_C_m
          , f_N = species.f_N_live_leaf()
          , f_N_ref = cons.N_leaf.ref
          , LAI = species.L() * L_scale
          ;

        /* (3.23) Photosynthetic efficiency, α */
        var α_mx = α_amb_15 * f_C(C_amb, λ, f_C_m) * f_α_N(f_N, f_N_ref);
        var α_mn = α_amb_15 * f_C(C_amb, λ, f_C_m) * f_α_N(f_N, f_N_ref);
        if (!isC4) {
          α_mx = α_mx * f_α_TC(T_I_mx, C_amb, λ_α, γ_α, λ, f_C_m);
          α_mn = α_mx * f_α_TC(T_I_mn, C_amb, λ_α, γ_α, λ, f_C_m);
        }

        /* (3.8) Light saturated photosynthesis, P_m. TODO: why not related to light extiction (exp(-kl)) any more? */
        var P_m_mx = P_m_ref * f_C(C_amb, λ, f_C_m) * f_Pm_TC(T_I_mx, C_amb, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) * f_Pm_N(f_N, f_N_ref);
        var P_m_mn = P_m_ref * f_C(C_amb, λ, f_C_m) * f_Pm_TC(T_I_mn, C_amb, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) * f_Pm_N(f_N, f_N_ref);

        var Δ_l = 0.1;
        var n = LAI / Δ_l;

        for (var i = 1; i <= n; i++) {
          
          var l_i = (2 * i - 1) * Δ_l / 2;
          
          /* direct (s) and diffuse (d) radiation */
          var I_l_mx_s = k * I_mx * (f_s + (1 - f_s) * exp(-k * l_i));
          var I_l_mx_d = k * I_mx * (1 - f_s) * exp(-k * l_i);
          var I_l_mn_s = k * I_mn * (f_s + (1 - f_s) * exp(-k * l_i));
          var I_l_mn_d = k * I_mn * (1 - f_s) * exp(-k * l_i);
          
          P_g[s] += P_l(I_l_mx_s, α_mx, P_m_mx, ξ) * exp(-k * l_i) * Δ_l;
          P_g[s] += P_l(I_l_mx_d, α_mx, P_m_mx, ξ) * (1 - exp(-k * l_i)) * Δ_l;
          P_g[s] += P_l(I_l_mn_s, α_mn, P_m_mn, ξ) * exp(-k * l_i) * Δ_l;
          P_g[s] += P_l(I_l_mn_d, α_mn, P_m_mn, ξ) * (1 - exp(-k * l_i)) * Δ_l;
          
        }

      } // for s

      return P_g;

    } // P_g

  } // grossPhotosynthesis


  /* 
    Daily carbon fixation

    requires: N [kg m-2] availability from uptake, remobilization and fixation

    - reduce gross assimilates by maintenance respiration and N uptake&fixation cost
    - if gross assilmilates are not sufficient to satisfy bowth i.e. P_growth < 0 reduce
      non-structrural C pools

    TODO: N-response switch


  */
  function netPhotosynthesis(T) {

    /* iterate over mixture array */
    for (var s = 0, ps = numberOfSpecies; s < ps; s++) {

      var species = mixture[s]
        , vars = species.vars
        , cons = species.cons
        , f_N = species.f_N_live_shoot()
        , P_g_day = vars.P_g_day
        , C_total = species.C_live_shoot() + species.C_root()
        , N_avail = species.vars.N_avail
        , isC4 = species.isC4
        ;

      // vars.R_m = R_m(T, species.N_live_shoot() / species.C_live_shoot(), cons.N_leaf.ref, C_total);
      var C_live_leaf = species.C_live_leaf()
        , N_live_leaf = species.N_live_leaf()
        , C_live_stem = species.C_live_stem()
        , N_live_stem = species.N_live_stem()
        , C_root = species.C_root()
        , N_root = species.N_root()
        ;
      vars.R_m = R_m(T, N_live_leaf / C_live_leaf, cons.N_leaf.ref, C_live_leaf);
      vars.R_m += R_m(T, N_live_stem / C_live_stem, cons.N_leaf.ref * 0.5, C_live_stem);
      // vars.R_m += R_m(T, N_root / C_root, cons.N_leaf.ref * 0.5, C_root); // TODO: root maint. resp.?

      vars.R_N = R_N(species.vars.N_up, species.vars.N_fix);
      
      /*(3.57) Gross assimilation P_g_day adjusted for maintenance respiration, 
      respiratory costs of nitrogen uptake and fixation. Use R_N from previous day (circularity) */
      var P_growth = P_g_day - vars.R_m - vars.R_N;

      if (P_growth > 0) {

        /* update partitioning coefficients */
        var ρ_l = vars.ρ_l
          , ρ_s = 1 - ρ_l
          , ρ_shoot = cons.part.ρ_shoot_ref * sqrt(vars.Ω_water * vars.Ω_N) /* based on previous day values! */
          , ρ_root = 1 - ρ_shoot
          , N_req = 0
          , N_assim = 0 // sum all organs [kg N m-2]
          , N_ref_opt = cons.N_leaf.opt
          , N_ref_max = cons.N_leaf.max
          ;

        vars.ρ_shoot = ρ_shoot;
        vars.ρ_root = ρ_root;

        /* 
          now update N_up & N_fix 
          move remobilized N to protein pool of live tissuse: This will increase tissue N conc.

          if N conc. for any tissue is below opt. then allow for max. N assimilation otherwise utilize available N up to N opt.
          
          TODO:
            - is there any N uptake f P_growth <= 0?
            - how to partition available N between organs? If any is below a minimum serve this orgen first? 
        */

        /* calculate current tissue N conc. of live tissue [kg (N,protein) kg-1 (C, live tissue)]*/
        var f_N_live = {
          leaf: species.N_live_leaf() / species.C_live_leaf(),
          stem: species.N_live_stem() / species.C_live_stem(),
          root: species.N_root() / species.C_root()
        };

        var ordering = [
          { organ: LEAF, N: f_N_live.leaf / N_ref_opt },
          { organ: SHOOT, N: f_N_live.stem / (N_ref_opt * 0.5) }, 
          { organ: ROOT, N: f_N_live.root / (N_ref_opt * 0.5) } 
        ];

        /* sort in ascending order by N level */
        ordering.sort(function (a, b) {
          return a.N - b.N;
        });

        var N_up_pool = sum(mixture.N_up[s]);

        /* distribute available N uptake till depleted or N requirements met */
        for (var organ = 0; organ < 3; organ++) {
          
          var ρ = 0 // partitioning coefficent
            , f_sc = 0
            , f_pn = 0
            , N_ref_opt_organ = 0
            ; 

          if (ordering[organ].organ === LEAF) {

            ρ = ρ_shoot * ρ_l;
            f_sc = 0.50; // fix stucture fraction [kg (C,structure) kg-1 (C,tissue)]
            N_ref_opt_organ = N_ref_opt;
            f_pn = N_ref_max / fN_pn * fC_pn;
          
          } else if (ordering[organ].organ === SHOOT) {
            
            ρ = ρ_shoot * ρ_s;
            f_sc = 0.70; // fix stucture fraction [kg (C,structure) kg-1 (C,tissue)]
            N_ref_opt_organ = N_ref_opt * 0.5;
            f_pn = (N_ref_max * 0.5) / fN_pn * fC_pn;
          
          } else if (ordering[organ].organ === ROOT) {

            ρ = ρ_root;
            f_sc = 0.70; // fix stucture fraction [kg (C,structure) kg-1 (C,tissue)]
            N_ref_opt_organ = N_ref_opt * 0.5;
            f_pn = (N_ref_max * 0.5) / fN_pn * fC_pn;
          
          }

          if (DEBUG) {
            if (f_sc + f_pn > 1)
              throw new Error('f_sc + f_pn > 1');
          }

         /* calculate required N if tissue tries to assimilate up to max. N */
          var f_nc = 1 - (f_sc + f_pn)
            , Y = 1 / (1 + (1 - Y_sc) / Y_sc * f_sc + (1 - Y_nc) / Y_nc * f_nc + (1 - Y_pn) / Y_pn * f_pn)
            , C_assimilated = Y * P_growth * ρ /* [kg (C) m-2] */
            , N_assimilated = C_assimilated * f_pn * fN_pn / fC_pn /* [kg (N) m-2] */
            ;

          if (N_assimilated > N_up_pool)  {
            /* TODO: find a better implementation as such that a re-calculation of f_pn is not necessary.
              The idea here is that if N is limited the sc and nc fractions are increased (f_sc += 0.8 * (f_pn_old - f_pn)).
              It is unclear if this is a good representation of the underlying physiology but the result is satisfying in terms
              of typical observations in pastures during summer: high growth rates -> insufficient N uptake -> lower protein content -> 
              higher nc and ndf content */ 

            // for legumes assume a fall back to a minimum of N.opt instead of N.max and satisfy missing N form fixation
            // TODO: move legumes to the end of mixture array

            // recalculate C_assimilated with f_pn exactly depleting N_up_pool; sc is fixed
            // f_pn = (N(available) / (Y(f_sc,f_pn) * P)) * (fC_pn / fN_pn) -> solved for f_pn
            var f_pn_old = f_pn;
            f_pn = (
              (N_up_pool * (fC_pn / fN_pn) * Y_pn * (-f_sc * Y_sc + f_sc * Y_nc + Y_sc)) /
              (Y_sc * (N_up_pool * (fC_pn / fN_pn) * (Y_pn - Y_nc) + (P_growth * ρ) * Y_pn * Y_nc))
            );
            
            f_sc += 0.8 * (f_pn_old - f_pn);

            f_pn = (
              (N_up_pool * (fC_pn / fN_pn) * Y_pn * (-f_sc * Y_sc + f_sc * Y_nc + Y_sc)) /
              (Y_sc * (N_up_pool * (fC_pn / fN_pn) * (Y_pn - Y_nc) + (P_growth * ρ) * Y_pn * Y_nc))
            );

            f_nc = 1 - (f_sc + f_pn);

            if (DEBUG) {
              if (f_sc + f_pn > 1) {
                debug('f_sc', f_sc);
                debug('f_pn', f_pn);
                debug('f_nc', f_nc);
                throw new Error('x f_sc + f_pn > 1');
              }
            }

            Y = 1 / (1 + (1 - Y_sc) / Y_sc * f_sc + (1 - Y_nc) / Y_nc * f_nc + (1 - Y_pn) / Y_pn * f_pn);
            C_assimilated = Y * P_growth * ρ; /* [kg (C) m-2] */
            N_assimilated = C_assimilated * f_pn * fN_pn / fC_pn;

            if (DEBUG) {
              if (roundN(10, N_assimilated) != roundN(10, N_up_pool))
                throw new Error(N_assimilated != N_up_pool);
            }

            N_up_pool = 0;

          } else {
            N_up_pool -= N_assimilated;
          }

          // only up to N_opt. No compensation if an organ (due to a low initial N conc.) consumes above N_opt
          N_req += (N_assimilated === 0) ? N_ref_opt_organ * C_assimilated : min(N_ref_opt_organ * C_assimilated, N_assimilated); 
          N_assim += N_assimilated;

          // update variables
          if (ordering[organ].organ === LEAF) {
            vars.Y_leaf = Y;
            vars.G_leaf = C_assimilated;
            // update composition of new growth to leaf
            vars.G_l_fC_om.sc = f_sc;
            vars.G_l_fC_om.nc = f_nc;
            vars.G_l_fC_om.pn = f_pn;
          } else if (ordering[organ].organ === SHOOT) {
            vars.Y_stem = Y;
            vars.G_stem = C_assimilated;
            // update composition of new growth to stem
            vars.G_s_fC_om.sc = f_sc;
            vars.G_s_fC_om.nc = f_nc;
            vars.G_s_fC_om.pn = f_pn;
          } else if (ordering[organ].organ === ROOT) {
            vars.Y_root = Y;
            vars.G_root = C_assimilated;
            // update composition of new growth to root
            vars.G_r_fC_om.sc = f_sc;
            vars.G_r_fC_om.nc = f_nc;
            vars.G_r_fC_om.pn = f_pn;
          }

        } // for each organ

        // TODO: dont forget to account for remob and fixation here!
        vars.Ω_N = pc_NitrogenResponseOn ? min(1, N_assim / N_req) : 1;
        vars.N_assim = N_assim;
        vars.N_req = N_req;
        vars.G = vars.G_leaf + vars.G_stem + vars.G_root;

        /* additional protein synthesis (not growth) if N_up_pool still > 0 */
        vars.N_ass_add = 0;
        var fN_ass_add = 0.1;
        for (var organ = 0; organ < 3; organ++) {
        
          if (N_up_pool > 0) {
            
            if (ordering[organ].organ === LEAF && f_N_live.leaf < N_ref_opt) {

              var N_req_add = fN_ass_add * (N_ref_opt - f_N_live.leaf) * species.C_live_leaf();
              var N_ass_add = min(N_req_add, N_up_pool);
              var C_req_add = (N_ass_add / fN_pn * fC_pn) * 1 / Y_pn;
              if (C_req_add > vars.NC.l) { /* req. C for PN synthesis should not exceed avail. C from NC pool */ 
                N_ass_add = vars.NC.l * fN_pn * Y_pn / fC_pn;
                C_req_add = vars.NC.l;
              }
              vars.NC.l -= C_req_add;
              vars.PN.l += N_ass_add / fN_pn * fC_pn;
              N_up_pool -= N_ass_add;
              vars.N_assim += N_ass_add;
              vars.N_ass_add += N_ass_add;

            } else if (ordering[organ].organ === SHOOT && f_N_live.stem < N_ref_opt * 0.5) {

              var N_req_add = fN_ass_add * (N_ref_opt * 0.5 - f_N_live.stem) * species.C_live_stem();
              var N_ass_add = min(N_req_add, N_up_pool);
              var C_req_add = (N_ass_add / fN_pn * fC_pn) * 1 / Y_pn;
              if (C_req_add > vars.NC.s) {  /* req. C for PN synthesis should not exceed avail. C from NC pool */
                N_ass_add = vars.NC.s * fN_pn * Y_pn / fC_pn;
                C_req_add = vars.NC.s;
              }
              vars.NC.s -= C_req_add;
              vars.PN.s += N_ass_add / fN_pn * fC_pn;
              N_up_pool -= N_ass_add;
              vars.N_assim += N_ass_add;
              vars.N_ass_add += N_ass_add;
            
            } else if (ordering[organ].organ === ROOT && f_N_live.root < N_ref_opt * 0.5) {

              var N_req_add = fN_ass_add * (N_ref_opt * 0.5 - f_N_live.root) * species.C_root();
              var N_ass_add = min(N_req_add, N_up_pool);
              var C_req_add = (N_ass_add / fN_pn * fC_pn) * 1 / Y_pn;
              if (C_req_add > vars.NC.r) { /* req. C for PN synthesis should not exceed avail. C from NC pool */ 
                N_ass_add = vars.NC.r * fN_pn * Y_pn / fC_pn;
                C_req_add = vars.NC.r;
              }
              vars.NC.r -= C_req_add;
              vars.PN.r += N_ass_add / fN_pn * fC_pn;
              N_up_pool -= N_ass_add;
              vars.N_assim += N_ass_add;
              vars.N_ass_add += N_ass_add;
            
            }
          }
        }

      } else { // no growth: assimilates are not sufficent for respiratory costs 

        // TODO: e.g. (P_growth * NC.l / NC_p) > NC.l ? accelerate flux to dead?
        // TODO: what if nc pool is empty?

        var NC = vars.NC
          , NC_pool = NC.l + NC.s + NC.r
          ;

        /* reduce nc pools by share as long as non-structural pool > 0 */
        if (NC_pool > 0) {
          if (NC.l > 0)
            NC.l = max(0, NC.l + (P_growth * NC.l / NC_pool));
          if (NC.s > 0)
            NC.s = max(0, NC.s + (P_growth * NC.s / NC_pool));
          if (NC.r > 0)
            NC.r = max(0, NC.r + (P_growth * NC.r / NC_pool));
        }

        species.vars.Ω_N = 1;
        species.vars.N_assim = 0;
        species.vars.N_req = 0;
        vars.G = vars.G = vars.G_leaf = vars.G_stem = vars.G_root = 0;

      }

    }


    /*
      (3.41 ff) Maintenance respiration

      R_m [kg (C) m-2 d-1]

      m_ref   [d-1] maintenance coefficient at reference temperature and N content
      T_ref   [°C]   

    */
    
    function R_m(T, f_N, f_N_ref, W) {

      var R_m = 0
        , m_ref = cons.resp.m_ref
        ;
      
      R_m =  m_ref * f_m(T) * (f_N / f_N_ref) * W;

      return R_m;
      
    }


    /*
      (3.44) Maintenance temperature response
    */

    function f_m(T) {

      var f_m = 1
        , T_m_mn = cons.resp.T_m_mn
        , T_ref = cons.resp.T_ref
        ;

      f_m = (T <= T_m_mn) ? 0 : (T - T_m_mn) / (T_ref - T_m_mn);

      return f_m;

    }


    /*
      (3.51 ff) Respiratory costs of N uptake and fixation
    
      R_N     [kg (C) m-2 d-1]
      N_up    [kg (N) m-2]      daily N uptake
      N_fix   [kg (N) m-2]      daily N fixation
      
      λ_N_up  [kg (C) kg-1 (N)] N uptake respiration coefficent
      λ_N_fix [kg (C) kg-1 (N)] N fixation respiration coefficent

    */

    function R_N(N_up, N_fix) {

      var R_N = 0
        , λ_N_up = cons.resp.λ_N_up
        , λ_N_fix = cons.resp.λ_N_fix
        ;

      R_N = λ_N_up * N_up + λ_N_fix * N_fix;

      return R_N;

    }

  } // netPhotosynthesis
    

  /*
    Partitioning of net assimilates and tissue turnover

    G [kg (C) m-2 day-1]  net growth rate     
    
    TODO: 
      - include influence of defoliation (4.21c) 
      - trampling by animals (4.16m)
      - dead dAH
  */
  function partitioning(T) {

    /* iterate over mixture array */
    for (var s = 0, ps = mixture.length; s < ps; s++) {
  
      var species = mixture[s] 
        , vars = species.vars 
        , cons = species.cons 
        , G_r = vars.G_root
        , G_l = vars.G_leaf 
        , G_s = vars.G_stem
        ;

      /* growth dynamics */
      var SC = vars.SC
        , dSC = vars.dSC
        , NC = vars.NC
        , dNC = vars.dNC
        , PN = vars.PN
        , dPN = vars.dPN
        , AH = vars.AH
        , dAH = vars.dAH
        , Λ_r = vars.Λ_r
        , Λ_litter = vars.Λ_litter
          /* C fractions of new tissue already adjusted for nitrogen availability */
        , G_l_fC_om = vars.G_l_fC_om
        , G_s_fC_om = vars.G_s_fC_om
        , G_r_fC_om = vars.G_r_fC_om
          /* organic matter growth */
        , om_l = G_l * (G_l_fC_om.sc / fC_sc + G_l_fC_om.nc / fC_nc + G_l_fC_om.pn / fC_pn)
        , om_s = G_s * (G_s_fC_om.sc / fC_sc + G_s_fC_om.nc / fC_nc + G_s_fC_om.pn / fC_pn)
        , om_r = G_r * (G_r_fC_om.sc / fC_sc + G_r_fC_om.nc / fC_nc + G_r_fC_om.pn / fC_pn)
          /* leaf appearance rate */
        , Φ_l = 1 / 8
          /* leaf flux parameter */
        , l_live_per_tiller = 3
        , no_boxes = 3
        , γ_l = f_γ(T) * 0.05 // TODO: Φ_l * no_boxes / l_live_per_tiller
          /* stem flux parameter TODO: how to better relate γ_s, γ_r to γ_l */
        , γ_s = 0.8 * γ_l // 0.8 is scale factor turn over rate relative to leaves
        , γ_r = 0.02 * f_γ(T) // root senescense rate TODO: f_γ(T)?
          /* dead to litter flux parameter (value from AgPasture) */
        , γ_dead = 0.11
          /* no remob if N concentration already exceeds maximum */
        , fN_remob_l = (species.N_live_leaf() / species.C_live_leaf() < cons.N_leaf.max) ? 0.5 : 0
        , fN_remob_s = (species.N_live_stem() / species.C_live_stem() < cons.N_leaf.max * 0.5) ? 0.5 : 0
        , fN_remob_r = (species.N_root() / species.C_root() < cons.N_leaf.max * 0.5) ? 0.5 : 0
          /* fraction C remobilization in nc pool */
        , fC_remob = 0.8
        , live_2_dead_l = γ_l * SC.live_l_3 / (SC.live_l_1 + SC.live_l_2)
        , live_2_dead_s = γ_s * SC.live_s_3 / (SC.live_s_1 + SC.live_s_2)
        ;

      /* assimilated protein carbon to leaf, stem and root: new growth flux minus (flux to dead minus remobilization) 
          assume flux in pn and nc to dead is proportional to sc pool flux: live_2_dead_l */
      
      /* leaf */
      dPN.l = G_l * G_l_fC_om.pn - (PN.l * live_2_dead_l * (1 - fN_remob_l)); 
      dPN.dead_l = (PN.l * live_2_dead_l * (1 - fN_remob_l)) - (γ_dead * PN.dead_l);

      /* stem */
      dPN.s = G_s * G_s_fC_om.pn - (PN.s * live_2_dead_s * (1 - fN_remob_s));
      dPN.dead_s = (PN.s * live_2_dead_s * (1 - fN_remob_s)) - (γ_dead * PN.dead_s);
      
      /* root */
      dPN.r = G_r * G_r_fC_om.pn - (1 - fN_remob_r) * γ_r * PN.r;

      /* assimilated non-structural carbon to leaf, stem and root: new growth flux minus (flux to dead minus remobilization) */
      /* leaf */
      dNC.l = G_l * G_l_fC_om.nc - (NC.l * live_2_dead_l * (1 - fC_remob));
      dNC.dead_l = (NC.l * live_2_dead_l * (1 - fC_remob)) - (γ_dead * NC.dead_l);

      /* stem */
      dNC.s = G_s * G_s_fC_om.nc - (NC.s * live_2_dead_s * (1 - fC_remob));
      dNC.dead_s = (NC.s * live_2_dead_s * (1 - fC_remob)) - (γ_dead * NC.dead_s);

      /* root */
      dNC.r = G_r * G_r_fC_om.nc - (1 - fC_remob) * γ_r * NC.r;

      /* assimilated carbon to leaf converted to structural carbon minus flux of structure to age box n */
      /* (3.89 ff) leaf */
      dSC.live_l_1 = G_l * G_l_fC_om.sc - (2 * γ_l * SC.live_l_1);
      dSC.live_l_2 = (2 * γ_l * SC.live_l_1) - (γ_l * SC.live_l_2);
      dSC.live_l_3 = (γ_l * SC.live_l_2) - (γ_l * SC.live_l_3);
      dSC.dead_l = (γ_l * SC.live_l_3) - (γ_dead * SC.dead_l);

      /* stem */
      dSC.live_s_1 = G_s * G_s_fC_om.sc - (2 * γ_s * SC.live_s_1);
      dSC.live_s_2 = (2 * γ_s * SC.live_s_1) - (γ_s * SC.live_s_2);
      dSC.live_s_3 = (γ_s * SC.live_s_2) - (γ_s * SC.live_s_3);
      dSC.dead_s = (γ_s * SC.live_s_3) - (γ_dead * SC.dead_s);

      /* (3.97) root */
      dSC.r = G_r * G_r_fC_om.sc - (γ_r * SC.r);
      
      /* senescensed root input to litter */
      Λ_r.pn += (1 - fN_remob_r) * γ_r * PN.r;
      Λ_r.nc += (1 - fC_remob) * γ_r * NC.r;
      Λ_r.sc += γ_r * SC.r;

      /* (4.18m) input to litter. Johnson (2005/2008) */
      Λ_litter.sc += γ_dead * (SC.dead_l + SC.dead_s);
      Λ_litter.nc += γ_dead * (NC.dead_l + NC.dead_s);
      Λ_litter.pn += γ_dead * (PN.dead_l + PN.dead_s);

      /* track N re-mobilized */
      vars.N_remob = (
        fN_remob_l * (PN.l * live_2_dead_l) + 
        fN_remob_s * (PN.s * live_2_dead_s) + 
        fN_remob_r * γ_r * PN.r
      ) / fC_pn * fN_pn;

      /* ash */
      dAH.l = sqrt(vars.Ω_water) * cons.fAsh_dm_l_ref / (1 - cons.fAsh_dm_l_ref) * om_l;
      dAH.s = sqrt(vars.Ω_water) * cons.fAsh_dm_s_ref / (1 - cons.fAsh_dm_s_ref) * om_s;
      dAH.r = sqrt(vars.Ω_water) * cons.fAsh_dm_r_ref / (1 - cons.fAsh_dm_r_ref) * om_r;

      AH.l += dAH.l - γ_dead * AH.l * SC.dead_l / (SC.live_l_1 + SC.live_l_2 + SC.live_l_3);
      AH.s += dAH.s - γ_dead * AH.s * SC.dead_s / (SC.live_s_1 + SC.live_s_2 + SC.live_s_3);
      AH.r += dAH.r - γ_r * AH.r;

      /* update C pools with dSC, dPN, dNC */

      /* leaf */
      SC.live_l_1 += dSC.live_l_1;
      SC.live_l_2 += dSC.live_l_2;
      SC.live_l_3 += dSC.live_l_3;
      SC.dead_l += dSC.dead_l;
      
      NC.l += dNC.l;
      NC.dead_l += dNC.dead_l;

      PN.l += dPN.l;
      PN.dead_l += dPN.dead_l;

      /* sheath and stem */
      SC.live_s_1 += dSC.live_s_1;
      SC.live_s_2 += dSC.live_s_2;
      SC.live_s_3 += dSC.live_s_3;
      SC.dead_s += dSC.dead_s;
      
      NC.s += dNC.s;
      NC.dead_s += dNC.dead_s;

      PN.s += dPN.s;
      PN.dead_s += dPN.dead_s;

      /* root */
      SC.r += dSC.r;
      NC.r += dNC.r;
      PN.r += dPN.r;

      /* cost of tissue aging e.g. lignin synthesis TODO: calculate cost of ndf synthesis, increase ndf share? */
      // NC.l = max(0, NC.l - 0.05 * (2 * γ_l * SC.live_l_1));
      // NC.s = max(0, NC.s - 0.05 * (2 * γ_s * SC.live_s_1));
      // NC.r = max(0, NC.r - 0.05 * (γ_r * SC.r));

    }

    /*
      (3.99) Influence of temperature on growth dynamics

      f_γ [0-1]
      T   [°C]
      
      TODO: parameters? Default for rye grass (3.100)
    */

    function f_γ(T) {

      var f_γ = 0
        , T_mn = 3
        , T_opt = 20
        , T_ref = 20
        , q = 2
        ;

      /* (1.40) constrain */
      if (T_ref > T_opt)
        T_ref = T_opt;

      if (T <= T_mn)
        f_γ = 0;
      else if (T_mn < T < T_opt)
        f_γ = pow((T - T_mn) / (T_ref - T_mn), q) * (((1 + q) * T_opt - T_mn - q * T) / ((1 + q) * T_opt - T_mn - q * T_ref));
      else if (T >= T_opt)
        f_γ = pow((T_opt - T_mn) / (T_ref - T_mn), q) * ((T_opt - T_mn) / ((1 + q) * T_opt - T_mn - q * T_ref));

      return f_γ;

    }
    
  }


  function phenology() {

    for (var s = 0; s < numberOfSpecies; s++) {

      var part = mixture[s].cons.part;
      var vars = mixture[s].vars;
      
      if (mixture.isRegrowth)
        vars.ρ_l = max(0.2, (1 - part.ρ_l_max) + (2 * part.ρ_l_max - 1) * 1 / (1 + exp(10 * ((vars.GDD / (3 * part.GDD_flower)) - 0.5))));
      else
        vars.ρ_l = max(0.2, (1 - part.ρ_l_max) + (2 * part.ρ_l_max - 1) * 1 / (1 + exp(10 * ((vars.GDD / (2 * part.GDD_flower)) - 0.5))));
    
    }

  } // phenology

  function resetPhenology() {

    for (var s = 0; s < numberOfSpecies; s++) {
      var part = mixture[s].cons.part;
      var vars = mixture[s].vars;
      vars.ρ_l = part.ρ_l_max;
    }

  }


  /*
    T           [C°]            mean daily temperature
    T_mx        [C°]            maximum daily temperature
    T_mn        [C°]            minimum daily temperature
    R_s         [MJ m-2]        global radiation
    sunhours    [h]             unused
    doy         [#]             doy
    rh          [-]             relative humidity
    u           [m-s]           wind speed
    u_h         [m]             wind speed height
    C_amb       [μmol mol-1]    CO2 concentration
    rr          [mm]            rainfall
    f_s         [-]             fraction direct solar radiation
    τ           [s]             daylength
    R_a         [MJ m-2]        extraterrestrial radiation
    isVegPeriod [bool]
  */

  var step = function (T, T_mx, T_mn, R_s, sunhours, julday, rh, u, u_h, C_amb, rr, f_s, τ, R_a, isVegPeriod) {

    var PPF = R_s * PPF_PER_MJ_GLOBAL_RADIATION;

    /* set root distribution variables */
    rootDistribution();
    /* set max. potential nitrogen uptake */
    nitrogenUptake();

    // groundwater
    // var vc_RootingZone = int(floor(0.5 + ((1.3 * mixture.d_r_mx()) / vs_LayerThickness)));
    // var vm_GroundwaterTable = int(soilColumn.vm_GroundwaterTable);

    /* TODO: set for each species? */ 
    vc_ReferenceEvapotranspiration =  fc_ReferenceEvapotranspiration(T, T_mx, T_mn, rh, u, u_h, R_s, C_amb, R_a);

    interception(rr);

    // from fc_CropWaterUptake -->
    var vc_PotentialEvapotranspiration = min(6.5, vc_ReferenceEvapotranspiration * vc_KcFactor); // [mm]

    vc_RemainingEvapotranspiration = vc_PotentialEvapotranspiration; // [mm]

    // If crop holds intercepted water, first evaporation from crop surface
    if (vc_InterceptionStorage > 0.0) {
      if (vc_RemainingEvapotranspiration >= vc_InterceptionStorage) {
        vc_RemainingEvapotranspiration -= vc_InterceptionStorage;
        vc_EvaporatedFromIntercept = vc_InterceptionStorage;
        vc_InterceptionStorage = 0.0;
      } else {
        vc_InterceptionStorage -= vc_RemainingEvapotranspiration;
        vc_EvaporatedFromIntercept = vc_RemainingEvapotranspiration;
        vc_RemainingEvapotranspiration = 0.0;
      }
    } else {
      vc_EvaporatedFromIntercept = 0.0;
    } // <-- from MONICA cropGrowth.fc_CropWaterUptake

    var E_T_pot = vc_RemainingEvapotranspiration;

    /* set actual transpiration and water limiting factor */
    transpiration(E_T_pot);
    
    /* set high and low temperature limiting factors */
    highAndLowTempStress(T, T_mn, T_mx);

    /* set species.vars.P_g_day */
    grossPhotosynthesis(T, T_mn, T_mx, PPF, τ, C_amb, f_s);

    netPhotosynthesis(T);

    for (var s = 0; s < numberOfSpecies; s++) {

      var vars = mixture[s].vars;
      var N_up_pot = sum(mixture.N_up[s]);
      vars.N_up = vars.N_assim; // TODO vars.N_assim - Fixation
      for (var l = 0; l < vs_NumberOfLayers; l++)
        mixture.N_up[s][l] = vars.N_up * mixture.N_up[s][l] / N_up_pot;


      // GDD, fixed base temp. at 5
      if (!isVegPeriod) {
        vars.GDD = 0;
        mixture.isRegrowth = false;
      } else {  
        if (mixture[s].DM_leaf() / mixture[s].DM_stem() < 0.5) /* TODO: end of growth cycle? */
          vars.GDD = 0;
        else
          vars.GDD += max(0, T - 5);
      }

    }
    
    partitioning(T);

    phenology();

  }; // step end


  /* 
    set and update variables:
    mixture.f_r root  fration per species and soil layer
    f_r_sum   root fraction sum per species
    W_r       root kg DM m-2 per species and soil layer
    W_r_sum   root kg DM m-2 sum per soil layer
  */
  function rootDistribution() {

    /* root distribution scaling factor */
    var q_r = 3;

    for (var s = 0; s < numberOfSpecies; s++) {

      var species = mixture[s];
      /* TODO: move k_sum calc. somewhere else */
      species.vars.τ++;
      species.vars.k_sum = min(1, species.vars.τ / species.cons.τ_veg);
      var DM_root = species.DM_root();
      /* Johnson 2008, eq. 4.19b */ 
      species.vars.d_r = 0.05 + (species.cons.d_r_mx - 0.05) * species.vars.k_sum;

      mixture.f_r_sum[s] = 0;

      for (var l = 0; l < vs_NumberOfLayers; l++) {
        /* z [m] upper boundary of layer l */
        var z = vs_LayerThickness * l;
        if (z > species.vars.d_r) {
          /* since mixture.f_r only approaches zero (asymptote, f_r_sum < 1) we stop at root depth d_r and later relate f_r_l to f_r_sum */
          mixture.f_r[s][l] = 0;
          continue;
        }
        /* (4.19c) Johnson (2008) relative root distribution share in layer l. upper minus lower layer boundary */
        mixture.f_r[s][l] = (
          (1 / (1 + pow((z / species.cons.d_r_h) * (species.cons.d_r_mx / species.vars.d_r), q_r))) - 
          (1 / (1 + pow(((z + vs_LayerThickness) / species.cons.d_r_h) * (species.cons.d_r_mx / species.vars.d_r), q_r)))
        );
        mixture.f_r_sum[s] += mixture.f_r[s][l];
      }

      /* distribute root DM to each soil layer */
      for (var l = 0; l < vs_NumberOfLayers; l++)
        mixture.W_r[s][l] = DM_root * mixture.f_r[s][l] / mixture.f_r_sum[s];
        
    } // for each species

    for (var l = 0; l < vs_NumberOfLayers; l++) {
      mixture.W_r_sum[l] = 0; 
      for (var s = 0; s < numberOfSpecies; s++) {
        mixture.W_r_sum[l] += mixture.W_r[s][l]; /* total root mass per layer */
      }
    }

    // var DM_root = mixture.DM_root() /* [kg (d.wt) m-2] */
    //   , C_root = mixture.C_root()      [kg (C) m-2] 
    //   , pc_SpecificRootLength = 300   /* [m kg-1 (d.wt)] is identical for all crops in MONICA db */
    //   ;

    /* set root density: workaround to use MONICAS water uptake routines */
    // for (var l = 0; l < vs_NumberOfLayers; l++)
    //   vc_RootDensity[l] = (1 / vs_LayerThickness) * pc_SpecificRootLength * W_r_sum[l] * DM_root / C_root;

  };


  /* 
    set and update variables:
    N_up      potential N uptake kg N m-2 per species and soil layer
    N_up_sum  potential N uptake kg N m-2 per soil layer

    NH4 uptake disabled
  */
  function nitrogenUptake() {

    var d_r_mx = mixture.d_r_mx(); // max. root depth [m]
    // var dwt2carbon = 1 / 0.45; // TODO: calculate real conversion per species

    for (var l = 0; l < vs_NumberOfLayers; l++) {
      var layer = soilColumn[l];
      /* kg (N) m-3 / kg (soil) m-3 = kg (N) kg-1 (soil) */
      var N = (layer.get_SoilNO3() /*+ layer.get_SoilNH4()*/) / layer.vs_SoilBulkDensity();
      /* Johnson 2013, eq. 3.69 [kg (soil) kg-1 (root C)] TODO: error in doc. ? suppose it is per kg (root C) instead per kg (root d.wt) */
      var ξ_N = 200; //* dwt2carbon; // convert from dwt to carbon TODO: value? unit? allow per species
      /* total uptake from layer must not exceed layer N */
      mixture.N_up_sum[l] = min((layer.get_SoilNO3() /*+ layer.get_SoilNH4()*/) * vs_LayerThickness, ξ_N * N * mixture.W_r_sum[l]);
    }

    for (var l = 0; l < vs_NumberOfLayers; l++) {
      for (var s = 0; s < numberOfSpecies; s++)
        mixture.N_up[s][l] = (mixture.W_r_sum[l] === 0) ? 0 : mixture.N_up_sum[l] * mixture.W_r[s][l] / mixture.W_r_sum[l];
    }

  } // nitrogenUptake

  
  function fc_ReferenceEvapotranspiration(vw_MeanAirTemperature, vw_MaxAirTemperature, vw_MinAirTemperature, vw_RelativeHumidity, vw_WindSpeed, vw_WindSpeedHeight, vc_GlobalRadiation, vw_AtmosphericCO2Concentration, vc_ExtraterrestrialRadiation) {

    var vc_AtmosphericPressure; //[kPA]
    var vc_PsycrometerConstant; //[kPA °C-1]
    var vc_SaturatedVapourPressureMax; //[kPA]
    var vc_SaturatedVapourPressureMin; //[kPA]
    var vc_SaturatedVapourPressure; //[kPA]
    var vc_VapourPressure; //[kPA]
    var vc_SaturationDeficit; //[kPA]
    var vc_SaturatedVapourPressureSlope; //[kPA °C-1]
    var vc_WindSpeed_2m; //[m s-1]
    var vc_AerodynamicResistance; //[s m-1]
    var vc_SurfaceResistance; //[s m-1]
    var vc_ReferenceEvapotranspiration; //[mm]
    var vw_NetRadiation; //[MJ m-2]

    var user_crops = centralParameterProvider.userCropParameters;
    var pc_SaturationBeta = user_crops.pc_SaturationBeta; // Original: Yu et al. 2001; beta = 3.5
    var pc_StomataConductanceAlpha = user_crops.pc_StomataConductanceAlpha; // Original: Yu et al. 2001; alpha = 0.06
    var pc_ReferenceAlbedo = user_crops.pc_ReferenceAlbedo; // FAO Green gras reference albedo from Allen et al. (1998)

    // Calculation of atmospheric pressure
    vc_AtmosphericPressure = 101.3 * pow(((293.0 - (0.0065 * vs_HeightNN)) / 293.0), 5.26);

    // Calculation of psychrometer constant - Luchtfeuchtigkeit
    vc_PsycrometerConstant = 0.000665 * vc_AtmosphericPressure;

    // Calc. of saturated water vapour pressure at daily max temperature
    vc_SaturatedVapourPressureMax = 0.6108 * exp((17.27 * vw_MaxAirTemperature) / (237.3 + vw_MaxAirTemperature));

    // Calc. of saturated water vapour pressure at daily min temperature
    vc_SaturatedVapourPressureMin = 0.6108 * exp((17.27 * vw_MinAirTemperature) / (237.3 + vw_MinAirTemperature));

    // Calculation of the saturated water vapour pressure
    vc_SaturatedVapourPressure = (vc_SaturatedVapourPressureMax + vc_SaturatedVapourPressureMin) / 2.0;

    // Calculation of the water vapour pressure
    if (vw_RelativeHumidity <= 0.0){
      // Assuming Tdew = Tmin as suggested in FAO56 Allen et al. 1998
      vc_VapourPressure = vc_SaturatedVapourPressureMin;
    } else {
      vc_VapourPressure = vw_RelativeHumidity * vc_SaturatedVapourPressure;
    }

    // Calculation of the air saturation deficit
    vc_SaturationDeficit = vc_SaturatedVapourPressure - vc_VapourPressure;

    // Slope of saturation water vapour pressure-to-temperature relation
    vc_SaturatedVapourPressureSlope = (4098.0 * (0.6108 * exp((17.27 * vw_MeanAirTemperature) / (vw_MeanAirTemperature
        + 237.3)))) / ((vw_MeanAirTemperature + 237.3) * (vw_MeanAirTemperature + 237.3));

    // Calculation of wind speed in 2m height
    vc_WindSpeed_2m = vw_WindSpeed * (4.87 / (log(67.8 * vw_WindSpeedHeight - 5.42)));

    // Calculation of the aerodynamic resistance
    vc_AerodynamicResistance = 208.0 / vc_WindSpeed_2m;

    // if (vc_GrossPhotosynthesisReference_mol <= 0.0) {
    //   vc_StomataResistance = 999999.9; // [s m-1]
    // } else {
    //   vc_StomataResistance = // [s m-1]
    //       (vw_AtmosphericCO2Concentration * (1.0 + vc_SaturationDeficit / pc_SaturationBeta))
    //           / (pc_StomataConductanceAlpha * vc_GrossPhotosynthesisReference_mol);
    // }

    // johnson default canopy conductance g_c = 0.015 [m s-1] inverse of stomata resistance
    var vc_StomataResistance = 1 / 0.015;  

    vc_SurfaceResistance = vc_StomataResistance / 1.44;

    // vc_SurfaceResistance = vc_StomataResistance / (vc_CropHeight * vc_LeafAreaIndex);

    // vw_NetRadiation = vc_GlobalRadiation * (1.0 - pc_ReferenceAlbedo); // [MJ m-2]

    var vc_ClearSkyShortwaveRadiation = (0.75 + 0.00002 * vs_HeightNN) * vc_ExtraterrestrialRadiation;
    var vc_RelativeShortwaveRadiation = vc_GlobalRadiation / vc_ClearSkyShortwaveRadiation;
    var vc_NetShortwaveRadiation = (1.0 - pc_ReferenceAlbedo) * vc_GlobalRadiation;

    var pc_BolzmanConstant = 0.0000000049; // Bolzmann constant 4.903 * 10-9 MJ m-2 K-4 d-1
    vw_NetRadiation = vc_NetShortwaveRadiation - (pc_BolzmanConstant
      * (pow((vw_MinAirTemperature + 273.16), 4.0) + pow((vw_MaxAirTemperature
      + 273.16), 4.0)) / 2.0 * (1.35 * vc_RelativeShortwaveRadiation - 0.35)
      * (0.34 - 0.14 * sqrt(vc_VapourPressure)));

    // Calculation of reference evapotranspiration
    // Penman-Monteith-Method FAO
    vc_ReferenceEvapotranspiration = ((0.408 * vc_SaturatedVapourPressureSlope * vw_NetRadiation)
        + (vc_PsycrometerConstant * (900.0 / (vw_MeanAirTemperature + 273.0)) * vc_WindSpeed_2m * vc_SaturationDeficit))
        / (vc_SaturatedVapourPressureSlope + vc_PsycrometerConstant * (1.0 + (vc_SurfaceResistance / vc_AerodynamicResistance)));

    return vc_ReferenceEvapotranspiration;

  } // fc_ReferenceEvapotranspiration

  // set vc_NetPrecipitation & vc_InterceptionStorage
  function interception(vw_GrossPrecipitation) {

    var vc_InterceptionStorageOld = vc_InterceptionStorage;

    // Interception in [mm d-1];
    var vc_Interception = max(0, (2.5 * mixture.h_mx() * mixture.f_g) - vc_InterceptionStorage);

    // If no precipitation occurs, vm_Interception = 0
    if (vw_GrossPrecipitation <= 0) {
      vc_Interception = 0.0;
    }

    // Calculating net precipitation and adding to surface water
    if (vw_GrossPrecipitation <= vc_Interception) {
      vc_Interception = vw_GrossPrecipitation;
      vc_NetPrecipitation = 0.0;
    } else {
      vc_NetPrecipitation = vw_GrossPrecipitation - vc_Interception;
    }

    // add intercepted precipitation to the virtual interception water storage
    vc_InterceptionStorage = vc_InterceptionStorageOld + vc_Interception;

  } // interception


  /* 
    set 
      - E_T per species and layer
      - Ω_water per species
      - f_g

    TODO: groundwater?
  */
  function transpiration(E_T_pot) {

    var E_T_demand = []
      , E_T_demand_remaining = []
      , L_tot = mixture.L_tot()
      , θ_w = []
      , θ_fc = []
      , θ_r = []
      , θ_sat = []
      , θ = []
      , g_water = []
      ;

    /* fractional ground cover. Johnson 2013, eq. 2.23, TODO: weighted k (0.5)? */
    mixture.f_g = 1 - exp(-0.5 * L_tot);
    /* adjust for ground cover */
    E_T_pot = mixture.f_g * E_T_pot;

    /* distribute E_T_pot to each species */
    for (var s = 0; s < numberOfSpecies; s++) {
      E_T_demand[s] = E_T_pot * mixture[s].L() / L_tot;
      E_T_demand_remaining[s] = E_T_demand[s];

      /* reset actual transpiration */
      for (var l = 0; l < vs_NumberOfLayers; l++)
        mixture.E_T[s][l] = 0;
    }
 
    for (var l = 0; l < vs_NumberOfLayers; l++) {
      /* [m3 m-3] to [mm m-2] */
      θ_w[l] = soilColumn[l].get_PermanentWiltingPoint() * 1e3 * vs_LayerThickness;
      θ_fc[l] = soilColumn[l].get_FieldCapacity() * 1e3 * vs_LayerThickness;
      θ_r[l] = θ_fc[l] * 0.8;
      θ_sat[l] = soilColumn[l].get_Saturation() * 1e3 * vs_LayerThickness;
      θ[l] = soilColumn[l].get_Vs_SoilMoisture_m3() * 1e3 * vs_LayerThickness;
      if (θ[l] < θ_w[l])
        g_water[l] = 0;
      else if (θ[l] < θ_r[l])
        g_water[l] = (θ[l] - θ_w[l]) / (θ_r[l] - θ_w[l]);
      else if (θ[l] < θ_fc[l])
        g_water[l] = 1;
      else /* water logging */
        g_water[l] = 1 - 0.5 * (θ[l] - θ_fc[l]) / (θ_sat[l] - θ_fc[l]);
    }

    /* sort in ascending order by Ω_water to avoid that stress occurs due to order */
    mixture.sort(function (a, b) {
      return a.vars.Ω_water - b.vars.Ω_water;
    });

    var index = 0; /* original index prior sorting */

    for (var i = 0; i < 5; i++) { // run x times to compensate for dry layers
      for (var l = 0; l < vs_NumberOfLayers; l++) {
        for (var s = 0; s < numberOfSpecies; s++) {

          index = mixture[s].cons.index;

          if (E_T_demand_remaining[index] <= 0 || mixture.f_r[index][l] === 0 || θ[l] <= θ_w[l])
            continue;

          /* Johnson 2013/2008, eq. 3.2. */
          var add = min(θ[l] - θ_w[l], (mixture.f_r[index][l] / mixture.f_r_sum[index]) * g_water[l] * E_T_demand_remaining[index]);
          mixture.E_T[index][l] += add;
          θ[l] -= add; /* update soil water */
          E_T_demand_remaining[index] -= add; /* keep track of remaining E_T demand */

          if (DEBUG) {
            if (θ[l] < 0 || θ[l] > θ_sat[l])
              throw new Error('θ < 0 || θ > θ_sat');
          }

        }
      }
    }

    /* restore order */
    mixture.sort(function (a, b) {
      return a.cons.index - b.cons.index;
    });

    /* set water growth limiting factor */
    if (waterDeficitResponseOn) {
      for (var s = 0; s < numberOfSpecies; s++) {
        /* update sum */
        mixture.E_T_sum[s] = sum(mixture.E_T[s]);
        if (mixture.E_T_sum[s] === 0)
           mixture[s].vars.Ω_water = 1; /* avoid 0 / 0 = NaN */
        else
          mixture[s].vars.Ω_water = min(1, mixture.E_T_sum[s] / E_T_demand[s]);
      }
    } else {
      for (var s = 0; s < numberOfSpecies; s++)
        mixture[s].vars.Ω_water = 1;
    }

  } // transpiration


  function cropYield(v, bmv) {
    return null; /* TODO: implement */
  };


  function cropFreshMatterYield(v, bmv) {
    return null; /* TODO: implement */
  };


  var get_OrganGrowthIncrement = function (i_Organ) {
    
    if (i_Organ === ROOT)
      return mixture.dDM_root() * SQM_PER_HA;

    if (i_Organ === SHOOT)
      return mixture.dDM_stem() * SQM_PER_HA;

    if (i_Organ === LEAF)
      return mixture.dDM_leaf() * SQM_PER_HA;
    
    return 0;

  };


  var get_Transpiration = function (i_Layer) {
    var transpiration = 0;
    for (var i = 0; i < numberOfSpecies; i++) {
      transpiration += mixture.E_T[i][i_Layer];
    };
    return transpiration;
  };


  var get_OrganBiomass = function (i_Organ) {

    if (i_Organ === ROOT)
      return mixture.DM_root() * SQM_PER_HA;

    if (i_Organ === SHOOT)
      return mixture.DM_stem() * SQM_PER_HA;

    if (i_Organ === LEAF)
      return mixture.DM_leaf() * SQM_PER_HA;
    
    return 0;

  };


  var get_NUptakeFromLayer = function (l) {
    var uptake = 0;
    for (var s = 0; s < numberOfSpecies; s++) {
      uptake += mixture.N_up[s][l];
    }
    return uptake;
  };


  var get_AbovegroundBiomassNContent = function () {
    return null; /* TODO: implement */
  };


  var get_PrimaryCropYield = function () {
    return null; /* TODO: implement */
  };


  var get_SecondaryCropYield = function () {
    return null; /* TODO: implement */
  };


  var get_FreshPrimaryCropYield = function () {
    return null; /* TODO: implement */
  };


  var get_FreshSecondaryCropYield = function () {
    return null; /* TODO: implement */
  };


  var get_ResidueBiomass = function (useSecondaryCropYields) {
    return null; /* TODO: implement */
  };


  var get_ResiduesNConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_PrimaryYieldNConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_ResiduesNContent = function (useSecondaryCropYields)  {
    return null; /* TODO: implement */
  };


  var get_PrimaryYieldNContent = function () {
    return null; /* TODO: implement */
  };


  var get_RawProteinConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_SecondaryYieldNContent = function () {
    return null; /* TODO: implement */
  };


  var get_PotNUptake = function () {
    return null; /* TODO: implement */
  };


  var get_AutotrophicRespiration = function () {
    return null; /* TODO: implement */
  };


  var get_OrganSpecificTotalRespired = function (organ) {
    return null; /* TODO: implement */
  };


  var get_OrganSpecificNPP = function (organ) {
    return null; /* TODO: implement */
  };


  var applyCutting = function () {
    return null; /* TODO: implement */ 
  };


  var accumulateEvapotranspiration = function (ETa) { 
    vc_accumulatedETa += ETa;
  };


  var get_RootNConcentration = function () {
    return null; /* TODO: implement */ 
  };


  var getEffectiveRootingDepth = function () {
    return mixture.d_r_mx();
  };


  var get_CropName = function () {
    return 'grassland';
  };


  var get_GrossPhotosynthesisRate = function () {
    return null; /* TODO: implement */ 
  };


  var get_GrossPhotosynthesisHaRate = function () {
    return null; /* TODO: implement */ 
  };


  var get_AssimilationRate = function () {
    return null; /* TODO: implement */ 
  };


  var get_Assimilates = function () {
    return null; /* TODO: implement */ 
  };


  var get_NetMaintenanceRespiration = function () {
    return null; /* TODO: implement */ 
  };


  var get_MaintenanceRespirationAS = function () {
    return null; /* TODO: implement */ 
  };


  var get_GrowthRespirationAS = function () {
    return null; /* TODO: implement */ 
  };


  var get_VernalisationFactor = function () {
    return 1;
  };


  var get_DaylengthFactor = function () {
    return 1;
  };


  var get_NetPhotosynthesis = function () {
    return null; /* TODO: implement */ 
  };


  var get_ReferenceEvapotranspiration = function () {
    return vc_ReferenceEvapotranspiration;
  };


  var get_RemainingEvapotranspiration = function () {
    return vc_RemainingEvapotranspiration;
  };


  var get_EvaporatedFromIntercept = function () {
    return vc_EvaporatedFromIntercept; 
  };


  var get_NetPrecipitation = function () {
    return vc_NetPrecipitation;
  };


  var get_LeafAreaIndex = function () {
    return mixture.L_tot();
  };


  var get_CropHeight = function () {
    return mixture.h_mx();
  };


  var get_RootingDepth = function () {
    return mixture.d_r_mx();
  };


  var get_SoilCoverage = function () {
    return mixture.f_g;
  };


  var get_KcFactor = function () {
    return vc_KcFactor;
  };


  var get_StomataResistance = function () {
    return null; /* TODO: implement */
  };


  var get_PotentialTranspiration = function () {
    return null; /* TODO: implement */
  };


  var get_ActualTranspiration = function () {
    return null; /* TODO: implement */
  };


  var get_TranspirationDeficit = function () {
    var dm_total = mixture.DM_root() + mixture.DM_stem() + mixture.DM_leaf();
    var stress = 0;
    for (var i = 0; i < numberOfSpecies; i++)
      stress += mixture[i].vars.Ω_water * (mixture[i].DM_root() + mixture[i].DM_stem() + mixture[i].DM_leaf()) / dm_total;
    /* TODO: normalize (0-1) */
    return stress;
  };


  var get_OxygenDeficit = function () {
    return null; /* TODO: implement */
  };


  var get_CropNRedux = function () {
    if (numberOfSpecies === 1)
      return mixture[0].vars.Ω_N;
    var dm_total = mixture.DM_root() + mixture.DM_stem() + mixture.DM_leaf();
    var stress = 0;
    for (var i = 0; i < numberOfSpecies; i++)
      stress += mixture[i].vars.Ω_N * (mixture[i].DM_root() + mixture[i].DM_stem() + mixture[i].DM_leaf()) / dm_total;
    /* TODO: normalize (0-1) */
    return stress;
  };


  var get_HeatStressRedux = function () {
    return null; /* TODO: implement */
  };


  var get_CurrentTemperatureSum = function () {
    return null; /* TODO: implement */
  };


  var get_DevelopmentalStage = function () {
    return 1; /* TODO: implement */
  };


  var get_RelativeTotalDevelopment = function () {
    return null; /* TODO: implement */
  };


  var get_AbovegroundBiomass = function () {
    return mixture.DM_shoot();
  };


  var get_TotalBiomassNContent = function () {
    return null; /* TODO: implement */
  };


  var get_TargetNConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_CriticalNConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_AbovegroundBiomassNConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_HeatSumIrrigationStart = function () {
    return null; /* TODO: implement */
  };


  var get_HeatSumIrrigationEnd = function () {
    return null; /* TODO: implement */
  };


  var get_SumTotalNUptake = function () {
    return null; /* TODO: implement */
  };


  var get_ActNUptake = function () {

    var actNUptake = 0;
    for (var s = 0; s < numberOfSpecies; s++) {
      for (var l = 0; l < vs_NumberOfLayers; l++)
        actNUptake += mixture.N_up[s][l];
    }
    return actNUptake * SQM_PER_HA;
    
  };


  var get_GrossPrimaryProduction = function () {
    return null; /* TODO: implement */
  };


  var get_NetPrimaryProduction = function () {
    return null; /* TODO: implement */
  };


  var get_AccumulatedETa = function () {
    return null; /* TODO: implement */
  };


  var get_isDying = function () {
    return false;
  };


  var get_NumberOfOrgans = function () { 
    return 3; 
  };


  var get_totalBiomass = function () { 
    return mixture.DM_shoot() + mixture.DM_root(); 
  };

  // new interface

  var get_numberOfSpecies = function () {
    return numberOfSpecies;
  };

  /* [kg (C) ha-1] */
  var get_P_g = function () {
    var P_g = 0;
    for (var i = 0; i < numberOfSpecies; i++)
      P_g += mixture[i].vars.P_g_day;
    return P_g * SQM_PER_HA;
  };

  /* [kg (C) ha-1] */
  var get_G = function () {
    var G = 0;
    for (var i = 0; i < numberOfSpecies; i++)
      G += mixture[i].vars.G;
    return G * SQM_PER_HA;
  };

  /* [kg (C) ha-1] */
  var get_R_m = function () {
    var R_m = 0;
    for (var i = 0; i < numberOfSpecies; i++)
      R_m += mixture[i].vars.R_m;
    return R_m * SQM_PER_HA;
  };

  /* [kg (dwt) ha-1] */
  var get_DM_dead_shoot = function () {
    return mixture.DM_dead_shoot() * SQM_PER_HA;
  };

  /* [kg (N) kg-1 (C)] */
  var get_f_N_live_leaf = function () {
    return mixture.f_N_live_leaf();
  };

  /* [kg (N) kg-1 (OM)] */
  var f_N_live_leaf_DM = function () {
    return mixture.f_N_live_leaf_DM();
  };

  /* [kg (N) kg-1 (OM)] */
  var f_N_live_stem_DM = function () {
    return mixture.f_N_live_stem_DM();
  };

  /* [kg (N) kg-1 (OM)] */
  var f_N_root_DM = function () {
    return mixture.f_N_root_DM();
  };

  /* 
    array   [kg [DM] ha-1] 
  */
  var removal_dm = function (residual) {

    var dm = [];
    // default residual 0.1 [kg (DM) m-2] ~ 1 [t ha-1]
    var dm_shoot_residual = residual || 0.1;
    var dm_shoot = mixture.DM_shoot();
    for (var s = 0; s < numberOfSpecies; s++) {
      if (dm_shoot <= dm_shoot_residual) {
        dm[s] = 0;
      } else {

        var species = mixture[s]
          , vars = species.vars
          , SC = vars.SC
          , NC = vars.NC
          , PN = vars.PN
          , AH = vars.AH
          , f_keep = 1 - (dm_shoot - dm_shoot_residual) / dm_shoot
          ;

        dm[s] = SQM_PER_HA * (
          species.DM_leaf() * (1 - f_keep) +
          species.DM_stem() * (1 - f_keep)/* +
          AH.l * (1 - f_keep) +
          AH.s * (1 - f_keep)*/
        );

        // update pools
        SC.live_l_1 *= f_keep;
        SC.live_l_2 *= f_keep; 
        SC.live_l_3 *= f_keep; 
        SC.dead_l   *= f_keep;   
        SC.live_s_1 *= f_keep; 
        SC.live_s_2 *= f_keep; 
        SC.live_s_3 *= f_keep; 
        SC.dead_s   *= f_keep;

        NC.l *= f_keep;
        NC.dead_l *= f_keep;
        NC.s *= f_keep;
        NC.dead_s *= f_keep;
        PN.l *= f_keep;
        PN.dead_l *= f_keep;
        PN.s *= f_keep;
        PN.dead_s *= f_keep;
        AH.l *= f_keep;
        AH.dead_l *= f_keep;
        AH.s *= f_keep;
        AH.dead_s *= f_keep;

      }

      mixture[s].vars.GDD = 0;

    }

    // cut by height does not work very well with current height(LAI) implementation
    // for (var s = 0; s < numberOfSpecies; s++) {
    //   var species = mixture[s];
    //   var vars = species.vars;
    //   var SC = vars.SC;
    //   var NC = vars.NC;
    //   var PN = vars.PN;
    //   var h = species.h();
    //   /* we keep a minimum of 1 % if height = 0 */
    //   var f_keep = 1 - ((h === 0) ? 0.01 : max(0.01, (h - height) / h));
    //   var leaf_DM = species.DM_leaf() * (1 - f_keep); 
    //   var stem_DM = species.DM_stem() * (1 - f_keep);
    //   // update pools
    //   vars.SC.live_l_1 *= f_keep;
    //   vars.SC.live_l_2 *= f_keep; 
    //   vars.SC.live_l_3 *= f_keep; 
    //   vars.SC.dead_l   *= f_keep;   
    //   vars.SC.live_s_1 *= f_keep; 
    //   vars.SC.live_s_2 *= f_keep; 
    //   vars.SC.live_s_3 *= f_keep; 
    //   vars.SC.dead_s   *= f_keep;
    //   // TODO: add dead PN&NC pools
    //   vars.NC.l *= f_keep;
    //   vars.NC.s *= f_keep;
    //   vars.PN.l *= f_keep;
    //   vars.PN.s *= f_keep;

    //   dm[s] = (leaf_DM + stem_DM) * SQM_PER_HA; 
      
    //   if (DEBUG) {
    //     debug('f_keep', f_keep);
    //     debug('leaf_DM', leaf_DM);
    //     debug('stem_DM', stem_DM);
    //   }
    // }

    mixture.isRegrowth = true;

    return dm;

  };


  /* 
    array   [kg [DM] ha-1] 
  */
  var removal_by_height = function (h_residues) {

    var dm = [];

    for (var s = 0; s < numberOfSpecies; s++) {

      var species = mixture[s];
      var h = species.h();
        debug('h <= h_residues', h <= h_residues);

      if (h <= h_residues) {

        dm[s] = 0;
      
      } else {

        var vars = species.vars
          , cons = species.cons
          , SC = vars.SC
          , NC = vars.NC
          , PN = vars.PN
          , AH = vars.AH
          , h_m = cons.h_m
          // , ξ = 0.9 // fixed curvatur parameter
          // , L_half = cons.L_half
          // , α = h_m * (2 - ξ) / (2 * L_half)
          // , L_at_h = (h_residues * (h_residues * ξ - h_m)) / (α * (h_residues - h_m))
          , L_5 = 1 // LAI at 5 cm height
          , a = log((100 * h_m - 1) / (20 * h_m - 1)) / L_5 // curvatur parameter
          , L_at_h_residues = log((h_residues - 100 * h_residues * h_m) / (h_residues - h_m)) / a
          , L = species.L()
          , f_keep_l = (species.DM_leaf() - ((L - L_at_h_residues) / cons.σ)) / species.DM_leaf()
          , f_keep_s = h_residues / h 
          , DM_yield_l = species.DM_leaf() * (1 - f_keep_l)
          , DM_yield_s = species.DM_stem() * (1 - f_keep_s)
          ;

            debug('h', h);
            debug('h_residues', h_residues);
            debug('f_keep_l', f_keep_l);
            debug('f_keep_s', f_keep_s);
            debug('L_at_h_residues', L_at_h_residues);
        dm[s] = SQM_PER_HA * (DM_yield_l + DM_yield_s);

        // update pools
        SC.live_l_1 *= f_keep_l;
        SC.live_l_2 *= f_keep_l; 
        SC.live_l_3 *= f_keep_l; 
        SC.dead_l   *= f_keep_l;   
        SC.live_s_1 *= f_keep_s; 
        SC.live_s_2 *= f_keep_s; 
        SC.live_s_3 *= f_keep_s; 
        SC.dead_s   *= f_keep_s;

        NC.l      *= f_keep_l;
        NC.dead_l *= f_keep_l;
        NC.s      *= f_keep_s;
        NC.dead_s *= f_keep_s;
        PN.l      *= f_keep_l;
        PN.dead_l *= f_keep_l;
        PN.s      *= f_keep_s;
        PN.dead_s *= f_keep_s;
        AH.l      *= f_keep_l;
        AH.dead_l *= f_keep_l;
        AH.s      *= f_keep_s;
        AH.dead_s *= f_keep_s;

        mixture[s].vars.GDD = 0;
      }

    }

    // cut by height does not work very well with current height(LAI) implementation
    // for (var s = 0; s < numberOfSpecies; s++) {
    //   var species = mixture[s];
    //   var vars = species.vars;
    //   var SC = vars.SC;
    //   var NC = vars.NC;
    //   var PN = vars.PN;
    //   var h = species.h();
    //   /* we keep a minimum of 1 % if height = 0 */
    //   var f_keep = 1 - ((h === 0) ? 0.01 : max(0.01, (h - height) / h));
    //   var leaf_DM = species.DM_leaf() * (1 - f_keep); 
    //   var stem_DM = species.DM_stem() * (1 - f_keep);
    //   // update pools
    //   vars.SC.live_l_1 *= f_keep;
    //   vars.SC.live_l_2 *= f_keep; 
    //   vars.SC.live_l_3 *= f_keep; 
    //   vars.SC.dead_l   *= f_keep;   
    //   vars.SC.live_s_1 *= f_keep; 
    //   vars.SC.live_s_2 *= f_keep; 
    //   vars.SC.live_s_3 *= f_keep; 
    //   vars.SC.dead_s   *= f_keep;
    //   // TODO: add dead PN&NC pools
    //   vars.NC.l *= f_keep;
    //   vars.NC.s *= f_keep;
    //   vars.PN.l *= f_keep;
    //   vars.PN.s *= f_keep;

    //   dm[s] = (leaf_DM + stem_DM) * SQM_PER_HA; 
      
    //   if (DEBUG) {
    //     debug('f_keep', f_keep);
    //     debug('leaf_DM', leaf_DM);
    //     debug('stem_DM', stem_DM);
    //   }
    // }

    mixture.isRegrowth = true;

    return dm;

  };

  /* [m] */
  var height = function (idx) {
    return (idx === undefined) ? mixture.h_mx() : mixture[idx].h();
  };

  /* [m2 m-2] */
  var LAI = function (idx) {
    return (idx === undefined) ? mixture.L_tot() : mixture[idx].L();
  };

  /* [0-1] */
  var GLF_water = function (idx) {    
    return (idx === undefined) ? mixture.Ω_water() : mixture[idx].vars.Ω_water;
  };

  /* [0-1] */
  var GLF_nitrogen = function (idx) {    
    return (idx === undefined) ? mixture.Ω_N() : mixture[idx].vars.Ω_N;
  };

  /* [0-1] */
  var GLF_lowTemperature = function (idx) {    
    return (idx === undefined) ? mixture.τ_T_low() : mixture[idx].vars.τ_T_low;
  };

  /* [0-1] */
  var GLF_highTemperature = function (idx) {    
    return (idx === undefined) ? mixture.τ_T_high() : mixture[idx].vars.τ_T_high;
  };

  /* [kg ha-1] */
  var DM_leaf = function (idx) {    
    return ((idx === undefined) ? mixture.DM_leaf() : mixture[idx].DM_leaf()) * SQM_PER_HA;
  };

  /* [kg ha-1] */
  var DM_stem = function (idx) {    
    return ((idx === undefined) ? mixture.DM_stem() : mixture[idx].DM_stem()) * SQM_PER_HA;
  };

  /* [kg ha-1] */
  var DM_root = function (idx) {    
    return ((idx === undefined) ? mixture.DM_root() : mixture[idx].DM_root()) * SQM_PER_HA;
  };


  /* array, per soil layer [AOM_Properties] TODO: implement in generic crop as well */
  var senescencedTissue = function () {

    var AOM = [];
    /* assume a rate for OM flux from litter to soil. TODO: value in SGS? */
    var f_litter = 0.1;

    for (var l = 0; l < vs_NumberOfOrganicLayers; l++) {

      var aom = new AOM_Properties();
      var N = 0;

      
      for (var s = 0; s < numberOfSpecies; s++) {

        var species = mixture[s] 
          , vars = species.vars 
          , Λ_r = vars.Λ_r
          , Λ_litter = vars.Λ_litter
            /* [m-1] due to maxMineralizationDepth vs_NumberOfOrganicLayers might be < root depth TODO: what to do with OM below min. depth? */
          , scale = mixture.f_r[s][l] / mixture.f_r_sum[s] / vs_LayerThickness
          ;

        /* include litter */
        if (l === 0) {
          aom.vo_AOM_Slow += (Λ_litter.sc + Λ_litter.nc + Λ_litter.pn) * f_litter / vs_LayerThickness;
          N += Λ_litter.pn  * f_litter / fC_pn * fN_pn  / vs_LayerThickness;
          Λ_litter.sc *= 1 - f_litter;
          Λ_litter.nc *= 1 - f_litter;
          Λ_litter.pn *= 1 - f_litter;
        }

        aom.vo_AOM_Slow += (Λ_r.sc + Λ_r.nc + Λ_r.pn) * scale;
        N += Λ_r.pn / fC_pn * fN_pn * scale;

      }

      aom.vo_CN_Ratio_AOM_Slow = (aom.vo_AOM_Slow === 0) ? 0 : (N === 0) ? 200 : aom.vo_AOM_Slow / N;
      /* check for null AOM in soilOrganic */
      AOM[l] = aom;
    }

    // reset Λ_r
    for (var s = 0; s < numberOfSpecies; s++) {
      var Λ_r = mixture[s].vars.Λ_r;
      Λ_r.sc = Λ_r.nc = Λ_r.pn = 0;
    }

    return AOM;

  };

  var ASH_l = function () {
    return mixture.reduce(function (a, b) { 
      return a + b.vars.AH.l;
    }, 0) * SQM_PER_HA;
  };

  var SC_live_l_1 = function () {
    return mixture.reduce(function (a, b) { 
      return a + b.vars.SC.live_l_1;
    }, 0) * SQM_PER_HA;
  };

  var SC_live_l_2 = function () {
    return mixture.reduce(function (a, b) { 
      return a + b.vars.SC.live_l_2;
    }, 0) * SQM_PER_HA;
  };

  var SC_live_l_3 = function () {
    return mixture.reduce(function (a, b) { 
      return a + b.vars.SC.live_l_3;
    }, 0) * SQM_PER_HA;
  };

  var SC_dead_l = function () {
    return mixture.reduce(function (a, b) { 
      return a + b.vars.SC.dead_l;
    }, 0) * SQM_PER_HA;
  };

  var SC_live_s_1 = function () {
    return mixture.reduce(function (a, b) { 
      return a + b.vars.SC.live_s_1;
    }, 0) * SQM_PER_HA;
  };

  var SC_live_s_2 = function () {
    return mixture.reduce(function (a, b) { 
      return a + b.vars.SC.live_s_2;
    }, 0) * SQM_PER_HA;
  };

  var SC_live_s_3 = function () {
    return mixture.reduce(function (a, b) { 
      return a + b.vars.SC.live_s_3;
    }, 0) * SQM_PER_HA;
  };

  var SC_dead_s = function () {
    return mixture.reduce(function (a, b) { 
      return a + b.vars.SC.dead_s;
    }, 0) * SQM_PER_HA;
  };

  /* [%] */
  var OMD_shoot = function () {
    if (numberOfSpecies === 1)
      return mixture[0].OMD_shoot();

    return 0;
  };

  var NDFD_leaf = function () {

    var NDFD = 0;
    var dm_leaf = mixture.DM_leaf();
    for (var s = 0; s < numberOfSpecies; s++)
      NDFD += mixture[s].DM_leaf() / dm_leaf * mixture[s].NDFD_leaf();

    return NDFD;

  };

  var NDFD_stem = function () {

    var NDFD = 0;
    var dm_stem = mixture.DM_stem();
    for (var s = 0; s < numberOfSpecies; s++)
      NDFD += mixture[s].DM_stem() / dm_stem * mixture[s].NDFD_stem();

    return NDFD;

  };

  var NDF_leaf = function () {

    var NDF = 0;
    var dm_leaf = mixture.DM_leaf();
    for (var s = 0; s < numberOfSpecies; s++)
      NDF += mixture[s].DM_leaf() / dm_leaf * mixture[s].NDF_leaf();

    return NDF;

  };

  var NDF_stem = function () {

    var NDF = 0;
    var dm_stem = mixture.DM_stem();
    for (var s = 0; s < numberOfSpecies; s++)
      NDF += mixture[s].DM_stem() / dm_stem * mixture[s].NDF_stem();

    return NDF;

  };

  var NFC_leaf = function () {

    var NFC = 0;
    var dm_leaf = mixture.DM_leaf();
    for (var s = 0; s < numberOfSpecies; s++)
      NFC += mixture[s].DM_leaf() / dm_leaf * mixture[s].NFC_leaf();

    return NFC;

  };

  var NFC_stem = function () {

    var NFC = 0;
    var dm_stem = mixture.DM_stem();
    for (var s = 0; s < numberOfSpecies; s++)
      NFC += mixture[s].DM_stem() / dm_stem * mixture[s].NFC_stem();

    return NFC;

  };

  var CP_leaf = function () {

    var CP = 0;
    var dm_leaf = mixture.DM_leaf();
    for (var s = 0; s < numberOfSpecies; s++)
      CP += mixture[s].DM_leaf() / dm_leaf * mixture[s].CP_leaf();

    return CP;

  };

  var CP_stem = function () {

    var CP = 0;
    var dm_stem = mixture.DM_stem();
    for (var s = 0; s < numberOfSpecies; s++)
      CP += mixture[s].DM_stem() / dm_stem * mixture[s].CP_stem();

    return CP;

  };

  var CP_shoot = function () {

    var CP = 0;
    var dm_shoot = mixture.DM_shoot();
    for (var s = 0; s < numberOfSpecies; s++)
      CP += mixture[s].DM_shoot() / dm_shoot * mixture[s].CP_shoot();

    return CP;

  };

  var ASH_leaf = function () {

    var ASH = 0;
    var dm_leaf = mixture.DM_leaf();
    for (var s = 0; s < numberOfSpecies; s++)
      ASH += mixture[s].DM_leaf() / dm_leaf * mixture[s].ASH_leaf();

    return ASH;

  };

  var ASH_stem = function () {

    var ASH = 0;
    var dm_stem = mixture.DM_stem();
    for (var s = 0; s < numberOfSpecies; s++)
      ASH += mixture[s].DM_stem() / dm_stem * mixture[s].ASH_stem();

    return ASH;

  };

  var ASH_shoot = function () {

    var ASH = 0;
    var dm_shoot = mixture.DM_shoot();
    for (var s = 0; s < numberOfSpecies; s++)
      ASH += mixture[s].DM_shoot() / dm_shoot * mixture[s].ASH_shoot();

    return ASH;

  };

  var CF_shoot = function () {

    var CF = 0;
    var dm_shoot = mixture.DM_shoot();
    for (var s = 0; s < numberOfSpecies; s++)
      CF += mixture[s].DM_shoot() / dm_shoot * mixture[s].CF_shoot();

    return CF;

  };

  var N_ass_add = function () {

    var N = 0;
    for (var s = 0; s < numberOfSpecies; s++)
      N += mixture[s].vars.N_ass_add;

    return N * SQM_PER_HA;

  };

  var N_assim = function () {

    var N = 0;
    for (var s = 0; s < numberOfSpecies; s++)
      N += mixture[s].vars.N_assim;

    return N * SQM_PER_HA;

  };

  var N_up = function () {

    var N = 0;
    for (var s = 0; s < numberOfSpecies; s++)
      N += mixture[s].vars.N_up;

    return N * SQM_PER_HA;

  };

  var N_remob = function () {

    var N = 0;
    for (var s = 0; s < numberOfSpecies; s++)
      N += mixture[s].vars.N_remob;

    return N * SQM_PER_HA;

  };

  var leaf_stem_ratio = function () {

    var leaf_dm = 0, stem_dm = 0;
    for (var s = 0; s < numberOfSpecies; s++) {
      leaf_dm += mixture[s].DM_leaf();
      stem_dm += mixture[s].DM_stem();
    }

    return leaf_dm / stem_dm;

  };

  var ρ_l = function (speciesIdx) {

    return mixture[speciesIdx].vars.ρ_l;

  };

  var layer_root_DM = function (layerIdx) {

    var DM = 0;
    for (var s = 0; s < numberOfSpecies; s++)
      DM += mixture.W_r[s][layerIdx];
    return DM;

  };

  return {
      step: step
    , layer_root_DM: layer_root_DM
    , get_P_g: get_P_g
    , get_G: get_G
    , get_R_m: get_R_m
    , get_DM_dead_shoot: get_DM_dead_shoot
    , get_f_N_live_leaf: get_f_N_live_leaf
    , f_N_live_leaf_DM: f_N_live_leaf_DM
    , f_N_live_stem_DM: f_N_live_stem_DM
    , f_N_root_DM: f_N_root_DM
    , removal_dm: removal_dm
    , removal_by_height: removal_by_height
    , height: height
    , LAI: LAI
    , N_ass_add: N_ass_add
    , N_assim: N_assim
    , N_up: N_up
    , N_remob: N_remob
    , leaf_stem_ratio: leaf_stem_ratio
    , ρ_l: ρ_l
    , DM_leaf: DM_leaf
    , DM_stem: DM_stem
    , DM_root: DM_root
    , ASH_l: ASH_l
    , SC_live_l_1: SC_live_l_1
    , SC_live_l_2: SC_live_l_2
    , SC_live_l_3: SC_live_l_3
    , SC_dead_l: SC_dead_l
    , SC_live_s_1: SC_live_s_1
    , SC_live_s_2: SC_live_s_2
    , SC_live_s_3: SC_live_s_3
    , SC_dead_s: SC_dead_s
    , OMD_shoot: OMD_shoot
    , NDFD_leaf: NDFD_leaf
    , NDFD_stem: NDFD_stem
    , NDF_leaf: NDF_leaf
    , NDF_stem: NDF_stem
    , NFC_leaf: NFC_leaf
    , NFC_stem: NFC_stem
    , CP_leaf: CP_leaf
    , CP_stem: CP_stem
    , CP_shoot: CP_shoot
    , ASH_leaf: ASH_leaf
    , ASH_stem: ASH_stem
    , ASH_shoot: ASH_shoot
    , CF_shoot: CF_shoot
    , GLF_water: GLF_water
    , GLF_nitrogen: GLF_nitrogen
    , GLF_lowTemperature: GLF_lowTemperature
    , GLF_highTemperature: GLF_highTemperature
    , senescencedTissue: senescencedTissue
    , accumulateEvapotranspiration: accumulateEvapotranspiration
    , isDying: get_isDying
    , totalBiomass: get_totalBiomass
    , getEffectiveRootingDepth: getEffectiveRootingDepth
    , get_AbovegroundBiomass: get_AbovegroundBiomass
    , get_AbovegroundBiomassNConcentration: get_AbovegroundBiomassNConcentration
    , get_AbovegroundBiomassNContent: get_AbovegroundBiomassNContent
    , get_AccumulatedETa: get_AccumulatedETa
    , get_ActNUptake: get_ActNUptake
    , get_ActualTranspiration: get_ActualTranspiration
    , get_Assimilates: get_Assimilates
    , get_AssimilationRate: get_AssimilationRate
    , get_AutotrophicRespiration: get_AutotrophicRespiration
    , get_CriticalNConcentration: get_CriticalNConcentration
    , get_CropHeight: get_CropHeight
    , get_CropNRedux: get_CropNRedux
    , get_CropName: get_CropName
    , get_CurrentTemperatureSum: get_CurrentTemperatureSum
    , get_DaylengthFactor: get_DaylengthFactor
    , get_DevelopmentalStage: get_DevelopmentalStage
    , get_EvaporatedFromIntercept: get_EvaporatedFromIntercept
    , get_FreshPrimaryCropYield: get_FreshPrimaryCropYield
    , get_FreshSecondaryCropYield: get_FreshSecondaryCropYield
    , get_GrossPhotosynthesisHaRate: get_GrossPhotosynthesisHaRate
    , get_GrossPhotosynthesisRate: get_GrossPhotosynthesisRate
    , get_GrossPrimaryProduction: get_GrossPrimaryProduction
    , get_GrowthRespirationAS: get_GrowthRespirationAS
    , get_HeatStressRedux: get_HeatStressRedux
    , get_HeatSumIrrigationEnd: get_HeatSumIrrigationEnd
    , get_HeatSumIrrigationStart: get_HeatSumIrrigationStart
    , get_KcFactor: get_KcFactor
    , get_LeafAreaIndex: get_LeafAreaIndex
    , get_MaintenanceRespirationAS: get_MaintenanceRespirationAS
    , get_NUptakeFromLayer: get_NUptakeFromLayer
    , get_NetMaintenanceRespiration: get_NetMaintenanceRespiration
    , get_NetPhotosynthesis: get_NetPhotosynthesis
    , get_NetPrecipitation: get_NetPrecipitation
    , get_NetPrimaryProduction: get_NetPrimaryProduction
    , get_NumberOfOrgans: get_NumberOfOrgans
    , get_OrganBiomass: get_OrganBiomass
    , get_OrganGrowthIncrement: get_OrganGrowthIncrement
    , get_OrganSpecificNPP: get_OrganSpecificNPP
    , get_OrganSpecificTotalRespired: get_OrganSpecificTotalRespired
    , get_OxygenDeficit: get_OxygenDeficit
    , get_PotNUptake: get_PotNUptake
    , get_PotentialTranspiration: get_PotentialTranspiration
    , get_PrimaryCropYield: get_PrimaryCropYield
    , get_PrimaryYieldNConcentration: get_PrimaryYieldNConcentration
    , get_PrimaryYieldNContent: get_PrimaryYieldNContent
    , get_RawProteinConcentration: get_RawProteinConcentration
    , get_ReferenceEvapotranspiration: get_ReferenceEvapotranspiration
    , get_RelativeTotalDevelopment: get_RelativeTotalDevelopment
    , get_RemainingEvapotranspiration: get_RemainingEvapotranspiration
    , get_ResidueBiomass: get_ResidueBiomass
    , get_ResiduesNConcentration: get_ResiduesNConcentration
    , get_ResiduesNContent: get_ResiduesNContent
    , get_RootNConcentration: get_RootNConcentration
    , get_RootingDepth: get_RootingDepth
    , get_SecondaryCropYield: get_SecondaryCropYield
    , get_SecondaryYieldNContent: get_SecondaryYieldNContent
    , get_SoilCoverage: get_SoilCoverage
    , get_StomataResistance: get_StomataResistance
    , get_SumTotalNUptake: get_SumTotalNUptake
    , get_TargetNConcentration: get_TargetNConcentration
    , get_TotalBiomassNContent: get_TotalBiomassNContent
    , get_Transpiration: get_Transpiration
    , get_TranspirationDeficit: get_TranspirationDeficit
    , get_VernalisationFactor: get_VernalisationFactor
    , get_numberOfSpecies: get_numberOfSpecies
  };

};


var Environment = function (sps, cpp) {

  this.mode = "MyMode"; // JS! mode not implemented

  // copy constructor
  if (arguments[0] instanceof Environment) {
    debug("Copy constructor: Env" + "\tsoil param size: " + env.soilParams.length);
    this.env = arguments[0];
    this.customId = env.customId;
    this.soilParams = env.soilParams;
    this.noOfLayers = env.noOfLayers;
    this.layerThickness = env.layerThickness;
    this.useNMinMineralFertilisingMethod = env.useNMinMineralFertilisingMethod;
    this.useAutomaticIrrigation = env.useAutomaticIrrigation;
    this.useSecondaryYields = env.useSecondaryYields;

    this.windSpeedHeight = env.windSpeedHeight;
    this.atmosphericCO2 = env.atmosphericCO2;
    this.albedo = env.albedo;

    this.da = env.da;
    this.cropRotation = env.cropRotation;

    // gridPoint = env.gridPoint;

    this.site = env.site;
    this.general = env.general;
    this.organic = env.organic;

    this.nMinFertiliserPartition = env.nMinFertiliserPartition;
    this.nMinUserParams = env.nMinUserParams;
    this.autoIrrigationParams = env.autoIrrigationParams;
    this.centralParameterProvider = env.centralParameterProvider;

    this.pathToOutputDir = env.pathToOutputDir;
    this.mode = env.mode;
  } else {
    this.soilParams = sps;
    this.customId = -1;
    this.centralParameterProvider = cpp;
    this.pathToOutputDir = null;

    this.user_env = this.centralParameterProvider.userEnvironmentParameters;
    this.windSpeedHeight = this.user_env.p_WindSpeedHeight;
    this.atmosphericCO2 = this.user_env.p_AthmosphericCO2;
    this.albedo = this.user_env.p_Albedo;

    this.noOfLayers = this.user_env.p_NumberOfLayers;
    this.layerThickness = this.user_env.p_LayerThickness;
    this.useNMinMineralFertilisingMethod = this.user_env.p_UseNMinMineralFertilisingMethod;
    this.useAutomaticIrrigation = this.user_env.p_UseAutomaticIrrigation;
    this.useSecondaryYields = this.user_env.p_UseSecondaryYields;

    this.cropRotation = null; 
  }

  /**
   * Set execution mode of Monica.
   * Disables debug outputs for some modes.
   *
   * @param mode
   */
  var setMode = function (_mode) {
    mode = _mode;
  };

  /**
   * Interface method for python wrapping. Simply returns number
   * of possible simulation steps according to avaible climate data.
   *
   * @return Number of steps
   */

  var numberOfPossibleSteps = function () {
    return da.noOfStepsPossible();
  };

  this.getMode =  function () { 
    return mode; 
  };

  this.setCropRotation = function (ff) {
    this.cropRotation = ff;
  };

};

/*
  Run a collection of models. 
  Change model variables during the simulation via callbacks.

  This is necessary if management decisions depend on variables in different models (sites) 
  e.g. to simulate grazing, cutting decisions with more than one paddock or one wants
  to model any plot/field interaction.
*/

var ModelCollection = function (weather) {

  var collection = [];

  collection.weather = weather;

  /* callbacks   array of functions */

  collection.run = function (callbacks) {

    var weather = this.weather
      , totalNoDays = weather.noOfStepsPossible()
      , currentDate = weather.startDate()
      , currentDateString = currentDate.toISOString().split('T')[0]
      , leapYear = currentDate.isLeapYear()
      , year = year = currentDate.getFullYear()
      , dayOfSimulation = 0
      , model = null
      , noCbs = callbacks.length
      , noModels = this.length
      ;

    var julday = 0
      , tavg = 0
      , tmax = 0
      , tmin = 0
      , globrad = 0
      , sunhours = 0   
      , relhumid = 0
      , wind = 0
      , precip = 0
      , vw_WindSpeedHeight = 0
      , f_s = 0
      , daylength = 0
      , R_a = 0
      , isVegPeriod = false
      ;

    for (dayOfSimulation; dayOfSimulation < totalNoDays; dayOfSimulation++) {

      logger(MSG.INFO, currentDateString + ' / ' + dayOfSimulation);

      leapYear = currentDate.isLeapYear();
      year = year = currentDate.getFullYear();

      /* get weather data for current day */
      julday = weather.julianDayForStep(dayOfSimulation);
      tavg = weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation);
      tmax = weather.dataForTimestep(WEATHER.TMAX, dayOfSimulation);
      tmin = weather.dataForTimestep(WEATHER.TMIN, dayOfSimulation);
      globrad = weather.dataForTimestep(WEATHER.GLOBRAD, dayOfSimulation);
      /* test if data for sunhours are available; if not, value is set to -1.0 */;
      sunhours = weather.isAvailable(WEATHER.SUNHOURS) ? weather.dataForTimestep(WEATHER.SUNHOURS, dayOfSimulation) : -1.0;
      /* test if data for relhumid are available; if not, value is set to -1.0 */;
      relhumid = weather.isAvailable(WEATHER.RELHUMID) ? weather.dataForTimestep(WEATHER.RELHUMID, dayOfSimulation) : -1.0;
      wind =  weather.dataForTimestep(WEATHER.WIND, dayOfSimulation);
      precip =  weather.dataForTimestep(WEATHER.PRECIP, dayOfSimulation);
      vw_WindSpeedHeight = 2;
      f_s = weather.dataForTimestep(WEATHER.F_DIRECTRAD, dayOfSimulation);
      daylength = weather.dataForTimestep(WEATHER.DAYLENGTH, dayOfSimulation) * SEC_PER_HOUR;
      R_a = weather.dataForTimestep(WEATHER.EXRAD, dayOfSimulation);

      /* update vegetation period: avg. temperature for five consecutive days below or above 5 °C */
      if (dayOfSimulation > 4 && !isVegPeriod && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation) > 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 1) > 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 2) > 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 3) > 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 4) > 5
      ) isVegPeriod = true;
      else if (dayOfSimulation > 4 && isVegPeriod && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation) < 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 1) < 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 2) < 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 3) < 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 4) < 5
      ) isVegPeriod = false;

      for (var m = 0; m < noModels; m++) {
          
        model = this[m];

        /* production process */
        model.prodProcessStep(currentDate);

        /* crop  */
        if(model.isCropPlanted()) {
          model.cropStep(
            julday,
            tavg,
            tmax,
            tmin,
            globrad,
            sunhours,
            relhumid,
            wind,
            precip,
            vw_WindSpeedHeight,
            f_s,
            daylength,
            R_a,
            isVegPeriod
          );
        }
        
        /* soil */
        model.generalStep(
          julday,
          year,
          leapYear,
          tmin,
          tavg,
          tmax,
          precip,
          wind,
          globrad,
          relhumid
        );
        
      } // for each model

      for (var c = 0; c < noCbs; c++)
        callbacks[c](dayOfSimulation, currentDateString, this);

      currentDate.setDate(currentDate.getDate() + 1);
      currentDateString = currentDate.toISOString().split('T')[0];

    } // for each day

    /* done */
    for (var c = 0; c < noCbs; c++)
      callbacks[c](dayOfSimulation, currentDateString, this, true);

  };

  return collection;

};


var Model = function (env) {

  var that = this;

  /* this.cropGrowth statt var, um this an SoilX. zu übergeben */
  this._currentCropGrowth = null;
  this.cropGrowth = function () { return that._currentCropGrowth; };
  this.vw_AtmosphericCO2Concentration;
  this.vs_GroundwaterDepth;

  var _env = env
    , _soilColumn = new SoilColumn(_env.general, _env.soilParams, _env.centralParameterProvider)
    , _soilTemperature = new SoilTemperature(_soilColumn, this, _env.centralParameterProvider)
    , _soilMoisture = new SoilMoisture(_soilColumn, _env.site, this, _env.centralParameterProvider)
    , _soilOrganic = new SoilOrganic(_soilColumn, _env.general, _env.site,_env.centralParameterProvider)
    , _soilTransport = new SoilTransport(_soilColumn, _env.site, _env.centralParameterProvider)
    , _sumFertiliser = 0
    , _dailySumFertiliser = 0
    , _dailySumIrrigationWater = 0
    , _dataAccessor = _env.da
    , centralParameterProvider = _env.centralParameterProvider
    , user_env = centralParameterProvider.userEnvironmentParameters
    , p_daysWithCrop = 0
    , p_accuNStress = 0.0
    , p_accuWaterStress = 0.0
    , p_accuHeatStress = 0.0
    , p_accuOxygenStress = 0.0
    , _currentCrop = null
    , isVegPeriod = false /* tracks if veg. period has started/ended */
    , productionProcessIdx = 0 // iterator through the production processes
    , currentProductionProcess = env.cropRotation[productionProcessIdx] // direct handle to current process
    , nextProductionProcessApplicationDate = currentProductionProcess.start()
    ;


  var prodProcessStep = function (currentDate) {

    /* if for some reason there are no applications (no nothing) in the production process: quit */
    if(!nextProductionProcessApplicationDate.isValid()) {
      // logger(MSG.ERROR, "start of production-process: " + currentProductionProcess.toString() + " is not valid");
      return;
    }

    logger(MSG.INFO, "next app-date: " + nextProductionProcessApplicationDate.toISOString().split('T')[0]);

    /* is there something to apply today? */
    if (nextProductionProcessApplicationDate.setHours(0,0,0,0) === currentDate.setHours(0,0,0,0)) {
      
      currentProductionProcess.apply(nextProductionProcessApplicationDate, this);
      logger(MSG.INFO, 'applied at: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);

      /* get the next application date to wait for */
      nextProductionProcessApplicationDate = currentProductionProcess.nextDate(nextProductionProcessApplicationDate);

      /* if application date was not valid, we're (probably) at the end of the application list of this production 
         process -> go to the next one in the crop rotation */
      if (!nextProductionProcessApplicationDate.isValid() /* && _currentCrop instanceof FieldCrop*/) {

        /* to count the applied fertiliser for the next production process */
        resetFertiliserCounter();

        /* resets crop values for use in next year */
        currentProductionProcess.crop().reset();

        productionProcessIdx++;
        /* end of crop rotation? */ 
        if (productionProcessIdx < env.cropRotation.length) {
          currentProductionProcess = env.cropRotation[productionProcessIdx];
          nextProductionProcessApplicationDate = currentProductionProcess.start();
          logger(MSG.INFO, 'new valid next app-date: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);
        }

      } else {

        if (nextProductionProcessApplicationDate.isValid())
          logger(MSG.INFO, 'next app-date: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);
      
      }

    }

  };   


  var run = function (progressCallbacks) {

    if (env.cropRotation.length === 0) {
      logger(MSG.ERROR, "rotation is empty");
      return;
    }

    var currentDate = env.da.startDate()
      , totalNoDays = env.da.noOfStepsPossible()
      ;

    logger(MSG.INFO, "next app-date: " + nextProductionProcessApplicationDate.toISOString().split('T')[0]);

    /* if for some reason there are no applications (no nothing) in the production process: quit */
    if(!nextProductionProcessApplicationDate.isValid()) {
      logger(MSG.ERROR, "start of production-process: " + currentProductionProcess.toString() + " is not valid");
      return;
    }

    for (var dayOfSimulation = 0; dayOfSimulation < totalNoDays; dayOfSimulation++) {

      currentDate.setDate(currentDate.getDate() + 1);

      logger(MSG.INFO, currentDate.toISOString().split('T')[0]);
      
      resetDailyCounter();

      /* test if model's crop has been dying in previous step if yes, it will be incorporated into soil */
      if (that._currentCropGrowth && that._currentCropGrowth.isDying())
        incorporateCurrentCrop();

      /* there's something to apply at this day */
      if (nextProductionProcessApplicationDate.setHours(0,0,0,0) === currentDate.setHours(0,0,0,0)) {
        
        /* apply everything to do at current day */
        currentProductionProcess.apply(nextProductionProcessApplicationDate, this);
        logger(MSG.INFO, 'applied at: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);

        /* get the next application date to wait for */
        var prevPPApplicationDate = nextProductionProcessApplicationDate;

        nextProductionProcessApplicationDate = currentProductionProcess.nextDate(nextProductionProcessApplicationDate);


        /* if application date was not valid, we're (probably) at the end
          of the application list of this production process
          -> go to the next one in the crop rotation */
        if (!nextProductionProcessApplicationDate.isValid() && _currentCrop instanceof FieldCrop) { // TODO: in grassland?

          /* to count the applied fertiliser for the next production process */
          resetFertiliserCounter();

          /* resets crop values for use in next year */
          currentProductionProcess.crop().reset();

          productionProcessIdx++;
          /* end of crop rotation? */ 
          if (productionProcessIdx < env.cropRotation.length) {

            currentProductionProcess = env.cropRotation[productionProcessIdx];
            nextProductionProcessApplicationDate = currentProductionProcess.start();
            logger(MSG.INFO, 'new valid next app-date: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);
          
          }

        } else {
          if (nextProductionProcessApplicationDate.isValid())
            logger(MSG.INFO, 'next app-date: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);
        }

      }

      /* run crop step */
      if(isCropPlanted())
        cropStep(dayOfSimulation);
      
      /* if progressCallback is provided */
      if (progressCallbacks.length) {
        for (var c = 0, cs = progressCallbacks.length; c < cs; c++)
          progressCallbacks[c](dayOfSimulation, currentDate, this);
      }

      generalStep(dayOfSimulation);

    }

    logger(MSG.INFO, "returning from runModel");
    
    /* if progressCallbacks is provided send null i.e. we are done*/
    if (progressCallbacks) {
      for (var c = 0, cs = progressCallbacks.length; c < cs; c++)
        progressCallbacks[c](null, null);
    }

    return; /* TODO: what to return? */

  };

  var seedCrop = function (crop) {

    _currentCrop = crop;
    var cps = null; // JS!
    that._currentCropGrowth = null;

    p_daysWithCrop = 0;
    p_accuNStress = 0.0;
    p_accuWaterStress = 0.0;
    p_accuHeatStress = 0.0;
    p_accuOxygenStress = 0.0;

    if(_currentCrop.isValid() && _currentCrop.type === 'fieldcrop') {

      cps = _currentCrop.cropParameters();
      that._currentCropGrowth = new FieldCropGrowth(_soilColumn, _env.general, cps, _env.site, _env.centralParameterProvider);

      _soilTransport.put_Crop(that._currentCropGrowth);
      _soilColumn.put_Crop(that._currentCropGrowth);
      _soilMoisture.put_Crop(that._currentCropGrowth);
      _soilOrganic.put_Crop(that._currentCropGrowth);

      logger(MSG.INFO, 'seeding crop: ' + crop.name());

      if (_env.useNMinMineralFertilisingMethod && _currentCrop.seedDate().dayOfYear() <= _currentCrop.harvestDate().dayOfYear()) {

        logger(MSG.INFO, "N_min fertilising summer crop");

        var fert_amount = applyMineralFertiliserViaNMinMethod(
          _env.nMinFertiliserPartition,
          NMinCropParameters(
            cps.pc_SamplingDepth,
            cps.pc_TargetNSamplingDepth,
            cps.pc_TargetN30
          )
        );
        
        addDailySumFertiliser(fert_amount);
      
      }

    } else if (_currentCrop.isValid() && _currentCrop.type === 'grassland') {

      cps = {};
      that._currentCropGrowth = new GrasslandGrowth(_soilColumn, _env.general, _currentCrop.mixture, _env.site, _env.centralParameterProvider);

      _soilTransport.put_Crop(that._currentCropGrowth);
      _soilColumn.put_Crop(that._currentCropGrowth);
      _soilMoisture.put_Crop(that._currentCropGrowth);
      _soilOrganic.put_Crop(that._currentCropGrowth);

      logger(MSG.INFO, 'seeding crop: ' + crop.name());

    }

  };


  var harvestCurrentCrop = function () {

    /* could be just a fallow, so there might be no CropGrowth object */
    if (_currentCrop && _currentCrop.isValid()) {

      /* prepare to add root and crop residues to soilorganic (AOMs) */
      var rootBiomass = that._currentCropGrowth.get_OrganBiomass(0);
      var rootNConcentration = that._currentCropGrowth.get_RootNConcentration();

      logger(MSG.INFO, 'Harvest: adding organic matter from root to soilOrganic');
      logger(MSG.INFO, 'Root biomass: ' + rootBiomass + ' Root N concentration: ' + rootNConcentration);

      _soilOrganic.addOrganicMatter(_currentCrop.residueParameters(), rootBiomass, rootNConcentration);

      var residueBiomass = that._currentCropGrowth.get_ResidueBiomass(_env.useSecondaryYields);

      /* TODO: das hier noch berechnen (???) */
      var residueNConcentration = that._currentCropGrowth.get_ResiduesNConcentration();

      logger(MSG.INFO, 'Adding organic matter from residues to soilOrganic');
      logger(MSG.INFO, 'Residue biomass: ' + residueBiomass + ' Residue N concentration: ' + residueNConcentration);
      logger(MSG.INFO, 'Primary yield biomass: ' + that._currentCropGrowth.get_PrimaryCropYield()
          + ' Primary yield N concentration: ' + that._currentCropGrowth.get_PrimaryYieldNConcentration());
      logger(MSG.INFO, 'Secondary yield biomass: ' + that._currentCropGrowth.get_SecondaryCropYield()
          + ' Secondary yield N concentration: ' + '??');
      logger(MSG.INFO, 'Residues N content: ' + that._currentCropGrowth.get_ResiduesNContent()
          + ' Primary yield N content: ' + that._currentCropGrowth.get_PrimaryYieldNContent()
          + ' Secondary yield N content: ' + that._currentCropGrowth.get_SecondaryYieldNContent());

      _soilOrganic.addOrganicMatter(_currentCrop.residueParameters(), residueBiomass, residueNConcentration);
    
    }

    that._currentCropGrowth = null;
    _currentCrop = null;
    _soilTransport.remove_Crop();
    _soilColumn.remove_Crop();
    _soilMoisture.remove_Crop();
    _soilOrganic.remove_Crop(); // !JS correct?

  };


  var incorporateCurrentCrop = function () {

    /* could be just a fallow, so there might be no CropGrowth object */
    if (_currentCrop && _currentCrop.isValid()) {

      /* prepare to add root and crop residues to soilorganic (AOMs) */
      var totalBiomass = that._currentCropGrowth.totalBiomass();
      var totalNConcentration = that._currentCropGrowth.get_AbovegroundBiomassNConcentration() + that._currentCropGrowth.get_RootNConcentration();

      logger(MSG.INFO, "Incorporation: adding organic matter from total biomass of crop to soilOrganic");
      logger(MSG.INFO, "Total biomass: " + totalBiomass + " Total N concentration: " + totalNConcentration);

      _soilOrganic.addOrganicMatter(_currentCrop.residueParameters(), totalBiomass, totalNConcentration);
    
    }

    that._currentCropGrowth = null;
    _currentCrop = null;
    _soilTransport.remove_Crop();
    _soilColumn.remove_Crop();
    _soilMoisture.remove_Crop();
    _soilOrganic.remove_Crop(); // !JS correct?
  
  };


  /* TODO: Nothing implemented yet. (??) */
  var applyMineralFertiliser = function (partition, amount) {

    if (!_env.useNMinMineralFertilisingMethod) {

      logger(MSG.INFO, 'Apply mineral fertiliser. Amount: ' + amount);

      _soilColumn.applyMineralFertiliser(partition, amount);
      addDailySumFertiliser(amount);

    }
  
  };

  
  var applyOrganicFertiliser = function (params, amount, doIncorporate) {

    logger(MSG.INFO, 'apply organic fertiliser: amount: ' + amount + ', vo_NConcentration: ' + params.vo_NConcentration);

    _soilOrganic.setIncorporation(doIncorporate);
    _soilOrganic.addOrganicMatter(params, amount, params.vo_NConcentration);
    addDailySumFertiliser(amount * params.vo_AOM_DryMatterContent * params.vo_NConcentration);
  
  };


  var applyMineralFertiliserViaNMinMethod = function (partition, cps) {

    // TODO: implement
    //AddFertiliserAmountsCallback x(_sumFertiliser, _dailySumFertiliser);

    var ups = _env.nMinUserParams;
    var fert_amount = _soilColumn.applyMineralFertiliserViaNMinMethod(
      partition,
      cps.samplingDepth,
      cps.nTarget,
      cps.nTarget30,
      ups.min,
      ups.max,
      ups.delayInDays
    );

    return fert_amount;

  };


  var applyIrrigation = function (amount, nitrateConcentration) {

    /* if the production process has still some defined manual irrigation dates */
    if (!_env.useAutomaticIrrigation) {

      logger(MSG.INFO, 'apply irrigation: amount: ' + amount + ', nitrateConcentration: ' + nitrateConcentration);

      _soilOrganic.addIrrigationWater(amount);
      _soilColumn.applyIrrigation(amount, nitrateConcentration);
      
      if (_currentCrop) {
  
        _currentCrop.addAppliedIrrigationWater(amount);
        this.addDailySumIrrigationWater(amount);
  
      }
    
    }
  
  };


  /*
    Applies tillage for a given soil depth. Tillage means in MONICA, that for all effected soil layer the parameters 
    are averaged.
   
    depth [m]
  */
  var applyTillage = function (depth) {
    _soilColumn.applyTillage(depth);
  };


  /* 
    Simulating the soil processes for one time step.

    stepNo [#]  Number of current processed step
  */
  var generalStep = function (
    julday,
    year,
    leapYear,
    tmin,
    tavg,
    tmax,
    precip,
    wind,
    globrad,
    relhumid
  ) {

    that.vw_AtmosphericCO2Concentration = (_env.atmosphericCO2 === -1 ? user_env.p_AthmosphericCO2 : _env.atmosphericCO2);
    if (int(that.vw_AtmosphericCO2Concentration) === 0)
      that.vw_AtmosphericCO2Concentration = CO2ForDate(year, julday, leapYear);

    that.vs_GroundwaterDepth = GroundwaterDepthForDate(
      user_env.p_MaxGroundwaterDepth,
      user_env.p_MinGroundwaterDepth,
      user_env.p_MinGroundwaterDepthMonth,
      julday,
      leapYear
    );
    
    //31 + 28 + 15
    var pc_JulianDayAutomaticFertilising = user_env.p_JulianDayAutomaticFertilising;

    _soilColumn.deleteAOMPool();

    _soilColumn.applyPossibleDelayedFerilizer();
    var delayed_fert_amount = _soilColumn.applyPossibleTopDressing();
    addDailySumFertiliser(delayed_fert_amount);

    if (_currentCrop
        && _currentCrop.isValid()
        && _env.useNMinMineralFertilisingMethod
        && _currentCrop.seedDate().dayOfYear() > _currentCrop.harvestDate().dayOfYear()
        && julday == pc_JulianDayAutomaticFertilising) {

      logger(MSG.INFO, "N_min fertilising winter crop");

      var cps = _currentCrop.cropParameters();
      var fert_amount = applyMineralFertiliserViaNMinMethod(
        _env.nMinFertiliserPartition,
        NMinCropParameters(
          cps.pc_SamplingDepth,
          cps.pc_TargetNSamplingDepth,
          cps.pc_TargetN30
        )
      );
      
      addDailySumFertiliser(fert_amount);

    }

    _soilTemperature.step(tmin, tmax, globrad);
    _soilMoisture.step(
      that.vs_GroundwaterDepth,
      precip,
      tmax,
      tmin,
      (relhumid / 100.0),
      tavg,
      wind,
      env.windSpeedHeight,
      globrad,
      julday
    );
    _soilOrganic.step(tavg, precip, wind);
    _soilTransport.step();

  };

  /* Simulating crop growth for one time step. */
  var cropStep = function (
    julday,
    tavg,
    tmax,
    tmin,
    globrad,
    sunhours,
    relhumid,
    wind,
    precip,
    vw_WindSpeedHeight,
    f_s,
    daylength,
    R_a, 
    isVegPeriod
  ) {

    /* do nothing if there is no crop */
    if (!that._currentCropGrowth)
      return;

    /* test if model's crop has been dying in previous step if yes, it will be incorporated into soil */
    if (that._currentCropGrowth.isDying()) {
      incorporateCurrentCrop();
      return;
    }

    p_daysWithCrop++;

    that._currentCropGrowth.step(
      tavg,
      tmax,
      tmin,
      globrad,
      sunhours,
      julday,
      (relhumid / 100.0),
      wind,
      vw_WindSpeedHeight,
      that.vw_AtmosphericCO2Concentration,
      precip,
      f_s,
      daylength,
      R_a,
      isVegPeriod
    );

    if (_env.useAutomaticIrrigation) {

      var aips = _env.autoIrrigationParams;
      if (_soilColumn.applyIrrigationViaTrigger(aips.treshold, aips.amount, aips.nitrateConcentration)) {

        _soilOrganic.addIrrigationWater(aips.amount);
        _currentCrop.addAppliedIrrigationWater(aips.amount);
        _dailySumIrrigationWater += aips.amount;
      
      }
    
    }

    p_accuNStress += that._currentCropGrowth.get_CropNRedux();
    p_accuWaterStress += that._currentCropGrowth.get_TranspirationDeficit();
    p_accuHeatStress += that._currentCropGrowth.get_HeatStressRedux();
    p_accuOxygenStress += that._currentCropGrowth.get_OxygenDeficit();

  };

  /* Returns atmospheric CO2 concentration for date [ppm] */
  var CO2ForDate = function (year, julianday, leapYear) {

    var co2 = 380, decimalDate = 0;

    if (leapYear)
      decimalDate = year + (julianday / 366.0);
    else
      decimalDate = year + (julianday / 365.0);

    co2 = 222.0 + exp(0.0119 * (decimalDate - 1580.0)) + 2.5 * sin((decimalDate - 0.5) / 0.1592);

    return co2;

  };

  /* Returns groundwater table for date [m] */
  var GroundwaterDepthForDate = function (
    maxGroundwaterDepth,
    minGroundwaterDepth,
    minGroundwaterDepthMonth,
    julianday,
    leapYear
  ) {
    
    var groundwaterDepth = 20
      , days = leapYear ? 366.0 : 365.0
      , meanGroundwaterDepth = (maxGroundwaterDepth + minGroundwaterDepth) / 2.0
      , groundwaterAmplitude = (maxGroundwaterDepth - minGroundwaterDepth) / 2.0
      ;

    var sinus = sin(((julianday / days * 360.0) - 90.0 -
           (((minGroundwaterDepthMonth) * 30.0) - 15.0)) *
           3.14159265358979 / 180.0);

    groundwaterDepth = meanGroundwaterDepth + (sinus * groundwaterAmplitude);

    if (groundwaterDepth < 0.0)
      groundwaterDepth = 20.0;

    return groundwaterDepth;

  };

  //----------------------------------------------------------------------------

  /*
    Returns mean soil organic C. [kg C / kg soil * 100]
    
    depth_m [m]
  */
  var avgCorg = function (depth_m) {

    var lsum = 0, sum = 0, count = 0;

    for (var i = 0, nols = _env.noOfLayers; i < nols; i++) {
      count++;
      sum +=_soilColumn[i].vs_SoilOrganicCarbon(); //[kg C / kg Boden]
      lsum += _soilColumn[i].vs_LayerThickness;
      if (lsum >= depth_m)
        break;
    }

    return sum / (count) * 100.0;

  };

  /* Returns the soil moisture up to 90 cm depth, 0-90cm [%nFK] */
  var mean90cmWaterContent = function () {
    return _soilMoisture.meanWaterContent(0.9);
  };

  var meanWaterContent = function (layer, number_of_layers) {
    return _soilMoisture.meanWaterContent(layer, number_of_layers);
  };

  /* 
    Returns the N content up to given depth.
    Boden-Nmin-Gehalt 0-90cm am 31.03. [kg (N) ha-1]
  */
  var sumNmin = function (depth_m) {
    
    var lsum = 0, sum = 0, count = 0;

    for(var i = 0, nols = _env.noOfLayers; i < nols; i++) {
      count++;
      sum += _soilColumn[i].get_SoilNmin(); //[kg N m-3]
      lsum += _soilColumn[i].vs_LayerThickness;
      if(lsum >= depth_m)
        break;
    }

    return sum / (count) * lsum * 10000;

  }

  /* Returns accumulation of soil nitrate for 90cm soil at 31.03. */
  var sumNO3AtDay = function (depth_m) {

    var lsum = 0, sum = 0, count = 0;

    for(var i = 0, nols = _env.noOfLayers; i < nols; i++) {
      count++;
      sum += _soilColumn[i].get_SoilNO3(); //[kg m-3]
      lsum += _soilColumn[i].vs_LayerThickness;
      if(lsum >= depth_m)
        break;
    }

    return sum;

  };

  /* [mm] */
  var groundWaterRecharge = function () {
    return _soilMoisture.get_GroundwaterRecharge();
  };

  /* [kg (N) ha-1] */
  var nLeaching = function () {
    return _soilTransport.get_NLeaching();//[kg N ha-1]
  };

  /*
    Returns sum of soiltemperature in given number of soil layers
    sumSoilTemperature [°C]
    layers             [#]  Number of layers that should be added.
  */
  var sumSoilTemperature = function (layers) {
    return _soilColumn.sumSoilTemperature(layers);
  };

  /* Returns maximal snow depth during simulation */
  var maxSnowDepth = function () {
    return _soilMoisture.getMaxSnowDepth();
  };

  /* Returns sum of all snowdepth during whole simulation */
  var accumulatedSnowDepth = function () {
    return _soilMoisture.accumulatedSnowDepth();
  };

  /* Returns sum of frost depth during whole simulation. */
  var accumulatedFrostDepth = function () {
    return _soilMoisture.getAccumulatedFrostDepth();
  };

  /* Returns average soil temperature of first 30cm soil. */
  var avg30cmSoilTemperature = function () {
    var nols = 3, accu_temp = 0.0;
    for (var layer = 0; layer < nols; layer++)
      accu_temp += _soilColumn.soilLayer(layer).get_Vs_SoilTemperature();

    return accu_temp / nols;
  };

  /*
    Returns average soil moisture concentration in soil in a defined layer.
    Layer is specified by start end end of soil layer.
    
    avgSoilMoisture [?]  Average soil moisture concentation
    start_layer     [#]
    end_layer       [#]
  */
  var avgSoilMoisture = function (start_layer, end_layer) {
    var num = 0, accu = 0.0;
    for (var i = start_layer; i < end_layer; i++) {
      accu += _soilColumn.soilLayer(i).get_Vs_SoilMoisture_m3();
      num++;
    }
    return accu / num;
  };

  /*
    Returns mean of capillary rise in a set of layers

    avgCapillaryRise  [mm]  Average capillary rise
    start_layer       [#]   First layer to be included
    end_layer         [#]   Last layer, is not included;
  */
  var avgCapillaryRise = function (start_layer, end_layer) {
    var num = 0, accu = 0.0;
    for (var i = start_layer; i < end_layer; i++) {
      accu += _soilMoisture.get_CapillaryRise(i);
      num++;
    }
    return accu / num;
  };

  /*
    Returns mean percolation rate
  
    avgPercolationRate  [mm] Mean percolation rate
    start_layer         [#]
    end_layer           [#]
  */
  var avgPercolationRate = function (start_layer, end_layer) {
    var num = 0, accu = 0.0;
    for (var i = start_layer; i < end_layer; i++) {
      accu += _soilMoisture.get_PercolationRate(i);
      num++;
    }
    return accu / num;
  };

  /*
    Returns sum of all surface run offs at this point in simulation time.
    
    sumSurfaceRunOff  [mm]  Sum of surface run off in
  */
  var sumSurfaceRunOff = function () {
    return _soilMoisture.get_SumSurfaceRunOff();
  };

  /*  Returns surface runoff of current day [mm]. */
  var surfaceRunoff = function () {
    return _soilMoisture.get_SurfaceRunOff();
  };

  /*  Returns evapotranspiration [mm] */
  var getEvapotranspiration = function () {
    if (that._currentCropGrowth)
      return that._currentCropGrowth.get_RemainingEvapotranspiration();
    return 0.0;
  };

  /* Returns actual transpiration */
  var getTranspiration = function () {
    if (that._currentCropGrowth)
      return that._currentCropGrowth.get_ActualTranspiration();
    return 0.0;
  };

  /* Returns actual evaporation */
  var getEvaporation = function () {
    if (that._currentCropGrowth)
      return that._currentCropGrowth.get_EvaporatedFromIntercept();
    return 0.0;
  };

  var getETa = function () {
    return _soilMoisture.get_Evapotranspiration();
  };

  /* Returns sum of evolution rate in first three layers. */
  var get_sum30cmSMB_CO2EvolutionRate = function () {
    var sum = 0.0;
    for (var layer = 0; layer < 3; layer++)
      sum += _soilOrganic.get_SMB_CO2EvolutionRate(layer);
    return sum;
  };

  /* Returns volatilised NH3 */
  var getNH3Volatilised = function () {
    return _soilOrganic.get_NH3_Volatilised();
  };

  /* Returns accumulated sum of all volatilised NH3 in simulation time. */
  var getSumNH3Volatilised = function () {
    return _soilOrganic.get_SumNH3_Volatilised();
  };

  /* Returns sum of denitrification rate in first 30cm soil [kg N m-3 d-1] */
  var getsum30cmActDenitrificationRate = function () {
    var sum = 0.0;
    for (var layer = 0; layer < 3; layer++)
      sum += _soilOrganic.get_ActDenitrificationRate(layer);
    return sum;
  };

  var addDailySumFertiliser = function (amount) {
    _dailySumFertiliser += amount;
    _sumFertiliser += amount;
  };

  var useNMinMineralFertilisingMethod = function () {
    return _env.useNMinMineralFertilisingMethod;
  };

  var currentCrop = function () {
    return _currentCrop;
  };

  var isCropPlanted = function () {
    return _currentCrop && _currentCrop.isValid();
  };

  var dailySumFertiliser = function () { 
    return _dailySumFertiliser; 
  };

  var dailySumIrrigationWater = function () { 
    return _dailySumIrrigationWater; 
  };

  var addDailySumIrrigationWater = function (amount) {
    _dailySumIrrigationWater += amount;
  };

  var sumFertiliser = function () { 
    return _sumFertiliser; 
  };

  var resetFertiliserCounter = function () { 
    _sumFertiliser = 0;
  };

  var resetDailyCounter = function () {
    _dailySumIrrigationWater = 0.0;
    _dailySumFertiliser = 0.0;
  };

  var get_AtmosphericCO2Concentration = function () {
    return that.vw_AtmosphericCO2Concentration;
  };

  var get_GroundwaterDepth = function () { 
    return that.vs_GroundwaterDepth; 
  };

  var writeOutputFiles = function () {
    return centralParameterProvider.writeOutputFiles;
  };

  var getCentralParameterProvider = function () {
    return centralParameterProvider;
  };

  var getEnvironment= function () {
    return _env;
  };

  var soilTemperature = function () {
    return _soilTemperature; 
  };

  var soilMoisture = function () {
    return _soilMoisture; 
  };

  var soilOrganic = function () {
    return _soilOrganic; 
  };

  var soilTransport = function () {
    return _soilTransport; 
  };

  var soilColumn = function () {
    return _soilColumn; 
  };

  var soilColumnNC = function () {
    return _soilColumn; 
  };

  var netRadiation = function (globrad) {
    return globrad * (1 - _env.albedo);
  };

  var daysWithCrop = function () {
    return p_daysWithCrop; 
  };

  var getAccumulatedNStress = function () {
    return p_accuNStress; 
  };

  var getAccumulatedWaterStress = function () {
    return p_accuWaterStress; 
  };

  var getAccumulatedHeatStress = function () {
    return p_accuHeatStress; 
  };

  var getAccumulatedOxygenStress = function () {
    return p_accuOxygenStress; 
  };

  var getIsVegPeriod = function () {
    return Number(isVegPeriod); 
  };

  return {
    run: run,
    getCentralParameterProvider: getCentralParameterProvider,
    getEnvironment: getEnvironment,
    cropGrowth: this.cropGrowth,
    prodProcessStep: prodProcessStep,
    generalStep: generalStep,
    cropStep: cropStep,
    CO2ForDate: CO2ForDate,
    GroundwaterDepthForDate: GroundwaterDepthForDate,
    seedCrop: seedCrop,
    incorporateCurrentCrop: incorporateCurrentCrop,
    applyMineralFertiliser: applyMineralFertiliser,
    applyOrganicFertiliser: applyOrganicFertiliser,
    harvestCurrentCrop: harvestCurrentCrop,
    applyMineralFertiliserViaNMinMethod: applyMineralFertiliserViaNMinMethod,
    applyIrrigation: applyIrrigation,
    applyTillage: applyTillage,
    avgCorg: avgCorg,
    mean90cmWaterContent: mean90cmWaterContent,
    meanWaterContent: meanWaterContent,
    sumNmin: sumNmin,
    groundWaterRecharge: groundWaterRecharge,
    nLeaching: nLeaching,
    sumSoilTemperature: sumSoilTemperature,
    sumNO3AtDay: sumNO3AtDay,
    maxSnowDepth: maxSnowDepth,
    accumulatedSnowDepth: accumulatedSnowDepth,
    accumulatedFrostDepth: accumulatedFrostDepth,
    avg30cmSoilTemperature: avg30cmSoilTemperature,
    avgSoilMoisture: avgSoilMoisture,
    avgCapillaryRise: avgCapillaryRise,
    avgPercolationRate: avgPercolationRate,
    sumSurfaceRunOff: sumSurfaceRunOff,
    surfaceRunoff: surfaceRunoff,
    getEvapotranspiration: getEvapotranspiration,
    getTranspiration: getTranspiration,
    getEvaporation: getEvaporation,
    get_sum30cmSMB_CO2EvolutionRate: get_sum30cmSMB_CO2EvolutionRate,
    getNH3Volatilised: getNH3Volatilised,
    getSumNH3Volatilised: getSumNH3Volatilised,
    getsum30cmActDenitrificationRate: getsum30cmActDenitrificationRate,
    getETa: getETa,
    vw_AtmosphericCO2Concentration: this.vw_AtmosphericCO2Concentration,
    vs_GroundwaterDepth: this.vs_GroundwaterDepth,
    addDailySumFertiliser: addDailySumFertiliser,
    useNMinMineralFertilisingMethod: useNMinMineralFertilisingMethod,
    currentCrop: currentCrop,
    isCropPlanted: isCropPlanted,
    dailySumFertiliser: dailySumFertiliser,
    dailySumIrrigationWater: dailySumIrrigationWater,
    addDailySumIrrigationWater: addDailySumIrrigationWater,
    sumFertiliser: sumFertiliser,
    resetFertiliserCounter: resetFertiliserCounter,
    resetDailyCounter: resetDailyCounter,
    get_AtmosphericCO2Concentration: get_AtmosphericCO2Concentration,
    get_GroundwaterDepth: get_GroundwaterDepth,
    writeOutputFiles: writeOutputFiles,
    soilTemperature: soilTemperature,
    soilMoisture: soilMoisture,
    soilOrganic: soilOrganic,
    soilTransport: soilTransport,
    soilColumn: soilColumn,
    soilColumnNC: soilColumnNC,
    netRadiation: netRadiation,
    daysWithCrop: daysWithCrop,
    getAccumulatedNStress: getAccumulatedNStress,
    getAccumulatedWaterStress: getAccumulatedWaterStress,
    getAccumulatedHeatStress: getAccumulatedHeatStress,
    getAccumulatedOxygenStress: getAccumulatedOxygenStress,
    getIsVegPeriod: getIsVegPeriod
  };

};



var SoilLayer = function (vs_LayerThickness, sps, cpp) {

  var that = this;

  // JS! Contructor with 0 arguments. Only used in SoilTemperature (ground and bottom layer)
  if (arguments.length === 0) {

    this.vs_SoilSandContent = 0.90;
    this.vs_SoilClayContent = 0.05;
    this.vs_SoilStoneContent = 0;
    this.vs_SoilTexture = "Ss";
    this.vs_SoilpH = 7;
    this.vs_SoilMoistureOld_m3 = 0.25;
    this.vs_SoilWaterFlux = 0;
    this.vs_Lambda = 0.5;
    this.vs_FieldCapacity = 0.21;
    this.vs_Saturation = 0.43;
    this.vs_PermanentWiltingPoint = 0.08;
    this.vs_SOM_Slow = 0;
    this.vs_SOM_Fast = 0;
    this.vs_SMB_Slow = 0;
    this.vs_SMB_Fast = 0;
    this.vs_SoilCarbamid = 0;
    this.vs_SoilNH4 = 0.0001;
    this.vs_SoilNO2 = 0.001;
    this.vs_SoilNO3 = 0.001;
    this.vs_SoilFrozen = false;
    var _vs_SoilOrganicCarbon = -1.0;
    var _vs_SoilOrganicMatter = -1.0;
    var _vs_SoilBulkDensity = 0;
    var _vs_SoilMoisture_pF = -1;
    var vs_SoilMoisture_m3 = 0.25;
    var vs_SoilTemperature = 0;
    this.vo_AOM_Pool = [];

    // JV! initialized with default instead of real user values
    var centralParameterProvider = new ParameterProvider(); // JS!
    this.vs_SoilMoisture_m3 = this.vs_FieldCapacity * centralParameterProvider.userInitValues.p_initPercentageFC;
    this.vs_SoilMoistureOld_m3 = this.vs_FieldCapacity * centralParameterProvider.userInitValues.p_initPercentageFC;
    this.vs_SoilNO3 = centralParameterProvider.userInitValues.p_initSoilNitrate;
    this.vs_SoilNH4 = centralParameterProvider.userInitValues.p_initSoilAmmonium;

  } else {

    if (arguments.length !== 3 || !(arguments[2] instanceof ParameterProvider))
      throw new Error('arguments.length !== 3 || !(arguments[2] instanceof ParameterProvider');

    this.vs_LayerThickness = vs_LayerThickness;
    this.vs_SoilSandContent = sps.vs_SoilSandContent;
    this.vs_SoilClayContent = sps.vs_SoilClayContent;
    this.vs_SoilStoneContent = sps.vs_SoilStoneContent;
    this.vs_SoilTexture = sps.vs_SoilTexture;
    this.vs_SoilpH = sps.vs_SoilpH;
    this.vs_SoilMoistureOld_m3 = 0.25; // QUESTION - Warum wird hier mit 0.25 initialisiert?
    this.vs_SoilWaterFlux = 0;
    this.vs_Lambda = sps.vs_Lambda;
    this.vs_FieldCapacity = sps.vs_FieldCapacity;
    this.vs_Saturation = sps.vs_Saturation;
    this.vs_PermanentWiltingPoint = sps.vs_PermanentWiltingPoint;
    this.vs_SOM_Slow = 0;
    this.vs_SOM_Fast = 0;
    this.vs_SMB_Slow = 0;
    this.vs_SMB_Fast = 0;
    this.vs_SoilCarbamid = 0;
    this.vs_SoilNH4 = 0.0001;
    this.vs_SoilNO2 = 0.001;
    this.vs_SoilNO3 = 0.005;
    this.vs_SoilFrozen = false;
    this.centralParameterProvider = cpp;
    var _vs_SoilOrganicCarbon = sps.vs_SoilOrganicCarbon();
    var _vs_SoilOrganicMatter = sps.vs_SoilOrganicMatter();
    var _vs_SoilBulkDensity = sps.vs_SoilBulkDensity();
    var _vs_SoilMoisture_pF = 0;
    var vs_SoilMoisture_m3 = 0.25; // QUESTION - Warum wird hier mit 0.25 initialisiert?
    var vs_SoilTemperature = 0;
    this.vo_AOM_Pool = [];

    if (DEBUG && !((_vs_SoilOrganicCarbon - (_vs_SoilOrganicMatter * ORGANIC_CONSTANTS.PO_SOM_TO_C)) < 0.00001))
      throw new Error("_vs_SoilOrganicCarbon - (_vs_SoilOrganicMatter * ORGANIC_CONSTANTS.PO_SOM_TO_C)) < 0.00001)");

    vs_SoilMoisture_m3 = this.vs_FieldCapacity * cpp.userInitValues.p_initPercentageFC;
    this.vs_SoilMoistureOld_m3 = this.vs_FieldCapacity * cpp.userInitValues.p_initPercentageFC;

    if (sps.vs_SoilAmmonium < 0.0)
      this.vs_SoilNH4 = cpp.userInitValues.p_initSoilAmmonium;
    else
      this.vs_SoilNH4 = sps.vs_SoilAmmonium; // kg m-3

    if (sps.vs_SoilNitrate < 0.0)
      this.vs_SoilNO3 = cpp.userInitValues.p_initSoilNitrate;
    else
      this.vs_SoilNO3 = sps.vs_SoilNitrate;  // kg m-3

  }

  this.vs_SoilNH4_a = 0; /* absorbed, update in soilTransport.step */

  /**
   * @brief Returns value for soil organic carbon.
   *
   * If value for soil organic matter is not defined, because DB does not
   * contain the according value, than the store value for organic carbon
   * is returned. If the soil organic matter parameter is defined,
   * than the value for soil organic carbon is calculated depending on
   * the soil organic matter.
   *
   * @return Value for soil organic carbon
   */
  var vs_SoilOrganicCarbon = function () {
    // if soil organic carbon is not defined, than calculate from soil organic
    // matter value [kg C kg-1]
    if(_vs_SoilOrganicCarbon >= 0.0) {
      return _vs_SoilOrganicCarbon;
    }
    // calculate soil organic carbon with soil organic matter parameter
    return _vs_SoilOrganicMatter * ORGANIC_CONSTANTS.PO_SOM_TO_C;
  };

  /**
   * @brief Returns value for soil organic matter.
   *
   * If the value for soil organic carbon is not defined, because the DB does
   * not contain any value, than the stored value for organic matter
   * is returned. If the soil organic carbon parameter is defined,
   * than the value for soil organic matter is calculated depending on
   * the soil organic carbon.
   *
   * @return Value for soil organic matter
   * */
  var vs_SoilOrganicMatter = function () {
    // if soil organic matter is not defined, calculate from soil organic C
    if(_vs_SoilOrganicMatter >= 0.0) {
      return _vs_SoilOrganicMatter;
    }

    // ansonsten berechne den Wert aus dem C-Gehalt
    return (_vs_SoilOrganicCarbon / ORGANIC_CONSTANTS.PO_SOM_TO_C); //[kg C kg-1]
  };

  /**
   * @brief Returns fraction of silt content of the layer.
   *
   * Calculates the silt particle size fraction in the layer in dependence
   * of its sand and clay content.
   *
   * @return Fraction of silt in the layer.
   */
  var vs_SoilSiltContent = function () {
    return (1 - that.vs_SoilSandContent - that.vs_SoilClayContent);
  };

  /**
   * Soil layer's moisture content, expressed as logarithm of
   * pressure head in cm water column. Algorithm of Van Genuchten is used.
   * Conversion of water saturation into soil-moisture tension.
   *
   * @todo Einheiten prüfen
   */
  var calc_vs_SoilMoisture_pF = function () {
    /** Derivation of Van Genuchten parameters (Vereecken at al. 1989) */
    //TODO Einheiten prüfen
    var vs_ThetaR;
    var vs_ThetaS;

    if (that.vs_PermanentWiltingPoint > 0.0){
      vs_ThetaR = that.vs_PermanentWiltingPoint;
    } else {
      vs_ThetaR = get_PermanentWiltingPoint();
    }

    if (that.vs_Saturation > 0.0){
      vs_ThetaS = that.vs_Saturation;
    } else {
      vs_ThetaS = get_Saturation();
    }

    var vs_VanGenuchtenAlpha = exp(-2.486 + (2.5 * that.vs_SoilSandContent)
                                      - (35.1 * vs_SoilOrganicCarbon())
                                      - (2.617 * (vs_SoilBulkDensity() / 1000.0))
              - (2.3 * that.vs_SoilClayContent));

    var vs_VanGenuchtenM = 1.0;

    var vs_VanGenuchtenN = exp(0.053
                                  - (0.9 * that.vs_SoilSandContent)
                                  - (1.3 * that.vs_SoilClayContent)
          + (1.5 * (pow(that.vs_SoilSandContent, 2.0))));


    /** Van Genuchten retention curve */
    var vs_MatricHead;

    if(get_Vs_SoilMoisture_m3() <= vs_ThetaR) {
      vs_MatricHead = 5.0E+7;
      //else  d_MatricHead = (1.0 / vo_VanGenuchtenAlpha) * (pow(((1 / (pow(((d_SoilMoisture_m3 - d_ThetaR) /
       //                     (d_ThetaS - d_ThetaR)), (1 / vo_VanGenuchtenM)))) - 1), (1 / vo_VanGenuchtenN)));
    }   else {
      vs_MatricHead = (1.0 / vs_VanGenuchtenAlpha)
        * (pow(
            (
                (pow(
                      (
                        (vs_ThetaS - vs_ThetaR) / (get_Vs_SoilMoisture_m3() - vs_ThetaR)
                      ),
                      (
                         1 / vs_VanGenuchtenM
                      )
                    )
                )
                - 1
             ),
             (1 / vs_VanGenuchtenN)
             )
        );
    }

    _vs_SoilMoisture_pF = log10(vs_MatricHead);

    /* set _vs_SoilMoisture_pF to "small" number in case of vs_Theta "close" to vs_ThetaS (vs_Psi < 1 -> log(vs_Psi) < 0) */
    _vs_SoilMoisture_pF = (_vs_SoilMoisture_pF < 0.0) ? 5.0E-7 : _vs_SoilMoisture_pF; 

  };

  /**
   * Soil layer's water content at field capacity (1.8 < pF < 2.1) [m3 m-3]
   *
   * This method applies only in the case when soil charcteristics have not
   * been set before.
   *
   * In german: "Maximaler Wassergehalt, der gegen die Wirkung der
   * Schwerkraft zurückgehalten wird"
   *
   * @todo Einheiten prüfen
   */
  var get_FieldCapacity = function () {

    //***** Derivation of Van Genuchten parameters (Vereecken at al. 1989) *****
    if (that.vs_SoilTexture == "") {
  //    cout << "Field capacity is calculated from van Genuchten parameters" << endl;
      var vs_ThetaR;
      var vs_ThetaS;

      if (that.vs_PermanentWiltingPoint > 0.0){
        vs_ThetaR = that.vs_PermanentWiltingPoint;
      } else {
        vs_ThetaR = get_PermanentWiltingPoint();
      }

      if (that.vs_Saturation > 0.0){
        vs_ThetaS = that.vs_Saturation;
      } else {
        vs_ThetaS = get_Saturation();
      }

      var vs_VanGenuchtenAlpha = exp(-2.486
                + 2.5 * that.vs_SoilSandContent
                - 35.1 * vs_SoilOrganicCarbon()
                - 2.617 * (vs_SoilBulkDensity() / 1000.0)
                - 2.3 * that.vs_SoilClayContent);

      var vs_VanGenuchtenM = 1.0;

      var vs_VanGenuchtenN = exp(0.053
            - 0.9 * that.vs_SoilSandContent
            - 1.3 * that.vs_SoilClayContent
            + 1.5 * (pow(that.vs_SoilSandContent, 2.0)));

      //***** Van Genuchten retention curve to calculate volumetric water content at
      //***** moisture equivalent (Field capacity definition KA5)

      var vs_FieldCapacity_pF = 2.1;
      if ((that.vs_SoilSandContent > 0.48) && (that.vs_SoilSandContent <= 0.9) && (that.vs_SoilClayContent <= 0.12))
        vs_FieldCapacity_pF = 2.1 - (0.476 * (that.vs_SoilSandContent - 0.48));
      else if ((that.vs_SoilSandContent > 0.9) && (that.vs_SoilClayContent <= 0.05))
        vs_FieldCapacity_pF = 1.9;
      else if (that.vs_SoilClayContent > 0.45)
        vs_FieldCapacity_pF = 2.5;
      else if ((that.vs_SoilClayContent > 0.30) && (that.vs_SoilSandContent < 0.2))
        vs_FieldCapacity_pF = 2.4;
      else if (that.vs_SoilClayContent > 0.35)
        vs_FieldCapacity_pF = 2.3;
      else if ((that.vs_SoilClayContent > 0.25) && (that.vs_SoilSandContent < 0.1))
        vs_FieldCapacity_pF = 2.3;
      else if ((that.vs_SoilClayContent > 0.17) && (that.vs_SoilSandContent > 0.68))
        vs_FieldCapacity_pF = 2.2;
      else if ((that.vs_SoilClayContent > 0.17) && (that.vs_SoilSandContent < 0.33))
        vs_FieldCapacity_pF = 2.2;
      else if ((that.vs_SoilClayContent > 0.08) && (that.vs_SoilSandContent < 0.27))
        vs_FieldCapacity_pF = 2.2;
      else if ((that.vs_SoilClayContent > 0.25) && (that.vs_SoilSandContent < 0.25))
        vs_FieldCapacity_pF = 2.2;

      var vs_MatricHead = pow(10, vs_FieldCapacity_pF);

      that.vs_FieldCapacity = vs_ThetaR + ((vs_ThetaS - vs_ThetaR) /
              (pow((1.0 + pow((vs_VanGenuchtenAlpha * vs_MatricHead),
              vs_VanGenuchtenN)), vs_VanGenuchtenM)));

      that.vs_FieldCapacity *= (1.0 - that.vs_SoilStoneContent);
    }

    return that.vs_FieldCapacity;

  };

  /**
   * Soil layer's water content at full saturation (pF=0.0) [m3 m-3].
   * Uses empiric calculation of Van Genuchten. *
   *
   * In german:  Wassergehalt bei maximaler Füllung des Poren-Raums
   *
   * @return Water content at full saturation
   */
  var get_Saturation = function () {
    
    if (that.vs_SoilTexture == "") {
      that.vs_Saturation = 0.81 - 0.283 * (vs_SoilBulkDensity() / 1000.0) + 0.1 * that.vs_SoilClayContent;

      that.vs_Saturation *= (1.0 - that.vs_SoilStoneContent);
    }
    return that.vs_Saturation;
  };

  /**
   * Soil layer's water content at permanent wilting point (pF=4.2) [m3 m-3].
   * Uses empiric calculation of Van Genuchten.
   *
   * In german: Wassergehalt des Bodens am permanenten Welkepunkt.
   *
   * @return Water content at permanent wilting point
   */
  var get_PermanentWiltingPoint = function () {

    if (that.vs_SoilTexture == "") {
  //    cout << "Permanent Wilting Point is calculated from van Genuchten parameters" << endl;
      that.vs_PermanentWiltingPoint = 0.015 + 0.5 * that.vs_SoilClayContent + 1.4 * that.vs_SoilOrganicCarbon();

      that.vs_PermanentWiltingPoint *= (1.0 - that.vs_SoilStoneContent);
    }

    return that.vs_PermanentWiltingPoint;
  };

  /**
   * Returns bulk density of soil layer [kg m-3]
   * @return bulk density of soil layer [kg m-3]
   */
  var vs_SoilBulkDensity = function () {
    return _vs_SoilBulkDensity;
  };

  var set_SoilOrganicMatter =  function (som) {
    _vs_SoilOrganicMatter = som;
  };

  /**
   * Sets value for soil organic carbon.
   * @param soc New value for soil organic carbon.
   */
  var set_SoilOrganicCarbon =  function (soc) {
    _vs_SoilOrganicCarbon = soc;
  };


  /**
   * Returns pH value of soil layer
   * @return pH value of soil layer [ ]
   */
  var get_SoilpH =  function () {
    return that.vs_SoilpH;
  };

  /**
   * Returns soil water pressure head as common logarithm pF.
   * @return soil water pressure head [pF]
   */
  var vs_SoilMoisture_pF =  function () {
    calc_vs_SoilMoisture_pF();
    return _vs_SoilMoisture_pF;
  };

  /**
   * Returns soil ammonium content.
   * @return soil ammonium content [kg N m-3]
   */
  var get_SoilNH4 = function () { return this.vs_SoilNH4; };

  /**
   * Returns absorbed soil ammonium content.
   * @return soil ammonium content [kg N m-3]
   */
  var get_SoilNH4_a = function () { return this.vs_SoilNH4_a; };

  /**
   * Returns soil nitrite content.
   * @return soil nitrite content [kg N m-3]
   */
  var get_SoilNO2 = function () { return this.vs_SoilNO2; };

  /**
   * Returns soil nitrate content.
   * @return soil nitrate content [kg N m-3]
   */
  var get_SoilNO3 = function () { return this.vs_SoilNO3; };

  /**
   * Returns soil carbamide content.
   * @return soil carbamide content [kg m-3]
   */
  var get_SoilCarbamid = function () { return this.vs_SoilCarbamid; };

  /**
   * Returns soil mineral N content.
   * @return soil mineral N content [kg m-3]
   */
  var get_SoilNmin = function () { return this.vs_SoilNO3 + this.vs_SoilNO2 + this.vs_SoilNH4; };
  var get_Vs_SoilMoisture_m3 = function () { return vs_SoilMoisture_m3; };
  var set_Vs_SoilMoisture_m3 = function (ms) { vs_SoilMoisture_m3 = ms; };
  var get_Vs_SoilTemperature = function () { return vs_SoilTemperature; };
  var set_Vs_SoilTemperature = function (st) { vs_SoilTemperature = st; };
  var vs_SoilOrganicCarbon = function () { return _vs_SoilOrganicCarbon; }; /**< Soil layer's organic carbon content [kg C kg-1] */
  var vs_SoilOrganicMatter = function () { return _vs_SoilOrganicMatter; }; /**< Soil layer's organic matter content [kg OM kg-1] */
  var vs_SoilSiltContent = function () { return this.vs_SoilSiltContent; }; /**< Soil layer's silt content [kg kg-1] (Schluff) */

  return {
    // anorganische Stickstoff-Formen
    calc_vs_SoilMoisture_pF: calc_vs_SoilMoisture_pF,
    centralParameterProvider: this.centralParameterProvider,
    get_FieldCapacity: get_FieldCapacity,
    get_PermanentWiltingPoint: get_PermanentWiltingPoint,
    get_Saturation: get_Saturation,
    get_SoilCarbamid: get_SoilCarbamid,
    get_SoilNH4: get_SoilNH4,
    get_SoilNH4_a: get_SoilNH4_a,
    get_SoilNmin: get_SoilNmin,
    get_SoilNO2: get_SoilNO2,
    get_SoilNO3: get_SoilNO3,
    get_SoilpH: get_SoilpH,
    get_Vs_SoilMoisture_m3: get_Vs_SoilMoisture_m3,
    get_Vs_SoilTemperature: get_Vs_SoilTemperature,
    set_SoilOrganicCarbon: set_SoilOrganicCarbon,
    set_SoilOrganicMatter: set_SoilOrganicMatter,
    set_Vs_SoilMoisture_m3: set_Vs_SoilMoisture_m3,
    set_Vs_SoilTemperature: set_Vs_SoilTemperature,
    vo_AOM_Pool: this.vo_AOM_Pool, /**< List of different added organic matter pools in soil layer */
    vs_FieldCapacity: this.vs_FieldCapacity,
    vs_Lambda: this.vs_Lambda, /**< Soil water conductivity coefficient [] */
    vs_LayerThickness: this.vs_LayerThickness, /**< Soil layer's vertical extension [m] */
    vs_PermanentWiltingPoint: this.vs_PermanentWiltingPoint,
    vs_Saturation: this.vs_Saturation,
    vs_SMB_Fast: this.vs_SMB_Fast, /**< C content of soil microbial biomass fast pool size [kg C m-3] */
    vs_SMB_Slow: this.vs_SMB_Slow, /**< C content of soil microbial biomass slow pool size [kg C m-3] */
    vs_SoilBulkDensity: vs_SoilBulkDensity,
    vs_SoilCarbamid: this.vs_SoilCarbamid, /**< Soil layer's carbamide-N content [kg Carbamide-N m-3] */
    vs_SoilClayContent: this.vs_SoilClayContent, /**< Soil layer's clay content [kg kg-1] (Ton) */
    vs_SoilFrozen: this.vs_SoilFrozen,
    vs_SoilMoisture_pF: vs_SoilMoisture_pF,
    vs_SoilMoistureOld_m3: this.vs_SoilMoistureOld_m3, /**< Soil layer's moisture content of previous day [m3 m-3] */
    vs_SoilNH4: this.vs_SoilNH4, /**< Soil layer's NH4-N content [kg NH4-N m-3] */
    vs_SoilNH4_a: this.vs_SoilNH4_a, /**< Soil layer's absorbed NH4-N content [kg NH4-N m-3] */
    vs_SoilNO2: this.vs_SoilNO2, /**< Soil layer's NO2-N content [kg NO2-N m-3] */
    vs_SoilNO3: this.vs_SoilNO3, /**< Soil layer's NO3-N content [kg NO3-N m-3] */
    vs_SoilOrganicCarbon: vs_SoilOrganicCarbon,
    vs_SoilOrganicMatter: vs_SoilOrganicMatter,
    vs_SoilpH: this.vs_SoilpH, /**< Soil pH value [] */
    vs_SoilSandContent: this.vs_SoilSandContent, /**< Soil layer's sand content [kg kg-1] */
    vs_SoilSiltContent: vs_SoilSiltContent,
    vs_SoilStoneContent: this.vs_SoilStoneContent, /**< Soil layer's stone content in soil [kg kg-1] */
    vs_SoilTexture: this.vs_SoilTexture,
    vs_SoilWaterFlux: this.vs_SoilWaterFlux, /**< Water flux at the upper boundary of the soil layer [l m-2] */
    vs_SOM_Fast: this.vs_SOM_Fast, /**< C content of soil organic matter fast pool size [kg C m-3] */
    vs_SOM_Slow: this.vs_SOM_Slow /**< C content of soil organic matter slow pool [kg C m-3] */
  };

};



var SoilColumn = function (gps, sp, cpp) {

  // private properties
  var that = this;
  this.generalParams = gps;
  this.soilParams = sp;
  this.centralParameterProvider = cpp;
  this.cropGrowth = null;
  this._delayedNMinApplications = []; 
  this._vf_TopDressing = 0.0;
  this._vf_TopDressingDelay = 0;
  this._vs_NumberOfOrganicLayers = 0;


  var soilColumnArray = [];
  // public properties and methods
  soilColumnArray.vs_SurfaceWaterStorage = 0.0;
  soilColumnArray.vs_InterceptionStorage = 0.0;
  soilColumnArray.vm_GroundwaterTable = 0;
  soilColumnArray.vs_FluxAtLowerBoundary = 0.0;
  soilColumnArray.vq_CropNUptake = 0.0;
  soilColumnArray.vs_SoilLayers = [];

  logger(MSG.INFO, "Constructor: SoilColumn "  + sp.length);

  for (var i = 0; i < this.soilParams.length; i++) {
    var layer = new SoilLayer(gps.ps_LayerThickness[0], sp[i], cpp);
    soilColumnArray.vs_SoilLayers.push(layer);
    soilColumnArray[i] = layer;
  }

  soilColumnArray.applyMineralFertiliser = function (fp, amount) {

    // C++
    // [kg N ha-1 -> kg m-3]
    // soilLayer(0).vs_SoilNO3 += amount * fp.getNO3() / 10000.0 / soilLayer(0).vs_LayerThickness;
    // soilLayer(0).vs_SoilNH4 += amount * fp.getNH4() / 10000.0 / soilLayer(0).vs_LayerThickness;
    // soilLayer(0).vs_SoilCarbamid += amount * fp.getCarbamid() / 10000.0 / soilLayer(0).vs_LayerThickness;

    // JS
    // [kg N ha-1 -> kg m-3]
    this[0].vs_SoilNO3 += amount * fp.getNO3() / 10000.0 / this[0].vs_LayerThickness;
    this[0].vs_SoilNH4 += amount * fp.getNH4() / 10000.0 / this[0].vs_LayerThickness;
    this[0].vs_SoilCarbamid += amount * fp.getCarbamid() / 10000.0 / this[0].vs_LayerThickness;

    if (DEBUG && this[0].vs_SoilNH4 < 0)
      throw new Error(this[0].vs_SoilNH4);
  };

  // prüft ob top-dressing angewendet werden sollte, ansonsten wird
  // zeitspanne nur reduziert

  /**
   * Tests for every calculation step if a delayed fertilising should be applied.
   * If not, the delay time will be decremented. Otherwise the surplus fertiliser
   * stored in _vf_TopDressing is applied.
   *
   * @see ApplyFertiliser
   */
  soilColumnArray.applyPossibleTopDressing = function () {
    // do nothing if there is no active delay time
    if (that._vf_TopDressingDelay > 0) {
      // if there is a delay time, decrement this value for this time step
      that._vf_TopDressingDelay--;
      // test if now is the correct time for applying top dressing
      if (that._vf_TopDressingDelay == 0) {
        var amount = that._vf_TopDressing;
        this.applyMineralFertiliser(that._vf_TopDressingPartition, amount);
        that._vf_TopDressing = 0;
        return amount;
      }
    }
    return 0.0;
  };


  /**
   * Calls function for applying delayed fertilizer and
   * then removes the first fertilizer item in list.
   */
  soilColumnArray.applyPossibleDelayedFerilizer = function () {
    var delayedApps = that._delayedNMinApplications;
    var n_amount = 0.0;
    while(!delayedApps.length === 0) {
      n_amount += delayedApps[0].func.apply(this, delayedApps[0].args);
      delayedApps.shift();
      // JS: delayedApps === _delayedNMinApplications
      if (DEBUG && delayedApps != _delayedNMinApplications)
        throw new Error(delayedApps);
      // _delayedNMinApplications.shift();
    }
    return n_amount;
  };


  /**
   * Method for calculating fertilizer demand from crop demand and soil mineral
   * status (Nmin method).
   *
   * @param fp
   * @param vf_SamplingDepth
   * @param vf_CropNTarget N availability required by the crop down to rooting depth
   * @param vf_CropNTarget30 N availability required by the crop down to 30 cm
   * @param vf_FertiliserMaxApplication Maximal value of N that can be applied until the crop will be damaged
   * @param vf_FertiliserMinApplication Threshold value for economically reasonable fertilizer application
   * @param vf_TopDressingDelay Number of days for which the application of surplus fertilizer is delayed
   */
  soilColumnArray.applyMineralFertiliserViaNMinMethod = function (
    fp,
    vf_SamplingDepth,
    vf_CropNTarget,
    vf_CropNTarget30,
    vf_FertiliserMinApplication,
    vf_FertiliserMaxApplication,
    vf_TopDressingDelay 
  ) {

    // JS: soilLayer(x) === this[x]

    // Wassergehalt > Feldkapazität
    if(this[0].get_Vs_SoilMoisture_m3() > this[0].get_FieldCapacity()) {
      that._delayedNMinApplications.push({
        func: this.applyMineralFertiliserViaNMinMethod,
        args: [fp, vf_SamplingDepth, vf_CropNTarget, vf_CropNTarget30, vf_FertiliserMinApplication, vf_FertiliserMaxApplication, vf_TopDressingDelay]
      });
      logger(MSG.WARN, "Soil too wet for fertilisation. Fertiliser event adjourned to next day.");
      return 0.0;
    }

    var vf_SoilNO3Sum = 0.0;
    var vf_SoilNO3Sum30 = 0.0;
    var vf_SoilNH4Sum = 0.0;
    var vf_SoilNH4Sum30 = 0.0;
    var vf_Layer30cm = this.getLayerNumberForDepth(0.3);

    // JS
    var i_Layers = ceil(vf_SamplingDepth / this[i_Layer].vs_LayerThickness);
    for (var i_Layer = 0; i_Layer < i_Layers; i_Layer++) {
      //vf_TargetLayer is in cm. We want number of layers
      vf_SoilNO3Sum += this[i_Layer].vs_SoilNO3; //! [kg N m-3]
      vf_SoilNH4Sum += this[i_Layer].vs_SoilNH4; //! [kg N m-3]
    }

    // Same calculation for a depth of 30 cm
    /** @todo Must be adapted when using variable layer depth. */
    for(var i_Layer = 0; i_Layer < vf_Layer30cm; i_Layer++) {
      vf_SoilNO3Sum30 += this[i_Layer].vs_SoilNO3; //! [kg N m-3]
      vf_SoilNH4Sum30 += this[i_Layer].vs_SoilNH4; //! [kg N m-3]
    }

    // Converts [kg N ha-1] to [kg N m-3]
    var vf_CropNTargetValue = vf_CropNTarget / 10000.0 / this[0].vs_LayerThickness;

    // Converts [kg N ha-1] to [kg N m-3]
    var vf_CropNTargetValue30 = vf_CropNTarget30 / 10000.0 / this[0].vs_LayerThickness;

    var vf_FertiliserDemandVol = vf_CropNTargetValue - (vf_SoilNO3Sum + vf_SoilNH4Sum);
    var vf_FertiliserDemandVol30 = vf_CropNTargetValue30 - (vf_SoilNO3Sum30 + vf_SoilNH4Sum30);

    // Converts fertiliser demand back from [kg N m-3] to [kg N ha-1]
    var vf_FertiliserDemand = vf_FertiliserDemandVol * 10000.0 * this[0].vs_LayerThickness;
    var vf_FertiliserDemand30 = vf_FertiliserDemandVol30 * 10000.0 * this[0].vs_LayerThickness;

    var vf_FertiliserRecommendation = max(vf_FertiliserDemand, vf_FertiliserDemand30);

    if (vf_FertiliserRecommendation < vf_FertiliserMinApplication) {
      // If the N demand of the crop is smaller than the user defined
      // minimum fertilisation then no need to fertilise
      vf_FertiliserRecommendation = 0.0;
      logger(MSG.WARN, "Fertiliser demand below minimum application value. No fertiliser applied.");
    }

    if( vf_FertiliserRecommendation > vf_FertiliserMaxApplication) {
      // If the N demand of the crop is greater than the user defined
      // maximum fertilisation then need to split so surplus fertilizer can
      // be applied after a delay time
      that._vf_TopDressing = vf_FertiliserRecommendation - vf_FertiliserMaxApplication;
      that._vf_TopDressingPartition = fp;
      that._vf_TopDressingDelay = vf_TopDressingDelay;
      vf_FertiliserRecommendation = vf_FertiliserMaxApplication;
      logger(MSG.WARN, 
        "Fertiliser demand above maximum application value. " +
        "A top dressing of " + _vf_TopDressing + " " + 
        "will be applied from now on day" + vf_TopDressingDelay + "."
       );
    }

    //Apply fertiliser
    this.applyMineralFertiliser(fp, vf_FertiliserRecommendation);

    logger(MSG.INFO, "SoilColumn::applyMineralFertiliserViaNMinMethod:\t" + vf_FertiliserRecommendation);

    //apply the callback to all of the fertiliser, even though some if it
    //(the top-dressing) will only be applied later
    //we simply assume it really will be applied, in the worst case
    //the delay is so long, that the crop is already harvested until
    //the top-dressing will be applied
     return vf_FertiliserRecommendation;// + _vf_TopDressing);
  };

  /**
   * Method for calculating irrigation demand from soil moisture status.
   * The trigger will be activated and deactivated according to crop parameters
   * (temperature sum)
   *
   * @param vi_IrrigationThreshold
   * @return could irrigation be applied
   */
  soilColumnArray.soilColumnArrayapplyIrrigationViaTrigger = function (
    vi_IrrigationThreshold,
    vi_IrrigationAmount,
    vi_IrrigationNConcentration
  ) {

    // JS: soilLayer(x) === this[x]


    //is actually only called from cropStep and thus there should always
    //be a crop
    if (that.cropGrowth === null)
      logger(MSG.ERROR, "crop is null");

    var s = that.cropGrowth.get_HeatSumIrrigationStart();
    var e = that.cropGrowth.get_HeatSumIrrigationEnd();
    var cts = that.cropGrowth.get_CurrentTemperatureSum();

    if (cts < s || cts > e) return false;

    var vi_CriticalMoistureDepth = that.centralParameterProvider.userSoilMoistureParameters.pm_CriticalMoistureDepth;

    // Initialisation
    var vi_ActualPlantAvailableWater = 0.0;
    var vi_MaxPlantAvailableWater = 0.0;
    var vi_PlantAvailableWaterFraction = 0.0;
    var vi_CriticalMoistureLayer = int(ceil(vi_CriticalMoistureDepth / that[0].vs_LayerThickness));

    for (var i_Layer = 0; i_Layer < vi_CriticalMoistureLayer; i_Layer++){
      vi_ActualPlantAvailableWater += (this[i_Layer].get_Vs_SoilMoisture_m3()
                                   - this[i_Layer].get_PermanentWiltingPoint())
                                   * this.vs_LayerThickness() * 1000.0; // [mm]
      vi_MaxPlantAvailableWater += (this[i_Layer].get_FieldCapacity()
                                   - this[i_Layer].get_PermanentWiltingPoint())
                                   * this.vs_LayerThickness() * 1000.0; // [mm]
      vi_PlantAvailableWaterFraction = vi_ActualPlantAvailableWater
                                         / vi_MaxPlantAvailableWater; // []
    }
    if (vi_PlantAvailableWaterFraction <= vi_IrrigationThreshold) {
      this.applyIrrigation(vi_IrrigationAmount, vi_IrrigationNConcentration);

      logger(MSG.INFO, 
        "applying automatic irrigation treshold: " + vi_IrrigationThreshold +
        " amount: " + vi_IrrigationAmount +
        " N concentration: " + vi_IrrigationNConcentration
      );

      return true;
    }

    return false;
  };

  /**
   * @brief Applies irrigation
   *
   * @author: Claas Nendel
   */
  soilColumnArray.applyIrrigation = function (vi_IrrigationAmount, vi_IrrigationNConcentration) {

    // JS: soilLayer(x) === this[x]

    var vi_NAddedViaIrrigation = 0.0; //[kg m-3]

    // Adding irrigation water amount to surface water storage
    this.vs_SurfaceWaterStorage += vi_IrrigationAmount; // [mm]

    vi_NAddedViaIrrigation = vi_IrrigationNConcentration * // [mg dm-3]
             vi_IrrigationAmount / //[dm3 m-2]
             this[0].vs_LayerThickness / 1000000.0; // [m]
             // [-> kg m-3]

    // Adding N from irrigation water to top soil nitrate pool
    this[0].vs_SoilNO3 += vi_NAddedViaIrrigation;
  };

  /**
   * @brief Checks and deletes AOM pool
   *
   * This method checks the content of each AOM Pool. In case the sum over all
   * layers of a respective pool is very low the pool will be deleted from the
   * list.
   *
   * @author: Claas Nendel
   */
  soilColumnArray.deleteAOMPool = function () {

    // JS: soilLayer(x) === this[x]
     // !JS do not remove first pool (root decay) start with index 1
    for (var i_AOMPool = 1; i_AOMPool < this[0].vo_AOM_Pool.length;) {

      var vo_SumAOM_Slow = 0.0;
      var vo_SumAOM_Fast = 0.0;

      for (var i_Layer = 0; i_Layer < that._vs_NumberOfOrganicLayers; i_Layer++) {
        vo_SumAOM_Slow += this[i_Layer].vo_AOM_Pool[i_AOMPool].vo_AOM_Slow;
        vo_SumAOM_Fast += this[i_Layer].vo_AOM_Pool[i_AOMPool].vo_AOM_Fast;
      }

      //cout << "Pool " << i_AOMPool << " -> Slow: " << vo_SumAOM_Slow << "; Fast: " << vo_SumAOM_Fast << endl;

      if ((vo_SumAOM_Slow + vo_SumAOM_Fast) < 0.00001) {
        for (var i_Layer = 0; i_Layer < that._vs_NumberOfOrganicLayers; i_Layer++){
          var it_AOMPool = 0; // TODO: Korrekt in JS? Konstruktion nicht klar
          it_AOMPool += i_AOMPool;
          this[i_Layer].vo_AOM_Pool.splice(it_AOMPool, 1);
        }
      } else {
        i_AOMPool++;
      }
    }

  };

  soilColumnArray.vs_NumberOfLayers = function () {
    return this.length;
  };

  /**
   * Applies tillage to effected layers. Parameters for effected soil layers
   * are averaged.
   * @param depth Depth of affected soil.
   */
  soilColumnArray.applyTillage = function (depth) {

    // JS: soilLayer(x) === this[x]

    var layer_index = this.getLayerNumberForDepth(depth) + 1;

    var soil_organic_carbon = 0.0;
    var soil_organic_matter = 0.0;
    var soil_temperature = 0.0;
    var soil_moisture = 0.0;
    var soil_moistureOld = 0.0;
    var som_slow = 0.0;
    var som_fast = 0.0;
    var smb_slow = 0.0;
    var smb_fast = 0.0;
    var carbamid = 0.0;
    var nh4 = 0.0;
    var no2 = 0.0;
    var no3 = 0.0;

    // add up all parameters that are affected by tillage
    for (var i = 0; i < layer_index; i++) {
      soil_organic_carbon += this[i].vs_SoilOrganicCarbon();
      soil_organic_matter += this[i].vs_SoilOrganicMatter();
      soil_temperature += this[i].get_Vs_SoilTemperature();
      soil_moisture += this[i].get_Vs_SoilMoisture_m3();
      soil_moistureOld += this[i].vs_SoilMoistureOld_m3;
      som_slow += this[i].vs_SOM_Slow;
      som_fast += this[i].vs_SOM_Fast;
      smb_slow += this[i].vs_SMB_Slow;
      smb_fast += this[i].vs_SMB_Fast;
      carbamid += this[i].vs_SoilCarbamid;
      nh4 += this[i].vs_SoilNH4;
      no2 += this[i].vs_SoilNO2;
      no3 += this[i].vs_SoilNO3;
    }

    if (DEBUG && this[0].vs_SoilNH4 < 0)
      throw new Error(this[0].vs_SoilNH4);
    if (DEBUG && this[0].vs_SoilNO2 < 0)
      throw new Error(this[0].vs_SoilNO2);
    if (DEBUG && this[0].vs_SoilNO3 < 0)
      throw new Error(this[0].vs_SoilNO3);

    // calculate mean value of accumulated soil paramters
    soil_organic_carbon = soil_organic_carbon / layer_index;
    soil_organic_matter = soil_organic_matter / layer_index;
    soil_temperature = soil_temperature / layer_index;
    soil_moisture = soil_moisture / layer_index;
    soil_moistureOld = soil_moistureOld / layer_index;
    som_slow = som_slow / layer_index;
    som_fast = som_fast / layer_index;
    smb_slow = smb_slow / layer_index;
    smb_fast = smb_fast / layer_index;
    carbamid = carbamid / layer_index;
    nh4 = nh4 / layer_index;
    no2 = no2 / layer_index;
    no3 = no3 / layer_index;

    // use calculated mean values for all affected layers
    for (var i = 0; i < layer_index; i++) {

      //assert((soil_organic_carbon - (soil_organic_matter * ORGANIC_CONSTANTS.PO_SOM_TO_C)) < 0.00001);
      this[i].set_SoilOrganicCarbon(soil_organic_carbon);
      this[i].set_SoilOrganicMatter(soil_organic_matter);
      this[i].set_Vs_SoilTemperature(soil_temperature);
      this[i].set_Vs_SoilMoisture_m3(soil_moisture);
      this[i].vs_SoilMoistureOld_m3 = soil_moistureOld;
      this[i].vs_SOM_Slow = som_slow;
      this[i].vs_SOM_Fast = som_fast;
      this[i].vs_SMB_Slow = smb_slow;
      this[i].vs_SMB_Fast = smb_fast;
      this[i].vs_SoilCarbamid = carbamid;
      this[i].vs_SoilNH4 = nh4;
      this[i].vs_SoilNO2 = no2;
      this[i].vs_SoilNO3 = no3;
      
      if (DEBUG && this[i].vs_SoilNH4 < 0)
        throw new Error(this[i].vs_SoilNH4);
      if (DEBUG && this[i].vs_SoilNO2 < 0)
        throw new Error(this[i].vs_SoilNO2);
      if (DEBUG && this[i].vs_SoilNO3 < 0)
        throw new Error(this[i].vs_SoilNO3);

    }

    // merge aom pool
    var aom_pool_count = this[0].vo_AOM_Pool.length;

    if (aom_pool_count > 0) {
      var aom_slow = new Array(aom_pool_count);
      var aom_fast = new Array(aom_pool_count);

      // initialization of aom pool accumulator
      for (var pool_index = 0; pool_index < aom_pool_count; pool_index++) {
        aom_slow[pool_index] = 0.0;
        aom_fast[pool_index] = 0.0;
      }

      layer_index = min(layer_index, this.vs_NumberOfOrganicLayers());

      //cout << "Soil parameters before applying tillage for the first "<< layer_index+1 << " layers: " << endl;

      // add up pools for affected layer with same index
      for (var j = 0; j < layer_index; j++) {
        //cout << "Layer " << j << endl << endl;

        var layer = this[j];
        var pool_index = 0;
        layer.vo_AOM_Pool.forEach(function (it_AOM_Pool) {

          aom_slow[pool_index] += it_AOM_Pool.vo_AOM_Slow;
          aom_fast[pool_index] += it_AOM_Pool.vo_AOM_Fast;

          //cout << "AOMPool " << pool_index << endl;
          //cout << "vo_AOM_Slow:\t"<< it_AOM_Pool.vo_AOM_Slow << endl;
          //cout << "vo_AOM_Fast:\t"<< it_AOM_Pool.vo_AOM_Fast << endl;

          pool_index++;
        });
      }

      //
      for (var pool_index = 0; pool_index < aom_pool_count; pool_index++) {
        aom_slow[pool_index] = aom_slow[pool_index] / (layer_index);
        aom_fast[pool_index] = aom_fast[pool_index] / (layer_index);
      }

      //cout << "Soil parameters after applying tillage for the first "<< layer_index+1 << " layers: " << endl;

      // rewrite parameters of aom pool with mean values
      for (var j = 0; j < layer_index; j++) {
        layer = this[j];
        //cout << "Layer " << j << endl << endl;
        var pool_index = 0;
        layer.vo_AOM_Pool.forEach(function (it_AOM_Pool) {

          it_AOM_Pool.vo_AOM_Slow = aom_slow[pool_index];
          it_AOM_Pool.vo_AOM_Fast = aom_fast[pool_index];

          //cout << "AOMPool " << pool_index << endl;
          //cout << "vo_AOM_Slow:\t"<< it_AOM_Pool.vo_AOM_Slow << endl;
          //cout << "vo_AOM_Fast:\t"<< it_AOM_Pool.vo_AOM_Fast << endl;

          pool_index++;
        });
      }
    }

    //cout << "soil_organic_carbon: " << soil_organic_carbon << endl;
    //cout << "soil_organic_matter: " << soil_organic_matter << endl;
    //cout << "soil_temperature: " << soil_temperature << endl;
    //cout << "soil_moisture: " << soil_moisture << endl;
    //cout << "soil_moistureOld: " << soil_moistureOld << endl;
    //cout << "som_slow: " << som_slow << endl;
    //cout << "som_fast: " << som_fast << endl;
    //cout << "smb_slow: " << smb_slow << endl;
    //cout << "smb_fast: " << smb_fast << endl;
    //cout << "carbamid: " << carbamid << endl;
    //cout << "nh4: " << nh4 << endl;
    //cout << "no3: " << no3 << endl << endl;
  };

  /**
   * Returns number of organic layers. Usually the number
   * of layers in the first 30 cm depth of soil.
   * @return Number of organic layers
   */
  soilColumnArray.vs_NumberOfOrganicLayers = function () {
    return that._vs_NumberOfOrganicLayers;
  };


  /**
   * Returns a soil layer at given Index.
   * @return Reference to a soil layer
   */
  soilColumnArray.soilLayer = function (i_Layer) {
    return this[i_Layer];
  };

  /**
   * Returns the thickness of a layer.
   * Right now by definition all layers have the same size,
   * therefor only the thickness of first layer is returned.
   *
   * @return Size of a layer
   *
   * @todo Need to be changed if different layer sizes are used.
   */
  soilColumnArray.vs_LayerThickness = function () {
    return this[0].vs_LayerThickness;
  };

  /**
   * @brief Returns daily crop N uptake [kg N ha-1 d-1]
   * @return Daily crop N uptake
   */
  soilColumnArray.get_DailyCropNUptake = function () {
    return this.vq_CropNUptake * 10000.0;
  };

  /**
   * @brief Returns index of layer that lays in the given depth.
   * @param depth Depth in meters
   * @return Index of layer
   */
  soilColumnArray.getLayerNumberForDepth = function (depth) {

    var layer = 0;
    var size= this.length;
    var accu_depth = 0;
    var layer_thickness= this[0].vs_LayerThickness;

    // find number of layer that lay between the given depth
    for (var i = 0; i < size; i++) {
      accu_depth += layer_thickness;
      if (depth <= accu_depth)
        break;
      layer++;
    }

    return layer;
  };

  /**
   * @brief Makes crop information available when needed.
   *
   * @return crop object
   */
  soilColumnArray.put_Crop = function (c) {
      that.cropGrowth = c;
  };

  /**
   * @brief Deletes crop object when not needed anymore.
   *
   * @return crop object is NULL
   */
  soilColumnArray.remove_Crop = function () {
      that.cropGrowth = null;
  };

  /**
   * Returns sum of soiltemperature for several soil layers.
   * @param layers Number of layers that are of interest
   * @return Temperature sum
   */
  soilColumnArray.sumSoilTemperature = function (layers) {
    var accu = 0.0;
    for (var i = 0; i < layers; i++)
      accu += this[i].get_Vs_SoilTemperature();
    return accu;
  };

  soilColumnArray.vs_NumberOfLayers = function () {
      return this.length;
  };



  // end soilColumnArray

  // private methods

  /**
   * @brief Calculates number of organic layers.
   *
   * Calculates number of organic layers in in in dependency on
   * the layer depth and the ps_MaxMineralisationDepth. Result is saved
   * in private member variable _vs_NumberOfOrganicLayers.
   */
  var set_vs_NumberOfOrganicLayers = function () {
    var lsum = 0;
    var count = 0;
    for (var i = 0; i < soilColumnArray.vs_NumberOfLayers(); i++) {
      count++;
      lsum += soilColumnArray.vs_SoilLayers[i].vs_LayerThickness;
      if (lsum >= that.generalParams.ps_MaxMineralisationDepth)
        break;
    }
    that._vs_NumberOfOrganicLayers = count;
  };

  // apply set_vs_NumberOfOrganicLayers
  set_vs_NumberOfOrganicLayers();

  // !JS create a default root decay pool at index 0 that gets not deleted
  for(var i_Layer = 0; i_Layer < that._vs_NumberOfOrganicLayers; i_Layer++) {
    var aom = new AOM_Properties();
    /* parameters from wheat residuals. TODO: look for specific parameters for root decay in DAISY */
      aom.vo_AOM_DryMatterContent = 1;
      aom.vo_AOM_NH4Content = 0;
      aom.vo_AOM_NO3Content = 0;
      aom.vo_AOM_CarbamidContent = 0;
      aom.vo_AOM_SlowDecCoeffStandard = 0.012;
      aom.vo_AOM_FastDecCoeffStandard = 0.05;
      aom.vo_PartAOM_to_AOM_Slow = 0.67;
      aom.vo_PartAOM_to_AOM_Fast = 0.33;
      aom.vo_CN_Ratio_AOM_Slow = 200;
      aom.vo_CN_Ratio_AOM_Fast = 0;
      aom.vo_PartAOM_Slow_to_SMB_Slow = 0.5;
      aom.vo_PartAOM_Slow_to_SMB_Fast = 0.5;
      aom.vo_NConcentration = 0;
    soilColumnArray[i_Layer].vo_AOM_Pool[0] = aom;
  }

  return soilColumnArray;

};



var SoilOrganic = function (sc, gps, stps, cpp) {

  var soilColumn = sc,
      generalParams = gps,
      siteParams = stps,
      centralParameterProvider = cpp,
      vs_NumberOfLayers = sc.vs_NumberOfLayers(),
      vs_NumberOfOrganicLayers = sc.vs_NumberOfOrganicLayers(),
      addedOrganicMatter = false,
      irrigationAmount = 0,
      vo_ActDenitrificationRate = new Float64Array(sc.vs_NumberOfOrganicLayers()),  //[kg N m-3 d-1]
      vo_AOM_FastDeltaSum =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_AOM_FastInput = 0,
      vo_AOM_FastSum =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_AOM_SlowDeltaSum =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_AOM_SlowInput = 0,
      vo_AOM_SlowSum =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_CBalance =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_DecomposerRespiration = 0.0,
      vo_InertSoilOrganicC =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_N2O_Produced = 0.0,
      vo_NetEcosystemExchange = 0.0,
      vo_NetEcosystemProduction = 0.0,
      vo_NetNMineralisation = 0.0,
      vo_NetNMineralisationRate =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_Total_NH3_Volatilised = 0.0,
      vo_NH3_Volatilised = 0.0,
      vo_SMB_CO2EvolutionRate =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SMB_FastDelta =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SMB_SlowDelta =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SoilOrganicC =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SOM_FastDelta =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SOM_FastInput = 0,
      vo_SOM_SlowDelta =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SumDenitrification = 0.0,
      vo_SumNetNMineralisation = 0.0,
      vo_SumN2O_Produced = 0.0,
      vo_SumNH3_Volatilised = 0.0,
      vo_TotalDenitrification = 0.0,
      incorporation = false,
      crop = null;

      // JS! unused in cpp
      // vs_SoilMineralNContent = new Float64Array(sc.vs_NumberOfOrganicLayers()),


  // Subroutine Pool initialisation
  var po_SOM_SlowUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_SOM_SlowUtilizationEfficiency;
  var po_PartSOM_to_SMB_Slow = centralParameterProvider.userSoilOrganicParameters.po_PartSOM_to_SMB_Slow;
  var po_SOM_FastUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_SOM_FastUtilizationEfficiency;
  var po_PartSOM_to_SMB_Fast = centralParameterProvider.userSoilOrganicParameters.po_PartSOM_to_SMB_Fast;
  var po_SOM_SlowDecCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_SOM_SlowDecCoeffStandard;
  var po_SOM_FastDecCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_SOM_FastDecCoeffStandard;
  var po_PartSOM_Fast_to_SOM_Slow = centralParameterProvider.userSoilOrganicParameters.po_PartSOM_Fast_to_SOM_Slow;

  //Conversion of soil organic carbon weight fraction to volume unit
  for(var i_Layer = 0; i_Layer < vs_NumberOfOrganicLayers; i_Layer++) {

    vo_SoilOrganicC[i_Layer] = soilColumn[i_Layer].vs_SoilOrganicCarbon() * soilColumn[i_Layer].vs_SoilBulkDensity(); //[kg C kg-1] * [kg m-3] --> [kg C m-3]

    // Falloon et al. (1998): Estimating the size of the inert organic matter pool
    // from total soil oragnic carbon content for use in the Rothamsted Carbon model.
    // Soil Biol. Biochem. 30 (8/9), 1207-1211. for values in t C ha-1.
  // vo_InertSoilOrganicC is calculated back to [kg C m-3].
    vo_InertSoilOrganicC[i_Layer] = (0.049 * pow((vo_SoilOrganicC[i_Layer] // [kg C m-3]
            * soilColumn[i_Layer].vs_LayerThickness // [kg C m-2]
            / 1000 * 10000.0), 1.139)) // [t C ha-1]
          / 10000.0 * 1000.0 // [kg C m-2]
          / soilColumn[i_Layer].vs_LayerThickness; // [kg C m-3]

    vo_SoilOrganicC[i_Layer] -= vo_InertSoilOrganicC[i_Layer]; // [kg C m-3]

    // Initialisation of pool SMB_Slow [kg C m-3]
    soilColumn[i_Layer].vs_SMB_Slow = po_SOM_SlowUtilizationEfficiency
         * po_PartSOM_to_SMB_Slow * vo_SoilOrganicC[i_Layer];

    // Initialisation of pool SMB_Fast [kg C m-3]
    soilColumn[i_Layer].vs_SMB_Fast = po_SOM_FastUtilizationEfficiency
              * po_PartSOM_to_SMB_Fast * vo_SoilOrganicC[i_Layer];

    // Initialisation of pool SOM_Slow [kg C m-3]
    soilColumn[i_Layer].vs_SOM_Slow = vo_SoilOrganicC[i_Layer] / (1.0 + po_SOM_SlowDecCoeffStandard
              / (po_SOM_FastDecCoeffStandard * po_PartSOM_Fast_to_SOM_Slow));

    // Initialisation of pool SOM_Fast [kg C m-3]
    soilColumn[i_Layer].vs_SOM_Fast = vo_SoilOrganicC[i_Layer] - soilColumn[i_Layer].vs_SOM_Slow;

    // Soil Organic Matter pool update [kg C m-3]
    vo_SoilOrganicC[i_Layer] -= soilColumn[i_Layer].vs_SMB_Slow + soilColumn[i_Layer].vs_SMB_Fast;

    soilColumn[i_Layer].set_SoilOrganicCarbon((vo_SoilOrganicC[i_Layer] + vo_InertSoilOrganicC[i_Layer]) / soilColumn[i_Layer].vs_SoilBulkDensity()); // [kg C m-3] / [kg m-3] --> [kg C kg-1]

  soilColumn[i_Layer].set_SoilOrganicMatter((vo_SoilOrganicC[i_Layer] + vo_InertSoilOrganicC[i_Layer]) / ORGANIC_CONSTANTS.PO_SOM_TO_C
              / soilColumn[i_Layer].vs_SoilBulkDensity());  // [kg C m-3] / [kg m-3] --> [kg C kg-1]


    vo_ActDenitrificationRate[i_Layer] = 0.0;
  } // for

  var step = function (
    vw_MeanAirTemperature,
    vw_Precipitation,
    vw_WindSpeed
    ) 
  {

    var vc_NetPrimaryProduction = crop ? crop.get_NetPrimaryProduction() : 0;

    //fo_OM_Input(vo_AOM_Addition);
    fo_Urea(vw_Precipitation + irrigationAmount);
    // Mineralisation Immobilisitation Turn-Over
    fo_MIT();
    fo_Volatilisation(addedOrganicMatter, vw_MeanAirTemperature, vw_WindSpeed);
    fo_Nitrification();
    fo_Denitrification();
    fo_N2OProduction();
    fo_PoolUpdate();

    vo_NetEcosystemProduction =
            fo_NetEcosystemProduction(vc_NetPrimaryProduction, vo_DecomposerRespiration);
    vo_NetEcosystemExchange =
            fo_NetEcosystemExchange(vc_NetPrimaryProduction, vo_DecomposerRespiration);

    vo_SumNH3_Volatilised += vo_NH3_Volatilised;

    vo_SumN2O_Produced += vo_N2O_Produced;

    //clear everything for next step
    //thus in order apply irrigation water or fertiliser, this has to be
    //done before the stepping method
    irrigationAmount = 0.0;
    vo_AOM_SlowInput = 0.0;
    vo_AOM_FastInput = 0.0;
    vo_SOM_FastInput = 0.0;
    addedOrganicMatter = false;

    /* add senescenced root */
    if (crop && crop.hasOwnProperty('senescencedTissue')) { // not implemented in generic crop

      var AOM = crop.senescencedTissue();
      var nools = soilColumn.vs_NumberOfOrganicLayers();
    
      for (var i_Layer = 0; i_Layer < nools; i_Layer++) {
        var aom_senescence = soilColumn[i_Layer].vo_AOM_Pool[0];
        var aom = AOM[i_Layer];
        if (aom.vo_CN_Ratio_AOM_Slow > 0) {
          aom_senescence.vo_CN_Ratio_AOM_Slow = (
            (aom_senescence.vo_AOM_Slow + aom.vo_AOM_Slow) /
            ((1 / aom_senescence.vo_CN_Ratio_AOM_Slow * aom_senescence.vo_AOM_Slow) + (1 / aom.vo_CN_Ratio_AOM_Slow * aom.vo_AOM_Slow))
          );
        }
        aom_senescence.vo_AOM_Slow += aom.vo_AOM_Slow;

      }
    }


  };

  var addOrganicMatter = function (
    params,
    amount, /* [kg FM ha-1] */ 
    nConcentration
    )
  {
    var vo_AddedOrganicMatterAmount = amount;
    var vo_AddedOrganicMatterNConcentration = nConcentration;

    var vo_AOM_DryMatterContent = params.vo_AOM_DryMatterContent;
    var vo_AOM_NH4Content = params.vo_AOM_NH4Content;
    var vo_AOM_NO3Content = params.vo_AOM_NO3Content;
    var vo_AOM_CarbamidContent = params.vo_AOM_CarbamidContent;
    var vo_PartAOM_to_AOM_Slow = params.vo_PartAOM_to_AOM_Slow;
    var vo_PartAOM_to_AOM_Fast = params.vo_PartAOM_to_AOM_Fast;
    var vo_CN_Ratio_AOM_Slow = params.vo_CN_Ratio_AOM_Slow;
    var vo_CN_Ratio_AOM_Fast = params.vo_CN_Ratio_AOM_Fast;

    var po_AOM_FastMaxC_to_N = centralParameterProvider.userSoilOrganicParameters.po_AOM_FastMaxC_to_N;

    //urea
    if (soilColumn.vs_NumberOfOrganicLayers() > 0) {
      // kg N m-3 soil
      soilColumn[0].vs_SoilCarbamid += vo_AddedOrganicMatterAmount
               * vo_AOM_DryMatterContent * vo_AOM_CarbamidContent
               / 10000.0 / soilColumn[0].vs_LayerThickness;
    }

    var vo_AddedOrganicCarbonAmount = 0.0;
    var vo_AddedOrganicNitrogenAmount = 0.0;

    //MIT
    var nools = soilColumn.vs_NumberOfOrganicLayers();
    
    for(var i_Layer = 0; i_Layer < nools; i_Layer++) {
      //New AOM pool
      if(i_Layer == 0) {
        var aom_pool = new AOM_Properties();

        aom_pool.vo_DaysAfterApplication = 0;
        aom_pool.vo_AOM_DryMatterContent = vo_AOM_DryMatterContent;
        aom_pool.vo_AOM_NH4Content = vo_AOM_NH4Content;
        aom_pool.vo_AOM_Slow = 0.0;
        aom_pool.vo_AOM_Fast = 0.0;
        aom_pool.vo_AOM_SlowDecCoeffStandard = params.vo_AOM_SlowDecCoeffStandard;
        aom_pool.vo_AOM_FastDecCoeffStandard = params.vo_AOM_FastDecCoeffStandard;
        aom_pool.vo_CN_Ratio_AOM_Slow = vo_CN_Ratio_AOM_Slow;
        aom_pool.incorporation = incorporation;

        // Converting AOM from kg FM OM ha-1 to kg C m-3
        vo_AddedOrganicCarbonAmount = vo_AddedOrganicMatterAmount * vo_AOM_DryMatterContent * ORGANIC_CONSTANTS.PO_AOM_TO_C
              / 10000.0 / soilColumn[0].vs_LayerThickness;

        if(vo_CN_Ratio_AOM_Fast <= 1.0E-7) {
          // Wenn in der Datenbank hier Null steht, handelt es sich um einen
          // Pflanzenrückstand. Dann erfolgt eine dynamische Berechnung des
          // C/N-Verhältnisses. Für Wirtschafstdünger ist dieser Wert
          // parametrisiert.

          // Converting AOM N content from kg N kg DM-1 to kg N m-3
          vo_AddedOrganicNitrogenAmount = vo_AddedOrganicMatterAmount * vo_AOM_DryMatterContent
          * vo_AddedOrganicMatterNConcentration / 10000.0 / soilColumn[0].vs_LayerThickness;

          if(vo_AddedOrganicMatterNConcentration <= 0.0) {
            vo_AddedOrganicNitrogenAmount = 0.01;
          }

          // Assigning the dynamic C/N ratio to the AOM_Fast pool
          if((vo_AddedOrganicCarbonAmount * vo_PartAOM_to_AOM_Slow / vo_CN_Ratio_AOM_Slow)
              < vo_AddedOrganicNitrogenAmount) {

            vo_CN_Ratio_AOM_Fast = (vo_AddedOrganicCarbonAmount * vo_PartAOM_to_AOM_Fast)
              / (vo_AddedOrganicNitrogenAmount
              - (vo_AddedOrganicCarbonAmount * vo_PartAOM_to_AOM_Slow
              / vo_CN_Ratio_AOM_Slow));
          } else {

            vo_CN_Ratio_AOM_Fast = po_AOM_FastMaxC_to_N;
          }

          if(vo_CN_Ratio_AOM_Fast > po_AOM_FastMaxC_to_N) {
            vo_CN_Ratio_AOM_Fast = po_AOM_FastMaxC_to_N;
          }

          aom_pool.vo_CN_Ratio_AOM_Fast = vo_CN_Ratio_AOM_Fast;

        } else {
          aom_pool.vo_CN_Ratio_AOM_Fast = params.vo_CN_Ratio_AOM_Fast;
        }

        aom_pool.vo_PartAOM_Slow_to_SMB_Slow = params.vo_PartAOM_Slow_to_SMB_Slow;
        aom_pool.vo_PartAOM_Slow_to_SMB_Fast = params.vo_PartAOM_Slow_to_SMB_Fast;

        soilColumn[0].vo_AOM_Pool.push(aom_pool);
        //cout << "poolsize: " << soilColumn[0].vo_AOM_Pool.length << endl;

      } else {//if (i_Layer == 0)

        var aom_pool = new AOM_Properties();

        aom_pool.vo_DaysAfterApplication = 0;
        aom_pool.vo_AOM_DryMatterContent = 0.0;
        aom_pool.vo_AOM_NH4Content = 0.0;
        aom_pool.vo_AOM_Slow = 0.0;
        aom_pool.vo_AOM_Fast = 0.0;
        aom_pool.vo_AOM_SlowDecCoeffStandard = params.vo_AOM_SlowDecCoeffStandard;
        aom_pool.vo_AOM_FastDecCoeffStandard = params.vo_AOM_FastDecCoeffStandard;
        aom_pool.vo_CN_Ratio_AOM_Slow = vo_CN_Ratio_AOM_Slow;
        if(!soilColumn[0].vo_AOM_Pool.length === 0) {
          aom_pool.vo_CN_Ratio_AOM_Fast = soilColumn[0].vo_AOM_Pool[soilColumn[0].vo_AOM_Pool.length - 1].vo_CN_Ratio_AOM_Fast;
        } else {
          aom_pool.vo_CN_Ratio_AOM_Fast = vo_CN_Ratio_AOM_Fast;
        }
        aom_pool.vo_PartAOM_Slow_to_SMB_Slow = params.vo_PartAOM_Slow_to_SMB_Slow;
        aom_pool.vo_PartAOM_Slow_to_SMB_Fast = params.vo_PartAOM_Slow_to_SMB_Fast;
        aom_pool.incorporation = incorporation;

        soilColumn[i_Layer].vo_AOM_Pool.push(aom_pool);

      } //else
    } // for i_Layer

    var AOM_SlowInput = vo_PartAOM_to_AOM_Slow * vo_AddedOrganicCarbonAmount;
    var AOM_FastInput = vo_PartAOM_to_AOM_Fast * vo_AddedOrganicCarbonAmount;

    var vo_SoilNH4Input = vo_AOM_NH4Content * vo_AddedOrganicMatterAmount
             * vo_AOM_DryMatterContent / 10000.0 / soilColumn[0].vs_LayerThickness;

    debug('vo_SoilNH4Input', vo_SoilNH4Input);

    var vo_SoilNO3Input = vo_AOM_NO3Content * vo_AddedOrganicMatterAmount
             * vo_AOM_DryMatterContent / 10000.0 / soilColumn[0].vs_LayerThickness;

    var SOM_FastInput = (1.0 - (vo_PartAOM_to_AOM_Slow
           + vo_PartAOM_to_AOM_Fast)) * vo_AddedOrganicCarbonAmount;
    // Immediate top layer pool update
    soilColumn[0].vo_AOM_Pool[soilColumn[0].vo_AOM_Pool.length - 1].vo_AOM_Slow += AOM_SlowInput;
    soilColumn[0].vo_AOM_Pool[soilColumn[0].vo_AOM_Pool.length - 1].vo_AOM_Fast += AOM_FastInput;
    debug('soilColumn[0].vs_SoilNH4', soilColumn[0].vs_SoilNH4);
    soilColumn[0].vs_SoilNH4 += vo_SoilNH4Input;
    debug('soilColumn[0].vs_SoilNH4', soilColumn[0].vs_SoilNH4);
    soilColumn[0].vs_SoilNO3 += vo_SoilNO3Input;
    soilColumn[0].vs_SOM_Fast += SOM_FastInput;

    // JS!
    if (DEBUG && (soilColumn[0].vs_SoilNO3 < 0 || soilColumn[0].vs_SoilNH4 < 0))
      throw new Error('N < 0');

    //store for further use
    vo_AOM_SlowInput += AOM_SlowInput;
    vo_AOM_FastInput += AOM_FastInput;
    vo_SOM_FastInput += SOM_FastInput;

    addedOrganicMatter = true;
  };

  var addIrrigationWater = function (amount) {
    irrigationAmount += amount;
  };

  var fo_Urea = function (vo_RainIrrigation ) {

    var nools = soilColumn.vs_NumberOfOrganicLayers();
    var vo_SoilCarbamid_solid = []; // Solid carbamide concentration in soil solution [kmol urea m-3]
    var vo_SoilCarbamid_aq = []; // Dissolved carbamide concetzration in soil solution [kmol urea m-3]
    var vo_HydrolysisRate1 = []; // [kg N d-1]
    var vo_HydrolysisRate2 = []; // [kg N d-1]
    var vo_HydrolysisRateMax = []; // [kg N d-1]
    var vo_Hydrolysis_pH_Effect = [];// []
    var vo_HydrolysisRate = []; // [kg N d-1]
    var vo_H3OIonConcentration = 0.0; // Oxonium ion concentration in soil solution [kmol m-3]
    var vo_NH3aq_EquilibriumConst = 0.0; // []
    var vo_NH3_EquilibriumConst   = 0.0; // []
    var vs_SoilNH4aq = 0.0; // ammonium ion concentration in soil solution [kmol m-3}
    var vo_NH3aq = 0.0;
    var vo_NH3gas = 0.0;
    var vo_NH3_Volatilising = 0.0;

    var po_HydrolysisKM = centralParameterProvider.userSoilOrganicParameters.po_HydrolysisKM;
    var po_HydrolysisP1 = centralParameterProvider.userSoilOrganicParameters.po_HydrolysisP1;
    var po_HydrolysisP2 = centralParameterProvider.userSoilOrganicParameters.po_HydrolysisP2;
    var po_ActivationEnergy = centralParameterProvider.userSoilOrganicParameters.po_ActivationEnergy;

    vo_NH3_Volatilised = 0.0;

    for (var i_Layer = 0; i_Layer < soilColumn.vs_NumberOfOrganicLayers(); i_Layer++) {

      // kmol urea m-3 soil
      vo_SoilCarbamid_solid[i_Layer] = soilColumn[i_Layer].vs_SoilCarbamid /
               ORGANIC_CONSTANTS.PO_UREAMOLECULARWEIGHT /
               ORGANIC_CONSTANTS.PO_UREA_TO_N / 1000.0;

      // mol urea kg Solution-1
      vo_SoilCarbamid_aq[i_Layer] = (-1258.9 + 13.2843 * (soilColumn[i_Layer].get_Vs_SoilTemperature() + 273.15) -
             0.047381 * ((soilColumn[i_Layer].get_Vs_SoilTemperature() + 273.15) *
                 (soilColumn[i_Layer].get_Vs_SoilTemperature() + 273.15)) +
             5.77264e-5 * (pow((soilColumn[i_Layer].get_Vs_SoilTemperature() + 273.15), 3.0)));

      // kmol urea m-3 soil
      vo_SoilCarbamid_aq[i_Layer] = (vo_SoilCarbamid_aq[i_Layer] / (1.0 +
                    (vo_SoilCarbamid_aq[i_Layer] * 0.0453))) *
          soilColumn[i_Layer].get_Vs_SoilMoisture_m3();

      if (vo_SoilCarbamid_aq[i_Layer] >= vo_SoilCarbamid_solid[i_Layer]) {

        vo_SoilCarbamid_aq[i_Layer] = vo_SoilCarbamid_solid[i_Layer];
        vo_SoilCarbamid_solid[i_Layer] = 0.0;

      } else {
        vo_SoilCarbamid_solid[i_Layer] -= vo_SoilCarbamid_aq[i_Layer];
      }

      // Calculate urea hydrolysis

      vo_HydrolysisRate1[i_Layer] = (po_HydrolysisP1 *
                                    (soilColumn[i_Layer].vs_SoilOrganicMatter() * 100.0) *
                                    ORGANIC_CONSTANTS.PO_SOM_TO_C + po_HydrolysisP2) /
                                    ORGANIC_CONSTANTS.PO_UREAMOLECULARWEIGHT;

      vo_HydrolysisRate2[i_Layer] = vo_HydrolysisRate1[i_Layer] /
                                    (exp(-po_ActivationEnergy /
                                    (8.314 * 310.0)));

      vo_HydrolysisRateMax[i_Layer] = vo_HydrolysisRate2[i_Layer] * exp(-po_ActivationEnergy /
                                     (8.314 * (soilColumn[i_Layer].get_Vs_SoilTemperature() + 273.15)));

      vo_Hydrolysis_pH_Effect[i_Layer] = exp(-0.064 *
                                         ((soilColumn[i_Layer].vs_SoilpH - 6.5) *
                                         (soilColumn[i_Layer].vs_SoilpH - 6.5)));

      // kmol urea kg soil-1 s-1
      vo_HydrolysisRate[i_Layer] = vo_HydrolysisRateMax[i_Layer] *
                                   fo_MoistOnHydrolysis(soilColumn[i_Layer].vs_SoilMoisture_pF()) *
                                   vo_Hydrolysis_pH_Effect[i_Layer] * vo_SoilCarbamid_aq[i_Layer] /
                                   (po_HydrolysisKM + vo_SoilCarbamid_aq[i_Layer]);

      // kmol urea m soil-3 d-1
      vo_HydrolysisRate[i_Layer] = vo_HydrolysisRate[i_Layer] * 86400.0 *
                                   soilColumn[i_Layer].vs_SoilBulkDensity();

      if (vo_HydrolysisRate[i_Layer] >= vo_SoilCarbamid_aq[i_Layer]) {

        soilColumn[i_Layer].vs_SoilNH4 += soilColumn[i_Layer].vs_SoilCarbamid;
        soilColumn[i_Layer].vs_SoilCarbamid = 0.0;

      } else {

        // kg N m soil-3
        soilColumn[i_Layer].vs_SoilCarbamid -= vo_HydrolysisRate[i_Layer] *
               ORGANIC_CONSTANTS.PO_UREAMOLECULARWEIGHT *
               ORGANIC_CONSTANTS.PO_UREA_TO_N * 1000.0;

        // kg N m soil-3
        soilColumn[i_Layer].vs_SoilNH4 += vo_HydrolysisRate[i_Layer] *
          ORGANIC_CONSTANTS.PO_UREAMOLECULARWEIGHT *
          ORGANIC_CONSTANTS.PO_UREA_TO_N * 1000.0;
      }

      // Calculate general volatilisation from NH4-Pool in top layer

      if (i_Layer == 0) {

        vo_H3OIonConcentration = pow(10.0, (-soilColumn[0].vs_SoilpH)); // kmol m-3
        vo_NH3aq_EquilibriumConst = pow(10.0, ((-2728.3 /
                                    (soilColumn[0].get_Vs_SoilTemperature() + 273.15)) - 0.094219)); // K2 in Sadeghi's program

        vo_NH3_EquilibriumConst = pow(10.0, ((1630.5 /
                                  (soilColumn[0].get_Vs_SoilTemperature() + 273.15)) - 2.301));  // K1 in Sadeghi's program

        // kmol m-3, assuming that all NH4 is solved
        vs_SoilNH4aq = soilColumn[0].vs_SoilNH4 / (ORGANIC_CONSTANTS.PO_NH4MOLECULARWEIGHT * 1000.0);


        // kmol m-3
        vo_NH3aq = vs_SoilNH4aq / (1.0 + (vo_H3OIonConcentration / vo_NH3aq_EquilibriumConst));


         vo_NH3gas = vo_NH3aq;
        //  vo_NH3gas = vo_NH3aq / vo_NH3_EquilibriumConst;

        // kg N m-3 d-1
         vo_NH3_Volatilising = vo_NH3gas * ORGANIC_CONSTANTS.PO_NH3MOLECULARWEIGHT * 1000.0;


        if (vo_NH3_Volatilising >= soilColumn[0].vs_SoilNH4) {

          vo_NH3_Volatilising = soilColumn[0].vs_SoilNH4;
          soilColumn[0].vs_SoilNH4 = 0.0;

        } else {
          soilColumn[0].vs_SoilNH4 -= vo_NH3_Volatilising;
        }

        // kg N m-2 d-1
        vo_NH3_Volatilised = vo_NH3_Volatilising * soilColumn[0].vs_LayerThickness;

        if (DEBUG && soilColumn[0].vs_SoilNH4 < 0)
          throw new Error(soilColumn[0].vs_SoilNH4);

      } // if (i_Layer == 0) {
    } // for

    // set incorporation to false, if carbamid part is falling below a treshold
    // only, if organic matter was not recently added
    if (vo_SoilCarbamid_aq[0] < 0.001 && !addedOrganicMatter) {
      incorporation = false;
    }

  };

  var fo_MIT = function () {

    var nools = soilColumn.vs_NumberOfOrganicLayers();
    var po_SOM_SlowDecCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_SOM_SlowDecCoeffStandard;
    var po_SOM_FastDecCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_SOM_FastDecCoeffStandard;
    var po_SMB_SlowDeathRateStandard = centralParameterProvider.userSoilOrganicParameters.po_SMB_SlowDeathRateStandard;
    var po_SMB_SlowMaintRateStandard = centralParameterProvider.userSoilOrganicParameters.po_SMB_SlowMaintRateStandard;
    var po_SMB_FastDeathRateStandard = centralParameterProvider.userSoilOrganicParameters.po_SMB_FastDeathRateStandard;
    var po_SMB_FastMaintRateStandard = centralParameterProvider.userSoilOrganicParameters.po_SMB_FastMaintRateStandard;
    var po_LimitClayEffect = centralParameterProvider.userSoilOrganicParameters.po_LimitClayEffect;
    var po_SOM_SlowUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_SOM_SlowUtilizationEfficiency;
    var po_SOM_FastUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_SOM_FastUtilizationEfficiency;
    var po_PartSOM_Fast_to_SOM_Slow = centralParameterProvider.userSoilOrganicParameters.po_PartSOM_Fast_to_SOM_Slow;
    var po_PartSMB_Slow_to_SOM_Fast = centralParameterProvider.userSoilOrganicParameters.po_PartSMB_Slow_to_SOM_Fast;
    var po_SMB_UtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_SMB_UtilizationEfficiency;
    var po_CN_Ratio_SMB = centralParameterProvider.userSoilOrganicParameters.po_CN_Ratio_SMB;
    var po_AOM_SlowUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_AOM_SlowUtilizationEfficiency;
    var po_AOM_FastUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_AOM_FastUtilizationEfficiency;
    var po_ImmobilisationRateCoeffNH4 = centralParameterProvider.userSoilOrganicParameters.po_ImmobilisationRateCoeffNH4;
    var po_ImmobilisationRateCoeffNO3 = centralParameterProvider.userSoilOrganicParameters.po_ImmobilisationRateCoeffNO3;

    // Sum of decomposition rates for fast added organic matter pools
    var vo_AOM_FastDecRateSum = [];

    //Added organic matter fast pool change by decomposition [kg C m-3]
    //var vo_AOM_FastDelta = [];

    //Sum of all changes to added organic matter fast pool [kg C m-3]
    var vo_AOM_FastDeltaSum = [];

    //Added organic matter fast pool change by input [kg C m-3]
    //double vo_AOM_FastInput = 0.0;

    // Sum of decomposition rates for slow added organic matter pools
    var vo_AOM_SlowDecRateSum = [];

    // Added organic matter slow pool change by decomposition [kg C m-3]
    //var vo_AOM_SlowDelta = [];

    // Sum of all changes to added organic matter slow pool [kg C m-3]
    var vo_AOM_SlowDeltaSum = [];
    
    // [kg m-3]
    //fill(vo_CBalance.begin(), vo_CBalance.end(), 0.0);
    for (var i = 0, is = vo_CBalance.length; i < is; i++)
      vo_CBalance[i] = 0.0;

    // C to N ratio of slowly decomposing soil organic matter []
    var vo_CN_Ratio_SOM_Slow;

    // C to N ratio of rapidly decomposing soil organic matter []
    var vo_CN_Ratio_SOM_Fast;

    // N balance of each layer [kg N m-3]
    var vo_NBalance = [];

    // CO2 preduced from fast fraction of soil microbial biomass [kg C m-3 d-1]
    var vo_SMB_FastCO2EvolutionRate = [];

    // Fast fraction of soil microbial biomass death rate [d-1]
    var vo_SMB_FastDeathRate = [];

    // Fast fraction of soil microbial biomass death rate coefficient [d-1]
    var vo_SMB_FastDeathRateCoeff = [];

    // Fast fraction of soil microbial biomass decomposition rate [d-1]
    var vo_SMB_FastDecCoeff = [];

    // Soil microbial biomass fast pool change [kg C m-3]
    //fill(vo_SMB_FastDelta.begin(), vo_SMB_FastDelta.end(), 0.0);
    for (var i = 0, is = vo_SMB_FastDelta.length; i < is; i++)
      vo_SMB_FastDelta[i] = 0.0;

    // CO2 preduced from slow fraction of soil microbial biomass [kg C m-3 d-1]
    var vo_SMB_SlowCO2EvolutionRate = [];

    // Slow fraction of soil microbial biomass death rate [d-1]
    var vo_SMB_SlowDeathRate = [];

    // Slow fraction of soil microbial biomass death rate coefficient [d-1]
    var vo_SMB_SlowDeathRateCoeff = [];

    // Slow fraction of soil microbial biomass decomposition rate [d-1]
    var vo_SMB_SlowDecCoeff = [];

    // Soil microbial biomass slow pool change [kg C m-3]
    //fill(vo_SMB_SlowDelta.begin(), vo_SMB_SlowDelta.end(), 0.0);
    for (var i = 0, is = vo_SMB_SlowDelta.length; i < is; i++)
      vo_SMB_SlowDelta[i] = 0.0;

    // Decomposition coefficient for rapidly decomposing soil organic matter [d-1]
    var vo_SOM_FastDecCoeff = [];

    // Soil organic matter fast pool change [kg C m-3]
    //fill(vo_SOM_FastDelta.begin(), vo_SOM_FastDelta.end(), 0.0);
    for (var i = 0, is = vo_SOM_FastDelta.length; i < is; i++)
      vo_SOM_FastDelta[i] = 0.0;

    // Sum of all changes to soil organic matter fast pool [kg C m-3]
    //var vo_SOM_FastDeltaSum = [];

    // Decomposition coefficient for slowly decomposing soil organic matter [d-1]
    var vo_SOM_SlowDecCoeff = [];

    // Soil organic matter slow pool change, unit [kg C m-3]
    //fill(vo_SOM_SlowDelta.begin(), vo_SOM_SlowDelta.end(), 0.0);
    for (var i = 0, is = vo_SOM_SlowDelta.length; i < is; i++)
      vo_SOM_SlowDelta[i] = 0.0;

    // Sum of all changes to soil organic matter slow pool [kg C m-3]
    //std::vector<double> vo_SOM_SlowDeltaSum = new Array(nools);

    // Calculation of decay rate coefficients

    var AOM_Pool, it_AOM_Pool; // JS! it's the same var! forEach is slower

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      var tod = fo_TempOnDecompostion(soilColumn[i_Layer].get_Vs_SoilTemperature());
      var mod = fo_MoistOnDecompostion(soilColumn[i_Layer].vs_SoilMoisture_pF());
  //    cout << "SO-5\t" << mod << endl;

      vo_SOM_SlowDecCoeff[i_Layer] = po_SOM_SlowDecCoeffStandard * tod * mod;
      vo_SOM_FastDecCoeff[i_Layer] = po_SOM_FastDecCoeffStandard * tod * mod;

      vo_SMB_SlowDecCoeff[i_Layer] = (po_SMB_SlowDeathRateStandard
             + po_SMB_SlowMaintRateStandard)
             * fo_ClayOnDecompostion(soilColumn[i_Layer].vs_SoilClayContent,
               po_LimitClayEffect) * tod * mod;

      vo_SMB_FastDecCoeff[i_Layer] = (po_SMB_FastDeathRateStandard
              + po_SMB_FastMaintRateStandard) * tod * mod;

      vo_SMB_SlowDeathRateCoeff[i_Layer] = po_SMB_SlowDeathRateStandard * tod * mod;
      vo_SMB_FastDeathRateCoeff[i_Layer] = po_SMB_FastDeathRateStandard * tod * mod;
      vo_SMB_SlowDeathRate[i_Layer] = vo_SMB_SlowDeathRateCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Slow;
      vo_SMB_FastDeathRate[i_Layer] = vo_SMB_FastDeathRateCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Fast;

      for (var i_Pool = 0, i_Pools = soilColumn[i_Layer].vo_AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool[i_Pool];
        AOM_Pool.vo_AOM_SlowDecCoeff = AOM_Pool.vo_AOM_SlowDecCoeffStandard * tod * mod;
        AOM_Pool.vo_AOM_FastDecCoeff = AOM_Pool.vo_AOM_FastDecCoeffStandard * tod * mod;      
      }
    } // for

    // Calculation of pool changes by decomposition
    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      for (var i_Pool = 0, i_Pools = soilColumn[i_Layer].vo_AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool[i_Pool];

        // Eq.6-5 and 6-6 in the DAISY manual
        AOM_Pool.vo_AOM_SlowDelta = -(AOM_Pool.vo_AOM_SlowDecCoeff * AOM_Pool.vo_AOM_Slow);

        if(-AOM_Pool.vo_AOM_SlowDelta > AOM_Pool.vo_AOM_Slow) {
          AOM_Pool.vo_AOM_SlowDelta = (-AOM_Pool.vo_AOM_Slow);
        }

        AOM_Pool.vo_AOM_FastDelta = -(AOM_Pool.vo_AOM_FastDecCoeff * AOM_Pool.vo_AOM_Fast);

        if(-AOM_Pool.vo_AOM_FastDelta > AOM_Pool.vo_AOM_Fast) {
          AOM_Pool.vo_AOM_FastDelta = (-AOM_Pool.vo_AOM_Fast);
        }
      }

      // soilColumn[i_Layer].vo_AOM_Pool.forEach(function (AOM_Pool) {
      //   // Eq.6-5 and 6-6 in the DAISY manual
      //   AOM_Pool.vo_AOM_SlowDelta = -(AOM_Pool.vo_AOM_SlowDecCoeff * AOM_Pool.vo_AOM_Slow);

      //   if(-AOM_Pool.vo_AOM_SlowDelta > AOM_Pool.vo_AOM_Slow) {
      //     AOM_Pool.vo_AOM_SlowDelta = (-AOM_Pool.vo_AOM_Slow);
      //   }

      //   AOM_Pool.vo_AOM_FastDelta = -(AOM_Pool.vo_AOM_FastDecCoeff * AOM_Pool.vo_AOM_Fast);

      //   if(-AOM_Pool.vo_AOM_FastDelta > AOM_Pool.vo_AOM_Fast) {
      //     AOM_Pool.vo_AOM_FastDelta = (-AOM_Pool.vo_AOM_Fast);
      //   }
      // });

      // Eq.6-7 in the DAISY manual
      vo_AOM_SlowDecRateSum[i_Layer] = 0.0;

      for (var i_Pool = 0, i_Pools = soilColumn[i_Layer].vo_AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool[i_Pool];
        AOM_Pool.vo_AOM_SlowDecRate = AOM_Pool.vo_AOM_SlowDecCoeff * AOM_Pool.vo_AOM_Slow;
        vo_AOM_SlowDecRateSum[i_Layer] += AOM_Pool.vo_AOM_SlowDecRate;
      }

      // soilColumn[i_Layer].vo_AOM_Pool.forEach(function (AOM_Pool) {
      //   AOM_Pool.vo_AOM_SlowDecRate = AOM_Pool.vo_AOM_SlowDecCoeff * AOM_Pool.vo_AOM_Slow;
      //   vo_AOM_SlowDecRateSum[i_Layer] += AOM_Pool.vo_AOM_SlowDecRate;
      // });

      vo_SMB_SlowDelta[i_Layer] = (po_SOM_SlowUtilizationEfficiency * vo_SOM_SlowDecCoeff[i_Layer]
          * soilColumn[i_Layer].vs_SOM_Slow)
          + (po_SOM_FastUtilizationEfficiency * (1.0
          - po_PartSOM_Fast_to_SOM_Slow)
          * vo_SOM_FastDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SOM_Fast)
          + (po_AOM_SlowUtilizationEfficiency
          * vo_AOM_SlowDecRateSum[i_Layer])
          - (vo_SMB_SlowDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Slow
          + vo_SMB_SlowDeathRate[i_Layer]);

      // Eq.6-8 in the DAISY manual
      vo_AOM_FastDecRateSum[i_Layer] = 0.0;

      for (var i_Pool = 0, i_Pools = soilColumn[i_Layer].vo_AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool[i_Pool];
        AOM_Pool.vo_AOM_FastDecRate = AOM_Pool.vo_AOM_FastDecCoeff * AOM_Pool.vo_AOM_Fast;
        vo_AOM_FastDecRateSum[i_Layer] += AOM_Pool.vo_AOM_FastDecRate;
      }

      // soilColumn[i_Layer].vo_AOM_Pool.forEach(function (AOM_Pool) {
      //   AOM_Pool.vo_AOM_FastDecRate = AOM_Pool.vo_AOM_FastDecCoeff * AOM_Pool.vo_AOM_Fast;
      //   vo_AOM_FastDecRateSum[i_Layer] += AOM_Pool.vo_AOM_FastDecRate;
      // });

      vo_SMB_FastDelta[i_Layer] = (po_SMB_UtilizationEfficiency * (1.0
          - po_PartSMB_Slow_to_SOM_Fast)
          * (vo_SMB_SlowDeathRate[i_Layer]
          + vo_SMB_FastDeathRate[i_Layer]))
          + (po_AOM_FastUtilizationEfficiency
          * vo_AOM_FastDecRateSum[i_Layer])
          - ((vo_SMB_FastDecCoeff[i_Layer]
          * soilColumn[i_Layer].vs_SMB_Fast)
          + vo_SMB_FastDeathRate[i_Layer]);

      //!Eq.6-9 in the DAISY manual
      vo_SOM_SlowDelta[i_Layer] = po_PartSOM_Fast_to_SOM_Slow * vo_SOM_FastDecCoeff[i_Layer]
          * soilColumn[i_Layer].vs_SOM_Fast - vo_SOM_SlowDecCoeff[i_Layer]
          * soilColumn[i_Layer].vs_SOM_Slow;

      // Eq.6-10 in the DAISY manual
      vo_SOM_FastDelta[i_Layer] = po_PartSMB_Slow_to_SOM_Fast * (vo_SMB_SlowDeathRate[i_Layer]
          + vo_SMB_FastDeathRate[i_Layer]) - vo_SOM_FastDecCoeff[i_Layer]
          * soilColumn[i_Layer].vs_SOM_Fast;

      vo_AOM_SlowDeltaSum[i_Layer] = 0.0;
      vo_AOM_FastDeltaSum[i_Layer] = 0.0;

      for (var i_Pool = 0, i_Pools = soilColumn[i_Layer].vo_AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool[i_Pool];
        vo_AOM_SlowDeltaSum[i_Layer] += AOM_Pool.vo_AOM_SlowDelta;
        vo_AOM_FastDeltaSum[i_Layer] += AOM_Pool.vo_AOM_FastDelta;
      }

      // soilColumn[i_Layer].vo_AOM_Pool.forEach(function (AOM_Pool) {
      //   vo_AOM_SlowDeltaSum[i_Layer] += AOM_Pool.vo_AOM_SlowDelta;
      //   vo_AOM_FastDeltaSum[i_Layer] += AOM_Pool.vo_AOM_FastDelta;
      // });

    } // for i_Layer

    vo_DecomposerRespiration = 0.0;

    // Calculation of CO2 evolution
    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      vo_SMB_SlowCO2EvolutionRate[i_Layer] = ((1.0 - po_SOM_SlowUtilizationEfficiency)
              * vo_SOM_SlowDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SOM_Slow) + ((1.0
              - po_SOM_FastUtilizationEfficiency) * (1.0 - po_PartSOM_Fast_to_SOM_Slow)
              * vo_SOM_FastDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SOM_Fast) + ((1.0
              - po_AOM_SlowUtilizationEfficiency) * vo_AOM_SlowDecRateSum[i_Layer])
              + (po_SMB_UtilizationEfficiency
              * (vo_SMB_SlowDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Slow));

      vo_SMB_FastCO2EvolutionRate[i_Layer] = ((1.0 - po_SMB_UtilizationEfficiency) * (1.0
             - po_PartSMB_Slow_to_SOM_Fast) * (vo_SMB_SlowDeathRate[i_Layer] + vo_SMB_FastDeathRate[i_Layer]))
             + ((1.0 - po_AOM_FastUtilizationEfficiency) * vo_AOM_FastDecRateSum[i_Layer])
             + ((vo_SMB_FastDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Fast));

      vo_SMB_CO2EvolutionRate[i_Layer] = vo_SMB_SlowCO2EvolutionRate[i_Layer] + vo_SMB_FastCO2EvolutionRate[i_Layer];

      vo_DecomposerRespiration += vo_SMB_CO2EvolutionRate[i_Layer] * soilColumn[i_Layer].vs_LayerThickness; // [kg C m-3] -> [kg C m-2]

    } // for i_Layer

    // Calculation of N balance
    vo_CN_Ratio_SOM_Slow = siteParams.vs_Soil_CN_Ratio;
    vo_CN_Ratio_SOM_Fast = siteParams.vs_Soil_CN_Ratio;

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      vo_NBalance[i_Layer] = -(vo_SMB_SlowDelta[i_Layer] / po_CN_Ratio_SMB)
          - (vo_SMB_FastDelta[i_Layer] / po_CN_Ratio_SMB)
          - (vo_SOM_SlowDelta[i_Layer] / vo_CN_Ratio_SOM_Slow)
          - (vo_SOM_FastDelta[i_Layer] / vo_CN_Ratio_SOM_Fast);

      /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool;

      for (var i_Pool = 0, i_Pools = AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        it_AOM_Pool = AOM_Pool[i_Pool];
        if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Fast) >= 1.0E-7) {
          vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_FastDelta / it_AOM_Pool.vo_CN_Ratio_AOM_Fast);
        } // if

        if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Slow) >= 1.0E-7) {
          vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_SlowDelta / it_AOM_Pool.vo_CN_Ratio_AOM_Slow);
        } // if
      } // for it_AOM_Pool

      // AOM_Pool.forEach(function (it_AOM_Pool) {

      //   if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Fast) >= 1.0E-7) {
      //     vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_FastDelta / it_AOM_Pool.vo_CN_Ratio_AOM_Fast);
      //   } // if

      //   if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Slow) >= 1.0E-7) {
      //     vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_SlowDelta / it_AOM_Pool.vo_CN_Ratio_AOM_Slow);
      //   } // if
      // }); // for it_AOM_Pool
    } // for i_Layer

    // Check for Nmin availablity in case of immobilisation

    vo_NetNMineralisation = 0.0;

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      if (vo_NBalance[i_Layer] < 0.0) {

        if (abs(vo_NBalance[i_Layer]) >= ((soilColumn[i_Layer].vs_SoilNH4 * po_ImmobilisationRateCoeffNH4)
          + (soilColumn[i_Layer].vs_SoilNO3 * po_ImmobilisationRateCoeffNO3))) {
          vo_AOM_SlowDeltaSum[i_Layer] = 0.0;
          vo_AOM_FastDeltaSum[i_Layer] = 0.0;

          AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool;

          for (var i_Pool = 0, i_Pools = AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
            it_AOM_Pool = AOM_Pool[i_Pool];

            if (it_AOM_Pool.vo_CN_Ratio_AOM_Slow >= (po_CN_Ratio_SMB
                 / po_AOM_SlowUtilizationEfficiency)) {

              it_AOM_Pool.vo_AOM_SlowDelta = 0.0;
            } // if

            if (it_AOM_Pool.vo_CN_Ratio_AOM_Fast >= (po_CN_Ratio_SMB
                 / po_AOM_FastUtilizationEfficiency)) {

              it_AOM_Pool.vo_AOM_FastDelta = 0.0;
            } // if

            vo_AOM_SlowDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_SlowDelta;
            vo_AOM_FastDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_FastDelta;

          } // for

          // AOM_Pool.forEach(function (it_AOM_Pool) {

          //   if (it_AOM_Pool.vo_CN_Ratio_AOM_Slow >= (po_CN_Ratio_SMB
          //        / po_AOM_SlowUtilizationEfficiency)) {

          //     it_AOM_Pool.vo_AOM_SlowDelta = 0.0;
          //   } // if

          //   if (it_AOM_Pool.vo_CN_Ratio_AOM_Fast >= (po_CN_Ratio_SMB
          //        / po_AOM_FastUtilizationEfficiency)) {

          //     it_AOM_Pool.vo_AOM_FastDelta = 0.0;
          //   } // if

          //   vo_AOM_SlowDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_SlowDelta;
          //   vo_AOM_FastDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_FastDelta;

          // }); // for

          if (vo_CN_Ratio_SOM_Slow >= (po_CN_Ratio_SMB / po_SOM_SlowUtilizationEfficiency)) {

            vo_SOM_SlowDelta[i_Layer] = 0.0;
          } // if

          if (vo_CN_Ratio_SOM_Fast >= (po_CN_Ratio_SMB / po_SOM_FastUtilizationEfficiency)) {

            vo_SOM_FastDelta[i_Layer] = 0.0;
          } // if

          // Recalculation of SMB pool changes

          /** @todo <b>Claas: </b> Folgende Algorithmen prüfen: Was verändert sich? */
          vo_SMB_SlowDelta[i_Layer] = (po_SOM_SlowUtilizationEfficiency * vo_SOM_SlowDecCoeff[i_Layer]
               * soilColumn[i_Layer].vs_SOM_Slow) + (po_SOM_FastUtilizationEfficiency * (1.0
               - po_PartSOM_Fast_to_SOM_Slow) * vo_SOM_FastDecCoeff[i_Layer]
               * soilColumn[i_Layer].vs_SOM_Fast) + (po_AOM_SlowUtilizationEfficiency
               * (-vo_AOM_SlowDeltaSum[i_Layer])) - (vo_SMB_SlowDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Slow
               + vo_SMB_SlowDeathRate[i_Layer]);

          vo_SMB_FastDelta[i_Layer] = (po_SMB_UtilizationEfficiency * (1.0
              - po_PartSMB_Slow_to_SOM_Fast) * (vo_SMB_SlowDeathRate[i_Layer]
              + vo_SMB_FastDeathRate[i_Layer])) + (po_AOM_FastUtilizationEfficiency
              * (-vo_AOM_FastDeltaSum[i_Layer])) - ((vo_SMB_FastDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Fast)
              + vo_SMB_FastDeathRate[i_Layer]);

          // Recalculation of N balance under conditions of immobilisation
          vo_NBalance[i_Layer] = -(vo_SMB_SlowDelta[i_Layer] / po_CN_Ratio_SMB)
               - (vo_SMB_FastDelta[i_Layer] / po_CN_Ratio_SMB) - (vo_SOM_SlowDelta[i_Layer]
               / vo_CN_Ratio_SOM_Slow) - (vo_SOM_FastDelta[i_Layer] / vo_CN_Ratio_SOM_Fast);

          for (var i_Pool = 0, i_Pools = AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {

            it_AOM_Pool = AOM_Pool[i_Pool];
            
            if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Fast) >= 1.0E-7) {

              vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_FastDelta
                                       / it_AOM_Pool.vo_CN_Ratio_AOM_Fast);
            } // if

            if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Slow) >= 1.0E-7) {

              vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_SlowDelta
                                       / it_AOM_Pool.vo_CN_Ratio_AOM_Slow);
            } // if

          } // for

          // AOM_Pool.forEach(function (it_AOM_Pool) {

          //   if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Fast) >= 1.0E-7) {

          //     vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_FastDelta
          //                              / it_AOM_Pool.vo_CN_Ratio_AOM_Fast);
          //   } // if

          //   if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Slow) >= 1.0E-7) {

          //     vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_SlowDelta
          //                              / it_AOM_Pool.vo_CN_Ratio_AOM_Slow);
          //   } // if
          // }); // for

          // Update of Soil NH4 after recalculated N balance
          soilColumn[i_Layer].vs_SoilNH4 += abs(vo_NBalance[i_Layer]);


        } else { //if
          // Bedarf kann durch Ammonium-Pool nicht gedeckt werden --> Nitrat wird verwendet
          if (abs(vo_NBalance[i_Layer]) >= (soilColumn[i_Layer].vs_SoilNH4
               * po_ImmobilisationRateCoeffNH4)) {

            soilColumn[i_Layer].vs_SoilNO3 -= abs(vo_NBalance[i_Layer])
                 - (soilColumn[i_Layer].vs_SoilNH4
                 * po_ImmobilisationRateCoeffNH4);

            soilColumn[i_Layer].vs_SoilNH4 -= soilColumn[i_Layer].vs_SoilNH4
                 * po_ImmobilisationRateCoeffNH4;

          } else { // if

            soilColumn[i_Layer].vs_SoilNH4 -= abs(vo_NBalance[i_Layer]);
            if (DEBUG && soilColumn[i_Layer].vs_SoilNH4 < 0)
              throw new Error(soilColumn[i_Layer].vs_SoilNH4);
          } //else
        } //else

      } else { //if (N_Balance[i_Layer]) < 0.0

        soilColumn[i_Layer].vs_SoilNH4 += abs(vo_NBalance[i_Layer]);
      }

    vo_NetNMineralisationRate[i_Layer] = abs(vo_NBalance[i_Layer])
        * soilColumn[0].vs_LayerThickness; // [kg m-3] --> [kg m-2]
    vo_NetNMineralisation += abs(vo_NBalance[i_Layer])
        * soilColumn[0].vs_LayerThickness; // [kg m-3] --> [kg m-2]
    vo_SumNetNMineralisation += abs(vo_NBalance[i_Layer])
          * soilColumn[0].vs_LayerThickness; // [kg m-3] --> [kg m-2]

    }
  };

  var fo_Volatilisation = function (
    vo_AOM_Addition,
    vw_MeanAirTemperature,
    vw_WindSpeed
    ) {
    
    var vo_SoilWet;
    var vo_AOM_TAN_Content; // added organic matter total ammonium content [g N kg FM OM-1]
    var vo_MaxVolatilisation; // Maximum volatilisation [kg N ha-1 (kg N ha-1)-1]
    var vo_VolatilisationHalfLife; // [d]
    var vo_VolatilisationRate; // [kg N ha-1 (kg N ha-1)-1 d-1]
    var vo_N_PotVolatilised; // Potential volatilisation [kg N m-2]
    var vo_N_PotVolatilisedSum = 0.0; // Sums up potential volatilisation of all AOM pools [kg N m-2]
    var vo_N_ActVolatilised = 0.0; // Actual volatilisation [kg N m-2]

    var vo_DaysAfterApplicationSum = 0;

    if (soilColumn[0].vs_SoilMoisture_pF() > 2.5) {
      vo_SoilWet = 0.0;
    } else {
      vo_SoilWet = 1.0;
    }

    var AOM_Pool = soilColumn[0].vo_AOM_Pool;

    AOM_Pool.forEach(function (it_AOM_Pool, idx) {
      if (idx > 0) /* index 0 = dedicated root matter pool */
        vo_DaysAfterApplicationSum += it_AOM_Pool.vo_DaysAfterApplication;
    });

    if (vo_DaysAfterApplicationSum > 0 || vo_AOM_Addition) {

      /** @todo <b>Claas: </b> if (vo_AOM_Addition == true)
       vo_DaysAfterApplication[vo_AOM_PoolAllocator]= 1; */

      vo_N_PotVolatilisedSum = 0.0;

      AOM_Pool.forEach(function (it_AOM_Pool, idx) {

        if (idx > 0) { /* index 0 = dedicated root matter pool */

          vo_AOM_TAN_Content = 0.0;
          vo_MaxVolatilisation = 0.0;
          vo_VolatilisationHalfLife = 0.0;
          vo_VolatilisationRate = 0.0;
          vo_N_PotVolatilised = 0.0;

          vo_AOM_TAN_Content = it_AOM_Pool.vo_AOM_NH4Content * 1000.0 * it_AOM_Pool.vo_AOM_DryMatterContent;

          vo_MaxVolatilisation = 0.0495 * pow(1.1020, vo_SoilWet) * pow(1.0223, vw_MeanAirTemperature) * pow(1.0417,
                             vw_WindSpeed) * pow(1.1080, it_AOM_Pool.vo_AOM_DryMatterContent) * pow(0.8280, vo_AOM_TAN_Content) * pow(
                                 11.300, Number(it_AOM_Pool.incorporation));

          vo_VolatilisationHalfLife = 1.0380 * pow(1.1020, vo_SoilWet) * pow(0.9600, vw_MeanAirTemperature) * pow(0.9500,
                          vw_WindSpeed) * pow(1.1750, it_AOM_Pool.vo_AOM_DryMatterContent) * pow(1.1060, vo_AOM_TAN_Content) * pow(
                                                    1.0000, Number(it_AOM_Pool.incorporation)) * (18869.3 * exp(-soilColumn[0].vs_SoilpH / 0.63321) + 0.70165);

          // ******************************************************************************************
          // *** Based on He et al. (1999): Soil Sci. 164 (10), 750-758. The curves on p. 755 were  ***
          // *** digitised and fit to Michaelis-Menten. The pH - Nhalf relation was normalised (pH  ***
          // *** 7.0 = 1; average soil pH of the ALFAM experiments) and fit to a decay function.    ***
          // *** The resulting factor was added to the Half Life calculation.                       ***
          // ******************************************************************************************

          vo_VolatilisationRate = vo_MaxVolatilisation * (vo_VolatilisationHalfLife / (pow((it_AOM_Pool.vo_DaysAfterApplication + vo_VolatilisationHalfLife), 2.0)));

          vo_N_PotVolatilised = vo_VolatilisationRate * vo_AOM_TAN_Content * (it_AOM_Pool.vo_AOM_Slow
                      + it_AOM_Pool.vo_AOM_Fast) / 10000.0 / 1000.0;

          vo_N_PotVolatilisedSum += vo_N_PotVolatilised;
        }

      });

      if (soilColumn[0].vs_SoilNH4 > (vo_N_PotVolatilisedSum)) {
        vo_N_ActVolatilised = vo_N_PotVolatilisedSum;
      } else {
        vo_N_ActVolatilised = soilColumn[0].vs_SoilNH4;
      }
      // update NH4 content of top soil layer with volatilisation balance

      soilColumn[0].vs_SoilNH4 -= (vo_N_ActVolatilised / soilColumn[0].vs_LayerThickness);

      debug(vo_N_ActVolatilised, 'vo_N_ActVolatilised');
      debug(soilColumn[0].vs_SoilNH4, 'soilColumn[0].vs_SoilNH4');
      soilColumn[0].vs_SoilNH4 -= vo_N_ActVolatilised;
      debug(soilColumn[0].vs_SoilNH4, 'soilColumn[0].vs_SoilNH4');
    } else {
      vo_N_ActVolatilised = 0.0;
    }

    if (DEBUG && soilColumn[0].vs_SoilNH4 < 0)
      throw new Error(soilColumn[0].vs_SoilNH4);

    // NH3 volatilised from top layer NH4 pool. See Urea section
    vo_Total_NH3_Volatilised = (vo_N_ActVolatilised + vo_NH3_Volatilised); // [kg N m-2]
    /** @todo <b>Claas: </b>Zusammenfassung für output. Wohin damit??? */

    AOM_Pool.forEach(function (it_AOM_Pool, idx) {

      if (idx > 0 && it_AOM_Pool.vo_DaysAfterApplication > 0 && !vo_AOM_Addition) {
        it_AOM_Pool.vo_DaysAfterApplication++;
      }
    });
  }

  var fo_Nitrification = function () {

    if (DEBUG && soilColumn[0].vs_SoilNO3 < 0)
      throw new error(soilColumn[0].vs_SoilNO3);
   
    var nools = soilColumn.vs_NumberOfOrganicLayers();
    var po_AmmoniaOxidationRateCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_AmmoniaOxidationRateCoeffStandard;
    var po_NitriteOxidationRateCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_NitriteOxidationRateCoeffStandard;

    //! Nitrification rate coefficient [d-1]
    var vo_AmmoniaOxidationRateCoeff = new Array(nools);
    var vo_NitriteOxidationRateCoeff = new Array(nools);

    //! Nitrification rate [kg NH4-N m-3 d-1]
    var vo_AmmoniaOxidationRate = new Array(nools);
    var vo_NitriteOxidationRate = new Array(nools);

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      // Calculate nitrification rate coefficients
  //    cout << "SO-2:\t" << soilColumn[i_Layer].vs_SoilMoisture_pF() << endl;
      vo_AmmoniaOxidationRateCoeff[i_Layer] = po_AmmoniaOxidationRateCoeffStandard * fo_TempOnNitrification(
          soilColumn[i_Layer].get_Vs_SoilTemperature()) * fo_MoistOnNitrification(soilColumn[i_Layer].vs_SoilMoisture_pF());

      vo_AmmoniaOxidationRate[i_Layer] = vo_AmmoniaOxidationRateCoeff[i_Layer] * soilColumn[i_Layer].vs_SoilNH4;

      vo_NitriteOxidationRateCoeff[i_Layer] = po_NitriteOxidationRateCoeffStandard
          * fo_TempOnNitrification(soilColumn[i_Layer].get_Vs_SoilTemperature())
          * fo_MoistOnNitrification(soilColumn[i_Layer].vs_SoilMoisture_pF())
              * fo_NH3onNitriteOxidation(soilColumn[i_Layer].vs_SoilNH4,soilColumn[i_Layer].vs_SoilpH);

      vo_NitriteOxidationRate[i_Layer] = vo_NitriteOxidationRateCoeff[i_Layer] * soilColumn[i_Layer].vs_SoilNH4;

    }

    if (DEBUG && soilColumn[0].vs_SoilNH4 < 0)
      throw new Error(soilColumn[0].vs_SoilNH4);

    if (DEBUG && soilColumn[0].vs_SoilNO2 < 0)
      throw new Error(soilColumn[0].vs_SoilNO2);

    if (DEBUG && soilColumn[0].vs_SoilNO3 < 0)
      throw new Error(soilColumn[0].vs_SoilNO3);

    // Update NH4, NO2 and NO3 content with nitrification balance
    // Stange, F., C. Nendel (2014): N.N., in preparation


    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      if (soilColumn[i_Layer].vs_SoilNH4 > vo_AmmoniaOxidationRate[i_Layer]) {

        soilColumn[i_Layer].vs_SoilNH4 -= vo_AmmoniaOxidationRate[i_Layer];
        soilColumn[i_Layer].vs_SoilNO2 += vo_AmmoniaOxidationRate[i_Layer];


      } else {

        soilColumn[i_Layer].vs_SoilNO2 += soilColumn[i_Layer].vs_SoilNH4;
        soilColumn[i_Layer].vs_SoilNH4 = 0.0;
      }

      if (soilColumn[i_Layer].vs_SoilNO2 > vo_NitriteOxidationRate[i_Layer]) {

        soilColumn[i_Layer].vs_SoilNO2 -= vo_NitriteOxidationRate[i_Layer];
        soilColumn[i_Layer].vs_SoilNO3 += vo_NitriteOxidationRate[i_Layer];


      } else {

        soilColumn[i_Layer].vs_SoilNO3 += soilColumn[i_Layer].vs_SoilNO2;
        soilColumn[i_Layer].vs_SoilNO2 = 0.0;
      }
    }

    if (DEBUG && soilColumn[0].vs_SoilNH4 < 0)
      throw new Error(soilColumn[0].vs_SoilNH4);

    if (DEBUG && soilColumn[0].vs_SoilNO2 < 0)
      throw new Error(soilColumn[0].vs_SoilNO2);

    if (DEBUG && soilColumn[0].vs_SoilNO3 < 0)
      throw new Error(soilColumn[0].vs_SoilNO3);

  };

  var fo_Denitrification = function () {

    var nools = soilColumn.vs_NumberOfOrganicLayers();
    var vo_PotDenitrificationRate = new Array(nools);
    var po_SpecAnaerobDenitrification = centralParameterProvider.userSoilOrganicParameters.po_SpecAnaerobDenitrification;
    var po_TransportRateCoeff = centralParameterProvider.userSoilOrganicParameters.po_TransportRateCoeff;
    vo_TotalDenitrification = 0.0;

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      //Temperature function is the same as in Nitrification subroutine
      vo_PotDenitrificationRate[i_Layer] = po_SpecAnaerobDenitrification
          * vo_SMB_CO2EvolutionRate[i_Layer]
          * fo_TempOnNitrification(soilColumn[i_Layer].get_Vs_SoilTemperature());

      vo_ActDenitrificationRate[i_Layer] = min(vo_PotDenitrificationRate[i_Layer]
           * fo_MoistOnDenitrification(soilColumn[i_Layer].get_Vs_SoilMoisture_m3(),
           soilColumn[i_Layer].get_Saturation()), po_TransportRateCoeff
           * soilColumn[i_Layer].vs_SoilNO3);
    }

      // update NO3 content of soil layer with denitrification balance [kg N m-3]

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      if (soilColumn[i_Layer].vs_SoilNO3 > vo_ActDenitrificationRate[i_Layer]) {

        
        soilColumn[i_Layer].vs_SoilNO3 -= vo_ActDenitrificationRate[i_Layer];

      } else {

        vo_ActDenitrificationRate[i_Layer] = soilColumn[i_Layer].vs_SoilNO3;
        soilColumn[i_Layer].vs_SoilNO3 = 0.0;

      }

      vo_TotalDenitrification += vo_ActDenitrificationRate[i_Layer] * soilColumn[0].vs_LayerThickness; // [kg m-3] --> [kg m-2] ;
    }

    vo_SumDenitrification += vo_TotalDenitrification; // [kg N m-2]

    if (DEBUG && vo_TotalDenitrification < 0)
      throw new Error(vo_TotalDenitrification);

  };


  var fo_N2OProduction = function () {

    var nools = soilColumn.vs_NumberOfOrganicLayers();
    var vo_N2OProduction = new Array(nools);
    var po_N2OProductionRate = centralParameterProvider.userSoilOrganicParameters.po_N2OProductionRate;
    vo_N2O_Produced = 0.0;

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

        vo_N2OProduction[i_Layer] = soilColumn[i_Layer].vs_SoilNO2
             * fo_TempOnNitrification(soilColumn[i_Layer].get_Vs_SoilTemperature())
             * po_N2OProductionRate * (1.0 / (1.0 +
             (pow(10.0,soilColumn[i_Layer].vs_SoilpH) - ORGANIC_CONSTANTS.PO_PKAHNO2)));

        vo_N2O_Produced += vo_N2OProduction[i_Layer];
    }

  };

  var fo_PoolUpdate = function () {
    
    for (var i_Layer = 0; i_Layer < soilColumn.vs_NumberOfOrganicLayers(); i_Layer++) {

      var AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool;

      vo_AOM_SlowDeltaSum[i_Layer] = 0.0;
      vo_AOM_FastDeltaSum[i_Layer] = 0.0;
      vo_AOM_SlowSum[i_Layer] = 0.0;
      vo_AOM_FastSum[i_Layer] = 0.0;

      AOM_Pool.forEach(function (it_AOM_Pool) {
        it_AOM_Pool.vo_AOM_Slow += it_AOM_Pool.vo_AOM_SlowDelta;
        it_AOM_Pool.vo_AOM_Fast += it_AOM_Pool.vo_AOM_FastDelta;

        vo_AOM_SlowDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_SlowDelta;
        vo_AOM_FastDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_FastDelta;

        vo_AOM_SlowSum[i_Layer] += it_AOM_Pool.vo_AOM_Slow;
        vo_AOM_FastSum[i_Layer] += it_AOM_Pool.vo_AOM_Fast;
      });

      soilColumn[i_Layer].vs_SOM_Slow += vo_SOM_SlowDelta[i_Layer];
      soilColumn[i_Layer].vs_SOM_Fast += vo_SOM_FastDelta[i_Layer];
      soilColumn[i_Layer].vs_SMB_Slow += vo_SMB_SlowDelta[i_Layer];
      soilColumn[i_Layer].vs_SMB_Fast += vo_SMB_FastDelta[i_Layer];

      if (i_Layer == 0) {

        vo_CBalance[i_Layer] = vo_AOM_SlowInput + vo_AOM_FastInput + vo_AOM_SlowDeltaSum[i_Layer]
               + vo_AOM_FastDeltaSum[i_Layer] + vo_SMB_SlowDelta[i_Layer]
               + vo_SMB_FastDelta[i_Layer] + vo_SOM_SlowDelta[i_Layer]
               + vo_SOM_FastDelta[i_Layer] + vo_SOM_FastInput;

      } else {
        vo_CBalance[i_Layer] = vo_AOM_SlowDeltaSum[i_Layer]
               + vo_AOM_FastDeltaSum[i_Layer] + vo_SMB_SlowDelta[i_Layer]
               + vo_SMB_FastDelta[i_Layer] + vo_SOM_SlowDelta[i_Layer]
               + vo_SOM_FastDelta[i_Layer];
      }


      vo_SoilOrganicC[i_Layer] = (soilColumn[i_Layer].vs_SoilOrganicCarbon() * soilColumn[i_Layer].vs_SoilBulkDensity()) - vo_InertSoilOrganicC[i_Layer]; // ([kg C kg-1] * [kg m-3]) - [kg C m-3]
      vo_SoilOrganicC[i_Layer] += vo_CBalance[i_Layer];
      
      soilColumn[i_Layer].set_SoilOrganicCarbon((vo_SoilOrganicC[i_Layer] + vo_InertSoilOrganicC[i_Layer]) / soilColumn[i_Layer].vs_SoilBulkDensity()); // [kg C m-3] / [kg m-3] --> [kg C kg-1]

    soilColumn[i_Layer].set_SoilOrganicMatter((vo_SoilOrganicC[i_Layer] + vo_InertSoilOrganicC[i_Layer])/ ORGANIC_CONSTANTS.PO_SOM_TO_C
                / soilColumn[i_Layer].vs_SoilBulkDensity()); // [kg C m-3] / [kg m-3] --> [kg C kg-1]
    } // for
  };

  var fo_ClayOnDecompostion = function (d_SoilClayContent, d_LimitClayEffect) {
    
    var fo_ClayOnDecompostion=0.0;

    if (d_SoilClayContent >= 0.0 && d_SoilClayContent <= d_LimitClayEffect) {
      fo_ClayOnDecompostion = 1.0 - 2.0 * d_SoilClayContent;
    } else if (d_SoilClayContent > d_LimitClayEffect && d_SoilClayContent <= 1.0) {
      fo_ClayOnDecompostion = 1.0 - 2.0 * d_LimitClayEffect;
    } else {
      throw new Error("irregular clay content");
    }
    return fo_ClayOnDecompostion;
  };

  var fo_TempOnDecompostion = function (d_SoilTemperature) {
    
    var fo_TempOnDecompostion=0.0;

    if (d_SoilTemperature <= 0.0 && d_SoilTemperature > -40.0) {

      //
      fo_TempOnDecompostion = 0.0;

    } else if (d_SoilTemperature > 0.0 && d_SoilTemperature <= 20.0) {

      fo_TempOnDecompostion = 0.1 * d_SoilTemperature;

    } else if (d_SoilTemperature > 20.0 && d_SoilTemperature <= 70.0) {

      fo_TempOnDecompostion = exp(0.47 - (0.027 * d_SoilTemperature) + (0.00193 * d_SoilTemperature * d_SoilTemperature));
    } else {
      throw new Error("irregular soil temperature fo_TempOnDecompostion (d_SoilTemperature = "+d_SoilTemperature+")");
    }

    return fo_TempOnDecompostion;
  };

  var fo_MoistOnDecompostion = function (d_SoilMoisture_pF) {
    
    var fo_MoistOnDecompostion=0.0;

    if (abs(d_SoilMoisture_pF) <= 1.0E-7) {
      //
      fo_MoistOnDecompostion = 0.6;

    } else if (d_SoilMoisture_pF > 0.0 && d_SoilMoisture_pF <= 1.5) {
      //
      fo_MoistOnDecompostion = 0.6 + 0.4 * (d_SoilMoisture_pF / 1.5);

    } else if (d_SoilMoisture_pF > 1.5 && d_SoilMoisture_pF <= 2.5) {
      //
      fo_MoistOnDecompostion = 1.0;

    } else if (d_SoilMoisture_pF > 2.5 && d_SoilMoisture_pF <= 6.5) {
      //
      fo_MoistOnDecompostion = 1.0 - ((d_SoilMoisture_pF - 2.5) / 4.0);

    } else if (d_SoilMoisture_pF > 6.5) {

      fo_MoistOnDecompostion = 0.0;

    } else {
      throw new Error("fo_MoistOnDecompostion ( d_SoilMoisture_pF ) : irregular soil water content");
    }

    return fo_MoistOnDecompostion;
  };

  var fo_MoistOnHydrolysis = function (d_SoilMoisture_pF) {

    var fo_MoistOnHydrolysis=0.0;

    if (d_SoilMoisture_pF > 0.0 && d_SoilMoisture_pF <= 1.1) {
      fo_MoistOnHydrolysis = 0.72;

    } else if (d_SoilMoisture_pF > 1.1 && d_SoilMoisture_pF <= 2.4) {
      fo_MoistOnHydrolysis = 0.2207 * d_SoilMoisture_pF + 0.4672;

    } else if (d_SoilMoisture_pF > 2.4 && d_SoilMoisture_pF <= 3.4) {
      fo_MoistOnHydrolysis = 1.0;

    } else if (d_SoilMoisture_pF > 3.4 && d_SoilMoisture_pF <= 4.6) {
      fo_MoistOnHydrolysis = -0.8659 * d_SoilMoisture_pF + 3.9849;

    } else if (d_SoilMoisture_pF > 4.6) {
      fo_MoistOnHydrolysis = 0.0;

    } else if (d_SoilMoisture_pF === -Infinity) { /* TODO: Special JavaScript case ? */
      fo_MoistOnHydrolysis = 0.0;
    
    } else {
      throw new Error("fo_MoistOnHydrolysis ( d_SoilMoisture_pF: "+d_SoilMoisture_pF+" ) irregular soil water content");
    }

    return fo_MoistOnHydrolysis;
  };

  var fo_TempOnNitrification = function (d_SoilTemperature) {
    
    var fo_TempOnNitrification=0.0;

    if (d_SoilTemperature <= 2.0 && d_SoilTemperature > -40.0) {
      fo_TempOnNitrification = 0.0;

    } else if (d_SoilTemperature > 2.0 && d_SoilTemperature <= 6.0) {
      fo_TempOnNitrification = 0.15 * (d_SoilTemperature - 2.0);

    } else if (d_SoilTemperature > 6.0 && d_SoilTemperature <= 20.0) {
      fo_TempOnNitrification = 0.1 * d_SoilTemperature;

    } else if (d_SoilTemperature > 20.0 && d_SoilTemperature <= 70.0) {
      fo_TempOnNitrification
          = exp(0.47 - (0.027 * d_SoilTemperature) + (0.00193 * d_SoilTemperature * d_SoilTemperature));
    } else {
      throw new Error("irregular soil temperature");
    }

    return fo_TempOnNitrification;
  };

  var fo_MoistOnNitrification = function (d_SoilMoisture_pF) {
    
    var fo_MoistOnNitrification=0.0;

    if (abs(d_SoilMoisture_pF) <= 1.0E-7) {
      fo_MoistOnNitrification = 0.6;

    } else if (d_SoilMoisture_pF > 0.0 && d_SoilMoisture_pF <= 1.5) {
      fo_MoistOnNitrification = 0.6 + 0.4 * (d_SoilMoisture_pF / 1.5);

    } else if (d_SoilMoisture_pF > 1.5 && d_SoilMoisture_pF <= 2.5) {
      fo_MoistOnNitrification = 1.0;

    } else if (d_SoilMoisture_pF > 2.5 && d_SoilMoisture_pF <= 5.0) {
      fo_MoistOnNitrification = 1.0 - ((d_SoilMoisture_pF - 2.5) / 2.5);

    } else if (d_SoilMoisture_pF > 5.0) {
      fo_MoistOnNitrification = 0.0;

    } else {
      throw new Error("irregular soil water content");
    }
    return fo_MoistOnNitrification;
  };

  var fo_MoistOnDenitrification = function (d_SoilMoisture_m3, d_Saturation) {

    var po_Denit1 = centralParameterProvider.userSoilOrganicParameters.po_Denit1;
    var po_Denit2 = centralParameterProvider.userSoilOrganicParameters.po_Denit2;
    var po_Denit3 = centralParameterProvider.userSoilOrganicParameters.po_Denit3;
    var fo_MoistOnDenitrification=0.0;

    if ((d_SoilMoisture_m3 / d_Saturation) <= 0.8) {
      fo_MoistOnDenitrification = 0.0;

    } else if ((d_SoilMoisture_m3 / d_Saturation) > 0.8 && (d_SoilMoisture_m3 / d_Saturation) <= 0.9) {

      fo_MoistOnDenitrification = po_Denit1 * ((d_SoilMoisture_m3 / d_Saturation)
           - po_Denit2) / (po_Denit3 - po_Denit2);

    } else if ((d_SoilMoisture_m3 / d_Saturation) > 0.9 && (d_SoilMoisture_m3 / d_Saturation) <= 1.0) {

      fo_MoistOnDenitrification = po_Denit1 + (1.0 - po_Denit1)
          * ((d_SoilMoisture_m3 / d_Saturation) - po_Denit3) / (1.0 - po_Denit3);
    } else {
      throw new Error("irregular soil water content");
    }

    return fo_MoistOnDenitrification;
  };

  var fo_NH3onNitriteOxidation = function (d_SoilNH4, d_SoilpH) {

    var po_Inhibitor_NH3 = centralParameterProvider.userSoilOrganicParameters.po_Inhibitor_NH3;
    var fo_NH3onNitriteOxidation=0.0;

    fo_NH3onNitriteOxidation = po_Inhibitor_NH3 + d_SoilNH4 * (1.0 - 1.0 / (1.0
         + pow(10.0,(d_SoilpH - ORGANIC_CONSTANTS.PO_PKANH3)))) / po_Inhibitor_NH3;

    return fo_NH3onNitriteOxidation;
  };

  var fo_NetEcosystemProduction = function (d_NetPrimaryProduction, d_DecomposerRespiration) {

    var vo_NEP = 0.0;

    vo_NEP = d_NetPrimaryProduction - (d_DecomposerRespiration * 10000.0); // [kg C ha-1 d-1]

    return vo_NEP;
  };

  var fo_NetEcosystemExchange = function (d_NetPrimaryProduction, d_DecomposerRespiration) {

    // NEE = NEP (M.U.F. Kirschbaum and R. Mueller (2001): Net Ecosystem Exchange. Workshop Proceedings CRC for greenhouse accounting.
    // Per definition: NPP is negative and respiration is positive

    var vo_NEE = 0.0;

    vo_NEE = - d_NetPrimaryProduction + (d_DecomposerRespiration * 10000.0); // [kg C ha-1 d-1]

    return vo_NEE;
  };

  var get_SoilOrganicC = function (i_Layer)  {
    return vo_SoilOrganicC[i_Layer] / soilColumn[i_Layer].vs_SoilBulkDensity();
  };

  var get_AOM_FastSum = function (i_Layer) {
    return vo_AOM_FastSum[i_Layer];
  };

  var get_AOM_SlowSum = function (i_Layer) {
    return vo_AOM_SlowSum[i_Layer];
  };

  var get_SMB_Fast = function (i_Layer) {
    return soilColumn[i_Layer].vs_SMB_Fast;
  };

  var get_SMB_Slow = function (i_Layer) {
    return soilColumn[i_Layer].vs_SMB_Slow;
  };

  var get_SOM_Fast = function (i_Layer) {
    return soilColumn[i_Layer].vs_SOM_Fast;
  };

  var get_SOM_Slow = function (i_Layer) {
    return soilColumn[i_Layer].vs_SOM_Slow;
  };

  var get_CBalance = function (i_Layer) {
    return vo_CBalance[i_Layer];
  };

  var get_SMB_CO2EvolutionRate = function (i_Layer) {
    return vo_SMB_CO2EvolutionRate[i_Layer];
  };

  var get_ActDenitrificationRate = function (i_Layer) {
    return vo_ActDenitrificationRate[i_Layer];
  };

  var get_NetNMineralisationRate = function (i_Layer) {
    return vo_NetNMineralisationRate[i_Layer] * 10000.0;
  };

  var get_NetNMineralisation = function () {
    return vo_NetNMineralisation * 10000.0;
  };

  var get_SumNetNMineralisation = function () {
    return vo_SumNetNMineralisation * 10000.0;
  };

  var get_SumDenitrification = function () {
    return vo_SumDenitrification * 10000.0;
  };

  var get_Denitrification = function () {
    return vo_TotalDenitrification * 10000.0;
  };

  var get_NH3_Volatilised = function () {
    return vo_Total_NH3_Volatilised * 10000.0;
  };

  var get_SumNH3_Volatilised = function () {
    return vo_SumNH3_Volatilised * 10000.0;
  };

  var get_N2O_Produced = function () {
    return vo_N2O_Produced * 10000.0;
  };

  var get_SumN2O_Produced = function () {
    return vo_SumN2O_Produced * 10000.0;
  };

  var get_DecomposerRespiration = function () {
    return vo_DecomposerRespiration * 10000.0;
  };

  var get_NetEcosystemProduction = function () {
    return vo_NetEcosystemProduction;
  };

  var get_NetEcosystemExchange = function () {
    return vo_NetEcosystemExchange;
  };

  var put_Crop = function (c) {
    crop = c;
  };

  var remove_Crop = function () {
    crop = null;
  };

  return {
      step: step
    , addOrganicMatter: addOrganicMatter
    , addIrrigationWater: addIrrigationWater
    , setIncorporation: function (incorp) { incorporation = incorp; }
    , put_Crop: put_Crop
    , remove_Crop: remove_Crop
    , get_SoilOrganicC: get_SoilOrganicC
    , get_AOM_FastSum: get_AOM_FastSum
    , get_AOM_SlowSum: get_AOM_SlowSum
    , get_SMB_Fast: get_SMB_Fast
    , get_SMB_Slow: get_SMB_Slow
    , get_SOM_Fast: get_SOM_Fast
    , get_SOM_Slow: get_SOM_Slow
    , get_CBalance: get_CBalance
    , get_SMB_CO2EvolutionRate: get_SMB_CO2EvolutionRate
    , get_ActDenitrificationRate: get_ActDenitrificationRate
    , get_NetNMineralisationRate: get_NetNMineralisationRate
    , get_NH3_Volatilised: get_NH3_Volatilised
    , get_SumNH3_Volatilised: get_SumNH3_Volatilised
    , get_N2O_Produced: get_N2O_Produced
    , get_SumN2O_Produced: get_SumN2O_Produced
    , get_NetNMineralisation: get_NetNMineralisation
    , get_SumNetNMineralisation: get_SumNetNMineralisation
    , get_SumDenitrification: get_SumDenitrification
    , get_Denitrification: get_Denitrification
    , get_DecomposerRespiration: get_DecomposerRespiration
    , get_NetEcosystemProduction: get_NetEcosystemProduction
    , get_NetEcosystemExchange: get_NetEcosystemExchange
  };

};


var FrostComponent = function (sc, cpp) {
    
  var soilColumn = sc,
      centralParameterProvider = cpp,
      vm_FrostDepth = 0.0,
      vm_accumulatedFrostDepth = 0.0,
      vm_NegativeDegreeDays = 0.0,
      vm_ThawDepth = 0.0,
      vm_FrostDays = 0,
      vm_LambdaRedux = new Float64Array(sc.vs_NumberOfLayers() + 1),
      pt_TimeStep = centralParameterProvider.userEnvironmentParameters.p_timeStep,
      vm_HydraulicConductivityRedux = centralParameterProvider.userSoilMoistureParameters.pm_HydraulicConductivityRedux;

    for (var i = 0, is = vm_LambdaRedux.length; i < is; i++)
      vm_LambdaRedux[i] = 1.0;

  var calcSoilFrost = function (mean_air_temperature, snow_depth) {

    // calculation of mean values
    var mean_field_capacity = getMeanFieldCapacity();
    var mean_bulk_density = getMeanBulkDensity();

    // heat conductivity for frozen and unfrozen soil
    var sii = calcSii(mean_field_capacity);
    var heat_conductivity_frozen = calcHeatConductivityFrozen(mean_bulk_density, sii);
    var heat_conductivity_unfrozen = calcHeatConductivityUnfrozen(mean_bulk_density, mean_field_capacity);

    // temperature under snow
    var temperature_under_snow = calcTemperatureUnderSnow(mean_air_temperature, snow_depth);

    // frost depth
    vm_FrostDepth = calcFrostDepth(mean_field_capacity, heat_conductivity_frozen, temperature_under_snow);
    if (isNaN(vm_FrostDepth))
      throw vm_FrostDepth;
    vm_accumulatedFrostDepth+=vm_FrostDepth;


    // thaw depth
    vm_ThawDepth = calcThawDepth(temperature_under_snow, heat_conductivity_unfrozen, mean_field_capacity);

    updateLambdaRedux();

  };

  var getMeanBulkDensity = function () {

    var vs_number_of_layers = soilColumn.vs_NumberOfLayers();
    var bulk_density_accu = 0.0;
    for (var i_Layer = 0; i_Layer < vs_number_of_layers; i_Layer++) {
      bulk_density_accu += soilColumn[i_Layer].vs_SoilBulkDensity();
    }
    return (bulk_density_accu / vs_number_of_layers / 1000.0); // [Mg m-3]
  };

  var getMeanFieldCapacity = function () {

    var vs_number_of_layers = soilColumn.vs_NumberOfLayers();
    var mean_field_capacity_accu = 0.0;
    for (var i_Layer = 0; i_Layer < vs_number_of_layers; i_Layer++) {
      mean_field_capacity_accu += soilColumn[i_Layer].get_FieldCapacity();
    }
    return (mean_field_capacity_accu / vs_number_of_layers);
  };

  var calcSii = function (mean_field_capacity) {

    /** @TODO Parameters to be supplied from outside */
    var pt_F1 = 13.05; // Hansson et al. 2004
    var pt_F2 = 1.06; // Hansson et al. 2004

    var sii = (mean_field_capacity + (1.0 + (pt_F1 * pow(mean_field_capacity, pt_F2)) *
                        mean_field_capacity)) * 100.0;
    return sii;
  };


  /*
    mean_bulk_density [g m-3]

  */
  var calcHeatConductivityFrozen = function (mean_bulk_density, sii) {

    var cond_frozen = ((3.0 * mean_bulk_density - 1.7) * 0.001) / (1.0
        + (11.5 - 5.0 * mean_bulk_density) * exp((-50.0) * pow((sii / mean_bulk_density), 1.5))) * // [cal cm-1 K-1 s-1]
        86400.0 * pt_TimeStep * // [cal cm-1 K-1 d-1]
        4.184 / // [J cm-1 K-1 d-1]
        1000000.0 * 100;//  [MJ m-1 K-1 d-1]

    return cond_frozen;
  };

  /*
    mean_bulk_density [g m-3]

  */
  var calcHeatConductivityUnfrozen = function (mean_bulk_density, mean_field_capacity) {

    var cond_unfrozen = ((3.0 * mean_bulk_density - 1.7) * 0.001) / (1.0 + (11.5 - 5.0
          * mean_bulk_density) * exp((-50.0) * pow(((mean_field_capacity * 100.0) / mean_bulk_density), 1.5)))
          * pt_TimeStep * // [cal cm-1 K-1 s-1]
          4.184 * // [J cm-1 K-1 s-1]
          100.0; // [W m-1 K-1]

    return cond_unfrozen;
  };

  var calcThawDepth = function (temperature_under_snow, heat_conductivity_unfrozen, mean_field_capacity) {

    var thaw_helper1 = 0.0;
    var thaw_helper2 = 0.0;
    var thaw_helper3 = 0.0;
    var thaw_helper4 = 0.0;

    var thaw_depth = 0.0;

    if (temperature_under_snow < 0.0) {
      thaw_helper1 = temperature_under_snow * -1.0;
    } else {
      thaw_helper1 = temperature_under_snow;
    }

    if (vm_FrostDepth == 0.0) {
      thaw_helper2 = 0.0;
    } else {
      /** @todo Claas: check that heat conductivity is in correct unit! */
      thaw_helper2 = sqrt(2.0 * heat_conductivity_unfrozen * thaw_helper1 / (1000.0 * 79.0
          * (mean_field_capacity * 100.0) / 100.0));
    }

    if (temperature_under_snow < 0.0) {
      thaw_helper3 = thaw_helper2 * -1.0;
    } else {
      thaw_helper3 = thaw_helper2;
    }

    thaw_helper4 = vm_ThawDepth + thaw_helper3;

    if (thaw_helper4 < 0.0){
      thaw_depth = 0.0;
    } else {
      thaw_depth = thaw_helper4;
    }
    return thaw_depth;
  };

  var calcFrostDepth = function (mean_field_capacity, heat_conductivity_frozen, temperature_under_snow) {

    var frost_depth=0.0;

    // Heat released/absorbed on freezing/thawing
    var latent_heat = 1000.0 * (mean_field_capacity * 100.0) / 100.0 * 0.335;

    // Summation of number of days with frost
    if (vm_FrostDepth > 0.0) {
      vm_FrostDays++;
    }

    // Ratio of energy sum from subsoil to vm_LatentHeat
    var latent_heat_transfer = 0.3 * vm_FrostDays / latent_heat;

    // Calculate temperature under snowpack
    /** @todo Claas: At a later stage temperature under snow to pass on to soil
     * surface temperature calculation in temperature module */
    if (temperature_under_snow < 0.0) {
      vm_NegativeDegreeDays -= temperature_under_snow;
    }

    if (vm_NegativeDegreeDays < 0.01) {
      frost_depth = 0.0;
    }
    else {
      frost_depth = sqrt(((latent_heat_transfer / 2.0) * (latent_heat_transfer / 2.0)) + (2.0
          * heat_conductivity_frozen * vm_NegativeDegreeDays / latent_heat)) - (latent_heat_transfer / 2.0);
    }

    return isNaN(frost_depth) ? 0.0 : frost_depth;
  };

  var calcTemperatureUnderSnow = function (mean_air_temperature, snow_depth) {

    var temperature_under_snow = 0.0;
    if (snow_depth / 100.0 < 0.01) {
      temperature_under_snow = mean_air_temperature;
    } else if (vm_FrostDepth < 0.01) {
      temperature_under_snow = mean_air_temperature;
    } else {
      temperature_under_snow = mean_air_temperature / (1.0 + (10.0 * snow_depth / 100.0) / vm_FrostDepth);
    }

    return temperature_under_snow;
  };

  var updateLambdaRedux = function () {

    var vs_number_of_layers = soilColumn.vs_NumberOfLayers();

    for (var i_Layer = 0; i_Layer < vs_number_of_layers; i_Layer++) {

      if (i_Layer < (int(floor((vm_FrostDepth / soilColumn[i_Layer].vs_LayerThickness) + 0.5)))) {

        // soil layer is frozen
        soilColumn[i_Layer].vs_SoilFrozen = true;
        vm_LambdaRedux[i_Layer] = 0.0;

        if (i_Layer == 0) {
          vm_HydraulicConductivityRedux = 0.0;
        }
      }


      if (i_Layer < (int(floor((vm_ThawDepth / soilColumn[i_Layer].vs_LayerThickness) + 0.5)))) {
        // soil layer is thawing

        if (vm_ThawDepth < ((i_Layer + 1) * soilColumn[i_Layer].vs_LayerThickness) && (vm_ThawDepth < vm_FrostDepth)) {
          // soil layer is thawing but there is more frost than thaw
          soilColumn[i_Layer].vs_SoilFrozen = true;
          vm_LambdaRedux[i_Layer] = 0.0;
          if (i_Layer == 0) {
            vm_HydraulicConductivityRedux = 0.0;
          }

        } else {
          // soil is thawing
          soilColumn[i_Layer].vs_SoilFrozen = false;
          vm_LambdaRedux[i_Layer] = 1.0;
          if (i_Layer == 0) {
            vm_HydraulicConductivityRedux = 0.1;
          }
        }
      }

      // no more frost, because all layers are thawing
      if (vm_ThawDepth >= vm_FrostDepth) {
        vm_ThawDepth = 0.0;
        vm_FrostDepth = 0.0;
        vm_NegativeDegreeDays = 0.0;
        vm_FrostDays = 0;

        vm_HydraulicConductivityRedux = centralParameterProvider.userSoilMoistureParameters.pm_HydraulicConductivityRedux;
        for (var i_Layer = 0; i_Layer < vs_number_of_layers; i_Layer++) {
          soilColumn[i_Layer].vs_SoilFrozen = false;
          vm_LambdaRedux[i_Layer] = 1.0;
        }
      }
    }

  };

  var getLambdaRedux = function (layer) {
    return vm_LambdaRedux[layer];
  };

  return {
    calcSoilFrost: calcSoilFrost, 
    getFrostDepth: function () { return vm_FrostDepth; },
    getThawDepth: function () { return vm_ThawDepth; },
    getLambdaRedux: getLambdaRedux,
    getAccumulatedFrostDepth: function () { return vm_accumulatedFrostDepth; }
  };

};


var SnowComponent = function (cpp) {

  var vm_SnowDensity = 0.0,
      vm_SnowDepth = 0.0,
      vm_FrozenWaterInSnow = 0.0,
      vm_LiquidWaterInSnow = 0.0,
      vm_maxSnowDepth = 0.0,
      vm_AccumulatedSnowDepth = 0.0,
      centralParameterProvider = cpp,
      sm_params = centralParameterProvider.userSoilMoistureParameters,
      vm_WaterToInfiltrate = 0,

      vm_SnowmeltTemperature = sm_params.pm_SnowMeltTemperature, // Base temperature for snowmelt [°C]
      vm_SnowAccumulationThresholdTemperature = sm_params.pm_SnowAccumulationTresholdTemperature,
      vm_TemperatureLimitForLiquidWater = sm_params.pm_TemperatureLimitForLiquidWater, // Lower temperature limit of liquid water in snow
      vm_CorrectionRain = sm_params.pm_CorrectionRain, // Correction factor for rain (no correction used here)
      vm_CorrectionSnow = sm_params.pm_CorrectionSnow, // Correction factor for snow (value used in COUP by Lars Egil H.)
      vm_RefreezeTemperature = sm_params.pm_RefreezeTemperature, // Base temperature for refreeze [°C]
      vm_RefreezeP1 = sm_params.pm_RefreezeParameter1, // Refreeze parameter (Karvonen's value)
      vm_RefreezeP2 = sm_params.pm_RefreezeParameter2, // Refreeze exponent (Karvonen's value)
      vm_NewSnowDensityMin = sm_params.pm_NewSnowDensityMin, // Minimum density of new snow
      vm_SnowMaxAdditionalDensity = sm_params.pm_SnowMaxAdditionalDensity, // Maximum additional density of snow (max rho = 0.35, Karvonen)
      vm_SnowPacking = sm_params.pm_SnowPacking, // Snow packing factor (calibrated by Helge Bonesmo)
      vm_SnowRetentionCapacityMin = sm_params.pm_SnowRetentionCapacityMin, // Minimum liquid water retention capacity in snow [mm]
      vm_SnowRetentionCapacityMax = sm_params.pm_SnowRetentionCapacityMax; // Maximum liquid water retention capacity in snow [mm]

  var calcSnowLayer = function (mean_air_temperature, net_precipitation) {

    // Calcs netto precipitation
    var net_precipitation_snow = 0.0;
    var net_precipitation_water = 0.0;
    var obj = calcNetPrecipitation(mean_air_temperature, net_precipitation, net_precipitation_water, net_precipitation_snow);
    net_precipitation = obj.net_precipitation;
    net_precipitation_snow = obj.net_precipitation_snow;
    net_precipitation_water = obj.net_precipitation_water;

    // Calculate snowmelt
    var vm_Snowmelt = calcSnowMelt(mean_air_temperature);

    // Calculate refreeze in snow
    var vm_Refreeze=calcRefreeze(mean_air_temperature);

    // Calculate density of newly fallen snow
    var vm_NewSnowDensity = calcNewSnowDensity(mean_air_temperature,net_precipitation_snow);

    // Calculate average density of whole snowpack
    vm_SnowDensity = calcAverageSnowDensity(net_precipitation_snow, vm_NewSnowDensity);


    // Calculate amounts of water in frozen snow and liquid form
    vm_FrozenWaterInSnow = vm_FrozenWaterInSnow + net_precipitation_snow - vm_Snowmelt + vm_Refreeze;
    vm_LiquidWaterInSnow = vm_LiquidWaterInSnow + net_precipitation_water + vm_Snowmelt - vm_Refreeze;
    var vm_SnowWaterEquivalent = vm_FrozenWaterInSnow + vm_LiquidWaterInSnow; // snow water equivalent [mm]

    // Calculate snow's capacity to retain liquid
    var vm_LiquidWaterRetainedInSnow = calcLiquidWaterRetainedInSnow(vm_FrozenWaterInSnow, vm_SnowWaterEquivalent);

    // Calculate water release from snow
    var vm_SnowLayerWaterRelease = 0.0;
    if (vm_Refreeze > 0.0) {
      vm_SnowLayerWaterRelease = 0.0;
    } else if (vm_LiquidWaterInSnow <= vm_LiquidWaterRetainedInSnow) {
      vm_SnowLayerWaterRelease = 0;
    } else {
      vm_SnowLayerWaterRelease = vm_LiquidWaterInSnow - vm_LiquidWaterRetainedInSnow;
      vm_LiquidWaterInSnow -= vm_SnowLayerWaterRelease;
      vm_SnowWaterEquivalent = vm_FrozenWaterInSnow + vm_LiquidWaterInSnow;
    }

    // Calculate snow depth from snow water equivalent
    calcSnowDepth(vm_SnowWaterEquivalent);

    // Calculate potential infiltration to soil
    vm_WaterToInfiltrate = calcPotentialInfiltration(net_precipitation, vm_SnowLayerWaterRelease, vm_SnowDepth);
  };

  var calcSnowMelt = function (vw_MeanAirTemperature) {

    var vm_MeltingFactor = 1.4 * (vm_SnowDensity / 0.1);
    var vm_Snowmelt = 0.0;

    if (vm_MeltingFactor > 4.7) {
      vm_MeltingFactor = 4.7;
    }

    if (vm_FrozenWaterInSnow <= 0.0) {
      vm_Snowmelt = 0.0;
    } else if (vw_MeanAirTemperature < vm_SnowmeltTemperature) {
      vm_Snowmelt = 0.0;
    } else {
      vm_Snowmelt = vm_MeltingFactor * (vw_MeanAirTemperature - vm_SnowmeltTemperature);
      if (vm_Snowmelt > vm_FrozenWaterInSnow) {
        vm_Snowmelt = vm_FrozenWaterInSnow;
      }
    }

    return vm_Snowmelt;
  };

  var calcNetPrecipitation = function (
    mean_air_temperature,
    net_precipitation,
    net_precipitation_water, // return values
    net_precipitation_snow // return values
    ) {
    
    var liquid_water_precipitation = 0.0;

    // Calculate forms and proportions of precipitation
    if (mean_air_temperature >= vm_SnowAccumulationThresholdTemperature) {
      liquid_water_precipitation = 1.0;
    } else if (mean_air_temperature <= vm_TemperatureLimitForLiquidWater) {
      liquid_water_precipitation = 0.0;
    } else {
      liquid_water_precipitation = (mean_air_temperature - vm_TemperatureLimitForLiquidWater)
          / (vm_SnowAccumulationThresholdTemperature - vm_TemperatureLimitForLiquidWater);
    }

    net_precipitation_water = liquid_water_precipitation * vm_CorrectionRain * net_precipitation;
    net_precipitation_snow = (1.0 - liquid_water_precipitation) * vm_CorrectionSnow * net_precipitation;

    // Total net precipitation corrected for snow
    net_precipitation = net_precipitation_snow + net_precipitation_water;

    return {
      net_precipitation: net_precipitation,
      net_precipitation_snow: net_precipitation_snow,
      net_precipitation_water: net_precipitation_water
    };

  };

  var calcRefreeze = function (mean_air_temperature) {

    var refreeze = 0.0;
    var refreeze_helper = 0.0;

    // no refreeze if it's too warm
    if (mean_air_temperature > 0) {
      refreeze_helper = 0;
    } else {
      refreeze_helper = mean_air_temperature;
    }

    if (refreeze_helper < vm_RefreezeTemperature) {
      if (vm_LiquidWaterInSnow > 0.0) {
        refreeze = vm_RefreezeP1 * pow((vm_RefreezeTemperature - refreeze_helper), vm_RefreezeP2);
      }
      if (refreeze > vm_LiquidWaterInSnow) {
        refreeze = vm_LiquidWaterInSnow;
      }
    } else {
      refreeze = 0;
    }
    return refreeze;
  };

  var calcNewSnowDensity = function (mean_air_temperature, net_precipitation_snow) {
    
    var new_snow_density = 0.0;
    var snow_density_factor = 0.0;

    if (net_precipitation_snow <= 0.0) {
      // no snow
      new_snow_density = 0.0;
    } else {
      //
      snow_density_factor = ( 
        (mean_air_temperature - vm_TemperatureLimitForLiquidWater) / 
        (vm_SnowAccumulationThresholdTemperature - vm_TemperatureLimitForLiquidWater)
      );

      if (snow_density_factor > 1.0) {
        snow_density_factor = 1.0;
      }
      if (snow_density_factor < 0.0) {
        snow_density_factor = 0.0;
      }
      new_snow_density = vm_NewSnowDensityMin + vm_SnowMaxAdditionalDensity * snow_density_factor;
    }
    return new_snow_density;
  };

  var calcAverageSnowDensity = function (net_precipitation_snow, new_snow_density) {

    var snow_density = 0.0;
    if ((vm_SnowDepth + net_precipitation_snow) <= 0.0) {
      // no snow
      snow_density = 0.0;
    } else {
      snow_density = (((1.0 + vm_SnowPacking) * vm_SnowDensity * vm_SnowDepth) +
                        (new_snow_density * net_precipitation_snow)) / (vm_SnowDepth + net_precipitation_snow);
      if (snow_density > (vm_NewSnowDensityMin + vm_SnowMaxAdditionalDensity)) {
        snow_density = vm_NewSnowDensityMin + vm_SnowMaxAdditionalDensity;
      }
    }
    return snow_density;
  };

  var calcLiquidWaterRetainedInSnow = function (frozen_water_in_snow, snow_water_equivalent) {

    var snow_retention_capacity;
    var liquid_water_retained_in_snow;

    if ((frozen_water_in_snow <= 0.0) || (vm_SnowDensity <= 0.0)) {
      snow_retention_capacity = 0.0;
    } else {
      snow_retention_capacity = vm_SnowRetentionCapacityMax / 10.0 / vm_SnowDensity;

      if (snow_retention_capacity < vm_SnowRetentionCapacityMin)
        snow_retention_capacity = vm_SnowRetentionCapacityMin;
      if (snow_retention_capacity > vm_SnowRetentionCapacityMax)
        snow_retention_capacity = vm_SnowRetentionCapacityMax;
    }

    liquid_water_retained_in_snow = snow_retention_capacity * snow_water_equivalent;
    return liquid_water_retained_in_snow;
  };

  var calcPotentialInfiltration = function (net_precipitation, snow_layer_water_release, snow_depth) {

    var water_to_infiltrate = net_precipitation;
    if (snow_depth >= 0.01){
      vm_WaterToInfiltrate = snow_layer_water_release;
    }
    return water_to_infiltrate;
  };

  var calcSnowDepth = function (snow_water_equivalent) {

    var pm_WaterDensity = 1.0; // [kg dm-3]
    if (snow_water_equivalent <= 0.0) {
      vm_SnowDepth = 0.0;
    } else {
      vm_SnowDepth = snow_water_equivalent * pm_WaterDensity / vm_SnowDensity; // [mm * kg dm-3 kg-1 dm3]

      // check if new snow depth is higher than maximal snow depth
      if (vm_SnowDepth>vm_maxSnowDepth) {
        vm_maxSnowDepth = vm_SnowDepth;
      }

      if (vm_SnowDepth < 0.01) {
        vm_SnowDepth = 0.0;
      }
    }
    if (vm_SnowDepth == 0.0) {
      vm_SnowDensity = 0.0;
      vm_FrozenWaterInSnow = 0.0;
      vm_LiquidWaterInSnow = 0.0;
    }
    vm_AccumulatedSnowDepth+=vm_SnowDepth;
  };

  return {
      calcSnowLayer: calcSnowLayer
    , getVm_SnowDepth: function () { return vm_SnowDepth; }
    , getWaterToInfiltrate: function () { return vm_WaterToInfiltrate; }
    , getMaxSnowDepth: function () { return vm_maxSnowDepth; }
    , accumulatedSnowDepth: function () { return vm_AccumulatedSnowDepth; }
  };

};



var SoilMoisture = function (sc, stps, mm, cpp) {

  var soilColumn = sc,
      siteParameters = stps,
      monica = mm,
      centralParameterProvider = cpp,
      vm_NumberOfLayers = sc.vs_NumberOfLayers() + 1,
      vs_NumberOfLayers = sc.vs_NumberOfLayers(), //extern
      vm_ActualEvapotranspiration = 0.0,
      vm_AvailableWater = new Float64Array(vm_NumberOfLayers), // Soil available water in [mm]
      vm_CapillaryRise = 0,
      pm_CapillaryRiseRate = new Float64Array(vm_NumberOfLayers),
      vm_CapillaryWater = new Float64Array(vm_NumberOfLayers), // soil capillary water in [mm]
      vm_CapillaryWater70 = new Float64Array(vm_NumberOfLayers), // 70% of soil capillary water in [mm]
      vm_Evaporation = new Float64Array(vm_NumberOfLayers), //intern
      vm_Evapotranspiration = new Float64Array(vm_NumberOfLayers), //intern
      vm_FieldCapacity = new Float64Array(vm_NumberOfLayers),
      vm_FluxAtLowerBoundary = 0.0,
      vm_GravitationalWater = new Float64Array(vm_NumberOfLayers), // Gravitational water in [mm d-1] //intern
      vm_GrossPrecipitation = 0.0, //internal
      vm_GroundwaterAdded = 0,
      //vm_GroundwaterDistance = vm_NumberOfLayers, 0), // map  = joachim)
      vm_GroundwaterTable = 0,
      vm_HeatConductivity = new Float64Array(vm_NumberOfLayers),
      vm_Infiltration = 0.0,
      vm_Interception = 0.0,
      vc_KcFactor = 0.6,
      vm_Lambda = new Float64Array(vm_NumberOfLayers),
      vm_LambdaReduced = 0,
      vs_Latitude = stps.vs_Latitude,
      vm_LayerThickness = new Float64Array(vm_NumberOfLayers), //0.01, 
      vw_MaxAirTemperature = 0,
      vw_MeanAirTemperature = 0,
      vw_MinAirTemperature = 0,
      vc_NetPrecipitation = 0.0,
      vw_NetRadiation = 0,
      vm_PermanentWiltingPoint = new Float64Array(vm_NumberOfLayers),
      vc_PercentageSoilCoverage = 0.0,
      vm_PercolationRate = new Float64Array(vm_NumberOfLayers), // Percolation rate in [mm d-1] //intern
      vw_Precipitation = 0,
      vm_ReferenceEvapotranspiration = 6.0, //internal
      vw_RelativeHumidity = 0,
      vm_ResidualEvapotranspiration = new Float64Array(vm_NumberOfLayers),
      vm_SoilMoisture = new Float64Array(vm_NumberOfLayers), //0.20 //result 
      vm_SoilMoisture_crit = 0, 
      vm_SoilMoistureDeficit = 0,
      vm_SoilPoreVolume = new Float64Array(vm_NumberOfLayers),
      vc_StomataResistance = 0,
      vm_SurfaceRunOff = 0.0, //internal
      vm_SumSurfaceRunOff = 0.0, // intern accumulation variable
      vm_SurfaceWaterStorage = 0.0,
      vm_TotalWaterRemoval = 0,
      vm_Transpiration = new Float64Array(vm_NumberOfLayers), //intern
      vm_TranspirationDeficit = 0,
      vm_WaterFlux = new Float64Array(vm_NumberOfLayers),
      vw_WindSpeed = 0,
      vw_WindSpeedHeight = 0,
      vm_XSACriticalSoilMoisture = 0,
      crop = null

      vm_Infiltration = 0.0,
      vm_Interception = 0.0,
      vm_SurfaceRunOff = 0.0,
      vm_CapillaryRise = 0.0,
      vm_GroundwaterAdded = 0.0,
      vm_ActualTranspiration = 0.0,
      vm_ActualEvaporation = 0.0,
      vm_PercolationFactor = 0.0,
      vm_LambdaReduced = 0.0;    

    for (var i = 0; i < vm_NumberOfLayers; i++) {
      vm_SoilMoisture[i] = 0.20;
      vm_LayerThickness[i] = 0.01;
      // vm_AvailableWater[i] = 0.0;
      // pm_CapillaryRiseRate[i] = 0.0;
      // vm_CapillaryWater[i] = 0.0;
      // vm_CapillaryWater70[i] = 0.0;
      // vm_Evaporation[i] = 0.0;
      // vm_Evapotranspiration[i] = 0.0;
      // vm_FieldCapacity[i] = 0.0;
      // vm_GravitationalWater[i] = 0.0;
      // vm_HeatConductivity[i] = 0.0;
      // vm_Lambda[i] = 0.0;
      // vm_PermanentWiltingPoint[i] = 0.0;
      // vm_PercolationRate[i] = 0.0;
      // vm_ResidualEvapotranspiration[i] = 0.0;
      // vm_SoilPoreVolume[i] = 0.0;
      // vm_Transpiration[i] = 0.0;
      // vm_WaterFlux[i] = 0.0;
    }

    logger(MSG.INFO, "Constructor: SoilMoisture");

  var snowComponent = new SnowComponent(centralParameterProvider),
      frostComponent = new FrostComponent(soilColumn, centralParameterProvider),
      sm_params = centralParameterProvider.userSoilMoistureParameters,
      env_params =  centralParameterProvider.userEnvironmentParameters,
      vm_HydraulicConductivityRedux = sm_params.pm_HydraulicConductivityRedux,
      pt_TimeStep = centralParameterProvider.userEnvironmentParameters.p_timeStep,
      vm_SurfaceRoughness = sm_params.pm_SurfaceRoughness,
      vm_GroundwaterDischarge = sm_params.pm_GroundwaterDischarge,
      pm_MaxPercolationRate = sm_params.pm_MaxPercolationRate,
      pm_LeachingDepth = env_params.p_LeachingDepth,
      pm_LayerThickness = env_params.p_LayerThickness,
      pm_LeachingDepthLayer = int(floor(0.5 + (pm_LeachingDepth / pm_LayerThickness))) - 1,
      vm_SaturatedHydraulicConductivity = new Array(vm_NumberOfLayers);

    for (var i=0; i<vm_NumberOfLayers; i++) {
      vm_SaturatedHydraulicConductivity[i] = sm_params.pm_SaturatedHydraulicConductivity; // original [8640 mm d-1]
    }

  var step = function (
    vs_GroundwaterDepth,
    vw_Precipitation,
    vw_MaxAirTemperature,
    vw_MinAirTemperature,
    vw_RelativeHumidity,
    vw_MeanAirTemperature,
    vw_WindSpeed,
    vw_WindSpeedHeight,
    vw_GlobalRadiation,
    vs_JulianDay
  ) {

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      // initialization with moisture values stored in the layer
      vm_SoilMoisture[i_Layer] = soilColumn[i_Layer].get_Vs_SoilMoisture_m3();
      vm_WaterFlux[i_Layer] = 0.0;
      vm_FieldCapacity[i_Layer] = soilColumn[i_Layer].get_FieldCapacity();
      vm_SoilPoreVolume[i_Layer] = soilColumn[i_Layer].get_Saturation();
      vm_PermanentWiltingPoint[i_Layer] = soilColumn[i_Layer].get_PermanentWiltingPoint();
      vm_LayerThickness[i_Layer] = soilColumn[i_Layer].vs_LayerThickness;
      vm_Lambda[i_Layer] = soilColumn[i_Layer].vs_Lambda;
    }

    vm_SoilMoisture[vm_NumberOfLayers - 1] = soilColumn[vm_NumberOfLayers - 2].get_Vs_SoilMoisture_m3();
    vm_WaterFlux[vm_NumberOfLayers - 1] = 0.0;
    vm_FieldCapacity[vm_NumberOfLayers - 1] = soilColumn[vm_NumberOfLayers - 2].get_FieldCapacity();
    vm_SoilPoreVolume[vm_NumberOfLayers - 1] = soilColumn[vm_NumberOfLayers - 2].get_Saturation();
    vm_LayerThickness[vm_NumberOfLayers - 1] = soilColumn[vm_NumberOfLayers - 2].vs_LayerThickness;
    vm_Lambda[vm_NumberOfLayers - 1] = soilColumn[vm_NumberOfLayers - 2].vs_Lambda;

    vm_SurfaceWaterStorage = soilColumn.vs_SurfaceWaterStorage;

    var vc_CropPlanted   = false;
    var vc_CropHeight  = 0.0;
    var vc_DevelopmentalStage = 0;

    if (monica.cropGrowth()) {
      vc_CropPlanted = true;
      vc_PercentageSoilCoverage = monica.cropGrowth().get_SoilCoverage();
      vc_KcFactor = monica.cropGrowth().get_KcFactor();
      vc_CropHeight = monica.cropGrowth().get_CropHeight();
      vc_DevelopmentalStage = monica.cropGrowth().get_DevelopmentalStage();
      if (vc_DevelopmentalStage > 0) {
        vc_NetPrecipitation = monica.cropGrowth().get_NetPrecipitation();
      } else {
        vc_NetPrecipitation = vw_Precipitation;
      }

    } else {
      vc_CropPlanted = false;
      vc_KcFactor = centralParameterProvider.userSoilMoistureParameters.pm_KcFactor;
      vc_NetPrecipitation = vw_Precipitation;
      vc_PercentageSoilCoverage = 0.0;
    }

    // Recalculates current depth of groundwater table
    vm_GroundwaterTable = vs_NumberOfLayers + 2;
    var vm_GroundwaterHelper = vs_NumberOfLayers - 1;
    for (var i_Layer = vs_NumberOfLayers - 1; i_Layer >= 0; i_Layer--) {
      if (vm_SoilMoisture[i_Layer] == vm_SoilPoreVolume[i_Layer] && (vm_GroundwaterHelper == i_Layer)) {
        vm_GroundwaterHelper--;
        vm_GroundwaterTable = i_Layer;
      }
    }
    if ((vm_GroundwaterTable > (int(vs_GroundwaterDepth / soilColumn[0].vs_LayerThickness)))
         && (vm_GroundwaterTable < (vs_NumberOfLayers + 2))) {

      vm_GroundwaterTable = (int(vs_GroundwaterDepth / soilColumn[0].vs_LayerThickness));

    } else if (vm_GroundwaterTable >= (vs_NumberOfLayers + 2)){

      vm_GroundwaterTable = (int(vs_GroundwaterDepth / soilColumn[0].vs_LayerThickness));

    }

    soilColumn.vm_GroundwaterTable = vm_GroundwaterTable;

    // calculates snow layer water storage and release
    snowComponent.calcSnowLayer(vw_MeanAirTemperature, vc_NetPrecipitation);
    var vm_WaterToInfiltrate = snowComponent.getWaterToInfiltrate();
    
    // Calculates frost and thaw depth and switches lambda
    frostComponent.calcSoilFrost(vw_MeanAirTemperature, snowComponent.getVm_SnowDepth());

    // calculates infiltration of water from surface
    fm_Infiltration(vm_WaterToInfiltrate, vc_PercentageSoilCoverage, vm_GroundwaterTable);

    if ((vs_GroundwaterDepth <= 10.0) && (vs_GroundwaterDepth > 0.0)) {

      fm_PercolationWithGroundwater(vs_GroundwaterDepth);
      fm_GroundwaterReplenishment();

    } else {

      fm_PercolationWithoutGroundwater();
      fm_BackwaterReplenishment();

    }

    fm_Evapotranspiration(vc_PercentageSoilCoverage, vc_KcFactor, siteParameters.vs_HeightNN, vw_MaxAirTemperature,
        vw_MinAirTemperature, vw_RelativeHumidity, vw_MeanAirTemperature, vw_WindSpeed, vw_WindSpeedHeight,
        vw_GlobalRadiation, vc_DevelopmentalStage, vs_JulianDay, vs_Latitude);

    fm_CapillaryRise();

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      soilColumn[i_Layer].set_Vs_SoilMoisture_m3(vm_SoilMoisture[i_Layer]);
      soilColumn[i_Layer].vs_SoilWaterFlux = vm_WaterFlux[i_Layer];
      soilColumn[i_Layer].calc_vs_SoilMoisture_pF();
    }
    soilColumn.vs_SurfaceWaterStorage = vm_SurfaceWaterStorage;
    soilColumn.vs_FluxAtLowerBoundary = vm_FluxAtLowerBoundary;

  };

  var fm_Infiltration = function (vm_WaterToInfiltrate, vc_PercentageSoilCoverage, vm_GroundwaterTable) {

    // For receiving daily precipitation data all variables have to be reset
    var vm_RunOffFactor;
    var vm_PotentialInfiltration;
    var vm_ReducedHydraulicConductivity;
    var vm_PercolationFactor;
    var vm_LambdaReduced;

    vm_Infiltration = 0.0;
    vm_Interception = 0.0;
    vm_SurfaceRunOff = 0.0;
    vm_CapillaryRise = 0.0;
    vm_GroundwaterAdded = 0.0;
    vm_ActualTranspiration = 0.0;
    vm_PercolationFactor = 0.0;
    vm_LambdaReduced = 0.0;

    var vm_SurfaceWaterStorageOld = vm_SurfaceWaterStorage;

    // add the netto precipitation to the virtual surface water storage
    vm_SurfaceWaterStorage += vm_WaterToInfiltrate;

    // Calculating potential infiltration in [mm d-1]
    vm_SoilMoistureDeficit = (vm_SoilPoreVolume[0] - vm_SoilMoisture[0]) / vm_SoilPoreVolume[0];
    vm_ReducedHydraulicConductivity = vm_SaturatedHydraulicConductivity[0] * vm_HydraulicConductivityRedux;

    if (vm_ReducedHydraulicConductivity > 0.0) {

      vm_PotentialInfiltration
          = (vm_ReducedHydraulicConductivity * 0.2 * vm_SoilMoistureDeficit * vm_SoilMoistureDeficit);

      // minimum of the availabe amount of water and the amount, soil is able to assimilate water
      // überprüft, dass das zu infiltrierende Wasser nicht größer ist
      // als das Volumnen, welches es aufnehmen kann
      vm_Infiltration = min(vm_SurfaceWaterStorage, vm_PotentialInfiltration);

      /** @todo <b>Claas:</b> Mathematischer Sinn ist zu überprüfen */
      vm_Infiltration = min(vm_Infiltration, ((vm_SoilPoreVolume[0] - vm_SoilMoisture[0]) * 1000.0
          * soilColumn[0].vs_LayerThickness));

      // Limitation of airfilled pore space added to prevent water contents
      // above pore space in layers below (Claas Nendel)
      vm_Infiltration = max(0.0, vm_Infiltration);
    } else {
      vm_Infiltration = 0.0;
    }

    // Updating yesterday's surface water storage
    if (vm_Infiltration > 0.0) {

      // Reduce the water storage with the infiltration amount
      vm_SurfaceWaterStorage -= vm_Infiltration;
    }

    // Calculating overflow due to water level exceeding surface roughness [mm]
    if (vm_SurfaceWaterStorage > (10.0 * vm_SurfaceRoughness / (siteParameters.vs_Slope + 0.001))) {

      // Calculating surface run-off driven by slope and altered by surface roughness and soil coverage
      // minimal slope at which water will be run off the surface
      vm_RunOffFactor = 0.02 + (vm_SurfaceRoughness / 4.0) + (vc_PercentageSoilCoverage / 15.0);
      if (siteParameters.vs_Slope < 0.0 || siteParameters.vs_Slope > 1.0) {

        // no valid slope
        logger(MSG.WARN, "Slope value out ouf boundary");

      } else if (siteParameters.vs_Slope == 0.0) {

        // no slope so there will be no loss of water
        vm_SurfaceRunOff = 0.0;

      } else if (siteParameters.vs_Slope > vm_RunOffFactor) {

        // add all water from the surface to the run-off storage
        vm_SurfaceRunOff += vm_SurfaceWaterStorage;

      } else {

        // some water is running off because of a sloped surface
        /** @todo Claas: Ist die Formel korrekt? vm_RunOffFactor wird einmal reduziert? */
        vm_SurfaceRunOff += ((siteParameters.vs_Slope * vm_RunOffFactor) / (vm_RunOffFactor * vm_RunOffFactor)) * vm_SurfaceWaterStorage;
      }

      // Update surface water storage
      vm_SurfaceWaterStorage -= vm_SurfaceRunOff;
    }

    // Adding infiltrating water to top layer soil moisture
    vm_SoilMoisture[0] += (vm_Infiltration / 1000.0 / vm_LayerThickness[0]);

    // [m3 m-3] += ([mm] - [mm]) / [] / [m]; -. Conversion into volumetric water content [m3 m-3]
    vm_WaterFlux[0] = vm_Infiltration; // Fluss in Schicht 0

    // Calculating excess soil moisture (water content exceeding field capacity) for percolation
    if (vm_SoilMoisture[0] > vm_FieldCapacity[0]) {

      vm_GravitationalWater[0] = (vm_SoilMoisture[0] - vm_FieldCapacity[0]) * 1000.0
          * vm_LayerThickness[0];
      vm_LambdaReduced = vm_Lambda[0] * frostComponent.getLambdaRedux(0);
      vm_PercolationFactor = 1 + vm_LambdaReduced * vm_GravitationalWater[0];
      vm_PercolationRate[0] = (
        (vm_GravitationalWater[0] * vm_GravitationalWater[0] * vm_LambdaReduced) / vm_PercolationFactor
      );

      if (vm_PercolationRate[0] > pm_MaxPercolationRate)
          vm_PercolationRate[0] = pm_MaxPercolationRate;

      vm_GravitationalWater[0] = vm_GravitationalWater[0] - vm_PercolationRate[0];
      vm_GravitationalWater[0] = max(0.0, vm_GravitationalWater[0]);

      // Adding the excess water remaining after the percolation event to soil moisture
      vm_SoilMoisture[0] = vm_FieldCapacity[0] + (vm_GravitationalWater[0] / 1000.0 / vm_LayerThickness[0]);

      // For groundwater table in first or second top layer no percolation occurs
      if (vm_GroundwaterTable <= 1) {
        vm_PercolationRate[0] = 0.0;
      }

      // For groundwater table at soil surface no percolation occurs
      if (vm_GroundwaterTable == 0) {
        vm_PercolationRate[0] = 0.0;

        // For soil water volume exceeding total pore volume, surface runoff occurs
        if (vm_SoilMoisture[0] > vm_SoilPoreVolume[0]) {
          vm_SurfaceRunOff += (vm_SoilMoisture[0] - vm_SoilPoreVolume[0]) * 1000.0 * vm_LayerThickness[0];
          vm_SoilMoisture[0] = vm_SoilPoreVolume[0];
          return;
        }
      }
    } else if (vm_SoilMoisture[0] <= vm_FieldCapacity[0]) {

      // For soil moisture contents below field capacity no excess water and no fluxes occur
      vm_PercolationRate[0] = 0.0;
      vm_GravitationalWater[0] = 0.0;
    }


    // Check water balance

    if (abs((vm_SurfaceWaterStorageOld + vm_WaterToInfiltrate) - (vm_SurfaceRunOff + vm_Infiltration
        + vm_SurfaceWaterStorage)) > 0.01) {

      logger(MSG.WARN, "water balance wrong!");
    }

    // water flux of next layer equals percolation rate of layer above
    vm_WaterFlux[1] = vm_PercolationRate[0];
    vm_SumSurfaceRunOff+=vm_SurfaceRunOff;
  };

  var get_SoilMoisture = function (layer) {
    return soilColumn[layer].get_Vs_SoilMoisture_m3();
  };

  var get_CapillaryRise = function (layer) {
    return vm_CapillaryWater[layer];
  };

  var get_PercolationRate = function (layer) {
    return vm_PercolationRate[layer];
  };

  var fm_CapillaryRise = function () {

    var vc_RootingDepth;
    var vm_GroundwaterDistance;
    var vm_WaterAddedFromCapillaryRise;

    vc_RootingDepth = crop ? crop.get_RootingDepth() : 0;

    vm_GroundwaterDistance = vm_GroundwaterTable - vc_RootingDepth;// []

    if (vm_GroundwaterDistance < 1) vm_GroundwaterDistance = 1;

    if ((vm_GroundwaterDistance * vm_LayerThickness[0]) <= 2.70) { // [m]
    // Capillary rise rates in table defined only until 2.70 m

      for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      // Define capillary water and available water

        vm_CapillaryWater[i_Layer] = vm_FieldCapacity[i_Layer]
    - vm_PermanentWiltingPoint[i_Layer];

        vm_AvailableWater[i_Layer] = vm_SoilMoisture[i_Layer] - vm_PermanentWiltingPoint[i_Layer];

        if (vm_AvailableWater[i_Layer] < 0.0) {
          vm_AvailableWater[i_Layer] = 0.0;
        }

        vm_CapillaryWater70[i_Layer] = 0.7 * vm_CapillaryWater[i_Layer];
      }

      var vm_CapillaryRiseRate = 0.01; //[m d-1]
      var pm_CapillaryRiseRate = 0.01; //[m d-1]
      // Find first layer above groundwater with 70% available water
      var vm_StartLayer = min(vm_GroundwaterTable,(vs_NumberOfLayers - 1));
      for (var i_Layer = vm_StartLayer; i_Layer >= 0; i_Layer--) {

        var vs_SoilTexture = soilColumn[i_Layer].vs_SoilTexture;
        pm_CapillaryRiseRate = centralParameterProvider.capillaryRiseRates.getRate(vs_SoilTexture, vm_GroundwaterDistance);

        if(pm_CapillaryRiseRate < vm_CapillaryRiseRate){
          vm_CapillaryRiseRate = pm_CapillaryRiseRate;
        }

        if (vm_AvailableWater[i_Layer] < vm_CapillaryWater70[i_Layer]) {

          vm_WaterAddedFromCapillaryRise = vm_CapillaryRiseRate; //[m3 m-2 d-1]

          vm_SoilMoisture[i_Layer] += vm_WaterAddedFromCapillaryRise;

          for (var j_Layer = vm_StartLayer; j_Layer >= i_Layer; j_Layer--) {
            vm_WaterFlux[j_Layer] -= vm_WaterAddedFromCapillaryRise;
          }
          break;
        }
      }
    } // if((double (vm_GroundwaterDistance) * vm_LayerThickness[0]) <= 2.70)
  };

  var fm_PercolationWithGroundwater = function (vs_GroundwaterDepth) {

    var vm_PercolationFactor;
    var vm_LambdaReduced;
    vm_GroundwaterAdded = 0.0;

    for (var i_Layer = 0; i_Layer < vm_NumberOfLayers - 1; i_Layer++) {

      if (i_Layer < vm_GroundwaterTable - 1) {

        // well above groundwater table
        vm_SoilMoisture[i_Layer + 1] += vm_PercolationRate[i_Layer] / 1000.0 / vm_LayerThickness[i_Layer];
        vm_WaterFlux[i_Layer + 1] = vm_PercolationRate[i_Layer];

        if (vm_SoilMoisture[i_Layer + 1] > vm_FieldCapacity[i_Layer + 1]) {

          // Soil moisture exceeding field capacity
          vm_GravitationalWater[i_Layer + 1] = (
            (vm_SoilMoisture[i_Layer + 1] - vm_FieldCapacity[i_Layer + 1]) * 
            1000.0 * vm_LayerThickness[i_Layer + 1]
          );

          vm_LambdaReduced = vm_Lambda[i_Layer + 1] * frostComponent.getLambdaRedux(i_Layer + 1);
          vm_PercolationFactor = 1 + vm_LambdaReduced * vm_GravitationalWater[i_Layer + 1];
          vm_PercolationRate[i_Layer + 1] = ((vm_GravitationalWater[i_Layer + 1] * vm_GravitationalWater[i_Layer + 1]
              * vm_LambdaReduced) / vm_PercolationFactor);

          vm_GravitationalWater[i_Layer + 1] = vm_GravitationalWater[i_Layer + 1] - vm_PercolationRate[i_Layer + 1];

          if (vm_GravitationalWater[i_Layer + 1] < 0) {
            vm_GravitationalWater[i_Layer + 1] = 0.0;
          }

          vm_SoilMoisture[i_Layer + 1] = (
            vm_FieldCapacity[i_Layer + 1] + (vm_GravitationalWater[i_Layer + 1] / 
            1000.0 / 
            vm_LayerThickness[i_Layer + 1])
          );

          if (vm_SoilMoisture[i_Layer + 1] > vm_SoilPoreVolume[i_Layer + 1]) {

            // Soil moisture exceeding soil pore volume
            vm_GravitationalWater[i_Layer + 1] = (
              (vm_SoilMoisture[i_Layer + 1] - vm_SoilPoreVolume[i_Layer + 1]) * 
              1000.0 * 
              vm_LayerThickness[i_Layer + 1]
            );
            vm_SoilMoisture[i_Layer + 1] = vm_SoilPoreVolume[i_Layer + 1];
            vm_PercolationRate[i_Layer + 1] += vm_GravitationalWater[i_Layer + 1];
          }
        } else {
          // Soil moisture below field capacity
          vm_PercolationRate[i_Layer + 1] = 0.0;
          vm_GravitationalWater[i_Layer + 1] = 0.0;
        }
      } // if (i_Layer < vm_GroundwaterTable - 1) {

      // when the layer directly above ground water table is reached
      if (i_Layer == vm_GroundwaterTable - 1) {

        // groundwater table shall not undermatch the oscillating groundwater depth
        // which is generated within the outer framework
        if (vm_GroundwaterTable >= int(vs_GroundwaterDepth / vm_LayerThickness[i_Layer])) {
          vm_SoilMoisture[i_Layer + 1] += (
            (vm_PercolationRate[i_Layer]) / 1000.0 / vm_LayerThickness[i_Layer]
          );
          vm_PercolationRate[i_Layer + 1] = vm_GroundwaterDischarge;
          vm_WaterFlux[i_Layer + 1] = vm_PercolationRate[i_Layer];
        } else {
          vm_SoilMoisture[i_Layer + 1] += (
            (vm_PercolationRate[i_Layer] - vm_GroundwaterDischarge) / 
            1000.0 / 
            vm_LayerThickness[i_Layer]
          );
          vm_PercolationRate[i_Layer + 1] = vm_GroundwaterDischarge;
          vm_WaterFlux[i_Layer + 1] = vm_GroundwaterDischarge;
        }

        if (vm_SoilMoisture[i_Layer + 1] >= vm_SoilPoreVolume[i_Layer + 1]) {

          //vm_GroundwaterTable--; // Rising groundwater table if vm_SoilMoisture > soil pore volume

          // vm_GroundwaterAdded is the volume of water added to the groundwater body.
          // It does not correspond to groundwater replenishment in the technical sense !!!!!
          vm_GroundwaterAdded = (
            (vm_SoilMoisture[i_Layer + 1] - vm_SoilPoreVolume[i_Layer + 1]) * 1000.0 * vm_LayerThickness[i_Layer + 1]
          );

          vm_SoilMoisture[i_Layer + 1] = vm_SoilPoreVolume[i_Layer + 1];

          if (vm_GroundwaterAdded <= 0.0) {
            vm_GroundwaterAdded = 0.0;
          }
        }

      } // if (i_Layer == vm_GroundwaterTable - 1)

      // when the groundwater table is reached
      if (i_Layer > vm_GroundwaterTable - 1) {

        vm_SoilMoisture[i_Layer + 1] = vm_SoilPoreVolume[i_Layer + 1];

        if (vm_GroundwaterTable >= int(vs_GroundwaterDepth / vm_LayerThickness[i_Layer])) {
          vm_PercolationRate[i_Layer + 1] = vm_PercolationRate[i_Layer];
          vm_WaterFlux[i_Layer] = vm_PercolationRate[i_Layer + 1];
        } else {
          vm_PercolationRate[i_Layer + 1] = vm_GroundwaterDischarge;
          vm_WaterFlux[i_Layer] = vm_GroundwaterDischarge;
        }
      } // if (i_Layer > vm_GroundwaterTable - 1)

    } // for

    vm_FluxAtLowerBoundary = vm_WaterFlux[pm_LeachingDepthLayer];

  };

  var fm_GroundwaterReplenishment = function () {
    
    var vm_StartLayer;

    // do nothing if groundwater is not within profile
    if (vm_GroundwaterTable > vs_NumberOfLayers) {
      return;
    }

    // Auffuellschleife von GW-Oberflaeche in Richtung Oberflaeche
    vm_StartLayer = vm_GroundwaterTable;

    if (vm_StartLayer > vm_NumberOfLayers - 2) {
      vm_StartLayer = vm_NumberOfLayers - 2;
    }

    for (var i_Layer = vm_StartLayer; i_Layer >= 0; i_Layer--) {

      vm_SoilMoisture[i_Layer] += vm_GroundwaterAdded / 1000.0 / vm_LayerThickness[i_Layer + 1];

      if (i_Layer == vm_StartLayer){
        vm_PercolationRate[i_Layer] = vm_GroundwaterDischarge;
      } else {
        vm_PercolationRate[i_Layer] -= vm_GroundwaterAdded; // Fluss_u durch Grundwasser
        vm_WaterFlux[i_Layer + 1] = vm_PercolationRate[i_Layer]; // Fluss_u durch Grundwasser
      }

      if (vm_SoilMoisture[i_Layer] > vm_SoilPoreVolume[i_Layer]) {

        vm_GroundwaterAdded = (vm_SoilMoisture[i_Layer] - vm_SoilPoreVolume[i_Layer]) * 1000.0 * vm_LayerThickness[i_Layer + 1];
        vm_SoilMoisture[i_Layer] = vm_SoilPoreVolume[i_Layer];
        vm_GroundwaterTable--; // Groundwater table rises

        if (i_Layer == 0 && vm_GroundwaterTable == 0) {

          // if groundwater reaches surface
          vm_SurfaceWaterStorage += vm_GroundwaterAdded;
          vm_GroundwaterAdded = 0.0;
        }
      } else {
        vm_GroundwaterAdded = 0.0;
      }

    } // for
  };

  var fm_PercolationWithoutGroundwater = function () {
    
    var vm_PercolationFactor;
    var vm_LambdaReduced;

    for (var i_Layer = 0; i_Layer < vm_NumberOfLayers - 1; i_Layer++) {

      vm_SoilMoisture[i_Layer + 1] += vm_PercolationRate[i_Layer] / 1000.0 / vm_LayerThickness[i_Layer];

      if ((vm_SoilMoisture[i_Layer + 1] > vm_FieldCapacity[i_Layer + 1])) {

        // too much water for this layer so some water is released to layers below
        vm_GravitationalWater[i_Layer + 1] = (
          (vm_SoilMoisture[i_Layer + 1] - vm_FieldCapacity[i_Layer + 1]) * 1000.0 * vm_LayerThickness[0]
        );
        vm_LambdaReduced = vm_Lambda[i_Layer + 1] * frostComponent.getLambdaRedux(i_Layer + 1);
        vm_PercolationFactor = 1.0 + (vm_LambdaReduced * vm_GravitationalWater[i_Layer + 1]);
        vm_PercolationRate[i_Layer + 1] = (vm_GravitationalWater[i_Layer + 1] * vm_GravitationalWater[i_Layer + 1]
            * vm_LambdaReduced) / vm_PercolationFactor;

        if (vm_PercolationRate[i_Layer + 1] > pm_MaxPercolationRate) {
          vm_PercolationRate[i_Layer + 1] = pm_MaxPercolationRate;
        }

        vm_GravitationalWater[i_Layer + 1] = vm_GravitationalWater[i_Layer + 1] - vm_PercolationRate[i_Layer + 1];

        if (vm_GravitationalWater[i_Layer + 1] < 0.0) {
          vm_GravitationalWater[i_Layer + 1] = 0.0;
        }

        vm_SoilMoisture[i_Layer + 1] = (
          vm_FieldCapacity[i_Layer + 1] + (vm_GravitationalWater[i_Layer + 1] / 1000.0 / vm_LayerThickness[i_Layer + 1])
        );
      } else {

        // no water will be released in other layers
        vm_PercolationRate[i_Layer + 1] = 0.0;
        vm_GravitationalWater[i_Layer + 1] = 0.0;
      }

      vm_WaterFlux[i_Layer + 1] = vm_PercolationRate[i_Layer];
      vm_GroundwaterAdded = vm_PercolationRate[i_Layer + 1];

    } // for

    if ((pm_LeachingDepthLayer > 0) && (pm_LeachingDepthLayer < (vm_NumberOfLayers - 1))) {
      vm_FluxAtLowerBoundary = vm_WaterFlux[pm_LeachingDepthLayer];
    } else {
      vm_FluxAtLowerBoundary = vm_WaterFlux[vm_NumberOfLayers - 2];
    }
  };

  var fm_BackwaterReplenishment = function () {

    var vm_StartLayer = vm_NumberOfLayers - 1;
    var vm_BackwaterTable = vm_NumberOfLayers - 1;
    var vm_BackwaterAdded = 0.0;

    // find first layer from top where the water content exceeds pore volume
    for (var i_Layer = 0; i_Layer < vm_NumberOfLayers - 1; i_Layer++) {
      if (vm_SoilMoisture[i_Layer] > vm_SoilPoreVolume[i_Layer]) {
        vm_StartLayer = i_Layer;
        vm_BackwaterTable = i_Layer;
      }
    }

    // if there is no such thing nothing will happen
    if (vm_BackwaterTable == 0)
      return;

    // Backwater replenishment upwards
    for (var i_Layer = vm_StartLayer; i_Layer >= 0; i_Layer--) {

      //!TODO check loop and whether it really should be i_Layer + 1 or the loop should start one layer higher ????!!!!
      vm_SoilMoisture[i_Layer] += vm_BackwaterAdded / 1000.0 / vm_LayerThickness[i_Layer];// + 1];
      if (i_Layer > 0) {
        vm_WaterFlux[i_Layer - 1] -= vm_BackwaterAdded;
      }

      if (vm_SoilMoisture[i_Layer] > vm_SoilPoreVolume[i_Layer]) {

        //!TODO check also i_Layer + 1 here for same reason as above
        vm_BackwaterAdded = (vm_SoilMoisture[i_Layer] - vm_SoilPoreVolume[i_Layer]) * 1000.0 * vm_LayerThickness[i_Layer];// + 1];
        vm_SoilMoisture[i_Layer] = vm_SoilPoreVolume[i_Layer];
        vm_BackwaterTable--; // Backwater table rises

        if (i_Layer == 0 && vm_BackwaterTable == 0) {
          // if backwater reaches surface
          vm_SurfaceWaterStorage += vm_BackwaterAdded;
          vm_BackwaterAdded = 0.0;
        }
      } else {
        vm_BackwaterAdded = 0.0;
      }
    } // for
  };

  var fm_Evapotranspiration = function (
    vc_PercentageSoilCoverage,
    vc_KcFactor,
    vs_HeightNN,
    vw_MaxAirTemperature,
    vw_MinAirTemperature,
    vw_RelativeHumidity,
    vw_MeanAirTemperature,
    vw_WindSpeed,
    vw_WindSpeedHeight,
    vw_GlobalRadiation,
    vc_DevelopmentalStage,
    vs_JulianDay,
    vs_Latitude
  ) {

    var vm_EReducer_1 = 0.0;
    var vm_EReducer_2 = 0.0;
    var vm_EReducer_3 = 0.0;
    var pm_EvaporationZeta = 0.0;
    var pm_MaximumEvaporationImpactDepth = 0.0; // Das ist die Tiefe, bis zu der maximal die Evaporation vordringen kann
    var vm_EReducer = 0.0;
    var vm_PotentialEvapotranspiration = 0.0;
    var vc_EvaporatedFromIntercept = 0.0;
    var vm_EvaporatedFromSurface = 0.0;
    var vm_EvaporationFromSurface = false;

    var vm_SnowDepth = snowComponent.getVm_SnowDepth();

    // Berechnung der Bodenevaporation bis max. 4dm Tiefe
    var sm_params = centralParameterProvider.userSoilMoistureParameters;
    pm_EvaporationZeta = sm_params.pm_EvaporationZeta; // Parameterdatei

    // Das sind die Steuerungsparameter für die Steigung der Entzugsfunktion
    vm_XSACriticalSoilMoisture = sm_params.pm_XSACriticalSoilMoisture;

    /** @todo <b>Claas:</b> pm_MaximumEvaporationImpactDepth ist aber Abhängig von der Bodenart,
     * da muss was dran gemacht werden */
    pm_MaximumEvaporationImpactDepth = sm_params.pm_MaximumEvaporationImpactDepth; // Parameterdatei

    // If a crop grows, ETp is taken from crop module
    if (vc_DevelopmentalStage > 0) {
      // Reference evapotranspiration is only grabbed here for consistent
      // output in monica.cpp
      vm_ReferenceEvapotranspiration = monica.cropGrowth().get_ReferenceEvapotranspiration();

      // Remaining ET from crop module already includes Kc factor and evaporation
      // from interception storage
      vm_PotentialEvapotranspiration = monica.cropGrowth().get_RemainingEvapotranspiration();
      vc_EvaporatedFromIntercept = monica.cropGrowth().get_EvaporatedFromIntercept();

    } else { // if no crop grows ETp is calculated from ET0 * kc
      vm_ReferenceEvapotranspiration = ReferenceEvapotranspiration(vs_HeightNN, vw_MaxAirTemperature,
          vw_MinAirTemperature, vw_RelativeHumidity, vw_MeanAirTemperature, vw_WindSpeed, vw_WindSpeedHeight,
          vw_GlobalRadiation, vs_JulianDay, vs_Latitude);
      vm_PotentialEvapotranspiration = vm_ReferenceEvapotranspiration * vc_KcFactor; // - vm_InterceptionReference;
    }

    vm_ActualEvaporation = 0.0;
    vm_ActualTranspiration = 0.0;

    // from HERMES:
    if (vm_PotentialEvapotranspiration > 6.5) vm_PotentialEvapotranspiration = 6.5;

    if (vm_PotentialEvapotranspiration > 0.0) {
      // If surface is water-logged, subsequent evaporation from surface water sources
      if (vm_SurfaceWaterStorage > 0.0) {
        vm_EvaporationFromSurface = true;
        // Water surface evaporates with Kc = 1.1.
        vm_PotentialEvapotranspiration = vm_PotentialEvapotranspiration * (1.1 / vc_KcFactor);

        // If a snow layer is present no water evaporates from surface water sources
        if (vm_SnowDepth > 0.0) {
          vm_EvaporatedFromSurface = 0.0;
        } else {
          if (vm_SurfaceWaterStorage < vm_PotentialEvapotranspiration) {
            vm_PotentialEvapotranspiration -= vm_SurfaceWaterStorage;
            vm_EvaporatedFromSurface = vm_SurfaceWaterStorage;
            vm_SurfaceWaterStorage = 0.0;
          } else {
            vm_SurfaceWaterStorage -= vm_PotentialEvapotranspiration;
            vm_EvaporatedFromSurface = vm_PotentialEvapotranspiration;
            vm_PotentialEvapotranspiration = 0.0;
          }
        }
        vm_PotentialEvapotranspiration = vm_PotentialEvapotranspiration * (vc_KcFactor / 1.1);
      }


      if (vm_PotentialEvapotranspiration > 0) { // Evaporation from soil

        for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

          vm_EReducer_1 = get_EReducer_1(i_Layer, vc_PercentageSoilCoverage, vm_PotentialEvapotranspiration);


          if (i_Layer >= pm_MaximumEvaporationImpactDepth) {
            // layer is too deep for evaporation
            vm_EReducer_2 = 0.0;
          } else {
            // 2nd factor to reduce actual evapotranspiration by
            // MaximumEvaporationImpactDepth and EvaporationZeta
            vm_EReducer_2 = get_DeprivationFactor(i_Layer + 1, pm_MaximumEvaporationImpactDepth, pm_EvaporationZeta, vm_LayerThickness[i_Layer]);
          }

          if (i_Layer > 0) {
            if (vm_SoilMoisture[i_Layer] < vm_SoilMoisture[i_Layer - 1]) {
              // 3rd factor to consider if above layer contains more water than
              // the adjacent layer below, evaporation will be significantly reduced
              vm_EReducer_3 = 0.1;
            } else {
              vm_EReducer_3 = 1.0;
            }
          } else {
            vm_EReducer_3 = 1.0;
          }

          // EReducer. factor to reduce evaporation
          vm_EReducer = vm_EReducer_1 * vm_EReducer_2 * vm_EReducer_3;

          if (vc_DevelopmentalStage > 0) {
            // vegetation is present

            //Interpolation between [0,1]
            if (vc_PercentageSoilCoverage >= 0.0 && vc_PercentageSoilCoverage < 1.0) {
              vm_Evaporation[i_Layer] = ((1.0 - vc_PercentageSoilCoverage) * vm_EReducer) * vm_PotentialEvapotranspiration;
            } else {
              if (vc_PercentageSoilCoverage >= 1.0)
                vm_Evaporation[i_Layer] = 0.0;
            }

            if (vm_SnowDepth > 0.0)
              vm_Evaporation[i_Layer] = 0.0;

            // Transpiration is derived from ET0; Soil coverage and Kc factors
            // already considered in crop part!
            vm_Transpiration[i_Layer] = monica.cropGrowth().get_Transpiration(i_Layer);

            // Transpiration is capped in case potential ET after surface
            // and interception evaporation has occurred on same day
            if (vm_EvaporationFromSurface)
              vm_Transpiration[i_Layer] = vc_PercentageSoilCoverage * vm_EReducer * vm_PotentialEvapotranspiration;

          } else {
            // no vegetation present
            if (vm_SnowDepth > 0.0) {
              vm_Evaporation[i_Layer] = 0.0;
            } else {
              vm_Evaporation[i_Layer] = vm_PotentialEvapotranspiration * vm_EReducer;
            }
            vm_Transpiration[i_Layer] = 0.0;

          } // if(vc_DevelopmentalStage > 0)

          vm_Evapotranspiration[i_Layer] = vm_Evaporation[i_Layer] + vm_Transpiration[i_Layer];
          vm_SoilMoisture[i_Layer] -= (vm_Evapotranspiration[i_Layer] / 1000.0 / vm_LayerThickness[i_Layer]);

          //  Generelle Begrenzung des Evaporationsentzuges
          if (vm_SoilMoisture[i_Layer] < 0.01)
            vm_SoilMoisture[i_Layer] = 0.01;

          vm_ActualTranspiration += vm_Transpiration[i_Layer];
          vm_ActualEvaporation += vm_Evaporation[i_Layer];
        } // for
      } // vm_PotentialEvapotranspiration > 0
    } // vm_PotentialEvapotranspiration > 0.0

    vm_ActualEvapotranspiration = vm_ActualTranspiration + vm_ActualEvaporation + vc_EvaporatedFromIntercept + vm_EvaporatedFromSurface;

    if (crop)
      crop.accumulateEvapotranspiration(vm_ActualEvapotranspiration);

  };

  var ReferenceEvapotranspiration = function (
    vs_HeightNN,
    vw_MaxAirTemperature,
    vw_MinAirTemperature,
    vw_RelativeHumidity,
    vw_MeanAirTemperature,
    vw_WindSpeed,
    vw_WindSpeedHeight,
    vw_GlobalRadiation,
    vs_JulianDay,
    vs_Latitude
  ) {

    var vc_Declination;
    var vc_DeclinationSinus; // old SINLD
    var vc_DeclinationCosinus; // old COSLD
    var vc_AstronomicDayLenght;
    var vc_EffectiveDayLenght ;
    var vc_PhotoperiodicDaylength ;
    var vc_PhotActRadiationMean;
    var vc_ClearDayRadiation;
    var vc_OvercastDayRadiation ;

    var vm_AtmosphericPressure; //[kPA]
    var vm_PsycrometerConstant; //[kPA °C-1]
    var vm_SaturatedVapourPressureMax; //[kPA]
    var vm_SaturatedVapourPressureMin; //[kPA]
    var vm_SaturatedVapourPressure; //[kPA]
    var vm_VapourPressure; //[kPA]
    var vm_SaturationDeficit; //[kPA]
    var vm_SaturatedVapourPressureSlope; //[kPA °C-1]
    var vm_WindSpeed_2m; //[m s-1]
    var vm_AerodynamicResistance ; //[s m-1]
    var vm_SurfaceResistance; //[s m-1]
    var vc_ExtraterrestrialRadiation;
    var vm_ReferenceEvapotranspiration; //[mm]
    var pc_ReferenceAlbedo = centralParameterProvider.userCropParameters.pc_ReferenceAlbedo; // FAO Green gras reference albedo from Allen et al. (1998)
    var PI = 3.14159265358979323;

    vc_Declination = -23.4 * cos(2.0 * PI * ((vs_JulianDay + 10.0) / 365.0));
    vc_DeclinationSinus = sin(vc_Declination * PI / 180.0) * sin(vs_Latitude * PI / 180.0);
    vc_DeclinationCosinus = cos(vc_Declination * PI / 180.0) * cos(vs_Latitude * PI / 180.0);
    vc_AstronomicDayLenght = 12.0 * (PI + 2.0 * asin(vc_DeclinationSinus / vc_DeclinationCosinus)) / PI;
    vc_EffectiveDayLenght = 12.0 * (PI + 2.0 * asin((-sin(8.0 * PI / 180.0) + vc_DeclinationSinus)
        / vc_DeclinationCosinus)) / PI;
    vc_PhotoperiodicDaylength = 12.0 * (PI + 2.0 * asin((-sin(-6.0 * PI / 180.0) + vc_DeclinationSinus)
        / vc_DeclinationCosinus)) / PI;
    vc_PhotActRadiationMean = 3600.0 * (vc_DeclinationSinus * vc_AstronomicDayLenght + 24.0 / PI * vc_DeclinationCosinus
        * sqrt(1.0 - ((vc_DeclinationSinus / vc_DeclinationCosinus) * (vc_DeclinationSinus / vc_DeclinationCosinus))));
    vc_ClearDayRadiation = 0.5 * 1300.0 * vc_PhotActRadiationMean * exp(-0.14 / (vc_PhotActRadiationMean
        / (vc_AstronomicDayLenght * 3600.0)));
    vc_OvercastDayRadiation = 0.2 * vc_ClearDayRadiation;
    var SC = 24.0 * 60.0 / PI * 8.20 *(1.0 + 0.033 * cos(2.0 * PI * vs_JulianDay / 365.0));
    var SHA = acos(-tan(vs_Latitude * PI / 180.0) * tan(vc_Declination * PI / 180.0));
    vc_ExtraterrestrialRadiation = SC * (SHA * vc_DeclinationSinus + vc_DeclinationCosinus * sin(SHA)) / 100.0; // [J cm-2] -. [MJ m-2]

    // Calculation of atmospheric pressure
    vm_AtmosphericPressure = 101.3 * pow(((293.0 - (0.0065 * vs_HeightNN)) / 293.0), 5.26);

    // Calculation of psychrometer constant - Luchtfeuchtigkeit
    vm_PsycrometerConstant = 0.000665 * vm_AtmosphericPressure;

    // Calc. of saturated water vapour pressure at daily max temperature
    vm_SaturatedVapourPressureMax = 0.6108 * exp((17.27 * vw_MaxAirTemperature) / (237.3 + vw_MaxAirTemperature));

    // Calc. of saturated water vapour pressure at daily min temperature
    vm_SaturatedVapourPressureMin = 0.6108 * exp((17.27 * vw_MinAirTemperature) / (237.3 + vw_MinAirTemperature));

    // Calculation of the saturated water vapour pressure
    vm_SaturatedVapourPressure = (vm_SaturatedVapourPressureMax + vm_SaturatedVapourPressureMin) / 2.0;

    // Calculation of the water vapour pressure
    if (vw_RelativeHumidity <= 0.0){
      // Assuming Tdew = Tmin as suggested in FAO56 Allen et al. 1998
      vm_VapourPressure = vm_SaturatedVapourPressureMin;
    } else {
      vm_VapourPressure = vw_RelativeHumidity * vm_SaturatedVapourPressure;
    }

    // Calculation of the air saturation deficit
    vm_SaturationDeficit = vm_SaturatedVapourPressure - vm_VapourPressure;

    // Slope of saturation water vapour pressure-to-temperature relation
    vm_SaturatedVapourPressureSlope = (4098.0 * (0.6108 * exp((17.27 * vw_MeanAirTemperature) / (vw_MeanAirTemperature
        + 237.3)))) / ((vw_MeanAirTemperature + 237.3) * (vw_MeanAirTemperature + 237.3));

    // Calculation of wind speed in 2m height
    vm_WindSpeed_2m = vw_WindSpeed * (4.87 / (log(67.8 * vw_WindSpeedHeight - 5.42)));

    // Calculation of the aerodynamic resistance
    vm_AerodynamicResistance = 208.0 / vm_WindSpeed_2m;

    vc_StomataResistance = 100; // FAO default value [s m-1]

    vm_SurfaceResistance = vc_StomataResistance / 1.44;

    var vc_ClearSkySolarRadiation = (0.75 + 0.00002 * vs_HeightNN) * vc_ExtraterrestrialRadiation;
    var vc_RelativeShortwaveRadiation = vw_GlobalRadiation / vc_ClearSkySolarRadiation;

    if (vc_RelativeShortwaveRadiation > 1.0) vc_RelativeShortwaveRadiation = 1.0;

    var pc_BolzmannConstant = 0.0000000049;
    var vc_ShortwaveRadiation = (1.0 - pc_ReferenceAlbedo) * vw_GlobalRadiation;
    var vc_LongwaveRadiation = pc_BolzmannConstant
          * ((pow((vw_MinAirTemperature + 273.16), 4.0)
          + pow((vw_MaxAirTemperature + 273.16), 4.0)) / 2.0)
          * (1.35 * vc_RelativeShortwaveRadiation - 0.35)
          * (0.34 - 0.14 * sqrt(vm_VapourPressure));
    vw_NetRadiation = vc_ShortwaveRadiation - vc_LongwaveRadiation;

    // Calculation of the reference evapotranspiration
    // Penman-Monteith-Methode FAO
    vm_ReferenceEvapotranspiration = ((0.408 * vm_SaturatedVapourPressureSlope * vw_NetRadiation)
        + (vm_PsycrometerConstant * (900.0 / (vw_MeanAirTemperature + 273.0))
        * vm_WindSpeed_2m * vm_SaturationDeficit))
        / (vm_SaturatedVapourPressureSlope + vm_PsycrometerConstant
        * (1.0 + (vm_SurfaceResistance / 208.0) * vm_WindSpeed_2m));

    if (vm_ReferenceEvapotranspiration < 0.0){
      vm_ReferenceEvapotranspiration = 0.0;
    }

    return vm_ReferenceEvapotranspiration;
  };

  var get_EReducer_1 = function (
    i_Layer,
    vm_PercentageSoilCoverage,
    vm_ReferenceEvapotranspiration
  ) {
    
    var vm_EReductionFactor;
    var vm_EvaporationReductionMethod = 1;
    var vm_SoilMoisture_m3 = soilColumn[i_Layer].get_Vs_SoilMoisture_m3();
    var vm_PWP = soilColumn[i_Layer].get_PermanentWiltingPoint();
    var vm_FK = soilColumn[i_Layer].get_FieldCapacity();
    var vm_RelativeEvaporableWater;
    var vm_CriticalSoilMoisture;
    var vm_XSA;
    var vm_Reducer;

    if (vm_SoilMoisture_m3 < (0.33 * vm_PWP)) vm_SoilMoisture_m3 = 0.33 * vm_PWP;

    vm_RelativeEvaporableWater = (vm_SoilMoisture_m3 -(0.33 * vm_PWP)) / (vm_FK - (0.33 * vm_PWP));

    if (vm_RelativeEvaporableWater > 1.0) vm_RelativeEvaporableWater = 1.0;

    if (vm_EvaporationReductionMethod == 0){
      // THESEUS
      vm_CriticalSoilMoisture = 0.65 * vm_FK;
      if (vm_PercentageSoilCoverage > 0) {
        if (vm_ReferenceEvapotranspiration > 2.5) {
          vm_XSA = (0.65 * vm_FK - vm_PWP) * (vm_FK - vm_PWP);
          vm_Reducer = vm_XSA + (((1 - vm_XSA) / 17.5)
       * (vm_ReferenceEvapotranspiration - 2.5));
        } else {
          vm_Reducer = vm_XSACriticalSoilMoisture / 2.5 * vm_ReferenceEvapotranspiration;
        }
        vm_CriticalSoilMoisture = soilColumn[i_Layer].get_FieldCapacity() * vm_Reducer;
      }

      // Calculation of an evaporation-reducing factor in relation to soil water content
      if (vm_SoilMoisture_m3 > vm_CriticalSoilMoisture) {
        // Moisture is higher than critical value so there is a
        // normal evaporation and nothing must be reduced
        vm_EReductionFactor = 1.0;

      } else {
        // critical value is reached, actual evaporation is below potential

        if (vm_SoilMoisture_m3 > (0.33 * vm_PWP)) {
          // moisture is higher than 30% of permanent wilting point
          vm_EReductionFactor = vm_RelativeEvaporableWater;
        } else {
          // if moisture is below 30% of wilting point nothing can be evaporated
          vm_EReductionFactor = 0.0;
        }
      }

    } else if (vm_EvaporationReductionMethod == 1){
      // HERMES
      vm_EReductionFactor = 0.0;
      if (vm_RelativeEvaporableWater > 0.33) {
        vm_EReductionFactor = 1.0 - (0.1 * (1.0 - vm_RelativeEvaporableWater) / (1.0 - 0.33));
      } else if (vm_RelativeEvaporableWater > 0.22) {
        vm_EReductionFactor = 0.9 - (0.625 * (0.33 - vm_RelativeEvaporableWater) / (0.33-0.22));
      } else if (vm_RelativeEvaporableWater > 0.2) {
        vm_EReductionFactor = 0.275 - (0.225 * (0.22 - vm_RelativeEvaporableWater) / (0.22 - 0.2));
      } else {
        vm_EReductionFactor = 0.05 - (0.05 * (0.2 - vm_RelativeEvaporableWater) / 0.2);
      } // end if
    }
    return vm_EReductionFactor;
  };

  var get_DeprivationFactor = function (
    layerNo,
    deprivationDepth,
    zeta,
    vs_LayerThickness
  ) {
    // factor (f(depth)) to distribute the PET along the soil profil/rooting zone

    var deprivationFactor;

    // factor to introduce layer thickness in this algorithm,
    // to allow layer thickness scaling (Claas Nendel)
    var layerThicknessFactor = deprivationDepth / (vs_LayerThickness * 10.0);

    if ((abs(zeta)) < 0.0003) {

      deprivationFactor = (2.0 / layerThicknessFactor) - (1.0 / (layerThicknessFactor * layerThicknessFactor)) * (2
          * layerNo - 1);
      return deprivationFactor;

    } else {

      var c2 = 0.0;
      var c3 = 0.0;
      c2 = log((layerThicknessFactor + zeta * layerNo) / (layerThicknessFactor + zeta * (layerNo - 1)));
      c3 = zeta / (layerThicknessFactor * (zeta + 1.0));
      deprivationFactor = (c2 - c3) / (log(zeta + 1.0) - zeta / (zeta + 1.0));
      return deprivationFactor;
    }
  };

  var meanWaterContent = function (depth_m) {

    if (arguments.length === 1) {

      var lsum = 0.0; 
      var sum = 0.0;
      var count = 0;

      for (var i = 0; i < vs_NumberOfLayers; i++)
      {
        count++;
        var smm3 = soilColumn[i].get_Vs_SoilMoisture_m3();
        var fc = soilColumn[i].get_FieldCapacity();
        var pwp = soilColumn[i].get_PermanentWiltingPoint();
        sum += smm3 / (fc - pwp); //[%nFK]
        lsum += soilColumn[i].vs_LayerThickness;
        if (lsum >= depth_m)
          break;
      }

      return sum / count;
    } 

    var layer = arguments[0], 
        number_of_layers = arguments[1],
        sum = 0.0,
        count = 0;

    if (layer + number_of_layers > vs_NumberOfLayers) {
        return -1;
    }

    for (var i = layer; i < layer + number_of_layers; i++)
    {
      count++;
      var smm3 = soilColumn[i].get_Vs_SoilMoisture_m3();
      var fc = soilColumn[i].get_FieldCapacity();
      var pwp = soilColumn[i].get_PermanentWiltingPoint();
      sum += smm3 / (fc - pwp); //[%nFK]
    }

    return sum / count;

  };

  var get_SnowDepth = function () {
    return snowComponent.getVm_SnowDepth();
  };

  var getMaxSnowDepth = function () {
    return snowComponent.getMaxSnowDepth();
  };

  var accumulatedSnowDepth = function () {
    return snowComponent.accumulatedSnowDepth();
  };

  var getAccumulatedFrostDepth = function () {
    return frostComponent.getAccumulatedFrostDepth();
  };

  var put_Crop = function (c) {
    crop = c;
  };

  var remove_Crop = function () {
    crop = null;
  };

  var get_Infiltration = function () { 
    return vm_Infiltration; 
  };

  var get_SurfaceWaterStorage = function () { 
    return vm_SurfaceWaterStorage; 
  };

  var get_SurfaceRunOff = function () { 
    return vm_SurfaceRunOff; 
  };

  var get_Evapotranspiration = function () { 
    return vm_ActualEvapotranspiration; 
  };

  var get_ActualEvaporation = function () { 
    return vm_ActualEvaporation; 
  };

  var get_ET0  = function () { 
    return vm_ReferenceEvapotranspiration; 
  };

  var get_PercentageSoilCoverage = function () { 
    return vc_PercentageSoilCoverage; 
  };

  var get_StomataResistance = function () { 
    return vc_StomataResistance; 
  };

  var get_FrostDepth = function () { 
    return frostComponent.getFrostDepth(); 
  };

  var get_ThawDepth = function () { 
    return frostComponent.getThawDepth(); 
  };

  var get_GroundwaterRecharge = function () { 
    return vm_FluxAtLowerBoundary; 
  };

  var get_SumSurfaceRunOff = function () { 
    return vm_SumSurfaceRunOff; 
  };

  var get_KcFactor = function () { 
    return vc_KcFactor; 
  };

  var get_TranspirationDeficit = function () { 
    return vm_TranspirationDeficit; 
  };

  return {
      step: step
    , get_SnowDepth: get_SnowDepth
    , get_SoilMoisture: get_SoilMoisture
    , get_CapillaryRise: get_CapillaryRise
    , get_PercolationRate: get_PercolationRate
    , get_Infiltration: get_Infiltration
    , get_SurfaceWaterStorage: get_SurfaceWaterStorage
    , get_SurfaceRunOff: get_SurfaceRunOff
    , get_Evapotranspiration: get_Evapotranspiration
    , get_ActualEvaporation: get_ActualEvaporation
    , get_ET0: get_ET0
    , get_PercentageSoilCoverage: get_PercentageSoilCoverage
    , get_StomataResistance: get_StomataResistance
    , get_FrostDepth: get_FrostDepth
    , get_ThawDepth: get_ThawDepth
    , get_GroundwaterRecharge: get_GroundwaterRecharge
    , get_SumSurfaceRunOff: get_SumSurfaceRunOff
    , get_KcFactor: get_KcFactor
    , get_TranspirationDeficit: get_TranspirationDeficit
    , get_CapillaryRise: get_CapillaryRise
    , getMaxSnowDepth: getMaxSnowDepth
    , accumulatedSnowDepth: accumulatedSnowDepth
    , getAccumulatedFrostDepth: getAccumulatedFrostDepth
    , get_EReducer_1: get_EReducer_1
    , put_Crop: put_Crop
    , remove_Crop: remove_Crop
    , fm_Infiltration: fm_Infiltration
    , get_DeprivationFactor: get_DeprivationFactor
    , fm_CapillaryRise: fm_CapillaryRise
    , fm_PercolationWithGroundwater: fm_PercolationWithGroundwater
    , fm_GroundwaterReplenishment: fm_GroundwaterReplenishment
    , fm_PercolationWithoutGroundwater: fm_PercolationWithoutGroundwater
    , fm_BackwaterReplenishment: fm_BackwaterReplenishment
    , fm_Evapotranspiration: fm_Evapotranspiration
    , ReferenceEvapotranspiration: ReferenceEvapotranspiration
    , meanWaterContent: meanWaterContent
  } 

};



var SoilTransport = function (sc, sps, cpp) {

  var soilColumn = sc
    , centralParameterProvider = cpp
    , vs_NumberOfLayers = sc.vs_NumberOfLayers() // extern
    , vq_Convection = new Float64Array(vs_NumberOfLayers)
    , vq_CropNUptake = 0.0
    , vq_DiffusionCoeff = new Float64Array(vs_NumberOfLayers)
    , vq_Dispersion = new Float64Array(vs_NumberOfLayers)
    , vq_DispersionCoeff = new Float64Array(vs_NumberOfLayers)
    , vq_FieldCapacity = new Float64Array(vs_NumberOfLayers)
    , vq_LayerThickness = new Float64Array(vs_NumberOfLayers)
    , vq_LeachingAtBoundary = 0.0
    , vs_NDeposition = sps.vq_NDeposition
    , vc_NUptakeFromLayer = new Float64Array(vs_NumberOfLayers)
    , vq_PoreWaterVelocity = new Float64Array(vs_NumberOfLayers)
    , vq_SoilMoisture = new Float64Array(vs_NumberOfLayers)
    , vq_SoilNO3 = new Float64Array(vs_NumberOfLayers)
    , vq_SoilNO3_aq = new Float64Array(vs_NumberOfLayers)
    , vq_TimeStep = 1.0
    , vq_TotalDispersion = new Float64Array(vs_NumberOfLayers)
    , vq_PercolationRate = new Float64Array(vs_NumberOfLayers)
    , crop = null
    ;

  // JS! init arrays
  for (var i = 0; i < vs_NumberOfLayers; i++) {
    vq_DispersionCoeff[i] = 1.0;
    vq_LayerThickness[i] = 0.1;
    vq_SoilMoisture[i] = 0.2;
  }    

  var vs_LeachingDepth = centralParameterProvider.userEnvironmentParameters.p_LeachingDepth;
  var vq_TimeStep = centralParameterProvider.userEnvironmentParameters.p_timeStep;

  var step = function () {

    var vq_TimeStepFactor = 1.0; // [t t-1]

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      vq_FieldCapacity[i_Layer] = soilColumn[i_Layer].get_FieldCapacity();
      vq_SoilMoisture[i_Layer] = soilColumn[i_Layer].get_Vs_SoilMoisture_m3();
      vq_SoilNO3[i_Layer] = soilColumn[i_Layer].vs_SoilNO3;

      vq_LayerThickness[i_Layer] = soilColumn[0].vs_LayerThickness;
      vc_NUptakeFromLayer[i_Layer] = crop ? crop.get_NUptakeFromLayer(i_Layer) : 0;

      // disabled
      /* crop.js: remove NH4 from uptake and update NH4 in solution */
      /* [kg (N) m-3] */
      /*
      var NH4_uptake = min(soilColumn[i_Layer].vs_SoilNH4, vc_NUptakeFromLayer[i_Layer] / vq_LayerThickness[i_Layer]);
      vc_NUptakeFromLayer[i_Layer] -=  NH4_uptake * vq_LayerThickness[i_Layer];
      soilColumn[i_Layer].vs_SoilNH4 -= NH4_uptake;
      */

      if (i_Layer == (vs_NumberOfLayers - 1)){
        vq_PercolationRate[i_Layer] = soilColumn.vs_FluxAtLowerBoundary ; //[mm]
      } else {
        vq_PercolationRate[i_Layer] = soilColumn[i_Layer + 1].vs_SoilWaterFlux; //[mm]
      }
      // Variable time step in case of high water fluxes to ensure stable numerics
      if ((vq_PercolationRate[i_Layer] <= 5.0) && (vq_TimeStepFactor >= 1.0))
        vq_TimeStepFactor = 1.0;
      else if ((vq_PercolationRate[i_Layer] > 5.0) && (vq_PercolationRate[i_Layer] <= 10.0) && (vq_TimeStepFactor >= 1.0))
        vq_TimeStepFactor = 0.5;
      else if ((vq_PercolationRate[i_Layer] > 10.0) && (vq_PercolationRate[i_Layer] <= 15.0) && (vq_TimeStepFactor >= 0.5))
        vq_TimeStepFactor = 0.25;
      else if ((vq_PercolationRate[i_Layer] > 15.0) && (vq_TimeStepFactor >= 0.25))
        vq_TimeStepFactor = 0.125;
    }
  //  cout << "vq_SoilNO3[0]: " << vq_SoilNO3[0] << endl;

  //  if (isnan(vq_SoilNO3[0])) {
  //      cout << "vq_SoilNO3[0]: " << "NAN" << endl;
  //  }

    fq_NDeposition(vs_NDeposition);
    fq_NUptake();

    // Nitrate transport is called according to the set time step
    for (var i_TimeStep = 0; i_TimeStep < (1.0 / vq_TimeStepFactor); i_TimeStep++) {
      fq_NTransport(vs_LeachingDepth, vq_TimeStepFactor);
    }

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

      vq_SoilNO3[i_Layer] = vq_SoilNO3_aq[i_Layer] * vq_SoilMoisture[i_Layer];

      if (vq_SoilNO3[i_Layer] < 0.0) {
        vq_SoilNO3[i_Layer] = 0.0;
      }

      soilColumn[i_Layer].vs_SoilNO3 = vq_SoilNO3[i_Layer];
    } // for

    // disabled (NH4 uptake not implemented in MONICA)
    // NH4_absorption();

  };

  /**
   * @brief Calculation of N deposition
   * Transformation of annual N Deposition into a daily value,
   * that can be used in MONICAs calculations. Addition of this
   * transformed N deposition to ammonium pool of top soil layer.
   *
   * @param vs_NDeposition
   *
   * Kersebaum 1989
   */
  var fq_NDeposition = function (vs_NDeposition) {
    //Daily N deposition in [kg N ha-1 d-1]
    var vq_DailyNDeposition = vs_NDeposition / 365.0;

    // Addition of N deposition to top layer [kg N m-3]
    vq_SoilNO3[0] += vq_DailyNDeposition / (10000.0 * soilColumn[0].vs_LayerThickness);

  };

  /**
   * @brief Calculation of crop N uptake
   * @param
   *
   * Kersebaum 1989
   */
  var fq_NUptake = function () {
    var vq_CropNUptake = 0.0;
    var pc_MinimumAvailableN = centralParameterProvider.userCropParameters.pc_MinimumAvailableN; // kg m-2

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

      // Lower boundary for N exploitation per layer
      if (vc_NUptakeFromLayer[i_Layer] > ((vq_SoilNO3[i_Layer] * vq_LayerThickness[i_Layer]) - pc_MinimumAvailableN)) {

        // Crop N uptake from layer i [kg N m-2]
        vc_NUptakeFromLayer[i_Layer] = ((vq_SoilNO3[i_Layer] * vq_LayerThickness[i_Layer]) - pc_MinimumAvailableN);
      }

      if (vc_NUptakeFromLayer[i_Layer] < 0) {
        vc_NUptakeFromLayer[i_Layer] = 0;
      }

      vq_CropNUptake += vc_NUptakeFromLayer[i_Layer];

      // Subtracting crop N uptake
      vq_SoilNO3[i_Layer] -= vc_NUptakeFromLayer[i_Layer] / vq_LayerThickness[i_Layer];

      // Calculation of solute NO3 concentration on the basis of the soil moisture
      // content before movement of current time step (kg m soil-3 --> kg m solute-3)
      vq_SoilNO3_aq[i_Layer] = vq_SoilNO3[i_Layer] / vq_SoilMoisture[i_Layer];
      if (vq_SoilNO3_aq[i_Layer] < 0) {
  //        cout << "vq_SoilNO3_aq[i_Layer] < 0 " << endl;
      }

    } // for

    soilColumn.vq_CropNUptake = vq_CropNUptake; // [kg m-2]

  };


  /**
   * @brief Calculation of N transport
   * @param vs_LeachingDepth
   *
   * Kersebaum 1989
   */
  var fq_NTransport = function (vs_LeachingDepth, vq_TimeStepFactor) {

    var user_trans = centralParameterProvider.userSoilTransportParameters;
    var vq_DiffusionCoeffStandard = user_trans.pq_DiffusionCoefficientStandard;// [m2 d-1]; old D0
    var AD = user_trans.pq_AD; // Factor a in Kersebaum 1989 p.24 for Loess soils
    var vq_DispersionLength = user_trans.pq_DispersionLength; // [m]
    var vq_SoilProfile = 0.0;
    var vq_LeachingDepthLayerIndex = 0;
    vq_LeachingAtBoundary = 0.0;

    var vq_SoilMoistureGradient = new Array(vs_NumberOfLayers);

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      vq_SoilProfile += vq_LayerThickness[i_Layer];

      if ((vq_SoilProfile - 0.001) < vs_LeachingDepth) {
        vq_LeachingDepthLayerIndex = i_Layer;
      }
    }

    // Caluclation of convection for different cases of flux direction
    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

      var wf0 = soilColumn[0].vs_SoilWaterFlux;
      var lt = soilColumn[i_Layer].vs_LayerThickness;
      var NO3 = vq_SoilNO3_aq[i_Layer];

      if (i_Layer == 0) {
        var pr = vq_PercolationRate[i_Layer] / 1000.0 * vq_TimeStepFactor; // [mm t-1 --> m t-1]
        var NO3_u = vq_SoilNO3_aq[i_Layer + 1];

        if (pr >= 0.0 && wf0 >= 0.0) {

          // old KONV = Konvektion Diss S. 23
          vq_Convection[i_Layer] = (NO3 * pr) / lt; //[kg m-3] * [m t-1] / [m]

        } else if (pr >= 0 && wf0 < 0) {

          vq_Convection[i_Layer] = (NO3 * pr) / lt;

        } else if (pr < 0 && wf0 < 0) {
          vq_Convection[i_Layer] = (NO3_u * pr) / lt;

        } else if (pr < 0 && wf0 >= 0) {

          vq_Convection[i_Layer] = (NO3_u * pr) / lt;
        }

      } else if (i_Layer < vs_NumberOfLayers - 1) {

        // layer > 0 && < bottom
        var pr_o = vq_PercolationRate[i_Layer - 1] / 1000.0 * vq_TimeStepFactor; //[mm t-1 --> m t-1] * [t t-1]
        var pr = vq_PercolationRate[i_Layer] / 1000.0 * vq_TimeStepFactor; // [mm t-1 --> m t-1] * [t t-1]
        var NO3_u = vq_SoilNO3_aq[i_Layer + 1];

        if (pr >= 0.0 && pr_o >= 0.0) {
          var NO3_o = vq_SoilNO3_aq[i_Layer - 1];

          // old KONV = Konvektion Diss S. 23
          vq_Convection[i_Layer] = ((NO3 * pr) - (NO3_o * pr_o)) / lt;

        } else if (pr >= 0 && pr_o < 0) {

          vq_Convection[i_Layer] = ((NO3 * pr) - (NO3 * pr_o)) / lt;

        } else if (pr < 0 && pr_o < 0) {

          vq_Convection[i_Layer] = ((NO3_u * pr) - (NO3 * pr_o)) / lt;

        } else if (pr < 0 && pr_o >= 0) {
          var NO3_o = vq_SoilNO3_aq[i_Layer - 1];
          vq_Convection[i_Layer] = ((NO3_u * pr) - (NO3_o * pr_o)) / lt;
        }

      } else {

        // bottom layer
        var pr_o = vq_PercolationRate[i_Layer - 1] / 1000.0 * vq_TimeStepFactor; // [m t-1] * [t t-1]
        var pr = soilColumn.vs_FluxAtLowerBoundary / 1000.0 * vq_TimeStepFactor; // [m t-1] * [t t-1]

        if (pr >= 0.0 && pr_o >= 0.0) {
          var NO3_o = vq_SoilNO3_aq[i_Layer - 1];

          // KONV = Konvektion Diss S. 23
          vq_Convection[i_Layer] = ((NO3 * pr) - (NO3_o * pr_o)) / lt;

        } else if (pr >= 0 && pr_o < 0) {

          vq_Convection[i_Layer] = ((NO3 * pr) - (NO3 * pr_o)) / lt;

        } else if (pr < 0 && pr_o < 0) {

          vq_Convection[i_Layer] = (-(NO3 * pr_o)) / lt;

        } else if (pr < 0 && pr_o >= 0) {
          var NO3_o = vq_SoilNO3_aq[i_Layer - 1];
          vq_Convection[i_Layer] = (-(NO3_o * pr_o)) / lt;
        }

      }// else
    } // for


    // Calculation of dispersion depending of pore water velocity
    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

      var pr = vq_PercolationRate[i_Layer] / 1000.0 * vq_TimeStepFactor; // [mm t-1 --> m t-1] * [t t-1]
      var pr0 = soilColumn[0].vs_SoilWaterFlux / 1000.0 * vq_TimeStepFactor; // [mm t-1 --> m t-1] * [t t-1]
      var lt = soilColumn[i_Layer].vs_LayerThickness;
      var NO3 = vq_SoilNO3_aq[i_Layer];


      // Original: W(I) --> um Steingehalt korrigierte Feldkapazität
      /** @todo Claas: generelle Korrektur der Feldkapazität durch den Steingehalt */
      if (i_Layer == vs_NumberOfLayers - 1) {
        vq_PoreWaterVelocity[i_Layer] = abs((pr) / vq_FieldCapacity[i_Layer]); // [m t-1]
        vq_SoilMoistureGradient[i_Layer] = (vq_SoilMoisture[i_Layer]); //[m3 m-3]
      } else {
        vq_PoreWaterVelocity[i_Layer] = abs((pr) / ((vq_FieldCapacity[i_Layer]
                + vq_FieldCapacity[i_Layer + 1]) * 0.5)); // [m t-1]
        vq_SoilMoistureGradient[i_Layer] = ((vq_SoilMoisture[i_Layer])
           + (vq_SoilMoisture[i_Layer + 1])) * 0.5; //[m3 m-3]
      }

      vq_DiffusionCoeff[i_Layer] = vq_DiffusionCoeffStandard
           * (AD * exp(vq_SoilMoistureGradient[i_Layer] * 2.0 * 5.0)
           / vq_SoilMoistureGradient[i_Layer]) * vq_TimeStepFactor; //[m2 t-1] * [t t-1]

      // Dispersion coefficient, old DB
      if (i_Layer == 0) {

        vq_DispersionCoeff[i_Layer] = vq_SoilMoistureGradient[i_Layer] * (vq_DiffusionCoeff[i_Layer] // [m2 t-1]
    + vq_DispersionLength * vq_PoreWaterVelocity[i_Layer]) // [m] * [m t-1]
    - (0.5 * lt * abs(pr)) // [m] * [m t-1]
    + ((0.5 * vq_TimeStep * vq_TimeStepFactor * abs((pr + pr0) / 2.0))  // [t] * [t t-1] * [m t-1]
    * vq_PoreWaterVelocity[i_Layer]); // * [m t-1]
    //-->[m2 t-1]
      } else {
        var pr_o = vq_PercolationRate[i_Layer - 1] / 1000.0 * vq_TimeStepFactor; // [m t-1]

        vq_DispersionCoeff[i_Layer] = vq_SoilMoistureGradient[i_Layer] * (vq_DiffusionCoeff[i_Layer]
    + vq_DispersionLength * vq_PoreWaterVelocity[i_Layer]) - (0.5 * lt * abs(pr))
    + ((0.5 * vq_TimeStep * vq_TimeStepFactor * abs((pr + pr_o) / 2.0)) * vq_PoreWaterVelocity[i_Layer]);
      }

      //old DISP = Gesamt-Dispersion (D in Diss S. 23)
      if (i_Layer == 0) {
        var NO3_u = vq_SoilNO3_aq[i_Layer + 1];
        // vq_Dispersion = Dispersion upwards or downwards, depending on the position in the profile [kg m-3]
        vq_Dispersion[i_Layer] = -vq_DispersionCoeff[i_Layer] * (NO3 - NO3_u) / (lt * lt); // [m2] * [kg m-3] / [m2]

      } else if (i_Layer < vs_NumberOfLayers - 1) {
        var NO3_o = vq_SoilNO3_aq[i_Layer - 1];
        var NO3_u = vq_SoilNO3_aq[i_Layer + 1];
        vq_Dispersion[i_Layer] = (vq_DispersionCoeff[i_Layer - 1] * (NO3_o - NO3) / (lt * lt))
    - (vq_DispersionCoeff[i_Layer] * (NO3 - NO3_u) / (lt * lt));
      } else {
        var NO3_o = vq_SoilNO3_aq[i_Layer - 1];
        vq_Dispersion[i_Layer] = vq_DispersionCoeff[i_Layer - 1] * (NO3_o - NO3) / (lt * lt);
      }
    } // for

    // Update of NO3 concentration
    // including transfomation back into [kg NO3-N m soil-3]
    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {


      vq_SoilNO3_aq[i_Layer] += (vq_Dispersion[i_Layer] - vq_Convection[i_Layer]) / vq_SoilMoisture[i_Layer];
  //    double no3 = vq_SoilNO3_aq[i_Layer];
  //    double disp = vq_Dispersion[i_Layer];
  //    double conv = vq_Convection[i_Layer];
  //    double sm = vq_SoilMoisture[i_Layer];
  //    cout << i_Layer << "\t" << no3 << "\t" << disp << "\t" << conv << "\t" <<  sm << endl;
    }



    if (vq_PercolationRate[vq_LeachingDepthLayerIndex] > 0.0) {

      //vq_LeachingDepthLayerIndex = gewählte Auswaschungstiefe
      var lt = soilColumn[vq_LeachingDepthLayerIndex].vs_LayerThickness;
      var NO3 = vq_SoilNO3_aq[vq_LeachingDepthLayerIndex];

      if (vq_LeachingDepthLayerIndex < vs_NumberOfLayers - 1) {
        var pr_u = vq_PercolationRate[vq_LeachingDepthLayerIndex + 1] / 1000.0 * vq_TimeStepFactor;// [m t-1]
        var NO3_u = vq_SoilNO3_aq[vq_LeachingDepthLayerIndex + 1]; // [kg m-3]
        //vq_LeachingAtBoundary: Summe für Auswaschung (Diff + Konv), old OUTSUM
        vq_LeachingAtBoundary += ((pr_u * NO3) / lt * 10000.0 * lt) + ((vq_DispersionCoeff[vq_LeachingDepthLayerIndex]
    * (NO3 - NO3_u)) / (lt * lt) * 10000.0 * lt); //[kg ha-1]
      } else {
        var pr_u = soilColumn.vs_FluxAtLowerBoundary / 1000.0 * vq_TimeStepFactor; // [m t-1]
        vq_LeachingAtBoundary += pr_u * NO3 / lt * 10000.0 * lt; //[kg ha-1]
      }

    } else {

      var pr_u = vq_PercolationRate[vq_LeachingDepthLayerIndex] / 1000.0 * vq_TimeStepFactor;
      var lt = soilColumn[vq_LeachingDepthLayerIndex].vs_LayerThickness;
      var NO3 = vq_SoilNO3_aq[vq_LeachingDepthLayerIndex];

      if (vq_LeachingDepthLayerIndex < vs_NumberOfLayers - 1) {
        var NO3_u = vq_SoilNO3_aq[vq_LeachingDepthLayerIndex + 1];
        vq_LeachingAtBoundary += ((pr_u * NO3_u) / (lt * 10000.0 * lt)) + vq_DispersionCoeff[vq_LeachingDepthLayerIndex]
    * (NO3 - NO3_u) / ((lt * lt) * 10000.0 * lt); //[kg ha-1]
      }
    }

  //  cout << "vq_LeachingAtBoundary: " << vq_LeachingAtBoundary << endl;
  };

  /* Johnson eqs. 5.39 ff. 
     Experimeantal implementation (disabled by default)
  */
  function NH4_absorption() {

    /* TODO: make C_a_mx depend on clay content */
    var C_a_mx_ref = C_a_mx = 0.0005 /* [kg (N-NH4) kg-1 (soil)] */
      , alpha = 1000    /* [-] */
      ;

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
    
      var layer = soilColumn[i_Layer]
        // , C_a_mx = C_a_mx_ref * (layer.vs_SoilClayContent > 0.3 ? 1 : layer.vs_SoilClayContent / 0.3)
        , rho_b = layer.vs_SoilBulkDensity() /* [kg (soil) m-3] */
        , rho_w = 1000 /* [kg (water) m-3] */
        , m = layer.vs_SoilNH4 + layer.vs_SoilNH4_a /* total NH4 [kg (N-NH4) m-3] */
        , theta = layer.get_Vs_SoilMoisture_m3()
          /* a-b-c quadratic function */
        , a = alpha * theta * rho_w
        , b = C_a_mx * (alpha * rho_b + theta * rho_w) - alpha * m
        , c = -m * C_a_mx 
        ;

      /* [kg (N-NH4) kg (H20)] */
      var C_s = (-b + sqrt(pow(b, 2) - 4 * a * c)) / (2 * a);
      /* [kg (N-NH4) m-3] */
      layer.vs_SoilNH4 = C_s * theta * rho_w;
      layer.vs_SoilNH4_a = m - layer.vs_SoilNH4;

    }

  };


  /**
   * @brief Returns Nitrate content for each layer [i]
   * @return Soil NO3 content
   */
  var get_SoilNO3 = function (i_Layer) {
    return vq_SoilNO3[i_Layer];
  };

  /**
   * @brief Returns N leaching at leaching depth [kg ha-1]
   * @return Soil NO3 content
   */
  var get_NLeaching = function () {
    return vq_LeachingAtBoundary;
  };

  var put_Crop = function (c) {
    crop = c;
  };

  var remove_Crop = function () {
    crop = null;
  };

  return {
      step: step
    , fq_NDeposition: fq_NDeposition  // calculates daily N deposition
    , fq_NUptake: fq_NUptake // puts crop N uptake into effect
    , fq_NTransport: fq_NTransport  // calcuates N transport in soil
    , put_Crop: put_Crop
    , remove_Crop: remove_Crop
    , get_SoilNO3: get_SoilNO3
    , get_NLeaching: get_NLeaching
  };

};




var SoilTemperature = function (sc, mm, cpp) {

  var _soilColumn = sc,
      monica = mm,
      centralParameterProvider = cpp,
      _soilColumn_vt_GroundLayer = new SoilLayer(),
      _soilColumn_vt_BottomLayer = new SoilLayer(),
      soilColumn = {
        sc: sc,
        gl: _soilColumn_vt_GroundLayer,
        bl: _soilColumn_vt_BottomLayer,
        vs_nols: sc.vs_NumberOfLayers(),
        at: function (i) { 
          if (i < this.vs_nols){
            return this[i];
          } else {
            if (i < this.vs_nols + 1)
                return this.gl;
            return this.bl;
          }
        }
      };

  for (var i = 0; i < sc.vs_NumberOfLayers(); i++)
    soilColumn[i] = sc[i];

  soilColumn[sc.vs_NumberOfLayers()] = soilColumn.gl;
  soilColumn[sc.vs_NumberOfLayers() + 1] = soilColumn.bl;


  var vt_NumberOfLayers = sc.vs_NumberOfLayers() + 2,
      vs_NumberOfLayers = sc.vs_NumberOfLayers(),  //extern
      vs_SoilMoisture_const = new Array(vt_NumberOfLayers),   //intern
      vt_SoilTemperature = new Array(vt_NumberOfLayers),      //result = vs_soiltemperature
      vt_V = new Array(vt_NumberOfLayers),                    //intern
      vt_VolumeMatrix = new Array(vt_NumberOfLayers),         //intern
      vt_VolumeMatrixOld = new Array(vt_NumberOfLayers),      //intern
      vt_B = new Array(vt_NumberOfLayers),                    //intern
      vt_MatrixPrimaryDiagonal = new Array(vt_NumberOfLayers),//intern
      vt_MatrixSecundaryDiagonal = new Array(vt_NumberOfLayers + 1),   //intern
      vt_HeatConductivity = new Array(vt_NumberOfLayers),              //intern
      vt_HeatConductivityMean = new Array(vt_NumberOfLayers),          //intern
      vt_HeatCapacity = new Array(vt_NumberOfLayers),                    //intern
      dampingFactor = 0.8,
      vt_HeatFlow = 0.0;


    for (var i = 0; i < vt_NumberOfLayers; i++) {
      vs_SoilMoisture_const[i] = 0.0;   
      vt_SoilTemperature[i] = 0.0;    
      vt_V[i] = 0.0;                    
      vt_VolumeMatrix[i] = 0.0;         
      vt_VolumeMatrixOld[i] = 0.0;      
      vt_B[i] = 0.0;                    
      vt_MatrixPrimaryDiagonal[i] = 0.0;
      vt_MatrixSecundaryDiagonal[i] = 0.0;   
      vt_HeatConductivity[i] = 0.0;              
      vt_HeatConductivityMean[i] = 0.0;          
      vt_HeatCapacity[i] = 0.0;                        
    }

    vt_MatrixPrimaryDiagonal[i + 1] = 0.0;

  logger(MSG.INFO, "Constructor: SoilTemperature");

  var user_temp = cpp.userSoilTemperatureParameters;

  var pt_BaseTemperature           = user_temp.pt_BaseTemperature;  // temp für unterste Schicht (durch. Jahreslufttemp-)
  var pt_InitialSurfaceTemperature = user_temp.pt_InitialSurfaceTemperature; // Replace by Mean air temperature
  var pt_Ntau                      = user_temp.pt_NTau;
  var pt_TimeStep                  = centralParameterProvider.userEnvironmentParameters.p_timeStep;  // schon in soil_moisture in DB extrahiert
  var ps_QuartzRawDensity          = user_temp.pt_QuartzRawDensity;
  var pt_SpecificHeatCapacityWater = user_temp.pt_SpecificHeatCapacityWater;   // [J kg-1 K-1]
  var pt_SpecificHeatCapacityQuartz = user_temp.pt_SpecificHeatCapacityQuartz; // [J kg-1 K-1]
  var pt_SpecificHeatCapacityAir = user_temp.pt_SpecificHeatCapacityAir;       // [J kg-1 K-1]
  var pt_SpecificHeatCapacityHumus = user_temp.pt_SpecificHeatCapacityHumus;   // [J kg-1 K-1]
  var pt_DensityWater = user_temp.pt_DensityWater;   // [kg m-3]
  var pt_DensityAir = user_temp.pt_DensityAir;       // [kg m-3]
  var pt_DensityHumus = user_temp.pt_DensityHumus;   // [kg m-3]


  //  cout << "Monica: pt_BaseTemperature: " << pt_BaseTemperature << endl;
  //  cout << "Monica: pt_InitialSurfaceTemperature: " << pt_InitialSurfaceTemperature << endl;
  //  cout << "Monica: NTau: " << pt_Ntau << endl;

    // according to sensitivity tests, soil moisture has minor
    // influence to the temperature and thus can be set as constant
    // by xenia
  var ps_SoilMoisture_const = user_temp.pt_SoilMoisture;
  //  cout << "Monica: ps_SoilMoisture_const: " << ps_SoilMoisture_const << endl;

  // Initialising the soil properties until a database feed is realised
  for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

    // Initialising the soil temperature
    vt_SoilTemperature[i_Layer] =  (  (1.0 - ((i_Layer) / vs_NumberOfLayers))
              * pt_InitialSurfaceTemperature)
           +( ((i_Layer) / vs_NumberOfLayers) * pt_BaseTemperature);

    // Initialising the soil moisture content
    // Soil moisture content is held constant for numeric stability.
    // If dynamic soil moisture should be used, the energy balance
    // must be extended by latent heat flow.
    vs_SoilMoisture_const[i_Layer] = ps_SoilMoisture_const;

  }

  // Determination of the geometry parameters for soil temperature calculation
  // with Cholesky-Verfahren

  vt_V[0] = soilColumn[0].vs_LayerThickness;
  vt_B[0] = 2.0 / soilColumn[0].vs_LayerThickness;

  var vt_GroundLayer = vt_NumberOfLayers - 2;
  var vt_BottomLayer = vt_NumberOfLayers - 1;

  soilColumn[vt_GroundLayer].vs_LayerThickness = 2.0 * soilColumn[vt_GroundLayer - 1].vs_LayerThickness;
  soilColumn[vt_BottomLayer].vs_LayerThickness = 1.0;
  vt_SoilTemperature[vt_GroundLayer] = (vt_SoilTemperature[vt_GroundLayer - 1] + pt_BaseTemperature) * 0.5;
  vt_SoilTemperature[vt_BottomLayer] = pt_BaseTemperature;

  var vt_h0 = soilColumn[0].vs_LayerThickness;

  for (var i_Layer = 1; i_Layer < vt_NumberOfLayers; i_Layer++) {

    var vt_h1 = soilColumn[i_Layer].vs_LayerThickness; // [m]
    vt_B[i_Layer] = 2.0 / (vt_h1 + vt_h0); // [m]
    vt_V[i_Layer] = vt_h1 * pt_Ntau; // [m3]
    vt_h0 = vt_h1;
  }

  // End determination of the geometry parameters for soil temperature calculation


  // initialising heat state variables
  for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
    // logger(MSG.INFO, "layer: " + i_Layer);

    ///////////////////////////////////////////////////////////////////////////////////////
    // Calculate heat conductivity following Neusypina 1979
    // Neusypina, T.A. (1979): Rascet teplovo rezima pocvi v modeli formirovanija urozaja.
    // Teoreticeskij osnovy i kolicestvennye metody programmirovanija urozaev. Leningrad,
    // 53 -62.
    // Note: in this original publication lambda is calculated in cal cm-1 s-1 K-1!
    ///////////////////////////////////////////////////////////////////////////////////////
    var sbdi = soilColumn.at(i_Layer).vs_SoilBulkDensity();
    var smi = vs_SoilMoisture_const[i_Layer];

    // logger(MSG.INFO, "sbdi: " + sbdi);  
    // logger(MSG.INFO, "smi: " + smi);  

    vt_HeatConductivity[i_Layer] = ((3.0 * (sbdi / 1000.0) - 1.7) * 0.001) /
           (1.0 + (11.5 - 5.0 * (sbdi / 1000.0)) *
            exp((-50.0) * pow((smi / (sbdi / 1000.0)), 1.5))) *
           86400.0 * (pt_TimeStep) * //  gives result in [days]
           100.0  //  gives result in [m]
           * 4.184; // gives result in [J]
           // --> [J m-1 d-1 K-1]

    // logger(MSG.INFO, "vt_HeatConductivity");       
    // logger(MSG.INFO, vt_HeatConductivity);      

    ///////////////////////////////////////////////////////////////////////////////////////
    // Calculate specific heat capacity following DAISY
    // Abrahamsen, P, and S. Hansen (2000): DAISY - An open soil-crop-atmosphere model
    // system. Environmental Modelling and Software 15, 313-330
    ///////////////////////////////////////////////////////////////////////////////////////

    var cw = pt_SpecificHeatCapacityWater;
    var cq = pt_SpecificHeatCapacityQuartz;
    var ca = pt_SpecificHeatCapacityAir;
    var ch = pt_SpecificHeatCapacityHumus;
    var dw = pt_DensityWater;
    var dq = ps_QuartzRawDensity;
    var da = pt_DensityAir;
    var dh = pt_DensityHumus;
    var spv = soilColumn[i_Layer].get_Saturation();
    var som = soilColumn.at(i_Layer).vs_SoilOrganicMatter() / da * sbdi; // Converting [kg kg-1] to [m3 m-3]


    vt_HeatCapacity[i_Layer] = (smi * dw * cw)
       +((spv-smi) * da * ca)
       + (som * dh * ch)
       + ( (1.0 - spv - som) * dq * cq);
       // --> [J m-3 K-1]
  } // for


  vt_HeatCapacity[vt_GroundLayer] = vt_HeatCapacity[vt_GroundLayer - 1];
  vt_HeatCapacity[vt_BottomLayer] = vt_HeatCapacity[vt_GroundLayer];
  vt_HeatConductivity[vt_GroundLayer] = vt_HeatConductivity[vt_GroundLayer - 1];
  vt_HeatConductivity[vt_BottomLayer] = vt_HeatConductivity[vt_GroundLayer];

  // Initialisation soil surface temperature
  vt_SoilSurfaceTemperature = pt_InitialSurfaceTemperature;


  ///////////////////////////////////////////////////////////////////////////////////////
  // Initialising Numerical Solution
  // Suckow,F. (1985): A model serving the calculation of soil
  // temperatures. Zeitschrift für Meteorologie 35 (1), 66 -70.
  ///////////////////////////////////////////////////////////////////////////////////////

  // Calculation of the mean heat conductivity per layer
  vt_HeatConductivityMean[0] = vt_HeatConductivity[0];
  // logger(MSG.INFO, vt_HeatConductivityMean);

  for (var i_Layer = 1; i_Layer < vt_NumberOfLayers; i_Layer++) {

    var lti_1 = soilColumn.at(i_Layer - 1).vs_LayerThickness;
    var lti = soilColumn.at(i_Layer).vs_LayerThickness;
    var hci_1 = vt_HeatConductivity[i_Layer - 1];
    var hci = vt_HeatConductivity[i_Layer];

    // @todo <b>Claas: </b>Formel nochmal durchgehen
    vt_HeatConductivityMean[i_Layer] = ((lti_1 * hci_1) + (lti * hci)) / (lti + lti_1);
    // logger(MSG.INFO, vt_HeatConductivityMean);

  } // for

  // Determination of the volume matrix
  for (var i_Layer = 0; i_Layer < vt_NumberOfLayers; i_Layer++) {

    vt_VolumeMatrix[i_Layer] = vt_V[i_Layer] * vt_HeatCapacity[i_Layer]; // [J K-1]

    // If initial entry, rearrengement of volume matrix
    vt_VolumeMatrixOld[i_Layer] = vt_VolumeMatrix[i_Layer];

    // Determination of the matrix secundary diagonal
    vt_MatrixSecundaryDiagonal[i_Layer] = -vt_B[i_Layer] * vt_HeatConductivityMean[i_Layer]; //[J K-1]

  }




  vt_MatrixSecundaryDiagonal[vt_BottomLayer + 1] = 0.0;

  // Determination of the matrix primary diagonal
  for (var i_Layer = 0; i_Layer < vt_NumberOfLayers; i_Layer++) {

    vt_MatrixPrimaryDiagonal[i_Layer] =   vt_VolumeMatrix[i_Layer]
          - vt_MatrixSecundaryDiagonal[i_Layer]
          - vt_MatrixSecundaryDiagonal[i_Layer + 1]; //[J K-1]
  }

  /**
   * @brief Single calculation step
   * @param tmin
   * @param tmax
   * @param globrad
   */
  var step = function (tmin, tmax, globrad) {

    var vt_GroundLayer = vt_NumberOfLayers - 2;
    var vt_BottomLayer = vt_NumberOfLayers - 1;

    var vt_Solution = new Array(vt_NumberOfLayers);//                = new double [vt_NumberOfLayers];
    var vt_MatrixDiagonal = new Array(vt_NumberOfLayers);//          = new double [vt_NumberOfLayers];
    var vt_MatrixLowerTriangle = new Array(vt_NumberOfLayers);//     = new double [vt_NumberOfLayers];

    for (var i = 0; i < vt_NumberOfLayers; i++) {
      vt_Solution[i] = 0.0;
      vt_MatrixDiagonal[i] = 0.0;
      vt_MatrixLowerTriangle[i] = 0.0;
    }

    /////////////////////////////////////////////////////////////
    // Internal Subroutine Numerical Solution - Suckow,F. (1986)
    /////////////////////////////////////////////////////////////

    vt_HeatFlow = f_SoilSurfaceTemperature(tmin, tmax, globrad) * vt_B[0] * vt_HeatConductivityMean[0]; //[J]

    // Determination of the equation's right side
    vt_Solution[0] =  (vt_VolumeMatrixOld[0]
       + (vt_VolumeMatrix[0] - vt_VolumeMatrixOld[0]) / soilColumn[0].vs_LayerThickness)
        * vt_SoilTemperature[0] + vt_HeatFlow;

    // logger(MSG.INFO, "f_SoilSurfaceTemperature(tmin, tmax, globrad): " + f_SoilSurfaceTemperature(tmin, tmax, globrad));
    // logger(MSG.INFO, "vt_B[0]: " + vt_B[0]);
    // logger(MSG.INFO, "vt_HeatConductivityMean[0]: " + vt_HeatConductivityMean[0]);
    // logger(MSG.INFO, "vt_HeatFlow: " + vt_HeatFlow);
    // logger(MSG.INFO, "vt_Solution[0]: " + vt_Solution[0]);

    for (var i_Layer = 1; i_Layer < vt_NumberOfLayers; i_Layer++) {

      vt_Solution[i_Layer] =   (vt_VolumeMatrixOld[i_Layer]
        + (vt_VolumeMatrix[i_Layer] - vt_VolumeMatrixOld[i_Layer])
        / soilColumn[i_Layer].vs_LayerThickness)
          * vt_SoilTemperature[i_Layer];
    } // for

      // logger(MSG.INFO, vt_Solution);

    // end subroutine NumericalSolution

    /////////////////////////////////////////////////////////////
    // Internal Subroutine Cholesky Solution Method
    //
    // Solution of EX=Z with E tridiagonal and symmetric
    // according to CHOLESKY (E=LDL')
    /////////////////////////////////////////////////////////////

    // Determination of the lower matrix triangle L and the diagonal matrix D
    vt_MatrixDiagonal[0] = vt_MatrixPrimaryDiagonal[0];

    for (var i_Layer = 1; i_Layer < vt_NumberOfLayers; i_Layer++) {

      vt_MatrixLowerTriangle[i_Layer] = vt_MatrixSecundaryDiagonal[i_Layer] / vt_MatrixDiagonal[i_Layer - 1];
      vt_MatrixDiagonal[i_Layer] =   vt_MatrixPrimaryDiagonal[i_Layer]
             - (vt_MatrixLowerTriangle[i_Layer] * vt_MatrixSecundaryDiagonal[i_Layer]);
    }

    // Solution of LY=Z
    for (var i_Layer = 1; i_Layer < vt_NumberOfLayers; i_Layer++) {

      vt_Solution[i_Layer] =   vt_Solution[i_Layer]
               - (vt_MatrixLowerTriangle[i_Layer] * vt_Solution[i_Layer - 1]);
    }

    // Solution of L'X=D(-1)Y
    vt_Solution[vt_BottomLayer] = vt_Solution[vt_BottomLayer] / vt_MatrixDiagonal[vt_BottomLayer];


    for (var i_Layer = 0; i_Layer < vt_BottomLayer; i_Layer++) {

      var j_Layer = (vt_BottomLayer - 1) - i_Layer;
      var j_Layer1 = j_Layer + 1;
      vt_Solution[j_Layer] =   (vt_Solution[j_Layer] / vt_MatrixDiagonal[j_Layer])
               - (vt_MatrixLowerTriangle[j_Layer1] * vt_Solution[j_Layer1]);
    }

    // end subroutine CholeskyMethod

    // Internal Subroutine Rearrangement
    for(var i_Layer = 0; i_Layer < vt_NumberOfLayers; i_Layer++) {
      vt_SoilTemperature[i_Layer] = vt_Solution[i_Layer];
    }

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

      vt_VolumeMatrixOld[i_Layer] = vt_VolumeMatrix[i_Layer];
      soilColumn[i_Layer].set_Vs_SoilTemperature(vt_SoilTemperature[i_Layer]);
    }

    vt_VolumeMatrixOld[vt_GroundLayer] = vt_VolumeMatrix[vt_GroundLayer];
    vt_VolumeMatrixOld[vt_BottomLayer] = vt_VolumeMatrix[vt_BottomLayer];

  };


  /**
   * @brief  Soil surface temperature [B0C]
   *
   * Soil surface temperature caluclation following Williams 1984
   *
   * @param tmin
   * @param tmax
   * @param globrad
   */
  var f_SoilSurfaceTemperature = function (tmin, tmax, globrad) {

    var shading_coefficient = dampingFactor;

    var soil_coverage = 0.0;
    if (monica.cropGrowth()) {
      soil_coverage = monica.cropGrowth().get_SoilCoverage();
    }
    shading_coefficient =  0.1 + ((soil_coverage * dampingFactor) + ((1-soil_coverage) * (1-dampingFactor)));


    // Soil surface temperature caluclation following Williams 1984
    var vt_SoilSurfaceTemperatureOld = vt_SoilSurfaceTemperature;

    // corrected for very low radiation in winter
    if (globrad < 8.33) {
      globrad = 8.33;
    }

    vt_SoilSurfaceTemperature =   (1.0 - shading_coefficient)
          * (tmin + ((tmax - tmin) * pow((0.03 * globrad),0.5)))
          + shading_coefficient * vt_SoilSurfaceTemperatureOld;

    // damping negative temperatures due to heat loss for freezing water
    if (vt_SoilSurfaceTemperature < 0.0){
      vt_SoilSurfaceTemperature = vt_SoilSurfaceTemperature * 0.5;
    }
    return vt_SoilSurfaceTemperature;
  };

  /**
   * @brief Returns soil surface temperature.
   * @param
   * @return Soil surface temperature
   */
  var get_SoilSurfaceTemperature = function () {
    return vt_SoilSurfaceTemperature;
  };

  /**
   * @brief Returns soil temperature of a layer.
   * @param layer Index of layer
   * @return Soil temperature
   */
  get_SoilTemperature = function (layer) {
    return soilColumn[layer].get_Vs_SoilTemperature();
  };

  /**
   * @brief Returns heat conductivity of a layer.
   * @param layer Index of layer
   * @return Soil heat conductivity
   */
  var get_HeatConductivity = function (layer) {
    return vt_HeatConductivity[layer];
  };

  /**
   * @brief Returns mean soil temperature.
   * @param sumLT
   * @return Temperature
   */
  var get_AvgTopSoilTemperature = function (sumLT) {
    if (arguments.length === 0)
      sumLT = 0.3;
    var lsum = 0;
    var tempSum = 0;
    var count = 0;

    for (var i = 0; i < vs_NumberOfLayers; i++) {
      count++;
      tempSum += soilColumn[i].get_Vs_SoilTemperature();
      lsum += soilColumn[i].vs_LayerThickness;
      if(lsum >= sumLT) {
        break;
      }
    }

    return count < 1 ? 0 : tempSum / (count);
  };

  return {
      step: step
    , f_SoilSurfaceTemperature: f_SoilSurfaceTemperature
    , get_SoilSurfaceTemperature: get_SoilSurfaceTemperature
    , get_SoilTemperature: get_SoilTemperature
    , get_HeatConductivity: get_HeatConductivity
    , get_AvgTopSoilTemperature: get_AvgTopSoilTemperature
    , getDampingFactor: function () { return dampingFactor; }
    , setDampingFactor: function (factor) { dampingFactor = factor; }
    , vt_SoilSurfaceTemperature: vt_SoilSurfaceTemperature
  };

};


/*

  TODO:
    - date, doy optional?
    - use date string instead of Date obj?
    - what if sunhours not available?

  weatherData = {                   object
      tmin          [°C]            array, daily minimum temperature
    , tmax          [°C]            array, daily maximum temperature
    , tavg          [°C]            array, daily average temperature
    , globrad       [MJ m-2]        array, global radiation
    , exrad         [MJ m-2]        array, extraterrestrial radiation
    , wind          [m s-1]         array, wind speed
    , precip        [mm]            array, rainfall
    , sunhours      [h]             array, sunshine hours, optional (use empty array if not available)
    , relhumid      [%]             array, relative humidity, optional (use empty array if not available)
    , daylength     [h]             array, daylength. required by grassland model
    , f_directrad   [h h-1]         array, fraction direct solar radiation. required by grassland model
    , date          [date string]   array, ISO date strings
    , doy           [#]             array, day of year
  }
  doDebug           [bool]          debug model and print MSG.DEBUG output
  isVerbose         [bool]          print MSG.INFO output
  callbacks         [array]         function or array of functions, access model variables at each time step 
                                    (write an output file, change model variables etc.)
*/

var Configuration = function (weatherData, doDebug, isVerbose, callbacks) {

  DEBUG = (doDebug === true) ? true : false;
  VERBOSE = (isVerbose === true) ? true : false;

  if (typeof callbacks === 'function')
    callbacks = [callbacks];    
  else if (!Array.isArray(callbacks) || callbacks.length === 0)
    callbacks = [defaultCallback]; /* set to default if arg not provided */

  // var pathToOutputDir = '.';
  var models = null
    , noModels = 0
    ;

  /*
    input is an object with sim, prod and site properties or an array of site and prod objects

    simulation = { ... }      simulation settings
    
    siteAndProd = {           obj
      site: { ... },          site, location
      production: { ... }     crop rotation
    }

      or

    siteAndProd = [{          array of objs
      site: { ... },          site 1, location
      production: { ... }     crop rotation 1
    }, {   
      site: { ... },          site n, location
      production: { ... }     crop rotation n
    }, ...]

  */

  var run = function (sim, siteAndProd) {

    var startDate = new Date(sim.time.startDate);
    var endDate = new Date(sim.time.endDate);

    /* weather */
    var weather = new Weather(startDate, endDate);
    if (!createWeather(weather, weatherData, Date.parse(sim.time.startDate), Date.parse(sim.time.endDate))) {
      logger(MSG.ERROR, 'Error fetching weather data.');
      return;
    }
    
    logger(MSG.INFO, 'Fetched weather data.');

    models = new ModelCollection(weather);

    if (!Array.isArray(siteAndProd))
      siteAndProd = [siteAndProd];

    noModels = siteAndProd.length;

    for (var sp = 0, sps = siteAndProd.length; sp < sps; sp++) {

      logger(MSG.INFO, 'Fetching parameter for site + ' + sp);
      
      var site = siteAndProd[sp].site;
      var prod = siteAndProd[sp].production;
      
      /* init parameters */
      var parameterProvider = new ParameterProvider();
      var siteParameters = new SiteParameters();
      var generalParameters = new GeneralParameters();

      /* sim */
      var startYear = startDate.getFullYear();
      var endYear = endDate.getFullYear();

      parameterProvider.userInitValues.p_initPercentageFC = getValue(sim.init, 'percentageFC', parameterProvider.userInitValues.p_initPercentageFC);
      parameterProvider.userInitValues.p_initSoilNitrate = getValue(sim.init, 'soilNitrate', parameterProvider.userInitValues.p_initSoilNitrate);
      parameterProvider.userInitValues.p_initSoilAmmonium = getValue(sim.init, 'soilAmmonium', parameterProvider.userInitValues.p_initSoilAmmonium);

      parameterProvider.userEnvironmentParameters.p_UseSecondaryYields = getValue(sim.switches, 'useSecondaryYieldOn', parameterProvider.userEnvironmentParameters.p_UseSecondaryYields);
      generalParameters.pc_NitrogenResponseOn = getValue(sim.switches, 'nitrogenResponseOn', generalParameters.pc_NitrogenResponseOn);
      generalParameters.pc_WaterDeficitResponseOn = getValue(sim.switches, 'waterDeficitResponseOn', generalParameters.pc_WaterDeficitResponseOn);
      generalParameters.pc_WaterDeficitResponseOn = getValue(sim.switches, 'lowTemperatureStressResponseOn', generalParameters.pc_LowTemperatureStressResponseOn);
      generalParameters.pc_WaterDeficitResponseOn = getValue(sim.switches, 'highTemperatureStressResponseOn', generalParameters.pc_HighTemperatureStressResponseOn);
      generalParameters.pc_EmergenceMoistureControlOn = getValue(sim.switches, 'emergenceMoistureControlOn', generalParameters.pc_EmergenceMoistureControlOn);
      generalParameters.pc_EmergenceFloodingControlOn = getValue(sim.switches, 'emergenceFloodingControlOn', generalParameters.pc_EmergenceFloodingControlOn);

      logger(MSG.INFO, 'Fetched simulation data.');
      
      /* site */
      siteParameters.vs_Latitude = site.latitude;
      siteParameters.vs_Slope = site.slope;
      siteParameters.vs_HeightNN = site.heightNN;
      siteParameters.vq_NDeposition = getValue(site, 'NDeposition', siteParameters.vq_NDeposition);

      parameterProvider.userEnvironmentParameters.p_AthmosphericCO2 = getValue(site, 'atmosphericCO2', parameterProvider.userEnvironmentParameters.p_AthmosphericCO2);
      parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepth = getValue(site, 'groundwaterDepthMin', parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepth);
      parameterProvider.userEnvironmentParameters.p_MaxGroundwaterDepth = getValue(site, 'groundwaterDepthMax', parameterProvider.userEnvironmentParameters.p_MaxGroundwaterDepth);
      parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepthMonth = getValue(site, 'groundwaterDepthMinMonth', parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepthMonth);
      parameterProvider.userEnvironmentParameters.p_WindSpeedHeight = getValue(site, 'windSpeedHeight', parameterProvider.userEnvironmentParameters.p_WindSpeedHeight);  
      parameterProvider.userEnvironmentParameters.p_LeachingDepth = getValue(site, 'leachingDepth', parameterProvider.userEnvironmentParameters.p_LeachingDepth);

      logger(MSG.INFO, 'Fetched site data.');

      /* soil */
      var lThicknessCm = 100.0 * parameterProvider.userEnvironmentParameters.p_LayerThickness;
      var maxDepthCm =  200.0;
      var maxNoOfLayers = int(maxDepthCm / lThicknessCm);

      var layers = [];
      if (!createLayers(layers, site.horizons, lThicknessCm, maxNoOfLayers)) {
        logger(MSG.ERROR, 'Error fetching soil data.');
        return;
      }
      
      logger(MSG.INFO, 'Fetched soil data.');

      /* crops */
      var cropRotation = [];
      if (!createProcesses(cropRotation, prod.crops, startDate)) {
        logger(MSG.ERROR, 'Error fetching crop data.');
        return;
      }
      
      logger(MSG.INFO, 'Fetched crop data.');

      var env = new Environment(layers, parameterProvider);
      env.general = generalParameters;
      // env.pathToOutputDir = pathToOutputDir;
      // env.setMode(1); // JS! not implemented
      env.site = siteParameters;
      // env.da = da; // now in ModelCollection.weather
      env.cropRotation = cropRotation;
     
      // TODO: implement and test useAutomaticIrrigation & useNMinFertiliser
      // if (hermes_config->useAutomaticIrrigation()) {
      //   env.useAutomaticIrrigation = true;
      //   env.autoIrrigationParams = hermes_config->getAutomaticIrrigationParameters();
      // }

      // if (hermes_config->useNMinFertiliser()) {
      //   env.useNMinMineralFertilisingMethod = true;
      //   env.nMinUserParams = hermes_config->getNMinUserParameters();
      //   env.nMinFertiliserPartition = getMineralFertiliserParametersFromMonicaDB(hermes_config->getMineralFertiliserID());
      // }

      models.push(new Model(env));
    
    } // for each input
    
    logger(MSG.INFO, 'Start model run.');
    
    return models.run(callbacks);

  };

  /* read value from JSON input and return default value if parameter is not available */
  function getValue(obj, prop, def) {

    if (obj.hasOwnProperty(prop) && obj[prop] != null)
      return obj[prop];
    else
      return def;

  }

  function createLayers(layers, horizons, lThicknessCm, maxNoOfLayers) {

    var ok = true;
    var hs = horizons.length;
    var depth = 0;
    
    logger(MSG.INFO, 'Fetching ' + hs + ' horizons.');

    for (var h = 0; h < hs; ++h ) {
      
      var horizon = horizons[h];
      var hThicknessCm = horizon.thickness * 100;
      var lInHCount = int(round(hThicknessCm / lThicknessCm));

      /* fill all (maxNoOfLayers) layers if available horizons depth < lThicknessCm * maxNoOfLayers */
      if (h == (hs - 1) && (int(layers.length) + lInHCount) < maxNoOfLayers)
        lInHCount += maxNoOfLayers - layers.length - lInHCount;

      for (var l = 0; l < lInHCount; l++) {

        /* stop if we reach max. depth */
        if (depth === maxNoOfLayers * lThicknessCm) {
          logger(MSG.WARN, 'Maximum soil layer depth (' + (maxNoOfLayers * lThicknessCm) + ' cm) reached. Remaining layers in horizon ' + h + ' ignored.');
          break;
        }

        depth += lThicknessCm;

        var soilParameters = new SoilParameters();

        soilParameters.set_vs_SoilOrganicMatter(horizon.organicMatter);
        soilParameters.vs_SoilSandContent = horizon.sand;
        soilParameters.vs_SoilClayContent = horizon.clay;
        soilParameters.vs_SoilStoneContent = horizon.sceleton;
        soilParameters.vs_SoilpH = horizon.pH;
        soilParameters.vs_SoilTexture = tools.texture2KA5(horizon.sand, horizon.clay);
        soilParameters.vs_Lambda = tools.texture2lambda(soilParameters.vs_SoilSandContent, soilParameters.vs_SoilClayContent);

        /* optional parameters */
        soilParameters.vs_SoilpH = getValue(horizon, 'pH', 6.9);

        /* set wilting point, saturation & field capacity */
        if ( horizon.hasOwnProperty('poreVolume') && horizon.poreVolume != null
          && horizon.hasOwnProperty('fieldCapacity') && horizon.fieldCapacity != null
          && horizon.hasOwnProperty('permanentWiltingPoint') && horizon.permanentWiltingPoint != null
          && horizon.hasOwnProperty('bulkDensity') && horizon.bulkDensity != null) { /* if all soil properties are available */

          soilParameters.set_vs_SoilBulkDensity(horizon.bulkDensity);
          soilParameters.vs_FieldCapacity = horizon.fieldCapacity;
          soilParameters.vs_Saturation = horizon.poreVolume - horizon.fieldCapacity;
          soilParameters.vs_PermanentWiltingPoint = horizon.permanentWiltingPoint;

        } else { /* if any is missing */

          /* if density class according to KA5 is available (trockenrohdichte-klassifikation) TODO: add ld_class to JSON cfg */
          // soilParameters.set_vs_SoilRawDensity(tools.ld_eff2trd(3 /*ld_class*/, horizon.clay));
          // tools.soilCharacteristicsKA5(soilParameters);

          /* else use Saxton */
          var saxton = tools.saxton(horizon.sand, horizon.clay, horizon.organicMatter, horizon.sceleton).saxton_86;
          soilParameters.set_vs_SoilBulkDensity(roundN(2, saxton.BD));
          soilParameters.vs_FieldCapacity = roundN(2, saxton.FC);
          soilParameters.vs_Saturation = roundN(2, saxton.SAT);
          soilParameters.vs_PermanentWiltingPoint = roundN(2, saxton.PWP);

        }
        
        /* TODO: hinter readJSON verschieben */ 
        if (!soilParameters.isValid()) {
          ok = false;
          logger(MSG.ERROR, 'Error in soil parameters.');
        }

        layers.push(soilParameters);
        logger(MSG.INFO, 'Fetched layer ' + layers.length + ' in horizon ' + h + '.');

      }

      logger(MSG.INFO, 'Fetched horizon ' + h + '.');
    }  

    return ok;
  }


  function createProcesses(cropRotation, crops, startDate) {
    
    var ok = true;
    var cs = crops.length;
    
    logger(MSG.INFO, 'Fetching ' + cs + ' crops.');

    for (var c = 0; c < cs; c++) {

      var crop = crops[c];
      var isGrassland = (crop.name === 'grassland');
      var isPermanentGrassland = (isGrassland && cs === 1);

      if (isGrassland) {
        /* we can not start at day 0 and therefor start at day 0 + 2 since model's general step is executed *after* cropStep */
        var sd_ = new Date(startDate.toISOString());
        sd_.setDate(sd_.getDate() + 2);
        var sd = getValue(crop, 'sowingDate', sd_);
        var hds = getValue(crop, 'harvestDates', []);
      } else {
        var sd = new Date(Date.parse(crop.sowingDate));
        var hd = new Date(Date.parse(crop.finalHarvestDate));
        if (!sd.isValid() || !hd.isValid()) {
          ok = false;
          logger(MSG.ERROR, 'Invalid sowing or harvest date in ' + crop.name);
        }
      }

      if (isGrassland) {

        var grass = new Grass(sd, hds, crop.species);
        cropRotation[c] = new ProductionProcess('grassland', grass);

      } else {

        var fieldcrop = new FieldCrop(crop.name);
        fieldcrop.setSeedAndHarvestDate(sd, hd);
        cropRotation[c] = new ProductionProcess(crop.name, fieldcrop);
      
      }


      /* tillage */
      var tillageOperations = crop.tillageOperations;
      if (tillageOperations) { /* in case no tillage has been added */
        if (!addTillageOperations(cropRotation[c], tillageOperations)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding tillages.');
        }
      }

      /* mineral fertilizer */
      var mineralFertilisers = crop.mineralFertilisers;
      if (mineralFertilisers) { /* in case no min fertilizer has been added */
        if (!addFertilizers(cropRotation[c], mineralFertilisers, false)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding mineral fertilisers.');
        }
      }

      /* organic fertilizer */ 
      var organicFertilisers = crop.organicFertilisers;
      if (organicFertilisers) { /* in case no org fertilizer has been added */ 
        if (!addFertilizers(cropRotation[c], organicFertilisers, true)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding organic fertilisers.');
        }
      }

      /* irrigations */
      var irrigations = crop.irrigations;
      if (irrigations) {  /* in case no irrigation has been added */
        if (!addIrrigations(cropRotation[c], irrigations)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding irrigations.');
        }
      }

      /* cutting */
      var cuttings = crop.cuttings;
      if (cuttings) { /* in case no tillage has been added */
        if (!addCuttings(cropRotation[c], cuttings)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding cuttings.');
        }
      }

      logger(MSG.INFO, 'Fetched crop ' + c + ': ' + crop.name);

    }

    return ok;
  }


  function addTillageOperations(productionProcess, tillageOperations) {

    var ok = true;
    var ts = tillageOperations.length;

    logger(MSG.INFO, 'Fetching ' + ts + ' tillages.');

    for (var t = 0; t < ts; ++t) {

      var till = tillageOperations[t];

      /* ignore if any value is null */
      if (till.date === null || till.depth === null || till.method === null) {
        logger(MSG.WARN, 'At least one tillage parameter null: tillage ' + t + ' ignored.');
        continue;
      }

      var tDate = new Date(Date.parse(till.date));
      var depth = till.depth / 100; // cm to m
      var method = till.method;

      if (!tDate.isValid()) {
        ok = false;
        logger(MSG.ERROR, 'Invalid tillage date in tillage no. ' + t + '.');
      }

      productionProcess.addApplication(new TillageApplication(tDate, depth));

      logger(MSG.INFO, 'Fetched tillage ' + t + '.');

    }

    return ok;
  }


  function addFertilizers(productionProcess, fertilizers, isOrganic) {
    // TODO: implement in JS
    /*
    //get data parsed and to use leap years if the crop rotation uses them
    Date fDateate = parseDate(sfDateate).toDate(it->crop()->seedDate().useLeapYears());

    if (!fDateate.isValid())
    {
      debug() << 'Error - Invalid date in \'' << pathToFile << '\'' << endl;
      debug() << 'Line: ' << s << endl;
      ok = false;
    }

   //if the currently read fertiliser date is after the current end
    //of the crop, move as long through the crop rotation as
    //we find an end date that lies after the currently read fertiliser date
    while (fDateate > currentEnd)
    {
      //move to next crop and possibly exit at the end
      it++;
      if (it == cr.end())
        break;

      currentEnd = it->end();

      //cout << 'new PP start: ' << it->start().toString()
      //<< ' new PP end: ' << it->end().toString() << endl;
      //cout << 'new currentEnd: ' << currentEnd.toString() << endl;
    }
    */
    var ok = true;
    var fs = fertilizers.length;

    logger(MSG.INFO, 'Fetching ' + fs + ' ' + (isOrganic ? 'organic' : 'mineral') + ' fertilisers.');

    for (var f = 0; f < fs; ++f) {
      
      var fertilizer = fertilizers[f];

      /* ignore if any value is null */
      if (fertilizer.date === null || fertilizer.method === null || fertilizer.amount === null) {
        logger(MSG.WARN, 'At least one fertiliser parameter null: ' + (isOrganic ? 'organic' : 'mineral') + ' fertiliser ' + f + 'ignored.');
        continue;
      }

      var fDate = new Date(Date.parse(fertilizer.date))
        , method = fertilizer.method
        , name = fertilizer.name // changed from id to name
        , amount = fertilizer.amount // [kg (FM) ha-1]
        , carbamid = fertilizer.carbamid
        , no3 = fertilizer.no3
        , nh4 = fertilizer.nh4
        , dm = fertilizer.dm
        ;

      if (!fDate.isValid()) {
        ok = false;
        logger(MSG.ERROR, 'Invalid fertilization date in ' + f + '.');
      }

      if (isOrganic)
        productionProcess.addApplication(new OrganicFertiliserApplication(fDate, new OrganicFertilizer(name, carbamid, no3, nh4, dm), amount, true));
      else
        productionProcess.addApplication(new MineralFertiliserApplication(fDate, new MineralFertilizer(name, carbamid, no3, nh4), amount));

      logger(MSG.INFO, 'Fetched ' + (isOrganic ? 'organic' : 'mineral') + ' fertiliser ' + f + '.');

    }
     
    return ok; 
  }


  function addIrrigations(productionProcess, irrigations) {
    
    var ok = true;

    // TODO: implement in JS
    //get data parsed and to use leap years if the crop rotation uses them
    /*Date idate = parseDate(irrDate).toDate(it->crop()->seedDate().useLeapYears());
    if (!idate.isValid())
    {
      debug() << 'Error - Invalid date in \'' << pathToFile << '\'' << endl;
      debug() << 'Line: ' << s << endl;
      debug() << 'Aborting simulation now!' << endl;
      exit(-1);
    }

    //cout << 'PP start: ' << it->start().toString()
    //<< ' PP end: ' << it->end().toString() << endl;
    //cout << 'irrigationDate: ' << idate.toString()
    //<< ' currentEnd: ' << currentEnd.toString() << endl;

    //if the currently read irrigation date is after the current end
    //of the crop, move as long through the crop rotation as
    //we find an end date that lies after the currently read irrigation date
    while (idate > currentEnd)
    {
      //move to next crop and possibly exit at the end
      it++;
      if (it == cr.end())
        break;

      currentEnd = it->end();

      //cout << 'new PP start: ' << it->start().toString()
      //<< ' new PP end: ' << it->end().toString() << endl;
      //cout << 'new currentEnd: ' << currentEnd.toString() << endl;
    }*/

    var is = irrigations.length;
    
    logger(MSG.INFO, 'Fetching ' + is + ' irrigations.');

    for (var i = 0; i < is; ++i) {
      
      var irrigation = irrigations[i];

      /* ignore if any value is null */
      if (irrigation.date === null || irrigation.method  === null || irrigation.eventType  === null || irrigation.threshold  === null
          || irrigation.amount === null || irrigation.NConc === null) {
        logger(MSG.WARN, 'At least one irrigation parameter null: irrigation ' + i + ' ignored.');
        continue;
      }

      var method = irrigation.method;
      var eventType = irrigation.eventType;
      var threshold = irrigation.threshold;
      var area = irrigation.area;
      var amount = irrigation.amount;
      var NConc = irrigation.NConc;
      var iDate = new Date(Date.parse(irrigation.date));

      if (!iDate.isValid()) {
        ok = false;
        logger(MSG.ERROR, 'Invalid irrigation date in ' + i + '.');
      }

      productionProcess.addApplication(new IrrigationApplication(iDate, amount, new IrrigationParameters(NConc, 0.0)));

      logger(MSG.INFO, 'Fetched irrigation ' + i + '.');

    }

    return ok;
  };

  /*
    JV: test new function
  */

  // function addCuttings(productionProcess, cutArr) {

  //   var ok = true;
  //   var cs = cutArr.length;

  //   logger(MSG.INFO, 'Fetching ' + cs + ' cuttings.');

  //   for (var c = 0; c < cs; ++c) {
  //     var cutObj = cutArr[c];
  //     var cDate = new Date(Date.parse(cutObj.date));
  //     pp.addApplication(new Cutting(cDate, pp.crop(), pp.cropResult()));
  //   }

  //   return ok;
  // };


  function createWeather(weather, input) {

    var ok = true;
    var data = [];

    data[WEATHER.TMIN] = new Float64Array(input.tmin);                  /* [°C] */
    data[WEATHER.TMAX] = new Float64Array(input.tmax);                  /* [°C] */
    data[WEATHER.TAVG] = new Float64Array(input.tavg);                  /* [°C] */
    data[WEATHER.GLOBRAD] = new Float64Array(input.globrad);            /* [MJ m-2] */
    data[WEATHER.WIND] = new Float64Array(input.wind);                  /* [m s-1] */
    data[WEATHER.PRECIP] = new Float64Array(input.precip);              /* [mm] */

    /* required for grassland model */
    data[WEATHER.DAYLENGTH] = new Float64Array(input.daylength);        /* [h] */
    data[WEATHER.F_DIRECTRAD] = new Float64Array(input.f_directrad);    /* [h h-1] fraction direct solar radiation */
    data[WEATHER.EXRAD] = new Float64Array(input.exrad);                /* [MJ m-2] */

    data[WEATHER.SUNHOURS] = new Float64Array(input.sunhours);          /* [h] */
    data[WEATHER.RELHUMID] = new Float64Array(input.relhumid);          /* [%] */

    data[WEATHER.DOY] = input.doy;
    data[WEATHER.ISODATESTRING] = input.date;

    /* check if all arrays are of the same length */
    var length = data[WEATHER.TMIN].length;
    for (var i in WEATHER) { 
      if (data[WEATHER[i]].length != length)
        ok = false;
    }
    
    if (ok)
      weather.setData(data);      

    /* TODO: add additional checks */

    return ok;

  };

  function defaultCallback(dayOfSimulation, dateString, models, done) {

    var progress = [];

    if (!done) {

      for (var m = 0; m < noModels; m++) {
        progress.push({
          date: { value: dateString, unit: '[date]' }
        });
      }

      // var isCropPlanted = model.isCropPlanted()
      //   , mcg = model.cropGrowth()
      //   , mst = model.soilTemperature()
      //   , msm = model.soilMoisture()
      //   , mso = model.soilOrganic()
      //   , msc = model.soilColumn()
      //   /* TODO: (from cpp) work-around. Hier muss was eleganteres hin! */
      //   , msa = model.soilColumnNC()
      //   , msq = model.soilTransport()
      //   ;

      // progress = {
      //     date: { value: date.toISOString(), unit: '[date]' }
      //   , CropName: { value: isCropPlanted ? mcg.get_CropName() : '', unit: '-' }
      //   , TranspirationDeficit: { value: isCropPlanted ? mcg.get_TranspirationDeficit() : 0, unit: '[0;1]' }
      //   , ActualTranspiration: { value: isCropPlanted ? mcg.get_ActualTranspiration() : 0, unit: '[mm]' } 
      //   , CropNRedux: { value: isCropPlanted ? mcg.get_CropNRedux() : 0, unit: '[0;1]' }
      //   , HeatStressRedux: { value: isCropPlanted ? mcg.get_HeatStressRedux() : 0, unit: '[0;1]' }
      //   , OxygenDeficit: { value: isCropPlanted ? mcg.get_OxygenDeficit() : 0, unit: '[0;1]' }
      //   , DevelopmentalStage: { value: isCropPlanted ? mcg.get_DevelopmentalStage() + 1 : 0, unit: '[#]' }
      //   , CurrentTemperatureSum: { value: isCropPlanted ? mcg.get_CurrentTemperatureSum() : 0, unit: '°C' }
      //   , VernalisationFactor: { value: isCropPlanted ? mcg.get_VernalisationFactor() : 0, unit: '[0;1]' }
      //   , DaylengthFactor: { value: isCropPlanted ? mcg.get_DaylengthFactor() : 0, unit: '[0;1]' }
      //   , OrganGrowthIncrementRoot: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(0) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganGrowthIncrementLeaf: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(1) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganGrowthIncrementShoot: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(2) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganGrowthIncrementFruit: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(3) : 0, unit: '[kg (DM) ha-1]' }
      //   , RelativeTotalDevelopment: { value: isCropPlanted ? mcg.get_RelativeTotalDevelopment() : 0, unit: '[0;1]' }
      //   , OrganBiomassRoot: { value: isCropPlanted ? mcg.get_OrganBiomass(0) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganBiomassLeaf: { value: isCropPlanted ? mcg.get_OrganBiomass(1) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganBiomassShoot: { value: isCropPlanted ? mcg.get_OrganBiomass(2) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganBiomassFruit: { value: isCropPlanted ? mcg.get_OrganBiomass(3) : 0, unit: '[kg (DM) ha-1]' }
      //   , PrimaryCropYield: { value: isCropPlanted ? mcg.get_PrimaryCropYield() : 0, unit: '[kg (DM) ha-1]' }
      //   , LeafAreaIndex: { value:  isCropPlanted ? mcg.get_LeafAreaIndex() : 0, unit: '[m-2 m-2]' }
      //   , GrossPhotosynthesisHaRate: { value: isCropPlanted ? mcg.get_GrossPhotosynthesisHaRate() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
      //   , NetPhotosynthesis: { value: isCropPlanted ? mcg.get_NetPhotosynthesis() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
      //   , MaintenanceRespirationAS: { value: isCropPlanted ? mcg.get_MaintenanceRespirationAS() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
      //   , GrowthRespirationAS: { value: isCropPlanted ? mcg.get_GrowthRespirationAS() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
      //   , StomataResistance: { value: isCropPlanted ? mcg.get_StomataResistance() : 0, unit: '[s m-1]' }
      //   , CropHeight: { value: isCropPlanted ? mcg.get_CropHeight() : 0, unit: '[m]' }
      //   , LeafAreaIndex: { value: isCropPlanted ? mcg.get_LeafAreaIndex() : 0, unit: '[m2 m-2]' }
      //   , RootingDepth: { value: isCropPlanted ? mcg.get_RootingDepth() : 0, unit: '[layer #]' }
      //   , AbovegroundBiomass: { value: isCropPlanted ? mcg.get_AbovegroundBiomass() : 0, unit: '[kg ha-1]' }
      //   , TotalBiomassNContent: { value: isCropPlanted ? mcg.get_TotalBiomassNContent() : 0, unit: '[?]' }
      //   , SumTotalNUptake: { value: isCropPlanted ? mcg.get_SumTotalNUptake() : 0, unit: '[kg (N) ha-1]' }
      //   , ActNUptake: { value: isCropPlanted ? mcg.get_ActNUptake() : 0, unit: '[kg (N) ha-1]' }
      //   , PotNUptake: { value: isCropPlanted ? mcg.get_PotNUptake() : 0, unit: '[kg (N) ha-1]' }
      //   , TargetNConcentration: { value: isCropPlanted ? mcg.get_TargetNConcentration() : 0, unit: '[kg (N) ha-1]' }
      //   , CriticalNConcentration: { value: isCropPlanted ? mcg.get_CriticalNConcentration() : 0, unit: '[kg (N) ha-1]' }
      //   , AbovegroundBiomassNConcentration: { value: isCropPlanted ? mcg.get_AbovegroundBiomassNConcentration() : 0, unit: '[kg (N) ha-1]' }
      //   , NetPrimaryProduction: { value: isCropPlanted ? mcg.get_NetPrimaryProduction() : 0, unit: '[kg (N) ha-1]' }
      //   , GrossPrimaryProduction: { value: isCropPlanted ? mcg.get_GrossPrimaryProduction() : 0, unit: '[kg (N) ha-1]' }
      //   , AutotrophicRespiration: { value: isCropPlanted ? mcg.get_AutotrophicRespiration() : 0, unit: '[kg (C) ha-1]' }
      // };

      // var outLayers = 20;

      // for (var i_Layer = 0; i_Layer < outLayers; i_Layer++)
      //   progress['SoilMoisture_' + i_Layer] = { value: msm.get_SoilMoisture(i_Layer), unit: '[m-3 m-3]' };

      // progress['dailySumIrrigationWater'] = { value: model.dailySumIrrigationWater(), unit: '[mm]' };
      // progress['Infiltration'] = { value: msm.get_Infiltration(), unit: '[mm]' };
      // progress['SurfaceWaterStorage'] = { value: msm.get_SurfaceWaterStorage(), unit: '[mm]' };
      // progress['SurfaceRunOff'] = { value: msm.get_SurfaceRunOff(), unit: '[mm]' };
      // progress['SnowDepth'] = { value: msm.get_SnowDepth(), unit: '[mm]' }; 
      // progress['FrostDepth'] = { value: msm.get_FrostDepth(), unit: '[mm]' };
      // progress['ThawDepth'] = { value: msm.get_ThawDepth(), unit: '[mm]' };

      // for (var i_Layer = 0; i_Layer < outLayers; i_Layer++)
      //  progress['PASW_' + i_Layer] = { value: msm.get_SoilMoisture(i_Layer) - msa[i_Layer].get_PermanentWiltingPoint(), unit: '[m-3 m-3]' };

      // progress['SoilSurfaceTemperature'] = { value: mst.get_SoilSurfaceTemperature(), unit: '[°C]' };

      // for(var i_Layer = 0; i_Layer < 5; i_Layer++)
      //   progress['SoilTemperature_' + i_Layer] = { value: mst.get_SoilTemperature(i_Layer), unit: '[°C]' };

      // progress['ActualEvaporation'] = { value: msm.get_ActualEvaporation(), unit: '[mm]' };
      // progress['Evapotranspiration'] = { value: msm.get_Evapotranspiration(), unit: '[mm]' };
      // progress['ET0'] = { value: msm.get_ET0(), unit: '[mm]' };
      // progress['KcFactor'] = { value: msm.get_KcFactor(), unit: '[?]' };
      // progress['AtmosphericCO2Concentration'] = { value: model.get_AtmosphericCO2Concentration(), unit: '[ppm]' };
      // progress['GroundwaterDepth'] = { value: model.get_GroundwaterDepth(), unit: '[m]' };
      // progress['GroundwaterRecharge'] = { value: msm.get_GroundwaterRecharge(), unit: '[mm]' };
      // progress['NLeaching'] = { value: msq.get_NLeaching(), unit: '[kg (N) ha-1]' };

      // for(var i_Layer = 0; i_Layer < outLayers; i_Layer++)
      //   progress['SoilNO3_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNO3(), unit: '[kg (N) m-3]' };

      // progress['SoilCarbamid'] = { value: msc.soilLayer(0).get_SoilCarbamid(), unit: '[kg (N) m-3]' };

      // for(var i_Layer = 0; i_Layer < outLayers; i_Layer++)
      //   progress['SoilNH4_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNH4(), unit: '[kg (N) m-3]' };

      // for(var i_Layer = 0; i_Layer < 4; i_Layer++)
      //   progress['SoilNO2_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNO2(), unit: '[kg (N) m-3]' };

      // for(var i_Layer = 0; i_Layer < 6; i_Layer++)
      //   progress['SoilOrganicCarbon_' + i_Layer] = { value: msc.soilLayer(i_Layer).vs_SoilOrganicCarbon(), unit: '[kg (C) kg-1]' };

    }
  
    if (ENVIRONMENT_IS_WORKER)
      postMessage({ progress: progress });
    else {
      console.log(JSON.stringify(progress, null, 2));  
    }

    if (done) 
      logger(MSG.INFO, 'done');
  
  };  

  return {
    run: run 
  };


};


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
      var cfg = new Configuration(null, config.weather, config.debug);
      postMessage(cfg.run(config.sim, config.site, config.crop));
    } else {
      postMessage(null);
    }
  };

} else {

  crop.Configuration = Configuration;
  crop.config = example_config;
  var fs = null;

}



}());
