_root.attachMovie("bom1","bom1" + _root.i,_root.i++);
_root["bom1" + _root.i]._x = _X + random(10) + 5;
_root["bom1" + _root.i]._y = _Y - random(10) + 5;
_root.attachMovie("pow","pow" + _root.i,_root.i++);
_root["pow" + _root.i]._x = _X + random(20);
_root["pow" + _root.i]._y = _Y + random(20);
