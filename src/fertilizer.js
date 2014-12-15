
var MineralFertilizer = function (name, carbamid, no3, nh4) {

  var name = name
    , vo_Carbamid = carbamid // [kg kg-1]
    , vo_NH4 = nh4           // [kg kg-1]
    , vo_NO3 = no3           // [kg kg-1]
    ;

  return {

    getName: function () { 
      return name; 
    },
    getCarbamid: function () { 
      return vo_Carbamid; 
    },
    getNH4: function () { 
      return vo_NH4; 
    },
    getNO3: function () { 
      return vo_NO3; 
    },
    setName: function (_name) { 
      name = name_; 
    },
    setCarbamid: function (_vo_Carbamid) {
      vo_Carbamid = _vo_Carbamid;
    },
    setNH4: function (_vo_NH4) { 
      vo_NH4 = _vo_NH4; 
    },
    setNO3: function (_vo_NO3) { 
      vo_NO3 = _vo_NO3; 
    }
    
  };

};


var OrganicFertilizer = function (omp) {

  this.name = "";
  this.vo_AOM_DryMatterContent = omp.vo_AOM_DryMatterContent | 0.0;
  this.vo_AOM_NH4Content = omp.vo_AOM_NH4Content | 0.0;
  this.vo_AOM_NO3Content = omp.vo_AOM_NO3Content | 0.0;
  this.vo_AOM_CarbamidContent = omp.vo_AOM_CarbamidContent | 0.0;
  this.vo_AOM_SlowDecCoeffStandard = omp.vo_AOM_SlowDecCoeffStandard | 0.0;
  this.vo_AOM_FastDecCoeffStandard = omp.vo_AOM_FastDecCoeffStandard | 0.0;
  this.vo_PartAOM_to_AOM_Slow = omp.vo_PartAOM_to_AOM_Slow | 0.0;
  this.vo_PartAOM_to_AOM_Fast = omp.vo_PartAOM_to_AOM_Fast | 0.0;
  this.vo_CN_Ratio_AOM_Slow = omp.vo_CN_Ratio_AOM_Slow | 0.0;
  this.vo_CN_Ratio_AOM_Fast = omp.vo_CN_Ratio_AOM_Fast | 0.0;
  this.vo_PartAOM_Slow_to_SMB_Slow = omp.vo_PartAOM_Slow_to_SMB_Slow | 0.0;
  this.vo_PartAOM_Slow_to_SMB_Fast = omp.vo_PartAOM_Slow_to_SMB_Fast | 0.0;
  this.vo_NConcentration = 0.0;

};
