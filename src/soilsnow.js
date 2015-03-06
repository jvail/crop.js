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
