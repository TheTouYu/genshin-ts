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

// 入场自演：步进到「棋盘上至少堆了 4 行」（最多 40s）——这样一帧就看得见 AI 真的在玩，
// 而不是刚消完行的一次空盘。种子固定，所以这帧可复现。
const filledCells = () => (s.playGet({ view: true }).scene.nodes || [])
  .filter((n) => n.kind === 'image' && String(n.name).startsWith('cell') && n.imageColor !== -15065818).length
for (let i = 0; i < 80 && filledCells() < 42; i++) step(15)
shot('preview-guide.png')          // 入场自演中：上横幅「俄罗斯方块」+ 下横幅「按任意键开始」+ AI 正在堆
key('KeyboardMoveLeftKeyDown'); key('KeyboardMoveLeftKeyUp')
step(20)
shot('preview-play.png')           // 游戏中：重力已跑，横幅已清
key('KeyboardJumpKeyDown'); key('KeyboardJumpKeyUp')
step(10)
key('KeyboardCharacterSkill4KeyDown'); key('KeyboardCharacterSkill4KeyUp')  // T 填底两行
key('KeyboardJumpKeyDown'); key('KeyboardJumpKeyUp')                        // 硬降触发真实消行
step(10)
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
s.playStop()
