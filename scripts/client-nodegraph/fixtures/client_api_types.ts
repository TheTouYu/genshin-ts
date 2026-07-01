import { g } from 'genshin-ts/runtime/core'

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
