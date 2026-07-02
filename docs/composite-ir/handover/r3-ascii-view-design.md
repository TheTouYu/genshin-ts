# GIA 可视化设计文档：从 jq 类比到分层视图体系

## 1. jq 为什么能处理任意复杂的 JSON？

```
echo '{"a":{"b":[1,2,3],"c":{"d":"hello"}}}' | jq .
{
  "a": {
    "b": [1, 2, 3],
    "c": {
      "d": "hello"
    }
  }
}
```

jq 成功的核心原因：

| 属性 | 说明 | 对 GIA 的启示 |
|------|------|---------------|
| **统一抽象** | 所有 JSON 都由同一套类型构成（obj/arr/str/num/bool/null） | GIA 也需要一套对节点和连线的统一抽象 |
| **结构递归** | `{"a":{"b":...}}` — 任何深度层级用同一套访问方式 | GIA 也需要递归可寻址 |
| **渐进披露** | 先显示全貌（结构骨架），再按需深入细节 | GIA 也需要分层展示 |
| **路径寻址** | `.a.b[0]` 唯一标识任何数据 | GIA 需要自己的寻址方案 |
| **视图过滤** | `jq '{a: .a.b}'` 只提取想看的部分 | GIA 需要局部/筛选视图 |
| **惰性求值** | 不展开整个文档，按需渲染 | GIA 也需要只渲染当前关注的子图 |

**关键洞察**: jq 不依赖 JSON 的大小，它依赖 JSON 的**结构规律性**。无论多复杂，JSON 都在重复同样的模式（key-value → array → scalar）。GIA 也需要找到这种规律性。

---

## 2. GIA 文件的"语义结构" vs "protobuf 结构"

### Protobuf 结构（物理存储）

```
Root
├── graph: GraphUnit (主图)
│   ├── which: 9=EntityNode, 12=CompositeGraph
│   ├── graph → NodeGraph (for which=9)
│   │   ├── nodes[]: GraphNode
│   │   │   ├── nodeIndex, x, y
│   │   │   ├── genericId (class/type/kind/nodeId)
│   │   │   ├── pins[]
│   │   │   │   ├── i1/i2: Index (kind={InFlow,OutFlow,InParam,OutParam}, index)
│   │   │   │   ├── connects[]: {id, connect, connect2}
│   │   │   │   └── value: VarBase
│   │   │   └── ...
│   │   ├── compositePins[]
│   │   └── graphValues[]
│   └── compositeDef → CompositeDef (for which=12)
│       ├── inflows[], outflows[]
│       ├── inputs[], outputs[]
│       └── ...
├── accessories[]: GraphUnit[]
│   ├── [0] CompositeDef (which=12) → 复合定义接口
│   └── [1] NodeGraph (which=9) → 复合实现图
└── filePath, gameVersion
```

### 语义结构（用户关心的）

```
GIA 文件
├── 事件 (Events) — 由 event 根节点标识
│   ├── Event A: whenEntityIsCreated (nid=71)
│   │   └── 执行链 (Exec Chain)
│   │       ├── Node A1 (kind=22000, 功能节点)
│   │       │   ├── 数据输入: [变量获取, 运算, ...]  ← InParam 连线
│   │       │   └── 控制输出: Node A2               ← OutFlow 连线
│   │       ├── Node A2 (kind=22001, 系统调用)
│   │       │   ├── 数据输入: [实体获取, 坐标, ...]
│   │       │   └── 分支
│   │       │       ├── true → Node A3
│   │       │       └── false → Node A4
│   │       └── ...
│   └── Event B: whenTimerIsTriggered (nid=73)
│       └── ...
├── 复合定义 (Composite Definitions) — accessories 中 which=12
│   ├── 复合 "顺序执行"
│   │   ├── 接口: 1 inflow, 4 outflows, 0 inputs, 0 outputs
│   │   └── 实现图: 5 节点, 4 边
│   └── 复合 "多出口复合"
│       └── ...
└── 图变量 (Graph Variables)
    └── 变量定义列表
```

### 关键障碍

| 障碍 | 原因 | 解决 |
|------|------|------|
| 扁平节点数组 | protobuf 把事件、执行节点、数据节点全放在一个 `nodes[]` 里 | 需要**拓扑重建**——从 exec 连线推出事件/链/分支 |
| 隐式事件边界 | 不同事件在同一个图里，只靠 Y 坐标间距隔开 | 用 exec 连线的根节点识别事件，Y 坐标辅助验证 |
| 数据节点散落 | getVariable/addition 等数据节点散布在 exec 链之间，位置由布局算法决定 | 数据节点作为 exec 节点的附属元素展示 |
| 复合分离 | 复合定义和实现图在 accessories 中，通过 ID 关联 | 建立复合名→实现图的映射 |

### GIA 的递归结构

GIA 不仅是一个大图——它包含**嵌套的子图**，形成递归结构：

```
文件
├── 主图 (nodes[])
│   ├── 事件 A → exec 链
│   │   └── __composite_call__ 节点 ──── 引用了某个复合定义
│   └── 事件 B → exec 链
│       └── ...
├── accessories[]
│   ├── [0] 复合定义 "顺序执行"  ← 被事件 A 引用
│   │   └── impl 图 ── 小规模图
│   │       └── 可能又包含 __composite_call__ (嵌套)
│   ├── [1] 复合定义 "分支"     ← 可能被其他复合引用
│   │   └── impl 图
│   └── ...
└── 图变量
```

这种递归性质是 JSON 也有的：`{"a": {"b": {"c": ...}}}`。而 GIA 的递归通过 **composite_call → 复合定义 → impl 图 → composite_call → ...** 形成。

---

## 3. "全貌"（Full Picture）的定义

对 JSON，全貌是骨架结构：

```json
{
  "a": { "b": [1,2,3], "c": {...} },
  "d": "hello",
  "e": [...]
}
```

对 GIA，全貌也应该是有层次的骨架：

### Level 0 — 文件摘要

```
## 传球.gia
主图: 24 节点, 17 exec 边, 4 事件
├── 事件 0: whenTimerIsTriggered (nid=73, n=1)
│   └── exec 链: 7 节点, 0 分支
├── 事件 1: (未识别事件类型, n=3, Y=-1414)
│   └── exec 链: 15 节点, 2 分支
├── 事件 2: whenEntityIsCreated (nid=71, n=39, Y=-1701)
│   └── exec 链: 6 节点, 0 分支
└── 游离 exec 链: 2 节点 (n=20, n=52)

Accessories: 6 子图 (2 复合定义 + 4 实现图)
复合定义: 2 个
图变量: 3 个

ℹ 用 --tree 查看执行链拓扑
ℹ 用 --event 0 --tree 只看事件 0
ℹ 用 --node 42 查看节点详情
```

### Level 1 — 事件级拓扑

```
事件: whenTimerIsTriggered (n=1, Y=-470)
  1 n=1  When Timer Is Triggered
  └── n=2  Set Node Graph Variable (nid=1610612902)
      ├── n=7  Multiple Branches (nid=3)
      │   ├── n=4  (nid=1610612905)
      │   │   └── n=9  Print String (nid=739)
      │   │       ├── n=19  Get Node Graph Variable
      │   │       └── n=23  Get Node Graph Variable
      │   └── n=12  (nid=1610612909)
      └── n=8  (nid=1610612834)
```

### Level 2 — 节点详情

```
Node 7: Multiple Branches (nid=3)
  Position: (-28, -346)
  Kind: 22000 (syscall/SysNode/UserDef)
  └─ Pins:
       InFlow:  ← Node 2 (OutFlow[0])
       InParam[0]: T = Entity (from Node 2 OutParam[0])
       OutFlow[0]: → Node 4
       OutFlow[1]: → Node 5
       OutParam[0]: → Node 4 InParam[1]
```

---

## 4. 三个核心概念

### 4.1 范围（Scope）——带范围查看全貌

"全貌"不等于"全部节点"——全貌 = **范围内全部结构信息**。

```
jq 的类比:  .a.b  是 {'a':{'b':...}} 这个范围的"全貌"
```

GIA 的范围按层次定义：

| 范围 | 选中内容 | jq 类比 |
|------|---------|---------|
| `file` | 整个文件：主图 + accessories + 变量 | `.` |
| `event[0]` | 事件 0 的 exec 链 + 其数据节点 | `.events[0]` |
| `node[7]` | 节点 7 的 1-hop 邻域 | `.nodes[7]` |
| `composite("顺序执行")` | 复合定义接口 + impl 图全部节点 | `.composites["顺序执行"]` |
| `composite("顺序执行").impl` | impl 图节点 | 同上 `.impl` |
| `accessory[3]` | accessory 3 的全部节点 | `.accessories[3]` |

在范围内查看"全貌" = 展示范围内全部节点 + 所有内部连线 + 结构骨架。

### 4.2 详情（Detail）——查看任一个节点的完整信息

每个节点有完整的 protobuf 数据和语义信息。查看"详情"= 展示该节点的全部字段、全部引脚、全部连接。

```
gia 传球.gia --node 7 --detail

Node [7]  Multiple Branches  (nid=3)
  Metadata:
    kind=22000 (SysNode/SysCall)  class=10001  type=20000
    pos=(-28, -346)

  Pins:
    InFlow[0]:  ← Node 2 OutFlow[0]

    OutFlow[0]: → Node 4
    OutFlow[1]: → Node 5

    InParam[0] type=Entity  value=<connected>
      ← Node 2 OutParam[0]  (target=null)
      connect2: ({kind:1, index:0}, null)

    InParam[1] type=List<Entity>  value=<connected>
      ← Node 11 OutParam[0]

    OutParam[0] type=Int  value=<connected>
      → Node 12 InParam[2]

  反向引用（谁连到了我）:
    ← Node 2 OutFlow → 我 InFlow
    ← Node 2 OutParam → 我 InParam[0]
    ← Node 11 OutParam → 我 InParam[1]
    ← Node 20 InParam → 我 OutParam[0]  ? (验证连接方向)
```

### 4.3 递归（Recursion）——复合节点当作小规模节点图

```
jq 的递归:  jq '.. | .a?'  在树中向下钻取任意深度
```

GIA 的递归通过 composite_call → composite_definition → impl_graph → composite_call 形成：

```
文件                         ← 根范围
└── 主图                     ← 范围: 主图节点
    └── 事件 0                ← 范围: 事件 0 的 exec 链
        └── exec 链           ← 范围: 一串 exec 节点
            └── Node 2 (__composite_call__)
                └── ▼ 递归展开     ← 进入复合定义
                    复合 "顺序执行"   ← 新范围：复合定义
                    └── impl 图      ← 范围：impl 图节点
                        ├── Node X (Double Branch)
                        ├── Node Y (Print String)
                        └── Node Z (__composite_call__) ← 可能嵌套
                            └── ▼ 递归展开
                                复合 "子复合"
                                └── ...
```

**关键机制**：`__composite_call__` 节点的 `genericId.nodeId`（或 `concreteId.nodeId`）对应一个复合定义的 ID。通过 `accessories` 中的 CompositeDefWrapper 找到定义 → 再找到对应的 impl 图 → 递归查看。

这就是"复合节点就是一个小规模节点图"的精确含义：**任何 __composite_call__ 节点都是一个指向子图的指针，可以递归展开**。

---

## 5. 寻址方案（GIA Path + Scope）

### Scope 作为寻址单元

```
gia <文件> <路径> [选项]
```

路径 = scope 链，用 `.` 分隔递归层级：

```
gia 传球.gia .                           # scope = 文件级全貌
gia 传球.gia .event.0                    # scope = 事件 0
gia 传球.gia .event.0.chain              # scope = 事件 0 的 exec 链
gia 传球.gia .event.0.chain.2            # scope = 第 3 个 exec 节点
gia 传球.gia .node.7                     # scope = 全局节点 7
gia 传球.gia .composite.顺序执行          # scope = 复合 "顺序执行"
gia 传球.gia .composite.顺序执行.impl     # scope = 其 impl 图
```

**递归寻址**（复合展开）：

```
gia 传球.gia .event.0.chain.2                    # 节点 2 的详情
gia 传球.gia .event.0.chain.2.composite          # 展开节点 2 调用的复合
gia 传球.gia .event.0.chain.2.composite.impl     # 复合实现图的节点
gia 传球.gia .event.0.chain.2.composite.impl.3   # 实现图中的节点 3
```

**路径解析规则**：

| 路径段 | 含义 |
|--------|------|
| `.` 或空 | 文件本身 |
| `.event.N` | 第 N 个事件（按 root 节点排序）|
| `.node.N` | 全局第 N 号节点 |
| `.composite.名称` | 按名称匹配的复合定义 |
| `.chain` | 当前 scope 的 exec 链（用于 event scope）|
| `.chain.N` | exec 链中的第 N 个节点 |
| `.impl` | 复合定义的实现图 |
| `.data` | 当前节点的数据输入 |
| `.connections` | 当前节点的全部连接 |
| `.N` | 整数——在子图范围中按 nodeIndex 查找节点 |

### 简写 CLI 参数

```
gia 传球.gia                  # 隐含 .summary（自动模式）
gia 传球.gia --event 0        # 等价于 .event.0
gia 传球.gia --node 7         # 等价于 .node.7
gia 传球.gia --composite 顺序执行  # 等价于 .composite.顺序执行
gia 传球.gia --tree           # 当前 scope 用 tree 视图
gia 传球.gia --detail         # 当前 scope 用 detail 视图
gia 传球.gia --full           # 当前 scope 用 full ASCII 视图
```

---

## 6. 视图 + 渲染策略

### 视图类型

| 视图 | 含义 | 适用 scope |
|------|------|-----------|
| **summary** | 范围内全部元素的概要（counts + 名称列表） | 文件/事件/复合 |
| **tree** | 范围内的 exec 拓扑树 | 事件/复合.impl |
| **detail** | 范围内各元素的完整 protobuf 数据 | 单节点 |
| **full** | 2D ASCII 精确位置渲染 | 小图 (≤15 节点) |

### 自动视图选择

```
范围内节点数
├── 0-3:     full（当前 ASCII 渲染）
├── 4-15:    tree（可选 full）
├── 16-50:   summary → tree（默认，可分步深入）
└── 50+:     summary 强制（明确指定 --tree 或 --full 才展开）
```

### 分页机制（Page）

#### 为什么需要分页

基于实际 GIA 数据分析：

| 文件 | 主图节点 | exec 根节点 | exec 链长度 | 数据节点数 |
|------|---------|-----------|-----------|----------|
| 传球.gia | 24 节点 (24KB) | 10 roots, 3 有 exec | 7-9 节点/链 | ~17/24 |
| 弹球.gia | 74 节点 (56KB) | 49 roots, ~6 有 exec | 6-11 节点/链 | ~60/74 |
| 物理运动.gia | 68 节点 (119KB) | 未知 | 未知 | ~50/68 |

核心矛盾：
- exec 链本身不长（≤11 节点），**不需要分页**
- 但数据节点占 60-80%，使总节点很大
- **全 ASCII 渲染**撑爆屏幕（Y 范围过大）

#### 分页策略

分页不是对 exec 链分页，而是对 **完整渲染的输出分页**。每个视图的分页机制不同：

| 视图 | 分页单位 | 说明 |
|------|---------|------|
| **summary** | 不分的（一页） | 摘要本身很短 |
| **tree** | 默认不分的（exec 链通常 <15 节点）| 如果 exec 链 >20 节点，分页 |
| **full** | **Y 范围切片** | 每次只渲染 Y:[min+page*step, min+(page+1)*step] 的节点 |
| **detail** | 不分的（单节点） | 一页 |

**full 视图的分页**：

```
gia 传球.gia --full               # 自动：太大 → 提示用 --page
gia 传球.gia --full --page 1      # 第 1 页：Y [-500, 0] 范围的节点
gia 传球.gia --full --page 2      # 第 2 页：Y [-1000, -500]
gia 传球.gia --full --page 0 --page-size 600  # 自定义页大小
```

实战示例：

```
# 传球.gia 主图 Y 范围 ≈ [-1841, 504]
gia 传球.gia --full --page 0 --page-size 500
  # 渲染 Y=[-1841, -1341] 的节点（n=39~48 的 chain）
gia 传球.gia --full --page 1 --page-size 500
  # 渲染 Y=[-1341, -841] 的节点（可能为空区域）
gia 传球.gia --full --page 2 --page-size 500
  # 渲染 Y=[-841, -341] 的节点（n=3~8 等）
gia 传球.gia --full --page 3 --page-size 500
  # 渲染 Y=[-341, 159] 的节点（n=7~9 等 + 终端节点）
```

**tree 视图的自动分页**（超过 20 exec 节点时）：

```
gia 物理运动.gia --tree            # 自动分页
  # 输出第 1 页的前 15 个 exec 节点
  # 最后一行: "... page 1/3 (15/42 nodes, use --page 2)"
```

**分页参数**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--page N` | 0（自动） | 页码，0 开始 |
| `--page-size N` | 依视图：full=800px, tree=15 节点 | 每页大小 |
| `--pages` | - | 列出总页数和每页内容概要 |

### 复合展开策略

在 tree 视图中遇到 `__composite_call__` 节点：

```
  ├── [2]  __composite_call__ → "顺序执行"  [按 ? 展开]
  │   ├── [2.0]  Double Branch
  │   │   ├── [2.1]  Print String
  │   │   └── [2.2]  Print String
  │   └── [2.3]  ...

  └── [3]  ...
```

默认折叠，`--recurse[=N]` 展开 N 层。

---

## 7. 实现架构

### Scope 数据模型

```
interface Scope {
  label: string            // 范围标签，如 "event[0]" "composite:顺序执行"
  nodes: NodeView[]        // 范围内的节点视图
  edges: EdgeView[]        // 范围内的边
  children?: Scope[]       // 下级范围（递归用）
  parentScope?: Scope      // 上级范围
}

interface NodeView {
  nodeIndex: number
  kind: number
  nodeId: number
  name: string
  pos: { x: number, y: number }
  pins: PinView[]
  incomingConnections: ConnectionView[]  // 反向引用
  compositeRef?: string    // 如果是 composite_call，指向哪个复合
}

interface PinView {
  kind: 'InFlow'|'OutFlow'|'InParam'|'OutParam'
  index: number
  typeName?: string        // 解析后的类型名
  value?: any              // 如果是常量值
  connects: { toNode: number, toPin: PinRef }[]
}

interface ConnectionView {
  fromNode: number, fromPin: PinRef
  toNode: number, toPin: PinRef
}
```

### 模块划分

```
tests/composite/gia-view.ts
│
├── 1. 加载层 (loader/)
│   ├── decode.ts           — 复用 decode_gia_file
│   ├── nameMap.ts          — 复用 NODE_PIN_RECORDS 名映射
│   └── compositeIndex.ts   — 建立 composite Id → 定义 + impl 图的映射
│
├── 2. 拓扑层 (topology/)
│   ├── edges.ts            — extractExecEdges, extractDataEdges
│   ├── roots.ts            — findRootNodes, groupNodesByComponent
│   ├── eventGroups.ts      — groupByEvent: 按 event root 分组 exec 链
│   ├── trace.ts            — buildExecChain: DFS 遍历+树结构
│   ├── dataFlow.ts         — findDataInputs, findDataOutputs
│   └── compositeRef.ts     — resolveCompositeRef: composite_call → 定义
│
├── 3. 范围层 (scope/)
│   ├── resolver.ts         — 路径解析: ".event.0.chain" → Scope
│   ├── buildScope.ts       — 根据路径构建 Scope 对象
│   └── compositeExpand.ts  — 递归展开 composite scope
│
├── 4. 视图层 (views/)
│   ├── summary.ts          — scope 摘要渲染
│   ├── tree.ts             — exec 拓扑树渲染
│   ├── detail.ts           — 节点详情渲染
│   └── fullAscii.ts        — 2D ASCII 渲染（当前实现）
│
└── 5. CLI 层 (cli/)
    ├── args.ts             — 参数解析
    ├── dispatch.ts         — 路径+视图分发
    └── main.ts             — 入口
```

### 数据流

```
.gia 文件
  ↓ decode_gia_file()
解码后的 Root 对象
  ↓ buildNameMap() + compositeIndex()
名称解析 + 复合索引
  ↓ [CLI 解析路径]
path = ".event.0.chain.2.composite.impl"
  ↓ resolvePath(path)
Scope 对象（递归构建）
  ↓ [视图分发]
renderSummary(scope) | renderTree(scope) | renderDetail(scope) | renderFull(scope)
```

### 复合递归解决机制

```
已知: __composite_call__ 节点的 genericId.nodeId = 1610700000

1. 在 accessories 中找到 which=12, id.id = 1610700000 的 CompositeDefWrapper
   → 获取 compositeDef.inner.def.name = "顺序执行"
   → 获取 relatedIds[0].id = 1610710000（impl 图 ID）

2. 在 accessories 中找到 which=9, id.id = 1610710000 的 NodeGraphWrapper
   → 获取 graph.inner.graph.nodes → impl 图节点

3. 构建 Scope { label: "顺序执行", nodes: impl 图节点 }
   → 返回给视图层渲染

4. 如果 impl 图中又包含 __composite_call__
   → 重复步骤 1-3（递归终止：最多 10 层，防循环）
```

---

## 8. 用法总览

```bash
# === 小图（≤15 exec 节点）：全 ASCII 渲染，保持现有行为 ===
gia dist/tests/layout-branch_0.gia

# === 中图（16-50 exec 节点）：自动 summary + tree ===
gia 复杂gia/传球.gia                      # 自动 → summary

# 深入事件 0
gia 复杂gia/传球.gia .event.0             # 事件 0 摘要
gia 复杂gia/传球.gia --event 0            # 同上，简写
gia 复杂gia/传球.gia .event.0 --tree      # 事件 0 的 exec 拓扑树

# 查看具体节点
gia 复杂gia/传球.gia .node.7              # 节点 7 的概要
gia 复杂gia/传球.gia --node 7 --detail    # 节点 7 的完整详情

# === 大图：分页深入 ===
gia 复杂gia/弹球.gia                      # 自动 → summary
gia 复杂gia/弹球.gia --full --pages       # 列出所有页面
gia 复杂gia/弹球.gia --full --page 0      # 第 1 页（Y 范围前段）
gia 复杂gia/弹球.gia --full --page 1      # 第 2 页（Y 范围中段）
gia 复杂gia/弹球.gia --full --page 2      # 第 3 页（Y 范围后段）

# 自定义页大小
gia 复杂gia/弹球.gia --full --page 0 --page-size 400
gia 复杂gia/弹球.gia --tree --page 0      # tree 视图也分页（如果 exec 节点 >20）

# === 复合调试（布局任务场景） ===
gia 复杂gia/传球.gia --composite 顺序执行        # 复合定义的接口+impl 图
gia 复杂gia/传球.gia --composite 顺序执行 --tree   # impl 图的 exec 拓扑
gia 复杂gia/传球.gia --composite 顺序执行 --full   # impl 图的全 ASCII（通常很小）

# 展开复合
gia 复杂gia/传球.gia .event.0.chain.2.composite.impl
# 或简写:
gia 复杂gia/传球.gia --event 0 --node 2 --composite --tree

# 递归展开（2 层）
gia 传球.gia --event 0 --tree --recurse 2

# === 大图（50+ exec 节点）：强制从 summary 开始 ===
gia 复杂gia/弹球.gia                      # 自动 → summary
gia 复杂gia/弹球.gia --events             # 事件列表
gia 复杂gia/弹球.gia --event 0 --tree     # 深入
gia 复杂gia/弹球.gia --full --event 0 | less  # 事件 0 的全 ASCII

# === 复合调试（布局任务场景） ===
gia 复杂gia/传球.gia --composite 顺序执行        # 复合定义的接口+impl 图
gia 复杂gia/传球.gia --composite 顺序执行 --tree   # impl 图的 exec 拓扑
gia 复杂gia/传球.gia --composite 顺序执行 --full   # impl 图的全 ASCII

# === 递归 ===
gia 传球.gia --event 0 --tree                # 折叠复合调用
gia 传球.gia --event 0 --tree --recurse 1     # 展开 1 层复合
gia 传球.gia --event 0 --tree --recurse 3     # 展开 3 层（小心循环）
```

---

## 9. 实现优先级

| 优先级 | 功能 | 依赖 | 渐进收益 | 预估 |
|--------|------|------|---------|------|
| P0 | 拓扑层：edges + roots + eventGroups | 无 | exec 链拓扑数据可用 | 2h |
| P0 | 视图层：tree 渲染 | 拓扑层 | **大图首次可读** | 2h |
| P0 | 范围层：path resolver（基本路径）| 拓扑层 | 按事件/节点寻址 | 1.5h |
| P0 | 自动模式选择（节点数阈值） | tree | 大图不爆炸 | 0.5h |
| P0 | **分页：full 视图的 Y 范围切片** | 拓扑层 | 大图逐一查看 | 2h |
| P1 | 视图层：summary 渲染 | 范围层 | 大图入口 | 1.5h |
| P1 | 加载层：compositeIndex | 无 | 复合引用可解析 | 1h |
| P1 | 范围层：compositeExpand（递归）| compositeIndex | **复合可递归展开** | 2h |
| P1 | 视图层：detail 渲染（单节点全部 pins） | 拓扑层 | 底层的精确定位 | 2h |
| P1 | 拓扑层：dataFlow | edges+roots | 数据连接可见 | 2h |
| P1 | **分页：tree 视图的节点数分页** | tree | 超长 tree 不溢出 | 1h |
| P2 | `--recurse N` 递归深度控制 | compositeExpand | 控制递归爆炸 | 0.5h |
| P2 | CLI 简写参数（--event/--node/--composite） | 范围层 | 易用性 | 1h |
| P2 | `--pages` 列出总页数 | 分页 | 查看全部分页概览 | 0.5h |
| P2 | 大输出保护/提示 | 所有视图 | 稳定性 | 1h |
| P3 | `--full` 在子 scope 中的 2D 渲染 | fullAscii+scope | 微调布局时用 | 3h |

---

## 10. 开放问题（待讨论）

1. **数据节点范围**：`scope = .node[7]` 时，1-hop 邻域要不要包含所有连接的数据节点？还是只包含 exec 节点？
2. **循环 exec 链**（Finite Loop 的 body 回边）：tree 视图怎么表示？带 `↻` 标记的折叠节点？
3. **复合自引用**（复合 A 调用复合 A）：递归保护怎么设计？depth limit 还是循环检测？
4. **多文件 diff**：是否需要 `gia --diff file1.gia file2.gia .event[0]` 的树级 diff？
5. **树中显示坐标**：`--tree --coords` 是否需要在每个节点旁显示坐标？用于布局验证。

