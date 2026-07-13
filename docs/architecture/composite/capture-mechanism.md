# 捕获机制：复合节点的核心创新

> 状态：当前实现 / 部分旧例需迁移
> 来源：当前代码实现
> 最近校验：2026-07-06
> 适用范围：gsts 当前复合捕获机制。若正文出现 `leafMarks` / `outflowExitNodes`，按当前实现理解为历史字段；当前权威结构是 `inflowMarks` / `outflowMarks`。

> 本文档详细描述复合节点在阶段二执行期间如何通过"捕获"（Capture）机制将 build 回调中的节点创建操作记录为独立的子图结构。
> 参见：[DSL API](./dsl-api.md) | [IR 表示](./ir-representation.md) | [管线追踪](./pipeline-flow.md)

---

## 1. 设计动机

复合节点的 build 回调在 JavaScript 层面其实就是一段普通的函数执行。问题在于：这段函数调用的 `f.method()` 需要被**同时记录在两个地方**——主图的 `__composite_call__` 标记节点，以及复合定义的内部实现节点。

捕获机制的核心思路：
1. 在**独立的 `MetaCallRegistry`** 中执行 build 回调
2. build 执行过程中 `f.method()` 创建的所有节点被隔离地记录到这个独立 registry 的 flow 中
3. 执行结束后，从该 flow 提取节点列表、连线、输出值元数据，打包为 `CompositeCapture`

```
主图执行流                        复合捕获流
┌──────────────────┐            ┌──────────────────┐
│ eventNode        │            │ __composite_     │
│ → __composite_   │            │  capture__       │
│   call__ (marker)│            │   (root)         │
│ → nextNode       │            │ → f.add(...)     │
└──────────────────┘            │ → f.log(...)     │
                                │ → ...            │
                                └──────────────────┘
                                      │
                                      ▼
                               CompositeCapture
                               { execNodes, dataNodes,
                                 edges, outputValues,
                                 isPureData }
                                      │
                                      ▼
                               CompositeDefIR
```

---

## 2. CompositeRegistry

全局单例 `src/runtime/composite_registry.ts`：

```typescript
export const compositeRegistry = new CompositeRegistry()
```

核心职责：
- `Map<string, CompositeDefinition>` 按名称存储所有注册的复合定义
- `define(name, def)` 注册新复合，返回 `CompositeHandle`
- 自增 ID 分配，起始于 `1610700000`
- `toCompositeDefIR(capture?)` 将捕获结果转换为 IR 表示

### CompositeDefinition

```typescript
type CompositeDefinition = {
  readonly name: string
  readonly id: number
  readonly inputs: Record<string, CompositeParamDef>
  readonly outputs: Record<string, CompositeParamDef>
  readonly build: (...args: any[]) => any
  captured: CompositeCapture | null    // 捕获后填充
  toCompositeDefIR(capture?): CompositeDefIR
}
```

`captured` 初始为 `null`，在 `buildServerGraphRegistriesIRDocuments()` 中首次执行 build 后填充。

---

## 3. CompositeCapture 数据结构

构建后的捕获结果：

```typescript
type CompositeCapture = {
  execNodes: MetaCallRecord[]          // build 中创建的所有 exec 节点
  dataNodes: MetaCallRecord[]          // build 中创建的所有 data 节点
  edges: Record<number, NextConnection[]>  // 节点间执行流连线
  outputValues: Record<string, value>  // build 返回值的 pin 元数据
  isPureData: boolean                  // execNodes 为空时为 true
  inflowMarks?: Array<{ name: string; innerNodeId: number; inflowPinIndex: number }>
  outflowMarks?: Array<{ name: string; innerNodeId: number; outflowPinIndex: number }>
}
```

`f.leaf(i)` 仍是兼容路径，但新代码应使用 `f.outflow(name, ref, outflowPinIndex?)`；多入口复合使用 `f.inflow(name, ref, inflowPinIndex?)`。

### 3.1 `__composite_capture__` 根节点

捕获流程启动时创建一个特殊的 event 节点作为流根节点：

```typescript
// core.ts:startCaptureFlow()
eventNode: {
  id: eventId,
  type: 'event',
  nodeType: '__composite_capture__',
  args: []
}
```

该节点是捕获流的**入口锚点**，在 `toCompositeDefIR()` 遍历 `implNodes` 时被跳过（不参与 compositePins 映射）。在 GIA 编码阶段也被 `buildImplNodePins` 跳过（不生成实际节点）。

### 3.2 isPureData 判定

捕获完成后检查 `flow.execNodes.length === 0`。若为 true：

- 复合定义不生成 InFlow/OutFlow 引脚
- 调用方在 `runCompositeCall` 中将 `__composite_call__` 注册为 data 类型节点（而非 exec 类型）
- 在主图中标记节点作为 data 节点，不参与执行流

---

## 4. 捕获流程详解

捕获发生在 `buildServerGraphRegistriesIRDocuments()` 函数中（`src/runtime/core.ts:1454`），**在主线图 IR 文档构建之前或之中**。

### 4.1 第一阶段：捕获复合定义

```typescript
for (const def of compositeRegistry.getAll()) {
  if (!def.captured) {
    // 1. 创建临时 MetaCallRegistry
    const captureRegistry = new MetaCallRegistry('entity', 'beyond', undefined, undefined, false)
    captureRegistry.startCaptureFlow()

    // 2. 创建带 __captureInputName 标记的占位输入值
    const inputs: Record<string, value> = {}
    for (const [name, param] of Object.entries(def.inputs)) {
      const v = createTypedValue(param.type as string)
      ;(v as any).__captureInputName = name  // ← 标记供 compositePin 映射
      inputs[name] = v
    }

    // 3. 设置 gsts 上下文，执行 build
    const fns = new ServerExecutionFlowFunctions(captureRegistry)
    gsts[kServerF] = fns
    const outputs = def.build(inputs, fns)

    // 4. 从 flow 提取捕获结果
    const flow = captureRegistry.getFlows()[0]
    def.captured = {
      execNodes: flow.execNodes,
      dataNodes: flow.dataNodes,
      edges: flow.edges,
      outputValues: outputs ?? {},
      isPureData: flow.execNodes.length === 0,
      inflowMarks: flow.__inflowMarks,
      outflowMarks: flow.__outflowMarks
    }
  }
}
```

**关键细节：** 第一阶段在主图 build 之前执行，确保了主图中 `f.callComposite()` 执行时所有被调用的复合已有捕获数据。

### 4.2 `__captureInputName` 标记

输入占位值创建时被附加 `__captureInputName` 属性。当该占位值作为 `f.method()` 的参数传递时，`ir_builder` 将其记录在 args 中。后续 `toCompositeDefIR()` 扫描所有 `implNodes` 的 args，匹配 `__captureInputName` 建立 `InParam` 类型的 `compositePinEntry`：

```
外层输入 x (InParam index=0)
  └─ 内节点 5 的 arg[2] 上有 { __captureInputName: 'x' }
     → compositePins: [{ outerPinKind: 3, outerPinIndex: 0,
                          innerNodeId: 5, innerPinKind: 3, innerPinIndex: 2 }]
```

同一输入可在多处消费（如 `f.add(input, input)`），每个消费点产生一条 `compositePinEntry`。

### 4.3 Definition 输入与 call-site binding 分离

当前实现把两个层次分开：

- **definition capture**：`ensureCompositeCaptured()` 以及 `runCompositeCall()` /
  `runDetachedCompositeCall()` 均通过 `createCompositeCaptureInputs(def)`，为 `def.inputs` 的每个声明输入创建带
  `__captureInputName` 的 typed placeholder。因此 child `build(inputs, f)` 可稳定消费全部声明输入，不依赖某一次
  调用实际传了哪些键。
- **call-site binding**：调用实参只由 `buildCompositeCallArgs()` 写入 `__composite_call__` marker 的 args 与
  `compositeInputIndices`。Stage 3 仅为实际绑定项物化 physical InParam；未传项不被补成 literal、ordinary edge 或
  capture route。

这对应真实 `调用参数.gia` 的同一 CompositeDef 被 first-only、second-only、both、empty 四次调用的结构。它是
所有 composite 的定义/调用结构契约，不是 float 专属规则；但不同类型的 concrete wrapper、wire presence 与未绑定输入
参与游戏计算时的运行时结果仍需逐族验证。

自动回归：`tests/composite/test-composite-optional-call-inputs.ts`（direct call）和
`tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts`（nested vendor gate）。用户编辑器已核验后者的
四分支 candidate；未注入。

### 4.4 返回值处理

build 返回值被记录到 `outputValues`。在 `toCompositeDefIR()` 中，遍历 outputs 声明，对每个 output 名从 `outputValues` 中取出值，通过其 `getMetadata()` 获取 pin 信息，建立 `OutParam` 映射：

```typescript
if (meta && meta.kind === 'pin') {
  pins.push({
    outerPinKind: 4,          // OutParam
    outerPinIndex: i,         // 复合定义的第 i 个输出
    innerNodeId: meta.record.id,  // 产生该输出的内部节点 ID
    innerPinKind: 4,          // OutParam
    innerPinIndex: meta.pinIndex  // 内部节点的 OutParam pin 索引
  })
}
```

### 4.5 InFlow / OutFlow 显式标记

当前实现使用显式标记生成复合控制流接口：

1. **`inflowMarks`**：build 中调用 `f.inflow(name, ref, inflowPinIndex?)`，把外部 InFlow 映射到内部节点 InFlow。
2. **`outflowMarks`**：build 中调用 `f.outflow(name, ref, outflowPinIndex?)`，把内部节点 OutFlow 暴露为外部 OutFlow。
3. **兼容路径**：`f.leaf(i)` 会写入 `outflowMarks`，名称为 `outflow_${i}`，仅用于旧代码兼容。
4. **默认路径**：没有显式 InFlow/OutFlow 时，执行型复合仍会生成单入口/单出口的默认接口。

---

## 5. toCompositeDefIR() 转换

`CompositeDefinition.toCompositeDefIR()` 将 `CompositeCapture` 转换为纯数据结构的 `CompositeDefIR`，包括：

1. **compositePins 构建**：InFlow（根节点映射）、OutFlow（上节逻辑）、InParam（`__captureInputName` 扫描）、OutParam（outputValues 元数据）
2. **implNodes 转换**：execNodes + dataNodes 合并，每个节点的 args 转为 IR 字面量或 `conn` 类型
3. **implEdges 原样传递**：`Record<number, NextConnection[]>`
4. **引脚索引常量**：InFlow 单=1974/多=6、OutFlow 单=4/多基=8、InParam 基=100、OutParam 基=200

### args 中 conn 类型的检测

对于每个 arg，检查其 `getMetadata()`：

```typescript
if (meta?.kind === 'pin') {
  // 是其他节点的输出引用 → 转为 conn 类型
  return { type: 'conn', value: { node_id: meta.record.id, index: meta.pinIndex, type: giaType } }
}
return a.toIRLiteral()  // 字面量值
```

---

## 6. 首次调用与空 trigger 图

`buildServerGraphRegistriesIRDocuments()` 中捕获复合定义是**首次执行**——此时还没有任何主图 handler 事件触发。捕获完全发生在"空 trigger 图"上：独立 registry → startCaptureFlow → build → 收集结果。复合定义的捕获不依赖事件触发，这使得复合节点本质上是**惰性捕获**的。

这种设计的优势：复合定义的捕获是**一次性的**（`if (!def.captured)` 守卫），后续的 `f.callComposite` 在主图中直接引用已捕获的定义，不会重复执行 build。
