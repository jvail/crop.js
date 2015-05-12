/*
  {
    species: [
      {
        type: 'generic grass',
        constants: { 
          h_m: 0.5, 
          L_half: 2.0 
        } 
      }
    , {
        type: 'generic grass',
        constants: { 
          h_m: 0.4, 
          L_half: 2.0 
        } 
      }
    ],
    DM: [] inital fraction of total dry matter
  }

  LICENSE

  The MIT License (MIT)
  Copywrite (c) 2015 Jan Vaillant (jan.vaillant@zalf.de)


  REFERENCES

  Johnson IR (2008). Biophysical pasture model documentation: model documentation for DairyMod. EcoMod and the SGS Pasture
  Model. (IMJ Consultants: Dorrigo, NSW)

  Johnson IR (2013). DairyMod and the SGS Pasture Model: a mathematical description of the biophysical model structure.
  IMJ Consultants, Dorrigo, NSW, Australia.


  README

  Important (somewhat experimental) deviations from the original approach:

  - Added a different (simpler) height(lai) function to better capture dm removal by height. 
*/

var Grass = function (seedDate, harvestDates, species) {
  
  this.mixture = null;
  this._seedDate = seedDate;
  this._harvestDates = harvestDates;

  var _accumulatedETa = 0.0
    , _appliedAmountIrrigation = 0
    , _cropHeight = 0.0
    , _crossCropAdaptionFactor = 1 
    , _cuttingDates = []
    , _cuttingYieldsDM = []
    , _harvestDate = new Date(Infinity)
    , _seedDate = new Date(Infinity)
    , _primaryYield = 0
    , _primaryYieldN = 0
    , _primaryYieldTM = 0
    , _secondaryYield = 0
    , _secondaryYieldN = 0
    , _secondaryYieldTM = 0
    , _sumTotalNUptake = 0
    ;

  /* species object to store species specific parameters for a mixture */
  var Species = function (options) {

    var that = this;

    /* defaults */
    this.isLegume = false;
    this.isC4 = false;
    this.type = 'generic grass';

    this.cons = {               //                             generic grass constants
        index: 0                // [#]                         index in mixture array at initialization (stored to restore orig. sorting)
      , f_cover: 1              // [m2 m-2]                    coverage (scales height to a full m2)
      , h_m: 0.5                // [m]                         maximum height 
      , L_half: 2.0             // [m2 (leaf) m-2 (ground)]    leaf area at half h_m
      , σ: 20.0                 // [m2 (leaf) kg-1 (DM)]       specific leaf area 
      , d_r_h: 0.15             // [m]                         depth at 50% root mass
      , d_r_mx: 0.4             // [m]                         maximum root depth
      , δ_ndf_live_l_1: 0.8     // [kg kg-1]                   NDF digestibility live leaf 1
      , δ_ndf_live_l_2: 0.5     // [kg kg-1]                   NDF digestibility live leaf 2
      , δ_ndf_live_l_3: 0.3     // [kg kg-1]                   NDF digestibility live leaf 3
      , δ_ndf_dead_l: 0.2       // [kg kg-1]                   NDF digestibility dead leaf
      , δ_ndf_live_s_1: 0.7     // [kg kg-1]                   NDF digestibility live stem 1
      , δ_ndf_live_s_2: 0.4     // [kg kg-1]                   NDF digestibility live stem 2
      , δ_ndf_live_s_3: 0.3     // [kg kg-1]                   NDF digestibility live stem 3
      , δ_ndf_dead_s: 0.2       // [kg kg-1]                   NDF digestibility live leaf
      , δ_nfc: 1                // [kg kg-1]                   NFC digestibility
      , T_mn_high: 5            // [°C]                        critical temperature below which low-temperature stress will occur
      , T_mn_low: 0             // [°C]                        critical temperature at which the low-temperature stress is maximum
      , T_mx_high: 35           // [°C]                        critical temperature at which the high-temperature stress is maximum
      , T_mx_low: 30            // [°C]                        critical temperature above which high-temperature stress will occur
      , T_sum_low: 100          // [°C]               low temperature stress recovery temperature sum
      , T_sum_high: 100          // [°C]              high temperature stress recovery temperature sum
      , photo: {                // photosynthesis
            T_ref: 20           // [°C]                        reference temperature
          , T_mn: 3             // [°C]                        minimum temperature 
          , T_opt_Pm_amb: 23    // [°C]                        optimum temperature
          , ξ: 0.8              // [-]                         non‐rectangular hyperbola curvatur parameter
          , α_amb_15: 0.05      // [mol (CO2) mol-1 (photons)] photosythetic efficiency α at ambient CO2 (C_amb_ref) and 15 °C
          , k: 0.5              // [-]                         leaf extinction coefficient
          , P_m_ref: 16         // [μmol (CO2) m-2 (leaf) s-1] reference value for P_m
          , λ: 1.2              // []                          CO2 response parameter
          , f_C_m: 1.49         // []                          CO2 response parameter
          , γ_Pm: 10            // []                          CO2 & T response parameter
          , λ_α: 0.02           // [°C]                        CO2 & T response parameter
          , γ_α: 6              // [°C]                        CO2 & T response parameter
        }
      , resp: {                 // respiration
            m_ref: 0.025        // [day-1]                     maintenance coeficient at reference temperature
          , T_ref: 20
          , T_m_mn: 3
          , λ_N_up: 0.6         // [kg (C) kg-1 (N)]           N uptake respiration coefficent
          , λ_N_fix: 6          // [kg (C) kg-1 (N)]           N fixation respiration coefficent
        }
      , part: {                 // partitioning
            ρ_shoot_ref: 0.75   // [-]                         reference shoot partitioning fraction
          , ρ_l_max: 0.7        // [-]                         fraction partitioned to leaf
          , GDD_flower: 500     // [C° d]                      growing degree days till flowering
        }
       /* TODO: remove or rename: */
      , N_leaf: {
            opt: 0.04 / 0.45
          , max: 0.045 / 0.45   // [kg (N) kg-1 (C)] AgPasture: 0.05 / 0.4 (NcleafOpt as fraction / C in DM as fraction)
          , ref: 0.04 / 0.45
       }
      , τ_veg: 200
      , fAsh_dm_l_ref: 0.09     // [kg (ash) kg-1 (DM)]       reference ash content leaf
      , fAsh_dm_s_ref: 0.04     // [kg (ash) kg-1 (DM)]       reference ash content stem
      , fAsh_dm_r_ref: 0.04     // [kg (ash) kg-1 (DM)]       reference ash content root
      , fH2O_fm_l_ref: 0.80     // [kg (H20) kg-1 (FM)]       reference water content leaf
      , fH2O_fm_s_ref: 0.70     // [kg (H20) kg-1 (FM)]       reference water content stem
    };

    this.vars = {               //                    variables
        GDD: 0                  // [°C day]           growing degree days
      , Ω_N: 1.0                // [0-1]              growth limiting factor nitrogen (1 = no stress)
      , Ω_water: 1.0            // [0-1]              growth limiting factor water (1 = no stress)
      , τ_T_low: 1.0            // [0-1]              growth limiting factor low temperature (1 = no stress)     
      , τ_T_high: 1.0           // [0-1]              growth limiting factor high temperature (1 = no stress)  
      , ζ_T_low: 0.0            // [0-1]  low temperature stress recovery coefficient 
      , ζ_T_high: 0.0           // [0-1]  low temperature stress recovery coefficient       , P_g_day: 0.0            // [kg (C) m-2]       daily canopy gross photosynthesis
      , R_m: 0.0                // [kg (C) m-2]       daily maintenance respiration
      , R_N: 0                  // [kg (C) m-2]       daily N uptake cost
      , G: 0.0                  // [kg (C) m-2]       daily net growth rate
      , G_leaf: 0               // [kg (C) m-2]       daily leaf growth
      , G_stem: 0               // [kg (C) m-2]       daily stem growth
      , G_root: 0               // [kg (C) m-2]       daily root growth
      , Y: 0.75                 // [-]                total growth efficiency
      , Y_leaf: 0.75            // [-]                leaf efficiency
      , Y_stem: 0.75            // [-]                stem growth efficiency
      , Y_root: 0.75            // [-]                root growth efficiency
      , d_r: 1.0                // [m]                root depth
      , τ: 0                    // [days]             no. of days in pheno. phase (e.g. vegetative) TODO: remove?
      , k_sum: 0                // [-]                pheno. phase developement (0-1)
      , N_up: 0                 // [kg (N) m-2]       daily N uptake
      , N_fix: 0                // [kg (N) m-2]       daily N fixation
      , N_avail: 0              // [kg (N) m-2]       daily N available
      , N_assim: 0              // [kg (N) m-2]       daily N assimilated
      , N_req: 0                // [kg (N) m-2]       daily N required
      , N_remob: 0              // [kg (N) m-2]       daily N remobilized from senecenced tissue
      , N_add: 0                // [kg (N) m-2]       daily N radditionaly assimilated due to over supply (N_avail > N_req)
      , ρ_shoot: 0.7            // [kg (C) kg-1 (C)]  growth fraction partitioned to shoot
      , ρ_root: 0.3             // [kg (C) kg-1 (C)]  growth fraction partitioned to root
      , ρ_l: 0.7                // [kg (C) kg-1 (C)]  growth shoot fraction partitioned to leaf

      , G_l_fC_om: {            // [kg (C) kg-1 (C)]  composition of new leaf tissue (OM), fractions 
            sc: 0.0
          , nc: 0.0
          , pn: 0.0 
        }
      , G_s_fC_om: {            // [kg (C) kg-1 (C)]  composition of new stem tissue (OM), fractions 
            sc: 0.0
          , nc: 0.0
          , pn: 0.0 
        }
      , G_r_fC_om: {            // [kg (C) kg-1 (C)]  composition of new root tissue (OM), fractions 
            sc: 0.0
          , nc: 0.0
          , pn: 0.0 
        }
      , SC: {                    // [kg (C) m-2]      structural carbon hydrate pools 
            live_l_1: 0.0
          , live_l_2: 0.0
          , live_l_3: 0.0
          , dead_l:   0.0
          , live_s_1: 0.0
          , live_s_2: 0.0
          , live_s_3: 0.0
          , dead_s:   0.0
          , r:        0.0
        }
                        
      , dSC: {                   // [kg (C) m-2]      daily structural carbon hydrate growth pool
            live_l_1: 0.0
          , live_l_2: 0.0
          , live_l_3: 0.0
          , dead_l:   0.0
          , live_s_1: 0.0
          , live_s_2: 0.0
          , live_s_3: 0.0
          , dead_s:   0.0
          , r:        0.0
        }
        /*  */
      , NC: {                   // [kg (C) m-2]       non-structural carbon hydrate pool  
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , dNC: {                  // [kg (C) m-2]       daily non-structural carbon hydrate growth pool 
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , PN: {                   // [kg (C) m-2]       protein pool 
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , dPN: {                  // [kg (C) m-2]       daily protein growth pool 
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , AH: {                   // [kg (ash) m-2]      ash pool 
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , dAH: {                  // [kg (ash) m-2]     daily ash growth pool 
            l: 0.0
          , dead_l: 0.0
          , s: 0.0
          , dead_s: 0.0
          , r: 0.0 
        }
      , Λ_litter: {             // [kg (C) m-2]       litter from senecenced leaf and stem 
            sc: 0.0
          , pn: 0.0
          , nc: 0.0 
        } 
      , Λ_r: {                  // [kg (C) m-2]       senecenced root 
            sc: 0
          , pn: 0
          , nc: 0.0 
        }
    };


    /* initialze constants with pre-defined values by type; defaults to generic grass */
    if (options && options.type) {
    
      switch (options.type) {

      case 'white clover':

        this.isLegume = true;
        this.type = 'white clover';

        this.cons.h_m = 0.5;
        this.cons.L_half = 2.0;
        this.cons.σ = 36.8; // Topp (2004)

        /* photosysthesis */
        this.cons.photo.T_ref = 20;
        this.cons.photo.T_mn = 3;
        this.cons.photo.T_opt_Pm_amb = 23;
        this.cons.photo.ξ = 0.8;
        this.cons.photo.k = 0.8;
        this.cons.photo.m = 0.0;
        this.cons.photo.α_amb_15 = 0.05;
        this.cons.photo.P_m_ref = 16;
        this.cons.photo.λ = 1.2;
        this.cons.photo.f_C_m = 1.49;
        this.cons.photo.γ_Pm = 10;
        this.cons.photo.λ_α = 0.02; 
        this.cons.photo.γ_α = 6;

        /* partitioning */
        this.cons.part.ρ_shoot_ref = 0.71;  // Topp (2004)
        this.cons.part.ρ_l = 0.33; // Topp (2004)

        break;
      case 'red clover':

        this.isLegume = true;
        this.type = 'red clover';

        this.cons.h_m = 0.3;
        this.cons.L_half = 2.0;
        this.cons.σ = 24.0; // Topp (2004)

        /* photosysthesis */
        this.cons.photo.T_ref = 25; // Topp (2004)
        this.cons.photo.T_mn = 3;
        this.cons.photo.T_opt_Pm_amb = 25;
        this.cons.photo.ξ = 0.8;
        this.cons.photo.k = 1.0; // Topp (2004)
        this.cons.photo.m = 0.0;
        this.cons.photo.α_amb_15 = 0.05;
        this.cons.photo.P_m_ref = 12.9; // Topp (2004)
        this.cons.photo.λ = 1.2;
        this.cons.photo.f_C_m = 1.49;
        this.cons.photo.γ_Pm = 10;
        this.cons.photo.λ_α = 0.02; 
        this.cons.photo.γ_α = 6;

        /* partitioning */
        this.cons.part.ρ_shoot_ref = 0.71;  // Topp (2004)
        this.cons.part.ρ_l = 0.55; // Topp (2004)

        break;
      case 'ryegrass':

        this.isLegume = false;
        this.type = 'ryegrass';

        this.cons.h_m = 0.5;
        this.cons.L_half = 2.0;
        this.cons.σ = 25.8; // Topp (2004)

        /* photosysthesis */
        this.cons.photo.T_ref = 20;
        this.cons.photo.T_mn = 3;
        this.cons.photo.T_opt_Pm_amb = 23;
        this.cons.photo.ξ = 0.8;
        this.cons.photo.k = 0.5;
        this.cons.photo.m = 0.0;
        this.cons.photo.α_amb_15 = 0.05;
        this.cons.photo.P_m_ref = 16;
        this.cons.photo.λ = 1.2;
        this.cons.photo.f_C_m = 1.49;
        this.cons.photo.γ_Pm = 10;
        this.cons.photo.λ_α = 0.02; 
        this.cons.photo.γ_α = 6;

        /* partitioning */
        this.cons.part.ρ_shoot_ref = 0.8;
        this.cons.part.ρ_l = 0.7;

        break;
      }
    }

    /* overwrite initial values with provided (optional) configuration values */
    if (options) {

      this.isLegume = options.isLegume || false;
      this.isC4 = options.isC4 || false;

      if (options.hasOwnProperty('constants')) {
        var constants = options.constants;
        for (var prop in constants) {
          if (constants.hasOwnProperty(prop) && this.cons.hasOwnProperty(prop) && constants[prop] !== null)
            this.cons[prop] = constants[prop]
        }
      }

    }


    /* shoot protein fraction [kg (protein) kg-1 (DM)] */
    this.fOM_pn = function () {

      var PN = that.vars.PN;

      return ((PN.l + PN.s + PN.dead_l + PN.dead_s) / fC_pn) / that.DM_shoot();

    };


    /* 
      protein digestibility Van Niekerk (1967) 
      TODO: check units (DM or OM?)
      
      pn  [g (CP) kg-1 (DM)]
    */
    this.δ_pn = function (pn) { 

      return 0.956 - (34.3 / pn); 

    };  

    /* shoot digestibility [kg (OM) kg-1 (OM)] */
    this.OMD_shoot = function () {

      var cons = that.cons
        , vars = that.vars
        , SC = that.vars.SC
        , NC = that.vars.NC
        , PN = that.vars.PN
        , δ_pn = that.δ_pn(this.fOM_pn() * 1e3) // kg to grams
        ;

      var NDF_live_l_1 = SC.live_l_1 / fC_sc;
      var NDF_live_l_2 = SC.live_l_2 / fC_sc;
      var NDF_live_l_3 = SC.live_l_3 / fC_sc;
      var NDF_dead_l = SC.dead_l / fC_sc;
      
      var NDF_live_s_1 = SC.live_s_1 / fC_sc;
      var NDF_live_s_2 = SC.live_s_2 / fC_sc;
      var NDF_live_s_3 = SC.live_s_3 / fC_sc;
      var NDF_dead_s = SC.dead_s / fC_sc;

      var NFC = (NC.l + NC.s + vars.NC.dead_l + vars.NC.dead_s) / fC_nc;

      var CP = (PN.l + PN.s + vars.PN.dead_l + vars.PN.dead_s) / fC_pn;

      /* digestible NDF [kg m-2] */
      var DNDF = (
        cons.δ_ndf_live_l_1 * NDF_live_l_1 +
        cons.δ_ndf_live_l_2 * NDF_live_l_2 +
        cons.δ_ndf_live_l_3 * NDF_live_l_3 +
        cons.δ_ndf_dead_l * NDF_dead_l +
        cons.δ_ndf_live_s_1 * NDF_live_s_1 + 
        cons.δ_ndf_live_s_2 * NDF_live_s_2 + 
        cons.δ_ndf_live_s_3 * NDF_live_s_3 + 
        cons.δ_ndf_dead_s * NDF_dead_s
      );

      /* digestible NFC  [kg m-2] */
      var DNFC = cons.δ_nfc * NFC;

      /*  digestible CP [kg m-2]  */
      var DCP = δ_pn * CP;

      return (
        (DNDF + DNFC + DCP) / 
        (
          NDF_live_l_1 + NDF_live_l_2 + NDF_live_l_3 + NDF_dead_l + 
          NDF_live_s_1 + NDF_live_s_2 + NDF_live_s_3 + NDF_dead_s + 
          NFC + CP
        )
      );

    };


    /* NDFD leaf [kg (NDF) kg-1 (NDF)] */
    this.NDFD_leaf = function () {

      var cons = that.cons
        , SC = that.vars.SC
        ;

      var NDF_live_l_1 = SC.live_l_1 / fC_sc;
      var NDF_live_l_2 = SC.live_l_2 / fC_sc;
      var NDF_live_l_3 = SC.live_l_3 / fC_sc;
      var NDF_dead_l = SC.dead_l / fC_sc;

      var DNDF = (
        cons.δ_ndf_live_l_1 * NDF_live_l_1 +
        cons.δ_ndf_live_l_2 * NDF_live_l_2 +
        cons.δ_ndf_live_l_3 * NDF_live_l_3 +
        cons.δ_ndf_dead_l * NDF_dead_l
      );

      return DNDF / (NDF_live_l_1 + NDF_live_l_2 + NDF_live_l_3 + NDF_dead_l);

    };

    /* NDFD stem [kg (NDF) kg-1 (NDF)] */
    this.NDFD_stem = function () {

      var cons = that.cons
        , SC = that.vars.SC
        ;

      var NDF_live_s_1 = SC.live_s_1 / fC_sc;
      var NDF_live_s_2 = SC.live_s_2 / fC_sc;
      var NDF_live_s_3 = SC.live_s_3 / fC_sc;
      var NDF_dead_s = SC.dead_s / fC_sc;

      var DNDF = (
        cons.δ_ndf_live_s_1 * NDF_live_s_1 + 
        cons.δ_ndf_live_s_2 * NDF_live_s_2 + 
        cons.δ_ndf_live_s_3 * NDF_live_s_3 + 
        cons.δ_ndf_dead_s * NDF_dead_s
      );

      return DNDF / (NDF_live_s_1 + NDF_live_s_2 + NDF_live_s_3 + NDF_dead_s);

    };

    /* NDF leaf [g (NDF) kg-1 (DM)] */
    this.NDF_leaf = function () {

      var SC = that.vars.SC;

      return 1e3 * ((SC.live_l_1 + SC.live_l_2 + SC.live_l_3 + SC.dead_l) / fC_sc) / that.DM_leaf();

    };


    /* NDF stem [g (NDF) kg-1 (DM)] */
    this.NDF_stem = function () {

      var SC = that.vars.SC;

      return 1e3 * ((SC.live_s_1 + SC.live_s_2 + SC.live_s_3 + SC.dead_s) / fC_sc) / that.DM_stem();

    };

    /* NFC leaf [g (NFC) kg-1 (DM)] */
    this.NFC_leaf = function () {

      var vars = that.vars;

      return 1e3 * ((vars.NC.l + vars.NC.dead_l) / fC_nc) / that.DM_leaf();

    };


    /* NFC stem [g (NFC) kg-1 (DM)] */
    this.NFC_stem = function () {

      var vars = that.vars;

      return 1e3 * ((vars.NC.s + vars.NC.dead_s) / fC_nc) / that.DM_stem();

    };

    /* CP leaf [g (CP) kg-1 (DM)] */
    this.CP_leaf = function () {

      var vars = that.vars;

      return 1e3 * ((vars.PN.l + vars.PN.dead_l) / fC_pn) / that.DM_leaf();

    };


    /* CP stem [g (CP) kg-1 (DM)] */
    this.CP_stem = function () {

      var vars = that.vars;

      return 1e3 * ((vars.PN.s + vars.PN.dead_s) / fC_pn) / that.DM_stem();

    };

    /* CP shoot [g (CP) kg-1 (DM)] */
    this.CP_shoot = function () {

      var vars = that.vars;

      return 1e3 * ((vars.PN.l + vars.PN.dead_l + vars.PN.s + vars.PN.dead_s) / fC_pn) / (that.DM_leaf() + that.DM_stem());

    };

    /* ASH leaf [g (ASH) kg-1 (DM)] */
    this.ASH_leaf = function () {

      var vars = that.vars;

      return 1e3 * vars.AH.l / (that.DM_leaf() + vars.AH.l);

    };


    /* ASH stem [g (ASH) kg-1 (DM)] */
    this.ASH_stem = function () {

      var vars = that.vars;

      return 1e3 * vars.AH.s / (that.DM_stem() + vars.AH.s);

    };

    /* ASH shoot [g (ASH) kg-1 (DM)] */
    this.ASH_shoot = function () {

      var vars = that.vars;

      return 1e3 * (vars.AH.l + vars.AH.s) / (that.DM_leaf() + vars.AH.l + that.DM_stem() + vars.AH.s);

    };

    /* 
      CF shoot [g (CF) kg-1 (DM)] 
      regressions based on feed table data from Finland (MTT) and France (Feedipedia) and data from an Austrian feed
      laboratory (Rosenau). legumes N = 31, R² = 0.73, grass N = 46, R² = 0.78
    */
    this.CF_shoot= function () {

      var SC = that.vars.SC;
      var NDF = 1e3 * ( 
        (
          (SC.live_l_1 + SC.live_l_2 + SC.live_l_3 + SC.dead_l + SC.live_s_1 + SC.live_s_2 + SC.live_s_3 + SC.dead_s) / 
          fC_sc
        ) / that.DM_shoot()
      );

      if (that.isLegume)
        return 69.58 + 0.453 * NDF;
      else
        return 14.15 + 0.512 * NDF;

    };

    /* C_root [kg (C) m-2] root C */
    this.C_root = function () {

      var vars = that.vars;

      return  vars.SC.r + vars.NC.r + vars.PN.r;

    };


    /* C_live_shoot [kg (C) m-2] live shoot C */
    this.C_live_shoot = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        ;

      return (
        SC.live_l_1 +
        SC.live_l_2 +
        SC.live_l_3 +
        SC.live_s_1 +
        SC.live_s_2 +
        SC.live_s_3 +
        NC.l + NC.s +
        PN.l + PN.s
      );

    };


    /* C_live_leaf [kg (C) m-2] live leaf C */
    this.C_live_leaf = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        ;

      return (
        SC.live_l_1 +
        SC.live_l_2 +
        SC.live_l_3 +
        NC.l + PN.l
      );

    };


    /* C_live_stem [kg (C) m-2] live stem C */
    this.C_live_stem = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        ;

      return (
        SC.live_s_1 +
        SC.live_s_2 +
        SC.live_s_3 +
        NC.s + PN.s
      );

    };


    /* N_root [kg (N) m-2] root N */
    this.N_root = function () {

      return that.vars.PN.r * fN_pn / fC_pn;

    };


    /* N_live_shoot [kg (N) m-2] live shoot N */
    this.N_live_shoot = function () {

      var PN = that.vars.PN;

      return (PN.l + PN.s) * fN_pn / fC_pn;

    };


    /* N_live_leaf [kg (N) m-2] live leaf N */
    this.N_live_leaf = function () {

      return that.vars.PN.l * fN_pn / fC_pn;

    };


    /* N_live_stem [kg (N) m-2] live stem N */
    this.N_live_stem = function () {

      return that.vars.PN.s * fN_pn / fC_pn;

    };


    this.dDM_leaf = function () {

      var vars = that.vars 
        , dSC = vars.dSC
        , dNC = vars.dNC
        , dPN = vars.dPN
        , dAH = vars.dAH
        ;

      return (
        (dSC.live_l_1 + dSC.live_l_2 + dSC.live_l_3 + dSC.dead_l) / fC_sc + 
        (dNC.l + dNC.dead_l) / fC_nc + 
        (dPN.l + dPN.dead_l) / fC_pn +
        dAH.l
      ); 

    };


    this.dDM_stem = function () {

      var vars = that.vars 
        , dSC = vars.dSC
        , dNC = vars.dNC
        , dPN = vars.dPN
        , dAH = vars.dAH
        ;

      return (
        (dSC.live_s_1 + dSC.live_s_2 + dSC.live_s_3 + dSC.dead_s) / fC_sc + 
        (dNC.s + dNC.dead_s) / fC_nc + 
        (dPN.s + dPN.dead_s) / fC_pn +
        dAH.s
      ); 

    };


    this.dDM_root = function () {

      var vars = that.vars 
        , dSC = vars.dSC
        , dNC = vars.dNC
        , dPN = vars.dPN
        , dAH = vars.dAH
        ;

      return dSC.r / fC_sc + dNC.r / fC_nc + dPN.r / fC_pn + dAH.r;

    };


    this.dDM_shoot = function () {

      return that.dDM_leaf() + that.dDM_stem();

    };


    this.DM_shoot = function () {

      return that.DM_leaf() + that.DM_stem();

    };


    /* live leaf [kg (DM) m-2] */
    this.DM_live_leaf = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        (SC.live_l_1 + SC.live_l_2 + SC.live_l_3) / fC_sc + 
        NC.l / fC_nc + 
        PN.l / fC_pn +
        AH.l
      );  

    };


    this.DM_leaf = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        (SC.live_l_1 + SC.live_l_2 + SC.live_l_3 + SC.dead_l) / fC_sc + 
        (NC.l + NC.dead_l) / fC_nc +
        (PN.l + PN.dead_l) / fC_pn +
        AH.l + AH.dead_l
      );  

    };


    this.DM_dead_leaf = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        SC.dead_l / fC_sc + 
        NC.dead_l / fC_nc +
        PN.dead_l / fC_pn +
        AH.dead_l
      );  

    };


    this.DM_live_stem = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        (SC.live_s_1 + SC.live_s_2 + SC.live_s_3) / fC_sc + 
        NC.s / fC_nc + 
        PN.s / fC_pn +
        AH.s
      );   

    };


    this.DM_stem = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        (SC.live_s_1 + SC.live_s_2 + SC.live_s_3 + SC.dead_s) / fC_sc + 
        (NC.s + NC.dead_s) / fC_nc +
        (PN.s + PN.dead_s) / fC_pn +
        AH.s + AH.dead_s
      ); 

    };


    this.DM_dead_stem = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        SC.dead_s / fC_sc + 
        NC.dead_s / fC_nc +
        PN.dead_s / fC_pn +
        AH.dead_s
      ); 

    };


    this.DM_root = function () {

      var vars = that.vars
        , SC = vars.SC
        , NC = vars.NC
        , PN = vars.PN
        , AH = vars.AH
        ;

      return (
        SC.r / fC_sc +
        NC.r / fC_nc +
        PN.r / fC_pn +
        AH.r
      );

    };


    /* (3.83) L [m2 (leaf) m-2 (ground) leaf area (CO2 dependence not included (3.84)) */
    this.L = function () {

      return that.cons.σ * that.DM_leaf();
      // test: SLA depends on N concentration: Plant Ecology By Ernst-Detlef Schulze, Erwin Beck, Klaus Müller-Hohenstein p. 359
      // Schulze. 1994. The influence of N2-fixation on the carbon balance of leguminous plants
      // return (that.cons.σ + ((that.N_live_leaf() / that.DM_live_leaf()) - that.cons.N_leaf.ref)) * that.DM_live_leaf();

    };


    /* (3.101) h [m] height relationship between canopy height and leaf area */
    this.h_ = function () {

      var h = 0
        , cons = that.cons
        , L = that.L() * 1 / cons.f_cover // scale to a full m2
        , h_m = cons.h_m
        , L_half = cons.L_half
        , ξ = 0.9 // fixed curvatur parameter
        , α = h_m * (2 - ξ) / (2 * L_half)
        ;

      h = 1 / (2 * ξ) * (α * L + h_m - sqrt(pow(α * L  + h_m, 2) - 4 * α * ξ * h_m * L)); 
    
      return h;

    };

    /* */
    this.h = function () {

      var h = 0
        , cons = that.cons
        , L = that.L() * 1 / cons.f_cover // scale to a full m2
        , h_m = cons.h_m
        , L_5 = 1 // LAI at 5 cm height
        , a = log((100 * h_m - 1) / (20 * h_m - 1)) / L_5 // curvatur parameter
        ;

      h = (0.01 * h_m) / (0.01 + (h_m - 0.01) * exp(-a * L));
    
      return h;

    };


    /* f_N_live_leaf  [kg (N) kg-1 (C)] */
    this.f_N_live_leaf = function () {

      return that.N_live_leaf() / that.C_live_leaf();
    
    };

    /* f_N_live_shoot  [kg (N) kg-1 (C)] */
    this.f_N_live_shoot = function () {

      return that.N_live_shoot() / that.C_live_shoot();
    
    };


    /* f_N_live  [kg (N) kg-1 (C)] total biomass incl. root */
    this.f_N_live = function () {

      return (that.N_live_shoot() + that.N_root()) / (that.C_live_shoot() + that.C_root());
    
    };

  }; // Species end


  /* 
    Mixture (array of species)
    Takes a single species config object or an array of species 
    and returns the array with various functions attached 

    dm array [-] fraction of species dry matter share 

  */
  var Mixture = function (species, config) {

    /* pass array of species or single species */
    var mixture = Array.isArray(species) ? species : [species];

    var noPools = 4
      , leaf_share = 0.7
      , stem_share = 1 - leaf_share
      , DM_root = 1000 * 1e-4 // kg ha-1 to kg m-2
      , DM_shoot = 1000 * 1e-4 // kg ha-1 to kg m-2
      , DM = []
      ;
  
    if (config && config.DM) {
      DM = config.DM;
    } else {
      for (var s = 0, ps = species.length; s < ps; s++)
        DM[s] = 1 / ps;
    }

    if (mixture.length > 1)
      mixture.homogeneity = config.hasOwnProperty('homogeneity') ? config.homogeneity : 0.75;
    else
      mixture.homogeneity = 1;

    /*Vergleich der Biomasseproduktion bei Schnittnutzung und Kurzrasenweide
      unter biologischen Bedingungen im ostalpinen Raum*/;
    if (config && config.DM_shoot) 
      DM_shoot = config.DM_shoot * 1e-4 // kg ha-1 to kg m-2
    if (config && config.DM_root) 
      DM_root = 1000 * 1e-4 // kg ha-1 to kg m-2

    // iterate over species and initialize pools
    for (var s = 0, ps = species.length; s < ps; s++) {

      var species = mixture[s] 
        , SC = species.vars.SC
        , NC = species.vars.NC
        , PN = species.vars.PN
        , AH = species.vars.AH
        ;

      /* assume coverge equals initial DM share */
      species.cons.f_cover = DM[s];
        
      /* initialize carbon pools TODO: OM vs DM: include ash in calc. */

      /* leaf */
      SC.live_l_1 = leaf_share * (DM_shoot * DM[s] / noPools) * 0.50 * fC_sc;
      NC.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.25 * fC_nc;
      PN.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.25 * fC_nc;

      SC.live_l_2 = leaf_share * (DM_shoot * DM[s] / noPools) * 0.60 * fC_sc;
      NC.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.20 * fC_nc; 
      PN.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.20 * fC_pn;
      
      SC.live_l_3 = leaf_share * (DM_shoot * DM[s] / noPools) * 0.70 * fC_sc;
      NC.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.15 * fC_nc; 
      PN.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.15 * fC_pn;
      
      SC.dead_l = leaf_share * (DM_shoot * DM[s] / noPools) * 1.00 * fC_sc;
      NC.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.00 * fC_sc;
      PN.l += leaf_share * (DM_shoot * DM[s] / noPools) * 0.00 * fC_sc;

      AH.l = leaf_share * (DM_shoot * DM[s]) * species.cons.fAsh_dm_l_ref;

      /* stem */
      SC.live_s_1 = stem_share * (DM_shoot * DM[s] / noPools) * 0.70 * fC_sc;
      NC.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.15 * fC_nc;
      PN.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.15 * fC_nc;

      SC.live_s_2 = stem_share * (DM_shoot * DM[s] / noPools) * 0.80 * fC_sc;
      NC.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.10 * fC_nc; 
      PN.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.10 * fC_pn;
      
      SC.live_s_3 = stem_share * (DM_shoot * DM[s] / noPools) * 0.90 * fC_sc;
      NC.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.05 * fC_nc; 
      PN.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.05 * fC_pn;
      
      SC.dead_s = stem_share * (DM_shoot * DM[s] / noPools) * 1.00 * fC_sc;
      NC.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.00 * fC_sc;
      PN.s += stem_share * (DM_shoot * DM[s] / noPools) * 0.00 * fC_sc;

      AH.s = stem_share * (DM_shoot * DM[s]) * species.cons.fAsh_dm_s_ref;

      /* root */
      SC.r = DM_root * DM[s] * 0.80 * fC_sc;
      NC.r += DM_root * DM[s] * 0.10 * fC_sc;
      PN.r += DM_root * DM[s] * 0.10 * fC_sc;
      AH.r = DM_root * DM[s] * species.cons.fAsh_dm_r_ref;

    }


    mixture.DM_dead_shoot = function () {

      var DM_dead_shoot = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_dead_shoot += this[s].DM_dead_leaf() + this[s].DM_dead_stem();

      return DM_dead_shoot;

    };


    mixture.DM_live_shoot = function () {

      var DM_live_shoot = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_live_shoot += this[s].DM_live_leaf() + this[s].DM_live_stem()

      return DM_live_shoot;

    };
    

    mixture.DM_shoot = function () {

      var DM_shoot = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_shoot += this[s].DM_leaf() + this[s].DM_stem();

      return DM_shoot;

    };


    /* total leaf DM [kg m-2] */
    mixture.DM_leaf = function () {

      var DM_leaf = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_leaf += this[s].DM_leaf()

      return DM_leaf;

    };


    /* total stem DM [kg m-2] */
    mixture.DM_stem = function () {

      var DM_stem = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_stem += this[s].DM_stem()

      return DM_stem;

    };


    /* total root DM [kg m-2] */
    mixture.DM_root = function () {

      var DM_root = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        DM_root += this[s].DM_root()

      return DM_root;

    };


    /* total leaf daily growth [kg (DM) m-2] */
    mixture.dDM_leaf = function () {

      var dDM_leaf = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dDM_leaf += this[p].dDM_leaf();

      return dDM_leaf;

    };


    /* total stem daily growth DM [kg m-2] */
    mixture.dDM_stem = function () {

      var dDM_stem = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dDM_stem += this[p].dDM_stem();

      return dDM_stem;

    };


    /* total root daily growth DM [kg m-2] */
    mixture.dDM_root = function () {

      var dDM_root = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dDM_root += this[p].dDM_root();

      return dDM_root;

    };


    /* total root C [kg m-2] */
    mixture.C_root = function () {

      var C_root = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        C_root += this[s].C_root()

      return C_root;

    };


    /* f_N_live_leaf [kg (N) kg-1 (C) m-2] */
    mixture.f_N_live_leaf = function () {

      var N_live_leaf = 0
        , C_live_leaf = 0
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        N_live_leaf += this[s].N_live_leaf();
        C_live_leaf += this[s].C_live_leaf();
      }

      return N_live_leaf / C_live_leaf;

    };


    /* f_N_live_leaf_DM [kg (N) kg-1 (OM) m-2] */
    mixture.f_N_live_leaf_DM = function () {

      var N_live_leaf = 0
        , DM_live_leaf = 0
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        N_live_leaf += this[s].N_live_leaf();
        DM_live_leaf += this[s].DM_live_leaf();
      }

      return N_live_leaf / DM_live_leaf;

    };


    /* f_N_live_stem_DM [kg (N) kg-1 (OM) m-2] */
    mixture.f_N_live_stem_DM = function () {

      var N_live_stem = 0
        , DM_live_stem = 0
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        N_live_stem += this[s].N_live_stem();
        DM_live_stem += this[s].DM_live_stem();
      }

      return N_live_stem / DM_live_stem;

    };


    /* f_N_root_DM [kg (N) kg-1 (OM) m-2] */
    mixture.f_N_root_DM = function () {

      var N_root = 0
        , DM_root = 0
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        N_root += this[s].N_root();
        DM_root += this[s].DM_root();
      }

      return N_root / DM_root;

    };


    /* total leaf area */
    mixture.L_tot = function () {

      var L_tot = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        L_tot += this[s].L();

      return L_tot;

    };


    /* height of tallest species in mixture */
    mixture.h_mx = function () {

      var h_mx = 0 
        , h = 0
        //, L_tot = this.L_tot()
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        h = this[s].h();
        h_mx = (h > h_mx) ? h : h_mx;
      }

      return h_mx;

    };

    
    /* depth of deepest rooting species in mixture */
    mixture.d_r_mx = function () {

      var d_r_mx = 0;

      for (var s = 0, ps = this.length; s < ps; s++) {
        if (this[s].vars.d_r > d_r_mx)
          d_r_mx = this[s].vars.d_r;
      }

      return d_r_mx;

    };


    /* (3.105) LAI increment used in photosynthesis calculation */
    mixture.δL = 0.1;


    /* (3.106) number of LAI layers */
    mixture.n_L = function () {

      return floor(this.L_tot() / this.δL);

    };


    /* (3.107) starting layer for each species */
    mixture.n_start_p = function (n_L) {
      
      var n_start_p = []
        , L_tot = this.L_tot()
        , h_mx = this.h_mx()
        ;
      
      for (var s = 0, ps = this.length; s < ps; s++) {
        n_start_p[s] = 1 + ceil((1 - this[s].h() / h_mx) * n_L); 
      }
      
      return n_start_p;

    };


    /* (3.108) LAI increment for each species */
    mixture.δL_p = function (n_start_p, n_L) {
      
      var δL_p = [];

      for (var s = 0, ps = this.length; s < ps; s++)
        δL_p[s] = this[s].L() / (n_L - n_start_p[s] === 0 ? n_start_p[s] : n_L - n_start_p[s]);
      // TODO: fix start layer issue: n_L - n_start_p[s] === 0

      return δL_p;

    };

    /* (3.113) total LAI in layer i */
    mixture.δL_i = function (n_start_p, n_L, δL_p) {
      
      var δL_i = [0]
        , ΣδL = 0
        ;

      for (var i = 1; i <= n_L; i++) {
        ΣδL = 0;
        for (var s = 0, ps = this.length; s < ps; s++) {
          /* (3.110) 'i <=' error in SGS documentation? */
          if (n_start_p[s] <= i) // first layer is i = 1
            ΣδL += δL_p[s];
        }
        δL_i[i] = ΣδL;
      }

      return δL_i;

    };


    /* (3.109) 'effective' light extinction coefficient for each LAI layer i*/
    mixture.k_e_i = function (n_L, n_start_p, δL_p)   {
      
      var k_e_i = [0]
        , ΣkδL = 0
        , ΣδL = 0
        ;
      
      for (var i = 1; i <= n_L; i++) {
        ΣkδL = ΣδL = 0;
        for (var s = 0, ps = this.length; s < ps; s++) {
          /* (3.110) 'i <=' error in SGS documentation? */
          if (n_start_p[s] <= i) { // first layer is i = 1
            ΣkδL += this[s].cons.photo.k * δL_p[s];
            ΣδL += δL_p[s];
          }
        }
        k_e_i[i] = ΣkδL / ΣδL;
      }
      
      return k_e_i;
    
    };

    mixture.Ω_water = function () {

      return this.avg('Ω_water');
    
    };

    mixture.Ω_N = function () {

      return this.avg('Ω_N');
    
    };

    mixture.τ_T_low = function () {

      return this.avg('τ_T_low');
    
    };

    mixture.τ_T_high = function () {

      return this.avg('τ_T_high');
    
    };

    mixture.avg = function (prop, parent) {

      return this.reduce(function (a, b) {
        return a + (parent === undefined ? b.vars[prop] : b.vars[parent][prop]); 
      }, 0) / this.length;

    };

    mixture.sum = function (prop, parent) {

      return this.reduce(function (a, b) {
        return a + (parent === undefined ? b.vars[prop] : b.vars[parent][prop]); 
      }, 0);

    };

    /* mixture variables */

    mixture.f_r = []; /* root fraction per species and soil layer */
    mixture.f_r_sum = [];  /* root fraction sum per species TODO: find a way to avoid keeping the sum */
    mixture.W_r = [];  /* root kg DM m-2 per species and soil layer */
    mixture.W_r_sum = []; /* root kg DM m-2 sum per soil layer */
    mixture.N_up = []; /* N uptake kg N m-2 per species and soil layer */
    mixture.N_up_sum = []; /* N uptake kg N m-2 per soil layer */
    mixture.E_T = []; /* actual transpiration per species and layer */
    mixture.E_T_sum = [];  /* actual transpiration per species */
    mixture.f_g = 0;   /* soil coverage */
    mixture.isRegrowth = false; /* tracks if mixture has been harvested */

    return mixture;

  }; // Mixture end

  /* initialization of Species & Mixture */
  var spec = [], dm = [];
  for (var s = 0; s < species.length; s++) {

    spec.push(
      new Species({
        type: species[s].type,
        constants: species[s].constants
      })
    );
    dm.push(species[s].dryMatter);

    spec[s].cons.index = s;
  
  }

  this.mixture = new Mixture(spec, { DM: dm });
  
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
