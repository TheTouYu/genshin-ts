# 资源包 19：循环物化与节点预算包（loop-node-budget）

> 长任务拆 tick 的现成模板见 [task-sharding-scheduler.md](task-sharding-scheduler.md)。

> 状态：当前推荐
> 来源：从 rubik-3x3 项目抽象（2026-08-22）
> 最近校验：2026-08-22
> 适用范围：千星沙箱服务端节点图；大量循环写列表时的节点预算与帧数权衡

## 用途

当需要「循环写大量列表元素」时，如何在**节点预算**（<3000）和**帧数**（单记录 <3000）两个硬限制之间权衡。这是 3x3 魔方在「整体转 26 块」场景下反复踩坑后沉淀的经验。

## 两个硬限制（必须先记住）

| 限制 | 阈值 | 超限后果 |
|---|---|---|
| 节点预算 | 单图 <3000（复合递归展开） | 游戏启动失败拒载 |
| 单记录帧数 | 单记录 <3000 帧 | 记录截断（后半段丢失） |

## 核心权衡：build 期展开 vs 运行时循环

| 方式 | 写法 | 节点数 | 帧数 | 适用 |
|---|---|---|---|---|
| **build 期展开** | JS `for (let s = 0; s < 8; s++)` | 多（每个迭代都物化） | 少（无控制帧） | 迭代体小、迭代次数少 |
| **运行时循环** | `f.finiteLoop(0n, 7n, ...)` | 少（循环体只物化 1 次） | 多（每次迭代都有控制帧） | 迭代体大、迭代次数多 |

**决策口诀**（3x3 整体转实证）：
- 迭代体小（~6 节点/迭代）、次数少（8 次）→ **build 期展开**（帧收益 ~3.1f/节点，性价比高）；
- 迭代体大（~13 节点/迭代）、次数多（26 次）→ **运行时循环**（展开会把节点推到 512、游戏拒载 3657）。

**折中**（3x3 实际采用）：temp 段（体小）保持展开，写回段（体大）恢复有限循环——
节点 ≈216（预算余量 ~480），帧 ≈2513 <3000。

## 关键技巧

### 1. 循环不变量提升

循环内不变的表达式提到循环外，只建一次节点：

```ts
// 循环内 6 个 finiteLoop 都在用 moveId 派生值，提到循环外只建一次
const m10 = f.subtraction(moveId, 10n)
const m10x8 = f.multiplication(m10, 8n)     // 角
const m10x12 = f.multiplication(m10, 12n)   // 棱
const m10x6 = f.multiplication(m10, 6n)     // 心
const wholeOrientBase = f.multiplication(m10, 24n)
f.finiteLoop(0n, 7n, (s) => {
  const idx = f.addition(m10x8, s)  // 循环内只用加法，不再重复减法/乘法
  // ...
})
```

**原理**：节点图是静态的，`finiteLoop` 循环体只物化 1 次，但循环体内引用的外层表达式也各建 1 次节点。
把「循环内不变」的表达式提到循环外，循环体里只用轻量的加法。

### 2. 全 0 int_list 两阶段复位

引擎对「全 0 int_list」图变量只物化出很短长度，且 `set_list_value` 写 0 到越界下标**不扩容**。
所以复位列表时分两步：

```ts
// 阶段 1：写非 0 哨兵撑满长度（必须先于写 0）
for (let i = 0; i < 8; i++) {
  f.registerExecNode('set_list_value', [cornerOrient, new int(i), new int(i + 1)]) // 哨兵 i+1
}
// 阶段 2：写真实值（此时列表已满长）
f.finiteLoop(0n, 7n, (i) => {
  f.registerExecNode('set_list_value', [cornerOrient, i, new int(0)])
})
```

### 3. 两阶段读写（temp 暂存 → 写回）

置换类操作（转动块）不能原地改，要「先读入 temp 列表 → 再从 temp 写回」：

```ts
// phase 1：读入 tempP/tempT
f.finiteLoop(0n, 3n, (s) => {
  const from = f.getCorrespondingValueFromList(fromVar, idx)
  const piece = f.getCorrespondingValueFromList(pos, from)
  f.registerExecNode('set_list_value', [tempP, s, piece])
})
// phase 2：从 temp 写回
f.finiteLoop(0n, 3n, (s) => {
  const piece = f.getCorrespondingValueFromList(tempP, s)
  f.registerExecNode('set_list_value', [pos, to, piece])
})
```

**原因**：置换是「多对多」映射，原地改会互相覆盖（A 移到 B，B 移到 A 时 B 已被覆盖）。
先完整读入 temp，再完整写回，保证一次 move 的所有块都基于「转动前」的状态。

## 复用提示

- 这是**大量循环写列表通用经验**（B 类），任何「批量更新列表元素」的场景都要用。
- 先算清楚「节点预算」和「帧数」两个数，再决定展开还是循环——**不要凭直觉全展开或全循环**。
- 「循环不变量提升」「两阶段复位」「两阶段读写」三个技巧跨场景通用。