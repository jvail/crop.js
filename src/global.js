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

var UNDEFINED = -9999.9
  , UNDEFINED_INT = -9999
  ;

var ROOT = 0
  , LEAF = 1
  , SHOOT = 2
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
      return x.toFixed(n);
    }
  , roundN = function (n, x) { 
      return parseFloat(x.toFixed(n));
    }
  , sin    = Math.sin
  , sqrt   = Math.sqrt
  , tan    = Math.tan
  , PI     = Math.PI
  ;


// var Eva2_Nutzung = {
//   NUTZUNG_UNDEFINED: 0,
//   NUTZUNG_GANZPFLANZE: 1,
//   NUTZUNG_KORN: 2,
//   NUTZUNG_GRUENDUENGUNG: 7,
//   NUTZUNG_CCM: 8
// };  

var ResultId = [
  //! primary yield for the crop (e.g. the actual fruit)
  'primaryYield',
  //! secondary yield for the crop (e.g. leafs and other stuff useable)
  'secondaryYield',
  //! sum of applied fertilizer for that crop during growth period
  'sumFertiliser',
  //! sum of used irrigation water for the crop during growth period
  'sumIrrigation',
  //! sum of N turnover
  'sumMineralisation',
  //! the monthly average of the average corg content in the first 10 cm soil
  'avg10cmMonthlyAvgCorg',
  //! the monthly average of the average corg content in the first 30 cm soil
  'avg30cmMonthlyAvgCorg',
  //! the monthly average of the summed up water content in the first 90 cm soil
  'mean90cmMonthlyAvgWaterContent',
  //! at some day in the year the sum of the N content in the first 90cm soil
  'sum90cmYearlyNatDay',
  //! the monthly summed up amount of ground water recharge
  'monthlySumGroundWaterRecharge',
  //! the monthly sum of N leaching
  'monthlySumNLeaching',
  //! height of crop at harvesting date
  'cropHeight',
  //! sum of NO3 content in the first 90cm soil at a 'special', hardcoded date
  'sum90cmYearlyNO3AtDay',
  //! sum of NH4 content in the first 90cm soil at a 'special', hardcoded date
  'sum90cmYearlyNH4AtDay',
  //! value of maximal snow depth during simulation duration
  'maxSnowDepth',
  //! sum of snow depth for every day
  'sumSnowDepth',
  //! sum of frost depth
  'sumFrostDepth',
  //! Average soil temperature in the first 30cm soil at 'special', hardcoded date
  'avg30cmSoilTemperature',
  //! Sum of soil temperature in the first 30cm soil at 'special', hardcoded date
  'sum30cmSoilTemperature',
  //! Average soilmoisture content in first 30cm soil at 'special', hardcoded date
  'avg0_30cmSoilMoisture',
  //! Average soilmoisture content in 30-60cm soil at 'special', hardcoded date
  'avg30_60cmSoilMoisture',
  //! Average soilmoisture content in 60-90cm soil at 'special', hardcoded date
  'avg60_90cmSoilMoisture',
  //! water flux at bottom layer of soil at 'special', hardcoded date
  'waterFluxAtLowerBoundary',
  //! capillary rise in first 30 cm soil at special date
  'avg0_30cmCapillaryRise',
  //! capillary rise in 30-60 cm soil at special date
  'avg30_60cmCapillaryRise',
  //! capillary rise in 60-90cm cm soil at special date
  'avg60_90cmCapillaryRise',
  //! percolation ratein first 30 cm soil at special date
  'avg0_30cmPercolationRate',
  //! percolation ratein 30-60 cm soil at special date
  'avg30_60cmPercolationRate',
  //! percolation rate in 60-90cm cm soil at special date
  'avg60_90cmPercolationRate',
  //! sum of surface run off volumes during hole simulation duration
  'sumSurfaceRunOff',
  //! Evapotranspiration amount at a special date
  'evapotranspiration',
  //! Transpiration amount at a special date
  'transpiration',
  //! Evaporation amount at a special date
  'evaporation',
  //! N content in biomass after harvest
  'biomassNContent',
  //! N content in above ground biomass after harvest
  'aboveBiomassNContent',
  //! sum of total N uptake of plant
  'sumTotalNUptake',
  //! sum of CO2 evolution rate in first 30 cm soil at special date
  'sum30cmSMB_CO2EvolutionRate',
  //! volatilised NH3 at a special date
  'NH3Volatilised',
  //! sum of all volatilised NH3
  'sumNH3Volatilised',
  //! sum of denitrification rate in first 30cm at a special date
  'sum30cmActDenitrificationRate',
  //! leaching N at boundary at special date
  'leachingNAtBoundary',
  //! leaching N accumulated for a year
  'yearlySumNLeaching',
  //! Groundwater recharge accumulated for a year
  'yearlySumGroundWaterRecharge',
  //! Evapotranspiration in time of crop cultivation
  'sumETaPerCrop',
  'cropname',
  'primaryYieldTM',
  'secondaryYieldTM',
  'monthlySurfaceRunoff',
  'monthlyPrecip',
  'monthlyETa',
  'monthlySoilMoistureL0',
  'monthlySoilMoistureL1',
  'monthlySoilMoistureL2',
  'monthlySoilMoistureL3',
  'monthlySoilMoistureL4',
  'monthlySoilMoistureL5',
  'monthlySoilMoistureL6',
  'monthlySoilMoistureL7',
  'monthlySoilMoistureL8',
  'monthlySoilMoistureL9',
  'monthlySoilMoistureL10',
  'monthlySoilMoistureL11',
  'monthlySoilMoistureL12',
  'monthlySoilMoistureL13',
  'monthlySoilMoistureL14',
  'monthlySoilMoistureL15',
  'monthlySoilMoistureL16',
  'monthlySoilMoistureL17',
  'monthlySoilMoistureL18',
  'daysWithCrop',
  'NStress',
  'WaterStress',
  'HeatStress',
  'OxygenStress',
  'dev_stage'
];

var perCropResults = [
  'primaryYield',
  'secondaryYield',
  'primaryYieldTM',
  'secondaryYieldTM',
  'sumIrrigation',
  'biomassNContent',
  'aboveBiomassNContent',
  'daysWithCrop',
  'sumTotalNUptake',
  'cropHeight',
  'sumETaPerCrop',
  'cropname',
  'id',
  'NStress',
  'WaterStress',
  'HeatStress',
  'OxygenStress',
];


/**
 * @brief Definition of organic constants
 */
var organicConstants = {
    po_UreaMolecularWeight: 0.06006 //[kg mol-1]
  , po_Urea_to_N: 0.46667 //Converts 1 kg urea to 1 kg N
  , po_NH3MolecularWeight: 0.01401 //[kg mol-1]
  , po_NH4MolecularWeight: 0.01401 //[kg mol-1]
  , po_H2OIonConcentration: 1.0
  , po_pKaHNO2: 3.29 // [] pKa value for nitrous acid
  , po_pKaNH3: 6.5 // [] pKa value for ammonium
  , po_SOM_to_C: 0.57 //: 0.58, // [] converts soil organic matter to carbon
  , po_AOM_to_C: 0.45 // [] converts added organic matter to carbon
};

var Climate = {
    tmin: 0
  , tmax: 1
  , tavg: 2
  , globrad: 3
  , wind: 4
  , precip: 5
  , sunhours: 6
  , relhumid: 7
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

