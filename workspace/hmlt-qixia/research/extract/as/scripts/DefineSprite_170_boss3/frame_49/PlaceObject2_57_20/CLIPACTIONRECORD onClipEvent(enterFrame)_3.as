onClipEvent(enterFrame){
   if(hitTest(_root.fhm1))
   {
      _parent.a -= 2;
      if(_parent.a <= 0)
      {
         with(_parent)
         {
            gotoAndPlay(60);
         }
      }
      else
      {
         with(_parent)
         {
            gotoAndPlay(51);
         }
      }
   }
   if(hitTest(_root.fhm2))
   {
      _parent.a -= 10 * _root.lv;
      if(_parent.a <= 0)
      {
         with(_parent)
         {
            gotoAndPlay(60);
         }
      }
      else
      {
         with(_parent)
         {
            gotoAndPlay(51);
         }
      }
   }
}
