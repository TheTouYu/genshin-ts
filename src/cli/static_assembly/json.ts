import { createHash } from 'node:crypto'

function normalize(value: unknown, seen: Set<object>): unknown {
  if (value === undefined) throw new Error('[error] canonical JSON does not support undefined')
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('[error] canonical JSON requires finite numbers')
  }
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) throw new Error('[error] canonical JSON does not support cycles')
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((item) => normalize(item, seen))
    const source = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(source)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((key) => [key, normalize(source[key], seen)])
    )
  } finally {
    seen.delete(value)
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, new Set()))
}

export function prettyStableJson(value: unknown): string {
  return JSON.stringify(normalize(value, new Set()), null, 2) + '\n'
}

export function sha256Bytes(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex')
}

export function hashCanonicalJson(value: unknown): string {
  return sha256Bytes(canonicalJson(value))
}
