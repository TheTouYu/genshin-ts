/**
 * 从 .gil 地图文件中解码信号定义 accessories（完整 GraphUnit）。
 *
 * 使用规范信号提取流程：
 *   1. 信号在游戏编辑器中定义，存入 .gil 地图
 *   2. 编译时自动提取信号定义名和参数到 src/resources/signals.ts
 *   3. 本工具提取完整 accessory GraphUnit（含 compositeDef），供 standalone materializer 使用
 *
 * 使用方法：
 *   npx tsx tools/decode-gil-signals.ts <path.gil> [output-prefix]
 *
 * 无 output-prefix 时只打印摘要；
 * 有 output-prefix 时将每个信号 accessories 保存为 <prefix>.<信号名>.json
 */

import { readFileSync, writeFileSync } from 'node:fs'

import protobuf from 'protobufjs'

import { parseMessage } from 'genshin-ts/injector/binary.js'
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
// 从 .gil 提取信号定义 accessories
// ============================================================

function extractAllGraphUnits(gilPath: string): Record<string, unknown>[] {
  const gilBytes = readFileSync(gilPath)
  const payload = gilBytes.slice(20, -4)
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)

  const results: Record<string, unknown>[] = []

  // Field 1 entries in the .gil are the main data container
  // Within these, GraphUnit entries have which=11/12/14 and may have compositeDef
  const f1 = fields.filter(f => f.field === 1)

  for (const f of f1) {
    const bytes = payload.subarray(f.dataStart, f.dataEnd)
    if (bytes.length < 10) continue

    try {
      const decoded = graphUnitType.decode(bytes) as Record<string, unknown>
      const whichVal = decoded.which as number
      const idVal = (decoded.id as Record<string, unknown> | undefined)?.id

      // We're interested in Skill graphs and signal definitions
      if (whichVal === 11 || whichVal === 12 || whichVal === 14) {
        // Encode back for clean round-trip
        const encoded = graphUnitType.encode(decoded as never).finish()
        const redecoded = graphUnitType.decode(encoded)
        // Convert to plain object
        const obj = JSON.parse(JSON.stringify(redecoded)) as Record<string, unknown>
        results.push(obj)
      }
    } catch {
      // Not a valid GraphUnit
    }
  }

  return results
}

// ============================================================
// 按信号名分组 accessories
// ============================================================

function groupBySignal(
  graphUnits: Record<string, unknown>[]
): Map<string, Record<string, unknown>[]> {
  const signalMap = new Map<string, Record<string, unknown>[]>()

  for (const gu of graphUnits) {
    // Try to get signal name from compositeDef
    const cdef = gu.compositeDef as Record<string, unknown> | undefined
    const inner = cdef?.inner as Record<string, unknown> | undefined
    const def = inner?.def as Record<string, unknown> | undefined
    const compositeDefName = def?.name as string | undefined

    // For which=11 (Skills), the name is at gu.name
    const name = compositeDefName ?? (gu.name as string)

    if (name) {
      if (!signalMap.has(name)) signalMap.set(name, [])
      signalMap.get(name)!.push(gu)
    }
  }

  return signalMap
}

// ============================================================
// 主入口
// ============================================================

function main() {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.error('Usage: npx tsx tools/decode-gil-signals.ts <path.gil> [output-prefix]')
    process.exit(1)
  }

  const gilPath = args[0]
  const outputPrefix = args[1]

  console.error(`Reading: ${gilPath}`)
  const all = extractAllGraphUnits(gilPath)
  console.error(`Found ${all.length} GraphUnits with which=11/12/14`)

  const bySignal = groupBySignal(all)

  for (const [name, units] of bySignal) {
    console.error(`\n${name}:`)
    for (const u of units) {
      const which = u.which as number
      const idVal = (u.id as Record<string, unknown>).id
      const hasDef = !!u.compositeDef
      const def = (u.compositeDef as Record<string, unknown> | undefined)
        ?.inner as Record<string, unknown> | undefined
      const def2 = def?.def as Record<string, unknown> | undefined
      const inputs = (def2?.inputs as unknown[])?.length ?? 0
      const outputs = (def2?.outputs as unknown[])?.length ?? 0
      const related = (u.relatedIds as Array<Record<string, unknown>> | undefined)
        ?.map(r => r.id) ?? []

      console.error(`  which=${which} id=${idVal} inputs=${inputs} outputs=${outputs} relatedIds=[${related.join(',')}]`)
    }
  }

  // Save to files
  const signalAccessories = bySignal.get('信号_全部参数测试')
  if (signalAccessories) {
    const jsonPath = '/tmp/signal-信号_全部参数测试-accessories.json'
    writeFileSync(jsonPath, JSON.stringify(signalAccessories, null, 2))
    console.error(`\nSaved accessories for 信号_全部参数测试 to ${jsonPath}`)
  }

  // If output prefix given, save each signal
  if (outputPrefix) {
    for (const [name, units] of bySignal) {
      const path = `${outputPrefix}.${name}.json`
      writeFileSync(path, JSON.stringify(units, null, 2))
      console.error(`Saved: ${path}`)
    }
  }
}

main()
