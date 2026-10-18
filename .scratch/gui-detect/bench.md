# 票 24 离线准备 · 候选检测路线对比（bench）

> 状态：**离线调研（未装包、未下权重、未占 GPU）**｜仓库 `/home/h/genshin-ts`｜日期 2026-10-18 19:4x
> 依据：`AGI-BAR.md` 口径 2（seq 6311「这个叫做**对象检测**。在我们的gpu上跑应该很轻松」）＋性能门禁
> 「对象检测单帧 ≤10ms（5.3ms 实测，留余量）」；真值集与记分器＝票 23（`.scratch/gui-corpus/truth/`、`tools/ys-coverage`）。
> 原始读数：`env-probe-2026-10-18.log`（同目录）。**本文件里每条"实测"都指本机跑出来的数；
> 标注「文献/折算」的不是实测，不许当验收读数用。**

---

## 〇、⚠️ 更正（2026-10-18 19:5x，用户/Lead 复验后）

**本机 GPU 可用。本文件初版「GPU 不可用」是假阴性。** 读数（Lead 会话，cwd=`/home/h/genshin-ts`）：
`ls /dev/nvidia*` → `nvidia0 / nvidiactl / nvidia-modeset / nvidia-uvm`（rc=0）；`nvidia-smi -L` →
`GPU 0: NVIDIA GeForce RTX 3060 Laptop GPU`（rc=0）；`torch.cuda.is_available()=True, device_count=1`，显存 6.14GB。

根因：**我这一路是 subagent 会话，`/dev` 被沙箱化成最小 devtmpfs**（只有 null/zero/random/tty/shm/core/fd/ptmx/pts/stderr/stdout，无任何 GPU 节点）；
驱动与内核模块都在（`NVRM 615.78.08`、`nvidia_uvm/nvidia_drm` 已加载、`libcuda.so.1`/`libcudnn.so.9` 在）。
⇒ 判「GPU 能不能用」必须三件一起看：**设备节点 `/dev/nvidia*` + `nvidia-smi -L` + `torch.cuda.is_available()`**，
且**必须在能访问设备的会话里跑**；「在我这个会话里看不到」不等于「机器没有」。

**由此解锁的路线**：GPU 实测（下文 §三 的 ≤10ms 判据）改由 `bench_gpu.py` 在 GPU 可见会话执行；
本文件的 CPU 数字仍然有效（作为"降级路径有多慢"的对照，不是 GPU 读数）。

---

## 一、结论先行（三句话）

1. **GPU 可用（见 §〇 更正）**；但**本 subagent 会话的 `/dev` 被沙箱隐藏**，所以 GPU 读数只能由
   GPU 可见会话执行 `bench_gpu.py` 取得。**判据：先 `sess.get_providers()` 里真有 `CUDAExecutionProvider`**
   —— ORT 缺依赖时**不报错、只 warning 然后静默回落 CPU**（实测见 §三-③）。
2. **CPU 回退路径已被实测否决**：torch fp32 CPU（12 线程）实测 **174.8 GFLOP/s** ⇒ 9.3 GFLOP 的 U-Net@640
   折算 **≈53ms/帧**（4 线程时 101 GFLOP/s ⇒ 92ms）；比 ≤10ms 门槛慢 5–9 倍，比 GPU 先例 5.3ms 慢 10–17 倍。
   ⇒ 「GPU ≤10ms」这条口径只能靠 GPU 落地，CPU 必须显式走**降级路径**（自报 `degraded`，不许假装）。
3. **训练数据是真正的瓶颈，不是算力**：现有真值集 **14 帧 / 285 实例 / 8 类**（`.scratch/gui-corpus/truth/`），
   负样本只有 1 帧。跑一个从 COCO 微调的检测器，这个量级只够"冒烟"，不够产出可用精度（估算见 §五）。

---

## 二、本机环境实测（读数 → 结论）

| 项 | 实测 | 含义 |
|---|---|---|
| python | 3.14.8（系统 `/usr/sbin/python3`） | 3.14 太新，部分 ML 轮子无 cp314 wheel（见 §六-风险） |
| numpy / pillow / opencv | 2.5.4 / 12.3.0 / **5.0.0** | 齐；cv2 5.0.0 与老教程 API 有出入 |
| **onnxruntime** | **1.29.0**（系统），providers=`CUDA, Dnnl, CPU` | **已装，无需安装**；CUDA EP 存在但当前无设备可开 |
| onnxruntime（venv-rapidocr） | **1.31.0**，providers=`TensorRT, CUDA, CPU` | 另有一份带 TensorRT EP 的，但 `libnvinfer` 缺 → TRT EP 不可用 |
| **torch** | **2.14.1**（`torch.version.cuda=13.4`，`device_count=0`） | CUDA 构建在，**设备不可见** |
| torchvision | **缺** | ultralytics 常要它；装包时要一并评估 |
| scipy | 1.18.1 | 齐（CCL/形态学可用） |
| onnx / paddle / ultralytics / tensorrt / pynvml | **全缺**（系统 python）；`paddle 3.2.0` 只在 `.scratch/gui-grounding/venv-paddle`、`venv-vl` 里 | 训练/导出工具链需授权后装 |
| GPU | 驱动 `615.78.08`；`/dev/nvidia*` **不存在**；`nvidia-smi` 通信失败 | **本会话 GPU 不可用** |
| 磁盘 | `/home` 398G 可用 | 权重/数据集磁盘不是约束 |
| 已缓存模型 | HF 5.5G（bge-m3 / faster-whisper / PaddleOCR-VL），**PaddleOCR-VL-1.6 与 PP-DocLayoutV3 只有 refs 无权重**；可用检测权重 = **0** | 任何检测路线都要下权重（=需授权） |

冷启动（实测，进程内一次）：`numpy 67ms` / `cv2 246ms` / `cv2.imread(2560×1440 PNG) 90ms` /
`onnxruntime import 33ms` / `torch import 1216–1868ms`。
⇒ **进程内单次调用不是形态**：任何学习型后端都必须常驻（`ys-lookd` 已有），冷启动不计入预算但必须规避。

---

## 三、候选路线（可行性 / 预计 ms / 依赖体积 / 权重体积 / 训练数据）

> 「预计 ms」列：**实测**=本机读数；**折算**=用本机 CPU 算力或既有 GPU 先例折算，仅作排序参考；
> **文献**=公开模型规格（参数/GLOPs），落地前必须实测。

| # | 路线 | 可行性（本机） | 预计 ms/帧 | 依赖 | 权重体积 | 训练数据需求 |
|---|---|---|---|---|---|---|
| **A** | **ONNX Runtime + 轻量检测器**（YOLO11n / YOLOv8n 导 ONNX；或自训 nano U-Net 导 ONNX） | ✅ 最优：`onnxruntime` 已装；CUDA EP 就绪（设备待开放）；推理零 Python 训练栈依赖 | **折算 3–6ms**@640（按 U-Net 9.3GFLOP 实测 5.3ms 的同算力折算；YOLO11n 文献 6.5 GFLOP@640 ⇒ ≈4ms）；**实测待 GPU** | onnxruntime（已有）；导出时临时需 torch（已有）+ onnx（缺，纯 pip 小包） | YOLO11n fp32 ≈ 5–6MB / fp16 ≈3MB；nano U-Net ≈ 2–15MB（视通道） | 微调需 ~1k+ 实例/类；COCO 预训练可救"边缘/形状"先验 |
| **B** | **ultralytics（YOLO 全家桶，训练+推理一把）** | ⚠️ 可装但**未装**；依赖 torch/torchvision/cv2/scipy（torchvision 缺）；CPU 训练不可行（需 GPU） | 推理同 A（导出 ONNX 后）；**训练 ms 级不适用**（分钟级/epoch） | `ultralytics` + `torchvision`（缺）+ 现有 torch/cv2/scipy | yolov8n/yolo11n **≈6MB**（文献） | 同 A；需 GPU 训练窗口（游戏不跑时） |
| **C** | **自训轻量 U-Net / 语义分割（torch，自有代码）** | ✅ 可做：torch 已装、代码可控；**5.3ms 的既有先例就是这条**；无需 ultralytics | **GPU 实测先例 5.3ms（fp16）/7.3ms（fp32）@640**（上一轮会话读数，非本会话）；**本机 CPU 折算 53ms（12t）/92ms（4t）** | torch（已有）；导出 ONNX 需 `onnx`（缺） | 2–15MB | 分割要掩码；**折中：用 bbox 填充成掩码先训**，再由掩码回归 bbox |
| **D** | **VLM 离线产标注/当裁判**（PaddleOCR-VL-1.6 本地 / 现成 `paddle_vl_client.py` 云端） | ⚠️ 只做**离线标注与判分**，不做在线检测（秒级、不可回归） | 秒级/帧（不可作预算） | 本地：paddle 3.2.0（在 venv）+ **权重未下**；云端：现成 client（每帧一次 API） | PaddleOCR-VL ≈ GB 级（文献） | 不用于训练，用于把 285 实例扩到数千 |
| **E** | **经典 CV 增强（不换路线，保底）** | ✅ 已在产（`ys-screen` 容器层） | **实测：容器层稳态 139ms/帧**（repeat=3，f06；首帧 945ms）；全链路 0.8–2.8s（含 OCR） | 无新增 | 无 | 无训练；瓶颈是判据本身 |
| **F** | **TensorRT / OpenVINO 加速** | ❌ 现在不可行：`libnvinfer` 缺、无 `tensorrt`；OpenVINO 未装 | 理论上再快 1.5–2×（文献） | 需装 tensorrt/openvino | — | 与 A/C 共用权重 |

**排序建议**：**A（ONNX 推理）+ C（U-Net 训练，导出 ONNX）组合**为上线形态；B 只当训练脚手架（若用户同意装）；
D 只做标注扩产；E 保持 `--backend cv` 兜底；F 暂缓。

---

## 四、为什么"检测器"这件事非学不可（票 23 的实测证据）

同口径（IoU≥0.5，285 个真值单元）下 `ys-screen` 当前主路径的读数：

| kind | 命中 | 说明 |
|---|---|---|
| tile（不透明纯色格子） | **56/56 = 100%** | 派蒙菜单网格已闭合 |
| panel | 5/9 = 56% | 有真有假（1 个退化成整屏） |
| row（设置行/列表行） | 18/110 = **16%** | 行被合并成大块（f00 上 3 行并成 1 块） |
| button | 2/46 = **4%** | 按钮与正文同 skin |
| card（贴插画白卡） | 1/14 = **7%** | 已知未闭合（卡内不平坦、边界 ΔE 只有 5.5） |
| **icon（纯图标/奖励图标）** | **0/38 = 0%** | 文本驱动的结构里完全不可见 |
| **avatar（角色头像）** | **0/8 = 0%** | 同上 |
| chip（页签/窄条） | 0/4 = 0% | — |
| **合计** | **82/285 = 28.8%** | 负样本 `neg-world` **2 个假阳性**（必须是 0） |

⇒ 纯几何判据已到 28.8%，AGI-BAR 记的手工 CV 天花板是 40%；**票 24 的验收线是 >40%**，
靠经典 CV 需要"每个新界面都修一次判据"，而 f00–f05 六帧右侧布局**每种都不同**（同一 App 内 4 种形态）。

---

## 五、训练数据需求（估算，标注成本是主导项）

- **现状**：14 帧 / 285 实例 / 8 类（tile 56、row 110、button 46、icon 38、card 14、panel 9、avatar 8、chip 4）
  + 1 帧负样本（`neg-world`）。类别极不均衡（row/button 多，avatar/chip 少）。
- **微调下限（经验值，需用实验校准）**：每类 **≥500 实例**，稀有类（avatar/chip）靠**合成/增广**补；
  ⇒ 目标 ≈ **4,000 实例**，按当前 ~20 实例/帧 ⇒ **≈200 帧**。
- **但这 200 帧不能同分布**：必须覆盖 ①分辨率 1280/1920/2560 × ②窗口化/无边框 × ③半透明底 vs 纯色底
  × ④滚动位置 × ⑤有无 HUD 叠加（录制条/DXVK）——否则模型学到的是"这一版 UI 的皮肤色"。
- **负样本要 3 类**（票 24 验收项）：提瓦特世界（已有 1 帧，来自 f06 右侧裁切）、编辑器 3D 场景
  （`tools/ys-editor/calib/regress/playtest*.png` 可用）、桌面/浏览器（`calib/regress/neg-*.png` 已有）。
- **标注成本**：这次 14 帧我用「read_image 人眼判对象 + 网格量边 + boxer 量小图标」≈ **12–15 分钟/帧**；
  VLM 预标注 + 人眼复核可压到 3–5 分钟/帧 ⇒ 200 帧 ≈ **10–17 小时人工**（可分批，不阻塞上线路径）。
- **判据风险**：`kind` 的边界（如"面板算不算单元"）必须先用 `truth/_rules.md` 钉死，否则训出来的类别不可比。

---

## 六、需要用户/Lead 授权或裁决的点（**动手前必须过闸**）

| # | 事项 | 为什么需要授权 | 最小可验证动作 |
|---|---|---|---|
| 1 | **下载检测权重**（yolo11n ≈6MB 起；或自训权重不下载） | 新增外部资产进仓库/缓存 | 下载后 `sha256` + 体积入账，只落 `.scratch/gui-detect/weights/` |
| 2 | **装包**：`ultralytics`（+`torchvision`）、`onnx`（导出用，纯 pip 小包）；可选 `paddlepaddle` 已在 venv | 改动本机 Python 环境 | `pip install --dry-run` 先报体积与依赖树 |
| 3 | **占 GPU 做一次基准**（30–60s） | GPU 可能被游戏/编辑器占用；用户要求"占 GPU 前先问" | 单帧 × 30 次、记录 p50/p95 + 显存峰值 |
| 4 | **GPU 实测的执行者**：本会话 `/dev/nvidia*` 不可见 | 我不越权绕沙箱 | 由 Lead/用户侧跑同一条基准命令（下面给了命令） |
| 5 | **是否允许 `ys-screen` 新增 `--backend onnx`**（票 24 上线形态） | 涉及共享工具行为（当前禁改主路径） | 只新增后端 + 保留 `--backend cv` 默认 |

**基准命令（GPU 侧可直接跑，我未执行）**：

```bash
# 1) 设备自检
nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader
python3 -c "import torch;print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
# 2) 单帧基准（模型就绪后）：30 次 fp16 @640，取 p50/p95
#    若先用随机权重验证"算力够不够"：同形状 conv/U-Net 前向即可（不必等下载）
```

---

## 七、我**没有**做的事（明示边界）

- 没有安装任何包、没有下载任何权重、没有占用 GPU、没有改 `tools/ys-screen`（主路径与默认后端均未动）。
- GPU 的 5.3ms 是**上一轮会话的读数**（`AGI-BAR.md` §一 已记录），我这一轮**没有复现**（设备不可见）。
- 表里「文献/折算」的 ms 与体积**不是验收读数**；票 24 的验收（单帧 ≤10ms、关键样本命中、3 类负样本 0 假阳性）
  必须在 GPU 可用的会话里用真权重跑出来。


---

## 七、2026-10-18 19:4x 增补实测（bench_gpu.py 的可复算读数）

### 7.1 基准台 `bench_gpu.py`（只读本机已装件，不下载不安装）

```bash
cd /home/h/genshin-ts && python3 .scratch/gui-detect/bench_gpu.py --iters 50 --warmup 10
# 产出：人读表格 + .scratch/gui-detect/bench-gpu.json
# 分项：--bench unet|ort|yolo|cold|all；--unet-bases 8,12,16；--yolo-weights path
# 退出码：0 跑完 / 2 用法 / 4 请求了 CUDA EP 但实际 providers 里没有 CUDA（fail-closed，防 CPU 数字冒充 GPU）
```

### 7.2 U-Net 的 FLOPs 是**量出来的**，不是猜的

`count_flops()` 用 forward hook 逐层累加 `2·k²·Cin/groups·Cout·H_out·W_out`（随机权重前向一次）。
实测（`--unet-bases 8`，640×640×3 输入）：**base=8/depth=4 ⇒ 10.85 GFLOP/帧**；
`FLOPs ∝ base²` ⇒ base 12/16 分别 ≈24.4 / 43.4 GFLOP（脚本会自己算，不引用本行近似值）。
**对标先例**：记忆里的「9.3 GFLOP U-Net@640 fp16 = 5.3ms」≈ 本台 base=8 这一档；
脚本每行都给 `折算 9.3 GFLOP 的 ms` 列，直接和 5.3ms 比。

### 7.3 CPU 对照（已实测，本会话）

| 配置 | GFLOP | 中位 ms | 有效 GFLOP/s |
|---|---|---|---|
| U-Net base8 @640², CPU fp32, 1 线程口径(torch 默认) | 10.85 | **107.07** | 101.4 |

⇒ CPU 要 ≤10ms 需 ~10.7× 加速（单核不可能，多核并行也只在 16 核 × 1.3 倍量级）；
**结论不变：≤10ms 只能走 GPU**，CPU 路径必须自报 `degraded`。

### 7.4 坑：onnxruntime 的 CUDA EP **静默回落 CPU**（实测原文）

请求 `['CUDAExecutionProvider','CPUExecutionProvider']` 建 session，**不抛异常**，只打：
`Failed to create CUDAExecutionProvider. Require cuDNN 9.* and CUDA 13.*. Please install all dependencies…`
而 `sess.get_providers()` 实际返回 `['CPUExecutionProvider']`，OCR det 模型照跑 2.29ms（**CPU 数字**）。
⇒ 任何写"GPU 上 X ms"的代码，**第一行必须断言 `'CUDAExecutionProvider' in sess.get_providers()`**，否则读数无效。
（本机若也回落，按记忆 D373 的三道坎查：①`ctypes.CDLL('/usr/lib/libcudnn.so.9', RTLD_GLOBAL)` 解决加载顺序
②`ort.register_execution_provider_library('CUDAExecutionProvider', <capi>/libonnxruntime_providers_cuda.so)`
③ RapidOCR 那条 `ort.get_device()` 返回 `'GPU-DNNL'` 导致判假——只影响 RapidOCR，不影响本台子。）

### 7.5 本机现有可跑权重（0 下载）

`rapidocr` 的 `ch_PP-OCRv4_{det,rec}_infer.onnx` + `faster_whisper/silero_vad_v6.onnx`（后者需 h/c 双输入，本台子按单输入测会报错并如实记录）。
**检测类（YOLO/DETR/UI-parsing）权重=0**，任何检测路线都要下权重（=需授权；用户已原则批准 yolo11n 冒烟）。

---

## 八、GPU 实测（2026-10-18 19:5x，**Lead 会话**跑 `bench_gpu.py`，rc=0，50 iter / 10 warmup）

> 执行者=Lead（GPU 可见会话）；本文件只记录读数与结论。原始 JSON 由 Lead 会话落盘（`--out`）。

| 配置 | 中位 ms | min ms | 有效算力 | 折算 9.3 GFLOP 的 ms |
|---|---|---|---|---|
| U-Net@640 base8 **CUDA fp16** | **10.65** | 10.40 | 1019 GFLOP/s | — |
| U-Net@640 base8 CUDA fp32 | 16.76 | — | — | — |
| U-Net@640 base16 **CUDA fp16** | **10.79** | 10.67 | 3985 GFLOP/s | **2.33** |
| U-Net@640 base8 CPU fp32 | 89.25 | — | ~120 GFLOP/s | — |

**读法（关键，别读反）**：base8 与 base16 的 fp16 时间几乎一样（10.65 vs 10.79ms），而 base16 的算力利用率
是 base8 的 3.9× ⇒ **这一档还没到算力墙，瓶颈在固定开销（kernel launch / 显存搬运 / host 往返）**。
折算到 9.3 GFLOP 口径 = **2.33ms**，比记忆里的 5.3ms 先例还好 ⇒ **「对象检测单帧 ≤10ms」在算力上已成立**。

**冷启动（Lead 会话）**：`import_cv2 4362ms` / `import_torch 2172ms` / `imread(2560×1440) 473ms` / `import_ort 167ms`。
⇒ **常驻服务不是优化项，是前提**（同记忆 D373/D375）。

**onnxruntime 的 CUDA EP 回落也在 Lead 会话复现**：请求 cuda，实际 `providers=['CPUExecutionProvider']`，
det 前向 3.67ms（CPU 数字），GPU 真起=**NO**。
⇒ 裁决（Lead）：**主推 torch fp16**，ONNX 留作以后导出部署的可选项；不装 ultralytics、不下 yolo11n（支线搁置）。

## 九、pipeline 的下一道瓶颈：**host 后处理**（不是网络）

`ys-screen --backend torch --no-ocr --containers --repeat 4`（本会话 CPU 实测）：

| 项 | ms | 说明 |
|---|---|---|
| 稳态 container_ms（base8 fp32, CPU） | **95** | 网络前向 70–88 + host 后处理 ~25 |
| 其中 阈值(分位数) | 5 | numpy |
| 其中 闭运算 + 连通域 | 15 | `scipy.ndimage` |
| 其中 取框（`find_objects`） | ~5 | 原实现逐标签 `np.where(lab==i)` 实测把这段拖到 ~800ms，已改 `find_objects` |
| 首帧 | 1371 | 含 `import torch` + 建网（一次性，常驻后不再付） |

⇒ GPU 端到端粗算 = **网络 10.65ms + host 后处理 25ms ≈ 36ms**（host 占 70%）。
要把单帧压进 ≤10ms，下一步是把阈值+连通域搬到 GPU（或换成固定网格回归头直接出框），
**继续优化网络收益为零**（base8→base16 时间不变已经说明这点）。

## 十、留一帧交叉验证（LOO）可行性与工作量评估（**未真训**）

### 10.1 语料其实是「12 个屏幕族 / 14 帧」

| 族 | 帧 | units | 留出后训练集 units |
|---|---|---|---|
| A 活动一览·且试身手 | f00 | 19 | 266 |
| B 活动一览·风仙亦是仙（同屏异滚动） | f01,f02 | 32 | 253 |
| C/D/E 溯流变奏曲 / 绮星盛会 / 奇域秘藏 | f03,f04,f05 | 15/14/14 | 270/271/271 |
| F/G/H 派蒙菜单 首屏/滚一屏/千星区（同屏三滚动位置） | f06,f07,f08 | 29/28/29 | 256/257/256 |
| I 设置·控制 | f09 | 21 | 264 |
| J 设置·图像（同屏异滚动） | f10,f11 | 45 | 240 |
| K 设置·语言 | f12 | 14 | 271 |
| L 存档选择 | f13 | 25 | 260 |

### 10.2 结论：**按帧 LOO 会虚高，按族 LOO 又不足以证伪**——所以它不该当精度门禁

1. **按帧留一（leave-one-frame-out）有近重复泄漏**：f01/f02、f10/f11、f06/f07/f08 是同一屏不同滚动位置，
   留出 f07 时 f06/f08 提供几乎相同的像素分布 ⇒ 数字会被"背屏"抬高，**测的是记忆不是泛化**。
2. **按族留一（leave-one-screen-family-out）才诚实**，但只剩 12 折、每折训练集 **240–271 units**（≈ 250 个框）。
   对比 640² 的 U-Net（base8 ≈ 0.5M 参数），这是"每族 1–3 帧"的学习条件，
   结论必然是「学不动 / 背屏」二选一，**无法回答"能不能超过 CV 30.5%"**。
3. 更关键：**CV 基线的 30.5% 是聚合值，本身被屏幕族主导**——派蒙三帧（86 units）占 56/86=65%，
   而活动一览六帧（94 units）只有 12/94=12.8%。拿一个聚合数字当"要超过的线"会掩盖"在哪类屏上未过线"。
   ⇒ 建议把门禁改成**分形态的线**（网格 tile ≥95%、行 ≥50%、图标/头像 ≥60%、卡片/按钮 ≥50%），
   聚合值只作趋势跟踪。

### 10.3 若坚持做一次 LOO（只为验证管线，不为精度），工作量 ≈ 4–5 小时

| 步骤 | 内容 | 预计 |
|---|---|---|
| ① 标签张量化 | truth JSON → 每帧 objectness/affinity 目标图（640²，Gaussian 峰 + 距离图） | 2h |
| ② 训练循环 | torch，U-Net base8 fp16，AdamW + 增强（随机裁剪/缩放/亮度/半透明叠加） | 1.5h |
| ③ 评测接线 | 复用 `tools/ys-coverage`：模型出框 → containers[] → 逐帧 COVERAGE | 0.5h |
| ④ 跑 12 折 | 每折 ~200 epoch × 2s ≈ 7min ⇒ 12 折 ≈ 1.4h（RTX 3060 余量足够） | 1.4h |
| **合计** | 得到的是「管线通不通 + 标签定义对不对」，**不是**精度结论 | **≈4–5h** |

### 10.4 真正要回答"能否超 30.5%"，最小可信实验

- **数据量**：**~200 帧 / ~4,000 实例**（每帧 ~20 units），按屏幕族切分（≥8 族，每族 ≥10 帧）。
- **标注成本**：现工具链单帧 ~170s（本批 14 帧/40min 含工具开发）；流水线化后目标 **60–90s/帧**
  ⇒ 200 帧 ≈ **3.5–5 小时**（可用主动学习挑帧：先训一版，只标模型不确定的帧）。
- **训练成本可忽略**：200 帧 × 11 GFLOP ≈ 2.2 TFLOP/epoch（前向），fwd+bwd ≈ 6.5 TFLOP ⇒ ~2s/epoch
  ⇒ 300 epoch ≈ **10 分钟**。**瓶颈是标注与标注一致性，不是算力。**
- **三步走建议**：①先用现有 285 实例训一版（4–5h）拿管线通行证；②再批量采 200 帧；
  ③组切分评测，门禁用 §10.2-3 的分形态线。
