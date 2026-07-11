# Domain maintenance routing

Read the shared map first:

```text
.agents/skills/composite-docs-navigator/references/knowledge-domain-map.md
```

For each change, identify the domain, then verify four links:

1. current authoritative document;
2. source entry point;
3. test/tool entry point;
4. safety/evidence boundary.

Do not create a new document merely because an existing one is long. Prefer the existing authoritative destination and add a link from indexes only when it becomes a new entry point.

## Common destination rules

- Compiler implementation → `docs/architecture/stage*.md` and pipeline docs.
- Runtime/IR → runtime, IR, and composite architecture docs.
- Composite/GIA → current architecture docs for implementation; `docs/composite-ir/` for real-file evidence.
- Definitions/vendor → definition-system and maintenance docs; generated files remain generated.
- CLI/injector/map → injector system and CLI/config docs; preserve confirmation rules.
- Tests/tools → testing architecture and `gia-tools-reference.md`.
- User/template behavior → template docs and user docs; do not expose internal reverse-engineering paths unnecessarily.
- History → handover only; current docs must carry the recommendation.

If a domain has no target, record that as a coverage gap before writing new material.
