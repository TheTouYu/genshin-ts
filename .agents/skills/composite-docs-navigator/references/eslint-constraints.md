# ESLint and TypeScript-subset route

Use this module for unsupported syntax, compile diagnostics, ESLint rules, or template authoring constraints.

## Authoritative sources

- `README_ZH.md` usage limitations.
- `create-genshin-ts/templates/start/README_ZH.md` and `eslint.config.mjs`.
- `configs/eslint/recommended.mjs`, `configs/eslint/full.mjs`.
- `src/eslint/` rules and utilities.
- `docs/architecture/stage1-ts-to-gs.md` for transform boundaries.

## Core constraints to check

The user-facing language is a restricted TypeScript subset. Common constraints include:

- no Promise/async/await in graph code;
- no recursion;
- boolean conditions must be valid boolean expressions;
- `gstsServer*` return shape is restricted;
- `console.log` and built-in wrappers have supported arities;
- list callbacks, list methods, timer callbacks, and timer frequency have signature/usage rules;
- unrestricted JSON, plain objects, unsupported operators, and unsupported statements are rejected in graph scope.

Do not guess whether a syntax feature is supported. Inspect the relevant rule and transform implementation, then run a minimal compile/ESLint reproduction.

## Scope boundary

These restrictions apply to user graph code, not every host-side CLI/compiler file. Distinguish compiler host code from code executed in the generated graph.
