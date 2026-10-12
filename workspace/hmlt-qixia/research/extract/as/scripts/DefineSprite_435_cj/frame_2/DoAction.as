_X = _X - _root.bjsd;
if(_root.fangxiang == 1)
{
   if(_Y < 128)
   {
      _Y = _Y + 2;
   }
}
if(_root.fangxiang == 2)
{
   if(_Y > 108)
   {
      _Y = _Y - 2;
   }
}
if(_X <= -1092)
{
   if(_root.bjgs == 0)
   {
      _root.bjgs = 1;
      _root.attachMovie("cj","cj" + _root.bj,_root.bj++);
      _root["cj" + _root.bj]._x = _X + 1490;
      _root["cj" + _root.bj]._y = _Y;
   }
}
if(_X <= -1500)
{
   _root.bjgs = 0;
   removeMovieClip(this);
}
if(_root.bj > 5)
{
   _root.bj = 0;
}
if(_root.pass == 1)
{
   removeMovieClip(this);
}
