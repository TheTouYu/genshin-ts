# 票 23 — bbox 级真值 + 覆盖率记分器

> 状态：🟡 交付读数已出（真值+记分器+基线落地；票末三件套的看板/commit 由 Lead 统一做）｜ Blocked by：— ｜ 设计依据：[`AGI-BAR.md`](../AGI-BAR.md) §一/§二 L1；[结构设计 §2](../../../docs/maintenance/design-2026-10-18-gui-structure.md)

## What to build（用户视角端到端）

把「这一屏有多少个可交互对象、各自在哪」从人眼判断变成**可复算的数字**，
并让这份数字同时成为票 24（学习型对象检测）的**训练/评测集**。

用户视角：我问"这屏有几个能点的？"，系统给一个数，我随手一数能对上；对不上时差异表能说清是哪一类错。

## 验收项

- [x] `.scratch/gui-corpus/truth/f00..f13.json`：14 帧 **bbox 级**标注（id/parent/bbox/kind/text/state/badges/clipped）
      → **285 个单元 / 8 类**（tile 56、row 110、button 46、icon 38、card 14、panel 9、avatar 8、chip 4）；口径 `truth/_rules.md`；生成器 `truth/_build_truth.py`
- [x] 覆盖六类界面：不透明纯色 / 半透明卡片 / 卡片贴插画 / **纯图标列（f08 实测 5 个，第 6 个位置被录制 HUD 覆盖，判据待裁）** / 列表+按钮 / **负样本**（`truth/neg-world.json`，取自 f06 右侧世界区）
- [x] `tools/ys-coverage`（新，只读）：`--truth <dir> --pred <ys-screen json>` → 逐帧 `COVERAGE frame=fNN units=N hit=K rate=..` + 汇总行
      → IoU≥0.5 一对一；`--pred-format xyxy`（ys-screen 的 containers 实测是 xyxy，不是 schema 的 xywh）；`--require-rate` 闸门（低于线 exit 1）已验：`--require-rate 0.4` → exit 1
- [x] 仪器自证：truth vs truth = 100%；注入 3 个已知偏差（漏 1 / 多 1 / 偏 20px）断言必须报错
      → `SELFTEST RESULT checks=4 fail=0 verdict=PASS`（t1 285/285=100%；t2 14 帧逐帧报出被删 id；t3 每帧 fp≥1；t4 短边<60px 的 24 个对象沿短边位移 20px 全部跌破 IoU0.5）；日志 `gui-corpus/evidence/selftest-2026-10-18.log`
- [x] 复跑当前工具落 `.scratch/gui-corpus/baseline-2026-10-18.json`（**workspace 内，禁 /tmp**）
      → 15 帧（14+负样本）`SUMMARY frames=15 units=285 hit=87 rate=0.305 fp=24 degen=2 neg_violations=1`
- [x] 与 seq 6316 计数级基线对齐（f00 19/1、f06 20/19、f12 3+9/0…），差异逐条解释
      → f00 19/1 **完全一致**；f06 同口径（只数格子）19/19；f12 3+9/0 **完全一致**；README 的 f10/f11 行数写反（12/13）、f08「六个纯图标」实测 5、f13 24→25（卡内 … 按钮）——逐条写在 `gui-corpus/baseline-2026-10-18.md` §5

## 收轮三件套

- [ ] 勾票 + 看板移入划掉区 + 前沿指向下一票
- [ ] 看板 §⑤ 递归判据表更新一行
- [ ] 精确 git commit
