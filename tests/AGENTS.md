# `tests/`：编译器与 Composite 回归

## 适用范围

这里包含主编译测试、生成测试、风险 fixture 和单独运行的 Composite/GIA 测试。测试通过通常表示管线成功生成，不自动表示游戏行为正确。

## 修改前

- 先确认测试属于主编译管线、生成测试、风险 fixture 还是 `tests/composite/` 的独立 harness。
- 先查现有 graph ID 和 fixture 模式；新增手写图使用未占用的安全范围 ID，避免与生成器保留范围冲突。

## 修改规则

- 主编译测试放在 `tests/` 根目录；不要手工向 `tests/generated/` 或 `tests/enum_cases/` 添加会被 `pretest` 清理的文件。
- 需要长期保留的生成目录 fixture，必须有明确理由并同步更新 `scripts/clean-tests.mjs` 的保留规则。
- `tests/composite/` 不会被主测试命令自动执行，使用
  `npx tsx tests/composite/<file>.ts` 单独运行；它的输出文件和真实 GIA 样本不能随意覆盖。
- 新回归应锁定可观察的 IR/GIA 结构或错误契约；自动回归、raw/wire 对比和用户游戏验证分别说明。
- fixture 必须真实表达声称验证的业务语义。若要验证“仅某分支执行写入”，写入必须位于对应回调内；不要使用空的双分支后接共享写入，因为这种图虽然拓扑合法且忠实于源码，实际写入仍是无条件的，会误导编辑器与游戏核验。
- 涉及生产 Composite/timer 行为的回归，应保留位于 `tests/` 根目录的最小入口和独立配置，使其可以单独生成 `.gia`；不要只保留无法经过 Stage 1 timer metadata 的 `tests/composite/` runtime harness。

## 验证

- 优先运行新增或受影响的测试；必要时使用 `npm run quicktest` 或 `npm test`。
- 若验收包含游戏验证，报告必须分别列出测试文件、GIA 生成、导入/复制和用户游戏内结果；用户未确认前不得标记为已修复。
- 改动生产 TypeScript 时先运行 `npm run build`；最后运行 `git diff --check`。

## 不要做

- 不要让测试依赖真实注入成功、用户本机游戏目录或未确认的地图参数。
- 不要修改 golden `.gia` 或真实参考来掩盖回归，除非任务明确要求并有相应证据。
