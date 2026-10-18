# 抓帧路径横评（票 25 / 33）

> 实测：2026-10-18 20:5x–21:1x｜仓库 `/home/h/genshin-ts`｜机器：RTX 3060 Laptop / 16 核 / 2560×1440
> 会话：**KDE Wayland**（`XDG_SESSION_TYPE=wayland`，`WAYLAND_DISPLAY=wayland-1`，Xwayland `DISPLAY=:1`，`XAUTHORITY=/run/user/1000/xauth_TjagyC`）
> 目标窗：原神 `0x01400001`（2560×1440 @0,0，WM_CLASS `yuanshen.exe`），**实测时在虚拟桌面 3、当前桌面 1**
> 复现：`python3 .scratch/gui-perf/bench_capture.py --iters 5 --out .scratch/gui-perf/capture-bench.json`
> 原始读数：`.scratch/gui-perf/capture-bench.json`、probe 脚本 `.scratch/gui-perf/probe/`

---

## ⚠️ 本轮的第二个关键发现（票 34 的根因，必读）

**X11/EWMH 的桌面属性会骗人，X11 快路径因此 fail-open**。2026-10-18 21:1x 实测（同一时刻）：

```
xprop -root _NET_CURRENT_DESKTOP        → 0
xprop -id 0x01400001 _NET_WM_DESKTOP     → 0        ⇒ ys_attrib.py 判 "OK"
ys-atop --json --verify（KWin 权威）      → OTHER_DESKTOP（游戏 desktop 3 / 当前 desktop 1，covered_ratio=1.0）
spectacle 全屏抓到的帧                     → 是 Firefox（DSH Web GUI），不是原神
```

**KWin 没有随虚拟桌面移动更新 X11 的 `_NET_WM_DESKTOP`**（本会话 `_NET_CLIENT_LIST_STACKING` 里也只有原神一个 X11 窗，
Wayland 原生窗口根本不在 EWMH 里）。⇒ 这解释了票 34「`ys-observe frame` 报 atop:true 却抓到浏览器」：

1. **快路径看不见 Wayland 原生窗口**（Firefox/kitty 等不在 `_NET_CLIENT_LIST_STACKING`）；
2. **它读到的桌面号是陈旧的**，所以"目标桌面 == 当前桌面"这条判据会给出假 OK。

**落地的判据**（已在 `ys-capture` 里实现）：X11 快路径**只能做保守拒绝**（身份/最小化/明显不一致时立刻拒），
**权威闸门只能是 KWin 通道**（`ys-atop --verify`，单次 1.2s / 子进程 CPU 73ms ⇒ 后台 2s 一次 + 客户端按 TTL 判旧）；
KWin 通道不可用或结论过旧 → **fail-closed（exit 9）**，绝不拿 X11 冒充。
`ys-capture selftest` 里 `gate_kwin_unavailable`（strict_src=x11 → exit 9）就是这条的回归用例。

## 结论先行

1. **抓一帧 2560×1440 的原神画面，进程内 XShmGetImage = 1.5–12ms**（中位 7ms）。
   换任何「外部命令行」都要多付 90–1100ms：`import -window` raw **97ms**、`import -window` PNG **1052ms**、
   `spectacle` 全屏 PNG **563ms**（546–971）。⇒ **快的那条路是「常驻进程 + 共享内存读回」，
   不是「换一个更快的截图工具」**（瓶颈是进程启动 + PNG 编码 + 走 socket 的 14.7MB 读回）。
2. **按窗口 id 抓图天然不会抓错对象**：同一时刻 XShm 帧与 python-xlib XGetImage 帧**逐像素相等**（diff=0）；
   与 `import … rgb:-` 在**静态区域逐像素相等**（右上资源区 max=0），动态区域差异来自画面动画。
   **通道序是静默坑**：XShm/ZPixmap 给的是 **BGRX**，`import rgb:-` 给的是 **RGB**——直接混用不报错、只掉准。
3. **`spectacle` 全屏抓的是「当前虚拟桌面」，不是目标窗口**：本次实测抓到的帧是 **DSH Web GUI（Firefox）**，
   而同一时刻 `ys-observe frame` 仍报 `atop:true/verdict=OK`（X11/EWMH 快路径）——这正是票 34 的 fail-open。
   KWin 权威路径（`ys-atop --json --verify`）同一时刻判 **OTHER_DESKTOP**（游戏 desktop 3 / 当前 desktop 1）。
4. **GSR（gpu-screen-recorder 6.1.4）在本机不合适**：Wayland 下走 portal 授权（要交互选屏，且无已保存 token）、
   抓的是**整屏**而不是指定窗口、输出是编码视频（取「最新帧」必须解码 GOP）。
   它的强项是「持续录屏」，不是「≤30ms 取一帧指定窗口」——本机 KMS 路径也不可用（`gsr-kms-server` 非 setuid）。
5. `grim` 在 KWin 上**不可用**，且**失败时 rc=0**（stderr 才有 `compositor doesn't support the screen capture protocol`）——
   按退出码判成功会 fail-open。
6. 因此推荐路径 = **`ys-capture`（常驻 XShm 抓帧 + /dev/shm 环形缓冲 + 两路归属校验）**，
   客户端 `ys-capture latest` 实测 **4ms**（bmp/png/raw 都是硬链，同 /dev/shm），默认路径在
   「目标窗不在当前桌面」时**拒绝返回像素（exit 4）**。

## 横评表（单帧端到端，含进程启动；N=5，除注明）

| 路径 | min / median / max (ms) | 读回机制 | CPU/次 | GPU 峰值 | 需要焦点 | 失败模式 |
|---|---|---|---|---|---|---|
| **XShmGetImage（进程内）** | **1.5 / 7.1 / 11.8** | MIT-SHM 共享内存，XWayland 直接写 shm | 17.4ms（含 BGRX→RGB 11MB 拷贝 + numpy） | 14–15%（游戏本身占用，抓帧≈0） | 否 | MIT-SHM 不可用（需 fallback）；窗口销毁 → BadWindow（可恢复） |
| python-xlib XGetImage（进程内） | 52.8 / 69.6 / 85.6 | X11 GetImage 走 socket（14.7MB） | 92.1ms | 14% | 否 | 同上；慢 10× |
| `import -window <win>` raw `rgb:-` | 91.3 / 96.5 / 101.6 | ImageMagick 进程 + XGetImage + 11MB stdout | 13.2ms（父进程序时；子进程另计） | 14% | 否 | IM 缺失；窗口被压住时可能拿到陈旧帧（实测窗口在别的桌面仍拿到活帧，但不能据此假定新鲜） |
| `import -window <win>` PNG | 1043 / 1052 / 1104 | 上面 + PNG 编码 | 63.2ms | 15% | 否 | PNG 编码占 ~950ms |
| ffmpeg x11grab `-window_id` 连续流 | **33.1ms/帧**（88 帧/3s） | XCB SHM 逐帧读回 + rawvideo 管道 | ~96ms/s（≈10% 单核） | 14% | 否 | 需要常驻读端+环形缓冲；断流无通知 |
| ffmpeg `-i :1`（root，Xwayland） | 113.8 / 121.9 / 185.6 | 抓 X root 窗口 | 12.6ms | 15% | 否 | **全黑帧**（mean=0.0）：Xwayland rootless 的 root 窗口没有内容 → 不可用 |
| `import -window root` | 失败（0/5） | — | — | — | — | `import: missing an image filename`（同上：root 无内容） |
| **`spectacle -b -n -f -o`（全屏 PNG）** | 545.7 / 562.7 / 970.7 | KWin 合成器全屏 + PNG 编码 | 44.7ms | 14% | 否（但需 session env） | **抓当前桌面**（目标窗在别的桌面/被盖住 → 抓到别的窗口）；缺 `XDG_RUNTIME_DIR` 会 SIGABRT；546–971ms 抖动 |
| `grim` | 失败（0/5，4–5ms） | wlroots screencopy | — | — | — | KWin 不支持；**rc=0 但无输出**（fail-open） |
| `ys-observe frame`（当前唯一入口） | **976.5ms**（N=1） | 归属校验(20ms) + spectacle + PNG + magick 差分 | 42.7ms | 14% | 否 | 上表 spectacle 的全部失败模式；本次抓到的是 Firefox，仍报 `atop:true` |
| GSR 6.1.4 | **未测（不可无人值守）** | portal ScreenCast → PipeWire → GPU 编码 → 解码取帧 | — | — | **需要**（portal 对话框选屏） | 无 token 时弹授权窗；只抓整屏；取最新帧要解 GOP（预计 100ms+）；KMS 路径需 root |

**GPU 口径**：`nvidia-smi` 在抓帧期间峰值 14–15%（空闲基线亦 14%，原神本身在渲染）⇒ **抓帧不吃 GPU**，
不要把 14% 当「抓帧的 GPU 占用」报。CPU 口径 = 该路径每次调用的子进程/进程 CPU 时间（采样自 `resource.getrusage` 与 `/proc/<pid>/stat`）。

## 内容对账（防「抓到别的窗口/陈旧帧/通道序错」）

| 检查 | 结果 |
|---|---|
| XShm 帧 vs python-xlib XGetImage 同刻 | **diff=0 像素**（逐像素相等） |
| XShm 帧 vs `import -window … rgb:-` | 静态区（右上资源 460×80）**max=0**、逐像素相等；全帧 10.6% 像素差（画面动画，非通道序） |
| BMP 预编码 vs raw RGB / PNG 预编码 vs raw RGB | **逐像素相等**（同 crc32 帧） |
| XShm 帧 vs spectacle 全屏 | mean_abs=172.9 → **内容不同**（spectacle 抓到 Firefox） |
| 连续采样是否活帧 | 120ms 间隔 12 帧里 6 次内容变化（diff 25–44 万像素）⇒ **窗口在别的桌面时仍在渲染** |

> 结论：**「按窗口 id 抓图」是身份安全的**（不会抓到浏览器），但**不能证明「用户看到的是游戏」**——
> 归属校验必须保留；而 X11/EWMH 快路径会 fail-open（见下），权威闸门只能走 KWin。

## 票 34 / fail-closed 实测（当前会话：游戏在 desktop 3、当前 desktop 1）

```
$ ys-capture latest --out /dev/shm/x.bmp --format bmp        # 默认（严格）
{"ok":false,"error":"OTHER_DESKTOP","detail":"KWin：窗口不在当前虚拟桌面","ms":2,"pixels_returned":false}
rc=4   # 没有生成 /dev/shm/x.bmp —— 拒绝返回像素

$ ys-atop --json                      # X11/EWMH 快路径（ys-observe 默认用它）
{"verdict":"OK","src":"x11", ...}                       # ← fail-open：同一时刻屏幕上是 Firefox
$ ys-atop --json --verify             # KWin 权威路径（1.22s wall / 73ms 子进程 CPU）
{"verdict":"OTHER_DESKTOP","src":"kwin","covered_ratio":1.0, ...}   # ← 正确
```

**根因（新增证据）**：本机 `xprop -root _NET_CURRENT_DESKTOP`=0、原神 `_NET_WM_DESKTOP`=0 ⇒ EWMH 认为两者同桌面；
KWin 内部认为游戏在 desktop 3、当前 desktop 1。**EWMH 桌面属性在这个会话里不可信**（KWin 未随移动更新该 X11 属性）。
⇒ 归属判据必须「快路径只做保守拒绝、KWin 通道才是权威」；KWin 通道不可用/结论过旧时 **fail-closed（exit 9）**，
不能拿 X11 冒充（这正是票 34 的核心教训）。

## ys-capture（新工具，独立于 ys-observe）

```bash
ys-capture serve --fps 10 --ring 4 --pre bmp,png   # 常驻：XShm 抓帧 → /dev/shm 环形缓冲 + 预编码
ys-capture latest --out /dev/shm/f.png --format png # 客户端：~4ms（同 /dev/shm 硬链）
ys-capture latest --out ./f.bmp --format bmp        # 跨设备：回退拷贝（10.5MB ≈ 6–24ms）
ys-capture status | stop | selftest | bench
```

| 读数 | 值 |
|---|---|
| 守护进程抓帧 `capture_ms`（XShmGetImage） | **1.4–12ms**（中位 ~7ms） |
| 守护主循环单帧总耗时 `loop_ms` | 25ms（含 BGRX→RGB 11MB 拷贝、crc32、落盘 11MB） |
| 客户端 `latest`（同 /dev/shm 硬链，**含 bash 启动**，N=20） | bmp **13ms 中位**（11–16，20/20 成功）；raw **13ms**（20/20）；png **13ms**（17/20，3 次因后台编码落后而 fail-closed；加 `--wait-encode-ms 80` → 10/10、12ms 中位） |
| 客户端内部自报（去掉进程启动） | 4ms |
| 帧龄（state 里的 `age_ms`） | 9–97ms @10fps |
| 守护 CPU | 10fps+bmp **32% 单核**（RSS 128MB，/dev/shm 74MB）；10fps+bmp+png **49%**（/dev/shm 106MB）；5fps+bmp+png **34%** |
| 内容未变时 | 不重写 11MB、不重编码（`frames_written/frames_reused` 可查；实测 25 reuse / 5 write） |
| 编码策略 | **BMP 同步**（3–5ms，保证 bmp 请求 20/20 命中）；PNG/JPG 后台线程（内容变才编，落后时客户端 fail-closed，可 `--wait-encode-ms`） |
| 失败闸门 | 见 `ys-capture selftest`：14/14 PASS（6 个拒绝用例都**非零退出且不落像素文件**） |

**环形缓冲位置**：`/dev/shm/ys-capture/`（tmpfs，7.7GB；守护每 15 帧检查剩余空间，<512MB 即停——防 D238 整机卡死事故）。

## 推荐

**用 `ys-capture`（XShm + 环形缓冲 + KWin 权威归属 + fail-closed）替换 `ys-observe frame` 的取帧段**，
`ys-observe` 的 CLI 语义不动（新入口独立文件；接入需 Lead 裁决，本任务不改共享工具）。
PNG 若要进 ≤30ms：给 serve 加 `--pre png`（后台预编码，实测内容变化时 ~25ms/次），客户端只做硬链；
或客户端 `--encode-if-needed`（实测 ~40ms，含 Python 启动）；**raw/BMP 才是零编码的热路径**。

## 复现命令

```bash
# 横评（约 40s）
python3 .scratch/gui-perf/bench_capture.py --iters 5
# 守护成本（三种配置，约 30s）
.scratch/gui-perf/daemon_cost.sh
# 内容/新鲜度对账
python3 .scratch/gui-perf/probe/shm_validate.py
# 归属 fail-open 复现
DISPLAY=:1 tools/ys-editor/ys-atop --json            # 快路径（本次 OK）
DISPLAY=:1 tools/ys-editor/ys-atop --json --verify   # KWin（本次 OTHER_DESKTOP）
# 客户端 fail-closed
./tools/ys-editor/ys-capture latest --out /dev/shm/x.bmp ; echo rc=$?
```
