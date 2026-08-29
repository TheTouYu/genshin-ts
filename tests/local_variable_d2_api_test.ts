/**
 * D2 对象式局部变量 API 回归（2026-08-29）。
 *
 * 覆盖：
 *  A. server `f.localVariable(type, init?, opts?)` → LocalVariable<T> 句柄（.set/.value）；
 *     常量 init 折叠进 Get（M2），动态 init 保持 get+set；opts.name 忽略并告警；dict fail-closed。
 *  B. client `f.localVariable(...)` → 名字机制（显式名/自动名）+ dict 声明锚（MapBase +
 *     容器元数据，批次 9 实证）+ Set 走 ClientExec；重名编译错误（S8）。
 *  C. 别名兼容：initLocalVariable 返回 `{ localVariable, value }` 形状不变（现有调用零破坏）。
 *
 * Run: npx tsx tests/local_variable_d2_api_test.ts
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeGiaFromIrJsonFile } from '../src/compiler/ir_to_gia_pipeline.js'
import { loadGiaProto } from '../src/injector/proto.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../src/runtime/core.js'

const tmp = mkdtempSync(join(tmpdir(), 'd2-api-'))
try {
  // ===== A. server 对象式 API =====
  g.server({ id: 1073741825, name: 'd2-server' }).on('whenCustomVariableChanges', (evt, f) => {
    const lv = f.localVariable('int', 42n) // 常量 → 折叠
    lv.set(99n)
    const dyn = f.localVariable('float', f.getNodeGraphVariable('speed').asType('float'))
    dyn.set(1.5)
    const flag = f.localVariable('bool')
    f.setNodeGraphVariable('flag', flag.value, false)
    // 别名兼容形状：initLocalVariable 仍返回 { localVariable, value }
    const alias = f.initLocalVariable('str', 'x')
    assert.equal(typeof alias.localVariable, 'object', 'alias localVariable identity')
    assert.ok((alias.value as unknown as { getMetadata?: () => unknown }).getMetadata?.(), 'alias value is a pin ref')
    // dict fail-closed
    assert.throws(
      () => (f.localVariable as unknown as (t: string) => unknown)('dict', { k: 'str', v: 'int' }),
      /server graph local variable dict is not supported/,
      'server dict local variable must fail closed'
    )
  })
  const docs = buildServerGraphRegistriesIRDocuments() as any[]
  const nodes = docs[0].nodes
  const getInt = nodes.find((n: any) => n.type === 'get_local_variable' && n.args?.[0]?.type === 'int')
  assert.equal(getInt.args[0].value, 42, 'server: constant init folded into Get InParam[0]')
  assert.ok(
    nodes.some(
      (n: any) =>
        n.type === 'set_local_variable' &&
        n.args?.[1]?.type === 'int' &&
        n.args?.[1]?.value === 99
    ),
    'server: lv.set(99n) registers Set node'
  )
  const dynGet = nodes.find(
    (n: any) => n.type === 'get_local_variable' && n.args?.[0]?.type === 'float'
  )
  assert.deepEqual(dynGet.args[0], { type: 'float', value: 0 }, 'server: dynamic init keeps get(empty)')
  assert.ok(
    nodes.some(
      (n: any) =>
        n.type === 'set_node_graph_variable' &&
        n.args?.[0]?.value === 'flag' &&
        n.args?.[1]?.type === 'conn' &&
        n.args[1].value.node_id === nodes.find((x: any) => x.type === 'get_local_variable' && x.args?.[0]?.type === 'bool').id
    ),
    'server: lv.value resolves to Get read anchor'
  )

  // ===== B. client 对象式 API（名字 + dict 声明锚） =====
  g.characterControlSkill({ id: 1082130901, name: 'd2-client' }).on('start', (evt, f) => {
    const score = f.localVariable('int', 0n, { name: 'score' })
    score.set(99n)
    const map = f.localVariable('dict', { k: 'str', v: 'int' })
    f.setLocalVariable(map.localVariable, map.value)
    const list = f.localVariable('int_list', f.assemblyList([1n, 2n]), { name: 'seq' })
    list.set(f.assemblyList([3n, 4n]))
    // 重名：编译错误（S8）
    assert.throws(
      () => f.localVariable('bool', false, { name: 'score' }),
      /used more than once/,
      'client duplicate explicit name must fail'
    )
  })
  const { buildClientGraphRegistriesIRDocuments } = await import('../src/runtime/core.js')
  const clientDocs = buildClientGraphRegistriesIRDocuments() as any[]
  const clientNodes = clientDocs[0].nodes
  // client 的"创建"是 Set（v15 样本形态：Set(名字+值)）；Get 仅在 lv.value 被消费时出现
  const setNames = clientNodes
    .filter((n: any) => n.type === 'set_local_variable')
    .map((n: any) => n.args?.[0]?.value)
  assert.ok(setNames.includes('score'), 'client: explicit name used in Set')
  assert.ok(setNames.includes('seq'), 'client: explicit name for list')
  const dictGet = clientNodes.find(
    (n: any) => n.type === 'get_local_variable' && n.args?.[0]?.value === '__gsts_local_dict_1'
  )
  assert.ok(dictGet, 'client: dict getter exists (value consumed)')
  assert.deepEqual(
    dictGet.args[1],
    { type: 'dict', value: null, dict: { k: 'str', v: 'int' } },
    'client: dict declaration anchor carries container metadata'
  )

  // client GIA：dict Get 值 pin = MapBase + 容器元数据（批次 9 形态）
  const clientIrPath = join(tmp, 'client.json')
  writeFileSync(clientIrPath, JSON.stringify(clientDocs))
  const clientGiaPath = join(tmp, 'client.gia')
  writeGiaFromIrJsonFile(clientIrPath, clientGiaPath, {}, () => {})
  const { rootMessage } = loadGiaProto()
  const root = rootMessage.decode(new Uint8Array(readFileSync(clientGiaPath)).slice(20, -4))
  const giaNodes = root.graph?.graph?.inner?.graph?.nodes ?? []
  const dictGetN = giaNodes.find((n: any) => {
    if (n.genericId?.nodeId !== 200082) return false
    const namePin = n.pins.find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
    return namePin?.value?.bString?.val === '__gsts_local_dict_1'
  })
  assert.ok(dictGetN, 'client GIA: dict getter node exists')
  const dictOut = dictGetN.pins.find((p: any) => p.i1?.kind === 4 && p.i1?.index === 0)
  assert.equal(dictOut?.type, 24, 'client GIA: dict value pin type 24 (MapBase)')
  assert.equal(dictOut.value.bConcreteValue?.indexOfConcrete, 20, 'client GIA: dict ioc 20')
  assert.equal(
    dictOut.value.bConcreteValue?.value?.class,
    10003,
    'client GIA: dict inner class MapBase'
  )
  // 批次 9 实证：containerBinding.mode/kind 与 mapPair.key/value = key/value 的 clientVarType
  const container = dictOut.value.bConcreteValue.value.itemType?.type_client?.containerBinding
  assert.equal(container?.mode, 9, 'client GIA: containerBinding.mode = key clientVarType (str=9)')
  assert.equal(container?.kind, 3, 'client GIA: containerBinding.kind = value clientVarType (int=3)')
  const mapPair = dictOut.value.bConcreteValue.structs?.inner?.wrapper?.mapPair
  assert.equal(mapPair?.key, 9, 'client GIA: mapPair.key = key clientVarType (str=9)')
  assert.equal(mapPair?.value, 3, 'client GIA: mapPair.value = value clientVarType (int=3)')
  // Set 有 ClientExec、无流 pin
  const setN = giaNodes.find((n: any) => {
    if (n.genericId?.nodeId !== 200081) return false
    const namePin = n.pins.find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
    return namePin?.value?.bString?.val === 'score'
  })
  assert.ok(setN, 'client GIA: score Set node exists')
  assert.ok(setN.pins.some((p: any) => p.i1?.kind === 5), 'client GIA: Set has ClientExec pin')
  assert.ok(
    !setN.pins.some((p: any) => p.i1?.kind === 1 || p.i1?.kind === 2),
    'client GIA: Set has no flow pins'
  )

  console.log(JSON.stringify({ serverFold: true, clientNames: setNames, dictMapBase: true, ok: true }, null, 2))
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
