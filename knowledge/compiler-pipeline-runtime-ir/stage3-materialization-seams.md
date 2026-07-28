# Stage 3 ordinary, synthetic, and boundary materialization seams

IR-to-GIA preprocessing and responsibility seams among ordinary nodes, synthetic lowering, boundaries, layout, and encoding.


<!-- CLAIM:START clm_01KYH64V6AG9Q1EFEVHBJJC93P -->

### Stage 3 consumes typed IR through distinct ordinary, synthetic, and boundary seams

`irToGia()` dispatches client documents separately and, for server documents, preprocesses IR before resolving graph metadata, nodes, layout, pins, variables, connections, Composite definitions/calls, and protobuf output. Ordinary vendor nodes, compiler-synthetic nodes, and boundary overlays have distinct materialization responsibilities and must not be repaired by guessing backward from final GIA.

#### 适用边界与失效条件

This is current gsts architecture, not proof of editor wire equivalence or game behavior. Composite root/impl details remain in the Composite Node, and client encoding has its own path. Revalidate when `irToGia`, preprocess/materializers, synthetic lowering, boundary adapters, client dispatch, or the Stage 3 contract changes.

<!-- CLAIM:END clm_01KYH64V6AG9Q1EFEVHBJJC93P -->
