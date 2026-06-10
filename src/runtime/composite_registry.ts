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
          // exec flow: outer OutFlow(2,0) → 最后一个 exec node 的 OutFlow(2,0)
          pins.push({
            outerPinKind: 2, // OutFlow
            outerPinIndex: 0,
            innerNodeId: impl!.execNodes[impl!.execNodes.length - 1].id,
            innerPinKind: 2, // OutFlow
            innerPinIndex: 0
          })
        }
        // 输入参数 data pin 映射：扫描内部节点 arg，匹配 __captureInputName
        // 同一输入可在多处消费（如 addition(input,input)），每个消费点一条 compositePin
        if (inputList.length > 0 && impl) {
          const inputNameToIndex = new Map<string, number>()
          for (let i = 0; i < inputList.length; i++) {
            inputNameToIndex.set(inputList[i].name, i)
          }
          const allInner: MetaCallRecord[] = [
            ...(impl.execNodes ?? []),
            ...(impl.dataNodes ?? [])
          ]
          for (const inner of allInner) {
            if (inner.nodeType === '__composite_capture__' || inner.nodeType === '__composite_call__') continue
            for (let argIdx = 0; argIdx < inner.args.length; argIdx++) {
              const arg = inner.args[argIdx]
              if (!arg) continue
              const inputName = (arg as any).__captureInputName as string | undefined
              if (!inputName) continue
              const inputIdx = inputNameToIndex.get(inputName)
              if (inputIdx === undefined) continue
              pins.push({
                outerPinKind: 3, // InParam
                outerPinIndex: inputIdx,
                innerNodeId: inner.id!,
                innerPinKind: 3, // InParam
                innerPinIndex: argIdx
              })
            }
          }
        }
        // 输出参数 data pin 映射：复合 OutParam → 产生该输出的 impl node 的 OutParam
        if (outputList.length > 0 && impl) {
          for (let i = 0; i < outputList.length; i++) {
            const outputValue = impl.outputValues[outputList[i].name]
            if (!outputValue) continue
            const meta = outputValue.getMetadata()
            if (meta && meta.kind === 'pin') {
              pins.push({
                outerPinKind: 4, // OutParam
                outerPinIndex: i,
                innerNodeId: meta.record.id,
                innerPinKind: 4, // OutParam
                innerPinIndex: meta.pinIndex
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
          outflows: hasExec
            ? [{ name: '', visible: true, index: 0, pinIndex: 4 }]
            : [],
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
