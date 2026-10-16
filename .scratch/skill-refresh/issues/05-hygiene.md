# T05 · 卫生批次

**What to build**：清掉扫描发现的五类脏点（零风险、可复测）。

- Blocked by：无
- Status：⬜

## 验收
- [ ] `composite-docs-maintainer/SKILL.md:93` 的 `> 最近校验：YYYY-MM-DD` 占位符填真实日期（或删该行）
- [ ] 技能 scripts/ 内 **22 个 .pyc / 5 个 `__pycache__`** 清理（清理前先确认非唯一载体）
- [ ] 给 19 个游戏技能补统一的「最近校验」标记（现仅 1 个有，还是占位符）
- [ ] 6 个 tools 文件补头注释：`analyze-gia-arch.ts`/`compare-gil-node-graph.ts`/`inspect-gil-custom-variables.ts`/`list-gil-node-graphs.ts`/`preview_markdown.ts`/`scan-gil-custom-variable-candidates.ts`
- [ ] 5 个示例目录补 PROGRESS 或明确标注"复现型无进度"：cage-football/capture-set-repro/composite-replica/cube-replica-c4/ui-interact-test
- [ ] 跨根重名 3 个（`dsh-plugin-search`/`dsh-session-history`/`task-retrospective`）diff 后定权威：全局=上游基线、本仓=项目特化
