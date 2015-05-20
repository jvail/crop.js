/*
  CropGrowthAPI must be implemented by any crop growth model but only a selection of functions
  may be implemented (depending on the details of the model: e.g. water & N stress) or custom 
  functions may be added.

  Function parameters are optional. If not provided by callee return the sum over the index. E.g.
  if 'speciesIdx' argument is not set (i.e. speciesIdx === undefined) return sum over all species. 
  Otherwise return the specific species value.

  Example:

  var MyCropGrowth = function (params) {

    var name = 'my crop';

    var myHeightFunction = function (speciesIdx) {
      
      var height = 0;
      if (speciesIdx === undefined) { // return max. height
        for (var i = 0; i < noOfspecies; i++)
          height = (heights[i] > height ? heights[i] : height);
      } else {
        height = heights[speciesIdx];
      }
      return height;
    
    };

    return Object.create(CropGrowthAPI.prototype, {
      name: { value: function () { return name; } },
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
    name        [string]
    speciesIdx  [# or undefined] 
  */
  name: function (speciesIdx) { return 'unknown'; },

  /* 
    height      [m] 
    speciesIdx  [# or undefined]
  */
  height: function (speciesIdx) { return 0; },

  /* 
    kcFactor    [-] 
    speciesIdx  [# or undefined]
  */
  kcFactor: function (speciesIdx) { return 0; },
  
  /* 
    leafAreaIndex  [m2 m-2] 
    speciesIdx     [# or undefined]
  */
  leafAreaIndex: function (speciesIdx) { return 0; },

  /* 
    numberOfOrgans  [#] 
    speciesIdx      [# or undefined]
  */
  numberOfOrgans: function (speciesIdx) { return 0; },
  
  /* 
    soilCoverage    [m2 m-2] 
    speciesIdx      [# or undefined]
  */
  soilCoverage: function (speciesIdx) { return 0; },

  /* 
    stomataResistance [s m-1] 
    speciesIdx        [# or undefined]
  */
  stomataResistance: function (speciesIdx) { return 0; },

  /* numberOfSpecies  [#] */  
  numberOfSpecies: function () { return 1; },

  /* 
    rootingDepth  [#]              soillayer index 
    speciesIdx    [# or undefined]
  */  
  rootingDepth: function (speciesIdx) { return 0; },

  /* 
    nitrogenStress  [0-1]             1 = no stess 
    speciesIdx      [# or undefined]
  */
  nitrogenStress: function (speciesIdx) { return 1; },

  /* 
    heatStress  [0-1]                 1 = no stess 
    speciesIdx  [# or undefined]
  */
  heatStress: function (speciesIdx) { return 1; },

  /* 
    oxygenStress  [0-1]               1 = no stess 
    speciesIdx    [# or undefined]
  */
  oxygenStress: function (speciesIdx) { return 1; },

  /* 
    waterStress  [0-1]                1 = no stess 
    speciesIdx   [# or undefined]
  */
  waterStress: function (speciesIdx) { return 1; },

  /* 
    biomass     [kg (DM) ha-1]
    organIdx    [# or undefined]
    speciesIdx  [# or undefined]
  */
  biomass: function (organIdx, speciesIdx) { return 0; },
  
  /* 
    growthIncrement   [kg (DM) ha-1]
    organIdx          [# or undefined]
    speciesIdx        [# or undefined]
  */
  growthIncrement: function (organIdx, speciesIdx) { return 0; },
  
  /* 
    shootBiomass  [kg (DM) ha-1]
    speciesIdx    [# or undefined]
  */
  shootBiomass: function (speciesIdx) { return 0; },
  
  /* 
    shootBiomassNitrogenConcentration  [kg (N) kg-1 (DM)]
    speciesIdx                         [# or undefined]
  */
  shootBiomassNitrogenConcentration: function (speciesIdx) { return 0; },

  /* 
    rootBiomass   [kg (DM) ha-1]
    speciesIdx    [# or undefined]
  */  
  rootBiomass: function (speciesIdx) { return 0; },

  /* 
    rootNitrogenConcentration   [kg (N) kg-1 (DM)]
    speciesIdx                  [# or undefined]
  */  
  rootNitrogenConcentration: function (speciesIdx) { return 0; },

  /* 
    netPrimaryProduction   [kg (C) ha-1]
    speciesIdx             [# or undefined]
  */  
  netPrimaryProduction: function (speciesIdx) { return 0; },

  /* 
    netPhotosynthate   [kg (CH2O) ha-1]
    speciesIdx         [# or undefined]
  */  
  netPhotosynthate: function (speciesIdx) { return 0; },

  /* 
    grossPhotosynthate  [kg (CH2O) ha-1]
    speciesIdx          [# or undefined]
  */  
  grossPhotosynthate: function (speciesIdx) { return 0; },

  /* 
    primaryYield  [kg (DM) ha-1]
    speciesIdx    [# or undefined]
  */  
  primaryYield: function (speciesIdx) { return 0; },

  /* 
    primaryYieldFreshMatter  [kg (FM) ha-1]
    speciesIdx               [# or undefined]
  */  
  primaryYieldFreshMatter: function (speciesIdx) { return 0; },
  
  /* 
    primaryYieldNitrogenConcentration   [kg (N) kg-1 (DM)]
    speciesIdx                          [# or undefined]
  */  
  primaryYieldNitrogenConcentration: function (speciesIdx) { return 0; },
  
  /* 
    primaryYieldNitrogenContent   [kg (N) ha-1]
    speciesIdx                    [# or undefined]
  */  
  primaryYieldNitrogenContent: function (speciesIdx) { return 0; },

  /* 
    primaryYieldCrudeProteinConcentration   [kg (P) kg-1 (DM)]
    speciesIdx                              [# or undefined]
  */  
  primaryYieldCrudeProteinConcentration: function (speciesIdx) { return 0; },

  /* 
    secondaryYield  [kg (DM) ha-1]
    speciesIdx      [# or undefined]
  */
  secondaryYield: function (speciesIdx) { return 0; },

  /* 
    secondaryYieldNitrogenConcentration   [kg (N) kg-1 (DM)]
    speciesIdx                            [# or undefined]
  */  
  secondaryYieldNitrogenConcentration: function (speciesIdx) { return 0; },

  /* 
    secondaryYieldNitrogenContent   [kg (N) ha-1]
    speciesIdx                      [# or undefined]
  */  
  secondaryYieldNitrogenContent: function (speciesIdx) { return 0; },

  /* 
    residueBiomass      [kg (DM) ha-1]
    useSecondaryYields  [bool]
    speciesIdx          [# or undefined]
  */ 
  residueBiomass: function (useSecondaryYields, speciesIdx) { return 0; },

  /* 
    residuesNitrogenConcentration   [kg (N) kg-1 (DM)]
    speciesIdx                      [# or undefined]
  */  
  residuesNitrogenConcentration: function (speciesIdx) { return 0; },

  /* 
    residuesNitrogenContent   [kg (N) ha-1]
    speciesIdx                [# or undefined]
  */  
  residuesNitrogenContent: function (speciesIdx) { return 0; },

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
    speciesIdx                  [# or undefined]
  */  
  remainingEvapotranspiration: function (speciesIdx) { return 0; },

  /* 
    transpiration   [mm]
    layerIdx        [# or undefined]
    speciesIdx      [# or undefined]
  */  
  transpiration: function (layerIdx, speciesIdx) { return 0; },

  /* 
    potentialTranspiration [mm]
    speciesIdx             [# or undefined]
  */  
  potentialTranspiration: function (speciesIdx) { return 0; },

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
    layerIdx       [# or undefined]
    speciesIdx     [# or undefined]
  */  
  nitrogenUptake: function (layerIdx, speciesIdx) { return 0; },

  /* 
    potentialNitrogenUptake [kg (N) m-2]
    speciesIdx              [# or undefined]
  */  
  potentialNitrogenUptake: function (speciesIdx) { return 0; },
  
  /* 
    accumulatedNitrogenUptake [kg (N) m-2]
    speciesIdx                [# or undefined]
  */  
  accumulatedNitrogenUptake: function (speciesIdx) { return 0; },

  /* 
    currentTemperatureSum [d °C]
    speciesIdx            [# or undefined]
  */  
  currentTemperatureSum: function (speciesIdx) { return 0; },

  /* 
    developmentalStage [#]
    speciesIdx         [# or undefined]
  */  
  developmentalStage: function (speciesIdx) { return 1; },

  /* 
    relativeTotalDevelopment  [-]
    speciesIdx                [# or undefined]
  */  
  relativeTotalDevelopment: function (speciesIdx) { return 0; },

  /* heatSumIrrigationEnd [°C] */  
  heatSumIrrigationEnd: function () { return 0; },

  /* heatSumIrrigationStart [°C] */  
  heatSumIrrigationStart: function () { return 0; },

  /* array of AOM_Properties, per organic soil layer */
  senescencedTissue: function () { return []; }

};
