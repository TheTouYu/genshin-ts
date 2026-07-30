import type { DiagnosticProvenance } from '../diagnostics.js'
import type { LiteralValueType } from './IR.js'
import type { RuntimeValueTypeMap, value } from './value.js'

export type MetaCallRecordType = 'event' | 'exec' | 'data'

export interface MetaCallRecord {
  id: number
  type: MetaCallRecordType
  nodeType: string
  args: value[]
  compositeInputIndices?: Array<number | undefined>
  provenance?: DiagnosticProvenance
}

export type MetaCallRecordRef = Readonly<MetaCallRecord>

export type FlowMarkerRef = {
  readonly __markerNodeId: number
}

export type CompositeOutputDefinitions = Record<string, { type: LiteralValueType }>

export type CompositeCallResult<
  Outputs extends CompositeOutputDefinitions = CompositeOutputDefinitions
> = (string extends keyof Outputs
  ? Record<string, any>
  : {
      [K in keyof Outputs]: Outputs[K]['type'] extends keyof RuntimeValueTypeMap
        ? RuntimeValueTypeMap[Outputs[K]['type']]
        : never
    }) &
  FlowMarkerRef
