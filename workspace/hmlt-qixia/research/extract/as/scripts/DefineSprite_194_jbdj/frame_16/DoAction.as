diao = random(10);
if(diao < 3)
{
   _root.attachMovie("pow","pow" + _root.i,_root.i++);
   _root["pow" + _root.i]._x = _X + random(20);
   _root["pow" + _root.i]._y = _Y + random(20);
   gotoAndPlay(21);
}
