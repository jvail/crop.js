/*
  mixture of grassland species and growth

  REFERENCES
  
  Johnson IR (2005 & 2008). Biophysical modelling. IMJ Consultants, Dorrigo, NSW, Australia. 

  Johnson IR (2013). DairyMod and the SGS Pasture Model: a mathematical description of the biophysical
  model structure. IMJ Consultants, Dorrigo, NSW, Australia.

  Thornley JHM & Johnson IR (2000). Plant and crop modelling.

  Topp (2004). Modelling the comparative productivity and profitability of grass and 
  legume systems of silage production in northern Europe

  AgPasture (2013)

  Van Niekerk (1967)

  LICENSE
  
  Copyright 2014 Jan Vaillant <jan.vaillant@zalf.de>

  Distributed under the GPL License version 3. See accompanying file LICENSE or copy at http://opensource.org/licenses/GPL-3.0

*/

var grassland = {};

(function () { // prevent poluting global scope

/* math */
var pow = Math.pow
  , sqrt = Math.sqrt
  , exp = Math.exp
  , min = Math.min
  , max = Math.max
  , abs = Math.abs
  , round = Math.round
  , floor = Math.floor
  ;

/* C_amb [μmol (CO2) mol-1]  ambient CO2 concentration */
var C_amb = C = 380 // TODO: move somewhere else

/* Y growth efficiencies. Thornley JHM & Johnson IR (2000), p. 351f */
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

/* carbon fractions */
var fC_cellulose =     0.44
  , fC_hemicellulose = 0.40
  , fC_starch =        0.44
  , fC_sucrose =       0.42
  , fC_protein =       0.53
  , fC_lignin =        0.67
  , fC_lipids =        0.77
  , fC_ash =           0.00
  ;

/* carbon fraction carbon hydrate pools */
var fC_sc = 0.6 * fC_cellulose + 0.2 * fC_hemicellulose + 0.2 * fC_lignin
  , fC_nc = 0.7 * fC_starch + 0.3 * fC_sucrose
  , fC_ld = fC_lipids
  , fC_pn = fC_protein
  ;

/* nitrogen fraction in protein */
var fN_pn = 0.16; 


/* species object to store species specific parameters for a mixture */
grassland.Species = function (cfg) {

  var that = this;

  /* defaults */
  this.isLegume = false;
  this.isC4 = false;
  this.type = 'pasture grass';

  /* 
    constants; defaults for rye grass 

    h_m           [m]                         maximum height
    L_half        [m2 (leaf) m-2 (ground)]    leaf area at half h_mx
    σ             [m2 (leaf) kg-1 (d.wt)]     specific leaf area
    N_ref         [kg (N) kg-1 (d.wt)]        reference (optimum) N concentration
    d_r_h         [m]                         depth at 50% root mass
    d_r_mx        [m]                         maximum root depth

    photosynthesis
    T_ref         [°C]                        reference temperature 
    T_mn          [°C]                        minimum temperature 
    T_opt_Pm_amb  [°C]                        optimum temperature
    ξ             [-]                         non‐rectangular hyperbola curvatur parameter
    α_amb_15      [mol (CO2) mol-1 (photons)] photosythetic efficiency α at ambient CO2 (C_amb) and 15 °C
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
    , d_r_h: 0.25
    , d_r_mx: 1.0
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
        , f_C_m: this.isC4 ? 1.1 : 1.5
        , γ_Pm: 10
        , λ_α: 0.02 
        , γ_α: 6
      }
    , part: {
          ρ_shoot_ref: 0.8  // TODO: source?
        , ρ_l: 0.7 // TODO: source?
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
    , N_leaf: { // TODO: remove?
      opt: 0.100,    //[kg (N) kg-1 (C)] AgPasture: 0.04 / 0.4 (NcleafOpt as fraction / C in DM as fraction)
      max: 0.125,    //[kg (N) kg-1 (C)] AgPasture: 0.05 / 0.4 (NcleafOpt as fraction / C in DM as fraction)
      min: 0.030,    //[kg (N) kg-1 (C)] AgPasture: 0.012 / 0.4 (NcleafOpt as fraction / C in DM as fraction)
      ref: 0.100    //[kg (N) kg-1 (C)] TODO: source?
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
    , G: 0.0
    , Y: 0.75
    , Y_leaf: 0.75
    , Y_stem: 0.75
    , Y_root: 0.75
    , d_r: 1.0
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
      /* non-structural carbon hydrate pool kg (C) m-2 */
    , NC: { l: 0.0, s: 0.0, r: 0.0 }
      /* daily non-structural carbon hydrate growth pool kg (C) m-2 */
    , dNC: { l: 0.0, s: 0.0, r: 0.0 }
      /* protein pool kg (C) m-2 */
    , PN: { l: 0.0, s: 0.0, r: 0.0 }
      /* daily protein growth pool kg (C) m-2 */
    , dPN: { l: 0.0, s: 0.0, r: 0.0 }
      /* total litter; from senecenced leaf and stem */
    , Λ_litter: { sc: 0.0, pn: 0.0 }
      /* total senecenced root */ 
    , Λ_r: { sc: 0, pn: 0 }
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
      this.cons.photo.f_C_m = 1.5;
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
      this.cons.N_leaf.opt = 0.100;
      this.cons.N_leaf.max = 0.125;
      this.cons.N_leaf.min = 0.030;
      this.cons.N_leaf.ref = 0.100;

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
      this.cons.photo.f_C_m = 1.5;
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
      this.cons.N_leaf.opt = 0.100;
      this.cons.N_leaf.max = 0.125;
      this.cons.N_leaf.min = 0.030;
      this.cons.N_leaf.ref = 0.100;

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
      this.cons.photo.f_C_m = 1.5;
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
      this.cons.N_leaf.opt = 0.100;
      this.cons.N_leaf.max = 0.125;
      this.cons.N_leaf.min = 0.030;
      this.cons.N_leaf.ref = 0.100;

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
      this.cons.photo.f_C_m = 1.5;
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
      this.cons.N_leaf.opt = 0.100;
      this.cons.N_leaf.max = 0.125;
      this.cons.N_leaf.min = 0.030;
      this.cons.N_leaf.ref = 0.100;

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
      this.cons.photo.f_C_m = 1.5;
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
      this.cons.N_leaf.opt = 0.100;
      this.cons.N_leaf.max = 0.125;
      this.cons.N_leaf.min = 0.030;
      this.cons.N_leaf.ref = 0.100;

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


  /* C_root [kg (N) m-2] root C */
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
      NC.l / fC_nc + 
      PN.l / fC_pn
    );  

  };


  this.dwt_dead_leaf = function () {

    return that.vars.SC.dead_l / fC_sc; 

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

    return that.vars.SC.dead_s / fC_sc; 

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


  /* (3.83) L [m2 (leaf) m-2 (ground) leaf area (C02 dependence not included (3.84)) */
  this.L = function () {

    return that.cons.σ * that.dwt_live_leaf();

  };


  /* (3.101) h [m] height relationship between canopy height and leaf area */
  this.h = function (L_tot) {

    var h = 0
      , cons = that.cons
      , L = L_tot // scale to m2; assume same total dwt per m2 TODO: assumtion?
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


  /* optimum N requirement [kg (N) m-2] */
  this.N_req_opt = function () {

    return max(0, (that.f_N_ref * (that.C_live_shoot() + that.C_root())) - (that.N_live_shoot() + that.N_root()));

  };


  /*(3.49) Y_leaf [-] growth respiration new leaf tissue (expressed as growth efficiency) 
    N_avail_leaf [kg (N) m-2] nitrogen available from uptake and fixation
    P_avail_leaf [kg (C) m-2] carbon available for growth TODO: wight by d.wt or caron share?*/
  this.Y_leaf = function (N_avail_leaf, C_avail_leaf) {

    /* initialize with reference composition */
    var dW_l_fdwt_ref = that.cons.dW_l_fdwt_ref;
    var dW_l_fdwt = {
       sc: dW_l_fdwt_ref.sc
      ,nc: dW_l_fdwt_ref.nc
      ,pn: dW_l_fdwt_ref.pn
      ,ah: dW_l_fdwt_ref.ah
    };

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
    
    if (C.toFixed(4) != (C_sc + C_nc + C_pn).toFixed(4)) {
      console.log(C);
      console.log(C_sc);
      console.log(C_nc);
      console.log(C_pn);
      console.log(C_sc + C_nc + C_pn);
      throw 'leaf (C != C_sc + C_nc + C_pn)';
    }

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

    // console.log('Y_leaf: '+Y_leaf);

    return Y_leaf; 

  };


  /*(3.49) Y_stem [-] growth respiration new leaf tissue (expressed as growth efficiency) 
    N_avail [kg m-2] nitrogen available from uptake and fixation*/
  this.Y_stem = function (N_avail_stem, C_avail_stem) {

    /* initialize with reference composition */
    var dW_s_fdwt_ref = that.cons.dW_s_fdwt_ref;
    var dW_s_fdwt = {
       sc: dW_s_fdwt_ref.sc
      ,nc: dW_s_fdwt_ref.nc
      ,pn: dW_s_fdwt_ref.pn
      ,ah: dW_s_fdwt_ref.ah
    };

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
    
    if (C.toFixed(4) != (C_sc + C_nc + C_pn).toFixed(4)) {
      console.log(C);
      console.log(C_sc);
      console.log(C_nc);
      console.log(C_pn);
      console.log(C_sc + C_nc + C_pn);
      throw 'stem (C != C_sc + C_nc + C_pn)';
    }

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

    // console.log('Y_stem: '+Y_stem);

    return Y_stem; 

  };


    /*(3.49) Y_root [-] growth respiration new leaf tissue (expressed as growth efficiency) 
    N_avail [kg m-2] nitrogen available from uptake and fixation*/
  this.Y_root = function (N_avail_root, C_avail_root) {

    /* initialize with reference composition */
    var dW_r_fdwt_ref = that.cons.dW_r_fdwt_ref;
    var dW_r_fdwt = {
       sc: dW_r_fdwt_ref.sc
      ,nc: dW_r_fdwt_ref.nc
      ,pn: dW_r_fdwt_ref.pn
      ,ah: dW_r_fdwt_ref.ah
    };

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
    
    if (C.toFixed(4) != (C_sc + C_nc + C_pn).toFixed(4)) {
      console.log(C);
      console.log(C_sc);
      console.log(C_nc);
      console.log(C_pn);
      console.log(C_sc + C_nc + C_pn);
      throw 'root (C != C_sc + C_nc + C_pn)';
    }

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

    // console.log('Y_root: '+Y_root);

    return Y_root; 

  };



};

/*
  growth function

  returns constructor function
*/

grassland.Growth = (function () {

  /* 
    Mixture (array of species)
    Takes a single species config object or an array of species 
    and returns the array with various functions attached 

    dm array [-] fraction of species dry matter share 

  */
  var Mixture = function (species, cfg) {

    /* pass array of species or single species */
    var mixture = Array.isArray(species) ? species : [species];

    /* store root share of each species in each layer in mixture objects in order to calculate N and water uptake */
    mixture.root_sh = new Array(species.length);

    var noPools = 8
      , DM_root = 3000 * 1e-4 // kg ha-1 to kg m-2
      , DM_shoot = 500 * 1e-4 // kg ha-1 to kg m-2
      , DM = []
      ;
  
    if (cfg && cfg.DM) {
      DM = cfg.DM;
    } else {
      for (var p = 0, ps = species.length; p < ps; p++)
        DM[p] = 1 / ps;
    }

    /*Vergleich der Biomasseproduktion bei Schnittnutzung und Kurzrasenweide
      unter biologischen Bedingungen im ostalpinen Raum*/;
    if (cfg && cfg.DM_shoot) 
      DM_shoot = cfg.DM_shoot * 1e-4 // kg ha-1 to kg m-2
    if (cfg && cfg.DM_root) 
      DM_root = 3000 * 1e-4 // kg ha-1 to kg m-2


    // iterate over species and initialize pools
    for (var p = 0, ps = species.length; p < ps; p++) {

      /* initialize array to store share in each soil layer */
      mixture.root_sh[p] = [];

      var species = mixture[p] 
        , SC = species.vars.SC
        , NC = species.vars.NC
        , PN = species.vars.PN
        ;
        
      /* initialize carbon pools */

      /* leaf */
      SC.live_l_1 = (DM_shoot * DM[p] / noPools) * 0.50 * fC_sc;
      NC.l += (DM_shoot * DM[p] / noPools) * 0.25 * fC_nc;
      PN.l += (DM_shoot * DM[p] / noPools) * 0.25 * fC_nc;

      SC.live_l_2 = (DM_shoot * DM[p] / noPools) * 0.60 * fC_sc;
      NC.l += (DM_shoot * DM[p] / noPools) * 0.20 * fC_nc; 
      PN.l += (DM_shoot * DM[p] / noPools) * 0.20 * fC_pn;
      
      SC.live_l_3 = (DM_shoot * DM[p] / noPools) * 0.70 * fC_sc;
      NC.l += (DM_shoot * DM[p] / noPools) * 0.15 * fC_nc; 
      PN.l += (DM_shoot * DM[p] / noPools) * 0.15 * fC_pn;
      
      SC.dead_l = (DM_shoot * DM[p] / noPools) * 1.00 * fC_sc;
      NC.l += (DM_shoot * DM[p] / noPools) * 0.00 * fC_sc;
      PN.l += (DM_shoot * DM[p] / noPools) * 0.00 * fC_sc;

      /* stem */
      SC.live_s_1 = (DM_shoot * DM[p] / noPools) * 0.70 * fC_sc;
      NC.s += (DM_shoot * DM[p] / noPools) * 0.15 * fC_nc;
      PN.s += (DM_shoot * DM[p] / noPools) * 0.15 * fC_nc;

      SC.live_s_2 = (DM_shoot * DM[p] / noPools) * 0.80 * fC_sc;
      NC.s += (DM_shoot * DM[p] / noPools) * 0.10 * fC_nc; 
      PN.s += (DM_shoot * DM[p] / noPools) * 0.10 * fC_pn;
      
      SC.live_s_3 = (DM_shoot * DM[p] / noPools) * 0.90 * fC_sc;
      NC.s += (DM_shoot * DM[p] / noPools) * 0.05 * fC_nc; 
      PN.s += (DM_shoot * DM[p] / noPools) * 0.05 * fC_pn;
      
      SC.dead_s = (DM_shoot * DM[p] / noPools) * 1.00 * fC_sc;
      NC.s += (DM_shoot * DM[p] / noPools) * 0.00 * fC_sc;
      PN.s += (DM_shoot * DM[p] / noPools) * 0.00 * fC_sc;

      SC.r = DM_root * DM[p] * 0.80 * fC_sc;
      NC.r += DM_root * DM[p] * 0.10 * fC_sc;
      PN.r += DM_root * DM[p] * 0.10 * fC_sc;

      console.log({ SC: SC, NC: NC, PN: PN });
    }


    mixture.N_req_opt = function () {

      var N_req_opt = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        N_req_opt += this[p].N_req_opt();

      return N_req_opt;     

    };


    mixture.dwt_dead_shoot = function () {

      var dwt_dead_shoot = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dwt_dead_shoot += this[p].dwt_dead_leaf() + this[p].dwt_dead_stem();

      return dwt_dead_shoot;

    };


    mixture.dwt_live_shoot = function () {

      var dwt_live_shoot = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dwt_live_shoot += this[p].dwt_live_leaf() + this[p].dwt_live_stem()

      return dwt_live_shoot;

    };
    

    mixture.dwt_shoot = function () {

      var dwt_shoot = 0;

      for (var p = 0, ps = this.length; p < ps; p++) {
        dwt_shoot += (
          this[p].dwt_live_leaf() + this[p].dwt_dead_leaf() +
          this[p].dwt_live_stem() + this[p].dwt_dead_stem()
        );
      }

      return dwt_shoot;

    };


    /* total leaf d.wt [kg m-2] */
    mixture.dwt_leaf = function () {

      var dwt_leaf = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dwt_leaf += this[p].dwt_leaf()

      return dwt_leaf;

    };


    /* total stem d.wt [kg m-2] */
    mixture.dwt_stem = function () {

      var dwt_stem = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dwt_stem += this[p].dwt_stem()

      return dwt_stem;

    };


    /* total root d.wt [kg m-2] */
    mixture.dwt_root = function () {

      var dwt_root = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        dwt_root += this[p].dwt_root()

      return dwt_root;

    };


    /* total leaf area */
    mixture.L_tot = function () {

      var L_tot = 0;

      for (var p = 0, ps = this.length; p < ps; p++)
        L_tot += this[p].L();

      return L_tot;

    };


    /* height of tallest species in mixture */
    mixture.h_mx = function () {

      var h_mx = 0 
        , h = 0
        , L_tot = this.L_tot()
        ;

      for (var p = 0, ps = this.length; p < ps; p++) {
        h = this[p].h(L_tot);
        h_mx = (h > h_mx) ? h : h_mx;
      }

      return h_mx;

    };

    
    /* depth of deepest rooting species in mixture */
    mixture.d_mx = function () {

      var d_mx = 0 
        , d = 0
        ;

      for (var p = 0, ps = this.length; p < ps; p++) {
        d = this[p].cons.d_r_mx;
        d_mx = (d > d_mx) ? d : d_mx;
      }

      return d_mx;

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
        ;
      
      for (var p = 0, ps = this.length; p < ps; p++) {
        n_start_p[p] = 1 + round((1 - this[p].h(L_tot) / this.h_mx()) * n_L); 
      }
      
      return n_start_p;

    };


    /* (3.108) LAI increment for each species */
    mixture.δL_p = function (n_start_p, n_L) {
      
      var δL_p = [];

      for (var p = 0, ps = this.length; p < ps; p++)
        δL_p[p] = this[p].L() / (n_L - (n_start_p[p] - 1));

      return δL_p;

    };

    /* (3.113) total LAI in layer i */
    mixture.δL_i = function (n_start_p, n_L, δL_p) {
      
      var δL_i = []
        , ΣδL = 0
        ;

      for (var i = 0; i < n_L; i++) {
        ΣδL = 0;
        for (var p = 0, ps = this.length; p < ps; p++) {
          /* (3.110) 'i <=' error in SGS documentation? */
          if ((i + 1) >= n_start_p[p]) // first layer is i = 1
            ΣδL += δL_p[p];
        }
        δL_i[i] = ΣδL;
      }

      return δL_i;

    };


    /* (3.109) 'effective' light extinction coefficient for each LAI layer i*/
    mixture.k_e_i = function () {
      
      var k_e_i = []
        , n_L = this.n_L()
        , n_start_p = this.n_start_p(n_L)
        , δL_p = this.δL_p(n_start_p, n_L)
        , ΣkδL = 0
        , ΣδL = 0
        ;
      
      for (var i = 0; i < n_L; i++) {
        ΣkδL = ΣδL = 0;
        for (var p = 0, ps = this.length; p < ps; p++) {
          /* (3.110) 'i <=' error in SGS documentation? */
          if ((i + 1) >= n_start_p[p]) { // first layer is i = 1
            ΣkδL += this[p].cons.photo.k * δL_p[p];
            ΣδL += δL_p[p];
          }
        }
        k_e_i[i] = ΣkδL / ΣδL;
      }
      
      return k_e_i;
    
    };

    return mixture;

  };  

  var mixture = null;

  /*
    T           [C°]            mean daily temperature
    T_mn        [C°]            minimum daily temperature
    T_mx        [C°]            maximum daily temperature
    PPF         [μmol m-2 d-1]  photosynthetic photon flux
    τ           [s]             daylength
    f_s         [-]             fraction direct solar radiation
    N_up        [kg m-2]        array, available N for uptake in each soil layer
    E_T         [mm]            array; actual transpiration in each soil layer 
    E_T_demand  [mm]            potential transpiration for mixture
  */

  var step = function (T, T_mn, T_mx, PPF, τ, f_s, N_up, ET, E_T_demand) {

    grossPhotosynthesis(T, T_mn, T_mx, PPF, τ, C /* ambient CO2 */, f_s);

    /* calculate N and water availability and N and water stress for each species */
    var N_up_p = [];
    var N_fix_p = [];
    var dwt_live_shoot = mixture.dwt_live_shoot();

    for (var p = 0, ps = mixture.length; p < ps; p++) {

      var species = mixture[p];

      var dwt_live_shoot_sh = (species.dwt_live_stem() + species.dwt_live_leaf())  / dwt_live_shoot;
      var act_transpiration_p = 0;
      /* allocate potential transpiration according to d.wt share of shoot */
      var pot_transpiration_p = dwt_live_shoot_sh * E_T_demand;

      N_up_p[p] = 0;
      N_fix_p[p] = 0;

      for (var l = 0, ls = min(N_up.length, E_T.length); l < ls; l++) {

        /* allocate N and water according to d.wt share of root in each soil layer */
        act_transpiration_p += mixture.root_sh[p][l] * E_T[l];
        N_up_p[p] += mixture.root_sh[p][l] * N_up[l];

      }

      /* N fixation (3.70) Johnson (2013) */
      var N_req_opt = species.N_req_opt();
      N_fix_p[p] = species.isLegume ? max(0, N_req_opt - N_up_p[p]) : 0;

      /* water and N growth limiting functions */
      species.Ω_water = min(1, act_transpiration_p / pot_transpiration_p);
      species.Ω_N = (species.isLegume || N_req_opt == 0) ? 0 : min(1, N_up_p[p] / N_req_opt);


    }
    
    netPhotosynthesis(T, N_up_p, N_fix_p);
    
    partitioning(T);

  };

  /*
    Daily canopy gross photosynthesis in response to irradiance
    
    P_g_day       [kg (C) m-2 d-1]  gross photosynthesis

    T             [C°]              mean daily temperature
    T_mn          [C°]              minimum daily temperature
    T_mx          [C°]              maximum daily temperature
    PPF           [μmol m-2 d-1]    photosynthetic photon flux
    τ             [s]               daylength
    C             [μmol mol-1]      CO2 concentration (not C_amb!)
    f_s           [-]               fraction direct solar radiation

    TODO: 
      - influence of temp. extremes on photosynthesis (3.58 ff)
  */  

  var grossPhotosynthesis = function (T, T_mn, T_mx, PPF, τ, C, f_s) {

    console.log('grossPhotosynthesis');

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

    var P_g_mx = P_g(I_mx, T_I_mx, f_s); // array
    var P_g_mn = P_g(I_mn, T_I_mn, f_s); // array

    /* iterate over mixture array */
    for (var p = 0, ps = mixture.length; p < ps; p++) {

      var vars = mixture[p].vars
        , Ω_water = vars.Ω_water
        ;

      /* (3.37) conversion of μmol CO2 to mol (1e-6) and mol C02 to kg C (0.012) Ω_water missing in Johnson (2013) */
      vars.P_g_day = 0.012 * 1e-6 * (τ / 2) * (P_g_mx[p] + P_g_mn[p]) * Ω_water;

    } 


    /*
      (2.21) Direct solar radiation

      I_s_l [μmol (photons) m-2 s-1]  :direct (including diffuse) solar radiation within the canopy
      I_0   [μmol (photons) m-2 s-1]  :incident solar radiation on the canopy
      k_e_i [-]                       :effective leaf extinction coefficient at leaf area layer i 
      k     [-]                       :leaf extinction coefficient 
      fs    [-]                       :fraction direct solar radiation
    */
    
    function I_s_l(l, I_0, k_e_i, k) {
      
      var I_s_l = 0
        , fs = fs || 0.7
        ; 
        
      I_s_l =  k * I_0 * (f_s + (1 - f_s) * exp(-k_e_i * l));

      return I_s_l;

    };
    

    /*
      (2.21) Diffuse solar radiation

      I_d_l [μmol (photons) m-2 s-1]  :diffuse solar radiation within the canopy
      I_0   [μmol (photons) m-2 s-1]  :incident solar radiation on the canopy
      k_e_i [-]                       :effective leaf extinction coefficient at leaf area layer i 
      k     [-]                       :leaf extinction coefficient 
      f_s   [-]                       :fraction direct solar radiation 
    */

    function I_d_l(l, I_0, k_e_i, k, f_s) {
      
      var I_d_l = 0;

      I_d_l =  k * I_0 * (1 - f_s) * exp(-k_e_i * l);

      return I_d_l;

    };


    /*
      (1.16) CO2 response function

      C [μmol mol-1]  ambient CO2 concentration
    */

    function f_C(C, λ, f_C_m) {

      var f_C = 0
        , Φ = 0.8
        , β = 0.0032
        ;

      f_C = 1 / (2 * Φ) * (β * C + f_C_m - sqrt(pow(β * C + f_C_m, 2) - 4 * Φ * β * f_C_m * C));

      return f_C;

    };


    /*
      (3.14) N response function

      f_N [kg (N) kg-1 (C)] nitrogen fraction
    */

    function f_Pm_N(f_N, isC4, F_C) {

      var f_Pm_N = 0
        , f_N_ref = (isC4) ? (0.03 / F_C) : (0.04 / F_C)
        , f_N_mx = f_N_ref
        ;

      f_Pm_N = (f_N < f_N_ref) ? (f_N / f_N_ref) : (f_N_mx / f_N_ref);

      return f_Pm_N; 

    };


    /*
      (3.16 ff) Combiend T & CO2 response function

      T [°C]
      C [μmol mol-1]  ambient CO2 concentration
    */

    function f_Pm_TC(T, C, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) {

      // console.log(arguments);

      var f_Pm_TC = 0
        , q = 2 // TODO: value? (vgl. S. 12, Johnson 2013)
        , T_opt_Pm = T_opt_Pm_amb + γ_Pm * (f_C(C, λ, f_C_m) - 1)
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

    };


    /*
      (3.25 ff) Combiend T & CO2 response function

      T [°C]
      C [μmol mol-1]  ambient CO2 concentration
    */

    function f_α_TC(T, C, λ_α, γ_α, λ, f_C_m) {

      var f_α_TC = 0
        , T_opt_α = 15 + γ_α * (f_C(C, λ, f_C_m) - 1)
        ;

      f_α_TC = (T < T_opt_α) ? 1 : (1 - λ_α * (C_amb / C) * (T - T_opt_α));  

      return f_α_TC; 

    };


    /*
      (3.29) N response function

      f_N [kg (N) kg-1 (C)] nitrogen fraction
    */

    function f_α_N(f_N, isC4, F_C) {

      var f_α_N = 0
        , f_N_ref = (isC4) ? (0.03 / F_C) : (0.04 / F_C)
        ;

      f_α_N = (f_N > f_N_ref) ? 1 : (0.5 + 0.5 * (f_N / f_N_ref));

      return f_α_N; 

    };

    
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
      
      var P_l = 0; 

      P_l = 1 / (2 * ξ) * (α * I_l + P_m - sqrt(pow(α * I_l  + P_m, 2) - 4 * ξ * α * I_l * P_m));

      return P_l;

    };

    
    /*
      (3.33, 3.101 ff) Canopy gross photosynthesis in mixed swards including photorespiration

      P_g [μmol (CO2) m-2 s-1]      instantaneous canopy gross photosynthesis
      
      I_0 [μmol (photons) m-2 s-1]  incident solar radiation on the canopy
      T   [°C]                      temperature
      f_s [-]                       fraction direct solar radiation
    */
    
    function P_g(I_0, T, f_s) {

      var P_g = [] // return values 
        , δL = mixture.δL
        , n_L = mixture.n_L()
        , n_start_p = mixture.n_start_p(n_L) // array
        , k_e_i = mixture.k_e_i() // array index starts with 0!
        // , k_e = mixture.k_e() // weighted k over all species by total leaf area share 
        , δL_p = mixture.δL_p(n_start_p, n_L)
        , δL_i = mixture.δL_i(n_start_p, n_L, δL_p) // array index starts with 0!
        ;

      /* iterate over species */
      for (var p = 0, ps = mixture.length; p < ps; p++) {

        P_g[p] = 0.0;

        var species = mixture[p] 
          , cons = species.cons
          , l = 0
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
          , γ_Pm = cons.photo.γ_Pm // TODO: value?
          , T_mn = cons.photo.T_mn
          , T_ref = cons.photo.T_ref
          , T_opt_Pm_amb = cons.photo.T_opt_Pm_amb
          , λ = cons.photo.λ
          , f_C_m = cons.photo.f_C_m
          , F_C = species.F_C()
          ;

        /* (3.23) Photosynthetic efficiency, α */
        if (isC4)
          α = α_amb_15 * f_C(C, λ, f_C_m) * f_α_N(f_N, isC4, F_C);
        else
          α = α_amb_15 * f_C(C, λ, f_C_m) * f_α_TC(T, C, λ_α, γ_α, λ, f_C_m) * f_α_N(f_N, isC4, F_C);

        /* (3.8) Light saturated photosynthesis, P_m. TODO: why not related to light extiction (exp(-kl)) any more? */
        P_m = P_m_ref * f_C(C, λ, f_C_m) * f_Pm_TC(T, C, γ_Pm, T_mn, T_ref, T_opt_Pm_amb, isC4, λ, f_C_m) * f_Pm_N(f_N, isC4, F_C);

        /*  
            numerical integration:
          - iterate through the depth of the canopy of species.
          - if a new species appears in layer i (i >= n_start_p[p]) LAI increment 
            increases by δL_p and k_e_i (weighted k) changes
          - the fraction of leafs in direct light declines through the depth of 
            the canopy: exp(-k * l). The fraction in diffuse light increases: 1 - exp(-k * l)
          - the fraction in direct light is always also in diffuse light (2.21) 
        */

        /* iterate over leaf area layers */
        for (var i = 1; i < n_L + 1; i++) {

          /* cummulative leaf area at layer i */
          l += δL_i[i - 1] - (δL_i[i - 1] / 2); // l = (2 * i - 1) * (δL_p[p] / 2);
          
          /* direct radiation within the canopy at leaf area l with weighted k_e in layer i */
          var I_s_l_i = I_s_l(l, I_0, k_e_i[i - 1], k);
          
          /* diffuse radiation  within the canopy at leaf area l with weighted k_e in layer i */
          var I_d_l_i = I_d_l(l, I_0, k_e_i[i - 1], k, f_s);
  
          /* include species p in integeration if p has occured in layer i. 
             Error in SGS documentation?: i <= n_start_p[p] */
          if (i >= n_start_p[p]) {

            /* gross assmilates from direct radiation */
            P_g[p] += P_l(I_s_l_i, α, P_m, ξ) * exp(-k_e_i[i - 1] * l) * δL_p[p];
            
            /* gross assmilates from diffuse radiation */
            P_g[p] += P_l(I_d_l_i, α, P_m, ξ) * (1 - exp(-k_e_i[i - 1] * l)) * δL_p[p];

          } // if p in i

        } // for i

      } // for p
      
      return P_g;
      
    };

  };

  /*
    Daily carbon fixation

    
  */

  var netPhotosynthesis = function (T, N_up, N_fix) {

    console.log('netPhotosynthesis');

    /* iterate over mixture array */
    for (var p = 0, ps = mixture.length; p < ps; p++) {

      var species = mixture[p]
        , f_N = species.f_N_live_shoot()
        , P_g_day = species.vars.P_g_day
        , C_total = species.C_live_shoot() + species.C_root()
        , N_avail = N_up[p] + N_fix[p]
        , isC4 = species.isC4
        , F_C = species.F_C()
        ;

      /*(3.57) Gross assimilation P_g_day adjusted for maintenance respiration, 
      respiratory costs of nitrogen uptake and fixation.*/
      var P_growth = P_g_day - R_m(T, f_N, C_total, isC4, F_C) - R_N(N_up[p], N_fix[p]);
      console.log('P_growth: '+P_growth);

      if (P_growth > 0) { // net assmilates for growth of new tissue

        var vars = species.vars
          , cons = species.cons
          , dW_l_fdwt_ref = cons.dW_l_fdwt_ref
          , dW_s_fdwt_ref = cons.dW_s_fdwt_ref
          , dW_r_fdwt_ref = cons.dW_r_fdwt_ref
          , Ω_water = vars.Ω_water
          , Ω_N = vars.Ω_N
          , ρ_shoot_ref = cons.part.ρ_shoot_ref
          , ρ_l = cons.part.ρ_l
          , ρ_s = 1 - ρ_l
          , ρ_shoot = ρ_shoot_ref * sqrt(Ω_water * Ω_N)
          , ρ_root = 1 - ρ_shoot
          ; 

        /* N allocation to organ by partitioning and ref protein content of new tissue */  
        var N_avail_l = N_avail * ρ_shoot * ρ_l * (dW_l_fdwt_ref.pn / (dW_l_fdwt_ref.pn + dW_s_fdwt_ref.pn + dW_r_fdwt_ref.pn))  
          , N_avail_s = N_avail * ρ_shoot * ρ_s * (dW_s_fdwt_ref.pn / (dW_l_fdwt_ref.pn + dW_s_fdwt_ref.pn + dW_r_fdwt_ref.pn))  
          , N_avail_r = N_avail * ρ_root * (dW_r_fdwt_ref.pn / (dW_l_fdwt_ref.pn + dW_s_fdwt_ref.pn + dW_r_fdwt_ref.pn))
          ;

        var Y_leaf = species.Y_leaf(N_avail_l, P_growth * ρ_shoot * ρ_l)
          , Y_stem = species.Y_stem(N_avail_s, P_growth * ρ_shoot * ρ_s)
          , Y_root = species.Y_root(N_avail_r, P_growth * ρ_root)
            /* weight by organ partitioning */
          , Y = (Y_leaf * ρ_shoot * ρ_l) + (Y_stem * ρ_shoot * ρ_s) + (Y_root * ρ_root)
          ;

        /*(3.57, 3.49) P available for growth adjusted for growth respiration Y */
        vars.G = Y * P_growth;
        vars.Y = Y;
        vars.Y_leaf = Y_leaf;
        vars.Y_stem = Y_stem;
        vars.Y_root = Y_root;

      } else { // no growth: assimilates are not sufficent for respiratory costs 

        // TODO: e.g. (P_growth * NC.l / NC_p) > NC.l ? accelerate flux to dead?

        var NC = species.vars.NC
          , NC_p = NC.l + NC.s + NC.r
          ;

        /* reduce nc pools by share as long as non-structural pool > 0 */
        if (NC.l > 0)
          NC.l = max(0, NC.l + (P_growth * NC.l / NC_p));
        if (NC.s > 0)
          NC.s = max(0, NC.s + (P_growth * NC.s / NC_p));
        if (NC.r > 0)
          NC.r = max(0, NC.r + (P_growth * NC.r / NC_p));

        species.vars.G = 0;

      }

    }


    /*
      (3.41 ff) Maintenance respiration

      R_m [kg (C) m-2 d-1]

      m_ref   [d-1] maintenance coefficient at reference temperature and N content
      T_ref   [°C]   

    */
    
    function R_m(T, f_N, W, isC4, F_C) {
      
      var R_m = 0
        , m_ref = 0.025
        , f_N_ref = (isC4) ? (0.03 / F_C) : (0.04 / F_C)
        ;
      
      R_m = m_ref * f_m(T, isC4) * (f_N / f_N_ref) * W;

      return R_m;
      
    };


    /*
      (3.44) Maintenance temperature response
    */

    function f_m(T, isC4) {

      var f_m = 0
        , T_m_mn = (isC4) ? 12 : 3
        , T_ref = (isC4) ? 25 : 20

      f_m = (T - T_m_mn) / (T_ref - T_m_mn);

      return f_m;

    };


    /*
      (3.51 ff) Respiratory costs of N uptake and fixation
    
      R_N     [kg (C) m-2 d-1]
      N_up    [kg (N) m-2]      daily N uptake
      N_fix   [kg (N) m-2]      daily N fixation
      
      λ_N_up  [kg (C) kg-1 (N)] N uptake respiration coefficent
      λ_N_fix [kg (C) kg-1 (N)] N fixation respiration coefficent

    */

    function R_N(N_up, N_fix) {

      var R_N = 0
        , λ_N_up = 0.6
        , λ_N_fix = 6
        ;

      R_N = λ_N_up * N_up + λ_N_fix * N_fix;

      return R_N;

    };

  };
    

  /*
    Partitioning of net assimilates and tissue turnover

    G [kg (C) m-2 day-1]  net growth rate     
    
    TODO: 
      - include influence of defoliation (4.21c) 
      - trampling by animals (4.16m)
  */
    
  var partitioning = function (T) {

    console.log('partitioning');

    /* iterate over mixture array */
    for (var p = 0, ps = mixture.length; p < ps; p++) {
  
      var vars = mixture[p].vars 
        , cons = mixture[p].cons 
        , ρ_shoot_ref = cons.part.ρ_shoot_ref
        , ρ_l = cons.part.ρ_l 
        , ρ_s = 1 - ρ_l 
          /* (3.80) growth partitioned to the shoot */
        , G_shoot = ρ_shoot_ref * sqrt(vars.Ω_water * vars.Ω_N) * vars.G
          /* (3.81) growth partitiond to the root */
        , G_r = vars.G - G_shoot
          /* (3.82) growth partitioned to leaf and stem (and sheath) */
        , G_l = G_shoot * ρ_l 
        , G_s = G_shoot * ρ_s
        ;

      /* growth dynamics */
      var dSC = vars.dSC
        , SC = vars.SC
        , NC = vars.NC
        , dNC = vars.dNC
        , PN = vars.PN
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
        , γ_l = f_γ(T) * Φ_l * 3 / 10
          /* stem flux parameter TODO: how to better relate γ_s, γ_r to γ_l */
        , γ_s = 0.5 * γ_l
        , γ_r = 0.5 * γ_l
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

      /* (3.93 ff) sheath and stem */
      dSC.live_s_1 = (G_s * (f_dwt_s.sc / dwt_s)) - (2 * γ_s * SC.live_s_1);
      dSC.live_s_2 = (2 * γ_s * SC.live_s_1) - (γ_s * SC.live_s_2);
      dSC.live_s_3 = (γ_s * SC.live_s_2) - (γ_s * SC.live_s_3);
      dSC.dead_s = (γ_s * SC.live_s_3) - (γ_dead * SC.dead_s);

      /* (3.97) root */
      dSC.r = (G_r * (f_dwt_r.sc / dwt_r)) - (γ_r * SC.r);
      
      /* senescenced root */
      Λ_r.sc += γ_r * SC.r;

      /* (4.18m) input to litter. Johnson (2005/2008) */
      Λ_litter.sc += γ_dead * (SC.dead_l + SC.dead_s);

      // console.log({ dSC: dSC, dNC: dNC, dPN: dPN });

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
      NC.l = max(0, NC.l - 0.05 * (2 * γ_l * SC.live_l_1));
      NC.s = max(0, NC.s - 0.05 * (2 * γ_s * SC.live_s_1));
      NC.r = max(0, NC.r - 0.05 * (γ_r * SC.r));

      // console.log({ SC: SC, NC: NC, PN: PN });
    
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


  /* 
    constructor function

    species = [
      { type: '', share: '' }
    ]

  */
  var constructor = function (species, cfg) {

    /* initialize mixture */
    mixture = new Mixture(species, cfg);

    /* interface */
    return {
        step: step
      , mixture: mixture
    };

  };

  return constructor;

}());

}()); // scope
