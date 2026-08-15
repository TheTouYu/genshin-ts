# 信号

> 状态：已验证（发送固定值、监听骨架、部分参数消费、信号定义修改和跨地图导入/注入）；全参数消费待验证
> 来源：真实 GIL 相邻快照 + 批次 Validator + 当前代码实现 + 手工同构 GIA/GIL 回读 + 用户编辑器/游戏验证
> 最近校验：2026-08-05
> 适用范围：服务器节点图普通发送与监听；当前跨地图结论覆盖 `cube_turn(face:str,direction:str)` 候选和地图 `1073741848/1849`
>
> 本轮具体候选、SHA-256 和用户测试记录见 [`signals/2026-08-01-monitor-consumption-batch.md`](signals/2026-08-01-monitor-consumption-batch.md)。
>
> 用生产 `irToGia` 从地图注册数据生成正式 GIA 资产的链路、可复现性边界（vendor 坐标抖动）和坑位清单见 [`gia-generation-chain.md`](gia-generation-chain.md)。

> 知识树：已验证结论已录入 `knowledge/game-engine-knowledge/signal-production-encoding.md`（发送骨架/8 种固定值参数、原位修改、impl 图内信号，2026-08-08，bnd_7320a9bd）

信号用于在节点图之间传递一次事件及其参数。编辑器导入可由正式 GIA 携带 send/monitor/server 三份 signal definition，在目标地图注册此前不存在的信号；用户已确认同一 `cube_turn` GIA 在另一关卡导入正常。直接写 GIL 的生产流程仍将“注册信号”和“注入 NodeGraph”分成两步：`assets:signals register/update` 修改注册表，injector 按信号名把 GIA 中的 donor identity 重绑定为目标地图 identity，并保持目标注册定义不变。

2026-08-02 对用户修复版 `主图-发送-接受.gia` 与来源地图 `1073741849.gil` 做 raw-wire 比较，三份 `CompositeDef` payload 逐字节相同。当前 GIA 生产读取器从 GIL registry entry 读取参数名、三套参数 pinIndex 和 `signalVersion`，从三份 definition 读取信号名 pinIndex，并在最终 GIA 中保留原始 definition bytes，避免 schema 未声明的 field `106` 在 decode/encode 后丢失。自动回归为 `tests/composite/test-signal-registered-layout.ts`。

## 注册定义与节点身份

每个已注册信号包含发送、监听和发送到服务器三类 identity：

```text
signal name
sendId
monitorId
serverId
按定义顺序排列的参数名称、类型和 pinIndex
```

这些 ID 和 pinIndex 必须从当前 GIL 的注册定义读取，不能由相邻 ID、参数序号或历史样本推算。当前项目规范读取入口是 `src/cli/gil_signals.ts` 的 `readRegisteredSignalsFromGil()`；它返回三套参数 pinIndex、server definition VarType、signalVersion、send/monitor 信号名 pinIndex和三份原始 definition bytes。旧 accessory 扫描器返回 0 不能证明地图没有注册信号。

## 已验证的发送节点骨架

真实基线来自地图 `1073741849.gil`、节点图 `1073741841`「信号调试-发送信号」。未绑定的普通发送节点使用 `SysCall 300000`；绑定信号时，编辑器会重建节点，`nodeIndex` 可以变化。

绑定后的服务器发送节点满足：

```text
genericId = concreteId = 当前注册信号的 sendId
kind = SysGraph
signalVersion = 注册表条目 f6（样本信号恰为 1；见下方 signalVersion 一致性章节）
信号名 pin 必须存在
未赋值参数不生成实例 pin
```

信号名 pin 使用 `ClientExecNode / ClientSignal`。它和参数实例 pin 的 `compositePinIndex` 都来自当前注册定义，不能使用固定常量。

## 已验证的发送固定值参数

测试信号「信号测试全参数」按定义顺序包含 9 种普通参数。相邻快照验证了其中 8 种可固定填写参数；`entity` 的数据连接仍待验证。

固定值参数实例共享以下结构：

```text
i1.kind = InParam
index = 注册定义中的 0-based 参数序号（中间参数未实例化时也不压缩）
alreadySetVal = true
VarType / VarBase oneof = 参数类型对应编码
compositePinIndex = 当前注册定义为该参数分配的 pinIndex
```

| 参数类型 | VarType | VarBase / value | 本轮真实值 | 状态 |
| --- | ---: | --- | --- | --- |
| `int` | 3 | `IntBase / bInt` | `123456` | 已验证 |
| `float` | 5 | `FloatBase / bFloat` | `1.25` | 已验证 |
| `vec3` | 12 | `VectorBase / bVector` | `(1,2,3)` | 已验证 |
| `str` | 6 | `StringBase / bString` | `信号测试` | 已验证 |
| `bool` | 4 | `EnumBase / bEnum` | `true → 1` | 已验证 |
| `guid` | 2 | `IdBase / bId` | `123` | 已验证 |
| `prefab_id` | 21 | `IdBase / bId` | `232323` | 已验证 |
| `config_id` | 20 | `IdBase / bId` | `23232332` | 已验证 |
| `entity` | 1 | `IdBase` 或数据连接 | 未填写 | 待验证 |

本轮样本中的具体 `compositePinIndex` 只适用于该注册定义，不推广为全局编号。

## 已验证的监听节点骨架

监听实验位于同一地图的节点图 `1073741842`「信号调试-监听信号」。相邻真实 GIL 依次保存了未绑定节点、绑定「信号测试全参数」以及切换到「信号_1_测试」。

未绑定普通监听节点使用：

```text
genericId = SysCall 300001
无实例 pin
```

绑定后编辑器会删除未绑定节点并以新 `nodeIndex` 创建监听节点：

```text
genericId = concreteId = 当前注册信号的 monitorId
kind = SysGraph
signalVersion = 注册表条目 f6（样本信号恰为 1；见下方 signalVersion 一致性章节）
节点坐标保持
只有信号名 pin 会自动实例化；参数输出不会仅因绑定而自动写入节点
```

监听信号名 pin 使用：

```text
i1.kind = ClientExecNode
clientExecNode.kind = ClientSignal
clientExecNode.index = 1
value = StringBase / bString（注册信号名）
compositePinIndex = 当前 monitor 注册定义中的信号名 pinIndex
```

切换已注册信号时，编辑器会再次重建监听节点，并同时更新 `monitorId`、信号名和信号名 `compositePinIndex`。`signalVersion` 保持为 1。不同注册定义可能分配不同 pinIndex，因此信号名 pinIndex 也不是监听节点的全局常量。

## 监听定义布局与切换边界

当前地图中「信号_1_测试」与「信号_2_测试」具有同构 monitor 定义：执行输出、三个固定输出和三个参数输出的定义 pinIndex 布局一致。真实「信号_1_测试」监听节点与该定义中的空位共同闭合了信号名 pinIndex；在此同构范围内，手工候选只替换：

```text
signalName
genericId / concreteId = 目标 monitorId
信号名 compositePinIndex
```

`signalVersion`、节点位置和其余结构保持不变。该结论不允许推广到布局不同的信号；新布局必须重新从注册定义和真实同构样本闭合。

## 已验证的监听参数消费

当前地图、当前 monitor 定义和节点图 `1073741842` 的真实相邻快照已经连续验证全部 9 种普通参数（「信号测试全参数」）：

| 参数 | 定义序号 | 监听输出 | 目标输入类型 | 状态 |
| --- | ---: | --- | --- | ---: |
| `伤害值 int` | 0 | `OutParam[3]` | `Integer / VarType=3` | CONFIRMED |
| `移动速度 float` | 1 | `OutParam[4]` | `Float / VarType=5` | CONFIRMED |
| `目标位置 vec3` | 2 | `OutParam[5]` | `Vector / VarType=12` | CONFIRMED |
| `文本 str` | 3 | `OutParam[6]` | `String / VarType=6` | CONFIRMED |
| `是否暴击 bool` | 4 | `OutParam[7]` | `Boolean / VarType=4 (EnumBase)` | CONFIRMED |
| `目标GUID guid` | 5 | `OutParam[8]` | `GUID / VarType=2 (IdBase)` | CONFIRMED |
| `目标实体 entity` | 6 | `OutParam[9]` | `Entity / VarType=1（无 base 类，仅 itemType）` | CONFIRMED |
| `预制体 prefab_id` | 7 | `OutParam[10]` | `Prefab / VarType=21 (IdBase)` | CONFIRMED |
| `配置ID config_id` | 8 | `OutParam[11]` | `Configuration / VarType=20 (IdBase)` | CONFIRMED |

全部 9 个消费节点和连接可同时存在：`connect.id` 指向监听节点，`connect` 指向源
`OutParam`，监听 GraphNode 本身不变化；输出序号 `3..11` 按注册定义顺序连续且不压缩。
`connect2` 经验规则：= 源 `OutParam` index；唯一例外：str 源(6)→3、entity 源(9)→4。
两例外均已跨家族确认，与消费节点家族无关：entity（18 族 2657 与 180 族 183 均
connect2=4，实验 `entity-dtc-connect2-discriminator-01`）；str（18 族 2656 两样本 +
打印字符串 SysCall 1 两样本，实验 `str-cross-family-print-string-01` 与
`print-string-fork-01`）。例外值 3/4 的底层
语义未解释，保持 `INSUFFICIENT`，实现按经验规则写值。注册定义三套参数 pinIndex
（send/monitor/server）与例外值 3/4 无关联
（str 源三套 pinIndex=12/34/40、entity=69/77/84，其余参数亦不匹配），compositePinIndex、
参数定义序号等候选解释均被排除。获取局部变量 concreteId 变体：str=2656 /
entity=2657 / guid=2658 / int=20 / bool=18 / config=2668 / prefab=2669。
该变体机制 2026-08-06 已闭环：**concreteId = data.json `Variants` 表中选中变体的 KernelID**
（未配置变体时 concreteId 不落盘），见 node-graphs.md。

**生产红灯（A/B/C 三项）已修复（2026-08-02，自动测试转绿）**：production lowering 已实现
connect2 例外（str→3 / entity→4）且 exec 连接与 OutFlow i1/i2 不再写显式 `index:0`。
两个 focused regression 已转绿：`test-signal-monitor-consume-entity-connect2-red.ts`
与 `test-signal-monitor-exec-conn-index-red.ts`。修复统一在 encode 后通过
`applyEditorConnectionWireRules`（`ordinary_graph_materializer.ts`）改写已编码
GraphNode（root 图与 composite vendor/legacy 路径），不手改 thirdparty vendor。差异总表、
wire 形态、修复范围、约束与验证方式见
[`signal-production-red-lights.md`](signal-production-red-lights.md)（唯一入口）。
新 monitor 布局仍必须从当前 CompositeDef/注册定义解析，不能只写死 `3 + 参数序号`；
编辑器导入与游戏行为核验待用户执行。

连接批次还验证了 `Query GUID By Entity`（`genericId=concreteId=76`）的 Entity 输入与 GUID 输出，以及 GUID `Assembly List` 两元素样本（`genericId=169`、`concreteId=172`）的 count、两个 GUID 输入和列表输出结构。该证据只覆盖当前节点族与两元素 GUID 列表，不推广到任意列表类型或长度。

批次 Validator 同时保留一个协议边界：解码结果中 `OutParam.index` 字段缺失不等于显式
`index=0`。固定 entity 输出改接和最后两处连线实验中涉及缺失 index 的默认语义仍为
`CONFLICT/INSUFFICIENT`；实现和重放必须保留 protobuf presence，不能静默补零。裁决入口：

```text
/home/h/genshin-ts-evidence/node-graph-logic/signals/2026-08-01-monitor-signal/
  batches/connection-lifecycle-batch-01/validation.json
```

真实相邻快照证明了上述节点与连接结构；三份消费候选的具体实验事实和用户验证状态见[监听参数消费批次记录](signals/2026-08-01-monitor-consumption-batch.md)。该游戏结论仅适用于该记录中的具体候选、当前地图、节点图和信号定义。

## 已验证的监听执行输出连接

监听节点连接消费节点控制流（监听信号 → 打印字符串，实验 `print-string-control-flow-01`，
独立 Validator ACCEPT）时，编辑器在**监听节点**上实例化执行输出 pin：

```text
i1.kind = i2.kind = OutFlow(2)
compositePinIndex = monitor 定义中执行输出的 pinIndex（本定义=98；信号名=99）
connects = [{ id=目标节点, connect={kind:InFlow}, connect2={kind:InFlow} }]
connect/connect2 的 index 字段在 wire 上缺失（解码层 0 是 protobuf 默认值，presence 为缺）
目标节点无 InExec 实例 pin 落盘（pins 逐字节不变）
```

方向性与数据连接相反：数据连接挂在**目标 InParam**（connects.id=源节点）；控制流连接挂在
**源 OutFlow**（connects.id=目标节点）。proto 注释佐证：`NodePin.connects = 5; // OutFlow
or InParam`。控制流 fork 已验证（实验 `print-string-fork-01`）：同一 OutFlow pin 的
connects 数组 append 多条连接（id 7 与 id 8 共存），目标节点均无 InExec 落盘；fork 顺序
可由编辑器交换（实验 `print-string-fork-order-swap-01`，connects [7,8]→[8,7] 等长重排），
数组顺序即编辑器连线顺序，**不是按目标 id 排序**，无独立 fork 序号字段。链式串联同构
（实验 `print-string-chain-01`）：中间节点实例化自己的 OutFlow pin 挂 connects
（id=下一目标）；SysCall 普通节点的 OutFlow pin **无 compositePinIndex**（仅 SysGraph
复合调用节点如监听节点带 CPI=98）；OutFlow pin 实例化时插入 pins 数组位置 0，原
InParam 后移逐字节保持。本样本仅覆盖监听→打印字符串一对节点、当前 monitor 定义和当前地图；
普通 SysCall 分支的控制流 wire 见下节及[控制流](control-flow.md)，复合调用仍需按自身定义布局验证。

### 分支节点多输出槽（2026-08-02 闭合）

双分支节点（SysCall 2）的三轮实验（`branch-node-01/02/03`，独立 Validator 分别
ACCEPT 4/4、6/6、7/7）：

- 新建未连线：仅 nodeIndex/genericId/concreteId/坐标，**无任何实例 pin**（与打印字符串
  SysCall 1 同模式；SysCall 普通节点 pin 全部惰性实例化，区别于 SysGraph 绑定后自动
  实例化信号名 pin）。
- 作为 exec 连接目标（监听 OutFlow 连到双分支输入）：**目标节点逐字节不变**，无 InExec
  落盘、无 OutFlow 实例化；监听 OutFlow connects 从 [8,7] 追加为 [8,7,20]，顺序即执行
  顺序（用户声明 1->2->3 与 wire 一致），全部 `{InFlow,InFlow}` 无 index（raw wire 3 处
  `12 02 08 01` 形态、显式 index=0 零出现）。
- 连出“是”槽到打印字符串：只实例化**被连槽位的 1 个 OutFlow pin**；该槽在定义中是
  ShellIndex 0，因此 i1/i2 = `{kind:OutFlow}` 2B 形态无 index、无 compositePinIndex
  （SysCall 家族），connects `{id:21,{InFlow,InFlow}}` 无 index。“否”槽未独立采样；旧推测
  “所有槽位都不落 index”不再成立。

结论：多槽节点只实例化被连槽位。真实普通图后续实验
`control-flow-case1-node11-to-node24-v11-v12` 又验证了多分支 SysCall 3 的 Case1：
OutFlow[1] 的 i1/i2 显式 `index=1`，而目标默认 InFlow 引用仍无 index。当前规则应表述为
“默认 OutFlow[0] 省略 index，已观察到的非默认 OutFlow[1] 保留显式 index”，详见
[控制流](control-flow.md)。生产比对差异 C 对默认 OutFlow[0] 仍成立。str 例外 connect2=3
在 print4（node 21）获得第 6 样本，与 node 9 逐字节同构。

## 信号定义原位修改

当前实现提供 `gsts assets:signals update`，复用创建信号的参数模板和三份定义构建逻辑，在原注册项位置替换目标信号的名称与参数定义，并保留原 `sendId`、`monitorId`、`serverId`。目标信号不存在、名称冲突、类型模板缺失或结构回读不一致时停止，不写回地图。

本轮真实地图写回证据：

```text
map: /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741849.gil
signal: 信号测试全参数
parameters: 伤害值:int / 移动速度:float / 目标位置:vec3 / 文本:str / 是否暴击:bool / 目标GUID:guid / 目标实体:entity / 预制体:prefab_id / 配置ID:config_id
IDs preserved: send=1610612753 monitor=1610612754 server=1610612755
backup: .../.gsts/backups/1073741849.gil.2026-08-01T12-08-19-329Z.bak
before SHA-256: 6f427a70cd1f5772cf4ee4096694b2835d6946e50ce4fce10931bc691d2b4034
after SHA-256: 2c3e887fc503c27d0cd2b9a7a197fb6f0b0ac3b4613b4a1492769d521bdcf073
```

该证据证明候选严格回读和真实文件写回成功；尚未证明编辑器重新导入或游戏内行为正确。

## 旧版残缺注册修复

2026-08-02 在地图 `1073741849` 的只读快照确认：`cube_turn` registry entry 与完整 donor 逐字节相同，仍包含 `1610612741/42/43`、两个 `str` 参数、三套参数 pinIndex 和 `signalVersion=2`；但这三个 ID 指向的 send/monitor/server definitions 都缺失 signal-name definition entry 和 field `106` name CPI。普通 `inspect`/compiler 因此继续 fail closed，不把该结构视为合法旧布局。调查期间真实地图从 SHA-256 `a42339d0...` 变为 `e4196f8f...`，两份快照中的三份残缺 definition bytes 相同，但其他字段有外部变化；旧候选随即作废，并从最新只读快照生成 SHA-256 `40ae14c8...` 的候选。该案例再次证明候选只能绑定锁定源 hash，不能覆盖期间更新的地图。

当前 CLI 提供受控迁移入口：

```bash
gsts assets:signals repair \
  --gil <target.gil> \
  --target-signal cube_turn \
  --template-gil <verified-donor.gil> \
  --template-signal cube_turn \
  --param face:str \
  --param direction:str \
  --output <candidate.gil>
```

repair 只通过目标 registry entry 定位 identity，不要求目标 definitions 先通过严格 extractor；要求目标 entry、三份 definition、donor entry 和 donor 三份完整 definition 均可唯一定位，名称与参数 schema 完全一致。它从 donor 克隆完整 definitions 并重绑定为目标 IDs，保持目标 registry entry 和所有非目标 wire fields 原样；identity 冲突、schema/name 不一致或定义不唯一时停止。CLI 复用源 SHA 竞态检查、自动备份、候选及写后严格回读；`--output` 可先生成不覆盖候选。自动回归为 `tests/signal_registration_legacy_repair.ts`，真实快照候选差异审计仅证明结构修复，不等于真实地图写回、编辑器或游戏验证。

旧源码调查表明，`29dbe76` 的 signal builder 生成 minimal definition shell，旧 injector 又会合并同 ID incoming definitions；`55437d4` 同时改为复用 raw definitions 并禁止 signal accessories 覆盖 GIL definitions。结合当前目标 raw 结构，根因归类为旧生成与旧注入共同留下残缺 definitions，而不是新版读取器误拒绝合法布局。由于未保留当时实际注入的旧 GIA，该因果链属于源码与现存 raw 结构证据，不冒充历史 artifact 逐字节证明。

## 跨地图注册与直接 GIL 注入

真实验证候选：

```text
GIA: Beyond_Local_Export/gsts-signal-cube-turn-layout-fixed-v1.gia
GIA SHA-256: b926a1a83222bc2cf7ce02493332dc4da99602a5b3e775115f5012c2e6481508
source map: 1073741849
target map: 1073741848
target first graph: 1073741825
```

用户先确认该 GIA 在来源关卡正常，又确认同一文件可在另一关卡由编辑器导入并注册新信号。随后生产 CLI 从 donor GIL 的 `cube_turn` 复用两套独立 `str` 参数布局，在目标地图注册：

```text
cube_turn(face:str, direction:str)
sendId=1610612747
monitorId=1610612748
serverId=1610612749
face pin triplet=12/34/40
direction pin triplet=16/35/41
```

`assets:signals register --template-gil <donor>` 支持同类型参数重复，但每次出现都必须消费 donor 中一套真实且不同的参数布局；donor 套数不足时 fail closed，不推算 pin。跨地图 injector 从 GIA signal accessories 识别源 send/monitor/server kind，按信号名重绑定目标 identity，并继续校验发送参数数量和类型。目标 `1073741825` 在本次 GIL 中有 folder `typeValue=7000` 占位但没有 NodeGraph blob；injector 只在 `targetId=1073741825 + typeValue=7000 + incoming server BasicNode(type=20000)` 同时满足时补入首图，其他缺失图仍拒绝。

真实 GIL 写回后 SHA-256 为 `4fcf353be76551fa94936f5ef9026aa6ff094b976d8ea245d2d2d1d1887119cc`；严格回读得到一个 `1073741825` 图、5 个节点和目标 identity。用户确认游戏测试通过。该结果证明本候选的跨地图注册、identity 重绑定、首图创建和游戏行为，不推广为任意信号 schema、任意缺失 graph ID 或客户端图。

## GIA/GIL 重放与编辑器验证

监听证据根目录：

```text
/home/h/genshin-ts-evidence/node-graph-logic/signals/2026-08-01-monitor-signal/
```

当前实验的续作锚点是 `notes/manifest.md`，记录锁定目标、当前前快照、正负证据、用户验证状态和下一工作包；新会话先读该文件，不从聊天记录或目录时间推断进度。

真实相邻快照：

| 快照 | SHA-256 | 含义 |
| --- | --- | --- |
| `raw/monitor-signal-v0-unbound.gil` | `307674bb81c50556b4eb5b664e291b185a786aed3fde11fb1020b660a0a24b0c` | 未绑定监听节点 |
| `raw/monitor-signal-v1-bound-all-fixed-params.gil` | `570987915274339a905348c63747c7825d067ddb5e2dee761c8da6bfa311c842` | 绑定「信号测试全参数」 |
| `raw/monitor-signal-v2-switched-signal.gil` | `4f65cc549387557de55e9e3faf95feb565e8c40056b64de9f7fdf15436d57cf4` | 切换到「信号_1_测试」 |

自动同构重放使用 `.agents/skills/editor-incremental-gia-investigator/scripts/replay-listener-signal.ts`：从真实 donor 提取 NodeGraph，生成正式 GIA 和临时 GIL，通过 injector 写入临时副本后严格回读目标 NodeGraph；不调用待验证的 production signal lowering。脚本支持 consume-int/float/vec3（genericId=180 donor）与 consume-str/bool/guid/entity/prefab/config（genericId=18 donor，按 concreteId 精确筛选，connect2 含 str→3 / entity→4 经验例外）；consume-vec3 需图中存在 180+type=12 donor。具体批次事实、候选路径、哈希和用户验证见[监听参数消费批次记录](signals/2026-08-01-monitor-consumption-batch.md)。注册定义的 `parameterDefinitionPinIndex` 不直接当作监听实例 `OutParam` index。

8 个 consume 候选（`replay/consume-{int,float,str,bool,guid,entity,prefab,config}-replay-v1.gia`）全部严格回读一致；`consume-str-replay-v1.gia`（SHA-256 `ea369ae2e3a1e592828126986eff43c50b2658a27127225d3928d509eed849af`）已由用户确认编辑器导入成功（“测试完美通过”）。导入语义证据：同名图 GIA 导入时编辑器**不合并**，自动改名（追加 `_1`）并创建新图（id `1073741847`，16 节点），原图 `1073741842` 不变；落盘结构与重放候选逐节点一致（含 connect2=3 例外），仅图名差异。

消费规则 focused regression（工作包步骤 9）：`tests/signal_consumption_replay_regression.ts`
直接运行 `replay-listener-signal.ts`，夹具为真实地图裁剪副本
`tests/fixtures/signals/monitor-consume-donor.gil`（SHA-256
`ae28ffcdd20fb6f4e2872e95a6616d1945c10c83d99e73650f40c07a0a4423f0`，仅保留图
`1073741842` 与全部注册定义/索引，夹具哈希被测试断言锁定）。8/8 消费模式 PASS +
fail-closed（未知图拒绝）PASS。生产红灯（connect2 例外与 exec index）已修复，
自动测试转绿，见
[`signal-production-red-lights.md`](signal-production-red-lights.md)。

编辑器可导入候选：

| 候选 | SHA-256 | 自动结果 | 用户验证 |
| --- | --- | --- | --- |
| `replay/monitor-signal-importable-signal-1-test-v3.gia` | `c49d4058ada1996c69eea481a0a22564f7d8d862229030b2d9ba8c2266691eb4` | 正式包装与严格回读通过 | 编辑器可检测并导入 |
| `replay/monitor-signal-importable-signal-2-test-v4.gia` | `f8c0c6d46370f7fafb00b8ce05744ea8ea900fba30bf8a1938219e35dd38774d` | 切换为「信号_2_测试」，正式包装与严格回读通过 | 导入后监听切换检查通过 |

同一规则还通过真实地图写回验证：候选将监听节点恢复为「信号测试全参数」，回读结构正确，用户在编辑器中确认节点确实改回。该结果证明当前地图/图上的写回与显示，不等于信号触发后的游戏行为验证。

早期 v1/v2 手工 GIA 使用了仅供 injector 单元测试解析的最小包装：header `fileType`、Root identity、`filePath` 和 `gameVersion` 不符合正式导入文件要求，编辑器无法检测。这些文件保留为负证据，不能引用为成功导入样本。正式 GIA 必须使用项目正式包装规则；“injector 可解析”不推出“编辑器可检测”。

## 与当前项目实现的边界

- `readRegisteredSignalsFromGil()` 描述当前项目如何读取 GIL 注册信号，不单独证明游戏行为。
- `patchSignalNodeIds()` 是 production 注入阶段的占位 ID 修补，不是本轮监听切换规则的证明来源。
- 手工重放脚本只用于已由真实地图闭合的调查规则；生产 lowering 需另走 focused red/green regression。
- 自动结构回读、真实地图写回、编辑器导入和游戏行为分别记录。

## 复合 impl 图内信号节点（2026-08-03 测试断言对齐，无生产代码变更）

自动回归 `tests/composite/test-stage3-p5w10-signal-param-matrix.ts`、`...-two-signal-param-matrix.ts`
与 `...-special-arg-shared-adapter.ts` 对同一行为曾断言冲突，按真实证据裁决并修正测试：

- **impl 内发送节点保留全部参数物理 pin**：含 capture 路由的复合输入参数（entity 或列表）也保留
  类型化物理 InParam，`compositePins` 同时指向该物理 pin。证据：真实 GIL v14 的列表参数
  （ConfigurationList=22 / PrefabList=23 / VectorList=15，见 `test-stage3-signal-supported-list-var-types.ts`）；
  旧断言“capture 参数无物理 pin”被推翻。
- **监听节点不落盘参数 OutParam**：真实 fixture `tests/fixtures/signals/monitor-consume-donor.gil`
  的监听节点只有信号名 ClientExec pin；消费连接挂在目标 InParam 的 `connects` 上直接引用
  OutParam kind/index（含 connect2 例外）。
- **connect2 例外按键源 OutParam index**（6→3、9→4），与参数类型/定义序号无关；例外汇总见
  `signal-production-red-lights.md`。
- **impl 图 EntityNode.relatedIds 不含信号 SysGraph 节点**：`collectCalledCompositeIds()` 只收集
  `__composite_call__`，信号节点由独立 SignalDef accessory（which=14）覆盖（生成 GIA 已核实）。
- 端到端业务 GIA（复合内发送 + 主图监听消费，`test_mixed`）：
  `Beyond_Local_Export/gsts-signal-composite-demo.gia`，生成脚本
  `.agents/skills/editor-incremental-gia-investigator/scripts/generate-signal-composite-demo.ts`。
  全链路已闭环（2026-08-03）：编辑器导入通过 → 注入 `1073741850.gil` 图 `1073741826`（16 节点）成功 →
  回读验证节点身份/信号注册表不变 → 用户游戏内确认信号触发与监听消费正常。
  注入前置：目标图不存在时先 `gsts assets:node-graphs create` 建空图占位（见 `gia-generation-chain.md`）。

## 尚未闭合

- `entity` 发送参数的数据源连接；
- 9 种列表发送参数及各自 List/Assembly 节点；
- 发送节点的控制流输入、输出以及多发送节点复用；
- 监听普通参数 `connect2` 例外（str→3、entity→4）的底层语义；两例外均已跨家族确认（entity：18 族+180 族；str：18 族+SysCall 1 打印字符串）；例外值 3/4 无解释，按经验规则写值，生产红灯修复见 [`signal-production-red-lights.md`](signal-production-red-lights.md)；`compositePinIndex` 与实例输出 index 的映射；
- 缺失 `OutParam.index` 的 protobuf presence、默认值及固定输出语义；
- 9 种普通参数消费均已真实差分闭合，8 个 consume 候选同构重放通过，`consume-str` 已由用户确认编辑器导入成功（新图 `1073741847`）；其余 7 个候选未逐个导入核验（同一生成器 + 严格回读 + focused regression `tests/signal_consumption_replay_regression.ts` 保证结构一致，导入仅作可选确认）；
- 监听信号实际触发及参数值的游戏行为——**已闭合（2026-08-16，U1 差分实验 2699 日志）**：
  跨图投递成立——图 1830 `_GSTS_send`（whenTabIsSelected→sendSignal verify_ping2('ping-u1','tag-u1')）
  发送后，**图 1831 `_GSTS_recv` 与图 1828 `_GSTS_signal-family2`（同图内另一监听图）均收到**，
  参数值（ping-u1/tag-u1）完整传递（日志 rec27-38 等，5 次发送 10 组接收打印）；
  同图多实体挂载也成立——图 1832 `_GSTS_u2-multi-mount` 挂载两个实体
  （1077936151 + 1086324738）各自独立执行（u2-fire ×2，rec0/rec9）；
  证据 `~/genshin-ts-evidence/u1-u2-verify/`（日志 SHA ac82e67a…）。
- 客户端信号节点；
- 除当前 `cube_turn` 两个 `str` 参数样本外，其他重复类型数量和参数组合的跨地图注册；
- 全参数端到端游戏行为。

参数类型总表见[参数类型](parameter-types.md)，直接值与数据连接见[数据流与连接](data-flow.md)，正式 GIA/GIL 资产边界见[资产、关卡保存与导出文件](assets-and-files.md)，证据分层见[验证与规则学习流程](validation-workflow.md)。
# 候选：signals.md 追加段落（2026-08-11 eval-split 复盘建议；docs 不在本次落地范围内）

插入位置：signals.md 「注册流程」附近（line 287 之后）。

## 注册布局池（in-map 模式；2026-08-11 eval-split 实测）

`assets:signals register --template-signal <本图信号>` 与 `--template-gil <donor>` 同一套池规则：
布局池 = **单个模板**内同类型参数的真实布局集合（`gil_signal_registrations.ts buildParamPool(entries=[template])`），
同类型参数每出现一次必须消费一套真实且不同的布局；套数不足 fail-closed（实测报错
`parameter type "str" needs 2 distinct layouts, but the template GIL provides 1`）。
本图（1073741849）entity 参数全部共用 pin 三元组 69/77/84，即 entity 布局只有 1 套 →
单信号注册 4 个 entity 参数（face_turn c1..c4）不可行；相邻地图最多 3 套（1073741826 物理运动引擎实体）。
结论：需要多 entity 参数的信号必须先在编辑器注册同型 donor，或改用非 entity 参数方案。

## 残缺注册项阻塞 CLI 与绕过（2026-08-11 eval-split 发现）

`readRegisteredSignalsFromGil()` → `readSignalLayouts()` 对**任一**注册项缺 signal-name
pin layout（definition field 106）即整体抛错 → `assets:signals inspect/register/repair`
在本图全部不可用。1073741849 的 `cube2_test_turn`（1610612777/78/79，schema 与 cube_turn 相同）
即残缺项（与上文 cube_turn 旧布局 1610612741/42/43 同款）；`repair` 要求 donor 与 target 同名
且 donor 完整 → 本图无法修复。绕过：自写脚本直调 `registerSignalInGil()`（库函数无全表回读校验），
产出后回读自洽；宽容读注册表工具 = `tools/scan-gil-signal-registry.ts`（残缺项单条标记，
`--gate` 探活退出码 1）。跨地图已知残缺：1073741826 也有 3 个残缺项。

## 信号参数布局：编辑器「新建」vs「追加参数」两套路径（2026-08-15 灯阵差分实证）

**现象**：灯阵 `lamp_toggle`（vec3+int）试玩无法启动；用户手动在编辑器「给信号追加一个参数」
并保存后，CLI 编译报 schema mismatch（IR=[vec3] vs map=[vec3,int]）。

**差分定位**（证据 `~/genshin-ts-evidence/lights-out/signal-diff/raw/`：
`user-fixed-signal.gil` vs `cli-version-signal.gil` vs `map-after-repair.gil`）：
- 编辑器「新建信号」路径（真实样本：地图 1073741849「信号测试全参数」、1073741888 verify_ping）：
  参数段 f3 的 field2 = **类型值**（send/server：int=0/float=1/vec3=2/str=0/bool=4…；
  monitor：类型值+3）；pinIndex = 类型基准三元组（vec3=91/110/123、int=68/76/83）+ 同类重复偏移
  （send +4k(str)/+1k(其他)，monitor +k，server +k）。`BUILTIN_PARAM_LAYOUTS`（gil_signal_registrations.ts）
  与之字节一致 —— CLI builtin 布局 = 引擎可加载的规范布局。
- 编辑器「给已有信号追加参数」路径（用户手动保存后整表重写）：全部参数的 field2 改为
  **参数序号**（send：0,1…；monitor：3,4…），pinIndex 重排为小值（1/2/6）——与规范布局不符，
  信号引擎侧不可加载（启动后信号链路零执行）。**追加路径是破坏性操作**，不能作为修复手段。
- CLI v1 注册（builtin 引入前/后）在灯阵留下的 vec3 段也缺类型 field2（`08 03` 而非 `08 03 10 02`），
  属同一错误家族。

**CLI 修复（2026-08-15，gil_signal_registrations.ts）**：`repairSignalInGil` 原只重建三份
send/monitor/server 定义、**不重建注册表索引条目**（残留旧 pinIndex）→ 已修复为同步重建
（`buildIndexEntry` 用模板参数池），灯阵案例注册表 pinIndex 1/2/6 → 68/76/83，候选与
1849/1888 编辑器样本一致。legacy 场景（条目已是规范值）幂等不变。

**验证层级**：真实 GIL 字段树差分 + 编辑器新建样本（1849/1888）字节对照 + CLI 回读 = 已证实；
游戏侧"信号可启动"仍需用户核验（当前被实体 y=2000 超出场景范围启动报错阻塞，见
lights-out/PROGRESS.md）。`#4` 身份字段 field5（1/2/3）语义未闭合（观察值：1849=1、1888/CLI=2、
用户手动追加后=3），待解。

## signalVersion 一致性：注册表条目 f6 必须与三份 CompositeDef #4 field5 相同（2026-08-15 灯阵差分实证）

**规则**：引擎加载信号时校验版本一致性——注册表条目的 `signalVersion`（条目 f6，`readRegisteredSignalsFromGil`
返回的 signalVersion）必须与 send/monitor/server 三份 CompositeDef 身份字段 `#4` 内最后一个 `field5`
（版本字段）**完全相等**。不一致 → 引擎拒绝加载 → 地图启动失败。

**证据链**（`~/genshin-ts-evidence/lights-out/signal-diff/round2/`）：
- 编辑器创建未改：1849 多数信号 =1（条目 f6 与定义 field5 均为 1）
- 编辑器修改一次（verify_ping/face_turn、CLI builtin 复刻）：=2，两边一致，引擎正常加载
- 用户手动追加参数后：=3（两边一致，但参数布局是序号式，属另一类错误）
- **CLI `repair` 产出：条目 f6=3（保留目标）但定义 field5=2（复刻 builtin 模板）→ 不一致 → 启动失败**
- 用户重存信号（编辑器保存）：两边统一为 4 → 正常

**工程结论**：`register`（builtin 路径）自洽（f6=2、field5=2）；`update`（目标定义作模板）自洽；
**`repair` 必须把重建定义的 field5 改写为目标条目 signalVersion**（2026-08-15 已修复：
`rewriteDefinitionVersion`，`SignalIndexEntry.signalVersion` 从条目 f6 读取）。修复合规验证：
灯阵 repair 候选 field5=3（与 f6=3 一致）、legacy 场景 field5=2（幂等）。#4 内 field5 可能多次出现
（身份块内另有大数 field5），只改写最后一个 occurrence。

**游戏侧端到端验证（2026-08-15，灯阵 v3 单参数，日志 2707）**：CLI `update` 删除多余 int 字段、
单参数 [senderPos:vec3]（版本 4=4 一致）注入后，游戏正常启动、交互正常；日志逐节点核验：
senderPos 参数传递、距离计算（0/2.5/5.0）、阈值分支（0.1/3.0）、lit/head 变量、308 显隐、
状态保持全部与代码一致，1599 帧零异常（无空实体/NaN/负值）。至此"信号可启动"从待验证升级为
**游戏核验通过**。信号布局规范（builtin 类型值布局）+ 版本一致性 + CLI update/repair 修复
三环全部闭环。

## 信号版本下限：vec3（非 str）信号版本 2 被引擎拒绝（2026-08-15 最小图差分实证）

**规则补充**：在"注册表 f6 == 三份定义 #4 field5"一致的前提下，**版本值本身还有下限**——
最小图（lamp_toggle vec3,int + win_check/win_ack vec3，builtin 布局，版本 2=2）启动失败；
用户编辑器修复（版本 3=3，参数段改序号式）后正常；主图 v3（版本 4=4，类型值布局）正常。
结论：**版本 >=3 且两边一致即可加载，布局（类型值/序号式）与版本精确值（3/4）不敏感**；
builtin 模板此前复刻 verify_ping（str,str，版本 2）——str 版本 2 历史可加载（U1 实验），
但 vec3 版本 2 被拒（str 是否同样受限未验证，统一 >=3 规避）。

**工程结论（2026-08-15 已修复，commit 039a060）**：register（builtin 模板版本 2→3）、
update/repair（目标版本 <3 时提升到 3，`withSignalVersion` 同步条目 f6 与定义 field5）。
验证：三路径均输出 v3=3 一致；legacy 断言更新（仅 f6/field5 变化其余逐字节一致）。
