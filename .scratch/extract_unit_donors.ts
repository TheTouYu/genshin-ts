import { readGilPayloadFields } from '/home/h/genshin-ts/src/cli/gil_extract_utils.js'
import { parseWireMessage, type WireField } from '/home/h/genshin-ts/src/cli/static_assembly/wire.js'
import fs from 'node:fs'

const gil = process.argv[2]
const baseId = Number(process.argv[3] ?? 1077936147)
const outPath = process.argv[4] ?? '/home/h/genshin-ts/.scratch/unit_status_donors.json'
const { payload } = readGilPayloadFields(gil)
const root = parseWireMessage(payload as unknown as Uint8Array)!
function vi(fs: WireField[], n:number){ return fs.find(f=>f.number===n && f.wire===0)?.value as number|undefined }
function hex(u:Uint8Array){ return Buffer.from(u).toString('hex') }
function statusRecords(topNum:number){
  const top = root.find(f=>f.number===topNum && f.wire===2)!
  return parseWireMessage(top.value as Uint8Array)!.filter(f=>f.wire===2 && f.number===1).map(f=>({field:f, inner:parseWireMessage(f.value as Uint8Array)!}))
}
function findRecord(topNum:number, id:number){ return statusRecords(topNum).find(r=>vi(r.inner,1)===id)! }
const r15rec = findRecord(15, baseId)
const r16rec = findRecord(16, baseId)
function getEffectEntries(inner: WireField[], sectionNumber: number): {eid:number, hex:string}[] {
  const out: {eid:number, hex:string}[] = []
  for (const sec of inner.filter(f=>f.wire===2 && f.number===sectionNumber)) {
    const s=parseWireMessage(sec.value as Uint8Array)!
    if (vi(s,1)!==6) continue
    const c21=parseWireMessage(s.find(f=>f.number===21&&f.wire===2)!.value as Uint8Array)!
    const cfg=parseWireMessage(c21.find(f=>f.number===1&&f.wire===2)!.value as Uint8Array)!
    const effC=parseWireMessage(cfg.find(f=>f.number===3&&f.wire===2)!.value as Uint8Array)!
    for (const e of effC.filter(f=>f.number===1&&f.wire===2)) {
      const ef=parseWireMessage(e.value as Uint8Array)!
      const eid=vi(ef,1)
      if (eid!==undefined) out.push({eid, hex:hex(e.value as Uint8Array)})
    }
  }
  return out
}
const donors: Record<number, {statusId:number, hex:string}[]> = {}
for (const rec of statusRecords(15)) {
  const id = vi(rec.inner,1)!
  for (const e of getEffectEntries(rec.inner,4)) {
    (donors[e.eid] ??= []).push({statusId:id, hex:e.hex})
  }
}
const out = {
  source: gil,
  baseStatusId: baseId,
  baseR15: hex(r15rec.field.value as Uint8Array),
  baseR16: hex(r16rec.field.value as Uint8Array),
  effectDonors: Object.fromEntries(Object.entries(donors).map(([eid, arr]) => [eid, arr.sort((a,b)=>a.statusId-b.statusId)]))
}
fs.writeFileSync(outPath, JSON.stringify(out,null,2))
console.log('baseR15 len', out.baseR15.length/2, 'baseR16 len', out.baseR16.length/2)
console.log('effect ids', Object.keys(out.effectDonors).length)
