# 票 06 — 标定库 + 自动失效 + ys-find 语义定位

> 状态：⬜ 未开工 ｜ Blocked by：02 ｜ 设计依据：[`../DESIGN.md`](../DESIGN.md) §五 5.1

## What to build

**坐标是会话态，模板+条件是资产。** 代码里不再出现裸坐标；
`ys-find <控件名>` 按语义定位，返回坐标 + 置信度 + 来源；标定失效时**拒绝使用**而不是退化成旧值。

## 验收项

- [ ] `calib/controls.json` 每条含 `{name, locate, calibrated, evidence, conditions, confidence, failures, status}`
- [ ] `ys-find 试玩磁贴` → 输出坐标 + 置信度 + 来源（模板/像素判据）
- [ ] **删掉一个模板文件** → 该控件报 `SUSPECT` 且**拒绝使用**（不退化成"用上次坐标"）
- [ ] `conditions`（分辨率/主题）不匹配 → 拒绝使用并说明原因
- [ ] 定位失败自动存证据图到 `evidence/`，并把该条 `failures++`
- [ ] `tools/ys-editor/` 下不再有裸坐标常量（grep 判据）

## 收轮三件套
- [ ] 勾票 + 看板移入划掉区 + 前沿指向下一票
- [ ] 看板 §⑤ 递归判据表更新一行
- [ ] 精确 git commit
