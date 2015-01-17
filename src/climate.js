
var DataAccessor = function (startDate, endDate) {

  this._startDate = startDate;
  this._endDate = endDate;
  this._data = [];
  this._fromStep = 0;
  this._numberOfSteps;

  //! offsets to actual available climate data enum numbers
  this._acd2dataIndex = [];

  this.isValid = function () { 
    return this.noOfStepsPossible() > 0; 
  };

  this.dataForTimestep = function (acd, stepNo) {
    var cacheIndex = this._acd2dataIndex[acd];
    return (cacheIndex < 0 || cacheIndex === undefined) ? 0.0 : this._data[cacheIndex][this._fromStep + stepNo];
  };

  this.dataAsVector = function (acd) {
    var cacheIndex = this._acd2dataIndex[acd];
    return (cacheIndex < 0 || cacheIndex === undefined) ? [] : this._data[cacheIndex].slice(this._fromStep, this._fromStep + this.noOfStepsPossible()); 
  };

  this.cloneForRange = function (fromStep, numberOfSteps) {};

  this.noOfStepsPossible = function () { 
    return this._numberOfSteps; 
  };

  this.startDate = function () { 
    return this._startDate; 
  };

  this.endDate = function () { 
    return this._endDate; 
  };

  this.julianDayForStep = function (stepNo) {
    var newDate = new Date(this._startDate.getFullYear(), this._startDate.getMonth(), this._startDate.getDate() + stepNo);
    return ceil((newDate - new Date(newDate.getFullYear(), 0, 1)) / 86400000) + 1;
  };

  this.addClimateData = function (acd, data) {
    /* TODO: in monica gucken was das zu bedeuten hat */
    if(!this._data.length > 0 && this._numberOfSteps === data.length)
      logger(MSG.WARN, "this._numberOfSteps === data.length");

    this._data.push(data);
    this._acd2dataIndex[acd] = this._data.length - 1;
    this._numberOfSteps = (this._data.length === 0) ? 0 : data.length;
  };

  this.addOrReplaceClimateData = function (acd, data) {};

  this.hasAvailableClimateData = function (acd) {
    return this._acd2dataIndex[acd] >= 0;
  };

};