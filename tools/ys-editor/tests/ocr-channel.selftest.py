#!/usr/bin/env python3
"""ocr-channel.selftest.py — ys_ocr 的两条通道判据（daemon 优先 / 显存不足直走 CPU）。

为什么要这个门禁（2026-10-22 真事故）：
  · 一次性 OCR 进程每跑一次就**新建一个 CUDA context**（500MB+）。常态是「原神 + 常驻
    ys-lookd」已占掉 6GB 里的大半 ⇒ 时好时坏：`cudnnCreate` 炸则整条 OCR 抛异常，
    上游 ys-slider / ys-brief 两个门禁恒红。
  · 同一台机器同一帧，常驻服务（引擎热）~0.5s vs 一次性进程（冷启动）~12s，**差 20 倍**。

五条断言（全部离线、不碰屏幕）：
  A1 有常驻服务 ⇒ 走 daemon（`via=daemon`，文字原样来自服务，不是本地重算）
  A2 服务回 error ⇒ 自动回退本地（`via=local`），不许把 CLI 打死
  A3 显存余量不足 ⇒ 直接 CPU（`engine=cpu` 且 `gpu_note` 说明原因），不先建 context
  A4 没有服务 socket ⇒ 走本地（负样本：别把"服务不在"误判成 daemon 成功）
  A5 daemon 回执里的**真实引擎**（cuda/cpu）与 timing 必须透传到客户端（别写死 engine='daemon'）

用法：python3 tools/ys-editor/tests/ocr-channel.selftest.py [--json]
退出码：0 全绿 / 1 有失败。
"""
from __future__ import annotations

import base64
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
OCR = os.path.join(REPO, "tools", "ys-editor", "ys_ocr.py")
PY = os.path.join(REPO, ".scratch", "gui-grounding", "venv-rapidocr", "bin", "python")

# 1x1 白点 PNG：本地通道的对照实验要**足够小**，CPU 上也是亚秒级
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")

PASS = []
FAIL = []


def ok(name, detail=""):
    PASS.append(name)
    print(f"  \u2713 {name}" + (f"  {detail}" if detail else ""))


def bad(name, why, expect, got):
    FAIL.append(name)
    print(f"  \u2717 {name}")
    print(f"      \u52a8\u56e0: {why}")
    print(f"      \u671f\u671b: {expect}")
    print(f"      \u5b9e\u6d4b: {got}")


class FakeDaemon:
    """临时 AF_UNIX 服务：收一行 JSON、回一行 JSON。用来精确控制"服务怎么答"。"""

    def __init__(self, reply):
        self.reply = reply
        self.dir = tempfile.mkdtemp(prefix="ys-ocr-selftest-")
        self.path = os.path.join(self.dir, "lookd.sock")
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.bind(self.path)
        self.sock.listen(4)
        self.sock.settimeout(60)
        self._stop = False
        self.th = threading.Thread(target=self._serve, daemon=True)
        self.th.start()

    def _serve(self):
        while not self._stop:
            try:
                conn, _ = self.sock.accept()
            except Exception:                                    # noqa: BLE001
                return
            try:
                buf = b""
                while not buf.endswith(b"\n"):
                    chunk = conn.recv(65536)
                    if not chunk:
                        break
                    buf += chunk
                conn.sendall((json.dumps(self.reply, ensure_ascii=False) + "\n").encode())
            except Exception:                                    # noqa: BLE001
                pass
            finally:
                conn.close()

    def close(self):
        self._stop = True
        try:
            self.sock.close()
        except Exception:                                        # noqa: BLE001
            pass


def run_ocr(image, env_extra):
    env = dict(os.environ)
    env.update(env_extra)
    p = subprocess.run([PY, OCR, "ocr", image, "--json"],
                       capture_output=True, text=True, env=env, timeout=300)
    out = (p.stdout or "").strip().splitlines()
    for line in reversed(out):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    raise RuntimeError("no json in stdout: rc=%s stderr=%s" % (p.returncode, (p.stderr or "")[-400:]))


def main(argv=None):
    if not os.path.exists(PY):
        print("  \u2717 \u73af\u5883\u7f3a\u5931: rapidocr venv \u4e0d\u5b58\u5728 %s" % PY)
        print("OCR-CHANNEL-RESULT pass=0 fail=1 verdict=FAIL")
        return 1

    tmp = tempfile.mkdtemp(prefix="ys-ocr-selftest-img-")
    tiny = os.path.join(tmp, "tiny.png")
    with open(tiny, "wb") as fh:
        fh.write(TINY_PNG)

    # ── A1：服务在，且答得出来 ⇒ 必须走 daemon，文字原样来自服务
    canned = {"boxes": [{"text": "SENTINEL-FROM-DAEMON", "cx": 5, "cy": 6,
                         "score": 0.99, "box": [[0, 0], [10, 0], [10, 12], [0, 12]]}],
              "n_total": 1, "ms": 3, "via": "daemon"}
    fd = FakeDaemon(canned)
    try:
        # 故意**不覆盖** YS_OCR_LOCAL：注入用例靠它关掉 daemon 优先；测试自己把它清掉
        # 就等于把注入条件抹了（第一版这么写，注入用例当场报「门禁空转」）。
        r = run_ocr(tiny, {"YS_LOOKD_SOCK": fd.path, "YS_OCR_MIN_FREE_MIB": "999999"})
        texts = [b.get("text") for b in r.get("boxes") or []]
        if r.get("via") == "daemon" and texts == ["SENTINEL-FROM-DAEMON"]:
            ok("A1 \u670d\u52a1\u5728 \u21d2 via=daemon \u4e14\u6587\u5b57\u6765\u81ea\u670d\u52a1", f"boxes={texts}")
        else:
            bad("A1 \u670d\u52a1\u5728 \u21d2 via=daemon", "\u6ca1\u4f18\u5148\u7528\u5e38\u9a7b\u670d\u52a1",
                "via=daemon + SENTINEL-FROM-DAEMON", json.dumps(
                    {"via": r.get("via"), "texts": texts}, ensure_ascii=False))
    finally:
        fd.close()

    # ── A5：服务的**真实引擎**必须透传到客户端（2026-10-22 新增）
    # 为什么：daemon 通道以前把 engine 写死成 'daemon'，于是守护因显存预检掉到 CPU 时，
    # 客户端回执看起来一切正常、只是慢 3 倍——"静默降级"看不见。这条守住"引擎可见"。
    fd = FakeDaemon({"boxes": [{"text": "X", "cx": 1, "cy": 1, "score": 0.9,
                                "box": [[0, 0], [2, 0], [2, 2], [0, 2]]}],
                     "n_total": 1, "ms": 3, "via": "daemon", "engine": "cpu",
                     "pipeline": "plain", "cached": True,
                     "timing": {"load": 1.0, "det": 2.0, "cls": 0.0, "rec": 3.0}})
    try:
        r = run_ocr(tiny, {"YS_LOOKD_SOCK": fd.path, "YS_OCR_MIN_FREE_MIB": "999999"})
        if r.get("via") == "daemon" and r.get("engine") == "cpu" and r.get("timing"):
            ok("A5 daemon 的真实引擎透传到客户端", "engine=cpu timing\u2713 cached=%s" % r.get("cached"))
        else:
            bad("A5 daemon 的真实引擎透传到客户端", "\u56de\u6267\u628a\u5f15\u64ce\u5199\u6b7b\u6210 daemon \u6216\u4e22\u4e86 timing",
                "engine=cpu + timing \u975e\u7a7a",
                json.dumps({"via": r.get("via"), "engine": r.get("engine"),
                            "timing": r.get("timing")}, ensure_ascii=False))
    finally:
        fd.close()

    # ── A2：服务回 error ⇒ 回退本地，CLI 不能死
    fd = FakeDaemon({"error": "OCR \u4e0d\u53ef\u7528: \u6a21\u62df"})
    try:
        r = run_ocr(tiny, {"YS_LOOKD_SOCK": fd.path, "YS_OCR_LOCAL": ""})
        if r.get("via") == "local":
            ok("A2 \u670d\u52a1\u62a5\u9519 \u21d2 \u81ea\u52a8\u56de\u9000\u672c\u5730", f"engine={r.get('engine')}")
        else:
            bad("A2 \u670d\u52a1\u62a5\u9519 \u21d2 \u56de\u9000\u672c\u5730", "\u670d\u52a1\u62a5\u9519\u65f6\u6ca1\u56de\u9000",
                "via=local", json.dumps({"via": r.get("via")}, ensure_ascii=False))
    finally:
        fd.close()

    # ── A3：显存余量不足 ⇒ 直接 CPU（阈值调到不可能满足）
    r = run_ocr(tiny, {"YS_OCR_LOCAL": "1", "YS_OCR_MIN_FREE_MIB": "999999"})
    note = str(r.get("gpu_note") or "")
    if r.get("engine") == "cpu" and "\u663e\u5b58\u4f59\u91cf\u4e0d\u8db3" in note:
        ok("A3 \u663e\u5b58\u4e0d\u8db3 \u21d2 \u76f4\u63a5 CPU \u5e76\u8bf4\u660e\u539f\u56e0", note[:60])
    else:
        bad("A3 \u663e\u5b58\u4e0d\u8db3 \u21d2 \u76f4\u63a5 CPU", "\u9884\u68c0\u6ca1\u751f\u6548\u6216\u6ca1\u62a5\u539f\u56e0",
            "engine=cpu + gpu_note \u542b\u300c\u663e\u5b58\u4f59\u91cf\u4e0d\u8db3\u300d",
            json.dumps({"engine": r.get("engine"), "gpu_note": note}, ensure_ascii=False))

    # ── A4：没有服务 socket ⇒ 走本地（负样本）
    r = run_ocr(tiny, {"YS_LOOKD_SOCK": os.path.join(tmp, "nope.sock"), "YS_OCR_LOCAL": "1",
                       "YS_OCR_MIN_FREE_MIB": "999999"})
    if r.get("via") == "local":
        ok("A4 \u65e0\u670d\u52a1 socket \u21d2 \u8d70\u672c\u5730", f"engine={r.get('engine')}")
    else:
        bad("A4 \u65e0\u670d\u52a1 socket \u21d2 \u8d70\u672c\u5730", "\u628a\u300c\u670d\u52a1\u4e0d\u5728\u300d\u5f53\u6210\u4e86 daemon \u6210\u529f",
            "via=local", json.dumps({"via": r.get("via")}, ensure_ascii=False))

    verdict = "PASS" if not FAIL else "FAIL"
    print("\u2500" * 30)
    print(f"OCR-CHANNEL-RESULT pass={len(PASS)} fail={len(FAIL)} verdict={verdict}")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
