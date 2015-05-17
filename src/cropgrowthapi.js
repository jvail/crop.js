/*
  CropGrowthAPI must be implemented by any crop growth model.

  Function parameters are optional. If not provided by callee return the sum over the index. E.g.
  if 'species' argument is not set (i.e. species === undefined) return sum over all species. 
  Otherwise return the specific species value.

  Example:

  var MyCropGrowth = function (params) {

    var name = 'my crop';

    var myHeightFunction = function (species) {
      
      var height = 0;
      if (species === undefiend) { // return max. height
        for (var i = 0; i < noSpecies; i++)
          height = (heights[i] > height ? heights[i] : height);
      } else {
        height = heights[species];
      }
      return height;
    
    };

    return Object.create(CropGrowthAPI.prototype, {
      name: { value: name },
      height: { value: myHeightFunction }
    });

  };

  TODO: 
   
    - fix and add units
*/

function CropGrowthAPI() {};

CropGrowthAPI.prototype = {

  /*
    parameter:

    day of year                     [#]
    mean daily temperature          [C°]
    maximum daily temperature       [C°]
    minimum daily temperature       [C°]
    global radiation                [MJ m-2]
    sunshine hours                  [h]
    relative humidity               [-]
    wind speed                      [m s-1]
    wind speed height               [m]
    CO2 concentration               [μmol mol-1]
    rainfall                        [mm]
    fraction direct solar radiation [-]
    daylength                       [s]
    extraterrestrial radiation      [MJ m-2]
    veg. period                     [bool]
  */
  step: function (/* parameters */) {},

  name: function (species) { return 'unknown'; },
  isDying: function () { return false; },
  height: function (species) { return 0; },
  kcFactor: function (species) { return 0; },
  leafAreaIndex: function (species) { return 0; },
  numberOfOrgans: function (species) { return 0; },
  soilCoverage: function (species) { return 0; },
  stomataResistance: function (species) { return 0; },
  vernalisationFactor: function (species) { return 0; },
  numberOfSpecies: function () { return 1; },
  rootingDepth: function (species) { return 0; },

  nitrogenStress: function (species) { return 1; },
  heatStress: function (species) { return 1; },
  oxygenStress: function (species) { return 1; },
  waterStress: function (species) { return 1; },

  biomass: function (organ, species) { return 0; },
  growthIncrement: function (organ, species) { return 0; },
  shootBiomass: function (species) { return 0; },
  shootBiomassNitrogenConcentration: function (species) { return 0; },
  rootBiomass: function (species) { return 0; },
  rootNitrogenConcentration: function (species) { return 0; },
  netPrimaryProduction: function (species) { return 0; },
  netPhotosynthesis: function (species) { return 0; },
  grossPhotosynthesis: function (species) { return 0; },

  primaryYield: function (species) { return 0; },
  primaryYieldFreshMatter: function (species) { return 0; },
  primaryYieldNitrogenConcentration: function (species) { return 0; },
  primaryYieldNitrogenContent: function (species) { return 0; },
  primaryYieldCrudeProteinConcentration: function (species) { return 0; },
  secondaryYield: function (species) { return 0; },
  secondaryYieldNitrogenConcentration: function (species) { return 0; },
  secondaryYieldNitrogenContent: function (species) { return 0; },
  residueBiomass: function (useSecondaryYields, species) { return 0; },
  residuesNitrogenConcentration: function (species) { return 0; },
  residuesNitrogenContent: function (species) { return 0; },

  referenceEvapotranspiration: function () { return 0; },
  accumulatedEvapotranspiration: function () { return 0; },
  accumulateEvapotranspiration: function (actualEvapotranspiration) { return 0; },
  remainingEvapotranspiration: function (species) { return 0; },
  transpiration: function (layer, species) { return 0; },
  potentialTranspiration: function (species) { return 0; },
  evaporatedFromIntercept: function () { return 0; },
  netPrecipitation: function () { return 0; },

  nitrogenUptake: function (layer, species) { return 0; },
  potentialNitrogenUptake: function (species) { return 0; },
  accumulatedNitrogenUptake: function (species) { return 0; },

  currentTemperatureSum: function (species) { return 0; },
  developmentalStage: function (species) { return 1; },
  relativeTotalDevelopment: function (species) { return 0; },

  heatSumIrrigationEnd: function () { return 0; },
  heatSumIrrigationStart: function () { return 0; }

};
