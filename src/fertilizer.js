/*
  Originally derived, ported from MONICA
  Find details on copywrite & license in the relevant source files at https://github.com/zalf-lsa/monica.
*/

var MineralFertilizer = function (name, carbamid, no3, nh4) {

  var _name = (name !== undefined && name !== null) ? name.toLowerCase() : ''
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
  } else if (_name !== undefined) {
    logger(MSG_INFO, 'Custom mineral fertilzer.');
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


var OrganicFertilizer = function (name, carbamid, no3, nh4, dm) {

  this.name = (name !== undefined && name !== null) ? name.toLowerCase() : '';

  this.vo_AOM_DryMatterContent = dm || 0.0;       // [kg (DM) kg-1 (FM)]
  this.vo_AOM_NH4Content = nh4 || 0.0;            // [kg (N)  kg-1 (DM)]
  this.vo_AOM_NO3Content = no3 || 0.0;            // [kg (N)  kg-1 (DM)]
  this.vo_AOM_CarbamidContent = carbamid || 0.0;  // [kg (N)  kg-1 (DM)]
  this.vo_AOM_SlowDecCoeffStandard = 0.0002;
  this.vo_AOM_FastDecCoeffStandard = 0.002;
  this.vo_PartAOM_to_AOM_Slow = 0.72;
  this.vo_PartAOM_to_AOM_Fast = 0.18;
  this.vo_CN_Ratio_AOM_Slow = 100;
  this.vo_CN_Ratio_AOM_Fast = 6.5;
  this.vo_PartAOM_Slow_to_SMB_Slow = 0;
  this.vo_PartAOM_Slow_to_SMB_Fast = 1;
  this.vo_NConcentration = 0.00;
  this.vo_DaysAfterApplication = 0;

  if (this.name === 'cattle deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.289;
    this.vo_AOM_NH4Content = 0.007;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 7.3;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'cattle manure') {
    this.vo_AOM_DryMatterContent = 0.196;
    this.vo_AOM_NH4Content = 0.007;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 6.5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'cattle slurry') {
    this.vo_AOM_DryMatterContent = 0.103;
    this.vo_AOM_NH4Content = 0.032;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 6.1;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'cattle urine') {
    this.vo_AOM_DryMatterContent = 0.033;
    this.vo_AOM_NH4Content = 0.146;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 8.4;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'duck or goose deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.35;
    this.vo_AOM_NH4Content = 0.024;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 2.1;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'green-waste compost') {
    this.vo_AOM_DryMatterContent = 0.5;
    this.vo_AOM_NH4Content = 0.002;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 8;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'horse deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.26;
    this.vo_AOM_NH4Content = 0.008;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 5.3;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'maize straw') {
    this.vo_AOM_DryMatterContent = 0.85;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 50;
    this.vo_CN_Ratio_AOM_Fast = 6;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'mushroom compost') {
    this.vo_AOM_DryMatterContent = 0.39;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 6;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'oilseed-rape cake fert. (5-1-10)') {
    this.vo_AOM_DryMatterContent = 0.9;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.012;
    this.vo_AOM_FastDecCoeffStandard = 0.05;
    this.vo_PartAOM_to_AOM_Slow = 0.38;
    this.vo_PartAOM_to_AOM_Fast = 0.62;
    this.vo_CN_Ratio_AOM_Slow = 47.7;
    this.vo_CN_Ratio_AOM_Fast = 6;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'pig deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.33;
    this.vo_AOM_NH4Content = 0.009;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 4.8;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'pig manue') {
    this.vo_AOM_DryMatterContent = 0.039;
    this.vo_AOM_NH4Content = 0.014;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'pig slurry') {
    this.vo_AOM_DryMatterContent = 0.054;
    this.vo_AOM_NH4Content = 0.068;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 5.7;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'pig slurry-dk') {
    this.vo_AOM_DryMatterContent = 0.05;
    this.vo_AOM_NH4Content = 0.08;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 85;
    this.vo_CN_Ratio_AOM_Fast = 5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'pig urine') {
    this.vo_AOM_DryMatterContent = 0.02;
    this.vo_AOM_NH4Content = 0.162;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 7.3;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'potato liquid waste') {
    this.vo_AOM_DryMatterContent = 0.02;
    this.vo_AOM_NH4Content = 0.028;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 4.5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'poultry deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.633;
    this.vo_AOM_NH4Content = 0.037;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 1.3;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'poultry manure') {
    this.vo_AOM_DryMatterContent = 0.4;
    this.vo_AOM_NH4Content = 0.019;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 3.5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'sewage sludge') {
    this.vo_AOM_DryMatterContent = 0.141;
    this.vo_AOM_NH4Content = 0.089;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 0.5;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'soybean straw') {
    this.vo_AOM_DryMatterContent = 0.85;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 30;
    this.vo_CN_Ratio_AOM_Fast = 6;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'turkey deep-litter manure') {
    this.vo_AOM_DryMatterContent = 0.48;
    this.vo_AOM_NH4Content = 0.038;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 1.3;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'weeds') {
    this.vo_AOM_DryMatterContent = 0.85;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 30;
    this.vo_CN_Ratio_AOM_Fast = 6;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'wheat straw') {
    this.vo_AOM_DryMatterContent = 0.85;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.72;
    this.vo_PartAOM_to_AOM_Fast = 0.18;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 8;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name === 'wood ashes') {
    this.vo_AOM_DryMatterContent = 1;
    this.vo_AOM_NH4Content = 0;
    this.vo_AOM_NO3Content = 0;
    this.vo_AOM_CarbamidContent = 0;
    this.vo_AOM_SlowDecCoeffStandard = 0.0002;
    this.vo_AOM_FastDecCoeffStandard = 0.002;
    this.vo_PartAOM_to_AOM_Slow = 0.9;
    this.vo_PartAOM_to_AOM_Fast = 0.1;
    this.vo_CN_Ratio_AOM_Slow = 100;
    this.vo_CN_Ratio_AOM_Fast = 10;
    this.vo_PartAOM_Slow_to_SMB_Slow = 0;
    this.vo_PartAOM_Slow_to_SMB_Fast = 1;
    this.vo_NConcentration = 0.00;
  } else if (this.name !== undefined) {
    logger(MSG_INFO, 'Custom organic fertilzer.');
  }

  this.vo_NConcentration = this.vo_AOM_NO3Content + this.vo_AOM_NH4Content + this.vo_AOM_CarbamidContent;

};
