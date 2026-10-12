if(_root.xr == 0)
{
   _root.attachMovie("fudaiji","fudai" + _root.i,_root.i++);
   _root["fudai" + _root.i]._x = random(350);
   _root["fudai" + _root.i]._y = random(200);
   _root["fudai" + _root.i]._height = 9.9;
   _root["fudai" + _root.i]._width = 4.8;
}
if(_root.xr == 1)
{
   _root.attachMovie("ldfdj","fudai" + _root.i,_root.i++);
   _root["fudai" + _root.i]._x = random(350);
   _root["fudai" + _root.i]._y = random(200);
   _root["fudai" + _root.i]._height = 9.9;
   _root["fudai" + _root.i]._width = 9.9;
}
if(_root.xr == 2)
{
   _root.attachMovie("jedfdj","fudai" + _root.i,_root.i++);
   _root["fudai" + _root.i]._x = random(350);
   _root["fudai" + _root.i]._y = random(200);
   _root["fudai" + _root.i]._height = 12;
   _root["fudai" + _root.i]._width = 14;
}
_root.lv = 4;
