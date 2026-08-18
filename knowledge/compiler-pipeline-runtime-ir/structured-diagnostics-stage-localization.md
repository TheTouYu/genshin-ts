# Structured diagnostics and stage localization

Locate failures by `.gs.ts`, IR, or GIA artifact and preserve structured graph/node/source context without guessing across stages.


<!-- CLAIM:START clm_01KYH64VA25BVS99BD4K1P5F5S -->

### 编译器诊断从第一个分歧产物开始并保留结构化上下文（Compiler diagnosis starts from the first divergent artifact and preserves structured context）

编译器失败应先通过检查最早分歧的产物把阶段定位到 源码→.gs.ts、.gs.ts 执行→IR 或 IR→GIA。结构化诊断可保留 code/severity/source 与 entry、location、graph、node、related-node、Composite 上下文，并可跨子进程持久化；这些字段细化阶段/seam 诊断但不替代产物检查。

A compiler failure should first be localized to source→`.gs.ts`, `.gs.ts` execution→IR, or IR→GIA by inspecting the earliest divergent artifact. Structured diagnostics can preserve code/severity/source plus entry, location, graph, node, related-node, and Composite context and can be persisted across child processes; these fields refine a stage/seam diagnosis but do not replace artifact inspection.

#### 适用边界

单个诊断码或最终 GIA 症状不能证明更早阶段的根因、编辑器验收或游戏行为；字段可选，source 分类限定于当前 reporter。

A diagnostic code or final GIA symptom alone does not prove an earlier-stage root cause, editor acceptance, or game behavior. Fields are optional and source classification is scoped to current reporters. Revalidate when artifact boundaries, diagnostic schema/persistence/aggregation, or focused reporter tests change.

<!-- CLAIM:END clm_01KYH64VA25BVS99BD4K1P5F5S -->

<!-- CLAIM:START clm_DB636CBE0663DA9543E864867E -->

### 诊断来源在 Stage1→Stage2 降级与运行时节点注册中存活（Diagnostic provenance survives Stage 1 to Stage 2 lowering and runtime node registration）

当前编译保留从 TS 源码经降级到运行时记录的诊断来源：诊断可保留 entryFile、源码位置、originKind（user/lowering/runtime-helper）、图/事件/定时器/复合上下文与 IR 节点上下文。生成来源报告为 source=generated，用户来源保持 source=user；console 与 warnings JSON 共用同一附加式诊断对象契约。

Current compilation preserves diagnostic provenance from TypeScript source through lowering and runtime records: diagnostics can retain entryFile, source location, originKind (user, lowering, or runtime-helper), graph/event/timer/Composite context, and IR node context. Generated provenance is reported as source=generated, while user-origin diagnostics remain source=user; console and warnings JSON use the same additive diagnostic object contract.

#### 适用边界

这是当前实现与 focused 自动回归；原有 gameplay warning 验收仍开放；来源字段本身不证明每个降级的 source-map 精度、编辑器行为或游戏行为。

This is current implementation and focused automatic regression only. The original gameplay warning acceptance remains open; provenance fields do not by themselves prove source-map accuracy for every lowering, editor behavior, or game behavior.

<!-- CLAIM:END clm_DB636CBE0663DA9543E864867E -->
