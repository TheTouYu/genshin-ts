# Knowledge loading checklist

Use this module when the user asks to “加载知识体系技能” or equivalent. It is a routing checklist, not a replacement for the project documents.

## Base knowledge

Read these current entry points first:

1. `references/project-overview.md` — repository layers and global boundaries.
2. `references/knowledge-domain-map.md` — major-domain coverage matrix.
3. `docs/documentation-map.md` — task-to-document routing.
4. `docs/documentation-governance.md` — status/source labels and API migration rules.
5. `docs/composite-ir/index.md` — real-GIA knowledge base and case-study index.
6. `docs/composite-ir/analyze-workflow.md` — evidence-first analysis workflow.
7. `docs/gia-tools-reference.md` — decode, trace, diff, and wire-related tool guidance.

## Load by next task

| Next task | Add these project documents |
|---|---|
| User DSL / TS subset | `references/eslint-constraints.md`, `references/template-package.md`, `references/runtime-ir.md` |
| Compiler pipeline | `references/compiler-pipeline.md` |
| Runtime / IR | `references/runtime-ir.md` |
| Composite API or capture | `references/composite-api.md`, then `docs/architecture/composite/dsl-api.md`, `capture-mechanism.md`, `ir-representation.md` |
| Stage 3 / protobuf encoding | `references/definitions-vendor.md`, `references/real-gia-analysis.md`, then relevant encoding docs |
| Real GIA reverse engineering | `references/real-gia-analysis.md`, `docs/composite-ir/03-validation-basics.md`, `docs/composite-ir/analyze-workflow.md` |
| CLI / config | `references/cli-config.md` |
| Map or injection | `references/game-map-injection.md`, `docs/architecture/injector-system.md`, `docs/composite-ir/handover/layout-working-rules.md` |
| Testing / validation | `references/testing-validation.md` |
| Physical-motion recreation | `references/physical-motion-recreation.md`, latest relevant physics handover |
| Definitions / vendor update | `references/definitions-vendor.md`, `references/maintenance-release.md` |
| Template package | `references/template-package.md` |
| Documentation update | `docs/documentation-governance.md`, `docs/documentation-map.md`, relevant authoritative target |

Read historical handovers after current authoritative documents and only for a concrete reason.

## Loading report

After loading, report:

- loaded domains;
- current implementation documents;
- real-GIA evidence documents;
- historical documents, if any;
- unresolved claims and operations requiring confirmation.

Do not imply that loading a document proves its claims. Apply the evidence labels from `evidence-levels.md`.
