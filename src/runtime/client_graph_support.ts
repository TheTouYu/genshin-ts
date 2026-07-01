import { CLIENT_GRAPH_ENTRY_SPEC_BY_SUB_TYPE } from '../definitions/client_graph_modes.js'
import {
  ClientBoolFilterExecutionFlowFunctions,
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
   * 设置为 `zh` 时，客户端节点图 API 使用中文事件名与中文 f 函数别名提示；
   * 默认 `en` 使用英文事件名与英文 f 函数名。
   *
   * [EN] Language hint (affects type hints and zh alias resolution only).
   *
   * Use `zh` for Chinese event names and Chinese f-function alias hints; the default `en` uses
   * English event names and English f-function names.
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

export type ClientStartEvent = Record<string, never>
export type ClientStartEventName = 'start'
export type ClientStartGraphSubType = Exclude<ClientGraphSubType, 'bool_filter' | 'int_filter'>

export type ClientFlowFunctionClass<
  T extends ClientGraphSubType,
  Mode extends ClientGraphMode = 'beyond'
> = Mode extends ClientGraphMode
  ? T extends 'character_skill'
    ? ClientCharacterSkillExecutionFlowFunctions
    : T extends 'creation_skill'
      ? ClientCreationSkillExecutionFlowFunctions
      : T extends 'creation_status'
        ? ClientCreationStatusExecutionFlowFunctions
        : T extends 'creation_status_decision'
          ? ClientCreationStatusDecisionExecutionFlowFunctions
          : T extends 'bool_filter'
            ? ClientBoolFilterExecutionFlowFunctions
            : ClientIntFilterExecutionFlowFunctions
  : never

export type ClientStartHandler<F> = (evt: ClientStartEvent, f: F) => void
export type ClientFilterHandler<F, R> = (evt: ClientStartEvent, f: F) => R

export type ClientStartGraphApi<
  F,
  Lang extends ClientLang = 'en',
  Mode extends ClientGraphMode = 'beyond'
> = {
  on(
    eventName: ClientStartEventName,
    handler: ClientStartHandler<F>
  ): ClientStartGraphApi<F, Lang, Mode>
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

export function createClientFlowFunctions<T extends ClientGraphSubType>(
  subType: T,
  registry: ExecutionFlowRegistry
): ClientFlowFunctionClass<T, ClientGraphMode> {
  switch (subType) {
    case 'character_skill':
      return new ClientCharacterSkillExecutionFlowFunctions(registry) as ClientFlowFunctionClass<
        T,
        ClientGraphMode
      >
    case 'creation_skill':
      return new ClientCreationSkillExecutionFlowFunctions(registry) as ClientFlowFunctionClass<
        T,
        ClientGraphMode
      >
    case 'creation_status':
      return new ClientCreationStatusExecutionFlowFunctions(registry) as ClientFlowFunctionClass<
        T,
        ClientGraphMode
      >
    case 'creation_status_decision':
      return new ClientCreationStatusDecisionExecutionFlowFunctions(
        registry
      ) as ClientFlowFunctionClass<T, ClientGraphMode>
    case 'bool_filter':
      return new ClientBoolFilterExecutionFlowFunctions(registry) as ClientFlowFunctionClass<
        T,
        ClientGraphMode
      >
    case 'int_filter':
      return new ClientIntFilterExecutionFlowFunctions(registry) as ClientFlowFunctionClass<
        T,
        ClientGraphMode
      >
  }
}
