import type { ClientIRDocument } from '../../runtime/IR.js'

export type Position = [number, number]
export type NodeId = number
export type IRNode = NonNullable<ClientIRDocument['nodes']>[number]
