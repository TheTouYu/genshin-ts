/**
 * ui/tests/extract-create-donors.ts — 从真实编辑器快照提取 create donor 字节（票 05，多 kind）
 *
 * 用法：npx tsx ui/tests/extract-create-donors.ts
 * 作用：读取 .gsts/diff-exp/ui学习/ 下编辑器真实样本的「新建那一刻」记录原始字节，
 *       覆写 ui/src/create-donors.ts（自动生成，勿手改）。提取后运行
 *       ui/tests/create-candidates-assert.ts 做字节级对拍。
 *
 * donor 选点（知识权威 references/ui-controls.md；均取该控件在 80 快照中的**首次新建事件**，
 * 后续轮次的记录可能已被编辑（如 2079 在轮20+ 变长），不可作 donor）：
 *   - custom-button.layout    轮4   1073742032 963B  f504=默认布局 1825
 *   - custom-button.container 轮26  1073742089 1156B f504=固有容器 2084
 *   - input-box.layout        轮19  1073742079 622B  f504=自定义布局 1989（轮19 加入 1989）
 *   - input-box.container     轮64  1073742157 622B  f504=容器 2084（与 2079 等长同构，轮64 规则 2）
 *   - textbox.container       轮64  1073742155 604B  f504=容器 2084
 *   - image.container         轮64  1073742156 591B  f504=容器 2084
 *   - message-queue.layout    轮51  1073742132 859B  f504=默认布局 1825
 * 缺快照目录时 SKIP（与 exhaustive-snapshot-verify.ts 同一约定）。
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { parseRoot9 } from '../src/record.js'
import type { UiCreateDonor } from '../src/create-donors.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')
const DONORS_FILE = path.join(ROOT, 'ui', 'src', 'create-donors.ts')

interface DonorSource {
  id: UiCreateDonor['id']
  kind: UiCreateDonor['kind']
  surface: 'layout' | 'container'
  snapshot: string
  recordId: number
  /** 知识权威记录的记录字节长度（漂移即报警，先核对权威文档再改） */
  expectLen: number
  /** 顶层 f504 期望父引用（editor 样本实值，逐项登记） */
  expectParent: number
}

const DONOR_SOURCES: DonorSource[] = [
  {
    id: 'custom-button.layout',
    kind: 'custom-button',
    surface: 'layout',
    snapshot: '1073741909.after-重启4-默认布局自定义按钮-e645aefb.gil',
    recordId: 1073742032,
    expectLen: 963,
    expectParent: 1073741825
  },
  {
    id: 'custom-button.container',
    kind: 'custom-button',
    surface: 'container',
    snapshot: '1073741909.after-重启26-悬浮页加按钮-f0ddb622.gil',
    recordId: 1073742089,
    expectLen: 1156,
    expectParent: 1073742084
  },
  {
    id: 'input-box.layout',
    kind: 'input-box',
    surface: 'layout',
    snapshot: '1073741909.after-重启19-图文输入框-a81cbfbf.gil',
    recordId: 1073742079,
    expectLen: 622,
    expectParent: 1073741989
  },
  {
    id: 'input-box.container',
    kind: 'input-box',
    surface: 'container',
    snapshot: '1073741909.after-重启64-容器三控件-e4c92e39.gil',
    recordId: 1073742157,
    expectLen: 622,
    expectParent: 1073742084
  },
  {
    id: 'textbox.container',
    kind: 'textbox',
    surface: 'container',
    snapshot: '1073741909.after-重启64-容器三控件-e4c92e39.gil',
    recordId: 1073742155,
    expectLen: 604,
    expectParent: 1073742084
  },
  {
    id: 'image.container',
    kind: 'image',
    surface: 'container',
    snapshot: '1073741909.after-重启64-容器三控件-e4c92e39.gil',
    recordId: 1073742156,
    expectLen: 591,
    expectParent: 1073742084
  },
  {
    id: 'message-queue.layout',
    kind: 'message-queue',
    surface: 'layout',
    snapshot: '1073741909.after-重启51-消息队列-536528cb.gil',
    recordId: 1073742132,
    expectLen: 859,
    expectParent: 1073741825
  }
]

if (!fs.existsSync(FIXTURES)) {
  console.log('SKIP: .gsts/diff-exp/ui学习/ 不存在（本地快照核验需真实差分留存）')
  process.exit(0)
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

function extract(): UiCreateDonor[] {
  const donors: UiCreateDonor[] = []
  for (const source of DONOR_SOURCES) {
    const gilPath = path.join(FIXTURES, source.snapshot)
    assert.ok(fs.existsSync(gilPath), `快照缺失: ${source.snapshot}`)
    const parsed = parseRoot9(new Uint8Array(fs.readFileSync(gilPath)))
    const record = parsed.recordsById.get(source.recordId)
    assert.ok(record, `记录 ${source.recordId} 不存在于 ${source.snapshot}`)
    assert.equal(record.kind, source.kind, `记录 ${source.recordId} kind=${record.kind}`)
    assert.equal(
      record.parentId,
      source.expectParent,
      `记录 ${source.recordId} parentId=${record.parentId} != ${source.expectParent}`
    )
    assert.equal(
      record.raw.length,
      source.expectLen,
      `记录 ${source.recordId} 长度 ${record.raw.length} != ${source.expectLen}` +
        '（先核对 references/ui-controls.md 对应轮结论，勿静默改长度）'
    )
    donors.push({
      id: source.id,
      kind: source.kind,
      surface: source.surface,
      sourceSnapshot: source.snapshot,
      selfId: source.recordId,
      parentId: record.parentId!,
      sha256: sha256(record.raw),
      hex: hex(record.raw)
    })
    const donor = donors[donors.length - 1]
    console.log(
      `extracted ${source.id}: ${source.snapshot} record=${source.recordId} len=${record.raw.length}` +
        ` sha256=${donor.sha256.slice(0, 16)}...`
    )
  }
  return donors
}

function render(donors: UiCreateDonor[]): string {
  const donorsLiteral = donors
    .map(
      (d) =>
        `  {\n` +
        `    id: '${d.id}',\n` +
        `    kind: '${d.kind}',\n` +
        `    surface: '${d.surface}',\n` +
        `    sourceSnapshot: '${d.sourceSnapshot}',\n` +
        `    selfId: ${d.selfId},\n` +
        `    parentId: ${d.parentId},\n` +
        `    sha256: '${d.sha256}',\n` +
        `    hex:\n` +
        `      '${d.hex}'\n` +
        `  }`
    )
    .join(',\n')
  return `/**
 * ui/src/create-donors.ts — create 候选的字节级 donor 注册表（票 05，多 kind）
 *
 * ⚠️ AUTO-GENERATED by \`npx tsx ui/tests/extract-create-donors.ts\` —— 勿手改。
 * 字节来源 = 真实编辑器快照（.gsts/diff-exp/ui学习/ 内该控件的首次新建事件轮：
 * 按钮 轮4/轮26；图文输入框 轮19(布局 1989)/轮64(容器)；文本框/图片 轮64(容器)；
 * 消息队列 轮51(默认布局)）。
 * create 候选装配 = 克隆 donor 字节 → 自身 ID/父引用重映射 → （可选）名字/几何 patch。
 * 字节级同步核验见 ui/tests/create-candidates-assert.ts（donor sha 防漂移 + 重放对拍）。
 * 注：textbox/image 的「布局面」无编辑器新建样本——create 层以容器面 donor + f504 重映射
 * 生成（跨面同构轮64 规则 2：内容与放置面无关、仅 f504 不同，输入框对 2079/2157 已在断言中实证）。
 */

export type UiCreateDonorKind = 'custom-button' | 'textbox' | 'image' | 'input-box' | 'message-queue'

export interface UiCreateDonor {
  /** 用途标识 = kind + 放置面（真实编辑器样本存在性即支持矩阵） */
  id:
    | 'custom-button.layout'
    | 'custom-button.container'
    | 'input-box.layout'
    | 'input-box.container'
    | 'textbox.container'
    | 'image.container'
    | 'message-queue.layout'
  kind: UiCreateDonorKind
  surface: 'layout' | 'container'
  /** 提取来源快照文件名（.gsts/diff-exp/ui学习/ 下，gitignored 本地留存） */
  sourceSnapshot: string
  /** 记录自身 ID（顶层 f501） */
  selfId: number
  /** 父引用（顶层 f504）：layout=目标布局 ID；container=悬浮页容器 ID */
  parentId: number
  /** 记录原始字节 sha256（hex 前核验防漂移） */
  sha256: string
  /** 记录原始字节 hex（= 编辑器新建该控件时落盘的字节，全默认形态） */
  hex: string
}

/** 提取脚本覆写点（ui/tests/extract-create-donors.ts 生成） */
export const CREATE_DONORS: UiCreateDonor[] = [
${donorsLiteral}
]

export function createDonor(id: UiCreateDonor['id']): UiCreateDonor {
  const donor = CREATE_DONORS.find((item) => item.id === id)
  if (!donor) {
    throw new Error(
      \`[error] create donor 缺失（\${id}）：先运行 npx tsx ui/tests/extract-create-donors.ts；缺失时禁止凭空猜字节（fail-closed）\`
    )
  }
  return donor
}
`
}

const donors = extract()
assert.equal(donors.length, DONOR_SOURCES.length)
fs.writeFileSync(DONORS_FILE, render(donors))
console.log(`wrote ${DONORS_FILE}`)
console.log('next: npx tsx ui/tests/create-candidates-assert.ts')
