#!/usr/bin/env python3
"""帧透视表：把 frames dump 中「按变量名序列写值」的复合调用透视成一行一拍的轨迹表。

适用模式：镜像应用/状态发布类复合（如足球 fb_mirror_apply 每拍按
tick,px,py,pz,vx,vy,vz,...,state 顺序写实体变量）。
定位：状态机轨迹/冻结类问题第一视图——一张表看全 pos/vel/state 全程，
替代逐记录翻帧；配合离线复现脚本可做逐位对照（根因实锤双验证）。

用法：
  python3 gia_log.py <日志.gia> frames --graph <服务端图id> --gil <地图.gil> > dump.txt
  python3 gia_log_pivot.py dump.txt --composite fb_mirror_apply \
      --rows fb_ball_tick --cols fb_ball_py,fb_ball_vy,fb_ball_state

输出：TSV，表头=列变量短名（去共同前缀）；行=rows 变量每出现一次一行。
注意：空值显示（IN2:Float= 后空白）= 有效值 0（引擎空显示约定）。
"""
import argparse
import re


def main():
    ap = argparse.ArgumentParser(description="帧透视表（复合写值序列转轨迹表）")
    ap.add_argument("dump", help="gia_log.py frames 的输出文件")
    ap.add_argument("--composite", required=True, help="复合名（行内 复合:名 匹配）")
    ap.add_argument("--rows", required=True, help="行键变量名（每出现一次开新行）")
    ap.add_argument("--cols", required=True, help="列变量名，逗号分隔")
    args = ap.parse_args()
    cols = [c.strip() for c in args.cols.split(",") if c.strip()]
    names = [args.rows] + cols
    prefix = names[0]
    for n in names[1:]:
        while prefix and not n.startswith(prefix):
            cut = prefix.rfind("_")
            prefix = prefix[:cut] if cut > 0 else ""

    def short(n):
        s = n[len(prefix):] if prefix else n
        return s.lstrip("_") if s else n

    pat = "|".join(re.escape(x) for x in names)
    name_re = re.compile(r"IN\d+:String=(" + pat + r")\b")
    val_re = re.compile(r"IN\d+:(?:Integer|Float|Boolean)=([-0-9.eE]*)")
    rows_out = []
    cur = None
    for line in open(args.dump, encoding="utf-8", errors="replace"):
        if args.composite not in line:
            continue
        m = name_re.search(line)
        if not m:
            continue
        name = m.group(1)
        v = val_re.search(line)
        val = v.group(1) if v else ""
        if name == args.rows:
            if cur is not None:
                rows_out.append(cur)
            cur = {args.rows: val}
            for c in cols:
                cur[c] = ""
        elif cur is not None:
            cur[name] = val
    if cur is not None:
        rows_out.append(cur)
    print("\t".join([short(args.rows)] + [short(c) for c in cols]))
    for r in rows_out:
        print("\t".join([r.get(args.rows, "")] + [r.get(c, "") for c in cols]))


if __name__ == "__main__":
    main()
