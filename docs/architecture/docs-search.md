# 文档语义检索工具

> 状态：当前实现
> 来源：当前代码实现 + 自动回归
> 最近校验：2026-07-11
> 适用范围：Genshin-TS 仓库内开发文档、引擎 API 用法和 API 签名检索；不替代知识技能、codebase-memory 或真实 GIA 工具

## 目的

`docs-search` 是现有知识技能之下的文档检索层：

- `composite-docs-navigator` 负责先判断任务领域和证据边界。
- `docs-search` 负责在选定范围内查找相关文档片段、引擎 API 用法和 API 签名。
- `codebase-memory` 负责源码定义、调用链和影响分析。
- `composite-docs-maintainer` 负责文档变化后的索引维护和知识域治理。

检索排序不是证据等级。返回的 `status`、`source` 和 `scope` 必须原样保留并参与后续判断。

## 运行环境

embedding 配置从项目根目录 `.env` 读取，外部环境变量优先：

```dotenv
VECTORENGINE_API_KEY=
VECTORENGINE_BASE_URL=https://api.vectorengine.ai/v1
VECTORENGINE_EMBEDDING_MODEL=text-embedding-3-small
```

`.env` 和 `.gsts-doc-search/` 已被 git 忽略。不要把 API key 写入命令、文档、日志、测试或索引。

索引使用 VectorEngine OpenAI-compatible embeddings API。当前已验证模型为 `text-embedding-3-small`，输出维度为 1536；模型名包含 `:price` 的变体曾返回 HTTP 429/model_not_found，不要使用。

## 建立和查询索引

首次或文档大范围变化后建立索引：

```bash
npm run docs:index
```

索引器会扫描受治理 Markdown，并额外生成引擎 API 集合。embedding 按 `model + input sha256` 缓存到：

```text
.gsts-doc-search/embedding-cache.json
```

索引文件位于：

```text
.gsts-doc-search/index.json
```

普通查询：

```bash
npm run docs:search -- "实体创建时如何初始化节点图变量"
npm run docs:search -- "三维向量加法 Vector3 Add"
npm run docs:search -- "节点图变量变化事件"
```

只查引擎 API 用法卡片：

```bash
npm run docs:search -- "三维向量加法" --collection engine-api-usage
```

只查精确 API 签名：

```bash
npm run docs:search -- "节点图变量变化时" --collection engine-api-signatures
```

机器读取时使用 JSON：

```bash
npm --silent run docs:search -- "实体创建事件" --collection engine-api-usage --limit 5 --json
```

> `npm --silent` 很重要：普通 `npm run` 会先输出 npm script banner，不能直接把输出当作 JSON 解析。

支持的当前参数：

- `--collection current|verified-gia|historical|engine-api-usage|engine-api-signatures`
- `--include-history`：允许历史 handover 进入默认候选结果
- `--limit N`
- `--json`

当前 CLI 已实现 collection、历史开关、数量和 JSON 输出；不要在文档或技能中宣称尚未实现的 `--domain`、`--status`、`--source` 或 `--evidence-level` 参数。

## Collection 说明

### `current`

当前开发文档、项目入口、架构说明和技能 references。默认参与检索。

### `verified-gia`

Composite/GIA 分析和真实 GIA 相关文档。命中后仍需查看文件、命令、观察、结论和 scope；不能仅凭 collection 名称把所有内容升级为普遍事实。

### `historical`

handover、旧方案和部分过期内容。默认排除或降权；只有查询失败路径、历史决策或明确需要 handover 时使用 `--include-history`。

### `engine-api-usage`

面向实际开发任务的 API 用法，包括：

- 事件入口和生命周期，如实体创建、实体销毁、变量变化。
- 三维向量构造和 `Vector3.Add` 等运算。
- 实体、节点图变量、自定义变量、列表、字典。
- 定时器、信号、控制流、类型转换和日志。
- 编辑器前置配置和代码/编辑器边界。

此集合优先回答“应该怎么写”。优先检查该集合中的结果是否有完整示例和限制说明。

### `engine-api-signatures`

从 `resources/node_definitions.json` 和生成定义中抽取的 API/事件签名。此集合优先回答：

- 方法或事件是否存在；
- 参数和返回类型是什么；
- 中文/英文名称是什么；
- 定义来源在哪里。

签名结果不是完整教程；需要用法时继续检索 `engine-api-usage` 和当前用户文档。

## 给大模型的标准工作流

### 普通引擎 API 问题

1. 先将问题归类为 User DSL / engine API / compiler / runtime / GIA 等领域。
2. 如果是引擎 API，先查询用法集合：

   ```bash
   npm --silent run docs:search -- "<用户问题>" --collection engine-api-usage --limit 5 --json
   ```

3. 需要核对方法名、参数或事件字段时，再查询：

   ```bash
   npm --silent run docs:search -- "<API 名称或事件名>" --collection engine-api-signatures --limit 5 --json
   ```

4. 读取结果中的路径、标题、片段、状态、来源、scope 和相关测试。
5. 对 `当前代码实现`、`自动回归`、`真实 GIA 观察`、`历史记录` 和 `待验证` 分开表述。
6. 涉及源码调用关系时，再用 codebase-memory 或精确搜索核对，不要用文档检索代替代码图谱。

### Composite/GIA 问题

1. 仍然先执行 `composite-docs-navigator` 的 route 和证据判断。
2. 对 API 写法可查询 `engine-api-usage`，但 Composite/GIA 结论仍以当前权威文档、真实文件证据和专用工具为准。
3. 涉及 `.gia`、`.gil`、map、注入或游戏状态时，继续遵守 navigator 的确认边界；`docs-search` 是只读检索，不授权注入或文件操作。
4. 历史 handover 只有在当前文档不足或问题明确要求历史背景时，通过 `--include-history` 查找。

### 文档维护问题

1. `composite-docs-maintainer` 先确定权威文档和知识域。
2. 文档变更后运行 `npm run docs:index`，确保变化进入 embedding cache/index。
3. 检查索引结果中的 status/source/scope 是否仍与文档治理标签一致。
4. 不把索引生成文件提交到 git；只提交源码、文档和 `.env.example`。

## 证据和安全边界

- 检索排名不证明结论正确。
- `engine-api-signatures` 表示定义/生成数据来源，不等于游戏内行为验证。
- 测试来源只能说明自动回归；不能写成游戏内验证。
- `verified-gia` 结果必须保留样本范围；一个 GIA 样本不自动代表所有图。
- `historical` 结果不能覆盖当前 API 或当前实现。
- docs-search 只读，不执行注入、重注入、覆盖、删除或清理游戏文件。
- 不要输出 API key、`.env` 内容或 embedding cache 内容。

## 当前实现依据和验证

实现入口：

- `scripts/docs-index.ts`：扫描、切片、embedding 和索引写入。
- `scripts/docs-search.ts`：查询、collection 过滤、混合排序和 JSON 输出。
- `src/docs_search/config.ts`：`.env` 配置加载。
- `src/docs_search/embedding.ts`：VectorEngine 请求和 embedding cache。
- `src/docs_search/markdown.ts`：Markdown metadata 和切片。
- `src/docs_search/engine_api.ts`：引擎 API 用法卡片和签名抽取。

最近自动验证：

```text
npm run build：通过
npm run docs:index：234 个文档、4019 个 chunk，text-embedding-3-small、1536 维
实体创建/三维向量/节点图变量变化查询：已执行
DEP0205 warning：已通过 NODE_OPTIONS=--disable-warning=DEP0205 移除
```

当前未声称：游戏内验证、所有 API 用法完整、所有生成签名都具备教程级说明。
