---
name: composite-docs-maintainer
description: Maintain and synchronize the Genshin-TS project knowledge system after code changes, compiler/runtime changes, composite or GIA reverse-engineering findings, CLI/injector changes, definitions/vendor updates, test or validation changes, template-package changes, documentation audits, or discovery of stale documentation. Use this skill whenever authoritative project docs, architecture maps, knowledge-domain coverage, source classifications, evidence tags, handovers, or cross-document links need to be created or updated. Route the change through the shared knowledge-domain map and update the appropriate authoritative document rather than copying the whole knowledge base.
---

# Genshin-TS knowledge-system maintainer

Maintain the project’s authoritative documentation and navigation system. This skill writes and synchronizes knowledge; it does not replace the navigator, codebase-memory, or the project source of truth.

## Responsibilities and boundaries

- `composite-docs-navigator`: reads knowledge, routes tasks, and selects the smallest relevant modules.
- `codebase-memory`: discovers code structure and impact; use it when architecture or callers are unclear.
- `composite-docs-maintainer` (this skill): selects authoritative documentation destinations, updates them, synchronizes indexes and references, and validates the result.
- `skill-creator`: changes the skills themselves and evaluates their triggering/behavior.

Do not copy the project knowledge base into this skill. Use the shared domain map and small maintenance references.

## Start here

先判断是**已锁定续作的小型维护**还是需要重新路由的完整维护，二者不要叠加。

### Bounded continuation fast path

满足以下全部条件时使用：

- 用户提供了明确 handoff/manifest、Authority 和不可变 before/after 证据；
- 只是在现有 Authority 内修正或补充一个已由 Validator 接受的有界结论；
- 不新增知识域、不移动文档、不改公开路由/索引，也不涉及真实地图写回决策；
- 当前会话已经读取适用 `AGENTS.md` 和目标领域调查 Skill。

此时只读：目标 Authority、`references/evidence-and-status.md`、本轮原始证据摘要，以及当前
source/test（若声明当前实现）。治理标签仍然生效，但不要重复加载 `documentation-map.md`、共享
knowledge-domain map、Composite index、`analyze-workflow.md` 或完整 `gia-tools-reference.md`。
只有目标归属不清、证据冲突、链接/路由变化或 coverage gap 时才退出快路。

### Full maintenance route

不满足快路条件时，编辑文档前：

1. Read `docs/documentation-governance.md`.
2. Read `docs/documentation-map.md`.
3. Read the shared map:
   `.agents/skills/composite-docs-navigator/references/knowledge-domain-map.md`.
4. Read the relevant maintenance reference under this skill’s `references/`:
   - implementation or domain routing: `references/domain-maintenance.md`;
   - real GIA, protobuf/wire, game evidence, or status labels:
     `references/evidence-and-status.md`;
   - history/handover: `references/historical-docs.md`;
   - coverage/index audit: `references/coverage-audit.md`.
   Do not infer a reference filename that is not listed here.
5. Read the target document and current source/test evidence.
6. Read the nearest `AGENTS.md` for any source or documentation directory involved.

For a real GIA or game-map change on the full route, also read:

- `docs/composite-ir/index.md`
- `docs/composite-ir/analyze-workflow.md`
- `docs/gia-tools-reference.md`
- the relevant navigator reference, especially `evidence-levels.md` or `game-map-injection.md`

## Route by knowledge domain

Use the shared domain map as the baseline. The primary destinations are:

| Change or finding | Authoritative destination | Supporting route |
|---|---|---|
| Project overview or architecture map | `docs/README.md`, `README_ZH.md`, `docs/documentation-map.md` | `project-overview.md` |
| User DSL / TypeScript subset | `create-genshin-ts/templates/start/README_ZH.md`, user docs | `eslint-constraints.md`, `template-package.md` |
| Compiler stages or artifacts | `docs/architecture/compilation-pipeline-overview.md`, `stage1-*`, `stage2-*`, `stage3-*` | `compiler-pipeline.md` |
| Runtime / IR / capture | `docs/architecture/runtime-dsl.md`, `ir-control-data-flow.md`, composite architecture docs | `runtime-ir.md`, `composite-api.md` |
| Composite API or capture | `docs/architecture/composite/`, `docs/composite-ir/` | `composite-api.md` |
| GIA/protobuf/wire or vendor schema | `docs/composite-ir/`, `docs/gia-tools-reference.md`, `docs/architecture/definition-system.md` | `gia-protobuf.md`, `real-gia-analysis.md` |
| Definitions, node data, vendor IDs | `docs/architecture/definition-system.md`, `docs/maintenance/` | `definitions-vendor.md` |
| CLI/config/maps/dev/backup | `README_ZH.md`, `docs/architecture/injector-system.md`, relevant CLI docs | `cli-config.md`, `game-map-injection.md` |
| Injector/GIL behavior | `docs/architecture/injector-system.md` | `game-map-injection.md`, `gia-protobuf.md` |
| Tests, regressions, validation workflow | `docs/architecture/composite/testing.md`, `docs/gia-tools-reference.md` | `testing-validation.md` |
| Physical-motion recreation | `docs/composite-ir/physics-motion-recreate-guide.md`, latest handover | `physical-motion-recreation.md` |
| Template package | `create-genshin-ts/README.md`, template docs | `template-package.md` |
| Maintenance/release/vendor update | `docs/maintenance/`, `Changelog*.md`, release files | `maintenance-release.md` |
| Historical continuity | `docs/composite-ir/handover/`, update `handover/README.md` if recent | `historical-docs.md` |
| Knowledge-domain coverage or navigation | `knowledge-domain-map.md`, `docs/documentation-map.md`, `docs/README.md` | `coverage-audit.md` |
| Engine API usage/search | `docs/architecture/docs-search.md`, user/template docs | `src/docs_search/engine_api.ts`, `resources/node_definitions.json`, tests | `docs:index`, `docs:search`, API query fixtures | Search ranking is not evidence; generated definitions are read-only; `.env` and local index are ignored |

If no route fits, identify the missing domain first. Do not silently classify unrelated work as Composite.

## Evidence and status governance

Every new document and every high-risk edited document needs:

```md
> 状态：当前推荐 / 已验证 / 当前实现 / 历史记录 / 部分过期 / 待验证 / 已废弃
> 来源：真实 GIA 验证 / 当前代码实现 / 历史记录 / 推测
> 最近校验：YYYY-MM-DD
> 适用范围：gsts 当前输出 / 游戏编辑器真实输出 / 两者都适用
```

Keep evidence layers separate:

- **当前代码实现**: cite source function/file and focused test or build result.
- **真实 GIA 观察**: cite sample path, command, observation, conclusion, and scope.
- **自动回归**: describe what the script proves; do not upgrade it to game evidence.
- **注入成功**: report the target file and graph ID; it does not prove game behavior.
- **游戏内验证**: use this claim only when the user or an explicit game log confirms it.
- **历史记录**: preserve useful failed paths, but do not present them as current guidance.
- **待验证/推测**: label explicitly and keep separate from confirmed facts.

For protocol issues, decoded defaults JSON does not prove protobuf field presence. Record raw wire/round-trip evidence when that is the reason for a fix.

## Maintenance workflow

### A. Ordinary implementation change

```text
identify changed domain
→ read shared domain map and current source/test evidence
→ select authoritative destination
→ make the smallest documentation edit
→ update status/source/scope
→ update navigator reference only if routing or reusable knowledge changed
→ validate links, terminology, and diff
```

### B. Real GIA or game finding

```text
preserve file + command + observation
→ classify evidence
→ update authoritative reverse-engineering document
→ update tool/reference guidance if reusable
→ add or point to regression
→ record remaining scope and game-verification status
```

### C. New knowledge domain or coverage gap

Update, in order:

1. authoritative project document or create one if no home exists;
2. navigator reference for the domain;
3. `knowledge-domain-map.md` with docs/source/tests/boundary;
4. `docs/documentation-map.md` if the public routing changes;
5. this skill’s route table only if the task signal or destination is new.

Do not update all indexes for an ordinary paragraph correction.

### D. Stale or historical document

Do not rewrite history merely to make terminology current:

1. add or correct its status banner when needed;
2. add a supersession/current-authority note;
3. update `handover/README.md` if it is a recent handover;
4. update the current authoritative document instead of duplicating the old content.

## Current API naming

For new current examples, prefer:

- `f.entry()` over `f.eventMarker()`;
- `f.link(...)` over `f.linkTo(...)` in user-facing docs;
- `f.node()` / `f.rawExecNode()` for detached raw nodes;
- `f.outflow(name, source, idx?)` over deprecated `f.leaf(idx)`;
- `f.inflow(name, target, idx?)` for multiple InFlows.

Historical documents may retain old names, but must be labeled historical or compatibility guidance. Do not treat `f.node()` and `f.registerExecNode()` as synonyms.

## Validation checklist

After editing:

```bash
git diff --check
rg -n -e "eventMarker" -e "linkTo" -e "registerExecNode" -e "leaf\\(" docs/architecture/composite docs/composite-ir -g'*.md'
rg -n -e "leafMarks" -e "outflowExitNodes" docs/architecture/composite docs/composite-ir -g'*.md'
```

Also verify:

- every new relative link points to an existing file;
- source paths and test commands still exist;
- generated/vendor files are described as generated/vendor, not hand-maintained;
- current docs do not accidentally rely on historical handover claims;
- map/injection docs retain explicit confirmation boundaries;
- `knowledge-domain-map.md` remains synchronized when coverage changes.

## Handoff to the navigator

When this skill discovers a reusable new rule, stale route, or missing domain, report it in this format:

```text
knowledge domain:
authoritative document:
source entry:
test/tool entry:
evidence class:
new or changed navigator reference:
remaining uncertainty:
```

When finished, report:

1. files changed and why each is authoritative;
2. source classification for each change;
3. validation commands and results;
4. coverage/index changes;
5. remaining risks or follow-up documentation.
