#!/usr/bin/env node
// 两份 .gil 之间的 UI / 脚本差分（导入动作取证用）。
// 为什么需要它：`tools/diff-gil-files.ts` 只覆盖 NodeGraph / CompositeDef，不覆盖 root9 的
// UI 记录（模板 + 控件）与脚本登记表 f50；而"把 GIA 导入地图"这个动作改的恰好是后者。
//
// 用法：node tools/gil-ui-diff.mjs <before.gil> <after.gil> [--json] [--repo <path>]
// 判据：① 记录集按 (id, name, kind, path) 比，不按文件 sha（编辑器打开/保存会重写字节但语义不变，
//        2026-10-24 实测同一语义文件 sha 不同）；② 脚本按 guid + source 长度比。
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const files = argv.filter((a) => !a.startsWith('--'))
if (files.length !== 2) {
  console.error('用法: node tools/gil-ui-diff.mjs <before.gil> <after.gil> [--json]')
  process.exit(2)
}

function gsts(args) {
  const out = execFileSync('npx', ['tsx', 'src/cli/gsts.ts', ...args], {
    cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20,
  })
  return out
}

function uiRecords(gil) {
  const raw = gsts(['assets:ui', 'list', '--gil', gil, '--flat', '--format', 'json'])
  const parsed = JSON.parse(raw)
  const rows = new Map()
  const walk = (n) => {
    rows.set(n.id, { id: n.id, kind: n.kind, name: n.name, path: n.path, kids: (n.children || []).length })
    for (const c of n.children || []) walk(c)
  }
  for (const n of parsed.flat || []) walk(n)
  return rows
}

function scriptRecords(gil) {
  const raw = gsts(['assets:scripts', 'list', '--gil', gil, '--format', 'json'])
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = null }
  const rows = new Map()
  const list = parsed?.entries || parsed?.scripts || []
  for (const e of list) {
    if (e?.guid === undefined) continue
    rows.set(e.guid, { guid: e.guid, name: e.name, path: e.path, bytes: e.sourceBytes })
  }
  if (!rows.size) {
    // 退化：文本输出解析 `guid=… name=… path=… external=…`
    for (const line of raw.split('\n')) {
      const m = line.match(/guid=(\d+)\s+name=(\S+)\s+path=(\S+)\s+external=(\S+)/)
      if (m) rows.set(Number(m[1]), { guid: Number(m[1]), name: m[2], path: m[3], bytes: m[4] })
    }
  }
  return rows
}

const [before, after] = files
const b = uiRecords(before)
const a = uiRecords(after)
const added = [...a.values()].filter((r) => !b.has(r.id))
const removed = [...b.values()].filter((r) => !a.has(r.id))
const changed = []
for (const [id, rb] of b) {
  const ra = a.get(id)
  if (!ra) continue
  const diff = {}
  for (const k of ['kind', 'name', 'path', 'kids']) if (String(rb[k]) !== String(ra[k])) diff[k] = [rb[k], ra[k]]
  if (Object.keys(diff).length) changed.push({ id, name: rb.name, diff })
}
const sb = scriptRecords(before)
const sa = scriptRecords(after)
const sAdded = [...sa.values()].filter((r) => !sb.has(r.guid))
const sRemoved = [...sb.values()].filter((r) => !sa.has(r.guid))
const sChanged = []
for (const [guid, rb] of sb) {
  const ra = sa.get(guid)
  if (ra && rb.bytes !== ra.bytes) sChanged.push({ guid, name: rb.name, bytes: [rb.bytes, ra.bytes] })
}

const report = {
  files: { before, after },
  ui: { beforeCount: b.size, afterCount: a.size, added, removed, changed },
  scripts: { added: sAdded, removed: sRemoved, changed: sChanged },
}
if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`UI 记录：${b.size} → ${a.size}   新增 ${added.length} / 删除 ${removed.length} / 变更 ${changed.length}`)
  for (const r of added) console.log(`  + [${r.kind}] ${r.name} id=${r.id}  ${r.path}`)
  for (const r of removed) console.log(`  - [${r.kind}] ${r.name} id=${r.id}  ${r.path}`)
  for (const r of changed) console.log(`  ~ ${r.name} id=${r.id}  ${JSON.stringify(r.diff)}`)
  console.log(`脚本登记：新增 ${sAdded.length} / 删除 ${sRemoved.length} / 源码变更 ${sChanged.length}`)
  for (const r of sAdded) console.log(`  + ${r.name} guid=${r.guid} ${r.path}`)
  for (const r of sChanged) console.log(`  ~ ${r.name} guid=${r.guid} ${JSON.stringify(r.bytes)}`)
}
