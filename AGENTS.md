# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-05
**Commit:** cc60fcd
**Branch:** feat/fork-api-and-layout

## OVERVIEW
Genshin-TS (`gsts`) — TypeScript-to-node-graph compiler for Genshin Impact UGC (Miliastra Wonderland). Transforms TS into injectable game binary via 3-stage pipeline. Ships two npm packages: `genshin-ts` (compiler) + `create-genshin-ts` (scaffold CLI).

## STRUCTURE
```
genshin-ts/
├── src/compiler/      # 3-stage pipeline (ts→gs→ir→gia)
│   ├── ts_to_gs_transform/        # Stage 1: TS AST → .gs.ts (14 files, god: expr.ts 2150, stmt.ts 1663)
│   ├── gs_to_ir_json_transform/   # Stage 2: .gs.ts → IR JSON (2 files, thin orchestrator)
│   └── ir_to_gia_transform/       # Stage 3: IR JSON → .gia binary (11 files, god: composite.ts 1123, index.ts 856)
├── src/runtime/       # DSL runtime (g.server/f.*/values) — Stage 2 spawns this via `await import()`
├── src/definitions/   # AUTO-GENERATED from resources/node_definitions.json (DO NOT HAND-EDIT)
├── src/injector/      # GIA → .gil binary patcher (7 files)
├── src/cli/           # gsts CLI (commander, god file: gsts.ts 1523 LoC)
├── src/eslint/        # 37 custom DSL rules + 10 utils
├── src/shared/        # Pure TS type utils (3 files) — shared by compiler + eslint
├── src/i18n/          # en-US + zh-CN (i18next)
├── src/thirdparty/    # Vendored MIT data (Wu-Yijun's gia.proto + node IDs)
├── scripts/           # Build/test/regen scripts (CI-driven, see npm scripts)
├── tools/             # Interactive GIA analysis (npx tsx tools/<x>.ts)
├── tests/             # Compiler test corpus (compiler IS the test runner)
├── create-genshin-ts/ # SEPARATE npm package: `npm create genshin-ts@latest`
├── docs/              # Knowledge base (composite-ir/ most active)
├── configs/           # Shared eslint/tsconfig/ts-plugin configs
├── types/, types-local/  # Public .d.ts entry points
└── resources/         # Frozen game node data (3 large JSON files)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add new DSL API method | `src/definitions/nodes.ts` (regen via `npm run gen`) |
| Modify Stage 1 (TS→.gs.ts) | `src/compiler/ts_to_gs_transform/{stmt,expr,list_methods}.ts` |
| Modify Stage 2 (.gs.ts→IR) | `src/runtime/core.ts` (`MetaCallRegistry`, `buildServerGraphRegistriesIRDocuments`) + `src/runtime/ir_builder.ts` |
| Modify Stage 3 (IR→GIA) | `src/compiler/ir_to_gia_transform/{index,node_id,mappings,pins,layout,composite,optimize_timer_dispatch}.ts` |
| Modify injector | `src/injector/{index,binary,node_graph,folder,signal_nodes,proto}.ts` |
| Add CLI subcommand | `src/cli/gsts.ts` (subcommand anchors L1456-1517) |
| Add ESLint rule | Copy `src/eslint/rules/for-structure.ts` pattern → register in `src/eslint/index.ts` |
| Add composite node support | `src/runtime/composite_registry.ts` + `src/compiler/ir_to_gia_transform/composite.ts` + `docs/composite-ir/index.md` |
| Debug GIA binary | `tools/decode-gia.ts` (→ jq) + `tools/{analyze-gia-arch,topology,coverage,gap-scan}.ts` |
| Read user-facing template docs | `create-genshin-ts/templates/start/CLAUDE.md` + `docs/docs/{en,zh}/` |
| Cross-session memory | `.claude/memory/MEMORY.md` (read at session start) |

## CODE MAP (Top Cross-Cutting Files)

| File | Lines | Role | Importers |
|------|-------|------|-----------|
| `src/definitions/nodes.ts` | 16,567 | **GOD-FILE** (auto-gen): `class ServerExecutionFlowFunctions` (f.* API, 96% of file) | runtime, server_globals, entity_helpers, zh_aliases |
| `src/runtime/core.ts` | 1,664 | DSL runtime hub: `g = {server, defineComposite}`, `MetaCallRegistry`, `buildServerGraphRegistriesIRDocuments` | cli, definitions/nodes, gs_to_ir_json_transform, index.ts |
| `src/runtime/IR.d.ts` | 300 | **Typed contract** between Stage 1/2 (producers) and Stage 3 (consumer) | 5 directories: runtime, compiler, definitions, injector, index |
| `src/runtime/value.ts` | 879 | Value class hierarchy (int/float/str/vec3/dict/list/enumeration/...) | 18 files across 5 directories |
| `src/runtime/meta_call_types.ts` | 12 | `MetaCallRecord` shape — ties f.* + registry + IR builder + composite capture | runtime + definitions/nodes |
| `src/compiler/ir_to_gia_transform/index.ts` | 856 | `irToGia(ir, opts)` — Stage 3 main entry | ir_to_gia.ts pipeline |
| `src/compiler/ir_to_gia_transform/node_id.ts` | 643 | `resolveGiaNodeId` — type→node ID resolution (classic/beyond mode) | ir_to_gia_transform/{index,layout}, gia_vendor |
| `src/cli/gsts.ts` | 1,523 | CLI monolith: 31 top-level fns, 0 imports (entry point) | bin/gsts.mjs |
| `scripts/generate-definitions.ts` | 1,375 | `npm run gen` — reads resources/node_definitions.json → emits src/definitions/*.ts | npm script |

## CONVENTIONS (project-specific only)

- **Pipeline stages are out-of-process**: each stage spawns `tsx` children, `maxParallel = cpus-1`. IR data is the only typed hand-off (via `src/runtime/IR.d.ts`).
- **File suffix semantics**: `.ts` = user input, `.gs.ts` = Stage 1 emit, `.json` = IR, `.gia` = injectable binary. Pipeline has guard `if (p.endsWith('.gs.ts')) return false` to prevent re-processing.
- **Stage 1↔2 hand-off**: `// @gsts:entry` first-line marker (detected by `hasEntryMarker`).
- **Stage 3↔injector hand-off**: `_GSTS_<name>` graph name prefix (created in `shared.ts`; verified in `injector/index.ts`).
- **Runtime flags via env vars**: `GSTS_PRECOMPILE_EXPR`, `GSTS_REMOVE_UNUSED_NODES`, `GSTS_OPT_TIMER_DISPATCH`.
- **Imports**: relative paths with `.js` extension even for `.ts` source (e.g. `from './runtime_config.js'`). No `@/` alias. Use `node:fs`, `node:path`, `node:url` prefix.
- **Naming**: kebab-case dirs, snake_case files (`ts_to_gs.ts`, `ir_to_gia.ts`, `gia_vendor.ts`, `server_globals.ts`, `ir_builder.ts`). Constants like `DEFAULT_GSTS_SERVER_PREFIX = 'gstsServer'`.
- **gstsServer* prefix** is hard-detected by compiler (`GSTS_SERVER_PREFIX = 'gstsServer'` in `ts_to_gs_transform/index.ts:23`) AND by eslint (`ts_matchers.ts:3`).
- **Composite node IDs**: `1610700000+` range (assigned by `compositeRegistry.nextCompositeId`).
- **Graph IDs**: literal `1073741825+` (Tencent's 2^30+1 range). Generator reserves 1073741828-1073741852; same ID across `g.server()` calls tests multi-entry merge.
- **tsconfig non-defaults**: `rootDir: "."` (whole repo), `typeRoots: ["./types-local", "./node_modules/@types"]`, `composite: true`, `moduleResolution: bundler`. Excludes `tests/{generated,enum_cases,composite}` + `src/runtime/server_globals.d.ts`.
- **Prettier**: no semis, single quotes, 100 width, no trailing comma, `@ianvs/prettier-plugin-sort-imports` plugin.
- **No `any`** (warn). Branded value classes use `__brand*` private fields.
- **`create-genshin-ts/` is a separate npm package**, published independently. Two-package release in one workflow.

## ANTI-PATTERNS (THIS PROJECT)

**Banned in user DSL (`g.server().on(...)` body) — enforced by `gsts/*` ESLint rules:**
- `Promise`/`async`/`await` (rule: `no-promise`)
- `JSON.*`, `Object.*` (rules: `no-json`, `no-object-static`)
- Any string operation: template literals, `+` on strings, `String()` constructor, `String.x()` access (rule: `no-string-ops`)
- `??`, `instanceof`, `in` (rules: `no-nullish-coalesce`, `unsupported-binary-operator`)
- `try/throw/for..in/with/labeled/standalone-block` (rule: `no-unsupported-statement`)
- `while(true)` (rule: `no-while-true`); timers in loops (rule: `no-timer-in-loop`)
- Bare `{}` — use `dict()` or `raw()` (rule: `no-plain-object`)
- `undefined` return — use `!` (rule: `no-undefined-array-return`)
- List methods outside allowlist (`concat/forEach/includes/indexOf/map/filter/reduce/some/every/find/findIndex/push/pop/shift/unshift/slice/splice`) — no `.sort/.reverse/.flat/.join` (rule: `list-method-usage`)
- Math methods outside 23-method allowlist (rule: `builtin-math-support`)
- `console.log()` with != 1 arg (rule: `builtin-console-log-arity`)
- Float in integer arithmetic — use `bigint` (rule: `prefer-bigint`)
- Nested function/class in callbacks (rule: `no-inner-declarations`)
- `gsts.f` outside server scope (rule: `no-gsts-f-outside-server`)
- Recursive `gstsServer*` (rule: `no-gstsserver-recursion`)

**Banned shapes (compiler-enforced, also gstsServer*):**
- `gstsServer*` not top-level, with non-identifier params, with != 1 trailing return, or called outside server scope
- `for` loop not in canonical C-style `for(let i=0; i<N; i+=1)` form
- `switch` discriminant not int|str, multiple `default`, fallthrough body
- Assignment not to identifier/list-element, operator not in `= += -= *= /= %=`, assignment in expression position
- `bigint` index without `idx()` wrapper
- Conditions not boolean in if/while/ternary/! operand
- Timer callback capturing >1 outer scope level or reading outer event param directly
- `f.callComposite(...)` inside `g.defineComposite({ build: (args, f) => ... })` build callback (not yet supported)

**Code-level forbids:**
- `new <EnumCls>()` at runtime — all `src/definitions/enum.ts` constructors throw `you should not create an enum instance` (30+ classes).
- Hand-edit anything in `src/definitions/` — regenerate via `npm run gen`.
- Hand-edit anything in `src/thirdparty/` — vendored MIT data from `Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack`.
- Re-run pipeline on its own output (`.gs.ts`) — explicit guard in pipeline.
- `as any`, `@ts-ignore`, `@ts-nocheck` outside `src/thirdparty/`.
- `JSON.parse/stringify` in user DSL — but OK in host (compiler/injector/CLI) code.

**Style forbids (ESLint flat config):**
- `@typescript-eslint/no-explicit-any`: warn (not error).
- `ban-ts-comment`: ts-ignore/nocheck require description.
- Unused vars: warn with `argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'`.
- `no-var`: error. `no-debugger`: warn. `no-console`: off. `prefer-const`: off.
- `gsts/no-gsts-f-outside-server`: only `recommended` rule turned off in root config.

## UNIQUE STYLES

- **Compiler IS the test runner** — no vitest/jest/node:test. `npm test` = `pretest clean` + `build` + `generate-node-gia-tests` + `generate-enum-gia-tests` + `node ./bin/gsts.mjs -c gsts.test.config.ts`. A test "passes" if its TS compiles to `.gia` without error.
- **Two-mode value passing**: every coverage test exists as `*.literal.ts` (inline values) AND `*.wire.ts` (variable-passed). Tests probe both literal-pin and data-flow-pin IR→GIA paths.
- **`tests/composite/` is a separate harness** — uses `// @ts-nocheck`, imports from `../../dist/src/...`, calls `buildServerGraphRegistriesIRDocuments` + `irToGia` directly, writes `.gia` to `tests/composite/output/` (Chinese filenames allowed). NOT executed by gsts CLI.
- **`pretest` wipes** `tests/generated/` and `tests/enum_cases/` — only 4 hand-curated files survive: `mismatch_only.{literal,wire}.ts`, `enum_nodes_second.ts`, `enum_enumerationsEqual_wired.ts`.
- **`scripts/` vs `tools/`**: `scripts/` = CI/release (regen definitions, mass-produce tests, postbuild copy, assertions). `tools/` = interactive `npx tsx` GIA analysis (`decode-gia`, `analyze-gia-arch`, `analyze-composite-gia`, `topology`, `gap-scan`, `coverage`, `dump-layout`, `preview_markdown`).
- **Three language regimes**: ESLint rules accept `{ lang: 'zh' | 'en' | 'both' }` for bilingual error messages via `formatMessage(lang, zh, en)`.
- **f.* has 4 layers**: `class ServerExecutionFlowFunctions` (`definitions/nodes.ts:700`) + `ServerExecutionFlowFunctionsByMode<M>` mapped type + `NodeGraphVarApi<Vars>` augmentation (from `runtime/variables.ts`) + `SERVER_F_ZH_TO_EN` Chinese aliases (`definitions/zh_aliases.ts`) applied via `Object.defineProperty` in `core.ts:applyZhAliases`.
- **`globalThis.gsts`** is a singleton: `f` getter throws if read outside `server_*` ctxType. `serverRegistries: MetaCallRegistry[]` array collects all `g.server()` calls; `buildServerGraphRegistriesIRDocuments` flushes them all.
- **Value classes call back into f.***: `vec3.x/y/z` getters and `dict.get/set/has` all call `gsts.f.<method>()` — circular runtime dependency resolved by `f` being a lazy getter bound to the current registry.
- **Composite capture**: `__bootstrap__`, `__composite_capture__`, `__composite_call__` markers in MetaCallRecord drive Stage 2 BFS-DCE in `removeUnusedNodesFromFlow`.
- **Stage 3 numeric limits**: `MAX_TIMER_DISPATCH_CASES = 10` (game switch-case limit). `loopMax` default 999.
- **Vendored vs custom merge**: project merges Wu-Yijun's MIT reverse-engineered data with its own; `audit-vendor-gia-files.ts` checks for missing node records.
- **i18n exception**: only `en-US` and `zh-CN` supported. CLI auto-detects via `detectLang` (env → OS locale → Intl).

## COMMANDS

```sh
# Build
npm run build                # tsc -p tsconfig.json (wipes + postbuild copies .proto + .d.ts to dist/)

# Test (full cycle: clean + build + regen tests + compile)
npm test                     # pretest (clean-tests.mjs) + build + gen-node + gen-enum + gsts -c gsts.test.config.ts
npm run quicktest            # build + gsts -c gsts.test.config.ts (skip regen)

# Regenerate definitions (after updating resources/node_definitions.json)
npm run gen                  # generate-definitions.ts + prettier

# Dev / single-shot
npm run dev                  # build + gsts dev (chokidar watch, auto-inject)
npm run example              # build + gsts (no args, compile gsts.config.ts)
npm run to-gs                # tsx src/compiler/ts_to_gs.ts (Stage 1 only, debug)

# Trace
npm run trace-exec           # tsx tests/composite/trace-exec-flow.ts
npm run trace-dataflow       # tsx tests/composite/trace-dataflow.ts

# Lint (REQUIRES `npm run build` first — eslint loads from dist/)
npx eslint .

# Pack
npm run pack                 # build + npm pack (dry-run local)
```

## NOTES

- **bin/gsts.mjs is a 3-line shim** to `dist/src/cli/gsts.js`. Requires `npm run build` first. Published package ships the build artifact.
- **`tests/composite/` is excluded from tsc** (noUnusedLocals, exclude) but compiled manually via tsx.
- **Released via Changelog-driven workflow** (`.github/workflows/release.yml`): push to `Changelog.md` triggers version extraction via `scripts/release.mjs`. OIDC trusted publishing (no token). Two packages published in one job.
- **`.claude/memory/MEMORY.md` is the cross-session knowledge index** — read at session start per `.claude/init-instructions.md`.
- **`.claude/init-instructions.md` bootstrap order**: read CLAUDE.md → `.claude/memory/MEMORY.md` → `docs/composite-ir/todo.md` §6 → `/think-check` → `docs/composite-ir/index.md`.
- **`复杂gia/` is a WSL symlink** to Windows-side GIA samples used by `tools/`.
- **TS plugin**: `genshin-ts/configs/ts-plugin` is a bundled TS Language Service plugin (optional but recommended for bigint/index type hints).
- **Stage 2 child runner** does `await import(entryUrl)` — must use `pathToFileURL` to bridge. `gsts.config.ts` is loaded via `tsx` child process (not Node `require`).
- **vs code/IDE**: `types-local/gsts/index.d.ts` provides global declarations for `gsts`, `g`, `f`, `print`, `setTimeout`, `Mathf`, etc.
- **AGENTS.md/CLAUDE.md also exist at** `create-genshin-ts/templates/start/` (user-facing template guide, 55 + 82 lines).
- **No `CHANGELOG.md`** (file is `Changelog.md`). No `CONTRIBUTING.md`. No `.eslintrc*` (uses `eslint.config.mjs` flat config).
