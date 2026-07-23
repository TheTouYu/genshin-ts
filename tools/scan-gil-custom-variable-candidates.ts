import { readGilPayloadFields } from '../src/cli/gil_extract_utils.js'
import {
  decodeUtf8,
  findAncestorFields,
  readFieldVarint,
  readVarint
} from '../src/injector/binary.js'
import type { LenField } from '../src/injector/types.js'

type RawField =
  | { field: number; wire: 0; value: number }
  | { field: number; wire: 1 | 2 | 5; data: Uint8Array }

type Candidate = {
  name: string
  typeCode: number
  path: string
  ownerPath?: string
  ownerId?: number
  ownerBasePrefabId?: number
  typeFields: number[]
  valueFields: number[]
  initialValueWire: string
}

function readFields(buf: Uint8Array): RawField[] {
  const fields: RawField[] = []
  let offset = 0
  while (offset < buf.length) {
    const key = readVarint(buf, offset)
    if (!key) break
    offset = key.next
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const value = readVarint(buf, offset)
      if (!value) break
      fields.push({ field, wire, value: value.value })
      offset = value.next
      continue
    }
    if (wire === 1) {
      if (offset + 8 > buf.length) break
      fields.push({ field, wire, data: buf.subarray(offset, offset + 8) })
      offset += 8
      continue
    }
    if (wire === 2) {
      const len = readVarint(buf, offset)
      if (!len || len.next + len.value > buf.length) break
      fields.push({ field, wire, data: buf.subarray(len.next, len.next + len.value) })
      offset = len.next + len.value
      continue
    }
    if (wire === 5) {
      if (offset + 4 > buf.length) break
      fields.push({ field, wire, data: buf.subarray(offset, offset + 4) })
      offset += 4
      continue
    }
    break
  }
  return fields
}

function valueOf(fields: RawField[], field: number): number | undefined {
  const entry = fields.find((item) => item.field === field && item.wire === 0)
  return entry?.wire === 0 ? entry.value : undefined
}

function bytesOf(fields: RawField[], field: number): Uint8Array | undefined {
  const entry = fields.find((item) => item.field === field && item.wire === 2)
  return entry?.wire === 2 ? entry.data : undefined
}

function summarizeWire(fields: RawField[]): string {
  return fields
    .map((field) => {
      if (field.wire === 0) return `${field.field}=varint:${field.value}`
      const text = field.wire === 2 ? decodeUtf8(field.data) : undefined
      const printable = text && !/[\u0000-\u0008\u000e-\u001f\ufffd]/.test(text)
      const nested = field.wire === 2 ? readFields(field.data) : []
      if (printable) return `${field.field}=text:${JSON.stringify(text)}`
      if (nested.length > 0) return `${field.field}={${summarizeWire(nested)}}`
      return `${field.field}=bytes:${Buffer.from(field.data).toString('hex')}`
    })
    .join(', ')
}

function fieldPath(field: LenField): string {
  return [field.p0, field.p1, field.p2, field.p3, field.p4, field.p5]
    .slice(0, field.depth)
    .join('.')
}

function readOwner(
  payload: Uint8Array,
  fields: LenField[],
  variableField: LenField
): {
  path?: string
  id?: number
  basePrefabId?: number
} {
  const ancestors = findAncestorFields(fields, variableField)
  const owner = ancestors.find((field) => field.depth === 2 && field.p0 === 4 && field.p1 === 1)
  if (!owner) return {}
  const ownerFields = readFields(payload.subarray(owner.dataStart, owner.dataEnd))
  return {
    path: fieldPath(owner),
    id: valueOf(ownerFields, 1),
    basePrefabId: valueOf(ownerFields, 2)
  }
}

function parseCandidate(
  payload: Uint8Array,
  fields: LenField[],
  field: LenField
): Candidate | undefined {
  const direct = readFields(payload.subarray(field.dataStart, field.dataEnd))
  const nameBytes = bytesOf(direct, 2)
  const name = nameBytes ? decodeUtf8(nameBytes) : undefined
  const typeCode = valueOf(direct, 3)
  const typeBytes = bytesOf(direct, 4)
  const valueBytes = bytesOf(direct, 6)
  if (!name || typeCode === undefined || !typeBytes || !valueBytes) return undefined

  const typeFields = readFields(typeBytes).map((item) => item.field)
  const valueFields = readFields(valueBytes).map((item) => item.field)
  const owner = readOwner(payload, fields, field)
  return {
    name,
    typeCode,
    path: fieldPath(field),
    ownerPath: owner.path,
    ownerId: owner.id,
    ownerBasePrefabId: owner.basePrefabId,
    typeFields,
    valueFields,
    initialValueWire: summarizeWire(readFields(typeBytes))
  }
}

function usage(): never {
  console.error('Usage: npx tsx tools/scan-gil-custom-variable-candidates.ts <map.gil>')
  process.exit(1)
}

const [gilPath] = process.argv.slice(2)
if (!gilPath) usage()

const { payload, fields } = readGilPayloadFields(gilPath)
const candidates = fields
  .filter((field) => field.field === 1)
  .map((field) => parseCandidate(payload, fields, field))
  .filter((candidate): candidate is Candidate => !!candidate)

console.log(JSON.stringify({ gilPath, count: candidates.length, candidates }, null, 2))
