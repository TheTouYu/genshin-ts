# Stage 2 runtime execution and IR production

Isolated `.gs.ts` execution, runtime registries, values/metadata, and IR document construction.


<!-- CLAIM:START clm_01KYH64TYS6MNC3JYD3EX74G04 -->

### Stage 2 executes each graph script in isolation and snapshots runtime registries into IR

Stage 2 runs each `.gs.ts` entry through an isolated child process, imports it to populate runtime server/client registries, then serializes `buildAllGraphRegistriesIRDocuments()` output; runtime values and metadata become literal or connection arguments through `buildIRDocument()` rather than being encoded directly as GIA.

#### 适用边界与失效条件

This describes current gsts Stage 2 production, not user-code side effects outside the supported runtime or editor behavior. Server and client registry details differ. Revalidate when runner isolation, registry collection, value metadata conversion, IR construction, or process orchestration changes.

<!-- CLAIM:END clm_01KYH64TYS6MNC3JYD3EX74G04 -->
