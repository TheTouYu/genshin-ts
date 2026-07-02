# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
# Build (TypeScript compilation)
npm run build

# Full test cycle: build → generate test GIA → run compiler tests
npm test

# Quick test (skip test generation, run compiler tests only)
npm run quicktest

# Run ESLint
npx eslint .

# Generate definition files from node definitions JSON
npm run gen

# Build + inject (dev mode with file watching)
npm run dev

# Build + just compile entries (no inject)
npm run example

# Generate enums/lists tests
tsx scripts/generate-enum-gia-tests.ts
tsx scripts/generate-node-gia-tests.ts
```

Config file: `gsts.config.ts` (project), `gsts.test.config.ts` (testing).

## Architecture — Three-Stage Compilation Pipeline

Input: TypeScript files using the `g.server(...).on(...)` DSL or `gstsServer*` functions.

### Stage 1: TS → `.gs.ts` (`src/compiler/ts_to_gs_transform/`)
- A TypeScript AST transform (not emit).
- Transforms `g.server(...).on(...)` handler bodies, `gstsServer*` function bodies, and `setTimeout`/`setInterval` calls into node function call form (`.gs.ts`).
- Sub-transformers: `stmt.ts` (statements/control flow), `expr.ts` (expressions), `loops.ts` (for/while), `lists.ts` (list operations), `builtins.ts` (math/string/random builtins), `const_eval.ts` (constant folding).
- Runs per entry file via `ts_to_gs_pipeline.ts`.

### Stage 2: `.gs.ts` → IR JSON (`src/compiler/gs_to_ir_json_transform/`)
- Executes the compiled `.gs.ts` via `runner.ts` in Node.js.
- The runtime (`src/runtime/`) defines the DSL primitives: `g.server()` creates a `MetaCallRegistry`, `.on(event, handler)` registers event handlers. Inside handlers, `f.*` functions (from `nodes.ts`, via `ServerExecutionFlowFunctions`) emit `MetaCallRecord` nodes.
- `ir_builder.ts` converts the registry's raw `ExecutionFlow[]` into an `IRDocument` JSON (nodes, connections, variables).
- Output: IR JSON files in `dist/` alongside `.gs.ts`.

### Stage 3: IR JSON → GIA (`src/compiler/ir_to_gia_transform/`)
- Converts IR JSON to GIA protobuf binary (`.gia` files), the format the game can inject.
- `runner.ts` orchestrates, `mappings.ts` maps IR types → GIA node types, `pins.ts` handles argument encoding, `layout.ts` generates editor layout positions.
- `optimize_timer_dispatch.ts` aggregates multiple `whenTimerIsTriggered` handlers into a single switch.
- `composite.ts` expands composite node definitions into accessories.

### Injection (`src/injector/`)
- `index.ts`: reads `.gia` files and patches them into game `.gil` binary files via protobuf (GIA is a protobuf wrapper).
- `binary.ts`: low-level binary patching of GIL files.
- `proto.ts`: loads the protobuf schema (`.gia.proto`).
- `node_graph.ts`: node graph structure manipulation.
- `signal_nodes.ts`, `folder.ts`: signal and folder management in GIL.

## Key Source Directories

| Directory | Purpose |
|---|---|
| Directory | Purpose |
|---|---|
| `src/compiler/ts_to_gs_transform/` | TS AST → node function calls (Stage 1) |
| `src/compiler/gs_to_ir_json_transform/` | .gs.ts execution → IR JSON (Stage 2) |
| `src/compiler/ir_to_gia_transform/` | IR JSON → GIA binary (Stage 3) |
| `src/runtime/` | DSL runtime: `g.server()`, `g.defineComposite()`, `f.*` flow functions, typed values (`value.ts`), variables (`variables.ts`), IR builder (`ir_builder.ts`), composite nodes (`composite_registry.ts`) |
| `src/definitions/` | Auto-generated type definitions from `resources/node_definitions.json`: events (`events.ts`), nodes (`nodes.ts`), enums (`enum.ts`), entity helpers, Chinese aliases (`zh_aliases.ts`), prefabs (`prefabs.ts`) |
| `src/injector/` | GIA → GIL injection and binary patching |
| `src/cli/` | `gsts` CLI tool (compile, dev, inject, GIL resource extraction) |
| `src/eslint/` | ~40 custom ESLint rules for UGC DSL constraints |
| `src/thirdparty/` | Wu-Yijun's reverse-engineered node data (node IDs, pin records, enum IDs, protobuf schema) |
| `scripts/` | Build scripts, test generators, definition generators |
| `tests/` | Test `.ts` files compiled by the test pipeline |

## 知识体系（文档 → 工具 → 技能 → 记忆）

### 文档入口
- `docs/composite-ir/index.md` — 复合 IR 知识体系总入口（最活跃）
- `docs/architecture/` — 编译管线架构文档

### 分析工具
`tools/` 目录包含 7 个分析脚本：`decode-gia.ts`、`analyze-gia-arch.ts`、`analyze-composite-gia.ts`、`gap-scan.ts`、`coverage.ts`、`topology.ts`、`preview_markdown.ts`

### 技能
- `/think-check` — 思维纠偏技能，分析复杂问题时务必使用（基于以往 4 轮纠正经验设计）

### 跨会话记忆
项目 `.claude/memory/` 记录经验和教训。新会话先读 `MEMORY.md` 了解跨会话背景。
