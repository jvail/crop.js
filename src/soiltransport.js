
var SoilTransport = function (sc, sps, cpp) {

  var soilColumn = sc
    , centralParameterProvider = cpp
    , vs_NumberOfLayers = sc.vs_NumberOfLayers() // extern
    , vq_Convection = new Float64Array(vs_NumberOfLayers)
    , vq_CropNUptake = 0.0
    , vq_DiffusionCoeff = new Float64Array(vs_NumberOfLayers)
    , vq_Dispersion = new Float64Array(vs_NumberOfLayers)
    , vq_DispersionCoeff = new Float64Array(vs_NumberOfLayers)
    , vq_FieldCapacity = new Float64Array(vs_NumberOfLayers)
    , vq_LayerThickness = new Float64Array(vs_NumberOfLayers)
    , vq_LeachingAtBoundary = 0.0
    , vs_NDeposition = sps.vq_NDeposition
    , vc_NUptakeFromLayer = new Float64Array(vs_NumberOfLayers)
    , vq_PoreWaterVelocity = new Float64Array(vs_NumberOfLayers)
    , vq_SoilMoisture = new Float64Array(vs_NumberOfLayers)
    , vq_SoilNO3 = new Float64Array(vs_NumberOfLayers)
    , vq_SoilNO3_aq = new Float64Array(vs_NumberOfLayers)
    , vq_TimeStep = 1.0
    , vq_TotalDispersion = new Float64Array(vs_NumberOfLayers)
    , vq_PercolationRate = new Float64Array(vs_NumberOfLayers)
    , crop = null
    ;

  // JS! init arrays
  for (var i = 0; i < vs_NumberOfLayers; i++) {
    vq_DispersionCoeff[i] = 1.0;
    vq_LayerThickness[i] = 0.1;
    vq_SoilMoisture[i] = 0.2;
  }    

  var vs_LeachingDepth = centralParameterProvider.userEnvironmentParameters.p_LeachingDepth;
  var vq_TimeStep = centralParameterProvider.userEnvironmentParameters.p_timeStep;

  var step = function () {

    var vq_TimeStepFactor = 1.0; // [t t-1]

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      vq_FieldCapacity[i_Layer] = soilColumn[i_Layer].get_FieldCapacity();
      vq_SoilMoisture[i_Layer] = soilColumn[i_Layer].get_Vs_SoilMoisture_m3();
      vq_SoilNO3[i_Layer] = soilColumn[i_Layer].vs_SoilNO3;

      vq_LayerThickness[i_Layer] = soilColumn[0].vs_LayerThickness;
      vc_NUptakeFromLayer[i_Layer] = crop ? crop.get_NUptakeFromLayer(i_Layer) : 0;

      // disabled
      /* crop.js: remove NH4 from uptake and update NH4 in solution */
      /* [kg (N) m-3] */
      /*
      var NH4_uptake = min(soilColumn[i_Layer].vs_SoilNH4, vc_NUptakeFromLayer[i_Layer] / vq_LayerThickness[i_Layer]);
      vc_NUptakeFromLayer[i_Layer] -=  NH4_uptake * vq_LayerThickness[i_Layer];
      soilColumn[i_Layer].vs_SoilNH4 -= NH4_uptake;
      */

      if (i_Layer == (vs_NumberOfLayers - 1)){
        vq_PercolationRate[i_Layer] = soilColumn.vs_FluxAtLowerBoundary ; //[mm]
      } else {
        vq_PercolationRate[i_Layer] = soilColumn[i_Layer + 1].vs_SoilWaterFlux; //[mm]
      }
      // Variable time step in case of high water fluxes to ensure stable numerics
      if ((vq_PercolationRate[i_Layer] <= 5.0) && (vq_TimeStepFactor >= 1.0))
        vq_TimeStepFactor = 1.0;
      else if ((vq_PercolationRate[i_Layer] > 5.0) && (vq_PercolationRate[i_Layer] <= 10.0) && (vq_TimeStepFactor >= 1.0))
        vq_TimeStepFactor = 0.5;
      else if ((vq_PercolationRate[i_Layer] > 10.0) && (vq_PercolationRate[i_Layer] <= 15.0) && (vq_TimeStepFactor >= 0.5))
        vq_TimeStepFactor = 0.25;
      else if ((vq_PercolationRate[i_Layer] > 15.0) && (vq_TimeStepFactor >= 0.25))
        vq_TimeStepFactor = 0.125;
    }
  //  cout << "vq_SoilNO3[0]: " << vq_SoilNO3[0] << endl;

  //  if (isnan(vq_SoilNO3[0])) {
  //      cout << "vq_SoilNO3[0]: " << "NAN" << endl;
  //  }

    fq_NDeposition(vs_NDeposition);
    fq_NUptake();

    // Nitrate transport is called according to the set time step
    for (var i_TimeStep = 0; i_TimeStep < (1.0 / vq_TimeStepFactor); i_TimeStep++) {
      fq_NTransport(vs_LeachingDepth, vq_TimeStepFactor);
    }

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

      vq_SoilNO3[i_Layer] = vq_SoilNO3_aq[i_Layer] * vq_SoilMoisture[i_Layer];

      if (vq_SoilNO3[i_Layer] < 0.0) {
        vq_SoilNO3[i_Layer] = 0.0;
      }

      soilColumn[i_Layer].vs_SoilNO3 = vq_SoilNO3[i_Layer];
    } // for

    // disabled (NH4 uptake not implemented in MONICA)
    // NH4_absorption();

  };

  /**
   * @brief Calculation of N deposition
   * Transformation of annual N Deposition into a daily value,
   * that can be used in MONICAs calculations. Addition of this
   * transformed N deposition to ammonium pool of top soil layer.
   *
   * @param vs_NDeposition
   *
   * Kersebaum 1989
   */
  var fq_NDeposition = function (vs_NDeposition) {
    //Daily N deposition in [kg N ha-1 d-1]
    var vq_DailyNDeposition = vs_NDeposition / 365.0;

    // Addition of N deposition to top layer [kg N m-3]
    vq_SoilNO3[0] += vq_DailyNDeposition / (10000.0 * soilColumn[0].vs_LayerThickness);

  };

  /**
   * @brief Calculation of crop N uptake
   * @param
   *
   * Kersebaum 1989
   */
  var fq_NUptake = function () {
    var vq_CropNUptake = 0.0;
    var pc_MinimumAvailableN = centralParameterProvider.userCropParameters.pc_MinimumAvailableN; // kg m-2

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

      // Lower boundary for N exploitation per layer
      if (vc_NUptakeFromLayer[i_Layer] > ((vq_SoilNO3[i_Layer] * vq_LayerThickness[i_Layer]) - pc_MinimumAvailableN)) {

        // Crop N uptake from layer i [kg N m-2]
        vc_NUptakeFromLayer[i_Layer] = ((vq_SoilNO3[i_Layer] * vq_LayerThickness[i_Layer]) - pc_MinimumAvailableN);
      }

      if (vc_NUptakeFromLayer[i_Layer] < 0) {
        vc_NUptakeFromLayer[i_Layer] = 0;
      }

      vq_CropNUptake += vc_NUptakeFromLayer[i_Layer];

      // Subtracting crop N uptake
      vq_SoilNO3[i_Layer] -= vc_NUptakeFromLayer[i_Layer] / vq_LayerThickness[i_Layer];

      // Calculation of solute NO3 concentration on the basis of the soil moisture
      // content before movement of current time step (kg m soil-3 --> kg m solute-3)
      vq_SoilNO3_aq[i_Layer] = vq_SoilNO3[i_Layer] / vq_SoilMoisture[i_Layer];
      if (vq_SoilNO3_aq[i_Layer] < 0) {
  //        cout << "vq_SoilNO3_aq[i_Layer] < 0 " << endl;
      }

    } // for

    soilColumn.vq_CropNUptake = vq_CropNUptake; // [kg m-2]

  };


  /**
   * @brief Calculation of N transport
   * @param vs_LeachingDepth
   *
   * Kersebaum 1989
   */
  var fq_NTransport = function (vs_LeachingDepth, vq_TimeStepFactor) {

    var user_trans = centralParameterProvider.userSoilTransportParameters;
    var vq_DiffusionCoeffStandard = user_trans.pq_DiffusionCoefficientStandard;// [m2 d-1]; old D0
    var AD = user_trans.pq_AD; // Factor a in Kersebaum 1989 p.24 for Loess soils
    var vq_DispersionLength = user_trans.pq_DispersionLength; // [m]
    var vq_SoilProfile = 0.0;
    var vq_LeachingDepthLayerIndex = 0;
    vq_LeachingAtBoundary = 0.0;

    var vq_SoilMoistureGradient = new Array(vs_NumberOfLayers);

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      vq_SoilProfile += vq_LayerThickness[i_Layer];

      if ((vq_SoilProfile - 0.001) < vs_LeachingDepth) {
        vq_LeachingDepthLayerIndex = i_Layer;
      }
    }

    // Caluclation of convection for different cases of flux direction
    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

      var wf0 = soilColumn[0].vs_SoilWaterFlux;
      var lt = soilColumn[i_Layer].vs_LayerThickness;
      var NO3 = vq_SoilNO3_aq[i_Layer];

      if (i_Layer == 0) {
        var pr = vq_PercolationRate[i_Layer] / 1000.0 * vq_TimeStepFactor; // [mm t-1 --> m t-1]
        var NO3_u = vq_SoilNO3_aq[i_Layer + 1];

        if (pr >= 0.0 && wf0 >= 0.0) {

          // old KONV = Konvektion Diss S. 23
          vq_Convection[i_Layer] = (NO3 * pr) / lt; //[kg m-3] * [m t-1] / [m]

        } else if (pr >= 0 && wf0 < 0) {

          vq_Convection[i_Layer] = (NO3 * pr) / lt;

        } else if (pr < 0 && wf0 < 0) {
          vq_Convection[i_Layer] = (NO3_u * pr) / lt;

        } else if (pr < 0 && wf0 >= 0) {

          vq_Convection[i_Layer] = (NO3_u * pr) / lt;
        }

      } else if (i_Layer < vs_NumberOfLayers - 1) {

        // layer > 0 && < bottom
        var pr_o = vq_PercolationRate[i_Layer - 1] / 1000.0 * vq_TimeStepFactor; //[mm t-1 --> m t-1] * [t t-1]
        var pr = vq_PercolationRate[i_Layer] / 1000.0 * vq_TimeStepFactor; // [mm t-1 --> m t-1] * [t t-1]
        var NO3_u = vq_SoilNO3_aq[i_Layer + 1];

        if (pr >= 0.0 && pr_o >= 0.0) {
          var NO3_o = vq_SoilNO3_aq[i_Layer - 1];

          // old KONV = Konvektion Diss S. 23
          vq_Convection[i_Layer] = ((NO3 * pr) - (NO3_o * pr_o)) / lt;

        } else if (pr >= 0 && pr_o < 0) {

          vq_Convection[i_Layer] = ((NO3 * pr) - (NO3 * pr_o)) / lt;

        } else if (pr < 0 && pr_o < 0) {

          vq_Convection[i_Layer] = ((NO3_u * pr) - (NO3 * pr_o)) / lt;

        } else if (pr < 0 && pr_o >= 0) {
          var NO3_o = vq_SoilNO3_aq[i_Layer - 1];
          vq_Convection[i_Layer] = ((NO3_u * pr) - (NO3_o * pr_o)) / lt;
        }

      } else {

        // bottom layer
        var pr_o = vq_PercolationRate[i_Layer - 1] / 1000.0 * vq_TimeStepFactor; // [m t-1] * [t t-1]
        var pr = soilColumn.vs_FluxAtLowerBoundary / 1000.0 * vq_TimeStepFactor; // [m t-1] * [t t-1]

        if (pr >= 0.0 && pr_o >= 0.0) {
          var NO3_o = vq_SoilNO3_aq[i_Layer - 1];

          // KONV = Konvektion Diss S. 23
          vq_Convection[i_Layer] = ((NO3 * pr) - (NO3_o * pr_o)) / lt;

        } else if (pr >= 0 && pr_o < 0) {

          vq_Convection[i_Layer] = ((NO3 * pr) - (NO3 * pr_o)) / lt;

        } else if (pr < 0 && pr_o < 0) {

          vq_Convection[i_Layer] = (-(NO3 * pr_o)) / lt;

        } else if (pr < 0 && pr_o >= 0) {
          var NO3_o = vq_SoilNO3_aq[i_Layer - 1];
          vq_Convection[i_Layer] = (-(NO3_o * pr_o)) / lt;
        }

      }// else
    } // for


    // Calculation of dispersion depending of pore water velocity
    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

      var pr = vq_PercolationRate[i_Layer] / 1000.0 * vq_TimeStepFactor; // [mm t-1 --> m t-1] * [t t-1]
      var pr0 = soilColumn[0].vs_SoilWaterFlux / 1000.0 * vq_TimeStepFactor; // [mm t-1 --> m t-1] * [t t-1]
      var lt = soilColumn[i_Layer].vs_LayerThickness;
      var NO3 = vq_SoilNO3_aq[i_Layer];


      // Original: W(I) --> um Steingehalt korrigierte Feldkapazität
      /** @todo Claas: generelle Korrektur der Feldkapazität durch den Steingehalt */
      if (i_Layer == vs_NumberOfLayers - 1) {
        vq_PoreWaterVelocity[i_Layer] = abs((pr) / vq_FieldCapacity[i_Layer]); // [m t-1]
        vq_SoilMoistureGradient[i_Layer] = (vq_SoilMoisture[i_Layer]); //[m3 m-3]
      } else {
        vq_PoreWaterVelocity[i_Layer] = abs((pr) / ((vq_FieldCapacity[i_Layer]
                + vq_FieldCapacity[i_Layer + 1]) * 0.5)); // [m t-1]
        vq_SoilMoistureGradient[i_Layer] = ((vq_SoilMoisture[i_Layer])
           + (vq_SoilMoisture[i_Layer + 1])) * 0.5; //[m3 m-3]
      }

      vq_DiffusionCoeff[i_Layer] = vq_DiffusionCoeffStandard
           * (AD * exp(vq_SoilMoistureGradient[i_Layer] * 2.0 * 5.0)
           / vq_SoilMoistureGradient[i_Layer]) * vq_TimeStepFactor; //[m2 t-1] * [t t-1]

      // Dispersion coefficient, old DB
      if (i_Layer == 0) {

        vq_DispersionCoeff[i_Layer] = vq_SoilMoistureGradient[i_Layer] * (vq_DiffusionCoeff[i_Layer] // [m2 t-1]
    + vq_DispersionLength * vq_PoreWaterVelocity[i_Layer]) // [m] * [m t-1]
    - (0.5 * lt * abs(pr)) // [m] * [m t-1]
    + ((0.5 * vq_TimeStep * vq_TimeStepFactor * abs((pr + pr0) / 2.0))  // [t] * [t t-1] * [m t-1]
    * vq_PoreWaterVelocity[i_Layer]); // * [m t-1]
    //-->[m2 t-1]
      } else {
        var pr_o = vq_PercolationRate[i_Layer - 1] / 1000.0 * vq_TimeStepFactor; // [m t-1]

        vq_DispersionCoeff[i_Layer] = vq_SoilMoistureGradient[i_Layer] * (vq_DiffusionCoeff[i_Layer]
    + vq_DispersionLength * vq_PoreWaterVelocity[i_Layer]) - (0.5 * lt * abs(pr))
    + ((0.5 * vq_TimeStep * vq_TimeStepFactor * abs((pr + pr_o) / 2.0)) * vq_PoreWaterVelocity[i_Layer]);
      }

      //old DISP = Gesamt-Dispersion (D in Diss S. 23)
      if (i_Layer == 0) {
        var NO3_u = vq_SoilNO3_aq[i_Layer + 1];
        // vq_Dispersion = Dispersion upwards or downwards, depending on the position in the profile [kg m-3]
        vq_Dispersion[i_Layer] = -vq_DispersionCoeff[i_Layer] * (NO3 - NO3_u) / (lt * lt); // [m2] * [kg m-3] / [m2]

      } else if (i_Layer < vs_NumberOfLayers - 1) {
        var NO3_o = vq_SoilNO3_aq[i_Layer - 1];
        var NO3_u = vq_SoilNO3_aq[i_Layer + 1];
        vq_Dispersion[i_Layer] = (vq_DispersionCoeff[i_Layer - 1] * (NO3_o - NO3) / (lt * lt))
    - (vq_DispersionCoeff[i_Layer] * (NO3 - NO3_u) / (lt * lt));
      } else {
        var NO3_o = vq_SoilNO3_aq[i_Layer - 1];
        vq_Dispersion[i_Layer] = vq_DispersionCoeff[i_Layer - 1] * (NO3_o - NO3) / (lt * lt);
      }
    } // for

    // Update of NO3 concentration
    // including transfomation back into [kg NO3-N m soil-3]
    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {


      vq_SoilNO3_aq[i_Layer] += (vq_Dispersion[i_Layer] - vq_Convection[i_Layer]) / vq_SoilMoisture[i_Layer];
  //    double no3 = vq_SoilNO3_aq[i_Layer];
  //    double disp = vq_Dispersion[i_Layer];
  //    double conv = vq_Convection[i_Layer];
  //    double sm = vq_SoilMoisture[i_Layer];
  //    cout << i_Layer << "\t" << no3 << "\t" << disp << "\t" << conv << "\t" <<  sm << endl;
    }



    if (vq_PercolationRate[vq_LeachingDepthLayerIndex] > 0.0) {

      //vq_LeachingDepthLayerIndex = gewählte Auswaschungstiefe
      var lt = soilColumn[vq_LeachingDepthLayerIndex].vs_LayerThickness;
      var NO3 = vq_SoilNO3_aq[vq_LeachingDepthLayerIndex];

      if (vq_LeachingDepthLayerIndex < vs_NumberOfLayers - 1) {
        var pr_u = vq_PercolationRate[vq_LeachingDepthLayerIndex + 1] / 1000.0 * vq_TimeStepFactor;// [m t-1]
        var NO3_u = vq_SoilNO3_aq[vq_LeachingDepthLayerIndex + 1]; // [kg m-3]
        //vq_LeachingAtBoundary: Summe für Auswaschung (Diff + Konv), old OUTSUM
        vq_LeachingAtBoundary += ((pr_u * NO3) / lt * 10000.0 * lt) + ((vq_DispersionCoeff[vq_LeachingDepthLayerIndex]
    * (NO3 - NO3_u)) / (lt * lt) * 10000.0 * lt); //[kg ha-1]
      } else {
        var pr_u = soilColumn.vs_FluxAtLowerBoundary / 1000.0 * vq_TimeStepFactor; // [m t-1]
        vq_LeachingAtBoundary += pr_u * NO3 / lt * 10000.0 * lt; //[kg ha-1]
      }

    } else {

      var pr_u = vq_PercolationRate[vq_LeachingDepthLayerIndex] / 1000.0 * vq_TimeStepFactor;
      var lt = soilColumn[vq_LeachingDepthLayerIndex].vs_LayerThickness;
      var NO3 = vq_SoilNO3_aq[vq_LeachingDepthLayerIndex];

      if (vq_LeachingDepthLayerIndex < vs_NumberOfLayers - 1) {
        var NO3_u = vq_SoilNO3_aq[vq_LeachingDepthLayerIndex + 1];
        vq_LeachingAtBoundary += ((pr_u * NO3_u) / (lt * 10000.0 * lt)) + vq_DispersionCoeff[vq_LeachingDepthLayerIndex]
    * (NO3 - NO3_u) / ((lt * lt) * 10000.0 * lt); //[kg ha-1]
      }
    }

  //  cout << "vq_LeachingAtBoundary: " << vq_LeachingAtBoundary << endl;
  };

  /* Johnson eqs. 5.39 ff. 
     Experimeantal implementation (disabled by default)
  */
  function NH4_absorption() {

    /* TODO: make C_a_mx depend on clay content */
    var C_a_mx_ref = C_a_mx = 0.0005 /* [kg (N-NH4) kg-1 (soil)] */
      , alpha = 1000    /* [-] */
      ;

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
    
      var layer = soilColumn[i_Layer]
        // , C_a_mx = C_a_mx_ref * (layer.vs_SoilClayContent > 0.3 ? 1 : layer.vs_SoilClayContent / 0.3)
        , rho_b = layer.vs_SoilBulkDensity() /* [kg (soil) m-3] */
        , rho_w = 1000 /* [kg (water) m-3] */
        , m = layer.vs_SoilNH4 + layer.vs_SoilNH4_a /* total NH4 [kg (N-NH4) m-3] */
        , theta = layer.get_Vs_SoilMoisture_m3()
          /* a-b-c quadratic function */
        , a = alpha * theta * rho_w
        , b = C_a_mx * (alpha * rho_b + theta * rho_w) - alpha * m
        , c = -m * C_a_mx 
        ;

      /* [kg (N-NH4) kg (H20)] */
      var C_s = (-b + sqrt(pow(b, 2) - 4 * a * c)) / (2 * a);
      /* [kg (N-NH4) m-3] */
      layer.vs_SoilNH4 = C_s * theta * rho_w;
      layer.vs_SoilNH4_a = m - layer.vs_SoilNH4;

    }

  };


  /**
   * @brief Returns Nitrate content for each layer [i]
   * @return Soil NO3 content
   */
  var get_SoilNO3 = function (i_Layer) {
    return vq_SoilNO3[i_Layer];
  };

  /**
   * @brief Returns N leaching at leaching depth [kg ha-1]
   * @return Soil NO3 content
   */
  var get_NLeaching = function () {
    return vq_LeachingAtBoundary;
  };

  var put_Crop = function (c) {
    crop = c;
  };

  var remove_Crop = function () {
    crop = null;
  };

  return {
      step: step
    , fq_NDeposition: fq_NDeposition  // calculates daily N deposition
    , fq_NUptake: fq_NUptake // puts crop N uptake into effect
    , fq_NTransport: fq_NTransport  // calcuates N transport in soil
    , put_Crop: put_Crop
    , remove_Crop: remove_Crop
    , get_SoilNO3: get_SoilNO3
    , get_NLeaching: get_NLeaching
  };

};

