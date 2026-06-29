# 阶段二：.gs.ts → IR JSON — 图脚本执行到中间表示

> 本文档描述编译管线第二阶段：如何执行 .gs.ts 图脚本文件，产生节点与连线的中间表示（IR JSON）。

---

## 1. 概述

**目标**：将阶段一产出的 `.gs.ts` 文件**在 Node.js 中实际执行**，"捕获"执行过程中创建的每一对节点和连线，生成结构化 JSON 输出。

**位置**：`src/compiler/gs_to_ir_json_transform/`

**输入**：`.gs.ts` 文件（带 `// @gsts:entry` 标记）

**输出**：IR JSON 文件（`.json`）

**核心思想**：节点图的构建是一个**运行时过程**——`g.server()`、`f.add()`、`f.callComposite()` 等调用在 JavaScript 层面执行时，会通过 `ir_builder` API 登记（register）节点、数据连线、执行流连线。执行结束后，从全局注册表提取 IR 文档序列化为 JSON。

---

## 2. 执行入口：runner.ts

`src/compiler/gs_to_ir_json_transform/runner.ts` 是阶段 2 的执行入口。

### 执行流程

```typescript
// runner.ts 主函数
async function main() {
  // 1. 读取命令行参数
  const [entryFile, outFile, compactFlag] = process.argv.slice(2)
  
  // 2. 设置运行时优化选项（从环境变量读取）
  setRuntimeOptions({
    optimize: {
      precompileExpression: process.env.GSTS_PRECOMPILE_EXPR === '1',
      removeUnusedNodes: process.env.GSTS_REMOVE_UNUSED_NODES === '1'
    }
  })
  
  // 3. 动态导入 .gs.ts 文件
  const entryUrl = pathToFileURL(entryFile).href
  await import(entryUrl)    // ← 关键！这会执行 .gs.ts 中的所有代码
  
  // 4. 从全局注册表提取 IR JSON
  const json = JSON.stringify(
    buildServerGraphRegistriesIRDocuments({
      defaultName: defaultGraphNameFromEntryFile(entryFile)
    }),
    null,
    compactFlag === '1' ? 0 : 2
  )
  
  // 5. 写入输出文件
  fs.writeFileSync(outFile, json, 'utf8')
}
```

### 关键洞察

**整个阶段 2 依赖 Node.js 模块加载机制**：

1. `await import(entryUrl)` 加载 `.gs.ts` 文件
2. `.gs.ts` 文件包含对 `src/runtime/` 代码的导入
3. 执行过程中，所有 `g.server()` / `f.method()` 调用都在全局变量 `globalThis.gsts` 上注册
4. 加载完成后，`buildServerGraphRegistriesIRDocuments()` 从全局状态中收集并构建 IR 文档

---

## 3. 编排入口：index.ts

`src/compiler/gs_to_ir_json_transform/index.ts` 提供上层编排函数。

### emitIrJsonForEntries

```typescript
async function emitIrJsonForEntries(entries: string[], opts: GsToJsonOptions) {
  // 1. 为每个入口文件解析 .gs.ts → .json 路径
  // 2. 使用 runWithLimit 并发执行（默认 cpu 核心数 - 1）
  // 3. 每个文件通过 spawn(tsx, [runner, entry, out]) 子进程执行
}
```

**为什么用子进程**：因为 `import()` 会污染全局状态，如果连续 import 多个文件会导致冲突。每个 `.gs.ts` 文件需要在**独立的 Node.js 进程**中执行。

---

## 4. IR 数据结构

### IRDocument

```typescript
interface IRDocument {
  ir_version: 1             // IR 格式版本
  ir_type: 'node_graph'     // 文档类型
  variables?: Variable[]     // 节点图变量定义
  graph: ServerGraphInfo     // 图元数据
  nodes?: ServerNode[]       // 图中所有节点
  compositeDefs?: CompositeDefIR[]  // 复合节点定义
  compositeCalls?: CompositeCallMeta[]  // 复合节点调用元数据
}
```

### ServerNode

```typescript
interface ServerNode {
  id: number                // 节点唯一 ID
  type: string              // 节点类型名（如 'addition', 'doubleBranch'）
  args?: Argument[]         // 节点参数（值参数 + 连线参数）
  next?: NextConnection[]   // 执行流出口连线
  position?: [number, number]  // 布局位置（可选）
}
```

### Argument 类型

```typescript
type Argument = 
  | { type: 'int', value: number }          // 字面量值参数
  | { type: 'str', value: string }
  | { type: 'bool', value: boolean }
  | { type: 'float', value: number }
  | { type: 'conn',                       // 连线参数（引用另一个节点的输出）
      value: { 
        node_id: number,                  // 源节点 ID
        index: number,                    // 源节点输出引脚索引
        type: string                      // 值类型
      }
    }
  | { type: 'enum', value: string }
  | // ... 更多类型
```

### NextConnection

```typescript
interface NextConnection {
  node_id: number            // 目标节点 ID
  source_index?: number      // 源执行流引脚索引
  target_index?: number      // 目标执行流引脚索引
}
```

### Variable

```typescript
interface Variable {
  name: string
  type: ValueType            // 'int' | 'float' | 'str' | 'bool' | 'vec3' | 'int_list' | ...
  value?: unknown            // 可选初始值
  dict?: { k: string, v: string }  // 字典变量的键值类型
}
```

---

## 5. 运行时执行机制

### 5.1 GlobalThis.gsts

当 `await import('.gs.ts')` 执行时，`.gs.ts` 中调用的 `g.server()` / `f.add()` 等函数实际上是在操作 `globalThis.gsts` 上的全局状态。

核心工作流：

```
.gs.ts 被执行
  │
  ├─ g = globalThis.gsts  ← 入口处引用
  │
  ├─ g.server({ name, ... })  → 创建一个 Server 注册项
  │
  ├─ .on('event', handler)    → 为 Server 添加事件处理器
  │
  ├─ handler 体内：
  │    ├─ f.add(a, b)         → ir_builder 创建一个 add 节点
  │    ├─ f.log(str('x'))     → ir_builder 创建一个 log 节点
  │    ├─ if/switch/loop      → 在变换阶段已转为函数调用
  │    └─ return / break      → 函数调用形式的控制流终止
  │
  └─ buildServerGraphRegistriesIRDocuments()  
       → 从注册表提取所有节点、连线、变量，构建 IR
```

### 5.2 全局注册表

`src/runtime/server_globals.ts` 维护了全局注册表，包括：

- `serverGraphRegistries` — 所有 Server 图定义的数组
- 每个注册项包含图的元数据（name、mode、sub_type）以及所有节点和连线

`buildServerGraphRegistriesIRDocuments()` 函数遍历这些注册项，为每个注册项生成一个 `IRDocument`：

```typescript
// 核心流程（简化）
function buildServerGraphRegistriesIRDocuments(opts) {
  const registries = getServerGraphRegistries()
  return registries.map(registry => {
    const doc: IRDocument = {
      ir_version: 1,
      ir_type: 'node_graph',
      graph: { name, id, type: 'server', mode, sub_type },
      nodes: registry.nodes.map(n => n.toIR()),
      variables: registry.variables,
      compositeDefs: registry.compositeDefs,
      compositeCalls: registry.compositeCalls,
    }
    return doc
  })
}
```

---

## 6. ID 分配与追踪

```
节点 ID 通过递增计数器分配：
  let nextId = 1
  getId() => nextId++
  每个 f.method() 调用在创建节点时获取下一个可用 ID
```

连线（connections）在节点创建时隐式产生：
- **数据连线**：当 B 的一个参数是 `conn` 类型（引用了 A 的输出）时，表示 A→B 有数据连线
- **执行流连线**：通过 `.next` 字段指定下一个执行的节点

---

## 7. 优化选项

阶段 2 支持两个编译期优化：

| 优化 | 环境变量 | 效果 |
|------|----------|------|
| `precompileExpression` | `GSTS_PRECOMPILE_EXPR=1` | 预计算纯字面量表达式（如 `1 + 2` → `3`），消除冗余计算节点 |
| `removeUnusedNodes` | `GSTS_REMOVE_UNUSED_NODES=1` | 移除没有消费者且不影响副作用的节点 |

这些优化在 `src/runtime/runtime_config.ts` 中配置，通过 `setRuntimeOptions()` 设置。

---

## 8. IR JSON 示例

```json
[
  {
    "ir_version": 1,
    "ir_type": "node_graph",
    "graph": {
      "name": "my_graph",
      "id": 1073741828,
      "type": "server",
      "mode": "beyond"
    },
    "variables": [
      { "name": "x", "type": "int", "value": 42 }
    ],
    "nodes": [
      {
        "id": 1,
        "type": "time_scale_change_event",
        "args": [],
        "next": [{ "node_id": 2, "source_index": 0, "target_index": 0 }]
      },
      {
        "id": 2,
        "type": "addition",
        "args": [
          { "type": "int", "value": 1 },
          { "type": "conn", "value": { "node_id": 1, "index": 0, "type": "int" } }
        ],
        "next": [{ "node_id": 3, "source_index": 0, "target_index": 0 }]
      }
    ]
  }
]
```

每个 `.gs.ts` 入口文件生成一个 JSON 数组，数组元素是一个或多个 `IRDocument`。
