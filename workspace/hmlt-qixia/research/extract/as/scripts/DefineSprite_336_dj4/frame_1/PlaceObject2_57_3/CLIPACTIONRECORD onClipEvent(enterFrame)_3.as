onClipEvent(enterFrame){
   if(hitTest(_root.fhm1))
   {
      _parent.a -= 2;
      if(_parent.a <= 0)
      {
         with(_parent)
         {
            gotoAndPlay(10);
         }
      }
      else
      {
         with(_parent)
         {
            gotoAndPlay(3);
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
            gotoAndPlay(10);
         }
      }
      else
      {
         with(_parent)
         {
            gotoAndPlay(3);
         }
      }
   }
}
