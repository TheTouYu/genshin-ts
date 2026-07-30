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
