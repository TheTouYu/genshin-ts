onClipEvent(enterFrame){
   time = (getTimer() - n) / 1000;
   out = Math.ceil(frame / time);
   frame++;
}
