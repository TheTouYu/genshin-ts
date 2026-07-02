# 布局任务交接文档 · 第五轮

> **本轮目标**：复合嵌套布局验证——当复合 A 的 build() 内部调用复合 B 时，A 的 impl 图中出现对 B 的调用节点，确保 `computeImplLayout` 正确布局这些嵌套节点。
> **前一轮文档**：[layout-handover-round-4.md](layout-handover-round-4.md)

---

## 一、本轮背景

### 完成的工作（1-4 轮回顾）

| 轮次 | 完成内容 | 交付物 |
|------|---------|--------|
| R1 | 编辑器布局原理解析 + `fork` API + 布局常量校准 | `layout.ts`, `composite.ts`, `tests/layout-basic-call.ts` |
| R2 | 布局参数调整 + 游离节点放置 + 分支间距 | `layout.ts` branchGap, `composite.ts` LAYOUT_EXEC_V_STEP |
| R3 | P0 对比测试（3 场景），分支间距 + impl Y 间距 + 游离修复 | `tests/layout-branch.ts`, `tests/layout-various.ts` |
| R4 | 复合未连接 outflow 终端 Print_String 生成 + post-encoding 简化 | `index.ts` 终端生成, 删除 ~40 行死代码 |
| R5 | **← 本轮** 终端边交叉 BFS 优化 + 嵌套复合布局验证 | 边交叉修复已提交 (69649e4) |

### 第五轮已做的改动

**提交 69649e4** 修复边交叉（P2）：
- 为复合未连接 outflow 的终端添加递归下游感知
- BFS 遍历已连接 outflow 的递归下游节点，取最大 Y 坐标
- 终端放在 `maxDownstreamY + 252 + unconnectedIdx * 252` 之下
- `layout-various_1` 边交叉消除，全部 9 个布局测试 0 交叉

---

## 二、复合嵌套布局（P1 目标）

### 2.1 问题定义

复合 A 的 `build()` 内部调用 `f.callComposite(B, {})` 时，A 的 impl 图（accessories 中的 impl NodeGraph）中出现对 B 的调用节点（`__composite_call__`）。`computeImplLayout` 需要处理这种嵌套——内部调用节点也应该被布局，且其 exec 连线应正确路由。

### 2.2 参考文件中的嵌套模式

| 文件 | accessories | 嵌套节点 | 来源 |
|------|------------|---------|------|
| `嵌套.gia` | 6 | 3 个（2 层嵌套） | user_edit/ |
| `弹球.gia` | 70 | 25 个 | 复杂gia/ |
| `传球.gia` | 29 | 7 个 | 复杂gia/ |
| `物理运动.gia` | **106** | **58 个** | 复杂gia/ |

嵌套复合调用的 GIA 编码特征（自 `docs/architecture/composite/composite-nested-composite-guide.md`）：

```typescript
{
  class: NodeGraph_Id_Class.SystemDefined,  // 10001
  type: NodeProperty_Type.Server,           // 20000
  kind: NodeGraph_Id_Kind.SysGraph,         // 22001
  nodeId: compositeId                       // 被调用的复合定义 ID
}
```

### 2.3 代码路径

impl 图布局的核心函数：

```
buildCompositeAccessories()              → composite.ts:26
  → buildImplGraphNodes()                → composite.ts:211
    → computeImplLayout()                → composite.ts:276
```

`computeImplLayout` 的 BFS 逻辑（`composite.ts:298-314`）：

```typescript
const entryNodes = implNodes.filter(n => hasExecOut.has(n.id) && !hasExecIn.has(n.id))
const queue: QueueEntry[] = entryNodes.map(id => ({ id: id.id, x: 0, y: 0 }))
// BFS: 每层 x += LAYOUT_EXEC_H_STEP, 分支 y += i * LAYOUT_EXEC_V_STEP
```

当 `__composite_call__` 节点出现在 impl 图中时：
- 该节点的 ID 在 `hasExecOut` 中（如果有 outgoing implEdges）
- 在 `buildImplNodePins` 中返回空的 `{ pins, dataConns }`（`composite.ts:493-495`）
- GIA Node 的 `nodeId` 在 post-encoding 中被替换为 `compositeId`（`index.ts:720-726`）

**待验证的问题：**
1. `computeImplLayout` 的 BFS 能否正确处理嵌套调用节点的位置？
2. 嵌套调用节点的 exec 连线是否正确（源节点的 OutFlow 连接到嵌套节点的 InFlow）？
3. 嵌套调用节点在 impl 图中的 Y 偏移是否合理？
4. 多层嵌套时（A→B→C），每层 impl 图是否独立正确布局？

---

## 三、当前布局代码全景

### 3.1 文件索引

| 文件 | 行数 | 职责 | 关键函数 |
|------|------|------|---------|
| `src/compiler/ir_to_gia_transform/layout.ts` | 310 | **主图布局引擎** | `buildExecutionGraph()`, `layoutPositions()` |
| `src/compiler/ir_to_gia_transform/composite.ts` | 773 | **impl 图编码 + 布局** | `buildCompositeAccessories()`, `computeImplLayout()` |
| `src/compiler/ir_to_gia_transform/index.ts` | ~830 | **主图编码入口** | `irToGia()` — 节点创建、flow/数据连线、终端生成、post-encoding fixup |

### 3.2 布局参数当前值

```typescript
// layout.ts（主图）
columnWidth: 350    // X 步进
rowHeight: 280      // 分支间距基值
maxColumns: 8       // 超长链换行边界
wrapHeight: 280
eventGap: 300       // 多事件间隔

// composite.ts（impl 图）
LAYOUT_EXEC_H_STEP = 350    // 与主图一致
LAYOUT_EXEC_V_STEP = 200    // 分支 Y 偏移
LAYOUT_DATA_H_STEP = 350
LAYOUT_DATA_Y_OFFSET = -250
```

### 3.3 主图布局流程

```
IR nodes
  → buildExecutionGraph()        // 提取 exec/data 连接，找出 roots（layout.ts）
  → layoutPositions()            // DFS 执行链 + 数据近消费者 + 游离网格（layout.ts）
  → 节点创建循环                 // 创建 GIA Node，设置位置（index.ts）
  → graph.flow(flowConnections)  // 已连接 outflow 的 exec 连边（index.ts:585-594）
  → 终端节点生成                  // 未连接 outflow → Print_String（index.ts:596-670）
  → graph.encode()               // GIA protobuf 编码（index.ts:710）
  → post-encoding fixup          // kind 修正 + compositePinIndex 设置（index.ts:712-767）
  → buildCompositeAccessories()  // 复合定义 → accessories（index.ts:782-789）
```

### 3.4 impl 图布局流程

```
CompositeDefIR
  → buildCompositeAccessories()   // 复合定义 + impl NodeGraph 成对编码
    → buildImplGraphNodes()       // impl 节点 → GIA GraphNode
      → computeImplLayout()       // BFS exec + Kahn 数据节点布局
        → 先 BFS 放 exec 节点
        → 再处理终端节点（有 exec 入、无 exec 出）
        → 最后 Kahn 拓扑排序放数据节点
```

---

## 四、测试体系

### 4.1 现有布局测试文件

| 文件 | 场景 | 输出文件 |
|------|------|---------|
| `tests/layout-basic-call.ts` | 基本复合调用（事件→复合→Print） | `layout-basic-call.gia` |
| `tests/layout-sequence.ts` | 4 OutFlow 复合，全→终端 | `layout-sequence.gia` |
| `tests/layout-branch.ts` | 主图 fork；分支中调用复合 | `layout-branch_0.gia`, `layout-branch_1.gia` |
| `tests/layout-two-exec.ts` | 双执行流（事件→2 复合） | `layout-two-exec.gia` |
| `tests/layout-two-composites.ts` | 两个独立 server，各调不同复合 | `layout-two-composites_0.gia`, `layout-two-composites_1.gia` |
| `tests/layout-various.ts` | 多复合 + 多 OutFlow + 多事件 | `layout-various_0.gia`, `layout-various_1.gia` |

### 4.2 工具

| 工具 | 命令 | 用途 |
|------|------|------|
| ASCII 可视化 | `npx tsx tests/composite/ascii-layout.ts *.gia --compact` | 终端渲染节点位置 + 正交连线 |
| 节点坐标打印 | `npx tsx tests/composite/dump-nodes.ts *.gia` | 打印节点类型/ID/坐标 |
| 布局质量审计 | `npx tsx tests/composite/audit-layout.ts *.gia` | 检测碰撞/孤立/重叠/回边/边交叉 |
| 嵌套分析 | `npx tsx tests/composite/analyze-nested-composites.ts *.gia` | 分析嵌套复合编码规则 |
| 对比 | `npx tsx tests/composite/gia-compare.ts *.gia` | 跨文件对比 |

### 4.3 编译命令

```bash
# 编译单个测试
npx tsx bin/gsts.mjs -c gsts.test.config.ts tests/layout-xxx.ts

# 查看结果
npx tsx tests/composite/ascii-layout.ts --compact dist/tests/layout-xxx.gia
npx tsx tests/composite/audit-layout.ts dist/tests/layout-xxx.gia
```

---

## 五、嵌套复合布局验证方案

### 5.1 建议的测试用例

创建 `tests/layout-nested.ts`，覆盖以下场景：

**场景 A：线性嵌套**（A→B→Print）
```
compB: f.printString("B")
compA: f.callComposite(compB, {})
server: .on("event", (e, f) => f.callComposite(compA, {}))
```
- 主图：Event → compA → Print
- A 的 impl 图：compB → Print
- B 的 impl 图：Print

**场景 B：嵌套 + 分支**（A 的 impl 图有 fork）
```
compB: f.fork(() => f.printString("B1"), () => f.printString("B2"))
compA: f.callComposite(compB, {})
server: .on("event", (e, f) => f.callComposite(compA, {}))
```
- A 的 impl 图：compB（有 2 OutFlow）→ 2 个 Print
- 验证 impl 图的 exec 分支布局

**场景 C：多层嵌套**（A→B→C）
```
compC: f.printString("C")
compB: f.callComposite(compC, {})
compA: f.callComposite(compB, {})
server: .on("event", (e, f) => f.callComposite(compA, {}))
```

### 5.2 验证清单

| 验证项 | 方法 | 期望 |
|--------|------|------|
| `computeImplLayout` 为嵌套节点分配位置 | `dump-nodes` 查看 impl 图坐标 | 嵌套节点有非零位置 |
| 嵌套节点的 exec 连线正确 | ASCII 视图查看 impl 图 | 嵌套节点出现在 exec 链中 |
| 多 OutFlow 嵌套的 Y 偏移 | audit-layout 检查无碰撞 | 分支不重叠 |
| 多层嵌套每层独立布局 | 检查每层 impl 图 | 每层节点数/坐标合理 |
| 嵌套节点的 terminal 生成 | 检查主图/impl 图终端数 | 未连接 outflow → Print_String |

### 5.3 参考文件对照

验证时可将 gsts 输出与 `user_edit/嵌套.gia` 对比：
```bash
REF="/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit"
npx tsx tests/composite/dump-nodes.ts "$REF/嵌套.gia"
npx tsx tests/composite/ascii-layout.ts "$REF/嵌套.gia" --compact
```

---

## 六、已知问题

### 当前已解决（~R5）

| 问题 | 状态 |
|------|------|
| 复合未连接 outflow 终端缺失 | ✅ R4 修复 |
| `hasOutFlowConnects` 死代码 | ✅ R4 简化 |
| `layout-various_1` 边交叉 | ✅ R5 修复（69649e4） |
| 全部 9 布局测试 0 交叉通过 | ✅ 已验证 |

### 遗留问题

| 优先级 | 问题 | 说明 |
|--------|------|------|
| **P1** | **复合嵌套布局验证** | ⬅️ **本轮任务** |
| P2 | `layout-branch_0/1` 的 fork 级边交叉 | 主图 fork 分支边交叉，非复合专用问题，audit 可能标记 |
| P2 | 主图命名 `_GSTS_` 前缀 | 游戏内显示不够美观，但功能性无影响 |
| P2 | `other.wire.ts` 泛型推断错误 | 预存于 `tests/generated/`，与本轮无关 |

### 已知陷阱

1. **`__composite_call__` 节点的 pin 结构特殊**：`buildImplNodePins` 中 `node.type === '__composite_call__'` 时返回空 `{pins, dataConns}`。这意味着嵌套调用节点在 impl 图中的 pin 由其他机制添加——具体在 post-encoding fixup 通过 `compositePinIndex` 设置，而不是通过 `buildImplNodePins`。

2. **终端节点判定逻辑**：`computeImplLayout` 中通过 `hasExecIn.has(id) && !hasExecOut.has(id)` 判定终端节点。嵌套调用节点如果有 outgoing exec 边（例如 A→B→Print 中的 B 有 next→Print），则 `hasExecOut` 包含它，不会被误判为终端。

3. **impl 图 entry node**：复合的 entry node 是 `__composite_capture__`（NODE_ID=2），BFS 从它开始。嵌套调用的 `__composite_call__` 节点是中间节点，entry 仍是 capture。

---

## 七、参考文档索引

| 文档 | 内容 | 推荐优先级 |
|------|------|-----------|
| `docs/composite-ir/layout-patterns.md` | 编辑器布局规律（25 文件统计） | ⭐ 前置阅读 |
| `docs/architecture/composite/composite-nested-composite-guide.md` | 嵌套复合 GIA 编码规则（pin、compositePins、genericId） | ⭐ 核心参考 |
| `docs/architecture/composite/ir-representation.md` | 复合定义的 IR JSON 结构 | 编码理解 |
| `docs/architecture/composite/pipeline-flow.md` | 三阶段管线中复合节点的数据流 | 流程理解 |
| `docs/composite-ir/handover/layout-handover-round-4.md` | R4 终端节点生成 + post-encoding | 前情提要 |
| `tests/composite/analyze-nested-composites.ts` | 嵌套复合编码分析工具源码 | 编码参考 |
| `src/compiler/ir_to_gia_transform/composite.ts:276-403` | `computeImplLayout` 源码 | ⭐ 核心修改点 |
| `src/compiler/ir_to_gia_transform/layout.ts:17-111` | `buildExecutionGraph` 源码 | 主图拓扑分析参考 |

### Architecture 文档的注意事项

> ⚠️ `docs/architecture/composite/` 中的 pinIndex 常量（1974/4/8-11/6）是 gsts 编译器的硬编码默认值，**仅对 gsts 生成的复合有效**。游戏编辑器创建的文件使用不同的值（97/97 复合未使用这些默认值）。详见 [`docs/composite-ir/01-ir-types.md`](../01-ir-types.md) 的验证结果。

---

## 八、下一轮方向（R6）

- **复合嵌套游戏内验证**：将 `layout-nested.gia` 导入游戏验证布局视觉效果
- **多 OutFlow 嵌套复合的终端位置优化**：嵌套复合的终端节点可能需要更精确的定位
