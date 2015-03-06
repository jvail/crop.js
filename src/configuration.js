/*

  TODO:
    - date, doy optional?
    - use date string instead of Date obj?
    - what if sunhours not available?

  weather = {                     object
      tmin          [°C]            array, daily minimum temperature
    , tmax          [°C]            array, daily maximum temperature
    , tavg          [°C]            array, daily average temperature
    , globrad       [MJ m-2]        array, global radiation
    , exrad         [MJ m-2]        array, extraterrestrial radiation
    , wind          [m s-1]         array, wind speed
    , precip        [mm]            array, rainfall
    , sunhours      [h]             array, sunshine hours, optional (use empty array if not available)
    , relhumid      [%]             array, relative humidity, optional (use empty array if not available)
    , daylength     [h]             array, daylength. required by grassland model
    , f_directrad   [h h-1]         array, fraction direct solar radiation. required by grassland model
    , date          [date]          array, ISO date strings
    , doy           [#]             array, day of year
  }
  doDebug           [bool]          debug model and show MSG.DEBUG output
  isVerbose         [bool]          show MSG.INFO output
  progressCallbacks [array]       array functions, of access model variables at each time step
*/

var Configuration = function (weather, doDebug, isVerbose, progressCallbacks) {

  DEBUG = (doDebug === true) ? true : false;
  VERBOSE = (isVerbose === true) ? true : false;

  var pathToOutputDir = '.';

  var run = function run(simInput, siteInput, prodInput) {

    /* set to default if arg not provided */
    if (progressCallbacks.length === 0)
      progressCallbacks = [defaultCallback];
    
    logger(MSG.INFO, 'Fetching parameters.');
    
    /* init parameters */
    var parameterProvider = new ParameterProvider();
    var siteParameters = new SiteParameters();
    var generalParameters = new GeneralParameters();

    /* sim */
    var startDate = new Date(simInput.time.startDate);
    var endDate = new Date(simInput.time.endDate);
    var startYear = startDate.getFullYear();
    var endYear = endDate.getFullYear();

    parameterProvider.userInitValues.p_initPercentageFC = getValue(simInput.init, 'percentageFC', parameterProvider.userInitValues.p_initPercentageFC);
    parameterProvider.userInitValues.p_initSoilNitrate = getValue(simInput.init, 'soilNitrate', parameterProvider.userInitValues.p_initSoilNitrate);
    parameterProvider.userInitValues.p_initSoilAmmonium = getValue(simInput.init, 'soilAmmonium', parameterProvider.userInitValues.p_initSoilAmmonium);

    parameterProvider.userEnvironmentParameters.p_UseSecondaryYields = getValue(simInput.switches, 'useSecondaryYieldOn', parameterProvider.userEnvironmentParameters.p_UseSecondaryYields);
    generalParameters.pc_NitrogenResponseOn = getValue(simInput.switches, 'nitrogenResponseOn', generalParameters.pc_NitrogenResponseOn);
    generalParameters.pc_WaterDeficitResponseOn = getValue(simInput.switches, 'waterDeficitResponseOn', generalParameters.pc_WaterDeficitResponseOn);
    generalParameters.pc_EmergenceMoistureControlOn = getValue(simInput.switches, 'emergenceMoistureControlOn', generalParameters.pc_EmergenceMoistureControlOn);
    generalParameters.pc_EmergenceFloodingControlOn = getValue(simInput.switches, 'emergenceFloodingControlOn', generalParameters.pc_EmergenceFloodingControlOn);

    logger(MSG.INFO, 'Fetched simulation data.');
    
    /* site */
    siteParameters.vs_Latitude = siteInput.latitude;
    siteParameters.vs_Slope = siteInput.slope;
    siteParameters.vs_HeightNN = siteInput.heightNN;
    siteParameters.vq_NDeposition = getValue(siteInput, 'NDeposition', siteParameters.vq_NDeposition);

    parameterProvider.userEnvironmentParameters.p_AthmosphericCO2 = getValue(siteInput, 'atmosphericCO2', parameterProvider.userEnvironmentParameters.p_AthmosphericCO2);
    parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepth = getValue(siteInput, 'groundwaterDepthMin', parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepth);
    parameterProvider.userEnvironmentParameters.p_MaxGroundwaterDepth = getValue(siteInput, 'groundwaterDepthMax', parameterProvider.userEnvironmentParameters.p_MaxGroundwaterDepth);
    parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepthMonth = getValue(siteInput, 'groundwaterDepthMinMonth', parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepthMonth);
    parameterProvider.userEnvironmentParameters.p_WindSpeedHeight = getValue(siteInput, 'windSpeedHeight', parameterProvider.userEnvironmentParameters.p_WindSpeedHeight);  
    parameterProvider.userEnvironmentParameters.p_LeachingDepth = getValue(siteInput, 'leachingDepth', parameterProvider.userEnvironmentParameters.p_LeachingDepth);

    logger(MSG.INFO, 'Fetched site data.');

    /* soil */
    var lThicknessCm = 100.0 * parameterProvider.userEnvironmentParameters.p_LayerThickness;
    var maxDepthCm =  200.0;
    var maxNoOfLayers = int(maxDepthCm / lThicknessCm);

    var layers = [];
    if (!createLayers(layers, siteInput.horizons, lThicknessCm, maxNoOfLayers)) {
      logger(MSG.ERROR, 'Error fetching soil data.');
      return;
    }
    
    logger(MSG.INFO, 'Fetched soil data.');

    /* weather */
    var da = new Weather(startDate, endDate);
    if (!createClimate(da, weather, Date.parse(simInput.time.startDate), Date.parse(simInput.time.endDate))) {
      logger(MSG.ERROR, 'Error fetching weather data.');
      return;
    }

    if (!(da instanceof Weather))
      throw da;
    
    logger(MSG.INFO, 'Fetched weather data.');

    /* crops */
    var cropRotation = [];
    if (!createProcesses(cropRotation, prodInput.crops, startDate)) {
      logger(MSG.ERROR, 'Error fetching crop data.');
      return;
    }
    
    logger(MSG.INFO, 'Fetched crop data.');

    var env = new Environment(layers, parameterProvider);
    env.general = generalParameters;
    env.pathToOutputDir = pathToOutputDir;
    // env.setMode(1); // JS! not implemented
    env.site = siteParameters;
    env.da = da;
    env.cropRotation = cropRotation;
   
    // TODO: implement and test useAutomaticIrrigation & useNMinFertiliser
    // if (hermes_config->useAutomaticIrrigation()) {
    //   env.useAutomaticIrrigation = true;
    //   env.autoIrrigationParams = hermes_config->getAutomaticIrrigationParameters();
    // }

    // if (hermes_config->useNMinFertiliser()) {
    //   env.useNMinMineralFertilisingMethod = true;
    //   env.nMinUserParams = hermes_config->getNMinUserParameters();
    //   env.nMinFertiliserPartition = getMineralFertiliserParametersFromMonicaDB(hermes_config->getMineralFertiliserID());
    // }

    var model = new Model(env);

    logger(MSG.INFO, 'Start model run.');

    return model.run(progressCallbacks);
    
  };

  /* read value from JSON input and return default value if parameter is not available */
  function getValue(obj, prop, def) {

    if (obj.hasOwnProperty(prop) && obj[prop] != null)
      return obj[prop];
    else
      return def;

  }

  function createLayers(layers, horizons, lThicknessCm, maxNoOfLayers) {

    var ok = true;
    var hs = horizons.length;
    var depth = 0;
    
    logger(MSG.INFO, 'Fetching ' + hs + ' horizons.');

    for (var h = 0; h < hs; ++h ) {
      
      var horizon = horizons[h];
      var hThicknessCm = horizon.thickness * 100;
      var lInHCount = int(round(hThicknessCm / lThicknessCm));

      /* fill all (maxNoOfLayers) layers if available horizons depth < lThicknessCm * maxNoOfLayers */
      if (h == (hs - 1) && (int(layers.length) + lInHCount) < maxNoOfLayers)
        lInHCount += maxNoOfLayers - layers.length - lInHCount;

      for (var l = 0; l < lInHCount; l++) {

        /* stop if we reach max. depth */
        if (depth === maxNoOfLayers * lThicknessCm) {
          logger(MSG.WARN, 'Maximum soil layer depth (' + (maxNoOfLayers * lThicknessCm) + ' cm) reached. Remaining layers in horizon ' + h + ' ignored.');
          break;
        }

        depth += lThicknessCm;

        var soilParameters = new SoilParameters();

        soilParameters.set_vs_SoilOrganicMatter(horizon.organicMatter);
        soilParameters.vs_SoilSandContent = horizon.sand;
        soilParameters.vs_SoilClayContent = horizon.clay;
        soilParameters.vs_SoilStoneContent = horizon.sceleton;
        soilParameters.vs_SoilpH = horizon.pH;
        soilParameters.vs_SoilTexture = tools.texture2KA5(horizon.sand, horizon.clay);
        soilParameters.vs_Lambda = tools.texture2lambda(soilParameters.vs_SoilSandContent, soilParameters.vs_SoilClayContent);

        /* optional parameters */
        soilParameters.vs_SoilpH = getValue(horizon, 'pH', 6.9);

        /* set wilting point, saturation & field capacity */
        if ( horizon.hasOwnProperty('poreVolume') && horizon.poreVolume != null
          && horizon.hasOwnProperty('fieldCapacity') && horizon.fieldCapacity != null
          && horizon.hasOwnProperty('permanentWiltingPoint') && horizon.permanentWiltingPoint != null
          && horizon.hasOwnProperty('bulkDensity') && horizon.bulkDensity != null) { /* if all soil properties are available */

          soilParameters.set_vs_SoilBulkDensity(horizon.bulkDensity);
          soilParameters.vs_FieldCapacity = horizon.fieldCapacity;
          soilParameters.vs_Saturation = horizon.poreVolume - horizon.fieldCapacity;
          soilParameters.vs_PermanentWiltingPoint = horizon.permanentWiltingPoint;

        } else { /* if any is missing */

          /* if density class according to KA5 is available (trockenrohdichte-klassifikation) TODO: add ld_class to JSON cfg */
          // soilParameters.set_vs_SoilRawDensity(tools.ld_eff2trd(3 /*ld_class*/, horizon.clay));
          // tools.soilCharacteristicsKA5(soilParameters);

          /* else use Saxton */
          var saxton = tools.saxton(horizon.sand, horizon.clay, horizon.organicMatter, horizon.sceleton).saxton_86;
          soilParameters.set_vs_SoilBulkDensity(roundN(2, saxton.BD));
          soilParameters.vs_FieldCapacity = roundN(2, saxton.FC);
          soilParameters.vs_Saturation = roundN(2, saxton.SAT);
          soilParameters.vs_PermanentWiltingPoint = roundN(2, saxton.PWP);

        }
        
        /* TODO: hinter readJSON verschieben */ 
        if (!soilParameters.isValid()) {
          ok = false;
          logger(MSG.ERROR, 'Error in soil parameters.');
        }

        layers.push(soilParameters);
        logger(MSG.INFO, 'Fetched layer ' + layers.length + ' in horizon ' + h + '.');

      }

      logger(MSG.INFO, 'Fetched horizon ' + h + '.');
    }  

    return ok;
  }


  function createProcesses(cropRotation, crops, startDate) {
    
    var ok = true;
    var cs = crops.length;
    
    logger(MSG.INFO, 'Fetching ' + cs + ' crops.');

    for (var c = 0; c < cs; c++) {

      var crop = crops[c];
      var isGrassland = (crop.name === 'grassland');
      var isPermanentGrassland = (isGrassland && cs === 1);

      if (isGrassland) {
        /* we can not start at day 0 and therefor start at day 0 + 2 since model's general step is executed *after* cropStep */
        var sd_ = new Date(startDate.toISOString());
        sd_.setDate(sd_.getDate() + 2);
        var sd = getValue(crop, 'sowingDate', sd_);
        var hds = getValue(crop, 'harvestDates', []);
      } else {
        var sd = new Date(Date.parse(crop.sowingDate));
        var hd = new Date(Date.parse(crop.finalHarvestDate));
        if (!sd.isValid() || !hd.isValid()) {
          ok = false;
          logger(MSG.ERROR, 'Invalid sowing or harvest date in ' + crop.name);
        }
      }

      if (isGrassland) {

        var grass = new Grass(sd, hds, crop.species);
        cropRotation[c] = new ProductionProcess('grassland', grass);

      } else {

        var fieldcrop = new FieldCrop(crop.name);
        fieldcrop.setSeedAndHarvestDate(sd, hd);
        cropRotation[c] = new ProductionProcess(crop.name, fieldcrop);
      
      }


      /* tillage */
      var tillageOperations = crop.tillageOperations;
      if (tillageOperations) { /* in case no tillage has been added */
        if (!addTillageOperations(cropRotation[c], tillageOperations)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding tillages.');
        }
      }

      /* mineral fertilizer */
      var mineralFertilisers = crop.mineralFertilisers;
      if (mineralFertilisers) { /* in case no min fertilizer has been added */
        if (!addFertilizers(cropRotation[c], mineralFertilisers, false)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding mineral fertilisers.');
        }
      }

      /* organic fertilizer */ 
      var organicFertilisers = crop.organicFertilisers;
      if (organicFertilisers) { /* in case no org fertilizer has been added */ 
        if (!addFertilizers(cropRotation[c], organicFertilisers, true)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding organic fertilisers.');
        }
      }

      /* irrigations */
      var irrigations = crop.irrigations;
      if (irrigations) {  /* in case no irrigation has been added */
        if (!addIrrigations(cropRotation[c], irrigations)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding irrigations.');
        }
      }

      /* cutting */
      var cuttings = crop.cuttings;
      if (cuttings) { /* in case no tillage has been added */
        if (!addCuttings(cropRotation[c], cuttings)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding cuttings.');
        }
      }

      logger(MSG.INFO, 'Fetched crop ' + c + ': ' + crop.name);

    }

    return ok;
  }


  function addTillageOperations(productionProcess, tillageOperations) {

    var ok = true;
    var ts = tillageOperations.length;

    logger(MSG.INFO, 'Fetching ' + ts + ' tillages.');

    for (var t = 0; t < ts; ++t) {

      var till = tillageOperations[t];

      /* ignore if any value is null */
      if (till.date === null || till.depth === null || till.method === null) {
        logger(MSG.WARN, 'At least one tillage parameter null: tillage ' + t + ' ignored.');
        continue;
      }

      var tDate = new Date(Date.parse(till.date));
      var depth = till.depth / 100; // cm to m
      var method = till.method;

      if (!tDate.isValid()) {
        ok = false;
        logger(MSG.ERROR, 'Invalid tillage date in tillage no. ' + t + '.');
      }

      productionProcess.addApplication(new TillageApplication(tDate, depth));

      logger(MSG.INFO, 'Fetched tillage ' + t + '.');

    }

    return ok;
  }


  function addFertilizers(productionProcess, fertilizers, isOrganic) {
    // TODO: implement in JS
    /*
    //get data parsed and to use leap years if the crop rotation uses them
    Date fDateate = parseDate(sfDateate).toDate(it->crop()->seedDate().useLeapYears());

    if (!fDateate.isValid())
    {
      debug() << 'Error - Invalid date in \'' << pathToFile << '\'' << endl;
      debug() << 'Line: ' << s << endl;
      ok = false;
    }

   //if the currently read fertiliser date is after the current end
    //of the crop, move as long through the crop rotation as
    //we find an end date that lies after the currently read fertiliser date
    while (fDateate > currentEnd)
    {
      //move to next crop and possibly exit at the end
      it++;
      if (it == cr.end())
        break;

      currentEnd = it->end();

      //cout << 'new PP start: ' << it->start().toString()
      //<< ' new PP end: ' << it->end().toString() << endl;
      //cout << 'new currentEnd: ' << currentEnd.toString() << endl;
    }
    */
    var ok = true;
    var fs = fertilizers.length;

    logger(MSG.INFO, 'Fetching ' + fs + ' ' + (isOrganic ? 'organic' : 'mineral') + ' fertilisers.');

    for (var f = 0; f < fs; ++f) {
      
      var fertilizer = fertilizers[f];

      /* ignore if any value is null */
      if (fertilizer.date === null || fertilizer.method === null || fertilizer.amount === null) {
        logger(MSG.WARN, 'At least one fertiliser parameter null: ' + (isOrganic ? 'organic' : 'mineral') + ' fertiliser ' + f + 'ignored.');
        continue;
      }

      var fDate = new Date(Date.parse(fertilizer.date))
        , method = fertilizer.method
        , name = fertilizer.name // changed from id to name
        , amount = fertilizer.amount // [kg (N) ha-1]
        , carbamid = fertilizer.carbamid
        , no3 = fertilizer.no3
        , nh4 = fertilizer.nh4
        , dm = fertilizer.dm
        ;

      if (!fDate.isValid()) {
        ok = false;
        logger(MSG.ERROR, 'Invalid fertilization date in ' + f + '.');
      }

      if (isOrganic)
        productionProcess.addApplication(new OrganicFertiliserApplication(fDate, new OrganicFertilizer(name, carbamid, no3, nh4, dm), amount, true));
      else
        productionProcess.addApplication(new MineralFertiliserApplication(fDate, new MineralFertilizer(name, carbamid, no3, nh4), amount));

      logger(MSG.INFO, 'Fetched ' + (isOrganic ? 'organic' : 'mineral') + ' fertiliser ' + f + '.');

    }
     
    return ok; 
  }


  function addIrrigations(productionProcess, irrigations) {
    
    var ok = true;

    // TODO: implement in JS
    //get data parsed and to use leap years if the crop rotation uses them
    /*Date idate = parseDate(irrDate).toDate(it->crop()->seedDate().useLeapYears());
    if (!idate.isValid())
    {
      debug() << 'Error - Invalid date in \'' << pathToFile << '\'' << endl;
      debug() << 'Line: ' << s << endl;
      debug() << 'Aborting simulation now!' << endl;
      exit(-1);
    }

    //cout << 'PP start: ' << it->start().toString()
    //<< ' PP end: ' << it->end().toString() << endl;
    //cout << 'irrigationDate: ' << idate.toString()
    //<< ' currentEnd: ' << currentEnd.toString() << endl;

    //if the currently read irrigation date is after the current end
    //of the crop, move as long through the crop rotation as
    //we find an end date that lies after the currently read irrigation date
    while (idate > currentEnd)
    {
      //move to next crop and possibly exit at the end
      it++;
      if (it == cr.end())
        break;

      currentEnd = it->end();

      //cout << 'new PP start: ' << it->start().toString()
      //<< ' new PP end: ' << it->end().toString() << endl;
      //cout << 'new currentEnd: ' << currentEnd.toString() << endl;
    }*/

    var is = irrigations.length;
    
    logger(MSG.INFO, 'Fetching ' + is + ' irrigations.');

    for (var i = 0; i < is; ++i) {
      
      var irrigation = irrigations[i];

      /* ignore if any value is null */
      if (irrigation.date === null || irrigation.method  === null || irrigation.eventType  === null || irrigation.threshold  === null
          || irrigation.amount === null || irrigation.NConc === null) {
        logger(MSG.WARN, 'At least one irrigation parameter null: irrigation ' + i + ' ignored.');
        continue;
      }

      var method = irrigation.method;
      var eventType = irrigation.eventType;
      var threshold = irrigation.threshold;
      var area = irrigation.area;
      var amount = irrigation.amount;
      var NConc = irrigation.NConc;
      var iDate = new Date(Date.parse(irrigation.date));

      if (!iDate.isValid()) {
        ok = false;
        logger(MSG.ERROR, 'Invalid irrigation date in ' + i + '.');
      }

      productionProcess.addApplication(new IrrigationApplication(iDate, amount, new IrrigationParameters(NConc, 0.0)));

      logger(MSG.INFO, 'Fetched irrigation ' + i + '.');

    }

    return ok;
  };

  /*
    JV: test new function
  */

  // function addCuttings(productionProcess, cutArr) {

  //   var ok = true;
  //   var cs = cutArr.length;

  //   logger(MSG.INFO, 'Fetching ' + cs + ' cuttings.');

  //   for (var c = 0; c < cs; ++c) {
  //     var cutObj = cutArr[c];
  //     var cDate = new Date(Date.parse(cutObj.date));
  //     pp.addApplication(new Cutting(cDate, pp.crop(), pp.cropResult()));
  //   }

  //   return ok;
  // };


  function createClimate(da, weatherInput) {

    var ok = false;
    var data = [];

    data[WEATHER.TMIN] = new Float64Array(weatherInput.tmin);                  /* [°C] */
    data[WEATHER.TMAX] = new Float64Array(weatherInput.tmax);                  /* [°C] */
    data[WEATHER.TAVG] = new Float64Array(weatherInput.tavg);                  /* [°C] */
    data[WEATHER.GLOBRAD] = new Float64Array(weatherInput.globrad);            /* [MJ m-2] */
    data[WEATHER.EXRAD] = new Float64Array(weatherInput.exrad);                /* [MJ m-2] */
    data[WEATHER.WIND] = new Float64Array(weatherInput.wind);                  /* [m s-1] */
    data[WEATHER.PRECIP] = new Float64Array(weatherInput.precip);              /* [mm] */

    /* required for grassland model */
    data[WEATHER.DAYLENGTH] = new Float64Array(weatherInput.daylength);        /* [h] */
    data[WEATHER.F_DIRECTRAD] = new Float64Array(weatherInput.f_directrad);    /* [h h-1] fraction direct solar radiation */

    data[WEATHER.SUNHOURS] = new Float64Array(weatherInput.sunhours);          /* [h] */
    data[WEATHER.RELHUMID] = new Float64Array(weatherInput.relhumid);          /* [%] */

    data[WEATHER.DOY] = weatherInput.doy;
    data[WEATHER.ISODATESTRING] = weatherInput.date;

    da.setData(data);
  
    /* TODO: add additional checks */
    ok = true;

    return ok;

  };

  var defaultCallback = function (dayOfSimulation, date, model) {

    var progress = {};

    /* if both null we are done */
    if (!date && !model) {
      progress = null;
    } else {

      // var isCropPlanted = model.isCropPlanted()
      //   , mcg = model.cropGrowth()
      //   , mst = model.soilTemperature()
      //   , msm = model.soilMoisture()
      //   , mso = model.soilOrganic()
      //   , msc = model.soilColumn()
      //   /* TODO: (from cpp) work-around. Hier muss was eleganteres hin! */
      //   , msa = model.soilColumnNC()
      //   , msq = model.soilTransport()
      //   ;

      // progress = {
      //     date: { value: date.toISOString(), unit: '[date]' }
      //   , CropName: { value: isCropPlanted ? mcg.get_CropName() : '', unit: '-' }
      //   , TranspirationDeficit: { value: isCropPlanted ? mcg.get_TranspirationDeficit() : 0, unit: '[0;1]' }
      //   , ActualTranspiration: { value: isCropPlanted ? mcg.get_ActualTranspiration() : 0, unit: '[mm]' } 
      //   , CropNRedux: { value: isCropPlanted ? mcg.get_CropNRedux() : 0, unit: '[0;1]' }
      //   , HeatStressRedux: { value: isCropPlanted ? mcg.get_HeatStressRedux() : 0, unit: '[0;1]' }
      //   , OxygenDeficit: { value: isCropPlanted ? mcg.get_OxygenDeficit() : 0, unit: '[0;1]' }
      //   , DevelopmentalStage: { value: isCropPlanted ? mcg.get_DevelopmentalStage() + 1 : 0, unit: '[#]' }
      //   , CurrentTemperatureSum: { value: isCropPlanted ? mcg.get_CurrentTemperatureSum() : 0, unit: '°C' }
      //   , VernalisationFactor: { value: isCropPlanted ? mcg.get_VernalisationFactor() : 0, unit: '[0;1]' }
      //   , DaylengthFactor: { value: isCropPlanted ? mcg.get_DaylengthFactor() : 0, unit: '[0;1]' }
      //   , OrganGrowthIncrementRoot: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(0) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganGrowthIncrementLeaf: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(1) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganGrowthIncrementShoot: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(2) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganGrowthIncrementFruit: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(3) : 0, unit: '[kg (DM) ha-1]' }
      //   , RelativeTotalDevelopment: { value: isCropPlanted ? mcg.get_RelativeTotalDevelopment() : 0, unit: '[0;1]' }
      //   , OrganBiomassRoot: { value: isCropPlanted ? mcg.get_OrganBiomass(0) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganBiomassLeaf: { value: isCropPlanted ? mcg.get_OrganBiomass(1) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganBiomassShoot: { value: isCropPlanted ? mcg.get_OrganBiomass(2) : 0, unit: '[kg (DM) ha-1]' }
      //   , OrganBiomassFruit: { value: isCropPlanted ? mcg.get_OrganBiomass(3) : 0, unit: '[kg (DM) ha-1]' }
      //   , PrimaryCropYield: { value: isCropPlanted ? mcg.get_PrimaryCropYield() : 0, unit: '[kg (DM) ha-1]' }
      //   , LeafAreaIndex: { value:  isCropPlanted ? mcg.get_LeafAreaIndex() : 0, unit: '[m-2 m-2]' }
      //   , GrossPhotosynthesisHaRate: { value: isCropPlanted ? mcg.get_GrossPhotosynthesisHaRate() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
      //   , NetPhotosynthesis: { value: isCropPlanted ? mcg.get_NetPhotosynthesis() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
      //   , MaintenanceRespirationAS: { value: isCropPlanted ? mcg.get_MaintenanceRespirationAS() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
      //   , GrowthRespirationAS: { value: isCropPlanted ? mcg.get_GrowthRespirationAS() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
      //   , StomataResistance: { value: isCropPlanted ? mcg.get_StomataResistance() : 0, unit: '[s m-1]' }
      //   , CropHeight: { value: isCropPlanted ? mcg.get_CropHeight() : 0, unit: '[m]' }
      //   , LeafAreaIndex: { value: isCropPlanted ? mcg.get_LeafAreaIndex() : 0, unit: '[m2 m-2]' }
      //   , RootingDepth: { value: isCropPlanted ? mcg.get_RootingDepth() : 0, unit: '[layer #]' }
      //   , AbovegroundBiomass: { value: isCropPlanted ? mcg.get_AbovegroundBiomass() : 0, unit: '[kg ha-1]' }
      //   , TotalBiomassNContent: { value: isCropPlanted ? mcg.get_TotalBiomassNContent() : 0, unit: '[?]' }
      //   , SumTotalNUptake: { value: isCropPlanted ? mcg.get_SumTotalNUptake() : 0, unit: '[kg (N) ha-1]' }
      //   , ActNUptake: { value: isCropPlanted ? mcg.get_ActNUptake() : 0, unit: '[kg (N) ha-1]' }
      //   , PotNUptake: { value: isCropPlanted ? mcg.get_PotNUptake() : 0, unit: '[kg (N) ha-1]' }
      //   , TargetNConcentration: { value: isCropPlanted ? mcg.get_TargetNConcentration() : 0, unit: '[kg (N) ha-1]' }
      //   , CriticalNConcentration: { value: isCropPlanted ? mcg.get_CriticalNConcentration() : 0, unit: '[kg (N) ha-1]' }
      //   , AbovegroundBiomassNConcentration: { value: isCropPlanted ? mcg.get_AbovegroundBiomassNConcentration() : 0, unit: '[kg (N) ha-1]' }
      //   , NetPrimaryProduction: { value: isCropPlanted ? mcg.get_NetPrimaryProduction() : 0, unit: '[kg (N) ha-1]' }
      //   , GrossPrimaryProduction: { value: isCropPlanted ? mcg.get_GrossPrimaryProduction() : 0, unit: '[kg (N) ha-1]' }
      //   , AutotrophicRespiration: { value: isCropPlanted ? mcg.get_AutotrophicRespiration() : 0, unit: '[kg (C) ha-1]' }
      // };

      // var outLayers = 20;

      // for (var i_Layer = 0; i_Layer < outLayers; i_Layer++)
      //   progress['SoilMoisture_' + i_Layer] = { value: msm.get_SoilMoisture(i_Layer), unit: '[m-3 m-3]' };

      // progress['dailySumIrrigationWater'] = { value: model.dailySumIrrigationWater(), unit: '[mm]' };
      // progress['Infiltration'] = { value: msm.get_Infiltration(), unit: '[mm]' };
      // progress['SurfaceWaterStorage'] = { value: msm.get_SurfaceWaterStorage(), unit: '[mm]' };
      // progress['SurfaceRunOff'] = { value: msm.get_SurfaceRunOff(), unit: '[mm]' };
      // progress['SnowDepth'] = { value: msm.get_SnowDepth(), unit: '[mm]' }; 
      // progress['FrostDepth'] = { value: msm.get_FrostDepth(), unit: '[mm]' };
      // progress['ThawDepth'] = { value: msm.get_ThawDepth(), unit: '[mm]' };

      // for (var i_Layer = 0; i_Layer < outLayers; i_Layer++)
      //  progress['PASW_' + i_Layer] = { value: msm.get_SoilMoisture(i_Layer) - msa[i_Layer].get_PermanentWiltingPoint(), unit: '[m-3 m-3]' };

      // progress['SoilSurfaceTemperature'] = { value: mst.get_SoilSurfaceTemperature(), unit: '[°C]' };

      // for(var i_Layer = 0; i_Layer < 5; i_Layer++)
      //   progress['SoilTemperature_' + i_Layer] = { value: mst.get_SoilTemperature(i_Layer), unit: '[°C]' };

      // progress['ActualEvaporation'] = { value: msm.get_ActualEvaporation(), unit: '[mm]' };
      // progress['Evapotranspiration'] = { value: msm.get_Evapotranspiration(), unit: '[mm]' };
      // progress['ET0'] = { value: msm.get_ET0(), unit: '[mm]' };
      // progress['KcFactor'] = { value: msm.get_KcFactor(), unit: '[?]' };
      // progress['AtmosphericCO2Concentration'] = { value: model.get_AtmosphericCO2Concentration(), unit: '[ppm]' };
      // progress['GroundwaterDepth'] = { value: model.get_GroundwaterDepth(), unit: '[m]' };
      // progress['GroundwaterRecharge'] = { value: msm.get_GroundwaterRecharge(), unit: '[mm]' };
      // progress['NLeaching'] = { value: msq.get_NLeaching(), unit: '[kg (N) ha-1]' };

      // for(var i_Layer = 0; i_Layer < outLayers; i_Layer++)
      //   progress['SoilNO3_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNO3(), unit: '[kg (N) m-3]' };

      // progress['SoilCarbamid'] = { value: msc.soilLayer(0).get_SoilCarbamid(), unit: '[kg (N) m-3]' };

      // for(var i_Layer = 0; i_Layer < outLayers; i_Layer++)
      //   progress['SoilNH4_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNH4(), unit: '[kg (N) m-3]' };

      // for(var i_Layer = 0; i_Layer < 4; i_Layer++)
      //   progress['SoilNO2_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNO2(), unit: '[kg (N) m-3]' };

      // for(var i_Layer = 0; i_Layer < 6; i_Layer++)
      //   progress['SoilOrganicCarbon_' + i_Layer] = { value: msc.soilLayer(i_Layer).vs_SoilOrganicCarbon(), unit: '[kg (C) kg-1]' };

    }
  
    if (ENVIRONMENT_IS_WORKER)
      postMessage({ progress: progress });
    else
      if (progress === null) logger(MSG.INFO, 'done');
  
  };  

  return {
    run: run 
  };


};
