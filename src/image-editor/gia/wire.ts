/**
 * Minimal protobuf wire-format reader/writer for GIA image-mode assets.
 *
 * Ported from the reference implementation used by the Miliastra image
 * editor web UI (https://github.com/1475505/Miliastra-image-editor-webui,
 * backend/vendor/gia/json_to_gia.py) with the same field semantics.
 * The node-graph GIA path in this repo uses protobufjs schemas instead;
 * image-mode ui.content is not covered by gia.proto, so raw wire helpers
 * are kept local to the image editor module.
 *
 * Notes:
 * - Varint math uses multiplication / BigInt instead of JS bitwise shifts so
 *   values above 2^31 (e.g. guids around 1.07e9, the uint64 sentinel
 *   0xFFFFFFFFFFFFFFFF) encode/decode exactly.
 */

export const enum WireType {
  VARINT = 0,
  FIXED64 = 1,
  LENGTH_DELIMITED = 2,
  START_GROUP = 3,
  END_GROUP = 4,
  FIXED32 = 5
}

/** Max uint64 (protobuf negative-number sentinel used by image source_meta). */
export const MAX_UINT64 = 0xffffffffffffffffn

export type WireField =
  | { tag: number; wire: WireType.LENGTH_DELIMITED; data: Uint8Array }
  | { tag: number; wire: WireType.VARINT; value: number }
  | { tag: number; wire: WireType.FIXED32 | WireType.FIXED64; raw: Uint8Array }

export class ProtoWriter {
  buffer = new Uint8Array(0)

  writeVarint(value: number | bigint): void {
    let v = typeof value === 'bigint' ? value : BigInt(value)
    if (v < 0n) v += 1n << 64n // protobuf uses unsigned 64-bit two's complement
    const parts: number[] = []
    while (true) {
      const byte = Number(v & 0x7fn)
      v >>= 7n
      if (v) parts.push(byte | 0x80)
      else {
        parts.push(byte)
        break
      }
    }
    this.append(Uint8Array.from(parts))
  }

  writeTag(field: number, wire: WireType): void {
    this.writeVarint((field << 3) | wire)
  }

  writeInt32(field: number, value: number): void {
    this.writeTag(field, WireType.VARINT)
    this.writeVarint(value)
  }

  writeInt64(field: number, value: number | bigint): void {
    this.writeTag(field, WireType.VARINT)
    this.writeVarint(value)
  }

  writeBool(field: number, value: boolean): void {
    this.writeTag(field, WireType.VARINT)
    this.writeVarint(value ? 1 : 0)
  }

  writeFloat(field: number, value: number): void {
    this.writeTag(field, WireType.FIXED32)
    const raw = new Uint8Array(4)
    new DataView(raw.buffer).setFloat32(0, value, true)
    this.append(raw)
  }

  writeString(field: number, value: string): void {
    this.writeBytes(field, new TextEncoder().encode(value))
  }

  writeBytes(field: number, value: Uint8Array): void {
    this.writeTag(field, WireType.LENGTH_DELIMITED)
    this.writeVarint(value.length)
    this.append(value)
  }

  writeMessage(field: number, writer: ProtoWriter): void {
    this.writeBytes(field, writer.buffer)
  }

  append(bytes: Uint8Array): void {
    const next = new Uint8Array(this.buffer.length + bytes.length)
    next.set(this.buffer)
    next.set(bytes, this.buffer.length)
    this.buffer = next
  }

  getBytes(): Uint8Array {
    return this.buffer
  }
}

export class ProtoReader {
  pos = 0

  constructor(
    readonly data: Uint8Array
  ) {}

  readVarint(): number {
    let result = 0
    let shift = 0
    while (true) {
      if (this.pos >= this.data.length) throw new Error('End of data while reading varint')
      const byte = this.data[this.pos++]
      result += (byte & 0x7f) * 2 ** shift
      if (!(byte & 0x80)) return result
      shift += 7
      if (shift > 63) throw new Error('Varint too long')
    }
  }

  readFixed32(): Uint8Array {
    if (this.pos + 4 > this.data.length) throw new Error('End of data while reading fixed32')
    const val = this.data.slice(this.pos, this.pos + 4)
    this.pos += 4
    return val
  }

  readFixed64(): Uint8Array {
    if (this.pos + 8 > this.data.length) throw new Error('End of data while reading fixed64')
    const val = this.data.slice(this.pos, this.pos + 8)
    this.pos += 8
    return val
  }

  readLengthDelimited(): Uint8Array {
    const length = this.readVarint()
    if (this.pos + length > this.data.length) throw new Error('End of data while reading length delimited')
    const val = this.data.slice(this.pos, this.pos + length)
    this.pos += length
    return val
  }

  eof(): boolean {
    return this.pos >= this.data.length
  }

  readTag(): [number, WireType] | null {
    if (this.eof()) return null
    const val = this.readVarint()
    return [val >> 3, val & 0x07]
  }

  readField(wire: WireType): number | Uint8Array {
    if (wire === WireType.VARINT) return this.readVarint()
    if (wire === WireType.FIXED64) return this.readFixed64()
    if (wire === WireType.LENGTH_DELIMITED) return this.readLengthDelimited()
    if (wire === WireType.FIXED32) return this.readFixed32()
    throw new Error(`Unsupported wire type: ${wire}`)
  }

  /** Parse a message into its raw fields, preserving order and wire types. */
  parseFields(): WireField[] {
    const fields: WireField[] = []
    while (!this.eof()) {
      const tagInfo = this.readTag()
      if (tagInfo === null) break
      const [tag, wire] = tagInfo
      if (wire === WireType.LENGTH_DELIMITED) {
        fields.push({ tag, wire, data: this.readLengthDelimited() })
      } else if (wire === WireType.VARINT) {
        fields.push({ tag, wire, value: this.readVarint() })
      } else if (wire === WireType.FIXED32) {
        fields.push({ tag, wire, raw: this.readFixed32() })
      } else if (wire === WireType.FIXED64) {
        fields.push({ tag, wire, raw: this.readFixed64() })
      } else {
        throw new Error(`Unsupported wire type: ${wire}`)
      }
    }
    return fields
  }
}

/** Re-encode parsed fields back into message bytes (byte-for-byte faithful). */
export function buildMessage(fields: WireField[]): Uint8Array {
  const writer = new ProtoWriter()
  for (const f of fields) {
    if (f.wire === WireType.LENGTH_DELIMITED) {
      writer.writeBytes(f.tag, f.data)
    } else if (f.wire === WireType.VARINT) {
      writer.writeTag(f.tag, WireType.VARINT)
      writer.writeVarint(f.value)
    } else {
      writer.writeTag(f.tag, f.wire)
      writer.append(f.raw)
    }
  }
  return writer.getBytes()
}

/** Find first varint field with the given tag inside parsed fields. */
export function findVarint(fields: WireField[], tag: number, fallback?: number): number | undefined {
  for (const field of fields) {
    if (field.tag === tag && field.wire === WireType.VARINT) return field.value
  }
  return fallback
}

/** Extract asset_guid (field 4 varint) from a ResourceLocator message. */
export function checkLocatorGuid(data: Uint8Array): number {
  const reader = new ProtoReader(data)
  while (!reader.eof()) {
    const tagInfo = reader.readTag()
    if (tagInfo === null) break
    const [tag, wire] = tagInfo
    const value = reader.readField(wire)
    if (tag === 4 && wire === WireType.VARINT) return value as number
  }
  return 0
}

/** Parse a ResourceEntry enough to get identity and resource_class. */
export function parseResourceEntry(data: Uint8Array): { class: number; guid: number; name: string } {
  const reader = new ProtoReader(data)
  const info = { class: 0, guid: 0, name: '' }
  while (!reader.eof()) {
    const tagInfo = reader.readTag()
    if (tagInfo === null) break
    const [tag, wire] = tagInfo
    const value = reader.readField(wire)
    if (tag === 5 && wire === WireType.VARINT) info.class = value as number
    else if (tag === 3 && wire === WireType.LENGTH_DELIMITED) {
      info.name = new TextDecoder().decode(value as Uint8Array)
    } else if (tag === 1 && wire === WireType.LENGTH_DELIMITED) {
      const sub = new ProtoReader(value as Uint8Array)
      while (!sub.eof()) {
        const subTagInfo = sub.readTag()
        if (subTagInfo === null) break
        const [subTag, subWire] = subTagInfo
        const subValue = sub.readField(subWire)
        if (subTag === 4 && subWire === WireType.VARINT) info.guid = subValue as number
      }
    }
  }
  return info
}
