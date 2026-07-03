import type { CompositeDefIR, CompositePinEntry, NextConnection, ParamFlowDef } from './IR.js'
import type { MetaCallRecord } from './meta_call_types.js'
import type { value } from './value.js'

// ============== Constants ==============

const PIN_INDEX_INFLOW_SINGLE = 1974
const PIN_INDEX_INFLOW_MULTI = 6
const PIN_INDEX_OUTFLOW_SINGLE = 4
const PIN_INDEX_OUTFLOW_MULTI_BASE = 8
const PIN_INDEX_INPUT_BASE = 100
const PIN_INDEX_OUTPUT_BASE = 200

// 运行时值类名 → GIA 类型字符串映射
const RUNTIME_TO_GIA_TYPE: Record<string, string> = {
  int: 'int',
  float_number: 'float',
  text: 'string',
  bool: 'bool',
  vec3: 'vec3',
  entity: 'entity',
  guid: 'guid',
  prefabId: 'prefab_id',
  configId: 'config_id',
  faction: 'faction',
}

// ============== Types ==============

export type CompositeParamType = string

export type CompositeParamDef = { type: CompositeParamType }

/**
 * 复合节点实现图捕获结果
 */
export type CompositeCapture = {
  /** 捕获流入口节点 ID（__composite_capture__，作为 impl 图的执行入口） */
  captureNodeId: number
  execNodes: MetaCallRecord[]
  dataNodes: MetaCallRecord[]
  edges: Record<number, NextConnection[]>
  /** build 返回的输出值（含 pin 元数据） */
  outputValues: Record<string, value>
  /** 是否为纯函数（无 exec 节点）—— 用于优化 */
  isPureData: boolean
  /**
   * 多 OutFlow 出口节点 ID 列表（按 outflow index 顺序）。
   * 每个出口节点对应 CompositeDef 的一个 OutFlow。
   * 若为空或 undefined，则使用旧行为（0 或 1 OutFlow）。
   */
  outflowExitNodes?: number[]
  /**
   * 显式标记: outflowIndex → innerNodeId。
   * build 中调用 leaf(outflowIndex) 时记录。
   * 优先级高于 outflowExitNodes 自动检测。
   */
  leafMarks?: Record<number, number>
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
          pinIndex: PIN_INDEX_INPUT_BASE + i
        }))
        const outputList: ParamFlowDef[] = Object.entries(def.outputs).map(([n, pd], i) => ({
          name: n,
          visible: true,
          index: i,
          type: pd.type as any,
          pinIndex: PIN_INDEX_OUTPUT_BASE + i
        }))

        const impl = capture ?? definition.captured

        const hasExec = impl && impl.execNodes.length > 0

        // 计算 compositePins：outer pin → inner node pin 映射
        const pins: CompositePinEntry[] = []
        if (hasExec && impl?.captureNodeId) {
          pins.push({
            outerPinKind: 1, // InFlow
            outerPinIndex: 0,
            innerNodeId: impl.captureNodeId,
            innerPinKind: 1, // InFlow
            innerPinIndex: 0
          })
        }

        // 多 OutFlow：优先用 leafMarks，否则自动检测叶子节点
        if (hasExec && impl) {
          addOutFlowCompositePins(pins, impl)
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
            if (inner.nodeType === '__composite_capture__') continue
            for (let argIdx = 0; argIdx < inner.args.length; argIdx++) {
              const arg = inner.args[argIdx]
              if (!arg) continue
              const inputName = (arg as any).__captureInputName as string | undefined
              if (!inputName) continue
              const inputIdx = inputNameToIndex.get(inputName)
              if (inputIdx === undefined) continue
              // __composite_call__ 的 args[0] 是 compositeId，实际输入从 args[1] 开始
              const callArgOffset = inner.nodeType === '__composite_call__' ? 1 : 0
              pins.push({
                outerPinKind: 3, // InParam
                outerPinIndex: inputIdx,
                innerNodeId: inner.id!,
                innerPinKind: 3, // InParam
                innerPinIndex: argIdx - callArgOffset
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

        const leafMarks = impl?.leafMarks
        const leafCount = leafMarks ? Object.keys(leafMarks).length : 0
        const outflowNodeCount = impl?.outflowExitNodes?.length ?? 0
        const totalOutflows = Math.max(leafCount, outflowNodeCount, hasExec ? 1 : 0)
        const isMultiOutflow = totalOutflows > 1

        return {
          name,
          id,
          type: 'composite',
          inflows: hasExec
            ? [{ name: '', visible: true, index: 0, pinIndex: isMultiOutflow ? PIN_INDEX_INFLOW_MULTI : PIN_INDEX_INFLOW_SINGLE }]
            : [],
          outflows: hasExec
            ? Array.from({ length: totalOutflows }, (_, i) => ({
                name: '', visible: true, index: i,
                pinIndex: isMultiOutflow ? PIN_INDEX_OUTFLOW_MULTI_BASE + i : PIN_INDEX_OUTFLOW_SINGLE
              }))
            : [],
          inputs: inputList,
          outputs: outputList,
          implNodes: [
            ...(impl ? [{
              id: impl.captureNodeId,
              nodeType: '__composite_capture__',
              args: [] as value[]
            }] : []),
            ...(impl?.execNodes ?? []),
            ...(impl?.dataNodes ?? [])
          ].map((r) => ({
            id: r.id,
            type: r.nodeType,
            args: r.args.map((a) => {
              const meta = a.getMetadata()
              if (meta?.kind === 'pin') {
                const typeName = (a as any).constructor?.name ?? ''
                const giaType = RUNTIME_TO_GIA_TYPE[typeName] ?? typeName
                return {
                  type: 'conn' as const,
                  value: {
                    node_id: meta.record.id,
                    index: meta.pinIndex,
                    type: giaType
                  } as any
                }
              }
              return a.toIRLiteral()
            })
          })),
          implEdges: impl?.edges ?? {},
          compositePins: pins,
          implVariables: undefined
        }
      }
    }

    this.definitions.set(name, definition)

    function addOutFlowCompositePins(pins: CompositePinEntry[], impl: CompositeCapture): void {
      const leafMarks = impl.leafMarks
      if (leafMarks) {
        const flowsByNode = new Map<number, number[]>()
        for (const [ofIdxStr, nodeId] of Object.entries(leafMarks)) {
          const list = flowsByNode.get(nodeId) ?? []
          list.push(Number(ofIdxStr))
          flowsByNode.set(nodeId, list)
        }
        for (const [nodeId, outflowIndices] of flowsByNode) {
          outflowIndices.sort((a, b) => a - b)
          outflowIndices.forEach((outerIndex, localIdx) => {
            pins.push({ outerPinKind: 2, outerPinIndex: outerIndex, innerNodeId: nodeId, innerPinKind: 2, innerPinIndex: localIdx })
          })
        }
        return
      }
      const outflowNodes = impl.outflowExitNodes
      if (outflowNodes && outflowNodes.length > 0) {
        for (let i = 0; i < outflowNodes.length; i++) {
          pins.push({ outerPinKind: 2, outerPinIndex: i, innerNodeId: outflowNodes[i], innerPinKind: 2, innerPinIndex: 0 })
        }
        return
      }
      pins.push({ outerPinKind: 2, outerPinIndex: 0, innerNodeId: impl.execNodes[impl.execNodes.length - 1].id, innerPinKind: 2, innerPinIndex: 0 })
    }

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
