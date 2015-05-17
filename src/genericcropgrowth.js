/*
  JS Changes:
    - applyCutting(): reset LAI
    - get_PrimaryCropYield(): bestimme yield auch nach cutting
    - get_FreshPrimaryCropYield(): bestimme yield auch nach cutting


  TODO: 
   
    - dont return per ha values 
*/

var GenericCropGrowth = function (sc, gps, cps, stps, cpp) {

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
      vc_TimeUnderAnoxia += toInt(vc_TimeStep);
      if (vc_TimeUnderAnoxia > 4)
        vc_TimeUnderAnoxia = 4;
      if (vc_AirFilledPoreVolume < 0.0)
        vc_AirFilledPoreVolume = 0.0;
      vc_MaxOxygenDeficit = vc_AirFilledPoreVolume / d_CriticalOxygenContent;
      // JS! c++ : double (int / int) -> js toInt(double / double) !! took hours to debug!
      vc_OxygenDeficit = 1.0 - toInt(vc_TimeUnderAnoxia / 4) * (1.0 - vc_MaxOxygenDeficit);
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
    vc_RootingDepth = toInt(floor(0.5 + (vc_RootingDepth_m / vs_LayerThickness))); // []

    if (vc_RootingDepth > vs_NumberOfLayers) {
      vc_RootingDepth = vs_NumberOfLayers;
    }

    vc_RootingZone = toInt(floor(0.5 + ((1.3 * vc_RootingDepth_m) / vs_LayerThickness))); // []

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
          * (1.0 - toInt((i_Layer - vc_RootingDepth) / (vc_RootingZone - vc_RootingDepth))); // JS! int division
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
    vc_RootingZone = toInt(vc_RootingZone);
    vc_GroundwaterTable = toInt(vc_GroundwaterTable);


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

      var vm_GroundwaterDistance = toInt(vc_GroundwaterTable - vc_RootingDepth); // JS! just in case ... added int()
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
    vc_RootingZone = toInt(vc_RootingZone);
    vc_GroundwaterTable = toInt(vc_GroundwaterTable);


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

    var cropYield = 0;
    for (var i = 0, is = v.length; i < is; i++)
      cropYield += bmv[v[i].organId - 1] * (v[i].yieldPercentage);
    return cropYield;
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

  var get_RootBiomass = function () {
    return vc_RootBiomass;
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

  var get_GrossPhotosynthesis = function () {
    return vc_GrossPhotosynthesis;
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

  var get_ActNUptake = function (layer) {
    if (layer === undefined)
      return vc_TotalNUptake;
    else
      return get_NUptakeFromLayer(layer)
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

  var totalBiomass = function (organ) { 

    if (organ !== undefined)
      return get_OrganBiomass(organ);

    return vc_TotalBiomass; 
  };

  var get_numberOfSpecies = function () {
    return 1;
  };

  return Object.create(CropGrowthAPI.prototype, {
    step: { value: calculateCropGrowthStep },
    isDying: { value: isDying },
    name: { value: get_CropName },
    height: { value: get_CropHeight },
    kcFactor: { value: get_KcFactor },
    leafAreaIndex: { value: get_LeafAreaIndex },
    numberOfOrgans: { value: get_NumberOfOrgans },
    soilCoverage: { value: get_SoilCoverage },
    stomataResistance: { value: get_StomataResistance },
    vernalisationFactor: { value: get_VernalisationFactor },
    numberOfSpecies: { value: get_numberOfSpecies },
    rootingDepth: { value: get_RootingDepth },
    nitrogenStress: { value: get_CropNRedux },
    heatStress: { value: get_HeatStressRedux },
    oxygenStress: { value: get_OxygenDeficit },
    waterStress: { value: get_TranspirationDeficit },
    biomass: { value: totalBiomass },
    growthIncrement: { value: get_OrganGrowthIncrement },
    shootBiomass: { value: get_AbovegroundBiomass },
    shootBiomassNitrogenConcentration: { value: get_AbovegroundBiomassNConcentration },
    rootBiomass: { value: get_RootBiomass },
    rootNitrogenConcentration: { value: get_RootNConcentration },
    netPrimaryProduction: { value: get_NetPrimaryProduction },
    netPhotosynthesis: { value: get_NetPhotosynthesis },
    grossPhotosynthesis: { value: get_GrossPhotosynthesis },
    primaryYield: { value: get_PrimaryCropYield },
    primaryYieldFreshMatter: { value: get_FreshPrimaryCropYield },
    primaryYieldNitrogenConcentration: { value: get_PrimaryYieldNConcentration },
    primaryYieldNitrogenContent: { value: get_PrimaryYieldNContent },
    primaryYieldCrudeProteinConcentration: { value: get_RawProteinConcentration },
    secondaryYield: { value: get_SecondaryCropYield },
    secondaryYieldNitrogenConcentration: { value: get_ResiduesNConcentration },
    secondaryYieldNitrogenContent: { value: get_SecondaryYieldNContent },
    residueBiomass: { value: get_ResidueBiomass },
    residuesNitrogenConcentration: { value: get_ResiduesNConcentration },
    residuesNitrogenContent: { value: get_ResiduesNContent },
    referenceEvapotranspiration: { value: get_ReferenceEvapotranspiration },
    accumulatedEvapotranspiration: { value: get_AccumulatedETa },
    accumulateEvapotranspiration: { value: accumulateEvapotranspiration },
    remainingEvapotranspiration: { value: get_RemainingEvapotranspiration },
    transpiration: { value: get_Transpiration },
    potentialTranspiration: { value: get_PotentialTranspiration },
    evaporatedFromIntercept: { value: get_EvaporatedFromIntercept },
    netPrecipitation: { value: get_NetPrecipitation },
    nitrogenUptake: { value: get_ActNUptake },
    potentialNitrogenUptake: { value: get_PotNUptake },
    accumulatedNitrogenUptake: { value: get_SumTotalNUptake },
    currentTemperatureSum: { value: get_CurrentTemperatureSum },
    developmentalStage: { value: get_DevelopmentalStage },
    relativeTotalDevelopment: { value: get_RelativeTotalDevelopment },
    heatSumIrrigationEnd: { value: get_HeatSumIrrigationEnd },
    heatSumIrrigationStart: { value: get_HeatSumIrrigationStart }
  });


  // return {
  //     step: calculateCropGrowthStep
  //   , accumulateEvapotranspiration: accumulateEvapotranspiration
  //   , isDying: isDying
  //   , totalBiomass: totalBiomass
  //   , getEffectiveRootingDepth: getEffectiveRootingDepth
  //   , get_AbovegroundBiomass: get_AbovegroundBiomass
  //   , get_AbovegroundBiomassNConcentration: get_AbovegroundBiomassNConcentration
  //   , get_AbovegroundBiomassNContent: get_AbovegroundBiomassNContent
  //   , get_AccumulatedETa: get_AccumulatedETa
  //   , get_ActNUptake: get_ActNUptake
  //   , get_ActualTranspiration: get_ActualTranspiration
  //   , get_Assimilates: get_Assimilates
  //   , get_AssimilationRate: get_AssimilationRate
  //   , get_AutotrophicRespiration: get_AutotrophicRespiration
  //   , get_CriticalNConcentration: get_CriticalNConcentration
  //   , get_CropHeight: get_CropHeight
  //   , get_CropNRedux: get_CropNRedux
  //   , get_CropName: get_CropName
  //   , get_CurrentTemperatureSum: get_CurrentTemperatureSum
  //   , get_DaylengthFactor: get_DaylengthFactor
  //   , get_DevelopmentalStage: get_DevelopmentalStage
  //   , get_EvaporatedFromIntercept: get_EvaporatedFromIntercept
  //   , get_FreshPrimaryCropYield: get_FreshPrimaryCropYield
  //   , get_FreshSecondaryCropYield: get_FreshSecondaryCropYield
  //   , get_GrossPhotosynthesisHaRate: get_GrossPhotosynthesisHaRate
  //   , get_GrossPhotosynthesisRate: get_GrossPhotosynthesisRate
  //   , get_GrossPrimaryProduction: get_GrossPrimaryProduction
  //   , get_GrowthRespirationAS: get_GrowthRespirationAS
  //   , get_HeatStressRedux: get_HeatStressRedux
  //   , get_HeatSumIrrigationEnd: get_HeatSumIrrigationEnd
  //   , get_HeatSumIrrigationStart: get_HeatSumIrrigationStart
  //   , get_KcFactor: get_KcFactor
  //   , get_LeafAreaIndex: get_LeafAreaIndex
  //   , get_MaintenanceRespirationAS: get_MaintenanceRespirationAS
  //   , get_NUptakeFromLayer: get_NUptakeFromLayer
  //   , get_NetMaintenanceRespiration: get_NetMaintenanceRespiration
  //   , get_NetPhotosynthesis: get_NetPhotosynthesis
  //   , get_NetPrecipitation: get_NetPrecipitation
  //   , get_NetPrimaryProduction: get_NetPrimaryProduction
  //   , get_NumberOfOrgans: get_NumberOfOrgans
  //   , get_OrganBiomass: get_OrganBiomass
  //   , get_OrganGrowthIncrement: get_OrganGrowthIncrement
  //   , get_OrganSpecificNPP: get_OrganSpecificNPP
  //   , get_OrganSpecificTotalRespired: get_OrganSpecificTotalRespired
  //   , get_OxygenDeficit: get_OxygenDeficit
  //   , get_PotNUptake: get_PotNUptake
  //   , get_PotentialTranspiration: get_PotentialTranspiration
  //   , get_PrimaryCropYield: get_PrimaryCropYield
  //   , get_PrimaryYieldNConcentration: get_PrimaryYieldNConcentration
  //   , get_PrimaryYieldNContent: get_PrimaryYieldNContent
  //   , get_RawProteinConcentration: get_RawProteinConcentration
  //   , get_ReferenceEvapotranspiration: get_ReferenceEvapotranspiration
  //   , get_RelativeTotalDevelopment: get_RelativeTotalDevelopment
  //   , get_RemainingEvapotranspiration: get_RemainingEvapotranspiration
  //   , get_ResidueBiomass: get_ResidueBiomass
  //   , get_ResiduesNConcentration: get_ResiduesNConcentration
  //   , get_ResiduesNContent: get_ResiduesNContent
  //   , get_RootNConcentration: get_RootNConcentration
  //   , get_RootingDepth: get_RootingDepth
  //   , get_SecondaryCropYield: get_SecondaryCropYield
  //   , get_SecondaryYieldNContent: get_SecondaryYieldNContent
  //   , get_SoilCoverage: get_SoilCoverage
  //   , get_StomataResistance: get_StomataResistance
  //   , get_SumTotalNUptake: get_SumTotalNUptake
  //   , get_TargetNConcentration: get_TargetNConcentration
  //   , get_TotalBiomassNContent: get_TotalBiomassNContent
  //   , get_Transpiration: get_Transpiration
  //   , get_TranspirationDeficit: get_TranspirationDeficit
  //   , get_VernalisationFactor: get_VernalisationFactor
  //   , get_numberOfSpecies: get_numberOfSpecies
  // };

};

