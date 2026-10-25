/* xexpose —— 只向指定窗口发一次「重绘请求」（XClearArea expose=True，或合成 Expose 事件）。
 * 不改窗口状态、不动焦点、不改几何：用来判别「定格是因为没人要求它重绘」还是「它收到了也不画」。 */
#include <X11/Xlib.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main( int argc, char **argv )
{
    Display *dpy; Window win; int mode = 0;
    if (argc < 2) { fprintf(stderr, "用法: %s <win-id 0x..> [--clear]\n", argv[0]); return 2; }
    win = (Window)strtoul( argv[1], NULL, 0 );
    if (argc > 2 && !strcmp( argv[2], "--clear" )) mode = 1;
    if (!(dpy = XOpenDisplay( NULL ))) { fprintf(stderr, "打不开 DISPLAY\n"); return 3; }
    if (mode)
    {
        XClearArea( dpy, win, 0, 0, 0, 0, True );      /* 整窗标脏 → 服务器发 Expose */
        printf( "XClearArea(expose=True) → 0x%lx\n", win );
    }
    else
    {
        XEvent ev; memset( &ev, 0, sizeof(ev) );
        ev.xexpose.type = Expose; ev.xexpose.display = dpy; ev.xexpose.window = win;
        ev.xexpose.x = 0; ev.xexpose.y = 0; ev.xexpose.width = 1; ev.xexpose.height = 1; ev.xexpose.count = 0;
        XSendEvent( dpy, win, False, ExposureMask, &ev );
        printf( "XSendEvent(Expose) → 0x%lx\n", win );
    }
    XFlush( dpy ); XSync( dpy, False ); XCloseDisplay( dpy );
    return 0;
}
