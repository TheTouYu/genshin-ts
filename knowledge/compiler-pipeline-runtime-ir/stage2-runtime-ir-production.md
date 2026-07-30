# Stage 2 runtime execution and IR production

Isolated `.gs.ts` execution, runtime registries, values/metadata, and IR document construction.


<!-- CLAIM:START clm_01KYH64TYS6MNC3JYD3EX74G04 -->

### Stage 2 executes each graph script in isolation and snapshots runtime registries into IR

Stage 2 runs each `.gs.ts` entry through an isolated child process, imports it to populate runtime server/client registries, then serializes `buildAllGraphRegistriesIRDocuments()` output; runtime values and metadata become literal or connection arguments through `buildIRDocument()` rather than being encoded directly as GIA.

#### 适用边界与失效条件

This describes current gsts Stage 2 production, not user-code side effects outside the supported runtime or editor behavior. Server and client registry details differ. Revalidate when runner isolation, registry collection, value metadata conversion, IR construction, or process orchestration changes.

<!-- CLAIM:END clm_01KYH64TYS6MNC3JYD3EX74G04 -->

<!-- CLAIM:START clm_1CF9B63712693301D1FFA1FBD5 -->

### Stage 2 preserves active multi-outflow branch tails until a real continuation exists

For callback-based multi-outflow nodes, Stage 2 keeps every branch tail that was not terminated by return. A terminal branch with no following sequential node needs no continuation and emits no default-continuation warning; when a sequential node follows, every active branch tail joins that node. Sequential calls to a Composite with multiple declared OutFlows remain a separate ambiguous case: implicit continuation uses OutFlow[0] and emits GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION.

#### 适用边界

This is committed gsts runtime-to-IR behavior at 9ca2cc635d67800796c6ebc117978665af829a7e and focused automatic-regression evidence only. It does not establish consumer refreshed-snapshot warning counts, editor import, injection, or game behavior. Revalidate when branch callback join logic, tail endpoint registration, Composite marker continuation, or return termination changes.

<!-- CLAIM:END clm_1CF9B63712693301D1FFA1FBD5 -->
