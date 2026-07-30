# 游戏实战编译器优化续作清单

> 状态：当前续作入口
> 来源：目标玩法实战反馈 + 当前代码实现 + 自动回归
> 最近校验：2026-07-30
> 适用范围：Genshin-TS Composite 类型、诊断、组件事件文档和 GIA 校验工具；不代表游戏内验证

本文档承接
`/home/h/star-cube-nexus/docs/compiler-findings/GENSHIN_TS_FINDINGS_2026_07_30_ZH.md`。
下一轮应从本页按顺序继续，不能因为证据不足、环境阻断或实现范围较大而跳过项目。代码改动必须遵循
“独立测试先复现红灯 → 最小生产修复 → 测试转绿 → 相邻回归 → 文档更新”；纯文档改动必须登记用户
文档和索引入口。

## 0. 本轮已完成

### 0.1 Composite `build(args)` 输入不再退化为 `any`

状态：**已完成，自动类型回归通过**。

- 生产代码：`src/runtime/core.ts`、`src/runtime/composite_registry.ts`。
- 红绿测试：`tests/composite/test-composite-build-input-types.ts`。
- 旧实现红灯：`entity`、`vec3`、`int` 三项均报
  `Type 'true' does not satisfy the constraint 'false'`，证明类型为 `any`。
- 当前绿灯：测试直接执行类型检查
  `f.getEntityLocationAndRotation(args.pivot)`，并断言三个输入映射为运行时代理值。
- 权威文档：`docs/architecture/composite/dsl-api.md`；测试索引：
  `docs/architecture/composite/testing.md`。
- 证据边界：只证明 TypeScript 定义侧类型，不证明调用侧输入检查、GIA 或游戏行为。

### 0.2 诊断控制台显示已有结构化上下文

状态：**已完成，自动回归通过**。

- 生产代码：`src/diagnostics.ts` 的 `formatDiagnostic()`。
- 红绿测试：`tests/diagnostics_console_context_test.ts`。
- 旧实现红灯：控制台缺少 `source`、graph、entry、IR node 和 location。
- 当前绿灯：控制台会显示诊断对象中已经存在的上述字段；JSON 契约保持不变。
- 相邻回归：`tests/diagnostics_test.ts`、
  `tests/composite/test-multi-outflow-default-continuation-warning.ts`。
- 权威文档：`docs/architecture/composite/testing.md` 的“结构化编译诊断”。
- 剩余边界：显示字段不等于上游已提供准确 source map/provenance；见任务 2。

### 0.3 Composite Stage 3 accessory fail-fast 与嵌套路由

状态：**已完成自动结构回归，编辑器/游戏验证待后续具体候选**。

- `irToGia()` 对每个 Composite 先完整构建 definition/impl accessory 对，失败时统一抛出
  `GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED`，不返回部分 GIA。
- shared/legacy 共用的 impl identity seam 会拒绝无法解析的节点类型 ID；legacy 不再静默编码
  `genericId.nodeId=0`。这不限制合法 `nodeIndex=0` 或其他 protobuf 默认字段。
- 红绿测试：`tests/composite/test-stage3-composite-accessory-fail-fast.ts`；审查期间先观察到 shared
  fail-fast、legacy 未抛错，补齐 shared/legacy 公共检查后两条路径均转绿。
- 三层 capture：`tests/composite/test-three-level-nested-capture-routing.ts`，覆盖
  `Level1.input[0] -> Level2.input[0] -> Level3.input[1]` 的 IR `compositeInputIndex` 和逐层
  `compositePins`，shared/legacy 均通过。
- detached 执行边：`tests/composite/test-mixed-composite-normal.ts` 区分 Composite 数据边与
  `f.link(f.entry(), ...)` 执行边；shared/legacy 均通过。旧 exec Composite 串行覆盖仍由
  `test-two-exec.ts` 和 `test-nested-composite-call-continuation.ts` 保留。
- P2-W11/P2-W12 默认测试输出已改到 `/tmp`，避免无参数运行写真实游戏导出目录。
- 权威文档：`docs/architecture/composite/gia-encoding.md`、`dsl-api.md`、`testing.md`。

### 0.4 基础运动器停止事件的组件持有者文档

状态：**用户文档已完成，lint 尚未实现**。

- 中文：`docs/docs/zh/doc/events/gserver.md` 的“组件持有者事件”。
- 英文：`docs/docs/en/doc/events/gserver.md` 的“Component-owner events”。
- 站点索引：对应目录 `_meta.json` 的 `gserver` 条目。
- 交叉入口：中英文 `signals.md`。
- 已说明：事件发送给组件持有者；跨实体应在持有者图处理或显式转发信号；编译成功不证明事件返回调用图。
- 剩余 lint 调研见任务 4。

## 1. Composite 调用侧输入类型安全

状态：**已完成，自动类型与相邻回归通过**。

- `CompositeHandle` 现在保留 inputs/outputs phantom schema，`callComposite()` 和
  `declareDetached()` 按 input schema 检查直接对象字面量；错误运行时值类型与未知字段会被拒绝。
- 调用输入仍是稀疏契约：完整输入、任意已声明字段子集和 `{}` 均合法；通用 `value` / `generic` 连接
  继续交由 Stage 2 实际校验。
- 输出推导保持不变，`float` / `vec3` 不退化为 `generic`。
- 红绿测试：`tests/composite/test-composite-call-input-types.ts`；旧实现红灯为四条
  `Unused '@ts-expect-error' directive`，当前转绿。
- 相邻回归：build 输入类型、optional runtime contract、Stage 1 expression semantics、timer 与 nested
  timer 无注入 GIA 生成均通过。
- 稳定生成来源：`scripts/generate-definitions.ts --composite-contracts-only`；完整 `npm run gen` 的原
  `nodeZh === undefined` 崩溃已修复，但资源快照与已提交 definitions 有大量无关漂移，因此本轮只纳入
  contract-only 的最小 `src/definitions/nodes.ts` 生成 diff。
- 权威文档：`docs/architecture/composite/dsl-api.md`、`testing.md`。
- 证据边界：证明 TypeScript、Stage 1/2 回归和无注入 GIA 生成，不代表编辑器或游戏内验证。

以下保留本项实施时的验收依据。

### 红灯测试要求

新增独立文件：

```text
tests/composite/test-composite-call-input-types.ts
```

必须先在当前实现上证明以下 `@ts-expect-error` 未被消费：

1. 已声明字段传入错误运行时值类型；
2. 直接对象字面量带未知字段；
3. `declareDetached()` 与 `callComposite()` 存在同一缺口。

同时保留正向断言：

- 所有字段均传入时合法；
- 只传部分已声明字段合法；
- `{}` 合法，因为当前 runtime 支持稀疏/可省略调用输入；
- 输出类型不能从 `float` / `vec3` 退化为 `generic`。

现有保护回归：

```text
tests/composite/test-composite-optional-call-inputs.ts
tests/timer_composite_output_types_test.ts
tests/timer_nested_composite_multi_output_test.ts
```

### 预计实现范围

- 给 `CompositeHandle` 保留输入 schema phantom type，同时保持输出 schema 推导不变；
- 调用参数使用 `Partial<CompositeInputValues<Inputs>>`，不能改成全必填；
- `callComposite()` / `declareDetached()` 当前位于生成定义 `src/definitions/nodes.ts` 的手写区，禁止直接
  修改生成物。必须先确定稳定生成来源或非生成声明 seam；若修改生成器，运行 `npm run gen` 并处理任务 7
  的现有阻断，不得跳过。

### 完成标准

红灯转绿；`npm run build`；上述 optional/timer 回归通过；Stage 1 expression semantics 通过；
`git diff --check`；更新 `dsl-api.md` 和 `testing.md`。

## 2. 多出口诊断的真实源码位置和 provenance

状态：**共享分支 join 修复已提交并完成本地自动回归，待更新 consumer 固定快照复核**。
控制台和 `--warnings-json` 共享同一诊断对象；普通事件分支、timer callback、Composite `build` 和 timer
runtime helper 均可携带 `entryFile`、源码行列、`originKind` 与 callback 上下文。

原始 star-cube 固定快照离线生成曾定位到 25 条 warning：1 条 terminal timer helper 过滤分支和 24 条
terminal 运动器名称过滤分支。它们都位于各自 handler 末尾，没有实际 continuation，属于共享 runtime
过早裁剪多分支 tail 并报警。当前修复保留全部未 `return` 的分支 tail：handler 末尾不报警；存在后续
顺序节点时，所有活跃分支都汇合到该节点；真正有歧义的多 OutFlow Composite 顺序调用仍使用
OutFlow[0] 并保留 warning。star-cube 玩法源码无需批量改为 `f.node()` / `f.link()`。

自动回归：`tests/multi_outflow_terminal_join_test.ts`、
`tests/composite/test-multi-outflow-default-continuation-warning.ts`、
`tests/composite/test-explicit-multi-outflow-join-no-warning.ts`、`tests/diagnostic_provenance_test.ts`。
当前 `originKind` 为 `user | lowering | runtime-helper`；非 user provenance 同步归类为
`source: generated`。Composite call 的多出口 metadata 现在保留 marker provenance；字段仍为 additive
JSON 契约。证据仅覆盖本地源码、IR/GIA 自动生成和 consumer 旧快照日志；新快照复核、注入和游戏验证
仍未执行。

### 红灯测试要求

新增一个最小 Stage 1 → Stage 2 fixture，至少覆盖：

1. 用户源码中的普通 `if` / `else if`；
2. timer callback 中 lowering 产生的分支；
3. Composite `build` 内分支；
4. 编译器 helper/lowering 产生且用户无法直接修改的节点。

测试应先证明诊断缺少或错误标注以下字段：

```text
entryFile
location.file/line/column
originKind: user | lowering | runtime-helper
callback/event/timer/composite context
```

### 调查与实现

- 先查 Stage 1 已有 TypeScript source map/AST 位置信息在哪个阶段丢失；
- 设计最小 provenance 载体，贯穿 `.gs.ts`、runtime record 和 IR，不要仅按 `nodeType` 猜来源；
- 对纯 lowering 内部且可由编译器正确连接的多出口，优先修 lowering 的显式 continuation，而不是静默
  屏蔽所有 generated warning；
- 控制台与 `--warnings-json` 必须保持同一对象语义。

### 完成标准

原始玩法项目的三条 warning 能回答：源文件行列、入口图、事件/timer callback、IR node、用户代码还是
lowering，以及应由用户还是编译器修复。只完成控制台格式化不算完成本项。

## 3. Composite 实体类别约束 `entityKinds`

状态：**未实现，存在两层证据，必须分阶段处理**。

当前节点签名已确认：`getEntityLocationAndRotation` 接受
`character | object | creation`。目标玩法的 pivot 如果只允许 `object | creation`，这是 Composite 自身的
更严格业务约束。

### 3.1 TypeScript-only 阶段

先新增红灯测试：

```text
tests/composite/test-composite-entity-kind-input-types.ts
```

目标 API 形态：

```ts
pivot: { type: 'entity', entityKinds: ['object', 'creation'] as const }
```

测试要求：object/creation 合法；player/stage 非法；是否允许 character 由 schema 决定；嵌套 Composite
和调用侧均保持约束；显式 `entity(...)` 拓宽行为必须有测试和文档。

实现不得手改 `src/definitions/`。优先复用 `EntityOf<K>` 和当前实体 helper 类型来源。

### 3.2 IR/GIA 表达调查

TypeScript 阶段完成后仍不能声称编辑器 pin 会限制实体类别。必须调查：

1. 真实编辑器 Composite 输入是否保存实体类别过滤；
2. protobuf 是否存在对应字段；
3. 如果无真实 GIA 证据，则明确保持 authoring-only metadata，不扩展 wire；
4. 如果有字段，按 Composite 完整 bug 流程建立最小真实样本、同构红灯和 shared/legacy 回归。

## 4. 组件事件归属启发式 lint

状态：**文档完成，lint 未做**。

先收集至少两个真实模式：高置信错误案例和合法跨图/信号转发案例。新增 lint/诊断测试，验证：

- 当前图监听组件持有者事件；
- 同图对明确非 self 的实体添加/启动对应组件行为；
- 未发现显式持有者图或信号转发时才 warning；
- 未知实体来源不报强错误；
- 合法结构不误报；warning 可配置或抑制。

候选错误码：`GSTS-COMPONENT-EVENT-OWNER-MISMATCH`。严重级别只能是 warning，除非后续有可证明的
静态语义。误报率不可控时，应记录调查证据并保持文档方案，但不能假装 lint 已完成。

## 5. 稳定的只读 GIA 结构校验器

状态：**未实现**。现有 `decode`、`gia-inspect`、`gia-compare` 和测试脚本分散，尚无稳定项目级
`validate-gia` 契约。

### 测试先行

建议先为纯校验函数新增：

```text
tests/gia_validation_test.ts
```

每条规则必须有一个独立损坏 fixture/构造器先产生红灯：

- 容器/header 解码失败；
- nodeIndex 重复；
- 连接目标节点不存在；
- 连接目标 pin 不存在或方向错误；
- `compositePins.innerNodeId` 不存在；
- Composite call 引用不存在的定义；
- CompositeDef 与 impl GraphUnit 引用不一致；
- 参数 index/pinIndex 冲突；
- accessory 构建失败不得留下部分 GIA。

不要笼统断言“没有 nodeId=0”；必须分别定义 IR node id、GIA nodeIndex、generic/concrete node type ID
中哪些 0 非法。

### 产品形态和完成标准

优先实现纯函数库，再接：

```text
gsts validate-gia <file.gia> --format json
```

输出带 `schemaVersion`、`valid`、summary 和稳定错误码；CLI 必须只读。完成前按
`docs/architecture/composite/testing.md` 执行同构复现、主图对照、shared/legacy 和证据分层。
自动校验通过不等同编辑器导入或游戏验证。

## 6. 固定时长运动与完成处理辅助层

状态：**暂未产品化，但不得遗忘**。这不是简单回调语法糖，必须处理组件持有者、同名、重启、关闭、
迟到事件、超时、多实体并发和跨图转发。

下一步先做独立示例/工具层原型及测试，不直接加入编译器核心。测试矩阵至少覆盖：

- 单实体正常完成；
- 两实体并发；
- 同名运动；
- 完成与主动关闭；
- 超时与迟到事件；
- 目标实体不是当前图组件持有者；
- 状态切换期间旧事件不能完成新任务。

首版优先返回显式 token/name 匹配器，而不是承诺隐式 `onStopped` 闭包。经过至少两个玩法复用后，再
决定放入示例库、可选工具包、runtime DSL 或 compiler lowering。

## 7. 已发现的环境/生成阻断

### 7.1 `npm run gen` 阻断

状态：**崩溃已修复，definitions 大范围漂移仍需独立维护**。

原失败并非 `Update Floating Interaction Page List Data` 缺少中文定义，而是中文资源在该位置之前多出
“光标碰撞盒组件”章节，导致英文 `sections[sIndex].nodes[nIndex]` 错配。生成器现在优先按章节参数形状
匹配本地化 section，并保留章节序号 fallback；`npm run gen` 已可完整结束。

完整生成会同时改写约 5,000 行 `src/definitions/nodes.ts` 及 event/prefab 生成物，说明当前资源快照与已
提交生成物存在本任务之外的大范围漂移。该漂移未纳入任务 1；本轮恢复了无关生成结果，仅通过
`--composite-contracts-only` 从同一生成脚本产出 Composite 契约的最小 diff。后续定义维护应独立审计
并决定是否同步整批生成结果，不能把大范围资源更新伪装成 Composite 类型修复。

### 7.2 文档站依赖阻断

`cd docs && npm run build` 当前失败：

```text
rspress: command not found
```

说明 `docs/` 子包依赖未安装。下一轮需要在获准的依赖安装/CI 环境中运行文档构建；在此之前只能声称
Markdown、索引路径和 `git diff --check` 已验证，不能声称站点构建通过。

## 8. 游戏中的瞬移、斜线、缺块与重叠

状态：**未确认是编译器 bug，也不能因无法归因而关闭**。

当前优先候选仍是玩法状态与坐标系：结束后未精确吸附、已旋转 pivot 上仍使用初始局部偏移、绝对
`(90, 0, 0)` 覆盖既有 Y 旋转，以及同一事件内解绑/更新/重绑竞争。

若继续调查编译器归因，必须先建立 Composite 与非 Composite 的最小同构对照，并逐层比较：

```text
.ts → .gs.ts → IR JSON → GIA 数据/控制流 → 编辑器导入 → 游戏行为
```

只有出现主图正常而 impl 不同、IR 正确而 GIA 连接错误、或真实 GIA 与 gsts GIA 关键节点拓扑冲突时，
才登记具体编译器 bug，并为该差异建立红灯测试。玩法逻辑修复和编译器修复必须分开记录。

## 9. 推荐执行顺序

1. 任务 1：调用侧输入类型安全；
2. 任务 2：诊断 provenance 与真实源码位置；
3. 任务 7.1：如类型工作需要生成定义，先修生成阻断；
4. 任务 3.1：TypeScript 实体类别约束；
5. 任务 5：`validate-gia` 首版；
6. 任务 4：组件事件归属 lint 调研与高置信 warning；
7. 任务 3.2：实体类别 GIA 能力调查；
8. 任务 6：运动任务辅助层原型；
9. 任务 8：按证据继续游戏异常归因；
10. 任务 7.2：在依赖完整环境补跑文档站构建。

每轮结束都要更新本页状态，不允许把“待验证”“环境阻断”改写成“无需处理”。
