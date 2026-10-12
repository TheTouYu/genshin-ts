onClipEvent(enterFrame){
   if(_root.fangxiang == 0)
   {
      gotoAndStop(1);
   }
   if(_root.fangxiang == 1)
   {
      gotoAndPlay(2);
   }
   if(_root.fangxiang == 2)
   {
      gotoAndPlay(3);
   }
}
