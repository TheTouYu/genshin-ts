# Maintenance and release route

Use this module for routine node maintenance, generated definitions, vendor updates, changelog/release work, or CI/release behavior.

## Authoritative sources

- `docs/maintenance/routine-node-maintenance.md`
- `docs/maintenance/2026-05-24-new-node-truth-needed.md`
- `docs/maintenance/2026-05-26-node-consistency-risk-review.md`
- `Changelog.md`, `Changelog_ZH.md`
- `.github/workflows/release.yml`
- `scripts/release.mjs`
- `scripts/generate-definitions.ts`

## Workflow boundaries

- Define the maintenance scope before regenerating large files.
- Regenerate definitions through the supported command; inspect consistency and generated diffs.
- Treat vendor updates as a separate source/compatibility change and record the baseline.
- Run focused checks before broad build/test/release checks.
- Do not mix unrelated generated output, game files, or cleanup into a maintenance commit.

For documentation changes, also load `composite-docs-maintainer`; for code structure exploration, load `codebase-memory`.
