#!/usr/bin/env node
// 全流程真实渲染出图：node qxqy/shot.mjs [canvasId]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
import { renderScenePng } from '/home/h/miliastra-beyond-simulator/studio/host-png.js'
import { sharedImageAssets } from '/home/h/miliastra-beyond-simulator/studio/host/image-assets.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const canvasId = process.argv[2] || 'mobile-16-9'
const save = JSON.parse(readFileSync(join(root, 'ganyu.save.json'), 'utf8'))
const assets = sharedImageAssets()
const s = createStudio(save, { workspacePath: root })
s.playStart({ canvasId })
const step = (n = 1) => { for (let i = 0; i < n; i++) s.playStep(1 / 30, { observe: false }) }
const key = (name) => s.playKey(name, { observe: false })
const click = (name) => s.playClick(name, { observe: false })
const snap = () => s.playGet({ view: true })
mkdirSync(join(root, 'docs', 'preview'), { recursive: true })
let errors = 0

function shot(name, label) {
  const sn = snap()
  const img = renderScenePng(sn.scene, sn.canvasWidth, sn.canvasHeight, assets)
  const buf = Buffer.from(img.data, 'base64')
  const suffix = canvasId === 'pc-16-9' ? '-pc' : ''
  writeFileSync(join(root, 'docs', 'preview', name + suffix + '.png'), buf)
  const logs = (sn.logs || []).map((l) => l.text)
  const bad = logs.filter((l) => /\[warn\]|FAILED|attempt to|error/i.test(l))
  if (bad.length) errors += bad.length
  const last = logs[logs.length - 1] || '-'
  console.log(`${name}${suffix}  ${img.width}x${img.height}  ${buf.length}B  ${label}  nodes=${sn.scene.nodes.length}  ${bad.length ? 'BAD: ' + bad.slice(-2).join(' | ') : 'ok'}  last=${last.slice(0, 90)}`)
  return sn
}

step(48); shot('boot', '启动')
click('hit_boot_any'); step(24); shot('title', '标题')
click('hit_start'); step(24); shot('menu', '主菜单')
console.log(`\n${errors ? '❌' : '✅'} shot errors=${errors}  canvas=${canvasId}`)
process.exit(errors ? 1 : 0)
