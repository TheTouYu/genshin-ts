# 复合节点 IR JSON 产物解读

> 本文档教你如何阅读和理解复合节点编译产生的 IR JSON 文件——这是调试和验证复合节点正确性的核心工具。
> 参见：[IR 表示](./composite/ir-representation.md)（类型定义参考） | [捕获机制](./composite/capture-mechanism.md) | [DSL API](./composite/dsl-api.md)

---

## 1. 快速入门

### 1.1 如何获得 IR JSON

运行任意包含复合节点的 `.ts` 文件，gl 管线在 Stage 2 输出 `.json` 文件：

```bash
# 通过 CLI（自动匹配 entries）
npx tsx bin/gsts.mjs -c gsts.test.config.ts

# 产物位置（依 config.outDir 而定）
#   dist/tests/<name>.gs.ts   ← Stage 1
#   dist/tests/<name>.json    ← Stage 2（本文分析对象）
#   dist/tests/<name>.gia     ← Stage 3
```

或直接运行示例脚本一步到位：

```bash
npx tsx tests/composite/demo_addsub2.ts
# 输出 dist/tests/demo_addsub2.json + .gia
```

### 1.2 JSON 文件整体结构

```
IR JSON (数组，每个元素是一个 IRDocument)
│
├─ ir_version      ← 版本号（当前为 1）
├─ ir_type         ← 固定 "node_graph"
├─ graph           ← 图元数据（name, mode 等）
├─ nodes           ← 主图中的所有节点（含 __composite_call__）
├─ compositeDefs   ← 复合节点定义（被此图实际调用的）
└─ variables       ← 变量定义（可为空）
```

**关键：** `nodes` 是**主子图**的执行节点；`compositeDefs` 是**子图定义**（复合节点的内部结构）。两者在不同的命名空间中。

---

## 2. 主图节点（nodes）— 调用方视角

以 `demo_addsub2` 的 JSON 为例：

```json
"nodes": [
  {
    "id": 2,
    "type": "when_entity_is_created",
    "next": [3]
  },
  {
    "id": 3,
    "type": "__composite_call__",
    "args": [
      { "type": "int", "value": 1610700000 },   // ← args[0] = composite ID
      { "type": "int", "value": 10 },            // ← args[1] = 输入 a
      { "type": "int", "value": 3 }              // ← args[2] = 输入 b
    ],
    "next": [4]
  },
  {
    "id": 4,
    "type": "print_string",
    "args": [{ "type": "str", "value": "和=..." }],
    "next": [5]
  },
  {
    "id": 5,
    "type": "print_string",
    "args": [{ "type": "str", "value": "差=..." }]
  }
]
```

### 关键字段解释

| 字段 | 含义 |
|------|------|
| `id` | 节点在当前图内的唯一编号（从事件节点开始递增） |
| `type` | 节点类型名。`__composite_call__` 是复合调用的**标记节点** |
| `next` | 执行流连线。`[3]` 表示当前节点执行完后执行节点 3 |
| `args` | 节点参数。复合调用时 `args[0]` 固定为 compositeId |

### 执行流追踪

```
when_entity_is_created (id=2)
  │ next→[3]
  ▼
__composite_call__ (id=3, compositeId=1610700000)
  │ next→[4]
  ▼
print_string (id=4)  →  print_string (id=5)
```

复合节点调用在主子图中表现为一个**普通执行节点**——它有 `next` 字段指向下个节点，和其他 exec 节点一样参与执行流。差别在于它的 `type` 是 `__composite_call__` 而非具体游戏节点类型。

### 复合调用 vs 普通调用

```
普通节点调用：f.addition(a, b)
  → { "id": N, "type": "addition", "args": [...] }

复合节点调用：f.callComposite(handle, { a: ..., b: ... })
  → { "id": N, "type": "__composite_call__",
      "args": [compositeId, arg0, arg1, ...] }
```

**纯数据复合**（无 exec 节点）的标记节点不参与执行流——它注册为 data 类型，没有 `next` 字段。

---

## 3. 复合定义（compositeDefs）— 定义方视角

```json
"compositeDefs": [
  {
    "name": "加减运算2",         // 复合节点名称
    "id": 1610700000,            // 唯一 ID（从 1610700000 递增）
    "type": "composite",

    "inflows": [],               // exec 流入（空 = 纯数据复合）
    "outflows": [],              // exec 流出（空 = 纯数据复合）

    "inputs": [                  // 数据输入引脚声明
      { "name": "a", "index": 0, "type": "int", "pinIndex": 100 },
      { "name": "b", "index": 1, "type": "int", "pinIndex": 101 }
    ],
    "outputs": [                 // 数据输出引脚声明
      { "name": "和", "index": 0, "type": "int", "pinIndex": 200 },
      { "name": "差", "index": 1, "type": "int", "pinIndex": 201 }
    ],

    "implNodes": [               // 内部实现节点
      { "id": 2, "type": "addition",    "args": [null, null] },
      { "id": 3, "type": "subtraction", "args": [null, null] }
    ],
    "implEdges": {},             // 内部执行连线（纯数据复合为空）

    "compositePins": [ ... ]     // ⭐ 核心：内外引脚映射
  }
]
```

### 3.1 inputs / outputs — 复合的"接口"

这四个数组定义了复合节点在外部看来长什么样：

```
            ┌─────────────────────┐
            │     加减运算2        │
   InParam  │                     │  OutParam
   pinIndex │  ┌───────────────┐  │  pinIndex
     100 ───┼─→│  a (int)      │  │
            │  │               │  │──→ 200 (和: int)
     101 ───┼─→│  b (int)      │  │──→ 201 (差: int)
            │  └───────────────┘  │
            └─────────────────────┘
```

- `pinIndex` 是 GIA 层面的物理引脚编号。InParam 从 100 开始，OutParam 从 200 开始
- `index` 是逻辑序号（从 0 开始，对应 `inputs` 数组中的位置）

### 3.2 implNodes — 复合的"内脏"

`implNodes` 是 build 回调中创建的所有**内部节点**。

对于 `加减运算2`，build 回调创建了两个节点：

```
build: (args, f) => {
  const sum = f.addition(args.a, args.b)       // → implNode id=2, type=addition
  const diff = f.subtraction(args.a, args.b)   // → implNode id=3, type=subtraction
  return { 和: sum, 差: diff }
}
```

> **为什么 args 全是 null？** 因为 args 的原始值（来自 capture 输入的占位值）没有实际数据。这些"空洞"由 `compositePins` 映射填补——实际值在执行时从外部传入。

**有 exec 节点的复合**则会有 `implEdges` 记录内部执行流连线：

```json
"implEdges": {
  "2": [{ "node_id": 3, "source_index": 0, "target_index": 0 }]
}
```

意思是"节点 2 执行完后 → 节点 3"。

### 3.3 compositePins 详解 ⭐

这是**复合节点最核心的机制**——它建立了"复合的外部引脚"和"内部节点引脚"之间的映射。

```json
"compositePins": [
  // 输入参数：外层 a (index=0) → 内部 addition 节点 (id=2) 的 InParam 0
  { "outerPinKind": 3, "outerPinIndex": 0, "innerNodeId": 2, "innerPinKind": 3, "innerPinIndex": 0 },

  // 输入参数：外层 b (index=1) → 内部 addition 节点 (id=2) 的 InParam 1
  { "outerPinKind": 3, "outerPinIndex": 1, "innerNodeId": 2, "innerPinKind": 3, "innerPinIndex": 1 },

  // 输入参数：外层 a (index=0) → 内部 subtraction 节点 (id=3) 的 InParam 0
  { "outerPinKind": 3, "outerPinIndex": 0, "innerNodeId": 3, "innerPinKind": 3, "innerPinIndex": 0 },

  // 输入参数：外层 b (index=1) → 内部 subtraction 节点 (id=3) 的 InParam 1
  { "outerPinKind": 3, "outerPinIndex": 1, "innerNodeId": 3, "innerPinKind": 3, "innerPinIndex": 1 },

  // 输出参数：外层 和 (index=0) → 内部 addition 节点 (id=2) 的 OutParam 0
  { "outerPinKind": 4, "outerPinIndex": 0, "innerNodeId": 2, "innerPinKind": 4, "innerPinIndex": 0 },

  // 输出参数：外层 差 (index=1) → 内部 subtraction 节点 (id=3) 的 OutParam 0
  { "outerPinKind": 4, "outerPinIndex": 1, "innerNodeId": 3, "innerPinKind": 4, "innerPinIndex": 0 }
]
```

#### pinKind 对照表

| kind 值 | 常量名 | 含义 |
|---------|--------|------|
| 1 | InFlow | 执行流入口 |
| 2 | OutFlow | 执行流出口 |
| 3 | InParam | 数据输入 |
| 4 | OutParam | 数据输出 |

#### 图解映射

```
外层（复合定义）                内层（实现节点）
┌─────────────────┐        ┌──────────────────┐
│  inputs:         │        │ implNode id=2    │
│  a (index=0) ────┼────────┼─→ InParam 0     │  addition
│  b (index=1) ────┼──┐     │  InParam 1      │
│                   │  ├─────┼─→ InParam 0     │
│  outputs:         │  │     │  OutParam 0 ────┼──→ 和 (index=0)
│  和 (index=0) ←──┼──┘     └──────────────────┘
│                   │        ┌──────────────────┐
│  差 (index=1) ←──┼────────┼─→ OutParam 0     │  subtraction
└─────────────────┘        │  id=3             │
                            └──────────────────┘
```

注意 `a`（input index=0）映射了**两条** InParam 映射——因为它被同时传递给了 addition 和 subtraction 节点。同一输入在内部有多个消费点时，每个消费点都会生成一条 compositePin。

---

## 4. 有 exec 节点的复合 — 对比示例

纯数据复合和 exec 复合的 JSON 差异：

| 特征 | 纯数据（加减运算2） | exec 复合（如 多类型复合测试） |
|------|-------------------|------------------------------|
| `inflows` | `[]` | `[{ pinIndex: 1974 }]` |
| `outflows` | `[]` | `[{ pinIndex: 4 }]`（单出口）或 `[{ pinIndex: 8 }, { pinIndex: 9 }]`（多出口） |
| `implEdges` | `{}` | 有实际连线，如 `{ "1": [{ "node_id": 2 }] }` |
| `compositePins` 中 InFlow/OutFlow | 无 | 有 `kind=1` / `kind=2` 的条目 |
| 主图中的标记节点 | data 类型，无 next | exec 类型，有 next |

多 OutFlow 示例（来自 `ts_g_define_多类型复合测试.gia` 的 compositePins）：

```json
// InFlow: 外层流入 → 内部第一个 exec 节点
{ "outerPinKind": 1, "outerPinIndex": 0, "innerNodeId": 1, "innerPinKind": 1, "innerPinIndex": 0 },
// OutFlow: 内部最后一个 exec 节点 → 外层流出
{ "outerPinKind": 2, "outerPinIndex": 0, "innerNodeId": 1, "innerPinKind": 2, "innerPinIndex": 0 }
```

---

## 5. 真实参考文件对比

将 gsts 输出与游戏导出的参考 GIA 对比时，看下列关键字段即可确认正确性：

```
                    gsts 输出                 参考 GIA（游戏导出）
─────────────────────────────────────────────────────────────
implNodes 数量     2 (addition + subtraction)   2 (subtraction + addition)
implNodes nodeId   200, 202                     202, 200    ← 顺序可能不同
compositePins 数量  6                            6
compositePins 映射  完全一致                       参考基准
```

对比示例：

```bash
# gsts 生成 → GIA
npx tsx tests/composite/demo_addsub2.ts

# 解码查看
npx tsx -e "
import { decode_gia_file } from './dist/src/.../decode.js'
console.log(decode_gia_file('dist/tests/demo_addsub2.gia', '.../gia.proto'))
"
```

---

## 6. 常见调试场景

### 6.1 compositePins 数量不对

检查 capture 输出：`CompositeCapture` 的 `outputValues` 应包含 build 返回值中每个 output 的 pin 元数据。如果某些 output 忘记 `return`，该输出的映射条目会缺失。

### 6.2 复合调用后返回值无法使用

`callComposite` 返回的每个属性都是通过 `markPin(markerRecord, 'output', outIdx)` 创建的代理值。在 IR JSON 中查看 `__composite_call__` 节点的 args——如果 args 只有 compositeId，说明参数传递异常。

### 6.3 嵌套复合不生效

当前复合 build 中调用另一个复合时，需要 `runCompositeCall` 创建新的独立 registry。在 IR JSON 中检查：如果 `compositeDefs` 中没有被嵌套调用的复合定义，说明捕获未正确触发。

### 6.4 `args` 为 null 是否正常？

**是。** `implNodes` 的 args 为 null 是因为 capture 输入是占位值（`__captureInputName` 标记），没有实际数据。这些 null 由 `compositePins` 在运行时映射回真实值。只有在 `args` 中出现 `{ "type": "conn", ... }` 时，才表示内部节点之间有**数据连线**。

---

## 7. JSON 产物速查表

| 你要找什么 | 在 JSON 的哪里 |
|-----------|---------------|
| 复合被哪些主图调用了 | `nodes[].type === '__composite_call__'` 的 `args[0].value` |
| 复合定义长什么样 | `compositeDefs[0]` |
| 复合有几个参数 | `compositeDefs[0].inputs.length` / `.outputs.length` |
| 复合内部有哪些节点 | `compositeDefs[0].implNodes` |
| 参数 a 在内部连到哪 | `compositePins` 中 `outerPinKind=3, outerPinIndex=0` 的条目 |
| 某内部节点的输出映射到啥 | `compositePins` 中 `outerPinKind=4` 且 `innerNodeId=X` 的条目 |
| 纯数据还是 exec 复合 | `compositeDefs[0].inflows.length === 0`（纯数据）|
| 是否有跨复合数据连线 | `compositeDataEdges`（在文档顶层）|
