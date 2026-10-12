onClipEvent(enterFrame){
   if(hitTest(_root.bom1))
   {
      if(_root.xr == 0)
      {
         _parent.a -= 20;
      }
      if(_root.xr == 1)
      {
         _parent.a -= 20;
      }
      if(_root.xr == 2)
      {
         _parent.a -= 20;
      }
      if(_root.xr == 3)
      {
         _parent.a -= 20;
      }
      if(_root.xr == 4)
      {
         _parent.a -= 25;
      }
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
