#!/usr/bin/env node
// 全控件点击巡检（v4.0）：用户 2026-10-29「部分按钮点击异常，需要对全部控件进行检查」。
// 做法：Lua 侧登记所有可点控件并在建屏时 `ctl dump screen=<tag>` 打印画布坐标（唯一真源 =
// UI4.reg），本脚本解析这些行 → 逐屏逐个点一遍 → 「点完必须出现新日志」，没有新日志=死控件。
// 用法：node qxqy/audit-controls.mjs [canvasId...]     退出码 0=无死控件
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const save = JSON.parse(readFileSync(join(root, 'tetris.save.json'), 'utf8'))
const canvases = process.argv.slice(2)
const CANVASES = canvases.length ? canvases : ['pc-16-9', 'pc-21-9', 'mobile-16-9', 'mobile-19.5-9', 'mobile-4-3']
const DT = 1 / 30

function newSession(canvasId) {
  const s = createStudio(save, { workspacePath: root })
  s.playStart({ canvasId })
  return s
}
const logsOf = (s) => (s.playGet({ view: true }).logs || []).map((l) => l.text)
const step = (s, sec) => { const n = Math.max(1, Math.round(sec / DT)); for (let i = 0; i < n; i++) s.playStep(DT, { observe: false }) }
const key = (s, n) => s.playKey(n, { observe: false })

function dumpOf(logs, tag) {
  const head = logs.find((t) => t.startsWith(`ctl dump screen=${tag} `))
  if (!head) return null
  const ctl = []
  for (const t of logs) {
    const m = /^ctl (\S+) px=(-?\d+) py=(-?\d+) w=(\d+) h=(\d+)$/.exec(t)
    if (m) ctl.push({ name: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] })
  }
  // 同名屏幕的 dump 会重复打印（重建）⇒ 只保留最后一次出现的那批（按 head 出现位置之后的）
  const idx = logs.lastIndexOf(head)
  const last = []
  for (let i = idx + 1; i < logs.length && logs[i].startsWith('ctl '); i++) {
    const m = /^ctl (\S+) px=(-?\d+) py=(-?\d+) w=(\d+) h=(\d+)$/.exec(logs[i])
    if (m) last.push({ name: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] })
  }
  return { head, ctl: last.length ? last : ctl }
}

function tap(s, c) {
  const before = logsOf(s).length
  s.playPointer('move', c.x, c.y)
  step(s, DT)
  s.playPointer('down', c.x, c.y)
  step(s, 0.12)
  s.playPointer('up', c.x, c.y)
  step(s, 0.25)
  const after = logsOf(s)
  return { fresh: after.slice(before), all: after }
}

// 每个控件的期望日志（唯一真源：Lua 侧打印锚）。没有命中=死控件或接错动作。
const EXPECT = {
  'menu.mode1': 'mode=casual',
  'menu.mode2': 'pad note open which=2',
  'menu.mode3': 'pad note open which=3',
  'menu.mode4': 'pad note open which=4',
  'menu.help': 'guide help on',
  'help.close': 'tap help close',
  'note.ok': 'pad note close',
  'phone.left': 'phone tap left',
  'phone.right': 'phone tap right',
  'phone.rot': 'phone tap rot',
  'phone.hard': 'phone tap hard',
  'phone.soft': 'phone tap soft',
  'phone.hold': 'phone tap hold',
  'phone.help': 'phone tap help',
  'settle.R': 'hot settle R',
  'settle.V': 'hot settle V',
  'settle.Q': 'hot settle Q',
}
const results = []
function record(canvas, screen, name, ok, note) {
  results.push({ canvas, screen, name, ok, note })
  console.log(`${ok ? 'OK  ' : 'DEAD'} ${canvas} ${screen} ${name}${note ? '  ' + note : ''}`)
}

// ── 1) 标题屏 + 引导浮层：**每个控件一份新会话** ───────────────────────────
// 为什么一控件一会话：模式卡点下去 0.5s 后 enterMode 会销毁整个标题页（后续坐标全失效），
// 说明热区点开会盖住屏幕。用同一会话连点会把"上一动作的副作用"记到下一个控件头上。
const EXPECT_MENU_PC = { 'menu.mode1': 'mode=casual', 'menu.mode2': 'mode=ai-battle',
  'menu.mode3': 'mode=pvp', 'menu.mode4': 'mode=coop', 'menu.help': 'guide help on' }
for (const canvas of CANVASES) {
  const isMobile = canvas.startsWith('mobile')
  const probe = newSession(canvas)
  step(probe, 0.8)
  const menu = dumpOf(logsOf(probe), 'menu')
  probe.playStop?.()
  if (!menu) { record(canvas, 'menu', '(dump)', false, '没有 ctl dump screen=menu'); continue }
  console.log(`[${canvas}] menu 控件 ${menu.ctl.length} 个`)
  for (const c of menu.ctl) {
    const s = newSession(canvas)
    step(s, 0.8)
    const r = tap(s, c)
    let want = EXPECT[c.name]
    if (!isMobile) want = EXPECT_MENU_PC[c.name] || want
    const ok = want ? r.fresh.some((t) => t.includes(want)) : r.fresh.length > 0
    record(canvas, 'menu', c.name, ok, want || '')
    if (!ok) console.log('      (期望含 "' + want + '"；实得：' + r.fresh.slice(0, 3).map((t) => t.slice(0, 50)).join(' / ') + ')')
    // 说明页 / 引导浮层：点开后立刻点关闭按钮（这是"回得去"的判据）
    if (c.name === 'menu.help' && r.all.some((t) => t.includes('guide help on'))) {
      const help = dumpOf(r.all, 'help')
      const close = help && help.ctl.find((n) => n.name === 'help.close')
      if (close) {
        const r2 = tap(s, close)
        record(canvas, 'help', 'help.close', r2.fresh.some((t) => t.includes('tap help close')), 'tap help close')
      } else record(canvas, 'help', 'help.close', false, '帮助页没有登记关闭按钮')
    }
    if (isMobile && /^menu\.mode[2-4]$/.test(c.name)) {
      const note = dumpOf(r.all, 'note')
      const btn = note && note.ctl.find((n) => n.name === 'note.ok')
      if (btn) {
        const r2 = tap(s, btn)
        record(canvas, 'note', 'note.ok', r2.fresh.some((t) => t.includes('pad note close')), 'pad note close')
      } else record(canvas, 'note', 'note.ok', false, '浮层没有登记关闭按钮')
    }
    s.playStop?.()
  }
}

// ── 2) 局内移动端按钮（每张画布）───────────────────────────────────────────
for (const canvas of CANVASES) {
  const isMobile = canvas.startsWith('mobile')
  if (!isMobile) continue
  const s = newSession(canvas)
  step(s, 0.6)
  key(s, 'KeyboardJumpKeyDown'); key(s, 'KeyboardJumpKeyUp'); step(s, 0.6)
  key(s, 'KeyboardJumpKeyDown'); key(s, 'KeyboardJumpKeyUp'); step(s, 0.6)
  const play = dumpOf(logsOf(s), 'play')
  if (!play) { record(canvas, 'play', '(dump)', false, '没有 ctl dump screen=play'); continue }
  console.log(`[${canvas}] play 控件 ${play.ctl.length} 个`)
  for (const c of play.ctl) {
    const r = tap(s, c)
    const want = EXPECT[c.name]
    const ok = want ? r.fresh.some((t) => t.includes(want)) : r.fresh.length > 0
    if (!ok) console.log('      (期望含 "' + want + '"；实得：' + r.fresh.slice(0, 3).map((t) => t.slice(0, 50)).join(' / ') + ')')
    record(canvas, 'play', c.name, ok, want || '')
    // 说明键会把帮助页掀开，紧接着点关闭，免得后续按钮被浮层挡住
    if (c.name === 'phone.help' && r.all.some((t) => t.includes('guide help on'))) {
      const help = dumpOf(r.all, 'help')
      const close = help && help.ctl.find((n) => n.name === 'help.close')
      if (close) {
        const r2 = tap(s, close)
        record(canvas, 'help', 'help.close(play)', r2.fresh.some((t) => t.includes('tap help close')), '')
      }
    }
  }
  s.playStop?.()
}

// ── 3) 结算屏三选项（两张主画布：Q 明细 → R 重开；V 回主页另开一局）────────────
for (const canvas of ['mobile-16-9', 'pc-16-9']) {
  for (const target of ['settle.Q', 'settle.R', 'settle.V']) {
    const s = newSession(canvas)
    step(s, 0.6)
    for (let i = 0; i < 40; i++) { key(s, 'KeyboardJumpKeyDown'); step(s, DT); key(s, 'KeyboardJumpKeyUp'); step(s, DT) }
    step(s, 1.2)
    const settle = dumpOf(logsOf(s), 'settle')
    if (!settle) { record(canvas, 'settle', '(dump)', false, '没有 ctl dump screen=settle'); continue }
    const c = settle.ctl.find((n) => n.name === target)
    if (!c) { record(canvas, 'settle', target, false, '未登记'); continue }
    const r = tap(s, c)
    if (!r.fresh.length) {
      const hist = logsOf(s)
      console.log('      settle 无新日志 @' + c.x + ',' + c.y + ' 最近：' + hist.slice(-4).map((t) => t.slice(0, 50)).join(' / '))
    }
    const want = EXPECT[target]
    const hit = r.fresh.some((t) => t.includes(want))
    const effect = r.fresh.some((t) => /settle detail|newgame|menu back V|mode menu/.test(t))
    record(canvas, 'settle', target, hit && effect, r.fresh.slice(0, 2).join(' | '))
    s.playStop?.()
  }
}

const dead = results.filter((r) => !r.ok)
console.log(`\n巡检 ${results.length} 个控件，死控件 ${dead.length} 个`)
if (dead.length) {
  for (const d of dead) console.log(`  DEAD ${d.canvas} ${d.screen} ${d.name} ${d.note || ''}`)
  process.exit(1)
}
console.log('AUDIT PASS')
