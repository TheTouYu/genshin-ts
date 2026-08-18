# Composite parameter and wire contracts

Declared parameter types, concrete wrappers, bool enum metadata, and raw field-presence boundaries.


<!-- CLAIM:START clm_01KYH4ZHB6J996BYQ5B3PN8WQ4 -->

### 复合参数编码分离声明类型、物理包装与 wire presence（Composite parameter encoding separates declared type, physical wrapper, and wire presence）

复合接口类型源自声明的运行时参数类型；Stage 3 把 ParameterFlow 类型元数据与调用/impl 物理引脚值及具体包装分开编码。已核验的 bool 接口 case：ParameterFlow 写 enumId.val=1、bool 字面量用 bEnum、非 bool 参数省略 enumId。语义解码出的默认值不能证明这些字段或 oneof 分支真实出现在 wire 上。

Composite interface types originate from declared runtime parameter types; Stage 3 encodes ParameterFlow type metadata separately from call/impl physical pin values and concrete wrappers. For the verified bool interface case, ParameterFlow writes `enumId.val=1`, bool literal values use `bEnum`, and non-bool parameters omit `enumId`. A semantic decoded default cannot establish that these fields or oneof branches were present on the wire.

#### 适用边界

bool 元数据陈述限定于已注册的 bool/R20 证据；具体索引与包装仍按节点族与方向各异；不要把单个 DTC 或标量 fixture 推广到所有类型。

The bool metadata statement is scoped to the registered bool/R20 evidence; concrete indexes and wrappers remain node-family and direction specific. Do not generalize one DTC or scalar fixture to all types. Revalidate when parameter type mapping, definition builder, call pin builder, protobuf schema, concrete maps, or raw-presence regressions change.

<!-- CLAIM:END clm_01KYH4ZHB6J996BYQ5B3PN8WQ4 -->

<!-- CLAIM:START clm_BF84AB9A43CCFE104C55B93EE9 -->

### Composite input schemas preserve value types across build and call sites

Current Composite contracts derive build callback inputs and callComposite/declareDetached input objects from the declared input schema: each declared runtime type maps to its corresponding value type, direct object literals reject incompatible declared values and unknown fields, while the existing sparse-input contract still permits any declared subset including {}. Output type inference remains specific for types such as float and vec3.

#### 适用边界

This is a TypeScript/runtime contract and focused automatic regression only. It does not prove editor pin restrictions, protobuf encoding, GIA import, or game behavior; generic/value connections remain checked at the later runtime/IR boundary.

<!-- CLAIM:END clm_BF84AB9A43CCFE104C55B93EE9 -->
