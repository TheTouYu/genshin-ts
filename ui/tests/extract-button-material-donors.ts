/**
 * ui/tests/extract-button-material-donors.ts — 提取按钮三态素材 donor（票09 R2）
 *
 * 用法：npx tsx ui/tests/extract-button-material-donors.ts
 * 作用：从真实编辑器快照提取"按钮状态素材组 + 成员"的原始记录字节，
 *       覆写 ui/src/button-material-donors.ts（自动生成，勿手改）。
 * 样本来源（票09 R2 取证）：
 *   - 常态组 1073742041（651B, 成员 2042 textbox + 2043 image）← 重启8
 *   - 悬浮组 1073742044（646B, 成员 2069 textbox）← 重启28
 *   - 按下组 2070 与悬浮组同构（646B 单成员）→ 结构复用悬浮组（文字灰态由调用方改色）
 * 快照目录缺失时 SKIP（与 exhaustive-snapshot-verify.ts 同约定）。
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { parseRoot9 } from '../src/record.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')
const OUT = path.join(ROOT, 'ui', 'src', 'button-material-donors.ts')

const S8 = path.join(FIXTURES, '1073741909.after-重启8-常态素材文本框图片-bc9f8198.gil')
const S28 = path.join(FIXTURES, '1073741909.after-重启28-悬浮按钮状态素材-127e82c2.gil')

interface DonorSet {
  key: string
  gil: string
  groupId: number
  expectGroupLen: number
}

const SETS: DonorSet[] = [
  { key: 'normal', gil: S8, groupId: 1073742041, expectGroupLen: 651 },
  { key: 'hover', gil: S28, groupId: 1073742044, expectGroupLen: 646 }
]

function hex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex')
}

function main(): void {
  if (!fs.existsSync(S8) || !fs.existsSync(S28)) {
    console.log('SKIP: 缺少快照目录 .gsts/diff-exp/ui学习（button-material donors 未提取）')
    return
  }
  const sets: Array<Record<string, unknown>> = []
  for (const s of SETS) {
    const bytes = new Uint8Array(fs.readFileSync(s.gil))
    const p = parseRoot9(bytes)
    const group = p.recordsById.get(s.groupId)
    assert.ok(group, `${s.key}: group ${s.groupId} missing in ${path.basename(s.gil)}`)
    assert.equal(group.raw.length, s.expectGroupLen, `${s.key}: group len drift`)
    const members = p.records.filter((r) => r.parentId === s.groupId)
    assert.ok(members.length >= 1, `${s.key}: group has no members`)
    sets.push({
      key: s.key,
      source: path.basename(s.gil),
      group: { id: group.id, rawHex: hex(group.raw), len: group.raw.length },
      members: members.map((m) => ({
        id: m.id,
        kind: m.kind,
        rawHex: hex(m.raw),
        len: m.raw.length
      }))
    })
  }
  const sha = crypto.createHash('sha256')
  for (const st of sets) {
    sha.update(JSON.stringify(st))
  }
  const digest = sha.digest('hex').slice(0, 12)
  const body = `// 自动生成（ui/tests/extract-button-material-donors.ts），勿手改。指纹 ${digest}
export interface ButtonMaterialDonorSet {
  key: 'normal' | 'hover'
  source: string
  group: { id: number; len: number; rawHex: string }
  members: Array<{ id: number; kind: string; len: number; rawHex: string }>
}

export const BUTTON_MATERIAL_DONORS: ButtonMaterialDonorSet[] = ${JSON.stringify(sets, null, 2).replace(
    /"rawHex": "(.*?)"/g,
    (_, h: string) => `"rawHex":\n      "${h}"`
  )}
`
  fs.writeFileSync(OUT, body)
  console.log(`wrote ${OUT} (${sets.length} donor sets, sha ${digest})`)
}

main()
