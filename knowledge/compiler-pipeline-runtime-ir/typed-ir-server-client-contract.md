# Typed IR server and client cross-stage contract

`IR.d.ts` producer/consumer contract, shared server/client shape, graph-specific differences, and change impact.


<!-- CLAIM:START clm_01KYH64V2V7AQ052RMREK81B8F -->

### IR.d.ts is the typed producer-consumer seam for server and client graph documents

`IRDocument` is a discriminated union of server and client node-graph documents sharing version, graph mode, nodes, arguments, and connections while preserving graph-specific subtype and metadata. Runtime/Stage 2 produces this shape and Stage 3 consumes it; any shape change must check producers, merge/serialization paths, server/client consumers, and focused regressions.

#### 适用边界与失效条件

The shared type contract does not imply feature parity: current client documents omit node-graph variables and have subtype-specific behavior, while Composite definitions/calls belong to server documents. Revalidate on `IR.d.ts`, `buildIRDocument`, merge logic, or server/client Stage 3 changes.

<!-- CLAIM:END clm_01KYH64V2V7AQ052RMREK81B8F -->
