/*
  Originally derived, ported from MONICA
  Find details on copywrite & license in the relevant source files at https://github.com/zalf-lsa/monica.
*/

var Model = function (env) {

  var that = this;

  /* this.cropGrowth statt var, um this an SoilX. zu übergeben */
  this._currentCropGrowth = null;
  this.cropGrowth = function () { return that._currentCropGrowth; };
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
    , user_env = centralParameterProvider.userEnvironmentParameters
    , p_daysWithCrop = 0
    , p_accuNStress = 0.0
    , p_accuWaterStress = 0.0
    , p_accuHeatStress = 0.0
    , p_accuOxygenStress = 0.0
    , _currentCrop = null
    , isVegPeriod = false /* tracks if veg. period has started/ended */
    , productionProcessIdx = 0 // iterator through the production processes
    , currentProductionProcess = env.cropRotation[productionProcessIdx] // direct handle to current process
    , nextProductionProcessApplicationDate = currentProductionProcess.start()
    , yields = []
    , _year = 0
    , _julday = 0
    , vw_AtmosphericCO2Concentration = 380 
    ;

    debug(currentProductionProcess);


  /* not used anymore (see ModelCollection.run) */
  var run = function (progressCallbacks) {

    if (env.cropRotation.length === 0) {
      logger(MSG_ERROR, "rotation is empty");
      return;
    }

    var currentDate = env.da.startDate()
      , totalNoDays = env.da.noOfStepsPossible()
      ;

    logger(MSG_INFO, "next app-date: " + nextProductionProcessApplicationDate.toISODateString());

    /* if for some reason there are no applications (no nothing) in the production process: quit */
    if(!nextProductionProcessApplicationDate.isValid()) {
      logger(MSG_ERROR, "start of production-process: " + currentProductionProcess.toString() + " is not valid");
      return;
    }

    for (var dayOfSimulation = 0; dayOfSimulation < totalNoDays; dayOfSimulation++) {

      currentDate.setDate(currentDate.getDate() + 1);

      logger(MSG_INFO, currentDate.toISODateString());
      
      resetDailyCounter();

      /* test if model's crop has been dying in previous step if yes, it will be incorporated into soil */
      // if (that._currentCropGrowth && that._currentCropGrowth.isDying())
      //   incorporateCurrentCrop();

      /* there's something to apply at this day */
      if (nextProductionProcessApplicationDate.setHours(0,0,0,0) === currentDate.setHours(0,0,0,0)) {
        
        /* apply everything to do at current day */
        currentProductionProcess.apply(nextProductionProcessApplicationDate, this);
        logger(MSG_INFO, 'applied at: ' + nextProductionProcessApplicationDate.toISODateString());

        /* get the next application date to wait for */
        var prevPPApplicationDate = nextProductionProcessApplicationDate;

        nextProductionProcessApplicationDate = currentProductionProcess.nextDate(nextProductionProcessApplicationDate);


        /* if application date was not valid, we're (probably) at the end
          of the application list of this production process
          -> go to the next one in the crop rotation */
        if (!nextProductionProcessApplicationDate.isValid() && _currentCrop instanceof FieldCrop) { // TODO: in grassland?

          /* to count the applied fertiliser for the next production process */
          resetFertiliserCounter();

          /* resets crop values for use in next year */
          currentProductionProcess.crop().reset();

          productionProcessIdx++;
          /* end of crop rotation? */ 
          if (productionProcessIdx < env.cropRotation.length) {

            currentProductionProcess = env.cropRotation[productionProcessIdx];
            nextProductionProcessApplicationDate = currentProductionProcess.start();
            logger(MSG_INFO, 'new valid next app-date: ' + nextProductionProcessApplicationDate.toISODateString());
          
          }

        } else {
          if (nextProductionProcessApplicationDate.isValid())
            logger(MSG_INFO, 'next app-date: ' + nextProductionProcessApplicationDate.toISODateString());
        }

      }

      /* run crop step */
      if(isCropPlanted())
        cropStep(dayOfSimulation);
      
      /* if progressCallback is provided */
      if (progressCallbacks.length) {
        for (var c = 0, cs = progressCallbacks.length; c < cs; c++)
          progressCallbacks[c](dayOfSimulation, currentDate, this);
      }

      generalStep(dayOfSimulation);

    }

    logger(MSG_INFO, "returning from runModel");
    
    /* if progressCallbacks is provided send null i.e. we are done*/
    if (progressCallbacks) {
      for (var c = 0, cs = progressCallbacks.length; c < cs; c++)
        progressCallbacks[c](null, null);
    }

    return; /* TODO: what to return? */

  };

  var seedCrop = function (crop) {

    _currentCrop = crop;
    var cps = null; // JS!
    that._currentCropGrowth = null;

    p_daysWithCrop = 0;
    p_accuNStress = 0.0;
    p_accuWaterStress = 0.0;
    p_accuHeatStress = 0.0;
    p_accuOxygenStress = 0.0;

    /* TODO: factory for growth model instanciation? */
    if(_currentCrop.isValid() && _currentCrop.type === 'generic') {

      cps = _currentCrop.cropParameters();
      that._currentCropGrowth = new GenericCropGrowth(_soilColumn, _env.general, cps, _env.site, _env.centralParameterProvider);

      _soilTransport.put_Crop(that._currentCropGrowth);
      _soilColumn.put_Crop(that._currentCropGrowth);
      _soilMoisture.put_Crop(that._currentCropGrowth);
      _soilOrganic.put_Crop(that._currentCropGrowth);

      logger(MSG_INFO, 'seeding crop: ' + crop.name());

      if (_env.useNMinMineralFertilisingMethod && _currentCrop.seedDate().dayOfYear() <= _currentCrop.harvestDate().dayOfYear()) {

        logger(MSG_INFO, "N_min fertilising summer crop");

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

    } else if (_currentCrop.isValid() && _currentCrop.type === 'grassland') {

      cps = {};
      that._currentCropGrowth = new GrasslandGrowth(_soilColumn, _env.general, _currentCrop.mixture, _env.site, _env.centralParameterProvider);

      _soilTransport.put_Crop(that._currentCropGrowth);
      _soilColumn.put_Crop(that._currentCropGrowth);
      _soilMoisture.put_Crop(that._currentCropGrowth);
      _soilOrganic.put_Crop(that._currentCropGrowth);

      // TODO: permanent grassland
      logger(MSG_INFO, 'seeding crop: ' + crop.name());

    }

    if (!(that._currentCropGrowth instanceof CropGrowthAPI))
      logger(MSG_ERROR, 'Crop growth (' + crop.name() + ') not instance of CropGrowthAPI.');

  };


  var harvestCurrentCrop = function () {

    /* could be just a fallow, so there might be no CropGrowth object */
    if (_currentCrop && _currentCrop.isValid()) {

      /* prepare to add root and crop residues to soilorganic (AOMs) */
      var rootBiomass = that._currentCropGrowth.biomass(0);
      var rootNConcentration = that._currentCropGrowth.rootNitrogenConcentration();

      logger(MSG_INFO, 'Harvest: adding organic matter from root to soilOrganic');
      logger(MSG_INFO, 'Root biomass: ' + rootBiomass + ' Root N concentration: ' + rootNConcentration);

      _soilOrganic.addOrganicMatter(_currentCrop.residueParameters(), rootBiomass, rootNConcentration);

      var residueBiomass = that._currentCropGrowth.residueBiomass(_env.useSecondaryYields);

      /* TODO: das hier noch berechnen (???) */
      var residueNConcentration = that._currentCropGrowth.residuesNitrogenConcentration();

      logger(MSG_INFO, 'Adding organic matter from residues to soilOrganic');
      logger(MSG_INFO, 'Residue biomass: ' + residueBiomass + ' Residue N concentration: ' + residueNConcentration);
      logger(MSG_INFO, 'Primary yield biomass: ' + that._currentCropGrowth.primaryYield()
          + ' Primary yield N concentration: ' + that._currentCropGrowth.primaryYieldNitrogenConcentration());
      logger(MSG_INFO, 'Secondary yield biomass: ' + that._currentCropGrowth.secondaryYield()
          + ' Secondary yield N concentration: ' + '??');
      logger(MSG_INFO, 'Residues N content: ' + that._currentCropGrowth.residuesNitrogenContent()
          + ' Primary yield N content: ' + that._currentCropGrowth.primaryYieldNitrogenContent()
          + ' Secondary yield N content: ' + that._currentCropGrowth.secondaryYieldNitrogenContent());

      _soilOrganic.addOrganicMatter(_currentCrop.residueParameters(), residueBiomass, residueNConcentration);

      yields.push({
        year: _year,
        julday: _julday,
        yield: that._currentCropGrowth.primaryYield(),
        // yield: that._currentCropGrowth.biomass(3),
        crop: _currentCrop.name()
      });
    
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
      var totalBiomass = that._currentCropGrowth.biomass();
      var totalNConcentration = that._currentCropGrowth.shootBiomassNitrogenConcentration() + that._currentCropGrowth.rootNitrogenConcentration();

      logger(MSG_INFO, "Incorporation: adding organic matter from total biomass of crop to soilOrganic");
      logger(MSG_INFO, "Total biomass: " + totalBiomass + " Total N concentration: " + totalNConcentration);

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

      logger(MSG_INFO, 'Apply mineral fertiliser. Amount: ' + amount);

      _soilColumn.applyMineralFertiliser(partition, amount);
      addDailySumFertiliser(amount);

    }
  
  };

  
  var applyOrganicFertiliser = function (params, amount, doIncorporate) {

    logger(MSG_INFO, 'apply organic fertiliser: amount: ' + amount + ', vo_NConcentration: ' + params.vo_NConcentration);

    _soilOrganic.setIncorporation(doIncorporate);
    _soilOrganic.addOrganicMatter(params, amount, params.vo_NConcentration);
    addDailySumFertiliser(amount * params.vo_AOM_DryMatterContent * params.vo_NConcentration);
  
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

      logger(MSG_INFO, 'apply irrigation: amount: ' + amount + ', nitrateConcentration: ' + nitrateConcentration);

      _soilOrganic.addIrrigationWater(amount);
      _soilColumn.applyIrrigation(amount, nitrateConcentration);
      
      if (_currentCrop) {
  
        // _currentCrop.addAppliedIrrigationWater(amount);
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
    incorporateCurrentCrop();
  };

  /* execute next production process step */
  var prodProcessStep = function (currentDate) {

    /* is there something to apply today? */
    if (!isNaN(nextProductionProcessApplicationDate) && nextProductionProcessApplicationDate.toISODateString() === currentDate.toISODateString()) {
      
      currentProductionProcess.apply(nextProductionProcessApplicationDate, this);

      /* get the next application date to wait for */
      nextProductionProcessApplicationDate = currentProductionProcess.nextDate(nextProductionProcessApplicationDate);

      /* if application date was not valid, we're (probably) at the end of the application list of this production 
         process -> go to the next one in the crop rotation */
      if (!nextProductionProcessApplicationDate.isValid()) {

        // TODO: keep in JS?
        /* to count the applied fertiliser for the next production process */
        resetFertiliserCounter();
        /* resets crop values for use in next year */
        currentProductionProcess.crop().reset();

        productionProcessIdx++;
        /* end of crop rotation? */ 
        if (productionProcessIdx < env.cropRotation.length) {
          currentProductionProcess = env.cropRotation[productionProcessIdx];
          nextProductionProcessApplicationDate = currentProductionProcess.start();
          if (!isNaN(nextProductionProcessApplicationDate))
            logger(MSG_INFO, 'next app-date: ' + nextProductionProcessApplicationDate.toISODateString());
        }

      }

    }

  };     


  /* Simulating the soil processes for one time step. */
  var generalStep = function (
    julday,
    year,
    leapYear,
    tmin,
    tavg,
    tmax,
    precip,
    wind,
    globrad,
    relhumid
  ) {

    _year = year;
    _julday = julday;

    // that.vw_AtmosphericCO2Concentration = (_env.atmosphericCO2 === -1 ? user_env.p_AthmosphericCO2 : _env.atmosphericCO2);
    // if (toInt(that.vw_AtmosphericCO2Concentration) === 0)
    //   that.vw_AtmosphericCO2Concentration = CO2ForDate(year, julday, leapYear);

    that.vs_GroundwaterDepth = GroundwaterDepthForDate(
      user_env.p_MaxGroundwaterDepth,
      user_env.p_MinGroundwaterDepth,
      user_env.p_MinGroundwaterDepthMonth,
      julday,
      leapYear
    );
    
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
        && julday == pc_JulianDayAutomaticFertilising) {

      logger(MSG_INFO, "N_min fertilising winter crop");

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
  var cropStep = function (
    julday,
    tavg,
    tmax,
    tmin,
    globrad,
    sunhours,
    relhumid,
    wind,
    vw_WindSpeedHeight,
    C_amb,
    precip,
    f_s,
    daylength,
    R_a, 
    isVegPeriod
  ) {

    /* do nothing if there is no crop */
    if (!that._currentCropGrowth)
      return;

    /* test if model's crop has been dying in previous step if yes, it will be incorporated into soil */
    // if (that._currentCropGrowth.isDying()) {
    //   incorporateCurrentCrop();
    //   return;
    // }

    vw_AtmosphericCO2Concentration = C_amb;

    p_daysWithCrop++;

    that._currentCropGrowth.step(
      julday,
      tavg,
      tmax,
      tmin,
      globrad,
      sunhours,
      (relhumid / 100),
      wind,
      vw_WindSpeedHeight,
      C_amb,
      precip,
      f_s,
      daylength,
      R_a, 
      isVegPeriod
    );

    if (isVegPeriod && _currentCrop.isAutoIrrigationOn()) { 
      var irrigationWater = _soilColumn.applyIrrigationViaTrigger(0.35, 0 /* AutomaticIrrigationParameters */);
      _soilOrganic.addIrrigationWater(irrigationWater);
      // _currentCrop.addAppliedIrrigationWater(irrigationWater);
      _dailySumIrrigationWater += irrigationWater;
    }

    p_accuNStress += that._currentCropGrowth.nitrogenStress();
    p_accuWaterStress += that._currentCropGrowth.waterStress();
    p_accuHeatStress += that._currentCropGrowth.heatStress();
    p_accuOxygenStress += that._currentCropGrowth.oxygenStress();

  };

  /* 
    RCP 8.5—A scenario of comparatively high greenhouse gas emissions
    
    Returns atmospheric CO2 concentration for date [ppm] 
  */
  var CO2ForDate = function (year, doy, leapYear) {

    var co2 = 380, decimalDate = 0;

    if (leapYear)
      decimalDate = year + (doy / 366.0);
    else
      decimalDate = year + (doy / 365.0);

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
      return that._currentCropGrowth.remainingEvapotranspiration();
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
      return that._currentCropGrowth.evaporatedFromIntercept();
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
    return vw_AtmosphericCO2Concentration;
  };

  var get_GroundwaterDepth = function () { 
    return that.vs_GroundwaterDepth; 
  };

  var writeOutputFiles = function () {
    return centralParameterProvider.writeOutputFiles;
  };

  var getCentralParameterProvider = function () {
    return centralParameterProvider;
  };

  var getEnvironment= function () {
    return _env;
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

  var getIsVegPeriod = function () {
    return Number(isVegPeriod); 
  };

  var setIsVegPeriod = function (veg) {
    isVegPeriod = veg; 
  };

  return {
    run: run,
    getCentralParameterProvider: getCentralParameterProvider,
    getEnvironment: getEnvironment,
    cropGrowth: this.cropGrowth,
    prodProcessStep: prodProcessStep,
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
    getAccumulatedOxygenStress: getAccumulatedOxygenStress,
    getIsVegPeriod: getIsVegPeriod,
    setIsVegPeriod: setIsVegPeriod,
    yields: function () { return yields; }
  };

};
