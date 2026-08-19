# `tests/`：编译器、CLI 与 Composite 回归

## 适用范围

这里包含主编译测试、生成测试、CLI 资产回归、风险 fixture 和单独运行的 Composite/GIA 测试。测试通过通常表示管线成功生成或 CLI 行为符合断言，不自动表示游戏行为正确。

## 关键目录

- `tests/generated/`、`tests/enum_cases/`：由 `pretest` 清理的生成目录，不要手工添加长期文件。
- `tests/composite/`：独立 Stage 3/GIA/真实文件复现 harness，`npx tsx tests/composite/<file>.ts` 单独运行。
- `tests/layout/physics-motion/`：独立物理/布局复现 harness，不属于普通 Stage 1 批量入口。
- `tests/gil_*.ts`、`tests/official_prefabs.ts`：GIL 资产/变量/实体/元件读写回归，直接 `npx tsx` 运行，可接受真实样本路径但不得写真实地图。

## 修改前

- 先确认测试属于主编译管线、生成测试、CLI 资产测试、风险 fixture 还是 `tests/composite/` 的独立 harness。
- 先查现有 graph ID 和 fixture 模式；新增手写图使用未占用的安全范围 ID，避免与生成器保留范围冲突。
- CLI/GIL 资产测试需要真实 `.gil` 样本时，优先使用 `~/genshin-ts-evidence/` 或 `user_edit/` 只读快照，并复制到临时目录后再写；禁止直接写真实地图。

## 修改规则

- 主编译测试放在 `tests/` 根目录；不要手工向 `tests/generated/` 或 `tests/enum_cases/` 添加会被 `pretest` 清理的文件。
- 需要长期保留的生成目录 fixture，必须有明确理由并同步更新 `scripts/clean-tests.mjs` 的保留规则。
- 新回归应锁定可观察的 IR/GIA 结构、CLI wire 或错误契约；自动回归、raw/wire 对比和用户游戏验证分别说明。
- fixture 必须真实表达声称验证的业务语义。若要验证“仅某分支执行写入”，写入必须位于对应回调内；不要使用空的双分支后接共享写入。
- 涉及生产 Composite/timer 行为的回归，应保留位于 `tests/` 根目录的最小入口和独立配置，使其可以单独生成 `.gia`；不要只保留无法经过 Stage 1 timer metadata 的 `tests/composite/` runtime harness。
- `tests/composite/**` 和 `tests/layout/physics-motion/**` 应在 `gsts.test.config.ts` 中整体排除，并通过各自 focused 配置或命令验证；删除旧 fixture 时同步清理排除项和当前文档引用。

## 验证

- 优先运行新增或受影响的测试；必要时使用 `npm run quicktest` 或 `npm test`（两者都保持 `--noinject`）。
- CLI-only 测试运行 `npx tsx tests/<file>.ts <样本>`；类型错误只有 `npm run build`/`npx tsc --noEmit` 能抓到。
- 若验收包含游戏验证，报告必须分别列出测试文件、GIA 生成、导入/复制和用户游戏内结果；用户未确认前不得标记为已修复。
- 改动生产 TypeScript 时先运行 `npm run build`；最后运行 `git diff --check`。

## 不要做

- 不要让测试依赖真实注入成功、用户本机游戏目录或未确认的地图参数。
- 不要修改 golden `.gia` 或真实参考来掩盖回归，除非任务明确要求并有相应证据。
- 不要把测试通过说成编辑器/游戏已核验。
