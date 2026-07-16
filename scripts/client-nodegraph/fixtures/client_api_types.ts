import { g } from 'genshin-ts/runtime/core'

import type { clientEntity as ClientEntityType } from '../../../src/definitions/client_entity_helpers.js'
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
  ClientFlowFunctionClassForLang,
  ClientStartGraphApi
} from '../../../src/runtime/client_graph_support.js'
import type { bool, generic, int, vec3 } from '../../../src/runtime/value.js'

declare function expectType<T>(value: T): void

const classicZhCreationSkill = g.creationSkill({ mode: 'classic', lang: 'zh' })
expectType<
  ClientStartGraphApi<
    ClientFlowFunctionClassForLang<'creation_skill', 'zh', 'classic'>,
    'zh',
    'classic'
  >
>(classicZhCreationSkill)
classicZhCreationSkill.on('start', (_evt, f) => {
  const selfEntity = f.获取自身实体()
  f.加法运算(1n, 2n)
  f.addition(3n, 4n)
  f.查询经典模式角色编号(selfEntity)
  selfEntity.recoverCreationSHp(10, false)
  expectType<generic>(selfEntity.get('score'))
  selfEntity.characters
  expectType<generic>(selfEntity.characters[0].get('score'))
  // @ts-expect-error returned client entities keep the same capability filter
  selfEntity.characters[0].set('score', 1n)
  // @ts-expect-error custom-variable assignment has no client node equivalent
  selfEntity.set('score', 1n)
  // @ts-expect-error aggro helpers are Beyond-only in creation skill graphs
  selfEntity.tauntTarget
  // @ts-expect-error server notification is Beyond-only in classic creation skill graphs
  f.通知服务器节点图('test', '', '')
})

g.characterControlSkill().on('start', (_evt, f) => {
  const controlMotor = f.getSelfEntity()
  expectType<ClientEntityType<'character_control_skill', 'beyond'>>(controlMotor)
  controlMotor.addVelocity(1.5, [0, 1, 0], 0.5)
  controlMotor.fixedPointProjectileLaunch(10001, [0, 0, 0], [0, 0, 0], 1n)
  expectType<vec3>(controlMotor.pos)
  expectType<generic>(controlMotor.get('speed'))
  // Client addUnitStatus uses (stacks, configId), after the entity receiver.
  controlMotor.addUnitStatus(2n, 10001)

  const exactAgain = clientEntity(controlMotor)
  expectType<ClientEntityType<'character_control_skill', 'beyond'>>(exactAgain)

  const assembled = f.assemblyList([self, controlMotor], 'entity')
  expectType<ClientEntityType<'character_control_skill', 'beyond'>[]>(assembled)
  const entityDictionary = f.assemblyDictionary([{ k: 'self', v: self }])
  expectType<ClientEntityType<'character_control_skill', 'beyond'>>(
    f.queryDictionaryValueByKey(entityDictionary, 'self')
  )

  // Entity parameters remain generic; callers do not need clientEntity casts.
  f.getEntityLocation(self)

  const convertedSelf = clientEntity(self)
  const convertedFound = clientEntity(GameObject.Find(10001n))
  expectType<ClientEntityType>(convertedSelf)
  expectType<clientEntity>(convertedSelf)
  expectType<ClientEntityType>(convertedFound)
  convertedSelf.get('speed')
  convertedFound.get('speed')
  // @ts-expect-error explicit client entities do not expose server-only helpers
  convertedSelf.set('speed', 1)
  // @ts-expect-error custom-variable assignment has no client node equivalent
  controlMotor.set('speed', 1)
})

g.creationSkill().on('start', (_evt, f) => {
  const selfEntity = f.getSelfEntity()
  selfEntity.tauntTarget
  // @ts-expect-error classic-only player character list shortcut
  selfEntity.characters
})

// @ts-expect-error BeyondEditor has no classic character skill graph
g.characterSkill({ mode: 'classic' })
// @ts-expect-error BeyondEditor has no classic character control skill graph
g.characterControlSkill({ mode: 'classic' })

const beyondZhIntFilter = g.intFilter({ lang: 'zh' })
expectType<
  ClientFilterGraphApi<
    ClientFlowFunctionClassForLang<'int_filter', 'zh', 'beyond'>,
    bigint | number | int,
    'zh',
    'beyond'
  >
>(beyondZhIntFilter)
beyondZhIntFilter.on('start', (_evt, f) => {
  f.获取当前客户端时间高精度()
  return f.加法运算(1n, 2n)
})

const classicEnBoolFilter = g.boolFilter({ mode: 'classic' })
expectType<
  ClientFilterGraphApi<
    ClientFlowFunctionClass<'bool_filter', 'classic'>,
    boolean | bool,
    'en',
    'classic'
  >
>(classicEnBoolFilter)
classicEnBoolFilter.on('start', (_evt, f) => {
  // @ts-expect-error Chinese aliases require lang: 'zh'
  f.加法运算(1n, 2n)
  return true
})

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
expectType<'print'>(CLIENT_BLOCKED_SERVER_HELPERS[0])
expectType<'setTimeout'>(CLIENT_BLOCKED_SERVER_HELPERS[1])
expectType<number>(CLIENT_SCOPED_GLOBALS_CAPABILITY.length)
