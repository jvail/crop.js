
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

          vm_EReducer_1 = get_EReducer_1(i_Layer, vc_PercentageSoilCoverage,
      vm_PotentialEvapotranspiration);


          if (i_Layer >= pm_MaximumEvaporationImpactDepth) {
            // layer is too deep for evaporation
            vm_EReducer_2 = 0.0;
          } else {
            // 2nd factor to reduce actual evapotranspiration by
            // MaximumEvaporationImpactDepth and EvaporationZeta
            vm_EReducer_2 = get_DeprivationFactor(i_Layer + 1, pm_MaximumEvaporationImpactDepth,
          pm_EvaporationZeta, vm_LayerThickness[i_Layer]);
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
              vm_Evaporation[i_Layer] = ((1.0 - vc_PercentageSoilCoverage) * vm_EReducer)
                  * vm_PotentialEvapotranspiration;
            } else {
              if (vc_PercentageSoilCoverage >= 1.0) {
                vm_Evaporation[i_Layer] = 0.0;
              }
            }

            if (vm_SnowDepth > 0.0)
              vm_Evaporation[i_Layer] = 0.0;

            // Transpiration is derived from ET0; Soil coverage and Kc factors
            // already considered in crop part!
            vm_Transpiration[i_Layer] = monica.cropGrowth().get_Transpiration(i_Layer);

            // Transpiration is capped in case potential ET after surface
            // and interception evaporation has occurred on same day
            if (vm_EvaporationFromSurface) {
              vm_Transpiration[i_Layer] = vc_PercentageSoilCoverage * vm_EReducer * vm_PotentialEvapotranspiration;
            }

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
          if (vm_SoilMoisture[i_Layer] < 0.01) {
            vm_SoilMoisture[i_Layer] = 0.01;
          }

          vm_ActualTranspiration += vm_Transpiration[i_Layer];
          vm_ActualEvaporation += vm_Evaporation[i_Layer];
        } // for
      } // vm_PotentialEvapotranspiration > 0
    } // vm_PotentialEvapotranspiration > 0.0
    vm_ActualEvapotranspiration = vm_ActualTranspiration + vm_ActualEvaporation + vc_EvaporatedFromIntercept + vm_EvaporatedFromSurface;

    if (crop) {
      crop.accumulateEvapotranspiration(vm_ActualEvapotranspiration);
    }
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
