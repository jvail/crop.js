/*
  Example two rye plots with different production settings and dynamic harvest dates via callback.

  Harvest of rye 1 slightly later due to irrigation. Apply harvest as soon as max. dev stage has been reached. But due
  to missing capacities they can not be harvested at the same day (if they reach max. dev. stage at the same day)

  output: out.csv
*/

var fs = require('fs')
  , crop = require('../crop.js')
  , exec = require('child_process').exec
  , noModels = 2
  ;

eval(fs.readFileSync('../lib/weather.solar.js').toString());

function getWeather(lat, lon) {

  var rr = JSON.parse(fs.readFileSync('rr_' + lat + '_' + lon + '.json').toString());
  var tg = JSON.parse(fs.readFileSync('tg_' + lat + '_' + lon + '.json').toString());
  var tn = JSON.parse(fs.readFileSync('tn_' + lat + '_' + lon + '.json').toString());
  var tx = JSON.parse(fs.readFileSync('tx_' + lat + '_' + lon + '.json').toString());
 
  /* read weather files */
  var weatherData = {
    tmin: [],
    tmax: [],
    tavg: [],
    globrad: [],
    wind: [],
    sunhours: [],
    relhumid: [],
    precip: [],
    ppf: [],
    daylength: [],
    f_directrad: [],
    date: [],
    doy: [],
    exrad: []
  };

  for (var d = 0; d < rr.values.length; d++) {
    weatherData.precip.push(rr.values[d] < 0 ? 0 : rr.values[d] * rr.scale);
    weatherData.tmin.push(tn.values[d] * tn.scale);
    weatherData.tmax.push(tx.values[d] * tx.scale);
    if (weatherData.tmin[d] > weatherData.tmax[d]) {
      weatherData.tmax[d] = weatherData.tmin[d] * 1.1; // TODO: seems to happen in some ecad values
    }
    weatherData.tavg.push(tg.values[d] * tg.scale);
    weatherData.wind.push(2); /* default wind speed */
  }

  var solar = weather.solar(lat, weatherData.tmin, weatherData.tmax, '1995-01-01');
  for (var d = 0, ds = solar.PPF.length; d < ds; d++) {
    weatherData.globrad[d] = solar.R_s[d];
    weatherData.f_directrad[d] = solar.f_s[d];
    weatherData.daylength[d] = solar.N[d];
    weatherData.sunhours[d] = solar.N[d];
    weatherData.relhumid[d] = weather.rh(weatherData.tmin[d], weatherData.tmax[d]);
    weatherData.date[d] = solar.date[d];
    weatherData.doy[d] = solar.doy[d];
    weatherData.exrad[d] = solar.R_a[d];
  }

  return weatherData;
}

/* model callback */
var successiveHarvestCb = (function () {

  // csv
  var csv = 'rye 1 NO3 1 [kg N m-2];rye 1 NH4 1 [kg N m-2];rye 1 LAI [m2 m-2];rye 1 Fruit [kg (DM) ha-1];rye 1 DevStage [#];';
  csv    += 'rye 2 NO3 1 [kg N m-2];rye 2 NH4 1 [kg N m-2];rye 2 LAI [m2 m-2];rye 2 Fruit [kg (DM) ha-1];rye 2 DevStage [#];';
  csv    += '\n';

  var harvests = ['', ''];

  /* return the callback */
  return function (dayOfSimulation, dateString, models, done) {

    var model, isCropPlanted, mcg, mst, msm, mso, msc, msq;

    for (var m = 0; m < noModels; m++) {

      model = models[m];

      isCropPlanted = model.isCropPlanted();
      mst = model.soilTemperature();
      msm = model.soilMoisture();
      mso = model.soilOrganic();
      msc = model.soilColumn()
      msa = model.soilColumnNC();
      msq = model.soilTransport();

      // kg N in top 30 cm
      csv += (msc.soilLayer(0).vs_LayerThickness * (msc.soilLayer(0).get_SoilNO3() + msc.soilLayer(1).get_SoilNO3() + msc.soilLayer(2).get_SoilNO3())) + ';';
      csv += (msc.soilLayer(0).vs_LayerThickness * (msc.soilLayer(0).get_SoilNH4() + msc.soilLayer(1).get_SoilNH4() + msc.soilLayer(2).get_SoilNH4())) + ';';

      if (isCropPlanted) {
        mcg = model.cropGrowth();
        csv += mcg.leafAreaIndex() + ';';
        csv += mcg.biomass(3) + ';';
        csv += mcg.developmentalStage() + ';';
        /* harvest rye as soon as last dev stage has been reached */
        if (mcg.developmentalStage() === model.currentCrop().cropParameters().pc_NumberOfDevelopmentalStages - 1) {
          if (harvests.indexOf(dateString) < 0) { /* do not harvest both plots at the same day */
            model.harvestCurrentCrop();
            harvests[m] = dateString;
          }
        }
      } else {
        csv += '0;';
        csv += '0;';        
        csv += '0;';        
      }

    }

    csv += '\n';

    if (done) {
      console.log('done');
      fs.writeFileSync('out.csv', csv);
    }

  }

}());


var sim = JSON.parse(fs.readFileSync('rye.simulation.json').toString())
  , site = JSON.parse(fs.readFileSync('rye.site.json').toString())
  , production1 = JSON.parse(fs.readFileSync('rye.production.json').toString())
  , production2 = JSON.parse(fs.readFileSync('rye.production.json').toString())
  ;

  /* remove fertilizations and irrigations from rye plot 2 */
  production2.crops[0].organicFertilisers = [];
  production2.crops[0].mineralFertilisers = [];
  production2.crops[0].irrigations = [];

/* same site params, two rye plots */
var siteAndProd = [
  { site: site, production: production1 },
  { site: site, production: production2 }
];

var weatherData = getWeather(52.625, 13.375);

var startTime = Date.now();
var debug = true;
var verbose = true;

var cfg = new crop.Configuration(weatherData, debug, verbose, successiveHarvestCb);
cfg.run(sim, siteAndProd);

console.log((Date.now() - startTime) / 1000);




