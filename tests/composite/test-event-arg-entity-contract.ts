// 2026-08-19 回归：事件参数对象（evt）误当实体传参的错误契约 + 正确用法回归。
//
// 背景（repro 实证）：g.server(...).on(evt, f) 回调的第一个参数 evt 是「事件参数对象」
// （{eventSourceEntity, eventSourceGuid, ...}），不是实体本身。用户把 evt/_e 直接传入：
//   1. setCustomVariable(evt, ...)      → parseValue 报泛化的 Invalid value type: entity
//   2. callComposite(comp, {t: evt})    → buildCompositeCallArgs 静默 push → ir_builder
//      报 arg.toIRLiteral is not a function（无提示）
// 本测试锁定修复后的错误契约（两条都给出「事件参数对象 + 用 evt.eventSourceEntity」提示），
// 并回归正确用法（evt.eventSourceEntity 直传 / 作复合输入）不受影响。
//
// registry 为模块级单例且无 reset：错误契约场景各自跑独立子进程（tsx 临时脚本）隔离，
// 正确用法场景在主进程顺序注册后一次 build。
//
// Run: npm run build && npx tsx tests/composite/test-event-arg-entity-contract.ts
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildServerGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { int } from '../../src/runtime/value.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs')

// ── 子进程 runner：隔离模块级 registry，验证错误契约 ──
function runChild(scriptBody: string): { status: number; stdout: string; stderr: string } {
  const tmp = path.join(
    tmpdir(),
    `entity-arg-contract-${process.pid}-${Math.random().toString(36).slice(2)}.mts`
  )
  writeFileSync(tmp, scriptBody)
  try {
    const r = spawnSync(process.execPath, [tsxCli, tmp], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 60_000
    })
    return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr }
  } finally {
    rmSync(tmp, { force: true })
  }
}

const coreImport = `import { g, buildServerGraphRegistriesIRDocuments } from '${repoRoot.replaceAll('\\', '/')}/src/runtime/core.js'`
const valueImport = `import { int } from '${repoRoot.replaceAll('\\', '/')}/src/runtime/value.js'`

// ── 错误契约 1：setCustomVariable 直接收事件参数对象 → parseValue 明确提示 ──
{
  const r = runChild(`
${coreImport}
${valueImport}
const comp = g.defineComposite('entity_event_set_cv', {
  inputs: {},
  outputs: {},
  build: (_a, f) => {
    f.on('whenEntityFactionChanges', (evt: any, ef: any) => {
      ef.setCustomVariable(evt, 'myVar', new int(1), false)
    })
  }
})
g.server({
  name: 'entity_event_set_cv',
  graphId: 1073741997,
  variables: {}
}).on('whenEntityIsCreated', (_e: any, f: any) => {
  f.callComposite(comp, {})
})
buildServerGraphRegistriesIRDocuments({ defaultName: 'entity_event_set_cv' })
console.log('NO-THROW')
`)
  assert.notEqual(r.status, 0, '路径 1 应抛错')
  assert.match(
    r.stdout + r.stderr,
    /收到事件参数对象而非实体值.*请用 evt\.eventSourceEntity/,
    '路径 1 应给出事件参数对象提示: ' + (r.stdout + r.stderr).slice(-400)
  )
}

// ── 错误契约 2：callComposite 输入收事件参数对象 → buildCompositeCallArgs 明确提示 ──
{
  const r = runChild(`
${coreImport}
${valueImport}
const comp = g.defineComposite('entity_event_call', {
  inputs: { target: { type: 'entity' } },
  outputs: {},
  build: ({ target }, f) => {
    f.setCustomVariable(target, 'myVar', new int(1), false)
  }
})
g.server({
  name: 'entity_event_call',
  graphId: 1073741997,
  variables: {}
}).on('whenEntityIsCreated', (evt: any, f: any) => {
  f.callComposite(comp, { target: evt })
})
buildServerGraphRegistriesIRDocuments({ defaultName: 'entity_event_call' })
console.log('NO-THROW')
`)
  assert.notEqual(r.status, 0, '路径 2 应抛错')
  assert.match(
    r.stdout + r.stderr,
    /callComposite 输入 "target" 收到事件参数对象.*请用 evt\.eventSourceEntity/,
    '路径 2 应给出事件参数对象提示: ' + (r.stdout + r.stderr).slice(-400)
  )
}

// ── 正确用法 1：事件实体直传 setCustomVariable（复合内 f.on） ──
const okSet = g.defineComposite('entity_event_ok_set', {
  inputs: {},
  outputs: {},
  build: (_a, f) => {
    f.on('whenEntityFactionChanges', (evt: any, ef: any) => {
      ef.setCustomVariable(evt.eventSourceEntity, 'myVar', new int(1), false)
    })
  }
})

// ── 正确用法 2：evt.eventSourceEntity 作 entity 复合输入 + capture 作 setCustomVariable target ──
const okCapture = g.defineComposite('entity_event_ok_capture', {
  inputs: { target: { type: 'entity' } },
  outputs: {},
  build: ({ target }, f) => {
    f.setCustomVariable(target, 'myVar2', new int(2), false)
  }
})

g.server({
  name: 'entity_event_ok',
  graphId: 1073741997,
  variables: {}
}).on('whenEntityIsCreated', (evt: any, f: any) => {
  f.callComposite(okSet, {})
  f.callComposite(okCapture, { target: evt.eventSourceEntity })
})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'entity_event_ok' })
const doc = docs[docs.length - 1]
const defs = (doc as any).compositeDefs ?? []

// 正确用法 1 断言
{
  const setCv = defs
    .filter((d: any) => d.name === 'entity_event_ok_set')
    .flatMap((d: any) => d.implNodes ?? [])
    .find((n: any) => n.type === 'set_custom_variable')
  assert.ok(setCv, 'expect set_custom_variable in entity_event_ok_set impl')
  const targetArg = setCv.args[0]
  assert.equal(targetArg.type, 'conn', 'target 应为事件节点连接')
  assert.equal(targetArg.value.type, 'entity', '连接类型应为 entity')
}

// 正确用法 2 断言
{
  const bDef = defs.find((d: any) => d.name === 'entity_event_ok_capture')
  assert.ok(bDef, 'expect def entity_event_ok_capture')
  const cvNode = bDef.implNodes.find((n: any) => n.type === 'set_custom_variable')
  assert.ok(cvNode, 'expect set_custom_variable in def')
  const targetArg = cvNode.args[0]
  assert.equal(targetArg.type, 'entity', 'capture 输入应为 entity 字面占位')
  assert.equal(targetArg.capture, true, 'capture 标记保留')
}

console.log('PASS: 事件参数对象误当实体 — 错误契约 ×2 + 正确用法 ×2')
