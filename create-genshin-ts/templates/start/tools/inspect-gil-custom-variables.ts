import { readFileSync } from 'node:fs'

import { readGilPayloadFields } from 'genshin-ts/cli/gil_extract_utils.js'
import { decodeUtf8, readVarint } from 'genshin-ts/injector/binary.js'
import type { LenField } from 'genshin-ts/injector/types.js'

type WireField = {
  field: number
  wire: number
  offset: number
  dataStart: number
  dataEnd: number
  value?: number
}

function readFields(buf: Uint8Array, start: number, end: number): WireField[] {
  const fields: WireField[] = []
  let offset = start
  while (offset < end) {
    const key = readVarint(buf, offset)
    if (!key) break
    offset = key.next
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const value = readVarint(buf, offset)
      if (!value) break
      fields.push({
        field,
        wire,
        offset: key.next,
        dataStart: offset,
        dataEnd: value.next,
        value: value.value
      })
      offset = value.next
      continue
    }
    if (wire === 1) {
      const dataEnd = offset + 8
      if (dataEnd > end) break
      fields.push({ field, wire, offset: key.next, dataStart: offset, dataEnd })
      offset = dataEnd
      continue
    }
    if (wire === 2) {
      const length = readVarint(buf, offset)
      if (!length) break
      const dataStart = length.next
      const dataEnd = dataStart + length.value
      if (dataEnd > end) break
      fields.push({ field, wire, offset: key.next, dataStart, dataEnd })
      offset = dataEnd
      continue
    }
    if (wire === 5) {
      const dataEnd = offset + 4
      if (dataEnd > end) break
      fields.push({ field, wire, offset: key.next, dataStart: offset, dataEnd })
      offset = dataEnd
      continue
    }
    break
  }
  return fields
}

function isPrintableText(bytes: Uint8Array): boolean {
  const text = decodeUtf8(bytes)
  return !!text && text.length > 0 && !/[\u0000-\u0008\u000e-\u001f\ufffd]/.test(text)
}

function formatFields(payload: Uint8Array, start: number, end: number): string[] {
  return readFields(payload, start, end).map((field) => {
    if (field.wire === 0) return `${field.field}:varint=${field.value}`
    const bytes = payload.subarray(field.dataStart, field.dataEnd)
    const text = isPrintableText(bytes) ? JSON.stringify(decodeUtf8(bytes)) : undefined
    const nested = text ? undefined : formatNestedFields(bytes)
    return `${field.field}:wire=${field.wire},len=${field.dataEnd - field.dataStart}${text ? `,text=${text}` : ''}${nested ? `,nested=[${nested}]` : ''}`
  })
}

function formatNestedFields(bytes: Uint8Array): string | undefined {
  const fields = readFields(bytes, 0, bytes.length)
  if (fields.length === 0) return undefined
  return fields
    .map((field) => {
      if (field.wire === 0) return `${field.field}:v=${field.value}`
      return `${field.field}:w=${field.wire},len=${field.dataEnd - field.dataStart}`
    })
    .join(',')
}

function fieldPath(field: LenField): string {
  const path = [field.p0, field.p1, field.p2, field.p3, field.p4, field.p5].slice(0, field.depth)
  return path.join('.')
}

function inspectOccurrence(payload: Uint8Array, fields: LenField[], name: string, index: number) {
  const nameBytes = Buffer.from(name)
  let start = 0
  let occurrence = 0
  while (start < payload.length) {
    const found = Buffer.from(payload).indexOf(nameBytes, start)
    if (found < 0) return
    start = found + nameBytes.length
    occurrence += 1
    if (occurrence !== index) continue

    const directField = fields.find(
      (field) => field.dataStart === found && field.dataEnd === found + nameBytes.length
    )
    const ancestors = directField
      ? fields.filter(
          (field) =>
            field.dataStart <= directField.lenOffset && field.dataEnd >= directField.dataEnd
        )
      : []
    ancestors.sort((a, b) => a.dataEnd - a.dataStart - (b.dataEnd - b.dataStart))

    console.log(`occurrence=${index} payloadOffset=${found}`)
    console.log(
      `fieldPath=${directField ? fieldPath(directField) : 'not-recognized'} field=${directField?.field ?? 'unknown'}`
    )
    for (const [depth, ancestor] of ancestors.entries()) {
      const size = ancestor.dataEnd - ancestor.dataStart
      console.log(
        `ancestor[${depth}]=path:${fieldPath(ancestor)} field:${ancestor.field} size:${size}`
      )
      console.log(
        `  fields: ${formatFields(payload, ancestor.dataStart, ancestor.dataEnd).join(' | ')}`
      )
    }
    return
  }
}

function usage(): never {
  console.error(
    'Usage: npx tsx tools/inspect-gil-custom-variables.ts <map.gil> <variable-name> [occurrence]'
  )
  process.exit(1)
}

const [gilPath, variableName, occurrenceText] = process.argv.slice(2)
if (!gilPath || !variableName) usage()

const occurrence = occurrenceText ? Number(occurrenceText) : 1
if (!Number.isSafeInteger(occurrence) || occurrence < 1) usage()

const bytes = readFileSync(gilPath)
const { payload, fields } = readGilPayloadFields(gilPath)
console.log(`file=${gilPath}`)
console.log(
  `fileBytes=${bytes.length} payloadBytes=${payload.length} lengthFields=${fields.length}`
)
inspectOccurrence(payload, fields, variableName, occurrence)
