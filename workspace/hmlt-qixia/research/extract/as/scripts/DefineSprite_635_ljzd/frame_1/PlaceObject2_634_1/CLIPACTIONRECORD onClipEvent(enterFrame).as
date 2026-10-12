onClipEvent(enterFrame){
   with(_parent)
   {
      _x += _xinc;
      _y += _yinc;
      if(_x < -20 || _x > 570 || _y < -20 || _y > 470)
      {
         removeMovieClip(this);
      }
   }
}
