/**
 * Shared special-arg layout adapter (P5-W10).
 *
 * Root historically owned signal ClientExec name pins, assembly count@0 +
 * elements@1+, and multiple_branches case-list packing in
 * index.ts:applySpecialArgs. Composite only partially shared assembly via
 * ordinary_node_factory (P5-W9 fixture side-fix). This module is the single
 * table for all 5 ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES.
 *
 * Scope: ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES only.
 * Not pin-hole, typed-identity, or get_node_graph_variable name-pin.
 */

import type { Argument } from '../../runtime/IR.js'
import { Pin } from '../gia_vendor.js'
import type { NodeType } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/nodes.js'
import { setClientExecLiteralArgValue, setEnumArgValue, setLiteralArgValue } from './pins.js'
import { ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES } from './root_ordinary_capability_inventory.js'

/** Special-arg node types owned by this shared adapter (full family). */
export const SHARED_SPECIAL_ARG_ADAPTER_NODE_TYPES = ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES

export const SPECIAL_ARG_ADAPTER_CONTRACT = {
  phase: 'P5-W10',
  workPackage: 'P5-W10',
  family: 'special-arg',
  nodeTypes: SHARED_SPECIAL_ARG_ADAPTER_NODE_TYPES,
  sharedModule: 'special_arg_adapter.ts',
  defaultVendorImplGraphGate: true,
  deletesLegacyBackend: false,
  changesProductionEncoding: true,
  notes:
    'Shared special-arg layouts: signal ClientExec name + data pin shift, assembly count@0 / elements@1+, multiple_branches control + case list.'
} as const

export type SpecialArgApplyContext = {
  /** Kept for API compatibility; monitor OutParam pins are no longer encoded
   * (real editor samples never carry them — connections reference the
   * CompositeDef-declared OutParam kind/index directly). */
  monitorOutParams?: ReadonlyMap<number, SpecialArgTypeTag>
}

type ScalarArgType =
  | 'bool'
  | 'int'
  | 'float'
  | 'str'
  | 'vec3'
  | 'guid'
  | 'entity'
  | 'prefab_id'
  | 'config_id'
  | 'faction'

/** Minimal type tag for signal param pins (mirrors ConnTypeInfo scalars + list/dict). */
export type SpecialArgTypeTag =
  | { kind: 'scalar'; type: ScalarArgType }
  | { kind: 'list'; element: ScalarArgType }
  | { kind: 'dict'; key: ScalarArgType; value: string }
  | { kind: 'enum' }

type ValueArgument = Exclude<Argument, { type: 'conn' } | null>

function isValueArg(a: Argument | undefined | null): a is ValueArgument {
  return !!a && a.type !== 'conn'
}

export function isSharedSpecialArgAdapterNodeType(nodeType: string): boolean {
  return (SHARED_SPECIAL_ARG_ADAPTER_NODE_TYPES as readonly string[]).includes(nodeType)
}

export function isAssemblySpecialArgNodeType(nodeType: string): boolean {
  return nodeType === 'assembly_list' || nodeType === 'assembly_dictionary'
}

export function isSignalSpecialArgNodeType(nodeType: string): boolean {
  return nodeType === 'send_signal' || nodeType === 'monitor_signal'
}

/**
 * Map IR argument / connection index → physical InParam pin index for special-arg
 * layouts. Identity when nodeType has no special-arg entry.
 *
 * - assembly_list / assembly_dictionary: pin0 = count → IR arg i → pin i+1
 * - send_signal: arg0 = ClientExec name (not InParam) → IR arg i>0 → pin i-1
 * - monitor_signal / multiple_branches: identity for InParam (name is ClientExec)
 */
export function remapSpecialArgInputIndex(nodeType: string, irIndex: number): number {
  if (isAssemblySpecialArgNodeType(nodeType)) return irIndex + 1
  if (nodeType === 'send_signal') return irIndex > 0 ? irIndex - 1 : irIndex
  return irIndex
}

/**
 * Convenience for factory / composite `inputPinIndex` callbacks (special-arg only).
 */
export function specialArgInputPinIndex(nodeType: string): (argIndex: number) => number {
  return (argIndex) => remapSpecialArgInputIndex(nodeType, argIndex)
}

function scalarToNodeType(type: ScalarArgType): NodeType {
  switch (type) {
    case 'bool':
      return { t: 'b', b: 'Bol' }
    case 'int':
      return { t: 'b', b: 'Int' }
    case 'float':
      return { t: 'b', b: 'Flt' }
    case 'str':
      return { t: 'b', b: 'Str' }
    case 'vec3':
      return { t: 'b', b: 'Vec' }
    case 'guid':
      return { t: 'b', b: 'Gid' }
    case 'entity':
      return { t: 'b', b: 'Ety' }
    case 'prefab_id':
      return { t: 'b', b: 'Pfb' }
    case 'config_id':
      return { t: 'b', b: 'Cfg' }
    case 'faction':
      return { t: 'b', b: 'Fct' }
  }
}

function setValueArg(
  giaNode: any,
  pinIndex: number,
  argIndex: number,
  nodeType: string,
  arg: ValueArgument
): void {
  try {
    if (arg.type === 'enum' || arg.type === 'enumeration') {
      setEnumArgValue(giaNode, pinIndex, argIndex, nodeType, arg.value)
    } else {
      setLiteralArgValue(giaNode, pinIndex, argIndex, nodeType, arg.type, arg.value)
    }
  } catch (e) {
    console.error(
      `[error] failed to set special-arg value for pin ${pinIndex} of node ${nodeType} (id=${(giaNode as any).NodeIndex})\n`
    )
    throw e
  }
}

/**
 * Assembly: GIA pin0 = element/kv count; IR args are elements starting at pin1.
 */
export function applyAssemblySpecialArgs(
  nodeType: string,
  giaNode: any,
  args: Array<Argument | null | undefined> | undefined,
  options?: { skipCapturedInputs?: boolean }
): boolean {
  if (!isAssemblySpecialArgNodeType(nodeType)) return false
  const list = args ?? []
  setLiteralArgValue(giaNode, 0, 0, nodeType, 'int', list.length)
  for (let argIndex = 0; argIndex < list.length; argIndex++) {
    const arg = list[argIndex]
    if (!arg || arg.type === 'conn') continue
    if (options?.skipCapturedInputs && (arg as any).capture === true) continue
    setValueArg(giaNode, argIndex + 1, argIndex, nodeType, arg as ValueArgument)
  }
  return true
}

/**
 * multiple_branches: pin0 = control expression; pin1 = case value list.
 *
 * Capture control (composite input) still needs a typed pin0 schema so compositePins
 * can target InParam 0; only the literal value is omitted when skipCapturedInputs.
 */
export function applyMultipleBranchesSpecialArgs(
  nodeType: string,
  giaNode: any,
  args: Array<Argument | null | undefined> | undefined,
  options?: { skipCapturedInputs?: boolean }
): boolean {
  if (nodeType !== 'multiple_branches') return false
  const list = args ?? []

  const controlArg = list[0]
  if (isValueArg(controlArg)) {
    const isCapture = (controlArg as { capture?: boolean }).capture === true
    if (isCapture && options?.skipCapturedInputs) {
      // Typed empty control pin: schema target for compositePins. Use type-only set so
      // vendor encode keeps pin0 without claiming a real literal default.
      const pin = (giaNode.pins ?? []).find(
        (candidate: any) => candidate.kind === 3 && candidate.index === 0
      )
      if (pin && typeof pin.setType === 'function') {
        pin.setType({ t: 'b', b: controlArg.type === 'str' ? 'Str' : 'Int' })
        // Leave pin.value null so encode uses empty schema body (alreadySetVal=false).
      } else {
        setLiteralArgValue(
          giaNode,
          0,
          0,
          nodeType,
          controlArg.type === 'str' ? 'str' : 'int',
          controlArg.type === 'str' ? '' : 0
        )
      }
    } else {
      setValueArg(giaNode, 0, 0, nodeType, controlArg)
    }
  }

  const caseValues: unknown[] = []
  let caseValueType: string | undefined
  for (let i = 1; i < list.length; i++) {
    const a = list[i]
    if (!a || a.type === 'conn') continue
    if (caseValueType === undefined) caseValueType = a.type
    caseValues.push(a.value)
  }

  if (caseValues.length > 0 && caseValueType) {
    try {
      setLiteralArgValue(giaNode, 1, 1, nodeType, `${caseValueType}_list`, caseValues)
    } catch (e) {
      console.error(
        `[error] failed to set value for pin 1 of node ${nodeType} (id=${(giaNode as any).NodeIndex})\n`
      )
      throw e
    }
  }
  return true
}

/**
 * send_signal / monitor_signal: arg0 is ClientExec string name (not InParam).
 * send_signal data params start at physical InParam 0 (= IR arg 1).
 * monitor_signal may also create OutParam pins for signal parameters via context.
 */
export function applySignalSpecialArgs(
  nodeType: string,
  giaNode: any,
  args: Array<Argument | null | undefined> | undefined,
  context?: SpecialArgApplyContext
): boolean {
  if (!isSignalSpecialArgNodeType(nodeType)) return false

  const list = args ?? []
  const nameArg = list[0]
  if (nameArg && nameArg.type === 'conn') {
    throw new Error(`[error] ${nodeType} does not accept wired signal name`)
  }
  if (nameArg && !isValueArg(nameArg)) {
    throw new Error(`[error] ${nodeType} expects a literal string signal name`)
  }

  giaNode.pins = []

  if (nodeType === 'send_signal') {
    for (let i = 1; i < list.length; i++) {
      const arg = list[i]
      if (!arg) continue
      // Composite impl: signal params wired to composite inputs arrive as capture
      // placeholders ({ capture: true }, no type/value). Physical InParam is owned
      // by compositePins overlay; skip literal apply instead of crashing.
      if ((arg as { capture?: boolean }).capture === true) continue
      if (arg.type === 'conn') {
        const connType = (arg as { value: { type?: string } }).value?.type
        if (!connType) continue
        const concreteId = (giaNode as any).ConcreteId
        const p = new Pin(concreteId, 3, i - 1)
        // Scalar or *_list (e.g. str_list from assemblyList wired into signal param).
        if (connType.endsWith('_list')) {
          const element = connType.slice(0, -5) as ScalarArgType
          if (
            element === 'bool' ||
            element === 'int' ||
            element === 'float' ||
            element === 'str' ||
            element === 'vec3' ||
            element === 'guid' ||
            element === 'entity' ||
            element === 'prefab_id' ||
            element === 'config_id' ||
            element === 'faction'
          ) {
            p.setType({ t: 'l', i: scalarToNodeType(element) })
            giaNode.pins.push(p)
          }
        } else if (
          connType === 'bool' ||
          connType === 'int' ||
          connType === 'float' ||
          connType === 'str' ||
          connType === 'vec3' ||
          connType === 'guid' ||
          connType === 'entity' ||
          connType === 'prefab_id' ||
          connType === 'config_id' ||
          connType === 'faction'
        ) {
          p.setType(scalarToNodeType(connType))
          giaNode.pins.push(p)
        }
      } else if (isValueArg(arg)) {
        setValueArg(giaNode, i - 1, i, nodeType, arg)
      }
    }
  }

  // Real editor samples (001.gia / 多信号2.gia / 修复后样本) always end the pin
  // array with the ClientExec name pin; monitor nodes never carry OutParam pins
  // (parameter outputs come from the CompositeDef declaration and connections
  // reference OutParam kind/index directly).
  if (nameArg) {
    setClientExecLiteralArgValue(giaNode, 0, 0, nodeType, nameArg.type, nameArg.value)
  }
  return true
}

/**
 * Apply special-arg literal / layout for a known special-arg nodeType.
 * Returns true when handled (caller should skip generic arg apply).
 */
export function applySpecialArgLiteralArgs(
  nodeType: string,
  giaNode: any,
  args: Array<Argument | null | undefined> | undefined,
  context?: SpecialArgApplyContext & { skipCapturedInputs?: boolean }
): boolean {
  if (!isSharedSpecialArgAdapterNodeType(nodeType)) return false
  if (isAssemblySpecialArgNodeType(nodeType)) {
    return applyAssemblySpecialArgs(nodeType, giaNode, args, {
      skipCapturedInputs: context?.skipCapturedInputs
    })
  }
  if (nodeType === 'multiple_branches') {
    return applyMultipleBranchesSpecialArgs(nodeType, giaNode, args, {
      skipCapturedInputs: context?.skipCapturedInputs
    })
  }
  if (isSignalSpecialArgNodeType(nodeType)) {
    return applySignalSpecialArgs(nodeType, giaNode, args, context)
  }
  return false
}

/**
 * Type guard helper for tests / inventory: node is in the shared special-arg set.
 */
export function listSharedSpecialArgAdapterNodeTypes(): readonly string[] {
  return SHARED_SPECIAL_ARG_ADAPTER_NODE_TYPES
}
