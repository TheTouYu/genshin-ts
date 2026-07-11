# Historical and handover maintenance

Historical handovers preserve decisions, failed experiments, and session continuity. They are not current API authority.

## Rules

- Read current architecture/source first.
- Do not rewrite a historical handover just to update API names.
- Add a status banner, supersession note, or current-authority link when a historical claim can mislead.
- Update `docs/composite-ir/handover/README.md` when a recent handover is added or its status changes.
- Preserve failed paths if they explain why a hypothesis was rejected.
- Mark old API names as historical/compatibility context; new docs use current names.

## Routing

- Session continuity → `docs/composite-ir/handover/`.
- Verified reverse-engineering conclusion → current `docs/composite-ir/*.md` or a focused retrospective.
- Unresolved question/test plan → `docs/composite-ir/gaps/` or `todo.md`.
- Current recommendation → `docs/architecture/` or the appropriate user/template document.
