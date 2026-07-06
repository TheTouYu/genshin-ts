# 布局任务交接文档 · 第七轮

> **本轮目标**：按场景小步验证布局规则。本轮完成场景 B：数据流影响执行节点间距、数据链垂直距离、长数据流展开/复合折叠、纯数据复合内部间距。
> **上一轮文档**：[layout-handover-round-6.md](layout-handover-round-6.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)

---

## 一、本轮结论

场景 B 已通过游戏内视觉验证。

通过的规则：

1. 数据链应放在消费者下方，Y 距离约 230px，比之前 150px 更舒服。
2. 执行节点间隔需要根据消费者的数据链长度增加。
3. 最后一个数据节点到消费者左侧距离固定约 450px 可接受。
4. 多节点数据链可完整放在两个执行节点之间，不再向事件节点左侧溢出。
5. 纯数据复合内部节点间距需要加大；当前 450px 横向间距通过。
6. 长数据流既可以展开为较长数据链，也可以折叠为纯数据复合；两种主图布局当前都可读。

用户反馈：

```text
B1/B4 调参后：可以，看起来舒服。
B2 长数据流展开版：可以。看起来舒服。
文档这个规则可以标记通过。
```

---

## 二、参考样本与经验参数来源

本轮继续参考真实正样本：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1.gia
```

提取命令：

```bash
npx tsx tests/composite/dump-nodes.ts \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1.gia

npx tsx tests/composite/trace-dataflow.ts \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1.gia 4 --all-params

npx tsx tests/composite/trace-dataflow.ts \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1.gia 13 --all-params
```

关键坐标：

### 三节点数据链服务 n4

```text
消费者：
n4 Print String        (2072, -227)

数据链：
n5 GetVar              (755,   -8)
n7 Addition            (1146,  -7)
n6 Conversion          (1628,  -9)
```

经验：

```text
数据链 Y 距消费者 Y：约 218px
最后一个数据节点到消费者左侧 X 距离：444px
执行节点 n2 -> n4 间隔：1638px
```

### 两节点数据链服务 n13

```text
消费者：
n13 Print String       (1607, 278)

数据链：
n16 复合:模拟复杂运算    (760,  511)
n11 Conversion          (1147, 511)
```

经验：

```text
数据链 Y 距消费者 Y：233px
最后一个数据节点到消费者左侧 X 距离：460px
执行节点 n8 -> n13 间隔：1186px
```

---

## 三、本轮代码改动

### 3.1 主图布局：数据链反推执行节点间隔

文件：

```text
src/compiler/ir_to_gia_transform/layout.ts
```

新增/调整逻辑：

- 收集消费者的所有数据祖先节点。
- 按数据链节点数量估算执行节点间距。
- 把消费者及其后续执行链整体向右平移。
- 再把数据链锚定到消费者左下方。

当前经验常量：

```ts
const dataYBelowConsumer = 230
const dataNodeStepX = 450
const extraExecGapPerAdditionalDataNode = 400
const extraGapPerAdditionalInput = 260
```

含义：

```text
数据链在消费者下方约 230px。
最后一个数据节点距消费者左侧约 450px。
每多一个数据节点，执行间距增加约 400px。
多个直接数据输入时，额外增加纵向/横向安全量。
```

### 3.2 复合 impl 布局：增加纯数据图内部间距

文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

调整：

```ts
const LAYOUT_EXEC_H_STEP = 450
const LAYOUT_EXEC_V_STEP = 260
const LAYOUT_DATA_H_STEP = 450
const LAYOUT_DATA_Y_OFFSET = 0
```

目的：避免纯数据复合内部节点紧贴或轻微重叠。

---

## 四、本轮测试文件

新增：

```text
tests/layout-r6-b4-pure-data-composite.ts
```

已有并用于验证：

```text
tests/layout-r6-b1-simple-dataflow.ts
tests/layout-r6-b2-long-dataflow.ts
tests/layout-r6-b3-data-composite.ts
```

本轮重点验证文件：

```text
layout-r6-b1-simple-dataflow.gia
layout-r6-b2-long-dataflow.gia
layout-r6-b4-pure-data-composite.gia
```

复制位置：

```text
C:\Users\touyu\AppData\LocalLow\miHoYo\原神\BeyondLocal\Beyond_Local_Export\
```

WSL 路径：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/
```

---

## 五、最终通过坐标摘要

### B1 短数据流

```text
执行线：
n1 Event        (6, 8)
n2 Print 开始   (801, 8)
n6 Print 结果   (2402, 8)
n7 Print 结束   (3203, 1)

数据链：
n3 GetVar       (1053, 231)
n4 Addition     (1500, 237)
n5 Conversion   (1950, 236)
```

### B2 长数据流展开

```text
执行线：
n1 Event              (7, 2)
n2 Print 开始         (804, 10)
n9 Print 结果         (3604, 3)
n10 Print 结束        (4409, 2)

数据链：
n3 GetVar             (900, 233)
n4 Addition           (1359, 234)
n5 Addition           (1805, 239)
n6 Multiplication     (2259, 236)
n7 Addition           (2710, 231)
n8 Conversion         (3158, 237)
```

### B4 纯数据复合

```text
执行线：
n1 Event             (3, 6)
n2 Print 开始        (803, 9)
n6 Print 结果        (2402, 4)
n7 Print 结束        (3205, 5)

数据链：
n3 GetVar            (1057, 236)
n4 纯数据复合节点     (1509, 233)
n5 Conversion        (1960, 231)
```

复合内部：

```text
Addition        (0, 0)
Addition        (450, 0)
Multiplication  (900, 0)
Addition        (1350, 0)
```

---

## 六、注意事项

### 6.1 目前仍是经验参数，不是完整 pin 模型

本轮没有实现精确节点视觉模型，也没有精确计算每个 InParam pin 的屏幕坐标。

已确认当前可接受的简化：

```text
第一个数据流节点/最后一个数据节点到消费者左侧距离固定也可以。
```

后续如果处理复杂多输入节点，可能仍需要引入：

```ts
type NodeVisualModel = {
  width: number
  headerHeight: number
  pinRowHeight: number
  inParamY(index: number): number
}
```

但当前 B 场景不需要。

### 6.2 B2 长数据流虽然通过，但复合折叠仍是推荐策略之一

B2 展开版现在可读，但长数据处理仍可根据语义折叠为纯数据复合。后续规则应允许两种策略：

- 短/中数据链：展开并拉开执行间距。
- 复杂数据处理：折叠为纯数据复合，主图显示语义节点。

---

## 七、下一轮建议

下一轮进入后续一个规则，建议按 round-6 的场景顺序继续：

```text
场景 C：同一事件多条执行泳道
```

待验证问题：

1. 同一事件分出多条执行线时，是否形成明显 Y 泳道。
2. 每条泳道是否保留自己的数据链空间。
3. 主继续分支是否保持在上方或原 Y 附近。
4. 辅助分支是否向下展开，且互不干扰。

建议新增/使用测试：

```text
tests/layout-r6-c-multi-lane.ts
```

示例结构：

```text
Event
├─ line A: Print -> Print
├─ line B: Print -> Print with data chain
└─ line C: Composite -> Composite
```

---

## 八、给下一位助手的简短交接语

> 场景 B 已通过。当前主图数据链布局采用从 `主图布局1.gia` 提取的经验参数：数据链位于消费者下方约 230px，最后一个数据节点距消费者左侧约 450px，每多一个数据节点给执行间距额外约 400px。B1/B2/B4 已游戏内验证“看起来舒服”。复合 impl 内部数据节点横向间距调到 450px，解决纯数据复合内部轻微重叠。下一轮建议实现/验证场景 C：同一事件多执行泳道。
