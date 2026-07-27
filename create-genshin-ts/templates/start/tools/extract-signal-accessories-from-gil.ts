/**
 * 从 .gil 地图文件中提取信号定义 accessories（含完整 compositeDef）。
 *
 * 使用方法：
 *   npx tsx tools/extract-signal-accessories-from-gil.ts <path.gil> [output.json]
 *
 * 项目规范：
 *   信号在游戏编辑器中定义，存入 .gil 地图文件。
 *   编译时通过 inject 配置自动提取到 src/resources/signals.ts。
 *   本工具将完整的 accessory GraphUnit（含 compositeDef）提取为 JSON，
 *   可在 standalone materializer 中直接使用。
 */

import { readFileSync, writeFileSync } from 'node:fs'

import protobuf from 'protobufjs'

import { readFieldBytes, parseMessage } from 'genshin-ts/injector/binary.js'
import type { LenField } from 'genshin-ts/injector/types.js'

// ============================================================
// Protobuf 设置
// ============================================================

const protoPath = new URL(
  'genshin-ts/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const root = new protobuf.Root().loadSync(protoPath, { keepCase: true })
const graphUnitType = root.lookupType('GraphUnit')

// ============================================================
// 从 .gil 递归扫描 signal-definition accessories
// ============================================================

interface AccessoryEntry {
  /** 信号名称（从 compositeDef 提取） */
  signalName: string
  /** 完整 accessory GraphUnit（protobuf 解码后的可序列化对象） */
  accessory: Record<string, unknown>
}

function extractSignalAccessories(gilPath: string): AccessoryEntry[] {
  const gilBytes = readFileSync(gilPath)
  const payload = gilBytes.slice(20, -4)
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)

  const results: AccessoryEntry[] = []
  const seen = new Set<string>()

  /**
   * 扫描一段字节中是否有 GraphUnit + compositeDef。
   * 最多递归 depth 层子消息。
   */
  function scan(buf: Uint8Array, fieldList: LenField[], depth = 0) {
    if (depth > 4) return

    for (const f of fieldList) {
      const len = f.dataEnd - f.dataStart
      if (len <= 0 || len > 50000) continue
      const bytes = buf.subarray(f.dataStart, f.dataEnd)

      // 检查是否有 compositeDef 字段（field 14）
      const cdefBytes = readFieldBytes(bytes, 14)
      if (cdefBytes) {
        // 尝试作为 GraphUnit 解码
        try {
          const decoded = graphUnitType.decode(bytes) as Record<string, unknown>

          // 从 compositeDef 中提取信号名
          const def = (decoded.compositeDef as Record<string, unknown> | undefined)
            ?.inner as Record<string, unknown> | undefined
          const def2 = def?.def as Record<string, unknown> | undefined
          const signalName = (def2?.name ?? decoded.name) as string

          if (signalName && decoded.id) {
            const key = `${signalName}:${decoded.id.id}`
            if (!seen.has(key)) {
              seen.add(key)

              // 转成可序列化的 plain object
              const encoded = graphUnitType.encode(decoded as never).finish()
              const redecoded = graphUnitType.decode(encoded)
              const obj = JSON.parse(JSON.stringify(redecoded)) as Record<string, unknown>

              results.push({ signalName, accessory: obj })
            }
          }
        } catch {
          // 不是合法的 GraphUnit
        }
      }

      // 递归扫描子消息
      const subFields: LenField[] = []
      parseMessage(bytes, 0, bytes.length, 0, 0, 0, 0, 0, 0, 0, subFields)
      scan(bytes, subFields, depth + 1)
    }
  }

  scan(payload, fields)
  return results
}

// ============================================================
// 主入口
// ============================================================

function main() {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.error('Usage: npx tsx tools/extract-signal-accessories-from-gil.ts <path.gil> [output.json]')
    process.exit(1)
  }

  const gilPath = args[0]
  const outputPath = args[1]

  console.error(`Reading: ${gilPath}`)
  const entries = extractSignalAccessories(gilPath)
  console.error(`Found ${entries.length} signal accessory entries`)

  // 按信号名分组
  const bySignal = new Map<string, Record<string, unknown>[]>()
  for (const entry of entries) {
    if (!bySignal.has(entry.signalName)) bySignal.set(entry.signalName, [])
    bySignal.get(entry.signalName)!.push(entry.accessory)
  }

  for (const [name, accs] of bySignal) {
    const details = accs.map(a => {
      const def = (a.compositeDef as Record<string, unknown> | undefined)
        ?.inner as Record<string, unknown> | undefined
      const def2 = def?.def as Record<string, unknown> | undefined
      return `  which=${a.which} id=${(a.id as Record<string, unknown>).id} inputs=${(def2?.inputs as unknown[])?.length ?? 0} outputs=${(def2?.outputs as unknown[])?.length ?? 0}`
    }).join('\n')
    console.error(`\n信号: ${name}`)
    console.error(details)
  }

  // 输出 JSON
  const output = JSON.stringify(entries.map(e => e.accessory), null, 2)
  if (outputPath) {
    writeFileSync(outputPath, output)
    console.error(`\nSaved to: ${outputPath} (${output.length} bytes)`)
  } else {
    process.stdout.write(output)
  }
}

main()
