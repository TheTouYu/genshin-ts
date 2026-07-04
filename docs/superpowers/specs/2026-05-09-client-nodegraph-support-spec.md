# Client Nodegraph Support Spec

## Goal

Implement complete client nodegraph support with a server-parity internal architecture and the planned public API.

The first implementation prioritizes a working end-to-end chain:

1. TypeScript user code calls client graph APIs.
2. Runtime builds readable client IR.
3. IR merge keeps client graph compatibility rules.
4. Compiler emits client GIA files from client metadata.
5. CLI can compile and inject client graphs through the same pipeline used by server graphs.

Small, explicit gaps are allowed for poorly understood special nodes, but those gaps must be represented in generated reports and fail with stable errors when used.

## Public API

The user-facing API must match the existing design direction:

```ts
import { g } from 'genshin-ts'

g.characterSkill({ id: 1082130433, name: 'Skill' }).on('start', (_evt, f) => {
  f.printString('hello')
})

g.creationSkill().on('start', (_evt, f) => {
  f.printString('creation skill')
})

g.creationStatus().on('start', (_evt, f) => {
  f.printString('status')
})

g.creationStatusDecision().on('start', (_evt, f) => {
  f.printString('decision')
})

g.boolFilter().on('start', (_evt, f) => {
  return f.greaterThan(2, 1)
})

g.intFilter().on('start', () => {
  return 1n
})
```

Scoped global `f` access must also be available:

```ts
gsts.f.printString('server shorthand')
gsts.fServer.printString('explicit server')

gsts.fCharacterSkill.printString('character skill')
gsts.fCreationSkill.printString('creation skill')
gsts.fCreationStatus.printString('creation status')
gsts.fCreationStatusDecision.printString('creation status decision')
gsts.fBoolFilter.greaterThan(2, 1)
gsts.fIntFilter.add(1, 2)
```

`gsts.f.xxx` is the existing server shorthand and must remain equivalent to `gsts.fServer.xxx`.
Client graph APIs must use their own top-level namespaces (`gsts.fCharacterSkill`,
`gsts.fCreationSkill`, `gsts.fCreationStatus`, `gsts.fCreationStatusDecision`,
`gsts.fBoolFilter`, and `gsts.fIntFilter`) instead of nesting under `gsts.f`.

Scoped client helper globals must also be planned, but only as metadata-proven
capabilities:

- `send(...)`
- `player(id)`
- `self`
- `stage` / `level`
- `Mathf`
- `Random`
- `Vector3`
- `GameObject`

Each helper may be partial. Availability must be derived from generated client
resource JSON and filtered by `ClientGraphSubType + mode`; a helper or helper
method must not be exposed just because the server graph has a similar helper.
Before implementing any helper mapping, the implementer must confirm the client
resource JSON contains a usable node, compatible pins, compatible return type,
and the intended family/mode availability. If a client node looks similar but
its runtime semantics are not clearly equivalent, implementation must stop and
ask the developer to confirm the mapping.

The public API must not expose GIA encoding details such as `graphType`, `graphWhich`, `genericId`, `concreteId`, protobuf field names, or sample paths.

## Architecture

The client implementation should mirror the server implementation unless a client-specific difference is required.

Shared shape:

```text
TypeScript entry
  -> gs_to_ir_json_transform runner
  -> runtime registry
  -> readable IR
  -> ir_merge
  -> ir_to_gia_transform
  -> thirdparty gia_gen
  -> .gia bytes
```

Client-specific boundaries:

- `src/definitions`: DSL method names, mode maps, type-level method availability, capability data for user-facing checks.
- `src/runtime`: graph registration, handler execution, capability checks, client IR construction.
- `src/compiler`: client entry detection, TS-to-GS handler transformation, client IR validation, client node id resolution, client graph assembly.
- `src/cli`: batch/dev entry discovery, mixed server/client graph compilation, reinjection, resource extraction, and smoke command wiring.
- `src/injector`: client graph type recognition, folder category safety checks, and signal-node id patching for client-to-server signal nodes.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data`: client node metadata lookup and GIA graph encoding facts.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen`: metadata-driven client node, pin, value, and graph body construction.
- `src/i18n` and `docs`: user-facing client graph errors, injection warnings, examples, and reference documentation.
- `types` and `scripts/postbuild.mjs`: published client global/helper declarations and package type export support.
- `resources`: generated source caches and reports only; never runtime or compiler dependencies.
- `scripts`: extraction and generation pipeline.

## Data Sources

The external client sample directory is a generation-time input:

```text
D:\_S2\mypy_test\client_nodes
```

The first generator must accept this default path and a CLI override. No runtime, compiler, or published package code may depend on this path.

Generated source caches:

- `resources/client_node_metadata.json`
- `resources/client_graph_capability.json`
- `resources/client_execution_flow_metadata.json`
- `resources/client_scoped_globals_capability.json`
- `tests/client_generated/_coverage_gaps.json`
- `tests/client_generated/_report.json`

Client scoped helper globals must be generated from these resources only. File
names, server node names, and manual intuition are acceptable for investigation,
but not as implementation evidence.

Generated TypeScript modules:

- `src/definitions/client_graph_modes.ts`
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_graph_encoding.ts`
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts`

Client GIA graph header encoding facts live in thirdparty `node_data`, mirroring the
server side where `gia_gen/basic.ts` owns server graph header encoding. The compiler
consumes them through `gia_vendor.ts` only.

`src/definitions/client_method_modes.ts` is generated only after real node metadata extraction can populate method availability. It must not be introduced as an empty Phase 2 placeholder.

## Supported Client Graph Families

Initial graph families:

- `character_skill`
- `creation_skill`
- `creation_status`
- `creation_status_decision`
- `bool_filter`
- `int_filter`

Each family needs:

- subtype
- public DSL entry method
- public `start` handler shape
- supported modes
- capability status
- compiler graph encoding
- start/end node metadata

## First-Pass Supported Special Behavior

The first end-to-end pass must implement:

- client graph start nodes
- bool filter return normalization into a filter end execution node
- int filter return normalization into a filter end execution node
- execution flow connections
- data flow connections
- client unused-node pruning through the same reachable-execution-node model used by server graphs
- typed literal input pins
- reflect/concrete node variants when metadata provides enough information
- dictionaries using `ClientVarType.Dictionary_ = 24`
- faction lists using observed `ClientVarType = 25`
- local variable get/set if metadata contains enough variant information
- multiple branches for supported scalar branch values
- signal nodes when metadata identifies their special pin shape
- status-family `GraphNode.statusNodeExtension` emitted as the observed fixed payload for `creation_status` and `creation_status_decision`

## Explicit First-Pass Gaps

The following special cases are intentionally not required to be fully synthesized in the first pass:

- `.VarBase field 3`: keep as `inline_var_type_hint` in audit reports, but do not synthesize it in generated client GIA until more samples explain it. Local scan shows this appears on resource-like literal pins, especially `prefab_id` and some `config_id` pins, not as an entire unsupported node class.
- structure-list nodes are not a predeclared gap. If extraction finds a structure-list node whose concrete binding cannot be represented by metadata, mark that specific node as `structure_list_unknown_binding` and reject compiler use for that node only.
- status-family business semantics behind `statusNodeExtension`: emit the observed stable payload `{ type: 1, inner: { value: 1 } }` on the observed status start node, but do not claim a higher-level semantic name.

These gaps must be visible in coverage reports and must not silently fall back to server node data or proto templates.

`ClientVarType = 25` is not a first-pass gap. Local samples show it once, in `角色技能节点图\定点发射投射物_连线.gia`, on `genericId=200017`, `concreteId=70`, where the node behaves like "get list value by index": input pin type `25`, output pin type `16` (`Faction_`). Treat it as a client faction-list type unless later samples contradict that.

## Invariants

- Client compiler code must not call server `resolveGiaNodeId`.
- Client node lookup must not fall back to server `NODE_ID`, `NODE_PIN_RECORDS`, or `CONCRETE_MAP`.
- Runtime and compiler must not read `resources/*.json` directly.
- Published code must not read external `.gia` samples.
- Definitions must not contain GIA graph header encoding values.
- Formal GIA generation must not clone whole sample node protos.
- Client graph errors must use stable error codes.
- Server graph behavior must remain unchanged unless a shared helper is intentionally extracted and covered by existing tests.
- `gsts.f` must remain the server shorthand, and its user-facing documentation must explain that it is equivalent to `gsts.fServer`.
- Client scoped globals must use dedicated top-level names (`gsts.fCharacterSkill`, `gsts.fCreationSkill`, `gsts.fCreationStatus`, `gsts.fCreationStatusDecision`, `gsts.fBoolFilter`, `gsts.fIntFilter`) to avoid mixing client namespaces into `gsts.f`.
- Client handlers must run under subtype-specific ctx names: `client_<sub_type>_handler`.
- Client control-flow callbacks must use the same subtype-specific ctx family:
  `client_<sub_type>_if`, `client_<sub_type>_loop`, and `client_<sub_type>_switch`.
- `GstsCtxApi` must expose `isClientCtx()`, `assertClientCtx()`, `isClientGraphCtx(subType)`, and `assertClientGraphCtx(subType)`.
- Client scoped globals must assert the matching client graph ctx before returning the bound f namespace.
- Client control-flow methods (`doubleBranch`, `finiteLoop`, `listIterationLoop`, `multipleBranches`, and `breakLoop`) must be generated from client metadata/capability maps. A client graph family must expose only the control-flow methods supported by that family and mode; unsupported control-flow use must fail with stable client errors if reached dynamically.
- Client literal pin values must be encoded per `ClientVarType` from observed sample `VarBase` shapes and verified by encode/decode round-trip against those shapes. A `ClientVarType` without proven shape evidence must fail with a stable client error instead of borrowing server `VarBase` construction.
- Client generic-to-concrete (reflect) variant resolution must be deterministic and metadata-driven: exact lookup first, then variant-key matching from IR argument types. Ambiguous or unmatched variants must fail with stable errors listing the candidates; the compiler must never pick a "closest" variant or fall back to server tables.
- Client helper globals (`send`, `player`, `self`, `stage`, `level`, `Mathf`, `Random`, `Vector3`, and `GameObject`) must be metadata-driven, family/mode filtered, and allowed to expose partial APIs. Unsupported helper use must be rejected by type definitions where possible, by ESLint rules for source patterns that TypeScript cannot express, and by stable runtime errors when reached dynamically.
- No client helper global may be implemented from server behavior alone. If resource JSON cannot prove equivalent client behavior, the helper entry must remain a documented gap until the developer confirms it.
- Client graph ESLint rules must be planned as a parity layer beside TypeScript types and runtime checks. Rules must be generated from or validated against client metadata/capability resources where they depend on client node availability. Before implementing any rule for uncertain syntax, arguments, callback shape, helper semantics, or graph-family behavior, the implementer must stop and ask the developer to confirm the intended form instead of guessing.
- Client graph entries must participate in the normal TS -> GS -> IR -> GIA CLI pipeline. Entry detection must recognize the official client `.on('start', handler)` APIs, transform supported TypeScript control-flow inside client handlers, and preserve server behavior for `g.server()` and `gstsServer*`.
- CLI batch/dev mode must handle mixed server/client entries, entry markers, graph id merge rules, and reinjection without requiring a separate client-only workflow.
- Injector safety checks must understand client graph types `20001`, `20002`, `20006`, `20007`, `20008`, and `20009`; unknown client folder/category mappings must be treated as implementation blockers until verified from local map data or confirmed by the developer.
- Client signal support must be verified through the existing signal extraction and node-id patch chain. Client-to-server signal nodes must not be assumed equivalent to server send/monitor signal nodes without resource JSON and map evidence.
- Published type declarations must include client graph globals and scoped helper declarations. Server-only global declarations must not silently claim client support.
- Client zh aliases, docs, examples, and coverage reports must be generated or written as first-class user-facing surfaces, not left as internal implementation details.

## Review Model

Implementation must proceed by phases. After each phase, the implementer stops and presents:

- changed files
- generated files
- tests run
- remaining gaps
- any deviations from this spec

The next phase starts only after explicit user approval.

The implementation phases must stay reviewable by capability boundary, not by a
single broad "toolchain" batch:

1. Generated data foundation.
2. Runtime and IR.
3. Client compiler and GIA builder.
4. Full metadata extraction, scoped helper capability derivation, and generated
   runtime definitions.
5. Client TS transform and official entry detection.
6. Client CLI batch/dev workflow.
7. Client injection, graph type recognition, and signal integration.
8. Published types, Chinese aliases, and client scoped globals.
9. Client ESLint parity rules.
10. User docs, coverage checks, and end-to-end smokes.
11. Cleanup and hardening.

ESLint parity, injection, published types, and docs/smokes must not be merged
into one oversized implementation phase. Each boundary must produce evidence
that can be reviewed independently before the next phase starts.
