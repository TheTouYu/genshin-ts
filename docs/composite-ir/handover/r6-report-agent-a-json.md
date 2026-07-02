# R6 传球.gia 数据流分析报告 — Agent A (JSON 模式)

> **报告日期**: 2026-07-02 | **分析模式**: 自定义脚本（trace-dataflow.ts JSON 模式不兼容）
> **目标文件**: `复杂gia/传球.gia`

## §0 工具兼容性
trace-dataflow.ts 不兼容本文件（编辑器原生 GIA 格式）：连接存储在 `node.pins[i].connects[]` 而非图级 `graph.connections[]`；无 which=8 定义体；使用 `i1`/`i2` 子字段而非 `kind`/`index`。完全使用自定义脚本 (`explore_passball.ts` 系列，7 次调用) 完成分析。

## §1 主图数据流映射
**24 个主图节点**，7 个图变量，12 个复合实例。

**图变量**: `运动实体`(Entity)、`引擎实体`(Entity)、`传球实体`(Entity)、`e技能特效`(SpecialEffect)、`e技能释放时间`(Float)、`e技能cd`(Float)、`基础传球速度`(Float)

**关键节点**:
- **n=2 监听信号**: 复合节点，接收"使用技能"信号 → 传入方向向量和技能名 → n=8 自身实体条件（数据过滤）
- **n=3 WhenEntityIsCreated** + **n=39 WhenPlayerClassChanges**: 事件源 → n=40/43 职业branch
- **n=7 MultipleBranches**: 按 6 个技能事件名分发 → SetSkillCD(n=9)、蓄力时间(n=29) 等
- **n=20 3DVectorZoom**: 信号方向向量 × 基础传球速度 = 最终传球速度向量
- **n=30 顺序执行**: OutFlow[0]→e技能特效，OutFlow[1]→标记e技能释放(cd=12)
- **n=52 职业参数**: 读取图变量"基础传球速度"

## §2 复合定义展开
13 个编译体（which=9），总计 47 impl 节点（含 6 个嵌套系统复合）。

| 复合 | compiledId | impl 节点 | 角色 |
|---|---|---|---|
| 获取三实体 | 1610612872 | 3 | 读取图变量×3 |
| e技能特效 | 1610612896 | 4 | 特效挂载+定时清除 |
| [时间]定时器设置与触发 | 1073742252 | 5 | 定时器管理 |
| 自身实体条件 | 1610612816 | 3 | 实体身份过滤 |
| 标记e技能释放 | 1610612876 | 9 | CD 计算(e技能) |
| 蓄力时间 | 1610612874 | 9 | 4 段蓄力判断 |
| 条件branch | 1610612794 | 4 | 4 DoubleBranch 链式 |
| 顺序执行 | 1073741922 | 5 | 5 DoubleBranch 串联 |
| 职业branch | 1610612875 | 8 | 4 职业 ID 匹配 |
| 职业参数 | 1610612880 | 1 | 读取"基础传球速度" |

每个复合展开见完整报告原始版（538 行 → 本压缩版保留结论和关键发现，删除了逐节点 JSON dump）。

## §3 架构总结

### 执行流（3 条链）
```
事件始化 → 职业branch → Set基础速度×5              (启动初始化)
职业切换 → 职业branch → Set基础速度×5
GetSelfEntity → 监听信号("使用技能") → 自身实体条件 → MultipleBranches
  ├→ SetSkillCD
  ├→ 蓄力时间 → 职业branch → 顺序执行 → [e技能特效 || 标记e技能释放]
  └→ 获取三实体(纯数据)
```

### 数据通路
| 通路类型 | 数量 | 说明 |
|---|---|---|
| 图变量读 | 6 | 实体、速度等 |
| 图变量写 | 5 | 基础传球速度设置 |
| 节点间数据传递 | 6 | 方向向量、技能名、实体、CD |
| 复合调用桥接 | 12 | compositePins |

### 链深度
所有数据链深度 ≤ 3（字面值/图变量 → 复合 → 使用），无截断。

## §4 与 r4-passball-impl.md 对比
| 方面 | r4-passball-impl.md | 实际文件 |
|---|---|---|
| 连接存储 | graph.connections[] | node.pins[i].connects[] |
| 复合定义 | which=8 定义体 | 仅 which=9 编译体 |
| pin 标识 | pin.kind/pin.index | pin.i1.{kind,index} |

**结论**: r4-passball-impl.md 描述的是 IR→GIA 编译管道的产物，而本文件是游戏编辑器原生格式——结构截然不同。

## §5 工具总结
- 使用 `explore_passball.ts` 系列共 7 次调用完成分析
- trace-dataflow.ts 因格式不兼容完全无法使用
- 编辑器原生格式的 GIA 文件需要使用自定义脚本组合进行深度分析
