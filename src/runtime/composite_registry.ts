// @ts-nocheck thirdparty

import type { DiagnosticProvenance } from '../diagnostics.js'
import type {
  CompositeDefIR,
  CompositePinEntry,
  LiteralValueType,
  NextConnection,
  ParamFlowDef
} from './IR.js'
import type { MetaCallRecord } from './meta_call_types.js'
import {
  list,
  type generic,
  type RuntimeParameterValueTypeMap,
  type RuntimeValueTypeMap,
  type value
} from './value.js'
import { parseVariableDefinitions } from './variables.js'

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
  faction: 'faction'
}

// ============== Types ==============

export type CompositeParamType = keyof RuntimeValueTypeMap

export type CompositeParamDef = { type: CompositeParamType; pinIndex?: number }
export type CompositeInputDefinitions = Record<string, CompositeParamDef>
export type CompositeInputValues<Inputs extends CompositeInputDefinitions> = {
  [K in keyof Inputs]: RuntimeValueTypeMap[Inputs[K]['type']]
}
export type CompositeCallInputValues<
  Inputs extends CompositeInputDefinitions,
  Provided extends Record<string, unknown>
> = Provided & {
  [K in keyof Provided]: K extends keyof Inputs
    ? Provided[K] extends RuntimeParameterValueTypeMap[Inputs[K]['type']]
      ? Provided[K]
      : Provided[K] extends generic
        ? Provided[K]
        : value extends Provided[K]
          ? Provided[K]
          : never
    : never
}
export type CompositeFlowDef = { name: string; pinIndex?: number }

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
   * 显式 OutFlow 出口标记。
   * build 中调用 f.outflow(name, ref, pinIndex) 时按调用顺序记录。
   */
  outflowMarks?: Array<{ name: string; innerNodeId: number; outflowPinIndex: number }>
  /**
   * 显式 InFlow 入口标记。
   * build 中调用 f.inflow(name, ref, pinIndex) 时按调用顺序记录。
   */
  inflowMarks?: Array<{ name: string; innerNodeId: number; inflowPinIndex: number }>
}

/**
 * 复合节点定义（存储类型声明 + build 回调 + 捕获结果）
 */
export type CompositeDefinition = {
  readonly name: string
  readonly id: number
  readonly inputs: Record<string, CompositeParamDef>
  readonly outputs: Record<string, CompositeParamDef>
  readonly variables?: Variable[]
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
export type CompositeHandle<
  Outputs extends Record<string, { type: LiteralValueType }> = Record<
    string,
    { type: LiteralValueType }
  >,
  Inputs extends CompositeInputDefinitions = CompositeInputDefinitions
> = {
  readonly __composite: true
  readonly name: string
  readonly id: number
  readonly definition: CompositeDefinition & { readonly outputs: Outputs }
  readonly __outputs: Outputs
  readonly __inputs: Inputs
}

// ============== CompositeRegistry ==============

let nextCompositeId = 1610700000

export class CompositeRegistry {
  private definitions = new Map<string, CompositeDefinition>()

  define(
    name: string,
    def: {
      inputs?: Record<string, CompositeParamDef>
      outputs?: Record<string, CompositeParamDef>
      inflows?: Array<string | CompositeFlowDef>
      outflows?: Array<string | CompositeFlowDef>
      variables?: Record<string, unknown>
      build: (...args: any[]) => any
      provenance?: DiagnosticProvenance
    }
  ): CompositeHandle {
    if (this.definitions.has(name)) {
      throw new Error(`[error] composite "${name}" already defined`)
    }

    const id = nextCompositeId++

    const parsedVars = def.variables ? parseVariableDefinitions(def.variables) : undefined
    const definition: CompositeDefinition = {
      name,
      id,
      variables: parsedVars?.variables,
      inputs: def.inputs ?? {},
      outputs: def.outputs ?? {},
      build: def.provenance
        ? (...args: any[]) =>
            globalThis.gsts.ctx.withDiagnosticProvenance(def.provenance!, () => def.build(...args))
        : def.build,
      captured: null,
      toCompositeDefIR: (capture?: CompositeCapture): CompositeDefIR => {
        const inputList: ParamFlowDef[] = Object.entries(def.inputs ?? {}).map(([n, pd], i) => ({
          name: n,
          visible: true,
          index: i,
          type: pd.type as any,
          pinIndex: pd.pinIndex ?? PIN_INDEX_INPUT_BASE + i
        }))
        const outputList: ParamFlowDef[] = Object.entries(def.outputs ?? {}).map(([n, pd], i) => ({
          name: n,
          visible: true,
          index: i,
          type: pd.type as any,
          pinIndex: pd.pinIndex ?? PIN_INDEX_OUTPUT_BASE + i
        }))

        const impl = capture ?? definition.captured

        const hasExec = impl && impl.execNodes.length > 0

        const explicitInflowDefs = normalizeFlowDefs(def.inflows ?? [])
        const explicitOutflowDefs = normalizeFlowDefs(def.outflows ?? [])
        const inflowMarks = impl?.inflowMarks ?? []

        // 计算 compositePins：outer pin → inner node pin 映射
        const pins: CompositePinEntry[] = []
        if (hasExec && inflowMarks.length > 0) {
          inflowMarks.forEach((m, outerIndex) => {
            pins.push({
              outerPinKind: 1, // InFlow
              outerPinIndex: outerIndex,
              innerNodeId: m.innerNodeId,
              innerPinKind: 1, // InFlow
              innerPinIndex: m.inflowPinIndex
            })
          })
        } else if (
          hasExec &&
          impl?.captureNodeId &&
          !isPureEventComposite(
            impl,
            inflowMarks,
            (impl?.outflowMarks ?? []) as Array<{ name: string; innerNodeId: number; outflowPinIndex: number }>,
            explicitInflowDefs
          )
        ) {
          // 纯事件复合（如 gsts_orbit_trigger：无 outflow、无调用流入口，impl 含
          // when_* 事件节点）以事件为执行入口，capture 节点无物理 InFlow——不生成
          // 调用流 InFlow 路由（2026-08-14 v20 架构）。
          // 注意：混合复合（调用流 + 事件节点，如 gsts_orbit_segment：有 done outflow、
          // 被调用流消费）必须有调用流 InFlow——2026-08-14 v20 回归实证：误判为事件
          // 复合 → InFlow 路由被砍 → 注入后 MB 分支→复合调用的 exec 边无接口对应被丢。
          const captureEdges = impl.edges[impl.captureNodeId] ?? []
          if (captureEdges.length > 0) {
            for (const edge of captureEdges) {
              pins.push({
                outerPinKind: 1, // InFlow
                outerPinIndex: 0,
                innerNodeId: getEdgeTarget(edge),
                innerPinKind: 1, // InFlow
                innerPinIndex: getEdgeTargetIndex(edge)
              })
            }
          } else {
            pins.push({
              outerPinKind: 1, // InFlow
              outerPinIndex: 0,
              innerNodeId: impl.captureNodeId,
              innerPinKind: 1, // InFlow
              innerPinIndex: 0
            })
          }
        }

        // 多 OutFlow：仅由显式 f.outflow(...) 标记生成
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
          const allInner: MetaCallRecord[] = [...(impl.execNodes ?? []), ...(impl.dataNodes ?? [])]
          for (const inner of allInner) {
            if (inner.nodeType === '__composite_capture__') continue
            for (let argIdx = 0; argIdx < inner.args.length; argIdx++) {
              const arg = inner.args[argIdx]
              if (!arg) continue
              const inputName = (arg as any).__captureInputName as string | undefined
              if (inputName === undefined) continue
              const inputIdx = inputNameToIndex.get(inputName)
              if (inputIdx === undefined) continue
              // __composite_call__ 的 args[0] 是 compositeId，实际输入从 args[1] 开始。
              // 稀疏命名输入（例如只传第二个输入）优先使用 call 记录的声明 index。
              const callArgOffset = inner.nodeType === '__composite_call__' ? 1 : 0
              const compositeInputIndex = inner.compositeInputIndices?.[argIdx]
              // assembly_list 在 GIA 编码时 count pin 插在 index 0，arg pin 偏移 +1
              const assemblyListOffset = inner.nodeType === 'assembly_list' ? 1 : 0
              pins.push({
                outerPinKind: 3, // InParam
                outerPinIndex: inputIdx,
                innerNodeId: inner.id!,
                innerPinKind: 3, // InParam
                innerPinIndex: compositeInputIndex ?? argIdx - callArgOffset + assemblyListOffset
              })
            }
          }
        }
        // 输出参数 data pin 映射：复合 OutParam → 产生该输出的 impl node 的 OutParam
        if (outputList.length > 0 && impl) {
          for (let i = 0; i < outputList.length; i++) {
            const outputValue = impl.outputValues[outputList[i].name]
            if (!outputValue) continue
            const meta = outputValue?.getMetadata?.()
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

        const outflowMarks = impl?.outflowMarks ?? []
        const totalInflows = inflowMarks.length > 0 ? inflowMarks.length : hasExec ? 1 : 0
        const totalOutflows = outflowMarks.length
        const isMultiInflow = totalInflows > 1
        const isMultiOutflow = totalOutflows > 1

        const isEventComposite = impl
          ? isPureEventComposite(
              impl,
              inflowMarks,
              (impl?.outflowMarks ?? []) as Array<{ name: string; innerNodeId: number; outflowPinIndex: number }>,
              explicitInflowDefs
            )
          : false

        return {
          name,
          id,
          type: 'composite',
          inflows: isEventComposite
            ? []
            : hasExec
            ? inflowMarks.length > 0
              ? inflowMarks.map((m, i) => ({
                  name: explicitInflowDefs[i]?.name ?? m.name,
                  visible: true,
                  index: i,
                  pinIndex:
                    explicitInflowDefs[i]?.pinIndex ??
                    (isMultiInflow ? PIN_INDEX_INFLOW_MULTI + i : PIN_INDEX_INFLOW_SINGLE)
                }))
              : [
                  {
                    name: explicitInflowDefs[0]?.name ?? '',
                    visible: true,
                    index: 0,
                    pinIndex:
                      explicitInflowDefs[0]?.pinIndex ??
                      (isMultiOutflow ? PIN_INDEX_INFLOW_MULTI : PIN_INDEX_INFLOW_SINGLE)
                  }
                ]
            : [],
          outflows: hasExec
            ? outflowMarks.map((m, i) => ({
                name: explicitOutflowDefs[i]?.name ?? m.name,
                visible: true,
                index: i,
                pinIndex:
                  explicitOutflowDefs[i]?.pinIndex ??
                  (isMultiOutflow ? PIN_INDEX_OUTFLOW_MULTI_BASE + i : PIN_INDEX_OUTFLOW_SINGLE)
              }))
            : [],
          inputs: inputList,
          outputs: outputList,
          implNodes: [
            ...(impl
              ? [
                  {
                    id: impl.captureNodeId,
                    nodeType: '__composite_capture__',
                    args: [] as value[]
                  }
                ]
              : []),
            ...(impl?.execNodes ?? []),
            ...(impl?.dataNodes ?? [])
          ].map((r) => ({
            id: r.id,
            type: r.nodeType,
            args: (Array.isArray(r.args) ? r.args : []).map((a, argIndex) => {
              const compositeInputIndex = r.compositeInputIndices?.[argIndex]
              const withCompositeInputIndex = <T extends Record<string, unknown>>(arg: T): T => {
                if (compositeInputIndex === undefined) return arg
                return { ...arg, compositeInputIndex }
              }
              // 防御（2026-08-14 系列）：null/undefined 参数保留 null 占位；非 value 不崩溃
              if (a === null || a === undefined) {
                return withCompositeInputIndex(null as unknown as Record<string, unknown>)
              }
              const meta = a?.getMetadata?.()
              const isCaptureInput = (a as any).__captureInputName !== undefined
              if (meta?.kind === 'pin') {
                let giaType: string
                const typeName = (a as any).constructor?.name ?? ''
                if (typeName === 'list') {
                  const concreteType = (a as list).getConcreteType()
                  giaType = concreteType ? `${concreteType}_list` : 'list'
                } else {
                  giaType = RUNTIME_TO_GIA_TYPE[typeName] ?? typeName
                }
                // #4 配套：dict 连接补 k/v 子字段（与 ir_builder.buildConnectionArgument 同构），
                // 否则复合内 dict 类型节点（get/set 图变量、set_or_add 等）无法选 kv 变体
                let dictInfo: { k: string; v: string } | undefined
                if (giaType === 'dict') {
                  const getKey =
                    typeName === 'dict'
                      ? (a as any).getKeyType?.()
                      : (a as any).getDictKeyType?.()
                  const getVal =
                    typeName === 'dict'
                      ? (a as any).getValueType?.()
                      : (a as any).getDictValueType?.()
                  if (getKey && getVal) dictInfo = { k: getKey, v: getVal }
                }
                return withCompositeInputIndex({
                  type: 'conn' as const,
                  value: {
                    node_id: meta.record.id,
                    index: meta.pinIndex,
                    type: giaType,
                    ...(dictInfo ? { dict: dictInfo } : {})
                  } as any,
                  ...(isCaptureInput ? { capture: true as const } : {})
                })
              }
              // 防御（2026-08-14 系列 #8）：toIRLiteral 返回 null（如 list 基类）时保留 null
              // 占位，避免 {...null} 展开成 {} 导致下游 argVarType(undefined) 崩溃
              const literal = a.toIRLiteral()
              if (literal === null) {
                // 2026-08-14 修复（#16 启动失败根因，轮 13 差分确认）：capture 输入（复合输入
                // 引用）是未赋值占位值，toIRLiteral 返回 null——按 null 占位序列化会丢 capture
                // 标记，下游 classify 当 missing → 子复合调用参数丢失（orbit_point c/s NaN）。
                // 编辑器规则（after 轮13）：复合输入→子复合调用参数 = compositePins 路由，
                // 调用点物理 pin 不落盘——capture 占位必须保留 capture: true + 类型。
                if (isCaptureInput) {
                  const typeName = (a as any).constructor?.name ?? ''
                  const giaType = RUNTIME_TO_GIA_TYPE[typeName] ?? (typeName || 'generic')
                  return withCompositeInputIndex({
                    type: giaType as const,
                    value: null,
                    capture: true as const
                  })
                }
                return withCompositeInputIndex(null as unknown as Record<string, unknown>)
              }
              return withCompositeInputIndex({
                ...literal,
                ...(isCaptureInput ? { capture: true as const } : {})
              })
            })
          })),
          implEdges: impl?.edges ?? {},
          compositePins: pins,
          implVariables: definition.variables
        }
      }
    }

    this.definitions.set(name, definition)

    // 事件复合判定：impl exec 链含 when_* 事件节点（f.on 注册的复合内事件入口）
    function hasCompositeEventNode(impl: CompositeCapture): boolean {
      return (impl.execNodes ?? []).some((n) => n.nodeType.startsWith('when_'))
    }
    // 纯事件复合判定（v20 回归修正）：有事件节点 + 无 outflow 标记 + 无显式 inflow 声明。
    // 混合复合（orbit_segment：whenCustomVariableChanges 事件 + done outflow + 调用流）
    // 不算纯事件复合——它需要调用流 InFlow 入口。
    function isPureEventComposite(
      impl: CompositeCapture,
      inflowMarks: Array<{ name: string; innerNodeId: number; inflowPinIndex: number }>,
      outflowMarks: Array<{ name: string; innerNodeId: number; outflowPinIndex: number }>,
      explicitInflowDefs: CompositeFlowDef[]
    ): boolean {
      if (!hasCompositeEventNode(impl)) return false
      if (outflowMarks.length > 0) return false
      if (explicitInflowDefs.length > 0) return false
      return true
    }

    function normalizeFlowDefs(defs: Array<string | CompositeFlowDef>): CompositeFlowDef[] {
      return defs.map((def) => (typeof def === 'string' ? { name: def } : def))
    }

    function getEdgeTarget(edge: NextConnection): number {
      return typeof edge === 'number' ? edge : edge.node_id
    }

    function getEdgeTargetIndex(edge: NextConnection): number {
      return typeof edge === 'number' ? 0 : (edge.target_index ?? 0)
    }

    function addOutFlowCompositePins(pins: CompositePinEntry[], impl: CompositeCapture): void {
      const marks = impl.outflowMarks
      if (!marks || marks.length === 0) return
      marks.forEach((m, outerIndex) => {
        pins.push({
          outerPinKind: 2,
          outerPinIndex: outerIndex,
          innerNodeId: m.innerNodeId,
          innerPinKind: 2,
          innerPinIndex: m.outflowPinIndex
        })
      })
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
