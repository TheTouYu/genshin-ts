onClipEvent(keyDown){
   with(_parent)
   {
      if(Key.isDown(65))
      {
         gotoAndPlay(5);
      }
      if(Key.isDown(68))
      {
         gotoAndPlay(15);
      }
      if(Key.isDown(74))
      {
         _root.xr = 2;
         with(_parent)
         {
            _root.ps = 65;
            play();
         }
      }
   }
}
