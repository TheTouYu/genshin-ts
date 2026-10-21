# 性能账本（PERF-LEDGER）——**防止把已达成的 ms 级能力重新做一遍**

> 用户原话：「部分指标是我们之前花了很多力气才优化到 ms 级别的，最怕的就是你自己失忆了，又重头开始。」
> 用法：**动手优化任何性能项之前先查本表**——已达标就先确认"工具在不在、服务起没起"，别重新测、更别重新设计。
> 最近核对：2026-10-19 14:2x

| # | 指标 | **历史最佳** | 怎么做到的（路径/命令） | 2026-10-19 复测 | 状态 |
|---|---|---|---|---|---|
| 1 | 单帧抓取（XShm 常驻 + /dev/shm 环） | **12–13ms** | `tools/ys-editor/ys-capture serve` + `ys-capture latest --out x.png` | 守护能起（win=0x01400001），环内暂无帧 ⇒ 未复测到 12ms | ⚠️ **能力在，按需启**（fps=10 常驻会拖死游戏，只在批量实验期短暂启用） |
| 2 | 同帧 OCR（对象切片 + 内容寻址缓存） | **15–45ms** | `ys-lookd cmd=ocr_objects --frame <绝对路径> --cache true` | **35.9ms** 热（重启后干净资源；首调 1008ms 冷） | ✅ 达标 |
| 3 | 判态 fast 通道 | **123–129ms**（2026-10-19；此前 130–142ms，19 日中午一度退化到 398ms） | `python3 tools/ys-editor/ys-state --fast`；daemon 内 XShm 抓帧 + 同一整帧裁 UID 小条 + 判据取点免 GPU→CPU 回传 | **125ms p50 / 129ms p90**（2026-10-19 14:2x 复测） | ✅ 达标（目标 ≤200ms） |
| 4 | 世界状态 in-process（look 稳态） | **147–162ms** | `.scratch/gui-service/worldsvc.py` + `ys_lookd cmd=world` | 缓存命中 0.7ms；新帧受 OCR 主导 | ⚠️ 需按新帧口径复测 |
| 5 | 对象检测（GPU） | 基准 **5.3ms** / 生产 **27.6ms** | 基准 `.scratch/gui-detect`；生产 `tools/ys-editor/gui_det.py` | **干净资源（重启后）p50 30.2ms / p90 37.3ms**（此前 41.3ms 含系统负载） | ⚠️ 超 ≤10ms 目标 3× |
| 6 | 结构层（D3） | **1.2–9.9ms** | `ys_lookd cmd=world` 内 `_world_structure` | 9.9ms（r028） | ✅ |
| 7 | 列表结构化读取 | **0.11s** 热 / 0.32s 冷 | `tools/ys-editor/ys-list`（走 daemon OCR） | 0.109s / 0.32s | ✅ |
| 8 | 焦点租约内按键 | **32ms** | `ys-lease acquire` 后直接 `ydotool key` | 32ms | ✅ |
| 9 | 非 GUI 项（文档/日志解析等） | — | 见 `docs/maintenance/perf-baseline.tsv` | — | — |

## 结论（给未来的自己）

1. **真正达标的四项**：#2 OCR 热 45ms、#6 结构 9.9ms、#7 列表 0.11s、#8 租约内动作 32ms；
2. **#1 抓帧 12ms 的能力仍在**，但守护不常驻（内存 + 拖死游戏风险）——用时启、用完停；
3. **#3 `ys-state --fast` 已回到 125ms**（2026-10-19 修复：抓帧从 ImageMagick 子进程 ~116ms 换进程内 XShm ~9ms；UID 小条改从同一整帧裁、不再二次抓帧；判据取点免一次 24MB GPU→CPU 回传）；
4. **#5 检测器生产 41.3ms** 离 ≤10ms 还远，是已知欠账（v2 已把 row 召回 0.079 → 0.276）。

## 复测命令

```bash
# #2 OCR 热（跑两次取第二次）
python3 -c "
import sys,os,time
sys.path.insert(0,'.scratch/gui-service'); import instruments as I
f=os.path.abspath('.scratch/gui-corpus/evidence-friend-30d.jpg')
for i in range(2):
    t=time.time(); I.daemon_rpc({'cmd':'ocr_objects','frame':f,'ocr':True,'cache':True,'max_objects':300},timeout=120)
    print(i, round((time.time()-t)*1000), 'ms')"

# #3 判态 fast
for i in 1 2 3; do s=$(date +%s%N); python3 tools/ys-editor/ys-state --fast >/dev/null 2>&1; e=$(date +%s%N); echo $(( (e-s)/1000000 ))ms; done

# #7 列表
time python3 tools/ys-editor/ys-list --frame .scratch/gui-corpus/evidence-friend-30d.jpg --full | head -c 100
```

## 纪律

- **优化前先查本表**；本表已有达标值的项，只做"可用性确认"，不做重新优化。
- 新达成的指标必须**立刻**补进本表（含命令），否则下次压缩后就没了。
- 本表任一行的"状态"变化（达标→退化）都要当日记录，不许静默。


## 2026-10-19 11:5x 重启后复测（排除系统资源干扰）

| 项 | 重启前 | **重启后（干净资源）** |
|---|---|---|
| 检测器生产推理 p50 | 41.3ms | **30.2ms**（p90 37.3） |
| OCR 热 p50 | 45–46ms | **35.9ms** |
| ys-state --fast | 1.45s | 无窗时卡 90s → **已修 0.05s 快失败** |

**结论**：资源争用确实抬高了 20–25%，但**检测器仍超 ≤10ms 目标 3×**，不是环境问题。


## 2026-10-19 12:1x 重启后完整基准（`bench-postboot.py`，n≥10，p50/p90）

| 项 | p50 | p90 | 目标 | 判定 |
|---|---|---|---|---|
| 抓帧（daemon grab） | 224ms | 533ms | ≤200ms | ⚠️ near（1.1×） |
| OCR 热（同帧缓存） | 48.6ms | 4021ms* | ≤45ms | ⚠️ near（*一次冷掉） |
| 对象检测（生产） | 69.8ms | 94.9ms | ≤10ms | ❌ **7×**（游戏占 GPU 时比空载 30ms 更慢） |
| 列表读取 ys-list | 112ms | 220ms | ≤500ms | ✅ |
| 判态 fast（内部 ms） | 286ms | — | ≤200ms | ⚠️ 1.4×（历史 130–142ms） |
| 判态 fast（**CLI wall**） | 1051ms | 1102ms | — | 其中 ~750ms 是 python 启动 |
| 世界 look 新帧 | 797ms | 1363ms | ≤2000ms | ✅ |
| **租约内动作** | **29.2ms** | 30.4ms | ≤50ms | ✅ **达标** |

**结论**：
1. **动作路径已达标**（29ms）——焦点租约是有效设计；
2. **最大欠账是检测器**（69.8ms，7×）：注意它在游戏运行时比空载（30ms）慢一倍多，GPU 争用是真实因素；
3. **CLI 每次起 python ≈750ms** 是"每条命令都慢"的隐性来源，AGI 规模下必须常驻化（RPC 取代 spawn）；
4. 判态 fast 内部 286ms 比历史 130–142ms 慢 2×，需查（可能是锚点数量增加）。


## 2026-10-19 12:5x 本轮优化后复测（同一脚本 `bench-postboot.py`）

| 项 | 优化前 | **优化后** | 变化 |
|---|---|---|---|
| **判态 fast（CLI wall）** | 1051ms | **398ms**（p90 544） | **2.6× 更快** |
| 判态（daemon 内部） | 286–319ms | **333–351ms** | 略慢（多了 UID 补判），但结果正了 |
| 对象检测 | 69.8ms | **48.6ms** | 1.4× 快（GPU 争用也少了） |
| 世界 look（新帧） | 797ms | **603ms** | 1.3× 快 |
| 列表读取 | 112ms | **102ms** | 持平 |
| 抓帧 | 224ms | 217ms | 持平 |
| OCR 热 | 48.6ms | 50.3ms | 持平 |

**本轮两处关键改动**
1. **判态错判修复**：提瓦特世界此前被判成 PLAYTEST/UNKNOWN。修法 = daemon 在 `_state` 内补抓右下 UID 小条 → 常驻 OCR 引擎识别 → 命中则判 GAME_WORLD。
2. **缓存策略修正**：**像素 sha 缓存对游戏画面无效**（画面持续渲染，每帧 sha 都变，实测 3/3 不同）⇒ 改**时间缓存 5s**（UID 只在切场景时变），判态从 1051ms → 398ms。

**纪律补充**：游戏画面 1 秒内就可能完全不同帧，**任何"同帧缓存"在活体上都要按时间而不是按像素指纹**。


## 附：ncc 的 CPU/GPU 实测（2026-10-19 13:0x，用户令「实验也走 GPU」）

| 场景 | CPU | GPU（热） | GPU（冷，含 CUDA/torch 初始化） |
|---|---|---|---|
| 128×128 模板 / 800×600 搜索窗 | **163.6ms** | **15.8ms（10×）** | 11.5s |
| 256×256 模板 | 250ms | 103ms | — |
| 64×64 模板 | 174ms | —（冷 11.5s，不划算） | — |

**结论与用法**：
- GPU **热态快 10×**，但**冷启动要 11.5s**（torch import + CUDA init）；
- ⇒ **实验必须在常驻进程里跑**（daemon 或长循环脚本），一次性脚本用 GPU 反而更慢；
- 开关：`YS_NCC_FORCE_GPU=1` 强制 GPU；`YS_NCC_GPU_MIN_WORK` 调阈值（默认 3e9）；
- 纪律：**实验路径 = 生产路径**（账本 F-1-11）。生产是 daemon 内热态 ⇒ 实验也要热态测。


## 2026-10-21 分组件基准与增量复用（`bench_perf.py`，n=6，离线帧换盐冷测）

> 口径：`p50`，**离线后台帧**（不是可见交互）；同一台机同时跑着原神 + 另一模型进程，p95 有 1.5–1.6s 离群。
> 命令：`python3 .scratch/gui-service/bench_perf.py --tag after --salt 9`；判定：`python3 .scratch/gui-service/bench_check.py`。

| 项 | 优化前 p50 | **优化后 p50** | 目标 | 判定 |
|---|---|---|---|---|
| 默认路径稳态（同页再读，world 全量） | 157.2ms | **37.6ms** | ≤50ms | ✅ |
| world `--fast` 稳态（只跳检测+结构） | — | **36.2ms** | ≤50ms | ✅ |
| 帧级缓存命中 | 2.2ms | **2.0ms** | ≤5ms | ✅ |
| 判态（帧已缓冲，judge） | 101.8ms* | **34.9ms** | ≤50ms | ✅ |
| act dry-run（warm 帧：解析+校验） | — | **2.1ms** | ≤50ms | ✅ |
| expect state_in（同帧热） | 677–1670ms（子进程） | **0.7ms** | — | ✅ |
| 世界 look（新帧，冷） | 802.9ms | **643.9ms** | 冷启动不计入 | ⚠️ OCR 主导 |
| 按对象 OCR 冷（server） | 414.7ms | **407.3ms** | — | 持平（det 187 + rec 194） |
| 对象检测单帧 | 45.6ms | **32–35ms** | ≤10ms | ❌ 3× 欠账 |
| 帧加载（PNG→GPU float） | 165.2ms | **91.9ms** | — | 1.8× 快 |
| 容器层冷 | 150.0ms | **166.5ms** | — | 持平（系统负载） |
| 客户端 JSON 解析（23.5KB） | 0.29ms | **0.31ms** | — | 持平 |

**本轮两处关键改动**
1. **页级增量复用**：`_world` 用「页灰度差 <1.0 + OCR 文本盒签名完全相同 + 1.2s 上限」门控，命中时容器/检测/结构直接复用（`timing.objects_reuse/structure_reuse="prev-page"`）。稳态从 157ms → 37.6ms，**判态仍用当前帧现算**。
2. **帧加载去 CPU 临时数组**：uint8 张量直接上 GPU 再 `/255`（旧写法在 CPU 造两份 44MB float32）；PNG 解码跳过 `.convert("RGB")` 整帧复制。

**未采纳（有读数）**：OCR det 输入长边 2000→1600 只省 17ms（156→139ms），字符召回掉到 **93.97%**（min 92.0%，漏 15/172 框，全是 `min:/max:/FPS` 小字）；1280 掉到 83.1%。**召回不降是硬约束 ⇒ 不降 det 尺度。**

## 2026-10-21 反馈轮：真机固定开销拆解与会话化（离线可复现）

| 项 | 前（真机 W1-retry2） | 后（离线/代码） | 判据 |
|---|---|---|---|
| 单次滚动 | **5.32s p50**（自建 slot） | 会话内直注入：注入 1.05s + settle 0.15s + look 0.8s ≈ **2.0s/屏**（真机待 60s 验证） | `ys-scroll --plan` 会话命中 in_slot=true |
| ESC | 6.65s（含固定 sleep 2.12s） | 固定等待 **0.2s**（`YS_ESC_SETTLE_MS`） | `ys-esc --plan` settle_ms=200 |
| live 抓帧 | import 路径（非前台不可用；旧缓冲风险） | `ys-capture latest` **45.7ms p50**（36.2–45.7 热） | `_capture_frame_via_ys_capture` 4 次实测 |
| daemon 首次 world | **2393.7ms**（detector 699.5 / state 970.2） | **375.3ms**（detector 37.1 / state 95.4） | 重启后等「感知预热完成」再跑 |
| 预热后 warm world | — | **97.1ms**（load 0.1 / state 35.8 / objects 1.2 / detector 44.6 / structure 53.0） | 离线 f06 |
| 扫描条带 OCR | — | 行召回 63.6/90.9/75.0%，行序 false，条带不比全帧快 ⇒ **不采用** | `strip_probe.py` pass=False |
| 步长闭环 | clicks5≈4 行 / clicks40≈6 行 | 中位 **6.5 clicks/row** ⇒ 5 行=33–34 clicks；`--rows 5`→34；7 行视口 2 行重叠 | `step_sim.py` no_skip=True |
| 有效占用比 | **19%**（42.1s 里 ~8.1s） | 会话循环算术 **≈89%**（目标 ≥60%） | 见报告 §0 |

**未闭合**：真注入未验证（会话直注入/ESC 去 sleep/live 帧来源）；条带协议需真实连续滚动帧重测。

## 2026-10-21 真机最终轮（修复后，会话直注入）

| 项 | 实测 | 目标 | 判定 |
|---|---|---|---|
| 有效占用比 | **71.2%** | ≥60% | ✅ |
| 单次滚动（34 clicks） | **1463ms p50** | ≤2s | ✅ |
| 单屏循环（滚+读） | **2290ms p50** | ≤3s | ✅ |
| 60s 内屏/行 | **4 屏 / 16 行（14 unique）** | 到 ≥30 天边界 | ❌ 未完成（STALL 误判，已修） |
| 切桌面耗时 | 含在 session begin（kwin-raise 后 desktop=3） | — | 记录 |

**根因（已修）**：ys-capture 的 fast(EWMH) 与 KWin strict 对 current_desktop 读数打架；daemon 抓帧改 `latest --allow-background` 后只用 strict 裁决。**交还异常**：end restore 目标一次是 Tk 窗（终态 active=firefox/desktop=2，但 firefox.idx==game.idx）；已修 prev_active 优先 firefox + handback 三件校验。
