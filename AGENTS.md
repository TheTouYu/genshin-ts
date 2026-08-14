# Genshin-TS Agent Instructions

## 项目愿景（2026-08-14 用户定义，详见 docs/project-vision.md）

本质：自进化能力锻炼——一边做 demo 一边扩充项目能力，教会大模型做游戏。
短期：demo + 生产能力缺陷/bug 修复 + 技能迭代 + 知识落盘；
中期：让大模型触及游戏行业（玩法→可玩 demo 完整闭环）；
长期：建立完整的资金化和学习机制。
每轮结束时按此愿景核对：是否有未落盘的发现/方法论/愿景相关内容。
工具调用规范与跨项目工作方法论见 docs/collaboration-handbook.md（高频错误复盘，必须遵守）。
## 回复与协作

- 默认使用中文回复，表达应通俗易懂；保留完成任务所需的技术细节，避免不必要的术语堆砌。
- 先读取目标目录最近的 `AGENTS.md`，再按任务读取匹配的 `.agents/skills/` 和相关文档。对于已知 CLI 能直接完成的实验初始化（例如创建一张新的空地图作为实体/元件调查基线），使用 `bootstrap-only` 短路：只读取根规则、目标命令帮助和必要配置，不加载 PKC、知识树、GIL 全量结构、Composite 导航或测试；基线创建并锁定后，用户做第一处变化时再进入增量调查流程。
- 控制上下文用量：读取大型文档、JSON、wire 树、日志或工具结果前，先用文件大小、行数、键摘要或限量查询估算输出；优先读取目标段落并让断言脚本只输出 PASS/FAIL 与关键摘要，禁止未评估规模就打印或加载完整大型结果。
- 复杂编译器诊断、历史约束、真实环境证据和破坏性地图操作，先通过 Project Adapter 选择 Context，再按关联 Nodes 执行 L1→L2；不得同时预加载传统文档体系。仅在查询返回 coverage gap 后，按 Adapter 指向读取最小 Authority fallback，并将经红绿验证且已有提交基线的稳定结论回填知识树或登记待录入。
- 新功能、疑难 bug 和真实 GIA/GIL 规则调查必须先复用知识树与当前 Authority；确有 coverage gap 时，采用“用户在编辑器做一个最小单变化 → 保存相邻只读快照和哈希 → 定点比较目标结构 → 手工同构重放 → 临时副本注入/回读 → 获确认后真实写回 → 用户游戏核验”的收敛流程。每轮只改变一个可唯一归因的变量；未知规则闭合前不得先改生产代码，不得用待修生产生成链证明规则，也不得混入 Composite、监听、打印等无关变量。
- 用户要求创建或修改静态 GIL 实体、空模型、元件、宿主或装饰物时，若知识树与当前生产工具已经覆盖该操作，Agent 必须直接进入 `map-writeback` 候选流程并自行完成，不得让用户在编辑器重复代劳；只有真实编码存在 coverage gap 时才请求最小编辑器变化。报告必须区分“候选就绪”“写回成功”“编辑器/游戏验证通过”，不能把前一层称为整个阶段完成。
- 用户要求用空模型、官方基础元件、装饰物或场景实体制作复杂静态模型（如足球、魔方、字母或建筑）时，必须加载 `.agents/skills/static-gil-model-builder/SKILL.md`；未知资源尺寸、零旋转朝向或局部轴先走最小校准，已知规则直接进入正式 CLI 候选流程。
- 遇到结构歧义、真实 GIA 结论、游戏状态、布局取舍、注入或其他破坏性操作时，先说明证据、方案和影响，再向用户确认；不要猜测。
- **卡住时的三问（2026-08-14 #17 教训，高频强制）**：规则未闭合或排查卡住时，先问 ①知识库/文档/技能是否已有此规则（有→按规则实现）；②能否让用户做一个 10 秒编辑器最小差分学真实 wire（能→先差分，不要在代码里静态推断）；③现有状态能否做天然实验（注入版对比/编辑器保存版直接测试）。出问题先分层归因：用法层（是否按生产语义编写）/设计层（DSL 语义是否正确）/实现层（生产是否符合学到的规则）。
- 确定涉及游戏引擎节点、API 或合法类型组合的工作包范围时，先查本地 docs-search；资料不足或需对齐编辑器公开支持范围时，再用项目级 `miliastra-knowledge` skill 查询官方节点规则。外部资料只用于缩小范围，仍须以当前源码、真实 GIA、自动回归和用户编辑器验证分层确认。
- 处理或修复复合节点、`.gia`、Composite/GIA Stage 3、复合参数/引脚、`compositePins`、impl GraphNode 或 capture 边界 bug 时，修改前必须阅读 `docs/architecture/composite/testing.md` 的“复合节点 Bug 的完整分析与修复流程”，并按其中的同构复现、节点族影响调查、主图对照、红灯回归、legacy/shared 路径验证和证据分层执行；GIA 编码细节同时阅读 `docs/architecture/composite/gia-encoding.md`。
- 修改前说明修改范围和验证方式；完成后如实报告已运行与未运行的命令及结果。

## 代码与文件边界

- TypeScript 相对导入使用 `.js` 后缀；使用无分号、单引号和 100 字符宽格式。
- 不手改 `src/definitions/`；更新定义应修改来源后运行 `npm run gen`。
- 不手改 `src/thirdparty/`；vendor 变更走独立的同步/维护流程。
- `create-genshin-ts/` 是独立 npm 包；其模板中的规则面向最终用户，不能与仓库维护规则混用。
- `docs/composite-ir/handover/` 仅作历史背景；当前行为以源码、测试和真实 GIA 证据为准。
- `user_edit/` 是参考样本目录，只能读取用于解码分析，不可写入、修改或删除任何文件。
  .gia 输出始终写入 `~/genshin-ts/Beyond_Local_Export/` 根目录（游戏加载目录），而不是 `user_edit/` 下；该目录允许写入，但不得覆盖无法解释的现有文件。
- `/mnt/` 是 Win11 数据盘，禁止无目的扫描或递归遍历（例如 `find /mnt`）；除非用户明确指定具体路径，否则不要访问其中的数据。
  当前本机游戏目录：`/home/h/genshin-ts/Beyond_Local_Export/`（.gia 加载目录）。
  .gil 地图实际目录：`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/`（CLI 读写），编辑器活动目录为同级 `Temp/`（列表 gip 与 .gil 双写，2026-08-09 实测；CLI 已自动同步 Temp）。

## 安全与 Git

- 未经明确指示，不要执行 `git commit`，不要切换、合并、rebase 或 cherry-pick 分支。
- 不要擅自重置、还原、删除、清理文件，或覆盖无法解释的工作树变化。
- 注入、覆盖、删除游戏文件，或操作地图、玩家、`mapId`、`nodeGraphId` 前，必须先获得用户明确确认。
- 编码成功、自动测试通过、注入成功和游戏内验证是不同层级的证据，报告时必须分开说明；涉及 Stage 3 生产编码行为变更时，完成前必须请求用户进行编辑器/游戏核验，除非工作包明确限定为仅自动观察/不可核验实验。

## 验证与文档

- 优先运行针对性验证；TypeScript 生产代码改动通常还需运行 `npm run build`。通用构建为 `npm run build`，完整测试为 `npm test`。`npm test` 和 `npm run quicktest` 必须显式保持 `--noinject`，不得依赖测试配置中的 inject 参数决定自动测试是否写入真实地图。
- 用户说“去核验/游戏核验”时，加载 `.agents/skills/verify-injection`（最小核验注入通道）：复用专用验证地图（当前 `1073741852`「InFlow核验」）、每分支一个 `verify-<点>` placeholder 图、`verify/<分支>/<分支>.ts` + `gsts.verify.config.ts` 编译注入；config 平时不配 inject（否则编译报 `target gil not found: 0.gil`），注入前临时加。
- CLI-only 改动（`src/cli/`、CLI 相关 `tests/`、`src/i18n/` 文案）：生产管线（compiler/runtime/injector）不引用 `src/cli`，验证只需 ①类型检查（`npm run build` 或 `npx tsc --noEmit`，tsx 运行测试不查类型，类型错误只有 tsc 能抓到）②直接运行受影响测试（`npx tsx tests/<file>.ts`）③`git diff --check`；不需要 `npm test`/`npm run quicktest` 全量管线（GIA 生成与 tests 批量编译与 CLI 无关且成本高）。
- 每次修改至少运行 `git diff --check`；未运行的验证必须明确标为“未运行”，不能臆测结果。
- 代码、测试、真实 GIA 结论或工作流变化时，更新对应的权威文档；文档要区分当前实现、自动回归、真实 GIA、用户游戏验证、历史记录和待验证假设。
- 每轮结束前，检查本轮源码、测试、真实 GIA、用户反馈或失败案例是否与适用的 `AGENTS.md` 不一致。
  规则过期、缺失或表述不清时，按证据更新适用范围最小的规则文件。
- 只有高频、可复用、可行动且已证实的经验才能进入 `AGENTS.md`；局部案例、临时路径和待验证推测应写入测试、状态、checkpoint 或权威技术文档。
- 知识录入固定从项目根运行 `python tools/pkc.py`；当天提交只纳入已提交基线，工作树变化保持受保护。一个 knowledge-plan 内串行完成 Claim、Authority Ref 和必要的 stale refresh，所有 mutation 完成后只做一次最终 delta check，再 finalize；必须展示并等待精确 Bundle content hash 确认后才能 approve/apply；`bundle-approve`/`bundle-apply` 默认 dry-run，必须显式加 `--apply` 才会落盘（2026-08-01 曾静默假成功，靠 claim_count 核验发现）。apply 后运行 `rebuild`、`validate`、`tree` 和 `git diff --check`。
- 用户要求“派独立/单独模型”跑任务或验证时，必须用 `isolated-model-evaluator` 技能（`evaluate.py --root <项目> --skill <显式技能路径> --task-file <任务> --output-dir <目录>`，只读任务带 `--assert-no-changes`，默认 deepseek-v4-flash max 或按用户指定）；禁止裸跑 `pi -p`（无 trace/成本记录）。执行类任务：子模型只产 /tmp 候选，主代理校验后写回真实地图。
- 完成报告应包含“规则反馈检查”：是否发现不一致、证据、更新的最小规则文件，以及未推广的局部经验。