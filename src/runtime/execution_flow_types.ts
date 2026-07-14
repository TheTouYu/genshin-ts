import type {
  ClientGraphMode,
  ClientGraphSubType,
  NextConnection,
  ServerGraphMode,
  ServerGraphSubType,
  Variable
} from './IR.js'
import type { MetaCallRecord } from './meta_call_types.js'
import type { value } from './value.js'

export type ExecTailEndpoint = {
  nodeId: number
  /**
   * 可选：当该 endpoint 来自某个“多输出执行节点”时，用于指定从哪个执行输出引脚出发
   * 典型场景：分支节点某个分支为空时，join 需要从分支节点的该输出直接连到后续节点
   */
  sourceIndex?: number
}

export type ExecContext = {
  /**
   * 当前执行链的尾端点（用于自动串联 next，支持 join）
   * 考虑到 if / switch 多路分支情况, 因此存在多个尾部, 从而提供 return 语义支持
   * 注册新节点时从这些尾部连接
   */
  tailEndpoints: ExecTailEndpoint[]
  /**
   * 下一次自动串联时，使用源节点的哪一个执行输出引脚（一次性消费）
   *
   * 用于像 Finite Loop 这类有多个执行输出的节点：后续节点应接在 Loop Complete 上
   */
  pendingSourceIndex?: number
  /**
   * 该上下文内注册到的第一条执行节点（用于把整段链挂到某个执行输出上）
   */
  headNodeId?: number
  /**
   * 当前上下文是否调用了 return（用于触发 join 语义）
   */
  terminatedByReturn?: boolean
}

export interface ExecutionFlow {
  eventNode: MetaCallRecord
  eventArgs: value[]
  execNodes: MetaCallRecord[]
  dataNodes: MetaCallRecord[]
  /**
   * 显式记录执行连线（支持分支/多输出）
   */
  edges: Record<number, NextConnection[]>
  /**
   * 执行上下文栈，用于分支（循环体/条件分支等）, 从而确定当前代码属于哪个分支/子链
   */
  execContextStack: ExecContext[]
  /**
   * return gate 局部变量（Get Local Variable 输出的 Local Variable 句柄）
   */
  returnGateLocalVariable?: value
  /**
   * return gate 的当前值（Get Local Variable 输出的 Value）
   */
  returnGateValue?: value
}

export type IRBuildInput = {
  flows: ExecutionFlow[]
  variables: Variable[]
  serverSubType?: ServerGraphSubType
  serverMode?: ServerGraphMode
  clientSubType?: ClientGraphSubType
  clientMode?: ClientGraphMode
  clientEvaluationInterval?: number
  graphId?: number
  graphName?: string
}
