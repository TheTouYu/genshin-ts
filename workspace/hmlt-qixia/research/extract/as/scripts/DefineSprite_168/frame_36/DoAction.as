with(_parent)
{
   _root.attachMovie("szd3","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x;
   _root["zzd" + _root.di]._y = _y;
   var spjl = _x - _x - 10;
   var czjl = _y - _y;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = 9 * spjl / jl;
   _root["zzd" + _root.di]._yinc = 9 * czjl / jl;
}
