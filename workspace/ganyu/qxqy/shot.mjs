#!/usr/bin/env node
// 全流程真实渲染出图：node qxqy/shot.mjs [canvasId]
// 覆盖：启动 → 标题 → 主菜单 → 关卡地图 → 出战准备 → 战斗（命中/波次/暂停/技能）→ 结算
//       → 养成（含突破/天赋弹层）→ 图鉴（4 页签）→ 设置（含指南/重置确认）→ 制作名单
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
const logs = () => (snap().logs || []).map((l) => l.text)
mkdirSync(join(root, 'docs', 'preview'), { recursive: true })
let errors = 0

function shot(name, label) {
  const sn = snap()
  const img = renderScenePng(sn.scene, sn.canvasWidth, sn.canvasHeight, assets)
  const buf = Buffer.from(img.data, 'base64')
  const suffix = canvasId === 'pc-16-9' ? '-pc' : ''
  writeFileSync(join(root, 'docs', 'preview', name + suffix + '.png'), buf)
  const ls = (sn.logs || []).map((l) => l.text)
  const bad = ls.filter((l) => /\[frost\]\[warn\]|FAILED|attempt to/i.test(l))
  if (bad.length) errors += bad.length
  const last = ls[ls.length - 1] || '-'
  console.log(`${name}${suffix}  ${img.width}x${img.height}  ${buf.length}B  ${label}  nodes=${sn.scene.nodes.length}  ${bad.length ? 'BAD: ' + bad.slice(-2).join(' | ') : 'ok'}  last=${last.slice(0, 88)}`)
  return sn
}

function killEnemy(name, idx, max = 8) {
  for (let i = 0; i < max; i++) {
    const before = logs().length
    click(name); step(10)
    if (logs().slice(before).join('\n').includes('battle kill enemy=' + idx)) return true
  }
  return false
}

// ---- 启动 / 标题 / 菜单
step(46); shot('boot', '启动')
click('hit_boot_any'); step(24); shot('title', '标题')
click('hit_start'); step(24); shot('menu', '主菜单')

// ---- 关卡地图 / 章节 / 出战准备
click('hit_menu_1'); step(26); shot('map', '关卡地图')
click('hit_map_chapter_2'); step(26); shot('map-2', '第二章')
click('hit_map_chapter_1'); step(26)
click('hit_map_stage_1'); step(24); shot('map-sel', '选中关卡')
click('hit_map_start'); step(24); shot('prepare', '出战准备')

// ---- 战斗
click('hit_prepare_start'); step(28); shot('battle', '战斗开始')
killEnemy('hit_battle_enemy_1', 1, 4)
shot('battle-hit', '命中')
killEnemy('hit_battle_enemy_2', 2, 4)
step(36); shot('battle-wave2', '第二波')
key('KeyboardCharacterSkill2KeyDown'); step(14); shot('battle-pause', '暂停')
click('hit_pause_resume'); step(12)
killEnemy('hit_battle_enemy_1', 1, 4)
killEnemy('hit_battle_enemy_2', 2, 4)
step(36)
key('KeyboardDropKeyDown'); step(8); shot('battle-skill', '元素爆发')
killEnemy('hit_battle_enemy_1', 1, 5)
killEnemy('hit_battle_enemy_2', 2, 5)
step(70); shot('result', '结算')
click('hit_result_map'); step(26)
click('hit_back'); step(24)

// ---- 养成
click('hit_menu_2'); step(28); shot('growth', '养成')
click('hit_growth_ascend'); step(20); shot('growth-ascend', '突破弹层')
click('hit_ascend_cancel'); step(14)
click('hit_growth_talent_2'); step(20); shot('growth-talent', '天赋弹层')
click('hit_talent_close'); step(12)
click('hit_back'); step(24)

// ---- 图鉴
click('hit_menu_3'); step(26); shot('codex-1', '图鉴·敌人')
click('hit_codex_tab_2'); step(24); shot('codex-2', '图鉴·装备')
click('hit_codex_tab_3'); step(24); shot('codex-3', '图鉴·材料')
click('hit_codex_tab_4'); step(24); shot('codex-4', '图鉴·世界')
click('hit_back'); step(24)

// ---- 设置 / 指南 / 重置确认
click('hit_menu_4'); step(24); shot('settings', '设置')
click('hit_settings_help'); step(18); shot('help', '指南')
click('hit_help_close'); step(12)
click('hit_settings_reset'); step(16); shot('confirm', '重置确认')
click('hit_confirm_cancel'); step(12)
click('hit_back'); step(24)

// ---- 制作名单
click('hit_menu_5'); step(24); shot('credits', '制作名单')
key('KeyboardCharacterSkill2KeyDown'); step(24)

console.log(`\n${errors ? '❌' : '✅'} shot errors=${errors}  canvas=${canvasId}`)
process.exit(errors ? 1 : 0)
