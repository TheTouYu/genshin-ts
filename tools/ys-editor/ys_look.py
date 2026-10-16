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

def grab(x, y, w, h):
    out = subprocess.run(["import", "-window", WIN, "-crop", f"{w}x{h}+{x}+{y}", "+repage", "-depth", "8", "rgb:-"],
                         capture_output=True).stdout
    a = np.frombuffer(out, dtype=np.uint8)
    if a.size != w * h * 3:
        raise RuntimeError(f"截取失败 ({a.size} != {w*h*3})")
    return a.reshape(h, w, 3).astype(np.float32) / 255.0

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
    Tn = np.sqrt(float(((T - T.mean()) ** 2).sum()))
    ncc = cross / np.maximum(den * Tn, 1e-9)
    yy, xx = np.unravel_index(int(np.argmax(ncc)), ncc.shape)
    return int(xx), int(yy), float(ncc[yy, xx]), "cpu-fft"

def _ncc_gpu(I, T):
    """GPU NCC：FFT 相关 + cumsum 积分图（O(N log N)，避免大核 conv2d 的 O(N·k)）"""
    import torch
    dev = "cuda"
    H, W, C = I.shape; h, w, _ = T.shape
    It = torch.from_numpy(I).permute(2, 0, 1).to(dev)            # C,H,W
    Tt = torch.from_numpy(T).permute(2, 0, 1).to(dev)            # C,h,w
    Tm = Tt - Tt.mean(); Tn = Tm.pow(2).sum().sqrt()
    # ① 分子：互相关走 FFT
    Fs = (H + h - 1, W + w - 1)
    A = torch.fft.rfft2(It, s=Fs); B = torch.fft.rfft2(Tm.flip(-1).flip(-2), s=Fs)
    cross = torch.fft.irfft2(A * B, s=Fs)[:, h - 1:H, w - 1:W].sum(0)     # H-h+1, W-w+1
    # ② 分母：局部和/平方和走 cumsum 积分图
    def integ(X):
        P = torch.zeros((X.shape[0] + 1, X.shape[1] + 1), device=dev, dtype=X.dtype)
        P[1:, 1:] = X.cumsum(0).cumsum(1); return P
    P1 = integ(It.sum(0)); P2 = integ((It * It).sum(0))
    S1 = P1[h:, w:] - P1[:-h, w:] - P1[h:, :-w] + P1[:-h, :-w]
    S2 = P2[h:, w:] - P2[:-h, w:] - P2[h:, :-w] + P2[:-h, :-w]
    n = h * w * C
    den = (S2 - S1 * S1 / n).clamp_min(0).sqrt()
    ncc = cross / (den * Tn).clamp_min(1e-9)
    idx = int(ncc.argmax()); W2 = ncc.shape[1]
    y, x = divmod(idx, W2)
    return x, y, round(float(ncc.max().item()), 6), "gpu-cuda"

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

SOCK = os.environ.get("YS_LOOKD_SOCK", f"/run/user/{os.getuid()}/ys-lookd.sock")

def daemon(req, timeout=30):
    """优先走常驻服务 ys-lookd（省掉 torch import + CUDA 初始化）；连不上返回 None 回退本地"""
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
        return None if "error" in r else r
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
        T = grab(0, 0, 0, 0) if False else None
        img = subprocess.run(["magick", tpl_path, "-depth", "8", "rgb:-"], capture_output=True).stdout
        # 模板：读 PNG 尺寸
        dim = subprocess.run(["identify", "-format", "%w %h", tpl_path], capture_output=True, text=True).stdout.split()
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
