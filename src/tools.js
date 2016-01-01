var tools = {

    /*
      sand [m3 m-3]
      clay [m3 m-3]
    */

    texture2KA5: function (sand, clay) {

      sand = sand * 100;
      clay = clay * 100;

      var textureClass = ''
        , silt = 100 - (sand + clay)
        ;

      if ((sand + clay + silt) != 100)
        throw new Error('(sand + clay + silt) != 100: ' + (sand + clay + silt));

      if (clay <= 5) {

        if (silt <= 10)
          textureClass = 'Ss';
        else if (silt <= 25)
          textureClass = 'Su2';
        else if (silt <= 40)
          textureClass = 'Su3';
        else if (silt <= 50)
          textureClass = 'Su4';
        else if (silt <= 80)
          textureClass = 'Us';
        else
          textureClass = 'Uu';

      } else if (clay <= 8) {
        
        if (silt <= 10)
          textureClass = 'St2';
        else if (silt <= 25)
          textureClass = 'Sl2';
        else if (silt <= 40)
          textureClass = 'Su3';
        else if (silt <= 50)
          textureClass = 'Su4';
        else if (silt <= 80)
          textureClass = 'Us';
        else
          textureClass = 'Uu';

      } else if (clay <= 12) {
        
        if (silt <= 10)
          textureClass = 'St2';
        else if (silt <= 40)
          textureClass = 'Sl3';
        else if (silt <= 50)
          textureClass = 'Slu';
        else if (silt <= 65)
          textureClass = 'Uls';
        else
          textureClass = 'Ut2';
      
      } else if (clay <= 17) {
        
        if (silt <= 10)
          textureClass = 'St2';
        else if (silt <= 40)
          textureClass = 'Sl4';
        else if (silt <= 50)
          textureClass = 'Slu';
        else if (silt <= 65)
          textureClass = 'Uls';
        else
          textureClass = 'Ut3';
      
      } else if (clay <= 25) {

        if (silt <= 15)
          textureClass = 'St3';
        else if (silt <= 30)
          textureClass = 'Ls4';
        else if (silt <= 40)
          textureClass = 'Ls3';
        else if (silt <= 50)
          textureClass = 'Ls2';
        else if (silt <= 65)
          textureClass = 'Lu';
        else
          textureClass = 'Ut4';
      
      } else if (clay <= 30) {

        if (silt <= 15)
          textureClass = 'Ts4';
        else if (silt <= 30)
          textureClass = 'Lts';
        else if (silt <= 50)
          textureClass = 'Lt2';
        else if (silt <= 65)
          textureClass = 'Lu';
        else
          textureClass = 'Tu4';

      } else if (clay <= 35) {

        if (silt <= 15)
          textureClass = 'Ts4';
        else if (silt <= 30)
          textureClass = 'Lts';
        else if (silt <= 50)
          textureClass = 'Lt2';
        else if (silt <= 65)
          textureClass = 'Tu3';
        else
          textureClass = 'Tu4';    
      
      } else if (clay <= 45) {

        if (silt <= 15)
          textureClass = 'Ts3';
        else if (silt <= 30)
          textureClass = 'Lts';
        else if (silt <= 50)
          textureClass = 'Lt3';
        else
          textureClass = 'Tu3';

      } else if (clay <= 65) {
        
        if (silt <= 15)
          textureClass = 'Ts2';
        else if (silt <= 30)
          textureClass = 'Tl';
        else
          textureClass = 'Tu2';

      } else {
        textureClass = 'Tt';
      }

      return textureClass;
    }

  , KA52sand: function (soilTextureClass) {
      
      var x = 0.0;

      if(soilTextureClass == "fS")
        x = 0.84;
      else if(soilTextureClass == "fSms")
        x = 0.86;
      else if(soilTextureClass == "fSgs")
        x = 0.88;
      else if(soilTextureClass == "gS")
        x = 0.93;
      else if(soilTextureClass == "mSgs")
        x = 0.96;
      else if(soilTextureClass == "mSfs")
        x = 0.93;
      else if(soilTextureClass == "mS")
        x = 0.96;
      else if(soilTextureClass == "Ss")
        x = 0.93;
      else if(soilTextureClass == "Sl2")
        x = 0.76;
      else if(soilTextureClass == "Sl3")
        x = 0.65;
      else if(soilTextureClass == "Sl4")
        x = 0.60;
      else if(soilTextureClass == "Slu")
        x = 0.43;
      else if(soilTextureClass == "St2")
        x = 0.84;
      else if(soilTextureClass == "St3")
        x = 0.71;
      else if(soilTextureClass == "Su2")
        x = 0.80;
      else if(soilTextureClass == "Su3")
        x = 0.63;
      else if(soilTextureClass == "Su4")
        x = 0.56;
      else if(soilTextureClass == "Ls2")
        x = 0.34;
      else if(soilTextureClass == "Ls3")
        x = 0.44;
      else if(soilTextureClass == "Ls4")
        x = 0.56;
      else if(soilTextureClass == "Lt2")
        x = 0.30;
      else if(soilTextureClass == "Lt3")
        x = 0.20;
      else if(soilTextureClass == "LtS")
        x = 0.42;
      else if(soilTextureClass == "Lu")
        x = 0.19;
      else if(soilTextureClass == "Uu")
        x = 0.10;
      else if(soilTextureClass == "Uls")
        x = 0.30;
      else if(soilTextureClass == "Us")
        x = 0.31;
      else if(soilTextureClass == "Ut2")
        x = 0.13;
      else if(soilTextureClass == "Ut3")
        x = 0.11;
      else if(soilTextureClass == "Ut4")
        x = 0.09;
      else if(soilTextureClass == "Utl")
        x = 0.19;
      else if(soilTextureClass == "Tt")
        x = 0.17;
      else if(soilTextureClass == "Tl")
        x = 0.17;
      else if(soilTextureClass == "Tu2")
        x = 0.12;
      else if(soilTextureClass == "Tu3")
        x = 0.10;
      else if(soilTextureClass == "Ts3")
        x = 0.52;
      else if(soilTextureClass == "Ts2")
        x = 0.37;
      else if(soilTextureClass == "Ts4")
        x = 0.62;
      else if(soilTextureClass == "Tu4")
        x = 0.05;
      else if(soilTextureClass == "L")
        x = 0.35;
      else if(soilTextureClass == "S")
        x = 0.93;
      else if(soilTextureClass == "U")
        x = 0.10;
      else if(soilTextureClass == "T")
        x = 0.17;
      else if(soilTextureClass == "HZ1")
        x = 0.30;
      else if(soilTextureClass == "HZ2")
        x = 0.30;
      else if(soilTextureClass == "HZ3")
        x = 0.30;
      else if(soilTextureClass == "Hh")
        x = 0.15;
      else if(soilTextureClass == "Hn")
        x = 0.15;
      else
        x = 0.66;

      return x;
    }

  , KA52clay: function (soilTextureClass) {
      
      var x = 0.0;

      if(soilTextureClass == "fS")
        x = 0.02;
      else if(soilTextureClass == "fSms")
        x = 0.02;
      else if(soilTextureClass == "fSgs")
        x = 0.02;
      else if(soilTextureClass == "gS")
        x = 0.02;
      else if(soilTextureClass == "mSgs")
        x = 0.02;
      else if(soilTextureClass == "mSfs")
        x = 0.02;
      else if(soilTextureClass == "mS")
        x = 0.02;
      else if(soilTextureClass == "Ss")
        x = 0.02;
      else if(soilTextureClass == "Sl2")
        x = 0.06;
      else if(soilTextureClass == "Sl3")
        x = 0.10;
      else if(soilTextureClass == "Sl4")
        x = 0.14;
      else if(soilTextureClass == "Slu")
        x = 0.12;
      else if(soilTextureClass == "St2")
        x = 0.11;
      else if(soilTextureClass == "St3")
        x = 0.21;
      else if(soilTextureClass == "Su2")
        x = 0.02;
      else if(soilTextureClass == "Su3")
        x = 0.04;
      else if(soilTextureClass == "Su4")
        x = 0.04;
      else if(soilTextureClass == "Ls2")
        x = 0.21;
      else if(soilTextureClass == "Ls3")
        x = 0.21;
      else if(soilTextureClass == "Ls4")
        x = 0.21;
      else if(soilTextureClass == "Lt2")
        x = 0.30;
      else if(soilTextureClass == "Lt3")
        x = 0.40;
      else if(soilTextureClass == "Lts")
        x = 0.35;
      else if(soilTextureClass == "Lu")
        x = 0.23;
      else if(soilTextureClass == "Uu")
        x = 0.04;
      else if(soilTextureClass == "Uls")
        x = 0.12;
      else if(soilTextureClass == "Us")
        x = 0.04;
      else if(soilTextureClass == "Ut2")
        x = 0.10;
      else if(soilTextureClass == "Ut3")
        x = 0.14;
      else if(soilTextureClass == "Ut4")
        x = 0.21;
      else if(soilTextureClass == "Utl")
        x = 0.23;
      else if(soilTextureClass == "Tt")
        x = 0.82;
      else if(soilTextureClass == "Tl")
        x = 0.55;
      else if(soilTextureClass == "Tu2")
        x = 0.55;
      else if(soilTextureClass == "Tu3")
        x = 0.37;
      else if(soilTextureClass == "Ts3")
        x = 0.40;
      else if(soilTextureClass == "Ts2")
        x = 0.55;
      else if(soilTextureClass == "Ts4")
        x = 0.30;
      else if(soilTextureClass == "Tu4")
        x = 0.30;
      else if(soilTextureClass == "L")
        x = 0.31;
      else if(soilTextureClass == "S")
        x = 0.02;
      else if(soilTextureClass == "U")
        x = 0.04;
      else if(soilTextureClass == "T")
        x = 0.82;
      else if(soilTextureClass == "HZ1")
        x = 0.15;
      else if(soilTextureClass == "HZ2")
        x = 0.15;
      else if(soilTextureClass == "HZ3")
        x = 0.15;
      else if(soilTextureClass == "Hh")
        x = 0.1;
      else if(soilTextureClass == "Hn")
        x = 0.1;

      return x;
    }

    /* 
      Bodenkundliche Kartieranleitung (2005) S.125 

      Estimate raw density ("Trockenrohdichte") from "effektive Lagerungsdichte"

      TODO: ldEff unit?
    */

  , ld_eff2trd: function (ldEff, clay) {
      
      var x = 0.0;

      switch (ldEff)
      {
      case 1:
        x = 1.3;
        break;
      case 2:
        x = 1.5;
        break;
      case 3:
        x = 1.7;
        break;
      case 4:
        x = 1.9;
        break;
      case 5:
        x = 2.1;
        break;
      default: // JS!
        x = 1.7;      
      }

      return x - (0.9 * clay);
    }
  ,
    saxton: function (sand, clay, organicMatter, stone) {
      
      /*
        Eq. 15 + 18 (Saxton 2006)
        lambda            slope of logarithmic tension-moisture curve
        Theta_33    [% v] 33 kPa moisture, normal density
        Theta_1500  [% v] 1500 kPa moisture
        B                 coefficient of moisture-tension
      */

      function lambda(Theta_33, Theta_1500) {
        
        var B = (log(1500) - log(33)) / (log(Theta_33) - log(Theta_1500));
        return 1 / B;

      }

      /*
        Eq. 16 (Saxton 2006)
        K_S       [mm h-1]    saturated conductivity (matric soil)
        Theta_S   [% v]       saturated moisture (0 kPa), normal density
        Theta_33  [% v]       33 kPa moisture, normal density
        lambda                Slope of logarithmic tension-moisture curve
      */

      function K_S(Theta_S, Theta_33, lambda) {

        return 1930 * pow(Theta_S - Theta_33, 3 - lambda);
        
      }

      /*
        Eq. 17 (Saxton 2006)
        K_Theta     [mm h-1]  unsaturated conductivity at moisture Theta
        K_S         [mm h-1]  saturated conductivity (matric soil)
        Theta       [% v]     moisture
        Theta_S     [% v]     saturated moisture (0 kPa), normal density
        Theta_1500  [% v]     1500 kPa moisture
        Theta_33    [% v]     33 kPa moisture, normal density
      */

      function K_Theta(K_S, Theta, Theta_S, lambda, Theta_1500, Theta_33) {

        return K_S * pow(Theta / Theta_S, 3 + (2 / lambda));
        
      }

      /*
        Eq. 5 (Saxton 2006)
        Theta_S       [% v]   saturated moisture (0 kPa), normal density
        Theta_33      [% v]   33 kPa moisture, normal density
        Theta_S33     [% v]   SAT-33 kPa moisture, normal density
        S             [% w]   sand
      */

      function Theta_S(Theta_33, Theta_S33, S) {
        
        return Theta_33 + Theta_S33 - 0.097 * S + 0.043;
        
      }

      /*
        Eq. 2 (Saxton 2006)
        Theta_33      [% v]   33 kPa moisture, normal density
        S             [% w]   sand
        C             [% w]   clay
        OM            [% w]   organic matter
      */

      function Theta_33(S, C, OM) {
        
        var Theta_33t = (
          - 0.251 * S + 0.195 * C + 0.011 * OM +
            0.006 * (S * OM) - 0.027 * (C * OM) +
            0.452 * (S * C) + 0.299
        );
        
        return Theta_33t + (1.283 * pow(Theta_33t, 2) - 0.374 * Theta_33t - 0.015);
        
      }

      /*
        Eq. 3 (Saxton 2006)
        Theta_S33     [% v]   SAT-33 kPa moisture, normal density
        S             [% w]   sand
        C             [% w]   clay
        OM            [% w]   organic matter
      */

      function Theta_S33(S, C, OM) {
        
        var Theta_S33t = (
            0.278 * S + 0.034 * C + 0.022 * OM -
            0.018 * (S * OM) - 0.027 * (C * OM) -
            0.584 * (S * C) + 0.078
        );
        
        return Theta_S33t + (0.636 * Theta_S33t - 0.107);
        
      }

      /*
        Eq. 1 (Saxton 2006)
        Theta_1500    [% v]   1500 kPa moisture
        S             [% w]   sand
        C             [% w]   clay
        OM            [% w]   organic matter
      */

      function Theta_1500(S, C, OM) {
        
        var Theta_1500t = (
          - 0.024 * S + 0.487 * C + 0.006 * OM +
            0.005 * (S * OM) - 0.013 * (C * OM) +
            0.068 * (S * C) + 0.031
        );
        
        return Theta_1500t + (0.14 * Theta_1500t - 0.02);
        
      }

      /* Saxton 2006 */
      var theta_33 = Theta_33(sand, clay, 0);
      var theta_S33 = Theta_S33(sand, clay, 0);
      var theta_S = Theta_S(theta_33, theta_S33, sand);
      var theta_1500 = Theta_1500(sand, clay, 0);
      var bulkDensity = (1 - theta_S) * 2.65;

      /* Saxton 1986 */
      var percent_sand = sand * 100;
      var percent_clay = clay * 100;
      var sand_2 = pow(percent_sand, 2);
      var clay_2 = pow(percent_clay, 2);
      var a = exp(-4.396 - 0.0715 * percent_clay - 4.88e-4 * sand_2 - 4.285e-5 * sand_2 * percent_clay);
      var b = - 3.140 - 0.00222 * clay_2 - 3.484e-5 * sand_2 * percent_clay;
      var SAT = 0.332 - 7.251e-4 * percent_sand + 0.1276 * log10(percent_clay);
      var FC = pow((0.3333 / a), (1.0 / b));
      var PWP = pow((15.0  / a), (1.0 / b));
      var BD = (1 - SAT) * 2.65;

      return {
        saxton_06: { /* experimental! */
          FC: theta_33 * (1 - stone),
          theta_S33: theta_S33,
          PWP: theta_1500 * (1 - stone),
          S: theta_S * (1 - stone),
          BD: bulkDensity * 1000, // [kg m-3]
          lambda: lambda(theta_33, theta_1500) 
        },
        saxton_86: {
          FC: FC * (1 - stone),
          SAT: SAT * (1 - stone),
          PWP: PWP * (1 - stone),
          BD: BD * 1000 // [kg m-3]
        }
      };

    }
  ,  
    texture2lambda: function (sand, clay) {
      return (2.0 * (sand * sand * 0.575)) + (clay * 0.1) + ((1.0 - sand - clay) * 0.35);
    }
  ,
    soilCharacteristicsKA5: function (soilParameter) {

      logger(MSG_INFO, 'Read soil characteristics from KA5');

      var texture = soilParameter.vs_SoilTexture;
      var stoneContent = soilParameter.vs_SoilStoneContent;

      var fc = 0.0;
      var sat = 0.0;
      var pwp = 0.0;

      if (texture !== "") {
        var srd = soilParameter.vs_SoilRawDensity() / 1000.0; // [kg m-3] -> [g cm-3]
        var som = soilParameter.vs_SoilOrganicMatter() * 100.0; // [kg kg-1] -> [%]

        // ***************************************************************************
        // *** The following boundaries are extracted from:                        ***
        // *** Wessolek, G., M. Kaupenjohann, M. Renger (2009) Bodenphysikalische  ***
        // *** Kennwerte und Berechnungsverfahren für die Praxis. Bodenökologie    ***
        // *** und Bodengenese 40, Selbstverlag Technische Universität Berlin      ***
        // *** (Tab. 4).                                                           ***
        // ***************************************************************************

        var srd_lowerBound = 0.0;
        var srd_upperBound = 0.0;
        if (srd < 1.1) {
          srd_lowerBound = 1.1;
          srd_upperBound = 1.1;
        }
        else if ((srd >= 1.1) && (srd < 1.3)) {
          srd_lowerBound = 1.1;
          srd_upperBound = 1.3;
        }
        else if ((srd >= 1.3) && (srd < 1.5)) {
          srd_lowerBound = 1.3;
          srd_upperBound = 1.5;
        }
        else if ((srd >= 1.5) && (srd < 1.7)) {
          srd_lowerBound = 1.5;
          srd_upperBound = 1.7;
        }
        else if ((srd >= 1.7) && (srd < 1.9)) {
          srd_lowerBound = 1.7;
          srd_upperBound = 1.9;
        }
        else if (srd >= 1.9) {
          srd_lowerBound = 1.9;
          srd_upperBound = 1.9;
        }

        // special treatment for "torf" soils
        if (texture == "Hh" || texture == "Hn") {
            srd_lowerBound = -1;
            srd_upperBound = -1;
        }

        // Boundaries for linear interpolation
        var lbRes = tools.readPrincipalSoilCharacteristicData(texture, srd_lowerBound);
        var sat_lowerBound = lbRes.sat;
        var fc_lowerBound = lbRes.fc;
        var pwp_lowerBound = lbRes.pwp;

        var ubRes = tools.readPrincipalSoilCharacteristicData(texture, srd_upperBound);
        var sat_upperBound = ubRes.sat;
        var fc_upperBound = ubRes.fc;
        var pwp_upperBound = ubRes.pwp;

        if(lbRes.initialized && ubRes.initialized) {
          //    cout << "Soil Raw Density:\t" << vs_SoilRawDensity << endl;
          //    cout << "Saturation:\t\t" << vs_SaturationLowerBoundary << "\t" << vs_SaturationUpperBoundary << endl;
          //    cout << "Field Capacity:\t" << vs_FieldCapacityLowerBoundary << "\t" << vs_FieldCapacityUpperBoundary << endl;
          //    cout << "PermanentWP:\t" << vs_PermanentWiltingPointLowerBoundary << "\t" << vs_PermanentWiltingPointUpperBoundary << endl;
          //    cout << "Soil Organic Matter:\t" << vs_SoilOrganicMatter << endl;

          // ***************************************************************************
          // *** The following boundaries are extracted from:                        ***
          // *** Wessolek, G., M. Kaupenjohann, M. Renger (2009) Bodenphysikalische  ***
          // *** Kennwerte und Berechnungsverfahren für die Praxis. Bodenökologie    ***
          // *** und Bodengenese 40, Selbstverlag Technische Universität Berlin      ***
          // *** (Tab. 5).                                                           ***
          // ***************************************************************************

          var som_lowerBound = 0.0;
          var som_upperBound = 0.0;

          if(som >= 0.0 && som < 1.0) {
            som_lowerBound = 0.0;
            som_upperBound = 0.0;
          }
          else if(som >= 1.0 && som < 1.5) {
            som_lowerBound = 0.0;
            som_upperBound = 1.5;
          }
          else if(som >= 1.5 && som < 3.0) {
            som_lowerBound = 1.5;
            som_upperBound = 3.0;
          }
          else if(som >= 3.0 && som < 6.0) {
            som_lowerBound = 3.0;
            som_upperBound = 6.0;
          }
          else if(som >= 6.0 && som < 11.5) {
            som_lowerBound = 6.0;
            som_upperBound = 11.5;
          }
          else if(som >= 11.5) {
            som_lowerBound = 11.5;
            som_upperBound = 11.5;
          }

          // special treatment for "torf" soils
          if (texture == "Hh" || texture == "Hn") {
            som_lowerBound = 0.0;
            som_upperBound = 0.0;
          }

          // Boundaries for linear interpolation
          var fc_mod_lowerBound = 0.0;
          var sat_mod_lowerBound = 0.0;
          var pwp_mod_lowerBound = 0.0;
          // modifier values are given only for organic matter > 1.0% (class h2)
          if (som_lowerBound !== 0.0) {
            lbRes = tools.readSoilCharacteristicModifier(texture, som_lowerBound);
            sat_mod_lowerBound = lbRes.sat;
            fc_mod_lowerBound = lbRes.fc;
            pwp_mod_lowerBound = lbRes.pwp;
          }

          var fc_mod_upperBound = 0.0;
          var sat_mod_upperBound = 0.0;
          var pwp_mod_upperBound = 0.0;
          if (som_upperBound !== 0.0) {
            ubRes = tools.readSoilCharacteristicModifier(texture, som_upperBound);
            sat_mod_upperBound = ubRes.sat;
            fc_mod_upperBound = ubRes.fc;
            pwp_mod_upperBound = ubRes.pwp;
          }

    //      cout << "Saturation-Modifier:\t" << sat_mod_lowerBound << "\t" << sat_mod_upperBound << endl;
    //      cout << "Field capacity-Modifier:\t" << fc_mod_lowerBound << "\t" << fc_mod_upperBound << endl;
    //      cout << "PWP-Modifier:\t" << pwp_mod_lowerBound << "\t" << pwp_mod_upperBound << endl;

          // Linear interpolation
          var fc_unmod = fc_lowerBound;
          if (fc_upperBound < 0.5 && fc_lowerBound >= 1.0)
            fc_unmod = fc_lowerBound;
          else if(fc_lowerBound < 0.5 && fc_upperBound >= 1.0)
            fc_unmod = fc_upperBound;
          else if(srd_upperBound != srd_lowerBound)
            fc_unmod = (srd - srd_lowerBound)/
                       (srd_upperBound - srd_lowerBound)*
                       (fc_upperBound - fc_lowerBound) + fc_lowerBound;

          var sat_unmod = sat_lowerBound;
          if(sat_upperBound < 0.5 && sat_lowerBound >= 1.0)
            sat_unmod = sat_lowerBound;
          else if(sat_lowerBound < 0.5 && sat_upperBound >= 1.0)
            sat_unmod = sat_upperBound;
          else if(srd_upperBound != srd_lowerBound)
            sat_unmod = (srd - srd_lowerBound)/
                        (srd_upperBound - srd_lowerBound)*
                        (sat_upperBound - sat_lowerBound) + sat_lowerBound;

          var pwp_unmod = pwp_lowerBound;
          if(pwp_upperBound < 0.5 && pwp_lowerBound >= 1.0)
            pwp_unmod = pwp_lowerBound;
          else if(pwp_lowerBound < 0.5 && pwp_upperBound >= 1.0)
            pwp_unmod = pwp_upperBound;
          else if(srd_upperBound != srd_lowerBound)
            pwp_unmod = (srd - srd_lowerBound)/
                        (srd_upperBound - srd_lowerBound)*
                        (pwp_upperBound - pwp_lowerBound) + pwp_lowerBound;

          //in this case upper and lower boundary are equal, so doesn't matter.
          var fc_mod = fc_mod_lowerBound;
          var sat_mod = sat_mod_lowerBound;
          var pwp_mod = pwp_mod_lowerBound;
          if(som_upperBound != som_lowerBound) {
            fc_mod = (som - som_lowerBound)/
                     (som_upperBound - som_lowerBound)*
                     (fc_mod_upperBound - fc_mod_lowerBound) + fc_mod_lowerBound;

            sat_mod = (som - som_lowerBound)/
                      (som_upperBound - som_lowerBound)*
                      (sat_mod_upperBound - sat_mod_lowerBound) + sat_mod_lowerBound;

            pwp_mod = (som - som_lowerBound)/
                      (som_upperBound - som_lowerBound)*
                      (pwp_mod_upperBound - pwp_mod_lowerBound) + pwp_mod_lowerBound;
          }

          // Modifying the principal values by organic matter
          fc = (fc_unmod + fc_mod)/100.0; // [m3 m-3]
          sat = (sat_unmod + sat_mod)/100.0; // [m3 m-3]
          pwp = (pwp_unmod + pwp_mod)/100.0; // [m3 m-3]

          // Modifying the principal values by stone content
          fc *= (1.0 - stoneContent);
          sat *= (1.0 - stoneContent);
          pwp *= (1.0 - stoneContent);
        }
      }

      soilParameter.vs_FieldCapacity = fc;
      soilParameter.vs_Saturation = sat;
      soilParameter.vs_PermanentWiltingPoint = pwp;
    }
  ,
    // TODO: refactor soilType -> textureClass
    readPrincipalSoilCharacteristicData: function (soilType, rawDensity) {

      // C++
      // typedef map<int, RPSCDRes> M1;
      // typedef map<string, M1> M2;
      // static M2 m;

      var RPSCDRes = function (initialized) {

        this.sat = 0;
        this.fc = 0;
        this.pwp = 0;
        this.initialized = (initialized === undefined) ? false : initialized;

      };

      var columns = soilCharacteristicData.columns;
      var rows = soilCharacteristicData.rows;

      var m = {};

      for (var r = 0, rs = rows.length; r < rs; r++) {

        var row = rows[r];


        if (row['soil_type'] === soilType) {

          var ac = row['air_capacity'];
          var fc = row['field_capacity'];
          var nfc = row['n_field_capacity'];

          var rp = new RPSCDRes(true);
          rp.sat = ac + fc;
          rp.fc = fc;
          rp.pwp = fc - nfc;

          if (m[soilType] === undefined)
            m[soilType] = {};

          m[soilType][toInt(row['soil_raw_density*10'])] = rp;

        }
      }

      var rd10 = toInt(rawDensity * 10);
      if (m[soilType][rd10])
        return m[soilType][rd10];

      //if we didn't find values for a given raw density, e.g. 1.1 (= 11)
      //we try to find the closest next one (up (1.1) or down (1.9))
      while(!m[soilType][rd10] && (11 <= rd10 && rd10 <= 19))
        rd10 += (rd10 < 15) ? 1 : -1;

      return (m[soilType][rd10]) ? m[soilType][rd10] : new RPSCDRes();

    }
  , readSoilCharacteristicModifier: function (soilType, organicMatter) {

      // C++
      // typedef map<int, RPSCDRes> M1;
      // typedef map<string, M1> M2;
      // static M2 m;
      var RPSCDRes = function (initialized) {

        this.sat = 0;
        this.fc = 0;
        this.pwp = 0;
        this.initialized = (initialized === undefined) ? false : initialized;

      };

      var columns = soilAggregationValues.columns;
      var rows = soilAggregationValues.rows;

      var m = {};

      for (var r = 0, rs = rows.length; r < rs; r++) {

        var row = rows[r];

        if (row['soil_type'] === soilType) {

          var ac = row['air_capacity'];
          var fc = row['field_capacity'];
          var nfc = row['n_field_capacity'];

          var rp = new RPSCDRes(true);
          rp.sat = ac + fc;
          rp.fc = fc;
          rp.pwp = fc - nfc;


          if (m[soilType] === undefined)
            m[soilType] = {};

          m[soilType][toInt(row['organic_matter'])] = rp;

        }
      }

      var rd10 = toInt(organicMatter * 10);

      return (m[soilType][rd10]) ? m[soilType][rd10] : new RPSCDRes();
  
    }
  , sunshine2globalRadiation: function (yd, sonn, lat, asMJpm2pd) {
      var pi=4.0*atan(1.0);
      var dec=-23.4*cos(2*pi*(yd+10)/365);
      var sinld=sin(dec*pi/180)*sin(lat*pi/180);
      var cosld=cos(dec*pi/180)*cos(lat*pi/180);
      var dl=12*(pi+2*asin(sinld/cosld))/pi;
      var dle=12*(pi+2*asin((-sin(8*pi/180)+sinld)/cosld))/pi;
      var rdn=3600*(sinld*dl+24/pi*cosld*sqrt(1.0-(sinld/cosld)*(sinld/cosld)));
      var drc=1300*rdn*exp(-0.14/(rdn/(dl*3600)));
      var dro=0.2*drc;
      var dtga=sonn/dle*drc+(1-sonn/dle)*dro;
      var t = dtga/10000.0;
      //convert J/cm²/d to MJ/m²/d
      //1cm²=1/(100*100)m², 1J = 1/1000000MJ
      //-> (t * 100.0 * 100.0) / 1000000.0 -> t / 100
      return asMJpm2pd ? t/100.0 : t;
    }
  , 
  /*
    Solar radiation and daylength depending only on latitude and temperature (min, max) input

    REFERENCES
    
    Allen, Richard G. et al. 1998.
    Crop evapotranspiration - Guidelines for computing crop water requirements
    FAO Irrigation and drainage paper 56

    Johnson. I.R. 2013.
    DairyMod and the SGS Pasture Model: a mathematical description of the biophysical
      
    Rotz, C. A., Corson, M.S., Chianese, D.S., Montes, F., Hafner, S.D., Bonifacio, H.F. and Coiner, C.U. 2014. 
    The integrated farm system model: reference manual version 4.1. 
    Available: http://afrsweb.usda.gov/SP2UserFiles/Place/19020500/Reference%20Manual.pdf Accessed January 3, 2015.

    Hargreaves GH, Samani ZA. (1985) Reference crop evapotranspiration from temperature.
    Appl Engine Agric. 1(2):96–99
    
    Supit, I. 2003.
    Updated system description of the WOFOST crop growth simulation model as implemented
    in the Crop Growth Monitoring System applied by the European Commission 
    (http://www.treemail.nl/download/treebook7/start.htm)

    LICENSE

    Copyright 2014 Jan Vaillant <jan.vaillant@zalf.de>

    Distributed under the MIT License. See accompanying file LICENSE or copy at http://opensource.org/licenses/MIT
  */

    weather: (function () {

      var PI = Math.PI
        , sin = Math.sin
        , cos = Math.cos
        , tan = Math.tan
        , acos = Math.acos
        , sqrt = Math.sqrt
        , pow = Math.pow
        , exp = Math.exp
        , ceil = Math.ceil
        , min = Math.min
        , MS_PER_DAY = 1000 * 60 * 60 * 24
        ;

      /*
        Allen (1998) eq. 22

        rad [rad] 
        deg [decimal degrees]
      */

      var rad = function (deg) {

        return (PI / 180) * deg;
        
      };

      /*
        Allen (1998) eq. 23

        dr  []  Inverse relative distance Earth-Sun
        J   [#] Day of year (1 - 366)
      */

      var dr = function (J) {

        return 1 + (0.033 * cos(((2 * PI) / 356) * J));

      };

      /*
        Allen (1998) eq. 24

        d [rad] Solar declination
        J [#]   Day of year (1 - 366)
      */

      var d = function (J) {
        
        return 0.409 * sin((((2 * PI) / 365) * J) - 1.39);

      };

      /*
        Allen (1998) eq. 25

        ws  [rad]             Sunset hour angle
        j   [decimal degree]  Latitude
        d   [rad]             Solar declination
      */

      var ws = function (j, d) {

        return acos(-tan(rad(j)) * tan(d));

      };


      /*
        Allen (1998) eq. 21

        R_a   [MJ m-2 day-1]    Extraterrestrial radiation
        Gsc   [MJ m-2 min-1]    Solar constant = 0.0820 
        dr    []                Inverse relative distance Earth-Sun (eq. 23)
        ws    [rad]             Sunset hour angle (eqs. 25 or 26)
        j     [decimal degree]  Latitude
        d     [rad]             Solar declination (eq. 24)
      */

      var R_a = function (dr, ws, j, d, unit) {

        if (unit !== 'mj' && unit !== 'mm')
          unit = 'mj';
          
        var Gsc = 0.0820;
        var R_a = ((24 * 60) / PI) * Gsc * dr * ((ws * sin(rad(j)) * sin(d)) + (cos(rad(j)) * cos(d) * sin(ws)));
        
        return (unit === 'mj') ? R_a : R_a * 0.408;

      };

      /*
        Hargreaves & Samani (1985)

        R_s   [MJ m-2 day-1]  Solar or shortwave radiation
        R_a   [MJ m-2 day-1]  Extraterrestrial radiation
        T_mn  [°C]            Minimum temperature
        T_mx  [°C]            Maximum temperature
      */

      var R_s = function (R_a, T_mn, T_mx) {

        var TD = (T_mx - T_mn) <= 0 ? 1 : (T_mx - T_mn)
          /* Samani, Z., 2000. Estimating Solar Radiation and Evapotranspiration Using Minimum Climatological Data.
            J. of Irrig. and Drain. Engrg., ASCE, 126(4), 265-267. */ 
          , K_T = 0.00185 * pow(TD, 2) - 0.0433 * TD + 0.4023 // 0.162 - 0.190 
          ;

        return R_a * K_T * sqrt(TD);

      };

      /*
        Allen (1998) eq. 34

        N   [hour]  Maximum possible duration of sunshine or daylight hours
        ws  [rad]   Sunset hour angle in radians
      */

      var N = function (ws) {
        
        return (24 / PI) * ws;

      };

      /*
        PAR [MJ m-2 day-1]  Photosynthetically active radiation
        R_s [MJ m-2 day-1]  Solar or shortwave radiation
      */

      var PAR = function (R_s) {
        
        /* 0.45, .., 0.5 ? */ 
        return 0.5 * R_s;

      };

      /*
        Johnson (2013) eq. 2.8

        PPF [μmol (photons) m-2 day-1]  Photosynthetic photon flux
        PAR [J m-2 day-1]               Photosynthetic active ration

        TODO: estimated 0.218 based on location?
      */

      var PPF = function (PAR) { 

        return PAR / 0.218;     

      };

      /*
        Supid (2003) eqs. 4.28a - 4.28d

        Defaults to 0.7 in Johnson (2013).

        f_s   [-]             Fraction of direct solar radiation
        R_s   [MJ m-2 day-1]  Solar or shortwave radiation
        R_a   [MJ m-2 day-1]  Extraterrestrial radiation            
      */

      var f_s = function (R_s, R_a) {

        var f_d = 0 /* Fraction of diffuse solar radiation */
          , T_atm = R_s / R_a /* Fraction of R_s in R_a */
          ;

        if (T_atm <= 0.07)
          f_d = 1;
        else if (0.07 < T_atm && T_atm <= 0.35)
          f_d = 1 - 2.3 * pow(T_atm - 0.07, 2);
        else if (0.35 < T_atm && T_atm <= 0.75)
          f_d = 1.33 - 1.46 * T_atm;
        else if (0.75 < T_atm)
          f_d = 0.23;

        return 1 - f_d;

      };

      /*
        doy   [#]     day of year
        date  [Date]  date object
      */

      var doy = function (date) {

        return ceil((date - (new Date(date.getFullYear(), 0, 1))) / MS_PER_DAY);

      };

      /*
        Rotz (2014)

        Simple estimate of relative humidity if not available in weather data

        rh    [-]   relative humidity
        T_mn  [°C]  minimum temperature
        T_mx  [°C]  maximum temperature
      */

      var rh = function (T_mn, T_mx) {

        return min(1, 1 - exp(-0.2 * (T_mx - T_mn)));

      };

      /*
        Returns arrays with length T_mn.length.

        j           [decimal degree]  latitude
        T_mn        [°C]              array minimum temperature
        T_mx        [°C]              array maximum temperature
        startDate   [date]            string, ISO Format (1995-01-01)
      */

      var solar = function (j, T_mn, T_mx, startDate) {

        /* return value */
        var ret = {
            N: []     /* Maximum possible duration of sunshine or daylight hours [hour] */
          , R_a: []   /* Extraterrestrial radiation [MJ m-2 day-1] */
          , R_s: []   /* Solar or shortwave radiation [MJ m-2 day-1] */
          , PAR: []   /* Photosynthetically active radiation [MJ m-2 day-1] */
          , PPF: []   /* Photosynthetic photon flux [μmol (photons) m-2 day-1] */
          , f_s: []   /* Fraction of direct solar radiation [-] */
          , date: []  /* date string in ISO format */
          , doy: []   /* day of year */
        };

        var _doy, date, dr_, d_, ws_, R_a_, N_, R_s_, PAR_, PPF_, f_s_;

        date = new Date(startDate);
        _doy = doy(date);

        for (var i = 0, is = T_mn.length; i < is; i++) {

          dr_   = dr(_doy);
          d_    = d(_doy);
          ws_   = ws(j, d_);
          R_a_  = R_a(dr_, ws_, j, d_)
          N_    = N(ws_);
          R_s_  = R_s(R_a_, T_mn[i], T_mx[i]);
          PAR_  = PAR(R_s_);
          PPF_  = PPF(PAR_ * 1e6 /* MJ to J */);
          f_s_  = f_s(R_s_, R_a_);

          ret.N[i]    = N_;
          ret.R_a[i]  = R_a_;
          ret.R_s[i]  = R_s_;
          ret.PAR[i]  = PAR_;
          ret.PPF[i]  = PPF_;
          ret.f_s[i]  = f_s_;
          ret.date[i] = date.toISOString().substr(0, 10); /* remove time string */
          ret.doy[i]  = _doy;

          date.setDate(date.getDate() + 1);
          _doy = doy(date);

        }
        
        return ret;
        
      };

      return {
        rh: rh,
        solar: solar
      };

    }())



};
