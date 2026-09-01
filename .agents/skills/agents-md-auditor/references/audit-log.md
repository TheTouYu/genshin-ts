# 注入文件审计日志（基线与历次记录）

> 每次审计后追加一节；下次审计先读本文件作基线对比。

## 2026-09-02 首次全量审计（会话实测提炼成技能）

- 范围：24 个文件（22 AGENTS.md + 2 CLAUDE.md）
- 健康组：根 AGENTS/CLAUDE、docs/AGENTS、football、rubik-3x3-client、create-genshin-ts 系列、08-19 原则级批次（src 各层/tests/scripts/tools）
- 修复 4 处（commit d7d1666）：src/cli 命令表补 skill-config/terrain/image；tools 的 trace-gia-*→trace-gil-*；src/compiler 补 tsx 单副本指针；game-engine-knowledge 阅读顺序补录 8 章+日期 08-05→09-02
- 新增 2 处（commit 48913c8，用户选定）：examples/AGENTS.md 根路由 + examples/rubik-3x3/AGENTS.md
- 另：composite-ir 与 game-engine-knowledge 的 index.md 已改名 AGENTS.md（commit 45575db，注入机制原因）
- 遗留：retrospective-archive.md 归档登记停在 2026-08-30，之后约 16 份复盘未入册（game-engine-knowledge/AGENTS.md 已加登记口径警示）；cage-football/rubik-2x2 用户暂不加 AGENTS.md
- 下次重点：examples/AGENTS.md 状态列会腐化（有 git log 复核提示兜底）；复盘入册是否已补
