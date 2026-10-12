with(_parent)
{
   _root.attachMovie("mhb","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x;
   _root["zzd" + _root.di]._y = _y + 30;
   var spjl = _root.fj._x - _x;
   var czjl = _root.fj._y - _y + 30;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = zdsd * spjl / jl;
   _root["zzd" + _root.di]._yinc = zdsd * czjl / jl;
   _root.attachMovie("mhb","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x;
   _root["zzd" + _root.di]._y = _y - 30;
   var spjl = _root.fj._x - _x;
   var czjl = _root.fj._y - _y + 30;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = zdsd * spjl / jl;
   _root["zzd" + _root.di]._yinc = zdsd * czjl / jl;
   _root.attachMovie("mhb","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x;
   _root["zzd" + _root.di]._y = _y + 20;
   var spjl = _root.fj._x - _x;
   var czjl = _root.fj._y - _y - 20;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = zdsd * spjl / jl;
   _root["zzd" + _root.di]._yinc = zdsd * czjl / jl;
}
