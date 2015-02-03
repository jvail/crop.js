

var Grass = function (seedDate, harvestDates, species) {
  this.species = species;
  this._seedDate = seedDate;
  this._harvestDates = harvestDates;
  this.seedDate = function () {
    return this._seedDate;
  };
  this.harvestDate = function () {
    return new Date(Infinity);
  };
  this.getCuttingDates = function () {
    return [];
  };
  this.name = function () {
    return 'grassland';
  };
  this.isValid = function () {
    return true;
  };
};
