# GIA 可视化工具设计预览 v3

> 基于 `复杂gia/传球.gia` 真实数据模拟输出。
> **v3 更新**：所有 exec 链以"事件"为起点；每个节点统一展示 名字/ID/控制流/数据流。

---

## 1. 节点统一模型

```
节点 = { 名字, ID, 控制流入?, 控制流出?, 数据流入?, 数据流出? }
```

**实际例子**：

```
n=7  Multiple Branches  (nodeId=3)
├── 控制流入: ← 复合:自身实体条件
├── 控制流出: 4 路 → [4],[12],[29],[9]
├── 数据流入: 2 个 (R<T>, L<R<T>>)
└── 数据流出: 1 个 (输出结果)

n=2  复合:监听信号  (nodeId=1610612902)
├── 控制流入: ← Get Self Entity
├── 控制流出: 1 路 → 自身实体条件等
├── 数据流入: 0 个
└── 数据流出: 9 个 (事件源实体, 信号来源实体, 位置, ...)

n=20  3D Vector Zoom  (nodeId=12)
├── 控制流入: ✗（孤立节点）
├── 控制流出: ✗
├── 数据流入: 2 个
└── 数据流出: 1 个
```

---

## 2. 默认视图（自动 mode）

```bash
gia 复杂gia/传球.gia
```

```
传球.gia  ─── 24 节点 ───
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 事件 (3 条 exec 链)

事件 0:  (?) Get Self Entity     (n=1,   y=-470)
└── 链长 8 节点 ──→ 调用:监听信号 → 调用:自身实体条件 →
    Multiple Branches (4 路分支) → 调用:获取三实体,
    调用:标记e技能释放, 调用:蓄力时间→调用:职业branch→
    调用:顺序执行→调用:e技能特效, Set Character Skill CD
    ⋮
    数据节点: Get Node Graph Variable ×2

事件 1: When Entity Is Created   (n=3,   y=-1414)
└── 链长 7 节点 ──→ 调用:职业branch (5 路:前锋/中锋/后卫/门将/其他)
    → Set Node Graph Variable ×5
    数据节点: (无)

事件 2: When Player Class Changes (n=39, y=-1701)
└── 链长 7 节点 ──→ (合并于事件 1 的调用:职业branch)
    → Set Node Graph Variable ×5
    数据节点: (无)

📋 其他节点 (无 exec 连接，纯数据)

  位置类型:
    n=19  Get Node Graph Variable   (1955,  60)  [为 n=9 提供数据]
    n=23  Get Node Graph Variable   (1947,-178)  [为 n=9 提供数据]
    n=20  3D Vector Zoom            (-295, 420)
    n=52  复合:职业参数             (-490, 504)

📋 复合定义 (13 个，来自 accessories)

  [0]  监听信号
    OutFlow[0]: (未命名) → 渲染为"出口1"
    OutParam[0..8]: 事件源实体, 事件源GUID, 信号来源实体,
                    r, 位置, 参数, 事件, d, 角色实体

  [3]  获取三实体
    OutParam[0..2]: 物理引擎实体, 挂载实体, 运动实体

  [5]  自身实体条件
    OutFlow[0]: 是      InParam[0]: 自身实体

  [7]  [时间]定时器设置与触发
    OutFlow[0]: 触发时动作   OutFlow[1]: 后续动作
    InParam[0..3]: 目标实体, 定时器名称, 定时器时间, 是否循环

  [9]  蓄力时间
    OutFlow[0]: 异常    OutFlow[1..3]: 是    OutFlow[4]: 否
    InParam[0..3]: 异常, 右值, 右值×3

  [11] 条件branch
    OutFlow[0..3]: 是    OutFlow[4]: 否

  [12] 顺序执行
    OutFlow[0..3]: 是

  [13] 职业branch
    OutFlow[0]: 前锋    OutFlow[1]: 中锋
    OutFlow[2]: 后卫    OutFlow[3]: 门将    OutFlow[4]: 其他

📋 文件信息
  主图节点: 24 (exec: 10, data-only: 14)
  复合定义: 13 (accessories: 29)
  Y 范围: [-1841, 504] — 5 页 (page-size=500)

💡 用 --event 0 --tree   查看事件 0 的完整 exec 链拓扑
💡 用 --node 7 --detail  查看 Multiple Branches 的 4 路分支
💡 用 --full --page N    分页查看 ASCII 渲染
```

---

## 3. 事件 exec 拓扑树

```bash
gia 复杂gia/传球.gia --event 0 --tree
```

```
Event 0: (?) Get Self Entity   (n=1, y=-470)
Exec 链：8 节点, 复合嵌套 3 层, Multiple Branches (4 路)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【事件】[1] Get Self Entity              (356,-470)
 控制流出 → [2]

【复合】[2] 监听信号                     (-740,-346)
 控制流出[出口1] → [8]
 数据流出: 事件源实体, 事件源GUID, 信号来源实体, ...

【复合】[8] 自身实体条件                 (-385,-347)
 控制流入 ← [2]
 控制流出[是] → [7]
 数据流入: 自身实体 ← [2] OutParam[0]

【分支】[7] Multiple Branches            (-28,-346)  ← 4 路分支
 控制流入 ← [8]
 控制流出[出口1] → [4] 复合:获取三实体         (1119,-340)
 控制流出[出口2] → [12] 复合:标记e技能释放      (812, 94)
 控制流出[出口3] → [29] 复合:蓄力时间          (504,-1051)
 控制流出[出口6] → [9] Set Character Skill CD (1201, -94)
 数据流入: R<T> ← [2] OutParam[0]
 数据流入: L<R<T>> (未连接)
 数据流出: 输出结果 → [4] InParam[0], [12] InParam[0]

   出口3 ↓

【复合】[29] 蓄力时间                    (504,-1051)
 控制流出[异常/是/是/是/否] → [43]

【复合】[43] 职业branch                  (1068,-1039)
 控制流出[前锋/中锋/后卫/门将/其他] → [30]

【复合】[30] 顺序执行                    (1338,-1164)
 控制流出[是/是/是/是] → [5], [11]

【复合】[5] e技能特效                   (1651,-1200)
 控制流入 ← [30]

【复合】[11] 标记e技能释放               (1846,-1105)
 控制流入 ← [30]

【终端】[9] Set Character Skill CD      (1201,-94)
 控制流入 ← [7]
 数据流入: ← [19] Get Node Graph Variable
 数据流入: ← [23] Get Node Graph Variable

(8/8 exec nodes, 11 复合调用展开)

💡 --node 7 --detail   看 Multiple Branches 全部 pins
💡 --node 2 --detail   看 监听信号 的 9 个数据输出
💡 --recurse 1         展开复合 impl 图内部节点
```

---

## 4. 节点详情

```bash
gia 复杂gia/传球.gia --node 7 --detail
```

```
Node [7]  Multiple Branches
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  名称: Multiple Branches
  ID:   nodeIndex=7, genericId.nodeId=3
  位置: (-28, -346)
  分类: SysNode (kind=22000, class=10001, type=20000)

  ── 控制流 ────────────────────────────

  InFlow (执行流入):
    来源 ← 复合:自身实体条件 [8] OutFlow()
    PinRef: kind=1 index=0 | Connect: nodeId=8 pin=(kind=2, index=0)

  OutFlow (执行流出): 4 路
    [1] → 复合:获取三实体 [4]       (1119, -340)
    [2] → 复合:标记e技能释放 [12]   (812, 94)
    [3] → 复合:蓄力时间 [29]       (504, -1051)
    [6] → Set Character Skill CD [9]  (1201, -94)

  ── 数据流 ────────────────────────────

  InParam (数据输入): 2 个
    [0] R<T> (T=Entity)
        来源 ← 复合:监听信号 [2] OutParam[0]
        PinRef: kind=3 index=0 | Connect: nodeId=2 pin=(kind=4, index=0)
    [1] L<R<T>> (未连接)

  OutParam (数据输出): 1 个
    [0] (输出结果)
        去向 → 复合:获取三实体 [4] InParam[0]
        去向 → 复合:标记e技能释放 [12] InParam[0]

  ── 名称解析 ──────────────────────────
  nodeId=3 → NODE_PIN_RECORDS → "Multiple Branches"
  InParam[0]: inputs[0]="R<T>"
  InParam[1]: inputs[1]="L<R<T>>"

💡 --raw 以 protobuf 原始格式输出
```

---

## 5. 复合定义展开

```bash
gia 复杂gia/传球.gia --composite "比赛branch" --tree
```

```
┌─ Composite: "职业branch" (ID=1610612908) ──
│  Type: Composite (1000)
│  Impl: acc[26] (8 nodes)
│
│  接口:
│    InFlow[0]:  (未命名)
│    OutFlow[0]: 前锋
│    OutFlow[1]: 中锋
│    OutFlow[2]: 后卫
│    OutFlow[3]: 门将
│    OutFlow[4]: 其他
│    InParam[0]: 条件
│
├─ Impl 图 (8 nodes, 0 exec edges)
│
│  Nodes:
│    [2] Double Branch
│    [4] nid=83 (...)
│    [5] nid=79 (...)
│    [10] nid=169 (...)
│    ...
│
│  注：此 impl 图无 exec 边——可能通过数据流或复合嵌套连接。
│  用 --full 查看 ASCII 渲染。

💡 --composite "顺序执行" --full 查看有 exec 连接的 impl 图
```

---

## 6. 分页 ASCII

```bash
gia 复杂gia/传球.gia --full --page 2 --page-size 500
```

```
传球.gia — 主图 ASCII — Page 2/5 (Y: -841 ~ -341)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  (当前页: 8 个节点, 事件 0 的主干区域)

  ┌─ Get Self Entity ────────┐
  │ n=1  Get Self Entity     │
  │ (356, -470)              │
  └──────────┬───────────────┘
             │ OutFlow
             ▼
  ┌──────────┴───────────────┐
  │ n=2  复合:监听信号        │
  │ (-740, -346)             │
  │ OutParam:事件源实体,...  │
  └──┬───────────┬──────────┘
     │           │
     ▼           ▼
  ┌──┴────────┐ ┌┴───────────┐
  │ n=7      │ │ n=8        │
  │ Multiple │ │ 复合:      │
  │ Branches │ │ 自身实体    │
  │ (-28,    │ │ 条件       │
  │ -346)    │ │ (-385,     │
  │ 4 路分支 │ │ -347)      │
  └──┬───────┘ └────────────┘
     │
     ├── 出口1 → n=4 复合:获取三实体
     ├── 出口2 → n=12 复合:标记e技能释放
     ├── 出口3 → n=29 复合:蓄力时间
     └── 出口6 → n=9 Set Character Skill CD

  Page 2/5 — 用 --page 0/1/3/4 切换
```

---

## 7. 节点分类总览

```
传球.gia 主图 24 节点按角色分类：

事件起点 (3):
  [1] Get Self Entity           → exec 链 8 节点
  [3] When Entity Is Created    → exec 链 7 节点
  [39] When Player Class Changes → exec 链 7 节点

复合调用 (11):
  [2]  复合:监听信号        [4]  复合:获取三实体
  [5]  复合:e技能特效       [8]  复合:自身实体条件
  [11] 复合:标记e技能释放   [12] 复合:标记e技能释放 (副本)
  [29] 复合:蓄力时间         [30] 复合:顺序执行
  [40] 复合:职业branch       [43] 复合:职业branch (副本)
  [52] 复合:职业参数

系统节点 (4):
  [7]  Multiple Branches     (nid=3, 4路分支)
  [9]  Set Character Skill CD (nid=739, 终端节点)
  [20] 3D Vector Zoom         (nid=12, 孤立)
  [n]  ...

数据节点 (3):
  [19] Get Node Graph Variable (nid=337, 为[9]供数)
  [23] Get Node Graph Variable (nid=337, 为[9]供数)
  [n]  ...
```

---

## 8. 命名规则

| 节点类型 | 显示名 | 来源 |
|---------|-------|------|
| **事件起点** | `When Entity Is Created` | `NODE_PIN_RECORDS[nid=71].name` |
| **复合调用** | `复合:监听信号` | `accessories[i].compositeDef.def.name` |
| **标准节点** | `Multiple Branches` | `NODE_PIN_RECORDS[nid=3].name` |
| **数据节点** | `Get Node Graph Variable` | `NODE_PIN_RECORDS[nid=337].name` |
| **未知节点** | `sys({nodeId})` | 回退 |
| **复合 OutFlow 引脚** | `前锋`, `中锋`, ..., 空则`出口1` | `def.outflows[i].name` |
| **复合 InFlow 引脚** | `开始计时`, 空则`执行流入` | `def.inflows[i].name` |
| **复合 InParam 引脚** | `目标实体`, 空则`参数1` | `def.inputs[i].name` |
| **复合 OutParam 引脚** | `物理引擎实体`, 空则`结果1` | `def.outputs[i].name` |
| **数据引脚（标准节点）** | `R<T>`, `L<R<T>>` | `NODE_PIN_RECORDS.inputs/outputs[i]` |
| **非复合 OutFlow** | `出口1`, `出口2`, ... | 按 index 自动编号 |
| **非复合 InFlow** | `执行流入` | 固定 |
