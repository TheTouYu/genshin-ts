# 受知识技能治理的文档混合搜索工具实施计划

> 状态：当前推荐
> 来源：当前代码实现 + 知识技能设计
> 最近校验：2026-07-11
> 适用范围：Genshin-TS 仓库内文档检索；不替代知识技能、codebase-memory 或真实 GIA 工具
>
> 本文是实施计划，不代表功能已经实现。计划中的向量模型调用、索引质量和检索效果均须通过自动验证确认。

## 1. 背景与目标

当前项目通过两个知识技能维护和使用文档知识：

- `composite-docs-navigator`：按任务路由知识域，选择最小读取集，区分当前实现、真实 GIA、历史记录和待验证内容。
- `composite-docs-maintainer`：维护权威文档、知识域地图、证据标签、索引和文档覆盖率。

本计划采用方案 C：增加一个独立的 `docs-search` 工具，但将其定位为两个技能可以调用的**受治理局部语义检索层**，而不是新的知识系统。

### 目标

1. 支持对项目文档进行 BM25/关键词 + 向量的混合检索。
2. 支持按知识域、状态、来源、适用范围和文档集合过滤。
3. 返回可解释的文档片段，而不是只返回相似度和无来源文本。
4. 保留当前知识技能的路由、证据分层和历史文档边界。
5. 支持增量索引、删除检测和索引状态检查。
6. 支持通过 CLI 使用，并为未来被 agent/技能调用保留稳定 JSON 接口。
7. 使用用户提供的 embedding API，但不把 API key 写入仓库、计划、日志或索引文件。

### 非目标

第一期不做：

- 用 RAG 替代 `composite-docs-navigator`。
- 用 RAG 替代 `codebase-memory` 的源码结构、调用链和影响分析。
- 将全部源码、生成文件、第三方文件和 GIA 二进制放入同一个向量库。
- 自动把检索结果当作事实或自动修改文档。
- 自动执行注入、覆盖、删除、清理或游戏相关操作。
- 在没有评测证据的情况下自动接入默认 agent 上下文。

## 2. 总体架构

```text
用户问题
  │
  ▼
composite-docs-navigator
  ├─ 选择知识域
  ├─ 判断当前/真实 GIA/历史/待验证边界
  └─ 生成检索过滤条件
       │
       ▼
      docs-search
       ├─ lexical search：精确术语、函数名、路径、旧 API
       ├─ vector search：跨语言和语义关联
       ├─ metadata filter：domain/status/source/scope/collection
       ├─ rerank：权威性、证据等级、时效性和匹配度
       └─ evidence-aware result formatter
       │
       ├──────────────┐
       ▼              ▼
文档片段及证据标签       codebase-memory
                       源码定义、调用链、影响范围
       │              │
       └──────┬───────┘
              ▼
       agent 读取上下文并自行判断
              │
              ▼
composite-docs-maintainer
  ├─ 文档变更后更新/失效索引
  ├─ 维护知识域和权威入口
  └─ 审计覆盖率和 stale 路径
```

核心原则：**navigator 负责“查什么”，docs-search 负责“在指定范围内找哪一段”，maintainer 负责“索引是否仍可信”。**

## 3. 第一阶段索引范围

### 3.1 默认索引集合：`current`

首批覆盖范围扩大为仓库内所有受治理的 Markdown 文档，而不是只索引少量入口文档。默认扫描：

- `README*.md`
- `docs/**/*.md`
- `.agents/skills/**/*.md`
- `AGENTS.md`、`CLAUDE.md`、`REASONIX.md`

扫描器排除构建产物、缓存、`.git/`、`.pi-subagents/` 和其他明确排除路径。文档按路径和头部治理标签分配到 `current`、`verified-gia` 或 `historical` collection；不会因为扩大覆盖范围而取消状态、来源和证据过滤。

优先纳入当前权威和当前实现文档：

- `README.md`
- `README_ZH.md`
- `docs/README.md`
- `docs/documentation-governance.md`
- `docs/documentation-map.md`
- `docs/architecture/**/*.md`
- `docs/gia-tools-reference.md`
- `docs/composite-ir/index.md`
- `docs/composite-ir/analyze-workflow.md`
- `docs/composite-ir/01-ir-types.md`
- `docs/composite-ir/03-validation-basics.md`
- `docs/composite-ir/05-gia-encoding.md`
- `docs/composite-ir/06-advanced-patterns.md`
- `.agents/skills/composite-docs-navigator/references/**/*.md`
- `.agents/skills/composite-docs-maintainer/references/**/*.md`

实际文件存在性必须由索引器检查，不能假定文档地图中的路径一定存在。不存在的入口需要在索引报告中作为 warning 记录，不由索引器自动修复。

### 3.2 真实 GIA 集合：`verified-gia`

可单独纳入具有真实文件、命令和观察结果的文档，例如：

- `docs/composite-ir/` 中明确标注真实 GIA 证据的文档
- `docs/traces/`
- 与真实 GIA 工具工作流直接相关的当前分析文档

索引 metadata 必须保留 `evidenceLevel=真实 GIA 观察` 或 `待验证`，并显示适用样本/范围。不能因为文本位于 `composite-ir` 目录就自动标记为已验证。

### 3.3 历史集合：`historical`

- `docs/composite-ir/handover/**/*.md`
- 已标记为 `历史记录` 或 `部分过期` 的文档
- 其他经 maintainer 判定为历史背景的文档

默认检索不将该集合与 `current` 等权处理。只有查询明确涉及“历史方案、失败路径、handover、之前的决策”或当前文档不足时才提高其权重。

### 3.3.1 游戏引擎 API 用法集合：`engine-api-usage`

根据已确认的范围，新增一类面向实际开发任务的 API 用法知识：

- 事件入口和生命周期：实体创建/销毁、角色倒地/复活、传送完成、变量变化等。
- 三维向量：构造、加减乘除、Dot、Cross、Distance、Normalize、Magnitude、Lerp、ClampMagnitude。
- 实体：`player`、`self`、`stage`、`level`、事件实体、位置/朝向/阵营/状态和常用实体操作。
- 节点图变量和自定义变量：`variables`、`f.get`/`f.set`、`getNodeGraphVariable`、`getCustomVariable`、`asType`/`asDict`、live reference。
- 列表和字典：类型声明、索引、`idx`、遍历、读写、临时集合和变量集合的边界。
- 定时器：`setTimeout`、`setInterval`、捕获变量、timer pool 和节点图限制。
- 信号和事件编排：`.on`、`.onSignal`、信号参数、代码/编辑器配置边界。
- 控制流：条件、循环、函数、返回值、常见节点图写法和限制。
- 类型转换和日志：`bool`/`int`/`float`/`str`/`vec3`/`entity`、`print`、`console.log`、`f.printString`。
- 编辑器边界：API 是否需要元件、组件、路径、信号、资源或其他编辑器前置配置。

高频 API 用法需要保留任务导向示例、参数/返回值、常见误用、模式限制、相关源码/测试和证据等级。它不是简单的 API 名称列表。

### 3.3.2 引擎 API 签名集合：`engine-api-signatures`

同时新增轻量的完整签名集合：

- 所有 `f.*` 方法签名、参数和返回类型。
- 所有事件签名和事件回调参数。
- 实体辅助函数、枚举和相关值类型。
- 生成定义和资源定义中的符号位置。

签名集合主要用于精确 lexical 检索和后续跳转，不自动把没有示例的签名扩展成教程，也不替代生成文件的维护流程。`src/definitions/` 只读，修改仍必须通过 `resources/` 和 `npm run gen`。

### 3.4 第一阶段排除项

- `src/definitions/` 和 `src/thirdparty/`：生成/供应商数据，遵循现有维护流程。
- `dist/`、缓存、构建产物、`.git/`、`.pi-subagents/`。
- 原始 `.gia`、`.gil` 和其他二进制文件。
- 全部源码和测试源码：第一期只保存文档中的 source/test 关联，不把它们作为普通文档切片；源码关系继续交给 codebase-memory 和精确搜索。

后续若发现某一类源码注释或测试说明确实需要语义检索，应新增独立 collection 和评测，不直接扩大全库范围。

## 4. 文档 metadata 设计

索引器首先解析文档头部已有治理标签；缺失时根据路径和内容推断，但推断值必须标记为 `inferred=true`，不能伪装成文档明确声明。

建议的索引记录：

```json
{
  "documentId": "sha256:path",
  "path": "docs/composite-ir/05-gia-encoding.md",
  "collection": "verified-gia",
  "title": "...",
  "headingPath": ["...", "..."],
  "chunkIndex": 3,
  "contentHash": "sha256:...",
  "status": "已验证",
  "source": "真实 GIA 验证",
  "evidenceLevel": "真实 GIA 观察",
  "scope": "特定真实 GIA 样本",
  "language": "zh",
  "lastVerified": "2026-07-06",
  "inferredMetadata": false,
  "relatedSources": ["tools/decode-gia.ts"],
  "relatedTests": ["tests/composite/trace-dataflow.ts"]
}
```

### 4.1 状态值

至少支持项目治理中已有的：

- `当前推荐`
- `已验证`
- `当前实现`
- `历史记录`
- `部分过期`
- `待验证`
- `已废弃`

### 4.2 来源值

至少支持：

- `当前代码实现`
- `真实 GIA 验证`
- `历史记录`
- `推测`
- `当前代码实现 + 真实 GIA 验证`

### 4.3 证据边界

结果格式必须明确区分：

- 当前代码事实
- 真实 GIA 观察
- 自动回归
- 注入成功
- 游戏内验证
- 历史记录
- 待验证

检索器不能把 `状态=已验证` 自动解释成“游戏内验证”；证据标签只原样传递并用于排序。

## 5. 文档切片策略

### 5.1 切片原则

使用 Markdown 结构切片，而不是固定字符截断：

1. 以标题层级作为主要边界。
2. 保留从文档标题到当前段落的 heading path。
3. 代码块不可从中间切断。
4. 表格尽量作为整体保留；过长时按行分组并复制表头。
5. 每个 chunk 保留文档状态、来源、范围和路径前缀。
6. 相邻 chunk 允许小幅 overlap，但不得重复整篇 handover。

建议初始参数：

- 目标长度：约 500–900 中文字或 350–700 token。
- overlap：约 80–120 token。
- 单个代码块超过上限时按完整逻辑段切分，并标记 `containsCode=true`。
- 标题、路径、状态和来源作为检索文本前缀，正文作为主要 embedding 内容。

这些参数不是定论，必须通过评测调整。

### 5.2 特殊文档处理

- handover：保留轮次、目标、失败路径、下一步等标题信息，默认降权。
- 工具文档：保留命令、参数、输出和证据边界，命令中的精确字符串同时写入 lexical 字段。
- 证据文档：保留文件路径、命令、观察、结论、scope 五元信息。
- 文档地图：建立路径和知识域的 lexical 索引，作为路由辅助，不仅做向量化。

## 6. 向量模型和 API 配置

用户提供的 embedding 接口是 OpenAI-compatible 风格：

```text
POST https://api.vectorengine.ai/v1/embeddings
Content-Type: application/json
Authorization: Bearer $VECTORENGINE_API_KEY
```

第一期使用用户提供的模型标识：

```text
text-embedding-3-small:price
```

### 6.1 密钥安全要求

embedding API key 从项目根目录 `.env` 获取；`.env` 必须加入 `.gitignore`，并提供不含密钥的 `.env.example`。环境变量也可以覆盖 `.env` 中的值，但命令行参数和日志不得回显密钥。

用户在对话中提供的 API key 不得写入：

- 本计划文档
- `package.json`
- `.env` 被提交的文件
- 索引 JSON/SQLite/向量数据库
- 测试 fixture
- 命令历史示例
- 错误日志和 HTTP debug 日志

运行时默认加载项目根目录 `.env`，同时允许外部环境变量覆盖：

```dotenv
VECTORENGINE_API_KEY=
VECTORENGINE_BASE_URL=https://api.vectorengine.ai/v1
VECTORENGINE_EMBEDDING_MODEL=text-embedding-3-small:price
```

`.env` 只在本地存在，禁止提交。实现应支持注释、单引号/双引号值和空白，但不需要把完整 dotenv 语法扩展成新的依赖。

建议支持 `.env`，但必须把 `.env` 加入 `.gitignore` 并提供 `.env.example`，其中只保留空值和配置说明。若用户提供的密钥曾经在不可信环境中暴露，应建议用户在服务端轮换；实现本身不打印或回显该密钥。

### 6.2 API 客户端要求

封装一个独立 embedding client：

- 只接受环境变量或显式运行时配置。
- 设置连接、请求和总超时。
- 对 429、5xx 和网络错误进行有限次数指数退避。
- 对 4xx 配置错误立即失败并给出不含 secret 的诊断。
- 支持批量 input，但按服务限制分批。
- 校验响应中的 `data[].embedding` 数量和维度。
- 不记录请求正文中的文本全文到错误日志；必要时记录 `documentId/chunkId`。
- 支持 dry-run、缓存命中和断点续建。
- 使用按 `provider + model + inputHash` 定位的 embedding cache；同一内容在不同索引运行中不得重复请求。
- cache 记录模型、维度、创建时间和 input hash，不记录 API key。
- cache 命中、请求数、跳过数和失败数必须出现在索引报告中。
- 记录模型名、维度和索引版本，防止不同模型向量混用。

如果远程 API 不可用，索引命令必须失败并明确提示；不得静默生成没有向量的“伪索引”。词法搜索仍可独立工作。

## 7. 存储设计

第一期使用仓库内但明确被 gitignore 的本地目录，避免把向量数据提交到仓库：

```text
.gsts-doc-search/
├── manifest.json
├── chunks.jsonl
├── vectors.jsonl 或 vectors.bin
├── lexical-index.json
└── runs/
```

如果依赖规模允许，后续可改为 SQLite：

- `documents`
- `chunks`
- `embeddings`
- `terms`
- `index_runs`

第一期需要抽象 storage interface，使 CLI 不绑定具体数据库。

manifest 至少包含：

```json
{
  "schemaVersion": 1,
  "indexVersion": "...",
  "embeddingProvider": "vectorengine",
  "embeddingModel": "text-embedding-3-small:price",
  "embeddingDimensions": 1536,
  "sourceRevision": "git sha or working-tree marker",
  "createdAt": "...",
  "updatedAt": "...",
  "collections": ["current", "verified-gia", "historical"]
}
```

实际维度必须从 API 响应确认，不能仅凭模型名称猜测。向量文件应保持在 `.gitignore` 中，并在文档中说明如何重新生成。

## 8. CLI 设计

建议新增脚本或 CLI 子命令，具体入口在实现阶段根据现有 CLI 结构决定；不要在计划阶段假定 `src/cli/gsts.ts` 的现有命令解析可以无成本复用。

### 8.1 建议命令

```bash
npm run docs:index
npm run docs:index -- --collection current
npm run docs:index -- --incremental
npm run docs:index -- --dry-run
npm run docs:search -- "Composite 多 OutFlow 当前 API"
npm run docs:search -- "pin index" --domain gia --status verified --limit 8
npm run docs:search -- --json "IR 到 GIA 的编码位置"
npm run docs:index:status
npm run docs:index:clean
```

具体 npm script 名称可以在实现时调整，但应至少提供 index、search、status 三个稳定能力。

### 8.2 `docs:index`

功能：

1. 扫描允许的 collection。
2. 解析 Markdown、标题、治理标签和关联路径。
3. 生成稳定的 document/chunk ID。
4. 通过 content hash 识别新增、修改和删除文件。
5. 只为新增/修改 chunk 调用 embedding API。
6. 删除已不存在文件的 chunk 和向量。
7. 原子写入 manifest 和索引文件。
8. 输出统计：文件数、chunk 数、API 调用数、缓存命中数、warning 和失败项。

### 8.3 `docs:search`

输入：

- query
- `--domain`
- `--collection`
- `--status`
- `--source`
- `--evidence-level`
- `--scope`
- `--limit`
- `--json`
- `--include-history`
- `--min-score`

输出默认包含：

```text
rank / score
文件路径#标题路径
collection / domain
状态 / 来源 / 证据等级 / 适用范围 / 最近校验
相关片段
相关源码和测试入口（如果 metadata 中存在）
```

JSON 输出应稳定，便于技能或 agent 调用：

```json
{
  "query": "...",
  "indexVersion": "...",
  "results": [
    {
      "rank": 1,
      "score": 0.87,
      "path": "...",
      "headingPath": ["..."],
      "snippet": "...",
      "metadata": {
        "domain": "composite-api",
        "collection": "current",
        "status": "当前实现",
        "source": "当前代码实现",
        "evidenceLevel": "当前代码实现",
        "scope": "gsts 当前输出"
      }
    }
  ],
  "warnings": []
}
```

### 8.4 `docs:index:status`

检查：

- 索引目录是否存在。
- schemaVersion 是否兼容。
- 模型和维度是否一致。
- 源文件是否发生未索引变更。
- 是否存在孤立向量、缺少 metadata 或失效路径。
- 是否有未处理的文档地图路径 warning。

## 9. 检索和排序策略

第一期使用混合检索，不直接依赖向量相似度：

```text
finalScore =
  0.45 * semanticScore
+ 0.30 * lexicalScore
+ 0.15 * authorityScore
+ 0.10 * freshnessScore
```

权重作为初始值，必须由评测调整。

### 9.1 authorityScore 初始规则

- 当前推荐：1.00
- 已验证：0.95
- 当前实现：0.90
- 部分过期：0.55
- 历史记录：0.35
- 待验证：0.30
- 已废弃：0.10

真实 GIA 文档不因为“真实”而自动成为所有问题的最高权威；它需要结合 query 的领域和 scope。

### 9.2 默认过滤

默认优先：

1. `current` collection。
2. 当前推荐、已验证、当前实现。
3. 与 navigator 给出的知识域匹配的结果。
4. 与 query 中的路径、函数名、API 名称精确匹配的结果。

历史记录默认可以作为补充结果，但应在返回中单独标记，不得与当前结论合并成一句无来源答案。

### 9.3 精确检索保护

对以下 token 增强 lexical 权重：

- `f.xxx`
- `gsts.f.xxx`
- 函数名、类名、文件名
- `.gia`、`.gil`
- `nodeGraphId`、`mapId`
- pin、field、IR 类型名
- 文档路径和命令

这类 token 不能只依赖 embedding。

## 10. 与两个知识技能的集成边界

### 10.1 navigator 集成

第一期不强制修改技能文本中的行为。先让 CLI 可独立使用，并提供调用约定：

1. navigator 先选择 domain/route。
2. 根据 route 选择 collection 和 references。
3. 调用 `docs:search --json`，携带 domain、status、source 和 scope 过滤。
4. 读取返回的少量 top results。
5. 按 evidence-levels 规则汇报，不能把检索排序当作事实等级。

在评测证明结果稳定后，再小幅更新 `composite-docs-navigator`，加入“路由后局部 docs-search”的可选步骤。不要把全库搜索写成默认知识加载步骤。

### 10.2 maintainer 集成

后续可在 `composite-docs-maintainer` 中增加索引维护规则：

- 新建/移动/删除权威文档后运行 `docs:index --incremental`。
- 改变状态、来源、scope 或知识域后必须重新索引对应文档。
- 文档地图路径 warning 不能通过索引器隐藏。
- 维护报告中说明索引是否更新、是否使用远程 embedding。
- 索引失败不应阻断文档本身的维护，但必须显式记录。

这属于技能文档变更，必须在功能验证后单独审查，而不是第一步同时修改两个技能。

### 10.3 codebase-memory 集成

docs-search 返回的 `relatedSources`、`relatedTests` 只作为跳转提示。需要函数定义、调用方、调用链和影响分析时，继续调用 codebase-memory；不得用文档向量结果替代结构图查询。

## 11. 评测计划

在接入技能前建立至少 24 个真实开发查询，按领域分组：

- Composite/API：4
- 编译管线：4
- Runtime/IR：4
- GIA/Protobuf/真实证据：4
- CLI/地图/注入安全：3
- 测试/验证：3
- 文档治理/历史迁移：2

每个问题准备：

- expected authoritative documents
- acceptable supporting documents
- forbidden/stale documents
- 是否必须出现 evidence metadata
- 是否必须命中精确路径或函数名

比较三种检索方式：

1. 关键词检索。
2. 纯向量检索。
3. 混合检索。

指标：

- Recall@5
- MRR
- 权威文档命中率
- 历史误命中率
- 证据标签完整率
- 精确符号命中率
- 平均响应耗时
- 首次索引耗时和增量索引耗时
- API 失败后的可诊断性

建议的第一阶段接受标准：

- 关键问题 Recall@5 不低于纯关键词基线。
- 混合检索的权威文档命中率明显高于纯向量检索。
- 历史文档误作为当前结论的比例为 0。
- 结果 metadata 完整率为 100%。
- 精确函数名、路径、GIA 字段问题不能比关键词基线明显退化。
- 增量索引不会为内容未变化的 chunk 重复调用 embedding API。

## 12. 实施分阶段任务

### Phase 0：安全和边界确认

- [x] 检查当前工作树，确认不覆盖用户已有修改。
- [x] 确认 API key 不落盘、不出现在 diff 和日志中。
- [x] 添加 `.env.example` 并检查 `.gitignore`，`.env` 和 `.gsts-doc-search/` 不纳入 git。
- [x] 将首批范围扩大为所有受治理 Markdown，并保留 collection 分类和排除规则。
- [x] 设计持久化 embedding cache，按输入 hash 和模型隔离；已在 `src/docs_search/embedding.ts` 实现初版。
- [ ] 确认是否允许将首批文档正文发送到 VectorEngine；在确认前只运行抽取、词法索引和 mock API 测试。
- [ ] 检查 `docs/documentation-map.md` 中已知 stale 路径，登记 warning，不在本功能中擅自重构文档。

### Phase 1：建立文档抽取和 metadata 层

- [x] 确认新增 `engine-api-usage` 和 `engine-api-signatures` 两个 collection。
- [x] 建立初版引擎 API 来源抽取器：`src/docs_search/engine_api.ts`，包含用户文档、模板、测试和生成定义来源。
- [x] 将引擎 API 集合接入索引脚本；后续需把当前初版聚合切片细化为 API 用法卡片和稳定 metadata。

- [x] 创建 Markdown walker，应用 collection include/exclude 规则。
- [x] 首批实现覆盖仓库内所有受治理 Markdown 文档，而非仅入口文档。
- [x] 创建 Markdown metadata 提取和 heading-aware chunk 初版：`src/docs_search/markdown.ts`。
- [ ] 创建治理 metadata parser 和路径推断器。
- [ ] 创建 heading-aware chunker。
- [ ] 为 document/chunk 生成稳定 hash ID。
- [ ] 为缺失 metadata 生成 warning 和 `inferred` 标识。
- [ ] 编写 metadata/chunk 单元测试。

### Phase 2：建立 embedding client 和本地存储

- [x] 创建 VectorEngine/OpenAI-compatible embedding client。
- [x] 从项目根目录 `.env` 加载配置，外部环境变量优先：`src/docs_search/config.ts`。
- [x] 实现 embedding cache，按 provider/model/input hash 复用结果：`src/docs_search/embedding.ts`。
- [x] 添加本地索引目录和 env 示例；`.env` 和 `.gsts-doc-search/` 已加入 gitignore。
- [ ] 完成批量大小、重试、超时、维度校验和原子写入强化。
- [ ] 只从 `VECTORENGINE_API_KEY` 读取密钥。
- [ ] 实现 timeout、retry、429/5xx 处理和 response validation。
- [ ] 实现本地缓存和 manifest。
- [ ] 实现原子写入、断点恢复和模型/维度校验。
- [ ] 添加 secret redaction 测试。
- [ ] 使用一个小 fixture 验证远程请求格式；测试默认使用 mock，不访问真实 API。

### Phase 3：建立 lexical、vector 和 hybrid search

- [x] 实现简单 lexical search。
- [x] 实现 cosine similarity 和 embedding cache 读取。
- [ ] 实现完整 BM25、metadata filter 和 evidence-aware rerank。
- [ ] 实现 cosine similarity。
- [ ] 实现 metadata filter。
- [ ] 实现 authority/freshness/evidence-aware rerank。
- [ ] 对精确符号、路径、命令增加 lexical boost。
- [ ] 输出 human-readable 和 JSON 两种格式。
- [ ] 为历史文档提供显式降权和 `--include-history` 行为。

### Phase 4：提供 CLI

- [x] 实现初版 `docs:index`：`scripts/docs-index.ts`。
- [x] 实现初版 `docs:search`：`scripts/docs-search.ts`。
- [ ] 实现 `docs:index:status`。
- [ ] 增加 JSON 输出、metadata filters、错误码和 dry-run。
- [ ] 如有必要实现 `docs:index:clean`，只操作仓库内的索引目录且必须二次确认参数；默认不得删除源码或文档。
- [ ] 添加 package scripts 和 CLI help。
- [ ] 添加退出码、错误信息和 JSON schema 测试。

### Phase 5：建立评测集并调参

- [ ] 创建不含私密信息的 query/expected-results fixture。
- [ ] 跑 lexical、vector、hybrid 三组基线。
- [ ] 记录指标和错误样例。
- [ ] 调整 chunk 长度、overlap、权重和历史降权。
- [ ] 验证真实 GIA 文档的 scope 和证据标签不会丢失。
- [ ] 只有达到接受标准后才进入技能集成。

### Phase 6：技能的最小集成

- [ ] 在 navigator 的相关参考文档中增加可选的局部检索调用约定。
- [ ] 明确调用前必须先完成 domain route。
- [ ] 明确返回结果不能提升证据等级。
- [ ] 在 maintainer 的维护流程中增加索引更新和失败报告说明。
- [ ] 更新知识域地图，新增文档检索工具 domain/source/test/safety 边界。
- [ ] 运行文档治理检查和链接检查。

### Phase 7：发布前验证

- [ ] `git diff --check`
- [ ] `npm run build`
- [ ] 文档搜索单元测试和 CLI 集成测试。
- [ ] mock API 测试：成功、429、5xx、超时、错误响应、维度变化。
- [ ] 增量索引测试：新增、修改、删除、重命名。
- [ ] metadata/evidence 隔离测试。
- [ ] 确认没有 secret 出现在 git diff、tracked files、日志和索引。
- [ ] 记录 API 实际模型维度和索引版本。
- [ ] 评估是否需要用户确认后再启用真实 API 生成首个索引。

## 13. 测试矩阵

### 单元测试

- Markdown heading parser
- governance metadata parser
- collection classifier
- chunker 不切断代码块/表格
- stable hash
- BM25/lexical matching
- cosine similarity
- score normalization
- authority/freshness weighting
- metadata filter
- JSON output schema
- secret redaction

### 集成测试

- fixture 文档 → chunks → mock embeddings → index → search
- incremental indexing 不重复 embedding 未变更内容
- 删除文件清理孤立 chunk
- 模型/维度变化阻止混用
- API retry 和失败退出码
- historical 默认降权
- navigator domain filter 限制结果范围

### 人工评审

- 24 个真实开发问题的 top-5 结果
- 当前 API 与历史 API 冲突时的排序
- 真实 GIA 结论与当前代码实现同时命中时的标签清晰度
- map/injection 查询是否保留安全边界
- 查询结果是否足以让 agent 跳转到源码和测试

## 14. 风险和应对

| 风险 | 应对 |
|---|---|
| API key 泄露 | 只读环境变量；日志脱敏；索引不存 secret；提交前扫描 |
| 远程 embedding 服务不可用 | 有限重试；明确失败；保留独立 lexical search |
| 模型维度或模型版本变化 | manifest 锁定 provider/model/dimensions；变化时要求重建 |
| 历史文档污染答案 | collection 隔离、metadata 过滤、权威性降权、结果显式标记 |
| 文档治理标签缺失 | 推断值标记 `inferred`，输出 warning，不冒充事实 |
| 语义检索漏掉精确符号 | lexical search 和 token boost，不依赖向量 |
| 文档地图 stale 路径 | 索引报告 warning；由 maintainer 单独治理 |
| 索引数据过大或误提交 | 本地目录 gitignore；提供 manifest 和重建命令 |
| 文档频繁变化导致重复计费 | content hash、增量 embedding、缓存和 dry-run |
| RAG 结果被当成证据 | JSON 强制携带 evidence metadata；技能规范明确排序不等于证据等级 |
| 无意执行破坏性命令 | docs-search 只读；不接触注入和游戏文件操作 |
| 网络请求泄露内部文档 | 在实施前确认可接受的数据范围；支持只索引批准 collection；必要时后续增加本地 embedding provider |

## 15. 待确认事项

这些问题在开始实现前需要确认，不能自行猜测：

1. 是否允许将首批文档正文发送到 `api.vectorengine.ai` 进行 embedding；内部逆向文档和 GIA 分析是否全部允许，还是只允许 `current` collection。
2. `text-embedding-3-small:price` 的实际向量维度、批量限制、速率限制和服务保留策略。
3. 是否需要把 embedding 成本统计写入索引报告。
4. 运行环境是否允许增加 npm 依赖；若不允许，需要采用 Node 内置实现或已有依赖。
5. 索引目录是否放在仓库外，还是使用仓库内但 gitignore 的 `.gsts-doc-search/`。
6. 是否将文档搜索作为 npm CLI 入口，还是作为 `gsts` 子命令。
7. 完成评测前，是否允许修改两个技能文件以自动调用搜索工具。

## 16. 完成定义

只有同时满足以下条件，第一期才算完成：

- `docs:index` 可安全、增量、可重复地建立索引。
- `docs:search` 支持人类可读和稳定 JSON 输出。
- 结果包含路径、标题、片段、collection、状态、来源、证据等级、scope 和最近校验信息。
- 默认不会让历史文档覆盖当前权威文档。
- 精确函数名、路径、GIA 字段仍能被 lexical 检索命中。
- 向量 API key 未进入仓库、日志和索引。
- mock API、增量索引、错误处理和 metadata 隔离均有自动测试。
- 24 个查询评测达到接受标准，或明确记录未达到标准的原因。
- navigator 和 maintainer 的集成是可选、受路由约束的，不绕过现有证据和安全规则。
- 文档治理索引、知识域地图和相关入口已同步，且没有把本工具描述成事实来源。

## 17. 建议的首次执行顺序

1. 先确认“文档是否允许上传到 VectorEngine”这一数据边界。
2. 检查并轮换在不可信环境中暴露过的 API key；实现中只使用新的环境变量值。
3. 不调用真实 embedding API，先完成 Phase 1 的抽取、metadata 和 chunk fixture。
4. 用 mock 完成 storage、search 和 CLI。
5. 运行 24 个问题的 lexical 基线。
6. 得到用户确认后，再用环境变量配置真实 API，针对 `current` collection 进行一次小规模 dry-run/索引。
7. 检查结果和成本，再决定是否加入 `verified-gia` 与 `historical` collection。
8. 评测通过后，最后才修改两个知识技能的调用说明。

> 安全提醒：本计划不保存用户在消息中提供的 API key。实际执行时不要把 key 直接写进 shell 脚本、配置文件或命令示例；使用环境变量，并根据服务提供方建议轮换已经暴露的 key。
