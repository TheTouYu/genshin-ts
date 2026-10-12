onClipEvent(enterFrame){
   if(getProperty(_root.fj, _X) < _parent._x && _parent.ks == 0)
   {
      with(_parent)
      {
         gotoAndPlay(10);
      }
   }
}
