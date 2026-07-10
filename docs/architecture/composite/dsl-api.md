# DSL API：复合节点的语法糖与类型系统

> 状态：当前实现
> 来源：当前代码实现
> 最近校验：2026-07-06
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

`defineComposite` 返回 `CompositeHandle`——一个携带 `__composite` brand 的轻量句柄：

```typescript
type CompositeHandle = {
  readonly __composite: true
  readonly name: string
  readonly id: number          // 从 1610700000 递增分配
  readonly definition: CompositeDefinition
}
```

`id` 在 `CompositeRegistry.define()` 中分配，全局唯一。句柄可作为 `f.callComposite()` 的第一个参数。

---

## 2. 调用 API：`f.callComposite`

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

### 返回值解构

返回值是捕获阶段构造的代理值对象。每个属性通过 `markPin(markerRecord, 'output', outIdx)` 绑定到主图 `__composite_call__` 节点的 OutParam pin，因此调用方可以直接将其传递给下游节点。

内部实现创建一个带 `__markerNodeId` 隐藏属性的代理对象，供 `connectOutFlowBranch` 处理多 OutFlow 时使用。

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

`defineComposite` 的 TypeScript 泛型签名：

```typescript
function defineComposite<
  Inputs extends Record<string, { type: any }>,
  Outputs extends Record<string, { type: any }>
>(name: string, def: { inputs: Inputs, outputs: Outputs, build: ... }): CompositeHandle
```

但当前 `Inputs` 和 `Outputs` 中 `{ type: any }` 的 `type` 字段是 `string` 类型而非精确字符串字面量，因此类型安全主要在运行时保证——参数类型不匹配会在阶段二执行时报错。

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

1. **compositePins 是独立路由表** — outer pin 到 inner node pin 是多对多映射，不要求 inner pin 在 impl 图中实际存在
2. **节点 pin 由角色决定** — 同一个 double_branch 在入口处有 OutFlow:0+1+InParam:0，在叶子处只有 0 pin
3. **OutFlow 索引不固定** — 可以是 0/1/2/3...，取决于 edge 的 source_index
4. **impl 节点 ID 自动从 1 重新编号**（捕获 event 节点占 ID 1）
5. **入口节点的 OutFlow pin 自动填充 connects**（按 source_index 拆分为多个 OutFlow pin）
6. **主图 OutFlow pin 由 `graph.flow()` 创建**，不要手动添加
7. **一个 outer InParam 可以 fanout 到多个 inner 节点**（同一输入多处消费）
8. **嵌套复合在 impl 图中为 kind=22001 节点**，执行型有 OutFlow pin，数据型 0 pin

---

## 5. 复合中调用复合

build 回调中可以直接调用其他复合节点。当前捕获流程会递归确保被调复合已捕获，并在外层 impl 图中生成 `kind=22001` 的嵌套复合调用节点：

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

针对性回归：`tests/composite/test-nested-composite-outflow.ts` 同时验证 IR compositePin 和解码后嵌套调用的物理 OutFlow pin。

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

`isPureData = true` → 调用方注册 `__composite_call__` 作为 data 类型节点。

### 5.3 exec 复合 + data 复合串联

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
