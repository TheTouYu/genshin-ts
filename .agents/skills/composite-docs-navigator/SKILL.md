---
name: composite-docs-navigator
description: Use the Genshin-TS composite/GIA knowledge system before implementing, investigating, documenting, generating, or injecting composite nodes, raw control flow, IR/GIA encoding, trace tools, real GIA behavior, or game-map files. Always use this skill when the task mentions composite nodes, .gia/.gil files, physical-motion recreation, mapId, nodeGraphId, gsts maps, injection, reinjection, or in-game validation—even if the user only asks to “load the knowledge system.” Route minimal real-GIA reproductions through the fast path; use the full route for ambiguous, architectural, conflicting-source, documentation, map-selection, injection, or game-state tasks. Never guess mapId/nodeGraphId or perform destructive game-file operations without confirmation.
---

# Composite / GIA knowledge navigator

Use this skill as a lightweight router, not as a copy of the whole project knowledge base. Read only the references and project documents relevant to the current task.

## First: classify the task

Choose one or more routes before reading deeply:

| Task signal | Route | Read first |
|---|---|---|
| “加载知识体系”, “加载 composite 知识” | Knowledge load | `references/knowledge-loading-checklist.md`, `references/knowledge-domain-map.md`, `references/evidence-levels.md` |
| project overview, onboarding, architecture orientation | Project overview | `references/project-overview.md`, `references/knowledge-domain-map.md` |
| user DSL, TypeScript subset, starter authoring | User DSL / constraints | `references/eslint-constraints.md`, `references/template-package.md`, `references/runtime-ir.md` |
| TS → .gs.ts → IR → GIA, compiler stages, artifacts | Compiler pipeline | `references/compiler-pipeline.md` |
| runtime globals, values, capture, IR document | Runtime / IR | `references/runtime-ir.md` |
| `.gia` difference, editor behavior, wire field, reverse engineering | Real GIA | `references/real-gia-analysis.md`, `references/evidence-levels.md` |
| `defineComposite`, `callComposite`, raw flow, capture, IR | Composite/API | `references/composite-api.md` |
| node/event/enum definitions, vendor data, schema sync | Definitions / vendor | `references/definitions-vendor.md`, `references/gia-protobuf.md` if schema/wire is involved |
| `gsts`, config, dev, maps, backup, CLI behavior | CLI/config | `references/cli-config.md` |
| `mapId`, `nodeGraphId`, `gsts maps`, `.gil`, inject/reinject | Map/injection | `references/game-map-injection.md`, `references/evidence-levels.md` |
| tests, build, regressions, validation claims | Testing / validation | `references/testing-validation.md` |
| `物理运动` recreation | Physical motion | `references/physical-motion-recreation.md`; add map/injection reference if injection is requested |
| `create-genshin-ts`, starter template, npm package | Template package | `references/template-package.md` |
| maintenance, release, generated files, upstream updates | Maintenance / release | `references/maintenance-release.md` |
| engine API usage, event examples, vector/entity/variable API lookup | Engine API search | `docs/architecture/docs-search.md`, collection `engine-api-usage`; use `engine-api-signatures` for exact signatures |
| documentation update after any of the above | Documentation | also load `.agents/skills/composite-docs-maintainer/SKILL.md` |

Do not read unrelated references merely because this skill was triggered. Closed CLI tasks stay on the command path first; load additional references only after command failure, ambiguity, or an explicit request to investigate the rule.

## Knowledge-load mode

When the user explicitly asks to load the knowledge system:

1. Read `references/knowledge-loading-checklist.md`.
2. Read `references/knowledge-domain-map.md`.
3. Read `references/evidence-levels.md`.
4. Load only the module references required by the user’s next stated task.
5. Report what was loaded and distinguish current implementation, real GIA evidence, history, and pending claims.

Loading the skill does not authorize code changes, injection, overwriting, cleanup, or other destructive operations.

The knowledge-domain map is the coverage baseline. When a task does not fit an existing route, first identify the missing domain and update the map/router rather than silently treating it as a Composite task.

## Source precedence

Keep these sources separate:

1. **Real GIA / real map observation** decides editor encoding and observed game-file structure.
2. **Current source and tests** decide current gsts behavior.
3. **Automatic generation or regression** proves reproducibility, not game behavior by itself.
4. **Successful injection** proves that the injector replaced a target, not that the game behavior is correct.
5. **Historical handover** explains decisions and failed paths; it is not current API authority.
6. **Speculation / TODO** is a hypothesis until verified.

If sources conflict, state the conflict and verify it; do not merge them into one conclusion.

## Fast path: one narrow real-GIA task

Use only when all are true:

- The user gives one concrete behavior and a real `.gia` path or minimal sample.
- Comparison fields and acceptance criteria are clear.
- No new API design, map selection, game-state decision, or destructive operation is involved.

Workflow:

```text
decode real sample → write isomorphic test → generate current output
→ structural/wire diff → inspect exact encoder → focused fix → focused regression
```

Read the relevant handover status and `docs/composite-ir/handover/layout-working-rules.md` only after the route is selected. Escalate to the full route when there are multiple plausible roots, conflicting evidence, cross-module impact, or game/map operations.

## Full route

Use the full route for architectural work, ambiguous behavior, conflicting sources, new APIs, documentation audits, map selection, injection, or game validation:

1. Read `docs/documentation-map.md`.
2. Read `docs/documentation-governance.md`.
3. Read only the task-relevant current architecture and composite documents.
4. Read `docs/composite-ir/index.md` and `docs/gia-tools-reference.md` for real-GIA work.
5. Read historical handovers only for context, after current documents.
6. Inspect source and focused tests before editing.

## Local docs-search integration

For engine API usage questions, after route classification query the local search tool instead of loading the entire documentation corpus:

```bash
npm --silent run docs:search -- "<user question>" --collection engine-api-usage --limit 5 --json
```

For exact method, event, parameter, or return-type lookup:

```bash
npm --silent run docs:search -- "<API name or event name>" --collection engine-api-signatures --limit 5 --json
```

Read `docs/architecture/docs-search.md` for collection boundaries, `.env` requirements, result interpretation, cache/index maintenance, and the distinction between search ranking and evidence level. Use `--include-history` only when the question explicitly needs handover/history or current results are insufficient. docs-search is read-only and never authorizes injection or game-file operations.

## Current API naming

For new examples prefer:

- `f.entry()` over `f.eventMarker()`.
- `f.link(...)` over `f.linkTo(...)` in user-facing examples.
- `f.node()` / `f.rawExecNode()` for detached raw nodes.
- `f.outflow(name, source, idx?)` over deprecated `f.leaf(idx)`.
- `f.inflow(name, target, idx?)` for multiple InFlows.

Do not treat `f.node()` and `f.registerExecNode()` as synonyms: detached and auto-linked semantics differ.

## Safety boundary

Before any operation that can affect game state or files outside the repository:

- Do not guess `mapId`, `nodeGraphId`, player, region, or target path.
- Show the selected target and planned command to the user.
- Obtain explicit confirmation before injecting, overwriting, copying, deleting, cleaning, or enabling reinjection.
- Afterward report the actual output path and target ID.
- Say “injection succeeded” separately from “game behavior verified”; claim the latter only after user/game evidence.

## Required report

When this skill is used, report briefly:

1. Docs and references consulted.
2. Relevant current implementation facts.
3. Relevant real-GIA or real-map facts, with file/command evidence.
4. Historical or pending notes.
5. Safety confirmation state and recommended next action.

Reference files are resolved relative to this skill directory:

```text
.agents/skills/composite-docs-navigator/references/
```
