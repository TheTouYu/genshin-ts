#!/usr/bin/env node
// 生成「测试版物理图」：把 autotest 驱动体注入生产内核源码的固定锚点。
// 单一真源 = src-fb3/kit-loop.ts（生产）；产物 = src-fb3/kit-loop-test.ts（**不要手改**）。
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const prod = fs.readFileSync(path.join(root, 'src-fb3/kit-loop.ts'), 'utf8')
const harness = fs.readFileSync(path.join(root, 'src-fb3/autotest/harness-body.txt'), 'utf8')
const outPath = path.join(root, 'src-fb3/kit-loop-test.ts')

const ANCHOR = '  const warm = f.lessThanOrEqualTo(tick, WARMUP_TICKS)'
if (!prod.includes(ANCHOR)) throw new Error('锚点不存在: ' + ANCHOR)

const out = prod
  .replace(
    "g.creationSkill({ id: 1082130436, name: '_GSTS_kitLoop' })",
    "g.creationSkill({ id: 1082130440, name: '_GSTS_kitLoopTest' })"
  )
  .replace(ANCHOR, harness + ANCHOR)
  .replace(
    /^\/\/ @status:.*$/m,
    '// @status: **由 scripts/gen-kit-loop-test.mjs 生成，不要手改**（测试版物理图，仅测试会话启用）'
  )

fs.writeFileSync(outPath, out)
console.log(`generated src-fb3/kit-loop-test.ts (${out.split('\n').length} lines)`)
