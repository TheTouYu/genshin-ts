# 普通 SysCall 连接 wire 编码（真实编辑器快照）

普通节点图 SysCall 控制流/数据流连接的真实 GIL 落盘：源目标 index 省略、connects 双写、Variant 自动实例化、替换/断线/排序规则（v9-v22）

<!-- CLAIM:START clm_1AD56D30A3A2DF6F08673BA49C -->

### 普通 SysCall 控制流连接的源目标 index 省略规则

真实相邻快照（control-flow case1-5）闭合：控制流连线只挂在源侧 OutFlow pin（connects=[{id=目标 nodeIndex, connect={kind=InFlow}, connect2 双写}]）；源 OutFlow index=0 省略、非默认（1/2/3/4）显式写 index；目标 InFlow index=0 省略、非默认显式写目标 ShellIndex（connect/connect2 对称）；目标节点无论默认还是非默认 InFlow 都不实例化 InFlow pin（pinCount 不变）；普通 SysCall OutFlow 不带 compositePinIndex；多个 OutFlow pin 按 index 升序排列且整体位于参数 pin 之前（插数组头部区域）；数据+控制流可同节点并存（目标侧只落数据 pins，控制流线全部只出现在源侧）。

#### 适用边界

真实证据覆盖源 OutFlow 0-4 与目标 InFlow 0/1；更高 index 交叉组合待验证；同一输出 fork 的 connects 顺序已知但游戏内执行顺序待验证；事件/循环执行语义未验证。

<!-- CLAIM:END clm_1AD56D30A3A2DF6F08673BA49C -->

<!-- CLAIM:START clm_0D5030477987A86DE4D2A6A265 -->

### 普通 SysCall 数据流连接的源目标落盘与替换插入规则

真实相邻快照（dataflow case1-5）闭合：数据连接挂目标侧 InParam（connects=[{id=源 nodeIndex, connect={kind=4 OutParam}, connect2 双写}]，源 ShellIndex 默认省略/非默认显式）；源侧 OutParam pin 实例化但不挂 connects；一源多目标各挂 connects、源仍不落盘；多 pin 目标按 ShellIndex 升序、新 pin 按 ShellIndex 升序插入数组（不是尾部追加，v18→v19）；已有连接的目标 InParam 被新线替换=connects.id 改写、不新增 pin/connects；未配置变体的 Variant 源连线时自动实例化：concreteId=目标类型对应 KernelID+新增 OutParam pin（type 跟随、value=ConcreteBase 嵌套，v17→v18）；数据+控制流可同节点并存（node 24 同时 3 数据线目标+2 控制流线目标，目标侧只落 3 个 InParam）。

#### 适用边界

dataflow case1-5 真实相邻快照；替换/插入/自动实例化 wire 证据；复合调用侧同构规则另见 composite-boundary composite-editor-wire。

<!-- CLAIM:END clm_0D5030477987A86DE4D2A6A265 -->

<!-- CLAIM:START clm_D0216263867D8BDE9A5B831253 -->

### 已连线 Variant 改类型联动重写与断线规则

已连线 Variant 改类型（v21→v22 真实快照）：源 concreteId/type/selector 联动重写（concreteId=新 KernelID、R<T> pin type/value/indexOfConcrete 跟随），类型不匹配的连线自动断开且目标 InParam pin 整个移除（不只是 connects 清除）；与替换线的 connects.id 改写形成对照（替换=改 id，类型失效=删整 pin）。断线行为由目标节点类型决定：Variant 目标（自动实例化 pin 带 value 配置）断线=pin 保留、connects 移除；Fixed 目标（连线新建 pin 无 value）断线=整 pin 移除（v21→v22 node 24 样本）。手动选型与连线自动实例化同构：concreteId=KernelID+所有 R<T> 数据 pin 实例化、indexOfConcrete=TypeSelectorIndex（0 省略）、固定类型 pin 不实例化（v20→v21）。

#### 适用边界

v20-v22 真实相邻快照；复合内部同规则实测 case17/18（见 composite-boundary composite-editor-wire）；自动实例化语义覆盖数据流，不扩展到控制流。

<!-- CLAIM:END clm_D0216263867D8BDE9A5B831253 -->
