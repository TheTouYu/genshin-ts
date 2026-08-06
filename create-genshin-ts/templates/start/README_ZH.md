# **PROJECT_NAME**

这是一个基于 genshin-ts 的千星奇域项目模板。你可以用 TypeScript 写逻辑，编译为节点图并注入到地图。

## 快速开始

```bash
npm install
npm run dev
```

文档站：`https://gsts.moe/zh`

## 项目结构

- `src/main.ts`：入口示例（`g.server(...).on(...)`）
- `src/resources/signals.ts`：配置 `inject` 后生成的信号定义
- `gsts.config.ts`：编译与输出配置
- `dist/`：编译产物（`.gs.ts` / `.json` / `.gia`）
- `docs/EDITOR_BOUNDARIES.md`：英文版代码与编辑器职责边界说明
- `docs/EDITOR_BOUNDARIES_ZH.md`：中文版代码与编辑器职责边界说明与术语参考
- `docs/GIL_ASSET_COMMANDS.md`：英文版 GIL 资产命令参考（节点图/实体/挂载/信号等）
- `docs/GIL_ASSET_COMMANDS_ZH.md`：中文版 GIL 资产命令参考（节点图/实体/挂载/信号等）
- `CLAUDE.md` / `AGENTS.md`：AI 协作指引（建议先读）

## 注入配置示例（可选）

```ts
import type { GstsConfig } from 'genshin-ts'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 1,
    mapId: 1073741849,
    nodeGraphId: 1073741825
  },
  assets: {
    customVariables: [
      {
        target: 'character',
        prefabId: 1090519041,
        syncInstances: true,
        declarations: [
          { name: 'enabled', type: 'bool' },
          { name: 'position', type: 'vec3' },
          { name: 'count', type: 'int' }
        ]
      }
    ]
  }
}

export default config
```

提示：

- `npm run maps` 可列出最近保存的地图，帮助确定 `mapId`。
- 多账号/多服务器时填写 `gameRegion` / `playerId` 以定位地图目录。
- 注入会自动做备份，便于回滚。

## 编辑器边界

这个模板默认采用“代码优先”的开发方式，但千星奇域 / Genshin UGC 中仍有不少能力必须先由编辑器手动配置。

语言入口：

- 以中文协作时，优先阅读本文件与 `docs/EDITOR_BOUNDARIES_ZH.md`。
- 若以英文协作，则切换到 `README.md` 与 `docs/EDITOR_BOUNDARIES.md`。

- 代码优先负责运行时规则：玩法流程、状态机、波次逻辑、经济结算、校验、刷怪、结算、信号编排。
- 编辑器通常负责资源与配置：元件、组件、路径、界面布局/控件组、信号、全局计时器、商店、货币、能力单元、文本气泡、小地图标识、音频资源等。
- 受限例外：以下 GIL 资产操作已由 `assets:*` 命令封装（规则来自真实编辑器保存快照，见 `docs/GIL_ASSET_COMMANDS_ZH.md`）：
  - `assets:static-assemblies`：基于目标地图已有模板闭包生成静态拼装自定义元件；
  - `assets:node-graphs`：创建空节点图容器（注入目标占位）；
  - `assets:entities`：创建/导出场景实体、记录级改颜色/transform、装饰物双向挂接；
  - `assets:mounts`：节点图挂载/解除（元件 def 或场景实体，type 3 槽）；
  - `assets:signals`：信号注册/检查/修复/更新；
  - `assets:custom-variables`：关卡变量预览/写回。
  它们直接修改 `.gil` 资产结构，不是 GIA 节点图注入，也不代表任意编辑器资产都能由代码生成。
- 在设计或实现功能前，先查看 `docs/EDITOR_BOUNDARIES_ZH.md`，并明确区分：
  - 代码改动
  - 仍需手动完成的编辑器配置
- 若工作区中存在本地编辑器参考文档，优先以其为准，不要只根据 API 名称猜测编辑器能力。
- 若以中文进行开发沟通，优先沿用本文件与 `docs/EDITOR_BOUNDARIES_ZH.md` 中的术语，避免临时翻译导致表达不地道。

## 入口与事件写法

```ts
import { g } from 'genshin-ts/runtime/core'

g.server({ id: 1073741825 }).on('whenEntityIsCreated', (evt, f) => {
  const p = player(1)
  f.printString(str(p.guid))
})
```

要点：

- `id` 是目标节点图 ID；同 ID 的多个入口会自动合并到同一图。
- 事件名使用字符串字面量（支持中英文名称）。
- 回调参数中 `f` 是节点图函数入口，优先用它做输出、变量操作等。
- 可链式注册多个事件：`g.server(...).on(...).onSignal(...)`。

## g.server 参数说明（与注入安全相关）

常用参数：

- `id`：目标节点图 ID（注入必须匹配该 ID）。
- `name`：节点图显示名称；未指定时默认使用入口文件名。
- `prefix`：是否自动添加 `_GSTS_` 前缀（默认 true）。
- `mode`：图模式，`'beyond' | 'classic'`，默认 `'beyond'`。
- `type`：节点图类型（默认 server/entity）。
- `variables`：声明节点图变量并启用 `f.get` / `f.set`。
- `lang`：`'zh'` 时启用中文事件名与中文函数别名。

模式说明：

- 默认是超限模式（`mode: 'beyond'`），可用节点能力更完整。
- 若需要经典模式，显式写 `mode: 'classic'`。
- 经典模式下不允许 `type: 'class'`，且可用节点能力会少于超限模式。

经典模式示例：

```ts
g.server({
  id: 1073741825,
  mode: 'classic'
}).on('whenEntityIsCreated', (evt, f) => {
  f.printString('classic mode')
})
```

注入安全检查要点：

- 目标 `id` 必须在地图里存在对应节点图。
- 目标节点图需要是 **空图** 或 **名称以 `_GSTS` 开头**，否则注入会被拦截。
- 若你明确知道自己在做什么，可在 `gsts.config.ts` 中设置 `inject.skipSafeCheck = true` 跳过检查。
- 新建节点图后必须 **保存地图**，注入器才能识别该 `id`。
- 建议先创建好一批节点图并保存，再一次性编译注入；否则可能出现“注入 -> 新建 -> 保存”导致注入内容被覆盖的问题。

## 客户端节点图

客户端图也使用 `g.<类型>({ id }).on(...)` 注册。注入前，必须先在编辑器中创建并保存类型相同的客户端节点图，再填写它的真实 ID。

| 节点图类型   | 入口                            | 事件 / 返回值       | 模式       | 用途                                       |
| ------------ | ------------------------------- | ------------------- | ---------- | ------------------------------------------ |
| 角色技能     | `g.characterSkill(...)`         | `start`             | 仅超限     | 角色技能的位移、投射物、攻击盒、预瞄等逻辑 |
| 角色操控技能 | `g.characterControlSkill(...)`  | `start`             | 仅超限     | 操控运动器、移动、转向和预瞄等逻辑         |
| 造物技能     | `g.creationSkill(...)`          | `start`             | 超限、经典 | 造物技能的表现与执行逻辑                   |
| 造物状态     | `g.creationStatus(...)`         | `start1`～`start10` | 超限、经典 | 造物的攻击、索敌、移动等持续行为           |
| 造物状态决策 | `g.creationStatusDecision(...)` | `start1`～`start10` | 超限、经典 | 按条件选择要执行的造物状态图               |
| 布尔过滤器   | `g.boolFilter(...)`             | `start`，返回布尔值 | 超限、经典 | 向引用方输出最终布尔结果                   |
| 整数过滤器   | `g.intFilter(...)`              | `start`，返回整数   | 超限、经典 | 向引用方输出最终整数结果                   |

```ts
g.characterSkill({ id: CHARACTER_SKILL_ID }).on('start', (_evt, f) => {})
g.characterControlSkill({ id: CHARACTER_CONTROL_SKILL_ID }).on('start', (_evt, f) => {})
g.creationSkill({ id: CREATION_SKILL_ID, mode: 'classic' }).on('start', (_evt, f) => {})

g.creationStatus({ id: CREATION_STATUS_ID }).on('start1', (_evt, f) => {
  f.executeSkill(true, 1)
})

g.creationStatusDecision({ id: CREATION_STATUS_DECISION_ID }).on('start1', (_evt, f) => {
  f.switchToSelfExecutionStatus(true, CREATION_STATUS_ID, 1)
})

g.boolFilter({
  id: BOOL_FILTER_ID,
  evaluationInterval: 0.5
}).on('start', (_evt, f) => {
  return f.getRandomNumber(1, 10) > 5
})

g.intFilter({ id: INT_FILTER_ID }).on('start', (_evt, f) => {
  return f.getRandomNumber(1, 10)
})
```

要点：

- 所有客户端入口都支持 `id`、`name`、`prefix`、`mode`、`lang`；`lang: 'zh'` 会开启当前图的中文 `f` 别名。
- 过滤器额外支持 `evaluationInterval`，单位为秒，默认 `0.3`。
- 造物状态和造物状态决策的 `start1`～`start10` 对应【按顺序唯一执行】引脚，用于拆分代码，不是十个独立状态。
- 这两类状态图内顺序书写的行为通过前一个行为的【失败执行】引脚连接；下一条语句只在前一个行为失败时执行。
- `f` 会按客户端图类型和模式提供不同的方法；服务器图函数不一定可用，请以类型提示和 ESLint 为准。
- 常用算术和比较运算符可以直接写，例如 `value > 5` 会编译为当前客户端图的 `greaterThan` 节点。

### `clientEntity(...)`

该全局辅助函数只能在客户端图处理函数内使用：

- `clientEntity(0)` / `clientEntity(null)`：实体占位，保持参数引脚不连接。
- `clientEntity(10001)`：使用当前客户端图的 GUID 查询节点获取实体；当前图没有该节点时会报错。
- `clientEntity(otherEntity)`：保持原实体值，并将类型收窄为当前客户端图可用的实体快捷方法，适合包装 `self` 或 `GameObject.Find(...)` 的结果。

```ts
g.characterSkill({ id: CHARACTER_SKILL_ID }).on('start', (_evt, f) => {
  const byGuid = clientEntity(10001)
  const found = clientEntity(GameObject.Find(10002))
  const placeholder = clientEntity(0)

  // 客户端 f 返回的实体已经是正确的 clientEntity 类型。
  const typedTarget = f.queryEntityByGuid(10003)
  const targetPosition = found.pos
})
```

需要在顶层客户端复用函数中访问节点 API 时，使用与图类型对应的 `gsts.fCharacterSkill`、`gsts.fCharacterControlSkill`、`gsts.fCreationSkill`、`gsts.fCreationStatus`、`gsts.fCreationStatusDecision`、`gsts.fBoolFilter` 或 `gsts.fIntFilter`。`gsts.f` / `gsts.fServer` 仍属于服务器节点图。

完整说明与示例见：`https://gsts.moe/zh/doc/events/client-graphs`。

## gsts.config 优化配置（默认启用）

`gsts.config.ts` 的 `options.optimize` 默认全开，常见项：

- `precompileExpression`：预编译纯字面量表达式，减少运行期节点计算。
- `removeUnusedNodes`：清理未接入事件或未被使用的节点。
- `timerPool`：控制 `setTimeout` / `setInterval` 的定时器名称池大小。
- `timerDispatchAggregate`：合并定时器事件分发，减少图复杂度。

如需调试或对比节点图，可临时关闭单项优化。

## 典型用法与限制（AI 必看）

### 作用域划分

- **顶层作用域（编译期）**：可以读取文件、使用 npm 库、做预计算，但不要调用 `g.server` 或 `gsts` 相关 API。
- **节点图作用域（运行期）**：仅支持可编译的 TS 子集，语义会转换为节点图。

### 控制流与返回值

- `if/while/switch` 条件必须是 `boolean`，需要时用 `bool(...)` 转换。
- `gstsServer*` 函数只允许 **末尾单一 `return <expr>`**，不能在分支或循环里 `return`。
- 递归、`async/await`、Promise 在节点图作用域内不支持（会报错或被 ESLint 提示）。
- `while(true)` 会受循环上限影响，建议改用定时器或显式计数。
- `!`/三目运算需要布尔条件，避免对非 bool 取反。

### 数值与类型

- `number` 会视为 **float**，`bigint` 会视为 **int**。
- 取余、位运算等整数运算请使用 `bigint`。
- 列表下标若使用 `bigint` / `IntValue`，请用 `idx(...)` 包裹，例如 `arr[idx(i)]`（可直接应用 ESLint 自动修复）。
- 若此处显示为“警告”而非“错误”，通常表示项目 TypeScript 插件已生效（已将 `bigint` 视作可索引），可按需禁用 `gsts/require-bigint-index-wrapper`。
- 若 VSCode/Cursor 里仍看到 `TS2538` 错误，请配置 `"typescript.tsdk": "node_modules/typescript/lib"` 与 `"typescript.enablePromptUseWorkspaceTsdk": true`（genshin-ts 的项目模板已经自带这些设置），并设置“使用工作区 TypeScript 版本”。
- 列表/字典元素类型必须一致，混合类型会报错。
- 空数组可能无法推断类型，建议先放一个同类型占位值。
- 建议使用辅助函数明确类型：`int`、`float`、`vec3`、`configId`、`prefabId`、`entity` 等。
- `dict(...)` 用于创建只读字典；需要可写字典时请改用节点图变量（`f.get` / `f.set`）。
- 需要强制生成节点图局部变量时，用 `let` 声明；`const` 可能会被优化为直接连线。

### 全局函数与变量速查（建议 AI 优先使用）

日志与调试：

- `print(str(...))`：最稳定的日志输出方式。
- `console.log(x)`：仅支持 **单一参数**，会自动转成 `print(str(...))`。
- `f.printString(...)`：显式节点调用，适合需要严格对齐节点图时使用。

类型与构造：

- `bool(...)` / `int(...)` / `float(...)` / `str(...)`：显式类型转换。
- `idx(...)`：用于让 `bigint` / `IntValue` 索引通过 TypeScript 类型检查（仅用于通过类型检查，不改变节点图整数语义）。
- `vec3(...)` / `guid(...)` / `prefabId(...)` / `configId(...)` / `faction(...)` / `entity(...)`：常用类型构造。
- `clientEntity(...)`：仅客户端图使用；查询或收窄实体，并提供当前客户端图可用的实体快捷方法。
- `list('int', items)`：显式声明列表类型（空数组时尤为重要）。
- `dict(...)`：声明只读字典（节点图变量字典需用 `f.get` / `f.set`）。
- `raw(...)`：编译器不处理，按 JS 原生语义执行（仅在必要时使用）。

实体与场景：

- `player(1)`：获取玩家实体（从 1 开始）。
- `stage` / `level`：关卡实体别名。
- `self`：当前节点图关联实体。
- `GameObject.Find(...)` / `FindWithTag(...)` / `FindByPrefabId(...)`：实体查询。

数学与向量：

- `Math.*`：会编译为节点图等价实现（server 作用域内）。
- `Mathf.*` / `Vector3.*` / `Random.*`：Unity 风格 API。

信号与事件：

- 字符串写法可用：`send('signalName')` 配合 `g.server().onSignal('signalName', ...)`。
- 推荐使用提取定义：`send(Signal.xxx, ...)` 和 `g.server().onSignal(Signal.xxx, ...)`。
- `Signal.xxx` 来自 `src/resources/signals.ts`，可获得参数类型检查。

定时器：

- `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval`。

常用方法支持：

- 数组/字符串的常用方法（`map`/`filter`/`find`/`length` 等）有编译支持，以类型提示为准。

### 节点图变量（可写变量）

```ts
g.server({
  id: 1073741825,
  variables: { counter: 0n },
  lang: 'zh'
}).on('whenEntityIsCreated', (evt, f) => {
  const v = f.get('counter')
  f.set('counter', v + 1n)
})
```

提示：

- `variables` 会生成节点图变量，并提供类型化的 `f.get` / `f.set`。
- 实体类型变量通常只用于声明类型（常用 `entity(0)` 作为占位）。
- `entity(0)` 也可用于部分节点调用的实体参数占位，让编辑器中该参数保持为空。

### 定时器

- 直接使用 `setTimeout` / `setInterval`（单位为毫秒）。
- 编译器会自动生成定时器池以避免同名冲突。
- 可用注释 `// @gsts:timerPool=4` 覆盖池大小（高阶用法）。
- `setInterval` 间隔过小（<=100ms）会有性能警告。
- 定时器回调支持闭包捕获（按值），但不支持捕获字典类型。
- 若项目同时使用 `@types/node`，未标注的回调参数仍会推断为 GSTS 节点图类型；也可使用不与 Node 全局同名的 `gsts.timers.setTimeout/setInterval`。

### JS 原生对象的限制

- `Object.*`、`JSON.*` 等原生对象在节点图作用域内通常不可编译。
- 若必须使用，请在顶层预处理，或用 `raw(...)` 让编译器忽略该表达式。
- 字符串拼接若报错，建议在顶层预计算或用 `str(...)` 显式转换。

## 复用函数（gstsServer）

```ts
function gstsServerSum(a: bigint, b: bigint) {
  const total = a + b
  return total
}

g.server({ id: 1073741825 }).on('whenEntityIsCreated', (evt, f) => {
  const v = gstsServerSum(1n, 2n)
  f.printString(str(v))
})
```

规则：

- 必须是顶层声明，参数只能是标识符（不支持解构/默认值/rest）。
- 只允许末尾单一 `return`，且调用必须发生在 `g.server().on(...)` 或另一个 `gstsServer*` 中。
- 在 `gstsServer*` 内可直接使用 `gsts.f` 访问节点图 API（不强制传 `f` 参数）。

## 多入口与合并

- `gsts.config.ts` 的 `entries` 决定哪些文件被编译。
- 每个入口文件默认生成一个节点图；同 ID 会自动合并。
- 增量编译下，依赖变更会触发相关入口重编译。

## 输出与调试

- `.gs.ts`：TS 被展开成节点函数调用的中间文件，便于定位语义差异。
- `.json`：节点图 IR，用来排查连接和类型匹配问题。
- `.gia`：最终节点图产物，可注入或手动导入。

## 编译执行注意事项

- 编译器会扫描所有入口文件并找到 `g.server().on(...)` 入口进行编译。
- 顶层代码会在编译期执行一次或多次（例如增量编译/多入口场景）。
- 若顶层代码涉及本地文件读写或随机数，请注意副作用与一致性问题。
- 需要临时禁用某个节点图注入时，可把 `id` 设置为一个不存在的值。
- 顶层作用域适合做本地文件读取/预计算/程序化生成（例如伪随机场景）。
- `stage.set` 可当作全局变量使用（节点图运行期）。

## Scripts

- `npm run build`：完整编译
- `npm run dev`：增量编译（配置 inject 后会自动注入）
- `npm run maps`：列出最近编辑的地图
- `npm run maps:create -- <名字> --map-id <id>`：创建新地图骨架
- `npm run maps:rename -- <名字> --map-id <id>`：给地图改名
- `npm run backup`：打开注入备份目录
- `npx gsts maps --format json --include-hash`：稳定、默认脱敏的地图发现 JSON
- `npm run assets:custom-variables`：预览 `assets.customVariables` 配置对 `.gil` 自定义变量的变更
- `npm run assets:custom-variables -- --write`：备份后写回真实地图
- `npm run assets:custom-variables -- --map-id <id>`：临时指定地图
- `npm run assets:custom-variables -- --gil <file.gil>`：处理离线 GIL 文件
- `npx gsts maps --format json --include-hash`：稳定、默认脱敏的地图发现 JSON
- `npm run assets:static-assemblies -- inspect --gil <source.gil> --format json`：只读检查模板闭包和占用 ID
- `npm run assets:static-assemblies -- plan --asset-config <file> --gil <source.gil> --output <plan.json>`：生成绑定源哈希的确定性计划
- `npm run assets:static-assemblies -- --asset-config <file> --map-id <id>`：兼容的默认 preview，不修改地图
- `npm run assets:static-assemblies -- --gil <source.gil> --output <candidate.gil>`：保存离线候选，不覆盖已有文件
- `npm run assets:static-assemblies -- --map-id <id> --write`：显式备份并写回真实地图
- `npm run assets:node-graphs -- create --name <name> --map-id <id>`：创建空节点图容器（注入目标占位，ID 自动分配）
- `npm run assets:entities -- export --gil <file.gil> --format json`：导出场景实体清单
- `npm run assets:entities -- import --entities <file> --map-id <id>`：从元件定义创建实体（预览）
- `npm run assets:entities -- patch <entity-id> --color <#RRGGBB> --map-id <id>`：记录级改实体颜色（preview，`--write` 写回）
- `npm run assets:entities -- patch <entity-id> --attach-aux <aux-id> --map-id <id>`：装饰物双向挂接（preview）
- `npm run assets:mounts -- list --map-id <id>`：盘点全图节点图/元件/实体及挂载关系
- `npm run assets:mounts -- list --graph <gid> --map-id <id>`：反向查询某图挂在哪些目标上
- `npm run assets:mounts -- attach <target-id> --graph <gid> [--def|--entity] --map-id <id>`：挂载节点图（preview）
- `npm run assets:mounts -- detach <target-id> --graph <gid> [--def|--entity] --map-id <id>`：解除挂载（preview）
- `npm run assets:signals -- inspect --gil <file.gil>`：检查信号注册表
- `npm run assets:signals -- register --name <name> --param <name:type> --map-id <id>`：注册信号（preview）

上述 GIL 资产命令的完整用法、wire 规则与证据分级见 `docs/GIL_ASSET_COMMANDS_ZH.md`（英文版 `docs/GIL_ASSET_COMMANDS.md`）。所有写操作默认只预览，`--write` 才备份后写回，写回后需重新加载地图再保存。

GIL/GIA 调试工具（只读）：

- `npm run gil:node-graphs -- <map.gil>`：列出地图内全部节点图（ID/类型/名称/节点数）
- `npm run gil:parse-node-graph -- <map.gil> [--graph <id|auto> | --composite <名称> | --list]`：解析节点图结构（节点/引脚/连接）
- `npm run gil:compare-node-graph -- <before.gil> <after.gil> <graphId> [--full]`：对比两个 GIL 的同一节点图差异（注入前后验证用）
- `npm run gil:decode -- <map.gil>`：raw wire 解码输出
- `npm run gil:signals -- <map.gil> [output-prefix]`：解码信号注册表
- `npm run gil:extract-signals -- <map.gil> [output.json]`：提取信号附属结构
- `npm run gil:inspect-variables -- <map.gil> <变量名> [occurrence]`：查看自定义变量
- `npm run gil:scan-variables -- <map.gil>`：扫描变量候选
- `npm run gil:trace-exec -- <map.gil> [--graph <id|name|auto>]`：GIL 层执行流追踪
- `npm run gil:trace-dataflow -- <map.gil> --node <索引|名称>`：GIL 层数据流追踪
- `npm run gil:dump-layout -- <file.gia>`：提取 GIA 节点位置，分析布局规律
- `npm run gia:decode -- [选项] <file.gia>`：解码 GIA 产物
- `npm run trace-exec -- <file.gia> [--json] [--io] [--detail=N]`：GIA 层执行流追踪
- `npm run trace-dataflow -- <file.gia> <节点索引> <InParam索引> [--composite <名称>]`：GIA 层数据流链追溯

`assets.staticAssemblies` 的 item 使用相对元件原点的局部 Transform；元件自身的 `position`、`rotation`、`scale` 则是场景 Transform。主体和 item 颜色支持启用/关闭自定义颜色、`0xRRGGBB`、0–100 透明度及 `overwrite`/`multiply`，未知材质字段仍继承模板。`components` 当前仅支持 `{ type: 'followMotion', preset: 'fullFollow' }`，会在定义和实例两侧同步添加“完全跟随”快照；省略时不新增组件。该组件已有真实 GIL、自动回归、受限写回和用户编辑器/游戏验证证据。复杂模型可用 `structureFile: './assemblies/model.json'` 替代配置中的 `items`、`color` 和 `components`；严格 JSON 使用 `schemaVersion: 1`，保存主颜色、组件和 items，相对 `gsts.config.ts` 解析，并可引用 `node_modules/genshin-ts/schemas/static-assembly.schema.json` 获得补全。它不会从 `.gil` 提取结构。模板、资源 ID、主 ID 和两侧辅助 ID 都必须先针对目标地图确认，不能复制文档示例值直接写回。

- `npm run typecheck`：TypeScript 类型检查
- `npm run lint`：ESLint

补充说明：

- 本项目内置定制化 ESLint 规则，能提示编译器的隐含约束，建议经常运行 `npm run lint`。
- `npm run typecheck` 可提前发现类型不匹配问题，避免编译期报错。
- `npm run dev` 实际调用的是 `gsts dev`，仅进入监控变更的编译模式。
- 注入后需要重新加载地图，节点图变更才会生效。
- 可准备一个临时空地图，注入后快速切换以触发重载。
- 注入后如果在加载前使用编辑器保存地图，注入内容会被覆盖，需要重新注入。

## 常见问题

- `npm run maps` 为空：先在编辑器里保存一次地图，再重试。
- 注入失败：检查 `mapId` / `nodeGraphId` 是否正确，图类型是否匹配。
- 类型报错：优先检查 `.value` 的使用与引脚类型是否一致。

## 需要查函数说明时（AI 可用）

当类型提示不足时，可以直接在 `node_modules/genshin-ts` 中搜索函数/事件注释：

- 节点函数与事件定义：`node_modules/genshin-ts/dist/src/definitions/`
- 建议用关键词搜索（事件名、函数名、中文别名）定位注释与参数说明。
