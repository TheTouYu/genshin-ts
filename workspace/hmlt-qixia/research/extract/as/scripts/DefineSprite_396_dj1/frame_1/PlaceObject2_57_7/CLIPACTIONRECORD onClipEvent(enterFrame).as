onClipEvent(enterFrame){
   if(_parent._x > -10)
   {
      _parent._x -= _parent.fxsd;
   }
   else
   {
      _parent.removeMovieClip();
   }
}
