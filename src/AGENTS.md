# `src/` 源码维护规则

## 适用范围

本规则适用于所有生产源码。进入子目录后，必须继续读取最近的 `AGENTS.md`；子目录规则优先于本文件。

## 修改前

- 先确认改动属于运行时、编译器、CLI、注入器、ESLint、定义或 vendor 的哪一层，避免跨层顺手修改。
- 涉及编译器结构、调用链或影响范围不明确时，先使用 codebase-memory，再读取实际源码和 focused tests 验证。
- 涉及 Composite、GIA、IR、地图或注入时，先按 composite 文档导航规则读取最小相关文档；不要把历史 handover 当当前 API。

## 修改规则

- 保持 TypeScript 相对导入带 `.js` 后缀、无分号、单引号和 100 字符宽格式。
- 保持阶段边界：Stage 1 产生 `.gs.ts`，Stage 2 产生 IR，Stage 3 消费 IR 并产生 `.gia`；不要通过跨阶段临时耦合绕过问题。
- `src/runtime/IR.d.ts` 是跨阶段类型契约。改变它时必须检查所有生产者、消费者和相关回归。
- 不手改 `src/definitions/` 或 `src/thirdparty/`；分别使用生成流程或 vendor 同步流程。
- 自动回归、GIA 文件生成、注入成功和游戏行为验证必须分开报告。

## 验证

- 先运行与改动对应的最小测试或脚本；改动 TypeScript 生产代码后运行 `npm run build`。
- 每次修改运行 `git diff --check`；共享编译器或运行时行为变动时，根据影响扩大测试范围。

## 不要做

- 不要为了通过单个测试而破坏公共 IR、capture、Composite、注入安全或产物后缀约定。
- 不要在没有用户确认时操作游戏目录、注入目标或覆盖用户文件。
