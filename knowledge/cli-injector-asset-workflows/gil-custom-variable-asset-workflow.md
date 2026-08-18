# runAssetsCustomVariables declaration synchronization

Exact declaration seams: runAssetsCustomVariables, applyCustomPrefabInitialCustomVariableDeclarations, syncPrefabCustomVariableDeclarations.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_1C760125C0ACDED27BEB07BD31 -->

### 自定义变量资产工作流（runAssetsCustomVariables + 声明同步）

### 自定义变量资产工作流（runAssetsCustomVariables + 声明同步）

src/cli/assets_custom_variables.ts:runAssetsCustomVariables 处理自定义变量资产命令入口。src/cli/gil_custom_variables.ts 提供：readCustomPrefabInitialCustomVariables/readPlayerInitialCustomVariables/readCharacterInitialCustomVariables 读取各类型初始自定义变量声明；applyCustomPrefabInitialCustomVariableDeclarations/applyCustomPrefabInitialCustomVariableUpdates 应用预制件初始声明/更新；syncPrefabCustomVariableDeclarations/syncPlayerCustomVariableDeclarations/syncCharacterCustomVariableDeclarations 把声明同步进关卡数据。

#### 适用边界

来自 src/cli 当前实现；CLI 资产工作流（声明同步）；变量 wire 见 game-engine-knowledge/variable-scopes-encoding。

#### 适用边界

来自 src/cli 当前实现；CLI 资产工作流（声明同步）；变量 wire 见 game-engine-knowledge/variable-scopes-encoding。

<!-- CLAIM:END clm_1C760125C0ACDED27BEB07BD31 -->
