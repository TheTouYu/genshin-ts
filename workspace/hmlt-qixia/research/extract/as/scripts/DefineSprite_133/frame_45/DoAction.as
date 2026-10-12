with(_parent)
{
   xx = random(150) + 220;
   yy = random(140) + 50;
   xx1 = random(150) + 220;
   yy1 = random(140) + 50;
   xx2 = random(150) + 220;
   yy2 = random(140) + 50;
   _root.attachMovie("hzzfdj","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = xx;
   _root["zzd" + _root.di]._y = yy;
   _root.attachMovie("hzzfdj","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = xx1;
   _root["zzd" + _root.di]._y = yy1;
   _root.attachMovie("hzzfdj","zzd" + _root.di,_root.di++);
   _root["zzd" + _root.di]._x = xx2;
   _root["zzd" + _root.di]._y = yy2;
}
