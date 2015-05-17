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

CropGrowthAPI.prototype.step = function () {};
CropGrowthAPI.prototype.isDying = function () {};

CropGrowthAPI.prototype.name = function (species) {};
CropGrowthAPI.prototype.height = function (species) {};
CropGrowthAPI.prototype.kcFactor = function (species) {};
CropGrowthAPI.prototype.leafAreaIndex = function (species) {};
CropGrowthAPI.prototype.numberOfOrgans = function (species) {};
CropGrowthAPI.prototype.soilCoverage = function (species) {};
CropGrowthAPI.prototype.stomataResistance = function (species) {};
CropGrowthAPI.prototype.vernalisationFactor = function (species) {};
CropGrowthAPI.prototype.numberOfSpecies = function () {};
CropGrowthAPI.prototype.rootingDepth = function (species) {};

CropGrowthAPI.prototype.nitrogenStress = function (species) {};
CropGrowthAPI.prototype.heatStress = function (species) {};
CropGrowthAPI.prototype.oxygenStress = function (species) {};
CropGrowthAPI.prototype.waterStress = function (species) {};

CropGrowthAPI.prototype.biomass = function (organ, species) {};
CropGrowthAPI.prototype.growthIncrement = function (organ, species) {};
CropGrowthAPI.prototype.shootBiomass = function (species) {};
CropGrowthAPI.prototype.shootBiomassNitrogenConcentration = function (species) {};
CropGrowthAPI.prototype.rootBiomass = function (species) {};
CropGrowthAPI.prototype.rootNitrogenConcentration = function (species) {};
CropGrowthAPI.prototype.netPrimaryProduction = function (species) {};
CropGrowthAPI.prototype.netPhotosynthesis = function (species) {};
CropGrowthAPI.prototype.grossPhotosynthesis = function (species) {};

CropGrowthAPI.prototype.primaryYield = function (species) {};
CropGrowthAPI.prototype.primaryYieldFreshMatter = function (species) {};
CropGrowthAPI.prototype.primaryYieldNitrogenConcentration = function (species) {};
CropGrowthAPI.prototype.primaryYieldNitrogenContent = function (species) {};
CropGrowthAPI.prototype.primaryYieldCrudeProteinConcentration = function (species) {};
CropGrowthAPI.prototype.secondaryYield = function (species) {};
CropGrowthAPI.prototype.secondaryYieldNitrogenConcentration = function (species) {};
CropGrowthAPI.prototype.secondaryYieldNitrogenContent = function (species) {};
CropGrowthAPI.prototype.residueBiomass = function (useSecondaryYields, species) {};
CropGrowthAPI.prototype.residuesNitrogenConcentration = function (species) {};
CropGrowthAPI.prototype.residuesNitrogenContent = function (species) {};

CropGrowthAPI.prototype.referenceEvapotranspiration = function () {};
CropGrowthAPI.prototype.accumulatedEvapotranspiration = function () {};
CropGrowthAPI.prototype.accumulateEvapotranspiration = function (actualEvapotranspiration) {};
CropGrowthAPI.prototype.remainingEvapotranspiration = function (species) {};
CropGrowthAPI.prototype.transpiration = function (layer, species) {};
CropGrowthAPI.prototype.potentialTranspiration = function (species) {};
CropGrowthAPI.prototype.evaporatedFromIntercept = function () {};
CropGrowthAPI.prototype.netPrecipitation = function () {};

CropGrowthAPI.prototype.nitrogenUptake = function (layer, species) {};
CropGrowthAPI.prototype.potentialNitrogenUptake = function (species) {};
CropGrowthAPI.prototype.accumulatedNitrogenUptake = function (species) {};

CropGrowthAPI.prototype.currentTemperatureSum = function (species) {};
CropGrowthAPI.prototype.developmentalStage = function (species) {};
CropGrowthAPI.prototype.relativeTotalDevelopment = function (species) {};

CropGrowthAPI.prototype.heatSumIrrigationEnd = function () {};
CropGrowthAPI.prototype.heatSumIrrigationStart = function () {};
