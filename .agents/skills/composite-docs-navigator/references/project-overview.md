# Project overview route

Use this module for broad repository orientation, onboarding, or “load the whole knowledge system” requests.

## Read first

- `README_ZH.md` or `README.md`
- `docs/README.md`
- `docs/documentation-map.md`
- `AGENTS.md`
- relevant directory `AGENTS.md`

## Main layers

```text
user TS / template
  → Stage 1 TS → .gs.ts
  → Stage 2 .gs.ts → IR JSON
  → Stage 3 IR → .gia
  → injector .gia → .gil
```

Main repository areas:

- `src/runtime/`: DSL runtime, values, capture, IR production.
- `src/compiler/`: three-stage compiler and config loading.
- `src/definitions/`: generated node/event/enum/resource definitions.
- `src/injector/`: `.gia` to `.gil` patching.
- `src/thirdparty/`: vendored schema and node data; independent maintenance boundary.
- `tests/`: compiler, runtime, composite, layout, and generated regressions.
- `tools/`: GIA analysis and inspection tools.
- `create-genshin-ts/`: independent npm package and starter template.

## Repository rules

- Do not hand-edit generated `src/definitions/`; use `npm run gen`.
- Do not casually edit `src/thirdparty/`; use vendor/fork sync strategy.
- Use `.js` suffixes for relative TypeScript imports, single quotes, no semicolons.
- Read the nearest `AGENTS.md` before modifying a subdirectory.
- Treat injection, cleanup, overwrite, and game-state operations as confirmation-required.
