/*
 * ys-xrec — X 协议记录仪（RECORD 扩展）：把「点击到底有没有进到应用」从推断变成读数
 *
 * 为什么必须存在（2026-10-20）：
 *   「千星编辑器假死」此前只能靠用户真人点一下口头报告；X 层取证手段（ys-grabq）问的是
 *   「有没有 grab」，而 **core X 根本没有查询活动 grab 的请求**（XGrabPointer 只能设/解，
 *   XQueryPointer 只给指针窗口与按键位）⇒ 「无残留 grab」这个结论在原理上不可得。
 *   正确的读法是行为读数：记下 (a) 谁向服务器发了 GrabPointer/UngrabPointer/SetInputFocus…
 *   (b) 目标客户端（按 resource base 识别）实际收到了哪些投递事件。
 *
 * 通道合法性：本工具是**诊断仪器**，不是新的抓帧/注入通道——它不读像素、不产生任何输入，
 *   只用 RECORD 扩展旁路观测。零新依赖（libX11 + libXtst 都是系统库，同 ys-grabq.c 的 -lX11）。
 *
 * 用法：
 *   ys-xrec --out FILE --seconds 8 [--client 0x04000000] [--all]
 *     --client BASE   只记录投递给该客户端（resource base，如 0x04000000）的事件
 *                     （不给 = 记录全服务器的 core 请求 + 设备事件）
 *     --all           请求侧不过滤 opcode（默认只看输入/焦点/窗口管理相关）
 *
 * 输出（TSV，一行一条，便于 grep/awk）：
 *   <wall_ms> <srvtime> <SRC> <kind> <detail...>
 *     SRC = SRV（服务器侧请求/设备事件）| CLI（指定客户端收到的投递事件）
 *     kind = REQ:BUTTON / EV:ButtonPress / ...
 *
 * 编译：gcc -O2 -o ys-xrec ys-xrec.c -lX11 -lXtst
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <poll.h>
#include <X11/Xlib.h>
#include <X11/Xproto.h>
#include <X11/extensions/record.h>

static FILE *out;
static double t0;
static int opt_all = 0;
static unsigned long g_id_base = 0;
static int g_cat = -1;
static unsigned long g_cseq = 0;


static double now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000.0 + ts.tv_nsec / 1e6;
}

/* 只保留「能改变输入路由」的 core 请求。opcode 编号见 X11 协议/ Xproto.h */
static int interesting_opcode(int op) {
    switch (op) {
    case X_GrabPointer: case X_UngrabPointer: case X_GrabButton: case X_UngrabButton:
    case X_ChangeActivePointerGrab: case X_GrabKeyboard: case X_UngrabKeyboard:
    case X_GrabKey: case X_UngrabKey: case X_AllowEvents: case X_GrabServer:
    case X_UngrabServer: case X_WarpPointer: case X_SetInputFocus:
    case X_ChangeWindowAttributes: case X_MapWindow: case X_UnmapWindow:
    case X_ConfigureWindow: case X_DestroyWindow: case X_ChangeProperty:
    case X_ReparentWindow: case X_CirculateWindow:
        return 1;
    default:
        return 0;
    }
}

static const char *opname(int op) {
    switch (op) {
    case X_GrabPointer: return "GrabPointer";
    case X_UngrabPointer: return "UngrabPointer";
    case X_GrabButton: return "GrabButton";
    case X_UngrabButton: return "UngrabButton";
    case X_ChangeActivePointerGrab: return "ChangeActivePointerGrab";
    case X_GrabKeyboard: return "GrabKeyboard";
    case X_UngrabKeyboard: return "UngrabKeyboard";
    case X_GrabKey: return "GrabKey";
    case X_UngrabKey: return "UngrabKey";
    case X_AllowEvents: return "AllowEvents";
    case X_GrabServer: return "GrabServer";
    case X_UngrabServer: return "UngrabServer";
    case X_WarpPointer: return "WarpPointer";
    case X_SetInputFocus: return "SetInputFocus";
    case X_ChangeWindowAttributes: return "ChangeWindowAttributes";
    case X_MapWindow: return "MapWindow";
    case X_UnmapWindow: return "UnmapWindow";
    case X_ConfigureWindow: return "ConfigureWindow";
    case X_DestroyWindow: return "DestroyWindow";
    case X_ChangeProperty: return "ChangeProperty";
    case X_ReparentWindow: return "ReparentWindow";
    case X_CirculateWindow: return "CirculateWindow";
    case X_QueryPointer: return "QueryPointer";
    case X_GetInputFocus: return "GetInputFocus";
    default: return "?";
    }
}

static const char *evname(int t) {
    switch (t) {
    case 2: return "KeyPress";      case 3: return "KeyRelease";
    case 4: return "ButtonPress";   case 5: return "ButtonRelease";
    case 6: return "MotionNotify";  case 7: return "EnterNotify";
    case 8: return "LeaveNotify";   case 9: return "FocusIn";
    case 10: return "FocusOut";     case 11: return "KeymapNotify";
    case 12: return "Expose";       case 13: return "GraphicsExpose";
    case 16: return "CreateNotify"; case 17: return "DestroyNotify";
    case 18: return "UnmapNotify";  case 19: return "MapNotify";
    case 20: return "MapRequest";   case 21: return "ReparentNotify";
    case 22: return "ConfigureNotify"; case 23: return "ConfigureRequest";
    case 24: return "GravityNotify"; case 25: return "ResizeRequest";
    case 28: return "PropertyNotify"; case 29: return "SelectionClear";
    case 31: return "SelectionRequest"; case 32: return "SelectionNotify";
    case 34: return "MappingNotify"; case 35: return "GenericEvent";
    default: return "?";
    }
}

#define U16(p) ((unsigned)(p)[0] | ((unsigned)(p)[1] << 8))
#define U32(p) ((unsigned long)(p)[0] | ((unsigned long)(p)[1] << 8) | \
                ((unsigned long)(p)[2] << 16) | ((unsigned long)(p)[3] << 24))

static void handle_request(unsigned char *d, int src_is_client) {
    int op = src_is_client ? d[0] : d[1];   /* FromClient: data[0]=major opcode */
    if (!opt_all && !interesting_opcode(op)) return;
    fprintf(out, "%.3f base=0x%08lx cat=%d seq=%lu %s REQ:%-22s op=%d len=%u", now_ms() - t0,
            g_id_base, g_cat, g_cseq, src_is_client ? "CLI" : "SRV", opname(op), op, U16(d + 2));
    switch (op) {
    case X_GrabPointer:              /* grab-window(4) eventmask(2) owner(1) ... */
        fprintf(out, " grabwin=0x%08lx evmask=0x%04x owner_events=%d",
                U32(d + 4), U16(d + 8), d[10]);
        break;
    case X_UngrabPointer:            /* time(4) */
        fprintf(out, " time=%lu", U32(d + 4));
        break;
    case X_ChangeActivePointerGrab:  /* cursor(4) time(4) eventmask(2) */
        fprintf(out, " cursor=0x%08lx time=%lu evmask=0x%04x", U32(d + 4), U32(d + 8), U16(d + 12));
        break;
    case X_SetInputFocus:            /* focus(4) revert(1) time(4) */
        fprintf(out, " focus=0x%08lx revert=%d time=%lu", U32(d + 4), d[8], U32(d + 12));
        break;
    case X_WarpPointer:              /* src(4) dst(4) ... */
        fprintf(out, " src=0x%08lx dst=0x%08lx", U32(d + 4), U32(d + 8));
        break;
    case X_ChangeWindowAttributes:   /* window(4) valuemask(4) */
        fprintf(out, " win=0x%08lx mask=0x%08lx", U32(d + 4), U32(d + 8));
        break;
    case X_ConfigureWindow:          /* window(4) mask(2) */
        fprintf(out, " win=0x%08lx mask=0x%04x", U32(d + 4), U16(d + 8));
        break;
    case X_UnmapWindow: case X_MapWindow: case X_DestroyWindow:
        fprintf(out, " win=0x%08lx", U32(d + 4));
        break;
    default:
        break;
    }
    fputc('\n', out);
}

static void handle_event(unsigned char *d, const char *src) {
    int type = d[0] & 0x7f;
    fprintf(out, "%.3f base=0x%08lx cat=%d seq=%lu %s EV:%-16s ", now_ms() - t0,
            g_id_base, g_cat, g_cseq, src, evname(type));
    switch (type) {
    case ButtonPress: case ButtonRelease:
        /* detail(1)=button, time(2), root(4), event(4), child(4), rootx/rooty/eventx/eventy(2) state(2) */
        fprintf(out, "btn=%u time=%lu root=0x%08lx win=0x%08lx child=0x%08lx rootx=%d rooty=%d x=%d y=%d state=0x%04x same_screen=%d",
                d[1], U32(d + 4), U32(d + 8), U32(d + 12), U32(d + 16),
                (short)U16(d + 20), (short)U16(d + 22), (short)U16(d + 24), (short)U16(d + 26),
                U16(d + 28), d[30]);
        break;
    case MotionNotify:
        fprintf(out, " win=0x%08lx rootx=%d rooty=%d x=%d y=%d state=0x%04x",
                U32(d + 12), (short)U16(d + 20), (short)U16(d + 22), (short)U16(d + 24),
                (short)U16(d + 26), U16(d + 28));
        break;
    case EnterNotify: case LeaveNotify:
        /* detail(1) time(2) root(4) event(4) child(4) ... mode(1) same_screen_focus(1) */
        fprintf(out, "detail=%u mode=%u win=0x%08lx child=0x%08lx state=0x%04x",
                d[1], d[31] & 0x0f, U32(d + 12), U32(d + 16), U16(d + 28));
        break;
    case FocusIn: case FocusOut:
        fprintf(out, "detail=%u mode=%u win=0x%08lx",
                d[1], (unsigned)(d[30] & 0x0f), U32(d + 4));
        break;
    case KeyPress: case KeyRelease:
        fprintf(out, "keycode=%u win=0x%08lx state=0x%04x", d[1], U32(d + 12), U16(d + 28));
        break;
    case ConfigureNotify:
        fprintf(out, "win=0x%08lx %dx%d+%d+%d", U32(d + 4), (int)U16(d + 12), (int)U16(d + 14),
                (short)U16(d + 16), (short)U16(d + 18));
        break;
    default:
        fprintf(out, "win=0x%08lx", U32(d + 4));
        break;
    }
    fputc('\n', out);
}

static void data_cb(XPointer p, XRecordInterceptData *d) {
    (void)p;
    if (!d) return;
    g_id_base = (unsigned long)d->id_base;
    g_cat = (int)d->category;
    g_cseq = (unsigned long)d->client_seq;
    if (d->category == XRecordFromServer || d->category == XRecordFromClient) {
        unsigned char *b = (unsigned char *)d->data;
        int n = (int)d->data_len;
        if (n >= 4) {
            int first = b[0] & 0x7f;
            if (d->category == XRecordFromClient) {
                if (!opt_all) { if (!interesting_opcode(b[0])) { XRecordFreeData(d); return; } }
                handle_request(b, 1);
            } else if (first == 0) {
                handle_request(b, 0);
            } else if (first >= 2 && b[0] != 35) {   /* 35 = GenericEvent，单独不解析 */
                handle_event(b, "SRV");
            } else if (b[0] & 0x80) {
                /* 错误包 */
                fprintf(out, "%.3f %lu SRV ERROR code=%u req=%u minor=%u\n",
                        now_ms() - t0, 0, b[1], b[10], b[11]);
            }
        }
    }
    XRecordFreeData(d);
    fflush(out);
}

int main(int argc, char **argv) {
    const char *outpath = NULL;
    double seconds = 8.0;
    const char *client = NULL;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--out") && i + 1 < argc) outpath = argv[++i];
        else if (!strcmp(argv[i], "--seconds") && i + 1 < argc) seconds = atof(argv[++i]);
        else if (!strcmp(argv[i], "--client") && i + 1 < argc) client = argv[++i];
        else if (!strcmp(argv[i], "--all")) opt_all = 1;
        else { fprintf(stderr, "unknown arg %s\n", argv[i]); return 2; }
    }
    if (!outpath) { fprintf(stderr, "usage: ys-xrec --out FILE --seconds N [--client 0x04000000] [--all]\n"); return 2; }

    Display *ctrl = XOpenDisplay(NULL);
    Display *data = XOpenDisplay(NULL);
    if (!ctrl || !data) { fprintf(stderr, "ys-xrec: cannot open display\n"); return 3; }
    int major = 0, minor = 0;
    if (!XRecordQueryVersion(ctrl, &major, &minor)) {
        fprintf(stderr, "ys-xrec: RECORD extension unavailable\n");
        return 3;
    }
    out = fopen(outpath, "w");
    if (!out) { perror("fopen"); return 3; }
    t0 = now_ms();
    fprintf(out, "# ys-xrec record %d.%d start_wall=%ld client=%s all=%d\n",
            major, minor, (long)time(NULL), client ? client : "(all)", opt_all);

    XRecordRange *range = XRecordAllocRange();
    memset(range, 0, sizeof(*range));
    /* 设备事件与 core 请求全收，回调里过滤 */
    range->device_events.first = KeyPress;
    range->device_events.last = MotionNotify;
    range->core_requests.first = 1;
    range->core_requests.last = 127;
    range->errors.first = 0;
    range->errors.last = 255;

    XRecordClientSpec spec[1];
    int nspec = 1;
    if (client) {
        spec[0] = (XRecordClientSpec)strtoul(client, NULL, 0);
    } else {
        spec[0] = XRecordAllClients;
    }
    XRecordContext ctx = XRecordCreateContext(ctrl, 0, spec, nspec, &range, 1);
    if (!ctx) { fprintf(stderr, "ys-xrec: XRecordCreateContext failed\n"); return 3; }
    XSync(ctrl, False);
    if (!XRecordEnableContextAsync(data, ctx, data_cb, NULL)) {
        fprintf(stderr, "ys-xrec: XRecordEnableContextAsync failed\n");
        return 3;
    }
    int fd = ConnectionNumber(data);
    double deadline = now_ms() + seconds * 1000.0;
    while (now_ms() < deadline) {
        struct pollfd pfd = { fd, POLLIN, 0 };
        int r = poll(&pfd, 1, 100);
        if (r > 0) XRecordProcessReplies(data);
        else if (r < 0) break;
        fflush(out);
    }
    XRecordDisableContext(ctrl, ctx);
    XSync(ctrl, False);
    XRecordFreeContext(ctrl, ctx);
    XFree(range);
    fprintf(out, "# end wall=%ld\n", (long)time(NULL));
    fclose(out);
    XCloseDisplay(data);
    XCloseDisplay(ctrl);
    return 0;
}
