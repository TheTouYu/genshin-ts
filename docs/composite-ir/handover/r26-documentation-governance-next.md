# Session 交接：下一轮文档治理与知识体系重整

> **当前分支：** `feat/fork-api-and-layout`
> **最新功能提交：** `c48c195 feat(composite): add raw control-flow DSL`
> **下一轮目标：** 停止新增功能和测试扩展，集中整理、校正、精简当前积累的文档知识体系。
>
> 这不是普通补文档，而是一次知识库治理工程。目标是让后续开发者和大模型能快速找到当前可信结论，区分真实 GIA 逆向结论、代码实现结论、历史推测和已过期 API。

---

## 一、当前状态

### 1.1 已完成的近期工作

上一轮已完成并提交：

```bash
c48c195 feat(composite): add raw control-flow DSL
```

主要内容：

- 新增 raw control-flow DSL：
  - `f.entry()`
  - `f.node()` / `f.rawExecNode()`
  - `f.link(source, outIdx, target, inIdx?)`
  - `f.inflow()`
  - 多 InFlow composite 定义与 pinIndex 支持
- `tests/composite/recreate-debug5.ts` 从手写 IR 改为 DSL。
- `tests/composite/recreate-debug6.ts` 从手写 IR / CompositeDefIR 改为 DSL。
- `tests/composite/trace-exec-flow.ts` 新增 `--io` 模式，可直接查看控制流输入/输出。
- 新增文档：
  - `docs/architecture/composite/raw-control-flow-dsl-quickstart.md`
  - `docs/composite-ir/handover/README.md`
- 更新旧文档入口，防止旧 API 污染：
  - `docs/README.md`
  - `docs/composite-ir/index.md`
  - `docs/architecture/composite/dsl-api.md`
  - `docs/architecture/composite/control-flow-api-cookbook.md`

### 1.2 验证状态

提交前已跑：

```bash
npm run build
npx tsx tests/composite/recreate-debug5.ts
npx tsx tests/composite/recreate-debug6.ts
git diff --check --cached
```

用户已反馈：

> 新版 DSL 生成的 `recreate_debug5.gia` / `recreate_debug6.gia` 已进游戏实际测试，通过。

### 1.3 当前未跟踪文件

提交后仍有未跟踪文件：

```text
.pi-subagents/
docs/composite-ir/handover/r23-outflow-api-done-debug56-next.md
docs/composite-ir/handover/r24-debug56-recreate-draft-review.md
docs/composite-ir/handover/r25-debug56-structural-recreate-dsl-api-next.md
docs/composite-ir/handover/r26-documentation-governance-next.md  # 本文档，待提交
```

说明：

- `.pi-subagents/` 是 subagent 运行产物，不要提交。
- r23/r24/r25 是前序 handover 草稿，是否提交由下一轮决定。
- 本文档用于下一轮交接，建议下一轮开始时先提交或纳入文档治理批次。

---

## 二、下一轮任务性质

用户明确要求：

> 下一轮我们的任务不是测试，也不是做新功能。而且停下来，整理和更新目前积累的知识体系。为了最大化发挥积累的知识，是时候做文档的清理工作了。

因此下一轮不要优先写新 DSL、修编译器、扩测试。除非文档清理过程中发现阻碍理解的极小工具修复，否则应保持代码冻结。

下一轮核心任务：

1. 按知识来源重整文档体系。
2. 用真实 GIA 文件和当前代码实现分别校正文档。
3. 精简大量重复文档。
4. 设计新的文档目录结构，可以更深、更细，方便后续开发快速定位信息。
5. 强制利用 subagent 并行探索，避免单个大模型上下文耗尽后产生偏移。

---

## 三、用户新增的三条核心要求

### 3.1 来源一：真实 GIA 文件分析得出的结论

这一类文档来自真实 `.gia` 文件逆向。

用户补充：

> 我们现在有了更好用的 trace-xxx 工具，可以快速查看拓扑结构和数据流；不确定的地方，还可以继续深入分析解析的全量 JSON 表示。所以我的想法是，基于真实的 GIA 文件，去更正历史文档目录。

真实 GIA 来源目录：

```text
游戏根目录下的 user_edit/布局/复杂gia 目录
```

在 WSL 项目内常见路径/引用包括：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/布局/
复杂gia/   # 项目内 symlink，指向 Windows 侧复杂 GIA 样本
```

下一轮需要先确认实际路径是否存在，再按真实文件建立索引。

推荐工具：

```bash
# 控制流拓扑，人类可读
npx tsx tests/composite/trace-exec-flow.ts <file.gia>

# 控制流输入/输出汇总，人类可读，适合快速比对
npx tsx tests/composite/trace-exec-flow.ts <file.gia> --io

# 控制流 JSON，适合只看差异点
npx tsx tests/composite/trace-exec-flow.ts <file.gia> --json --io --depth=1

# 数据流追踪
npx tsx tests/composite/trace-dataflow.ts <file.gia>

# 全量 JSON 解码，适合深入确认不确定字段
npx tsx tools/decode-gia.ts <file.gia> > /tmp/file.json

# 复合结构分析
npx tsx tools/analyze-composite-gia.ts <file1.gia> [file2.gia ...]
```

下一轮原则：

- 真实 GIA 结论必须能回指到具体文件、工具命令和观察结果。
- 如果只是推测，必须标 `待验证`。
- 如果历史文档和 trace / decode 结果冲突，以当前工具重新分析出的真实 GIA 结果为准。
- 不要把 gsts 当前实现误写成游戏编辑器真实行为。

### 3.2 来源二：根据当前代码分析得出的文档

这一类文档来自代码实现。

用户补充：

> 这个部分，应该我们现在这个版本和之前有了不少差异了，而且目前测试看还算可以，所以需要根据实际的代码情况来增加/修改/标记文档的差异。

当前代码和旧文档已有明显差异，例如：

- `f.entry()` 已是推荐入口，旧名 `f.eventMarker()` 仍可用。
- `f.link()` 已是推荐连线 API，旧名 `f.linkTo()` 仍可用。
- `f.node()` / `f.rawExecNode()` 创建 detached raw exec node，不同于 `f.registerExecNode()` 的自动串联语义。
- `f.inflow()` 支持多 InFlow composite。
- `f.outflow()` 是推荐的命名出口 API，`f.leaf()` 只是 deprecated 兼容。
- `trace-exec-flow.ts --io` 已成为拓扑比对的重要工具。

下一轮需要按当前代码重新校正：

```text
src/runtime/core.ts
src/runtime/composite_registry.ts
src/runtime/IR.d.ts
src/definitions/nodes.ts
src/compiler/ir_to_gia_transform/index.ts
src/compiler/ir_to_gia_transform/composite.ts
tests/composite/recreate-debug5.ts
tests/composite/recreate-debug6.ts
tests/composite/trace-exec-flow.ts
tests/composite/trace-dataflow.ts
```

代码来源文档必须明确：

- 这是 gsts 当前实现。
- 是否已经通过测试。
- 是否已游戏内验证。
- 与真实编辑器 GIA 是否一致，若不一致，差异是什么。

### 3.3 第三点：重复文档精简与新目录设计

用户补充：

> 大量重复的文档，可以考虑精简。最好是设计新的文档目录，文档目录可以深一点，分类更加细致，帮助之后开发的时候，快速找到想要的数据。

下一轮应允许设计新的文档目录，而不是只在旧目录里补丁式加 banner。

目标不是减少文件数本身，而是减少重复知识和互相冲突的入口。

建议将文档按“使用目的 + 来源类型 + 可信状态”重新组织。

---

## 四、建议的新文档目录设计

下一轮可以先提出目录设计，再逐步迁移。不要一口气搬完所有文件。

建议结构：

```text
docs/
├── README.md                         # 全局入口：告诉读者从哪里开始
├── documentation-governance.md        # 文档治理规则：状态标签、来源规则、更新规则
├── documentation-map.md               # 文档地图：按任务找文档
│
├── current/                           # 当前推荐知识，面向开发者和用户
│   ├── dsl/
│   │   ├── raw-control-flow.md         # 可从现有 quickstart 迁移/链接
│   │   ├── composite-api.md            # defineComposite/callComposite 当前用法
│   │   └── migration-old-control-flow-api.md
│   ├── tools/
│   │   ├── trace-exec-flow.md          # --io / --json / --expand 用法
│   │   ├── trace-dataflow.md
│   │   └── decode-and-analyze.md
│   └── compiler/
│       ├── pipeline.md
│       ├── runtime-capture.md
│       └── ir-to-gia.md
│
├── verified-gia/                       # 来自真实 GIA 的逆向结论
│   ├── index.md
│   ├── source-files.md                 # user_edit / 布局 / 复杂gia 文件索引
│   ├── control-flow-patterns.md
│   ├── dataflow-patterns.md
│   ├── composite-def-patterns.md
│   └── case-studies/
│       ├── debug5-debug6.md
│       ├── layout-samples.md
│       └── complex-gia-samples.md
│
├── implementation/                     # 来自代码分析的当前实现说明
│   ├── index.md
│   ├── runtime-core.md
│   ├── composite-registry.md
│   ├── ir-types.md
│   ├── stage3-gia-encoding.md
│   └── known-differences-from-editor.md
│
├── archive/                            # 历史文档归档入口，不作为当前 API 教程
│   ├── handover/
│   ├── old-designs/
│   └── deprecated-guides/
│
└── composite-ir/                       # 可保留现有路径，但逐步变成 verified-gia 的来源库或索引
```

这只是建议，不要求下一轮一次性完成迁移。下一轮可以先建立 `documentation-governance.md` 和 `documentation-map.md`，再决定是否新建 `current/` / `verified-gia/` / `implementation/`。

---

## 五、文档状态标签规则

建议统一使用以下标签：

```md
> 状态：当前推荐
> 来源：当前代码实现 / 真实 GIA 验证 / 历史记录 / 推测
> 最近校验：YYYY-MM-DD
> 适用范围：gsts 当前输出 / 游戏编辑器真实输出 / 两者都适用
```

推荐状态值：

| 状态 | 含义 |
|---|---|
| 当前推荐 | 新开发优先阅读/使用 |
| 已验证 | 有真实 GIA 或测试/游戏验证支撑 |
| 当前实现 | 描述代码当前行为，不保证等同编辑器 |
| 历史记录 | handover / 调试过程，不作为教程 |
| 部分过期 | 部分结论仍有用，但 API 或实现已变 |
| 待验证 | 推测或未完成核验 |
| 已废弃 | 不再推荐，保留迁移信息 |

特别重要：

- `来源：真实 GIA 验证` 和 `来源：当前代码实现` 必须分开。
- 如果两者冲突，文档必须明确冲突，而不是合并成一个模糊结论。

---

## 六、下一轮推荐执行计划

### Phase 0：启动前确认与提交本文档

1. 确认用户同意本交接文档作为下一轮任务说明。
2. 决定是否提交本文档。
3. 保持功能代码冻结。

建议命令：

```bash
git status --short
```

### Phase 1：subagent 并行盘点

必须使用 subagent。不要由 parent 单独读完全仓库文档。

建议启动 4 个 read-only subagent：

#### Agent A：真实 GIA 来源盘点

任务：

- 确认真实 GIA 文件目录：`user_edit/`、`布局/`、`复杂gia/`。
- 建立文件索引。
- 抽样使用 `trace-exec-flow --io`、`trace-dataflow`、`decode-gia`。
- 找出现有文档中与真实 GIA 结论冲突或待重验的部分。

输出：

```text
artifacts/docs-audit/real-gia-source-audit.md
```

#### Agent B：当前代码实现盘点

任务：

- 阅读当前核心代码：runtime、composite registry、IR、Stage3、trace 工具。
- 列出现有实现和旧文档差异。
- 特别关注 raw control-flow DSL、多 InFlow composite、trace 工具。

输出：

```text
artifacts/docs-audit/current-code-implementation-audit.md
```

#### Agent C：文档重复和目录结构盘点

任务：

- 扫 `docs/**/*.md`。
- 标记重复主题、冲突入口、过期教程。
- 提出新目录结构和迁移优先级。

输出：

```text
artifacts/docs-audit/doc-structure-and-duplication-audit.md
```

#### Agent D：用户入口和工具文档盘点

任务：

- 检查 `docs/README.md`、`docs/docs/en/`、`docs/docs/zh/`、`docs/gia-tools-reference.md`。
- 确认是否需要把 trace 工具、新 DSL、当前推荐入口同步到用户文档。
- 注意中英文用户文档不要盲目写内部调试内容。

输出：

```text
artifacts/docs-audit/user-facing-docs-audit.md
```

### Phase 2：parent 综合设计

parent 阅读 4 份报告，产出：

```text
docs/documentation-governance.md
docs/documentation-map.md
```

这两个文件是下一轮最重要交付物。

### Phase 3：小批量更新高优先级入口

优先修改：

```text
docs/README.md
docs/composite-ir/index.md
docs/gia-tools-reference.md
docs/architecture/composite/raw-control-flow-dsl-quickstart.md
docs/architecture/composite/dsl-api.md
docs/architecture/composite/control-flow-api-cookbook.md
```

目标：

- 当前入口一致。
- 新旧 API 关系清楚。
- 真实 GIA 与代码实现来源清楚。
- trace 工具推荐流程清楚。

### Phase 4：状态标签和归档策略

不要逐篇重写 handover。

可以做：

- 给 `docs/composite-ir/handover/README.md` 增加索引和“最近有效 handover”。
- 给部分高风险旧文档加 banner。
- 给 `todo.md` / backlog / gaps 文件加状态标签。

### Phase 5：精简重复文档

只处理明显重复或会误导的文档。

推荐策略：

- 当前推荐内容合并到 `current/` 或现有权威文档。
- 历史分析保留在 archive/handover 或原目录下，但入口明确标历史。
- 重复段落用链接替代复制。
- 不删除有验证证据的历史材料，除非用户明确要求。

---

## 七、下一轮 subagent 使用要求

用户明确强调：

> 这个部分的工作量比较大，还需要强调让大模型多利用 subagent 的优势提高效率，不要自己一个人挖掘最后因为上下文不够产生偏移。

因此下一轮必须遵守：

1. 开始前先 `subagent({ action: "list" })`。
2. 用多个 read-only subagent 并行盘点，不要让 parent 独自读全量文档。
3. parent 负责综合判断和最终写入，或者只让一个 writer subagent 修改文档。
4. 不要多个 writer 同时改同一目录。
5. 每个 subagent 输出必须落文件，方便 parent 后续引用。
6. parent 在最终修改前要先给出目录设计和迁移计划，避免边读边乱改。
7. 对大范围文档移动/删除必须先征求用户确认。

推荐 orchestration：

```ts
subagent({ action: 'list' })

subagent({
  chain: [
    {
      parallel: [
        { agent: 'context-builder', task: 'Audit real GIA source docs...', output: 'docs-audit/real-gia.md' },
        { agent: 'context-builder', task: 'Audit current code implementation docs...', output: 'docs-audit/current-code.md' },
        { agent: 'context-builder', task: 'Audit duplicate docs and propose structure...', output: 'docs-audit/structure.md' },
        { agent: 'context-builder', task: 'Audit user-facing docs and tools docs...', output: 'docs-audit/user-facing.md' }
      ]
    },
    {
      agent: 'planner',
      task: 'Read {previous} and synthesize a documentation governance plan. Do not edit files.',
      output: 'docs-audit/final-plan.md'
    }
  ],
  context: 'fresh'
})
```

然后 parent 决定是否亲自写或交给单个 worker。

---

## 八、建议的真实 GIA 校正流程

针对每个真实 GIA 结论：

1. 找到文件路径。
2. 跑 `trace-exec-flow --io` 看控制流 I/O。
3. 跑 `trace-dataflow` 看数据流。
4. 若不确定，跑 `decode-gia.ts` 输出 JSON。
5. 在文档中记录：
   - 文件名
   - 命令
   - 观察结果
   - 结论
   - 是否已和 gsts 输出对比

示例格式：

```md
### debug6.gia 多 InFlow 复合调用

来源：真实 GIA 验证
文件：`.../user_edit/分支/debug6.gia`
命令：

```bash
npx tsx tests/composite/trace-exec-flow.ts <file> --io
```

观察：

```text
n=11 复合:复杂分支
  InFlow[0] 有限循环 <- n=1.OutFlow[0]
  InFlow[1] 开始转化事件 <- n=3.OutFlow[0], n=3.OutFlow[1]
  InFlow[2] 开始设置局部变量 <- n=2.OutFlow[0], n=4.OutFlow[0]
```

结论：同一个 composite call 节点可被多条边连接到不同 InFlow。
```

---

## 九、建议的代码实现校正流程

针对每个代码实现结论：

1. 找到源文件和函数。
2. 记录当前行为，不凭旧记忆。
3. 如有测试/游戏验证，记录对应脚本和结果。
4. 和真实 GIA 行为分开写。

示例：

```md
### `f.node()` detached 语义

来源：当前代码实现
代码：`src/runtime/core.ts` / `registerDetachedExecNode()`
行为：创建 exec node，不自动连接当前 tail，不推进 tail。
验证：`tests/composite/recreate-debug5.ts`，游戏内测试通过。
与旧 API 差异：`registerExecNode()` 会自动串联到当前 tail。
```

---

## 十、不要做的事

下一轮不要：

1. 不要新增功能。
2. 不要把文档清理变成测试扩展。
3. 不要一次性重写全部 markdown。
4. 不要删除 handover 历史记录。
5. 不要把真实 GIA 逆向结论和 gsts 当前实现混写。
6. 不要多个 writer subagent 同时改 docs。
7. 不要让 parent 单独挖全量知识，必须用 subagent 分摊上下文。
8. 不要为了“看起来干净”删除待验证或失败记录；这些对后续排查有价值。
9. 不要把旧 API 全部删掉；旧 API 仍可用，应标兼容/迁移。

---

## 十一、验收标准

下一轮完成时，应满足：

1. 有 `docs/documentation-governance.md` 或等价治理规则。
2. 有 `docs/documentation-map.md` 或等价文档地图。
3. 文档能清楚区分：
   - 真实 GIA 验证结论
   - 当前代码实现结论
   - 历史记录
   - 待验证推测
4. 新版 raw control-flow DSL 是低层控制流唯一推荐入口。
5. `trace-exec-flow --io` 被纳入工具文档和真实 GIA 校正流程。
6. `docs/composite-ir/handover/` 不再被误认为当前教程。
7. `rg "eventMarker|linkTo|registerExecNode|leaf\\(" docs -g'*.md'` 的剩余结果都有合理上下文：历史、迁移、兼容或实现说明。
8. 高优先级入口文档互相链接一致。
9. 大量重复内容有明确处理方案：保留、合并、迁移或归档。
10. 所有修改通过：

```bash
git diff --check
```

如果移动或重命名大量文档，还应跑链接检查或至少用 `rg` 抽查主要链接。

---

## 十二、建议下一轮第一句话

> 我会先把文档治理拆成两个来源维度：真实 GIA 验证结论和当前代码实现结论。先用 subagent 并行盘点真实文件、代码实现、重复文档和用户入口，产出审计报告；然后我综合出新的文档地图和治理规则，再小批量更新高优先级入口。不会新增功能，也不会重写历史 handover，除非先确认目录迁移方案。

---

## 十三、一句话总结

> 下一轮不是继续写功能，而是把过去多轮积累的 GIA 逆向、代码实现、工具用法和历史 handover 分层治理：真实 GIA 结论用 trace/decode 重新校正，代码文档按当前实现更新，重复内容精简并设计更清晰的新目录；整个过程必须依赖 subagent 并行盘点，parent 负责综合和控制写入边界。
