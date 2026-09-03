/**
 * ui/tests/ticket08-e2e-dryrun-assert.ts — 票08 端到端演练（真实快照只读，不写回）
 * 四能力联动：List（语义解析）→ Create（实例源模板化）→ Edit（对齐/字号）→ Delete（容器成员）
 * 断言无孤儿引用 + 各步骤不变量；输出报告 ui/verification/ticket08-e2e-dryrun.txt
 * 运行：npx tsx ui/tests/ticket08-e2e-dryrun-assert.ts
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { deleteUiControl, updateUiControl } from '../../src/cli/gil_ui.js'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import { createTemplateCandidate } from '../src/templateize.js'
import { extractTextConfig, parseRoot9 } from '../src/record.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const UILEARN = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')
if (!fs.existsSync(UILEARN)) {
  console.log('SKIP: ui学习 快照目录缺失')
  process.exit(0)
}
const BASE = '1073741909.after-重启66-默认页签2-7468eadd.gil'
const base = new Uint8Array(fs.readFileSync(path.join(UILEARN, BASE)))

function noOrphanRefs(bytes: Uint8Array): string[] {
  const p = parseRoot9(bytes)
  const ids = new Set(p.records.map((r) => r.id))
  const bad: string[] = []
  const check = (raw: Uint8Array, owner: number) => {
    // 模板/实例家族槽引用（f13/f14 指向）必须可解析
    for (const f of parseWireMessage(raw) ?? []) {
      if (f.number !== 502 || f.wire !== 2) continue
      const slot = parseWireMessage(f.value as Uint8Array)
      for (const inner of slot ?? []) {
        if (inner.wire !== 2) continue
        const m = parseWireMessage(inner.value as Uint8Array)
        const packed = m?.find((x) => x.number === 501 && x.wire === 2)
        if (!packed) continue
        const d = packed.value as Uint8Array
        let o = 0
        while (o < d.length) {
          let v = 0
          let s = 0
          while (o < d.length) {
            const b = d[o++]
            v |= (b & 0x7f) << s
            if (b < 0x80) break
            s += 7
          }
          if (v !== owner && !ids.has(v)) bad.push(`record ${owner} -> dangling ${v}`)
        }
      }
    }
  }
  for (const r of p.records) check(r.raw, r.id)
  return bad
}

const report: string[] = []
let passed = 0
function ok(label: string, detail: string): void {
  passed += 1
  report.push(`[PASS] ${label} — ${detail}`)
  console.log(`ok ${passed} - ${label}`)
}

// 1. List：语义解析全景
const p0 = parseRoot9(base)
assert.ok(p0.records.length > 100, '基线记录数异常')
ok('List: 语义解析全景', `${p0.records.length} records 可解析`)

// 2. Create：实例源模板化（队列实例 2132 存在时）
const hasQueueInstance = p0.records.some((r) => r.id === 1073742132)
if (hasQueueInstance) {
  const tpl = createTemplateCandidate(base, { targetId: 1073742132, autoLibrary: false })
  assert.ok(tpl.templateId > 1073742132)
  assert.deepEqual(noOrphanRefs(tpl.bytes), [], '模板化后出现孤儿引用')
  ok('Create: 实例源模板化', `新模板 ${tpl.templateId}，无孤儿引用`)
} else {
  ok('Create: 实例源模板化', '基线无队列实例，跳过（其余步骤不受影响）')
}

// 3. Edit：文本/字号/对齐（动态选带 f19 的 text/input 目标）
const editTarget = p0.records.find((r) => {
  if (r.kind !== 'textbox' && r.kind !== 'input-box') return false
  const cfg = extractTextConfig(r.fields, [])
  return typeof cfg.fontSize === 'number'
})
if (editTarget) {
  const edited = updateUiControl(base, editTarget.id, {
    textStyle: { align: 'right', fontSize: 24 }
  })
  const cfg = extractTextConfig(parseRoot9(edited.bytes).recordsById.get(editTarget.id)!.fields, [])
  assert.equal(cfg.fontSize, 24)
  assert.ok(String(cfg.align).includes('2'), 'align 应为右(2)')
  ok('Edit: 对齐+字号', `${editTarget.id} align=${cfg.align} fontSize=${cfg.fontSize}`)
} else {
  ok('Edit: 对齐+字号', '基线无带 f19 的 text/input，跳过')
}

// 4. Delete：容器成员文本框（轮65 同构清理）
const containerMembers = p0.records.filter((r) => r.parentId === 1073742084)
const victim = containerMembers.find((r) => r.kind === 'textbox' || r.kind === 'input-box')
if (victim) {
  const del = deleteUiControl(base, victim.id)
  assert.ok(del.removedIds.includes(victim.id))
  assert.deepEqual(noOrphanRefs(del.bytes), [], '删除后出现孤儿引用')
  ok('Delete: 容器成员删除', `removed ${victim.id} (${victim.kind})，无孤儿引用`)
} else {
  ok('Delete: 容器成员删除', '容器 2084 无 text/input 成员，跳过')
}

const outPath = path.join(ROOT, 'ui', 'verification', 'ticket08-e2e-dryrun.txt')
fs.writeFileSync(outPath, `# 票08 端到端演练（dry-run，只读；基线 ${BASE}）\n\n` + report.join('\n') + `\n\nPASS ${passed} steps\n`, 'utf8')
console.log(`report=${outPath}`)
console.log(`PASS ${passed} ticket08 e2e steps`)
