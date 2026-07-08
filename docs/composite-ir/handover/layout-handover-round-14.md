# 布局任务交接文档 · 第十四轮

> 状态：已完成 / 当前实现分析 / 历史记录
> 来源：当前代码实现 + 用户游戏内测试反馈 + 截图观察 + Round 13 已验证导出 + Round 14 已验证导出
> 最近校验：2026-07-08
> 适用范围：gsts 当前输出的主图布局与复合节点 impl 布局统一工作；不代表编辑器唯一布局规则

> **本轮结果**：Round 14 已完成并通过用户游戏内验证。主图同构 `step4-compact-chain` 的局部数据链已压缩且整体布局合理；复合 impl `step6-compact-chain` 在追加目标位置碰撞检查后，修复了 compact-chain 引入的两处复合内部节点重叠。后续独立任务：控制流节点垂直方向可继续微调得更紧凑。
> **上一轮文档**：[layout-handover-round-13.md](layout-handover-round-13.md)
> **通用工作规则**：[layout-working-rules.md](layout-working-rules.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)
> **当前推荐 API 文档**：[../../architecture/composite/raw-control-flow-dsl-quickstart.md](../../architecture/composite/raw-control-flow-dsl-quickstart.md)、[../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)

---

## 一、Round 14 已完成结果

### 1.1 本轮代码与测试

相关实现集中在：

```text
src/compiler/ir_to_gia_transform/layout.ts
tests/layout/layout-r6-d-main-equivalent.ts
tests/layout/layout-r6-d-composite-summary.ts
```

本轮新增共享布局 pass：

```text
compactLocalDataChains(...)
hasDirectDataRelation(...)
wouldOverlapUnrelatedNode(...)
```

调用顺序为：

```text
expandExecGapsForDataChains(...)
compactLocalDataChains(...)
resolveDataBackflowAndOverlap(...)
```

设计意图：在 Round 13 防倒退与局部避让之后，进一步压缩同一局部数据计算链；压缩前检查目标位置是否会靠近无直接数据关系的节点，避免复合 impl 中输出叶子节点压到其它数据节点上。

测试图内 name 已同步：

```text
R6-D主图同构-step4-compact-chain
R6-D复合摘要-step6-compact-chain
```

### 1.2 已通过游戏内验证的 Round 14 导出

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-main-equivalent-step4-compact-chain.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-composite-summary-step6-compact-chain.gia
```

用户反馈：

1. 主图：数据流紧凑了，整体布局合理，没有明显问题。
2. 复合节点内部：初版 compact-chain 出现两处重叠；追加目标位置碰撞检查后通过。
3. 后续唯一独立微调方向：控制流节点垂直方向可以更紧凑。

### 1.3 当前已解决或缓解的问题

1. 复合 impl 复用主图布局核心。
2. 复合 OutParam 边界输出有虚拟消费者锚点。
3. 根级执行泳道会按上一分支数据块高度预留空间，避免数据区插入泳道之间。
4. 多消费者数据节点不再被后续大执行消费者轻易抢走锚点。
5. 局部数据链中已约束明显倒退线和局部重叠。
6. 连续局部数据链已压缩，主图同构通过游戏内验证。
7. compact-chain 目标位置会避开无直接数据关系的近邻节点，复合 impl 重叠回归通过。

---

## 二、本轮实现细节

### 2.1 数据链局部压缩

Round 13 后重点链路已经单调向右，但横向跨度偏大：

```text
get_local_variable#3 -> _3d_vector_modulo_operation#8 -> addition#10 -> _3d_vector_zoom#12
```

Round 14 在共享布局核心中新增 `compactLocalDataChains(...)`，只压缩真实局部计算链：

- 有数据子节点的中间数据节点可以参与压缩。
- 输出到 `set_local_variable` 的数据链尾可以参与压缩。
- 普通执行节点参数栈不强制横向摊开。
- 压缩只尝试向左收紧；不向右推远节点。
- 压缩后仍运行 `resolveDataBackflowAndOverlap(...)` 保持防倒退与直接数据关系避让。

主图验证后的关键链路大致为：

```text
#3 x≈615 -> #8 x≈991 -> #10 x≈1448 -> #12 x≈1865
```

相比 Round 13 的 `#12 x≈2414` 明显收紧，且仍保持 `producer.x < consumer.x`。

### 2.2 复合 impl 重叠回归修复

初版 compact-chain 在复合 impl 中把输出叶子节点压到无关数据节点附近，截图表现为两处节点重叠。原因是压缩 pass 只检查数据依赖方向，没有检查目标位置是否已有无直接数据关系的近邻节点。

修复方式：在共享布局核心中增加：

```text
hasDirectDataRelation(...)
wouldOverlapUnrelatedNode(...)
```

压缩目标位置若与无直接数据关系节点在局部阈值内相近，则跳过该节点的压缩。这样不需要在 `composite.ts` 维护第二套复合专用布局。

复合 impl 回归后的关键坐标：

```text
nIdx= 9  Data Type Conversion       (  350, 190)
nIdx=10  3D Vector Addition         (-1000, 960)
nIdx=11  3D Vector Modulo Operation ( -580, 960)
nIdx=12  Addition                   ( -160, 960)
nIdx=13  3D Vector Zoom             ( 1950, 230)
nIdx=14  3D Vector Addition         ( 1500, 460)
nIdx=15  3D Vector Cross Product    ( 2330, 460)
nIdx=16  Logical OR Operation       ( 1950, 690)
nIdx=17  Data Type Conversion       (  350, 920)
```

此前重叠的 `n9(350,190)` 与 `n13(260,230)` 已分离。

---

## 三、复合布局复用现状

当前不维护两套坐标布局算法：

```text
主图：
  IR nodes -> buildExecutionGraph(...) -> layoutPositions(...)

复合 impl：
  implNodes + implEdges + virtual output anchors
    -> buildExecutionGraph(...)
    -> layoutPositions(...)
```

`composite.ts` 中 `computeImplLayout(...)` 只做适配：

1. 过滤 `__composite_capture__` 物理节点。
2. 把 `implEdges` 转为布局器可读的 `next`。
3. 为 OutParam 生成 `virtualOutputNodes`。
4. 通过 `extraDataConnections` / `virtualConsumerIds` 把复合边界输出喂给共享布局核心。
5. 将 `layoutPositions(...)` 结果写回 impl GraphNode 的 `x/y`。

后续修复布局问题时，优先在 `layout.ts` 共享核心中扩展通用约束，避免回到复合 impl 专用坐标修补。

---

## 四、已执行验证

本轮执行过：

```bash
npm run build
node bin/gsts.mjs tests/layout/layout-r6-d-main-equivalent.ts || true
node bin/gsts.mjs tests/layout/layout-r6-d-composite-summary.ts || true
git diff --check
```

并将导出复制到用户游戏目录后完成游戏内确认。

---

## 五、后续任务

当前 Round 14 已完成。下一轮若继续布局优化，建议单独处理：

> 控制流节点垂直方向更紧凑。

注意事项：

- 不要回退本轮 `compactLocalDataChains(...)`。
- 不要回退复合 impl 复用主图布局核心。
- 不要全局缩小 `columnWidth` 或 `rowHeight` 来解决局部问题。
- 垂直压缩应优先作用于执行泳道 / 多出口局部区块，不能重新让数据区插入执行泳道之间。
- 修改后仍先导出主图同构，再回归复合 impl。

---

## 六、给下一位助手的一句话

> Round 14 已完成并通过游戏内验证：局部数据链压缩已进入共享布局核心，主图同构更紧凑；复合 impl 初版重叠已通过目标位置碰撞检查修复。当前只剩一个新的独立优化方向：控制流节点垂直方向可更紧凑，但必须继续复用 `layout.ts` 共享核心，不能维护第二套复合布局。
