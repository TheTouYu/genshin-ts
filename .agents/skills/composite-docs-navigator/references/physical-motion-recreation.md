# Physical-motion recreation route

Use this module for the `tests/layout/physics-motion/` recreation project, its generated GIA, or a request to validate it in-game.

## Current knowledge route

Read:

- `docs/composite-ir/physics-motion-recreate-guide.md`
- the latest relevant `docs/composite-ir/handover/layout-handover-physics-motion-round-*.md`
- `docs/composite-ir/handover/layout-working-rules.md`
- `docs/architecture/composite/gia-encoding.md` when composite encoding is involved
- `references/game-map-injection.md` when a map operation is involved

Use current source and tests as authority over old handover wording. Handover files preserve failed attempts and user feedback; do not copy their old API names or target IDs without verification.

## Typical workflow

1. Inspect the current config and source tree.
2. Build and generate the physical-motion GIA with `gsts.physics-motion.config.ts`.
3. Run focused structural and type regressions.
4. If the task is game validation, discover the current map first and confirm the target IDs.
5. For multi-file output, inject `dist/tests/layout/physics-motion/main.gia` through the single-file path so `inject.nodeGraphId` is honored.
6. Report generation, injection, and game verification as separate statuses.

## Known boundaries

- Duplicate outflow warnings may be existing recreation data and are not automatically a failure.
- Generated GIA graph IDs can differ from the target NodeGraph ID in the map.
- A successful GIA generation or injection does not prove the physical behavior is correct in-game.
- Layout or game-state choices require user confirmation.
