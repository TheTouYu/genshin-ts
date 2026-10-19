#!/usr/bin/env python3
"""calib_scroll.py — 滚动标定（以「行」为单位，而不是像素相关）。

为什么不用 moved_px：位移相关在均值剖面上不可靠（实测拖 300px 报 123px，而列表实际前进 2 行≈332px）。
以「条目行号」为刻度既稳又和任务语义一致（"翻 N 行"）。

用法：python3 .scratch/gui-perf/calib_scroll.py --out ~/.dsh/ys-scroll-calib.json
"""
import argparse
import json
import os
import subprocess
import sys
import time

REPO = "/home/h/genshin-ts"
SCROLL = f"{REPO}/tools/ys-editor/ys-scroll"
LIST = f"{REPO}/tools/ys-editor/ys-list"
sys.path.insert(0, f"{REPO}/.scratch/gui-service")
import instruments as I  # noqa: E402


def grab(path="/tmp/calib.jpg"):
    I.daemon_rpc({"cmd": "grab", "out": path}, timeout=60)
    return path


def read_items(tag):
    f = grab(f"/tmp/calib-{tag}.jpg")
    p = subprocess.run([LIST, "--frame", f, "--full"], capture_output=True, text=True, timeout=180)
    try:
        d = json.loads(p.stdout)
    except Exception:                                     # noqa: BLE001
        return []
    return [i["name"] for i in (d.get("items") or [])]


def scroll(args):
    subprocess.run([SCROLL, "--at", "850,500"] + args, capture_output=True, text=True, timeout=180)


def rows_advanced(before, after):
    """用名字匹配算前进了几行：在 after 里找 before[0] 的位置；找不到就用共同条目对齐。"""
    if not before or not after:
        return None
    if before[0] in after:
        return after.index(before[0])
    for i, n in enumerate(before):
        if n in after:
            return i + after.index(n) - 0  # before[i] 出现在 after[j] ⇒ 前进 i+j 行（近似）
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.expanduser("~/.dsh/ys-scroll-calib.json"))
    a = ap.parse_args()
    res = {"at": [850, 500], "tests": []}

    def to_top():
        scroll(["--clicks", "700", "--dir", "up", "--delay", "20"])
        time.sleep(0.6)

    for spec in ([{"drag": 200}, {"drag": 400},
                  {"clicks": 10, "delay": 30}, {"clicks": 20, "delay": 30},
                  {"clicks": 40, "delay": 30}, {"clicks": 20, "delay": 60}]):
        to_top()
        before = read_items("b")
        t0 = time.time()
        if "drag" in spec:
            scroll(["--drag", str(spec["drag"]), "--dir", "down"])
        else:
            scroll(["--clicks", str(spec["clicks"]), "--delay", str(spec["delay"]), "--dir", "down"])
        dt = time.time() - t0
        time.sleep(0.6)
        after = read_items("a")
        adv = rows_advanced(before, after)
        rec = dict(spec, rows=adv, secs=round(dt, 1), before=before[:3], after=after[:3])
        res["tests"].append(rec)
        print(json.dumps(rec, ensure_ascii=False))

    # 汇总：每行需要多少像素/格
    drags = [t for t in res["tests"] if t.get("drag") and t.get("rows")]
    wheels = [t for t in res["tests"] if t.get("clicks") and t.get("rows") and t.get("delay") == 30]
    if drags:
        res["px_per_row"] = round(sum(t["drag"] / t["rows"] for t in drags) / len(drags), 1)
    if wheels:
        res["clicks_per_row"] = round(sum(t["clicks"] / t["rows"] for t in wheels) / len(wheels), 2)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(res, open(a.out, "w"), ensure_ascii=False, indent=1)
    print("\n标定结果：", json.dumps({k: res.get(k) for k in ("px_per_row", "clicks_per_row")}, ensure_ascii=False))
    print("->", a.out)


if __name__ == "__main__":
    main()
