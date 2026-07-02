# 传球.gia 完整绘制 · 拓扑与架构发现

> **目标**: 完整绘制 `复杂gia/传球.gia` 的节点、exec 连接、数据连接、复合展开，提取拓扑发现。
> **来源**: protobuf 解码 + 自定义脚本分析。

## §1 主图节点坐标

| n= | 类型 | nid | x= | y= |
|----|------|-----|-----|-----|
| 1 | Get Self Entity | 73 | 356 | -470 |
| 2 | (复合:监听信号) | 1610612902 | -740 | -346 |
| 3 | When Entity Is Created | 71 | -829 | -1414 |
| 4 | (复合:获取三实体) | 1610612905 | 1119 | -340 |
| 5 | (复合:e技能特效) | 1610612956 | 1651 | -1200 |
| 7 | Multiple Branches | 3 | -28 | -346 |
| 8 | (复合:自身实体条件) | 1610612834 | -385 | -347 |
| 9 | Set Character Skill CD | 739 | 1201 | -94 |
| 11/12 | (复合:标记e技能释放) | 1610612909×2 | 1846(-1205)/812(94) |
| 19/23 | Get Node Graph Variable | 337 | 1955(60)/1947(-178) |
| 20 | 3D Vector Zoom | 12 | -295 | 420 |
| 29 | (复合:蓄力时间) | 1610612907 | 504 | -1051 |
| 30 | (复合:顺序执行) | 1073741912 | 1338 | -1164 |
| 39 | When Player Class Changes | 385 | -657 | -1701 |
| 40 | (复合:职业branch) | 1610612908 | -392 | -1733 |
| 41/45-48 | Set Node Graph Variable | 323 ×5 | 56~559, -1841~-1377 |
| 43 | (复合:职业branch) | 1610612908 | 1068 | -1039 |
| 52 | (复合:职业参数) | 1610612936 | -490 | 504 |

## §2 Exec 连接

```
n=1(GetSelfEntity) → n=2(监听信号)
n=2(监听信号) → n=8(自身实体条件)
n=3(WhenCreated) → n=40(职业branch)
n=7(MultipleBranches) OutFlow[1]→n=9(SetSkillCD), [2]→n=12, [3]→n=29(蓄力), [6]→n=4
n=8(自身实体条件) OutFlow[0]→n=7
n=29(蓄力时间) → n=43(职业branch)
n=30(顺序执行) → n=5(e技能特效), n=11(标记e释放)
n=39(WhenClassChanges) → n=40(职业branch)
n=40(职业branch) → n=41/45/46/47/48(Set基础速度×5)
n=43(职业branch) → n=30(顺序执行)
```

## §3 复合定义接口（accessories 13 个）

| acc | 名称 | 角色 |
|---|---|---|
| [0] | 监听信号 | OutFlow[0], OutParam×9 |
| [1] | 发送信号 | InFlow+OutFlow, InParam×6 |
| [2] | 向服务器节点图发送信号 | InFlow+OutFlow, InParam×6 |
| [3] | **获取三实体**(纯数据) | OutParam[0:物理引擎]/[1:挂载]/[2:运动] |
| [5] | e技能特效 | InFlow[0], impl 4 节点 |
| [7] | [时间]定时器设置与触发 | OutFlow[0:定时触发][1:后续] |
| [9] | 自身实体条件 | OutFlow[0:是], InParam[0:自身实体] |
| [11] | 标记e技能释放 | InParam[cd], OutParam[获取cd] |
| [13] | [时间]获取关卡计时器时间(1) | 纯数据 |
| [15] | [查询]获取关卡实体 | 纯数据 |
| [17] | **蓄力时间** | OutFlow[0:异常][1-3:是][4:否] |
| [19] | [时间]获取关卡计时器时 | 纯数据 |
| [21] | 条件branch | 4条件→5出口 |
| [23] | **顺序执行** | 4 OutFlow |
| [25] | **职业branch** | OutFlow[0:前锋][1:中锋][2:后卫][3:门将][4:其他] |
| [27] | 职业参数(纯数据) | OutParam[传球速度] |

## §4 拓扑：3 条 exec 链

### 链1（初始化: WhenEntityIsCreated）
```
n=3 → n=40 职业branch → [n=41(9) | n=45(8) | n=46(10) | n=47(12) | n=48(8)]
```

### 链2（切换: WhenPlayerClassChanges 合并到链1）
```
n=39 → n=40 职业branch（合并于链1）
```

### 链3（运行时: GetSelfEntity 起点）
```
n=1 → n=2 监听信号 → n=8 自身实体条件 → n=7 MultipleBranches
  ├→ n=4 获取三实体(纯数据)
  ├→ n=12 标记e技能释放
  ├→ n=29 蓄力时间 → n=43 职业branch → n=30 顺序执行
  │   └→ n=5 e技能特效 | n=11 标记e技能释放 | n=9 SetSkillCD
  └→ n=9 SetSkillCD（由 OutFlow[1][2][6] 共 3 分支汇入）
```

## §5 架构发现

1. **两层入口**: 事件初始化(WhenCreated/WhenClassChanges) + 信号运行时触发(监听"使用技能")
2. **图变量作为配置系统**: "基础传球速度"被 5 处写入(职业路由) + 1 处读取(职业参数→3DVectorZoom)
3. **复合调用拓扑**: 13 个编译体形成 4 层调用 (主图→复合→子复合→系统复合)
4. **顺序执行**=5 DoubleBranch 全 true 串联, OutFlow[0-3] 各连一个下游
5. **职业branch**=条件branch 包装(4 Equal 匹配职业 ID), 5 OutFlow 对应 4 职业+默认
6. **CD 计算**: `当前时间 + cd → SetCustomVar; max(上次时间 - 当前时间, 0) → OutParam`

## §6 数据来源与方法论

**节点名解析优先级**: NODE_PIN_RECORDS > compositeDef.def.name > NODE_ID 常量 > nid
**Exec 边提取**: `node.pins[].i1.kind===2 .connects[].id`
**分支名**: 复合定义 outflows[i].name / MultipleBranches InParam[1] 的字符串数组
**枚举值**: `enum_id.ts` (如 SkillSlot_1E=3111)
**复合定义查找**: genericId.nodeId → accessories[which=12, id.id] → relatedIds[0].id → accessories[which=9, id.id]
