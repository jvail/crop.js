/*
  Changes
    - Cutting.apply() 
      prim. yield auskommentiert, p.yield immer 0.00, da organId 0 ????
      store results
    - var Cutting = function ()
      + cropResult
*/

var WorkStep = function (date) {

  this._date = date;

  this.date = function () { 
    return this._date; 
  };

  this.setDate = function (date) {
    this._date = date; 
  };

  //! do whatever the workstep has to do
  this.apply = function (model) {};

  this.clone = function () {};

  this.toString = function () {
    return "date: " + this.date().toString();
  };

};


var Seed = function (date, crop) {

  WorkStep.call(this, date);

  this._date = date;
  this._crop = crop;

  this.setDate = function (date) {
    this._date = date;
    this._crop.setSeedAndHarvestDate(this.date(), this._crop.harvestDate());
  };

  this.apply = function (model) {
    logger(MSG_INFO, "seeding crop: " + this._crop.name() + " at: " + this.date().toISOString().split('T')[0]);
    model.seedCrop(this._crop);
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

  this.toString = function () {
    return "seeding at: " + this.date().toString() + " crop: " + this._crop.toString();
  };

};

Seed.prototype = Object.create(WorkStep);
Seed.prototype.constructor = Seed;


var Harvest = function (at, crop) {

  WorkStep.call(this, at);
  
  this._date = at;
  this._crop = crop;

  this.setDate = function (date) {
    this._date = date;
    this._crop.setSeedAndHarvestDate(this._crop.seedDate(), this.date());
  };

  this.apply = function (model) {
  
    if (model.cropGrowth()) {

      logger(MSG_INFO, "harvesting crop: " + this._crop.name() + " at: " + this.date().toString());

      if (model.currentCrop() == this._crop) {

        if (model.cropGrowth()) {
          var cropGrowth = model.cropGrowth();
          this._crop.setHarvestYields(
            cropGrowth.primaryYieldFreshMatter() /
            100.0, cropGrowth.get_FreshSecondaryCropYield() / 100.0
          );
          this._crop.setHarvestYieldsTM(
            cropGrowth.primaryYield() / 100.0,
            cropGrowth.secondaryYield() / 100.0
          );
          this._crop.setYieldNContent(
            cropGrowth.primaryYieldNitrogenContent(),
            cropGrowth.secondaryYieldNitrogenContent()
          );
          this._crop.setSumTotalNUptake(cropGrowth.accumulatedNitrogenUptake());
          this._crop.setCropHeight(cropGrowth.height());
          this._crop.setAccumulatedETa(cropGrowth.accumulatedEvapotranspiration());
        }

        model.harvestCurrentCrop();

      } else {
          logger(MSG_INFO, "Crop: " + model.currentCrop().toString()
            + " to be harvested isn't actual crop of this Harvesting action: "
            + this._crop.toString());
      }
    }
  
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

  this.toString = function () {
    return "harvesting at: " + this.date().toString() + " crop: " + this._crop.toString();
  };

};

Harvest.prototype = Object.create(WorkStep);
Harvest.prototype.constructor = Harvest;

var Cutting = function (at, crop, cropResult) {

  WorkStep.call(this, at);
  
  this._date = at;
  this._crop = crop;
  this._cropResult = cropResult;

  this.apply = function (model) {
  
    logger(MSG_INFO, "Cutting crop: " + this._crop.name() + " at: " + this.date().toString());
    if (model.currentCrop() == this._crop) {
      // if (model.cropGrowth()) {
        // this._crop.setHarvestYields(
        //   model.cropGrowth().primaryYieldFreshMatter() /
        //   100.0, model.cropGrowth().get_FreshSecondaryCropYield() / 100.0
        // );
        // this._crop.setHarvestYieldsTM(
        //   model.cropGrowth().primaryYield() / 100.0,
        //   model.cropGrowth().secondaryYield() / 100.0
        // );
        // this._crop.addCuttingYieldDM(model.cropGrowth().primaryYield() / 100.0);
      // }
      // this._crop.setYieldNContent(
      //   model.cropGrowth().primaryYieldNitrogenContent(),
      //   model.cropGrowth().secondaryYieldNitrogenContent()
      // );
      // this._crop.setSumTotalNUptake(model.cropGrowth().accumulatedNitrogenUptake());
      // this._crop.setCropHeight(model.cropGrowth().height());

      var cut = {
          id: this._crop.id()
        , name: this._crop.name()
        , date: this._date
        , primaryYieldTM: model.cropGrowth().primaryYield() / 100.0
      };

      if (fs) {
        var str = '';
        str += this._date.getFullYear() + ';' + round(cut.primaryYieldTM) + '\n';
        fs.appendFileSync('./out/cutting_yields.csv', str, { encoding: 'utf8' });

      }
      //store results for this crop
      if (!this._cropResult.cuts)
        this._cropResult.cuts = [];
      this._cropResult.cuts.push(cut);

      if (model.cropGrowth())
          model.cropGrowth().applyCutting();
    }
  
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

  this.toString = function () {
    return "Cutting at: " + this.date().toString() + " crop: " + this._crop.toString();
  };
};

Cutting.prototype = Object.create(WorkStep);
Cutting.prototype.constructor = Cutting;


var MineralFertiliserApplication = function (at, partition, amount) {

  WorkStep.call(this, at);

  this._date = at;
  this._partition = partition;
  this._amount = amount;

  this.apply = function (model) {
    model.applyMineralFertiliser(this._partition, this._amount);
  };

  this.partition = function () {
    return this._partition;
  };

  this.amount = function () { 
    return this._amount; 
  };

  this.toString = function () {
    return "applying mineral fertiliser at: " + this._date.toString() + " amount: " + this._amount + " partition: "
        + this.partition().toString();
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

};

MineralFertiliserApplication.prototype = Object.create(WorkStep);
MineralFertiliserApplication.prototype.constructor = MineralFertiliserApplication;


var OrganicFertiliserApplication = function (at, parameters, amount, incorp) {

  WorkStep.call(this, at);

  this._date = at;
  this._parameters = parameters;
  this._amount = amount; /* [kg (FM) ha-1] */
  this._incrop = (incorp === undefined) ? true : incorp;

  this.apply = function (model) {
    model.applyOrganicFertiliser(this._parameters, this._amount, this._incrop);
  };

  this.parameters = function () {
    return this._parameters;
  };

  this.amount = function () { 
    return this._amount; 
  };

  this.incorporation = function () { 
    return this._incorporation; 
  };

  this.toString = function () {
    return (
      "applying organic fertiliser at: " + this.date().toString() + " amount: " + 
      this.amount() + "\tN percentage: " + this._parameters.vo_NConcentration + "\tN amount: " + 
      this.amount() * this._parameters.vo_NConcentration
    );
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

};

OrganicFertiliserApplication.prototype = Object.create(WorkStep);
OrganicFertiliserApplication.prototype.constructor = OrganicFertiliserApplication;


var TillageApplication = function (at, depth) {

  WorkStep.call(this, at);

  this._date = at;
  this._depth = depth;

  this.apply = function (model) {
    model.applyTillage(this._depth);
  };

  this.toString = function () {
    return "applying tillage at: " + this.date().toString() + " depth: " + this._depth;
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

};

TillageApplication.prototype = Object.create(WorkStep);
TillageApplication.prototype.constructor = TillageApplication;


var IrrigationApplication = function (at, amount, parameters) {

  WorkStep.call(this, at);

  this._date = at;
  this._amount = amount;
  this._parameters = parameters;

  this.apply = function (model) {
    model.applyIrrigation(this.amount(), this.nitrateConcentration());
  };

  this.amount = function () { 
    return this._amount; 
  };

  this.nitrateConcentration = function () { 
    return this._parameters.nitrateConcentration; 
  };

  this.sulfateConcentration = function () { 
    return this._parameters.sulfateConcentration; 
  };

  this.toString = function () {
    return "applying irrigation at: " + this.date().toString() + " amount: " + this.amount() + " nitrateConcentration: "
      + this.nitrateConcentration() + " sulfateConcentration: " + this.sulfateConcentration();
  };

  this.clone = function () {
    return JSON.parse(JSON.stringify(this)); 
  };

};

IrrigationApplication.prototype = Object.create(WorkStep);
IrrigationApplication.prototype.constructor = IrrigationApplication;
