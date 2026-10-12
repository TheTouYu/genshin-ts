onClipEvent(enterFrame){
   if(_root.pass == 1)
   {
      _parent.removeMovieClip();
   }
   if(_root.life < 0)
   {
      _parent.removeMovieClip();
   }
}
