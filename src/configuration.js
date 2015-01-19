
var Configuration = function (climate, doDebug) {

  DEBUG = (doDebug === true) ? true : false;

  var run = function run(simInput, siteInput, prodInput) {

    logger(MSG.INFO, 'Fetching parameters.');
    
    /* init parameters */
    var parameterProvider = Object.create(ParameterProvider);
    var siteParameters = Object.create(SiteParameters);
    var generalParameters = Object.create(GeneralParameters);

    /* sim */
    var startYear = new Date(Date.parse(simInput.time.startDate)).getFullYear();
    var endYear = new Date(Date.parse(simInput.time.endDate)).getFullYear();

    parameterProvider.userEnvironmentParameters.p_UseSecondaryYields = simInput.switches.useSecondaryYieldOn;
    parameterProvider.userInitValues.p_initPercentageFC = simInput.init.percentageFC;
    parameterProvider.userInitValues.p_initSoilNitrate = simInput.init.soilNitrate;
    parameterProvider.userInitValues.p_initSoilAmmonium = simInput.init.soilAmmonium;

    generalParameters.pc_NitrogenResponseOn = simInput.switches.nitrogenResponseOn;
    generalParameters.pc_WaterDeficitResponseOn = simInput.switches.waterDeficitResponseOn;
    generalParameters.pc_EmergenceMoistureControlOn = simInput.switches.emergenceMoistureControlOn;
    generalParameters.pc_EmergenceFloodingControlOn = simInput.switches.emergenceFloodingControlOn;

    logger(MSG.INFO, 'Fetched sim data.');
    
    /* site */
    siteParameters.vq_NDeposition = siteInput.NDeposition;
    siteParameters.vs_Latitude = siteInput.latitude;
    siteParameters.vs_Slope = siteInput.slope;
    siteParameters.vs_HeightNN = siteInput.heightNN;

    parameterProvider.userEnvironmentParameters.p_AthmosphericCO2 = siteInput.atmosphericCO2;
    parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepth = siteInput.groundwaterDepthMin;
    parameterProvider.userEnvironmentParameters.p_MaxGroundwaterDepth = siteInput.groundwaterDepthMax;
    parameterProvider.userEnvironmentParameters.p_MinGroundwaterDepthMonth = siteInput.groundwaterDepthMinMonth;
    parameterProvider.userEnvironmentParameters.p_WindSpeedHeight = siteInput.windSpeedHeight;  
    parameterProvider.userEnvironmentParameters.p_LeachingDepth = siteInput.leachingDepth;

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
    var da = new DataAccessor(new Date(startYear, 0, 1), new Date(endYear, 11, 31));
    if (!createClimate(da, cpp, siteParameters.vs_Latitude)) {
      logger(MSG.ERROR, 'Error fetching climate data.');
      return;
    }
    
    logger(MSG.INFO, 'Fetched climate data.');

    /* crops */
    var cropRotation = [];
    if (!createProcesses(cropRotation, prodInput.crops)) {
      logger(MSG.ERROR, 'Error fetching crop data.');
      return;
    }
    
    logger(MSG.INFO, 'Fetched crop data.');

    var env = new Environment(layers, cpp);
    env.general = generalParameters;
    env.pathToOutputDir = _outPath;
    // env.setMode(1); // JS! not implemented
    env.site = sp;
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

    logger(MSG.INFO, 'Start monica model.');

    return runMonica(env, setProgress);
  };


  var createLayers = function createLayers(layers, horizons, lThicknessCm, maxNoOfLayers) {

    var ok = true;
    var hs = horizons.length;
    var depth = 0;
    
    logger(MSG.INFO, 'Fetching ' + hs + ' horizons.');

    for (var h = 0; h < hs; ++h ) {

      debug('lThicknessCm', lThicknessCm);
      debug('maxNoOfLayers', maxNoOfLayers);
      debug('depth', depth);
      
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

        var soilParameters = Object.create(SoilParameters);
        soilParameters.set_vs_SoilOrganicCarbon(horizon.Corg);
        soilParameters.set_vs_SoilBulkDensity(horizon.bulkDensity);
        soilParameters.vs_SoilSandContent = horizon.sand;
        soilParameters.vs_SoilClayContent = horizon.clay;
        soilParameters.vs_SoilStoneContent = horizon.sceleton;
        soilParameters.vs_Lambda = Tools.texture2lambda(soilParameters.vs_SoilSandContent, soilParameters.vs_SoilClayContent);
        soilParameters.vs_SoilTexture = horizon.textureClass;
        soilParameters.vs_SoilpH = horizon.pH;
        soilParameters.vs_FieldCapacity = horizon.fieldCapacity;
        soilParameters.vs_Saturation = horizon.poreVolume;
        soilParameters.vs_PermanentWiltingPoint = horizon.permanentWiltingPoint;

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
  };

  function createProcesses(cropRotation, crops) {
    
    var ok = true;
    var cs = crops.length;
    
    logger(MSG.INFO, 'Fetching ' + cs + ' crops.');

    for (var c = 0; c < cs; c++) {

      var crop = crops[c];
      var cropId = crop.name.id;

      if (!cropId || cropId < 0 || isNaN(cropId)) {
        ok = false;
        logger(MSG.ERROR, 'Invalid crop id: ' + cropId + '.');
      }

      var sd = new Date(Date.parse(crop.sowingDate));
      var hd = new Date(Date.parse(crop.finalHarvestDate));

      debug(sd, 'sd');
      debug(hd, 'hd');

      if (!sd.isValid() || !hd.isValid()) {
        ok = false;
        logger(MSG.ERROR, 'Invalid sowing or harvest date.');
      }

      var fieldcrop = new FieldCrop(crop.name.name);
      fieldcrop.setSeedAndHarvestDate(sd, hd);

      cropRotation[c] = new ProductionProcess(crop.name.name + ', ' + crop.name.gen_type, fieldcrop);

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
      var orgFertArr = crop.organicFertilisers;
      if (orgFertArr) { /* in case no org fertilizer has been added */ 
        if (!addFertilizers(cropRotation[c], orgFertArr, true)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding organic fertilisers.');
        }
      }

      /* irrigations */
      var irriArr = crop.irrigations;
      if (irriArr) {  /* in case no irrigation has been added */
        if (!addIrrigations(cropRotation[c], irriArr)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding irrigations.');
        }
      }

      /* cutting */
      var cutArr = crop.cuttings;
      if (cutArr) { /* in case no tillage has been added */
        if (!addCuttings(cropRotation[c], cutArr)) {
          ok = false;
          logger(MSG.ERROR, 'Error adding cuttings.');
        }
      }

      logger(MSG.INFO, 'Fetched crop ' + c + ', name: ' + crop.name.name + ', id: ' + cropId + '.');

    }

    return ok;
  };

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
  };

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
      if (fertilizer.date === null || fertilizer.method === null || fertilizer.type === null || fertilizer.amount === null) {
        logger(MSG.WARN, 'At least one fertiliser parameter null: ' + (isOrganic ? 'organic' : 'mineral') + ' fertiliser ' + f + 'ignored.');
        continue;
      }

      var fDate = new Date(Date.parse(fertilizer.date));
      var method = fertilizer.method;
      var name = fertilizer.name; // changed from id to name
      var amount = fertilizer.amount;

      if (!fDate.isValid()) {
        ok = false;
        logger(MSG.ERROR, 'Invalid fertilization date in ' + f + '.');
      }

      if (isOrganic)
        productionProcess.addApplication(new OrganicFertiliserApplication(fDate, new OrganicFertilizer(name), amount, true));
      else
        productionProcess.addApplication(new MineralFertiliserApplication(fDate, new MineralFertilizer(name), amount));

      logger(MSG.INFO, 'Fetched ' + (isOrganic ? 'organic' : 'mineral') + ' fertiliser ' + f + '.');

    }
     
    return ok;
    
  };


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


  function createClimate(da, cpp, latitude, useLeapYears) {

    var ok = false;

    if (climate) {

      da.addClimateData(Climate.tmin, new Float64Array(climate.tmin));
      da.addClimateData(Climate.tmax, new Float64Array(climate.tmax));
      da.addClimateData(Climate.tavg, new Float64Array(climate.tavg));
      da.addClimateData(Climate.globrad, new Float64Array(climate.globrad)); /* MJ m-2 */
      da.addClimateData(Climate.wind, new Float64Array(climate.wind));
      da.addClimateData(Climate.precip, new Float64Array(climate.precip));

      if(climate.sunhours.length > 0)
        da.addClimateData(Climate.sunhours, new Float64Array(climate.sunhours));

      if (climate.relhumid.length > 0)
        da.addClimateData(Climate.relhumid, new Float64Array(climate.relhumid));

      /* TODO: add additional checks */
      ok = true;
    }

    return ok;

    /* we dont use hermes MET files anymore */
    // var tmin = [];
    // var tavg = [];
    // var tmax = [];
    // var globrad = [];
    // var relhumid = [];
    // var wind = [];
    // var precip = [];
    // var sunhours = [];

    // var date = new Date(da.startDate().getFullYear(), 0, 1);

    // var idx_t_av = data.met.columns.indexOf('t_av');
    // var idx_t_min = data.met.columns.indexOf('t_min');
    // var idx_t_max = data.met.columns.indexOf('t_max');
    // var idx_t_s10 = data.met.columns.indexOf('t_s10');
    // var idx_t_s20 = data.met.columns.indexOf('t_s20');
    // var idx_vappd = data.met.columns.indexOf('vappd');
    // var idx_wind = data.met.columns.indexOf('wind');
    // var idx_sundu = data.met.columns.indexOf('sundu');
    // var idx_radia = data.met.columns.indexOf('radia');
    // var idx_prec = data.met.columns.indexOf('prec');
    // var idx_day = data.met.columns.indexOf('day');
    // var idx_year = data.met.columns.indexOf('year');
    // var idx_rf = data.met.columns.indexOf('rf');

    // for (var y = da.startDate().getFullYear(), ys = da.endDate().getFullYear(); y <= ys; y++) {

    //   var daysCount = 0;
    //   var allowedDays = ceil((new Date(y + 1, 0, 1) - new Date(y, 0, 1)) / (24 * 60 * 60 * 1000));

    //   console.log('allowedDays: ' + allowedDays + ' ' + y+ '\t' + useLeapYears + '\tlatitude:\t' + latitude);

    //   for (var r = 0, rs = data.met.rows.length; r < rs; r++) {

    //     var row = data.met.rows[r];
    //     if (row[idx_year] != y)
    //       continue;

    //     if (row[idx_radia] >= 0) {
    //       // use globrad
    //       // HERMES weather files deliver global radiation as [J cm-2]
    //       // Here, we push back [MJ m-2 d-1]
    //       var globradMJpm2pd = row[idx_radia] * 100.0 * 100.0 / 1000000.0;
    //       globrad.push(globradMJpm2pd);        
    //     } else if (row[idx_sundu] >= 0.0) {
    //       // invalid globrad use sunhours
    //       // convert sunhours into globrad
    //       // debug() << 'Invalid globrad - use sunhours instead' << endl;
    //       globrad.push(Tools.sunshine2globalRadiation(r + 1, sunhours, latitude, true));    
    //       sunhours.push(row[idx_sundu]);
    //     } else {
    //       // error case
    //       console.log('Error: No global radiation or sunhours specified for day ' + date);
    //       ok = false;
    //     }

    //     if (row[idx_rf] >= 0.0)
    //       relhumid.push(row[idx_rf]);

    //     tavg.push(row[idx_t_av]);
    //     tmin.push(row[idx_t_min]);
    //     tmax.push(row[idx_t_max]);
    //     wind.push(row[idx_wind]);
    //     precip.push(row[idx_prec]);

    //     daysCount++;
    //     date = new Date(date.getFullYear, date.getMonth(), date.getDate() + 1);
    //   }
    // }

    // da.addClimateData(Climate.tmin, new Float64Array(tmin));
    // da.addClimateData(Climate.tmax, new Float64Array(tmax));
    // da.addClimateData(Climate.tavg, new Float64Array(tavg));
    // da.addClimateData(Climate.globrad, new Float64Array(globrad));
    // da.addClimateData(Climate.wind, new Float64Array(wind));
    // da.addClimateData(Climate.precip, new Float64Array(precip));

    // if(sunhours.length > 0)
    //   da.addClimateData(Climate.sunhours, new Float64Array(sunhours));

    // if (relhumid.length > 0)
    //   da.addClimateData(Climate.relhumid, new Float64Array(relhumid));

    // return ok;

  };

  var setProgress = function (date, model) {

    var progress = {};

    /* if both null we are done */
    if (!date && !model) {
      progress = null;
    } else {

      var isCropPlanted = model.isCropPlanted()
        , mcg = model.cropGrowth()
        , mst = model.soilTemperature()
        , msm = model.soilMoisture()
        , mso = model.soilOrganic()
        , msc = model.soilColumn()
        /* TODO: (from cpp) work-around. Hier muss was eleganteres hin! */
        , msa = model.soilColumnNC()
        , msq = model.soilTransport()
        ;

      progress = {
          date: { value: date.toISOString(), unit: '[date]' }
        , CropName: { value: isCropPlanted ? mcg.get_CropName() : '', unit: '-' }
        , TranspirationDeficit: { value: isCropPlanted ? mcg.get_TranspirationDeficit() : 0, unit: '[0;1]' }
        , ActualTranspiration: { value: isCropPlanted ? mcg.get_ActualTranspiration() : 0, unit: '[mm]' } 
        , CropNRedux: { value: isCropPlanted ? mcg.get_CropNRedux() : 0, unit: '[0;1]' }
        , HeatStressRedux: { value: isCropPlanted ? mcg.get_HeatStressRedux() : 0, unit: '[0;1]' }
        , OxygenDeficit: { value: isCropPlanted ? mcg.get_OxygenDeficit() : 0, unit: '[0;1]' }
        , DevelopmentalStage: { value: isCropPlanted ? mcg.get_DevelopmentalStage() + 1 : 0, unit: '[#]' }
        , CurrentTemperatureSum: { value: isCropPlanted ? mcg.get_CurrentTemperatureSum() : 0, unit: '°C' }
        , VernalisationFactor: { value: isCropPlanted ? mcg.get_VernalisationFactor() : 0, unit: '[0;1]' }
        , DaylengthFactor: { value: isCropPlanted ? mcg.get_DaylengthFactor() : 0, unit: '[0;1]' }
        , OrganGrowthIncrementRoot: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(0) : 0, unit: '[kg (DM) ha-1]' }
        , OrganGrowthIncrementLeaf: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(1) : 0, unit: '[kg (DM) ha-1]' }
        , OrganGrowthIncrementShoot: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(2) : 0, unit: '[kg (DM) ha-1]' }
        , OrganGrowthIncrementFruit: { value: isCropPlanted ? mcg.get_OrganGrowthIncrement(3) : 0, unit: '[kg (DM) ha-1]' }
        , RelativeTotalDevelopment: { value: isCropPlanted ? mcg.get_RelativeTotalDevelopment() : 0, unit: '[0;1]' }
        , OrganBiomassRoot: { value: isCropPlanted ? mcg.get_OrganBiomass(0) : 0, unit: '[kg (DM) ha-1]' }
        , OrganBiomassLeaf: { value: isCropPlanted ? mcg.get_OrganBiomass(1) : 0, unit: '[kg (DM) ha-1]' }
        , OrganBiomassShoot: { value: isCropPlanted ? mcg.get_OrganBiomass(2) : 0, unit: '[kg (DM) ha-1]' }
        , OrganBiomassFruit: { value: isCropPlanted ? mcg.get_OrganBiomass(3) : 0, unit: '[kg (DM) ha-1]' }
        , PrimaryCropYield: { value: isCropPlanted ? mcg.get_PrimaryCropYield() : 0, unit: '[kg (DM) ha-1]' }
        , LeafAreaIndex: { value:  isCropPlanted ? mcg.get_LeafAreaIndex() : 0, unit: '[m-2 m-2]' }
        , GrossPhotosynthesisHaRate: { value: isCropPlanted ? mcg.get_GrossPhotosynthesisHaRate() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
        , NetPhotosynthesis: { value: isCropPlanted ? mcg.get_NetPhotosynthesis() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
        , MaintenanceRespirationAS: { value: isCropPlanted ? mcg.get_MaintenanceRespirationAS() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
        , GrowthRespirationAS: { value: isCropPlanted ? mcg.get_GrowthRespirationAS() : 0, unit: '[kg (CH2O) ha-1 d-1]' }
        , StomataResistance: { value: isCropPlanted ? mcg.get_StomataResistance() : 0, unit: '[s m-1]' }
        , CropHeight: { value: isCropPlanted ? mcg.get_CropHeight() : 0, unit: '[m]' }
        , LeafAreaIndex: { value: isCropPlanted ? mcg.get_LeafAreaIndex() : 0, unit: '[m2 m-2]' }
        , RootingDepth: { value: isCropPlanted ? mcg.get_RootingDepth() : 0, unit: '[layer #]' }
        , AbovegroundBiomass: { value: isCropPlanted ? mcg.get_AbovegroundBiomass() : 0, unit: '[kg ha-1]' }
        , TotalBiomassNContent: { value: isCropPlanted ? mcg.get_TotalBiomassNContent() : 0, unit: '[?]' }
        , SumTotalNUptake: { value: isCropPlanted ? mcg.get_SumTotalNUptake() : 0, unit: '[kg (N) ha-1]' }
        , ActNUptake: { value: isCropPlanted ? mcg.get_ActNUptake() : 0, unit: '[kg (N) ha-1]' }
        , PotNUptake: { value: isCropPlanted ? mcg.get_PotNUptake() : 0, unit: '[kg (N) ha-1]' }
        , TargetNConcentration: { value: isCropPlanted ? mcg.get_TargetNConcentration() : 0, unit: '[kg (N) ha-1]' }
        , CriticalNConcentration: { value: isCropPlanted ? mcg.get_CriticalNConcentration() : 0, unit: '[kg (N) ha-1]' }
        , AbovegroundBiomassNConcentration: { value: isCropPlanted ? mcg.get_AbovegroundBiomassNConcentration() : 0, unit: '[kg (N) ha-1]' }
        , NetPrimaryProduction: { value: isCropPlanted ? mcg.get_NetPrimaryProduction() : 0, unit: '[kg (N) ha-1]' }
        , GrossPrimaryProduction: { value: isCropPlanted ? mcg.get_GrossPrimaryProduction() : 0, unit: '[kg (N) ha-1]' }
        , AutotrophicRespiration: { value: isCropPlanted ? mcg.get_AutotrophicRespiration() : 0, unit: '[kg (C) ha-1]' }
      };

      var outLayers = 20;

      for (var i_Layer = 0; i_Layer < outLayers; i_Layer++)
        progress['SoilMoisture_' + i_Layer] = { value: msm.get_SoilMoisture(i_Layer), unit: '[m-3 m-3]' };

      progress['dailySumIrrigationWater'] = { value: model.dailySumIrrigationWater(), unit: '[mm]' };
      progress['Infiltration'] = { value: msm.get_Infiltration(), unit: '[mm]' };
      progress['SurfaceWaterStorage'] = { value: msm.get_SurfaceWaterStorage(), unit: '[mm]' };
      progress['SurfaceRunOff'] = { value: msm.get_SurfaceRunOff(), unit: '[mm]' };
      progress['SnowDepth'] = { value: msm.get_SnowDepth(), unit: '[mm]' }; 
      progress['FrostDepth'] = { value: msm.get_FrostDepth(), unit: '[mm]' };
      progress['ThawDepth'] = { value: msm.get_ThawDepth(), unit: '[mm]' };

      for (var i_Layer = 0; i_Layer < outLayers; i_Layer++)
       progress['PASW_' + i_Layer] = { value: msm.get_SoilMoisture(i_Layer) - msa[i_Layer].get_PermanentWiltingPoint(), unit: '[m-3 m-3]' };

      progress['SoilSurfaceTemperature'] = { value: mst.get_SoilSurfaceTemperature(), unit: '[°C]' };

      for(var i_Layer = 0; i_Layer < 5; i_Layer++)
        progress['SoilTemperature_' + i_Layer] = { value: mst.get_SoilTemperature(i_Layer), unit: '[°C]' };

      progress['ActualEvaporation'] = { value: msm.get_ActualEvaporation(), unit: '[mm]' };
      progress['Evapotranspiration'] = { value: msm.get_Evapotranspiration(), unit: '[mm]' };
      progress['ET0'] = { value: msm.get_ET0(), unit: '[mm]' };
      progress['KcFactor'] = { value: msm.get_KcFactor(), unit: '[?]' };
      progress['AtmosphericCO2Concentration'] = { value: model.get_AtmosphericCO2Concentration(), unit: '[ppm]' };
      progress['GroundwaterDepth'] = { value: model.get_GroundwaterDepth(), unit: '[m]' };
      progress['GroundwaterRecharge'] = { value: msm.get_GroundwaterRecharge(), unit: '[mm]' };
      progress['NLeaching'] = { value: msq.get_NLeaching(), unit: '[kg (N) ha-1]' };

      for(var i_Layer = 0; i_Layer < outLayers; i_Layer++)
        progress['SoilNO3_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNO3(), unit: '[kg (N) m-3]' };

      progress['SoilCarbamid'] = { value: msc.soilLayer(0).get_SoilCarbamid(), unit: '[kg (N) m-3]' };

      for(var i_Layer = 0; i_Layer < outLayers; i_Layer++)
        progress['SoilNH4_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNH4(), unit: '[kg (N) m-3]' };

      for(var i_Layer = 0; i_Layer < 4; i_Layer++)
        progress['SoilNO2_' + i_Layer] = { value: msc.soilLayer(i_Layer).get_SoilNO2(), unit: '[kg (N) m-3]' };

      for(var i_Layer = 0; i_Layer < 6; i_Layer++)
        progress['SoilOrganicCarbon_' + i_Layer] = { value: msc.soilLayer(i_Layer).vs_SoilOrganicCarbon(), unit: '[kg (C) kg-1]' };

    }
  
    if (ENVIRONMENT_IS_WORKER)
      postMessage({ progress: progress });
    else
      logger(MSG.INFO, (progress ? progress.date.value : 'done'));
  
  };  

  return {
    run: run 
  };


};
