#!/usr/bin/env python3
"""ys_look.py — 窗口图像识别（GPU 优先 / CPU 兜底）

子命令：
  px X Y                 单像素颜色 -> "r g b"
  find TPL.png [X Y W H] 模板匹配   -> "x y score backend"
  grab X Y W H OUT.png   抓取区域
后端：PyTorch CUDA（本机 RTX 3060）优先，缺失/不可用时回退 numpy CPU。
"""
import sys, os, subprocess
import numpy as np

WIN = os.environ.get("YS_WIN", "0x01400001")

def grab(x, y, w, h, retries=2):
    """抓一块像素（原始 RGB 走管道）。**失败要出声**：返回 0 字节直接抛，不当成黑图。

    2026-10-17 反复踩：python 进程若没继承 DISPLAY/XAUTHORITY，`import` 会**立刻失败返回 0 字节**，
    而调用方把它当成"截到一张空图" —— 表现是判态读到陈旧画面或直接崩。
    所以这里：①缺环境先向 ys-env.sh 要；②失败重试一次；③仍空就抛错。
    """
    if not os.environ.get("DISPLAY") or not os.environ.get("XAUTHORITY"):
        try:
            out = subprocess.run(["bash", "-c", f'. "{_ENVSH}" >/dev/null 2>&1; echo "$DISPLAY"; echo "${{XAUTHORITY:-}}"'],
                                 capture_output=True, text=True).stdout.splitlines()
            if len(out) >= 2:
                os.environ["DISPLAY"] = out[0]
                os.environ["XAUTHORITY"] = out[1]
        except Exception:
            pass
    out = b""
    for _ in range(retries + 1):
        out = subprocess.run(["import", "-window", WIN, "-crop", f"{w}x{h}+{x}+{y}", "+repage", "-depth", "8", "rgb:-"],
                             capture_output=True).stdout
        if len(out) == w * h * 3:
            break
    a = np.frombuffer(out, dtype=np.uint8)
    if a.size != w * h * 3:
        raise RuntimeError(f"截取失败 ({a.size} != {w*h*3})")
    return a.reshape(h, w, 3).astype(np.float32) / 255.0

# NCC 的有效性下限：搜索块/模板的标准差至少要有一个灰阶的变化（1/255）。
# 低于此值的块是"平坦"的，NCC 在那里无定义——必须判为不匹配，否则浮点噪声会造出假命中。
MIN_STD = 1.0 / 255.0

def _ncc_np(I, T):
    """numpy FFT + 积分图 的精确 NCC（O(N log N)，无 Python 双层循环）"""
    H, W, C = I.shape; h, w, _ = T.shape
    if h > H or w > W: raise RuntimeError("模板大于搜索区")
    Fs = (H + h - 1, W + w - 1)
    Tf = (T - T.mean())[::-1, ::-1, :]
    cross = np.zeros((H - h + 1, W - w + 1), np.float64)
    for c in range(C):
        A = np.fft.rfft2(I[:, :, c], Fs); B = np.fft.rfft2(Tf[:, :, c], Fs)
        cross += np.fft.irfft2(A * B, Fs)[h - 1:H, w - 1:W]
    def integ(X):
        P = np.zeros((X.shape[0] + 1, X.shape[1] + 1), np.float64)
        P[1:, 1:] = np.cumsum(np.cumsum(X, 0), 1); return P
    P1 = integ(I.sum(2)); P2 = integ((I ** 2).sum(2))
    S1 = P1[h:, w:] - P1[:-h, w:] - P1[h:, :-w] + P1[:-h, :-w]
    S2 = P2[h:, w:] - P2[:-h, w:] - P2[h:, :-w] + P2[:-h, :-w]
    n = h * w * C
    den = np.sqrt(np.maximum(S2 - S1 * S1 / n, 0.0))
    Tn = float(np.sqrt(float(((T - T.mean()) ** 2).sum())))
    # 2026-10-17 修：**分母接近 0 时 NCC 是未定义的，不是"很大"**。
    # 旧写法 np.maximum(den*Tn, 1e-9) 把未定义变成了 4e9 这种天文数字，
    # 而调用方的 `score >= 0.9` 阈值会把它**当成命中**——实测：一张深蓝紫的存档页
    # 让 40×40 的侧栏图标模板报出 score=4055667456，于是"侧栏图标 ⇒ 系统菜单"这条判据
    # 在存档页/结算页全部误触发。
    # 正确语义（fail closed）：未定义 ⇒ 不匹配(0)；NCC 数学上有界 ⇒ 截到 [-1,1]。
    # 有效性的正确判据是「块内至少有 1 个灰阶的变化」，不是"分母 > 某个小数"：
    # 完全均匀的块（实测 settle.png 该处 std=0）上 NCC 无意义，浮点噪声照样能算出 1.0。
    den_min = np.sqrt(float(n)) * MIN_STD
    valid = (den > den_min) & (Tn > np.sqrt(float(h * w * C)) * MIN_STD)
    ncc = np.zeros_like(cross)
    ncc[valid] = cross[valid] / (den[valid] * Tn)
    ncc = np.clip(ncc, -1.0, 1.0)
    yy, xx = np.unravel_index(int(np.argmax(ncc)), ncc.shape)
    return int(xx), int(yy), float(ncc[yy, xx]), "cpu-fft"

def ncc_t(It, Tt):
    """张量原生 NCC：输入已是 GPU 上的 C,H,W float 张量，返回 (x, y, score)。

    为什么要这一层（2026-10-17，GPU 实测）：批量匹配时真正的开销不是数学，而是
    **每锚点的 numpy↔tensor 转换 + PIL 重采样**（10 锚点 690ms，而单次匹配只要 31ms）。
    把"转换"挪到调用方一次做完、模板缩放也在 GPU 上做，常驻服务一次请求就能摊掉这些胶水。
    与 _ncc_gpu 共用同一份数学（_ncc_gpu 已改为调用本函数），不产生第二份实现。
    """
    import torch
    h, w = Tt.shape[1], Tt.shape[2]
    C = It.shape[0]
    H, W = It.shape[1], It.shape[2]
    Tm = Tt - Tt.mean()
    Tn = Tm.pow(2).sum().sqrt()
    Fs = (H + h - 1, W + w - 1)
    A = torch.fft.rfft2(It, s=Fs)
    B = torch.fft.rfft2(Tm.flip(-1).flip(-2), s=Fs)
    cross = torch.fft.irfft2(A * B, s=Fs)[:, h - 1:H, w - 1:W].sum(0)

    def integ(X):
        P = torch.zeros((X.shape[0] + 1, X.shape[1] + 1), device=X.device, dtype=X.dtype)
        P[1:, 1:] = X.cumsum(0).cumsum(1)
        return P

    P1 = integ(It.sum(0))
    P2 = integ((It * It).sum(0))
    S1 = P1[h:, w:] - P1[:-h, w:] - P1[h:, :-w] + P1[:-h, :-w]
    S2 = P2[h:, w:] - P2[:-h, w:] - P2[h:, :-w] + P2[:-h, :-w]
    n = h * w * C
    den = (S2 - S1 * S1 / n).clamp_min(0).sqrt()
    den_min = (float(n) ** 0.5) * MIN_STD
    valid = (den > den_min) & (Tn > (float(h * w * C) ** 0.5) * MIN_STD)
    ncc = torch.zeros_like(cross)
    ncc[valid] = cross[valid] / (den[valid] * Tn)
    ncc = ncc.clamp(-1.0, 1.0)
    idx = int(ncc.argmax())
    W2 = ncc.shape[1]
    y, x = divmod(idx, W2)
    return x, y, round(float(ncc.max().item()), 6)


def _ncc_gpu(I, T):
    """GPU NCC 的 numpy 入口（薄封装：转张量 → ncc_t）。"""
    import torch
    dev = "cuda"
    It = torch.from_numpy(np.ascontiguousarray(I)).permute(2, 0, 1).to(dev)   # C,H,W
    Tt = torch.from_numpy(np.ascontiguousarray(T)).permute(2, 0, 1).to(dev)   # C,h,w
    x, y, s = ncc_t(It.float(), Tt.float())
    return x, y, s, "gpu-cuda"


def ncc(I, T):
    """后端自适应：**成本链 = 进程启动 > 抓取面积 > 计算**。
    小搜索区用 numpy（省掉 torch import 的 2~3s）；大图才上 GPU（计算主导）。
    阈值：搜索区像素 × 模板像素 > 3e7 走 GPU。"""
    H, W, _ = I.shape; h, w, _ = T.shape
    work = H * W * h * w
    if work <= 3e9:   # FFT(CPU) 在多数尺寸下胜过 torch import 开销；超出才上 GPU
        return _ncc_np(I, T)
    try:
        return _ncc_gpu(I, T)
    except Exception as e:
        sys.stderr.write(f"[ys_look] GPU 不可用（{type(e).__name__}），回退 CPU\n")
        return _ncc_np(I, T)

_ENVSH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ys-env.sh")
SOCK = os.environ.get("YS_LOOKD_SOCK", f"/run/user/{os.getuid()}/ys-lookd.sock")
LAST_DAEMON_ERROR = None   # 2026-10-17：常驻服务的错误以前被静默吞掉，见 daemon() 注释

def daemon(req, timeout=30):
    """优先走常驻服务 ys-lookd（省掉 torch import + CUDA 初始化）；连不上返回 None 回退本地。

    2026-10-17 修：以前服务返回 {"error": …} 时静默返回 None，调用方会**无声地**回落到
    本地 X11 截屏路径——而本环境（Wayland/Xwayland）那条路径拿不到像素，最终报出
    「截取失败 (0 != 11059200)」这种与真因无关的错。现在把服务端错误记进 LAST_DAEMON_ERROR，
    由调用方显式打印：**仪器出错要出声**。
    """
    global LAST_DAEMON_ERROR
    if os.environ.get("YS_LOOK_LOCAL") == "1" or not os.path.exists(SOCK):
        return None
    try:
        import socket as _s, json as _j
        c = _s.socket(_s.AF_UNIX, _s.SOCK_STREAM); c.settimeout(timeout); c.connect(SOCK)
        c.sendall((_j.dumps(req) + "\n").encode())
        data = b""
        while not data.endswith(b"\n"):
            ch = c.recv(4096)
            if not ch: break
            data += ch
        c.close()
        r = _j.loads(data.decode())
        if "error" in r:
            LAST_DAEMON_ERROR = r["error"]
            return None
        return r
    except Exception:
        return None

def main():
    cmd = sys.argv[1]
    if cmd == "px":
        x, y = int(sys.argv[2]), int(sys.argv[3])
        r = daemon({"cmd": "px", "x": x, "y": y, "win": WIN})
        if r: print(r["v"]); return
        p = grab(x, y, 1, 1)[0, 0] * 255
        print(f"{int(round(p[0]))} {int(round(p[1]))} {int(round(p[2]))} (local)")
    elif cmd == "find":
        tpl_path = sys.argv[2]
        # 2026-10-17 修：模板路径**必须绝对化**。
        # 常驻服务 ys-lookd 在它自己的 cwd 下解析路径 ⇒ 传相对路径时它内部的 identify 失败、
        # dim 为空、抛 IndexError、错误被吞掉，最后回落到本环境不可用的本地 X11 截屏，
        # 报出一个与真因无关的「截取失败 (0 != …)」。实测：绝对路径正常，相对路径必炸。
        tpl_path = os.path.abspath(tpl_path)
        if not os.path.exists(tpl_path):
            sys.stderr.write(f"[ys_look] 模板不存在: {tpl_path}\n"); sys.exit(3)
        T = grab(0, 0, 0, 0) if False else None
        img = subprocess.run(["magick", tpl_path, "-depth", "8", "rgb:-"], capture_output=True).stdout
        # 模板：读 PNG 尺寸
        dim = subprocess.run(["identify", "-format", "%w %h", tpl_path], capture_output=True, text=True).stdout.split()
        if len(dim) < 2:
            sys.stderr.write(f"[ys_look] identify 读不出尺寸（模板损坏？）: {tpl_path}\n"); sys.exit(3)
        tw, th = int(dim[0]), int(dim[1])
        T = np.frombuffer(img, dtype=np.uint8).reshape(th, tw, 3).astype(np.float32) / 255.0
        if len(sys.argv) > 6:
            X, Y, W, H = map(int, sys.argv[3:7])
        else:
            geo = subprocess.run(["xdotool", "getwindowgeometry", "--shell", WIN], capture_output=True, text=True).stdout
            g = dict(l.split("=") for l in geo.strip().splitlines() if "=" in l)
            X, Y, W, H = 0, 0, int(g["WIDTH"]), int(g["HEIGHT"])
        reg = [X, Y, W, H] if len(sys.argv) > 6 else None
        r = daemon({"cmd": "find", "tpl": tpl_path, "region": reg, "win": WIN})
        if r: print(f"{r['x']} {r['y']} {r['score']} {r['backend']}(daemon)"); return
        if LAST_DAEMON_ERROR:
            sys.stderr.write(f"[ys_look] 常驻服务报错（将回退本地，本环境通常不可用）: {LAST_DAEMON_ERROR}\n")
        I = grab(X, Y, W, H)
        x, y, s, backend = ncc(I, T)
        print(f"{X + x + tw // 2} {Y + y + th // 2} {s:.4f} {backend}(local)")
    elif cmd == "grab":
        X, Y, W, H, out = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
        subprocess.run(["import", "-window", WIN, "-crop", f"{W}x{H}+{X}+{Y}", "+repage", out], check=True)
    else:
        print(__doc__); sys.exit(2)

if __name__ == "__main__":
    main()
