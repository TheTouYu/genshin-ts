# src/eslint/ — 37 Custom DSL Rules

## OVERVIEW
Custom ESLint plugin enforcing UGC DSL semantic constraints. 38 rule files in `rules/` + 10 utility files in `utils/`. Registered in `index.ts` and grouped in `configs.recommended` (35 rules in recommended config; most `'error'`, a few `'warn'`). Loaded from `dist/src/eslint/index.js` post-build, so **`npm run build` is required before `npx eslint .`**.

## STRUCTURE
```
src/eslint/
├── index.ts                 # registers 38 rules; exports `rules` map + `configs.recommended`
├── rules/                   # 38 kebab-case rule files
│   ├── gstsserver-*         # 5 rules for gstsServer function shape
│   ├── list-*               # 7 rules for list/array operations
│   ├── timer-*              # 4 rules for setTimeout/setInterval semantics
│   ├── builtin-*            # 3 rules for Math/console/wrapper
│   ├── prefer-*             # 2 rules for style suggestions
│   ├── no-*                 # 12 rules forbidding features
│   └── misc                 # 7: assignment-restrictions, unsupported-binary-operator, ternary-branch-type, require-boolean-condition, switch-restrictions, for-structure, bigint-index-in-server
└── utils/                   # 10 shared helpers
    ├── parser.ts            # bridges to @typescript-eslint/parser parserServices (~20 rules use)
    ├── scope.ts             # buildServerScopeIndex, isServerScopeFunction, isInServerScope (~25 rules use)
    ├── ts_matchers.ts       # isGstsServerName, isGstsServerSymbol, isServerOnCall (~12 rules use)
    ├── options.ts           # BaseOptions {lang, scope, includeNestedFunctions}; readBaseOptions
    ├── messages.ts          # formatMessage(lang, zh, en) — bilingual error messages
    ├── types.ts             # isAnyOrUnknown, getNumericKind, isPossiblyUndefined, isBooleanType, ...
    ├── list_methods.ts      # SUPPORTED_LIST_METHODS (19 names), CALLBACK_METHODS (8 names)
    ├── ast.ts               # isIdentifier, isStringLiteral, isBooleanLiteral, getMemberName, isFunctionNode
    ├── list.ts              # re-export barrel for src/shared/{ts_list_utils,type_string_utils}
    └── type_position.ts     # isInTypePosition(node)
```

## RULE CATEGORIES (38 total)
| Category | Rules | Severity |
|----------|-------|----------|
| **gstsserver** shape | `gstsserver-call-scope`, `gstsserver-params`, `gstsserver-return`, `gstsserver-top-level`, `no-gstsserver-recursion` | error |
| **list** ops | `list-callback-return`, `list-callback-signature`, `list-method-type-constraints`, `list-method-usage`, `list-type-annotation`, `no-spread-array-without-type`, `no-undefined-array-return` | error/warn |
| **timer** semantics | `no-timer-in-loop`, `timer-callback-signature`, `timer-interval-frequency`, `timer-outer-capture` | error/warn |
| **builtin** wrappers | `builtin-console-log-arity`, `builtin-math-support`, `builtin-wrapper-arity` | error |
| **prefer** suggestions | `prefer-bigint`, `prefer-const-outside-server` | warn |
| **no-** forbids | `no-gsts-f-outside-server`, `no-inner-declarations`, `no-json`, `no-nullish-coalesce`, `no-object-static`, `no-plain-object`, `no-promise`, `no-string-ops`, `no-timer-in-loop`, `no-undefined-array-return`, `no-unsupported-statement`, `no-while-true` | error/warn |
| **misc** | `assignment-restrictions`, `unsupported-binary-operator`, `ternary-branch-type`, `require-boolean-condition`, `switch-restrictions`, `for-structure`, `bigint-index-in-server` | error/warn |

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a new DSL rule | Copy `rules/for-structure.ts` pattern → register in `index.ts` (rules + `configs.recommended`) → use `formatMessage(options.lang, '<中文>', '<English>')` |
| Change rule severity | `index.ts:configs.recommended.rules` |
| Find which rule bans X | Grep `rules/*.ts` for the message; or check `formatMessage` call sites |
| Find which rule shape constraints are enforced | `utils/scope.ts` (server-scope detection) + `utils/ts_matchers.ts` (gstsServer prefix) |
| Change error message language | `formatMessage(lang, zh, en)` in each rule; `lang: 'zh' \| 'en' \| 'both'` (default `'both'`) |
| Find the list method allowlist | `utils/list_methods.ts:SUPPORTED_LIST_METHODS` (19 names) |
| Find the Math method allowlist | `rules/builtin-math-support.ts` (23 methods) |
| Find the gstsServer prefix | `utils/ts_matchers.ts:DEFAULT_GSTS_SERVER_PREFIX = 'gstsServer'` |

## CONVENTIONS
- Naming: `kebab-case.ts` for rule files, matching the rule ID (e.g. `no-promise.ts` → `gsts/no-promise`).
- Each rule exports a `Rule.RuleModule` with `meta: { type, docs: { description, category }, messages`, `create(context)`.
- All messages emitted via `formatMessage(options.lang, '<中文>', '<English>')`; `lang: 'zh' | 'en' | 'both'` (default `'both'`) controls output.
- Bilingual error format: `formatMessage('zh')` → Chinese; `formatMessage('en')` → English; `formatMessage('both')` → `ZH: ...\n\nEN: ...`.
- Most rules use `utils/scope.ts:buildServerScopeIndex` to detect server-scope; outside-server rules use `isInServerScope`.
- `utils/ts_matchers.ts` is near-duplicate of logic in `compiler/ts_to_gs_transform/index.ts` (lines 22-77) — both define their own `isGstsServerName` etc. Stage-1 compiler does NOT import from `eslint/utils/ts_matchers.ts` (and vice versa), so this is duplication, not sharing.
- `utils/parser.ts` bridges to `@typescript-eslint/parser` parserServices; many rules need this for type-aware checks.
- The only `recommended` rule turned off in root config: `gsts/no-gsts-f-outside-server` (templates keep it on).

## KEY EXPORTS (public)
- `rules` (Record<string, RuleModule>) (`index.ts`)
- `configs.recommended` ({ plugins, rules }) (`index.ts:81-125`)

## ANTI-PATTERNS
- Do NOT add a rule without using `formatMessage(lang, zh, en)` — the bilingual pattern is project-wide.
- Do NOT register a rule in `rules` but not in `configs.recommended` — it becomes unreachable.
- Do NOT add `any` to rule internals.
- Do NOT use `JSON.*` or `Promise` in rule logic.
- Do NOT skip `utils/scope.ts` — most server-scope detection depends on it.
- Do NOT add a rule that fires outside server scope unless explicitly intended (e.g. `prefer-const-outside-server` is intentional).
- Do NOT bypass `formatMessage` and inline strings — it breaks i18n.

## NOTES
- The biggest rule is `switch-restrictions.ts` (363 lines) — the second-largest ESLint rule file in the repo.
- `utils/scope.ts:buildServerScopeIndex` is the most-imported utility (~25 of 38 rules).
- Adding a new list method requires updating BOTH `utils/list_methods.ts:SUPPORTED_LIST_METHODS` AND `compiler/ts_to_gs_transform/list_methods.ts:tryTransformListMethodCall`.
- Adding a new Math method requires updating `rules/builtin-math-support.ts` and `compiler/ts_to_gs_transform/builtins.ts:tryTransformBuiltinCall`.
- `rules/builtin-math-support.ts` has 23 allowed Math methods with exact-arity rules: abs/floor/ceil/round/trunc/pow/sqrt/log/log10/log2/sin/cos/tan/asin/acos/atan/random/min/max/hypot/sign/cbrt/atan2.
- `utils/list_methods.ts:SUPPORTED_LIST_METHODS`: concat/forEach/includes/indexOf/map/filter/reduce/some/every/find/findIndex/push/pop/shift/unshift/slice/splice (19 names). `.sort/.reverse/.flat/.join/.keys/.values/.entries` are NOT in the list.
- Plugin loaded from `dist/src/eslint/index.js` (postbuild), so `npm run build` is required before `npx eslint .`.
