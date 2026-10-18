# 票 24 — 对象检测换路线（学习型 GPU）离线验证 → 上线

> 状态：🟡 离线准备完成（`../gui-detect/bench.md` 已交 Lead 过闸）；**装包/下权重/占 GPU 未做，等用户裁决** ｜ Blocked by：23（已交付读数）｜ 设计依据：[`AGI-BAR.md`](../AGI-BAR.md) 口径 2（seq 6311「这个叫做对象检测…gpu 上跑应该很轻松」）

## What to build（用户视角端到端）

把「找可交互对象」从手搓几何判据换成**学习型检测**（GPU ≤10ms/帧），
用票 23 的真值集训练/评测；经典 CV 只作保底与对比基线。

用户视角：卡片贴插画、纯图标、角色头像这些**没有文字的块**，也能被稳定检出并给出可点区域。

## 验收项

- [ ] 离线：候选路线对比（ONNX Runtime GPU / ultralytics YOLO / 轻量 U-Net）→ `.scratch/gui-detect/bench.md`（fp32/fp16 实测 ms + 检出率）
      → **部分完成**：`.scratch/gui-detect/bench.md` 已落（6 条路线 × 可行性 × 预计 ms × 依赖/权重体积 × 训练数据需求）；**fp32/fp16 GPU 实测未做**——本会话 `/dev/nvidia*` 不存在（驱动 615.78.08 在、libcuda/libcudnn 在、设备节点缺），`torch.cuda.is_available()=False`、`nvidia-smi` 通信失败；CPU 侧实测 174.8 GFLOP/s ⇒ 9.3 GFLOP U-Net 折算 53ms/帧（否决 CPU 回退）
- [ ] 检出率 > **手工 CV 天花板 40%**（票 23 记分器口径）
- [ ] 单帧检测 **≤10ms**（GPU，实测）；CPU 退化路径明示
- [ ] 关键样本：f08 六个纯图标 ≥5/6；f08 角色头像 1/1；f13 粘连卡 0 合并；f09/f12 退化整屏 panel **0**
- [ ] 负样本（3 类）0 假阳性；置信度分布留档
- [ ] 上线形态：`ys-screen` 新增检测后端 + `CONTAINER_RULESET` +1，旧路径 `--backend cv` 仍可用
- [x] **反馈轮闸门**：装包/下权重/占 GPU 前必须停手问用户（本票第一动作）
      → 已停手：**零安装、零下载、零 GPU 占用**；bench.md 交 Lead 转用户过目（原始读数 `gui-detect/env-probe-2026-10-18.log`）

## 收轮三件套

- [ ] 勾票 + 看板移入划掉区 + 前沿指向下一票
- [ ] 看板 §⑤ 递归判据表更新一行
- [ ] 精确 git commit
