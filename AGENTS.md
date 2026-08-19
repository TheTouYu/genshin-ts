# Genshin-TS Agent Instructions

## 项目愿景（2026-08-14 用户定义，详见 docs/project-vision.md）

本质：自进化能力锻炼——一边做 demo 一边扩充项目能力，教会大模型做游戏。
短期：demo + 生产能力缺陷/bug 修复 + 技能迭代 + 知识落盘；
中期：让大模型触及游戏行业（玩法→可玩 demo 完整闭环）；
长期：建立完整的资金化和学习机制。
每轮结束时按此愿景核对：是否有未落盘的发现/方法论/愿景相关内容。
工具调用规范与跨项目工作方法论见 `docs/collaboration-handbook.md`（高频错误复盘，必须遵守）。

## 回复与协作

- 默认使用中文回复，表达应通俗易懂；保留完成任务所需的技术细节，避免不必要的术语堆砌。
- 先读取目标目录最近的 `AGENTS.md`，再按任务读取匹配的 `.agents/skills/` 和相关文档。
- 控制上下文用量：读取大型文档、JSON、wire 树、日志或工具结果前，先用文件大小、行数、键摘要或限量查询估算输出；优先读取目标段落并让断言脚本只输出 PASS/FAIL 与关键摘要。
- 新功能、疑难 bug 和真实 GIA/GIL 规则调查必须先复用知识树与当前 Authority；确有 coverage gap 时，采用“用户在编辑器做一个最小单变化 → 保存相邻只读快照和哈希 → 定点比较目标结构 → 手工同构重放 → 临时副本注入/回读 → 获确认后真实写回 → 用户游戏核验”的收敛流程。每轮只改变一个可唯一归因的变量。
- 遇到结构歧义、真实 GIA 结论、游戏状态、布局取舍、注入或其他破坏性操作时，先说明证据、方案和影响，再向用户确认；不要猜测。
- **卡住时的三问（2026-08-14 #17 教训，高频强制）**：规则未闭合或排查卡住时，先问 ①知识库/文档/技能是否已有此规则（有→按规则实现）；②能否让用户做一个 10 秒编辑器最小差分学真实 wire（能→先差分，不要在代码里静态推断）；③现有状态能否做天然实验（注入版对比/编辑器保存版直接测试）。出问题先分层归因：用法层 / 设计层 / 实现层。
- **游戏拒载类错误排查纪律（2026-08-16 信号五连错实证，高频强制）**：①Beyond_Debug_Log 无新文件是正常（加载期错误不落执行日志）；②磁盘静态检查全过 ≠ 引擎认可，用“用户编辑器重建样本”逐字节对照；③“变更消失”先核对当前 hash 是否等于写回后 hash（编辑器旧内存保存覆盖假象）；④修复后必须用生产工具独立跑完整流程，不能靠用户手工中间产物掩盖下一个 bug。
- 修改前说明修改范围和验证方式；完成后如实报告已运行与未运行的命令及结果。

## 技能路由速查（按任务直接加载，不要凭记忆猜）

| 任务 | 技能 |
| --- | --- |
| 复杂静态模型/元件/实体/装饰物拼装 | `static-gil-model-builder` |
| 变量/挂载/UI/信号等 .gil 资源写回 | `genshin-ts-asset-operations` |
| 读/改节点图内部逻辑 | `gil-node-graph-reading` / `gil-node-graph-editing` |
| 调试节点图日志/负载 | `debug-log-investigator` |
| 写 DSL / 修编译生成图 | `dsl-nodegraph-development` |
| 游戏内最小注入核验 | `verify-injection` |
| 派独立模型/评估技能 | `isolated-model-evaluator` |
| 从零做一个完整 demo | `game-from-scratch` |
| 复盘/追溯历史会话 | `task-retrospective` / `dsh-session-history` |

## ID 与写回纪律（真实地图高频红线）

- 自定义元件/实体 ID 区间：`>= 1077936129`（`0x40400001`）；低于该区间的实体/元件会被游戏整体丢弃。
- **实体 GUID 由系统/编辑器动态分配**：CLI 新建实体应自动分配下一个空闲 ID，不硬编码；更新已有实体时可用显式 ID 定位。
- 写回真实地图前必须：只读盘点并锁定源 SHA → 生成 `--output` 候选并独立回读 → 展示安全门并取得确认 → `--write`（自动备份到 `.gsts/backups/`）→ 写后独立回读。
- 写回 `Save_Level` 后需同步编辑器 `Temp/`（部分命令自动同步；未同步时手动复制并在 gip 中登记，否则编辑器不显示）。
- 关卡实体（1094713345，defId=10003004）禁止手动 import；否则游戏“地图异常”。

## 代码与文件边界

- TypeScript 相对导入使用 `.js` 后缀；使用无分号、单引号和 100 字符宽格式。
- 不手改 `src/definitions/`（改来源后 `npm run gen`）和 `src/thirdparty/`（走 vendor 同步）。
- `create-genshin-ts/` 是独立 npm 包；其模板规则面向最终用户，不能与仓库维护规则混用。
- `docs/composite-ir/handover/` 仅历史背景；当前行为以源码、测试和真实 GIA 证据为准。
- `user_edit/` 只能读取用于解码分析，不可写入、修改或删除；`.gia` 输出写入 `~/genshin-ts/Beyond_Local_Export/`。
- `/mnt/` 是 Win11 数据盘，禁止无目的扫描或递归遍历；除非用户明确指定具体路径，否则不要访问其中的数据。
- 当前本机游戏目录：`/home/h/genshin-ts/Beyond_Local_Export/`（.gia）。
- `.gil` 实际目录：`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/`；编辑器活动目录为同级 `Temp/`。

## 安全与 Git

- 未经明确指示，不要执行 `git commit`，不要切换、合并、rebase 或 cherry-pick 分支。
- 不要擅自重置、还原、删除、清理文件，或覆盖无法解释的工作树变化。
- 注入、覆盖、删除游戏文件，或操作地图、玩家、`mapId`、`nodeGraphId` 前，必须先获得用户明确确认。
- 编码成功、自动测试通过、注入成功和游戏内验证是不同层级的证据，报告时必须分开说明。

## 验证与文档

- 优先运行针对性验证；TypeScript 生产代码改动通常还需运行 `npm run build`。`npm test`/`npm run quicktest` 必须显式保持 `--noinject`。
- CLI-only 改动（`src/cli/`、CLI 相关 `tests/`、`src/i18n/`）：验证只需 ①类型检查（`npm run build` 或 `npx tsc --noEmit`）②直接运行受影响测试（`npx tsx tests/<file>.ts`）③`git diff --check`；不需要全量管线。
- 用户说“去核验/游戏核验”时，加载 `verify-injection` 技能。
- 代码、测试、真实 GIA 结论或工作流变化时，更新对应权威文档；文档要区分当前实现、自动回归、真实 GIA、用户游戏验证、历史记录和待验证假设。
- 每轮结束前检查适用的 `AGENTS.md`、协作经验手册和权威文档是否仍与本轮证据一致；只把已证实、可复用且可行动的规则更新到适用范围最小的文件。
- 知识录入固定从项目根运行 `python tools/pkc.py`；`bundle-apply` 是提交单元，apply 后先受控提交再开始下一个 knowledge-plan（R3 三形态会拦截未提交 apply）。
- 用户要求“派独立/单独模型”跑任务或验证时，必须用 `isolated-model-evaluator` 技能；禁止裸跑 `pi -p`。
- 完成报告应包含“规则反馈检查”：是否发现不一致、证据、更新的最小规则文件，以及未推广的局部经验。
