import {
  CLIENT_GRAPH_CAPABILITY_BY_SUB_TYPE,
  CLIENT_GRAPH_ENTRY_SPEC_BY_SUB_TYPE,
  isClientGraphModeAvailable,
  type ClientGraphAvailableMode
} from '../definitions/client_graph_modes.js'
import {
  CLIENT_NODE_METHODS_BY_SUB_TYPE_AND_MODE,
  type ClientNodeMethodForMode
} from '../definitions/client_method_modes.js'
import { CLIENT_F_ZH_TO_EN_BY_SUB_TYPE } from '../definitions/client_zh_aliases.js'
import {
  ClientBoolFilterExecutionFlowFunctions,
  ClientCharacterControlSkillExecutionFlowFunctions,
  ClientCharacterSkillExecutionFlowFunctions,
  ClientCreationSkillExecutionFlowFunctions,
  ClientCreationStatusDecisionExecutionFlowFunctions,
  ClientCreationStatusExecutionFlowFunctions,
  ClientIntFilterExecutionFlowFunctions
} from '../definitions/nodes.js'
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../shared/client_capability_errors.js'
import type { ExecutionFlowRegistry } from './core.js'
import type { ClientGraphMode, ClientGraphSubType } from './IR.js'
import { bool, int } from './value.js'

export type ClientLang = 'en' | 'zh'

type ClientGraphOptionsBase = {
  /**
   * [ZH] 客户端节点图 ID（NodeGraph.id）。
   *
   * 对应要注入/替换的目标客户端 NodeGraph ID。客户端节点图默认值为 1082130433。
   *
   * [EN] Client node graph id (NodeGraph.id).
   *
   * The target client NodeGraph id to inject/replace. The client graph default value is 1082130433.
   */
  id?: number
  /**
   * [ZH] 客户端节点图显示名称（NodeGraph.name）。
   *
   * 若不指定：默认使用入口文件名（由 gsts runner 注入 defaultName）。
   *
   * [EN] Display name inside the client node editor (NodeGraph.name).
   *
   * If omitted: defaults to the entry file name (provided by the gsts runner as defaultName).
   */
  name?: string
  /**
   * [ZH] 是否自动加 `_GSTS` 前缀（默认 true）。
   * - true: 若 name/defaultName 不以 `_GSTS` 开头，则自动补 `_GSTS_` 前缀
   * - false: 不做任何前缀处理
   *
   * [EN] Whether to auto prefix with `_GSTS` (default true).
   */
  prefix?: boolean
  /**
   * [ZH] 语言偏好（仅影响类型提示与中文别名解析）。
   *
   * 设置为 `zh` 时，客户端节点图 API 支持中文 f 函数别名；英文函数名仍然可用。
   * 默认 `en` 仅使用英文 f 函数名。技能与过滤器入口事件名为 `start`；
   * 造物状态和造物状态决策使用 `start1`…`start10`。
   *
   * [EN] Language hint (affects type hints and zh alias resolution only).
   *
   * Use `zh` to enable Chinese f-function aliases while retaining English method names. The
   * default `en` exposes English f-function names only. Skill and filter graphs use `start`;
   * Creation Status and Creation Status Decision graphs use `start1`…`start10`.
   */
  lang?: ClientLang
}

export type ClientGraphOptions<Mode extends ClientGraphMode = ClientGraphMode> =
  Mode extends 'classic'
    ? ClientGraphOptionsBase & {
        /**
         * [ZH] 客户端节点图模式（经典模式 Classic Mode）。
         *
         * 使用经典模式构建该客户端节点图；事件与 f 函数类型提示会匹配 classic 模式可用能力。
         *
         * [EN] Client graph mode (Classic Mode).
         *
         * Builds this client node graph in Classic Mode; event and f-function type hints match
         * classic-compatible capabilities.
         */
        mode: 'classic'
      }
    : ClientGraphOptionsBase & {
        /**
         * [ZH] 客户端节点图模式（默认超限模式 Beyond Mode）。
         *
         * 使用超限模式构建该客户端节点图；事件与 f 函数类型提示会匹配 beyond 模式可用能力。
         *
         * [EN] Client graph mode (default: Beyond Mode).
         *
         * Builds this client node graph in Beyond Mode; event and f-function type hints match
         * beyond-compatible capabilities.
         */
        mode?: 'beyond'
      }

export type ClientFilterGraphOptions<Mode extends ClientGraphMode = ClientGraphMode> =
  ClientGraphOptions<Mode> & {
    /**
     * [ZH] 过滤器执行时间间隔，单位为秒（默认 0.3）。
     *
     * 写入客户端 NodeGraph.evaluationInterval。
     *
     * [EN] Filter evaluation interval in seconds (default: 0.3).
     *
     * Encoded as client NodeGraph.evaluationInterval.
     */
    evaluationInterval?: number
  }

export type ClientStartEvent = Record<string, never>
export type ClientStartEventName = 'start'
/**
 * [ZH] 造物状态/状态决策的【按顺序唯一执行】入口。
 *
 * `start1`…`start10` 分别对应编辑器中的 1…10 号执行引脚，并按引脚顺序执行。
 *
 * GSTS 注: 这些入口仅用于拆分和组织代码，不表示可切换的行为状态。
 * 将相同语句全部写在单一 `start1` 中按顺序串联，也能得到相同效果。
 * 要控制不同逻辑，可以在一个造物状态图中把不同条件连接到各行为节点的【是否执行】
 * 参数；也可以把不同行为拆分到不同的造物状态图，再由状态决策图选择不同的状态图。
 *
 * [EN] Ordered-exclusive entry branches for Creation Status and Status Decision graphs.
 *
 * `start1`…`start10` map to editor output pins 1…10 and execute in pin order.
 *
 * GSTS Note: These entries only split and organize code; they do not represent switchable
 * behavior states. Writing the same statements sequentially in one `start1` handler produces
 * the same behavior. To control different logic, either connect conditions to the [Execute]
 * inputs of actions in one Creation Status graph, or split behaviors into separate status graphs
 * and let a decision graph select different status graphs.
 */
export type ClientOrderedStartEventName =
  | 'start1'
  | 'start2'
  | 'start3'
  | 'start4'
  | 'start5'
  | 'start6'
  | 'start7'
  | 'start8'
  | 'start9'
  | 'start10'

export type ClientStartEventNameForSubType<T extends ClientGraphSubType> = T extends
  | 'creation_status'
  | 'creation_status_decision'
  ? ClientOrderedStartEventName
  : ClientStartEventName
export type ClientStartGraphSubType = Exclude<ClientGraphSubType, 'bool_filter' | 'int_filter'>

type ClientFlowFunctionBase<
  T extends ClientGraphSubType,
  Mode extends ClientGraphMode
> = T extends 'character_skill'
  ? ClientCharacterSkillExecutionFlowFunctions<Mode>
  : T extends 'character_control_skill'
    ? ClientCharacterControlSkillExecutionFlowFunctions<Mode>
    : T extends 'creation_skill'
      ? ClientCreationSkillExecutionFlowFunctions<Mode>
      : T extends 'creation_status'
        ? ClientCreationStatusExecutionFlowFunctions<Mode>
        : T extends 'creation_status_decision'
          ? ClientCreationStatusDecisionExecutionFlowFunctions<Mode>
          : T extends 'bool_filter'
            ? ClientBoolFilterExecutionFlowFunctions<Mode>
            : ClientIntFilterExecutionFlowFunctions<Mode>

type ClientSyntheticFlowMethod<T extends ClientGraphSubType, Mode extends ClientGraphMode> =
  | 'copyList'
  | 'emptyList'
  | (T extends 'bool_filter' | 'int_filter' ? never : 'return')
  | ('finiteLoop' extends ClientNodeMethodForMode<T, Mode>
      ?
          | 'continue'
          | ('getListLength' extends ClientNodeMethodForMode<T, Mode>
              ? 'getCorrespondingValueFromList' extends ClientNodeMethodForMode<T, Mode>
                ? 'subtraction' extends ClientNodeMethodForMode<T, Mode>
                  ? 'listIterationLoop'
                  : never
                : never
              : never)
      : never)
  | ('getLocalVariable' extends ClientNodeMethodForMode<T, Mode>
      ? 'setLocalVariable' extends ClientNodeMethodForMode<T, Mode>
        ? 'emptyLocalVariableList' | 'initLocalVariable'
        : never
      : never)

export type ClientFlowFunctionClass<
  T extends ClientGraphSubType,
  Mode extends ClientGraphMode = ClientGraphMode
> = ClientGraphMode extends Mode
  ? ClientFlowFunctionBase<T, Mode>
  : Pick<
      ClientFlowFunctionBase<T, Mode>,
      Extract<
        ClientNodeMethodForMode<T, Mode> | ClientSyntheticFlowMethod<T, Mode>,
        keyof ClientFlowFunctionBase<T, Mode>
      >
    >

type ClientFlowFunctionZhAliasMap<T extends ClientGraphSubType> =
  (typeof CLIENT_F_ZH_TO_EN_BY_SUB_TYPE)[T]

export type ClientFlowFunctionClassZh<
  T extends ClientGraphSubType,
  Mode extends ClientGraphMode = ClientGraphMode
> = ClientFlowFunctionClass<T, Mode> & {
  [K in keyof ClientFlowFunctionZhAliasMap<T> as Extract<
    ClientFlowFunctionZhAliasMap<T>[K],
    keyof ClientFlowFunctionClass<T, Mode>
  > extends never
    ? never
    : K]: ClientFlowFunctionClass<T, Mode>[Extract<
    ClientFlowFunctionZhAliasMap<T>[K],
    keyof ClientFlowFunctionClass<T, Mode>
  >]
}

export type ClientFlowFunctionClassForLang<
  T extends ClientGraphSubType,
  Lang extends ClientLang,
  Mode extends ClientGraphMode = ClientGraphMode
> = Lang extends 'zh' ? ClientFlowFunctionClassZh<T, Mode> : ClientFlowFunctionClass<T, Mode>

export type ClientGraphOptionsForSubType<T extends ClientGraphSubType> = ClientGraphOptions<
  ClientGraphAvailableMode<T>
>

export type ClientFilterGraphOptionsForSubType<T extends 'bool_filter' | 'int_filter'> =
  ClientFilterGraphOptions<ClientGraphAvailableMode<T>>

export type ClientStartHandler<F> = (evt: ClientStartEvent, f: F) => void
export type ClientFilterHandler<F, R> = (evt: ClientStartEvent, f: F) => R

export type ClientStartGraphApi<
  F,
  Lang extends ClientLang = 'en',
  Mode extends ClientGraphMode = 'beyond',
  EventName extends string = ClientStartEventName
> = {
  /**
   * Register an entry handler for this client graph.
   *
   * GSTS Note: In Creation Status and Creation Status Decision graphs, `start1`…`start10` map
   * to the editor's ordered-exclusive output pins 1…10 and execute in pin order. They only split
   * and organize code; they do not represent switchable behavior states. Writing the same
   * statements sequentially in one `start1` handler produces the same behavior.
   *
   * GSTS Note: To control different logic, either connect conditions to the [Execute] inputs of
   * actions in one Creation Status graph, or split behaviors into separate status graphs and let
   * a Creation Status Decision graph select different status graph configuration IDs.
   *
   * GSTS Note: Inside those handlers, sequential action calls are connected through [Failure]
   * outputs. Although the code is written in order, the following statement is not executed
   * unconditionally; it runs only if the preceding action fails.
   *
   * 注册客户端节点图入口处理函数。
   *
   * GSTS 注: 在造物状态与造物状态决策节点图中，`start1`…`start10` 分别对应
   * 编辑器【按顺序唯一执行】的 1…10 号执行引脚，并按引脚顺序执行。这些入口仅用于
   * 拆分和组织代码，不表示可切换的行为状态。将相同语句全部写在单一 `start1` 中
   * 按顺序串联，也能得到相同效果。
   *
   * GSTS 注: 要控制不同逻辑，可以在一个造物状态图中把不同条件连接到各行为节点的
   * 【是否执行】参数；也可以把不同行为拆分到不同的造物状态图，再由造物状态决策图
   * 选择不同的状态节点图配置 ID。
   *
   * GSTS 注: 在这些入口函数中，顺序行为调用通过【失败执行】引脚连接。虽然代码按顺序
   * 书写，但下一条语句并不是无条件执行；只有前面的行为执行失败，才会执行后面的语句。
   */
  on(
    eventName: EventName,
    handler: ClientStartHandler<F>
  ): ClientStartGraphApi<F, Lang, Mode, EventName>
}

export type ClientFilterGraphApi<
  F,
  R,
  Lang extends ClientLang = 'en',
  Mode extends ClientGraphMode = 'beyond'
> = {
  on(
    eventName: ClientStartEventName,
    handler: ClientFilterHandler<F, R>
  ): ClientFilterGraphApi<F, R, Lang, Mode>
}

export function assertClientGraphMode(mode?: ClientGraphMode): ClientGraphMode {
  const resolved = mode ?? 'beyond'
  if (resolved !== 'beyond' && resolved !== 'classic') {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.MODE_UNAVAILABLE,
      `invalid client mode: ${String(mode)}`
    )
  }
  return resolved
}

export function assertClientGraphModeCompatible(
  subType: ClientGraphSubType,
  mode: ClientGraphMode
): void {
  if (isClientGraphModeAvailable(subType, mode)) return
  const reason = CLIENT_GRAPH_CAPABILITY_BY_SUB_TYPE[subType][mode].reason
  throw clientNodegraphError(
    CLIENT_ERROR_CODES.MODE_UNAVAILABLE,
    `${subType} is not available in ${mode} mode${reason ? `: ${reason}` : ''}`
  )
}

export function assertClientGraphSubType(subType: ClientGraphSubType): ClientGraphSubType {
  if (!(subType in CLIENT_GRAPH_ENTRY_SPEC_BY_SUB_TYPE)) {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.MODE_UNAVAILABLE,
      `invalid client graph subtype: ${String(subType)}`
    )
  }
  return subType
}

export function normalizeClientBoolFilterReturn(result: boolean | bool): bool {
  if (result instanceof bool) return result
  if (typeof result === 'boolean') return new bool(result)
  throw clientNodegraphError(
    CLIENT_ERROR_CODES.FILTER_RETURN_TYPE,
    'bool_filter handler must return boolean or bool'
  )
}

export function normalizeClientIntFilterReturn(result: bigint | number | int): int {
  if (result instanceof int) return result
  if (typeof result === 'bigint') return new int(result)
  if (typeof result === 'number') {
    if (!Number.isSafeInteger(result)) {
      throw clientNodegraphError(
        CLIENT_ERROR_CODES.FILTER_RETURN_RANGE,
        'int_filter number return must be a safe integer'
      )
    }
    return new int(result)
  }
  throw clientNodegraphError(
    CLIENT_ERROR_CODES.FILTER_RETURN_TYPE,
    'int_filter handler must return safe integer number, bigint, or int'
  )
}

export const CLIENT_FILTER_END_NODE_TYPES = {
  bool_filter: 'node_graph_end_boolean',
  int_filter: 'node_graph_end_integer'
} as const

const CLIENT_METHOD_SETS_BY_SUB_TYPE_AND_MODE = Object.fromEntries(
  Object.entries(CLIENT_NODE_METHODS_BY_SUB_TYPE_AND_MODE).map(([subType, modes]) => [
    subType,
    Object.fromEntries(
      Object.entries(modes).map(([mode, methods]) => [mode, new Set<string>(methods)])
    )
  ])
) as unknown as Record<ClientGraphSubType, Record<ClientGraphMode, ReadonlySet<string>>>

export function applyClientFlowFunctionZhAliases<T extends ClientGraphSubType>(
  subType: T,
  mode: ClientGraphMode,
  fns: ClientFlowFunctionClass<T>
): void {
  const target = fns as unknown as Record<string, unknown>
  const availableMethods = CLIENT_METHOD_SETS_BY_SUB_TYPE_AND_MODE[subType][mode]
  const aliases = CLIENT_F_ZH_TO_EN_BY_SUB_TYPE[subType] as Readonly<Record<string, string>>
  for (const [zhName, enName] of Object.entries(aliases)) {
    if (!availableMethods.has(enName) || Object.prototype.hasOwnProperty.call(target, zhName)) {
      continue
    }
    const fn = target[enName]
    if (typeof fn !== 'function') continue
    Object.defineProperty(target, zhName, {
      value: fn,
      writable: false,
      configurable: false,
      enumerable: false
    })
  }
}

export function createClientFlowFunctions<T extends ClientGraphSubType>(
  subType: T,
  registry: ExecutionFlowRegistry
): ClientFlowFunctionClass<T> {
  switch (subType) {
    case 'character_skill':
      return new ClientCharacterSkillExecutionFlowFunctions(registry) as ClientFlowFunctionClass<T>
    case 'character_control_skill':
      return new ClientCharacterControlSkillExecutionFlowFunctions(
        registry
      ) as ClientFlowFunctionClass<T>
    case 'creation_skill':
      return new ClientCreationSkillExecutionFlowFunctions(registry) as ClientFlowFunctionClass<T>
    case 'creation_status':
      return new ClientCreationStatusExecutionFlowFunctions(registry) as ClientFlowFunctionClass<T>
    case 'creation_status_decision':
      return new ClientCreationStatusDecisionExecutionFlowFunctions(
        registry
      ) as ClientFlowFunctionClass<T>
    case 'bool_filter':
      return new ClientBoolFilterExecutionFlowFunctions(registry) as ClientFlowFunctionClass<T>
    case 'int_filter':
      return new ClientIntFilterExecutionFlowFunctions(registry) as ClientFlowFunctionClass<T>
  }
}
