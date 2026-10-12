if(hitTest(_root.fj.bbbb))
{
   if(_root.lv < 5)
   {
      s.start();
      gotoAndPlay(16);
   }
   else
   {
      s.start();
      _root.soc += 1000;
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
