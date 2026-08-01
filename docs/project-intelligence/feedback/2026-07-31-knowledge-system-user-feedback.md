# 知识库工具第一批用户反馈

> 状态：当前反馈 / 待治理
> 来源：第一批真实项目使用体验（模型协作反馈 + 用户目标）
> 最近校验：2026-07-31
> 适用范围：Genshin-TS 编译器项目、知识库项目和实际游戏项目的长期知识协作设计
>
> 本文是反馈源材料，不是当前源码契约、真实 GIA/GIL 证据或已批准 Domain Claim。稳定结论需要在提交后通过 PKC knowledge-plan、Authority Ref 和 Bundle 审核再固化。

## 1. 反馈范围

本轮实际使用了以下完整链路：

- 从 handoff 和项目规则恢复上下文；
- 通过 Project Adapter 和 `progressive-query` 选择知识范围；
- 对已提交编译器变更进行 bounded retrieval；
- 创建 Claim、Authority Ref 和不可变 Bundle；
- 处理 stale/invalidated Authority Ref；
- 用精确 content hash 完成 approve/apply；
- 运行 `rebuild`、`validate`、`tree` 和 retrieval evaluation；
- 将自动提取资源、测试结果、外部地图写入和游戏验证分开记录。

这是目前最有价值的反馈样本，因为它覆盖了从冷启动到知识应用、从错误恢复到工作区收尾的完整闭环。

## 2. 当前做得好的地方

### 2.1 证据层级清楚

当前体系明确区分：

- 当前源码实现；
- focused 自动回归；
- 本地 GIA 生成；
- 注入/写回成功；
- 编辑器导入；
- 用户游戏验证；
- 历史 handoff 和待验证假设。

这对编译器和游戏项目尤其重要。一次错误的注入不能被误报成游戏正确性；一次自动生成成功也不能替代编辑器验证。这个边界应继续保持，不能为了降低记录成本而合并证据层。

### 2.2 安全闸门有效

本轮中，`npm test` 的脚本已经显式带 `--noinject`，运行日志也明确输出跳过注入。知识 Bundle 必须经过 staged validation，并且必须确认完整 content hash 后才能 apply。这个设计实际阻止了两类高风险误操作：

- 测试配置中保留 inject 选项时，批量测试意外写入真实地图；
- 模型把“看起来合理”的知识草稿直接写入正式知识树。

安全边界不应隐藏在约定里，应该继续由 CLI 和 validator 强制执行。

### 2.3 Bundle 审计链可恢复

Bundle 的 `proposed → approved → applied` 状态、approval 文件、applied 文件和内容 hash 使知识变化可追踪。应用后重新 `rebuild`、`validate` 和 `tree`，能确认正式文本、注册表和投影没有脱节。

### 2.4 结构化恢复优于全量阅读

Context、minimum files、L1/L2、L3 的分层设计能限制冷启动读取量。它让模型先回答“应该看哪个领域”，再读取最小权威文件，而不是把整个文档库当作上下文。

## 3. 本轮实际遇到的摩擦

### 3.1 当前模型仍是单项目工作区，不是真正的多项目知识空间

用户的实际工作由三个项目组成：

1. 编译器项目；
2. 知识库项目；
3. 正在运行的游戏项目。

当前 `project-intelligence.json` 的 workspace 是单一的 `genshin-ts-feat-composite`，两个 Context 也都绑定到同一个仓库和分支。知识树可以记录编译器与游戏证据的边界，但还没有一等的“项目注册表、项目间关系和跨项目查询模型”。

结果是：

- 编译器源码、知识库文档、真实游戏文件的归属需要靠规则和模型记忆维持；
- 查询可以知道“不要碰地图”，但不能自然地回答“这个结论属于哪个项目、哪个项目可以验证它”；
- consumer/game 项目的固定快照、游戏反馈和编译器提交之间没有统一的 provenance 关系；
- 同一个术语在三个项目中的含义和权限边界不能由系统直接展示。

这是长期维护的首要架构缺口。

### 3.2 自然语言覆盖不足时，coverage gap 的下一步不够直接

本轮以“PKC 知识库工具用户反馈、长期维护、跨编译器知识库与游戏项目知识的组织和检索体验”查询时，系统返回了 `RETRIEVAL_CANDIDATE_UNKNOWN`，只给出低置信度候选。这个结果在安全上是正确的，但对用户来说还缺少一个顺畅的反馈闭环：

- 哪些词导致没有命中；
- 最接近的现有 Topic 是什么；
- 这是应该新增 Topic、增加 route keyword，还是仅保存为一次反馈；
- 如何把这次 coverage gap 自动变成待评估案例。

建议 coverage gap 输出同时生成一个小型“路由反馈草稿”，而不是只返回错误和候选。

### 3.3 stale Authority 处理正确，但人工成本偏高

本轮 Bundle finalize 时，full preflight 发现多个被提交变更影响的 stale/invalidated Authority Ref。逐个刷新是正确的安全行为，但人工需要从诊断中判断：

- 哪些 Ref 确实被本轮提交改变；
- 原 Claim 边界是否仍然成立；
- 哪些 stale Ref 与本次计划无关，不能刷新。

建议增加只读的“受影响 Authority Ref 报告”或可审查的 refresh plan，展示：

- changed path；
- affected Ref；
- old hash / new hash；
- 关联 Claim；
- 是否建议 refresh；
- 为什么不能自动 refresh。

可以自动计算候选，但仍应保留人工确认和同一个 knowledge-plan 的串行写入。

### 3.4 CLI 的首次错误提示不够面向用户

本轮 `add-claim` 曾遇到两个可避免的错误：

- 已存在 Node 时仍传入 Node 创建元数据，得到“node metadata is only valid when atomically creating a new node”；
- `--fact-class current_implementation` 不是当前 runtime 接受的值，直到查看现有数据才知道应使用 `runtime_behavior`、`cli_behavior` 等枚举。

工具是可恢复的，但命令帮助没有在用户第一次失败前说明：

- 已存在 Node 时哪些参数不能传；
- 当前允许的 fact class 列表；
- 如何从现有 Topic/Claim 继续；
- 错误是否已经产生了部分 mutation。

建议把这些检查前移到 `--help` 和 plan init 的 schema 说明中，并在错误消息中给出最短可执行修正命令。

### 3.5 “反馈”目前没有一等入口

当前系统擅长处理“已提交变更 → Claim → Authority → Bundle”，但用户反馈通常不是源码事实，可能是：

- 工具体验问题；
- 路由失败样本；
- 未来功能建议；
- 真实项目之间的关系说明；
- 尚未验证的产品判断。

这些内容现在只能放入普通 Markdown 或 handoff，之后再人工决定是否转成 Claim。建议增加受治理的 feedback intake：反馈先作为 source/evidence 保存，带有优先级、影响范围、复现步骤和“是否允许升级为 Claim”的字段，避免用户意见被误写成事实，也避免反馈消失在聊天记录里。

## 4. 对三个项目的长期知识结构建议

### 4.1 每个项目拥有自己的 Authority

建议将三个项目分别建模为独立 Project：

- `compiler`：源码、测试、编译产物和编译器提交；
- `knowledge`：PKC 配置、Knowledge、Memory、Bundle 和检索评估；
- `game`：真实地图/GIL/GIA、编辑器导入结果、游戏截图和用户确认。

每个 Project 保留自己的：

- `AGENTS.md` 或等价 operating contract；
- Context；
- Authority Ref；
- 验证命令；
- 权限边界；
- 当前恢复点。

知识库项目可以保存跨项目关系，但不应复制另一个项目的源码或游戏文件作为 Authority。

### 4.2 跨项目关系使用指针，不复制事实

建议建立显式关系类型：

- `produces`：编译器生成 GIA；
- `consumed_by`：游戏项目导入或使用 GIA；
- `verifies`：游戏反馈验证编译器候选；
- `documents`：知识库记录项目事实；
- `supersedes`：新提交或新候选替代旧结果。

查询结果应显示：项目、关系、证据等级、更新时间和权限。这样“编译器生成成功”和“游戏验证通过”可以链接，但不会被合并成一个 Claim。

### 4.3 查询先选项目，再选领域，再选证据等级

建议将恢复路由扩展为三步：

```text
Project → Context/Domain → Evidence level
```

例如：

- `compiler → compiler-diagnostics → current implementation + automatic regression`；
- `game → game-validation → user-confirmed in-game behavior`；
- `knowledge → retrieval-maintenance → route and Bundle lifecycle`。

跨项目查询必须显式声明，不能因为共享术语而静默合并。

## 5. 优先级建议

### P0：建立多项目注册和安全边界

为每个项目记录唯一 ID、根路径、项目类型、可读/可写能力、当前 Context、Authority 来源和危险操作。查询结果明确显示当前选中的项目，跨项目操作需要显式选择。

### P0：建立 Feedback Intake

提供一个简单入口，把反馈保存为 source-only 或 evidence：

- feedback ID；
- 提交者/角色；
- 日期；
- 相关项目；
- 观察、影响、复现步骤；
- 建议；
- 证据等级；
- 优先级；
- 是否允许转成 Claim；
- 当前处理状态。

默认不升级为正式 Claim，不修改 Authority。

### P1：把 coverage gap 变成可维护的路由回归

每次用户确认某个 coverage gap 是重要问题时，生成一个候选 evaluation case。后续可以选择：

- 增加 route keyword；
- 调整 Topic metadata；
- 新建 Topic；
- 明确标记为 out-of-scope。

目标不是让所有问题都命中，而是让每个重要 gap 都有处理状态。

### P1：提供 Authority 影响分析和 refresh plan

在 finalize 前给出受影响 Ref 的结构化清单，减少人工从长错误中筛选。刷新仍应是同一个 plan 的显式 mutation。

### P1：改善 CLI 教程和错误恢复

`init` 或 `--help` 应显示当前可用 fact class、已存在 Node/Topic 的参数规则和一条最短示例。错误信息应说明是否安全重试、是否已有 mutation。

### P2：改善 Bundle 审查界面

Bundle 审查除了 hash，还应显示：

- assertion 前后差异；
- 新增/修改/刷新 Claim 数量；
- 每条 Claim 的证据和边界；
- 预期变更文件；
- 是否涉及跨项目关系或权限变化。

hash 继续作为最终审批凭证，但用户不应只能凭 hash 猜内容。

## 6. 建议的验收指标

后续迭代可以用以下指标评估：

- 新用户能在一次查询内选对 Project/Context，或得到明确澄清；
- 重要 coverage gap 能在一次反馈录入后生成可追踪 evaluation case；
- stale Authority 的受影响候选不会被静默刷新；
- 首次 CLI 参数错误能给出可直接执行的修正提示；
- 跨项目查询不会静默把编译器、知识库和游戏证据混合；
- 任何真实游戏文件写入前仍需要独立、明确、目标具体的确认；
- Bundle 审查者能在不打开大段 JSON 的情况下理解语义差异；
- 项目维护者可以只更新一个项目的 Authority，而不重建或复制其他项目的知识。

## 7. 建议的下一步

1. 先实现 Feedback Intake 的 source-only 数据结构和 CLI，不改变现有 Claim/Authority 语义。
2. 用本文件和后续 3–5 条真实 feedback 作为固定评估样本，测试反馈去重、优先级和状态更新。
3. 再设计多项目注册表和跨项目指针，先支持只读查询，不开放跨项目写入。
4. 最后优化 coverage gap、Authority refresh plan 和 Bundle 审查摘要。

在上述结构稳定前，不建议直接新增第三个 Context，也不建议把所有游戏反馈复制进编译器项目的 Domain Knowledge。

## 8. 本轮尚未验证的内容

以下是建议，不是已验证事实：

- 多项目注册表的具体 schema；
- compiler/game/knowledge 三项目之间的关系类型是否足够；
- feedback 是否应进入同一个 PKC instance，还是由知识库项目维护一个 federation index；
- 跨项目查询的权限模型和缓存失效策略；
- coverage gap 自动生成 evaluation case 的最佳交互；
- Authority refresh plan 的自动推荐准确率。

这些内容需要通过独立原型、真实项目路径和新的 retrieval evaluation 验证，不能直接写入 `AGENTS.md` 或作为当前运行规则。
