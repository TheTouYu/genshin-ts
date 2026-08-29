// @ts-nocheck
/**
 * 关卡实体 str_list 空字符串元素回归（2026-08-29 差分 v5）。
 *
 * 编辑器样本：关卡实体新增变量1 = str_list 长度 5（5 个空字符串，默认值形态，
 * map 1073741915，快照 var-v5-level-entity-list-len5.gil sha d4b71376…）。
 * 旧 CLI 把空元素过滤掉（",,,," → []），长度丢失；custom-variables 路径的 entry f6
 * 类型包裹还多包一层（{1:11,2:{1:11,2:{}}} vs 编辑器 {1:11,2:{}}）——均已修复。
 *
 * Run: npx tsx tests/level_variable_str_list_empty_test.ts [<editor-sample.gil>]
 */
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseCreateValue } from '../src/cli/assets_level_variables.js'
import { applyEntityCustomVariableDeclarations } from '../src/cli/gil_custom_variables.js'
import { createLevelVariableTyped } from '../src/cli/gil_level_variables.js'

// 1. 解析层：空字符串元素必须保留
assert.deepEqual(parseCreateValue('str_list', ',,,,', ), ['', '', '', '', ''])
assert.deepEqual(parseCreateValue('str_list', 'a,,b'), ['a', '', 'b'])
assert.deepEqual(parseCreateValue('int_list', '1,2'), [1, 2])

const editorSamplePath = process.argv[2]
if (!editorSamplePath) {
  console.log(JSON.stringify({ parseOnly: true, ok: true }, null, 2))
  process.exit(0)
}

// 2. 字节层：两条 CLI 路径生成的 entry 与编辑器样本逐字节一致（editor entry hex 常量）
const EDITOR_ENTRY_HEX = '120de696b0e5a29ee58f98e9878f31180b2215080b1204080b1200aa010a0a000a000a000a000a0028013204080b1200'

// 与编辑器样本同容器同名的 entry（样本里该变量在关卡实体 root5.1.7.11）
async function readEntryHex(gilPath: string): Promise<string> {
  // 复用会话脚本：直接内联解析（root5.1 → f7 → f11 → 按名找 entry）
  const { parseWireMessage } = await import('../src/cli/static_assembly/wire.js')
  const bytes = new Uint8Array(readFileSync(gilPath))
  const payload = bytes.slice(20, -4)
  const top = parseWireMessage(payload) ?? []
  const root5 = top.find((f) => f.number === 5 && f.wire === 2)
  const section = parseWireMessage(root5.value) ?? []
  for (const f of section.filter((x) => x.number === 1 && x.wire === 2)) {
    const rec = parseWireMessage(f.value) ?? []
    const id = rec.find((x) => x.number === 1 && x.wire === 0)?.value
    const def = rec.find((x) => x.number === 8 && x.wire === 0)?.value
    if (id !== 1094713345 && def !== 10003004) continue
    const f7 = rec.find((x) => x.number === 7 && x.wire === 2)
    const comp = parseWireMessage(f7.value) ?? []
    const f11 = comp.find((x) => x.number === 11 && x.wire === 2)
    const vars = parseWireMessage(f11.value) ?? []
    for (const v of vars.filter((x) => x.number === 1 && x.wire === 2)) {
      const entry = parseWireMessage(v.value) ?? []
      const nameField = entry.find((x) => x.number === 2 && x.wire === 2)
      const name = nameField
        ? new TextDecoder('utf-8', { fatal: true }).decode(nameField.value)
        : ''
      if (name === '新增变量1') return Buffer.from(v.value).toString('hex')
    }
  }
  throw new Error('entry not found')
}

const tmp = mkdtempSync(join(tmpdir(), 'gsts-str-list-empty-'))
const gilA = join(tmp, 'a.gil')
const gilB = join(tmp, 'b.gil')
copyFileSync(editorSamplePath, gilA)
copyFileSync(editorSamplePath, gilB)

// 注意：样本里已有同名变量，直接用不同名创建再改名会改变字节；改为在样本上对
// 同名变量做"同值 update"（upsert 幂等，字节应保持编辑器原样）
const updated = createLevelVariableTyped(
  new Uint8Array(readFileSync(gilA)),
  '新增变量1',
  'str_list',
  ['', '', '', '', ''],
  1094713345
)
writeFileSync(gilA, updated.bytes)
assert.equal(await readEntryHex(gilA), EDITOR_ENTRY_HEX, 'level-variables path must stay editor-identical')

const customResult = applyEntityCustomVariableDeclarations({
  gilPath: gilB,
  entityId: 1094713345,
  declarations: [{ name: '新增变量1', type: 'str_list', initialValue: ['', '', '', '', ''] }]
})
writeFileSync(gilB, customResult.bytes)
assert.equal(await readEntryHex(gilB), EDITOR_ENTRY_HEX, 'custom-variables path must be editor-identical')

console.log(JSON.stringify({ parseOnly: false, levelPath: true, customPath: true, ok: true }, null, 2))
