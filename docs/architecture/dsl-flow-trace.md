# 高阶 DSL 业务流程全编译跟踪：实体创建 → ID 判断 → 日志输出

> 本文档追踪一个具体业务逻辑在编译管线中的完整旅程：
> **"当某个实体被创建时，如果该实体的 GUID 等于 133434，则打印一条日志。"**
>
> 从用户编写的高阶 DSL 代码开始，依次经历 Stage 1（TS → .gs.ts 变换）、Stage 2（.gs.ts → IR JSON 执行），最终揭示每个阶段代码的形态和映射关系。

---

## 目录

1. [用户侧的高阶 DSL 代码](#1-用户侧的高阶-dsl-代码)
2. [Stage 1 变换：高阶 DSL → 低阶节点函数调用](#2-stage-1-变换高阶-dsl--低阶节点函数调用)
3. [变换后的 .gs.ts 代码](#3-变换后的-gsts-代码)
4. [Stage 2 执行：.gs.ts → IR JSON](#4-stage-2-执行gsts--ir-json)
5. [IR JSON 产物结构](#5-ir-json-产物结构)
6. [Stage 3：IR JSON → .gia 二进制](#6-stage-3ir-json--gia-二进制)
7. [运行时行为：在游戏中执行](#7-运行时行为在游戏中执行)
8. [总结：全流程数据流](#8-总结全流程数据流)

---

## 1. 用户侧的高阶 DSL 代码

这是开发者编写的 TypeScript 源码，使用 `g.server().on()` 高阶 DSL 语法编写：

```typescript
// my-logic.ts
import { g } from 'genshin-ts/runtime/core'
import { guid } from 'genshin-ts/runtime/value'

g.server({ name: 'EntityLogger' })
  .on('whenEntityIsCreated', (evt, f) => {
    // 高阶语法：=== 运算符、if/else 控制流
    if (evt.eventSourceGuid === new guid(133434)) {
      f.printString(str('Entity 133434 created!'))
    }
  })
```

### 1.1 语法要素拆解

| 语法要素 | 类别 | 含义 |
|---------|------|------|
| `g.server({...})` | 高阶 DSL | 创建一个 Server 图定义 |
| `.on('whenEntityIsCreated', handler)` | 高阶 DSL | 绑定实体创建事件处理器 |
| `(evt, f) => { ... }` | 高阶 DSL | 事件回调参数约定：evt = 事件负载，f = 执行流函数 |
| `evt.eventSourceGuid` | 事件属性 | 从事件负载中读取被创建实体的 GUID |
| `new guid(133434)` | 值构造 | 创建一个 GUID 字面量（编译期确定的值） |
| `===` | 运算符 | 等价比较，将被映射为 `f.equal()` 节点 |
| `if (...) { ... }` | 控制流 | 条件分支，将被"拍平"为 `f.doubleBranch()` |
| `f.printString(...)` | 节点函数 | 打印字符串到日志 |

### 1.2 `whenEntityIsCreated` 事件的负载定义

来自 `src/definitions/events.ts`，这个事件携带两个参数：

```typescript
whenEntityIsCreated: [
  { name: 'eventSourceEntity', typeBase: entity, typeName: 'entity', isArray: false },
  { name: 'eventSourceGuid',   typeBase: guid,   typeName: 'guid',   isArray: false }
]
```

- `evt.eventSourceEntity` — 被创建的实体句柄（`entity` 类型）
- `evt.eventSourceGuid` — 被创建实体的全局唯一标识符（`guid` 类型）

---

## 2. Stage 1 变换：高阶 DSL → 低阶节点函数调用

Stage 1 的核心工作是**消去语法糖**——把 TS 语言层面的便利设施（`if`、`===`、链式调用等）转换为直接操作节点的函数调用。

### 2.1 变换矩阵

以下表格展示了本例中每个高阶语法结构如何被变换：

| 高阶 DSL（输入） | 变换位置 | 低阶节点调用（输出） |
|-----------------|---------|---------------------|
| `g.server({name:'EntityLogger'}).on(...)` | `index.ts` 匹配 `isServerOnCall` → 递归 `transformHandler` | handler 体被变换，`g.server().on()` 整体保留（仅 handler 内部被重写） |
| `if (cond) { body }` | `stmt.ts` `transformBlockStatements` | `f.doubleBranch(cond, () => { body }, () => {})` |
| `a === b` | `expr.ts` / `ops.ts` 识别 `===` | `f.equal(a, b)` |
| `evt.eventSourceGuid` | 保持原样 | 保留属性访问（在运行时从 `evt` 对象读取） |
| `new guid(133434)` | `expr.ts` 值构造变换 | 保留字面量构造（在运行时创建 `guid` 对象） |
| `f.printString(str('...'))` | 保留不变 | `f.printString(...)` 已经是节点函数调用，直接保留 |

### 2.2 `if` 语句的拍平（关键变换）

这是最重要的变换之一。打开 `src/compiler/ts_to_gs_transform/stmt.ts` 第 1019 行：

```typescript
if (ts.isIfStatement(s)) {
  const cond = transformExpression(env, context, s.expression)
  const tBlock = transformBlock(nestReturnEnv(env), context, asBlock(s.thenStatement))
  const fBlock = s.elseStatement
    ? transformBlock(nestReturnEnv(env), context, asBlock(s.elseStatement))
    : ts.factory.createBlock([], true)  // 无 else → 空块
  const call = makeFCall(env, 'doubleBranch', [
    cond,
    ts.factory.createArrowFunction(..., tBlock),  // then 分支 → 箭头函数
    ts.factory.createArrowFunction(..., fBlock)   // else 分支 → 箭头函数
  ])
  out.push(ts.factory.createExpressionStatement(call))
}
```

变换逻辑：

1. **条件表达式** `cond` 被递归变换（`===` → `f.equal()`）
2. **then 分支**整个被包裹成一个无参箭头函数 `() => { ... }`
3. **else 分支**同理，没有 else 则生成一个空箭头函数
4. 三者组装为 `f.doubleBranch(cond, thenFn, elseFn)` 函数调用

效果对比：

```
// 变换前（TS 源码）
if (evt.eventSourceGuid === new guid(133434)) {
  f.printString(str('Entity 133434 created!'))
}

// 变换后（概念上相当于）
f.doubleBranch(
  f.equal(evt.eventSourceGuid, new guid(133434)),
  () => { f.printString(str('Entity 133434 created!')) },
  () => {}
)
```

### 2.3 `===` 运算符的变换

打开 `src/compiler/ts_to_gs_transform/expr.ts` 第 2048 行：

```typescript
// === 和 == 都被映射为 equal
const eq = makeFCall(env, 'equal', [left, right])
return op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsEqualsToken
  ? eq
  : makeFCall(env, 'logicalNotOperation', [eq])  // !== / != 需要取反
```

`f.equal()` 在 `src/definitions/nodes.ts` 中被定义为**泛型等值比较**，支持的操作数类型包括 `guid`：

```typescript
equal(input1: GuidValue, input2: GuidValue): boolean
```

### 2.4 `g.server().on()` 链的识别与 handler 变换

打开 `src/compiler/ts_to_gs_transform/index.ts` 第 416 行：

```typescript
// 匹配 g.server().on() 调用
if (ts.isCallExpression(node) && isServerOnCall(node, ctx.checker) && node.arguments.length >= 2) {
  const handler = node.arguments[1]  // 事件回调函数
  if (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) {
    const env = makeEnv(gstsIdent, eventName)   // 创建独立变换环境
    const newHandler = transformHandler(env, context, handler)  // 递归变换 handler 体
    // ...替换原 handler
  }
}
```

关键点：`transformHandler`（`stmt.ts` 第 1569 行）在变换 handler 体之前会做**变量使用规划**（`buildVarPlan`），分析局部的读写/类型/循环/随机等信息，决定哪些变量需要提升为 `LocalVariable`。

对于本例来说没有自定义局部变量，VarPlan 为空，所以 handler 体变换很直接：将 `if` 替换为 `f.doubleBranch`，将 `===` 替换为 `f.equal`。

---

## 3. 变换后的 .gs.ts 代码

Stage 1 输出的 `.gs.ts` 文件大致如下：

```typescript
// @gsts:entry
// my-logic.gs.ts

import { g } from 'genshin-ts/runtime/core'
import { guid } from 'genshin-ts/runtime/value'

const gsts = globalThis.gsts

g.server({
  name: 'EntityLogger',
  id: 1073741825
}).on('whenEntityIsCreated', (evt, f) => {
  gsts.f.doubleBranch(
    gsts.f.equal(evt.eventSourceGuid, new guid(133434)),
    () => {
      gsts.f.printString(gsts.f.str('Entity 133434 created!'))
    },
    () => {}
  )
})
```

### 3.1 与原始代码的对比

```
原始 .ts                               变换后 .gs.ts
──────────────────────────────────────────────────────────────
g.server({name}).on(...)      →       保留不变（框架调用）
  handler(evt, f) { ... }     →       handler 体被重写
    if (cond) {                   →    gsts.f.doubleBranch(
      body                              gsts.f.equal(...),
    }                                   箭头函数(body),
                                        箭头函数(empty)
                                      )
    a === b                      →    gsts.f.equal(a, b)
    str('...')                   →    gsts.f.str('...')
    f.printString(...)           →    gsts.f.printString(...) 保留
```

### 3.2 重要变化说明

1. **`gsts` 前缀注入**：所有节点函数调用从 `f.xxx(...)` 变为 `gsts.f.xxx(...)`，这是因为 `gsts` 是挂载在 `globalThis` 上的全局运行时对象，需要在每个 handler 开头通过 `const gsts = globalThis.gsts` 获取引用。

2. **`if` 消失**：不再有 TS 的 `if` 关键字。条件分支逻辑完全由 `doubleBranch` 节点表达，每个分支是一个箭头函数。

3. **`===` 消失**：等值比较变为 `f.equal(...)` 函数调用，对应节点图中的 `equal` 节点。

4. **括号和逗号表达执行流**：原来隐式的顺序执行（语句换行）现在通过函数的顺序调用来表达——`doubleBranch` 先执行 `cond`，然后根据结果选择执行 `thenFn` 或 `elseFn`。

---

## 4. Stage 2 执行：.gs.ts → IR JSON

### 4.1 执行机制

Stage 2 的入口是 `runner.ts`。它的工作原理出奇地简单：

```typescript
// runner.ts (简化)
async function main() {
  const entryUrl = pathToFileURL(entryFile).href
  await import(entryUrl)  // ← 关键！把 .gs.ts 当作普通 Node.js 模块加载执行

  const json = JSON.stringify(
    buildServerGraphRegistriesIRDocuments({ defaultName }),
    null, 2
  )
  fs.writeFileSync(outFile, json, 'utf8')
}
```

**核心洞察**：`.gs.ts` 文件在 Node.js 中**真实执行**，执行过程中的每一个 `g.server().on()`、`f.equal()`、`f.doubleBranch()` 调用都通过 `ir_builder.ts` 在全局注册表上记录节点和连线。执行完毕后，从全局注册表提取所有记录，序列化为 IR JSON。

### 4.2 执行时发生了什么？

当 `import('./my-logic.gs.ts')` 执行时，按顺序发生：

**步骤 1**：顶层的 `const gsts = globalThis.gsts` 获取运行时单例。

**步骤 2**：`g.server({ name: 'EntityLogger', id: 1073741825 })` 被执行。

在 `core.ts` 中，`g.server()` 创建一个 `ServerGraphRegistry` 对象：

```typescript
// ServerGraphRegistry 构造函数
constructor(
  graphType: 'server',
  graphMode: ServerGraphMode,
  graphId: number,
  graphName: string,
  ...
) {
  // 初始化：
  // - flows: []          ← ExecutionFlow 数组
  // - nodes: []          ← 所有已创建节点
  // - nextId: 1          ← 节点 ID 递增计数器
  // - variables: []      ← 图变量
}
```

**步骤 3**：`.on('whenEntityIsCreated', handler)` 链式调用触发 `runServerHandler`。

`core.ts` 第 606 行的 `runServerHandler`：

```typescript
runServerHandler(eventName, handler, inputArgs) {
  // 3a. 确保 bootstrap flow 存在
  this.ensureBootstrapFlow()
  
  // 3b. 注册事件节点（创建 IR 节点）
  const evt = this.registerEvent('whenEntityIsCreated', ServerEventMetadata, [])
  
  // 3c. 创建执行流函数对象
  const fns = new ServerExecutionFlowFunctions(this)
  
  // 3d. 设置执行上下文
  gsts.ctx.withCtx('server_handler', () => {
    // 3e. 执行 handler 体！
    handler(evt, fns, eventNode)
  })
}
```

**步骤 4**：`registerEvent('whenEntityIsCreated')` 在 IR 中创建事件节点。

`core.ts` 第 691 行的 `registerEvent`：

```typescript
registerEvent(eventName, metadata, inputArgs) {
  // 获取事件的参数元数据
  const eventParams = metadata[eventName]
  
  // 创建事件节点
  const id = this.getId()
  this.addNode({
    id,
    type: 'when_entity_is_created',  // 从 camelCase 转为 snake_case
    args: [...],
    next: []
  })
  
  // 为每个事件参数创建 Pin（引脚）
  // eventSourceEntity → pin 0
  // eventSourceGuid   → pin 1
  const eventObj = {}
  eventParams.forEach((param, i) => {
    const val = new value()
    val.markPin(eventNode, param.name, i)
    eventObj[param.name] = val
  })
  
  return eventObj as ServerEventPayloads[E]
}
```

此时 IR 中有了第一个节点：类型为 `when_entity_is_created` 的事件节点，有两个数据输出引脚（pin 0: `eventSourceEntity`，pin 1: `eventSourceGuid`）。

**步骤 5**：handler 函数体被执行。注意 `equal` 是一个 **data** 节点——它不参与执行流，只做计算。内部调用链：

```
f.equal(evt.eventSourceGuid, new guid(133434))
  │
  ├─ evt.eventSourceGuid → 返回一个 `value` 对象，已标记了 pin 连接信息
  │   （指向事件节点的 pin 1，类型为 guid）
  │
  ├─ new guid(133434)    → 创建一个 guid 字面量值
  │   （toIRLiteral() 返回 { type: 'guid', value: 133434 }）
  │
  └─ f.equal(a, b)       → 在 ir_builder 中创建 equal 节点
      ├─ 分配新节点 ID（但不会改动执行流尾端点！）
      ├─ 参数 a → ir_builder 识别出它是 conn 类型（来自事件节点 pin 1）
      │     → 生成 { type: 'conn', value: { node_id: 事件节点ID, index: 1, type: 'guid' } }
      ├─ 参数 b → ir_builder 识别出它是字面量
      │     → 生成 { type: 'guid', value: 133434 }
      ├─ 节点类型 = 'data' → 仅追加到 dataNodes[]，不创建执行流连线
      └─ 返回 value 对象（标记了 equal 节点的输出 pin 0，类型为 bool）
```

**步骤 6**：`doubleBranch(cond, thenFn, elseFn)` 执行：

```
f.doubleBranch(cond, thenFn, elseFn)
  │
  ├─ cond = equal 节点的输出（类型 bool，通过 markPin 标记连接信息）
  │
  ├─ doubleBranch 节点创建（type = 'exec'）：
  │   ├─ 分配新节点 ID
  │   ├─ 从当前执行尾端点（事件节点）→ addEdge(eventNode, doubleBranch)
  │   │   → edges: { eventNode.id: [{ node_id: doubleBranch.id }] }
  │   ├─ cond 参数 → { type: 'conn', value: { node_id: equal节点ID, index: 0, type: 'bool' } }
  │   │
  │   ├─ withExecBranch(ref.id, TRUE_SOURCE_INDEX=0, thenFn) ①
  │   │   └─ 新执行上下文: tailEndpoints = []
  │   │       └─ 执行 thenFn(): f.printString('...')
  │   │           ├─ printString 节点创建（type = 'exec'）
  │   │           ├─ tailEndpoints 为空? → 从 ref.id 的 source_index=0 连线
  │   │           │   → addEdge(doubleBranch.id, printString.id, 0)
  │   │           │   → edges: { doubleBranch.id: [{ node_id: printString.id, source_index: 0 }] }
  │   │           └─ 该分支返回: tailEndpoints=[{nodeId: printString.id}]
  │   │
  │   └─ withExecBranch(ref.id, FALSE_SOURCE_INDEX=1, elseFn)
  │       └─ 空函数体 → 未注册任何节点
  │           └─ 该分支返回: tailEndpoints=[] (空)
  │
  ├─ 分支 join（doubleBranch 第 3328-3337 行）：
  │   ├─ then 分支：tailEndpoints=[printString.id] → 加入 joinEndpoints
  │   └─ else 分支：tailEndpoints=[] → 分支节点自身加 joinEndpoints
  │       → joinEndpoints = [
  │           { nodeId: printString.id },
  │           { nodeId: doubleBranch.id, sourceIndex: 1 }
  │         ]
  │
  └─ setCurrentExecTailEndpoints(joinEndpoints)
      → 后续 exec 节点会从这两个尾端点一起连线
```

**步骤 7**：handler 执行完成后，回到 `runner.ts`，调用 `buildServerGraphRegistriesIRDocuments()`。

该函数遍历全局注册表中的所有 `ServerGraphRegistry`，序列化每个 registry 的节点和连线为 IR JSON。

---

## 5. IR JSON 产物结构

上述执行过程产生两个关键数据结构：

- **`edges`** — 运行时构建的执行流连线映射 `{ fromNodeId → NextConnection[] }`
- **`nodes`** — 由 `buildNodesFromFlow` 从 `edges` 和节点记录合并生成的序列化节点数组

真实的 IR JSON 输出如下（使用 `gsts.demo.config.ts` 编译 `tests/demo_entity_log.ts` 所得）：

```json
[
  {
    "ir_version": 1,
    "ir_type": "node_graph",
    "graph": {
      "type": "server",
      "mode": "beyond",
      "sub_type": "entity",
      "id": 1073741825,
      "name": "_GSTS_EntityLogger"
    },
    "variables": [],
    "nodes": [
      {
        "id": 1,
        "type": "when_entity_is_created"
      },
      {
        "id": 2,
        "type": "when_entity_is_created",
        "next": [ 4 ]
      },
      {
        "id": 4,
        "type": "double_branch",
        "args": [
          {
            "type": "conn",
            "value": {
              "node_id": 3,
              "index": 0,
              "type": "bool"
            }
          }
        ],
        "next": [
          {
            "node_id": 5,
            "source_index": 0
          }
        ]
      },
      {
        "id": 5,
        "type": "print_string",
        "args": [
          {
            "type": "str",
            "value": "Entity 133434 created!"
          }
        ]
      },
      {
        "id": 3,
        "type": "equal",
        "args": [
          {
            "type": "conn",
            "value": {
              "node_id": 2,
              "index": 1,
              "type": "guid"
            }
          },
          {
            "type": "guid",
            "value": 133434
          }
        ]
      }
    ]
  }
]
```

### 5.1 真实产出的两个意外发现

与文档预期的 IR 相比，真实产出有两个值得注意的差异：

#### 发现一：两个事件节点（id 1 和 id 2）

节点数组中有两个 `when_entity_is_created` 节点：

- **节点 1**：孤立的，无 `next`，无 `args`
- **节点 2**：有 `next: [4]`（指向 `double_branch`），是真正的执行流入口

原因在 `core.ts` 第 551-559 行的 `ensureBootstrapFlow()`：

```typescript
ensureBootstrapFlow(): ExecutionFlow {
  if (this.bootstrapFlow) return this.bootstrapFlow
  // 在真正的事件 handler 注册前，先注册一个"引导事件"
  this.registerEvent('whenEntityIsCreated', ServerEventMetadata, [])
  const flow = this.flows[this.flows.length - 1]
  this.bootstrapFlow = flow
  return flow
}
```

这个引导事件节点（id 1）是一个**占位符**，用于确保在用户 handler 执行前，graph 已经有一条完整的执行流。紧接着 `runServerHandler` 会调用 `registerEvent` 创建真正的事件节点（id 2），其 `next` 连接到用户的 handler 逻辑。

运行时引擎执行时，只会触发节点 2（真正绑定了 handler 的事件），节点 1 是空占位。

#### 发现二：`next: [4]` 使用了简写形式

事件 → `double_branch` 的连线是 `next: [4]` 而非 `next: [{ node_id: 4 }]`。这是因为事件节点只有一个执行输出引脚（source_index 恒为 0），没有歧义，所以 `addEdge` 走的是简写分支（`core.ts` 第 659 行）：

```typescript
private addEdge(flow, fromNodeId, toNodeId, sourceIndex?) {
  const list = (flow.edges[fromNodeId] ??= [])
  if (sourceIndex === undefined) {
    list.push(toNodeId)                // 简写：仅存目标节点 ID
  } else {
    list.push({ node_id: toNodeId, source_index: sourceIndex })  // 详细
  }
}
```

而 `double_branch` 有 2 个执行输出，所以必须用详细形式标注是 `source_index: 0`（then 分支）。

#### 发现三：节点顺序 = exec 先，data 后

数组中的节点顺序为：节点 1（event）→ 节点 2（event）→ 节点 4（double_branch）→ 节点 5（print_string）→ **节点 3（equal）**

这不是随意排序的——`buildNodesFromFlow`（`ir_builder.ts` 第 169-185 行）明确按照 `eventNode → execNodes → dataNodes` 的顺序排列节点。所以 `equal` 作为 `data` 类型节点被排到了最后，尽管它的实际数据依赖位置在 `double_branch` 之前。

这也再次证明：**执行流和计算流是正交的维度**。`equal` 不参与执行流链，它只在 `double_branch` 通过 `conn` 按需求值时被激活。

`next` 是 IR 中**执行流连线的序列化形式**，连接两个 exec 类型节点，指定执行顺序。

#### 5.1.1 数据类型定义

```typescript
// IR.d.ts
export type NextConnection = number | NextConnectionDetailed

export interface NextConnectionDetailed {
  node_id: number           // 【必填】目标节点 ID
  source_index?: number     // 源节点执行输出引脚索引（多出口节点用）
  source_sub_index?: number // 源节点执行输出子分支索引
  target_index?: number     // 目标节点执行输入引脚索引
  target_sub_index?: number // 目标节点执行输入子分支索引
}
```

#### 5.1.2 两种序列化形式

```typescript
// 形式 1：简写（单出口单入口）
list.push(toNodeId)
// → edges 中: { 1: [2] }           → next: [2]

// 形式 2：详细（多出口或多入口）
list.push({ node_id: toNodeId, source_index: sourceIndex })
// → edges 中: { 2: [{ node_id: 4, source_index: 0 }] }
// → next: [{ "node_id": 4, "source_index": 0 }]
```

简写形式用于简单的顺序执行链（无分支）。一旦涉及条件判断、循环、switch 等多出口节点，就必须使用详细形式，通过 `source_index` 标识从哪个出口离开。

#### 5.1.3 `source_index`：执行输出引脚

这是理解 `next` 连线最关键的概念。一个节点可以有一个或多个**执行输出引脚**：

| 节点类型 | 执行输出引脚数 | source_index 含义 |
|---------|--------------|------------------|
| 事件节点（`when_entity_is_created`） | 1 | `0` = 事件触发后执行 |
| `double_branch` | 2 | `0` = then（真分支）, `1` = else（假分支） |
| 有限循环（`finite_loop`） | 2 | `0` = 循环体迭代, `1` = 循环完成 |
| `print_string`、普通 exec 节点 | 1 | `0` = 执行完毕 |
| data 节点（`equal`、`addition` 等） | 0 | **没有 `next`** |

在代码层面，`doubleBranch` 硬编码了两个常量（`nodes.ts` 第 3309 行）：

```typescript
const TRUE_SOURCE_INDEX = 0
const FALSE_SOURCE_INDEX = 1
```

#### 5.1.4 `target_index`：执行输入引脚

有些节点有多个执行**输入**引脚。例如循环节点的 break 出口需要连到循环体的"强制结束"输入引脚。常规的顺序执行连线不需要设置这个字段。

#### 5.1.5 本例中 `next` 的完整产生过程

```
edges 映射（运行时构建）
─────────────────────────────────────────────────
{1: [2]}                       ← registerNode(doubleBranch)
                                 tailEndpoints=[{nodeId:1}] → 从事件节点连到分支节点

{2: [{node_id:4, source_index:0}]}
                               ← withExecBranch(doubleBranch, 0, thenFn)
                                 thenFn 内部注册了 printString(4)
                                 → 从 doubleBranch 的 0 号输出连到 printString
```

序列化时，`buildNodesFromFlow`（`ir_builder.ts` 第 169 行）只给 `eventNode` 和 `execNodes` 传递 `next`：

```typescript
function buildNodesFromFlow(flow: ExecutionFlow): ServerNode[] {
  const getNext = (id: number) => flow.edges[id]

  // 事件节点 → 有 next
  nodes.push(buildNodeFromRecord(flow.eventNode, getNext(flow.eventNode.id)))
  // exec 节点 → 有 next
  flow.execNodes.forEach((execNode) =>
    nodes.push(buildNodeFromRecord(execNode, getNext(execNode.id)))
  )
  // data 节点 → 无 next！
  flow.dataNodes.forEach((dataNode) =>
    nodes.push(buildNodeFromRecord(dataNode))
  )
}
```

#### 5.1.6 运行时执行顺序

游戏运行时根据 `next` 连线执行：

```
 1. when_entity_is_created        ← 事件触发
    │ next: node_id=2
    ▼
 2. double_branch                 ← 条件分支
    ├─ args[0] 引用了 equal(3) 的输出 → 触发 equal 计算
    │   ├─ input0: conn→event(1)/pin1  → 从事件读取 eventSourceGuid
    │   └─ input1: guid literal=133434
    │   └─ output: bool (相等? true:false)
    │
    ├─ source_index=0 (true)  → 执行 print_string
    └─ source_index=1 (false) → 跳过
```

关键洞察：**`equal` 作为 data 节点没有自己的执行时机**——它由 `double_branch` 在需要其输出时**按需求值**。这和传统的冯·诺依曼模型（指令按序执行）不同，更接近**数据流计算**：数据节点在有消费者时才被求值。

### 5.2 完整节点连接拓扑图（已修正）

```
┌─────────────────────────┐
│  id: 1                   │
│  type: exec              │
│  when_entity_is_created  │
│                          │
│  输出引脚:                │
│  pin 0: eventSourceEntity│
│  pin 1: eventSourceGuid ───────→ (data conn, 非 next)
│                          │
│  执行流:                  │
│  next: [2]               │  ← 简写形式
└──────────┬──────────────┘
           │ next
           ▼
┌─────────────────────────────────────────────────┐
│  id: 2                                            │
│  type: exec                                       │
│  double_branch                                     │
│                                                    │
│  参数:                                              │
│  arg 0: conn → node 3 / pin 0 (bool) ─────→ data │
│                                                    │
│  执行输出:               ┌──────────────────────┐ │
│  source_index=0 (then) ─→│ id: 3                 │ │
│                           │ type: data            │ │
│  source_index=1 (else) ──→│ equal                 │ │
│    空分支 → 无后继       │ 无 next（数据节点）   │ │
│                           │  arg0: conn→event/p1 │ │
│                           │  arg1: guid 133434   │ │
│                           └──────────────────────┘ │
│                             │  data conn           │
│                             ▼ (被 double_branch   │
│                               arg0 消费)          │
│                                                    │
│  next: [{node_id:4, source_index:0}]               │
└──────────┬─────────────────────────────────────────┘
           │ next (source_index=0)
           ▼
┌──────────────────────────────────────┐
│  id: 4                                │
│  type: exec                           │
│  print_string                         │
│                                       │
│  参数:                                 │
│  arg 0: literal "Entity 133434 ..."   │
│                                       │
│  next: [] （终结节点）                  │
└──────────────────────────────────────┘
```

### 5.3 两种连线类型对比

| 特征 | `next`（执行流连线） | `conn`（数据连线） |
|------|-------------------|-------------------|
| 载体 | 节点上的 `next[]` 字段 | 参数中的 `{ type: 'conn', ... }` |
| 连接的节点类型 | exec → exec | 任意 → 任意 |
| 含义 | "执行完 A 后执行 B" | "A 的 pin X 输出作为 B 的输入" |
| 运行时语义 | 控制流顺序 | 数据依赖（按需求值） |
| `equal` 节点是否参与 | ❌（data 节点无 next） | ✅（它的输出被 double_branch 消费） |

本例中的连线：

| 源 | 目标 | 类型 | 如何产生 |
|----|------|------|---------|
| node 1（事件）→ node 2（double_branch） | 执行流（`next`） | `registerNode` 从 tail endpoints 自动连线 |
| node 3（equal）→ node 2（double_branch） | 数据（`conn`） | `double_branch` 的 arg 0 引用 equal 的输出 pin |
| node 1（事件）→ node 3（equal） | 数据（`conn`） | `equal` 的 arg 0 引用事件节点的 output pin 1 |
| node 2 → node 4（print_string） | 执行流（`next`, source_index=0） | `withExecBranch` 在 then 分支中注册 printString |

---

## 6. Stage 3：IR JSON → .gia 二进制

在本流程中关心两个关键转换：

### 6.1 节点类型映射

`ir_to_gia_transform` 会将 IR 节点类型名映射为 GIA 协议的 `NodeType`：

| IR 节点类型 | GIA NodeType |
|-------------|-------------|
| `when_entity_is_created` | `Event_TimeScaleChange`（或其他对应事件类型） |
| `equal` | `Exec_BranchOnCondition` 或 `Data_Equal` 等 |
| `double_branch` | `Exec_Branch` |
| `print_string` | `Exec_PrintString` |

### 6.2 引脚布局

数据连线（`conn` 参数）在 GIA 中通过 `pin_records` 来表达——每个节点定义了输入/输出引脚，连线通过配对的引脚 ID 建立连接。

---

## 7. 运行时行为：在游戏中执行

.gia 文件被注入到 `.gil` 关卡文件后，在游戏中的运行时行为：

### 7.1 事件触发

1. 游戏中**任意实体被创建**时，千星奇域的运行时系统触发 `when_entity_is_created` 事件节点（id 2，真正绑定了 handler 的事件）
2. 事件节点的执行输出：**`next` 指向 `double_branch` 节点**，沿执行流前进
3. 事件节点的数据引脚输出：`eventSourceGuid`（pin 1）等待被消费者读取

### 7.2 条件判断

4. `double_branch` 节点拿到执行权后，读取其 `args[0]` ——这是一个 `conn` 引用，指向 `equal` 节点（id 3）的 pin 0 输出
5. 运行时发现 `equal` 的输出尚未计算，于是**按需求值**：
   - 读取 `equal` 的 `args[0]` = `conn` 引用 → 事件节点的 `eventSourceGuid` 数据输出（真实 GUID）
   - 读取 `equal` 的 `args[1]` = 字面量 `guid(133434)`
   - 执行 etc
6. `equal` 的计算结果（bool）作为条件值返回给 `double_branch`

### 7.3 分支执行

7. `double_branch` 节点根据条件选择出口：
   - **`true`** → 沿 `source_index=0`（then 出口）进入 `print_string` 节点
   - **`false`** → 沿 `source_index=1`（else 出口）结束执行流（空分支）

### 7.4 日志输出

8. `print_string` 节点执行后，游戏会在**开发者控制台/事件日志**中显示字符串 `"Entity 133434 created!"`
9. 具体呈现形式取决于游戏的 UGC 运行时实现：
   - 游戏内调试叠加层（debug overlay）
   - 开发者后台日志流
   - 节点编辑器的运行日志面板

---

## 8. 总结：全流程数据流

```
┌─────────────────────────────────────────────────────────────┐
│  开发者编写阶段                                                  │
│                                                               │
│  my-logic.ts                                                   │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ g.server({name}).on('whenEntityIsCreated', (evt,f)=> { │    │
│  │   if (evt.eventSourceGuid === new guid(133434)) {      │ ←─── 高阶 DSL
│  │     f.printString(str('Entity created!'))              │    │
│  │   }                                                     │    │
│  │ })                                                      │    │
│  └───────────────────────────────────────────────────────┘    │
│                       │                                        │
│                       ▼ Stage 1：TS AST 变换                    │
│                       │  (ts_to_gs_transform/)                  │
│                       │  消去：if→doubleBranch, ===→equal       │
│                       ▼                                        │
│  my-logic.gs.ts                                                │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ g.server({name}).on('whenEntityIsCreated', (evt,f)=> { │    │
│  │   f.doubleBranch(                                      │    │
│  │     f.equal(evt.eventSourceGuid, new guid(133434)),   │ ←─── 低阶节点调用
│  │     () => { f.printString(f.str('Entity created!')) }, │    │
│  │     () => {}                                            │    │
│  │   )                                                     │    │
│  │ })                                                      │    │
│  └───────────────────────────────────────────────────────┘    │
│                       │                                        │
│                       ▼ Stage 2：Node.js 执行                   │
│                       │  (gs_to_ir_json_transform/)             │
│                       │  import() → 执行 .gs.ts → 捕获 IR      │
│                       ▼                                        │
│  IR JSON                                                       │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ [{                                                      │    │
│  │   nodes: [                                              │    │
│  │     { id:1, type:"when_entity_is_created", next:[2] }, │    │
│  │     { id:2, type:"double_branch",  args:[conn→node3],   │ ←── 执行流走 next
│  │       next:[{node_id:4, source_index:0}] },             │    │
│  │     { id:3, type:"equal",          args:[conn→node1,   │ ←── 数据节点无 next
│  │                                    guid:133434] },      │    │
│  │     { id:4, type:"print_string",   args:["Entity..."] } │    │
│  │   ]                                                      │    │
│  │ }]                                                       │    │
│  └───────────────────────────────────────────────────────┘    │
│                       │                                        │
│                       ▼ Stage 3：GIA 二进制                     │
│                       │  (ir_to_gia_transform/)                 │
│                       │  类型映射、引脚布局、protobuf 编码      │
│                       ▼                                        │
│  .gia 文件                                                     │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ [Binary protobuf with NodeType, pin_records,           │    │
│  │  exec_flow connections, literal values]                │ ←── 运行时可执行
│  └───────────────────────────────────────────────────────┘    │
│                       │                                        │
│                       ▼ 注入 .gil → 游戏内运行时                │
│                       │                                        │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ 实体被创建 → 事件节点触发 →                          │    │
│  │   equal(eventSourceGuid, 133434) →                   │    │
│  │     true  → print_string("Entity created!")          │ ←── 最终行为
│  │     false → 结束                                      │    │
│  └───────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 关键洞见

1. **"编译"即是执行**：Stage 2 不是传统的 AST 到 AST 变换，而是通过**真实执行** `.gs.ts` 代码来捕获节点图结构。`f.equal(a, b)` 不是在"描述"要创建一个节点——**它确实创建了这个节点**。

2. **if 的消去是彻底的**：变换后的代码中没有任何运行时条件分支——条件判断逻辑完全由 `double_branch` 节点承载，游戏运行时系统根据条件值（bool pin）选择合适的执行流出口。

3. **连线是引用，不是数据流**：IR JSON 中的 `conn` 参数不是包含数据值，而是包含一个"引用"——指向哪个节点的哪个引脚。实际值在游戏运行时才流动。

4. **箭头函数是执行流的分组单元**：`doubleBranch` 的 then/else 参数是箭头函数，它们不仅是 JS 的闭包——在 IR 层面，它们代表执行流的一个"子序列"，其中的节点被顺序创建并通过 `next` 相连。
