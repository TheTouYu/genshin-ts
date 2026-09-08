import { readGilPayloadFields } from '/home/h/genshin-ts/src/cli/gil_extract_utils.js'
import { parseWireMessage, type WireField } from '/home/h/genshin-ts/src/cli/static_assembly/wire.js'
const gil=process.argv[2], sid=Number(process.argv[3])
const {payload}=readGilPayloadFields(gil)
const root=parseWireMessage(payload as unknown as Uint8Array)!
function vi(fs:WireField[],n:number){ return fs.find(f=>f.number===n&&f.wire===0)?.value as number|undefined }
function hex(u:Uint8Array){ return Buffer.from(u).toString('hex') }
const cont=root.find(f=>f.number===15&&f.wire===2)!
const inner=parseWireMessage(cont.value as Uint8Array)!
const rec=inner.find(f=>f.wire===2&&f.number===1&&vi(parseWireMessage(f.value as Uint8Array)!,1)===sid)!
const r=parseWireMessage(rec.value as Uint8Array)!
for (const sec of r.filter(f=>f.wire===2&&f.number===4)) {
  const s=parseWireMessage(sec.value as Uint8Array)!
  if (vi(s,1)!==6) continue
  const c21=parseWireMessage(s.find(f=>f.number===21&&f.wire===2)!.value as Uint8Array)!
  const cfg=parseWireMessage(c21.find(f=>f.number===1&&f.wire===2)!.value as Uint8Array)!
  const effC=parseWireMessage(cfg.find(f=>f.number===3&&f.wire===2)!.value as Uint8Array)!
  for (const e of effC.filter(f=>f.number===1&&f.wire===2)) {
    const ef=parseWireMessage(e.value as Uint8Array)!
    const eid=vi(ef,1)
    if (eid===2110001 || eid===2180001) console.log(`${eid}\t${hex(e.value as Uint8Array)}`)
  }
}
