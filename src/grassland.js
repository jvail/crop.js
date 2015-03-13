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

  TODO: 
    - add coverage param (calc. from inital dm share) to scale lai in height function
    - include ash (OM vs DM)
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
    this.type = 'generic grass'; // generic

    this.cons = {               // generic grass constants
        index: 0                // [#]                         index in mixture array at initialization (stored to restore orig. sorting)
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
            m_ref: 0.025        // maintenance coeficient at reference temperature
          , T_ref: 20
          , T_m_mn: 3
          , λ_N_up: 0.6         // [kg (C) kg-1 (N)]          N uptake respiration coefficent
          , λ_N_fix: 6          // [kg (C) kg-1 (N)]          N fixation respiration coefficent
        }
      , part: {                 // partitioning

            ρ_shoot_ref: 0.75   // [-]                        reference shoot partitioning fraction
          , ρ_l_max: 0.7        // [-]                        fraction partitioned to leaf
          , GDD_flower: 500     // [C° d]                     growing degree days till flowering
        }
       /* TODO: remove or rename: */
      , N_leaf: { /* [kg (N) kg-1 (C)] */
        opt: 0.04 / 0.45,       // 
        max: 0.045 / 0.45,      // [kg (N) kg-1 (C)] AgPasture: 0.05 / 0.4 (NcleafOpt as fraction / C in DM as fraction)
        ref: 0.04 / 0.45
       }
      , τ_veg: 200
      , fAsh_dm_l_ref: 0.09     // [kg (ash) kg-1 (DM)]       reference ash content leaf
      , fAsh_dm_s_ref: 0.04     // [kg (ash) kg-1 (DM)]       reference ash content stem
      , fAsh_dm_r_ref: 0.04     // [kg (ash) kg-1 (DM)]       reference ash content root
      , fH2O_fm_l_ref: 0.80     // [kg (H20) kg-1 (FM)]       reference water content leaf
      , fH2O_fm_s_ref: 0.70     // [kg (H20) kg-1 (FM)]       reference water content stem
    };

    /*
      variables (only those that are temporarily stored during calculations)

      Ω_N     [0-1]                       limiting factor nitrogen (1 = no stress)
      Ω_water [0-1]                       limiting factor water (1 = no stress)

      P_g_day [kg (C) m-2 d-1]            daily canopy gross photosynthesis in response to irradiance
      G       [kg (C) m-2 d-1]            daily net growth rate

      Y       [-]                         total growth efficiency
      Y_leaf  [-]                         leaf growth efficiency
      Y_stem  [-]                         stem growth efficiency
      Y_root  [-]                         root growth efficiency

      d_r     [m]                         root depth
      τ       [days]                      no. of days in pheno. phase (e.g. vegetative)
      k_sum   [-]                         pheno. phase development (0-1)

      dW_x_fdwt (leaf, stem, root)
      sc      [kg (d.wt) kg (d.wt)]       fraction structural carbon hydrates in new tissue
      nc      [kg (d.wt) kg (d.wt)]       fraction non-structural carbon hydrates in new tissue
      pn      [kg (d.wt) kg (d.wt)]       fraction protein in new tissue
      ah      [kg (d.wt) kg (d.wt)]       fraction ashes in new tissue
      
      SC      [kg (C) m-2]                total structural carbon hydrates (cellulose, hemicellulose, lignin)
      dSC     [kg (C) m-2 d-1]            daily structural carbon hydrates growth
      NC      [kg (C) m-2]                total (per organ) non-structural carbon hydrates (starch, sugars, fat)
      dNC     [kg (C) m-2 d-1]            daily (per organ) non-structural carbon hydrates growth
      PN      [kg (C) m-2]                total (per organ) protein carbon
      dPN     [kg (C) m-2 d-]             daily (per organ) protein carbon growth

      Λ_litter, Λ_r
      sc      [kg (C) m-2]                structural carbon hydrates
      nc      [kg (C) m-2]                non-structural carbon hydrates
      pn      [kg (C) m-2]                protein carbon

    */
    this.vars = {
        GDD: 0
      , ρ_l: 0.7
      , Ω_N: 1.0
      , Ω_water: 1.0 
      , P_g_day: 0.0
      , R_m: 0.0
      , R_N: 0
      , G: 0.0
      , G_leaf: 0 // growth to leaf [kg (C) m-2]
      , G_stem: 0
      , G_root: 0
      , Y: 0.75
      , Y_leaf: 0.75
      , Y_stem: 0.75
      , Y_root: 0.75
      , d_r: 1.0
      , τ: 0
      , k_sum: 0
      , N_up: 0
      , N_fix: 0
      , N_avail: 0
      , N_assim: 0
      , N_req: 0
      , N_remob: 0
      , N_add: 0
      , N_req_opt: 0
      , ρ_shoot: 0.7
      , ρ_root: 0.3 
        /* OM composition of new tissue, fractions OM */ 
      , G_l_fC_om: { sc: 0.0, nc: 0.0, pn: 0.0 }
      , G_s_fC_om: { sc: 0.0, nc: 0.0, pn: 0.0 }
      , G_r_fC_om: { sc: 0.0, nc: 0.0, pn: 0.0 }
        /* structural carbon hydrate pools kg (C) m-2 */
      , SC: {
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
        /* daily structural carbon hydrate growth pool kg (C) m-2 */
      , dSC: {
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
        // TODO: are those pools only for live tissue?
        /* non-structural carbon hydrate pool kg (C) m-2 */
      , NC: { l: 0.0, s: 0.0, r: 0.0 }
      , NC_dead: { l: 0.0, s: 0.0, r: 0.0 }
        /* daily non-structural carbon hydrate growth pool kg (C) m-2 */
      , dNC: { l: 0.0, s: 0.0, r: 0.0 }
        /* protein pool kg (C) m-2 */
      , PN: { l: 0.0, s: 0.0, r: 0.0 }
      , PN_dead: { l: 0.0, s: 0.0 }
        /* daily protein growth pool kg (C) m-2 */
      , dPN: { l: 0.0, s: 0.0, r: 0.0 }
      , AH:  { l: 0.0, s: 0.0, r: 0.0 }
      , dAH:  { l: 0.0, s: 0.0, r: 0.0 }
        /* total litter; from senecenced leaf and stem */
      , Λ_litter: { sc: 0.0, pn: 0.0, nc: 0.0 }
        /* total senecenced root */ 
      , Λ_r: { sc: 0, pn: 0, nc: 0.0 }
    };


    /* initialze constants with pre-defined values by type; defaults to rye grass */
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


    /* shoot protein fraction [kg (protein) kg-1 (d.wt)] */
    this.fdwt_pn = function () {

      var PN = that.vars.PN;

      return ((PN.l + PN.s + that.vars.PN_dead.l + that.vars.PN_dead.s) / fC_pn) / that.dwt_shoot();

    };


    /* 
      protein digestibility Van Niekerk (1967) 
      
      pn  [g (crude protein) kg-1 (d.wt)]
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
        , δ_pn = that.δ_pn(this.fdwt_pn() * 1000) // kg to grams
        ;

      var NDF_live_l_1 = SC.live_l_1 / fC_sc;
      var NDF_live_l_2 = SC.live_l_2 / fC_sc;
      var NDF_live_l_3 = SC.live_l_3 / fC_sc;
      var NDF_dead_l = SC.dead_l / fC_sc;
      
      var NDF_live_s_1 = SC.live_s_1 / fC_sc;
      var NDF_live_s_2 = SC.live_s_2 / fC_sc;
      var NDF_live_s_3 = SC.live_s_3 / fC_sc;
      var NDF_dead_s = SC.dead_s / fC_sc;

      var NFC = (NC.l + NC.s + vars.NC_dead.l + vars.NC_dead.s) / fC_nc;

      var CP = (PN.l + PN.s + vars.PN_dead.l + vars.PN_dead.s) / fC_pn;

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

      return 1e3 * ((SC.live_l_1 + SC.live_l_2 + SC.live_l_3 + SC.dead_l) / fC_sc) / that.dwt_leaf();

    };


    /* NDF stem [g (NDF) kg-1 (DM)] */
    this.NDF_stem = function () {

      var SC = that.vars.SC;

      return 1e3 * ((SC.live_s_1 + SC.live_s_2 + SC.live_s_3 + SC.dead_s) / fC_sc) / that.dwt_stem();

    };

    /* NFC leaf [g (NFC) kg-1 (DM)] */
    this.NFC_leaf = function () {

      var vars = that.vars;

      return 1e3 * ((vars.NC.l + vars.NC_dead.l) / fC_nc) / that.dwt_leaf();

    };


    /* NFC stem [g (NFC) kg-1 (DM)] */
    this.NFC_stem = function () {

      var vars = that.vars;

      return 1e3 * ((vars.NC.s + vars.NC_dead.s) / fC_nc) / that.dwt_stem();

    };

    /* CP leaf [g (CP) kg-1 (DM)] */
    this.CP_leaf = function () {

      var vars = that.vars;

      return 1e3 * ((vars.PN.l + vars.PN_dead.l) / fC_pn) / that.dwt_leaf();

    };


    /* CP stem [g (CP) kg-1 (DM)] */
    this.CP_stem = function () {

      var vars = that.vars;

      return 1e3 * ((vars.PN.s + vars.PN_dead.s) / fC_pn) / that.dwt_stem();

    };

    /* CP shoot [g (CP) kg-1 (DM)] */
    this.CP_shoot = function () {

      var vars = that.vars;

      return 1e3 * ((vars.PN.l + vars.PN_dead.l + vars.PN.s + vars.PN_dead.s) / fC_pn) / (that.dwt_leaf() + that.dwt_stem());

    };

    /* ASH leaf [g (ASH) kg-1 (DM)] */
    this.ASH_leaf = function () {

      var vars = that.vars;

      return 1e3 * vars.AH.l / (that.dwt_leaf() + vars.AH.l);

    };


    /* ASH stem [g (ASH) kg-1 (DM)] */
    this.ASH_stem = function () {

      var vars = that.vars;

      return 1e3 * vars.AH.s / (that.dwt_stem() + vars.AH.s);

    };

    /* ASH shoot [g (ASH) kg-1 (DM)] */
    this.ASH_shoot = function () {

      var vars = that.vars;

      return 1e3 * (vars.AH.l + vars.AH.s) / (that.dwt_leaf() + vars.AH.l + that.dwt_stem() + vars.AH.s);

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
        ) / that.dwt_shoot()
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


    this.dW_dwt_leaf = function () {

      var dSC = that.vars.dSC
        , dNC = that.vars.dNC
        , dPN = that.vars.dPN
        ;

      return (
        /* convert leaf kg C to kg d.wt incl. ashes TODO: ashes */
        (dSC.live_l_1 + dSC.live_l_2 + dSC.live_l_3 + dSC.dead_l) / fC_sc + 
        dNC.l / fC_nc + 
        dPN.l / fC_pn
      ); 

    };


    this.dW_dwt_stem = function () {

      var dSC = that.vars.dSC
        , dNC = that.vars.dNC
        , dPN = that.vars.dPN
        ;

      return (
        /* convert stem kg C to kg d.wt incl. ashes TODO: ashes */
        (dSC.live_s_1 + dSC.live_s_2 + dSC.live_s_3 + dSC.dead_s) / fC_sc + 
        dNC.s / fC_nc + 
        dPN.s / fC_pn
      ); 

    };


    this.dW_dwt_root = function () {

      var dSC = that.vars.dSC
        , dNC = that.vars.dNC
        , dPN = that.vars.dPN
        ;

        /* convert root kg C to kg d.wt incl. ashes TODO: ashes */
      return dSC.r / fC_sc + dNC.r / fC_nc + dPN.r / fC_pn;

    };


    this.dW_dwt_shoot = function () {

      return that.dW_dwt_leaf() + that.dW_dwt_stem();

    };

    this.W_dwt_litter = function () {

      var Λ_litter = that.vars.Λ_litter;

      return Λ_litter.sc / fC_sc + Λ_litter.pn / fC_pn;

    };


    this.dwt_shoot = function () {

      return (
        that.dwt_live_leaf() + that.dwt_dead_leaf() +
        that.dwt_live_stem() + that.dwt_dead_stem()
      );

    };


    /* dwt live leaf [kg (leaf) m-2] */
    this.dwt_live_leaf = function () {

      var SC = that.vars.SC
        , NC = that.vars.NC
        , PN = that.vars.PN
        ;

      return (
        /* convert leaf kg C to kg d.wt incl. ashes TODO: ashes */
        (SC.live_l_1 + SC.live_l_2 + SC.live_l_3) / fC_sc + 
        NC.l / fC_nc + 
        PN.l / fC_pn
      );  

    };


    this.dwt_leaf = function () {

      var SC = that.vars.SC
        , NC = that.vars.NC
        , PN = that.vars.PN
        , PN_dead = that.vars.PN_dead
        , NC_dead = that.vars.NC_dead
        ;

      return (
        /* convert leaf kg C to kg d.wt incl. ashes TODO: ashes */
        (SC.live_l_1 + SC.live_l_2 + SC.live_l_3 + SC.dead_l) / fC_sc + 
        (NC.l + NC_dead.l) / fC_nc +
        (PN.l + PN_dead.l) / fC_pn
      );  

    };


    this.dwt_dead_leaf = function () {

      return (
        that.vars.SC.dead_l / fC_sc + 
        that.vars.PN_dead.l / fC_pn + 
        that.vars.NC_dead.l / fC_nc
      ); 

    };


    /* dwt_stem [kg m-2] */
    this.dwt_live_stem = function () {

      var SC = that.vars.SC
        , NC = that.vars.NC
        , PN = that.vars.PN
        ;

      return (
        /* convert leaf kg C to kg d.wt incl. ashes TODO: ashes */
        (SC.live_s_1 + SC.live_s_2 + SC.live_s_3) / fC_sc + 
        NC.s / fC_nc + 
        PN.s / fC_pn
      );   

    };


    this.dwt_stem = function () {

      var SC = that.vars.SC
        , NC = that.vars.NC
        , PN = that.vars.PN
        , PN_dead = that.vars.PN_dead
        , NC_dead = that.vars.NC_dead
        ;

      return (
        /* convert stem kg C to kg d.wt incl. ashes TODO: ashes */
        (SC.live_s_1 + SC.live_s_2 + SC.live_s_3 + SC.dead_s) / fC_sc + 
        (NC.s + NC_dead.s) / fC_nc +
        (PN.s + PN_dead.s) / fC_pn
      ); 

    };


    this.dwt_dead_stem = function () {

      return (
        that.vars.SC.dead_s / fC_sc + 
        that.vars.PN_dead.s / fC_pn + 
        that.vars.NC_dead.s / fC_nc
      ); 

    };


    /* dwt_root [kg m-2] */
    this.dwt_root = function () {

      var vars = that.vars;

      return (
        vars.SC.r / fC_sc +
        vars.NC.r / fC_nc +
        vars.PN.r / fC_pn
      );

    };


    /* (3.83) L [m2 (leaf) m-2 (ground) leaf area (CO2 dependence not included (3.84)) */
    this.L = function () {

      return that.cons.σ * that.dwt_live_leaf();
      // test: SLA depends on N concentration: Plant Ecology By Ernst-Detlef Schulze, Erwin Beck, Klaus Müller-Hohenstein p. 359
      // Schulze. 1994. The influence of N2-fixation on the carbon balance of leguminous plants
      // return (that.cons.σ + ((that.N_live_leaf() / that.dwt_live_leaf()) - that.cons.N_leaf.ref)) * that.dwt_live_leaf();

    };


    /* (3.101) h [m] height relationship between canopy height and leaf area */
    this.h = function () {

      var h = 0
        , cons = that.cons
        , L = that.L() // TODO: ?
        , h_m = cons.h_m
        , L_half = cons.L_half
        , ξ = 0.9 // fixed curvatur parameter
        , α = h_m * (2 - ξ) / (2 * L_half)
        ;

      h = 1 / (2 * ξ) * (α * L + h_m - sqrt(pow(α * L  + h_m, 2) - 4 * α * ξ * h_m * L)); 
    
      return h;

    };

    /* carbon fraction of dwt */
    this.F_C = function () {

      return (
        (that.C_live_shoot() + that.C_root()) / 
        (that.dwt_live_leaf() + that.dwt_live_stem() + that.dwt_root())
      );

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

    /* store root share of each species in each layer in mixture objects in order to calculate N and water uptake */
    mixture.root_sh = new Array(species.length);

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

    mixture.homogeneity = config.hasOwnProperty('homogeneity') ? config.homogeneity : 0.75;

    /*Vergleich der Biomasseproduktion bei Schnittnutzung und Kurzrasenweide
      unter biologischen Bedingungen im ostalpinen Raum*/;
    if (config && config.DM_shoot) 
      DM_shoot = config.DM_shoot * 1e-4 // kg ha-1 to kg m-2
    if (config && config.DM_root) 
      DM_root = 1000 * 1e-4 // kg ha-1 to kg m-2




    // iterate over species and initialize pools
    for (var s = 0, ps = species.length; s < ps; s++) {

      /* initialize array to store share in each soil layer */
      mixture.root_sh[s] = [];

      var species = mixture[s] 
        , SC = species.vars.SC
        , NC = species.vars.NC
        , PN = species.vars.PN
        , AH = species.vars.AH
        ;
        
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


    mixture.N_req_opt = function () {

      var N_req_opt = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        N_req_opt += this[s].N_req_opt();

      return N_req_opt;     

    };


    mixture.dwt_dead_shoot = function () {

      var dwt_dead_shoot = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        dwt_dead_shoot += this[s].dwt_dead_leaf() + this[s].dwt_dead_stem();

      return dwt_dead_shoot;

    };


    mixture.dwt_live_shoot = function () {

      var dwt_live_shoot = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        dwt_live_shoot += this[s].dwt_live_leaf() + this[s].dwt_live_stem()

      return dwt_live_shoot;

    };
    

    mixture.dwt_shoot = function () {

      var dwt_shoot = 0;

      for (var s = 0, ps = this.length; s < ps; s++) {
        dwt_shoot += (
          this[s].dwt_live_leaf() + this[s].dwt_dead_leaf() +
          this[s].dwt_live_stem() + this[s].dwt_dead_stem()
        );
      }

      return dwt_shoot;

    };

    mixture.dm_shoot = function () {

      var dm_shoot = 0;

      for (var s = 0, ps = this.length; s < ps; s++) {
        dm_shoot += (
          this[s].dwt_live_leaf() + this[s].dwt_dead_leaf() + this[s].vars.AH.l + 
          this[s].dwt_live_stem() + this[s].dwt_dead_stem() + this[s].vars.AH.s
        );
      }

      return dm_shoot;

    };


    /* total leaf d.wt [kg m-2] */
    mixture.dwt_leaf = function () {

      var dwt_leaf = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        dwt_leaf += this[s].dwt_leaf()

      return dwt_leaf;

    };


    /* total stem d.wt [kg m-2] */
    mixture.dwt_stem = function () {

      var dwt_stem = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        dwt_stem += this[s].dwt_stem()

      return dwt_stem;

    };


    /* total root d.wt [kg m-2] */
    mixture.dwt_root = function () {

      var dwt_root = 0;

      for (var s = 0, ps = this.length; s < ps; s++)
        dwt_root += this[s].dwt_root()

      return dwt_root;

    };


    /* total leaf daily growth d.wt [kg m-2] */
    mixture.dW_dwt_leaf = function () {

      var dW_dwt_leaf = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dW_dwt_leaf += this[p].dW_dwt_leaf();

      return dW_dwt_leaf;

    };


    /* total stem daily growth d.wt [kg m-2] */
    mixture.dW_dwt_stem = function () {

      var dW_dwt_stem = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dW_dwt_stem += this[p].dW_dwt_stem();

      return dW_dwt_stem;

    };


    /* total root daily growth d.wt [kg m-2] */
    mixture.dW_dwt_root = function () {

      var dW_dwt_root = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dW_dwt_root += this[p].dW_dwt_root();

      return dW_dwt_root;

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


    /* f_N_live_leaf_dwt [kg (N) kg-1 (OM) m-2] */
    mixture.f_N_live_leaf_dwt = function () {

      var N_live_leaf = 0
        , dwt_live_leaf = 0
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        N_live_leaf += this[s].N_live_leaf();
        dwt_live_leaf += this[s].dwt_live_leaf();
      }

      return N_live_leaf / dwt_live_leaf;

    };


    /* f_N_live_stem_dwt [kg (N) kg-1 (OM) m-2] */
    mixture.f_N_live_stem_dwt = function () {

      var N_live_stem = 0
        , dwt_live_stem = 0
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        N_live_stem += this[s].N_live_stem();
        dwt_live_stem += this[s].dwt_live_stem();
      }

      return N_live_stem / dwt_live_stem;

    };


    /* f_N_root_dwt [kg (N) kg-1 (OM) m-2] */
    mixture.f_N_root_dwt = function () {

      var N_root = 0
        , dwt_root = 0
        ;

      for (var s = 0, ps = this.length; s < ps; s++) {
        N_root += this[s].N_root();
        dwt_root += this[s].dwt_root();
      }

      return N_root / dwt_root;

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

    /* mixture variables */

    mixture.f_r = []; /* root fraction per species and soil layer */
    mixture.f_r_sum = [];  /* root fraction sum per species TODO: find a way to avoid keeping the sum */
    mixture.W_r = [];  /* root kg C m-2 per species and soil layer */
    mixture.W_r_sum = []; /* root kg C m-2 sum per soil layer */
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
