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

// 入场态抓 8s：AI 自演这时已经落了十几块（能一眼看出"它在自己玩"），标题也已长到 40 号满格
step(240)
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
// gameover：连续硬降堆到顶（不消行）
for (let i = 0; i < 40; i++) {
  key('KeyboardJumpKeyDown'); key('KeyboardJumpKeyUp')
  step(3)
}
step(12)
shot('preview-gameover.png')       // 结算页：顶部「游戏结束」+ 底部成绩/两个选项 + 棋盘压暗
key('KeyboardCharacterSkill2KeyDown'); key('KeyboardCharacterSkill2KeyUp')   // Q 结算明细
step(2)
shot('preview-gameover-detail.png')
s.playStop()
