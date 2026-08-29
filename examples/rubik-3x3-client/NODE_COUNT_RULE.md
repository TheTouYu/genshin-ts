# 节点图数量规则（实测校准记录）

> 状态：已收尾，采用“简单估计公式”（非精确闭合）
> 方法：每次在真实地图中新增 1 个复合节点调用，记录实际数量增量 = 该复合节点的调用权重

## 已实测复合节点调用权重

| 复合节点 | 内部节点数 | 我们旧算法权重 | 实测权重 | 状态 |
|---|---|---|---|---|
| `logic_apply_whole` | 88 | 90 | 90 | ✅ |
| `motion_spin_block` | 3 | 57 | 57 | ✅ |
| `motion_orbit_velocity` | 3 | 30 | 30 | ✅ |
| `view_turn_lookup` | 7 | 9 | 21 | ❌ 差 +12 |
| `motion_orbit_store` | 4 | 6 | 12 | ❌ 差 +6 |
| `view_turn_block` | 8 | 113 | 146 | ❌ 差 +33 |
| `motion_orbit_segment` | 4 | 6 | 12 | ❌ 差 +6 | |

## 验证记录

- 基线 3712 + `view_turn_block` = 3858 → 权重 146
- 3858 + `motion_spin_block` = 3915 → 权重 57
- 3915 + `motion_orbit_velocity` = 3945 → 权重 30
- 3945 + `view_turn_lookup` = 3966 → 权重 21
- 3966 + `motion_orbit_store` = 3978 → 权重 12
- 3978 + `motion_orbit_segment` = 3990 → 权重 12

## 结论

- 简单复合（`logic_apply_whole`、`motion_spin_block`、`motion_orbit_velocity`）旧算法正确。
- 含较多数据流/查询节点的复合（`view_turn_lookup`、`motion_orbit_store`）旧算法偏低。
- 说明“普通节点权重=1”的假设可能不完整：某些数据流/查询节点或连接会额外计权。
- 待测：`motion_orbit_segment`，之后重新推导统一公式。

## 用实测边际权重重算当前 4135 地图

- 普通节点：271 - 32 = 239
- 实测边际权重 × 数量合计：3329
- 小计：239 + 3329 = 3568
- 实际：4135
- 缺口：567

结论：实测增量是“边际调用权重”，每个不同复合定义还额外有一个一次性“定义成本”。缺口 567 = 当前 9 种不同复合定义的一次性成本之和。

## 当前缺口定位

用实测复合边际权重重算当前 4135 地图：
- 复合贡献 = 3329
- 普通节点按 1 计 = 239
- 小计 = 3568
- 实际 = 4135
- 缺口 = 567

主图普通节点类型分布：
| 类型 | 数量 |
|---|---|
| Double Branch | 19 |
| Multiple Branches | 1 |
| Equal | 9 |
| Get Custom Variable | 90 |
| Start Timer | 2 |
| When Timer Is Triggered | 1 |
| Assembly List | 1 |
| Addition | 8 |
| Logical AND Operation | 9 |
| Set Node Graph Variable | 89 |
| Get Node Graph Variable | 10 |

结论：缺口 567 应来自主图普通节点（尤其是数据流节点）的权重 >1。下一步需逐个实测普通节点类型权重。

## 新发现：普通节点连接影响计数

- 新增 1 个未连接 `Get Node Graph Variable`：数量不变（4135）
- 把它连接到 `motion_orbit_store` 的输入 `i`：数量 4139（+4）

结论：
- 未连接的普通节点可能不计入数量
- 数据流连接/被连接后会带来额外权重
- 主图普通节点中：connected=119，unconnected=121（当前 4139 状态）

## 当前 4143 状态

- 主图 direct=273，compositeInstances=32，普通节点=241
- 复合贡献（实测边际权重）= 3329
- 普通节点若全按 1：241，小计 3570，实际 4143，缺口 573

主图普通节点连接情况（按 source 修正）：
| 类型 | connected | unconnected |
|---|---|---|
| Double Branch | 18 | 1 |
| Multiple Branches | 0 | 1 |
| Equal | 9 | 0 |
| Get Custom Variable | 88 | 2 |
| Start Timer | 0 | 2 |
| When Timer | 0 | 1 |
| Assembly List | 1 | 0 |
| Addition | 8 | 0 |
| Logical AND | 9 | 0 |
| Set Node Graph Variable | 88 | 1 |
| Get Node Graph Variable | 12 | 0 |

实验：未连接 Get Node Graph Variable 不计；连接后 +4。

## 候选完整公式（当前 4147 验证）

```text
总数 = 复合边际权重合计
     + 普通节点数 × 1
     + 数据流连接数 × 3
     + 控制流连接数 × 1
```

当前 4147 状态：
- 复合合计 = 3329
- 普通节点 = 242
- 控制流边 = 144
- 数据流边（我们解析到）= 136
- 按 136 算：3329+242+408+144 = 4123，差 24
- 若数据流边实际为 144：3329+242+432+144 = 4147 ✅

结论：公式基本成立，但我们解析数据流边少了 8 条，需要修正解析器。

## 用户规则补充（2026-08-21）

- 数据流节点：只有在被消费（有输出连接）时才 +3，否则 +0
- 控制流节点：+1
- 当前 4151 状态统计：
  - control nodes = 23
  - data consumed = 126
  - data unconsumed = 94
  - total ordinary = 243
  - flow edges = 144
  - dataflow edges = 137
  - composite marginal sum = 3329
- 按“control×1 + data consumed×3 + composite”计算：
  - 3329 + 23 + 126×3 = 3730，实际 4151，仍差 421
- 说明还需要把 data unconsumed / dataflow edges / flow edges 的贡献也纳入，公式尚未闭合。

## 收尾：简单估计公式（2026-08-21 用户确认）

不再追求精确闭合，改用简单估计：

```text
游戏节点图数量 ≈ 2 × mainExpanded + mbCases + dataFlowEdges / 2
```

含义：
- 每个展开节点固定按 2 个开销估计（“数据流节点固定需要两个开销”的简化）；
- 每次数据流被消费（一条数据边）额外加 0.5（“被消费开销额外增加一点”的简化）；
- `mainExpanded` = 根图递归展开节点数，`mbCases` = Multiple Branches case 数，`dataFlowEdges` = 根图数据流边数。

最新 4153 状态实测：
- mainExpanded=2038，mbCases=9，dataFlowEdges=142
- 预测 = 2×2038 + 9 + 142/2 = 4156，实际 4153，误差 +3（0.07%）

回归点（当前真实地图）：
| 快照 | mainExpanded | mbCases | dataFlowEdges | 实际 | 预测 | 误差 |
|---|---|---|---|---|---|---|
| current-4147 | 2034 | 9 | 136 | 4147 | 4145 | -2 |
| current-4151 | 2035 | 9 | 137 | 4151 | 4147.5 | -3.5 |
| current-4153 | 2038 | 9 | 142 | 4153 | 4156 | +3 |

该公式已写入 `src/cli/static_assembly/graph_edit.ts` 的 `predictGameNodeCount`。

## ⚠️ 修正（2026-08-22）：简单公式对有限循环结构误报，改用 Round 17 定稿公式

简单公式（`2×mainExpanded + mbCases + dataFlowEdges/2`）只在**全展开结构**上巧合地接近真实值
（当时 logic_apply_whole=88 节点、mainExpanded≈2038，误差 ±3），对**有限循环结构**严重失真：

- 混合有限循环版（2808 日志实证**游戏加载成功**）：mainExpanded≈1649 → 简单公式 ≈3437 ❌ 误报拒载；
  定稿公式 ≈2029 ✅ 正确。
- 全展开版（用户实测**游戏拒载**）：mainExpanded=2464、implTotal=2802 → 简单公式 5068 ❌（量级也不对）；
  定稿公式 ≈3657 ✅ 正确。

根因：Finite Loop 在 impl 中只物化 1 个节点（运行时循环 N 迭代），简单公式按展开节点×2 高估；
而展开版每迭代都物化节点，简单公式的系数又与真实开销不匹配。

### 定稿公式（PROGRESS.md Round 17，10/10 回归）

```text
游戏节点图数量 = (28/11) × mainExpanded - (761/1056) × implTotal - 39343/66
```

- 签名 `(mainExpanded, implTotal)`；`implTotal` = 主图可达全部 impl 的展开节点之和（不含根图）。
- 校准点：H-3283（1610/304）、I-3588（1757/400）、J-3812（1845/400）、K-4036（1933/400）；
  系数来自干净实验（未连线 logic_apply_whole：ΔmainExpanded=88 → Δ实际=225 → 28/11）。
- 已写入 `src/cli/static_assembly/graph_edit.ts` 的 `predictGameNodeCount`（2026-08-22）。
- 判定线：round(count) ≤ 3000 可进游戏，否则拒载（`assets:node-graphs nodes` 首行 ✅/❌）。
- 展开恒等式（对 rubik-3x3 当前结构）：`mainExpanded = 1382 + 2×LR + LAW`、
  `implTotal = 2005 + LAW + LR`（LR=logic_reset 直接节点、LAW=logic_apply_whole 直接节点），
  代入定稿公式得 `count = 1476.6 + 4.37×LR + 1.82×LAW` —— 每少 1 个展开节点，LR 减 4.37 / LAW 减 1.82。
- **教训：预算公式本身可能是回归源——工具判据与游戏行为脱节时，回到历史拟合公式（PROGRESS）交叉验证，
  并用“能加载版本”做反证（简单公式会把能加载的版本判成拒载 → 公式必错）。**
