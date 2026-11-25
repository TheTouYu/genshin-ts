# CLAUDE.md — Genshin-TS 仓库知识

> 本文件与根 `AGENTS.md` 每次会话都会注入模型上下文，务必精简。本文件只放**仓库知识**
> （命令/架构/代码边界/DSL 语法）；行为纪律、技能路由、写回红线见 `AGENTS.md`，不在此重复。

## 长期任务入口（新会话先读这一份）

当前长期任务的分层档案：**`docs/longtask/INDEX.md`**（L0，3 分钟读完）→ **`docs/longtask/LINES.md`**（L0.5，**并行线看板**）。
**任务是多条线并行**（2026-10-24 用户定）：`football` / `sim-2d` / `gui-agi` 各有判据与断点，**没有"单一活动分支"**；
本次会话推哪条线**由用户首句指定**（没点明就问），线表与断点以 `LINES.md` §二 为准。
收尾只改本线：`LINES.md` 那一行 + 本线 dossier + `03-state.md` 本线分节。
维护流程见技能 `longtask-dossier`（含体检脚本 `longtask_check.py`，已校验多线字段）。
**多任务并行**：先看 `docs/LONG_TASKS.md`（例 `docs/longtask-defender3/` 守墙者 3D 重制）。

## 常用命令

**运行环境**：本机自 2026-11-25 起为 **Win11**（Linux/wine 路径为历史）。仓库的 Python 件一律 `node scripts/py.mjs <脚本> [参数]`
（自动找 Python、子进程 UTF-8）；提交钩子经它找 Python，提交无需任何设置；新机器首次就绪两条命令：
`bash scripts/install-git-hooks.sh`、`node scripts/setup-win-esbuild.mjs`。PKC（`tools/pkc.py`）与耗时监控（`cmdmon`）在 Win11 **尚不可用**。
游戏存档根见 `examples/football/AGENTS.md` §〇，机器读数见 `docs/longtask/03-state.md` §四。

```bash
npm run build                        # tsc 编译（prebuild：ambient 守卫 → 清空 dist.tmp 并从 dist 播种；
                                      #   成功后 dist.tmp→dist。增量缓存见「类型与运行时单副本」节，改一个文件约 7~8 秒）
node dist/src/cli/gsts.js --config <cfg> --noinject   # 客户端图编译必须用 dist CLI（npx tsx src/cli ⇒ IR 恒 []、假绿）
npm run build:clean                  # 精确构建（先删 dist + 增量缓存再全量，约 66 秒；发布/交付用）
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
node scripts/py.mjs .agents/skills/debug-log-investigator/scripts/gia_log.py <日志.gia> records|frames|perf|ops   # 调试日志分析（records --summary 聚合 / ops 操作时间线 / perf 每秒负载）
node scripts/py.mjs .agents/skills/debug-log-investigator/scripts/gia_log_flow.py <日志.gia> --gil <地图.gil> --rec N [--client] [--trace-node I]   # 事件线视图（循环折叠×N）+ 数据倒查（服务端/客户端双模式）
npx tsx src/cli/gsts.ts variables:verify --gil <file> [--scope assets|graph|local-server|local-client|all] [--entity <id>] [--graph <id>]  # 变量 wire 照规律表逐字节核验（tests/fixtures/variables-wire-rules.json，只读 PASS/DIFF)
```

PKC 知识树（长期记忆）查询（`node scripts/py.mjs tools/pkc.py`，只读；缺关键信息先查它，见根 `AGENTS.md`）：

```bash
node scripts/py.mjs tools/pkc.py query "<关键词1 关键词2 关键词3>" --level 2   # 全库 claim 检索；必须带 --level 2（默认 level 1 只搜节点标题，不搜 claim 内容）
node scripts/py.mjs tools/pkc.py progressive-query --context <ctx> --intent "<问题>" --max-level 2 --limit 3 --check-authority
node scripts/py.mjs tools/pkc.py tree                                      # 看全部 topic 与 keywords（可当查询词）
node scripts/py.mjs tools/pkc.py knowledge-search --status any "<词>"      # 含 pending_review 的检索
node scripts/py.mjs tools/pkc.py knowledge-search --semantic "<完整问题>"   # 向量化语义检索（hybrid）；中文长句/coverage gap 时用
# context 清单（project-intelligence.json → memory.contexts）：
#   compiler-diagnostics / static-gil-assembly-production / official-guide / game-engine-rules（游戏引擎实测规则，2026-08-29 新增）
# progressive-query 命中结果在响应的 `claims` 字段（`results` 键只用于 knowledge-search）。
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

主要源码区域（细节见各目录自己的 `AGENTS.md`，进入目录会自动注入）：

- `src/compiler/`：三阶段管线（TS→GS→IR→GIA）及布局；跨阶段契约 `src/runtime/IR.d.ts`。`src/runtime/`：DSL 运行时值、核心 API、服务端图运行时和全局定义。
- `src/definitions/`：生成的事件、函数、类型和别名（不手改，用 `npm run gen`）；`src/thirdparty/`：第三方定义与 protobuf 数据（不手改，走 vendor 同步 `src/compiler/gia_vendor.ts`）。
- `src/cli/`：`gsts` 入口与各资产子命令（`assets_*.ts`、`gil_*.ts`、`maps.ts`）；`src/injector/`：GIA/GIL 解析、资源定位及安全注入；`src/eslint/`：DSL 语义限制的 ESLint 插件。
- `tests/`：编译、节点定义、运行时语义及 GIA 输出测试（`tests/composite/` 为专项工具，默认不入主配置）；`scripts/`：定义与测试生成、构建后处理、元数据与断言脚本。
- `tools/`：只读 GIA/GIL 分析工具（`npx tsx` 运行，不写游戏文件）；`configs/`、`types/`、`types-local/`：发布配置、公共声明及本地类型支持。
- `docs/architecture/`：编译器、IR、注入器、DSL、布局、client-gia-encoding 设计文档，跨模块问题优先查；`examples/`：可玩 demo，清单见 `examples/AGENTS.md` 路由表。

## DSL 语法速记

- 节点图作用域只支持受限 TS 子集：不能用 Promise/async/await/递归；条件必须为 `boolean`；整数运算优先 `bigint`；`Object.*`/`JSON.*` 通常不可用；空数组需要可推断元素类型。
- `g.server({ id }).on(...)` 是入口事件注册方式，同 ID 入口会合并；`gstsServer*` 必须是顶层函数且只能有一个末尾 `return`。
- 图变量通过 `g.server({ variables: ... })` 声明，用 `f.get`/`f.set` 读写。计时器用 `setTimeout`/`setInterval`，注意捕获和性能约束。
- 编译产物默认写入 `dist/`：`.gs.ts`（DSL 转换结果）、`.json`（IR 节点/连线/类型）、`.gia`（最终可注入产物）。

## 类型与运行时单副本（2026-08-30 修复，改类型/构建配置必读）

- tsc 类型检查统一走 **src 单副本**；tsx 运行时统一走 **dist 单副本**（src/dist 双副本会导致 branded 类型不兼容）。
- 新增 tsx spawn / CLI 入口必须给 runner 注入 `TSX_TSCONFIG_PATH=tsconfig.tsx.json`，路径用 `resolveTsxConfigPath(__dirname)`，不要写死相对层级。
- 改 tsconfig/类型配置后验证解析方向：`node --import tsx -e "console.log(import.meta.resolve('genshin-ts/runtime/core'))"`——输出 `src/...`=类型检查侧；`dist/...`=运行时侧。
- 完整根因（888 错、`kCtxStack` 分裂、`Cannot resolve tsconfig`）见 `docs/maintenance/retrospective-2026-08-30-build-gate-and-dual-copy.md`。

**构建增量缓存五条规则**（2026-09-16 修；机制与事故复盘见 `scripts/build.mjs` 头注，改构建入口前先读）：

1. tsbuildinfo 在 `node_modules/.cache/gsts/`（不在 `dist.tmp/`）；改一个文件后 `npm run build` 约 7~8 秒，冷构建约 66 秒；增量构建照常抓类型错误。
2. **必须「播种」**：tsc 增量只写变更文件，而 build 结尾是整目录替换 `dist.tmp → dist`——`prebuild` 先把 `dist` 整个拷进 `dist.tmp`，否则 dist 会被换成残目录。
3. **`dist` 缺失时必须清缓存**（否则 tsc 认为输出已最新而不 emit，dist.tmp 又是空的 → 丢产物）；`scripts/build.mjs` 已处理。
4. **增量态先写 staging，`dist.tmp → dist` 替换成功后才提升为提交态**，任何一步失败即丢弃 staging——否则 tsc 失败时已推进的 tsbuildinfo 会让下一次构建跳过 emit，被丢的改动永久消失且构建报成功。
5. **已知代价：陈旧产物残留**（删掉 .ts 后旧 .js 仍在 dist）。要精确产物树用 `npm run build:clean`（发布/交付走 clean，日常迭代走 `build`）；清缓存只删 `node_modules/.cache/gsts/`。

## 修改约束

- 遵循目标目录最近的 `AGENTS.md`；根目录规则：相对 TS import 使用 `.js` 后缀、无分号、单引号、100 字符宽。
- 不要手改 `src/definitions/`（用 `npm run gen`）、`src/thirdparty/`（走 vendor 同步）、`dist/`（构建输出）。
- **改 DSL/编译/注入后必须先回读真实 `.gil` 核验执行流**（细则见根 `AGENTS.md`"读图核验红线"）。
- 涉及编辑器创建的资源（元件、商店、货币、背包、UI、信号、文本气泡等）时，区分代码能完成的部分和仍需手动编辑器设置的前置条件。
- `create-genshin-ts/` 按独立 npm 包维护；其模板拥有自己的 `CLAUDE.md`/`AGENTS.md`，修改模板时优先遵循模板规则。
- 处理真实 GIA 结论、游戏状态、布局取舍、注入或破坏性操作时不要猜测，先确认并以源码、测试和真实 GIA 证据为准。
