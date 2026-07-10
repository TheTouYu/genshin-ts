# 布局任务交接文档 · 物理运动复刻 Round 8

> 状态：历史记录 / 已完成 / 已游戏内验证
> 来源：当前代码实现 + 自动坐标对照 + 用户游戏内反馈
> 最近校验：2026-07-10
> 适用范围：`复杂gia/物理运动.gia` 的 `更新v、w` composite impl 控制流泳道间距及历史布局回归

> **本轮结果**：`更新v、w` 中控制流多分支在垂直方向过松的问题已修复。当前 composite impl 在共享布局完成后，仅对 exec/control 节点应用 `execLaneSpacingScale=0.6`；数据节点坐标、所有 X 坐标、节点拓扑和 pin 编码保持不变。物理运动整图及五个历史主要布局场景均已重新生成，用户确认游戏内测试通过；6 个 GIA 已移动到 `真-测试通过/布局/`。

通用路径、注入命令、小步验证和归档约定见 [layout-working-rules.md](layout-working-rules.md)。

---

## 一、目标与边界

Round 7 完成 nested capture pin 修复后，遗留问题是 `更新v、w` impl 的多条控制流分支垂直距离过松。本轮用户明确要求：

1. 只改布局，不修改物理算法、拓扑或 pin。
2. 布局改动后重新生成历史五个主要布局，由用户做游戏内回归。
3. 后续反馈进一步明确：只收紧控制流多个分支，不改变数据流垂直距离。

---

## 二、三次 Step 与用户反馈

### Step 1：impl data padding 上限 850

初版为 composite impl 单独设置 `dataLanePaddingMax=850`。`更新v、w` 的主要控制分支从 `Y=2463/4313` 变为 `Y=2441/4041`，收紧幅度不足。

用户反馈：系数改动太小，建议再减少 40% 的垂直距离。

### Step 2：整个 impl 的 Y 缩放到 60%

第二版把 composite impl 的全部 Y 坐标乘以 `0.6`。控制分支达到约 60%，但同时压缩了数据流节点间距。

用户反馈：问题只在控制流多个分支垂直距离；数据流和控制流共存时，不应改变数据流垂直距离。

### Step 3：只缩放 exec/control 节点

最终版撤销 `dataLanePaddingMax=850`，恢复原始 `1100`，只保留：

```text
execLaneSpacingScale = 0.6
```

`layoutPositions(...)` 在正常布局 pass 完成后调用 `scaleExecLaneSpacing(...)`：

- 只遍历 `buildExecutionGraph(...)` 识别出的 `execNodes`。
- 以当前 exec 节点最小 Y 为锚点，将各 exec 节点相对 Y 缩放到 60%。
- X 坐标不变。
- 非 exec 节点完全不参与缩放。
- 显式 `node.position` 仍在最后覆盖自动坐标。

用户确认 Step 3 游戏内测试通过。

---

## 三、精确坐标对照

`更新v、w` 原始自动布局与最终 Step 3：

```text
控制流节点：
  中间分支 Y: 2463 -> 1478
  下方分支 Y: 4313 -> 2588

数据节点 / nested data composite：
  n14 (700, 230)   -> 不变
  n15 (700, 460)   -> 不变
  n16 (700, 690)   -> 不变
  n17 (1120, 190)  -> 不变
  n18 (3245, 1031) -> 不变
  n19 (4845, 190)  -> 不变
  n20 (4045, 2653) -> 不变
```

所有控制和数据节点的 X 坐标均未改变。

结构仍保持：

```text
nodeCount=19
execEdges=14
compositeCalls=5
setNodes=9
getNodes=3
doubleBranches=2
compositePins=7
```

`更新速度`、`更新角速度` nested call 仍为 `pins=[]`，capture 输入路由未变化。

---

## 四、自动回归

新增针对性回归：

```text
tests/composite/test-exec-lane-spacing-scale.ts
```

该测试对同一图分别执行 scale `1` 和 `0.6`，验证：

- exec 节点 X 不变；
- exec 节点 Y 使用指定比例；
- data 节点坐标逐值不变。

已执行并通过：

```bash
npm run build
npx tsx tests/composite/test-exec-lane-spacing-scale.ts
npx tsx tests/composite/test-nested-composite-capture-pins.ts
npx tsx tests/composite/test-nested-composite-outflow.ts
npx tsx tests/composite/test-custom-variable-impl-pins.ts
npx tsx tests/composite/test-composite-all.ts
npx tsx tests/composite/test-phase2-normal-nodes.ts
git diff --check
```

结果摘要：

```text
Composite suite: 78 passed / 0 failed / 2 pending reference
Phase 2: 12 passed / 0 failed
Build: passed
```

---

## 五、游戏内回归与归档

最终物理运动文件已显式注入：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts \
  <export-root>/物理运动-physics-R8-step3-exec-lanes60pct.gia
```

用户确认最终 Step 3 通过。已用 `mv` 归档以下 6 个文件：

```text
物理运动-physics-R8-step3-exec-lanes60pct.gia
布局r6-c-reference-repro-physics-R8-step3-exec-lanes60pct.gia
布局r6-c-reference-repro-long-input-physics-R8-step3-exec-lanes60pct.gia
布局r6-d-main-equivalent-physics-R8-step3-exec-lanes60pct.gia
布局r6-d-composite-summary-physics-R8-step3-exec-lanes60pct.gia
布局r6-e-control-lane-coverage-physics-R8-step3-exec-lanes60pct.gia
```

归档目录：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/布局/
```

---

## 六、当前结论与下一步

当前已验证的布局结论：

- composite impl 可以在共享布局结果上单独收紧 exec/control 泳道。
- 控制流间距调整必须基于 `execNodes`，不能对整个 impl 的 Y 坐标做统一缩放。
- 数据节点即使没有 exec 边，也属于数据语义区块；本轮要求其坐标完全不变。
- 主图仍使用共享布局默认值；`execLaneSpacingScale=0.6` 当前只由 `computeImplLayout(...)` 传入。

布局问题已完成。下一轮如继续物理运动复刻，应由用户选择先实现 `计算分力`、`更新速度`、`更新角速度` 或 `计算滚动角速度` 的真实内部算法；5 个子复合当前仍是代理语义。

---

## 七、给下一位助手的一句话

> Physics Round 8 已完成并经游戏内验证：最终不是全图 Y 缩放，而是 composite impl 仅对 `execNodes` 应用 `execLaneSpacingScale=0.6`；`更新v、w` 控制分支约收紧 40%，所有数据节点坐标、X 坐标、拓扑和 pin 均不变。物理运动及五个历史布局回归 GIA 已归档。下一步不要继续调布局，先由用户选择要复刻的真实子复合算法。
