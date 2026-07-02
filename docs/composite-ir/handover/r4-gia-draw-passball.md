# 传球.gia 完整绘制 · 上下文与参考资料

> **目标**：一步步完全绘制 `复杂gia/传球.gia` 的全部细节，包括所有节点、所有 exec 连接、所有数据连接、复合展开。
> **用途**：产出文档后，基于此重新设计可视化工具。

---

## 一、文件信息

| 项目 | 值 |
|------|----|
| 路径 | `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/传球.gia` |
| 大小 | 21,292 bytes |
| 主图节点 | 24 个 |
| Accessories | 29 个 (13 复合定义 + 15 实现图 + 1 其他) |
| exec 边 | 17 条 |
| Y 范围 | -1841 ~ 504 (2345px) |
| 已知事件 | When Entity Is Created (nid=71, n=3), When Player Class Changes (nid=385, n=39) |
| 孤立 exec 起点 | Get Self Entity (nid=73, n=1) — 非事件，是数据节点 |

**已复制到游戏目录**：直接打开游戏可查看。

---

## 二、主图节点完整数据

### 节点总表

```
n=1   Get Self Entity              nid=73   kind=22000  x=  356 y= -470
n=2   (复合:监听信号)              nid=1610612902       x= -740 y= -346
n=3   When Entity Is Created       nid=71   kind=22000  x= -829 y=-1414
n=4   (复合:获取三实体)            nid=1610612905       x= 1119 y= -340
n=5   (复合:e技能特效)             nid=1610612956       x= 1651 y=-1200
n=7   Multiple Branches            nid=3    kind=22000  x=  -28 y= -346
n=8   (复合:自身实体条件)          nid=1610612834       x= -385 y= -347
n=9   Set Character Skill CD       nid=739  kind=22000  x= 1201 y=  -94
n=11  (复合:标记e技能释放)         nid=1610612909       x= 1846 y=-1105
n=12  (复合:标记e技能释放)         nid=1610612909       x=  812 y=   94
n=19  Get Node Graph Variable      nid=337  kind=22000  x= 1955 y=   60
n=20  3D Vector Zoom               nid=12   kind=22000  x= -295 y=  420
n=23  Get Node Graph Variable      nid=337  kind=22000  x= 1947 y= -178
n=29  (复合:蓄力时间)              nid=1610612907       x=  504 y=-1051
n=30  (复合:顺序执行)              nid=1073741912       x= 1338 y=-1164
n=39  When Player Class Changes    nid=385  kind=22000  x= -657 y=-1701
n=40  (复合:职业branch)            nid=1610612908       x= -392 y=-1733
n=41  Set Node Graph Variable      nid=323  kind=22000  x=   56 y=-1841
n=43  (复合:职业branch)            nid=1610612908       x= 1068 y=-1039
n=45  Set Node Graph Variable      nid=323  kind=22000  x=  312 y=-1791
n=46  Set Node Graph Variable      nid=323  kind=22000  x=  559 y=-1701
n=47  Set Node Graph Variable      nid=323  kind=22000  x=  -19 y=-1525
n=48  Set Node Graph Variable      nid=323  kind=22000  x= -347 y=-1377
n=52  (复合:职业参数)              nid=1610612936       x= -490 y=  504
```

### 复合调用节点 ↔ 复合定义映射

nid >= 1,000,000,000 → 复合调用，查 `accessories[i].compositeDef.inner.def`：

| 主图节点 | compositeId | 复合定义名 | accessories 索引 |
|---------|------------|-----------|----------------|
| n=2     | 1610612902 | 监听信号 | acc[0] |
| n=4     | 1610612905 | 获取三实体 | acc[3] |
| n=5     | 1610612956 | e技能特效 | acc[5] |
| n=8     | 1610612834 | 自身实体条件 | acc[9] |
| n=11    | 1610612909 | 标记e技能释放 | acc[11] |
| n=12    | 1610612909 | 标记e技能释放 | acc[11] (同上) |
| n=29    | 1610612907 | 蓄力时间 | acc[17] |
| n=30    | 1073741912 | 顺序执行 | acc[23] |
| n=40    | 1610612908 | 职业branch | acc[25] |
| n=43    | 1610612908 | 职业branch | acc[25] (同上) |
| n=52    | 1610612936 | 职业参数 | acc[27] |

### exec 连接（OutFlow pin, kind=2）

```
n=1  OutFlow[0] → n=2
n=2  OutFlow[0] → n=8
n=3  OutFlow[?] → n=40
n=7  OutFlow[1] → n=9
n=7  OutFlow[2] → n=12
n=7  OutFlow[3] → n=29
n=7  OutFlow[6] → n=4
n=8  OutFlow[0] → n=7
n=29 OutFlow[?] → n=43
n=30 OutFlow[?] → n=5
n=30 OutFlow[?] → n=11
n=39 OutFlow[?] → n=40
n=40 OutFlow[?] → n=41
n=40 OutFlow[?] → n=45
n=40 OutFlow[?] → n=46
n=40 OutFlow[?] → n=47
n=40 OutFlow[?] → n=48
n=43 OutFlow[?] → n=30
```

**注意**：部分 OutFlow index 值在 protobuf 中不连续（如 n=7 的 index=1,2,3,6）。游戏内编辑器界面中这些可能是命名分支。

### 数据连接（InParam pin, kind=3）

从节点 `n=7 Multiple Branches` 确认的数据连接：

```
n=7 InParam[0] ← n=2 OutParam[0]   (R<T>, T=Entity)
n=7 InParam[1] (未连接)            (L<R<T>>)
```

从节点 `n=9 Set Character Skill CD` 的数据连接（待确认）：

```
n=9 InParam[?] ← n=19 OutParam[?]  (Get Node Graph Variable)
n=9 InParam[?] ← n=23 OutParam[?]  (Get Node Graph Variable)
```

---

## 三、复合定义接口详情（附属在 accessories 中）

### acc[0] "监听信号"
```
OutFlow[0]: (未命名) → 渲染为"出口1"
OutParam[0]: 事件源实体    (type=Entity)
OutParam[1]: 事件源GUID    (type=GUID)
OutParam[2]: 信号来源实体  (type=Entity)
OutParam[3]: r
OutParam[4]: 位置
OutParam[5]: 参数
OutParam[6]: 事件
OutParam[7]: d
OutParam[8]: 角色实体      (type=Entity)
Impl 图: acc[4] (3 节点: GetNodeGraphVariable ×3)
```

### acc[1] "发送信号"
```
InFlow[0]:  (未命名)
OutFlow[0]: (未命名)
InParam[0]: r
InParam[1]: 位置
InParam[2]: 参数
InParam[3]: 事件
InParam[4]: d
InParam[5]: 角色实体
```

### acc[2] "向服务器节点图发送信号"
```
InFlow[0]:  (未命名)
OutFlow[0]: (未命名)
InParam[0..5]: r, 位置, 参数, 事件, d, 角色实体
```

### acc[3] "获取三实体"（纯数据复合）
```
OutParam[0]: 物理引擎实体  (type=Entity)
OutParam[1]: 挂载实体      (type=Entity)
OutParam[2]: 运动实体      (type=Entity)
Impl 图: acc[4] (3 节点)
```

### acc[5] "e技能特效"
```
InFlow[0]: 前锋
```

### acc[7] "[时间]定时器设置与触发"
```
InFlow[0]:  (未命名)
OutFlow[0]: 触发时动作
OutFlow[1]: 后续动作
InParam[0]: 目标实体     (type=Entity)
InParam[1]: 定时器名称
InParam[2]: 定时器时间
InParam[3]: 是否循环
Impl 图: acc[8] (5 节点)
```

### acc[9] "自身实体条件"
```
InFlow[0]:  (未命名)
OutFlow[0]: 是
InParam[0]: 自身实体    (type=Entity)
Impl 图: acc[10] (3 节点)
```

### acc[11] "标记e技能释放"
```
InFlow[0]: 开始计时
OutFlow[0]: (未命名)
InParam[0]: cd
OutParam[0]: 获取cd
Impl 图: acc[12] (9 节点)
```

### acc[13] "[时间]获取关卡计时器时间(1)"（纯数据）
```
OutParam[0]: 当前时间
Impl 图: acc[14] (2 节点)
```

### acc[15] "[查询]获取关卡实体"（纯数据）
```
OutParam[0]: 实体
Impl 图: acc[16] (1 节点)
```

### acc[17] "蓄力时间"
```
InFlow[0]:  (未命名)
OutFlow[0]: 异常
OutFlow[1]: 是
OutFlow[2]: 是
OutFlow[3]: 是
OutFlow[4]: 否
InParam[0]: 异常
InParam[1]: 右值
InParam[2]: 右值
InParam[3]: 右值
OutParam[0]: 蓄力时间
Impl 图: acc[18] (9 节点)
```

### acc[19] "[时间]获取关卡计时器时"（纯数据）
```
OutParam[0]: 当前时间
Impl 图: acc[20] (2 节点)
```

### acc[21] "条件branch"
```
InFlow[0]:  (未命名)
OutFlow[0]: 是
OutFlow[1]: 是
OutFlow[2]: 是
OutFlow[3]: 是
OutFlow[4]: 否
InParam[0]: 条件
InParam[1]: 条件
InParam[2]: 条件
InParam[3]: 条件
Impl 图: acc[22] (4 节点, 3 exec 边)
```

### acc[23] "顺序执行"
```
InFlow[0]:  (未命名)
OutFlow[0]: 是
OutFlow[1]: 是
OutFlow[2]: 是
OutFlow[3]: 是
Impl 图: acc[24] (5 节点, 4 exec 边)
```
Impl 图结构：
```
[2] Double Branch → [3] Print String
                  → [4] Print String
                  → [5] Print String
                  → [6] Print String
```

### acc[25] "职业branch"
```
InFlow[0]:  (未命名)
OutFlow[0]: 前锋
OutFlow[1]: 中锋
OutFlow[2]: 后卫
OutFlow[3]: 门将
OutFlow[4]: 其他
InParam[0]: 条件
Impl 图: acc[26] (8 节点, 0 exec 边？)
```

### acc[27] "职业参数"（纯数据）
```
OutParam[0]: 传球速度
Impl 图: acc[28] (1 节点)
```

---

## 四、exec 链拓扑（3 条链）

### 链 1（从 n=3 When Entity Is Created 开始）

```
n=3   When Entity Is Created         ( -829,-1414)  ← 事件根
└── n=40 复合:职业branch             (-392,-1733)  ← 5 路分支
    ├── n=41 Set Node Graph Variable  (   56,-1841)
    ├── n=45 Set Node Graph Variable  (  312,-1791)
    ├── n=46 Set Node Graph Variable  (  559,-1701)
    ├── n=47 Set Node Graph Variable  (  -19,-1525)
    └── n=48 Set Node Graph Variable  ( -347,-1377)
```

### 链 2（从 n=39 When Player Class Changes 开始）

```
n=39  When Player Class Changes      ( -657,-1701)  ← 事件根
└── n=40 复合:职业branch             (-392,-1733)  ← 合并于链 1
    ├── n=41 Set Node Graph Variable  (   56,-1841)
    ├── n=45 Set Node Graph Variable  (  312,-1791)
    ├── n=46 Set Node Graph Variable  (  559,-1701)
    ├── n=47 Set Node Graph Variable  (  -19,-1525)
    └── n=48 Set Node Graph Variable  ( -347,-1377)
```

### 链 3（从 n=1 Get Self Entity 开始）— 非事件起点

```
n=1   Get Self Entity                (  356, -470)  ← 孤立起点
└── n=2  复合:监听信号               ( -740, -346)
    └── n=8 复合:自身实体条件        ( -385, -347)
        └── n=7 Multiple Branches    (  -28, -346)  ← 4 路分支
            ├── n=4  复合:获取三实体  ( 1119, -340)  ← 纯数据复合
            ├── n=12 复合:标记e技能释放 (812, 94)
            ├── n=29 复合:蓄力时间    (  504,-1051)
            │   └── n=43 复合:职业branch (1068,-1039)  ← 5 路
            │       └── n=30 复合:顺序执行 (1338,-1164)  ← 4 路
            │           ├── n=5  复合:e技能特效 (1651,-1200)
            │           └── n=11 复合:标记e技能释放 (1846,-1105)
            └── n=9  Set Character Skill CD (1201, -94)  ← 终端节点
                data: n=19 Get Node Graph Variable
                data: n=23 Get Node Graph Variable
```

---

## 五、预览文档参考

当前已有的设计预览见 `r3-ascii-view-preview.md`（同一目录）。

关键设计原则（待验证）：

1. **节点命名规则**
   - 复合调用 → `复合:{def.name}`
   - NODE_PIN_RECORDS → 标准名
   - 未知 → `sys({nodeId})`

2. **引脚命名规则**
   - 复合 OutFlow → `def.outflows[i].name` 或 `出口{i+1}`
   - 复合 InParam → `def.inputs[i].name` 或 `参数{i+1}`
   - 标准节点 OutFlow → 按 index 编号 `出口{i+1}`

3. **exec 链起点**
   - nodeId ∈ {71, 72, 83, 91, 92, 253, 304, 385, ...} → `事件:`
   - 其他 → `[孤立起点]`

---

## 六、使用的分析工具

### 现有工具

```bash
# 转储节点坐标
npx tsx tests/composite/dump-nodes.ts /path/to/传球.gia

# 当前 ASCII 渲染
npx tsx tests/composite/ascii-layout.ts /path/to/传球.gia

# 结构分析（已写入本文档）
# 见 tests/composite/ 下的 _analyze_chain.ts, _pin_names.ts, _pin_names2.ts
```

### 关键代码文件

| 文件 | 用途 |
|------|------|
| `src/thirdparty/.../node_data/node_id.ts` | NODE_ID 常量（事件 ID 71, 385 等）|
| `src/thirdparty/.../node_data/node_pin_records.ts` | 节点名映射 |
| `src/thirdparty/.../protobuf/decode.ts` | GIA 解码 `decode_gia_file()` |
| `src/thirdparty/.../gia.proto` | protobuf schema |
| `tests/composite/ascii-layout.ts` | 当前渲染工具 |
| `docs/composite-ir/handover/r3-ascii-view-design.md` | 设计文档 |
| `docs/composite-ir/handover/r3-ascii-view-preview.md` | 设计预览 |

---

## 七、需要你帮助确认的问题（游戏内查看后补充）

这些是我从 protobuf 推导出的信息，游戏内实际画面可能不同。你的视觉反馈是修正设计的核心依据。

### 7.1 节点命名确认

| 问题 | 我的推导 | 游戏实际画面 |
|------|---------|-------------|
| n=1 (nid=73) 在游戏里叫什么？ | "Get Self Entity" | ⬜ 你确认 |
| n=9 (nid=739) 在游戏里叫什么？ | "Set Character Skill CD" | ⬜ 你确认 |
| n=29 (nid=1610612907) 复合名 | "蓄力时间" | ⬜ 你确认 |
| 孤立起点 n=1 在编辑器中属于哪个事件？ | 无头链，上游缺失 | ⬜ 你看编辑器链条 |

### 7.2 引脚名称确认

| 问题 | 我的推导 | 游戏实际画面 |
|------|---------|-------------|
| Multiple Branches 的 4 个分支出口叫什么？ | protobuf 无名字→"出口1/2/3/6" | ⬜ 编辑器显示什么标签？ |
| 顺序执行的 4x"是"在游戏中怎么区分？ | 名字重复—顺序区分 | ⬜ 编辑器显示 4 个"是"还是"出口1/2/3/4"？ |
| 蓄力时间的 OutFlow[0]="异常"，[1-3]="是"，[4]="否" | 共 5 个出口 | ⬜ 编辑器实际布局如何？ |
| 职业branch OutFlow[0]="前锋"～[4]="其他" | 5 个命名出口 | ⬜ 编辑器显示对吗？ |

### 7.3 复合展示确认

| 问题 | 我的推导 | 游戏实际画面 |
|------|---------|-------------|
| "获取三实体"（纯数据复合）在 exec 链中怎么显示？ | 没有 exec 连线，只有数据输出 | ⬜ 它在编辑器中的样貌 |
| "顺序执行"复合的 impl 图布局？ | Double Branch + 4 PS，Y=0,200,400,600 | ⬜ 实际是否对齐 |
| 复合调用在编辑器中是否有"展开箭头"？ | 假设有 | ⬜ 编辑器实际 UI |

### 7.4 工具方向偏好的确认

| 问题 | 我的设计假设 | 你的实际需求 |
|------|------------|------------|
| tree 视图缩进拓扑 vs 按位置排列 | 缩进树 | ⬜ 你偏好哪种？ |
| 复合展开是内联还是切换视图 | 内联展开 | ⬜ 你偏好哪种？ |
| 数据链路追溯的展示方式 | "参数X → 来自 → 节点Y OutParam[Z]" | ⬜ 你想要怎么查看？ |
| 分页的默认 Y 范围大小 | 500px | ⬜ 多大合适？ |

---

## 八、数据来源与方法论

本文档中所有节点信息的数据来源和提取方法说明。供后续工具设计参考。

### 8.1 节点名称解析

```
来源                         优先级    覆盖范围
NODE_PIN_RECORDS (高)         1st      kind=22000 的标准节点名（如 "When Entity Is Created", "Get Self Entity"）
compositeDef.def.name         1st      kind=22001 的复合定义名（如 "监听信号", "职业branch"）
NODE_ID 常量表                fallback 有 NODE_ID 映射的节点（下划线命名转空格）
原始 nid                      last     保底：显示 "nid=xxx"
```

代码路径：
- `src/thirdparty/.../node_data/node_pin_records.ts` — 481 条节点名记录
- `src/thirdparty/.../node_data/node_id.ts` — NODE_ID 常量
- `GIA 文件: data.accessories[i].compositeDef.inner.def.name` — 复合定义名

### 8.2 Exec 控制流边提取

```
每条边 = 从: OutFlow pin (kind=2) 的 connects[].id
       到: 目标节点的 nodeIndex

protobuf 结构:
  node.pins[].i1.kind === 2       // OutFlow
  node.pins[].i1.index            // OutFlow 索引
  node.pins[].connects[].id       // 目标节点索引

代码: tests/composite/ascii-layout.ts → extractEdges()
```

**注意**：protobuf 中只存储**有内容**的 pins。未连接的 OutFlow 不会出现在 pins[] 中。

### 8.3 分支名称获取

```
a) 复合定义节点 (kind=22001):
   来源: compositeDef.inner.def.outflows[i].name
   例子: "职业branch" → outflows = ["前锋","中锋","后卫","门将","其他"]

b) 系统节点 Multiple Branches (nid=3):
   来源: InParam[1] (L<R<Str>>) 的 bConcreteValue.value.bArray.entries[i].bString.val
   例子: n=7 → ["短传球-自动方向","短传球-朝向方向","e技能","传球特效","接球重置传球cd","恢复e技能cd"]
   映射规则: 数组索引 i 对应 OutFlow 索引 i+1

c) 无名称的 OutFlow:
   来源: 仅编号 [0][1][2]...
```

### 8.4 参数名字获取

```
节点参数名 (inputs/outputs 类型标志):
  来源: NODE_PIN_RECORDS.record.inputs[] / outputs[]
  例子: nid=739 → inputs: ["Ety","E<30>","Flt","Bol"]
        含义: Entity, SkillSlot_Enum, Float, Bool

复合定义参数名:
  来源: compositeDef.def.inputs[i].name / outputs[i].name
  例子: "监听信号" → outputs[0].name = "事件源实体", outputs[4].name = "位置"

系统节点无详细参数名时:
  方法: 根据类型和上下文推断
  例子: InParam[0] (Ety) → "技能所有者"
```

### 8.5 枚举值解析

```
枚举 ID 定义:
  来源: src/thirdparty/.../node_data/enum_id.ts
  例子: ENUM_ID.Skill_Slot = 30, ENUM_ID.Comparison_Operators = 1

枚举具体值:
  来源: 同文件 enum 值常量
  例子: SkillSlot_1E = 3111 (E 技能插槽)
        SkillSlot_2Q = 3112 (Q 技能插槽)
        SkillSlot_NormalAttack = 3100 (普攻插槽)

protobuf 枚举存储:
  格式: bEnum: { val: 3111 }
  类型标识: itemType.type_server.type = 14 (枚举类型), kind 指向 ENUM_ID
```

### 8.6 数据流追溯规则

#### 核心原则：关注数据经过的节点链

数据流追溯的目的是展示**数据是经过哪些节点计算得来的**，不是展开每个节点的引脚明细。

```
链条格式:

  InParam[X] "参数名" (类型)  <- n=N  源节点  OutParam[Y] "输出名"
                               <- n=M  上一级数据源  (该节点对数据的处理)
                               <- n=K  更上一级     (数据起点)

一条链每层是一个节点, 节点数 = 数据被处理的次数。
```

#### 各层说明

```
第 1 层(直接上游):
  InParam[X] "参数名" (类型)  <- n=N  源节点  OutParam[Y] "输出名"

  谁给我的数据? → n=N 的 OutParam[Y]
  例子: InParam[2] "冷却时间" (Float)  <- n=12  复合:标记e技能释放  OutParam[0] "获取cd"

第 2 层(上游的上游):
                               <- n=M  上一级节点  (处理动作)

  例: 如果 n=12 的数据来自 impl 内部:
                               <- n=7   Take Larger Value  (取非负值)
                               <- n=6   Subtraction  (算时间差)

第 N 层(最终源头):
                               <- n=K  节点名  (数据起点说明)

  三类数据起点:
  1. 字面值: = 12.0
  2. 图变量: = graphVar "基础传球速度"
  3. 事件上下文: = eventOutParam "被创建实体"
```

#### 多层链的缩进规则

```
简单(1 hop): 一行
  InParam[X] "名字" (T)  <- n=N  源节点  OutParam[Y] "输出名"

多层(N hops): 换行缩进, 每层一个 <-
  InParam[X] "名字" (T)  <- n=N  节点 A  OutParam[Y] "输出名"
                           <- n=M  节点 B  (处理动作说明)
                           <- n=K  节点 C  (数据起点说明)

复合节点展开:
  InParam[X] "名字" (T)  <- n=N  复合:XXX  OutParam[Y] "输出名"
                           └── impl 数据流
                               <- n=M  内部节点 1
                               <- n=K  内部节点 2  (起点)
```

#### 不在链上展示的内容

```
❌ 每个节点的全部引脚明细 (那是节点详情图做的事)
❌ impl 图的数据节点连接细节 (每条连线的方向、类型)
❌ 参数的类型转换细节

✅ 只展示: 数据经过了哪些节点 → 每个节点做了什么处理 → 最终来源
```

### 8.7 参数类型系统

```
NODE_PIN_RECORDS 类型缩写映射:

  缩写  含义        protobuf type
  ──────────────────────────────
  Ety   Entity      type=5
  Gid   GUID        type=7
  Int   整数         type=1
  Flt   浮点         type=2
  Bol   布尔         type=3
  Str   字符串       type=4
  Vec   向量         type=6
  Cfg   配置 ID     -
  E<N>  枚举(ID=N)  type=14 (enum), kind=N
  R<T>  引用<T>     -
  L<T>  列表<T>     type=10
  S<T>  选择器<T>   -

复合定义 protobuf 类型:
  outputs[i].type.class + type1/type2 决定类型
  常见: class=0→Entity, class=1→GUID, class=7→Vector/Position
```

### 8.8 复合定义 ↔ Impl 图映射

```
accessories[] 结构:
  ┌─ CompositeDefWrapper (which=12) ── 接口定义
  │   id.id = compositeId
  │   compositeDef.inner.def.name / inflows / outflows / inputs / outputs
  │   relatedIds[0].id = implGraphId (指向 impl 图的 ID)
  │
  └─ NodeGraphWrapper (which=9) ── 实现图
      id.id = implGraphId
      graph.inner.graph.nodes / pins / ...

查找流程:
  1. 主图节点 genericId.nodeId → compositeId
  2. 在 accessories 中找到 which=12, id.id == compositeId → 获取接口定义
  3. 通过 relatedIds[0].id 找到 implGraphId
  4. 在 accessories 中找到 which=9, id.id == implGraphId → 获取实现图节点

例子: n=2 → compositeId=1610612902 → acc[0] "监听信号" → related=1610612901
      → acc[1] "发送信号" (不是标准 impl 图, 特殊处理)
```

### 8.9 关键代码路径

| 数据需求 | 代码位置 |
|---------|---------|
| 解码 GIA 文件 | `src/thirdparty/.../protobuf/decode.ts → decode_gia_file()` |
| 节点名映射 | `src/thirdparty/.../node_data/node_pin_records.ts` |
| NODE_ID 常量 | `src/definitions/nodes.ts` (来自 `node_id.ts`) |
| 枚举定义 | `src/thirdparty/.../node_data/enum_id.ts` |
| 复合定义查找 | `data.accessories[i].compositeDef.inner.def` |
| 主图节点 | `data.graph.graph.inner.graph.nodes[]` |
| 引脚遍历 | `node.pins[] → i1.kind / i1.index / connects[]` |
| 变量定义 | `data.graph.graph.inner.graph.graphValues[]` |
