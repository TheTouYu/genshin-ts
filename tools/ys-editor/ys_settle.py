#!/usr/bin/env python3
"""ys_settle — 「布局还稳不稳」的唯一实现（纯函数，无重依赖，可离线自测）。

## 为什么有它

2026-10-21 实测：派蒙菜单打开后网格仍在漂移（tile 网格 y 从 478/668/856/1046 漂到
452/572/760/950，≈94px），照首读 bbox 点击会落到**相邻格子**（点「好友」落到「角色」）。
所以动作用坐标前必须知道「这帧还稳不稳」。

第一版把 `settled` 实现成**逐字相等**：`(kind, bbox, text)` 全等才算稳定。
真机实测：**连续 12.5s 都没等到 true**，但点击照样落在正确位置 —— 判据是坏的，
不是画面在动，是 OCR 抖动（`●在线` vs `在线`、bbox 差 1~2px）让签名永远不相等。
如果把这个信号直接做成 `act` 的强制前置，会**把所有正常动作永久堵死**。

## 判据（容差，不是相等）

对上一帧与当前帧的容器做 1:1 匹配，三件事同时成立才算「稳定」：

1. 数量一致（容差 0 —— 多一个/少一个对象通常意味着列表滚了或弹了面板）；
2. 每个匹配对象**中心位移 ≤ tol_px**（缺省 6px，可用 `YS_SETTLE_TOL_PX` 覆盖）；
3. 每个匹配对象**文本相似度 ≥ tol_text**（缺省 0.80，归一化后 difflib 比值）。

匹配口径：同 `kind` 且文本相似度最高、且 ≥ 阈值的一对一贪心；配不上的对象计入
`n_unmatched`，直接判不稳定。

## 输出

`compare(prev, cur)` 返回 `(same, diag)`，diag 里带 `max_shift_px / n_text_changed /
n_unmatched / reason` —— **判不稳时必须能说清是哪一条不成立**，否则又变成"仪表说没事"。
"""
import difflib
import os
import re

TOL_PX_DEFAULT = float(os.environ.get("YS_SETTLE_TOL_PX", "6"))
TOL_TEXT_DEFAULT = float(os.environ.get("YS_SETTLE_TOL_TEXT", "0.80"))
# 装饰符号：在线圆点、分隔点、空白都不参与文本比较（它们最容易随 OCR 抖）
_DECOR = re.compile(r"[●·•|｜\s]+")


def normalize_text(t):
    """把容器文本归一化：拼接、去装饰符号与空白、小写。"""
    if isinstance(t, (list, tuple)):
        s = "".join(str(x) for x in t)
    else:
        s = str(t or "")
    return _DECOR.sub("", s).lower()


def signature(containers):
    """把 containers[] 压成可比较的签名：[(kind, (x,y,w,h), normalized_text)]。

    bbox 原样保留（不取整到 10px 之类的粗粒度——那会掩盖真实位移）；
    容差在 compare() 里按像素判，判据只有一处。
    """
    out = []
    for c in containers or []:
        bb = c.get("bbox") or [0, 0, 0, 0]
        try:
            box = tuple(float(x) for x in bb)
        except (TypeError, ValueError):
            box = (0.0, 0.0, 0.0, 0.0)
        out.append((c.get("kind") or "unknown", box, normalize_text(c.get("text") or [])))
    return out


def center(box):
    return (box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0


def _sim(a, b):
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def compare(prev_sig, cur_sig, tol_px=None, tol_text=None):
    """上一帧 vs 当前帧是否「在同一布局上」。返回 (same: bool, diag: dict)。"""
    tol_px = TOL_PX_DEFAULT if tol_px is None else float(tol_px)
    tol_text = TOL_TEXT_DEFAULT if tol_text is None else float(tol_text)
    diag = {"tol_px": tol_px, "tol_text": tol_text}

    if prev_sig is None:
        diag.update(reason="no_prev", same=False)
        return False, diag
    if len(prev_sig) != len(cur_sig):
        diag.update(reason="count", prev_n=len(prev_sig), cur_n=len(cur_sig), same=False)
        return False, diag

    used = [False] * len(prev_sig)
    max_shift, n_text_changed, n_unmatched = 0.0, 0, 0
    for kind, box, text in cur_sig:
        best_i, best_sim = -1, -1.0
        for i, (pk, pb, pt) in enumerate(prev_sig):
            if used[i] or pk != kind:
                continue
            s = _sim(pt, text)
            if s > best_sim:
                best_i, best_sim = i, s
        if best_i < 0 or best_sim < tol_text:
            n_unmatched += 1
            continue
        used[best_i] = True
        if best_sim < 1.0:
            n_text_changed += 1
        (x0, y0), (x1, y1) = center(prev_sig[best_i][1]), center(box)
        max_shift = max(max_shift, ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5)

    same = (n_unmatched == 0) and (max_shift <= tol_px)
    reason = None if same else ("unmatched" if n_unmatched else "shift")
    diag.update(reason=reason, same=same, max_shift_px=round(max_shift, 1),
                n_text_changed=n_text_changed, n_unmatched=n_unmatched,
                n_objects=len(cur_sig))
    return same, diag
