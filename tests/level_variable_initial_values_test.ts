// @ts-nocheck
/**
 * 关卡实体自定义变量带初始值——编辑器字节回归（2026-08-29 差分 v7）。
 *
 * 编辑器样本：map 1073741915 关卡实体新增 9 个变量并带初始值
 * （str/int/float/bool/vec3 + int_list/float_list/bool_list/vec3_list；
 * vec3=[3,0,0] 零分量稀疏；vec3_list 元素稀疏；快照 var-v7-level-entity-initial-values.gil
 * sha 1d87b5c5…）。本测试锁定两条 CLI 路径生成的 entry 与编辑器逐字节一致。
 * 本轮差分修复：
 *  - vec3 标量/元素从「平铺 {f1,f2,f3: fixed32}」改为「包裹 {1:{f1,f2,f3}} 稀疏」
 *    （零分量省略；全零 = {1:空}）
 *  - 解码器兼容两种形态（读回 3.0 不再误读为 0）
 *
 * Run: npx tsx tests/level_variable_initial_values_test.ts [<editor-sample.gil>]
 */
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { applyEntityCustomVariableDeclarations } from '../src/cli/gil_custom_variables.js'
import { createLevelVariableTyped } from '../src/cli/gil_level_variables.js'

// 编辑器 entry hex（新增变量2..10，不含 v5 已有的新增变量1）
const EDITOR_HEXES: Record<string, string> = {
  新增变量2: '120de696b0e5a29ee58f98e9878f321806221108061204080612008201060a04617364662801320408061200',
  新增变量3: '120de696b0e5a29ee58f98e9878f331803220d08031204080312006a0308cd022801320408031200',
  新增变量4: '120de696b0e5a29ee58f98e9878f341805220f08051204080512007a050d000060422801320408051200',
  新增变量5: '120de696b0e5a29ee58f98e9878f351804220c0804120408041200720208012801320408041200',
  新增变量6: '120de696b0e5a29ee58f98e9878f36180c2212080c1204080c1200b201070a050d0000404028013204080c1200',
  新增变量7: '120de696b0e5a29ee58f98e9878f371808221008081204080812009201050a030003022801320408081200',
  新增变量8: '120de696b0e5a29ee58f98e9878f38180a2215080a1204080a1200a2010a0a08333313400000000028013204080a1200',
  新增变量9: '120de696b0e5a29ee58f98e9878f391809220f08091204080912009a01040a0200012801320408091200',
  新增变量10: '120ee696b0e5a29ee58f98e9878f3130180f221d080f1204080f1200ca01120a000a050d0000e0400a0515000000400a0028013204080f1200'
}

const VALUES: Record<string, { type: string; value: unknown }> = {
  新增变量2: { type: 'str', value: 'asdf' },
  新增变量3: { type: 'int', value: 333 },
  新增变量4: { type: 'float', value: 56 },
  新增变量5: { type: 'bool', value: true },
  新增变量6: { type: 'vec3', value: [3, 0, 0] },
  新增变量7: { type: 'int_list', value: [0, 3, 2] },
  新增变量8: { type: 'float_list', value: [2.3, 0] },
  新增变量9: { type: 'bool_list', value: [false, true] },
  新增变量10: { type: 'vec3_list', value: [[0, 0, 0], [7, 0, 0], [0, 2, 0], [0, 0, 0]] }
}

async function readEntryHex(gilPath: string, name: string, entityId = 1094713345): Promise<string> {
  const { parseWireMessage } = await import('../src/cli/static_assembly/wire.js')
  const bytes = new Uint8Array(readFileSync(gilPath))
  const payload = bytes.slice(20, -4)
  const top = parseWireMessage(payload) ?? []
  const root5 = top.find((f) => f.number === 5 && f.wire === 2)
  const section = parseWireMessage(root5.value) ?? []
  for (const f of section.filter((x) => x.number === 1 && x.wire === 2)) {
    const rec = parseWireMessage(f.value) ?? []
    const id = rec.find((x) => x.number === 1 && x.wire === 0)?.value
    if (id !== entityId) continue
    for (const f7 of rec.filter((x) => x.number === 7 && x.wire === 2)) {
      const comp = parseWireMessage(f7.value) ?? []
      const f11 = comp.find((x) => x.number === 11 && x.wire === 2)
      if (!f11) continue
      const vars = parseWireMessage(f11.value) ?? []
      for (const v of vars.filter((x) => x.number === 1 && x.wire === 2)) {
        const entry = parseWireMessage(v.value) ?? []
        const nameField = entry.find((x) => x.number === 2 && x.wire === 2)
        const n = nameField ? new TextDecoder('utf-8', { fatal: true }).decode(nameField.value) : ''
        if (n === name) return Buffer.from(v.value).toString('hex')
      }
    }
  }
  throw new Error('entry not found: ' + name)
}

const editorSamplePath = process.argv[2]
if (!editorSamplePath) {
  console.log(JSON.stringify({ parseOnly: true, ok: true }, null, 2))
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'gsts-level-init-'))
let bytes = new Uint8Array(readFileSync(editorSamplePath))
for (const name of Object.keys(VALUES)) {
  bytes = createLevelVariableTyped(
    bytes,
    name,
    VALUES[name].type,
    VALUES[name].value,
    1094713345
  ).bytes
}
const gilPath = join(tmp, 'map.gil')
writeFileSync(gilPath, bytes)
for (const name of Object.keys(EDITOR_HEXES)) {
  assert.equal(
    await readEntryHex(gilPath, name),
    EDITOR_HEXES[name],
    `${name} entry must match editor bytes`
  )
}
rmSync(tmp, { recursive: true, force: true })

// ===== 普通实体（v8 样本，可选第二参数）：自定义变量容器同构 + custom 路径字节一致 =====
// 编辑器样本：map 1073741915 新增普通实体 1077936129「空模型」（缩放 0.1×3），
// 变量 新增变量1=vec3_list [[0,3,0]]、新增变量2=float_list [3]、新增变量3=str "adf"
const NORMAL_ENTITY_HEXES: Record<string, string> = {
  新增变量1: '120de696b0e5a29ee58f98e9878f31180f2212080f1204080f1200ca01070a05150000404028013204080f1200',
  新增变量2: '120de696b0e5a29ee58f98e9878f32180a2211080a1204080a1200a201060a040000404028013204080a1200',
  新增变量3: '120de696b0e5a29ee58f98e9878f331806221008061204080612008201050a036164662801320408061200'
}

const normalEntitySample = process.argv[3]
if (normalEntitySample) {
  const tmp2 = mkdtempSync(join(tmpdir(), 'gsts-normal-entity-'))
  const gil2 = join(tmp2, 'map.gil')
  copyFileSync(normalEntitySample, gil2)
  const result = applyEntityCustomVariableDeclarations({
    gilPath: gil2,
    entityId: 1077936129,
    declarations: [
      { name: '新增变量1', type: 'vec3_list', initialValue: [[0, 3, 0]] },
      { name: '新增变量2', type: 'float_list', initialValue: [3] },
      { name: '新增变量3', type: 'str', initialValue: 'adf' }
    ]
  })
  writeFileSync(gil2, result.bytes)
  for (const name of Object.keys(NORMAL_ENTITY_HEXES)) {
    assert.equal(
      await readEntryHex(gil2, name, 1077936129),
      NORMAL_ENTITY_HEXES[name],
      `normal-entity ${name} entry must match editor bytes`
    )
  }
  rmSync(tmp2, { recursive: true, force: true })
}

// ===== 玩家/角色实体（v9 样本，可选第三参数）：容器同构 + 空串默认值 =====
// 玩家实体 def=1000000（如 1086324743「这是玩家变量」str 空串）、角色实体 def=1000001
// （1090519041「这是角色变量」str 空串）；编辑器 f16 = 空消息（不是 {1:len0}）
const PLAYER_CHARACTER_HEXES: Record<string, Record<string, string>> = {
  1086324743: {
    这是玩家变量: '1212e8bf99e698afe78ea9e5aeb6e58f98e9878f1806220b08061204080612008201002801320408061200'
  },
  1090519041: {
    这是角色变量: '1212e8bf99e698afe8a792e889b2e58f98e9878f1806220b08061204080612008201002801320408061200'
  }
}

const playerCharacterSample = process.argv[4]
if (playerCharacterSample) {
  const tmp3 = mkdtempSync(join(tmpdir(), 'gsts-player-character-'))
  const gil3 = join(tmp3, 'map.gil')
  copyFileSync(playerCharacterSample, gil3)
  for (const [entityIdStr, entries] of Object.entries(PLAYER_CHARACTER_HEXES)) {
    const entityId = Number(entityIdStr)
    const result = applyEntityCustomVariableDeclarations({
      gilPath: gil3,
      entityId,
      declarations: Object.keys(entries).map((name) => ({
        name,
        type: 'str' as const,
        initialValue: ''
      }))
    })
    writeFileSync(gil3, result.bytes)
    for (const name of Object.keys(entries)) {
      assert.equal(
        await readEntryHex(gil3, name, entityId),
        entries[name],
        `player/character ${entityId} ${name} entry must match editor bytes`
      )
    }
  }
  rmSync(tmp3, { recursive: true, force: true })
}

console.log(
  JSON.stringify(
    {
      initialValueEntries: Object.keys(EDITOR_HEXES).length,
      normalEntityVerified: !!normalEntitySample,
      playerCharacterVerified: !!playerCharacterSample,
      ok: true
    },
    null,
    2
  )
)
