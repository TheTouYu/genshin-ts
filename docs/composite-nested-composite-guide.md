# 嵌套复合节点实现指南

复合 A 的 `build()` 内部调用 `f.callComposite(B, {})` — 复合 B 的 impl 图嵌入到复合 A 的 impl 图中。

## 参考文件与数据规模

| 文件 | accessories | 嵌套节点 | exec/数据/信号 | 来源 |
|------|------------|---------|---------------|------|
| `嵌套.gia` | 6 | 3 | 2 / 1 / 0 | user_edit/ |
| `弹球.gia` | 70 | 25 | 13 / 12 / 0 | 复杂gia/ |
| `传球.gia` | 29 | 7 | 3 / 4 / 0 | 复杂gia/ |
| `物理运动.gia` | 106 | 58 | 5 / 53 / 0 | 复杂gia/ |

---

## 一、genericId / concreteId 编码（✅ 已确认）

```typescript
{
  class: NodeGraph_Id_Class.SystemDefined,  // 10001
  type: NodeProperty_Type.Server,           // 20000
  kind: NodeGraph_Id_Kind.SysGraph,         // 22001（非 SysCall）
  nodeId: compositeId                       // 嵌套复合的 CompositeDef.id
}
```

concreteId 与 genericId 完全一致。与普通节点的唯一差异：`kind: 22001 (SysGraph)` 替代 `22000 (SysCall)`。

---

## 二、Pin 编码规则（三文件交叉验证）

`NodePin_Index_Kind`: 0=Unknown, 1=InFlow, 2=OutFlow, 3=InParam, 4=OutParam, 5=ClientExecNode, 6=ClientSignal

### 2.1 规则总表

| Pin 种类 | 出现条件 | 验证依据 |
|---------|---------|---------|
| **InFlow** (1) | **从不出现** — 全部由 compositePins 路由 | 93/93 节点 0 InFlow |
| **OutFlow** (2) | **仅出现在有 connects 的分支** — 每个有效 exec 下游一个 pin | 所有 OutFlow pin 都有 connects |
| **InParam** (3) | **需要区分来源**：<br>• 数据连接 → 有 pin（带 connects）<br>• 字面量 → 有 pin（无 connects）<br>• 外层 compositePins 路由 → **无 pin**（隐式） | 见 2.2 详细分析 |
| **OutParam** (4) | **从不出现** — 全部由 compositePins 路由 | 93/93 节点 0 OutParam |
| **ClientExecNode** (5) | 信号/监听类复合的可选标记 | 弹球 3 个、物理运动 6 个 |
| **Unknown** (0) | 未在参考中观察到 | 0 出现 |

### 2.2 InParam 的三类来源（关键）

同一个嵌套复合的不同实例，其 InParam pin 数量可以不同（已验证："mul3" 有 2 pin 和 3 pin 两种实例）。差异源自 InParam 的值来源不同：

| 来源 | 需要 pin? | 有 connects? | compositePinIndex |
|------|----------|-------------|-------------------|
| 来自 impl 图中其他节点的数据连接 | ✅ 是 | 是 | 嵌套复合自己的 input pinIndex |
| 来自父 build 的字面量/运行时值 | ✅ 是 | 否 | 同上 |
| 来自外层 compositePins 路由（passthrough） | ❌ 否 | N/A | 由 compositePins 的 outerPin 指定 |

**验证案例**（物理运动 `mul3`，3 个输入 a/b/c）：
- acc[6] n[30]：全部 3 个 InParam 有数据连接 → 3 pins，全有 connects
- acc[79] n[10]：2 个有连接 + 1 个无连接（字面量） → 3 pins，2 有 connects
- acc[89] n[9]：2 个有连接 + 1 个无连接（passthrough） → 2 pins（passthrough 被省略）

### 2.3 Exec vs 数据复合的区别

数据来自三文件汇总：

| | Exec 型 (inflows>0) | 数据型 (inflows=0) | 信号监听型 (inflows=0, outflows>0) |
|---|---|---|---|
| 数量 | 21 | 69 | 3 |
| InFlow | 隐式 | N/A | 隐式 |
| OutFlow | 仅有连接的分支 | N/A | 仅有连接的分支 |
| InParam | 全量（所有 inputs） | 仅非 compositePins 路由的 | 仅非 compositePins 路由的 |
| OutParam | 隐式 | 隐式 | 隐式 |
| ClientExecNode | 无 | 无 | 有 |

**例外**：exec 型中 `StartTickManager` 和 `StopTickManager` 在物理运动中为 0 InParam — 仅有 1 个 input 但完全由 compositePins 路由。

### 2.4 纯数据复合的 pin 编码细节

纯数据复合（inflows=0）在物理运动中极为常见（53/58 嵌套节点）。规则：

- 仅当 InParam 在 impl 图内有数据连接或携带字面量时，才出现在节点 pin 数组中
- 当 InParam 来自外层 compositePins 路由时，pin 省略（隐式）
- **永远没有 OutFlow / OutParam / InFlow pin**
- **没有 ClientExecNode**（除非是信号相关）

物理运动数据复合 pin 统计：28/53 有 pin，25/53 为 0 pin。

### 2.5 OutFlow 编码细节

- 仅出现在 exec 型和信号监听型
- 只编码有 connects 的 OutFlow 分支
- 使用 `compositePinIndex` = 嵌套复合自己 outflow 定义的 pinIndex
- 同一复合的多个 OutFlow 可能分散在不同节点

示例（弹球 n[51] "顺序执行"，4 outflows，仅 3 个使用）：
```
OutFlow:0 cpi=514 →[43:InFlow:0]
OutFlow:1 cpi=515 →[3:InFlow:0]
OutFlow:2 cpi=516 →[7:InFlow:0]
// OutFlow:3 未使用 → 无 pin
```

---

## 三、同复合多实例

同一 composite 可在 impl 图中多次出现。pin 数量和种类取决于每次调用的上下文：

| 复合 | 实例数 | pin 变化 | 原因 |
|------|--------|---------|------|
| mul3 | 5 | 3/3/2/3/3 pin | passthrough vs 数据连接不同 |
| v-to-string | 8 | 0/0/0/0/0/0/0/0 | 始终 passthrough |
| w衰减力矩 | 2 | 1/0 pin | 不同上下文 |
| 顺序执行 | 2 | 3/2 OutFlow | 不同数量的 exec 分支使用 |

---

## 四、改动清单

### 4.1 `composite.ts` — `resolveImplNodeId`

```typescript
if (nodeType === '__composite_call__') {
  // args[0] = int(BigInt(compositeId))
  return Number((args?.[0]?.value as any) ?? 0)
}
```

### 4.2 `composite.ts` — `buildImplGraphNodes`

`__composite_call__` 节点使用 `kind: SysGraph (22001)`：

```typescript
if (nodeType === '__composite_call__') {
  genericId = {
    class: NodeGraph_Id_Class.SystemDefined,  // 10001
    type: NodeProperty_Type.Server,
    kind: NodeGraph_Id_Kind.SysGraph,         // 22001
    nodeId: compositeId
  }
}
```

需要能访问嵌套复合的 `CompositeDefIR`（获取 inputs/outputs pinIndex、inflows/outflows 数量）。

### 4.3 `composite.ts` — `buildImplNodePins`

核心逻辑：

```
function buildPinsForNestedComposite(node, nestedDef, implEdges, dataConns) {
  const pins = []

  // 1. OutFlow: 仅编码有 exec 下游的分支
  const outEdges = implEdges[node.id]
  if (outEdges) {
    for (const [srcIdx] of groupEdgesBySourceIndex(outEdges)) {
      const cpi = nestedDef.outflows[srcIdx]?.pinIndex
      pins.push({ kind: OutFlow, index: srcIdx, compositePinIndex: cpi })
    }
  }

  // 2. InParam: 编码非 compositePins 路由的输入
  for (let i = 0; i < nestedDef.inputs.length; i++) {
    const isViaCompositePins = /* 此 InParam 是否由外层 compositePins 路由 */;
    if (!isViaCompositePins) {
      const cpi = nestedDef.inputs[i].pinIndex
      // 检查是否有数据连接
      pins.push({ kind: InParam, index: i, compositePinIndex: cpi })
    }
  }

  // 3. ClientExecNode: 信号/监听类复合
  if (isSignalListener(nestedDef)) {
    pins.push({ kind: ClientExecNode, index: 0, compositePinIndex: ... })
  }

  return pins
}
```

**实现难点**：判断一个 InParam 是否 "由 compositePins 路由"。这需要分析 `compositePins` 表 — 如果存在 `outerPinKind=3 → innerNodeId=当前节点 innerPinIndex=该InParam` 的条目，则此 InParam 是 passthrough，可省略。

### 4.4 `composite_registry.ts` — compositePins 生成

移除 line 164 的 `__composite_call__` 跳过逻辑。嵌套复合的 InParam/OutParam 映射需要生成。

### 4.5 `composite_registry.ts` — implNodes

保持包含 `__composite_call__`。args[0] = compositeId（int 字面量），args[1..] = 输入参数。

---

## 五、不确定项（边缘 case）

| 项目 | 状态 | 说明 |
|------|------|------|
| genericId | ✅ | 10001/20000/22001/compositeId |
| InFlow 永远隐式 | ✅ | 93 节点全验证 |
| OutParam 永远隐式 | ✅ | 93 节点全验证 |
| OutFlow 仅连接的分支 | ✅ | 所有 OutFlow 均有 connects |
| Exec 复合全量 InParam | ⚠️ | 大部分情况成立，`StartTickManager`/`StopTickManager` 例外 |
| 信号监听型 ClientExecNode | ⚠️ | 何时出现的确切规则待更多参考 |
| InParam passthrough 判断 | ⚠️ | 需要 compositePins 配合，实现细节待定 |
| 嵌套复合的 InFlow 如何路由 | ⚠️ | compositePins 中 InFlow 映射到 nested node 的 InFlow — 但这可能是 IMPLICIT 的，因为节点上没有 InFlow pin |

---

## 六、关键代码位置

| 文件 | 行号 | 改动 |
|------|------|------|
| `core.ts` | 1058 | `registerNode` 注册 `__composite_call__`（已有） |
| `composite_registry.ts` | 164 | **移除** `__composite_call__` 跳过 |
| `composite_registry.ts` | 207-209 | implNodes 包含嵌套调用节点（已有） |
| `composite.ts` | 395-418 | `resolveImplNodeId` — **新增** compositeId 提取 |
| `composite.ts` | 186-266 | `buildImplGraphNodes` — **改为 SysGraph kind** |
| `composite.ts` | 467-540 | `buildImplNodePins` — **新增**嵌套复合 pin 编码 |
| `index.ts` | 496-549 | 主图处理（pinIndex 参考） |
