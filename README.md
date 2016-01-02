crop.js
=======

crop.js is a dynamic, deterministic generic crop (-rotation) and grassland growth model in JavaScript. It is a JS port of the soil, water and crop processes of [MONICA (C++) code](https://github.com/zalf-lsa/monica) and an implementation of [SGS Pasture Model](http://imj.com.au/sgs/) from the publicly available documentation.

## Examples & Usage

```javascript
var debug = true,
    verbose = true,
    weather = {
      tmin: [/*...your data...*/],
      tmax: [/*...your data...*/],
      precip: [/*...your data...*/]
    };

/* create a configuration */
var configuration = new crop.Configuration(weather, debug, verbose, 
    // optional callback
    function (dayOfSimulation, dateString, models, done) {
      var model, 
          soilTemperature,
          soilMoisture,
          soilOrganic,
          soilColumn,
          soilTransport;

      for (var m = 0; m < models.length; m++) {

        model = models[m];

        // access sub-models
        if (model.isCropPlanted())
          cropGrowth = model.cropGrowth();

        soilTemperature = model.soilTemperature();
        soilMoisture = model.soilMoisture();
        soilOrganic = model.soilOrganic();
        soilColumn = model.soilColumn()
        soilTransport = model.soilTransport();

        /* do stuff */
      }

    });

/* set up simulation, soil and crop parameters */
var simulation = {
      time: {
        startDate: '1996-01-01',
        endDate: '1997-12-31'
      },
      switches: {
        nitrogenResponseOn: true,
        waterDeficitResponseOn: true
      },
      init: {
        percentageFC: 1
      }
    },
    site: {
      latitude: 52.625,
      slope: 0,
      heightNN: 1,
      horizons: [{
        thickness: 2,
        organicMatter: 0.015,
        sand: 0.60,
        clay: 0.05,
        sceleton: 0.02
      }]
    },
    production: {
      crops: [
        {
          model: 'generic',
          species: [
            {
              // see available crops at genericcrop.js and grassland.js
              // with varying parameter quality!
              name: 'winter rye'
            }
          ],
          sowingDate: '1996-10-01',
          plantDryWeight: 225,
          finalHarvestDate: '1997-07-01',
          tillageOperations: [],
          irrigations: [],
          organicFertilisers: [],
          mineralFertilisers: []
        }
      ]
    };

/* run the simulation */
configuration.run(simulation, { site: site, production: production });
´´´

See also [code](https://github.com/jvail/crop.js/tree/master/exp) and [application](https://zalf-lse.github.io/solid-dss/) examples.

## Model Genealogy
[MONICA](http://monica.agrosystem-models.com/) is based on [HERMES](http://www.zalf.de/en/forschung/institute/lsa/forschung/oekomod/hermes/Pages/default.aspx) and [DAISY](https://code.google.com/p/daisy-model/). HERMES is based on [SUCROS](http://models.pps.wur.nl/node/3). The grassland model is based on the [SGS Pasture Model](http://imj.com.au/sgs/).

Nendel, C., M. Berg, K.C. Kersebaum, W. Mirschel, X. Specka, M. Wegehenkel, K.O. Wenkel, R. Wieland (2011). The MONICA model: Testing predictability for crop growth, soil moisture and nitrogen dynamics. Ecol. Model. 222 (9), 1614–1625.

Johnson I. R., Lodge G. M., White R. E. (2003). The Sustainable Grazing Systems Pasture Model: description, philosophy and application to the SGS National Experiment. Australian Journal of Experimental Agriculture 43, 711–728. 

## Aims
- [x] Replace MONICA's generic grass-legume model with a more sophisticated grassland model that is able to simulate mixtures of species.
- [ ] Provide additional nutritional parameters (e.g. digestibility) for forage crops (e.g. maize, whole-crop silage) that may be consumend by animal (ruminants) models.
- [x] Add multi-model support to allow interaction of models (rotations, paddocks).
- [x] Add routines to interact with animal models (grazing).
- [x] Add other grassland species (or functional groups) if parameters are available.
- [ ] Add simple rountines for automatic seed, harvest, fertilization, irrigation and tillage date predictions.
- [x] Simplify MONICA's input parameters, configuration and API.
- [x] Provide infrastructure and unified API to easily extend crop.js with custom crop growth models

## Acknowledgements

The study has been supported by the TRY initiative on plant traits (http://www.try-db.org). The TRY initiative and database is hosted, developed and maintained by J. Kattge and G. Bönisch (Max Planck Institute for Biogeochemistry, Jena, Germany). TRY is currently supported by DIVERSITAS/Future Earth and the German Centre for Integrative Biodiversity Research (iDiv) Halle-Jena-Leipzig

The research leading to these results has received funding from the European Community’s Seventh Framework Programme (FP7/2007–2013) under grant agreement No. FP7-266367 (SOLID).
