onClipEvent(enterFrame){
   if(_root.neng < 10)
   {
      removeMovieClip(_root.powerc);
   }
   if(_root.pass == 1)
   {
      _root.neng = 0;
   }
}
