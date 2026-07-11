# Definitions and vendor route

Use this module for node/event/enum/resource definitions, vendor IDs, protobuf schema, generated files, or upstream sync.

## Authoritative documents

- `docs/architecture/definition-system.md`
- `docs/maintenance/routine-node-maintenance.md`
- `docs/maintenance/2026-05-24-new-node-truth-needed.md`
- `docs/maintenance/2026-05-26-node-consistency-risk-review.md`
- `docs/composite-ir/retrospectives/r20-bool-enum-metadata.md` for the field-101 case

## Source route

- Generated definitions: `src/definitions/`
- Vendor data: `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/`
- Generator: `scripts/generate-definitions.ts`
- Alias generator: `scripts/generate-zh-aliases.mjs`
- Compiler mappings: `src/compiler/ir_to_gia_transform/mappings.ts`, `node_id.ts`
- Schema: vendor `protobuf/gia.proto` and generated `gia.proto.ts`

## Safe maintenance

- Never hand-edit `src/definitions/`; run `npm run gen` and inspect generated diffs.
- Do not casually hand-edit `src/thirdparty/`; use the vendor fork and record the upstream/compatibility commit.
- Check node ID, pin records, concrete maps, enum maps, and generated TypeScript as one change set.
- A source/vendor update is not game validation; run generated GIA and real editor checks when behavior is uncertain.
