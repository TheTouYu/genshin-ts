# Genshin-TS knowledge-domain map

This is the coverage index for the project knowledge system. It maps each major domain to authoritative documents, source entry points, tests/tools, and safety notes. It is a router, not a copy of the knowledge base.

| Domain | Authoritative docs | Source entry points | Tests/tools | Special boundary |
|---|---|---|---|---|
| Project overview | `README_ZH.md`, `docs/README.md`, `AGENTS.md` | `src/`, `scripts/`, `tools/` | `npm run build` | `create-genshin-ts/` is an independent package |
| User DSL | `create-genshin-ts/templates/start/README_ZH.md`, template `CLAUDE.md`/`AGENTS.md`, `docs/docs/zh/` | `src/runtime/core.ts`, `server_globals.ts`, `value.ts`, `src/definitions/` | `tests/other/`, `tests/gsts_server_*` | User code is a restricted TS subset |
| Compiler pipeline | `docs/architecture/compilation-pipeline-overview.md`, `stage1-ts-to-gs.md`, `stage2-gs-to-ir.md`, `stage3-ir-to-gia.md` | `src/compiler/ts_to_gs_pipeline.ts`, `gs_to_ir_json_transform/`, `ir_to_gia_pipeline.ts`, `ir_to_gia_transform/` | stage outputs `.gs.ts`, `.json`, `.gia` | Preserve stage boundaries and suffixes |
| Runtime / IR | `docs/architecture/runtime-dsl.md`, `ir-control-data-flow.md`, composite `ir-representation.md` | `src/runtime/core.ts`, `IR.d.ts`, `ir_builder.ts`, `composite_registry.ts`, `value.ts` | `tests/`, focused composite tests | `IR.d.ts` is the typed cross-stage contract |
| Composite API / capture | `docs/architecture/composite/`, `docs/composite-ir/index.md` | `core.ts`, `composite_registry.ts`, `ir_to_gia_transform/composite.ts` | `tests/composite/` | Separate current API, real GIA, and history |
| Composite Stage 3 redesign | `docs/composite-ir/architecture-redesign/` | `src/compiler/ir_to_gia_transform/index.ts`, `composite.ts`, `node_id.ts`, `pins.ts`, vendor `gia_gen/graph.ts` | root/impl parity fixtures, typed-node contracts, focused composite tests | Planning is not current implementation; preserve nested/capture/sparse/metadata baselines and distinguish vendor encoding from real-GIA evidence |
| GIA / protobuf / vendor schema | `stage3-ir-to-gia.md`, `definition-system.md`, `debugging-gia-encoding-methodology.md`, `composite-ir/05-gia-encoding.md`, relevant retrospectives | `src/thirdparty/.../protobuf/`, `gia_vendor.ts`, Stage 3 | `tools/decode-gia.ts`, wire/round-trip regressions | JSON defaults do not prove field presence; vendor files have maintenance rules |
| Definitions / vendor data | `docs/architecture/definition-system.md`, `docs/maintenance/routine-node-maintenance.md` | `src/definitions/`, `src/thirdparty/.../node_data/`, `scripts/generate-definitions.ts` | `npm run gen`, consistency scripts | Do not hand-edit `src/definitions/` or `src/thirdparty/` |
| Client node support | `docs/architecture/client-node-support-plan.md` | planned: `src/runtime/IR.d.ts`, `core.ts`/client registry, Stage 1 client context, Stage 3 client lowering, fixed vendor client snapshot | two real 6.7 client skill GIA WP0 baselines, focused IR/GIA tests, editor import/export structural diff, game behavior verification | WP0 sample analysis is complete but production support has not started; each later work package remains gated; no client injection or target-ID guessing |
| CLI / config / build orchestration | `README_ZH.md`, `docs/architecture/injector-system.md`, relevant config docs | `src/cli/gsts.ts`, `gsts_config.ts`, `config_loader.ts`, `gil_paths.ts`, `data.ts` | `gsts maps`, `gsts dev`, `quicktest` | Map selection and file operations require confirmation |
| Injector / GIL | `docs/architecture/injector-system.md`, `src/injector/AGENTS.md` | `src/injector/index.ts`, `binary.ts`, `node_graph.ts`, `folder.ts`, `signal_nodes.ts` | focused inject tests and pre/post file checks | Never casually bypass `_GSTS` safety checks |
| Real GIA analysis / tools | `docs/gia-tools-reference.md`, `docs/composite-ir/analyze-workflow.md`, `composite-ir/index.md` | `tests/composite/trace-*.ts`, `tools/*.ts` | trace/decode/diff/topology/coverage | Record file, command, observation, scope |
| Testing / validation | `docs/architecture/composite/testing.md`, `tests/AGENTS.md`, `package.json` | `scripts/generate-*`, test runners | `npm run build`, `npm test`, `npm run quicktest`, focused tests | Build, automatic regression, injection, and game verification are distinct |
| ESLint / TS subset | template ESLint docs, `README_ZH.md`, `configs/eslint/` | `src/eslint/`, `configs/`, compiler transforms | ESLint and compile diagnostics | No Promise/async, recursion, unsupported JS constructs, or unrestricted JSON |
| Template package | `create-genshin-ts/README.md`, `create-genshin-ts/templates/start/README_ZH.md` | `create-genshin-ts/bin/`, templates | package-specific checks | Independent npm package; do not assume root config applies |
| Game map / injection | `docs/architecture/injector-system.md`, `composite-ir/handover/layout-working-rules.md` | `src/cli/gil_paths.ts`, `src/cli/gsts.ts`, `src/injector/` | `gsts maps`, single-file injection | `mapId` differs from `nodeGraphId`; destructive operation confirmation required |
| Physical-motion recreation | `docs/composite-ir/physics-motion-recreate-guide.md`, latest physics handover | `tests/layout/physics-motion/`, `gsts.physics-motion.config.ts` | generation, focused regressions, game validation | Multi-file output should use single-file GIA injection |
| Documentation governance | `docs/documentation-governance.md`, `documentation-map.md`, handover README | `.agents/skills/composite-docs-*` | `git diff --check`, link/path checks | Historical docs are not current API authority |
| Engine API usage/search | `docs/architecture/docs-search.md`, user docs, template docs; project skill `.agents/skills/miliastra-knowledge/` for external official node-rule lookup | `src/docs_search/engine_api.ts`, `resources/node_definitions.json`, `src/definitions/` (read-only), `miliastra-knowledge` HTTPS query tools | `npm run docs:index`, `npm --silent run docs:search -- ... --json`, skill `get_node_info/get_document/rag_search` | Search ranking and external documentation do not prove GIA wire or game behavior; signatures are not game verification; skill is read-only and never authorizes injection |
| Maintenance / release | `docs/maintenance/`, `Changelog*.md`, release workflow | `scripts/release.mjs`, `scripts/generate-definitions.ts`, `.github/workflows/` | maintenance scripts, release checks | Generated/vendor content must follow regeneration/sync process |

## Coverage rule

A domain is considered routed only when the navigator can identify:

1. its current authoritative document;
2. its source entry point;
3. its test/tool entry point when one exists;
4. its special safety or evidence boundary.

Do not load every row for every task. Load the smallest relevant set of modules and then follow the authoritative project documents.
