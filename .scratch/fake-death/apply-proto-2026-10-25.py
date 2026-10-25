#!/usr/bin/env python3
"""2026-10-25 原型构建：把 wine-src 的 winex11.drv 改成「原件默认行为 + 中性仪表 + 可选修法A」
幂等：重复运行结果一致（第二次起找不到锚点就直接报错退出）。
"""
import re, sys, pathlib

root = pathlib.Path('/home/h/genshin-ts/.scratch/fake-death/wine-src/dlls/winex11.drv')
ev = root / 'event.c'
src = ev.read_text(encoding='utf-8')
orig = src

# ---------------------------------------------------------------- 1) ProcessEvents
start = src.index('BOOL X11DRV_ProcessEvents( DWORD mask )')
end = src.index('\n}\n', start) + 3
old_fn = src[start:end]

new_fn = r'''BOOL X11DRV_ProcessEvents( DWORD mask )
{
    static const INPUT input = { .type = INPUT_MOUSE, .mi.dwFlags = MOUSEEVENTF_MOVE_NOCOALESCE };
    struct x11drv_thread_data *data = x11drv_thread_data();
    struct proc_stats st;
    XEvent event;
    int count = 0, matched = 0;
    BOOL nested, drain;

    if (!data) return FALSE;
    nested = (data->current_event != NULL);
    if (nested) mask = 0;  /* don't process nested events */

    st.mask = (ULONG_PTR)(UINT_PTR)mask;
    st.scans = 0;
    drain = !nested && probe_drain_enabled();

    if (drain)
    {
        /* 修法 A（2026-10-25 原型）：**整条排空**队列逐条分发，不再「只取匹配 mask 的事件」。
         * 原件把不匹配的事件留在队列里，而 XCheckIfEvent 每次都从队头线性扫到第一个匹配项：
         * 队列积压 × 高频调用 = O(N²)。排空后队列为空，之后每次调用零扫描（O(1)）。 */
        while (XCheckIfEvent( data->display, &event, probe_take_any_event, (char *)&st ))
        {
            if (filter_event( data->display, &event, (char *)(UINT_PTR)mask )) matched++;
            if (XFilterEvent( &event, None ) || host_window_filter_event( &event )) continue;
            get_event_data( &event );
            call_event_handler( data->display, &event );
            free_event_data( &event );
            count++;
        }
    }
    else
    {
        for (; XCheckIfEvent( data->display, &event, probe_filter_event, (char *)&st ); count++)
        {
            if (XFilterEvent( &event, None ) || host_window_filter_event( &event )) continue;
            get_event_data( &event );
            call_event_handler( data->display, &event );
            free_event_data( &event );
        }
        matched = count;  /* 原件路径取到的必然都是匹配的 */
    }

    XFlush( gdi_display );
    if (count) TRACE( "processed %d events\n", count );
    NtUserSendHardwareInput( NULL, SEND_HWMSG_RAWINPUT, &input, 0 ); /* flush win32u accumulated motion */

    probe_proc_window( &st, count, matched, drain );

    if (drain)
    {
        /* 队列已排空：报告「已排空」，让 win32u 清 QS_DRIVER 并重新武装 fd 轮询。
         * 若 socket 上还有没读进来的数据就返回 FALSE（下一轮再排）。 */
        if (check_fd_events( ConnectionNumber( data->display ), POLLIN )) return FALSE;
        XFlush( data->display );
        return TRUE;
    }

    if (mask != QS_ALLINPUT || check_fd_events( ConnectionNumber( data->display ), POLLIN )) return FALSE;
    XFlush( data->display ); /* all events have been processed, flush any pending request */
    return TRUE;
}
'''

probe_code = r'''/* ---- 本地仪表 + 原型（2026-10-25, genshin fake-death）--------------------
 * 背景读数（docs/fake-death-HANDOFF-2026-10-25.md）：卡死态主线程 ~72% CPU 纯用户态自旋，
 * perf 热点 XCheckIfEvent 56.35% + filter_event 11.8%。
 * 本构建只做三件事，**不带开关时与上游 wine 11.14 逐条等价**：
 *   ① 仪表（默认开、行为中性）：每 ~1s 往 /tmp/wine11-proc.log 写一行
 *      calls/scans/events/matched/idle/max/mask/drain。
 *      其中 scans/calls = 平均每次调用扫过多少事件 —— 这是 O(N²) 的直接读数。
 *   ② 修法 A（默认关）：/tmp/.winex11-drain 存在即生效 —— 排空队列（见函数内注释）。
 *   ③ 其它实验开关都不在本函数：见 focus_out() 的 marker。
 */
struct proc_stats
{
    ULONG_PTR mask;
    int scans;
};

static Bool probe_filter_event( Display *display, XEvent *event, char *arg )
{
    struct proc_stats *st = (struct proc_stats *)arg;

    st->scans++;
    return filter_event( display, event, (char *)(UINT_PTR)st->mask );
}

static Bool probe_take_any_event( Display *display, XEvent *event, char *arg )
{
    struct proc_stats *st = (struct proc_stats *)arg;

    st->scans++;
    return True;
}

static BOOL probe_drain_enabled(void)
{
    static BOOL cached;
    static ULONGLONG last_check;
    struct timespec ts;
    ULONGLONG now;

    clock_gettime( CLOCK_MONOTONIC, &ts );
    now = (ULONGLONG)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
    if (!last_check || now - last_check >= 500)
    {
        cached = (access( "/tmp/.winex11-drain", F_OK ) == 0);
        last_check = now;
    }
    return cached;
}

static void probe_proc_window( struct proc_stats *st, int events, int matched, BOOL drain )
{
    static ULONGLONG window_start;
    static unsigned int calls, scans, events_total, matched_total, idle_calls, max_scan;
    struct timespec ts;
    ULONGLONG now;
    int fd, n;
    char buf[256];

    clock_gettime( CLOCK_MONOTONIC, &ts );
    now = (ULONGLONG)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;

    calls++;
    scans += st->scans;
    events_total += events;
    matched_total += matched;
    if (st->scans > 0 && matched == 0) idle_calls++;
    if ((unsigned int)st->scans > max_scan) max_scan = st->scans;

    if (!window_start) window_start = now;
    if (now - window_start < 1000) return;

    if ((fd = open( "/tmp/wine11-proc.log", O_WRONLY | O_CREAT | O_APPEND, 0644 )) >= 0)
    {
        n = snprintf( buf, sizeof(buf),
                      "t=%llu pid=%d calls=%u scans=%u events=%u matched=%u idle=%u max=%u mask=0x%x drain=%d\n",
                      (unsigned long long)now, (int)getpid(), calls, scans, events_total, matched_total,
                      idle_calls, max_scan, (unsigned int)st->mask, (int)drain );
        if (n > 0) write( fd, buf, n );
        close( fd );
    }
    window_start = now;
    calls = scans = events_total = matched_total = idle_calls = max_scan = 0;
}

'''

anchor = '/***********************************************************************\n *           ProcessEvents   (X11DRV.@)\n */\n'
assert anchor in src, 'ProcessEvents 注释锚点没找到（可能已改过）'
src = src.replace(anchor, probe_code + anchor, 1)
src = src.replace(old_fn, new_fn, 1)

# ---------------------------------------------------------------- 2) focus_out 的 WM_CANCELMODE
old_cancel = '''        if (access( "/tmp/.winex11-cancelmode-original", F_OK ) == 0)
        {
            send_message( hwnd, WM_CANCELMODE, 0, 0 );
        }
        else if (access( "/tmp/.winex11-cancelmode-ratelimit", F_OK ) == 0)
        {
            if (cnow - last_cancel >= 500)
            {
                last_cancel = cnow;
                send_message( hwnd, WM_CANCELMODE, 0, 0 );
            }
        }
        /* 默认：不发（切断 focus_out -> 应用抢焦点 -> 再 focus_out 的反馈环） */'''
new_cancel = '''        /* 默认 = 上游原件行为（每次失焦都发）。实验开关（存在即生效）：
         *   /tmp/.winex11-suppress-cancelmode  -> 不发（2026-10-20 F2 版的默认行为）
         *   /tmp/.winex11-cancelmode-ratelimit -> 每 500ms 最多发一次 */
        if (access( "/tmp/.winex11-suppress-cancelmode", F_OK ) == 0)
        {
            /* 不发：切断 focus_out -> 应用抢前台 -> 再 focus_out 的反馈环（A/B 用） */
        }
        else if (access( "/tmp/.winex11-cancelmode-ratelimit", F_OK ) == 0)
        {
            if (cnow - last_cancel >= 500)
            {
                last_cancel = cnow;
                send_message( hwnd, WM_CANCELMODE, 0, 0 );
            }
        }
        else
        {
            send_message( hwnd, WM_CANCELMODE, 0, 0 );
        }'''
assert old_cancel in src, 'WM_CANCELMODE 块锚点没找到'
src = src.replace(old_cancel, new_cancel, 1)

# ---------------------------------------------------------------- 3) fg 复位改 opt-in
old_fg = '''    if (hwnd == NtUserGetForegroundWindow() && access( "/tmp/.winex11-fg-reset-off", F_OK ))'''
new_fg = '''    if (hwnd == NtUserGetForegroundWindow() && access( "/tmp/.winex11-fg-reset", F_OK ) == 0)'''
assert old_fg in src, 'fg 复位块锚点没找到'
src = src.replace(old_fg, new_fg, 1)
src = src.replace('     * 开关：/tmp/.winex11-fg-reset-off 存在则关闭（默认开）。 */',
                  '     * 开关：/tmp/.winex11-fg-reset 存在才做（默认关 = 原件行为）。 */', 1)

assert src != orig
ev.write_text(src, encoding='utf-8')
print('patched:', ev, len(orig), '->', len(src), 'bytes')
