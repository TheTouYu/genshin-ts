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

g.characterSkill({ id: 1073741825, name: 'Skill' }).on('start', (_evt, f) => {
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
- `src/compiler`: client IR validation, client node id resolution, client graph assembly.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data`: client node metadata lookup and GIA graph encoding facts.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen`: metadata-driven client node, pin, value, and graph body construction.
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
- `tests/client_generated/_coverage_gaps.json`
- `tests/client_generated/_report.json`

Generated TypeScript modules:

- `src/definitions/client_graph_modes.ts`
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_graph_encoding.ts`
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts`

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
- bool filter end normalization
- int filter end normalization
- execution flow connections
- data flow connections
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

## Review Model

Implementation must proceed by phases. After each phase, the implementer stops and presents:

- changed files
- generated files
- tests run
- remaining gaps
- any deviations from this spec

The next phase starts only after explicit user approval.
