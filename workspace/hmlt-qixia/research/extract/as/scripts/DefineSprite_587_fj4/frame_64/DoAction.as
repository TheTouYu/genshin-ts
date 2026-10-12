if(_root.life > 0)
{
   _root.life -= 1;
   _root.attachMovie("die4","die",7999);
   removeMovieClip(this);
}
else
{
   _root.life = -1;
   removeMovieClip(this);
}
