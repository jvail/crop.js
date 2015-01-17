
var SoilTemperature = function (sc, mm, cpp) {

  var _soilColumn = sc,
      monica = mm,
      centralParameterProvider = cpp,
      _soilColumn_vt_GroundLayer = new SoilLayer(),
      _soilColumn_vt_BottomLayer = new SoilLayer(),
      soilColumn = {
        sc: sc,
        gl: _soilColumn_vt_GroundLayer,
        bl: _soilColumn_vt_BottomLayer,
        vs_nols: sc.vs_NumberOfLayers(),
        at: function (i) { 
          if (i < this.vs_nols){
            return this[i];
          } else {
            if (i < this.vs_nols + 1)
                return this.gl;
            return this.bl;
          }
        }
      };

  for (var i = 0; i < sc.vs_NumberOfLayers(); i++)
    soilColumn[i] = sc[i];

  soilColumn[sc.vs_NumberOfLayers()] = soilColumn.gl;
  soilColumn[sc.vs_NumberOfLayers() + 1] = soilColumn.bl;


  var vt_NumberOfLayers = sc.vs_NumberOfLayers() + 2,
      vs_NumberOfLayers = sc.vs_NumberOfLayers(),  //extern
      vs_SoilMoisture_const = new Array(vt_NumberOfLayers),   //intern
      vt_SoilTemperature = new Array(vt_NumberOfLayers),      //result = vs_soiltemperature
      vt_V = new Array(vt_NumberOfLayers),                    //intern
      vt_VolumeMatrix = new Array(vt_NumberOfLayers),         //intern
      vt_VolumeMatrixOld = new Array(vt_NumberOfLayers),      //intern
      vt_B = new Array(vt_NumberOfLayers),                    //intern
      vt_MatrixPrimaryDiagonal = new Array(vt_NumberOfLayers),//intern
      vt_MatrixSecundaryDiagonal = new Array(vt_NumberOfLayers + 1),   //intern
      vt_HeatConductivity = new Array(vt_NumberOfLayers),              //intern
      vt_HeatConductivityMean = new Array(vt_NumberOfLayers),          //intern
      vt_HeatCapacity = new Array(vt_NumberOfLayers),                    //intern
      dampingFactor = 0.8,
      vt_HeatFlow = 0.0;


    for (var i = 0; i < vt_NumberOfLayers; i++) {
      vs_SoilMoisture_const[i] = 0.0;   
      vt_SoilTemperature[i] = 0.0;    
      vt_V[i] = 0.0;                    
      vt_VolumeMatrix[i] = 0.0;         
      vt_VolumeMatrixOld[i] = 0.0;      
      vt_B[i] = 0.0;                    
      vt_MatrixPrimaryDiagonal[i] = 0.0;
      vt_MatrixSecundaryDiagonal[i] = 0.0;   
      vt_HeatConductivity[i] = 0.0;              
      vt_HeatConductivityMean[i] = 0.0;          
      vt_HeatCapacity[i] = 0.0;                        
    }

    vt_MatrixPrimaryDiagonal[i + 1] = 0.0;

  logger(MSG.INFO, "Constructor: SoilTemperature");

  var user_temp = cpp.userSoilTemperatureParameters;

  var pt_BaseTemperature           = user_temp.pt_BaseTemperature;  // temp für unterste Schicht (durch. Jahreslufttemp-)
  var pt_InitialSurfaceTemperature = user_temp.pt_InitialSurfaceTemperature; // Replace by Mean air temperature
  var pt_Ntau                      = user_temp.pt_NTau;
  var pt_TimeStep                  = centralParameterProvider.userEnvironmentParameters.p_timeStep;  // schon in soil_moisture in DB extrahiert
  var ps_QuartzRawDensity          = user_temp.pt_QuartzRawDensity;
  var pt_SpecificHeatCapacityWater = user_temp.pt_SpecificHeatCapacityWater;   // [J kg-1 K-1]
  var pt_SpecificHeatCapacityQuartz = user_temp.pt_SpecificHeatCapacityQuartz; // [J kg-1 K-1]
  var pt_SpecificHeatCapacityAir = user_temp.pt_SpecificHeatCapacityAir;       // [J kg-1 K-1]
  var pt_SpecificHeatCapacityHumus = user_temp.pt_SpecificHeatCapacityHumus;   // [J kg-1 K-1]
  var pt_DensityWater = user_temp.pt_DensityWater;   // [kg m-3]
  var pt_DensityAir = user_temp.pt_DensityAir;       // [kg m-3]
  var pt_DensityHumus = user_temp.pt_DensityHumus;   // [kg m-3]


  //  cout << "Monica: pt_BaseTemperature: " << pt_BaseTemperature << endl;
  //  cout << "Monica: pt_InitialSurfaceTemperature: " << pt_InitialSurfaceTemperature << endl;
  //  cout << "Monica: NTau: " << pt_Ntau << endl;

    // according to sensitivity tests, soil moisture has minor
    // influence to the temperature and thus can be set as constant
    // by xenia
  var ps_SoilMoisture_const = user_temp.pt_SoilMoisture;
  //  cout << "Monica: ps_SoilMoisture_const: " << ps_SoilMoisture_const << endl;

  // Initialising the soil properties until a database feed is realised
  for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

    // Initialising the soil temperature
    vt_SoilTemperature[i_Layer] =  (  (1.0 - ((i_Layer) / vs_NumberOfLayers))
              * pt_InitialSurfaceTemperature)
           +( ((i_Layer) / vs_NumberOfLayers) * pt_BaseTemperature);

    // Initialising the soil moisture content
    // Soil moisture content is held constant for numeric stability.
    // If dynamic soil moisture should be used, the energy balance
    // must be extended by latent heat flow.
    vs_SoilMoisture_const[i_Layer] = ps_SoilMoisture_const;

  }

  // Determination of the geometry parameters for soil temperature calculation
  // with Cholesky-Verfahren

  vt_V[0] = soilColumn[0].vs_LayerThickness;
  vt_B[0] = 2.0 / soilColumn[0].vs_LayerThickness;

  var vt_GroundLayer = vt_NumberOfLayers - 2;
  var vt_BottomLayer = vt_NumberOfLayers - 1;

  soilColumn[vt_GroundLayer].vs_LayerThickness = 2.0 * soilColumn[vt_GroundLayer - 1].vs_LayerThickness;
  soilColumn[vt_BottomLayer].vs_LayerThickness = 1.0;
  vt_SoilTemperature[vt_GroundLayer] = (vt_SoilTemperature[vt_GroundLayer - 1] + pt_BaseTemperature) * 0.5;
  vt_SoilTemperature[vt_BottomLayer] = pt_BaseTemperature;

  var vt_h0 = soilColumn[0].vs_LayerThickness;

  for (var i_Layer = 1; i_Layer < vt_NumberOfLayers; i_Layer++) {

    var vt_h1 = soilColumn[i_Layer].vs_LayerThickness; // [m]
    vt_B[i_Layer] = 2.0 / (vt_h1 + vt_h0); // [m]
    vt_V[i_Layer] = vt_h1 * pt_Ntau; // [m3]
    vt_h0 = vt_h1;
  }

  // End determination of the geometry parameters for soil temperature calculation


  // initialising heat state variables
  for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
    // logger(MSG.INFO, "layer: " + i_Layer);

    ///////////////////////////////////////////////////////////////////////////////////////
    // Calculate heat conductivity following Neusypina 1979
    // Neusypina, T.A. (1979): Rascet teplovo rezima pocvi v modeli formirovanija urozaja.
    // Teoreticeskij osnovy i kolicestvennye metody programmirovanija urozaev. Leningrad,
    // 53 -62.
    // Note: in this original publication lambda is calculated in cal cm-1 s-1 K-1!
    ///////////////////////////////////////////////////////////////////////////////////////
    var sbdi = soilColumn.at(i_Layer).vs_SoilBulkDensity();
    var smi = vs_SoilMoisture_const[i_Layer];

    // logger(MSG.INFO, "sbdi: " + sbdi);  
    // logger(MSG.INFO, "smi: " + smi);  

    vt_HeatConductivity[i_Layer] = ((3.0 * (sbdi / 1000.0) - 1.7) * 0.001) /
           (1.0 + (11.5 - 5.0 * (sbdi / 1000.0)) *
            exp((-50.0) * pow((smi / (sbdi / 1000.0)), 1.5))) *
           86400.0 * (pt_TimeStep) * //  gives result in [days]
           100.0  //  gives result in [m]
           * 4.184; // gives result in [J]
           // --> [J m-1 d-1 K-1]

    // logger(MSG.INFO, "vt_HeatConductivity");       
    // logger(MSG.INFO, vt_HeatConductivity);      

    ///////////////////////////////////////////////////////////////////////////////////////
    // Calculate specific heat capacity following DAISY
    // Abrahamsen, P, and S. Hansen (2000): DAISY - An open soil-crop-atmosphere model
    // system. Environmental Modelling and Software 15, 313-330
    ///////////////////////////////////////////////////////////////////////////////////////

    var cw = pt_SpecificHeatCapacityWater;
    var cq = pt_SpecificHeatCapacityQuartz;
    var ca = pt_SpecificHeatCapacityAir;
    var ch = pt_SpecificHeatCapacityHumus;
    var dw = pt_DensityWater;
    var dq = ps_QuartzRawDensity;
    var da = pt_DensityAir;
    var dh = pt_DensityHumus;
    var spv = soilColumn[i_Layer].get_Saturation();
    var som = soilColumn.at(i_Layer).vs_SoilOrganicMatter() / da * sbdi; // Converting [kg kg-1] to [m3 m-3]


    vt_HeatCapacity[i_Layer] = (smi * dw * cw)
       +((spv-smi) * da * ca)
       + (som * dh * ch)
       + ( (1.0 - spv - som) * dq * cq);
       // --> [J m-3 K-1]
  } // for


  vt_HeatCapacity[vt_GroundLayer] = vt_HeatCapacity[vt_GroundLayer - 1];
  vt_HeatCapacity[vt_BottomLayer] = vt_HeatCapacity[vt_GroundLayer];
  vt_HeatConductivity[vt_GroundLayer] = vt_HeatConductivity[vt_GroundLayer - 1];
  vt_HeatConductivity[vt_BottomLayer] = vt_HeatConductivity[vt_GroundLayer];

  // Initialisation soil surface temperature
  vt_SoilSurfaceTemperature = pt_InitialSurfaceTemperature;


  ///////////////////////////////////////////////////////////////////////////////////////
  // Initialising Numerical Solution
  // Suckow,F. (1985): A model serving the calculation of soil
  // temperatures. Zeitschrift für Meteorologie 35 (1), 66 -70.
  ///////////////////////////////////////////////////////////////////////////////////////

  // Calculation of the mean heat conductivity per layer
  vt_HeatConductivityMean[0] = vt_HeatConductivity[0];
  // logger(MSG.INFO, vt_HeatConductivityMean);

  for (var i_Layer = 1; i_Layer < vt_NumberOfLayers; i_Layer++) {

    var lti_1 = soilColumn.at(i_Layer - 1).vs_LayerThickness;
    var lti = soilColumn.at(i_Layer).vs_LayerThickness;
    var hci_1 = vt_HeatConductivity[i_Layer - 1];
    var hci = vt_HeatConductivity[i_Layer];

    // @todo <b>Claas: </b>Formel nochmal durchgehen
    vt_HeatConductivityMean[i_Layer] = ((lti_1 * hci_1) + (lti * hci)) / (lti + lti_1);
    // logger(MSG.INFO, vt_HeatConductivityMean);

  } // for

  // Determination of the volume matrix
  for (var i_Layer = 0; i_Layer < vt_NumberOfLayers; i_Layer++) {

    vt_VolumeMatrix[i_Layer] = vt_V[i_Layer] * vt_HeatCapacity[i_Layer]; // [J K-1]

    // If initial entry, rearrengement of volume matrix
    vt_VolumeMatrixOld[i_Layer] = vt_VolumeMatrix[i_Layer];

    // Determination of the matrix secundary diagonal
    vt_MatrixSecundaryDiagonal[i_Layer] = -vt_B[i_Layer] * vt_HeatConductivityMean[i_Layer]; //[J K-1]

  }




  vt_MatrixSecundaryDiagonal[vt_BottomLayer + 1] = 0.0;

  // Determination of the matrix primary diagonal
  for (var i_Layer = 0; i_Layer < vt_NumberOfLayers; i_Layer++) {

    vt_MatrixPrimaryDiagonal[i_Layer] =   vt_VolumeMatrix[i_Layer]
          - vt_MatrixSecundaryDiagonal[i_Layer]
          - vt_MatrixSecundaryDiagonal[i_Layer + 1]; //[J K-1]
  }

  /**
   * @brief Single calculation step
   * @param tmin
   * @param tmax
   * @param globrad
   */
  var step = function (tmin, tmax, globrad) {

    if (DEBUG) debug(arguments);

    var vt_GroundLayer = vt_NumberOfLayers - 2;
    var vt_BottomLayer = vt_NumberOfLayers - 1;

    var vt_Solution = new Array(vt_NumberOfLayers);//                = new double [vt_NumberOfLayers];
    var vt_MatrixDiagonal = new Array(vt_NumberOfLayers);//          = new double [vt_NumberOfLayers];
    var vt_MatrixLowerTriangle = new Array(vt_NumberOfLayers);//     = new double [vt_NumberOfLayers];

    for (var i = 0; i < vt_NumberOfLayers; i++) {
      vt_Solution[i] = 0.0;
      vt_MatrixDiagonal[i] = 0.0;
      vt_MatrixLowerTriangle[i] = 0.0;
    }

    /////////////////////////////////////////////////////////////
    // Internal Subroutine Numerical Solution - Suckow,F. (1986)
    /////////////////////////////////////////////////////////////

    vt_HeatFlow = f_SoilSurfaceTemperature(tmin, tmax, globrad) * vt_B[0] * vt_HeatConductivityMean[0]; //[J]

    // Determination of the equation's right side
    vt_Solution[0] =  (vt_VolumeMatrixOld[0]
       + (vt_VolumeMatrix[0] - vt_VolumeMatrixOld[0]) / soilColumn[0].vs_LayerThickness)
        * vt_SoilTemperature[0] + vt_HeatFlow;

    // logger(MSG.INFO, "f_SoilSurfaceTemperature(tmin, tmax, globrad): " + f_SoilSurfaceTemperature(tmin, tmax, globrad));
    // logger(MSG.INFO, "vt_B[0]: " + vt_B[0]);
    // logger(MSG.INFO, "vt_HeatConductivityMean[0]: " + vt_HeatConductivityMean[0]);
    // logger(MSG.INFO, "vt_HeatFlow: " + vt_HeatFlow);
    // logger(MSG.INFO, "vt_Solution[0]: " + vt_Solution[0]);

    for (var i_Layer = 1; i_Layer < vt_NumberOfLayers; i_Layer++) {

      vt_Solution[i_Layer] =   (vt_VolumeMatrixOld[i_Layer]
        + (vt_VolumeMatrix[i_Layer] - vt_VolumeMatrixOld[i_Layer])
        / soilColumn[i_Layer].vs_LayerThickness)
          * vt_SoilTemperature[i_Layer];
    } // for

      // logger(MSG.INFO, vt_Solution);

    // end subroutine NumericalSolution

    /////////////////////////////////////////////////////////////
    // Internal Subroutine Cholesky Solution Method
    //
    // Solution of EX=Z with E tridiagonal and symmetric
    // according to CHOLESKY (E=LDL')
    /////////////////////////////////////////////////////////////

    // Determination of the lower matrix triangle L and the diagonal matrix D
    vt_MatrixDiagonal[0] = vt_MatrixPrimaryDiagonal[0];

    for (var i_Layer = 1; i_Layer < vt_NumberOfLayers; i_Layer++) {

      vt_MatrixLowerTriangle[i_Layer] = vt_MatrixSecundaryDiagonal[i_Layer] / vt_MatrixDiagonal[i_Layer - 1];
      vt_MatrixDiagonal[i_Layer] =   vt_MatrixPrimaryDiagonal[i_Layer]
             - (vt_MatrixLowerTriangle[i_Layer] * vt_MatrixSecundaryDiagonal[i_Layer]);
    }

    // Solution of LY=Z
    for (var i_Layer = 1; i_Layer < vt_NumberOfLayers; i_Layer++) {

      vt_Solution[i_Layer] =   vt_Solution[i_Layer]
               - (vt_MatrixLowerTriangle[i_Layer] * vt_Solution[i_Layer - 1]);
    }

    // Solution of L'X=D(-1)Y
    vt_Solution[vt_BottomLayer] = vt_Solution[vt_BottomLayer] / vt_MatrixDiagonal[vt_BottomLayer];


    for (var i_Layer = 0; i_Layer < vt_BottomLayer; i_Layer++) {

      var j_Layer = (vt_BottomLayer - 1) - i_Layer;
      var j_Layer1 = j_Layer + 1;
      vt_Solution[j_Layer] =   (vt_Solution[j_Layer] / vt_MatrixDiagonal[j_Layer])
               - (vt_MatrixLowerTriangle[j_Layer1] * vt_Solution[j_Layer1]);
    }

    // end subroutine CholeskyMethod

    // Internal Subroutine Rearrangement
    for(var i_Layer = 0; i_Layer < vt_NumberOfLayers; i_Layer++) {
      vt_SoilTemperature[i_Layer] = vt_Solution[i_Layer];
    }

    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {

      vt_VolumeMatrixOld[i_Layer] = vt_VolumeMatrix[i_Layer];
      soilColumn[i_Layer].set_Vs_SoilTemperature(vt_SoilTemperature[i_Layer]);
    }

    vt_VolumeMatrixOld[vt_GroundLayer] = vt_VolumeMatrix[vt_GroundLayer];
    vt_VolumeMatrixOld[vt_BottomLayer] = vt_VolumeMatrix[vt_BottomLayer];

  };


  /**
   * @brief  Soil surface temperature [B0C]
   *
   * Soil surface temperature caluclation following Williams 1984
   *
   * @param tmin
   * @param tmax
   * @param globrad
   */
  var f_SoilSurfaceTemperature = function (tmin, tmax, globrad) {

    if (DEBUG) debug(arguments);

    var shading_coefficient = dampingFactor;

    var soil_coverage = 0.0;
    if (monica.cropGrowth()) {
      soil_coverage = monica.cropGrowth().get_SoilCoverage();
    }
    shading_coefficient =  0.1 + ((soil_coverage * dampingFactor) + ((1-soil_coverage) * (1-dampingFactor)));


    // Soil surface temperature caluclation following Williams 1984
    var vt_SoilSurfaceTemperatureOld = vt_SoilSurfaceTemperature;

    // corrected for very low radiation in winter
    if (globrad < 8.33) {
      globrad = 8.33;
    }

    vt_SoilSurfaceTemperature =   (1.0 - shading_coefficient)
          * (tmin + ((tmax - tmin) * pow((0.03 * globrad),0.5)))
          + shading_coefficient * vt_SoilSurfaceTemperatureOld;

    // damping negative temperatures due to heat loss for freezing water
    if (vt_SoilSurfaceTemperature < 0.0){
      vt_SoilSurfaceTemperature = vt_SoilSurfaceTemperature * 0.5;
    }
    return vt_SoilSurfaceTemperature;
  };

  /**
   * @brief Returns soil surface temperature.
   * @param
   * @return Soil surface temperature
   */
  var get_SoilSurfaceTemperature = function () {
    return vt_SoilSurfaceTemperature;
  };

  /**
   * @brief Returns soil temperature of a layer.
   * @param layer Index of layer
   * @return Soil temperature
   */
  get_SoilTemperature = function (layer) {
    return soilColumn[layer].get_Vs_SoilTemperature();
  };

  /**
   * @brief Returns heat conductivity of a layer.
   * @param layer Index of layer
   * @return Soil heat conductivity
   */
  var get_HeatConductivity = function (layer) {
    return vt_HeatConductivity[layer];
  };

  /**
   * @brief Returns mean soil temperature.
   * @param sumLT
   * @return Temperature
   */
  var get_AvgTopSoilTemperature = function (sumLT) {
    if (arguments.length === 0)
      sumLT = 0.3;
    var lsum = 0;
    var tempSum = 0;
    var count = 0;

    for (var i = 0; i < vs_NumberOfLayers; i++) {
      count++;
      tempSum += soilColumn[i].get_Vs_SoilTemperature();
      lsum += soilColumn[i].vs_LayerThickness;
      if(lsum >= sumLT) {
        break;
      }
    }

    return count < 1 ? 0 : tempSum / (count);
  };

  return {
      step: step
    , f_SoilSurfaceTemperature: f_SoilSurfaceTemperature
    , get_SoilSurfaceTemperature: get_SoilSurfaceTemperature
    , get_SoilTemperature: get_SoilTemperature
    , get_HeatConductivity: get_HeatConductivity
    , get_AvgTopSoilTemperature: get_AvgTopSoilTemperature
    , getDampingFactor: function () { return dampingFactor; }
    , setDampingFactor: function (factor) { dampingFactor = factor; }
    , vt_SoilSurfaceTemperature: vt_SoilSurfaceTemperature
  };

};