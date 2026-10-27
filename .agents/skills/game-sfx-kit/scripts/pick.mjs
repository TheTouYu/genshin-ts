#!/usr/bin/env node
// pick.mjs — 选型查询器：按类目 / 时长窗 / 关键词挑音效候选（SKILL.md §3 的执行体）
//
// 用法（在仓库根或任意目录跑都行，脚本自带路径解析）：
//   node scripts/pick.mjs --cat 6 --max-dur 0.18            # 移动/旋转档：界面音效里 180ms 以内
//   node scripts/pick.mjs --cat 6 --dur 0.3-1.0             # 落地/点击档：闭区间
//   node scripts/pick.mjs --grep 点击_轻 --max-dur 0.2       # 按中文名关键词
//   node scripts/pick.mjs --grep 结束 --cat 6 --max-dur 1.0
//   node scripts/pick.mjs --id 50884                        # 查单条（名字+时长+类目）
//   node scripts/pick.mjs --cat 6 --limit 40 --json          # 机读输出
//
// --cat 取 1..7 数字或中文名（环境/生物/角色动作/战斗/物件/界面/操控 均可模糊匹配）。
// 预算窗可用 --budget move|lock|clear|over 直接套 SKILL.md §3.1 的表。

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL = resolve(HERE, '..')
const INDEX = resolve(SKILL, 'assets/audio-index.json')
const LIBRARY = resolve(SKILL, 'assets/sfx-library-full-20261027.md')

const BUDGETS = {
  move: { lo: 0.05, hi: 0.18, why: '移动/旋转/悬停：高频动作，超过 200ms 会连成一片' },
  lock: { lo: 0.30, hi: 1.00, why: '落地/锁定/点击确认：1s 以上会盖住下一个动作' },
  clear: { lo: 0.50, hi: 2.00, why: '消行/奖励/成功：低于 0.5s 像点击，高于 2s 会盖住下一手' },
  over: { lo: 0.00, hi: 1.00, why: '结束/失败：结算页同帧播，长音效会拖到尾' },
}
const CAT_ALIAS = { 环境: 1, 生物: 2, 生物敌人叫声: 2, 角色: 3, 角色动作: 3, 战斗: 4, 物件: 5, 界面: 6, 界面音效: 6, 操控: 7, 操控对象: 7 }

function parseArgs(argv) {
  const a = { cat: null, dur: null, minDur: null, maxDur: null, grep: '', id: null, budget: null, limit: 20, json: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--json') a.json = true
    else if (k.startsWith('--')) {
      const key = k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      a[key] = argv[++i]
    } else throw new Error(`未知参数: ${k}`)
  }
  return a
}

function loadNames() {
  const m = new Map()
  if (!existsSync(LIBRARY)) return m
  for (const line of readFileSync(LIBRARY, 'utf8').split('\n')) {
    const r = line.match(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*$/)
    if (r) m.set(r[1], r[2])
  }
  return m
}

const args = parseArgs(process.argv.slice(2))
const data = JSON.parse(readFileSync(INDEX, 'utf8'))
const names = loadNames()
const CAT = data._categories

let catId = null
if (args.cat != null) {
  const v = String(args.cat)
  if (/^\d+$/.test(v)) catId = Number(v)
  else {
    const hit = Object.keys(CAT_ALIAS).find(k => k.includes(v) || v.includes(k))
    if (!hit) throw new Error(`--cat 认不出「${v}」，可用：1..7 或 ${Object.keys(CAT_ALIAS).join('/')}`)
    catId = CAT_ALIAS[hit]
  }
}

let lo = args.minDur != null ? Number(args.minDur) : null
let hi = args.maxDur != null ? Number(args.maxDur) : null
if (args.dur) {
  const m = String(args.dur).match(/^([\d.]+)\s*-\s*([\d.]+)$/)
  if (!m) throw new Error(`--dur 要写成 lo-hi，例如 0.3-1.0（收到「${args.dur}」）`)
  lo = Number(m[1]); hi = Number(m[2])
}
let budgetNote = ''
if (args.budget) {
  const b = BUDGETS[args.budget]
  if (!b) throw new Error(`--budget 只支持 ${Object.keys(BUDGETS).join('/')}`)
  lo = lo ?? b.lo; hi = hi ?? b.hi
  budgetNote = `${args.budget} 预算 ${b.lo}~${b.hi}s —— ${b.why}`
}

const kw = String(args.grep || '').trim().toLowerCase()
const rows = []
for (const [id, [cid, dur]] of Object.entries(data.ids)) {
  if (args.id != null && id !== String(args.id)) continue
  if (catId != null && cid !== catId) continue
  if (lo != null && dur < lo) continue
  if (hi != null && dur > hi) continue
  const name = names.get(id)
  if (kw && !(name && name.toLowerCase().includes(kw)) && !id.includes(kw)) continue
  rows.push({ id, dur, catId: cid, cat: CAT[cid], name: name || null })
}
rows.sort((a, b) => a.dur - b.dur)
const total = rows.length
const out = rows.slice(0, Number(args.limit))

if (args.json) {
  console.log(JSON.stringify({ total, filters: { catId, lo, hi, kw, budget: args.budget }, rows: out }, null, 2))
} else {
  if (budgetNote) console.log(`# ${budgetNote}`)
  console.log(`# 匹配 ${total} 条，显示 ${out.length}（按时长升序）`)
  for (const r of out) {
    const nm = r.name || `（无名）${r.cat}`
    console.log(`${r.id}\t${r.dur.toFixed(3)}s\t${r.cat}\t${nm}`)
  }
  if (!total) console.log('（无匹配：放宽 --max-dur 或换 --cat / 去掉 --grep）')
}
