'use strict';

var MineralFertilizer = function (name, carbamid, no3, nh4) {

  var _name = name.toLowerCase()
    , _vo_Carbamid = carbamid || 0 // [kg (N) kg-1 (N)]
    , _vo_NO3 = no3 || 0           // [kg (N) kg-1 (N)]
    , _vo_NH4 = nh4 || 0           // [kg (N) kg-1 (N)]
    ;

  if (_name === 'ammonium nitrate') {
    _vo_NO3 = 0.5;
    _vo_NH4 = 0.5;
    _vo_Carbamid = 0;
  } else if (_name === 'ammonium phosphate') {
    _vo_NO3 = 0;
    _vo_NH4 = 1;
    _vo_Carbamid = 0;
  } else if (_name === 'ammonium sulphate') {
    _vo_NO3 = 0;
    _vo_NH4 = 1;
    _vo_Carbamid = 0;
  } else if (_name === 'potassium nitrate') {
    _vo_NO3 = 1;
    _vo_NH4 = 0;
    _vo_Carbamid = 0;
  } else if (_name === 'compound fertiliser (0 no3, 100 nh4)') {
    _vo_NO3 = 0;
    _vo_NH4 = 1;
    _vo_Carbamid = 0;
  } else if (_name === 'compound fertiliser (35 no3, 65 nh4)') {
    _vo_NO3 = 0.35;
    _vo_NH4 = 0.65;
    _vo_Carbamid = 0;
  } else if (_name === 'compound fertiliser (43 no3, 57 nh4)') {
    _vo_NO3 = 0.435;
    _vo_NH4 = 0.565;
    _vo_Carbamid = 0;
  } else if (_name === 'compound fertiliser (50 no3, 50 nh4)') {
    _vo_NO3 = 0.5;
    _vo_NH4 = 0.5;
    _vo_Carbamid = 0;
  } else if (_name === 'urea') {
    _vo_NO3 = 0;
    _vo_NH4 = 0;
    _vo_Carbamid = 1;
  } else if (_name === 'urea ammonium nitrate') {
    _vo_NO3 = 0.25;
    _vo_NH4 = 0.25;
    _vo_Carbamid = 0.5;
  } else if (_name === 'urea ammonium sulphate') {
    _vo_NO3 = 0;
    _vo_NH4 = 0.18;
    _vo_Carbamid = 0.82;
  }

  return {

    getName: function () { 
      return _name; 
    },
    getCarbamid: function () { 
      return _vo_Carbamid; 
    },
    getNH4: function () { 
      return _vo_NH4; 
    },
    getNO3: function () { 
      return _vo_NO3; 
    }
    
  };

};


var OrganicFertilizer = function (name) {

  this.name = name.toLowerCase();
  this.vo_AOM_DryMatterContent = 0.0;
  this.vo_AOM_NH4Content = 0.0;
  this.vo_AOM_NO3Content = 0.0;
  this.vo_AOM_CarbamidContent = 0.0;
  this.vo_AOM_SlowDecCoeffStandard = 0.0;
  this.vo_AOM_FastDecCoeffStandard = 0.0;
  this.vo_PartAOM_to_AOM_Slow = 0.0;
  this.vo_PartAOM_to_AOM_Fast = 0.0;
  this.vo_CN_Ratio_AOM_Slow = 0.0;
  this.vo_CN_Ratio_AOM_Fast = 0.0;
  this.vo_PartAOM_Slow_to_SMB_Slow = 0.0;
  this.vo_PartAOM_Slow_to_SMB_Fast = 0.0;
  this.vo_NConcentration = 0.0;

  

};
