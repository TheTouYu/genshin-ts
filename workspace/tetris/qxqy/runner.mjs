#!/usr/bin/env node
// 离线跑用例：不需要 web 服务，直接 createStudio(存档) 后逐条 playRunCase。
// 用法：node qxqy/runner.mjs [用例文件名子串...]
// 退出码：全绿 0，有失败 1。
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const save = JSON.parse(readFileSync(join(root, 'tetris.save.json'), 'utf8'))

const filters = process.argv.slice(2)
const caseDir = join(root, 'tests')
const files = readdirSync(caseDir)
  .filter((f) => f.endsWith('.json'))
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)))
  .sort()

if (!files.length) {
  console.error('没有匹配的用例')
  process.exit(1)
}

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
    failures.push({ file, results: [], logs: [], error: error.message })
    continue
  }
  const logs = (report.snapshot?.logs || []).map((row) => row.text)
  if (report.passed) {
    pass += 1
    console.log(`PASS ${file}  (${testCase.asserts.length} 断言)`)
  } else {
    console.log(`FAIL ${file}`)
    for (const r of report.results) {
      if (!r.ok) {
        console.log(`  · ${r.kind}@${r.at} 期望=${JSON.stringify(r.expected)} 实得=${JSON.stringify(r.actual)} ${r.message || ''}`)
      }
    }
    failures.push({ file, results: report.results, logs })
  }
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1)
console.log(`\n${pass}/${files.length} 用例通过，${elapsed}s`)
for (const f of failures) {
  console.log(`\n--- ${f.file} 客户端日志尾部 ---`)
  console.log((f.logs || []).slice(-15).join('\n') || '(无日志)')
}
process.exit(pass === files.length ? 0 : 1)
