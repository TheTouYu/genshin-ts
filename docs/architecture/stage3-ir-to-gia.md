# 阶段三：IR JSON → .gia — 中间表示到二进制 GIA

> 本文档描述编译管线第三阶段：如何将 IR JSON 转换为游戏可识别的二进制 `.gia` 文件，包括节点映射、引脚设置、布局、复合节点编码和 timer 优化。

---

## 1. 概述

**目标**：读取 IR JSON，经过多步处理（预处理→节点映射→ID解析→Pin设置→布局→编码），最终产出 protobuf 编码的二进制 `.gia` 文件。

**位置**：`src/compiler/ir_to_gia_transform/`

**输入**：IR JSON（阶段二的产物）

**输出**：二进制 `.gia` 文件

---

## 2. 架构总览

```
irToGia(ir, opts)
  │
  ├─ 1. expandListLiterals(ir)          ← 预处理：展开列表字面量
  │
  ├─ 2. optimizeTimerDispatchAggregate() ← timer 分发聚合优化
  │
  ├─ 3. buildExecutionGraph(ir.nodes)   ← 构建执行图结构
  │     → 提取执行流连线、数据流连线、根节点
  │
  ├─ 4. layoutPositions(ir.nodes, info) ← 自动布局计算
  │
  ├─ 5. buildConnTypeIndex(ir)          ← 建立连线类型索引
  │
  ├─ 6. applyGraphVariables()           ← 创建图变量节点
  │
  ├─ 7. 遍历 IR 节点，为每个节点：
  │    ├─ resolveGiaNodeId()            ← TS 节点名 → GIA 节点 ID
  │    ├─ new Node(…).setPos(…)         ← 创建 GIA 节点 + 位置
  │    ├─ applySpecialArgs()             ← 特殊节点参数处理
  │    ├─ applyGenericArgs()             ← 常规节点参数处理
  │    └─ filterUnkPins()               ← 过滤未知引脚
  │
  ├─ 8. 建立连线：
  │    ├─ flow() 执行流连线
  │    └─ connect() 数据连线
  │      └─ remapInputIndexForHiddenPin() ← 引脚索引修正
  │
  ├─ 9. 处理复合节点：
  │    ├─ 修正 InParam/OutParam pins
  │    ├─ 终端/非终端复合 OutFlow 处理
  │    └─ 编码 CompositeDefIR → accessories
  │
  └─ 10. 编码：
       ├─ graph.encode()                ← 编码为 protobuf 内表示
       └─ wrap_gia(rootMessage, root)   ← 包装为最终 GIA 二进制
```

---

## 3. 关键子模块

### 3.1 preprocess.ts — IR 预处理

**功能**：IR JSON 的语法糖展开。

核心逻辑 `expandListLiterals`：

当 IR 节点的某个参数是**列表字面量**（如 `{ type: 'int_list', value: [1, 2, 3] }`），预处理会自动：

1. 创建一个新的 `assembly_list` 数据节点
2. 将列表字面量拆为 `assembly_list` 节点的独立参数
3. 将原参数替换为 `conn` 类型（引用新节点）

```typescript
// 变换前
{ id: 5, type: 'someNode', args: [
  { type: 'int_list', value: [1, 2, 3] }  // 列表字面量
]}

// 变换后
{ id: 5, type: 'someNode', args: [
  { type: 'conn', value: { node_id: 100, index: 0, type: 'int_list' } }
]}
// + 新节点
{ id: 100, type: 'assembly_list', args: [
  { type: 'int', value: 1 },
  { type: 'int', value: 2 },
  { type: 'int', value: 3 }
]}
```

### 3.2 mappings.ts — 类型名映射

**功能**：将 TS/IR 中使用的人类可读名称映射到游戏 vendor 内部的数字 ID。

提供两套映射：

| 映射 | 源 | 目标 |
|------|-----|------|
| `NODE_ID_LOWER` | 字符串节点名（小写） | 节点类型数字 ID |
| `ENUM_ID_LOWER` | 枚举类型名（小写） | 枚举类型数字 ID |
| `ENUM_VALUE_LOWER` | 枚举值名（snake_case） | { enumId, enumValue } 对 |

此外，`ENUM_VALUE_MAPPINGS` 为 enum.ts 中使用的"单数"形式命名和 vendor 的"复数"命名之间的差异提供桥接。

### 3.3 node_id.ts — 节点 ID 解析

**功能**：确定 IR 节点的类型名在 vendor 系统中的对应数字 ID。

核心函数 `resolveGiaNodeId`：

```typescript
function resolveGiaNodeId(irNode, connIndex, varsByName, runtimeMode): number {
  // 1. 查找 SPECIAL_NODE_IDS（内置节点，如 exec fork、multiple_branches 等）
  // 2. 从 NODE_ID_LOWER 映射中找到对应的 vendor 节点 ID
  // 3. 某些节点有 mode-specific 的 ID（beyond 模式 vs classic 模式）
  //    如 teleport_player → beyond:288, classic:805
}
```

`buildConnTypeIndex` 函数遍历所有节点参数，建立 `node_id → pin_index → ConnTypeInfo` 的索引，用于跟踪每个数据引脚的连接类型。

### 3.4 pins.ts — 引脚值设置

**功能**：为 GIA 节点的引脚设置字面量值。

关键函数：

- `setLiteralArgValue(giaNode, pinIndex, argIndex, nodeType, argType, value)` — 通用值设置
- `setEnumArgValue(giaNode, pinIndex, argIndex, nodeType, value)` — 枚举值设置
- `setClientExecLiteralArgValue(giaNode, pinIndex, argIndex, nodeType, argType, value)` — 客户端执行字面量设置

枚举值设置需要将 TS 侧的枚举名字符串（如 `"comparison_operator_equal_to"`）通过 `parseEnumValue` 解析为 `{ enumId, enumValue }` 数字对。

### 3.5 layout.ts — 自动布局

**功能**：为所有 GIA 节点计算在编辑器中的可视化位置。

布局策略：

```typescript
function layoutPositions(irNodes, graphInfo) {
  // 1. 识别执行图的根节点（没有入边的节点）
  // 2. 以根节点为起点，DFS 遍历执行链：
  //    → 从左到右排列（column * columnWidth）
  //    → 超出最大列数时折行（row * wrapHeight）
  //    → 检测碰撞并自动下移
  // 3. 数据节点放在其消费者的左侧（-300px）
  //    → 多个数据节点垂直堆叠
  // 4. 游离节点（无连线关联）放在左上角独立网格
}
```

默认布局参数：
- `columnWidth`: 800 单位
- `rowHeight`: 600 单位
- `maxColumns`: 50
- `eventGap`: 600 单位（不同事件之间的垂直间距）

布局位置在编码时被除以 300/200（x/300, y/200）以适配 GIA 编辑器坐标系统。

### 3.6 optimize_timer_dispatch.ts — Timer 优化

**功能**：将分散的 timer 分发调用聚合为结构化的 dispatch 节点。

优化的前提是 `timerDispatchAggregate` 选项开启。

---

## 4. 特殊节点处理

`applySpecialArgs` 函数处理一系列需要特殊参数布局的节点：

| 节点类型 | 特殊处理 |
|----------|----------|
| `assembly_list` | pin0 为元素数量，元素从 pin1 开始 |
| `assembly_dictionary` | pin0 为 kv 参数总数，k/v 从 pin1 开始 |
| `multiple_branches` | pin0 = 控制表达式，pin1 = case 值列表 |
| `send_signal` / `monitor_signal` | 信号名用 exec 字面量而非数据引脚；信号参数单独创建 data pins |
| `create_prefab` / `create_prefab_group` | 插入 null 占位适配废弃参数空洞（pin4） |
| `set_custom_variable` / `remove_unit_status` | 插入 null 占位适配隐藏 pin |
| `get_node_graph_variable` | 额外添加变量名的 Str pin（用于名称自动补全） |

### Hidden Pin 索引修正

某些节点在 vendor 定义中存在隐藏/废弃的引脚，导致 IR 参数索引与 GIA pin 索引不对齐。`remapInputIndexForHiddenPin` 和 `remapOutputIndexForHiddenPin` 函数处理这些偏移：

```typescript
// 例：set_custom_variable 的 pin3 是隐藏的
// IR args: [A, B, C, D]  ← D 本应对应 pin4
// GIA pin: [0, 1, 2, 3(hidden), 4]
// 索引 >=3 的需要 +1
```

---

## 5. 复合节点编码

复合节点在阶段三中有专门的处理逻辑，集中在 `composite.ts` 和 `ir_to_gia_transform/index.ts` 中的相关代码。

### 5.1 GIA 中的复合节点

复合节点（Composite）在 GIA 中被编码为：

1. **调用标记节点**（`__composite_call__`）：在主子图中作为一个特殊节点，具有 `SysGraph` 类型（kind=22001）
2. **定义 accessories**：复合节点的完整定义被编码为 GIA 文件的 accessories（附件数据段）

### 5.2 calledCompositeIds 管理

```
在遍历 IR 节点时提取:
  if (nodeType === '__composite_call__') {
    compositeId = args[0]  // 第一个参数是 compositeDefId
    calledCompositeIds.push(compositeId)
  }
```

所有被调用的复合 ID 被记录到 `root.graph.relatedIds` 字段。

### 5.3 OutFlow 终端/非终端处理

- **非终端复合**：OutFlow 引脚有 connects（连线），正常保留
- **终端复合**：OutFlow 引脚无 connects，移除 OutFlow，将下游断连的节点收归到 event 的 fork 节点

---

## 6. GIA 编码

### 6.1 编码流程

```typescript
// 1. 使用 thirdparty 的 Graph 类构建内部表示
const graph = new Graph(serverMode, uid, name, graphId)
// 2. 添加每个节点（含位置、引脚值）
graph.add_node(giaNode)
// 3. 添加执行流连接
graph.flow(from, to, fromIndex, toIndex)
// 4. 添加数据连接
graph.connect(from, to, fromIndex, toIndex)
// 5. 编码为 protobuf 内部结构
const root = graph.encode()
// 6. 用 protobuf 编码为二进制
const buffer = wrap_gia(rootMessage, root)
```

### 6.2 protobuf 序列化

使用 `protobufjs` 库。GIA 的 protobuf schema 定义在：

`src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.ts`

通过 `loadGiaProto(protoPath)` 加载，核心消息类型：

- `Root`  — 顶层消息（包含 accessories、graph 等）
- `NodeGraph` — 节点图定义消息

---

## 7. 并行执行

阶段三支持多 GIA 并行编码：

```typescript
writeGiaFromIrJsonFiles(tasks, opts)
  // 通过 spawn(tsx, [runner, irPath, outPath, ...]) 启动子进程
  // 默认并行数 = cpu 核心数 - 1
  // 进度通过 stderr 的 [ok] 前缀行通知
```

单个 `ir_to_gia_transform/runner.ts` 接收命令行参数：`irPath outPath preserveIndices includeIndices`。
