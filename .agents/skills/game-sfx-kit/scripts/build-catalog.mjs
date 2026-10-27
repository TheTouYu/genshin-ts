#!/usr/bin/env node
// build-catalog.mjs — 从官方 data.json（+ 可选中文名库）生成音效挑选网页用的 catalog.json
//
// 输出行形状：{ id, name, cat, catId, dur, named }
//   id   : 字符串数字（与 index.html 的 <audio src> 拼接用）
//   name : 中文名；无名条目回落 nameI18nKey 尾号，named=false
//   cat  : 中文类目名（环境/生物敌人叫声/角色动作/战斗/物件/界面音效/操控对象）
//   catId: 官方 category 1..7
//   dur  : 时长秒（number，来自 data.json 的 duration 字符串）
//   named: 是否在中文名库里找到（false = 只能按类目/时长/试听盲选）
//
// 用法：
//   node scripts/build-catalog.mjs --data /tmp/audio-data.json \
//     --library assets/sfx-library-full-20261027.md --out <网页目录>/catalog.json
//   node scripts/build-catalog.mjs --data /tmp/audio-data.json --out /tmp/catalog-full.json --all
//     （--all：输出全部 1997 条；缺省只输出有中文名的 1196 条，与历史 catalog.json 口径一致）
//   node scripts/build-catalog.mjs --data /tmp/audio-data.json --library ... --out ... --check
//     （--check：只比对磁盘现状与本次生成结果，不写盘，退出码 0=一致 / 1=有差异）

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL = resolve(HERE, '..')
const CAT_NAMES = { 1: '环境', 2: '生物敌人叫声', 3: '角色动作', 4: '战斗', 5: '物件', 6: '界面音效', 7: '操控对象' }

function parseArgs(argv) {
  const a = { data: '', library: '', out: '', all: false, check: false, pretty: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--all') a.all = true
    else if (k === '--check') a.check = true
    else if (k === '--pretty') a.pretty = true
    else if (k.startsWith('--')) a[k.slice(2)] = argv[++i]
    else throw new Error(`未知参数: ${k}`)
  }
  return a
}

function parseLibrary(path) {
  // 名库 md：`## <类目>（N 条…）` 分节，节内行格式 `| <id> | <名称> |`
  const md = readFileSync(path, 'utf8')
  const names = new Map()
  const sectionCat = new Map()
  let cur = null
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.+?)(?:（|\()/)
    if (h) { cur = h[1].trim(); sectionCat.set(cur, (sectionCat.get(cur) || 0) + 1); continue }
    const row = line.match(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*$/)
    if (row) names.set(row[1], { name: row[2], section: cur })
  }
  return names
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function build(opts) {
  const raw = JSON.parse(readFileSync(opts.data, 'utf8'))
  const items = Array.isArray(raw) ? raw : raw.data
  if (!Array.isArray(items) || items.length < 100) throw new Error(`${opts.data} 不像官方 data.json（items=${items?.length}）`)
  const names = opts.library && existsSync(opts.library) ? parseLibrary(opts.library) : new Map()

  const rows = []
  let missingName = 0
  for (const it of items) {
    const id = String(it.id)
    const dur = num(it.duration)
    const catId = it.category
    const hit = names.get(id)
    if (!hit) missingName++
    if (!opts.all && !hit) continue
    const defaultName = `未命名_${CAT_NAMES[catId] || 'cat' + catId}_${id}`
    rows.push({
      id,
      name: hit ? hit.name : defaultName,
      cat: CAT_NAMES[catId] || `cat${catId}`,
      catId,
      dur,
      named: Boolean(hit),
    })
  }
  rows.sort((x, y) => Number(x.id) - Number(y.id))

  const byCat = {}
  for (const r of rows) byCat[r.cat] = (byCat[r.cat] || 0) + 1
  const stats = {
    total: rows.length,
    named: rows.filter(r => r.named).length,
    unnamed: rows.filter(r => !r.named).length,
    byCat,
    durMissing: rows.filter(r => r.dur === null).length,
    missingNameInData: missingName,
  }
  return { rows, stats, dataTotal: items.length }
}

const opts = parseArgs(process.argv.slice(2))
opts.data ||= '/tmp/audio-data.json'
opts.library ||= resolve(SKILL, 'assets/sfx-library-full-20261027.md')
if (!opts.out) throw new Error('必须给 --out <catalog.json 路径>')

const { rows, stats, dataTotal } = build(opts)
const json = opts.pretty
  ? JSON.stringify(rows, null, 2)
  : JSON.stringify(rows) + '\n'

if (opts.check) {
  const cur = existsSync(opts.out) ? readFileSync(opts.out, 'utf8') : ''
  const same = cur.replace(/\s+$/g, '') === json.replace(/\s+$/g, '')
  console.log(`[build-catalog] --check ${same ? 'SAME' : 'DIFF'} 磁盘=${Buffer.byteLength(cur)}B` +
    ` 生成=${Buffer.byteLength(json)}B（字符 ${json.length}）`)
  process.exit(same ? 0 : 1)
}

writeFileSync(opts.out, json)
console.log(`[build-catalog] 写盘 ${opts.out}`)
console.log(`  条数 ${stats.total}（data.json 全量 ${dataTotal}，其中无名 ${stats.missingNameInData}）`)
console.log(`  有名 ${stats.named} / 无名回落 ${stats.unnamed} / 缺时长 ${stats.durMissing}`)
console.log(`  类目 ${Object.entries(stats.byCat).map(([k, v]) => `${k}=${v}`).join(' ')}`)
console.log(`  体积 ${Buffer.byteLength(json)} B（字符 ${json.length}）`)
