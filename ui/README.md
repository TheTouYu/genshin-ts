# ui/ 模块总图（UI 编辑器命令层）

> 建立：2026-09-03（用户定调：UI 提升为真正模块级——资源/设计/代码同家）
> 入口约束：`ui/AGENTS.md`（每次进入本目录必读）；本文件是索引与路线。

## 模块地图

```text
ui/
├── AGENTS.md   高频约束（铁律 9 条 / 分层 L1-L4 / 概念与递归 / 坐标速记）——每次进入必加载
├── DESIGN.md   设计全稿（设计约束 → 命令面定义 → 规则-命令映射 → 验收；票 03 产出地，v0.2 FROZEN）
├── README.md   本文件（索引 / 资源家谱 / 现状 / 路线）
├── src/        实现代码（票 04 起：语义层 list/anchor/diff；TS 随根 tsconfig 编译到 dist/ui/src）
├── tests/      全量快照断言（exhaustive-snapshot-verify.ts 80 快照 127/127；semantic-list 9/9）
└── verification/  输出样例（ticket04-command-output-samples.md，可复现命令记录）
```

## 资源家谱（按权威度与新旧排列，工作前先对号）

| 文件 | 内容 | 权威度/状态 |
|---|---|---|
| `.agents/skills/editor-incremental-gia-investigator/references/ui-controls.md` | **63+ 轮差分规则（当前最新权威）**：按钮族/图文输入框/悬浮页/消息队列/通用配置 | ✅ 最新；79+ 节，随差分轮持续追加 |
| `docs/game-engine-knowledge/ui-controls.md` | 08 月早期 wire 规则 | ⚠️ 早期版，与新样本冲突处以 references 版为准（待核对合并） |
| `docs/game-engine-knowledge/ui-floating-page-rich-create.md` | 富版悬浮页蓝图（08-27） | ⚠️ 悬浮页新版结构（r24-35：单条族/双份树/增量同步）已取代其中部分假设，实现前须重验 |
| `docs/game-engine-knowledge/ui-coverage-exploration-log.md` | 覆盖探索日志 | 📋 历史记录 |
| `docs/game-engine-knowledge/retrospective-2026-09-03-ui-diff-restart-63-rounds.md` | 59 轮差分波复盘（方法论三条律） | ✅ 2026-09-03 |
| `docs/ui-tutorial/` | **官方教程**（编辑器界面/节点/FAQ，含控件配置语义） | 📖 官方第三方 |
| `src/definitions/events-payload.ts` 等 | 官方事件/节点 API（如 whenFloatingInteractionPageIsTriggered） | ✅ 代码定义（生成物） |
| `src/cli/assets_ui.ts` / `src/cli/gil_ui.ts` | 现有 UI CLI（assets:ui、悬浮页创建 4 条规范） | ⚠️ 悬浮页创建按旧规范（4 条），**须按 r24-35 新链路重验**（记入设计风险） |

## 差分证据

- 快照与 manifest：`.gsts/diff-exp/ui学习/`（gitignored）：`1073741909.after-重启<N>-<语义>-<hash8>.gil` +
  `restart-manifest.md`（LOCKED 链）+ `coordinator/`（root-wire diff JSON）。
- 差分流程技能：`editor-incremental-gia-investigator`（SKILL.md 含 2026-09-03 回灌方法：归因顺序律/语义分层/difflib 小片段/三方对照/同构复用）。

## 验收与核验（票 04 全量核验后固化）

- 全量语义断言：`ui/tests/exhaustive-snapshot-verify.ts`——80 个快照 ×（通用完整性：每条记录在 flat、无重复、无 unknown 误归类；+ 47 项逐轮人工结论对照）→ **127/127 PASS**。
- 核心样本断言：`ui/tests/semantic-list.snapshot-assert.ts`（9/9 PASS）。
- CLI 端到端：真 `assets:ui list --flat/--tree --format json` 对 80 快照逐个执行 → FAIL=0；源 .gil sha 前后一致（只读）。
- 输出样例：`ui/verification/ticket04-command-output-samples.md`（真实命令输出 + 复现命令）。
- 断言脚本依赖本地 `.gsts/diff-exp/ui学习/` 快照（gitignored）；缺失时脚本 SKIP。

## 票据与进度

- 看板：`.scratch/ui-command-layer/BOARD.md`；票 01（按钮族）✅；票 02（常见组件）✅；票 03（设计稿）✅；**票 04（CLI list+diff）✅**；票 05-07（CLI create/edit/delete）；票 08（游戏内验收）。
- 实现代码：`ui/src/`（list/anchor/diff 语义层，票 04 起）；CLI 接线在 `src/cli/assets_ui.ts`（只读命令委托 ui/src）。
- 分层路线与实现顺序见 `ui/AGENTS.md`「分层路线」。

## 模块建立决策记录（2026-09-03）

用户定调：UI 差分 63 轮只覆盖约 1/3 wire 面，但设计先行；模块独立成目录并置 AGENTS.md 常驻约束。
设计四原则（用户）：扩展性 / 分层（list→create→edit→精确属性）/ 递归 / 保留游戏概念。
设计 12 条约束（AI 提议、用户认可）：见 `ui/DESIGN.md` 第一章。知识主体留在技能 references
（技能加载器常驻暴露），模块 AGENTS/README 持索引与关键约束——不搬大文件、不双份维护。
