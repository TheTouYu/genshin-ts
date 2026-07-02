# R5 · JSON vs 树格式 · 数据流追溯工具对比评估

> 交接目的：确定 `trace-dataflow.ts` 的 `--json` 模式和默认**树格式**模式哪个更适合后续的自动化数据流分析。
> 测试方法：两个 agent 分别使用两种模式，对 物理运动.gia 的多个复杂数据流做完整追溯，记录完成时间和反馈。

---

## 一、环境与工具

### 1.1 GIA 文件位置

```
Windows 游戏目录:
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/
    物理运动.gia        (68 节点, 主测试文件)
    传球.gia            (24 节点)
    弹球.gia            (74 节点)
```

### 1.2 工具路径

```
项目根目录: /home/h/genshin-ts
工具: tests/composite/trace-dataflow.ts
构建: npm run build
运行: npx tsx tests/composite/trace-dataflow.ts
```

### 1.3 工具完整使用指南

#### 基本用法

```bash
# 主图追溯（数字索引）
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 51 0

# 主图追溯（名字查找，唯一匹配自动进入）
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 计算合力

# 指定复合 impl 图
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 5 -c 计算分力

# 指定参数索引
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 5 0 1 -c 计算分力

# 省略参数索引 → 默认追前 3 个
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 5 -c 计算分力
```

#### 输出模式对比

```bash
# 模式 A: 树格式（默认）
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 计算合力

# 模式 B: 嵌套 JSON（--json）
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 计算合力 --json
```

#### JSON 输出的下游处理

```bash
# 保存到文件（跳过头部说明行）
npx tsx ... --json 2>/dev/null | grep -v "^数据流追溯" > trace.json

# jq 查询示例
jq '.params[] | {name, source_type}' trace.json
jq '.. | objects | select(.source_type == "parent_input")' trace.json
jq '.call_sites' trace.json

# -s 合并多层追溯
jq -s '[.[] | {node: .node_name, call: .call_sites[0].node_name}]' l1.json l2.json l3.json
```

#### 已知局限

| 场景 | 状态 | 说明 |
|------|------|------|
| 查找图变量写入点 | ❌ | 需反向搜索 SetNodeGraphVariable，当前不支持 |
| which=14 信号复合的 call_site | ❌ | 信号复合无标准 def/compiled 配对 |
| 参数名覆盖 | 部分 | 仅 Get_Local_Variable "初始值" 有覆盖 |
| for 循环/动态节点 | ❌ | 运行时展开，protobuf 不记录 |

---

## 二、输出格式对比

### 树格式（默认）

```
InParam[0] "w" (?)
  ← 父输入 "计算分力"."w"

InParam[1] "f" (?)
  <- n=78  Get Local Variable  OutParam[1]
    InParam[0] "初始值" (R<T>)
      <- n=7  复合:friction_force  OutParam[0] "结果"
        InParam[2] "额外受力" (?)
          <- n=4  Addition  OutParam[0]
            InParam[0] "R<T>" (R<T>)
              <- n=2  Split 3D Vector  OutParam[1]
            InParam[1] "R<T>" (R<T>)
              ← 父输入 "计算分力"."额外受力"
[上层调用] "计算分力" 被调用于：
  发送信号 n=5  复合:计算分力
→ 使用 --composite "发送信号" 向上一级追溯
```

**心智模型：** 文件系统 `tree` 命令。缩进 = 深度。箭头 `<-` = 数据流向。

### 嵌套 JSON（--json）

```json
{
  "graph": "复合:计算分力",
  "node": 5,
  "node_name": "复合:力矩",
  "params": [
    {
      "index": 0,
      "name": "w",
      "source_type": "parent_input",
      "parent_composite": "计算分力",
      "parent_input": "w"
    },
    {
      "index": 1,
      "name": "f",
      "source_type": "node",
      "source": {
        "node": 78,
        "name": "Get Local Variable",
        "out_index": 1,
        "inputs": [{
          "index": 0,
          "name": "初始值",
          "source": {
            "node": 7,
            "name": "复合:friction_force",
            "out_index": 0,
            "out_name": "结果",
            "inputs": [...]
          }
        }]
      }
    }
  ],
  "call_sites": [{
    "graph": "复合:发送信号",
    "node": 5,
    "node_name": "复合:计算分力"
  }]
}
```

**心智模型：** AST / DOM 树。`source.inputs[]` 嵌套 = 深度。字段名自解释。

### 关键差异维度

| 维度 | 树格式 | 嵌套 JSON |
|------|--------|-----------|
| 人读性 | ✅ 一目了然 | ❌ 需要格式化 |
| 机读性 | ❌ 缩进即结构 | ✅ 标准 JSON |
| LLM 消费 | 中等 | ✅ 嵌套结构自然 |
| jq 递归查询 | ❌ | ✅ `.. \| objects \| select(...)` |
| 增量输出 | ❌ 一次性 | ✅ 每次一步可追加 |
| 跨层合并 | ❌ 手动阅读 | ✅ `jq -s` 合并 |
| 下游可视化 | ❌ 需 parser | ✅ 直接喂 Graphviz/D3 |
| 文件体积 | 小 | 大（~2x 冗余字段名） |

---

## 三、测试方法

### 3.1 实验设计

```
被试：两个 agent（同一模型）
  Agent A: 使用 --json 模式 + jq 查询
  Agent B: 使用树格式（默认）手动分析

任务：完成以下 4 个数据流追溯
  T1: 追踪 计算合力 的完整数据源（air 和 f 两条链）
  T2: 追踪 力矩.InParam[0]("w") 到终点
  T3: 追踪 w衰减力矩 的两个实例（n=6 vs n=7）差异
  T4: 统计 计算分力 中所有父输入直通参数

每个任务记录：
  - agent 理解任务时间
  - 工具调用次数
  - 最终答案准确度（由人工验证）
  - agent 自我信心评分（1-5）
```

### 3.2 标准答案（人工验证）

#### T1: 计算合力 的数据源

```
InParam[0] "air"
  ← aerodynamic_forces.OutParam[2] "F_aero"  (terminal, 读取图变量)

InParam[1] "f"
  ← Get Local Variable
    ← friction_force.OutParam[0] "结果"
      ← Addition
        InParam[0] ← Split 3D Vector ← aerodynamic_forces.OutParam[0] "magnus"
        InParam[1] ← 父输入 "计算分力"."额外受力"
      ← 父输入 "计算分力"."w"    (friction_force 的缺失 pin)
      ← 父输入 "计算分力"."v"    (friction_force 的缺失 pin)
```

关键验证点：
- Addition 的 InParam[0] 来自 Split 3D Vector (3 级)
- Addition 的 InParam[1] 是父输入"额外受力"（`= 0` 是编译体默认值，不能当字面值）
- friction_force 有 3 个输入，其中 "额外受力" 有完整链，"w" 和 "v" 是父输入直通

#### T2: 力矩.w → 终点

```
力矩.w ← 计算分力.w ← 发送信号.GetNodeGraphVariable("w")
```

关键验证点：3 层 parent_input 直通，最终终点是图变量。

#### T3: w衰减力矩 两个实例差异

```
n=6: w ← 父输入, 地面衰减系数 = 0.2 (字面值)
n=7: w ← 父输入, 地面衰减系数 = 未连接
```

关键验证点：两种模式都能识别差异，但 n=7 的"未连接"在 JSON 中是 `"source_type": "unconnected"`。

#### T4: 计算分力 中所有父输入直通的统计

```
aerodynamic_forces: w (InParam[0]), v (InParam[1])  → 2 个
力矩:              w (InParam[0])                    → 1 个
friction_force:    w (InParam[0]), v (InParam[1])    → 2 个
计算滚动摩擦力:    v (InParam[0])                    → 1 个
Addition:          额外受力 (InParam[1])              → 1 个
合计: 7 处
```

### 3.3 Agent A 操作指南（--json 模式）

```bash
# T1: 计算合力
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 6 -c 计算分力 --json 2>/dev/null | grep -v "^数据流追溯" > /tmp/t1.json

# 提取所有连接路径
jq '[.params[] | {param: .name, chain: [.. | objects | select(.source_type == "node") | {node: .source.name, out: .source.out_name}]}]' /tmp/t1.json

# 提取所有 parent_input
jq '.. | objects | select(.source_type == "parent_input")' /tmp/t1.json

# T2: 力矩.w
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 5 0 -c 计算分力 --json 2>/dev/null | grep -v "^数据流追溯" > /tmp/t2.json

# 向上追一层
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 5 0 -c 发送信号 --json 2>/dev/null | grep -v "^数据流追溯" > /tmp/t2b.json

# 用 jq -s 合并跨层关系
jq -s '[.[] | {layer: .node_name, source: (.params[0].parent_input // .params[0].source.name)}]' /tmp/t2.json /tmp/t2b.json

# T3: w衰减力矩 n=6 vs n=7
for n in 6 7; do npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" $n -c 力矩 --json 2>/dev/null | grep -v "^数据流追溯" | jq '{instance: ("n=" + (.node|tostring)), params: [.params[] | {name, type: .source_type, val: (.value // .parent_input // "?")}]}'; done

# T4: 统计 parent_input
jq '.. | objects | select(.source_type == "parent_input") | {name, parent: .parent_composite}' /tmp/t1.json | sort -u
```

### 3.4 Agent B 操作指南（树格式）

```bash
# T1: 计算合力 — 一次输出看到完整树
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 6 -c 计算分力

# T2: 力矩.w
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 5 0 -c 计算分力
# 根据 [上层调用] 提示向上追
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 5 0 -c 发送信号

# T3: w衰减力矩
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 6 -c 力矩
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 7 -c 力矩

# T4: 统计父输入直通 — 需要读完整棵树后手动计数
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 6 -c 计算分力
```

### 3.5 可信度验证方法

无论 agent 给出什么答案，必须手动验证：

```bash
# 验证方法 1: 直接跑工具看原始输出
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 6 -c 计算分力

# 验证方法 2: 对 JSON 模式跑相同查询对比
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 6 -c 计算分力 --json 2>/dev/null | grep -v "^数据流追溯"

# 验证方法 3: 深层节点单独验证
# 比如 Addition 的 InParam[1] 在树格式中显示 "← 父输入"，在 JSON 中是 "parent_input"
# 如果怀疑这个结果，可以直接追 Addition 的参数
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 4 -c 计算分力

# 验证方法 4: 跨文件验证（同一个复合在另一个 GIA 中是否一致）
npx tsx tests/composite/trace-dataflow.ts "复杂gia/弹球.gia" 计算合力 2>/dev/null
# 如果弹球.gia 中找不到，说明该复合可能特定于物理运动.gia
```

---

## 四、记录模板

### 每次测试会话的记录

```markdown
## 测试会话 #[编号]

日期: YYYY-MM-DD
Agent 型号: claude-opus-4-8 (默认)
输出模式: [json / tree]

### 任务清单

| # | 任务 | 工具调用次数 | agent 理解时间 | 结果准确度 | 信心评分 |
|---|------|------------|--------------|-----------|---------|
| T1 | 计算合力数据源 | | | /5 | /5 |
| T2 | 力矩.w → 终点 | | | /5 | /5 |
| T3 | w衰减力矩差异 | | | /5 | /5 |
| T4 | 父输入统计 | | | /5 | /5 |

### 定性反馈

1. 哪种输出格式更容易理解数据流结构？
2. 哪种格式在深层次（depth ≥ 3）时信息更清晰？
3. 是否出现过误读 depth/缩进的情况？
4. jq 查询的学习成本是否值得？
5. 使用中对工具产生了哪些疑问/误解？

### agent 自述

> (agent 在完成任务后的自我总结，包括遇到的困难、发现的规律、对工具的改进建议)
```

### 对比汇总模板

```markdown
## 汇总对比

| 维度 | 树格式 | --json + jq |
|------|--------|-------------|
| T1 准确度 | /5 | /5 |
| T1 耗时 | | |
| T2 准确度 | /5 | /5 |
| T2 耗时 | | |
| T3 准确度 | /5 | /5 |
| T3 耗时 | | |
| T4 准确度 | /5 | /5 |
| T4 耗时 | | |
| 总工具调用 | | |
| 学习成本 | 低 | 中（jq） |
| 误读风险 | 缩进误判 | JSON 结构误判 |
| agent 偏好 | | |

### 结论

> (建议长期使用哪种模式？是否需要两者兼有？对工具的改进建议)
```

---

## 五、参考文档

- 工具源码: `tests/composite/trace-dataflow.ts`
- 物理运动.gia 文档: `docs/composite-ir/handover/r4-passball-handover.md` (§ 文件路径)
- 数据流追溯设计: `docs/composite-ir/handover/r4-passball-handover.md` (§ 6.2, 8.6)
- 参数名来源: `docs/composite-ir/handover/r4-passball-handover.md` (§ 4.3)
- 类型系统: `docs/composite-ir/handover/r4-passball-handover.md` (§ 8.7)
- 复合定义 ↔ Impl 图映射: `docs/composite-ir/handover/r4-passball-handover.md` (§ 8.8)
- w衰减力矩 完整追溯记录: `docs/traces/w-decay-torque-trace.md`

### 关键陷阱回顾

1. **编译体参数省略**：protobuf 不存储直通父输入的 pin，不是"未连接"
2. **bConcreteValue.default**：Addition 的 InParam[1] 显示 `= 0` 但实际来自父输入"额外受力"，不要被字面默认值误导
3. **信号复合（which=14）**：call_site 检测不支持，需手动搜
4. **图变量是终点**：GetNodeGraphVariable 是数据流终点，继续追需要反向搜索 SetNodeGraphVariable
