with(_parent)
{
   _root.attachMovie("mhb","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x + 30;
   _root["zzd" + _root.di]._y = _y;
   var spjl = _root.fj._x - _x;
   var czjl = _root.fj._y - _y;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = zdsd * spjl / jl;
   _root["zzd" + _root.di]._yinc = zdsd * czjl / jl;
   _root.attachMovie("mhb","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x - 30;
   _root["zzd" + _root.di]._y = _y;
   var spjl = _root.fj._x - _x;
   var czjl = _root.fj._y - _y + 60;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = 7 * spjl / jl;
   _root["zzd" + _root.di]._yinc = 7 * czjl / jl;
   _root.attachMovie("mhb","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x;
   _root["zzd" + _root.di]._y = _y;
   var spjl = _root.fj._x - _x;
   var czjl = _root.fj._y - _y - 60;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = 10 * spjl / jl;
   _root["zzd" + _root.di]._yinc = 10 * czjl / jl;
}
