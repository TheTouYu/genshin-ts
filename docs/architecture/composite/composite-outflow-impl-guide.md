# 复合节点非终端 OutFlow 实现指南

> 状态：部分过期 / 历史分析
> 来源：真实 GIA 文件分析 + 旧实现计划
> 最近校验：2026-07-06
> 适用范围：真实 GIA 非终端 OutFlow 结构分析仍有参考价值；实现计划部分已被当前 `f.outflow()` / raw control-flow DSL 替代。
>
> 当前权威入口：[raw-control-flow-dsl-quickstart.md](./raw-control-flow-dsl-quickstart.md) 和 [dsl-api.md](./dsl-api.md)。

## 背景

历史背景：早期复合节点实现只支持"终端模式"（outflows=0），即复合节点是 exec flow 的终点。当前 gsts 已支持非终端 OutFlow，游戏支持的"DAG 模式"允许复合节点同时具有 InFlow 和 OutFlow，从而非终端复合节点可以向多个下游目标 fork exec flow。

### 参考文件

```
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/复杂_exec.gia
```

## 参考文件结构分析

### 主图节点（7 个节点）

```
event(2) ─┬→ comp1(1) ─┬→ comp2(3)              ← terminal
           │             └→ printString"2"(6) → printString"3"(7) ← serial
           ├→ comp2(4)                               ← terminal (comp2 第2次调用)
           └→ printString"4"(5)                      ← terminal
```

### 关键数据：comp1（非终端复合，nodeIndex=1）

```json
{
  "nodeIndex": 1,
  "genericId": { "class": 10001, "type": 20000, "kind": 22001, "nodeId": 1073741866 },
  "pins": [{
    "i1": { "kind": 2, "index": 0 },       // OutFlow
    "i2": { "kind": 2, "index": 0 },
    "type": 0,
    "value": null,
    "compositePinIndex": 4,                  // 关联 CompositeDef.outflows[0].pinIndex
    "connects": [
      { "id": 3, "connect": { "kind": 1, "index": 0 }, "connect2": { "kind": 1, "index": 0 } },
      { "id": 6, "connect": { "kind": 1, "index": 0 }, "connect2": { "kind": 1, "index": 0 } }
    ]
  }]
}
```

### 关键数据：event（nodeIndex=2）

```json
{
  "nodeIndex": 2,
  "genericId": { "kind": 22000, "nodeId": 71 },
  "pins": [{
    "i1": { "kind": 2, "index": 0 },       // OutFlow only，无 compositePinIndex
    "connects": [
      { "id": 1, "connect": { "kind": 1, "index": 0 } },
      { "id": 4, "connect": { "kind": 1, "index": 0 } },
      { "id": 5, "connect": { "kind": 1, "index": 0 } }
    ]
  }]
}
```

注意：event 只有 1 个 pin（OutFlow），没有多余的 OutParam pins。

### 关键数据：comp2（终端复合，nodeIndex=3 和 4，同一复合调用两次）

```json
{
  "nodeIndex": 3,
  "genericId": { "kind": 22001, "nodeId": 1073741867 },
  "pins": []                                 // 终端复合：0 pins
}
```

### CompositeDef 对比

| 属性 | comp1 (非终端) | comp2 (终端) |
|------|---------------|-------------|
| inflows | 1 条, pinIndex=1974 | 1 条, pinIndex=1974 |
| outflows | **1 条**, pinIndex=**4** | **0 条** |
| inputs | 0 | 0 |
| outputs | 0 | 0 |
| 引用次数 | 1 次 | **2 次**（node3 + node4）|

### comp1 的 compositePins（impl graph 内）

```json
[
  { "outerPin": {"kind":1,"index":0}, "innerNodeId":2, "innerPin":{"kind":1,"index":0} },
  { "outerPin": {"kind":2,"index":0}, "innerNodeId":2, "innerPin":{"kind":2,"index":0} }
]
```

两条映射：
1. 外部 InFlow(1,0) → 内部节点2 InFlow(1,0)
2. **外部 OutFlow(2,0) → 内部节点2 OutFlow(2,0)**

### comp1 impl graph 的 inner node

```json
{
  "nodeIndex": 2,
  "genericId": { "kind": 22000, "nodeId": 1 },  // printString
  "pins": [{
    "i1": {"kind":3,"index":0},   // InParam (str = "第一个")
    "value": { "class":5, "bString":{"val":"第一个"}, "type":6 }
  }]
}
```

### 连线机制

每个 connect 都有 `connect` 和 `connect2` 两个字段，值完全相同（{kind, index}）。kind=1 表示 InFlow，index=0 表示第 0 个 InFlow。

**特性：一个 OutFlow pin 可以有多个 connect**，形成 fork 语义。每个 connect 的 id 是目标节点的 nodeIndex。

## 需要修改的文件

### 1. `src/runtime/composite_registry.ts` — toCompositeDefIR()

**当前状态**（第 143 行）：
```typescript
outflows: [],   // 硬编码为空，不支持非终端复合
```
**目标**：根据复合在调用链中的位置决定 outflows。

**关键决策点**：outflows 取决于复合在执行链中是否被后续节点跟随。
- 如果是链中最后一个复合节点（后无 exec 节点），outflows=0
- 如果后续还有 exec 节点（复合或普通），outflows=1

**同时需要计算 OutFlow compositePin 映射**（第 100-111 行区域）：
- 当前仅计算 InFlow pin 映射
- 需要增加：外部 OutFlow(2,0) → 最后一个内部 exec node 的 OutFlow(2,0)
- pinIndex 值：outflows[0].pinIndex 需要匹配主图调用节点的 compositePinIndex

**参考 pinIndex 值**：
- InFlow pinIndex: 1974（参考文件中的值，可能是游戏约定的特殊值）
- OutFlow pinIndex: 4（参考文件中的值）

### 2. `src/runtime/IR.d.ts` — 类型定义

**当前 CompositeDefIR.outflows**（第 238 行）：已存在 `outflows: ControlFlowDef[]`，类型定义正确，不需要改。

**CompositePinEntry**（第 282-288 行）：当前定义支持 OutFlow 映射，类型正确，不需要改。

### 3. `src/compiler/ir_to_gia_transform/composite.ts` — GIA 编码

**buildCompositeAccessories()**（第 26-165 行）：

已有 outflows 编码逻辑（第 61-67 行），但需确认：
- pinIndex 值正确透传
- compositePins 映射包含 OutFlow 条目时正确序列化

**compositePins 编码**（第 140-154 行）：当前已支持多条 mapping，OutFlow 类型（kind=2）会自动序列化。但需要确认 `innerPin2` 的处理——参考文件中 innerPin2 与 innerPin 值相同。

**impl graph inner node**：非终端复合的内部 exec node 需要同时具备 InFlow 和 OutFlow 能力。当前 impl node 不构建 flow pins（仅 InParam/OutParam），需要确认 graph.encode() 是否正确处理。

### 4. `src/compiler/ir_to_gia_transform/index.ts` — 主图构建

**第 496-533 行**（`__composite_call__` 节点创建）：

当前为复合调用节点添加 InParam/OutParam pins，但**不添加 OutFlow pin**。对于非终端复合，需要：
- 添加 OutFlow pin（kind=2, index=0）
- 设置 compositePinIndex = cdef.outflows[0].pinIndex
- 不需要显式设置 connects（由后续 graph.flow() 或 post-encoding 填充）

**第 647-678 行**（post-encoding exec flow 修正）：

当前逻辑的假设是"所有复合都是终端"（移除全部 OutFlow，event 统一 fork）。需要改为：
- 非终端复合（outflows.length > 0）：保留 OutFlow pin，connects 由 graph.flow() 自然建立
- 终端复合（outflows.length === 0）：当前逻辑（移除 OutFlow，由 event 或上游 fork 连接）

**event 节点的多余 OutParam pins**：

参考文件中 event 只有 1 个 OutFlow pin。当前生成的 event 有额外的 OutParam pins（entity/guid）。需要在生成时过滤掉这些空 OutParam。

### 5. `src/runtime/core.ts` — 运行时

**callComposite() 调用链**：

当前 `callComposite` 将 `__composite_call__` 标记节点插入调用方 flow（通过 MetaCallRegistry.runCompositeCall）。IR 中标记节点之间有 `next` 关系形成线性链。这个线性链在 `graph.flow()` 时转为 GIA 的 exec flow 连接。

对于非终端复合：
- 标记节点 `__composite_call__` 的 `next` 指向下一个节点
- graph.flow() 会创建 comp → next_node 的 OutFlow 连接
- 如果 comp 有 outflows=1，这个连接是合法的（保留）
- 如果 comp 有 outflows=0，这个连接是非法的（需要移除并调整）

**判断是否为终端复合**：可以在 `buildServerGraphRegistriesIRDocuments` 中分析 IR 节点的 next 链，确定每个复合调用后面是否有 exec 节点跟随。或者更简单：检查 `__composite_call__` 节点的 next 是否指向另一个节点。

## 实现要点

### 核心挑战：复合节点可能是终端也可能是非终端

同一个复合定义可以在一个调用位置是终端（链尾），另一个位置是非终端（链中）。但 CompositeDef 是**按定义**生成的（基于 capture），而非按调用位置。这意味着：

- 如果复合定义时 capture 了 OutFlow（内部 exec 节点有 OutFlow），则 CompositeDef 声明 outflows=1
- 终端调用位置：主图节点**不添加** OutFlow pin（或移除）
- 非终端调用位置：主图节点**添加** OutFlow pin + compositePinIndex

**或者更简洁的方案**：始终让 CompositeDef 具有 outflows=1（只要内部有 exec 节点），调用位置决定是否使用 OutFlow：

```
调用位置是终端 → 不添加 OutFlow pin
调用位置非终端 → 添加 OutFlow pin (+ compositePinIndex)
```

### pinIndex 约定

| Pin 类型 | pinIndex | 说明 |
|----------|----------|------|
| inflows[0] | 1974 | 游戏约定的 InFlow pinIndex 值 |
| outflows[0] | 4 | 游戏约定的 OutFlow pinIndex 值 |

### connect 结构

每个 exec flow 连接都需要 `connect` 和 `connect2` 两个字段：
```json
{
  "id": <target-nodeIndex>,
  "connect": { "kind": 1, "index": 0 },
  "connect2": { "kind": 1, "index": 0 }
}
```

### event 节点规范

参考文件中 event（kind=22000, nodeId=71）只有 **1 个 OutFlow pin**，没有多余的 OutParam pins。当前代码在 event 上产生了额外的 OutParam pins（entity/guid），需要移除。

## 验证方式

1. 运行 `tests/composite/test-two-exec.ts` — 双 exec 复合串行
2. 运行 `tests/composite/test-mixed-composite-normal.ts` — 复合+普通节点混合
3. 用 `decode_gia_file` 解码生成的 GIA 并与 `user_edit/复杂_exec.gia` 对比结构
4. 在游戏中测试生成的文件

## 参考文件路径汇总

| 文件 | 用途 |
|------|------|
| `user_edit/复杂_exec.gia` | 主要参考：含非终端+终端复合+普通节点的 DAG |
| `user_edit/two_exec.gia` | Pattern 1 参考：event fork 到两个终端复合 |
| `user_edit/two_exec2.gia` | Pattern 2 参考：event→comp1→comp2 串行（comp1 带 OutFlow）|
| `真-测试通过/basic_call.gia` | 已验证的简单单复合参考 |
| `真-测试通过/basic_call_param.gia` | 已验证的带参数复合参考 |
