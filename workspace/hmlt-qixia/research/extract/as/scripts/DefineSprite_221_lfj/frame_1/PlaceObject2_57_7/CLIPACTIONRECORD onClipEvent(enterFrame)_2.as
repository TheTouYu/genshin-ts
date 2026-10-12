onClipEvent(enterFrame){
   if(hitTest(_root.bom1))
   {
      if(_root.xr == 0)
      {
         _parent.a -= 50;
      }
      if(_root.xr == 1)
      {
         _parent.a -= 200;
      }
      if(_root.xr == 2)
      {
         _parent.a -= 30;
      }
      if(_root.xr == 3)
      {
         _parent.a -= 40;
      }
      if(_root.xr == 4)
      {
         _parent.a -= 60;
      }
      if(_parent.a <= 0)
      {
         with(_parent)
         {
            gotoAndPlay(10);
         }
      }
   }
}
