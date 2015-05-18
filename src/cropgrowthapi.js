/*
  CropGrowthAPI must be implemented by any crop growth model but only a selection of functions
  may be implemented (depending on the details of the model: e.g. water & N stress) or custom 
  functions may be added.

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
*/

function CropGrowthAPI() {};

CropGrowthAPI.prototype = {

  /*
    Called at each day with parameters:

    step                            [void]  
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

  /* 
    name      [string]
    species   [# or undefiend] 
  */
  name: function (species) { return 'unknown'; },
  
  /* isDying  [bool] */
  isDying: function () { return false; },

  /* 
    height    [m] 
    species   [# or undefiend]
  */
  height: function (species) { return 0; },

  /* 
    kcFactor  [-] 
    species   [# or undefiend]
  */
  kcFactor: function (species) { return 0; },
  
  /* 
    leafAreaIndex  [m2 m-2] 
    species        [# or undefiend]
  */
  leafAreaIndex: function (species) { return 0; },

  /* 
    numberOfOrgans  [#] 
    species         [# or undefiend]
  */
  numberOfOrgans: function (species) { return 0; },
  
  /* 
    soilCoverage    [m2 m-2] 
    species         [# or undefiend]
  */
  soilCoverage: function (species) { return 0; },

  /* 
    stomataResistance [s m-1] 
    species           [# or undefiend]
  */
  stomataResistance: function (species) { return 0; },

  /* numberOfSpecies  [unit] */  
  numberOfSpecies: function () { return 1; },

  /* 
    rootingDepth  [#]              soillayer index 
    species       [# or undefiend]
  */  
  rootingDepth: function (species) { return 0; },

  /* 
    nitrogenStress  [0-1]             1 = no stess 
    species         [# or undefiend]
  */
  nitrogenStress: function (species) { return 1; },

  /* 
    heatStress  [0-1]                 1 = no stess 
    species     [# or undefiend]
  */
  heatStress: function (species) { return 1; },

  /* 
    oxygenStress  [0-1]               1 = no stess 
    species       [# or undefiend]
  */
  oxygenStress: function (species) { return 1; },

  /* 
    waterStress  [0-1]                1 = no stess 
    species      [# or undefiend]
  */
  waterStress: function (species) { return 1; },

  /* 
    biomass   [kg (DM) ha-1]
    organ     [# or undefiend]
    species   [# or undefiend]
  */
  biomass: function (organ, species) { return 0; },
  
  /* 
    growthIncrement   [kg (DM) ha-1]
    organ             [# or undefiend]
    species           [# or undefiend]
  */
  growthIncrement: function (organ, species) { return 0; },
  
  /* 
    shootBiomass  [kg (DM) ha-1]
    species       [# or undefiend]
  */
  shootBiomass: function (species) { return 0; },
  
  /* 
    shootBiomassNitrogenConcentration  [kg (N) kg-1 (DM)]
    species                            [# or undefiend]
  */
  shootBiomassNitrogenConcentration: function (species) { return 0; },

  /* 
    rootBiomass   [kg (DM) ha-1]
    species       [# or undefiend]
  */  
  rootBiomass: function (species) { return 0; },

  /* 
    rootNitrogenConcentration   [kg (N) kg-1 (DM)]
    species                     [# or undefiend]
  */  
  rootNitrogenConcentration: function (species) { return 0; },

  /* 
    netPrimaryProduction   [kg (C) ha-1]
    species                [# or undefiend]
  */  
  netPrimaryProduction: function (species) { return 0; },

  /* 
    netPhotosynthesis   [kg (CH2O) ha-1]
    species             [# or undefiend]
  */  
  netPhotosynthesis: function (species) { return 0; },

  /* 
    grossPhotosynthesis [kg (CH2O) ha-1]
    species             [# or undefiend]
  */  
  grossPhotosynthesis: function (species) { return 0; },

  /* 
    primaryYield  [kg (DM) ha-1]
    species       [# or undefiend]
  */  
  primaryYield: function (species) { return 0; },

  /* 
    primaryYieldFreshMatter  [kg (FM) ha-1]
    species                  [# or undefiend]
  */  
  primaryYieldFreshMatter: function (species) { return 0; },
  
  /* 
    primaryYieldNitrogenConcentration   [kg (N) kg-1 (DM)]
    species                             [# or undefiend]
  */  
  primaryYieldNitrogenConcentration: function (species) { return 0; },
  
  /* 
    primaryYieldNitrogenContent   [kg (N) ha-1]
    species                       [# or undefiend]
  */  
  primaryYieldNitrogenContent: function (species) { return 0; },

  /* 
    primaryYieldCrudeProteinConcentration   [kg (P) kg-1 (DM)]
    species                                 [# or undefiend]
  */  
  primaryYieldCrudeProteinConcentration: function (species) { return 0; },

  /* 
    secondaryYield  [kg (DM) ha-1]
    species         [# or undefiend]
  */
  secondaryYield: function (species) { return 0; },

  /* 
    secondaryYieldNitrogenConcentration   [kg (N) kg-1 (DM)]
    species                               [# or undefiend]
  */  
  secondaryYieldNitrogenConcentration: function (species) { return 0; },

  /* 
    secondaryYieldNitrogenContent   [kg (N) ha-1]
    species                         [# or undefiend]
  */  
  secondaryYieldNitrogenContent: function (species) { return 0; },

  /* 
    residueBiomass      [kg (DM) ha-1]
    useSecondaryYields  [bool]
    species             [# or undefiend]
  */ 
  residueBiomass: function (useSecondaryYields, species) { return 0; },

  /* 
    residuesNitrogenConcentration   [kg (N) kg-1 (DM)]
    species                         [# or undefiend]
  */  
  residuesNitrogenConcentration: function (species) { return 0; },

  /* 
    residuesNitrogenContent   [kg (N) ha-1]
    species                   [# or undefiend]
  */  
  residuesNitrogenContent: function (species) { return 0; },

  /* 
    referenceEvapotranspiration [mm]
  */  
  referenceEvapotranspiration: function () { return 0; },

  /* 
    accumulatedEvapotranspiration [mm]
  */  
  accumulatedEvapotranspiration: function () { return 0; },

  /* 
    accumulateEvapotranspiration [mm]
  */  
  accumulateEvapotranspiration: function (actualEvapotranspiration) { return 0; },

  /* 
    remainingEvapotranspiration [mm]
  */  
  remainingEvapotranspiration: function (species) { return 0; },

  /* 
    transpiration [mm]
  */  
  transpiration: function (layer, species) { return 0; },

  /* 
    potentialTranspiration [mm]
  */  
  potentialTranspiration: function (species) { return 0; },

  /* 
    evaporatedFromIntercept [mm]
  */  
  evaporatedFromIntercept: function () { return 0; },

  /* 
    netPrecipitation [mm]
  */  
  netPrecipitation: function () { return 0; },

  /* 
    nitrogenUptake [kg (N) m-2]
    layer          [unit or undefiend]
    species        [unit or undefiend]
  */  
  nitrogenUptake: function (layer, species) { return 0; },

  /* 
    potentialNitrogenUptake [kg (N) m-2]
    species                 [unit or undefiend]
  */  
  potentialNitrogenUptake: function (species) { return 0; },
  
  /* 
    accumulatedNitrogenUptake [kg (N) m-2]
    species                   [unit or undefiend]
  */  
  accumulatedNitrogenUptake: function (species) { return 0; },

  /* 
    currentTemperatureSum [d °C]
    species               [unit or undefiend]
  */  
  currentTemperatureSum: function (species) { return 0; },

  /* 
    developmentalStage [#]
    species            [unit or undefiend]
  */  
  developmentalStage: function (species) { return 1; },

  /* 
    relativeTotalDevelopment  [-]
    species                   [unit or undefiend]
  */  
  relativeTotalDevelopment: function (species) { return 0; },

  /* heatSumIrrigationEnd [°C] */  
  heatSumIrrigationEnd: function () { return 0; },

  /* heatSumIrrigationStart [°C] */  
  heatSumIrrigationStart: function () { return 0; }

};
