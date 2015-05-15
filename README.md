_work in progress_

crop.js
=======

crop.js is an effort to build a dynamic (generic) crop and grassland growth model entirly in JavaScript.

## Examples & Usage
See [examples](https://github.com/jvail/crop.js/tree/master/exp).

## Genealogy
The (generic) crop and soil model is a JS port of major parts of [MONICA](http://monica.agrosystem-models.com/) - specifically the soil and crop growth sub-models. MONICA is based on [HERMES](http://www.zalf.de/en/forschung/institute/lsa/forschung/oekomod/hermes/Pages/default.aspx) and [DAISY](https://code.google.com/p/daisy-model/). HERMES is based on [SUCROS](http://models.pps.wur.nl/node/3). The grassland model is based on the [SGS Pasture Model](http://imj.com.au/sgs/).

Nendel, C., M. Berg, K.C. Kersebaum, W. Mirschel, X. Specka, M. Wegehenkel, K.O. Wenkel und R. Wieland (2011): The MONICA model: Testing predictability for crop growth, soil moisture and nitrogen dynamics. Ecol. Model. 222 (9), 1614 – 1625.

Johnson I. R. , Lodge G. M. , White R. E. (2003) The Sustainable Grazing Systems Pasture Model: description, philosophy and application to the SGS National Experiment. Australian Journal of Experimental Agriculture 43 , 711–728. 

## Aims
- Replace MONICA's generic grass-legume model with a more sophisticated grassland model.
- Provide additional nutritional parameters (e.g. digestibility) for forage crops (e.g. maize, whole-crop silage) that may be consumend by animal (ruminants) models.
- Add routines to interact with animal models (grazing).
- Add other grassland species (or functional groups) if parameters are available.
- Add simple rountines for automatic seed, harvest, fertilization, irrigation and tillage date predictions.
- Simplify MONICA's input parameters, configuration and API.

## License & Copywrite
The library in total is released under GPL (see license file). The grassland model files are released under MIT license.

Copyright (C) 2015, Leibniz Centre for Agricultural Landscape Research (ZALF)

## Acknowledgements

The study has been supported by the TRY initiative on plant traits (http://www.try-db.org). The TRY initiative and database is hosted, developed and maintained by J. Kattge and G. Bönisch (Max Planck Institute for Biogeochemistry, Jena, Germany). TRY is currently supported by DIVERSITAS/Future Earth and the German Centre for Integrative Biodiversity Research (iDiv) Halle-Jena-Leipzig

The research leading to these results has received funding from the European Community’s Seventh Framework Programme (FP7/2007–2013) under grant agreement No. FP7-266367 (SOLID).
