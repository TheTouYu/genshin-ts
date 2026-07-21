import { CLIENT_NODE_METHODS_BY_SUB_TYPE } from '../../definitions/client_method_modes.js'

const CLIENT_METHOD_SETS = new Map(
  Object.entries(CLIENT_NODE_METHODS_BY_SUB_TYPE).map(([subType, methods]) => [
    subType,
    new Set<string>(methods as readonly string[])
  ])
)

const CLIENT_SUB_TYPES_WITH_LOCAL_VARIABLES = new Set(
  Object.entries(CLIENT_NODE_METHODS_BY_SUB_TYPE)
    .filter(([, methods]) => {
      const names = methods as readonly string[]
      return names.includes('getLocalVariable') && names.includes('setLocalVariable')
    })
    .map(([subType]) => subType)
)

export function clientSubTypeSupportsLocalVariables(subType: string): boolean {
  return CLIENT_SUB_TYPES_WITH_LOCAL_VARIABLES.has(subType)
}

/** Keep synthetic compiler-method availability aligned with ts_to_gs_transform/utils.ts. */
export function clientSubTypeSupportsMethod(subType: string, method: string): boolean {
  const methods = CLIENT_METHOD_SETS.get(subType)
  if (!methods) return false
  if (method === 'initLocalVariable' || method === '__gstsInitLocalVariable') {
    return methods.has('getLocalVariable') && methods.has('setLocalVariable')
  }
  if (method === 'emptyLocalVariableList') {
    return methods.has('getLocalVariable') && methods.has('setLocalVariable')
  }
  if (method === 'listIterationLoop') {
    return (
      methods.has('finiteLoop') &&
      methods.has('getListLength') &&
      methods.has('getCorrespondingValueFromList') &&
      methods.has('subtraction')
    )
  }
  if (method === 'continue') return methods.has('finiteLoop')
  if (method === 'emptyList' || method === 'copyList' || method === 'return') return true
  return methods.has(method)
}

export function getMissingClientMethods(subType: string, methods: readonly string[]): string[] {
  return [...new Set(methods)].filter((method) => !clientSubTypeSupportsMethod(subType, method))
}
