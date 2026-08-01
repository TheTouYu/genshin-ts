# Signal send-node instance encoding (real editor GIL samples)

Send-node instance fields and compositePinIndex rules confirmed by user-driven incremental GIL samples v1-v6.

<!-- CLAIM:START clm_16D507DAD132C32BCF97EFFEB9 -->

### compositePinIndex of signal send-node pins reuses the signal-definition triplet pinIndex (f8), not node-local sequence

In real editor GIL output, every pin of a signal send node carries compositePinIndex copied from the signal-definition triplet container (GIL f10 inner f2): OutFlow=87, signal-name=88, parameters=68/12/70, InFlow=86 for signal 工具_新信号 (sendId 1610612768). These values are editor-preallocated and scattered (not contiguous, not node-local ordering); generated GIA must read them from the real definition triplet, because self-invented indices were a root cause of prior in-game failure.

#### 适用边界

Confirmed only for the send node of signal 工具_新信号 (triplet 1610612768/69/70) across incremental samples v1-v6 in map 1073741849.gil graph 1073741836. Listen (onSignal) and client sendSignalToServerNodeGraph node encoding is not yet sample-confirmed. One signal family must not be promoted to a universal editor rule.

<!-- CLAIM:END clm_16D507DAD132C32BCF97EFFEB9 -->

<!-- CLAIM:START clm_3E23026CFBD9CB597EAB32042C -->

### Signal send-node instance: same sendId for generic/concrete, signalVersion=1, pins encoded on demand in definition order

A send node uses genericId=concreteId={class:10001, type:20000, kind:22001(SysGraph), nodeId=sendId}; multiple send nodes reuse the same sendId and are distinguished by nodeIndex. signalVersion=1 (also GraphNode f9=1 in the graph-definition container). Pins are encoded on demand, in definition-order subsequence: InFlow/OutFlow only when connected (OutFlow compositePinIndex=87, connects target nodeIndex with kind=1 InFlow), parameter pins only when assigned (i1/i2 kind=3 InParam; i1.index=parameter ordinal 0 omitted/1/2; value IntBase/StringBase with alreadySetVal=true and itemType Server/Integer|String; type=VarType Integer=3/String=6), signal-name pin always (i1 kind=5 ClientExecNode without index, value StringBase(signal name), clientExecNode kind=6 index=1, compositePinIndex=88). List parameters carry no value: type=VarType(9 for BooleanList) and connects reference an Assembly List node (SysCall genericId=169 concreteId=175, 100 element InParam slots index 1..100 plus one OutParam, no compositePinIndex, no signalVersion); identical list values may share one Assembly List node between send nodes.

#### 适用边界

Confirmed only for send nodes of signal 工具_新信号 (triplet 1610612768/69/70) in graph 1073741836, incremental samples v1-v6 (bool list [false] in v5/v6; int and string parameters in v3/v4). Listen (onSignal) and client sendSignalToServerNodeGraph nodes, other list element types, and other signals are not yet sample-confirmed.

<!-- CLAIM:END clm_3E23026CFBD9CB597EAB32042C -->

<!-- CLAIM:START clm_9F3BC0989E06157B2B43343C86 -->

### Listen-node (onSignal) instance: monitorId from signal-registry f2, signalVersion from registry f6, signal-name pin only

监听节点（onSignal）实例 genericId=concreteId={class:10001,type:20000,kind:22001 SysGraph,nodeId=monitorId}，monitorId=信号注册表条目 f2（cube_turn=1610612742/0x60000006；对照发送节点用 f1=sendId，工具_新信号=1610612768/0x60000020）；signalVersion=注册表条目 f6（cube_turn=2、工具_新信号=1），是信号版本而非节点类型属性；未用参数时仅编码信号名 pin（i1=ClientExecNode 无 index、value=StringBase(信号名)、clientExecNode={ClientSignal,index:1}、compositePinIndex=定义容器 f8=44），OutFlow/参数 pin 按需编码

#### 适用边界

仅 cube_turn 监听节点最小实例（v7）与工具_新信号发送节点对照证实；客户端 sendSignalToServerNodeGraph 无样本；信号名 cpi=44 仅 cube_turn

<!-- CLAIM:END clm_9F3BC0989E06157B2B43343C86 -->

<!-- CLAIM:START clm_BA34651BAE20402536B7CD711B -->

### Signal registry entry: f1=sendId f2=monitorId f3=name f4=params(3 container pinIndex) f6=version f7=nextId

GIL f5 大容器内每个信号一个注册表条目：f1=sendId、f2=monitorId（NodeGraphId 结构）、f3=信号名、f4×N=参数条目{f1=参数名、f2=类型(3=Integer/6=String/9=BooleanList)、f3=1、f4/f5/f6=同一参数在三个定义容器中的 pinIndex}、f6=信号版本、f7=下一个信号 ID。cube_turn 条目={f1=0x60000005,f2=0x60000006,f3=cube_turn,face{6,1,12,34,40},direction{6,1,16,35,41},f6=2}；工具_新信号={f1=0x60000020,f2=0x60000021,参数_1{3,1,68,76,83},参数_2{6,1,12,34,40},参数_3{9,1,70,78,85},f6=1}。参数条目 f4/f5/f6 与三个定义容器中同一参数 f8 逐一吻合（face:12/34/40、direction:16/35/41），发送节点实例参数 cpi=68/12/70 取自其中。工具_新信号 参数_2 cpi=12=cube_turn face cpi=12，证实其复制自 cube_turn 后改参数

#### 适用边界

基于 cube_turn 与工具_新信号两个注册表条目（v7-v10 样本）；f7 语义由相邻 ID 推断；其他信号未样本

<!-- CLAIM:END clm_BA34651BAE20402536B7CD711B -->

<!-- CLAIM:START clm_B334BFA5DAE015C296764EADF9 -->

### Listen-node parameter consumption: instance encodes no OutParam; consumers reference OutParam index = output ordinal (0-based, 0 omitted)

监听节点实例不编码任何参数 OutParam pin（参数输出隐式，由定义容器决定）；消费方 pin.connects=[{id:监听节点nodeIndex, connect/connect2:{kind:OutParam, index:输出序号}}]。OutParam index=监听节点输出序号（0-based，0 省略），输出顺序=定义容器 f103 完整输出列表：事件源实体=0、事件源GUID=1、信号来源实体=2、自定义参数排后（face=3、direction=4）。v9 消费事件源实体=无 index、v10 消费信号来源实体=index:2、v11 消费事件源GUID=index:1（新增，0/1/2/3 全闭环）、v8 遗留连接 face=index:3。固定三个参数（事件源实体/事件源GUID/信号来源实体，f3={f1:4} 组）先于自定义参数（f3={f1:4,f2:序号}，face/direction）

#### 适用边界

输出 0/1/2/3 已由 v9/v10/v11/v8 样本证实；输出 4（direction）未被直接消费过（由 f103 列表推断）；f103 列表基于 cube_turn 单一信号；其他信号固定输出结构未样本

<!-- CLAIM:END clm_B334BFA5DAE015C296764EADF9 -->

<!-- CLAIM:START clm_C94874AE97BFE0BC3B9F1986D7 -->

### Consumer SysCall nodes: print=SysCall 1/1, type-convert=180/183; no cpi, no signalVersion; ConcreteBase type declarations

信号消费链中的 SysCall 节点：打印节点 genericId=concreteId=SysCall 1（InParam type=6 String，connects 引用来源）；类型转化节点 genericId=SysCall 180、concreteId 随输入具体类型变——concreteId=183（输入 Entity，InParam ConcreteBase{indexOfConcrete:1,itemType:Entity} type=1）/ concreteId=184（输入 GUID，InParam ConcreteBase{indexOfConcrete:2,itemType:GUID} type=2，v11 新增），OutParam 均为 ConcreteBase{indexOfConcrete:2,itemType:String}（type=6）。indexOfConcrete=转化输入类型注册序列（DTC_IN_PARAM_VARTYPE_SEQUENCE）下标：0=int/1=entity/2=guid/3=bool/4=float/5=vec3/6=faction（v9 ioC=1=Entity、v11 ioC=2=GUID 双样本证实），不是类型编号；concreteId 与 ioC 换算公式未验证。SysCall 节点一律无 compositePinIndex、无 signalVersion（同 §12.5 拼装节点）。pin.type=游戏全局 VarType（完整表见 04-validation-signal.md §13.8）

#### 适用边界

基于打印节点(idx=7/8)与类型转化节点(idx=9/10)实例；SysCall 1/180/183/184 的编辑器语义由用户口述确认（打印/类型转化），非字节证据；DTC 序列仅 7 种输入类型（int/entity/guid/bool/float/vec3/faction），其余类型转化样本未出现

<!-- CLAIM:END clm_C94874AE97BFE0BC3B9F1986D7 -->

<!-- CLAIM:START clm_9FA1660915D1832D0763A499E4 -->

### Signal/node types use the global VarType enum; real samples and current production cover distinct subsets

游戏数据类型使用全局 VarType：Entity=1、GUID=2、Integer=3、Boolean=4、Float=5、String=6、GUIDList=7、IntegerList=8、BooleanList=9、FloatList=10、StringList=11、Vector=12、EntityList=13、EnumItem=14、VectorList=15、LocalVariable=16、Faction=17、Configuration=20、Prefab=21、ConfigurationList=22、PrefabList=23、FactionList=24、Struct=25、StructList=26、Dictionary=27、VariableSnapshot=28。真实信号/节点样本已覆盖 1/2/3/6/9/12/15；v14 证明 vec3_list 参数与 Assembly 输出使用 15。当前生产 argVarType 已支持 vec3_list=15、config_id_list=22、prefab_id_list=23，并由 shared/legacy focused regression 覆盖；信号注册 UI 仅允许 9 种普通类型及其 9 种列表类型，faction/faction_list 只保留解码兼容而禁止新注册。DTC 输入序列仍是独立的 7 类型子集。

#### 适用边界

全局枚举来自 vendor 定义，不表示每个编辑器 UI 或节点都支持全部类型。真实实例只覆盖 1/2/3/6/9/12/15；22/23 当前只有生产自动回归和编辑器合法类型边界，不声称已有真实发送实例或游戏行为验证。DTC concreteId 换算公式及其余类型仍未验证。

<!-- CLAIM:END clm_9FA1660915D1832D0763A499E4 -->

<!-- CLAIM:START clm_9D4E6D9B9268F9425BD2BE264F -->

### vec3_list send instance and Vector Assembly List encoding from v12-v14

在真实编辑器相邻 GIL 样本 v12-v14 中，已注册信号 gsts_type_probe_vec3_list 的 send/monitor/server ID 为 1610612771/72/73、signalVersion=1。绑定但未赋参的发送节点只编码信号名 pin（compositePinIndex=172）；连接 [(1,2,3)] 后新增 InParam[0] type=VectorList(15)、compositePinIndex=173，连接 Assembly List nodeIndex=3 OutParam[0]。Assembly List 使用 SysCall genericId=169/concreteId=174，含 100 个 Vector(12) InParam[1..100]、首槽 (1,2,3) 和一个 VectorList(15) OutParam。

#### 适用边界

只适用于地图 1073741849、图 1073741836/后续专用增量图 1073741840 中该注册信号的真实编辑器样本。172/173 是该信号定义分配值，不可推广到其他信号；signalVersion 也必须从注册定义读取。真实编辑器观察和临时副本同构回读已完成，本轮没有新的真实写回或游戏行为验证。

<!-- CLAIM:END clm_9D4E6D9B9268F9425BD2BE264F -->
