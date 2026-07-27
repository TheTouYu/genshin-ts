---
name: genshin-ts-project-adapter
description: Route complex Genshin-TS compiler diagnosis, static GIL asset work, game-map writeback, and real-environment validation through bounded Project Memory and Domain Knowledge, with explicit evidence layers and approved semantic writes.
---

# Genshin-TS Project Adapter

This is a bounded router over existing Genshin-TS rules and Portable Knowledge Core. It does not replace `AGENTS.md`, Composite navigation, source/tests, map safety rules, or PKC transaction rules.

## Start

1. Read root and nearest `AGENTS.md`; run `git status --short --branch` and preserve all existing changes.
2. Select exactly one Primary Context in this order: honor an explicit user Context; otherwise use a discriminating task path; when the user supplies only shared workspace/branch scope, ask because that signal matches multiple Contexts; only when the task supplies no Context, path, workspace, or branch signal at all may the unique priority-1 Context act as the default.
3. From the project root use the canonical read-only entry `python tools/pkc.py progressive-query --context <context-id> --intent <intent-or-user-question> --max-level 2 --limit 3 --check-authority`. It automatically forwards to the project-pinned non-editable runtime under ignored `.local/`; the Agent must not select/install a version, set `PYTHONPATH`, locate another checkout, or access SQLite/schema. If the entry reports `PKC_RUNTIME_MISSING`, `PKC_RUNTIME_INVALID`, or `PKC_RUNTIME_VERSION_MISMATCH`, stop and ask the project maintainer to restore the declared runtime rather than repairing dependencies during the business task.
4. For complex compiler diagnosis select `compiler-diagnostics`; for static `.gil` assets, `assets:static-assemblies`, map writeback, injection/overwrite safety, or real game validation select `static-gil-assembly-production`. Read only returned `minimum_files`. Use L3 only when `escalate_to_l3` is true or an exact Claim/Evidence/Authority boundary is required.
5. For screenshot-only position review use intent `screenshot-validation`: it must return at most `assembly-configuration`, must not load closure/writeback Topics, and does not authorize any map operation. Progress queries use `production-progress`; real writeback preparation uses `map-writeback` and may return closure plus writeback safety. If a natural-language request matches multiple intents, stop and clarify; explicit intent IDs take precedence, while `只看图`/`不写回` must never expand to writeback.
6. Follow `.agents/skills/composite-docs-navigator/SKILL.md` whenever `.gia`/`.gil`, map IDs, injection, writeback, or game validation is involved.
7. At L3, run `show-claim` for the exact Claim and keep its Evidence boundary. `progressive-query --check-authority` already returns matching registered Authority Refs and their current/stale state; read only the task-relevant returned refs. Working-tree observations remain pending.

## Evidence contract

Keep current source, focused regression, candidate/raw-wire validation, real GIA/map observation, editor import, writeback/injection, and game behavior separate. STATUS, handoff, commit messages, and decisions are pointers or intent; they do not alone prove current implementation or external behavior.

## Safety contract

Never guess map/player/region/path/ID state. Before injection, overwrite, deletion, restoration, cleanup, or reinjection, show the selected target, current hash/IDs, planned command, changed scope, and rollback path, then obtain task-specific explicit confirmation. Successful writeback or injection is not game verification.

## End

Run the value gate. Propose at most three immutable Bundles only for a stable diagnostic or production constraint, durable red/green or environment evidence, a reusable correction, an architecture decision, or invalidated knowledge. Stop for explicit approval of the displayed hash before applying. Never commit, push, inject, overwrite game files, or modify production code without task-specific authorization.
