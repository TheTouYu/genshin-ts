if(t1 <= 1)
{
   play();
}
else if(t > 50)
{
   t = 0;
   t1 -= 1;
   gotoAndPlay(2);
}
else
{
   t += 1;
   gotoAndPlay(2);
}
