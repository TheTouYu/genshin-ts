# Composite Stage 3 root and impl encoding

Navigation for CompositeDef/impl GraphUnit pairing, synthetic calls, node and pin materialization, and root/impl parity.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_01KYH07BSYPM9083KHHEHEP22H -->

### Stage 3 lowers each Composite across root, definition, and impl seams

Stage 3 lowers a main-graph `__composite_call__` to a synthetic SysGraph call and emits each `CompositeDefIR` as a paired CompositeDef GraphUnit plus impl NodeGraph GraphUnit. It remaps impl node IDs, materializes node pins and connections, overlays `compositePins`, and maintains definition/impl/called-definition relationships. The current production default for ordinary impl nodes is `shared-vendor-impl-graph`; `legacy-handwritten` remains an explicit fallback.

#### 适用边界

This describes current gsts encoding responsibilities and backend selection, not universal editor encoding. Root/impl parity does not remove Composite-specific handling for definitions, synthetic calls, capture routes, overlays, metadata, or proven legal exceptions.

<!-- CLAIM:END clm_01KYH07BSYPM9083KHHEHEP22H -->
