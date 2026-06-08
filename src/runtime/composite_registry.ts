import type { CompositeDefIR, ParamFlowDef } from './IR.js'
import type { MetaCallRecord } from './meta_call_types.js'
import type { value } from './value.js'

// ============== Types ==============

export type CompositeParamType = string

export type CompositeParamDef = { type: CompositeParamType }

/**
 * 复合节点定义（存储类型声明 + build 回调）
 */
export type CompositeDefinition = {
  readonly name: string
  readonly id: number
  readonly inputs: Record<string, CompositeParamDef>
  readonly outputs: Record<string, CompositeParamDef>
  readonly build: (...args: any[]) => any
  /**
   * 将定义转换为 IR。
   * implFlows: 可选，由外部传入的实现图执行流（在 IR 构建阶段从 MetaCallRegistry 提取）
   */
  toCompositeDefIR(implFlows?: CompositeImplIR): CompositeDefIR
}

/**
 * 复合节点实现图 IR（由 MetaCallRegistry 在 IR 构建阶段产生）
 */
export type CompositeImplIR = {
  nodes: { id: number; type: string; args: any[] }[]
  edges: Record<number, any>
  variables?: any[]
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
      toCompositeDefIR: (impl?: CompositeImplIR): CompositeDefIR => {
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

        return {
          name,
          id,
          type: 'composite',
          inflows: [],
          outflows: [],
          inputs: inputList,
          outputs: outputList,
          implNodes: impl?.nodes ?? [],
          implEdges: impl?.edges ?? {},
          compositePins: [],
          implVariables: impl?.variables
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
