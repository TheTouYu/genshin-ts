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
