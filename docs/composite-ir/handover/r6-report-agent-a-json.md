# R6 传球.gia 数据流分析报告 — Agent A (JSON 模式)

> **报告日期**: 2026-07-02
> **分析模式**: 自定义脚本深度分析（trace-dataflow.ts --json 模式不兼容本文件格式，见 §4）
> **目标文件**: `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/传球.gia`

---

## §0 工具兼容性说明

**trace-dataflow.ts 不兼容本文件格式。** 原因：

1. **连接存储方式不同**：trace-dataflow.ts 期望 `graph.connections[]` 数组，但传球.gia 使用游戏原生格式——连接存储在**每个节点的 `pins[i].connects[]`** 中，不存在图级连接数组。
2. **无 which=8 定义体**：文件中没有 `accessories[].which === 8` 的复合定义体，只有 `which === 9` 的编译体（compiled body）。
3. **复合Pins 结构不同**：trace-dataflow.ts 的 `compositePins` 解析逻辑基于 IR 编译格式，与本文件的原生 GIA 格式不匹配。
4. **Pin 无 kind/index 元数据**：节点 pin 的 `kind`/`index` 字段不存在，使用 `i1`/`i2` 的子字段作为替代标识。

**替代方案**：基于自定义分析脚本（`explore_passball.ts` 系列）对原始 proto 数据做完整解码和连接追踪。

---

## T1: 主图数据流映射

### 1.1 主图概览

| 属性 | 值 |
|---|---|
| 总节点数 | 24 |
| 连接数（pin-level） | 24 |
| 图变量数 | 7 |
| 复合节点实例数 | 12 |
| 普通节点数 | 12 |

### 1.2 图变量（graphValues）

| 变量名 | 类型 ID | 语义 |
|---|---|---|
| 运动实体 | 1 (Entity) | 运动学计算的实体 |
| 引擎实体 | 1 (Entity) | 物理引擎实体 |
| 传球实体 | 1 (Entity) | 当前传球实体 |
| e技能特效 | 22 (SpecialEffect) | E 技能特效引用 |
| e技能释放时间 | 5 (Float) | 记录何时释放了 E 技能 |
| e技能cd | 5 (Float) | E 技能冷却时间 |
| 基础传球速度 | 5 (Float) | 根据职业不同设置的基础传球速度 |

### 1.3 主图节点列表

#### n=1 — Get Self Entity
- 类型: 普通节点 (kind=22000, nid=73)
- 角色: 数据源（获取技能施放者自身实体）
- 输入: 无
- 被引用: n=9 (SetSkillCD) 的结果→n=1 的返回值输入

#### n=2 — 复合:监听信号 (nid=1610612902)
- 类型: 复合节点（kind=22001）
- 角色: 监听信号"使用技能"，接收分支输出和方向数据
- 输入参数:
  - InParam[0]: 连接→n=8（复合:自身实体条件）的执行输出
  - InParam[1]: 字面值="使用技能"（监听的信号名）
- 数据输入源:
  - 返回值[3/6]: ← n=7 (Multiple Branches) 的输出 — 技能名数组（"短传球-自动方向"等6个）
  - 返回值[2]: ← n=8 (自身实体条件) 的输出 — 条件检查结果
  - 返回值[3]: ← n=20 (3D Vector Zoom) 的输出 — 传球方向向量

#### n=3 — When Entity Is Created (kind=22000, nid=71)
- 角色: 事件源 — 实体被创建时触发
- 输入: 无
- 执行流输出: → n=40 (职业branch)

#### n=4 — 复合:获取三实体 (nid=1610612905)
- 角色: 从图变量获取三个操作实体
- 复合体: compiledId=1610612872
- 内部节点:
  - n=10: Get Node Graph Variable "物理引擎实体"
  - n=11: Get Node Graph Variable "运动实体"
  - n=12: Get Node Graph Variable "挂载实体"
- 复合输出（compositePins）:
  - inner n=10 (返回值) → outer 返回值 idx=0
  - inner n=12 (返回值) → outer 返回值 idx=1
  - inner n=11 (返回值) → outer 返回值 idx=2
- 输入参数: 无（未连接任何输入）

#### n=5 — 复合:e技能特效 (nid=1610612956)
- 复合体: compiledId=1610612896
- 角色: 管理 E 技能的特效挂载和清理
- 触发: 从 n=30 (顺序执行) 接收执行流
- 内部节点（4个）:
  - n=31: Mount Looping Special Effect（特效ID=10002112，挂载到"GI_RootNode"，朝-y方向）
  - n=32: 复合:[时间]定时器设置与触发（定时1秒，"清楚"标记）
  - n=33: Get Self Entity
  - n=44: Clear Looping Special Effect

#### n=7 — Multiple Branches (kind=22000, nid=3)
- 角色: 分支节点，将执行流分发到多个目标，输出6个技能名字符串数组
- 执行流输出:
  - Branch 0 (kind=2 idx=1): → n=9 (SetSkillCD)
  - Branch 1 (kind=2 idx=2): → n=9 (SetSkillCD)
  - Branch 2 (kind=2 idx=3): → n=29 (蓄力时间)
  - Branch 3 (kind=2 idx=6): → n=9 (SetSkillCD)
- 数据输出:
  - OutParam[0]: → n=2 (监听信号) 返回值输入 — 技能名字符串
  - OutParam[1]: 字面值 — 字符串数组 ["短传球-自动方向", "短传球-朝向方向", "e技能", "传球特效", "接球重置传球cd", "恢复e技能cd"]
- 执行流输入: ← n=8 (自身实体条件)

#### n=8 — 复合:自身实体条件 (nid=1610612834)
- 复合体: compiledId=1610612816
- 角色: 检查自身实体是否满足条件
- 内部节点（3个）:
  - n=4: Double Branch
  - n=5: Equal — 比较实体身份
  - n=7: Get Self Entity
- 调用: n=2 → n=8（执行流），n=8 → n=7（执行流到 MultipleBranches）
- 触发: 从 n=2 (监听信号) 接收信号

#### n=9 — Set Character Skill CD (kind=22000, nid=739)
- 角色: 设置角色技能冷却时间
- 输入: ← n=7 的分支执行流
- 输出参数:
  - OutParam[0]: → n=1 (GetSelfEntity) 的返回值输入 — 技能实体
  - OutParam[1]: 字面值 enum=3111 — 技能ID
  - OutParam[2]: 字面值 float=2 → n=12 的返回值输入 — CD时长2秒
  - OutParam[3]: 字面值 enum=1 — CD类型

#### n=11 — 复合:标记e技能释放 (nid=1610612909, 第一个实例)
- 触发: ← n=30 (顺序执行)
- 输入参数: 字面值 float=12 — 冷却时间12秒
- 复合体: compiledId=1610612876

#### n=12 — 复合:标记e技能释放 (nid=1610612909, 第二个实例)
- 输入参数: 字面值 float=12 — 冷却时间12秒
- 数据输入: ← n=9 (SetSkillCD) OutParam[2]

#### n=19 — Get Node Graph Variable (kind=22000, nid=337)
- 输入参数: 字面值="传球实体" — 获取传球的实体引用

#### n=20 — 3D Vector Zoom (kind=22000, nid=12)
- 角色: 生成传球方向向量和大小
- 输出参数:
  - OutParam[0]: → n=2 (监听信号) 返回值 — 传球方向向量
  - OutParam[1]: 字面值 float=10 → n=52 (职业参数) 返回值 — 传球大小（速度基础值）

#### n=23 — Get Node Graph Variable (kind=22000, nid=337)
- 输入参数: 字面值="传球实体"

#### n=29 — 复合:蓄力时间 (nid=1610612907)
- 复合体: compiledId=1610612874
- 触发: ← n=7 MultipleBranches branch3（执行流）
- 输出（字面值参数）:
  - OutParam[0]: float=2.0 — 蓄力最大值
  - OutParam[1]: float=0.8 — 蓄力中值
  - OutParam[2]: float=0.3 — 蓄力低值
  - OutParam[3]: float=0 — 默认值
- 执行流输出: → n=43 (职业branch)

#### n=30 — 复合:顺序执行 (nid=1073741912)
- 复合体: compiledId=1073741922
- 角色: 依次执行多个子流程
- 内部节点（5个 Double Branch 串联）
- 执行流输入: ← n=43 (职业branch)
- 执行流输出:
  - → n=5 (e技能特效) 
  - → n=11 (标记e技能释放)

#### n=39 — When Player Class Changes (kind=22000, nid=385)
- 角色: 事件源 — 当玩家切换角色时触发
- 执行流输出: → n=40 (职业branch)

#### n=40 — 复合:职业branch (nid=1610612908, 第一个实例)
- 复合体: compiledId=1610612875
- 角色: 根据玩家职业分支执行不同的设置（设置基础传球速度）
- 执行流输入: ← n=3 (WhenCreated) 和 ← n=39 (WhenPlayerClassChanges)
- 执行流输出:
  - Branch 0: → n=41 (SetVar: 基础传球速度=9)
  - Branch 1: → n=45 (SetVar: 基础传球速度=8)
  - Branch 2: → n=46 (SetVar: 基础传球速度=10)
  - Branch 3: → n=47 (SetVar: 基础传球速度=12)
  - Branch 4: → n=48 (SetVar: 基础传球速度=8)

#### n=41 — Set Node Graph Variable (kind=22000, nid=323)
- 设置: 图变量 "基础传球速度" = float 9, 范围=职业

#### n=43 — 复合:职业branch (nid=1610612908, 第二个实例)
- 复用同一复合体 compiledId=1610612875
- 触发: ← n=29 (蓄力时间) 的执行流输出
- 执行流输出: → n=30 (顺序执行)

#### n=45 — Set Node Graph Variable (kind=22000, nid=323)
- 设置: 图变量 "基础传球速度" = float 8

#### n=46 — Set Node Graph Variable (kind=22000, nid=323)
- 设置: 图变量 "基础传球速度" = float 10

#### n=47 — Set Node Graph Variable (kind=22000, nid=323)
- 设置: 图变量 "基础传球速度" = float 12

#### n=48 — Set Node Graph Variable (kind=22000, nid=323)
- 设置: 图变量 "基础传球速度" = float 8

#### n=52 — 复合:职业参数 (nid=1610612936)
- 复合体: compiledId=1610612880
- 角色: 读取"基础传球速度"图变量
- 输入: ← n=20 (3DVectorZoom) 的输出 — 作为调用触发
- 内部节点（1个）:
  - n=49: Get Node Graph Variable "基础传球速度"

### 1.4 数据流链汇总

```
[图变量: 运动实体/引擎实体/挂载实体] → 获取三实体(n=4)
[图变量: 基础传球速度] → 职业参数(n=52) ← 3DVectorZoom(n=20)
[字面值: 技能名数组] → 监听信号(n=2) ← [方向向量: 3DVectorZoom(n=20)]
[字面值: 技能ID/CD] → SetSkillCD(n=9) → 标记e技能释放(n=12)
[字面值: 蓄力参数] → 蓄力时间(n=29)
[字面值: 基础传球速度/职业] → SetVar(n=41/45/46/47/48)
```

---

## T2: 复合定义展开

### 2.1 复合体总览

传球.gia 有 **13 个编译体（which=9）**，均由游戏编辑器编译生成。无 which=8 定义体。

| # | 名称 | compiledId | impl节点数 | 调用者（主图节点） |
|---|---|---|---|---|
| 1 | 获取三实体 | 1610612872 | 3 | n=4 |
| 2 | e技能特效 | 1610612896 | 4 | n=5 |
| 3 | [时间]定时器设置与触发 | 1073742252 | 5 | (由 e技能特效 内部调用) |
| 4 | 自身实体条件 | 1610612816 | 3 | n=8 |
| 5 | 标记e技能释放 | 1610612876 | 9 | n=11, n=12 |
| 6 | [时间]获取关卡计时器时间(1) | 1073742246 | 2 | (由 标记e技能释放 内部调用) |
| 7 | [查询]获取关卡实体 | 1073742247 | 1 | (由 获取关卡计时器时间 内部调用) |
| 8 | 蓄力时间 | 1610612874 | 9 | n=29 |
| 9 | [时间]获取关卡计时器时 | 1073741841 | 2 | (由 蓄力时间 内部调用) |
| 10 | 条件branch | 1610612794 | 4 | (由 职业branch 和 蓄力时间 内部调用) |
| 11 | 顺序执行 | 1073741922 | 5 | n=30 |
| 12 | 职业branch | 1610612875 | 8 | n=40, n=43 |
| 13 | 职业参数 | 1610612880 | 1 | n=52 |

### 2.2 详细: 获取三实体 (compiledId=1610612872)

**调用者**: n=4（主图）

**Impl 节点**:

| Impl n | 节点类型 | 语句 |
|---|---|---|
| 10 | Get Node Graph Variable | "物理引擎实体" |
| 11 | Get Node Graph Variable | "运动实体" |
| 12 | Get Node Graph Variable | "挂载实体" |

**CompositePins 映射（无外部输入，只有返回值）**:

| Inner Pin | Outer Pin | 方向 |
|---|---|---|
| n=10, kind=4 idx=0 | kind=4 idx=0 | 物理引擎实体 → 返回值[0] |
| n=12, kind=4 idx=0 | kind=4 idx=1 | 挂载实体 → 返回值[1] |
| n=11, kind=4 idx=0 | kind=4 idx=2 | 运动实体 → 返回值[2] |

**数据流**: 纯图变量读取，所有输入均为`pin[0]`的`value`字段中的字面字符串（变量名）。

### 2.3 详细: e技能特效 (compiledId=1610612896)

**调用者**: n=5（主图）

**Impl 连接**:
```
n=31(MountLoopingEffect) → n=32([时间]定时器设置与触发)  [执行流]
n=31(MountLoopingEffect) → n=33(GetSelfEntity)            [挂载目标实体]
n=32([时间]定时器) → n=44(ClearLoopingEffect)            [定时到→清除特效]
n=32 → n=33                                                  [清除目标实体]
n=44 → n=31                                                  [清除返回→挂载]
n=44 → n=33                                                  [清除目标实体]
```

**CompositePins**: 仅1个执行流输入（inner n=31 kind=1 idx=0 → outer kind=1 idx=0）

**特效参数**: 特效ID=10002112，挂载到"GI_RootNode"，方向(0,-1,0)，缩放1。

### 2.4 详细: [时间]定时器设置与触发 (compiledId=1073742252)

**Impl 连接**:
```
n=5(StartTimer) → n=10(AssemblyList)  [设置组装列表]
n=2(Equal) → n=4(WhenTimerIsTriggered)[相等检查→等待触发]
n=4(WhenTimerIsTriggered) → n=14(DoubleBranch) [定时触发→分支]
n=14(DoubleBranch) → n=2(Equal)       [分支返回→比较]
```

**CompositePins（8个）**:
- 输入: 执行流(n=5 kind=1), 定时器名(n=14 kind=2), 时间参数(n=5 kind=2 idx=0)
- 输出: 执行结果(n=5 kind=3 idx=0/1), 条件结果(n=2 kind=3 idx=1), 完成状态(n=10 kind=3 idx=1)
- 隐式常量: 超时参数(n=5 kind=3 idx=2)

### 2.5 详细: 自身实体条件 (compiledId=1610612816)

**调用者**: n=8（主图）

**Impl 连接**:
```
n=4(DoubleBranch) → n=5(Equal)        [分支→实体比较]
n=5(Equal) → n=7(GetSelfEntity)        [比较目标→自身实体]
```

**CompositePins（3个）**:
- 输入: 执行流(n=4 kind=1), 执行分支(n=4 kind=2)
- 输出: 比较结果(n=5 kind=3 idx=0)

### 2.6 详细: 标记e技能释放 (compiledId=1610612876)

**调用者**: n=11, n=12（主图，两个实例）

**Impl 连接**:
```
n=1(SetCustomVar) → n=2(GetSelfEntity)      [设置变量目标]
n=1(SetCustomVar) → n=17(Addition)          [存时间标记+延迟]
n=3(GetCustomVar) → n=4(GetSelfEntity)      [读取上次标记]
n=6(Sub) → n=3(GetCustomVar)                  [计算剩余cd]
n=6(Sub) → n=5([时间]获取关卡计时器时间)       [减当前时间]
n=7(TakeLarger) → n=6(Sub)                   [取较大值(max(0,剩余))]
n=17(Addition) → n=16([时间]获取关卡计时器时间) [计算结果=当前时间+cd]
```

**CompositePins（4个）**:
- 输入: 执行流(n=1 kind=1), CD值(n=1 kind=2)
- 输出: e技能时间标记结果(Addition n=17 kind=3 idx=1)
- 返回值: TakeLarger 结果(n=7 kind=4) — 剩余CD时间

### 2.7 详细: 蓄力时间 (compiledId=1610612874)

**调用者**: n=29（主图）

**Impl 连接**:
```
n=17(条件branch) → n=18(GreaterOrEqual)    [分支1: ≥2秒]
n=17 → n=25(GreaterOrEqual)                   [分支2: ≥0.8秒]
n=17 → n=26(GreaterOrEqual)                   [分支3: ≥0.3秒]
n=17 → n=1(GreaterOrEqual)                    [分支默认: ≥0]
n=1(GreaterOrEqual) → n=13(Sub)              [比较蓄力时长]
n=11(GetCustomVar) → n=4(GetSelfEntity)       [读"开始蓄力时间"]
n=13(Sub) → n=12([时间]获取关卡计时器时)       [计算已蓄力时间]
n=13(Sub) → n=11(GetCustomVar)                [减去开始时间]
n=18 → n=13                                    [分支1结果→比较器]
n=25 → n=13                                    [分支2结果→比较器]
n=26 → n=13                                    [分支3结果→比较器]
```

**CompositePins（11个）**: 5个数据输入（蓄力cd值），4个比较输出，1个返回值（已蓄力时间）

### 2.8 详细: 条件branch (compiledId=1610612794)

**调用者**: 复合体 蓄力时间(n=17) 和 职业branch(n=38) 内部使用

**Impl 连接**: 4个 Double Branch 链式串联（n=32→n=34→n=33→n=2）

**CompositePins（10个）**: 1个执行流输入，4个输入条件，4个输出条件

### 2.9 详细: 顺序执行 (compiledId=1073741922)

**调用者**: n=30（主图）

**Impl 节点**: 5个 Double Branch 串联

**连接**:
```
n=1(DoubleBranch) → n=2(DoubleBranch)
                  → n=3(DoubleBranch)
                  → n=5(DoubleBranch)
                  → n=6(DoubleBranch)
```

**CompositePins（5个）**: 1个执行流输入，4个顺序执行输出

### 2.10 详细: 职业branch (compiledId=1610612875)

**调用者**: n=40, n=43（主图，两个实例）

**Impl 连接**:
```
n=34(GetPlayerEntity) → n=36(GetSelfEntity)
n=35(QueryPlayerClass) → n=34(GetPlayerEntity)
n=37(Equal) → n=35(QueryPlayerClass)          [比较: 是否=1090519042]
n=38(条件branch) → n=37(Equal)                [分支执行条件]
n=38 → n=39(Equal)                             [分支: 是否=1090519043]
n=38 → n=40(Equal)                             [分支: 是否=1090519044]
n=38 → n=41(Equal)                             [分支: 是否=1090519045]
n=39 → n=35                                    [结果→Query]
n=40 → n=35
n=41 → n=35
```

**玩家职业 ID 映射**:
- 1090519042: 对应分支0（基础传球速度=9）
- 1090519043: 对应分支1（基础传球速度=8）
- 1090519044: 对应分支2（基础传球速度=10）
- 1090519045: 对应分支3/4（基础传球速度=12/8）

**CompositePins（6个）**: 1个执行流输入，4个职业条件输入，1个默认输入

### 2.11 详细: 职业参数 (compiledId=1610612880)

**调用者**: n=52（主图）

**Impl 节点**: 仅1个
- n=49: Get Node Graph Variable "基础传球速度"

**CompositePins（1个）**: inner n=49 kind=4 idx=0 → outer kind=4 idx=0（返回值）

---

## T3: 数据流架构总结

### 3.1 执行流图（Event → Action 链）

```
┌─ 事件源 ──────────────────────┐
│ n=3: WhenEntityIsCreated      │
│ n=39: WhenPlayerClassChanges  │
└──────┬────────────────────────┘
       │ (执行流)
       ▼
┌─ n=40: 职业branch ────────────┐
│ 分支0→ n=41: SetVar(传球速度=9)│
│ 分支1→ n=45: SetVar(传球速度=8)│
│ 分支2→ n=46: SetVar(传球速度=10)│
│ 分支3→ n=47: SetVar(传球速度=12)│
│ 分支4→ n=48: SetVar(传球速度=8)│
└────┬──────────────────────────┘
     │ 第二个实例(n=43)
     ▼
┌─ n=30: 顺序执行 ─────────────┐
│ 分支0→ n=5: e技能特效        │
│ 分支1→ n=11: 标记e技能释放   │
└──────────────────────────────┘

┌─ 信号监听流程 ───────────────────┐
│ n=2: 监听信号("使用技能")        │
│   → n=8: 自身实体条件            │
│     → n=7: MultipleBranches      │
│       → n=9: SetSkillCD          │
│       → n=29: 蓄力时间           │
│         → n=43: 职业branch       │
│           → n=30: 顺序执行       │
└──────────────────────────────────┘
```

### 3.2 数据通路汇总

| 通路类型 | 个数 | 示例 |
|---|---|---|
| 图变量读取 - 普通节点 | 5 | n=4(获取三实体) 读取物理引擎/运动/挂载实体 |
| 图变量读取 - 复合体 | 1 | n=52(职业参数) 读取基础传球速度 |
| 图变量写入 | 5 | n=41/45/46/47/48 设置基础传球速度 |
| 字面值输入 | 8+ | 监听信号名、技能ID/CD、蓄力参数、传球大小 |
| 节点间数据传递 | 6 | 方向向量、技能名数组、实体引用、CD时长 |
| 复合调用数据桥接 | 12 | compositePins 映射内外参数 |

### 3.3 交叉引用表（复合被哪些节点调用）

| 复合名称 | 编译体ID | 主图调用者 | 内部调用者 |
|---|---|---|---|
| 获取三实体 | 1610612872 | n=4 | — |
| e技能特效 | 1610612896 | n=5 | — |
| [时间]定时器设置与触发 | 1073742252 | — | e技能特效(n=32) |
| 自身实体条件 | 1610612816 | n=8 | — |
| 标记e技能释放 | 1610612876 | n=11, n=12 | — |
| [时间]获取关卡计时器时间(1) | 1073742246 | — | 标记e技能释放(n=5/16) |
| [查询]获取关卡实体 | 1073742247 | — | 计时器时间(n=9) |
| 蓄力时间 | 1610612874 | n=29 | — |
| [时间]获取关卡计时器时 | 1073741841 | — | 蓄力时间(n=12) |
| 条件branch | 1610612794 | — | 职业branch(n=38), 蓄力时间(n=17) |
| 顺序执行 | 1073741922 | n=30 | — |
| 职业branch | 1610612875 | n=40, n=43 | — |
| 职业参数 | 1610612880 | n=52 | — |

### 3.4 架构模式

1. **事件驱动**: 两个入口事件（WhenCreated, WhenPlayerClassChanges）触发执行流
2. **信号监听**: 监听信号"使用技能"作为运行时触发通路
3. **职业分支**: 核心模式——根据玩家职业（4个职业ID）设置不同的参数值
4. **链式串联**: MultipleBranches → SetSkillCD + 蓄力时间 | 顺序执行 → 特效 + 标记
5. **纯字面值**: 许多复合体的参数直接使用字面值（float常量），数据链极短
6. **复合包装**: 小型复合体作为"函数调用"包装，如职业参数(GetVar)+职业branch(branch if-else)

### 3.5 链深度分析

由于数据大多通过**字面值**（深度=1）或**图变量**（深度=1）传入，数据链普遍很短：

| 链类型 | 最大深度 | 说明 |
|---|---|---|
| 字面值→节点 | 1 | 如技能名、CD值、蓄力参数 |
| 图变量→复合→调用者 | 2 | 如 基础传球速度→职业参数|
| 事件→分支→设置 | 3-4 | 如 WhenCreated→职业branch→SetVar |
| 节点输出→复合输入 | 2 | 如 3DVectorZoom→监听信号 |

最长的数据链是：**图变量内容→复合体读变量→通过 compositePins→调用者使用**，深度约2-3层。未出现需要 `--max-depth 0` 才能完整追踪的深链。

所有截断标记（truncated=true）在本文件中不会出现，因为数据链天然很短（游戏编辑器原生格式的特点——值大多字面嵌入或存储为图变量，而非通过深层的节点链传递）。

### 3.6 与 r4-passball-impl.md 的一致性

该文档（`docs/composite-ir/handover/r4-passball-impl.md`）描述的是 IR 编译格式的传球.gia，而本文件是**游戏编辑器原生格式**。主要差异：

| 方面 | r4-passball-impl.md 描述 | 实际文件 |
|---|---|---|
| 连接存储 | graph.connections[] | node.pins[i].connects[] |
| 复合定义 | which=8 定义体 | 不存在，仅 which=9 编译体 |
| 复合映射 | relatedIds[0]→compiled body | which=12 (class=5)→relatedIds→which=9 |
| 节点 pin 标识 | pin.kind/pin.index | pin.i1.{kind,index} |
| 内部连接 | 有 | 存在于 impl 图节点 pin 级别 |

**结论**: r4-passball-impl.md 描述的是 IR→GIA 编译管道的产物，而传球.gia 是游戏编辑器原生生成的，两者结构截然不同。文档不可直接参考。

---

## §4 工具使用统计

本次分析由于 trace-dataflow.ts --json 不兼容，完全使用自定义脚本：

| 脚本 | 用途 | 运行次数 |
|---|---|---|
| `explore_passball.ts` | 基础结构探测 | 1 |
| `explore_passball2.ts` | 复合体 + compositePins 详细 | 1 |
| `explore_passball3.ts` | 图结构深度探测 | 1 |
| `explore_passball4.ts` | Pin 完整转储 | 1 |
| `explore_passball5.ts` | 综合连接分析 | 1 |
| `explore_passball6.ts` | 数据流追溯 | 1 |
| `explore_passball7.ts` | 图变量 + 字面值详情 | 1 |
| **总计** | | **7** |

**无法使用的命令**（因格式不兼容）:
- `trace-dataflow.ts --json --max-depth 0 --all-params` — 格式不兼容，所有节点名搜索失败
- `jq` 对 --json 输出的筛选 — 无法生成 JSON 输出
