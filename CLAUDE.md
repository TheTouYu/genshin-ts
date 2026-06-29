# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

genshin-ts (gsts) is a TypeScript toolchain that compiles TypeScript into Genshin Impact UGC (Miliastra Wonderland) node graphs. It transforms TS source into `.gia` binary files that can be injected into the game's `.gil` level files.

## Build & Test Commands

```bash
npm run build          # TypeScript compilation (tsc -p tsconfig.json)
npm test               # Full test suite: build → generate tests → compile test entries
npm run quicktest      # Build + compile test entries (skip test generation)
npm run gen            # Regenerate definitions from vendor sources
npm run example        # Build + compile example entries
npm run dev            # Build + watch mode (incremental)
```

`npm test` runs: `build` → `generate-node-gia-tests.ts` → `generate-enum-gia-tests.ts` → `gsts -c gsts.test.config.ts`. There is no Jest/Vitest — tests are `.ts` files under `tests/` that get compiled by gsts itself; pass/fail is determined by whether compilation succeeds.

## Compilation Pipeline

The pipeline has three stages:

1. **TS → .gs.ts** — `src/compiler/ts_to_gs_pipeline.ts` + `ts_to_gs_transform/`  
   Transforms TypeScript source into "graph script" (.gs.ts) files. Uses the TS compiler API to parse source, then a custom transform that rewrites `g.server(...).on(...)` chains and `gstsServer*` functions into node function calls (builtins, operations, control flow, list methods, loops, expressions, etc.).

2. **.gs.ts → IR JSON** — `src/compiler/gs_to_ir_json_transform/`  
   Executes the `.gs.ts` files to produce IR JSON — an intermediate representation with explicit nodes and connections. This is the primary debugging output.

3. **IR JSON → .gia** — `src/compiler/ir_to_gia_transform/`  
   Converts IR JSON into binary `.gia` files. Sub-steps: preprocess, mappings (TS→GIA node type), node ID/vendor resolution, pin layout, composite handling, timer optimization, JSON output.

### Entry Points

- CLI: `bin/gsts.mjs` → `src/cli/gsts.ts` (commander.js-based)
- Library: `src/index.ts` — exports `compileTsToGs`, `emitIrJsonForEntries`, `writeGiaFromIrJsonFile`, `createInjector`, `defineComposite`

### Configuration

`gsts.config.ts` at project root. Fields: `compileRoot`, `entries` (glob patterns), `outDir`, `inject` (gameRegion, playerId, mapId), `options.optimize` (precompileExpression, removeUnusedNodes, timerPool, timerDispatchAggregate).

## Key Source Directories

| Directory | Purpose |
|---|---|
| `src/compiler/` | Pipeline orchestration, config loader, IR merge |
| `src/compiler/ts_to_gs_transform/` | Stage 1: TS AST → .gs.ts transform |
| `src/compiler/gs_to_ir_json_transform/` | Stage 2: .gs.ts → IR JSON (execution) |
| `src/compiler/ir_to_gia_transform/` | Stage 3: IR JSON → .gia (mappings, pins, layout, composites, timer opt) |
| `src/runtime/` | DSL layer — `core.ts` (g.server/gstsServer API), `value.ts` (type system), `ir_builder.ts`, `composite_registry.ts`, `server_globals.ts` |
| `src/definitions/` | Game type definitions — `nodes.ts`, `events.ts`, `enums.ts`, entity helpers, Chinese aliases, prefab IDs |
| `src/injector/` | Binary injection — parse/edit .gil files, protobuf encode/decode, signal patching |
| `src/cli/` | CLI commands — build, inject, dev/watch, checks, GIL resource extraction, state |
| `src/eslint/` | Custom ESLint rules for semantic constraints |
| `src/thirdparty/` | Node editor pack — GIA code generation from vendor source data, protobuf schemas (`gia.proto.ts`) |
| `tests/` | Test cases (compiled by gsts itself). Subdirs: `composite/`, `generated/`, `enum_cases/`, `risk/`, `other/` |
| `scripts/` | Build helpers: code generation, assertions, test generation, postbuild, release |
| `scripts/testgen/` | Test generation engine — extracts server F methods, emits calls with value producers and output consumers |

## Value Type System

Defined in `src/runtime/value.ts`. Core types: `bool`, `int`, `float`, `str`, `vec3`, `guid`, `entity`, `prefabId`, `configId`, `faction`, `struct`, `dict`, `enum`. Each has a corresponding list variant (`bool_list`, `int_list`, etc.). Factory functions: `int(42)`, `str("hello")`, `vec3(x,y,z)`, `entity(id)`, etc.

## Composite Node Support

Reusable sub-graphs defined via `g.defineComposite(name, def)` and invoked via `f.callComposite(handle, params)`. Runtime capture in `src/runtime/composite_registry.ts`, IR embedding via `CompositeDefIR` / `CompositeCallMeta` types, GIA transform in `src/compiler/ir_to_gia_transform/composite.ts`.

## Test Architecture

- **Generated tests** (`tests/generated/`): Auto-generated from node definitions by `scripts/generate-node-gia-tests.ts`. Each generated file exercises a subset of server F methods with typed arguments.
- **Manual tests** (`tests/` root): Hand-written tests for specific features — composite nodes, timers, loops, variable semantics, collection rebinding, list methods, bitwise operators, ESLint rules, etc.
- **Assertion scripts** (`scripts/assert-*.ts`): Run separately via `tsx` to verify specific compilation behaviors.
- The test config (`gsts.test.config.ts`) points compileRoot at `.` and entries at `./tests`.
