// 提取指定 GIL 中目标 NodeGraph 内指定 nodeIndex 节点的原始 wire bytes
// 用法: npx tsx scripts/extract-node-raw.ts <map.gil> <graphId> <nodeIndex> [--pins]
// 输出: 节点完整 raw hex；--pins 时进一步拆分 pins 数组各记录 hex
// 背景: 生产比对需要区分 protobuf index 字段缺失与显式 index=0，decode 层无法区分，
//       必须用本工具做 raw wire 断言（如 OutFlow i1 无 index = 0a 02 08 02 2B 形态）
import { readGilPayloadFields } from '../../../../src/cli/gil_extract_utils.js'
import { parseMessage, readVarint } from '../../../../src/injector/binary.js'

const [gilPath, graphIdText, nodeIndexText, flag] = process.argv.slice(2)
const graphId = String(graphIdText)
const wantIdx = String(nodeIndexText)

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

function topFields(buf: Uint8Array): { field: number; wire: number; data: Uint8Array; value: number | null }[] {
  const out: { field: number; wire: number; data: Uint8Array; value: number | null }[] = []
  let pos = 0
  while (pos < buf.length) {
    const k = readVarint(buf, pos)
    if (!k) break
    pos = k.next
    const field = k.value >> 3
    const wire = k.value & 7
    if (wire === 0) {
      const v = readVarint(buf, pos)
      if (!v) break
      pos = v.next
      out.push({ field, wire, data: new Uint8Array(), value: v.value })
    } else if (wire === 2) {
      const lv = readVarint(buf, pos)
      if (!lv) break
      pos = lv.next
      const len = Number(lv.value)
      out.push({ field, wire, data: buf.subarray(pos, pos + len), value: null })
      pos += len
    } else if (wire === 1) {
      out.push({ field, wire, data: buf.subarray(pos, pos + 8), value: null })
      pos += 8
    } else if (wire === 5) {
      out.push({ field, wire, data: buf.subarray(pos, pos + 4), value: null })
      pos += 4
    } else throw new Error(`unhandled wire ${wire}`)
  }
  return out
}

const { payload, fields } = readGilPayloadFields(gilPath)
const blobs: any[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields, {
  nodeGraphBlobFields: blobs
})

for (const b of blobs) {
  const t = topFields(payload.subarray(b.dataStart, b.dataEnd))
  const idField = t.find((f) => f.field === 1 && f.wire === 2)
  const idVal = idField ? topFields(idField.data).find((f) => f.field === 5 && f.wire === 0) : null
  if (!idVal || String(idVal.value) !== graphId) continue
  for (const nf of t.filter((f) => f.field === 3 && f.wire === 2)) {
    const m = topFields(nf.data)
    if (!m.find((f) => f.field === 1 && String(f.value) === wantIdx)) continue
    console.log(`node ${wantIdx} raw hex:`)
    console.log(hex(nf.data))
    if (flag === '--pins') {
      const pins = m.filter((f) => f.field === 4 && f.wire === 2)
      if (!pins.length) {
        console.log('(no pins field on wire)')
      } else {
        pins.forEach((pin, i) => {
          console.log(`--- pin[${i}] field=4 len=${pin.data.length} ---`)
          console.log(hex(pin.data))
        })
      }
    }
    process.exit(0)
  }
}
console.error(`node ${wantIdx} not found in graph ${graphId}`)
process.exit(1)
