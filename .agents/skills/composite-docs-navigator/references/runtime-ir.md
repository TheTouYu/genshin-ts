# Runtime and IR route

Use this module for `g.server`, runtime globals, value classes, capture, IR shape, or Stage 2 behavior.

## Authoritative documents

- `docs/architecture/runtime-dsl.md`
- `docs/architecture/ir-control-data-flow.md`
- `docs/architecture/stage2-gs-to-ir.md`
- `docs/architecture/composite/capture-mechanism.md`
- `docs/architecture/composite/ir-representation.md`

## Source route

- `src/runtime/core.ts`: server DSL, registry flush, signals, DCE.
- `src/runtime/server_globals.ts` and `.d.ts`: global factories and ambient types.
- `src/runtime/value.ts`: nominal runtime value hierarchy and type maps.
- `src/runtime/IR.d.ts`: typed cross-stage contract.
- `src/runtime/ir_builder.ts`: IR document construction.
- `src/runtime/composite_registry.ts`: composite handles, capture, IDs, pin constants.

Keep runtime capture, IR representation, and Stage 3 encoding as separate layers. `IR.d.ts` is a contract, not a runtime implementation.

## Risk rules

- New value classes require all three value type maps.
- Preserve lazy `gsts.f` binding and server context restrictions.
- Do not add Promise/async, recursion, or unrestricted JSON to user-reachable runtime paths.
- Do not extend legacy return-var optimization without checking current LocalVariable semantics.

Validate with focused runtime/composite tests before building the full matrix.
