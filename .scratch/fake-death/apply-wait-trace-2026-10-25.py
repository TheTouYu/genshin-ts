#!/usr/bin/env python3
"""2026-10-25 探针⑨：wait_message / process_driver_events 的「客户端判定 vs 服务端注册」配对。

为什么加：现存读数里最后一条是 `msgwait-in a=1 b=0xffffffff c=0x1000000 d=0x4ac` 且**没有 out**，
主线程随后停在 read(唤醒管道)。Wine 侧的可疑缝（源码事实）：
  - 客户端 is_queue_signaled() 用「共享 wake_bits/changed_bits & 本次 mask」判断可否免等；
  - 服务端 get_queue_status() 用「queue_shm->wake_mask」（由 set_queue_mask / get_message 写回）
    与 changed_bits 判断是否 signal_sync；
  - MsgWait 若没带 MWMO_INPUTAVAILABLE，wait_objects 传 wake_mask=0（只认 changed_bits）。
  ⇒ 两侧可能同时说「有活」和「没活」。本探针把每次等待的 (wanted masks, 共享位, 判定) 配对落地。
只读、失败静默、8MB~32MB 轮转。幂等。
用法：python3 apply-wait-trace-2026-10-25.py
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "wine-src")

RATE_OLD = "    return ++cnt <= 40;\n"
RATE_NEW = "    return ++cnt <= 200;   /* 200 行/秒：抓冻结过渡期；32MB 轮转 ≈ 1600s 历史 */\n"

# 轮转阈值 8MB -> 32MB（跑一次冻结可能上百万行，要能覆盖整段）
ROT_OLD = "    if (sink->written > 8u * 1024 * 1024)\n"
ROT_NEW = "    if (sink->written > 32u * 1024 * 1024)\n"

# qbt_bits 之后追加 qbt_masks
QBITS_ANCHOR = '''#define QBT_WATCH (QS_PAINT | QS_ALLPOSTMESSAGE | QS_SENDMESSAGE)
'''
QBITS_NEW = '''/* 服务端视角的注册掩码（set_queue_mask / get_message 写回共享内存的那两个数） */
static BOOL qbt_masks( UINT *wake_mask, UINT *changed_mask )
{
    struct object_lock lock = OBJECT_LOCK_INIT;
    const queue_shm_t *queue_shm;
    UINT status;

    *wake_mask = *changed_mask = 0;
    while ((status = get_shared_queue( &lock, &queue_shm )) == STATUS_PENDING)
    {
        *wake_mask = queue_shm->wake_mask;
        *changed_mask = queue_shm->changed_mask;
    }
    return !status;
}

#define QBT_WATCH (QS_PAINT | QS_ALLPOSTMESSAGE | QS_SENDMESSAGE)
'''

PDE_OLD = '''    return is_queue_signaled();
}
'''
PDE_NEW = '''    {   /* 探针⑨：把「本次想要的掩码」「共享位」「客户端是否认为有活」配成一行 */
        UINT w0, c0, i0, sm0, sc0;
        BOOL sig = is_queue_signaled();
        if (qbt_bits( &w0, &c0, &i0 ) && qbt_masks( &sm0, &sc0 ))
            qbt_note( "pd-out", wake_mask, changed_mask, sig ? 1 : 0, w0, c0, sm0 );
        return sig;
    }
}
'''

WAIT_OLD = '''    do ret = NtWaitForMultipleObjects( count, handles, type, !!(flags & MWMO_ALERTABLE), abs );
    while (ret == count - 1 && !process_driver_events( QS_ALLINPUT, wake_mask, changed_mask ));
'''
WAIT_NEW = '''    do
    {
        UINT w0 = 0, c0 = 0, i0 = 0, sm0 = 0, sc0 = 0;
        qbt_bits( &w0, &c0, &i0 );
        qbt_masks( &sm0, &sc0 );
        qbt_note( "wait-in", count, timeout, wake_mask, changed_mask, w0, sm0 );
        ret = NtWaitForMultipleObjects( count, handles, type, !!(flags & MWMO_ALERTABLE), abs );
        qbt_note( "wait-out", ret, count, wake_mask, changed_mask, c0, sc0 );
    }
    while (ret == count - 1 && !process_driver_events( QS_ALLINPUT, wake_mask, changed_mask ));
'''

PATCHES = [
    ("dlls/win32u/message.c", [
        (ROT_OLD, ROT_NEW, "轮转阈值 32MB"),
        (RATE_OLD, RATE_NEW, "限流 40→200 行/秒"),
        (QBITS_ANCHOR, QBITS_NEW, "qbt_masks 助手"),
        (PDE_OLD, PDE_NEW, "process_driver_events 判定配对"),
        (WAIT_OLD, WAIT_NEW, "wait_message 等待进出配对"),
    ]),
]


def main():
    ok = True
    for path, pairs in PATCHES:
        full = os.path.join(SRC, path)
        with open(full, encoding="utf-8") as f:
            text = f.read()
        for old, new, tag in pairs:
            if new in text:
                print(f"  = {path}: {tag} 已存在")
                continue
            if text.count(old) != 1:
                print(f"  ✗ {path}: {tag} 锚点 {text.count(old)} 处（应为 1）")
                ok = False
                continue
            text = text.replace(old, new)
            print(f"  + {path}: {tag}")
        with open(full, "w", encoding="utf-8") as f:
            f.write(text)
    print("OK" if ok else "FAILED")
    return 0 if ok else 3


if __name__ == "__main__":
    sys.exit(main())
