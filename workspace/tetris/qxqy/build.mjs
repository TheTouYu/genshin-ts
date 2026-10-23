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

  // 1) 客户端资产：只留一个 image 模板（每格 1 控件，200 实例共用它）
  patch({ op: 'newAsset', assetType: 'client-control-template' })
  patch({ op: 'addTemplate', kind: 'image', name: 'cell' })
  patch({ op: 'remove', id: 'n1' }) // 默认模板面板，删掉只留 cell

  // 2) 服务端资产：清掉默认橱窗，只留容器 n1（脚本宿主 + HUD 父节点）
  patch({ op: 'selectAsset', assetType: 'server-control-template' })
  for (const id of ['n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'n11']) {
    patch({ op: 'remove', id })
  }

  // 3) HUD 两个服务端 textbox（add 的 id 由工程自动分配，取 selectedId）
  const addTextbox = (name, box) => {
    patch({ op: 'add', parentId: 'n1', kind: 'textbox', name })
    const id = s.get().selectedId
    for (const [key, value] of Object.entries(box)) patch({ op: 'set', id, key, value })
    return id
  }
  addTextbox('hud', {
    posX: 0, posY: 310, width: 760, height: 40, fontSize: 24, text: 'TETRIS',
  })
  addTextbox('hudNext', {
    posX: 300, posY: 240, width: 220, height: 40, fontSize: 22, text: 'NEXT -',
  })

  // 4) 脚本挂服务端容器 n1（客户端模板树零脚本）
  const lua = readFileSync(join(root, 'lua/main.lua'), 'utf8')
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
  // 模板 guid 在客户端资产视图里读（get() 只暴露当前资产）
  patch({ op: 'selectAsset', assetType: 'client-control-template' })
  const templates = s.get().root.children || []
  const templateGuid = templates[0]?.guid
  patch({ op: 'selectAsset', assetType: 'server-control-template' })
  if (templateGuid !== T_CELL) {
    throw new Error(`模板 guid 与 main.lua 的 T_CELL 不一致：${templateGuid} !== ${T_CELL}`)
  }
  return { studio: s, controls, templates: templates.length }
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
  console.log('gia templates   :', templateCount)
  console.log('gia scripts     :', scriptCount, (back.scripts || []).map((x) => x.path))
  console.log('gia server nodes:', serverControls)
  console.log('gia combined    :', back.metadata?.combined)
  console.log('gia warnings    :', back.warnings)
  if (!bytes.length) throw new Error('GIA 为空')
  if (templateCount < 1) throw new Error('GIA 未解出客户端模板')
  if (scriptCount < 1) throw new Error('GIA 未解出脚本映射')
}
