# 布局任务交接文档 · 第十二轮

> 状态：待继续 / 当前实现分析 / 历史记录
> 来源：当前代码实现 + 用户游戏内测试反馈 + 截图观察
> 最近校验：2026-07-08
> 适用范围：gsts 当前输出的主图布局与复合节点 impl 布局统一工作；不代表编辑器唯一布局规则

> **本轮目标**：在 `布局c` / 场景 C 已通过之后，推进 Round 6 中的场景 D：复杂流程折叠为复合节点。用户指出关键方向：**主图和复合节点内部都可能足够复杂，因此不应维护两套布局算法，应逐步统一为同一套语义布局逻辑**。
> **上一轮文档**：[layout-handover-round-11.md](layout-handover-round-11.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)
> **当前推荐 API 文档**：[../../architecture/composite/raw-control-flow-dsl-quickstart.md](../../architecture/composite/raw-control-flow-dsl-quickstart.md)、[../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)
> **布局协作规则**：[layout-working-rules.md](layout-working-rules.md)

---

## 一、当前状态摘要

### 1.1 场景 C 已通过

本轮之前，`布局c` 系列已经完成并提交：

```text
d3147f5 fix: account for composite data node footprint
86a31a0 fix: preserve data anchors for wide composites
b3e3bdc fix: tune dense dataflow layout spacing
```

用户游戏内确认通过的关键文件包括：

```text
布局c-long-input-step9.gia
布局c-data-count-regression-step12-count-height.gia
布局c-small-input-regression-step8.gia
```

当前可把 **场景 C / `布局c` 多泳道 + 复杂数据流** 标记为已通过。

### 1.2 已开始场景 D：复杂流程折叠为复合节点

新增测试文件：

```text
tests/layout-r6-d-composite-summary.ts
```

导出文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-composite-summary-step1.gia
```

测试意图：主图使用两个复杂复合节点压缩流程；复合节点内部同时包含：

- 执行流：`printString`、内部 `fork` 三条执行线、出口节点。
- 数据流：`dataTypeConversion`、`_3dVectorAddition`、`_3dVectorModuloOperation`、`addition`、`_3dVectorZoom`、`_3dVectorCrossProduct`、`logicalOrOperation`。
- 复合边界：8 个输入参数、4 个输出参数、1 个 InFlow、1 个 OutFlow。

### 1.3 已修复并提交的场景 D 第一个问题

用户反馈：复合节点没有出控制流，导致主控制流连线断开。

修复方式：

- 在 `tests/layout-r6-d-composite-summary.ts` 的复合定义中声明：

```ts
outflows: [{ name: '完成' }]
```

- 在 build 末尾显式注册出口执行节点，并标记 OutFlow：

```ts
const done = f.registerExecNode('print_string', [new strValue('D复合内部：汇合后的后续节点')])
f.outflow('完成', done, 0)
```

用户游戏内验证通过后，又反馈第二个主图问题：第二个复合节点的数据重排把第一个复合节点的输入参数整体移动到了第二个复合节点附近。

根因：主图 `collectDataAncestors(...)` 会穿过上游 exec/composite 节点继续递归，导致下游复合把上游复合的输入数据节点当成自己的数据祖先并重新锚定。

已提交修复：

```text
ff52c7e fix: keep dataflow anchored to owning composite
```

修复点：

- `src/compiler/ir_to_gia_transform/layout.ts`
- `collectDataAncestors(...)` 增加 `traversalStopNodes` 参数。
- 主图数据重排和高度估算时把 `execNodes` 作为递归停止边界。
- 允许直接输入作为当前消费者数据区，但不穿透上游执行节点/复合执行节点继续收集它们自己的输入数据流。

---

## 二、本轮测试资产与交互细节

通用路径、复制命令、小步验证和提交规则见：[layout-working-rules.md](layout-working-rules.md)。本节只记录 R12 特有测试资产。

### 2.1 当前测试文件

当前用于场景 D 的测试文件是：

```text
tests/layout-r6-d-composite-summary.ts
```

当前图名：

```text
_GSTS_R6-D复合摘要-step1
```

当前复合名：

```text
R6-D复杂流程摘要节点
```

当前导出给用户游戏内测试的文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-composite-summary-step1.gia
```

### 2.2 当前测试结构

主图结构：

```text
Event
  -> Print "D主图：开始"
  -> Composite #1: R6-D复杂流程摘要节点
  -> Print first.abilityUnit
  -> Composite #2: R6-D复杂流程摘要节点
  -> InitiateAttack(second outputs)
  -> Print "D主图：结束"
```

复合定义接口：

```text
inputs:
  eventSourceGuid: guid
  locationOffset: vec3
  locationOffsetDelta: vec3
  rotationOffset: vec3
  rotationOffsetDelta: vec3
  locationOffsetScaleBase: float
  enabled: bool
  enabledFallback: bool

outputs:
  abilityUnit: str
  computedLocationOffset: vec3
  computedRotationOffset: vec3
  shouldAttack: bool

outflows:
  完成
```

复合内部数据流：

```text
eventSourceGuid -> dataTypeConversion(str) -> abilityUnit
locationOffset + locationOffsetDelta -> modulo -> addition(scaleBase) -> zoom
rotationOffset + rotationOffsetDelta -> crossProduct(with computedLocationOffset)
enabled OR enabledFallback -> shouldAttack
```

复合内部执行流：

```text
Print "D复合内部：入口"
  fork
    branch A: Print abilityUnit -> Print 上方说明
    branch B: Print str(locationOffsetScale) -> Print 下方说明
    branch C: Print 第三条观察线
  then Print "D复合内部：汇合后的后续节点" -> outflow 完成
```

注意：当前 DSL 的 `f.fork(...); f.printString(...)` 语义并不等于真实 fan-in 汇合，更接近“从最后一个分支继续”。本轮先把它作为布局压力测试；如果未来要验证真实多分支汇合，应改用 raw control-flow DSL 显式连线。

### 2.3 本轮已用命令

构建和导出：

```bash
npm run build
node bin/gsts.mjs tests/layout-r6-d-composite-summary.ts || true
```

查看 Stage 2 IR 的主图与复合定义：

```bash
node - <<'NODE'
const fs=require('fs')
const doc=JSON.parse(fs.readFileSync('dist/tests/layout-r6-d-composite-summary.json','utf8'))[0]
for(const n of doc.nodes) {
  console.log(n.id,n.type,'next',JSON.stringify(n.next),'args',n.args?.map(a=>a?.type==='conn'?`conn:${a.value.node_id}:${a.value.index}:${a.value.type}`:a?.type+':'+a?.value))
}
console.log('composite', JSON.stringify(doc.compositeDefs?.[0]?.inflows), JSON.stringify(doc.compositeDefs?.[0]?.outflows))
for(const n of doc.compositeDefs?.[0]?.implNodes||[]) console.log('impl',n.id,n.type,'next',JSON.stringify(n.next))
NODE
```

解码 GIA 并查看主图/impl 坐标：

```bash
npx tsx tools/decode-gia.ts dist/tests/layout-r6-d-composite-summary.gia > /tmp/r6d-step1.dec.json
node - <<'NODE'
const fs=require('fs')
const j=JSON.parse(fs.readFileSync('/tmp/r6d-step1.dec.json','utf8'))
const acc=j.accessories.find(a=>a.graph&&a.name==='')
const nodes=acc.graph.inner.graph.nodes
for(const n of nodes) {
  console.log(n.nodeIndex,n.genericId?.nodeId,Math.round(n.x*300),Math.round(n.y*200),'pins',n.pins?.map(p=>({k:p.i1?.kind,i:p.i1?.index,c:p.connects?.map(c=>c.id)})))
}
NODE
```

### 2.4 本轮游戏内反馈记录

| 步骤 | 导出文件 | 用户反馈 / 结论 | 处理状态 |
|---|---|---|---|
| D step1 初版 | `布局r6-d-composite-summary-step1.gia` | 复合节点没有出控制流，主控制流断开 | 已在测试复合中声明 `outflows` 并用 `f.outflow(...)` 标记出口；用户确认修复 |
| D step1 修复版 | `布局r6-d-composite-summary-step1.gia` | 第一个复合节点输入参数整体移动到了第二个复合节点位置 | 已提交 `ff52c7e`，数据祖先递归遇到 exec/composite 停止；用户确认修复 |
| D step1 当前阻塞 | `布局r6-d-composite-summary-step1.gia` | 打开复合内部后，控制节点加入后出现大量重复/重叠 | 待处理；方向是统一主图与复合 impl 布局逻辑 |

### 2.5 最近相关提交

```text
ff52c7e fix: keep dataflow anchored to owning composite
b3e3bdc fix: tune dense dataflow layout spacing
86a31a0 fix: preserve data anchors for wide composites
d3147f5 fix: account for composite data node footprint
b9ffa86 docs: record layout step7 handover
3c9c2db fix: encode composite concrete output types
8190d21 fix: preserve concrete input types in composites
a0eaee8 fix: widen layout padding for dense data branches
```

---

## 三、当前阻塞问题：复合 impl 内部布局与主图布局未统一

### 3.1 用户反馈与截图

用户反馈：

> 复合节点内部加入了控制节点之后，出现了大量重复。需要先查看截图，分析可能有哪些问题，分步骤修复验证。

截图：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复合节点-布局错误-step1.png
```

截图观察：

1. 复合 impl 窗口左侧显示大量边界 pin 标记（1/2/3/4/5/7/8 等），与内部节点贴得很近。
2. 执行节点和数据节点大量重叠或近似重叠，看起来像“重复节点”。
3. 数据线穿过执行节点区域，数据流没有形成清楚的数据区块。
4. 复合 impl 内部明显没有享受到主图最近几轮已经完成的数据流布局优化。

自动解码曾观察到复合 impl 内部坐标近似如下（GIA decode 后乘回便于对比的整数）：

```text
执行节点：
2  print 入口              (0,      0)
3  print abilityUnit       (135000, 0)
4  print 上方说明          (270000, 0)
5  print scale             (135000, 52000)
6  print 下方说明          (270000, 52000)
7  print 第三条观察线      (135000, 104000)
8  print 汇合后续          (270000, 104000)

数据节点：
9  data_type_conversion    (0,      0)
10 vec3 addition           (0,      52000)
11 modulo                  (135000, 0)
12 addition                (270000, 0)
13 zoom                    (405000, 0)
14 vec3 addition           (0,      104000)
15 cross product           (540000, 0)
16 logical_or              (0,      156000)
17 data_type_conversion    (405000, 52000)
```

可见，多个 data 节点与 exec 节点共用同一行/同一坐标区域，例如：

```text
print 入口      与 data_type_conversion 同在 (0, 0)
print ability   与 modulo 同在 y=0 附近
print 上方说明  与 addition 同在 y=0 附近
```

### 3.2 用户提出的关键架构判断

用户指出：

> 主图的布局其实和复合节点的布局使用一套逻辑，因为两者都可以做的足够复杂。我们要往这个方向去靠近，而不是维护两套代码。

结论：这个判断正确，应作为下一步工作的核心方向。

原因：

- 主图和复合 impl 都是一个独立 node graph 窗口。
- 二者本质都包含：执行节点、数据节点、执行边、数据边、边界输入/输出。
- 差异主要是边界：主图通常有事件入口；复合 impl 有 InFlow/InParam/OutFlow/OutParam 边界。
- 布局原则应一致：执行流横向主线 + 垂直泳道，数据流靠近消费者并按依赖排列，数据区块影响执行分支间距。

---

## 四、代码探索结论

### 4.1 主图布局入口与能力

主图布局入口：

```text
src/compiler/ir_to_gia_transform/index.ts
```

调用：

```ts
const graphInfo = buildExecutionGraph(ir.nodes!)
const positions = layoutPositions(ir.nodes!, graphInfo, irDoc.compositeDefs ?? [])
```

实现：

```text
src/compiler/ir_to_gia_transform/layout.ts
```

主图当前能力包括：

- `buildExecutionGraph(...)`：分析 exec edges、data connections、execNodes、dataConsumersMap、dataConnections。
- `layoutPositions(...)`：
  - 执行流分支布局。
  - dataflow 靠近消费者。
  - 数据链影响执行节点水平间距。
  - 数据节点数量影响整体高度估算。
  - 大 pin 数复合数据节点增加垂直/水平占位。
  - 普通数据节点行距校准为 175。
  - 数据祖先递归遇到 exec/composite 节点停止，避免下游抢上游复合的输入数据。

主图布局已经逐渐成为当前项目的“语义布局”核心。

### 4.2 复合 impl 当前布局入口与问题

复合 impl 编码入口：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

调用链：

```text
buildCompositeAccessories(...)
  -> buildImplGraphNodes(...)
    -> computeImplLayout(...)
```

当前 impl 布局函数：

```ts
function computeImplLayout(
  nodeResults: Array<{ node: CompositeDefIR['implNodes'][number] }>,
  implNodes: CompositeDefIR['implNodes'],
  implEdges: Record<number, any[]>
): Map<number, { x: number; y: number }>
```

当前常量：

```ts
const LAYOUT_EXEC_H_STEP = 450
const LAYOUT_EXEC_V_STEP = 260
const LAYOUT_DATA_H_STEP = 450
const LAYOUT_DATA_Y_OFFSET = 0
```

当前逻辑：

1. 从 `implEdges` 推出 exec 起点。
2. exec 节点 BFS 排列：`x + 450`，`y + i * 260`。
3. 终端 exec 节点放父节点右侧。
4. 剩余无 exec 边节点视为 data 节点。
5. data 节点按 Kahn 拓扑深度分列：

```ts
x = d * LAYOUT_DATA_H_STEP
y = row * LAYOUT_EXEC_V_STEP + LAYOUT_DATA_Y_OFFSET
```

主要问题：

- data 节点从 `y=0` 开始，和 exec 节点同层。
- data 节点没有按消费者锚定。
- data 节点没有使用主图的 dataParents/dataConsumers 逻辑。
- data 节点不会推动 exec 分支/后续节点。
- 主图新修的复合节点占位、数据节点行距、数据数量高度估算等不会作用于 impl。

这就是截图中“重复/重叠”的根本原因。

---

## 五、统一方向：不要继续维护两套布局算法

### 5.1 不推荐的短期补丁

不建议只在 `computeImplLayout(...)` 中做简单补丁，例如：

```text
把所有 data 节点整体下移 300
遇到坐标冲突再下移
给 impl 单独复制一份 dataflow 逻辑
```

这些补丁可以临时减少重叠，但会产生长期问题：

- 主图每修一个 dataflow bug，impl 也要复制一遍。
- 主图和 impl 的布局行为会持续分叉。
- 场景 D/E/F 会继续暴露同类问题。

### 5.2 推荐方向

逐步把主图布局抽象为通用 node graph 布局，让主图和复合 impl 共享核心逻辑。

目标结构可以是：

```ts
layoutNodeGraph({
  nodes,
  execEdges,
  dataEdges,
  compositeDefs,
  boundaryMode: 'main' | 'compositeImpl'
})
```

但不建议一次性大重构。建议先做最小可行统一。

---

## 六、下一步实施计划（推荐）

### Phase 1：最小统一，复合 impl 复用主图 layout.ts

目标：让复合 impl 先使用主图已有的 `buildExecutionGraph(...) + layoutPositions(...)`，不再走当前简化的 `computeImplLayout(...)`。

步骤建议：

1. 在 `composite.ts` 中引入：

```ts
import { buildExecutionGraph, layoutPositions } from './layout.js'
```

2. 将 `implEdges` 回填到临时 layout nodes 的 `next` 字段。

伪代码：

```ts
const layoutNodes = implNodes.map((node) => ({
  ...node,
  next: implEdges[node.id] ?? node.next
}))
```

注意：`implEdges` 的元素可能是 `NextConnection` 或类似结构；需要保持 `buildExecutionGraph(...)` 能读取。它支持：

```ts
number | { node_id: number; source_index?: number; target_index?: number }
```

3. 调用主图布局：

```ts
const graphInfo = buildExecutionGraph(layoutNodes)
const positions = layoutPositions(layoutNodes, graphInfo, compositeDefs)
```

其中 `compositeDefs` 可来自 `buildImplGraphNodes(..., compositeDefById)` 的参数：

```ts
const compositeDefs = compositeDefById ? [...compositeDefById.values()] : []
```

4. 坐标单位转换。

主图写 GIA 时使用：

```ts
giaNode.setPos(layoutPos[0] / 300, layoutPos[1] / 200)
```

复合 impl 当前 `computeImplLayout` 返回的 `{ x, y }` 会直接写入：

```ts
x: pos.x,
y: pos.y
```

因此复用主图 layoutPositions 时，impl 需要转换为 GIA node 坐标单位：

```ts
x: position[0] / 300
y: position[1] / 200
```

建议先在 `computeImplLayout` 替代函数内返回已经转换后的 `{ x, y }`，保持 `buildImplGraphNodes` 外层少改。

5. 保持 capture 过滤策略不变，先不处理边界留白。

当前 `buildCompositeAccessories(...)` 会过滤 `__composite_capture__`：

```ts
const implNodesForEncoding = def.implNodes.filter(n => n.type !== '__composite_capture__')
```

Phase 1 可以沿用这个策略，只对过滤后的 impl nodes 统一布局。

风险：如果 capture 是唯一 exec root，过滤后可能导致入口识别不完整。但当前 R6-D 测试中实际 exec 节点仍有边，足以验证第一步。

### Phase 2：抽象 layout.ts 为真正通用接口

如果 Phase 1 游戏内验证方向正确，再把 `layout.ts` 整理为更清晰的通用入口，例如：

```ts
export function layoutNodeGraph(
  nodes: IRNode[],
  options?: {
    compositeDefs?: CompositeDefIR[]
    stopDataTraversalAtExec?: boolean
    outputScale?: { x: number; y: number }
    boundaryMode?: 'main' | 'compositeImpl'
  }
): Map<NodeId, Position>
```

主图和 impl 都走此函数。

### Phase 3：复合 impl 边界特化

统一核心布局后，再处理复合 impl 独有的视觉边界：

1. 左侧 InFlow/InParam 边界 pin 留白。
2. 右侧 OutFlow/OutParam 视觉终点。
3. 多 InFlow / 多 OutFlow 的 pin 标记避免挤在内部节点上。
4. capture 节点作为隐藏入口参与布局但不输出实体节点。

这一步不要和 Phase 1 混在一起，避免同时引入太多变量。

---

## 七、下一轮建议小步验证流程

### 7.1 首个改动

只做 Phase 1：复合 impl 调用主图布局核心。

不要同时改：

- 主图布局参数。
- 复合 pinIndex 编码。
- OutFlow/InFlow 映射。
- 测试 DSL 结构。
- 边界 pin 留白。

### 7.2 测试文件

继续使用：

```text
tests/layout-r6-d-composite-summary.ts
```

测试图名建议改为：

```text
R6-D复合摘要-step2-unified-impl-layout
```

导出文件建议：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-composite-summary-step2.gia
```

### 7.3 验证命令

```bash
npm run build
node bin/gsts.mjs tests/layout-r6-d-composite-summary.ts || true
npx tsx tools/decode-gia.ts dist/tests/layout-r6-d-composite-summary.gia > /tmp/r6d-step2.dec.json
```

复制到游戏导入目录：

```bash
export_dir='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
rm -f "$export_dir/布局r6-d-composite-summary-step2.gia"
cp dist/tests/layout-r6-d-composite-summary.gia "$export_dir/布局r6-d-composite-summary-step2.gia"
```

### 7.4 游戏内检查重点

请用户打开：

1. 主图：确认两个复合节点、输入数据流、攻击节点仍然正常。
2. 第一个 `R6-D复杂流程摘要节点` 内部：
   - data 节点是否不再和 exec 节点重叠。
   - 数据流是否更接近主图布局方式。
   - 内部三条执行分支是否仍有合理泳道。
   - 输入 pin 标记是否仍然可接受（边界留白问题可以下一步再处理）。

### 7.5 如果出现问题

优先判断问题属于哪类：

| 问题 | 优先处理 |
|---|---|
| impl 内节点不再重叠，但整体太散/太宽 | 先接受方向，下一步调 composite impl scale 或边界模式 |
| impl 内 exec root 丢失 / 控制线断开 | 检查 `implEdges -> next` 适配是否正确 |
| 数据线连接错 / pin 断线 | 不应由布局导致，检查 `buildImplNodePins` / compositePins 是否被误改 |
| 输入 pin 标记和内部节点仍近 | Phase 3 处理边界留白，不要回退统一布局方向 |

---

## 八、相关代码位置速查

| 任务 | 文件 / 函数 |
|---|---|
| 主图布局入口 | `src/compiler/ir_to_gia_transform/index.ts` / `irToGia(...)` |
| 主图布局核心 | `src/compiler/ir_to_gia_transform/layout.ts` / `buildExecutionGraph(...)`, `layoutPositions(...)` |
| 复合 accessories 编码 | `src/compiler/ir_to_gia_transform/composite.ts` / `buildCompositeAccessories(...)` |
| 复合 impl 节点构建 | `src/compiler/ir_to_gia_transform/composite.ts` / `buildImplGraphNodes(...)` |
| 当前应替换的 impl 布局 | `src/compiler/ir_to_gia_transform/composite.ts` / `computeImplLayout(...)` |
| 复合 OutFlow/InFlow 定义 | `src/runtime/composite_registry.ts` / `toCompositeDefIR(...)` |
| 当前 R6-D 测试 | `tests/layout-r6-d-composite-summary.ts` |

---

## 九、R12 特有风险、注意事项与不要做的事

通用工作规则见：[layout-working-rules.md](layout-working-rules.md)。本节只保留 R12 特有风险：

1. Phase 1 只验证复合 impl 复用主图布局核心，不要同时改 composite pin 编码、测试 DSL 结构和边界 pin 留白。
2. 当前真正的阻塞是 impl 内部 data 节点和 exec 节点坐标冲突/语义布局缺失，不要把 8 个输入/4 个输出造成的边界 pin 标记多误判为编码重复。
3. 场景 D 的问题来自 impl 仍用旧布局，不是场景 C 参数需要回退。
4. 统一布局后坐标尺度可能比旧 impl 大；如果 impl 变宽/变散，先让用户判断可读性，再考虑 composite impl 专属 scale 或 boundary mode。
5. 不要删除 `tests/layout-r6-d-composite-summary.ts` 中的 `outflows: [{ name: '完成' }]` 和 `f.outflow('完成', done, 0)`。

---

## 十、给下一位助手的一句话

> 场景 C 已通过并提交；当前推进场景 D。用户明确要求主图和复合 impl 使用同一套布局逻辑，不要继续维护两套代码。当前复合 impl 的 `computeImplLayout` 是简化 BFS/Kahn 布局，data 节点从 y=0 开始，导致和 exec 节点重叠。下一步应做 Phase 1 最小统一：在 `composite.ts` 中把 `implEdges` 适配成临时 `next`，让 impl 调用 `layout.ts` 的 `buildExecutionGraph + layoutPositions`，并做坐标单位转换；先不处理边界 pin 留白，导出 `布局r6-d-composite-summary-step2.gia` 给用户游戏内验证。
