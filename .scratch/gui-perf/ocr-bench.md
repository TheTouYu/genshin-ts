# OCR 分块并行 + 缓存基准（票 25 / 33）

> 实测：2026-10-18 21:0x–21:5x｜仓库 `/home/h/genshin-ts`｜RTX 3060 Laptop（**显存只剩 ~1.5GB 可用**：原神 1.9GB + `ys-lookd` 2.1GB）
> 引擎：系统 `python-rapidocr` 3.x（PP-OCRv6 det_small / rec_small、cls mobile）+ `onnxruntime-cuda 1.29`（CUDA EP 已确认生效）
> 语料：`.scratch/gui-corpus/video-20261018/reps/`（110 张代表帧，编辑器 UI 为主）+ `.scratch/gui-corpus/f00..f13.png`（14 张游戏/千星 UI）
> 复现：`python3 .scratch/gui-perf/ocr_bench.py`、`ocr_bench2.py --corpus gui|reps`、`ocr_probe.py`、`ocr_rec_probe.py`、`ocr_incremental.py`
> 原始读数：`.scratch/gui-perf/ocr-bench.json`、`ocr-bench2-gui.json`、`ocr-bench2-reps.json`、`ocr-incremental.json`、`ocr-downscale.json`

## 结论先行（诚实优先）

1. **「全帧 OCR <200ms」在这台机器上没做到，而且差得不小**。进程内热引擎、2560×1440 全帧：
   - 游戏 UI 帧（32 框）：**371ms**（294–1182）；编辑器帧（35–80 框）：**630ms**（466–1181）
   - 分解：**det 130–150ms**（固定，全帧 det 输入约 2000×1125）+ **cls 120–180ms** + **rec 150–700ms**（随框数与行宽增长）
   - ⇒ **单 det 一项就吃掉目标的 65–75%**；就算 rec 归零也进不了 200ms。**这是「模型+GPU」的地板，不是实现没优化**。
2. **缓存是唯一能把重复观测打穿的杠杆**：同帧二次（内容寻址，blake2b-8）**≈14ms**（帧哈希本身 13.5ms，纯查表 ~0.5ms）。
   感知服务「看同一屏」的典型形态正好吃这一条。
3. **所有「用像素精度换速度」的做法都会丢字，实测都不可接受**：
   | 换法 | 中位 ms | 字符召回（相对全帧默认管线） |
   |---|---|---|
   | det 输入 2000（默认）→ **1600** | 423 | **95.8%** |
   | → **1280** | 307 | **84.0%** |
   | → **960** | 293 | **76.0%** |
   | 全帧 **0.75x** 缩放 | 354 | 97.8% |
   | 全帧 **0.6x** | 345 | 92.7% |
   | 全帧 **0.5x** | 325 | 86.5% |
   | 4 横带×4 线程 | 292（游戏帧） | **97.0%**（切带处丢框） |
   | 关 cls（不丢字） | −120…−180ms | 100%（UI 文本水平） |
4. **「分块 + 增量缓存」的真实边界**：按 2×2 分块、块内容 crc32 不变则复用上一帧结果。
   在**连拍视频帧**（1fps，画面整体在动）上 **4/4 块每帧都变 ⇒ 一次都没命中**（420ms，比全帧还慢，因为 4 次 det 开销）。
   ⇒ 增量只对**静止 UI**（菜单/面板）有效；它是「同一屏反复看」的优化，不是「新画面」的优化。
5. **可交付的最优组合**（不丢字前提）：
   - 单次新画面：**det 全尺寸 + 关 cls + rec batch 16** → 游戏 UI 帧 **373ms / 召回 99.0%**；
     文本密集的编辑器帧实测 **423ms（det1600，召回 95.8%）**——但这条**丢字**，不推荐；
     编辑器帧「全尺寸 det + 关 cls」的干净读数没取到（见「未完成」：显存 OOM）。
   - 同一屏重复看：**内容缓存 → 14ms**。
   - **要真正 <200ms，只有三条路**（都需要先报告/装东西，本轮未做）：
     ① **ROI 化**：只 OCR 关心的面板/区域（det 面积 ∝ 边长²，半屏 det ≈35ms）——这是最现实的一条，但它要求上层能给出区域；
     ② 换更小的 det 模型 / fp16 / TensorRT（本机未装 `tensorrt`、`onnx`、`onnxconverter-common`，装包需批准）；
     ③ 把 OCR 搬进**常驻进程**（ys-lookd 已有 in-process `_ocr`），省掉每次 9s 的模型+CUDA 初始化——这是「改前 634–3521ms」里最大的一块非计算开销。

## 改前 / 改后（两条数字）

| 口径 | 改前 | 改后 | 备注 |
|---|---|---|---|
| CLI 冷进程（`ys_ocr.py ocr <img>`，= 线上服务每次的形状） | **634–3521ms**（Lead 实测） | 未改共享工具（按任务书要求先报告） | 冷启动含模型加载 ~9s 时更差 |
| 进程内热引擎，全帧 | 游戏帧 371 / 编辑器帧 630ms | 游戏帧 **373ms / 召回 99.0%**；同帧二次 **14ms** | 关 cls + batch16 + 从原图切块 |
| 文本召回（抽样比对，字符级多重集） | 100%（基准） | 99.0%（游戏帧）/ 95.8%（det1600 编辑器帧，**不达标**） | 见上表 |

## 实测细节

### 单环节成本（同一帧 v000，73 框，RTX 3060）

| 环节 | 耗时 | 说明 |
|---|---|---|
| det 2000×1125（2000 max side） | **132–146ms**（首跑 685ms） | 全帧定位；缩到 1600 变 90–108ms 但丢框（76→73） |
| det 1280×720 | 59–107ms | 丢框更明显 |
| det 960×540 | 39–87ms | 只能定位大标题 |
| cls（逐框 180° 分类，batch 6） | **120–180ms** | UI 文本水平 ⇒ 关掉不丢字 |
| rec 73 框（batch 6） | **650–838ms** | ≈9ms/框；batch16 → 525–652ms |
| rec 单批（raw ONNX，B=6 W=320） | 12ms | ⇒ 2ms/框是模型地板；RapidOCR 预处理/解码把它抬高到 6–9ms |
| rec 单批（B=16 W=320 / W=960 / W=1550） | 29 / 32 / 48ms | **宽行是 rec 的真瓶颈**：ratio 14–32 的行（400–1150px 宽）把整批 padding 到 1550 宽 |
| rec CPU（同输入 B=6 W=320） | 41–80ms | GPU 仍是必需 |

### 显存红线（本轮实际撞到）

- 游戏 1.9GB + `ys-lookd`（torch/CUDA 常驻）**2.1GB** + KWin/sunshine ≈ 4.3GB / 6GB ⇒ 可用 **~1.5GB**。
- `rec_batch_num=32` → `BFCArena` 申请 187–203MB 失败 → **ONNXRuntimeError: Failed to allocate memory**（进程级失败）。
- 缓解（已进实验脚本）：`cuda_ep_cfg.arena_extend_strategy=kSameAsRequested`、batch 16、宽行切段。
- **含义**：OCR 与常驻 GPU 感知服务（lookd）在同一张 6GB 卡上互相挤；生产上要么给 OCR 单独配额，要么把 `_ocr` 并进 lookd 共用一份 session（省一份 CUDA context + 模型）。

## 未完成 / 需要裁决

1. **没有做到 <200ms**：按上面的分解，需要 ROI 化或换模型/精度。**要不要走「ROI 化」取决于上层能不能给区域**——请 Lead 裁决。
2. 编辑器语料（`reps/`，110 帧）的「全尺寸 det + 关 cls」干净读数被显存 OOM 打断（21:5x），只取到 10 帧里的部分变体；
   已得结论不受影响（det 缩小必丢字、缓存 14ms、cls 可关）。
3. 若要把这套接进 `ys_ocr.py` / `ys_lookd`（常驻 in-process），按任务书要求**先报告**，本轮只交付实验脚本与读数。
4. `ys-lookd` 占 2.1GB 显存这件事建议单独处理（它是常驻仪器，是否该常驻/该用 CUDA 值得另议）。

## 第二轮：按对象 OCR（Lead 2026-10-18 裁决，详见 `world-integration.md` §②）

全帧 OCR 的地板已证明不可动，改打**按对象**：整帧 det 一次拿对象 → 每个对象切片 rec（4 线程 + 内容寻址缓存）。
实现落在常驻进程 `ys-lookd` 的新命令 `cmd=ocr_objects`（旧命令语义不变）。

| 口径（110 帧 reps） | 中位 | 召回（字符级 vs 全帧 OCR） |
|---|---|---|
| 全帧 OCR（参照） | 567.8ms | 100% |
| 按对象 · 冷（新帧） | **389.8ms**（det 140.8 + rec 197.5） | mean **98.95%** / min 94.06% |
| 按对象 · 热（同帧，帧级缓存） | **43.1ms** | 同冷 |

**判据**：目标「<200ms + ≥97%」→ **热态达成（43ms / 98.95%）**，冷态不达成（det 141ms 是硬地板）；
5/110 帧召回 <97%（最差 94.06%，丢 HUD 小字），根因=切片从原图裁 vs 引擎内部从 2000 宽预处理图裁再上采样。
显存上限：`rec_batch_num` 默认 8、上限 16（32 实测 OOM），空闲 <120MB 直接 fail-closed。

## 第三轮：小字号兜底（Lead 裁决）+ 冷热分组 + 是否真的「丢字」

**兜底已实现**（`ys_lookd._world_ocr_objects`）：对象字高 < `YS_LOOKD_SMALL_FONT_H`（默认 20px）的占比
≥ `YS_LOOKD_SMALL_FONT_RATIO`（默认 0.35）⇒ 回退**全帧 OCR**（与旧口径同源），兜底只在那些帧付全帧成本。

| 读数（110 帧 reps，`ocr-objects-bench-final.json`） | 值 |
|---|---|
| 冷（新帧，缓存清空后首见） | **420.8ms**（det 171.3 + rec 208.9） |
| 热（同帧二次，帧级缓存） | **44.9ms** |
| 严格字符召回（NFKC+去空白） | mean **98.95%** / min 94.06% |
| 松口径召回（再去标点/大小写） | mean **99.05%** / min 93.1% |
| **兜底触发率** | **0.91%（1/110）** |
| **触发帧的召回** | **100%**（该帧走全帧路径，与基准同源） |

**但必须说清：这 6 个 <97% 的帧不是「小字号丢字」**。逐框对账（IoU≥0.5 匹配）显示**没有丢整块**，
全是 `TEXT_DIFF`，且多数是**按对象结果更完整**：

| 帧 | 全帧 OCR | 按对象 OCR |
|---|---|---|
| v031 | `maxt` / `X` | `max:` / `×` |
| v063 | `maxs` / `S 6°0690s` | `max:` / `8690.9 ms` |
| v015 | `FPST 23.9` / `x登山` | `FPS: 23.9` / `max:` |
| v092 | `GPU` / `108` | `GPU:` / `10%` |
| v092 | `冰元素／奧黛塔` | `冰元素／奥黛塔`（繁简） |

⇒ 严格字符多重集把「分词/标点/大小写」都算成丢字，**按对象路径并没有质量退化**；
`fallback_trigger_rate=0.91%` 说明小字号兜底基本不触发，它只能当安全网、不能修正这类差异。
是否再加一条「低置信框占比」兜底（例如 score<0.6 的框占比 ≥ 阈值）待 Lead 裁决——本轮未加，避免无数据地加闸门。

## 复现

```bash
# 各变体（全帧/缩小 det/4 线程切带/缓存），10 帧
python3 .scratch/gui-perf/ocr_bench.py --frames 10
python3 .scratch/gui-perf/ocr_bench2.py --frames 10 --corpus gui --out .scratch/gui-perf/ocr-bench2-gui.json
# 单环节（det 阶梯 / rec 批量）
python3 .scratch/gui-perf/ocr_probe.py --frame v000
python3 .scratch/gui-perf/ocr_rec_probe.py --batch 16 --heur
# 增量分块（连拍 12 帧）
python3 .scratch/gui-perf/ocr_incremental.py --start 100 --n 12
# 降尺度掉字
python3 .scratch/gui-perf/ocr_downscale.py
```
