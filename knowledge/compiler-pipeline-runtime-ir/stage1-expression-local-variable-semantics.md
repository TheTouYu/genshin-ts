# Stage 1 expression and LocalVariable semantics

TS AST lowering, expression classification, checked LocalVariable planning, and Stage 1 diagnostic boundaries.


<!-- CLAIM:START clm_01KYH64TV56ENY9PTZX9HJDB22 -->

### Stage 1 classifies expression semantics before checked LocalVariable lowering

Stage 1 transforms supported TypeScript AST into `.gs.ts` calls, classifies expressions as storable runtime values, collections, Composite results, timer/flow markers, or unsupported objects, and permits LocalVariable initialization/assignment only when a concrete storable type is known and assignments remain compatible.

#### 适用边界与失效条件

This is current Stage 1 behavior, not a promise that arbitrary JavaScript values are storable or that later IR/GIA encoding is correct. Revalidate when expression classification, VarPlan consumers, checked lowering, supported DSL syntax, or the focused Stage 1 regression changes.

<!-- CLAIM:END clm_01KYH64TV56ENY9PTZX9HJDB22 -->
