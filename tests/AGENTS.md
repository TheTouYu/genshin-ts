# tests/ — Compiler Test Corpus

## OVERVIEW
The compiler IS the test runner — no vitest/jest/node:test. `npm test` runs `pretest clean` + `build` + `generate-node-gia-tests` + `generate-enum-gia-tests` + `node ./bin/gsts.mjs -c gsts.test.config.ts`. A test "passes" if its TS compiles all the way to `.gia` without error.

## STRUCTURE
```
tests/
├── *.test.ts               # ~30 hand-written compiler feature tests (snake_case `_test.ts`)
├── generated/              # AUTO-CLEANED in pretest, then re-generated
├── enum_cases/             # AUTO-CLEANED in pretest, then re-generated
├── other/                  # Legacy loose fixtures (no _test suffix; ~15 files)
├── risk/                   # Hand-curated risk_nodes.{literal,wire}.ts (kept across pretest)
└── composite/              # SEPARATE HARNESS — not executed by gsts CLI; run via `npx tsx`
```

## BUCKETS

### 1. Hand-written compiler tests at `tests/` root (~30 files)
Naming: `*_test.ts` (snake_case). Example: `bitwise_operator_test.ts`, `complex_flow_test.ts`, `gsts_server_functions_test.ts`, `variable_plan_semantics_test.ts`, `layout-two-composites.ts` (deliberately reuses same graph IDs to test multi-entry merge).
Also: `eslint_rules_showcase.ts`, `manual_verify_*.ts` (5 files, no assertions, human-verified), `complex_logic_compare_test.ts`, `assembly_dictionary_cases.ts`, etc.

### 2. `tests/composite/` (~80 files, ~1 MB) — SEPARATE HARNESS
- Uses `// @ts-nocheck` and imports from `../../dist/src/...` directly.
- Pattern: `import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'` + `import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'`.
- Manually calls `g.defineComposite()`, `g.server()`, `buildServerGraphRegistriesIRDocuments()`, `irToGia()`.
- Outputs to `tests/composite/output/*.gia` (Chinese filenames allowed: `bool复合测试.gia`, `全类型图变量.gia`, `类型转化-full.gia`).
- NOT executed by `gsts -c gsts.test.config.ts` — run manually via `npx tsx tests/composite/<x>.ts`.
- `package.json` exposes `trace-exec` and `trace-dataflow` for the two largest `trace-*.ts` files.
- Helper scripts: `gia-compare.ts`, `gia-diff.ts`, `gia-inspect.ts`, `audit-layout.ts`, `analyze-editor-layout.ts`, `ascii-layout.ts`, `verify-composite-gia.ts`, `diff_gia.py`.
- `test-composite-runner.sh` — runs 3 parts in separate `npx tsx` processes to avoid "global registry state pollution" (per comment line 3).

### 3. `tests/generated/` (~33 files, ~1 MB) — AUTO-GENERATED
- Wiped by `scripts/clean-tests.mjs` (pretest); only `mismatch_only.literal.ts` + `mismatch_only.wire.ts` survive.
- Grouped as `group_01..12.{literal,wire}.ts`, `classic.events.ts`, `classic.literal.ts`, `events.ts`, `final_all.ts`, `other.{literal,wire}.ts`, `_report.json`, `_skipped_nodes.txt`.
- Excluded from tsc compile.
- **Two-mode value passing**: every coverage test exists as `*.literal.ts` (inline values) AND `*.wire.ts` (variable-passed) — probes both literal-pin and data-flow-pin IR→GIA paths.

### 4. `tests/enum_cases/` (~21 files) — AUTO-GENERATED
- Wiped by `clean-tests.mjs`; only `enum_nodes_second.ts` + `enum_enumerationsEqual_wired.ts` survive.
- One file per enum type (e.g. `enum_EntityType.ts`, `enum_DamagePopUpType.ts`).
- Excluded from tsc compile.

### 5. `tests/other/` (15 small files) — Legacy
- No `_test` suffix. Includes `atest.ts`, `test.ts`, `complex_feature_demo.ts`, `preprocess_demo.ts`, `timer_capture_writeback_demo.ts`, `complex_logic_browser_reference.js` (JS reference).

### 6. `tests/risk/` (2 files) — Hand-curated
- `risk_nodes.literal.ts` + `risk_nodes.wire.ts`. NOT wiped by pretest. Use for risk-class node fixtures.

## KEY CONVENTIONS

### Graph IDs
All in Tencent's `1073741825+` range (2^30+1).
- Generator reserves `1073741828-1073741852` (`BASE_GRAPH_ID = 1073741828` in `generate-node-gia-tests.ts:46`).
- Hand-written tests use various IDs in `1073741873+` range (check existing before adding).
- **Reusing same ID across `g.server()` calls** deliberately tests multi-entry merge.
- `tests/layout-two-composites.ts` reuses `1073741828`/`1073741829` for this purpose.

### `gsts.test.config.ts` differences from `gsts.config.ts`
- `entries: ['./tests']` (not `['./examples']`)
- Different `inject.playerId` and `inject.mapId`
- `options.optimize.precompileExpression: false` and `removeUnusedNodes: false` — disabled for stable goldens
- Other optimize flags remain at defaults (including `timerDispatchAggregate: true`)

### Test patterns
- `lang: 'zh'` allowed in test files to exercise Chinese API aliases (e.g. `f.打印字符串(...)`).
- Tests are NOT snapshots; the `.gia` outputs in `tests/composite/output/` ARE the artifacts.
- No `__snapshots__/`, no `.snap` files. Comparison via `gia-compare.ts` / `diff_gia.py` (NOT assertions).

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a compiler test | New `*_test.ts` in `tests/` with `g.server({ id: 1073741xxx+ })`; check existing IDs to avoid collisions |
| Add a coverage test (literal + wire) | Extend `src/definitions/nodes.ts` (re-run `npm run gen`) or add a new file matching the literal/wire convention; survives pretest only if added to `clean-tests.mjs` keep-Set |
| Add a composite GIA-output test | Copy `tests/composite/test-bool-input.ts` as template; pick unused graph ID 1073741873+; change output filename in `OUT_DIR` |
| Debug a generated test | Compare `dist/tests/<name>.ir.json` against the corresponding `.gia` via `tools/decode-gia.ts` |
| End-to-end semantic verification (not just compiles) | Use `tests/composite/gia-compare.ts` or `diff_gia.py` against `tests/composite/output/*.gia` goldens |
| Run only the composite trace | `npm run trace-exec` or `npm run trace-dataflow` |

## ANTI-PATTERNS
- Do NOT add a test that imports from `genshin-ts` (the published package) — the tests run from `dist/src/` via tsc compile, not from the published package.
- Do NOT hard-code an ID below `1073741873` in hand-written tests — collision risk with generator.
- Do NOT add a test to `tests/generated/` or `tests/enum_cases/` by hand — they will be wiped by `pretest`. Add to `clean-tests.mjs` keep-Set if persistent.
- Do NOT add a `*_test.ts` to `tests/other/` — use `tests/` root or `tests/risk/`.
- Do NOT add `expect(...)` or `assert(...)` calls — there's no test framework. The "assertion" is the pipeline succeeding.
- Do NOT add a test that depends on `inject` succeeding — tests run with `gsts.test.config.ts`, which has its own `inject` block.
- Do NOT modify `tests/composite/output/*.gia` files — they are golden artifacts.

## NOTES
- `clean-tests.mjs` keep-Set defines the manually-curated regression corpus. The 4 files that survive `pretest`:
  - `tests/generated/mismatch_only.literal.ts`
  - `tests/generated/mismatch_only.wire.ts`
  - `tests/enum_cases/enum_nodes_second.ts`
  - `tests/enum_cases/enum_enumerationsEqual_wired.ts`
- `tests/composite/` is excluded from `tsconfig.json` (noUnusedLocals, exclude) but compiled manually via tsx.
- The `gsts.test.config.ts` test config uses `gameRegion: 'China'`, `playerId: 110170759`, `mapId: 1073741841` — these are real game inject params; do NOT change unless coordinating with the team.
- `npm run quicktest` skips the two generator scripts — uses checked-in fixtures. Use when iterating on compiler internals.
- Auto-generated test files start with `// AUTO-GENERATED: <group>` + `// Run: npx tsx scripts/generate-...` markers.
- `_report.json` (per-method coverage stats) and `_skipped_nodes.txt` (methods the generator couldn't emit a stable producer for) are sidecar reports from the generators.
- `manual_verify_*.ts` (5 files) compile cleanly but are human-verified, not automated.
