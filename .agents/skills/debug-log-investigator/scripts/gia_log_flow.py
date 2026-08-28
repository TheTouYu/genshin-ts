#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gia_log_flow.py — 日志「事件线高亮 + 数据倒查」视图（2026-08-28 用户方法论启发）

游戏引擎日志查看方式：执行沿一条/多条事件线进行；引擎自动高亮触发的控制流
（未执行的控制流灰白）；开发者顺具体节点倒查输入输出数据，一直追到第一个数据/最后一个节点。

本工具把该视角搬进 CLI（客户端图模式）：
  事件线高亮（默认）：按日志帧序列重建事件线——控制流节点（多分支/双分支/循环/遍历/
    信号/入口）与写节点全显并标注关键值，纯数据节点（get/convert/math）折叠成"…数据链"，
    循环重复块自动检测折叠（标注 ×N）。
  数据倒查（--trace-node <idx>）：沿图 dataflow 边回溯该节点输入的完整来源链到源头，
    每步标注日志实际值。

用法：
  python3 gia_log_flow.py <日志.gia> --gil <地图.gil> --rec <n> --client
  python3 gia_log_flow.py <日志.gia> --gil <地图.gil> --rec <n> --client --trace-node <idx>

依赖：同目录 gia_log.py（frames 解码）+ npx tsx tools/parse-gil-node-graph.ts（图结构）。
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = "/home/h/genshin-ts"
META_TS = REPO + "/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts"

FRAME_RE = re.compile(r"[(\d+)] head=([0-9a-f]+) load=(\S+) | (.*)$")
PARAM_RE = re.compile(r"(IN|OUT)(\d+):([A-Za-z0-9]+)=(.*?)(?= \| |$)")

CTL_KW = ("分支", "循环", "遍历", "信号", "开始", "发送", "添加单位状态")
WRITE_KW = ("设置局部变量", "设置自定义变量")

# 客户端节点库缺名的补充映射（魔方-客户端优化版本实证：n115 向服务器发信号）
META_OVERRIDES = {1610612774: "向服务器节点图发送信号"}


def vardecode(hx: str) -> int:
    b = bytes.fromhex(hx)
    v = 0
    for i, byte in enumerate(b):
        v |= (byte & 0x7F) << (7 * i)
    return v


def load_client_meta():
    """genericId -> displayName（客户端节点库）"""
    meta, cur = {}, None
    for line in open(META_TS):
        s = line.strip()
        if s.startswith("subType:") and "'" in s:
            cur = {}
        elif s.startswith("nodeType:") and cur is not None:
            cur["t"] = s.split("'")[1]
        elif s.startswith("displayName:") and cur is not None:
            cur["d"] = s.split("'")[1]
        elif s.startswith("graphType:") and cur is not None:
            cur["gt"] = int(s.split(":")[1].strip().rstrip(","))
        elif s.startswith("genericId:") and cur is not None:
            cur["gid"] = int(s.split(":")[1].strip().rstrip(","))
        elif s.startswith("},") and cur is not None and "gid" in cur and "d" in cur:
            meta.setdefault(cur["gid"], cur["d"])
            cur = None
    return meta


def load_graph(gil_path: str, graph_id: str):
    out = subprocess.run(
        ["npx", "tsx", "tools/parse-gil-node-graph.ts", gil_path, "--graph", graph_id, "--json"],
        capture_output=True, text=True, cwd=REPO
    ).stdout
    start = out.find("{")
    data, _ = json.JSONDecoder().raw_decode(out[start:])
    return data["graph"]


def load_frames(log_path: str, rec: int):
    out = subprocess.run(
        [sys.executable, str(HERE / "gia_log.py"), log_path, "frames", "--rec", str(rec)],
        capture_output=True, text=True
    ).stdout
    frames = []
    for line in out.splitlines():
        if not line.startswith("["):
            continue
        end = line.find("]")
        if end < 0:
            continue
        seq = int(line[1:end])
        rest = line[end + 2:]
        hx = rest.split(" ")[0].split("=")[1]
        params = {}
        pipe = rest.find(" | ")
        if pipe > 0:
            for seg in rest[pipe + 3:].split(" | "):
                if "=" in seg:
                    k, v = seg.split("=", 1)
                    params[k] = v
        frames.append({"seq": seq, "idx": vardecode(hx), "params": params})
    return frames


class ClientNames:
    def __init__(self, graph):
        self.idx2gid = {n["index"]: n["generic_id"] for n in graph["nodes"]}
        self.meta = load_client_meta()

    def __call__(self, idx):
        gid = self.idx2gid.get(idx)
        if gid in META_OVERRIDES:
            return META_OVERRIDES[gid]
        return self.meta.get(gid, f"gid{gid}")


def _lcs_len(a, b):
    """两序列最长公共子序列长度（迭代块规模小，O(len^2) 够用）"""
    if len(a) > len(b):
        a, b = b, a
    m, n = len(a), len(b)
    prev = [0] * (m + 1)
    for j in range(1, n + 1):
        cur = [0] * (m + 1)
        bj = b[j - 1]
        for i in range(1, m + 1):
            if a[i - 1] == bj:
                cur[i] = prev[i - 1] + 1
            else:
                cur[i] = max(prev[i], cur[i - 1])
        prev = cur
    return prev[m]


def find_repeat(seq, allowed=None):
    """循环重复块检测（全序列扫描，不锚定末尾）：
    找以同一节点 idx 为迭代起点的循环——该 idx 反复出现（>=5 次迭代）、
    相邻出现间隔近似均匀（max_gap <= 2*min_gap）、相邻迭代块内容相似
    （公共子序列占比 >= 70%，容忍循环体因分支不同有帧插入/缺失）。
    allowed：可选集合，只接受其中的 idx 作迭代边界（如仅控制流/写节点）。
    返回 (period, k, start, end)：period=代表性迭代块帧数（间隔众数）、
    k=迭代次数、start=循环起点、end=循环结束点（其后为尾部）；无循环 (None, 0, 0, 0)。
    """
    n = len(seq)
    if n < 12:
        return (None, 0, 0, 0)
    from collections import Counter
    best, best_score = (None, 0, 0, 0), None
    for x, cnt in Counter(seq).most_common():
        if cnt < 6 or (allowed is not None and x not in allowed):
            continue
        pos = [i for i, v in enumerate(seq) if v == x]
        gaps = [pos[i + 1] - pos[i] for i in range(len(pos) - 1)]
        gmin, gmax = min(gaps), max(gaps)
        if gmin < 3 or gmax > gmin * 2:
            continue  # 间隔不均匀，不是迭代边界
        sims = []
        for i in range(len(pos) - 2):
            a, b, c = pos[i], pos[i + 1], pos[i + 2]
            ba, bb = seq[a:b], seq[b:c]
            if len(ba) < 3 or len(bb) < 3:
                sims.append(0.0)
                continue
            sims.append(_lcs_len(ba, bb) / min(len(ba), len(bb)))
        if not sims or sum(sims) / len(sims) < 0.7:
            continue  # 相邻迭代块不相似，不是循环体重复
        k = len(pos) - 1
        period = Counter(gaps).most_common(1)[0][0]
        score = (k, sum(sims) / len(sims), -pos[0])
        if best_score is None or score > best_score:
            best_score = score
            best = (period, k, pos[0], pos[-1])
    return best


def control_view(frames, names):
    """事件线高亮：帧序列重建，数据节点折叠，循环重复检测折叠"""

    def tokenize(fr_list):
        tokens = []  # (kind, idx, detail)
        buf = []
        pending = None  # 单帧数据节点，并入下一个控制流行（← 前缀）
        for fr in fr_list:
            i = fr["idx"]
            nm = names(i)
            if any(k in nm for k in CTL_KW) or any(k in nm for k in WRITE_KW):
                if buf:
                    if len(buf) == 1:
                        pending = f"n{buf[0]:3d} {names(buf[0])}"
                    else:
                        tokens.append(("data", None, f"… 数据链 {len(buf)} 帧（get/convert/math 折叠）"))
                    buf = []
                detail = ""
                p = fr["params"]
                if "多分支" in nm:
                    ctrl = p.get("IN0:String") or p.get("IN0:Integer") or "?"
                    case = p.get("IN1:StringList", "")
                    detail = f"控制={ctrl} case=[{case}…]"
                elif "双分支" in nm:
                    cond = p.get("IN1:Boolean") or p.get("IN0:Boolean") or "?"
                    detail = f"条件={cond}"
                elif "循环" in nm or "遍历" in nm:
                    lst = p.get("IN1:13") or p.get("IN1:Integer") or ""
                    detail = f"IN1={lst[:50]}"
                elif "设置" in nm:
                    key = p.get("IN0:String", "?")
                    in1 = {k: v for k, v in p.items() if k.startswith("IN1")}
                    detail = f"[{key}] = {list(in1.values())[0] if in1 else '?'}"
                elif "添加单位状态" in nm:
                    detail = f"Entity={p.get('IN1:Entity', '?')} 状态={p.get('IN3:20', '?')[:30]}"
                elif "信号" in nm or "发送" in nm:
                    outs = {k: v for k, v in p.items() if k.startswith("OUT")}
                    if not outs:
                        outs = {k: v for k, v in p.items() if k.startswith("IN")}
                    detail = " ".join(f"{k}={v}" for k, v in list(outs.items())[:7])
                elif "开始" in nm:
                    detail = "★ 事件线起点"
                if pending:
                    detail = f"← {pending} {detail}".rstrip()
                    pending = None
                tokens.append(("ctl", i, f"n{i:3d} {nm} {detail}"))
            else:
                buf.append(i)
        if buf:
            if len(buf) == 1:
                tokens.append(("data", buf[0], f"n{buf[0]:3d} {names(buf[0])}"))
            else:
                tokens.append(("data", None, f"… 数据链 {len(buf)} 帧（get/convert/math 折叠）"))
        return tokens

    # 循环重复折叠：对原始帧 idx 序列做迭代块检测（循环体+循环后尾部）
    raw_seq = [f["idx"] for f in frames]
    ctl_idxs = {fr["idx"] for fr in frames if
                any(k in names(fr["idx"]) for k in CTL_KW) or
                any(k in names(fr["idx"]) for k in WRITE_KW)}
    period, k, start, end = find_repeat(raw_seq, ctl_idxs)
    if period and k >= 3:
        lines = [t[2] for t in tokenize(frames[:start])]
        lines.append(f"└─ 【循环体 ×{k} 重复：每轮 {period} 帧】")
        lines += [t[2] for t in tokenize(frames[start:start + period])]
        lines += [t[2] for t in tokenize(frames[end:])]
    else:
        lines = [t[2] for t in tokenize(frames)]
    return "\n".join(lines)


def trace_view(frames, graph, names, target):
    """数据倒查：目标节点每个输入的来源链 + 日志实际值"""
    nodes = {n["index"]: n for n in graph["nodes"]}
    rev = {}
    for f in graph.get("dataflow", []):
        key = (f["to"]["node"], f["to"]["pin"]["index"])
        rev.setdefault(key, []).append((f["from"]["node"], f["from"]["pin"]["index"]))
    executed = {}
    for fr in frames:
        executed.setdefault(fr["idx"], []).append(fr)

    def val_at(i, pin, direction="IN"):
        frs = executed.get(i)
        if not frs:
            return ""
        for key in (f"{direction}{pin}:", f"{direction}{pin}"):
            for k, v in frs[0]["params"].items():
                if k.startswith(key):
                    return v
        return ""

    tgt = nodes.get(target)
    if tgt is None:
        return f"节点 n{target} 不存在"
    lines = [f"n{target} {names(target)}（{len(executed.get(target, []))} 帧）"]

    def _trace_var_writer(node, depth, seen, pad):
        """获取变量节点 → 按变量名找最近一次写回该变量的设置节点，跳到其值引脚继续倒查"""
        frs = executed.get(node)
        if not frs or depth > 7:
            return False
        p = frs[0]["params"]
        vname = p.get("IN1:String") or p.get("IN0:String")
        if not vname:
            return False
        get_seq = frs[0]["seq"]
        writer = None
        for fr in frames:
            if fr["seq"] >= get_seq:
                continue
            if "设置" not in names(fr["idx"]):
                continue
            fp = fr["params"]
            if (fp.get("IN1:String") or fp.get("IN0:String")) == vname:
                writer = fr  # 保留最后一条（时序最近）
        if writer is None:
            lines.append(f"{pad}↳ 变量 {vname}：本事件线内无写回（跨图/外部来源）")
            return True
        sn, fp = writer["idx"], writer["params"]
        val_pins = [int(k[2:].split(":")[0]) for k, v in fp.items()
                    if k.startswith("IN") and v != vname]
        if not val_pins:
            return False
        vp = max(val_pins)
        sv = val_at(sn, vp, "IN")
        lines.append(f"{pad}↳ 变量存储：{vname} ← n{sn} {names(sn)} IN{vp}={sv}")
        trace_pin(sn, vp, depth + 1, seen)
        return True

    def trace_pin(node, pin_idx, depth, seen, out=False):
        if (node, pin_idx) in seen or depth > 8:
            return
        seen.add((node, pin_idx))
        cur_val = val_at(node, pin_idx, "IN")
        srcs = rev.get((node, pin_idx), [])
        pad = "  " * (depth + 1)
        if not srcs:
            nm0 = names(node)
            if out and "获取" in nm0 and "变量" in nm0:
                if _trace_var_writer(node, depth, seen, pad):
                    return
            if out and node != target:
                frs0 = executed.get(node, [])
                p0 = frs0[0]["params"] if frs0 else {}
                ins0 = sorted({int(k[2:].split(":")[0]) for k in p0 if k.startswith("IN")})
                if len(ins0) >= 2 and depth < 7:
                    # 计算类节点：输出由输入计算而来 → 回溯全部输入引脚
                    for pi in ins0:
                        v = val_at(node, pi, "IN")
                        lines.append(f"{pad}├ IN{pi} = {v}")
                        trace_pin(node, pi, depth + 1, seen)
                    return
            if cur_val:
                lines.append(f"{pad}← 字面量 = {cur_val}")
            return
        for sn, sp in srcs:
            sv = val_at(sn, sp, "OUT")
            lines.append(f"{pad}← n{sn} {names(sn)} = {sv}")
            trace_pin(sn, sp, depth + 1, seen, out=True)

    ins = tgt.get("inputs") or []
    for inp in ins:
        pi = inp["index"]
        pname = inp.get("name", f"InParam[{pi}]")
        cur = val_at(target, pi, "IN")
        lines.append(f"  IN{pi} [{pname}] = {cur}")
        if not cur and not rev.get((target, pi)):
            lines.append("    ← 无来源（默认/空值）")
        trace_pin(target, pi, 0, set())
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("log")
    ap.add_argument("--gil", required=True)
    ap.add_argument("--rec", type=int, required=True)
    ap.add_argument("--client", action="store_true", help="客户端图（head=图内节点序号）")
    ap.add_argument("--trace-node", type=int)
    args = ap.parse_args()

    out = subprocess.run(
        [sys.executable, str(HERE / "gia_log.py"), args.log, "frames", "--rec", str(args.rec)],
        capture_output=True, text=True
    ).stdout
    first = out.splitlines()[0] if out.splitlines() else ""
    if "graph=" not in first:
        print("无法从 frames 表头解析 graph id", file=sys.stderr)
        sys.exit(1)
    graph_id = first.split("graph=")[1].split(" ")[0]
    graph = load_graph(args.gil, graph_id)
    frames = load_frames(args.log, args.rec)
    if not frames:
        print("无帧", file=sys.stderr)
        sys.exit(1)
    names = ClientNames(graph) if args.client else (lambda i: f"n{i}")

    if args.trace_node is not None:
        print(trace_view(frames, graph, names, args.trace_node))
    else:
        print(control_view(frames, names))


if __name__ == "__main__":
    main()
