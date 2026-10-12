onClipEvent(enterFrame){
   if(hitTest(_root.fhm1))
   {
      _parent.a -= 2;
      if(_parent.a <= 0)
      {
         with(_parent)
         {
            gotoAndPlay(35);
         }
      }
      else
      {
         with(_parent)
         {
            gotoAndPlay(50);
         }
      }
   }
   if(hitTest(_root.fhm2))
   {
      _parent.a -= 15 * _root.lv;
      if(_parent.a <= 0)
      {
         with(_parent)
         {
            gotoAndPlay(35);
         }
      }
      else
      {
         with(_parent)
         {
            gotoAndPlay(50);
         }
      }
   }
}
