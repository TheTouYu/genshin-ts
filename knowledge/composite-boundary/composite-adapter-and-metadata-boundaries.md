# Composite adapters and metadata boundaries

Sparse binding, pin-hole and special-arg remaps, root/impl parity, backend fallback, layout and graph metadata ownership.


<!-- CLAIM:START clm_01KYH4ZHNA0ZQSV882V3C2Z46H -->

### Root/impl parity shares ordinary remaps while Composite retains boundary and metadata ownership

Current Stage 3 uses shared ordinary resolution/materialization for the production shared backend and keeps explicit legacy fallback. Sparse declaration indexes, named pin-hole layouts, and signal/assembly/multiple-branches special arguments must use their shared IR→physical remaps in both root and impl; Composite-only code owns definition/call/capture/`compositePins` overlays and virtual impl layout, while graph container metadata remains an explicit scoped responsibility.

#### 适用边界与失效条件

Parity is an architectural/current-implementation contract, not proof that every node family or graph metadata field is game-verified. Intentional physical pin holes and high-risk signal/dynamic metadata remain scoped exceptions. Revalidate when shared adapters, backend defaults, ordinary coverage inventory, Composite layout, graphValues/affiliations, or root/impl parity tests change.

<!-- CLAIM:END clm_01KYH4ZHNA0ZQSV882V3C2Z46H -->
