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
const save = JSON.parse(readFileSync(join(root, 'flower-tea.save.json'), 'utf8'))
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
  console.log(`${name}${suffix}  ${img.width}x${img.height}  ${buf.length}B  ${label}  nodes=${sn.scene.nodes.length}  ${bad.length ? 'BAD: ' + bad.slice(-2).join(' | ') : 'ok'}  last=${last.slice(0, 80)}`)
  return sn
}

step(24); shot('title', '标题')
click('hit_start'); step(24); shot('menu', '主菜单')
click('hit_menu_1'); step(24); shot('chapters', '茶席选择')
click('hit_chapter_1'); step(18); shot('chapter-detail', '茶席详情')
click('hit_chapter_start'); step(26); shot('game', '对局')
click('hit_tile_1_1'); step(3); click('hit_tile_1_2'); step(30); shot('game-match', '消除')
key('KeyboardCharacterSkill2KeyDown'); step(10); shot('pause', '暂停')
click('hit_pause_1'); step(8)
key('KeyboardCharacterSkill4KeyDown'); step(28); shot('result', '结算')
step(80); shot('result-clean', '结算·无提示条')
click('hit_result_3'); step(24); shot('chapters-return', '回到茶席')
click('hit_back'); step(22)
click('hit_menu_2'); step(22); shot('characters', '角色茶席')
click('hit_char_1'); step(16); shot('character-detail', '角色详情')
click('hit_char_close'); step(8)
click('hit_back'); step(22)
click('hit_menu_3'); step(22); shot('gallery-1', '图鉴·角色')
click('hit_gallery_tab_2'); step(20); shot('gallery-2', '图鉴·茶点')
click('hit_gallery_tea_1'); step(16); shot('tea-detail', '茶点详情')
click('hit_tea_close'); step(8)
click('hit_gallery_tab_3'); step(20); shot('gallery-3', '图鉴·手账')
click('hit_back'); step(22)
click('hit_menu_4'); step(22); shot('settings', '设置')
click('hit_settings_help'); step(16); shot('help', '指南')
click('hit_help_close'); step(8)
click('hit_settings_reset'); step(14); shot('confirm', '确认框')
click('hit_confirm_cancel'); step(8)
click('hit_back'); step(22)
click('hit_menu_5'); step(22); shot('credits', '制作名单')
key('KeyboardCharacterSkill2KeyDown'); step(22)
console.log(`\n${errors ? '❌' : '✅'} shot errors=${errors}  canvas=${canvasId}`)
process.exit(errors ? 1 : 0)
