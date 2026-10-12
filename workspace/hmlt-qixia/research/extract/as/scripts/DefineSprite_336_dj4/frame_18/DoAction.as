b = random(2);
if(b == 0)
{
   _root.attachMovie("bs","bs" + _root.i,_root.i++);
   _root["bs" + _root.i]._x = _X + random(10) + 5;
   _root["bs" + _root.i]._y = _Y - random(50) + 50;
}
