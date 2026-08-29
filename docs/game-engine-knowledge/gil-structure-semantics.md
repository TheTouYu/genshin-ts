# GIL 整体结构与语义树

> 状态：部分已验证
> 来源：真实 GIL 不可变相邻快照 + raw-wire 调查 + 当前 protobuf schema/源码 reader + 独立实验 Validator
> 最近校验：2026-08-05
> 适用范围：锁定地图当前版本的相邻快照链，以及当前源码 reader 已闭合的有限 GIL 容器路径；不是完整或跨版本通用的 GIL schema

> 知识树：已闭合字段树结论已录入 `knowledge/game-engine-knowledge/gil-structure-closed-paths.md`（root10 容器划分、type 3 挂载槽，2026-08-08，bnd_7320a9bd）

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

`CONFIRMED`：header 20B 含两个大端 uint32 长度字段，编辑器每次保存更新、游戏加载校验
（2026-08-05 v0-v8 快照逐轮验证；注入只改 payload 未同步 header → 游戏报“文件损坏”）：

```text
hdr[0:4]  = 文件总长 - 4
hdr[16:20] = payload 长度 = 文件总长 - 24
其余 12B（样本恒为 00000001 / 00000326 / 00000002）保存时不变
```

直接修改 payload 的注入/回写必须同步两个字段并自检
（`struct.unpack('>I', d[0:4])[0] == len(d)-4` 且 `[16:20] == len(d)-24`）；
trailer 4B（样本恒为 00000679）不随保存变化。

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

#### 新增观察（component-investigation exp14–18，2026-08-05）

- **root 22**：exp1–17 的 value 始终为
  `f1="PropertyTransform" + f2.bytes=01`。只修改铭牌显示内容的 exp18 中，field 1
  追加 `ClientBeyondEntityNameplateCompEditData`，field 2 value bytes 从 `01` 变为
  `0101`；此前记录中的 `02` 是 length 前缀，不是 payload 计数。字符串字面量支持把它
  限定为“编辑数据类型名/类名注册候选”，但正式容器名、field 2 语义和其他组件规律仍为
  `INSUFFICIENT`。
- **root 35**：exp14 一次保存中从 6B 增长到 212B，新增 `选项卡/测试/默认成就/
  默认极致成就/你好！/全局/初始物件阵营/初始玩家阵营/初始造物阵营` 九条字符串及伴随
  f501 bytes。这九个字符串在 exp13 已全部存在于地图其他位置，exp14 后只是各多一份；
  exp18 业务侧“测试”被改为“arstart”后 root 35 仍保留旧值。它不是当前业务文本的权威
  来源，最多是持久化派生索引/缓存候选；正式容器名和 f501 语义仍为 `INSUFFICIENT`。
- **root 21**：exp14 从空变为 UTF-8 `"1"`，exp15 变为 `"1?"`，exp16–18 保持不变。
  不能写成“每轮保存变化”，也不能命名其正式语义。
- **root 46**：exp18 value 长度保持 110B，但一个 22B 直接子记录被等长替换。该字段在
  多轮保存中可等长变化，继续只记为未知同步状态。

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

> **概念语义（2026-08-20 用户澄清，核心）**：
> - **定义（root 4）= 元件的本体**。软件的定义就只是定义；修改定义即修改元件。
> - **元件页面模型（root 8）= 可视化编辑辅助**。元件页面里摆的模型**不渲染到关卡/场景**，
>   只为让玩家更好编辑定义；删除模型定义仍在。CLI `assets:prefabs create --static` 建的
>   就是这种页面模型（元件页面可见，但不是可被实体引用的"定义"）。
> - **场景实体（root 5）= 引用定义**（官方预定义 resID 或本地自定义 defID 均可）；
>   实体引用与元件页面有没有模型无关，只要定义存在即可（API 创建同理）。
> - "保存为元件定义"（圆柱/三棱锥，`after-cylinder-to-def.gil`/`after-pyramid-to-def.gil`）=
>   删除 root 8 页面模型 + 新建 root 4 静态定义（f8=0、名字槽 f2=1、393B/381B）；
>   场景实体此时**删除旧实体 + 新建引用新定义的静态实体**（f2={1:defID}、f7=0、411B）。
> - 定义 ID 分配只查 root 4 空间，可与 root 5/root 8 的 ID 重叠（跨 section 复用是常态）。

> **三层独立副本 + 差异化保留（2026-08-22 五轮编辑器差分闭合，见 ADR-0006）**：
> - **三层完全独立**：root4 定义 f8 / root8 实例 f7 / root5 实体 f7 是三份独立副本，
>   编辑器操作只改目标层、**不自动同步**。改"元件面板"→ 写 root8 实例 f7；改"场景实体"→
>   写 root5 实体 f7/f6；root4 定义 f8 在编辑器里不被直接编辑（"保存元件"时由 root8 同步写入）。
> - **游戏实际读取 root5 实体 f7**（不是 root4/root8）。
> - **差异化保留 = 字段级差异（无 override 标记）**：实体独属修改 = 实体 f7/f6 与定义 f8 的差异。
>   加组件 = 实体 f7 多一个组件槽；改属性 = 实体 f7 内容变；移动 = 实体 f6 变。
>   transform（f6）是实体独属坐标层，永不参与继承同步。
> - 批量更新命令 `assets:prefabs update --id <defId> [--force]`：改 root4 定义 → 同步 root8 实例 +
>   所有引用实体；默认差异化保留，`--force` 强制覆盖。
> - **元件页面模型 position 与 createPrefab 世界坐标是两套独立坐标系（2026-08-23 魔方 3x3 实证）**：
>   root 8 实例（页面模型）的 transform position 是编辑器/元件面板展示坐标，惯例以原点为中心
>   （魔方块间距 1，底部离地约 0.22）；节点图运行时 `createPrefab(x,y,z)` 用**另一套**世界坐标
>   （3x3 魔方块中心在 2/3/4，魔方中心在 3）。改 root 8 实例 position 只影响编辑器/元件面板显示，
>   **不影响游戏运行时**（游戏块由 createPrefab 动态生成实体，坐标来自节点图参数）。
>   同一布局的两套坐标按项目约定换算（本次魔方：root8 x/z = createPrefab x/z − 3，
>   root8 y = createPrefab y − 1.3，使底部 D 层 y=0.7、块底离地 0.7 − 0.965/2 ≈ 0.22）。

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

#### 官方预制元件引用 → 自定义元件 → 实体（2026-08-09，prefab-box-investigation exp1 共 7 轮）

游戏概念（编辑器 UI）：

- **官方预制元件**：游戏内置基础几何体（长方体/球体/三棱柱等），有固定官方 resID；
  关卡文件只存“引用”，**不存形状参数**（11 个样本的 f6 槽7 与材质槽逐字节相同，
  形状由 resID 隐式决定）。
- **自定义元件**：用户把官方预制引用转为本地的 definition（root 4），可被实体引用。
- **实体**：场景中摆放的对象（root 5），引用元件定义。

引用官方预制元件（元件面板引用基础元件，7 轮中 11 个样本）→ **只写 root 8 instance**，
无 root 4 definition（区别于自由新建元件的 def+instance 双写）：

```text
root 8.1 记录（553-556B）：
  f1 = instance ID（0x40000002 起连续分配）
  f2 = {f1: 官方resID, f2: 1}     ← f2:1 = 官方引用标记（关键差异点）
  f5 ×10 能力槽：槽1{f11:{f1: 元件名 UTF-8}}、槽13{f22:{f4:-1}}、槽14{f23:{f3:"MPActionGroup"}}、
      槽38{f48:{f1:fixed32 1.0}}、槽40{f50:空}、槽111/61/62/19/52 空
  f6 ×15 节点树：槽1 transform（位置 fixed32×2 + scale 1,1,1 + f501:-1）、
      槽7 子节点（1000,500,0.1,0.1）、槽11 节点名 GI_RootNode/中心原点/RootNode、
      槽22 材质槽（f3:-1、f4:100.0、f5:0xFFFFFF、f6:6700）
  f7 ×6 组件：槽18 特效组件（受击特效/被击倒特效 f507:13）+ 空槽 1/3/6/14/19
  f8 = 官方resID（与 f2.f1 重复）
```

官方基础元件 resID 表（本次确认 11 个）：10009001 长方体、10009002 球体、
10009003 平面、10009004 三棱柱、10009005 五棱柱、10009006 三棱锥、10009008 圆柱、
10009009 圆锥、10009010 线框长方体、10009011 线框圆柱、10005018 空模型。
唯一结构例外：空模型（10005018）多一个 f5 槽20 {f29:空}。

基础元件视觉尺寸/零旋转朝向（2026-08-12 用户直接说明）：10009003 平面零旋转时平躺，
法线朝 +Y（垂直向上），尺寸遵循统一设计语言外接圆直径 1 = XZ 平面 1×1，绕 Y 轴水平旋转，
Y 轴厚度极低；10009001 长方体 scale=1 = 1×1×1（边长 1 米）；10009004/10009005 棱柱高度轴 Y，
底面外接圆直径 1；10009008 圆柱零旋转轴向 Y；**10005018 空模型本身是有体积的隐藏 1×1×1
正方体**（几何中心在局部原点，与同尺寸装饰物重叠会闪烁，宿主应缩到 0.1~0.01 当小点用）。
**元件模板缩放语义（2026-08-12）**：模板（宿主）scale 会连带其所有装饰物按同比例缩放
（含位置/尺寸/间隙），缩宿主时装饰物需反向放大补偿；元件模板可直接用基础元件
（如长方体 10009001）当可见主体，避免空模型宿主与同尺寸装饰物的重叠闪烁。
各资源详细局部基与校准见 static-gil-model-builder 技能的 calibration-and-geometry 参考。

**transform 编码（2026-08-20 样本 `after-entity-transform.gil`，球体实体 1077936146 移动/缩放/旋转 + 其他实体移动）**：
- 位置 f1：**稀疏** fixed32（0 分量省略；编辑器拖动值带微小噪声，如 2.2e-7 会保留）
- 旋转 f2：**稀疏** fixed32 欧拉角——球体绕 Y 转 90° 编码为 `{f2: 90}`（Y 分量在子字段 2）
- 缩放 f3：**全量** fixed32——非均匀缩放 (2,2,1) 编码为 `{f1:2, f2:2, f3:1}`；默认 1,1,1 也全量保留
- f501: -1 恒定；静态实体与动态实体 transform 编码相同
- **CLI `setTransform` 编码逻辑（vector 稀疏/全量 + f501）与编辑器逐字节一致**（同构重放验证）——
  缺口①（`--position`/旋转/缩放）编码已全部闭合

**装饰物（root 27 aux，2026-08-20 样本 `after-user-aux-both.gil`/`after-user-aux3.gil`，1073741897 测试地图）**：
- root 27 顶层 = 多条 aux 记录：**f1 字段 = definition-side**（f3=1、f11 空）、**f2 字段 = instance-side**（f12={1:defAuxID} 回链）
- 每条 aux = {f1:ID、f2:装饰物资源ID、f4×3（槽1 名字/槽40 配置/槽111）、f5×4（槽1 变换/槽5/槽2/槽22 材质）、f11 或 f12}
- **挂载 = 宿主 f5 槽40.f50 的 f501 packed 引用列表**：元件定义挂 def-side aux、页面模型/场景实体挂各自 inst-side aux
- 添加装饰物：动态装饰物新建完整组（def + 每宿主 inst）并挂满（定义/模型/实体三处 f501 追加）；
  静态装饰物（20001008）只建 inst（f12 空）只挂实体（用户实测）
- **静态/动态装饰物 wire 无标记**（结构逐字段同构）——"静态装饰物"= 资源性质（不支持属性编辑），与元件静态/动态语义一致
- 新地图默认自带装饰物（res=20001001：def 1073741826 + inst 1825/1827）

**静态元件（2026-08-20 七个真实样本：`after-convert-10009008-static.gil`、`after-add-static-pyramid.gil`、`after-add-static-flowerbed.gil`、`after-convert-sphere-static.gil`、`after-revert-sphere-dynamic.gil`、`after-reconvert-sphere-static.gil`、`after-entity-transform.gil`）**：

UI 的"静态"分两种来源，wire 形态不同：

1. **动态 → 切换静态**（圆柱 1077936140、三棱锥 1077936142、球体 1077936144，编辑器元件类型切换）：
   - 官方引用式（圆柱）：root 8 instance 记录 543B → **409B**，差异**全部来自去掉 f7 组件槽**（6 槽共 134B）
   - 自定义定义式（三棱锥/球体）：root 4 定义**去掉 f8 组件槽**（391B/388B）+ root 8 实例**去掉 f7 组件槽**（411B/408B），f2={1:defID}
   - **名字槽静态标记（2026-08-20 样本补充）**：切换静态时，定义名字槽（f6 槽1.f11）、实例/实体名字槽（f5 槽1.f11）都**加 {f2:1}**（动态与纯静态类型均无此标记）
   - **实体联动（关键）**：引用该元件的所有 root 5 场景实体**同步去掉 f7 组件槽 + 加名字槽标记**（球体实体 1077936146：552B → 408B），
     transform 等其余字段完全保留——实体继承元件的静态/动态属性
   - transform 槽（f6/f7 槽1）**与动态完全同构**（位置 fixed32 稀疏 + 空 rotation + scale + f501，共 38B）——
     ⚠️ 修正旧结论：无"10B 静态标记"，可被 `setTransform` 直接重写（同构重放已验证）
   - root 6 登记 `{400, instanceID}` + type6 `{100, defID}`；root 46 每次操作 +1 条
2. **静态 → 切换回动态**（球体 1077936144 切回，`after-revert-sphere-dynamic.gil`）：
   - 定义 f8 恢复 **6 个官方默认组件槽**（388B → 532B）+ 实例 f7 恢复 6 个官方默认槽（408B → 552B），
     槽内容与官方动态模板**逐字节相同**（槽18 特效 len101 + 空槽 1/3/6/14/19）——恢复的是默认模板，非切换前的自定义组件
   - 名字槽 f2=1 标记同步删除
   - root 46：**删除该元件静态条目 + 新增一条**（720578525 → 720578461，总数不变）——支持"root46 = 静态状态注册"假设
3. **纯静态类型新增**（木质花圃 1077936143，元件面板静态分类，装饰物类 resID 20001159）：
   - root 4 定义（541B）+ root 8 实例（561B）**保留完整组件槽**（定义 f8×6 = 实例 f7×6，槽18 特效 + 空槽 1/3/6/14/19），
     与官方动态自定义元件**同构**——UI"静态分类"在 wire 中不通过删组件槽表达
   - root 46 同样 +1 条；root 6 type7 组补登记前一个切换静态的定义（观察，语义未闭合）

- 静态资源只支持基础 缩放/位置/旋转；**不支持组件、变量、高级功能**
- CLI：
  - `assets:prefabs create --static --base <官方ID> --id <new>` 生成"切换静态"同构实例（去 f7，无 root46 登记）
  - `assets:prefabs convert --id <prefabId> --static|--dynamic` 切换已有元件（含定义/实例/实体联动与名字槽标记，root46 fail-closed 不写）
- ⚠️ 静态资源实体不要写变量/组件（会导致编辑器存档损坏）
- ⚠️ 未闭合：root46 条目语义——f1 非单调（球体 720578525 < 三棱锥 720580506 < 木质花圃 720580510）、f2 高16位恒 0x46E7 但低 16 位无规律；CLI create --static 缺 root46 登记是否导致编辑器不识别，待用户重载核验

**放置实体（基于自定义定义元件，2026-08-20 样本 `after-place-sphere-entity.gil`）**：
- 基于球体定义 1077936132 放置实体 1077936146：root 5 记录 **552B**，f2={1:defID}、f5×10/f6×15/f7×6、f8=官方resID 穿透（10009002）、名称=元件名（球体）——与既有"放置实体"结论逐字节一致
- root 46 同步更新（替换最新条 720578461 → 720578456，总数不变）——**root46 非静态专属**，放置实体也触发；条数从 1 增长到 4 后每次操作替换最新一条（语义仍未知，CLI fail-closed 不写）

引用 → 转自定义元件（编辑器单操作，3 处同步）：

```text
1. root 4 新增 definition（532B）：f1=新定义ID、f2=官方resID（直接 varint，无嵌套）、
   f6 槽×8（比 instance 缺槽19/52）、f7 节点树×15、f8 组件×6、f10=1
   —— 骨架 = instance 记录“字段号整体-1”的副本（f5→f6、f6→f7、f7→f8）
2. root 8 instance 唯一变化：f2 = {f1:resID, f2:1} → {f1:定义ID}（指针改向本地定义，
   官方标记 f2:1 删除，记录 -1B）
3. root 6 页签追加 {100, 定义ID}；原 {400, instanceID} 保留
```

放置实体（基于自定义元件，1 处新增 + 注册）：

```text
root 5 实体记录（552B，与 instance 记录完全同构）：f1=实体ID、f2={f1:定义ID}、
  f5×10/f6×15/f7×6、f8=官方resID（穿透保留）、名称槽=元件名（如"球体"）
root 6 页签追加 {200, 实体ID}（与官方默认实体同类）
```

放置实体也可**直接引用官方预制元件**（不经 root 8 instance / root 4 definition，
两者均不变）：root 5 记录 f2={f1:官方resID, f2:1}（带官方标记），名称槽=元件名
（如"平面"）。f2 引用形态完整矩阵：

| 来源 | root 8 元件 | root 5 实体 |
| ---- | ----------- | ----------- |
| 官方预制 | {1:resID, 2:1} | {1:resID, 2:1} |
| 自定义定义 | {1:定义ID} | {1:定义ID} |
| 自由新建 | {1:定义ID} | {1:定义ID} |

即 f2:1 = 官方引用标记：来源是官方预制（未本地化）时带，来源是本地定义时不带。

删除实体（编辑器删除，2026-08-09）：root 5 实体记录**整体移除**（非占位，区别于装饰物
deletion 的 aux 保留 + 空模型占位）；root 6 页签对应 {200, 实体ID} 条目从聚合记录中
移除（记录重写）；自定义元件定义（root 4）与元件引用（root 8）不受影响。ID 不回收
（仍占用，新对象从当前最大+1 分配）。

删除自定义元件（编辑器/工具删除，2026-08-23 魔方 3x3 清理脚本实证 + CLI 回读验证）：
与删除实体对称，删除一个动态定制元件需**四层整体移除**（非占位，区别于"删除单个装饰物"
的 aux 保留 + 空模型 10005018 占位）：

- root 4 定义记录整体移除；
- root 8 实例记录整体移除；
- root 27 该元件的 definition-side aux 整体移除（动态元件的装饰物仅 definition-side 一组，
  实例/实体 f501 直接引用 definition-side aux，无独立 instance-side 副本，删 aux = 全部装饰物）；
- root 6 "未分类页签"组（type 6）里 {100, 定义ID} 登记条目移除（组内其余条目保留，组记录只重写）。

删除前须确认：无 root 5 实体引用该定义（有则悬空）、无节点图 createPrefab 用时定义 ID。
遗漏 root 6 登记或 root 27 装饰物会留下孤儿记录（元件库仍显示 / 装饰物无宿主）。

三种对象记录结构对照：

| 对象 | root | f1 | f2 | 能力槽 | 节点树 | 组件 | 页签类别 |
| ---- | ---- | -- | -- | ------ | ------ | ---- | -------- |
| 官方预制引用 | 8.1 | instance ID | {1:resID, 2:1} | f5×10 | f6×15 | f7×6 | 400 |
| 自定义元件定义 | 4.1 | 定义 ID | resID 直接 | f6×8 | f7×15 | f8×6 | 100 |
| 实体 | 5.1 | 实体 ID | {1:定义ID} | f5×10 | f6×15 | f7×6 | 200 |

ID 空间：三类对象共用同一计数器（本实验实测 1077936129 定义 → 1077936130-140 引用
元件 → 1077936141 实体，连续），与下文“ID 共用计数器”一致。

验证层级：真实编辑器观察（10 轮相邻快照，UTF-8 名字与全部 ID 解码确认）；
未做手工重放/真实写回/游戏验证。证据快照：
`~/genshin-ts-evidence/prefab-box-investigation/exp1/raw/`（before.gil 建图骨架 →
after-open-save.gil 首开补全 → after-add-box.gil → after-add-sphere.gil →
after-add-many.gil → after-sphere-custom.gil → after-place-custom-sphere.gil →
after-delete-entity.gil → after-aux-custom-sphere.gil）。

#### 装饰物引用元件与元件层 transform（2026-08-09，轮 10）

装饰物（aux）引用元件（无论官方还是自定义）的 wire 规则：

```text
root 27 新增 definition-side aux（134B，本轮样本）：
  f1 = auxID（1073741828）
  f2 = 元件的资源 ID        ← 官方元件 = resID；自定义元件 = 其定义 f2
                             （转自定义时继承的官方 resID，无独立资源 ID）
  f4 槽40.f50.f502 = 宿主元件定义 ID（root 4，如空模型自定义定义 1077936130）
  名字槽"装饰物_1"、transform（可压扁 scale=(1,0.5,1)）、材质槽
```

**结论：引用自定义元件与官方元件在装饰物层 wire 完全相同**（aux f2 都是官方
resID），自定义元件不产生独立资源 ID。工具实现：装饰物引用元件 ID 时需把
defID 解析为定义 f2 再写盘。本轮 prefab-box layout B 还闭合到：instance-side aux 的
owner 必须改写为当前 prefabId；若沿用骨架 donor owner（候选 v1 的 1077936138），
编辑器保存会清理该实例侧 aux。

元件层 transform 修改（此前 INSUFFICIENT 缺口，本轮补样本）：root 4 球体定义
压扁 = f7槽1.f11.f3 scale y 1.0→0.5（等长改写，与实体层 transform 槽同构）。

root 22 属性注册表本轮新增 "ModelDisplay"（12B 纯字符串）+
"PropertyAttachArchetypeModel"（28B）两条；语义仍 INSUFFICIENT。

`INSUFFICIENT`：root 4 定义 f2 直接 resID 与自由新建元件（无官方基础）定义形态是否
一致；root 22 各条目（Transform 拆分/ModelDisplay/PropertyAttachArchetypeModel）
语义；自定义定义修改后已放置实体是否联动（entities 实验已确认“元件改色三层
同步”，scale 修改的三层联动待确认）；跨地图/跨版本普适性。

#### 实体组条目登记规则（2026-08-06，瀑布/五棱柱等 6 样本）

root 6 实体组聚合 record（顶层 `#1=3`）的 field 3 group 内 `#5` 条目，type 值区分三种登记：

| type | 语义 | id 指向 |
| ---- | ---- | ------ |
| `100` | definition 登记 | 元件 definition ID |
| `400` | instance 登记 | 元件对应的 root 8 instance ID |
| `200` | 实体登记 | 场景实体 ID |

**条目纯追加式**：按创建顺序追加到组末尾（v3→v4 实测：五棱柱元件 133 的
`(400,134)(100,133)` 之后追加五棱柱实体 `(200,135)`，实体条目不插在元件条目中间）。

**ID 共用计数器（2026-08-09 修正）**：definition（root 4）、instance（root 8）、
entity（root 5）的 ID 观察上连续，但**并非全局唯一**：prefab-box 轮 10 实测 root 4
自定义定义 ID 1077936130 与 root 8 长方体实例 ID 1077936130 同值共存，编辑器
正常保存。修正后规则：

- **root 5 实体 ID 必须全局唯一**：撞已有 instance/definition/entity 会使编辑器报
  “存档损坏”（2026-08-06 实测：实体 131/132/133 撞 instance 131/132/133、
  实体 135 撞 instance 134 之后分配的五棱柱实体 135，编辑器均拒绝加载；ID 取
  max+1 后正常）。
- **root 4 定义与 root 8 实例允许同值**：转自定义的定义 ID 自增（球体→129、
  空模型→130），与 root 8 引用实例起点（130）相邻；官方引用实例（f2 带 {2:1}
  标记）不占用 root 4 定义空间计数。
- 实体 ID 分配仍按“当前最大已用 ID + 1”。

真实样本登记序列（v4，编辑器保存）：

```text
(200,1094713345)           官方默认实体
(400,129)(100,129)         瀑布元件（instance 129）
(200,130)                  瀑布实体
(400,131)(100,130)         长方体元件（instance 131）
(400,132)(100,131)         球体元件（instance 132）
(400,133)(100,132)         平面元件（instance 133）
(400,134)(100,133)         五棱柱元件（instance 134）
(200,135)                  五棱柱实体（追加式）
```

`INSUFFICIENT`：ID 计数器的跨地图/跨版本普适性；type `400` 首个元件样本（瀑布
instance 129 = definition 129）是否与常规“元件 ID+1”一致；其他实体来源。

#### 基于元件创建实体的 wire 规则（2026-08-06，瀑布/五棱柱同元件样本）

`assets:entities import`（`entityFromDefinition`）从元件 definition 重建实体记录，规则
与真实编辑器产物**逐槽同构**（瀑布元件实体 130、五棱柱元件实体 135 两个权威样本）：

- 实体记录 = `#1 id + #2 relation{1:defId} + #5 能力槽 + #6 装饰/transform 槽 + #7 组件槽 + #8 resourceId`；
- `#5` = definition `#6` 能力槽逐槽转换（首个含名称），追加两个默认能力 `{1,19}/{1,28}`、`{1,52}/{1,62}`；
- `#6` = definition `#7` 装饰槽逐字节继承（首个槽为 transform owner，`#11` 被重写）；
- `#7` = definition `#8` 组件槽逐字节继承；`#8` = definition `#2`（元件 class，如 10009001 长方体）；
- transform owner `#11 = {1: position(稀疏), 2: rotation(稀疏), 3: scale(密集三轴)}`，
  零值轴省略、scale 三个 float32 全写（scale=2 → `1a 0f 0d00000040 15 00000040 1d 00000040`）；
- 编辑器新图首次保存自动补全官方默认实体批次（root 5 的 11 条官方模板实体 + 完整 records）。

以上规则在“ID 正确 + 登记追加式 + 记录同构”条件下仍曾报存档损坏；根因已于 2026-08-06
闭合：**applyEntities 写回时原样复制源文件 20 字节头部，payload 变大后头部两个长度字段
过期**（编辑器按头部长度解析 payload）。修复：统一用 `buildFile` 重建头部（与其他写回路径
一致）。教训：所有 GIL 写回路径必须用 `buildFile`，不得手工拼接 `头部+payload+尾部`。
另：编辑器每次保存都会在 root 46 追加一条 22B 记录（v2→v3→v4→用户重存各 +1），
疑似每保存审计记录，与实体创建无关联，不模拟。v6→v7 观察到 root 46 发生一次
等长替换（113B→113B，1 增 1 删），语义仍 INSUFFICIENT。

#### 编辑器实体语义补充（2026-08-06，v5/v6/v7 三快照，用户游戏验证通过）

- **guid = 实体 ID**：编辑器场景中实体显示的 GUID 即 root 5 实体记录 `#1` 的 ID
  （用户确认，注入实体 136/137/138 与编辑器新建实体 139 均成立）。
- **创建实体 = 元件属性快照**：编辑器基于元件新建实体时，名称槽取**元件名**（如球体
  元件 → 实体名称槽为“球体”而非“球体实体”），材质/装饰/组件槽逐字节复制自元件
  definition，transform 独立为场景放置位置。`assets:entities import` 名称可自定义，
  若要 1:1 模拟编辑器行为应默认用元件名。
- **元件改色 → 三层同步重写**：编辑器保存时，元件装饰/材质槽变更会同步重写依赖它的
  root 4 definition、root 8 instance、root 5 实体记录（v5→v6 实测：球体元件加自定义
  颜色，三层同一材质槽字节完全一致 `08 16 82 02 15 08 01 18 d7 ae b5 ff 0f …`）。
  实体记录存的是元件状态快照，不是运行时动态引用。
- **新实体 ID = 当前最大已用 ID + 1**（v6→v7：编辑器新建球体实体 139 = 138+1），
  与共用计数器规则一致；root 6 组条目 `(200,139)` 纯追加。

证据快照：`~/genshin-ts-evidence/entities/create-entity-v5/raw/`（用户重存）、
`create-entity-v6/raw/`（球体元件改色）、`create-entity-v7/raw/`（编辑器新建球体实体）。

#### 元件/实体颜色编码（2026-08-06，v6/v8/v9 快照，用户游戏验证通过）

- 材质颜色 = packed `0xAARRGGBB` varint（与 UI 文本框颜色同一编码）：白色 =
  `0xFFFFFFFF`、粉红 = `0xFFED5757`（v6 球体元件改色样本，事后确认为粉色系）、
  纯红 = `0xFFFF0000`（import 写入，用户验证游戏显示红色）。
- 材质槽路径：实体 `#6{f1=22}.f32`（definition 侧 `#7{f1=22}.f32`）。内部：
  `f1=1` = 启用自定义颜色标记（默认材质无此字段，v8 打开自定义后 21B→23B）、
  `f3` = 颜色值 varint、`f4` = fixed32 100.0、`f5` = 材质引用（球体改色时
  0x7FFFFFF→0x07B5AED7，语义 INSUFFICIENT）、`f6` = 6700。
- **实体级独立颜色 CONFIRMED**：直接改写实体记录材质槽（元件保持默认色），
  编辑器加载正常且游戏显示红色（用户核验）——实体可在元件之外独立改颜色。
- **元件改色 → 全依赖同步**：root 4 definition + root 8 instance + **所有**
  基于该元件的 root 5 实体记录同步重写同一材质槽（v8 实测：长方体元件开
  自定义白色，29 个实体 = 长方体实体 136 + 火箭机身 141 + 27 个魔方块全同步）。

证据快照：`create-entity-v8/raw/`（长方体元件开自定义白色）、
`create-entity-v9/raw/`（红色方块 145 + 魔方整体抬高）。

#### 实体挂装饰物（2026-08-06，v11/v12/v13/v14 + 1849 备份对照，v12 已注入游戏核验）

实体（root 5）可以挂装饰物（贴片），与元件的装饰树同构，但只有实例侧（无定义侧配对）。
**aux 记录完整结构（v11/v13/v14 三版本一致，当前编辑器格式；1849 元件级拼装同构）**：

```text
root 27 > f2（每条 = 1 个装饰物 aux）:
  f1  = auxID（0x40000001 起独立 ID 空间，逐个 +1；v13 55 条 = 1073741825…1879）
  f2  = 资源模型 ID（10009001 长方体贴片 / 20001220 球体 / 10005018 空模型=删除占位）
  f4  ×3~4，每条 f4 内 f1 = 槽类型码：
    t=1:  f11={f1=显示名称}（名称槽）
    t=40: f50={f502: ownerID}（挂接槽，f502 varint = 宿主实体 ID）
    t=111: f93 空（占位槽）
    t=20: f29 空（删除标记槽，仅删除装饰物时出现，v13 星球样本）
  f5  ×4，每条 f5 内 f1 = 槽类型码：
    t=1:  f11={f1=position, f2=rotation, f3=scale}（稀疏编码，0 分量省略）
    t=5:  f15={f1=1, f2=1}
    t=2:  f12 空
    t=22: f32 材质槽（同实体颜色编码，见下）
  f12 = {f1: 宿主ID}（instance-side aux 的实例配对；1862 足球样本：definition 与
  实体各 132 条 27.2 aux，f12.f1 分别为 defId/实体 ID；2026-08-10 闭合）

实体侧挂接（root 5 实体记录 f5 槽）:
  f5{f1=40}.f50 = {f501: auxID×N varint 列表}（f501 = 实体→装饰物正向引用；
  多个贴片拼一个列表。星球样本 hex `aa 1f 05 81 80 80 80 04`）

aux 侧归属（root 27 aux 记录 f4 槽）:
  f4{t=40}.f50 = {f502: ownerID varint}（aux→实体反向引用，星球样本 hex `b0 1f 8c 80 80 82 04`）
```

- **4010/4016 前缀语义已闭合（2026-08-06 解码修正）**：`aa 1f` / `b0 1f` 不是 varint
  流前缀，而是 protobuf key（varint 值恰为 4010/4016）：`0x1FAA` → field **501** wire 2
  （auxID 列表）、`0x1FB0` → field **502** wire 0（ownerID）。f50 内容是嵌套 message
  `{f501: auxID×N}` / `{f502: ownerID}`，不是 `[4010, len, auxID×N]` 平铺流。
- **材质槽 f5 双语义已闭合**：f5 恒为 f3 颜色 `0xAARRGGBB` 的 RGB 24 位部分，不存在
  “球体材质引用”语义。v6 球体改色样本 hex `…28 d7 ae b5 07 30 ac 34` 中 f5 varint
  `d7 ae b5 07` = 0xED5757（粉红 RGB，与 f3=0xFFED5757 一致）；此前记录的
  “0x7FFFFFF→0x07B5AED7 材质引用”是把 5 字节 varint 读反的解码错误，作废。
  材质槽完整字段：`f1=1` 启用自定义颜色标记、`f3=0xAARRGGBB`、`f4=fixed32 100.0`、
  `f5=RGB`、`f6=6700`。
  **v1→v2→v3 相邻链修正（2026-08-08）**：地图 `1073741862` 中编辑器新建的
  definition/instance 两侧默认 aux，材质槽 raw 均为
  `18ffffffff0f250000c84228ffffff0730ac34`，字段严格为 `f3=0xFFFFFFFF,
  f4=100.0, f5=0xFFFFFF, f6=6700`，**没有显式 f1**（v2 SHA-256
  `71bf02de…e204e`）。下一轮只在宿主自定义元件启用自定义颜色并选取
  `0xFFD92727`，宿主 definition/instance 材质同步新增 `f1=1`，f3/f5 分别变为
  `0xFFD92727/0xD92727`；root 45 MRU 同值，而 root 27 两条 aux raw hash 均保持
  `d2f0503a…136c4` 不变（v3 SHA-256 `f6f85f8a…8318b`）。因此当前受限结论是：
  **新建默认 aux 可省略 f1；宿主材质启用自定义颜色时显式写 f1=1**。v21 某条既有
  aux 的 `f1=1, f3=0xFFFFFFFF, f4=100.0, f5=0xFFFFFF, f6=6700` 仍是有效 raw
  观察，但在缺少其创建与颜色操作历史时，不能再把它命名为“从未改色的默认 aux”，
  也不能据此作废无 f1 的默认形态。aux 自身从默认到自定义颜色的 transition 尚未实验，
  保持 `INSUFFICIENT`。证据：
  `~/genshin-ts-evidence/gil-whole-structure/2026-08-08-entity-component-rules-lab/experiments/`
  `v1-to-v2-add-decoration/` 与 `v2-to-v3-enable-custom-color/`；两轮独立 Validator
  均直接从 raw 快照接受关键断言。
- **装饰物颜色"不透明度"由 f3 的 Alpha 通道决定，f4 是冗余 float 百分比（2026-08-23 魔方 F 块实证，用户修正）**：
  装饰物 aux 材质槽 `f5{t=22}.f32` 的 f3 = 0xAARRGGBB，**最高字节 A = 不透明度**（0xFF=100%
  不透明；0x02≈1%，几乎全透明、透出底层深灰块体 → 视觉"贴片不是纯色"）。f4 是 wire5 fixed32
  承载的 IEEE754 float32，语义为**不透明度百分比 = A/255×100**，与 f3 的 A 冗余一致：
  A=0xFF → f4=100.0（1120403456，0x42C80000），A=0x02 → f4=0.7843（1061734601）。
  实证：魔方 3x3 F 面心块贴片（星枢3x3块_v2_F，装饰物 1073741987）f3=0x0235C96F（A=0x02，
  编辑器 UI 显示"不透明度 1%"），看起来"不是绿色"；其余 8 个 F 面块 A=0xFF 正常。修复 = 把
  **f3 的 A 通道 0x02→0xFF**（即编辑器 UI 的"不透明度"改 100%）；单独改 f4 不影响游戏渲染
  （f4 只是冗余存储）。排查贴片"颜色不对/不是纯色"先看 `f5{t=22}.f32.f3` 最高字节 A，
  不要只比对 f3 的 RGB 低 24 位或 f4。
- **root 45 = 编辑器“最近使用的颜色” MRU 列表（2026-08-06 v0-v21 全链闭合）**：
  v0 无此 root，v1-v5 空记录（len=0），v6 用户调色板选色后出现单条粉红 0xFFED5757；
  结构 = `f1{f1=1, f11{f1{f3: 0xAARRGGBB varint 列表}}}`，**最新在前**（头部插入）。
  用户确认语义为“最近使用的颜色”（非收藏表）。证据：v17 用户添加 3 色后列表
  [0xFF419E84, 0xFF0F3D20, 0xFF21DF0F, 0xFFED5757]（新色在旧粉红前）；v21 用户
  再添加并修改新色后列表 = [0xFFB75FFC, …4 旧色]——新色插头。
  注意：v21 新色 wire 解码为 0xFFB75FFC（varint `fc bf dd fd 0f`），早期记录的
  0xFFD75FFC 是误记（2026-08-07 静态复核修正）；用户 UI 显示值未与 wire 对齐验证。
  边界：经调色板添加/选色才入列表；直接输入色值上色不入列表（v17 应用色
  0xFF58D284 不在列表中）；脚本/import 注入颜色从不触发（v9 红/v12-v14 多彩贴片
  均未更新）。列表上限未知（v21 为 5 色）。
- **删除装饰物已闭合（形态，v13 星球样本）**：aux 记录保留但 f2 资源换成空模型
  10005018，并新增 `f4{t=20}` 槽（内容 f29 空）；挂接槽 f50（f502=ownerID）保留，
  实体 f1=40 挂接槽（f501 列表）保留原样。t=20/f29 的正式语义名 INSUFFICIENT。
- root 22 属性注册表新增 `PropertyAttachArchetypeModel` 条目（f2 字节数随条目数增长）；
  root 46 是 5 槽 LRU 登记表（编辑器自维护，写回不碰）。
- 贴片 transform 为相对实体中心的局部坐标（1849 实测：偏移 0.52、
  尺寸 0.82×0.025×0.82）；贴片资源用官方长方体 10009001。
- **实体 transform 槽在 f6（非 f5）**：`f6{f1=1, f11={f1=position, f2=rotation, f3=scale}}`，
  三者均为 `{f1=x, f2=y, f3=z}` f32、稀疏编码（0 分量省略）。
- **rotation 非零值编码已闭合（2026-08-06 v15 用户旋转实验）**：编辑器把魔方块-1-1-1
  （实体 1077936145）绕 Y 轴转 45° 后，其 f6.f11.f2 从空 message（len=0，全零）变为
  `12 05 15 00 00 34 42` = `{f2: f32 45.0}`。单位 = 度；单轴旋转只写对应分量
  （Y=45° → 仅 f2）；多轴时写多个分量；全零/默认 = 空 message（len=0）。
  伴随变化：root 22 属性注册表新增 `PropertyChildModel` 条目（f2 位图 5→6 字节，
  推测旋转时登记子模型跟随属性，单样本 INSUFFICIENT）；root 27 贴片 aux 不变
  （局部坐标随实体旋转，游戏引擎处理）；root 46 等长保存副作用。
- **多轴欧拉角顺序已闭合（2026-08-08，用户分步旋转三步样本 + wire 交叉）**：
  编辑器旋转 = YXZ 内旋，矩阵 `R = Ry(β)·Rx(α)·Rz(γ)`，面板显示值 = wire 值（直写）。
  证据：用户对平面实体 1077936138 分步旋转（X45→Z~25→Y~30→X-45），每步面板值
  （44.10,0,23.44 → 28.78,29.33,41.26 → -7.49,1.09,35.67）与保存后 wire 逐值一致，
  且按 YXZ 内旋分解的三步矩阵一致性误差≈0（其他 5 种顺序 0.3+）；分步旋转 = 矩阵级
  累积后按 YXZ 重新分解显示（绕 Z 25° 后 X 从 45→44.10 即重分解证据）。
  **旧脚本 .local/tmp/generate-football.ts 的 eulerToNormal 已作废**：其“Unity ZXY”
  假设方向碰巧对（YXZ 内旋 z=0 等价），但 x 分量符号反了（生成 +asin(n_y)，正确应为
  -asin(n_y)），这是“飞散方板球壳”的直接原因之一。旋转面板输入即 wire 值；
  basisToEuler（football_geometry.ts）默认 EULER_ORDER='yxz' 按此闭合规则提取。
  证据快照：`entities/football-empty-model-sample*/raw/`（before 7fa4557a / 中间 / after 2cb749a4）。
- **空模型实体（root5 场景实体 res=10005018）规则已闭合（2026-08-08，用户样本 1077936172）**：
  编辑器“空物体/空模型” = root5 实体记录，f2={f1:10005018, f2:1}（资源 ID 直接作定义引用，
  无 root4 定义配对）、f8=10005018；f5 槽 11 个（t=1 名称/13/14/38/t=40 挂接（f50 空）/111/61/62/19/20/52）、
  f6 槽 14 个（t=1 transform + t=22 材质默认色 f3=0xFFFFFFFF + 组件引用等）、f7 组件 6 个（含 t=18 移动）。
  这是“空父对象”宿主语义，**区别于 aux 删除占位**（aux f2=10005018 + f4{t=20} 槽）。
  创建新实体时 root 6 大记录（组ID=3）f3.f5 列表末尾追加 `{f1:200, f2:新实体ID}`（真实样本差分，
  568B→579B +11B），root 46 等长保存副作用；本次创建无 root 22 新条目。
- **基础元件资源实体（2026-08-06，用户放置五棱柱/三棱柱样本 1077936173/1077936175）**：
  编辑器“基础元件”资源（五棱柱=10009005、三棱柱=10009004，几何：五棱柱高1/底边到顶点距离1、
  三棱柱高1/边长1）放置后 = root5 实体记录，**直接 res 引用（f8=资源ID，f2={f1:资源ID,f2:1}），
  无 root4 元件定义**；字段签名与空模型宿主同构（f5 槽 10 个、f6 槽 14 个、f7 组件 6 个）。
  实体 transform f6{f1=1}.f11 = {f1=pos, f2=rot, f3=scale}，各轴 = **带 tag 的 fixed32**
  （`0d/15/1d` 前缀 + 4B 小端，非 packed），稀疏省略 0 分量（如 pos 只有 x,z → 两轴），
  尾部 f501=-1；scale 非均匀即可“压扁”（五棱柱压扁作五边形面片：scale=[r, t, r]）。
  root6 组 3 登记追加格式同上（f3.f5 条目 `{f1:200, f2:实体ID}`，9B/条）；
  放置五棱柱/三棱柱会在 root 22 组件注册表追加 `"PropertyDefaultBorn"`/`"PropertyReMark"`
  （地图级，同资源后续实体无需重复注册）；材质槽 f6{f1=22} 默认白
  （f3=0xFFFFFFFF、f4=100.0、f5=0xFFFFFF、f6=6700）。
  证据：`entities/football-prism-sample/raw/`（before f5303c00 足球写回态 / after be18b888 用户放置后）。
- **三棱柱/五棱柱零旋转视觉基准（2026-08-09，生产写回 + 用户游戏截图核验）**：
  正式静态拼装候选写回地图 `1073741862`，生成自定义元件 `1077936134`“足球棱柱校准”
  （空模型 `10005018` 主体），写后 GIL 与候选 SHA-256 均为
  `07706ec207ee94c6dcdd3e5a50a1110a916f5ff263d5175e0b5e6dfca8b1c4f3`。元件内以
  `scale=[1,1,1]` 长方体 `10009001` 为尺寸参照，三棱柱 `10009004` 与五棱柱
  `10009005` 各放置 `rotation=[0,0,0]`、`[0,30,0]`、`[90,0,0]` 三个样本；用户明确说明
  长方体原始尺寸和地格均为 `1×1×1` / `1×1`。截图确认两种棱柱零旋转时高度轴均为 Y、
  底面位于 XZ 平面，顶面单个顶点朝世界 `-Z`、相对边朝 `+Z`；绕 Y `30°` 只改变底面水平
  朝向，绕 X `90°` 后高度轴转到 Z 轴并侧躺。视觉尺度与已记录资源参数一致：三棱柱高 1、
  底面外接圆直径 1（外接半径 0.5、边长 0.866）；五棱柱高 1、底面外接圆直径 1
  （外接半径 0.5、边长 0.588、顶点到对边距离 0.905）。
  **2026-08-09 用户游戏内实测修正**：旧结论“三棱柱边长 1 / 五棱柱外接半径 1”是目测误判，
  已废弃；基础元件统一设计语言 = scale=1 时底面外接圆直径 1。
  游戏截图证据：`$HOME/genshin-ts-evidence/static-assembly/football-prism-calibration-v1/game-validation/实体.png`，
  SHA-256 `de87e31e98bc1a3f1f8a10175af3eccc4df6aa918f401293b649d74035b7b4a7`。该截图确认当前
  游戏版本下的可见朝向、相对尺寸和旋转结果；透视画面不单独证明像素级长度或角度精度。
- **高精度足球棱柱壳 v1 视觉核验（2026-08-09，写回成功 + 用户游戏截图，需优化）**：
  自定义元件 `1077936135`“高精度足球”使用 12 个黑色五棱柱与 120 个白色三棱柱，写回地图
  `1073741862` 后目标与候选 SHA-256 均为
  `d69e509119e8a25db57b0d6732bd91633d847a6cddbb868c2ea54207f165b5ff`，自动闭包回读为
  `complete`。用户截图确认元件可加载且整体轮廓大致成球，但当前视觉质量不通过：纯白面片在
  游戏光照下过亮刺眼；多个面片汇合处及相邻多边形边界可直接看到草地背景；黑色五边形相对
  周围白色球壳覆盖偏小。截图证据：
  `$HOME/genshin-ts-evidence/static-assembly/football-prism-shell-v1/game-validation/足球.png`，
  `613×615`，SHA-256 `c27a32aa8d0c8865241c9275fb878351ab5e95e4991b05d64bc58d0e2d1e1933`。
  该透视截图只支持上述定性缺陷，不单独给出应采用的精确颜色、重叠或缩放补偿；修正应使用
  统一参数和并排 v2 候选，不逐面手调。root 5 场景实体阶段继续等待优化后的元件视觉通过。
- **编辑器保存会规范化（v13 实测，root27 补充）**：aux 材质槽 f5=0 默认值会被删除
  （72 条足球 aux 各 -2B，2026-08-06 用户放置样本保存时）；手写时 f5=0 不要写；
  材质槽 `f5` 被同步为 f3 颜色的 RGB 部分
  （深灰 0xFF171A22→f5=0x171A22、蓝 0xFF0000FF→f5=0xFF），手写时必须直接写
  RGB 而非固定 0xFFFFFF；0 贴片块的空挂接列表（f50）会被清空，生成时不要写；
  实体 transform position 为稀疏编码（0 分量省略）。
- 批量生成脚本：`.local/tmp/generate-cube-stickers.ts`（v12 魔方 54 贴片，
  已按 v13 规范更新，输出与 v13 逐字节同构）。

证据快照：`create-entity-v11/raw/`（星球实体挂 1 装饰物）、
`create-entity-v12/raw/`（魔方 54 贴片注入，游戏核验通过）、
`create-entity-v13/raw/`（编辑器规范化 + 删除装饰物样本）、
`create-entity-v14/raw/`（定稿参数重生成，待游戏核验）；
1849 元件级拼装参考：`~/star-cube-nexus/backup-1073741849-pre-prune.gil`（f1 定义侧 + f2 实例侧）。

#### assets:entities import 更新语义（2026-08-06）

- `assets:entities export` 当前实现对空地图或缺失 root 5 的文件返回空列表；这只是 CLI 边界，不是对真实编辑器新样本的新增结论。

  缺失字段继承原记录（transform/名称/已启用颜色值）；新增 `color: '#RRGGBB'`。
- ID 冲突仅剩被 root 6 组条目（type 100/400）或已有实体占用的情形。
- 场景地面 = y=0（编辑器实体默认放置面）；造型摆放时实体中心 y ≥ 0.5
  才不会陷地（魔方 27 块 y∈{-1,0,1} 时底层看不见，抬到 {0.5,1.5,2.5} 后可见）。

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

客户端图 20010（CharacterControlSkill）folder typeValue = **7400**；技能图 20002（Skills）
folder typeValue = **2200**（2026-08-29，1073741914 真实相邻快照 + `/tmp` 同构重放后
root 6/10 与 after 逐字节一致）：新建这两类图 = root 10 在既有图 field 1 记录之后追加
`{1: NodeGraph}`（NodeGraph 含 1 个自动「节点图开始」节点 `genericId.nodeId=200042` +
`entrySlotIndex=1`），root 6 对应「未分类页签」record 的 f3 末尾追加
`f5={1:typeValue, 2:图ID}`（20010→folderId67，20002→folderId14）。细节见 `node-graphs.md`。

技能配置资产（skill config，2026-08-29，1073741914 真实快照 v3→v4 + `/tmp` 逐字节同构重放）：

```text
root 6  重写「未分类页签」record（本图 folderId=68），f3 末尾追加 f5={1:7500, 2:技能配置ID}
        # 7500 = 技能配置 folder typeValue
root 15 追加一条 field 1 记录 = 技能配置资产：
        {1: 技能配置ID, 2: 36(技能配置类别，固定), 4[*]: 分节}
        4[0] = {1:1, 11:{1: 名称UTF-8}}            # 名称（本样本「操控技能」）
        4[1] = {1:21, 30:{ 技能体 }}                # 技能体
        4[2] = {1:35, 45:{ 节点图事件轨道 }}
        4[3] = {1:36, 46: 空}
root 16 追加一条 field 1 记录 = 平行引用（同 ID 双写）：
        {1: 技能配置ID, 2: 技能配置ID, 3[*]: 与 root15.4[*] 同构，但 3[0].11 名称为空}

技能体 4[1].30.1 的子结构：
        1 = {7:20001}                      # 技能类别；普通技能加 4:2，瞬发技能无 4
        2 = {}
        3 = {2:1,3:2,5:1,9:2,10:..,11..16:f32}   # 默认参数块
        4 = {2:1}
        5[*] = {1:客户端图ID, 2:轨道点ID}          # ★ 节点图引用，repeated（每绑一张图一条）
        6..9 = 其余默认块（含 packed 502 动画数据）

事件轨道 4[2].45 = {1:{轨道条目}, 2:计数, 3:260128}：
        未绑定默认 = 1:{2:{1:"节点图事件轨道",2:1,3:1,4:1,6:805306369,9:1000.0,11:1}, 9:{1,1}, 10:{1,1}, 16:1}，2=61
        绑定后     = 1:{9:{1,1}, 10:{1,1}}，2=62
```

`CONFIRMED`（单图 + 多图绑定样本，2026-08-29）：技能 ID=1228931073；创建（2a）、单图绑定
（2b）与多图绑定（2c）的 root 6/15/16 均经 `/tmp` 逐字节同构重放与 after 一致。客户端图
引用字段 = `root15.4[1].30.1.5[*]`（**repeated**，每绑一张图一条）= `{f1:图ID, f2:轨道点ID}`。
技能类型普通/瞬发 = `4[1].30.1.1.4`（普通=2，瞬发=字段缺失，其余取值未采样）。

`INSUFFICIENT`：`f5.f2`（轨道点 ID）语义未闭合——首绑=1073741825、次绑=1073741832，
与参考地图 1082130436 首绑样本一致（首绑 1073741825），但该 ID 的分配规则/指向未定；
事件轨道打点结构语义未闭合（f45.f2 计数 61→62 只在首次绑定发生，后续绑定不再变化）。

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

### 变量全类型通用规则（2026-08-18 多样本 CONFIRMED）

> 来源：`~/.genshin-ts-evidence/toolchain-gaps/1073741894/`（`after-dict*.gil` 多样本，
> 2026-08-18 编辑器逐步创建，CLI 逐项解码 + round-trip 验证）。
> 状态：`CONFIRMED`（多样本互相印证），但仅限该锁定地图/编辑器版本；游戏内运行时行为
> 未验证。属 `d7bd151f...` 之后新增的独立证据批次。

前述 bool/int 限定观察的“`4/3` 不能升级为通用类型码”在此被推翻：编辑器连续创建
str_list/vec3/dict 等变量后，**类型码是正式 enum**，entry 顶层形状一致，默认值字段
严格等于 `类型码 + 10`。

| 类型码 | 类型 | 默认值字段 | 值编码（f<type+10> 内容） |
| --- | --- | --- | --- |
| 3 | int | f13 | `{f1: varint}`（0 为空 field） |
| 4 | bool | f14 | `{f1: varint 0/1}`（false 为空 field） |
| 5 | float | f15 | `{f1: fixed32}` |
| 6 | str | f16 | `{f1: UTF-8}` |
| 12 | vec3 | f22 | `{f1,f2,f3: fixed32}`（可稀疏） |
| 1/2/17/20/21 | entity/guid/faction/config_id/prefab_id | f13 | varint，与 int 同构 |
| 7/8/9/10/11/13/15/22/23/24 | 十种列表 | f<type+10> | 原始标量列表 packed（guid/int/bool/float/entity/faction/config_id/prefab_id→`{field1(len), 值=元素原始字节拼接}`；entity 元素为完整 `{field1(varint)}`）；str_list/vec3_list 保持重复 field1 len 包裹 |
| 27 | dict | f37 | parallel f501/f502 + f503/f504（新建无 Map25 层） |

entry 结构：`11.1[*]`（关卡实体 root5.1.7.11；元件 root4.1.8.11 同构）→ `f2` 名称、
`f3` 类型码、`f4` 默认值 `{f1=类型码, f2=类型包裹, f<type+10>=值}`、`f5=1`、`f6` 类型
包裹。**新建 dict 的 `f37` 不含 Map25 实体映射层**（与编辑器新增变量5-10 真实样本一致）；
Map25 层仅出现在编辑器多对历史样本（新增变量1 等），非新建必需，CLI 不再分配 Map25 场景
实体 ID。dict marker 按 `(keyType, valueType)` 枚举，实测表见
[`variables.md`](variables.md)（str/int key × 标量/列表）。

容器路径：元件定义 = `root4.1[prefabId].8.11`（field8）；场景实体 =
`root5.1[entity].7.11`（field7，type1 组件槽）。CLI：
`assets:level-variables --entity <id>` / `assets:custom-variables --entity <id> --vars`
/ `assets:custom-variables`（config，target prefab/player/character，declarations 含
dict）。新实体由 `assets:entities import` 创建时继承定义 f8→f7 的变量容器。

> 编码细节修正（对照真实样本）：str 列表元素是单层 `field1(len){字符串}`（非双层
> `{f1:字符串}`）；str dict 值 `f16` 需解包 `f16.f1`；原始标量列表使用 packed
> `{field1(len), 值=元素原始字节拼接}`（entity 元素为完整 `{field1(varint)}`）；
> dict marker 按 `(keyType,valueType)` 枚举、int key 用 f13 编码、新建 dict 无 Map25 层
> （2026-08-19 真实样本修正）。2026-08-19 用户游戏核验通过：基于修复后元件新建实体
> 完整继承原始列表与 dict 变量。

### 自定义镜头：创建、名称、物件镜头联合变化与视野检测

`CONFIRMED_BOUNDED`，但仅限当前锁定地图、编辑器版本和本批自定义镜头样本。连续创建两个
默认自定义镜头时，root `18.1[*]` records 按 `1→2→3` append-only 增加；既有 records
逐字节保持。当前 identity 候选为 `1073741825/26/27`，不能推广为通用 ID 分配器。

> 修正（component-investigation exp17，2026-08-05）：镜头 record **可删除**——删除
> “自定义镜头_1”后 root 18 从 208B 回到 83B（对应 record 整体消失），其余 root 全部
> 不动。“append-only”仅适用于创建序列，不适用于删除；删除不回退任何其他 root。
> 另确认（exp14/16）：物件镜头绑定在组件 type 13 槽 f23.f4（f1=镜头槽名、f2=镜头名、
> f502=镜头ID，双重引用 root 18）；移除绑定只清空槽配置，root 18 镜头定义保留。

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

`CONFIRMED`（2026-08-21 编辑器差分闭合，样本 `打印` 复合定义添加/删除）：删除一个复合定义 = 从 root 10 移除两条容器记录——`10.2[*]` 的 `CompositeDef` 记录（section 2）和 `10.4[*]` 的复合 impl 图记录（section 4，记录 id 与 def 相同或由 def `field4.sub4.field5` 指定）；若该 def 在自定义分类（root 10 field3）中有成员引用，需同步移出。root 46 的条目替换是编辑器保存副作用，不属删除语义，CLI 不模拟。已落地为 `gsts assets:node-graphs def-clean`（`src/cli/assets_node_graphs.ts` + `graph_edit.ts` 的 `deleteCompositeDef`）。

`CONFIRMED`（2026-08-21 编辑器差分闭合，样本 `view_orbit_trigger`→`view_orbit_trigger——2` + impl 新增 Print String）：修改一个复合定义 = 只改 `10.2[*]` 的 `CompositeDef` 记录（本次仅 `field200` name 变长）和 `10.4[*]` 的 impl 图记录（新增节点 n1、在 When Timer Is Triggered 的 OutFlow[0] 增加一条到 n1 的连线）；已有节点/连线保持不变，def ID 与 impl 图 ID 不变。root 46 仍是保存副作用。编译器侧已用 `forceFull` 支持把“未调用但需更新”的复合以完整 impl 输出（`src/runtime/core.ts`）。

### 静态字段树全景（2026-08-07，v21 快照 `7fa4557a…`，只读解析无新快照）

本轮对 v21 快照（实体/魔方线定稿态）做完整 root 字段树静态解析（41 个 root
occurrence，wire walk 全部直接子字段），并把 v20→v21 相邻差分复核。下列均为**静态
结构观察**，只有结构形态与已闭合规则交叉验证的部分标 `CONFIRMED`，编辑器语义全部
仍为 `INSUFFICIENT`，不替代相邻差分实验。

**v20→v21 差分复核（`before=acce9d8e…` / `after=7fa4557a…`）**：仅 root `5/45/46`
变化。root 45 30B→35B（MRU 加一色，与已闭合结论一致）；root 5 等长（24994B→24994B），
定点为 `5.1[14].6{f1=22}.32.f3` 颜色 varint `0xFF58D284→0xFFB75FFC`（球体实体上
新色，与用户 v21 声明一致；wire 解码为 0xFFB75FFC，早期记录 0xFFD75FFC 已修正），
f5 同步 `0x58D284→0xB75FFC`（编辑器 RGB 规范化）；root 46 110B 等长保存副作用。**root45 MRU 实验隔离性
验证通过**（无其他 root 受扰动）。

| root | 静态结构（v21） | 状态 |
| --- | --- | --- |
| `6` | 页面/分类树：`6.1[*] = {f1: 组ID, f2: {f1:'root', f3:1}, f3: {f1: 组名UTF-8, f3:2, f5[*]: {f1: typeValue, f2: id}}}`；组名样本：`root/默认/未分类页签/默认分类/玩家模版/职业`；typeValue 100/400/200/800/2200/7400 条目规则与已闭合结论一致（2200=技能图 20002，7400=client 图 20010，2026-08-29 快照闭合） | 结构 `CONFIRMED`（与实体组登记规则互证） |
| `7` | 地形图层容器（首次解析）：`7.1[*] = {f1: 图层ID(1073741825), f2: {f1: 图层名'地形01'}, f3: {f1: {f1: X, f2: Y, f3: Z} f32 稀疏, f2: 空}, f4[*]: {f1: (chunkX<<16)\|chunkZ, f2: 1}}`；v21 有 400 条 f4 = 20×20 网格（X,Z ∈ [100,119]），图层偏移 (-547.5, -2.5, -547.5) | 结构强证据；图层语义 `INSUFFICIENT` |
| `11` | 世界设定容器（首次解析）：`11.2[*]` = 阵营×3（`初始玩家/物件/造物阵营` + `UI_MarkPlayer_Faction_0/1/2` 图标引用）；`11.3` = 出生点（`出生点1`）；`11.5` = 预设点（`新建预设点`）；`11.1/11.6-11.9` 为世界参数 | 结构观察 `INSUFFICIENT` |
| `14` | 8 条 `14.1[*] = {f1: index 0-7, f2: 连续ID 1086324738-1086324745}`（0x40C00002-0x40C00009） | `INSUFFICIENT` |
| `15` | 配置/模板库（首次解析）：`15.1[*] ×4 = {f1: 模板ID(0x??400001 形态), f2: 配置码(12/26/4/5), f4[*]: {f1: 槽类型, ...}}`；模板名样本：`背包模板/环境配置/自定义职业/自定义成长曲线`；`15.1[0].f1=1119879169=0x42C00001` | `INSUFFICIENT` |
| `22` | 属性注册表机制确认：`f1[*]` = 6 条属性名（PropertyTransform/PropertyWaterFallColor/ModelDisplay/PropertyModelColorMaterial/PropertyAttachArchetypeModel/PropertyChildModel），**`f2` = 6 字节 `01×6`，字节数恒等于 f1 条目数、每条目 1 字节 0x01**（此前“位图 5→6 字节”即此机制；exp 观察 `01→0101` 一致） | 机制 `CONFIRMED`（静态）；正式名 `INSUFFICIENT` |
| `25` | 计分/成就容器：`25.2.f501` = 计分组（`默认计分组`，含负 varint -5/-20），`25.3` = 成就组（`默认成就/默认极致成就`），`25.4` = 排行榜（`默认排行榜`） | `INSUFFICIENT` |
| `29` | `f1='CNRELWin6.7.0'` + `f2-f5` = 4 个 8 位数字字符串 ID（45768959/46655081/46702795/46509556） | `INSUFFICIENT` |
| `35` | v21 仅 `{f1: {f1: {f2: 2}}}`（exp14 的 9 条派生字符串已不在；说明 root 35 是保存重建的动态缓存，不保留历史字符串） | 修正 exp14 观察；语义 `INSUFFICIENT` |
| `36` | 全局文本：`36.1 = {f1: 5301, f5: '全局', f14: '你好！', f15: 1073741825}` | `INSUFFICIENT` |
| `38` | `{f1: 1, f2: 1}` 两个 varint | `INSUFFICIENT` |
| `45` | MRU 颜色列表 v21 = 5 色（已闭合） | `CONFIRMED` |
| `46` | 5 条 `46.1[*] = {f1: 8B varint, f2: 8B varint}`（20B/条，保存副作用等长替换） | `INSUFFICIENT`（勿命名） |

已闭合/部分闭合 root 的静态复核无冲突：root 2 名字、root 4/8 元件 def/instance、
root 5 实体 + 变量记录、root 9 文本框 1073741829-1835、root 10 NodeGraph/CompositeDef/
信号索引、root 12 空（无计时器）、root 18 镜头、root 27 aux×55 均与既有结论一致。

### 记录级局部 patch 管线（2026-08-07，生产实现）

`src/cli/static_assembly/patch.ts` + `gsts assets:entities patch`：把已闭合规则整理成
读-改-写最小 diff（替代 `applyEntities` 整 payload 重建）。核心 `patchGilRecord`
定位 `root N.f1[recordId]` 的 LenField，`mutate` 后经 `applyReplacement` 只替换目标
记录字节，其余所有 root 字段原样保留（root 46 等编辑器自维护字段不触碰），
`buildFile` 重建头部。已封装操作：

- `patchEntityColor`：材质槽 `#6{f1=22}.f32` 的 f1=1 启用 + f3=0xAARRGGBB，
  **f5 同步写为 f3 的 RGB 24 位部分**（编辑器保存规范化规则，v20→v21 实测：
  f3 0xFF58D284→0xFFB75FFC 时 f5 0x58D284→0xB75FFC 同步；这是与既有
  `gil_entities.setMaterialColor` 的关键差异——后者不写 f5，编辑器再保存会漂移）；
- `patchEntityTransform`：f6{f1=1}.f11，复用 `gil_entities.setTransform`。

验证（`tests/gil_patch_test.ts`，真实快照）：v20 快照 patch 球体实体 1077936137
颜色 0xFFB75FFC 后，目标记录与 v21 编辑器保存记录**逐字节一致**；非目标记录与
全部其他 root 字段字节不变；patch 幂等；全文件对比 patch 预览 vs v21 仅差
root 45（编辑器 MRU 自更新）+ root 46（保存副作用）。

## patch 管线：装饰物（aux）操作（2026-08-08 封装，`src/cli/static_assembly/patch.ts`）

装饰物操作已封装为记录级 patch，复用上方已闭合的 aux 双向引用规则：

- `attachAux(bytes, entityId, auxId)`：**双向引用一次写完**——实体侧
  f5{t=40}.f50 = {f501: auxID 列表}（append，已有槽则更新 f50，无槽则新建
  f5{t=40} 槽）；aux 侧 f4{t=40}.f50 = {f502: ownerID}（无槽则新建）。
  幂等：已挂载则实体侧原样返回。
- `detachAux(bytes, entityId, auxId)`：实体 f501 列表移除；空列表回落到
  **编辑器规范化形态**（f50 = 空 message len 0，槽保留，v21 球体实体实测）；
  aux 侧移除 f4{t=40} 槽。后者无真实编辑器样本，是 attach 的逆操作推断
  （INSUFFICIENT：编辑器内删除装饰物走的是 f2 换空模型 + t=20 槽，不是 detach）。
- `patchAuxColor(bytes, auxId, argb)`：材质槽 `#5{f1=22}.f32`，f3/f5 同步
  （同实体颜色的编辑器规范化规则）。
- `patchAuxTransform(bytes, auxId, transform)`：f5{t=1}.f11（position 稀疏 /
  rotation 度数稀疏 / scale 三轴全量），复用 `gil_entities.setTransform` 的
  槽号参数化（实体 f6 / aux f5）。`readAuxTransform` 供 CLI 读回当前值。
- `createAuxRecord(bytes, record)`：新建 aux 记录（root 27 f2 append，
  patchRootField 替换整个 root message，applyReplacement 修复祖先长度）。
- `buildAuxRecord(spec)`：按 v21 编辑器产物结构生成记录（f4{t=1 名称,t=40 挂接,
  t=111 占位} + f5{t=1 transform,t=5,t=2,t=22 材质} + f12 空），字段树与
  v21 live aux 同构（tests/gil_patch_test.ts shape 断言）。

CLI（`gsts assets:entities patch`）：`--attach-aux <id>` / `--detach-aux <id>`
作用于实体；`--aux <id>` 把 --color/--position/--rotation/--scale 切换到 aux 对象；
`--remove-component <typeCode>`（可重复）从场景实体 root5 的组件槽列表（f7）按类型码移除组件。

验证（`tests/gil_patch_test.ts`，v21 真实快照）：挂载后实体 f501 列表与 aux f502
归属一致（双向），且与编辑器星球样本同构（f50 = {f501: auxID varint 嵌套
message}）；detach 后空列表 = 空 f50 message；颜色 patch f3/f5 同步且 owner 保留；
transform patch 回读一致且 owner 保留；createAux 字段树与 v21 live aux 同构；
全部操作只改动目标记录（跨 root 操作例外：attach/detach 合法同时改 root 5 与
root 27）。

## 节点图挂载（type 3 槽）规则与工具（2026-08-08 封装，`src/cli/gil_graph_mounts.ts`）

**规则（mount-case1/2/3/4 真实相邻快照 + 用户游戏核验，CONFIRMED）**：

- 挂载生效节点图 = 实体槽 type 3：槽列表（def root4 f7 / 元件实例 root8 f6 /
  场景实体 root5 f6）中 {1:3} 的槽，恒为槽列表第 3 条（15 条槽按 type 升序
  [1,2,3,4,5,6,7,8,11,12,16,17,19,20,22]）。
- 空槽形态 = `08036a00`（{1:3, 13:空}）；挂载后 f13.f1 每条 =
  `{1: {1:1, 2:图GID, 501:20000}}`（**两层 f1 包装**，501:20000 为 varint）；
  多图 = f13.f1 repeated 按挂载顺序追加（+17B/图）；解除最后一个图 → f13 回空。
- 图 GID 用完整值（1073741828，与 root10 Id.f5 同空间），不是短号。
- 三个容器各自独立记录：def 挂载双写 root4（f1=defID）+ root8 全部引用实例
  （f2.f1=defID 全值，含多实例）；场景实体挂载只写 root5（f1=场景实体 ID）。
- root6 分类聚合登记新 def ID 一次性，与挂载/解除生命周期无关（解除不回退）；
  root10/root9/root27 与挂载无关；挂载已有图不改图本体。

**CLI（`gsts assets:mounts`）**：`<attach|detach> <target-id>` / `list [<target-id>]`；
`--def`（root4+root8 双写）/ `--entity`（root5）；`--graph <gid>`（attach/detach；
`list` 不带 target-id 时改为反向查询：打印哪些 def/实体挂载该图）；`--output` 候选 /
`--write` 备份后写回；幂等；图存在性校验（root10 双层包装 Id.f5）；`--def` 无实例时
只写 root4，不存在 def 报错。

**盘点（`list` 不带 target-id，2026-08-08 新增）**：单次遍历输出四段——① root10 全部
节点图（GID+名称，`graphCatalog`）；② root4 全部元件定义（`listDefMounts`，51 条/
cd72deb3 实测）；③ root5 全部场景实体（`listEntityMounts`，16 条实测，root5 无独立
变量记录，变量列表嵌在某条实体记录内部，不构成独立记录）；④ 未被任何 def/实体挂载
的图。新用户据此即可看到当前地图的全部原件、场景实体与可用节点图，再按 target-id
执行 attach/detach。真实快照实测（cd72deb3）：def 1077936183 → {1829,1830}、实体
1077936180 → {1826,1844}，与恢复块一致；未挂载图含 1073741828 等 10 张。

验证（`tests/gil_graph_mounts.ts` + `tests/fixtures/mount_records.ts`）：
attach/detach 输出与 mount-case1/2/3/4 真实快照记录**逐字节一致**（空→挂 1828→
c1、空→两图→c3、c1→解除→c2、实体 {1826}→{1826,1844}→回退）；def 多实例同步
（patchAllMatching 逐条推进，测试抓出过只处理首条的 bug）；def 无实例边界；
attach→detach 整文件 sha256 还原。真实注入：entity 与 def 两路径 attach/detach
各一轮，用户游戏核验全部通过，地图恢复原始 hash。

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
- root field `22` 的正式消息名、field 2 每条目 1 字节 0x01 的用途，以及 EditData 类型名是否对所有组件采用同一注册规则；
- root field `35` 的正式消息名与动态重建规则（v21 仅 `f2=2`，exp14 的 9 条字符串未保留）；
- root field `7` 图层名/块坐标/偏移的编辑器语义（需编辑器新建/重命名图层实验验证）；
- root fields `11/14/15/25/29/36/38` 的正式消息名和编辑器语义（2026-08-07 静态形态已记录，未做增量实验）；
- type 27/28 引用 ID 的命名空间、definition/instance 分配与跨保存重写算法；
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
