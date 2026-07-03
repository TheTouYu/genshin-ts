# Genshin-TS (gsts) — Reasonix Context

## Stack

- **TypeScript 5.9** — `esnext` target, `bundler` module resolution
- **Node.js** — runtime; `tsx` runs TS scripts; `commander` powers the CLI
- **protobufjs** — GIA binary serialization for game injection
- **Zod** — config/schema validation; **Chokidar** — file watching (dev mode)
- **ESLint 9** flat config + ~40 custom gsts rules for UGC DSL constraints
- **Prettier** with `@ianvs/prettier-plugin-sort-imports` — import ordering

## Layout

| Path | Purpose |
|---|---|
| `src/compiler/` | 3-stage pipeline: TS→.gs.ts (AST transform) → IR JSON (execution) → GIA binary |
| `src/runtime/` | DSL primitives: `g.server()`, `f.*` flow functions, IR builder, composite registry |
| `src/injector/` | GIA→GIL binary patching, protobuf schema, node graph manipulation |
| `src/cli/` | `gsts` CLI tool (compile, dev, inject, GIL resource extraction) |
| `src/definitions/` | Auto-generated from `resources/node_definitions.json`: nodes, events, enums, aliases, prefabs |
| `src/eslint/` | Custom ESLint rules for UGC DSL semantic constraints |
| `bin/` | CLI entry point (`gsts.mjs`) |
| `scripts/` | Build / test-generation scripts + definition generators |
| `tests/` | Test `.ts` files compiled by the test pipeline |
| `resources/` | Authoritative node definitions JSON (source of truth for codegen) |
| `tools/` | Analysis scripts: decode-gia, topology, coverage, gap-scan, etc. |
| `docs/` | Documentation site (rspress) |
| `configs/` | ESLint config presets, tsconfig presets, TS-plugin config |

## Commands

| Command | Action |
|---|---|
| `npm run build` | `tsc -p tsconfig.json` (clean dist first) |
| `npm test` | build → generate node GIA tests → generate enum GIA tests → run compiler tests |
| `npm run quicktest` | build → run compiler tests (skip test generation) |
| `npm run gen` | Generate definitions from `resources/node_definitions.json` + prettier |
| `npm run dev` | build → inject with file watching |
| `npm run example` | build → compile entries only (no inject) |
| `npm run to-gs` | Run TS→.gs.ts transform standalone |

## Conventions

- **Import specifiers** use `.js` extension (`'../compiler/config_loader.js'`) — this is a bundler-module project.
- **Named exports only** in `src/` — no `export default`.
- **Import order** (enforced by Prettier): builtins → third-party → relative.
- **Prettier**: single quotes, no semicolons, trailing comma `none`, printWidth 100, LF eol.
- **ESLint** flat config (`eslint.config.mjs`) with custom `gsts` plugin loaded from compiled `dist/`.

## Watch out for

- **`tests/generated/`, `tests/enum_cases/`, `tests/composite/output/`** are generated — do not edit by hand.
- **`src/runtime/server_globals.d.ts`** is excluded from `tsconfig.json` include.
- **`resources/node_definitions.json`** is the authoritative source — definitions in `src/definitions/` are auto-generated via `npm run gen` and overwritten.
- **Test pipeline requires generated GIA test files** — `npm run quicktest` skips generation; `npm test` regenerates them first.
