/* xsendkey —— 只向指定 X 窗口投递合成 KeyPress/KeyRelease（XSendEvent），
 * 不动焦点、不动指针、不碰桌面其它窗口。用于「排空模式下输入通道是否仍通」的离线验证。 */
#include <X11/Xlib.h>
#include <X11/keysym.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main( int argc, char **argv )
{
    Display *dpy;
    Window win;
    const char *text;
    int i;

    if (argc < 3) { fprintf( stderr, "用法: %s <win-id 0x..> <text>\n", argv[0] ); return 2; }
    win = (Window)strtoul( argv[1], NULL, 0 );
    text = argv[2];
    if (!(dpy = XOpenDisplay( NULL ))) { fprintf( stderr, "打不开 DISPLAY\n" ); return 3; }

    for (i = 0; text[i]; i++)
    {
        KeySym ks = (text[i] >= 'a' && text[i] <= 'z') ? XK_a + (text[i] - 'a') : (KeySym)text[i];
        XKeyEvent ev = {0};

        ev.display = dpy; ev.window = win; ev.root = DefaultRootWindow( dpy );
        ev.subwindow = None; ev.time = CurrentTime; ev.x = ev.y = 1; ev.x_root = ev.y_root = 1;
        ev.same_screen = True; ev.keycode = XKeysymToKeycode( dpy, ks ); ev.state = 0;

        ev.type = KeyPress;   XSendEvent( dpy, win, True, KeyPressMask,   (XEvent *)&ev );
        XFlush( dpy ); usleep( 20000 );
        ev.type = KeyRelease; XSendEvent( dpy, win, True, KeyReleaseMask, (XEvent *)&ev );
        XFlush( dpy ); usleep( 20000 );
    }
    XCloseDisplay( dpy );
    printf( "sent %zu keys to 0x%lx\n", strlen( text ), win );
    return 0;
}
