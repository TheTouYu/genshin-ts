export type ClientGraphSubType =
  | 'character_skill'
  | 'creation_skill'
  | 'creation_status'
  | 'creation_status_decision'
  | 'bool_filter'
  | 'int_filter'

export type ClientSpecialKind =
  | 'start'
  | 'signal'
  | 'structure'
  | 'structure_list'
  | 'local_variable'
  | 'dict'
  | 'reflect'
  | 'multiple_branches'
  | 'inline_var_type_hint'
  | 'structure_list_unknown_binding'

export type ClientPinMetadata = {
  index: number
  kind: 'input' | 'output' | 'in_flow' | 'out_flow' | 'client_exec' | 'client_signal'
  type: string
  reflective?: boolean
  indexOfConcrete?: number
  clientVarType?: number
}

export type ClientNodeMetadata = {
  subType: ClientGraphSubType
  nodeType: string
  displayName: string
  graphType: number
  genericId: number
  concreteId: number | string
  inputs: ClientPinMetadata[]
  outputs: ClientPinMetadata[]
  flows?: ClientPinMetadata[]
  reflectMap?: Array<{
    concreteId: number | string
    variantKey: string
    pins?: ClientPinMetadata[]
  }>
  pinFlags?: string[]
  specialKind?: ClientSpecialKind
  isStart?: boolean
  isSignal?: boolean
  isStructure?: boolean
  isLocalVariable?: boolean
  isDict?: boolean
  sampleFile: string
}

export const CLIENT_NODE_METADATA: readonly ClientNodeMetadata[] = []
