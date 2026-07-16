import type { Argument } from '../../runtime/IR.js'
import { Node } from '../gia_vendor.js'
import { NodePin_Index_Kind } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import { setEnumArgValue, setLiteralArgValue } from './pins.js'

export type OrdinaryNodeFactoryInput = {
  nodeId: number
  nodeType: string
  args?: Array<Argument | null>
  nodeIndex: number
  mode: 'server' | 'status' | 'class' | 'item' | 'composite'
  concreteNodeId: number
  genericNodeId?: number
  skipCapturedInputs?: boolean
  applyLiterals?: boolean
  inputPinIndex?: (argIndex: number) => number
}

/**
 * Shared ordinary-node factory used by root and vendor-gated composite impl lowering.
 * Synthetic composite nodes and root-only special argument layouts stay outside this factory.
 */
export function createOrdinaryVendorNode(input: OrdinaryNodeFactoryInput): Node<any> {
  const node = new Node<any>(
    input.nodeIndex,
    input.mode,
    input.concreteNodeId as any,
    input.genericNodeId as any
  )
  if (input.applyLiterals !== false) {
    applyOrdinaryLiteralArgs(node, input)
    normalizeOrdinaryVendorPins(node)
  }
  return node
}

export function applyOrdinaryLiteralArgs(
  node: Node<any>,
  input: Omit<OrdinaryNodeFactoryInput, 'concreteNodeId'>
): void {
  // assembly_list / assembly_dictionary: GIA pin0 is element/kv count; IR args start at pin1.
  // Root historically owned this in applySpecialArgs; vendor-gated composite must share it
  // so list elements are not written onto the count pin.
  if (input.nodeType === 'assembly_list' || input.nodeType === 'assembly_dictionary') {
    const args = input.args ?? []
    setLiteralArgValue(node as any, 0, 0, input.nodeType, 'int', args.length)
    for (let argIndex = 0; argIndex < args.length; argIndex++) {
      const arg = args[argIndex]
      if (!arg || arg.type === 'conn' || (input.skipCapturedInputs && (arg as any).capture === true)) {
        continue
      }
      const pinIndex = argIndex + 1
      if (arg.type === 'enum' || arg.type === 'enumeration') {
        setEnumArgValue(node as any, pinIndex, argIndex, input.nodeType, arg.value)
      } else {
        setLiteralArgValue(node as any, pinIndex, argIndex, input.nodeType, arg.type, arg.value)
      }
    }
    return
  }

  for (let argIndex = 0; argIndex < (input.args ?? []).length; argIndex++) {
    const arg = input.args?.[argIndex]
    if (!arg || arg.type === 'conn' || (input.skipCapturedInputs && (arg as any).capture === true)) continue
    const pinIndex = input.inputPinIndex?.(argIndex) ?? argIndex
    const pin = node.pins.find(
      (candidate: any) =>
        candidate.kind === NodePin_Index_Kind.InParam && candidate.index === pinIndex
    )
    if (!pin) {
      throw new Error(`[error] ordinary factory missing ${input.nodeType} InParam[${pinIndex}]`)
    }
    if (arg.type === 'enum' || arg.type === 'enumeration') {
      setEnumArgValue(node as any, pinIndex, argIndex, input.nodeType, arg.value)
    } else {
      setLiteralArgValue(node as any, pinIndex, argIndex, input.nodeType, arg.type, arg.value)
    }
  }
}

export function normalizeOrdinaryVendorPins(node: Node<any>): void {
  node.pins = node.pins.filter(
    (pin: any) =>
      !((pin.kind === NodePin_Index_Kind.InParam || pin.kind === NodePin_Index_Kind.OutParam) &&
        pin.type?.t === 'b' && pin.type?.b === 'Unk')
  )
}
