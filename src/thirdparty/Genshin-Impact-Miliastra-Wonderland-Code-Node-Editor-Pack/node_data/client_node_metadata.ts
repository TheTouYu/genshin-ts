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

export const CLIENT_NODE_METADATA: readonly ClientNodeMetadata[] = [
  {
    subType: 'bool_filter',
    nodeType: 'node_graph_end_boolean',
    displayName: 'node_graph_end_boolean',
    graphType: 20001,
    genericId: 200000,
    concreteId: 0,
    inputs: [
      {
        index: 0,
        kind: 'input',
        type: 'bool',
        clientVarType: 5
      },
      {
        index: 1,
        kind: 'input',
        type: 'enum',
        clientVarType: 13
      }
    ],
    outputs: [],
    sampleFile: '布尔过滤器节点\\三维向量内积_填值.gia'
  },
  {
    subType: 'character_skill',
    nodeType: 'node_graph_begins',
    displayName: 'node_graph_begins',
    graphType: 20002,
    genericId: 200042,
    concreteId: 2001,
    inputs: [],
    outputs: [],
    specialKind: 'start',
    isStart: true,
    sampleFile: '角色技能节点图\\三维向量内积_连线.gia'
  },
  {
    subType: 'creation_skill',
    nodeType: 'node_graph_begins',
    displayName: 'node_graph_begins',
    graphType: 20002,
    genericId: 200042,
    concreteId: 2001,
    inputs: [],
    outputs: [],
    specialKind: 'start',
    isStart: true,
    sampleFile: '造物技能节点图\\三维向量内积_连线.gia'
  },
  {
    subType: 'creation_status',
    nodeType: 'node_graph_begins',
    displayName: 'node_graph_begins',
    graphType: 20007,
    genericId: 200126,
    concreteId: 4000,
    inputs: [],
    outputs: [],
    flows: [
      {
        index: 0,
        kind: 'out_flow',
        type: 'flow',
        clientVarType: 0
      }
    ],
    specialKind: 'start',
    isStart: true,
    sampleFile: '造物状态节点图\\最小图_单节点.gia'
  },
  {
    subType: 'creation_status_decision',
    nodeType: 'node_graph_begins',
    displayName: 'node_graph_begins',
    graphType: 20007,
    genericId: 200126,
    concreteId: 4000,
    inputs: [],
    outputs: [],
    flows: [
      {
        index: 0,
        kind: 'out_flow',
        type: 'flow',
        clientVarType: 0
      }
    ],
    specialKind: 'start',
    isStart: true,
    sampleFile: '造物状态决策节点图\\最小图_单节点.gia'
  },
  {
    subType: 'int_filter',
    nodeType: 'node_graph_end_integer',
    displayName: 'node_graph_end_integer',
    graphType: 20001,
    genericId: 200122,
    concreteId: 0,
    inputs: [
      {
        index: 0,
        kind: 'input',
        type: 'int',
        clientVarType: 3
      },
      {
        index: 1,
        kind: 'input',
        type: 'enum',
        clientVarType: 13
      }
    ],
    outputs: [],
    sampleFile: '整数过滤器节点\\三维向量内积_填值.gia'
  }
] as const
