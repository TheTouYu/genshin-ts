#!/bin/bash
# ncc 判据自测（gui-stack 票 02 的副产物）：模板匹配的**未定义语义**
# 背景：2026-10-17 实测——`np.maximum(den*Tn, 1e-9)` 把"未定义"变成 4e9 天文数字，
# 而 `score >= 0.9` 的阈值把它当成命中，导致「侧栏图标 ⇒ 系统菜单」在存档页/结算页全部误触发。
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
python3 - "$HERE" <<'PY'
import sys, os, subprocess
HERE = sys.argv[1]; sys.path.insert(0, HERE)
import numpy as np
from ys_look import ncc
def load(p):
    d = subprocess.run(["identify","-format","%w %h",p],capture_output=True,text=True).stdout.split()
    w,h = int(d[0]),int(d[1]); b = subprocess.run(["magick",p,"-depth","8","rgb:-"],capture_output=True).stdout
    return np.frombuffer(b,dtype=np.uint8).reshape(h,w,3).astype(np.float32)/255.0
fails = 0
# ① 平坦块上必须判"不匹配"（不是天文数字）
flat = np.full((200,200,3), 25, np.float32)/255.0
T = load(os.path.join(HERE,"templates/sidebar-save-mgr.png"))
_,_,s,_ = ncc(flat, T)
ok = (0.0 <= s <= 1.0)
print(f"  {'✓' if ok else '✗'} 平坦搜索区 → score={s:.4f}（必须落在 [0,1]）"); fails += 0 if ok else 1
# ② 结果永不超过 1
for s_name in ["menu","savelist","settle","pause","playtest"]:
    p = os.path.join(HERE,"calib/regress",s_name+".png")
    if not os.path.exists(p): continue
    _,_,sc,_ = ncc(load(p), T)
    ok = (0.0 <= sc <= 1.0)
    print(f"  {'✓' if ok else '✗'} {s_name:10s} score={sc:.4f}"); fails += 0 if ok else 1
# ③ 全图找自己必须 ≈1
p = os.path.join(HERE,"calib/regress/menu.png")
_,_,sc,_ = ncc(load(p), T)
ok = sc > 0.99
print(f"  {'✓' if ok else '✗'} menu 自匹配 {sc:.4f}（应 >0.99）"); fails += 0 if ok else 1
print("─"*40)
print("✗ 有失败项" if fails else "✓ 全绿"); sys.exit(1 if fails else 0)
PY
