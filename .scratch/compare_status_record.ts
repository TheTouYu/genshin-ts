import { readGilPayloadFields } from '/home/h/genshin-ts/src/cli/gil_extract_utils.js'
import { parseWireMessage, type WireField } from '/home/h/genshin-ts/src/cli/static_assembly/wire.js'

const [a,b,sidStr] = process.argv.slice(2)
const sid = Number(sidStr)
function vi(fs:WireField[],n:number){ return fs.find(f=>f.number===n&&f.wire===0)?.value as number|undefined }
function hex(u:Uint8Array){ return Buffer.from(u).toString('hex') }
function getRecord(path:string, rootN:number){
  const {payload}=readGilPayloadFields(path)
  const root=parseWireMessage(payload as unknown as Uint8Array)!
  const cont=root.find(f=>f.number===rootN&&f.wire===2)!
  const inner=parseWireMessage(cont.value as Uint8Array)!
  const rec=inner.find(f=>f.wire===2&&f.number===1&&vi(parseWireMessage(f.value as Uint8Array)!,1)===sid)!
  return hex(rec.value as Uint8Array)
}
for (const rootN of [15,16]) {
  const ha=getRecord(a,rootN), hb=getRecord(b,rootN)
  console.log(`root${rootN} editor  len=${ha.length/2} hex=${ha}`)
  console.log(`root${rootN} cli     len=${hb.length/2} hex=${hb}`)
  console.log(`root${rootN} equal=${ha===hb}`)
}
