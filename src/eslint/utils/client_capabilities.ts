import { CLIENT_NODE_METHODS_BY_SUB_TYPE } from '../../definitions/client_method_modes.js'

const CLIENT_SUB_TYPES_WITH_LOCAL_VARIABLES = new Set(
  Object.entries(CLIENT_NODE_METHODS_BY_SUB_TYPE)
    .filter(([, methods]) => {
      const names: readonly string[] = methods
      return names.includes('getLocalVariable') && names.includes('setLocalVariable')
    })
    .map(([subType]) => subType)
)

export function clientSubTypeSupportsLocalVariables(subType: string): boolean {
  return CLIENT_SUB_TYPES_WITH_LOCAL_VARIABLES.has(subType)
}
