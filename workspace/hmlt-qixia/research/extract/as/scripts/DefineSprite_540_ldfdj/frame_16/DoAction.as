aa = Math.abs(_X - (getProperty(_root.fj, _X) - fudaix)) / sd;
bb = Math.abs(_Y - (getProperty(_root.fj, _Y) - fudaiy)) / sd;
if(_X < getProperty(_root.fj, _X) - fudaix)
{
   _X = _X + aa;
}
else
{
   _X = _X - aa;
}
if(_Y < getProperty(_root.fj, _Y) - fudaiy)
{
   _Y = _Y + bb;
}
else
{
   _Y = _Y - bb;
}
if(_root.lv == 1)
{
   removeMovieClip(this);
}
if(_root.neng >= _root.ps)
{
   gotoAndStop(45);
}
