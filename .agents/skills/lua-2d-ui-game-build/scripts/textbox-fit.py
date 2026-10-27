#!/usr/bin/env python3
"""千星 textbox 框高/宽度判据计算器与存档审计。

判据来自模拟器源码 studio/play/text-layout.js：
    lineHeight = 1.2 × fontSize
    blockInset = 0.25 × fontSize + 4   （textbox 专属）
    ⇒ 每行需要 h ≥ fontSize × 1.45 + 4，否则**整行静默不画**（无报错、无日志）
宽度：文本行宽超过 width − 4 时**不缩放、只裁尾**（不做 adaptive）。

两种用法：
  1) 算一个控件的需求高度
     python3 textbox-fit.py 26                 # 输出需求高度
     python3 textbox-fit.py 26 --height 40     # 判定 40 高够不够
     python3 textbox-fit.py 44 --pulse 48      # 脉冲放大到 48 号时够不够
  2) 审计整份工程存档
     python3 textbox-fit.py --save workspace/tetris/tetris.save.json
     （默认只报告不改代码；加 --strict 时有违规就 exit 1）

注意：存档里的尺寸是 **authoring 值**。若工程在 layout() 里按 GetUICanvasSize()
重算尺寸，以运行时读数为准（shot 出图 / GetChild 读 size），存档审计只抓
「本来打算就这么大」的控件。
"""
from __future__ import annotations

import argparse
import json
import sys

RATIO = 1.45
INSET = 4.0


def need_height(font_size: float) -> float:
    return font_size * RATIO + INSET


def fmt(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


def calc(args) -> int:
    if args.pulse:
        req = need_height(args.pulse)
        print(f"脉冲字号 {fmt(args.pulse)} ⇒ 每行需要 h ≥ {fmt(req)}")
        if args.font_size is not None:
            print(f"静态字号 {fmt(args.font_size)} ⇒ 每行需要 h ≥ {fmt(need_height(args.font_size))}（框高按两档的较大者取）")
        if args.height is None:
            return 0
        ok = args.height >= req
        print(f"{'PASS' if ok else 'FAIL'} h={fmt(args.height)} 需求 {fmt(req)} "
              f"{'余量 ' + fmt(args.height - req) if ok else '差 ' + fmt(req - args.height)}px")
        return 0 if ok else 1

    req = need_height(args.font_size)
    print(f"fontSize={fmt(args.font_size)} ⇒ 每行需要 h ≥ {fmt(req)}")
    if args.height is None:
        return 0
    delta = args.height - req
    if delta >= 0:
        print(f"PASS h={fmt(args.height)}（余量 {fmt(delta)}px）")
        return 0
    print(f"FAIL h={fmt(args.height)} 差 {fmt(-delta)}px —— 整行会静默不画（差 0.8px 也是零渲染）")
    return 1


def scan_save(path: str, strict: bool) -> int:
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)

    rows: list[tuple[str, str, float, float, str]] = []  # name, platform, size, height, alignment

    def walk(node, path_hint=""):
        if isinstance(node, dict):
            if node.get("kind") == "textbox" and isinstance(node.get("fontSize"), (int, float)):
                name = node.get("name") or node.get("id") or "?"
                align = node.get("verticalAlignment") or "?"
                tbp = node.get("transformByPlatform") or {}
                sized = False
                for platform, t in tbp.items():
                    size = (t or {}).get("size") or {}
                    h = size.get("y")
                    if isinstance(h, (int, float)):
                        sized = True
                        rows.append((name, platform, float(node["fontSize"]), float(h), align))
                if not sized and isinstance(node.get("height"), (int, float)):
                    rows.append((name, "-", float(node["fontSize"]), float(node["height"]), align))
            for k, v in node.items():
                walk(v, f"{path_hint}/{k}")
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{path_hint}/{i}")

    walk(doc)
    if not rows:
        print("没找到带 fontSize 的 textbox（确认路径是 *.save.json）")
        return 2

    bad = 0
    for name, platform, size, h, align in sorted(rows):
        req = need_height(size)
        if h < req:
            bad += 1
            print(f"FAIL {name:14s} {platform:10s} fontSize={fmt(size):>5s} h={fmt(h):>6s} "
                  f"需≥{fmt(req):>6s} 差 {fmt(req - h)}px（整行不画）")

    top = sum(1 for *_, align in rows if align != "Middle")
    print(f"\n共 {len(rows)} 条 textbox×平台记录，框高违规 {bad} 条，verticalAlignment≠Middle {top} 条")
    print("提示：存档里是 authoring 尺寸；若 layout() 里按画布重算过，以运行时读数为准（出图 + GetChild 读 size）。")
    print("提示：verticalAlignment 默认 Top（顶格会被切），要居中必须显式写 Middle。")
    if strict and bad:
        return 1
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="千星 textbox 框高判据计算器 / 存档审计")
    ap.add_argument("font_size", nargs="?", type=float, help="字号")
    ap.add_argument("--height", type=float, help="实际给定的框高")
    ap.add_argument("--pulse", type=float, help="脉冲放大后的字号（如标题脉冲到 48）")
    ap.add_argument("--save", help="工程存档 *.save.json，审计全部 textbox")
    ap.add_argument("--strict", action="store_true", help="审计模式下有违规就 exit 1")
    args = ap.parse_args()

    if args.save:
        return scan_save(args.save, args.strict)
    if args.font_size is None:
        ap.print_help()
        return 2
    return calc(args)


if __name__ == "__main__":
    sys.exit(main())
