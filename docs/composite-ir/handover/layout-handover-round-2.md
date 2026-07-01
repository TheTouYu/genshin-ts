# 布局任务交接文档 · 第二轮

> **本轮目标**：让 gsts 生成的 GIA 布局接近编辑器手工布局质量（续）
> **下一轮入口**：继续用 `tests/layout-*.ts` 编译并与参考文件对比
> **前一轮文档**：[layout-handover-round-1.md](layout-handover-round-1.md)

---

## 一、本轮背景

在上一轮的基础上，本轮继续对比 user_edit 参考文件，并在对比过程中发现并修复了复合节点 impl graph 入口节点缺失、数据节点布局覆盖 exec 布局两个 Bug。

### 本轮完成的工作

| 工作 | 文件 | 说明 |
|------|------|------|
| 顺序执行对比测试 | `tests/layout-sequence.ts` | 4分支+4 OutFlow 复合，拓扑正确 |
| capture 节点缺失修复 | `runtime/core.ts` + `runtime/composite_registry.ts` | 将 `__composite_capture__` 加入 implNodes |
| capture 节点 nodeId 注册 | `compiler/ir_to_gia_transform/mappings.ts` | `SPECIAL_NODE_IDS` 新增 `__composite_capture__: 2` |
| Impl node pin 生成修复 | `compiler/ir_to_gia_transform/composite.ts` | `__composite_capture__` 跳过 data pin 但保留 OutFlow pin |
| data 布局覆盖修复 | `compiler/ir_to_gia_transform/composite.ts` | dataNodeIds 过滤改用 `!visited` 而非 `!isTerminal` |
| 交接文档编写指南 | `docs/handover-guide.md` | 从本轮踩坑中提炼 |

### 当前布局参数

```typescript
// layout.ts（主图）
columnWidth: 350    // X 步进
rowHeight: 280      // 分支间距基值（branchGap = rowHeight * 0.6 = 168）
maxColumns: 8       // 超长链的换行边界
wrapHeight: 280
eventGap: 300       // 多事件间隔

// composite.ts（impl 图）
LAYOUT_EXEC_H_STEP = 350    // 与主图一致
LAYOUT_EXEC_V_STEP = 150    // 分支 Y 偏移（比主图的 branchGap 168 紧凑）
LAYOUT_DATA_H_STEP = 350
LAYOUT_DATA_Y_OFFSET = -250
```

> **注意**：`branchGap`（主图分支 Y 步进）= 168 和 `LAYOUT_EXEC_V_STEP`（impl 图分支 Y 步进）= 150 是两套不同的常量，不要混用。

---

## 二、本轮修复详解

### 2.1 复合 capture 入口节点缺失

**问题：** `toCompositeDefIR` 中 `implNodes` 只包含 `execNodes + dataNodes`，而 cap 入口节点是 `flow.eventNode`，不在这两个数组里。

| IR 字段 | 运行时来源 | 是否在 implNodes 中 |
|---------|-----------|-------------------|
| `eventNode` (capture) | `flow.eventNode` | ❌ 被排除（修复前） |
| `execNodes` | `flow.execNodes` | ✅ |
| `dataNodes` | `flow.dataNodes` | ✅ |

**后果：** 多 OutFlow 复合（使用 `f.fork` + `f.leaf()`）时，edges 引用了 capture 节点 ID，但该节点不在 impl graph 中 → 所有子节点孤立无 exec 连接，审计报 ORPHAN。

**修复：**
1. `CompositeCapture` 新增 `captureNodeId` 字段（`composite_registry.ts`）
2. `core.ts` 在捕获时保存 `flow.eventNode.id` 到 `captureNodeId`
3. `toCompositeDefIR` 在 `implNodes` 头部加入 capture 节点，InFlow composite pin 指向 `captureNodeId`
4. `mappings.ts` 将 `__composite_capture__` 映射到 nodeId 2（`double_branch`）
5. `buildImplNodePins` 对 `__composite_capture__` 跳过 data pin 但保留 OutFlow pin

### 2.2 数据节点布局覆盖 BFS 坐标

**问题：** `computeImplLayout` 有三阶段：

```
Stage 1: BFS exec flow → 放置 entry 和所有 exec 子节点（坐标正确）
Stage 2: 终端节点 → 放置链末节点（已 BFS 放置则跳过）
Stage 3: 数据节点 Kahn → 按深度/行放置（⚠ 会覆盖 Stage 1 对同一节点的坐标）
```

BFS 对 id=2~5 的 printString 节点正确放置了坐标（350,0/150/300/450）。但这些节点 `hasExecIn=true && hasExecOut=false && visited=true`，终端节点处理跳过它们。随后 dataNodeIds 筛选 `!hasExecOut && !isTerminal`，因为 `isTerminal` 只标记了 `!visited` 的节点，所以这些节点**进入了 data 布局**并被覆盖为 `(0, -250)` 等坐标。

**修复：** dataNodeIds 过滤条件从 `!hasExecOut && !isTerminal` 改为 `!hasExecOut && !visited`，排除 BFS 已放置的节点。

### 2.3 `fork` + `leaf` 的正确用法

多 OutFlow 复合需要在 `build()` 中用 `fork` 创建分支，再用 `leaf(outflowIndex)` 标记每个分支为 outflow 出口。

```typescript
// 正确：4 个分支各对应一个 outflow 出口
f.fork(
  () => { f.printString('第一'); f.leaf(0); },
  () => { f.printString('第二'); f.leaf(1); },
  () => { f.printString('第三'); f.leaf(2); },
  () => { f.printString('第四'); f.leaf(3); }
)
// 生成拓扑：entry → [4 个 printString]，每个 printString 是一个 outflow 出口
```

`leaf()` 的参数是 outflow 索引（0,1,2,...），对应 CompositeDef outflows 数组中的位置。

---

## 三、对比方法论

### 步骤

1. 看参考文件布局：
   ```bash
   npx tsx tests/composite/dump-nodes.ts <参考文件.gia>
   ```

2. 写 gsts 入口文件（`tests/layout-xxx.ts`）：
   ```ts
   import { g } from 'genshin-ts/runtime/core'
   // 定义复合 + 注册事件
   g.server({ name: 'main', id: <id> })
     .on('whenEntityIsCreated', (_e, f) => {
       // 使用 fork + leaf 创建多 outflow
     })
   ```

3. 编译：
   ```bash
   npx tsx bin/gsts.mjs -c gsts.test.config.ts tests/layout-xxx.ts
   ```

4. 对比：
   ```bash
   npx tsx tests/composite/dump-nodes.ts dist/tests/layout-xxx.gia
   npx tsx tests/composite/audit-layout.ts dist/tests/layout-xxx.gia
   ```

### 调试技巧

- **验证新代码是否编译**：`grep DEBUG dist/src/compiler/ir_to_gia_transform/composite.js`
- **在 `computeImplLayout` 中加 `console.error`** 验证 BFS 执行过程和最终坐标
- **检查 IR JSON**：`node -e "console.log(JSON.stringify(require('dist/tests/layout-xxx.json')['0'].compositeDefs[0]))"`
- **注意 `prebuild` clean dist**：`npm run build` 或 `npm test` 会清空 dist，.gia 文件需要重新编译
- **注意 `require.cache`**：用 `npx tsx` 运行脚本，不要用 `node` 直接跑，否则会缓存旧的 dist 代码

### 注意事项

- **`fork` + `leaf` 必须配对**：只用 `fork` 不调用 `leaf()`，复合只有一个默认的 outflow 出口
- **`fork` 的 rest 参数**：`fork(a, b, c)` 不是 `fork([a, b, c])`
- **leaf 索引连续**：`leaf(0)`, `leaf(1)`, `leaf(2)`… 跳过索引（如从 0 跳到 2）会导致 OutFlow pin 数量不正确
- **capture 节点的 nodeId=2**：这是 `double_branch` 类型，作为复合入口节点

---

## 四、已完成对比

| 参考文件 | gsts 入口 | 状态 | 差异 |
|---------|-----------|------|------|
| 基本调用节点.gia | `tests/layout-basic-call.ts` | ✅ | 间距 356 vs 335，Y 水平对齐 vs 斜线 |
| two_exec.gia | `tests/layout-two-exec.ts` | ✅ | 用 `fork` 实现分支拓扑，间距合理 |
| 顺序执行.gia | `tests/layout-sequence.ts` | ✅ | impl 图拓扑匹配（entry→[4分支]），间距均匀 |

### 对比结果汇总

```
参考 基本调用节点           gsts（基本调用）
事件(-321,-223)             事件(5,2)
复合(14,-148)   间距 335     复合(360,2)   间距 355
impl 终端(0,0)              impl 终端(0,0)  ✅

参考 two_exec               gsts（fork）
事件(3,4) → [A(802,0),     事件(10,1) → [A(355,4),
            B(781,192)]                  B(356,174)]
Y 分支偏移: 192              Y 分支偏移: 170

参考 顺序执行.impl          gsts（顺序执行.impl）
entry(-145,-81)→[4节点]     entry(0,0)→[4节点]
子节点 X≈269-287, Y分散      子节点 (350,0/150/300/450)
间距：~414 非均匀            间距：350 均匀步进
```

---

## 五、待做任务

### 优先级 P0（直接影响正确性）

| 任务 | 入口 | 说明 |
|------|------|------|
| `分支.gia` / `分支2.gia` | `tests/layout-branch.ts` | 显式分支场景，验证 `fork` 分支偏移 |
| `两个复合节点.gia` | `tests/layout-two-composites.ts` | 多事件+复合混合，验证 eventGap |
| `各种flow.gia` | `tests/layout-various.ts` | 最大参考文件（7节点），边界测试 |

### 优先级 P1（需要但未阻塞）

| 任务 | 说明 |
|------|------|
| 主图多 outflow 终端 | 当前复合调用有多 outflow 时，主图不生成终端节点。参考文件在 main graph 中有终端节点，gsts 没有。需要在 main graph 编码中补充。 |
| 复合嵌套布局 | 复合内部调用另一个复合时，`computeImplLayout` 需要处理嵌套。未验证。 |

### 优先级 P2（工具/体验）

| 任务 | 说明 |
|------|------|
| 布局 ASCII 可视化 | 目前只能看坐标数字，加 ASCII/SVG 输出提升对比效率 |
| 审计工具增强 | 复合调用节点视觉分组、边交叉可视化 |

---

## 六、关键概念

### computeImplLayout 三阶段

```
function computeImplLayout(nodes, edges):
  Stage 1: BFS exec flow
    - 从 entry 节点开始 BFS，每个节点 x += LAYOUT_EXEC_H_STEP
    - 多分支 Y 偏移 = idx * LAYOUT_EXEC_V_STEP
    - 放置所有 exec 可达节点

  Stage 2: 终端节点（hasExecIn && !hasExecOut && !visited）
    - 放置 BFS 未覆盖的终端节点在父节点右侧
    - ⚠ 已 BFS 放置的终端节点不会在此阶段被覆盖

  Stage 3: 数据节点 Kahn 拓扑
    - dataNodeIds = nodes.filter(!hasExecOut && !visited)
    - 按数据依赖深度分列，同列按行进位
    - ⚠ 如果过滤条件错误，会覆盖 Stage 1 的坐标
```

### 节点类型对照

| GIA kind | 含义 | nid 示例 | 出现位置 |
|----------|------|---------|---------|
| 22000 (SysCall) | 普通执行节点/事件/终端 | 1=print_string, 2=double_branch, 71=whenEntityIsCreated | 主图 + impl 图 |
| 22001 (SysGraph) | 复合调用节点 | 复合 ID | 主图 |

### API 速查

| API | 用途 | 用法 |
|-----|------|------|
| `f.fork(a, b, c)` | 从当前 tail 分叉，a/b/c 共用同一父节点 | `f.fork(() => f.printString('A'), () => f.printString('B'))` |
| `f.leaf(idx)` | 标记当前 tail 为 OutFlow[idx] 出口 | 必须配合 `fork` 使用 |
| `f.callComposite(handle, {})` | 调用复合节点 | 可在 `fork` 内或外使用 |
| `g.defineComposite(name, {inputs, outputs, build})` | 定义复合节点 | `build` 必须返回 `{}` |

---

## 七、已知问题

### 已知缺口

| 问题 | 影响 | 状态 |
|------|------|------|
| 主图多 outflow 复合调用不生成终端节点 | 对比时 main graph 节点数少于参考文件 | 已知，未实现 |
| 复合嵌套复合布局未验证 | 可能产生不理想的 impl 图布局 | 需验证 |
| 布局无可视化工具 | 只能看坐标数字，对比效率低 | 需实现 |

### 调试陷阱

| 陷阱 | 现象 | 解决 |
|------|------|------|
| `npm run build` 的 prebuild 清空 dist | 之前编译的 .gia 消失 | `git stash`/`git commit` 后再 build |
| `require.cache` 缓存旧 dist | 修改不生效 | 用 `npx tsx` 运行，不要用 `node` |
| dataNodeIds 过滤条件错误 | 坐标全部为 data 布局模式（X=0，Y=-250/-100/…） | 检查过滤条件是否排除了已 BFS 放置的节点 |

---

## 八、关键文件索引

| 文件 | 用途 |
|------|------|
| `src/compiler/ir_to_gia_transform/layout.ts` | 主图布局算法（`layoutPositions`） |
| `src/compiler/ir_to_gia_transform/composite.ts` | impl 图布局（`computeImplLayout`，`buildImplNodePins`） |
| `src/runtime/core.ts` | `MetaCallRegistry`（`fork` 行 902，`leaf` 行 875，captureNodeId 行 1582+） |
| `src/runtime/composite_registry.ts` | 复合节点注册（`toCompositeDefIR`，`addOutFlowCompositePins`） |
| `src/compiler/ir_to_gia_transform/mappings.ts` | Special node IDs（`SPECIAL_NODE_IDS` 含 `__composite_capture__`） |
| `src/runtime/ir_builder.ts` | IR 构建 |
| `src/definitions/nodes.ts` | `ServerExecutionFlowFunctions`（`fork` 暴露） |
| `tests/composite/audit-layout.ts` | 布局质量审计 |
| `tests/composite/dump-nodes.ts` | 节点坐标打印 |
| `tests/composite/analyze-editor-layout.ts` | 编辑器布局统计分析 |
| `tests/layout-basic-call.ts` | 基础调用对比（第 1 轮） |
| `tests/layout-two-exec.ts` | 分支调用对比（第 1 轮） |
| `tests/layout-sequence.ts` | 顺序执行对比（第 2 轮新增） |
| `docs/handover-guide.md` | 交接文档编写指南（第 2 轮新增） |

---

## 九、参考文件路径

```
user_edit 文件: /mnt/c/.../Beyond_Local_Export/user_edit/
复杂 GIA 文件: /mnt/c/.../Beyond_Local_Export/复杂gia/
```
