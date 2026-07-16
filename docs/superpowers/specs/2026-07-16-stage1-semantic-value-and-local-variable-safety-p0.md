# Stage 1 语义值分类与 LocalVariable 安全（P0）需求规格

> 状态：已验证
> 来源：当前代码实现 + 自动回归 + 用户编辑器与游戏内验证
> 最近校验：2026-07-16
> 适用范围：Genshin-TS Stage 1（TS → `.gs.ts`）变量规划、timer 变换与
> LocalVariable 生成；不改变 Stage 2 IR 或 Stage 3 GIA 编码
>
> P0-A 与 P0-B 已于 2026-07-16 完成。当前实现位于
> `src/compiler/ts_to_gs_transform/expression_semantics.ts` 和
> `local_variable_lowering.ts`；focused 回归为
> `tests/stage1_expression_semantics_test.ts`。两份代表性 timer GIA 已完成自动生成、复制哈希核对、
> 用户编辑器导入和游戏内验证。本文保留实施规格和验收边界，当前行为仍以源码、测试与
> [`../../architecture/composite/testing.md`](../../architecture/composite/testing.md) 为准。

## 1. 执行摘要

本 P0 分为两个必须依次完成、可独立验收的工作包：

1. **P0-A：统一 Stage 1 语义值分类**——建立一个集中模块，明确区分可存储 runtime value、
   Composite 完整结果对象、Composite 单输出、timer handle、flow marker、collection 引用和不支持对象；
   让通用变量规划、timer capture 和条件表达式类型推断使用同一分类结果。
2. **P0-B：LocalVariable 可存储性硬检查**——所有通用 LocalVariable 创建/写入必须通过统一
   builder/assertion；不允许未知对象回退为 `entity`，不允许完整 Composite 结果进入
   `setLocalVariable`。

**工作量判断：中等，适合一个专注会话完成。** 核心模型和 helper 不大；风险在于现有推断分散，
必须替换关键旧路径而不是叠加第二套真相。预计修改 3–6 个 Stage 1 文件、2–4 个 focused tests 和
当前测试文档，不应触及 Stage 2/3、生成定义或 vendor。

## 2. 背景与已确认故障

### 2.1 多输出 Composite timer bug

以下合法代码曾在 GIA 生成前失败：

```ts
const result = timerF.callComposite(multipleOutputs, inputs)
timerF.set('x', result.x)
timerF.set('y', result.y)
timerF.greaterThan(result.x, 0)
```

Stage 1 因 `result` 被读取多次，把完整 Composite 结果对象错误提升为：

```ts
const result = gsts.f.initLocalVariable('entity')
gsts.f.setLocalVariable(result.localVariable, timerF.callComposite(...))
```

Stage 2 执行 `.gs.ts` 时收到 `{ x, y }`，报：

```text
Generic parameter not matched: { x: ..., y: ... }
```

根因不是 nested composite 或 `split3dVector` 的 Stage 3 输出编码，而是 Stage 1 把两个独立问题混为一谈：

1. 是否需要保持初始化表达式只求值一次；
2. 初始化结果能否由游戏 LocalVariable 表示。

当前窄修复位于 `src/compiler/ts_to_gs_transform/stmt.ts`：完整 `callComposite(...)` 结果不再因
多次读取而提升。正式回归：

```text
tests/timer_nested_composite_multi_output_test.ts
gsts.timer-nested-composite-multi-output.config.ts
```

该回归已完成自动 GIA 生成、编辑器导入、引脚/连线检查和用户游戏内运行验证。证据详见
[`../../architecture/composite/testing.md`](../../architecture/composite/testing.md)。

### 2.2 `dataTypeConversion` 暴露的同类约束问题

`bool→float` 没有已知 GIA concrete variant，但 TypeScript 相关泛型可因推断拓宽而未稳定拒绝。
当前窄修复在 Stage 1 显式校验转换能力。该问题不是 P0 的主要实现对象，但说明：

> TypeScript 类型只能作为输入证据，不能代替编译器自己的语义分类和能力约束。

P0 不应顺便重构 typed-node capability registry；只需保证新分类模块可被未来能力校验复用，不制造新的
重复类型表。

## 3. 当前实现与问题边界

### 3.1 当前关键入口

| 职责 | 当前入口 | 已知问题 |
|---|---|---|
| 变量使用分析与 LocalVariable 规划 | `stmt.ts::buildVarPlan()` | 以 `isBasic/isCollection` 和表达式特判推断，缺少一等语义类别 |
| 变量声明的 LocalVariable 类型 | `stmt.ts::makeLocalVarTypeString()` | Composite 单输出有专用推断，完整结果靠外围特判避开 |
| timer/条件表达式 LocalVariable 类型 | `expr.ts::inferLocalVarTypeFromType*()` | 独立于 `stmt.ts` 的另一套推断 |
| timer capture 分类 | `expr.ts::collectTimerCaptures()` | 依赖 `DictValueType` 推断，需区分不可捕获的编译期对象 |
| 通用局部变量 AST 生成 | `stmt.ts`、`expr.ts`、`list_utils.ts` | 创建和写入分散，缺少统一可存储性断言 |
| 已知类型的列表算法临时变量 | `list_methods.ts`、`builtins.ts` | 数量多，但大多已有显式类型；首轮不应逐个重写语义推断 |

结构查询显示 `buildVarPlan()` 同时被普通 handler、`gstsServer*` 和 timer handler 的转换调用，因此它是
P0-A 的高杠杆 seam。`transformExpression()` 及 timer 变换是第二个关键消费者。

### 3.2 当前值类别实际多于 TypeScript 基础类型

Stage 1 至少要区分：

- 可存储 runtime scalar：`bool/int/float/str/vec3/guid/entity/prefab_id/config_id/faction`；
- 可存储 runtime collection：对应合法的 `*_list`，以及当前 LocalVariable 已支持的集合形态；
- Composite 完整结果对象：`f.callComposite(handle, inputs)` 的返回代理；
- Composite 单输出：`f.callComposite(...).x`，对应一个具体 runtime value；
- timer handle；
- flow/composite marker 等仅编译期引用；
- live collection reference 与 temporary/copy collection；
- 普通编译期对象或当前不支持对象。

这些类别不能再被压缩成 `isBasic: boolean` 后依靠 `entity` 等回退补洞。

## 4. 目标

### 4.1 P0-A：一个统一语义分类 seam

新增一个 Stage 1 内部模块（建议文件名）：

```text
src/compiler/ts_to_gs_transform/expression_semantics.ts
```

模块应暴露小而稳定的 interface。名称可在实施时微调，但能力不得弱于：

```ts
export type StorableLocalValueType =
  | 'bool'
  | 'int'
  | 'float'
  | 'str'
  | 'vec3'
  | 'guid'
  | 'entity'
  | 'prefab_id'
  | 'config_id'
  | 'faction'
  | `${LocalListElementType}_list`

export type ExpressionSemantics =
  | { kind: 'runtime-value'; valueType: StorableLocalValueType }
  | {
      kind: 'composite-result'
      outputs: ReadonlyMap<string, StorableLocalValueType>
    }
  | {
      kind: 'collection-reference'
      valueType: StorableLocalValueType
      source: 'live' | 'copy' | 'temporary' | 'unknown'
    }
  | { kind: 'timer-handle' }
  | { kind: 'flow-marker' }
  | { kind: 'unsupported'; typeText: string; reason: string }

export function classifyExpressionSemantics(env: Env, expr: ts.Expression): ExpressionSemantics

export function localValueTypeOf(
  semantics: ExpressionSemantics
): StorableLocalValueType | null
```

这里描述的是所需 interface，不要求逐字照抄类型名。实现必须满足：

1. **一个表达式只得到一个明确类别**；不能同时由多个调用方自行猜测。
2. Composite 完整结果必须识别为 `composite-result`，并保留命名输出及声明类型。
3. Composite 属性访问必须识别为 `runtime-value`，类型来自 CompositeHandle 的 `__outputs` 或
   当前已有定义回退逻辑。
4. 不可存储对象必须返回 `unsupported` 或其他明确的非存储类别，不能回退为 `entity`。
5. union/intersection 只有在所有有效分支语义兼容时才合并；冲突必须返回明确失败信息。
6. 分类是纯分析，不生成 AST、不注册 runtime 节点、无 I/O。

### 4.2 P0-A 的首轮消费者迁移

以下路径必须改为消费统一分类：

- `stmt.ts::buildVarPlan()`：决定变量是否可提升以及提升时的值类型；
- `stmt.ts::makeLocalVarTypeString()`：删除/委托重复的 basic 与 Composite 输出推断；
- `expr.ts::inferLocalVarTypeFromExpression()` 和条件表达式结果推断；
- timer capture 的值类型判定，以及对完整 Composite 结果/marker 的明确拒绝或保留策略。

迁移完成后，不允许 `stmt.ts` 与 `expr.ts` 继续各自维护完整的 runtime-value 类型识别实现。
可以保留很薄的兼容 wrapper，但必须直接委托新模块，并有删除旧逻辑的 TODO/后续范围说明。

### 4.3 P0-B：LocalVariable 可存储性硬检查

提供统一内部 builder/assertion（可放在新模块或单独的 `local_variable_lowering.ts`）：

```ts
assertLocalVariableStorable(env, node, semantics, operation)
makeCheckedLocalVariableInit(...)
makeCheckedLocalVariableSet(...)
```

具体 interface 可设计两次后选择，但必须做到：

- `initLocalVariable(type)` 的 type 必须来自 `StorableLocalValueType`，不能接收任意 `string`；
- `setLocalVariable` 的写入表达式必须分类为相同的可存储类型，或由调用方提供已经验证的已知类型；
- 完整 Composite 结果写入时报 Stage 1 定位诊断；
- 未知对象写入时报 Stage 1 定位诊断；
- 类型不一致时报出 declared/actual，而不是让 Stage 2 报 `Generic parameter not matched`。

推荐诊断：

```text
cannot store a complete composite result in LocalVariable; select a named output such as result.x
```

```text
cannot store value of type <typeText> in LocalVariable
```

```text
LocalVariable type mismatch: declared float, assigned vec3
```

首轮必须接入：

- 普通变量声明提升（`stmt.ts`）；
- timer capture 初始化/写回和条件表达式临时变量（`expr.ts`）；
- `list_utils.ts::makeLocalVarInit()`。

`list_methods.ts`、`builtins.ts` 中使用显式已知类型的内部算法临时变量，不要求本轮逐个改写为表达式分类，
但必须通过统一的 typed builder 或在文档中列出未迁移清单。不得留下可直接传任意字符串和任意表达式的
新公共 helper。

## 5. 变量规划规则

变量规划必须把“求值策略”和“存储表示”分开：

```text
分析读写与求值稳定性
  → 是否需要一次求值/跨执行流状态
  → 分类表达式语义
     ├─ runtime-value / storable collection → 可选择 LocalVariable
     ├─ composite-result → 保留 JS const 代理；不可 LocalVariable
     ├─ timer-handle / marker → 使用专用机制；不可 LocalVariable
     └─ unsupported → 若语义需要 LocalVariable，则立即诊断
```

最低行为要求：

| 源码形态 | 要求 |
|---|---|
| `const r = f.callComposite(multi, ...); r.x; r.y` | 保留完整结果对象，不提升 |
| `const x = f.callComposite(multi, ...).x` 多次读取 | 识别为声明类型，可按现有快照规则提升 |
| `let x = floatValue` 分支写入 | 使用 `float` LocalVariable |
| `const random = randomNode()` 多次读取 | 保持一次求值；若为可存储值可提升 |
| `let r = f.callComposite(multi, ...)` 且重绑定/跨分支 | Stage 1 明确拒绝，不伪装成实体 |
| timer 捕获完整 Composite 结果 | 明确拒绝或证明安全的专用代理策略；不得写 capture dict/LocalVariable |
| timer 捕获命名 Composite 输出 | 按具体输出类型处理 |
| 不兼容 union/intersection | Stage 1 明确诊断 |

## 6. 非目标

本 P0 不做：

- 不修改 Stage 2 IR 形状或 `src/runtime/IR.d.ts`；
- 不修改 Stage 3 Composite/GIA 编码；
- 不新增或猜测任何 GIA node ID；
- 不重构 typed-node capability registry；
- 不修改 `src/definitions/` 或 `src/thirdparty/`；
- 不扩展 DSL 允许的普通 JavaScript 对象、Promise、async、递归等能力；
- 不改 timer 的池化、去重或运行时调度语义；
- 不注入、覆盖或操作游戏地图；
- 不借机重写全部 `list_methods.ts`。

若实施中发现必须改变 IR 或 Stage 3 才能完成，应停止并提交证据与新方案，不得悄悄扩大范围。

## 7. 实施顺序

### WP0：建立红色反馈环

在改生产逻辑前，保留并运行当前回归：

```bash
npm run build
node bin/gsts.mjs -c gsts.timer-nested-composite-multi-output.config.ts --noinject
```

补一个纯 Stage 1 focused 测试，直接输入源码并断言 `.gs.ts`，至少能捕获：

- 完整 Composite 结果不得生成 `initLocalVariable('entity')`；
- 不得生成 `setLocalVariable(..., callComposite(...))`；
- 命名输出仍保留正确类型；
- 不可存储对象得到预期诊断。

测试应调用 Stage 1 的真实公开/内部入口，不复制分类算法。

### WP1：定义语义分类 module 与纯测试

1. 先写 `classifyExpressionSemantics()` 的 table-driven tests；
2. 覆盖 scalar、list、Composite 完整结果、Composite 单输出、timer handle、unsupported object；
3. 实现最小分类模块；
4. 不接消费者前先验证分类输出稳定。

### WP2：迁移变量规划

1. `buildVarPlan()` 使用分类结果；
2. `VarPlanEntry` 增加必要的语义/存储类型信息，避免后续重新推断；
3. `makeLocalVarTypeString()` 委托分类结果；
4. 删除当前 `isCompositeCallExpression` 的外围例外，或让它只存在于分类模块内部；
5. 重跑 Stage 1 与复杂 timer GIA 回归。

建议 `VarPlanEntry` 最终至少携带：

```ts
{
  needsLocalVar: boolean
  semantics: ExpressionSemantics
  localValueType?: StorableLocalValueType
  // collection provenance 保留或并入 semantics
}
```

不要只新增 `isCompositeResult: boolean`；那会继续扩张布尔标志组合，而不是建立语义模型。

### WP3：迁移 timer/条件表达式推断

1. 替换 `expr.ts` 重复的 LocalVariable 类型推断；
2. timer capture 使用相同分类；
3. Composite 完整结果捕获给出明确诊断；
4. 条件表达式两分支按语义类型比较，不只比较字符串。

### WP4：接入 checked LocalVariable builder

1. 普通声明提升；
2. timer capture 初始化/写回；
3. conditional 临时变量；
4. `list_utils.makeLocalVarInit()`；
5. 记录 `list_methods.ts`/`builtins.ts` 余下的显式 typed 调用点，并确保没有任意类型回退。

### WP5：回归、文档和清理

1. 删除被替代的重复推断和临时兼容分支；
2. 搜索所有 LocalVariable 生成点，确认迁移范围；
3. 更新 [`../../architecture/composite/testing.md`](../../architecture/composite/testing.md)；
4. 如 Stage 1 架构发生稳定变化，更新 `docs/architecture/stage1-ts-to-gs.md`；
5. 不把一次性细节写入 `AGENTS.md`，除非发现现有规则确实缺失且已由回归证实。

## 8. 测试矩阵

### 8.1 分类纯测试

| 输入 | 预期分类 |
|---|---|
| `new float(1)` / number float | `runtime-value(float)` |
| bigint / `new int(1)` | `runtime-value(int)` |
| bool、str、vec3、entity 等 | 对应 `runtime-value` |
| typed list | 对应可存储 collection/value type |
| `f.callComposite(multi, inputs)` | `composite-result`，含命名输出类型 |
| `f.callComposite(multi, inputs).x` | `runtime-value(float)` |
| wrapped/parenthesized/as/satisfies Composite call | 与未包装相同 |
| timer handle | `timer-handle` |
| flow marker | `flow-marker` 或明确非存储类别 |
| `{ x: value }` 普通对象 | `unsupported` |
| 不兼容 union | `unsupported`/明确冲突 |

### 8.2 Stage 1 输出回归

必须断言生成文本或 AST 结构，而不只断言命令退出码：

- 完整 Composite 结果保留普通 `const`；
- 单输出可以生成正确 typed LocalVariable；
- 不出现 Composite 结果→`entity` 回退；
- 不出现完整结果传入 `setLocalVariable`；
- timer capture 和普通 handler 行为一致；
- 既有随机值一次求值语义不退化；
- list live/copy/temporary 既有语义不退化。

### 8.3 负向回归

至少覆盖：

```ts
let result = f.callComposite(multi, inputs)
if (condition) result = f.callComposite(multi, otherInputs)
```

预期 Stage 1 失败，诊断提到完整 Composite 结果不可存入 LocalVariable。

另覆盖普通对象、类型不一致写入。负向 fixture 必须从 `gsts.test.config.ts` 的正常成功集合排除，或使用
独立测试 harness 明确断言失败。

### 8.4 端到端自动回归

必须通过：

```bash
npm run build
node bin/gsts.mjs -c gsts.timer-composite-output-types.config.ts --noinject
node bin/gsts.mjs -c gsts.timer-nested-composite-multi-output.config.ts --noinject
```

保留 `dataTypeConversion` 负向诊断回归，确保 P0 不破坏当前修复：

```bash
node bin/gsts.mjs -c gsts.data-type-conversion-invalid.config.ts --noinject
```

该命令预期非零退出，并包含：

```text
unsupported dataTypeConversion bool→float; supported targets for bool: int, str
```

通用测试优先使用无注入模式。当前 `gsts.test.config.ts` 会扫描既有 debug fixture，可能遇到与 P0 无关的
失败；应报告具体文件和错误，不得把失败静默改成通过，也不得为清空测试而删除既有 fixture。

### 8.5 游戏验证边界

P0 是 Stage 1 内部重构。如果两个已游戏验证 fixture 生成的关键 `.gs.ts`/IR/GIA 结构保持等价，且本轮
不改变生产编码语义，可先请求用户复验代表性复杂 fixture，不应自行复制或注入。若生成结构发生有意变化，
完成前必须让用户执行编辑器导入与游戏内复验。

## 9. 验收标准

### P0-A 完成条件

- [ ] 存在单一 `ExpressionSemantics` 分类模块和 focused tests；
- [ ] `buildVarPlan()`、LocalVariable 类型推断、timer capture 使用该模块；
- [ ] 完整 Composite 结果与命名输出被明确区分；
- [ ] `VarPlanEntry` 携带分类/存储信息，消费者不重复猜类型；
- [ ] 旧的重复推断已删除或仅剩直接委托 wrapper；
- [ ] nested/split timer 多输出回归继续生成 GIA。

### P0-B 完成条件

- [ ] 通用 LocalVariable init/set 经过 checked builder/assertion；
- [ ] 完整 Composite 结果、普通对象和类型冲突在 Stage 1 报定位诊断；
- [ ] 不存在未知对象回退为 `entity` 的路径；
- [ ] timer capture、conditional、普通声明和 `list_utils` 已接入；
- [ ] 剩余显式 typed 内部调用点有审计清单，不存在未说明的任意字符串入口；
- [ ] 正向、负向、build、focused GIA 回归通过；
- [ ] `git diff --check` 通过。

### 总体验收命令

```bash
npm run build
node bin/gsts.mjs -c gsts.timer-composite-output-types.config.ts --noinject
node bin/gsts.mjs -c gsts.timer-nested-composite-multi-output.config.ts --noinject
# 运行新增 Stage 1 semantics focused tests
# 运行负向 LocalVariable/composite-result tests
# 运行 bool→float 负向 fixture，并断言明确诊断
git diff --check
```

未运行的命令和原因必须在完成报告中明确列出。

## 10. 设计约束与反模式

禁止以下实现方式：

1. 只新增 `isCompositeResult` 特判而不建立统一分类；
2. 新旧两套完整类型推断长期并存；
3. 用 `any`、`as unknown as` 或默认 `entity` 掩盖分类失败；
4. 让分类模块生成 AST 或注册 runtime 节点，破坏纯分析 seam；
5. 为了复用而把内部 Stage 1 类型暴露成用户 DSL interface；
6. 只测试 helper，不经过真实 Stage 1 转换入口；
7. 只断言“生成成功”，不检查 `.gs.ts` 中的错误 LocalVariable 形态；
8. 修改生成定义、vendor、IR 或 Stage 3 来绕过 Stage 1 问题；
9. 未经确认复制、注入或覆盖游戏文件；
10. 擅自清理当前未跟踪的 GIA 输出目录或工作树变化。

## 11. 新会话启动提示

新会话应按以下顺序开始：

1. 读取根 `AGENTS.md`；
2. 读取 `src/AGENTS.md`、`src/compiler/AGENTS.md`、
   `src/compiler/ts_to_gs_transform/AGENTS.md`、`tests/AGENTS.md`、`docs/AGENTS.md`；
3. 读取本规格和 [`../../architecture/composite/testing.md`](../../architecture/composite/testing.md)；
4. 检查 `git status --short`，不得还原当前 bug 修复；
5. 用 codebase-memory 查询 `buildVarPlan`、`transformExpression`、`makeLocalVarInit` 调用链；
6. 先运行当前 focused fixture，建立反馈环；
7. 先做 P0-A，再做 P0-B；每个工作包独立保持可构建、可测试。

可直接交给新会话的任务描述：

```text
按 docs/superpowers/specs/2026-07-16-stage1-semantic-value-and-local-variable-safety-p0.md
实施 P0-A 和 P0-B。先建立红色 Stage 1 focused tests，再实现统一 ExpressionSemantics
分类 seam，迁移变量规划/timer/conditional 类型推断，最后加入 checked LocalVariable
init/set。保留当前多输出 timer 和 bool→float 修复，不修改 Stage 2/3、definitions、vendor，
不执行注入。按规格运行验收并分开报告自动生成、编辑器导入和游戏验证证据。
```

## 12. 规则反馈要求

完成前检查本轮源码、测试和用户验证是否与适用 `AGENTS.md` 不一致。只有发现高频、可复用、可行动且
已由回归证实的新规则时，才更新最小范围的规则文件；局部迁移清单和一次性实现决策保留在本规格、测试或
权威架构文档中。
