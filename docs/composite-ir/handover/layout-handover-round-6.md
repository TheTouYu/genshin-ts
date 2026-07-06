# 布局任务交接文档 · 第六轮

> **本轮目标**：基于真实编辑器布局文件与截图，重写布局设计原则；下一轮任务是按新原则编写 gsts 布局测试，生成 `.gia` 后交给用户在游戏内查看。
> **前一轮文档**：[layout-handover-round-5.md](layout-handover-round-5.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)

---

## 一、本轮背景

用户提供了一个精心手工编排的真实布局样本，并补充了对应截图。该样本用于替代之前主要基于节点数量、固定步进和工具统计的布局判断方式。

本轮结论：旧布局文档中“固定 columnWidth / rowHeight”“小图统计”“audit-layout 问题数”等参考价值下降。后续布局优化应以**视口、层级窗口、语义区块、执行泳道、数据流贴近、复合节点降复杂度**为核心。

---

## 二、参考样本

### 2.1 GIA 文件

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1.gia
```

Windows 原路径：

```text
C:\Users\touyu\AppData\LocalLow\miHoYo\原神\BeyondLocal\Beyond_Local_Export\布局\主图布局1.gia
```

### 2.2 截图

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1-40%缩放.png
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/模拟复杂运算-50%缩放.png
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复杂流程简化为一个复合节点-70%缩放.png
```

### 2.3 样本拓扑摘要

主图：

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

数据流：

```text
n1 event value ── n3 Data Type Conversion
                ├─ feeds n2 Print String
                ├─ feeds n8 Print String
                └─ feeds n24 composite input

n5 Get Node Graph Variable ── n7 Addition(+999) ── n6 Data Type Conversion ── n4 Print String

n16 模拟复杂运算 ── n11 Data Type Conversion ── n13 Print String
```

复合实现图：

- `模拟复杂运算`：纯数据复合，数据表达式图。
- `复杂流程简化为一个复合节点`：上方执行线，下方数据流，局部窗口独立清晰。
- `顺序执行（比分叉更好理解）`：用复合节点显式表达多出口 / 顺序执行语义。

---

## 三、本轮已完成

### 3.1 重写布局设计文档

文件：

```text
docs/composite-ir/layout-patterns.md
```

主要改动：

- 将文档定位从“GIA 布局规律观察”改为“GIA 布局设计原则：视口、层级与语义区块”。
- 降级旧的固定参数和节点数量统计结论。
- 记录真实样本路径和截图路径。
- 明确好布局的基本单位是语义区块，不是单节点或全文件。
- 记录执行泳道、数据流贴近、多出口同列展开、复合节点语义压缩等原则。
- 明确 `audit-layout.ts` 对真实编辑器布局的误报边界。

### 3.2 更新 round-5 交接引用

文件：

```text
docs/composite-ir/handover/layout-handover-round-5.md
```

将 `layout-patterns.md` 的描述从“编辑器布局规律（25 文件统计）”改为：

```text
当前推荐布局设计准则：视口、层级窗口、语义区块、执行泳道、数据流贴近
```

---

## 四、当前设计原则摘要

### 4.1 视口原则

编辑器布局不是静态截图，而是可平移、可缩放画布：

- 节点不需要挤进固定屏幕范围。
- 允许较大水平/垂直间距。
- 在常用缩放比例下，局部视口可读性优先。

### 4.2 层级窗口原则

每个复合节点单独打开都是独立窗口：

- 主图只布局顶层节点。
- 复合 impl 图只布局该复合的直接子节点。
- 不跨层级同时优化，也不按全文件节点总数判断布局复杂度。

### 4.3 语义区块原则

布局应先识别区块：

1. 事件入口区块
2. 普通执行线区块
3. 带数据流的执行线区块
4. 复杂流程折叠区块
5. 多出口 / 顺序执行区块
6. 纯数据计算区块

固定步进只是区块内实现细节。

### 4.4 执行泳道原则

同一事件分出多条执行线时，应形成 Y 方向分离的泳道：

- 每条主线拥有自己的 Y 区间。
- 泳道间距足够容纳数据流和后续扩展。
- 主继续分支通常保持在上方或原 Y 附近。
- 辅助分支向下展开。

### 4.5 数据流原则

数据节点不是孤立节点：

- 按数据依赖从左到右形成小链。
- 靠近它服务的执行线。
- 通常位于执行主线下方一层。
- 最终弯入消费者输入 pin。
- 不应简单堆叠在消费者左下角。

### 4.6 多出口原则

多出口节点右侧目标倾向于同列纵向展开：

- 出口顺序映射到从上到下的 Y 顺序。
- 第 0 出口 / 主继续分支保持在顶部或原行。
- 其它出口向下排列。

### 4.7 复合节点原则

复合节点是降低布局负担的主要工具：

- 主图展示流程摘要。
- 复杂逻辑下沉到复合 impl 图。
- 分叉语义可用命名复合节点显式表达，例如 `顺序执行（比分叉更好理解）`。

---

## 五、下一轮任务：写布局测试

下一轮不建议立刻大改布局算法。建议先写测试，生成多个 `.gia`，由用户导入游戏内查看真实视觉效果。

### 5.1 建议新增测试文件

建议新增：

```text
tests/layout-viewport-semantics.ts
```

或者拆成多个文件：

```text
tests/layout-data-lane.ts
tests/layout-semantic-blocks.ts
tests/layout-sequence-composite.ts
```

考虑到游戏内验证方便，建议先用一个文件生成多个 server 输出，名称要清晰，便于导入后辨认。

### 5.2 测试场景 A：常规一条线多个节点

目的：验证普通执行链横向阅读。

示例形状：

```text
Event -> Print 1 -> Print 2 -> Print 3
```

检查点：

- 是否形成清楚横向主线。
- 节点间距是否舒适。
- 在游戏内 40%-70% 缩放下是否容易阅读。

### 5.3 测试场景 B：带数据流的执行线

目的：验证执行节点之间能为数据流留空间。

示例形状：

```text
Event -> Print A -----------------------> Print B
              data: GetVar -> Add -> ToString ----^
```

可用 DSL 近似：

- 读取图变量 / 局部变量。
- 做一次加法或类型转换。
- 最终传给后面的 `printString`。

检查点：

- 数据节点是否形成横向小链。
- 数据链是否贴近消费者所在执行线。
- 执行主线是否仍然清楚。

### 5.4 测试场景 C：同一事件多条执行泳道

目的：验证分叉不是挤在一起，而是形成多条 Y 泳道。

示例形状：

```text
Event
├─ line A: Print -> Print
├─ line B: Print -> Print
└─ line C: Composite -> Composite
```

检查点：

- 三条线是否垂直分离。
- 每条线是否有自己的阅读空间。
- 分支线之间是否不会互相干扰。

### 5.5 测试场景 D：复杂流程折叠为复合节点

目的：验证主图只显示摘要，复杂细节在复合窗口内。

示例形状：

```text
Main:
Event -> ComplexStep -> ComplexStep -> Print

ComplexStep impl:
Print -> Print
DataComposite -> Conversion -> Print input
```

检查点：

- 主图是否简洁。
- 打开复合后，impl 图是否独立清楚。
- impl 图是否延续“执行线在上、数据线在下”的原则。

### 5.6 测试场景 E：顺序执行复合 / 多出口语义

目的：验证多出口节点同列纵向展开，且“顺序执行”语义清晰。

示例形状：

```text
Main:
Event -> Before -> SequenceComposite
                     ├─ Print 1
                     ├─ Print 2
                     ├─ Print 3
                     └─ Print 4
```

检查点：

- 多出口目标是否同 X 列纵向展开。
- 出口顺序是否对应从上到下。
- 第一个出口 / 主分支是否保持在顶部或原行。
- 复合节点名称是否能帮助理解分叉语义。

### 5.7 测试场景 F：纯数据复合窗口

目的：验证纯数据复合按表达式图布局。

示例形状：

```text
GetVar -> Add -> Mul -> Add -> output
          ├─ Add branch
          └─ Add branch
```

检查点：

- 主要数据链是否横向排列。
- 分支数据计算是否位于主链下方。
- 汇总节点是否靠右。
- 输出节点/输出 pin 是否位于视觉终点。

---

## 六、建议命名

为了游戏内查看方便，server 和 composite 名称应带轮次和场景名。例如：

```text
R6-A常规链
R6-B数据流链
R6-C多泳道
R6-D复合摘要
R6-E顺序执行
R6-F纯数据复合
```

复合名可用：

```text
R6模拟复杂运算
R6复杂流程简化
R6顺序执行更清晰
```

---

## 七、验证命令

编译：

```bash
npx tsx bin/gsts.mjs -c gsts.test.config.ts tests/layout-viewport-semantics.ts
```

查看节点：

```bash
npx tsx tests/composite/dump-nodes.ts dist/tests/layout-viewport-semantics_0.gia
npx tsx tests/composite/dump-nodes.ts dist/tests/layout-viewport-semantics_1.gia
```

看控制流：

```bash
npx tsx tests/composite/trace-exec-flow.ts dist/tests/layout-viewport-semantics_0.gia --io
```

看数据流：

```bash
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout-viewport-semantics_0.gia --list-nodes
```

ASCII 仅作辅助：

```bash
npx tsx tests/composite/ascii-layout.ts --compact dist/tests/layout-viewport-semantics_0.gia
```

注意：

```text
audit-layout.ts 的 ORPHAN / EDGE_CROSS 不作为最终裁判。
```

---

## 八、用户游戏内验证清单

用户导入游戏后建议按场景观察：

1. 40%-70% 缩放下，是否能一眼看出主流程？
2. 是否需要频繁拖动画布才能理解一个局部区块？
3. 数据节点是否贴近对应执行线？
4. 数据流和执行流是否互相抢视觉焦点？
5. 多出口目标是否按列向下展开？
6. 复合节点是否有效降低主图复杂度？
7. 打开复合 impl 图后，局部布局是否仍然清楚？
8. 纯数据复合是否像表达式图，而不是无序堆叠？

用户反馈建议按以下格式记录：

```text
场景：R6-B数据流链
结果：可读 / 稍乱 / 很乱
问题：数据节点离消费者太远；执行线被数据线穿过；节点太挤等
截图：可选
```

---

## 九、风险与注意事项

### 9.1 当前布局算法可能还不符合新原则

当前代码仍偏向简单 DFS/BFS/Kahn：

- `src/compiler/ir_to_gia_transform/layout.ts`：主图布局。
- `src/compiler/ir_to_gia_transform/composite.ts`：复合 impl 图布局。

新测试可能暴露明显差异，这是预期结果。下一轮重点是生成可观察样本，不一定立即修复所有布局问题。

### 9.2 不要用工具误报否定真实编辑器布局

已确认真实正样本中 `audit-layout.ts` 会误报：

- data-only 节点为 `ORPHAN`。
- 编辑器实际无混乱的连线为 `EDGE_CROSS`。

后续应结合截图和游戏内视觉反馈判断。

### 9.3 不要回到固定参数思维

不要只问：

```text
columnWidth 应该是多少？rowHeight 应该是多少？
```

应先问：

```text
这个场景属于哪个语义区块？
执行泳道在哪里？
数据链服务于哪个消费者？
是否应该用复合节点下沉复杂度？
```

---

## 十、下一轮推荐执行顺序

1. 阅读 `docs/composite-ir/layout-patterns.md`。
2. 编写 `tests/layout-viewport-semantics.ts`，覆盖 A-F 场景。
3. 运行编译，生成多个 `.gia`。
4. 用 `dump-nodes` / `trace-exec-flow --io` / `trace-dataflow` 确认结构正确。
5. 将输出 `.gia` 提供给用户导入游戏查看。
6. 根据用户截图和反馈，再决定布局算法修改方向。

---

## 十一、给下一位助手的简短交接语

> 本轮已把布局目标从“固定步进/工具审计”改为“视口 + 层级窗口 + 语义区块”。当前权威文档是 `docs/composite-ir/layout-patterns.md`。下一轮先不要直接大改算法，先写 `tests/layout-viewport-semantics.ts` 生成 A-F 六类布局样本，让用户进游戏验证。验证时不要把 `audit-layout.ts` 的 `ORPHAN/EDGE_CROSS` 当最终问题；数据节点和编辑器正交连线会误报。重点观察执行泳道、数据链贴近消费者、多出口同列展开、复合节点是否降低主图复杂度。
