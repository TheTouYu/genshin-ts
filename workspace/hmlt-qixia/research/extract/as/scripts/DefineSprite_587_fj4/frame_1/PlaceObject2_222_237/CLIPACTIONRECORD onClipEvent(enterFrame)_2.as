onClipEvent(enterFrame){
   if(Key.isDown(74) && _root.dong == 0 && _root.fashez == 0)
   {
      if(_root.fashez == 0)
      {
         if(_root.neng < _root.ps)
         {
            _root.neng++;
         }
         else
         {
            _root.neng = _root.ps;
         }
      }
      if(_root.an == 0)
      {
         _root.an = 1;
         if(_root.lv == 1)
         {
            with(_parent)
            {
               gotoAndPlay(5);
            }
         }
         if(eval("_root:lv") == 2)
         {
            with(_parent)
            {
               gotoAndPlay(15);
            }
         }
         if(eval("_root:lv") == 3)
         {
            with(_parent)
            {
               gotoAndPlay(25);
            }
         }
         if(eval("_root:lv") == 4)
         {
            with(_parent)
            {
               gotoAndPlay(35);
            }
         }
         if(eval("_root:lv") == 5)
         {
            with(_parent)
            {
               gotoAndPlay(45);
            }
         }
      }
   }
   else
   {
      _root.an = 0;
      _root.neng = 0;
   }
}
