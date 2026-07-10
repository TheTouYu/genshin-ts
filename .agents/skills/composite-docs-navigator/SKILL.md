---
name: composite-docs-navigator
description: Use the Genshin-TS composite documentation knowledge system before implementing new features, fixing bugs, investigating composite nodes, raw control-flow DSL, IR/GIA encoding, trace tools, or real GIA behavior. Trigger this skill whenever the task mentions composite nodes, defineComposite/callComposite, raw control flow, f.entry/f.node/f.link/f.inflow/f.outflow, GIA reverse engineering, trace-exec-flow, trace-dataflow, docs/composite-ir, docs/architecture/composite, or asks where to look. This skill helps quickly find the right trusted docs and separates current implementation, verified real-GIA conclusions, historical records, and speculation.
---

# Composite Docs Navigator

Use this skill to consult the project’s composite-node knowledge base before changing code or drawing conclusions. The goal is to avoid stale handover context and quickly route the task to the current trusted document set.

## Core rule

Start from the governance layer, not from random `rg` hits:

1. Read `docs/documentation-map.md` for task-to-document routing.
2. Read `docs/documentation-governance.md` for source/status rules and API-name migration rules.
3. Then read only the task-relevant current docs.
4. Use handover files only for history, never as the current API source.

## Source separation

Always classify findings by source:

| Source | Meaning | How to use |
|---|---|---|
| Current implementation | Current gsts source behavior | Use for code changes and API behavior. Verify with source/test files before editing. |
| Real GIA verification | Observed game/editor `.gia` files | Use for editor behavior, reverse-engineered patterns, and validation expectations. Record file + command. |
| Historical record | Handover, old plans, bug-fix notes | Use for why decisions happened, not as current instructions. |
| Speculation / pending | “感觉正确”, “待验证”, TODO/gap docs | Treat as hypothesis; verify before relying on it. |

If sources conflict, state the conflict explicitly instead of merging them into one conclusion.

## Recommended routing

### Current APIs and code-facing behavior

Read these first for implementation or bug fixes:

- `docs/architecture/composite/raw-control-flow-dsl-quickstart.md` — current low-level manual wiring API.
- `docs/architecture/composite/dsl-api.md` — `g.defineComposite`, `f.callComposite`, nested composites, type and call semantics.
- `docs/architecture/composite/control-flow-api-cookbook.md` — sequential execution, multi-OutFlow dispatch, and verified control-flow patterns; always read it for `顺序执行` tasks.
- `docs/architecture/composite/capture-mechanism.md` — Stage 2 capture behavior.
- `docs/architecture/composite/ir-representation.md` — current IR shape and caveats.
- `docs/architecture/composite/gia-encoding.md` — Stage 3 GIA encoding.
- `docs/architecture/composite/pipeline-flow.md` — end-to-end flow.
- `docs/architecture/runtime-dsl.md` — broader runtime/DSL architecture.

Then verify against source files when needed:

- `src/runtime/core.ts`
- `src/runtime/composite_registry.ts`
- `src/runtime/IR.d.ts`
- `src/definitions/nodes.ts`
- `src/compiler/ir_to_gia_transform/index.ts`
- `src/compiler/ir_to_gia_transform/composite.ts`
- `tests/composite/test-nested-composite-outflow.ts`

For `顺序执行`, nested composite OutFlow, or detached composite wiring, verify all three layers before claiming a gap:

1. Current docs: `raw-control-flow-dsl-quickstart.md`, `dsl-api.md`, and `control-flow-api-cookbook.md`.
2. Current source signatures: `declareDetached`, `link`, `outflow`, and Stage 3 `buildImplNodePins`.
3. Focused tests: `test-phase1-system-nodes.ts`, `recreate-debug4-v2.ts`, and `test-nested-composite-outflow.ts`.

If current docs conflict internally, do not select the more restrictive statement by default. State the conflict, verify source plus executable regression, then update the stale authoritative paragraph.

### Real GIA / reverse-engineering conclusions

Read these when the task asks “what does the editor/game really do?”:

- `docs/composite-ir/index.md`
- `docs/composite-ir/01-ir-types.md`
- `docs/composite-ir/03-validation-basics.md`
- `docs/composite-ir/04-validation-signal.md`
- `docs/composite-ir/05-gia-encoding.md`
- `docs/composite-ir/06-advanced-patterns.md`
- `docs/composite-ir/analyze-workflow.md`
- `docs/gia-tools-reference.md`

Use commands such as:

```bash
npx tsx tests/composite/trace-exec-flow.ts <file.gia> --io
npx tsx tests/composite/trace-exec-flow.ts <file.gia> --json --io --depth=1
npx tsx tests/composite/trace-dataflow.ts <file.gia> --list-nodes
npx tsx tools/decode-gia.ts <file.gia>
```

### Historical context

Use these only after current docs have been checked:

- `docs/composite-ir/handover/README.md`
- `docs/composite-ir/handover/r21-*.md` through `r26-*.md` for recent decision history.
- `docs/composite-ir/todo.md`
- `docs/composite-ir/composite-priority-backlog.md`
- `docs/composite-ir/composite-worktree-ops.md`
- `docs/composite-ir/gaps/*.md`

Read the status banner first. If a file is `历史记录`, `部分过期`, or `待验证`, do not copy its code examples into new code without checking current docs and source.

## API-name guidance

Prefer current user-facing names in new examples:

- `f.entry()` over `f.eventMarker()`.
- `f.link(...)` in user docs/examples; note that current code delegates to `linkTo(...)`, and `linkTo` remains available.
- `f.node()` / `f.rawExecNode()` for detached raw exec nodes.
- `f.outflow(name, source, idx?)` over deprecated `f.leaf(idx)`.
- `f.inflow(name, target, idx?)` for multi-InFlow composite definitions.

Do not flatten `f.node()` and `f.registerExecNode()` into synonyms. They have different semantics: `node()` is detached; `registerExecNode()` auto-links to the current tail.

## Output pattern

When using this skill for a task, report:

1. **Docs consulted** — exact files.
2. **Relevant current facts** — from current implementation docs/source.
3. **Relevant real-GIA facts** — with file/command if used.
4. **Historical notes** — only if they explain risk or decision history.
5. **Recommended next action** — implementation, verification, or doc update.

Keep the report short unless the user asked for a full audit.
