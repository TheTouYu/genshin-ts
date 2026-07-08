---
name: composite-docs-maintainer
description: Update or create Genshin-TS composite-node documentation after new features, bug fixes, reverse-engineering findings, trace-tool changes, or when stale docs are discovered. Trigger this skill whenever the user asks to document a composite feature, update docs after code changes, fix outdated API names, add status/source tags, create handover docs, update docs/composite-ir or docs/architecture/composite, or keep docs in sync with current implementation and real GIA evidence. This skill enforces the documentation governance rules and writes to the right directory/section.
---

# Composite Docs Maintainer

Use this skill when documentation should be created, corrected, or synchronized with a composite-node change or discovery.

The goal is not to write more Markdown everywhere. The goal is to put the right fact in the right place with clear status, source, and scope.

## Start with governance

Before editing, read:

1. `docs/documentation-governance.md`
2. `docs/documentation-map.md`
3. The target document(s) you plan to edit.

If the change touches current APIs, also read the relevant current docs:

- `docs/architecture/composite/raw-control-flow-dsl-quickstart.md`
- `docs/architecture/composite/dsl-api.md`
- `docs/architecture/composite/capture-mechanism.md`
- `docs/architecture/composite/ir-representation.md`
- `docs/architecture/composite/gia-encoding.md`

If the change touches real `.gia` conclusions, also read:

- `docs/composite-ir/index.md`
- `docs/composite-ir/analyze-workflow.md`
- `docs/gia-tools-reference.md`

## Choose the destination

Use this routing table:

| Change type | Destination |
|---|---|
| Current recommended low-level control-flow API | `docs/architecture/composite/raw-control-flow-dsl-quickstart.md` |
| `defineComposite` / `callComposite` API behavior | `docs/architecture/composite/dsl-api.md` |
| Stage 2 capture / runtime registry behavior | `docs/architecture/composite/capture-mechanism.md` or `docs/architecture/runtime-dsl.md` |
| IR shape / `CompositeDefIR` / `CompositeCapture` types | `docs/architecture/composite/ir-representation.md` and/or `docs/composite-ir/01-ir-types.md` |
| Stage 3 GIA encoding | `docs/architecture/composite/gia-encoding.md` and/or `docs/composite-ir/05-gia-encoding.md` |
| Tool usage (`trace-exec-flow`, `trace-dataflow`, `decode-gia`, etc.) | `docs/gia-tools-reference.md` |
| Real GIA reverse-engineering conclusion | `docs/composite-ir/*.md` with file + command + observation evidence |
| Historical handover / session continuity | `docs/composite-ir/handover/` and update `handover/README.md` if recent |
| Known gap / unresolved test plan | `docs/composite-ir/gaps/` |
| Global navigation or classification | `docs/documentation-map.md` or `docs/README.md` |

Prefer updating an existing authoritative document over creating a new one. Create a new file only when the topic has no clear home or would bloat an existing page.

## Required status block

Every new doc and every high-risk edited doc should have:

```md
> 状态：当前推荐 / 已验证 / 当前实现 / 历史记录 / 部分过期 / 待验证 / 已废弃
> 来源：真实 GIA 验证 / 当前代码实现 / 历史记录 / 推测
> 最近校验：YYYY-MM-DD
> 适用范围：gsts 当前输出 / 游戏编辑器真实输出 / 两者都适用
```

Use today’s date unless preserving a historical timestamp is important. If editing a historical file, do not rewrite history; add a banner or index note instead.

## Evidence requirements

### For current implementation docs

Include at least one of:

- Source file/function references, preferably symbolic names rather than fragile line numbers.
- Test scripts or generated outputs that verify the behavior.
- Build/test command if the change was validated.

Phrase carefully:

- “当前代码实现…” for code facts.
- “已自动验证…” for script/test validation.
- “已游戏内验证…” only when the user or logs explicitly say so.
- “未游戏内验证” when uncertain.

### For real GIA docs

Include:

- File path or sample name.
- Command used.
- Observation summary.
- Conclusion.
- Whether it was compared against gsts output.

Example:

```md
来源：真实 GIA 验证
文件：`复杂gia/物理运动.gia`
命令：`npx tsx tests/composite/trace-exec-flow.ts 复杂gia/物理运动.gia --io`
观察：...
结论：...
```

Do not present gsts implementation behavior as editor behavior.

## API naming policy

For new current docs and examples:

- Prefer `f.entry()`; mention `f.eventMarker()` only as an alias/old name.
- Prefer `f.link(...)` in user-facing docs; mention `f.linkTo(...)` as available/underlying/old name when useful.
- Prefer `f.node()` / `f.rawExecNode()` for detached raw exec nodes.
- Use `f.registerExecNode()` only when auto-link-to-tail semantics are specifically needed.
- Prefer `f.outflow(name, source, idx?)`; mention `f.leaf(idx)` only as deprecated compatibility.
- Use `f.inflow(name, target, idx?)` for multi-InFlow composite definitions.

If updating historical docs, keep old names but add a status/banner or link to the current docs.

## Editing strategy

1. Make minimal, targeted edits.
2. Do not move or delete large document groups without user approval.
3. Do not rewrite handovers; add index warnings or supersession tables.
4. Replace duplicated current content with links to authoritative docs when possible.
5. Preserve failed attempts and pending questions if they are useful for future debugging, but label them `历史记录` or `待验证`.
6. Avoid fragile line-number references in new text; use function/file names unless a line number is essential.

## Validation checklist

After editing docs:

```bash
git diff --check
rg -n -e "eventMarker" -e "linkTo" -e "registerExecNode" -e "leaf\\(" docs/architecture/composite docs/composite-ir -g'*.md'
rg -n -e "leafMarks" -e "outflowExitNodes" docs/architecture/composite docs/composite-ir -g'*.md'
```

The remaining matches are acceptable only if they are clearly historical, compatibility notes, or migration guidance.

If you added links, inspect the relative paths manually or with targeted `rg`/`read`. If you moved files, run a broader link check or at least grep for old paths.

## Report format

When done, summarize:

- Files changed.
- Why each destination was chosen.
- Source classification: current implementation, real GIA, historical, or pending.
- Validation commands and results.
- Remaining risks or follow-up docs that should be updated later.
