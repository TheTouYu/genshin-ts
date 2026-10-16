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
    import torch, torch.nn.functional as F
    dev = "cuda"
    It = torch.from_numpy(I).permute(2, 0, 1).unsqueeze(0).to(dev)      # 1,C,H,W
    Tt = torch.from_numpy(T).permute(2, 0, 1).unsqueeze(0).to(dev)      # 1,C,h,w
    C, h, w = Tt.shape[1], Tt.shape[2], Tt.shape[3]
    Tm = Tt - Tt.mean()
    Tn = Tm.pow(2).sum().sqrt()
    ones = torch.ones(1, C, h, w, device=dev)
    npx = float(C * h * w)
    s1 = F.conv2d(It, ones)                       # sum(I)
    s2 = F.conv2d(It * It, ones)                  # sum(I^2)
    cross = F.conv2d(It, Tm)                      # sum(I*Tm)
    mean = s1 / npx
    var = (s2 / npx) - mean.pow(2)
    std = (var.clamp_min(1e-9)).sqrt() * np.sqrt(npx)
    ncc = cross / (std * Tn).clamp_min(1e-9)
    idx = int(ncc.argmax())
    _, _, H2, W2 = ncc.shape
    y, x = divmod(idx, W2)
    return x, y, float(ncc.max()), "gpu-cuda"

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

def main():
    cmd = sys.argv[1]
    if cmd == "px":
        x, y = int(sys.argv[2]), int(sys.argv[3])
        p = grab(x, y, 1, 1)[0, 0] * 255
        print(f"{int(round(p[0]))} {int(round(p[1]))} {int(round(p[2]))}")
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
        I = grab(X, Y, W, H)
        x, y, s, backend = ncc(I, T)
        print(f"{X + x + tw // 2} {Y + y + th // 2} {s:.4f} {backend}")
    elif cmd == "grab":
        X, Y, W, H, out = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
        subprocess.run(["import", "-window", WIN, "-crop", f"{W}x{H}+{X}+{Y}", "+repage", out], check=True)
    else:
        print(__doc__); sys.exit(2)

if __name__ == "__main__":
    main()
