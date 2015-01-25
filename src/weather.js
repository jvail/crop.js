/*
  TODO: make closure or remove function calls access
*/

var Weather = function (startDate, endDate, data) {

  this._startDate = startDate;
  this._endDate = endDate;
  this._data = data;

  this._numberOfSteps = ceil((endDate - startDate) / MS_PER_DAY);

  /* set numberOfSteps to minimum weather data available if any array's length < _numberOfSteps */
  for (var i = 0, is = data.length; i < is; i++) {
    if (data[i].length < this._numberOfSteps)
      this._numberOfSteps = data[i].length;
  }

  this.isValid = function () { 
    return this._numberOfSteps > 0;
  };

  this.dataForTimestep = function (index, dayOfSimulation) {
    return this._data[index];
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
      return this._data[WEATHER.DOY];
    } else {
      var newDate = new Date(this._startDate.getFullYear(), this._startDate.getMonth(), this._startDate.getDate() + stepNo);
      return ceil((newDate - new Date(newDate.getFullYear(), 0, 1)) / 86400000) + 1;
    }
  
  };

  this.hasAvailableClimateData = function (index) {
    return this._data[index].length > 0;
  };

};
