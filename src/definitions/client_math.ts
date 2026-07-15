import type { ClientGraphSubType } from '../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'
import { CLIENT_GRAPH_SUB_TYPES } from './client_graph_modes.js'
import {
  CLIENT_NODE_METHODS_BY_SUB_TYPE,
  CLIENT_NODE_METHODS_BY_SUB_TYPE_AND_MODE
} from './client_method_modes.js'

/**
 * Shared lowering contract for ESLint and the client TS Transform.
 * Availability is derived from generated client node metadata below.
 */
export const CLIENT_MATH_METHOD_NODE_REQUIREMENTS = {
  abs: ['absoluteValueOperation'],
  sin: ['sineFunction'],
  cos: ['cosineFunction'],
  tan: ['tangentFunction'],
  asin: ['arcsineFunction'],
  acos: ['arccosineFunction'],
  atan: ['arctangentFunction'],
  min: ['assemblyList', 'getMinimumValueFromList'],
  max: ['assemblyList', 'getMaximumValueFromList']
} as const

export type ClientMathMethod = keyof typeof CLIENT_MATH_METHOD_NODE_REQUIREMENTS

export const CLIENT_MATH_METHODS_BY_SUB_TYPE = Object.fromEntries(
  CLIENT_GRAPH_SUB_TYPES.map((subType) => {
    const nodeMethods = new Set<string>(CLIENT_NODE_METHODS_BY_SUB_TYPE[subType])
    const mathMethods = Object.entries(CLIENT_MATH_METHOD_NODE_REQUIREMENTS)
      .filter(([, required]) => required.every((method) => nodeMethods.has(method)))
      .map(([method]) => method as ClientMathMethod)
    return [subType, mathMethods]
  })
) as Record<ClientGraphSubType, ClientMathMethod[]>

export const CLIENT_MATH_METHODS_BY_SUB_TYPE_AND_MODE = Object.fromEntries(
  CLIENT_GRAPH_SUB_TYPES.map((subType) => [
    subType,
    Object.fromEntries(
      (['beyond', 'classic'] as const).map((mode) => {
        const nodeMethods = new Set<string>(CLIENT_NODE_METHODS_BY_SUB_TYPE_AND_MODE[subType][mode])
        const mathMethods = Object.entries(CLIENT_MATH_METHOD_NODE_REQUIREMENTS)
          .filter(([, required]) => required.every((method) => nodeMethods.has(method)))
          .map(([method]) => method as ClientMathMethod)
        return [mode, mathMethods]
      })
    )
  ])
) as Record<ClientGraphSubType, Record<'beyond' | 'classic', ClientMathMethod[]>>
