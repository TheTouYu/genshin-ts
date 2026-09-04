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

> **文档族导航（2026-09-04 拆分）**：本文件保留 GIL 整体框架（根字段 presence 基线、
> 字段树总览、第三方 schema、静态字段树全景、未知范围与增量闭合方法）；领域细节已按域拆分至：
>
> | 文档 | 内容 |
> | --- | --- |
> | `gil-static-scene-semantics.md` | 静态资源与场景实体容器、记录级 patch 管线、装饰物（aux）patch |
> | `gil-nodegraph-semantics.md` | NodeGraph 路径、自由新建/修改（含技能配置创建、图 ID 分配）、连接 index、CompositeDef 信号注册表、节点图挂载 |
> | `gil-editor-assets-semantics.md` | 屏幕控件组、关卡变量、变量全类型、自定义镜头、全局计时器 |
> | `unit-status.md` | 单位状态资产专题（骨架/生命周期/通用配置/效果列表/参数条目） |

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
