'use strict;'

var YieldComponent = function (oid, yp, ydm) {

  this.organId = oid;
  this.yieldPercentage = yp;
  this.yieldDryMatter = ydm;
  
};


var IrrigationParameters = function (n, s) {
  
  this.nitrateConcentration = n || 0;
  this.sulfateConcentration = s || 0;

};


var AutomaticIrrigationParameters = function (a, t, n, s) {
  
  /* TODO: x || y evaluates to y if x = 0. This is not a problem if default (y) is 0 */
  this.amount = a || 17;
  this.threshold = t || 0.35;
  this.nitrateConcentration = n || 0;
  this.sulfateConcentration = s || 0;

};


var AOM_Properties = function () {

  /* C content in slowly decomposing added organic matter pool [kgC m-3] */
  this.vo_AOM_Slow = 0.0;  
  /* C content in rapidly decomposing added organic matter pool [kgC m-3] */
  this.vo_AOM_Fast = 0.0; 
  /* Rate for slow AOM transformation that will be calculated. */
  this.vo_AOM_SlowDecRate = 0.0; 
  /* Rate for fast AOM transformation that will be calculated. */
  this.vo_AOM_FastDecRate = 0.0; 
  /* Is dependent on environment */
  this.vo_AOM_SlowDecCoeff = 0.0; 
  /* Is dependent on environment */
  this.vo_AOM_FastDecCoeff = 0.0; 
  /* Decomposition rate coefficient for slow AOM pool at standard conditions */
  this.vo_AOM_SlowDecCoeffStandard = 1.0; 
  /* Decomposition rate coefficient for fast AOM pool at standard conditions */
  this.vo_AOM_FastDecCoeffStandard = 1.0; 
  /* Partial transformation from AOM to SMB (soil microbiological biomass) for slow AOMs. */
  this.vo_PartAOM_Slow_to_SMB_Slow = 0.0; 
  /* Partial transformation from AOM to SMB (soil microbiological biomass) for fast AOMs. */
  this.vo_PartAOM_Slow_to_SMB_Fast = 0.0; 
  /* Used for calculation N-value if only C-value is known. Usually a constant value. */
  this.vo_CN_Ratio_AOM_Slow = 1.0; 
  /* C-N-Ratio is dependent on the nutritional condition of the plant. */
  this.vo_CN_Ratio_AOM_Fast = 1.0; 
  /* Fertilization parameter */  
  this.vo_DaysAfterApplication = 0; 
  /* Fertilization parameter */
  this.vo_AOM_DryMatterContent = 0.0; 
  /* Fertilization parameter */
  this.vo_AOM_NH4Content = 0.0; 
  /* Difference of AOM slow between to timesteps */
  this.vo_AOM_SlowDelta = 0.0; 
  /* Difference of AOM slow between to timesteps */
  this.vo_AOM_FastDelta = 0.0; 
  /* True if organic fertilizer is added with a subsequent incorporation. */
  this.incorporation = false;  

};


var GeneralParameters = function (
  _ps_LayerThickness,
  ps_ProfileDepth, 
  ps_MaximumMineralisationDepth,
  pc_NitrogenResponseOn,
  pc_WaterDeficitResponseOn,
  pc_EmergenceFloodingControlOn,
  pc_EmergenceMoistureControlOn
) {

  this._ps_LayerThickness = _ps_LayerThickness || 0.1;
  this.ps_ProfileDepth = ps_ProfileDepth || 2.0;
  this.ps_LayerThickness  = new Float64Array(int(this.ps_ProfileDepth / this._ps_LayerThickness));
  this.ps_MaxMineralisationDepth = ps_MaximumMineralisationDepth || 0.4;
  this.pc_NitrogenResponseOn = pc_NitrogenResponseOn || false;
  this.pc_WaterDeficitResponseOn = pc_WaterDeficitResponseOn || false;
  this.pc_EmergenceFloodingControlOn = pc_EmergenceFloodingControlOn || false;
  this.pc_EmergenceMoistureControlOn = pc_EmergenceMoistureControlOn || false;

  for (var i = 0; i < this.ps_LayerThickness.length; i++)
    this.ps_LayerThickness[i] = this._ps_LayerThickness;

  this.ps_NumberOfLayers = function () { 
    return this.ps_LayerThickness.length;
  };

};


var SiteParameters = function () {
    
  this.vs_Latitude = 60.0;
  this.vs_Slope = 0.01;
  this.vs_HeightNN = 50.0;
  this.vs_GroundwaterDepth = 70.0;
  this.vs_Soil_CN_Ratio = 10.0;
  this.vs_DrainageCoeff = 1.0;
  this.vq_NDeposition = 30.0;
  this.vs_MaxEffectiveRootingDepth = 2.0;

};


var SoilParameters = function () {

  this.vs_SoilSandContent = 0.4;
  this.vs_SoilClayContent = 0.05;
  this.vs_SoilpH = 6.9;
  this.vs_SoilStoneContent = -1; // JS! add initialization
  this.vs_Lambda = -1; // JS! add initialization
  this.vs_FieldCapacity = -1; // JS! add initialization
  this.vs_Saturation = -1; // JS! add initialization
  this.vs_PermanentWiltingPoint = -1; // JS! add initialization
  this.vs_SoilTexture = ''; // JS! add initialization
  this.vs_SoilAmmonium = -1;
  this.vs_SoilNitrate = -1;

  this._vs_SoilRawDensity = -1;
  this._vs_SoilBulkDensity = -1;
  this._vs_SoilOrganicCarbon = -1;
  this._vs_SoilOrganicMatter = -1;

  this.isValid = function () {

    var is_valid = true;

    if (this.vs_FieldCapacity <= 0) {
        logger(MSG.WARN, "SoilParameters::Error: No field capacity defined in database for " + this.vs_SoilTexture + " , RawDensity: "+ this._vs_SoilRawDensity);
        is_valid = false;
    }
    if (this.vs_Saturation <= 0) {
        logger(MSG.WARN, "SoilParameters::Error: No saturation defined in database for " + this.vs_SoilTexture + " , RawDensity: " + this._vs_SoilRawDensity);
        is_valid = false;
    }
    if (this.vs_PermanentWiltingPoint <= 0) {
        logger(MSG.WARN, "SoilParameters::Error: No saturation defined in database for " + this.vs_SoilTexture + " , RawDensity: " + this._vs_SoilRawDensity);
        is_valid = false;
    }

    if (this.vs_SoilSandContent<0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid soil sand content: "+ this.vs_SoilSandContent);
        is_valid = false;
    }

    if (this.vs_SoilClayContent<0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid soil clay content: "+ this.vs_SoilClayContent);
        is_valid = false;
    }

    if (this.vs_SoilpH<0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid soil ph value: "+ this.vs_SoilpH);
        is_valid = false;
    }

    if (this.vs_SoilStoneContent<0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid soil stone content: "+ this.vs_SoilStoneContent);
        is_valid = false;
    }

    if (this.vs_Saturation<0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid value for saturation: "+ this.vs_Saturation);
        is_valid = false;
    }

    if (this.vs_PermanentWiltingPoint<0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid value for permanent wilting point: "+ this.vs_PermanentWiltingPoint);
        is_valid = false;
    }
/*
    if (this._vs_SoilRawDensity<0) {
        logger(MSG.WARN, "SoilParameters::Error: Invalid soil raw density: "+ this._vs_SoilRawDensity);
        is_valid = false;
    }
*/
    return is_valid;
  };

  this.vs_SoilRawDensity = function () {
    // conversion from g cm-3 in kg m-3
    return this._vs_SoilRawDensity * 1000;
  };

  this.set_vs_SoilRawDensity = function (srd) {
    this._vs_SoilRawDensity = srd;
  };

  this.vs_SoilOrganicCarbon = function () {
    if (this._vs_SoilOrganicMatter < 0)
      return this._vs_SoilOrganicCarbon;

    return this._vs_SoilOrganicMatter * organicConstants.po_SOM_to_C;
  };

  this.set_vs_SoilOrganicCarbon = function (soc) {
    this._vs_SoilOrganicCarbon = soc;
  };

  this.vs_SoilOrganicMatter = function () {
    if (this._vs_SoilOrganicCarbon < 0)
      return this._vs_SoilOrganicMatter;
    return this._vs_SoilOrganicCarbon / organicConstants.po_SOM_to_C;
  };

  this.set_vs_SoilOrganicMatter = function (som) {
    this._vs_SoilOrganicMatter = som;
  };

  this.vs_SoilSiltContent = function () {
    if ((this.vs_SoilSandContent - 0.001) < 0 && (this.vs_SoilClayContent - 0.001) < 0)
      return 0;

    return 1 - this.vs_SoilSandContent - this.s_SoilClayContent;
  };

  /*
    bulk density [kg m-3]

    TODO: unit?
  */
  this.vs_SoilBulkDensity = function () {
    if (this._vs_SoilRawDensity < 0)
      return this._vs_SoilBulkDensity;

    return (this._vs_SoilRawDensity + (0.009 * 100 * this.vs_SoilClayContent)) * 1000;
  };

  /*
    soilBulkDensity [g cm-3]

    TODO: unit?
  */
  this.set_vs_SoilBulkDensity = function (sbd) {
    this._vs_SoilBulkDensity = sbd;
  };

  this.texture2lambda = function (sand, clay) {
    return Tools.texture2lambda(sand, clay);
  };

};


var OrganicMatterParameters = function (omp) {

  this.name = "";
  this.vo_AOM_DryMatterContent = omp.vo_AOM_DryMatterContent | 0.0;
  this.vo_AOM_NH4Content = omp.vo_AOM_NH4Content | 0.0;
  this.vo_AOM_NO3Content = omp.vo_AOM_NO3Content | 0.0;
  this.vo_AOM_CarbamidContent = omp.vo_AOM_CarbamidContent | 0.0;
  this.vo_AOM_SlowDecCoeffStandard = omp.vo_AOM_SlowDecCoeffStandard | 0.0;
  this.vo_AOM_FastDecCoeffStandard = omp.vo_AOM_FastDecCoeffStandard | 0.0;
  this.vo_PartAOM_to_AOM_Slow = omp.vo_PartAOM_to_AOM_Slow | 0.0;
  this.vo_PartAOM_to_AOM_Fast = omp.vo_PartAOM_to_AOM_Fast | 0.0;
  this.vo_CN_Ratio_AOM_Slow = omp.vo_CN_Ratio_AOM_Slow | 0.0;
  this.vo_CN_Ratio_AOM_Fast = omp.vo_CN_Ratio_AOM_Fast | 0.0;
  this.vo_PartAOM_Slow_to_SMB_Slow = omp.vo_PartAOM_Slow_to_SMB_Slow | 0.0;
  this.vo_PartAOM_Slow_to_SMB_Fast = omp.vo_PartAOM_Slow_to_SMB_Fast | 0.0;
  this.vo_NConcentration = 0.0;

};


var UserCropParameters = function () {

  this.pc_ReferenceMaxAssimilationRate;
  this.pc_ReferenceLeafAreaIndex;
  this.pc_MaintenanceRespirationParameter1;
  this.pc_MaintenanceRespirationParameter2;
  this.pc_MinimumNConcentrationRoot;
  this.pc_MinimumAvailableN;
  this.pc_ReferenceAlbedo;
  this.pc_StomataConductanceAlpha;
  this.pc_SaturationBeta;
  this.pc_GrowthRespirationRedux;
  this.pc_MaxCropNDemand;
  this.pc_GrowthRespirationParameter1;
  this.pc_GrowthRespirationParameter2;
  this.pc_Tortuosity;

};


var UserEnvironmentParameters = function () {

  this.p_UseNMinMineralFertilisingMethod;
  this.p_UseSecondaryYields;

  this.p_LayerThickness;
  this.p_Albedo;
  this.p_AthmosphericCO2;
  this.p_WindSpeedHeight;
  this.p_LeachingDepth;
  this.p_timeStep;
  this.p_MaxGroundwaterDepth = 20;
  this.p_MinGroundwaterDepth = 20;

  this.p_NumberOfLayers;
  this.p_StartPVIndex;
  this.p_JulianDayAutomaticFertilising;
  this.p_MinGroundwaterDepthMonth;

};

var UserInitialValues = function () {

  /* Initial soil moisture content in percent field capacity */
  this.p_initPercentageFC = 0.8;    
  /* Initial soil nitrate content [kg NO3-N m-3] */
  this.p_initSoilNitrate = 0.0001;     
  /* Initial soil ammonium content [kg NH4-N m-3] */
  this.p_initSoilAmmonium = 0.0001;    

};


var UserSoilMoistureParameters = function () {

  this.pm_CriticalMoistureDepth;
  this.pm_SaturatedHydraulicConductivity;
  this.pm_SurfaceRoughness;
  this.pm_GroundwaterDischarge;
  this.pm_HydraulicConductivityRedux;
  this.pm_SnowAccumulationTresholdTemperature;
  this.pm_KcFactor;
  this.pm_TemperatureLimitForLiquidWater;
  this.pm_CorrectionSnow;
  this.pm_CorrectionRain;
  this.pm_SnowMaxAdditionalDensity;
  this.pm_NewSnowDensityMin;
  this.pm_SnowRetentionCapacityMin;
  this.pm_RefreezeParameter1;
  this.pm_RefreezeParameter2;
  this.pm_RefreezeTemperature;
  this.pm_SnowMeltTemperature;
  this.pm_SnowPacking;
  this.pm_SnowRetentionCapacityMax;
  this.pm_EvaporationZeta;
  this.pm_XSACriticalSoilMoisture;
  this.pm_MaximumEvaporationImpactDepth;
  this.pm_MaxPercolationRate;
  this.pm_MoistureInitValue;

};


var UserSoilTemperatureParameters = function () {

  this.pt_NTau;
  this.pt_InitialSurfaceTemperature;
  this.pt_BaseTemperature;
  this.pt_QuartzRawDensity;
  this.pt_DensityAir;
  this.pt_DensityWater;
  this.pt_DensityHumus;
  this.pt_SpecificHeatCapacityAir;
  this.pt_SpecificHeatCapacityQuartz;
  this.pt_SpecificHeatCapacityWater;
  this.pt_SpecificHeatCapacityHumus;
  this.pt_SoilAlbedo;
  /* according to sensitivity tests, soil moisture has minor influence to the temperature and thus can be set as constant */
  this.pt_SoilMoisture = 0.25;

};


var UserSoilTransportParameters = function () {

  this.pq_AD;
  this.pq_DiffusionCoefficientStandard;
  this.pq_NDeposition;

};


var UserSoilOrganicParameters = function () {

  // 1.40e-4 [d-1], from DAISY manual 1.4e-4
  this.po_SOM_FastDecCoeffStandard; 
  // 1.00e-3 [d-1], from DAISY manual original 1.8e-3
  this.po_SMB_SlowMaintRateStandard; 
  // 1.00e-2 [d-1], from DAISY manual
  this.po_SMB_FastMaintRateStandard; 
  // 1.00e-3 [d-1], from DAISY manual
  this.po_SMB_SlowDeathRateStandard; 
  // 1.00e-2 [d-1], from DAISY manual
  this.po_SMB_FastDeathRateStandard; 
  // 0.60 [], from DAISY manual 0.6
  this.po_SMB_UtilizationEfficiency; 
  // 0.40 [], from DAISY manual 0.4
  this.po_SOM_SlowUtilizationEfficiency; 
  // 0.50 [], from DAISY manual 0.5
  this.po_SOM_FastUtilizationEfficiency; 
  // 0.40 [], from DAISY manual original 0.13
  this.po_AOM_SlowUtilizationEfficiency; 
  // 0.10 [], from DAISY manual original 0.69
  this.po_AOM_FastUtilizationEfficiency; 
  //  1000.0
  this.po_AOM_FastMaxC_to_N; 
  // 0.30) [], Bruun et al. 2003
  this.po_PartSOM_Fast_to_SOM_Slow; 
  // 0.60) [], from DAISY manual
  this.po_PartSMB_Slow_to_SOM_Fast; 
  // 0.60 [], from DAISY manual
  this.po_PartSMB_Fast_to_SOM_Fast; 
  // 0.0150 [], optimised
  this.po_PartSOM_to_SMB_Slow; 
  // 0.0002 [], optimised
  this.po_PartSOM_to_SMB_Fast; 
  // 6.70 [], from DAISY manual
  this.po_CN_Ratio_SMB; 
  // 0.25 [kg kg-1], from DAISY manual
  this.po_LimitClayEffect; 
  // 1.0e-1[d-1], from DAISY manual
  this.po_AmmoniaOxidationRateCoeffStandard; 
  // 9.0e-1[d-1], fudged by Florian Stange
  this.po_NitriteOxidationRateCoeffStandard; 
  // 0.1 [d-1], from DAISY manual
  this.po_TransportRateCoeff; 
  // 0.1 [g gas-N g CO2-C-1]
  this.po_SpecAnaerobDenitrification; 
  // 0.5 [d-1]
  this.po_ImmobilisationRateCoeffNO3; 
  // 0.5 [d-1]
  this.po_ImmobilisationRateCoeffNH4; 
  // 0.2 Denitrification parameter
  this.po_Denit1; 
  // 0.8 Denitrification parameter
  this.po_Denit2; 
  // 0.9 Denitrification parameter
  this.po_Denit3; 
  // 0.00334 from Tabatabai 1973
  this.po_HydrolysisKM; 
  // 41000.0 from Gould et al. 1973
  this.po_ActivationEnergy; 
  // 4.259e-12 from Sadeghi et al. 1988
  this.po_HydrolysisP1; 
  // 1.408e-12 from Sadeghi et al. 1988
  this.po_HydrolysisP2; 
  // 0.0025 [s m-1], from Sadeghi et al. 1988
  this.po_AtmosphericResistance; 
  // 0.5 [d-1]
  this.po_N2OProductionRate; 
  // 1.0 [kg N m-3] NH3-induced inhibitor for nitrite oxidation
  this.po_Inhibitor_NH3; 

};


var CapillaryRiseRates = function () {

  this.cap_rates_map = {};

  /* Adds a capillary rise rate to data structure. */
  this.addRate = function (texture, distance, value) {
    if (this.cap_rates_map[texture] === undefined)
      this.cap_rates_map[texture] = {};
    this.cap_rates_map[texture][distance] = value;
  };

  /* Returns capillary rise rate for given soil type and distance to ground water. */
  this.getRate = function (texture, distance) {

    var map = getMap(texture)
      , size = 0
      ;

    for (var prop in map) {
      if (map.hasOwnProperty(prop))
        size++;
    }    

    if (size <= 0)
      logger(MSG.WARN, "No capillary rise rates in data structure available.");

    return (this.cap_rates_map[texture][distance] === undefined) ? 0.0 : this.cap_rates_map[texture][distance];

  };


  this.getMap = function (texture) {
    return this.cap_rates_map[texture];
  };

  /* Returns number of elements of internal map data structure. */
  this.size = function () { 

    var size = 0;

    for (var prop in this.cap_rates_map) {
      if (this.cap_rates_map.hasOwnProperty(prop))
        size++;
    } 

    return size;
  
  };

};


var RPSCDRes = function (initialized) {

  this.sat = 0;
  this.fc = 0;
  this.pwp = 0;
  this.initialized = (initialized === undefined) ? false : initialized;

};


var CentralParameterProvider = function () {

  this.userCropParameters = new UserCropParameters();
  this.userEnvironmentParameters = new UserEnvironmentParameters();
  this.userSoilMoistureParameters = new UserSoilMoistureParameters();
  this.userSoilTemperatureParameters = new UserSoilTemperatureParameters();
  this.userSoilTransportParameters = new UserSoilTransportParameters();
  this.userSoilOrganicParameters = new UserSoilOrganicParameters();
  // this.sensitivityAnalysisParameters = new SensitivityAnalysisParameters();
  this.capillaryRiseRates = null;
  this.userInitValues = new UserInitialValues();
  
};
