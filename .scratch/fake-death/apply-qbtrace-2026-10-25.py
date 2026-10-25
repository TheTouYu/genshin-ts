#!/usr/bin/env python3
"""2026-10-25 探针⑦/⑧：win32u 队列位配对日志（QS_PAINT 与 QS_ALLPOSTMESSAGE）+ 探针轮转。

用途：回答「队列位是谁置的、谁清、signal 了却 PeekMessage 产不出消息」。
背景（源码核实，写进 docs/fake-death-HANDOFF-2026-10-25.md）：
  - set_queue_bits/clear_queue_bits 在 server/queue.c（wineserver 进程内）；重启 wineserver 会连坐
    游戏进程（用户令：游戏不动）⇒ 服务端探针不可用，只能在 win32u 侧记「共享内存里看到的位」。
  - 旧探针 400 行/进程封顶已在 2026-10-25 让三路 ntdll 探针在进程启动 19 秒后全部失明 ⇒ 改按字节轮转。

只读、失败静默。幂等：已打过补丁则跳过。
用法：python3 apply-qbtrace-2026-10-25.py [--revert]
"""
import hashlib, os, sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wine-src")

# ---------------------------------------------------------------- message.c helpers
MSG_HELPERS_OLD = '''/* 2026-10-25 只读探针⑥：UI 线程的消息等待入口（MsgWaitForMultipleObjects）。
 * 现场：主线程阻塞在 read(线程唤醒管道)，而 server_wait / NtWait* 两路探针都看不见 ——
 * 说明它走的是这里。记录大等待（timeout==INFINITE 或 >=1000ms）的句柄与 mask。 */
static void mw_note_ra( const char *tag, unsigned long a, unsigned long b, unsigned long c, unsigned long d, unsigned long ra )
{
    static int n2;
    char buf[192]; int fd, len;
    if (n2 >= 400) return;
    n2++;
    len = snprintf( buf, sizeof(buf), "%u %d %s a=%lu b=0x%lx c=0x%lx d=0x%lx ra=0x%lx\\n",
                    (unsigned)getpid(), (int)syscall( SYS_gettid ), tag, a, b, c, d, ra );
    if (len <= 0) return;
    fd = open( "/tmp/wine32u-msgwait.log", O_WRONLY | O_CREAT | O_APPEND, 0666 );
    if (fd < 0) return;
    write( fd, buf, len ); close( fd );
}

static void mw_note( unsigned long count, unsigned long timeout, unsigned long mask,
                     unsigned long h0, unsigned long h1 )
{
    static int notes;
    char buf[192]; int fd, len;
    if (notes >= 400) return;
    notes++;
    len = snprintf( buf, sizeof(buf), "%u %d msgwait count=%lu timeout=0x%lx mask=0x%lx h0=0x%lx h1=0x%lx\\n",
                    (unsigned)getpid(), (int)syscall( SYS_gettid ), count, timeout, mask, h0, h1 );
    if (len <= 0) return;
    fd = open( "/tmp/wine32u-msgwait.log", O_WRONLY | O_CREAT | O_APPEND, 0666 );
    if (fd < 0) return;
    write( fd, buf, len ); close( fd );
}
'''

MSG_HELPERS_NEW = r'''/* 2026-10-25 探针⑥：UI 线程的消息等待入口（MsgWaitForMultipleObjects）。
 * 现场：主线程阻塞在 read(线程唤醒管道)，而 server_wait / NtWait* 两路探针都看不见 —— 它走这里。
 * 2026-10-25 探针⑦：队列位配对日志（QS_PAINT 0x20 / QS_ALLPOSTMESSAGE 0x100）。
 * 源码事实：set_queue_bits/clear_queue_bits 在 server/queue.c（wineserver 内），重启 wineserver 会连坐
 * 游戏进程 ⇒ 客户端只记「共享内存里看到的位」与 peek 的取值/产出/skip，用来判
 * 「位被谁置了没清」与「signal 了却产不出消息」。
 * 两文件都按字节轮转（>8MB 截断重建），不再按行数封顶 —— 400 行上限曾让探针在进程启动 19 秒后失明。 */
static unsigned int probe_ms(void)
{
    return (unsigned int)NtGetTickCount();
}

struct probe_sink { const char *path; int fd; unsigned long written; };
static struct probe_sink probe_sinks[6];

static void probe_write( const char *path, const char *buf, int len )
{
    struct probe_sink *sink = NULL;
    int i;

    if (len <= 0) return;
    for (i = 0; i < 6; i++)
    {
        if (!probe_sinks[i].path) probe_sinks[i].path = path;
        if (probe_sinks[i].path == path) { sink = &probe_sinks[i]; break; }
    }
    if (!sink) return;
    if (sink->fd < 0) sink->fd = open( path, O_WRONLY | O_CREAT | O_APPEND, 0666 );
    if (sink->fd < 0) return;
    if (sink->written > 8u * 1024 * 1024)
    {
        close( sink->fd );
        sink->fd = open( path, O_WRONLY | O_CREAT | O_TRUNC, 0666 );
        sink->written = 0;
        if (sink->fd < 0) return;
    }
    if (write( sink->fd, buf, len ) == len) sink->written += len;
}

static void mw_note_ra( const char *tag, unsigned long a, unsigned long b, unsigned long c, unsigned long d, unsigned long ra )
{
    char buf[224]; int len;
    len = snprintf( buf, sizeof(buf), "%u %u %d %s a=%lu b=0x%lx c=0x%lx d=0x%lx ra=0x%lx\n",
                    probe_ms(), (unsigned)getpid(), (int)syscall( SYS_gettid ), tag, a, b, c, d, ra );
    probe_write( "/tmp/wine32u-msgwait.log", buf, len );
}

static void mw_note_mask( const char *tag, unsigned long count, unsigned long timeout,
                          unsigned long mask, unsigned long h0, unsigned long qb )
{
    char buf[224]; int len;
    len = snprintf( buf, sizeof(buf), "%u %u %d %s count=%lu timeout=0x%lx mask=0x%lx h0=0x%lx qb=0x%lx\n",
                    probe_ms(), (unsigned)getpid(), (int)syscall( SYS_gettid ), tag, count, timeout, mask, h0, qb );
    probe_write( "/tmp/wine32u-msgwait.log", buf, len );
}

/* 共享内存里的队列位（只读）。STATUS_PENDING 是 wine 的「成功」约定（见 check_queue_bits）。 */
static BOOL qbt_bits( UINT *wake, UINT *changed, UINT *internal )
{
    struct object_lock lock = OBJECT_LOCK_INIT;
    const queue_shm_t *queue_shm;
    UINT status;

    *wake = *changed = *internal = 0;
    while ((status = get_shared_queue( &lock, &queue_shm )) == STATUS_PENDING)
    {
        *wake = queue_shm->wake_bits;
        *changed = queue_shm->changed_bits;
        *internal = queue_shm->internal_bits;
    }
    return !status;
}

#define QBT_WATCH (QS_PAINT | QS_ALLPOSTMESSAGE | QS_SENDMESSAGE)

static int qbt_rate_limit(void)
{
    static UINT win_ms, cnt;   /* 进程级：40 行/秒，超出静默；轮转保证尾部可读 */
    UINT now = probe_ms();

    if ((UINT)(now - win_ms) >= 1000) { win_ms = now; cnt = 0; }
    return ++cnt <= 40;
}

static void qbt_note( const char *tag, unsigned int a, unsigned int b, unsigned int c,
                      unsigned int d, unsigned int e, unsigned int f )
{
    char buf[224]; int len;

    if (!qbt_rate_limit()) return;
    len = snprintf( buf, sizeof(buf), "%u %u %d %s a=0x%x b=0x%x c=0x%x d=0x%x e=0x%x f=0x%x\n",
                    probe_ms(), (unsigned)getpid(), (int)syscall( SYS_gettid ), tag, a, b, c, d, e, f );
    probe_write( "/tmp/wine32u-qbits.log", buf, len );
}

static __thread UINT qbt_last_wake, qbt_last_changed;
static __thread int qbt_seen;

/* peek_message 入口：只在「关注位出现 / 共享位变化 / 本线程首次」时记一行 */
static void qbt_peek_in( UINT wake, UINT changed, UINT internal, UINT mask,
                         UINT first, UINT last, UINT flags, UINT hwnd )
{
    if (!qbt_seen || wake != qbt_last_wake || changed != qbt_last_changed || ((wake | changed) & QBT_WATCH))
    {
        qbt_seen = 1;
        qbt_last_wake = wake;
        qbt_last_changed = changed;
        qbt_note( "peek-in", wake, changed, internal, mask,
                  (first == 0 && last == ~0U) ? 0xffffffff : last, flags );
        qbt_note( "peek-in-hwnd", hwnd, 0, 0, 0, 0, 0 );
    }
}
'''

# ---------------------------------------------------------------- message.c peek_message
PEEK_LOOP_OLD = '''    for (;;)
    {
        NTSTATUS res;
        size_t size = 0;
        const union message_data *msg_data = buffer;
        UINT wake_mask, signal_bits, wake_bits, changed_bits, clear_bits = 0;
'''
PEEK_LOOP_NEW = '''    for (;;)
    {
        NTSTATUS res;
        size_t size = 0;
        const union message_data *msg_data = buffer;
        UINT wake_mask, signal_bits, wake_bits, changed_bits, clear_bits = 0;
        UINT qbt_wake = 0, qbt_changed = 0, qbt_internal = 0;
        BOOL skip;
'''

PEEK_CHECK_OLD = '''        if (check_queue_bits( wake_mask, filter->mask, wake_mask | signal_bits, filter->mask | clear_bits,
                              &wake_bits, &changed_bits, filter->internal ))
            res = STATUS_PENDING;
        else SERVER_START_REQ( get_message )
'''
PEEK_CHECK_NEW = '''        if (qbt_bits( &qbt_wake, &qbt_changed, &qbt_internal ))
            qbt_peek_in( qbt_wake, qbt_changed, qbt_internal, filter->mask | clear_bits,
                         first, last, flags, (UINT)(ULONG_PTR)hwnd );
        skip = check_queue_bits( wake_mask, filter->mask, wake_mask | signal_bits, filter->mask | clear_bits,
                                 &wake_bits, &changed_bits, filter->internal );
        if (skip)
            res = STATUS_PENDING;
        else SERVER_START_REQ( get_message )
'''

PEEK_PEND_OLD = '''            if (res == STATUS_PENDING)
            {
                if (hwnd == (HWND)-1 && idle_event) NtSetEvent( idle_event, NULL );
                return 0;
            }
'''
PEEK_PEND_NEW = '''            if (res == STATUS_PENDING)
            {
                /* skip=1 ⇒ 走共享内存早返回（没去服务端），这是「队列位在但产不出消息」的关键证据 */
                qbt_note( "peek-pend", skip, qbt_wake, qbt_changed, signal_bits, clear_bits, filter->mask );
                if (hwnd == (HWND)-1 && idle_event) NtSetEvent( idle_event, NULL );
                return 0;
            }
'''

PEEK_GOT_OLD = '''        TRACE( "got type %d msg %x (%s) hwnd %p wp %lx lp %lx\\n",
               info.type, info.msg.message,
               (info.type == MSG_WINEVENT) ? "MSG_WINEVENT" : debugstr_msg_name(info.msg.message, info.msg.hwnd),
               info.msg.hwnd, (long)info.msg.wParam, info.msg.lParam );
'''
PEEK_GOT_NEW = PEEK_GOT_OLD + '''        qbt_note( "peek-got", info.type, info.msg.message, (UINT)(ULONG_PTR)info.msg.hwnd,
                  qbt_wake, qbt_changed, (UINT)(ULONG_PTR)info.msg.wParam );
'''

# ---------------------------------------------------------------- message.c msgwait call site
MW_OLD = '''    if (timeout == 0xffffffff || timeout >= 1000)
    {   unsigned int qb = NtUserGetQueueStatus( mask );
        mw_note_ra( "msgwait-in", count, timeout, (unsigned long)qb,
                    count > 0 ? (unsigned long)(ULONG_PTR)handles[0] : 0,
                    (unsigned long)(ULONG_PTR)__builtin_return_address(0) );
        (void)mask; }
'''
MW_NEW = '''    if (timeout == 0xffffffff || timeout >= 1000)
    {   unsigned int qb = NtUserGetQueueStatus( mask );
        mw_note_mask( "msgwait-in", count, timeout, mask,
                      count > 0 ? (unsigned long)(ULONG_PTR)handles[0] : 0, (unsigned long)qb ); }
'''

# ---------------------------------------------------------------- message.c PostMessage
POST_OLD = '''    TRACE( "hwnd %p msg %x (%s) wp %lx lp %lx\\n",
           hwnd, msg, debugstr_msg_name(msg, hwnd), (long)wparam, lparam );

    info.type   = MSG_POSTED;
'''
POST_NEW = '''    TRACE( "hwnd %p msg %x (%s) wp %lx lp %lx\\n",
           hwnd, msg, debugstr_msg_name(msg, hwnd), (long)wparam, lparam );
    qbt_note( "post", (UINT)(ULONG_PTR)hwnd, msg, (UINT)wparam, (UINT)lparam, 0, 0 );

    info.type   = MSG_POSTED;
'''

# ---------------------------------------------------------------- input.c GetQueueStatus
INPUT_INC_OLD = '''#include "wine/server.h"
#include "wine/debug.h"
#include "kbd.h"
'''
INPUT_INC_NEW = '''#include "wine/server.h"
#include "wine/debug.h"
#include "kbd.h"
#include <fcntl.h>
#include <stdio.h>
#include <sys/syscall.h>
#include <unistd.h>
'''

INPUT_HELPER_ANCHOR = '''#define HIMETRIC_PER_INCH 2540
'''
INPUT_HELPER_NEW = '''#define HIMETRIC_PER_INCH 2540

/* 2026-10-25 探针⑧：GetQueueStatus 配对日志（WPF Dispatcher 每轮必调；服务端在请求里清 changed_bits）。
 * 与 peek 探针共用 /tmp/wine32u-qbits.log，a=flags b=wake c=changed d=ret e=1(本地快路)/0(服务端往返)。 */
static void qs_note( const char *tag, unsigned int a, unsigned int b, unsigned int c,
                     unsigned int d, unsigned int e )
{
    static int fd = -1;
    static unsigned long written;
    static UINT win_ms, cnt;
    unsigned int now = (unsigned int)NtGetTickCount();
    char buf[192]; int len;

    if ((UINT)(now - win_ms) >= 1000) { win_ms = now; cnt = 0; }
    if (++cnt > 40) return;
    len = snprintf( buf, sizeof(buf), "%u %u %d %s a=0x%x b=0x%x c=0x%x d=0x%x e=%u\\n",
                    now, (unsigned)getpid(), (int)syscall( SYS_gettid ), tag, a, b, c, d, e );
    if (len <= 0) return;
    if (fd < 0) fd = open( "/tmp/wine32u-qbits.log", O_WRONLY | O_CREAT | O_APPEND, 0666 );
    if (fd < 0) return;
    if (written > 8u * 1024 * 1024)
    {
        close( fd );
        fd = open( "/tmp/wine32u-qbits.log", O_WRONLY | O_CREAT | O_TRUNC, 0666 );
        written = 0;
        if (fd < 0) return;
    }
    if (write( fd, buf, len ) == len) written += len;
}
'''

QS_OLD = '''    if (get_shared_queue_bits( &wake_bits, &changed_bits ) && !(changed_bits & flags))
        ret = MAKELONG( changed_bits & flags, wake_bits & flags );
    else SERVER_START_REQ( get_queue_status )
    {
        req->clear_bits = flags;
        wine_server_call( req );
        ret = MAKELONG( reply->changed_bits & flags, reply->wake_bits & flags );
    }
    SERVER_END_REQ;
    return ret;
'''
QS_NEW = '''    if (get_shared_queue_bits( &wake_bits, &changed_bits ) && !(changed_bits & flags))
    {
        ret = MAKELONG( changed_bits & flags, wake_bits & flags );
        qs_note( "qs-local", flags, wake_bits, changed_bits, ret, 1 );
    }
    else SERVER_START_REQ( get_queue_status )
    {
        req->clear_bits = flags;
        wine_server_call( req );
        ret = MAKELONG( reply->changed_bits & flags, reply->wake_bits & flags );
        qs_note( "qs-srv", flags, reply->wake_bits, reply->changed_bits, ret, 0 );
    }
    SERVER_END_REQ;
    return ret;
'''


def patch(path, pairs, dry=False):
    full = os.path.join(SRC, path)
    with open(full, encoding="utf-8") as f:
        text = f.read()
    changed = []
    for old, new, tag in pairs:
        if new and new in text:
            print(f"  = {path}: {tag} 已存在，跳过")
            continue
        n = text.count(old)
        if n == 0:
            print(f"  ✗ {path}: {tag} 锚点未命中")
            return False
        if n > 1:
            print(f"  ✗ {path}: {tag} 锚点 {n} 处不唯一")
            return False
        text = text.replace(old, new)
        changed.append(tag)
        print(f"  + {path}: {tag}")
    if not dry and changed:
        with open(full, "w", encoding="utf-8") as f:
            f.write(text)
    return True


PATCHES = [
    ("dlls/win32u/message.c", [
        (MSG_HELPERS_OLD, MSG_HELPERS_NEW, "探针⑥⑦ 助手（时间戳/轮转/队列位）"),
        (PEEK_LOOP_OLD, PEEK_LOOP_NEW, "peek_message 局部量"),
        (PEEK_CHECK_OLD, PEEK_CHECK_NEW, "peek_message 入口记录 + skip 捕获"),
        (PEEK_PEND_OLD, PEEK_PEND_NEW, "peek_message 无消息返回记录"),
        (PEEK_GOT_OLD, PEEK_GOT_NEW, "peek_message 产出消息记录"),
        (MW_OLD, MW_NEW, "msgwait-in 补 mask"),
        (POST_OLD, POST_NEW, "PostMessage 记录"),
    ]),
    ("dlls/win32u/input.c", [
        (INPUT_INC_OLD, INPUT_INC_NEW, "补 <fcntl.h> 等头"),
        (INPUT_HELPER_ANCHOR, INPUT_HELPER_NEW, "探针⑧ 助手"),
        (QS_OLD, QS_NEW, "GetQueueStatus 配对记录"),
    ]),
]

# ntdll 三个探针：行数封顶 → 字节轮转 + 毫秒时间戳
SWAIT_OLD, SWAIT_NEW = ('''static void sw_note( const char *what, unsigned long a, unsigned long b, unsigned long c )
{
    static int notes;
    char buf[160]; int fd, len;
    if (notes >= 400) return;
    notes++;
    len = snprintf( buf, sizeof(buf), "%u %d %s op=0x%lx h0=0x%lx h1=0x%lx\\n",
                    (unsigned)getpid(), (int)syscall( SYS_gettid ), what, a, b, c );
    if (len <= 0) return;
    fd = open( "/tmp/wine-ntdll-swait.log", O_WRONLY | O_CREAT | O_APPEND, 0666 );
    if (fd < 0) return;
    write( fd, buf, len ); close( fd );
}''', '''#include <time.h>

/* 2026-10-25：毫秒单调时间（CLOCK_MONOTONIC，与 win32u 的 NtGetTickCount 同基准），仅用于日志排序 */
static unsigned int probe_ms(void)
{
    struct timespec ts;

    clock_gettime( CLOCK_MONOTONIC, &ts );
    return (unsigned int)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

static void sw_note( const char *what, unsigned long a, unsigned long b, unsigned long c )
{
    static int fd = -1;
    static unsigned long written;
    char buf[160]; int len;
    /* 2026-10-25：400 行/进程封顶让本探针在编辑器启动 19 秒后失明 ⇒ 改按字节轮转 */
    len = snprintf( buf, sizeof(buf), "t=%u %u %d %s op=0x%lx h0=0x%lx h1=0x%lx\\n",
                    probe_ms(), (unsigned)getpid(), (int)syscall( SYS_gettid ), what, a, b, c );
    if (len <= 0) return;
    if (fd < 0) fd = open( "/tmp/wine-ntdll-swait.log", O_WRONLY | O_CREAT | O_APPEND, 0666 );
    if (fd < 0) return;
    if (written > 8u * 1024 * 1024)
    {
        close( fd ); written = 0;
        fd = open( "/tmp/wine-ntdll-swait.log", O_WRONLY | O_CREAT | O_TRUNC, 0666 );
        if (fd < 0) return;
    }
    if (write( fd, buf, len ) == len) written += len;
}''')

SYNC_OBJ_OLD = '''static void obj_note( const char *what, unsigned long handle, unsigned long extra )
{
    static int notes;
    char buf[128];
    int fd, len;

    if (notes >= 400) return;
    notes++;
    len = snprintf( buf, sizeof(buf), "%u %d %s handle=0x%lx extra=0x%lx\\n",
                    (unsigned)getpid(), (int)syscall( SYS_gettid ), what, handle, extra );
    if (len <= 0) return;
    fd = open( "/tmp/wine-ntdll-obj.log", O_WRONLY | O_CREAT | O_APPEND, 0666 );
    if (fd < 0) return;
    write( fd, buf, len );
    close( fd );
}'''

SYNC_OBJ_NEW = '''#include <time.h>

/* 2026-10-25：毫秒单调时间（CLOCK_MONOTONIC，与 win32u 的 NtGetTickCount 同基准），仅用于日志排序 */
static unsigned int probe_ms(void)
{
    struct timespec ts;

    clock_gettime( CLOCK_MONOTONIC, &ts );
    return (unsigned int)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

static void obj_note( const char *what, unsigned long handle, unsigned long extra )
{
    static int fd = -1;
    static unsigned long written;
    char buf[128];
    int len;

    /* 2026-10-25：行数封顶 → 字节轮转（原 400 行上限 19 秒即打满） */
    len = snprintf( buf, sizeof(buf), "t=%u %u %d %s handle=0x%lx extra=0x%lx\\n",
                    probe_ms(), (unsigned)getpid(), (int)syscall( SYS_gettid ), what, handle, extra );
    if (len <= 0) return;
    if (fd < 0) fd = open( "/tmp/wine-ntdll-obj.log", O_WRONLY | O_CREAT | O_APPEND, 0666 );
    if (fd < 0) return;
    if (written > 8u * 1024 * 1024)
    {
        close( fd ); written = 0;
        fd = open( "/tmp/wine-ntdll-obj.log", O_WRONLY | O_CREAT | O_TRUNC, 0666 );
        if (fd < 0) return;
    }
    if (write( fd, buf, len ) == len) written += len;
}'''

SYNC_WAIT_OLD = '''static void wait_note( const char *what, unsigned long a, unsigned long b, unsigned long c, unsigned long d )
{
    static int notes;
    char buf[192];
    int fd, len;

    if (notes >= 400) return;
    notes++;
    len = snprintf( buf, sizeof(buf), "%u %d %s a=0x%lx b=0x%lx c=0x%lx d=0x%lx\\n",
                    (unsigned)getpid(), (int)syscall( SYS_gettid ), what, a, b, c, d );
    if (len <= 0) return;
    fd = open( "/tmp/wine-ntdll-wait.log", O_WRONLY | O_CREAT | O_APPEND, 0666 );
    if (fd < 0) return;
    write( fd, buf, len );
    close( fd );
}'''

SYNC_WAIT_NEW = '''#include <time.h>

/* 2026-10-25：毫秒单调时间（CLOCK_MONOTONIC，与 win32u 的 NtGetTickCount 同基准），仅用于日志排序 */
static unsigned int probe_ms(void)
{
    struct timespec ts;

    clock_gettime( CLOCK_MONOTONIC, &ts );
    return (unsigned int)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

static void wait_note( const char *what, unsigned long a, unsigned long b, unsigned long c, unsigned long d )
{
    static int fd = -1;
    static unsigned long written;
    char buf[192];
    int len;

    /* 2026-10-25：行数封顶 → 字节轮转 + 毫秒时间戳（原 400 行在进程启动 19 秒即打满，复现时失明） */
    len = snprintf( buf, sizeof(buf), "t=%u %u %d %s a=0x%lx b=0x%lx c=0x%lx d=0x%lx\\n",
                    probe_ms(), (unsigned)getpid(), (int)syscall( SYS_gettid ), what, a, b, c, d );
    if (len <= 0) return;
    if (fd < 0) fd = open( "/tmp/wine-ntdll-wait.log", O_WRONLY | O_CREAT | O_APPEND, 0666 );
    if (fd < 0) return;
    if (written > 8u * 1024 * 1024)
    {
        close( fd ); written = 0;
        fd = open( "/tmp/wine-ntdll-wait.log", O_WRONLY | O_CREAT | O_TRUNC, 0666 );
        if (fd < 0) return;
    }
    if (write( fd, buf, len ) == len) written += len;
}'''

PATCHES.append(("dlls/ntdll/unix/server.c", [(SWAIT_OLD, SWAIT_NEW, "swait 探针轮转")]))
PATCHES.append(("dlls/ntdll/unix/sync.c", [
    (SYNC_OBJ_OLD, SYNC_OBJ_NEW, "obj 探针轮转"),
    (SYNC_WAIT_OLD, SYNC_WAIT_NEW, "wait 探针轮转"),
]))


def main():
    if "--revert" in sys.argv:
        print("回滚：请用 git -C wine-src checkout -- <file>（补丁不自动反向匹配）")
        return 1
    ok = True
    for path, pairs in PATCHES:
        ok = patch(path, pairs) and ok
    print("OK" if ok else "FAILED")
    return 0 if ok else 3


if __name__ == "__main__":
    sys.exit(main())
