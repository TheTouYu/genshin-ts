# Compiler pipeline route

Use this module for compiler architecture, stage errors, output artifacts, config options, or changes crossing compiler stages.

## Authoritative documents

- `docs/architecture/compilation-pipeline-overview.md`
- `docs/architecture/stage1-ts-to-gs.md`
- `docs/architecture/stage2-gs-to-ir.md`
- `docs/architecture/stage3-ir-to-gia.md`
- `docs/architecture/composite/pipeline-flow.md` for composite-specific flow

## Source route

- Stage 1: `src/compiler/ts_to_gs_pipeline.ts`, `src/compiler/ts_to_gs_transform/`
- Stage 2: `src/compiler/gs_to_ir_json_transform/`, `src/runtime/`
- Stage 3: `src/compiler/ir_to_gia_pipeline.ts`, `src/compiler/ir_to_gia_transform/`
- Config: `src/compiler/gsts_config.ts`, `config_loader.ts`
- Multi-entry merge: `src/compiler/ir_merge.ts`

The IR is the typed hand-off between stages. Preserve `.gs.ts`, `.json`, and `.gia` suffix conventions and do not blur child-process stage boundaries.

## Validation

Use the smallest relevant command first:

```bash
npm run build
node bin/gsts.mjs -c <config> --noinject
```

Then inspect each artifact (`.gs.ts`, `.json`, `.gia`) before broad tests. For compiler changes affecting real editor behavior, route through `real-gia-analysis.md` and keep game verification separate.
