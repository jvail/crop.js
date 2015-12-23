/*
  Run a collection of models. 
  Change model variables during the simulation via callbacks.

  This is necessary if management decisions depend on variables in different models (sites) 
  e.g. to simulate grazing, cutting decisions with more than one paddock or one wants
  to model any plot/field interaction.
*/

var ModelCollection = function (weather) {

  var collection = [];

  collection.weather = weather;

  /* callbacks   array of functions */

  collection.run = function (callbacks) {

    var weather = this.weather
      , totalNoDays = weather.noOfStepsPossible()
      , currentDate = weather.startDate()
      , currentDateString = currentDate.toISODateString()
      , leapYear = currentDate.isLeapYear()
      , year = currentDate.getFullYear()
      , month = currentDate.getMonth()
      , dayOfSimulation = 0
      , model = null
      , noCbs = callbacks.length
      , noModels = this.length
      , latitude = this[0].getEnvironment().site.vs_Latitude // should the same for all models
      , spring = (latitude > 0 ? 3 : 10)
      , autum = (latitude > 0 ? 10 : 3)
      ;

    if (fs && DEBUG) {
      var foutFileName = 'rmout';
      var goutFileName = 'smout';
      var monicaParamFileName = 'parameters';

      this.forEach(function (model, i) {
        initializeFoutHeader(foutFileName + i);
        initializeGoutHeader(goutFileName + i);
        dumpParametersIntoFile(monicaParamFileName + i, model.getEnvironment().centralParameterProvider);
      });
    }

    var doy = 0
      , tavg = 0
      , tmax = 0
      , tmin = 0
      , globrad = 0
      , sunhours = 0   
      , relhumid = 0
      , wind = 0
      , windHeight = 2 // TODO: stored where?
      , C_amb = 380    // TODO: move CO2forDate from model.js to weather (source or equation?)
      , precip = 0
      , f_s = 0
      , daylength = 0
      , R_a = 0
      , isVegPeriod = false
      , toISODateString = ''
      ;

    for (dayOfSimulation; dayOfSimulation < totalNoDays; dayOfSimulation++) {


      /* get weather data for current day */
      doy = weather.doy(dayOfSimulation);
      tavg = weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation);
      tmax = weather.dataForTimestep(WEATHER.TMAX, dayOfSimulation);
      tmin = weather.dataForTimestep(WEATHER.TMIN, dayOfSimulation);
      globrad = weather.dataForTimestep(WEATHER.GLOBRAD, dayOfSimulation);
      // TODO: set to MISSING_VALUE in Weather
      /* test if data for sunhours are available; if not, value is set to -1.0 */;
      sunhours = weather.isAvailable(WEATHER.SUNHOURS) ? weather.dataForTimestep(WEATHER.SUNHOURS, dayOfSimulation) : -1.0;
      /* test if data for relhumid are available; if not, value is set to -1.0 */;
      relhumid = weather.isAvailable(WEATHER.RELHUMID) ? weather.dataForTimestep(WEATHER.RELHUMID, dayOfSimulation) : -1.0;
      wind =  weather.dataForTimestep(WEATHER.WIND, dayOfSimulation);
      precip =  weather.dataForTimestep(WEATHER.PRECIP, dayOfSimulation);
      f_s = weather.dataForTimestep(WEATHER.F_DIRECTRAD, dayOfSimulation);
      daylength = weather.dataForTimestep(WEATHER.DAYLENGTH, dayOfSimulation) * SEC_PER_HOUR;
      R_a = weather.dataForTimestep(WEATHER.EXRAD, dayOfSimulation);
      currentDateString = weather.dataForTimestep(WEATHER.ISODATESTRING, dayOfSimulation);
      currentDate = new Date(Date.parse(currentDateString));
      leapYear = currentDate.isLeapYear();
      year = currentDate.getFullYear();
      month = currentDate.getMonth();

      logger(MSG_INFO, currentDateString + ' / ' + dayOfSimulation);

      /* update vegetation period: avg. temperature for five consecutive days below or above 5 °C */
      if (abs(latitude) > 23.43721) {
        if (dayOfSimulation > 4 && !isVegPeriod &&
          weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation) > 5 && 
          weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 1) > 5 && 
          weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 2) > 5 && 
          weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 3) > 5 && 
          weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 4) > 5
        ) isVegPeriod = true;
        else if (dayOfSimulation > 4 && isVegPeriod && month <= spring && month >= autum &&
          weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation) < 5 && 
          weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 1) < 5 && 
          weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 2) < 5 && 
          weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 3) < 5 && 
          weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 4) < 5
        ) isVegPeriod = false;
      } else {
        isVegPeriod = true;
      }

      if (isNaN(tavg) || abs(tavg) === Infinity) {
        logger(MSG_ERROR, 'tavg invalid: ' + tavg);
      }
      if (isNaN(tmax) || abs(tmax) === Infinity) {
        logger(MSG_ERROR, 'tmax invalid: ' + tmax);
      }
      if (isNaN(tmin) || abs(tmin) === Infinity) {
        logger(MSG_ERROR, 'tmin invalid: ' + tmin);
      }
      if (tmin > tmax) {
        tmin = tmax = tavg;
        logger(MSG_WARN, 'tmin > tmax: ' + tmin + '/' + tmax);
      }
      if (isNaN(globrad) || globrad < 0 || abs(globrad) === Infinity) {
        logger(MSG_ERROR, 'globrad invalid: ' + globrad);
      }
      if (isNaN(sunhours) || sunhours < 0 || abs(sunhours) === Infinity) {
        logger(MSG_ERROR, 'sunhours invalid: ' + sunhours);
      }
      if (isNaN(relhumid) || relhumid < 0 || abs(relhumid) === Infinity) {
        relhumid = 0.5;
        logger(MSG_ERROR, 'relhumid invalid: ' + relhumid);
      }
      if (isNaN(wind) || wind < 0 || abs(wind) === Infinity) {
        logger(MSG_ERROR, 'wind invalid: ' + wind);
      }
      if (isNaN(windHeight) || windHeight < 0 || abs(windHeight) === Infinity) {
        logger(MSG_ERROR, 'windHeight invalid: ' + windHeight);
      }
      if (isNaN(C_amb) || C_amb < 0 || abs(C_amb) === Infinity) {
        logger(MSG_ERROR, 'C_amb invalid: ' + C_amb);
      }
      if (isNaN(precip) || precip < 0 || precip > 100 || abs(precip) === Infinity) {
        logger(MSG_ERROR, 'precip invalid: ' + precip);
      }
      if (isNaN(f_s) || f_s < 0 || abs(f_s) === Infinity) {
        logger(MSG_ERROR, 'f_s invalid: ' + f_s);
      }
      if (isNaN(daylength) || daylength < 0 || abs(daylength) === Infinity) {
        logger(MSG_ERROR, 'daylength invalid: ' + daylength);
      }
      if (isNaN(R_a) || R_a < 0 || abs(R_a) === Infinity) {
        logger(MSG_ERROR, 'R_a invalid: ' + R_a);
      }

      for (var m = 0; m < noModels; m++) {
          
        model = this[m];
        model.setIsVegPeriod(isVegPeriod);

        /* production process */
        model.prodProcessStep(currentDate);

        /* crop  */
        if (model.isCropPlanted()) {
          
          model.cropStep(
            doy,
            tavg,
            tmax,
            tmin,
            globrad,
            sunhours,
            relhumid,
            wind,
            windHeight,
            C_amb,
            precip,
            f_s,
            daylength,
            R_a,
            isVegPeriod
          );
        
        }

        if (DEBUG && fs) {
          fs.appendFileSync(goutFileName + m, currentDateString, { encoding: 'utf8' });
          fs.appendFileSync(foutFileName + m, currentDateString, { encoding: 'utf8' });
          writeCropResults(model.cropGrowth(), foutFileName + m, goutFileName + m, model.isCropPlanted());
        }

        /* soil */
        model.generalStep(
          doy,
          year,
          leapYear,
          tmin,
          tavg,
          tmax,
          precip,
          wind,
          globrad,
          relhumid
        );

        if (DEBUG && fs) {
          writeGeneralResults(foutFileName + m, goutFileName + m, model.getEnvironment(), model, weather, dayOfSimulation);
        }
        
      } // for each model

      for (var c = 0; c < noCbs; c++)
        callbacks[c](dayOfSimulation, currentDateString, this);

      currentDate.setDate(currentDate.getDate() + 1);
      currentDateString = currentDate.toISODateString();

    } // for each day

    /* done */
    for (var c = 0; c < noCbs; c++)
      callbacks[c](dayOfSimulation, currentDateString, this, true);

  };

  return collection;

};
