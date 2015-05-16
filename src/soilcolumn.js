
var SoilColumn = function (gps, sp, cpp) {

  // private properties
  var that = this;
  this.generalParams = gps;
  this.soilParams = sp;
  this.centralParameterProvider = cpp;
  this.cropGrowth = null;
  this._delayedNMinApplications = []; 
  this._vf_TopDressing = 0.0;
  this._vf_TopDressingDelay = 0;
  this._vs_NumberOfOrganicLayers = 0;


  var soilColumnArray = [];
  // public properties and methods
  soilColumnArray.vs_SurfaceWaterStorage = 0.0;
  soilColumnArray.vs_InterceptionStorage = 0.0;
  soilColumnArray.vm_GroundwaterTable = 0;
  soilColumnArray.vs_FluxAtLowerBoundary = 0.0;
  soilColumnArray.vq_CropNUptake = 0.0;
  soilColumnArray.vs_SoilLayers = [];

  logger(MSG.INFO, "Constructor: SoilColumn "  + sp.length);

  for (var i = 0; i < this.soilParams.length; i++) {
    var layer = new SoilLayer(gps.ps_LayerThickness[0], sp[i], cpp);
    soilColumnArray.vs_SoilLayers.push(layer);
    soilColumnArray[i] = layer;
  }

  soilColumnArray.applyMineralFertiliser = function (fp, amount) {

    // C++
    // [kg N ha-1 -> kg m-3]
    // soilLayer(0).vs_SoilNO3 += amount * fp.getNO3() / 10000.0 / soilLayer(0).vs_LayerThickness;
    // soilLayer(0).vs_SoilNH4 += amount * fp.getNH4() / 10000.0 / soilLayer(0).vs_LayerThickness;
    // soilLayer(0).vs_SoilCarbamid += amount * fp.getCarbamid() / 10000.0 / soilLayer(0).vs_LayerThickness;

    // JS
    // [kg N ha-1 -> kg m-3]
    this[0].vs_SoilNO3 += amount * fp.getNO3() / 10000.0 / this[0].vs_LayerThickness;
    this[0].vs_SoilNH4 += amount * fp.getNH4() / 10000.0 / this[0].vs_LayerThickness;
    this[0].vs_SoilCarbamid += amount * fp.getCarbamid() / 10000.0 / this[0].vs_LayerThickness;

    if (DEBUG && this[0].vs_SoilNH4 < 0)
      throw new Error(this[0].vs_SoilNH4);
  };

  // prüft ob top-dressing angewendet werden sollte, ansonsten wird
  // zeitspanne nur reduziert

  /**
   * Tests for every calculation step if a delayed fertilising should be applied.
   * If not, the delay time will be decremented. Otherwise the surplus fertiliser
   * stored in _vf_TopDressing is applied.
   *
   * @see ApplyFertiliser
   */
  soilColumnArray.applyPossibleTopDressing = function () {
    // do nothing if there is no active delay time
    if (that._vf_TopDressingDelay > 0) {
      // if there is a delay time, decrement this value for this time step
      that._vf_TopDressingDelay--;
      // test if now is the correct time for applying top dressing
      if (that._vf_TopDressingDelay == 0) {
        var amount = that._vf_TopDressing;
        this.applyMineralFertiliser(that._vf_TopDressingPartition, amount);
        that._vf_TopDressing = 0;
        return amount;
      }
    }
    return 0.0;
  };


  /**
   * Calls function for applying delayed fertilizer and
   * then removes the first fertilizer item in list.
   */
  soilColumnArray.applyPossibleDelayedFerilizer = function () {
    var delayedApps = that._delayedNMinApplications;
    var n_amount = 0.0;
    while(!delayedApps.length === 0) {
      n_amount += delayedApps[0].func.apply(this, delayedApps[0].args);
      delayedApps.shift();
      // JS: delayedApps === _delayedNMinApplications
      if (DEBUG && delayedApps != _delayedNMinApplications)
        throw new Error(delayedApps);
      // _delayedNMinApplications.shift();
    }
    return n_amount;
  };


  /**
   * Method for calculating fertilizer demand from crop demand and soil mineral
   * status (Nmin method).
   *
   * @param fp
   * @param vf_SamplingDepth
   * @param vf_CropNTarget N availability required by the crop down to rooting depth
   * @param vf_CropNTarget30 N availability required by the crop down to 30 cm
   * @param vf_FertiliserMaxApplication Maximal value of N that can be applied until the crop will be damaged
   * @param vf_FertiliserMinApplication Threshold value for economically reasonable fertilizer application
   * @param vf_TopDressingDelay Number of days for which the application of surplus fertilizer is delayed
   */
  soilColumnArray.applyMineralFertiliserViaNMinMethod = function (
    fp,
    vf_SamplingDepth,
    vf_CropNTarget,
    vf_CropNTarget30,
    vf_FertiliserMinApplication,
    vf_FertiliserMaxApplication,
    vf_TopDressingDelay 
  ) {

    // JS: soilLayer(x) === this[x]

    // Wassergehalt > Feldkapazität
    if(this[0].get_Vs_SoilMoisture_m3() > this[0].get_FieldCapacity()) {
      that._delayedNMinApplications.push({
        func: this.applyMineralFertiliserViaNMinMethod,
        args: [fp, vf_SamplingDepth, vf_CropNTarget, vf_CropNTarget30, vf_FertiliserMinApplication, vf_FertiliserMaxApplication, vf_TopDressingDelay]
      });
      logger(MSG.WARN, "Soil too wet for fertilisation. Fertiliser event adjourned to next day.");
      return 0.0;
    }

    var vf_SoilNO3Sum = 0.0;
    var vf_SoilNO3Sum30 = 0.0;
    var vf_SoilNH4Sum = 0.0;
    var vf_SoilNH4Sum30 = 0.0;
    var vf_Layer30cm = this.getLayerNumberForDepth(0.3);

    // JS
    var i_Layers = ceil(vf_SamplingDepth / this[i_Layer].vs_LayerThickness);
    for (var i_Layer = 0; i_Layer < i_Layers; i_Layer++) {
      //vf_TargetLayer is in cm. We want number of layers
      vf_SoilNO3Sum += this[i_Layer].vs_SoilNO3; //! [kg N m-3]
      vf_SoilNH4Sum += this[i_Layer].vs_SoilNH4; //! [kg N m-3]
    }

    // Same calculation for a depth of 30 cm
    /** @todo Must be adapted when using variable layer depth. */
    for(var i_Layer = 0; i_Layer < vf_Layer30cm; i_Layer++) {
      vf_SoilNO3Sum30 += this[i_Layer].vs_SoilNO3; //! [kg N m-3]
      vf_SoilNH4Sum30 += this[i_Layer].vs_SoilNH4; //! [kg N m-3]
    }

    // Converts [kg N ha-1] to [kg N m-3]
    var vf_CropNTargetValue = vf_CropNTarget / 10000.0 / this[0].vs_LayerThickness;

    // Converts [kg N ha-1] to [kg N m-3]
    var vf_CropNTargetValue30 = vf_CropNTarget30 / 10000.0 / this[0].vs_LayerThickness;

    var vf_FertiliserDemandVol = vf_CropNTargetValue - (vf_SoilNO3Sum + vf_SoilNH4Sum);
    var vf_FertiliserDemandVol30 = vf_CropNTargetValue30 - (vf_SoilNO3Sum30 + vf_SoilNH4Sum30);

    // Converts fertiliser demand back from [kg N m-3] to [kg N ha-1]
    var vf_FertiliserDemand = vf_FertiliserDemandVol * 10000.0 * this[0].vs_LayerThickness;
    var vf_FertiliserDemand30 = vf_FertiliserDemandVol30 * 10000.0 * this[0].vs_LayerThickness;

    var vf_FertiliserRecommendation = max(vf_FertiliserDemand, vf_FertiliserDemand30);

    if (vf_FertiliserRecommendation < vf_FertiliserMinApplication) {
      // If the N demand of the crop is smaller than the user defined
      // minimum fertilisation then no need to fertilise
      vf_FertiliserRecommendation = 0.0;
      logger(MSG.WARN, "Fertiliser demand below minimum application value. No fertiliser applied.");
    }

    if( vf_FertiliserRecommendation > vf_FertiliserMaxApplication) {
      // If the N demand of the crop is greater than the user defined
      // maximum fertilisation then need to split so surplus fertilizer can
      // be applied after a delay time
      that._vf_TopDressing = vf_FertiliserRecommendation - vf_FertiliserMaxApplication;
      that._vf_TopDressingPartition = fp;
      that._vf_TopDressingDelay = vf_TopDressingDelay;
      vf_FertiliserRecommendation = vf_FertiliserMaxApplication;
      logger(MSG.WARN, 
        "Fertiliser demand above maximum application value. " +
        "A top dressing of " + _vf_TopDressing + " " + 
        "will be applied from now on day" + vf_TopDressingDelay + "."
       );
    }

    //Apply fertiliser
    this.applyMineralFertiliser(fp, vf_FertiliserRecommendation);

    logger(MSG.INFO, "SoilColumn::applyMineralFertiliserViaNMinMethod:\t" + vf_FertiliserRecommendation);

    //apply the callback to all of the fertiliser, even though some if it
    //(the top-dressing) will only be applied later
    //we simply assume it really will be applied, in the worst case
    //the delay is so long, that the crop is already harvested until
    //the top-dressing will be applied
     return vf_FertiliserRecommendation;// + _vf_TopDressing);
  };

  /**
   * Method for calculating irrigation demand from soil moisture status.
   * The trigger will be activated and deactivated according to crop parameters
   * (temperature sum)
   *
   * @param vi_IrrigationThreshold
   * @return could irrigation be applied
   */
  soilColumnArray.soilColumnArrayapplyIrrigationViaTrigger = function (
    vi_IrrigationThreshold,
    vi_IrrigationAmount,
    vi_IrrigationNConcentration
  ) {

    // JS: soilLayer(x) === this[x]


    //is actually only called from cropStep and thus there should always
    //be a crop
    if (that.cropGrowth === null)
      logger(MSG.ERROR, "crop is null");

    var s = that.cropGrowth.get_HeatSumIrrigationStart();
    var e = that.cropGrowth.get_HeatSumIrrigationEnd();
    var cts = that.cropGrowth.get_CurrentTemperatureSum();

    if (cts < s || cts > e) return false;

    var vi_CriticalMoistureDepth = that.centralParameterProvider.userSoilMoistureParameters.pm_CriticalMoistureDepth;

    // Initialisation
    var vi_ActualPlantAvailableWater = 0.0;
    var vi_MaxPlantAvailableWater = 0.0;
    var vi_PlantAvailableWaterFraction = 0.0;
    var vi_CriticalMoistureLayer = toInt(ceil(vi_CriticalMoistureDepth / that[0].vs_LayerThickness));

    for (var i_Layer = 0; i_Layer < vi_CriticalMoistureLayer; i_Layer++){
      vi_ActualPlantAvailableWater += (this[i_Layer].get_Vs_SoilMoisture_m3()
                                   - this[i_Layer].get_PermanentWiltingPoint())
                                   * this.vs_LayerThickness() * 1000.0; // [mm]
      vi_MaxPlantAvailableWater += (this[i_Layer].get_FieldCapacity()
                                   - this[i_Layer].get_PermanentWiltingPoint())
                                   * this.vs_LayerThickness() * 1000.0; // [mm]
      vi_PlantAvailableWaterFraction = vi_ActualPlantAvailableWater
                                         / vi_MaxPlantAvailableWater; // []
    }
    if (vi_PlantAvailableWaterFraction <= vi_IrrigationThreshold) {
      this.applyIrrigation(vi_IrrigationAmount, vi_IrrigationNConcentration);

      logger(MSG.INFO, 
        "applying automatic irrigation treshold: " + vi_IrrigationThreshold +
        " amount: " + vi_IrrigationAmount +
        " N concentration: " + vi_IrrigationNConcentration
      );

      return true;
    }

    return false;
  };

  /**
   * @brief Applies irrigation
   *
   * @author: Claas Nendel
   */
  soilColumnArray.applyIrrigation = function (vi_IrrigationAmount, vi_IrrigationNConcentration) {

    // JS: soilLayer(x) === this[x]

    var vi_NAddedViaIrrigation = 0.0; //[kg m-3]

    // Adding irrigation water amount to surface water storage
    this.vs_SurfaceWaterStorage += vi_IrrigationAmount; // [mm]

    vi_NAddedViaIrrigation = vi_IrrigationNConcentration * // [mg dm-3]
             vi_IrrigationAmount / //[dm3 m-2]
             this[0].vs_LayerThickness / 1000000.0; // [m]
             // [-> kg m-3]

    // Adding N from irrigation water to top soil nitrate pool
    this[0].vs_SoilNO3 += vi_NAddedViaIrrigation;
  };

  /**
   * @brief Checks and deletes AOM pool
   *
   * This method checks the content of each AOM Pool. In case the sum over all
   * layers of a respective pool is very low the pool will be deleted from the
   * list.
   *
   * @author: Claas Nendel
   */
  soilColumnArray.deleteAOMPool = function () {

    // JS: soilLayer(x) === this[x]
     // !JS do not remove first pool (root decay) start with index 1
    for (var i_AOMPool = 1; i_AOMPool < this[0].vo_AOM_Pool.length;) {

      var vo_SumAOM_Slow = 0.0;
      var vo_SumAOM_Fast = 0.0;

      for (var i_Layer = 0; i_Layer < that._vs_NumberOfOrganicLayers; i_Layer++) {
        vo_SumAOM_Slow += this[i_Layer].vo_AOM_Pool[i_AOMPool].vo_AOM_Slow;
        vo_SumAOM_Fast += this[i_Layer].vo_AOM_Pool[i_AOMPool].vo_AOM_Fast;
      }

      //cout << "Pool " << i_AOMPool << " -> Slow: " << vo_SumAOM_Slow << "; Fast: " << vo_SumAOM_Fast << endl;

      if ((vo_SumAOM_Slow + vo_SumAOM_Fast) < 0.00001) {
        for (var i_Layer = 0; i_Layer < that._vs_NumberOfOrganicLayers; i_Layer++){
          var it_AOMPool = 0; // TODO: Korrekt in JS? Konstruktion nicht klar
          it_AOMPool += i_AOMPool;
          this[i_Layer].vo_AOM_Pool.splice(it_AOMPool, 1);
        }
      } else {
        i_AOMPool++;
      }
    }

  };

  soilColumnArray.vs_NumberOfLayers = function () {
    return this.length;
  };

  /**
   * Applies tillage to effected layers. Parameters for effected soil layers
   * are averaged.
   * @param depth Depth of affected soil.
   */
  soilColumnArray.applyTillage = function (depth) {

    // JS: soilLayer(x) === this[x]

    var layer_index = this.getLayerNumberForDepth(depth) + 1;

    var soil_organic_carbon = 0.0;
    var soil_organic_matter = 0.0;
    var soil_temperature = 0.0;
    var soil_moisture = 0.0;
    var soil_moistureOld = 0.0;
    var som_slow = 0.0;
    var som_fast = 0.0;
    var smb_slow = 0.0;
    var smb_fast = 0.0;
    var carbamid = 0.0;
    var nh4 = 0.0;
    var no2 = 0.0;
    var no3 = 0.0;

    // add up all parameters that are affected by tillage
    for (var i = 0; i < layer_index; i++) {
      soil_organic_carbon += this[i].vs_SoilOrganicCarbon();
      soil_organic_matter += this[i].vs_SoilOrganicMatter();
      soil_temperature += this[i].get_Vs_SoilTemperature();
      soil_moisture += this[i].get_Vs_SoilMoisture_m3();
      soil_moistureOld += this[i].vs_SoilMoistureOld_m3;
      som_slow += this[i].vs_SOM_Slow;
      som_fast += this[i].vs_SOM_Fast;
      smb_slow += this[i].vs_SMB_Slow;
      smb_fast += this[i].vs_SMB_Fast;
      carbamid += this[i].vs_SoilCarbamid;
      nh4 += this[i].vs_SoilNH4;
      no2 += this[i].vs_SoilNO2;
      no3 += this[i].vs_SoilNO3;
    }

    if (DEBUG && this[0].vs_SoilNH4 < 0)
      throw new Error(this[0].vs_SoilNH4);
    if (DEBUG && this[0].vs_SoilNO2 < 0)
      throw new Error(this[0].vs_SoilNO2);
    if (DEBUG && this[0].vs_SoilNO3 < 0)
      throw new Error(this[0].vs_SoilNO3);

    // calculate mean value of accumulated soil paramters
    soil_organic_carbon = soil_organic_carbon / layer_index;
    soil_organic_matter = soil_organic_matter / layer_index;
    soil_temperature = soil_temperature / layer_index;
    soil_moisture = soil_moisture / layer_index;
    soil_moistureOld = soil_moistureOld / layer_index;
    som_slow = som_slow / layer_index;
    som_fast = som_fast / layer_index;
    smb_slow = smb_slow / layer_index;
    smb_fast = smb_fast / layer_index;
    carbamid = carbamid / layer_index;
    nh4 = nh4 / layer_index;
    no2 = no2 / layer_index;
    no3 = no3 / layer_index;

    // use calculated mean values for all affected layers
    for (var i = 0; i < layer_index; i++) {

      //assert((soil_organic_carbon - (soil_organic_matter * ORGANIC_CONSTANTS.PO_SOM_TO_C)) < 0.00001);
      this[i].set_SoilOrganicCarbon(soil_organic_carbon);
      this[i].set_SoilOrganicMatter(soil_organic_matter);
      this[i].set_Vs_SoilTemperature(soil_temperature);
      this[i].set_Vs_SoilMoisture_m3(soil_moisture);
      this[i].vs_SoilMoistureOld_m3 = soil_moistureOld;
      this[i].vs_SOM_Slow = som_slow;
      this[i].vs_SOM_Fast = som_fast;
      this[i].vs_SMB_Slow = smb_slow;
      this[i].vs_SMB_Fast = smb_fast;
      this[i].vs_SoilCarbamid = carbamid;
      this[i].vs_SoilNH4 = nh4;
      this[i].vs_SoilNO2 = no2;
      this[i].vs_SoilNO3 = no3;
      
      if (DEBUG && this[i].vs_SoilNH4 < 0)
        throw new Error(this[i].vs_SoilNH4);
      if (DEBUG && this[i].vs_SoilNO2 < 0)
        throw new Error(this[i].vs_SoilNO2);
      if (DEBUG && this[i].vs_SoilNO3 < 0)
        throw new Error(this[i].vs_SoilNO3);

    }

    // merge aom pool
    var aom_pool_count = this[0].vo_AOM_Pool.length;

    if (aom_pool_count > 0) {
      var aom_slow = new Array(aom_pool_count);
      var aom_fast = new Array(aom_pool_count);

      // initialization of aom pool accumulator
      for (var pool_index = 0; pool_index < aom_pool_count; pool_index++) {
        aom_slow[pool_index] = 0.0;
        aom_fast[pool_index] = 0.0;
      }

      layer_index = min(layer_index, this.vs_NumberOfOrganicLayers());

      //cout << "Soil parameters before applying tillage for the first "<< layer_index+1 << " layers: " << endl;

      // add up pools for affected layer with same index
      for (var j = 0; j < layer_index; j++) {
        //cout << "Layer " << j << endl << endl;

        var layer = this[j];
        var pool_index = 0;
        layer.vo_AOM_Pool.forEach(function (it_AOM_Pool) {

          aom_slow[pool_index] += it_AOM_Pool.vo_AOM_Slow;
          aom_fast[pool_index] += it_AOM_Pool.vo_AOM_Fast;

          //cout << "AOMPool " << pool_index << endl;
          //cout << "vo_AOM_Slow:\t"<< it_AOM_Pool.vo_AOM_Slow << endl;
          //cout << "vo_AOM_Fast:\t"<< it_AOM_Pool.vo_AOM_Fast << endl;

          pool_index++;
        });
      }

      //
      for (var pool_index = 0; pool_index < aom_pool_count; pool_index++) {
        aom_slow[pool_index] = aom_slow[pool_index] / (layer_index);
        aom_fast[pool_index] = aom_fast[pool_index] / (layer_index);
      }

      //cout << "Soil parameters after applying tillage for the first "<< layer_index+1 << " layers: " << endl;

      // rewrite parameters of aom pool with mean values
      for (var j = 0; j < layer_index; j++) {
        layer = this[j];
        //cout << "Layer " << j << endl << endl;
        var pool_index = 0;
        layer.vo_AOM_Pool.forEach(function (it_AOM_Pool) {

          it_AOM_Pool.vo_AOM_Slow = aom_slow[pool_index];
          it_AOM_Pool.vo_AOM_Fast = aom_fast[pool_index];

          //cout << "AOMPool " << pool_index << endl;
          //cout << "vo_AOM_Slow:\t"<< it_AOM_Pool.vo_AOM_Slow << endl;
          //cout << "vo_AOM_Fast:\t"<< it_AOM_Pool.vo_AOM_Fast << endl;

          pool_index++;
        });
      }
    }

    //cout << "soil_organic_carbon: " << soil_organic_carbon << endl;
    //cout << "soil_organic_matter: " << soil_organic_matter << endl;
    //cout << "soil_temperature: " << soil_temperature << endl;
    //cout << "soil_moisture: " << soil_moisture << endl;
    //cout << "soil_moistureOld: " << soil_moistureOld << endl;
    //cout << "som_slow: " << som_slow << endl;
    //cout << "som_fast: " << som_fast << endl;
    //cout << "smb_slow: " << smb_slow << endl;
    //cout << "smb_fast: " << smb_fast << endl;
    //cout << "carbamid: " << carbamid << endl;
    //cout << "nh4: " << nh4 << endl;
    //cout << "no3: " << no3 << endl << endl;
  };

  /**
   * Returns number of organic layers. Usually the number
   * of layers in the first 30 cm depth of soil.
   * @return Number of organic layers
   */
  soilColumnArray.vs_NumberOfOrganicLayers = function () {
    return that._vs_NumberOfOrganicLayers;
  };


  /**
   * Returns a soil layer at given Index.
   * @return Reference to a soil layer
   */
  soilColumnArray.soilLayer = function (i_Layer) {
    return this[i_Layer];
  };

  /**
   * Returns the thickness of a layer.
   * Right now by definition all layers have the same size,
   * therefor only the thickness of first layer is returned.
   *
   * @return Size of a layer
   *
   * @todo Need to be changed if different layer sizes are used.
   */
  soilColumnArray.vs_LayerThickness = function () {
    return this[0].vs_LayerThickness;
  };

  /**
   * @brief Returns daily crop N uptake [kg N ha-1 d-1]
   * @return Daily crop N uptake
   */
  soilColumnArray.get_DailyCropNUptake = function () {
    return this.vq_CropNUptake * 10000.0;
  };

  /**
   * @brief Returns index of layer that lays in the given depth.
   * @param depth Depth in meters
   * @return Index of layer
   */
  soilColumnArray.getLayerNumberForDepth = function (depth) {

    var layer = 0;
    var size= this.length;
    var accu_depth = 0;
    var layer_thickness= this[0].vs_LayerThickness;

    // find number of layer that lay between the given depth
    for (var i = 0; i < size; i++) {
      accu_depth += layer_thickness;
      if (depth <= accu_depth)
        break;
      layer++;
    }

    return layer;
  };

  /**
   * @brief Makes crop information available when needed.
   *
   * @return crop object
   */
  soilColumnArray.put_Crop = function (c) {
      that.cropGrowth = c;
  };

  /**
   * @brief Deletes crop object when not needed anymore.
   *
   * @return crop object is NULL
   */
  soilColumnArray.remove_Crop = function () {
      that.cropGrowth = null;
  };

  /**
   * Returns sum of soiltemperature for several soil layers.
   * @param layers Number of layers that are of interest
   * @return Temperature sum
   */
  soilColumnArray.sumSoilTemperature = function (layers) {
    var accu = 0.0;
    for (var i = 0; i < layers; i++)
      accu += this[i].get_Vs_SoilTemperature();
    return accu;
  };

  soilColumnArray.vs_NumberOfLayers = function () {
      return this.length;
  };



  // end soilColumnArray

  // private methods

  /**
   * @brief Calculates number of organic layers.
   *
   * Calculates number of organic layers in in in dependency on
   * the layer depth and the ps_MaxMineralisationDepth. Result is saved
   * in private member variable _vs_NumberOfOrganicLayers.
   */
  var set_vs_NumberOfOrganicLayers = function () {
    var lsum = 0;
    var count = 0;
    for (var i = 0; i < soilColumnArray.vs_NumberOfLayers(); i++) {
      count++;
      lsum += soilColumnArray.vs_SoilLayers[i].vs_LayerThickness;
      if (lsum >= that.generalParams.ps_MaxMineralisationDepth)
        break;
    }
    that._vs_NumberOfOrganicLayers = count;
  };

  // apply set_vs_NumberOfOrganicLayers
  set_vs_NumberOfOrganicLayers();

  // !JS create a default root decay pool at index 0 that gets not deleted
  for(var i_Layer = 0; i_Layer < that._vs_NumberOfOrganicLayers; i_Layer++) {
    var aom = new AOM_Properties();
    /* parameters from wheat residuals. TODO: look for specific parameters for root decay in DAISY */
      aom.vo_AOM_DryMatterContent = 1;
      aom.vo_AOM_NH4Content = 0;
      aom.vo_AOM_NO3Content = 0;
      aom.vo_AOM_CarbamidContent = 0;
      aom.vo_AOM_SlowDecCoeffStandard = 0.012;
      aom.vo_AOM_FastDecCoeffStandard = 0.05;
      aom.vo_PartAOM_to_AOM_Slow = 0.67;
      aom.vo_PartAOM_to_AOM_Fast = 0.33;
      aom.vo_CN_Ratio_AOM_Slow = 200;
      aom.vo_CN_Ratio_AOM_Fast = 0;
      aom.vo_PartAOM_Slow_to_SMB_Slow = 0.5;
      aom.vo_PartAOM_Slow_to_SMB_Fast = 0.5;
      aom.vo_NConcentration = 0;
    soilColumnArray[i_Layer].vo_AOM_Pool[0] = aom;
  }

  return soilColumnArray;

};
