# GIL 整体结构与语义树

> 状态：部分已验证
> 来源：真实 GIL raw-wire 调查 + 当前 protobuf schema/源码 reader + 已提交实验 Validator
> 最近校验：2026-08-01
> 适用范围：锁定快照 `1d7413ab...afb3de2` 的整体结构，以及当前源码 reader 已闭合的有限 GIL 容器路径；不是完整或跨版本通用的 GIL schema

本文记录从 GIL 根层逐步建立“字段路径 → protobuf 消息 → 资源或图结构 → 编辑器语义”的当前基线。目标是通过编辑器单变化和不可变相邻快照逐章闭合整棵语义树，而不是按字段位置、相邻 ID 或重复形状猜测含义。

本轮证据目录：

```text
/home/h/genshin-ts-evidence/node-graph-logic/signals/2026-08-01-monitor-signal/
  experiments/gil-whole-structure-readonly/
```

锁定输入：

```text
path: experiments/change-two-connections-v6-v7/raw/after.gil
SHA-256: 1d7413ab8a80b16a366df7596b211eaa65604907177387c359904cb92afb3de2
file size: 372694 bytes
payload size: 372670 bytes
```

调查只读取该不可变快照、当前源码/schema/Authority 和已提交实验结果；没有读取实时地图，没有运行 PKC、`gsts maps` 或旧扫描，也没有修改真实地图。

## 证据状态

本文使用三个字段级状态：

- `CONFIRMED`：有 schema、真实差分、raw-wire、round-trip，或当前显式 reader 支持；结论仍受所写范围限制。
- `CONFLICT`：来源不一致，不能静默选择其中一个解释。
- `INSUFFICIENT`：只能观察结构或 presence，编辑器语义尚未闭合。

自动结构、当前源码 reader、真实编辑器差分、临时 round-trip、编辑器导入和游戏行为仍是不同证据层。

## GIL 根与 GIA Root 的边界

`CONFIRMED`：GIL 文件由 20-byte header、protobuf-like payload 和 4-byte trailer 组成。本轮 payload 有 41 个根字段 occurrence，根字段编码大小之和恰好覆盖 372670 bytes。

`CONFIRMED`：GIL payload 根不是 `gia.proto` 定义的 `.gia` `Root`。不能把相同字段号直接解释成 `Root.graph`、`Root.accessories`、`filePath`、`modeFlag` 或 `gameVersion`：

- GIA `Root` 只定义 field 1–5，而当前 GIL 根出现大量更高字段号；
- 当前 GIL root field 4 为 wire type 2，GIA `Root.modeFlag` field 4 应为 uint32 / wire type 0；
- 直接按 GIA `Root` 解码当前 GIL 根会失败。

因此，GIA schema 只能用于已经由当前 collector/reader 定位出的内层 `NodeGraph`、`CompositeDef` 等消息，不能命名 GIL 根。

## 根字段 presence 基线

当前快照根层显式出现：

```text
2–12（缺 13）、14–23（缺 24）、25、27、29–33、35–41、43–46、48–49
```

其中：

- root fields `39/40/41` 是显式 wire type 0，值分别为 `4/5/1`；
- 其余已出现根字段为 wire type 2；
- fields `3/12/17/19/20/30/31/32/33/37/44/48/49` 是显式空 length-delimited 字段；
- 在已观察的 1–49 范围内，fields `1/13/24/26/28/34/42/47` 缺失。

字段缺失、显式空 length-delimited 和显式 varint 必须分别记录。proto3 解码后的默认值不能证明字段在 wire 中存在。

## 当前已闭合的有限字段树

```text
GIL file
└── payload：GIL 自有根消息（正式 schema 未取得）
    ├── 4.1[*]：static assembly definition records
    ├── 6：owner/registry 容器
    ├── 8.1[*]：static assembly instance records
    ├── 10：当前复合容器（正式消息名未闭合）
    │   ├── 10.1.1[*]：gia.NodeGraph blob
    │   │   └── NodeGraph → GraphNode → NodePin → NodeConnection
    │   ├── 10.2[*]：gia.CompositeDef
    │   │   └── CompositeDef.ParameterFlow
    │   └── 10.5.3[*]：信号注册索引条目
    │       └── field 4[*]：信号参数名称与类型码
    └── 27
        ├── 27.1[*]：definition-side auxiliary records
        └── 27.2[*]：instance-side auxiliary records
```

### 静态资源容器

`CONFIRMED`，但只限当前 static assembly reader 的操作性边界：

| 路径 | 当前含义 | 边界 |
| --- | --- | --- |
| `4.1[*]` | definition records | 只闭合 reader 使用的字段，不是完整资源消息 schema |
| `6` | owner/registry 容器 | 当前只闭合 owner ID |
| `8.1[*]` | instance records | 只闭合 reader 使用的字段 |
| `27.1[*]` | definition-side auxiliaries | 完整 auxiliary record schema 未知 |
| `27.2[*]` | instance-side auxiliaries | 完整 auxiliary record schema 未知 |

这些身份主要由 `src/cli/static_assembly/map_index.ts` 的显式字段选择支持。既有 focused test 证明当前 reader/closure 行为，不是锁定快照的字节 round-trip，也不证明所有 GIL 版本都使用相同结构。

### NodeGraph 路径

`CONFIRMED`：当前 collector 在 `10.1.1[*]` 找到 13 个可由 `gia.NodeGraph` schema 解码的 blob，类型聚合均为 `20000`，共 301 个节点。该路径是当前 collector 加成功 schema 解码支持的操作性路径，不是 GIA `Root` 声明的路径。

目标图 `1073741842` 在锁定快照中包含：

```text
nodes: 6
pins: 107
connections: 6
```

`NodeGraph.nodes`、`GraphNode.pins` 和 `NodePin.connects` 的内层字段映射由 `gia.proto` 支持。

### 连接 index presence

`CONFIRMED`：目标图 6 条连接中，`connect.index` 与 `connect2.index` 都分别有 3 个显式存在、3 个缺失。目标 NodeGraph 的 decode/encode 字节 round-trip 保持一致。

`CONFLICT`：把缺失 `NodePin.Index.index` 解释为显式 `0`。

`INSUFFICIENT`：缺失 index 是否具有编辑器或运行时的 `OutParam[0]` 语义。当前只能保留 `index_present=false`，不能补零。

### CompositeDef 与信号注册表

`CONFIRMED`：当前 reader 在 `10.2[*]` 使用 `gia.CompositeDef`，其 `id/inflows/outflows/inputs/outputs/type/name` 及 `ParameterFlow.name/index/type/pinIndex` 由 `gia.proto` 映射。

`CONFIRMED`：当前信号 reader 在 `10.5.3[*]` 读取注册索引条目，锁定快照中得到 10 个去重注册信号。条目包含 send、monitor、server identity、名称和参数条目。这里的读取属于当前源码加真实 raw-wire execution，不称为 round-trip。

## 当前未知范围

以下内容保持 `INSUFFICIENT`：

- 除 `4/6/8/10/27` 外其余根字段的正式消息类型和编辑器语义；
- 已知容器内部未被当前 reader 使用的字段；
- root field 10 的正式消息名及 NodeGraph、CompositeDef、信号索引之外的子容器；
- owner ID 之外的 field 6 registry 结构；
- auxiliary record 的完整 schema；
- 缺失 connection index 的编辑器和运行时语义；
- 当前字段路径的跨地图、跨游戏版本普适性。

## 整棵语义树的增量闭合方法

每轮先选一个未知章节或子容器，再选择一个可证伪的最小问题：

```text
锁定不可变基线
→ 用户在实验关卡只做一个编辑器变化
→ 捕获新的不可变快照并核验 SHA-256
→ 定点比较目标字段路径
→ 用户确认编辑器操作的概念含义
→ 用 schema/source/raw-wire/真实差分闭合字段映射
→ 必要时在临时副本做同构重放和 round-trip
→ 独立 Validator 裁决
→ Coordinator 只合并 ACCEPT 的结论
```

用户提供的是“编辑器中唯一做了什么”，不是直接替未知字段命名。字段名称必须由唯一差分和其他证据共同支持。一个变化同时影响多个未知分支时停止命名并拆分实验。

推荐按以下章节推进：

1. root field 10 内尚未命名的直接子容器；
2. NodeGraph 之外的 GraphUnit/注册表包装；
3. 静态资源 definition/instance/auxiliary 内部字段；
4. 实体、Prefab、组件和挂载关系；
5. 变量、UI、镜头与其他注册表；
6. 缓存、编辑器状态和派生索引等非业务字段。

下一项最小缺口是：只选择 root field 10 内一个尚未命名的直接子容器，通过一对编辑器单变化的相邻不可变快照做定点 raw-wire 差分。单快照的重复形状或可递归解析性不足以命名消息。

完整机器可读调查结果见证据目录中的：

- `root-field-summary.json`
- `gil-structure.mmd`
- `field-semantics.json`
- `unknown-fields.json`
- `validation.json`
- `README.md`
