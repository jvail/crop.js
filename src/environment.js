/*
  Originally derived, ported from MONICA
  Find details on copywrite & license in the relevant source files at https://github.com/zalf-lsa/monica.
*/

var Environment = function (sps, cpp) {

  this.mode = "MyMode"; // JS! mode not implemented

  // copy constructor
  if (arguments[0] instanceof Environment) {
    debug("Copy constructor: Env" + "\tsoil param size: " + env.soilParams.length);
    this.env = arguments[0];
    this.customId = env.customId;
    this.soilParams = env.soilParams;
    this.noOfLayers = env.noOfLayers;
    this.layerThickness = env.layerThickness;
    this.useNMinMineralFertilisingMethod = env.useNMinMineralFertilisingMethod;
    this.useAutomaticIrrigation = env.useAutomaticIrrigation;
    this.useSecondaryYields = env.useSecondaryYields;

    this.windSpeedHeight = env.windSpeedHeight;
    this.atmosphericCO2 = env.atmosphericCO2;
    this.albedo = env.albedo;

    this.da = env.da;
    this.cropRotation = env.cropRotation;

    // gridPoint = env.gridPoint;

    this.site = env.site;
    this.general = env.general;
    this.organic = env.organic;

    this.nMinFertiliserPartition = env.nMinFertiliserPartition;
    this.nMinUserParams = env.nMinUserParams;
    this.autoIrrigationParams = env.autoIrrigationParams;
    this.centralParameterProvider = env.centralParameterProvider;

    this.pathToOutputDir = env.pathToOutputDir;
    this.mode = env.mode;
  } else {
    this.soilParams = sps;
    this.customId = -1;
    this.centralParameterProvider = cpp;
    this.pathToOutputDir = null;

    this.user_env = this.centralParameterProvider.userEnvironmentParameters;
    this.windSpeedHeight = this.user_env.p_WindSpeedHeight;
    this.atmosphericCO2 = this.user_env.p_AthmosphericCO2;
    this.albedo = this.user_env.p_Albedo;

    this.noOfLayers = this.user_env.p_NumberOfLayers;
    this.layerThickness = this.user_env.p_LayerThickness;
    this.useNMinMineralFertilisingMethod = this.user_env.p_UseNMinMineralFertilisingMethod;
    this.useAutomaticIrrigation = this.user_env.p_UseAutomaticIrrigation;
    this.useSecondaryYields = this.user_env.p_UseSecondaryYields;

    this.cropRotation = null; 
  }

  /**
   * Set execution mode of Monica.
   * Disables debug outputs for some modes.
   *
   * @param mode
   */
  var setMode = function (_mode) {
    mode = _mode;
  };

  /**
   * Interface method for python wrapping. Simply returns number
   * of possible simulation steps according to avaible climate data.
   *
   * @return Number of steps
   */

  var numberOfPossibleSteps = function () {
    return da.noOfStepsPossible();
  };

  this.getMode =  function () { 
    return mode; 
  };

  this.setCropRotation = function (ff) {
    this.cropRotation = ff;
  };

};
