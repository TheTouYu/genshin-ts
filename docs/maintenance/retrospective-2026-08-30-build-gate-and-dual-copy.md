# 完整复盘：构建门禁修复与 src/dist 双副本根因（2026-08-30）

> 范围：2026-08-30 会话「未处理项目盘点 + P0 优先处理」全历程（6 笔提交 `243bf0e`→`a0b5d1c`）
> 视角：构建门禁断裂的连锁效应 + 同一「双副本」问题的类型面与运行时面
> 证据：提交 `243bf0e`（build 888 错→0）/ `4298282`+`e00bf6b`（timer dispatch）/ `235bdff`（tsx 单副本）/
>   `e7fad95`（工作树收尾）/ `a0b5d1c`（账本）；`npm run build` exit 0、`npm run quicktest` exit 0（67 GIA）
> 状态：已闭环（双门禁恢复绿）；O-2026-08-27-01 修复带 4 场景回归；真实地图注入核验待用户

## 一、错误谱系总览

| # | 层 | 具体错误 | 根因 | 修复 | 提交 |
|---|---|---|---|---|---|
| 1 | 类型 | `client_graph.ts` 用未定义 `ClientGiaPin` + 对必填 number 字段赋 undefined | 半成品提交（normalizeClientNodesEditorWire，v15/v16 wire 归一化） | EditorWire* 类型收窄 | 243bf0e |
| 2 | 类型 | 888 错：examples 全量 TS7006 + branded 类型不兼容 | types-local/gsts 同时引用 src 全局 + dist 模块；08-16 加 private brand 后 nominal 分裂；dist 缺 postbuild 产物（server_globals.global.d.ts）使全局类型加载失败 | types-local export 改 src + tsconfig paths 单副本；补 postbuild 产物 | 243bf0e |
| 3 | 运行时 | `gsts.f is only available in server_* ctxType (current: javascript)` 海啸（quicktest 7+1、football 编译失败） | tsconfig paths 被 **tsx 运行时**应用：.gs.ts 包 import 走 src 副本，与 CLI（dist）双副本，`kCtxStack` unique symbol 分裂 → ctx 栈读不到 withCtx 的 push | `tsconfig.tsx.json`（无 paths）+ 三处 tsx spawn 注入 `TSX_TSCONFIG_PATH` | 235bdff |
| 4 | 工具 | `__dirname is not defined` | 我在 ESM 模块 config_loader.ts 用了未定义的 __dirname | fileURLToPath 定义 | 235bdff |
| 5 | 路径 | `Cannot resolve tsconfig at dist/tsconfig.tsx.json` | gs_to_ir_json_transform 目录比其它两处深一级，`..` 跳数少 1 | 4 级 `..` | 235bdff |
| 6 | 测试 | timer 回归 16 个 `possibly undefined` | optimizeTimerDispatchAggregate 返回 IRDocument（nodes 可选），断言缺 as any | 4 处 as any | e00bf6b |
| 7 | 业务 | `str is not a constructor`（football 编译失败） | 并行重构 dribble-field.ts 漏 import str，`new str()` 命中全局 str 工厂函数（非类） | import 补 str | 工作树 |
| 8 | 工具 | football 改动在 stash push 后反复「出现/消失」，stash 丢失 | git stash push 与 untracked/并行进程交互行为不可靠（stash list 无记录但改动回到工作树） | diff 备份（/tmp/football-wip.diff）+ 不再动他人工作 | — |

## 二、最近一次错误的完整调查链（双副本 ctx 分裂——最深的坑）

**现象**：`npm run quicktest` 7+1 失败，`gsts.f is only available in server_* ctxType (current: javascript)`；
同时 football 示例编译失败（同一错误）。build 门禁修复后立即出现（此前 build 一直红，从未暴露）。

**归因实验**：`git stash push -- optimize_timer_dispatch.ts` 单文件排除后重建，错误数不变（7+1）→
与 timer dispatch 改动无关。但注意：**此时 tsconfig paths 改动仍在**——实验没有排除它。

**决定性证据**：`node --import tsx -e "import.meta.resolve('genshin-ts/runtime/core')"` 输出
`file:///.../src/runtime/core.ts`（**src**）；纯 node 输出 dist。→ tsx 运行时应用了 tsconfig paths。

**机制定位**：`ensureGsts()` 的 `f` getter 闭包引用首次创建时的 ctx（stack 挂在
`g[kCtxStack]`，unique symbol 按模块实例隔离）；`withCtx` 由 CLI 的 dist core 调用。
.gs.ts 的包 import 解析到 src core 后，src/dist 两份 core 的 `kCtxStack` symbol 不同 →
withCtx push 的栈与 f getter 读的栈分裂 → ctx 恒为默认 `javascript`。

**修复**：新建 `tsconfig.tsx.json`（仅 module/moduleResolution 等最小选项，无 paths）；
三处 tsx spawn（gs_to_ir_json_transform/index.ts、ir_to_gia_pipeline.ts、config_loader.ts）注入
`TSX_TSCONFIG_PATH`。tsc 类型检查仍用 tsconfig.json（src 单副本），tsx 运行时统一 dist 单副本。
中间踩了两个自伤 bug（__dirname、路径深一级），各一轮 build 暴露。

**验证**：probe 实验（包内文件 + env → dist）；`npm run build` exit 0；`npm run quicktest` exit 0。

## 三、系统性根因（为什么反复出问题）

1. **构建门禁断裂无感知、无 CI**：08-16 加 private brand 后 build 实际一直红；后续提交用
   「src-only tsc 无新增错误（既有 8 条不动）」的局部验证代替全量门禁，把已知错误常态化，
   半成品与类型漂移累积 888 个无人发现。**没有 CI/门禁 = 错误无人知晓地堆积**。
2. **同一「双副本」问题有类型面和运行时面**：修好类型面（paths 指向 src）立即暴露运行时面
   （tsx 也读 paths）。单副本原则必须同时覆盖 tsc 与 tsx 两个消费方，且两者需要**不同**的副本
   方向（类型检查用 src 避免 dist 过期，运行时用 dist 与 CLI 一致）——这是本项目特有的约束。
3. **「双副本」是结构性问题而非单点 bug**：`types/gsts`（发布）与 `types-local/gsts`（开发）、
   package.json exports 的 dist 指向、tsconfig paths 的 src 指向、tsx 的运行时解析——五个消费方
   各自决定副本方向，任何不一致都导致 branded 类型（类型面）或 unique symbol 全局状态（运行时面）
   分裂。本次修复把五方收敛为「tsc→src、运行时→dist」的明确分工，但**未来新增消费方（新 spawn、
   新 CLI 入口、新工具脚本）时仍可能破坏**——需文档化 + 检查清单。

## 四、流程与方法论教训

- **归因实验先行**：stash 单文件 + 重建 + 对比错误数，正确隔离变量；`import.meta.resolve` 实测
  是 tsx 解析归因的决定性证据（比读 tsx 源码快一个数量级）。
- **「src-only tsc」这类局部验证的欺骗性**：提交说明声称「无新增错误」时，要先确认基线是什么、
  检查范围是否覆盖 tests/examples——否则 888 个错误就是这样累积的。
- **DSH 环境特性**：run_code/bash 命令对特殊字符（中文冒号、反引号、表格符 `|`）敏感，
  长命令/长 commit message 会触发解析错误——先落文件再执行，或拆分简化（本会话踩 3 次）。
- **git stash 与并行会话**：stash push 在 untracked 混入路径时行为不可靠（本次 push 输出成功但
  stash 未留存，football 改动反复出现）。重要工作先 `git diff > 备份` 再 stash；他人/并行工作
  不碰、只备份隔离。
- **路径深度自伤**：三处 spawn 的 `..` 跳数因目录深度不同而不同，同类代码必须逐处核对
  __dirname 实际深度（src 与 dist 下深度也不同——本会话踩两轮）。

## 五、风险探索与未闭合项

| 项 | 状态 |
|---|---|
| CI 门禁缺失（build/quicktest 只在本地，断裂无人知） | 登记 open-items（建议 GitHub Actions 或本地门禁脚本） |
| 未来新增 tsx spawn / CLI 入口必须带 TSX_TSCONFIG_PATH | 已写入 CLAUDE.md 架构约束 + 本复盘 |
| src/dist 双副本风险面（其它 unique symbol 全局状态） | 已收敛；混用场景（手动 node --import tsx 跑 .gs.ts）仍会分裂，文档标注 |
| O-2026-08-27-01 真实地图注入核验（3×3 整转 orbit22/23） | 待用户游戏复测 |
| 其他地图真实端残留（备份快照已扫无残留） | 下次注入时 --incoming 复核 |
| football 并行重构（工作树 9 文件 + REFACTOR-PLAN.md） | 用户自己的会话提交；str import 补丁已就位 |
| 命令残留垃圾文件（根目录无意义文件名 untracked） | 待用户确认删除 |

## 六、产出清单

- 提交：`243bf0e`（build 门禁）/ `4298282`+`e00bf6b`（timer dispatch）/ `235bdff`（tsx 单副本）/
  `e7fad95`（工作树收尾）/ `a0b5d1c`（账本）
- 新文件：`tsconfig.tsx.json`、`tests/timer_dispatch_default_chunk_test.ts`
- 修改：`types-local/gsts/index.d.ts`、`tsconfig.json`（paths）、`client_graph.ts`、`client_graph_support.ts`、
  `optimize_timer_dispatch.ts`、3 处 spawn（gs_to_ir_json / ir_to_gia / config_loader）、
  `examples/football/src/dribble-field.ts`（str import）、`.gitignore`
- 文档：本复盘 + open-items 账本登记（a0b5d1c）+ CLAUDE.md 同步（本次流程第 5 步）
- 验证：`npm run build` exit 0 / `npm run quicktest` exit 0（67 GIA）/ timer dispatch 4 场景 PASS
