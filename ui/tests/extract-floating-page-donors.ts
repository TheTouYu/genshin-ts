/**
 * ui/tests/extract-floating-page-donors.ts — 从真实编辑器快照提取悬浮页 donor 字节（票10）
 *
 * 用法：
 *   npx tsx ui/tests/extract-floating-page-donors.ts          # 提取 donor → 覆写 ui/src/floating-page-donors.ts
 *   npx tsx ui/tests/extract-floating-page-donors.ts --dump   # 结构探针（字段树 dump，不写文件）
 *
 * donor 选点（references/ui-controls.md；均取该动作的**首次新建事件**原始字节）：
 *   - entity             轮24  1073742083  613B  f504=库容器 1840（悬浮页实体，3 条单条族之一）
 *   - builtin-container  轮24  1073742084  139B  parent=None（固有容器组，f503 members [2085]）
 *   - close-button       轮24  1073742085  1075B f504=2084（交互页关闭按钮）
 *   - page-container     轮33  1073742107  131B  parent=None（页面容器，comps 11/43，出生带初始生效标记）
 * 缺快照目录时 SKIP（与 exhaustive-snapshot-verify.ts 同一约定）。
 * --dump 模式：输出 2107（轮47 后=带标记 / 轮48 后=无标记）与轮3 形式变量实体（t41）的
 * 递归字段树，供引擎写路径取证（读图核验红线：先看真实字节再写引擎）。
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { parseWireMessage, type WireField } from '../../src/cli/static_assembly/wire.js'
import { parseRoot9 } from '../src/record.js'
import type { FloatingPageDonor } from '../src/floating-page-donors.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')
const DONORS_FILE = path.join(ROOT, 'ui', 'src', 'floating-page-donors.ts')

const ROUND24_AFTER = '1073741909.after-重启24-悬浮交互页-139e22a6.gil'
const ROUND33_AFTER = '1073741909.after-重启33-页面容器-4590a9d2.gil'
const ROUND48_BEFORE = '1073741909.after-重启47-同步页签配置-8c2b8e4e.gil'
const ROUND48_AFTER = '1073741909.after-重启48-初始生效容器1-8737dadd.gil'
const ROUND3_BEFORE = '1073741909.after-轮2.gil'
const ROUND3_AFTER = '1073741909.after-轮3.gil'

interface DonorSource {
  id: FloatingPageDonor['id']
  snapshot: string
  recordId: number
  expectLen: number
  /** 顶层 f504 期望父引用；parentless 顶层记录为 null */
  expectParent: number | null
  expectKind: string
}

const DONOR_SOURCES: DonorSource[] = [
  {
    id: 'entity',
    snapshot: ROUND24_AFTER,
    recordId: 1073742083,
    expectLen: 613,
    expectParent: 1073741840,
    expectKind: 'floating-page'
  },
  {
    id: 'builtin-container',
    snapshot: ROUND24_AFTER,
    recordId: 1073742084,
    expectLen: 139,
    expectParent: null,
    expectKind: 'container'
  },
  {
    id: 'close-button',
    snapshot: ROUND24_AFTER,
    recordId: 1073742085,
    expectLen: 1075,
    expectParent: 1073742084,
    expectKind: 'close-button'
  },
  {
    id: 'page-container',
    snapshot: ROUND33_AFTER,
    recordId: 1073742107,
    expectLen: 131,
    expectParent: null,
    expectKind: 'container'
  }
]

if (!fs.existsSync(FIXTURES)) {
  console.log('SKIP: .gsts/diff-exp/ui学习/ 不存在（本地快照核验需真实差分留存）')
  process.exit(0)
}

function load(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES, file)))
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

// ============ --dump 结构探针 ============
function dumpFields(fields: readonly WireField[], indent: string, depth: number): void {
  for (const f of fields) {
    if (f.wire === 2 && f.value instanceof Uint8Array) {
      const buf = Buffer.from(f.value)
      const inner = parseWireMessage(f.value)
      const utf8 = buf.length > 0 && buf.every((b) => b >= 0x20 && b < 0x7f) ||
        /^[\s\x20-\uffff]+$/u.test(buf.toString('utf8').replace(/\x00/g, ''))
      const text = utf8 && !inner ? ` utf8="${buf.toString('utf8')}"` : ''
      const head = `${indent}f${f.number}/w2 len=${f.value.length}${text}`
      if (inner && depth > 0) {
        console.log(head + ' {')
        dumpFields(inner, indent + '  ', depth - 1)
        console.log(indent + '}')
      } else {
        console.log(head + (inner ? ' {…group…}' : ` bytes=${buf.toString('hex').slice(0, 64)}`))
      }
    } else {
      console.log(`${indent}f${f.number}/w${f.wire} value=${f.value}`)
    }
  }
}

function dumpRecord(file: string, recordId: number, depth = 4): void {
  const parsed = parseRoot9(load(file))
  const record = parsed.recordsById.get(recordId)
  console.log(`\n===== ${file} #${recordId} kind=${record?.kind} len=${record?.raw.length ?? '?'} =====`)
  if (!record) {
    console.log('(missing)')
    return
  }
  dumpFields(record.fields, '', depth)
}

function dumpMode(): void {
  console.log('--- 结构探针：容器初始生效标记（2107 轮47后=带 / 轮48后=无） ---')
  dumpRecord(ROUND48_BEFORE, 1073742107)
  dumpRecord(ROUND48_AFTER, 1073742107)
  console.log('\n--- 结构探针：固有容器 2084（轮48 后，带初始生效） ---')
  dumpRecord(ROUND48_AFTER, 1073742084)
  console.log('\n--- 结构探针：悬浮页实体 2083（轮24，t42/t44 形态） ---')
  dumpRecord(ROUND24_AFTER, 1073742083)
  console.log('\n--- 结构探针：轮3 形式变量（t41） ---')
  const before = parseRoot9(load(ROUND3_BEFORE))
  const after = parseRoot9(load(ROUND3_AFTER))
  const beforeLen = new Map(before.records.map((r) => [r.id, r.raw.length] as const))
  for (const rec of after.records) {
    const prev = beforeLen.get(rec.id)
    if (prev === undefined || prev !== rec.raw.length) {
      console.log(
        `changed: #${rec.id} kind=${rec.kind} ${prev ?? 'new'} -> ${rec.raw.length}` +
          ` name="${rec.name}"`
      )
    }
  }
  const entity = after.records.find((r) => r.compTypes.includes(44))
  if (entity) {
    console.log(`floating entity = #${entity.id}`)
    dumpRecord(ROUND3_AFTER, entity.id, 6)
  }
}

if (process.argv.includes('--dump')) {
  dumpMode()
  process.exit(0)
}

// ============ donor 提取 ============
function extract(): FloatingPageDonor[] {
  const donors: FloatingPageDonor[] = []
  for (const source of DONOR_SOURCES) {
    const gilPath = path.join(FIXTURES, source.snapshot)
    assert.ok(fs.existsSync(gilPath), `快照缺失: ${source.snapshot}`)
    const parsed = parseRoot9(new Uint8Array(fs.readFileSync(gilPath)))
    const record = parsed.recordsById.get(source.recordId)
    assert.ok(record, `记录 ${source.recordId} 不存在于 ${source.snapshot}`)
    assert.equal(
      record.parentId,
      source.expectParent,
      `记录 ${source.recordId} parentId=${record.parentId} != ${source.expectParent}`
    )
    assert.equal(record.kind, source.expectKind, `记录 ${source.recordId} kind=${record.kind}`)
    assert.equal(
      record.raw.length,
      source.expectLen,
      `记录 ${source.recordId} 长度 ${record.raw.length} != ${source.expectLen}` +
        '（先核对 references/ui-controls.md 对应轮结论，勿静默改长度）'
    )
    donors.push({
      id: source.id,
      sourceSnapshot: source.snapshot,
      selfId: source.recordId,
      parentId: record.parentId,
      sha256: sha256(record.raw),
      hex: hex(record.raw)
    })
    const donor = donors[donors.length - 1]
    console.log(
      `extracted ${source.id}: ${source.snapshot} record=${source.recordId}` +
        ` len=${record.raw.length} sha256=${donor.sha256.slice(0, 16)}...`
    )
  }
  return donors
}

function render(donors: FloatingPageDonor[]): string {
  const donorsLiteral = donors
    .map(
      (d) =>
        `  {\n` +
        `    id: '${d.id}',\n` +
        `    sourceSnapshot: '${d.sourceSnapshot}',\n` +
        `    selfId: ${d.selfId},\n` +
        `    parentId: ${d.parentId === null ? 'null' : d.parentId},\n` +
        `    sha256: '${d.sha256}',\n` +
        `    hex:\n` +
        `      '${d.hex}'\n` +
        `  }`
    )
    .join(',\n')
  return `/**
 * ui/src/floating-page-donors.ts — 悬浮交互页基础命令的字节级 donor 注册表（票10）
 *
 * ⚠️ AUTO-GENERATED by \`npx tsx ui/tests/extract-floating-page-donors.ts\` —— 勿手改。
 * 字节来源 = 真实编辑器快照（.gsts/diff-exp/ui学习/）：
 *   - entity / builtin-container / close-button：轮24（悬浮交互页纯添加 = 3 条单条族，
 *     references/ui-controls.md 轮24；旧 gil_ui BUILTIN 为「添加+同步」合并形态，不作产出形态）
 *   - page-container：轮33（新增页面容器，顶层容器记录 comps 11/43，实体 t42 追加）
 * 候选装配 = 克隆 donor 字节 → 自身 ID/父引用重映射 → 宿主（1840 f503 / 实体 t42 / 索引）更新。
 * 字节级同步核验见 ui/tests/floating-page-assert.ts（donor sha 防漂移 + 重放对拍）。
 */

export type FloatingPageDonorId =
  | 'entity'
  | 'builtin-container'
  | 'close-button'
  | 'page-container'

export interface FloatingPageDonor {
  id: FloatingPageDonorId
  /** 提取来源快照文件名（.gsts/diff-exp/ui学习/ 下，gitignored 本地留存） */
  sourceSnapshot: string
  /** 记录自身 ID（顶层 f501） */
  selfId: number
  /** 父引用（顶层 f504）；parentless 顶层记录为 null */
  parentId: number | null
  /** 记录原始字节 sha256（hex 前核验防漂移） */
  sha256: string
  /** 记录原始字节 hex（= 编辑器该动作落盘的真实字节） */
  hex: string
}

/** 提取脚本覆写点（ui/tests/extract-floating-page-donors.ts 生成；空数组=占位态 fail-closed） */
export const FLOATING_PAGE_DONORS: FloatingPageDonor[] = [
${donorsLiteral}
]

export function floatingPageDonor(id: FloatingPageDonorId): FloatingPageDonor {
  const donor = FLOATING_PAGE_DONORS.find((item) => item.id === id)
  if (!donor) {
    throw new Error(
      \`[error] floating-page donor 缺失（\${id}）：先运行 npx tsx ui/tests/extract-floating-page-donors.ts；\` +
        '缺失时禁止凭空猜字节（fail-closed）'
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
console.log('next: npx tsx ui/tests/floating-page-assert.ts')
