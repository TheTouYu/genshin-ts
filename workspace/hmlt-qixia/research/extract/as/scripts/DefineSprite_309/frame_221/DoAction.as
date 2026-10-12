with(_parent)
{
   _root.attachMovie("szd","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x;
   _root["zzd" + _root.di]._y = _y;
   var spjl = xxx - _x;
   var czjl = yyy - _y + 70;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = 6 * spjl / jl;
   _root["zzd" + _root.di]._yinc = 4 * czjl / jl;
   _root.attachMovie("szd","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = _x;
   _root["zzd" + _root.di]._y = _y;
   var spjl = xxx - _x;
   var czjl = yyy - _y;
   var jl = Math.sqrt(spjl * spjl + czjl * czjl);
   _root["zzd" + _root.di]._xinc = 6 * spjl / jl;
   _root["zzd" + _root.di]._yinc = 4 * czjl / jl;
}
xxx = random(350) + 20;
yyy = random(200) + 20;
