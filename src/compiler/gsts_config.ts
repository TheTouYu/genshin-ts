export type GstsFeatureFlags = {
  whileCondition: boolean
  doWhile: boolean
  continue: boolean
  switch: boolean
  destructuring: boolean
  ternary: boolean
  nullishCoalesce: boolean
}

export type GstsOptimizeOptions = {
  /**
   * [ZH] 预编译纯字面量表达式，避免运行期节点计算, 默认启用。
   *
   * [EN] Precompute literal-only expressions to skip runtime nodes, enabled by default.
   */
  precompileExpression?: boolean
  /**
   * [ZH] 移除未使用的节点（未接入事件的 exec、未被有效 exec 使用的 data），默认启用。
   *
   * [EN] Remove unused nodes (exec not connected to events, data not used by effective exec), enabled by default.
   */
  removeUnusedNodes?: boolean
  /**
   * [ZH] 定时器名称池大小（用于 setTimeout/setInterval）, 由于节点图系统的switch case限制上限10个, 因此池不建议大于10, 否则闭包捕获功能将失效
   * 如果确定需要超过10, 请不要使用闭包捕获, 并开启timerDispatchAggregate优化。
   *
   * - setTimeout 默认 5
   * - setInterval 默认 1
   *
   * [EN] Timer name pool size (for setTimeout/setInterval). Because the node graph system has a limit of 10 switch cases, the pool is not recommended to be greater than 10, otherwise the closure capture function will fail.
   * If you need to exceed 10, please do not use closure capture, and enable timerDispatchAggregate optimization.
   *
   * - setTimeout default: 5
   * - setInterval default: 1
   */
  timerPool?: {
    setTimeout?: number
    setInterval?: number
  }
  /**
   * [ZH] 定时器事件分发聚合：合并多个 whenTimerIsTriggered 的纯分发逻辑为单一 switch。
   *
   * - 默认启用
   * - 仅在 IR -> GIA 阶段生效
   * - 可能导致节点图更难读, debug时按需禁用此优化
   *
   * [EN] Aggregate timer dispatch handlers into a single switch on timerName.
   *
   * - Enabled by default
   * - Applies only during IR -> GIA
   * - May make node graph harder to read, disable this optimization when debugging
   */
  timerDispatchAggregate?: boolean
}

// loopMax应用场景通常会有另外的控制条件, 一般只有需要更长的情况, 因此不列入优化项
/**
 * [ZH] Stage 3（IR → GIA）后端选项。共享 vendor Graph 默认启用。
 *
 * [EN] Stage 3 (IR → GIA) backend options. Shared vendor Graph is enabled by default.
 */
export type GstsStage3Options = {
  /**
   * [ZH] 启用 composite ordinary impl Graph 的 shared vendor materializer。
   *
   * - 默认：`true`（shared vendor Graph backend）
   * - 开启后：impl 中的 ordinary system node 走 shared vendor Graph materializer
   * - 环境变量兼容：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`（内部/测试）
   * - CLI：`--stage3-shared-impl-beta`
   * - 不删除 legacy；设置为 `false` 可显式回退到 legacy
   * - signal / dynamic pin / graphValues / affiliations 等可生成但未完全游戏验证；失败请附 backend 诊断
   *
   * [EN] Select the shared vendor materializer for composite ordinary impl Graphs.
   *
   * - Default: `true` (shared vendor Graph backend)
   * - When enabled: ordinary system nodes in impl Graphs use the shared vendor Graph materializer
   * - Env compat: `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` (internal/tests)
   * - CLI: `--stage3-shared-impl-beta`
   * - Does not delete legacy; set to `false` for an explicit legacy fallback
   * - signal / dynamic pin / graphValues / affiliations may generate but are not fully game-proven;
   *   include backend diagnostics when reporting issues
   */
  vendorImplGraphBeta?: boolean
}

export type GstsTransformOptions = {
  /**
   * [ZH] for(;;) / while(true) 等“无限循环”的最大迭代次数（用于 finiteLoop(0, loopMax)）。
   *
   * - 默认：999（即最多循环 1000 次）
   * - 用途：避免节点图在运行期达到性能限制
   *
   * [EN] Max iteration count for “infinite loops” like for(;;) / while(true)
   * (used by finiteLoop(0, loopMax)).
   *
   * - Default: 999 (i.e. up to 1000 iterations)
   * - Purpose: Avoids node graph performance issues at runtime caused by infinite loops
   */
  loopMax?: number
  /**
   * [ZH] 功能特性开关：默认只开“安全且高频”的部分。
   *
   * [EN] Feature flags. By default only a safe & commonly-used part is enabled.
   */
  features?: Partial<GstsFeatureFlags>
  /**
   * [ZH] 优化配置。
   *
   * [EN] Optimization options.
   */
  optimize?: Partial<GstsOptimizeOptions>
  /**
   * [ZH] Stage 3（IR → GIA）后端选项。共享 vendor Graph 默认启用。
   *
   * [EN] Stage 3 (IR → GIA) backend options. Shared vendor Graph is enabled by default.
   */
  stage3?: GstsStage3Options
}

export type GstsLang = 'auto' | 'zh-CN' | 'en-US'

export type GstsGameRegion = 'China' | 'Global'

export type CustomVariableScalarValue = bigint | boolean | number | string
export type CustomVariableVectorValue = readonly [number, number, number]
export type CustomVariableInitialValue =
  | CustomVariableScalarValue
  | CustomVariableVectorValue
  | readonly CustomVariableScalarValue[]
  | readonly CustomVariableVectorValue[]

export type GstsCustomVariableType =
  | 'entity'
  | 'guid'
  | 'int'
  | 'bool'
  | 'float'
  | 'str'
  | 'guid_list'
  | 'int_list'
  | 'bool_list'
  | 'float_list'
  | 'str_list'
  | 'vec3'
  | 'entity_list'
  | 'vec3_list'
  | 'faction'
  | 'config_id'
  | 'prefab_id'
  | 'config_id_list'
  | 'prefab_id_list'
  | 'faction_list'

export type GstsCustomVariableDeclaration = {
  name: string
  type: GstsCustomVariableType
  initialValue?: CustomVariableInitialValue
}

export type GstsCustomVariableOperation = {
  target: 'prefab' | 'player' | 'character'
  prefabId: number
  syncInstances?: boolean
  declarations: readonly GstsCustomVariableDeclaration[]
}

export type GstsStaticColor =
  | {
      /** [ZH] 关闭自定义颜色；编码时省略启用字段。 / [EN] Disable custom color and omit its enable field. */
      enabled: false
    }
  | {
      /** [ZH] 启用自定义颜色。 / [EN] Enable custom color. */
      enabled: true
      /** [ZH] `0xRRGGBB` 颜色码。 / [EN] `0xRRGGBB` color value. */
      rgb: number
      /** [ZH] UI 透明度百分比，编码前量化为 8-bit Alpha。 / [EN] UI opacity percentage, quantized to 8-bit alpha before encoding. */
      opacity: number
      /** [ZH] 颜色叠加方式。 / [EN] Color overlay mode. */
      overlay: 'overwrite' | 'multiply'
    }

export type GstsStaticAssemblyItem = {
  /**
   * [ZH] 官方基础模型资源 ID。资源必须在目标地图和模板的受限验证范围内确认。
   *
   * [EN] Official base-model resource ID. Confirm it against the target map and the
   * validated scope of the template.
   */
  resourceId: number
  /**
   * [ZH] 子项相对拼装元件原点的局部位置。
   *
   * [EN] Item position relative to the assembly origin.
   */
  position: readonly [number, number, number]
  /** [ZH] 子项局部旋转，默认 `[0, 0, 0]`。 / [EN] Local item rotation; defaults to `[0, 0, 0]`. */
  rotation?: readonly [number, number, number]
  /**
   * [ZH] 子项局部缩放，默认 `[1, 1, 1]`，表示资源原始尺寸而非统一的游戏内 1×1×1。
   * 已验证长方体资源 `10009001` 仅是受限示例，不能推广到其它资源。
   *
   * [EN] Local item scale; defaults to `[1, 1, 1]`, meaning the resource's original
   * size rather than a universal in-game 1×1×1. The verified cuboid resource `10009001`
   * is a bounded example and does not establish dimensions for other resources.
   */
  scale?: readonly [number, number, number]
  /**
   * [ZH] 子项颜色。定义侧和实例侧辅助记录会写入相同快照；省略时继承模板子项。
   *
   * [EN] Item color. Definition-side and instance-side auxiliary records receive the
   * same snapshot; omit it to inherit the template item.
   */
  color?: GstsStaticColor
}

export type GstsStaticAssemblyStructure = {
  /** [ZH] 结构文件格式版本。 / [EN] Structure-file format version. */
  schemaVersion: 1
  /** [ZH] 主模型颜色。 / [EN] Main-model color. */
  color?: GstsStaticColor
  /** [ZH] 使用局部 Transform 拼装的子项。 / [EN] Items assembled with local Transforms. */
  items: readonly GstsStaticAssemblyItem[]
}

type GstsStaticAssemblyItemsSource =
  | {
      /** [ZH] 内联结构不能同时使用结构文件。 / [EN] Inline structure cannot use a structure file. */
      structureFile?: never
      color?: GstsStaticColor
      items: readonly GstsStaticAssemblyItem[]
    }
  | {
      /**
       * [ZH] 严格 JSON 结构文件，相对 `gsts.config.ts` 所在目录解析。
       *
       * [EN] Strict JSON structure file, resolved relative to the `gsts.config.ts` directory.
       */
      structureFile: string
      /** [ZH] 结构文件拥有主颜色，配置不可覆盖。 / [EN] The file owns main color; config cannot override it. */
      color?: never
      /** [ZH] 结构文件拥有 items，配置不可内联。 / [EN] The file owns items; config cannot inline them. */
      items?: never
    }

export type GstsStaticAssembly = {
  /** [ZH] 新自定义元件名称。 / [EN] Name of the new custom prefab. */
  name: string
  /** [ZH] 新元件主 ID；工具不会自动分配。 / [EN] New prefab ID; never auto-assigned. */
  prefabId: number
  /** [ZH] 目标地图中模板元件的定义 ID。 / [EN] Template prefab definition ID in the target map. */
  templatePrefabId: number
  /**
   * [ZH] 目标地图中模板元件的实例 ID。定义 ID 与实例 ID 不保证相同，必须显式提供。
   *
   * [EN] Template prefab instance ID in the target map. Definition and instance IDs are
   * not guaranteed to match and must be provided explicitly.
   */
  templateInstanceId: number
  /** [ZH] 模板元件的当前名称。 / [EN] Current template prefab name. */
  templateName: string
  /**
   * [ZH] 拼装元件实例在场景中的位置；与 item 的局部 Transform 分属两层坐标。
   *
   * [EN] Scene position of the assembly instance; this is a separate coordinate layer
   * from each item's local Transform.
   */
  position: readonly [number, number, number]
  /** [ZH] 拼装元件的场景旋转，默认 `[0, 0, 0]`。 / [EN] Assembly scene rotation; defaults to `[0, 0, 0]`. */
  rotation?: readonly [number, number, number]
  /** [ZH] 拼装元件的场景缩放，默认 `[1, 1, 1]`。 / [EN] Assembly scene scale; defaults to `[1, 1, 1]`. */
  scale?: readonly [number, number, number]
  /** [ZH] 每个 item 对应一个未占用的定义侧辅助 ID。 / [EN] One unused definition-side auxiliary ID per item. */
  definitionAuxiliaryIds: readonly number[]
  /** [ZH] 每个 item 对应一个未占用的实例侧辅助 ID。 / [EN] One unused instance-side auxiliary ID per item. */
  instanceAuxiliaryIds: readonly number[]
} & GstsStaticAssemblyItemsSource

export type GstsResolvedStaticAssembly = Omit<
  GstsStaticAssembly,
  'structureFile' | 'color' | 'items'
> & {
  structureFile?: never
  color?: GstsStaticColor
  items: readonly GstsStaticAssemblyItem[]
}

export type GstsAssetsConfig = {
  customVariables?: readonly GstsCustomVariableOperation[]
  /**
   * [ZH] 基于目标地图中的模板闭包和官方基础资源，生成静态拼装自定义元件。
   * 该工具修改 `.gil` 资产结构，不是 GIA NodeGraph 注入；CLI 默认只预览。
   *
   * [EN] Build static custom prefabs from a template closure in the target map and
   * official base resources. This modifies `.gil` assets, not GIA NodeGraphs; CLI defaults
   * to preview mode.
   */
  staticAssemblies?: readonly GstsStaticAssembly[]
}

export type GstsInjectConfig = {
  /**
   * [ZH] 游戏区域：
   *
   * - China: `%LocalAppData%\\..\\LocalLow\\miHoYo\\原神\\BeyondLocal`
   * - Global: `%LocalAppData%\\..\\LocalLow\\miHoYo\\Genshin Impact\\BeyondLocal`
   *
   * 若只检测到其中一个目录，可省略；若两个都存在，会要求你填写。
   *
   * [EN] Game region.
   *
   * - China: `%LocalAppData%\\..\\LocalLow\\miHoYo\\原神\\BeyondLocal`
   * - Global: `%LocalAppData%\\..\\LocalLow\\miHoYo\\Genshin Impact\\BeyondLocal`
   *
   * If only one folder exists on this PC, it can be omitted.
   */
  gameRegion?: GstsGameRegion
  /**
   * [ZH] 玩家 ID（BeyondLocal 下的数字目录名）。
   *
   * 若该目录下只有一个纯数字目录，可省略。`gsts maps` 会按该玩家目录列出地图文件。
   *
   * [EN] Player ID (numeric folder name under BeyondLocal).
   *
   * If only one numeric folder exists, it can be omitted.
   */
  playerId?: number
  /**
   * [ZH] 地图 ID（例如 `1073741849`），最终注入目标为 `<mapId>.gil`。
   *
   * 提示：可用 `gsts maps` 列出近期编辑的地图文件，辅助填写。新建并保存地图后，应优先选择列表中最新的 `[recent]` 文件。
   *
   * [EN] Map ID (e.g. `1073741849`), injection target is `<mapId>.gil`.
   *
   * Tip: run `gsts maps` to list recently edited map files and help you pick the correct mapId.
   */
  mapId?: number
  /**
   * [ZH] 目标节点图 ID（用于替换地图里的哪个节点图）。
   *
   * - 新地图通常从 `1073741825` 开始分配第一个节点图 ID，后续新建节点图通常递增；这是当前真实地图样本中的经验规律，不是 protobuf 全局保证。
   * - `mapId` 是地图 `.gil` 文件 ID，`nodeGraphId` 是该地图内部要替换的节点图 ID，两者不是同一个 ID。
   * - 若不填：会尝试从 `.gia` 内的 graph id 推断。
   * - 找不到会报错（需先在编辑器里新建并保存对应节点图）。
   * - 仅对 `gsts <file>` 单文件模式生效（批量模式会忽略该字段）。
   *
   * [EN] Target NodeGraph id.
   *
   * - New maps commonly assign `1073741825` to the first NodeGraph and increment later NodeGraphs; this is an observed map convention, not a protobuf global guarantee.
   * - `mapId` identifies the `.gil` map file; `nodeGraphId` identifies the NodeGraph to replace inside that map. They are different IDs.
   * - If omitted, inferred from `.gia` when possible.
   * - If not found, will throw an error (need to create and save the corresponding node graph first in the editor).
   * - Only takes effect in `gsts <file>` (single-file) mode. Batch mode ignores this field.
   */
  nodeGraphId?: number
  /**
   * [ZH] 跳过注入安全检查（允许替换非空图、允许名称不是 `_GSTS*`）。
   *
   * [EN] Skip safety checks during injection (allow replacing non-empty graph, allow name not starting with `_GSTS*`).
   */
  skipSafeCheck?: boolean
  /**
   * [ZH] dev 模式下检测地图文件被外部保存时，自动重新注入已生成的 GIA。
   *
   * - 默认启用
   *
   * [EN] In dev mode, re-inject generated GIA when the map file is saved externally.
   *
   * - Enabled by default
   */
  reinjectOnMapChange?: boolean
  /**
   * [ZH] 自动提取自定义资源（Custom Prefab）到文件。
   *
   * - 默认启用
   *
   * [EN] Auto extract custom resources (Custom Prefab) to file.
   *
   * - Enabled by default
   */
  extractResources?: boolean
  /**
   * [ZH] 自定义资源提取路径（相对 config 所在目录）。
   *
   * - 默认：`src/resources/prefabs.ts`
   *
   * [EN] Custom resources output path (relative to the config file).
   *
   * - Default: `src/resources/prefabs.ts`
   */
  resourcesPath?: string
  /**
   * [ZH] 自动提取信号定义到文件。
   *
   * - 默认启用
   *
   * [EN] Auto extract signal definitions to file.
   *
   * - Enabled by default
   */
  extractSignals?: boolean
  /**
   * [ZH] 信号定义提取路径（相对 config 所在目录）。
   *
   * - 默认：`src/resources/signals.ts`
   *
   * [EN] Signal definitions output path (relative to the config file).
   *
   * - Default: `src/resources/signals.ts`
   */
  signalsPath?: string
}

export type GstsConfig = {
  /**
   * [ZH] 源码根目录（entries 相对该目录解析）
   *
   * [EN] Source root (entries are resolved relative to this directory)
   */
  compileRoot: string
  /**
   * [ZH] 入口（相对 compileRoot）。
   *
   * - 支持 glob：如 `src/**` + `/*.ts`
   * - 目录仍可写成 `src`，会自动展开成 `src/**` + `/*.ts`
   * - 支持 `!` 反选（fast-glob 语义），用于排除匹配
   *
   * [EN] Entries (relative to compileRoot).
   *
   * - Supports glob patterns
   * - A directory like `src` will be expanded to `src/**` + `/*.ts`
   * - Supports negation with `!` (fast-glob semantics)
   */
  entries: string[]
  /**
   * [ZH] 输出根目录（保持相对路径结构，文件名追加 .gs.ts）
   *
   * [EN] Output root (keeps relative structure, appends .gs.ts)
   */
  outDir: string
  options?: GstsTransformOptions
  /**
   * [ZH] CLI 语言：默认 `auto`（自动检测系统语言）。
   *
   * [EN] CLI language: default `auto` (detect from system language).
   */
  lang?: GstsLang
  /**
   * [ZH] 注入设置：配置后将尝试把生成的 `.gia` 注入到对应的 `.gil` 地图中。
   *
   * 提示：可用 `gsts maps` 找到最近编辑过的地图文件，辅助填写 mapId。
   *
   * [EN] Injection settings. If provided, `.gia` will be injected into the target `.gil` map.
   *
   * Tip: use `gsts maps` to locate recently edited map files and fill in mapId.
   */
  inject?: GstsInjectConfig
  /** [ZH] 资源工具配置；编译器不会消费此字段。 / [EN] Asset-tool configuration, ignored by the compiler. */
  assets?: GstsAssetsConfig
}
