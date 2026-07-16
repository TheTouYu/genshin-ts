import {
  CLIENT_F_GLOBAL_NAME_BY_SUB_TYPE,
  CLIENT_GRAPH_SUB_TYPES
} from '../definitions/client_graph_modes.js'
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../shared/client_capability_errors.js'

type ActiveGraphFunctions = Record<string, unknown>

function getRuntime() {
  return (
    globalThis as unknown as {
      gsts?: {
        ctx?: {
          isClientCtx?: () => boolean
          isServerCtx?: () => boolean
          isClientGraphCtx?: (subType: (typeof CLIENT_GRAPH_SUB_TYPES)[number]) => boolean
        }
      } & Record<string, unknown>
    }
  ).gsts
}

export function getActiveGraphFunctions(): ActiveGraphFunctions {
  const runtime = getRuntime()
  if (runtime?.ctx?.isServerCtx?.()) return runtime.f as ActiveGraphFunctions
  for (const subType of CLIENT_GRAPH_SUB_TYPES) {
    if (runtime?.ctx?.isClientGraphCtx?.(subType)) {
      return runtime[CLIENT_F_GLOBAL_NAME_BY_SUB_TYPE[subType]] as ActiveGraphFunctions
    }
  }
  throw new Error('[error] node graph functions are only available in a node graph handler')
}

export function callActiveGraphFunction<T>(helperName: string, method: string, args: unknown[]): T {
  const runtime = getRuntime()
  const fns = getActiveGraphFunctions()
  const fn = fns[method]
  if (typeof fn !== 'function') {
    if (runtime?.ctx?.isClientCtx?.()) {
      throw clientNodegraphError(
        CLIENT_ERROR_CODES.HELPER_UNAVAILABLE,
        `${helperName} requires client method ${method}, which is not available in this graph type`
      )
    }
    throw new Error(`[error] ${helperName}: missing node method ${method}`)
  }
  return fn.apply(fns, args) as T
}
