# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
npm install                         # 安装依赖
npm run build                       # 清理 dist 并编译 TypeScript
npm test                            # 构建、生成测试用例并执行完整 GIA 测试配置
npm run quicktest                   # 构建后直接执行已有测试
npm run dev                         # 构建并启动 gsts CLI 的增量开发模式
npm run example                     # 构建并编译 examples
npm run gen                         # 重新生成 src/definitions，再格式化生成文件
npm run to-gs                       # 运行 TS -> .gs.ts 转换器
npm run trace-exec                  # 分析执行流
npm run trace-dataflow              # 分析数据流
npm run gia:decode                  # 解码 GIA
npm run gia:inspect                 # 检查 GIA
npm run gia:compare                 # 比较 GIA
npm run gia:diff                    # 查看 GIA 差异
npx eslint .                        # ESLint 检查（先运行 npm run build）
npx prettier --check .              # Prettier 格式检查
npx prettier --write <path>         # 格式化指定文件
```

`npm test` 的 `pretest` 会清理生成测试目录；需要快速验证已有产物时使用 `npm run quicktest`。单个脚本或复合分析可直接用 `tsx <path>` 运行，例如 `NODE_OPTIONS='--no-deprecation' tsx tests/composite/trace-exec-flow.ts`。测试配置位于 `gsts.test.config.ts`，默认入口为 `tests`；普通示例配置位于 `gsts.config.ts`，入口为 `examples`。

## 架构概览

这是一个 TypeScript 工具链和 npm 包，用于把 Miliastra Wonderland 的 TypeScript 用户逻辑编译为可注入的节点图资源，并提供 CLI、运行时 DSL、类型定义和 GIA 注入能力。主包入口是 `src/index.ts`，发布产物由 `dist/` 和 `types/` 提供；`create-genshin-ts/` 是独立的项目脚手架 npm 包，不是主包的子模块运行时。

核心编译链路：

1. `src/compiler/ts_to_gs_pipeline.ts` 将符合 DSL 约束的 TS 源文件转换为 `.gs.ts` 节点函数调用形式。
2. `.gs.ts` 被转换为描述节点、引脚、连接和类型的 IR `.json`；IR 合并、变量重写和优化位于 `src/compiler/ir_*`。
3. `src/compiler/ir_to_gia_transform/` 将 IR 转成 GIA 图结构，包含运行时模式处理、节点/变量转换和布局；`src/compiler/ir_to_gia_pipeline.ts` 负责批量/并行输出，最终写入 `.gia`。
4. `src/injector/` 读取和修改 GIA/GIL 资源，负责节点图发现、资源/文件夹定位、信号节点与二进制补丁等注入操作；它不是 TS 编译阶段的替代品。

主要源码区域：

- `src/compiler/`: TS→GS、GS→IR、IR 合并/优化、IR→GIA 及布局。
- `src/runtime/`: 编译 DSL 使用的运行时值、核心 API、服务端图运行时和全局定义。
- `src/definitions/`: 由资源/第三方节点定义生成的事件、函数、类型和别名；不要手改，使用 `npm run gen`。
- `src/cli/`: `gsts` 命令行入口，处理配置、单次/批量/增量构建、地图查询、打开与注入；入口主流程在 `src/cli/gsts.ts`。
- `src/injector/`: GIA/GIL 解析、图/资源定位及安全注入。
- `src/eslint/`: 针对 Genshin-TS DSL 语义限制的 ESLint 插件。
- `src/thirdparty/`: 第三方 GIA/节点编辑器定义及 protobuf 数据；不要手改。
- `tests/`: 编译、节点定义、运行时语义及 GIA 输出测试；`tests/composite/` 多为专项分析/复现工具，默认不纳入主测试配置。
- `scripts/`: 定义生成、测试生成、构建后处理和语义断言脚本。
- `configs/`, `types/`, `types-local/`: 发布配置、公共声明及本地 TypeScript 类型支持。
- `docs/architecture/`: 编译器、IR、注入器、DSL 和布局的深入设计文档；遇到跨模块问题优先查对应架构文档。

默认编译产物写入 `dist/`：`.gs.ts` 用于确认 DSL 转换结果，`.json` 用于检查 IR 节点/连线/类型，`.gia` 是最终可注入产物。`gsts.config.ts` 和 `gsts.test.config.ts` 控制 entries、输出目录、注入目标及优化选项。

## 修改约束

- 遵循目标目录最近的 `AGENTS.md`；根目录规则包括：相对 TypeScript import 使用 `.js` 后缀、无分号、单引号、100 字符宽。
- 处理真实 GIA 结论、游戏状态、布局取舍、注入或破坏性操作时不要猜测，先确认并以源码、测试和真实 GIA 证据为准。
- 不要手改 `src/definitions/` 或 `src/thirdparty/`；前者通过 `npm run gen` 生成，后者来自第三方数据。
- 不要手改 `dist/`；它是构建输出。
- 节点图作用域只支持受限 TypeScript 子集：不能使用 Promise/async/await/递归；条件必须为 `boolean`；整数运算优先使用 `bigint`；`Object.*`/`JSON.*` 通常不可用；空数组需要可推断元素类型。
- `g.server({ id }).on(...)` 是入口事件注册方式，同 ID 入口会合并；`gstsServer*` 必须是顶层函数且只能有一个末尾 `return`。
- 图变量通过 `g.server({ variables: ... })` 声明，并使用 `f.get`/`f.set` 读写。计时器使用 `setTimeout`/`setInterval`，注意捕获和性能约束。
- 涉及编辑器创建的资源（元件、商店、货币、背包、UI、信号、文本气泡等）时，区分代码能完成的部分和仍需手动编辑器设置的前置条件。
- `create-genshin-ts/` 按独立 npm 包维护；其模板拥有自己的 `CLAUDE.md`/`AGENTS.md`，修改模板时优先遵循模板规则。
