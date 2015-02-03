
var SoilOrganic = function (sc, gps, stps, cpp) {

  var soilColumn = sc,
      generalParams = gps,
      siteParams = stps,
      centralParameterProvider = cpp,
      vs_NumberOfLayers = sc.vs_NumberOfLayers(),
      vs_NumberOfOrganicLayers = sc.vs_NumberOfOrganicLayers(),
      addedOrganicMatter = false,
      irrigationAmount = 0,
      vo_ActDenitrificationRate = new Float64Array(sc.vs_NumberOfOrganicLayers()),  //[kg N m-3 d-1]
      vo_AOM_FastDeltaSum =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_AOM_FastInput = 0,
      vo_AOM_FastSum =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_AOM_SlowDeltaSum =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_AOM_SlowInput = 0,
      vo_AOM_SlowSum =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_CBalance =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_DecomposerRespiration = 0.0,
      vo_InertSoilOrganicC =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_N2O_Produced = 0.0,
      vo_NetEcosystemExchange = 0.0,
      vo_NetEcosystemProduction = 0.0,
      vo_NetNMineralisation = 0.0,
      vo_NetNMineralisationRate =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_Total_NH3_Volatilised = 0.0,
      vo_NH3_Volatilised = 0.0,
      vo_SMB_CO2EvolutionRate =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SMB_FastDelta =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SMB_SlowDelta =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SoilOrganicC =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SOM_FastDelta =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SOM_FastInput = 0,
      vo_SOM_SlowDelta =  new Float64Array(sc.vs_NumberOfOrganicLayers()),
      vo_SumDenitrification = 0.0,
      vo_SumNetNMineralisation = 0.0,
      vo_SumN2O_Produced = 0.0,
      vo_SumNH3_Volatilised = 0.0,
      vo_TotalDenitrification = 0.0,
      incorporation = false,
      crop = null;

      // JS! unused in cpp
      // vs_SoilMineralNContent = new Float64Array(sc.vs_NumberOfOrganicLayers()),


  // Subroutine Pool initialisation
  var po_SOM_SlowUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_SOM_SlowUtilizationEfficiency;
  var po_PartSOM_to_SMB_Slow = centralParameterProvider.userSoilOrganicParameters.po_PartSOM_to_SMB_Slow;
  var po_SOM_FastUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_SOM_FastUtilizationEfficiency;
  var po_PartSOM_to_SMB_Fast = centralParameterProvider.userSoilOrganicParameters.po_PartSOM_to_SMB_Fast;
  var po_SOM_SlowDecCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_SOM_SlowDecCoeffStandard;
  var po_SOM_FastDecCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_SOM_FastDecCoeffStandard;
  var po_PartSOM_Fast_to_SOM_Slow = centralParameterProvider.userSoilOrganicParameters.po_PartSOM_Fast_to_SOM_Slow;

  //Conversion of soil organic carbon weight fraction to volume unit
  for(var i_Layer = 0; i_Layer < vs_NumberOfOrganicLayers; i_Layer++) {

    vo_SoilOrganicC[i_Layer] = soilColumn[i_Layer].vs_SoilOrganicCarbon() * soilColumn[i_Layer].vs_SoilBulkDensity(); //[kg C kg-1] * [kg m-3] --> [kg C m-3]

    // Falloon et al. (1998): Estimating the size of the inert organic matter pool
    // from total soil oragnic carbon content for use in the Rothamsted Carbon model.
    // Soil Biol. Biochem. 30 (8/9), 1207-1211. for values in t C ha-1.
  // vo_InertSoilOrganicC is calculated back to [kg C m-3].
    vo_InertSoilOrganicC[i_Layer] = (0.049 * pow((vo_SoilOrganicC[i_Layer] // [kg C m-3]
            * soilColumn[i_Layer].vs_LayerThickness // [kg C m-2]
            / 1000 * 10000.0), 1.139)) // [t C ha-1]
          / 10000.0 * 1000.0 // [kg C m-2]
          / soilColumn[i_Layer].vs_LayerThickness; // [kg C m-3]

    vo_SoilOrganicC[i_Layer] -= vo_InertSoilOrganicC[i_Layer]; // [kg C m-3]

    // Initialisation of pool SMB_Slow [kg C m-3]
    soilColumn[i_Layer].vs_SMB_Slow = po_SOM_SlowUtilizationEfficiency
         * po_PartSOM_to_SMB_Slow * vo_SoilOrganicC[i_Layer];

    // Initialisation of pool SMB_Fast [kg C m-3]
    soilColumn[i_Layer].vs_SMB_Fast = po_SOM_FastUtilizationEfficiency
              * po_PartSOM_to_SMB_Fast * vo_SoilOrganicC[i_Layer];

    // Initialisation of pool SOM_Slow [kg C m-3]
    soilColumn[i_Layer].vs_SOM_Slow = vo_SoilOrganicC[i_Layer] / (1.0 + po_SOM_SlowDecCoeffStandard
              / (po_SOM_FastDecCoeffStandard * po_PartSOM_Fast_to_SOM_Slow));

    // Initialisation of pool SOM_Fast [kg C m-3]
    soilColumn[i_Layer].vs_SOM_Fast = vo_SoilOrganicC[i_Layer] - soilColumn[i_Layer].vs_SOM_Slow;

    // Soil Organic Matter pool update [kg C m-3]
    vo_SoilOrganicC[i_Layer] -= soilColumn[i_Layer].vs_SMB_Slow + soilColumn[i_Layer].vs_SMB_Fast;

    soilColumn[i_Layer].set_SoilOrganicCarbon((vo_SoilOrganicC[i_Layer] + vo_InertSoilOrganicC[i_Layer]) / soilColumn[i_Layer].vs_SoilBulkDensity()); // [kg C m-3] / [kg m-3] --> [kg C kg-1]

  soilColumn[i_Layer].set_SoilOrganicMatter((vo_SoilOrganicC[i_Layer] + vo_InertSoilOrganicC[i_Layer]) / ORGANIC_CONSTANTS.PO_SOM_TO_C
              / soilColumn[i_Layer].vs_SoilBulkDensity());  // [kg C m-3] / [kg m-3] --> [kg C kg-1]


    vo_ActDenitrificationRate[i_Layer] = 0.0;
  } // for

  var step = function (
    vw_MeanAirTemperature,
    vw_Precipitation,
    vw_WindSpeed
    ) 
  {

    var vc_NetPrimaryProduction = crop ? crop.get_NetPrimaryProduction() : 0;

    debug('vc_NetPrimaryProduction', vc_NetPrimaryProduction);

    //fo_OM_Input(vo_AOM_Addition);
    fo_Urea(vw_Precipitation + irrigationAmount);
    // Mineralisation Immobilisitation Turn-Over
    fo_MIT();
    fo_Volatilisation(addedOrganicMatter, vw_MeanAirTemperature, vw_WindSpeed);
    fo_Nitrification();
    fo_Denitrification();
    fo_N2OProduction();
    fo_PoolUpdate();

    vo_NetEcosystemProduction =
            fo_NetEcosystemProduction(vc_NetPrimaryProduction, vo_DecomposerRespiration);
    vo_NetEcosystemExchange =
            fo_NetEcosystemExchange(vc_NetPrimaryProduction, vo_DecomposerRespiration);

    vo_SumNH3_Volatilised += vo_NH3_Volatilised;

    vo_SumN2O_Produced += vo_N2O_Produced;

    //clear everything for next step
    //thus in order apply irrigation water or fertiliser, this has to be
    //done before the stepping method
    irrigationAmount = 0.0;
    vo_AOM_SlowInput = 0.0;
    vo_AOM_FastInput = 0.0;
    vo_SOM_FastInput = 0.0;
    addedOrganicMatter = false;
  };

  var addOrganicMatter = function (
    params,
    amount,
    nConcentration
    )
  {
    debug("SoilOrganic: addOrganicMatter: " + params.toString());
    var vo_AddedOrganicMatterAmount = amount;
    var vo_AddedOrganicMatterNConcentration = nConcentration;


    var vo_AOM_DryMatterContent = params.vo_AOM_DryMatterContent;
    var vo_AOM_NH4Content = params.vo_AOM_NH4Content;
    var vo_AOM_NO3Content = params.vo_AOM_NO3Content;
    var vo_AOM_CarbamidContent = params.vo_AOM_CarbamidContent;
    var vo_PartAOM_to_AOM_Slow = params.vo_PartAOM_to_AOM_Slow;
    var vo_PartAOM_to_AOM_Fast = params.vo_PartAOM_to_AOM_Fast;
    var vo_CN_Ratio_AOM_Slow = params.vo_CN_Ratio_AOM_Slow;
    var vo_CN_Ratio_AOM_Fast = params.vo_CN_Ratio_AOM_Fast;

    var po_AOM_FastMaxC_to_N = centralParameterProvider.userSoilOrganicParameters.po_AOM_FastMaxC_to_N;

    //urea
    if(soilColumn.vs_NumberOfOrganicLayers() > 0) {
      // kg N m-3 soil
      soilColumn[0].vs_SoilCarbamid += vo_AddedOrganicMatterAmount
               * vo_AOM_DryMatterContent * vo_AOM_CarbamidContent
               / 10000.0 / soilColumn[0].vs_LayerThickness;
    }

    var vo_AddedOrganicCarbonAmount = 0.0;
    var vo_AddedOrganicNitrogenAmount = 0.0;

    //MIT
    var nools = soilColumn.vs_NumberOfOrganicLayers();
    
    for(var i_Layer = 0; i_Layer < nools; i_Layer++) {
      //New AOM pool
      if(i_Layer == 0) {
        var aom_pool = Object.create(AOM_Properties);

        aom_pool.vo_DaysAfterApplication = 0;
        aom_pool.vo_AOM_DryMatterContent = vo_AOM_DryMatterContent;
        aom_pool.vo_AOM_NH4Content = vo_AOM_NH4Content;
        aom_pool.vo_AOM_Slow = 0.0;
        aom_pool.vo_AOM_Fast = 0.0;
        aom_pool.vo_AOM_SlowDecCoeffStandard = params.vo_AOM_SlowDecCoeffStandard;
        aom_pool.vo_AOM_FastDecCoeffStandard = params.vo_AOM_FastDecCoeffStandard;
        aom_pool.vo_CN_Ratio_AOM_Slow = vo_CN_Ratio_AOM_Slow;
        aom_pool.incorporation = incorporation;

        // Converting AOM from kg FM OM ha-1 to kg C m-3
        vo_AddedOrganicCarbonAmount = vo_AddedOrganicMatterAmount * vo_AOM_DryMatterContent * ORGANIC_CONSTANTS.PO_AOM_TO_C
              / 10000.0 / soilColumn[0].vs_LayerThickness;

        if(vo_CN_Ratio_AOM_Fast <= 1.0E-7) {
          // Wenn in der Datenbank hier Null steht, handelt es sich um einen
          // Pflanzenrückstand. Dann erfolgt eine dynamische Berechnung des
          // C/N-Verhältnisses. Für Wirtschafstdünger ist dieser Wert
          // parametrisiert.

          // Converting AOM N content from kg N kg DM-1 to kg N m-3
          vo_AddedOrganicNitrogenAmount = vo_AddedOrganicMatterAmount * vo_AOM_DryMatterContent
          * vo_AddedOrganicMatterNConcentration / 10000.0 / soilColumn[0].vs_LayerThickness;

          debug("Added organic matter N amount: " + vo_AddedOrganicNitrogenAmount);
          if(vo_AddedOrganicMatterNConcentration <= 0.0) {
            vo_AddedOrganicNitrogenAmount = 0.01;
          }

          // Assigning the dynamic C/N ratio to the AOM_Fast pool
          if((vo_AddedOrganicCarbonAmount * vo_PartAOM_to_AOM_Slow / vo_CN_Ratio_AOM_Slow)
              < vo_AddedOrganicNitrogenAmount) {

            vo_CN_Ratio_AOM_Fast = (vo_AddedOrganicCarbonAmount * vo_PartAOM_to_AOM_Fast)
              / (vo_AddedOrganicNitrogenAmount
              - (vo_AddedOrganicCarbonAmount * vo_PartAOM_to_AOM_Slow
              / vo_CN_Ratio_AOM_Slow));
          } else {

            vo_CN_Ratio_AOM_Fast = po_AOM_FastMaxC_to_N;
          }

          if(vo_CN_Ratio_AOM_Fast > po_AOM_FastMaxC_to_N) {
            vo_CN_Ratio_AOM_Fast = po_AOM_FastMaxC_to_N;
          }

          aom_pool.vo_CN_Ratio_AOM_Fast = vo_CN_Ratio_AOM_Fast;

        } else {
          aom_pool.vo_CN_Ratio_AOM_Fast = params.vo_CN_Ratio_AOM_Fast;
        }

        aom_pool.vo_PartAOM_Slow_to_SMB_Slow = params.vo_PartAOM_Slow_to_SMB_Slow;
        aom_pool.vo_PartAOM_Slow_to_SMB_Fast = params.vo_PartAOM_Slow_to_SMB_Fast;

        soilColumn[0].vo_AOM_Pool.push(aom_pool);
        //cout << "poolsize: " << soilColumn[0].vo_AOM_Pool.length << endl;

      } else {//if (i_Layer == 0)

        var aom_pool = Object.create(AOM_Properties);

        aom_pool.vo_DaysAfterApplication = 0;
        aom_pool.vo_AOM_DryMatterContent = 0.0;
        aom_pool.vo_AOM_NH4Content = 0.0;
        aom_pool.vo_AOM_Slow = 0.0;
        aom_pool.vo_AOM_Fast = 0.0;
        aom_pool.vo_AOM_SlowDecCoeffStandard = params.vo_AOM_SlowDecCoeffStandard;
        aom_pool.vo_AOM_FastDecCoeffStandard = params.vo_AOM_FastDecCoeffStandard;
        aom_pool.vo_CN_Ratio_AOM_Slow = vo_CN_Ratio_AOM_Slow;
        if(!soilColumn[0].vo_AOM_Pool.length === 0) {
          aom_pool.vo_CN_Ratio_AOM_Fast = soilColumn[0].vo_AOM_Pool[soilColumn[0].vo_AOM_Pool.length - 1].vo_CN_Ratio_AOM_Fast;
        } else {
          aom_pool.vo_CN_Ratio_AOM_Fast = vo_CN_Ratio_AOM_Fast;
        }
        aom_pool.vo_PartAOM_Slow_to_SMB_Slow = params.vo_PartAOM_Slow_to_SMB_Slow;
        aom_pool.vo_PartAOM_Slow_to_SMB_Fast = params.vo_PartAOM_Slow_to_SMB_Fast;
        aom_pool.incorporation = incorporation;

        soilColumn[i_Layer].vo_AOM_Pool.push(aom_pool);

      } //else
    } // for i_Layer

    var AOM_SlowInput = vo_PartAOM_to_AOM_Slow * vo_AddedOrganicCarbonAmount;
    var AOM_FastInput = vo_PartAOM_to_AOM_Fast * vo_AddedOrganicCarbonAmount;

    var vo_SoilNH4Input = vo_AOM_NH4Content * vo_AddedOrganicMatterAmount
             * vo_AOM_DryMatterContent / 10000.0 / soilColumn[0].vs_LayerThickness;

    var vo_SoilNO3Input = vo_AOM_NO3Content * vo_AddedOrganicMatterAmount
             * vo_AOM_DryMatterContent / 10000.0 / soilColumn[0].vs_LayerThickness;

    var SOM_FastInput = (1.0 - (vo_PartAOM_to_AOM_Slow
           + vo_PartAOM_to_AOM_Fast)) * vo_AddedOrganicCarbonAmount;
    // Immediate top layer pool update
    soilColumn[0].vo_AOM_Pool[soilColumn[0].vo_AOM_Pool.length - 1].vo_AOM_Slow += AOM_SlowInput;
    soilColumn[0].vo_AOM_Pool[soilColumn[0].vo_AOM_Pool.length - 1].vo_AOM_Fast += AOM_FastInput;
    soilColumn[0].vs_SoilNH4 += vo_SoilNH4Input;
    soilColumn[0].vs_SoilNO3 += vo_SoilNO3Input;
    soilColumn[0].vs_SOM_Fast += SOM_FastInput;

    // JS!
    if (DEBUG && (soilColumn[0].vs_SoilNO3 < 0 || soilColumn[0].vs_SoilNH4 < 0)) {
      debug('vo_AddedOrganicCarbonAmount', vo_AddedOrganicCarbonAmount);
      debug('vo_AOM_NO3Content', vo_AOM_NO3Content);
      debug('vo_PartAOM_to_AOM_Slow', vo_PartAOM_to_AOM_Slow);
      debug('vo_PartAOM_to_AOM_Fast', vo_PartAOM_to_AOM_Fast);
      debug('vo_AOM_DryMatterContent', vo_AOM_DryMatterContent);
      debug('vo_AddedOrganicMatterAmount', vo_AddedOrganicMatterAmount);
      debug('vs_LayerThickness', soilColumn[0].vs_LayerThickness);
      debug('oilColumn.that[0].vs_SoilNO3', oilColumn.that[0].vs_SoilNO3);
      debug('soilColumn[0].vs_SoilNH4', soilColumn[0].vs_SoilNH4);
      throw 'N < 0';
    }

    //store for further use
    vo_AOM_SlowInput += AOM_SlowInput;
    vo_AOM_FastInput += AOM_FastInput;
    vo_SOM_FastInput += SOM_FastInput;

    addedOrganicMatter = true;
  };

  var addIrrigationWater = function (amount) {
    irrigationAmount += amount;
  };

  var fo_Urea = function (vo_RainIrrigation ) {

    var nools = soilColumn.vs_NumberOfOrganicLayers();
    var vo_SoilCarbamid_solid = []; // Solid carbamide concentration in soil solution [kmol urea m-3]
    var vo_SoilCarbamid_aq = []; // Dissolved carbamide concetzration in soil solution [kmol urea m-3]
    var vo_HydrolysisRate1 = []; // [kg N d-1]
    var vo_HydrolysisRate2 = []; // [kg N d-1]
    var vo_HydrolysisRateMax = []; // [kg N d-1]
    var vo_Hydrolysis_pH_Effect = [];// []
    var vo_HydrolysisRate = []; // [kg N d-1]
    var vo_H3OIonConcentration = 0.0; // Oxonium ion concentration in soil solution [kmol m-3]
    var vo_NH3aq_EquilibriumConst = 0.0; // []
    var vo_NH3_EquilibriumConst   = 0.0; // []
    var vs_SoilNH4aq = 0.0; // ammonium ion concentration in soil solution [kmol m-3}
    var vo_NH3aq = 0.0;
    var vo_NH3gas = 0.0;
    var vo_NH3_Volatilising = 0.0;

    var po_HydrolysisKM = centralParameterProvider.userSoilOrganicParameters.po_HydrolysisKM;
    var po_HydrolysisP1 = centralParameterProvider.userSoilOrganicParameters.po_HydrolysisP1;
    var po_HydrolysisP2 = centralParameterProvider.userSoilOrganicParameters.po_HydrolysisP2;
    var po_ActivationEnergy = centralParameterProvider.userSoilOrganicParameters.po_ActivationEnergy;

    vo_NH3_Volatilised = 0.0;

    for (var i_Layer = 0; i_Layer < soilColumn.vs_NumberOfOrganicLayers(); i_Layer++) {

      // kmol urea m-3 soil
      vo_SoilCarbamid_solid[i_Layer] = soilColumn[i_Layer].vs_SoilCarbamid /
               ORGANIC_CONSTANTS.PO_UREAMOLECULARWEIGHT /
               ORGANIC_CONSTANTS.PO_UREA_TO_N / 1000.0;

      // mol urea kg Solution-1
      vo_SoilCarbamid_aq[i_Layer] = (-1258.9 + 13.2843 * (soilColumn[i_Layer].get_Vs_SoilTemperature() + 273.15) -
             0.047381 * ((soilColumn[i_Layer].get_Vs_SoilTemperature() + 273.15) *
                 (soilColumn[i_Layer].get_Vs_SoilTemperature() + 273.15)) +
             5.77264e-5 * (pow((soilColumn[i_Layer].get_Vs_SoilTemperature() + 273.15), 3.0)));

      // kmol urea m-3 soil
      vo_SoilCarbamid_aq[i_Layer] = (vo_SoilCarbamid_aq[i_Layer] / (1.0 +
                    (vo_SoilCarbamid_aq[i_Layer] * 0.0453))) *
          soilColumn[i_Layer].get_Vs_SoilMoisture_m3();

      if (vo_SoilCarbamid_aq[i_Layer] >= vo_SoilCarbamid_solid[i_Layer]) {

        vo_SoilCarbamid_aq[i_Layer] = vo_SoilCarbamid_solid[i_Layer];
        vo_SoilCarbamid_solid[i_Layer] = 0.0;

      } else {
        vo_SoilCarbamid_solid[i_Layer] -= vo_SoilCarbamid_aq[i_Layer];
      }

      // Calculate urea hydrolysis

      vo_HydrolysisRate1[i_Layer] = (po_HydrolysisP1 *
                                    (soilColumn[i_Layer].vs_SoilOrganicMatter() * 100.0) *
                                    ORGANIC_CONSTANTS.PO_SOM_TO_C + po_HydrolysisP2) /
                                    ORGANIC_CONSTANTS.PO_UREAMOLECULARWEIGHT;

      vo_HydrolysisRate2[i_Layer] = vo_HydrolysisRate1[i_Layer] /
                                    (exp(-po_ActivationEnergy /
                                    (8.314 * 310.0)));

      vo_HydrolysisRateMax[i_Layer] = vo_HydrolysisRate2[i_Layer] * exp(-po_ActivationEnergy /
                                     (8.314 * (soilColumn[i_Layer].get_Vs_SoilTemperature() + 273.15)));

      vo_Hydrolysis_pH_Effect[i_Layer] = exp(-0.064 *
                                         ((soilColumn[i_Layer].vs_SoilpH - 6.5) *
                                         (soilColumn[i_Layer].vs_SoilpH - 6.5)));

      // debug(soilColumn[i_Layer].vs_SoilMoisture_pF(), 'soilColumn[i_Layer].vs_SoilMoisture_pF()');

      // kmol urea kg soil-1 s-1
      vo_HydrolysisRate[i_Layer] = vo_HydrolysisRateMax[i_Layer] *
                                   fo_MoistOnHydrolysis(soilColumn[i_Layer].vs_SoilMoisture_pF()) *
                                   vo_Hydrolysis_pH_Effect[i_Layer] * vo_SoilCarbamid_aq[i_Layer] /
                                   (po_HydrolysisKM + vo_SoilCarbamid_aq[i_Layer]);

      // kmol urea m soil-3 d-1
      vo_HydrolysisRate[i_Layer] = vo_HydrolysisRate[i_Layer] * 86400.0 *
                                   soilColumn[i_Layer].vs_SoilBulkDensity();

      if (vo_HydrolysisRate[i_Layer] >= vo_SoilCarbamid_aq[i_Layer]) {

        soilColumn[i_Layer].vs_SoilNH4 += soilColumn[i_Layer].vs_SoilCarbamid;
        soilColumn[i_Layer].vs_SoilCarbamid = 0.0;

      } else {

        // kg N m soil-3
        soilColumn[i_Layer].vs_SoilCarbamid -= vo_HydrolysisRate[i_Layer] *
               ORGANIC_CONSTANTS.PO_UREAMOLECULARWEIGHT *
               ORGANIC_CONSTANTS.PO_UREA_TO_N * 1000.0;

        // kg N m soil-3
        soilColumn[i_Layer].vs_SoilNH4 += vo_HydrolysisRate[i_Layer] *
          ORGANIC_CONSTANTS.PO_UREAMOLECULARWEIGHT *
          ORGANIC_CONSTANTS.PO_UREA_TO_N * 1000.0;
      }

      // Calculate general volatilisation from NH4-Pool in top layer

      if (i_Layer == 0) {

        vo_H3OIonConcentration = pow(10.0, (-soilColumn[0].vs_SoilpH)); // kmol m-3
        vo_NH3aq_EquilibriumConst = pow(10.0, ((-2728.3 /
                                    (soilColumn[0].get_Vs_SoilTemperature() + 273.15)) - 0.094219)); // K2 in Sadeghi's program

        vo_NH3_EquilibriumConst = pow(10.0, ((1630.5 /
                                  (soilColumn[0].get_Vs_SoilTemperature() + 273.15)) - 2.301));  // K1 in Sadeghi's program

        // kmol m-3, assuming that all NH4 is solved
        vs_SoilNH4aq = soilColumn[0].vs_SoilNH4 / (ORGANIC_CONSTANTS.PO_NH4MOLECULARWEIGHT * 1000.0);


        // kmol m-3
        vo_NH3aq = vs_SoilNH4aq / (1.0 + (vo_H3OIonConcentration / vo_NH3aq_EquilibriumConst));


         vo_NH3gas = vo_NH3aq;
        //  vo_NH3gas = vo_NH3aq / vo_NH3_EquilibriumConst;

        // kg N m-3 d-1
         vo_NH3_Volatilising = vo_NH3gas * ORGANIC_CONSTANTS.PO_NH3MOLECULARWEIGHT * 1000.0;


        if (vo_NH3_Volatilising >= soilColumn[0].vs_SoilNH4) {

          vo_NH3_Volatilising = soilColumn[0].vs_SoilNH4;
          soilColumn[0].vs_SoilNH4 = 0.0;

        } else {
          soilColumn[0].vs_SoilNH4 -= vo_NH3_Volatilising;
        }

        // kg N m-2 d-1
        vo_NH3_Volatilised = vo_NH3_Volatilising * soilColumn[0].vs_LayerThickness;

        if (soilColumn[0].vs_SoilNH4 < 0)
          throw soilColumn[0].vs_SoilNH4;

      } // if (i_Layer == 0) {
    } // for

    // set incorporation to false, if carbamid part is falling below a treshold
    // only, if organic matter was not recently added
    if (vo_SoilCarbamid_aq[0] < 0.001 && !addedOrganicMatter) {
      incorporation = false;
    }

  };

  var fo_MIT = function () {

    var nools = soilColumn.vs_NumberOfOrganicLayers();
    var po_SOM_SlowDecCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_SOM_SlowDecCoeffStandard;
    var po_SOM_FastDecCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_SOM_FastDecCoeffStandard;
    var po_SMB_SlowDeathRateStandard = centralParameterProvider.userSoilOrganicParameters.po_SMB_SlowDeathRateStandard;
    var po_SMB_SlowMaintRateStandard = centralParameterProvider.userSoilOrganicParameters.po_SMB_SlowMaintRateStandard;
    var po_SMB_FastDeathRateStandard = centralParameterProvider.userSoilOrganicParameters.po_SMB_FastDeathRateStandard;
    var po_SMB_FastMaintRateStandard = centralParameterProvider.userSoilOrganicParameters.po_SMB_FastMaintRateStandard;
    var po_LimitClayEffect = centralParameterProvider.userSoilOrganicParameters.po_LimitClayEffect;
    var po_SOM_SlowUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_SOM_SlowUtilizationEfficiency;
    var po_SOM_FastUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_SOM_FastUtilizationEfficiency;
    var po_PartSOM_Fast_to_SOM_Slow = centralParameterProvider.userSoilOrganicParameters.po_PartSOM_Fast_to_SOM_Slow;
    var po_PartSMB_Slow_to_SOM_Fast = centralParameterProvider.userSoilOrganicParameters.po_PartSMB_Slow_to_SOM_Fast;
    var po_SMB_UtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_SMB_UtilizationEfficiency;
    var po_CN_Ratio_SMB = centralParameterProvider.userSoilOrganicParameters.po_CN_Ratio_SMB;
    var po_AOM_SlowUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_AOM_SlowUtilizationEfficiency;
    var po_AOM_FastUtilizationEfficiency = centralParameterProvider.userSoilOrganicParameters.po_AOM_FastUtilizationEfficiency;
    var po_ImmobilisationRateCoeffNH4 = centralParameterProvider.userSoilOrganicParameters.po_ImmobilisationRateCoeffNH4;
    var po_ImmobilisationRateCoeffNO3 = centralParameterProvider.userSoilOrganicParameters.po_ImmobilisationRateCoeffNO3;

    // Sum of decomposition rates for fast added organic matter pools
    var vo_AOM_FastDecRateSum = [];

    //Added organic matter fast pool change by decomposition [kg C m-3]
    //var vo_AOM_FastDelta = [];

    //Sum of all changes to added organic matter fast pool [kg C m-3]
    var vo_AOM_FastDeltaSum = [];

    //Added organic matter fast pool change by input [kg C m-3]
    //double vo_AOM_FastInput = 0.0;

    // Sum of decomposition rates for slow added organic matter pools
    var vo_AOM_SlowDecRateSum = [];

    // Added organic matter slow pool change by decomposition [kg C m-3]
    //var vo_AOM_SlowDelta = [];

    // Sum of all changes to added organic matter slow pool [kg C m-3]
    var vo_AOM_SlowDeltaSum = [];
    
    // [kg m-3]
    //fill(vo_CBalance.begin(), vo_CBalance.end(), 0.0);
    for (var i = 0, is = vo_CBalance.length; i < is; i++)
      vo_CBalance[i] = 0.0;

    // C to N ratio of slowly decomposing soil organic matter []
    var vo_CN_Ratio_SOM_Slow;

    // C to N ratio of rapidly decomposing soil organic matter []
    var vo_CN_Ratio_SOM_Fast;

    // N balance of each layer [kg N m-3]
    var vo_NBalance = [];

    // CO2 preduced from fast fraction of soil microbial biomass [kg C m-3 d-1]
    var vo_SMB_FastCO2EvolutionRate = [];

    // Fast fraction of soil microbial biomass death rate [d-1]
    var vo_SMB_FastDeathRate = [];

    // Fast fraction of soil microbial biomass death rate coefficient [d-1]
    var vo_SMB_FastDeathRateCoeff = [];

    // Fast fraction of soil microbial biomass decomposition rate [d-1]
    var vo_SMB_FastDecCoeff = [];

    // Soil microbial biomass fast pool change [kg C m-3]
    //fill(vo_SMB_FastDelta.begin(), vo_SMB_FastDelta.end(), 0.0);
    for (var i = 0, is = vo_SMB_FastDelta.length; i < is; i++)
      vo_SMB_FastDelta[i] = 0.0;

    // CO2 preduced from slow fraction of soil microbial biomass [kg C m-3 d-1]
    var vo_SMB_SlowCO2EvolutionRate = [];

    // Slow fraction of soil microbial biomass death rate [d-1]
    var vo_SMB_SlowDeathRate = [];

    // Slow fraction of soil microbial biomass death rate coefficient [d-1]
    var vo_SMB_SlowDeathRateCoeff = [];

    // Slow fraction of soil microbial biomass decomposition rate [d-1]
    var vo_SMB_SlowDecCoeff = [];

    // Soil microbial biomass slow pool change [kg C m-3]
    //fill(vo_SMB_SlowDelta.begin(), vo_SMB_SlowDelta.end(), 0.0);
    for (var i = 0, is = vo_SMB_SlowDelta.length; i < is; i++)
      vo_SMB_SlowDelta[i] = 0.0;

    // Decomposition coefficient for rapidly decomposing soil organic matter [d-1]
    var vo_SOM_FastDecCoeff = [];

    // Soil organic matter fast pool change [kg C m-3]
    //fill(vo_SOM_FastDelta.begin(), vo_SOM_FastDelta.end(), 0.0);
    for (var i = 0, is = vo_SOM_FastDelta.length; i < is; i++)
      vo_SOM_FastDelta[i] = 0.0;

    // Sum of all changes to soil organic matter fast pool [kg C m-3]
    //var vo_SOM_FastDeltaSum = [];

    // Decomposition coefficient for slowly decomposing soil organic matter [d-1]
    var vo_SOM_SlowDecCoeff = [];

    // Soil organic matter slow pool change, unit [kg C m-3]
    //fill(vo_SOM_SlowDelta.begin(), vo_SOM_SlowDelta.end(), 0.0);
    for (var i = 0, is = vo_SOM_SlowDelta.length; i < is; i++)
      vo_SOM_SlowDelta[i] = 0.0;

    // Sum of all changes to soil organic matter slow pool [kg C m-3]
    //std::vector<double> vo_SOM_SlowDeltaSum = new Array(nools);

    // Calculation of decay rate coefficients

    var AOM_Pool, it_AOM_Pool; // JS! it's the same var! forEach is slower

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      var tod = fo_TempOnDecompostion(soilColumn[i_Layer].get_Vs_SoilTemperature());
      var mod = fo_MoistOnDecompostion(soilColumn[i_Layer].vs_SoilMoisture_pF());
  //    cout << "SO-5\t" << mod << endl;

      vo_SOM_SlowDecCoeff[i_Layer] = po_SOM_SlowDecCoeffStandard * tod * mod;
      vo_SOM_FastDecCoeff[i_Layer] = po_SOM_FastDecCoeffStandard * tod * mod;

      vo_SMB_SlowDecCoeff[i_Layer] = (po_SMB_SlowDeathRateStandard
             + po_SMB_SlowMaintRateStandard)
             * fo_ClayOnDecompostion(soilColumn[i_Layer].vs_SoilClayContent,
               po_LimitClayEffect) * tod * mod;

      vo_SMB_FastDecCoeff[i_Layer] = (po_SMB_FastDeathRateStandard
              + po_SMB_FastMaintRateStandard) * tod * mod;

      vo_SMB_SlowDeathRateCoeff[i_Layer] = po_SMB_SlowDeathRateStandard * tod * mod;
      vo_SMB_FastDeathRateCoeff[i_Layer] = po_SMB_FastDeathRateStandard * tod * mod;
      vo_SMB_SlowDeathRate[i_Layer] = vo_SMB_SlowDeathRateCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Slow;
      vo_SMB_FastDeathRate[i_Layer] = vo_SMB_FastDeathRateCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Fast;

      for (var i_Pool = 0, i_Pools = soilColumn[i_Layer].vo_AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool[i_Pool];
        AOM_Pool.vo_AOM_SlowDecCoeff = AOM_Pool.vo_AOM_SlowDecCoeffStandard * tod * mod;
        AOM_Pool.vo_AOM_FastDecCoeff = AOM_Pool.vo_AOM_FastDecCoeffStandard * tod * mod;      
      }
    } // for

    // Calculation of pool changes by decomposition
    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      for (var i_Pool = 0, i_Pools = soilColumn[i_Layer].vo_AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool[i_Pool];

        // Eq.6-5 and 6-6 in the DAISY manual
        AOM_Pool.vo_AOM_SlowDelta = -(AOM_Pool.vo_AOM_SlowDecCoeff * AOM_Pool.vo_AOM_Slow);

        if(-AOM_Pool.vo_AOM_SlowDelta > AOM_Pool.vo_AOM_Slow) {
          AOM_Pool.vo_AOM_SlowDelta = (-AOM_Pool.vo_AOM_Slow);
        }

        AOM_Pool.vo_AOM_FastDelta = -(AOM_Pool.vo_AOM_FastDecCoeff * AOM_Pool.vo_AOM_Fast);

        if(-AOM_Pool.vo_AOM_FastDelta > AOM_Pool.vo_AOM_Fast) {
          AOM_Pool.vo_AOM_FastDelta = (-AOM_Pool.vo_AOM_Fast);
        }
      }

      // soilColumn[i_Layer].vo_AOM_Pool.forEach(function (AOM_Pool) {
      //   // Eq.6-5 and 6-6 in the DAISY manual
      //   AOM_Pool.vo_AOM_SlowDelta = -(AOM_Pool.vo_AOM_SlowDecCoeff * AOM_Pool.vo_AOM_Slow);

      //   if(-AOM_Pool.vo_AOM_SlowDelta > AOM_Pool.vo_AOM_Slow) {
      //     AOM_Pool.vo_AOM_SlowDelta = (-AOM_Pool.vo_AOM_Slow);
      //   }

      //   AOM_Pool.vo_AOM_FastDelta = -(AOM_Pool.vo_AOM_FastDecCoeff * AOM_Pool.vo_AOM_Fast);

      //   if(-AOM_Pool.vo_AOM_FastDelta > AOM_Pool.vo_AOM_Fast) {
      //     AOM_Pool.vo_AOM_FastDelta = (-AOM_Pool.vo_AOM_Fast);
      //   }
      // });

      // Eq.6-7 in the DAISY manual
      vo_AOM_SlowDecRateSum[i_Layer] = 0.0;

      for (var i_Pool = 0, i_Pools = soilColumn[i_Layer].vo_AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool[i_Pool];
        AOM_Pool.vo_AOM_SlowDecRate = AOM_Pool.vo_AOM_SlowDecCoeff * AOM_Pool.vo_AOM_Slow;
        vo_AOM_SlowDecRateSum[i_Layer] += AOM_Pool.vo_AOM_SlowDecRate;
      }

      // soilColumn[i_Layer].vo_AOM_Pool.forEach(function (AOM_Pool) {
      //   AOM_Pool.vo_AOM_SlowDecRate = AOM_Pool.vo_AOM_SlowDecCoeff * AOM_Pool.vo_AOM_Slow;
      //   vo_AOM_SlowDecRateSum[i_Layer] += AOM_Pool.vo_AOM_SlowDecRate;
      // });

      vo_SMB_SlowDelta[i_Layer] = (po_SOM_SlowUtilizationEfficiency * vo_SOM_SlowDecCoeff[i_Layer]
          * soilColumn[i_Layer].vs_SOM_Slow)
          + (po_SOM_FastUtilizationEfficiency * (1.0
          - po_PartSOM_Fast_to_SOM_Slow)
          * vo_SOM_FastDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SOM_Fast)
          + (po_AOM_SlowUtilizationEfficiency
          * vo_AOM_SlowDecRateSum[i_Layer])
          - (vo_SMB_SlowDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Slow
          + vo_SMB_SlowDeathRate[i_Layer]);

      // Eq.6-8 in the DAISY manual
      vo_AOM_FastDecRateSum[i_Layer] = 0.0;

      for (var i_Pool = 0, i_Pools = soilColumn[i_Layer].vo_AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool[i_Pool];
        AOM_Pool.vo_AOM_FastDecRate = AOM_Pool.vo_AOM_FastDecCoeff * AOM_Pool.vo_AOM_Fast;
        vo_AOM_FastDecRateSum[i_Layer] += AOM_Pool.vo_AOM_FastDecRate;
      }

      // soilColumn[i_Layer].vo_AOM_Pool.forEach(function (AOM_Pool) {
      //   AOM_Pool.vo_AOM_FastDecRate = AOM_Pool.vo_AOM_FastDecCoeff * AOM_Pool.vo_AOM_Fast;
      //   vo_AOM_FastDecRateSum[i_Layer] += AOM_Pool.vo_AOM_FastDecRate;
      // });

      vo_SMB_FastDelta[i_Layer] = (po_SMB_UtilizationEfficiency * (1.0
          - po_PartSMB_Slow_to_SOM_Fast)
          * (vo_SMB_SlowDeathRate[i_Layer]
          + vo_SMB_FastDeathRate[i_Layer]))
          + (po_AOM_FastUtilizationEfficiency
          * vo_AOM_FastDecRateSum[i_Layer])
          - ((vo_SMB_FastDecCoeff[i_Layer]
          * soilColumn[i_Layer].vs_SMB_Fast)
          + vo_SMB_FastDeathRate[i_Layer]);

      //!Eq.6-9 in the DAISY manual
      vo_SOM_SlowDelta[i_Layer] = po_PartSOM_Fast_to_SOM_Slow * vo_SOM_FastDecCoeff[i_Layer]
          * soilColumn[i_Layer].vs_SOM_Fast - vo_SOM_SlowDecCoeff[i_Layer]
          * soilColumn[i_Layer].vs_SOM_Slow;

      // Eq.6-10 in the DAISY manual
      vo_SOM_FastDelta[i_Layer] = po_PartSMB_Slow_to_SOM_Fast * (vo_SMB_SlowDeathRate[i_Layer]
          + vo_SMB_FastDeathRate[i_Layer]) - vo_SOM_FastDecCoeff[i_Layer]
          * soilColumn[i_Layer].vs_SOM_Fast;

      vo_AOM_SlowDeltaSum[i_Layer] = 0.0;
      vo_AOM_FastDeltaSum[i_Layer] = 0.0;

      for (var i_Pool = 0, i_Pools = soilColumn[i_Layer].vo_AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool[i_Pool];
        vo_AOM_SlowDeltaSum[i_Layer] += AOM_Pool.vo_AOM_SlowDelta;
        vo_AOM_FastDeltaSum[i_Layer] += AOM_Pool.vo_AOM_FastDelta;
      }

      // soilColumn[i_Layer].vo_AOM_Pool.forEach(function (AOM_Pool) {
      //   vo_AOM_SlowDeltaSum[i_Layer] += AOM_Pool.vo_AOM_SlowDelta;
      //   vo_AOM_FastDeltaSum[i_Layer] += AOM_Pool.vo_AOM_FastDelta;
      // });

    } // for i_Layer

    vo_DecomposerRespiration = 0.0;

    // Calculation of CO2 evolution
    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      vo_SMB_SlowCO2EvolutionRate[i_Layer] = ((1.0 - po_SOM_SlowUtilizationEfficiency)
              * vo_SOM_SlowDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SOM_Slow) + ((1.0
              - po_SOM_FastUtilizationEfficiency) * (1.0 - po_PartSOM_Fast_to_SOM_Slow)
              * vo_SOM_FastDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SOM_Fast) + ((1.0
              - po_AOM_SlowUtilizationEfficiency) * vo_AOM_SlowDecRateSum[i_Layer])
              + (po_SMB_UtilizationEfficiency
              * (vo_SMB_SlowDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Slow));

      vo_SMB_FastCO2EvolutionRate[i_Layer] = ((1.0 - po_SMB_UtilizationEfficiency) * (1.0
             - po_PartSMB_Slow_to_SOM_Fast) * (vo_SMB_SlowDeathRate[i_Layer] + vo_SMB_FastDeathRate[i_Layer]))
             + ((1.0 - po_AOM_FastUtilizationEfficiency) * vo_AOM_FastDecRateSum[i_Layer])
             + ((vo_SMB_FastDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Fast));

      vo_SMB_CO2EvolutionRate[i_Layer] = vo_SMB_SlowCO2EvolutionRate[i_Layer] + vo_SMB_FastCO2EvolutionRate[i_Layer];

      vo_DecomposerRespiration += vo_SMB_CO2EvolutionRate[i_Layer] * soilColumn[i_Layer].vs_LayerThickness; // [kg C m-3] -> [kg C m-2]

    } // for i_Layer

    // Calculation of N balance
    vo_CN_Ratio_SOM_Slow = siteParams.vs_Soil_CN_Ratio;
    vo_CN_Ratio_SOM_Fast = siteParams.vs_Soil_CN_Ratio;

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      vo_NBalance[i_Layer] = -(vo_SMB_SlowDelta[i_Layer] / po_CN_Ratio_SMB)
          - (vo_SMB_FastDelta[i_Layer] / po_CN_Ratio_SMB)
          - (vo_SOM_SlowDelta[i_Layer] / vo_CN_Ratio_SOM_Slow)
          - (vo_SOM_FastDelta[i_Layer] / vo_CN_Ratio_SOM_Fast);

      /*var*/ AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool;

      for (var i_Pool = 0, i_Pools = AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
        it_AOM_Pool = AOM_Pool[i_Pool];
        if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Fast) >= 1.0E-7) {
          vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_FastDelta / it_AOM_Pool.vo_CN_Ratio_AOM_Fast);
        } // if

        if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Slow) >= 1.0E-7) {
          vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_SlowDelta / it_AOM_Pool.vo_CN_Ratio_AOM_Slow);
        } // if
      } // for it_AOM_Pool

      // AOM_Pool.forEach(function (it_AOM_Pool) {

      //   if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Fast) >= 1.0E-7) {
      //     vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_FastDelta / it_AOM_Pool.vo_CN_Ratio_AOM_Fast);
      //   } // if

      //   if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Slow) >= 1.0E-7) {
      //     vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_SlowDelta / it_AOM_Pool.vo_CN_Ratio_AOM_Slow);
      //   } // if
      // }); // for it_AOM_Pool
    } // for i_Layer

    // Check for Nmin availablity in case of immobilisation

    vo_NetNMineralisation = 0.0;

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      if (vo_NBalance[i_Layer] < 0.0) {

        if (abs(vo_NBalance[i_Layer]) >= ((soilColumn[i_Layer].vs_SoilNH4 * po_ImmobilisationRateCoeffNH4)
          + (soilColumn[i_Layer].vs_SoilNO3 * po_ImmobilisationRateCoeffNO3))) {
          vo_AOM_SlowDeltaSum[i_Layer] = 0.0;
          vo_AOM_FastDeltaSum[i_Layer] = 0.0;

          AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool;

          for (var i_Pool = 0, i_Pools = AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {
            it_AOM_Pool = AOM_Pool[i_Pool];

            if (it_AOM_Pool.vo_CN_Ratio_AOM_Slow >= (po_CN_Ratio_SMB
                 / po_AOM_SlowUtilizationEfficiency)) {

              it_AOM_Pool.vo_AOM_SlowDelta = 0.0;
            } // if

            if (it_AOM_Pool.vo_CN_Ratio_AOM_Fast >= (po_CN_Ratio_SMB
                 / po_AOM_FastUtilizationEfficiency)) {

              it_AOM_Pool.vo_AOM_FastDelta = 0.0;
            } // if

            vo_AOM_SlowDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_SlowDelta;
            vo_AOM_FastDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_FastDelta;

          } // for

          // AOM_Pool.forEach(function (it_AOM_Pool) {

          //   if (it_AOM_Pool.vo_CN_Ratio_AOM_Slow >= (po_CN_Ratio_SMB
          //        / po_AOM_SlowUtilizationEfficiency)) {

          //     it_AOM_Pool.vo_AOM_SlowDelta = 0.0;
          //   } // if

          //   if (it_AOM_Pool.vo_CN_Ratio_AOM_Fast >= (po_CN_Ratio_SMB
          //        / po_AOM_FastUtilizationEfficiency)) {

          //     it_AOM_Pool.vo_AOM_FastDelta = 0.0;
          //   } // if

          //   vo_AOM_SlowDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_SlowDelta;
          //   vo_AOM_FastDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_FastDelta;

          // }); // for

          if (vo_CN_Ratio_SOM_Slow >= (po_CN_Ratio_SMB / po_SOM_SlowUtilizationEfficiency)) {

            vo_SOM_SlowDelta[i_Layer] = 0.0;
          } // if

          if (vo_CN_Ratio_SOM_Fast >= (po_CN_Ratio_SMB / po_SOM_FastUtilizationEfficiency)) {

            vo_SOM_FastDelta[i_Layer] = 0.0;
          } // if

          // Recalculation of SMB pool changes

          /** @todo <b>Claas: </b> Folgende Algorithmen prüfen: Was verändert sich? */
          vo_SMB_SlowDelta[i_Layer] = (po_SOM_SlowUtilizationEfficiency * vo_SOM_SlowDecCoeff[i_Layer]
               * soilColumn[i_Layer].vs_SOM_Slow) + (po_SOM_FastUtilizationEfficiency * (1.0
               - po_PartSOM_Fast_to_SOM_Slow) * vo_SOM_FastDecCoeff[i_Layer]
               * soilColumn[i_Layer].vs_SOM_Fast) + (po_AOM_SlowUtilizationEfficiency
               * (-vo_AOM_SlowDeltaSum[i_Layer])) - (vo_SMB_SlowDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Slow
               + vo_SMB_SlowDeathRate[i_Layer]);

          vo_SMB_FastDelta[i_Layer] = (po_SMB_UtilizationEfficiency * (1.0
              - po_PartSMB_Slow_to_SOM_Fast) * (vo_SMB_SlowDeathRate[i_Layer]
              + vo_SMB_FastDeathRate[i_Layer])) + (po_AOM_FastUtilizationEfficiency
              * (-vo_AOM_FastDeltaSum[i_Layer])) - ((vo_SMB_FastDecCoeff[i_Layer] * soilColumn[i_Layer].vs_SMB_Fast)
              + vo_SMB_FastDeathRate[i_Layer]);

          // Recalculation of N balance under conditions of immobilisation
          vo_NBalance[i_Layer] = -(vo_SMB_SlowDelta[i_Layer] / po_CN_Ratio_SMB)
               - (vo_SMB_FastDelta[i_Layer] / po_CN_Ratio_SMB) - (vo_SOM_SlowDelta[i_Layer]
               / vo_CN_Ratio_SOM_Slow) - (vo_SOM_FastDelta[i_Layer] / vo_CN_Ratio_SOM_Fast);

          for (var i_Pool = 0, i_Pools = AOM_Pool.length; i_Pool < i_Pools; i_Pool++) {

            it_AOM_Pool = AOM_Pool[i_Pool];
            
            if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Fast) >= 1.0E-7) {

              vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_FastDelta
                                       / it_AOM_Pool.vo_CN_Ratio_AOM_Fast);
            } // if

            if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Slow) >= 1.0E-7) {

              vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_SlowDelta
                                       / it_AOM_Pool.vo_CN_Ratio_AOM_Slow);
            } // if

          } // for

          // AOM_Pool.forEach(function (it_AOM_Pool) {

          //   if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Fast) >= 1.0E-7) {

          //     vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_FastDelta
          //                              / it_AOM_Pool.vo_CN_Ratio_AOM_Fast);
          //   } // if

          //   if (abs(it_AOM_Pool.vo_CN_Ratio_AOM_Slow) >= 1.0E-7) {

          //     vo_NBalance[i_Layer] -= (it_AOM_Pool.vo_AOM_SlowDelta
          //                              / it_AOM_Pool.vo_CN_Ratio_AOM_Slow);
          //   } // if
          // }); // for

          // Update of Soil NH4 after recalculated N balance
          soilColumn[i_Layer].vs_SoilNH4 += abs(vo_NBalance[i_Layer]);


        } else { //if
          // Bedarf kann durch Ammonium-Pool nicht gedeckt werden --> Nitrat wird verwendet
          if (abs(vo_NBalance[i_Layer]) >= (soilColumn[i_Layer].vs_SoilNH4
               * po_ImmobilisationRateCoeffNH4)) {

            soilColumn[i_Layer].vs_SoilNO3 -= abs(vo_NBalance[i_Layer])
                 - (soilColumn[i_Layer].vs_SoilNH4
                 * po_ImmobilisationRateCoeffNH4);

            soilColumn[i_Layer].vs_SoilNH4 -= soilColumn[i_Layer].vs_SoilNH4
                 * po_ImmobilisationRateCoeffNH4;

          } else { // if

            soilColumn[i_Layer].vs_SoilNH4 -= abs(vo_NBalance[i_Layer]);
            if (soilColumn[i_Layer].vs_SoilNH4 < 0)
              throw soilColumn[i_Layer].vs_SoilNH4;
          } //else
        } //else

      } else { //if (N_Balance[i_Layer]) < 0.0

        soilColumn[i_Layer].vs_SoilNH4 += abs(vo_NBalance[i_Layer]);
      }

    vo_NetNMineralisationRate[i_Layer] = abs(vo_NBalance[i_Layer])
        * soilColumn[0].vs_LayerThickness; // [kg m-3] --> [kg m-2]
    vo_NetNMineralisation += abs(vo_NBalance[i_Layer])
        * soilColumn[0].vs_LayerThickness; // [kg m-3] --> [kg m-2]
    vo_SumNetNMineralisation += abs(vo_NBalance[i_Layer])
          * soilColumn[0].vs_LayerThickness; // [kg m-3] --> [kg m-2]

    }
  };

  var fo_Volatilisation = function (
    vo_AOM_Addition,
    vw_MeanAirTemperature,
    vw_WindSpeed
    ) {
    
    var vo_SoilWet;
    var vo_AOM_TAN_Content; // added organic matter total ammonium content [g N kg FM OM-1]
    var vo_MaxVolatilisation; // Maximum volatilisation [kg N ha-1 (kg N ha-1)-1]
    var vo_VolatilisationHalfLife; // [d]
    var vo_VolatilisationRate; // [kg N ha-1 (kg N ha-1)-1 d-1]
    var vo_N_PotVolatilised; // Potential volatilisation [kg N m-2]
    var vo_N_PotVolatilisedSum = 0.0; // Sums up potential volatilisation of all AOM pools [kg N m-2]
    var vo_N_ActVolatilised = 0.0; // Actual volatilisation [kg N m-2]

    var vo_DaysAfterApplicationSum = 0;

    if (soilColumn[0].vs_SoilMoisture_pF() > 2.5) {
      vo_SoilWet = 0.0;
    } else {
      vo_SoilWet = 1.0;
    }

    var AOM_Pool = soilColumn[0].vo_AOM_Pool;

    AOM_Pool.forEach(function (it_AOM_Pool) {

      vo_DaysAfterApplicationSum += it_AOM_Pool.vo_DaysAfterApplication;
    });

    if (vo_DaysAfterApplicationSum > 0 || vo_AOM_Addition) {

      /** @todo <b>Claas: </b> if (vo_AOM_Addition == true)
       vo_DaysAfterApplication[vo_AOM_PoolAllocator]= 1; */

      vo_N_PotVolatilisedSum = 0.0;

      AOM_Pool.forEach(function (it_AOM_Pool) {

        vo_AOM_TAN_Content = 0.0;
        vo_MaxVolatilisation = 0.0;
        vo_VolatilisationHalfLife = 0.0;
        vo_VolatilisationRate = 0.0;
        vo_N_PotVolatilised = 0.0;

        vo_AOM_TAN_Content = it_AOM_Pool.vo_AOM_NH4Content * 1000.0 * it_AOM_Pool.vo_AOM_DryMatterContent;

        vo_MaxVolatilisation = 0.0495 * pow(1.1020, vo_SoilWet) * pow(1.0223, vw_MeanAirTemperature) * pow(1.0417,
                           vw_WindSpeed) * pow(1.1080, it_AOM_Pool.vo_AOM_DryMatterContent) * pow(0.8280, vo_AOM_TAN_Content) * pow(
                               11.300, Number(it_AOM_Pool.incorporation));

        vo_VolatilisationHalfLife = 1.0380 * pow(1.1020, vo_SoilWet) * pow(0.9600, vw_MeanAirTemperature) * pow(0.9500,
                        vw_WindSpeed) * pow(1.1750, it_AOM_Pool.vo_AOM_DryMatterContent) * pow(1.1060, vo_AOM_TAN_Content) * pow(
                                                  1.0000, Number(it_AOM_Pool.incorporation)) * (18869.3 * exp(-soilColumn[0].vs_SoilpH / 0.63321) + 0.70165);

        // ******************************************************************************************
        // *** Based on He et al. (1999): Soil Sci. 164 (10), 750-758. The curves on p. 755 were  ***
        // *** digitised and fit to Michaelis-Menten. The pH - Nhalf relation was normalised (pH  ***
        // *** 7.0 = 1; average soil pH of the ALFAM experiments) and fit to a decay function.    ***
        // *** The resulting factor was added to the Half Life calculation.                       ***
        // ******************************************************************************************

        vo_VolatilisationRate = vo_MaxVolatilisation * (vo_VolatilisationHalfLife / (pow((it_AOM_Pool.vo_DaysAfterApplication + vo_VolatilisationHalfLife), 2.0)));

        vo_N_PotVolatilised = vo_VolatilisationRate * vo_AOM_TAN_Content * (it_AOM_Pool.vo_AOM_Slow
                    + it_AOM_Pool.vo_AOM_Fast) / 10000.0 / 1000.0;

        vo_N_PotVolatilisedSum += vo_N_PotVolatilised;

        // debug('vo_VolatilisationRate', vo_VolatilisationRate);
        // debug('vo_SoilWet', vo_SoilWet);
        // debug('vw_MeanAirTemperature', vw_MeanAirTemperature);
        // debug('vw_WindSpeed', vw_WindSpeed);
        // debug('it_AOM_Pool.vo_AOM_DryMatterContent', it_AOM_Pool.vo_AOM_DryMatterContent);
        // debug('Number(it_AOM_Pool.incorporation)', Number(it_AOM_Pool.incorporation));
        // debug('soilColumn[0].vs_SoilpH ', soilColumn[0].vs_SoilpH);
        // debug('vo_N_PotVolatilised', vo_N_PotVolatilised);
        // debug('vo_AOM_TAN_Content', vo_AOM_TAN_Content);
        // debug('vo_MaxVolatilisation', vo_MaxVolatilisation);
        // debug('vo_VolatilisationHalfLife', vo_VolatilisationHalfLife);
        // debug('it_AOM_Pool.vo_DaysAfterApplication', it_AOM_Pool.vo_DaysAfterApplication);
        // debug('AOM_Pool', AOM_Pool);

      });

      if (soilColumn[0].vs_SoilNH4 > (vo_N_PotVolatilisedSum)) {
        vo_N_ActVolatilised = vo_N_PotVolatilisedSum;
      } else {
        vo_N_ActVolatilised = soilColumn[0].vs_SoilNH4;
      }
      // update NH4 content of top soil layer with volatilisation balance

      soilColumn[0].vs_SoilNH4 -= (vo_N_ActVolatilised / soilColumn[0].vs_LayerThickness);
    } else {
      vo_N_ActVolatilised = 0.0;
    }

    if (soilColumn[0].vs_SoilNH4 < 0)
      throw soilColumn[0].vs_SoilNH4;

    // NH3 volatilised from top layer NH4 pool. See Urea section
    vo_Total_NH3_Volatilised = (vo_N_ActVolatilised + vo_NH3_Volatilised); // [kg N m-2]
    /** @todo <b>Claas: </b>Zusammenfassung für output. Wohin damit??? */

    AOM_Pool.forEach(function (it_AOM_Pool) {

      if (it_AOM_Pool.vo_DaysAfterApplication > 0 && !vo_AOM_Addition) {
        it_AOM_Pool.vo_DaysAfterApplication++;
      }
    });
  }

  var fo_Nitrification = function () {

    if (soilColumn[0].vs_SoilNO3 < 0)
      throw soilColumn[0].vs_SoilNO3;
   
    var nools = soilColumn.vs_NumberOfOrganicLayers();
    var po_AmmoniaOxidationRateCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_AmmoniaOxidationRateCoeffStandard;
    var po_NitriteOxidationRateCoeffStandard = centralParameterProvider.userSoilOrganicParameters.po_NitriteOxidationRateCoeffStandard;

    //! Nitrification rate coefficient [d-1]
    var vo_AmmoniaOxidationRateCoeff = new Array(nools);
    var vo_NitriteOxidationRateCoeff = new Array(nools);

    //! Nitrification rate [kg NH4-N m-3 d-1]
    var vo_AmmoniaOxidationRate = new Array(nools);
    var vo_NitriteOxidationRate = new Array(nools);

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      // Calculate nitrification rate coefficients
  //    cout << "SO-2:\t" << soilColumn[i_Layer].vs_SoilMoisture_pF() << endl;
      vo_AmmoniaOxidationRateCoeff[i_Layer] = po_AmmoniaOxidationRateCoeffStandard * fo_TempOnNitrification(
          soilColumn[i_Layer].get_Vs_SoilTemperature()) * fo_MoistOnNitrification(soilColumn[i_Layer].vs_SoilMoisture_pF());

      vo_AmmoniaOxidationRate[i_Layer] = vo_AmmoniaOxidationRateCoeff[i_Layer] * soilColumn[i_Layer].vs_SoilNH4;

      vo_NitriteOxidationRateCoeff[i_Layer] = po_NitriteOxidationRateCoeffStandard
          * fo_TempOnNitrification(soilColumn[i_Layer].get_Vs_SoilTemperature())
          * fo_MoistOnNitrification(soilColumn[i_Layer].vs_SoilMoisture_pF())
              * fo_NH3onNitriteOxidation(soilColumn[i_Layer].vs_SoilNH4,soilColumn[i_Layer].vs_SoilpH);

      vo_NitriteOxidationRate[i_Layer] = vo_NitriteOxidationRateCoeff[i_Layer] * soilColumn[i_Layer].vs_SoilNH4;

    }

    // debug('vo_AmmoniaOxidationRateCoeff', vo_AmmoniaOxidationRateCoeff);
    // debug('vo_NitriteOxidationRate', vo_NitriteOxidationRate);

    if (soilColumn[0].vs_SoilNH4 < 0)
      throw soilColumn[0].vs_SoilNH4;

    if (soilColumn[0].vs_SoilNO2 < 0)
      throw soilColumn[0].vs_SoilNO2;

    if (soilColumn[0].vs_SoilNO3 < 0)
      throw soilColumn[0].vs_SoilNO3;

    // Update NH4, NO2 and NO3 content with nitrification balance
    // Stange, F., C. Nendel (2014): N.N., in preparation


    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      if (soilColumn[i_Layer].vs_SoilNH4 > vo_AmmoniaOxidationRate[i_Layer]) {

        soilColumn[i_Layer].vs_SoilNH4 -= vo_AmmoniaOxidationRate[i_Layer];
        soilColumn[i_Layer].vs_SoilNO2 += vo_AmmoniaOxidationRate[i_Layer];


      } else {

        soilColumn[i_Layer].vs_SoilNO2 += soilColumn[i_Layer].vs_SoilNH4;
        soilColumn[i_Layer].vs_SoilNH4 = 0.0;
      }

      if (soilColumn[i_Layer].vs_SoilNO2 > vo_NitriteOxidationRate[i_Layer]) {

        soilColumn[i_Layer].vs_SoilNO2 -= vo_NitriteOxidationRate[i_Layer];
        soilColumn[i_Layer].vs_SoilNO3 += vo_NitriteOxidationRate[i_Layer];


      } else {

        soilColumn[i_Layer].vs_SoilNO3 += soilColumn[i_Layer].vs_SoilNO2;
        soilColumn[i_Layer].vs_SoilNO2 = 0.0;
      }
    }

    // debug('vo_NitriteOxidationRate', vo_NitriteOxidationRate);
    // debug('vo_AmmoniaOxidationRate', vo_AmmoniaOxidationRate);

    if (soilColumn[0].vs_SoilNH4 < 0)
      throw soilColumn[0].vs_SoilNH4;

    if (soilColumn[0].vs_SoilNO2 < 0)
      throw soilColumn[0].vs_SoilNO2;

    if (soilColumn[0].vs_SoilNO3 < 0)
      throw soilColumn[0].vs_SoilNO3;

  };

  var fo_Denitrification = function () {

    var nools = soilColumn.vs_NumberOfOrganicLayers();
    var vo_PotDenitrificationRate = new Array(nools);
    var po_SpecAnaerobDenitrification = centralParameterProvider.userSoilOrganicParameters.po_SpecAnaerobDenitrification;
    var po_TransportRateCoeff = centralParameterProvider.userSoilOrganicParameters.po_TransportRateCoeff;
    vo_TotalDenitrification = 0.0;

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      //Temperature function is the same as in Nitrification subroutine
      vo_PotDenitrificationRate[i_Layer] = po_SpecAnaerobDenitrification
          * vo_SMB_CO2EvolutionRate[i_Layer]
          * fo_TempOnNitrification(soilColumn[i_Layer].get_Vs_SoilTemperature());

      vo_ActDenitrificationRate[i_Layer] = min(vo_PotDenitrificationRate[i_Layer]
           * fo_MoistOnDenitrification(soilColumn[i_Layer].get_Vs_SoilMoisture_m3(),
           soilColumn[i_Layer].get_Saturation()), po_TransportRateCoeff
           * soilColumn[i_Layer].vs_SoilNO3);

      // debug('fo_TempOnNitrification ' + i_Layer, fo_TempOnNitrification(soilColumn[i_Layer].get_Vs_SoilTemperature()));
      // debug('fo_MoistOnDenitrification ' + i_Layer, fo_MoistOnDenitrification(soilColumn[i_Layer].get_Vs_SoilMoisture_m3(),
      //      soilColumn[i_Layer].get_Saturation()));
      // debug('soilColumn.that['+i_Layer+'].vs_SoilNO3', soilColumn[i_Layer].vs_SoilNO3);
    }

      // update NO3 content of soil layer with denitrification balance [kg N m-3]

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

      if (soilColumn[i_Layer].vs_SoilNO3 > vo_ActDenitrificationRate[i_Layer]) {

        
        soilColumn[i_Layer].vs_SoilNO3 -= vo_ActDenitrificationRate[i_Layer];

      } else {

        vo_ActDenitrificationRate[i_Layer] = soilColumn[i_Layer].vs_SoilNO3;
        soilColumn[i_Layer].vs_SoilNO3 = 0.0;

      }

      vo_TotalDenitrification += vo_ActDenitrificationRate[i_Layer] * soilColumn[0].vs_LayerThickness; // [kg m-3] --> [kg m-2] ;
    }

    vo_SumDenitrification += vo_TotalDenitrification; // [kg N m-2]

    // debug('vo_PotDenitrificationRate', vo_PotDenitrificationRate);
    // debug('po_SpecAnaerobDenitrification', po_SpecAnaerobDenitrification);
    // debug('po_TransportRateCoeff', po_TransportRateCoeff);
    // debug('vo_TotalDenitrification', vo_TotalDenitrification);
    // debug('vo_SMB_CO2EvolutionRate'[i_Layer], vo_SMB_CO2EvolutionRate[i_Layer]);
    // debug('fo_TempOnNitrification', fo_TempOnNitrification(soilColumn[i_Layer].get_Vs_SoilTemperature()));
    // debug('fo_MoistOnDenitrification', fo_MoistOnDenitrification(soilColumn[i_Layer].get_Vs_SoilMoisture_m3(),
    //        soilColumn[i_Layer].get_Saturation()));
    // debug('po_TransportRateCoeff', po_TransportRateCoeff);
    // debug('vo_ActDenitrificationRate', vo_ActDenitrificationRate);

    if (vo_TotalDenitrification < 0)
      throw vo_TotalDenitrification;

  };


  var fo_N2OProduction = function () {

    var nools = soilColumn.vs_NumberOfOrganicLayers();
    var vo_N2OProduction = new Array(nools);
    var po_N2OProductionRate = centralParameterProvider.userSoilOrganicParameters.po_N2OProductionRate;
    vo_N2O_Produced = 0.0;

    for (var i_Layer = 0; i_Layer < nools; i_Layer++) {

        vo_N2OProduction[i_Layer] = soilColumn[i_Layer].vs_SoilNO2
             * fo_TempOnNitrification(soilColumn[i_Layer].get_Vs_SoilTemperature())
             * po_N2OProductionRate * (1.0 / (1.0 +
             (pow(10.0,soilColumn[i_Layer].vs_SoilpH) - ORGANIC_CONSTANTS.PO_PKAHNO2)));

        vo_N2O_Produced += vo_N2OProduction[i_Layer];
    }

  };

  var fo_PoolUpdate = function () {
    
    for (var i_Layer = 0; i_Layer < soilColumn.vs_NumberOfOrganicLayers(); i_Layer++) {

      var AOM_Pool = soilColumn[i_Layer].vo_AOM_Pool;

      vo_AOM_SlowDeltaSum[i_Layer] = 0.0;
      vo_AOM_FastDeltaSum[i_Layer] = 0.0;
      vo_AOM_SlowSum[i_Layer] = 0.0;
      vo_AOM_FastSum[i_Layer] = 0.0;

      AOM_Pool.forEach(function (it_AOM_Pool) {
        it_AOM_Pool.vo_AOM_Slow += it_AOM_Pool.vo_AOM_SlowDelta;
        it_AOM_Pool.vo_AOM_Fast += it_AOM_Pool.vo_AOM_FastDelta;

        vo_AOM_SlowDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_SlowDelta;
        vo_AOM_FastDeltaSum[i_Layer] += it_AOM_Pool.vo_AOM_FastDelta;

        vo_AOM_SlowSum[i_Layer] += it_AOM_Pool.vo_AOM_Slow;
        vo_AOM_FastSum[i_Layer] += it_AOM_Pool.vo_AOM_Fast;
      });

      soilColumn[i_Layer].vs_SOM_Slow += vo_SOM_SlowDelta[i_Layer];
      soilColumn[i_Layer].vs_SOM_Fast += vo_SOM_FastDelta[i_Layer];
      soilColumn[i_Layer].vs_SMB_Slow += vo_SMB_SlowDelta[i_Layer];
      soilColumn[i_Layer].vs_SMB_Fast += vo_SMB_FastDelta[i_Layer];

      if (i_Layer == 0) {

        vo_CBalance[i_Layer] = vo_AOM_SlowInput + vo_AOM_FastInput + vo_AOM_SlowDeltaSum[i_Layer]
               + vo_AOM_FastDeltaSum[i_Layer] + vo_SMB_SlowDelta[i_Layer]
               + vo_SMB_FastDelta[i_Layer] + vo_SOM_SlowDelta[i_Layer]
               + vo_SOM_FastDelta[i_Layer] + vo_SOM_FastInput;

      } else {
        vo_CBalance[i_Layer] = vo_AOM_SlowDeltaSum[i_Layer]
               + vo_AOM_FastDeltaSum[i_Layer] + vo_SMB_SlowDelta[i_Layer]
               + vo_SMB_FastDelta[i_Layer] + vo_SOM_SlowDelta[i_Layer]
               + vo_SOM_FastDelta[i_Layer];
      }


      vo_SoilOrganicC[i_Layer] = (soilColumn[i_Layer].vs_SoilOrganicCarbon() * soilColumn[i_Layer].vs_SoilBulkDensity()) - vo_InertSoilOrganicC[i_Layer]; // ([kg C kg-1] * [kg m-3]) - [kg C m-3]
      vo_SoilOrganicC[i_Layer] += vo_CBalance[i_Layer];
      
      soilColumn[i_Layer].set_SoilOrganicCarbon((vo_SoilOrganicC[i_Layer] + vo_InertSoilOrganicC[i_Layer]) / soilColumn[i_Layer].vs_SoilBulkDensity()); // [kg C m-3] / [kg m-3] --> [kg C kg-1]

    soilColumn[i_Layer].set_SoilOrganicMatter((vo_SoilOrganicC[i_Layer] + vo_InertSoilOrganicC[i_Layer])/ ORGANIC_CONSTANTS.PO_SOM_TO_C
                / soilColumn[i_Layer].vs_SoilBulkDensity()); // [kg C m-3] / [kg m-3] --> [kg C kg-1]
    } // for
  };

  var fo_ClayOnDecompostion = function (d_SoilClayContent, d_LimitClayEffect) {
    
    var fo_ClayOnDecompostion=0.0;

    if (d_SoilClayContent >= 0.0 && d_SoilClayContent <= d_LimitClayEffect) {
      fo_ClayOnDecompostion = 1.0 - 2.0 * d_SoilClayContent;
    } else if (d_SoilClayContent > d_LimitClayEffect && d_SoilClayContent <= 1.0) {
      fo_ClayOnDecompostion = 1.0 - 2.0 * d_LimitClayEffect;
    } else {
      debug("irregular clay content");
    }
    return fo_ClayOnDecompostion;
  };

  var fo_TempOnDecompostion = function (d_SoilTemperature) {
    
    var fo_TempOnDecompostion=0.0;

    if (d_SoilTemperature <= 0.0 && d_SoilTemperature > -40.0) {

      //
      fo_TempOnDecompostion = 0.0;

    } else if (d_SoilTemperature > 0.0 && d_SoilTemperature <= 20.0) {

      fo_TempOnDecompostion = 0.1 * d_SoilTemperature;

    } else if (d_SoilTemperature > 20.0 && d_SoilTemperature <= 70.0) {

      fo_TempOnDecompostion = exp(0.47 - (0.027 * d_SoilTemperature) + (0.00193 * d_SoilTemperature * d_SoilTemperature));
    } else {
      debug("irregular soil temperature fo_TempOnDecompostion (d_SoilTemperature = "+d_SoilTemperature+")");
    }

    return fo_TempOnDecompostion;
  };

  var fo_MoistOnDecompostion = function (d_SoilMoisture_pF) {
    
    var fo_MoistOnDecompostion=0.0;

    if (abs(d_SoilMoisture_pF) <= 1.0E-7) {
      //
      fo_MoistOnDecompostion = 0.6;

    } else if (d_SoilMoisture_pF > 0.0 && d_SoilMoisture_pF <= 1.5) {
      //
      fo_MoistOnDecompostion = 0.6 + 0.4 * (d_SoilMoisture_pF / 1.5);

    } else if (d_SoilMoisture_pF > 1.5 && d_SoilMoisture_pF <= 2.5) {
      //
      fo_MoistOnDecompostion = 1.0;

    } else if (d_SoilMoisture_pF > 2.5 && d_SoilMoisture_pF <= 6.5) {
      //
      fo_MoistOnDecompostion = 1.0 - ((d_SoilMoisture_pF - 2.5) / 4.0);

    } else if (d_SoilMoisture_pF > 6.5) {

      fo_MoistOnDecompostion = 0.0;

    }  else if (d_SoilMoisture_pF === -Infinity) { /* TODO: Special JavaScript case ? */
      fo_MoistOnDecompostion = 0.0;
    
    } else {
      debug("fo_MoistOnDecompostion ( d_SoilMoisture_pF ) : irregular soil water content");
    }

    return fo_MoistOnDecompostion;
  };

  var fo_MoistOnHydrolysis = function (d_SoilMoisture_pF) {

    if (DEBUG) debug('fo_MoistOnHydrolysis', arguments);

    var fo_MoistOnHydrolysis=0.0;

    if (d_SoilMoisture_pF > 0.0 && d_SoilMoisture_pF <= 1.1) {
      fo_MoistOnHydrolysis = 0.72;

    } else if (d_SoilMoisture_pF > 1.1 && d_SoilMoisture_pF <= 2.4) {
      fo_MoistOnHydrolysis = 0.2207 * d_SoilMoisture_pF + 0.4672;

    } else if (d_SoilMoisture_pF > 2.4 && d_SoilMoisture_pF <= 3.4) {
      fo_MoistOnHydrolysis = 1.0;

    } else if (d_SoilMoisture_pF > 3.4 && d_SoilMoisture_pF <= 4.6) {
      fo_MoistOnHydrolysis = -0.8659 * d_SoilMoisture_pF + 3.9849;

    } else if (d_SoilMoisture_pF > 4.6) {
      fo_MoistOnHydrolysis = 0.0;

    } else if (d_SoilMoisture_pF === -Infinity) { /* TODO: Special JavaScript case ? */
      fo_MoistOnHydrolysis = 0.0;
    
    } else {
      debug("fo_MoistOnHydrolysis ( d_SoilMoisture_pF: "+d_SoilMoisture_pF+" ) irregular soil water content");
    }

    return fo_MoistOnHydrolysis;
  };

  var fo_TempOnNitrification = function (d_SoilTemperature) {
    
    var fo_TempOnNitrification=0.0;

    if (d_SoilTemperature <= 2.0 && d_SoilTemperature > -40.0) {
      fo_TempOnNitrification = 0.0;

    } else if (d_SoilTemperature > 2.0 && d_SoilTemperature <= 6.0) {
      fo_TempOnNitrification = 0.15 * (d_SoilTemperature - 2.0);

    } else if (d_SoilTemperature > 6.0 && d_SoilTemperature <= 20.0) {
      fo_TempOnNitrification = 0.1 * d_SoilTemperature;

    } else if (d_SoilTemperature > 20.0 && d_SoilTemperature <= 70.0) {
      fo_TempOnNitrification
          = exp(0.47 - (0.027 * d_SoilTemperature) + (0.00193 * d_SoilTemperature * d_SoilTemperature));
    } else {
      debug("irregular soil temperature");
    }

    return fo_TempOnNitrification;
  };

  var fo_MoistOnNitrification = function (d_SoilMoisture_pF) {
    
    var fo_MoistOnNitrification=0.0;

    if (abs(d_SoilMoisture_pF) <= 1.0E-7) {
      fo_MoistOnNitrification = 0.6;

    } else if (d_SoilMoisture_pF > 0.0 && d_SoilMoisture_pF <= 1.5) {
      fo_MoistOnNitrification = 0.6 + 0.4 * (d_SoilMoisture_pF / 1.5);

    } else if (d_SoilMoisture_pF > 1.5 && d_SoilMoisture_pF <= 2.5) {
      fo_MoistOnNitrification = 1.0;

    } else if (d_SoilMoisture_pF > 2.5 && d_SoilMoisture_pF <= 5.0) {
      fo_MoistOnNitrification = 1.0 - ((d_SoilMoisture_pF - 2.5) / 2.5);

    } else if (d_SoilMoisture_pF > 5.0) {
      fo_MoistOnNitrification = 0.0;

    } else {
      debug("irregular soil water content");
    }
    return fo_MoistOnNitrification;
  };

  var fo_MoistOnDenitrification = function (d_SoilMoisture_m3, d_Saturation) {

    var po_Denit1 = centralParameterProvider.userSoilOrganicParameters.po_Denit1;
    var po_Denit2 = centralParameterProvider.userSoilOrganicParameters.po_Denit2;
    var po_Denit3 = centralParameterProvider.userSoilOrganicParameters.po_Denit3;
    var fo_MoistOnDenitrification=0.0;

    if ((d_SoilMoisture_m3 / d_Saturation) <= 0.8) {
      fo_MoistOnDenitrification = 0.0;

    } else if ((d_SoilMoisture_m3 / d_Saturation) > 0.8 && (d_SoilMoisture_m3 / d_Saturation) <= 0.9) {

      fo_MoistOnDenitrification = po_Denit1 * ((d_SoilMoisture_m3 / d_Saturation)
           - po_Denit2) / (po_Denit3 - po_Denit2);

    } else if ((d_SoilMoisture_m3 / d_Saturation) > 0.9 && (d_SoilMoisture_m3 / d_Saturation) <= 1.0) {

      fo_MoistOnDenitrification = po_Denit1 + (1.0 - po_Denit1)
          * ((d_SoilMoisture_m3 / d_Saturation) - po_Denit3) / (1.0 - po_Denit3);
    } else {
      debug("irregular soil water content");
    }

    return fo_MoistOnDenitrification;
  };

  var fo_NH3onNitriteOxidation = function (d_SoilNH4, d_SoilpH) {

    var po_Inhibitor_NH3 = centralParameterProvider.userSoilOrganicParameters.po_Inhibitor_NH3;
    var fo_NH3onNitriteOxidation=0.0;

    fo_NH3onNitriteOxidation = po_Inhibitor_NH3 + d_SoilNH4 * (1.0 - 1.0 / (1.0
         + pow(10.0,(d_SoilpH - ORGANIC_CONSTANTS.PO_PKANH3)))) / po_Inhibitor_NH3;

    return fo_NH3onNitriteOxidation;
  };

  var fo_NetEcosystemProduction = function (d_NetPrimaryProduction, d_DecomposerRespiration) {

    var vo_NEP = 0.0;

    vo_NEP = d_NetPrimaryProduction - (d_DecomposerRespiration * 10000.0); // [kg C ha-1 d-1]

    return vo_NEP;
  };

  var fo_NetEcosystemExchange = function (d_NetPrimaryProduction, d_DecomposerRespiration) {

    // NEE = NEP (M.U.F. Kirschbaum and R. Mueller (2001): Net Ecosystem Exchange. Workshop Proceedings CRC for greenhouse accounting.
    // Per definition: NPP is negative and respiration is positive

    var vo_NEE = 0.0;

    vo_NEE = - d_NetPrimaryProduction + (d_DecomposerRespiration * 10000.0); // [kg C ha-1 d-1]

    return vo_NEE;
  };

  var get_SoilOrganicC = function (i_Layer)  {
    return vo_SoilOrganicC[i_Layer] / soilColumn[i_Layer].vs_SoilBulkDensity();
  };

  var get_AOM_FastSum = function (i_Layer) {
    return vo_AOM_FastSum[i_Layer];
  };

  var get_AOM_SlowSum = function (i_Layer) {
    return vo_AOM_SlowSum[i_Layer];
  };

  var get_SMB_Fast = function (i_Layer) {
    return soilColumn[i_Layer].vs_SMB_Fast;
  };

  var get_SMB_Slow = function (i_Layer) {
    return soilColumn[i_Layer].vs_SMB_Slow;
  };

  var get_SOM_Fast = function (i_Layer) {
    return soilColumn[i_Layer].vs_SOM_Fast;
  };

  var get_SOM_Slow = function (i_Layer) {
    return soilColumn[i_Layer].vs_SOM_Slow;
  };

  var get_CBalance = function (i_Layer) {
    return vo_CBalance[i_Layer];
  };

  var get_SMB_CO2EvolutionRate = function (i_Layer) {
    return vo_SMB_CO2EvolutionRate[i_Layer];
  };

  var get_ActDenitrificationRate = function (i_Layer) {
    return vo_ActDenitrificationRate[i_Layer];
  };

  var get_NetNMineralisationRate = function (i_Layer) {
    return vo_NetNMineralisationRate[i_Layer] * 10000.0;
  };

  var get_NetNMineralisation = function () {
    return vo_NetNMineralisation * 10000.0;
  };

  var get_SumNetNMineralisation = function () {
    return vo_SumNetNMineralisation * 10000.0;
  };

  var get_SumDenitrification = function () {
    return vo_SumDenitrification * 10000.0;
  };

  var get_Denitrification = function () {
    return vo_TotalDenitrification * 10000.0;
  };

  var get_NH3_Volatilised = function () {
    return vo_Total_NH3_Volatilised * 10000.0;
  };

  var get_SumNH3_Volatilised = function () {
    return vo_SumNH3_Volatilised * 10000.0;
  };

  var get_N2O_Produced = function () {
    return vo_N2O_Produced * 10000.0;
  };

  var get_SumN2O_Produced = function () {
    return vo_SumN2O_Produced * 10000.0;
  };

  var get_DecomposerRespiration = function () {
    return vo_DecomposerRespiration * 10000.0;
  };

  var get_NetEcosystemProduction = function () {
    return vo_NetEcosystemProduction;
  };

  var get_NetEcosystemExchange = function () {
    return vo_NetEcosystemExchange;
  };

  var put_Crop = function (c) {
    crop = c;
  };

  var remove_Crop = function () {
    crop = null;
  };

  return {
      step: step
    , addOrganicMatter: addOrganicMatter
    , addIrrigationWater: addIrrigationWater
    , setIncorporation: function (incorp) { incorporation = incorp; }
    , put_Crop: put_Crop
    , remove_Crop: remove_Crop
    , get_SoilOrganicC: get_SoilOrganicC
    , get_AOM_FastSum: get_AOM_FastSum
    , get_AOM_SlowSum: get_AOM_SlowSum
    , get_SMB_Fast: get_SMB_Fast
    , get_SMB_Slow: get_SMB_Slow
    , get_SOM_Fast: get_SOM_Fast
    , get_SOM_Slow: get_SOM_Slow
    , get_CBalance: get_CBalance
    , get_SMB_CO2EvolutionRate: get_SMB_CO2EvolutionRate
    , get_ActDenitrificationRate: get_ActDenitrificationRate
    , get_NetNMineralisationRate: get_NetNMineralisationRate
    , get_NH3_Volatilised: get_NH3_Volatilised
    , get_SumNH3_Volatilised: get_SumNH3_Volatilised
    , get_N2O_Produced: get_N2O_Produced
    , get_SumN2O_Produced: get_SumN2O_Produced
    , get_NetNMineralisation: get_NetNMineralisation
    , get_SumNetNMineralisation: get_SumNetNMineralisation
    , get_SumDenitrification: get_SumDenitrification
    , get_Denitrification: get_Denitrification
    , get_DecomposerRespiration: get_DecomposerRespiration
    , get_NetEcosystemProduction: get_NetEcosystemProduction
    , get_NetEcosystemExchange: get_NetEcosystemExchange
  };

};
