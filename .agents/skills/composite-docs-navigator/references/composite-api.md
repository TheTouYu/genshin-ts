# Composite API and implementation route

Use this module for `defineComposite`, `callComposite`, capture, raw control flow, IR, or Stage 3 composite encoding.

## Current document route

Read only the relevant documents:

- `docs/architecture/composite/raw-control-flow-dsl-quickstart.md` — current low-level wiring API.
- `docs/architecture/composite/dsl-api.md` — `defineComposite`, `callComposite`, types, and calls.
- `docs/architecture/composite/capture-mechanism.md` — Stage 2 capture.
- `docs/architecture/composite/ir-representation.md` — current IR shape.
- `docs/architecture/composite/gia-encoding.md` — Stage 3 encoding.
- `docs/architecture/composite/pipeline-flow.md` — end-to-end pipeline.

For real editor behavior, also read `docs/composite-ir/index.md` and the focused validation document. For documentation changes, route through `composite-docs-maintainer`.

## Source verification

Before editing, inspect the relevant current source and focused tests, commonly:

- `src/runtime/core.ts`
- `src/runtime/composite_registry.ts`
- `src/compiler/ir_to_gia_transform/composite.ts`
- `src/compiler/ir_to_gia_transform/index.ts`
- `tests/composite/`

Verify three layers when a claim crosses boundaries:

1. capture/runtime behavior;
2. CompositeDefIR and graph representation;
3. Stage 3 protobuf/GIA encoding.

## API names

Prefer in new examples:

- `f.entry()`
- `f.link(...)`
- `f.node()` / `f.rawExecNode()`
- `f.inflow(...)`
- `f.outflow(...)`

Keep old names only as compatibility or historical notes. `f.node()` is detached; `f.registerExecNode()` auto-links to the current tail, so they are not interchangeable.

## Validation boundary

A successful build or GIA regression does not prove game behavior. If the task involves editor controls, map injection, layout choice, or game state, switch to the full route and require user confirmation before destructive operations.
