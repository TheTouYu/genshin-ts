#!/usr/bin/env npx tsx
// 新地图基线 folder 记录补齐（2026-08-30 手段3轮实证沉淀）
//
// 背景：maps:create 最小骨架没有编辑器基线的 folder「未分类页签」记录——
// assets:node-graphs create --type（20002/20010 等）与 assets:skill-config create
// 都会因缺 folder 记录 fail closed / 报错（folderId 12/14/61/67/68 等）。
// folder 记录是类型级常量空模板（参考图逐字节一致，docs/game-engine-knowledge/node-graphs.md
// 「客户端图 20010 wire 配方」节 folderId 表）。
//
// 用法：npx tsx ensure-folders.ts <地图.gil> <folderId...>
//   例：npx tsx ensure-folders.ts /path/1073741916.gil 14 68
// 行为：缺失的 folderId 按空模板插入（已存在跳过）；备份到 .gsts/backups/；
//       写回后同步 Temp/<mapId>.gil；候选先落 /tmp 回读后才写回。
// 验证史：1073741916 建图链（folder 12/14/61/67/68 补齐 → 20002 图 + 6 模板技能配置创建成功）。
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs'
import { parseWireMessage, emitWireMessage } from '../../../../../src/cli/static_assembly/wire.js'
import { buildFile } from '../../../../../src/injector/binary.js'
import { createHash } from 'crypto'

const GIL = process.argv[2]
const WANT = process.argv.slice(3).map(Number).filter((n) => Number.isSafeInteger(n))
if (!GIL || WANT.length === 0) {
  console.error('用法: npx tsx ensure-folders.ts <地图.gil> <folderId...>')
  process.exit(1)
}
const sha = (b: Uint8Array | Buffer) => createHash('sha256').update(b).digest('hex')

const bytes = new Uint8Array(readFileSync(GIL))
const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const header = {
  schema: dv.getUint32(4, false), headTag: dv.getUint32(8, false),
  fileType: dv.getUint32(12, false), tailTag: dv.getUint32(bytes.length - 4, false)
}
const root = parseWireMessage(bytes.slice(20, -4))!
const r6Field = root!.find((f) => f.number === 6 && f.wire === 2)
if (!r6Field) throw new Error('[error] root6 缺失（地图无 folder 容器，先建一张任意图）')
const inner = parseWireMessage(r6Field.value as Uint8Array)!
function folderIdOf(rec: any): number | undefined {
  return parseWireMessage(rec.value as Uint8Array)!.find((f) => f.number === 1 && f.wire === 0)?.value
}
const existing = new Set(inner!.filter((f) => f.number === 1 && f.wire === 2).map(folderIdOf))
console.log('existing folders:', [...existing].sort((a, b) => (a ?? 0) - (b ?? 0)).join(','))

const additions: any[] = []
for (const id of WANT) {
  if (existing.has(id)) { console.log('folder', id, 'exists, skip'); continue }
  const rec = emitWireMessage([
    { number: 1, wire: 0, value: id },
    { number: 2, wire: 2, value: emitWireMessage([
      { number: 1, wire: 2, value: new TextEncoder().encode('root') },
      { number: 3, wire: 0, value: 1 }
    ]!) },
    { number: 3, wire: 2, value: emitWireMessage([
      { number: 1, wire: 2, value: new TextEncoder().encode('未分类页签') },
      { number: 3, wire: 0, value: 2 }
    ]!) }
  ]!)
  additions.push({ number: 1, wire: 2, value: rec })
  console.log('add folder', id, 'len', rec.length)
}
if (!additions.length) { console.log('nothing to add'); process.exit(0) }

const nextR6 = emitWireMessage([...inner!, ...additions])!
const nextRoot = root!.map((f) => (f === r6Field ? { ...f, value: nextR6 } : f))
const out = buildFile(emitWireMessage(nextRoot as any)!, header)
// 候选回读
const cids = parseWireMessage(new Uint8Array(out).slice(20, -4))!.find((f) => f.number === 6 && f.wire === 2)!
const cl = parseWireMessage(cids.value as Uint8Array)!.filter((f) => f.number === 1 && f.wire === 2).map(folderIdOf)
console.log('candidate folders:', cl.sort((a, b) => (a ?? 0) - (b ?? 0)).join(','))
if (!WANT.every((id) => cl.includes(id))) throw new Error('[error] 回读缺 folder，中止')

const srcSha = sha(bytes)
const backupDir = GIL.slice(0, GIL.lastIndexOf('/')) + '/.gsts/backups'
mkdirSync(backupDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backup = `${backupDir}/${GIL.split('/').pop()}.${stamp}.ensure-folders.bak`
if (sha(new Uint8Array(readFileSync(GIL))) !== srcSha) throw new Error('source changed, abort')
copyFileSync(GIL, backup)
writeFileSync(GIL, out)
const temp = GIL.replace('/Beyond_Local_Save_Level/', '/Temp/')
try { copyFileSync(GIL, temp); console.log('temp-synced:', temp) } catch { console.log('temp-sync skipped (no Temp dir)') }
console.log('backup=', backup)
console.log('written=', GIL, 'sha', sha(out).slice(0, 16))
