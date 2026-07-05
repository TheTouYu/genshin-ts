# scripts/ — Build/Test/Regen Scripts (CI-driven)

## OVERVIEW
Node/TS scripts **runnable via `npm run ...`** or as part of CI/release pipeline. Distinct from `tools/` (interactive `npx tsx` GIA analysis — see `tools/AGENTS.md`).

## STRUCTURE (28 top-level + `testgen/` subdir)

### Definition generation (4)
| File | Role |
|------|------|
| `generate-definitions.ts` | **1,375 LoC** — `npm run gen`; reads `resources/node_definitions.json` → emits `src/definitions/*.ts` (then prettier --write) |
| `generate-zh-aliases.mjs` | Chinese alias map → `src/definitions/zh_aliases.ts` |
| `inspect-ts-hover.mjs` | Debug TS hover provider output |
| `analyze-node-definitions-diff.mjs` | **23 KB** — diff the definitions tables across runs |

### Test generation (5)
| File | Role |
|------|------|
| `generate-node-gia-tests.ts` | **10 KB** — `npm run gen`-test step; produces `tests/generated/*.ts` grouped by generic id |
| `generate-enum-gia-tests.ts` | **13 KB** — produces `tests/enum_cases/*.ts` from enum type members |
| `generate-enum-equal-wired-tests.ts` | **4 KB** — `enum_enumerationsEqual_wired.ts` |
| `generate-mismatch-node-tests.ts` | **6 KB** — `mismatch_only.{literal,wire}.ts` (preserved across pretest) |
| `generate-final-gia-test.ts` | **15 KB** — final GIA integration test |

### Consistency / coverage (3)
| File | Role |
|------|------|
| `check-node-def-consistency.ts` | **10 KB** — consistency against vendor pin records |
| `check-node-gia-test-coverage.mjs` | Per-method coverage stats companion |
| `audit-vendor-gia-files.ts` | **16 KB** — audits third-party GIA files for missing node records / pin mismatches |

### Repair (1)
| File | Role |
|------|------|
| `fix-node-pin-records-from-consistency.ts` | Auto-fix pin records from consistency report |

### Asset extractors (2)
| File | Role |
|------|------|
| `extract-new-node-ids.mjs` | Extract new node IDs from vendor data |
| `verify-character-prefabs-from-docs.mjs` | Verify character prefab IDs against external docs |

### Assertion tests (8)
| File | Role |
|------|------|
| `assert-collection-rebind-semantics.ts` | Compile fixture → assert collection-rebind IR |
| `assert-const-object-member-folding.ts` | Compile fixture → assert const-folded object members |
| `assert-f-method-matcher.ts` | Compile fixture → assert f-method matching |
| `assert-live-collection-reference.ts` | Compile fixture → assert live collection reference semantics |
| `assert-loop-index-modulo.ts` | Compile fixture → assert loop index modulo semantics |
| `assert-signal-parameters.ts` | **14 KB** — Compile fixture → assert signal parameter shapes |
| `assert-timer-capture-writeback.ts` | Compile fixture → assert timer capture writeback |
| `assert-variable-plan-semantics.ts` | **13 KB** — Compile fixture → assert var-plan semantics |

### Build/release (3)
| File | Role |
|------|------|
| `postbuild.mjs` | 57 LoC — copies `gia.proto`, `IR.d.ts`, `server_on_overloads.d.ts`, `server_globals.d.ts` (renamed to `.global.d.ts`) into `dist/` |
| `release.mjs` | Changelog-driven version extraction for `.github/workflows/release.yml` |
| `clean-tests.mjs` | **33 LoC** — `pretest` hook; preserves `mismatch_only.{literal,wire}.ts` + `enum_nodes_second.ts` + `enum_enumerationsEqual_wired.ts`; deletes everything else in `tests/generated` and `tests/enum_cases` |

### `testgen/` (depth 2) — internal library
9 files used by `generate-*-gia-tests.ts`:
- `methods.ts` — AST visitor over `ServerExecutionFlowFunctions` class; returns `MethodInfo[]`
- `args_from_nodes.ts` — picks argument literal/wire values from node method signatures
- `typespec.ts` — `parseTypeSpec` recursive parser (primitive / list / dict / enumConcrete / unknown)
- `values.ts` — literal / wire value emitters
- `picks.ts` — `loadEnumPicks(enum.ts)` — reads first static of each enum class
- `return_consumers.ts` — wires generated return values to consumer nodes
- `emit.ts` — `header/footer/emitFile/cleanDir` for generated `.ts` test files
- `generics_data.ts` — `loadNodeGenerics`, `loadNodeGenericsSummary`, `buildGenericsMap` from `resources/node_generics*.json`
- `vendor_ids.ts` — `readVendorNodeIdKeysLower`, `canResolveNodeType` (mirrors `SPECIAL_NODE_MAPPINGS`)

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Regenerate definitions from updated resources | `npm run gen` (= `tsx generate-definitions.ts && prettier --write src/definitions/**/*.ts`) |
| Regenerate test corpus | `npm test` (calls `generate-node-gia-tests.ts` + `generate-enum-gia-tests.ts` after pretest clean) |
| Add a new generator for tests | Mirror `generate-*-gia-tests.ts` pattern; use `testgen/emit.ts` for the file header/footer |
| Add a new assertion test | Copy an `assert-*.ts`; compile fixture → compare to expected IR/GIA |
| Audit vendor coverage | `npx tsx scripts/audit-vendor-gia-files.ts` |
| Run a single test gen step | `npx tsx scripts/generate-node-gia-tests.ts` |
| Check pretest cleanup behavior | `clean-tests.mjs` (the keep-Set is the project's "trust the generator except for these" pattern) |
| Understand release flow | `release.mjs` + `.github/workflows/release.yml` |

## CONVENTIONS
- `scripts/` = CI/release pipeline work. `tools/` = interactive one-off GIA analysis.
- All test generators write to `tests/generated/` or `tests/enum_cases/` (git-ignored / cleaned before every test).
- All scripts use `tsx` for execution; never require a prebuild.
- Auto-generated test files start with `// AUTO-GENERATED: <group>` + `// Run: npx tsx scripts/generate-...` markers.
- Sidecar reports from test generators: `_report.json` (per-method coverage stats) + `_skipped_nodes.txt` (methods that couldn't be stably generated).
- `clean-tests.mjs` keep-Set defines the **manually-curated regression corpus** — those 4 files survive `pretest`:
  - `tests/generated/mismatch_only.literal.ts`
  - `tests/generated/mismatch_only.wire.ts`
  - `tests/enum_cases/enum_nodes_second.ts`
  - `tests/enum_cases/enum_enumerationsEqual_wired.ts`

## ANTI-PATTERNS
- Do NOT add a script that depends on `dist/` — these are dev-time only; production runs go through `node ./bin/gsts.mjs`.
- Do NOT add a generator that writes outside `tests/generated/` or `tests/enum_cases/`.
- Do NOT modify the `clean-tests.mjs` keep-Set without strong reason — those 4 files are the regression corpus.
- Do NOT skip the prettier --write step after `generate-definitions.ts` — broken formatting breaks the eslint pipeline.
- Do NOT add a test generator that depends on a specific node ID — IDs are in `1073741825+` range and may collide.
- Do NOT put GIA analysis scripts here (use `tools/`).
- `assert-*.ts` files are NOT wired into `npm test` — they are orphan. If you need them in CI, add a script entry to `package.json`.

## NOTES
- 8 `assert-*.ts` files are effectively orphan — nothing in `package.json` invokes them. Consider whether they should be wired into `test` or moved to a separate `test:all` script.
- The `postbuild.mjs` script is the only one that runs in the normal build flow (as `postbuild`).
- `release.mjs` reads `Changelog.md` headings to find `#{1,6} ... X.Y.Z` and outputs `version=` + `tag=` to `$GITHUB_OUTPUT`.
- `clean-tests.mjs` is the `pretest` hook.
- Test generator IDs are reserved in `1073741828-1073741852` range (per `generate-node-gia-tests.ts:46 BASE_GRAPH_ID = 1073741828`); collisions are a real risk.
- `audit-vendor-gia-files.ts` is the most-invoked non-test script — it ensures vendor completeness across `node_data/`.
