var runModel = function (env, progressCallback) {

  logger(MSG.INFO, "starting monica");
  
  if(env.cropRotation.length === 0) {
    logger(MSG.ERROR, "rotation is empty");
    return;
  }

  var model = new Model(env)
    , currentDate = env.da.startDate()
    , totalNoDays = env.da.noOfStepsPossible()
    , dayInMonth = 0 // day in current month
    , productionProcessIdx = 0 // iterator through the production processes
    , currentProductionProcess = env.cropRotation[productionProcessIdx] // direct handle to current process
    , nextProductionProcessApplicationDate = currentProductionProcess.start()
    ;

  /* output processing */  
  var doWriteOutputFiles = (env.pathToOutputDir != null && !!fs)
    , foutFileName = env.pathToOutputDir + '/rmout.dat'
    , goutFileName = env.pathToOutputDir + '/smout.dat'
    , monicaParamFileName = env.pathToOutputDir + '/monica_parameters.txt'
    ;

  if (doWriteOutputFiles) {
    /* writes the header line to output files */
    initializeFoutHeader(foutFileName);
    initializeGoutHeader(goutFileName);
    dumpMonicaParametersIntoFile(monicaParamFileName, env.centralParameterProvider);
  }

  logger(MSG.INFO, "next app-date: " + nextProductionProcessApplicationDate.toString());

  /* if for some reason there are no applications (no nothing) in the production process: quit */
  if(!nextProductionProcessApplicationDate.isValid()) {
    logger(MSG.ERROR, "start of production-process: " + currentProductionProcess.toString() + " is not valid");
    return;
  }

  for (var dayOfSimulation = 0; dayOfSimulation < totalNoDays; dayOfSimulation++) {

    currentDate.setDate(currentDate.getDate() + 1);
    dayInMonth++;

    logger(MSG.INFO, date.toISOString().split('T')[0]);
    
    model.resetDailyCounter();

    /* test if model's crop has been dying in previous step if yes, it will be incorporated into soil */
    if (model.cropGrowth() && model.cropGrowth().isDying())
        model.incorporateCurrentCrop();

    /* there's something to apply at this day */
    if (nextProductionProcessApplicationDate.setHours(0,0,0,0) === currentDate.setHours(0,0,0,0)) {
      
      /* apply everything to do at current day */
      currentProductionProcess.apply(nextProductionProcessApplicationDate, model);
      logger(MSG.INFO, 'applied at: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);

      /* get the next application date to wait for */
      var prevPPApplicationDate = nextProductionProcessApplicationDate;

      nextProductionProcessApplicationDate = currentProductionProcess.nextDate(nextProductionProcessApplicationDate);

      logger(MSG.INFO, 'next app-date: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);

      /* if application date was not valid, we're (probably) at the end
        of the application list of this production process
        -> go to the next one in the crop rotation */
      if (!nextProductionProcessApplicationDate.isValid()) {

        /* to count the applied fertiliser for the next production process */
        model.resetFertiliserCounter();

        /* resets crop values for use in next year */
        currentProductionProcess.crop().reset();

        productionProcessIdx++;
        currentProductionProcess = env.cropRotation[productionProcessIdx];
        nextProductionProcessApplicationDate = currentProductionProcess.start();

        logger(MSG.INFO, 'new valid next app-date: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);
      }

    }

    /* write simulation date to file */
    if (doWriteOutputFiles) {
      fs.appendFileSync(goutFileName, currentDate.toLocaleDateString(), { encoding: 'utf8' });
      fs.appendFileSync(foutFileName, currentDate.toLocaleDateString(), { encoding: 'utf8' });
    }

    /* run crop step */
    if(model.isCropPlanted())
      model.cropStep(dayOfSimulation);

    /* writes crop results to output file */
    if (doWriteOutputFiles)
      writeCropResults(model.cropGrowth(), foutFileName, goutFileName, model.isCropPlanted());
    
    /* if progressCallback is provided */
    if (progressCallback)
      progressCallback(currentDate, model);

    model.generalStep(dayOfSimulation);

    if (doWriteOutputFiles)
      writeGeneralResults(foutFileName, goutFileName, env, model, dayOfSimulation);
  }

  logger(MSG.INFO, "returning from runModel");
  
  /* if progressCallback is provided send null i.e. we are done*/
  if (progressCallback)
    progressCallback(null, null);

  return; /* TODO: what to return? */

};

/**
 * Write header line to fout Output file
 * @param fout File pointer to rmout.dat
 */
var initializeFoutHeader = function (foutFileName) {

  var outLayers = 20, numberOfOrgans = 5;
  var fout = "", endl = '\n';
  fout += "Datum     ";
  fout += "\tCrop";
  fout += "\tTraDef";
  fout += "\tTra";
  fout += "\tNDef";
  fout += "\tHeatRed";
  fout += "\tOxRed";

  fout += "\tStage";
  fout += "\tTempSum";
  fout += "\tVernF";
  fout += "\tDaylF";
  fout += "\tIncRoot";
  fout += "\tIncLeaf";
  fout += "\tIncShoot";
  fout += "\tIncFruit";

  fout += "\tRelDev";
  fout += "\tAbBiom";
  
  fout += "\tRoot";
  fout += "\tLeaf"; 
  fout += "\tShoot";
  fout += "\tFruit";
  fout += "\tStruct";
  fout += "\tSugar";

  fout += "\tYield";
  fout += "\tSumYield";

  fout += "\tGroPhot";
  fout += "\tNetPhot";
  fout += "\tMaintR";
  fout += "\tGrowthR";
  fout += "\tStomRes";
  fout += "\tHeight";
  fout += "\tLAI";
  fout += "\tRootDep";
  fout += "\tEffRootDep";

  fout += "\tNBiom";
  fout += "\tSumNUp";
  fout += "\tActNup";
  fout += "\tPotNup";
  fout += "\tNFixed";
  fout += "\tTarget";

  fout += "\tCritN";
  fout += "\tAbBiomN";
  fout += "\tYieldN";
  fout += "\tProtein";

  fout += "\tNPP";
  fout += "\tNPPRoot";
  fout += "\tNPPLeaf";
  fout += "\tNPPShoot";
  fout += "\tNPPFruit";
  fout += "\tNPPStruct";
  fout += "\tNPPSugar";

  fout += "\tGPP";
  fout += "\tRa";
  fout += "\tRaRoot";
  fout += "\tRaLeaf";
  fout += "\tRaShoot";
  fout += "\tRaFruit";
  fout += "\tRaStruct";
  fout += "\tRaSugar";

  for (var i_Layer = 0; i_Layer < outLayers; i_Layer++) {
    fout += "\tMois" + i_Layer;
  }
  fout += "\tPrecip";
  fout += "\tIrrig";
  fout += "\tInfilt";
  fout += "\tSurface";
  fout += "\tRunOff";
  fout += "\tSnowD";
  fout += "\tFrostD";
  fout += "\tThawD";
  for (var i_Layer = 0; i_Layer < outLayers; i_Layer++) {
    fout += "\tPASW-" + i_Layer;
  }
  fout += "\tSurfTemp";
  fout += "\tSTemp0";
  fout += "\tSTemp1";
  fout += "\tSTemp2";
  fout += "\tSTemp3";
  fout += "\tSTemp4";
  fout += "\tact_Ev";
  fout += "\tact_ET";
  fout += "\tET0";
  fout += "\tKc";
  fout += "\tatmCO2";
  fout += "\tGroundw";
  fout += "\tRecharge";
  fout += "\tNLeach";

  for(var i_Layer = 0; i_Layer < outLayers; i_Layer++) {
    fout += "\tNO3-" + i_Layer;
  }
  fout += "\tCarb";
  for(var i_Layer = 0; i_Layer < outLayers; i_Layer++) {
    fout += "\tNH4-" + i_Layer;
  }
  for(var i_Layer = 0; i_Layer < 4; i_Layer++) {
    fout += "\tNO2-" + i_Layer;
  }
  for(var i_Layer = 0; i_Layer < 6; i_Layer++) {
    fout += "\tSOC-" + i_Layer;
  }

  fout += "\tSOC-0-30";
  fout += "\tSOC-0-200";

  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\tAOMf-" + i_Layer;
  }
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\tAOMs-" + i_Layer;
  }
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\tSMBf-" + i_Layer;
  }
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\tSMBs-" + i_Layer;
  }
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\tSOMf-" + i_Layer;
  }
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\tSOMs-" + i_Layer;
  }
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\tCBal-" + i_Layer;
  }
  for(var i_Layer = 0; i_Layer < 3; i_Layer++) {
    fout += "\tNmin-" + i_Layer;
  }

  fout += "\tNetNmin";
  fout += "\tDenit";
  fout += "\tN2O";
  fout += "\tSoilpH";
  fout += "\tNEP";
  fout += "\tNEE";
  fout += "\tRh";


  fout += "\ttmin";
  fout += "\ttavg";
  fout += "\ttmax";
  fout += "\twind";
  fout += "\tglobrad";
  fout += "\trelhumid";
  fout += "\tsunhours";
  fout += endl;

  //**** Second header line ***
  fout += "TTMMYYY";  // Date
  fout += "\t[ ]";    // Crop name
  fout += "\t[0;1]";    // TranspirationDeficit
  fout += "\t[mm]";     // ActualTranspiration
  fout += "\t[0;1]";    // CropNRedux
  fout += "\t[0;1]";    // HeatStressRedux
  fout += "\t[0;1]";    // OxygenDeficit

  fout += "\t[ ]";      // DevelopmentalStage
  fout += "\t[°Cd]";    // CurrentTemperatureSum
  fout += "\t[0;1]";    // VernalisationFactor
  fout += "\t[0;1]";    // DaylengthFactor
  fout += "\t[kg/ha]";  // OrganGrowthIncrement root
  fout += "\t[kg/ha]";  // OrganGrowthIncrement leaf
  fout += "\t[kg/ha]";  // OrganGrowthIncrement shoot
  fout += "\t[kg/ha]";  // OrganGrowthIncrement fruit

  fout += "\t[0;1]";    // RelativeTotalDevelopment
  fout += "\t[kg/ha]";  // AbovegroundBiomass

  for (var i = 0; i < 6; i++) {
    fout += "\t[kgDM/ha]"; // get_OrganBiomass(i)
  }

  fout += "\t[kgDM/ha]";    // get_PrimaryCropYield(3)
  fout += "\t[kgDM/ha]";    // get_AccumulatedPrimaryCropYield(3)

  fout += "\t[kgCH2O/ha]";  // GrossPhotosynthesisHaRate
  fout += "\t[kgCH2O/ha]";  // NetPhotosynthesis
  fout += "\t[kgCH2O/ha]";  // MaintenanceRespirationAS
  fout += "\t[kgCH2O/ha]";  // GrowthRespirationAS
  fout += "\t[s/m]";        // StomataResistance
  fout += "\t[m]";          // CropHeight
  fout += "\t[m2/m2]";      // LeafAreaIndex
  fout += "\t[layer]";      // RootingDepth
  fout += "\t[m]";          // Effective RootingDepth

  fout += "\t[kgN/ha]";     // TotalBiomassNContent
  fout += "\t[kgN/ha]";     // SumTotalNUptake
  fout += "\t[kgN/ha]";     // ActNUptake
  fout += "\t[kgN/ha]";     // PotNUptake
  fout += "\t[kgN/ha]";     // NFixed
  fout += "\t[kgN/kg]";     // TargetNConcentration
  fout += "\t[kgN/kg]";     // CriticalNConcentration
  fout += "\t[kgN/kg]";     // AbovegroundBiomassNConcentration
  fout += "\t[kgN/kg]";     // PrimaryYieldNConcentration
  fout += "\t[kg/kg]";      // RawProteinConcentration

  fout += "\t[kg C ha-1]";   // NPP
  fout += "\t[kg C ha-1]";   // NPP root
  fout += "\t[kg C ha-1]";   // NPP leaf
  fout += "\t[kg C ha-1]";   // NPP shoot
  fout += "\t[kg C ha-1]";   // NPP fruit
  fout += "\t[kg C ha-1]";   // NPP struct
  fout += "\t[kg C ha-1]";   // NPP sugar

  fout += "\t[kg C ha-1]";   // GPP
  fout += "\t[kg C ha-1]";   // Ra
  fout += "\t[kg C ha-1]";   // Ra root
  fout += "\t[kg C ha-1]";   // Ra leaf
  fout += "\t[kg C ha-1]";   // Ra shoot
  fout += "\t[kg C ha-1]";   // Ra fruit
  fout += "\t[kg C ha-1]";   // Ra struct
  fout += "\t[kg C ha-1]";   // Ra sugar

  for (var i_Layer = 0; i_Layer < outLayers; i_Layer++) {
    fout += "\t[m3/m3]"; // Soil moisture content
  }
  fout += "\t[mm]"; // Precipitation
  fout += "\t[mm]"; // Irrigation
  fout += "\t[mm]"; // Infiltration
  fout += "\t[mm]"; // Surface water storage
  fout += "\t[mm]"; // Surface water runoff
  fout += "\t[mm]"; // Snow depth
  fout += "\t[m]"; // Frost front depth in soil
  fout += "\t[m]"; // Thaw front depth in soil
  for(var i_Layer = 0; i_Layer < outLayers; i_Layer++) {
    fout += "\t[m3/m3]"; //PASW
  }

  fout += "\t[°C]"; //
  fout += "\t[°C]";
  fout += "\t[°C]";
  fout += "\t[°C]";
  fout += "\t[°C]";
  fout += "\t[°C]";
  fout += "\t[mm]";
  fout += "\t[mm]";
  fout += "\t[mm]";
  fout += "\t[ ]";
  fout += "\t[ppm]";
  fout += "\t[m]";
  fout += "\t[mm]";
  fout += "\t[kgN/ha]";

  // NO3
  for(var i_Layer = 0; i_Layer < outLayers; i_Layer++) {
    fout += "\t[kgN/m3]";
  }

  fout += "\t[kgN/m3]";  // Soil Carbamid

  // NH4
  for(var i_Layer = 0; i_Layer < outLayers; i_Layer++) {
    fout += "\t[kgN/m3]";
  }

  // NO2
  for(var i_Layer = 0; i_Layer < 4; i_Layer++) {
    fout += "\t[kgN/m3]";
  }

  // get_SoilOrganicC
  for(var i_Layer = 0; i_Layer < 6; i_Layer++) {
    fout += "\t[kgC/kg]";
  }

  fout += "\t[gC m-2]";   // SOC-0-30
  fout += "\t[gC m-2]";   // SOC-0-200

  // get_AOM_FastSum
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\t[kgC/m3]";
  }
  // get_AOM_SlowSum
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\t[kgC/m3]";
  }

  // get_SMB_Fast
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\t[kgC/m3]";
  }
  // get_SMB_Slow
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\t[kgC/m3]";
  }

  // get_SOM_Fast
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\t[kgC/m3]";
  }
  // get_SOM_Slow
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\t[kgC/m3]";
  }

  // get_CBalance
  for(var i_Layer = 0; i_Layer < 1; i_Layer++) {
    fout += "\t[kgC/m3]";
  }

  // NetNMineralisationRate
  for(var i_Layer = 0; i_Layer < 3; i_Layer++) {
    fout += "\t[kgN/ha]";
  }

  fout += "\t[kgN/ha]";  // NetNmin
  fout += "\t[kgN/ha]";  // Denit
  fout += "\t[kgN/ha]";  // N2O
  fout += "\t[ ]";       // SoilpH
  fout += "\t[kgC/ha]";  // NEP
  fout += "\t[kgC/ha]";  // NEE
  fout += "\t[kgC/ha]"; // Rh

  fout += "\t[°C]";     // tmin
  fout += "\t[°C]";     // tavg
  fout += "\t[°C]";     // tmax
  fout += "\t[m/s]";    // wind
  fout += "\tglobrad";  // globrad
  fout += "\t[m3/m3]";  // relhumid
  fout += "\t[h]";      // sunhours
  fout += endl;

  fs.writeFileSync(foutFileName, fout, { encoding: 'utf8' });

};

/**
 * Writes header line to gout-Outputfile
 * @param gout File pointer to smout.dat
 */
var initializeGoutHeader = function (goutFileName) {

  var gout = "", endl = '\n';
  gout += "Datum     ";
  gout += "\tCrop";
  gout += "\tStage";
  gout += "\tHeight";
  gout += "\tRoot";
  gout += "\tRoot10";
  gout += "\tLeaf";
  gout += "\tShoot";
  gout += "\tFruit";
  gout += "\tAbBiom";
  gout += "\tAbGBiom";
  gout += "\tYield";
  gout += "\tEarNo";
  gout += "\tGrainNo";

  gout += "\tLAI";
  gout += "\tAbBiomNc";
  gout += "\tYieldNc";
  gout += "\tAbBiomN";
  gout += "\tYieldN";

  gout += "\tTotNup";
  gout += "\tNGrain";
  gout += "\tProtein";


  gout += "\tBedGrad";
  gout += "\tM0-10";
  gout += "\tM10-20";
  gout += "\tM20-30";
  gout += "\tM30-40";
  gout += "\tM40-50";
  gout += "\tM50-60";
  gout += "\tM60-70";
  gout += "\tM70-80";
  gout += "\tM80-90";
  gout += "\tM0-30";
  gout += "\tM30-60";
  gout += "\tM60-90";
  gout += "\tM0-60";
  gout += "\tM0-90";
  gout += "\tPAW0-200";
  gout += "\tPAW0-130";
  gout += "\tPAW0-150";
  gout += "\tN0-30";
  gout += "\tN30-60";
  gout += "\tN60-90";
  gout += "\tN90-120";
  gout += "\tN0-60";
  gout += "\tN0-90";
  gout += "\tN0-200";
  gout += "\tN0-130";
  gout += "\tN0-150";
  gout += "\tNH430";
  gout += "\tNH460";
  gout += "\tNH490";
  gout += "\tCo0-10";
  gout += "\tCo0-30";
  gout += "\tT0-10";
  gout += "\tT20-30";
  gout += "\tT50-60";
  gout += "\tCO2";
  gout += "\tNH3";
  gout += "\tN2O";
  gout += "\tN2";
  gout += "\tNgas";
  gout += "\tNFert";
  gout += "\tIrrig";
  gout += endl;

  // **** Second header line ****

  gout += "TTMMYYYY";
  gout += "\t[ ]";
  gout += "\t[ ]";
  gout += "\t[m]";
  gout += "\t[kgDM/ha]";
  gout += "\t[kgDM/ha]";
  gout += "\t[kgDM/ha]";
  gout += "\t[kgDM/ha]";
  gout += "\t[kgDM/ha]";
  gout += "\t[kgDM/ha]";
  gout += "\t[kgDM/ha]";
  gout += "\t[kgDM/ha]";
  gout += "\t[ ]";
  gout += "\t[ ]";
  gout += "\t[m2/m2]";
  gout += "\t[kgN/kgDM";
  gout += "\t[kgN/kgDM]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[-]";
  gout += "\t[kg/kgDM]";

  gout += "\t[0;1]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[m3/m3]";
  gout += "\t[mm]";
  gout += "\t[mm]";
  gout += "\t[mm]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[kgC/ha]";
  gout += "\t[kgC/ha]";
  gout += "\t[°C]";
  gout += "\t[°C]";
  gout += "\t[°C]";
  gout += "\t[kgC/ha]";
  gout += "\t[kgN/ha]";
  gout += "\t[-]";
  gout += "\t[-]";
  gout += "\t[-]";
  gout += "\t[kgN/ha]";
  gout += "\t[mm]";
  gout += endl;

  fs.writeFileSync(goutFileName, gout, { encoding: 'utf8' });

};

/**
 * Write crop results to file; if no crop is planted, fields are filled out with zeros;
 * @param mcg CropGrowth modul that contains information about crop
 * @param fout File pointer to rmout.dat
 * @param gout File pointer to smout.dat
 */
var writeCropResults = function (mcg, foutFileName, goutFileName, crop_is_planted) {

  var fout = '', gout = '', endl = '\n';

  if (crop_is_planted) {
    fout += "\t" + mcg.get_CropName();
    fout += "\t" + fixed(10, mcg.get_TranspirationDeficit());// [0;1]
    fout += "\t" + fixed(10, mcg.get_ActualTranspiration());
    fout += "\t" + fixed(10, mcg.get_CropNRedux());// [0;1]
    fout += "\t" + fixed(10, mcg.get_HeatStressRedux());// [0;1]
    fout += "\t" + fixed(10, mcg.get_OxygenDeficit());// [0;1]

    fout += "\t" + fixed(10, mcg.get_DevelopmentalStage() + 1);
    fout += "\t" + fixed(10, mcg.get_CurrentTemperatureSum());
    fout += "\t" + fixed(10, mcg.get_VernalisationFactor());
    fout += "\t" + fixed(10, mcg.get_DaylengthFactor());
    fout += "\t" + fixed(10, mcg.get_OrganGrowthIncrement(0));
    fout += "\t" + fixed(10, mcg.get_OrganGrowthIncrement(1));
    fout += "\t" + fixed(10, mcg.get_OrganGrowthIncrement(2));
    fout += "\t" + fixed(10, mcg.get_OrganGrowthIncrement(3));
    
    fout += "\t" + fixed(10, mcg.get_RelativeTotalDevelopment());
    fout += "\t" + fixed(10, mcg.get_AbovegroundBiomass());

    for (var i = 0, is = mcg.get_NumberOfOrgans(); i < is; i++)
      fout += "\t" + fixed(10, mcg.get_OrganBiomass(i)); // biomass organs, [kg C ha-1]

    for (var i = 0, is = (6 - mcg.get_NumberOfOrgans()); i < is; i++)
      fout += "\t" + 0.0; // adding zero fill if biomass organs < 6,

    /* TODO: implement mcg.get_AccumulatedPrimaryCropYield() */
    fout += "\t" + fixed(10, mcg.get_PrimaryCropYield());
    fout += "\t" + 0.0/* fixed(10, mcg.get_AccumulatedPrimaryCropYield())*/;

    fout += "\t" + fixed(10, mcg.get_GrossPhotosynthesisHaRate()); // [kg CH2O ha-1 dayOfSimulation-1]
    fout += "\t" + fixed(10, mcg.get_NetPhotosynthesis());  // [kg CH2O ha-1 dayOfSimulation-1]
    fout += "\t" + fixed(10, mcg.get_MaintenanceRespirationAS());// [kg CH2O ha-1]
    fout += "\t" + fixed(10, mcg.get_GrowthRespirationAS());// [kg CH2O ha-1]

    fout += "\t" + fixed(10, mcg.get_StomataResistance());// [s m-1]

    fout += "\t" + fixed(10, mcg.get_CropHeight());// [m]
    fout += "\t" + fixed(10, mcg.get_LeafAreaIndex()); //[m2 m-2]
    fout += "\t" + fixed(10, mcg.get_RootingDepth()); //[layer]
    fout += "\t" + fixed(10, mcg.getEffectiveRootingDepth()); //[m]

    fout += "\t" + fixed(10, mcg.get_TotalBiomassNContent());
    fout += "\t" + fixed(10, mcg.get_SumTotalNUptake());
    fout += "\t" + fixed(10, mcg.get_ActNUptake()); // [kg N ha-1]
    fout += "\t" + fixed(10, mcg.get_PotNUptake()); // [kg N ha-1]
    /* TODO: implement get_BiologicalNFixation */
    fout += "\t" + 0.0/*fixed(10, mcg.get_BiologicalNFixation())*/; // [kg N ha-1]
    fout += "\t" + fixed(10, mcg.get_TargetNConcentration());//[kg N kg-1]

    fout += "\t" + fixed(10, mcg.get_CriticalNConcentration());//[kg N kg-1]
    fout += "\t" + fixed(10, mcg.get_AbovegroundBiomassNConcentration());//[kg N kg-1]
    fout += "\t" + fixed(10, mcg.get_PrimaryYieldNConcentration());//[kg N kg-1]
    fout += "\t" + fixed(10, mcg.get_RawProteinConcentration());//[kg N kg-1]
    fout += "\t" + fixed(10, mcg.get_NetPrimaryProduction());//[kg N kg-1]

    for (var i=0; i<mcg.get_NumberOfOrgans(); i++) {
        fout += "\t" + fixed(10, mcg.get_OrganSpecificNPP(i)); // NPP organs, [kg C ha-1]
    }
    // if there less than 4 organs we have to fill the column that
    // was added in the output header of rmout; in this header there
    // are statically 4 columns initialised for the organ NPP
    for (var i=mcg.get_NumberOfOrgans(); i<6; i++) {
        fout += "\t0.0"; // NPP organs, [kg C ha-1]
    }

    fout += "\t" + fixed(10, mcg.get_GrossPrimaryProduction()); // GPP, [kg C ha-1]

    fout += "\t" + fixed(10, mcg.get_AutotrophicRespiration()); // Ra, [kg C ha-1]
    for (var i=0; i<mcg.get_NumberOfOrgans(); i++) {
      fout += "\t" + fixed(10, mcg.get_OrganSpecificTotalRespired(i)); // Ra organs, [kg C ha-1]
    }
    // if there less than 4 organs we have to fill the column that
    // was added in the output header of rmout; in this header there
    // are statically 4 columns initialised for the organ RA
    for (var i=mcg.get_NumberOfOrgans(); i<6; i++) {
        fout += "\t0.0";
    }

    gout += "\t" + mcg.get_CropName();
    gout += "\t" + fixed(10, mcg.get_DevelopmentalStage() + 1);
    gout += "\t" + fixed(10, mcg.get_CropHeight());
    gout += "\t" + fixed(10, mcg.get_OrganBiomass(0));
    gout += "\t" + fixed(10, mcg.get_OrganBiomass(0)); //! @todo
    gout += "\t" + fixed(10, mcg.get_OrganBiomass(1));
    gout += "\t" + fixed(10, mcg.get_OrganBiomass(2));
    gout += "\t" + fixed(10, mcg.get_OrganBiomass(3));
    gout += "\t" + fixed(10, mcg.get_AbovegroundBiomass());
    gout += "\t" + fixed(10, mcg.get_AbovegroundBiomass()); //! @todo
    gout += "\t" + fixed(10, mcg.get_PrimaryCropYield());
    gout += "\t0"; //! @todo
    gout += "\t0"; //! @todo
    gout += "\t" + fixed(10, mcg.get_LeafAreaIndex());
    gout += "\t" + fixed(10, mcg.get_AbovegroundBiomassNConcentration());
    gout += "\t" + fixed(10, mcg.get_PrimaryYieldNConcentration());
    gout += "\t" + fixed(10, mcg.get_AbovegroundBiomassNContent());
    gout += "\t" + fixed(10, mcg.get_PrimaryYieldNContent());
    gout += "\t" + fixed(10, mcg.get_TotalBiomassNContent());
    gout += "\t0"; //! @todo
    gout += "\t" + fixed(10, mcg.get_RawProteinConcentration());

  } else { // crop is not planted

    fout += "\t"; // Crop Name
    fout += "\t1.00"; // TranspirationDeficit
    fout += "\t0.00"; // ActualTranspiration
    fout += "\t1.00"; // CropNRedux
    fout += "\t1.00"; // HeatStressRedux
    fout += "\t1.00"; // OxygenDeficit

    fout += "\t0";      // DevelopmentalStage
    fout += "\t0.0";    // CurrentTemperatureSum
    fout += "\t0.00";   // VernalisationFactor
    fout += "\t0.00";   // DaylengthFactor

    fout += "\t0.00";   // OrganGrowthIncrement root
    fout += "\t0.00";   // OrganGrowthIncrement leaf
    fout += "\t0.00";   // OrganGrowthIncrement shoot
    fout += "\t0.00";   // OrganGrowthIncrement fruit
    fout += "\t0.00";   // RelativeTotalDevelopment

    fout += "\t0.0";    // AbovegroundBiomass
    fout += "\t0.0";    // get_OrganBiomass(0)
    fout += "\t0.0";    // get_OrganBiomass(1)
    fout += "\t0.0";    // get_OrganBiomass(2)
    fout += "\t0.0";    // get_OrganBiomass(3)
    fout += "\t0.0";    // get_OrganBiomass(4)
    fout += "\t0.0";    // get_OrganBiomass(5)
    fout += "\t0.0";    // get_PrimaryCropYield(3)
    fout += "\t0.0";    // get_AccumulatedPrimaryCropYield(3)

    fout += "\t0.000";  // GrossPhotosynthesisHaRate
    fout += "\t0.00";   // NetPhotosynthesis
    fout += "\t0.000";  // MaintenanceRespirationAS
    fout += "\t0.000";  // GrowthRespirationAS
    fout += "\t0.00";   // StomataResistance
    fout += "\t0.00";   // CropHeight
    fout += "\t0.00";   // LeafAreaIndex
    fout += "\t0";      // RootingDepth
    fout += "\t0.0";    // EffectiveRootingDepth

    fout += "\t0.0";    // TotalBiomassNContent
    fout += "\t0.00";   // SumTotalNUptake
    fout += "\t0.00";   // ActNUptake
    fout += "\t0.00";   // PotNUptake
    fout += "\t0.00";   // NFixed
    fout += "\t0.000";  // TargetNConcentration
    fout += "\t0.000";  // CriticalNConcentration
    fout += "\t0.000";  // AbovegroundBiomassNConcentration
    fout += "\t0.000";  // PrimaryYieldNConcentration
    fout += "\t0.000";  // RawProteinConcentration

    fout += "\t0.0";    // NetPrimaryProduction
    fout += "\t0.0"; // NPP root
    fout += "\t0.0"; // NPP leaf
    fout += "\t0.0"; // NPP shoot
    fout += "\t0.0"; // NPP fruit
    fout += "\t0.0"; // NPP struct
    fout += "\t0.0"; // NPP sugar

    fout += "\t0.0"; // GrossPrimaryProduction
    fout += "\t0.0"; // Ra - VcRespiration
    fout += "\t0.0"; // Ra root - OrganSpecificTotalRespired
    fout += "\t0.0"; // Ra leaf - OrganSpecificTotalRespired
    fout += "\t0.0"; // Ra shoot - OrganSpecificTotalRespired
    fout += "\t0.0"; // Ra fruit - OrganSpecificTotalRespired
    fout += "\t0.0"; // Ra struct - OrganSpecificTotalRespired
    fout += "\t0.0"; // Ra sugar - OrganSpecificTotalRespired

    gout += "\t";       // Crop Name
    gout += "\t0";      // DevelopmentalStage
    gout += "\t0.00";   // CropHeight
    gout += "\t0.0";    // OrganBiomass(0)
    gout += "\t0.0";    // OrganBiomass(0)
    gout += "\t0.0";    // OrganBiomass(1)

    gout += "\t0.0";    // OrganBiomass(2)
    gout += "\t0.0";    // OrganBiomass(3)
    gout += "\t0.0";    // AbovegroundBiomass
    gout += "\t0.0";    // AbovegroundBiomass
    gout += "\t0.0";    // PrimaryCropYield

    gout += "\t0";
    gout += "\t0";

    gout += "\t0.00";   // LeafAreaIndex
    gout += "\t0.000";  // AbovegroundBiomassNConcentration
    gout += "\t0.0";    // PrimaryYieldNConcentration
    gout += "\t0.00";   // AbovegroundBiomassNContent
    gout += "\t0.0";    // PrimaryYieldNContent

    gout += "\t0.0";    // TotalBiomassNContent
    gout += "\t0";
    gout += "\t0.00";   // RawProteinConcentration
  }

  fs.appendFileSync(goutFileName, gout, { encoding: 'utf8' });
  fs.appendFileSync(foutFileName, fout, { encoding: 'utf8' });

};


/**
 * Writing general results from MONICA simulation to output files
 * @param fout File pointer to rmout.dat
 * @param gout File pointer to smout.dat
 * @param env Environment object
 * @param monica MONICA model that contains pointer to all submodels
 * @param dayOfSimulation Day of simulation
 */
var writeGeneralResults = function (foutFileName, goutFileName, env, monica, dayOfSimulation) {

  var fout = '', gout = '', endl = '\n';
  var mst = monica.soilTemperature();
  var msm = monica.soilMoisture();
  var mso = monica.soilOrganic();
  var msc = monica.soilColumn();

  //! TODO: schmutziger work-around. Hier muss was eleganteres hin!
  var msa = monica.soilColumnNC();
  var msq = monica.soilTransport();

  var outLayers = 20;
  for (var i_Layer = 0; i_Layer < outLayers; i_Layer++)
    fout += "\t" + fixed(10, msm.get_SoilMoisture(i_Layer));

  fout += "\t" + fixed(10, env.da.dataForTimestep(WEATHER.PRECIP, dayOfSimulation));
  fout += "\t" + fixed(10, monica.dailySumIrrigationWater());
  fout += "\t" + fixed(10, msm.get_Infiltration()); // {mm]
  fout += "\t" + fixed(10, msm.get_SurfaceWaterStorage());// {mm]
  fout += "\t" + fixed(10, msm.get_SurfaceRunOff());// {mm]
  fout += "\t" + fixed(10, msm.get_SnowDepth()); // [mm]
  fout += "\t" + fixed(10, msm.get_FrostDepth());
  fout += "\t" + fixed(10, msm.get_ThawDepth());
  for(var i_Layer = 0; i_Layer < outLayers; i_Layer++)
    fout += "\t" + fixed(10, msm.get_SoilMoisture(i_Layer) - msa[i_Layer].get_PermanentWiltingPoint());

  fout += "\t" + fixed(10, mst.get_SoilSurfaceTemperature());

  for(var i_Layer = 0; i_Layer < 5; i_Layer++)
    fout += "\t" + fixed(10, mst.get_SoilTemperature(i_Layer));// [°C]

  fout += "\t" + fixed(10, msm.get_ActualEvaporation());// [mm]
  fout += "\t" + fixed(10, msm.get_Evapotranspiration());// [mm]
  fout += "\t" + fixed(10, msm.get_ET0());// [mm]
  fout += "\t" + fixed(10, msm.get_KcFactor());
  fout += "\t" + fixed(10, monica.get_AtmosphericCO2Concentration());// [ppm]
  fout += "\t" + fixed(10, monica.get_GroundwaterDepth());// [m]
  fout += "\t" + fixed(10, msm.get_GroundwaterRecharge());// [mm]
  fout += "\t" + fixed(10, msq.get_NLeaching()); // [kg N ha-1]


  for(var i_Layer = 0; i_Layer < outLayers; i_Layer++)
    fout += "\t" + fixed(10, msc.soilLayer(i_Layer).get_SoilNO3());// [kg N m-3]

  fout += "\t" + fixed(10, msc.soilLayer(0).get_SoilCarbamid());

  for(var i_Layer = 0; i_Layer < outLayers; i_Layer++)
    fout += "\t" + fixed(10, msc.soilLayer(i_Layer).get_SoilNH4());

  for(var i_Layer = 0; i_Layer < 4; i_Layer++)
    fout += "\t" + fixed(10, msc.soilLayer(i_Layer).get_SoilNO2());

  for(var i_Layer = 0; i_Layer < 6; i_Layer++)
    fout += "\t" + fixed(10, msc.soilLayer(i_Layer).vs_SoilOrganicCarbon()); // [kg C kg-1]

  // SOC-0-30 [g C m-2]
  var  soc_30_accumulator = 0.0;
  for (var i_Layer = 0; i_Layer < 3; i_Layer++) {
      // kg C / kg --> g C / m2
      soc_30_accumulator += msc.soilLayer(i_Layer).vs_SoilOrganicCarbon() * msc.soilLayer(i_Layer).vs_SoilBulkDensity() * msc.soilLayer(i_Layer).vs_LayerThickness * 1000;
  }
  fout += "\t" + fixed(10, soc_30_accumulator);


  // SOC-0-200   [g C m-2]
  var  soc_200_accumulator = 0.0;
  for (var i_Layer = 0; i_Layer < outLayers; i_Layer++) {
      // kg C / kg --> g C / m2
      soc_200_accumulator += msc.soilLayer(i_Layer).vs_SoilOrganicCarbon() * msc.soilLayer(i_Layer).vs_SoilBulkDensity() * msc.soilLayer(i_Layer).vs_LayerThickness * 1000;
  }
  fout += "\t" + fixed(10, soc_200_accumulator);

  for(var i_Layer = 0; i_Layer < 1; i_Layer++)
    fout += "\t" + fixed(10, mso.get_AOM_FastSum(i_Layer));

  for(var i_Layer = 0; i_Layer < 1; i_Layer++)
    fout += "\t" + fixed(10, mso.get_AOM_SlowSum(i_Layer));

  for(var i_Layer = 0; i_Layer < 1; i_Layer++)
    fout += "\t" + fixed(10, mso.get_SMB_Fast(i_Layer));

  for(var i_Layer = 0; i_Layer < 1; i_Layer++)
    fout += "\t" + fixed(10, mso.get_SMB_Slow(i_Layer));

  for(var i_Layer = 0; i_Layer < 1; i_Layer++)
    fout += "\t" + fixed(10, mso.get_SOM_Fast(i_Layer));

  for(var i_Layer = 0; i_Layer < 1; i_Layer++)
    fout += "\t" + fixed(10, mso.get_SOM_Slow(i_Layer));

  for(var i_Layer = 0; i_Layer < 1; i_Layer++)
    fout += "\t" + fixed(10, mso.get_CBalance(i_Layer));

  for(var i_Layer = 0; i_Layer < 3; i_Layer++)
    fout += "\t" + fixed(10, mso.get_NetNMineralisationRate(i_Layer)); // [kg N ha-1]


  fout += "\t" + fixed(10, mso.get_NetNMineralisation()); // [kg N ha-1]
  fout += "\t" + fixed(10, mso.get_Denitrification()); // [kg N ha-1]
  fout += "\t" + fixed(10, mso.get_N2O_Produced()); // [kg N ha-1]
  fout += "\t" + fixed(10, msc.soilLayer(0).get_SoilpH()); // [ ]
  fout += "\t" + fixed(10, mso.get_NetEcosystemProduction()); // [kg C ha-1]
  fout += "\t" + fixed(10, mso.get_NetEcosystemExchange()); // [kg C ha-1]
  fout += "\t" + fixed(10, mso.get_DecomposerRespiration()); // Rh, [kg C ha-1 dayOfSimulation-1]


  fout += "\t" + fixed(10, env.da.dataForTimestep(WEATHER.TMIN, dayOfSimulation));
  fout += "\t" + fixed(10, env.da.dataForTimestep(WEATHER.TAVG, dayOfSimulation));
  fout += "\t" + fixed(10, env.da.dataForTimestep(WEATHER.TMAX, dayOfSimulation));
  fout += "\t" + fixed(10, env.da.dataForTimestep(WEATHER.WIND, dayOfSimulation));
  fout += "\t" + fixed(10, env.da.dataForTimestep(WEATHER.GLOBRAD, dayOfSimulation));
  fout += "\t" + fixed(10, env.da.dataForTimestep(WEATHER.RELHUMID, dayOfSimulation));
  fout += "\t" + fixed(10, env.da.dataForTimestep(WEATHER.SUNHOURS, dayOfSimulation));
  fout += endl;

  // smout
  gout += "\t" + fixed(10, msm.get_PercentageSoilCoverage());

  for(var i_Layer = 0; i_Layer < 9; i_Layer++) {
    gout += "\t" + fixed(10, msm.get_SoilMoisture(i_Layer)); // [m3 m-3]
  }

  gout += "\t" + fixed(10, (msm.get_SoilMoisture(0) + msm.get_SoilMoisture(1) + msm.get_SoilMoisture(2)) / 3.0); //[m3 m-3]
  gout += "\t" + fixed(10, (msm.get_SoilMoisture(3) + msm.get_SoilMoisture(4) + msm.get_SoilMoisture(5)) / 3.0); //[m3 m-3]
  gout += "\t" + fixed(10, (msm.get_SoilMoisture(6) + msm.get_SoilMoisture(7) + msm.get_SoilMoisture(8)) / 3.0); //[m3 m-3]

  var M0_60 = 0.0;
  for(var i_Layer = 0; i_Layer < 6; i_Layer++) {
    M0_60 += msm.get_SoilMoisture(i_Layer);
  }
  gout += "\t" + fixed(10, (M0_60 / 6.0)); // [m3 m-3]

  var M0_90 = 0.0;
  for(var i_Layer = 0; i_Layer < 9; i_Layer++) {
    M0_90 += msm.get_SoilMoisture(i_Layer);
  }
  gout += "\t" + fixed(10, (M0_90 / 9.0)); // [m3 m-3]

  var PAW0_200 = 0.0;
  for(var i_Layer = 0; i_Layer < 20; i_Layer++) {
      PAW0_200 += (msm.get_SoilMoisture(i_Layer) - msa[i_Layer].get_PermanentWiltingPoint()) ;
  }
  gout += "\t" + fixed(10, (PAW0_200 * 0.1 * 1000.0)); // [mm]

  var PAW0_130 = 0.0;
  for(var i_Layer = 0; i_Layer < 13; i_Layer++) {
      PAW0_130 += (msm.get_SoilMoisture(i_Layer) - msa[i_Layer].get_PermanentWiltingPoint()) ;
  }
  gout += "\t" + fixed(10, (PAW0_130 * 0.1 * 1000.0)); // [mm]

    var PAW0_150 = 0.0;
    for(var i_Layer = 0; i_Layer < 15; i_Layer++) {
            PAW0_150 += (msm.get_SoilMoisture(i_Layer) - msa[i_Layer].get_PermanentWiltingPoint()) ;
  }
    gout += "\t" + fixed(10, (PAW0_150 * 0.1 * 1000.0)); // [mm]

  gout += "\t" + fixed(10, (msc.soilLayer(0).get_SoilNmin() + msc.soilLayer(1).get_SoilNmin() + msc.soilLayer(2).get_SoilNmin()) / 3.0 * 0.3 * 10000); // [kg m-3] -> [kg ha-1]
  gout += "\t" + fixed(10, (msc.soilLayer(3).get_SoilNmin() + msc.soilLayer(4).get_SoilNmin() + msc.soilLayer(5).get_SoilNmin()) / 3.0 * 0.3 * 10000); // [kg m-3] -> [kg ha-1]
  gout += "\t" + fixed(10, (msc.soilLayer(6).get_SoilNmin() + msc.soilLayer(7).get_SoilNmin() + msc.soilLayer(8).get_SoilNmin()) / 3.0 * 0.3 * 10000); // [kg m-3] -> [kg ha-1]
  gout += "\t" + fixed(10, (msc.soilLayer(9).get_SoilNmin() + msc.soilLayer(10).get_SoilNmin() + msc.soilLayer(11).get_SoilNmin()) / 3.0 * 0.3 * 10000); // [kg m-3] -> [kg ha-1]

  var N0_60 = 0.0;
  for(var i_Layer = 0; i_Layer < 6; i_Layer++) {
    N0_60 += msc.soilLayer(i_Layer).get_SoilNmin();
  }
  gout += "\t" + fixed(10, (N0_60 * 0.1 * 10000));  // [kg m-3] -> [kg ha-1]

  var N0_90 = 0.0;
  for(var i_Layer = 0; i_Layer < 9; i_Layer++) {
    N0_90 += msc.soilLayer(i_Layer).get_SoilNmin();
  }
  gout += "\t" + fixed(10, (N0_90 * 0.1 * 10000));  // [kg m-3] -> [kg ha-1]

  var N0_200 = 0.0;
  for(var i_Layer = 0; i_Layer < 20; i_Layer++) {
    N0_200 += msc.soilLayer(i_Layer).get_SoilNmin();
  }
  gout += "\t" + fixed(10, (N0_200 * 0.1 * 10000));  // [kg m-3] -> [kg ha-1]

  var N0_130 = 0.0;
  for(var i_Layer = 0; i_Layer < 13; i_Layer++) {
    N0_130 += msc.soilLayer(i_Layer).get_SoilNmin();
  }
  gout += "\t" + fixed(10, (N0_130 * 0.1 * 10000));  // [kg m-3] -> [kg ha-1]

  var N0_150 = 0.0;
  for(var i_Layer = 0; i_Layer < 15; i_Layer++) {
    N0_150 += msc.soilLayer(i_Layer).get_SoilNmin();
  }
  gout += "\t" + fixed(10, (N0_150 * 0.1 * 10000));  // [kg m-3] -> [kg ha-1]

  gout += "\t" + fixed(10, (msc.soilLayer(0).get_SoilNH4() + msc.soilLayer(1).get_SoilNH4() + msc.soilLayer(2).get_SoilNH4()) / 3.0 * 0.3 * 10000); // [kg m-3] -> [kg ha-1]
  gout += "\t" + fixed(10, (msc.soilLayer(3).get_SoilNH4() + msc.soilLayer(4).get_SoilNH4() + msc.soilLayer(5).get_SoilNH4()) / 3.0 * 0.3 * 10000); // [kg m-3] -> [kg ha-1]
  gout += "\t" + fixed(10, (msc.soilLayer(6).get_SoilNH4() + msc.soilLayer(7).get_SoilNH4() + msc.soilLayer(8).get_SoilNH4()) / 3.0 * 0.3 * 10000); // [kg m-3] -> [kg ha-1]
  gout += "\t" + fixed(10, mso.get_SoilOrganicC(0) * 0.1 * 10000);// [kg m-3] -> [kg ha-1]
  gout += "\t" + fixed(10, ((mso.get_SoilOrganicC(0) + mso.get_SoilOrganicC(1) + mso.get_SoilOrganicC(2)) / 3.0 * 0.3 * 10000)); // [kg m-3] -> [kg ha-1]
  gout += "\t" + fixed(10, mst.get_SoilTemperature(0));
  gout += "\t" + fixed(10, mst.get_SoilTemperature(2));
  gout += "\t" + fixed(10, mst.get_SoilTemperature(5));
  gout += "\t" + fixed(10, mso.get_DecomposerRespiration()); // Rh, [kg C ha-1 dayOfSimulation-1]

  gout += "\t" + fixed(10, mso.get_NH3_Volatilised()); // [kg N ha-1]
  gout += "\t0"; //! @todo
  gout += "\t0"; //! @todo
  gout += "\t0"; //! @todo
  gout += "\t" + fixed(10, monica.dailySumFertiliser());
  gout += "\t" + fixed(10, monica.dailySumIrrigationWater());
  gout += endl;

  fs.appendFileSync(goutFileName, gout, { encoding: 'utf8' });
  fs.appendFileSync(foutFileName, fout, { encoding: 'utf8' });

}

var dumpMonicaParametersIntoFile = function (fileName, cpp) {

  var parameter_output = '', endl = '\n';

  //double po_AtmosphericResistance; //0.0025 [s m-1], from Sadeghi et al. 1988

  // userSoilOrganicParameters
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_SOM_SlowDecCoeffStandard" + "\t" + cpp.userSoilOrganicParameters.po_SOM_SlowDecCoeffStandard + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_SOM_FastDecCoeffStandard" + "\t" + cpp.userSoilOrganicParameters.po_SOM_FastDecCoeffStandard + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_SMB_SlowMaintRateStandard" + "\t" + cpp.userSoilOrganicParameters.po_SMB_SlowMaintRateStandard + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_SMB_FastMaintRateStandard" + "\t" + cpp.userSoilOrganicParameters.po_SMB_FastMaintRateStandard + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_SMB_SlowDeathRateStandard" + "\t" + cpp.userSoilOrganicParameters.po_SMB_SlowDeathRateStandard + endl;

  parameter_output += "userSoilOrganicParameters" + "\t" + "po_SMB_FastDeathRateStandard" + "\t" + cpp.userSoilOrganicParameters.po_SMB_FastDeathRateStandard + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_SMB_UtilizationEfficiency" + "\t" + cpp.userSoilOrganicParameters.po_SMB_UtilizationEfficiency + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_SOM_SlowUtilizationEfficiency" + "\t" + cpp.userSoilOrganicParameters.po_SOM_SlowUtilizationEfficiency + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_SOM_FastUtilizationEfficiency" + "\t" + cpp.userSoilOrganicParameters.po_SOM_FastUtilizationEfficiency + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_AOM_SlowUtilizationEfficiency" + "\t" + cpp.userSoilOrganicParameters.po_AOM_SlowUtilizationEfficiency + endl;

  parameter_output += "userSoilOrganicParameters" + "\t" + "po_AOM_FastUtilizationEfficiency" + "\t" + cpp.userSoilOrganicParameters.po_AOM_FastUtilizationEfficiency + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_AOM_FastMaxC_to_N" + "\t" + cpp.userSoilOrganicParameters.po_AOM_FastMaxC_to_N + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_PartSOM_Fast_to_SOM_Slow" + "\t" + cpp.userSoilOrganicParameters.po_PartSOM_Fast_to_SOM_Slow + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_PartSMB_Slow_to_SOM_Fast" + "\t" + cpp.userSoilOrganicParameters.po_PartSMB_Slow_to_SOM_Fast + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_PartSMB_Fast_to_SOM_Fast" + "\t" + cpp.userSoilOrganicParameters.po_PartSMB_Fast_to_SOM_Fast + endl;

  parameter_output += "userSoilOrganicParameters" + "\t" + "po_PartSOM_to_SMB_Slow" + "\t" + cpp.userSoilOrganicParameters.po_PartSOM_to_SMB_Slow + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_PartSOM_to_SMB_Fast" + "\t" + cpp.userSoilOrganicParameters.po_PartSOM_to_SMB_Fast + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_CN_Ratio_SMB" + "\t" + cpp.userSoilOrganicParameters.po_CN_Ratio_SMB + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_LimitClayEffect" + "\t" + cpp.userSoilOrganicParameters.po_LimitClayEffect + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_AmmoniaOxidationRateCoeffStandard" + "\t" + cpp.userSoilOrganicParameters.po_AmmoniaOxidationRateCoeffStandard + endl;

  parameter_output += "userSoilOrganicParameters" + "\t" + "po_NitriteOxidationRateCoeffStandard" + "\t" + cpp.userSoilOrganicParameters.po_NitriteOxidationRateCoeffStandard + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_TransportRateCoeff" + "\t" + cpp.userSoilOrganicParameters.po_TransportRateCoeff + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_SpecAnaerobDenitrification" + "\t" + cpp.userSoilOrganicParameters.po_SpecAnaerobDenitrification + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_ImmobilisationRateCoeffNO3" + "\t" + cpp.userSoilOrganicParameters.po_ImmobilisationRateCoeffNO3 + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_ImmobilisationRateCoeffNH4" + "\t" + cpp.userSoilOrganicParameters.po_ImmobilisationRateCoeffNH4 + endl;

  parameter_output += "userSoilOrganicParameters" + "\t" + "po_Denit1" + "\t" + cpp.userSoilOrganicParameters.po_Denit1 + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_Denit2" + "\t" + cpp.userSoilOrganicParameters.po_Denit2 + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_Denit3" + "\t" + cpp.userSoilOrganicParameters.po_Denit3 + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_HydrolysisKM" + "\t" + cpp.userSoilOrganicParameters.po_HydrolysisKM + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_ActivationEnergy" + "\t" + cpp.userSoilOrganicParameters.po_ActivationEnergy + endl;

  parameter_output += "userSoilOrganicParameters" + "\t" + "po_HydrolysisP1" + "\t" + cpp.userSoilOrganicParameters.po_HydrolysisP1 + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_HydrolysisP2" + "\t" + cpp.userSoilOrganicParameters.po_HydrolysisP2 + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_AtmosphericResistance" + "\t" + cpp.userSoilOrganicParameters.po_AtmosphericResistance + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_N2OProductionRate" + "\t" + cpp.userSoilOrganicParameters.po_N2OProductionRate + endl;
  parameter_output += "userSoilOrganicParameters" + "\t" + "po_Inhibitor_NH3" + "\t" + cpp.userSoilOrganicParameters.po_Inhibitor_NH3 + endl;

  parameter_output += endl;

  fs.writeFileSync(fileName, parameter_output, { encoding: 'utf8' });

};
