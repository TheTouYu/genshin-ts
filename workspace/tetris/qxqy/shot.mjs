#!/usr/bin/env node
// 出布局预览图（真实模拟器渲染，不是手绘示意图）：createStudio(存档) → playStart → 注入按键/步进
// → playGet({view:true}) 取 scene → renderScenePng 落 PNG。
// 用法：node qxqy/shot.mjs [canvasId]   产物：docs/preview-*.png
// 判据：每张图字节数不同且 >20KB；blob 全黑 = 渲染失败。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
import { renderScenePng } from '/home/h/miliastra-beyond-simulator/studio/host-png.js'
import { sharedImageAssets } from '/home/h/miliastra-beyond-simulator/studio/host/image-assets.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const canvasId = process.argv[2] || 'mobile-16-9'
const save = JSON.parse(readFileSync(join(root, 'tetris.save.json'), 'utf8'))
const assets = sharedImageAssets()
const s = createStudio(save, { workspacePath: root })
// 注意：playRun() 内部会 playStart() 重开会话，注入的按键会被丢掉 —— 一律用 playStep 步进
s.playStart({ canvasId })
const step = (n) => { for (let i = 0; i < n; i++) s.playStep(1 / 30, { observe: false }) }
const key = (typeName) => s.playKey(typeName, { observe: false })

function shot(name) {
  const snap = s.playGet({ view: true })
  const img = renderScenePng(snap.scene, snap.canvasWidth, snap.canvasHeight, assets)
  const buf = Buffer.from(img.data, 'base64')
  writeFileSync(join(root, 'docs', name), buf)
  const logs = (snap.logs || []).map((l) => l.text)
  console.log(`${name}  ${img.width}x${img.height}  ${buf.length}B  last-log=${logs[logs.length - 1] || '-'}`)
  return snap
}

// 抖屏读数：拿 scene 里每个 cell 的真实渲染矩阵（matrix.tx/ty）与"抖动前那一帧"逐格比。
// 判据只看**位移**，不看颜色 —— 消行会改颜色，位置才是抖动证据。
const cellPos = (scene) => {
  const m = new Map()
  for (const n of scene.nodes || []) {
    if (/^cell\d+$/.test(String(n.name)) && n.matrix) m.set(n.name, { tx: n.matrix.tx, ty: n.matrix.ty })
  }
  return m
}
const cellShift = (scene, base) => {
  let max = 0
  let sample = ''
  for (const [name, p] of cellPos(scene)) {
    const b = base.get(name)
    if (!b) continue
    const dx = p.tx - b.tx
    const dy = p.ty - b.ty
    const d = Math.hypot(dx, dy)
    if (d > max) { max = d; sample = `${name} dx=${dx.toFixed(2)} dy=${dy.toFixed(2)}px` }
  }
  return { max, sample, cells: base.size }
}

// 进场自演：抓「堆到 4 行」那一帧 + 之后两张（核对"最高堆叠在哪一侧/有没有中间深井"）
// 棋盘位置用 cellN 的序号反推（cellN 是 OnStart 里按 row-major 造的，比用坐标反算更稳）
const EMPTY = -15065818
const boardOf = (scene) => {
  const g = Array.from({ length: 20 }, () => new Array(10).fill(0))
  for (const n of scene.nodes || []) {
    const m = /^cell(\d+)$/.exec(String(n.name))
    if (!m || n.kind !== 'image' || n.imageColor === EMPTY) continue
    const i = Number(m[1]) - 1
    g[Math.floor(i / 10)][i % 10] = 1
  }
  return g
}
const analyze = (label, scene) => {
  const g = boardOf(scene)
  // 只看第 3 行以下：方块出生在第 1~2 行，算进来会把高度顶成 20（踩过）
  const h = []
  for (let c = 0; c < 10; c++) {
    let top = 0
    for (let r = 4; r < 20; r++) if (g[r][c]) { top = 20 - r; break }   // 跳过顶部 4 行（下落的方块在那儿）
    h.push(top)
  }
  const wells = []
  for (let c = 1; c < 9; c++) {
    const d = Math.min(h[c - 1], h[c + 1]) - h[c]
    if (d >= 3) wells.push(`列${c + 1}深${d}`)
  }
  const maxH = Math.max(...h)
  const at = h.map((v, i) => [v, i + 1]).filter(([v]) => v === maxH).map(([, i]) => i)
  const side = maxH === 0 ? '空盘'
    : at.every((c) => c <= 3) ? '左'
      : at.every((c) => c >= 8) ? '右'
        : at.every((c) => c >= 4 && c <= 7) ? '中' : '分散'
  console.log(`  ${label} heights=[${h.join(',')}] 最高=${maxH}@列${at.join('/')} 侧=${side} 中间深井=${wells.length ? wells.join(' ') : '无'}`)
  return { h, maxH, at, side, wells }
}

const filledCells = () => (s.playGet({ view: true }).scene.nodes || [])
  .filter((n) => /^cell\d+$/.test(String(n.name)) && n.imageColor !== EMPTY).length
for (let i = 0; i < 80 && filledCells() < 42; i++) step(15)
let snap = shot('preview-guide.png')   // 入场自演中：上横幅「俄罗斯方块」+ 下横幅「按任意键开始」+ AI 正在堆
analyze('guide', snap.scene)
{
  const settleAtEntry = (snap.scene.nodes || []).filter((n) => /settle/i.test(String(n.name))).length
  console.log(`  入场结算残留节点 = ${settleAtEntry}  ${settleAtEntry === 0 ? '✓ 干净' : '✗ 有残留'}`)
}
step(200); snap = shot('preview-ai-place-1.png'); analyze('place-1', snap.scene)
step(240); snap = shot('preview-ai-place-2.png'); analyze('place-2', snap.scene)
step(240); snap = shot('preview-ai-place-3.png'); analyze('place-3', snap.scene)

// 抓「同一块方块的三个时刻」：挑一块横移 >= 3 格的（`demo plan from/target` 判定），
// 收前 3 条**列不同**的 demo act move，这块结束时才落盘 —— 否则会把不同块的帧混在一起。
{
  let frames = []
  let skip = true
  let done = false
  let seen = (s.playGet({ view: true }).logs || []).length
  for (let guard = 0; guard < 12000 && !done; guard++) {
    step(1)
    const sn = s.playGet({ view: true })
    const logs = (sn.logs || []).map((l) => l.text)
    for (let i = seen; i < logs.length; i++) {
      const line = logs[i]
      if (line.startsWith('demo plan')) {
        const from = Number(/from=(-?\d+)/.exec(line)?.[1])
        const target = Number(/target=(-?\d+)/.exec(line)?.[1])
        skip = Math.abs(target - from) < 3
        frames = []
      } else if (line.startsWith('demo act move') && !skip && frames.length < 3) {
        const x = Number(/x=(-?\d+)/.exec(line)?.[1])
        if (!frames.some((f) => f.x === x)) {
          const img = renderScenePng(sn.scene, sn.canvasWidth, sn.canvasHeight, assets)
          frames.push({ buf: Buffer.from(img.data, 'base64'), line, x })
        }
      } else if (line.startsWith('demo pace')) {
        if (!skip && frames.length === 3) {
          frames.forEach((f, k) => {
            writeFileSync(join(root, 'docs', `preview-ai-pace-${k + 1}.png`), f.buf)
            console.log(`preview-ai-pace-${k + 1}.png  ${f.buf.length}B  触发日志=${f.line}  块节奏=${line}`)
          })
          done = true
          break
        }
        frames = []
      }
    }
    seen = logs.length
  }
  if (!done) console.log('!! 没抓到 3 帧的横移块')
}
key('KeyboardMoveLeftKeyDown'); key('KeyboardMoveLeftKeyUp')
step(20)
shot('preview-play.png')           // 游戏中：重力已跑，横幅已清
key('KeyboardJumpKeyDown'); key('KeyboardJumpKeyUp')
step(10)
key('KeyboardCharacterSkill4KeyDown'); key('KeyboardCharacterSkill4KeyUp')  // T 填底两行
step(2)
// 对照帧：抖动之前（棋盘在原位）。下面抖屏帧要拿它当基准逐格算位移。
const baseSnap = shot('preview-shake-base.png')
const basePos = cellPos(baseSnap.scene)
key('KeyboardJumpKeyDown'); key('KeyboardJumpKeyUp')                        // 硬降触发真实消行
// 抖屏 2 行 = 0.20s（dt=1/30 ⇒ 6 帧，指数衰减）。逐帧读真实渲染坐标，落盘偏移最大那一帧。
let best = null
let lastShift = 0
for (let i = 0; i < 12; i++) {
  step(1)
  const sn = s.playGet({ view: true })
  const img = renderScenePng(sn.scene, sn.canvasWidth, sn.canvasHeight, assets)
  const buf = Buffer.from(img.data, 'base64')
  const shift = cellShift(sn.scene, basePos)
  lastShift = shift.max
  const shakeLog = (sn.logs || []).map((l) => l.text).filter((t) => t.startsWith('shake')).at(-1)
  if (shakeLog && !best) console.log(`  抖动日志：${shakeLog}（第 ${i + 1} 帧读到）`)
  if (!best || shift.max > best.max) best = { ...shift, buf, frame: i + 1, log: shakeLog }
}
writeFileSync(join(root, 'docs', 'preview-shake.png'), best.buf)
console.log(`preview-shake.png  ${best.buf.length}B  峰值位移 ${best.max.toFixed(2)}px @第 ${best.frame} 帧（${best.sample}）` +
  `  对照组 preview-shake-base.png 为 0px；12 帧后残余 ${lastShift.toFixed(2)}px ${lastShift < 0.01 ? '✓ 已复位' : '✗ 没复位'}` +
  `\n  放大对照：python3 qxqy/shake-ab.py → docs/preview-shake-ab.png（4× 裁切，左基准右抖动）`)
shot('preview-clear.png')          // 首次消行后的提示态
// gameover：连续硬降堆到顶（不消行）。**逐次检测**，命中那一帧 settleT 才 = 0，
// 中途帧的 settleT 才准（否则攒到 3 帧才判，动画早已跑完）。
const isOver = () => (s.playGet({ view: true }).scene.nodes || []).some((n) => n.text === '游戏结束')
let over = false
for (let i = 0; i < 80 && !over; i++) {
  key('KeyboardJumpKeyDown'); key('KeyboardJumpKeyUp')
  over = isOver()
  if (!over) step(3)
}
step(6)                            // settleT ≈ 0.20s：遮罩淡入中、标题还在上面
shot('preview-settle-anim-1.png')
step(9)                            // settleT ≈ 0.50s：遮罩满、标题已落位、选项正在滑入
shot('preview-settle-anim-2.png')
step(15)                           // settleT ≈ 1.00s：四段动画（0.9s）结束的稳定帧
shot('preview-gameover.png')
key('KeyboardCharacterSkill2KeyDown'); key('KeyboardCharacterSkill2KeyUp')   // Q 结算明细
step(2)
shot('preview-gameover-detail.png')
// R 重开：结算层必须真销毁（懒创建 ⇒ 重开即销毁，不靠 SetVisible）
key('KeyboardCharacterSkill3KeyDown'); key('KeyboardCharacterSkill3KeyUp')
step(24)
const afterR = shot('preview-after-restart.png')
{
  const left = (afterR.scene.nodes || []).filter((n) => /settle/i.test(String(n.name))).length
  const logs = (afterR.logs || []).map((l) => l.text)
  const destroyed = logs.filter((t) => t.startsWith('settle destroy')).at(-1) || '(无 destroy 日志)'
  const built = logs.filter((t) => t.startsWith('settle build')).at(-1) || '(无 build 日志)'
  console.log(`  重开后结算残留节点 = ${left}  ${left === 0 ? '✓ 已销毁' : '✗ 还在'}  | build: ${built}  | destroy: ${destroyed}`)
}
s.playStop()
