#include <X11/Xlib.h>
#include <X11/extensions/shape.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc, char**argv){
  Display *d=XOpenDisplay(NULL); if(!d){puts("no display");return 1;}
  Window w=(Window)strtoul(argv[1],0,0);
  int n=0,o=0,i; XRectangle *r;
  r=XShapeGetRectangles(d,w,ShapeBounding,&n,&o);
  printf("  bounding(外形): %d 个矩形 (ordering=%d)\n",n,o);
  for(i=0;i<n&&i<4;i++) printf("     [%d] %ux%u+%d+%d\n",i,r[i].width,r[i].height,r[i].x,r[i].y);
  if(r)XFree(r);
  r=XShapeGetRectangles(d,w,ShapeInput,&n,&o);
  printf("  input(可点区域): %d 个矩形 (ordering=%d)\n",n,o);
  for(i=0;i<n&&i<4;i++) printf("     [%d] %ux%u+%d+%d\n",i,r[i].width,r[i].height,r[i].x,r[i].y);
  if(r)XFree(r);
  XCloseDisplay(d); return 0;
}
