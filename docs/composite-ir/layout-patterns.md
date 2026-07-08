# GIA 布局设计原则：视口、层级与语义区块

> 状态：当前推荐 / 设计准则
> 来源：真实编辑器布局文件 + 截图对照 + 当前代码实现观察
> 最近校验：2026-07-07
> 适用范围：gsts 自动布局设计、真实 GIA 布局分析、复合节点拆分策略

本文档替代早期以“固定步进参数”和“节点数量统计”为主的布局观察。旧结论只能作为历史背景；后续布局优化应以本文的**视口、层级窗口、语义区块、执行泳道、数据流贴近原则**为优先依据。

核心样本：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1-40%缩放.png
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/模拟复杂运算-50%缩放.png
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复杂流程简化为一个复合节点-70%缩放.png
```

该样本由用户在编辑器内精心编排，是当前布局设计的正样本。分析工具若报告 `ORPHAN` / `EDGE_CROSS`，不能直接视为布局问题；这些工具未准确建模编辑器的正交连线路由、数据流节点和缩放视口。

---

## 1. 编辑器布局的真实使用模型

### 1.1 布局不是静态截图，而是可平移、可缩放的画布

编辑器中存在可见区域（viewport）：

- 用户可以上下左右移动整个布局，只查看局部节点。
- 用户可以整体缩放布局。
- 因此节点不需要被压缩到固定屏幕范围内。
- 为了换取清晰的执行线和数据线，较大的水平/垂直间距是合理的。

这意味着自动布局的目标不是“最紧凑”，而是：

> 在常用缩放比例下，每个局部视口能清楚读出当前语义区块。

`布局c` long-input step4/step7 的游戏内验证进一步说明：当上方分支含有多节点数据流或复合数据流时，局部 sibling 的下移需要给数据区块留出更大的视觉缓冲。当前 gsts 对这类场景的经验值为 `dataLanePadding = min(1100, round(extraDataHeight * 0.35))`；这是已通过当前样例的实现参数，不应视为编辑器唯一布局规则。

### 1.2 每个复合节点是独立布局窗口

每个复合节点单独打开时，都是一个独立窗口，层级深度 +1。当前窗口只显示该复合的直接子节点，不会同时显示其它层级的信息。

```text
主图窗口：只看顶层事件、顶层节点、顶层复合调用
  └─ 打开复合 A：只看 A 的直接内部节点
       └─ 打开复合 B：只看 B 的直接内部节点
```

所以布局复杂度应按“每个窗口”衡量，而不是按整个 GIA 文件的总节点数衡量。一个文件可以包含很多 CompositeDef，只要每一层窗口直接可见的节点少且语义清楚，布局就是舒适的。

### 1.3 复合节点是降低布局负担的主要工具

复杂流程应优先折叠为语义明确的复合节点：

- 主图负责表达流程摘要。
- 复合 impl 图负责表达局部细节。
- 嵌套复合继续把更细的逻辑下沉到下一层窗口。

这比试图在主图内摊开所有节点更接近编辑器的实际使用方式。

---

## 2. 好布局的基本单位：语义区块

旧布局文档把重点放在固定 `columnWidth` / `rowHeight` 上，这不够。真实编辑器布局更像是由多个语义区块组成：

1. 事件入口区块
2. 普通执行线区块
3. 带数据流的执行线区块
4. 复杂流程折叠区块
5. 多出口 / 顺序执行区块
6. 纯数据计算区块

自动布局应该先识别区块，再在区块内排节点。固定步进只是区块内的局部实现细节。

### 2.1 主图样本的区块结构

`主图布局1.gia` 的主图可以概括为：

```text
n1 When Entity Is Created
├─ n2 Print String ── n4 Print String
├─ n8 Print String ── n13 Print String
└─ n24 复杂流程简化为一个复合节点 ── n25 复杂流程简化为一个复合节点
      ├─ n26 Print String ── n38 顺序执行（比分叉更好理解）
      │                      ├─ n37 Print String
      │                      ├─ n34 Print String
      │                      ├─ n35 Print String
      │                      └─ n36 Print String
      ├─ n30 Print String
      ├─ n29 Print String
      └─ n28 Print String
```

同时存在数据流：

```text
n1 event value ── n3 Data Type Conversion
                ├─ feeds n2 Print String
                ├─ feeds n8 Print String
                └─ feeds n24 composite input

n5 Get Node Graph Variable ── n7 Addition(+999) ── n6 Data Type Conversion ── n4 Print String

n16 模拟复杂运算 ── n11 Data Type Conversion ── n13 Print String
```

这些不是一个简单树布局能自然表达的结构。舒适布局来自：

- 事件入口在左。
- 三条执行线按 Y 分成不同泳道。
- 数据流贴近它服务的执行线，但不抢执行主线。
- 复杂流程被复合节点压缩成语义节点。
- 多出口语义通过“顺序执行”复合节点显式表达。

---

## 3. 执行流布局：横向主线 + 垂直泳道

### 3.1 常规执行链横向阅读

普通执行链应从左到右排列：

```text
事件 -> 节点 A -> 节点 B -> 节点 C
```

但“横向”不等于固定间距。节点之间可以根据中间是否存在数据计算、注释空间、分支空间而拉开。

在 `主图布局1.gia` 顶部：

```text
n1(-355,-206) -> n2(434,-209) -> n4(2072,-227)
```

`n2 -> n4` 的水平距离很大，因为中间下方放置了服务于 `n4` 的数据链：

```text
n5 GetVar -> n7 Addition -> n6 Data Type Conversion -> n4 Print String
```

这是一个重要规律：

> 当下游执行节点依赖一段数据计算链时，执行节点之间应自动拉开，为数据链保留横向通道。

### 3.2 同一事件分叉应形成执行泳道

从同一事件分出的多条执行线，不宜贴得过近，也不宜排成过度紧凑的扇形。样本中事件 `n1` 分成三条主线：

```text
上方泳道：y ≈ -209
中部泳道：y ≈ 281
下方泳道：y ≈ 879
```

这些泳道之间的间距明显大于普通节点高度，给每条线的数据节点和后续扩展留出空间。

从 `主图布局1.gia` 用以下命令抽取多执行父节点坐标：

```bash
npx tsx tests/composite/analyze-exec-lanes.ts \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1.gia
```

关键观察：

```text
n1 event at (-355, -206)
├─ n2  at (434, -209), dy ≈   0
├─ n8  at (421,  281), dy ≈ 490
└─ n24 at (418,  879), dy ≈ 1085
```

也就是说，三条主执行泳道不是简单按 300px 等距压缩；第二条与第一条约 490px，第三条再向下约 600px。第三条包含复合摘要和后续多出口区块，因此需要比普通短分支更大的垂直窗口。

`布局c.gia` 进一步验证了“泳道高度由上方区块占位决定”，对应截图为 `布局c-多条连线-50%缩放.png`。该样本把布局理由写在 Print String 参数里：

```text
n2:  基础场景
n3:  基础场景
n11: 上面一个节点图有比较多的参数，所以距离下移
n12: 上面一条线的节点图已经占位了，所以距离继续下移
n13: 这条线已经下移了，虽然上面有空间，也保持这条线，继续平移
```

关键坐标：

```text
n1 event at (-414, -281)
├─ n2  at ( 48, -286), dy ≈   0
│  ├─ n5  at (1138, -288), dy ≈   0  # 多输入节点，右侧数据 pin 很多
│  └─ n11 at ( 545,  681), dy ≈ 967  # 避开 n5 的多行参数/数据连线区
└─ n3  at ( 51,   84), dy ≈ 365
   └─ n12 at (554, 1142), dy ≈ 1058 # 避开上方已占位执行线
      └─ n13 at (1176,1142), dy ≈ 0 # 下移后继续保持同一执行线水平平移
```

其中 n5 的多个数据输入节点分布在 y≈-170、12、203、396；n11 放到 y≈681 后，蓝色数据线和白色执行线在截图中不会重叠成团。这个样本说明布局算法不能只按“第几个 child”给固定 Y 偏移，还要估计上方分支已经占用的局部区块高度。

2026-07-07 的 `layout-r6-c-reference-repro` 分步游戏内验证进一步补充了 gsts 当前实现侧的约束：

- **事件入口是执行 root 锚点**：event 节点即使作为数据源连接到右侧数据节点，也不能被数据链布局移动到消费者附近。数据节点可以贴近消费者，event 必须保留在左侧入口。
- **root 直接分支和 nested sibling 分开处理**：event 的直接 child 形成基础泳道，不应被上一条 root 分支的完整 nested subtree 推到最下方；但 nested sibling 需要根据上方数据重的局部区块继续下推。
- **后续链继承已下移 lane**：当第二条 root lane 的后续节点需要避开上方已占位区时，应下移到新的 lane，并让后续节点保持同一 Y 水平平移。
- **长输入链需要更大数据 padding**：`layout-r6-c-reference-repro-long-input` 中把一个攻击参数改为 `GetVar -> 3D Vector Addition -> Initiate Attack` 后，原本的四输入高度估算不足；当前 gsts 通过提高 nested data padding 解决了重叠。

对应当前实现和测试：

```text
src/compiler/ir_to_gia_transform/layout.ts
tests/layout-r6-c-reference-repro.ts
tests/layout-r6-c-reference-repro-long-input.ts
docs/composite-ir/handover/layout-handover-round-10.md
```

设计准则：

- 每条主执行线拥有自己的 Y 区间。
- 泳道间距应能容纳该线附近的数据节点。
- 继续向右的主分支通常保持在上方或原 Y 附近。
- 辅助/并列分支向下展开。
- 多条同源主泳道的基础间距建议不低于约 480-500px。
- 如果某条泳道包含多出口区、复合摘要或多行数据流，应按区块高度额外下推；当前正样本中复杂第三泳道比上一条额外约 600px。

### 3.3 多出口节点：同列纵向展开

对于一个多出口节点，出口目标倾向于在右侧同一列按 Y 展开。例如：

```text
n25 at (987,880)
├─ n26 at (1603,882)
├─ n30 at (1603,1224)
├─ n29 at (1609,1510)
└─ n28 at (1610,1849)
```

再往右，`顺序执行` 复合节点也呈现类似结构：

```text
n38 at (2122,886)
├─ n37 at (2592,881)
├─ n34 at (2590,1240)
├─ n35 at (2595,1526)
└─ n36 at (2596,1865)
```

两组多出口的目标 Y 间隔接近：

```text
n25 -> n26/n30/n29/n28: step ≈ 341, 287, 339
n38 -> n37/n34/n35/n36: step ≈ 359, 287, 339
```

这说明多出口目标可以比主事件泳道更紧凑：它们属于同一个局部出口列，读者预期会在一个竖列里扫描出口，而不是把每个出口当成完整主泳道。约 300-360px 的间距在该样本中可读。

设计准则：

- 多出口目标尽量同 X 列对齐。
- 出口顺序映射到从上到下的 Y 顺序。
- 第 0 出口或主继续分支保持在顶部/原行。
- 其它出口向下展开，避免与主执行线混淆。
- 同一多出口列内的目标间距可以按约 320-360px 起步。
- 如果某个出口目标自身继续接长链或附带数据链，应把后续内容放到该出口自己的局部 Y 区间内，不要挤压相邻出口目标。

---

## 4. 数据流布局：贴近消费者，但按数据依赖成链

### 4.1 数据节点不是“孤立节点”

很多数据节点没有 exec 输入/输出，工具会报告 `ORPHAN`。这在布局语义上是错误解释。数据节点应按数据依赖和消费者关系看待。

例如：

```text
n5 Get Node Graph Variable -> n7 Addition -> n6 Data Type Conversion -> n4 Print String
```

它们没有 exec 边，但构成一条完整的数据流。

### 4.2 数据流应形成自己的横向小链

好的数据流布局通常满足：

- 数据依赖从左到右排列。
- 整体靠近它服务的执行线。
- Y 位置通常低于执行主线一层。
- 最终从数据链弯到消费者输入 pin。
- 不要把所有数据节点简单堆在消费者左下角。

主图顶部就是典型模式：

```text
执行线：n2 Print String ---------------------------- n4 Print String
数据线：       n5 GetVar -> n7 Add -> n6 Convert ----^
```

这比“数据节点贴着消费者堆叠”更容易读出计算过程。

### 4.3 数据链长度会影响执行节点间距

> 验证状态：已通过。2026-07-06 场景 B1/B2/B4 已游戏内验证，当前经验参数可作为主图数据链布局基线。

2026-07-06 的 B1/B2/B4 游戏内验证补充了一个重要规则：数据链不是简单放在消费者左下角即可，执行节点之间也要为数据链预留空间。

验证样本：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/错误布局-数据流-短链.png
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/错误布局-数据流-短链-纠正.png
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/错误布局-数据流-长链.png
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/错误布局-数据流-长链-纠正.png
```

观察结论：

- 短数据链可以放在执行线下方，但消费者所在执行节点应向右拉开，让数据链自然从左到右接入。
- 数据链初始位置不应因为“贴近消费者”而跑到事件节点左侧或主流程左侧太远的位置。
- 长数据链如果强行摊在主图，会造成主图过宽、起点不合理、执行线和数据线视觉竞争。
- 对长数据处理，最佳做法通常是折叠成一个纯数据复合节点，让主图只显示一个语义明确的数据计算节点。

设计准则：

1. 估算消费者的数据依赖链宽度。
2. 如果数据链较短，则增加上游执行节点到消费者之间的水平跨度，把数据链放在这段空隙的下方。
3. 如果数据链较长或有复杂分支，可以展开为较长数据链，也可以优先建议/生成数据流复合节点；两者都应保持主图可读。
4. 复合 impl 图内部再按纯数据表达式图布局。

当前通过的经验参数：

```text
数据链位于消费者下方约 190-230px；`布局c` 类多输入执行节点当前第一个数据节点使用约 190px，下游同列普通数据节点行距经 step12 校准为约 175px。
最后一个数据节点距消费者左侧约 440-470px。
执行节点间隔主要按数据链深度增加；不要把多输入节点的直接输入数量无限线性叠加，否则 Initiate Attack 这类节点会被推得过远。
普通数据流节点数量增多时，整块数据区对下方执行分支的高度估算需要随 `dataAncestorCount` 增长；当前 `布局c` data-count step12 通过的经验系数为 150。
纯数据复合 impl 内部数据节点横向间距约 450px。
nested sibling 的额外下推需要考虑数据链长度；当前 `布局c` 与 long-input 变体通过了更高的 bounded data padding。
```

2026-07-08 Round 13/15 的场景 D 验证进一步补充了共享布局核心的约束：

- 复合 impl 与主图应复用同一套数据流布局语义；不要回退到复合 impl 专属简化布局。
- 只输出到复合 OutParam 边界的数据节点也应有虚拟消费者锚点，否则会被当作弱关联数据节点。
- 根级执行泳道之间需要按上一分支的数据块高度预留空间，避免数据区插入执行泳道之间。
- 多消费者数据节点优先保持给更早或更近的消费者；后续大执行节点不应抢走中间数据链锚点。
- 局部数据边应避免倒退，至少在同一局部链路内保持 `producer.x < consumer.x`，同时只对有直接数据关系的近邻节点做避让，避免把普通参数栈横向摊开。
- 数据链 compact 后，如果执行 lane 在相近 X 区间内贴近上方数据区块，应做局部执行链 Y 向避让，而不是继续全局增大 root lane padding；Round 15 的 R6-D 复合 impl 与 R6-E 控制流覆盖已游戏内验证该方向有效。

已游戏内验证的 Round 13 导出包括：

```text
布局r6-d-composite-summary-step3-output-anchor.gia
布局r6-d-composite-summary-step4-data-lane.gia
布局r6-d-main-equivalent-step3-no-backflow.gia
布局r6-d-composite-summary-step5-no-backflow.gia
布局r6-c-reference-repro-round15-lane-avoidance.gia
布局r6-c-reference-repro-long-input-round15-lane-avoidance.gia
布局r6-d-main-equivalent-round15-lane-avoidance.gia
布局r6-d-composite-summary-round15-lane-avoidance.gia
布局r6-e-control-lane-coverage-round15-lane-avoidance.gia
```

详见：[handover/layout-handover-round-7.md](handover/layout-handover-round-7.md)、[handover/layout-handover-round-10.md](handover/layout-handover-round-10.md)、[handover/layout-handover-round-13.md](handover/layout-handover-round-13.md) 和 [handover/layout-handover-round-15.md](handover/layout-handover-round-15.md)。

### 4.4 纯数据复合按表达式图布局

`模拟复杂运算` 复合窗口是纯数据图。截图显示它不像执行图那样有白色主线，而是按数据表达式组织：

- 左侧是输入/读取变量。
- 中间是若干加法/乘法节点。
- 上方形成主计算链。
- 下方分支计算节点服务于后续汇总。
- 右侧是输出。

设计准则：

- 纯数据窗口应按数据依赖拓扑布局，而不是套用 exec BFS。
- 主要数据链横向排列。
- 分支数据计算放在主链下方。
- 汇总节点靠右。
- 输出 pin 所在节点应位于视觉终点。

---

## 5. 复合节点布局：分层窗口与语义压缩

### 5.1 主图只展示摘要

`复杂流程简化为一个复合节点` 在主图中把复杂内部过程压缩为一个节点，使主图只关心：

```text
进入复杂流程 -> 离开复杂流程 -> 后续分支
```

这显著降低主图的布局负担。

### 5.2 复合 impl 图继续遵循局部清晰原则

打开 `复杂流程简化为一个复合节点` 后，截图中只有该复合的直接内部节点：

```text
Print String ---------------- Print String

模拟复杂运算 -> 数据类型转换 -> 右侧 Print String 的输入
```

注意：复合内部仍然遵循“执行线在上，数据线在下”的布局原则。它不是因为进入复合就随意摆放，而是把一个更小的局部窗口布局清楚。

### 5.3 “顺序执行”复合把多出口语义变清晰

`顺序执行（比分叉更好理解）` 是非常重要的样本。它把“一个节点分叉到多个线”的语义封装成一个命名复合节点。

主图里读者看到的是：

```text
... -> 顺序执行
       ├─ 1
       ├─ 2
       ├─ 3
       └─ 4
```

而不是一堆没有命名的底层分叉节点。

设计准则：

- 当分叉本身有业务语义时，优先用复合节点命名它。
- 主图保留语义节点，底层 Double Branch / Multiple Branches 放入复合 impl。
- 这既提升理解，也降低主图布局复杂度。

---

## 6. 对 gsts 自动布局的具体要求

### 6.1 优先级从高到低

1. **每个窗口独立布局**：主图和每个复合 impl 图分别优化。
2. **语义区块识别**：先识别执行线、数据线、多出口区、复合摘要区，再排坐标。
3. **执行主线清晰**：白色执行流应形成可读的横向路径。
4. **执行泳道分离**：事件分叉形成多个 Y 泳道。
5. **数据流贴近但不重叠**：数据链放在相关执行线附近，通常下方一层。
6. **多出口同列展开**：出口目标按顺序纵向排列。
7. **复合优先降低复杂度**：复杂流程用复合节点下沉。
8. **允许较大间距**：画布可平移/缩放，过度紧凑不是目标。

### 6.2 算法方向

当前 `layout.ts` / `composite.ts` 的简单 DFS/BFS/Kahn 只是基础。后续可以逐步演进为：

1. 构建 exec 图和 data 图。
2. 识别 exec roots 和每个 root 下的主执行泳道。
3. 为每条泳道估计所需高度：包括本线执行节点、附属数据链、多出口目标。
4. 对执行节点做横向布局。
5. 对每个消费者的数据依赖子图做局部拓扑布局，放在消费者所在泳道下方或执行节点间隙中。
6. 对多出口节点的目标做同列纵向布局。
7. 对复合调用节点留出更大视觉空间，因为它们是可进入下一层窗口的语义节点。

### 6.3 当前工具的边界

以下工具仍有价值，但结论要谨慎解释：

- `dump-nodes.ts`：可靠，用于查看真实坐标。
- `trace-exec-flow.ts --io`：可靠，用于理解控制流输入输出。
- `trace-dataflow.ts`：可靠，用于理解数据依赖。
- `ascii-layout.ts`：有帮助，但 ASCII 缩放和编辑器实际路由不同。
- `audit-layout.ts`：只能作为启发式检查。对真实编辑器布局可能误报：
  - data-only 节点被报为 `ORPHAN`。
  - 编辑器正交连线被简化为直线/包围盒后，可能误报 `EDGE_CROSS`。

分析真实布局时，不应把 `audit-layout.ts` 的问题数当作最终质量标准。

---

## 7. 旧文档结论的降级说明

早期文档强调：

- user_edit 主图通常节点少。
- X 间距常见 300-400。
- 分支 Y 偏移 150-300。
- gsts 参数如 `columnWidth: 350`、`rowHeight: 280` 基本合理。

这些结论现在只能作为历史样本统计，不能作为布局设计的主要依据。原因：

1. 编辑器布局是手工布局，不存在唯一固定步进。
2. 视口可缩放，较大的间距并不意味着浪费。
3. 数据流会显著改变执行节点间距。
4. 复合层级才是控制复杂度的核心，不是单层压缩。
5. 当前代码参数也已经多次变化，文档中的旧常量可能滞后。

后续如果要调整常量，必须先回答：

- 这个调整改善了哪个语义区块？
- 它是否让执行线、数据线或多出口区更清晰？
- 它是否破坏了复合窗口内的局部可读性？

而不是只比较 `dx/dy` 平均值。

---

## 8. 推荐验证流程

拿到新的布局参考文件时：

```bash
# 1. 看真实坐标
npx tsx tests/composite/dump-nodes.ts <file.gia>

# 2. 看控制流 I/O
npx tsx tests/composite/trace-exec-flow.ts <file.gia> --io

# 3. 看数据依赖
npx tsx tests/composite/trace-dataflow.ts <file.gia> --list-nodes
npx tsx tests/composite/trace-dataflow.ts <file.gia> <node> --all-params

# 4. 如有截图，优先结合截图判断视口内局部可读性
# 5. 只把 audit-layout.ts 作为启发式，不作为最终裁判
```

分析输出应按以下结构记录：

1. 当前窗口有哪些语义区块？
2. 每条执行泳道是什么？
3. 哪些数据链服务于哪个执行节点？
4. 哪些复杂流程被复合节点下沉？
5. 多出口节点如何排布？
6. 截图缩放下哪些局部区域最清楚，为什么？

---

## 9. 当前实现对照与缺口路线图

> 状态：当前实现对照 / 路线图
> 来源：当前代码实现 + Round 13/14/15 游戏内验证 + 设计准则对照
> 最近校验：2026-07-08

本节用于把本文前面的理想布局原则和 `layout.ts` 当前实现对齐，避免后续只沿着某一轮 handover 做局部调参。当前总体状态是：

> gsts 布局已经从固定网格进化到“执行泳道 + 数据链局部布局 + 复合 impl 复用主图布局 + 局部避让”，但还没有真正实现“先识别语义区块，再整体规划窗口”的完整布局系统。

### 9.1 已基本补上的能力

1. **主图 / 复合 impl 共享布局核心**

   当前主图通过 `buildExecutionGraph(...) -> layoutPositions(...)` 布局；复合 impl 通过 `computeImplLayout(...)` 把 `implNodes`、`implEdges` 和虚拟输出锚点适配到同一套 `layoutPositions(...)`。Round 13 之后，不再维护复合 impl 专用简化坐标算法。

   已覆盖的关键点：

   - 复合 `OutParam` 通过 `virtualOutputNodes` / `extraDataConnections` 参与数据布局。
   - 主图和复合 impl 共用执行/数据语义。
   - 后续布局修复优先在共享 `layout.ts` 中扩展通用约束。

2. **执行流横向主线 + root 泳道**

   当前 `layoutExecutionChain(...)` 已支持 root direct child 宽间距泳道、nested sibling 根据上方 subtree / data block 下推，以及 R6-C 普通与 long-input 场景的 root 分支回归控制。

   已游戏内验证的结论：

   - R6-C 普通和 long-input 场景中，后续链继承已下移 lane 的方向有效。
   - Round 14/15 已避免 root 分支重新掉到底部。

3. **数据链靠近消费者、横向展开、避免倒退**

   当前数据流布局主要由以下 pass 协同完成：

   ```text
   expandExecGapsForDataChains(...)
   compactLocalDataChains(...)
   resolveDataBackflowAndOverlap(...)
   ```

   已覆盖的关键点：

   - 数据链按依赖深度在消费者附近横向展开。
   - 执行节点间距会根据数据链长度和复合 pin 视觉占位拉开。
   - 多消费者数据节点优先保持给更早或更近的消费者，避免后续大执行节点抢走上游数据链。
   - 局部数据边避免倒退，数据节点之间避免直接关系链上的重叠。

4. **数据区块与控制流局部避让**

   Round 15 新增共享 pass：

   ```text
   avoidExecLanesNearDataBlocks(...)
   ```

   该 pass 在数据链 compact 后，对已经放好的执行 lane 做局部 Y 向避让：如果某条执行链位于相近 X 区间的数据区块下方且距离不足，则只下推该执行链及其后续节点，而不是全局增大 `rootLanePadding`。

   已游戏内验证的文件包括 R6-D 复合 impl 和 R6-E 控制流覆盖，说明该方向能缓解数据节点/控制流线贴近问题，同时没有让 R6-C root 分支回到底部回归。

### 9.2 仍然缺少的关键能力

1. **真正的语义区块识别**

   本文第 2 节强调应先识别事件入口区块、普通执行线区块、带数据流执行线区块、多出口区、纯数据计算区块，再排坐标。当前实现仍主要是“先放执行节点，再放数据节点，再用多个 pass 修正间距、倒退、重叠和局部贴近”。

   当前缺口：

   - 没有显式 `LayoutBlock` / `LaneBlock` / `SemanticBlock` 数据结构。
   - 没有为每条 lane 计算完整 bounding box。
   - 没有把“执行链 + 附属数据链 + 多出口子列”作为一个整体布局单元。
   - 当前 `dataBlockHeightMap` 仍是经验估算，不是实际布局后的占用盒。

2. **多出口节点同列纵向展开仍较基础**

   当前 `layoutExecutionChain(...)` 仅通过 `children.length > 3` 给多 child 场景更紧凑的 branch spacing，还没有显式识别多 `OutFlow` 节点、branch node 或 sequence composite。

   当前缺口：

   - 不能严格保证多出口目标同列对齐。
   - 每个出口目标的局部数据链还没有作为该出口列的子区块处理。
   - 多出口目标继续接长链或带数据链时，缺少专门区块估算和回归矩阵。

3. **纯数据复合的表达式图布局仍不完整**

   当前纯数据节点主要依赖 virtual output anchors、data depth、compact 和 backflow pass 形成横向数据链；这能覆盖当前样例，但还不是真正的 data-DAG 专用布局器。

   当前缺口：

   - 没有识别“纯数据复合 impl”并切换到 data-DAG 主导布局。
   - 没有主计算链 / 分支计算 / 汇总节点 / 输出节点的语义分层。
   - 多输出纯数据复合、复杂分支数据 DAG 和 crossing minimization 仍缺系统性验证。

4. **复合优先降低复杂度仍主要靠用户建模**

   本文强调复杂流程和长数据链可以通过复合节点下沉，降低主图负担。当前编译器不会自动把长数据链折叠成纯数据复合，也不会生成或建议语义复合节点。

   这不一定是短期目标，因为自动拆复合会改变用户可见图结构和调试体验；但从设计愿景看，仍缺：

   - 长数据链阈值策略。
   - 自动或半自动数据复合封装。
   - 主图摘要节点与 impl 细节窗口的协同布局。
   - 用户可控开关或提示机制。

5. **视口 / 缩放层面的布局目标还未形式化**

   当前实现仍以 `columnWidth`、`rowHeight`、`eventGap` 和经验间距常量驱动；还没有建立可缩放画布下的可读性模型。

   当前缺口：

   - 没有视口宽高和常用缩放比例模型。
   - 没有节点真实卡片宽高估计。
   - 没有控制线/数据线路由占用通道模型。
   - 不能自动评估“局部视口是否清楚”。

6. **节点真实视觉尺寸估计仍较粗**

   当前已有 composite pin count extra、direct input count extra、data ancestor count extra 和局部 X/Y gap 常量，但对编辑器真实卡片高度、pin 分布和连线路由仍是近似估计。

   当前缺口：

   - 按节点类型估计卡片宽高。
   - 按 pin 数估计 InParam / OutParam 上下占用。
   - 区分执行 pin、数据 pin 的路由通道。
   - 为 `Initiate Attack`、复合调用、多输入节点、转换节点等建立特殊视觉模型。

7. **布局测试还未矩阵化**

   当前已有 B1/B2/B4、R6-C、R6-D、R6-E 等关键场景，但还不是完整覆盖矩阵。

   建议补充的测试方向：

   - 多出口节点专门测试。
   - 纯数据复合多输出测试。
   - 嵌套复合布局窗口测试。
   - 多 root event 测试。
   - 长数据链 + 多消费者 + 后续 exec chain 混合测试。
   - 多个 composite call 串联且带大量 pin 的测试。
   - 变量 get/set 与 local variable store 混合数据链测试。
   - 布局稳定性测试：同样结构增加无关节点后，核心区块不应大幅漂移。

8. **自动 audit 工具还没有跟上当前布局语义**

   `audit-layout.ts` 仍只能作为启发式工具。后续更有价值的是语义化 layout audit：

   - 区分 data-only 节点不是 orphan。
   - 根据 exec/data graph 和复合窗口分别评估 lane overlap。
   - 基于局部 bounding boxes 检查数据区块与执行区块距离。
   - 输出“可能需要游戏内看”的候选问题，而不是把直线交叉当作最终错误。

### 9.3 推荐后续优先级

**P0：短期最值得做**

1. 显式记录实际布局后的 data block bounding box，让后续 lane 避让基于占用盒而不是点距离。
2. 补多出口节点专门回归，对齐本文第 3.3 节的同列纵向展开目标。
3. 补纯数据复合多输出测试，验证 virtual output anchors + compact/backflow 在纯 data-DAG 场景中的边界。

**P1：中期架构升级**

1. 引入 `LayoutBlock` / `LaneBlock` 内部结构，先结构化估算和 debug 输出，不必一次性重写所有坐标逻辑。
2. 基于 block bounding box 做 lane placement，从“放完再修”逐步转向“先估区块，再排 lane”。
3. 改进 layout audit，让工具理解 exec/data/复合窗口语义。

**P2：长期理想设计**

1. 纯数据复合的 data-DAG 专用布局器。
2. 视口 / 缩放可读性指标。
3. 自动或半自动长数据链复合化建议或转换。

---

## 10. 当前样本提炼出的核心规则

一句话总结：

> 好的 GIA 布局不是固定网格，而是在可缩放画布上，把当前层级窗口拆成清晰的语义区块；执行流形成横向主线和垂直泳道，数据流贴近消费者并按依赖成链，复杂流程通过复合节点下沉到下一层窗口。

对 gsts 的布局改进，应围绕这个目标逐步推进。
