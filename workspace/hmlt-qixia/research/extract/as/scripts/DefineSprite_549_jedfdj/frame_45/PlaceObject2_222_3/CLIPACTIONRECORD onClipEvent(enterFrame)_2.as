onClipEvent(enterFrame){
   _parent._x = getProperty(_root.fj, _X) + 20;
   if(_parent._y < getProperty(_root.fj, _Y) - _parent.fudaiy)
   {
      _parent._y += 4;
   }
   else
   {
      _parent._y -= 4;
   }
}
