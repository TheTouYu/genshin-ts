# 传球.gia — 数据流分析报告（树格式 B）

> **报告日期**: 2026-07-02 | **分析模式**: trace-dataflow.ts 树格式 (`--max-depth 0 --all-params`)

## 文件概览
| 属性 | 值 |
|---|---|
| 主图节点数 | 24 |
| 复合定义总数 | 15（11 含 impl 图，4 系统内建） |
| 总复合调用点 | 16 |

## §1 主图数据流映射（24 节点摘要）

| 节点 | 类型 | 角色 |
|---|---|---|
| n=1 | GetSelfEntity | 自身实体获取 |
| n=2 | 复合:监听信号 | 信号入口（0 impl 节点，系统内建）|
| n=3 | WhenEntityIsCreated | 事件源 |
| n=4 | 复合:获取三实体 | 读取 3 图变量 |
| n=5 | 复合:e技能特效 | 特效挂载+定时清除 |
| n=7 | MultipleBranches | 按 6 事件名分发 |
| n=8 | 复合:自身实体条件 | 信号来源==自身实体? |
| n=9 | SetCharacterSkillCD | 设置 E 技能冷却 |
| n=11/12 | 复合:标记e技能释放 | CD 计算（2 实例） |
| n=29 | 复合:蓄力时间 | 4 段蓄力判断 |
| n=30 | 复合:顺序执行 | 顺序调度 |
| n=40/43 | 复合:职业branch | 职业路由（2 实例） |
| n=52 | 复合:职业参数 | 读取基础传球速度 |

**执行流拓扑**:
```
事件: WhenEntityIsCreated / WhenPlayerClassChanges
  → n=40 职业branch → Set基础速度×5

监听信号("使用技能")
  → n=8 自身实体条件 → n=7 MultipleBranches
    ├→ n=9 SetCharacterSkillCD（3 分支汇入）
    ├→ n=29 蓄力时间 → n=43 职业branch → n=30 顺序执行
    │   └→ n=5 e技能特效 | n=11 标记e技能释放
    └→ n=4 获取三实体(纯数据)
```

### 关键数据流报告
- **n=20 3DVectorZoom**: 信号方向向量(r) × 基础传球速度 = 最终速度向量
- **n=9 SetCharacterSkillCD**: 3 个分支(OutFlow[1],[2],[6])汇入，实体由 n=1 提供，CD 由标记e技能释放计算
- **n=30 顺序执行**: 5 DoubleBranch 串联，4 OutFlow

## §2 复合定义摘要

| 复合 | impl 节点 | 输入/输出 | 角色 |
|---|---|---|---|
| 监听信号 | 0(系统) | OutParam×9 | 信号接收 |
| 获取三实体 | 3 | OutParam×3 | 读图变量 |
| e技能特效 | 4 | InFlow×1 | 特效挂载+清除 |
| [时间]定时器设置与触发 | 5 | InParam×4 | AssemblyList 计时 |
| 自身实体条件 | 3 | InParam×1 | Cmp(自身实体, 输入) |
| 标记e技能释放 | 9 | InParam(cd) | SetVar+Sub+TakeLarger |
| 蓄力时间 | 9 | InParam×4 | 4 段≥判断 |
| 条件branch | 4 | InParam×4 | 4 DoubleBranch 链 |
| 顺序执行 | 5 | — | 5 DB 串联 |
| 职业branch | 8 | — | 职业→ID 匹配 |
| 职业参数 | 1 | OutParam×1 | 读图变量 |

### CD 计算逻辑
```
当前时间 = 获取关卡计时器时间(1)
记录e技能时间 = 当前时间 + cd(父输入=12) → SetCustomVar
剩余CD = max(已存记录 - 当前时间, 0) → 输出
```

## §3 架构模式

1. **事件驱动+信号路由**: 启动初始化(事件) + 运行时操作(信号)
2. **复合包装**: 系统内建(0 impl) → 纯数据(1-3 impl) → 纯控制流(4-5) → 混合(8-9)
3. **扇入/扇出**: 职业branch×5 扇出, SetSkillCD×3 扇入

### 与 r4-passball-impl.md 一致？✅ 全部 10 项一致
**关键新发现**:
- MultipleBranches 有 6 个事件条件（"短传球-自动方向"等），其中 "短传球-自动方向"/"接球重置cd"/"恢复e技能cd" 未连接
- CD 计算精确逻辑: `Addition(当前时间+cd)→存储; Subtraction(已存-当前)→TakeLarger(,0)→输出`

## §4 工具使用
- 主图 trace: 20 次调用, 复合 impl trace: 43 次, Node.js 辅助查询: 7 次
- 树格式直观，`--max-depth 0` 确保无截断（本文件链深度 ≤ 5）
- 复合父输入直通显示为 `← 父输入 "xxx"."yyy"`，清晰标记调用链
- `--all-params` 对 AssemblyList 等节点会展开全部参数（100+ 行），建议对常规节点使用
