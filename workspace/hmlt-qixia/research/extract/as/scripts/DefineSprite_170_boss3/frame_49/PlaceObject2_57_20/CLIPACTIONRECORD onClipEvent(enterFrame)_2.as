onClipEvent(enterFrame){
   if(hitTest(_root.bom1))
   {
      if(_root.xr == 0)
      {
         _parent.a -= 40;
      }
      if(_root.xr == 1)
      {
         _parent.a -= 40;
      }
      if(_root.xr == 2)
      {
         _parent.a -= 30;
      }
      if(_root.xr == 3)
      {
         _parent.a -= 35;
      }
      if(_root.xr == 4)
      {
         _parent.a -= 40;
      }
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
