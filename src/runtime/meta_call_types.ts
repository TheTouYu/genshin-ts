import type { value } from './value.js'

export type MetaCallRecordType = 'event' | 'exec' | 'data'

export interface MetaCallRecord {
  id: number
  type: MetaCallRecordType
  nodeType: string
  /** null marks an intentionally-unset pin (client hidden pins keep editor defaults) */
  args: Array<value | null>
}

export type MetaCallRecordRef = Readonly<MetaCallRecord>
