# src/runtime/ — DSL Runtime Hub

## OVERVIEW
This is NOT a typical "runtime library". The Stage-2 runner spawns this code in a child process via `await import(entryUrl)` on each compiled `.gs.ts`. It collects `MetaCallRecord`s into `ExecutionFlow[]`, then `buildIRDocument` flushes them to `IRDocument`. Defines the `g.server(...).on(...)` DSL, the `f.*` API surface (via `gsts.f` getter), the composite-node DSL, and signal definitions.

## STRUCTURE
| File | Lines | Role |
|------|-------|------|
| `core.ts` | **1,664** | **GOD-FILE** — `g = {server, defineComposite}`, `MetaCallRegistry`, `applyZhAliases`, `buildServerGraphRegistriesIRDocuments`, `removeUnusedNodesFromFlow` |
| `value.ts` | 879 | Value class hierarchy (int/float/bool/str/vec3/dict/list/enumeration/guid/entity/prefabId/configId/faction/generic/localVariable/customVariableSnapshot); uses `__brand*` private branding |
| `server_globals.ts` | 975 | `installServerGlobals()` (base: raw/bool/int/idx/float/str/vec3/guid/prefabId/configId/faction/entity/dict/list) + `installScopedServerGlobals()` (per-handler: setTimeout/setInterval/clearTimeout/clearInterval/print/send/player/self/stage/level/Mathf/Random/Vector3/GameObject) |
| `server_globals.d.ts` | 794 | Ambient global type declarations (excluded from tsc — `server_globals.ts` is the runtime twin) |
| `variables.ts` | 657 | `parseVariableDefinitions(vars)`; `NodeGraphVarApi<Vars>` typed `f.get/f.set` augmentation |
| `composite_registry.ts` | 342 | `compositeRegistry` singleton; `CompositeHandle`, `CompositeCapture`; `nextCompositeId = 1610700000`; pin index constants |
| `ir_builder.ts` | 208 | `buildIRDocument(input: IRBuildInput): IRDocument` — single producer of `IRDocument[]` |
| `ir_optimize_return_vars.ts` | 104 | `optimizeReturnVars` (LEGACY — marked 弃用, kept for reference) |
| `execution_flow_types.ts` | 67 | `ExecTailEndpoint`, `ExecContext`, `ExecutionFlow` (eventNode + execNodes + dataNodes + edges + execContextStack + returnGate*) |
| `meta_call_types.ts` | **12** | `MetaCallRecord { id, type, nodeType, args }`; `MetaCallRecordType = 'event'\|'exec'\|'data'` — **the structural backbone of Stage 2** |
| `runtime_config.ts` | 32 | `setRuntimeOptions` / `getRuntimeOptions` (subset of `GstsConfig` optimize flags) |
| `IR.d.ts` | 300 | **Typed contract** between Stage 1/2 (producers) and Stage 3 (consumer); types only |

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a new value class | `value.ts` + update `RuntimeValueTypeMap`, `RuntimeParameterValueTypeMap`, `RuntimeReturnValueTypeMap` |
| Add a new global factory | `server_globals.ts:installServerGlobals` (base) or `installScopedServerGlobals` (handler-scoped); mirror in `server_globals.d.ts` |
| Add a new composite capture | `composite_registry.ts` + `composite.ts` Stage 3 |
| Add a new signal | `core.ts` signal subsystem (lines 58–294) |
| Change `g.server().on(...)` shape | `core.ts:server<Vars>(options)` (lines 1231–1356, 6 overloads) |
| Change IR schema | `IR.d.ts` (this is the only typed hand-off) |
| Change context system | `core.ts:GstsCtxType = 'javascript' \| 'server_handler' \| 'server_if' \| 'server_loop' \| 'server_switch'` |
| Change DCE behavior | `core.ts:removeUnusedNodesFromFlow` (BFS; respects `__bootstrap__`, `__composite_capture__`, `__composite_call__` markers) |

## CONVENTIONS
- `MetaCallRegistry` is per-`g.server(...)` call; the global `serverRegistries: MetaCallRegistry[]` collects all of them. `buildServerGraphRegistriesIRDocuments` flushes them all.
- `gsts.f` is a `defineProperty` getter that lazily binds to the current `MetaCallRegistry`; throws if read outside `server_*` ctxType.
- `vec3.x/y/z` getters and `dict.get/set/has/keys/values/forEach/clear/delete/size` all call `gsts.f.<method>()` to emit nodes — circular runtime dependency, resolved by lazy getter.
- `value.ts` classes use `__brand*` private fields for nominal typing (e.g. `__brandValue`).
- `IR.d.ts` is `.d.ts` (not `.ts`) because every export is a pure type — TypeScript treats it correctly.
- Composite registry assigns IDs from `nextCompositeId = 1610700000`; pin index constants (`PIN_INDEX_INFLOW_SINGLE = 1974`, `PIN_INDEX_INFLOW_MULTI = 6`, `PIN_INDEX_INPUT_BASE = 100`, `PIN_INDEX_OUTPUT_BASE = 200`) are read by `ir_to_gia_transform/composite.ts`.

## KEY EXPORTS (public)
- `g = { server, defineComposite }` (`core.ts:1394`)
- `MetaCallRegistry` class (`core.ts:512`)
- `buildServerGraphRegistriesIRDocuments(opts)` (`core.ts:1518`) — **the single producer of IRDocument[]**
- `removeUnusedNodesFromFlow(flow)` (`core.ts:1433`)
- `applyZhAliases(registry, lang)` (`core.ts:1275`)
- `setRuntimeOptions(opts)` / `getRuntimeOptions()` (`runtime_config.ts`)
- `parseVariableDefinitions(vars)` (`variables.ts`)
- `compositeRegistry`, `CompositeHandle`, `CompositeCapture` (`composite_registry.ts`)
- `buildIRDocument(input)` (`ir_builder.ts`)
- All `value` classes + `RuntimeValueTypeMap`, `RuntimeParameterValueTypeMap`, `RuntimeReturnValueTypeMap` (`value.ts`)
- `IRDocument`, `ServerNode`, `ClientNode`, `Argument`, `Variable`, `CompositeDefIR` (`IR.d.ts`)

## ANTI-PATTERNS
- Do NOT add business logic here — this is the bridge between user DSL and IR.
- Do NOT add `JSON.parse/stringify` to runtime — `gsts/no-json` rule applies to any code reachable from user DSL.
- Do NOT use `Promise`/`async`/`await` — `gsts/no-promise` rule.
- Do NOT add new value class without updating all 3 type maps (`RuntimeValueTypeMap`, `RuntimeParameterValueTypeMap`, `RuntimeReturnValueTypeMap`).
- Do NOT extend `ir_optimize_return_vars.ts` — marked 弃用; current return-var path uses LocalVariable semantics.
- `gsts.f` MUST stay a lazy getter — do NOT make it a static instance; the current per-handler binding is required.
- `defineComposite({ build: (args, f) => ... })` may call `f.callComposite(A, ...)`; nested composite capture is supported and covered by focused regressions. Preserve capture routing and typed physical pin behavior when changing it.
- Composite pin index constants live here, not in Stage 3 — DO NOT duplicate.

## NOTES
- `core.ts` mixes 4 concerns: DSL surface (`g.server`, `defineComposite`), signal system, IR build entry, and processDictParam. Natural split: `signals.ts`, `server_dsl.ts`, `composite_dsl.ts`, `ir_build_entry.ts`.
- `server_globals.d.ts` is `tsconfig.json` exclude because the `.ts` twin re-exports the same symbols; the `.d.ts` provides ambient declarations to consumer projects (e.g. `templates/start/`).
- `parseValue` is imported from `src/definitions/nodes.ts` (not from `value.ts`) — the runtime delegates type-coercion to the definitions layer.
- `IR.d.ts` is imported by **5 directories**: `runtime/`, `compiler/`, `definitions/`, `injector/` (via compiler import), `index.ts`. It is the only file with that reach.
- The `value` class hierarchy is in the process of being split — see `runtime/variables.ts` for the parser pattern and `value.ts` for the type zoo.
