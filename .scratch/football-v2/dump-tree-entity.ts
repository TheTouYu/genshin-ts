// 读用户新增实体（乔木）的完整 wire + OfficialPrefab f2 是否含尺寸浮点
import { readFileSync } from 'node:fs'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

const dec = (p: string) => parseWireMessage(Buffer.from(readFileSync(p).map((b) => b ^ 0xe5)))

// 1) 地图 top5 实体记录里找 20001200 引用
const bytes = readFileSync('/tmp/tree-diff.gil')
const payload = bytes.slice(20, -4)
const top = parseWireMessage(payload)
const TARGET = 20001200n
const fmtHex = (b: Uint8Array) => Buffer.from(b).toString('hex')
for (const field of top) {
  if (field.number !== 5) continue
  const recs = parseWireMessage(field.value)
  for (const r of recs) {
    const inner = parseWireMessage(r.value)
    const raw = Buffer.from(r.value).toString('hex')
    // varint 20001200 = 0xC1A981 09? 计算字节序：直接搜编码后的 varint
    let v = TARGET, varint = []
    do { let byte = Number(v & 0x7fn); v >>= 7n; if (v) byte |= 0x80; varint.push(byte) } while (v)
    const vi = Buffer.from(varint).toString('hex')
    if (raw.includes(vi)) {
      console.log('=== entity 记录命中', vi)
      const dump = (fields: any[], path: string, d = 0) => {
        for (const f of fields) {
          const p = `${path}.f${f.number}`
          if (f.wire === 2) {
            const s = Buffer.from(f.value).toString('utf8')
            const printable = /^[\x20-\x7e\u4e00-\u9fff]+$/.test(s)
            console.log(`${p} ${f.value.length}B${printable && s.length < 40 ? ` "${s}"` : ''}`)
            if (d < 2) { try { const n = parseWireMessage(f.value); if (n.length) dump(n, p, d + 1) } catch { /* leaf */ } }
          } else if (f.wire === 5 || f.wire === 1) {
            console.log(`${p} ${f.wire === 5 ? 'fixed32' : 'fixed64'} ${fmtHex(f.value)}`)
          } else console.log(`${p} varint ${f.value}`)
        }
      }
      dump(inner, '')
    }
  }
}

// 2) OfficialPrefab 乔木 20001200 文件 f2 里找浮点（尺寸）
console.log('\n=== OfficialPrefab f1=20001200 的 f2 浮点扫描')
import { readdirSync } from 'node:fs'
const pfDir = '/home/h/.ys/BeyondAssets/BeyondAssistEditor/Resource/Json/Beyond/Official/OfficialPrefab'
for (const f of readdirSync(pfDir)) {
  try {
    const t = dec(`${pfDir}/${f}`)
    const f1 = t.find((x) => x.number === 1 && x.wire === 0)
    if (Number(f1?.value) !== 20001200) continue
    console.log('file:', f)
    const f2 = t.find((x) => x.number === 2)
    const buf = Buffer.from(f2.value)
    const floats: number[] = []
    for (let i = 0; i + 4 <= buf.length; i++) {
      const v = buf.readFloatLE(i)
      if (Number.isFinite(v) && v > 0.05 && v < 200 && (Math.abs(v * 2 - Math.round(v * 2)) < 1e-6)) floats.push(v)
    }
    console.log('f2 len', buf.length, '候选尺寸浮点(去重):', [...new Set(floats.map((x) => Math.round(x * 10) / 10))].slice(0, 20).join(' '))
    break
  } catch { /* skip */ }
}
