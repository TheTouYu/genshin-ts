# IR JSON 中的控制流与数据流

> 本文档通过 6 个从简到繁的真实编译样例，展示 genshin-ts 节点图中**控制流**（execution flow）和**数据流**（data flow）两个正交维度的 IR 表示方式。
>
> 所有样例均使用 `gsts.ir.config.ts` 编译 `tests/demo_ir_0*.ts` 得到，输出在 `dist/demo_ir/`。

---

## 目录

1. [两个正交维度](#1-两个正交维度)
2. [样例速览](#2-样例速览)
3. [控制流：执行链](#3-控制流执行链)
   - [3.1 顺序执行](#31-顺序执行)
   - [3.2 条件分支（if/else）](#32-条件分支ifelse)
   - [3.3 嵌套分支（if/else if/else）](#33-嵌套分支ifelse-ifelse)
   - [3.4 多路分支（switch）](#34-多路分支switch)
   - [3.5 有限循环（for）](#35-有限循环for)
4. [数据流：计算链](#4-数据流计算链)
   - [4.1 纯字面量](#41-纯字面量)
   - [4.2 数据链](#42-数据链)
   - [4.3 数据节点在节点数组中的位置](#43-数据节点在节点数组中的位置)
5. [控制流与数据流的交汇](#5-控制流与数据流的交汇)
   - [5.1 exec 节点引用 data 节点](#51-exec-节点引用-data-节点)
   - [5.2 按需求值模型](#52-按需求值模型)
6. [附录：六个样式的完整 IR JSON](#6-附录六个样式的完整-ir-json)

---

## 1. 两个正交维度

节点图中有两种完全不同的"流"：

| 维度 | 载体 | 连接方式 | 节点类型 | 执行语义 |
|------|------|---------|---------|---------|
| **控制流** | `next` 字段 | `exec → exec` | `type: 'exec'` | 顺序/分支/循环——决定执行顺序 |
| **数据流** | `conn` 参数 | 任意 → 任意 | `type: 'data'` | 按需求值——决定数据的计算与传递 |

**关键规则**：
- `exec` 节点通过 `next` 串成执行链
- `data` 节点**没有 `next`**，它们通过 `conn` 参数被 exec 节点（或其他 data 节点）引用
- data 节点不参与执行流，它们在需要其输出时才被求值

---

## 2. 样例速览

| 编号 | 模式 | 控制流特征 | 数据流特征 |
|------|------|-----------|-----------|
| 01 | 顺序执行 | 线性 `next` 链 | 无 data 节点（字面量嵌入在 exec args 中） |
| 02 | if/else | `double_branch` + 两个出口 | `equal` 比较 guid |
| 03 | if/else if/else | 嵌套 `double_branch` | 变量提升为 LocalVariable，两个 `equal` 节点共享 |
| 04 | switch | `multiple_branches` + 4 个出口 | 无 data 节点 |
| 05 | for 循环 | `finite_loop` + 体出口/完成出口 | 无 data 节点 |
| 06 | 复合表达式 + if | `double_branch` | `addition → multiplication → greater_than` 三节点链 |

---

## 3. 控制流执行链

### 3.1 顺序执行

**源码**（`demo_ir_01_sequential.ts`）：
```typescript
g.server({ id: 1073741901 })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('step A')
    f.printString('step B')
  })
```

**变换后的 .gs.ts**：
```typescript
gsts.f.printString('step A');
gsts.f.printString('step B');
```

**IR JSON 执行链**：
```
node 2: when_entity_is_created
  └─ next: [3]           ← 简写形式（单出口无歧义）

node 3: print_string("step A")
  └─ next: [4]           ← 简写形式

node 4: print_string("step B")
  └─ next: 无             ← 终结节点
```

**关键观察**：
- `next: [3]` 是**简写形式**：当源节点只有唯一的执行输出引脚时，直接用目标节点 ID，无需 `source_index`
- 执行顺序：事件触发 → print A → print B
- 没有任何 data 节点——字符串 `"step A"` 和 `"step B"` 以字面量形式嵌入在 `print_string` 的 `args` 中

---

### 3.2 条件分支（if/else）

**源码**（`demo_ir_02_ifelse.ts`）：
```typescript
if (evt.eventSourceGuid === new guid(100)) {
  f.printString('guid is 100')
} else {
  f.printString('guid is not 100')
}
```

**变换后的 .gs.ts**：
```typescript
gsts.f.doubleBranch(
  gsts.f.equal(evt.eventSourceGuid, new guid(100)),   // ← 条件表达式变为 equal(data)
  () => { f.printString('guid is 100'); },              // ← then 分支
  () => { f.printString('guid is not 100'); }           // ← else 分支
);
```

**IR JSON 执行链**：
```
node 2: when_entity_is_created
  └─ next: [4]                                       ← 简写

node 4: double_branch
  ├─ args[0]: conn → node 3 (equal, pin 0, bool)    ← 消费 data 节点
  ├─ next[0]: { node_id: 5, source_index: 0 }        ← then 出口
  └─ next[1]: { node_id: 6, source_index: 1 }        ← else 出口

node 5: print_string("guid is 100")                   ← then 分支体
node 6: print_string("guid is not 100")               ← else 分支体
```

**`double_branch` 的 `next` 详解**：

```json
"next": [
  { "node_id": 5, "source_index": 0 },   // source_index=0 = TRUE 分支（then）
  { "node_id": 6, "source_index": 1 }    // source_index=1 = FALSE 分支（else）
]
```

在源码层面（`nodes.ts` 第 3309-3310 行）：
```typescript
const TRUE_SOURCE_INDEX = 0
const FALSE_SOURCE_INDEX = 1
```

**执行流拓扑**：
```
事件 ──next──→ double_branch ──source=0──→ print("guid is 100")
                  │
                  └──source=1──→ print("guid is not 100")
```

**为什么用详细形式**？因为 `double_branch` 有 2 个执行输出引脚，必须通过 `source_index` 区分哪个分支通向哪个节点。简单顺序执行不存在这种歧义。

---

### 3.3 嵌套分支（if/else if/else）

**源码**（`demo_ir_03_ifelseif.ts`）：
```typescript
const id = evt.eventSourceGuid
if (id === new guid(100)) {
  f.printString('case 100')
} else if (id === new guid(200)) {
  f.printString('case 200')
} else {
  f.printString('other')
}
```

**变换后的 .gs.ts**：
```typescript
const id = gsts.f.initLocalVariable("guid");        // ← 变量提升为 LocalVariable
gsts.f.setLocalVariable(id.localVariable, evt.eventSourceGuid);
gsts.f.doubleBranch(
  gsts.f.equal(id.value, new guid(100)),
  () => { f.printString('case 100'); },
  () => {
    gsts.f.doubleBranch(                             // ← 嵌套的 else if
      gsts.f.equal(id.value, new guid(200)),
      () => { f.printString('case 200'); },
      () => { f.printString('other'); }
    );
  }
);
```

**IR JSON 执行链**：
```
node 2: when_entity_is_created
  └─ next: [4]

node 4: set_local_variable                           ← 保存 eventSourceGuid 到本地变量
  ├─ args[0]: conn → node 3 (get_local_variable, pin 0, local_variable)
  ├─ args[1]: conn → node 2 (事件, pin 1, guid = eventSourceGuid)
  └─ next: [6]

node 6: double_branch(id === 100)                    ← 外层条件
  ├─ next[0](source=0) → node 7: print_string("case 100")   ← then
  └─ next[1](source=1) → node 9: double_branch(id === 200)  ← else → 嵌套

node 9: double_branch(id === 200)                    ← 内层条件
  ├─ next[0](source=0) → node 10: print_string("case 200")
  └─ next[1](source=1) → node 11: print_string("other")
```

**关键观察 —— 变量提升**：
- 因为 `const id = evt.eventSourceGuid` 被读取了两次（两个 `===` 比较），Stage 1 的 VarPlan 决定将其提升为 LocalVariable
- 产生了三个额外节点：
  - `get_local_variable`（id 3）：创建本地变量句柄
  - `set_local_variable`（id 4）：将 `eventSourceGuid` 存入
  - 后续的 `equal` 节点通过 `id.value` 读取

```
变量读取拓扑（数据流）：

get_local_variable(id 3)
  ├─ pin 0 (local_variable) ──conn──→ set_local_variable args[0]
  ├─ pin 1 (value = guid)    ──conn──→ equal(id===100) args[0]
  │                                   equal(id===200) args[0]
  └─ 同一个数据源被两个 equal 节点共享！
```

**嵌套 `if` 的几何级数变化**：
- `if/else if/else` 不是编译成 `multipleBranches`，而是编译成**嵌套的 `double_branch`**
- 每一层 `else if` 增加一层嵌套 → IR 中对应一个额外的 `double_branch` 节点
- 如果有 N 个 `else if`，则产生 N 个 `double_branch`，而不是一个 N+2 出口的节点

---

### 3.4 多路分支（switch）

**源码**（`demo_ir_04_switch.ts`）：
```typescript
const x = 42n
switch (x) {
  case 100n:  f.printString('case 100');  break
  case 200n:  f.printString('case 200');  break
  case 300n:  f.printString('case 300');  break
  default:    f.printString('default')
}
```

**变换后的 .gs.ts**：
```typescript
const x = 42n;
gsts.f.multipleBranches(x, {
  "100": () => { f.printString('case 100'); },
  "200": () => { f.printString('case 200'); },
  "300": () => { f.printString('case 300'); },
  default: () => { f.printString('default'); }
});
```

**IR JSON 执行链**：
```
node 2: when_entity_is_created
  └─ next: [3]

node 3: multiple_branches
  ├─ args: [42, 100, 200, 300]                         ← 控制值 + 各 case 键
  ├─ next[0](source=0) → node 4: print_string("default")   ← default 出口
  ├─ next[1](source=1) → node 5: print_string("case 100")
  ├─ next[2](source=2) → node 6: print_string("case 200")
  └─ next[3](source=3) → node 7: print_string("case 300")
```

**关键观察 —— `source_index` 分配规则**：
- `default` 分支固定为 `source_index = 0`（`nodes.ts` 第 3149-3151 行）
- 具名 case 按书写顺序从 `source_index = 1` 开始递增
- `multiple_branches` 的 `args` 数组结构：
  - `args[0]` = 控制表达式值（这里 `42`）
  - `args[1..N]` = 各 case 的键值，与 `next[1..N]` 一一对应

**对比 `if/else if` vs `switch`**：

| 特征 | 嵌套 `double_branch` | `multiple_branches` |
|------|---------------------|---------------------|
| 节点数 | N 个 double_branch | 1 个 multiple_branches |
| 分支数限制 | 无限制 | 所有分支集中到一个节点 |
| 条件表达式 | 每个分支独立求值 | 控制表达式统一求值 |
| 适用场景 | 条件复杂（`===`，`>` 等） | 条件单一（`===` int/str） |

---

### 3.5 有限循环（for）

**源码**（`demo_ir_05_forloop.ts`）：
```typescript
for (let i = 0n; i < 5n; i++) {
  f.printString('loop')
}
f.printString('done')
```

**变换后的 .gs.ts**：
```typescript
gsts.f.finiteLoop(0n, 4n, (i, breakLoop) => {    // 0n → 4n（含），执行 5 次
  f.printString('loop');
});
f.printString('done');
```

**IR JSON 执行链**：
```
node 2: when_entity_is_created
  └─ next: [3]

node 3: finite_loop
  ├─ args: [{int:0}, {int:4}]          ← 起始索引（含），终止索引（含）
  ├─ next[0](source=0) → node 4: print_string("loop")   ← 循环体（反复执行）
  └─ next[1](source=1) → node 5: print_string("done")   ← 循环完成

执行顺序：事件 → finite_loop → [print loop × 5] → print done
```

**`finite_loop` 的两出口语义**：

| `source_index` | 含义 | 执行时机 |
|---------------|------|---------|
| 0 | 循环体（Loop Body） | 每次迭代执行一次 |
| 1 | 循环完成（Loop Complete） | 所有迭代结束后执行一次 |

**为什么循环体只有 1 个节点？**
- 源码中循环体内只有 `f.printString('loop')` 一个调用
- 如果循环体内有更多语句，它们会形成一条子执行链，挂在 `source_index=0` 下
- 循环完成后，执行流自动切换到 `source_index=1` 指向的 `print("done")`

**循环变量 `i`**：`finiteLoop` 的回调参数 `(i, breakLoop)` 中，`i` 是每次迭代的当前索引值，`breakLoop` 是跳出循环的函数。在 IR 层面，它们分别对应 `finite_loop` 节点的数据输出引脚和 break 控制引脚。

---

## 4. 数据流计算链

数据节点（`type: 'data'`）不参与执行流。它们在节点数组中排在所有 exec 节点之后，通过 `conn` 参数被引用。

### 4.1 纯字面量

最简单的数据流是"没有数据流"——字面量值直接嵌入在 exec 节点的 `args` 中：

```json
// 样例 01：字符串字面量嵌入在 print_string 的 args 中
{
  "id": 3,
  "type": "print_string",
  "args": [{ "type": "str", "value": "step A" }]
}
```

```json
// 样例 04：整数字面量嵌入在 multiple_branches 的 args 中
{
  "id": 3,
  "type": "multiple_branches",
  "args": [
    { "type": "int", "value": 42 },
    { "type": "int", "value": 100 },
    { "type": "int", "value": 200 },
    { "type": "int", "value": 300 }
  ]
}
```

当值直接以字面量出现（`str('...')`, `int(42)`, `true`, `100n` 等）时，编译器不创建 data 节点，而是将值作为参数内联到消费它的节点中。

### 4.2 数据链

当值来自另一个节点的输出时，就产生了数据链。

**样例 06**（`demo_ir_06_expr_flow.ts`）：
```typescript
const a = int(10)
const b = int(20)
const c = a + b          // addition 节点
const d = c * 2n         // multiplication 节点
if (d > 50n) { ... }     // greaterThan + doubleBranch
```

**IR JSON 数据链**：

```
data 节点之间通过 conn 形成数据链：

┌───────────────────────────────────────────────────────┐
│  ALL DATA NODES (没有 next，排在节点数组末尾)           │
│                                                       │
│  node 3: addition                                     │
│  ├─ args[0]: { type: "int", value: 10 }  ← 字面量    │
│  ├─ args[1]: { type: "int", value: 20 }  ← 字面量    │
│  └─ pin 0: output (int)                              │
│        │                                              │
│        ▼ (conn)                                       │
│  node 4: multiplication                               │
│  ├─ args[0]: { type: "conn", value:                   │
│  │     { node_id: 3, index: 0, type: "int" } } ← addition 的输出               │
│  ├─ args[1]: { type: "int", value: 2 }     ← 字面量  │
│  └─ pin 0: output (int)                              │
│        │                                              │
│        ▼ (conn)                                       │
│  node 5: greater_than                                 │
│  ├─ args[0]: { type: "conn", value:                   │
│  │     { node_id: 4, index: 0, type: "int" } } ← multiplication 的输出          │
│  └─ args[1]: { type: "int", value: 50 }   ← 字面量   │
│  └─ pin 0: output (bool)                              │
│        │                                              │
│        ▼ (conn)                                       │
│  [被 double_branch 的 args[0] 消费]                    │
└───────────────────────────────────────────────────────┘

          ↑ 以上 data 节点均无 next ↑
          ↓ 以下 exec 节点通过 args 引用 data 节点 ↓

┌───────────────────────────────────────────────────────┐
│  EXEC NODES (通过 next 串联，通过 conn 消费 data)     │
│                                                       │
│  node 6: double_branch                                │
│  ├─ args[0]: { type: "conn",                          │
│  │     value: { node_id: 5, index: 0, type: "bool" }} ← 引用 greater_than
│  └─ next: [...]                                       │
└───────────────────────────────────────────────────────┘
```

**`conn` 参数结构**：

```json
{
  "type": "conn",
  "value": {
    "node_id": 3,     // 源节点 ID
    "index": 0,       // 源节点的输出引脚编号（pin 0 = 第一个输出）
    "type": "int"     // 传递的数据类型
  }
}
```

### 4.3 数据节点在节点数组中的位置

数据节点**总是排在节点数组的末尾**。这是因为 `buildNodesFromFlow`（`ir_builder.ts` 第 169 行）严格按照 `eventNode → execNodes → dataNodes` 的顺序输出：

```typescript
function buildNodesFromFlow(flow: ExecutionFlow): ServerNode[] {
  nodes.push(buildNodeFromRecord(flow.eventNode, getNext(flow.eventNode.id)))
  flow.execNodes.forEach((execNode) => { ... })
  flow.dataNodes.forEach((dataNode) => { ... })    // ← data 节点最后
}
```

以样例 06 为例，节点数组顺序：`event(1)` → `event(2)` → `double_branch(6)` → `print_big(7)` → `print_small(8)` → **`addition(3)`** → **`multiply(4)`** → **`greaterThan(5)`**

这意味着**节点 ID 与数组索引无关**——data 节点可能 ID 很小（3, 4, 5）但在数组中排在后面（索引 5, 6, 7）。

---

## 5. 控制流与数据流的交汇

### 5.1 exec 节点引用 data 节点

exec 节点通过 `args[]` 中的 `conn` 参数消费 data 节点的输出。这是**控制流和数据流唯一且显式的交汇点**。

```
执行流：事件 → double_branch → print_string
                │
                ├─ 拿到执行权
                ├─ 读取 args[0]，发现是 conn
                ├─ 沿 conn 找到 data 节点链
                │   └─ 求值：addition(10,20) → multiply(×2) → greaterThan(>50)
                ├─ 得到条件值 (bool)
                └─ 选择分支出口
```

### 5.2 按需求值模型

数据流在 IR 层面体现了**按需求值**（demand-driven evaluation）模型：

1. 执行流到达 `double_branch` 节点
2. `double_branch` 需要 `args[0]` 的值
3. 发现 `args[0]` 是 `conn` — 指向 `greater_than` 节点的输出
4. 执行器检查 `greater_than` 是否已求值：未求值，则递归求值
5. `greater_than` 需要其 `args[0]` → 指向 `multiplication` → 继续递归
6. 直到遇到字面量参数（无需求值），开始向上传播结果
7. 最终 `double_branch` 拿到条件值，选择分支出口

这与冯·诺依曼架构（指令按序执行，通过内存传递数据）有本质区别。

---

## 6. 附录：六个样式的完整 IR JSON

### 01 — 顺序执行

```json
{
  "nodes": [
    { "id": 1, "type": "when_entity_is_created" },
    { "id": 2, "type": "when_entity_is_created",
      "next": [ 3 ] },
    { "id": 3, "type": "print_string",
      "args": [{ "type": "str", "value": "step A" }],
      "next": [ 4 ] },
    { "id": 4, "type": "print_string",
      "args": [{ "type": "str", "value": "step B" }] }
  ]
}
```
> 控制流：线性链。无 data 节点。

### 02 — if/else

```json
{
  "nodes": [
    { "id": 1, "type": "when_entity_is_created" },
    { "id": 2, "type": "when_entity_is_created",
      "next": [ 4 ] },
    { "id": 4, "type": "double_branch",
      "args": [{ "type": "conn", "value": { "node_id": 3, "index": 0, "type": "bool" } }],
      "next": [
        { "node_id": 5, "source_index": 0 },
        { "node_id": 6, "source_index": 1 }
      ] },
    { "id": 5, "type": "print_string",
      "args": [{ "type": "str", "value": "guid is 100" }] },
    { "id": 6, "type": "print_string",
      "args": [{ "type": "str", "value": "guid is not 100" }] },
    { "id": 3, "type": "equal",
      "args": [
        { "type": "conn", "value": { "node_id": 2, "index": 1, "type": "guid" } },
        { "type": "guid", "value": 100 }
      ] }
  ]
}
```
> 控制流：`→ double_branch → [then|else]`。数据流：`equal` 被 `double_branch` 引用。

### 03 — 嵌套 if/else if/else

```json
{
  "nodes": [
    { "id": 1, "type": "when_entity_is_created" },
    { "id": 2, "type": "when_entity_is_created", "next": [ 4 ] },
    { "id": 4, "type": "set_local_variable",
      "args": [
        { "type": "conn", "value": { "node_id": 3, "index": 0, "type": "local_variable" } },
        { "type": "conn", "value": { "node_id": 2, "index": 1, "type": "guid" } }
      ], "next": [ 6 ] },
    { "id": 6, "type": "double_branch",
      "args": [{ "type": "conn", "value": { "node_id": 5, "index": 0, "type": "bool" } }],
      "next": [
        { "node_id": 7, "source_index": 0 },
        { "node_id": 9, "source_index": 1 }
      ] },
    { "id": 7, "type": "print_string",
      "args": [{ "type": "str", "value": "case 100" }] },
    { "id": 9, "type": "double_branch",
      "args": [{ "type": "conn", "value": { "node_id": 8, "index": 0, "type": "bool" } }],
      "next": [
        { "node_id": 10, "source_index": 0 },
        { "node_id": 11, "source_index": 1 }
      ] },
    { "id": 10, "type": "print_string",
      "args": [{ "type": "str", "value": "case 200" }] },
    { "id": 11, "type": "print_string",
      "args": [{ "type": "str", "value": "other" }] },
    { "id": 3, "type": "get_local_variable",
      "args": [{ "type": "guid", "value": 0 }] },
    { "id": 5, "type": "equal",
      "args": [
        { "type": "conn", "value": { "node_id": 3, "index": 1, "type": "guid" } },
        { "type": "guid", "value": 100 }
      ] },
    { "id": 8, "type": "equal",
      "args": [
        { "type": "conn", "value": { "node_id": 3, "index": 1, "type": "guid" } },
        { "type": "guid", "value": 200 }
      ] }
  ]
}
```
> 嵌套 `double_branch`，变量提升为 LocalVariable，两个 `equal` 共享同一个 `get_local_variable` 的 guid 输出。

### 04 — switch

```json
{
  "nodes": [
    { "id": 1, "type": "when_entity_is_created" },
    { "id": 2, "type": "when_entity_is_created", "next": [ 3 ] },
    { "id": 3, "type": "multiple_branches",
      "args": [
        { "type": "int", "value": 42 },
        { "type": "int", "value": 100 },
        { "type": "int", "value": 200 },
        { "type": "int", "value": 300 }
      ],
      "next": [
        { "node_id": 4, "source_index": 0 },
        { "node_id": 5, "source_index": 1 },
        { "node_id": 6, "source_index": 2 },
        { "node_id": 7, "source_index": 3 }
      ] },
    { "id": 4, "type": "print_string",
      "args": [{ "type": "str", "value": "default" }] },
    { "id": 5, "type": "print_string",
      "args": [{ "type": "str", "value": "case 100" }] },
    { "id": 6, "type": "print_string",
      "args": [{ "type": "str", "value": "case 200" }] },
    { "id": 7, "type": "print_string",
      "args": [{ "type": "str", "value": "case 300" }] }
  ]
}
```
> `default` 固定为 `source_index=0`，case 按顺序从 1 开始。

### 05 — for 循环

```json
{
  "nodes": [
    { "id": 1, "type": "when_entity_is_created" },
    { "id": 2, "type": "when_entity_is_created", "next": [ 3 ] },
    { "id": 3, "type": "finite_loop",
      "args": [
        { "type": "int", "value": 0 },
        { "type": "int", "value": 4 }
      ],
      "next": [
        { "node_id": 4, "source_index": 0 },
        { "node_id": 5, "source_index": 1 }
      ] },
    { "id": 4, "type": "print_string",
      "args": [{ "type": "str", "value": "loop" }] },
    { "id": 5, "type": "print_string",
      "args": [{ "type": "str", "value": "done" }] }
  ]
}
```
> `source_index=0` = 循环体（反复执行），`source_index=1` = 循环完成（一次）。

### 06 — 复合表达式 + 条件

```json
{
  "nodes": [
    { "id": 1, "type": "when_entity_is_created" },
    { "id": 2, "type": "when_entity_is_created", "next": [ 6 ] },
    { "id": 6, "type": "double_branch",
      "args": [{ "type": "conn", "value": { "node_id": 5, "index": 0, "type": "bool" } }],
      "next": [
        { "node_id": 7, "source_index": 0 },
        { "node_id": 8, "source_index": 1 }
      ] },
    { "id": 7, "type": "print_string",
      "args": [{ "type": "str", "value": "big" }] },
    { "id": 8, "type": "print_string",
      "args": [{ "type": "str", "value": "small" }] },
    { "id": 3, "type": "addition",
      "args": [
        { "type": "int", "value": 10 },
        { "type": "int", "value": 20 }
      ] },
    { "id": 4, "type": "multiplication",
      "args": [
        { "type": "conn", "value": { "node_id": 3, "index": 0, "type": "int" } },
        { "type": "int", "value": 2 }
      ] },
    { "id": 5, "type": "greater_than",
      "args": [
        { "type": "conn", "value": { "node_id": 4, "index": 0, "type": "int" } },
        { "type": "int", "value": 50 }
      ] }
  ]
}
```
> **控制流**：`→ double_branch → print_big|print_small`
>
> **数据流**：`addition(10,20) → multiplication(×2) → greaterThan(>50)` 形成三节点链，全为 data 节点（无 `next`），排在数组末尾，被 `double_branch` 通过 `conn` 消费。
