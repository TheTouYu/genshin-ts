# `src/eslint/`：DSL ESLint 插件

## 适用范围

这里实现 Genshin-TS DSL 的 ESLint 规则、作用域/类型工具和推荐配置。规则要与编译器可支持的语义保持一致。

## 修改前

- 先确认规则适用范围、是否需要类型信息、是否只作用于 server scope，以及编译器是否已有对应支持。
- 新增 DSL 语法或内建能力时，检查 Stage 1 转换和 ESLint allowlist 是否需要一起修改。

## 修改规则

- 每条规则使用 kebab-case 文件名，并在 `index.ts` 的规则表和 `configs.recommended` 中注册。
- 诊断通过 `formatMessage(lang, zh, en)` 输出中英文信息，不直接散落硬编码消息。
- 优先复用 `utils/scope.ts`、`ts_matchers.ts`、类型和 AST helper；不要用 `any` 绕过类型问题。
- 规则默认不要误伤 server scope 之外的代码，除非规则设计明确要求。

## 验证

- 为规则增加或更新最小 fixture，覆盖应报错和不应报错的场景。
- 先运行 `npm run build`，再运行对应 ESLint 或编译回归；最后运行 `git diff --check`。

## 不要做

- 不要只注册规则不放入推荐配置。
- 不要允许编译器无法转换的 DSL 语义，或让 ESLint 禁止已经稳定支持的语义而不说明兼容策略。
