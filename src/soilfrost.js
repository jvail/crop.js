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

    if (DEBUG) debug(arguments);

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

    // in case of sensitivity analysis, this parameter would not be undefined
    // so return fix value instead of calculating mean bulk density
    // if (centralParameterProvider.sensitivityAnalysisParameters.p_MeanBulkDensity != UNDEFINED) {
    //   return centralParameterProvider.sensitivityAnalysisParameters.p_MeanBulkDensity;
    // }

    var vs_number_of_layers = soilColumn.vs_NumberOfLayers();
    var bulk_density_accu = 0.0;
    for (var i_Layer = 0; i_Layer < vs_number_of_layers; i_Layer++) {
      bulk_density_accu += soilColumn[i_Layer].vs_SoilBulkDensity();
    }
    return (bulk_density_accu / vs_number_of_layers / 1000.0); // [Mg m-3]
  };

  var getMeanFieldCapacity = function () {

    // in case of sensitivity analysis, this parameter would not be undefined
    // so return fix value instead of calculating mean bulk density
    // if (centralParameterProvider.sensitivityAnalysisParameters.p_MeanFieldCapacity != UNDEFINED) {
    //   return centralParameterProvider.sensitivityAnalysisParameters.p_MeanFieldCapacity;
    // }

    var vs_number_of_layers = soilColumn.vs_NumberOfLayers();
    var mean_field_capacity_accu = 0.0;
    for (var i_Layer = 0; i_Layer < vs_number_of_layers; i_Layer++) {
      mean_field_capacity_accu += soilColumn[i_Layer].get_FieldCapacity();
    }
    return (mean_field_capacity_accu / vs_number_of_layers);
  };

  var calcSii = function (mean_field_capacity) {

    if (DEBUG) debug(arguments);

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

    if (DEBUG) debug(arguments);
    
    // in case of sensitivity analysis, this parameter would not be undefined
    // so return fix value instead of calculating heat conductivity
    // if (centralParameterProvider.sensitivityAnalysisParameters.p_HeatConductivityFrozen != UNDEFINED) {
    //   return centralParameterProvider.sensitivityAnalysisParameters.p_HeatConductivityFrozen;
    // }

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

    if (DEBUG) debug(arguments);

    // in case of sensitivity analysis, this parameter would not be undefined
    // so return fix value instead of calculating heat conductivity
    // if (centralParameterProvider.sensitivityAnalysisParameters.p_HeatConductivityUnfrozen != UNDEFINED) {
    //   return centralParameterProvider.sensitivityAnalysisParameters.p_HeatConductivityUnfrozen;
    // }

    var cond_unfrozen = ((3.0 * mean_bulk_density - 1.7) * 0.001) / (1.0 + (11.5 - 5.0
          * mean_bulk_density) * exp((-50.0) * pow(((mean_field_capacity * 100.0) / mean_bulk_density), 1.5)))
          * pt_TimeStep * // [cal cm-1 K-1 s-1]
          4.184 * // [J cm-1 K-1 s-1]
          100.0; // [W m-1 K-1]

    return cond_unfrozen;
  };

  var calcThawDepth = function (temperature_under_snow, heat_conductivity_unfrozen, mean_field_capacity) {

    if (DEBUG) debug(arguments);

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

    if (DEBUG) debug(arguments);

    var frost_depth=0.0;

    // Heat released/absorbed on freezing/thawing
    var latent_heat = 1000.0 * (mean_field_capacity * 100.0) / 100.0 * 0.335;

    // Summation of number of days with frost
    if (vm_FrostDepth > 0.0) {
      vm_FrostDays++;
    }

    // Ratio of energy sum from subsoil to vm_LatentHeat
    var latent_heat_transfer = 0.3 * vm_FrostDays / latent_heat;

    // in case of sensitivity analysis, this parameter would not be undefined
    // so return fix value instead of calculating heat conductivity
    // if (centralParameterProvider.sensitivityAnalysisParameters.p_LatentHeatTransfer != UNDEFINED) {
    //   latent_heat_transfer = centralParameterProvider.sensitivityAnalysisParameters.p_LatentHeatTransfer;
    // }

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

    if (DEBUG) debug(arguments);

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
