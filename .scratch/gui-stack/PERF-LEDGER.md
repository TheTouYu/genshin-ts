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
