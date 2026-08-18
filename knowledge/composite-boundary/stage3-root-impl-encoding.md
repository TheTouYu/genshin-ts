# Composite Stage 3 root and impl encoding

Navigation for CompositeDef/impl GraphUnit pairing, synthetic calls, node and pin materialization, and root/impl parity.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_01KYH07BSYPM9083KHHEHEP22H -->

### Stage 3 lowers each Composite across root, definition, and impl seams

Stage 3 lowers a main-graph `__composite_call__` to a synthetic SysGraph call and emits each `CompositeDefIR` as a paired CompositeDef GraphUnit plus impl NodeGraph GraphUnit. It remaps impl node IDs, materializes node pins and connections, overlays `compositePins`, and maintains definition/impl/called-definition relationships. The current production default for ordinary impl nodes is `shared-vendor-impl-graph`; `legacy-handwritten` remains an explicit fallback.

#### 适用边界

This describes current gsts encoding responsibilities and backend selection, not universal editor encoding. Root/impl parity does not remove Composite-specific handling for definitions, synthetic calls, capture routes, overlays, metadata, or proven legal exceptions.

<!-- CLAIM:END clm_01KYH07BSYPM9083KHHEHEP22H -->

<!-- CLAIM:START clm_7FEA75E7BDC040A878FC3731F7 -->

### Stage 3 Composite accessory encoding is fail-fast and preserves nested capture routes

Current irToGia() builds Composite definition/impl accessory pairs as an all-or-nothing operation: if any Composite accessory cannot be encoded, it raises GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED instead of returning a partial GIA. Nested captured inputs retain the called Composite declaration index through IR compositeInputIndex and are materialized as outer-to-inner compositePins routes rather than physical InParam pins; the focused three-level capture regression passes on both shared and legacy backends.

#### 适用边界

This is current Stage 3 implementation plus automatic IR/decoded-GIA regression evidence. It does not prove editor import or game behavior, and the nested route scope is limited to the tested three-level capture shape and covered backends; it does not generalize to untested node families or wire fields.

<!-- CLAIM:END clm_7FEA75E7BDC040A878FC3731F7 -->

<!-- CLAIM:START clm_90A51FB7B582DB36FF61EE238C -->

### 复合 Stage 3 编码总览：root/definition/impl 三接缝与 fail-fast 配件编码（中文导航）

### 复合 Stage 3 编码总览：root/definition/impl 三接缝与 fail-fast 配件编码（中文导航）

Stage 3 把主图 __composite_call__ 降为合成 SysGraph 调用，并把每个 CompositeDefIR 输出为一对 CompositeDef GraphUnit + impl NodeGraph GraphUnit（跨 root/definition/impl 三接缝）：重映射 impl 节点 ID、物化节点引脚与连接、叠加 compositePins、维护 definition/impl/被调定义关系。普通 impl 节点生产默认 = shared-vendor-impl-graph，legacy-handwritten 为显式回退。配件编码 all-or-nothing：任一 Composite 配件无法编码即抛 GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED（不返回部分 GIA）；嵌套捕获输入保留调用复合声明索引（IR compositeInputIndex），以 compositePins 外层→内层路由物化而非物理 InParam 引脚。

#### 适用边界

描述当前 gsts Stage 3 编码职责与后端选择（非通用编辑器编码）；root/impl 对等不消除复合特有处理（定义/合成调用/capture 路由/叠加/元数据/已证实合法例外）；以 committed 文档 docs/architecture/composite/gia-encoding.md 与当前源码为准。

#### 适用边界

描述当前 gsts Stage 3 编码职责与后端选择；root/impl 对等不消除复合特有处理；以 committed 文档与当前源码为准。

<!-- CLAIM:END clm_90A51FB7B582DB36FF61EE238C -->
