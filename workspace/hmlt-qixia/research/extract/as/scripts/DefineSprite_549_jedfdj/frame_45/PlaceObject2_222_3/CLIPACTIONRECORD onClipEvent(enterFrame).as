onClipEvent(enterFrame){
   if(_root.neng < _root.ps)
   {
      with(_parent)
      {
         play();
      }
   }
   else
   {
      with(_parent)
      {
         stop();
      }
   }
}
