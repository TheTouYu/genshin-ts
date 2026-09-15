# runBatch, runSingle, runDev, and loadGstsConfig

Exact command/config seams: runBatch, runSingle, runDev, loadGstsConfig, useConfiguredTargetId.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_55CEE9BCE906957193DD7F80FF -->

### gsts CLI 构建编排：runBatch/runDev/runSingle 与配置加载

### gsts CLI 构建编排：runBatch/runDev/runSingle 与配置加载

runBatch（src/cli/gsts.ts:580）批量编译流程：mkdtemp 建诊断目录并设 GSTS_WARNINGS_DIR → loadConfigOrNull 加载配置（找不到报 config not found）→ detectLang 语言 → cfg.inject 时 createSignalRegistry(readRegisteredSignalsFromGil(resolveGilTarget(cfg.inject).gilPath)) 读已注册信号 → runCliChecks → applyIrToGiaOptimizeEnv/applyStage3BackendSurfaces → compileTsToGs 编译 TS→GS（onWriteGs 回调）→ emitIrJsonForEntries（precompileExpression/removeUnusedNodes 优化开关）→ mergeIrJsonFilesByGraphId 同 graph.id 合并 IR（便于 DSL 拆分/工程化）→ GIA 输出。runDev（gsts.ts:696）为增量 watch 开发模式；runSingle（单文件）为单文件编译+注入入口。loadGstsConfigCached 缓存配置加载。

#### 适用边界

来自 src/cli/gsts.ts 当前实现；CLI 行为契约，不涉及编译器内部 IR/GIA 语义；以 committed 源码为准。

#### 适用边界

来自 src/cli/gsts.ts 当前实现；CLI 行为契约，不涉及编译器内部 IR/GIA 语义；以 committed 源码为准。

<!-- CLAIM:END clm_55CEE9BCE906957193DD7F80FF -->

<!-- CLAIM:START clm_078E7ECF2469F2E0CDAEA91267 -->

### 注入接缝：maybeInjectGia / useConfiguredTargetId / reinjectOnMapChange

### 注入接缝：maybeInjectGia / useConfiguredTargetId / reinjectOnMapChange

maybeInjectGia（src/cli/gsts.ts:1505）：--noinject 或无 gilCfg 时直接返回；resolveGilTarget 定位 .gil → maybeBackupGil 先备份 → injectGilFile（targetId=useConfiguredTargetId ? cfg.nodeGraphId : undefined、skipNonEmptyCheck=!!cfg.skipSafeCheck、lang）。useConfiguredTargetId 决定是否用配置的 nodeGraphId 定位注入目标；reinjectOnMapChange 在地图变化时重注入。注入成功 ui.ok 打印 injectOkTime。

#### 适用边界

来自 src/cli/gsts.ts 当前实现；注入目标定位与安全语义见 nodegraph-injection-target-and-safety；以 committed 源码为准。

#### 适用边界

来自 src/cli/gsts.ts 当前实现；注入目标定位与安全语义见 nodegraph-injection-target-and-safety；以 committed 源码为准。

<!-- CLAIM:END clm_078E7ECF2469F2E0CDAEA91267 -->

<!-- CLAIM:START clm_ED56B777D6BF1FB7F270F98D2B -->

### 编译节点图必须走正规入口 node ./bin/gsts.mjs，不能直跑 src 下的 CLI

编译节点图必须使用正规入口 node ./bin/gsts.mjs -c <config>（其转发到 dist/src/cli/gsts.js）。用 npx tsx src/cli/gsts.ts -c <config> 会在 GIA 生成阶段抛『gsts.f is only available in server_* ctxType (current: javascript)』。根因是运行时上下文栈用 Symbol 作键，src 与 dist 两份 core.ts 各持一个不同的 Symbol，一侧压入的上下文另一侧读不到。该故障与图内容无关——最小复现是一张只做图变量读写的空图同样失败。

#### 适用边界

约束的是本地编译/注入的调用路径，不改变 DSL 写法。诊断法：node --import tsx -e "console.log(import.meta.resolve('genshin-ts/runtime/core'))"，输出 src/ 即落到了类型检查侧副本。tsx 直跑仅适用于调试与类型检查。

<!-- CLAIM:END clm_ED56B777D6BF1FB7F270F98D2B -->

<!-- CLAIM:START clm_EFD30ED344E248542B400AF528 -->

### assets 子命令省略子命令名时不报错，会静默产出残缺文件

对 assets:entities 只给选项、不写子命令名（例如不写 import）时，命令不会报错，而是产出一个残缺的小文件（实测 6,709 字节，按实体读回为 0 条），而非完整地图。补上显式 import 后同一组参数产出 492,983 字节 / 166 条实体。顶层帮助的短用法行（Usage: gsts assets:entities [options]）看不出需要子命令，子命令清单另列在扩展帮助里。

#### 适用边界

实测于 assets:entities；其它 assets 子命令族（同一 CLI 分发风格）应默认假定存在同类风险，用前先确认子命令名。核验要点：不能只看命令有没有报错，必须读回产物里的数字（实体数/字节数）。

<!-- CLAIM:END clm_EFD30ED344E248542B400AF528 -->
