// 技能变量（root15 type=30）编码回归：与真实编辑器产物逐字节比对
//
// 唯一真值来源（2026-10-24，地图 1073741827「真实足球v3」相邻差分）：
//   before sha256=56bab843…（365166B）→ after sha256=4945c21d…（365187B），Δ+21B
//   root15 子记录 5→6，新增编码 30B（28B 记录 + tag/len）：
//     0a1c 08 818080c004 10 1e 22 12 08 01 5a 0e 0a 0c e68a80e883bde58f98e9878f
//   我们生成同样的 root15 payload（8542B）→ sha256 == 编辑器 after 的 root15 payload（a9561bb5…）。
//   证据目录：.scratch/editor-incremental-evidence/2026-10-24-skillvars-1827/
//
// 跑法：npx tsx tests/gil_skill_variables_test.ts
import assert from 'node:assert/strict'

import {
  SKILL_VARIABLE_TYPE_CODE,
  appendSkillVariable,
  assertHeaderInvariants,
  buildGilFile,
  encodeSkillVariableRecord,
  listSkillVariables
} from '../src/cli/assets_skill_variables.js'
import { emitWireMessage, parseWireMessage } from '../src/cli/static_assembly/wire.js'

let passed = 0
function check(name: string, fn: () => void): void {
  try {
    fn()
    passed += 1
    console.log(`ok   ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

// 编辑器实际写入的那条记录的字节（含 root15 内的 0a1c 包装）
const EDITOR_RECORD_HEX =
  '0a1c08818080c004101e221208015a0e0a0ce68a80e883bde58f98e9878f'

check('encodeSkillVariableRecord 与编辑器逐字节一致', () => {
  const record = encodeSkillVariableRecord({ id: 1207959553, name: '技能变量' })
  const wrapped = emitWireMessage([{ number: 1, wire: 2, value: record }])
  assert.equal(Buffer.from(wrapped).toString('hex'), EDITOR_RECORD_HEX)
  assert.equal(record.length, 28)
})

check('类型码是 30', () => {
  assert.equal(SKILL_VARIABLE_TYPE_CODE, 30)
})

check('空 payload 也能建 root15 容器并回读', () => {
  const payload = emitWireMessage([{ number: 3, wire: 2, value: new Uint8Array([1, 2, 3]) }])
  const next = appendSkillVariable(payload, { id: 1207959553, name: 'kit_a' })
  const vars = listSkillVariables(next)
  assert.equal(vars.length, 1)
  assert.equal(vars[0].id, 1207959553)
  assert.equal(vars[0].name, 'kit_a')
})

check('追加到已有 root15 时保留旧记录（顺序追加）', () => {
  const base = emitWireMessage([
    { number: 15, wire: 2, value: emitWireMessage([
      // 既有非技能变量记录：f1=1, f2=28（自定义造物技能）——不应被计入
      { number: 1, wire: 2, value: new Uint8Array([0x08, 0x01, 0x10, 0x1c]) }
    ]) }
  ])
  const next = appendSkillVariable(base, { id: 1207959554, name: 'b' })
  const root15 = parseWireMessage(next)!.find((f) => f.number === 15)!
  const inner = parseWireMessage(root15.value as Uint8Array)!
  assert.equal(inner.filter((f) => f.number === 1 && f.wire === 2).length, 2)
  assert.equal(listSkillVariables(next).length, 1) // 旧记录 type 码不是 30，不算技能变量
})

check('同 ID 重复创建必须报错', () => {
  const payload = emitWireMessage([
    { number: 15, wire: 2, value: emitWireMessage([
      { number: 1, wire: 2, value: encodeSkillVariableRecord({ id: 1207959553, name: 'a' }) }
    ]) }
  ])
  assert.throws(() => appendSkillVariable(payload, { id: 1207959553, name: 'dup' }), /已存在/)
})

check('名字为空串也能编码（name 段 0 长度）', () => {
  const record = encodeSkillVariableRecord({ id: 1207959556, name: '' })
  const payload = emitWireMessage([
    { number: 15, wire: 2, value: emitWireMessage([{ number: 1, wire: 2, value: record }]) }
  ])
  assert.equal(listSkillVariables(payload)[0].name, '')
})

check('buildGilFile 头部长度字段必须跟随 payload（2026-10-24 损坏事故）', () => {
  const payload = new Uint8Array(100)
  const source = new Uint8Array(24)
  source[4] = 0
  source[5] = 0
  source[6] = 0
  source[7] = 1
  source[8] = 0x03
  source[9] = 0x26
  source[12] = 0
  source[13] = 0
  source[14] = 0
  source[15] = 2
  source[20] = 0x00
  source[21] = 0x00
  source[22] = 0x06
  source[23] = 0x79
  const file = buildGilFile(source, payload)
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  assert.equal(view.getUint32(16, false), payload.length, 'word16 必须是 payload 长度')
  assert.equal(view.getUint32(0, false), payload.length + 20, 'word0 必须是 payload+20')
  assert.equal(file.length, payload.length + 24)
})

check('assertHeaderInvariants 必须拦住「payload 变长但头部没更新」', () => {
  const payload = new Uint8Array(20)
  const source = new Uint8Array(24)
  source[8] = 0x03
  source[9] = 0x26
  source[20] = 0x00
  source[21] = 0x00
  source[22] = 0x06
  source[23] = 0x79
  const good = buildGilFile(source, payload)
  assertHeaderInvariants(good) // 不应抛
  const stale = new Uint8Array(good)
  const view = new DataView(stale.buffer, stale.byteOffset, stale.byteLength)
  view.setUint32(16, 5, false) // 伪造：头部长度停在旧值
  assert.throws(() => assertHeaderInvariants(stale), /hdr\[16:20\]/)
})

console.log(`\nskill-variable 回归：${passed} 项通过${process.exitCode ? '（有失败）' : ''}`)
