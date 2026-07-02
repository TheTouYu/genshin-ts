# find-event-sources.ts 交接文档

> 本文档记录 `tests/composite/find-event-sources.ts` 工具的设计、实现和已知限制。
> 下一轮工作继续优化此工具。

---

## 一、工具概述

**文件：** `tests/composite/find-event-sources.ts`
**用途：** 分析 GIA 文件中主图的**执行流向**，识别**事件起点**（独立执行流触发源），并展示完整的执行流链。

### 核心概念

| 概念 | 说明 |
|------|------|
| 事件起点 | 没有被上游执行流调用、自身有 Branch 输出、没有 OutFlow 输入的节点 |
| 执行流 | Branch(kind=2) → OutFlow(kind=1) 连线构成的执行顺序 |
| Branch 输出名 | 节点的执行流输出引脚名（条件分支的"是/否"、Multiple Branches 的 case 值等） |
| OutFlow 输入名 | 复合节点执行流输入引脚名（物理运动控制器的"停止/v停止/开始运动"等） |

### CLI 用法

```sh
# 人类可读输出（默认）
npx tsx tests/composite/find-event-sources.ts <文件.gia>

# JSON 格式
npx tsx tests/composite/find-event-sources.ts <文件.gia> --json

# 查看节点 N 的引脚详情
npx tsx tests/composite/find-event-sources.ts <文件.gia> --detail=N
```

---

## 二、事件起点识别算法

### 四个条件（全部满足）

```
isEvent = !isCalled          # 没有被上游执行流调用
       && hasBranchOutput     # 有 Branch 输出
       && !hasOutflowPin      # 无 OutFlow pin（kind=1）
       && !compositeDefHasFlowInput  # 如果是复合，其 compiled body 的 compositePins 也没有映射 OutFlow
```

### 过滤示例

| 节点 | 是否事件起点 | 原因 |
|------|-------------|------|
| `When Entity Is Created` | ✅ | 系统事件，无上游，有 Branch |
| `复合:Update` | ✅ | 引擎特殊调用，有上行无上游 |
| `复合:监听信号` | ✅ | 信号触发，无 InOutFlow 输入 |
| `复合:print 4 vec` | ❌ | compositePins 映射了 OutFlow → 设计为被调用 |
| `Set Node Graph Variable` | ❌ | 有上游调用 |

### 关键检查：`compositeDefHasFlowInput`

对于复合节点（kind=22001），检查其**编译体(which=9)**的 `compositePins` 中是否存在 `outerPin.kind=1`（OutFlow 输入）的映射。如果有，说明这个复合设计为被上游调用 → 不是事件起点。

```ts
// examples/compositePins 中有 OutFlow 输入映射
innerNodeId=3 innerPin={kind:1, index:0} outerPin={kind:1, index=0}
              ↑ 内部节点接收执行流        ↑ 暴露为外部接口
```

---

## 三、分支命名规则

Branch 输出引脚名的解析优先级（5 级）：

### 第 1 级：复合节点（kind=22001）

从 `def.outflows[]` 数组中取 `name` 字段。

```json
// 例：条件branch 的 outflows
[
  {"name": "是", "index": {"kind": 2, "index": 0}},
  {"name": "是", "index": {"kind": 2, "index": 1}},
  {"name": "是", "index": {"kind": 2, "index": 2}},
  {"name": "是", "index": {"kind": 2, "index": 3}},
  {"name": "否", "index": {"kind": 2, "index": 4}}
]
```

注意：`f.name` 为空字符串 `""` 时跳过滤（JS 假值），退到第 5 级。

### 第 2 级：Multiple Branches（nid=3）

从 **InParam[1] 的 value** 中提取 case 值列表。
- Branch[1] = caseValues[0]
- Branch[2] = caseValues[1]
- ...
- Branch[n] = caseValues[n-1]

```ts
// 例：n=23 Multiple Branches 的 InParam[1]
// caseValues = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
// Branch[1] = "0", Branch[2] = "1", ...
```

`reflectMap` 说明 InParam[0] 是 Int 类型选择器、InParam[1] 是 Int 或 Str 类型列表。

### 第 3 级：Double Branch（nid=2）

固定约定：
- Branch[0] = `是`（True）
- Branch[1] = `否`（False）

### 第 4 级：其他系统节点

系统节点（kind=22000）的 `NODE_PIN_RECORDS.outputs[]` 存储的是**数据输出引脚名**（OutParam），其索引**不对应** Branch pin 索引。
因此直接从 `outputs[srcBranchIdx]` 取名会拿到数据输出名（如 `Ety`、`Gid`）而不是执行流输出名。

所以系统节点统一使用第 5 级数字命名（见下方）。

### 第 5 级：无名字 → 数字 1 索引

兜底：`String(srcBranchIdx + 1)` 显示为 `1`, `2`, `3`...

> 旧版曾在第 4 级尝试从 `NODE_PIN_RECORDS.outputs[]` 取系统节点的 Branch 名，但由于索引不对齐导致 "Ety" 等数据输出名被误作为 Branch 名。自 P0 修复后统一使用数字命名。

### 事件起点信息行显示输出参数

对于系统节点的事件起点，额外在信息行显示完整输出参数名列表 `(...)`：

```
n=38 [系统] When Entity Is Created
   Branch×1 纯执行流触发  (Ety, Gid)
```

这帮助理解事件源产生的数据（如 Entity 引用、Group ID 等），这些数据可以被下游节点的 InParam 消费。

---

## 四、目标 OutFlow 输入名

从目标节点的 `def.inflows[]` 数组中取 `name` 字段。

```json
// 例：物理运动控制器 的 inflows
[
  {"name": "停止",    "index": {"kind": 1, "index": 0}},
  {"name": "vy停止",  "index": {"kind": 1, "index": 1}},
  {"name": "v停止",   "index": {"kind": 1, "index": 2}},
  {"name": "w停止",   "index": {"kind": 1, "index": 3}},
  {"name": "w",       "index": {"kind": 1, "index": 4}},
  {"name": "v",       "index": {"kind": 1, "index": 5}},
  {"name": "开始运动", "index": {"kind": 1, "index": 6}},
  {"name": "停止run",  "index": {"kind": 1, "index": 7}},
  {"name": "启用run",  "index": {"kind": 1, "index": 8}},
  {"name": "接触地面", "index": {"kind": 1, "index": 9}}
]
```

对于**系统节点**的目标，OutFlow 输入名回退为 `InFlow[N]`。

---

## 五、数据流架构

### 输入数据：GIA 解码后结构

```ts
├── data.graph.graph.inner.graph   // 主图
│   ├── nodes[]                    // 主图节点列表
│   │   ├── nodeIndex
│   │   ├── genericId: { kind, nodeId }
│   │   └── pins[]
│   └── connections[]              // (仅IR编译格式)
├── data.accessories[]             // 附属项
│   ├── which=12 → compositeDef  (定义体)
│   ├── which=9  → graph        (编译体)
│   └── which=14 → 信号相关    (发送/接收)
│       ├── compositeDef.inner.def
│       │   ├── name, inputs[], outputs[]
│       │   ├── inflows[]   ← 执行流输入引脚名 (kind=1)
│       │   └── outflows[]  ← 执行流输出引脚名 (kind=2)
│       └── graph.inner.graph  (如果which=9)
│           ├── nodes[]
│           └── compositePins[]  ← 内外引脚映射
│               ├── innerNodeId, innerPin: {kind, index}
│               └── outerPin: {kind, index}
```

### 关键命名索引

```ts
compNames:        Map<defId, name>           // "物理运动控制器" → 1610612930
defToCompiled:    Map<defId, compiledId>      // 1610612930 → 1610612864
compInflows:      Map<defId, Map<outFlowIdx, name>>  // 1610612930 → {0: "停止", 1: "vy停止", ...}
compOutflows:     Map<defId, Map<branchIdx, name>>  // 1610612800 → {0: "是", 1: "否"}
caseValues:       Map<nodeIndex, string[]>    // 23 → ["0","1","2",...,"9"]
compiledHasFlowInput: Map<compiledId, boolean> // 1610612765 → true (print 4 vec 有OutFlow)
```

---

## 六、已知问题与限制

### 1. ~~分支数显示为 "×N~~下游" 而不是 "×N 分支"

~~✅ 已修复（P0）：改用 `unique srcBranchIdx` 计数，显示 ×N 分支~~

### 2. ~~嵌套分支树的展开仍可读性差~~

~~✅ 已修复（P0）：改用 `buildTree` + `printTree` 树形渲染，├─/└─/│ 对齐 + 正确缩进~~

### 3. ~~`--json` 输出只列出第一层~~

~~✅ 已修复（P0）：新增 `--depth=N` 参数，0=扁平，省略=全部展开~~

### 4. 没有可视化

只有文本输出。可以考虑加 `--dot` 输出 Graphviz DOT 格式，或 `--mermaid` 输出 Mermaid 流程图。

### 5. 不支持多层图内复合

只能分析主图。虽然可以在复合内部用 `trace-dataflow.ts` 追溯数据流，但事件起点工具不分析编译体内部的执行流。

### 6. ~~"Ety" 作为 Branch 名~~

~~✅ 已修复（P0）：系统节点统一使用数字 `1, 2, 3...` 作为 Branch 名（`NODE_PIN_RECORDS.outputs[]` 是数据输出名，索引不对应 Branch 索引）。同时事件起点信息行显示完整输出参数列表 `(Ety, Gid, ...)`。~~

### 7. 没有信号连接分析

`监听信号` / `发送信号` 的信号通道连接不在我们当前分析范围内。这些事件起点通过信号机制触发，但信号发射方的连接关系没有展示。

### 8. 复合节点事件起点不显示输出参数

目前只有系统节点（kind=22000）的事件起点显示输出参数名列表。复合节点（kind=22001）的信息从 `compositeDef.outputs[]` 获取，尚未集成。

---

## 七、下一轮可能的优化方向

### P1 级

1. **信号连接分析**：展示 `监听信号` 与 `发送信号` 的配对关系
2. **`--dot` / `--mermaid`**：可视化输出
3. **`--filter`**：按节点名/类型过滤事件起点

### P2 级

1. **跨图分析**：追踪事件起点在复合内部的执行流到主图边界
2. **统计摘要**：`--stats` 模式输出节点类型比例、分支数分布
3. **多层图嵌套展开**：`--expand <compositeName>` 展开指定复合内部的事件起点

---

## 八、关联文件

| 文件 | 说明 |
|------|------|
| `tests/composite/trace-dataflow.ts` | 数据流追溯工具（按数据输入链追踪） |
| `tests/composite/find-event-sources.ts` | 本工具 |
| `docs/composite-ir/handover/llm-handover-prompt-raw-gia-exploration.md` | GIA 原始数据探查指南 |
| `docs/composite-ir/handover/r7-trace-dataflow-tool-improvements.md` | trace-dataflow 改进记录 |
| `dist/src/thirdparty/.../protobuf/decode.js` | GIA 文件解码器 |
| `dist/src/thirdparty/.../node_data/node_pin_records.js` | 节点 pin 记录（节点名+输入输出类型） |
| `dist/src/compiler/gia_vendor.js` | NODE_ID 映射 |

---

## 九、设计笔记

### `which` 值的枚举

实际从 `物理运动.gia` 中发现的 `which` 值：
- `which=12` → 复合定义体（不是文档中说的 which=8！）
- `which=9` → 编译体
- `which=14` → 信号相关（发送信号、向服务器节点图发送信号）

### 复合节点的 `inflows` / `outflows`

复合定义的 full schema：
```json
{
  "inflows": [{"name": "", "index": {"kind": 1, "index": 0}, "pinIndex": N}],
  "outflows": [{"name": "是", "index": {"kind": 2, "index": 0}, "pinIndex": N}],
  "inputs": [{"name": "条件", "index": {"kind": 3, "index": 0}, "type": {...}, "pinIndex": N}],
  "outputs": [],
  "name": "条件branch"
}
```

- `inflows` 带 `index.kind=1` → OutFlow 输入
- `outflows` 带 `index.kind=2` → Branch 输出
- `inputs` 带 `index.kind=3` → InParam 数据输入
- `outputs` 带 `index.kind=4` → OutParam 数据输出

### Multiple Branches Case 值提取

```ts
// InParam[1] 的 value 结构
{
  "bArray": {
    "entries": [
      {"bInt": {"val": 0}},
      {"bInt": {"val": 1}},
      ...
    ]
  }
}
// Branch[n] = entries[n-1]
```

---

*交接时间：2026-07-02*
*下一轮负责人：待定*
