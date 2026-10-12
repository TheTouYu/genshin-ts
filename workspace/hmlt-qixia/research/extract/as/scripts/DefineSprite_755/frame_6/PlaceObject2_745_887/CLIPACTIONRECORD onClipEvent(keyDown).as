onClipEvent(keyDown){
   with(_parent)
   {
      if(Key.isDown(65))
      {
         gotoAndPlay(1);
      }
      if(Key.isDown(68))
      {
         gotoAndPlay(10);
      }
      if(Key.isDown(74))
      {
         _root.xr = 1;
         with(_parent)
         {
            _root.ps = 65;
            play();
         }
      }
   }
}
