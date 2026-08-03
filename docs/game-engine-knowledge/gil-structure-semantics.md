# GIL 整体结构与语义树

> 状态：部分已验证
> 来源：真实 GIL 不可变相邻快照 + raw-wire 调查 + 当前 protobuf schema/源码 reader + 独立实验 Validator
> 最近校验：2026-08-03
> 适用范围：锁定地图当前版本的相邻快照链，以及当前源码 reader 已闭合的有限 GIL 容器路径；不是完整或跨版本通用的 GIL schema

本文记录从 GIL 根层逐步建立“字段路径 → protobuf 消息 → 资源或图结构 → 编辑器语义”的当前基线。目标是通过编辑器单变化和不可变相邻快照逐章闭合整棵语义树，而不是按字段位置、相邻 ID 或重复形状猜测含义。

本轮证据目录：

```text
/home/h/genshin-ts-evidence/node-graph-logic/signals/2026-08-01-monitor-signal/
  experiments/gil-whole-structure-readonly/
```

锁定快照链：

```text
372694 bytes / 1d7413ab...afb3de2：整体 wire 基线
373849 bytes / 3e21435a...45ac1e9：新增默认元件 1077936181
375008 bytes / 3e1fd259...3fd41e：新增同类型默认元件 1077936182
375586 bytes / e3eb0ae2...cee8afc：从元件 1077936181 新增场景实体
376171 bytes / e3a24214...15fd27：从元件 1077936182 新增场景实体
376222 bytes / 630bd6ca...e82a42：自由新建第一个默认空节点图
376276 bytes / e24f6440...ff2a40：自由新建第二个默认空节点图
376356 bytes / 6f82e971...bdd93：两个空节点图已分别修改名称后的基线
376375 bytes / d860df63...b32d5：节点图 1073741845 再次修改名称
376342 bytes / ae0216b9...937bd：节点图 1073741845 名称缩短为 A
376386 bytes / 7d279e9f...272a2：在节点图 A 新增默认“关卡开始时”节点
398313 bytes / 4cc017e4...fbd2：root 9 文本框章节最终快照 / 变量章节基线
398354 bytes / ae7f67db...7c18：新增默认 bool 关卡变量 1
398393 bytes / 9d4bac03...41cc：新增默认 bool 关卡变量 2
398432 bytes / 423a0676...6d4：新增默认 integer 关卡变量 3
398436 bytes / 1dd974e7...414a：integer 默认值改为 123456
398432 bytes / e72bd051...5eca：integer 默认值恢复为 0
398434 bytes / 08af6f72...d1b：bool 变量 1 改为 true
398432 bytes / c6222352...cf0：bool 变量 1 恢复为 false
398420 bytes / abd1ca65...835：bool 变量 2 重命名为 A
398432 bytes / f8462196...11ed：bool 变量 2 恢复默认名称
398519 bytes / d18d0c17...e3a3：新增默认自定义镜头 1
398604 bytes / 8be8ca17...b17f：新增默认自定义镜头 2
398588 bytes / a9ebc676...a952：自定义镜头 2 重命名为 A
398605 bytes / 3e2a40e2...f48a：故意加入前导空格的冲突样本
398604 bytes / 9697a496...e68a：删除前导空格并恢复名称
398644 bytes / 0fa227e9...40b7：切换为物件镜头
398644 bytes / 4f9cc762...7eca：镜头视野检测改为 60
398644 bytes / ce4e1af0...1b6a：镜头视野检测显示恢复为 45
398644 bytes / 8ee81c39...985e：镜头视野检测改为 33.83
```

Coordinator 只在用户保存后读取锁定地图以捕获新的不可变快照；后续 Investigator 和 Validator 只读取快照。调查没有运行 PKC、`gsts maps` 或旧扫描，没有修改真实地图。元件和场景实体两组增量 Validator 均为 `ACCEPT`，由独立证据仓库提交 `50dccb776c1749c42a934b1091af7409a1b329ba` 锁定。自由新建、自由修改和新增默认节点批次由证据提交 `d1b8fad91bf3f07c3846b0f6e28fb85d0089de39` 锁定；稳定批次 Validator 均为 `ACCEPT`。后续全 root raw-byte 比较在两个空图创建轮次补充发现 root `46` 等长变化，由证据提交 `dfd63e6b7b50d08de35ad5234aaf6ba3052930dd` 锁定。root `9` UI 章节由证据提交 `65a86e2a3f3118c92dd65028258d88d713dc10d3` 锁定；root `5` 关卡变量章节由证据提交 `d7bd151f9b8e914ca4ad3a1873021983e08c4f0f` 锁定；root `18` 自定义镜头章节由证据提交 `b553021b9c578e6b342ab79f8b72fcb3a501002f` 锁定。

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

### 关卡图名字（root 2）

`GIL.payload.2`（payload 第一个字段，tag `0x12` len `0x18`）为显式 length-delimited UTF-8 字符串，即编辑器 UI 中的关卡图名字。

`CONFIRMED`（真实编辑器观察，map-name exp1 轮 2 + exp2 轮 3）：关卡图名字从 `未分类页签_存档_2` 改为 `未分类页签_存档_3` 时，全文件仅 1 处字符串，root 2 等长重写（24B），唯一字节差异 0x32→0x33（'2'→'3'），与 UI 完全一致；再改为 `A3` 时 root 2 缩为 4B（`1202 4133`，len 随名字 24→2），文件尺寸差 -22B 与 root 2 缩量完全吻合，短名（2B）下字段仍显式存在。单处存储，无 definition/instance 双写；root 46 会话标记 1 换 1（保存副作用，同组件各轮）。

`INSUFFICIENT`：非等长改名/清空名字的形态；新图另存为时 root 2 的写入规则及与文件名的关系；正式字段名。

### 新建地图骨架（root 1/34/39/40/41/43）

编辑器新建空地图（map-name exp2 轮 4）产生极简骨架，仅 6 个顶层字段（payload 51B）：

```text
1  varint = 地图 ID（= 文件名数字，样本 1073741852）
2  bytes  = 名字 UTF-8（同 root 2 规则）
34 varint = 1（成熟地图无此字段）
39 varint = 110170759（= BeyondLocal 目录号，存档/账号 ID）
40 varint = 时间戳（样本 = 创建时刻 2026-08-03 19:59:36）
41 varint = 1（成熟地图同为 1）
```

`CONFIRMED`（单样本）：新建地图文件含 root 1=ID/root 39=账号/root 40=创建时间戳，名字仍存于 root 2。

首次保存（map-name exp2 轮 5，改名“新地图A4”）：root 1 与 root 34 **消失**（保存重写为完整格式时省略），root 43=`"6.7.0"` **首次保存时写入**，root 40 保持创建时间戳不变（两样本：1851 多轮保存 + 1852 首次保存），root 2 名字正常重写。

`INSUFFICIENT`：root 34 语义；root 1 骨架标记的完整规则；首次保存写入的默认结构与成熟地图的差异。

### 地图注册表 Beyond_Local_Save_Player.gip

编辑器地图列表读自玩家目录下的 `Beyond_Local_Save_Player.gip`（与 `Beyond_Local_Save_Level/` 平级，`110170759/Beyond_Local_Save_Player.gip`），**不扫描 .gil 目录**；未注册的 .gil 文件不出现在列表。

header 与 .gil 同构（schema 1 / headTag 0x0326 / tailTag 0x0679），fileType = 1。顶层结构：

```text
1   bytes 221B  页签树：sub2={1:"root",3:1}；sub3={1:"未分类页签",3:2, 5[*]={1:1600,2:图ID}}
2[*] bytes      地图条目：{1: 地图ID, 2: 名字 UTF-8, 3: 时间戳秒}
3   varint      最近/当前地图 ID（新建时更新为新图）
4   varint      未知（样本恒为 1073741835）
```

`CONFIRMED`（map-name exp1 轮 6/7，双快照 + 编辑器新建对照）：
- 新图注册 = 顶层追加 field 2 条目 + “未分类页签”容器末尾追加 `{5:{1:1600,2:图ID}}`（1600 = 未分类页签 typeValue），field 3 更新为新图 ID
- 改名同步：编辑器改 .gil root 2 时 .gip 条目名字同步更新（样本：1851=A3、1852=新地图A4）
- 编辑器新建图时若发现未注册的最大 ID 文件（如我们创建的 70B 骨架），会直接接管并首次保存（骨架格式与编辑器原生兼容）

`INSUFFICIENT`：field 4 语义；页签 typeValue 1600 的完整映射；多页签（非“未分类”）的注册路径。

## 当前已闭合的有限字段树

```text
GIL file
└── payload：GIL 自有根消息（正式 schema 未取得）
    ├── 2：关卡图名字（UTF-8 字符串，payload 第一个字段；单处存储）
    ├── 4.1[*]：static assembly definition records
    ├── 5.1[*]：场景实体 records（两个锁定样本）
    │   ├── 5.1[*].2.1：所选元件 definition ID 引用（两个锁定样本）
    │   └── 5.1[changed].7[0].11：当前关卡变量列表（限定样本）
    │       └── entry：名称 / bool-int 类型关联 / 默认值分支
    ├── 6：owner/registry 容器
    ├── 8.1[*]：static assembly instance records
    ├── 9：当前限定样本中的屏幕 UI 控件记录容器（完整 schema 未闭合）
    │   └── 9.502[*]：默认布局与文本框 records（限定样本）
    │       └── 文本框：identity / 名称 / 显示内容 / 几何 / 字号 / 颜色
    ├── 18：当前限定样本中的自定义镜头 records（正式 schema 未闭合）
    │   └── 18.1[*]：identity / UTF-8 名称 / 类型联合子树 / 视野检测候选
    ├── 10：当前复合容器（正式消息名未闭合）
    │   ├── 10.1[*]：默认节点图注册 records（限定样本）
    │   │   ├── 10.1[*].1.1.5：稳定节点图 ID
    │   │   └── 10.1[*].1.2：显式 UTF-8 节点图名称
    │   ├── 10.1.1[*]：gia.NodeGraph blob
    │   │   └── NodeGraph → GraphNode → NodePin → NodeConnection
    │   ├── 10.2[*]：gia.CompositeDef
    │   │   └── CompositeDef.ParameterFlow
    │   └── 10.5.3[*]：信号注册索引条目
    │       └── field 4[*]：信号参数名称与类型码
    ├── 27
    │   ├── 27.1[*]：definition-side auxiliary records
    │   └── 27.2[*]：instance-side auxiliary records
    └── 46：保存时可发生等长 raw-byte 变化；语义未知
```

### 静态资源与场景实体容器

`CONFIRMED`，但每条结论都受表中边界限制：

| 路径         | 当前含义                                                                   | 边界                                                          |
| ------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `4.1[*]`     | definition records；两个新增默认元件的 definition ID 等于用户看到的元件 ID；`4.1[*].f8` 系列为组件配置列表（与 instance 侧 f7 双写一致，见 [components.md](components.md)） | reader 边界 + 铭牌元件 14 轮相邻快照；不是完整资源消息 schema |
| `5.1[*]`     | 两个新增场景实体 records；另一个既有 record 内承载当前关卡变量列表                 | 场景实体只确认两个箭头指示牌样本；变量只确认本批 bool/int；root field `5` 正式消息名未知 |
| `5.1[*].2.1` | 场景实体对所选元件 definition ID 的 varint 引用                            | 只确认上述两个场景实体样本；正式字段名未知                    |
| `6`          | owner/registry 容器                                                        | 当前只闭合 owner ID；不同操作登记不同一侧的记录 ID            |
| `18.1[*]`   | 当前限定样本中的自定义镜头 records                                   | 两次默认创建与目标 record 属性修改；正式 schema 未知 |
| `8.1[*]`     | instance records；创建上述元件时同步新增并回指 definition；`8.1[*].f7` 系列为组件配置列表（与 definition 侧 f8 双写一致，见 [components.md](components.md)） | reader 边界 + 铭牌元件 14 轮相邻快照                        |
| `27.1[*]`    | definition-side auxiliaries                                                | 完整 auxiliary record schema 未知                             |
| `27.2[*]`    | instance-side auxiliaries                                                  | 完整 auxiliary record schema 未知                             |

`4/6/8/27` 的操作性身份由 `src/cli/static_assembly/map_index.ts` 的显式字段选择支持。既有 focused test 证明当前 reader/closure 行为，不是锁定快照的字节 round-trip，也不证明所有 GIL 版本都使用相同结构。

#### 新增两个同类型默认元件

用户连续新增两个默认“箭头指示牌”元件。两轮根字段 occurrence 均保持 41，只改变 root `4/6/8`：

| 用户元件 ID | 新 `4.1` definition | 新 `8.1` instance | instance 的 definition 引用 | field `6` 新 owner ID |
| ----------: | ------------------: | ----------------: | --------------------------: | --------------------: |
|  1077936181 |          1077936181 |        1077936183 |                  1077936181 |            1077936183 |
|  1077936182 |          1077936182 |        1077936184 |                  1077936182 |            1077936184 |

`CONFIRMED`：在这两个相邻样本中，编辑器元件 ID 对应 `4.1` definition；编辑器同步创建一个 `8.1` instance，其 definition 引用回指该元件，并在 field `6` 登记 instance ID。两轮均未改变 root `10/27`。

`INSUFFICIENT`：其他元件类型是否使用相同链路，以及 `4/6/8` 的完整正式 schema。

#### 从两个已有元件新增场景实体

随后分别使用上述两个元件新增一个默认场景实体。两轮只改变 root `5/6`，`5.1` 记录数为 `14→15→16`：

| 所选元件 definition | 新 `5.1` entity record | `entity.2.1` varint | field `6` 新 owner ID |
| ------------------: | ---------------------: | ------------------: | --------------------: |
|          1077936181 |             1077936185 |          1077936181 |            1077936185 |
|          1077936182 |             1077936186 |          1077936182 |            1077936186 |

`CONFIRMED`：在这两个相邻样本中，`5.1[*]` 是新增场景实体记录；记录内唯一 raw-wire 路径 `2.1` 回指用户声明的元件 definition；field `6` 同步登记实体记录 ID。两轮均未改变 root `10/27` 和目标 NodeGraph `1073741842`。

`INSUFFICIENT`：root field `5` 的正式消息名、完整实体 schema、其他实体来源以及跨地图、跨版本普适性。

### NodeGraph 路径

`CONFIRMED`：当前 collector 在 `10.1.1[*]` 找到 13 个可由 `gia.NodeGraph` schema 解码的 blob，类型聚合均为 `20000`，共 301 个节点。该路径是当前 collector 加成功 schema 解码支持的操作性路径，不是 GIA `Root` 声明的路径。

目标图 `1073741842` 在锁定快照中包含：

```text
nodes: 6
pins: 107
connections: 6
```

`NodeGraph.nodes`、`GraphNode.pins` 和 `NodePin.connects` 的内层字段映射由 `gia.proto` 支持。

### 自由新建

用户连续自由新建两个同类型默认空节点图。两轮 root occurrence 均保持 41，presence 集合稳定；业务大小变化都在 root `6/10`，同时 root `46` 都发生等长 raw-byte 变化：

| 操作               | root `10`                                                               | root `6`                                           | root `46`               |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| 新建第一个默认空图 | 新增一个直接 field `1` length-delimited record，编码长度 40 bytes       | 35 个直接 record 不变；一个聚合 record 被重写     | 113 bytes，内容等长变化 |
| 新建第二个默认空图 | 新增一个同构的直接 field `1` length-delimited record，编码长度 42 bytes | 35 个直接 record 不变；同一形态聚合 record 被重写 | 113 bytes，内容等长变化 |

`CONFIRMED`：在当前锁定地图、版本和两个默认空图样本中，自由新建默认节点图会在 root `10` 新增一个直接 field `1` 注册记录，并同步重写 root `6` 的一个聚合记录。原独立 Validator 从原始快照复核哈希链、presence 和 `6/10` 记录集合差后 `ACCEPT`；后续全 root raw-byte 比较补充发现两轮 root `46` 等长变化，不改变上述 `6/10` 记录关系结论。

随后在节点图 `1073741845 / A / type 20000` 自由新增一个默认“关卡开始时”节点。真实相邻差分为节点数 `0→1`，唯一新增 `nodeIndex=1`、`genericId=concreteId=71` 的 `SystemDefined / Server / SysCall`，没有显式实例 pin；图 identity、名称和 metadata 保持不变。独立 Validator `ACCEPT`。

`INSUFFICIENT`：root `6/10` 的正式消息名和完整 schema、节点 ID `71` 的跨版本稳定性、隐式定义 pin、节点位置规则以及其他节点族。保存的位置只属于本轮编辑器落点，不是默认常量。

#### 新建空 NodeGraph 的可生成 wire 结构（2026-08-02 生产写回验证）

依据上述相邻快照 + `tools/list-gil-node-graphs.ts`（`nodeGraphBlobFields` 收集 `10.1.1`）
proto 解码回读，可生成与编辑器原生空图逐字段同构的记录（生成工具：
`gsts assets:node-graphs create`（正式命令，由原 skill 脚本迁移，输出逐字节一致），已在新地图 `1073741850.gil` 真实写回并
被注入器识别）：

```text
root 10 新增一条 field 1 记录（编码后 40B，value 38B）：
  记录 value = {1: NodeGraph}                     # 双层包装，勿只包一层
  NodeGraph  = {1: Id, 2: name, 3: nodes...}      # 空图无 field 3
  Id         = {1: class=10000, 2: type=20000, 3: kind=21001, 5: id=图ID}

root 6 重写“未分类页签”聚合 record（顶层 #1=4）：
  其 field 3 容器内追加一条 #5 = {1: typeValue=800, 2: 图ID}
  # typeValue 800 对应 server 图 20000（DEFAULT_GRAPH_TYPE_VALUES）

图 ID 起点：1073741825（地图内首个图；1849/1850 均如此）
```

`CONFIRMED`（生产链路层级）：生成后 proto 解码回读 `id=1073741825 / type=20000 /
nodeCount=0`；注入器 `findFolderEntryField`（root 6 条目）→ 目标图不存在时 append
新 wrapper 的“创建新图”路径可用；游戏内图正常显示。`INSUFFICIENT`：其他图类型
（client 20002 等）的 folder typeValue、root 46 同步变化。

新图 ID 分配规则（2026-08-03 全地图扫描，map-name 调查）：

```text
固定起始值 = 1073741825
非空地图   = max(已有图 ID) + 1（不复用被删 ID 的空洞）
```

`CONFIRMED`（11 张地图扫描）：1826/1828/1835/1840/1841/1846/1848/1849/1850/1851 的
最小图 ID 均为 1073741825；1840 图序列 1825→1836→1856→1870 与 1845（删 1825 后新建
从 1826 起）均为 max+1 递增、不复用空洞。`assets:node-graphs create` 与
`maps:create --graphs <名字1,名字2,...>` 均已按此自动分配（不再手动指定图 ID）；
编辑器原生新建“对照组”时接管未注册骨架文件 1853 也复用同一起点。

### 自由修改

对节点图 `1073741845` 做两次连续名称修改，最终将名称缩短为 `A`。受独立 Validator 接受的 raw-wire 路径为：

```text
GIL.payload.10.1[*].1.1.5 = 1073741845   # 稳定图 ID；正式字段名未知
GIL.payload.10.1[*].1.2                 # 显式 length-delimited UTF-8 名称
```

`CONFIRMED`：在当前限定样本中，名称从 `新建节点图` 改为 `新建节点图-又修改了名字`，再改为 `A` 时，identity 保持不变，只重写同一直接记录的显式 field `2`。最后一轮名称字段从 34 bytes 缩为 1 byte，整个直接记录从 59 bytes 缩为 26 bytes，差值均为 33。短名称 `A` 下 field `2` 仍显式存在，不是字段缺失或 protobuf 默认值。

`INSUFFICIENT`：正式字段名、其他节点图类型及跨版本普适性。多轮保存还使 root `46` 发生等长 raw-byte 变化；它与名称字节和 NodeGraph 节点增量不共形，只能确认“同步变化”，不得命名为时间戳、校验值、缓存或编辑器状态。

`CONFLICT`：早期 `rename-empty-node-graph-01` 的用户声明是修改名称，但 raw-wire 实际新增 identity `1073741847` 并同步改变 root `6`。该轮保留为冲突调查记录，不作为名称字段正证据。

上述“自由新建”和“自由修改”证据均由独立证据仓库提交 `d1b8fad91bf3f07c3846b0f6e28fb85d0089de39` 锁定。未执行 round-trip、临时重放、真实写回、编辑器导入或游戏行为验证。

### 最小默认屏幕 UI 控件组与文本框

`CONFIRMED`，但仅限当前锁定地图、编辑器版本和文本框 identity `1073741843`：编辑器不能
创建真正的空屏幕 UI 控件组；用户可执行的最小创建操作会自动生成“默认布局”和一个
“文本框”。连续执行两次该最小操作时，两轮 root occurrence 与 presence 都保持稳定，
root `9` 均新增一个同构的直接 field `502` record，并重写包含“默认布局”的既有 record。
新增文本框 identity 分别为 `1073741843/1073741844`。第二轮业务差分只落在 root `9`；
root `46` 仍是等长未知同步变化。

第一轮还伴随 root `10/21` 变化，但第二个同构样本没有复现，因此只保留为首次操作伴随
变化，不并入 root `9` 业务规则。第三方草案中的 `UIControlGroup` 只能解释为候选消息名，
不能作为正式 GIL schema 名称。

对 identity `1073741843` 连续修改后，独立 Validator 接受以下受限 raw-wire 映射：

| raw 路径（省略 `GIL.payload`） | wire | 当前限定语义 | presence/值证据 |
| --- | --- | --- | --- |
| `9.502.505.12.501` | length-delimited | 控件对象名称 | `文本框 → A`；identity 稳定 |
| `9.502.505.503.19.505.501` | length-delimited | 显示内容 | 缺失 → `B` → CRLF 长文本 → 缺失 |
| `9.502.505.503.13.12.501.502.504.501` | fixed32 | 水平中心位置 | X-only 样本中唯一几何分量变化 |
| `9.502.505.503.13.12.501.502.504.502` | fixed32 | 纵向中心位置 | 位置移动时变化，X-only 时不变 |
| `9.502.505.503.13.12.501.502.505.501` | fixed32 | 展示宽度 | 位置-only 样本中保持不变 |
| `9.502.505.503.13.12.501.502.505.502` | fixed32 | 展示高度 | 位置-only 样本中保持不变 |
| `9.502.505.503.19.502` | varint | 字号 | `20 → 30` 是目标记录唯一叶子变化 |
| `9.502.505.503.19.510` | varint | 文本颜色 | packed `0xAARRGGBB` |
| `9.502.505.503.19.511` | varint | 背景颜色 | packed `0xAARRGGBB` |

`CONFIRMED`：未设置显示内容时目标字段缺失，不是显式空 length-delimited。显示内容可保存
UTF-8 与 CRLF；从长文本清空后，目标 record raw bytes 精确恢复为首次设置显示内容前的
record。

`CONFIRMED`：文本颜色 `FFFFFF/100% → D51717/80%` 对应
`0xFFFFFFFF → 0xCCD51717`。背景颜色 `FFFFFF/0% → 1E1313/UI 22%` 对应
`0x00FFFFFF → 0x391E1313`，即 raw alpha 为 `57`。

`INSUFFICIENT`：UI 透明度百分比与 alpha byte 的通用量化/舍入规则。`57/255` 在界面显示
为 `22%`，不能据此写成 `round(255 × 22%)`。root `45` 在两轮颜色修改时同步变化，root
`46` 在多轮保存时等长变化；两者都没有稳定业务引用，继续保持未知。

本批真实相邻快照、机器总图和 11 个 `ACCEPT` Validator 由证据提交
`65a86e2a3f3118c92dd65028258d88d713dc10d3` 锁定。未执行 round-trip、临时重放、真实
写回、编辑器导入或游戏行为验证。

### 关卡变量：默认创建、名称、bool/int 类型与默认值

`CONFIRMED`，但只限当前锁定地图、编辑器版本、两个默认 bool 关卡变量和一个默认 integer
关卡变量。连续 9 个最小编辑器操作形成 10 个不可变快照；9 个独立 Validator 均
`ACCEPT`。各轮 root occurrence 均为 41，presence 稳定。第一轮改变 root `5/21/46`，
其余八轮只改变 root `5/46`。

稳定业务变化不新增 root `5.1` record，而是重写同一个既有 record，并在以下受限路径维护
变量 entries：

| raw 路径（省略 `GIL.payload`） | wire | 当前限定语义 |
| --- | --- | --- |
| `5.1[changed].7[0].11.1[*]` | length-delimited | 关卡变量 entries |
| `...1[*].2` | length-delimited | 显式 UTF-8 名称 |
| `...1[*].3` | varint | 类型关联 discriminator；当前 bool=`4`、integer=`3` |
| `...1[type=integer].4.13` | length-delimited | 当前 integer 默认值分支 |
| `...1[type=bool].4.14` | length-delimited | 当前 bool 默认值分支 |

`CONFIRMED`：连续创建两个默认 bool 变量时，每轮追加一个 39-byte 同构 field `1` entry；
除默认名称末尾 `1/2` 外，两条 entry 字节一致。随后创建默认 integer 变量时，已有两条 bool
entry 逐字节不变。bool 与 integer entry 的顶层字段形状一致；fields `3/4/6` 随用户所选
类型共同变化，field `5 = 1` 保持不变。这里的 `4/3` 只是在当前样本中与 bool/integer
关联，不能升级为正式 enum 或其他作用域的通用类型码。

`CONFIRMED`：当前 integer 变量中，值 `0` 对应显式存在的空 field `13`；值 `123456`
对应 `13.1 = explicit varint 123456`。当前 bool 变量中，`false` 对应显式存在的空 field
`14`；`true` 对应 `14.1 = explicit varint 1`。两组值恢复后，目标 entry 与所属 root
`5.1` record 均精确恢复为修改前 raw bytes；整个 GIL hash 不恢复，因为 root `46` 仍独立
等长变化。

`CONFIRMED`：名称 `新增变量2 → A → 新增变量2` 只重写显式 UTF-8 entry field `2`；
其他 entry 字段、其他变量 entry 与最终所属 root `5.1` record 均精确恢复。

`INSUFFICIENT`：root `5` 与嵌套消息的正式名称、完整 schema、其他变量作用域/类型、负整数
与范围、空名/重名规则及跨版本普适性。root `21` 只在首次创建变量时伴随变化，第二个同构
创建样本未复现；root `46` 在九轮均等长变化，两者都不并入稳定变量骨架。

本批真实相邻快照、机器总图和 9 个 `ACCEPT` Validator 由证据提交
`d7bd151f9b8e914ca4ad3a1873021983e08c4f0f` 锁定。未执行 round-trip、临时重放、真实
写回、编辑器导入或游戏行为验证。

### 自定义镜头：创建、名称、物件镜头联合变化与视野检测

`CONFIRMED_BOUNDED`，但仅限当前锁定地图、编辑器版本和本批自定义镜头样本。连续创建两个
默认自定义镜头时，root `18.1[*]` records 按 `1→2→3` append-only 增加；既有 records
逐字节保持。当前 identity 候选为 `1073741825/26/27`，不能推广为通用 ID 分配器。

受限路径如下：

| raw 路径（省略 `GIL.payload`） | 当前限定语义 | 状态 |
| --- | --- | --- |
| `18.1[*]` | 自定义镜头 records | `CONFIRMED_BOUNDED` |
| `18.1[*].1` | identity candidate | `CONFIRMED_BOUNDED` |
| `18.1[*].2.1` | 显式 UTF-8 名称 candidate | `CONFIRMED_BOUNDED` |
| `18.1[target].2.3` | UI “镜头视野检测”对应的 fixed32 candidate | `CONFIRMED_BOUNDED` |
| `18.1[target].2.{4,6,12,21,23,24,32,33}` | 切换为“物件镜头”时的联合变化 | `INSUFFICIENT` |

名称从 `自定义镜头_2→A→自定义镜头_2` 时，identity 保持且只重写名称字段。一次用户故意
加入前导 ASCII 空格的样本，raw Validator 正确裁为 `CONFLICT`；随后删除一个空格后，目标
record 精确恢复历史 raw bytes。这证明流程能发现“声明操作”和文件事实的偏离，不证明名称
边界规则。

在物件镜头类型下，用户修改“镜头视野检测”得到以下 bounded raw observations：

```text
显示 45    → fixed32 45.000030517578125 / 08003442
显示 60    → fixed32 60.0                 / 00007042
显示 33.83 → fixed32 33.82655715942383   / 654e0742
```

三轮均只改变目标 record 的 field `3`，其他 sibling fields、identity、名称和其他镜头保持。
因此当前地图/版本/物件镜头类型中，`18.1[target].2.3` 可作为“镜头视野检测”候选路径；UI
显示值到 raw float 的量化、范围边界、其他镜头类型/地图/版本仍为 `INSUFFICIENT`。切换
“物件镜头”本身同时改变 fields `4/6/12/21/23/24/32/33`，不能单独命名其中任何字段。
root `21/46` 继续隔离；root `46` 多轮等长变化不能命名。

本批 camera 实验、机器汇总和独立 Validator 由证据提交
`b553021b9c578e6b342ab79f8b72fcb3a501002f` 锁定。未执行 round-trip、临时重放、真实写回、
编辑器导入或游戏行为验证。

### 全局计时器：创建、名字、时长与正/负计时类型

`CONFIRMED_BOUNDED`，但仅限当前锁定地图、编辑器版本和本批单个默认全局计时器样本。
默认创建全局计时器时 root `12` 从空 length-delimited 变非空，唯一新增一条 `12.1`
record；编辑器同步在 root `6` 聚合索引追加一条记录（identity `65`，field2 为
`未分类页签` category），root `21` 一条 5B 记录增长到 8B（field10=24 保持），root `46`
等长变化。root `6/21` 只随创建轮变化，改名/改时长/改类型轮不再变化。

受限路径如下：

| raw 路径（省略 `GIL.payload`） | 当前限定语义 | 状态 |
| --- | --- | --- |
| `12.1[*]` | 全局计时器 records（root 12 默认创建时从空变非空） | `CONFIRMED_BOUNDED` |
| `12.1[*].1` | 显式 UTF-8 名字 | `CONFIRMED_BOUNDED` |
| `12.1[*].2` | fixed32 float 时长 | `CONFIRMED_BOUNDED` |
| `12.1[*].3` | presence 类型：显式 `1` = 负计时（默认）；missing = 正计时 | `CONFIRMED_BOUNDED` |
| `12.1[*].501` | varint `1`，始终存在 | `INSUFFICIENT` |

单属性相邻差分观察（每轮只改变所列字段，root `46` 仍每轮等长变化）：

```text
默认创建  → 12.1 record: f1=全局计时器1 f2=5.0 f3=1 f501=1；root 6 追加、root 21 增长
改名      → 全局计时器1 → A：只改 12.1.1
时长      → 5.0 → 10.0：只改 12.1.2（fixed32 0000a040 → 00002041，等长）
类型→正计时 → 12.1.3 整字段消失（missing）；编辑器隐藏时长输入，但 wire 时长值保留
类型→负计时 → 12.1.3 重新出现且 =1，record 逐字节恢复为切换前，完全可逆
```

用户界面观察“正计时不显示时长（可无限增加）”与 wire 上 `12.1.3` missing 一致，但 UI
隐藏不等于 wire 删除：时长字段在正计时下仍保留上次写入的值。

root `12` 正式消息名、`12.1.501` 语义、多计时器共存、启停/运行状态编码、UI 显示值到
raw float 的量化（本轮 5.0/10.0 均为精确值）和跨版本普适性仍为 `INSUFFICIENT`。本批
实验、机器汇总和独立 Validator 由证据提交 `08953d91fa71cdfdc995d72176bec1d2d930e3f7`
锁定。未执行 round-trip、临时重放、真实写回、编辑器导入或游戏行为验证。

### 第三方开发分支候选 schema

`INSUFFICIENT`：第三方逆向仓库
`Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack` 的 `origin/dev@a9174c9`
在 `utils/protobuf/gia.proto` 中提供了 `Level` 与 `LevelNodeGraphContainer` 草案。锁定快照的
root `2/10/43` 可分别按该草案有界解码为 `模型比对`、节点图复合容器和 `6.7.0`；root
`10` 的有限计数为 `inner=16`、`generated_nodes=55`、`composite_graphs=25`、
`structure_definitions=0`。这只确认 schema 与当前 wire 相容，不能替代编辑器相邻差分或
独立 Validator，也不能把第三方字段名直接升级为正式 GIL 语义。

`INSUFFICIENT`：草案中 root `4/5/6/7/9/18/27` 等业务名称均被注释，部分还带有“好像”
等不确定措辞。它们只用于缩小下一轮实验候选；真实差分不一致时以文件事实为准并标记
`CONFLICT/INSUFFICIENT`。该只读交叉检查由证据提交
`879858af33dccfeff3e49854fbb6060b186dbed6` 记录。

### 连接 index presence

`CONFIRMED`：目标图 6 条连接中，`connect.index` 与 `connect2.index` 都分别有 3 个显式存在、3 个缺失。目标 NodeGraph 的 decode/encode 字节 round-trip 保持一致。

`CONFLICT`：把缺失 `NodePin.Index.index` 解释为显式 `0`。

`INSUFFICIENT`：缺失 index 是否具有编辑器或运行时的 `OutParam[0]` 语义。当前只能保留 `index_present=false`，不能补零。

### CompositeDef 与信号注册表

`CONFIRMED`：当前 reader 在 `10.2[*]` 使用 `gia.CompositeDef`，其 `id/inflows/outflows/inputs/outputs/type/name` 及 `ParameterFlow.name/index/type/pinIndex` 由 `gia.proto` 映射。

`CONFIRMED`：当前信号 reader 在 `10.5.3[*]` 读取注册索引条目，锁定快照中得到 10 个去重注册信号。条目包含 send、monitor、server identity、名称和参数条目。这里的读取属于当前源码加真实 raw-wire execution，不称为 round-trip。

## 当前未知范围

以下内容保持 `INSUFFICIENT`：

- 除已限定闭合的 `4/5/6/8/9/10/27` 路径外，其余根字段的正式消息类型和编辑器语义；
- 已知容器内部未被当前 reader 使用的字段；
- root field 10 的正式消息名，以及已闭合节点图注册/NodeGraph/CompositeDef/信号索引之外的子容器；
- owner ID 之外的 field 6 registry 结构；
- auxiliary record 的完整 schema；
- 缺失 connection index 的编辑器和运行时语义；
- root field `9` 的完整消息 schema、其他 UI 控件类型和透明度量化规则；
- root field `18` 的正式消息 schema、镜头类型联合字段、identity 通用分配规则、视野检测量化和边界；
- root field `12` 的正式消息 schema、`12.1.501` 语义、多计时器共存、启停/运行状态编码和时长量化；
- root field `5` 的正式消息 schema、关卡变量其他作用域/类型、负整数/范围和名称约束；
- root fields `21/45/46` 的正式消息名和同步变化语义；
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

用户提供的是“编辑器中唯一做了什么”，不是直接替未知字段命名。这里的“唯一变化”应按
**编辑器可实现的最小原子操作**定义：若创建控件组必然自动生成默认布局和文本框，它们是
同一原子操作的事实组成，不应要求用户执行编辑器做不到的理想空操作。先记录实际最小操作，
再用第二个同构样本确认稳定骨架。

字段名称必须由唯一差分和其他证据共同支持。一个原子操作仍同时改变多个可独立编辑的未知
属性时，先只确认联合子树；再通过属性-only、位置-only 或单轴样本逐层拆分。用户只读取到
但没有修改的界面值必须与实际变化分开记录。若第一次单变化仍存在 ID 命名空间或同步记录
歧义，优先追加一个同类型、默认设置的第二样本；只有两次独立增量都形成相同关系，且独立
Validator 从原始 wire 复核通过，才合并受限语义。

推荐按以下章节推进：

1. root field 10 内尚未命名的直接子容器；
2. NodeGraph 之外的 GraphUnit/注册表包装；
3. 静态资源 definition/instance/auxiliary 内部字段；
4. 实体、Prefab、组件和挂载关系；
5. 当前 bool/int 关卡变量之外的变量作用域/类型、root `9` 当前文本框之外的 UI、镜头与其他注册表；
6. 缓存、编辑器状态和派生索引等非业务字段。

下一项最小缺口是：从 GIL 整体根层选择 root `5/9/10` 之外一个尚未命名的业务子容器，
设计一个编辑器可实现的最小原子操作。root `21/45/46` 暂作为未知同步状态隔离，不通过首次
或重复保存直接命名。单快照的重复形状、可递归解析性或等长变化不足以命名消息。

完整机器可读调查结果见证据目录中的：

- `root-field-summary.json`
- `gil-structure.mmd`
- `field-semantics.json`
- `unknown-fields.json`
- `validation.json`
- `README.md`
