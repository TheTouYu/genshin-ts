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
import { buildServerGraphRegistriesIRDocuments, g } from '../src/runtime/core.js'

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

// ===== D. M2 常量折叠：常量 init 直写 Get（无 Set），动态 init 保持 get+set =====
// 编辑器实样：v10 默认锚（EDITOR_VALUE_FALSE）+ 批次 7 Get bool true（内层 alreadySetVal +
// OutParam[1] 默认锚）——折叠后 Get 与编辑器实样逐字节一致（D2 验收第 1/2 条）。
const EDITOR_VALUE_FALSE =
  '08904e1001f20610120e080622070801a206020804d20600'
const FOLD_GET_TRUE_PREFIX = '08904e1001f20614121208061001' // ConcreteBase{ioc 省略? no: 无 ioc + 内层 class6 + alreadySetVal}

g.server({ id: 1073741825, name: 'm2-fold' }).on('whenCustomVariableChanges', (evt, f) => {
  const b = f.initLocalVariable('bool', true)
  const dyn = f.initLocalVariable('int', f.getNodeGraphVariable('someInt').asType('int'))
  // 消费（回写）防止 unused 移除
  f.setLocalVariable(b.localVariable, b.value)
  f.setLocalVariable(dyn.localVariable, dyn.value)
})

const foldDocs = buildServerGraphRegistriesIRDocuments() as any[]
{
  const gets = foldDocs[0].nodes.filter((n: any) => n.type === 'get_local_variable')
  const sets = foldDocs[0].nodes.filter((n: any) => n.type === 'set_local_variable')
  const foldGet = gets.find((n: any) => n.args?.[0]?.type === 'bool')
  const dynGet = gets.find((n: any) => n.args?.[0]?.type === 'int')
  assert.ok(foldGet, 'folded bool Get must exist')
  assert.equal(foldGet.args[0].value, true, 'bool constant init folded into Get InParam[0]')
  assert.deepEqual(dynGet.args[0], { type: 'int', value: 0 }, 'dynamic init keeps get(empty)')
  // Set 计数：动态 init 的 set(expr) + 两个消费回写 = 3；常量 init 不得产生第 4 个 init Set
  const setTargets = sets.map((s: any) => s.args?.[0]?.value?.node_id)
  assert.equal(sets.length, 3, '3 Sets = dynamic init set + two consumer write-backs')
  assert.equal(
    setTargets.filter((id: number) => id === foldGet.id).length,
    1,
    'folded Get referenced by exactly one Set (consumer) — no constant init Set'
  )

  const tmpD = mkdtempSync(join(tmpdir(), 'lv-lit-fold-'))
  try {
    writeFileSync(join(tmpD, 'case.json'), JSON.stringify(foldDocs))
    const giaPath = join(tmpD, 'case.gia')
    writeGiaFromIrJsonFile(join(tmpD, 'case.json'), giaPath, {}, () => {})
    const { rootMessage } = loadGiaProto()
    const root = rootMessage.decode(new Uint8Array(readFileSync(giaPath)).slice(20, -4))
    const nodes = root.graph?.graph?.inner?.graph?.nodes ?? []
    const getN = nodes.find((n: any) => n.genericId?.nodeId === 18 && n.concreteId?.nodeId === 18)
    assert.ok(getN, 'Get bool node (cid 18) must exist')
    const hex = (v: unknown) =>
      v ? Buffer.from((v as any).$type.encode(v).finish()).toString('hex') : ''
    const inPin = getN.pins.find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
    const outPin = getN.pins.find((p: any) => p.i1?.kind === 4 && p.i1?.index === 1)
    assert.ok(inPin?.value, 'Get InParam[0] must have value')
    const inHex = hex(inPin.value)
    // 批次 7 实样：非默认值内层保留 alreadySetVal（f2=1 在 bConcreteValue.value 内）
    assert.ok(inHex.startsWith(FOLD_GET_TRUE_PREFIX), `Get true prefix must match batch-7 shape, got ${inHex}`)
    assert.ok(
      !getN.pins.some((p: any) => p.i1?.kind === 4 && p.i1?.index === 0),
      'Get OutParam[0] (E<1016>) not persisted'
    )
    assert.equal(hex(outPin.value), EDITOR_VALUE_FALSE, 'Get OutParam[1] must be type default anchor')
  } finally {
    rmSync(tmpD, { recursive: true, force: true })
  }
}
