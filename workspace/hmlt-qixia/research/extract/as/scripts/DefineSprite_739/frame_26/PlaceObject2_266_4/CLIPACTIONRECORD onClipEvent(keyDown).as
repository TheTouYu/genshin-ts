onClipEvent(keyDown){
   with(_parent)
   {
      if(Key.isDown(87))
      {
         gotoAndPlay(20);
      }
      if(Key.isDown(83))
      {
         gotoAndPlay(15);
      }
      if(Key.isDown(68))
      {
         gotoAndPlay(30);
      }
      if(Key.isDown(65))
      {
         gotoAndPlay(15);
      }
      if(Key.isDown(74))
      {
         if(_root.screen == 0)
         {
            _quality = "high";
         }
      }
   }
}
