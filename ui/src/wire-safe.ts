/**
 * ui/src/wire-safe.ts — 大值安全 wire 解析/发射层（票10）
 *
 * 动机：共享 wire 层（static_assembly/wire.ts）的 encodeVarint 只支持 32 位无符号
 * （value >>> 0），而真实控件记录含超大 varint 哨兵——页签 t47 默认选择 2^56-1（9B
 * ff×8 01）、文本配置内层 2^64-1（10B ff×9 01）——parse→emit 往返会截断（实测 f40
 * 94B→89B）。铁律 1「不得破坏未解码字节」要求嵌套区手术必须字节保真。
 *
 * 方案：>4 字节 varint（≥2^31：颜色 ARGB / 2^56-1 / 2^64-1 哨兵）一律以 BigInt 精确
 * 保留（原始编码均为 canonical，重发逐字节还原）；小值保持 number（与共享层兼容）。
 * 仅 ui 模块内部使用，不改共享层行为。
 */

import { readVarint } from '../../src/injector/binary.js'

export type SafeFieldValue = number | bigint | Uint8Array

export interface SafeField {
  number: number
  wire: number
  value: SafeFieldValue
}

/** 安全解析：wire0 varint >5 字节 → BigInt（精确）；wire1/5 → 原始字节；wire2 → 子消息字节 */
export function parseSafe(data: Uint8Array): SafeField[] | undefined {
  const fields: SafeField[] = []
  let offset = 0
  while (offset < data.length) {
    const key = readVarint(data, offset)
    if (!key || key.value >> 3 === 0) return undefined
    offset = key.next
    const number = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const start = offset
      const value = readVarint(data, offset)
      if (!value) return undefined
      offset = value.next
      // >4 字节 varint：共享 readVarint 的 32 位移位对 ≥2^31 值（颜色 ARGB/哨兵）失真——
      // 重新以 BigInt 精确解码（≤4 字节 = 0..2^28-1，Number 精确且非负）
      if (value.next - start > 4) {
        let acc = 0n
        let shift = 0n
        for (let i = start; i < value.next - 1; i++) {
          acc |= BigInt(data[i] & 0x7f) << shift
          shift += 7n
        }
        acc |= BigInt(data[value.next - 1]) << shift
        fields.push({ number, wire, value: acc })
      } else {
        fields.push({ number, wire, value: value.value })
      }
    } else if (wire === 1 || wire === 5) {
      const width = wire === 1 ? 8 : 4
      if (offset + width > data.length) return undefined
      fields.push({ number, wire, value: data.slice(offset, offset + width) })
      offset += width
    } else if (wire === 2) {
      const length = readVarint(data, offset)
      if (!length || length.next + length.value > data.length) return undefined
      fields.push({ number, wire, value: data.slice(length.next, length.next + length.value) })
      offset = length.next + length.value
    } else return undefined
  }
  return fields
}

function encodeVarintSafe(value: number | bigint): Uint8Array {
  const big = typeof value === 'number' ? BigInt(value) : value
  const bytes: number[] = []
  let v = big
  while (v >= 0x80n) {
    bytes.push(Number(v & 0x7fn) | 0x80)
    v >>= 7n
  }
  bytes.push(Number(v))
  return Uint8Array.from(bytes)
}

/** 安全发射：number/bigint 均按 64 位 canonical varint 编码；wire1/5/2 字节透传 */
export function emitSafe(fields: readonly SafeField[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const field of fields) {
    parts.push(encodeVarintSafe((BigInt(field.number) << 3n) | BigInt(field.wire)))
    if (field.wire === 0) {
      parts.push(encodeVarintSafe(field.value as number | bigint))
    } else {
      const value = field.value as Uint8Array
      if (field.wire === 2) parts.push(encodeVarintSafe(value.length))
      parts.push(value)
    }
  }
  let total = 0
  for (const part of parts) total += part.length
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** 字段构造助手 */
export function s0(number: number, value: number | bigint): SafeField {
  return { number, wire: 0, value }
}

export function s2(number: number, value: Uint8Array): SafeField {
  return { number, wire: 2, value }
}

/** 小值读取（wire0；BigInt 且 ≤2^53 时转 Number——控件 ID 5 字节 varint 精确可转；
 *  超范围 BigInt/缺省返回 undefined——fail-closed 不猜） */
export function safeNum(fields: readonly SafeField[], number: number): number | undefined {
  const field = fields.find((f) => f.number === number && f.wire === 0)
  if (typeof field?.value === 'number') return field.value
  if (typeof field?.value === 'bigint') {
    const big = field.value
    if (big >= -4503599627370496n && big <= 4503599627370496n) return Number(big)
    return undefined
  }
  return undefined
}

/** wire2 子消息解析（缺失返回 undefined） */
export function safeMsg(fields: readonly SafeField[], number: number): SafeField[] | undefined {
  const field = fields.find((f) => f.number === number && f.wire === 2)
  return field ? parseSafe(field.value as Uint8Array) : undefined
}

/** wire2 字段定位（缺失报错；嵌套写回后逐层 re-emit 用） */
export function findS2(fields: readonly SafeField[], number: number): SafeField {
  const field = fields.find((f) => f.number === number && f.wire === 2)
  if (!field) throw new Error(`[error] wire2 字段 f${number} 缺失——fail-closed`)
  return field
}
