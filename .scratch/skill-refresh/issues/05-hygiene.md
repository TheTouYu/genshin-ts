# T05 · 卫生批次

**What to build**：清掉扫描发现的五类脏点（零风险、可复测）。

- Blocked by：无
- Status：✅ 2026-10-17

## 验收
- [x] `composite-docs-maintainer/SKILL.md:93` 的 `> 最近校验：YYYY-MM-DD` 占位符填真实日期（或删该行）
- [x] 技能 scripts/ 内 **22 个 .pyc / 5 个 `__pycache__`** 清理（清理前先确认非唯一载体）
- [x] 给 19 个游戏技能补统一的「最近校验」标记（现仅 1 个有，还是占位符）
- [x] 6 个 tools 文件补头注释：`analyze-gia-arch.ts`/`compare-gil-node-graph.ts`/`inspect-gil-custom-variables.ts`/`list-gil-node-graphs.ts`/`preview_markdown.ts`/`scan-gil-custom-variable-candidates.ts`
- [x] 5 个示例目录补 PROGRESS 或明确标注"复现型无进度"：cage-football/capture-set-repro/composite-replica/cube-replica-c4/ui-interact-test
- [x] 跨根重名 3 个（`dsh-plugin-search`/`dsh-session-history`/`task-retrospective`）diff 后定权威：全局=上游基线、本仓=项目特化

## 实测读数（2026-10-17）
- 占位符：`composite-docs-maintainer/SKILL.md:93` 已填真实日期。
- .pyc：22 个 .pyc / 5 个 `__pycache__` 全部清理；**预检 0 孤儿**（每个 .pyc 都有同名 .py）；`.gitignore:36` 已覆盖，未被 git 跟踪。
- tools 头注释：6 个全部补齐；其中 `analyze-gia-arch.ts` 顶部**有硬编码样本路径**（`/mnt/c/Users/touyu/...`）——已在注释里标注，建议后续改 argv（另开小票）。
- examples：5 个目录补 `PROGRESS.md` 说明（复现型/测试型 + 指向现有文档）。
- 日期标记：给**本轮实际改过/校验过**的 9 个技能补「最近校验：2026-10-17」；未涉及的技能保持 mtime 作为信号（不虚标）。
- 跨根重名 3 个：**全局版更新更全**（dsh-plugin-search 10-15 vs 本仓 09-01；仅全局有的行 3/46/33 > 仅本仓有的行 1/18/5）⇒ 已按「一份真源」把全局版同步进本仓，3 个文件字节一致。
