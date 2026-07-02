# Phase 2 问题协调文档

三个 agent 并行调查三个独立问题。如遇疑问或需要补充信息，追加到此文档对应章节。

---

## 问题 1: 布局 — 复合节点位置堆叠

**现象**: 生成的 GIA 中，复合节点全部叠在同一个位置，但 Phase 1 的 `phase1_system_nodes.gia` 布局正常。

**调查方向**:
- `src/compiler/ir_to_gia_transform/layout.ts` — 节点 x/y 坐标分配逻辑
- `src/compiler/ir_to_gia_transform/index.ts` — `graph.flow()` 调用和节点创建
- 对比 Phase 1 (test-phase1-system-nodes.ts) 和 Phase 2 (test-phase2-reference-patterns.ts) 的主图调用方式差异
- Phase 1 主图: event → comp1 → comp2 → comp3 (串联)
- Phase 2 主图: event → printString → comp1 → printString ... (混合节点)

**线索**: "有一部分是 OK 的" — 哪些场景 OK？串联场景 OK，分支场景堆叠？

### Agent 1 调查记录

（待填写）

---

## 问题 2: 参数引用 — 数据连线断开

**现象**: 纯数据运算中，已运算结果作参数时连线断开。加法后做 double/triple 时有些参数没有引用上。

**调查方向**:
- `src/runtime/composite_registry.ts` — `toCompositeDefIR` 中 InParam compositePins 扫描（lines 140-166）
- `src/runtime/core.ts` — capture 流程中 `__captureInputName` 的设置
- `src/compiler/ir_to_gia_transform/composite.ts` — `buildImplNodePins` 中 InParam 的 `connects` 填充
- 数据节点在 impl 图中的 OutParam 是否存在（供下游引用）
- 同一个输入值被多次引用时，compositePins 是否正确生成了多条 InParam 映射

**线索**: 纯数据复合中 `f.addition(inputs['输入数'], inputs['输入数'])` 是否被正确处理——同一个捕获输入消费两次。

### Agent 2 调查记录

（待填写）

### 额外发现: mul3 复制测试结果

通过 `test-replicate-mul3.ts` 精确复制参考文件中的 `mul3` 复合（2 个 multiplication 节点），逐字段对比后发现：

**19/20 通过，1 个差异**：
- 参考: second mul InParam:0 有 `connects → [19:OutParam:0]`（中间结果连线）
- 我们的: second mul InParam:0 **无 connects**（数据连线丢失）

**根因**: 在 capture 阶段，`f.multiplication(a, b)` 返回的是原始值（number/bigint），不是带 pin metadata 的 value 对象。当这个中间值传给下一个 `f.multiplication(ab, c)` 时，`toIRLiteral()` 将其序列化为 `null`，丢失了"这个值来自节点 X OutParam Y"的连接信息。

**debug 输出确认**:
- MetaCallRecord: `args[0]: type=undefined value=undefined`（中间结果丢失了）
- implNodes IR: `arg[0]: null`（toIRLiteral 返回 null）
- implEdges: `{}`（空，没有数据边信息）

**影响范围**: 所有"中间计算结果作为另一个节点的参数"的场景。

---

## 问题 3: 分支逻辑 — double_branch 分叉语义

**现象**: 想通过 `double_branch` 实现分叉（类似 顺序执行），但 `double_branch` 本质是条件分支——只能走一条路（true 或 false）。

**正确理解**:
- `double_branch` 接收 bool 条件，条件为真走 OutFlow[0]，条件为假走 OutFlow[1]
- 要实现"无条件分叉"，需要保证条件固定（如 always true），或者使用不同的分叉策略
- 参考文件 `顺序执行` 中，入口 double_branch **无参数调用**（`f.registerExecNode('double_branch', [])`）→ 此时 OutFlow:0 = fork 源

**调查方向**:
- `src/definitions/nodes.ts` — `doubleBranch()` 实现（line 3308）
- 参考文件分析: 弹球.gia 中 `顺序执行` 的 impl 图结构 — 入口 double_branch 的 OutFlow:0 有 connects 指向 4 个叶子
- `src/runtime/core.ts` — `branchExec` 的实际执行逻辑
- 当前 API 是否能正确表达"一个入口 → N 个出口"的无条件分叉？
- 参考文件中的 `条件branch` vs `顺序执行` — 它们的关键区别是什么？

### Agent 3 调查记录

（待填写）

### Agent 1 调查记录

#### 一、布局系统机制分析

**文件**: `src/compiler/ir_to_gia_transform/layout.ts`

布局分 4 个阶段，按优先级递减：

1. **执行链布局** (`layoutExecutionChain`): 从根节点(无入边 + 有出边)出发，沿执行链递归放置
   - x = depth % 50 * 800 (每列宽 800)
   - y = baseY + floor(depth/50) * 600 + laneOffset (碰撞时自动下移)
   - 分支子节点按 idx * 360 递增 laneOffset

2. **数据节点就近放置** (`placeDataNearConsumers`): 把数据产生节点放在其消费者附近
   - x = consumer.x - 300
   - y = consumer.y + (stackCount + 1) * 250

3. **游离节点网格放置** (`placeDetachedGrid`): 剩余无关联节点放左上角网格
   - x = -(cols * 800) + col * 800 (负坐标)
   - y = -(rows * 600) + row * 600 (负坐标)

4. **显式位置覆盖**: 若 IRNode 自带 `position` 字段则覆盖

**关键判断**: 根节点 = `incoming.get(id) === 0 && next.length > 0`。通常 event 节点是唯一根节点，所有 exec 节点沿链递推 depth。

#### 二、复合调用节点的 IR 注册路径

两种类型决定节点进入不同通道：

| 类型 | 条件 | registry type | 在 exec chain? | IR next 字段 | 布局来源 |
|------|------|---------------|----------------|-------------|----------|
| exec 复合 | 有 registerExecNode/leaf | `'exec'` | 是 | `flow.edges[id]` | `layoutExecutionChain` |
| data 复合 | 纯数据(isPureData) | `'data'` | 否 | 无(不传 getNext) | `placeDetachedGrid` |

**关键文件**:
- `src/runtime/core.ts` L894-930: `registerNode()` — 决定 exec/data 分流
- `src/runtime/ir_builder.ts` L169-185: `buildNodesFromFlow()` — data 节点 **无 getNext**，因此 IR 无 `next` 字段
- `src/compiler/ir_to_gia_transform/index.ts` L496-549: `__composite_call__` 节点 GIA 创建

#### 三、测试场景执行链追踪

**Phase 1** (test-phase1-system-nodes.ts) — 布局正常:
```
event → doubleBranch → finiteLoop → sequentialExec
```
全部 exec 型，串联链清晰。每个复合 depth 递增 1。

**Phase 2 混合** (test-phase2-reference-patterns.ts):
```
event → printString('纯数据完成') → P2(exec) → P3(exec) → P5(exec)
  P1(data)  不在链中 → 走 placeDetachedGrid (负坐标)
  P4(data)  不在链中 → 走 placeDetachedGrid (负坐标)
```
exec 型节点仍正确串联，深度递增。data 型走游离网格。

**test-two-exec.ts** — 布局正常:
```
event → comp1 → comp2
```
全部 exec 型，串联。

**test-mixed-composite-normal.ts**:
```
event → comp1 → comp2 → printString_1 → printString_2
```
全部 exec 型或普通节点，串联。

#### 四、确认根因：impl 图节点位置硬编码为 (0,0)

**文件**: `src/compiler/ir_to_gia_transform/composite.ts` L252-261

```typescript
return {
    nodeIndex,
    genericId,
    concreteId: { ...genericId },
    pins,
    x: 0,   // <-- 硬编码
    y: 0,   // <-- 硬编码
    usingStruct: []
}
```

`buildImplGraphNodes` 对所有 impl 图节点（accessories 中的 NodeGraph）**硬编码 x=0, y=0**，不经过任何布局系统。

**影响范围**:
- Phase 1 的 `sequentialExec` (顺序执行) 有 5 个 impl 节点，全部堆叠在 (0,0)
- Phase 2 的 `mixedLeaves` (混合叶子) 有 4 个 impl 节点，全部堆叠在 (0,0)  
- 所有 Phase 的 composite imppl 图节点都是 (0,0)

**Phase 1 "正常"的原因**: 不是布局正常，而是验证脚本只检查了引脚正确性，未检查 impl 图节点坐标。用户可能在 GIA 编辑器中打开 impl graph 才看到堆叠。

#### 五、主图 exec 链中 OutFlow 路由的潜在问题

**发现**: serial 链和前一个 OutFlow:0 分支共享 `fromIndex=0`:

在 Phase 2 混合场景中：
- `connectOutFlow(P2, 0, printString_a)` → 添加边 `P2 → ps_a (fromIndex=0)`
- 串行 `callComposite(P3)` → 添加边 `P2 → P3` (fromIndex 被解析为 0)

**结果**: `graph.flow(from=P2, to=ps_a, fromIndex=0)` 和 `graph.flow(from=P2, to=P3, fromIndex=0)` 合并到**同一个 OutFlow:0 pin**。

这导致 P2 的 OutFlow[0] 同时指向 ps_a 和 P3，语义上是错误的（应该 OutFlow[0]→ps_a，然后 P2 的下一跳通过独立的 serial 边→P3）。

**文件**: `src/compiler/ir_to_gia_transform/layout.ts` L43-44 + `src/compiler/ir_to_gia_transform/index.ts` L585-594

```typescript
// 问题: 串行连接(无 sourceIndex)被解析为 fromIndex=0，与 connectOutFlow(0) 重叠
const fromIndex = typeof next === 'number' ? 0 : (next.source_index ?? 0)
```

#### 六、结论与修复方向

**确认的 Bug**:
1. **impl 图节点 (0,0) 硬编码** (`composite.ts` L252-261) — 所有 composite 的 impl 图节点堆叠。需要为 impl 图实现布局逻辑。

**发现的潜在问题**:
2. **OutFlow 索引冲突** — 串行链 fromIndex=0 与 connectOutFlow(0) 的 OutFlow[0] 冲突。需要区分"执行串行下游"和"outflow 分支"。

**需要现场验证**:
- 主图复合调用节点是否确实在独立坐标？(按我的分析应该在不同位置，不是 (0,0))
- 用户在 GIA 编辑器中看到堆叠的"复合调用节点"是主图节点还是 impl 图节点？

**待补充信息**:
- [ ] 确认具体哪个 .gia 文件和哪个 graph（主图 or impl accessory）出现堆叠
- [ ] 提供 GIA inspect 工具输出（`npx tsx tests/composite/gia-inspect.ts <file.gia> -l`）
- [ ] 确认是否是 only 复合+普通混合场景才有问题，还是所有含分支的场景
- [ ] 如果确实是主图复合节点堆叠，需要提供实际 IR 节点的 `next` dump 以便精确复现

