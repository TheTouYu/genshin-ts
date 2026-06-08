import type { CompositeDefIR, CompositePinEntry, NextConnection, ParamFlowDef } from './IR.js'
import type { MetaCallRecord } from './meta_call_types.js'
import type { value } from './value.js'

// ============== Types ==============

export type CompositeParamType = string

export type CompositeParamDef = { type: CompositeParamType }

/**
 * 复合节点实现图捕获结果
 */
export type CompositeCapture = {
  execNodes: MetaCallRecord[]
  dataNodes: MetaCallRecord[]
  edges: Record<number, NextConnection[]>
  /** build 返回的输出值（含 pin 元数据） */
  outputValues: Record<string, value>
  /** 是否为纯函数（无 exec 节点）—— 用于优化 */
  isPureData: boolean
}

/**
 * 复合节点定义（存储类型声明 + build 回调 + 捕获结果）
 */
export type CompositeDefinition = {
  readonly name: string
  readonly id: number
  readonly inputs: Record<string, CompositeParamDef>
  readonly outputs: Record<string, CompositeParamDef>
  readonly build: (...args: any[]) => any
  /** 捕获后的内部节点和连线 */
  captured: CompositeCapture | null
  /**
   * 将定义转换为 IR。
   * implFlows: 可选，由外部传入的实现图执行流
   */
  toCompositeDefIR(implFlows?: CompositeCapture): CompositeDefIR
}

/**
 * 复合节点句柄
 */
export type CompositeHandle = {
  readonly __composite: true
  readonly name: string
  readonly id: number
  readonly definition: CompositeDefinition
}

// ============== CompositeRegistry ==============

let nextCompositeId = 1610700000

export class CompositeRegistry {
  private definitions = new Map<string, CompositeDefinition>()

  define(
    name: string,
    def: {
      inputs: Record<string, CompositeParamDef>
      outputs: Record<string, CompositeParamDef>
      build: (...args: any[]) => any
    }
  ): CompositeHandle {
    if (this.definitions.has(name)) {
      throw new Error(`[error] composite "${name}" already defined`)
    }

    const id = nextCompositeId++

    const definition: CompositeDefinition = {
      name,
      id,
      inputs: def.inputs,
      outputs: def.outputs,
      build: def.build,
      captured: null,
      toCompositeDefIR: (capture?: CompositeCapture): CompositeDefIR => {
        const inputList: ParamFlowDef[] = Object.entries(def.inputs).map(([n, pd], i) => ({
          name: n,
          visible: true,
          index: i,
          type: pd.type as any,
          pinIndex: 100 + i
        }))
        const outputList: ParamFlowDef[] = Object.entries(def.outputs).map(([n, pd], i) => ({
          name: n,
          visible: true,
          index: i,
          type: pd.type as any,
          pinIndex: 200 + i
        }))

        const impl = capture ?? definition.captured

        const hasExec = impl && impl.execNodes.length > 0

        // 计算 compositePins：outer pin → inner node pin 映射
        const pins: CompositePinEntry[] = []
        if (hasExec) {
          // exec flow: outer InFlow(1,0) → 第一个 exec node 的 InFlow(1,0)
          pins.push({
            outerPinKind: 1, // InFlow
            outerPinIndex: 0,
            innerNodeId: impl!.execNodes[0].id,
            innerPinKind: 1, // InFlow
            innerPinIndex: 0
          })
        }
        // 输入参数 data pin 映射（exec 复合也需要，因为入口参数从 exec node 消费）
        if (inputList.length > 0) {
          const collectInnerRecords = (): MetaCallRecord[] => [
            ...(impl?.execNodes ?? []),
            ...(impl?.dataNodes ?? [])
          ]
          const allInner = collectInnerRecords()
          for (let i = 0; i < inputList.length; i++) {
            // 找第一个有 args 的内部节点来承载此输入（启发式：跳过 event 节点）
            const target = allInner.find(
              (r) => r.nodeType !== '__composite_capture__' && r.nodeType !== '__composite_call__'
            )
            if (target) {
              pins.push({
                outerPinKind: 3, // InParam
                outerPinIndex: i,
                innerNodeId: target.id,
                innerPinKind: 3, // InParam
                innerPinIndex: 0
              })
            }
          }
        }

        return {
          name,
          id,
          type: 'composite',
          inflows: hasExec
            ? [{ name: '', visible: true, index: 0, pinIndex: 1974 }]
            : [],
          outflows: [],
          inputs: inputList,
          outputs: outputList,
          implNodes: [
            ...(impl?.execNodes ?? []),
            ...(impl?.dataNodes ?? [])
          ].map((r) => ({
            id: r.id,
            type: r.nodeType,
            args: r.args.map((a) => a.toIRLiteral())
          })),
          implEdges: impl?.edges ?? {},
          compositePins: pins,
          implVariables: undefined
        }
      }
    }

    this.definitions.set(name, definition)

    const handle: CompositeHandle = {
      __composite: true,
      name,
      id,
      definition
    }

    return handle
  }

  get(name: string): CompositeDefinition | undefined {
    return this.definitions.get(name)
  }

  getById(id: number): CompositeDefinition | undefined {
    for (const def of this.definitions.values()) {
      if (def.id === id) return def
    }
    return undefined
  }

  getAll(): CompositeDefinition[] {
    return [...this.definitions.values()]
  }

  has(name: string): boolean {
    return this.definitions.has(name)
  }
}

/** 全局单例 */
export const compositeRegistry = new CompositeRegistry()
