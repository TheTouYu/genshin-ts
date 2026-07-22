/**
 * Shared pin-hole / hidden-pin argument layout adapter (P5-W9).
 *
 * Root historically owned null-hole splicing and IR→physical pin remap in
 * index.ts. Composite only hard-coded set_custom_variable. This module is the
 * single table for both scopes.
 *
 * Scope: the 9 ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES only.
 * Not special-arg (signal/assembly/multiple_branches) or typed-identity.
 */

import type { Argument } from '../../runtime/IR.js'
import { setEnumArgValue, setLiteralArgValue } from './pins.js'
import { ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES } from './root_ordinary_capability_inventory.js'

/** Pin-hole node types owned by this shared adapter (full family). */
export const SHARED_PIN_HOLE_ADAPTER_NODE_TYPES = ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES

export type PinHoleSpec = {
  /** Expected IR arg count (nodes.ts surface). Adapter applies only when equal. */
  argsLength: number
  /** Physical pin index of the hidden/null hole. */
  holeIndex: number
}

/**
 * IR logical arg count → physical hole index.
 * Mirrors historical root applyArgsWithNullHole + remapInputIndexForHiddenPin.
 */
export const PIN_HOLE_SPECS: Readonly<Record<string, PinHoleSpec>> = {
  create_prefab: { argsLength: 7, holeIndex: 4 },
  create_prefab_group: { argsLength: 7, holeIndex: 4 },
  activate_disable_follow_motion_device: { argsLength: 2, holeIndex: 1 },
  activate_disable_collision_trigger_source: { argsLength: 2, holeIndex: 1 },
  activate_disable_character_disruptor_device: { argsLength: 2, holeIndex: 1 },
  activate_disable_pathfinding_obstacle_feature: { argsLength: 2, holeIndex: 1 },
  activate_disable_pathfinding_obstacle: { argsLength: 3, holeIndex: 0 },
  remove_unit_status: { argsLength: 4, holeIndex: 3 },
  set_custom_variable: { argsLength: 4, holeIndex: 3 }
}

export const PIN_HOLE_ADAPTER_CONTRACT = {
  phase: 'P5-W9',
  workPackage: 'P5-W9',
  family: 'pin-hole',
  nodeTypes: SHARED_PIN_HOLE_ADAPTER_NODE_TYPES,
  sharedModule: 'pin_hole_adapter.ts',
  defaultVendorImplGraphGate: true,
  deletesLegacyBackend: false,
  changesProductionEncoding: true,
  notes:
    'Shared IR→physical pin-hole remap + optional null-hole literal apply for all 9 named pin-hole adapters.'
} as const

export function isSharedPinHoleAdapterNodeType(nodeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(PIN_HOLE_SPECS, nodeType)
}

export function getPinHoleSpec(nodeType: string): PinHoleSpec | undefined {
  return PIN_HOLE_SPECS[nodeType]
}

/**
 * Map IR argument / connection index → physical InParam pin index.
 * Identity when nodeType has no pin-hole entry.
 */
export function remapPinHoleInputIndex(nodeType: string, irIndex: number): number {
  const spec = PIN_HOLE_SPECS[nodeType]
  if (!spec) return irIndex
  return irIndex >= spec.holeIndex ? irIndex + 1 : irIndex
}

/**
 * Convenience for factory `inputPinIndex` callbacks.
 */
export function pinHoleInputPinIndex(nodeType: string): (argIndex: number) => number {
  return (argIndex) => remapPinHoleInputIndex(nodeType, argIndex)
}

type ValueArgument = Exclude<Argument, { type: 'conn' } | null>

function isValueArg(a: Argument | undefined | null): a is ValueArgument {
  return !!a && a.type !== 'conn'
}

/**
 * Apply literal args with a null hole spliced at holeIndex when IR arg count matches.
 * Returns true when this nodeType is a pin-hole adapter and the length matched
 * (caller should skip generic arg apply). Returns false when not applicable.
 */
export function applyPinHoleLiteralArgs(
  nodeType: string,
  giaNode: any,
  args: Array<Argument | null | undefined> | undefined
): boolean {
  const spec = PIN_HOLE_SPECS[nodeType]
  if (!spec) return false
  const list = args ?? []
  if (list.length !== spec.argsLength) return false

  const patched: Array<Argument | null> = list.map((a) => (a === undefined ? null : a))
  patched.splice(spec.holeIndex, 0, null)

  for (let i = 0; i < patched.length; i++) {
    const a = patched[i]
    if (!isValueArg(a)) continue
    try {
      if (a.type === 'enum' || a.type === 'enumeration') {
        setEnumArgValue(giaNode as any, i, i, nodeType, a.value)
      } else {
        setLiteralArgValue(giaNode as any, i, i, nodeType, a.type, a.value)
      }
    } catch (e) {
      console.error(
        `[error] failed to set pin-hole value for pin ${i} of node ${nodeType} (id=${(giaNode as any).NodeIndex})\n`
      )
      throw e
    }
  }
  return true
}
