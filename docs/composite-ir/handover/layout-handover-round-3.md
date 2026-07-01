# 布局任务交接文档 · 第三轮

> **本轮目标**：完成 P0 对比测试（分支.gia/分支2.gia/两个复合节点.gia/各种flow.gia），修复分支间距和游离节点位置
> **前一轮文档**：[layout-handover-round-2.md](layout-handover-round-2.md)

---

## 一、本轮背景

本轮完成了 handover 文档中列出的全部 3 个 P0 对比测试，并修复了两个布局问题。

### 本轮完成的工作

| 工作 | 文件 | 说明 |
|------|------|------|
| branchGap 调整 | `layout.ts` | `rowHeight * 0.6`(168) → `rowHeight * 0.9`(252) |
| impl 图 Y 间距调整 | `composite.ts` | `LAYOUT_EXEC_V_STEP`: 150 → 200 |
| 游离节点放置修复 | `layout.ts` | `placeDetachedGrid` 从左上角改为 exec 流下方 |
| 分支对比测试 | `tests/layout-branch.ts` | 场景A: event→fork(A,B); 场景B: event→fork(chainA,chainB) |
| 多事件对比测试 | `tests/layout-two-composites.ts` | 两个独立 server，各自调用不同复合 |
| 多种拓扑对比测试 | `tests/layout-various.ts` | 线性/分支/多出口复合+多事件 |
| 游戏内测试验证 | 游戏内导入 | ✅ **全部通过**，9 个文件布局正常、无重叠、边连接正确 |

### 对比结果汇总

| 参考文件 | gsts 文件 | Y 间距对比 | X 步进对比 |
|---------|-----------|-----------|-----------|
| 分支.gia (257) | layout-branch_0 (250) | ✅ 250 vs 257（接近） | 350 vs ~370 |
| 分支2.gia (354) | layout-branch_1 (256) | ⚠️ 256 vs 354（gsts 更紧凑） | 350 vs ~800 |
| 各种flow.gia acc[9] (237) | layout-various_0 acc[3] (200) | ✅ 200 vs 237（改善明显） | 350 vs ~328 |

---

## 二、修复详解

### Fix 2.2.1: 主图分支 Y 间距

**问题：** `branchGap = rowHeight * 0.6 = 168` 过于紧凑。

| 文件 | 编辑器中分支Y间距 | 旧值(gsts) | 新值(gsts) |
|------|-------------------|-----------|-----------|
| 分支.gia | 257 | 168 | 250 |
| two_exec.gia | 192 | 168 | 254 |

**修复：** `layout.ts` 中 `branchGap` 从 `rowHeight * 0.6` 改为 `rowHeight * 0.9 = 252`。

```diff
- const branchGap = Math.trunc(config.rowHeight * 0.6)
+ const branchGap = Math.trunc(config.rowHeight * 0.9)
```

**选择逻辑：** `0.9` 产生 252 的间距，接近编辑器常见值 250-350 的下限。对于 ≤4 分支的图（gsts 的典型场景），总跨度 ≤1000，可读性良好。

### Fix 2.2.2: 游离节点放置位置

**问题：** `placeDetachedGrid` 将游离节点统一放在 `(负X, 负Y)` 区域，可能覆盖已放置的 exec 流节点。

**修复：** 改为计算已放置节点的最大 Y 坐标，游离节点放在 exec 流下方。

```diff
- const left = -cols * config.columnWidth
- const top = -rows * config.rowHeight
+ let maxY = 0
+ for (const pos of state.positions.values()) { if (pos[1] > maxY) maxY = pos[1] }
+ const baseY = maxY + config.eventGap
```

### Fix 2.2.3: Impl 图 Y 间距

**问题：** `LAYOUT_EXEC_V_STEP = 150` 导致 impl 图分支间 Y 间距过小。

**修复：** 增大到 200，接近编辑器常见值 ~237。

```diff
- const LAYOUT_EXEC_V_STEP = 150
+ const LAYOUT_EXEC_V_STEP = 200
```

---

## 三、测试方法

### 编译

```bash
npx tsx bin/gsts.mjs -c gsts.test.config.ts tests/layout-branch.ts
npx tsx bin/gsts.mjs -c gsts.test.config.ts tests/layout-two-composites.ts
npx tsx bin/gsts.mjs -c gsts.test.config.ts tests/layout-various.ts
```

由于每个 `.ts` 文件包含多个 `g.server()`，输出为多个 `.gia` 文件（`_0`, `_1`...）。

### 查看布局

```bash
npx tsx tests/composite/dump-nodes.ts dist/tests/layout-branch_0.gia
npx tsx tests/composite/dump-nodes.ts dist/tests/layout-branch_1.gia
```

### 审计

```bash
npx tsx tests/composite/audit-layout.ts dist/tests/layout-branch_0.gia
```

### 对比参考文件

```bash
REF="/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit"
npx tsx tests/composite/dump-nodes.ts "$REF/分支.gia"
npx tsx tests/composite/dump-nodes.ts "$REF/分支2.gia"
```

---

## 四、布局参数当前值

```typescript
// layout.ts（主图）
columnWidth: 350    // X 步进
rowHeight: 280      // 分支间距基值（branchGap = rowHeight * 0.9 = 252）
maxColumns: 8       // 超长链的换行边界
wrapHeight: 280
eventGap: 300       // 多事件间隔

// composite.ts（impl 图）
LAYOUT_EXEC_H_STEP = 350    // 与主图一致
LAYOUT_EXEC_V_STEP = 200    // 分支 Y 偏移（增大，接近编辑器 237）
LAYOUT_DATA_H_STEP = 350
LAYOUT_DATA_Y_OFFSET = -250
```

---

## 五、已知问题

### 本轮已确认
| 问题 | 影响 | 状态 |
|------|------|------|
| 分支2.gia Y 间距 354 > gsts 256 | gsts 更紧凑，但游戏内测试视觉正常 | ✅ 非阻塞，标记为已知差异 |
| 各种flow.gia 主图节点全游离，gsts 无法精确复现 | 对比不可直接进行 | ✅ 已知——信号/数据依赖 vs exec 拓扑差异 |
| 两个复合节点.gia 含"自定义输入"（nid=18）游离节点 | gsts 不生成此类型节点 | ✅ 已知，非阻塞 |

### 剩余待处理

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P1 | 主图多 outflow 终端节点 | 复合调用有多 outflow 时，主图不生成终端节点（参考文件中存在，gsts 缺失） |
| P1 | 复合嵌套布局验证 | 复合内部调用另一个复合时，`computeImplLayout` 需要处理嵌套 |
| P2 | 布局 ASCII/SVG 可视化 | 目前只能看坐标数字，可视化提升对比效率 |
| P2 | `other.wire.ts` 泛型列表类型推断错误 | 预存错误，与本轮无关 |

---

## 六、参考文件路径

```
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/
```

---

## 七、文件索引

| 文件 | 用途 |
|------|------|
| `src/compiler/ir_to_gia_transform/layout.ts` | 主图布局算法（含 branchGap, placeDetachedGrid） |
| `src/compiler/ir_to_gia_transform/composite.ts` | impl 图布局（含 LAYOUT_EXEC_V_STEP） |
| `tests/layout-branch.ts` | 分支对比测试（2 场景） |
| `tests/layout-two-composites.ts` | 多事件对比测试 |
| `tests/layout-various.ts` | 多种拓扑对比测试 |
| `tests/composite/audit-layout.ts` | 布局质量审计 |
| `tests/composite/dump-nodes.ts` | 节点坐标打印 |
| `tests/composite/audit-layout.ts` | 布局质量审计 |

---

## 八、下一轮方向

### 建议任务（P1，P0 已全部完成）

#### 主图多 outflow 终端节点（P1）

**问题：** 当复合节点有多个 OutFlow 出口时，主图仅生成复合调用节点，不生成终端（end）节点。参考文件（顺序执行.gia 等）在主图中为每个 outflow 出口生成一个 terminal 节点。

**影响：** 参考文件对比时，主图节点数少于参考（顺序执行 ref 4 节点 vs gsts 2 节点）。

**解决方向：** 在 main graph 编码阶段，检测复合调用的 outflow 数量，为每个 outflow 出口生成一个 `end` node（nid=2，顺序执行/终端），并添加连边。

**涉及文件：** `src/compiler/ir_to_gia_transform/` — 可能是 `runner.ts` 或单独的文件。

#### 复合嵌套布局验证（P1）

**问题：** 当复合 A 调用复合 B 时，A 的 impl 图中会出现对 B 的调用节点。`computeImplLayout` 需要处理这种嵌套——内部调用节点也应该被布局。

**验证方法：** 写一个 `tests/layout-nested.ts`，让复合 A 调用复合 B，编译后检查 A 的 impl 图布局。

#### 布局 ASCII 可视化（P2）

不依赖游戏测试，直接在终端输出 ASCII 图：

```
Event ──→ CompA ──→ Print
         └──→ CompB ──→ Print
```
目前在 `audit-layout.ts` 中有简易 ASCII 拓扑，可增强。
