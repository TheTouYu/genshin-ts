/**
 * ui/verification/ticket09-r2-candidate.ts — 票09 R2 runner
 *
 * 用法：npx tsx ui/verification/ticket09-r2-candidate.ts <source.gil> <out.gil> <targetId> <label>
 * 作用：读源 .gil → buildButtonMaterialCandidate → 输出候选到 out.gil（不覆盖已存在文件）。
 * 只对给定文件操作；真实写回请走 assets:ui/既有安全流程（本 runner 不写源、不备份）。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { buildButtonMaterialCandidate } from '../src/button-materials.js'

function main(): void {
  const [source, out, targetRaw, label] = process.argv.slice(2)
  if (!source || !out || !targetRaw || !label) {
    throw new Error('用法: npx tsx ui/verification/ticket09-r2-candidate.ts <source.gil> <out.gil> <targetId> <label>')
  }
  const targetId = Number(targetRaw)
  if (!Number.isSafeInteger(targetId)) throw new Error('[error] targetId 须为整数')
  if (fs.existsSync(out)) throw new Error(`[error] 输出已存在（不覆盖）：${out}`)
  const sourceBytes = new Uint8Array(fs.readFileSync(source))
  const result = buildButtonMaterialCandidate(sourceBytes, { targetId, label })
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
  fs.writeFileSync(out, result.bytes)
  const digest = (b: Uint8Array): string =>
    crypto.createHash('sha256').update(Buffer.from(b)).digest('hex')
  console.log(
    JSON.stringify(
      {
        kind: 'ui-r2-material-candidate',
        sourceSha256: digest(sourceBytes),
        candidateSha256: digest(result.bytes),
        candidate: path.resolve(out),
        newIds: result.newIds,
        stateGroupIds: result.stateGroupIds
      },
      null,
      2
    )
  )
}

main()
