# 嵌套复合节点实现指南

复合 A 的 `build()` 内部调用 `f.callComposite(B, {})` — 复合 B 的 impl 图嵌入到复合 A 的 impl 图中。

## 参考文件与数据规模

三文件交叉验证（三个 subagent 独立分析后汇总）：

| 文件 | accessories | 嵌套节点 | 来源 |
|------|------------|---------|------|
| `嵌套.gia` | 6 | 3 个 (2 层嵌套) | user_edit/ |
| `弹球.gia` | 70 | 25 个 | 复杂gia/ |
| `传球.gia` | 29 | 7 个 | 复杂gia/ |
| **`物理运动.gia`** | **106** | **58 个** | 复杂gia/ ← 最大样本 |

---

## 一、genericId / concreteId 编码

```typescript
{
  class: NodeGraph_Id_Class.SystemDefined,  // 10001
  type: NodeProperty_Type.Server,           // 20000
  kind: NodeGraph_Id_Kind.SysGraph,         // 22001（非 SysCall(22000)）
  nodeId: compositeId                       // 嵌套复合的 CompositeDef.id
}
```

concreteId 与 genericId 完全一致。与普通节点的唯一差异：`kind: 22001 (SysGraph)`。

---

## 二、Pin 编码规则（三文件 93 节点验证）

`NodePin_Index_Kind`: 0=Unknown, 1=InFlow, 2=OutFlow, 3=InParam, 4=OutParam, 5=ClientExecNode, 6=ClientSignal

### 2.1 总则

| Pin 种类 | 出现在节点 pin 数组? | 出现在 compositePins? | 验证 |
|---------|-------------------|---------------------|------|
| **InFlow** (1) | ❌ **永不** | ✅ 总是 (exec 型) | 93/93 确认 |
| **OutFlow** (2) | ✅ 仅编码有 connects 的分支 | ✅ outer→inner | 所有 OutFlow 均有 connects |
| **InParam** (3) | ⚠️ 见 2.2 规则 | ✅ outer→inner | 按来源分流 |
| **OutParam** (4) | ❌ **永不** | ✅ 总是 (有 output 时) | 93/93 确认 |
| **ClientExecNode** (5) | ✅ 信号型复合 | ❌ 否 | 弹球 3 + 物理运动 6 |

### 2.2 InParam 的 pin 出现规则（核心）

**一条硬规则决定一切**：InParam pin 出现在嵌套节点上的**充要条件**是——在 impl 图内部有一条 edge 以该 pin 为端点。

| InParam 的值的来源 | 有内部 edge? | 需要 node pin? | 示例 |
|-------------------|-------------|---------------|------|
| 同层其他节点的 OutParam（数据连接） | 是 | **✅ 是**（带 connects） | 物理运动 n[30] InParam:0→OutParam |
| 父 build 的字面量 | 否 | **✅ 是**（无 connects） | 物理运动 n[10] InParam:1 |
| 外层 compositePins 路由 | 否 | **❌ 否**（隐式） | v-to-string 8 实例全 0 pin |
| 与其他节点的 InFlow 边（exec 流） | 是 | **✅ 是** | 嵌套.gia n[5] OutFlow:2|

**关键洞察**：**compositePins 路由 ≠ 内部 edge**。compositePins 是外层到内层的边界映射，不会在 impl 图内部产生 edge。因此纯 passthrough 的 InParam 不需要 node pin。

**验证案例**——同一复合 "清楚特效" (1610612961) 在不同上下文中的不同表现：

```
Graph [30] n[2]: 只有 OutFlow:0 一个 pin
  → InFlow+InParam 由 compositePins 提供（无内部 edge）→ 不用 pin
  → OutFlow:0 连接到内部节点 n[46] → 需要 pin

Graph [23] n[7]: 只有 InParam:0 一个 pin
  → InFlow 来自内部 edge n[51]→...→n[7] → 不需要 InFlow pin
  → InParam:0 连接到 n[45] OutParam → 需要 pin（有 connects）
```

### 2.3 信号型复合（特殊分类）

**"监听信号"** (inflows=0, outflows=1, CompositeDef which=12) 和 **SignalDef** (which=14) 均可在 impl 图中作为 kind=22001 节点出现。它们的特点：

- OutFlow pin（接收信号时触发执行流）
- **ClientExecNode** kind=5 pin（携带信号名称 bStr，如 `"物理运动引擎实体"`）
- InParam pins（发送信号时携带数据）

正确的分类不是"exec"也不是"纯数据"，而是**"信号型"**。它们通过信号系统驱动执行，不依赖 InFlow。

### 2.4 OutFlow 规则

- 仅出现在 exec 型和信号型
- **只编码有 connects 的 OutFlow 分支**——未使用的不生成 node pin
- 使用 `compositePinIndex` = 嵌套复合自己 outflow 定义的 pinIndex

示例（弹球 n[51] "顺序执行"，定义有 4 outflows，仅 3 个有连接）：
```
OutFlow:0 cpi=514 →[43:InFlow:0]
OutFlow:1 cpi=515 →[3:InFlow:0]
OutFlow:2 cpi=516 →[7:InFlow:0]
// OutFlow:3 未使用 → 无 pin
```

### 2.5 三类型汇总

| 属性 | Exec 型 (inflows>0) | 纯数据型 (inflows=0) | 信号型 (inflows=0, outflows>0) |
|------|-------------------|--------------------|-------------------------------|
| 数量 | 21 | 69 | ~9 |
| InFlow pin | 隐式 | N/A | 隐式（如果有） |
| OutFlow pin | 仅连接的分支 | N/A | 仅连接的分支 |
| InParam pin | 有内部 edge 时 | 有内部 edge 时 | 有内部 edge 时 |
| OutParam pin | 隐式 | 隐式 | 隐式 |
| ClientExecNode | 无 | 无 | **有** (kind=5) |
| 典型入图方式 | InFlow 或内部 edge | 数据连线 | 内部 OutFlow edge |

---

## 三、同复合多实例

同一 composite 不同实例的 pin 数可能不同，由**实例的实际连接需求**决定：

| 复合 | 实例数 | pin 变化 | 根因 |
|------|--------|---------|------|
| mul3 (3 inputs) | 5 | 3/3/2/3/3 | 2-pin 实例: InParam:0 由 compositePins 路由，不用 pin |
| v-to-string (1 input) | 8 | 0×8 | 始终由 compositePins 路由 |
| 顺序执行 (4 outflows) | 2 | 3/2 | 分别使用 3/2 个 OutFlow 分支 |
| 向量内积 (2 inputs) | 3 | 1×3 | InParam:1 每实例都有数据连接；InParam:0 始终由 compositePins |

---

## 四、嵌套.gia 验证

在嵌套.gia 中验证了 2 层嵌套结构与上述规则完全一致：

```
第 1 层: 嵌套 → 顺序执行3
   n[5] 仅有 OutFlow:2（连接 n[6] InFlow）
   无 InFlow/InParam/OutParam node pin（全部由 compositePins 路由）

第 2 层: 顺序执行3 → 加法(2)
   n[8] 纯数据 0 pin（全部由 compositePins 路由）
```

两层使用完全相同的规则。InFlow/OutParam 在所有层级都隐式。

---

## 五、改动清单

### 5.1 `composite.ts` — `resolveImplNodeId`

```typescript
if (nodeType === '__composite_call__') {
  return Number((args?.[0]?.value as any) ?? 0)
}
```

### 5.2 `composite.ts` — `buildImplGraphNodes`

```typescript
// __composite_call__ 节点使用 kind=SysGraph(22001)
genericId = {
  class: NodeGraph_Id_Class.SystemDefined,  // 10001
  type: NodeProperty_Type.Server,
  kind: NodeGraph_Id_Kind.SysGraph,         // 22001
  nodeId: compositeId
}
```

### 5.3 `composite.ts` — `buildImplNodePins`

```typescript
function buildPinsForNestedComposite(node, nestedDef, implEdges, dataConns) {
  const pins = []

  // 1. OutFlow: 仅编码有 connects 的分支
  const outEdges = implEdges[node.id]
  if (outEdges) {
    for (const [srcIdx, edges] of groupEdgesBySourceIndex(outEdges)) {
      const cpi = nestedDef.outflows[srcIdx]?.pinIndex
      const p = { kind: OutFlow, index: srcIdx, compositePinIndex: cpi }
      // 稍后填充 connects（在 buildImplGraphNodes 的第二阶段）
      dataConns.push({ nodeId: node.id, pin: p, edges })
      pins.push(p)
    }
  }

  // 2. InParam: 检查复合 Pins 表判断是否由 outer compositePins 路由
  for (let i = 0; i < nestedDef.inputs.length; i++) {
    const isViaCompositePins = compositePins.some(cp =>
      cp.innerNodeId === node.id &&
      cp.innerPinKind === 3 && // InParam
      cp.innerPinIndex === i
    )
    if (isViaCompositePins) continue // 隐式，不需要 pin

    // 检查是否有数字连接或字面量值
    const arg = node.args[i + 1] // args[0]=compositeId, args[1..]=inputs
    const cpi = nestedDef.inputs[i].pinIndex
    
    if (arg && arg.type === 'conn') {
      // 数据连接: 创建 InParam + 记录 dataConns
      dataConns.push({ nodeId: node.id, i, cpi, upstreamNodeId: arg.value.node_id, upstreamPinIndex: arg.value.index })
    }
    
    pins.push({ kind: InParam, index: i, compositePinIndex: cpi })
  }

  // 3. ClientExecNode: 信号型复合
  if (nestedDef.outflows?.length > 0 && nestedDef.inflows?.length === 0 && hasSignalName(node)) {
    pins.push({ kind: ClientExecNode, index: 0, compositePinIndex: ... })
  }

  return pins
}
```

### 5.4 `composite_registry.ts` — compositePins

**移除** line 164 的 `__composite_call__` 跳过逻辑。嵌套复合的 InParam/OutParam 映射必须正常生成。

### 5.5 `composite_registry.ts` — implNodes

保持包含 `__composite_call__`。args[0] = compositeId（int 字面量），args[1..] = 输入参数。

---

## 六、可实施性检查

**结论：只需要以下 4 个输入即可确定嵌套节点的 pin 集：**
1. `__composite_call__` 节点自身的 args 和 id
2. 嵌套复合的 `CompositeDefIR`（inputs/outputs pinIndexes, inflows/outflows 数量）
3. `implEdges` 表（确定哪些 OutFlow 分支有 connects）
4. `compositePins` 表（确定哪些 InParam 由外路由，不需要 pin）

不需要额外信息。

---

## 七、关键代码位置

| 文件 | 行号 | 改动 |
|------|------|------|
| `core.ts` | 1058 | `registerNode` 注册 `__composite_call__`（已有） |
| `composite_registry.ts` | 164 | **移除** `__composite_call__` 跳过 |
| `composite_registry.ts` | 207-209 | implNodes 包含嵌套调用节点（已有） |
| `composite.ts` | 395-418 | `resolveImplNodeId` — **新增** compositeId 提取 |
| `composite.ts` | 186-266 | `buildImplGraphNodes` — **改为 SysGraph kind** |
| `composite.ts` | 467-540 | `buildImplNodePins` — **按规则重写** |
| `index.ts` | 496-549 | 主图处理（pinIndex 参考） |
