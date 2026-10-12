onClipEvent(keyDown){
   with(_parent)
   {
      if(Key.isDown(68))
      {
         gotoAndPlay(5);
      }
      if(Key.isDown(65))
      {
         gotoAndPlay(20);
      }
      if(Key.isDown(74))
      {
         _root.xr = 0;
         with(_parent)
         {
            _root.ps = 70;
            play();
         }
      }
   }
}
