
var Weather = function (startDate, endDate) {

  this._startDate = startDate;
  this._endDate = endDate;
  this._data = [];
  this._numberOfSteps = 0;
  this._offset = 0;
  this._dates = [];

  this.setData = function (data) {
    
    this._data = data;
    this._offset = data[WEATHER.ISODATESTRING].indexOf(this._startDate.toISODateString());

    var endIdx = data[WEATHER.ISODATESTRING].indexOf(this._endDate.toISODateString());
    
    if (this._offset < 0) {
      this._numberOfSteps = 0;
      logger(MSG_ERROR, 'Start date not valid: no. of steps is 0');
    }

    if (endIdx < 0) {
      endIdx = this._data[WEATHER.ISODATESTRING].length - 1;
      this._endDate = new Date(Date.parse(this._data[WEATHER.ISODATESTRING][endIdx]));
      logger(MSG_WARN, 'End date not found: end date adjusted to ' + this._endDate.toISODateString());
    }

    for (var i = 0; i < this._numberOfSteps; i++)
      this._dates[i] = new Date(Date.parse(this._data[WEATHER.ISODATESTRING][i]));

    this._numberOfSteps = endIdx - this._offset;

  };

  this.date = function (stepNo) {
    return this._dates[stepNo + this._offset];
  };

  this.isValid = function () { 
    return this._numberOfSteps > 0;
  };

  this.dataForTimestep = function (index, dayOfSimulation) {
    return this._data[index][dayOfSimulation + this._offset];
  };

  this.noOfStepsPossible = function () {
    return this._numberOfSteps; 
  };

  this.startDate = function () {
    return this._startDate; 
  };

  this.endDate = function () {
    return this._endDate; 
  };

  this.doy = function (stepNo) {

    if (this._data[WEATHER.DOY].length > 0) {
      return this._data[WEATHER.DOY][stepNo + this._offset];
    } else {
      var newDate = new Date(this._startDate.getFullYear(), this._startDate.getMonth(), this._startDate.getDate() + stepNo);
      return ceil((newDate - new Date(newDate.getFullYear(), 0, 1)) / 86400000) + 1;
    }
  
  };

  this.isAvailable = function (index) {
    return this._data[index].length > 0;
  };

};
