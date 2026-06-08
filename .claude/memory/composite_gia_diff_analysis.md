---
name: 复合节点 GIA 差异分析
description: 对比游戏参考文件与生成文件的结构差异，列出所有需要修复的问题
type: project
---

# 复合节点 GIA 差异分析（2026-06-08）

## 修复状态（2026-06-08 晚）

| 优先级 | 问题 | 状态 |
|--------|------|------|
| P0 | 主图 composite call 节点 (kind=22001) + relatedIds | ✅ 已修复 |
| P1 | impl graph 节点真实 pin 数据 + concreteId | ✅ 已修复 |
| P2 | compositePins 映射 (outer→inner) | ✅ 已修复 |
| P3 | accessories 过滤（仅输出调用的复合） | ✅ 已修复 |
| P4 | 杂项字段 (xxx=6, inflows, name, 坐标) | ✅ 已修复 |

测试结果：Part3 42/42, Game Demo 19/19. Accessories: A=4, B=2, C=2.

参考文件：用户从游戏导出的 `基本调用节点.gia`（一个最简单的 exec-only 复合 + 主图调用）
生成文件：`demo_A_basic_call.gia` / `demo_B_exec_call.gia` / `demo_C_nested_call.gia`

---

## 差异总览

| 维度 | 参考（游戏） | 生成（我们） | 严重度 |
|------|-------------|-------------|--------|
| accessories 数量 | 2（1 CompositeDef + 1 impl Graph） | 8（4× 成对） | 🔴 严重 |
| 主图复合调用节点 | 有（kind=22001, SysGraph） | 无 | 🔴 严重 |
| 主图节点来源 | 用户 event handler 的节点 | capture trigger 的节点 | 🔴 严重 |
| impl graph compositePins | 1 条（映射 outer→inner） | 0 条 | 🔴 严重 |
| impl graph node pins | 有完整 pin（含 kind/index/value） | 无 pin（空壳） | 🔴 严重 |
| impl graph node genericId.nodeId | 1（print_string） | 0 | 🟡 中等 |
| compositeDef inflows | 1（exec 入口） | 0 | 🟡 中等 |
| compositeDef xxx | 6 | 0 | 🟢 待确认 |

---

## 一、主图（顶层 graph）差异

### 1.1 参考主图结构

```
graph.which = 9 (EntityNode)
graph.name = "basic_call"
graph.graph.inner.graph.nodes = [
  {
    nodeIndex: 1,
    genericId: { class:10001, type:20000, kind:22000, nodeId:71 },  ← whenEntityIsCreated 事件节点
    pins: [
      {
        i1: { kind:2, index:0 },          ← OutFlow
        connects: [{ id:3, connect:{kind:1, index:0} }]  ← 连接到 nodeIndex=3 的 InFlow
      }
    ]
  },
  {
    nodeIndex: 3,
    genericId: { class:10001, type:20000, kind:22001, nodeId:1610613021 },  ← 复合调用节点 (SysGraph)
    pins: []                                                                ← 复合调用节点无 pin
  }
]
```

### 1.2 生成主图结构

```
graph.which = 9
graph.name = "demo_A_basic_call"
graph.graph.inner.graph.nodes = [
  {
    nodeIndex: 2,
    genericId: { class:10001, type:20000, kind:22000, nodeId:71 },  ← 事件节点
    pins: [
      { i1:{kind:4, index:0}, value:{class:1, ...} },  ← InParam（不应存在）
      { i1:{kind:4, index:1}, value:{class:1, ...} },  ← InParam（不应存在）
      { i1:{kind:2, index:0}, connects:[{id:3, connect:{kind:1, index:0}}] }  ← OutFlow → nodeIndex=3
    ]
  },
  {
    nodeIndex: 3,
    genericId: { class:10001, type:20000, kind:22000, nodeId:1 },  ← print_string（这是 capture trigger 的节点！）
    pins: [
      { i1:{kind:3, index:0}, value:{class:5, bString:{val:"capture-trigger"}} }  ← "capture-trigger" 字符串
    ]
  }
]
```

### 1.3 根因分析

**主图节点来自 capture trigger，而非用户 event handler。**

当前 `buildServerGraphRegistriesIRDocuments()` 流程：
1. 先跑用户的 `g.server().on('whenEntityIsCreated', ...)` → 注册到 MetaCallRegistry → 构建 IR 文档
2. 再跑 `captureRegistry`（临时 Registry）执行 `build()` → 捕获复合内部节点
3. capture trigger 的 `g.server({ name: 'demo_trigger' }).on(...)` 也在构建 IR 文档

问题：capture trigger 的 server graph 产生的节点（printString("capture-trigger")）混入了主图，而用户 handler 中的 **`callComposite()` 调用没有被转换为 GIA 中的 composite call 节点**（kind=22001, SysGraph）。

---

## 二、accessories 差异

### 2.1 数量差异

| | 参考 | 生成 |
|---|------|------|
| CompositeDef (which=12) | 1 | 4 |
| impl Graph (which=9) | 1 | 4 |

参考只包含主图实际调用的那 1 个复合节点。生成包含所有已定义的 4 个复合节点（双倍运算、三数求和、复合打印、嵌套增强），无论是否被调用。

### 2.2 CompositeDef 结构差异

**参考**：
```json
{
  "inflows": [{ "name":"", "visible":true, "index":{"kind":1,"index":0}, "pinIndex":1974 }],
  "outflows": [],
  "inputs": [],
  "outputs": [],
  "id": {
    "graphId": { "class":10000, "type":20000, "kind":21002, "id":1610612928 }
  },
  "type": { "kind":1000 },
  "xxx": 6
}
```

**生成（双倍运算）**：
```json
{
  "inflows": [],
  "outflows": [],
  "inputs": [
    { "name":"输入值", "visible":true, "index":{"kind":3,"index":0}, "type":{...}, "pinIndex":100 }
  ],
  "outputs": [
    { "name":"翻倍结果", "visible":true, "index":{"kind":4,"index":0}, "type":{...}, "pinIndex":200 }
  ],
  "id": {
    "graphId": { "class":10000, "type":20000, "kind":21002, "id":1610710000 }
  },
  "type": { "kind":1000 },
  "xxx": 0
}
```

差异：
- **inflows 为空** — 数据复合也应该有一个默认的 inflow（参考的 pinIndex=1974）
- **xxx 字段** — 参考=6，生成=0，可能影响行为

### 2.3 impl Graph 节点差异

**参考 impl 节点**：
```json
{
  "nodeIndex": 2,
  "genericId": { "class":10001, "type":20000, "kind":22000, "nodeId":1 },
  "concreteId": { "class":10001, "type":20000, "kind":22000, "nodeId":1 },
  "pins": [
    {
      "connects": [],
      "i1": { "kind":3, "index":0 },
      "i2": { "kind":3, "index":0 },
      "value": { "class":5, "alreadySetVal":true, "bString":{"val":"测试"} },
      "type": 6
    }
  ],
  "x": 0, "y": 0
}
```

**生成 impl 节点**：
```json
{
  "nodeIndex": 2,
  "genericId": { "class":10001, "type":20000, "kind":22000, "nodeId":0 },
  "pins": [],
  "x": 108.12, "y": 104.45
}
```

差异：
- **nodeId=0** — 应该是真实的节点 ID（如 addition=某个ID, print_string=1）
- **pins=[]** — 完全空，应该有正确的 pin 结构（kind/index/value）
- **concreteId 缺失** — 参考有，我们没有
- **坐标随机** — 参考为 {0,0}，我们用 Math.random()

### 2.4 compositePins 差异

**参考**：
```json
[{
  "outerPin": { "kind":1, "index":0 },
  "innerNodeId": 2,
  "innerPin": { "kind":1, "index":0 },
  "innerPin2": { "kind":1, "index":0 }
}]
```

**生成**：`[]` — 空数组。

compositePins 是连接 "复合节点的外部接口 pin" 与 "内部实现图的节点 pin" 的映射。参考中把 outer InFlow (kind=1, index=0) 映射到 inner node 2 的 InFlow (kind=1, index=0)。这是我们完全没有实现的。

---

## 三、完整修复清单（按优先级）

### P0 — 主图必须包含 composite call 节点
- `callComposite()` 在主图 flow 中应注册一个 `kind=22001` (SysGraph) 节点
- 该节点的 `genericId.nodeId` 等于 CompositeDef 的 ID
- 该节点引用对应 accessories 中的复合定义
- **不应该**：capture trigger 的节点混入主图

### P1 — impl graph 节点需要真实 pin 数据
- `buildImplGraphNodes()` 当前生成空壳节点
- 需要从 `CompositeCapture` 中的 `MetaCallRecord` 提取真实的 pin 信息
- 需要设置正确的 `nodeId`（如 addition、print_string 等的 node_id）
- 需要设置 `concreteId`

### P2 — compositePins 映射
- 需要为 impl graph 生成 compositePins
- 映射 outer pin（复合接口）→ inner pin（实现节点）
- outer pins 类型包括：InFlow (kind=1), OutFlow (kind=2), InParam (kind=3), OutParam (kind=4)

### P3 — accessories 过滤
- 只包含主图实际调用的复合节点定义
- 未被引用的复合不应出现在 accessories 中

### P4 — 杂项
- `xxx` 字段值（参考=6）
- inflows 默认值
- `concreteId` 字段
- impl graph name（参考为空串 `""`，我们填了 `"双倍运算_impl"`）
- 节点坐标（参考为 {0,0}）

---

## 四、参考数据来源

- 参考文件：`C:\Users\touyu\AppData\LocalLow\miHoYo\原神\BeyondLocal\Beyond_Local_Export\user_edit\基本调用节点.gia`
- 备份路径：`/tmp/composite-game-demo/user_ref_basic_call.gia`
- 生成文件：`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/demo_*.gia`
