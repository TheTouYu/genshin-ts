# 布局任务交接文档 · 第十四轮

> 状态：部分完成 / 当前实现分析 / 历史记录
> 来源：当前代码实现 + 用户游戏内测试反馈 + 截图观察 + Round 13 已验证导出 + Round 14 已验证导出 + yfix 回归测试反馈
> 最近校验：2026-07-08
> 适用范围：gsts 当前输出的主图布局与复合节点 impl 布局统一工作；不代表编辑器唯一布局规则

> **本轮结果**：Round 14 的数据链局部压缩已完成并通过游戏内验证；复合 impl 初版 compact-chain 重叠已通过目标位置碰撞检查修复。随后进行 R6-C/R6-D 控制流垂直方向回归：R6-C 最后 root 分支掉到底部的问题已通过 yfix/yfix3 明显缓解且未发现回归；R6-D 复合 impl 的数据节点与控制流节点/控制线局部冲突 yfix3 有效但尚未完全修复。按用户要求：本轮提交当前代码与文档，但不归档 yfix3 GIA；完整修复留到下一轮，并为该场景增加更多控制流节点鲁棒性测试。
> **上一轮文档**：[layout-handover-round-13.md](layout-handover-round-13.md)
> **通用工作规则**：[layout-working-rules.md](layout-working-rules.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)
> **当前推荐 API 文档**：[../../architecture/composite/raw-control-flow-dsl-quickstart.md](../../architecture/composite/raw-control-flow-dsl-quickstart.md)、[../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)

---

## 一、Round 14 已完成结果

### 1.1 数据链局部压缩已完成

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

已归档并通过游戏内验证的 Round 14 数据链 compact 导出：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/布局/布局r6-d-main-equivalent-step4-compact-chain.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/布局/布局r6-d-composite-summary-step6-compact-chain.gia
```

用户反馈：

1. 主图：数据流紧凑了，整体布局合理，没有明显问题。
2. 复合节点内部：初版 compact-chain 出现两处重叠；追加目标位置碰撞检查后通过。

### 1.2 控制流垂直 yfix 当前状态

本轮发现 R6-C 回归文件中 root 直接分支的 Y 偏移过大：

```text
R6-C 普通：最后 root 分支 y≈3735
R6-C long-input：最后 root 分支 y≈6473
```

已提交 checkpoint：

```text
4491ace fix: tighten root exec lane spacing
```

该提交把 root 直接分支从“上一分支完整 subtree bottom + full extraDataHeight”改为更受控的局部 padding，避免最后 root 分支掉到底部。

随后 yfix2/yfix3 继续微调 `rootLanePadding`：

```text
yfix2: prevChildHasExecChildren ? 300 : dataLanePadding + 120
yfix3: prevChildHasExecChildren ? 380 : dataLanePadding + 120
```

当前待提交代码使用 yfix3。自动坐标核验：

```text
R6-C 普通：最后 root 分支 y≈2133，未回到 y≈3735
R6-C long-input：最后 root 分支 y≈2583，未回到 y≈6473
R6-D 复合 impl：执行泳道约 0 / 730 / 1460
```

用户游戏内反馈：

- 四个 yfix3 GIA 没有导致回归问题。
- R6-D 复合 impl 局部问题有改善，但仍未完全修复。
- 完整修复放到下一轮。
- 下一轮应针对该场景额外增加一些控制流节点鲁棒性测试。
- 本轮允许提交代码和文档，但不允许归档 yfix3 GIA。

本轮生成但**不要归档**的 yfix3 测试文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-c-reference-repro-round14-regression-yfix3.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-c-reference-repro-long-input-round14-regression-yfix3.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-main-equivalent-round14-yfix3-regression.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-composite-summary-round14-yfix3-regression.gia
```

---

## 二、当前剩余局部问题

### 2.1 截图证据

用户最新局部截图：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复合节点-布局错误-step4-局部.png
```

截图显示：R6-D 复合 impl 中 `三维向量加法`、`三维向量缩放`、`三维向量外积`、`逻辑或运算` 与下方 `Print String` 控制流区域之间仍然过近；yfix3 已让控制流节点不再明显压住数据节点，但白色控制流线和数据节点局部仍有视觉冲突，需要下一轮继续微调。

当前 yfix3 坐标：

```text
nIdx= 5  Print String            ( 800,  730)
nIdx= 6  Print String            (1600,  730)
nIdx= 7  Print String            ( 800, 1460)
nIdx= 8  Print String            (1600, 1460)
nIdx=14  3D Vector Addition      (1500,  460)
nIdx=15  3D Vector Cross Product (2330,  460)
nIdx=16  Logical OR Operation    (1950,  690)
nIdx=17  Data Type Conversion    ( 350,  920)
```

### 2.2 初步判断

yfix3 回到了旧基线附近的垂直安全距离，但截图说明编辑器真实卡片高度、控制线粗细/路由、局部视口缩放下仍需要更精细的控制流/数据流分区。

下一轮不要简单继续无限增大 `rootLanePadding`，否则可能牺牲 R6-C 的垂直紧凑性。更好的方向是：

1. 为复合 impl / 主图共享布局增加“数据区块占用”的显式估计，而不是只靠 root padding 常量。
2. 针对 root direct child 的目标 lane，估算同一 X 区间附近的数据节点卡片高度和控制线通道，必要时只局部下推。
3. 增加专门测试：同一个复合 impl 内，多条控制流泳道穿过/贴近不同高度的数据链，确保不会因一个常量只修一个截图。

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
git diff --check
npm run build
node bin/gsts.mjs tests/layout-r6-c-reference-repro.ts || true
node bin/gsts.mjs tests/layout-r6-c-reference-repro-long-input.ts || true
node bin/gsts.mjs tests/layout/layout-r6-d-main-equivalent.ts || true
node bin/gsts.mjs tests/layout/layout-r6-d-composite-summary.ts || true
npx tsx tests/composite/dump-nodes.ts <对应 dist/*.gia>
```

游戏内验证状态：

- R6-D compact-chain：已通过并归档。
- R6-C yfix3 / R6-D yfix3：无回归问题，局部改善有效，但 R6-D 复合 impl 局部仍需下一轮继续修；按用户要求不归档。

---

## 五、下一轮建议

下一轮目标：完整修复 `复合节点-布局错误-step4-局部.png` 所示的复合 impl 局部控制流/数据流贴近问题，并增加控制流节点鲁棒性测试。

建议步骤：

1. 保留当前 yfix3 作为起点，不要回退到 yfix2 或最初 yfix。
2. 新增或扩展测试，专门覆盖：
   - 复合 impl 中三条控制流泳道。
   - 中间泳道附近有横向数据链。
   - 下方泳道附近有 bool/string 数据转换节点。
   - 控制流线可能穿过数据节点卡片或贴边的情况。
3. 先实现数据区块占用估计或 root lane 目标位置局部避让，而不是继续只调一个 `rootLanePadding` 常量。
4. 生成新的四个回归 GIA，例如：

```text
布局r6-c-reference-repro-round15-lane-avoidance.gia
布局r6-c-reference-repro-long-input-round15-lane-avoidance.gia
布局r6-d-main-equivalent-round15-lane-avoidance.gia
布局r6-d-composite-summary-round15-lane-avoidance.gia
```

5. 用户游戏内确认全部通过后，再按工作规则用 `mv` 归档通过 `.gia`，并提交。

注意事项：

- 不要维护第二套复合布局。
- 不要全局缩小或放大 `columnWidth` / `rowHeight`。
- 不要为了 R6-D 复合局部问题让 R6-C root 分支重新掉到底部。
- 不要归档未完全通过的 yfix3 GIA。

---

## 六、给下一位助手的一句话

> Round 14 数据链 compact 已完成并归档；当前 yfix3 代码已缓解 R6-C 最后 root 分支掉到底部问题，且四个 yfix3 GIA 无回归，但 R6-D 复合 impl 仍有局部控制流线/数据节点贴近问题（截图 `复合节点-布局错误-step4-局部.png`）。下一轮应基于共享 `layout.ts` 做数据区块占用/局部 lane 避让，并增加控制流鲁棒性测试；不要归档 yfix3 GIA。