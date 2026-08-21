// assets_terrain.ts — 地形/草皮（root 7）CLI 命令
// 用法：
//   gsts assets:terrain set-range --col-min <c1> --col-max <c2> --row-min <r1> --row-max <r2>
//     [--map-id <id>|--gil <file>] [--output <file>|--write]
//   gsts assets:terrain list [--map-id <id>|--gil <file>]

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { loadGstsConfig } from '../compiler/config_loader.js'
import { resolveGilTarget } from './gil_paths.js'
import { readTerrainTiles, setTerrainRange } from './gil_terrain.js'

type Command = 'set-range' | 'list'
type Format = 'text' | 'json'

function usage(exitCode = 1): never {
  const output = [
    'Read or set the terrain/grass tile grid (root 7 f4) of a GIL map.',
    '',
    'Usage: gsts assets:terrain [set-range|list] [options]',
    '',
    '  --col-min <n>        minimum column index (inclusive)',
    '  --col-max <n>        maximum column index (inclusive)',
    '  --row-min <n>        minimum row index (inclusive)',
    '  --row-max <n>        maximum row index (inclusive)',
    '  --map-id <id>        target map ID (location only)',
    '  --gil <file>         explicit GIL source',
    '  --format <text|json> output format (default: text)',
    '  --output <file>      create output without overwriting',
    '  --write              atomically write source GIL after backup',
    '  -h, --help           show help',
    '',
    'Tile grid encoding: f1 = (row << 16) | col, f2 = 1 (exists).',
    'Default map is 20x20 tiles with row/col 100..119 (5m per tile, ±50m).',
    'Tile world position: x = (col-100)*5 - 47.5, z = (row-100)*5 - 47.5.',
    'set-range replaces the whole tile grid with a rectangular range;',
    'tiles outside the range are removed, tiles inside are created.',
    'See docs/game-engine-knowledge/terrain-grass.md for full rules.'
  ]
  console.error(output.join('\n'))
  process.exit(exitCode)
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = 'true'
    }
  }
  return out
}

function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

export async function runAssetsTerrain(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) usage(0)
  // 第一个非 -- 参数是子命令
  const command: Command = argv.find((a) => !a.startsWith('--')) === 'list' ? 'list' : 'set-range'
  const args = parseArgs(argv)
  const format: Format = args['format'] === 'json' ? 'json' : 'text'

  // 解析源（map-id 或 gil）
  const projectConfigPath = process.env.GSTS_CONFIG
  let projectConfig: GstsConfig | undefined
  if (projectConfigPath) {
    projectConfig = await loadGstsConfig(projectConfigPath, { profile: 'project' })
  }
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  let gilPath = args['gil']
  let mapId: number | undefined
  if (!gilPath && args['map-id']) {
    mapId = Number(args['map-id'])
    inject.mapId = mapId
  }
  if (!gilPath && inject.mapId !== undefined) {
    const target = resolveGilTarget(inject)
    gilPath = target.gilPath
    mapId = target.mapId
  }
  if (!gilPath) {
    console.error('[error] need --gil <file> or --map-id <id>')
    usage(1)
  }
  const source = fs.readFileSync(gilPath)

  if (command === 'list') {
    const tiles = readTerrainTiles(source)
    if (format === 'json') {
      console.log(JSON.stringify({ tiles, count: tiles.length }, null, 2))
    } else {
      console.log(`tiles=${tiles.length}`)
      // 按 col 分组显示范围
      const byCol = new Map<number, number[]>()
      for (const [r, c] of tiles) {
        if (!byCol.has(c)) byCol.set(c, [])
        byCol.get(c)!.push(r)
      }
      const cols = [...byCol.keys()].sort((a, b) => a - b)
      for (const c of cols) {
        const rows = byCol.get(c)!.sort((a, b) => a - b)
        console.log(`col ${c}: rows ${rows[0]}..${rows[rows.length - 1]} (${rows.length})`)
      }
    }
    return
  }

  // set-range
  const colMin = Number(args['col-min'])
  const colMax = Number(args['col-max'])
  const rowMin = Number(args['row-min'])
  const rowMax = Number(args['row-max'])
  if ([colMin, colMax, rowMin, rowMax].some((v) => Number.isNaN(v))) {
    console.error('[error] need numeric --col-min --col-max --row-min --row-max')
    usage(1)
  }
  if (colMin > colMax || rowMin > rowMax) {
    console.error('[error] col-min/row-min must be <= col-max/row-max')
    process.exit(1)
  }
  const expectedCount = (colMax - colMin + 1) * (rowMax - rowMin + 1)
  const candidate = setTerrainRange(source, colMin, colMax, rowMin, rowMax)

  if (args['write'] === 'true') {
    // 备份 + 原子写回（镜像 assets:entities apply-candidate 的安全语义）
    const dir = path.dirname(gilPath)
    const backups = path.join(dir, '.gsts', 'backups')
    fs.mkdirSync(backups, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(backups, `${path.basename(gilPath)}.${ts}.bak`)
    fs.writeFileSync(backup, source)
    const tmp = `${gilPath}.tmp-${process.pid}`
    fs.writeFileSync(tmp, candidate)
    fs.renameSync(tmp, gilPath)
    if (format === 'json') {
      console.log(JSON.stringify({
        sourceSha256: sha256(source),
        candidateSha256: sha256(candidate),
        backup,
        writePerformed: true,
        tiles: expectedCount
      }, null, 2))
    } else {
      console.log(`sourceSha256=${sha256(source)}`)
      console.log(`candidateSha256=${sha256(candidate)}`)
      console.log(`backup=${backup}`)
      console.log(`writePerformed=true`)
      console.log(`tiles=${expectedCount}`)
    }
    return
  }

  // 只生成候选（--output 或打印）
  if (args['output']) {
    if (fs.existsSync(args['output'])) {
      console.error(`[error] output already exists: ${args['output']}`)
      process.exit(1)
    }
    fs.writeFileSync(args['output'], candidate)
    if (format === 'json') {
      console.log(JSON.stringify({
        sourceSha256: sha256(source),
        candidateSha256: sha256(candidate),
        output: args['output'],
        writePerformed: false,
        tiles: expectedCount
      }, null, 2))
    } else {
      console.log(`sourceSha256=${sha256(source)}`)
      console.log(`candidateSha256=${sha256(candidate)}`)
      console.log(`output=${args['output']}`)
      console.log(`writePerformed=false`)
      console.log(`tiles=${expectedCount}`)
    }
  } else {
    // 打印候选 JSON（方便管道验证）
    if (format === 'json') {
      console.log(JSON.stringify({
        sourceSha256: sha256(source),
        candidateSha256: sha256(candidate),
        tiles: expectedCount,
        candidate
      }, (_, v) => (v instanceof Uint8Array ? Array.from(v) : v)))
    } else {
      console.log(`sourceSha256=${sha256(source)}`)
      console.log(`candidateSha256=${sha256(candidate)}`)
      console.log(`tiles=${expectedCount}`)
    }
  }
}

// re-export for tests
export { readTerrainTiles, setTerrainRange }