# 布局任务交接文档 · 第十三轮

> 状态：待继续 / 当前实现分析 / 历史记录
> 来源：当前代码实现 + 用户游戏内测试反馈 + 截图观察 + 用户人工修复参考 GIA
> 最近校验：2026-07-08
> 适用范围：gsts 当前输出的主图布局与复合节点 impl 布局统一工作；不代表编辑器唯一布局规则

> **本轮目标**：承接 Round 12。Phase 1 已完成：复合 impl 复用主图 `layout.ts` 语义布局核心。用户游戏内确认改动生效，但共享布局核心暴露出主图与复合 impl 都存在的数据流布局问题。下一轮应先在主图同构测试中复刻并修复共享布局核心，再回到复合 impl 验证。
> **上一轮文档**：[layout-handover-round-12.md](layout-handover-round-12.md)
> **通用工作规则**：[layout-working-rules.md](layout-working-rules.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)
> **当前推荐 API 文档**：[../../architecture/composite/raw-control-flow-dsl-quickstart.md](../../architecture/composite/raw-control-flow-dsl-quickstart.md)、[../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)

---

## 一、当前状态摘要

### 1.1 已提交：复合 impl 复用主图布局核心

已提交：

```text
cac6de4 fix: reuse main layout for composite impl
```

改动：

- `src/compiler/ir_to_gia_transform/composite.ts`
  - 删除复合 impl 独立 BFS/Kahn 简化布局。
  - 引入 `buildExecutionGraph` / `layoutPositions`。
  - 将 `implEdges` 适配回临时 `next` 字段，让复合 impl 走主图布局核心。
  - 保持 impl `GraphNode.x/y` 使用布局像素坐标，不做主图 `Graph/Node#setPos` 的 `/300`、`/200` 缩放。
- `tests/layout-r6-d-composite-summary.ts`
  - 图名改为 `R6-D复合摘要-step2-unified-impl-layout`。

用户游戏内反馈：

1. Phase 1 改动生效。
2. 复合 impl 内仍存在布局问题。
3. 该问题大概率主图也存在。

### 1.2 新增主图同构测试

新增测试：

```text
tests/layout-r6-d-main-equivalent.ts
```

图名：

```text
R6-D主图同构-step1
```

导出文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-main-equivalent-step1.gia
```

目的：把 Round 12 复合 impl 中的复杂数据链和三条执行分支直接放到主图，验证共享布局核心是否也会在主图产生同类问题。

注意：该测试为了避免 raw API 干扰，使用高层 `f.xxx()` DSL。Stage 1 会把部分 vec3 中间值改写成 `initLocalVariable` / `setLocalVariable`，因此它不是复合 impl 的 100% 二进制同构，但足够暴露主图共享布局问题。

### 1.3 已更新通用工作规则

已更新：

```text
docs/composite-ir/handover/layout-working-rules.md
```

新增规则：

- 只新增或修改 `tests/*.ts` 布局测试时，不需要 `npm run build`；直接用现有 `bin/gsts.mjs` 生成测试 GIA。
- 主图普通布局测试优先使用高层 `f.xxx()` DSL；需要精确手动复刻控制拓扑时使用 `f.entry()` / `f.node()` / `f.link()`。
- 不要把 `f.registerExecNode()` 当作主图普通测试工具；它是自动串联 tail 的低层兼容/API，主图普通路径曾触发 `removeUnusedNodesFromFlow` 中 `record.args is not iterable` 的实现缺口。

---

## 二、本轮测试资产与截图

### 2.1 复合 impl step2 错误截图

用户保存：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复合节点-布局错误-step2.png
```

观察：

- Phase 1 后节点不再全部重叠。
- 数据节点仍插在执行泳道之间。
- 部分数据生产者离最终消费者过远。
- 只输出到复合边界的节点没有按“边界输出也是消费者”处理。

### 2.2 主图同构错误截图

用户保存：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复合节点-布局错误-step2-主图同构.png
```

观察：

- 输入流/局部变量/数据转换节点被拉到过远位置。
- 出现数据输出参数倒退连接给左边节点的视觉问题。
- 多条蓝色数据线跨越大面积空白，整体过于松散。
- 大参数节点 `initiateAttack` 附近吸附了过多上游数据，拖远了中间计算链。

### 2.3 用户人工修复参考

用户提供人工修复后的截图和 GIA：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复合节点-布局错误-step2-主图同构-修复.png
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复合节点-布局错误-step2-主图同构-修复.gia
```

解码命令：

```bash
npx tsx tools/decode-gia.ts '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复合节点-布局错误-step2-主图同构-修复.gia' > /tmp/r6d-main-equivalent-fixed.dec.json
```

对比结论：

- 人工修复不是简单整体平移或缩放。
- 前半段数据链从错误版的远右区域收回到消费者附近。
- 攻击参数数据链也被压缩到 `initiateAttack` 左侧附近。
- 修复版遵循“数据链贴近主要消费者，并保持在消费者左侧或左下侧”的布局意图。

---

## 三、当前阻塞：共享布局核心的五个待修点

下一轮应把这些问题作为同一类共享布局核心问题处理，不要回退到复合 impl 专属布局。

### 3.1 复合边界输出缺少虚拟消费者

Round 12 已发现但尚未处理：复合 impl 中只输出到 OutParam 边界的数据节点，没有真实 IR 消费者。当前 `layoutPositions` 只从节点参数里的 data connection 建立 consumer，因此这类节点容易被当成游离节点或弱关联数据节点。

待修方向：为复合 impl 的 OutParam compositePins 建立“虚拟消费者”或 graph output consumer，使输出数据节点能按边界输出位置/最终输出语义参与布局。

完成记录（2026-07-08）：

- 已实现：`layoutPositions(...)` 增加 `extraDataConnections` / `virtualConsumerIds` 选项；复合 impl 布局把 OutParam compositePins 转成隐藏输出锚点。
- 已验证：用户游戏内确认 `布局r6-d-composite-summary-step3-output-anchor.gia` 通过。
- 当前测试图名：`R6-D复合摘要-step3-output-anchor`。

### 3.2 数据区插入执行泳道之间

Round 12 已发现但尚未处理：数据节点会被放到两条执行分支之间，例如第一条执行分支在上方、第二条执行分支在中间，数据节点落在二者之间，造成数据线和控制线交叉。

待修方向：数据块应避开执行泳道之间的视觉通道；对执行消费者的数据块应放在该消费者下方或左下方，并给下一条执行泳道预留足够垂直空间。

### 3.3 多消费者数据节点锚点不理想

主图同构暴露：一个数据节点如果同时服务中间数据节点和后续大执行节点，当前布局可能被后续大消费者或最终消费者抢走锚点，导致中间计算链被拖远。

待修方向：多消费者数据节点优先锚定到最近的直接数据消费者链，或锚定到其数据依赖子图的局部重心，而不是简单跟随最晚/最大消费者。

### 3.4 禁止数据倒退连接

主图同构暴露：部分数据生产者被放到消费者右侧，输出参数再倒退连接给左边节点，视觉上出现反向数据流。

待修方向：布局后尽量满足 `data.x < consumer.x`。如果一个数据节点是某个消费者的输入，不应因为另一个后续消费者把它推到当前消费者右侧。

### 3.5 数据链局部压缩

主图同构暴露：连续数据链被拉得过散，跨越多个执行泳道或大面积空白。

待修方向：对同一消费者的数据祖先按深度排列时，应限制额外横向间距；连续链路如 `input -> add -> modulo -> addition -> zoom` 应按链路顺序局部排列，不应跨越数千像素。

---

## 四、下一轮建议实施顺序

### Step 1：继续修数据区插入执行泳道问题

第一个小点（复合边界输出虚拟消费者）已通过。下一步建议处理 3.2：数据区插入执行泳道之间。

优先继续使用复合回归测试：

```text
tests/layout-r6-d-composite-summary.ts
```

建议下一步导出：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-composite-summary-step4-data-lane.gia
```

同时保留主图同构测试作对照：

```text
tests/layout-r6-d-main-equivalent.ts
```

改动应继续集中在 `src/compiler/ir_to_gia_transform/layout.ts`，不要回退复合 impl 复用主图布局核心的方向。

### Step 2：比对人工修复参考

每次小步后与以下文件比较：

```text
复合节点-布局错误-step2-主图同构-修复.png
复合节点-布局错误-step2-主图同构-修复.gia
```

重点看：

- 是否还有数据倒退线。
- 前半段数据链是否贴近 `setLocalVariable` / 中间数据消费者。
- `initiateAttack` 参数区是否仍吸走过多上游中间链。
- 整体是否比错误版更紧凑。

### Step 3：回归复合 impl

后续每个小点通过后，都应回归复合 impl：

```text
布局r6-d-composite-summary-stepN.gia
```

检查：

- 复合 impl 内是否同步改善。
- 输入/输出 pin 边界留白是否需要后续 Phase 3。
- 主图同构测试是否出现同类改善或回退。

---

## 五、已知命令与注意事项

生成主图同构 GIA（只改测试时直接执行，不 build）：

```bash
node bin/gsts.mjs tests/layout-r6-d-main-equivalent.ts || true
```

复制：

```bash
export_dir='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
rm -f "$export_dir/布局r6-d-main-equivalent-step2.gia"
cp dist/tests/layout-r6-d-main-equivalent.gia "$export_dir/布局r6-d-main-equivalent-step2.gia"
```

生成复合回归 GIA（只改测试时直接执行，不 build；改布局实现后需先 build）：

```bash
node bin/gsts.mjs tests/layout-r6-d-composite-summary.ts || true
```

已通过导出文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-composite-summary-step3-output-anchor.gia
```

解码主图 GIA 时不要用 `accessories.find(a => a.graph && a.name === '')`，主图在 root graph 下。可用通用递归找最大 nodes graph 的脚本。

---

## 六、给下一位助手的一句话

> Phase 1 已提交并由用户确认生效：复合 impl 现在复用主图布局核心。Round 13 第一个小点也已通过：复合 OutParam 边界输出现在有虚拟消费者锚点。当前剩余共享布局核心问题：数据区插入执行泳道、多消费者锚点错误、数据倒退连线、数据链过松散。下一步建议先修数据区避开执行泳道，并用 `布局r6-d-composite-summary-step4-data-lane.gia` 给用户游戏内验证。
