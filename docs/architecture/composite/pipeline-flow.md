# 管线追踪：三阶段中的复合节点

> 状态：当前实现
> 来源：当前代码实现
> 最近校验：2026-07-16
> 适用范围：gsts 当前复合节点编译管线

> 本文档追踪复合节点定义和调用如何流经编译管线的三个阶段——从 TypeScript 源文件到最终的 `.gia` 二进制文件。
> 参见：[DSL API](./dsl-api.md) | [捕获机制](./capture-mechanism.md) | [IR 表示](./ir-representation.md) | [GIA 编码](./gia-encoding.md)

---

## 三阶段数据流总览

```
Stage 1 (TS → .gs.ts)         Stage 2 (.gs.ts → IR JSON)           Stage 3 (IR JSON → .gia)
┌────────────────────┐        ┌──────────────────────────────┐     ┌─────────────────────────┐
│ defineComposite    │        │                              │     │                         │
│  保持为运行时调用   │───────→│ buildServerGraphRegistries   │     │ irToGia()               │
│                    │        │   IRDocuments()              │     │                         │
│ callComposite()    │        │  ┌────────────────────────┐  │     │ ┌───────────────────┐   │
│  变换为函数调用形式 │        │  │ 1st pass: 捕获复合定义   │  │────→│ buildComposite     │   │
│                    │        │  │ captureComposite()      │  │     │   Accessories()    │   │
│ gstsServer* 同例   │        │  │ build(独立registry)      │  │     │ CompositeDef       │   │
└────────────────────┘        │  │ → CompositeCapture      │  │     │ + impl NodeGraph   │   │
                              │  └────────────────────────┘  │     │ → accessories[]    │   │
                              │                              │     │                     │   │
                              │  ┌────────────────────────┐  │     │ ┌───────────────────┐   │
                              │  │ 2nd pass: 构建主图 IR    │  │     │ __composite_call__  │   │
                              │  │ runCompositeCall()      │  │────→│ → SysGraph         │   │
                              │  │ → __composite_call__     │  │     │   (kind=22001)     │   │
                              │  │   marker node            │  │     │ → relatedIds 关联  │   │
                              │  │ → compositeDataEdges     │  │     └───────────────────┘   │
                              │  │ → compositeCalls metas   │  │     └─────────────────────────┘
                              │  └────────────────────────┘  │
                              │                              │
                              │  输出 IR JSON:                │
                              │    doc.nodes (含marker)       │
                              │    doc.compositeDefs (过滤)   │
                              │    doc.compositeDataEdges     │
                              └──────────────────────────────┘
```

---

## Stage 1：TS → .gs.ts

复合节点相关的 DSL 在这一阶段**基本保持原样**，因为 `defineComposite` 和 `callComposite` 都是运行时函数调用——无需 AST 变换。

### defineComposite

```typescript
// 源代码
export const Add = g.defineComposite('Add', { ... })
```

变换器（`ts_to_gs_transform/`）将 `g.defineComposite` 视为普通函数调用，仅处理 TS 类型注解剥离。不产生节点函数调用。

### callComposite

```typescript
// 源代码
const { result } = f.callComposite(DoubleHandle, { x: int(42) })
```

普通调用在 `.gs.ts` 中保持相同形式。对于 timer callback 中的复合输出，Stage 1 的变量规划会额外读取 `CompositeHandle.__outputs` 类型标记，确保保存 `.value` 或命名 output 时生成 `float` / `vec3` 等正确的局部变量类型；`callComposite` 在阶段二中仍由 `ServerExecutionFlowFunctions` 解析。

### 特殊处理：handle 引用保持

`CompositeHandle` 是一个模块顶层导出的变量，AST 变换需要确保它在 `.gs.ts` 中的引用路径正确。如果 `handle` 在另一个模块中定义，`import` 语句需要保持。

---

## Stage 2：.gs.ts → IR JSON

这是复合节点处理的关键阶段，分为**两趟执行**。

### 第一趟：捕获复合定义

时机：在主线图构建之前。

入口：`buildServerGraphRegistriesIRDocuments()` (`src/runtime/core.ts:1454`)

流程：
1. 遍历 `compositeRegistry.getAll()`
2. 对每个 `captured === null` 的复合定义：
   - 创建独立 `MetaCallRegistry`
   - 调用 `startCaptureFlow()` 创建 `__composite_capture__` 根节点
   - 创建带 `__captureInputName` 标记的占位输入值
   - 执行 `def.build(inputs, fns)`
   - 从 flow 提取 `CompositeCapture`
   - 调用 `def.toCompositeDefIR()` 生成 `CompositeDefIR`

### 第二趟：构建主线图 IR

`emitIrJsonForEntries` 通过子进程执行 `runner.ts`，加载 `.gs.ts` 文件：

```
await import(entryUrl)
  → 模块执行
    → g.server({}).on('event', handler)
    → handler 内部:
        → f.callComposite(handle, params)
          → runCompositeCall(compositeId, inputs, build)
            → 注册 __composite_call__ 标记节点（exec 或 data）
            → 执行 build（第二趟在独立 registry）
            → 返回代理 output 值
```

**关键细节：** `runCompositeCall` 创建一个新的 `MetaCallRegistry` 并执行 build，但此处的 build 是"调用"而非"定义"——它用主图的值作为输入，执行复合的 build 回调以在内层 registry 中生成节点。

### IR JSON 输出过滤

构建 `IRDocument` 时，`compositeDefs` 并非全量输出，而是**按需过滤**——只包含当前文档 `__composite_call__` 节点所引用的定义：

```typescript
const calledIds = new Set<number>()
for (const node of doc.nodes ?? []) {
  if (node.type === '__composite_call__') {
    calledIds.add(Number(node.args[0].value))
  }
}
doc.compositeDefs = allCompositeDefs.filter(d => calledIds.has(d.id))
```

`compositeDataEdges` 也在这个阶段附加到文档顶层。复合输出连接到普通节点时，连接仍表现为普通节点参数中的 `conn`，但 Stage 3 会将来源为 `__composite_call__` 的边从普通数据边物化流程中分离，走复合 OutParam overlay 连接路径。

---

## Stage 3：IR JSON → .gia

`ir_to_gia_transform/index.ts` 中的 `irToGia()` 处理复合节点。

### __composite_call__ 标记节点映射

`resolveGiaNodeId` 将 `__composite_call__` 映射为 GIA 中的 `SysGraph` 类型节点（kind=22001）：

```typescript
SPECIAL_NODE_IDS['__composite_call__'] → GIA SysGraph ID
```

该节点在 `applyGenericArgs` 中处理，其 `nodeId` 来自 GIA vendor 映射。

### buildCompositeAccessories

`composite.ts` 的 `buildCompositeAccessories(def)` 为每个 `CompositeDefIR` 生成一对 `GraphUnit`：

```
CompositeDefIR
  │
  ├─ GraphUnit[0]: CompositeDef（定义 + 接口）
  │   ├─ id: { genericId, concreteId, graphId }
  │   ├─ inflows/outflows/inputs/outputs 引脚定义
  │   ├─ type.kind: Composite
  │   └─ relatedIds: [implGraphId]
  │
  └─ GraphUnit[1]: impl NodeGraph（实现图）
      ├─ id: { class: Basic, type: ServerGraph, id: implGraphId }
      ├─ nodes: GraphNode[]
      ├─ compositePins: outer ↔ inner 映射
      └─ which: EntityNode
```

### graphId 派生

```
implGraphId = def.id + 10000
```

### 节点 ID 重新编号

impl 节点的 IR ID（来自捕获阶段的自增序列）被重新映射为从 1 开始的连续序列：

```typescript
const nodeIndexMap = new Map<number, number>()
def.implNodes.forEach((n, i) => nodeIndexMap.set(n.id, i + 1))
```

### 终端/非终端 OutFlow

在 `ir_to_gia_transform/index.ts` 的 `buildCompositePins` 逻辑中：

- **非终端**：OutFlow 引脚有 connects，正常保留
- **终端**：OutFlow 引脚无 connects → 移除 OutFlow → 下游断连节点收归到 event fork

```typescript
// 终端 OutFlow 处理（简化）
if (outFlowHasConnects(flow)) {
  // 保留 OutFlow pin
} else {
  // 移除 OutFlow pin
  // disconnect downstream, reattach to event fork
}
```

### relatedIds

复合定义通过 `root.graph.relatedIds` 与主子图关联，确保 injector 能正确加载所有附属图单元。

### 时序图：完整数据流

```
        Runtime                          gs_to_ir_json                ir_to_gia_transform
          │                                    │                            │
          │ g.defineComposite('X',...)          │                            │
          │→ CompositeRegistry.define()         │                            │
          │→ id=1610700000                      │                            │
          │                                    │                            │
          │ g.server({}).on('evt', hd)          │                            │
          │→ 注册 ServerGraphRegistry            │                            │
          │                                    │                            │
          │                         .gs.ts 被执行                           │
          │                              │                                 │
          │                              │ buildServerGraphRegistries       │
          │                              │   IRDocuments()                  │
          │                              │                                 │
          │                              │ ① compositeRegistry.getAll()    │
          │←──── build(inputs, fns) ────│  (首次捕获)                      │
          │→ CompositeCapture           │                                 │
          │                              │ ② handler 执行:                  │
          │                              │   f.callComposite(handle, {..}) │
          │←──── runCompositeCall() ────│→ __composite_call__ marker node  │
          │                              │                                 │
          │                              │→ IR JSON                        │
          │                              │  { nodes, compositeDefs,        │
          │                              │    compositeDataEdges }         │
          │                              │                                 │
          │                              │            IR JSON → irToGia()  │
          │                              │              │                  │
          │                              │              │__composite_call__ │
          │                              │              │ → SysGraph node  │
          │                              │              │                  │
          │                              │              │buildComposite    │
          │                              │              │  Accessories()   │
          │                              │              │→ CompositeDef    │
          │                              │              │→ impl NodeGraph  │
          │                              │              │→ accessories[]   │
          │                              │              │                  │
          │                              │              │→ .gia binary     │
```
