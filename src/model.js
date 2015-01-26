var Model = function (env) {

  var that = this;

  /* this.cropGrowth statt var, um this an SoilX. zu übergeben */
  this._currentCropGrowth = null;
  this.cropGrowth = function () { return that._currentCropGrowth; };
  this.vw_AtmosphericCO2Concentration;
  this.vs_GroundwaterDepth;

  var _env = env
    , _soilColumn = new SoilColumn(_env.general, _env.soilParams, _env.centralParameterProvider)
    , _soilTemperature = new SoilTemperature(_soilColumn, this, _env.centralParameterProvider)
    , _soilMoisture = new SoilMoisture(_soilColumn, _env.site, this, _env.centralParameterProvider)
    , _soilOrganic = new SoilOrganic(_soilColumn, _env.general, _env.site,_env.centralParameterProvider)
    , _soilTransport = new SoilTransport(_soilColumn, _env.site, _env.centralParameterProvider)
    , _sumFertiliser = 0
    , _dailySumFertiliser = 0
    , _dailySumIrrigationWater = 0
    , _dataAccessor = _env.da
    , centralParameterProvider = _env.centralParameterProvider
    , p_daysWithCrop = 0
    , p_accuNStress = 0.0
    , p_accuWaterStress = 0.0
    , p_accuHeatStress = 0.0
    , p_accuOxygenStress = 0.0
    , _currentCrop = null
    ;

  var run = function (progressCallback) {

    if (env.cropRotation.length === 0) {
      logger(MSG.ERROR, "rotation is empty");
      return;
    }

    var currentDate = env.da.startDate()
      , totalNoDays = env.da.noOfStepsPossible()
      , dayInMonth = 0 // day in current month
      , productionProcessIdx = 0 // iterator through the production processes
      , currentProductionProcess = env.cropRotation[productionProcessIdx] // direct handle to current process
      , nextProductionProcessApplicationDate = currentProductionProcess.start()
      ;

    debug('totalNoDays', totalNoDays);  

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

    logger(MSG.INFO, "next app-date: " + nextProductionProcessApplicationDate.toISOString().split('T')[0]);

    /* if for some reason there are no applications (no nothing) in the production process: quit */
    if(!nextProductionProcessApplicationDate.isValid()) {
      logger(MSG.ERROR, "start of production-process: " + currentProductionProcess.toString() + " is not valid");
      return;
    }

    for (var dayOfSimulation = 0; dayOfSimulation < totalNoDays; dayOfSimulation++) {

      currentDate.setDate(currentDate.getDate() + 1);
      dayInMonth++;

      logger(MSG.INFO, currentDate.toISOString().split('T')[0]);
      
      resetDailyCounter();

      /* test if model's crop has been dying in previous step if yes, it will be incorporated into soil */
      if (that._currentCropGrowth && that._currentCropGrowth.isDying())
        incorporateCurrentCrop();

      /* there's something to apply at this day */
      if (nextProductionProcessApplicationDate.setHours(0,0,0,0) === currentDate.setHours(0,0,0,0)) {
        
        /* apply everything to do at current day */
        currentProductionProcess.apply(nextProductionProcessApplicationDate, this);
        logger(MSG.INFO, 'applied at: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);

        /* get the next application date to wait for */
        var prevPPApplicationDate = nextProductionProcessApplicationDate;

        nextProductionProcessApplicationDate = currentProductionProcess.nextDate(nextProductionProcessApplicationDate);


        /* if application date was not valid, we're (probably) at the end
          of the application list of this production process
          -> go to the next one in the crop rotation */
        if (!nextProductionProcessApplicationDate.isValid()) {

          /* to count the applied fertiliser for the next production process */
          resetFertiliserCounter();

          /* resets crop values for use in next year */
          currentProductionProcess.crop().reset();

          productionProcessIdx++;
          /* end of crop rotation? */ 
          if (productionProcessIdx < env.cropRotation.length) {

            currentProductionProcess = env.cropRotation[productionProcessIdx];
            debug('productionProcessIdx', productionProcessIdx);
            debug('env.cropRotation', env.cropRotation);
            nextProductionProcessApplicationDate = currentProductionProcess.start();
            logger(MSG.INFO, 'new valid next app-date: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);
          
          }

        } else {
          logger(MSG.INFO, 'next app-date: ' + nextProductionProcessApplicationDate.toISOString().split('T')[0]);
        }

      }

      /* write simulation date to file */
      if (doWriteOutputFiles) {
        fs.appendFileSync(goutFileName, currentDate.toLocaleDateString(), { encoding: 'utf8' });
        fs.appendFileSync(foutFileName, currentDate.toLocaleDateString(), { encoding: 'utf8' });
      }

      /* run crop step */
      if(isCropPlanted())
        cropStep(dayOfSimulation);

      /* writes crop results to output file */
      if (doWriteOutputFiles)
        writeCropResults(that._currentCropGrowth, foutFileName, goutFileName, isCropPlanted());
      
      /* if progressCallback is provided */
      if (progressCallback)
        progressCallback(currentDate, this);

      generalStep(dayOfSimulation);

      if (doWriteOutputFiles)
        writeGeneralResults(foutFileName, goutFileName, env, this, dayOfSimulation);
    }

    logger(MSG.INFO, "returning from runModel");
    
    /* if progressCallback is provided send null i.e. we are done*/
    if (progressCallback)
      progressCallback(null, null);

    return; /* TODO: what to return? */

  };

  var seedCrop = function (crop) {

    debug("seedCrop");

    _currentCrop = crop;
    var cps = null; // JS!
    that._currentCropGrowth = null;

    p_daysWithCrop = 0;
    p_accuNStress = 0.0;
    p_accuWaterStress = 0.0;
    p_accuHeatStress = 0.0;
    p_accuOxygenStress = 0.0;

    if(_currentCrop.isValid()) {

      cps = _currentCrop.cropParameters();
      that._currentCropGrowth = new FieldCropGrowth(_soilColumn, _env.general, cps, _env.site, _env.centralParameterProvider);

      _soilTransport.put_Crop(that._currentCropGrowth);
      _soilColumn.put_Crop(that._currentCropGrowth);
      _soilMoisture.put_Crop(that._currentCropGrowth);
      _soilOrganic.put_Crop(that._currentCropGrowth);

      logger(MSG.INFO, 'seeding crop: ' + crop.name());

      if (_env.useNMinMineralFertilisingMethod && _currentCrop.seedDate().dayOfYear() <= _currentCrop.harvestDate().dayOfYear()) {

        logger(MSG.INFO, "N_min fertilising summer crop");

        var fert_amount = applyMineralFertiliserViaNMinMethod(
          _env.nMinFertiliserPartition,
          NMinCropParameters(
            cps.pc_SamplingDepth,
            cps.pc_TargetNSamplingDepth,
            cps.pc_TargetN30
          )
        );
        
        addDailySumFertiliser(fert_amount);
      
      }

    }

  };


  var harvestCurrentCrop = function () {

    /* could be just a fallow, so there might be no CropGrowth object */
    if (_currentCrop && _currentCrop.isValid()) {

      /* prepare to add root and crop residues to soilorganic (AOMs) */
      var rootBiomass = that._currentCropGrowth.get_OrganBiomass(0);
      var rootNConcentration = that._currentCropGrowth.get_RootNConcentration();

      logger(MSG.INFO, 'Harvest: adding organic matter from root to soilOrganic');
      logger(MSG.INFO, 'Root biomass: ' + rootBiomass + ' Root N concentration: ' + rootNConcentration);

      _soilOrganic.addOrganicMatter(_currentCrop.residueParameters(), rootBiomass, rootNConcentration);

      var residueBiomass = that._currentCropGrowth.get_ResidueBiomass(_env.useSecondaryYields);

      /* TODO: das hier noch berechnen (???) */
      var residueNConcentration = that._currentCropGrowth.get_ResiduesNConcentration();

      logger(MSG.INFO, 'Adding organic matter from residues to soilOrganic');
      logger(MSG.INFO, 'Residue biomass: ' + residueBiomass + ' Residue N concentration: ' + residueNConcentration);
      logger(MSG.INFO, 'Primary yield biomass: ' + that._currentCropGrowth.get_PrimaryCropYield()
          + ' Primary yield N concentration: ' + that._currentCropGrowth.get_PrimaryYieldNConcentration());
      logger(MSG.INFO, 'Secondary yield biomass: ' + that._currentCropGrowth.get_SecondaryCropYield()
          + ' Secondary yield N concentration: ' + '??');
      logger(MSG.INFO, 'Residues N content: ' + that._currentCropGrowth.get_ResiduesNContent()
          + ' Primary yield N content: ' + that._currentCropGrowth.get_PrimaryYieldNContent()
          + ' Secondary yield N content: ' + that._currentCropGrowth.get_SecondaryYieldNContent());

      _soilOrganic.addOrganicMatter(_currentCrop.residueParameters(), residueBiomass, residueNConcentration);
    
    }

    that._currentCropGrowth = null;
    _currentCrop = null;
    _soilTransport.remove_Crop();
    _soilColumn.remove_Crop();
    _soilMoisture.remove_Crop();
    _soilOrganic.remove_Crop(); // !JS correct?

  };


  var incorporateCurrentCrop = function () {

    /* could be just a fallow, so there might be no CropGrowth object */
    if (_currentCrop && _currentCrop.isValid()) {

      /* prepare to add root and crop residues to soilorganic (AOMs) */
      var totalBiomass = that._currentCropGrowth.totalBiomass();
      var totalNConcentration = that._currentCropGrowth.get_AbovegroundBiomassNConcentration() + that._currentCropGrowth.get_RootNConcentration();

      logger(MSG.INFO, "Incorporation: adding organic matter from total biomass of crop to soilOrganic");
      logger(MSG.INFO, "Total biomass: " + totalBiomass + " Total N concentration: " + totalNConcentration);

      _soilOrganic.addOrganicMatter(_currentCrop.residueParameters(), totalBiomass, totalNConcentration);
    
    }

    that._currentCropGrowth = null;
    _currentCrop = null;
    _soilTransport.remove_Crop();
    _soilColumn.remove_Crop();
    _soilMoisture.remove_Crop();
    _soilOrganic.remove_Crop(); // !JS correct?
  
  };


  /* TODO: Nothing implemented yet. (??) */
  var applyMineralFertiliser = function (partition, amount) {

    if (!_env.useNMinMineralFertilisingMethod) {

      logger(MSG.INFO, 'Apply mineral fertiliser. Amount: ' + amount);

      _soilColumn.applyMineralFertiliser(partition, amount);
      addDailySumFertiliser(amount);

    }
  
  };

  
  var applyOrganicFertiliser = function (params, amount, doIncorporate) {

    logger(MSG.INFO, 'apply organic fertiliser: amount: ' + amount + ', vo_NConcentration: ' + params.vo_NConcentration);

    _soilOrganic.setIncorporation(doIncorporate);
    _soilOrganic.addOrganicMatter(params, amount, params.vo_NConcentration);
    addDailySumFertiliser(amount * params.vo_NConcentration);
  
  };


  var applyMineralFertiliserViaNMinMethod = function (partition, cps) {

    // TODO: implement
    //AddFertiliserAmountsCallback x(_sumFertiliser, _dailySumFertiliser);

    var ups = _env.nMinUserParams;
    var fert_amount = _soilColumn.applyMineralFertiliserViaNMinMethod(
      partition,
      cps.samplingDepth,
      cps.nTarget,
      cps.nTarget30,
      ups.min,
      ups.max,
      ups.delayInDays
    );

    return fert_amount;

  };


  var applyIrrigation = function (amount, nitrateConcentration) {

    /* if the production process has still some defined manual irrigation dates */
    if (!_env.useAutomaticIrrigation) {

      _soilOrganic.addIrrigationWater(amount);
      _soilColumn.applyIrrigation(amount, nitrateConcentration);
      
      if (_currentCrop) {
  
        _currentCrop.addAppliedIrrigationWater(amount);
        this.addDailySumIrrigationWater(amount);
  
      }
    
    }
  
  };


  /*
    Applies tillage for a given soil depth. Tillage means in MONICA, that for all effected soil layer the parameters 
    are averaged.
   
    depth [m]
  */
  var applyTillage = function (depth) {
    _soilColumn.applyTillage(depth);
  };


  /* 
    Simulating the soil processes for one time step.

    stepNo [#]  Number of current processed step
  */
  var generalStep = function (stepNo) {

    var startDate = _dataAccessor.startDate()
      , currentDate = _dataAccessor.date(stepNo)
      , julday = _dataAccessor.julianDayForStep(stepNo)
      , year = currentDate.getFullYear()
      , leapYear = currentDate.isLeapYear()
      , tmin = _dataAccessor.dataForTimestep(WEATHER.TMIN, stepNo)
      , tavg = _dataAccessor.dataForTimestep(WEATHER.TAVG, stepNo)
      , tmax = _dataAccessor.dataForTimestep(WEATHER.TMAX, stepNo)
      , precip = _dataAccessor.dataForTimestep(WEATHER.PRECIP, stepNo)
      , wind = _dataAccessor.dataForTimestep(WEATHER.WIND, stepNo)
      , globrad = _dataAccessor.dataForTimestep(WEATHER.GLOBRAD, stepNo)
        /* test if data for relhumid are available; if not, value is set to -1.0 */
      , relhumid = (_dataAccessor.isAvailable(WEATHER.RELHUMID) ? _dataAccessor.dataForTimestep(WEATHER.RELHUMID, stepNo) : -1.0)
      , user_env = centralParameterProvider.userEnvironmentParameters
      ;

    that.vw_AtmosphericCO2Concentration = (_env.atmosphericCO2 === -1 ? user_env.p_AthmosphericCO2 : _env.atmosphericCO2);
    if (int(that.vw_AtmosphericCO2Concentration) === 0)
      that.vw_AtmosphericCO2Concentration = CO2ForDate(year, julday, leapYear);

    that.vs_GroundwaterDepth = GroundwaterDepthForDate(
      user_env.p_MaxGroundwaterDepth,
      user_env.p_MinGroundwaterDepth,
      user_env.p_MinGroundwaterDepthMonth,
      julday,
      leapYear
    );
    
    debug('vw_AtmosphericCO2Concentration', that.vw_AtmosphericCO2Concentration);
    debug('General step: ' + stepNo + ' / ' + julday + ' / ' + currentDate.toISOString().split('T')[0]);

    //31 + 28 + 15
    var pc_JulianDayAutomaticFertilising = user_env.p_JulianDayAutomaticFertilising;

    _soilColumn.deleteAOMPool();

    _soilColumn.applyPossibleDelayedFerilizer();
    var delayed_fert_amount = _soilColumn.applyPossibleTopDressing();
    addDailySumFertiliser(delayed_fert_amount);

    if (_currentCrop
        && _currentCrop.isValid()
        && _env.useNMinMineralFertilisingMethod
        && _currentCrop.seedDate().dayOfYear() > _currentCrop.harvestDate().dayOfYear()
        && _dataAccessor.julianDayForStep(stepNo) == pc_JulianDayAutomaticFertilising) {

      logger(MSG.INFO, "N_min fertilising winter crop");

      var cps = _currentCrop.cropParameters();
      var fert_amount = applyMineralFertiliserViaNMinMethod(
        _env.nMinFertiliserPartition,
        NMinCropParameters(
          cps.pc_SamplingDepth,
          cps.pc_TargetNSamplingDepth,
          cps.pc_TargetN30
        )
      );
      
      addDailySumFertiliser(fert_amount);

    }

    _soilTemperature.step(tmin, tmax, globrad);
    _soilMoisture.step(
      that.vs_GroundwaterDepth,
      precip,
      tmax,
      tmin,
      (relhumid / 100.0),
      tavg,
      wind,
      env.windSpeedHeight,
      globrad,
      julday
    );
    _soilOrganic.step(tavg, precip, wind);
    _soilTransport.step();

  };

  /* Simulating crop growth for one time step. */
  var cropStep = function (stepNo) {

    /* do nothing if there is no crop */
    if (!that._currentCropGrowth)
      return;

    var julday = _dataAccessor.julianDayForStep(stepNo)
      , tavg = _dataAccessor.dataForTimestep(WEATHER.TAVG, stepNo)
      , tmax = _dataAccessor.dataForTimestep(WEATHER.TMAX, stepNo)
      , tmin = _dataAccessor.dataForTimestep(WEATHER.TMIN, stepNo)
      , globrad = _dataAccessor.dataForTimestep(WEATHER.GLOBRAD, stepNo)
      /* test if data for sunhours are available; if not, value is set to -1.0 */
      , sunhours = _dataAccessor.isAvailable(WEATHER.SUNHOURS) ? _dataAccessor.dataForTimestep(WEATHER.SUNHOURS, stepNo) : -1.0   
      /* test if data for relhumid are available; if not, value is set to -1.0 */
      , relhumid = _dataAccessor.isAvailable(WEATHER.RELHUMID) ? _dataAccessor.dataForTimestep(WEATHER.RELHUMID, stepNo) : -1.0
      , wind =  _dataAccessor.dataForTimestep(WEATHER.WIND, stepNo)
      , precip =  _dataAccessor.dataForTimestep(WEATHER.PRECIP, stepNo)
      , vw_WindSpeedHeight = centralParameterProvider.userEnvironmentParameters.p_WindSpeedHeight
      ;

    p_daysWithCrop++;

    debug('Crop growth step: ' + stepNo + ' / ' + julday);

    that._currentCropGrowth.step(
      tavg,
      tmax,
      tmin,
      globrad,
      sunhours,
      julday,
      (relhumid / 100.0),
      wind,
      vw_WindSpeedHeight,
      that.vw_AtmosphericCO2Concentration,
      precip
    );

    if (_env.useAutomaticIrrigation) {

      var aips = _env.autoIrrigationParams;
      if (_soilColumn.applyIrrigationViaTrigger(aips.treshold, aips.amount, aips.nitrateConcentration)) {

        _soilOrganic.addIrrigationWater(aips.amount);
        _currentCrop.addAppliedIrrigationWater(aips.amount);
        _dailySumIrrigationWater += aips.amount;
      
      }
    
    }

    p_accuNStress += that._currentCropGrowth.get_CropNRedux();
    p_accuWaterStress += that._currentCropGrowth.get_TranspirationDeficit();
    p_accuHeatStress += that._currentCropGrowth.get_HeatStressRedux();
    p_accuOxygenStress += that._currentCropGrowth.get_OxygenDeficit();

  };

  /* Returns atmospheric CO2 concentration for date [ppm] */
  var CO2ForDate = function (year, julianday, leapYear) {

    var co2 = 380, decimalDate = 0;

    if (leapYear)
      decimalDate = year + (julianday / 366.0);
    else
      decimalDate = year + (julianday / 365.0);

    co2 = 222.0 + exp(0.0119 * (decimalDate - 1580.0)) + 2.5 * sin((decimalDate - 0.5) / 0.1592);

    return co2;

  };

  /* Returns groundwater table for date [m] */
  var GroundwaterDepthForDate = function (
    maxGroundwaterDepth,
    minGroundwaterDepth,
    minGroundwaterDepthMonth,
    julianday,
    leapYear
  ) {
    
    var groundwaterDepth = 20
      , days = leapYear ? 366.0 : 365.0
      , meanGroundwaterDepth = (maxGroundwaterDepth + minGroundwaterDepth) / 2.0
      , groundwaterAmplitude = (maxGroundwaterDepth - minGroundwaterDepth) / 2.0
      ;

    var sinus = sin(((julianday / days * 360.0) - 90.0 -
           (((minGroundwaterDepthMonth) * 30.0) - 15.0)) *
           3.14159265358979 / 180.0);

    groundwaterDepth = meanGroundwaterDepth + (sinus * groundwaterAmplitude);

    if (groundwaterDepth < 0.0)
      groundwaterDepth = 20.0;

    return groundwaterDepth;

  };

  //----------------------------------------------------------------------------

  /*
    Returns mean soil organic C. [kg C / kg soil * 100]
    
    depth_m [m]
  */
  var avgCorg = function (depth_m) {

    var lsum = 0, sum = 0, count = 0;

    for (var i = 0, nols = _env.noOfLayers; i < nols; i++) {
      count++;
      sum +=_soilColumn[i].vs_SoilOrganicCarbon(); //[kg C / kg Boden]
      lsum += _soilColumn[i].vs_LayerThickness;
      if (lsum >= depth_m)
        break;
    }

    return sum / (count) * 100.0;

  };

  /* Returns the soil moisture up to 90 cm depth, 0-90cm [%nFK] */
  var mean90cmWaterContent = function () {
    return _soilMoisture.meanWaterContent(0.9);
  };

  var meanWaterContent = function (layer, number_of_layers) {
    return _soilMoisture.meanWaterContent(layer, number_of_layers);
  };

  /* 
    Returns the N content up to given depth.
    Boden-Nmin-Gehalt 0-90cm am 31.03. [kg (N) ha-1]
  */
  var sumNmin = function (depth_m) {
    
    var lsum = 0, sum = 0, count = 0;

    for(var i = 0, nols = _env.noOfLayers; i < nols; i++) {
      count++;
      sum += _soilColumn[i].get_SoilNmin(); //[kg N m-3]
      lsum += _soilColumn[i].vs_LayerThickness;
      if(lsum >= depth_m)
        break;
    }

    return sum / (count) * lsum * 10000;

  }

  /* Returns accumulation of soil nitrate for 90cm soil at 31.03. */
  var sumNO3AtDay = function (depth_m) {

    var lsum = 0, sum = 0, count = 0;

    for(var i = 0, nols = _env.noOfLayers; i < nols; i++) {
      count++;
      sum += _soilColumn[i].get_SoilNO3(); //[kg m-3]
      lsum += _soilColumn[i].vs_LayerThickness;
      if(lsum >= depth_m)
        break;
    }

    return sum;

  };

  /* [mm] */
  var groundWaterRecharge = function () {
    return _soilMoisture.get_GroundwaterRecharge();
  };

  /* [kg (N) ha-1] */
  var nLeaching = function () {
    return _soilTransport.get_NLeaching();//[kg N ha-1]
  };

  /*
    Returns sum of soiltemperature in given number of soil layers
    sumSoilTemperature [°C]
    layers             [#]  Number of layers that should be added.
  */
  var sumSoilTemperature = function (layers) {
    return _soilColumn.sumSoilTemperature(layers);
  };

  /* Returns maximal snow depth during simulation */
  var maxSnowDepth = function () {
    return _soilMoisture.getMaxSnowDepth();
  };

  /* Returns sum of all snowdepth during whole simulation */
  var accumulatedSnowDepth = function () {
    return _soilMoisture.accumulatedSnowDepth();
  };

  /* Returns sum of frost depth during whole simulation. */
  var accumulatedFrostDepth = function () {
    return _soilMoisture.getAccumulatedFrostDepth();
  };

  /* Returns average soil temperature of first 30cm soil. */
  var avg30cmSoilTemperature = function () {
    var nols = 3, accu_temp = 0.0;
    for (var layer = 0; layer < nols; layer++)
      accu_temp += _soilColumn.soilLayer(layer).get_Vs_SoilTemperature();

    return accu_temp / nols;
  };

  /*
    Returns average soil moisture concentration in soil in a defined layer.
    Layer is specified by start end end of soil layer.
    
    avgSoilMoisture [?]  Average soil moisture concentation
    start_layer     [#]
    end_layer       [#]
  */
  var avgSoilMoisture = function (start_layer, end_layer) {
    var num = 0, accu = 0.0;
    for (var i = start_layer; i < end_layer; i++) {
      accu += _soilColumn.soilLayer(i).get_Vs_SoilMoisture_m3();
      num++;
    }
    return accu / num;
  };

  /*
    Returns mean of capillary rise in a set of layers

    avgCapillaryRise  [mm]  Average capillary rise
    start_layer       [#]   First layer to be included
    end_layer         [#]   Last layer, is not included;
  */
  var avgCapillaryRise = function (start_layer, end_layer) {
    var num = 0, accu = 0.0;
    for (var i = start_layer; i < end_layer; i++) {
      accu += _soilMoisture.get_CapillaryRise(i);
      num++;
    }
    return accu / num;
  };

  /*
    Returns mean percolation rate
  
    avgPercolationRate  [mm] Mean percolation rate
    start_layer         [#]
    end_layer           [#]
  */
  var avgPercolationRate = function (start_layer, end_layer) {
    var num = 0, accu = 0.0;
    for (var i = start_layer; i < end_layer; i++) {
      accu += _soilMoisture.get_PercolationRate(i);
      num++;
    }
    return accu / num;
  };

  /*
    Returns sum of all surface run offs at this point in simulation time.
    
    sumSurfaceRunOff  [mm]  Sum of surface run off in
  */
  var sumSurfaceRunOff = function () {
    return _soilMoisture.get_SumSurfaceRunOff();
  };

  /*  Returns surface runoff of current day [mm]. */
  var surfaceRunoff = function () {
    return _soilMoisture.get_SurfaceRunOff();
  };

  /*  Returns evapotranspiration [mm] */
  var getEvapotranspiration = function () {
    if (that._currentCropGrowth)
      return that._currentCropGrowth.get_RemainingEvapotranspiration();
    return 0.0;
  };

  /* Returns actual transpiration */
  var getTranspiration = function () {
    if (that._currentCropGrowth)
      return that._currentCropGrowth.get_ActualTranspiration();
    return 0.0;
  };

  /* Returns actual evaporation */
  var getEvaporation = function () {
    if (that._currentCropGrowth)
      return that._currentCropGrowth.get_EvaporatedFromIntercept();
    return 0.0;
  };

  var getETa = function () {
    return _soilMoisture.get_Evapotranspiration();
  };

  /* Returns sum of evolution rate in first three layers. */
  var get_sum30cmSMB_CO2EvolutionRate = function () {
    var sum = 0.0;
    for (var layer = 0; layer < 3; layer++)
      sum += _soilOrganic.get_SMB_CO2EvolutionRate(layer);
    return sum;
  };

  /* Returns volatilised NH3 */
  var getNH3Volatilised = function () {
    return _soilOrganic.get_NH3_Volatilised();
  };

  /* Returns accumulated sum of all volatilised NH3 in simulation time. */
  var getSumNH3Volatilised = function () {
    return _soilOrganic.get_SumNH3_Volatilised();
  };

  /* Returns sum of denitrification rate in first 30cm soil [kg N m-3 d-1] */
  var getsum30cmActDenitrificationRate = function () {
    var sum = 0.0;
    for (var layer = 0; layer < 3; layer++)
      sum += _soilOrganic.get_ActDenitrificationRate(layer);
    return sum;
  };

  var addDailySumFertiliser = function (amount) {
    _dailySumFertiliser += amount;
    _sumFertiliser += amount;
  };

  var useNMinMineralFertilisingMethod = function () {
    return _env.useNMinMineralFertilisingMethod;
  };

  var currentCrop = function () {
    return _currentCrop;
  };

  var isCropPlanted = function () {
    return _currentCrop && _currentCrop.isValid();
  };

  var dailySumFertiliser = function () { 
    return _dailySumFertiliser; 
  };

  var dailySumIrrigationWater = function () { 
    return _dailySumIrrigationWater; 
  };

  var addDailySumIrrigationWater = function (amount) {
    _dailySumIrrigationWater += amount;
  };

  var sumFertiliser = function () { 
    return _sumFertiliser; 
  };

  var resetFertiliserCounter = function () { 
    _sumFertiliser = 0;
  };

  var resetDailyCounter = function () {
    _dailySumIrrigationWater = 0.0;
    _dailySumFertiliser = 0.0;
  };

  var get_AtmosphericCO2Concentration = function () {
    return that.vw_AtmosphericCO2Concentration;
  };

  var get_GroundwaterDepth = function () { 
    return that.vs_GroundwaterDepth; 
  };

  var writeOutputFiles = function () {
    return centralParameterProvider.writeOutputFiles;
  };

  var soilTemperature = function () {
    return _soilTemperature; 
  };

  var soilMoisture = function () {
    return _soilMoisture; 
  };

  var soilOrganic = function () {
    return _soilOrganic; 
  };

  var soilTransport = function () {
    return _soilTransport; 
  };

  var soilColumn = function () {
    return _soilColumn; 
  };

  var soilColumnNC = function () {
    return _soilColumn; 
  };

  var netRadiation = function (globrad) {
    return globrad * (1 - _env.albedo);
  };

  var daysWithCrop = function () {
    return p_daysWithCrop; 
  };

  var getAccumulatedNStress = function () {
    return p_accuNStress; 
  };

  var getAccumulatedWaterStress = function () {
    return p_accuWaterStress; 
  };

  var getAccumulatedHeatStress = function () {
    return p_accuHeatStress; 
  };

  var getAccumulatedOxygenStress = function () {
    return p_accuOxygenStress; 
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


  return {
    run: run,
    cropGrowth: this.cropGrowth,
    generalStep: generalStep,
    cropStep: cropStep,
    CO2ForDate: CO2ForDate,
    GroundwaterDepthForDate: GroundwaterDepthForDate,
    seedCrop: seedCrop,
    incorporateCurrentCrop: incorporateCurrentCrop,
    applyMineralFertiliser: applyMineralFertiliser,
    applyOrganicFertiliser: applyOrganicFertiliser,
    harvestCurrentCrop: harvestCurrentCrop,
    applyMineralFertiliserViaNMinMethod: applyMineralFertiliserViaNMinMethod,
    applyIrrigation: applyIrrigation,
    applyTillage: applyTillage,
    avgCorg: avgCorg,
    mean90cmWaterContent: mean90cmWaterContent,
    meanWaterContent: meanWaterContent,
    sumNmin: sumNmin,
    groundWaterRecharge: groundWaterRecharge,
    nLeaching: nLeaching,
    sumSoilTemperature: sumSoilTemperature,
    sumNO3AtDay: sumNO3AtDay,
    maxSnowDepth: maxSnowDepth,
    accumulatedSnowDepth: accumulatedSnowDepth,
    accumulatedFrostDepth: accumulatedFrostDepth,
    avg30cmSoilTemperature: avg30cmSoilTemperature,
    avgSoilMoisture: avgSoilMoisture,
    avgCapillaryRise: avgCapillaryRise,
    avgPercolationRate: avgPercolationRate,
    sumSurfaceRunOff: sumSurfaceRunOff,
    surfaceRunoff: surfaceRunoff,
    getEvapotranspiration: getEvapotranspiration,
    getTranspiration: getTranspiration,
    getEvaporation: getEvaporation,
    get_sum30cmSMB_CO2EvolutionRate: get_sum30cmSMB_CO2EvolutionRate,
    getNH3Volatilised: getNH3Volatilised,
    getSumNH3Volatilised: getSumNH3Volatilised,
    getsum30cmActDenitrificationRate: getsum30cmActDenitrificationRate,
    getETa: getETa,
    vw_AtmosphericCO2Concentration: this.vw_AtmosphericCO2Concentration,
    vs_GroundwaterDepth: this.vs_GroundwaterDepth,
    addDailySumFertiliser: addDailySumFertiliser,
    useNMinMineralFertilisingMethod: useNMinMineralFertilisingMethod,
    currentCrop: currentCrop,
    isCropPlanted: isCropPlanted,
    dailySumFertiliser: dailySumFertiliser,
    dailySumIrrigationWater: dailySumIrrigationWater,
    addDailySumIrrigationWater: addDailySumIrrigationWater,
    sumFertiliser: sumFertiliser,
    resetFertiliserCounter: resetFertiliserCounter,
    resetDailyCounter: resetDailyCounter,
    get_AtmosphericCO2Concentration: get_AtmosphericCO2Concentration,
    get_GroundwaterDepth: get_GroundwaterDepth,
    writeOutputFiles: writeOutputFiles,
    soilTemperature: soilTemperature,
    soilMoisture: soilMoisture,
    soilOrganic: soilOrganic,
    soilTransport: soilTransport,
    soilColumn: soilColumn,
    soilColumnNC: soilColumnNC,
    netRadiation: netRadiation,
    daysWithCrop: daysWithCrop,
    getAccumulatedNStress: getAccumulatedNStress,
    getAccumulatedWaterStress: getAccumulatedWaterStress,
    getAccumulatedHeatStress: getAccumulatedHeatStress,
    getAccumulatedOxygenStress: getAccumulatedOxygenStress
  };

};
