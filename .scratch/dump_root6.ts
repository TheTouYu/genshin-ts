import { readGilPayloadFields } from '/home/h/genshin-ts/src/cli/gil_extract_utils.js'
import { parseWireMessage, type WireField } from '/home/h/genshin-ts/src/cli/static_assembly/wire.js'
const gil=process.argv[2]
const {payload}=readGilPayloadFields(gil)
const root=parseWireMessage(payload as unknown as Uint8Array)!
const r6=parseWireMessage(root.find(f=>f.number===6&&f.wire===2)!.value as Uint8Array)!
function hex(u:Uint8Array){return Buffer.from(u).toString('hex')}
function vi(fs:WireField[],n:number){return fs.find(f=>f.number===n&&f.wire===0)?.value as number|undefined}
function texts(fs:WireField[]):string[]{
  const out:string[]=[]
  for(const f of fs){
    if(f.wire===2){
      const t=Buffer.from(f.value as Uint8Array).toString('utf8')
      if([...t].every(c=>c.charCodeAt(0)>=32||c==='\n'||c==='\r'||c==='\t')) out.push(t)
      const sub=parseWireMessage(f.value as Uint8Array)
      if(sub) out.push(...texts(sub))
    }
  }
  return out
}
let i=0
for(const rec of r6.filter(f=>f.number===1&&f.wire===2)){
  const inner=parseWireMessage(rec.value as Uint8Array)!
  console.log('record',i++,'f1=',vi(inner,1),'f3?',vi(inner,3),'texts=',texts(inner).slice(0,5),'hex=',hex(rec.value as Uint8Array).slice(0,200))
}
