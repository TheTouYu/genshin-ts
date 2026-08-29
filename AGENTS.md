# Genshin-TS Agent Instructions

> 本文件与根 `CLAUDE.md` 每次会话都会注入模型上下文，务必精简。本文件只放**行为纪律**：
> 仓库架构/命令/代码边界见 `CLAUDE.md`；领域细节按下方路由加载技能本体，不要在此展开。

## 项目愿景（2026-08-14 用户定义，详见 docs/project-vision.md）

本质：自进化能力锻炼——一边做 demo 一边扩充项目能力，教会大模型做游戏。
短期：demo + 生产能力缺陷/bug 修复 + 技能迭代 + 知识落盘；中期：玩法→可玩 demo 完整闭环；
长期：建立资金化和学习机制。每轮结束时核对：是否有未落盘的发现/方法论/愿景相关内容。

## 回复与协作（原则；具体做法走技能）

- 默认中文回复，通俗易懂；保留完成任务所需的技术细节，避免术语堆砌。
- **技能驱动（核心工作方式）**：具体任务先按下方路由加载对应技能、按技能流程执行；技能已覆盖的规则不凭记忆猜、不绕开技能另搞一套。
- **铁证原则（2026-08-20 用户明确要求）**：排查游戏行为/节点图问题必须以真实日志帧值和读回的真实 GIL 为唯一铁证，不要只凭源码推断"应该怎样"（代码转图可能有偏差，日志不会造假）。游戏拒载类错误排查（无新日志文件≠无错误等）按 `debug-log-investigator` 技能执行。
- **读图核验红线（2026-08-20 强制）**：改 DSL/编译/注入后必须先加载 `gil-node-graph-reading` 回读真实 `.gil`，核对执行流/数据流与源码意图一致（重复入边/死循环/断链/变量名 pin 缺失），通过后才允许报告"已修复/待测试"。编译通过 ≠ 注入正确 ≠ 游戏行为正确。
- **卡住三问（2026-08-14 #17）**：①知识库/文档/技能是否已有规则（有→按规则实现）；②能否让用户做 10 秒编辑器最小差分学真实 wire（能→先差分，不要静态推断）；③现有状态能否做天然实验。先分层归因：用法层 / 设计层 / 实现层。
- **确认制与如实报告**：破坏性操作（结构歧义、真实 GIA 结论、游戏状态、布局取舍、注入等）先说明证据、方案和影响，取得确认再动手；修改前说明范围与验证方式，完成后如实报告已运行与未运行的命令及结果。

## 自进化与反思（每轮闭环）

项目是长期自进化项目：每轮任务都应是"做 demo/修 bug → 复盘反思 → 知识落盘 → 技能迭代"的闭环，不只交付结果。

**任务迭代节奏（自主闭环，无需用户逐点提醒，2026-08-22 用户要求固化）**——每轮按固定节奏自主推进：
1. **探索 + 精准加载技能**：接任务先查下方路由表，只加载最小必要技能，不凭记忆猜、不绕开技能另搞一套。
2. **执行中主动优化资源**：发现可复用的脚本/技能/文档/规则时，执行中顺手优化（不拖到任务结束才复盘）。
3. **完成小点主动提交**：一个独立小点（一个文档/一个技能改动/一个脚本/一条知识）完成后主动 `git commit`，commit message 写清范围、只提交本次相关文件（见「安全与 Git」自主提交范围）；破坏性操作仍需确认。
4. **完成小任务主动复盘沉淀**：一个可归因小任务闭环后，主动用 `task-retrospective` 复盘，防经验流失。
5. **迭代一轮写入知识树**：可复用规则主动录入 PKC（`pkc-project-operator`），不只写文档。

- **复盘**：一波任务闭环后，用 `task-retrospective` 系统复盘（历史检索 → 错误谱系 → 复盘文档 → 迭代），防止经验流失。
- **知识落盘**：可复用的引擎规则/方法论落盘到 `docs/game-engine-knowledge/` 与 PKC 知识树（`pkc-project-operator`）；只写已证实、可复用、可行动的规则，更新到适用范围最小的文件。
- **技能迭代**：复盘沉淀的流程/经验用 `skill-creator` 回灌到对应技能，让下次同类任务自动按新流程执行。
- **配合用户**：用户是最终裁决者——方案先确认、写回先展示安全门、游戏核验由用户在游戏内执行；每轮结束报告"规则反馈检查"（是否发现不一致、证据、更新的最小规则文件、未推广的局部经验）。

## 信息检索优先级（缺关键信息/上下文/历史记忆时，2026-08-22 强制）

**高频触发——节点预算/帧数超限（先查规则再动刀，2026-08-23 复盘补；2026-08-27 用户更正红线）**：遇到「节点数 >3000 拒载 / 单记录帧 >3000 截断 / 图预算超限/超标」类问题，第一步**不要直接拆图、注入测量或读预算源码**，先 `pkc query "预算 3000 有限循环 截断 拒载" --level 2` 读硬限与公式口径（如 clm_213B9BC24），再 `dsh-session-history` 找该地图的历史定稿预算公式；本地测量是第二步的取证动作，不是第一反应（Sa296f579 08-22 白耗约 40 分钟的教训）。**生产红线 = 单图 gameNodeCount ≤2000（用户 2026-08-27 明确：不是 3000；3000 只是引擎拒载阈值）**——超 2000 直接按职责拆新图，不要硬塞。

**负载设计铁律（2026-08-24 用户定义）**：按「事件驱动 → 低频定时器（0.7~1s 级）→ 高频轮询」顺序选择；**0.06s/触发的频率本身即高负载，禁止长期运行**。定时器必须有停止条件；单 tick 内要把重计算拆成小复合/小步，禁止把多个有限循环叠在一条链上。写图前先算两笔账：`assets:node-graphs nodes` 节点预算 + 单 tick 帧数预算（<3000 帧/记录）。

1. **先查知识树 PKC**（只读，无需确认）：`python tools/pkc.py progressive-query --context <ctx> --intent "<问题>" --max-level 2 --limit 3`（有明确 context 时）或 `python tools/pkc.py query "<关键词1 关键词2 关键词3>" --level 2`（全库 claim 检索；**必须带 `--level 2`——默认 level 1 只搜 13 个节点标题，不搜 300+ 条 claim 内容，2026-08-22 实测「负载」默认 0 命中、level 2 命中**；并 3~5 个不同层面关键词召回更高）。context 清单见 `project-intelligence.json` 的 `memory.contexts`（compiler-diagnostics / static-gil-assembly-production / official-guide）。
2. `progressive-query` 报 coverage gap（中文长句常见，2026-08-22 实测）→ **立即降级全库 `query "<关键词…>" --level 2`（并 3~5 个不同层面关键词，中英混排，如 `"physical pin compositePins 缺失"`）**；仍空再换词：短词→同义词→英文/官方术语→`--status any`→`knowledge-search --semantic "<完整问题>"`（向量化语义检索，hybrid 模式，中文长句意图用它命中率更高）；**bounded miss ≠ 仓库级缺失**。
3. 仍未命中 → 才允许 `dsh-session-history`（历史会话）/ `codebase-memory`（代码结构）/ 项目搜索兜底；缺口记入知识树 pending-capture（`pkc-project-operator`）。

## 技能路由速查（按任务直接加载，不要凭记忆猜）

| 任务 | 技能 |
| --- | --- |
| 从零做一个完整 demo / 游戏全流程 | `game-from-scratch` |
| 复杂静态模型/元件/实体/装饰物拼装 | `static-gil-model-builder` |
| 变量/挂载/UI/信号等 .gil 资源写回 | `genshin-ts-asset-operations` |
| 读/改节点图内部逻辑 | `gil-node-graph-reading` / `gil-node-graph-editing` |
| 复用现成复合节点/查通用资源包（写 DSL 前先查） | `docs/composite-library/README.md`（19 类通用复合：变量运算/随机/定时器/实体查询销毁/矩阵/数学几何/长列表/输入锁/定时器调度/循环物化等，有现成的直接抄或套模式） |
| 调试节点图日志/负载 | `debug-log-investigator` |
| 写 DSL / 修编译生成图 | `dsl-nodegraph-development` |
| 编辑器规则探索（最小差分实验） | `editor-incremental-gia-investigator` |
| 游戏内最小注入核验 | `verify-injection` |
| 创建技能配置/客户端图资产（36/6/28 模板×普通/瞬发+绑定，含中文类型名） | `genshin-ts-asset-operations`（`assets:skill-config create\|list` / `assets:node-graphs create --type`；28 模板固定模型遗迹守卫） |
| Composite/GIA 文档导航与维护 | `composite-docs-navigator` / `composite-docs-maintainer`（**知识文档，直接 read 引用**，不在技能加载列表，勿用 skill 工具加载） |
| 千星知识库/节点用法查询 | `miliastra-knowledge` |
| 代码结构/调用关系/影响面分析 | `codebase-memory` |
| 项目记忆/领域知识路由（诊断、写回、验证） | `genshin-ts-project-adapter` |
| 知识树/PKC 查询与录入维护（缺信息先查） | `pkc-project-operator`（全局技能） |
| 图片素材生成（SVG/CSS） | `image-svg-builder` / `image-css-builder` |
| 派独立模型/评估技能 | `isolated-model-evaluator`（全局技能） |
| 会话开始上下文恢复/任务调度/收尾/分流 | `task-command-center`（全局技能） |
| 生成任务启动提示词/任务书（开启新任务/新会话/委派子代理/持久目标） | `task-prompt-builder` |
| 建/改技能 | `skill-creator` |
| 复盘/追溯历史会话 | `task-retrospective` / `dsh-session-history` |

## 写回真实地图红线（高频违规点）

- 自定义元件/实体 ID 区间 `>= 1077936129`（`0x40400001`）；**实体 GUID 由系统/编辑器动态分配，不硬编码**。
- 写回 `.gil`/`Save_Level` 前必须加载 `genshin-ts-asset-operations` / `static-gil-model-builder` 技能，按其安全写回流程执行（SHA 锁定 → 候选回读 → 安全门 → 写回 → 回读 → Temp 同步），不凭记忆绕过。

## 安全与 Git

- **自主提交范围（2026-08-22 用户授权固化）**：普通代码/文档/技能/知识库/样例（examples）的小改动，完成一个独立小点即可主动 `git commit`——commit message 写清范围，**只精确暂存本次相关文件**，不扫进无关的遗留改动（提交前 `git status --short` 核对）。
- **仍需用户明确确认**：切换/合并/rebase/cherry-pick 分支；重置/还原/删除/清理文件；覆盖无法解释的工作树变化；以及下方游戏文件破坏性操作。
- 注入、覆盖、删除游戏文件，或操作地图、玩家、`mapId`、`nodeGraphId` 前，必须先获得用户明确确认。
- 编码成功、自动测试通过、注入成功和游戏内验证是不同层级的证据，报告时必须分开说明。

## 验证与知识落盘

- 优先针对性验证：TypeScript 生产代码改动通常还需 `npm run build`；`npm test`/`quicktest` 必须保持 `--noinject`；验证命令与产物约定见根 `CLAUDE.md`。
- 游戏核验 → 加载 `verify-injection`；派独立/单独模型 → 必须用 `isolated-model-evaluator` 技能，禁止绕过技能裸跑 `pi -p`；知识录入/PKC → 按 `pkc-project-operator` 技能执行。
- 权威文档更新原则：区分当前实现 / 自动回归 / 真实 GIA / 用户游戏验证 / 历史记录；知识落盘与每轮复盘闭环见"自进化与反思"节。
