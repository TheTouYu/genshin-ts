aa = Math.abs(_X - (getProperty(_root.fj, _X) - fudaix)) / sd;
bb = Math.abs(_Y - (getProperty(_root.fj, _Y) - fudaiy)) / sd;
if(_X < getProperty(_root.fj, _X) - fudaix)
{
   _X = _X + aa;
}
else
{
   _X = _X - aa;
}
if(_Y < getProperty(_root.fj, _Y) - fudaiy)
{
   _Y = _Y + bb;
}
else
{
   _Y = _Y - bb;
}
if(_root.lv == 1)
{
   removeMovieClip(this);
}
if(_root.neng >= _root.ps)
{
   gotoAndStop(45);
}
_root.attachMovie("ldzd","x" + _root.i,_root.i++);
_root["x" + _root.i]._x = _X + 20;
_root["x" + _root.i]._y = _Y;
_root["x" + _root.i]._height = 10;
_root["x" + _root.i]._width = 20;
var spjl = _X + 10 - _X;
var czjl = _Y - _Y;
var jl = Math.sqrt(spjl * spjl + czjl * czjl);
_root["x" + _root.i]._xinc = zdsd * spjl / jl;
_root["x" + _root.i]._yinc = zdsd * czjl / jl;
