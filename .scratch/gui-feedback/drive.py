#!/usr/bin/env python3
"""drive.py — 在焦点租约内逐个「回到派蒙菜单 → 点击 → 抓帧 → 回到派蒙菜单」。

为什么需要状态机：**ESC 是开关，不是"关闭"**。
  · 世界 → ESC → 派蒙菜单
  · 菜单 → ESC → 世界
  · 面板 → ESC → 派蒙菜单
盲按 ESC 会让界面在 菜单/世界 之间反复横跳（首轮实测：5 步里 2 步点在了世界画面上）。

菜单判据（两像素探针，实测 6 帧零歧义，见 README）：
  px(467,556) ≈ (236,229,216)   # 队伍配置 格子的浅色底
  px(600,900) ≈ ( 80, 89,107)   # 左面板深底
两者同时命中即「在派蒙菜单」。

用法（必须包在 ys-lease run 里）：
    tools/ys-editor/ys-lease run -- python3 .scratch/gui-feedback/drive.py steps.json 0 5
"""
import json
import os
import socket
import subprocess
import sys
import time

REPO = "/home/h/genshin-ts"
FRAMES = os.path.join(REPO, ".scratch/gui-feedback/frames")
SOCK = f"/run/user/{os.getuid()}/ys-lookd.sock"
ENV = dict(os.environ, DISPLAY=os.environ.get("DISPLAY", ":0"))

MENU_P1 = ((467, 556), (236, 229, 216))
MENU_P2 = ((600, 900), (80, 89, 107))
TOL = 14


def daemon(req, timeout=30):
    c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    c.settimeout(timeout)
    c.connect(SOCK)
    c.sendall((json.dumps(req) + "\n").encode())
    buf = b""
    while not buf.endswith(b"\n"):
        d = c.recv(65536)
        if not d:
            break
        buf += d
    c.close()
    return json.loads(buf.decode())


def px(x, y):
    v = daemon({"cmd": "px", "x": x, "y": y})["v"]
    return tuple(int(t) for t in v.split())


def near(a, b, tol=TOL):
    return all(abs(a[i] - b[i]) <= tol for i in range(3))


def is_menu():
    try:
        return near(px(*MENU_P1[0]), MENU_P1[1]) and near(px(*MENU_P2[0]), MENU_P2[1])
    except Exception:
        return False


def click(x, y, tol=16):
    p = subprocess.run([f"{REPO}/tools/ys-editor/ys-pointer-click", str(x), str(y), str(tol)],
                       capture_output=True, text=True, env=ENV, timeout=25)
    line = (p.stdout + p.stderr).strip().splitlines()
    return p.returncode, (line[-1] if line else "")


def key(code, hold=0.05):
    subprocess.run(["ydotool", "key", f"{code}:1"], env=ENV, timeout=10)
    time.sleep(hold)
    subprocess.run(["ydotool", "key", f"{code}:0"], env=ENV, timeout=10)


def ensure_menu(tries=5, gap=0.8):
    """回到派蒙菜单；返回 (ok, presses)。"""
    if is_menu():
        return True, 0
    for i in range(tries):
        key(1)
        time.sleep(gap)
        if is_menu():
            return True, i + 1
    return False, tries


def grab(path):
    return daemon({"cmd": "grab", "out": path})


def main():
    steps = json.load(open(sys.argv[1]))
    lo = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    hi = int(sys.argv[3]) if len(sys.argv) > 3 else len(steps)
    os.makedirs(FRAMES, exist_ok=True)
    for i, s in enumerate(steps[lo:hi], start=lo):
        t0 = time.time()
        ok, presses = ensure_menu()
        pre = is_menu()
        rc, msg = click(s["x"], s["y"])
        time.sleep(1.6)
        if is_menu():          # 面板没开（部分面板首帧慢）→ 再等一档
            time.sleep(1.5)
        path = os.path.join(FRAMES, f"{i:02d}_{s['name']}.png")
        g = grab(path)
        back_ok, back_presses = ensure_menu()
        rec = {"i": i, "name": s["name"], "target": [s["x"], s["y"]],
               "menu_before": pre, "esc_before": presses,
               "click_rc": rc, "click_msg": msg,
               "opened": not is_menu() if False else None,
               "frame": g.get("path"), "sha": g.get("sha256"),
               "esc_after": back_presses, "menu_restored": back_ok,
               "ms": round((time.time() - t0) * 1000)}
        print(json.dumps(rec, ensure_ascii=False), flush=True)
    g = grab(os.path.join(FRAMES, f"_after_{lo}_{hi}.png"))
    print(json.dumps({"after": g.get("path")}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
