# 票 02 — ys-state 状态层 + 回归集

> 状态：⬜ 未开工 ｜ Blocked by：— ｜ 设计依据：[`../DESIGN.md`](../DESIGN.md) §三 L1

## What to build（用户视角端到端）

一条命令回答"**我现在在哪个界面**"，且**至少两个独立判据都同意**才给结论；
不同意就报 `AMBIGUOUS`（今天草地阴影骗过单判据、让导航脚本跳过整段导航，就是缺这个）。

态集合：`EDITOR / MENU / SAVELIST / LOADING / PLAYTEST / PAUSE / SETTLE / UNKNOWN`

## 验收项

- [ ] 7 个态全部可识别（每态至少 2 个独立判据，投票）
- [ ] 两判据不一致 → 输出 `AMBIGUOUS` + 两个判据各自的读数，**不猜一个**
- [ ] **回归集**：`calib/regress/*.png` + 每张的期望态；`ys-state --regress` 全绿才算通过
- [ ] **必含今天的反面样本**：草地阴影帧（期望 `EDITOR`，旧判据误报 `SAVELIST`）
- [ ] `ys-ui-state` 标记为被本票取代（保留转发，避免打断既有调用点）
- [ ] 单判据态数从 3 降到 0（看板 §⑤ 记录）

## 收轮三件套

- [ ] 勾票 + 看板移入划掉区 + 前沿指向下一票
- [ ] 看板 §⑤ 递归判据表更新一行
- [ ] 精确 git commit
