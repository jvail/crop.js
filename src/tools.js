var Tools = {

    texture2KA5: function (sand, clay) {

      var textureClass = ''
        , silt = 100 - (sand * 100 + clay * 100)
        ;

      if ((sand + clay + silt) != 100)
        throw '(sand + clay + silt) != 100: ' + (sand + clay + silt);

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
        textureClass = 'Tt'
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
    texture2lambda: function (sand, clay) {
      return (2.0 * (sand * sand * 0.575)) + (clay * 0.1) + ((1.0 - sand - clay) * 0.35);
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
};
