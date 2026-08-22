# CLAUDE.md — Genshin-TS 仓库知识

> 本文件与根 `AGENTS.md` 每次会话都会注入模型上下文，务必精简。本文件只放**仓库知识**
> （命令/架构/代码边界/DSL 语法）；行为纪律、技能路由、写回红线见 `AGENTS.md`，不在此重复。

## 常用命令

```bash
npm run build                        # tsc 编译（prebuild 清空 dist）
npm test                             # 构建 + 生成测试用例 + 完整 GIA 测试配置（--noinject）
npm run quicktest                    # 构建后直接执行已有测试（快速验证）
npm run dev                          # gsts CLI 增量开发模式
npm run example                      # 构建并编译 examples
npm run gen                          # 重新生成 src/definitions 并格式化
npm run to-gs                        # 运行 TS -> .gs.ts 转换器
```

专项测试/生成（`test:*`、`gen:*`、`health:*`、`docs:*`、`trace-*` 等）按需从 `package.json` scripts 查询（`npm run` 列出全部），不在此展开；GIA/GIL 只读工具见下。

GIA/GIL 只读工具（`npx tsx tools/<file>.ts <样本>`）：

```bash
npm run gia:decode / gia:inspect / gia:compare / gia:diff   # GIA 解码/检查/比较/差异
npm run gil:parse-node-graph / gil:trace-exec / gil:trace-dataflow  # 真实 .gil 图分析
```

说明：`npm test` 的 `pretest` 会清理生成测试目录，快速验证已有产物用 `quicktest`；两者都保持 `--noinject`。
测试配置 `gsts.test.config.ts`（入口 `tests`），普通示例配置 `gsts.config.ts`（入口 `examples`）。

## 架构概览

TypeScript 工具链 npm 包：把 Miliastra Wonderland 的 TS 用户逻辑编译为可注入的节点图资源，
并提供 CLI、运行时 DSL、类型定义和 GIA 注入能力。主包入口 `src/index.ts`；发布产物 `dist/`、`types/`；
`create-genshin-ts/` 是独立脚手架包，不是主包子模块。

核心编译链路：

1. `src/compiler/ts_to_gs_transform/`（+ `ts_to_gs_pipeline.ts`）把符合 DSL 约束的 TS 源转换为 `.gs.ts` 节点函数调用。
2. `src/compiler/gs_to_ir_json_transform/` 把 `.gs.ts` 转换为描述节点/引脚/连接/类型的 IR `.json`；IR 合并、
   变量重写和优化在 `src/compiler/ir_*`。
3. `src/compiler/ir_to_gia_transform/`（+ `ir_to_gia_pipeline.ts`）把 IR 转成 GIA 图结构（运行时模式、节点/变量转换、
   布局、Composite），批量输出 `.gia`。
4. `src/injector/` 读取和修改 GIA/GIL 资源：节点图发现、资源/文件夹定位、信号节点与二进制补丁注入；不是编译阶段替代品。

主要源码区域：

- `src/compiler/`: 三阶段管线（TS→GS→IR→GIA）及布局；跨阶段契约 `src/runtime/IR.d.ts`。
- `src/runtime/`: DSL 运行时值、核心 API、服务端图运行时和全局定义。
- `src/definitions/`: 由资源/第三方节点定义生成的事件、函数、类型和别名（含 `client_*` 客户端节点图定义）；不手改，用 `npm run gen`。
- `src/cli/`: `gsts` 命令行入口（`gsts.ts`）与各资产子命令（`assets_*.ts`、`gil_*.ts`、`maps.ts`），处理构建/地图/注入/写回。
- `src/injector/`: GIA/GIL 解析、图/资源定位及安全注入。
- `src/eslint/`: 针对 Genshin-TS DSL 语义限制的 ESLint 插件。
- `src/thirdparty/`: 第三方 GIA/节点编辑器定义及 protobuf 数据；不手改，走 vendor 同步（`src/compiler/gia_vendor.ts`）。
- `tests/`: 编译、节点定义、运行时语义及 GIA 输出测试；`tests/composite/` 为专项分析/复现工具，默认不纳入主测试配置。
- `scripts/`: 定义生成、测试生成、构建后处理、client/server 节点图元数据与断言脚本。
- `tools/`: 只读 GIA/GIL 分析工具（decode/parse/explain/diff 等，`npx tsx` 运行，不写游戏文件）。
- `configs/`、`types/`、`types-local/`: 发布配置、公共声明及本地 TS 类型支持。
- `docs/architecture/`: 编译器、IR、注入器、DSL、布局、client-gia-encoding 设计文档；跨模块问题优先查对应文档。
- `examples/`: 可玩 demo 项目（rubik-2x2、rubik-3x3、lights-out、football、cube-replica-c4），各带独立配置与 PROGRESS 文档。

## DSL 语法速记

- 节点图作用域只支持受限 TS 子集：不能用 Promise/async/await/递归；条件必须为 `boolean`；整数运算优先 `bigint`；`Object.*`/`JSON.*` 通常不可用；空数组需要可推断元素类型。
- `g.server({ id }).on(...)` 是入口事件注册方式，同 ID 入口会合并；`gstsServer*` 必须是顶层函数且只能有一个末尾 `return`。
- 图变量通过 `g.server({ variables: ... })` 声明，用 `f.get`/`f.set` 读写。计时器用 `setTimeout`/`setInterval`，注意捕获和性能约束。
- 编译产物默认写入 `dist/`：`.gs.ts`（DSL 转换结果）、`.json`（IR 节点/连线/类型）、`.gia`（最终可注入产物）。

## 修改约束

- 遵循目标目录最近的 `AGENTS.md`；根目录规则：相对 TS import 使用 `.js` 后缀、无分号、单引号、100 字符宽。
- 不要手改 `src/definitions/`（用 `npm run gen`）、`src/thirdparty/`（走 vendor 同步）、`dist/`（构建输出）。
- **改 DSL/编译/注入后必须先回读真实 `.gil` 核验执行流**（细则见根 `AGENTS.md`"读图核验红线"）。
- 涉及编辑器创建的资源（元件、商店、货币、背包、UI、信号、文本气泡等）时，区分代码能完成的部分和仍需手动编辑器设置的前置条件。
- `create-genshin-ts/` 按独立 npm 包维护；其模板拥有自己的 `CLAUDE.md`/`AGENTS.md`，修改模板时优先遵循模板规则。
- 处理真实 GIA 结论、游戏状态、布局取舍、注入或破坏性操作时不要猜测，先确认并以源码、测试和真实 GIA 证据为准。
