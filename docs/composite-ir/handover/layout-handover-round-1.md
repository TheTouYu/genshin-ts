# 布局任务交接文档

> 本任务的目标：让 gsts 生成的 GIA 布局接近编辑器手工布局的质量。
> 下一轮对话的入口：继续用 `tests/layout-*.ts` 编译并与参考文件对比。

---

## 一、背景：编辑器如何工作

**编辑器显示范式：**
- 每个复合节点以独立窗口/标签页打开
- 每个窗口只显示当前复合的**直接子节点**
- 因此编辑器里每个视图天然 ≤10 节点
- 复杂 GIA（24-74 节点）是树展开后的扁平数据——编辑器里从不这样展示

**布局无关紧要：**
- 几节点随手拖都能对齐
- 编辑器坐标是手工放的，无固定步进
- 自动布局的优化目标是小图（≤8 节点）紧凑整齐

详见 `docs/composite-ir/layout-patterns.md`。

---

## 二、当前状态

### 已完成的修改

| 修改 | 文件 | 说明 |
|------|------|------|
| 引导流不产生多余节点 | `runtime/core.ts` | `ensureBootstrapFlow` 创建 `__bootstrap__` 标记的最小流，`ir_builder.ts` 在 IR 层面跳过 |
| `fork` API | `runtime/core.ts` + `definitions/nodes.ts` | 新增 `f.fork(...branches)` 创建分支拓扑 |
| 布局常量校准 | `layout.ts` + `composite.ts` | `columnWidth: 350, rowHeight: 280, maxColumns: 8` |
| impl 终端节点修复 | `composite.ts` | `computeImplLayout` 区分终端节点（hasExecIn && !hasExecOut）和数据节点 |
| 审计工具 | `tests/composite/audit-layout.ts` | 检查重叠、边交叉、回溯、分支重叠 |
| 对比工具 | `tests/composite/dump-nodes.ts` | 打印所有 graph 的节点坐标 |
| 分析工具 | `tests/composite/analyze-editor-layout.ts` | 基于 OutFlow 连接的编辑器布局统计分析 |
| 文档 | `docs/composite-ir/layout-patterns.md` | 25 个 user_edit 文件的布局规律总结 |

### 当前布局参数

```typescript
// layout.ts（主图）
columnWidth: 350    // X 步进
rowHeight: 280      // 分支间距基值（branchGap = rowHeight * 0.6 = 168）
maxColumns: 8       // 超长链的换行边界（小图不需要，大图兜底）
wrapHeight: 280
eventGap: 300       // 多事件间隔

// composite.ts（impl 图）
LAYOUT_EXEC_H_STEP = 350    // 与主图一致
LAYOUT_EXEC_V_STEP = 150    // 分支 Y 偏移
LAYOUT_DATA_H_STEP = 350
LAYOUT_DATA_Y_OFFSET = -250
```

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
       // 使用 fork 创建分支
     })
   ```

3. 编译：
   ```bash
   npx tsx bin/gsts.mjs -c gsts.test.config.ts tests/layout-xxx.ts
   ```

4. 对比：
   ```bash
   npx tsx tests/composite/dump-nodes.ts dist/tests/layout-xxx.gia
   ```

### 注意事项

- **编译失败**：检查 `npm run build` 先通过，否则 postbuild 不会复制 `gia.proto` 到 dist 导致 GIA 生成失败
- **`fork` 是分支关键**：顺序调用 `f.callComposite(A); f.callComposite(B)` 产生链式，用 `f.fork(() => A, () => B)` 产生分支
- **`fork` 的 rest 参数**：`fork(...branches: Array<() => void>)`，调用用 `fork(a, b, c)` 不是 `fork([a, b, c])`

---

## 四、本次改动

### compositeCapture 入口节点修复

在实现 顺序执行.gia 对比时发现复合节点实现图中 capture 入口节点缺失的问题。

**修复前：**
- `toCompositeDefIR` 中 `implNodes` 只包含 `execNodes + dataNodes`，capture 节点（`__composite_capture__`）被遗漏
- InFlow composite pin 指向第一个 exec 节点而非 capture 节点
- edges 引用 capture 节点 ID，但该节点不在 impl graph 中 → 子节点孤立

**修复内容：**

1. **`composite_registry.ts`**: `CompositeCapture` 新增 `captureNodeId` 字段
2. **`core.ts`**: 捕获 capture 时保存 `flow.eventNode.id` 到 `captureNodeId`
3. **`composite_registry.ts` (`toCompositeDefIR`)**:
   - 在 `implNodes` 数组头部加入 capture 节点（type=`__composite_capture__`）
   - InFlow composite pin 改为指向 `captureNodeId`
4. **`mappings.ts`**: `SPECIAL_NODE_IDS` 新增 `__composite_capture__: 2`
5. **`composite.ts` (`buildImplNodePins`)**: `__composite_capture__` 跳过 data pin 生成但仍然生成 OutFlow pin
6. **`composite.ts` (`computeImplLayout`)**: data 节点过滤改用 `!visited` 而非 `!isTerminal`，避免 BFS 已放置的 terminal 节点被 data 布局覆盖

## 五、`fork` API 设计

### 语法

```ts
f.fork(
  () => f.callComposite(comp1, {}),
  () => f.callComposite(comp2, {})
)
// 生成：event → [comp1, comp2]（分支）
```

### 实现原理

`MetaCallRegistry.fork()` 在 `runtime/core.ts:895-929`：

```ts
fork(...branches: Array<() => void>): void {
  const parentEndpoints = [...ctx.tailEndpoints]  // 保存父节点
  for (const branch of branches) {
    ctx.tailEndpoints = [...parentEndpoints]       // 每个分支恢复父节点
    branch()                                        // 执行分支
  }
  ctx.tailEndpoints = [lastBranchLastNode]          // 尾部推进到最后
}
```

关键：每个分支都从同一个父节点（上次的 tail）出发，而不是链式推进。

### 后续代码

`fork` 之后 tail 推进到最后一个分支的末节点，继续写代码会链式接在后面：

```ts
f.fork(
  () => f.callComposite(comp1, {}),
  () => f.callComposite(comp2, {})
)
f.printString('后续')
// 结构: event → [comp1, comp2] → printString
```

---

## 六、已完成对比

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

## 七、待做任务

### 1. 继续对比 user_edit 文件

优先级建议：
1. ~~`顺序执行.gia` — 事件→复合→两个出口（分支链混合）~~ ✅
2. `分支.gia` / `分支2.gia` — 显式分支场景
3. `两个复合节点.gia` — 多事件+复合混合
4. `各种flow.gia` — 最大文件（7节点），测试边界

### 2. 复合节点打开后的布局

当前 `computeImplLayout` 只有简单 BFS + 终端节点处理。如果有嵌套复合（复合内部调用复合），布局可能不理想。需要验证。

### 3. 审计工具增强

`audit-layout.ts` 目前检测的功能有限。可以扩展：
- 复合调用节点的视觉分组
- 边交叉可视化（ASCII）

### 4. 布局的可视化

编辑器的布局是 WYSIWYG 的——目前只能看坐标数字。加一个 ASCII 可视化或 SVG 输出会极大提升对比效率。

---

## 八、关键文件索引

| 文件 | 用途 |
|------|------|
| `src/compiler/ir_to_gia_transform/layout.ts` | 主图布局算法 |
| `src/compiler/ir_to_gia_transform/composite.ts` | impl 图布局（`computeImplLayout`） |
| `src/runtime/core.ts` | `MetaCallRegistry`（`fork` 实现，`ensureBootstrapFlow`，captureNodeId） |
| `src/runtime/composite_registry.ts` | 复合节点注册（captureNodeId 存储，implNodes 包含 capture） |
| `src/compiler/ir_to_gia_transform/mappings.ts` | Special node IDs（`__composite_capture__`） |
| `src/definitions/nodes.ts` | `ServerExecutionFlowFunctions`（`fork` 暴露） |
| `docs/composite-ir/layout-patterns.md` | 布局规律文档 |
| `tests/composite/audit-layout.ts` | 布局质量审计 |
| `tests/composite/dump-nodes.ts` | 节点坐标打印 |
| `tests/composite/analyze-editor-layout.ts` | 编辑器布局统计分析 |
| `tests/layout-basic-call.ts` | 基础调用对比 |
| `tests/layout-two-exec.ts` | 分支调用对比 |
| `tests/layout-sequence.ts` | 顺序执行（多分支+多OutFlow）对比 |

---

## 九、参考文件路径

```
user_edit 文件: /mnt/c/.../Beyond_Local_Export/user_edit/
复杂 GIA 文件: /mnt/c/.../Beyond_Local_Export/复杂gia/
```

（具体路径含中文，Windows 路径太长，建议用环境变量 `$REF`）
