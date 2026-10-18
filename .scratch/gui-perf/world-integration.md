# ys-capture 接入 worldsvc + 按对象 OCR + OCR 进常驻进程（Lead 三项裁决的落地）

> **两个数字必须一起看（2026-10-18 Lead 要求并列）**：
> **抓帧已不是瓶颈：4–15ms**（`ys-capture latest`；旧 spectacle 路径 1493ms）
> **但整条 look 仍是 971ms**（daemon-world 后端 warm：`load 207 + ocr 578–603 + state/judge 35+35 + objects 148`）。
> ⇒ 看到「抓帧 13ms」不要以为已经快了：**全帧 OCR 吃掉了 578ms**。本轮已把 world 的 OCR 段换成按对象
> （热态 39–43ms），下一次同屏 look 的 OCR 段预计降到 40ms 级。

## ① 接入：worldsvc 抓帧段换 `ys-capture latest`

改动（都保留旧路径可回退）：
- `instruments.grab_frame()` 新增后端选择 `YS_CAPTURE_BACKEND`（默认 `ys-capture`，`observe` = 旧 spectacle 路径）。
  ys-capture 后端把退出码映射成仪器错误码：`4→OTHER_DESKTOP / 5→OCCLUDED / 2→NOT_ATOP / 7→DAEMON_DOWN / 8→STALE_FRAME / 9→STRICT_UNAVAILABLE`。
- `worldsvc._acquire_frame(live)` **删掉了先跑 `attrib_fast()` 的那一步**——理由见 `capture-bench.md` 顶部：
  EWMH 会把桌面说错（游戏 desktop 3 时它报 0），快路径判 OK 而屏幕上是浏览器。现在归属由 ys-capture 内部的
  **KWin 权威闸门**给结论；不通过直接 `precondition_fail`。
- 新增显式开关 `--allow-background`（WorldService 构造参数 + look 的 CLI），**只供离线分析目标窗口自身缓冲，不得用于动作**。

### 读数（当前会话：游戏在 desktop 3、当前 desktop 1）

| 场景 | 结果 |
|---|---|
| **严格路径** `worldsvc look --live` | `status=precondition_fail` / `LIVE_NOT_ATOP` / 明细 `OTHER_DESKTOP`（KWin），rc=5，**不返回任何世界状态**（fail-closed ✅） |
| 抓帧段本身（`ys-capture latest --allow-background`） | 内部 **4–5ms**，CLI 端到端 **12–13ms**（含 bash 启动）；帧龄 19–82ms |
| world look（cli 后端，新帧，`--frame --no-cache`） | **1524–1807ms**（state 790–1256 + objects 257–1005）——慢在**子进程启动**，不在抓帧 |
| world look（cli 后端，`--live --allow-background --no-cache`） | 4099ms（state 1038 + objects 3033；该帧容器层特别重） |
| world look（**daemon-world** 后端 + `YS_LOOKD_FRAME_SRC=ys-capture`，warm） | **971–1007ms**（`load_ms` 207–214 + `ocr_ms` 578–603 + `state_ms` 35 + `judge_ms` 35 + `objects_ms` 148–152；其中 **抓帧 9.5–15.4ms**） |
| 同上，首次（冷） | 4635ms（引擎/OCR 冷启动） |
| world look（daemon-world，同帧缓存命中） | **91–122ms**（帧级磁盘缓存） |

**判据**：抓帧已经不是瓶颈（4–15ms），**整条 look 现在由「全帧 OCR 578–603ms + 子进程启动 200ms 级 + 容器层 148ms」决定**。
要让 look 也进 <300ms，下一步是把 world 的 OCR 段换成 ② 的按对象 OCR（同一屏重复看 → OCR 43ms）。

## ② 按对象 OCR（常驻进程 `ys-lookd cmd=ocr_objects`）

实现：整帧 det 一次（`det_max=2000`，140ms）→ 每个对象切片**从原图**裁（保清晰度）→ rec 并行 4 线程 +
**内容寻址缓存**（切片 sha256 + ruleset）+ **帧级缓存**（同帧整结果）。引擎共享，det 配置用完即还原（避免污染 `cmd=ocr`）。

### 110 帧 reps 基准（`ocr-objects-bench-110.json`，全帧基准 = 同进程 `cmd=ocr`）

| 口径 | 中位 | 召回（字符级，vs 全帧 OCR） |
|---|---|---|
| 全帧 OCR（改前形状） | **567.8ms** | 100%（基准） |
| 按对象 OCR · **冷**（新帧） | **389.8ms**（det 140.8 + rec 197.5） | mean **98.95%** / min 94.06% |
| 按对象 OCR · **热**（同一帧，帧级缓存） | **43.1ms** | 同冷（缓存内容一致） |

- 目标「<200ms + ≥97%」：**热态达成（43ms / 98.95%）**；冷态 390ms 不达成（det 一项 141ms + rec 198ms）。
- 召回不足 97% 的帧：**5/110**（最差 94.06%，v031；丢的是 HUD 小字如 `Xt斷时越轨`、`06Ss°·`）——
  根因是切片从**原图**裁（更清晰）与引擎内部从 2000 宽预处理图裁再上采样**不同**，小字号上重采样差异翻转个别字符。
- 切片缓存命中：同帧二次 100% 命中；连拍序列（帧级不同）命中取决于对象是否逐字节不变。

## ②b world 的 OCR 段已换成按对象（Lead 2026-10-18 批准）

- `_world` 里 `_world_ocr(arr, sha)` → `_world_ocr_objects(arr, sha)`：按对象 OCR + 帧级缓存 + **小字号兜底**。
- 读数（`look --frame /dev/shm/wf.bmp --backend daemon-world`，同帧）：冷 **ocr_ms 461.9 / total 1029.3**（objects 源，50 框；state 529ms 这帧特别重）；
  同帧再取：world 缓存 **0.6–0.9ms**、仅帧缓存命中时 ~90ms。
- 兜底：字高 <20px 占比 ≥0.35 → 回退全帧；110 帧 bench 触发率 **0.91%**、触发帧召回 **100%**（详见 `ocr-bench.md` 第三轮）。
  **兜底分支已实跑验证**：请求带 `force_fallback:true` → `ocr_source=objects+fullframe_fallback`（测试缝，默认不传）。
- **重启后首帧**：`serve()` 里加了 **OCR 后台预热**（引擎+CUDA/cudnn 首次 kernel，实测 1666ms）；
  未预热时重启后第一次 world 的 `ocr_ms` 实测 **5998ms**，预热后同一帧首见 **596ms**、同帧再取 **15–20ms**。
  ⇒ 冷/热必须分开报：**首帧 801ms（ocr 596）/ 同帧重复 117–129ms（ocr 15–20）**。
- 显存硬上限写进常量注释：`_REC_BATCH=8`（`YS_LOOKD_REC_BATCH` 可调，**硬上限 16**；32 实测 OOM）。

## ③ OCR 已在常驻进程（并给出显存上限）

- `ys-lookd` 原本就有进程内 OCR（`_world_ocr`）；本轮新增 `cmd=ocr_objects`（并行切片 + 两层缓存）。
- **显存**：引擎 + CUDA context 常驻后，本机可用只剩 ~1.5GB（游戏 1.9 + lookd 2.1）。
  - `rec_batch_num`：默认 **8**，上限 **16**（`YS_LOOKD_REC_BATCH`，代码里 `min(16, env)`）；**32 已实测 OOM**（BFCArena 申请 187–203MB 失败）。
  - 自动降级：空闲显存 < 300MB → batch 降 4；< 120MB → **fail-closed（`code=VRAM_LOW`）**，不冒险 OOM。
  - `arena_extend_strategy=kSameAsRequested`（实验脚本里）能减少碎片；生产建议同样设置。
- 代价账：进程内常驻省掉每次 ~9s 的模型+CUDA 初始化——这是线上「OCR 634–3521ms」里最大的一块非计算开销。

## 复现

```bash
# ① 严格路径必须拒绝（当前游戏不在当前桌面）
python3 .scratch/gui-service/worldsvc.py look --live --summary ; echo rc=$?      # → rc=5 LIVE_NOT_ATOP

# ① 抓帧段 + 整条 look（离线分析用 allow-background）
./tools/ys-editor/ys-capture latest --allow-background --out /dev/shm/wf.bmp --format bmp
python3 .scratch/gui-service/worldsvc.py look --frame /dev/shm/wf.bmp --no-cache --summary
YS_LOOKD_FRAME_SRC=ys-capture YS_LOOKD_ALLOW_BACKGROUND=1 \
  python3 .scratch/gui-service/worldsvc.py look --live --backend daemon-world --no-cache --summary

# ② 按对象 OCR（110 帧）
YS_LOOKD_REC_BATCH=16 python3 .scratch/gui-perf/ocr_objects_bench.py --frames 110
```
