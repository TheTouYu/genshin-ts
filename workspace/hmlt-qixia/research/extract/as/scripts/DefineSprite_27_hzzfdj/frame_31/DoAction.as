if(_root.dong == 2)
{
   _root.gs = 0;
   removeMovieClip(this);
}
if(hitTest(_root.fhm))
{
   _root.gs = 0;
   removeMovieClip(this);
}
if(hitTest(_root.fhm1))
{
   _root.gs = 0;
   removeMovieClip(this);
}
if(hitTest(_root.bom1))
{
   _root.gs = 0;
   removeMovieClip(this);
}
if(_root.pass == 1)
{
   _root.gs = 0;
   removeMovieClip(this);
}
_root.attachMovie("szd3","zzd" + _root.di,_root.di++);
_root["zzd" + _root.di]._x = _X;
_root["zzd" + _root.di]._y = _Y;
var spjl = _root.fj._x - _X;
var czjl = _root.fj._y - _Y;
var jl = Math.sqrt(spjl * spjl + czjl * czjl);
_root["zzd" + _root.di]._xinc = 6 * spjl / jl;
_root["zzd" + _root.di]._yinc = 6 * czjl / jl;
