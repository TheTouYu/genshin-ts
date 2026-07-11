# Knowledge coverage audit

Use this module when the user asks whether the project knowledge system is complete, when a new major subsystem appears, or when navigator/maintainer routing may be stale.

## Audit method

1. Read the shared `knowledge-domain-map.md`.
2. Enumerate major project domains from `README`, `docs/documentation-map.md`, source directory `AGENTS.md`, and architecture docs.
3. For every domain verify:
   - authoritative document exists;
   - source entry is concrete;
   - test/tool entry exists or is marked unavailable;
   - evidence/safety boundary is stated;
   - navigator route exists;
   - maintainer destination exists.
4. Classify each domain as `covered`, `partial`, `missing`, or `stale`.
5. Fix the smallest routing/index gap first; do not duplicate whole documents into skills.
6. Re-run path, link, and diff checks.

## Minimum coverage standard

A major domain is covered only if all four domain-map columns are meaningful:

```text
authoritative docs + source entry + test/tool entry + special boundary
```

The skill system is complete only when both directions work:

```text
navigator can load the domain
maintainer can update the domain
```

## Audit report

Report:

```text
domain totals:
covered:
partial:
missing:
stale:
new references:
new authoritative docs:
index changes:
remaining gaps:
```
