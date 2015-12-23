
var SoilLayer = function (vs_LayerThickness, sps, cpp) {

  var that = this;

  // JS! Contructor with 0 arguments. Only used in SoilTemperature (ground and bottom layer)
  if (arguments.length === 0) {

    this.vs_SoilSandContent = 0.90;
    this.vs_SoilClayContent = 0.05;
    this.vs_SoilStoneContent = 0;
    this.vs_SoilTexture = "Ss";
    this.vs_SoilpH = 7;
    this.vs_SoilMoistureOld_m3 = 0.25;
    this.vs_SoilWaterFlux = 0;
    this.vs_Lambda = 0.5;
    this.vs_FieldCapacity = 0.21;
    this.vs_Saturation = 0.43;
    this.vs_PermanentWiltingPoint = 0.08;
    this.vs_SOM_Slow = 0;
    this.vs_SOM_Fast = 0;
    this.vs_SMB_Slow = 0;
    this.vs_SMB_Fast = 0;
    this.vs_SoilCarbamid = 0;
    this.vs_SoilNH4 = 0.0001;
    this.vs_SoilNO2 = 0.001;
    this.vs_SoilNO3 = 0.001;
    this.vs_SoilFrozen = false;
    var _vs_SoilOrganicCarbon = -1.0;
    var _vs_SoilOrganicMatter = -1.0;
    var _vs_SoilBulkDensity = 0;
    var _vs_SoilMoisture_pF = -1;
    var vs_SoilMoisture_m3 = 0.25;
    var vs_SoilTemperature = 0;
    this.vo_AOM_Pool = [];

    // JV! initialized with default instead of real user values
    var centralParameterProvider = new ParameterProvider(); // JS!
    this.vs_SoilMoisture_m3 = this.vs_FieldCapacity * centralParameterProvider.userInitValues.p_initPercentageFC;
    this.vs_SoilMoistureOld_m3 = this.vs_FieldCapacity * centralParameterProvider.userInitValues.p_initPercentageFC;
    this.vs_SoilNO3 = centralParameterProvider.userInitValues.p_initSoilNitrate;
    this.vs_SoilNH4 = centralParameterProvider.userInitValues.p_initSoilAmmonium;

  } else {

    if (arguments.length !== 3 || !(arguments[2] instanceof ParameterProvider))
      throw new Error('arguments.length !== 3 || !(arguments[2] instanceof ParameterProvider');

    this.vs_LayerThickness = vs_LayerThickness;
    this.vs_SoilSandContent = sps.vs_SoilSandContent;
    this.vs_SoilClayContent = sps.vs_SoilClayContent;
    this.vs_SoilStoneContent = sps.vs_SoilStoneContent;
    this.vs_SoilTexture = sps.vs_SoilTexture;
    this.vs_SoilpH = sps.vs_SoilpH;
    this.vs_SoilMoistureOld_m3 = 0.25; // QUESTION - Warum wird hier mit 0.25 initialisiert?
    this.vs_SoilWaterFlux = 0;
    this.vs_Lambda = sps.vs_Lambda;
    this.vs_FieldCapacity = sps.vs_FieldCapacity;
    this.vs_Saturation = sps.vs_Saturation;
    this.vs_PermanentWiltingPoint = sps.vs_PermanentWiltingPoint;
    this.vs_SOM_Slow = 0;
    this.vs_SOM_Fast = 0;
    this.vs_SMB_Slow = 0;
    this.vs_SMB_Fast = 0;
    this.vs_SoilCarbamid = 0;
    this.vs_SoilNH4 = 0.0001;
    this.vs_SoilNO2 = 0.001;
    this.vs_SoilNO3 = 0.005;
    this.vs_SoilFrozen = false;
    this.centralParameterProvider = cpp;
    var _vs_SoilOrganicCarbon = sps.vs_SoilOrganicCarbon();
    var _vs_SoilOrganicMatter = sps.vs_SoilOrganicMatter();
    var _vs_SoilBulkDensity = sps.vs_SoilBulkDensity();
    var _vs_SoilMoisture_pF = 0;
    var vs_SoilMoisture_m3 = 0.25; // QUESTION - Warum wird hier mit 0.25 initialisiert?
    var vs_SoilTemperature = 0;
    this.vo_AOM_Pool = [];

    if (DEBUG && !((_vs_SoilOrganicCarbon - (_vs_SoilOrganicMatter * ORGANIC_CONSTANTS.PO_SOM_TO_C)) < 0.00001)) {
      logger(MSG_DEBUG, _vs_SoilOrganicCarbon + ' _vs_SoilOrganicCarbon');
      logger(MSG_DEBUG, _vs_SoilOrganicMatter + ' _vs_SoilOrganicMatter');
      throw new Error("_vs_SoilOrganicCarbon - (_vs_SoilOrganicMatter * ORGANIC_CONSTANTS.PO_SOM_TO_C)) < 0.00001)");
    }

    vs_SoilMoisture_m3 = this.vs_FieldCapacity * cpp.userInitValues.p_initPercentageFC;
    this.vs_SoilMoistureOld_m3 = this.vs_FieldCapacity * cpp.userInitValues.p_initPercentageFC;

    if (sps.vs_SoilAmmonium < 0.0)
      this.vs_SoilNH4 = cpp.userInitValues.p_initSoilAmmonium;
    else
      this.vs_SoilNH4 = sps.vs_SoilAmmonium; // kg m-3

    if (sps.vs_SoilNitrate < 0.0)
      this.vs_SoilNO3 = cpp.userInitValues.p_initSoilNitrate;
    else
      this.vs_SoilNO3 = sps.vs_SoilNitrate;  // kg m-3

  }

  this.vs_SoilNH4_a = 0; /* absorbed, update in soilTransport.step */

  /**
   * @brief Returns value for soil organic carbon.
   *
   * If value for soil organic matter is not defined, because DB does not
   * contain the according value, than the store value for organic carbon
   * is returned. If the soil organic matter parameter is defined,
   * than the value for soil organic carbon is calculated depending on
   * the soil organic matter.
   *
   * @return Value for soil organic carbon
   */
  var vs_SoilOrganicCarbon = function () {
    // if soil organic carbon is not defined, than calculate from soil organic
    // matter value [kg C kg-1]
    if(_vs_SoilOrganicCarbon >= 0.0) {
      return _vs_SoilOrganicCarbon;
    }
    // calculate soil organic carbon with soil organic matter parameter
    return _vs_SoilOrganicMatter * ORGANIC_CONSTANTS.PO_SOM_TO_C;
  };

  /**
   * @brief Returns value for soil organic matter.
   *
   * If the value for soil organic carbon is not defined, because the DB does
   * not contain any value, than the stored value for organic matter
   * is returned. If the soil organic carbon parameter is defined,
   * than the value for soil organic matter is calculated depending on
   * the soil organic carbon.
   *
   * @return Value for soil organic matter
   * */
  var vs_SoilOrganicMatter = function () {
    // if soil organic matter is not defined, calculate from soil organic C
    if(_vs_SoilOrganicMatter >= 0.0) {
      return _vs_SoilOrganicMatter;
    }

    // ansonsten berechne den Wert aus dem C-Gehalt
    return (_vs_SoilOrganicCarbon / ORGANIC_CONSTANTS.PO_SOM_TO_C); //[kg C kg-1]
  };

  /**
   * @brief Returns fraction of silt content of the layer.
   *
   * Calculates the silt particle size fraction in the layer in dependence
   * of its sand and clay content.
   *
   * @return Fraction of silt in the layer.
   */
  var vs_SoilSiltContent = function () {
    return (1 - that.vs_SoilSandContent - that.vs_SoilClayContent);
  };

  /**
   * Soil layer's moisture content, expressed as logarithm of
   * pressure head in cm water column. Algorithm of Van Genuchten is used.
   * Conversion of water saturation into soil-moisture tension.
   *
   * @todo Einheiten prüfen
   */
  var calc_vs_SoilMoisture_pF = function () {
    /** Derivation of Van Genuchten parameters (Vereecken at al. 1989) */
    //TODO Einheiten prüfen
    var vs_ThetaR;
    var vs_ThetaS;

    if (that.vs_PermanentWiltingPoint > 0.0){
      vs_ThetaR = that.vs_PermanentWiltingPoint;
    } else {
      vs_ThetaR = get_PermanentWiltingPoint();
    }

    if (that.vs_Saturation > 0.0){
      vs_ThetaS = that.vs_Saturation;
    } else {
      vs_ThetaS = get_Saturation();
    }

    var vs_VanGenuchtenAlpha = exp(-2.486 + (2.5 * that.vs_SoilSandContent)
                                      - (35.1 * vs_SoilOrganicCarbon())
                                      - (2.617 * (vs_SoilBulkDensity() / 1000.0))
              - (2.3 * that.vs_SoilClayContent));

    var vs_VanGenuchtenM = 1.0;

    var vs_VanGenuchtenN = exp(0.053
                                  - (0.9 * that.vs_SoilSandContent)
                                  - (1.3 * that.vs_SoilClayContent)
          + (1.5 * (pow(that.vs_SoilSandContent, 2.0))));


    /** Van Genuchten retention curve */
    var vs_MatricHead;

    if(get_Vs_SoilMoisture_m3() <= vs_ThetaR) {
      vs_MatricHead = 5.0E+7;
      //else  d_MatricHead = (1.0 / vo_VanGenuchtenAlpha) * (pow(((1 / (pow(((d_SoilMoisture_m3 - d_ThetaR) /
       //                     (d_ThetaS - d_ThetaR)), (1 / vo_VanGenuchtenM)))) - 1), (1 / vo_VanGenuchtenN)));
    }   else {
      vs_MatricHead = (1.0 / vs_VanGenuchtenAlpha)
        * (pow(
            (
                (pow(
                      (
                        (vs_ThetaS - vs_ThetaR) / (get_Vs_SoilMoisture_m3() - vs_ThetaR)
                      ),
                      (
                         1 / vs_VanGenuchtenM
                      )
                    )
                )
                - 1
             ),
             (1 / vs_VanGenuchtenN)
             )
        );
    }

    _vs_SoilMoisture_pF = log10(vs_MatricHead);

    /* set _vs_SoilMoisture_pF to "small" number in case of vs_Theta "close" to vs_ThetaS (vs_Psi < 1 -> log(vs_Psi) < 0) */
    _vs_SoilMoisture_pF = (_vs_SoilMoisture_pF < 0.0 || isNaN(_vs_SoilMoisture_pF) || abs(_vs_SoilMoisture_pF) === Infinity ? 0.01 : _vs_SoilMoisture_pF); 

  };

  /**
   * Soil layer's water content at field capacity (1.8 < pF < 2.1) [m3 m-3]
   *
   * This method applies only in the case when soil charcteristics have not
   * been set before.
   *
   * In german: "Maximaler Wassergehalt, der gegen die Wirkung der
   * Schwerkraft zurückgehalten wird"
   *
   * @todo Einheiten prüfen
   */
  var get_FieldCapacity = function () {

    //***** Derivation of Van Genuchten parameters (Vereecken at al. 1989) *****
    if (that.vs_SoilTexture == "") {
  //    cout << "Field capacity is calculated from van Genuchten parameters" << endl;
      var vs_ThetaR;
      var vs_ThetaS;

      if (that.vs_PermanentWiltingPoint > 0.0){
        vs_ThetaR = that.vs_PermanentWiltingPoint;
      } else {
        vs_ThetaR = get_PermanentWiltingPoint();
      }

      if (that.vs_Saturation > 0.0){
        vs_ThetaS = that.vs_Saturation;
      } else {
        vs_ThetaS = get_Saturation();
      }

      var vs_VanGenuchtenAlpha = exp(-2.486
                + 2.5 * that.vs_SoilSandContent
                - 35.1 * vs_SoilOrganicCarbon()
                - 2.617 * (vs_SoilBulkDensity() / 1000.0)
                - 2.3 * that.vs_SoilClayContent);

      var vs_VanGenuchtenM = 1.0;

      var vs_VanGenuchtenN = exp(0.053
            - 0.9 * that.vs_SoilSandContent
            - 1.3 * that.vs_SoilClayContent
            + 1.5 * (pow(that.vs_SoilSandContent, 2.0)));

      //***** Van Genuchten retention curve to calculate volumetric water content at
      //***** moisture equivalent (Field capacity definition KA5)

      var vs_FieldCapacity_pF = 2.1;
      if ((that.vs_SoilSandContent > 0.48) && (that.vs_SoilSandContent <= 0.9) && (that.vs_SoilClayContent <= 0.12))
        vs_FieldCapacity_pF = 2.1 - (0.476 * (that.vs_SoilSandContent - 0.48));
      else if ((that.vs_SoilSandContent > 0.9) && (that.vs_SoilClayContent <= 0.05))
        vs_FieldCapacity_pF = 1.9;
      else if (that.vs_SoilClayContent > 0.45)
        vs_FieldCapacity_pF = 2.5;
      else if ((that.vs_SoilClayContent > 0.30) && (that.vs_SoilSandContent < 0.2))
        vs_FieldCapacity_pF = 2.4;
      else if (that.vs_SoilClayContent > 0.35)
        vs_FieldCapacity_pF = 2.3;
      else if ((that.vs_SoilClayContent > 0.25) && (that.vs_SoilSandContent < 0.1))
        vs_FieldCapacity_pF = 2.3;
      else if ((that.vs_SoilClayContent > 0.17) && (that.vs_SoilSandContent > 0.68))
        vs_FieldCapacity_pF = 2.2;
      else if ((that.vs_SoilClayContent > 0.17) && (that.vs_SoilSandContent < 0.33))
        vs_FieldCapacity_pF = 2.2;
      else if ((that.vs_SoilClayContent > 0.08) && (that.vs_SoilSandContent < 0.27))
        vs_FieldCapacity_pF = 2.2;
      else if ((that.vs_SoilClayContent > 0.25) && (that.vs_SoilSandContent < 0.25))
        vs_FieldCapacity_pF = 2.2;

      var vs_MatricHead = pow(10, vs_FieldCapacity_pF);

      that.vs_FieldCapacity = vs_ThetaR + ((vs_ThetaS - vs_ThetaR) /
              (pow((1.0 + pow((vs_VanGenuchtenAlpha * vs_MatricHead),
              vs_VanGenuchtenN)), vs_VanGenuchtenM)));

      that.vs_FieldCapacity *= (1.0 - that.vs_SoilStoneContent);
    }

    return that.vs_FieldCapacity;

  };

  /**
   * Soil layer's water content at full saturation (pF=0.0) [m3 m-3].
   * Uses empiric calculation of Van Genuchten. *
   *
   * In german:  Wassergehalt bei maximaler Füllung des Poren-Raums
   *
   * @return Water content at full saturation
   */
  var get_Saturation = function () {
    
    if (that.vs_SoilTexture == "") {
      that.vs_Saturation = 0.81 - 0.283 * (vs_SoilBulkDensity() / 1000.0) + 0.1 * that.vs_SoilClayContent;

      that.vs_Saturation *= (1.0 - that.vs_SoilStoneContent);
    }
    return that.vs_Saturation;
  };

  /**
   * Soil layer's water content at permanent wilting point (pF=4.2) [m3 m-3].
   * Uses empiric calculation of Van Genuchten.
   *
   * In german: Wassergehalt des Bodens am permanenten Welkepunkt.
   *
   * @return Water content at permanent wilting point
   */
  var get_PermanentWiltingPoint = function () {

    if (that.vs_SoilTexture == "") {
  //    cout << "Permanent Wilting Point is calculated from van Genuchten parameters" << endl;
      that.vs_PermanentWiltingPoint = 0.015 + 0.5 * that.vs_SoilClayContent + 1.4 * that.vs_SoilOrganicCarbon();

      that.vs_PermanentWiltingPoint *= (1.0 - that.vs_SoilStoneContent);
    }

    return that.vs_PermanentWiltingPoint;
  };

  /**
   * Returns bulk density of soil layer [kg m-3]
   * @return bulk density of soil layer [kg m-3]
   */
  var vs_SoilBulkDensity = function () {
    return _vs_SoilBulkDensity;
  };

  var set_SoilOrganicMatter =  function (som) {
    _vs_SoilOrganicMatter = som;
  };

  /**
   * Sets value for soil organic carbon.
   * @param soc New value for soil organic carbon.
   */
  var set_SoilOrganicCarbon =  function (soc) {
    _vs_SoilOrganicCarbon = soc;
  };


  /**
   * Returns pH value of soil layer
   * @return pH value of soil layer [ ]
   */
  var get_SoilpH =  function () {
    return that.vs_SoilpH;
  };

  /**
   * Returns soil water pressure head as common logarithm pF.
   * @return soil water pressure head [pF]
   */
  var vs_SoilMoisture_pF =  function () {
    calc_vs_SoilMoisture_pF();
    return _vs_SoilMoisture_pF;
  };

  /**
   * Returns soil ammonium content.
   * @return soil ammonium content [kg N m-3]
   */
  var get_SoilNH4 = function () { return this.vs_SoilNH4; };

  /**
   * Returns absorbed soil ammonium content.
   * @return soil ammonium content [kg N m-3]
   */
  var get_SoilNH4_a = function () { return this.vs_SoilNH4_a; };

  /**
   * Returns soil nitrite content.
   * @return soil nitrite content [kg N m-3]
   */
  var get_SoilNO2 = function () { return this.vs_SoilNO2; };

  /**
   * Returns soil nitrate content.
   * @return soil nitrate content [kg N m-3]
   */
  var get_SoilNO3 = function () { return this.vs_SoilNO3; };

  /**
   * Returns soil carbamide content.
   * @return soil carbamide content [kg m-3]
   */
  var get_SoilCarbamid = function () { return this.vs_SoilCarbamid; };

  /**
   * Returns soil mineral N content.
   * @return soil mineral N content [kg m-3]
   */
  var get_SoilNmin = function () { return this.vs_SoilNO3 + this.vs_SoilNO2 + this.vs_SoilNH4; };
  var get_Vs_SoilMoisture_m3 = function () { return vs_SoilMoisture_m3; };
  var set_Vs_SoilMoisture_m3 = function (ms) { vs_SoilMoisture_m3 = ms; };
  var get_Vs_SoilTemperature = function () { return vs_SoilTemperature; };
  var set_Vs_SoilTemperature = function (st) { vs_SoilTemperature = st; };
  var vs_SoilOrganicCarbon = function () { return _vs_SoilOrganicCarbon; }; /**< Soil layer's organic carbon content [kg C kg-1] */
  var vs_SoilOrganicMatter = function () { return _vs_SoilOrganicMatter; }; /**< Soil layer's organic matter content [kg OM kg-1] */
  var vs_SoilSiltContent = function () { return this.vs_SoilSiltContent; }; /**< Soil layer's silt content [kg kg-1] (Schluff) */

  return {
    // anorganische Stickstoff-Formen
    calc_vs_SoilMoisture_pF: calc_vs_SoilMoisture_pF,
    centralParameterProvider: this.centralParameterProvider,
    get_FieldCapacity: get_FieldCapacity,
    get_PermanentWiltingPoint: get_PermanentWiltingPoint,
    get_Saturation: get_Saturation,
    get_SoilCarbamid: get_SoilCarbamid,
    get_SoilNH4: get_SoilNH4,
    get_SoilNH4_a: get_SoilNH4_a,
    get_SoilNmin: get_SoilNmin,
    get_SoilNO2: get_SoilNO2,
    get_SoilNO3: get_SoilNO3,
    get_SoilpH: get_SoilpH,
    get_Vs_SoilMoisture_m3: get_Vs_SoilMoisture_m3,
    get_Vs_SoilTemperature: get_Vs_SoilTemperature,
    set_SoilOrganicCarbon: set_SoilOrganicCarbon,
    set_SoilOrganicMatter: set_SoilOrganicMatter,
    set_Vs_SoilMoisture_m3: set_Vs_SoilMoisture_m3,
    set_Vs_SoilTemperature: set_Vs_SoilTemperature,
    vo_AOM_Pool: this.vo_AOM_Pool, /**< List of different added organic matter pools in soil layer */
    vs_FieldCapacity: this.vs_FieldCapacity,
    vs_Lambda: this.vs_Lambda, /**< Soil water conductivity coefficient [] */
    vs_LayerThickness: this.vs_LayerThickness, /**< Soil layer's vertical extension [m] */
    vs_PermanentWiltingPoint: this.vs_PermanentWiltingPoint,
    vs_Saturation: this.vs_Saturation,
    vs_SMB_Fast: this.vs_SMB_Fast, /**< C content of soil microbial biomass fast pool size [kg C m-3] */
    vs_SMB_Slow: this.vs_SMB_Slow, /**< C content of soil microbial biomass slow pool size [kg C m-3] */
    vs_SoilBulkDensity: vs_SoilBulkDensity,
    vs_SoilCarbamid: this.vs_SoilCarbamid, /**< Soil layer's carbamide-N content [kg Carbamide-N m-3] */
    vs_SoilClayContent: this.vs_SoilClayContent, /**< Soil layer's clay content [kg kg-1] (Ton) */
    vs_SoilFrozen: this.vs_SoilFrozen,
    vs_SoilMoisture_pF: vs_SoilMoisture_pF,
    vs_SoilMoistureOld_m3: this.vs_SoilMoistureOld_m3, /**< Soil layer's moisture content of previous day [m3 m-3] */
    vs_SoilNH4: this.vs_SoilNH4, /**< Soil layer's NH4-N content [kg NH4-N m-3] */
    vs_SoilNH4_a: this.vs_SoilNH4_a, /**< Soil layer's absorbed NH4-N content [kg NH4-N m-3] */
    vs_SoilNO2: this.vs_SoilNO2, /**< Soil layer's NO2-N content [kg NO2-N m-3] */
    vs_SoilNO3: this.vs_SoilNO3, /**< Soil layer's NO3-N content [kg NO3-N m-3] */
    vs_SoilOrganicCarbon: vs_SoilOrganicCarbon,
    vs_SoilOrganicMatter: vs_SoilOrganicMatter,
    vs_SoilpH: this.vs_SoilpH, /**< Soil pH value [] */
    vs_SoilSandContent: this.vs_SoilSandContent, /**< Soil layer's sand content [kg kg-1] */
    vs_SoilSiltContent: vs_SoilSiltContent,
    vs_SoilStoneContent: this.vs_SoilStoneContent, /**< Soil layer's stone content in soil [kg kg-1] */
    vs_SoilTexture: this.vs_SoilTexture,
    vs_SoilWaterFlux: this.vs_SoilWaterFlux, /**< Water flux at the upper boundary of the soil layer [l m-2] */
    vs_SOM_Fast: this.vs_SOM_Fast, /**< C content of soil organic matter fast pool size [kg C m-3] */
    vs_SOM_Slow: this.vs_SOM_Slow /**< C content of soil organic matter slow pool [kg C m-3] */
  };

};
