# 多 OutFlow 复合节点实现指南

## 背景

当前复合节点实现仅支持 0 或 1 个 OutFlow。游戏支持有**多个命名 OutFlow** 的控制流复合节点（如"顺序执行"：1 个入口 → 4 个出口，每个出口可连不同下游）。

## 参考文件

```
user_edit/纯复合节点-顺序执行.gia  — 复合定义文件 (graph.which=12, 独立定义)
user_edit/顺序执行.gia              — 使用该复合的主图文件 (graph.which=9)
```

## 两种 GIA 文件格式

| 属性 | 定义文件 (纯复合节点-顺序执行) | 使用文件 (顺序执行) |
|------|------------------------------|---------------------|
| `graph.which` | **12** (CompositeGraph) | **9** (EntityNode) |
| `graph.compositeDef` | 直接挂在 graph 上 | 无（定义放在 accessories 里）|
| `graph.graph` | 无 | 有（主图节点）|
| accessories | impl graph (which=9) | CompositeDef (which=12) + impl graph (which=9) |

**关键**：定义文件 (`which=12`) 把 CompositeDef 放在 `graph.compositeDef`，impl graph 放在 accessories。使用文件 (`which=9`) 反过来——CompositeDef 和 impl graph 都在 accessories。

## 参考文件完整结构

### 定义文件 (纯复合节点-顺序执行.gia)

```
graph.which = 12  (CompositeGraph)
graph.name = "顺序执行"
graph.compositeDef → CompositeDef:
  inflows:  1 条, pinIndex=6
  outflows: 4 条, pinIndex=8,9,10,11, 全名"是"
  inputs:   0
  outputs:  0
  id.genericId/concreteId: kind=22001, id=1610612738
  id.graphId: kind=21002, id=1610612738

accessories[0] (which=9, EntityNode):
  impl graph (id.kind=21002, id.id=1610612738):
    nodes[1-5]: 全部 kind=22000 nodeId=2  (Sequence/Branch 内置节点)
    compositePins:
      InFlow(1:0)  → node2 InFlow(1:0)    ← 入口
      OutFlow(2:0) → node3 OutFlow(2:0)   ← 出口1 (pinIndex=8)
      OutFlow(2:1) → node1 OutFlow(2:0)   ← 出口2 (pinIndex=9)
      OutFlow(2:2) → node4 OutFlow(2:0)   ← 出口3 (pinIndex=10)
      OutFlow(2:3) → node5 OutFlow(2:0)   ← 出口4 (pinIndex=11)

    内部连线: node2(OutFlow) → node3, node1, node4, node5 (1→4 fork)
```

### 使用文件 (顺序执行.gia)

```
主图 (graph.which=9):
  node[1] event: kind=22000 nodeId=71
    OutFlow → node5
  node[5] composite: kind=22001 nodeId=1610612738
    OutFlow[0] cpi=8 → node6 (printString)
    OutFlow[1] cpi=9 → node8 (printString)
    (只用了 4 个 OutFlow 中的 2 个)
```

### 使用文件变体 (顺序执行2.gia) — 同一 OutFlow fork + 多 OutFlow 汇聚

```
event(1) → composite(5) ┬→ OutFlow[0] cpi=8 → node6, node8   ← 一个 pin fork 两个目标
                         └→ OutFlow[1] cpi=9 → node8          ← node8 被两个 pin 同时连接
```

差异仅一行：`OutFlow[0]` 的 connects 从 `[→6]` 变为 `[→6, →8]`。

含义：
- **一对多 fork**：一个 OutFlow pin 可以有多个 connect，执行流分叉
- **多对一汇聚**：同一个下游节点可以被多个来源的 OutFlow 连接

### 使用文件中 composite call 节点的 OutFlow pins

```json
// 主图中 composite call node (nodeIndex=5) 的 pins:
[
  {
    "i1": {"kind": 2, "index": 0},  // OutFlow, 第0个
    "compositePinIndex": 8,          // 对应 CompositeDef.outflows[0].pinIndex
    "connects": [{"id": 6, "connect": {"kind": 1, "index": 0}, ...}]
  },
  {
    "i1": {"kind": 2, "index": 1},  // OutFlow, 第1个
    "compositePinIndex": 9,          // 对应 CompositeDef.outflows[1].pinIndex
    "connects": [{"id": 8, "connect": {"kind": 1, "index": 0}, ...}]
  }
]
```

每个 OutFlow 是独立的 pin，有自己的 `index` 和 `compositePinIndex`，各自连到不同的下游节点。

## 需要修改的文件

### 1. `src/runtime/IR.d.ts` — 类型定义

**CompositeDefIR.outflows**（第 238 行）：已是 `ControlFlowDef[]` 数组，类型正确，不需要改。

**CompositePinEntry**（第 282 行）：已是多条目结构，不需要改。

**需要新增**：`CompositeCallMeta` 需支持"哪个 OutFlow 连到哪个下游节点"的信息。当前只有单一的 flow 连接。

### 2. `src/runtime/composite_registry.ts` — 捕获与 IR 生成

**toCompositeDefIR()**（第 144-167 行）：

当前：
```typescript
outflows: hasExec
  ? [{ name: '', visible: true, index: 0, pinIndex: 4 }]
  : [],
```
只生成 0 或 1 条 outflows。

**需要改**：支持多条 outflows，从捕获数据中获取 OutFlow 的数量、名称和 pinIndex。

**compositePins 计算**（第 100-141 行）：当前只计算 1 条 OutFlow 映射。需要遍历所有 OutFlow，为每个建立 outer→inner 映射。

**捕获阶段**：`CompositeCapture` 需要记录 impl graph 中所有 exec 出口节点及其对应的 OutFlow index。

### 3. `src/compiler/ir_to_gia_transform/composite.ts` — GIA 编码

**buildCompositeAccessories()**（第 26-165 行）：

outflows 编码（第 61-67 行）已支持多条目：
```typescript
outflows: def.outflows.map((flow) => ({
  name: flow.name, visible: flow.visible,
  index: { kind: NodePin_Index_Kind.OutFlow, index: flow.index },
  description: '', pinIndex: flow.pinIndex
})),
```
不需要改，只需上游数据正确。

**compositePins 编码**（第 140-154 行）：已支持多条，不需要改。

**需要新增**：定义文件格式 (`which=12`) 的编码。当前只输出 usage 格式 (`which=9`)。需要支持"仅导出定义"的格式。

### 4. `src/compiler/ir_to_gia_transform/index.ts` — 主图构建

**`__composite_call__` 节点创建**（第 496-533 行）：

当前只添加 0 或 1 个 OutFlow pin。需要改为：
```typescript
// 为每个 outflows 添加 OutFlow pin
for (const outflow of cdef.outflows) {
  const p = new Pin(giaNode.ConcreteId!, 2, outflow.index)  // OutFlow
  ;(p as any).compositePinIndex = outflow.pinIndex
  giaNode.pins.push(p)
}
```

**Post-encoding exec flow 修正**（第 647-678 行）：

当前逻辑移除所有复合的 OutFlow。需要改为：
- 保留所有合法的 OutFlow pins（与 CompositeDef.outflows 对应）
- 只为"多余的" OutFlow（flow 连接产生但 CompositeDef 未声明）做处理

### 5. `src/runtime/core.ts` — 运行时与 API

**`callComposite()` 返回值路由**：

当前 `callComposite` 返回 `outputs` 对象，调用方通过 `result.输出名` 消费数据。对于控制流复合，还需要表达"在哪个 OutFlow 后继续执行"。

可能需要新的 API 模式：
```typescript
// 假设的 API：指定 OutFlow index
const branch = f.callComposite(seqComp, {})
branch.on('是', 0, () => { /* 第1个出口之后 */ })
branch.on('是', 1, () => { /* 第2个出口之后 */ })
```

这是 API 层最大的设计挑战。

### 6. `src/definitions/nodes.ts` — callComposite 实现

**ServerExecutionFlowFunctions.callComposite**：

当前实现将 `__composite_call__` 作为单个标记节点插入 flow。需要支持：调用方在不同 OutFlow 后插入不同节点的能力。

## 实现难点

### 难点 1：API 设计

当前 API 是线性函数式：
```typescript
f.callComposite(comp, inputs)  // 返回 outputs
f.printString(...)             // 继续在线性 flow 中
```

多 OutFlow 复合打破了线性假设——执行流分裂为多个分支。需要新的 API 来表达分支语义。这与现有所有节点的模型都不兼容。

### 难点 2：捕获阶段识别出口节点

当前 capture 只记录 execNodes 的线性列表。对于多 OutFlow，需要记录：
- 哪些内部节点是"出口节点"
- 每个出口对应哪个 OutFlow index
- 内部 fork 节点的映射关系

`CompositeCapture` (composite_registry.ts:15) 需要扩展数据结构。

### 难点 3：IR 的 DAG 表示

当前 IR 是线性 next 链 (`Node.next: number[]`)。多 OutFlow 需要在 IR 中表达"DAG 分叉"，即一个节点有多个下游 next，分别对应不同的 OutFlow index。需要在 `ServerNode` 中新增 `outFlowBranches` 或类似字段。

### 难点 4：GIA 文件格式切换

当前只生成 `which=9` 的 usage 格式。要支持 `which=12` 的定义文件格式，需要：
- 新的导出入口（仅定义，不生成主图）
- `irToGia` 支持 `mode: 'definition' | 'usage'`

## 建议的实现路径

分两期：

**一期**（较低的果实）：单 OutFlow 完善
- 让现有的 0/1 OutFlow 完全正确工作（CompositeDef + compositePins + post-encoding 对齐）
- 已验证的参考：`user_edit/复杂_exec.gia`、`user_edit/复杂2_exec.gia`

**二期**（架构变更）：多 OutFlow
- API 设计 + 捕获重构 + IR DAG 化 + GIA 多 OutFlow 编码
- 参考：`user_edit/纯复合节点-顺序执行.gia`、`user_edit/顺序执行.gia`

## 已知限制

### local_variable 类型不支持作为复合 InParam

`compositeTypeToBaseTag()` 无法映射 `local_variable` 类型（VarType=16），导致为其创建的 InParam pin 会被 `filterUnkPins` 移除。`graph.connect()` 不会自动创建 pin，所以连接无法建立。

**影响**：定义了 `local_variable` 类型输入的复合节点，该 InParam 在当前实现中会被丢弃。

**修复方向**：
- Pin.setType 支持 `{t:'e', e:some_id}` 格式映射到 LocalVariable，或
- 扩展 NodeType 系统支持非标准类型，或
- graph.connect() 自动创建目标 pin

**参考**：`user_edit/两个复合节点.gia` 中的 "设置局部变量" 复合（InParam type=16 连接 get_local_variable OutParam）

## 参考文件路径汇总

| 文件 | 用途 |
|------|------|
| `user_edit/纯复合节点-顺序执行.gia` | 多 OutFlow 复合定义文件 (which=12, 4 OutFlow) |
| `user_edit/顺序执行.gia` | 多 OutFlow 复合使用例 (2 个 OutFlow 被使用) |
| `user_edit/复杂_exec.gia` | 单 OutFlow：非终端 comp1(outflows=1) + 终端 comp2(outflows=0) |
| `user_edit/复杂2_exec.gia` | 单 OutFlow：终端 comp1(outflows=0) + 非终端 comp2(outflows=1) |
| `user_edit/two_exec.gia` | Pattern 1：event fork 到两个终端复合 |
| `user_edit/two_exec2.gia` | Pattern 2：event→comp1→comp2 串行 |
| `真-测试通过/basic_call.gia` | 已验证单复合 |
| `真-测试通过/basic_call_param.gia` | 已验证带参数复合 |
| `docs/composite-outflow-impl-guide.md` | 单 OutFlow 实现指南（上一期文档）|

## 关键常量

| 值 | 含义 |
|----|------|
| `graph.which=9` | EntityNode — 使用文件格式 |
| `graph.which=12` | CompositeGraph — 定义文件格式 |
| `nodeId=71` | event (whenEntityIsCreated) |
| `nodeId=1` | printString |
| `nodeId=2` | Sequence/Branch 控制流节点 |
| `OutFlow kind=2` | 执行流出口 pin |
| `InFlow kind=1` | 执行流入口 pin |
| `compositePinIndex` | 主图 pin → CompositeDef outflows[i].pinIndex 的关联键 |
| `pinIndex=1974` | InFlow 约定 pinIndex |
| `pinIndex=4` | 单 OutFlow 约定 pinIndex |
| `pinIndex=6` | 多 OutFlow 复合的 InFlow pinIndex |
| `pinIndex=8,9,10,11` | 多 OutFlow 复合的各出口 pinIndex |
