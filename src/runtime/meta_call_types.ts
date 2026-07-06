import type { value } from './value.js'

export type MetaCallRecordType = 'event' | 'exec' | 'data'

export interface MetaCallRecord {
  id: number
  type: MetaCallRecordType
  nodeType: string
  args: value[]
  /** client-only hints consumed by IR->GIA (output type for cid lookup, etc.) */
  clientHints?: { outputIrType?: string }
}

export type MetaCallRecordRef = Readonly<MetaCallRecord>
