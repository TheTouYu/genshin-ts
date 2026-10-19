# 性能账本（PERF-LEDGER）——**防止把已达成的 ms 级能力重新做一遍**

> 用户原话：「部分指标是我们之前花了很多力气才优化到 ms 级别的，最怕的就是你自己失忆了，又重头开始。」
> 用法：**动手优化任何性能项之前先查本表**——已达标就先确认"工具在不在、服务起没起"，别重新测、更别重新设计。
> 最近核对：2026-10-19 11:1x

| # | 指标 | **历史最佳** | 怎么做到的（路径/命令） | 2026-10-19 复测 | 状态 |
|---|---|---|---|---|---|
| 1 | 单帧抓取（XShm 常驻 + /dev/shm 环） | **12–13ms** | `tools/ys-editor/ys-capture serve` + `ys-capture latest --out x.png` | 守护能起（win=0x01400001），环内暂无帧 ⇒ 未复测到 12ms | ⚠️ **能力在，按需启**（fps=10 常驻会拖死游戏，只在批量实验期短暂启用） |
| 2 | 同帧 OCR（对象切片 + 内容寻址缓存） | **15–45ms** | `ys-lookd cmd=ocr_objects --frame <绝对路径> --cache true` | **45–46ms**（热）/ 176ms（首调） | ✅ 仍达标 |
| 3 | 判态 fast 通道 | **130–142ms** | `python3 tools/ys-editor/ys-state --fast` | **1.45–1.5s** | ❌ **退化 ~10×**，优先级最高 |
| 4 | 世界状态 in-process（look 稳态） | **147–162ms** | `.scratch/gui-service/worldsvc.py` + `ys_lookd cmd=world` | 缓存命中 0.7ms；新帧受 OCR 主导 | ⚠️ 需按新帧口径复测 |
| 5 | 对象检测（GPU） | 基准 **5.3ms**（U-Net 640 fp16）/ 生产 **27.6ms** | 基准 `.scratch/gui-detect`；生产 `tools/ys-editor/gui_det.py` | v2 生产 p50 **41.3ms** | ⚠️ 生产口径超 ≤10ms 目标 4× |
| 6 | 结构层（D3） | **1.2–9.9ms** | `ys_lookd cmd=world` 内 `_world_structure` | 9.9ms（r028） | ✅ |
| 7 | 列表结构化读取 | **0.11s** 热 / 0.32s 冷 | `tools/ys-editor/ys-list`（走 daemon OCR） | 0.109s / 0.32s | ✅ |
| 8 | 焦点租约内按键 | **32ms** | `ys-lease acquire` 后直接 `ydotool key` | 32ms | ✅ |
| 9 | 非 GUI 项（文档/日志解析等） | — | 见 `docs/maintenance/perf-baseline.tsv` | — | — |

## 结论（给未来的自己）

1. **真正达标的四项**：#2 OCR 热 45ms、#6 结构 9.9ms、#7 列表 0.11s、#8 租约内动作 32ms；
2. **#1 抓帧 12ms 的能力仍在**，但守护不常驻（内存 + 拖死游戏风险）——用时启、用完停；
3. **#3 `ys-state --fast` 1.45s 是明确退化**（历史 130–142ms）⇒ 下次动性能先修它；
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
