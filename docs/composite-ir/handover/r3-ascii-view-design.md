# GIA 可视化设计文档：从 jq 类比到分层视图体系

## 核心洞察：jq 为什么能处理任意复杂的 JSON？

jq 的核心设计原则对 GIA 可视化有直接启发：
- **统一抽象**: 所有 JSON 都用同一套类型 → GIA 需要节点/连线的统一抽象
- **结构递归**: 任何深度层级用同一套访问方式 → GIA 复合定义递归展开同理
- **渐进披露**: 全貌骨架 → 按需深入 → GIA 需要分层视图
- **路径寻址**: `.a.b[0]` 唯一标识数据 → GIA 需要自己的 scope 寻址方案

## 语义结构 vs Protobuf 结构

### 用户关心的语义结构
```
事件 (Events) — event 根节点
  ├── 执行链 (Exec Chain)
  │   ├── 功能节点 (kind=22000)
  │   │   ├── 数据输入 ← InParam
  │   │   └── 控制输出 → OutFlow
  │   └── 复合调用 (kind=22001) → 递归展开
  │       └── 复合定义接口 + impl 图
  └── 数据节点 — 关联 exec 链
复合定义 — accessories 中 which=12
图变量
```

### Protobuf → 语义的障碍
| 障碍 | 解决 |
|---|---|
| 扁平节点数组 | 拓扑重建（从 exec 连线推出事件/链） |
| 隐式事件边界 | 用 exec 连线根节点识别事件 |
| 数据散落 | 作为 exec 节点的附属元素展示 |
| 复合分离 | 建立 ID → 定义+impl 图的映射 |

### GIA 递归结构
```
文件 → 主图 → event → exec_chain → __composite_call__ → 复合定义 → impl 图 → ...(嵌套)
```

## 三层视图体系

### Level 0: 文件摘要
```
## 传球.gia
主图: 24 节点, 17 exec 边, 4 事件
事件 0: ~8 节点 ...  Accessories: 6 子图
```

### Level 1: 事件级拓扑（tree）
```
事件: whenTimerIsTriggered (n=1, Y=-470)
  1 n=1 Event
  └── n=2 Exec ...
      ├── n=7 MultipleBranches ...
      └── n=8 Composite ...
```

### Level 2: 节点详情（detail）
```
Node 7: Multiple Branches (nid=3)
  Pos: (-28, -346)  Kind: 22000
  InFlow:  ← Node 2 OutFlow[0]
  OutFlow[0]: → Node 4
  InParam[0]: type=Entity ← Node 2 OutParam[0]
  ...
```

## 范围（Scope）+ 寻址方案

### Scope 层次
`file` → `.event.0` → `.event.0.chain` → `.node.7` → `.composite.顺序执行` → `.impl`

### 寻址 CLI
```
gia 传球.gia .event.0                     # 事件 0
gia 传球.gia .node.7 --detail             # 节点 7 详情
gia 传球.gia --composite 顺序执行 --tree   # 复合 impl 拓扑
gia 传球.gia --event 0 --tree --recurse 2 # 递归展开 2 层复合
```

## 视图类型与自动选择

| 视图 | 适用 | 节点数阈值 |
|---|---|---|
| summary | 大图入口 | 16-50+ 级 |
| tree | 拓扑可读 | 4-15 |
| detail | 精确定位 | 单节点 |
| full ASCII | 小图微调 | 0-3 |

### 自动模式: ≤15 → full; 16-50 → summary→tree; 50+ → summary 强制

## 分页策略

- **full 视图**: Y 范围切片（`--page N --page-size N`）
- **tree 视图**: 节点数分页（>20 exec 节点） 
- **手分页参数**: `--page N`(默认0), `--page-size`(full=800px, tree=15), `--pages`(列总页数)

实战: 传球.gia Y[-1841, 504]，page-size=500 → 约 5 页

## 复合递归展开

`__composite_call__` 节点展开流程:
1. `genericId.nodeId` → accessories[which=12, id.id] → `compositeDef.inner.def.name`
2. `relatedIds[0].id` → accessories[which=9, id.id] → impl 图节点
3. 如果 impl 图中又含 `__composite_call__` → 重复 1-2（最多 10 层）

默认折叠，`--recurse N` 展开 N 层。

## 实现架构（模块划分）

```
gia-view.ts
  ├── 1. 加载层: decode + nameMap + compositeIndex
  ├── 2. 拓扑层: edges + roots + eventGroups + trace + dataFlow + compositeRef  
  ├── 3. 范围层: resolver + buildScope + compositeExpand
  ├── 4. 视图层: summary + tree + detail + fullAscii
  └── 5. CLI 层: args + dispatch + main
```

### 数据流
```
.gia → decode_gia_file() → 解码 Root → nameMap + compositeIndex
  → [CLI 解析路径] → resolvePath(path) → Scope 对象
  → [视图分发] → render(scope)
```

## 实现优先级

| P | 功能 | 估算 |
|---|------|------|
| P0 | 拓扑层: edges+roots+eventGroups | 2h |
| P0 | tree 渲染 | 2h |
| P0 | path resolver(基本路径) | 1.5h |
| P0 | 自动模式选择(节点数阈值) | 0.5h |
| P0 | full 视图 Y 范围分页 | 2h |
| P1 | summary 渲染 | 1.5h |
| P1 | compositeIndex + 递归展开 | 3h |
| P1 | detail 渲染 | 2h |
| P1 | dataFlow 拓扑 | 2h |
| P1 | tree 节点数分页 | 1h |
| P2 | --recurse N, --event/--node/--composite简写, --pages | 2h |

## 开放问题
1. 循环 exec 链（Finite Loop body 回边）→ tree 视图怎么表示？
2. 复合自引用 → 递归保护 depth limit 还是循环检测？
3. 多文件 diff → `gia --diff file1.gia file2.gia .event[0]`？
4. tree 中是否显示坐标（`--tree --coords` 用于布局验证）？
