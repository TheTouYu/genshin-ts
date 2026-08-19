import { pathToFileURL } from 'node:url'

type GadgetItem = {
  list_id: number
  name: string
  size_x?: number
  size_y?: number
  size_z?: number
}

function usage(exitCode = 1): never {
  console.error(
    [
      'Query official gadget/prefab entity data (装饰物实体库) from the public Miliastra data API.',
      '',
      'Usage: gsts assets:gadgets search --name <中文名> [--limit <n>]',
      '       gsts assets:gadgets get --id <list_id>',
      '',
      'Options:',
      '  --name <name>   search by Chinese name',
      '  --id <id>       query by list id',
      '  --limit <n>     max results (default 20)',
      '  --format json   output as JSON'
    ].join('\n')
  )
  process.exit(exitCode)
}

async function api(path: string): Promise<any> {
  const res = await fetch(`https://ugc.070077.xyz${path}`, { headers: { Accept: 'application/json' } })
  return res.json()
}

export async function runAssetsGadgets(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  let command = 'search'
  let name: string | undefined
  let id: number | undefined
  let limit = 20
  let format: 'text' | 'json' = 'text'
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === 'search' || a === 'get') command = a
    else if (a === '--name') name = argv[++i]
    else if (a === '--id') id = Number(argv[++i])
    else if (a === '--limit') limit = Number(argv[++i])
    else if (a === '--format') {
      const r = argv[++i]
      if (r !== 'text' && r !== 'json') throw new Error('[error] --format must be text or json')
      format = r
    } else if (a === '--help' || a === '-h') usage(0)
    else usage()
  }
  if (command === 'search' && !name) throw new Error('[error] search requires --name')
  if (command === 'get' && id === undefined) throw new Error('[error] get requires --id')

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
    console.log(JSON.stringify({ schemaVersion: 1, kind: 'gadgets-' + command, items }, null, 2))
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
