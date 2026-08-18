# Composite flow interfaces and nesting

Multi-InFlow/OutFlow, default continuation, nested calls, capture routing, and OutFlow promotion.


<!-- CLAIM:START clm_01KYH4ZH6A6ZYM43SZFPR5K30R -->

### 复合 flow 接口在默认与显式拓扑间保持声明索引（Composite flow interfaces preserve declared indexes across default and explicit topology）

当前 gsts 把命名 inflowMarks/outflowMarks 记入 CompositeDefIR，并在合成调用与 impl compositePins 中保持声明的 InFlow/OutFlow 索引。单出口执行可自然延续；回调分支节点保留每个活动分支尾并连接后续顺序节点。对声明了多个 OutFlow 的复合做顺序调用会隐式选择 OutFlow[0] 并发出 GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION；精确复合 fan-in/fan-out 用分离节点+显式连线。嵌套复合调用保持为合成调用、保留子引用，可把选定子 OutFlow 提升为外层 OutFlow。

Current gsts records named inflowMarks/outflowMarks into CompositeDefIR and preserves declared InFlow/OutFlow indexes through synthetic calls and impl compositePins. Single-exit execution can continue naturally. Callback-based branch nodes preserve every active branch tail and join a following sequential node without treating that join as an ambiguous default continuation. By contrast, a sequential call to a Composite with multiple declared OutFlows implicitly selects OutFlow[0] and emits GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION; exact Composite fan-in/fan-out uses detached nodes plus explicit links. Nested Composite calls remain synthetic calls, retain child references, and can promote a selected child OutFlow as an outer OutFlow.

#### 适用边界

这是当前 gsts 运行时/Stage 3 对已覆盖 focused fixture 的行为，不是通用编辑器拓扑规则；loop 完成 API 与纯数据复合有各自的延续语义。

This is current gsts runtime/Stage 3 behavior for the covered focused fixtures, not a universal editor topology rule. Loop-complete APIs and pure-data Composites have separate continuation semantics. Revalidate when callback branch joins, capture flow marks, call lowering, continuation diagnostics, nested-call lowering, or backend selection changes.

<!-- CLAIM:END clm_01KYH4ZH6A6ZYM43SZFPR5K30R -->
