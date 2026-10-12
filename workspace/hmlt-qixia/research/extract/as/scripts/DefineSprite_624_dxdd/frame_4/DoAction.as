if(hitTest(_root.fj.aaaa))
{
   _root.dong = 1;
   gotoAndPlay(25);
}
if(_root.dong == 2)
{
   removeMovieClip(this);
}
if(hitTest(_root.fhm))
{
   gotoAndPlay(25);
}
if(hitTest(_root.fhm1))
{
   gotoAndPlay(25);
}
if(hitTest(_root.bom1))
{
   gotoAndPlay(25);
}
if(_root.pass == 1)
{
   removeMovieClip(this);
}
if(yy < _Y)
{
   _Y = _Y - spp;
}
else
{
   gotoAndPlay(15);
}
gotoAndPlay(2);
