/**
 * server 局部变量列表字面量回归（O-29-07 修复，2026-08-29）。
 *
 * 背景：`f.initLocalVariable('int_list', [1n,2n,3n])` 的数组字面量必须编译为拼装列表
 * 节点（generic 169）保留值，不得静默丢值；运行时直调原始数组（绕过 Stage 1）时
 * matchTypes 会把三元 number 数组误判为 vec3 字面量 → set_local_variable 值 arg 类型
 * 错位且无报错——由 Stage 3 编译期校验硬拦截（Get/Set 类型必须一致，variables.md 实证）。
 *
 * 三条锁定：
 *  A. DSL 路径：数组字面量被 Stage 1 包装成 assemblyList（值保留的编译层证据）；
 *  B. IR→GIA 路径：*_list 字面量 arg 经 expandListLiterals 展开为拼装节点，元素值、
 *     count pin、Set 值 pin 连线全部保留（wire 层证据）；
 *  C. 静默面：Set 值类型 ≠ Get 类型（vec3/int → int_list）→ 编译期报错（禁止静默）。
 *
 * Run: npx tsx tests/local_variable_list_literal_test.ts
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { join } from 'node:path'

import { writeGiaFromIrJsonFile } from '../src/compiler/ir_to_gia_pipeline.js'
import { compileTsToGs } from '../src/compiler/ts_to_gs_pipeline.js'
import { loadGiaProto } from '../src/injector/proto.js'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)

// ===== A. DSL 路径：Stage 1 数组字面量 → assemblyList 包装 =====
const outDir = mkdtempSync(join(tmpdir(), 'lv-lit-gs-'))
try {
  const result = await compileTsToGs({
    cfgDir: repoRoot,
    cfg: {
      compileRoot: '.',
      entries: ['./tests/local_variable_list_literal_fixture.ts'],
      outDir
    }
  })
  const outFile = result.outFiles.find((f) => f.endsWith('local_variable_list_literal_fixture.gs.ts'))
  assert.ok(outFile, 'fixture gs.ts must be emitted')
  const text = fs.readFileSync(outFile, 'utf8')
  assert.match(
    text,
    /f\.initLocalVariable\('int_list', gsts\.f\.assemblyList\(\[1n, 2n, 3n\]\)\)/,
    'init list literal must be wrapped in assemblyList (values preserved)'
  )
  assert.match(
    text,
    /f\.setLocalVariable\(lv2\.localVariable, gsts\.f\.assemblyList\(\[4n, 5n\]\)\)/,
    'set list literal must be wrapped in assemblyList (values preserved)'
  )
} finally {
  rmSync(outDir, { recursive: true, force: true })
}

// ===== B. IR→GIA 路径：*_list 字面量展开为拼装节点，值保留 =====
const mkServerIr = (nodes: unknown[]) => [
  {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: {
      type: 'server',
      mode: 'beyond',
      sub_type: 'entity',
      id: 1073741825,
      name: '_GSTS_lv_list_literal'
    },
    variables: [],
    nodes,
    edges: null
  }
]

const listLiteralIr = mkServerIr([
  { id: 1, type: 'when_custom_variable_changes', next: [3] },
  {
    id: 3,
    type: 'set_local_variable',
    args: [
      { type: 'conn', value: { node_id: 2, index: 0, type: 'local_variable' } },
      { type: 'int_list', value: [1, 2, 3] }
    ]
  },
  { id: 2, type: 'get_local_variable', args: [{ type: 'int_list', value: [] }] }
])

const tmp = mkdtempSync(join(tmpdir(), 'lv-lit-ir-'))
try {
  const irPath = join(tmp, 'case.json')
  writeFileSync(irPath, JSON.stringify(listLiteralIr))
  const giaPath = join(tmp, 'case.gia')
  writeGiaFromIrJsonFile(irPath, giaPath, {}, () => {})
  const { rootMessage } = loadGiaProto()
  const root = rootMessage.decode(new Uint8Array(readFileSync(giaPath)).slice(20, -4))
  const nodes = root.graph?.graph?.inner?.graph?.nodes ?? []
  const getL = nodes.find((n: any) => n.genericId?.nodeId === 18)
  const setL = nodes.find((n: any) => n.genericId?.nodeId === 19)
  const assy = nodes.find((n: any) => n.concreteId?.nodeId === 169)
  assert.ok(getL && setL && assy, 'get/set/assembly nodes must exist')
  assert.equal(getL.concreteId?.nodeId, 2661, 'Get int_list cid 2661')
  assert.equal(setL.concreteId?.nodeId, 2679, 'Set int_list cid 2679')

  // 拼装节点元素值保留（count pin + 元素 1/2/3）
  const pinValue = (n: any, kind: number, index: number) =>
    n.pins.find((p: any) => p.i1?.kind === kind && p.i1?.index === index)
  const count = pinValue(assy, 3, 0)
  assert.ok(count?.value?.bInt?.val === 3, 'assembly count pin must be 3')
  for (const [idx, val] of [
    [1, 1],
    [2, 2],
    [3, 3]
  ] as const) {
    const elem = pinValue(assy, 3, idx)
    assert.ok(elem?.value?.bConcreteValue?.value?.bInt?.val === val, `assembly element ${idx} must be ${val}`)
  }
  // Set 值 pin（InParam[1]）连线到拼装节点 OutParam[0]
  const setValue = pinValue(setL, 3, 1)
  assert.ok(setValue?.connects?.length === 1, 'set value pin must be wired to assembly')
  assert.equal(setValue.connects[0].id, assy.nodeIndex, 'set value wired to assembly node')
  // 拼装节点 OutParam[0] = 列表空锚（ArrayBase + itemType int_list + 空 payload；ioc 不落盘）
  const assyOut = pinValue(assy, 4, 0)
  const outInner = assyOut?.value?.bConcreteValue?.value
  assert.equal(outInner?.class, 10002, 'assembly out inner class ArrayBase')
  assert.equal(outInner?.itemType?.type_server?.type, 8, 'assembly out itemType int_list')

  // ===== C. 静默面：Set 值类型 ≠ Get 类型 → 编译期报错 =====
  const mismatchCases: Array<[string, unknown]> = [
    ['vec3', { type: 'vec3', value: [1, 2, 3] }], // number 数组误判产物
    ['int', { type: 'int', value: 5 }]
  ]
  for (const [label, setValueArg] of mismatchCases) {
    const badIr = mkServerIr([
      { id: 1, type: 'when_custom_variable_changes', next: [3] },
      {
        id: 3,
        type: 'set_local_variable',
        args: [
          { type: 'conn', value: { node_id: 2, index: 0, type: 'local_variable' } },
          setValueArg
        ]
      },
      { id: 2, type: 'get_local_variable', args: [{ type: 'int_list', value: [] }] }
    ])
    const badPath = join(tmp, `bad-${label}.json`)
    writeFileSync(badPath, JSON.stringify(badIr))
    assert.throws(
      () => writeGiaFromIrJsonFile(badPath, join(tmp, `bad-${label}.gia`), {}, () => {}),
      (e: unknown) => {
        const msg = (e as Error).message
        return (
          msg.includes('set_local_variable') &&
          msg.includes('int_list') &&
          msg.includes('不一致')
        )
      },
      `set value type ${label} for int_list local variable must fail compilation (no silent drop)`
    )
  }

  console.log(
    JSON.stringify(
      {
        stage1Wrapped: true,
        assemblyElements: [1, 2, 3],
        setWired: true,
        mismatchRejected: mismatchCases.length,
        ok: true
      },
      null,
      2
    )
  )
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
