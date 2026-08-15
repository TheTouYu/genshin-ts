# 信号生产与编码

发送节点骨架与 8 种固定值参数、信号定义原位修改、复合 impl 图内信号节点

<!-- CLAIM:START clm_0FC97EF7B561C3DEEEAD6918A8 -->

### 已验证发送节点骨架与 8 种固定值参数编码

真实基线来自地图 1073741849.gil 节点图 1073741841「信号调试-发送信号」。未绑定普通发送节点用 SysCall 300000；绑定信号时编辑器重建节点（nodeIndex 可变化）。绑定后的服务器发送节点：genericId=concreteId=当前注册信号的 sendId、kind=SysGraph、signalVersion=1、信号名 pin 必须存在、未赋值参数不生成实例 pin；信号名 pin 用 ClientExecNode/ClientSignal，与参数实例 pin 的 compositePinIndex 都来自当前注册定义（不能使用固定常量）。8 种固定值参数（信号测试全参数按定义顺序，已验证）：固定值参数实例共享结构 i1.kind=InParam、index=注册定义 0-based 参数序号（中间参数未实例化时也不压缩）、alreadySetVal=true、VarType/VarBase oneof=参数类型对应编码、compositePinIndex=注册定义分配的 pinIndex。类型映射：int=3/IntBase、float=5/FloatBase、vec3=12/VectorBase、str=6/StringBase、bool=4/EnumBase(true→1)、guid=2/IdBase、prefab_id=21/IdBase、config_id=20/IdBase；entity=1 的数据连接仍待验证。

#### 适用边界

相邻快照验证 8 种可固定填写参数，entity 数据连接待验证；具体 compositePinIndex 只适用于该注册定义，不推广为全局编号；signalVersion、pinIndex 必须从当前 GIL 注册定义读取（src/cli/gil_signals.ts readRegisteredSignalsFromGil），不能由相邻 ID/参数序号/历史样本推算

<!-- CLAIM:END clm_0FC97EF7B561C3DEEEAD6918A8 -->

<!-- CLAIM:START clm_E84AC1061E900A2BFAB326D5C1 -->

### 信号定义原位修改（assets:signals update）：保留三 ID、原位置替换

当前实现提供 gsts assets:signals update，复用创建信号的参数模板和三份定义构建逻辑，在原注册项位置替换目标信号的名称与参数定义，并保留原 sendId、monitorId、serverId。目标信号不存在、名称冲突、类型模板缺失或结构回读不一致时停止，不写回地图。真实地图写回证据（2026-08-01）：map=1073741849.gil、signal=信号测试全参数、9 参数（伤害值:int/移动速度:float/目标位置:vec3/文本:str/是否暴击:bool/目标GUID:guid/目标实体:entity/预制体:prefab_id/配置ID:config_id）、IDs preserved send=1610612753 monitor=1610612754 server=1610612755；备份在 .gsts/backups/；before SHA-256 6f427a70...、after 2c3e887f...

#### 适用边界

证据证明候选严格回读和真实文件写回成功；尚未证明编辑器重新导入或游戏内行为正确；生产管线写回流程需要备份与源 SHA 竞态检查

<!-- CLAIM:END clm_E84AC1061E900A2BFAB326D5C1 -->

<!-- CLAIM:START clm_D4F75C7BF79D3B60EB8DF5EB3F -->

### 复合 impl 图内信号节点规则（2026-08-03 测试断言对齐，真实证据裁决）

复合 impl 图内信号节点（自动回归 test-stage3-p5w10-signal-param-matrix 等曾断言冲突，按真实证据裁决修正测试）：①impl 内发送节点保留全部参数物理 pin——含 capture 路由的复合输入参数（entity 或列表）也保留类型化物理 InParam，compositePins 同时指向该物理 pin（证据：真实 GIL v14 列表参数 ConfigurationList=22/PrefabList=23/VectorList=15；旧断言“capture 参数无物理 pin”被推翻）；②监听节点不落盘参数 OutParam——真实 fixture monitor-consume-donor.gil 的监听节点只有信号名 ClientExec pin，消费连接挂在目标 InParam 的 connects 上直接引用 OutParam kind/index（含 connect2 例外）；③connect2 例外按键源 OutParam index（6→3、9→4），与参数类型/定义序号无关；④impl 图 EntityNode.relatedIds 不含信号 SysGraph 节点——collectCalledCompositeIds() 只收集 __composite_call__，信号节点由独立 SignalDef accessory（which=14）覆盖（生成 GIA 已核实）。端到端业务 GIA（复合内发送+主图监听消费，test_mixed）：Beyond_Local_Export/gsts-signal-composite-demo.gia，全链路已闭环（2026-08-03）：编辑器导入通过→注入 1073741850.gil 图 1073741826（16 节点）成功→回读验证节点身份/信号注册表不变→用户游戏内确认信号触发与监听消费正常。注入前置：目标图不存在时先 gsts assets:node-graphs create 建空图占位。

#### 适用边界

自动回归断言曾与真实证据冲突，本轮按真实证据修正测试（生产代码零改动）；列表参数物理 pin 证据为真实 GIL v14；端到端 demo 覆盖复合内发送+主图监听消费单一样本；其他信号 schema 与客户端图不推广

<!-- CLAIM:END clm_D4F75C7BF79D3B60EB8DF5EB3F -->

<!-- CLAIM:START clm_1A48C87938D83D3736EA97AFA1 -->

### 跨图信号投递为广播语义；同图可挂多实体且各实例独立执行

2026-08-16 U1/U2 差分实验（2699 日志，SHA ac82e67a…）游戏核验闭合：①跨图信号投递成立——图 1830 _GSTS_send（whenTabIsSelected→sendSignal verify_ping2('ping-u1','tag-u1')）发送后，图 1831 _GSTS_recv 与图 1828 _GSTS_signal-family2（另一张监听图）均收到且参数值完整传递（广播语义：所有监听该信号的图都收到）；②同图多实体挂载成立——图 1832 _GSTS_u2-multi-mount 挂载两个实体（1077936151 与默认模版实例 1086324738）各自独立执行（whenEntityIsCreated 每实体触发，u2-fire ×2）。灯阵架构可用 1 图×9 挂载 + 跨图信号广播。

#### 适用边界

单地图（1073741888）单信号（verify_ping2 str×2）样本；entity/guid 等参数类型与级联发送未覆盖；证据为 2699 日志 + 图名索引，用户游戏核验通过。

<!-- CLAIM:END clm_1A48C87938D83D3736EA97AFA1 -->

<!-- CLAIM:START clm_6C4D0D6A2ADCB7DFB399357BB2 -->

### signalVersion 一致性：注册表条目 f6 必须与三份 CompositeDef #4 field5 相同（2026-08-15 灯阵差分实证）

引擎加载信号时校验版本一致性：注册表条目的 signalVersion（条目 f6，readRegisteredSignalsFromGil 返回）必须与 send/monitor/server 三份 CompositeDef 身份字段 #4 内最后一个 field5（版本字段）完全相等；不一致→引擎拒绝加载→地图启动失败。证据链（~/genshin-ts-evidence/lights-out/signal-diff/round2/）：编辑器创建未改=1（条目 f6 与定义 field5 均 1）；编辑器修改一次=2（两边一致，正常加载）；用户手动追加参数=3（两边一致但参数布局属另一类错误）；CLI repair 产出条目 f6=3（保留目标）但定义 field5=2（复刻 builtin 模板）→不一致→启动失败；用户重存信号后两边统一为 4→正常。工程结论：register（builtin 路径）自洽（f6=2、field5=2）；update（目标定义作模板）自洽；repair 必须把重建定义的 field5 改写为目标条目 signalVersion（rewriteDefinitionVersion 已实现，SignalIndexEntry.signalVersion 从条目 f6 读取）；#4 内 field5 可能多次出现（身份块内另有大数 field5），只改写最后一个 occurrence。

#### 适用边界

证据=真实 GIL 差分（编辑器创建/修改/用户追加/CLI repair/用户重存五态对比，round2 证据目录）+ 自动回归 tests/signal_consumption_replay_regression.ts:100（signalVersion preserved）+ 灯阵 v3 游戏核验（日志 2707，1599 帧零异常，2026-08-15）；适用于当前编辑器/CLI 版本，不证明其他版本；#4 身份字段 field5 语义未闭合（观察值 1/2/3），本 claim 只断言一致性约束而非语义

<!-- CLAIM:END clm_6C4D0D6A2ADCB7DFB399357BB2 -->
