#!/usr/bin/env node
// 离线回归：createStudio(存档) → playRunCase；支持 audioExpect/audioExclude。
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const save = JSON.parse(readFileSync(join(root, 'flower-tea.save.json'), 'utf8'))
const filters = process.argv.slice(2)
const caseDir = join(root, 'tests')
const files = readdirSync(caseDir).filter((f) => f.endsWith('.json'))
  .filter((f) => !filters.length || filters.some((x) => f.includes(x))).sort()
if (!files.length) { console.error('没有匹配的用例'); process.exit(1) }

let pass = 0
const failures = []
const started = Date.now()
for (const file of files) {
  const testCase = JSON.parse(readFileSync(join(caseDir, file), 'utf8'))
  const studio = createStudio(save, { workspacePath: root })
  let report
  try {
    report = studio.playRunCase(testCase, { canvasId: testCase.canvasId || 'mobile-16-9' })
  } catch (error) {
    console.log(`FAIL ${file} — 运行异常：${error.message}`)
    failures.push({ file, logs: [], error: error.message })
    continue
  }
  const logs = (report.snapshot?.logs || []).map((row) => row.text)
  const audioRows = (() => { try { return studio.playGet().audio.recent } catch { return [] } })()
  try { studio.playStop() } catch { /* ignore */ }
  const audioIds = audioRows.map((row) => row.audioId)
  const tally = [...audioIds.reduce((m, id) => m.set(id, (m.get(id) || 0) + 1), new Map())]
    .map(([id, n]) => `${id}×${n}`).join(' ')
  const expectAudio = Array.isArray(testCase.audioExpect) ? testCase.audioExpect : []
  const excludeAudio = Array.isArray(testCase.audioExclude) ? testCase.audioExclude : []
  const missingAudio = expectAudio.filter((id) => !audioIds.includes(id))
  const forbiddenAudio = excludeAudio.filter((id) => audioIds.includes(id))
  if (report.passed && !missingAudio.length && !forbiddenAudio.length) {
    pass += 1
    console.log(`PASS ${file} (${testCase.asserts?.length || 0} 断言${expectAudio.length ? ` + audio ${expectAudio.join('/')}` : ''}${audioIds.length ? `  audio: ${tally}` : ''})`)
  } else {
    console.log(`FAIL ${file}`)
    for (const r of report.results || []) if (!r.ok) console.log(`  · ${r.kind}@${r.at} 期望=${JSON.stringify(r.expected)} 实得=${JSON.stringify(r.actual)} ${r.message || ''}`)
    if (missingAudio.length) console.log(`  · audio 缺 ${missingAudio.join(',')} 实得 ${tally || '(空)'}`)
    if (forbiddenAudio.length) console.log(`  · audio 多 ${forbiddenAudio.join(',')} 实得 ${tally}`)
    failures.push({ file, logs, error: '' })
  }
}
const elapsed = ((Date.now() - started) / 1000).toFixed(1)
console.log(`\n${pass}/${files.length} 用例通过，${elapsed}s`)
for (const f of failures) {
  console.log(`\n--- ${f.file} 日志尾部 ---`)
  console.log((f.logs || []).slice(-18).join('\n') || f.error || '(无日志)')
}
process.exit(pass === files.length ? 0 : 1)
