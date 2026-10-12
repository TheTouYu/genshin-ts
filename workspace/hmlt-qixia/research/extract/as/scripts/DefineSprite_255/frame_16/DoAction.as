ii = 0;
while(ii < 2)
{
   _root.attachMovie("dxdd","dj1" + _root.i,_root.i++);
   ddwz = random(170) + 200;
   _root["dj1" + _root.i]._x = ddwz;
   _root["dj1" + _root.i]._y = 320;
   ii++;
}
