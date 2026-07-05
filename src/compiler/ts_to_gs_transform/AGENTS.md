# src/compiler/ts_to_gs_transform/ — Stage 1: TS AST → .gs.ts

## OVERVIEW
TS Compiler-API `TransformerFactory`. Transforms `g.server(...).on(...)` handler bodies, `gstsServer*` function bodies, and `setTimeout`/`setInterval` calls into `f.xxx(...)` node-call form (`.gs.ts`).

## STRUCTURE (14 files)
| File | Lines | Role |
|------|-------|------|
| `index.ts` | 497 | Entry: `transformToGs` factory; defines `GSTS_SERVER_PREFIX='gstsServer'`, validates gstsServer usage, detects recursion |
| `stmt.ts` | **1,663** | **GOD-FILE** — `transformBlockStatements` (460 LoC dispatcher), `transformBlock`, `transformGstsServerFunction`, `transformHandler` |
| `expr.ts` | **2,150** | **GOD-FILE** — `transformExpression` (660 LoC dispatcher), timer-handle capture, enum/vec3/type inference helpers |
| `list_methods.ts` | **1,206** | **HOTSPOT** — `tryTransformListMethodCall` (1,170 LoC dispatcher) for `.map/.filter/.reduce/.find/.some/.every` |
| `loops.ts` | 330 | for/while/do/for-of → bounded loop arrow with `breakLoop` param |
| `builtins.ts` | 597 | Math.* / Number.* / String.* / BigInt / parseInt / random → f.* |
| `const_eval.ts` | 268 | Compile-time const folding: literals, const aliases, nested `as const` object members |
| `lists.ts` | 76 | List element-type inference from TS type node/string (vec3/guid/entity/prefabId/configId/faction) |
| `list_utils.ts` | 200+ | List element-type inference from expression; IIFE wrapping, `makeLocalVarInit` |
| `ops.ts` | 100+ | Operator tables: binary/compound/support checks |
| `matcher.ts` | 100+ | `isFObjectExpression`, `isServerOnCall`, `isServerInstanceExpression` predicates |
| `types.ts` | 100+ | `Env`, `VarPlan`, `VarPlanEntry`, `CollectionSourceKind` |
| `utils.ts` | 100+ | `makeFCall`, `withSameRange`, `asBlock`, `isTrueLike` |
| `errors.ts` | small | `fail()` / `warn()` — `[error] msg\n  at file:line:col (Kind)` |

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a new expression type | `expr.ts:transformExpression` (extend dispatcher), add predicate in `matcher.ts` |
| Add a new statement kind | `stmt.ts:transformBlockStatements` (extend dispatcher) |
| Add a list method | `list_methods.ts:tryTransformListMethodCall` + ESLint allowlist in `src/eslint/utils/list_methods.ts` |
| Add a Math/builtin | `builtins.ts:tryTransformBuiltinCall` |
| Change const folding | `const_eval.ts` |
| Add new loop lowering | `loops.ts` |
| Change var plan | `types.ts:VarPlan` + `stmt.ts:buildVarPlan` |
| Add a new `// @gsts:` marker | `ts_to_gs_pipeline.ts:357` (`// @gsts:entry`) + corresponding handler in `index.ts` |

## CONVENTIONS
- `Env` is threaded through every transform; carries `fIdent`, `serverCtx`, `featureFlags`, `config`, `varPlan`, `timerCaptureMap`.
- `// @gsts:entry` is a first-line marker set in `ts_to_gs_pipeline.ts` and detected in `gs_to_ir_json_transform/index.ts` (via `hasEntryMarker`).
- Errors use positional format: `[error] <msg>\n  at <file>:<line>:<col> (<ts.SyntaxKind>)`. See `errors.ts:fail()`.
- `Env.fIdent` is a per-handler identifier; not always named `f`. Match by `isFObjectExpression`, not by name.
- `gstsServer*` is a TYPE-LEVEL concept in this dir; runtime never sees it. Compiler hoists `function gstsServerFoo(...)` declarations out and replaces body with a node-graph `GSTS_Server` call node.

## KEY EXPORTS (public)
- `transformToGs(program, options): TransformerFactory<SourceFile>` (`index.ts`)
- `transformBlockStatements(stmts, ctx)` (`stmt.ts`)
- `transformBlock(block, ctx)` (`stmt.ts`)
- `transformGstsServerFunction(fn, ctx)` (`stmt.ts`)
- `transformHandler(name, fn, ctx)` (`stmt.ts`)
- `transformExpression(expr, ctx)` (`expr.ts`)
- `tryTransformListMethodCall(call, ctx)` (`list_methods.ts`)
- `tryTransformBuiltinCall(expr, ctx)` (`builtins.ts`)
- `extractTimerHandleMeta`, `recordTimerHandleMeta`, `propagateTimerHandleMeta` (`expr.ts`)
- `isDeclarationName` (`expr.ts`)

## ANTI-PATTERNS
- Do NOT add `any` to transform internals — TS is strict here.
- Do NOT use `JSON.*` in this directory — `gsts/no-json` rule applies to any `gsts/*` project loading this code, even though the rule scope is `'server'`. Stay disciplined.
- Do NOT add try/throw/with/labeled (Stage 1 doesn't transform these).
- `transformBlockStatements` and `transformExpression` are already 460/660 LoC — DO NOT add to them without splitting. Per-kind split is the right refactor.
- The `matcher.ts` predicates MUST be safe for the `// @ts-nocheck`-decorated `server_globals.d.ts`; do not import types from there.

## NOTES
- Stage 1 is the biggest source of compiler complexity. Three files own 95% of it (`stmt.ts`, `expr.ts`, `list_methods.ts`).
- `Env.featureFlags` gates DSL features via `GstsConfig.options.features` (e.g. `nullishCoalesce`, `ternary`, `switch`, `destructuring`).
- `precompileExpression` (env `GSTS_PRECOMPILE_EXPR`, default true) drives `const_eval.ts`.
- `removeUnusedNodes` happens in Stage 2 (`runtime/core.ts:removeUnusedNodesFromFlow`); Stage 1 only emits source.
- Imports: relative paths with `.js` extension; uses `src/shared/{ts_type_utils,ts_list_utils,type_string_utils}` (shared with eslint plugin).
