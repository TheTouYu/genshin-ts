# Testing and validation route

Use this module for test planning, regression selection, build failures, GIA comparison, or claims of correctness.

## Authoritative documents

- `docs/architecture/composite/testing.md`
- `tests/AGENTS.md`
- `package.json`
- `docs/gia-tools-reference.md`
- `docs/documentation-governance.md` for evidence labels

## Validation levels

Keep these separate:

1. TypeScript/build validation: `npm run build`.
2. Fast project tests: `npm run quicktest`.
3. Full configured test generation: `npm test`.
4. Focused composite or compiler regression scripts.
5. GIA structural/wire comparison.
6. Successful injection.
7. User/game in-editor verification.

A higher-level claim requires evidence at that level; passing a build does not prove GIA behavior, and successful injection does not prove game behavior.

## Test selection

- Start with the smallest focused test touching the changed layer.
- Add positive and negative assertions for type/schema changes.
- For real GIA protocol work, check field presence and round-trip bytes, not only defaults JSON.
- Run `git diff --check` after code or docs changes.
- If `npm test` scans debug scripts or fails for an unrelated existing fixture, report the exact failure and do not silently redefine it as a pass.

## Composite tests

Use `tests/composite/` scripts and `test-composite-runner.sh` for capture, IR, topology, GIA, and layout-specific coverage. Keep debug `_dump-*` scripts separate from formal acceptance when possible.
