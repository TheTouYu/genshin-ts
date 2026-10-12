onClipEvent(enterFrame){
   if(Key.isDown(75) && _root.dong == 0 && _root.bomm > 0)
   {
      if(_root.yza == 0)
      {
         _root.yza = 1;
         if(_root.yuanzi == 0)
         {
            _root.attachMovie("fanghu","fhm",8001);
            _root.attachMovie("bom","bom1",8005);
            _root.bom1._x = _parent._x + 60;
            _root.bom1._y = _parent._y;
            _root.bom1._height = 15;
            _root.bom1._width = 15;
         }
      }
   }
   else
   {
      _root.yza = 0;
   }
}
