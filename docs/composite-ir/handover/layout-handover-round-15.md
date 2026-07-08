# 布局任务交接文档 · 第十五轮

> 状态：已完成 / 已游戏内验证
> 来源：当前代码实现 + 自动坐标核验 + 用户游戏内测试反馈 + 用户要求清理游戏导入目录
> 最近校验：2026-07-08
> 适用范围：gsts 当前输出的主图布局与复合节点 impl 布局统一工作；不代表编辑器唯一布局规则

> **本轮结果**：基于 Round 14 遗留问题，继续修复 R6-D 复合 impl 中数据流区块与控制流节点/控制线局部贴近的问题。当前代码新增共享布局 pass `avoidExecLanesNearDataBlocks(...)`，在数据链 compact 后对局部执行 lane 做 Y 向避让；同时新增 R6-E 控制流覆盖用例，用于防止只针对 R6-D 截图过拟合。五个 Round 15 GIA 已通过用户游戏内验证，并已用 `mv` 归档到 `真-测试通过/布局/`；导入根目录旧 `.gia` 已清理，目前根目录无待测 `.gia`。
> **上一轮文档**：[layout-handover-round-14.md](layout-handover-round-14.md)
> **通用工作规则**：[layout-working-rules.md](layout-working-rules.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)

---

## 一、本轮目标和问题边界

Round 14 交接中已经区分了两类问题：

1. 数据节点之间的 compact-chain 重叠：Round 14 已通过目标位置碰撞检查修复，并已归档通过文件。
2. 数据流区块与控制流节点/控制线局部贴近：R6-D 复合 impl 仍有视觉冲突，是本轮继续项。

用户补充要求：额外增加控制流覆盖是为了提高鲁棒性、防止过拟合，不是偏离主目标的新方向。

---

## 二、当前代码改动

相关文件：

```text
src/compiler/ir_to_gia_transform/layout.ts
tests/layout/layout-r6-e-control-lane-coverage.ts
tests/layout-r6-c-reference-repro.ts
tests/layout-r6-c-reference-repro-long-input.ts
tests/layout/layout-r6-d-main-equivalent.ts
tests/layout/layout-r6-d-composite-summary.ts
```

新增共享布局 pass：

```text
shiftExecChainYFrom(...)
avoidExecLanesNearDataBlocks(...)
```

当前调用顺序：

```text
expandExecGapsForDataChains(...)
compactLocalDataChains(...)
avoidExecLanesNearDataBlocks(...)
resolveDataBackflowAndOverlap(...)
```

设计意图：

- 不继续全局增大 `rootLanePadding`，避免 R6-C root 分支重新掉到底部。
- 在数据链完成局部 compact 后，检查执行节点与附近数据节点的局部 X/Y 距离。
- 若某条执行 lane 位于数据节点下方但垂直距离不足，则只下推该执行节点及其 exec 后续链。
- 该逻辑在共享 `layout.ts` 中实现，主图和复合 impl 共用，不维护复合 impl 专用坐标修补。

新增 R6-E 覆盖用例：

```text
tests/layout/layout-r6-e-control-lane-coverage.ts
```

该用例包含复合 impl 内四条控制流泳道，以及 float/bool/string 数据链分别靠近控制流区域，用于防止只针对 R6-D 当前截图坐标过拟合。

---

## 三、自动验证与坐标观察

已执行：

```bash
npm run build
git diff --check
node bin/gsts.mjs tests/layout-r6-c-reference-repro.ts || true
node bin/gsts.mjs tests/layout-r6-c-reference-repro-long-input.ts || true
node bin/gsts.mjs tests/layout/layout-r6-d-main-equivalent.ts || true
node bin/gsts.mjs tests/layout/layout-r6-d-composite-summary.ts || true
node bin/gsts.mjs tests/layout/layout-r6-e-control-lane-coverage.ts || true
npx tsx tests/composite/dump-nodes.ts <对应 dist/*.gia>
```

自动坐标观察：

```text
R6-C 普通：最后 root 分支仍约 y≈2132，未回到 Round 14 前 y≈3735 的掉底部回归。
R6-C long-input：最后 root 分支仍约 y≈2588，未回到 Round 14 前 y≈6473 的掉底部回归。
R6-D 复合 impl：问题区域中第二条执行链后续 Print String 从 y=730 下推到 y=1050，数据链仍保持紧凑。
R6-E 复合 impl：四条控制流 lane 已生成，用作额外鲁棒性观察。
```

注意：以上只是自动坐标核验，尚未游戏内验证。游戏截图/用户反馈仍是最终裁判。

---

## 四、Round 15 已游戏内验证并归档 GIA

用户反馈：五个 Round 15 GIA 测试通过。

已用 `mv` 从游戏导入根目录归档到：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/布局/布局r6-c-reference-repro-round15-lane-avoidance.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/布局/布局r6-c-reference-repro-long-input-round15-lane-avoidance.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/布局/布局r6-d-main-equivalent-round15-lane-avoidance.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/布局/布局r6-d-composite-summary-round15-lane-avoidance.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/布局/布局r6-e-control-lane-coverage-round15-lane-avoidance.gia
```

归档后，游戏导入根目录当前无 `.gia` 文件，方便下一轮继续测试。

---

## 五、本轮导入目录清理记录

用户反馈游戏目录积累过多 `.gia`，影响测试选择。已执行根目录清理，只删除 `Beyond_Local_Export` 根目录旧 `.gia`，未删除子目录归档/截图/参考文件。

清理命令等价于：

```bash
export_dir='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
find "$export_dir" -maxdepth 1 -type f -name '*.gia' ! -name '*round15-lane-avoidance.gia' -print -delete
```

已删除根目录旧文件：

```text
raw-control-flow-debug56-step1.gia
布局r6-c-reference-repro-long-input-round14-regression-yfix3.gia
布局r6-c-reference-repro-round14-regression-yfix3.gia
布局r6-d-composite-summary-round14-yfix3-regression.gia
布局r6-d-main-equivalent-round14-yfix3-regression.gia
```

第一次清理后根目录只保留当前待测 Round 15 文件：

```text
布局r6-c-reference-repro-long-input-round15-lane-avoidance.gia
布局r6-c-reference-repro-round15-lane-avoidance.gia
布局r6-d-composite-summary-round15-lane-avoidance.gia
布局r6-d-main-equivalent-round15-lane-avoidance.gia
布局r6-e-control-lane-coverage-round15-lane-avoidance.gia
```

用户确认测试通过后，以上五个文件已全部移动到归档目录；当前游戏导入根目录 `.gia` 数量为 0。

该规则已补充到：[layout-working-rules.md](layout-working-rules.md)。

---

## 六、本轮后续文档补充

用户要求对照原始设计文档梳理布局大局观后，已更新当前权威设计文档：

```text
docs/composite-ir/layout-patterns.md
```

新增小节：

```text
## 9. 当前实现对照与缺口路线图
```

该小节明确：当前布局已经从固定网格进化到“执行泳道 + 数据链局部布局 + 复合 impl 复用主图布局 + 局部避让”，但还没有真正实现“先识别语义区块，再整体规划窗口”的完整布局系统。

文档中记录的后续优先级：

```text
P0：实际布局后的 data block bounding box；多出口节点专门回归；纯数据复合多输出测试。
P1：LayoutBlock / LaneBlock 内部结构；基于 block bbox 的 lane placement；语义化 layout audit。
P2：纯数据复合 data-DAG 专用布局器；视口/缩放可读性指标；自动或半自动长数据链复合化建议。
```

---

## 七、下一步

1. 本轮代码与文档已提交：`e01a881 fix: avoid exec lanes near data blocks`。
2. 本轮大局观文档补充需要单独提交。
3. 后续若继续布局优化，保持当前规则：导出前清理根目录旧 `.gia`，只保留当轮待测文件；通过后用 `mv` 归档。
4. 若未来出现类似数据区块/控制流贴近问题，优先在共享 `layout.ts` 中做局部区块避让，不要回到复合 impl 专用坐标补丁，也不要简单全局加大 root padding。
5. 下一阶段若要从根上推进布局设计，优先从 `layout-patterns.md` 第 9.3 节 P0 项开始，而不是继续零散调常量。

---

## 八、给下一位助手的一句话

> Round 15 已通过用户游戏内验证并归档。当前实现新增共享 `avoidExecLanesNearDataBlocks(...)`，R6-D 复合 impl 自动坐标显示第二条执行链后续节点由 y=730 下推到 y=1050；R6-C 自动回归未回到底部。五个 round15 GIA 已移动到 `真-测试通过/布局/`，导入根目录当前无 `.gia`。本轮后续已把布局大局观补到 `layout-patterns.md` 第 9 节；下一阶段优先从 data block bbox、多出口回归、纯数据复合多输出测试开始。
