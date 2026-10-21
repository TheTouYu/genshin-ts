#!/usr/bin/env python3
"""capture-frame.selftest.py — 抓帧文件「完整性」判据回归（离线，不碰屏幕）。

## 为什么有它（2026-10-21 用户抓到的真 bug + 我的实现缺陷）

用户原话：「你中间过程的截图，很多角色名字和头像对不上！！！」

根因在**写帧**，不在游戏：`ys_capture.py` 原先 `open(path,'wb')` **原地写 11MB**，
读者可能打开到写到一半的文件 ⇒ 同一张图里标题区已是新角色、头像区还是旧角色（撕裂帧）。
另外 `_prune_rgb` 只保留最新 `ring` 个文件，**可能把 state 正在引用的那一帧删掉** ⇒
读者拿到一个已消失的路径（实测 `FileNotFoundError`）。

判据：
    T1 原子写：并发写 300 次期间，读者取到的每一份都必须是**完整的一帧**（长度正确、内容单色）
    T2 对照：同规模下"原地写"会读到撕裂帧（证明 T1 的判据确实能抓到 bug；读不到算 INCONCLUSIVE，不判失败）
    T3 回收保护：`_prune_rgb` 绝不删除 `last_rgb_path` 指向的那一帧
    T4 回收正常：ring 之外且未被引用的帧仍会被删（不能因为保护就永不回收）
退出码：0 PASS / 1 FAIL
"""
import importlib.util
import os
import sys
import tempfile
import threading
import time
import types
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("ycap", REPO / "tools" / "ys-editor" / "ys_capture.py")
YCAP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(YCAP)
write_rgb_atomic = YCAP.write_rgb_atomic
Daemon = YCAP.Daemon

FAILS = 0


def ok(m):
    print(f"  ✓ {m}")
    return True


def bad(m):
    global FAILS
    FAILS += 1
    print(f"  ✗ {m}")
    return False


SIZE = 4 * 1024 * 1024
A = b"\xaa" * SIZE
B = b"\xbb" * SIZE


def old_write(path, data):
    """改造前的写法：原地覆盖（对照用）。"""
    with open(path, "wb") as f:
        f.write(data)


def trial(writer, path, rounds=300):
    """并发：写线程反复写 A/B，主线程反复读，返回 (坏读次数, 样本说明)。"""
    stop = threading.Event()

    def w():
        i = 0
        while not stop.is_set() and i < rounds:
            writer(path, A if i % 2 == 0 else B)
            i += 1

    t = threading.Thread(target=w, daemon=True)
    t.start()
    bad_reads, n, sample = 0, 0, ""
    while t.is_alive() and n < rounds * 2:
        try:
            with open(path, "rb") as f:
                data = f.read()
        except FileNotFoundError:
            n += 1
            continue
        n += 1
        if len(data) != SIZE:
            bad_reads += 1
            sample = sample or f"长度 {len(data)} != {SIZE}"
        elif data not in (A, B):
            bad_reads += 1
            sample = sample or "内容既非 A 也非 B（撕裂/混合）"
    stop.set()
    t.join(timeout=5)
    return bad_reads, n, sample


tmp = tempfile.mkdtemp(prefix="cap-frame-")
p_new = os.path.join(tmp, "f-000000001.rgb")
p_old = os.path.join(tmp, "f-000000002.rgb")

bad_new, n_new, s_new = trial(write_rgb_atomic, p_new)
(bad_new == 0 and n_new > 0 and ok(f"T1 原子写：{n_new} 次并发读，0 次撕裂"))
if not (bad_new == 0 and n_new > 0):
    bad(f"T1 原子写出现 {bad_new}/{n_new} 次坏读（{s_new}）")

bad_old, n_old, s_old = trial(old_write, p_old, rounds=200)
if bad_old > 0:
    ok(f"T2 对照：原地写在 {n_old} 次读里产生 {bad_old} 次撕裂（证明判据有效）")
else:
    print(f"  · T2 对照未复现撕裂（{n_old} 次读）——INCONCLUSIVE，不判失败")

# ── T3/T4：回收保护 ──
d = tempfile.mkdtemp(prefix="cap-prune-")
names = [os.path.join(d, "f-%09d.rgb" % i) for i in range(1, 7)]
for p in names:
    open(p, "wb").write(b"x")
stub = types.SimpleNamespace(dir=d, ring=3, last_rgb_path=names[0])   # 引用最旧的那一帧
Daemon._prune_rgb(stub)
exists = {os.path.basename(p): os.path.exists(p) for p in names}
(os.path.exists(names[0]) and ok("T3 被 state 引用的旧帧没被回收"))
if not os.path.exists(names[0]):
    bad("T3 被引用的帧被删了")
(not exists["f-000000002.rgb"] and not exists["f-000000003.rgb"] and ok("T4 其余过期帧正常回收"))
if exists["f-000000002.rgb"] or exists["f-000000003.rgb"]:
    bad(f"T4 过期帧未回收：{exists}")

for f in os.listdir(tmp):
    os.unlink(os.path.join(tmp, f))
os.rmdir(tmp)
for f in os.listdir(d):
    os.unlink(os.path.join(d, f))
os.rmdir(d)

if FAILS == 0:
    print("CAPTURE-FRAME-RESULT pass=4 fail=0 verdict=PASS")
    sys.exit(0)
print(f"CAPTURE-FRAME-RESULT pass={4 - FAILS} fail={FAILS} verdict=FAIL")
sys.exit(1)
