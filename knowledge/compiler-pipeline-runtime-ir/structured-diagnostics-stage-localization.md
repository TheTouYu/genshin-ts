# Structured diagnostics and stage localization

Locate failures by `.gs.ts`, IR, or GIA artifact and preserve structured graph/node/source context without guessing across stages.


<!-- CLAIM:START clm_01KYH64VA25BVS99BD4K1P5F5S -->

### Compiler diagnosis starts from the first divergent artifact and preserves structured context

A compiler failure should first be localized to source→`.gs.ts`, `.gs.ts` execution→IR, or IR→GIA by inspecting the earliest divergent artifact. Structured diagnostics can preserve code/severity/source plus entry, location, graph, node, related-node, and Composite context and can be persisted across child processes; these fields refine a stage/seam diagnosis but do not replace artifact inspection.

#### 适用边界与失效条件

A diagnostic code or final GIA symptom alone does not prove an earlier-stage root cause, editor acceptance, or game behavior. Fields are optional and source classification is scoped to current reporters. Revalidate when artifact boundaries, diagnostic schema/persistence/aggregation, or focused reporter tests change.

<!-- CLAIM:END clm_01KYH64VA25BVS99BD4K1P5F5S -->

<!-- CLAIM:START clm_DB636CBE0663DA9543E864867E -->

### Diagnostic provenance survives Stage 1 to Stage 2 lowering and runtime node registration

Current compilation preserves diagnostic provenance from TypeScript source through lowering and runtime records: diagnostics can retain entryFile, source location, originKind (user, lowering, or runtime-helper), graph/event/timer/Composite context, and IR node context. Generated provenance is reported as source=generated, while user-origin diagnostics remain source=user; console and warnings JSON use the same additive diagnostic object contract.

#### 适用边界

This is current implementation and focused automatic regression only. The original gameplay warning acceptance remains open; provenance fields do not by themselves prove source-map accuracy for every lowering, editor behavior, or game behavior.

<!-- CLAIM:END clm_DB636CBE0663DA9543E864867E -->
