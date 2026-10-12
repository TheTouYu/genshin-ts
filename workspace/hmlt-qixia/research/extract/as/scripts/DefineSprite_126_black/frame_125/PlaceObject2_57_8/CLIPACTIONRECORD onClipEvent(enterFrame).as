onClipEvent(enterFrame){
   kkk = 0;
   while(kkk < 20)
   {
      if(hitTest("_root.x" + (_root.i - kkk)))
      {
         _parent.a -= _root.zdlv;
         removeMovieClip("_root.x" + (_root.i - kkk));
         if(_parent.a <= 0)
         {
            with(_parent)
            {
               gotoAndPlay(135);
            }
         }
         else
         {
            with(_parent)
            {
               gotoAndPlay(127);
            }
         }
      }
      kkk++;
   }
}
