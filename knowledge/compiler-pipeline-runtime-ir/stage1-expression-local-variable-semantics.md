# Stage 1 expression and LocalVariable semantics

TS AST lowering, expression classification, checked LocalVariable planning, and Stage 1 diagnostic boundaries.


<!-- CLAIM:START clm_01KYH64TV56ENY9PTZX9HJDB22 -->

### Stage 1 classifies expression semantics before checked LocalVariable lowering

Stage 1 transforms supported TypeScript AST into `.gs.ts` calls, classifies expressions as storable runtime values, collections, Composite results, timer/flow markers, or unsupported objects, and permits LocalVariable initialization/assignment only when a concrete storable type is known and assignments remain compatible.

#### 适用边界与失效条件

This is current Stage 1 behavior, not a promise that arbitrary JavaScript values are storable or that later IR/GIA encoding is correct. Revalidate when expression classification, VarPlan consumers, checked lowering, supported DSL syntax, or the focused Stage 1 regression changes.

<!-- CLAIM:END clm_01KYH64TV56ENY9PTZX9HJDB22 -->

<!-- CLAIM:START clm_36C2A562146E76BED4BFF7DE89 -->

### Stage 1 recognizes list length as int and preserves timer handle capture metadata

在当前 Stage 1 实现中，列表 length 表达式被分类为可存储的 int runtime value；timer handle 的捕获字典元数据会在转换时登记并保留，以支持后续 clearInterval 等捕获使用。该结论由 expression semantics、timer transform 和 stage1_expression_semantics_test.ts 的自动回归支持。

#### 适用边界

仅适用于当前 gsts Stage 1 TS→GS 实现和提交 8e36c5a 覆盖的列表 length 与 timer handle 形态；不证明任意 JavaScript 对象可存储，也不证明后续 GIA、编辑器或游戏行为。相关 lowering、timer metadata 或 focused test 改变时重新验证。

<!-- CLAIM:END clm_36C2A562146E76BED4BFF7DE89 -->

<!-- CLAIM:START clm_187AB1C3F90F1E99672658EE8D -->

### Batch compiler tests enforce no-injection execution

当前 package.json 的 npm test 与 npm run quicktest 都显式向 gsts.test.config.ts 传入 --noinject；2026-07-31 的 npm test 日志确认打印跳过注入警告，因此批量测试的 GIA 生成不会因配置中的 inject 设置而写入真实地图。

#### 适用边界

这是当前测试脚本与自动测试日志的 CLI/工作流契约，不是对历史命令或用户自行调用 gsts 的保证；只证明本次命令跳过注入，不证明 GIA、编辑器或游戏行为。修改 package.json、测试配置或测试入口时重新验证。

<!-- CLAIM:END clm_187AB1C3F90F1E99672658EE8D -->
