onClipEvent(enterFrame){
   if(_root.fj._y < _parent._y)
   {
      if(_parent._rotation < 40)
      {
         _parent._rotation += 5;
      }
   }
   else if(_parent._rotation > -15)
   {
      _parent._rotation -= 5;
   }
}
