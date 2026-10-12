onClipEvent(enterFrame){
   if(hitTest(_root.bom1))
   {
      _parent.a -= 5;
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
