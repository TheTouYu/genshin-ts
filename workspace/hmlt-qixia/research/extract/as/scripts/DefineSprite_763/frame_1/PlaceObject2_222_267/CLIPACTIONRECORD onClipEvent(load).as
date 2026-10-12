onClipEvent(load){
   with(_parent)
   {
      if(_root.xr == 0)
      {
         gotoAndStop(1);
      }
      if(_root.xr == 1)
      {
         gotoAndStop(5);
      }
      if(_root.xr == 2)
      {
         gotoAndStop(10);
      }
      if(_root.xr == 3)
      {
         gotoAndStop(15);
      }
      if(_root.xr == 4)
      {
         gotoAndStop(20);
      }
   }
}
