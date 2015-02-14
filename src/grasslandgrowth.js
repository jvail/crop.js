/*
  grassland:

  {
    species: [
      new grassland.Species({
        type: 'pasture grass',
        constants: { 
          h_m: 0.5, 
          L_half: 2.0 
        } 
      })
    , new grassland.Species({
        type: 'pasture grass',
        constants: { 
          h_m: 0.4, 
          L_half: 2.0 
        } 
      })
    ],
    DM: [] fraction of total dry matter
  }

  TODO:
    - vc_VapourPressure as input?
    - add interception and evaporation
    - account for groundwater in E_T
    - add litter and dead root to soilorganic (seems this is not implemented in MONICA)?
    - move Mixture and species? 
    - NH4 uptake?
    - what if a species (due to height in sward) dies?
*/

var GrasslandGrowth = function (sc, gps, cps, stps, cpp, species) { // takes additional grassland param
  'use strict';

  if (DEBUG) debug(arguments);

  var soilColumn = sc
    , generalParams = gps
    , cropParams = cps
    , centralParameterProvider = cpp
    , vs_NumberOfLayers  = sc.vs_NumberOfLayers()
    , vs_NumberOfOrganicLayers  = sc.vs_NumberOfOrganicLayers()
    , vs_LayerThickness = soilColumn.vs_LayerThickness()
    , vs_Latitude  = stps.vs_Latitude
    , vs_HeightNN = stps.vs_HeightNN
    , vc_InterceptionStorage = 0.0
    , vc_accumulatedETa = 0
    , pc_NitrogenResponseOn = gps.pc_NitrogenResponseOn
    , waterDeficitResponseOn = gps.pc_WaterDeficitResponseOn
    , vc_NetPrecipitation = 0
    , vc_InterceptionStorage = 0
    , vc_ReferenceEvapotranspiration = 0
    , vc_RemainingEvapotranspiration = 0
    , vc_EvaporatedFromIntercept = 0
    , vc_KcFactor = 0.4 // TODO: source?
    ;

  var numberOfSpecies = species.length;
  var mixtureUnsorted = [];

  var f_r = [] /* root fraction per species and soil layer */
    , f_r_sum = []  /* root fraction sum per species TODO: find a way to avoid keeping the sum */
    , W_r = []  /* root kg C m-2 per species and soil layer */
    , W_r_sum = [] /* root kg C m-2 sum per soil layer */
    , N_up = [] /* N uptake kg N m-2 per species and soil layer */
    , N_up_sum = [] /* N uptake kg N m-2 per soil layer */
    , E_T = [] /* actual transpiration per species and layer */
    , E_T_sum = []  /* actual transpiration per species */
    , f_g = 0   /* soil coverage */
    ;

  /* initialize arrays */
  for (var s = 0; s < numberOfSpecies; s++) {
    f_r[s] = [];
    W_r[s] = [];
    N_up[s] = [];
    E_T[s] = [];
    f_r_sum[s] = 0;
    for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
      f_r[s][i_Layer] = 0;
      W_r[s][i_Layer] = 0;
      N_up[s][i_Layer] = 0;
      E_T[s][i_Layer] = 0;
    }
  }
  for (var i_Layer = 0; i_Layer < vs_NumberOfLayers; i_Layer++) {
    W_r_sum[i_Layer] = 0;
    N_up_sum[i_Layer] = 0;
  }

  var mixture = null;

  /* C_amb_ref [μmol (CO2) mol-1]  reference ambient CO2 concentration */
  var C_amb_ref = 380;

  /* Y growth efficiencies. Thornley JHM & Johnson IR (2000), s. 351f */
  var Y_cellulose =      0.95  // 1 - (30 / 44) * (0.018 / 0.226)
    , Y_hemicellulose =  0.94  // 1 - (30 / 44) * (0.015 / 0.167)
    , Y_starch =         0.95  // 1 - (30 / 44) * (0.013 / 0.161)
    , Y_sucrose =        0.95  // 1 - (30 / 44) * (0.004 / 0.060)
    , Y_protein_N03 =    0.58  // 1 - (30 / 44) * (0.263 / 0.422) // from nitrate
    , Y_protein_NH4 =    0.84  // 1 - (30 / 44) * (0.069 / 0.290) // from ammonium
    , Y_lignin =         0.83  // 1 - (30 / 44) * (0.045 / 0.181)
    , Y_lipids =         0.68  // 1 - (30 / 44) * (0.066 / 0.142)
    , Y_ash =            1.00  
    , Y_sc =             0.85  // Johnson (2013) 
    , Y_nc =             0.95  // non-structural carbon hydrates
    , Y_pn =             0.55  // Johnson (2013)
    ;

  /* carbon fractions [kg (C) kg (d.wt)] */
  var fC_cellulose =     0.44
    , fC_hemicellulose = 0.40
    , fC_starch =        0.44
    , fC_sucrose =       0.42
    , fC_protein =       0.53
    , fC_lignin =        0.67
    , fC_lipids =        0.77
    , fC_ash =           0.00
    ;

  /* carbon fraction carbon hydrate pools [kg (C) kg (d.wt)] */
  var fC_sc = 0.6 * fC_cellulose + 0.2 * fC_hemicellulose + 0.2 * fC_lignin
    , fC_nc = 0.7 * fC_starch + 0.3 * fC_sucrose
    , fC_ld = fC_lipids
    , fC_pn = fC_protein
    ;

  /* nitrogen fraction in protein [kg (N) kg (d.wt)] */
  var fN_pn = 0.16; 

  /* species object to store species specific parameters for a mixture */
  var Species = function (cfg) {

    var that = this;

    /* defaults */
    this.isLegume = false;
    this.isC4 = false;
    this.type = 'pasture grass'; // generic

    /* 
      constants; defaults for rye grass 

      h_m           [m]                         maximum height
      L_half        [m2 (leaf) m-2 (ground)]    leaf area at half h_mx
      σ             [m2 (leaf) kg-1 (d.wt)]     specific leaf area
      N_ref         [kg (N) kg-1 (d.wt)]        reference (optimum) N concentration
      d_r_h         [m]                         depth at 50% root mass
      d_r_mx        [m]                         maximum root depth
      τ_veg         [days]                      total no. days in vegetative phase TODO: days since what? 

      photosynthesis
      T_ref         [°C]                        reference temperature 
      T_mn          [°C]                        minimum temperature 
      T_opt_Pm_amb  [°C]                        optimum temperature
      ξ             [-]                         non‐rectangular hyperbola curvatur parameter
      α_amb_15      [mol (CO2) mol-1 (photons)] photosythetic efficiency α at ambient CO2 (C_amb_ref) and 15 °C
      k             [-]                         leaf extinction coefficient
      m             [-]                         leaf transmisson coefficient (unused)
      P_m_ref       [μmol (CO2) m-2 (leaf) s-1] reference value for P_m
      λ             []                          CO2 response parameter
      f_C_m         []                          CO2 response parameter
      γ_Pm          []                          CO2 & T response parameter
      λ_α           [°C]                        CO2 & T response parameter
      γ_α           [°C]                        CO2 & T response parameter

      partitioning
      ρ_shoot_ref   [-]                         reference shoot partitioning fraction
      ρ_l           [-]                         fraction partitioned to leaf

      digestibility
      δ_ndf_x       [kg (d.wt) kg (d.wt)]       organ and age specific NDF digestibility
      δ_nc          [kg (d.wt) kg (d.wt)]       NDSC digestibility
      δ_pn          [kg (d.wt) kg (d.wt)]       PN digestibility as a function of CP [kg (CP) kg (d.wt)]
    */
    this.cons = {
        h_m: 0.5
      , L_half: 2.0
      , σ: 20.0
      , fAsh_leaf: 0.03
      , fAsh_stem: 0.05
      , N_ref: 0.04
      , d_r_h: 0.15
      , d_r_mx: 0.4
      , τ_veg: 200
      , photo: {
            T_ref: this.isC4 ? 25 : 20
          , T_mn: this.isC4 ? 12 : 3
          , T_opt_Pm_amb: this.isC4 ? 35 : 23
          , ξ: 0.8
          , k: this.isLegume ? 0.8 : 0.5
          , m: 0.0
          , α_amb_15: 0.05
          , P_m_ref: this.isC4 ? 22 : 16
          , λ: this.isC4 ? 1.05 : 1.2
          , f_C_m: this.isC4 ? 1.1 : 1.49
          , γ_Pm: 10
          , λ_α: 0.02 
          , γ_α: 6
        }
      , resp: {
            m_ref: 0.025  // maintenance coeficient at reference temperature
          , T_ref: this.isC4 ? 25 : 20
          , T_m_mn: this.isC4 ? 12 : 3
          , λ_N_up: 0.6                 // [kg (C) kg-1 (N)] N uptake respiration coefficent
          , λ_N_fix: 6                  // [kg (C) kg-1 (N)] N fixation respiration coefficent
        }
      , part: {
            ρ_shoot_ref: 0.75  // SGS
          , ρ_l: 0.7 // SGS
        }
        /* NDF digestibility per age class */
      , δ_ndf_l_1: 0.7
      , δ_ndf_l_2: 0.6
      , δ_ndf_l_3: 0.5
      , δ_ndf_l_dead: 0.2
      , δ_ndf_s_1: 0.5
      , δ_ndf_s_2: 0.4
      , δ_ndf_s_3: 0.3
      , δ_ndf_s_dead: 0.2
        /* NDSC digestibility per age class */
      , δ_nc: 0.97
        /* reference composition of new tissue dry matter, fractions */ 
      , dW_l_fdwt_ref: { sc: 0.50, nc: 0.22, pn: 0.25, ah: 0.03 }
      , dW_s_fdwt_ref: { sc: 0.63, nc: 0.18, pn: 0.13, ah: 0.05 }
      , dW_r_fdwt_ref: { sc: 0.67, nc: 0.20, pn: 0.10, ah: 0.03 }
      , N_leaf: { /* [kg (N) kg-1 (C)] */
        opt: 0.04 / 0.45,    // 
        max: 0.05 / 0.45,    //[kg (N) kg-1 (C)] AgPasture: 0.05 / 0.4 (NcleafOpt as fraction / C in DM as fraction)
        min: 0.012 / 0.45,    //[kg (N) kg-1 (C)] AgPasture: 0.012 / 0.4 (NcleafOpt as fraction / C in DM as fraction)
        ref: 0.04 / 0.45    //[kg (N) kg-1 (C)] TODO: source?
       }
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
        Ω_N: 1.0
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
      , N_req_opt: 0
      , ρ_shoot: 0.7
      , ρ_root: 0.3 
        /* d.wt composition of new tissue, fractions d.wt */ 
      , dW_l_fdwt: { sc: 0.54, nc: 0.22, pn: 0.19, ah: 0.03 }
      , dW_s_fdwt: { sc: 0.63, nc: 0.18, pn: 0.13, ah: 0.05 }
      , dW_r_fdwt: { sc: 0.67, nc: 0.20, pn: 0.10, ah: 0.03 }
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
      , PN_dead: { l: 0.0, s: 0.0, r: 0.0 }
        /* daily protein growth pool kg (C) m-2 */
      , dPN: { l: 0.0, s: 0.0, r: 0.0 }
        /* total litter; from senecenced leaf and stem */
      , Λ_litter: { sc: 0.0, pn: 0.0, nc: 0.0 }
        /* total senecenced root */ 
      , Λ_r: { sc: 0, pn: 0, nc: 0.0 }
    };


    /* initialze constants with pre-defined values by type; defaults to rye grass */
    if (cfg && cfg.type) {
    
      switch (cfg.type) {

      case 'white clover':

        this.isLegume = true;
        this.type = 'white clover';

        this.cons.h_m = 0.5;
        this.cons.L_half = 2.0;
        this.cons.σ = 36.8; // Topp (2004)
        this.cons.fAsh_leaf = 0.03;
        this.cons.fAsh_stem = 0.05;

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

        /* NDF digestibility per age class */
        this.cons.δ_ndf_l_1 = 0.7;
        this.cons.δ_ndf_l_2 = 0.6;
        this.cons.δ_ndf_l_3 = 0.5;
        this.cons.δ_ndf_l_dead = 0.2;
        this.cons.δ_ndf_s_1 = 0.5;
        this.cons.δ_ndf_s_2 = 0.4;
        this.cons.δ_ndf_s_3 = 0.3;
        this.cons.δ_ndf_s_dead = 0.2;

        /* NDSC digestibility per age class */
        this.cons.δ_nc = 1.00;
        
        /* reference composition of new tissue dry matter, fractions */ 
        this.cons.dW_l_fdwt_ref = { sc: 0.27, nc: 0.18, pn: 0.26, ah: 0.11 };
        this.cons.dW_s_fdwt_ref = { sc: 0.63, nc: 0.18, pn: 0.26, ah: 0.05 };
        this.cons.dW_r_fdwt_ref = { sc: 0.67, nc: 0.20, pn: 0.26, ah: 0.03 };

        /* leaf nitrogen TODO: remove? */
        this.cons.N_leaf.opt = 0.04 / 0.45;
        this.cons.N_leaf.max = 0.05 / 0.45;
        this.cons.N_leaf.min = 0.012 / 0.45;
        this.cons.N_leaf.ref = 0.04 / 0.45;

        break;
      case 'red clover':

        this.isLegume = true;
        this.type = 'red clover';

        this.cons.h_m = 0.3;
        this.cons.L_half = 2.0;
        this.cons.σ = 24.0; // Topp (2004)
        this.cons.fAsh_leaf = 0.03;
        this.cons.fAsh_stem = 0.05;

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

        /* NDF digestibility per age class */
        this.cons.δ_ndf_l_1 = 0.7;
        this.cons.δ_ndf_l_2 = 0.6;
        this.cons.δ_ndf_l_3 = 0.5;
        this.cons.δ_ndf_l_dead = 0.2;
        this.cons.δ_ndf_s_1 = 0.5;
        this.cons.δ_ndf_s_2 = 0.4;
        this.cons.δ_ndf_s_3 = 0.3;
        this.cons.δ_ndf_s_dead = 0.2;

        /* NDSC digestibility per age class */
        this.cons.δ_nc = 1.00;
        
        /* reference composition of new tissue dry matter, fractions */ 
        this.cons.dW_l_fdwt_ref = { sc: 0.50, nc: 0.22, pn: 0.25, ah: 0.03 };
        this.cons.dW_s_fdwt_ref = { sc: 0.63, nc: 0.18, pn: 0.13, ah: 0.05 };
        this.cons.dW_r_fdwt_ref = { sc: 0.67, nc: 0.20, pn: 0.10, ah: 0.03 };

        /* leaf nitrogen TODO: remove? */
        this.cons.N_leaf.opt = 0.04 / 0.45;
        this.cons.N_leaf.max = 0.05 / 0.45;
        this.cons.N_leaf.min = 0.012 / 0.45;
        this.cons.N_leaf.ref = 0.04 / 0.45;

        break;
      case 'ryegrass':

        this.isLegume = false;
        this.type = 'ryegrass';

        this.cons.h_m = 0.5;
        this.cons.L_half = 2.0;
        this.cons.σ = 25.8; // Topp (2004)
        this.cons.fAsh_leaf = 0.03;
        this.cons.fAsh_stem = 0.05;

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

        /* NDF digestibility per age class */
        this.cons.δ_ndf_l_1 = 0.7;
        this.cons.δ_ndf_l_2 = 0.6;
        this.cons.δ_ndf_l_3 = 0.5;
        this.cons.δ_ndf_l_dead = 0.2;
        this.cons.δ_ndf_s_1 = 0.5;
        this.cons.δ_ndf_s_2 = 0.4;
        this.cons.δ_ndf_s_3 = 0.3;
        this.cons.δ_ndf_s_dead = 0.2;

        /* NDSC digestibility per age class */
        this.cons.δ_nc = 1.00;
        
        /* reference composition of new tissue dry matter, fractions */ 
        this.cons.dW_l_fdwt_ref = { sc: 0.50, nc: 0.22, pn: 0.25, ah: 0.03 };
        this.cons.dW_s_fdwt_ref = { sc: 0.63, nc: 0.18, pn: 0.13, ah: 0.05 };
        this.cons.dW_r_fdwt_ref = { sc: 0.67, nc: 0.20, pn: 0.10, ah: 0.03 };

        /* leaf nitrogen TODO: remove? */
        this.cons.N_leaf.opt = 0.04 / 0.45;
        this.cons.N_leaf.max = 0.05 / 0.45;
        this.cons.N_leaf.min = 0.012 / 0.45;
        this.cons.N_leaf.ref = 0.04 / 0.45;

        break;
      case 'pasture grass':

        this.isLegume = false;
        this.type = 'pasture grass';

        this.cons.h_m = 0.5;
        this.cons.L_half = 2.0;
        this.cons.σ = 25.8; // Topp (2004)
        this.cons.fAsh_leaf = 0.03;
        this.cons.fAsh_stem = 0.05;

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

        /* NDF digestibility per age class */
        this.cons.δ_ndf_l_1 = 0.7;
        this.cons.δ_ndf_l_2 = 0.6;
        this.cons.δ_ndf_l_3 = 0.5;
        this.cons.δ_ndf_l_dead = 0.2;
        this.cons.δ_ndf_s_1 = 0.5;
        this.cons.δ_ndf_s_2 = 0.4;
        this.cons.δ_ndf_s_3 = 0.3;
        this.cons.δ_ndf_s_dead = 0.2;

        /* NDSC digestibility per age class */
        this.cons.δ_nc = 1.00;
        
        /* reference composition of new tissue dry matter, fractions */ 
        this.cons.dW_l_fdwt_ref = { sc: 0.50, nc: 0.22, pn: 0.25, ah: 0.03 };
        this.cons.dW_s_fdwt_ref = { sc: 0.63, nc: 0.18, pn: 0.13, ah: 0.05 };
        this.cons.dW_r_fdwt_ref = { sc: 0.67, nc: 0.20, pn: 0.10, ah: 0.03 };

        /* leaf nitrogen TODO: remove? */
        this.cons.N_leaf.opt = 0.04 / 0.45;
        this.cons.N_leaf.max = 0.05 / 0.45;
        this.cons.N_leaf.min = 0.012 / 0.45;
        this.cons.N_leaf.ref = 0.04 / 0.45;

        break;
      case 'meadow grass early':

        this.isLegume = false;
        this.type = 'meadow grass early';

        this.cons.h_m = 0.7;
        this.cons.L_half = 2.0;
        this.cons.σ = 25.8; // Topp (2004)
        this.cons.fAsh_leaf = 0.03;
        this.cons.fAsh_stem = 0.05;

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
        this.cons.part.ρ_shoot_ref = 0.8;  // Johnson (2013)
        this.cons.part.ρ_l = 0.5; // estimate (early flowering)
        this.cons.part.ρ_l_after_defoliation = 0.75; // estimate (early flowering)

        /* NDF digestibility per age class */
        this.cons.δ_ndf_l_1 = 0.7;
        this.cons.δ_ndf_l_2 = 0.6;
        this.cons.δ_ndf_l_3 = 0.5;
        this.cons.δ_ndf_l_dead = 0.2;
        this.cons.δ_ndf_s_1 = 0.5;
        this.cons.δ_ndf_s_2 = 0.4;
        this.cons.δ_ndf_s_3 = 0.3;
        this.cons.δ_ndf_s_dead = 0.2;

        /* NDSC digestibility per age class */
        this.cons.δ_nc = 1.00;
        
        /* reference composition of new tissue dry matter, fractions */ 
        this.cons.dW_l_fdwt_ref = { sc: 0.50, nc: 0.22, pn: 0.25, ah: 0.03 };
        this.cons.dW_s_fdwt_ref = { sc: 0.63, nc: 0.18, pn: 0.13, ah: 0.05 };
        this.cons.dW_r_fdwt_ref = { sc: 0.67, nc: 0.20, pn: 0.10, ah: 0.03 };

        /* leaf nitrogen TODO: remove? */
        this.cons.N_leaf.opt = 0.04 / 0.45;
        this.cons.N_leaf.max = 0.05 / 0.45;
        this.cons.N_leaf.min = 0.012 / 0.45;
        this.cons.N_leaf.ref = 0.04 / 0.45;

        break;
      case 'meadow grass late':

        this.isLegume = false;
        this.type = 'meadow grass late';

        this.cons.h_m = 0.7;
        this.cons.L_half = 2.0;
        this.cons.σ = 25.8 // Topp (2004)
        this.cons.fAsh_leaf = 0.03;
        this.cons.fAsh_stem = 0.05;

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
        this.cons.part.ρ_shoot_ref = 0.8;  // Johnson (2013)
        this.cons.part.ρ_l = 0.6; // estimate (late flowering)
        this.cons.part.ρ_l_after_defoliation = 0.75; // estimate (late flowering)

        /* NDF digestibility per age class */
        this.cons.δ_ndf_l_1 = 0.7;
        this.cons.δ_ndf_l_2 = 0.6;
        this.cons.δ_ndf_l_3 = 0.5;
        this.cons.δ_ndf_l_dead = 0.2;
        this.cons.δ_ndf_s_1 = 0.5;
        this.cons.δ_ndf_s_2 = 0.4;
        this.cons.δ_ndf_s_3 = 0.3;
        this.cons.δ_ndf_s_dead = 0.2;

        /* NDSC digestibility per age class */
        this.cons.δ_nc = 1.00;
        
        /* reference composition of new tissue dry matter, fractions */ 
        this.cons.dW_l_fdwt_ref = { sc: 0.50, nc: 0.22, pn: 0.25, ah: 0.03 };
        this.cons.dW_s_fdwt_ref = { sc: 0.63, nc: 0.18, pn: 0.13, ah: 0.05 };
        this.cons.dW_r_fdwt_ref = { sc: 0.67, nc: 0.20, pn: 0.10, ah: 0.03 };

        /* leaf nitrogen TODO: remove? */
        this.cons.N_leaf.opt = 0.04 / 0.45;
        this.cons.N_leaf.max = 0.05 / 0.45;
        this.cons.N_leaf.min = 0.012 / 0.45;
        this.cons.N_leaf.ref = 0.04 / 0.45;

        break;
      }
    }

    /* overwrite initial values with provided (optional) configuration values */
    if (cfg) {

      this.isLegume = cfg.isLegume || false;
      this.isC4 = cfg.isC4 || false;

      if (cfg.constants) {
        var constants = cfg.constants;
        for (var prop in constants) {
          if (constants.hasOwnProperty(prop)) {
            if (typeof this.cons[prop] != undefined)
              this.cons[prop] = constants[prop]
          }
        }
      }

    }


    /* shoot protein fraction [kg (protein) kg-1 (d.wt)] */
    this.fdwt_pn = function () {

      var PN = that.vars.PN;

      return ((PN.l + PN.s) / fC_pn) / that.dwt_shoot();

    };


    /* 
      protein digestibility Van Niekerk (1967) 
      
      pn  [g (crude protein) kg-1 (d.wt)]
    */
    this.δ_pn = function (pn) { 

      return 0.956 - (34.3 / pn); 

    };  

    /* total shoot digestibility including dead tissue */
    this.δ_shoot = function () {

      var cons = that.cons
        , vars = that.vars
        , SC = that.vars.SC
        , δ_ndf_l_1 = cons.δ_ndf_l_1
        , δ_ndf_l_2 = cons.δ_ndf_l_2
        , δ_ndf_l_3 = cons.δ_ndf_l_3
        , δ_ndf_l_dead = cons.δ_ndf_l_dead
        , δ_ndf_s_1 = cons.δ_ndf_s_1
        , δ_ndf_s_2 = cons.δ_ndf_s_2
        , δ_ndf_s_3 = cons.δ_ndf_s_3
        , δ_ndf_s_dead = cons.δ_ndf_s_dead
        , δ_nc = cons.δ_nc
        , δ_pn = this.δ_pn(this.fdwt_pn() * 1000) // kg to grams
        ;

      /* total ndf d.wt */
      var dwt_sc = (
        SC.live_l_1 +
        SC.live_l_2 +
        SC.live_l_3 +
        SC.dead_l +
        SC.live_s_1 +
        SC.live_s_2 +
        SC.live_s_3 +
        SC.dead_s
      ) / fC_sc;

      /* total nds d.wt */
      var dwt_nc = (
        vars.NC.l +
        vars.NC.s
      ) / fC_nc;

      /* total protein d.wt */
      var dwt_pn = (
        vars.PN.l +
        vars.PN.s
      ) / fC_pn;

      var dwt = dwt_sc + dwt_nc + dwt_pn;

      var δ_sc = (
        (δ_ndf_l_1 * (SC.live_l_1 / fC_sc / dwt_sc)) +
        (δ_ndf_l_2 * (SC.live_l_2 / fC_sc / dwt_sc)) +
        (δ_ndf_l_3 * (SC.live_l_3 / fC_sc / dwt_sc)) +
        (δ_ndf_l_dead * (SC.dead_l / fC_sc / dwt_sc)) +
        (δ_ndf_s_1 * (SC.live_s_1 / fC_sc / dwt_sc)) +
        (δ_ndf_s_2 * (SC.live_s_2 / fC_sc / dwt_sc)) +
        (δ_ndf_s_3 * (SC.live_s_3 / fC_sc / dwt_sc)) +
        (δ_ndf_s_dead * (SC.dead_s / fC_sc / dwt_sc))
      );

      return (
        (δ_sc * dwt_sc / dwt) + 
        (δ_nc * dwt_nc / dwt) + 
        (δ_pn * dwt_pn / dwt)
      );

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


    /* reference nitrogen content [kg (N) kg-1 (C)] */
    this.f_N_ref = function () {

        return that.cons.N_ref / that.F_C();

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
        ;

      return (
        /* convert leaf kg C to kg d.wt incl. ashes TODO: ashes */
        (SC.live_l_1 + SC.live_l_2 + SC.live_l_3 + SC.dead_l) / fC_sc + 
        NC.l / fC_nc + // TODO: add dead pools
        PN.l / fC_pn
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
        ;

      return (
        /* convert leaf kg C to kg d.wt incl. ashes TODO: ashes */
        (SC.live_s_1 + SC.live_s_2 + SC.live_s_3 + SC.dead_s) / fC_sc + 
        NC.s / fC_nc + 
        PN.s / fC_pn
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


    /* optimum N requirement for new tissue [kg (N) m-2] */
    this.N_req_opt = function () {

      // TODO: we dont know at this point how P_g is patitioned.... what to do?
      var N_req_opt = that.vars.P_g_day === 0 ? 0 : that.cons.N_leaf.opt * that.vars.P_g_day;

      debug('that.vars.P_g_day', that.vars.P_g_day);
      debug('that.cons.N_leaf.opt', that.cons.N_leaf.opt);
      debug('N_req_opt', N_req_opt);

      return N_req_opt;

      // return max(0, (that.f_N_ref() * (that.C_live_shoot() + that.C_root())) - (that.N_live_shoot() + that.N_root()));

    };


    /*(3.49) Y_leaf [-] growth respiration new leaf tissue (expressed as growth efficiency) 
      N_avail_leaf [kg (N) m-2] nitrogen available from uptake and fixation
      P_avail_leaf [kg (C) m-2] carbon available for growth TODO: wight by d.wt or caron share?*/
    this.Y_leaf = function (N_avail_leaf, C_avail_leaf) {

      debug(arguments);

      /* initialize with reference composition */
      var dW_l_fdwt_ref = that.cons.dW_l_fdwt_ref;
      var dW_l_fdwt = {
         sc: dW_l_fdwt_ref.sc
        ,nc: dW_l_fdwt_ref.nc
        ,pn: dW_l_fdwt_ref.pn
        ,ah: dW_l_fdwt_ref.ah
      };

      debug('dW_l_fdwt', dW_l_fdwt);

      /* convert d.wt fractions to carbon */
      var C_sc = dW_l_fdwt.sc * fC_sc
        , C_nc = dW_l_fdwt.nc * fC_nc
        , C_pn = dW_l_fdwt.pn * fC_pn
        , C = C_sc + C_nc + C_pn
        ;

      /* abs. carbon for protein synthesis with full N availability */
      var C_pn = C_avail_leaf * (C_pn / C);
      /* abs. nitrogen for protein sythesis [kg (N) m-2] */
      var N_demand_leaf = (C_pn / fC_pn) * fN_pn;
      /* nitrogen availability as share of demand */
      var fN = (N_avail_leaf / N_demand_leaf > 1) ? 1 : N_avail_leaf / N_demand_leaf;

      /* adjust carbon from protein in new tissue composition */
      C_pn = fN * dW_l_fdwt.pn * fC_pn;
      /* add non utilized carbon due to lack of nitrogen for protein synthesis to non-structural pool */
      C_nc += (1 - fN) * dW_l_fdwt.pn * fC_pn;

      debug('C', C);
      debug('C_sc', C_sc);
      debug('C_nc', C_nc);
      debug('C_pn', C_pn);
      
      // if (DEBUG && C.toFixed(4) != (C_sc + C_nc + C_pn).toFixed(4)) {
      //   logger(MSG.INFO, C);
      //   logger(MSG.INFO, C_sc);
      //   logger(MSG.INFO, C_nc);
      //   logger(MSG.INFO, C_pn);
      //   logger(MSG.INFO, C_sc + C_nc + C_pn);
      //   throw new Error('leaf (C != C_sc + C_nc + C_pn)');
      // }

      var dwt_ah = dW_l_fdwt.ah * ((C_sc / fC_sc + C_nc / fC_nc + C_pn / fC_pn) / (1 - dW_l_fdwt.ah));

      dW_l_fdwt.pn = (C_pn / fC_pn) / (C_sc / fC_sc + C_nc / fC_nc + C_pn / fC_pn + dwt_ah);
      dW_l_fdwt.nc = (C_nc / fC_nc) / (C_sc / fC_sc + C_nc / fC_nc + C_pn / fC_pn + dwt_ah);

      that.vars.dW_l_fdwt = dW_l_fdwt;

      /* weight Y by tissue composition */
      var Y_leaf = (
        Y_sc * dW_l_fdwt.sc / (1 - dW_l_fdwt_ref.ah) +
        Y_nc * dW_l_fdwt.nc / (1 - dW_l_fdwt_ref.ah) + 
        Y_pn * dW_l_fdwt.pn / (1 - dW_l_fdwt_ref.ah)
      );

      // logger(MSG.INFO, 'Y_leaf: '+Y_leaf);

      return Y_leaf; 

    };


    /*(3.49) Y_stem [-] growth respiration new leaf tissue (expressed as growth efficiency) 
      N_avail [kg m-2] nitrogen available from uptake and fixation*/
    this.Y_stem = function (N_avail_stem, C_avail_stem) {

      debug(arguments);

      /* initialize with reference composition */
      var dW_s_fdwt_ref = that.cons.dW_s_fdwt_ref;
      var dW_s_fdwt = {
         sc: dW_s_fdwt_ref.sc
        ,nc: dW_s_fdwt_ref.nc
        ,pn: dW_s_fdwt_ref.pn
        ,ah: dW_s_fdwt_ref.ah
      };

      debug('dW_s_fdwt', dW_s_fdwt);

      /* convert d.wt fractions to carbon */
      var C_sc = dW_s_fdwt.sc * fC_sc
        , C_nc = dW_s_fdwt.nc * fC_nc
        , C_pn = dW_s_fdwt.pn * fC_pn
        , C = C_sc + C_nc + C_pn
        ;

      /* abs. carbon for protein synthesis with full N availability */
      var C_pn = C_avail_stem * (C_pn / C);
      /* abs. nitrogen for protein sythesis [kg (N) m-2] */
      var N_demand_stem = (C_pn / fC_pn) * fN_pn;
      /* nitrogen availability as share of demand */
      var fN = (N_avail_stem / N_demand_stem > 1) ? 1 : N_avail_stem / N_demand_stem;

      /* adjust carbon from protein in new tissue composition */
      C_pn = fN * dW_s_fdwt.pn * fC_pn;
      /* add non utilized carbon due to lack of nitrogen for protein synthesis to non-structural pool */
      C_nc += (1 - fN) * dW_s_fdwt.pn * fC_pn;

      debug('C', C);
      debug('C_sc', C_sc);
      debug('C_nc', C_nc);
      debug('C_pn', C_pn);
      
      // if (C.toFixed(4) != (C_sc + C_nc + C_pn).toFixed(4)) {
      //   logger(MSG.INFO, C);
      //   logger(MSG.INFO, C_sc);
      //   logger(MSG.INFO, C_nc);
      //   logger(MSG.INFO, C_pn);
      //   logger(MSG.INFO, C_sc + C_nc + C_pn);
      //   throw 'stem (C != C_sc + C_nc + C_pn)';
      // }

      var dwt_ah = dW_s_fdwt.ah * ((C_sc / fC_sc + C_nc / fC_nc + C_pn / fC_pn) / (1 - dW_s_fdwt.ah));

      dW_s_fdwt.pn = (C_pn / fC_pn) / (C_sc / fC_sc + C_nc / fC_nc + C_pn / fC_pn + dwt_ah);
      dW_s_fdwt.nc = (C_nc / fC_nc) / (C_sc / fC_sc + C_nc / fC_nc + C_pn / fC_pn + dwt_ah);

      that.vars.dW_s_fdwt = dW_s_fdwt;

      /* weight Y by tissue composition */
      var Y_stem = (
        Y_sc * dW_s_fdwt.sc / (1 - dW_s_fdwt_ref.ah) +
        Y_nc * dW_s_fdwt.nc / (1 - dW_s_fdwt_ref.ah) + 
        Y_pn * dW_s_fdwt.pn / (1 - dW_s_fdwt_ref.ah)
      );

      // logger(MSG.INFO, 'Y_stem: '+Y_stem);

      return Y_stem; 

    };


      /*(3.49) Y_root [-] growth respiration new leaf tissue (expressed as growth efficiency) 
      N_avail [kg m-2] nitrogen available from uptake and fixation*/
    this.Y_root = function (N_avail_root, C_avail_root) {

      debug(arguments);

      /* initialize with reference composition */
      var dW_r_fdwt_ref = that.cons.dW_r_fdwt_ref;
      var dW_r_fdwt = {
         sc: dW_r_fdwt_ref.sc
        ,nc: dW_r_fdwt_ref.nc
        ,pn: dW_r_fdwt_ref.pn
        ,ah: dW_r_fdwt_ref.ah
      };

      debug('dW_r_fdwt', dW_r_fdwt);

      /* convert d.wt fractions to carbon */
      var C_sc = dW_r_fdwt.sc * fC_sc
        , C_nc = dW_r_fdwt.nc * fC_nc
        , C_pn = dW_r_fdwt.pn * fC_pn
        , C = C_sc + C_nc + C_pn
        ;

      /* abs. carbon for protein synthesis with full N availability */
      var C_pn = C_avail_root * (C_pn / C);
      /* abs. nitrogen for protein sythesis [kg (N) m-2] */
      var N_demand_root = (C_pn / fC_pn) * fN_pn;
      /* nitrogen availability as share of demand */
      var fN = (N_avail_root / N_demand_root > 1) ? 1 : N_avail_root / N_demand_root;

      /* adjust carbon from protein in new tissue composition */
      C_pn = fN * dW_r_fdwt.pn * fC_pn;
      /* add non utilized carbon due to lack of nitrogen for protein synthesis to non-structural pool */
      C_nc += (1 - fN) * dW_r_fdwt.pn * fC_pn;

      debug('C', C);
      debug('C_sc', C_sc);
      debug('C_nc', C_nc);
      debug('C_pn', C_pn);
      
      // if (C.toFixed(4) != (C_sc + C_nc + C_pn).toFixed(4)) {
      //   logger(MSG.INFO, C);
      //   logger(MSG.INFO, C_sc);
      //   logger(MSG.INFO, C_nc);
      //   logger(MSG.INFO, C_pn);
      //   logger(MSG.INFO, C_sc + C_nc + C_pn);
      //   throw 'root (C != C_sc + C_nc + C_pn)';
      // }

      var dwt_ah = dW_r_fdwt.ah * ((C_sc / fC_sc + C_nc / fC_nc + C_pn / fC_pn) / (1 - dW_r_fdwt.ah));

      dW_r_fdwt.pn = (C_pn / fC_pn) / (C_sc / fC_sc + C_nc / fC_nc + C_pn / fC_pn + dwt_ah);
      dW_r_fdwt.nc = (C_nc / fC_nc) / (C_sc / fC_sc + C_nc / fC_nc + C_pn / fC_pn + dwt_ah);

      that.vars.dW_r_fdwt = dW_r_fdwt;

      /* weight Y by tissue composition */
      var Y_root = (
        Y_sc * dW_r_fdwt.sc / (1 - dW_r_fdwt_ref.ah) +
        Y_nc * dW_r_fdwt.nc / (1 - dW_r_fdwt_ref.ah) + 
        Y_pn * dW_r_fdwt.pn / (1 - dW_r_fdwt_ref.ah)
      );

      // logger(MSG.INFO, 'Y_root: '+Y_root);

      return Y_root; 

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
        ;
        
      /* initialize carbon pools */

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

      SC.r = DM_root * DM[s] * 0.80 * fC_sc;
      NC.r += DM_root * DM[s] * 0.10 * fC_sc;
      PN.r += DM_root * DM[s] * 0.10 * fC_sc;

      logger(MSG.INFO, { SC: SC, NC: NC, PN: PN });
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

    return mixture;

  }; // Mixture end 


  /*
    Daily canopy gross photosynthesis in response to irradiance
    
    P_g_day       [kg (C) m-2 d-1]  gross photosynthesis

    T             [C°]              mean daily temperature
    T_mn          [C°]              minimum daily temperature
    T_mx          [C°]              maximum daily temperature
    PPF           [μmol m-2 d-1]    photosynthetic photon flux
    τ             [s]               daylength
    C_amb         [μmol mol-1]      CO2 concentration
    f_s           [-]               fraction direct solar radiation

    TODO: 
      - influence of temp. extremes on photosynthesis (3.58 ff)
  */  
  function grossPhotosynthesis(T, T_mn, T_mx, PPF, τ, C_amb, f_s) {

    if (DEBUG) debug(arguments, 'grossPhotosynthesis');

     var P_g_day_mix = [];
     var P_g_day = [];
     /* (1 - mixture.homogeneity) LAI covers (1 - mixture.homogeneity) / numberOfSpecies m-2 */
     var L_scale = (numberOfSpecies === 1 ? 1 : (1 - mixture.homogeneity) / ((1 - mixture.homogeneity) / numberOfSpecies));
     debug('L_scale', L_scale);

    /*
      (4.8b) Diurnal variation (distribution) in irradiance (I) and temperature (T) 
      This is a simplified calculation from Johnson 2005 (2008). Could be any distribution.

      R_s = PPF

      maximum irradiance within a day for 1/2 τ
      I_mx = 4/3 * R_s/τ
      irradiance during in- and decreasing irradiance within a day = 1/2 I_mx
      I_mn = 1/2 I_mx = 2/3 * R_s/τ

      R_s = (1/2 * τ * I_mx) + (x * τ * 1/2 * I_mx)
      R_s = (2/3 * R_s) + (x * 2/3 * R_s) <=> x = 1/2
      R_s = (1/2 * τ * I_mx) + (1/4 * τ * I_mx) <=> τ/2 * (I_mx + I_mx/2) <=> τ/2 * (I_mx + I_mn)

      temperature during max. irradiance within a day  
      T_I_mx = (T_mx + T_mean) / 2
      temperature during 1/2 max. irradiance within a day
      T_I_mn = T_mean

      (τ / 2) * P_g(I_mx, T_I_mx, N) [mg CO2 m-2 day-1] daily gross photosynthesis during max irradiance
      (τ / 2) * P_g(I_mn, T_I_mn, N) [mg CO2 m-2 day-1] daily gross photosynthesis during min irradiance
    */

    var I_mx = (4 / 3) * (PPF / τ)
      , I_mn = (1 / 2) * I_mx
      , T_I_mx = (T_mx + T) / 2
      , T_I_mn = T
      ;

    /* TODO: implement homogeneity */
    if (numberOfSpecies > 1) { 

      // array
      P_g_day_mix = P_g_mix(I_mx, I_mn, T_I_mx, T_I_mn, f_s, C_amb);
      if (mixture.homogeneity < 1)
        P_g_day = P_g(I_mx, I_mn, T_I_mx, T_I_mn, f_s, C_amb, L_scale);
      // if (DEBUG) {
      //   debug('P_g_day', P_g_day);
      //   for (var s = 0; s < numberOfSpecies; s++) {
      //     if (sum(P_g_day) / numberOfSpecies != P_g_day[s])
      //       throw new Error ('sum(P_g_day) / numberOfSpecies != P_g_day[s]');
      //   }
      // }

      /* iterate over mixture array */
      for (var s = 0; s < numberOfSpecies; s++) {

        /* (3.37) conversion of μmol CO2 to mol (1e-6) and mol CO2 to kg C (0.012) mixture[s].vars.Ω_water * sqrt(mixture[s].vars.Ω_N) missing in Johnson (2013) */
        mixture[s].vars.P_g_day = (44 * 12 / 44 * 1e-3) * 1e-6 * (τ / 2) * P_g_day_mix[s] * mixture[s].vars.Ω_water * mixture.homogeneity;
        if (mixture.homogeneity < 1)
          mixture[s].vars.P_g_day += (44 * 12 / 44 * 1e-3) * 1e-6 * (τ / 2) * P_g_day[s] * mixture[s].vars.Ω_water / L_scale * (1 - mixture.homogeneity);

      }

    } else {

      P_g_day = P_g(I_mx, I_mn, T_I_mx, T_I_mn, f_s, C_amb, L_scale);

      /* iterate over mixture array */
      for (var s = 0; s < numberOfSpecies; s++) {

        /* (3.37) conversion of μmol CO2 to mol (1e-6) and mol CO2 to kg C (0.012) Ω_water missing in Johnson (2013) */
        mixture[s].vars.P_g_day = (44 * 12 / 44 * 1e-3) * 1e-6 * (τ / 2) * P_g_day[s] * mixture[s].vars.Ω_water;

        debug('P_g_day[s] [kg (C) m-2 d-1]', (44 * 12 / 44 * 1e-3) * 1e-6 * (τ / 2) * P_g_day[s])

      }

    }

    /*
      (2.21) Direct solar radiation

      I_s_l [μmol (photons) m-2 s-1]  :direct (including diffuse) solar radiation within the canopy
      I_0   [μmol (photons) m-2 s-1]  :incident solar radiation on the canopy
      k_e_i [-]                       :effective leaf extinction coefficient at leaf area layer i 
      k     [-]                       :leaf extinction coefficient 
      fs    [-]                       :fraction direct solar radiation
    */
    
    // function I_s_l(l, I_0, k_e_i, k) {

    //   if (DEBUG) debug(arguments, 'I_s_l');
      
    //   var I_s_l = 0
    //     , fs = fs || 0.7
    //     ; 
        
    //   I_s_l =  k * I_0 * (f_s + (1 - f_s) * exp(-k_e_i * l));

    //   return I_s_l;

    // }
    

    /*
      (2.21) Diffuse solar radiation

      I_d_l [μmol (photons) m-2 s-1]  :diffuse solar radiation within the canopy
      I_0   [μmol (photons) m-2 s-1]  :incident solar radiation on the canopy
      k_e_i [-]                       :effective leaf extinction coefficient at leaf area layer i 
      k     [-]                       :leaf extinction coefficient 
      f_s   [-]                       :fraction direct solar radiation 
    */

    // function I_d_l(l, I_0, k_e_i, k, f_s) {

    //   if (DEBUG) debug(arguments, 'I_d_l');
      
    //   var I_d_l = 0;

    //   I_d_l =  k * I_0 * (1 - f_s) * exp(-k_e_i * l);

    //   return I_d_l;

    // }


    /*
      (1.16) CO2 response function
  
      Takes unity at C_amb_ref, λ at double C_amb_ref and f_C_m at C -> ∞
  
      TODO: calculation of parameters required only once: move somewhere else 
      
      f_C   [-]           scale factor
      C     [μmol mol-1]  ambient CO2 concentration
      λ     [-]           f_C at double C_amb_ref
      f_C_m [-]           f_C at saturating C
    */
    
    function f_C(C, λ, f_C_m) {
  
      // check (1.21)
      if (f_C_m >= λ / (2 - λ)) {
        f_C_m = λ / (2 - λ) - 1e-10; // make sure it is smaller
        logger(MSG.WARN, 'Adjusted f_C_m to ' + f_C_m + ' since f_C_m >= λ / (2 - λ)');
      }
  
      var f_C = 1
        , C_amb_ref = 380
        , Φ = (f_C_m * (λ * (f_C_m - 1) - 2 * (f_C_m - λ))) / (pow(λ, 2) * (f_C_m - 1) - 2 * (f_C_m - λ))
        , β = (λ * (f_C_m - Φ * λ)) / (2 * C_amb_ref * (f_C_m - λ))
        ;
  
      f_C = 1 / (2 * Φ) * (β * C + f_C_m - sqrt(pow(β * C + f_C_m, 2) - 4 * Φ * β * f_C_m * C));
  
      return f_C;
  
    }


    /*
      (3.14) N response function

      f_N [kg (N) kg-1 (C)] nitrogen fraction

      TODO: use species.cons.N_ref
    */

    function f_Pm_N(f_N, f_N_ref) {

      if (DEBUG) debug(arguments, 'f_Pm_N');

      var f_Pm_N = 0;

      f_Pm_N = (f_N < f_N_ref) ? (f_N / f_N_ref) : 1;

      return f_Pm_N; 

    }


    /*
      (3.16 ff) Combiend T & CO2 response function

      T   [°C]
      C_amb [μmol mol-1]  ambient CO2 concentration
    */

    function f_Pm_TC(T, C_amb, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) {

      if (DEBUG) debug(arguments, 'f_Pm_TC');

      var f_Pm_TC = 0
        , q = 2 // TODO: value? (vgl. S. 12, Johnson 2013)
        , T_opt_Pm = T_opt_Pm_amb + γ_Pm * (f_C(C_amb, λ, f_C_m) - 1)
        , T_mx = ((1 + q) * T_opt_Pm - T_mn) / q
        ;

      /* (1.40) constrain */
      if (T_ref > T_opt_Pm)
        T_ref = T_opt_Pm;

      /* C4 species constraint ..  "so that the temperature response does not fall when temperatures exceed the optimum." S. 45 */
      T  = (isC4 && T > T_opt_Pm) ? T_opt_Pm : T; 

      if (T <= T_mn || T >= T_mx)
        f_Pm_TC = 0;
      else
        f_Pm_TC = pow((T - T_mn) / (T_ref - T_mn), q) * (((1 + q) * T_opt_Pm - T_mn - q * T) / ((1 + q) * T_opt_Pm - T_mn - q * T_ref));

      return f_Pm_TC; 

    }


    /*
      (3.25 ff) Combiend T & CO2 response function

      T   [°C]
      CO2 [μmol mol-1]  ambient CO2 concentration
    */

    function f_α_TC(T, C_amb, λ_α, γ_α, λ, f_C_m) {

      if (DEBUG) debug(arguments, 'f_α_TC');

      var f_α_TC = 0
        , C_amb_ref = 380
        , T_opt_α = 15 + γ_α * (f_C(C_amb, λ, f_C_m) - 1)
        ;

      f_α_TC = (T < T_opt_α) ? 1 : (1 - λ_α * (C_amb_ref / C_amb) * (T - T_opt_α));  

      return f_α_TC; 

    }


    /*
      (3.29) N response function

      f_N [kg (N) kg-1 (C)] nitrogen fraction
    */

    function f_α_N(f_N, f_N_ref) {

      if (DEBUG) debug(arguments, 'f_α_N');

      var f_α_N = 0;

      f_α_N = (f_N > f_N_ref) ? 1 : (0.5 + 0.5 * (f_N / f_N_ref));

      return f_α_N; 

    }

    
    /*
      P_l [μmol (CO2) m-2 (leaf) s-1] rate of single leaf gross photosynthesis in response to incident PPF
      I   [μmol (photons) m-2 s-1]    incident solar radiation
      T   [°C]                        temperature  
      N
      C   []  ambient CO2
      α   []
      P_m []
    */
    
    function P_l(I_l, α, P_m, ξ) {

      if (DEBUG) debug(arguments, 'P_l');
      
      var P_l = 0; 

      P_l = 1 / (2 * ξ) * (α * I_l + P_m - sqrt(pow(α * I_l  + P_m, 2) - 4 * ξ * α * I_l * P_m));

      return P_l;

    }

    
    /*
      (3.33, 3.101 ff) Canopy gross photosynthesis in mixed swards including photorespiration

      P_g [μmol (CO2) m-2 s-1]      instantaneous canopy gross photosynthesis
      
      I_0 [μmol (photons) m-2 s-1]  incident solar radiation on the canopy
      T   [°C]                      temperature
      f_s [-]                       fraction direct solar radiation
      C_amb
    */
    
    function P_g_mix(I_mx, I_mn, T_I_mx, T_I_mn, f_s, C_amb) {

      if (DEBUG) debug(arguments, 'P_g');

      var P_g = [] // return values 
        , δL = mixture.δL
        , n_L = mixture.n_L()
        , n_start_p = mixture.n_start_p(n_L) // array
        , δL_p = mixture.δL_p(n_start_p, n_L)
        , δL_i = mixture.δL_i(n_start_p, n_L, δL_p)
        , k_e_i = mixture.k_e_i(n_L, n_start_p, δL_p)
        , α_mx = []
        , α_mn = []
        , P_m_mx = []
        , P_m_mn = []
        , ξ = []
        , k = []
        ;

      if (DEBUG) {
        debug('n_L', n_L);
        debug('n_start_p', n_start_p);
        debug('δL_p', δL_p);
        debug('δL_i', δL_i);
        debug('k_e_i', k_e_i);
        for (var s = 0; s < numberOfSpecies; s++)
          debug('LAI', mixture[s].L());
        // if (sum(n_start_p) / numberOfSpecies != 1)
        //   throw new Error('sum(n_start_p) / numberOfSpecies != 1');
      }

      var I_s_mx = I_mx * f_s
        , I_s_mn = I_mn * f_s
        , I_d_mx = I_mx * (1 - f_s)
        , I_d_mn = I_mn * (1 - f_s)
        ;

      /* iterate over species */
      for (var s = 0; s < numberOfSpecies; s++) {

        P_g[s] = 0;

        var species = mixture[s] 
          , cons = species.cons
          , photo = cons.photo
          , α_amb_15 = photo.α_amb_15
          , P_m_ref = photo.P_m_ref
          , isC4 = species.isC4
          , λ_α = photo.λ_α
          , γ_α = photo.γ_α
          , γ_Pm = photo.γ_Pm // TODO: value?
          , T_mn = photo.T_mn
          , T_ref = photo.T_ref
          , T_opt_Pm_amb = photo.T_opt_Pm_amb
          , λ = photo.λ
          , f_C_m = photo.f_C_m
          , f_N = species.N_live_leaf() / species.C_live_leaf() // TODO: canopy or leaf?
          , f_N_ref = cons.N_leaf.ref
          ;

        if (DEBUG) {
          debug('s', s);
          debug('f_N', f_N);
          debug('f_N_ref', f_N_ref);
        }
        
        k[s] = photo.k;
        ξ[s] = photo.ξ;

        /* (3.23) Photosynthetic efficiency, α */
        if (isC4) {
          α_mx[s] = a_mn[s] = α_amb_15 * f_C(C_amb, λ, f_C_m) * f_α_N(f_N, f_N_ref);
        } else {
          α_mx[s] = α_amb_15 * f_C(C_amb, λ, f_C_m) * f_α_TC(T_I_mx, C_amb, λ_α, γ_α, λ, f_C_m) * f_α_N(f_N, f_N_ref);
          α_mn[s] = α_amb_15 * f_C(C_amb, λ, f_C_m) * f_α_TC(T_I_mn, C_amb, λ_α, γ_α, λ, f_C_m) * f_α_N(f_N, f_N_ref);
        }

        /* (3.8) Light saturated photosynthesis, P_m. TODO: why not related to light extiction (exp(-kl)) any more? */
        P_m_mx[s] = P_m_ref * f_C(C_amb, λ, f_C_m) * f_Pm_TC(T_I_mx, C_amb, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) * f_Pm_N(f_N, f_N_ref);
        P_m_mn[s] = P_m_ref * f_C(C_amb, λ, f_C_m) * f_Pm_TC(T_I_mn, C_amb, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) * f_Pm_N(f_N, f_N_ref);

      } // for s


      if (DEBUG) {
        debug('k', k);
        debug('ξ', ξ);
        debug('α_mx', α_mx);
        debug('α_mn', α_mn);
      }

      /*  
          numerical integration:
        - iterate through the depth of the canopy of species.
        - if a new species appears in layer i (i >= n_start_p[s]) LAI increment 
          increases by δL_p and k_e_i (weighted k) changes
        - the fraction of leafs in direct light declines through the depth of 
          the canopy: exp(-k * l). The fraction in diffuse light increases: 1 - exp(-k * l)
        - the fraction in direct light is always also in diffuse light (2.21) 
      */

      var I_s_l_mx = 0
        , I_s_l_mn = 0
        , I_d_l_mx = 0
        , I_d_l_mn = 0
        , L_s = 1
        , L_d = 0
        ;

      /* iterate over leaf area layers */
      for (var i = 1; i <= n_L; i++) {

        /* include species s in integeration if s has occured in layer i */
        for (var s = 0; s < numberOfSpecies; s++) {
          
          if (n_start_p[s] <= i) {

            I_s_l_mx = k[s] * (I_s_mx + I_d_mx);
            I_s_l_mn = k[s] * (I_s_mn + I_d_mn);
            I_d_l_mx = k[s] * I_d_mx;
            I_d_l_mn = k[s] * I_d_mn;

            P_g[s] += P_l(I_s_l_mx, α_mx[s], P_m_mx[s], ξ[s]) * L_s * δL_p[s];
            P_g[s] += P_l(I_s_l_mn, α_mn[s], P_m_mn[s], ξ[s]) * L_s * δL_p[s];
            P_g[s] += P_l(I_d_l_mx, α_mx[s], P_m_mx[s], ξ[s]) * L_d * δL_p[s];
            P_g[s] += P_l(I_d_l_mn, α_mn[s], P_m_mn[s], ξ[s]) * L_d * δL_p[s];

          } // if s in i

        
        } // for s

        /* diffuse light at layer i+1 */
        I_d_mx = I_d_mx * (1 - k_e_i[i] * δL_i[i]);
        I_d_mn = I_d_mn * (1 - k_e_i[i] * δL_i[i]);

        /* fraction leaves in direct light */
        L_s = L_s * (1 - k_e_i[i] * δL_i[i]);
        /* fraction leaves only in diffuse light */
        L_d = 1 - L_s;

      } // for i

      return P_g;
      
    } // P_g_mix


    function P_g(I_mx, I_mn, T_I_mx, T_I_mn, f_s, C_amb, L_scale) {

      var P_g = []; // return values 

      /* iterate over species */
      for (var s = 0; s < numberOfSpecies; s++) {

        P_g[s] = 0;

        var species = mixture[s] 
          , cons = species.cons
          , α_amb_15 = cons.photo.α_amb_15
          , P_m_ref = cons.photo.P_m_ref
          , k = cons.photo.k
          , f_N = species.f_N_live_leaf() // TODO: leaf or shoot?
          , isC4 = species.isC4
          , α = 0
          , P_m = 0
          , ξ = cons.photo.ξ
          , λ_α = cons.photo.λ_α
          , γ_α = cons.photo.γ_α
          , γ_Pm = cons.photo.γ_Pm
          , T_mn = cons.photo.T_mn
          , T_ref = cons.photo.T_ref
          , T_opt_Pm_amb = cons.photo.T_opt_Pm_amb
          , λ = cons.photo.λ
          , f_C_m = cons.photo.f_C_m
          , f_N = species.N_live_leaf() / species.C_live_leaf() // TODO: canopy or leaf?
          , f_N_ref = cons.N_leaf.ref
          , LAI = species.L() * L_scale
          ;

        debug(species.vars);
        debug('LAI', LAI);

        /* (3.23) Photosynthetic efficiency, α */
        var α_mx = α_amb_15 * f_C(C_amb, λ, f_C_m) * f_α_N(f_N, f_N_ref);
        var α_mn = α_amb_15 * f_C(C_amb, λ, f_C_m) * f_α_N(f_N, f_N_ref);
        if (!isC4) {
          α_mx = α_mx * f_α_TC(T_I_mx, C_amb, λ_α, γ_α, λ, f_C_m);
          α_mn = α_mx * f_α_TC(T_I_mn, C_amb, λ_α, γ_α, λ, f_C_m);
        }

        /* (3.8) Light saturated photosynthesis, P_m. TODO: why not related to light extiction (exp(-kl)) any more? */
        var P_m_mx = P_m_ref * f_C(C_amb, λ, f_C_m) * f_Pm_TC(T_I_mx, C_amb, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) * f_Pm_N(f_N, f_N_ref);
        var P_m_mn = P_m_ref * f_C(C_amb, λ, f_C_m) * f_Pm_TC(T_I_mn, C_amb, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) * f_Pm_N(f_N, f_N_ref);

        var Δ_l = 0.1;
        var n = LAI / Δ_l;

        for (var i = 1; i <= n; i++) {
          
          var l_i = (2 * i - 1) * Δ_l / 2;
          
          /* direct (s) and diffuse (d) radiation */
          var I_l_mx_s = k * I_mx * (f_s + (1 - f_s) * exp(-k * l_i));
          var I_l_mx_d = k * I_mx * (1 - f_s) * exp(-k * l_i);
          var I_l_mn_s = k * I_mn * (f_s + (1 - f_s) * exp(-k * l_i));
          var I_l_mn_d = k * I_mn * (1 - f_s) * exp(-k * l_i);
          
          P_g[s] += P_l(I_l_mx_s, α_mx, P_m_mx, ξ) * exp(-k * l_i) * Δ_l;
          P_g[s] += P_l(I_l_mx_d, α_mx, P_m_mx, ξ) * (1 - exp(-k * l_i)) * Δ_l;
          P_g[s] += P_l(I_l_mn_s, α_mn, P_m_mn, ξ) * exp(-k * l_i) * Δ_l;
          P_g[s] += P_l(I_l_mn_d, α_mn, P_m_mn, ξ) * (1 - exp(-k * l_i)) * Δ_l;
          
        }

        if (DEBUG) {
          debug('I_mx', I_mx);
          debug('I_mn', I_mn);
          debug('Ω_N', species.vars.Ω_N);
          debug('α_amb_15', α_amb_15);
          debug('α_mx', α_mx);
          debug('α_mn', α_mn);
          debug('P_m_ref', P_m_ref);
          debug('P_m_mx', P_m_mx);
          debug('P_m_mn', P_m_mn);
          debug('P_g[s] [μmol (CO2) m-2 s-1]', P_g[s]);
        }

      } // for s

      return P_g;

    } // P_g

  }; // grossPhotosynthesis


  /* 
    Daily carbon fixation

    requires: N [kg m-2] availability from uptake, remobilization and fixation

    - reduce gross assimilates by maintenance respiration and N uptake&fixation cost
    - if gross assilmilates are not sufficient to satisfy bowth i.e. P_growth < 0 reduce
      non-structrural C pools

    TODO: N-response switch


  */
  function netPhotosynthesis(T) {

    debug('netPhotosynthesis');

    /* iterate over mixture array */
    for (var s = 0, ps = numberOfSpecies; s < ps; s++) {

      var species = mixture[s]
        , vars = species.vars
        , cons = species.cons
        , f_N = species.f_N_live_shoot()
        , P_g_day = vars.P_g_day
        , C_total = species.C_live_shoot() + species.C_root()
        , N_avail = species.vars.N_avail
        , isC4 = species.isC4
        , F_C = species.F_C()
        ;

      // vars.R_m = R_m(T, species.N_live_shoot() / species.C_live_shoot(), cons.N_leaf.ref, C_total);
      var C_live_leaf = species.C_live_leaf()
        , N_live_leaf = species.N_live_leaf()
        , C_live_stem = species.C_live_stem()
        , N_live_stem = species.N_live_stem()
        , C_root = species.C_root()
        , N_root = species.N_root()
        ;
      vars.R_m = R_m(T, N_live_leaf / C_live_leaf, cons.N_leaf.ref, C_live_leaf);
      vars.R_m += R_m(T, N_live_stem / C_live_stem, cons.N_leaf.ref * 0.5, C_live_stem);
      vars.R_m += R_m(T, N_root / C_root, cons.N_leaf.ref * 0.5, C_root);

      vars.R_N = R_N(species.vars.N_up, species.vars.N_fix);
      
      /*(3.57) Gross assimilation P_g_day adjusted for maintenance respiration, 
      respiratory costs of nitrogen uptake and fixation. Use R_N from previous day (circularity) */
      var P_growth = P_g_day - vars.R_m - vars.R_N;
      debug('P_g_day: ' + P_g_day);
      debug('P_growth: ' + P_growth);
      debug('vars.R_m: ' + vars.R_m);
      debug('vars.R_N: ' + vars.R_N);
      debug('C_total: ' + C_total);

      if (P_growth > 0) {

        /* update partitioning coefficients */
        var ρ_l = cons.part.ρ_l
          , ρ_s = 1 - ρ_l
          , ρ_shoot = cons.part.ρ_shoot_ref * sqrt(vars.Ω_water * vars.Ω_N) /* based on previous day values! */
          , ρ_root = 1 - ρ_shoot
          , N_req = 0
          , N_assim = 0 // sum all organs [kg N m-2]
          , N_ref_opt = cons.N_leaf.opt
          , N_ref_max = cons.N_leaf.max
          ;

        vars.ρ_shoot = ρ_shoot;
        vars.ρ_root = ρ_root;

        /* 
          now update N_up & N_fix 
          move remobilized N to protein pool of live tissuse: This will increase tissue N conc.

          if N conc. for any tissue is below opt. then allow for max. N assimilation otherwise utilize available N up to N opt.
          
          TODO:
            - is there any N uptake f P_growth <= 0?
            - how to partition available N between organs? If any is below a minimum serve this orgen first? 
        */

        /* calculate current tissue N conc. of live tissue [kg (N,protein) kg-1 (C, live tissue)]*/
        var f_N_live = {
          leaf: species.N_live_leaf() / species.C_live_leaf(),
          stem: species.N_live_stem() / species.C_live_stem(),
          root: species.N_root() / species.C_root()
        };

        debug('f_N_live', f_N_live);
        debug('f_N_live_dwt', species.N_live_leaf() / species.dwt_live_leaf());

        /* is any below optimum? */
        var ordering = [LEAF, SHOOT, ROOT];
        if (f_N_live.leaf < N_ref_opt) {
          if (f_N_live.root <= N_ref_opt * 0.5 && f_N_live.stem > N_ref_opt * 0.5) {
            ordering[1] = ROOT;
            ordering[2] = SHOOT; // is stem
          }
        } else if (f_N_live.root <= N_ref_opt * 0.5 || f_N_live.stem <= N_ref_opt * 0.5) {
          if (f_N_live.root <= N_ref_opt * 0.5 && f_N_live.stem > N_ref_opt * 0.5) {
            ordering[0] = ROOT;
            ordering[1] = LEAF;
            ordering[2] = SHOOT; // is stem
          } else if (f_N_live.stem <= N_ref_opt * 0.5) {
            ordering[0] = SHOOT;
            ordering[1] = LEAF;
            ordering[2] = ROOT;
          } else { /* both at minimum */
            ordering[0] = SHOOT;
            ordering[1] = ROOT;
            ordering[2] = LEAF;
          }
        }

        debug('ordering', ordering)

        var N_up_pool = sum(N_up[s]);

        /* distribute available N uptake till depleted or N requirements met */
        for (var organ = 0; organ < 3; organ++) {
          
          var ρ = 0 // partitioning coefficent
            , f_sc = 0
            , f_pn = 0
            , N_ref_opt_organ = 0
            ; 

          if (ordering[organ] === LEAF) {

            ρ = ρ_shoot * ρ_l;
            f_sc = 0.55; // fix stucture fraction [kg (C,structure) kg-1 (C,tissue)]
            N_ref_opt_organ = N_ref_opt;
            f_pn = N_ref_max / fN_pn * fC_pn;
          
          } else if (ordering[organ] === SHOOT) {
            
            ρ = ρ_shoot * ρ_s;
            f_sc = 0.60; // fix stucture fraction [kg (C,structure) kg-1 (C,tissue)]
            N_ref_opt_organ = N_ref_opt * 0.5;
            f_pn = (N_ref_max * 0.5) / fN_pn * fC_pn;
          
          } else if (ordering[organ] === ROOT) {

            ρ = ρ_root;
            f_sc = 0.60; // fix stucture fraction [kg (C,structure) kg-1 (C,tissue)]
            N_ref_opt_organ = N_ref_opt * 0.5;
            f_pn = (N_ref_max * 0.5) / fN_pn * fC_pn;
          
          }

          debug('f_pn, max', f_pn);
          debug('N_ref_opt_organ', N_ref_opt_organ);

         /* calculate required N if tissue tries to assimilate up to max. N */
          var f_nc = 1 - (f_sc + f_pn)
            , Y = 1 / (1 + (1 - Y_sc) / Y_sc * f_sc + (1 - Y_nc) / Y_nc * f_nc + (1 - Y_pn) / Y_pn * f_pn)
            , C_assimilated = Y * P_growth * ρ /* [kg (C) m-2] */
            , N_assimilated = C_assimilated * f_pn * fN_pn / fC_pn /* [kg (N) m-2] */
            ;

          if (N_assimilated > N_up_pool)  { // TODO: what if N avail. is below N.min for tissue?

            // for legumes assume a fall back to a minimum of N.opt instead of N.max and satisfy missing N form fixation
            // TODO: move legumes to the end of mixture array

            // recalculate C_assimilated with f_pn exactly depleting N_up_pool; sc is fixed
            // f_np = (N(available) / (Y(f_sc,f_pn) * P)) * (fC_pn / fN_pn) -> solved for f_pn 
            f_pn = (
              (N_up_pool * (fC_pn / fN_pn) * Y_pn * (-f_sc * Y_sc + f_sc * Y_nc + Y_sc)) /
              (Y_sc * (N_up_pool * (fC_pn / fN_pn) * (Y_pn - Y_nc) + (P_growth * ρ) * Y_pn * Y_nc))
            );
            f_nc = 1 - (f_sc + f_pn);
            Y = 1 / (1 + (1 - Y_sc) / Y_sc * f_sc + (1 - Y_nc) / Y_nc * f_nc + (1 - Y_pn) / Y_pn * f_pn);
            C_assimilated = Y * P_growth * ρ; /* [kg (C) m-2] */
            N_assimilated = C_assimilated * f_pn * fN_pn / fC_pn;

            if (DEBUG) {
              debug(ordering[organ] === LEAF ? 'leaf:' : (ordering[organ] === SHOOT ? 'stem:' : 'root:'));
              debug('C_assimilated, organ ' + ordering[organ], C_assimilated);
              debug('N_assimilated, organ ' + ordering[organ], N_assimilated);
              debug('N_up_pool', N_up_pool);
              debug('f_pn', f_pn);
              debug('Y', Y);
              if (roundN(10, N_assimilated) != roundN(10, N_up_pool))
                throw new Error(N_assimilated != N_up_pool);
            }

            N_up_pool = 0;

          } else {

            N_up_pool -= N_assimilated;
            debug('N_up_pool', N_up_pool)
            debug('N_assimilated', N_assimilated)

          }

          // only up to N_opt. No compensation if an organ (due to a low initial N conc.) consumes above N_opt
          N_req += (N_assimilated === 0) ? N_ref_opt_organ * C_assimilated : min(N_ref_opt_organ * C_assimilated, N_assimilated); 
          N_assim += N_assimilated;

          // update variables
          if (ordering[organ] === LEAF) {
            vars.Y_leaf = Y;
            vars.G_leaf = C_assimilated;
            var dwt = C_assimilated * (f_sc / fC_sc + f_nc / fC_nc + f_pn / fC_pn);
            // update organic d.wt composition of new growth to leaf
            vars.dW_l_fdwt.sc = (C_assimilated * f_sc / fC_sc) / dwt;
            vars.dW_l_fdwt.nc = (C_assimilated * f_nc / fC_nc) / dwt;
            vars.dW_l_fdwt.pn = (C_assimilated * f_pn / fC_pn) / dwt;

          } else if (ordering[organ] === SHOOT) {
            vars.Y_stem = Y;
            vars.G_stem = C_assimilated;
            var dwt = C_assimilated * (f_sc / fC_sc + f_nc / fC_nc + f_pn / fC_pn);
            // update organic d.wt composition of new growth to stem
            vars.dW_s_fdwt.sc = (C_assimilated * f_sc / fC_sc) / dwt;
            vars.dW_s_fdwt.nc = (C_assimilated * f_nc / fC_nc) / dwt;
            vars.dW_s_fdwt.pn = (C_assimilated * f_pn / fC_pn) / dwt;
          } else if (ordering[organ] === ROOT) {
            vars.Y_root = Y;
            vars.G_root = C_assimilated;
            // update organic d.wt composition of new growth to root
            var dwt = C_assimilated * (f_sc / fC_sc + f_nc / fC_nc + f_pn / fC_pn);
            vars.dW_r_fdwt.sc = (C_assimilated * f_sc / fC_sc) / dwt;
            vars.dW_r_fdwt.nc = (C_assimilated * f_nc / fC_nc) / dwt;
            vars.dW_r_fdwt.pn = (C_assimilated * f_pn / fC_pn) / dwt;
          }

        } // for each organ

        // TODO: dont forget to account for remob and fixation here!
        species.vars.Ω_N = min(1, N_assim / N_req);
        species.vars.N_assim = N_assim;
        species.vars.N_req = N_req;
        vars.G = vars.G_leaf + vars.G_stem + vars.G_root;

        if (DEBUG) {
          debug('Ω_N', species.vars.Ω_N);
          debug('N_assim', species.vars.N_assim);
          debug('N_req', species.vars.N_req);
        }


      } else { // no growth: assimilates are not sufficent for respiratory costs 

        // TODO: e.g. (P_growth * NC.l / NC_p) > NC.l ? accelerate flux to dead?
        // TODO: what if nc pool is empty?

        var NC = vars.NC
          , NC_pool = NC.l + NC.s + NC.r
          ;

        /* reduce nc pools by share as long as non-structural pool > 0 */
        if (NC_pool > 0) {
          if (NC.l > 0)
            NC.l = max(0, NC.l + (P_growth * NC.l / NC_pool));
          if (NC.s > 0)
            NC.s = max(0, NC.s + (P_growth * NC.s / NC_pool));
          if (NC.r > 0)
            NC.r = max(0, NC.r + (P_growth * NC.r / NC_pool));
        }

        species.vars.Ω_N = 1;
        species.vars.N_assim = 0;
        species.vars.N_req = 0;
        vars.G = vars.G = vars.G_leaf = vars.G_stem = vars.G_root = 0;

      }


      // OLD ->
      // if (P_growth > 0) { // net assmilates for growth of new tissue

      //   var vars = species.vars
      //     , cons = species.cons
      //     , dW_l_fdwt_ref = cons.dW_l_fdwt_ref
      //     , dW_s_fdwt_ref = cons.dW_s_fdwt_ref
      //     , dW_r_fdwt_ref = cons.dW_r_fdwt_ref
      //     , ρ_shoot_ref = cons.part.ρ_shoot_ref
      //     , ρ_l = cons.part.ρ_l
      //     , ρ_s = 1 - ρ_l
      //     , ρ_shoot = ρ_shoot_ref * sqrt(vars.Ω_water * vars.Ω_N) /* based on previous day values! */
      //     , ρ_root = 1 - ρ_shoot
      //     ; 

      //   /* N allocation to organ by partitioning and ref protein content of new tissue */  
      //   var N_avail_l = N_avail * ρ_shoot * ρ_l * (dW_l_fdwt_ref.pn / (dW_l_fdwt_ref.pn + dW_s_fdwt_ref.pn + dW_r_fdwt_ref.pn))  
      //     , N_avail_s = N_avail * ρ_shoot * ρ_s * (dW_s_fdwt_ref.pn / (dW_l_fdwt_ref.pn + dW_s_fdwt_ref.pn + dW_r_fdwt_ref.pn))  
      //     , N_avail_r = N_avail * ρ_root * (dW_r_fdwt_ref.pn / (dW_l_fdwt_ref.pn + dW_s_fdwt_ref.pn + dW_r_fdwt_ref.pn))
      //     ;

      //   debug('N_avail_l', N_avail);
      //   debug('ρ_shoot_ref', ρ_shoot_ref);
      //   debug('Ω_water', Ω_water);
      //   debug('Ω_N', Ω_N);
      //   debug('ρ_shoot', ρ_shoot);

      //   var Y_leaf = species.Y_leaf(N_avail_l, P_growth * ρ_shoot * ρ_l)
      //     , Y_stem = species.Y_stem(N_avail_s, P_growth * ρ_shoot * ρ_s)
      //     , Y_root = species.Y_root(N_avail_r, P_growth * ρ_root)
      //       /* weight by organ partitioning */
      //     , Y = (Y_leaf * ρ_shoot * ρ_l) + (Y_stem * ρ_shoot * ρ_s) + (Y_root * ρ_root)
      //     ;

      //   /*(3.57, 3.49) P available for growth adjusted for growth respiration Y */
      //   vars.G = Y * P_growth;
      //   vars.Y = Y;
      //   vars.Y_leaf = Y_leaf;
      //   vars.Y_stem = Y_stem;
      //   vars.Y_root = Y_root;

      // } else { // no growth: assimilates are not sufficent for respiratory costs 

      //   // TODO: e.g. (P_growth * NC.l / NC_p) > NC.l ? accelerate flux to dead?
      //   // TODO: what if nc pool is empty?

      //   var NC = species.vars.NC
      //     , NC_p = NC.l + NC.s + NC.r
      //     ;

      //   /* reduce nc pools by share as long as non-structural pool > 0 */
      //   if (NC.l > 0)
      //     NC.l = max(0, NC.l + (P_growth * NC.l / NC_p));
      //   if (NC.s > 0)
      //     NC.s = max(0, NC.s + (P_growth * NC.s / NC_p));
      //   if (NC.r > 0)
      //     NC.r = max(0, NC.r + (P_growth * NC.r / NC_p));

      //   species.vars.G = 0;

      // } <-- OLD

    }


    /*
      (3.41 ff) Maintenance respiration

      R_m [kg (C) m-2 d-1]

      m_ref   [d-1] maintenance coefficient at reference temperature and N content
      T_ref   [°C]   

    */
    
    function R_m(T, f_N, f_N_ref, W) {

      if (DEBUG) debug(arguments);

      var R_m = 0
        , m_ref = cons.resp.m_ref
        ;
      
      R_m =  m_ref * f_m(T) * (f_N / f_N_ref) * W;

      return R_m;
      
    }


    /*
      (3.44) Maintenance temperature response
    */

    function f_m(T) {

      if (DEBUG) debug(arguments);

      var f_m = 1
        , T_m_mn = cons.resp.T_m_mn
        , T_ref = cons.resp.T_ref
        ;

      f_m = (T <= T_m_mn) ? 0 : (T - T_m_mn) / (T_ref - T_m_mn);

      return f_m;

    }


    /*
      (3.51 ff) Respiratory costs of N uptake and fixation
    
      R_N     [kg (C) m-2 d-1]
      N_up    [kg (N) m-2]      daily N uptake
      N_fix   [kg (N) m-2]      daily N fixation
      
      λ_N_up  [kg (C) kg-1 (N)] N uptake respiration coefficent
      λ_N_fix [kg (C) kg-1 (N)] N fixation respiration coefficent

    */

    function R_N(N_up, N_fix) {

      if (DEBUG) debug(arguments);

      var R_N = 0
        , λ_N_up = cons.resp.λ_N_up
        , λ_N_fix = cons.resp.λ_N_fix
        ;

      R_N = λ_N_up * N_up + λ_N_fix * N_fix;

      return R_N;

    }

  }; // netPhotosynthesis
    

  /*
    Partitioning of net assimilates and tissue turnover

    G [kg (C) m-2 day-1]  net growth rate     
    
    TODO: 
      - include influence of defoliation (4.21c) 
      - trampling by animals (4.16m)
  */
  function partitioning(T) {

    debug('partitioning');
    if (DEBUG) debug(arguments);

    /* iterate over mixture array */
    for (var s = 0, ps = mixture.length; s < ps; s++) {
  
      var vars = mixture[s].vars 
        , cons = mixture[s].cons 
        , G_r = vars.G_root
        , G_l = vars.G_leaf 
        , G_s = vars.G_stem
        ;

      /* growth dynamics */
      var dSC = vars.dSC
        , SC = vars.SC
        , NC = vars.NC
        , dNC = vars.dNC
        , NC_dead = vars.NC_dead
        , PN = vars.PN
        , PN_dead = vars.PN_dead
        , dPN = vars.dPN
        , Λ_r = vars.Λ_r
        , Λ_litter = vars.Λ_litter
          /* dwt fractions of new tissue already adjusted for nitrogen availability */
        , f_dwt_l = vars.dW_l_fdwt
        , f_dwt_s = vars.dW_s_fdwt
        , f_dwt_r = vars.dW_r_fdwt
          /* C fractions */
        , f_C_l = f_dwt_l.sc * fC_sc + f_dwt_l.nc * fC_nc + f_dwt_l.pn * fC_pn
        , dwt_s = f_dwt_s.sc /** fC_sc*/ + f_dwt_s.nc /** fC_nc*/ + f_dwt_s.pn /** fC_pn*/
        , dwt_r = f_dwt_r.sc /** fC_sc*/ + f_dwt_r.nc /** fC_nc*/ + f_dwt_r.pn /** fC_pn*/
          /* leaf appearance rate */
        , Φ_l = 1 / 8
          /* leaf flux parameter */
        , l_live_per_tiller = 3
        , no_boxes = 3
        , γ_l = f_γ(T) * 0.05 // TODO: Φ_l * no_boxes / l_live_per_tiller
          /* stem flux parameter TODO: how to better relate γ_s, γ_r to γ_l */
        , γ_s = 0.8 * γ_l // 0.8 is scale factor turn over rate relative to leaves
        , γ_r = 0.02
          /* dead to litter flux parameter (value from AgPasture) */
        , γ_dead = 0.11
        ;

      /* assimilated carbon to leaf, stem and root converted to protein carbon */
      dPN.l = G_l * (f_dwt_l.pn * fC_pn) / (f_dwt_l.sc * fC_sc + f_dwt_l.nc * fC_nc + f_dwt_l.pn * fC_pn); 
      dPN.s = G_s * (f_dwt_s.pn * fC_pn) / (f_dwt_s.sc * fC_sc + f_dwt_s.nc * fC_nc + f_dwt_s.pn * fC_pn); 
      dPN.r = G_r * (f_dwt_r.pn * fC_pn) / (f_dwt_r.sc * fC_sc + f_dwt_r.nc * fC_nc + f_dwt_r.pn * fC_pn);

      /* assimilated carbon to leaf, stem and root converted to non-structural carbon */
      dNC.l = G_l * (f_dwt_l.nc * fC_nc) / (f_dwt_l.sc * fC_sc + f_dwt_l.nc * fC_nc + f_dwt_l.pn * fC_pn); 
      dNC.s = G_s * (f_dwt_s.nc * fC_nc) / (f_dwt_s.sc * fC_sc + f_dwt_s.nc * fC_nc + f_dwt_s.pn * fC_pn); 
      dNC.r = G_r * (f_dwt_r.nc * fC_nc) / (f_dwt_r.sc * fC_sc + f_dwt_r.nc * fC_nc + f_dwt_r.pn * fC_pn);

      /* remobilizaton of non-structural carbon, lipids and protein in flux to dead material */
      var γ_remob = 0.1; // TODO: ?? lower fluxes to dead material instead of remobilization?

      /* (3.89 ff) leaf */
      /* assimilated carbon to leaf converted to structural carbon minus flux of structure to age box 2 */
      dSC.live_l_1 = (
        G_l * (f_dwt_l.sc * fC_sc) / (f_dwt_l.sc * fC_sc + f_dwt_l.nc * fC_nc + f_dwt_l.pn * fC_pn) - 
        (2 * γ_l * SC.live_l_1)
      );
      dSC.live_l_2 = (2 * γ_l * SC.live_l_1) - (γ_l * SC.live_l_2);
      dSC.live_l_3 = (γ_l * SC.live_l_2) - (γ_l * SC.live_l_3);
      dSC.dead_l = (γ_l * SC.live_l_3) - (γ_dead * SC.dead_l);

      if (DEBUG) {
        debug('γ_l', γ_l);
        debug('T', T);
        debug('f_γ(T)', f_γ(T));
      }

      /* (3.93 ff) sheath and stem */
      dSC.live_s_1 = (G_s * (f_dwt_s.sc / dwt_s)) - (2 * γ_s * SC.live_s_1);
      dSC.live_s_2 = (2 * γ_s * SC.live_s_1) - (γ_s * SC.live_s_2);
      dSC.live_s_3 = (γ_s * SC.live_s_2) - (γ_s * SC.live_s_3);
      dSC.dead_s = (γ_s * SC.live_s_3) - (γ_dead * SC.dead_s);

      /* (3.97) root */
      dSC.r = (G_r * (f_dwt_r.sc / dwt_r)) - (γ_r * SC.r);
      
      /* senescenced root TODO: remove variable?*/
      Λ_r.sc += γ_r * SC.r;


      // logger(MSG.INFO, { dSC: dSC, dNC: dNC, dPN: dPN });


      /* (4.18m) input to litter. Johnson (2005/2008) TODO: here it includes root, add own pool? */
      Λ_litter.sc += γ_dead * (SC.dead_l + SC.dead_s);
      Λ_litter.nc += γ_dead * (NC_dead.l + NC_dead.s + NC_dead.r);
      Λ_litter.pn += γ_dead * (PN_dead.l + PN_dead.s + PN_dead.r);

      /* TODO: this is just a test: flux of pn and nc to litter pools (assume 80% remob in NC and 50% in PN) */
      dNC.l -= 0.2 * γ_l * NC.l;
      dNC.s -= 0.2 * γ_s * NC.s;
      dNC.r -= 0.2 * γ_r * NC.r;

      NC_dead.l += 0.2 * γ_l * NC.l - γ_dead * NC_dead.l;
      NC_dead.s += 0.2 * γ_s * NC.s - γ_dead * NC_dead.s;
      NC_dead.r += 0.2 * γ_r * NC.r - γ_dead * NC_dead.r;

      dPN.l -= 0.5 * γ_l * PN.l;
      dPN.s -= 0.5 * γ_s * PN.s;
      dPN.r -= 0.5 * γ_r * PN.r;

      PN_dead.l += 0.5 * γ_l * PN.l - γ_dead * PN_dead.l;
      PN_dead.s += 0.5 * γ_s * PN.s - γ_dead * PN_dead.s;
      PN_dead.r += 0.5 * γ_r * PN.r - γ_dead * PN_dead.r;


      /* update C pools with dSC, dPN, dNC */

      /* leaf */
      SC.live_l_1 += dSC.live_l_1;
      SC.live_l_2 += dSC.live_l_2;
      SC.live_l_3 += dSC.live_l_3;
      SC.dead_l += dSC.dead_l;
      NC.l += dNC.l;
      PN.l += dPN.l;

      /* sheath and stem */
      SC.live_s_1 += dSC.live_s_1;
      SC.live_s_2 += dSC.live_s_2;
      SC.live_s_3 += dSC.live_s_3;
      SC.dead_s += dSC.dead_s;
      NC.s += dNC.s;
      PN.s += dPN.s;

      /* root */
      SC.r += dSC.r;
      NC.r += dNC.r;
      PN.r += dPN.r;

      /* cost of tissue aging e.g. lignin synthesis TODO: calculate cost of ndf synthesis, increase ndf share? */
      // NC.l = max(0, NC.l - 0.05 * (2 * γ_l * SC.live_l_1));
      // NC.s = max(0, NC.s - 0.05 * (2 * γ_s * SC.live_s_1));
      // NC.r = max(0, NC.r - 0.05 * (γ_r * SC.r));

      // logger(MSG.INFO, { SC: SC, NC: NC, PN: PN });
    
    }

    /*
      (3.99) Influence of temperature on growth dynamics

      f_γ [0-1]
      T   [°C]
      
      TODO: parameters? Default for rye grass (3.100)
    */

    function f_γ(T) {

      var f_γ = 0
        , T_mn = 3
        , T_opt = 20
        , T_ref = 20
        , q = 2
        ;

      /* (1.40) constrain */
      if (T_ref > T_opt)
        T_ref = T_opt;

      if (T <= T_mn)
        f_γ = 0;
      else if (T_mn < T < T_opt)
        f_γ = pow((T - T_mn) / (T_ref - T_mn), q) * (((1 + q) * T_opt - T_mn - q * T) / ((1 + q) * T_opt - T_mn - q * T_ref));
      else if (T >= T_opt)
        f_γ = pow((T_opt - T_mn) / (T_ref - T_mn), q) * ((T_opt - T_mn) / ((1 + q) * T_opt - T_mn - q * T_ref));

      return f_γ;

    }
    
  };


  /* initialization of Species & Mixture */
  var spec = [], dm = [];
  for (var s = 0; s < numberOfSpecies; s++) {

    spec.push(
      new Species({
        type: species[s].type,
        constants: species[s].constants
      })
    );
    dm.push(species[s].dryMatter); 
  
  }

  mixture = new Mixture(spec, { DM: dm });

  /* since mixture might be re-sortet in each step we can not rely on the original index if species parameters are accessed */
  for (var s = 0; s > numberOfSpecies; s++)
    mixtureUnsorted[s] = mixture[s];

  /*
    T           [C°]            mean daily temperature
    T_mx        [C°]            maximum daily temperature
    T_mn        [C°]            minimum daily temperature
    R_s         [MJ m-2]        global radiation
    sunhours    [h]             unused
    julday      [#]             unused
    rh          [-]             relative humidity
    u           [m-s]           wind speed
    u_h         [m]             wind speed height
    C_amb       [μmol mol-1]    CO2 concentration
    rr          [mm]            rainfall
    f_s         [-]             fraction direct solar radiation
    τ           [s]             daylength
    PPF         [μmol m-2 d-1]  photosynthetic photon  flux
    R_a         [MJ m-2]        extraterrestrial radiation
  */

  var step = function (T, T_mx, T_mn, R_s, sunhours, julday, rh, u, u_h, C_amb, rr, f_s, τ, PPF, R_a) {

    if (DEBUG) debug(arguments);

    /* set root distribution variables */
    rootDistribution();
    /* set max. potential nitrogen uptake */
    nitrogenUptake();

    // groundwater
    // var vc_RootingZone = int(floor(0.5 + ((1.3 * mixture.d_r_mx()) / vs_LayerThickness)));
    // var vm_GroundwaterTable = int(soilColumn.vm_GroundwaterTable);

    /* TODO: set for each species? */ 
    vc_ReferenceEvapotranspiration =  fc_ReferenceEvapotranspiration(T, T_mx, T_mn, rh, u, u_h, R_s, C_amb, R_a);

    interception(rr);

    // from fc_CropWaterUptake -->
    var vc_PotentialEvapotranspiration = min(6.5, vc_ReferenceEvapotranspiration * vc_KcFactor); // [mm]

    vc_RemainingEvapotranspiration = vc_PotentialEvapotranspiration; // [mm]

    // If crop holds intercepted water, first evaporation from crop surface
    if (vc_InterceptionStorage > 0.0) {
      if (vc_RemainingEvapotranspiration >= vc_InterceptionStorage) {
        vc_RemainingEvapotranspiration -= vc_InterceptionStorage;
        vc_EvaporatedFromIntercept = vc_InterceptionStorage;
        vc_InterceptionStorage = 0.0;
      } else {
        vc_InterceptionStorage -= vc_RemainingEvapotranspiration;
        vc_EvaporatedFromIntercept = vc_RemainingEvapotranspiration;
        vc_RemainingEvapotranspiration = 0.0;
      }
    } else {
      vc_EvaporatedFromIntercept = 0.0;
    } // <-- from fc_CropWaterUptake

    var E_T_pot = vc_RemainingEvapotranspiration;

    /* sort by stress factor in asc. order: make sure a species is not in relative higher stress because it is always
       the last in mixture that nitrogen and water is allocated to */ 
    mixture.sort(function (a, b) {
      // return sqrt(a.vars.Ω_water * a.vars.Ω_N) - sqrt(b.vars.Ω_water * b.vars.Ω_N);
      return a.vars.Ω_water - b.vars.Ω_water;
    });

    /* set actual transpiration and water limiting factor */
    transpiration(E_T_pot);

    /* set species.vars.P_g_day */
    grossPhotosynthesis(T, T_mn, T_mx, PPF, τ, C_amb, f_s);

    debug('N_up_sum', N_up_sum);
    netPhotosynthesis(T);

    for (var s = 0; s < numberOfSpecies; s++) {
      var species = mixture[s];
      var N_up_pot = sum(N_up[s]);
      species.vars.N_up = species.vars.N_assim; // TODO species.vars.N_assim - Fixation
      for (var l = 0; l < vs_NumberOfLayers; l++)
        N_up[s][l] = species.vars.N_up * N_up[s][l] / N_up_pot;
    }


        // TODO: set actual uptake 
        // /* [kg (C, protein) kg-1 (C, tissue)] = [kg (N,tissue) kg-1 (C,tissue)] * [kg (d.wt,protein) kg-1 (N,protein)] * [kg (C,protein) kg (d.wt,protein)] */
        // var f_p = species.cons.N_ref.opt / fN_pn * fC_pn;
        // /* required N with optimum growth N concentration [kg(N) m-2] = [kg (C) m-2] * [kg (N) kg-1 (C)] */
        // var P_g_N = P_growth * species.cons.N_ref.opt;

        // /* N fixation Johnson 2013 eq. 3.70 TODO: where to set N_remob? */
        // species.vars.N_req_opt = species.N_req_opt();
        // species.vars.N_up = sum(N_up[s]); /* sum over layers */
        // species.vars.N_fix = species.isLegume ? max(0, N_req_opt - (species.vars.N_remob + species.vars.N_up)) : 0;
        // species.vars.N_avail = species.vars.N_up + species.vars.N_fix + species.vars.N_remob;
        // /* N growth limiting factor */
        // species.vars.Ω_N = min(1, species.vars.N_avail / species.vars.N_req_opt);
        // debug('species.vars.Ω_N', species.vars.Ω_N);
        // debug('species.vars.N_req_opt', species.vars.N_req_opt);
        // debug('species.vars.N_avail', species.vars.N_avail);
        
        // /* update actual N uptake */
        // if (species.vars.N_avail > species.vars.N_req_opt) {

        //   debug('N_up[s] before update', N_up[s]);
        //   debug('sum(N_up[s]) before update', sum(N_up[s]));
          
        //   for (var l = 0; l < vs_NumberOfLayers; l ++) {
        //     N_up[s][l] = (species.vars.N_req_opt - (species.vars.N_remob + species.vars.N_fix)) * N_up[s][l] / species.vars.N_up;
        //   }
          
        //   debug('N_up[s] after update', N_up[s]);
        //   // update sum
        //   debug('sum(N_up[s]) after update', sum(N_up[s]));
          
        //   species.vars.N_up = species.vars.N_req_opt - (species.vars.N_remob + species.vars.N_fix);
        //   species.vars.N_avail = species.vars.N_up + species.vars.N_remob + species.vars.N_fix;
        
        // }

    
    partitioning(T);

  }; // step end


  /* 
    set and update variables:
    f_r root  fration per species and soil layer
    f_r_sum   root fraction sum per species
    W_r       root kg C m-2 per species and soil layer
    W_r_sum   root kg C m-2 sum per soil layer
  */
  function rootDistribution() {

    /* root distribution scaling factor */
    var q_r = 3;

    for (var s = 0; s < numberOfSpecies; s++) {

      var species = mixture[s];
      debug('species.vars', species.vars);
      /* TODO: move k_sum calc. somewhere else */
      species.vars.τ++;
      species.vars.k_sum = min(1, species.vars.τ / species.cons.τ_veg);
      var C_root = species.C_root();
      /* Johnson 2008, eq. 4.19b */ 
      species.vars.d_r = 0.05 + (species.cons.d_r_mx - 0.05) * species.vars.k_sum;

      debug('C_root', C_root);
      debug('species.vars.d_r', species.vars.d_r);
      debug('species.vars.k_sum', species.vars.k_sum);
      debug('species.cons.d_r_mx', species.cons.d_r_mx);
      debug('species.vars.τ', species.vars.τ);

      f_r_sum[s] = 0;

      for (var l = 0; l < vs_NumberOfLayers; l++) {
        /* z [m] upper boundary of layer l */
        var z = vs_LayerThickness * l;
        if (z > species.vars.d_r) {
          /* since f_r only approaches zero (asymptote, f_r_sum < 1) we stop at root depth d_r and later relate f_r_l to f_r_sum */
          f_r[s][l] = 0;
          continue;
        }
        /* (4.19c) Johnson (2008) relative root distribution share in layer l. upper minus lower layer boundary */
        f_r[s][l] = (
          (1 / (1 + pow((z / species.cons.d_r_h) * (species.cons.d_r_mx / species.vars.d_r), q_r))) - 
          (1 / (1 + pow(((z + vs_LayerThickness) / species.cons.d_r_h) * (species.cons.d_r_mx / species.vars.d_r), q_r)))
        );
        f_r_sum[s] += f_r[s][l];
      }

      /* distribute root C to each soil layer */
      for (var l = 0; l < vs_NumberOfLayers; l++)
        W_r[s][l] = C_root * f_r[s][l] / f_r_sum[s];
        
    } // for each species

    for (var l = 0; l < vs_NumberOfLayers; l++) {
      W_r_sum[l] = 0; 
      for (var s = 0; s < numberOfSpecies; s++) {
        W_r_sum[l] += W_r[s][l]; /* total root mass per layer */
      }
    }


    if (DEBUG) {
      debug('f_r', f_r);
      debug('W_r', W_r);
    }


    // var dwt_root = mixture.dwt_root() /* [kg (d.wt) m-2] */
    //   , C_root = mixture.C_root()      [kg (C) m-2] 
    //   , pc_SpecificRootLength = 300   /* [m kg-1 (d.wt)] is identical for all crops in MONICA db */
    //   ;

    /* set root density: workaround to use MONICAS water uptake routines */
    // for (var l = 0; l < vs_NumberOfLayers; l++)
    //   vc_RootDensity[l] = (1 / vs_LayerThickness) * pc_SpecificRootLength * W_r_sum[l] * dwt_root / C_root;

  };


  /* 
    set and update variables:
    N_up      potential N uptake kg N m-2 per species and soil layer
    N_up_sum  potential N uptake kg N m-2 per soil layer
  */
  function nitrogenUptake() {

    var d_r_mx = mixture.d_r_mx(); // max. root depth [m]
    var dwt2carbon = 1 / 0.45; // TODO: calculate real conversion per species

    for (var l = 0; l < vs_NumberOfLayers; l++) {
      /* kg (N) m-3 / kg (soil) m-3 = kg (N) kg-1 (soil) */
      var N = soilColumn[l].get_SoilNO3() / soilColumn[l].vs_SoilBulkDensity(); // TODO: NH4?
      /* Johnson 2013, eq. 3.69 [kg (soil) kg-1 (root C)] TODO: error in doc. ? suppose it is per kg (root C) instead per kg (root d.wt) */
      var ξ_N = 200 * dwt2carbon; // convert from dwt to carbon TODO: value? unit? allow per species
      /* total uptake from layer must not exceed layer N */
      N_up_sum[l] = min(soilColumn[l].get_SoilNO3() * vs_LayerThickness, ξ_N * N * W_r_sum[l]);
      debug('ξ_N', ξ_N);
      debug('N', N);
      debug('N_ppm', N * 1e6);
      debug('N_up_sum[l]', N_up_sum[l]);
    }

    for (var l = 0; l < vs_NumberOfLayers; l++) {
      for (var s = 0; s < numberOfSpecies; s++)
        N_up[s][l] = (W_r_sum[l] === 0) ? 0 : N_up_sum[l] * W_r[s][l] / W_r_sum[l];
    }

    if (DEBUG) {

      debug('N_up', N_up);

      logger(MSG.DEBUG, (sum(N_up_sum) * SQM_PER_HA) + ' N uptake pot. [kg (N) ha-1]');
      logger(MSG.DEBUG, (sum(W_r_sum) * SQM_PER_HA) + ' C root [kg (C) ha-1]');

      /* total soil N [kg m-2] in root zone */
      var N_soil = 0;
      for (var l = 0; l < vs_NumberOfLayers; l++) {
        N_soil += soilColumn[l].get_SoilNO3() * vs_LayerThickness;
        if (d_r_mx <= (l + 1) * vs_LayerThickness) /* does root reach into next layer? */
          break;
      }

      logger(MSG.DEBUG, (N_soil * SQM_PER_HA) + ' soil N in root zone [kg (N) ha-1]');
      if (sum(N_up_sum) > N_soil)
        throw new Error('sum(N_up_sum) > N_soil');

    }

  } // nitrogenUptake

  
  function fc_ReferenceEvapotranspiration(vw_MeanAirTemperature, vw_MaxAirTemperature, vw_MinAirTemperature, vw_RelativeHumidity, vw_WindSpeed, vw_WindSpeedHeight, vc_GlobalRadiation, vw_AtmosphericCO2Concentration, vc_ExtraterrestrialRadiation) {

    if (DEBUG) debug(arguments);

    var vc_AtmosphericPressure; //[kPA]
    var vc_PsycrometerConstant; //[kPA °C-1]
    var vc_SaturatedVapourPressureMax; //[kPA]
    var vc_SaturatedVapourPressureMin; //[kPA]
    var vc_SaturatedVapourPressure; //[kPA]
    var vc_VapourPressure; //[kPA]
    var vc_SaturationDeficit; //[kPA]
    var vc_SaturatedVapourPressureSlope; //[kPA °C-1]
    var vc_WindSpeed_2m; //[m s-1]
    var vc_AerodynamicResistance; //[s m-1]
    var vc_SurfaceResistance; //[s m-1]
    var vc_ReferenceEvapotranspiration; //[mm]
    var vw_NetRadiation; //[MJ m-2]

    var user_crops = centralParameterProvider.userCropParameters;
    var pc_SaturationBeta = user_crops.pc_SaturationBeta; // Original: Yu et al. 2001; beta = 3.5
    var pc_StomataConductanceAlpha = user_crops.pc_StomataConductanceAlpha; // Original: Yu et al. 2001; alpha = 0.06
    var pc_ReferenceAlbedo = user_crops.pc_ReferenceAlbedo; // FAO Green gras reference albedo from Allen et al. (1998)

    // Calculation of atmospheric pressure
    vc_AtmosphericPressure = 101.3 * pow(((293.0 - (0.0065 * vs_HeightNN)) / 293.0), 5.26);

    // Calculation of psychrometer constant - Luchtfeuchtigkeit
    vc_PsycrometerConstant = 0.000665 * vc_AtmosphericPressure;

    // Calc. of saturated water vapour pressure at daily max temperature
    vc_SaturatedVapourPressureMax = 0.6108 * exp((17.27 * vw_MaxAirTemperature) / (237.3 + vw_MaxAirTemperature));

    // Calc. of saturated water vapour pressure at daily min temperature
    vc_SaturatedVapourPressureMin = 0.6108 * exp((17.27 * vw_MinAirTemperature) / (237.3 + vw_MinAirTemperature));

    // Calculation of the saturated water vapour pressure
    vc_SaturatedVapourPressure = (vc_SaturatedVapourPressureMax + vc_SaturatedVapourPressureMin) / 2.0;

    // Calculation of the water vapour pressure
    if (vw_RelativeHumidity <= 0.0){
      // Assuming Tdew = Tmin as suggested in FAO56 Allen et al. 1998
      vc_VapourPressure = vc_SaturatedVapourPressureMin;
    } else {
      vc_VapourPressure = vw_RelativeHumidity * vc_SaturatedVapourPressure;
    }

    // Calculation of the air saturation deficit
    vc_SaturationDeficit = vc_SaturatedVapourPressure - vc_VapourPressure;

    // Slope of saturation water vapour pressure-to-temperature relation
    vc_SaturatedVapourPressureSlope = (4098.0 * (0.6108 * exp((17.27 * vw_MeanAirTemperature) / (vw_MeanAirTemperature
        + 237.3)))) / ((vw_MeanAirTemperature + 237.3) * (vw_MeanAirTemperature + 237.3));

    // Calculation of wind speed in 2m height
    vc_WindSpeed_2m = vw_WindSpeed * (4.87 / (log(67.8 * vw_WindSpeedHeight - 5.42)));

    // Calculation of the aerodynamic resistance
    vc_AerodynamicResistance = 208.0 / vc_WindSpeed_2m;

    // if (vc_GrossPhotosynthesisReference_mol <= 0.0) {
    //   vc_StomataResistance = 999999.9; // [s m-1]
    // } else {
    //   vc_StomataResistance = // [s m-1]
    //       (vw_AtmosphericCO2Concentration * (1.0 + vc_SaturationDeficit / pc_SaturationBeta))
    //           / (pc_StomataConductanceAlpha * vc_GrossPhotosynthesisReference_mol);
    // }

    // johnson default canopy conductance g_c = 0.015 [m s-1] inverse of stomata resistance
    var vc_StomataResistance = 1 / 0.015;  

    vc_SurfaceResistance = vc_StomataResistance / 1.44;

    // vc_SurfaceResistance = vc_StomataResistance / (vc_CropHeight * vc_LeafAreaIndex);

    // vw_NetRadiation = vc_GlobalRadiation * (1.0 - pc_ReferenceAlbedo); // [MJ m-2]

    var vc_ClearSkyShortwaveRadiation = (0.75 + 0.00002 * vs_HeightNN) * vc_ExtraterrestrialRadiation;
    var vc_RelativeShortwaveRadiation = vc_GlobalRadiation / vc_ClearSkyShortwaveRadiation;
    var vc_NetShortwaveRadiation = (1.0 - pc_ReferenceAlbedo) * vc_GlobalRadiation;

    var pc_BolzmanConstant = 0.0000000049; // Bolzmann constant 4.903 * 10-9 MJ m-2 K-4 d-1
    vw_NetRadiation = vc_NetShortwaveRadiation - (pc_BolzmanConstant
      * (pow((vw_MinAirTemperature + 273.16), 4.0) + pow((vw_MaxAirTemperature
      + 273.16), 4.0)) / 2.0 * (1.35 * vc_RelativeShortwaveRadiation - 0.35)
      * (0.34 - 0.14 * sqrt(vc_VapourPressure)));

    // Calculation of reference evapotranspiration
    // Penman-Monteith-Method FAO
    vc_ReferenceEvapotranspiration = ((0.408 * vc_SaturatedVapourPressureSlope * vw_NetRadiation)
        + (vc_PsycrometerConstant * (900.0 / (vw_MeanAirTemperature + 273.0)) * vc_WindSpeed_2m * vc_SaturationDeficit))
        / (vc_SaturatedVapourPressureSlope + vc_PsycrometerConstant * (1.0 + (vc_SurfaceResistance / vc_AerodynamicResistance)));

    return vc_ReferenceEvapotranspiration;

  } // fc_ReferenceEvapotranspiration

  // set vc_NetPrecipitation & vc_InterceptionStorage
  function interception(vw_GrossPrecipitation) {

    var vc_InterceptionStorageOld = vc_InterceptionStorage;

    // Interception in [mm d-1];
    var vc_Interception = max(0, (2.5 * mixture.h_mx() * f_g) - vc_InterceptionStorage);

    // If no precipitation occurs, vm_Interception = 0
    if (vw_GrossPrecipitation <= 0) {
      vc_Interception = 0.0;
    }

    // Calculating net precipitation and adding to surface water
    if (vw_GrossPrecipitation <= vc_Interception) {
      vc_Interception = vw_GrossPrecipitation;
      vc_NetPrecipitation = 0.0;
    } else {
      vc_NetPrecipitation = vw_GrossPrecipitation - vc_Interception;
    }

    // add intercepted precipitation to the virtual interception water storage
    vc_InterceptionStorage = vc_InterceptionStorageOld + vc_Interception;

  } // interception


  /* 
    set 
      - E_T per species and layer
      - Ω_water per species
      - f_g

    TODO: groundwater?
  */
  function transpiration(E_T_pot) {

    var E_T_demand = []
      , E_T_demand_remaining = []
      , L_tot = mixture.L_tot()
      , θ_w = []
      , θ_fc = []
      , θ_r = []
      , θ_sat = []
      , θ = []
      , g_water = []
      ;

    /* fractional ground cover. Johnson 2013, eq. 2.23, TODO: weighted k (0.5)? */
    f_g = 1 - exp(-0.5 * L_tot);

    /* distribute E_T_pot to each species */
    for (var s = 0; s < numberOfSpecies; s++) {
      E_T_demand[s] = f_g * E_T_pot * mixture[s].L() / L_tot;
      E_T_demand_remaining[s] = E_T_demand[s];

      /* reset actual transpiration */
      for (var l = 0; l < vs_NumberOfLayers; l++)
        E_T[s][l] = 0;
    }
 
    for (var l = 0; l < vs_NumberOfLayers; l++) {
      /* [m3 m-3] to [mm m-2] */
      θ_w[l] = soilColumn[l].get_PermanentWiltingPoint() * 1e3 * vs_LayerThickness;
      θ_fc[l] = soilColumn[l].get_FieldCapacity() * 1e3 * vs_LayerThickness;
      θ_r[l] = θ_fc[l] * 0.8;
      θ_sat[l] = soilColumn[l].get_Saturation() * 1e3 * vs_LayerThickness;
      θ[l] = soilColumn[l].get_Vs_SoilMoisture_m3() * 1e3 * vs_LayerThickness;
      if (θ[l] < θ_w[l])
        g_water[l] = 0;
      else if (θ[l] < θ_r[l])
        g_water[l] = (θ[l] - θ_w[l]) / (θ_r[l] - θ_w[l]);
      else if (θ[l] < θ_fc[l])
        g_water[l] = 1;
      else /* water logging */
        g_water[l] = 1 - 0.5 * (θ[l] - θ_fc[l]) / (θ_sat[l] - θ_fc[l]);
    }

    for (var i = 0; i < 3; i++) { // run 3 times to compensate for dry layers
      for (var l = 0; l < vs_NumberOfLayers; l++) {
        for (var s = 0; s < numberOfSpecies; s++) {

          if (E_T_demand_remaining[s] <= 0 || f_r[s][l] === 0 || θ[l] <= θ_w[l])
            continue;

          /* Johnson 2013/2008, eq. 3.2. */
          var add = min(max(0, θ[l] - θ_w[l]), (f_r[s][l] / f_r_sum[s]) * g_water[l] * E_T_demand_remaining[s]);
          E_T[s][l] += add;
          θ[l] -= add; /* update soil water */
          E_T_demand_remaining[s] -= add; /* keep track of remaining E_T demand */

          if (DEBUG) {
            if (θ[l] < 0 || θ[l] > θ_sat[l])
              throw new Error('θ < 0 || θ > θ_sat');
            debug('species', s);
            debug('layer', l);
            debug('i', i);
            debug('θ[l]', θ[l]);
            debug('E_T_pot', E_T_pot);
            debug('E_T_demand[s]', E_T_demand[s]);
            debug('E_T[s][l]', E_T[s][l]);
            debug('E_T_demand_remaining', E_T_demand_remaining[s]);
            debug('g_water[l]', g_water[l]);
            debug('θ_w[l]', θ_w[l]);
            debug('θ_r[l]', θ_r[l]);
            debug('θ_fc[l]', θ_fc[l]);
            debug('θ_sat[l]', θ_sat[l]);
          }

        }
      }
    }

    /* set water growth limiting factor */
    if (waterDeficitResponseOn) {
      for (var s = 0; s < numberOfSpecies; s++) {
        /* update sum */
        E_T_sum[s] = sum(E_T[s]);
        if (E_T_sum[s] === 0)
           mixture[s].vars.Ω_water = 1; /* avoid 0 / 0 = NaN */
        else
          mixture[s].vars.Ω_water = min(1, E_T_sum[s] / E_T_demand[s]);

        if (DEBUG) {
          debug('Ω_water', mixture[s].vars.Ω_water);
        }
      
      }
    } else {
      for (var s = 0; s < numberOfSpecies; s++)
        mixture[s].vars.Ω_water = 1;
    }

  } // transpiration


  function cropYield(v, bmv) {
    return null; /* TODO: implement */
  };


  function cropFreshMatterYield(v, bmv) {
    return null; /* TODO: implement */
  };


  var get_OrganGrowthIncrement = function (i_Organ) {
    
    if (i_Organ === ROOT)
      return mixture.dW_dwt_root() * SQM_PER_HA;

    if (i_Organ === SHOOT)
      return mixture.dW_dwt_stem() * SQM_PER_HA;

    if (i_Organ === LEAF)
      return mixture.dW_dwt_leaf() * SQM_PER_HA;
    
    return 0;

  };


  var get_Transpiration = function (i_Layer) {
    var transpiration = 0;
    for (var i = 0; i < numberOfSpecies; i++) {
      transpiration += E_T[i][i_Layer];
    };
    return transpiration;
  };


  var get_OrganBiomass = function (i_Organ) {

    if (i_Organ === ROOT)
      return mixture.dwt_root() * SQM_PER_HA;

    if (i_Organ === SHOOT)
      return mixture.dwt_stem() * SQM_PER_HA;

    if (i_Organ === LEAF)
      return mixture.dwt_leaf() * SQM_PER_HA;
    
    return 0;

  };


  var get_NUptakeFromLayer = function (l) {
    var uptake = 0;
    for (var s = 0; s < numberOfSpecies; s++) {
      uptake += N_up[s][l];
    }
    return uptake;
  };


  var get_AbovegroundBiomassNContent = function () {
    return null; /* TODO: implement */
  };


  var get_PrimaryCropYield = function () {
    return null; /* TODO: implement */
  };


  var get_SecondaryCropYield = function () {
    return null; /* TODO: implement */
  };


  var get_FreshPrimaryCropYield = function () {
    return null; /* TODO: implement */
  };


  var get_FreshSecondaryCropYield = function () {
    return null; /* TODO: implement */
  };


  var get_ResidueBiomass = function (useSecondaryCropYields) {
    return null; /* TODO: implement */
  };


  var get_ResiduesNConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_PrimaryYieldNConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_ResiduesNContent = function (useSecondaryCropYields)  {
    return null; /* TODO: implement */
  };


  var get_PrimaryYieldNContent = function () {
    return null; /* TODO: implement */
  };


  var get_RawProteinConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_SecondaryYieldNContent = function () {
    return null; /* TODO: implement */
  };


  var get_PotNUptake = function () {
    return null; /* TODO: implement */
  };


  var get_AutotrophicRespiration = function () {
    return null; /* TODO: implement */
  };


  var get_OrganSpecificTotalRespired = function (organ) {
    return null; /* TODO: implement */
  };


  var get_OrganSpecificNPP = function (organ) {
    return null; /* TODO: implement */
  };


  var applyCutting = function () {
    return null; /* TODO: implement */ 
  };


  var accumulateEvapotranspiration = function (ETa) { 
    vc_accumulatedETa += ETa;
  };


  var get_RootNConcentration = function () {
    return null; /* TODO: implement */ 
  };


  var getEffectiveRootingDepth = function () {
    return mixture.d_r_mx();
  };


  var get_CropName = function () {
    return 'grassland';
  };


  var get_GrossPhotosynthesisRate = function () {
    return null; /* TODO: implement */ 
  };


  var get_GrossPhotosynthesisHaRate = function () {
    return null; /* TODO: implement */ 
  };


  var get_AssimilationRate = function () {
    return null; /* TODO: implement */ 
  };


  var get_Assimilates = function () {
    return null; /* TODO: implement */ 
  };


  var get_NetMaintenanceRespiration = function () {
    return null; /* TODO: implement */ 
  };


  var get_MaintenanceRespirationAS = function () {
    return null; /* TODO: implement */ 
  };


  var get_GrowthRespirationAS = function () {
    return null; /* TODO: implement */ 
  };


  var get_VernalisationFactor = function () {
    return 1;
  };


  var get_DaylengthFactor = function () {
    return 1;
  };


  var get_NetPhotosynthesis = function () {
    return null; /* TODO: implement */ 
  };


  var get_ReferenceEvapotranspiration = function () {
    return vc_ReferenceEvapotranspiration;
  };


  var get_RemainingEvapotranspiration = function () {
    return vc_RemainingEvapotranspiration;
  };


  var get_EvaporatedFromIntercept = function () {
    return vc_EvaporatedFromIntercept; 
  };


  var get_NetPrecipitation = function () {
    return vc_NetPrecipitation;
  };


  var get_LeafAreaIndex = function () {
    return mixture.L_tot();
  };


  var get_CropHeight = function () {
    return mixture.h_mx();
  };


  var get_RootingDepth = function () {
    return mixture.d_r_mx();
  };


  var get_SoilCoverage = function () {
    return f_g;
  };


  var get_KcFactor = function () {
    return vc_KcFactor;
  };


  var get_StomataResistance = function () {
    return null; /* TODO: implement */
  };


  var get_PotentialTranspiration = function () {
    return null; /* TODO: implement */
  };


  var get_ActualTranspiration = function () {
    return null; /* TODO: implement */
  };


  var get_TranspirationDeficit = function () {
    var dm_total = mixture.dwt_root() + mixture.dwt_stem() + mixture.dwt_leaf();
    var stress = 0;
    for (var i = 0; i < numberOfSpecies; i++)
      stress += mixture[i].vars.Ω_water * (mixture[i].dwt_root() + mixture[i].dwt_stem() + mixture[i].dwt_leaf()) / dm_total;
    /* TODO: normalize (0-1) */
    return stress;
  };


  var get_OxygenDeficit = function () {
    return null; /* TODO: implement */
  };


  var get_CropNRedux = function () {
    if (numberOfSpecies === 1)
      return mixture[0].vars.Ω_N;
    var dm_total = mixture.dwt_root() + mixture.dwt_stem() + mixture.dwt_leaf();
    var stress = 0;
    for (var i = 0; i < numberOfSpecies; i++)
      stress += mixture[i].vars.Ω_N * (mixture[i].dwt_root() + mixture[i].dwt_stem() + mixture[i].dwt_leaf()) / dm_total;
    /* TODO: normalize (0-1) */
    return stress;
  };


  var get_HeatStressRedux = function () {
    return null; /* TODO: implement */
  };


  var get_CurrentTemperatureSum = function () {
    return null; /* TODO: implement */
  };


  var get_DevelopmentalStage = function () {
    return 1; /* TODO: implement */
  };


  var get_RelativeTotalDevelopment = function () {
    return null; /* TODO: implement */
  };


  var get_AbovegroundBiomass = function () {
    return mixture.dwt_shoot();
  };


  var get_TotalBiomassNContent = function () {
    return null; /* TODO: implement */
  };


  var get_TargetNConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_CriticalNConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_AbovegroundBiomassNConcentration = function () {
    return null; /* TODO: implement */
  };


  var get_HeatSumIrrigationStart = function () {
    return null; /* TODO: implement */
  };


  var get_HeatSumIrrigationEnd = function () {
    return null; /* TODO: implement */
  };


  var get_SumTotalNUptake = function () {
    return null; /* TODO: implement */
  };


  var get_ActNUptake = function () {

    var actNUptake = 0;
    for (var s = 0; s < numberOfSpecies; s++) {
      for (var l = 0; l < vs_NumberOfLayers; l++)
        actNUptake += N_up[s][l];
    }
    return actNUptake * SQM_PER_HA;
    
  };


  var get_GrossPrimaryProduction = function () {
    return null; /* TODO: implement */
  };


  var get_NetPrimaryProduction = function () {
    return null; /* TODO: implement */
  };


  var get_AccumulatedETa = function () {
    return null; /* TODO: implement */
  };


  var get_isDying = function () {
    return false;
  };


  var get_NumberOfOrgans = function () { 
    return 3; 
  };


  var get_totalBiomass = function () { 
    return mixture.dwt_shoot() + mixture.dwt_root(); 
  };

  // new interface

  var get_numberOfSpecies = function () {
    return numberOfSpecies;
  };

  /* [kg (C) ha-1] */
  var get_P_g = function () {
    var P_g = 0;
    for (var i = 0; i < numberOfSpecies; i++)
      P_g += mixture[i].vars.P_g_day;
    return P_g * SQM_PER_HA;
  };

  /* [kg (C) ha-1] */
  var get_R_m = function () {
    var R_m = 0;
    for (var i = 0; i < numberOfSpecies; i++)
      R_m += mixture[i].vars.R_m;
    return R_m * SQM_PER_HA;
  };

  /* [kg (dwt) ha-1] */
  var get_dwt_dead_shoot = function () {
    return mixture.dwt_dead_shoot() * SQM_PER_HA;
  };

  /* [kg (N) kg-1 (C)] */
  var get_f_N_live_leaf = function () {
    return mixture.f_N_live_leaf();
  };

  /* [kg (N) kg-1 (OM)] */
  var f_N_live_leaf_dwt = function () {
    return mixture.f_N_live_leaf_dwt();
  };

  /* [kg (N) kg-1 (OM)] */
  var f_N_live_stem_dwt = function () {
    return mixture.f_N_live_stem_dwt();
  };

  /* [kg (N) kg-1 (OM)] */
  var f_N_root_dwt = function () {
    return mixture.f_N_root_dwt();
  };

  /* 
    array   [kg [OM] ha-1] 
  */
  var removal_dwt = function (residual) {

    var dm = [];
    // default residual 0.1 [kg dwt ha-1] ~ 1 [t ha-1]
    var dwt_shoot_residual = residual || 0.1;
    var dwt_shoot = mixture.dwt_shoot();
    for (var s = 0; s < numberOfSpecies; s++) {
      if (dwt_shoot <= dwt_shoot_residual) {
        dm[s] = 0;
      } else {

        var species = mixture[s]
          , vars = species.vars
          , SC = vars.SC
          , NC = vars.NC
          , PN = vars.PN
          , f_keep = 1 - (dwt_shoot - dwt_shoot_residual) / dwt_shoot
          ;

        dm[s] = SQM_PER_HA * (
          species.dwt_leaf() * (1 - f_keep) +
          species.dwt_stem() * (1 - f_keep)
        );

        // update pools
        SC.live_l_1 *= f_keep;
        SC.live_l_2 *= f_keep; 
        SC.live_l_3 *= f_keep; 
        SC.dead_l   *= f_keep;   
        SC.live_s_1 *= f_keep; 
        SC.live_s_2 *= f_keep; 
        SC.live_s_3 *= f_keep; 
        SC.dead_s   *= f_keep;
        // TODO: add dead PN&NC pools
        NC.l *= f_keep;
        NC.s *= f_keep;
        PN.l *= f_keep;
        PN.s *= f_keep;

      }

    }

    // cut by height does not work very well with current height(LAI) implementation
    // for (var s = 0; s < numberOfSpecies; s++) {
    //   var species = mixture[s];
    //   var vars = species.vars;
    //   var SC = vars.SC;
    //   var NC = vars.NC;
    //   var PN = vars.PN;
    //   var h = species.h();
    //   /* we keep a minimum of 1 % if height = 0 */
    //   var f_keep = 1 - ((h === 0) ? 0.01 : max(0.01, (h - height) / h));
    //   var leaf_dwt = species.dwt_leaf() * (1 - f_keep); 
    //   var stem_dwt = species.dwt_stem() * (1 - f_keep);
    //   // update pools
    //   vars.SC.live_l_1 *= f_keep;
    //   vars.SC.live_l_2 *= f_keep; 
    //   vars.SC.live_l_3 *= f_keep; 
    //   vars.SC.dead_l   *= f_keep;   
    //   vars.SC.live_s_1 *= f_keep; 
    //   vars.SC.live_s_2 *= f_keep; 
    //   vars.SC.live_s_3 *= f_keep; 
    //   vars.SC.dead_s   *= f_keep;
    //   // TODO: add dead PN&NC pools
    //   vars.NC.l *= f_keep;
    //   vars.NC.s *= f_keep;
    //   vars.PN.l *= f_keep;
    //   vars.PN.s *= f_keep;

    //   dm[s] = (leaf_dwt + stem_dwt) * SQM_PER_HA; 
      
    //   if (DEBUG) {
    //     debug('f_keep', f_keep);
    //     debug('leaf_dwt', leaf_dwt);
    //     debug('stem_dwt', stem_dwt);
    //   }
    // }

    return dm;

  };

  /* [m] */
  var height = function () {
    return mixture.h_mx();
  };

  /* [m2 m-2] */
  var LAI = function () {
    return mixture.L_tot();
  };

  /* [%] */
  var δ_shoot = function () {
    if (numberOfSpecies === 1)
      return mixture[0].δ_shoot();

    return 0;
  };

  /* [0-1] */
  var Ω_water = function () {
    if (numberOfSpecies === 1)
      return mixture[0].vars.Ω_water;
    var dm_total = mixture.dwt_root() + mixture.dwt_stem() + mixture.dwt_leaf();
    var stress = 0;
    for (var i = 0; i < numberOfSpecies; i++)
      stress += mixture[i].vars.Ω_water * (mixture[i].dwt_root() + mixture[i].dwt_stem() + mixture[i].dwt_leaf()) / dm_total;
    /* TODO: normalize (0-1) */
    return stress;
  };


  /* array, per soil layer [AOM_Properties] TODO: implement in generic crop as well */
  var senescencedRoot = function () {

    var AOM = [];

    for (var l = 0; l < vs_NumberOfOrganicLayers; l++) {

      var aom = Object.create(AOM_Properties);
      var N = 0;
      
      for (var s = 0; s < numberOfSpecies; s++) {

        var Λ_r = mixture[s].vars.Λ_r;

        /* because of maxMineralizationDepth vs_NumberOfOrganicLayers might be < vs_NumberOfLayers ->
           multiply by (vs_NumberOfLayers / vs_NumberOfOrganicLayers).  TODO: check */
        aom.vo_AOM_Slow += (Λ_r.sc + Λ_r.nc + Λ_r.pn) * f_r[s][l] / f_r_sum[s] / vs_LayerThickness * (vs_NumberOfLayers / vs_NumberOfOrganicLayers);
        N += Λ_r.pn / fC_pn * fN_pn  / vs_LayerThickness * (vs_NumberOfLayers / vs_NumberOfOrganicLayers);

      }

      aom.vo_CN_Ratio_AOM_Slow = (N === 0) ? 200 : aom.vo_AOM_Slow / N;
      /* check for null AOM in soilOrganic */
      AOM[l] = aom;
    }

    // reset Λ_r
    for (var s = 0; s < numberOfSpecies; s++) {
      var Λ_r = mixture[s].vars.Λ_r;
      Λ_r.sc = Λ_r.nc = Λ_r.pn = 0;
    }

    debug('AOM', AOM);

    return AOM;

  };


  return {
      step: step
    , get_P_g: get_P_g
    , get_R_m: get_R_m
    , get_dwt_dead_shoot: get_dwt_dead_shoot
    , get_f_N_live_leaf: get_f_N_live_leaf
    , f_N_live_leaf_dwt: f_N_live_leaf_dwt
    , f_N_live_stem_dwt: f_N_live_stem_dwt
    , f_N_root_dwt: f_N_root_dwt
    , removal_dwt: removal_dwt
    , height: height
    , LAI: LAI
    , δ_shoot: δ_shoot
    , Ω_water: Ω_water
    , senescencedRoot: senescencedRoot
    , accumulateEvapotranspiration: accumulateEvapotranspiration
    , isDying: get_isDying
    , totalBiomass: get_totalBiomass
    , getEffectiveRootingDepth: getEffectiveRootingDepth
    , get_AbovegroundBiomass: get_AbovegroundBiomass
    , get_AbovegroundBiomassNConcentration: get_AbovegroundBiomassNConcentration
    , get_AbovegroundBiomassNContent: get_AbovegroundBiomassNContent
    , get_AccumulatedETa: get_AccumulatedETa
    , get_ActNUptake: get_ActNUptake
    , get_ActualTranspiration: get_ActualTranspiration
    , get_Assimilates: get_Assimilates
    , get_AssimilationRate: get_AssimilationRate
    , get_AutotrophicRespiration: get_AutotrophicRespiration
    , get_CriticalNConcentration: get_CriticalNConcentration
    , get_CropHeight: get_CropHeight
    , get_CropNRedux: get_CropNRedux
    , get_CropName: get_CropName
    , get_CurrentTemperatureSum: get_CurrentTemperatureSum
    , get_DaylengthFactor: get_DaylengthFactor
    , get_DevelopmentalStage: get_DevelopmentalStage
    , get_EvaporatedFromIntercept: get_EvaporatedFromIntercept
    , get_FreshPrimaryCropYield: get_FreshPrimaryCropYield
    , get_FreshSecondaryCropYield: get_FreshSecondaryCropYield
    , get_GrossPhotosynthesisHaRate: get_GrossPhotosynthesisHaRate
    , get_GrossPhotosynthesisRate: get_GrossPhotosynthesisRate
    , get_GrossPrimaryProduction: get_GrossPrimaryProduction
    , get_GrowthRespirationAS: get_GrowthRespirationAS
    , get_HeatStressRedux: get_HeatStressRedux
    , get_HeatSumIrrigationEnd: get_HeatSumIrrigationEnd
    , get_HeatSumIrrigationStart: get_HeatSumIrrigationStart
    , get_KcFactor: get_KcFactor
    , get_LeafAreaIndex: get_LeafAreaIndex
    , get_MaintenanceRespirationAS: get_MaintenanceRespirationAS
    , get_NUptakeFromLayer: get_NUptakeFromLayer
    , get_NetMaintenanceRespiration: get_NetMaintenanceRespiration
    , get_NetPhotosynthesis: get_NetPhotosynthesis
    , get_NetPrecipitation: get_NetPrecipitation
    , get_NetPrimaryProduction: get_NetPrimaryProduction
    , get_NumberOfOrgans: get_NumberOfOrgans
    , get_OrganBiomass: get_OrganBiomass
    , get_OrganGrowthIncrement: get_OrganGrowthIncrement
    , get_OrganSpecificNPP: get_OrganSpecificNPP
    , get_OrganSpecificTotalRespired: get_OrganSpecificTotalRespired
    , get_OxygenDeficit: get_OxygenDeficit
    , get_PotNUptake: get_PotNUptake
    , get_PotentialTranspiration: get_PotentialTranspiration
    , get_PrimaryCropYield: get_PrimaryCropYield
    , get_PrimaryYieldNConcentration: get_PrimaryYieldNConcentration
    , get_PrimaryYieldNContent: get_PrimaryYieldNContent
    , get_RawProteinConcentration: get_RawProteinConcentration
    , get_ReferenceEvapotranspiration: get_ReferenceEvapotranspiration
    , get_RelativeTotalDevelopment: get_RelativeTotalDevelopment
    , get_RemainingEvapotranspiration: get_RemainingEvapotranspiration
    , get_ResidueBiomass: get_ResidueBiomass
    , get_ResiduesNConcentration: get_ResiduesNConcentration
    , get_ResiduesNContent: get_ResiduesNContent
    , get_RootNConcentration: get_RootNConcentration
    , get_RootingDepth: get_RootingDepth
    , get_SecondaryCropYield: get_SecondaryCropYield
    , get_SecondaryYieldNContent: get_SecondaryYieldNContent
    , get_SoilCoverage: get_SoilCoverage
    , get_StomataResistance: get_StomataResistance
    , get_SumTotalNUptake: get_SumTotalNUptake
    , get_TargetNConcentration: get_TargetNConcentration
    , get_TotalBiomassNContent: get_TotalBiomassNContent
    , get_Transpiration: get_Transpiration
    , get_TranspirationDeficit: get_TranspirationDeficit
    , get_VernalisationFactor: get_VernalisationFactor
    , get_numberOfSpecies: get_numberOfSpecies
  };

};
