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
      if (species === undefined) { // return max. height
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
    - rename .."biomass".. in dry or organic matter
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
    species   [# or undefined] 
  */
  name: function (species) { return 'unknown'; },
  
  /* isDying  [bool] */
  isDying: function () { return false; },

  /* 
    height    [m] 
    species   [# or undefined]
  */
  height: function (species) { return 0; },

  /* 
    kcFactor  [-] 
    species   [# or undefined]
  */
  kcFactor: function (species) { return 0; },
  
  /* 
    leafAreaIndex  [m2 m-2] 
    species        [# or undefined]
  */
  leafAreaIndex: function (species) { return 0; },

  /* 
    numberOfOrgans  [#] 
    species         [# or undefined]
  */
  numberOfOrgans: function (species) { return 0; },
  
  /* 
    soilCoverage    [m2 m-2] 
    species         [# or undefined]
  */
  soilCoverage: function (species) { return 0; },

  /* 
    stomataResistance [s m-1] 
    species           [# or undefined]
  */
  stomataResistance: function (species) { return 0; },

  /* numberOfSpecies  [#] */  
  numberOfSpecies: function () { return 1; },

  /* 
    rootingDepth  [#]              soillayer index 
    species       [# or undefined]
  */  
  rootingDepth: function (species) { return 0; },

  /* 
    nitrogenStress  [0-1]             1 = no stess 
    species         [# or undefined]
  */
  nitrogenStress: function (species) { return 1; },

  /* 
    heatStress  [0-1]                 1 = no stess 
    species     [# or undefined]
  */
  heatStress: function (species) { return 1; },

  /* 
    oxygenStress  [0-1]               1 = no stess 
    species       [# or undefined]
  */
  oxygenStress: function (species) { return 1; },

  /* 
    waterStress  [0-1]                1 = no stess 
    species      [# or undefined]
  */
  waterStress: function (species) { return 1; },

  /* 
    biomass   [kg (DM) ha-1]
    organ     [# or undefined]
    species   [# or undefined]
  */
  biomass: function (organ, species) { return 0; },
  
  /* 
    growthIncrement   [kg (DM) ha-1]
    organ             [# or undefined]
    species           [# or undefined]
  */
  growthIncrement: function (organ, species) { return 0; },
  
  /* 
    shootBiomass  [kg (DM) ha-1]
    species       [# or undefined]
  */
  shootBiomass: function (species) { return 0; },
  
  /* 
    shootBiomassNitrogenConcentration  [kg (N) kg-1 (DM)]
    species                            [# or undefined]
  */
  shootBiomassNitrogenConcentration: function (species) { return 0; },

  /* 
    rootBiomass   [kg (DM) ha-1]
    species       [# or undefined]
  */  
  rootBiomass: function (species) { return 0; },

  /* 
    rootNitrogenConcentration   [kg (N) kg-1 (DM)]
    species                     [# or undefined]
  */  
  rootNitrogenConcentration: function (species) { return 0; },

  /* 
    netPrimaryProduction   [kg (C) ha-1]
    species                [# or undefined]
  */  
  netPrimaryProduction: function (species) { return 0; },

  /* 
    netPhotosynthate   [kg (CH2O) ha-1]
    species             [# or undefined]
  */  
  netPhotosynthate: function (species) { return 0; },

  /* 
    grossPhotosynthate [kg (CH2O) ha-1]
    species             [# or undefined]
  */  
  grossPhotosynthate: function (species) { return 0; },

  /* 
    primaryYield  [kg (DM) ha-1]
    species       [# or undefined]
  */  
  primaryYield: function (species) { return 0; },

  /* 
    primaryYieldFreshMatter  [kg (FM) ha-1]
    species                  [# or undefined]
  */  
  primaryYieldFreshMatter: function (species) { return 0; },
  
  /* 
    primaryYieldNitrogenConcentration   [kg (N) kg-1 (DM)]
    species                             [# or undefined]
  */  
  primaryYieldNitrogenConcentration: function (species) { return 0; },
  
  /* 
    primaryYieldNitrogenContent   [kg (N) ha-1]
    species                       [# or undefined]
  */  
  primaryYieldNitrogenContent: function (species) { return 0; },

  /* 
    primaryYieldCrudeProteinConcentration   [kg (P) kg-1 (DM)]
    species                                 [# or undefined]
  */  
  primaryYieldCrudeProteinConcentration: function (species) { return 0; },

  /* 
    secondaryYield  [kg (DM) ha-1]
    species         [# or undefined]
  */
  secondaryYield: function (species) { return 0; },

  /* 
    secondaryYieldNitrogenConcentration   [kg (N) kg-1 (DM)]
    species                               [# or undefined]
  */  
  secondaryYieldNitrogenConcentration: function (species) { return 0; },

  /* 
    secondaryYieldNitrogenContent   [kg (N) ha-1]
    species                         [# or undefined]
  */  
  secondaryYieldNitrogenContent: function (species) { return 0; },

  /* 
    residueBiomass      [kg (DM) ha-1]
    useSecondaryYields  [bool]
    species             [# or undefined]
  */ 
  residueBiomass: function (useSecondaryYields, species) { return 0; },

  /* 
    residuesNitrogenConcentration   [kg (N) kg-1 (DM)]
    species                         [# or undefined]
  */  
  residuesNitrogenConcentration: function (species) { return 0; },

  /* 
    residuesNitrogenContent   [kg (N) ha-1]
    species                   [# or undefined]
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
    layer          [# or undefined]
    species        [# or undefined]
  */  
  nitrogenUptake: function (layer, species) { return 0; },

  /* 
    potentialNitrogenUptake [kg (N) m-2]
    species                 [# or undefined]
  */  
  potentialNitrogenUptake: function (species) { return 0; },
  
  /* 
    accumulatedNitrogenUptake [kg (N) m-2]
    species                   [# or undefined]
  */  
  accumulatedNitrogenUptake: function (species) { return 0; },

  /* 
    currentTemperatureSum [d °C]
    species               [# or undefined]
  */  
  currentTemperatureSum: function (species) { return 0; },

  /* 
    developmentalStage [#]
    species            [# or undefined]
  */  
  developmentalStage: function (species) { return 1; },

  /* 
    relativeTotalDevelopment  [-]
    species                   [# or undefined]
  */  
  relativeTotalDevelopment: function (species) { return 0; },

  /* heatSumIrrigationEnd [°C] */  
  heatSumIrrigationEnd: function () { return 0; },

  /* heatSumIrrigationStart [°C] */  
  heatSumIrrigationStart: function () { return 0; },

  /* array of AOM_Properties, per organic soil layer */
  senescencedTissue: function () { return null; }

};
