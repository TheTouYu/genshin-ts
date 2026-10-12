onClipEvent(enterFrame){
   if(Key.isDown(75) && _root.dong == 0 && _root.bomm > 0)
   {
      if(_root.yza == 0)
      {
         _root.yza = 1;
         if(_root.yuanzi == 0)
         {
            _root.attachMovie("fanghu","fhm",8001);
            _root.attachMovie("ldbom","bom1",8005);
            _root.bom1._x = _parent._x;
            _root.bom1._y = _parent._y;
         }
      }
   }
   else
   {
      _root.yza = 0;
   }
}
