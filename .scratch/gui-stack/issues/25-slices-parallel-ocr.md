# 票 25 — 切块 + 分块并行 OCR + 切片索引

> 状态：⬜ 未开工 ｜ Blocked by：24 ｜ 设计依据：[`AGI-BAR.md`](../AGI-BAR.md) §二 L1 + 性能门禁；[AGI 系统设计 §2](../../../docs/maintenance/design-2026-10-18-gui-agi-system.md)

## What to build（用户视角端到端）

对象一旦检出就**当场切好**并单独 OCR，结果进内容寻址缓存；
模型要细节时**直接给那一块 + 它的文字 + 局部坐标**，不再重处理整帧。

用户视角：问"这个卡片写的什么"，毫秒级拿到答案，且不因为别处有字而变慢。

## 验收项

- [ ] 每对象自带 `text[]` + `text_source=slice-ocr`；`slices[]` 含路径与 `local_bbox`
- [ ] 分块 OCR 总耗时 **< 全帧 OCR 的 1/3**（并行度可调）
- [ ] 返回单块 ≤5ms（缓存命中）；冷 OCR 走 RapidOCR 子进程不变
- [ ] 字符级抽查：与全帧 OCR 结果对比，切片版**不丢字**（f08 六个 tile 名称、f13「导入存档」）
- [ ] 缓存键含 `frame_sha + bbox + ruleset`，改判据必失效（沿用 `CONTAINER_RULESET`）
- [ ] 落 `.scratch/gui-detect/ocr-bench.md`：前后耗时表（全帧 vs 分块）

## 收轮三件套

- [ ] 勾票 + 看板移入划掉区 + 前沿指向下一票
- [ ] 看板 §⑤ 递归判据表更新一行
- [ ] 精确 git commit
