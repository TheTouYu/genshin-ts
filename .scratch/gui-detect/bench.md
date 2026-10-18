# 票 24 离线准备 · 候选检测路线对比（bench）

> 状态：**离线调研（未装包、未下权重、未占 GPU）**｜仓库 `/home/h/genshin-ts`｜日期 2026-10-18 19:4x
> 依据：`AGI-BAR.md` 口径 2（seq 6311「这个叫做**对象检测**。在我们的gpu上跑应该很轻松」）＋性能门禁
> 「对象检测单帧 ≤10ms（5.3ms 实测，留余量）」；真值集与记分器＝票 23（`.scratch/gui-corpus/truth/`、`tools/ys-coverage`）。
> 原始读数：`env-probe-2026-10-18.log`（同目录）。**本文件里每条"实测"都指本机跑出来的数；
> 标注「文献/折算」的不是实测，不许当验收读数用。**

---

## 一、结论先行（三句话）

1. **本会话拿不到 GPU**：内核模块与驱动在（`NVRM 615.78.08`、`libcuda.so.1`、`libcudnn.so.9` 都在），
   但 `/dev/nvidia*` 一个设备节点都没有 → `nvidia-smi` 报"无法与驱动通信"、`torch.cuda.is_available()=False`。
   ⇒ **GPU 实测必须由能访问 `/dev/nvidia*` 的会话/用户侧跑**（我不越权绕沙箱）。
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
