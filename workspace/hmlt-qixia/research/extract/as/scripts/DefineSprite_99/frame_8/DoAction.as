_root.attachMovie("szd","zzd" + _root.di,_root.di++);
_root["zzd" + _root.di]._x = _X - 10;
_root["zzd" + _root.di]._y = _Y;
var spjl = _root.fj._x - _X;
var czjl = _root.fj._y - _Y;
var jl = Math.sqrt(spjl * spjl + czjl * czjl);
_root["zzd" + _root.di]._xinc = zdsd * spjl / jl;
_root["zzd" + _root.di]._yinc = zdsd * czjl / jl;
