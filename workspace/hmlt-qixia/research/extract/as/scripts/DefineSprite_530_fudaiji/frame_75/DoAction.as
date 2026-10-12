_root.attachMovie("fdzd","x" + _root.i,_root.i++);
_root["x" + _root.i]._x = _X + 20;
_root["x" + _root.i]._y = _Y;
_root["x" + _root.i]._height = 20;
_root["x" + _root.i]._width = 20;
var spjl = _X + 10 - _X;
if(zdfx == 0)
{
   var czjl = _Y + zdjl - _Y;
}
else
{
   var czjl = _Y - zdjl - _Y;
}
var jl = Math.sqrt(spjl * spjl + czjl * czjl);
_root["x" + _root.i]._xinc = (random(10) + 20) * spjl / jl;
_root["x" + _root.i]._yinc = (random(10) + 20) * czjl / jl;
zdfx = random(2);
zdjl = random(5);
