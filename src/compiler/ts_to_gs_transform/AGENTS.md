# `src/compiler/ts_to_gs_transform/`：Stage 1 TS → `.gs.ts`

## 适用范围

这里使用 TypeScript Compiler API，把 `g.server(...).on(...)`、`gstsServer*`、控制流和受支持表达式转换为 `f.*` 调用形式。

## 修改前

- 先确认需求是语句、表达式、列表方法、内建函数、循环、常量折叠、作用域检查还是诊断格式。
- 修改 DSL 支持范围时，同时检查 ESLint 规则、运行时 API、Stage 2 IR 表达和现有测试；不能只放宽其中一层。
- 改动大型分发函数前先找出可独立的语法类别和现有 helper，避免继续堆入主分发函数。

## 修改规则

- 保持严格类型，不使用 `any` 规避转换问题。
- 保持 `Env` 传递、位置诊断格式和 `f` 标识符匹配逻辑；不要假设运行时标识符固定叫 `f`。
- 用户 DSL 仍受限制：不要引入 Promise、async、递归、JSON、try/throw、with、标签语句或未建模的 JavaScript 语义。
- 新增列表方法或 Math/builtin 支持时，同步更新对应 ESLint allowlist 与转换实现。

## 验证

- 为新增或修复的语法建立最小编译 fixture；运行对应测试或 `npm run quicktest`。
- 改动生产 TypeScript 后运行 `npm run build`；最后运行 `git diff --check`。

## 不要做

- 不要通过生成不可执行的 `.gs.ts` 来假装支持语法。
- 不要只修改编译器而遗漏 ESLint、类型推断或诊断层的一致性。
