# 票 23 — bbox 级真值 + 覆盖率记分器

> 状态：⬜ 未开工 ｜ Blocked by：— ｜ 设计依据：[`AGI-BAR.md`](../AGI-BAR.md) §一/§二 L1；[结构设计 §2](../../../docs/maintenance/design-2026-10-18-gui-structure.md)

## What to build（用户视角端到端）

把「这一屏有多少个可交互对象、各自在哪」从人眼判断变成**可复算的数字**，
并让这份数字同时成为票 24（学习型对象检测）的**训练/评测集**。

用户视角：我问"这屏有几个能点的？"，系统给一个数，我随手一数能对上；对不上时差异表能说清是哪一类错。

## 验收项

- [ ] `.scratch/gui-corpus/truth/f00..f13.json`：14 帧 **bbox 级**标注（id/parent/bbox/kind/text/state/badges/clipped）
- [ ] 覆盖六类界面：不透明纯色 / 半透明卡片 / 卡片贴插画 / **纯图标列（f08 六个）** / 列表+按钮 / **负样本**（提瓦特世界 → 0 对象）
- [ ] `tools/ys-coverage`（新，只读）：`--truth <dir> --pred <ys-screen json>` → 逐帧 `COVERAGE frame=fNN units=N hit=K rate=..` + 汇总行
- [ ] 仪器自证：truth vs truth = 100%；注入 3 个已知偏差（漏 1 / 多 1 / 偏 20px）断言必须报错
- [ ] 复跑当前工具落 `.scratch/gui-corpus/baseline-2026-10-18.json`（**workspace 内，禁 /tmp**）
- [ ] 与 seq 6316 计数级基线对齐（f00 19/1、f06 20/19、f12 3+9/0…），差异逐条解释

## 收轮三件套

- [ ] 勾票 + 看板移入划掉区 + 前沿指向下一票
- [ ] 看板 §⑤ 递归判据表更新一行
- [ ] 精确 git commit
