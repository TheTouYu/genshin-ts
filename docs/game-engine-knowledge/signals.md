# 信号

> 状态：已验证（发送固定值、监听骨架、部分参数消费、信号定义修改和跨地图导入/注入）；全参数消费待验证
> 来源：真实 GIL 相邻快照 + 批次 Validator + 当前代码实现 + 手工同构 GIA/GIL 回读 + 用户编辑器/游戏验证
> 最近校验：2026-08-02
> 适用范围：服务器节点图普通发送与监听；当前跨地图结论覆盖 `cube_turn(face:str,direction:str)` 候选和地图 `1073741848/1849`
>
> 本轮具体候选、SHA-256 和用户测试记录见 [`signals/2026-08-01-monitor-consumption-batch.md`](signals/2026-08-01-monitor-consumption-batch.md)。

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
signalVersion = 1
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
signalVersion = 1
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
`connect2` 经验规则：= 源 `OutParam` index；唯一例外：str 源(6)→3、entity 源(9)→4
（均经 genericId=18 获取局部变量节点，多实例复现），例外语义未解释，保持
`INSUFFICIENT`，实现按经验规则写值。获取局部变量 concreteId 变体：str=2656 /
entity=2657 / guid=2658 / int=20 / bool=18 / config=2668 / prefab=2669。
新 monitor 布局仍必须从当前 CompositeDef/注册定义解析，不能只写死 `3 + 参数序号`。

连接批次还验证了 `Query GUID By Entity`（`genericId=concreteId=76`）的 Entity 输入与 GUID 输出，以及 GUID `Assembly List` 两元素样本（`genericId=169`、`concreteId=172`）的 count、两个 GUID 输入和列表输出结构。该证据只覆盖当前节点族与两元素 GUID 列表，不推广到任意列表类型或长度。

批次 Validator 同时保留一个协议边界：解码结果中 `OutParam.index` 字段缺失不等于显式
`index=0`。固定 entity 输出改接和最后两处连线实验中涉及缺失 index 的默认语义仍为
`CONFLICT/INSUFFICIENT`；实现和重放必须保留 protobuf presence，不能静默补零。裁决入口：

```text
/home/h/genshin-ts-evidence/node-graph-logic/signals/2026-08-01-monitor-signal/
  batches/connection-lifecycle-batch-01/validation.json
```

真实相邻快照证明了上述节点与连接结构；三份消费候选的具体实验事实和用户验证状态见[监听参数消费批次记录](signals/2026-08-01-monitor-consumption-batch.md)。该游戏结论仅适用于该记录中的具体候选、当前地图、节点图和信号定义。

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

## 尚未闭合

- `entity` 发送参数的数据源连接；
- 9 种列表发送参数及各自 List/Assembly 节点；
- 发送节点的控制流输入、输出以及多发送节点复用；
- 监听普通参数 `connect2` 例外（str→3、entity→4）的语义；`compositePinIndex` 与实例输出 index 的映射；
- 缺失 `OutParam.index` 的 protobuf presence、默认值及固定输出语义；
- 9 种普通参数消费均已真实差分闭合，8 个 consume 候选同构重放通过，`consume-str` 已由用户确认编辑器导入成功（新图 `1073741847`）；其余 7 个候选未逐个导入核验；
- 监听信号实际触发及参数值的游戏行为；
- 客户端信号节点；
- 除当前 `cube_turn` 两个 `str` 参数样本外，其他重复类型数量和参数组合的跨地图注册；
- 全参数端到端游戏行为。

参数类型总表见[参数类型](parameter-types.md)，直接值与数据连接见[数据流与连接](data-flow.md)，正式 GIA/GIL 资产边界见[资产、关卡保存与导出文件](assets-and-files.md)，证据分层见[验证与规则学习流程](validation-workflow.md)。
