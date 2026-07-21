export type LangOption = 'zh' | 'en' | 'both'
export type ScopeOption = 'server' | 'client' | 'nodegraph' | 'all'

export type BaseOptions = {
  lang?: LangOption
  scope?: ScopeOption
  includeNestedFunctions?: boolean
}

export function readBaseOptions<T extends BaseOptions>(
  raw: Partial<T> | undefined,
  defaults: Required<T>
): Required<T> {
  return {
    ...defaults,
    ...(raw ?? {})
  } as Required<T>
}
