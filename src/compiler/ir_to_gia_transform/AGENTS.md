# src/compiler/ir_to_gia_transform/ — Stage 3: IR JSON → .gia Binary

## OVERVIEW
Converts `IRDocument` JSON to GIA protobuf binary. Pure consumer of `src/runtime/IR.d.ts` types. Uses vendored `Graph/Node/Pin/wrap_gia` from `src/thirdparty/` and the `.gia.proto` schema (loaded via `src/injector/proto.ts`).

## STRUCTURE (11 files)
| File | Lines | Role |
|------|-------|------|
| `index.ts` | **856** | `irToGia(ir, opts): Uint8Array` — main entry; orchestrates expandListLiterals → resolveGiaNodeId → layout → optimizeTimerDispatchAggregate → buildCompositeAccessories → protobuf encode |
| `runner.ts` | 42 | Standalone CLI: `irPath [outFile] [preserve=1] [indicesCsv]`; child-process for pipeline parallel harness |
| `shared.ts` | 92 | `writeGiaFromIrJsonFile(irPath, outFile?, opts?)` — used by both `runner.ts` and `cli/gsts.ts`; names graph `_GSTS_<base>` if unnamed |
| `mappings.ts` | 488 | Bidirectional maps: `ENUM_ID_LOWER`, `ENUM_VALUE_LOWER` (skipped key list), `ENUM_VALUE_MAPPINGS` (vendor `ComparisonOperators_*` → `comparison_operator_*` bridge), `SPECIAL_NODE_MAPPINGS` (renamed upstream nodes) |
| `pins.ts` | 155 | `setEnumArgValue` / `setLiteralArgValue` / `setClientExecLiteralArgValue`; manages `InParam` (kind=3) and `ClientExec` (kind=5) Pin construction |
| `layout.ts` | 311 | `buildExecutionGraph(irNodes)` + `layoutPositions(...)` — grid-based X/Y placement with column/row widths, maxColumns, eventGap |
| `optimize_timer_dispatch.ts` | 361 | Aggregates chains of `when_timer_is_triggered → equal → branch` into a single switch node (`MAX_TIMER_DISPATCH_CASES = 10`); driven by `GSTS_OPT_TIMER_DISPATCH` env |
| `composite.ts` | **1,123** | **GOD-FILE** — `buildCompositeAccessories(def, compositeDefById?)` encodes each `CompositeDefIR` as `GraphUnit` pair (CompositeDef + impl NodeGraph); id remap, `__composite_capture__` filtering, OutParam generation, nested-call pin wiring |
| `node_id.ts` | 643 | `buildConnTypeIndex` + `resolveGiaNodeId`; type-driven node-id resolution with classic/beyond mode branches (e.g. `teleport_player`: classic=805 beyond=288) |
| `preprocess.ts` | 49 | `expandListLiterals` — inline `*_list = [...]` → synthetic `assembly_list` data node + conn |
| `types.ts` | small | `Position`, `NodeId`, `IRNode` (= `NonNullable<IRDocument['nodes']>[number]`) |

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a new GIA encoding rule | `index.ts:irToGia` (orchestrator) or one of the helpers |
| Add a new node-type mapping | `mappings.ts:SPECIAL_NODE_MAPPINGS` + `node_id.ts:resolveGiaNodeId` |
| Add a pin encoding | `pins.ts` |
| Change editor layout | `layout.ts:layoutPositions` (column widths, gap) |
| Add a composite pin wiring | `composite.ts:buildImplNodePins` (250 LoC) |
| Change timer dispatch optimization | `optimize_timer_dispatch.ts` (`MAX_TIMER_DISPATCH_CASES` constant) |
| Change graph name prefix | `shared.ts:writeGiaFromIrJsonFile` (default `_GSTS_`) |
| Debug a wrong GIA | `tools/decode-gia.ts <file.gia> \| jq` (decodes to JSON) |

## CONVENTIONS
- Pure consumer of `IRDocument` (from `src/runtime/IR.d.ts`); no imports from `src/definitions/` (only uses value type strings).
- Protobuf schema loaded from `src/thirdparty/.../protobuf/gia.proto` via `loadGiaProto(protoPath)` from `src/injector/proto.ts`.
- Vendor data (`Graph`, `Node`, `Pin`, `NODE_ID`, `NodePinRecords`, `EnumId`) re-exported via `src/compiler/gia_vendor.ts`.
- `_GSTS_<name>` graph name prefix: created in `shared.ts` when name missing; verified in `injector/index.ts` safety check.
- Node IDs in IR are 300000/300001 (send/monitor placeholders); `injector/signal_nodes.ts` patches them by scanning signal name strings.
- `optimize_timer_dispatch.ts` operates only on chains `next → dispatch → equal → branch` and `→ next2 → dispatch2 → ...` — never on isolated timer nodes.

## KEY EXPORTS (public)
- `irToGia(ir, opts)` (`index.ts`) — main entry
- `writeGiaFromIrJsonFile(irPath, outFile?, opts?)` (`shared.ts`)
- `writeGiaFromIrJsonFiles(entries, outDir, opts)` (`shared.ts`, parallel) — re-exported from `ir_to_gia_pipeline.ts`
- `resolveGiaNodeId(connType, ...)` (`node_id.ts`)
- `buildCompositeAccessories(def, compositeDefById?)` (`composite.ts`)
- `optimizeTimerDispatchAggregate(ir)` (`optimize_timer_dispatch.ts`)
- `buildExecutionGraph(irNodes)` + `layoutPositions(irNodes, opts?)` (`layout.ts`)
- `expandListLiterals(ir)` (`preprocess.ts`)
- Types: `ServerGraphMode`, `GiaGraph`, `GiaNode` (`index.ts` re-exports)

## ANTI-PATTERNS
- Do NOT import from `src/definitions/` in this directory — Stage 3 is type-string-driven, not import-driven.
- Do NOT add new map entries to `mappings.ts` without checking `audit-vendor-gia-files.ts` first (the consistency check enforces vendor completeness).
- Do NOT increase `MAX_TIMER_DISPATCH_CASES` above 10 — game switch-case limit; re-tune by splitting, not by raising.
- Do NOT skip `optimizeTimerDispatchAggregate` for a hot path — the optimizer is idempotent and safe.
- Do NOT hand-write protobuf bytes — use the `wrap_gia` API from vendor.
- Composite pin index constants (`PIN_INDEX_INFLOW_SINGLE = 1974`, `PIN_INDEX_INFLOW_MULTI = 6`, `PIN_INDEX_INPUT_BASE = 100`, `PIN_INDEX_OUTPUT_BASE = 200`) live in `src/runtime/composite_registry.ts`, not here — DO NOT redefine.

## NOTES
- The `composite.ts` file is the single most complex Stage-3 file (1.1k LoC, 41 KB). The `buildImplNodePins` function (lines 627–877) is itself 250 lines and is the natural split target.
- Mode-specific node IDs (classic vs beyond) are scattered through `node_id.ts` as overrides — when adding a new node, check both modes.
- `mappings.ts:ENUM_VALUE_MAPPINGS` is a vendor→project bridge table (e.g. `ComparisonOperators_*` → `comparison_operator_*`) — when vendor renames, update here.
- The Stage 3 numeric limits: `MAX_TIMER_DISPATCH_CASES = 10`, `loopMax` default 999 (latter is Stage 1).
