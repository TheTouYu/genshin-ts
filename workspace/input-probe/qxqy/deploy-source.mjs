#!/usr/bin/env node
// deploy-source.mjs — 把探针 lua 源码部署进真机地图 1073741829 的脚本登记表 + external_lua_file
// 用法: node deploy-source.mjs <lua源文件> [--map 1073741829] [--script main] [--dry]
//
// 做三件事（wire 依据 2026-10-16 差分定谳，见 docs/production-plan.md）:
//  1. .gil root50[1] 登记表：目标脚本条目 f5:source ← 新源码（整条 root50[1] 重编码替换）
//  2. external_lua_file/default_import_file/lua-sync-test/<script>.lua ← 新源码
//  3. Temp 同步副本
// 备份: 写回前 .gil 复制到同目录 .bak-<ts>
import { readFileSync, writeFileSync, copyFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

const args = process.argv.slice(2)
const srcFile = args[0]
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const MAP = flag('--map') ?? '1073741829'
const SCRIPT_NAME = flag('--script') ?? 'main'
const DRY = args.includes('--dry')
const GIL_OVERRIDE = flag('--gil') // 测试用: 直接指定 .gil 文件路径
if (!srcFile) { console.error('usage: deploy-source.mjs <lua> [--map id] [--script name] [--gil path] [--dry]'); process.exit(1) }

const SL = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level'
const GIL = GIL_OVERRIDE ?? join(SL, MAP, `${MAP}.gil`)
const EXT = join(SL, MAP, 'external_lua_file', 'default_import_file', 'lua-sync-test', `${SCRIPT_NAME}.lua`)
const TEMP = join(dirname(SL), '..', 'Temp', `${MAP}.gil`)
const src = readFileSync(srcFile, 'utf8')

// ---- protobuf helpers (varint / LEN 读写) ----
function readVarintAt(buf, off) { let r = 0n, s = 0n, i = off; for (;;) { const b = buf[i++]; r |= BigInt(b & 0x7f) << s; if (!(b & 0x80)) break; s += 7n } return [r, i] }
function writeVarint(v) { const out = []; let x = BigInt(v); do { let b = Number(x & 0x7fn); x >>= 7n; if (x) b |= 0x80; out.push(b) } while (x); return Buffer.from(out) }
function tag(field, wire) { return writeVarint((BigInt(field) << 3n) | BigInt(wire)) }

// 解析顶层字段: 返回 [{field, start(含tag), dataStart, dataEnd(不含)}]
function parseTop(buf) {
  const out = []; let i = 0
  while (i < buf.length) {
    const t0 = i; const [t, j] = readVarintAt(buf, i); const field = Number(t >> 3n), wire = Number(t & 7n)
    let end = j
    if (wire === 2) { const [l, k] = readVarintAt(buf, j); end = k + Number(l) }
    else if (wire === 0) { const [, k] = readVarintAt(buf, j); end = k }
    else throw new Error(`wire ${wire} unsupported @${i}`)
    out.push({ field, wire, start: t0, dataStart: wire === 2 ? end - Number(readVarintAt(buf, j)[0]) : undefined, dataEnd: end })
    i = end
  }
  return out
}

const gil = readFileSync(GIL)
const header = gil.subarray(0, 20), footer = gil.subarray(gil.length - 4)
const payload = gil.subarray(20, gil.length - 4)
const tops = parseTop(payload)
// root50 条目们（可能多条）
const r50s = tops.filter(t => t.field === 50)
if (!r50s.length) { console.error('no root50'); process.exit(1) }
// 登记表 = 顶层最后一条 f50（2026-10-16 实证：唯一一条，位于 payload 尾部 @24000 len237）
const reg = r50s[r50s.length - 1]
const regBytes = payload.subarray(reg.dataStart, reg.dataEnd)
const regFields = parseTop(regBytes)
// f1 条目是单层包装: entry = f1{LEN: {f1:guid, f2:name, f3:path, f5:source}} (D260 wire 定谳)
function decodeScriptEntry(entry) {
  const wrap = parseTop(entry)
  const w1 = wrap.find(x => x.field === 1 && x.wire === 2)
  if (!w1) return null
  const body = entry.subarray(w1.dataStart, w1.dataEnd)
  return { body, subs: parseTop(body) }
}
function entryName(entry) {
  const d = decodeScriptEntry(entry)
  if (!d) return '?'
  const n = d.subs.find(s => s.field === 2)
  return n ? d.body.subarray(n.dataStart, n.dataEnd).toString('utf8') : '?'
}
let hit = null
for (const f of regFields) {
  if (f.field !== 1) continue
  const entry = regBytes.subarray(f.start, f.dataEnd)
  if (entryName(entry) === SCRIPT_NAME && !hit) hit = { entry }
}
if (!hit) { console.error(`script "${SCRIPT_NAME}" not found; names: ` + regFields.filter(f => f.field === 1).map(f => entryName(regBytes.subarray(f.start, f.dataEnd))).join(',')); process.exit(1) }
const decoded = decodeScriptEntry(hit.entry)
const body = decoded.body

// 重编码: body 内 f5 替换为新源码, 其余字段原样
let newBody = Buffer.alloc(0)
for (const s of decoded.subs) {
  const chunk = body.subarray(s.start, s.dataEnd)
  if (s.field === 5) {
    newBody = Buffer.concat([newBody, tag(5, 2), writeVarint(Buffer.byteLength(src, 'utf8')), Buffer.from(src, 'utf8')])
  } else newBody = Buffer.concat([newBody, chunk])
}
const newEntry = Buffer.concat([tag(1, 2), writeVarint(newBody.length), newBody])

// 重组登记表容器: 按 regFields 原顺序, 命中项换 newEntry, 其余字段原字节
let newReg = Buffer.alloc(0)
let did = false
for (const f of regFields) {
  const isHit = f.field === 1 && !did && entryName(regBytes.subarray(f.start, f.dataEnd)) === SCRIPT_NAME
  if (isHit) { newReg = Buffer.concat([newReg, newEntry]); did = true }
  else newReg = Buffer.concat([newReg, regBytes.subarray(f.start, f.dataEnd)])
}
// 重组 payload: 用新登记表段替换原 f50 段
const before = payload.subarray(0, reg.start)
const after = payload.subarray(reg.dataEnd)
const newPayload = Buffer.concat([before, tag(50, 2), writeVarint(newReg.length), newReg, after])
const newGil = Buffer.concat([header, newPayload, footer])
console.log(`registry entry "${SCRIPT_NAME}": ${hit.entry.length}B -> ${newEntry.length}B (lua ${Buffer.byteLength(src, 'utf8')}B)`)
console.log(`.gil: ${gil.length}B -> ${newGil.length}B`)
if (DRY) { console.log('dry-run, no write'); process.exit(0) }

// 备份+写回+Temp同步
const ts = new Date().toISOString().replace(/[:.]/g, '-')
copyFileSync(GIL, join(dirname(GIL), `${MAP}.gil.bak-${ts}`))
writeFileSync(GIL, newGil)
try { if (statSync(TEMP)) writeFileSync(TEMP, newGil) } catch { /* Temp 不存在则跳过 */ }
// external lua 同步（--gil 测试模式跳过；带 UTF-8 BOM 对齐编辑器导出行为）
try {
  if (!GIL_OVERRIDE) {
    mkdirSync(dirname(EXT), { recursive: true })
    writeFileSync(EXT, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(src, 'utf8')]))
    console.log(`external: ${EXT} written (+BOM)`)
  }
} catch (e) { console.error(`external write failed: ${e.message}`) }
console.log('done. 备份已落同目录 .bak-*')
