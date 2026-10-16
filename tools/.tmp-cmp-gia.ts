import { readFileSync } from 'node:fs'
import protobuf from 'protobufjs'
const { root } = protobuf.parse(readFileSync('/home/h/genshin-ts/src/cli/client_ui/gia_proto.proto', 'utf8'), { keepCase: false })
const RootType = root.lookupType('Root')
for (const p of process.argv.slice(2)) {
  const buf = readFileSync(p)
  console.log(`\n=== ${p.split('/').pop()} (${buf.length}B) header=${buf.subarray(0, 20).toString('hex')} tail=${buf.subarray(-4).toString('hex')}`)
  try {
    const payload = buf.subarray(20, buf.length - 4)
    const obj = RootType.toObject(RootType.decode(payload), { enums: Number, defaults: true, arrays: true }) as any
    console.log(`filePath=${JSON.stringify(obj.filePath)} modeFlag=${obj.modeFlag} gameVersion=${JSON.stringify(obj.gameVersion)} graph=${obj.graph?.length} accessories=${obj.accessories?.length}`)
    for (const u of obj.graph || []) {
      console.log(`  unit: name=${JSON.stringify(u.name)} which=${u.which} id=${JSON.stringify(u.id)} ui=${u.ui ? 'yes' : '-'} script=${u.script ? 'yes' : '-'} related=${(u.relatedIds||[]).length}`)
    }
  } catch (e) { console.log('decode FAIL:', (e as Error).message.slice(0, 80)) }
}
