// 深挖单个 OfficialPrefab 文件：找名字所在（内嵌 UTF-8 / 大 hash varint）
import { readFileSync } from 'node:fs'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

const file = process.argv[2]
const dec = Buffer.from(readFileSync(file).map((b) => b ^ 0xe5))
const top = parseWireMessage(dec)

const CJK = /[\u4e00-\u9fff]/
const walk = (fields: any[], path: string) => {
  for (const f of fields) {
    const p = `${path}.${f.number}`
    if (f.wire === 2) {
      const s = Buffer.from(f.value).toString('utf8')
      if (CJK.test(s) && s.length < 60) console.log(`${p} STR "${s}"`)
      try {
        const n = parseWireMessage(f.value)
        if (n.length) walk(n, p)
      } catch { /* not message */ }
    } else if (f.wire === 0 && f.value > 1e12) console.log(`${p} VARINT ${f.value}`)
  }
}
walk(top, '')
console.log('--- top-level fields:', top.map((f) => `f${f.number}(w${f.wire},${f.wire === 2 ? f.value.length + 'B' : f.value})`).join(' '))
