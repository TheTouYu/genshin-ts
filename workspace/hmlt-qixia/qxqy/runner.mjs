import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
import { readFileSync, readdirSync } from 'node:fs'
const ROOT = '/home/h/genshin-ts/workspace/hmlt-qixia'
const save = JSON.parse(readFileSync(ROOT + '/hmlt-qixia.save.json', 'utf8'))
const only = process.argv[2]
let pass = 0, fail = 0
for (const f of readdirSync(ROOT + '/tests').sort()) {
  if (!f.endsWith('.json')) continue
  if (only && !f.includes(only)) continue
  const c = JSON.parse(readFileSync(ROOT + '/tests/' + f, 'utf8'))
  const st = createStudio(save, { workspacePath: '/home/h/genshin-ts' })
  let rep
  try { rep = st.playRunCase(c, { canvasId: 'mobile-16-9' }) }
  catch (e) { rep = { passed: false, failedAt: -1, results: [{ kind: 'error', ok: false, message: String(e && e.message || e) }] } }
  console.log((rep.passed ? 'PASS' : 'FAIL') + ' ' + f + (rep.passed ? '' : `  failedAt=${rep.failedAt}`))
  if (!rep.passed) {
    for (const r of rep.results || []) if (!r.ok)
      console.log('   x', r.kind, JSON.stringify(r.actual ?? r.message).slice(0, 220))
    const logs = (rep.snapshot?.logs || []).map(l => l.text)
    console.log('   tail:', logs.slice(-8).join(' | '))
  }
  rep.passed ? pass++ : fail++
}
console.log(`${pass}/${pass + fail}`)
