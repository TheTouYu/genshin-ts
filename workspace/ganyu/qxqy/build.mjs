#!/usr/bin/env node
// 《霜华纪》构建：默认工程 → 3 个客户端模板 + 服务端脚本 → save.json + GIA 整合包
// 用法：node qxqy/build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createStudio, importGia } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BUILD_ID = process.env.GANYU_BUILD_ID || String(Date.now())

export function buildStudio() {
  const s = createStudio()
  const rev = () => s.get().version
  const patch = (op) => s.patch({ ...op, expectedRevision: rev() })

  // ---- 客户端模板：prim(image) / label(textbox) / hit(cursor)
  patch({ op: 'newAsset', assetType: 'client-control-template' })
  patch({ op: 'addTemplate', kind: 'image', name: 'prim' })
  patch({ op: 'addTemplate', kind: 'textbox', name: 'label' })
  patch({ op: 'addTemplate', kind: 'cursor', name: 'hit' })
  patch({ op: 'remove', id: 'n1' })
  const tpl = Object.fromEntries((s.get().root.children || []).map((t) => [t.name, t.guid]))
  for (const k of ['prim', 'label', 'hit']) if (!tpl[k]) throw new Error('模板缺失: ' + k)

  // 客户端模板的默认尺寸/字号：authoring 初值，Lua 运行时会再设
  const primNode = s.get().root.children.find((t) => t.name === 'prim')
  const labelNode = s.get().root.children.find((t) => t.name === 'label')
  const hitNode = s.get().root.children.find((t) => t.name === 'hit')
  for (const [node, box] of [
    [primNode, { posX: 0, posY: 0, width: 100, height: 100 }],
    [labelNode, { posX: 0, posY: 0, width: 300, height: 48, fontSize: 24, text: '', horizontalAlignment: 'Middle', verticalAlignment: 'Middle' }],
    [hitNode, { posX: 0, posY: -100000, width: 100, height: 40 }],
  ]) {
    for (const [key, value] of Object.entries(box)) patch({ op: 'set', id: node.id, key, value })
  }

  // ---- 服务端：只留 n1（脚本宿主），删掉默认演示控件
  patch({ op: 'selectAsset', assetType: 'server-control-template' })
  for (const id of ['n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'n11']) {
    patch({ op: 'remove', id })
  }

  // ---- 拼接 Lua 源（模块化，避免单文件难维护；main chunk 的 local 上限靠 T 表规避）
  const srcDir = join(root, 'lua/src')
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.lua')).sort()
  if (!files.length) throw new Error('lua/src 为空')
  let lua = '-- 由 qxqy/build.mjs 从 lua/src/*.lua 生成，请勿手改本文件\n'
  for (const f of files) {
    lua += `\n-- ===== ${f} =====\n` + readFileSync(join(srcDir, f), 'utf8') + '\n'
  }
  lua = lua
    .replaceAll('__GUID_PRIM__', String(tpl.prim))
    .replaceAll('__GUID_LABEL__', String(tpl.label))
    .replaceAll('__GUID_HIT__', String(tpl.hit))
    .replaceAll('__BUILD_ID__', BUILD_ID)
  if (/__GUID_[A-Z]+__/.test(lua)) throw new Error('Lua 里还有未注入的模板占位符')
  writeFileSync(join(root, 'lua/main.lua'), lua)

  // ---- 语法门：lua5.3
  execFileSync('lua5.3', ['-e', `assert(loadfile('${join(root, 'lua/main.lua').replaceAll("'", "\\'")}'))`], { stdio: 'pipe' })

  patch({
    op: 'addScript',
    path: 'lua/main.lua',
    name: 'ganyu_main',
    source: lua,
    controlId: 'n1',
    controlAsset: 'server-control-template',
  })

  const controls = (() => {
    let n = 0
    const walk = (node) => { n += 1; (node.children || []).forEach(walk) }
    walk(s.get().root)
    return n
  })()
  return { studio: s, lua, templates: tpl, controls, files, buildId: BUILD_ID }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const built = buildStudio()
  const s = built.studio
  const save = s.exportData('save')
  const saveRaw = Buffer.from(save.data, 'base64').toString('utf8')
  const saveObj = JSON.parse(saveRaw)
  if (!saveObj.meta) saveObj.meta = {}
  saveObj.meta.name = '霜华纪'
  saveObj.meta.description = '霜华纪 · 四季茶席与茶点三消'
  const saveJson = JSON.stringify(saveObj)
  writeFileSync(join(root, 'ganyu.save.json'), saveJson)
  mkdirSync(join(root, 'device-package'), { recursive: true })
  const gia = s.exportData('gia-combined')
  const bytes = Buffer.from(gia.data, 'base64')
  const giaPath = join(root, 'device-package/霜华纪-整合包.gia')
  writeFileSync(giaPath, bytes)
  const back = importGia(bytes)
  const templateCount = (back.clientProject?.root?.children || []).length
  console.log('build id        :', built.buildId)
  console.log('lua modules     :', built.files.join(', '))
  console.log('lua bytes/lines :', Buffer.byteLength(built.lua), built.lua.split('\n').length)
  console.log('save bytes      :', Buffer.byteLength(saveJson))
  console.log('gia bytes       :', bytes.length)
  console.log('templates       :', templateCount, JSON.stringify(built.templates))
  console.log('scripts         :', back.scripts?.length, (back.scripts || []).map((x) => x.path))
  console.log('server controls :', built.controls)
  console.log('warnings        :', back.warnings)
  if (!bytes.length) throw new Error('GIA 为空')
  if (templateCount !== 3) throw new Error('GIA 模板数应为 3，实得 ' + templateCount)
  if (!(back.scripts || []).length) throw new Error('GIA 未解出脚本映射')
}
