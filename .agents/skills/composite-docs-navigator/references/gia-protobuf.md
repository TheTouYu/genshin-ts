# GIA protobuf and vendor-schema route

Use this module when a task concerns `.proto`, generated protobuf TypeScript, unknown fields, wire bytes, schema generation, or vendor compatibility.

## Authoritative documents

- `docs/architecture/stage3-ir-to-gia.md`
- `docs/architecture/definition-system.md`
- `docs/architecture/debugging-gia-encoding-methodology.md`
- `docs/composite-ir/05-gia-encoding.md`
- `docs/composite-ir/retrospectives/r20-bool-enum-metadata.md`
- `src/thirdparty/AGENTS.md`

## Source route

- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto`
- matching `gia.proto.ts`
- `src/compiler/gia_vendor.ts`
- `src/compiler/ir_to_gia_transform/`
- vendor fork compatibility branch when a legacy-schema patch is involved

## Evidence rules

- Defaults-decoded JSON does not establish field presence.
- For suspected schema loss, compare raw wire fields and decode/encode round-trip bytes.
- Record field number, wire type, raw bytes, semantic message, source sample, and scope.
- Keep current legacy schema and upstream/new-schema migrations separate.

## Maintenance boundary

Do not directly edit vendor content without following the fork/sync strategy. When generated protobuf TypeScript is changed, verify the schema and generated type stay synchronized and preserve a minimal wire regression.
