with(_parent)
{
   _root.attachMovie("szd2","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x;
   _root["zzd" + _root.di]._y = _y + 10;
   var spjl = _root.fj._x - _x;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = 7 * spjl / jl;
   _root.attachMovie("szd2","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x;
   _root["zzd" + _root.di]._y = _y - 10;
   var spjl = _root.fj._x - _x;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = 7 * spjl / jl;
}
