import { g } from 'genshin-ts/runtime/core'

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

const classicZhCharacterSkill = g.characterSkill({ mode: 'classic', lang: 'zh' })
expectType<
  ClientStartGraphApi<ClientFlowFunctionClass<'character_skill', 'classic'>, 'zh', 'classic'>
>(classicZhCharacterSkill)

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

// scoped client helper globals capability tables are generated and typed
import {
  CLIENT_BLOCKED_SERVER_HELPERS,
  CLIENT_SCOPED_GLOBAL_MEMBERS_BY_SUB_TYPE,
  CLIENT_SCOPED_GLOBALS_CAPABILITY
} from '../../../src/definitions/client_scoped_globals.js'

expectType<readonly string[]>(CLIENT_SCOPED_GLOBAL_MEMBERS_BY_SUB_TYPE.character_skill.Vector3)
expectType<readonly string[]>(CLIENT_SCOPED_GLOBAL_MEMBERS_BY_SUB_TYPE.bool_filter.Mathf)
expectType<'setTimeout'>(CLIENT_BLOCKED_SERVER_HELPERS[0])
expectType<number>(CLIENT_SCOPED_GLOBALS_CAPABILITY.length)
