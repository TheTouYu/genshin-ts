# patchSignalNodeIds placeholder remapping

Exact identity seams: patchSignalNodeIds, buildSignalNodeIdMapFromFields, SIGNAL_NODE_ID_PLACEHOLDERS.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_9F67405A0B66F3C07FB26C47DA -->

### 注入器信号节点身份补丁（patchSignalNodeIds）

### 注入器信号节点身份补丁（patchSignalNodeIds）

src/injector/signal_nodes.ts:patchSignalNodeIds：对带 SIGNAL_NODE_ID_PLACEHOLDERS 占位符的节点，用 buildSignalNodeIdMapFromFields 从 GIL payload 建立 信号名→(send/monitor/sendServer nodeId) 映射；节点无信号名或映射缺该占位符类型时抛 injector_signalMissing 错误（injection failed）；命中后 setNodeGraphIdFields 写入目标 nodeId，validateSignalNode 校验。二次遍历非占位符信号节点：无信号名跳过、未注册信号名抛 injector_signal 未注册错误，按 send/monitor/sendServer 候选匹配 nodeId。

#### 适用边界

来自 src/injector/signal_nodes.ts 当前实现；覆盖信号节点身份注入与错误路径；GIL 字段布局见 gia-wire-analysis/signal-node-instance-encoding。

#### 适用边界

来自 src/injector/signal_nodes.ts 当前实现；覆盖信号节点身份注入与错误路径；GIL 字段布局见 gia-wire-analysis/signal-node-instance-encoding。

<!-- CLAIM:END clm_9F67405A0B66F3C07FB26C47DA -->
