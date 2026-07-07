import {
  CLIENT_BLOCKED_SERVER_HELPERS,
  CLIENT_SCOPED_GLOBAL_MEMBERS_BY_SUB_TYPE,
  CLIENT_SCOPED_GLOBALS_CAPABILITY
} from '../definitions/client_scoped_globals.js'
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../shared/client_capability_errors.js'
import type { ClientGraphMode, ClientGraphSubType } from './IR.js'

const CLIENT_F_GLOBAL_NAME_BY_SUB_TYPE: Record<ClientGraphSubType, string> = {
  character_skill: 'fCharacterSkill',
  creation_skill: 'fCreationSkill',
  creation_status: 'fCreationStatus',
  creation_status_decision: 'fCreationStatusDecision',
  bool_filter: 'fBoolFilter',
  int_filter: 'fIntFilter'
}

function helperUnavailable(name: string, subType: ClientGraphSubType, mode: ClientGraphMode) {
  return clientNodegraphError(
    CLIENT_ERROR_CODES.HELPER_UNAVAILABLE,
    `[client scoped globals] ${name} is not available in ${subType} ${mode} mode`
  )
}

function callClientF(
  subType: ClientGraphSubType,
  mode: ClientGraphMode,
  helperName: string,
  method: string,
  args: unknown[]
): unknown {
  const fns = (gsts as unknown as Record<string, Record<string, unknown>>)[
    CLIENT_F_GLOBAL_NAME_BY_SUB_TYPE[subType]
  ]
  const fn = fns[method]
  if (typeof fn !== 'function') {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.HELPER_UNAVAILABLE,
      `[client scoped globals] ${helperName} requires client method ${method} which is not generated yet for ${subType} ${mode} mode`
    )
  }
  return fn.apply(fns, args)
}

type MemberFactory = (call: (method: string, args: unknown[]) => unknown) => unknown

/** implementations for capability-proven members; keys are `helper` or `helper.member` */
const MEMBER_IMPLS: Record<string, MemberFactory> = {
  self: (call) => call('getSelfEntity', []),
  stage: (call) => call('getStageEntity', []),
  level: (call) => call('getStageEntity', []),
  'Mathf.Abs': (call) => (value: unknown) => call('absoluteValueOperation', [value]),
  'Mathf.Sin': (call) => (radian: unknown) => call('sineFunction', [radian]),
  'Mathf.Cos': (call) => (radian: unknown) => call('cosineFunction', [radian]),
  'Mathf.Tan': (call) => (radian: unknown) => call('tangentFunction', [radian]),
  'Vector3.zero': (call) => call('create3dVector', [0, 0, 0]),
  'Vector3.one': (call) => call('create3dVector', [1, 1, 1]),
  'Vector3.up': (call) => call('create3dVector', [0, 1, 0]),
  'Vector3.down': (call) => call('create3dVector', [0, -1, 0]),
  'Vector3.left': (call) => call('create3dVector', [-1, 0, 0]),
  'Vector3.right': (call) => call('create3dVector', [1, 0, 0]),
  'Vector3.forward': (call) => call('create3dVector', [0, 0, 1]),
  'Vector3.back': (call) => call('create3dVector', [0, 0, -1]),
  'Vector3.Dot': (call) => (a: unknown, b: unknown) => call('_3dVectorDotProduct', [a, b]),
  'Vector3.Cross': (call) => (a: unknown, b: unknown) => call('_3dVectorCrossProduct', [a, b]),
  'Vector3.Angle': (call) => (a: unknown, b: unknown) => call('_3dVectorAngle', [a, b]),
  'Vector3.Normalize': (call) => (v: unknown) => call('_3dVectorNormalization', [v]),
  'Vector3.Magnitude': (call) => (v: unknown) => call('_3dVectorModuloOperation', [v]),
  'Vector3.Add': (call) => (a: unknown, b: unknown) => call('_3dVectorAddition', [a, b]),
  'Vector3.Sub': (call) => (a: unknown, b: unknown) => call('_3dVectorSubtraction', [a, b]),
  'Vector3.Scale': (call) => (v: unknown, s: unknown) => call('_3dVectorZoom', [v, s]),
  'Vector3.Rotation': (call) => (rotate: unknown, v: unknown) =>
    call('_3dVectorRotation', [rotate, v]),
  'Vector3.Lerp': (call) => (a: unknown, b: unknown, t: unknown) => {
    const diff = call('_3dVectorSubtraction', [b, a])
    const scaled = call('_3dVectorZoom', [diff, t])
    return call('_3dVectorAddition', [a, scaled])
  },
  'GameObject.Find': (call) => (guidValue: unknown) => call('queryEntityByGuid', [guidValue]),
  'GameObject.FindWithTag': (call) => (tag: unknown) => {
    const listValue = call('getEntityListByUnitTag', [tag])
    return call('getCorrespondingValueFromList', [listValue, 0n])
  },
  'GameObject.FindGameObjectsWithTag': (call) => (tag: unknown) =>
    call('getEntityListByUnitTag', [tag]),
  'Random.Range': (call) => (min: unknown, max: unknown) => call('getRandomNumber', [min, max]),
  'Random.value': (call) => () => call('getRandomNumber', [0, 1])
}

/** helpers exposed as plain getters (no member object) */
const VALUE_HELPERS = new Set(['self', 'stage', 'level'])

/** helpers pending developer confirmation: always installed as rejecting stubs */
const CONFIRMATION_PENDING_HELPERS = ['send'] as const

/** decided unavailable (2026-07-06): no client equivalent, blocked like timer */
const BLOCKED_HELPERS = ['player'] as const

export function installScopedClientGlobals(
  subType: ClientGraphSubType,
  mode: ClientGraphMode
): () => void {
  const root = globalThis as unknown as Record<string, unknown>
  const supported = CLIENT_SCOPED_GLOBAL_MEMBERS_BY_SUB_TYPE[subType]
  const saved: Array<{ name: string; descriptor: PropertyDescriptor | undefined }> = []

  const define = (name: string, descriptor: PropertyDescriptor): boolean => {
    const prev = Object.getOwnPropertyDescriptor(root, name)
    if (prev && !prev.configurable) return false
    saved.push({ name, descriptor: prev })
    Object.defineProperty(root, name, { ...descriptor, configurable: true, enumerable: true })
    return true
  }

  const makeCall = (helperName: string) => (method: string, args: unknown[]) =>
    callClientF(subType, mode, helperName, method, args)

  // every known member per helper (any status), so unavailable ones reject explicitly
  const knownMembersByHelper = new Map<string, Set<string>>()
  for (const entry of CLIENT_SCOPED_GLOBALS_CAPABILITY) {
    if (!entry.member) continue
    const set = knownMembersByHelper.get(entry.helper) ?? new Set<string>()
    knownMembersByHelper.set(entry.helper, set)
    set.add(entry.member)
  }

  for (const [helper, members] of Object.entries(supported)) {
    if (VALUE_HELPERS.has(helper)) {
      define(helper, {
        get: () => MEMBER_IMPLS[helper](makeCall(helper))
      })
      continue
    }
    const obj: Record<string, unknown> = {}
    const memberSet = new Set(members)
    const allMembers = knownMembersByHelper.get(helper) ?? new Set(members)
    for (const member of allMembers) {
      const key = `${helper}.${member}`
      if (memberSet.has(member) && MEMBER_IMPLS[key]) {
        const impl = MEMBER_IMPLS[key]
        // constant-like members (Vector3.zero etc.) are getters; functions stay functions
        Object.defineProperty(obj, member, {
          enumerable: true,
          get: () => impl(makeCall(key))
        })
      } else {
        Object.defineProperty(obj, member, {
          enumerable: true,
          get: () => {
            throw helperUnavailable(key, subType, mode)
          }
        })
      }
    }
    define(helper, { value: obj })
  }

  for (const helper of [...CONFIRMATION_PENDING_HELPERS, ...BLOCKED_HELPERS]) {
    define(helper, {
      get: () => {
        throw helperUnavailable(helper, subType, mode)
      }
    })
  }

  for (const helper of CLIENT_BLOCKED_SERVER_HELPERS) {
    define(helper, {
      value: () => {
        throw helperUnavailable(helper, subType, mode)
      }
    })
  }

  return () => {
    for (let i = saved.length - 1; i >= 0; i--) {
      const { name, descriptor } = saved[i]
      if (descriptor) {
        Object.defineProperty(root, name, descriptor)
      } else {
        delete root[name]
      }
    }
  }
}
