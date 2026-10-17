# 纯视觉 GUI grounding 三实验报告（千星编辑器 / Wine 无 AT-SPI 场景）

**日期**: 2026-10-17 ｜ **数据**: tools/ys-editor/calib/regress/ 11 张真实 2560×1440 帧 ｜ **打分核**: tools/ys-editor/ys_look.py::_ncc_np（FFT+积分图 NCC，只读复用）
**一句话结论**: 单模板 NCC 判态在真实帧上有 ≥0.9 假命中且换尺度必死；**锚图(多锚点+RANSAC+inlier 闸门)在 10 张异态帧上 0 假接受、±10% 缩放内定位 ≤1.2px、1.4s/帧**；缺口仅剩"锚点候选多尺度"（±25% 档 0/4 接受）；中文文本锚用 RapidOCR 完全可行（3/3 标签 100%）。

---

## 实验 A：NCC 模板匹配 vs 重采样（results/expA.json，n=60 正样本 + 60 负样本）

模板=已标定控件在基帧命中位置的真实裁片（menu/pause/savelist 三基帧 × 2 模板，自态分数 0.9998~1.0，与 D316 实点坐标吻合）；变换=缩放 0.75/0.9/1.1/1.25、平移 ±64px、亮度 ±10%、两个组合；多尺度=5 档网格 [0.75,0.875,1.0,1.125,1.25]。

| 扰动类 | n | 原尺度命中率(err≤8px) | 原尺度中位err | 多尺度命中率 | 多尺度中位err | 原尺度耗时 | 多尺度耗时 |
|---|---|---|---|---|---|---|---|
| 缩放 | 17 | 35.3% | 204px | **100%** | 0.5px | 1.05s | 6.44s |
| 平移 | 23 | 100% | 0px | 100% | 0px | 1.00s | 6.16s |
| 亮度 | 12 | 100% | 0px | 100% | 0px | 1.03s | 6.37s |
| 组合 | 8 | 0% | 355px | **100%** | 0.5px | 0.96s | 6.13s |
| **全量** | 60 | **68.3%** | — | **100%** | 0px | 1.01s | 6.28s |

- 典型行：`menu/playtest-tile scale0.75 单尺度 err=246.9px sc=0.521（丢失）→ 多尺度 err=0.6px sc=0.978 f=0.75（找回）`。
- **负样本（同模板打 10 张异态真实帧，原尺度全帧 NCC）：60 对中 8 对 >0.8、3 对 >0.9 假命中**：sidebar-save-mgr→settle.png **0.9371**；pause-resume→menu.png **0.9522**；save-card-title→settle2.png **0.9167**。0.9 阈值挡不住（假命中率 5%），0.8 阈值 13%。**这是历史三起假命中事故的当代定量复现。**
- 跳过 12 样本（8 出界：模板缩放后出画布；4 自检形状不匹配），已记账于 expA.json.skipped。
- 局限：多尺度网格步 12.5%，与实验变换档重合；任意中间尺度落在网格间时的残余误差**未测**。

## 实验 B：锚图 = 多锚点局部 NCC 候选 + RANSAC 相似变换 + inlier 闸门（results/expB.json）

基帧 menu.png，锚点 10 个（2 已标定控件 + 8 梯度能量纹理锚 64×64，锚图见 crops/anchor_*.png）；每锚 ±384px 窗口取 top-3 峰（floor 0.5），RANSAC 拟合 4 参数相似变换（复数闭式解，2 点采样×300 迭代 + inlier 最小二乘精修），判据=inliers≥3 且中位残差≤2px。ncc_map 与 _ncc_np 等价断言通过（selfcheck OK）。

| 被测帧 | 接受 | inliers | s 误差 | 全锚点定位中位 err | 耗时 |
|---|---|---|---|---|---|
| identity / 平移×4 / 亮度×2 | ✅ 7/7 | 8~10 | 0.0% | **0.0px** | ~1.4s |
| scale0.9 / scale1.1 | ✅ 2/2 | 5~9 | 0.04~0.06% | **0.5~1.2px** | ~1.4s |
| scale0.75 / scale1.25 / combo1 / combo2 | ❌ 0/4 | 2 | — | — | ~1.4s |
| **10 张异态真实帧（含 grass-shadow/playtest3/settle3 历史误判帧）** | ❌ **0/10 错误接受** | ≤2 | — | — | ~1.4s |

- 正样本 9/13 接受、**0 假接受**；4 个失败全部是 ±25% 缩放档——**死因与实验 A 原尺度相同：锚点裁片固定尺度，内容缩放 25% 后 NCC 掉到 floor 以下（候选数 13~21 vs 正常态 24~27）**。
- 对照：同一素材裸单模板（实验 A 负样本）在异态帧有 3 笔 ≥0.9 假命中；锚图 0 笔——**几何一致性闸门把假命中根因治掉了**。
- 成本：10 锚点/帧 ≈1.38s（CPU）；锚点数与成本线性。

## 实验 C：OCR 引擎现实测评（results/expC.json）

裁区=真实帧按钮区（pause 700×488 三按钮；settle2 600×290「离开」；300×56 模板小图）。基准文案独立信源=manifest.tsv + D316 实点会话（继续挑战/重新挑战/中断挑战/离开）。

| 引擎 | pause 三按钮 | settle2「离开」 | 300×56 小图 | 耗时 |
|---|---|---|---|---|
| tesseract 5.5.3 chi_sim psm6 | 8/12 字（继续/中断各对一半，串成乱串） | **0/2（读成"师黯"）** | 0/4（"rF刨EB"） | 0.31~0.56s/次(冷进程) |
| tesseract psm7 | 8/12 | 0/2 | 0/4 | 0.31~0.35s |
| **rapidocr-onnxruntime 1.4.4** (venv-rapidocr, CPU) | **12/12 字，三标签全对** | **2/2** | 3/4 | init 0.34s + 0.65~0.73s/图(常驻热态) |
| paddleocr 3.7.0 (paddlepaddle==3.2.0) | 12/12（多一个噪声段"日"） | 未跑 | 未跑 | init+模型下载 25.6s + 0.91s/图 |
| paddleocr + paddlepaddle 3.0.0 / 3.3.1 | **装得上、推理崩**：3.3.1 `NotImplementedError: ConvertPirAttribute2RuntimeAttribute not support [pir::ArrayAttribute<pir::DoubleAttribute>]`；3.0.0 `ValueError: Type of attribute: strides is not right` | | | |

- **结论：文本锚可行，选 RapidOCR**（同族 PP-OCR 模型的 ONNX 版，离线 CPU、无版本坑）；tesseract chi_sim 不可用（与用户已知"中文差"一致，本次给了定量）；paddle CPU 版本雷区 3.0.0✗/3.2.0✓/3.3.1✗。

## 调研（全部 curl 实抓，原始件在 research/github_raw/、research/papers_arxiv.txt）

GitHub（stars/pushed 为 api.github.com 实测值）：
| 仓库 | stars | 最后推送 | 无 GPU 2560×1440 可用性判定 |
|---|---|---|---|
| RapidAI/RapidOCR | 8162 | 2026-10-17 | ✅ 已实测装通跑通（本报告实验 C） |
| PaddlePaddle/PaddleOCR | 91260 | 2026-09-16 | ⚠️ CPU 版本敏感（3.2.0 通/3.0.0、3.3.1 崩，实测） |
| microsoft/OmniParser | 25529 | 2026-07-20 | ⚠️ 半可用：icon 检测 ONNX 可 CPU；完整链路需 VLM |
| AirtestProject/Airtest | 9605 | 2026-03-23 | ⚠️ pip 可装（README）；模板匹配部分≈我们已有，注入面是 Android/Win 非 Wine |
| bytedance/UI-TARS | 11611 | 2026-01-27 | ❌ 7B/72B VLM（README：UI-TARS-1.5-7B），无 GPU 不可行 |
| AirtestProject/Poco | 1958 | 2024-01-08 | ❌ 需引擎 SDK 挂语义树——正是本场景没有的东西；且两年未更 |
| microsoft/SoM | 1570 | 2024-08-19 | ❌ GPT-4V prompting 方法，需 VLM API |
| njucckevin/SeeClick | 495 | 2025-07-13 | ❌ Qwen-VL 系 9B+ 模型；但其 grounding 评测协议可借 |
| opencv/opencv | 91205 | 2026-10-16 | ⚠️ 本机 py3.14 无 cv2（实测 import 失败）；算法参考（matchTemplate/ECC） |

论文（arXiv API 实抓题录）：
| 论文 | 年份 | 核心方法一句 | 无 GPU 可借什么 |
|---|---|---|---|
| SeeClick (2401.10935) | 2024 | 把 GUI grounding（截图+指令→点击坐标）当独立预训练能力 | 评测协议（屏幕坐标误差分桶）；模型不可借 |
| OmniParser (2408.00203) | 2024 | 可交互元素检测+OCR 两段式屏幕解析，再交 VLM | **检测+OCR 段可离线 CPU——与我们锚点库同构，可借检测器思路** |
| UI-TARS (2501.12326) | 2025 | 原生 VLM agent，System-2 先推理后动作 | 「先定位后动作」分层思想；模型不可借 |
| Set-of-Mark (2310.11441) | 2023 | 截图叠编号标记提升 LMM 视觉定位 | 「候选结构化+编号」思想=锚点 id 化；需 VLM 本体不可借 |
| Ferret-UI (2404.05719) | 2024 | 多分辨率(scales)原生处理移动 UI | 多分辨率金字塔思想与实验 A 多尺度一致 |

## Go / No-Go

- ✅ **GO 锚图主通道**（多锚点+RANSAC+inlier 闸门）：0/10 异态帧假接受（治假命中根因）+ 接受时定位 ≤1.2px + 1.38s/帧。**补丁方向明确：锚点候选加多尺度（或先做单锚多尺度粗估 s 再缩放锚图），预期把 ±25% 档救回**——本次未实现，属下一步。
- ✅ **GO RapidOCR 文本锚**：中文按钮/标题文本是最稳的高熵锚，100% 标签命中、离线、0.65s/裁区；接入锚图框架即文本锚点。
- ⚠️ **限低频用：多尺度全帧模板匹配**：定位 100% 准但 6.28s/模板——只配做「分辨率切换后的重标定」，不做每态判据（全帧单尺度也要 1.0s）。
- ❌ **NO-GO**：单模板单尺度 NCC 判态（5% 假命中@0.9 + 缩放档全灭）；tesseract chi_sim（「离开」→「师黯」）；paddleocr CPU（版本雷）；VLM 系全部（无 GPU 不可行，见调研表）。
- **未验证**（如实声明）：6~11 FPS 真机时序下的端到端延迟（本实验全为静态帧离线）；游戏 3D 内容区作锚区的稳定性（本次纹理锚全在 UI chrome）；多尺度网格中间档残余误差；锚图在"同态不同布局"（如 settle 四版式）间的区分度。

## 复现（全部可重跑，产物在 /home/h/genshin-ts/.scratch/gui-grounding/）

```bash
python3 pick_templates.py        # 121 对定位, 165s → research/template_locations.json
python3 expA_template_matching.py  # → results/expA.json (+crops/ 变换帧) ~11min
python3 expB_anchor_map.py       # → results/expB.json ~35s
python3 expC_ocr_bench.py        # → results/expC.json ~8s (tesseract+rapidocr)
./venv-paddle/bin/python -c "from paddleocr import PaddleOCR; ..."  # paddle 3.2.0 冒烟
python3 analyze_results.py       # → results/summary.md + viz/*.png
```

**如果现在只能选一条技术路线**：锚图（多锚点局部 NCC + RANSAC 相似变换 + inlier≥3 闸门），锚点候选补多尺度、并用 RapidOCR 文本框作高熵锚混编。依据的数字：异态帧 0/10 假接受 vs 单模板 3 笔 ≥0.9 假命中（安全性质变）；接受时定位中位 0~1.2px（够点击）；1.38s/帧（够 6 FPS 判态）；平移/亮度扰动 100% 稳。多尺度全帧匹配（6.3s、100% 命中）退居「换分辨率后的重标定」步骤，RapidOCR（100% 标签命中）作文本锚与判据兜底。
