# GIL 节点图与图资产结构语义

> 状态：部分已验证
> 来源：真实 GIL 相邻快照 + 用户编辑器说明（各节自带证据标签与样本）
> 拆分自：`gil-structure-semantics.md`（2026-09-04 按域拆分，内容原样迁移未改写）

## NodeGraph 路径

`CONFIRMED`：当前 collector 在 `10.1.1[*]` 找到 13 个可由 `gia.NodeGraph` schema 解码的 blob，类型聚合均为 `20000`，共 301 个节点。该路径是当前 collector 加成功 schema 解码支持的操作性路径，不是 GIA `Root` 声明的路径。

目标图 `1073741842` 在锁定快照中包含：

```text
nodes: 6
pins: 107
connections: 6
```

`NodeGraph.nodes`、`GraphNode.pins` 和 `NodePin.connects` 的内层字段映射由 `gia.proto` 支持。

## 自由新建

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
        {1: 技能配置ID, 2: 技能类型(36=普通/瞬发技能, 6=自定义技能), 4[*]: 分节}
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

`f5.f2`（轨道点 ID）= 放置顺序：**1073741825 + 7×(顺序-1)**（用户确认与放置顺序相关；
瞬发技能时间太短，按顺序即可）。实测三绑：顺序1=1073741825、顺序2=1073741832、
顺序3=1073741839（步长 7）。`f5[*]` 允许同一图 ID 重复出现在多个顺序位。
**`f5[*]` 的 wire 顺序规则 INSUFFICIENT**（2026-08-29 复核）：双绑以内 wire 顺序 = 绑定顺序
（v4/v7 样本）；第三绑时编辑器重排（v8 wire=[440@1832, 433@1825, 433@1839]），重排规则未闭合；
CLI 多绑按传入顺序生成，语义按轨道点序列保证，>2 绑逐字节对齐需编辑器样本。

`f45.f2` 语义修正（2026-08-29 Round 3a~3e 五轮差分闭合）：**与绑定无关，是「模板 ×
释放类型」形态值**——36: 普通=61/瞬发=62；6: 普通=21/瞬发=2；28: 普通=51/瞬发=52。
绑定（无论 f5 还是事件轨道）不改 45.2；v3→v4 的 61→62 是「改瞬发」的结果而非「首绑」。
`f45.16`：普通形态 36=1/6=5/28=10，瞬发形态字段消失。

**绑定位置由释放类型决定，与模板无关（2026-08-29 Round 3d 跨模板确认）**：
瞬发 = body `4[1].30.1.5[*]` f5（36/6 同构，轨道点 1825+7n）；普通 = 事件轨道 `4[2].45.1`
追加打点+绑定。普通形态（三模板逐字节重放全部通过）：

```text
f3[*] = 动画打点（打点资源模板相关，每模板样本 1）：
       36+普通: {2:3001, 3:f32=1.0, 6:拍点ID, 8:f32=1.0}                 # 1 打点，无 f1/f9
        6+普通: {f1:序号, 2:1001/1004/1007, 3:f32=1.0, 6:拍点ID, 8:f32=1.0, 9:1}  # 3 打点，官方预制动画
       28+普通: {2:7001001, 3:f32=1.0, 6:拍点ID, 8:f32=1.0, 9:1}        # 1 打点，造物动画（手动添加）
       拍点ID = 268435457 + 7×(n-1)   # 0x10000001 起步长 7
f4[*] = 节点图绑定（每条，三模板同构）：
       {1:图ID, 3:触发点ID, 4:拍点ID}
       触发点ID = 1073741825 + 7×(m-1)  # 0x40000001 起（0.0s=1073741825）
       拍点ID   = 对应动画打点的 f6（0.0s=268435457）
       插入位置 = 45.1 最后一个默认条目(f2)之后、f9 之前；默认条目保留
```

技能↔图类型约束（用户确认）：自定义技能模板(f2=6) 只能挂角色技能图(20002)；
普通技能模板(f2=36) 挂角色操控技能图(20010)。6+普通 的动画资源是官方预制（时长
2.01/0.53/3.16s，整轨 5s）；36 的 3001 与 28 的 7001001 语义未闭合（各 1 样本）。

自定义造物技能模板（f2=28，2026-08-29 v10→v12）：瞬发释放，body 紧凑（`4[1]` 仅 26B，
`{1:73, 78:{1:{1:{1:20001},2:{1:10007001},3:{4:1,5:1}}}}`），事件轨道已简化（f45.f2=52）。
绑定节点图 = `4[1].78.1` 追加 `f4={1:图ID, 2:1073741825}`（挂造物技能图 20008，逐字节重放通过）。
释放类型（瞬发/普通）= `4[1].78.1.1.f2`：瞬发=缺省，普通=`f2:2`。
造物模型引用 = `4[1].78.1.2.1`（10005001=遗迹守卫，10007001=打手丘丘人；v13→v14 仅此一字节变）。
**该模型引用是造物技能特有**（用户澄清）：角色技能/普通技能的模型就是角色本身，无需模型引用；
造物技能给造物用，所以带造物模型选择。
**切换释放类型会自动丢弃节点图挂载 + 恢复模板默认形态**（引擎正常行为，三模板全证：
28: v12→v13、36: Round 3a、6: Round 3c——绑定/打点清除、默认事件轨道恢复、45.2 回默认值、
28 另重置模型 + root 20 回退）。**先定类型再绑图**。
**创建时联动生成 root 20（1970B）= 造物模型容器**：骨骼节点（GI_MonsterRoot/GI_RootNode/
GI_Chest/Hand/Foot/NamePlate/HeadMark/AimingPoint 等）+ 受击/被击倒特效引用；**仅 28+瞬发
body f4 绑定触发 root 20 增长（1970→2955B）**，28+普通（事件轨道绑定）不联动（Round 3e
实测保持 1970B）。root 20 造物模型装配属编辑器联动（CLI 是否复刻列为 open-item）。
**28+普通 绑定的编辑器流程特殊**（用户确认）：须先手动为造物添加动画（打点 f3.f2=所选动画
资源）再在动画位置挂图——CLI 不模拟该形态，仅 list 展示。

技能配置（2026-08-29 三模板全样本；用户澄清「普通/瞬发」是释放类型，与模板 f2 正交）：

```text
f2 = 技能模板种类：36=普通技能模板，6=自定义技能模板，28=自定义造物技能模板
     f2=36 → folder typeValue=7500（folderId=68），ID 段 0x49400001(1228931073)
     f2=6  → folder typeValue=2800（folderId=12），ID 段 0x41800001(1098907649)
     f2=28 → folder typeValue=6900（folderId=61），ID 段 0x47000001(1191182337)
释放类型（普通/瞬发）= 4[1].30.1.1.4：有 4:2=普通（有延时/动画），缺省=瞬发
默认事件轨道：普通技能模板=1 条（节点图事件轨道 f6=805306369）；
自定义技能模板=2 条（节点图事件轨道 + 状态轨道 f6=805306376）。
动画/时间线数据在 4[1].30.1.8（packed 502）：非瞬发技能带动画段
（含 GI_AvatarRoot 根骨骼 + 若干动画段，普通/自定义模板默认均 293B 同构）。
```


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

## 自由修改

对节点图 `1073741845` 做两次连续名称修改，最终将名称缩短为 `A`。受独立 Validator 接受的 raw-wire 路径为：

```text
GIL.payload.10.1[*].1.1.5 = 1073741845   # 稳定图 ID；正式字段名未知
GIL.payload.10.1[*].1.2                 # 显式 length-delimited UTF-8 名称
```

`CONFIRMED`：在当前限定样本中，名称从 `新建节点图` 改为 `新建节点图-又修改了名字`，再改为 `A` 时，identity 保持不变，只重写同一直接记录的显式 field `2`。最后一轮名称字段从 34 bytes 缩为 1 byte，整个直接记录从 59 bytes 缩为 26 bytes，差值均为 33。短名称 `A` 下 field `2` 仍显式存在，不是字段缺失或 protobuf 默认值。

`INSUFFICIENT`：正式字段名、其他节点图类型及跨版本普适性。多轮保存还使 root `46` 发生等长 raw-byte 变化；它与名称字节和 NodeGraph 节点增量不共形，只能确认“同步变化”，不得命名为时间戳、校验值、缓存或编辑器状态。

`CONFLICT`：早期 `rename-empty-node-graph-01` 的用户声明是修改名称，但 raw-wire 实际新增 identity `1073741847` 并同步改变 root `6`。该轮保留为冲突调查记录，不作为名称字段正证据。

上述“自由新建”和“自由修改”证据均由独立证据仓库提交 `d1b8fad91bf3f07c3846b0f6e28fb85d0089de39` 锁定。未执行 round-trip、临时重放、真实写回、编辑器导入或游戏行为验证。

## 连接 index presence

`CONFIRMED`：目标图 6 条连接中，`connect.index` 与 `connect2.index` 都分别有 3 个显式存在、3 个缺失。目标 NodeGraph 的 decode/encode 字节 round-trip 保持一致。

`CONFLICT`：把缺失 `NodePin.Index.index` 解释为显式 `0`。

`INSUFFICIENT`：缺失 index 是否具有编辑器或运行时的 `OutParam[0]` 语义。当前只能保留 `index_present=false`，不能补零。

## CompositeDef 与信号注册表

`CONFIRMED`：当前 reader 在 `10.2[*]` 使用 `gia.CompositeDef`，其 `id/inflows/outflows/inputs/outputs/type/name` 及 `ParameterFlow.name/index/type/pinIndex` 由 `gia.proto` 映射。

`CONFIRMED`：当前信号 reader 在 `10.5.3[*]` 读取注册索引条目，锁定快照中得到 10 个去重注册信号。条目包含 send、monitor、server identity、名称和参数条目。这里的读取属于当前源码加真实 raw-wire execution，不称为 round-trip。

`CONFIRMED`（2026-08-21 编辑器差分闭合，样本 `打印` 复合定义添加/删除）：删除一个复合定义 = 从 root 10 移除两条容器记录——`10.2[*]` 的 `CompositeDef` 记录（section 2）和 `10.4[*]` 的复合 impl 图记录（section 4，记录 id 与 def 相同或由 def `field4.sub4.field5` 指定）；若该 def 在自定义分类（root 10 field3）中有成员引用，需同步移出。root 46 的条目替换是编辑器保存副作用，不属删除语义，CLI 不模拟。已落地为 `gsts assets:node-graphs def-clean`（`src/cli/assets_node_graphs.ts` + `graph_edit.ts` 的 `deleteCompositeDef`）。

`CONFIRMED`（2026-08-21 编辑器差分闭合，样本 `view_orbit_trigger`→`view_orbit_trigger——2` + impl 新增 Print String）：修改一个复合定义 = 只改 `10.2[*]` 的 `CompositeDef` 记录（本次仅 `field200` name 变长）和 `10.4[*]` 的 impl 图记录（新增节点 n1、在 When Timer Is Triggered 的 OutFlow[0] 增加一条到 n1 的连线）；已有节点/连线保持不变，def ID 与 impl 图 ID 不变。root 46 仍是保存副作用。编译器侧已用 `forceFull` 支持把“未调用但需更新”的复合以完整 impl 输出（`src/runtime/core.ts`）。

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


