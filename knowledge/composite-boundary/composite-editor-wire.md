# 真实编辑器复合 wire（v22-v48 相邻快照）

用户自建复合节点在真实编辑器 GIL 中的三层落盘、参数流/映射/调用侧 wire 与逐操作行为（composite-case1..26）

<!-- CLAIM:START clm_8CC703AD6EAB67CF889F4D05F2 -->

### 复合节点编辑在三处落盘：宿主实例/CompositeDef/内部实现图

创建或修改用户自建复合节点时，编辑器在 Level root 10 容器三处联动落盘：宿主图实例（SysGraph 22001 节点，nodeId 0x6000000N，有坐标默认零 pins）、CompositeDef（root10.field2 末尾追加，Id{genericId/concreteId=SysGraph, graphId=CompositeGraph 21002}+type(107)=1000+name(200)+xxx(203)=6+inputs(102)/outputs(103)/inflows(100)/outflows(101) 参数流列表，零参数时 100-103 全部省略）、内部实现图（root10.field4 末尾追加，NodeGraph id=CompositeGraph 0x6000000N，nodes=内部节点+compositePins(4) 映射）。改复合名字只写 CompositeDef.name(200)，实例与内部图不变；创建=宿主图删原节点+加 SysGraph 实例+CompositeDef 追加+内部图原节点原样搬入（无坐标）。

#### 适用边界

仅真实编辑器 GIL 相邻快照（composite-case1..26，v22-v48）与第三方 gia.proto 对照；不覆盖嵌套复合与执行语义；field203=6 语义与 f2/f4 列表项数不对应（59 vs 29）未闭合。

<!-- CLAIM:END clm_8CC703AD6EAB67CF889F4D05F2 -->

<!-- CLAIM:START clm_23C30B27044EC9F29E896D9EFF -->

### 参数流共用骨架与 ShellIndex/pinIndex 双号语义

CompositeDef 的 ParameterFlow（数据）与 ControlFlow（控制流）共用骨架：name(1)（ControlFlow 可选——FlowIn/FlowOut 映射无 name、多分支 DefaultBranch 带 name="默认"）、visible(2)=1、index(3)={数据 kind=3 InParam/4 OutParam、控制流 kind=2 OutFlow/1 InFlow；ShellIndex 默认省略/非默认显式}、type(4)（Ety={type1=1,type2=1} class 省略、Str={class=5,6,6}、Flt={class=4,5,5}；未配置变体的 Variant 源输出={1,1} 默认 Ety，v35）、description(4)（ControlFlow 显式落 len=0）、pinIndex(8)。pinIndex 是全局唯一身份号：同复合内按创建顺序递增、交换/排序参数顺序不改变、分配器全局单调递增删除不释放（v42：删 51/52 后新参数仍拿 55=max+1）、分配顺序 outflow 先于 inflow（53/54、57/58 两样本）；ShellIndex 是顺序号，交换/排序时按新顺序重写（0,1,...）。

#### 适用边界

复合参数定义/排序 wire 证据（v22-v48 相邻快照）；pinIndex 全局分配器位置未定位（仅观察行为）；实例 pin 用 field7 引用 pinIndex。

<!-- CLAIM:END clm_23C30B27044EC9F29E896D9EFF -->

<!-- CLAIM:START clm_E259AE61C383F9B8447CA9D77C -->

### compositePins 外壳映射与共享合并统一规律

内部实现图 compositePins(4) 每条={outerPin(1)={kind,ShellIndex}、innerNodeId(2)=内部节点 nodeIndex、innerPin(3)={kind,ShellIndex}、innerPin2(4)=innerPin 双写}；映射按参数身份（名字）绑定，与参数列表顺序无关；compositePins 数组顺序=f2 参数出现顺序（inflows→outflows→inputs→outputs，组内按参数顺序，共享参数的多个映射按创建顺序）。共享参数合并（数据输入 v37/控制流输出 case25/控制流输入 case26 三向同构）：保留用户目标参数、删除被合并参数（f2 项删、pinIndex 不释放）、被删方映射不删除、仅 outerPin.index 改写为保留参数 ShellIndex、按 outer Shell 升序重排。

#### 适用边界

v30/v37/case21/case22/case23/case24 六样本支持；v35/v36 观察到的乱序是加参数未触发重排的中间态，交换/合并/共享改写操作会触发重排；共享多对一运行时行为属游戏验证范畴。

<!-- CLAIM:END clm_E259AE61C383F9B8447CA9D77C -->

<!-- CLAIM:START clm_23EAD146B7098B8A122AD6D73D -->

### 复合实例调用侧惰性实例化与输出永不落盘

宿主图复合实例（SysGraph 节点）按需实例化 pin：数据输入只落被赋值/连线的 InParam pin（i1/i2={kind=3 InParam, index=ShellIndex}+type+value 或 connects，二选一，均带 field7=pinIndex；未赋值/未连线不落盘）；控制流输入（InFlow）作连线目标不落 pin（源侧 connects→实例 id，同普通控制流目标规则）；控制流输出（OutFlow）作源落 kind=2 pin+connects+field7=outflows pinIndex；数据输出永不落 pin（v32：输出被主图连线消费后实例零变化——调用侧直接以 connects=[{id=复合实例 nodeIndex, connect={kind=4 OutParam, 源 ShellIndex 默认省略/显式}, connect2 双写}] 引用实例，与普通 Fixed 源同构，触发目标 Variant 自动实例化）；实例 pin 顺序=参数定义顺序、index=ShellIndex；输出参数排序交换只影响 f2/compositePins（实例输出侧零变化，case22）。

#### 适用边界

调用侧 wire（v28/v32/v38/case22 实测）；运行时绑定/执行语义属游戏验证范畴。

<!-- CLAIM:END clm_23EAD146B7098B8A122AD6D73D -->

<!-- CLAIM:START clm_DDD535B52FFFF56D5072712050 -->

### 内部 Variant 选型改类型联动与类型失效删除

内部实现图 Variant 节点与宿主图同规则：手动选型/连线自动实例化 concreteId=选中变体 KernelID、R<T> pin 全量实例化/重写（type、value.indexOfConcrete=TypeSelectorIndex 跟随，0 省略）、固定类型 pin 不实例化（case17：337 选 Flt→concreteId 341+value Out pin type {1,1}→{class=4,5,5}+indexOfConcrete 0→4）；改类型触发自身联动重写且与连线方向无关（case18 宿主 node 19：cid 2659→20、自身两个 R<T> pin 全部重写）；类型不匹配的复合输出参数被整个删除（case17：f2 outputs 项+compositePins 映射项同步删，非类型联动——编辑器不追踪输出参数与内部节点 pin 的类型联动）；断线行为由目标节点类型决定（非内部图/宿主图差异）：Variant 目标（自动实例化 pin 带 value 配置）断线=pin 保留、connects 移除；Fixed 目标（连线新建 pin 无 value）断线=整 pin 移除（case17 内部 323、case18 宿主 node 19 两样本）。

#### 适用边界

case17/18/19 实测；普通连接语境同规则起源见 gia-wire-analysis ordinary-connection-wire-encoding（v21→v22）；类型联动不扩展到控制流（控制流连线不触发 Variant 实例化）。

<!-- CLAIM:END clm_DDD535B52FFFF56D5072712050 -->

<!-- CLAIM:START clm_8848DCF0478F05D2FC81D6FE41 -->

### 内部图连线与宿主图同构及编辑器逐操作 wire 行为

内部图连线与宿主图普通连线完全同构：connects 挂目标侧 InParam（id=内部源 nodeIndex、connect/connect2={kind=4 OutParam} 双写）、源侧不落 connects、value 与 connects 并存（Variant 自动实例化自带 value）；未配置变体的 Variant 目标按源类型自动实例化（同宿主图 v18 规则，如源 337 默认 Ety→目标 323 concreteId 缺失→328 Ety TypeSelectorIndex=5）、默认变体=genericId（Variant 列表第一个 KernelID：337 默认 Ety、323 默认 Int）；内部控制流连线（case19）源侧落 OutFlow pin+connects、目标内部节点零感知、不触发 Variant 自动实例化；多分支默认分支输出=DefaultBranch（Shell0）、Case1..10=Shell1..10；内部连线不产生 compositePins。编辑器逐操作行为（创建/加输入输出 pin/加控制流参数/内部加节点连线/合并共享/改参数名/调用填值连线/交换参数顺序/追加控制流参数）见 Authority 行为表；实例 nodeIndex 在修改 CompositeDef 结构的保存后重编号（样本 3→5→6→7→8→23→51，复用宿主图空闲 nodeIndex），主图连线不触发重建。

#### 适用边界

内部连线 wire 已闭合（v33/v34/v35/case19）；空闲号池精确分配规律与编辑器保存路径相关未完全闭合；执行语义属游戏验证范畴。

<!-- CLAIM:END clm_8848DCF0478F05D2FC81D6FE41 -->
