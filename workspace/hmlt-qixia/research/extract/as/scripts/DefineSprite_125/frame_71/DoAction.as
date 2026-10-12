with(_parent)
{
   _root.attachMovie("mhb","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x - 20;
   _root["zzd" + _root.di]._y = _y - 10;
   var spjl = _root.fj._x - _x;
   var czjl = _root.fj._y - _y;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = 8 * spjl / jl;
   _root["zzd" + _root.di]._yinc = 8 * czjl / jl;
}
