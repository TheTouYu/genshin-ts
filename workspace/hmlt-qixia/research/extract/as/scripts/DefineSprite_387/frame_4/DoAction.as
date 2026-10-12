aa = random(2);
if(aa == 0)
{
   _root.attachMovie("xkl","dj3" + _root.i,_root.i++);
   _root["dj3" + _root.i]._x = xx;
   _root["dj3" + _root.i]._y = yy;
   yy = random(200) + 20;
   xx = random(50) + 400;
   _root.attachMovie("xkl","dj3" + _root.i,_root.i++);
   _root["dj3" + _root.i]._x = xx1;
   _root["dj3" + _root.i]._y = yy1;
   yy1 = random(200) + 20;
   xx1 = random(50) + 400;
}
else
{
   _root.attachMovie("xkl","dj3" + _root.i,_root.i++);
   _root["dj3" + _root.i]._x = xx;
   _root["dj3" + _root.i]._y = yy;
   yy = random(200) + 20;
   xx = random(50) + 400;
}
