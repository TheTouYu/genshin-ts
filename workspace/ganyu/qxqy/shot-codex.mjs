#!/usr/bin/env node
// 图鉴 / 设置 / 制作名单 三屏真实渲染出图：node qxqy/shot-codex.mjs [canvasId]
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
const badLogs = new Set()

function shot(name, label) {
  const sn = snap()
  const img = renderScenePng(sn.scene, sn.canvasWidth, sn.canvasHeight, assets)
  const buf = Buffer.from(img.data, 'base64')
  const suffix = canvasId === 'pc-16-9' ? '-pc' : ''
  writeFileSync(join(root, 'docs', 'preview', name + suffix + '.png'), buf)
  const logs = (sn.logs || []).map((l) => l.text)
  const bad = logs.filter((l) => /\[warn\]|FAILED|attempt to|error/i.test(l))
  for (const b of bad) badLogs.add(b)
  const last = logs[logs.length - 1] || '-'
  console.log(`${name}${suffix}  ${img.width}x${img.height}  ${buf.length}B  ${label}  nodes=${sn.scene.nodes.length}  ${bad.length ? 'BAD: ' + bad.slice(-2).join(' | ') : 'ok'}  last=${last.slice(0, 90)}`)
  return sn
}

const errors = () => badLogs.size

step(48); shot('boot', '启动')
click('hit_boot_any'); step(24); shot('title', '标题')
click('hit_start'); step(24); shot('menu', '主菜单')

// 图鉴：四个页签 + 条目选中（详情面板同步）
click('hit_menu_3'); step(24); shot('codex-1', '图鉴 · 敌人')
click('hit_codex_tab_2'); step(24); shot('codex-2', '图鉴 · 装备')
click('hit_codex_tab_3'); step(24); shot('codex-3', '图鉴 · 材料')
click('hit_codex_tab_4'); step(24); shot('codex-4', '图鉴 · 世界（含锁定态）')
click('hit_codex_item_2'); step(24); shot('codex-5', '图鉴 · 选中条目')
click('hit_back'); step(24)

// 设置：面板 / 开关切换 / 重置确认
click('hit_menu_4'); step(24); shot('settings', '设置')
click('hit_settings_sfx'); step(10); shot('settings-sfx', '设置 · 音效关闭')
click('hit_settings_sfx'); step(10)
click('hit_settings_reset'); step(20); shot('settings-confirm', '设置 · 重置确认')
click('hit_confirm_cancel'); step(14)
click('hit_back'); step(24)

// 制作名单
click('hit_menu_5'); step(24); shot('credits', '制作名单')

console.log(`\n${errors() ? '❌' : '✅'} shot errors=${errors()}  canvas=${canvasId}`)
if (badLogs.size) for (const b of badLogs) console.log('  ! ' + b.slice(0, 160))
process.exit(errors() ? 1 : 0)
