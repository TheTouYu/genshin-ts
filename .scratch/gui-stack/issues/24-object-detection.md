# 票 24 — 对象检测换路线（学习型 GPU）离线验证 → 上线

> 状态：🟡 离线准备完成（`../gui-detect/bench.md` 已交 Lead 过闸）；**装包/下权重/占 GPU 未做，等用户裁决** ｜ Blocked by：23（已交付读数）｜ 设计依据：[`AGI-BAR.md`](../AGI-BAR.md) 口径 2（seq 6311「这个叫做对象检测…gpu 上跑应该很轻松」）

## What to build（用户视角端到端）

把「找可交互对象」从手搓几何判据换成**学习型检测**（GPU ≤10ms/帧），
用票 23 的真值集训练/评测；经典 CV 只作保底与对比基线。

用户视角：卡片贴插画、纯图标、角色头像这些**没有文字的块**，也能被稳定检出并给出可点区域。

## 验收项

- [ ] 离线：候选路线对比（ONNX Runtime GPU / ultralytics YOLO / 轻量 U-Net）→ `.scratch/gui-detect/bench.md`（fp32/fp16 实测 ms + 检出率）
      → **部分完成**：`.scratch/gui-detect/bench.md` 已落（6 条路线 × 可行性 × 预计 ms × 依赖/权重体积 × 训练数据需求）；**fp32/fp16 GPU 实测未做**——本会话 `/dev/nvidia*` 不存在（驱动 615.78.08 在、libcuda/libcudnn 在、设备节点缺），`torch.cuda.is_available()=False`、`nvidia-smi` 通信失败；CPU 侧实测 174.8 GFLOP/s ⇒ 9.3 GFLOP U-Net 折算 53ms/帧（否决 CPU 回退）
- [ ] **门禁改「分形态线」（Lead 2026-10-18 裁决，聚合值只做趋势，不再当门槛）**：
      按 `tools/ys-coverage` 的 kind 拆分，必须同时满足
      **tile ≥95% / row ≥50% / icon ≥60% / avatar ≥60% / card ≥50% / button ≥50%**。
      现状（cv 后端，票 23 基线）：tile **100%**、row 20.9%、card 7.1%、button 4.3%、
      **icon 0/38、avatar 0/8、chip 0/4**；聚合 30.5%。⇒ 目标就是把这四类从 0 拉起来。
      计分口径：`tools/ys-coverage --truth .scratch/gui-corpus/truth --pred <输出> --pred-format xywh`
      （分 kind 汇总见 `baseline-2026-10-18.json` 的 `summary.by_kind`，需要时用 `--json-out` 重算）
- [ ] 单帧检测 **≤10ms**（GPU，实测）；CPU 退化路径明示
      → **算力侧已闭合**（Lead 会话 `bench_gpu.py`，rc=0）：U-Net@640 **base8 fp16 = 10.65ms / base16 fp16 = 10.79ms**，
      base16 折算 9.3 GFLOP = **2.33ms**（优于 5.3ms 先例）；CPU fp32 base8 = 89.25ms ⇒ 退化路径=自报 degraded。
      **新瓶颈是 host 后处理**：本会话实测 `--backend torch` 稳态 95ms/帧 = 网络 70–88 + host 去噪/连通域 ~25；
      GPU 端到端粗算 10.65+25 ≈ 36ms ⇒ 下一步把阈值+连通域搬 GPU（或换固定网格回归头），不要继续优化网络
- [ ] 关键样本：f08 纯图标 **≥5/5**（实测可见 5 个：相机/邮件/活动/罗盘/齿轮；第 6 个被录制 HUD 遮挡，
      不可见不猜 ⇒ 不设 6 的门槛）；f08 角色头像 **1/1**；f13 粘连卡 **0 合并**；f09/f12 退化整屏 panel **0**
- [ ] 负样本（3 类）0 假阳性；置信度分布留档
      → **当前 FAIL（不许算通过）**：`neg-world`（提瓦特世界实景，1530×1440）上 cv 后端给 2 个假对象
      （`row [952,918,1328,1078]` 水面/岩石区 + `unknown [1374,1190,1530,1320]` UID 文字区），
      `neg_violations=1`。待 Lead 提供整屏世界帧后复测；在此之前本项维持**未过**。
- [x] 上线形态：`ys-screen` 新增检测后端 + `CONTAINER_RULESET` +1，旧路径 `--backend cv` 仍可用
      → **plumbing 已落地**（`--backend cv|onnx|torch`，cv 默认；缓存键加 `backend_sig`）：
      ①cv 输出 **14/14 帧逐字节不变**；②`--backend onnx --detect-model mock:` 把真值框喂进去 → `ys-coverage` 得 **19/19 rate=1.000 iou=1.000**（检测→containers→schema→记分器整链通）；
      ③缺模型 **exit=6** fail-closed（不静默回落 cv）；④ORT 请求 CUDA 而 provider 没真起 ⇒ 报错（两次实测静默回落 CPU）。
      接口/缓存键/fail-closed 判据见 `.scratch/gui-detect/backend.md`
- [x] **反馈轮闸门**：装包/下权重/占 GPU 前必须停手问用户（本票第一动作）
      → 已停手：**零安装、零下载、零 GPU 占用**；bench.md 交 Lead 转用户过目（原始读数 `gui-detect/env-probe-2026-10-18.log`）

## 前置：200 帧数据与半自动标注（Lead 2026-10-18 定）

- [x] 半自动标注流水线：`.scratch/gui-corpus/tools/prelabel.py`（预标 → 行文本修正 → apply → check），
      用法见 `.scratch/gui-corpus/label/README.md`。实测：预标 **4.3s/帧**、召回 **40.7%**、假候选 325（14 帧），
      人工估算 **55–90s/帧**（**未真人计时**）。
- [ ] 200 帧精度实验：**用户裁决前不开**（Lead 2026-10-18）。真做需 200 帧/~4000 实例；
      按族 LOO（2–3 折，不 12 折）先证明管线通，预算 2h。
- [x] 真值独立性复核：`remeasure_grid.py`（低亮度同色连通域，前提与 ys-screen 无关）在 f06/f07/f08 上
      **extra=0、matched IoU 0.76–0.88**（16px 级一致；偏差=独立测量把外发光一起框进来），
      读数写进 `truth/*.json` 的 `_provenance.independent_check`。

## 收轮三件套

- [ ] 勾票 + 看板移入划掉区 + 前沿指向下一票
- [ ] 看板 §⑤ 递归判据表更新一行
- [ ] 精确 git commit
