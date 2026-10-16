/* ys-grabq — 查询 X 服务器当前是否有人持有指针/键盘抓取（非侵入：试抓即放）
   输出两行: 指针抓取码 / 键盘抓取码。0=GrabSuccess(没人抓) 1=AlreadyGrabbed(有人抓着) 3=GrabNotViewable 4=GrabFrozen */
#include <X11/Xlib.h>
#include <stdio.h>
int main(void){
  Display *d = XOpenDisplay(NULL);
  if(!d){ printf("-1\n-1\n"); return 1; }
  Window root = DefaultRootWindow(d);
  int p = XGrabPointer(d, root, False, 0, GrabModeAsync, GrabModeAsync, None, None, CurrentTime);
  if(p == GrabSuccess) XUngrabPointer(d, CurrentTime);
  int k = XGrabKeyboard(d, root, False, GrabModeAsync, GrabModeAsync, CurrentTime);
  if(k == GrabSuccess) XUngrabKeyboard(d, CurrentTime);
  printf("%d\n%d\n", p, k);
  XFlush(d); XCloseDisplay(d);
  return 0;
}
