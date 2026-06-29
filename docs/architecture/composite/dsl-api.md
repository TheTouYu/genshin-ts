# DSL API：复合节点的语法糖与类型系统

> 本文档聚焦于 `g.defineComposite` / `f.callComposite` 的用户面 API 设计、类型约束及使用模式。
> 参见：[捕获机制](./composite/capture-mechanism.md) | [IR 表示](./composite/ir-representation.md) | [管线追踪](./composite/pipeline-flow.md)

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

复合节点可以有多个执行流出口。build 中使用 `f.leaf(outflowIndex)` 标记：

```typescript
const Condition = g.defineComposite('ConditionCheck', {
  inputs: { x: { type: 'int' } },
  outputs: {},
  build: (args, f) => {
    const cond = f.greaterThan(args.x, f.int(0))
    f.doubleBranch(cond,
      () => { f.leaf(0) },    // x > 0 → OutFlow 0
      () => { f.leaf(1) }     // else → OutFlow 1
    )
  }
})
```

`f.leaf(outflowIndex)` 将当前执行尾节点与指定的 outflow index 关联。该信息记录在 flow 的 `__leafMarks` 临时存储中，捕获时收集到 `CompositeCapture.leafMarks`。

若未显式调用 `leaf()`，捕获阶段自动检测叶子节点（有 exec 产出但无下游边的节点），若超过 1 个则按 execNodes 中的顺序生成 `outflowExitNodes`。

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

## 4. 复合中调用复合

build 回调中可以调用其他复合节点。此时需要**嵌套的独立捕获**：

```typescript
const A = g.defineComposite('A', {
  inputs: { x: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: (args, f) => {
    const r = f.add(args.x, int(1))
    return { result: r }
  }
})

const B = g.defineComposite('B', {
  inputs: { x: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: (args, f) => {
    // ❌ 不能直接在这里用 f.callComposite(A, ...)
    // f 是捕获 registry 的 fns，不携带复合调用能力
    // 实际使用需确保 fns 被正确注入
  }
})
```

当前嵌套复合的捕获机制仍在持续完善——捕获阶段 `runCompositeCall` 需要独立的 `MetaCallRegistry`，而 build 回调中的 `f` 已经是捕获目的 registry，不支持再发起新的复合调用捕获。

---

## 5. 代码示例

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
