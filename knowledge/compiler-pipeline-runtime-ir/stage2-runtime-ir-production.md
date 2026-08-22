# Stage 2 runtime execution and IR production

Isolated `.gs.ts` execution, runtime registries, values/metadata, and IR document construction.


<!-- CLAIM:START clm_01KYH64TYS6MNC3JYD3EX74G04 -->

### Stage 2 隔离执行每个图脚本并把运行时注册表快照进 IR（Stage 2 executes each graph script in isolation and snapshots runtime registries into IR）

Stage 2 在隔离子进程中运行每个 .gs.ts 入口，导入以填充运行时 server/client 注册表，然后序列化 buildAllGraphRegistriesIRDocuments() 输出；运行时值与元数据通过 buildIRDocument() 变成字面量或连接参数，而不是直接编码成 GIA。

Stage 2 runs each `.gs.ts` entry through an isolated child process, imports it to populate runtime server/client registries, then serializes `buildAllGraphRegistriesIRDocuments()` output; runtime values and metadata become literal or connection arguments through `buildIRDocument()` rather than being encoded directly as GIA.

#### 适用边界

这是当前 gsts Stage 2 生产行为，不涵盖支持运行时之外的用户代码副作用或编辑器行为；server 与 client 注册表细节不同。

This describes current gsts Stage 2 production, not user-code side effects outside the supported runtime or editor behavior. Server and client registry details differ.

<!-- CLAIM:END clm_01KYH64TYS6MNC3JYD3EX74G04 -->

<!-- CLAIM:START clm_1CF9B63712693301D1FFA1FBD5 -->

### Stage 2 保留活动多流出分支尾直到存在真实续接（Stage 2 preserves active multi-outflow branch tails until a real continuation exists）

对基于回调的多流出节点，Stage 2 保留未被 return 终止的每个分支尾。无后续顺序节点的终止分支不需要续接、不发出默认续接警告；有顺序节点时每个活动分支尾都汇入该节点。对声明了多个 OutFlow 的复合做顺序调用仍是独立歧义案例：隐式续接用 OutFlow[0] 并发 GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION。

For callback-based multi-outflow nodes, Stage 2 keeps every branch tail that was not terminated by return. A terminal branch with no following sequential node needs no continuation and emits no default-continuation warning; when a sequential node follows, every active branch tail joins that node. Sequential calls to a Composite with multiple declared OutFlows remain a separate ambiguous case: implicit continuation uses OutFlow[0] and emits GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION.

#### 适用边界

这是提交 9ca2cc635d67800796c6ebc117978665af829a7e 的已提交 gsts 运行时到 IR 行为 + focused 自动回归证据，不建立编辑器导入/注入/游戏行为。

This is committed gsts runtime-to-IR behavior at 9ca2cc635d67800796c6ebc117978665af829a7e and focused automatic-regression evidence only. It does not establish consumer refreshed-snapshot warning counts, editor import, injection, or game behavior.

<!-- CLAIM:END clm_1CF9B63712693301D1FFA1FBD5 -->

<!-- CLAIM:START clm_E00EA364E3007B602561B972F7 -->

### examples 类型契约补齐：RuntimeExecNodeArg 与伪装返回值类型

提交 822481a（P4-4）闭合 examples 类型缺口：RuntimeExecNodeArg = value | DSL 伪装返回值类型（equal→boolean、dataTypeConversion→string、assemblyList→number[] 等运行时均为 value 实例），f.node/registerExecNode/registerDetachedExecNode 使用；defineComposite 接受 Stage 1 注入的 provenance；connect 源参接受 FlowMarkerRef；createEntity/createPrefab/createPrefabGroup 的 unitTagIndexList 接受 list<'int'> 实例；server_globals.d.ts 的 setTimeout/setInterval 声明转换器第三参 meta?: TimerOptions。npm run build 绿 + quicktest 66 GIA 绿。

#### 适用边界

纯类型层契约，不改运行时语义；证据为 tsc/quicktest 自动回归；无游戏验证需求。

<!-- CLAIM:END clm_E00EA364E3007B602561B972F7 -->

<!-- CLAIM:START clm_17AC91E904431B26514623E244 -->

### 空 IR：src CLI 与 dist 发布包模块实例分离（2026-08-22 足球实证）

编译必须用正式入口 node ./bin/gsts.mjs（或 npm run dev = npm run build && node ./bin/gsts.mjs）。用 npx tsx src/cli/gsts.ts 直接跑源码 CLI 时，runner.ts 的相对 import（../../runtime/core.js）加载 src/runtime/core.ts 实例，而 game.gs.ts 的包名 import（genshin-ts/runtime/core）经 Node self-reference（package.json name + exports ./runtime/* → dist/src/runtime/*.js）解析到 dist 发布包实例；gs.ts 注册进 dist 实例的 serverRegistries、runner 读 src 实例，导致 game.json 静默输出 []（[ok] 全链路但 All GIA generated (0)，无报错）。正式 CLI 的 runner 相对 import 编译后指向 dist 实例，与 gs.ts 同实例，IR 正常（足球阶段 0 实证：1 graph / 221 nodes / 6 variables）。

#### 适用边界

适用于本仓库 gsts 编译命令入口选择与空 IR 诊断；不涵盖编辑器导入/注入/游戏行为；src/dist 同步状态变化时以当前源码与测试为准。

<!-- CLAIM:END clm_17AC91E904431B26514623E244 -->
