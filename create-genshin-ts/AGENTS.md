# create-genshin-ts/ — Separate npm Package (Scaffold CLI)

## OVERVIEW
A **separate npm package** (`name: "create-genshin-ts"`, `version: "0.1.10"`) shipped as a subfolder of the main repo. Invoked via `npm create genshin-ts@latest`. Contains the user-facing project template (`templates/start/`).

**Published independently** — `release.yml` publishes both `genshin-ts` (root) AND `create-genshin-ts` in one workflow.

## STRUCTURE
```
create-genshin-ts/
├── package.json                  # name: "create-genshin-ts", bin: create-genshin-ts
├── README.md                     # CLI tool README
├── bin/
│   └── create-genshin-ts.mjs     # 106 LoC Node scaffold (prompts project name, copies templates/start/, substitutes placeholders)
└── templates/
    └── start/                    # User-facing starter template
        ├── package.json          # depends on genshin-ts; dev/build scripts
        ├── gsts.config.ts        # Compile config (compileRoot, entries, outDir, inject)
        ├── tsconfig.json
        ├── eslint.config.mjs
        ├── .prettierrc.js
        ├── .editorconfig
        ├── _gitignore            # renamed to .gitignore on copy
        ├── README.md             # 12 KB end-user guide (English)
        ├── README_ZH.md          # 13 KB Chinese version
        ├── CLAUDE.md             # 82 lines AI guidance
        ├── AGENTS.md             # 55 lines AI guidance (existing, do not duplicate here)
        ├── src/main.ts           # Default entry example
        ├── docs/
        │   ├── EDITOR_BOUNDARIES.md
        │   └── EDITOR_BOUNDARIES_ZH.md
        └── .vscode/
            ├── settings.json
            └── extensions.json
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a new field to the scaffold | `bin/create-genshin-ts.mjs` (substitution logic) + `templates/start/` (the file to template) |
| Add a new dependency to the template | `templates/start/package.json` |
| Change the template's compile config | `templates/start/gsts.config.ts` |
| Change the user-facing guide | `templates/start/README.md` or `README_ZH.md` |
| Change AI guidance | `templates/start/AGENTS.md` and `CLAUDE.md` (note: existing files, preserve intent) |
| Update the scaffold version | `create-genshin-ts/package.json` version + `release.yml` flow |
| Add a new template | New subdir under `templates/` (e.g. `templates/advanced/`); requires extending the scaffold CLI to select templates |
| Understand release flow | `.github/workflows/release.yml` (the two-package coordination) |

## CONVENTIONS
- `_gitignore` in the template (note the leading underscore) is renamed to `.gitignore` on copy — Node doesn't copy dotfiles cleanly across all platforms.
- Placeholders `__PROJECT_NAME__` and `__PACKAGE_NAME__` are substituted by `bin/create-genshin-ts.mjs`.
- The scaffold refuses to copy into a non-empty directory unless `--force` is passed.
- The template's `AGENTS.md` (55 lines) and `CLAUDE.md` (82 lines) are **AI guidance for end users**, not project maintainers — they target template consumers.
- The template's `README.md` and `README_ZH.md` are **end-user documentation** — they target template consumers, not the compiler project itself.
- The two-package release flow: `release.yml` runs `npm version X --no-git-tag-version` in BOTH `genshin-ts/` and `create-genshin-ts/`, then commits/pushes, then publishes both via OIDC.

## KEY EXPORTS
- `bin/create-genshin-ts.mjs` — the only executable; invoked as `npm create genshin-ts@latest`
- `templates/start/` — the only template (single template, no selection)
- `package.json` — `name`, `version`, `bin` fields

## ANTI-PATTERNS
- Do NOT add `dist/` or compiled artifacts to this package — it's source-only, the scaffold is plain Node.js.
- Do NOT add a `build` step to the template's `package.json` beyond what `npm run dev` does — keep the template's friction low.
- Do NOT use `Promise`/`async` in the scaffold — keep it sync (it's a 106 LoC Node script).
- Do NOT break the `__PROJECT_NAME__` / `__PACKAGE_NAME__` placeholder convention.
- Do NOT delete the `_gitignore` rename hack — it's required for cross-platform dotfile handling.
- Do NOT change the existing `AGENTS.md` / `CLAUDE.md` in `templates/start/` without coordinating with the user-facing AI guidance intent.
- Do NOT add a CLI option that requires new dependencies — keep the scaffold zero-dep.

## NOTES
- The template is a **complete end-user starter**: `package.json`, `gsts.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.js`, `.editorconfig`, `_gitignore`, `src/main.ts`, `docs/EDITOR_BOUNDARIES.md(_ZH)`, `.vscode/settings.json(_extensions)`.
- The template's `gsts.config.ts` is type-checked against `GstsConfig` from `genshin-ts` (root package). When adding fields to `GstsConfig`, verify the template still type-checks.
- The template's `CLAUDE.md` / `AGENTS.md` are referenced from the main project `README.md` ("AI guidance").
- The `templates/start/AGENTS.md` (55 lines) is **already present** — it is a different audience (template users) than the project-level `AGENTS.md` (which I am writing). Do not merge them.
- The `bin/create-genshin-ts.mjs` is the only executable; published as `bin: { "create-genshin-ts": "bin/create-genshin-ts.mjs" }` in `package.json`.
- The package's `files` field in `package.json` is `["bin", "templates", "README.md"]` — only ships source, no build artifacts.
- The package's `version` is **independent** from the main `genshin-ts` package — both are bumped together in `release.yml`, but can diverge if needed.
