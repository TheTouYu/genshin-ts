import { readFileSync } from 'node:fs'
import protobuf from 'protobufjs'
const { root } = protobuf.parse(readFileSync('src/cli/client_ui/gia_proto.proto', 'utf8'), { keepCase: false })
const RootType = root.lookupType('Root')
const buf = readFileSync(process.argv[2])
const obj = RootType.toObject(RootType.decode(buf.subarray(20, -4)), { enums: Number, defaults: false, arrays: true }) as any
for (const u of obj.graph || []) {
  if (!u.ui) continue
  const datas = u.ui.content?.data || []
  for (const d of datas) {
    const mp = d.details?.transform?.multiPlatform
    if (!mp) continue
    const pts = (mp.platforms || []).map((p: any) => p.platformType)
    console.log(`${u.name}: platforms=[${pts.join(',')}] field502=${mp.field502} field504=${mp.field504}`)
  }
}
