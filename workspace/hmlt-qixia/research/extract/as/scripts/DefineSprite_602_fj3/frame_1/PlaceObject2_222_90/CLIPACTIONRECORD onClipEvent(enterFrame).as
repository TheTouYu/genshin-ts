onClipEvent(enterFrame){
   if(Key.isDown(65) && _parent._x > 25 && _root.dong == 0)
   {
      _parent._x -= 6;
   }
   if(Key.isDown(68) && _parent._x < 373 && _root.dong == 0)
   {
      _parent._x += 6;
   }
   if(Key.isDown(87) && _parent._y > 34 && _root.dong == 0)
   {
      _root.fangxiang = 1;
      _parent._y -= 5;
   }
   else
   {
      _root.fangxiang = 0;
   }
   if(Key.isDown(83) && _parent._y < 220 && _root.dong == 0)
   {
      _root.fangxiang = 2;
      _parent._y += 5;
   }
}
