var Model = function (env) {

  var that = this;

  /**
   * @brief returns value for current crop.
   * @return crop growth
   */
  // this.cropGrowth statt var, um this an SoilX. zu übergeben
  this._currentCropGrowth = null;
  this.cropGrowth = function () { return that._currentCropGrowth; };

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
    ;

  this.vw_AtmosphericCO2Concentration;
  this.vs_GroundwaterDepth;

  var _currentCrop = null;


  /**
   * @brief Simulation of crop seed.
   * @param crop to be planted
   */
  var seedCrop = function (crop) {

    debug("seedCrop");

    that._currentCropGrowth = null;
    p_daysWithCrop = 0;
    p_accuNStress = 0.0;
    p_accuWaterStress = 0.0;
    p_accuHeatStress = 0.0;
    p_accuOxygenStress = 0.0;
    var cps = null; // JS!

    _currentCrop = crop;
    if(_currentCrop.isValid()) {
      cps = _currentCrop.cropParameters();
      that._currentCropGrowth = new FieldCropGrowth(_soilColumn, _env.general, cps, _env.site, _env.centralParameterProvider/*, crop.getEva2TypeUsage()*/);
      _soilTransport.put_Crop(that._currentCropGrowth);
      _soilColumn.put_Crop(that._currentCropGrowth);
      _soilMoisture.put_Crop(that._currentCropGrowth);
      _soilOrganic.put_Crop(that._currentCropGrowth);

      logger(MSG.INFO, "seedDate: " + _currentCrop.seedDate().toString()
          + " harvestDate: " + _currentCrop.harvestDate().toString());

      if(_env.useNMinMineralFertilisingMethod && _currentCrop.seedDate().dayOfYear() <=
         _currentCrop.harvestDate().dayOfYear())
      {
        logger(MSG.INFO, "nMin fertilising summer crop");
        var fert_amount = applyMineralFertiliserViaNMinMethod
            (_env.nMinFertiliserPartition,
             NMinCropParameters(cps.pc_SamplingDepth,
                                cps.pc_TargetNSamplingDepth,
                                cps.pc_TargetN30));
        addDailySumFertiliser(fert_amount);
      }

      // if (that.writeOutputFiles()) {
          // _currentCrop.writeCropParameters(_env.pathToOutputDir);
      // }
    }
  };

  /**
   * @brief Simulating harvest of crop.
   *
   * Deletes the current crop.
   */
  var harvestCurrentCrop = function () {

    //could be just a fallow, so there might be no CropGrowth object
    if(_currentCrop && _currentCrop.isValid())
    {
      //prepare to add root and crop residues to soilorganic (AOMs)
      var rootBiomass = that._currentCropGrowth.get_OrganBiomass(0);
      var rootNConcentration = that._currentCropGrowth.get_RootNConcentration();
      logger(MSG.INFO, "adding organic matter from root to soilOrganic");
      logger(MSG.INFO, "root biomass: " + rootBiomass
          + " Root N concentration: " + rootNConcentration);

      _soilOrganic.addOrganicMatter(_currentCrop.residueParameters(),
                                    rootBiomass, rootNConcentration);

      var residueBiomass =
          that._currentCropGrowth.get_ResidueBiomass(_env.useSecondaryYields);
      //!@todo Claas: das hier noch berechnen
      var residueNConcentration = that._currentCropGrowth.get_ResiduesNConcentration();
      logger(MSG.INFO, "adding organic matter from residues to soilOrganic");
      logger(MSG.INFO, "residue biomass: " + residueBiomass
          + " Residue N concentration: " + residueNConcentration);
      logger(MSG.INFO, "primary yield biomass: " + that._currentCropGrowth.get_PrimaryCropYield()
          + " Primary yield N concentration: " + that._currentCropGrowth.get_PrimaryYieldNConcentration());
      logger(MSG.INFO, "secondary yield biomass: " + that._currentCropGrowth.get_SecondaryCropYield()
          + " Secondary yield N concentration: " + '??');
      logger(MSG.INFO, "Residues N content: " + that._currentCropGrowth.get_ResiduesNContent()
          + " Primary yield N content: " + that._currentCropGrowth.get_PrimaryYieldNContent()
          + " Secondary yield N content: " + that._currentCropGrowth.get_SecondaryYieldNContent());

      _soilOrganic.addOrganicMatter(_currentCrop.residueParameters(),
                                    residueBiomass, residueNConcentration);
    }

    that._currentCropGrowth = null;
    _currentCrop = null;
    _soilTransport.remove_Crop();
    _soilColumn.remove_Crop();
    _soilMoisture.remove_Crop();
  };


  /**
   * @brief Simulating plowing or incorporating of total crop.
   *
   * Deletes the current crop.
   */
  var incorporateCurrentCrop = function () {
    //could be just a fallow, so there might be no CropGrowth object
    if(_currentCrop && _currentCrop.isValid())
    {
      //prepare to add root and crop residues to soilorganic (AOMs)
      var total_biomass = that._currentCropGrowth.totalBiomass();
      var totalNConcentration = that._currentCropGrowth.get_AbovegroundBiomassNConcentration() + that._currentCropGrowth.get_RootNConcentration();

      logger(MSG.INFO, "Adding organic matter from total biomass of crop to soilOrganic");
      logger(MSG.INFO, "Total biomass: " + total_biomass
          + " Total N concentration: " + totalNConcentration);

      _soilOrganic.addOrganicMatter(_currentCrop.residueParameters(),
                                    total_biomass, totalNConcentration);
    }

    that._currentCropGrowth = null;
    _currentCrop = null;
    _soilTransport.remove_Crop();
    _soilColumn.remove_Crop();
    _soilMoisture.remove_Crop();
  };


  /**
   * @brief Applying of fertilizer.
   *
   * @todo Nothing implemented yet.
   */
  var applyMineralFertiliser = function (partition, amount) {
    if(!_env.useNMinMineralFertilisingMethod) {
      logger(MSG.INFO, 'apply mineral fertiliser: amount: ' + amount);
      _soilColumn.applyMineralFertiliser(partition, amount);
      addDailySumFertiliser(amount);
    }
  };

  var applyOrganicFertiliser = function (params, amount, incorporation) {
    logger(MSG.INFO, 'apply organic fertiliser: amount: ' + amount + ', vo_NConcentration: ' + params.vo_NConcentration);
    _soilOrganic.setIncorporation(incorporation);
    _soilOrganic.addOrganicMatter(params, amount, params.vo_NConcentration);
    addDailySumFertiliser(amount * params.vo_NConcentration);
  };

  var applyMineralFertiliserViaNMinMethod = function (partition, cps) {
    // TODO: implement
    //AddFertiliserAmountsCallback x(_sumFertiliser, _dailySumFertiliser);

    var ups = _env.nMinUserParams;

    var fert_amount = _soilColumn.applyMineralFertiliserViaNMinMethod(partition, cps.samplingDepth, cps.nTarget, cps.nTarget30,
         ups.min, ups.max, ups.delayInDays);
    return fert_amount;

    //ref(_sumFertiliser) += _1);
  };

  var applyIrrigation = function (amount, nitrateConcentration /*, sulfateConcentration*/) {
    //if the production process has still some defined manual irrigation dates
    if(!_env.useAutomaticIrrigation)
    {
      _soilOrganic.addIrrigationWater(amount);
      _soilColumn.applyIrrigation(amount, nitrateConcentration);
      if(_currentCrop)
      {
        _currentCrop.addAppliedIrrigationWater(amount);
        this.addDailySumIrrigationWater(amount);
      }
    }
  };

  /**
   * Applies tillage for a given soil depth. Tillage means in MONICA,
   * that for all effected soil layer the parameters are averaged.
   * @param depth Depth in meters
   */
  var applyTillage = function (depth) {
    _soilColumn.applyTillage(depth);
  };

  /**
   * @brief Simulating the soil processes for one time step.
   * @param stepNo Number of current processed step
   */
  var generalStep = function (stepNo) {

    var startDate = _dataAccessor.startDate();
    var currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + stepNo);
    var julday = _dataAccessor.julianDayForStep(stepNo);
    var year = currentDate.getFullYear();
    var leapYear = currentDate.isLeapYear();
    var tmin = _dataAccessor.dataForTimestep(WEATHER.TMIN, stepNo);
    var tavg = _dataAccessor.dataForTimestep(WEATHER.TAVG, stepNo);
    var tmax = _dataAccessor.dataForTimestep(WEATHER.TMAX, stepNo);
    var precip = _dataAccessor.dataForTimestep(WEATHER.PRECIP, stepNo);
    var wind = _dataAccessor.dataForTimestep(WEATHER.WIND, stepNo);
    var globrad = _dataAccessor.dataForTimestep(WEATHER.GLOBRAD, stepNo);

    debug("-------- generalStep " + stepNo + " ---------");
    debug(currentDate.toLocaleDateString());

    // test if data for relhumid are available; if not, value is set to -1.0
    var relhumid = _dataAccessor.hasAvailableClimateData(WEATHER.RELHUMID) ?
         _dataAccessor.dataForTimestep(WEATHER.RELHUMID, stepNo) : -1.0;

    var user_env = centralParameterProvider.userEnvironmentParameters;
    that.vw_AtmosphericCO2Concentration = _env.atmosphericCO2 == -1 ? user_env.p_AthmosphericCO2 : _env.atmosphericCO2;

  //  cout << "that.vs_GroundwaterDepth:\t" << user_env.p_MinGroundwaterDepth << "\t" << user_env.p_MaxGroundwaterDepth << endl;
    that.vs_GroundwaterDepth = GroundwaterDepthForDate(user_env.p_MaxGroundwaterDepth,
                  user_env.p_MinGroundwaterDepth,
                  user_env.p_MinGroundwaterDepthMonth,
                  julday,
                  leapYear);

    if (stepNo<=1) {
      //    : << "Monica: tmin: " << tmin << endl;
      //    cout << "Monica: tmax: " << tmax << endl;
      //    cout << "Monica: globrad: " << globrad << endl;
      //    cout << "Monica: precip: " << precip << endl;
    }


    if (int(that.vw_AtmosphericCO2Concentration) == 0)
      that.vw_AtmosphericCO2Concentration = CO2ForDate(year, julday, leapYear);

    //  debug << "step: " << stepNo << " p: " << precip << " gr: " << globrad << endl;

    //31 + 28 + 15
    var pc_JulianDayAutomaticFertilising = user_env.p_JulianDayAutomaticFertilising;

    _soilColumn.deleteAOMPool();

    _soilColumn.applyPossibleDelayedFerilizer();
    var delayed_fert_amount = _soilColumn.applyPossibleTopDressing();
    addDailySumFertiliser(delayed_fert_amount);

    if(_currentCrop && _currentCrop.isValid() &&
       _env.useNMinMineralFertilisingMethod
       && _currentCrop.seedDate().dayOfYear() > _currentCrop.harvestDate().dayOfYear()
      && _dataAccessor.julianDayForStep(stepNo) == pc_JulianDayAutomaticFertilising)
      {
      logger(MSG.INFO, "nMin fertilising winter crop");
      var cps = _currentCrop.cropParameters();
      var fert_amount = applyMineralFertiliserViaNMinMethod
          (_env.nMinFertiliserPartition,
           NMinCropParameters(cps.pc_SamplingDepth,
                              cps.pc_TargetNSamplingDepth,
                              cps.pc_TargetN30));
      addDailySumFertiliser(fert_amount);

    }

    _soilTemperature.step(tmin, tmax, globrad);
    _soilMoisture.step(that.vs_GroundwaterDepth,
                       precip, tmax, tmin,
                       (relhumid / 100.0), tavg, wind,
                       _env.windSpeedHeight,
       globrad, julday);

    _soilOrganic.step(tavg, precip, wind);
    _soilTransport.step();
  };

  /**
   * @brief Simulating crop growth for one time step.
   */
  var cropStep = function (stepNo) {
    // do nothing if there is no crop
    if(!that._currentCropGrowth)
      return;

    p_daysWithCrop++;

    var julday = _dataAccessor.julianDayForStep(stepNo);

    var tavg = _dataAccessor.dataForTimestep(WEATHER.TAVG, stepNo);
    var tmax = _dataAccessor.dataForTimestep(WEATHER.TMAX, stepNo);
    var tmin = _dataAccessor.dataForTimestep(WEATHER.TMIN, stepNo);
    var globrad = _dataAccessor.dataForTimestep(WEATHER.GLOBRAD, stepNo);

    // test if data for sunhours are available; if not, value is set to -1.0
    var sunhours = _dataAccessor.hasAvailableClimateData(WEATHER.SUNHOURS) ?
      _dataAccessor.dataForTimestep(WEATHER.SUNHOURS, stepNo) : -1.0;    

    // test if data for relhumid are available; if not, value is set to -1.0
    var relhumid = _dataAccessor.hasAvailableClimateData(WEATHER.RELHUMID) ?
        _dataAccessor.dataForTimestep(WEATHER.RELHUMID, stepNo) : -1.0;

    var wind =  _dataAccessor.dataForTimestep(WEATHER.WIND, stepNo);
    var precip =  _dataAccessor.dataForTimestep(WEATHER.PRECIP, stepNo);

    var vw_WindSpeedHeight =
        centralParameterProvider.userEnvironmentParameters.p_WindSpeedHeight;

    that._currentCropGrowth.step(tavg, tmax, tmin, globrad, sunhours, julday,
                             (relhumid / 100.0), wind, vw_WindSpeedHeight,
                             that.vw_AtmosphericCO2Concentration, precip);
    if(_env.useAutomaticIrrigation)
    {
      var aips = _env.autoIrrigationParams;
      if(_soilColumn.applyIrrigationViaTrigger(aips.treshold, aips.amount,
                                               aips.nitrateConcentration))
      {
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

  /**
  * @brief Returns atmospheric CO2 concentration for date [ppm]
  *
  * @param co2
  *
  * @return
  */
  var CO2ForDate = function (year, julianday, leapYear) {
    var co2;
    var decimalDate;

    if (leapYear)
      decimalDate = year + (julianday/366.0);
    else
      decimalDate = year + (julianday/365.0);

    co2 = 222.0 + exp(0.0119 * (decimalDate - 1580.0)) + 2.5 * sin((decimalDate - 0.5) / 0.1592);
    return co2;
  };

  /**
  * @brief Returns groundwater table for date [m]
  *
  * @param pm_MaxGroundwaterTable; pm_MinGroundwaterTable; pm_MaxGroundwaterTableMonth
  *
  * @return
  */
  var GroundwaterDepthForDate = function (
    maxGroundwaterDepth,
    minGroundwaterDepth,
    minGroundwaterDepthMonth,
    julianday,
    leapYear
  ) {

    // logger(MSG.INFO, "GroundwaterDepthForDate");
    // logger(MSG.INFO, arguments);
    
    var groundwaterDepth;
    var days;
    var meanGroundwaterDepth;
    var groundwaterAmplitude;

    if (leapYear)
      days = 366.0;
    else
      days = 365.0;

    meanGroundwaterDepth = (maxGroundwaterDepth + minGroundwaterDepth) / 2.0;
    groundwaterAmplitude = (maxGroundwaterDepth - minGroundwaterDepth) / 2.0;

    var sinus = sin(((julianday / days * 360.0) - 90.0 -
           (((minGroundwaterDepthMonth) * 30.0) - 15.0)) *
           3.14159265358979 / 180.0);

    groundwaterDepth = meanGroundwaterDepth + (sinus * groundwaterAmplitude);

    if (groundwaterDepth < 0.0) groundwaterDepth = 20.0;

    return groundwaterDepth;
  };

  //----------------------------------------------------------------------------

  /**
   * @brief Returns mean soil organic C.
   * @param depth_m
   */
  //Kohlenstoffgehalt 0-depth [% kg C / kg Boden]
  var avgCorg = function (depth_m) {
    var lsum = 0, sum = 0;
    var count = 0;

    for(var i = 0, nols = _env.noOfLayers; i < nols; i++)
    {
      count++;
      sum +=_soilColumn[i].vs_SoilOrganicCarbon(); //[kg C / kg Boden]
      lsum += _soilColumn[i].vs_LayerThickness;
      if(lsum >= depth_m)
        break;
    }

    return sum / (count) * 100.0;
  };

  /**
   * @brief Returns the soil moisture up to 90 cm depth
   * @return water content
   */
  //Bodenwassergehalt 0-90cm [%nFK]
  var mean90cmWaterContent = function () {
    return _soilMoisture.meanWaterContent(0.9);
  };

  var meanWaterContent = function (layer, number_of_layers) {
    return _soilMoisture.meanWaterContent(layer, number_of_layers);
  };

  /**
   * @brief Returns the N content up to given depth.
   *
   *@return N content
   *
   */
  //Boden-Nmin-Gehalt 0-90cm am 31.03. [kg N/ha]
  var sumNmin = function (depth_m) {
    var lsum = 0, sum = 0;
    var count = 0;

    for(var i = 0, nols = _env.noOfLayers; i < nols; i++)
    {
      count++;
      sum += _soilColumn[i].get_SoilNmin(); //[kg N m-3]
      lsum += _soilColumn[i].vs_LayerThickness;
      if(lsum >= depth_m)
        break;
    }

    return sum / (count) * lsum * 10000;
  }

  /**
   * Returns accumulation of soil nitrate for 90cm soil at 31.03.
   * @param depth Depth of soil
   * @return Accumulated nitrate
   */
  var sumNO3AtDay = function (depth_m) {
    var lsum = 0, sum = 0;
    var count = 0;

    for(var i = 0, nols = _env.noOfLayers; i < nols; i++)
    {
      count++;
      sum += _soilColumn[i].get_SoilNO3(); //[kg m-3]
      lsum += _soilColumn[i].vs_LayerThickness;
      if(lsum >= depth_m)
        break;
    }

    return sum;
  };

  //Grundwasserneubildung[mm Wasser]
  var groundWaterRecharge = function () {
    return _soilMoisture.get_GroundwaterRecharge();
  };

  //N-Auswaschung[kg N/ha]
  var nLeaching = function () {
    return _soilTransport.get_NLeaching();//[kg N ha-1]
  };

  /**
   * Returns sum of soiltemperature in given number of soil layers
   * @param layers Number of layers that should be added.
   * @return Soil temperature sum [°C]
   */
  var sumSoilTemperature = function (layers) {
    return _soilColumn.sumSoilTemperature(layers);
  };

  /**
   * Returns maximal snow depth during simulation
   * @return
   */
  var maxSnowDepth = function () {
    return _soilMoisture.getMaxSnowDepth();
  };

  /**
   * Returns sum of all snowdepth during whole simulation
   * @return
   */
  var accumulatedSnowDepth = function () {
    return _soilMoisture.accumulatedSnowDepth();
  };

  /**
   * Returns sum of frost depth during whole simulation.
   * @return Accumulated frost depth
   */
  var accumulatedFrostDepth = function () {
    return _soilMoisture.getAccumulatedFrostDepth();
  };

  /**
   * Returns average soil temperature of first 30cm soil.
   * @return Average soil temperature of organic layers.
   */
  var avg30cmSoilTemperature = function () {
    var nols = 3;
    var accu_temp = 0.0;
    for (var layer=0; layer<nols; layer++)
      accu_temp+=_soilColumn.soilLayer(layer).get_Vs_SoilTemperature();

    return accu_temp / nols;
  };

  /**
   * Returns average soil moisture concentration in soil in a defined layer.
   * Layer is specified by start end end of soil layer.
   *
   * @param start_layer
   * @param end_layer
   * @return Average soil moisture concentation
   */
  var avgSoilMoisture = function (start_layer, end_layer) {
    var num=0;
    var accu = 0.0;
    for (var i=start_layer; i<end_layer; i++)
    {
      accu+=_soilColumn.soilLayer(i).get_Vs_SoilMoisture_m3();
      num++;
    }
    return accu/num;
  };

  /**
   * Returns mean of capillary rise in a set of layers.
   * @param start_layer First layer to be included
   * @param end_layer Last layer, is not included;
   * @return Average capillary rise [mm]
   */
  var avgCapillaryRise = function (start_layer, end_layer) {
    var num=0;
    var accu = 0.0;
    for (var i=start_layer; i<end_layer; i++)
    {
      accu+=_soilMoisture.get_CapillaryRise(i);
      num++;
    }
    return accu/num;
  };

  /**
   * @brief Returns mean percolation rate
   * @param start_layer
   * @param end_layer
   * @return Mean percolation rate [mm]
   */
  var avgPercolationRate = function (start_layer, end_layer) {
    var num=0;
    var accu = 0.0;
    for (var i=start_layer; i<end_layer; i++)
    {
      accu+=_soilMoisture.get_PercolationRate(i);
      num++;
    }
    return accu/num;
  };

  /**
   * Returns sum of all surface run offs at this point in simulation time.
   * @return Sum of surface run off in [mm]
   */
  var sumSurfaceRunOff = function () {
    return _soilMoisture.get_SumSurfaceRunOff();
  };

  /**
   * Returns surface runoff of current day [mm].
   */
  var surfaceRunoff = function () {
    return _soilMoisture.get_SurfaceRunOff();
  };

  /**
   * Returns evapotranspiration [mm]
   * @return
   */
  var getEvapotranspiration = function () {
    if (that._currentCropGrowth!=0)
      return that._currentCropGrowth.get_RemainingEvapotranspiration();

    return 0.0;
  };

  /**
   * Returns actual transpiration
   * @return
   */
  var getTranspiration = function () {
    if (that._currentCropGrowth!=0)
      return that._currentCropGrowth.get_ActualTranspiration();

    return 0.0;
  };

  /**
   * Returns actual evaporation
   * @return
   */
  var getEvaporation = function () {
    if (that._currentCropGrowth!=0)
      return that._currentCropGrowth.get_EvaporatedFromIntercept();

    return 0.0;
  };

  var getETa = function () {
    return _soilMoisture.get_Evapotranspiration();
  };

  /**
   * Returns sum of evolution rate in first three layers.
   * @return
   */
  var get_sum30cmSMB_CO2EvolutionRate = function () {
    var sum = 0.0;
    for (var layer=0; layer<3; layer++) {
      sum+=_soilOrganic.get_SMB_CO2EvolutionRate(layer);
    }

    return sum;
  };

  /**
   * Returns volatilised NH3
   * @return
   */
  var getNH3Volatilised = function () {
    return _soilOrganic.get_NH3_Volatilised();
  };

  /**
   * Returns accumulated sum of all volatilised NH3 in simulation time.
   * @return
   */
  var getSumNH3Volatilised = function () {
  //  cout << "NH4Vol: " << _soilOrganic.get_sumNH3_Volatilised() << endl;
    return _soilOrganic.get_SumNH3_Volatilised();
  };

  /**
   * Returns sum of denitrification rate in first 30cm soil.
   * @return Denitrification rate [kg N m-3 d-1]
   */
  var getsum30cmActDenitrificationRate = function () {
    var sum=0.0;
    for (var layer=0; layer<3; layer++) {
  //    cout << "DENIT: " << _soilOrganic.get_ActDenitrificationRate(layer) << endl;
      sum+=_soilOrganic.get_ActDenitrificationRate(layer);
    }

    return sum;
  };

  var addDailySumFertiliser = function (amount) {
    _dailySumFertiliser += amount;
    _sumFertiliser += amount;
  };

  return {
      cropGrowth: this.cropGrowth,
      generalStep: generalStep,
      cropStep: cropStep,
      CO2ForDate: CO2ForDate,
      GroundwaterDepthForDate: GroundwaterDepthForDate,
      //! seed given crop
      seedCrop: seedCrop,
      //! what crop is currently seeded ?
      currentCrop: function () {
        return _currentCrop;
      },
      isCropPlanted: function () {
        return _currentCrop && _currentCrop.isValid();
      },
      //! harvest the currently seeded crop
      harvestCurrentCrop: harvestCurrentCrop,
      incorporateCurrentCrop: incorporateCurrentCrop,
      applyMineralFertiliser: applyMineralFertiliser,
      applyOrganicFertiliser: applyOrganicFertiliser,
      useNMinMineralFertilisingMethod: function () {
        return _env.useNMinMineralFertilisingMethod;
      },
      applyMineralFertiliserViaNMinMethod: applyMineralFertiliserViaNMinMethod,
      dailySumFertiliser: function () { 
        return _dailySumFertiliser; 
      },
      addDailySumFertiliser: addDailySumFertiliser,
      dailySumIrrigationWater: function () { 
        return _dailySumIrrigationWater; 
      },
      addDailySumIrrigationWater: function (amount) {
        _dailySumIrrigationWater += amount;
      },
      sumFertiliser: function () { 
        return _sumFertiliser; 
      },
      resetFertiliserCounter: function () { 
        _sumFertiliser = 0;
      },
      resetDailyCounter: function () {
        _dailySumIrrigationWater = 0.0;
        _dailySumFertiliser = 0.0;
      },
      applyIrrigation: applyIrrigation,
      applyTillage: applyTillage,
      get_AtmosphericCO2Concentration: function () {
        return that.vw_AtmosphericCO2Concentration;
      },
      get_GroundwaterDepth: function () { 
        return that.vs_GroundwaterDepth; 
      },
      writeOutputFiles: function () {
        return centralParameterProvider.writeOutputFiles;
      },
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
      /**
       * @brief Returns soil temperature
       * @return temperature
       */
      soilTemperature: function () { return _soilTemperature; },
      /**
       * @brief Returns soil moisture.
       * @return Moisture
       */
      soilMoisture: function () { return _soilMoisture; },

      /**
       * @brief Returns soil organic mass.
       * @return soil organic
       */
      soilOrganic: function () { return _soilOrganic; },

      /**
       * @brief Returns soil transport
       * @return soil transport
       */
      soilTransport: function () { return _soilTransport; },

      /**
       * @brief Returns soil column
       * @return soil column
       */
      soilColumn: function () { return _soilColumn; },

      soilColumnNC: function () { return _soilColumn; },

      /**
       * @brief Returns net radiation.
       * @param globrad
       * @return radiation
       */
      netRadiation: function (globrad) { return globrad * (1 - _env.albedo); },
      daysWithCrop: function () {return p_daysWithCrop; },
      getAccumulatedNStress: function () { return p_accuNStress; },
      getAccumulatedWaterStress: function () { return p_accuWaterStress; },
      getAccumulatedHeatStress: function () { return p_accuHeatStress; },
      getAccumulatedOxygenStress: function () { return p_accuOxygenStress; }
  };

};
