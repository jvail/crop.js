/*

  Changes:
    - var getWorkstep = function (date)

*/

var ProductionProcess = function (name, crop) {

var that = this
  , _name = name
  , _crop = crop
  , _worksteps = []
  , _cropResult = []
  ;
  
  _worksteps.equal_range = function (date) {
  var ws = [];
  this.forEach(function (w, i) {
    if (w.date().setHours(0,0,0,0) === date.setHours(0,0,0,0)) 
      ws.push(w)
  });
  return ws;
};

_worksteps.upper_bound = function (date) {
  for (var i = 0, is = this.length; i < is; i++) {
    if (this[i].date().setHours(0,0,0,0) > date.setHours(0,0,0,0))
      return this[i];
  }
  return null;
};

debug("ProductionProcess: " + name);
//_cropResult.id = _crop.id();

var addApplication = function (app) {

  _worksteps.push(app);
  _worksteps.sort(function (a_, b_) {
    var a = a_.date()
      , b = b_.date()
      ;
    return (a < b) ? -1 : ((a > b) ? 1 : 0);
  });

};

if ((crop.seedDate().setHours(0,0,0,0) != new Date(1951, 0, 1).setHours(0,0,0,0)) && (crop.seedDate().setHours(0,0,0,0) != new Date(0,0,0).setHours(0,0,0,0)))
  addApplication(new Seed(crop.seedDate(), crop));
if ((crop.harvestDate().setHours(0,0,0,0) != new Date(1951, 0, 1).setHours(0,0,0,0)) && (crop.harvestDate().setHours(0,0,0,0) != new Date(0,0,0).setHours(0,0,0,0)))
{
  addApplication(new Harvest(crop.harvestDate(), crop , _cropResult));
}


var cuttingDates = crop.getCuttingDates();
var size = cuttingDates.length;

for (var i=0; i<size; i++) {
  debug("Add cutting date: " + Date(cuttingDates[i].toString()));
  //    if (i<size-1) {
  addApplication(new Cutting(Date(cuttingDates.at(i)), crop));
  //    } else {
  //      addApplication(Harvest(crop.harvestDate(), crop, _cropResult));
  //    }
}

/**
 * @brief Copy constructor
 * @param new_pp
 */
/*
ProductionProcess::ProductionProcess(const ProductionProcess& other)
{
  _name = other._name;
  _crop = CropPtr(new Crop(*(other._crop.get())));
  _cropResult = PVResultPtr(new PVResult(*(other._cropResult.get())));

  _worksteps = other._worksteps;
}
*/

var deepCloneAndClearWorksteps = function () {
  // TODO:
  // ProductionProcess clone(name(), CropPtr(new Crop(*(crop().get()))));
  // clone._cropResult = PVResultPtr(new PVResult(*(_cropResult.get())));
  // return clone;
};

var apply = function (date, model) {
  var p = _worksteps.equal_range(date);
  p.forEach(function (ws) {
    ws.apply(model);
  });
};

var nextDate = function (date) {
  var p = _worksteps.upper_bound(date);
  return !p ? new Date(Infinity) : p.date();
};

var getWorkstep = function (date) {
  var ws_ = null;
  _worksteps.forEach(function (ws) {
    if (ws.date().setHours(0, 0, 0, 0) === date.setHours(0, 0, 0, 0))
      ws_ = ws;
  });
  return ws_;
};

var start = function () {
  if (_worksteps.length === 0)
    return new Date(Infinity);
  return _worksteps[0].date();
};

var end = function () {
  if (_worksteps.length === 0)
    return new Date(Infinity);
  return _worksteps[_worksteps.length - 1];
};

var toString = function () {
  var s = "";
  s += "name: " + _name + " start: " + start().toString()
      + " end: " + end().toString() + "\n";
  s += "worksteps:" + "\n";
  var p = _worksteps.equal_range(date);
  p.forEach(function (ws) {
    s += "at: " + ws.date().toString()
        + " what: " + ws.toString() + "\n";
  });
  return s;
};


return {
  getWorkstep: getWorkstep,
  deepCloneAndClearWorksteps: deepCloneAndClearWorksteps,
  addApplication: addApplication,
  apply: apply,
  nextDate: nextDate,
  name: function () { 
    return _name; 
  },
  crop: function () { 
    return _crop; 
  },
  isFallow: function () { 
    return !_crop.isValid();  
  },
  //! when does the PV start
  start: start,
  //! when does the whole PV end
  end: end,
  getWorksteps:function () { 
    return _worksteps; 
  },
  clearWorksteps: function () { 
    _worksteps = []; 
  },
  toString: toString,
  // cropResult() const { return *(_cropResult.get()); }
  // cropResultPtr() const { return _cropResult; }
  //the custom id is used to keep a potentially usage defined
  //mapping to entity from another domain,
  //e.g. the an Carbiocial CropActivity which is ProductionProcess was based on
  setCustomId: function (cid) { 
    _customId = cid; 
  },
  // customId: function () { 
  //   return _customId; 
  // }
  cropResult: function () { 
    return _cropResult; 
  }
};

};
