# `ys-screen` 检测后端 plumbing（票 24 阶段 1）

> 状态：**管线已通（cv 默认逐字节不变）**｜2026-10-18｜仓库 `/home/h/genshin-ts`
> 判据来源：`AGI-BAR.md` 口径 1/2｜能力读数：`.scratch/gui-corpus/baseline-2026-10-18.md`（CV 30.5%）
> 本文只讲**接口与接线读数**；速度读数在 `bench.md` §七/§八。

---

## 一、接口（三行就够用）

```bash
tools/ys-screen 帧.png                       # cv（默认，行为/输出与改动前逐字节一致）
tools/ys-screen 帧.png --backend torch       # U-Net fp16 stub（随机权重；只验证链路与耗时）
tools/ys-screen 帧.png --backend onnx --detect-model det.onnx   # 外部检测模型（或 env YS_DETECT_ONNX）
```

| 参数 | 默认 | 含义 |
|---|---|---|
| `--backend cv\|onnx\|torch` | `cv` | 检测通道。**cv 是默认且输出不变**（见 §四-①） |
| `--detect-model PATH` | env `YS_DETECT_ONNX` | onnx 模型；也接受 `mock:<dets.json>`（无权重时打通接线） |
| `--detect-providers cuda\|cpu` | `cuda` | onnx 的 EP；`cuda` 会**断言真起**（见 §三） |
| `--detect-min-score` | 0.25 | onnx 置信度下限 |
| `--detect-device cuda\|cpu` / `--detect-dtype fp16\|fp32` | 自动 / `fp16` | torch 后端（fp16 只在 cuda 生效） |
| `--detect-threshold` / `--detect-min-area` | 1.0 / 400 | torch stub 的热图分位阈值 / 最小框面积 |

**后端产出契约（与 cv 通道同形，下游不用分叉）**：`containers[]` 元素仍是
`{id, parent, bbox, kind, skin, text[], glyphs[], badges[], affordance{clickable,evidence[]}, clipped, confidence, evidence{}}`，
其中 **`bbox` 一律 xyxy 原帧坐标**（ys-screen 的既有口径；AGI-BAR schema 写 xywh，跨工具时要换算——见 §四-④）。

**onnx 模型的输入/输出约定**（写进模型卡，训练时必须一致）：
- 输入：整帧**拉伸**到模型输入尺寸（不做 letterbox）、RGB、`/255`、NCHW `float32`。
- 输出：`(N,5|6)` = `[x0,y0,x1,y1,score,(cls)]`（模型输入像素坐标），或 YOLO 导出形态 `(1,4+nc,M)`（cx,cy,w,h + 类分数）。
- `kind` 由类别索引映射（`DETECT_KINDS` 顺序）；未识别类落 `tile`，不猜语义。
- 后处理只做：反归一化（÷缩放比）→ 过滤 `score<min_score` → 排序截断 → 几何包含求 `parent` → OCR 文本按**中心点**归属。

## 二、缓存键（两套后端互不污染）

```
.gsts/ys-find-cache/cont-<帧sha256>-<scale×1000>-<OCR文本签名>-<CONTAINER_RULESET>-<backend_sig>.json
backend_sig = cv                     # 现行平坦皮肤通道
            | torchstub-v1           # torch stub（随机权重，参数版本化）
            | onnx-<模型内容sha256前12位>   # 换权重必换键（按文件内容哈，不按路径）
            | onnx-mock-<哈希>
```
理由：只按帧 sha 缓存，会让"换后端/换权重"读到旧结构（本仓 2026-10-18 已踩过一次 `CONTAINER_RULESET` 版本坑）。

## 三、fail-closed 三条（都是实测踩出来的）

1. **缺模型 ⇒ 退出码 6 + degraded + 明确 error，不静默回落 cv。**
   实测：`tools/ys-screen f06.png --backend onnx --containers` → `exit=6`，
   stderr `检测后端不可用（backend=onnx）：detect-backend: onnx 需要 --detect-model …`。
2. **请求 CUDA 而 provider 没真起 ⇒ 报错。** onnxruntime 缺 cuDNN/CUDA 时**不抛异常**，只打一行
   `Failed to create CUDAExecutionProvider. Require cuDNN 9.* and CUDA 13.*` 然后**静默回落 CPU**
   （本机两次复现：Subagent 会话 + Lead 会话；det 前向 2.29/3.67ms 其实是 CPU 数字）。
   ⇒ `_onnx_session()` 里断言 `'CUDAExecutionProvider' in sess.get_providers()`。
3. **像素/推理任何异常 ⇒ `degraded=true` + `error`**（沿用 cv 通道的 fail-closed 形态，绝不返回半成品结构）。

## 四、接线自证（4 条读数，可复跑）

| # | 命令 | 期望 | 实测 |
|---|---|---|---|
| ① | `for f in f00..f13; tools/ys-screen $f --backend cv --json` | 与改动前**逐字节相同** | **14/14 `containers` 完全相同**（`json.dumps(sort_keys=True)` 相等） |
| ② | `tools/ys-screen f00.png --backend onnx --detect-model mock:<truth f00 的框> --no-ocr --containers` | 检出 = 真值 19 框 | `containers=19`，再喂 `tools/ys-coverage` → **`hit=19 units=19 rate=1.000 iou_mean=1.000`** ⇒ **检测→containers[]→schema→记分器**整链通 |
| ③ | `tools/ys-screen f06.png --backend onnx --containers`（无模型） | 退出码 6 + 说清原因 | `exit=6`，错误原文见 §三-1 |
| ④ | `tools/ys-screen f06.png --backend torch --no-ocr --containers --repeat 4` | 稳态 container_ms | `container_ms=95`（CPU fp32；首帧 1371ms 含 torch 导入+建网）。随机权重 ⇒ 检出 23 框但**无语义**（过记分器 `hit=0 fp=23`，这是**预期**，不许当精度读数） |

> ④ 的 `--repeat` 曾经偷偷测 cv 通道（写死 `find_containers`）——已修成"重复当前后端"。
> 这类"换个参数就测错东西"的坑，判据是：**稳态数字必须能和单次数字对上量级**（95 vs 95，不是 95 vs 20）。

## 五、已知边界（别当成 bug）

- `--backend torch` 是 **stub**：随机权重、固定种子，只为证明链路与耗时。它不做 NMS，不做类别语义，
  `kind` 全是 `tile`。**任何"检出率"结论都不能来自它。**
- `--backend onnx` 的后处理是**通用**实现（无 NMS、无 letterbox、无 tile 切图）。接真模型时按训练侧的
  后处理补齐（NMS 阈值、坐标还原方式），并在 `CONTAINER_RULESET` 或 `backend_sig` 里版本化。
- 后处理目前在 **host（numpy/scipy）**：实测 CPU 侧 25ms（阈值 5ms + 闭运算/连通域 15ms + 取框 5ms），
  在 GPU 端到端里会变成**主导项**（网络 10.65ms + host 25ms ≈ 36ms）⇒ 若要把单帧压到 ≤10ms，
  下一步该把阈值+连通域搬到 GPU（或改成固定网格回归头），而不是继续优化网络。
