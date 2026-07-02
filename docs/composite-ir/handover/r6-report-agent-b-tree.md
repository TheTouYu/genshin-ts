# 传球.gia — 数据流分析报告（树格式 B）

> 使用 trace-dataflow.ts 默认树格式模式（`--max-depth 0 --all-params`）  
> 生成时间: 2026-07-02  
> 分析Agent: **B** (树格式)

---

## 文件概览

| 属性 | 值 |
|---|---|
| 文件 | `传球.gia` |
| 主图节点数 | 24 |
| 复合定义总数 | 15 |
| 复合内含 impl 图 | 11 (4个系统内建复合为 0 节点) |
| 总复合调用点 | 16 |

---

## T1: 主图数据流映射

### n=1 Get Self Entity

终端节点（获取自身实体，事件上下文）。无 InParam。

---

### n=2 Composite:监听信号

监听信号复合。系统内建，0 impl 节点。

```
InParam: 无
OutParam[0] "事件源实体"     → n=8 自身实体条件 (未使用)
OutParam[1] "事件源GUID"     → (未连接)
OutParam[2] "信号来源实体"   → n=8 InParam[0] "自身实体"
OutParam[3] "r"              → n=20 InParam[0] "Vec"
OutParam[4] "位置"           → (未连接)
OutParam[5] "参数"           → (未连接)
OutParam[6] "事件"           → n=7 InParam[0] "R<T>" (条件值)
OutParam[7] "d"              → (未连接)
OutParam[8] "角色实体"       → (未连接)
```

信号来源实体 = 发出信号的实体。事件类型 = 信号携带的事件字符串。r = 信号载荷（方向/位置向量）。

---

### n=3 When Entity Is Created

事件上下文节点。当实体创建时触发。无 InParam。

执行流: `OutFlow[0] → n=40 (职业branch)`

---

### n=4 Composite:获取三实体

读取 3 个图变量，无 InParam。

```
OutParam[0] "物理引擎实体"  ← impl n=10 GetNodeGraphVar "物理引擎实体"
OutParam[1] "挂载实体"      ← impl n=12 GetNodeGraphVar "挂载实体"
OutParam[2] "运动实体"      ← impl n=11 GetNodeGraphVar "运动实体"
```

注: impl 节点索引与 OutParam 索引不一一对应（compositePins 映射）。

---

### n=5 Composite:e技能特效

执行流入口复合。无 InParam。

```
InFlow: ← n=30 OutFlow[0]
Impl:
  n=31 MountLoopingSpecialEffect(自身实体, "GI_RootNode", Flt=1)
  n=32 Composite:[时间]定时器设置与触发(自身实体, "清楚", 定时器时间=1, 不循环)
    └── OutFlow[0] → n=44 ClearLoopingSpecialEffect(自身实体)
  └── OutFlow[1] → (未连接)
```

---

### n=7 Multiple Branches

事件分发路由器。

```
InParam[0] "R<T>"          (条件值=[事件类型字符串])
  <- n=2  复合:监听信号  OutParam[6] "事件"

InParam[1] "L<R<T>>"       (条件列表=6个事件名)
  = [6 items]
    [0] "短传球-自动方向"
    [1] "短传球-朝向方向"
    [2] "e技能"
    [3] "传球特效"
    [4] "接球重置传球cd"
    [5] "恢复e技能cd"
```

**分支路由:**

| 条件索引 | 事件名 | OutFlow | 目标 |
|---|---|---|---|
| 0 | "短传球-自动方向" | 0 | (未连接) |
| 1 | "短传球-朝向方向" | 1 | n=9 SetCharacterSkillCD |
| 2 | "e技能" | 2 | n=9 SetCharacterSkillCD |
| 3 | "传球特效" | 3 | n=29 蓄力时间 |
| 4 | "接球重置传球cd" | 4 | (未连接) |
| 5 | "恢复e技能cd" | 5 | (未连接) |
| — | 默认(无匹配) | 6 | n=9 SetCharacterSkillCD |

---

### n=8 Composite:自身实体条件

检查信号来源实体是否等于自身实体。

```
InParam[0] "自身实体"
  <- n=2  复合:监听信号  OutParam[2] "信号来源实体"

Impl:
  n=4 DoubleBranch  ← n=5 Equal(父输入"自身实体", n=7 GetSelfEntity)
  └── OutFlow[0] "是" → n=7 (MultipleBranches)
  └── OutFlow[1] "否" → (停止, 无出口)
```

---

### n=9 Set Character Skill CD

设置角色技能冷却时间。

```
InParam[0] "Ety"     (实体)
  <- n=1  Get Self Entity  OutParam[0]  (获取自身实体)

InParam[1] "E<30>"   (技能槽)
  = enum=3111

InParam[2] "Flt"     (CD时长)
  <- n=12  复合:标记e技能释放  OutParam[0] "获取cd"

InParam[3] "Bol"     (启用)
  = enum=1 (true)
```

---

### n=11 Composite:标记e技能释放 (调用点1)

```
InParam[0] "cd"
  = 12
```

CD = 12 秒。

---

### n=12 Composite:标记e技能释放 (调用点2)

```
InParam[0] "cd"
  = 12
```

CD = 12 秒。

---

### n=19 Get Node Graph Variable

```
InParam[0] "变量名"
  = "传球实体"
```

读取图变量"传球实体"。

---

### n=20 3D Vector Zoom

向量缩放——将信号方向向量乘以传球速度得到最终传球速度向量。

```
InParam[0] "Vec"     (方向向量)
  <- n=2  复合:监听信号  OutParam[3] "r"

InParam[1] "Flt"     (缩放系数=速度)
  <- n=52  复合:职业参数  OutParam[0] "传球速度"
```

---

### n=23 Get Node Graph Variable

```
InParam[0] "变量名"
  = "传球实体"
```

与 n=19 相同，读取图变量"传球实体"。

---

### n=29 Composite:蓄力时间

蓄力时间判断。根据蓄力时长触发不同分支。

```
InParam[0] "异常"    (异常阈值)
  = 2

InParam[1] "右值"    (蓄力段1阈值)
  = 0.8

InParam[2] "右值"    (蓄力段2阈值)
  = 0.3

InParam[3] "右值"    (蓄力段3阈值)
  = 0
```

Impl 逻辑: `(currentTimerTime - storedChargeStartTime) >= threshold`

| 分支 | 条件 | 阈值 |
|---|---|---|
| OutFlow[0] "异常" | diff >= 2.0 | InParam[0] |
| OutFlow[1] "是" (蓄力段1) | diff >= 0.8 | InParam[1] |
| OutFlow[2] "是" (蓄力段2) | diff >= 0.3 | InParam[2] |
| OutFlow[3] "是" (蓄力段3) | diff >= 0.0 | InParam[3] |
| OutFlow[4] "否" | 以上都不匹配 | — |

执行流: `n=29 OutFlow[3] (蓄力段3命中) → n=43 (职业branch)`

---

### n=30 Composite:顺序执行

顺序执行器 (5 DoubleBranch 节点链, 所有条件 true)。

```
InFlow: ← n=43 OutFlow[0]
OutFlow[0] → n=5  (e技能特效)
OutFlow[1] → n=11 (标记e技能释放, cd=12)
```

---

### n=39 When Player Class Changes

事件上下文节点。当玩家职业切换时触发。

执行流: `OutFlow[0] → n=40 (职业branch)`

---

### n=40 Composite:职业branch (启动路由)

玩家职业 -> 基础传球速度设置。执行流入口为事件触发。

```
无 InParam

执行路由:
  OutFlow[0] "前锋"   → n=41 SetNodeGraphVar("基础传球速度"=9)
  OutFlow[1] "中锋"   → n=45 SetNodeGraphVar("基础传球速度"=8)
  OutFlow[2] "后卫"   → n=46 SetNodeGraphVar("基础传球速度"=10)
  OutFlow[3] "门将"   → n=47 SetNodeGraphVar("基础传球速度"=12)
  OutFlow[4] "其他"   → n=48 SetNodeGraphVar("基础传球速度"=8)
```

---

### n=43 Composite:职业branch (注入路由)

蓄力完成后的职业检查路由。

```
无 InParam
执行流: ← n=29 OutFlow[3] (蓄力段3)
OutFlow[0] → n=30 (顺序执行)
```

---

### n=41 Set Node Graph Variable

```
InParam[0] "Str"      (变量名)
  = "基础传球速度"

InParam[1] "R<T>"     (值)
  = 9

InParam[2] "Bol"      (是否局部)
  = enum=0 (false)
```

---

### n=45 Set Node Graph Variable

```
InParam[0] = "基础传球速度"
InParam[1] = 8
InParam[2] = enum=0
```

---

### n=46 Set Node Graph Variable

```
InParam[0] = "基础传球速度"
InParam[1] = 10
InParam[2] = enum=0
```

---

### n=47 Set Node Graph Variable

```
InParam[0] = "基础传球速度"
InParam[1] = 12
InParam[2] = enum=0
```

---

### n=48 Set Node Graph Variable

```
InParam[0] = "基础传球速度"
InParam[1] = 8
InParam[2] = enum=0
```

---

### n=52 Composite:职业参数

读取图变量"基础传球速度"。

```
impl n=49 GetNodeGraphVar("基础传球速度")
OutParam[0] "传球速度" → n=20 InParam[1] "Flt"
```

---

## T2: 复合定义展开

### 复合:监听信号 (id=1610612902, compiled=1610612901)

| 属性 | 值 |
|---|---|
| impl 节点数 | 0 (系统内建) |
| 输入 | 无 |
| 输出 | 9 (事件源实体, 事件源GUID, 信号来源实体, r, 位置, 参数, 事件, d, 角色实体) |
| 关联复合 | 发送信号(1610612901), 向服务器节点图发送信号(1610612903) |

**调用点:**

| 位置 | 索引 | 参数 |
|---|---|---|
| 主图 | n=2 | 无参数 |

监听信号是一个系统级信号接收器。其信号名在复合定义外配置（通过游戏的 signalVersion 字段），此处监听"传球"系统信号。

---

### 复合:获取三实体 (id=1610612905, compiled=1610612872)

impl 图: 3 节点

| 内部节点 | nid | 类型 | 读取变量 | 映射 OutParam |
|---|---|---|---|---|
| n=10 | 337 | Get Node Graph Variable | "物理引擎实体" | OutParam[0] "物理引擎实体" |
| n=11 | 337 | Get Node Graph Variable | "运动实体" | OutParam[2] "运动实体" |
| n=12 | 337 | Get Node Graph Variable | "挂载实体" | OutParam[1] "挂载实体" |

**调用点:**

| 位置 | 索引 |
|---|---|
| 主图 | n=4 |

---

### 复合:e技能特效 (id=1610612956, compiled=1610612896)

| 属性 | 值 |
|---|---|
| impl 节点数 | 4 |
| 输入 | 无 |
| 输出 | 无 |

impl 图节点:

| 索引 | nid | 类型 | 详情 |
|---|---|---|---|
| n=31 | 94 | Mount Looping Special Effect | Ety=n33 SelfEntity, Str="GI_RootNode", Flt=1 |
| n=32 | 1073742225 | [时间]定时器设置与触发 (复合) | Ety=n33, 名称="清楚", 时间=1, 不循环 |
| n=33 | 73 | Get Self Entity | 终端 |
| n=44 | 95 | Clear Looping Special Effect | Ety=n33 (触发出力清除特效) |

**执行流程:**
```
InFlow[0]
  → n=31 MountLoopingSpecialEffect(自身实体)
  → n=32 Timer(1秒, 不循环)
    → [触发时] n=44 ClearLoopingSpecialEffect(自身实体)
    → [后续] (未连接)
```

**调用点:**

| 位置 | 索引 |
|---|---|
| 主图 | n=5 (← n=30 OutFlow[0]) |

---

### 复合:[时间]定时器设置与触发 (id=1073742225, compiled=1073742252)

| 属性 | 值 |
|---|---|
| impl 节点数 | 5 |
| 输入 | 4: 目标实体, 定时器名称, 定时器时间, 是否循环 |
| 输出 | 无 |

impl 图节点:

| 索引 | nid | 类型 | 数据流 |
|---|---|---|---|
| n=2 | 14 | Equal | 比较 父输入"定时器名称" vs n=4 WhenTimerIsTriggered |
| n=4 | 83 | When Timer Is Triggered | 事件上下文 |
| n=5 | 79 | Start Timer | Ety=父输入, 名称=父输入, 循环=父输入, 时间=n10 AssemblyList |
| n=10 | 169 | Assembly List | [父输入"定时器时间", 0, 0, ..., 0] (100元素) |
| n=14 | 2 | Double Branch | 执行流控制 |

**内部数据流:**
```
StartTimer.时间(类型=[Float])
  ← AssemblyList
    InParam[1] ← 父输入"定时器时间"
    InParam[2..99] = 0 (99个0占位)
```

**调用点:**

| 位置 | 索引 | 参数值 |
|---|---|---|
| e技能特效 | n=32 | 目标实体=n33, 名称="清楚", 时间=1, 不循环=0 |

---

### 复合:自身实体条件 (id=1610612834, compiled=1610612816)

| 属性 | 值 |
|---|---|
| impl 节点数 | 3 |
| 输入 | 1: 自身实体 |
| 输出 | 无 (仅 OutFlow) |

impl 图节点:

| 索引 | nid | 类型 | 数据流 |
|---|---|---|---|
| n=4 | 2 | Double Branch | 条件 ← n=5 Equal |
| n=5 | 14 | Equal | In[0]=父输入"自身实体" vs In[1]=n=7 SelfEntity |
| n=7 | 73 | Get Self Entity | 终端 |

**内部数据流:**
```
DoubleBranch.Bol
  ← Equal
    InParam[0] "R<T>"
      ← 父输入 "自身实体条件"."自身实体"
    InParam[1] "R<T>"
      ← n=7 Get Self Entity
```

**调用点:**

| 位置 | 索引 | 参数值 |
|---|---|---|
| 主图 | n=8 | 自身实体 = n=2 监听信号.信号来源实体 |

---

### 复合:标记e技能释放 (id=1610612909, compiled=1610612876)

| 属性 | 值 |
|---|---|
| impl 节点数 | 9 |
| 输入 | 1: cd (float) |
| 输出 | 1: 获取cd (float) |

impl 图节点:

| 索引 | nid | 类型 | 数据流 |
|---|---|---|---|
| n=1 | 22 | Set Custom Variable | Ety=n2, "e技能时间标记", 值=n17(计时器当前时间 + cd), 持久化 |
| n=2 | 73 | Get Self Entity | 终端 |
| n=3 | 50 | Get Custom Variable | 读取"e技能时间标记" (已存的时间戳) |
| n=4 | 73 | Get Self Entity | 终端 |
| n=5 | 1073742219 | [时间]获取关卡计时器时间(1) (复合) | 获取当前关卡计时器时间 |
| n=6 | 202 | Subtraction | 已存时间 - 当前时间 |
| n=7 | 211 | Take Larger Value | max(剩余时间, 0) → **OutParam[0] "获取cd"** |
| n=16 | 1073742219 | [时间]获取关卡计时器时间(1) (复合) | 获取当前关卡计时器时间 |
| n=17 | 200 | Addition | 当前时间 + cd → n=1 Set |

**CD 计算逻辑:**
```
当前时间 = [时间]获取关卡计时器时间(1).当前时间
记录时间 = 当前时间 + cd (父输入)  → 存入变量"e技能时间标记"
剩余CD  = max(已存记录 - 当前时间, 0)
输出: 剩余CD
```

**调用点:**

| 位置 | 索引 | 参数值 |
|---|---|---|
| 主图 | n=11 | cd=12 |
| 主图 | n=12 | cd=12 |
| 顺序执行 | n=30 OutFlow[1] → n=11 | cd=12 |

---

### 复合:蓄力时间 (id=1610612907, compiled=1610612874)

| 属性 | 值 |
|---|---|
| impl 节点数 | 9 |
| 输入 | 4: 异常=2, 右值=0.8, 右值=0.3, 右值=0 |
| 输出 | 1: 蓄力时间 (未在数据流中使用) |

impl 图节点:

| 索引 | nid | 类型 | 数据流 |
|---|---|---|---|
| n=1 | 233 | Greater Than or Equal To | (timer - storedTime) >= 0.8 |
| n=4 | 73 | Get Self Entity | 终端 |
| n=11 | 50 | Get Custom Variable | 读取"开始蓄力时间"(Ety=n4) |
| n=12 | 1073741831 | [时间]获取关卡计时器时 (复合) | 获取当前时间 ("Update") |
| n=13 | 202 | Subtraction | 计时器时间 - 开始蓄力时间 (蓄力时长) |
| n=17 | 1610612800 | 条件branch (复合) | 4条件判断链 |
| n=18 | 233 | Greater Than or Equal To | (timer - storedTime) >= 2.0 (异常) |
| n=25 | 233 | Greater Than or Equal To | (timer - storedTime) >= 0.3 |
| n=26 | 233 | Greater Than or Equal To | (timer - storedTime) >= 0 |

**内部数据流 (diff = currentTime - storedChargeStart):**

```
条件branch.条件[0] ← n=18 (diff >= 2.0)   异常  → OutFlow[0]
条件branch.条件[1] ← n=1  (diff >= 0.8)   段1   → OutFlow[1]
条件branch.条件[2] ← n=25 (diff >= 0.3)   段2   → OutFlow[2]
条件branch.条件[3] ← n=26 (diff >= 0.0)   段3   → OutFlow[3]
默认                                              → OutFlow[4] "否"
```

**调用点:**

| 位置 | 索引 | 参数值 |
|---|---|---|
| 主图 | n=29 | 异常=2, 右值=0.8, 右值=0.3, 右值=0 |

---

### 复合:条件branch (id=1610612800, compiled=1610612794)

| 属性 | 值 |
|---|---|
| impl 节点数 | 4 (全部 Double Branch) |
| 输入 | 4: 条件×4 |
| 输出 | 无 (仅 OutFlow: [0-3]"是" + [4]"否") |

impl 图: 4 个 Double Branch 链式判断。

| 索引 | nid | 类型 | 数据源 |
|---|---|---|---|
| n=32 | 2 | Double Branch | ← 父输入"条件"[0] |
| n=34 | 2 | Double Branch | ← 父输入"条件"[1] |
| n=33 | 2 | Double Branch | ← 父输入"条件"[2] |
| n=2 | 2 | Double Branch | ← 父输入"条件"[3] |

**执行逻辑:** 条件[0]→[1]→[2]→[3] 依次尝试, 首个为 true 的触发对应 OutFlow。全为 false → OutFlow[4] "否"。

**调用点:**

| 位置 | 索引 | 参数 |
|---|---|---|
| 蓄力时间 | n=17 | 条件[0]=n18≥2.0, 条件[1]=n1≥0.8, 条件[2]=n25≥0.3, 条件[3]=n26≥0 |
| 职业branch | n=38 | 条件[0]=n37(前锋), 条件[1]=n39(中锋), 条件[2]=n40(后卫), 条件[3]=n41(门将) |

---

### 复合:顺序执行 (id=1073741912, compiled=1073741922)

| 属性 | 值 |
|---|---|
| impl 节点数 | 5 (全部 Double Branch, 条件=true) |
| 输入/输出 | 无 |

5 个 Double Branch 全部条件 = true, 依次触发 OutFlow[0..3] 形成顺序执行。

**调用点:**

| 位置 | 索引 |
|---|---|
| 主图 | n=30 |

---

### 复合:职业branch (id=1610612908, compiled=1610612875)

| 属性 | 值 |
|---|---|
| impl 节点数 | 8 |
| 输入 | 无 |
| 输出 | 无 (仅 5 OutFlow) |

impl 图节点:

| 索引 | nid | 类型 | 数据流 |
|---|---|---|---|
| n=34 | 259 | GetPlayerEntity | n=36 GetSelfEntity |
| n=35 | 387 | Query Player Class | n=34 玩家实体 |
| n=36 | 73 | Get Self Entity | 终端 |
| n=37 | 14 | Equal | n=35 vs (预设值=前锋) |
| n=38 | 1610612800 | 条件branch (复合) | 4 条件 chain |
| n=39 | 14 | Equal | n=35 vs (预设值=中锋) |
| n=40 | 14 | Equal | n=35 vs (预设值=后卫) |
| n=41 | 14 | Equal | n=35 vs (预设值=门将) |

**执行逻辑:**
```
GetSelfEntity → GetPlayerEntity → QueryPlayerClass
  Equal(结果, 前锋?) → 条件branch.条件[0]
  Equal(结果, 中锋?) → 条件branch.条件[1]
  Equal(结果, 后卫?) → 条件branch.条件[2]
  Equal(结果, 门将?) → 条件branch.条件[3]
  → [前锋] OutFlow[0]  [中锋] OutFlow[1]  [后卫] OutFlow[2]  [门将] OutFlow[3]  [其他] OutFlow[4]
```

**调用点:**

| 位置 | 索引 | 上下文 |
|---|---|---|
| 主图 | n=40 | 事件触发(实体创建/职业切换)→设置初始速度 |
| 主图 | n=43 | 蓄力完成→重新路由到顺序执行 |

---

### 复合:职业参数 (id=1610612936, compiled=1610612880)

| 属性 | 值 |
|---|---|
| impl 节点数 | 1 |
| 输入 | 无 |
| 输出 | 1: 传球速度 |

impl:
```
n=49 GetNodeGraphVar("基础传球速度") → OutParam[0] "传球速度"
```

**调用点:**

| 位置 | 索引 |
|---|---|
| 主图 | n=52 (→ n=20 3DVectorZoom.Flt) |

---

### 复合:[时间]获取关卡计时器时间(1) (id=1073742219, compiled=1073742246)

| 属性 | 值 |
|---|---|
| impl 节点数 | 2 |
| 输入 | 无 |
| 输出 | 1: 当前时间 |

impl:
```
n=9  [查询]获取关卡实体(GUID预设值).实体
n=10 GetCurrentGlobalTimerTime(n=9实体, "Update") → OutParam[0] "当前时间"
```

**调用点:**

| 位置 | 索引 |
|---|---|
| 标记e技能释放 | n=5, n=16 |

---

### 复合:[时间]获取关卡计时器时 (id=1073741831, compiled=1073741841)

| 属性 | 值 |
|---|---|
| impl 节点数 | 2 |
| 输入 | 无 |
| 输出 | 1: 当前时间 |

impl:
```
n=1  QueryEntityByGUID(预设值).实体
n=10 GetCurrentGlobalTimerTime(n=1实体, "Update") → OutParam[0] "当前时间"
```

**调用点:**

| 位置 | 索引 |
|---|---|
| 蓄力时间 | n=12 |

---

### 复合:[查询]获取关卡实体 (id=1073742220, compiled=1073742247)

| 属性 | 值 |
|---|---|
| impl 节点数 | 1 |
| 输入 | 无 |
| 输出 | 1: 实体 |

impl:
```
n=1 QueryEntityByGUID(预设值) → OutParam[0] "实体"
```

**调用点:**

| 位置 | 索引 |
|---|---|
| [时间]获取关卡计时器时间(1) | n=9 |

---

## T3: 数据流架构总结

### 数据通路汇总

```
图变量 "基础传球速度" ← 职业路由 ← 玩家职业
  ↑                       └─ n=41 (前锋=9)
  |                        └─ n=45 (中锋=8)  
  |                        └─ n=46 (后卫=10)
  |                        └─ n=47 (门将=12)
  |                        └─ n=48 (其他=8)
  |
  └── 职业参数 ── n=20 (3DVectorZoom.Flt) ── 传球速度向量
                                     ↑
信号 "r" (方向向量) ── 监听信号 ── n=20 (3DVectorZoom.Vec)

图变量 "传球实体" ← n=19, n=23 (读取)
图变量 "物理引擎实体" ← 获取三实体
图变量 "挂载实体"    ← 获取三实体
图变量 "运动实体"    ← 获取三实体
```

**入口类型:**

| 类型 | 数量 | 来源 |
|---|---|---|
| 图变量入口 | 5 | "传球实体", "物理引擎实体", "挂载实体", "运动实体", "基础传球速度" |
| 字面值 | 10+ | 事件列表, CD=12, 阈值, 速度值, 字符串 |
| 事件上下文 | 3 | SelfEntity, WhenEntityCreated, WhenPlayerClassChanges |
| 系统内建 (监听信号) | 1 | 信号载荷(r, 事件类型, 来源实体) |
| 复合输入直通 | 6 | 自身实体条件, 标记e技能释放×2, 蓄力时间×4 |

### 交叉引用表

| 复合 | 调用图 | 调用节点 |
|---|---|---|
| 监听信号 | 主图 | n=2 |
| 获取三实体 | 主图 | n=4 |
| e技能特效 | 主图 | n=5 |
| 自身实体条件 | 主图 | n=8 |
| 标记e技能释放 | 主图 | n=11, n=12 |
| 蓄力时间 | 主图 | n=29 |
| 顺序执行 | 主图 | n=30 |
| 职业branch | 主图 | n=40, n=43 |
| 职业参数 | 主图 | n=52 |
| [时间]定时器设置与触发 | e技能特效 | n=32 |
| [时间]获取关卡计时器时间(1) | 标记e技能释放 | n=5, n=16 |
| [时间]获取关卡计时器时 | 蓄力时间 | n=12 |
| [查询]获取关卡实体 | [时间]获取关卡计时器时间(1) | n=9 |
| 条件branch | 蓄力时间、职业branch | n=17, n=38 |

### 架构模式

1. **事件驱动-信号路由**:
   - 监听信号(系统信号) → 自身实体条件(过滤) → MultipleBranches(按事件类型分发)
   - 这是系统的核心入口，所有传球相关操作都由信号触发

2. **启动初始化**:
   - WhenEntityCreated / WhenPlayerClassChanges → 职业branch → Set基础速度×5
   - 实体创建/职业切换时初始化速度参数

3. **并行执行链**:
   - 蓄力时间 OutFlow[3] → 职业branch → 顺序执行 → [e技能特效 || 标记e技能释放]
   - 蓄力判断后同时触发特效显示和CD标记

4. **复合包装模式**:
   - 系统内建复合: 监听信号, 发送信号 (0 impl nodes, game built-in)
   - 纯数据复合: 获取三实体, 职业参数 (仅读取图变量)
   - 纯控制流复合: 自身实体条件, 顺序执行, 条件branch
   - 混合复合: 标记e技能释放, 蓄力时间 (数据+控制流)

5. **扇入扇出**:
   - 扇出: 监听信号 → 自身实体条件(控制流) + MultipleBranches(事件类型) + 3DVectorZoom(向量载荷)
   - 扇入: SetCharacterSkillCD 有 3 个分支(OutFlow[1], [2], [6])汇入

### 链深度统计

| 数据链 | 最大深度 | 完整显示 |
|---|---|---|
| 监听信号 → MultipleBranches → SetCD | 2 | 不需要 max-depth 0 |
| 监听信号 → 自身实体条件(impl) | 3 | 不需要 |
| 标记e技能释放(impl) → 计时器时间 | 3 | 不需要 |
| 蓄力时间(impl) → 条件branch | 4 | 不需要 |
| 职业branch(impl) → 条件branch | 5 | 需要 |
| 职业branch → 条件branch (nested) | 3 | 不需要 |

**所有链深度 ≤ 5，默认深度(5)和 --max-depth 0 均能完整显示，无截断点。**

### 与 r4-passball-impl.md 的一致性

| 条目 | r4-passball-impl.md 记录 | 实际发现 | 一致? |
|---|---|---|---|
| 顺序执行 4 分支 | 4 OutFlow 各为 "是" | 4 branches, all true | 一致 |
| 自身实体条件 | 3 节点: DB+Equal+Self | 3 节点, 符合 | 一致 |
| 职业branch | 8 节点, 职业匹配 | 8 节点, 4 Equal+条件branch | 一致 |
| 蓄力时间 | 9 节点, 4 段 | 9 节点, 4 Greater≥+条件branch | 一致 |
| e技能特效 | 4 节点, 挂载+定时器+清除 | 4 节点, 挂载+定时器+清除+Self | 一致 |
| 标记e技能释放 | 9 节点, SetVar+计算CD | 9 节点, SetVar+Sub+Max+Add | 一致 |
| 职业参数 | 1 节点读取图变量 | 1 节点 GetNodeGraphVar | 一致 |
| 条件branch | 4 DB 链式 | 4 DB 链式 | 一致 |
| 获取三实体 | 3 读取图变量 | 3 读取 "物理引擎""运动""挂载" | 一致 |
| 信号事件列表 | 未记录 | "短传球-自动方向"等 6 个事件 | 新发现 |
| 主图 24 节点 | 未完整记录 | 完整映射 (T1) | 补充 |
| CD 计算细节 | 仅 "SetVar + GetVar + Sub + Add" | 实际: Addition(当前时间+cd)→存储; Subtraction(已存-当前)→TakeLarger( ,0)→输出 | 精确化 |

**关键新发现（r4 文档未记录）:**

1. **Multiple Branches 的 6 个条件事件** — 定义了系统可处理的传球相关事件类型
2. **"短传球-自动方向"和"接球重置传球cd"/"恢复e技能cd"事件无连接** — 这些事件类型已注册但当前 impl 未分配处理逻辑
3. **蓄力时间 OutFlow[3] 反馈到职业branch** — 蓄力完成后需要重新检测职业，再进入顺序执行（确保蓄力期间职业未变化）
4. **SetCharacterSkillCD 有多达 3 个分支汇入** — "短传球-朝向方向"、"e技能"、默认分支都触发 CD 设置

---

## 工具使用统计

| 操作 | 调用次数 |
|---|---|
| 主图 trace (`--all-params --max-depth 0`) | 20 |
| 复合 impl trace (`-c <name> --all-params --max-depth 0`) | 43 |
| Node.js 辅助查询 | 7 |
| **合计 trace 命令** | **63** |

注: 多次 trace 通过 `&&` 批量执行，实际 shell 调用次数少于单次计数。

## 工具学习

- 树格式输出直观，适合人工阅读
- `--max-depth 0` 确保无截断，本文件链深度 ≤ 5 所以无影响
- 复合父输入直通显示为 `← 父输入 "xxx"."yyy"` 格式，清晰标记
- `[上层调用]` 块自动显示复合的调用链，对理解嵌套复合极有帮助
- `--all-params` 对 Assembly List 等节点会展开全部参数（100+ 行），建议对常规节点使用
