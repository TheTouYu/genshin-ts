# 布局任务交接文档 · 第四轮

> **本轮目标**：为复合节点未连接下游的 OutFlow 出口生成终端（Print_String）节点
> **前一轮文档**：[layout-handover-round-3.md](layout-handover-round-3.md)

---

## 一、本轮背景

复合调用节点（`__composite_call__`）在主图中有多个 OutFlow 出口时，部分出口可能没有下游节点。游戏编辑器会为这些未连接的出口生成 `Print_String`（NODE_ID=1）终端节点作为执行链的可视终点。gsts 此前不生成这些终端节点，导致主图节点数少于参考文件，影响文件对比完整性。

### 本轮完成的工作

| 工作 | 文件 | 说明 |
|------|------|------|
| 导入 NODE_ID | `index.ts:15` | 从 gia_vendor 导入节点 ID 常量 |
| 终端节点生成 | `index.ts:596-635` | 遍历复合 outflow，为未连接下游的出口创建 Print_String 节点 |
| 简化 post-encoding | `index.ts:722` | 删除过时的 `hasOutFlowConnects` 检测和孤立目标重连逻辑 |
| 更新注释 | `index.ts:542-543` | 反映 OutFlow pin 的新生成流程 |
| 游戏内测试 | 游戏导入 | ✅ **全部通过**，终端节点显示正常，连接正确，无重叠 |

### 对比结果

| 参考文件 | gsts 旧版 | gsts 新版 | 变化 |
|---------|----------|----------|------|
| 顺序执行.gia (~4节点) | 2 节点 | 6 节点（+4 Print_String） | ✅ 终端缺失已补全 |
| 分支.gia | 3 节点 | 5 节点（+2 Print_String） | ✅ |
| 各种flow.gia | 3 节点 | 5 节点（+2 Print_String） | ✅ |

---

## 二、修复详解

### Fix 4.1: 终端节点生成

**问题：** `__composite_call__` 节点有 N 个 OutFlow 出口，其中 M 个无下游连接时，gsts 仅生成 M 个 flow 连接（连接的 outflow）或 0 个 flow 连接（全部未连接时）。没有对应的终端节点。

**修复：** 在 `graph.flow()` 循环之后、`graph.encode()` 之前，遍历 `compositeCallNodeIndices`，对每个复合定义中的 outflow，检查 `graphInfo.flowConnections` 中是否有已连接的记录。未连接的 outflow 创建一个 `Print_String`（NODE_ID=1）节点，通过 `graph.flow()` 连接到复合节点的对应 outflow。

**node 类型选择：** 参考文件"顺序执行.gia"中终端节点为 `Print_String`（NODE_ID=1），而非 handover round-3 文档推测的 `Double_Branch`（NODE_ID=2）。已通过 dump-nodes 用户验证。

**位置计算：** 终端节点放在复合节点右侧 1 列，按 outflow 索引纵向偏移：
```
rawX = compositePos[0] + columnWidth(350)
rawY = compositePos[1] + outflow.index * branchGap(252)
```

### Fix 4.2: Post-encoding 简化

**问题：** 原 post-encoding 中的 `hasOutFlowConnects` 检测（第 681-719 行）用于区分"终端复合"和"非终端复合"，并在复合被判定为终端时将其 OutFlow 的断连下游重连到 event 节点。添加终端节点后，所有 outflow 都有连接的终端节点，`hasOutFlowConnects` 始终为 true，该段逻辑成为死代码。

**修复：** 删除完整的 `hasOutFlowConnects` 检测块（~40 行）。保留：
- kind 修正（SysGraph + nodeId）
- compositePinIndex 设置（InParam / OutFlow）
- 纯数据复合处理（移除 flow pins）
- event 节点 OutParam 过滤

---

## 三、关键代码路径

```
IR nodes
  → buildExecutionGraph()          // 提取 flowConnections（含 composite.next 的 source_index）
  → 节点创建循环                    // 创建 GIA Node，添加 InParam/OutParam pins
  → graph.flow(flowConnections)    // 已连接 outflow 的 exec 连边
  → [新] 终端节点生成               // 未连接 outflow → Print_String 节点 + graph.flow()
  → graph.encode()                 // GIA protobuf 编码
  → post-encoding fixup            // kind 修正 + compositePinIndex 设置（已简化）
```

### 关键变量

| 变量 | 类型 | 说明 |
|------|------|------|
| `compositeCallNodeIndices` | `Map<nodeIndex, compositeId>` | 主图中复合调用节点 → 复合定义 ID |
| `graphInfo.flowConnections` | `{fromId, toId, fromIndex, toIndex}[]` | 从 IR node.next 提取的 flow 连接 |
| `cdef.outflows` | `ControlFlowDef[]` | 复合定义的全部 outflow 声明 |
| `cdef.inflows` | `ControlFlowDef[]` | 复合定义的 inflow 声明（空=纯数据复合） |

---

## 四、已知问题

| 问题 | 影响 | 状态 |
|------|------|------|
| `layout-various_1` 主图边交叉 | 复合 A(2 outflow) outflow0→复合B，outflow1→终端，边与复合B的终端边交叉 | ⚠️ 布局优化项 |
| `other.wire.ts` 泛型列表类型推断错误 | 预存错误，与本轮无关 | ✅ 已知 P2 |

### layout-various_1 边交叉说明

当复合 A（2 outflow）的 outflow 0 连接到下游复合 B，outflow 1 无下游时：
- outflow 1 终端放在复合 A 正右方 Y=复合A.Y+252
- 但复合 B 也在 outflow 0 的路径上（Y≈复合A.Y）
- 导致 outflow 1 的边与复合 B 及其终端的边交叉

**优化方向：** 终端位置应考虑中间下游节点的高度分布，将交叉 outflow 的终端放在最后一个下游节点下方而非复合节点正右侧。

---

## 五、测试方法

### 编译

```bash
npx tsx bin/gsts.mjs -c gsts.test.config.ts tests/layout-sequence.ts
npx tsx bin/gsts.mjs -c gsts.test.config.ts tests/layout-branch.ts
npx tsx bin/gsts.mjs -c gsts.test.config.ts tests/layout-various.ts
```

### 查看节点

```bash
npx tsx tests/composite/dump-nodes.ts dist/tests/layout-sequence.gia
```

### 布局审计

```bash
npx tsx tests/composite/audit-layout.ts dist/tests/layout-sequence.gia
```

### 游戏内验证

```bash
GAME_DIR="/mnt/c/Users/.../Beyond_Local_Export"
cp dist/tests/layout-sequence.gia "$GAME_DIR/"
```

---

## 六、布局参数当前值

```typescript
// index.ts（终端节点位置）
columnWidth: 350      // 终端 X 偏移
branchGap: 252        // 终端 Y 步进 = rowHeight * 0.9
```

---

## 七、文件索引

| 文件 | 用途 |
|------|------|
| `src/compiler/ir_to_gia_transform/index.ts` | 主图编码（终端节点生成入口） |
| `src/compiler/gia_vendor.ts` | NODE_ID 导出（提供 NODE_ID.Print_String） |
| `tests/layout-sequence.ts` | 多 outflow 复合测试（4 出口） |
| `tests/layout-branch.ts` | 分支复合测试 |
| `tests/layout-various.ts` | 多种拓扑测试 |
| `tests/composite/dump-nodes.ts` | 节点坐标打印 |
| `tests/composite/audit-layout.ts` | 布局质量审计 |

---

## 八、下一轮方向

### 布局交叉优化（P2）

`layout-various_1` 中出现的边交叉问题：复合多 outflow 中的部分连接下游、部分未连接时，未连接 outflow 的终端位置可能与其他下游节点的边交叉。

**解决方向：** 终端节点位置计算时，先收集该复合节点的所有下游节点（来自 flowConnections），找到其中的最大 Y 坐标，将终端放在 `maxDownstreamY + 252` 之下，而非简单的 `compositeY + outflowIndex * 252`。

### 复合嵌套布局验证（P1）

复合 A 调用复合 B 时，A 的 impl 图中会出现对 B 的调用节点。`computeImplLayout` 需要处理这种嵌套。

### 布局 ASCII 可视化（P2）

不依赖游戏测试，直接在终端输出 ASCII 图，提升对比效率。
