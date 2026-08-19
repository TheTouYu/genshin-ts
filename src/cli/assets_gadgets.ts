import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { runAssetsEntities } from './assets_entities.js'
import { prettyStableJson } from './static_assembly/json.js'

type GadgetItem = {
  list_id: number
  name: string
  size_x?: number
  size_y?: number
  size_z?: number
}

type Command = 'search' | 'get' | 'create-entity'

function usage(exitCode = 1): never {
  console.error(
    [
      'Query official gadget/prefab entity data (装饰物实体库) from the public Miliastra data API.',
      '',
      'Usage: gsts assets:gadgets search --name <中文名> [--limit <n>]',
      '       gsts assets:gadgets get --id <list_id>',
      '       gsts assets:gadgets create-entity --id <list_id> --gil <map.gil> [--name <n>]',
      '            [--position x,y,z] [--scale x,y,z] [--output <file> | --write]',
      '',
      'Options:',
      '  --name <name>   search by Chinese name / override entity name',
      '  --id <id>       query or create by gadget list id (元件 id)',
      '  --limit <n>     max results (default 20)',
      '  --gil <file>    source GIL for create-entity',
      '  --position x,y,z  entity position (create-entity)',
      '  --scale x,y,z     entity scale (create-entity)',
      '  --output <file> create candidate without overwriting',
      '  --write         write source GIL after backup',
      '  --format json   output as JSON'
    ].join('\n')
  )
  process.exit(exitCode)
}

function value(argv: readonly string[], i: number): string {
  const r = argv[i + 1]
  if (!r || r.startsWith('--')) usage()
  return r
}

function num(raw: string, opt: string): number {
  const n = Number(raw)
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`[error] ${opt} must be a non-negative safe integer`)
  return n
}

function vector(raw: string, opt: string): [number, number, number] {
  const parts = raw.split(',')
  if (parts.length !== 3) throw new Error(`[error] ${opt} must be x,y,z`)
  const values = parts.map((part) => Number(part))
  if (values.some((v) => !Number.isFinite(v))) throw new Error(`[error] ${opt} must contain numbers`)
  return [values[0], values[1], values[2]]
}

async function api(path: string): Promise<any> {
  const res = await fetch(`https://ugc.070077.xyz${path}`, { headers: { Accept: 'application/json' } })
  return res.json()
}

async function fetchGadget(id: number): Promise<GadgetItem> {
  const d = await api(`/api/v1/data/gadgets?id=${id}`)
  if (d.detail) throw new Error(d.detail)
  if (!d.success || !d.data?.items?.length) throw new Error(`[error] gadget not found: ${id}`)
  return d.data.items[0] as GadgetItem
}

async function runCreateEntity(
  id: number,
  opts: {
    name?: string
    position?: [number, number, number]
    scale?: [number, number, number]
    gilPath: string
    outputPath?: string
    write: boolean
    format: 'text' | 'json'
  }
): Promise<void> {
  const item = await fetchGadget(id)
  const entity: Record<string, unknown> = {
    name: opts.name || item.name,
    definitionId: item.list_id
  }
  if (opts.position) entity.position = opts.position
  if (opts.scale) entity.scale = opts.scale
  const tempJson = path.join(os.tmpdir(), `gsts-gadget-${process.pid}-${Date.now()}.json`)
  fs.writeFileSync(tempJson, prettyStableJson({ schemaVersion: 1, entities: [entity] }))
  try {
    const entityArgs = ['import', '--entities', tempJson, '--gil', opts.gilPath]
    if (opts.outputPath) entityArgs.push('--output', opts.outputPath)
    if (opts.write) entityArgs.push('--write')
    if (opts.format === 'json') entityArgs.push('--format', 'json')
    await runAssetsEntities(entityArgs)
  } finally {
    fs.rmSync(tempJson, { force: true })
  }
}

export async function runAssetsGadgets(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  let command: Command = 'search'
  let name: string | undefined
  let id: number | undefined
  let limit = 20
  let gilPath: string | undefined
  let outputPath: string | undefined
  let write = false
  let position: [number, number, number] | undefined
  let scale: [number, number, number] | undefined
  let format: 'text' | 'json' = 'text'
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === 'search' || a === 'get' || a === 'create-entity') command = a
    else if (a === '--name') name = value(argv, i++)
    else if (a === '--id') id = num(value(argv, i++), '--id')
    else if (a === '--limit') limit = num(value(argv, i++), '--limit')
    else if (a === '--gil') gilPath = value(argv, i++)
    else if (a === '--output') outputPath = value(argv, i++)
    else if (a === '--write') write = true
    else if (a === '--position') position = vector(value(argv, i++), '--position')
    else if (a === '--scale') scale = vector(value(argv, i++), '--scale')
    else if (a === '--format') {
      const r = value(argv, i++)
      if (r !== 'text' && r !== 'json') throw new Error('[error] --format must be text or json')
      format = r
    } else if (a === '--help' || a === '-h') usage(0)
    else usage()
  }
  if (command === 'search' && !name) throw new Error('[error] search requires --name')
  if (command === 'get' && id === undefined) throw new Error('[error] get requires --id')
  if (command === 'create-entity') {
    if (id === undefined) throw new Error('[error] create-entity requires --id')
    if (!gilPath) throw new Error('[error] create-entity requires --gil <map.gil>')
    if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
    return runCreateEntity(id, { name, position, scale, gilPath, outputPath, write, format })
  }

  let items: GadgetItem[] = []
  if (command === 'search') {
    const d = await api(`/api/v1/data/gadgets?name=${encodeURIComponent(name!)}&limit=${limit}&offset=0`)
    if (!d.success) throw new Error(d.detail || '[error] query failed')
    items = d.data.items
  } else {
    const d = await api(`/api/v1/data/gadgets?id=${id}`)
    if (d.detail) throw new Error(d.detail)
    if (d.success) items = d.data.items
  }
  if (format === 'json') {
    process.stdout.write(prettyStableJson({ schemaVersion: 1, kind: 'gadgets-' + command, items }))
  } else {
    for (const it of items) {
      const s = [it.size_x, it.size_y, it.size_z].filter((v): v is number => v !== undefined).join('x')
      console.log(`id=${it.list_id} name=${it.name}${s ? ` size=${s}` : ''}`)
    }
    if (items.length === 0) console.log('(no results)')
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsGadgets().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
}
