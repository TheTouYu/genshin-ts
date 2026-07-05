# src/compiler/ — 3-Stage Pipeline Hub

## OVERVIEW
Orchestrates the 3-stage TS→.gs.ts→IR JSON→.gia binary pipeline. Each stage runs in its own tsx child process (maxParallel=cpus-1); IR is the only typed hand-off.

## STRUCTURE
```
src/compiler/
├── ts_to_gs_pipeline.ts    # Stage 1 driver (public: compileTsToGs, compileTsToGsFromConfig)
├── ts_to_gs.ts             # Stage 1 CLI shim (npm run to-gs)
├── gs_to_ir_json_transform/  # Stage 2 (only 2 files — see sub-AGENTS)
├── ir_to_gia_pipeline.ts   # Stage 3 public API (writeGiaFromIrJsonFiles, parallel runner)
├── ir_to_gia.ts            # Stage 3 CLI shim
├── ir_merge.ts             # Multi-entry IR merge by graphId
├── gsts_config.ts          # GstsConfig + GstsOptimizeOptions + GstsInjectConfig types (bilingual JSDoc)
├── config_loader.ts        # loadGstsConfig via tsx child process
├── gia_vendor.ts           # Re-export shim for vendored Graph/Node/Pin/wrap_gia
├── ts_to_gs_transform/     # Stage 1: TS AST → .gs.ts (14 files)
└── ir_to_gia_transform/    # Stage 3: IR JSON → .gia (11 files)
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a compile config option | `gsts_config.ts` (type) + `config_loader.ts` (loader) |
| Trace multi-entry IR merge | `ir_merge.ts` (`mergeIrJsonFilesByGraphId`, sets `__gsts.merged=true`) |
| Find what runner a stage uses | `ts_to_gs_pipeline.ts`, `ir_to_gia_pipeline.ts` (parallel harness) |
| Add a new pipeline stage | Mirror `ts_to_gs_transform/` + driver pipeline pair |
| Cross-stage error format | `fail()` / `warn()` in `ts_to_gs_transform/errors.ts` (positional), `[error]` (host) elsewhere |

## CONVENTIONS
- All files snake_case; CLI shims `ts_to_gs.ts` / `ir_to_gia.ts` mirror stage names.
- `gsts_config.ts` types have full EN+ZH JSDoc — when adding fields, mirror both.
- Children spawn via `tsx`; pipeline root is `compileRoot`; `entries` use fast-glob (supports `!` negation).
- Stage outputs use the suffix convention (`.gs.ts`, `.json`, `.gia`) — do NOT break the convention; pipeline guards on `.gs.ts` to prevent re-processing.
- `_GSTS_<name>` graph name prefix is set in `ir_to_gia_transform/shared.ts` and enforced by `injector/index.ts` safety check.

## KEY EXPORTS (public API)
- `compileTsToGs(entries, outDir, opts)` — Stage 1
- `compileTsToGsFromConfig(config)` — Stage 1 from GstsConfig
- `emitIrJsonForEntries(entries, outDir, opts)` — Stage 2 orchestrator (parallel)
- `mergeIrJsonFilesByGraphId(paths, outPath, opts)` — multi-entry merge
- `writeGiaFromIrJsonFile(irPath, outFile?, opts?)` — Stage 3 single
- `writeGiaFromIrJsonFiles(entries, outDir, opts)` — Stage 3 parallel
- `irToGia(ir, opts)` — Stage 3 main (in `ir_to_gia_transform/index.ts`)

## ANTI-PATTERNS
- Do NOT call `gsts_config.ts` types in user DSL — they are for `gsts.config.ts` only.
- Do NOT hand-edit `src/definitions/*.ts` — regenerate via `npm run gen`.
- Do NOT use `JSON.parse/stringify` in compiler host code without thinking — it's fine here, but is `gsts/no-json` in user DSL.
- Stage children must NOT share state — each is an isolated `tsx` process.

## NOTES
- **3 god-files** dominate: `ts_to_gs_transform/expr.ts` (2150), `ts_to_gs_transform/stmt.ts` (1663), `ir_to_gia_transform/composite.ts` (1123). Refactor here = high risk.
- `gsts.test.config.ts` disables `precompileExpression` + `removeUnusedNodes` so test goldens stay stable.
- `ir_merge.ts` errors via `i18n.t('err_mergeServerSubTypeMismatch', ...)` (uses `src/i18n/`).
- `config_loader.ts` loads `gsts.config.ts` via tsx child (not `require`).
- See subdirectory AGENTS.md for Stage 1 (`ts_to_gs_transform/`) and Stage 3 (`ir_to_gia_transform/`) details. Stage 2 has only 2 files, so no sub-AGENTS.
