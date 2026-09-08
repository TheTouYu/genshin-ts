import { readGilPayloadFields } from '/home/h/genshin-ts/src/cli/gil_extract_utils.js'
import { parseWireMessage, type WireField } from '/home/h/genshin-ts/src/cli/static_assembly/wire.js'
const gil=process.argv[2], rid=Number(process.argv[3])
const {payload}=readGilPayloadFields(gil)
const root=parseWireMessage(payload as unknown as Uint8Array)!
const r6=parseWireMessage(root.find(f=>f.number===6&&f.wire===2)!.value as Uint8Array)!
function vi(fs:WireField[],n:number){return fs.find(f=>f.number===n&&f.wire===0)?.value as number|undefined}
const rec=r6.find(f=>f.wire===2&&f.number===1&&vi(parseWireMessage(f.value as Uint8Array)!,1)===rid)!
function hex(u:Uint8Array){return Buffer.from(u).toString('hex')}
function dump(fs:WireField[],indent=''){
  for(const f of fs){
    if(f.wire===0) console.log(indent+`f${f.number}=${f.value}`)
    else if(f.wire===2){
      const sub=parseWireMessage(f.value as Uint8Array)
      const t=Buffer.from(f.value as Uint8Array).toString('utf8')
      const printable=[...t].every(c=>c.charCodeAt(0)>=32||c==='\n'||c==='\r'||c==='\t')
      if(sub && sub.length>0 && !printable){
        console.log(indent+`f${f.number} msg len=${(f.value as Uint8Array).length}`)
        dump(sub,indent+'  ')
      } else {
        console.log(indent+`f${f.number} bytes len=${(f.value as Uint8Array).length} ${printable?'text='+JSON.stringify(t):'hex='+hex(f.value as Uint8Array)}`)
      }
    } else console.log(indent+`f${f.number} wire${f.wire} hex=${hex(f.value as Uint8Array)}`)
  }
}
dump(parseWireMessage(rec.value as Uint8Array)!)
