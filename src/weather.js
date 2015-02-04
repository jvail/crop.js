/*
  TODO: make closure or remove function calls access
*/

var Weather = function (startDate, endDate) {

  this._startDate = startDate;
  this._endDate = endDate;
  this._data = null;
  this._numberOfSteps = floor((endDate - startDate) / MS_PER_DAY) + 1;
  this._dates = [];

  this.setData = function (data) {
    
    this._data = data;
    /* set numberOfSteps to minimum weather data available if any array's length < _numberOfSteps */
    for (var i = 0, is = data.length; i < is; i++) {
      if (data[i].length < this._numberOfSteps) {
        this._numberOfSteps = data[i].length;
        logger(MSG.WARN, 'Weather input length from [' + i + '] < numberOfSteps. numberOfSteps now ' + this._numberOfSteps);
      }
    }

    for (i = 0; i < this._numberOfSteps; i++)
      this._dates[i] = new Date(Date.parse(this._data[WEATHER.ISODATESTRING][i]));

  };

  this.date = function (stepNo) {
    return this._dates[stepNo];
  };

  this.isValid = function () { 
    return this._numberOfSteps > 0;
  };

  this.dataForTimestep = function (index, dayOfSimulation) {
    return this._data[index][dayOfSimulation];
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

  this.julianDayForStep = function (stepNo) {

    if (this._data[WEATHER.DOY].length > 0) {
      return this._data[WEATHER.DOY][stepNo];
    } else {
      var newDate = new Date(this._startDate.getFullYear(), this._startDate.getMonth(), this._startDate.getDate() + stepNo);
      return ceil((newDate - new Date(newDate.getFullYear(), 0, 1)) / 86400000) + 1;
    }
  
  };

  this.isAvailable = function (index) {
    return this._data[index].length > 0;
  };

};
