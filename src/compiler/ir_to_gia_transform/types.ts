import type { ClientIRDocument, IRDocument } from '../../runtime/IR.js'

export type Position = [number, number]
export type NodeId = number
export type IRNode = NonNullable<IRDocument['nodes']>[number]
/** 客户端 IR 节点（比 IRNode 多 clientHints）；客户端变换入口收到的是 ClientIRDocument */
export type ClientIRNode = NonNullable<ClientIRDocument['nodes']>[number]
