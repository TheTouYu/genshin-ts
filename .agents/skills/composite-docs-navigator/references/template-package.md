# create-genshin-ts template package route

Use this module for starter projects, npm packaging, template behavior, or changes under `create-genshin-ts/`.

## Independent package boundary

`create-genshin-ts/` is an independent npm package. Read its own instructions and documentation before changing it:

- `create-genshin-ts/AGENTS.md`
- `create-genshin-ts/README.md`
- `create-genshin-ts/templates/start/AGENTS.md`
- `create-genshin-ts/templates/start/README_ZH.md`
- `create-genshin-ts/templates/start/CLAUDE.md`
- `create-genshin-ts/package.json` when package metadata is relevant

## Source route

- `create-genshin-ts/bin/create-genshin-ts.mjs`: package entry point.
- `create-genshin-ts/templates/start/`: generated starter project.
- Keep root project assumptions and template-project assumptions distinct.

## Validation

Use package-specific install/build or template smoke checks. Do not assume root `npm test` covers the independent package. Template changes should preserve the documented config, ESLint, TypeScript plugin, and starter workflow.
