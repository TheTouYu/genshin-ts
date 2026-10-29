#!/usr/bin/env node
// AI 能力读数（v4.0 ④）：三档各跑一段自演，统计 消行率 ρ / 每块用时 / hold 使用率 / 多消行占比。
// 用法：node qxqy/measure-ai.mjs [秒数=240] [canvasId=mobile-16-9]
// 判据（写进 docs/ai-v4-report.md）：easy ρ∈[0.10,0.18] / hard ρ≥0.30；
//   hold 使用率 hard ≥0.15；多消行（n≥2）占比 hard > easy。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const save = JSON.parse(readFileSync(join(root, 'tetris.save.json'), 'utf8'))
const secs = Number(process.argv[2] || 240)
const canvasId = process.argv[3] || 'mobile-16-9'
const TIERS = ['easy', 'normal', 'hard']

for (const tier of TIERS) {
  const s = createStudio(save, { workspacePath: root })
  s.playStart({ canvasId })
  const DT = 1 / 30
  // 切档：默认 hard（NUM.AI_LEVEL=3），按 SwitchToWalkOrRun 循环 1→2→3
  let presses = 0
  const target = TIERS.indexOf(tier) + 1
  while (presses < 3) {
    const cur = s.playGet({}).logs.filter((l) => /demo level=/.test(l.text)).length
    s.playKey('KeyboardSwitchToWalkOrRunKeyDown', { observe: false })
    presses += 1
    for (let i = 0; i < 2; i++) s.playStep(DT, { observe: false })
    const got = s.playGet({}).logs.filter((l) => /demo level=/.test(l.text))
    if (got.length && got[got.length - 1].text.includes(tier)) break
    void cur
  }
  for (let i = 0; i < Math.round(secs / DT); i++) s.playStep(DT, { observe: false })
  const logs = (s.playGet({ view: true }).logs || []).map((l) => l.text)
  const auto = logs.filter((t) => /demo auto n=/.test(t))
  const last = auto[auto.length - 1] || ''
  const m = /rho=([\d.]+) pieces=(\d+)/.exec(last)
  const rho = m ? Number(m[1]) : NaN
  const pieces = m ? Number(m[2]) : 0
  const avgs = [...last.matchAll(/avg=([\d.]+)s/g)].map((x) => Number(x[1]))
  const clears = {}
  for (const t of logs) {
    const c = /demo clear n=(\d)/.exec(t)
    if (c) clears[c[1]] = (clears[c[1]] || 0) + 1
  }
  const totalClears = Object.values(clears).reduce((a, b) => a + b, 0)
  const multi = (clears['2'] || 0) + (clears['3'] || 0) + (clears['4'] || 0)
  const holds = logs.filter((t) => /ai hold why=/.test(t)).length
  const paceLines = logs.filter((t) => /ai pace tier=/.test(t))
  const lastPace = paceLines[paceLines.length - 1] || ''
  const pm = /pace=([\d.]+)/.exec(lastPace)
  console.log(`${tier.padEnd(6)} pieces=${pieces} rho=${rho.toFixed(2)} avgPiece=${avgs[0] || '-'}s ` +
    `pace=${pm ? pm[1] : '-'} holds=${holds} holdRate=${pieces ? (holds / pieces).toFixed(2) : '-'} ` +
    `clears=${JSON.stringify(clears)} multiRate=${totalClears ? (multi / totalClears).toFixed(2) : '-'}`)
  s.playStop?.()
}
