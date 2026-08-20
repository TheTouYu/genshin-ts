import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadGstsConfig } from '../compiler/config_loader.js'
import type { GstsConfig } from '../compiler/gsts_config.js'
import { resolveGilTarget } from './gil_paths.js'
import { exportEntities } from './gil_entities.js'
import { createStaticAssemblyMapIndex } from './static_assembly/map_index.js'
import { prettyStableJson } from './static_assembly/json.js'

function usage(exitCode = 1): never {
  console.error(
    [
      'List and parse user map resources: 元件资源 (root4 definitions + root8 official instances)',
      'and 摆放的实体资源 (root5 scene entities).',
      '',
      'Usage: gsts assets:resources list [--gil <map.gil> | --map-id <id>] [--format json]',
      '',
      'Options:',
      '  --gil <file>       explicit GIL source',
      '  --map-id <id>      target map ID (requires project config)',
      '  --format json      output as JSON',
      '  -h, --help         show help'
    ].join('\n')
  )
  process.exit(exitCode)
}

function value(argv: readonly string[], i: number): string {
  const r = argv[i + 1]
  if (!r || r.startsWith('--')) usage()
  return r
}

function parseArgs(argv: readonly string[]) {
  let command: 'list' = 'list'
  let gilPath: string | undefined
  let mapId: number | undefined
  let format: 'text' | 'json' = 'text'
  let i = 0
  if (argv[0] === 'list') i++
  for (; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--gil') gilPath = value(argv, i++)
    else if (a === '--map-id') {
      mapId = Number(value(argv, i++))
      if (!Number.isSafeInteger(mapId) || mapId < 0)
        throw new Error('[error] --map-id must be a non-negative safe integer')
    } else if (a === '--format') {
      const r = value(argv, i++)
      if (r !== 'text' && r !== 'json') throw new Error('[error] --format must be text or json')
      format = r
    } else if (a === '--help' || a === '-h') usage(0)
    else usage()
  }
  if (gilPath && mapId !== undefined)
    throw new Error('[error] --gil and --map-id are mutually exclusive')
  return { command, gilPath, mapId, format }
}

function resolveGilPath(
  args: ReturnType<typeof parseArgs>,
  cfg: GstsConfig | undefined
): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject = { ...(cfg?.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined) {
    throw new Error('[error] mapId is required; use --gil or configure inject.mapId')
  }
  return resolveGilTarget(inject).gilPath
}

type PrefabResource = {
  id: number
  name?: string
  resourceId?: number
  kind: 'custom-definition' | 'official-instance'
}

type ResourceList = {
  schemaVersion: 1
  kind: 'resources-list'
  prefabs: PrefabResource[]
  entities: ReturnType<typeof exportEntities>
}

async function runList(
  args: ReturnType<typeof parseArgs>,
  cfg: GstsConfig | undefined
): Promise<void> {
  const gilPath = resolveGilPath(args, cfg)
  if (!fs.existsSync(gilPath) || !fs.statSync(gilPath).isFile())
    throw new Error(`[error] gil not found: ${gilPath}`)
  const bytes = new Uint8Array(fs.readFileSync(gilPath))
  const prefabs: PrefabResource[] = []
  try {
    const idx = createStaticAssemblyMapIndex(bytes)
    for (const def of idx.definitions) {
      prefabs.push({
        id: def.id,
        ...(def.names[0] ? { name: def.names[0] } : {}),
        ...(def.resourceIds[0] !== undefined ? { resourceId: def.resourceIds[0] } : {}),
        kind: 'custom-definition'
      })
    }
    for (const inst of idx.instances) {
      prefabs.push({
        id: inst.id,
        ...(inst.names[0] ? { name: inst.names[0] } : {}),
        ...(inst.resourceIds[0] !== undefined ? { resourceId: inst.resourceIds[0] } : {}),
        kind: 'official-instance'
      })
    }
  } catch {
    // 地图缺少 root4/6/8/27 等章节时，map_index 无法解析；至少列出摆放实体。
  }
  const entities = exportEntities(bytes)
  const result: ResourceList = { schemaVersion: 1, kind: 'resources-list', prefabs, entities }
  if (args.format === 'json') {
    process.stdout.write(prettyStableJson(result))
    return
  }
  console.log(`prefabs=${prefabs.length} entities=${entities.length}`)
  for (const p of prefabs) {
    const kind = p.kind === 'custom-definition' ? '自定义元件' : '官方元件'
    const res = p.resourceId !== undefined ? ` resource=${p.resourceId}` : ''
    console.log(`prefab id=${p.id} name=${p.name ?? '-'} kind=${kind}${res}`)
  }
  for (const e of entities) {
    console.log(`entity id=${e.id} name=${e.name} definitionId=${e.definitionId} resourceId=${e.resourceId ?? '-'}`)
  }
}

export async function runAssetsResources(
  argv: readonly string[] = process.argv.slice(2),
  cfg?: GstsConfig
): Promise<void> {
  const args = parseArgs(argv)
  let config = cfg
  if (!config) {
    config = await loadGstsConfig('gsts.config.ts', { profile: 'project' }).catch(() => undefined)
  }
  await runList(args, config)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsResources().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  })
}
