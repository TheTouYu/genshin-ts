// @ts-nocheck
/**
 * 局部变量 wire 编辑器回归（2026-08-29 差分 v10，P0）。
 *
 * 编辑器样本：map 1073741915 图 1（快照 var-v10-local-var-usage.gil sha 85dd6313…）
 *  Get Local Variable(18, S<T:Bol>) InParam[0] R<T> 默认 false ← 字面量（创建/类型锚）
 *  OutParam[0] E<1016>（身份）→ Set Local Variable(19) InParam[0] E<1016>
 *  Set InParam[1] R<T> = true（更新）；两个节点类型一致 Bol。
 * 规律（闭合）：
 *  - Get = 创建（R<T> pin 带类型+默认值），Set = 更新，身份走 E<1016> 连线（wire kind 4 index 0）
 *  - R<T> pin 值 = ConcreteBase{1:10000, 2:1, 110:bConcreteValue{2: 内层}}；
 *    内层 VarBase **一律无 alreadySetVal**（true 也只写 bEnum{1:1}），零值空 payload、kind 省略
 *  - 我方编译器模式：initLocalVariable(type, init) → get(empty)+set(init)（动态 init 避免重复求值）；
 *    常量 init 也可直接放 Get（编辑器形态），预算敏感时可优化（open-items F10 候选）
 *
 * Run: npx tsx tests/local_variable_editor_wire_test.ts
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeGiaFromIrJsonFile } from '../src/compiler/ir_to_gia_pipeline.js'
import { loadGiaProto } from '../src/injector/proto.js'

// 编辑器样本 pin value 常量（v10 图 1）
const EDITOR_VALUE_FALSE =
  '08904e1001f20610120e080622070801a206020804d20600'
const EDITOR_VALUE_TRUE =
  '08904e1001f206121210080622070801a206020804d206020801'

const ir = [
  {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: {
      type: 'server',
      mode: 'beyond',
      sub_type: 'entity',
      id: 1073741825,
      name: '_GSTS_local_var_wire'
    },
    variables: [],
    nodes: [
      { id: 1, type: 'when_custom_variable_changes', next: [3] },
      {
        id: 3,
        type: 'set_local_variable',
        args: [
          { type: 'conn', value: { node_id: 2, index: 0, type: 'local_variable' } },
          { type: 'bool', value: false }
        ],
        next: [4]
      },
      {
        id: 4,
        type: 'set_local_variable',
        args: [
          { type: 'conn', value: { node_id: 2, index: 0, type: 'local_variable' } },
          { type: 'bool', value: true }
        ],
        next: []
      },
      { id: 2, type: 'get_local_variable', args: [{ type: 'bool', value: false }] }
    ],
    edges: null
  }
]

const tmp = mkdtempSync(join(tmpdir(), 'gsts-local-var-wire-'))
try {
  const irPath = join(tmp, 'case.json')
  writeFileSync(irPath, JSON.stringify(ir))
  const giaPath = join(tmp, 'case.gia')
  writeGiaFromIrJsonFile(irPath, giaPath, {}, () => {})

  const { rootMessage } = loadGiaProto()
  const bytes = new Uint8Array(readFileSync(giaPath))
  const root = rootMessage.decode(bytes.slice(20, -4))
  const nodes = root.graph?.graph?.inner?.graph?.nodes ?? []

  const getNode = nodes.find((n) => n.genericId?.nodeId === 18)
  const setNodes = nodes.filter((n) => n.genericId?.nodeId === 19)
  assert.ok(getNode, 'Get Local Variable node must exist')
  assert.equal(setNodes.length, 2, 'two Set Local Variable nodes (init + update)')

  const pinValueHex = (n: any, kind: number, index: number): string => {
    const pin = n.pins.find((p) => p.i1?.kind === kind && p.i1?.index === index)
    assert.ok(pin?.value, `pin kind=${kind} index=${index} must have value`)
    return Buffer.from(pin.value.$type.encode(pin.value).finish()).toString('hex')
  }
  const E = 3 // InParam
  const O = 4 // OutParam

  // Get：InParam[0] 默认 false（类型锚/初始值）== 编辑器；OutParam[1] 值同构
  assert.equal(pinValueHex(getNode, E, 0), EDITOR_VALUE_FALSE, 'Get R<T> default false')
  assert.equal(pinValueHex(getNode, O, 1), EDITOR_VALUE_FALSE, 'Get R<T> out value')

  // Set：值 pin 与编辑器一致（false 空 payload / true 显式）
  const setVals = setNodes.map((n) => pinValueHex(n, E, 1)).sort()
  assert.deepEqual(setVals, [EDITOR_VALUE_FALSE, EDITOR_VALUE_TRUE].sort(), 'Set values')

  // 身份连线：每个 Set 的 E<1016> InParam[0] ← Get OutParam[0]
  for (const n of setNodes) {
    const pin = n.pins.find((p) => p.i1?.kind === E && p.i1?.index === 0)
    assert.ok(pin?.connects?.length === 1, 'Set E<1016> must have one identity connection')
    const c = pin.connects[0]
    assert.equal(c.connect?.kind, O, 'identity source kind OutParam')
    assert.equal(c.connect?.index, 0, 'identity source index 0')
  }

  // 类型一致：Get/Set 节点全部 Bol（局部变量节点范围内）
  const allBol = [getNode, ...setNodes].every((n) => {
    const typed = n.pins
      .filter((p) => p.value?.bConcreteValue?.value?.itemType?.type_server?.type)
      .map((p) => p.value.bConcreteValue.value.itemType.type_server.type)
    return typed.length === 0 || typed.every((t) => t === 4) // 4 = Boolean（protobuf enum 数值）
  })
  assert.ok(allBol, 'all local variable pin types must be consistent (Bol)')

  console.log(JSON.stringify({ getNode: true, setNodes: setNodes.length, ok: true }, null, 2))
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
