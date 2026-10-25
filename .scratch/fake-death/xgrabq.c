/* xgrabq —— 只读性质的抓取状态查询：尝试 0 时长抓取，立刻释放，打印是否被别人持有。
 * 不改焦点、不改几何、不移动指针；用于判断「点击为什么到不了应用」（有客户端持有 pointer grab 时，
 * 所有点击都会绕过正常投递）。 */
#include <X11/Xlib.h>
#include <stdio.h>
int main( void )
{
    Display *d = XOpenDisplay( NULL );
    Window root;
    int pg, kg;
    if (!d) { fprintf(stderr, "打不开 DISPLAY\n"); return 3; }
    root = DefaultRootWindow( d );
    pg = XGrabPointer( d, root, False, 0, GrabModeAsync, GrabModeAsync, None, None, CurrentTime );
    XUngrabPointer( d, CurrentTime );
    kg = XGrabKeyboard( d, root, False, GrabModeAsync, GrabModeAsync, CurrentTime );
    XUngrabKeyboard( d, CurrentTime );
    XSync( d, False );
    const char *pv[] = { "GrabSuccess", "AlreadyGrabbed", "InvalidTime", "NotViewable", "Frozen" };
    const char *kv[] = { "GrabSuccess", "AlreadyGrabbed", "InvalidTime", "NotViewable", "Frozen" };
    printf( "pointer_grab=%s  keyboard_grab=%s\n",
            (pg >= 0 && pg <= 4) ? pv[pg] : "?", (kg >= 0 && kg <= 4) ? kv[kg] : "?" );
    XCloseDisplay( d );
    return 0;
}
