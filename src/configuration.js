/*
  weatherData = {                   object
      startDate     [date string]   date of index 0
    , tmin          [°C]            (mandatory) array, daily minimum temperature
    , tmax          [°C]            (mandatory) array, daily maximum temperature
    , tavg          [°C]            (optional)  array, daily average temperature
    , globrad       [MJ m-2]        (optional)  array, global radiation
    , exrad         [MJ m-2]        (optional)  array, extraterrestrial radiation
    , wind          [m s-1]         (optional)  array, wind speed
    , precip        [mm]            (mandatory) array, rainfall
    , sunhours      [h]             (optional)  array, sunshine hours
    , relhumid      [%]             (optional)  array, relative humidity
    , daylength     [h]             (optional)  array, daylength. required by grassland model
    , f_directrad   [h h-1]         (optional)  array, fraction direct solar radiation. required by grassland model
    , date          [date string]   (optional)  array, ISO date strings (if not provided assume that date @ index 0 = sim.startDate)
    , doy           [#]             (optional)  array, day of year
  }
  doDebug           [bool]          (mandatory) debug model and print MSG_DEBUG output
  isVerbose         [bool]          (mandatory) print MSG_INFO output
  callbacks         [array]         (optional)  function or array of functions, access model variables at each time step 
                                    (write an output file, change model variables etc.)
  TODO:
    - add option initialization runs
    - integrate weather.js
*/

var Configuration = function (weatherData, doDebug, isVerbose, callbacks) {

  DEBUG = (doDebug === true) ? true : false;
  VERBOSE = (isVerbose === true) ? true : false; 

  if (typeof callbacks === 'function')
    callbacks = [callbacks];    
  else if (!Array.isArray(callbacks) || callbacks.length === 0)
    callbacks = [defaultCallback]; /* set to default if arg not provided */

  // var pathToOutputDir = '.';
  var models = null
    , noModels = 0
    ;

  /*
    input is an object with sim, prod and site properties or an array of site and prod objects

    sim = { ... }             simulation settings
    
    siteAndProd = {           obj
      site: { ... },          site, location
      production: { ... }     crop rotation
    }

      or

    siteAndProd = [{          array of objs
      site: { ... },          site 1, location
      production: { ... }     crop rotation 1
    }, {   
      site: { ... },          site n, location
      production: { ... }     crop rotation n
    }, ...]

  */

  var run = function (sim, siteAndProd) {

    var startDate = new Date(sim.time.startDate);
    var endDate = new Date(sim.time.endDate);

    if (!Array.isArray(siteAndProd))
      siteAndProd = [siteAndProd];

    noModels = siteAndProd.length;

    /* weather */
    var weather = new Weather(startDate, endDate);
    if (!createWeather(weather, siteAndProd[0].site.latitude, weatherData)) {
      logger(MSG_ERROR, 'Error fetching weather data.');
      return;
    }
    
    logger(MSG_INFO, 'Fetched weather data.');

    models = new ModelCollection(weather);

    for (var sp = 0, sps = siteAndProd.length; sp < sps; sp++) {

      logger(MSG_INFO, 'Fetching parameter for site ' + sp);
      
      var site = siteAndProd[sp].site;
      var prod = siteAndProd[sp].production;
      
      /* init parameters */
      var parameterProvider = new ParameterProvider();
      var siteParameters = new SiteParameters();
      var generalParameters = new GeneralParameters();

      /* sim */
      var startYear = startDate.getFullYear();
      var endYear = endDate.getFullYear();

      parameterProvider.userInitValues.p_initPercentageFC = getValue(sim.init, 'percentageFC', parameterProvider.userInitValues.p_initPercentageFC);
      parameterProvider.userInitValues.p_initSoilNitrate = getValue(sim.init, 'soilNitrate', parameterProvider.userInitValues.p_initSoilNitrate);
      parameterProvider.userInitValues.p_initSoilAmmonium = getValue(sim.init, 'soilAmmonium', parameterProvider.userInitValues.p_initSoilAmmonium);

      parameterProvider.userEnvironmentParameters.p_UseSecondaryYields = getValue(sim.switches, 'useSecondaryYieldOn', parameterProvider.userEnvironmentParameters.p_UseSecondaryYields);
      generalParameters.pc_NitrogenResponseOn = getValue(sim.switches, 'nitrogenResponseOn', generalParameters.pc_NitrogenResponseOn);
      generalParameters.pc_WaterDeficitResponseOn = getValue(sim.switches, 'waterDeficitResponseOn', generalParameters.pc_WaterDeficitResponseOn);
      generalParameters.pc_LowTemperatureStressResponseOn = getValue(sim.switches, 'lowTemperatureStressResponseOn', generalParameters.pc_LowTemperatureStressResponseOn);
      generalParameters.pc_HighTemperatureStressResponseOn = getValue(sim.switches, 'highTemperatureStressResponseOn', generalParameters.pc_HighTemperatureStressResponseOn);
      // unused
      // generalParameters.pc_EmergenceMoistureControlOn = getValue(sim.switches, 'emergenceMoistureControlOn', generalParameters.pc_EmergenceMoistureControlOn);
      // generalParameters.pc_EmergenceFloodingControlOn = getValue(sim.switches, 'emergenceFloodingControlOn', generalParameters.pc_EmergenceFloodingControlOn);
      
      generalParameters.ps_MaxMineralisationDepth = 0.4;

      logger(MSG_INFO, 'Fetched simulation data.');
      
      /* site */
      siteParameters.vs_Latitude = site.latitude;
      siteParameters.vs_Slope = site.slope;
      siteParameters.vs_HeightNN = site.heightNN;
      siteParameters.vq_NDeposition = getValue(site, 'NDeposition', siteParameters.vq_NDeposition);
      siteParameters.vs_Soil_CN_Ratio = 10; //TODO: per layer?
      siteParameters.vs_DrainageCoeff = -1; //TODO: ?

      parameterProvider.userEnvironmentParameters.p_AthmosphericCO2 = getValue(site, 'atmosphericCO2', parameterProvider.userEnvironmentParameters.p_AthmosphericCO2);
      parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepth = getValue(site, 'groundwaterDepthMin', parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepth);
      parameterProvider.userEnvironmentParameters.p_MaxGroundwaterDepth = getValue(site, 'groundwaterDepthMax', parameterProvider.userEnvironmentParameters.p_MaxGroundwaterDepth);
      parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepthMonth = getValue(site, 'groundwaterDepthMinMonth', parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepthMonth);
      parameterProvider.userEnvironmentParameters.p_WindSpeedHeight = getValue(site, 'windSpeedHeight', parameterProvider.userEnvironmentParameters.p_WindSpeedHeight);  
      parameterProvider.userEnvironmentParameters.p_LeachingDepth = getValue(site, 'leachingDepth', parameterProvider.userEnvironmentParameters.p_LeachingDepth);

      logger(MSG_INFO, 'Fetched site data.');

      /* soil */
      var lThicknessCm = 100.0 * parameterProvider.userEnvironmentParameters.p_LayerThickness;
      var maxDepthCm =  200.0;
      var maxNoOfLayers = toInt(maxDepthCm / lThicknessCm);

      var layers = [];
      if (!createLayers(layers, site.horizons, lThicknessCm, maxNoOfLayers)) {
        logger(MSG_ERROR, 'Error fetching soil data.');
        return;
      }
      
      logger(MSG_INFO, 'Fetched soil data.');

      /* crops */
      var cropRotation = [];
      if (!createProcesses(cropRotation, prod, startDate)) {
        logger(MSG_ERROR, 'Error fetching crop data.');
        return;
      }
      
      logger(MSG_INFO, 'Fetched crop data.');

      var env = new Environment(layers, parameterProvider);
      env.general = generalParameters;
      // env.pathToOutputDir = pathToOutputDir;
      // env.setMode(1); // JS! not implemented
      env.site = siteParameters;
      // env.da = da; // now in ModelCollection.weather
      env.cropRotation = cropRotation;
     
      // TODO: implement and test useAutomaticIrrigation & useNMinFertiliser
      // if (hermes_config->useNMinFertiliser()) {
      //   env.useNMinMineralFertilisingMethod = true;
      //   env.nMinUserParams = hermes_config->getNMinUserParameters();
      //   env.nMinFertiliserPartition = getMineralFertiliserParametersFromMonicaDB(hermes_config->getMineralFertiliserID());
      // }

      models.push(new Model(env));
    
    } // for each input
    
    logger(MSG_INFO, 'Start model run.');
    
    return models.run(callbacks);

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
    
    logger(MSG_INFO, 'Fetching ' + hs + ' horizons.');

    for (var h = 0; h < hs; ++h ) {
      
      var horizon = horizons[h];
      var hThicknessCm = horizon.thickness * 100;
      var lInHCount = toInt(round(hThicknessCm / lThicknessCm));

      /* fill all (maxNoOfLayers) layers if available horizons depth < lThicknessCm * maxNoOfLayers */
      if (h == (hs - 1) && (toInt(layers.length) + lInHCount) < maxNoOfLayers)
        lInHCount += maxNoOfLayers - layers.length - lInHCount;

      for (var l = 0; l < lInHCount; l++) {

        /* stop if we reach max. depth */
        if (depth === maxNoOfLayers * lThicknessCm) {
          logger(MSG_WARN, 'Maximum soil layer depth (' + (maxNoOfLayers * lThicknessCm) + ' cm) reached. Remaining layers in horizon ' + h + ' ignored.');
          break;
        }

        depth += lThicknessCm;

        var soilParameters = new SoilParameters();

        // soilParameters.set_vs_SoilOrganicCarbon(0.05);
        // soilParameters.set_vs_SoilBulkDensity(1400);
        // soilParameters.vs_SoilSandContent = 0.4;
        // soilParameters.vs_SoilClayContent = 0.2;
        // soilParameters.vs_SoilStoneContent = 0.02; //TODO: / 100 ?
        // soilParameters.vs_Lambda = tools.texture2lambda(soilParameters.vs_SoilSandContent, soilParameters.vs_SoilClayContent);
        // // TODO: Wo wird textureClass verwendet?
        // soilParameters.vs_SoilTexture = 'Ls2';
        // soilParameters.vs_SoilpH = 0.69;
        // /* TODO: ? lambda = drainage_coeff ? */
        // soilParameters.vs_Lambda = tools.texture2lambda(soilParameters.vs_SoilSandContent, soilParameters.vs_SoilClayContent);
        // soilParameters.vs_FieldCapacity = 0.33;
        // /* TODO: name? */
        // soilParameters.vs_Saturation = 0.45;
        // soilParameters.vs_PermanentWiltingPoint = 0.2;


        if (horizon.organicMatter) {
          soilParameters.set_vs_SoilOrganicMatter(getValue(horizon, 'organicMatter', -1));
        } else if (horizon.Corg) {
          soilParameters.set_vs_SoilOrganicCarbon(getValue(horizon, 'Corg', -1));         
        } else {
          soilParameters.set_vs_SoilOrganicCarbon(0.008);
        }
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
          soilParameters.vs_Saturation = horizon.poreVolume;
          soilParameters.vs_PermanentWiltingPoint = horizon.permanentWiltingPoint;

        } else { /* if any is missing */

          /* if density class according to KA5 is available (trockenrohdichte-klassifikation) TODO: add ld_class to JSON cfg */
          // soilParameters.set_vs_SoilRawDensity(tools.ld_eff2trd(3 /*ld_class*/, horizon.clay));
          // tools.soilCharacteristicsKA5(soilParameters);

          /* else use Saxton */
          var saxton = tools.saxton(horizon.sand, horizon.clay, soilParameters.vs_SoilOrganicMatter(), horizon.sceleton).saxton_86;
          soilParameters.set_vs_SoilBulkDensity(roundN(2, saxton.BD));
          soilParameters.vs_FieldCapacity = roundN(2, saxton.FC);
          soilParameters.vs_Saturation = roundN(2, saxton.SAT);
          soilParameters.vs_PermanentWiltingPoint = roundN(2, saxton.PWP);

        }

        // tools.soilCharacteristicsKA5(soilParameters);
        // console.log(soilParameters);
        
        /* TODO: hinter readJSON verschieben */ 
        if (!soilParameters.isValid()) {
          ok = false;
          logger(MSG_ERROR, 'Error in soil parameters.');
        }

        layers.push(soilParameters);
        logger(MSG_INFO, 'Fetched layer ' + layers.length + ' in horizon ' + h + '.');

      }

      logger(MSG_INFO, 'Fetched horizon ' + h + '.');
    }  

    return ok;
  }


  function createProcesses(cropRotation, production, startDate) {
    
    var ok = true,
        crops = production.crops,
        cs = crops.length,
        crop = null,
        isGrassland = false,
        isPermanentGrassland = false,
        sowingDate = null,
        harvestDate = null,
        grass = null,
        genericCrop = null;

    
    logger(MSG_INFO, 'Fetching ' + cs + ' crops.');

    for (var c = 0; c < cs; c++) {

      crop = crops[c];
      isGrassland = (crop.model === 'grassland');
      /* assume perm. grassland if there is only one crop in the rotation array and sowing date has not been specified */
      isPermanentGrassland = (isGrassland && cs === 1 && (crop.sowingDate === null || crop.sowingDate === undefined));

      if (isGrassland) {
        /* if no sowing date provided: we can not start at day 0 and therefor start at day 0 + 1 since model's general step is executed *after* cropStep */
        sowingDate = !crop.sowingDate ? new Date(new Date(startDate).setDate(startDate.getDate() + 1)) : new Date(Date.parse(crop.sowingDate));
      } else {
        sowingDate = new Date(Date.parse(crop.sowingDate));
        harvestDate = new Date(Date.parse(crop.finalHarvestDate));
        if (!sowingDate.isValid() || !harvestDate.isValid()) {
          ok = false;
          logger(MSG_ERROR, 'Invalid sowing or harvest date in ' + crop.species[0].name);
        }
      }

      if (isGrassland) {

        /* harvestDate unused. Use callback for grassland harvests */
        grass = new Grass(
          sowingDate, 
          [], 
          crop.species,
          crop.plantDryWeight, 
          !!crop.autoIrrigationOn || false
        );
        cropRotation[c] = new ProductionProcess('grassland', grass);

      } else {
        /* choose the first (and only) name in species array (mixtures not implemented in generic crop model) */
        genericCrop = new GenericCrop(
          crop.species[0].name,
          crop.plantDryWeight, 
          !!crop.autoIrrigationOn || false,
          crop.species[0].options || {}
        );
        genericCrop.setSeedAndHarvestDate(sowingDate, harvestDate);
        cropRotation[c] = new ProductionProcess(crop.species[0].name, genericCrop);
      
      }

      /* tillage */
      var tillageOperations = crop.tillageOperations;
      if (tillageOperations) { /* in case no tillage has been added */
        if (!addTillageOperations(cropRotation[c], tillageOperations)) {
          ok = false;
          logger(MSG_ERROR, 'Error adding tillages.');
        }
      }

      /* mineral fertilizer */
      var mineralFertilisers = crop.mineralFertilisers;
      if (mineralFertilisers) { /* in case no min fertilizer has been added */
        if (!addFertilizers(cropRotation[c], mineralFertilisers, false)) {
          ok = false;
          logger(MSG_ERROR, 'Error adding mineral fertilisers.');
        }
      }

      /* organic fertilizer */ 
      var organicFertilisers = crop.organicFertilisers;
      if (organicFertilisers) { /* in case no org fertilizer has been added */ 
        if (!addFertilizers(cropRotation[c], organicFertilisers, true)) {
          ok = false;
          logger(MSG_ERROR, 'Error adding organic fertilisers.');
        }
      }

      /* irrigations */
      var irrigations = crop.irrigations;
      if (irrigations) {  /* in case no irrigation has been added */
        if (!addIrrigations(cropRotation[c], irrigations)) {
          ok = false;
          logger(MSG_ERROR, 'Error adding irrigations.');
        }
      }

      /* cutting */
      var cuttings = crop.cuttings;
      if (cuttings) { /* in case no tillage has been added */
        if (!addCuttings(cropRotation[c], cuttings)) {
          ok = false;
          logger(MSG_ERROR, 'Error adding cuttings.');
        }
      }

      logger(MSG_INFO, 'Fetched crop ' + c + ': ' + JSON.stringify(crop.species, null, 2));

    }

    return ok;
  }


  function addTillageOperations(productionProcess, tillageOperations) {

    var ok = true;
    var ts = tillageOperations.length;

    logger(MSG_INFO, 'Fetching ' + ts + ' tillages.');

    for (var t = 0; t < ts; ++t) {

      var till = tillageOperations[t];

      /* ignore if any value is null */
      if (till.date === null || till.depth === null || till.method === null) {
        logger(MSG_WARN, 'At least one tillage parameter null: tillage ' + t + ' ignored.');
        continue;
      }

      var tDate = new Date(Date.parse(till.date));
      var depth = till.depth / 100; // cm to m
      var method = till.method;

      if (!tDate.isValid()) {
        ok = false;
        logger(MSG_ERROR, 'Invalid tillage date in tillage no. ' + t + '.');
      }

      productionProcess.addApplication(new TillageApplication(tDate, depth));

      logger(MSG_INFO, 'Fetched tillage ' + t + '.');

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

    logger(MSG_INFO, 'Fetching ' + fs + ' ' + (isOrganic ? 'organic' : 'mineral') + ' fertilisers.');

    for (var f = 0; f < fs; ++f) {
      
      var fertilizer = fertilizers[f];

      /* ignore if any value is null */
      if (fertilizer.date === null || fertilizer.method === null || fertilizer.amount === null) {
        logger(MSG_WARN, 'At least one fertiliser parameter null: ' + (isOrganic ? 'organic' : 'mineral') + ' fertiliser ' + f + 'ignored.');
        continue;
      }

      var fDate = new Date(Date.parse(fertilizer.date))
        , method = fertilizer.method
        , name = fertilizer.name // changed from id to name
        , amount = fertilizer.amount // [kg (FM) ha-1]
        , carbamid = fertilizer.carbamid
        , no3 = fertilizer.no3
        , nh4 = fertilizer.nh4
        , dm = fertilizer.dm
        ;

      if (!fDate.isValid()) {
        ok = false;
        logger(MSG_ERROR, 'Invalid fertilization date in ' + f + '.');
      }

      if (isOrganic)
        productionProcess.addApplication(new OrganicFertiliserApplication(fDate, new OrganicFertilizer(name, carbamid, no3, nh4, dm), amount, true));
      else
        productionProcess.addApplication(new MineralFertiliserApplication(fDate, new MineralFertilizer(name, carbamid, no3, nh4), amount));

      logger(MSG_INFO, 'Fetched ' + (isOrganic ? 'organic' : 'mineral') + ' fertiliser ' + f + '.');

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
    
    logger(MSG_INFO, 'Fetching ' + is + ' irrigations.');

    for (var i = 0; i < is; ++i) {
      
      var irrigation = irrigations[i];

      /* ignore if any value is null */
      if (irrigation.date === null || irrigation.method  === null || irrigation.eventType  === null || irrigation.threshold  === null
          || irrigation.amount === null || irrigation.NConc === null) {
        logger(MSG_WARN, 'At least one irrigation parameter null: irrigation ' + i + ' ignored.');
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
        logger(MSG_ERROR, 'Invalid irrigation date in ' + i + '.');
      }

      productionProcess.addApplication(new IrrigationApplication(iDate, amount, new IrrigationParameters(NConc, 0.0)));

      logger(MSG_INFO, 'Fetched irrigation ' + i + '.');

    }

    return ok;
  };

  /*
    JV: test new function
  */

  // function addCuttings(productionProcess, cutArr) {

  //   var ok = true;
  //   var cs = cutArr.length;

  //   logger(MSG_INFO, 'Fetching ' + cs + ' cuttings.');

  //   for (var c = 0; c < cs; ++c) {
  //     var cutObj = cutArr[c];
  //     var cDate = new Date(Date.parse(cutObj.date));
  //     pp.addApplication(new Cutting(cDate, pp.crop(), pp.cropResult()));
  //   }

  //   return ok;
  // };


  function createWeather(weather, latitude, input) {

    var ok = true,
        length = input.tmin.length,
        startDateString = input.startDate || weather.startDate().toISOString().substr(0, 10),
        data = [],
        calcData = null;

    data[WEATHER.TMIN] = new Float64Array(input.tmin); /* [°C] */
    data[WEATHER.TMAX] = new Float64Array(input.tmax); /* [°C] */
    data[WEATHER.PRECIP] = new Float64Array(input.precip); /* [mm] */

    /* optional */
    data[WEATHER.TAVG] = new Float64Array(input.tavg && input.tavg.length > 0 ? input.tavg : length); /* [°C] */
    data[WEATHER.GLOBRAD] = new Float64Array(input.globrad && input.globrad.length > 0 ? input.globrad : length); /* [MJ m-2] */
    data[WEATHER.WIND] = new Float64Array(input.wind && input.wind.length > 0 ? input.wind : length); /* [m s-1] */

    data[WEATHER.DAYLENGTH] = new Float64Array(input.daylength && input.daylength.length > 0 ? input.daylength : length); /* [h] */
    data[WEATHER.F_DIRECTRAD] = new Float64Array(input.f_directrad && input.f_directrad.length > 0 ? input.f_directrad : length); /* [h h-1] fraction direct solar radiation */
    data[WEATHER.EXRAD] = new Float64Array(input.exrad && input.exrad.length > 0 ? input.exrad : length); /* [MJ m-2] */

    data[WEATHER.SUNHOURS] = new Float64Array(input.sunhours && input.sunhours.length > 0 ? input.sunhours : length); /* [h] */
    data[WEATHER.RELHUMID] = new Float64Array(input.relhumid && input.relhumid.length > 0 ? input.relhumid : length); /* [%] */

    data[WEATHER.DOY] = input.doy;
    data[WEATHER.ISODATESTRING] = input.date;

    if (
        !input.globrad || input.globrad.length === 0 ||
        !input.daylength || input.daylength.length === 0 ||
        !input.f_directrad || input.f_directrad.length === 0 ||
        !input.exrad || input.exrad.length === 0 ||
        !input.sunhours || input.sunhours.length === 0
    ) {
      /* estimate missing values */
      calcData = tools.weather.solar(latitude, data[WEATHER.TMIN], data[WEATHER.TMAX], startDateString);
      
      if (!input.globrad || input.globrad.length === 0) {
        data[WEATHER.GLOBRAD] = new Float64Array(calcData.R_s);
      }
      if (!input.daylength || input.daylength.length === 0) {
        data[WEATHER.DAYLENGTH] = new Float64Array(calcData.N);
      }
      if (!input.f_directrad || input.f_directrad.length === 0) {
        data[WEATHER.F_DIRECTRAD] = new Float64Array(calcData.f_s);
      }
      if (!input.exrad || input.exrad.length === 0) {
        data[WEATHER.EXRAD] = new Float64Array(calcData.R_a);
      }
      if (!input.sunhours || input.sunhours.length === 0) {
        data[WEATHER.SUNHOURS] = new Float64Array(calcData.N);
      }
      if (!data[WEATHER.DOY] || data[WEATHER.DOY].length === 0) {
        data[WEATHER.DOY] = calcData.doy;
      }
      if (!data[WEATHER.ISODATESTRING] || data[WEATHER.ISODATESTRING].length === 0) {
        data[WEATHER.ISODATESTRING] = calcData.date;
      }
    }

    for (var i = 0; i < length; i++) {
      if (!input.tavg || input.tavg.length === 0) {
        data[WEATHER.TAVG][i] = (data[WEATHER.TMIN][i] + data[WEATHER.TMAX][i]) / 2;
      }
      if (!input.relhumid || input.relhumid.length === 0) {
        data[WEATHER.RELHUMID][i] = tools.weather.rh(data[WEATHER.TMIN][i], data[WEATHER.TMAX][i]);
      }
      if (!input.wind || input.wind.length === 0) {
        data[WEATHER.WIND][i] = 2;
      }
    }
    
    /* check if all arrays are of the same length */
    for (var i in WEATHER) { 
      if (data[WEATHER[i]].length != length) {
        logger(MSG_ERROR, i + ' length != ' + length);
        ok = false;
      }
    }
    
    if (ok)
      weather.setData(data);      

    /* TODO: add additional checks */

    return ok;

  };

  function defaultCallback(dayOfSimulation, dateString, models, done) {

    var results = [], result = null, model = null;

    if (!done) {

      for (var m = 0; m < noModels; m++) {

        model = models[m];
        var isCropPlanted = model.isCropPlanted()
          , mcg = model.cropGrowth()
          , mst = model.soilTemperature()
          , msm = model.soilMoisture()
          , mso = model.soilOrganic()
          , msc = model.soilColumn()
          , msa = model.soilColumnNC()
          , msq = model.soilTransport()
          ;

        result = {
            date: { value: dateString, unit: '[date]' }
          , CropName: { value: isCropPlanted ? mcg.name() : '', unit: '-' }
          , WaterStress: { value: isCropPlanted ? mcg.waterStress() : 0, unit: '[0;1]' }
          , Transpiration: { value: isCropPlanted ? mcg.transpiration() : 0, unit: '[mm]' } 
          , NitrogenStress: { value: isCropPlanted ? mcg.nitrogenStress() : 0, unit: '[0;1]' }
          , HeatStress: { value: isCropPlanted ? mcg.heatStress() : 0, unit: '[0;1]' }
          , OxygenStress: { value: isCropPlanted ? mcg.oxygenStress() : 0, unit: '[0;1]' }
          , DevelopmentalStage: { value: isCropPlanted ? mcg.developmentalStage() + 1 : 0, unit: '[#]' }
          , CurrentTemperatureSum: { value: isCropPlanted ? mcg.currentTemperatureSum() : 0, unit: '°C' }
          , GrowthIncrementRoot: { value: isCropPlanted ? mcg.growthIncrement(0) : 0, unit: '[kg (DM) ha-1]' }
          , GrowthIncrementLeaf: { value: isCropPlanted ? mcg.growthIncrement(1) : 0, unit: '[kg (DM) ha-1]' }
          , GrowthIncrementShoot: { value: isCropPlanted ? mcg.growthIncrement(2) : 0, unit: '[kg (DM) ha-1]' }
          , GrowthIncrementFruit: { value: isCropPlanted ? mcg.growthIncrement(3) : 0, unit: '[kg (DM) ha-1]' }
          , RelativeTotalDevelopment: { value: isCropPlanted ? mcg.relativeTotalDevelopment() : 0, unit: '[0;1]' }
          , BiomassRoot: { value: isCropPlanted ? mcg.biomass(0) : 0, unit: '[kg (DM) ha-1]' }
          , BiomassLeaf: { value: isCropPlanted ? mcg.biomass(1) : 0, unit: '[kg (DM) ha-1]' }
          , BiomassShoot: { value: isCropPlanted ? mcg.biomass(2) : 0, unit: '[kg (DM) ha-1]' }
          , BiomassFruit: { value: isCropPlanted ? mcg.biomass(3) : 0, unit: '[kg (DM) ha-1]' }
          , PrimaryYieldDryMatter: { value: isCropPlanted ? mcg.primaryYield() : 0, unit: '[kg (DM) ha-1]' }
          , LeafAreaIndex: { value:  isCropPlanted ? mcg.leafAreaIndex() : 0, unit: '[m-2 m-2]' }
          , NetPhotosynthesis: { value: isCropPlanted ? mcg.netPhotosynthate() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
          , StomataResistance: { value: isCropPlanted ? mcg.stomataResistance() : 0, unit: '[s m-1]' }
          , CropHeight: { value: isCropPlanted ? mcg.height() : 0, unit: '[m]' }
          , RootingDepth: { value: isCropPlanted ? mcg.rootingDepth() : 0, unit: '[layer #]' }
          , ShootBiomass: { value: isCropPlanted ? mcg.shootBiomass() : 0, unit: '[kg ha-1]' }
          , AccumulatedNitrogenUptake: { value: isCropPlanted ? mcg.accumulatedNitrogenUptake() : 0, unit: '[kg (N) m-2]' }
          , NitrogenUptake: { value: isCropPlanted ? mcg.nitrogenUptake() : 0, unit: '[kg (N)  m-2]' }
          , PotentialNitrogenUptake: { value: isCropPlanted ? mcg.potentialNitrogenUptake() : 0, unit: '[kg (N)  m-2]' }
          , ShootBiomassNitrogenConcentration: { value: isCropPlanted ? mcg.shootBiomassNitrogenConcentration() : 0, unit: '[kg (N) kg-1 (DM)]' }
          , NetPrimaryProduction: { value: isCropPlanted ? mcg.netPrimaryProduction() : 0, unit: '[kg (N) ha-1]' }
        };

        var outLayers = 20;

        for (var i_Layer = 0; i_Layer < outLayers; i_Layer++)
          result['SoilMoisture_' + i_Layer] = { value: msm.get_SoilMoisture(i_Layer), unit: '[m-3 m-3]' };

        result['dailySumIrrigationWater'] = { value: model.dailySumIrrigationWater(), unit: '[mm]' };
        result['Infiltration'] = { value: msm.get_Infiltration(), unit: '[mm]' };
        result['SurfaceWaterStorage'] = { value: msm.get_SurfaceWaterStorage(), unit: '[mm]' };
        result['SurfaceRunOff'] = { value: msm.get_SurfaceRunOff(), unit: '[mm]' };
        result['SnowDepth'] = { value: msm.get_SnowDepth(), unit: '[mm]' }; 
        result['FrostDepth'] = { value: msm.get_FrostDepth(), unit: '[mm]' };
        result['ThawDepth'] = { value: msm.get_ThawDepth(), unit: '[mm]' };

        for (var i_Layer = 0; i_Layer < outLayers; i_Layer++)
         result['PASW_' + i_Layer] = { value: msm.get_SoilMoisture(i_Layer) - msa[i_Layer].get_PermanentWiltingPoint(), unit: '[m-3 m-3]' };

        result['SoilSurfaceTemperature'] = { value: mst.get_SoilSurfaceTemperature(), unit: '[°C]' };

        for(var i_Layer = 0; i_Layer < 5; i_Layer++)
          result['SoilTemperature_' + i_Layer] = { value: mst.get_SoilTemperature(i_Layer), unit: '[°C]' };

        result['ActualEvaporation'] = { value: msm.get_ActualEvaporation(), unit: '[mm]' };
        result['Evapotranspiration'] = { value: msm.get_Evapotranspiration(), unit: '[mm]' };
        result['ET0'] = { value: msm.get_ET0(), unit: '[mm]' };
        result['KcFactor'] = { value: msm.get_KcFactor(), unit: '[?]' };
        result['AtmosphericCO2Concentration'] = { value: model.get_AtmosphericCO2Concentration(), unit: '[ppm]' };
        result['GroundwaterDepth'] = { value: model.get_GroundwaterDepth(), unit: '[m]' };
        result['GroundwaterRecharge'] = { value: msm.get_GroundwaterRecharge(), unit: '[mm]' };
        result['NLeaching'] = { value: msq.get_NLeaching(), unit: '[kg (N) ha-1]' };

        for(var i_Layer = 0; i_Layer < outLayers; i_Layer++)
          result['SoilNO3_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNO3(), unit: '[kg (N) m-3]' };

        result['SoilCarbamid'] = { value: msc.soilLayer(0).get_SoilCarbamid(), unit: '[kg (N) m-3]' };

        for(var i_Layer = 0; i_Layer < outLayers; i_Layer++)
          result['SoilNH4_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNH4(), unit: '[kg (N) m-3]' };

        for(var i_Layer = 0; i_Layer < 4; i_Layer++)
          result['SoilNO2_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNO2(), unit: '[kg (N) m-3]' };

        for(var i_Layer = 0; i_Layer < 6; i_Layer++)
          result['SoilOrganicCarbon_' + i_Layer] = { value: msc.soilLayer(i_Layer).vs_SoilOrganicCarbon(), unit: '[kg (C) kg-1]' };
        
        results.push(result);
      }
    }
  
    // TODO: add csv output
    if (ENVIRONMENT_IS_WORKER)
      postMessage({ results: results });
    else
      console.log(JSON.stringify(results, null, 2));

    if (done) {
      // if (ENVIRONMENT_IS_NODE) {
      //   fs.writeFileSync('results.csv', '');
      //   var keys = Object.keys(results[0]);
      //   for (var i = 0; i < results.length; i++) {
      //     var res = results[i];
      //     if (i === 0) {
      //       keys.forEach(function (e) {
      //         fs.appendFileSync('results.csv', e + ';');
      //       });
      //       fs.appendFileSync('results.csv', '\n');
      //     }
      //     keys.forEach(function (e) {
      //       fs.appendFileSync('results.csv', res[e].value + ';');
      //     });
      //     fs.appendFileSync('results.csv', '\n'); 
      //   }
      // }
      logger(MSG_INFO, 'done');
    }
  
  };  

  return {
    run: run 
  };


};
