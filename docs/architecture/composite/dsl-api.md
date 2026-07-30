# DSL API：复合节点的语法糖与类型系统

> 状态：当前实现
> 来源：当前代码实现
> 最近校验：2026-07-30
> 适用范围：gsts 当前复合节点用户面 API

> 本文档聚焦于 `g.defineComposite` / `f.callComposite` 的用户面 API 设计、类型约束及使用模式。
> 参见：[捕获机制](./capture-mechanism.md) | [IR 表示](./ir-representation.md) | [管线追踪](./pipeline-flow.md) | **[Raw 控制流 DSL 快速上手](./raw-control-flow-dsl-quickstart.md)** | **[控制流 API 实战速查](./control-flow-api-cookbook.md)** (顺序执行 / 多 OutFlow 派发 / 真实 GIA 样本对照)

---

## 1. 定义 API：`g.defineComposite`

复合节点通过 `g.defineComposite(name, def)` 在模块顶层声明。定义 API 注册一个可复用的子图模板，但**不立即执行** build 回调——实际捕获发生在阶段二执行时。

```typescript
export const Add = g.defineComposite('Add', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: (args, f) => {
    const result = f.add(args.a, args.b)
    return { result }
  }
})
```

### 参数声明

`inputs` / `outputs` 的每个属性对应一个命名参数，其 `{ type }` 字符串通过 `CompositeParamType` 约束，有效值来自 `RUNTIME_TO_GIA_TYPE` 映射（`int`、`float`、`str`、`bool`、`vec3`、`entity`、`guid`、`prefabId`、`configId`、`faction`）：

```typescript
type CompositeParamDef = { type: CompositeParamType }
```

### build 回调签名

```
build: (inputs: { [K in keyof Inputs]: value }, f: ServerExecutionFlowFunctions) => Record<string, value>
```

- **inputs**：占位值对象，每个属性带 `__captureInputName` 标记（供后续 compositePins 映射使用）
- **f**：独立的 `ServerExecutionFlowFunctions` 实例，运行在独立的 `MetaCallRegistry` 之上
- **返回值**：必须是一个 `Record<string, value>`，其 key 与 `outputs` 声明一一对应。每个 value 通过 `createOutParamValue` 或 `record.markPin()` 携带 pin 元数据，供 OutParam compositePin 推导

### CompositeHandle

`defineComposite` 返回 `CompositeHandle<Outputs>`——一个携带 `__composite` brand 和输出声明类型的轻量句柄：

```typescript
type CompositeHandle<Outputs> = {
  readonly __composite: true
  readonly name: string
  readonly id: number          // 从 1610700000 递增分配
  readonly definition: CompositeDefinition
  readonly __outputs: Outputs  // 仅用于 TypeScript 类型保留
}
```

`__outputs` 是类型标记，不是运行时节点图数据。它使 `f.callComposite(handle, inputs)` 的每个返回 pin 保留声明类型，例如 `float` 输出可继续传给比较节点，`vec3` 输出可继续传给 `split3dVector`。

`id` 在 `CompositeRegistry.define()` 中分配，全局唯一。句柄可作为 `f.callComposite()` 的第一个参数。

---

## 2. 调用 API：`f.callComposite`

### 场景 → API 决策表

| 场景 | 推荐写法 | 自动执行流语义 |
|---|---|---|
| 主图调用执行 Composite，后续还有普通节点 | `f.callComposite(child, {})` | 调用 marker 按主图当前 tail 自动串联 |
| Composite `build()` 内调用**单出口执行 Composite**，后续还有节点 | `f.callComposite(child, {})` | 自动从 child 的 `OutFlow[0]` 继续；无需 `declareDetached()` + `f.link()` |
| Composite `build()` 内调用多出口执行 Composite | 普通顺序可直接 `f.callComposite(child, {})`；精确分支用 `f.declareDetached(child, {})` + `f.link(...)` | 普通顺序默认只接 `OutFlow[0]` 并 warning；精确拓扑必须显式选择出口 |
| 需要 fan-in、fan-out 或精确拓扑 | `f.declareDetached(...)` + `f.link(...)` | 完全由调用方控制 |
| 纯数据 Composite | `f.callComposite(...)` | 保持数据节点语义，不参与执行流 continuation |
| 执行 Composite 是终点 | `f.callComposite(...)` | 不需要虚构后续边 |

在主图 handler 中使用 `f.callComposite(handle, params)` 调用已定义的复合：

```typescript
g.server({ name: 'Main' }).on('playerLogin', (evt, f) => {
  const { result } = f.callComposite(Add, { a: int(1), b: int(2) })
  f.log(result)
})
```

### 参数传递方式

`params` 对象的值可以是：

1. **字面量值**：`int(42)`、`str("hello")`——在 IR 中转为 `__composite_call__` 节点的参数
2. **变量引用**：其他 `f.method()` 的输出值——会产生从上游节点到 `__composite_call__` 标记节点的数据连线

当参数是其他复合调用的输出时，`runCompositeCall` 会在 `compositeDataEdges` 中记录跨复合的数据连线：

```typescript
// 复合 A 的输出 → 复合 B 的输入
const { val } = f.callComposite(A, { x: int(1) })
const { sum } = f.callComposite(B, { y: val })
// compositeDataEdges: [{ fromNodeId, fromPinIndex, toMarkerId, toPinIndex }]
```

#### `compositeInputIndex` 的索引空间

`__composite_call__` 的 IR 参数布局和逻辑输入索引是两套编号：

```text
args[0] = 被调用复合的 ID
args[1..] = 本次调用实际传入的参数
args[n].compositeInputIndex = 该参数在被调用复合 inputs 声明中的 index
```

因此，`args[1].compositeInputIndex` 不一定是 `1`。若被调用复合声明
`inputs: { cubie, pivot }`，调用 `{ pivot: outerArgs.pivot }` 时，`pivot` 虽然是本次调用实际传入的
第一个值并位于 `args[1]`，但它对应被调用复合的 `input[1]`，所以
`compositeInputIndex: 1` 是预期结果。若被调用复合只有 `inputs: { pivot }`，同一位置则应是
`compositeInputIndex: 0`。

当值来自外层复合输入时，`capture: true` 表示它不按普通数据边编码。外层
`CompositeDefIR.compositePins` 会把 `outer InParam` 映射到嵌套调用的逻辑 `InParam`；
`compositeInputIndex` 负责保留被调用复合的声明索引，不能理解为外层输入索引。当前自动回归见
`tests/composite/test-three-level-nested-capture-routing.ts` 和
`tests/composite/test-composite-sparse-named-input.ts`。这些测试验证当前 IR/GIA 输出，不等同游戏内验证。

### 返回值解构

返回值是捕获阶段构造的代理值对象。每个属性通过 `markPin(markerRecord, 'output', outIdx)` 绑定到主图 `__composite_call__` 节点的 OutParam pin，因此调用方可以直接将其传递给下游节点。类型上，返回对象按 `outputs` 声明映射到对应的运行时值类型；在 timer callback 中也适用。

内部实现创建一个带 `__markerNodeId` 隐藏属性的代理对象，供 `connectOutFlowBranch` 处理多 OutFlow 时使用。

### 控制流回调中的 Timer metadata

Timer API 属于当前 server 图的编译过程，不受 JavaScript 闭包层级限制。以下位置都支持 Timer：

- `doubleBranch` 的 true / false 回调；
- `fork` 分支回调；
- 有限循环和列表迭代的 body；
- 嵌套控制流回调；
- `setInterval` callback 内继续调用控制流 API。

```ts
g.server({ id: 1073742404 }).on('whenEntityIsCreated', (_evt, f) => {
  f.doubleBranch(new bool(true), () => {
    setTimeout((_timerEvt, timerF) => {
      timerF.printString(new str('timer body'))
    }, 1000)
    f.printString(new str('branch tail'))
  }, () => {})
})
```

Stage 1 会为每个 Timer 生成内部 metadata（Timer 名称池、capture 描述和去重 key），并在 Stage 2/3 生成对应的 Timer 注册节点、`when_timer_is_triggered` 事件节点及 callback 下游执行流。用户代码只需要调用标准 Timer API，不应自行传入或修改 metadata 对象。

Timer callback 参数仍按以下约定推断：`_timerEvt` 是 Timer 事件负载，`timerF` 是当前图的执行流函数。控制流 callback 会继承外层 handler 的 `f` / `evt` 标识；但 Timer callback 内应优先使用该 callback 自己的 `timerF`，以确保节点连接到 Timer 事件起点。

对于条件分支内的 Timer，当前实现表达的是“Timer 注册节点位于该分支的生成执行流中”；这不是 JavaScript 闭包的延迟执行模型。是否运行时实际到达注册节点，由生成的 OutFlow 连接决定。业务侧仍需自行保证初始化幂等性、Timer 句柄清理和 capture 状态管理。

针对性回归：`tests/timer_metadata_control_flow_callbacks_test.ts` 覆盖直接 Timer、分支内 `setTimeout`、Timer 内嵌控制流和分支尾部 continuation；生成与 trace 命令见 [`composite/testing.md`](./testing.md#timer-元数据在控制流回调中的回归)。Composite build / nested-call 边界另由 `tests/timer_composite_control_flow_callbacks_test.ts` 覆盖，验证 Timer 保留在 impl graph 而不是重复提升到主图。该回归证明编译产物结构和执行流可追踪性，不替代用户编辑器/游戏验证。

### 多 OutFlow

复合节点可以有多个执行流出口。当前推荐在 `defineComposite` 中声明 `outflows`，并在 build 中使用 `f.outflow(name, source, sourceOutflowIdx?)` 绑定内部节点出口：

```typescript
const Condition = g.defineComposite('ConditionCheck', {
  inputs: { x: { type: 'int' } },
  outflows: [{ name: 'yes' }, { name: 'no' }],
  outputs: {},
  build: (args, f) => {
    const branch = f.node('double_branch', [args.x])
    f.outflow('yes', branch, 0)
    f.outflow('no', branch, 1)
  }
})
```

`f.outflow(...)` 会记录到 `CompositeCapture.outflowMarks`，再生成 `CompositeDefIR.outflows` 和 `compositePins`。`f.leaf(outflowIndex)` 仍可用，但只是 deprecated 兼容路径，会生成 `outflow_${index}` 这种兼容名称；新文档和新代码不应再依赖旧的 `leafMarks` / `outflowExitNodes` 机制。

**调用方**通过 `connectOutFlowBranch` 连接特定 OutFlow 分支（在下层自动完成）：

```typescript
f.callComposite(Condition, { x: int(-1) })
// 此处 f 内部已自动连接主图的 marker → 分支 fork → 下游
```

---

## 3. 类型安全

`defineComposite` 会把 `inputs` schema 映射为 `build(args)` 中的运行时代理值类型。例如
`entity`、`vec3`、`int` 分别映射为 `entity`、`vec3`、`int`；参数不再退化为 `any`：

```typescript
const GetPivotPosition = g.defineComposite('GetPivotPosition', {
  inputs: { pivot: { type: 'entity' } },
  outputs: { location: { type: 'vec3' } },
  build(args, f) {
    const { location } = f.getEntityLocationAndRotation(args.pivot)
    return { location }
  }
})
```

这里使用 `RuntimeValueTypeMap`，因为 `build` 捕获阶段收到的是带 pin metadata 的代理值，不是调用
参数允许的原生值与代理值联合。当前自动类型回归为
`tests/composite/test-composite-build-input-types.ts`；它直接检查上述实体位置调用，并覆盖
`entity`、`vec3`、`int` 不为 `any`。该回归证明 TypeScript 类型契约，不等同于 GIA 或游戏行为验证。

`defineComposite` 也会保留 `outputs` 的字符串字面量类型，并由 `callComposite` 映射为具体返回值类型：

```typescript
const direction = f.callComposite(GetDirection, { x, y }).value
// outputs.value: { type: 'vec3' } → direction: vec3

const parts = f.split3dVector(direction)
```

这项类型保真同时有两个层面：

- TypeScript/Stage 1：timer callback 中保存复合输出时，编译器可从 handle 的 `__outputs` 读取 `float` / `vec3` 等声明，生成正确的局部变量类型；
- Stage 2/3：输出代理仍携带 `markPin` metadata，生成 OutParam 数据连接；复合输出连接到普通节点时由 Stage 3 的专用 overlay 路径处理。

`CompositeHandle` 同时保留 inputs/outputs 两个 phantom schema。调用侧
`callComposite(handle, inputs)` / `declareDetached(handle, inputs)` 会把直接对象字面量按 handle 的
input schema 检查：已声明字段接受对应的运行时参数值，未知字段和明确错误类型在 TypeScript 阶段被
拒绝；输入整体仍是稀疏的，因此 `{}`、单字段和任意已声明字段子集都合法。调用结果继续按 output
schema 映射，`float` / `vec3` 不会退化为 `generic`。

为兼容 runtime/Stage 1 已经类型化的通用 `value` / `generic` 连接，调用类型只在静态值类型可确定时
拒绝冲突；这不会替代 Stage 2 对实际 runtime value 和节点连接的校验。独立自动类型回归为
`tests/composite/test-composite-call-input-types.ts`，稀疏输入运行时契约由
`test-composite-optional-call-inputs.ts` 保留。这些测试只证明 TypeScript/自动生成契约，不证明编辑器
或游戏行为。

运行时类型映射通过 `composite_registry.ts` 中的 `RUNTIME_TO_GIA_TYPE` 完成：

```typescript
const RUNTIME_TO_GIA_TYPE: Record<string, string> = {
  int: 'int', float_number: 'float', text: 'string',
  bool: 'bool', vec3: 'vec3', entity: 'entity',
  guid: 'guid', prefabId: 'prefab_id',
  configId: 'config_id', faction: 'faction',
}
```

该映射在 `toCompositeDefIR()` 中将运行时值类名转换为 GIA 类型字符串，用于 `ParamFlowDef.type` 字段。

---

> **💡 新版 Raw 控制流 DSL**: [Raw Control-Flow DSL Quickstart](./raw-control-flow-dsl-quickstart.md) 提供了 `f.node()`/`f.link()`/`f.entry()`/`f.outflow()` 作为清理后的低层手动连线 API，是当前版本的低层控制流权威参考。
> - `f.registerExecNode(type, args)` **自动串联**到当前 tail；`f.node(type, args?, opts?)` 创建 **detached** 节点，不自动连线
> - `f.leaf(outflowIdx)` → **`f.outflow(name, source, sourceOutflowIdx?)`**
> - `f.eventMarker()` → **`f.entry()`**（旧名仍可用）
> - `f.linkTo(src, outIdx, tgt, inIdx?)` → **`f.link(src, outIdx, tgt, inIdx?)`**（旧名仍可用）
>
> 旧 API 依然可用，但新建通用控制流复合时优先考虑新 DSL。

## 4. 低层 build API（`registerExecNode` / `leaf` / `branchExec` / `createOutParamValue`）

以下 API 在 `build()` 内部使用，提供比 `f.xxx()` 语法糖更低层的控制。

| API | 作用 | 示例 |
|-----|------|------|
| `f.registerExecNode(type, args)` | 注册执行节点，自动串联到当前 tail | `f.registerExecNode('print_string', [new str('hello')])` |
| `f.leaf(outflowIdx)` | 标记当前 tail 节点为 OutFlow[outflowIdx] 出口 | `f.leaf(0)` |
| `f.branchExec(sourceIdx, record)` | 从当前 tail 分叉创建叶子，不推进 tail | `f.branchExec(0, { type: 'exec', nodeType: 'print_string', args: [new str('出口0')] })` |
| `f.createOutParamValue(type, ref, idx)` | 创建 OutParam 返回值绑定到节点 | `f.createOutParamValue('int', ref, 0)` |

### branchExec 的 record 格式

```typescript
{
  id: 0,                    // 必须为 0（系统自动分配）
  type: 'exec',             // 必须为 'exec'
  nodeType: 'print_string', // 任意节点类型（不仅限于控制流节点）
  args: [new str('文本')]   // 节点参数（value 类型）
}
```

### 关键实现细节

1. **compositePins 是独立路由表** — outer pin 到 inner node pin 是多对多映射；capture 输入可只保留逻辑路由，不生成嵌套调用的物理 InParam
2. **节点 pin 由角色决定** — 同一个 double_branch 在入口处有 OutFlow:0+1+InParam:0，在叶子处只有 0 pin
3. **OutFlow 索引不固定** — 可以是 0/1/2/3...，取决于 edge 的 source_index
4. **impl 节点 ID 自动从 1 重新编号**（捕获 event 节点占 ID 1）
5. **入口节点的 OutFlow pin 自动填充 connects**（按 source_index 拆分为多个 OutFlow pin）
6. **主图 OutFlow pin 由 `graph.flow()` 创建**，不要手动添加
7. **一个 outer InParam 可以 fanout 到多个 inner 节点**（同一输入多处消费）
8. **嵌套复合在 impl 图中为 kind=22001 节点**，执行型有 OutFlow pin，数据型 0 pin

---

## 5. 复合中调用复合

build 回调中可以直接调用其他复合节点。当前捕获流程会递归确保被调复合已捕获，并在外层 impl 图中生成 `kind=22001` 的嵌套复合调用节点。

对于普通的单出口顺序执行，推荐直接写：

```ts
const outer = g.defineComposite('Outer', {
  outflows: ['完成'],
  build(_args, f) {
    f.callComposite(inner, {})
    const tail = f.registerExecNode('print_string', [new str('after')])
    f.outflow('完成', tail, 0)
    return {}
  }
})
```

当前实现会把条件/派发型多出口执行节点后的普通顺序 continuation 默认限制到 `OutFlow[0]`，包括普通
`doubleBranch`、`multipleBranches` 和执行 Composite；编译继续生成并输出
`GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION` warning，提示未使用的出口。warning 建议将每条分支
自己的逻辑移入对应 callback；普通节点也可以使用 `f.node()/f.link()` 显式连线，Composite 还可以
使用 `connectOutFlow(result, index, callback)` 或 `declareDetached()` + `f.link()`。显式 wiring
不触发该 warning。`finiteLoop` / `listIterationLoop` 是已封装的循环 API，普通后续按其明确的
Loop Complete `OutFlow[1]` 继续，不属于默认猜测 `OutFlow[0]` 的条件分支规则。单出口 Composite
仍可在 build 中自然继续到 `OutFlow[0]`，纯数据 Composite 不参与执行 continuation。


```typescript
const inner = g.defineComposite('Inner', {
  inputs: {},
  outputs: {},
  outflows: [
    { name: '第一步', pinIndex: 514 },
    { name: '第二步', pinIndex: 515 },
    { name: '第三步', pinIndex: 516 },
    { name: '第四步', pinIndex: 517 }
  ],
  build(_args, f) {
    const branch = f.node('double_branch', [new bool(true)])
    f.link(f.entry(), 0, branch)
    f.outflow('第一步', branch, 0)
    f.outflow('第二步', branch, 0)
    f.outflow('第三步', branch, 0)
    f.outflow('第四步', branch, 0)
    return {}
  }
})

const outer = g.defineComposite('Outer', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成', pinIndex: 485 }],
  build(_args, f) {
    const nested = f.declareDetached(inner, {})
    const internalTarget = f.node('print_string', [new str('第一步')])

    f.link(f.entry(), 0, nested)
    f.link(nested, 0, internalTarget)
    f.outflow('完成', nested, 3)
    return {}
  }
})
```

关键语义：

- `f.declareDetached(...)` 返回带 `__markerNodeId` 的复合调用 marker，可作为 `f.link(...)` 的源或目标。
- `f.link(nested, 0, target)` 连接嵌套复合的逻辑 `OutFlow[0]`；Stage 3 使用被调复合的 `pinIndex` 编码物理 pin。
- `f.outflow('完成', nested, 3)` 可把嵌套复合的逻辑 `OutFlow[3]` 直接提升为外层复合出口；这种 compositePins 穿透映射已在真实 GIA 中验证。
- 空名默认入口不写 `f.inflow('')`；使用 `f.link(f.entry(), 0, firstNode)`。`f.inflow(name, ...)` 用于有明确名称的多 InFlow 接口。

### 与 detached `f.node()` 混用

`f.callComposite()` 与 `f.node()` 的默认执行流语义不同：执行型 `callComposite()` 会接入当前 tail，
而 `f.node()` 只创建 detached 节点。把 Composite 输出作为 `f.node()` 参数只会建立数据连接，
不会让该执行节点自动运行；必须再用 `f.link()`、`f.inflow()` 或其他控制流 API 把它接入图。

```ts
const queried = f.callComposite(queryCubie, {})
const bind = f.node('switch_follow_motion_device_target_by_entity', [queried.cubie, args.pivot])

f.link(f.entry(), 0, bind)
```

如果业务要求“查询执行完成后再绑定”，查询 Composite 必须声明并在内部绑定 OutFlow，然后显式连接
该 OutFlow；不能假定数据依赖会替代执行顺序。并行从 entry 触发且存在数据依赖的拓扑可以由当前
IR/GIA 表达，但自动结构回归不证明游戏引擎对具体节点组合的运行时调度；这类结论仍需针对候选 GIA
进行编辑器/游戏验证。

如果执行型复合调用后还有语句，复合定义必须同时**声明并绑定**对应出口：

```typescript
const controller = g.defineComposite('二维移动控制器', {
  outflows: ['完成'],
  build(_args, f) {
    const lastNode = f.node('some_exec_node')
    f.link(f.entry(), 0, lastNode)
    f.outflow('完成', lastNode, 0)
    return {}
  }
})
```

只写 `outflows: ['完成']` 而不调用 `f.outflow(...)` 仍不会生成有效出口。Stage 3 检测到调用点存在下游执行边、但定义缺少对应 OutFlow 时，会报
`GSTS-COMPOSITE-MISSING-OUTFLOW`，并在诊断中提供上述语法修复方向；这避免生成“数据线仍连接、白色执行线断开”的 GIA。如果复合本来就应终止执行，则应移除或移动调用后的语句，而不是虚构出口。

针对性回归：`tests/composite/test-nested-composite-outflow.ts` 验证 IR compositePin 和解码后嵌套调用的物理 OutFlow pin；`tests/composite/test-stage3-p4w3-call-lowerer-contract.ts` 验证缺失声明的编译诊断。

---

## 6. 代码示例

### 5.1 简单 exec-only 复合

```typescript
export const LogAndAdd = g.defineComposite('LogAndAdd', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { sum: { type: 'int' } },
  build: (args, f) => {
    f.log(args.a)
    const sum = f.add(args.a, args.b)
    return { sum }
  }
})
```

### 5.2 纯数据复合（无 exec 节点）

```typescript
export const Triple = g.defineComposite('Triple', {
  inputs: { x: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: (args, f) => {
    const result = f.add(args.x, f.mul(args.x, int(2)))  // x + x*2
    return { result }
  }
})
```

`isPureData = true` → 调用方注册 `__composite_call__` 作为 data 类型节点，不推进调用方的执行流。

### 5.3 分支回调不能作为运行时值合流

`f.doubleBranch(condition, yes, no)` 捕获的是两条**执行路径**。在 `yes` / `no` 回调中给普通
TypeScript 局部变量赋值，不会生成运行时的 phi/select 值，也不能把两条路径中的不同数据结果自动
合并到分支后的 `return`：

```typescript
// 错误：value 是捕获 build() 时的 JS 局部变量，不是游戏运行时的条件选择值。
let value = args.a
f.doubleBranch(
  f.greaterThan(args.b, args.a),
  () => { value = args.b },
  () => {}
)
return { value }
```

如果目标是纯数据选择，应使用具有数据输出语义的节点。例如四个浮点值取最大值：

```typescript
const ab = f.takeLargerValue(args.a, args.b)
const cd = f.takeLargerValue(args.c, args.d)
return { value: f.takeLargerValue(ab, cd) }
```

这种实现保持 `isPureData = true`，主图白色控制流会绕过该复合，输出通过数据连线进入消费者。
如果目标确实是根据条件执行不同副作用，则保留 `doubleBranch`，并将后续副作用放在各自分支中，
不要假设分支后的普通 TS 局部变量已经完成运行时合流。

证据边界：2026-07-16 的最小 GIA 自动回归和用户编辑器/游戏测试已验证“纯数据复合绕过执行流 +
三次 `takeLargerValue` 合并四值”这一模式；该单一样本不自动证明所有数据类型或任意控制流拓扑。

### 5.4 exec 复合 + data 复合串联

```typescript
const Triple = g.defineComposite('Triple', { ... })   // pure data
const Log = g.defineComposite('Log', {                 // exec
  inputs: { x: { type: 'int' } },
  outputs: {},
  build: (args, f) => { f.log(args.x) }
})

g.server({}).on('playerLogin', (evt, f) => {
  const { result } = f.callComposite(Triple, { x: int(5) })
  f.callComposite(Log, { x: result })
})
```

编排：data exec → exec exec，compositeDataEdges 记录跨复合数据流。
