onClipEvent(enterFrame){
   if(hitTest(_root.fhm1))
   {
      _parent.a -= 2;
      if(_parent.a <= 0)
      {
         with(_parent)
         {
            gotoAndPlay(85);
         }
      }
      else
      {
         with(_parent)
         {
            gotoAndPlay(77);
         }
      }
   }
   if(hitTest(_root.fhm2))
   {
      _parent.a -= 30 * _root.lv;
      if(_parent.a <= 0)
      {
         with(_parent)
         {
            gotoAndPlay(85);
         }
      }
      else
      {
         with(_parent)
         {
            gotoAndPlay(77);
         }
      }
   }
}
