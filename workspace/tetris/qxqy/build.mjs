#!/usr/bin/env node
// 从默认工程出发，用 patch op 组装 Tetris 工程，产出 tetris.save.json 与 device-package GIA。
// 用法：node qxqy/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio, importGia } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

export const T_CELL = 1073742105 // main.lua 里的 T_CELL 常量，构建后核对

export function buildStudio() {
  const s = createStudio()
  const rev = () => s.get().version
  const patch = (op) => s.patch({ ...op, expectedRevision: rev() })

  // 1) 客户端资产：只有 cell 一个模板。
  //    只留一个模板是有意的：模板 guid 在模拟器（authoring）与真机（导入后重编号）不同
  //    （实测 1073742105 vs 1073741849），每多一个模板就多一处导入后校准。
  //    需要"覆盖棋盘"的引导层改成上下横幅（服务端 textbox，按 name 寻址，跨宿主稳定）。
  patch({ op: 'newAsset', assetType: 'client-control-template' })
  patch({ op: 'addTemplate', kind: 'image', name: 'cell' })
  // 手机可点：cursor 区（透明热区）—— 只有 cursor/button 两类控件有 AddCursorEventListener
  // （studio/client/lua-runtime/src/scene.js:64-71 KIND_METHODS），image 没有。
  patch({ op: 'addTemplate', kind: 'cursor', name: 'hit' })
  patch({ op: 'remove', id: 'n1' }) // 默认模板面板，删掉只留 cell/hit

  // 2) 服务端资产：清掉默认橱窗，只留容器 n1（脚本宿主 + 所有 UI 控件的父节点）
  patch({ op: 'selectAsset', assetType: 'server-control-template' })
  for (const id of ['n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'n11']) {
    patch({ op: 'remove', id })
  }

  // 3) 服务端控件：左栏（logo/统计/最高分/提示）+ 右栏（NEXT/键位卡）+ 上下横幅
  //    位置只是 authoring 初值，运行时全部由 Lua 的 SetAnchoredPosition/SetSizeDelta 覆盖
  //    （满幅布局按 GetUICanvasSize 算，换设备不用重新导入）。
  const addTextbox = (name, box) => {
    patch({ op: 'add', parentId: 'n1', kind: 'textbox', name })
    const id = s.get().selectedId
    for (const [key, value] of Object.entries(box)) patch({ op: 'set', id, key, value })
    return id
  }
  const C_FONT = '#FFE8ECF4'   // 主文
  const C_ACCENT = '#FF4CC2FF' // 强调（操作提示）
  const C_GOLD = '#FFFFC24C'   // 得分/标题
  addTextbox('hud', {
    posX: -410, posY: 125, width: 460, height: 40, fontSize: 20, text: 'TETRIS',
    horizontalAlignment: 'Middle',
  })
  addTextbox('hudNext', {
    posX: 410, posY: 230, width: 200, height: 40, fontSize: 22, text: 'NEXT',
    fontColor: C_ACCENT, horizontalAlignment: 'Middle',
  })
  addTextbox('title', {
    posX: -410, posY: 210, width: 420, height: 100, fontSize: 64, text: 'TETRIS',
    fontColor: C_GOLD, horizontalAlignment: 'Middle',
  })
  addTextbox('best', {
    posX: -410, posY: 80, width: 420, height: 36, fontSize: 20, text: 'BEST 0',
    fontColor: C_FONT, horizontalAlignment: 'Middle',
  })
  addTextbox('hint', {
    posX: -410, posY: -60, width: 420, height: 150, fontSize: 22, text: '',
    fontColor: C_ACCENT, horizontalAlignment: 'Middle',
  })
  addTextbox('keyA', {
    posX: 410, posY: -40, width: 420, height: 38, fontSize: 22, text: '← → 移动　　↑ 旋转',
    fontColor: C_FONT, horizontalAlignment: 'Middle',
  })
  addTextbox('keyB', {
    posX: 410, posY: -80, width: 420, height: 38, fontSize: 22, text: '↓ 落下　　空格 直落',
    fontColor: C_FONT, horizontalAlignment: 'Middle',
  })
  addTextbox('keyC', {
    posX: 410, posY: -120, width: 420, height: 38, fontSize: 22, text: 'R 重开　　H 键位表',
    fontColor: C_FONT, horizontalAlignment: 'Middle',
  })
  // 手机按钮标签：textbox + bgColor 当底，点击热区由客户端 cursor 实例覆盖在上面
  const BTN_BG = '#B31A1D26'
  const buttons = [
    ['btnA', '←', -410, -185], ['btnB', '→', -410, -250], ['btnC', '↓', -410, -315],
    ['btnD', '旋转', 410, -185], ['btnE', '直落', 410, -250], ['btnF', '重开', 410, -315],
  ]
  for (const [name, label, x, y] of buttons) {
    addTextbox(name, {
      posX: x, posY: y, width: 150, height: 56, fontSize: 22, text: label,
      fontColor: C_FONT, bgColor: BTN_BG, horizontalAlignment: 'Middle',
      verticalAlignment: 'Middle',
    })
  }
  addTextbox('topBanner', {
    posX: 0, posY: 330, width: 1100, height: 56, fontSize: 34, text: '',
    fontColor: C_GOLD, horizontalAlignment: 'Middle',
  })
  addTextbox('botBanner', {
    posX: 0, posY: -332, width: 1100, height: 44, fontSize: 22, text: '',
    fontColor: C_ACCENT, horizontalAlignment: 'Middle',
  })

  // 4) 脚本挂服务端容器 n1（客户端模板树零脚本）
  // 把本工程实际模板 guid 注入 Lua：模拟器端恒命中，真机端靠候选表 + qxqy/deploy.mjs --calibrate 补
  patch({ op: 'selectAsset', assetType: 'client-control-template' })
  const templates = s.get().root.children || []
  const cellGuid = templates.find((t) => t.name === 'cell')?.guid
  const hitGuid = templates.find((t) => t.name === 'hit')?.guid
  if (!cellGuid || !hitGuid) {
    throw new Error('客户端模板缺少 cell/hit：' + JSON.stringify(templates.map((t) => t.name)))
  }
  patch({ op: 'selectAsset', assetType: 'server-control-template' })
  const lua = readFileSync(join(root, 'lua/main.lua'), 'utf8')
    .replaceAll('__GUID_CELL__', String(cellGuid))
    .replaceAll('__GUID_HIT__', String(hitGuid))
  patch({
    op: 'addScript',
    path: 'lua/main.lua',
    name: 'tetris',
    source: lua,
    controlId: 'n1',
    controlAsset: 'server-control-template',
  })

  const snap = s.get()
  const serverRoot = snap.root
  const controls = (() => {
    let n = 0
    const walk = (node) => { n += 1; (node.children || []).forEach(walk) }
    walk(serverRoot)
    return n
  })()
  if (cellGuid !== T_CELL) {
    throw new Error(`模板 guid 与 build.mjs 的 T_CELL 不一致：${cellGuid} !== ${T_CELL}`)
  }
  return { studio: s, controls, templates: templates.length, cellGuid, hitGuid }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const built = buildStudio()
  const s = built.studio
  // 存档：官方 save 格式（importData('json') / createStudio(seed) 都能直接加载）
  const save = s.exportData('save')
  const saveJson = Buffer.from(save.data, 'base64').toString('utf8')
  writeFileSync(join(root, 'tetris.save.json'), saveJson)

  // GIA 整合包
  mkdirSync(join(root, 'device-package'), { recursive: true })
  const gia = s.exportData('gia-combined')
  const bytes = Buffer.from(gia.data, 'base64')
  const giaPath = join(root, 'device-package/tetris-整合包.gia')
  writeFileSync(giaPath, bytes)

  // 自查：文件非空 + 能重新 importGia() 解出
  const back = importGia(bytes)
  const scriptCount = back.scripts?.length || 0
  const templateCount = (back.clientProject?.root?.children || []).length
  const serverControls = (() => {
    let n = 0
    const walk = (node) => { n += 1; (node.children || []).forEach(walk) }
    walk(back.project.root)
    return n
  })()

  console.log('save bytes      :', Buffer.byteLength(saveJson))
  console.log('gia bytes       :', bytes.length)
  console.log('gia templates   :', templateCount, 'cell=' + built.cellGuid, 'hit=' + built.hitGuid)
  console.log('gia scripts     :', scriptCount, (back.scripts || []).map((x) => x.path))
  console.log('gia server nodes:', serverControls)
  console.log('gia combined    :', back.metadata?.combined)
  console.log('gia warnings    :', back.warnings)
  if (!bytes.length) throw new Error('GIA 为空')
  if (templateCount < 1) throw new Error('GIA 未解出客户端模板')
  if (scriptCount < 1) throw new Error('GIA 未解出脚本映射')
}
