/* xwmask —— 打印窗口的 event mask / 映射状态 / 焦点。用于判断「点击为什么到不了应用」。 */
#include <X11/Xlib.h>
#include <stdio.h>
#include <stdlib.h>
int main( int argc, char **argv )
{
    Display *d; Window w, focus; int revert;
    XWindowAttributes a;
    if (argc < 2) { fprintf(stderr, "用法: %s <win-id>\n", argv[0]); return 2; }
    if (!(d = XOpenDisplay(NULL))) return 3;
    w = (Window)strtoul(argv[1], NULL, 0);
    if (!XGetWindowAttributes(d, w, &a)) { fprintf(stderr, "XGetWindowAttributes 失败\n"); return 4; }
    XGetInputFocus(d, &focus, &revert);
    printf("win=0x%lx class=%s map_state=%s override=%d\n", w,
           a.class == InputOutput ? "InputOutput" : "InputOnly",
           a.map_state == IsViewable ? "IsViewable" : (a.map_state == IsUnmapped ? "IsUnmapped" : "IsUnviewable"),
           a.override_redirect);
    printf("  geometry=%dx%d+%d+%d border=%d depth=%d\n", a.width, a.height, a.x, a.y, a.border_width, a.depth);
    printf("  your_event_mask=0x%lx all_event_masks=0x%lx do_not_propagate=0x%lx\n",
           a.your_event_mask, a.all_event_masks, a.do_not_propagate_mask);
    printf("  focus=0x%lx revert=%d  (ButtonPressMask=%d KeyPressMask=%d ExposureMask=%d)\n",
           focus, revert,
           !!(a.your_event_mask & ButtonPressMask), !!(a.your_event_mask & KeyPressMask),
           !!(a.your_event_mask & ExposureMask));
    XCloseDisplay(d);
    return 0;
}
