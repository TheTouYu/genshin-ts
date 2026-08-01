# 信号

> 状态：已验证（发送固定值、监听骨架和信号定义原位修改）；参数消费和端到端行为待验证
> 来源：真实 GIL 相邻快照 + 当前代码实现 + 手工同构 GIA/GIL 回读 + 用户编辑器导入/地图检查
> 最近校验：2026-08-01
> 适用范围：服务器节点图中引用当前关卡既有注册定义的普通发送与监听节点；客户端、列表、监听参数消费和跨地图注册另行验证

信号用于在节点图之间传递一次事件及其参数。信号必须先在关卡中注册，发送或监听节点再引用该注册定义。只包含信号节点的 GIA 不等于携带信号注册定义；导入目标必须已经存在名称、参数结构和 identity 相符的注册信号。

## 注册定义与节点身份

每个已注册信号包含发送、监听和发送到服务器三类 identity：

```text
signal name
sendId
monitorId
serverId
按定义顺序排列的参数名称、类型和 pinIndex
```

这些 ID 和 pinIndex 必须从当前 GIL 的注册定义读取，不能由相邻 ID、参数序号或历史样本推算。当前项目规范读取入口是 `src/cli/gil_signals.ts` 的 `readRegisteredSignalsFromGil()`；旧 accessory 扫描器返回 0 不能证明地图没有注册信号。

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

自动同构重放使用 `.agents/skills/editor-incremental-gia-investigator/scripts/replay-listener-signal.ts`：从真实 donor 提取 NodeGraph，生成正式 GIA 和临时 GIL，通过 injector 写入临时副本后严格回读目标 NodeGraph；不调用待验证的 production signal lowering。

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
- 监听节点 9 种普通参数的输出序号、类型、`compositePinIndex`；
- 监听输出的数据消费连接和多参数共存；
- 监听信号实际触发及参数值的游戏行为；
- 客户端信号节点；
- 携带信号注册三元组、可跨地图独立导入的 GIA；
- 全参数端到端游戏行为。

参数类型总表见[参数类型](parameter-types.md)，直接值与数据连接见[数据流与连接](data-flow.md)，正式 GIA/GIL 资产边界见[资产、关卡保存与导出文件](assets-and-files.md)，证据分层见[验证与规则学习流程](validation-workflow.md)。
