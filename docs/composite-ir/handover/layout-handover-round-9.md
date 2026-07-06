# 布局任务交接文档 · 第九轮

> 状态：历史记录 / 待验证
> 来源：当前代码实现 + 用户游戏内测试反馈 + 第八轮真实 GIA 样本
> 最近校验：2026-07-06
> 适用范围：gsts 当前输出的布局调参交接；不代表最终编辑器等价布局

> **本轮目标**：实现第八轮提出的“区块高度驱动”多执行泳道布局，并交给游戏内测试。
> **上一轮文档**：[layout-handover-round-8.md](layout-handover-round-8.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)
> **本轮结论**：已完成一个可编译的中间实现，但游戏内反馈指出下移系数偏高，且测试 GIA 没有完全复刻参考文件，不能覆盖全部测试；下一轮应先从参考文件反推系数和复刻用例，再调算法。

---

## 一、本轮完成内容

本轮修改了：

```text
src/compiler/ir_to_gia_transform/layout.ts
tests/layout-r6-c-multi-lane.ts
```

核心实现：

1. `layoutExecutionChain(...)` 从 `void` 改为返回当前 exec 子树占用的最大 Y 底部。
2. 同一父节点的后续 sibling 不再用固定 `idx * branchGap`，而是按上一条 sibling 子树底部 + spacing 下推。
3. 增加 `computeSubtreeDataExtraHeight(...)`，用直接数据输入数量和数据祖先数量估算数据链占用高度。
4. 初始 spacing 分三类：
   - root 主泳道：`480`
   - 普通 fork：`400`
   - 局部多出口列：`350`
5. 新增 `tests/layout-r6-c-multi-lane.ts`，生成一个三条执行路径的测试 GIA，其中第一条路径有数据链。

本轮导出给用户测试的文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/layout-r6-c-multi-lane.gia
```

---

## 二、自动验证结果

本轮已执行：

```bash
npm run build
npx prettier --check src/compiler/ir_to_gia_transform/layout.ts tests/layout-r6-c-multi-lane.ts
git diff --check
node bin/gsts.mjs tests/layout-r6-c-multi-lane.ts
npx tsx tests/composite/analyze-exec-lanes.ts dist/tests/layout-r6-c-multi-lane.gia
npx tsx tests/composite/trace-exec-flow.ts dist/tests/layout-r6-c-multi-lane.gia --io
```

注意：在当前 WSL / 非 Windows 环境中，`node bin/gsts.mjs tests/layout-r6-c-multi-lane.ts` 生成 `.gia` 后会因为注入阶段找不到 `LOCALAPPDATA` 报错；这不影响 `.gia` 产出。

导出的 R6-C 测试文件抽取结果示例：

```text
parent n1 @ (6, 3) children=3
  out0 -> n2  @ (806,    7) dy≈   4
  out0 -> n11 @ (806, 1435) dy≈1432 stepFromPrev≈1428
  out0 -> n13 @ (807, 2270) dy≈2267 stepFromPrev≈835
```

这证明当前算法确实按上方区块下推；但游戏内反馈表明下推幅度过大。

---

## 三、用户游戏内测试反馈

用户反馈：

1. 当前版本相关下移系数偏高，需要从提供的参考文件里面计算出合适系数。
2. 当前版本没有完全按照提供的布局参考文件复刻，导致无法在游戏内覆盖全部测试。

解释：

- 当前 `480 / 400 / 350` 只是从第八轮文字结论直接取的保守值，并叠加了 `subtreeMaxY` 和数据链估算，因此实际 sibling step 可能变成 `节点高度 + spacing + dataExtra`，比参考文件视觉间距大很多。
- `tests/layout-r6-c-multi-lane.ts` 是抽象验证样例，不是对 `布局c.gia` 或 `主图布局1.gia` 的结构复刻。它只能验证“会下推”，不能验证“下推到参考文件同量级”。
- 参考样本中的 `n11 dy≈967`、`n12 dy≈1058` 是在具体节点、数据 pin、连线占位下形成的结果；当前生成样例 `n11 dy≈1432` 明显偏大。

---

## 四、下一轮必须先做的校准工作

下一轮不要继续凭感觉调常量。建议先写或扩展分析工具，从参考 `.gia` 自动提取布局特征并反推系数。

参考文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/布局c.gia
```

已有工具：

```bash
npx tsx tests/composite/analyze-exec-lanes.ts <file.gia>
npx tsx tests/composite/dump-nodes.ts <file.gia>
npx tsx tests/composite/trace-exec-flow.ts <file.gia> --io
npx tsx tests/composite/trace-dataflow.ts <file.gia> --list-nodes
```

建议新增或增强工具，输出每条 exec sibling 的：

1. parent / child 坐标和 `dy` / `stepFromPrev`。
2. child 所在分支的 exec 子树节点数、最大/最小 Y、局部子树高度。
3. 分支内直接数据消费者数量。
4. 数据祖先数量、数据节点 minY/maxY、数据区块高度。
5. 多出口 child 数量和该局部列的 step 列表。
6. 反推公式：`observedNextLaneY - previousBlockBottom`。

目标是得到类似：

```text
参考文件: 布局c.gia
父节点 n1:
  n2 -> n3 基础 sibling step ≈ 365
  n2 子分支 n5/n11: n11 相对 n5 dy≈967，数据节点覆盖到 y≈396，推算 buffer≈250-300
  n3 子分支 n12: dy≈1058，推算它避开的是上方已占用执行线而不是固定 rowHeight 倍数
```

然后再把这些观测转换成 `layout.ts` 中的配置，而不是硬编码当前的过大叠加值。

---

## 五、下一轮实现建议

建议下一轮按以下顺序处理：

1. **复刻参考测试**：新增一个更接近 `布局c.gia` 的测试输入，不能只用抽象三分支。至少要包含：
   - event 分两条基础执行路径；
   - 上方路径内有一个多输入或多数据链消费者；
   - 同一上方路径还有一个需要下移的 sibling；
   - 下方路径继续产生下移 sibling，并验证后续节点保持同一 Y；
   - 如可行，加入 `主图布局1.gia` 的多出口复合调用列。
2. **先测现状与参考差距**：生成 gsts 输出后同时跑参考和生成文件的 lane 分析，输出 side-by-side 表格。
3. **重新设计高度估算**：当前实现用 `previousSubtreeBottom + spacing + dataExtra`，容易过高。下一轮应考虑：
   - `previousSubtreeBottom` 是否已经包含节点高度，spacing 不应再重复覆盖一个完整 `rowHeight`；
   - dataExtra 应按数据节点实际 min/max 或 pin 行数估算，而不是简单累加整棵子树祖先数量；
   - root 主泳道和局部 sibling 应分别校准，不要共用同一“子树底部 + 大缓冲”公式；
   - 多出口列内部优先匹配 `≈300-360px`，不要被 root 主泳道规则放大。
4. **保留本轮的正确方向**：从固定 `branchGap` 改为 block-aware 是正确方向；需要调的是系数来源和参考复刻测试，不建议直接退回旧 `idx * branchGap`。
5. **游戏内测试导出**：生成的测试文件应放到：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/<测试名>.gia
```

并在 handover 中记录导出文件名和 `analyze-exec-lanes` 输出。

---

## 六、当前实现风险

1. 当前下推系数偏高，不能作为最终布局参数。
2. 当前 R6-C 测试不是参考布局复刻，无法覆盖用户关心的全部游戏内判断。
3. 当前数据链高度估算只看 IR 数据依赖数量，没有直接读取最终数据节点实际占位区；这会导致复杂链过度叠加。
4. 当前没有自动比较“参考 GIA vs gsts 生成 GIA”的布局差距。
5. 游戏内截图仍是最终裁判；`audit-layout.ts` 的 ORPHAN / EDGE_CROSS 不应作为布局好坏结论。

---

## 七、给下一位助手的简短交接语

> 第九轮完成了 block-aware lane 布局的中间实现，并新增 `tests/layout-r6-c-multi-lane.ts`。自动分析显示它会把数据重的第一条分支下方 sibling 推到 `dy≈1430`，但用户游戏内反馈认为下移系数偏高，并且当前测试没有复刻参考文件，无法覆盖全部测试。下一轮不要继续凭感觉调 `480/400/350` 或 dataExtra；先从 `主图布局1.gia` 和 `布局c.gia` 自动抽取 sibling step、数据区块 min/max、previousBlockBottom→nextLaneY 的真实差值，再新增接近 `布局c.gia` 的复刻测试，最后按反推系数调整 `layout.ts`。
