# 编码为 GIA 的数据流 + 代码位置

> 状态：当前实现 + 真实 GIA 验证对照
> 来源：当前代码实现（gsts 编译器）；部分标注来自真实 GIA 验证
> 最近校验：2026-07-06
> 适用范围：gsts 编码逻辑说明；验证段标注了与游戏编辑器的差异。

> 参见：[二进制/JSON 结构详解（architecture）](../architecture/composite/gia-encoding.md)

## 1. 数据流

```
TypeScript build()
    ↓ 运行时执行（core.ts）
Runtime Capture (CompositeCapture)
    ↓ toCompositeDefIR()（composite_registry.ts）
IR JSON (CompositeDefIR)
    ↓ buildCompositeAccessories() — composite.ts
GIA Protobuf (CompositeDef + impl NodeGraph, 作为 accessories)
```

## 2. IR JSON → GIA 编码规则

### CompositeDefIR → accessories

每个 `CompositeDefIR` 编码为一对 `GraphUnit`：

1. **第 1 个**（`which=CompositeGraph`）：CompositeDef 结构
   - `inflows/outflows/inputs/outputs` 转为 protobuf 字段
   - `id` 使用三分结构（genericId / concreteId / graphId）
   - `type.kind = 1000 (Composite)`

2. **第 2 个**（`which=EntityNode`）：impl NodeGraph
   - 节点列表（implNodes 重编号为从 1 开始的连续 nodeIndex）
   - compositePins 转为 `outerPin → innerNodeId + innerPin` 映射
   - 每条映射有 `innerPin2` 字段，值与 `innerPin` 一致

### __composite_call__ 标记节点 → 主图 GIA 节点

- `kind=22001 (SysGraph)`
- `nodeId` = CompositeDef.id
- 添加 InParam/OutParam pins → 设置 `compositePinIndex`
- 不在此处添加 OutFlow pin（由 graph.flow() 或 post-encoding 处理）

### post-encoding 修正

- **非终端复合**：保留 OutFlow pin + connects
- **终端复合**：移除 OutFlow pin，下游收归 event fork
- **connected InParam**：设 value = null
- **event 节点**：过滤多余的 OutParam pins（参考文件中 event 仅有 OutFlow）

### 主图的 composite call 节点规范

参考文件中复合调用节点上的所有 pin 都通过 `compositePinIndex` 与 CompositeDef 关联。

**关键 ID 对照**：

| 概念 | 值 |
|------|-----|
| kind=22000 | SysCall — 系统调用（普通节点） |
| kind=22001 | SysGraph — 系统图（复合调用节点） |
| nodeId | CompositeDef.id（对复合调用节点） |
| genericId / concreteId | 完全一致 |
| graphId | 实现图的 ID（CompositeGraph 种类） |
| compositePins nodeIndex | IR 节点 ID 重新编号（gsts 生成时为 1-based；编辑器文件使用原值） |

> ⚠️ **2026-06-30 验证**：`docs/architecture/composite/pipeline-flow.md` 声称 `implGraphId = def.id + 10000` 且 nodeIndex 重新编号为 1-based 连续。我们使用 3 个真实 GIA 文件验证：
> - **graphId 公式完全错误**：85/85 个非内置复合不符此公式（0% 通过率）
> - **nodeIndex 1-based 连续也错误**：大部分 impl 图使用非连续、非 1 起始的 nodeIndex
>
> 上述规则仅对 gsts 生成的复合文件有效。游戏编辑器创建的文件使用不同的 ID 分配和编号策略。

## 3. 代码位置速查

| 文件 | 内容 |
|------|------|
| `src/runtime/IR.d.ts:233-289` | CompositeDefIR / CompositePinEntry / CompositeCallMeta 类型 |
| `src/runtime/composite_registry.ts:91-309` | CompositeRegistry.define() 与 toCompositeDefIR() |
| `src/runtime/composite_registry.ts:37-57` | CompositeCapture 类型 |
| `src/runtime/core.ts:1047-1080` | runCompositeCall() — 运行时注册复合调用 |
| `src/runtime/core.ts:1454-1576` | buildServerGraphRegistriesIRDocuments() — 捕获+注入 IR |
| `src/compiler/ir_to_gia_transform/composite.ts:26-179` | buildCompositeAccessories() — IR→GIA 编码 |
| `src/compiler/ir_to_gia_transform/composite.ts:384-418` | resolveImplNodeId() — 解析 impl 节点类型 |
| `src/compiler/ir_to_gia_transform/composite.ts:464-550` | buildImplNodePins() — impl 节点 pin 构建 |
| `src/compiler/ir_to_gia_transform/index.ts:486-549` | \_\_composite_call\_\_ 节点在主图的编码 |
| `src/compiler/ir_to_gia_transform/index.ts:610-629` | compositeDataEdges 处理 |
| `src/compiler/ir_to_gia_transform/index.ts:636-743` | post-encoding 修正 |
| `src/compiler/ir_to_gia_transform/layout.ts` | impl 图布局计算（BFS+Kahn） |
| `src/compiler/ir_to_gia_transform/preprocess.ts` | 列表字面量展开为 assembly_list 节点 |

## 4. 解析工具

| 工具 | 用法 | 用途 |
|------|------|------|
| `tools/decode-gia.ts` | `npx tsx tools/decode-gia.ts <file.gia>` | 完整 JSON 输出，可 pipe 到 jq |
| `tools/analyze-composite-gia.ts` | `npx tsx tools/analyze-composite-gia.ts <file.gia>` | 结构化可读摘要 + cpi 校验 |
| `tools/topology.ts` | `npx tsx tools/topology.ts <file.gia>` | ASCII 执行流拓扑 + 数据连线 |
| `tools/preview_markdown.ts` | `npx tsx tools/preview_markdown.ts <file.md>` | Markdown 转 ANSI 终端预览 |

**常用 jq 查询**：
```bash
# CompositeDef 概要
npx tsx tools/decode-gia.ts file.gia 2>/dev/null | \
  jq '[.accessories[] | select(.which==12) | {name, outflows: [.compositeDef.inner.def.outflows[].pinIndex]}]'

# 主图复合调用节点
npx tsx tools/decode-gia.ts file.gia 2>/dev/null | \
  jq '.graph.graph.inner.graph.nodes[] | {nodeIndex, nodeId: .genericId.nodeId, pins: (.pins | length)}'

# 查看 compositePins 路由
npx tsx tools/decode-gia.ts file.gia 2>/dev/null | \
  jq '.accessories[] | select(.which==9) | .graph.inner.graph.compositePins[] | {outer: "\(.outerPin.kind):\(.outerPin.index)", inner: "\(.innerPin.kind):\(.innerPin.index)"}'
```

---

## 5. SignalDef（which=14）编码

> 参见 `01-ir-types.md §5` 的 SignalDef 类型定义。当前编码器（`composite.ts`）尚不输出 `which=14`——本节记录文件格式以便未来支持。

SignalDef 是一种与 CompositeDef 平级的 accessory 类型，用于定义自定义信号的发送接口。

**编码特征**：

| 属性 | 值 |
|:----|:---|
| `which` | `14`（不在 TypeScript `GraphUnit_Which` 枚举中，作为运行时值处理） |
| `id.type` | `0 (ServerGraph)` |
| 有效负载 | `compositeDef.inner.def` — 仅存放接口声明（inflows/outflows/inputs/outputs） |
| `relatedIds` | 关联到对应的"监听信号"CompositeDef ID |
| impl 图 | ❌ 无（信号是内置的，非用户定义） |
| `graph` 字段 | `null` — 不包含实现图 |

**与 CompositeDef 的编码对比**：

```
CompositeDef 编码: GraphUnit { which=12, compositeDef: {...}, 有 impl graph (which=9 附件) }
SignalDef 编码:     GraphUnit { which=14, compositeDef: {interface_only}, relatedIds: [...], graph: null }
structureDef 编码:  GraphUnit { which=29, structureDef: {...}, relatedIds: [...] }
```

**关键区别**：SignalDef 使用 `compositeDef` 字段存放接口声明，但**没有对应的 `which=9` 附件**作为实现图。`compositeDef.inner.def` 仅包含 inflows/outflows/inputs/outputs，不含 impl 节点。信号的实际逻辑由游戏引擎内置实现。

## 6. structureDef（which=29）编码

> 参见 `01-ir-types.md §6` 的 structureDef 类型定义。当前编码器（`composite.ts`）尚不输出 `which=29`。

structureDef 是一种注册结构体类型的 accessory，用于定义 struct 数据类型的字段结构。

**编码特征**：

| 属性 | 值 |
|:----|:---|
| `which` | `29` (`GraphUnit_Which.StructureDefinition`) |
| `id.type` | `15 (StructureDefinition)` — 独立的 ID 命名空间 |
| 有效负载 | `structureDef` 字段（proto `gia.proto.ts:304-370`） |
| `relatedIds` | 聚合操作该结构体类型的所有 CompositeDef（拼装/拆分/修改） |

**与 CompositeDef 的相互引用**：

```
structureDef (which=29, id.type=15)
  relatedIds → CompositeDef (which=12, id.type=20000) × N
```

这意味着一个结构体类型和其操作复合之间通过 `relatedIds` 建立了双向关联：
- structureDef 的 `relatedIds` 列出所有操作该类型的 CompositeDef ID
- 这些 CompositeDef 的 `relatedIds` 不应为空（引用回 structureDef？需验证）

> **未来扩展**：如果需要生成 structureDef，可在 `composite_registry.ts` 中添加 `toStructureDefIR()` 函数，输入结构体类型声明，输出 `StructureDefIR` 类型。
