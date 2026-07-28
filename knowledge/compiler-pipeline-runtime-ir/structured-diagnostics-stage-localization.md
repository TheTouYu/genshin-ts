# Structured diagnostics and stage localization

Locate failures by `.gs.ts`, IR, or GIA artifact and preserve structured graph/node/source context without guessing across stages.


<!-- CLAIM:START clm_01KYH64VA25BVS99BD4K1P5F5S -->

### Compiler diagnosis starts from the first divergent artifact and preserves structured context

A compiler failure should first be localized to source→`.gs.ts`, `.gs.ts` execution→IR, or IR→GIA by inspecting the earliest divergent artifact. Structured diagnostics can preserve code/severity/source plus entry, location, graph, node, related-node, and Composite context and can be persisted across child processes; these fields refine a stage/seam diagnosis but do not replace artifact inspection.

#### 适用边界与失效条件

A diagnostic code or final GIA symptom alone does not prove an earlier-stage root cause, editor acceptance, or game behavior. Fields are optional and source classification is scoped to current reporters. Revalidate when artifact boundaries, diagnostic schema/persistence/aggregation, or focused reporter tests change.

<!-- CLAIM:END clm_01KYH64VA25BVS99BD4K1P5F5S -->
