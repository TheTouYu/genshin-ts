a++;
if(hitTest(_root.fj.bbbb))
{
   if(_root.bomm < 8)
   {
      s.start();
      gotoAndPlay(16);
   }
   else
   {
      s.start();
      _root.soc += 100;
      removeMovieClip(this);
   }
}
if(a > 60)
{
   removeMovieClip(this);
}
if(_root.pass == 1)
{
   removeMovieClip(this);
}
if(_Y < yy)
{
   _Y = _Y + 1;
}
if(yy < _Y)
{
   _Y = _Y - 1;
}
if(_X < xx)
{
   _X = _X + 1;
}
if(xx < _X)
{
   _X = _X - 1;
}
gotoAndPlay(2);
