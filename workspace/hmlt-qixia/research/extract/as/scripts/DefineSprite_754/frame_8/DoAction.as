if(Key.isDown(87))
{
   if(Key.isDown(32))
   {
      gotoAndPlay(10);
   }
}
if(Key.isDown(74))
{
   a = random(4);
   _root.xr = a;
   with(_parent._parent)
   {
      play();
   }
}
gotoAndPlay(1);
