# Composite parameter and wire contracts

Declared parameter types, concrete wrappers, bool enum metadata, and raw field-presence boundaries.


<!-- CLAIM:START clm_01KYH4ZHB6J996BYQ5B3PN8WQ4 -->

### Composite parameter encoding separates declared type, physical wrapper, and wire presence

Composite interface types originate from declared runtime parameter types; Stage 3 encodes ParameterFlow type metadata separately from call/impl physical pin values and concrete wrappers. For the verified bool interface case, ParameterFlow writes `enumId.val=1`, bool literal values use `bEnum`, and non-bool parameters omit `enumId`. A semantic decoded default cannot establish that these fields or oneof branches were present on the wire.

#### 适用边界与失效条件

The bool metadata statement is scoped to the registered bool/R20 evidence; concrete indexes and wrappers remain node-family and direction specific. Do not generalize one DTC or scalar fixture to all types. Revalidate when parameter type mapping, definition builder, call pin builder, protobuf schema, concrete maps, or raw-presence regressions change.

<!-- CLAIM:END clm_01KYH4ZHB6J996BYQ5B3PN8WQ4 -->
