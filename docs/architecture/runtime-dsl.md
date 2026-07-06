# 运行时与 DSL 层

> 状态：当前实现 / 部分章节过期
> 来源：当前代码实现
> 最近校验：2026-07-06
> 适用范围：gsts 当前 runtime/DSL 架构说明；复合节点低层控制流以 raw-control-flow-dsl-quickstart.md 为准。

> 本文档描述 genshin-ts 的运行时（Runtime）和 DSL（领域特定语言）层——这是用户直接编写的 API 以及 IR 构建的基础设施。

---

## 1. 概述

运行时（`src/runtime/`）提供三样核心能力：

1. **DSL API**（`core.ts`）：`g.server()`、`gstsServer*`、`defineComposite` 等用户可见的 API
2. **值类型系统**（`value.ts`）：int、float、str、vec3、entity、list、dict 等类型
3. **IR 构建**（`ir_builder.ts`）：DSL 调用如何在底层创建节点和连线

运行时代码**既在 Transform 阶段 1 中被引用（类型信息），也在阶段 2 中被实际执行**。

---

## 2. DSL API：core.ts

### 2.1 `g.server()` API

```typescript
// 用户写法
g.server({
  name: 'MyGraph',
  mode: 'beyond',      // 超限模式（默认）
  sub_type: 'entity',  // 子类型（entity/status/class/item）
  uid: 100000001
}).on('playerLogin', (evt, f) => {
  // handler body
})
```

`g` 是通过 `globalThis.gsts` 暴露的全局 DSL 实例。`g.server()` 会注册一个 `ServerGraphRegistry`，包含：

- 图元数据（name、mode、sub_type、uid、graphId 等）
- 事件绑定（`on` / `onSignal`）
- 变量定义
- 复合节点定义

`on(event, handler)` 将一个函数 handler 绑定到指定游戏事件（如 `'playerLogin'`、`'timeScaleChange'`）：

- 两个参数时：`on(eventName: string, handler: (evt, f) => void)`——标准事件
- 三个参数 + `SignalDefinition`：`on(signalDef, meta, handler)`——信号事件
- 可通过 `.mode('classic')` 切换到经典模式

### 2.2 `gstsServer*` 函数

```typescript
// 用户写法——可复用的服务器端函数
function gstsServerAdd(a: number, b: number) {
  return a + b
}

g.server({}).on('playerLogin', (evt, f) => {
  const result = f.callGstsServer(gstsServerAdd, evt, a, b)
})
```

规则：
- 必须以 `gstsServer` 开头
- 必须在文件顶层声明（不能在回调内部）
- 不能递归
- 只允许一个尾随 return
- return 必须有值

### 2.3 `g.server().onSignal()` API

```typescript
// 定义信号
const MySignal = defineSignal('my_custom_signal', [
  ['target', 'entity'],
  ['value', 'int']
])

g.server({}).onSignal(MySignal, {
  signal: MySignal,
  filters: { sourceType: 'any' }
}, (evt, f) => {
  const value = evt.params.value
})
```

`defineSignal` 创建一个类型安全的信号定义，包含信号名称和参数列表。

### 2.4 `defineComposite` / `callComposite`

```typescript
// 定义复合节点
export const DoubleHandle = g.defineComposite('Double', {
  inputs: [{ name: 'x', type: 'int' }],
  outputs: [{ name: 'result', type: 'int' }],
  build(f, args) {
    const result = f.add(args.x, args.x)
    return { result }
  }
})

// 调用复合节点
g.server({}).on('playerLogin', (evt, f) => {
  const { result } = f.callComposite(DoubleHandle, { x: int(42) })
})
```

详见 [复合节点支持](#6-复合节点系统)。

---

## 3. 值类型系统：value.ts

`src/runtime/value.ts` 定义了所有可在节点图中传递的值类型。

### 3.1 基础类型

```typescript
// 每个类型都是 TS 类，可实例化为"值对象"
bool(value: boolean)     → new bool(value)
int(value: number)       → new int(value)
float(value: number)     → new float(value)
str(value: string)       → new str(value)
vec3(x, y, z)            → new vec3(x, y, z)
guid(value: string)      → new guid(value)
entity(value: number)    → new entity(value)
prefabId(value: number)  → new prefabId(value)
configId(value: number)  → new configId(value)
faction(value: number)   → new faction(value)
```

### 3.2 复合类型

```typescript
list(type: string, values?)     → 列表
dict(kType, vType, entries?)   → 字典
struct(entries)                 → 结构体
enumeration(value, className)  → 枚举
generic(value)                  → 泛型（需 asType() 具体化）
```

### 3.3 特殊类型

```typescript
localVariable(name, value)           → 节点图局部变量引用
customVariableSnapshot(name, value)  → 自定义变量快照
```

### 3.4 类型映射

```typescript
// 运行时类 → GIA 类型字符串
RUNTIME_TO_GIA_TYPE = {
  bool: 'bool',
  int: 'int',
  float_number: 'float',
  text: 'string',
  vec3: 'vec3',
  entity: 'entity',
  // ...
}
```

### 3.5 类型工厂

所有值类型都继承自 `value` 基类，核心属性：

```typescript
class value {
  metadata: ValueMetadata    // 携带 pin/k 元数据（用于 IR 构建追踪）
  getClassName(): string     // 返回运行时类型名（如 'int', 'vec3'）
}
```

---

## 4. IR 构建器：ir_builder.ts

`src/runtime/ir_builder.ts` 是 DSL 层和 IR 表示之间的桥梁。

### 4.1 核心功能

当用户代码中执行 `f.add(a, b)` 时，`ir_builder` 会：

1. **创建节点**：分配唯一 ID，记录节点类型名（`'addition'`）
2. **建立值连接**：如果 a 或 b 是其他节点的输出，记录数据连线
3. **建立执行流连接**：记录当前节点的 next 指向后续节点
4. **记录元数据**：追踪值引用、变量绑定关系

```typescript
// f.add(a, b) 在内部大致等价于：
const nodeId = nextId++
recordNode(nodeId, 'addition', {
  args: [
    buildArgument(a),  // a 可能是字面量或 conn 引用
    buildArgument(b)
  ]
})
connectExec(prevNodeId, nodeId)  // 执行流：上一步 → 当前
```

### 4.2 buildConnectionArgument

当一个参数是其他节点的输出引脚引用时，创建 `ConnectionArgument`：

```typescript
{ type: 'conn', value: { node_id: srcNodeId, index: srcPinIndex, type: valueType } }
```

### 4.3 buildIRDocument

收集所有节点和连线，组装为 `IRDocument`：

```typescript
function buildIRDocument(registry): IRDocument {
  // 遍历 registry.execFlowNodes/dataNodes/edges
  // 对 exec 节点：记入 nodes[].next
  // 对 data 节点：记入 nodes[].args（含 conn 参数）
  // 对变量：记入 variables[]
  // 对复合节点：记入 compositeDefs[] / compositeCalls[]
}
```

### 4.4 执行流图构建

阶段三中 `layout.ts` 的 `buildExecutionGraph` 会重新处理 IR 节点：

```typescript
// 遍历 nodes 数组：
// - node.next → 执行流边（execEdges）
// - node.args 中类型为 conn 的 → 数据流边（dataConsumersMap）
// - 计算每个节点的入度
// - 入度为 0 且有 next 的节点 → 根节点（roots）
```

---

## 5. 变量系统：variables.ts

`src/runtime/variables.ts` 定义节点图变量的运行时表示。

### 5.1 变量类型

```typescript
type NodeGraphVarApi = {
  localVariable: LocalVariableHandle  // 局部变量句柄
  value: ValueType                     // 当前值（读取端）
  // 通过 localVariable 写入
  // 通过 value 读取
}

type VariablesDefinition = {
  name: string          // 变量名
  type: string          // 类型（如 'int', 'int_list'）
  defaultValue?: any    // 默认值
}
```

### 5.2 变量生命周期

```typescript
// 声明：initLocalVariable('int') → 创建局部变量
const x = gsts.f.initLocalVariable('int')
// 写入：setLocalVariable(x.localVariable, 42)
gsts.f.setLocalVariable(x.localVariable, 42)
// 读取：x.value 自动指向当前值
f.log(gsts.f.addition(x.value, 1))
```

变量通过 `LocalVariable` 类型在 IR 中表示为特殊节点：

```typescript
{ id: nodeId, type: 'set_local_variable', args: [connToValue] }
{ id: nodeId, type: 'get_local_variable' }  // 输出连接到读取端
```

---

## 6. 复合节点系统

### 6.1 注册中心：composite_registry.ts

`src/runtime/composite_registry.ts` 管理复合节点的注册和捕获。

```typescript
// 注册表
const compositeRegistry = new Map<string, CompositeDefinition>()

// 定义 API（通过 g.defineComposite）
g.defineComposite(name, {
  inputs: [{ name: 'x', type: 'int' }],
  outputs: [{ name: 'result', type: 'int' }],
  build(f, args) {
    // build 函数中创建的节点和连线被"捕获"
    const result = f.add(args.x, args.x)
    return { result }
  }
})
```

### 6.2 捕获机制

> 状态：部分过期
> 来源：历史实现说明
> 最近校验：2026-07-06
> 说明：下面的 `CompositeCapture` 示例说明捕获意图；当前权威字段是 `inflowMarks` / `outflowMarks`，并通过 `f.inflow()` / `f.outflow()` 显式绑定多 InFlow / 多 OutFlow。

`build` 函数执行时，所有通过 `f.method()` 创建的节点被记录到 `CompositeCapture` 中：

```typescript
type CompositeCapture = {
  execNodes: MetaCallRecord[]       // 所有可执行节点
  dataNodes: MetaCallRecord[]       // 所有数据节点
  edges: Record<number, NextConnection[]>  // 节点间的执行连线
  outputValues: Record<string, value>     // build 返回的输出值
  isPureData: boolean               // 是否为纯函数（无 exec 节点）
  inflowMarks?: Array<{ name: string; innerNodeId: number; inflowPinIndex: number }>
  outflowMarks?: Array<{ name: string; innerNodeId: number; outflowPinIndex: number }>
}
```

### 6.3 IR 编码

复合节点定义在 IR 中表示为：

```typescript
type CompositeDefIR = {
  id: number                 // 复合节点唯一 ID
  name: string               // 名称
  inputs: CompositePinEntry[]   // 输入引脚
  outputs: CompositePinEntry[]  // 输出引脚  
  inflows: CompositePinEntry[]  // 执行流入引脚
  outflows: CompositePinEntry[] // 执行流出引脚
  nodes: IRNode[]               // 内部节点
  // ...（内部连接信息）
}

type CompositeCallMeta = {
  markerNodeId: number       // __composite_call__ 标记节点 ID
  compositeId: number        // 对应的 CompositeDefIR.id
}
```

在阶段三中，`CompositeDefIR` 被编码为 GIA 文件的 accessories（附件数据段），通过 `composite.ts` 的 `buildCompositeAccessories` 函数执行。

---

## 7. 全局注册表：server_globals.ts

`src/runtime/server_globals.ts` 维护全局状态：

```typescript
// 所有 g.server() 注册的图定义
let serverGraphRegistries: GraphRegistry[] = []

// 安装全局 gsts 对象
function installServerGlobals() {
  globalThis.gsts = {
    server: (opts) => new ServerBuilder(opts),
    // 预置的 f 方法集
    f: { add, subtract, log, ... }
  }
}
```

每个 `.gs.ts` 文件通过 `installServerGlobals()` 获取 `globalThis.gsts` 引用，然后在阶段二执行时收集到注册表中。
