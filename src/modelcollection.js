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
      , currentDateString = currentDate.toISOString().split('T')[0]
      , leapYear = currentDate.isLeapYear()
      , year = year = currentDate.getFullYear()
      , dayOfSimulation = 0
      , model = null
      , noCbs = callbacks.length
      , noModels = this.length
      ;

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
      ;

    for (dayOfSimulation; dayOfSimulation < totalNoDays; dayOfSimulation++) {

      logger(MSG_INFO, currentDateString + ' / ' + dayOfSimulation);

      leapYear = currentDate.isLeapYear();
      year = year = currentDate.getFullYear();

      /* get weather data for current day */
      doy = weather.doy(dayOfSimulation);
      tavg = weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation);
      tmax = weather.dataForTimestep(WEATHER.TMAX, dayOfSimulation);
      tmin = weather.dataForTimestep(WEATHER.TMIN, dayOfSimulation);
      globrad = weather.dataForTimestep(WEATHER.GLOBRAD, dayOfSimulation);
      /* test if data for sunhours are available; if not, value is set to -1.0 */;
      sunhours = weather.isAvailable(WEATHER.SUNHOURS) ? weather.dataForTimestep(WEATHER.SUNHOURS, dayOfSimulation) : -1.0;
      /* test if data for relhumid are available; if not, value is set to -1.0 */;
      relhumid = weather.isAvailable(WEATHER.RELHUMID) ? weather.dataForTimestep(WEATHER.RELHUMID, dayOfSimulation) : -1.0;
      wind =  weather.dataForTimestep(WEATHER.WIND, dayOfSimulation);
      precip =  weather.dataForTimestep(WEATHER.PRECIP, dayOfSimulation);
      f_s = weather.dataForTimestep(WEATHER.F_DIRECTRAD, dayOfSimulation);
      daylength = weather.dataForTimestep(WEATHER.DAYLENGTH, dayOfSimulation) * SEC_PER_HOUR;
      R_a = weather.dataForTimestep(WEATHER.EXRAD, dayOfSimulation);

      /* update vegetation period: avg. temperature for five consecutive days below or above 5 °C */
      if (dayOfSimulation > 4 && !isVegPeriod && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation) > 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 1) > 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 2) > 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 3) > 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 4) > 5
      ) isVegPeriod = true;
      else if (dayOfSimulation > 4 && isVegPeriod && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation) < 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 1) < 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 2) < 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 3) < 5 && 
        weather.dataForTimestep(WEATHER.TAVG, dayOfSimulation - 4) < 5
      ) isVegPeriod = false;

      for (var m = 0; m < noModels; m++) {
          
        model = this[m];

        /* production process */
        model.prodProcessStep(currentDate);

        /* crop  */
        if(model.isCropPlanted()) {
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
        
      } // for each model

      for (var c = 0; c < noCbs; c++)
        callbacks[c](dayOfSimulation, currentDateString, this);

      currentDate.setDate(currentDate.getDate() + 1);
      currentDateString = currentDate.toISOString().split('T')[0];

    } // for each day

    /* done */
    for (var c = 0; c < noCbs; c++)
      callbacks[c](dayOfSimulation, currentDateString, this, true);

  };

  return collection;

};
