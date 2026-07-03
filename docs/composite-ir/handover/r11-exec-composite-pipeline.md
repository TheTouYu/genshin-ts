# Session 交接：exec + 数据流复合节点端到端管线 + 布局优化

> **会话日期：** 2026-07-03
> **当前分支：** `feat/fork-api-and-layout`（干净状态基底 `0eb1ca476384b2981e7c45f04120ac24e8c1b8f0`）
> **前置依赖：** [r10-simple-composite-pipeline.md](./r10-simple-composite-pipeline.md)（纯数据复合基础知识）

---

## 1. 本会话完成的工作

### 1.1 目标

编写一个同时包含**控制流（exec）** 和**数据流（data）** 的复合节点，从 TypeScript 定义到 GIA 产物的完整管线。并以此为基础，修复 r10 中遗漏的 Double Branch bug、修正已有测试断言、优化节点布局。

### 1.2 最终产物

**测试脚本**: `tests/composite/exec-with-data.ts`

```
Composite "计算并记录" (混合型：exec + data)
  inputs:  a (int), b (int)
  outputs: sum (int)
  build:
    f.printString("计算中...")       ← exec 节点
    const result = f.addition(a, b)  ← data 节点
    return { sum: result }

Main Graph
  whenEntityIsCreated
    → f.callComposite(计算并记录, { a: 10, b: 5 })   ← exec 复合
    → f.dataTypeConversion(sum, 'str')                ← 数据转型（纯数据）
    → f.printString(...)                               ← 打印终端
```

**输出文件**:
- `tests/composite/output/exec_with_data.gia`（1346 bytes）— GIA 二进制
- `tests/composite/output/exec-with-data.ir.json` — Stage 2 IR JSON

### 1.3 游戏验证通过

- exec 流: ✅ event → composite_call → dataTypeConversion(纯数据) → printString
- 数据流: ✅ composite(sum) → dataTypeConversion → printString(input)
- 复合内部: ✅ 无多余节点（Double Branch 已消除）
- 布局: ✅ exec 节点间距 ~800、数据节点在间隙中央、Y 对齐 ≤5px

### 1.4 参考文件验证（6 个游戏产出 GIA）

| 参考文件 | 位置 |
|---------|------|
| `demo_A_basic_call.gia` | 游戏目录 `composite/` |
| `demo_B_exec_call.gia` | 游戏目录 `composite/` |
| `demo_C_nested_call.gia` | 游戏目录 `composite/` |
| `类型转化_gen.gia` | 游戏目录 `composite/` |
| `mixed_composite_and_normal.gia` | 游戏目录 `composite/` |
| `传球.gia` | 游戏根目录 |

---

## 2. 修复：Double Branch 完全消除（r10 Bug 2 补完）

### 2.1 问题回顾

r10 修复了纯数据复合中 `__composite_capture__` 被映射为 Double Branch 的问题，但过滤条件只针对**无 exec 出边**的情况：

```typescript
// r10 修复（有缺陷）
const implNodesForEncoding = def.implNodes.filter(
  n => n.type !== '__composite_capture__' || (def.implEdges[n.id]?.length ?? 0) > 0
)
```

exec 复合中 capture 有出边（→ 首个 exec 子节点），因此未被过滤，在 GIA 中编码为 Double Branch（nodeId=2），游戏中显示为多余条件分支节点。

### 2.2 修复方案

**原则：** `__composite_capture__` 是 IR 层的输入占位符，GIA 中不需要物理节点。由 `compositePins` 完成路由。

**改动位置：** `src/compiler/ir_to_gia_transform/composite.ts`

1. **始终**过滤 `__composite_capture__` 节点
2. 找到 capture 的第一个 exec 子节点（`implEdges[captureId][0]`）
3. 将 `compositePins` 中对 capture 的 InFlow 引用**重定向**到该子节点
4. 从 `implEdges` 中移除 capture 的出边（避免布局引擎看到已删除节点的入边）

```typescript
// 识别 capture
const captureNodeId = def.implNodes.find(n => n.type === '__composite_capture__')?.id
let captureFirstChildId: number | undefined
if (captureNodeId !== undefined) {
  const captureEdges = def.implEdges[captureNodeId]
  if (captureEdges && captureEdges.length > 0) {
    captureFirstChildId = getEdgeTarget(captureEdges[0])
  }
}

// 始终过滤
const implNodesForEncoding = def.implNodes.filter(n => n.type !== '__composite_capture__')

// 过滤 edges（移除 capture 的出边）
const filteredEdges = { ...def.implEdges }
delete filteredEdges[captureNodeId]

// compositePins 重定向
compositePins: def.compositePins.map((entry) => {
  const actualNodeId = entry.innerNodeId === captureNodeId && captureFirstChildId !== undefined
    ? captureFirstChildId
    : entry.innerNodeId
  // ...编码...
})
```

### 2.3 为什么 r10 没发现

r10 只测试了纯数据复合（内部无 exec 节点），capture 无出边 → 被过滤 → 看起来正确。exec 复合（capture 有出边）不在 r10 的测试范围内。

**教训：** 过滤条件考虑边界不够。应该始终问"这个节点在 GIA 中是否需要物理存在？"而不是"有没有出边？"。

### 2.4 验证方法

```bash
# 修复前：ascii-layout 显示 impl 图有 3 节点，包含 Double Branch
npx tsx tests/composite/ascii-layout.ts output/exec_with_data.gia

# 修复后：impl 图 2 节点，无 Double Branch
npx tsx tests/composite/dump-layout.ts output/exec_with_data.gia
```

---

## 3. 布局优化：基于游戏参考的间距决策

### 3.1 问题

游戏里三个 exec 节点（event → composite → printString）排列不够整齐，间距偏小，数据节点位置不佳。

### 3.2 方法论：参考 GIA 实测

不靠猜。对 `composite/` 目录中的游戏参考 GIA 做**位置数据提取 + 量化分析**。

**工具：** 编写了 `tools/dump-layout.ts` 批量提取节点坐标：

```bash
npx tsx tools/dump-layout.ts <file.gia>
```

输出格式：
```
node[1] When Entity Is Created (5, 8)
  OutFlow[0] →node2
node[2] nid=1610700000 (805, 0)
```

### 3.3 关键发现

#### 规律 1：Exec 节点间距 ~800

| 参考文件 | 节点序列 | 平均间距 |
|---------|---------|---------|
| demo_B_exec_call | event → composite → printString | **~800** |
| mixed_composite_and_normal | 5 节点链 | **~800** |
| 类型转化_gen | event → printString | 807 |

gsts 原值 350 只有参考值的 **44%**。修正为 **800**。

#### 规律 2：Y 对齐精度 ≤10px

所有参考中，同一 exec 链上节点的 Y 值差异不超过 10 像素（多数在 5px 内）。

#### 规律 3：数据节点在 exec 链下方 ~250px

`类型转化_gen.gia` 的 dataTypeConversion 在 Y=257，exec 链在 Y≈6，偏移 251px。

#### 规律 4：数据节点 X 在其消费者左侧

数据节点 x = 消费者 x - 偏移量。参考中 dataTypeConversion 距 consumer（printString）约 300px。

### 3.4 参数迭代史

| 参数 | v0(原) | v1 | v2(最终) | 依据 |
|------|--------|----|---------|------|
| `columnWidth` | 350 | 450 | **800** | demo_B_exec_call 实测 |
| `rowHeight` | 280 | 350 | **350** | 未改 |
| 数据 X 偏移 | cx−300 | cx−200→cx−400 | **cx−400** | 核验了节点宽度 300px，居中在 504px 间隙 |
| 数据 Y 偏移 | 250 | 150→120→150 | **150** | 比参考略高，用户确认可以 |

### 3.5 碰撞核验方法

设置好偏移后，用覆盖范围计算确认无重叠：

```bash
# 计算节点覆盖范围（假设节点半宽 150px）
# 从 dump-layout 输出读坐标：
# composite: x=803  → 覆盖 653~953
# dataType:  x=1204 → 覆盖 1054~1354
# printStr:  x=1602 → 覆盖 1452~1752
# 间隙: 953~1054=101px, 1354~1452=98px ✅
```

---

## 4. 工具诊断工作流

这是接手嵌套复合时最常用的诊断路径：

```
用户报告布局/结构异常
  │
  ▼ [Step 1] 位置数据
  npx tsx tools/dump-layout.ts <file.gia>
  → 读坐标数值，人工算间距、覆盖范围
  │
  ▼ [Step 2] 控制流验证
  npx tsx tests/composite/trace-exec-flow.ts <file.gia>
  → 确认 exec 链拓扑正确
  │
  ▼ [Step 3] 数据流验证
  npx tsx tests/composite/trace-dataflow.ts <file.gia> <nodeIdx> <paramIdx>
  → 反向追数据源，确认连线完整
  │
  ▼ [Step 4] 可视化
  npx tsx tests/composite/ascii-layout.ts --compact <file.gia>
  → 快速确认有无碰撞、孤立
  │
  ▼ [Step 5] 对比参考
  npx tsx tools/dump-layout.ts <参考文件.gia>
  → 对比间距、Y 对齐、数据节点位置比例
```

**工具避坑：**
- `decode-gia.ts` 对大型文件（>50KB）可能超时，优先用 `dump-layout.ts`
- `ascii-layout.ts` 对复杂图（>10 节点）渲染可能重叠，用 `--compact` 缓解
- `trace-dataflow` 反向追踪时如果路径跨复合边界，输出中会显示 `⤷ 进入 ... 编译体`

---

## 5. 为嵌套复合做的准备

### 5.1 已 ready 的能力

- exec 复合内部可包含 exec 节点 + 数据节点 ✅
- compositePins 重定向机制（InFlow→首个 exec 子节点）✅
- 复合内部 exec 布局（BFS）+ 数据布局（Kahn 拓扑排序）✅
- 终端节点自动生成（未连接的 OutFlow → Print_String）✅
- 数据流跨复合边界追溯 ✅

### 5.2 已知瓶颈（嵌套时会遇到）

| 问题 | 位置 | 说明 |
|------|------|------|
| Y 负坐标 | `composite.ts:LAYOUT_DATA_Y_OFFSET = -250` | 纯数据节点在复合内被放到 Y<0 区域。主图有 `placeDetachedGrid` 兜底，但复合内部用不同的布局路径。嵌套时子复合 impl 布局可能不可见 |
| 预捕获 hack | 所有测试脚本 | 当前用 `dummyBuild = buildServerGraphRegistriesIRDocuments()` 触发 Phase A。嵌套时多个复合的捕获时序更复杂，这个 hack 可能不稳定 |
| 嵌套调用的 `__composite_call__` 编码 | `ir_to_gia_transform/index.ts` | 嵌套时复合 call 节点内需要编码子复合的调用。当前机制假设所有 call 在同一层 |
| 多 OutFlow 分支的布局 | `composite.ts` `computeImplLayout` | 分支节点（Multiple Branches）的拓扑布局与简单的 BFS exec 链不同，嵌套 + 分支组合时布局可能错乱 |
| 参考 GIA 分析 | 缺少嵌套复合的参考文件 | 当前 composite/ 目录中只有 `demo_C_nested_call.gia`，需要解码分析其中间布局模式 |

### 5.3 建议进度

```
当前 ──→ 嵌套复合 ──→ 多 OutFlow 分支 ──→ 预捕获 API 重构 ──→ 全面测试覆盖
(r11)     (r12)         (r13)               (r14)               (r15)
```

---

## 6. 测试资产速查

### 6.1 当前测试文件

| 测试 | 覆盖 | 运行 |
|------|------|------|
| `exec-with-data.ts` | 本轮核心：exec+data 复合管线 | `npx tsx tests/composite/exec-with-data.ts` |
| `test-two-exec.ts` | 双 exec 复合串行 | `npx tsx tests/composite/test-two-exec.ts` |
| `simple-double.ts` | 纯数据复合基线 | `npx tsx tests/composite/simple-double.ts` |
| `demo_addsub2.ts` | 纯数据复合 + 类型转换 | `npx tsx tests/composite/demo_addsub2.ts` |
| `test-mixed-composite-normal.ts` | exec 复合 + 普通节点混合 | `npx tsx tests/composite/test-mixed-composite-normal.ts` |

### 6.2 参考 GIA（游戏编辑器产出）

在游戏导出目录 `composite/` 中：

| 文件 | 用途 |
|------|------|
| `demo_A_basic_call.gia` | 纯数据复合布局参考 |
| `demo_B_exec_call.gia` | exec 复合布局参考（columnWidth=800 来源） |
| `类型转化_gen.gia` | 数据节点位置参考（Y 偏移 250 来源） |
| `mixed_composite_and_normal.gia` | 5 节点长链布局参考 |
| `demo_C_nested_call.gia` | 嵌套复合参考（下一轮用） |

### 6.3 回归

```bash
npm run quicktest   # 快速测试（跳过 GIA 生成）
npm test            # 完整测试（包括 GIA 生成）
```

---

## 7. 文档更新记录

| 文档 | 变更 |
|------|------|
| `r10-simple-composite-pipeline.md` | 更新 Bug 2 描述：旧方案→r11 完全修复；更新关键概念表格；更新遗留问题表新增 r11 已修复项 |
| `composite.ts` | 过滤 capture 始终执行 + compositePins 重定向 + 移除 capture edges |
| `layout.ts` | columnWidth 350→800；数据节点偏移 300→400、250→150 |
| `index.ts` | 终端生成 rawX +350→+800、rawY 参考值 252→315 |
| `todo.md` | 新增布局优化 TODO 段落 |

---

## 8. 工具文件

| 文件 | 用途 |
|------|------|
| `tools/dump-layout.ts` | 提取 GIA 节点坐标 + 连线（分析布局用） |

---

## 附录：布局参数决策树

```
columnWidth = 800
  ← demo_B_exec_call 实测：event(5) → composite(805) → printString(1604) 间距 ~800
 
rowHeight = 350
  ← 保持原值，当前场景只用单行，不影响

数据节点 X = consumer.x - 400
  ← 验证过程：
     旧: cx-300 → (1304)，与 terminal(1609) 覆盖范围重叠 91px ❌
     验: node 半宽 150px，中心间距需 ≥ 300px
     新: cx-400 → (1209)，在 composite(803) 和 terminal(1609) 间隙 504px 正中央 ✅

数据节点 Y = consumer.y + 150
  ← 参考中偏移 250，用户觉得太高，调整为 150
  ← 介于 exec 行(y≈5) 和旧位置(y=251) 之间
```
