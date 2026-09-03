/**
 * ui/tests/button-materials-assert.ts — 票09 R2 自检断言
 *
 * 用法：npx tsx ui/tests/button-materials-assert.ts
 * 检查：buildButtonMaterialCandidate 对"空素材自定义按钮"装配三态文字素材后——
 *   1) 三态状态块引用新素材组；2) 素材组(ty55)与成员结构成立（文本框成员文本=label、颜色按三态）；
 *   3) 悬停/按下缩放=1.1/0.9；4) 顶层索引含新组；5) 除目标按钮+新记录外无其它变化；
 *   6) 对已装配按钮再次调用幂等拒绝。输入副本缺失时 SKIP。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { parseRoot9 } from '../src/record.js'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import { listButtonStates } from '../../src/cli/gil_ui.js'
import { buildButtonMaterialCandidate } from '../src/button-materials.js'
import { removeMaterialGroupMember } from '../src/material-groups.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const WORK = path.join(ROOT, '.gsts', 'diff-exp', 'UI核验09', 'work-7128e03b.gil')
const TARGET = 1073741843
const LABEL = '核验按钮09'

function textAndColor(raw: Uint8Array): { txt: string; color: number | null } {
  const m = parseWireMessage(raw)
  assert.ok(m)
  for (const slot of m) {
    if (slot.number !== 505 || slot.wire !== 2) continue
    const comp = parseWireMessage(slot.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 25) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    const c503 = parseWireMessage(f503!.value as Uint8Array)!
    const f19f = c503.find((x) => x.number === 19 && x.wire === 2)
    const f19 = parseWireMessage(f19f!.value as Uint8Array)!
    const f505 = f19.find((x) => x.number === 505 && x.wire === 2)
    const f505m = parseWireMessage(f505!.value as Uint8Array)!
    const txtBuf = f505m.find((x) => x.number === 501 && x.wire === 2)?.value as Uint8Array | undefined
    const color = (f19.find((x) => x.number === 510 && x.wire === 0)?.value as number | undefined) ?? null
    return { txt: txtBuf ? Buffer.from(txtBuf).toString('utf8') : '', color: color === null ? null : color >>> 0 }
  }
  return { txt: '?', color: null }
}

function blockScales(raw: Uint8Array): number[] {
  const m = parseWireMessage(raw)
  assert.ok(m)
  for (const slot of m) {
    if (slot.number !== 505 || slot.wire !== 2) continue
    const comp = parseWireMessage(slot.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 50) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    const f503m = parseWireMessage(f503!.value as Uint8Array)!
    const f43 = f503m.find((x) => x.number === 43 && x.wire === 2)
    const f43m = parseWireMessage(f43!.value as Uint8Array)!
    const con = f43m.find((x) => x.number === 503 && x.wire === 2)
    const cm = parseWireMessage(con!.value as Uint8Array)!
    const out: number[] = []
    for (const k of [501, 502, 503]) {
      const bf = cm.find((x) => x.number === k && x.wire === 2)
      assert.ok(bf, `block field ${k} missing`)
      const blk = parseWireMessage(bf.value as Uint8Array)!
      const f504 = blk.find((x) => x.number === 504 && x.wire === 2)
      assert.ok(f504, `block ${k} scale missing`)
      const pair = parseWireMessage(f504.value as Uint8Array)!
      const v = pair.find((x) => x.number === 501 && x.wire === 5)
      assert.ok(v)
      out.push(Buffer.from(v.value as Uint8Array).readFloatLE(0))
    }
    return out
  }
  return []
}

function main(): void {
  if (!fs.existsSync(WORK)) {
    console.log('SKIP: 缺少输入副本 .gsts/diff-exp/UI核验09/work-7128e03b.gil')
    return
  }
  const sourceBytes = new Uint8Array(fs.readFileSync(WORK))
  const sourceParsed = parseRoot9(sourceBytes)
  const sourceRecordIds = new Set(sourceParsed.records.map((r) => r.id))
  const result = buildButtonMaterialCandidate(sourceBytes, { targetId: TARGET, label: LABEL })
  const cand = parseRoot9(result.bytes)
  assert.equal(cand.records.length, sourceParsed.records.length + 7, '记录数应 +7（3 组 + 4 成员）')

  // 1) 三态状态块引用
  const states = listButtonStates(result.bytes, TARGET)
  assert.equal(states[0]?.materialGroupId, result.stateGroupIds[0])
  assert.equal(states[1]?.materialGroupId, result.stateGroupIds[1])
  assert.equal(states[2]?.materialGroupId, result.stateGroupIds[2])
  assert.equal(states[3]?.materialGroupId, null, '禁用态应保持空')

  // 2) 组 + 成员文本/颜色
  const expects = [
    { group: result.stateGroupIds[0], color: 0xffffffff, memberCount: 2 },
    { group: result.stateGroupIds[1], color: 0xffb4cd23, memberCount: 1 },
    { group: result.stateGroupIds[2], color: 0xff808080, memberCount: 1 }
  ]
  for (const e of expects) {
    const grp = cand.recordsById.get(e.group)
    assert.ok(grp, `group ${e.group} exists`)
    assert.equal(grp.indexed, true, `group ${e.group} should be indexed`)
    const members = cand.records.filter((r) => r.parentId === e.group)
    assert.equal(members.length, e.memberCount)
    const textMembers = members.filter((m) => m.kind === 'textbox')
    assert.ok(textMembers.length >= 1, `group ${e.group} has textbox member`)
    for (const tm of textMembers) {
      const tc = textAndColor(tm.raw)
      assert.equal(tc.txt, LABEL, `member text should be label`)
      assert.equal(tc.color, e.color, `member color should match state spec`)
    }
  }

  // 3) 缩放
  const btnRaw = cand.recordsById.get(TARGET)!
  const scales = blockScales(btnRaw.raw)
  assert.equal(scales.length, 3)
  assert.ok(Math.abs(scales[0] - 1.0) < 1e-6, `normal scale 1.0 got ${scales[0]}`)
  assert.ok(Math.abs(scales[1] - 1.1) < 1e-6, `hover scale 1.1 got ${scales[1]}`)
  assert.ok(Math.abs(scales[2] - 0.9) < 1e-6, `press scale 0.9 got ${scales[2]}`)

  // 4) 顶层索引
  for (const g of result.stateGroupIds) assert.ok(cand.indexIds.has(g), `index contains ${g}`)

  // 5) 除目标按钮与新记录外无其它变化
  for (const r of cand.records) {
    if (sourceRecordIds.has(r.id) && r.id !== TARGET) {
      assert.equal(r.raw.length, sourceParsed.recordsById.get(r.id)!.raw.length, `record ${r.id} 不应变化`)
    }
  }

  // 6) 幂等拒绝：对已装配候选再跑应抛"已有素材"
  assert.throws(
    () => buildButtonMaterialCandidate(result.bytes, { targetId: TARGET, label: LABEL }),
    /已有素材/
  )

  // 7) 素材组成员删除（R3：常态去掉图片成员，只留文字）
  const cand2 = parseRoot9(result.bytes)
  const g0 = cand2.recordsById.get(result.stateGroupIds[0])!
  const imageMember = cand2.records.find(
    (r) => r.parentId === g0.id && r.kind === 'image'
  )
  assert.ok(imageMember, '常态组应有 image 成员待删除')
  const afterRemove = removeMaterialGroupMember(result.bytes, {
    groupId: g0.id,
    memberId: imageMember.id
  })
  const cand3 = parseRoot9(afterRemove.bytes)
  const g0b = cand3.recordsById.get(g0.id)!
  assert.ok(g0b, '组仍在')
  const members0 = cand3.records.filter((r) => r.parentId === g0.id)
  assert.equal(members0.length, 1, '常态组只剩 1 成员')
  assert.equal(members0[0]?.kind, 'textbox', '剩员应为文本框')
  assert.ok(!cand3.recordsById.has(imageMember.id), 'image 成员记录已物理移除')
  // 悬停/按下组与状态引用不受影响
  const states3 = listButtonStates(afterRemove.bytes, TARGET)
  assert.equal(states3[0]?.materialGroupId, result.stateGroupIds[0])
  assert.equal(states3[1]?.materialGroupId, result.stateGroupIds[1])
  assert.equal(states3[2]?.materialGroupId, result.stateGroupIds[2])

  console.log(
    `PASS button-material-assert: states=${states.map((s) => s.materialGroupId ?? '∅').join('/')} ` +
      `groups=${result.stateGroupIds.join(',')} scale=${scales.map((v) => v.toFixed(2)).join('/')} ` +
      `removeImage=OK`
  )
}

main()
