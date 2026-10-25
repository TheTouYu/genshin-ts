#!/usr/bin/env node
// 音效 + 抖屏探针（模拟器，离线）：逐动作读模拟器的 audioHistory 与控件真实坐标。
// 为什么单独一个脚本：用例断言只有 log/control/var/signal/tree/lua 六种 kind，
//   `lua` 断言跑在**新建的沙箱**里，读不到 main.lua 的全局、也拿不到 rt.audioHistory
//   ⇒ 「确实播了声」这条判据只能从 studio 侧读（playGet().audio 就是 rt.audioSnapshot()）。
//
// 用法：node qxqy/probe-audio.mjs [canvasId]
// 出口码：所有判据为真 0，否则 1。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const canvasId = process.argv[2] || 'mobile-16-9'
const save = JSON.parse(readFileSync(join(root, 'tetris.save.json'), 'utf8'))

const s = createStudio(save, { workspacePath: root })
s.playStart({ canvasId })
const step = (n = 1) => { for (let i = 0; i < n; i++) s.playStep(1 / 30, { observe: false }) }
// 注意：typeName 就是**完整枚举名**（'KeyboardCraftspersonKey38Down'），不要再拼 Down/Up 后缀
// —— 拼错的名字不会报错，只是谁的监听都命中不了（本探针第一次跑就踩了这个假空转）。
const key = (name) => s.playKey(name, { observe: false })
const snap = (inspect = false) => s.playGet(inspect ? { inspect: true } : {})
const audio = () => snap().audio.recent
const logs = () => (snap().logs || []).map((row) => row.text)

let failed = 0
const fail = (msg) => { failed += 1; console.log(`  ✗ ${msg}`) }

// 一次动作 = 「动作发生前 audioHistory 的长度 → 动作 + 推进一帧 → 新增的记录」
const rows = []
function act(label, fn, { expect = [], expectNone = false, steps = 1 } = {}) {
  const before = audio().length
  fn()
  step(steps)
  const fresh = audio().slice(before)
  const ids = fresh.map((r) => r.audioId)
  let verdict
  if (expectNone) {
    verdict = ids.length === 0 ? '✓ 静音' : `✗ 不该出声（id=${ids.join(',')}）`
    if (ids.length !== 0) failed += 1
  } else {
    const ok = expect.every((id) => ids.includes(id))
    verdict = ok ? '✓' : `✗ 期望 id=${expect.join('/')} 实得 ${ids.join('/') || '(无)'}`
    if (!ok) failed += 1
  }
  const detail = fresh.length
    ? fresh.map((r) => `id=${r.audioId} at=${r.startedAt.toFixed(3)}s dur=${r.duration}s alive=${r.alive}`).join('  |  ')
    : '(audioHistory 无新增)'
  rows.push({ label, ids, fresh })
  console.log(`  ${label.padEnd(18)} ${verdict}  ${detail}`)
  return fresh
}

// ---------------------------------------------------------------------------
// 0) 先按 R 重开：把局面拉回确定态（空盘 + 新方块），入场的 AI 自演也同时交还控制
// ---------------------------------------------------------------------------
console.log(`canvas=${canvasId}`)
step(6)
key('KeyboardCharacterSkill3KeyDown')
step(2)
console.log(`  重开后 guideStage 日志：${logs().filter((t) => t.startsWith('guide stage') || t === 'newgame').at(-2) || '-'} / ${logs().filter((t) => t.startsWith('newgame')).at(-1) || '-'}`)

const SFX = { move: 20007, rotate: 20008, lock: 20004, over: 20006 }
const CLEAR = { 1: 20001, 2: 20002, 3: 20003, 4: 20005 }

// ---------------------------------------------------------------------------
// 1) 每个操作一条音（含三个负对照：软降不响、帧闸、无消行的落地）
// ---------------------------------------------------------------------------
console.log('\n[1] 动作 → audioHistory')
act('左移', () => key('KeyboardCraftspersonKey38Down'), { expect: [SFX.move] })
act('右移', () => key('KeyboardCraftspersonKey39Down'), { expect: [SFX.move] })
act('WSAD 左移', () => key('KeyboardMoveLeftKeyDown'), { expect: [SFX.move] })
act('旋转', () => key('KeyboardCraftspersonKey36Down'), { expect: [SFX.rotate] })
act('软降（不响）', () => key('KeyboardCraftspersonKey37Down'), { expectNone: true })
act('硬降落地（不消行）', () => key('KeyboardJumpKeyDown'), { expect: [SFX.lock] })

// 帧闸：同一帧连按两次左移 —— 只应有一条记录
{
  const before = audio().length
  key('KeyboardCraftspersonKey38Down')
  key('KeyboardCraftspersonKey38Down')
  step(1)
  const fresh = audio().slice(before)
  const ok = fresh.length === 1
  if (!ok) failed += 1
  console.log(`  ${'同帧两次左移'.padEnd(18)} ${ok ? '✓' : '✗'} 新增 ${fresh.length} 条 ` +
    fresh.map((r) => `id=${r.audioId} at=${r.startedAt.toFixed(3)}s`).join(' '))
}

// ---------------------------------------------------------------------------
// 2) 消行：音 + 抖屏（用 T 填满最底两行，再硬降 = 真实消行链路，2 行）
// ---------------------------------------------------------------------------
console.log('\n[2] 消行音 + 抖屏')
key('KeyboardCharacterSkill4KeyDown')       // T：填满最底两行
step(2)
const beforeClear = audio().length
key('KeyboardJumpKeyDown')                  // 硬降 → doLock → clearLines
step(1)
{
  const fresh = audio().slice(beforeClear)
  const ids = fresh.map((r) => r.audioId)
  const ok = ids.includes(CLEAR[2])
  if (!ok) failed += 1
  console.log(`  ${'消行 2 行'.padEnd(18)} ${ok ? '✓' : '✗'} 期望 id=${CLEAR[2]} 实得 ${ids.join('/') || '(无)'}`)
  console.log(`  日志：${logs().filter((t) => t.startsWith('shake')).at(-1) || '(无 shake 日志)'}`)
}

// 抖屏读数：逐帧读 200 格的真实 anchoredPosition，与创建时的基准坐标比
const BASE = (i) => {
  const col = (i - 1) % 10
  const row = Math.floor((i - 1) / 10)
  return { x: (col - 4.5) * 30, y: (9.5 - row) * 30 }
}
function offsets() {
  const out = []
  const walk = (nodes) => {
    for (const n of nodes || []) {
      const m = /^cell(\d+)$/.exec(String(n.name))
      if (m) {
        const b = BASE(Number(m[1]))
        out.push({ i: Number(m[1]), dx: Number(n.anchoredPositionX) - b.x, dy: Number(n.anchoredPositionY) - b.y })
      }
      if (n.children?.length) walk(n.children)
    }
  }
  walk(snap(true).tree)
  return out
}
let peak = 0
let peakFrame = -1
const series = []
for (let f = 0; f < 12; f++) {
  const off = offsets()
  const max = off.reduce((m, o) => Math.max(m, Math.hypot(o.dx, o.dy)), 0)
  series.push(max)
  if (max > peak) { peak = max; peakFrame = f }
  if (f < 12) step(1)
}
console.log(`  抖屏 |offset| 逐帧：${series.map((v) => v.toFixed(1)).join(' ')} px（cell 数=${offsets().length}）`)
console.log(`  峰值 ${peak.toFixed(2)}px @第 ${peakFrame + 1} 帧；${peak >= 2 ? '✓ 明显偏离原位' : '✗ 位移过小'}`)
if (peak < 2) failed += 1
const rest = offsets().reduce((m, o) => Math.max(m, Math.hypot(o.dx, o.dy)), 0)
console.log(`  抖完复位：残余 |offset| 最大 ${rest.toFixed(2)}px  ${rest < 0.01 ? '✓ 已复位' : '✗ 没复位'}`)
if (rest >= 0.01) failed += 1
if (!logs().includes('shake end')) fail('没有 shake end 日志（复位分支没跑）')

// ---------------------------------------------------------------------------
// 3) game over 音（连续硬降堆到顶，对齐用例 06 的做法）
// ---------------------------------------------------------------------------
console.log('\n[3] game over')
const beforeOver = audio().length
let over = false
for (let i = 0; i < 40 && !over; i++) {
  key('KeyboardJumpKeyDown')
  step(2)
  over = logs().some((t) => t.startsWith('gameover score='))
}
{
  const fresh = audio().slice(beforeOver)
  const ids = fresh.map((r) => r.audioId)
  const ok = over && ids.includes(SFX.over)
  if (!ok) failed += 1
  console.log(`  ${'堆到顶'.padEnd(18)} ${ok ? '✓' : '✗'} gameover=${over} 期望 id=${SFX.over} ` +
    `实得 ${[...new Set(ids)].join('/') || '(无)'}（共 ${fresh.length} 条）`)
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
const all = audio()
console.log(`\naudioHistory 总计 ${all.length} 条：` +
  [...all.reduce((m, r) => m.set(r.audioId, (m.get(r.audioId) || 0) + 1), new Map())]
    .map(([id, n]) => `${id}×${n}`).join(' '))
console.log(`alive（未停）${snap().audio.active.length} 条，revision=${snap().audio.revision}`)
console.log(failed === 0 ? '\nPROBE PASS' : `\nPROBE FAIL（${failed} 条判据为假）`)
s.playStop()
process.exit(failed === 0 ? 0 : 1)
