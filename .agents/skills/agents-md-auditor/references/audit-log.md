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

## 2026-11-25 根注入文件瘦身 + Win11 口径同步（会话实测）

- 范围：Step 1–3 盘点 27 个注入文件；机械审计 1 处误报（根 `AGENTS.md` 的占位符路径 `.agents/skills/<name>`）→ 修后 **0 问题**。内容级瘦身只动根 `AGENTS.md` / `CLAUDE.md`，范围由用户逐项选定（7 项全选）。
- 结果：`AGENTS.md` 16,282→14,946 B（余量 102→1,438）、`CLAUDE.md` 12,281→11,223 B（余量 7→1,065）。**规则零删除**——每条被移出根文件的内容先核实了副本：
  「仪器优先」的门槛/纪律/耗时监控在 `device-playtest-loop`；节点预算/负载/打印在 `dsl-nodegraph-development`（本次补入此前只存在于根文件的「帧数预算 <3000 帧/记录」）；
  「同名技能只准一份实体」下沉为 `agents-md-auditor` Step 5.5（新增）；构建增量缓存留五条规则，机制与事故在 `scripts/build.mjs` 头注。
- 同步 Win11 口径：Python 件 `node scripts/py.mjs`、提交零设置、首次就绪两条命令、PKC 与 `cmdmon` 在 Win11 不可用；examples 清单改为指向 `examples/AGENTS.md`（原列表已滞后）。
- 提交：见本条所在提交。
- 遗留：**技能体检 FAIL——6 个被路由的全局技能在本机不存在**（`bilibili-learn` / `isolated-model-evaluator` / `oneshot-prompt-builder` / `pkc-project-operator` / `qxqy-simulator` / `task-command-center`；`~/.agents/skills` 目录不存在，Win11 未迁移）⇒ 路由表 6 行悬空，PKC 录入与「派独立模型」在 Win11 走不了。处置待用户裁决（迁移全局技能 / 标 Linux-only）。另：DSH 技能发现不完整——`composite-docs-*`、`genshin-ts-project-adapter` 在项目里存在，却未列入本会话的可用技能。
- 下次重点：全局技能迁移后复跑 `node scripts/py.mjs scripts/skills-health.py`；根文件余量再低于 300 B 时继续下沉而不是硬塞。
