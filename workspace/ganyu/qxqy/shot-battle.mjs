#!/usr/bin/env node
// 战斗链出图：node qxqy/shot-battle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
import { renderScenePng } from '/home/h/miliastra-beyond-simulator/studio/host-png.js'
import { sharedImageAssets } from '/home/h/miliastra-beyond-simulator/studio/host/image-assets.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const save = JSON.parse(readFileSync(join(root, 'ganyu.save.json'), 'utf8'))
const assets = sharedImageAssets()
const s = createStudio(save, { workspacePath: root })
s.playStart({ canvasId: process.argv[2] || 'mobile-16-9' })
const step = (n = 1) => { for (let i = 0; i < n; i++) s.playStep(1 / 30, { observe: false }) }
const click = (name) => s.playClick(name, { observe: false })
const key = (name) => s.playKey(name, { observe: false })
const snap = () => s.playGet({ view: true })
mkdirSync(join(root, 'docs', 'preview'), { recursive: true })
let errors = 0

function shot(name, label) {
  const sn = snap()
  const img = renderScenePng(sn.scene, sn.canvasWidth, sn.canvasHeight, assets)
  const buf = Buffer.from(img.data, 'base64')
  writeFileSync(join(root, 'docs', 'preview', name + '.png'), buf)
  const logs = (sn.logs || []).map((l) => l.text)
  const bad = logs.filter((l) => /\[warn\]|FAILED|attempt to|error/i.test(l))
  if (bad.length) errors += bad.length
  const last = logs[logs.length - 1] || '-'
  console.log(`${name}  ${img.width}x${img.height}  ${buf.length}B  ${label}  nodes=${sn.scene.nodes.length}  ${bad.length ? 'BAD: ' + bad.slice(-2).join(' | ') : 'ok'}  last=${last.slice(0, 100)}`)
}

const hits = (name, n, gap = 8) => { for (let i = 0; i < n; i++) { click(name); step(gap) } }

const logs = () => (snap().logs || []).map((l) => l.text)
const killed = (idx) => logs().some((t) => t.includes('battle kill enemy=' + idx) && (() => {
  const i = t.lastIndexOf('battle kill enemy=')
  return i >= 0 && t.slice(i).startsWith('battle kill enemy=' + idx)
})())
const waveOf = () => { const l = logs().filter((t) => t.includes('battle wave=')).pop() || ''; const m = l.match(/battle wave=(\d+)/); return m ? Number(m[1]) : 0 }
let guard = 0
function killEnemy(name, idx, max = 8) {
  for (let i = 0; i < max; i++) {
    const before = logs().length
    click(name); step(10)
    const tail = logs().slice(before).join('\n')
    if (tail.includes('battle kill enemy=' + idx)) return true
    guard++
    if (guard > 90) return false
  }
  return false
}
function clearWave(wave, hps = [3, 3]) {
  for (let i = 0; i < 6; i++) {
    if (waveOf() >= wave) break
    killEnemy('hit_battle_enemy_1', 1, hps[0])
    killEnemy('hit_battle_enemy_2', 2, hps[1])
    step(30)
  }
}

step(48); click('hit_boot_any'); step(24)
click('hit_start'); step(24)
click('hit_menu_1'); step(24)
click('hit_map_start'); step(26)
click('hit_prepare_start'); step(30)
shot('battle', '战斗开始')
killEnemy('hit_battle_enemy_1', 1, 4)
shot('battle-hit', '命中')
killEnemy('hit_battle_enemy_2', 2, 4)
step(36)
shot('battle-wave2', '第二波')
killEnemy('hit_battle_enemy_1', 1, 4)
killEnemy('hit_battle_enemy_2', 2, 4)
step(36)
shot('battle-wave3', '第三波')
killEnemy('hit_battle_enemy_1', 1, 4)
key('KeyboardDropKeyDown'); step(6)
shot('battle-skill', '元素爆发')
console.log('skill log:', logs().filter((t) => t.includes('battle skill')).pop() || '(none)')
killEnemy('hit_battle_enemy_2', 2, 5)
step(70)
shot('result', '结算')
click('hit_result_retry'); step(30)
shot('battle-retry', '再次挑战')
key('KeyboardCharacterSkill2KeyDown'); step(14)
shot('battle-pause', '暂停')
console.log(`\n${errors ? '❌' : '✅'} shot-battle errors=${errors}`)
process.exit(errors ? 1 : 0)
