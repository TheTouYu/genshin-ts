ii = 0;
while(ii < 1)
{
   _root.attachMovie("dj1","dj1" + _root.i,_root.i++);
   _root["dj1" + _root.i]._x = 450;
   _root["dj1" + _root.i]._y = random(150) + 40;
   ii++;
}
