#!/usr/bin/env python3
"""gui-snap — 素材快收小弹窗（只为"看到就抓"，不依赖录屏/截图工具的热键）。

为什么存在（2026-10-18 用户提）：GSR 截图要等编码、要切换窗口、命名与落盘不可控；
我们需要一个**常驻小窗**：窗口在后面也能抓（XShm 直接打在窗口上），一次点击 5–20ms 落盘，
按内容哈希去重、写 manifest，全程可自定义。

用法：
  DISPLAY=:1 python3 tools/gui-snap.py                    # 弹窗（目标默认 yuanshen.exe）
  DISPLAY=:1 python3 tools/gui-snap.py --class beyondeditor.exe
  python3 tools/gui-snap.py --selftest                   # 无界面自检：抓一张并落盘

约定：落盘到 .scratch/gui-corpus/inbox/raw/，命名 snap_<时间戳>.jpg；同一画面（同 sha）只存一次。
"""
import argparse
import hashlib
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CAP_MODULE = os.path.join(HERE, "ys-editor", "ys_capture.py")
INBOX_DEFAULT = ".scratch/gui-corpus/inbox"


def load_capture():
    spec = importlib.util.spec_from_file_location("ys_capture", CAP_MODULE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # noqa: S301 本地自有模块
    return mod


def find_window(display, want_class):
    """按 WM_CLASS 子串找窗口，返回 (win_hex, w, h) 或 None。"""
    from Xlib import display as xd, X
    d = xd.Display(display)
    want = want_class.lower()
    stack = [d.screen().root]
    while stack:
        w = stack.pop()
        try:
            cls = w.get_full_property(d.intern_atom("WM_CLASS"), X.AnyPropertyType)
            val = ""
            if cls is not None:
                v = cls.value
                val = (v.decode("latin-1", "ignore") if isinstance(v, (bytes, bytearray))
                       else str(v))
            if want in val.lower().replace("\x00", " "):
                g = w.get_geometry()
                return hex(int(w.id)), g.width, g.height
            stack.extend(w.query_tree().children)
        except Exception:  # noqa: BLE001
            continue
    return None


class Snapper:
    def __init__(self, display, want_class, inbox):
        self.display = display
        self.want_class = want_class
        self.inbox = inbox
        self.raw = os.path.join(inbox, "raw")
        os.makedirs(self.raw, exist_ok=True)
        self.manifest = os.path.join(inbox, "manifest.jsonl")
        self.cap = load_capture()
        self.grab = None
        self.win_key = None
        self.count = 0
        self.seen = self._load_sha()

    def _load_sha(self):
        s = set()
        if os.path.exists(self.manifest):
            for line in open(self.manifest, encoding="utf-8"):
                try:
                    s.add(json.loads(line)["sha"])
                except Exception:  # noqa: BLE001
                    pass
        return s

    def _ensure(self):
        found = find_window(self.display, self.want_class)
        if not found:
            raise RuntimeError(f"找不到 WM_CLASS 含「{self.want_class}」的窗口")
        win, w, h = found
        if self.grab is None or self.win_key != (win, w, h):
            if self.grab:
                self.grab.close()
            self.grab = self.cap.XShmGrabber(self.display, int(win, 0), w, h)
            self.win_key = (win, w, h)
        return w, h

    def snap(self):
        """先走 XShm（5–20ms）；窗口最小化/不可映射时自动切 KWin ScreenShot2（242–288ms）。"""
        try:
            w, h = self._ensure()
            rgb, ms = self.grab.grab()
            return self._save(rgb, ms, w, h, "xshm-window")
        except Exception as e:  # noqa: BLE001
            ks = self.cap.KWinSS2(self.want_class)
            rgb, ms, meta = ks.grab()
            return self._save(rgb, ms, rgb.shape[1], rgb.shape[0], "kwin-ss2", note=str(e))

    def _save(self, rgb, ms, w, h, source, note=""):
        data = self.cap.encode_jpg(rgb, quality=92)
        sha = hashlib.sha256(data).hexdigest()
        if sha in self.seen:
            return {"ok": True, "dup": True, "ms": round(ms, 1), "w": w, "h": h, "src": source}
        name = "snap_%s.jpg" % time.strftime("%Y-%m-%d_%H-%M-%S")
        path = os.path.join(self.raw, name)
        with open(path, "wb") as f:
            f.write(data)
        rec = {"src": "gui-snap", "capture_source": source, "dst": os.path.abspath(path),
               "sha": sha, "w": w, "h": h, "bytes": len(data), "class": self.want_class,
               "mtime": time.strftime("%Y-%m-%dT%H:%M:%S"),
               "ingested_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
        with open(self.manifest, "a", encoding="utf-8") as mf:
            mf.write(json.dumps(rec, ensure_ascii=False) + "\n")
        self.seen.add(sha)
        self.count += 1
        return {"ok": True, "dup": False, "path": path, "ms": round(ms, 1),
                "w": w, "h": h, "bytes": len(data), "src": source, "note": note}

    def close(self):
        if self.grab:
            self.grab.close()


def run_gui(snapper):
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title("素材快收")
    root.geometry("380x210+40+40")
    root.attributes("-topmost", True)

    cls_var = tk.StringVar(value=snapper.want_class)
    status = tk.StringVar(value="空格 / 点按钮 = 抓一张")
    detail = tk.StringVar(value=f"落盘：{os.path.abspath(snapper.raw)}")

    frm = ttk.Frame(root, padding=10)
    frm.pack(fill="both", expand=True)
    ttk.Label(frm, text="目标窗口 WM_CLASS 含：").pack(anchor="w")
    ent = ttk.Entry(frm, textvariable=cls_var)
    ent.pack(fill="x", pady=(0, 8))

    def do_snap(_evt=None):
        snapper.want_class = cls_var.get().strip() or snapper.want_class
        try:
            r = snapper.snap()
        except Exception as e:  # noqa: BLE001
            status.set(f"✗ {e}")
            return
        if r.get("dup"):
            status.set(f"重复画面（未重复落盘）｜{r['ms']}ms")
        else:
            status.set(f"✓ 第 {snapper.count} 张｜{r['ms']}ms｜{r['w']}×{r['h']}")
            detail.set(os.path.basename(r["path"]))

    btn = ttk.Button(frm, text="抓一张（空格）", command=do_snap)
    btn.pack(fill="x", pady=4)
    ttk.Label(frm, textvariable=status).pack(anchor="w", pady=(6, 0))
    ttk.Label(frm, textvariable=detail, wraplength=350).pack(anchor="w")
    root.bind("<space>", do_snap)
    root.bind("<Return>", do_snap)
    root.bind("<Escape>", lambda _e: root.destroy())
    root.mainloop()
    snapper.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--display", default=os.environ.get("DISPLAY", ":1"))
    ap.add_argument("--class", dest="cls", default="yuanshen.exe")
    ap.add_argument("--inbox", default=INBOX_DEFAULT)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    snap = Snapper(args.display, args.cls, args.inbox)
    if args.selftest:
        try:
            r = snap.snap()
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
            return 2
        print(json.dumps(r, ensure_ascii=False))
        snap.close()
        return 0
    run_gui(snap)
    return 0


if __name__ == "__main__":
    sys.exit(main())
