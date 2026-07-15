import { g } from 'genshin-ts/runtime/core'

// scoped client helper globals capability tables are generated and typed
import {
  CLIENT_BLOCKED_SERVER_HELPERS,
  CLIENT_SCOPED_GLOBAL_MEMBERS_BY_SUB_TYPE,
  CLIENT_SCOPED_GLOBALS_CAPABILITY
} from '../../../src/definitions/client_scoped_globals.js'
import type {
  ClientBoolFilterExecutionFlowFunctions,
  ClientCharacterSkillExecutionFlowFunctions,
  ClientCreationSkillExecutionFlowFunctions,
  ClientCreationStatusDecisionExecutionFlowFunctions,
  ClientCreationStatusExecutionFlowFunctions,
  ClientIntFilterExecutionFlowFunctions,
  ServerExecutionFlowFunctions
} from '../../../src/definitions/nodes.js'
import type {
  ClientFilterGraphApi,
  ClientFlowFunctionClass,
  ClientStartGraphApi
} from '../../../src/runtime/client_graph_support.js'
import type { bool, int } from '../../../src/runtime/value.js'

declare function expectType<T>(value: T): void

const classicZhCreationSkill = g.creationSkill({ mode: 'classic', lang: 'zh' })
expectType<
  ClientStartGraphApi<ClientFlowFunctionClass<'creation_skill', 'classic'>, 'zh', 'classic'>
>(classicZhCreationSkill)

// @ts-expect-error BeyondEditor has no classic character skill graph
g.characterSkill({ mode: 'classic' })
// @ts-expect-error BeyondEditor has no classic character control skill graph
g.characterControlSkill({ mode: 'classic' })

const beyondZhIntFilter = g.intFilter({ lang: 'zh' })
expectType<
  ClientFilterGraphApi<
    ClientFlowFunctionClass<'int_filter', 'beyond'>,
    bigint | number | int,
    'zh',
    'beyond'
  >
>(beyondZhIntFilter)

const classicEnBoolFilter = g.boolFilter({ mode: 'classic' })
expectType<
  ClientFilterGraphApi<
    ClientFlowFunctionClass<'bool_filter', 'classic'>,
    boolean | bool,
    'en',
    'classic'
  >
>(classicEnBoolFilter)

declare const classicFilterFns: ClientFlowFunctionClass<'bool_filter', 'classic'>
classicFilterFns.getPlayerSCharacterList
// @ts-expect-error current client time is Beyond-only
classicFilterFns.getCurrentClientTime()

declare const classicCreationFns: ClientFlowFunctionClass<'creation_skill', 'classic'>
classicCreationFns.checkClassicModeCharacterId
// @ts-expect-error server notification is Beyond-only in creation skill graphs
classicCreationFns.notifyServerNodeGraph

expectType<ServerExecutionFlowFunctions>(gsts.f)
expectType<ServerExecutionFlowFunctions>(gsts.fServer)
expectType<ClientCharacterSkillExecutionFlowFunctions>(gsts.fCharacterSkill)
expectType<ClientCreationSkillExecutionFlowFunctions>(gsts.fCreationSkill)
expectType<ClientCreationStatusExecutionFlowFunctions>(gsts.fCreationStatus)
expectType<ClientCreationStatusDecisionExecutionFlowFunctions>(gsts.fCreationStatusDecision)
expectType<ClientBoolFilterExecutionFlowFunctions>(gsts.fBoolFilter)
expectType<ClientIntFilterExecutionFlowFunctions>(gsts.fIntFilter)
expectType<boolean>(gsts.ctx.isClientCtx())
expectType<boolean>(gsts.ctx.isClientGraphCtx('bool_filter'))
gsts.ctx.assertClientCtx()
gsts.ctx.assertClientGraphCtx('bool_filter')
gsts.ctx.withCtx('client_bool_filter_if', () => {})
gsts.ctx.withCtx('client_bool_filter_loop', () => {})
gsts.ctx.withCtx('client_bool_filter_switch', () => {})

expectType<readonly string[]>(CLIENT_SCOPED_GLOBAL_MEMBERS_BY_SUB_TYPE.character_skill.Vector3)
expectType<readonly string[]>(CLIENT_SCOPED_GLOBAL_MEMBERS_BY_SUB_TYPE.bool_filter.Mathf)
expectType<'setTimeout'>(CLIENT_BLOCKED_SERVER_HELPERS[0])
expectType<number>(CLIENT_SCOPED_GLOBALS_CAPABILITY.length)
