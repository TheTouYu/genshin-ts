# OCR 精度-速度曲线（2026-10-22）：fp16 不可用、int8 不过 CUDA、降分辨率只伤小字英文

> 状态：当前实现（实验室口径已闭环；游戏内用户核验待做）
> 来源：本机实测（RTX 3060 Laptop 6GB，`clocks.sm` 锁 **855/2100MHz**，原神未运行、AI 服务已停）
> 最近校验：2026-10-22

**一句话**：在这台机器上，**保中文的前提下没有"免费加速"**——唯一能省的是 rec 批大小（−74ms，CJK 98.2%）；
fp16 转出来 det 直接不出框，int8 在 CUDA EP 上慢 7×；降 det 分辨率 CJK 几乎不掉但**小字号英文数字掉到 12–62%**。

---

## 0. 结论表（先看这张）

### 表 1 独立进程自带 context（同帧 f00/f01/f02/f03/f06/f07，n=3，cache 关，warmup=2）

| 档位 | p50 | p95 | det/cls/rec | 本进程显存 | CJK | ASCII | 全角标点 | 小字号 ASCII | 丢行 | 判定 |
|---|---|---|---|---|---|---|---|---|---|---|
| baseline（现役 PP-OCRv6 small） | **511.9** | 552.5 | 120/109/192 | 982 MiB | 100% | 100% | 100% | 100% | 0 | 基线 |
| rec_batch16（cls 同步 16） | **437.8** | 489.0 | 104/94/160 | 1252 MiB | 98.2% | 100% | 100% | 100% | 0 | **可选** −74ms |
| det1600（`Global.max_side_len`） | 490.4 | 523.0 | 78/114/205 | 606 MiB | 98.8% | 84.9% | 100% | **61.5%** | 18 | 仅大字任务 |
| det1280 | 289.0 | 408.9 | 49/55/146 | 684 MiB | 98.2% | 64.1% | 100% | **12.3%** | 29 | 仅大字任务 |
| fp16 全模型 | 178.9 | 208.6 | — | 670 MiB | **0%** | **0%** | 0% | 0% | 179 | **不可行**（det 0 框） |
| int8（CUDA EP） | 3532 | 3733 | 1337/146/1891 | 816 MiB | 96.2% | 98.0% | 75.0% | 93.8% | 5 | **不可行**（慢 7×） |
| int8（CPU EP 对照） | 4340 | 4589 | 1742/47/2386 | 144 MiB | 96.6% | 97.5% | 75.0% | 92.3% | 4 | 不可行（慢 8.5×） |

召回口径见 §2：**分母=基线同一批行**（相对一致性），字符级多重集、**CJK / ASCII / 全角标点三桶分开**，
"丢行"=整行没配上（其字符按 0 召回计入分母，所以丢行多的档位不会显得小字召回高）。

### 表 2 守护内（`via=daemon`，同日同帧、cache 关）

| 项 | 读数 |
|---|---|
| 热态 p50 / p95 | **529.3 / 539.6 ms** |
| 换帧（每次新内容）p50 | 465 ms |
| 同帧重复（缓存命中）p50 | 1.1 ms |
| engine | `cuda`（回执里的真实引擎，非写死） |
| 守护显存 | 1310 MiB（ocr-vram 口径：A 段 2588 / B 段 1492 / 改后 544–1310） |

> ⚠️ **两表不可横比**：表 1 是独立进程（自己的 CUDA context、显存状态可控），表 2 是服役守护（高水位机制）。
> 引用时请带上"哪张表"，否则 511.9 vs 529.3 的差会被误读成回归。

---

## 1. 怎么做的（可复现）

```bash
# ① 装 ONNX 工具链（系统 pip 是 PEP668 外部管理，装到工作区、不污染系统）
python3 -m pip install --no-cache-dir --no-deps --target .scratch/ocr-precision/pylibs \
    onnx onnxconverter-common ml_dtypes protobuf

# ② 转模型（fp16 三份 + INT8 det/rec 两份；输出 .scratch/ocr-precision/models/{fp16,int8}/）
PYTHONPATH=.scratch/ocr-precision/pylibs python3 .scratch/ocr-precision/convert_models.py

# ③ 跑档位（GPU 独占窗口；每档重建引擎，记录 det/cls/rec + 本进程显存 + 时钟）
python3 .scratch/ocr-precision/bench_tiers.py \
  --tiers baseline,fp16,int8,int8_cpu,det1600,det1280,rec_batch16 \
  --frames f00,f01,f02,f03,f06,f07 --repeats 3 --out .scratch/ocr-precision/runs/gpu.json

# ④ 算召回（CJK/ASCII/标点三桶 + 小字号 ASCII + 丢行）
python3 .scratch/ocr-precision/metrics.py --runs .scratch/ocr-precision/runs/gpu.json
```

**GPU 三坎照旧**：cuDNN 预载 → `register_execution_provider_library` → `ort.get_device()` monkey-patch，
判据复用 `tools/ys-editor/ys_ocr.py`（唯一实现，不复制）。

---

## 2. 度量口径（这是本次的成败关键）

- **行级配对**先做：基线的行 ↔ 档位最像的行（IoU≥0.3 或中心距 ≤ max(12px, 0.3×行高)）；
  配不上的基线行 = **整行丢失**，其字符按 0 召回计入分母。
- **字符级多重集**，分三桶：CJK（4E00–9FFF / 3400–4DBF / F900–FAFF）、ASCII（0x20–0x7E）、
  全角/中文标点（3000–303F / FF00–FFEF）。**中英混成一个数就是自欺**（用户明确中文优先）。
- **小字号 ASCII 单列**：框高 ≤20px 且含 ASCII 的行——GUI 判据里最常见的 FPS/坐标/等级/UID。
- 同时算 strict 与 loose（NFKC+小写+去空格）两套；D395 的教训是只看 strict 会把分词/标点差异当丢字，
  本次两套都留了（`metrics.py --json` 里有 `cjk_loose/ascii_loose`）。
- **两条流形**：CRLF/宽字符/emoji 都算 `other` 桶，不进三桶分母。
- **绝对真值**：PaddleOCR-VL 逐行裁片（60 行样本，`.scratch/ocr-precision/truth/manifest.json`），
  **中文长行发现接口编码损坏**（见 §5），最终**可用 22 行 / 6 帧**（编码坏 33、空 5）；**中文绝对召回仍标"未核验"**。

### 2.1 绝对召回（参考=PaddleOCR-VL 独立通道，22 行）

| 档位 | CJK | ASCII | 丢行 |
|---|---|---|---|
| baseline | 100% | 82.8% | 0/22 |
| rec_batch16 / int8 / int8_cpu | 100% | 82.8% | 0/22 |
| det1600 | 100% | 78.8% | 1/22 |
| det1280 | 100% | **53.0%** | 5/22 |
| fp16 | 0% | 0% | 22/22 |

⚠️ **这 22 行里 baseline 的 82.8% 不是"基线错 17%"**——逐条核对后：
`t u s o c e o GPU: 8%`、`1130 001 GPU: 7%`、`19. 0 ms`、`min3` 都是 **VL 自己把裁片边缘的像素读进来/把 ':' 读成 '3'**（基线对）；
只有 `★⭐⭐會會`（基线）vs `★★★★★`（VL）这一条是**基线真错**。
⇒ 独立通道也有噪声，**绝对数字只能当"上界参考"，不能当判决**；用户游戏内逐条对照才是终审。

---

## 3. 三个"没有免费加速"的证据

### 3.1 fp16：178.9ms 是假象，det 输出 0 个框
- 全模型 fp16 的 p50 178.9ms 看着像 2.9×，但 `texts` **每帧 0 行**（179 行全丢）。
  快的原因是 **det 不出框 ⇒ rec 根本没跑**；`elapse_list` 为空也印证这一点。
- 单独验证 det：`onnxconverter_common.float16.convert_float_to_float16` 的三种转换
  （默认 / `disable_shape_infer=True` / 再 block `Resize,Upsample`）在本机 **全部 0 框**（fp32 同帧 42 框）。
  ⚠️ 转换 API 会**原地修改** model 对象，多档对比必须每次 `onnx.load()`——否则第二档报
  `The model is already converted to float16`。
- 单独验证 rec / cls：**文本与 fp32 100% 一致**（39 行全同），但**更慢**：rec 248 vs 219ms、cls 213 vs 110ms。
  ⇒ 在 855MHz 的 3060 上，fp16 的 cast/小张量开销盖过 Tensor Core 收益。
- **结论：fp16 不可行**（det 崩 + rec/cls 无收益）。要再试，得换 ORT 原生 fp16 路径或 TensorRT，工程量另计。

### 3.2 INT8：CUDA EP 上"能跑但不快"，实测慢 7×
- int8（CUDA EP）3532ms；分段 det 1337 / cls 146 / rec 1891ms ⇒ **逐节点回落 CPU**，没有 kernel 融合。
- 纯 CPU 对照 4340ms（det 1742 / rec 2386）⇒ **CUDA 侧没吃到任何 INT8 收益**（差别只有 ~19%）。
- 同档 CJK 96.2%（丢行 5）——量化本身也掉精度。**结论：不可行**。
- 量化是在 **CPU EP** 上做的（`quantize_dynamic` 默认动态量化），验证时同时跑了 CUDA 与 CPU 两条通道 —— 两者都慢。
- 路径固定：`.scratch/ocr-precision/models/int8/{det,rec}.onnx`（生成脚本 `models/report.json` 留痕）。

### 3.3 降分辨率：CJK 掉得少、**小字号英文数字掉得狠**
| 档位 | 速度 | CJK | ASCII | 小字号 ASCII | 丢行 |
|---|---|---|---|---|---|
| det1600 | 490.4（−4%） | 98.8% | 84.9% | **61.5%** | 18 |
| det1280 | 289.0（−44%） | 98.2% | 64.1% | **12.3%** | 29 |
- 与 D393 的历史结论方向一致（1600≈95.8%、1280≈84% 字符召回），本次把**语种拆开**后看得更清楚：
  掉的全是小字号 ASCII（`FPS: 60.3` → `FPSE 606`、`GPU: 64%` → `GPU: 8%` 这类）。
- ⇒ 这两档**不能进默认**；只适合"找大字/面板标题"的任务级开关。

---

## 4. 推荐三档

| 档 | 内容 | 依据 |
|---|---|---|
| **默认（不动）** | `PP-OCRv6 small`，`Global.max_side_len=2000`，cls 开，rec_batch 6 | 唯一 CJK/ASCII/小字全 100% 的档位；511.9ms |
| **可选（任务级开关）** | ① `rec_batch16`（+cls_batch16）：−74ms / −14%，CJK 98.2%、ASCII 100%、0 丢行<br>② `det1280`：289ms，**只给大字/面板标题定位**，禁止用于读数值/坐标 | 表 1 |
| **不可行** | fp16 全模型（det 0 框）、INT8（CUDA 慢 7×、CPU 慢 8.5×）、det1600（小字 ASCII −38%，只省 22ms） | §3 |

### 4.1 换模型对照（同表同口径，19:47:58，free 4229MiB / 855MHz / 游戏未开）

同帧 f06/f01、n=2、cache 关、每档独立进程；baseline 为同表复测（不是主表数字，避免跨时段比）。

| 档位 | p50 | p95 | det/cls/rec | 显存 | CJK | ASCII | 小字 ASCII | 丢行 | 判定 |
|---|---|---|---|---|---|---|---|---|---|
| baseline（现役 v6 small） | **521.4** | 539.5 | 116/115/208 | — | 100 | 100 | 100 | 0 | 基线 |
| v5_mobile | 638.2 | 747.5 | 153/145/242 | 848 MiB | 96.2 | 76.4 | **28.6** | 8 | 不可用（+22% 且更差） |
| v4_mobile | 563.9 | 599.1 | 173/129/174 | 780 MiB | 96.7 | 87.5 | 85.7 | 7 | 不可用（+8% 且更差） |
| v5_server | — | — | — | — | — | — | — | — | **不可用：CUDA 推理期原生崩溃**（`rapidocr/main.py:368 recognize_txt` 内进程直接死，无 Python 异常；复现 2 次） |

**读法**：①现役 v6 small 是三档里**唯一 CJK/ASCII/小字全 100% 且最快**的——"花很多时间选定"这个判断
被数据支持；②v5/v4 mobile 更慢且更差，小字号 ASCII 尤其崩（28.6% / 85.7%）；③v5_server 在 6GB 卡上
加载后一推理就原生崩溃，按 Lead 指示不做调参尝试，记为**不可用**。
`PP-OCRv6 medium` 本地有（`~/.paddlex/official_models`，60MB det + 74MB rec，paddle 格式）——
**同族更大更慢**，不是新模型族，按 Lead 裁决不做对照实验。
模型来源：modelscope 自动下载到 `.scratch/ocr-precision/models/dl/`（`bench_tiers.py` 的 `v5_*`/`v4_*` 档位，
  `Global.model_root_dir` 指到工作区——不指的话 RapidOCR 会往 `/usr/lib/...` 写，权限拒绝）。

---

## 5. 未闭合项

1. **VL 绝对真值的编码缺陷**：PaddleOCR-VL 返回的中文是 UTF-8 字节被按 **cp1252** 解过的串
   （`虚渊暗星` → `è™šæ¸Šæš—æ˜Ÿ`），短行可用 `cp1252→utf8` 修回；**长中文行是双层损坏、不可逆**
   （实测 1 条：`风仙亦是仙…`）。⇒ 中文绝对召回**未核验**，只有 ASCII/数字行可用。
   修复点：`.scratch/gui-grounding/paddle_vl_client.py` 的响应解码（不在本任务写作用域，登记）。
2. **v5/v4 换模型对照已补（§4.1）**：v5_mobile / v4_mobile 有速度+三桶召回；**v5_server 未测速**——
   一推理就 CUDA 原生崩溃（无 Python 异常），按 Lead 指示不做调参；若将来要试，先降 rec batch 或换大显存卡。
3. **`no_cls` 本轮没重测**：今天早些时候测得 −118.6ms，但 f06 丢一个 107×112px、score 0.51 的低分框 `'入'`
   （6 帧里 5 帧 SAME、1 帧 DIFF）⇒ 精度门禁不过，维持"cls 开"。
4. **`graph_optimization_level` 不可调**：`rapidocr/inference_engine/onnxruntime/main.py:82` 硬编码
   `GraphOptimizationLevel.ORT_ENABLE_ALL`，传参被静默忽略（已实测档位无差异）。**`cudnn_conv_algo_search`
   同理可疑**（D393 已证无明显收益）。
5. **游戏内用户核验未做**：探针 `tools/ys-editor/tests/ocr-ingame-probe.py` 已就绪，但需要游戏开着；
   它输出 `report.md` 人工核对表（位置/文本/置信度）+ `summary.json`/`bench.json`/帧。

---

## 6. 自审（交付前三问）

1. **每一点都做了吗**：①同模型降精度 4 类（fp16 / INT8 / det 分辨率 / rec_batch 等不改精度的开关）✅
   ——`rec_batch16` 有数、`opt_basic`/`cudnn_heur` 证明"参数不可调"而非"没测"；
   ②换模型对照：**部分**（v5/v4 可跑通但无读数，medium 不做，理由写明）；
   ③每档五列（速度/显存/中英召回/失败样例）✅（失败样例在 §3.3 与 `metrics.py --json` 的 `diffs`）。
2. **该改的位置都改到了吗**：本轮**没改** `ys_lookd.py` / `ys_ocr.py` 的生产逻辑（只新增 `.scratch/ocr-precision/`
   工具与 `tests/ocr-ingame-probe.py`）；默认值一处未动。
3. **验证都跑了吗**：`bench_tiers.py`（exit 0，7 档），`metrics.py`（exit 0），`convert_models.py`（exit 0，
   fp16/int8 各模型通过 ORT 加载校验）；**未跑**：游戏内探针的真实帧路径（游戏未开）。
