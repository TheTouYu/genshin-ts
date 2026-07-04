export const CLIENT_ERROR_CODES = {
  MODE_UNAVAILABLE: 'CLIENT_MODE_UNAVAILABLE',
  NODE_UNAVAILABLE: 'CLIENT_NODE_UNAVAILABLE',
  NODE_SYNTAX_UNAVAILABLE: 'CLIENT_NODE_SYNTAX_UNAVAILABLE',
  FILTER_RETURN_REQUIRED: 'CLIENT_FILTER_RETURN_REQUIRED',
  FILTER_RETURN_TYPE: 'CLIENT_FILTER_RETURN_TYPE',
  FILTER_RETURN_RANGE: 'CLIENT_FILTER_RETURN_RANGE',
  UNSUPPORTED_SPECIAL_NODE: 'CLIENT_UNSUPPORTED_SPECIAL_NODE',
  VALUE_TYPE_UNAVAILABLE: 'CLIENT_VALUE_TYPE_UNAVAILABLE',
  HELPER_UNAVAILABLE: 'CLIENT_HELPER_UNAVAILABLE'
} as const

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[keyof typeof CLIENT_ERROR_CODES]

export class ClientNodegraphError extends Error {
  readonly code: ClientErrorCode

  constructor(code: ClientErrorCode, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'ClientNodegraphError'
    this.code = code
  }
}

export function clientNodegraphError(code: ClientErrorCode, message: string): ClientNodegraphError {
  return new ClientNodegraphError(code, message)
}
