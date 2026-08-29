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

// v11 各类型 Get Local Variable（创建锚点默认值，编辑器样本 var-v11-local-var-types.gil
// sha 169b53b0…）：concreteId 变体 + ConcreteBase.indexOfConcrete（bool=0 省略；server 表
// int=1 str=2 ety=3 gid=4 flt=5 vec=6——与 client 侧 LOCAL_VAR_IOC_BY_IR 顺序不同）
const EDITOR_TYPE_VALUES: Record<number, string> = {
  20: '08904e1001f206120801120e080222070801a206020803b20600', // int
  2656: '08904e1001f206120802120e080522070801a206020806ca0600', // str
  2657: '08904e1001f2060d0803120922070801a206020801', // entity（内层无 class、无 payload）
  2658: '08904e1001f206120804120e080122070801a206020802aa0600', // guid
  2659: '08904e1001f206120805120e080422070801a206020805c20600', // float
  2660: '08904e1001f2061408061210080722070801a20602080cda06020a00' // vec3
}

// v13 列表类型（int_list 完整周期，编辑器样本 var-v13-local-var-int-list.gil sha ac3defd3…）：
// Get cid=2661、Set cid=2679、ioc=7（server 列表段，与 client 表尾部同序）；值 = 空 ArrayBase
// 字面量（连接时也带空字面量锚）；拼装列表(169) OutParam 同为 ioc=7 空 ArrayBase
const EDITOR_LIST_VALUE =
  '08904e1001f206130807120f08924e22070801a206020808ea0600'

// v14 str_list 周期（编辑器样本 var-v14-str-list-cycle.gil sha a0cd33d4…）：
// Get cid=2662、Set cid=2680、ioc=8（server 列表段 str_list=8 实证）；拼装列表 cid 按元素类型
// （int=169/str=170）；元素 pin：默认值空 payload 无 alreadySetVal、非默认值保留 alreadySetVal+
// 显式 payload（int 23/489 实证）；元素 ioc：int=0 省略、str=1（vendor 写）
const EDITOR_STR_LIST_VALUE =
  '08904e1001f206130808120f08924e22070801a20602080bea0600'

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

  // ===== v11：六类型创建锚点（默认值）字节级 + concreteId 变体 =====
  const TYPES: Array<{ irType: string; irValue: unknown; cid: number }> = [
    { irType: 'int', irValue: 0, cid: 20 },
    { irType: 'str', irValue: '', cid: 2656 },
    { irType: 'entity', irValue: null, cid: 2657 },
    { irType: 'guid', irValue: 0, cid: 2658 },
    { irType: 'float', irValue: 0, cid: 2659 },
    { irType: 'vec3', irValue: [0, 0, 0], cid: 2660 }
  ]
  const typedIr = [
    {
      ir_version: 1,
      ir_type: 'node_graph',
      graph: {
        type: 'server',
        mode: 'beyond',
        sub_type: 'entity',
        id: 1073741825,
        name: '_GSTS_local_var_types'
      },
      variables: [],
      nodes: [
        { id: 1, type: 'when_custom_variable_changes', next: [] },
        ...TYPES.map((t, i) => ({
          id: 2 + i,
          type: 'get_local_variable' as const,
          args: [{ type: t.irType, value: t.irValue }]
        }))
      ],
      edges: null
    }
  ]
  const tmp2 = mkdtempSync(join(tmpdir(), 'gsts-local-var-types-'))
  try {
    const irPath2 = join(tmp2, 'case.json')
    writeFileSync(irPath2, JSON.stringify(typedIr))
    const giaPath2 = join(tmp2, 'case.gia')
    writeGiaFromIrJsonFile(irPath2, giaPath2, {}, () => {})
    const bytes2 = new Uint8Array(readFileSync(giaPath2))
    const root2 = rootMessage.decode(bytes2.slice(20, -4))
    const nodes2 = root2.graph?.graph?.inner?.graph?.nodes ?? []
    const gets2 = nodes2.filter((n) => n.genericId?.nodeId === 18)
    assert.equal(gets2.length, TYPES.length, 'six typed Get nodes')
    for (const t of TYPES) {
      const n = gets2.find((x) => x.concreteId?.nodeId === t.cid)
      assert.ok(n, `Get node with cid ${t.cid} must exist`)
      const inPin = n.pins.find((p) => p.i1?.kind === 3 && p.i1?.index === 0)
      assert.ok(inPin?.value, `cid ${t.cid} InParam[0] value`)
      const hex = Buffer.from(inPin.value.$type.encode(inPin.value).finish()).toString('hex')
      assert.equal(hex, EDITOR_TYPE_VALUES[t.cid], `cid ${t.cid} value must match editor bytes`)
    }

    // ===== v12：Set Local Variable 六类型（get+set 对）——cid 变体 + 值字节 =====
    // Set cid：bool=19、int=21、str=2674、entity=2675、guid=2676、float=2677、vec3=2678；
    // 值 pin 结构与 Get 相同（同 ioc 表 + 同内层形态）
    const SET_CID_BY_TYPE: Record<string, number> = {
      int: 21,
      str: 2674,
      entity: 2675,
      guid: 2676,
      float: 2677,
      vec3: 2678
    }
    const SET_VALUE_BY_CID: Record<number, string> = {
      21: EDITOR_TYPE_VALUES[20],
      2674: EDITOR_TYPE_VALUES[2656],
      2675: EDITOR_TYPE_VALUES[2657],
      2676: EDITOR_TYPE_VALUES[2658],
      2677: EDITOR_TYPE_VALUES[2659],
      2678: EDITOR_TYPE_VALUES[2660]
    }
    const pairIr = [
      {
        ir_version: 1,
        ir_type: 'node_graph',
        graph: {
          type: 'server',
          mode: 'beyond',
          sub_type: 'entity',
          id: 1073741825,
          name: '_GSTS_set_types'
        },
        variables: [],
        nodes: [
          { id: 1, type: 'when_custom_variable_changes', next: [] },
          ...TYPES.flatMap((t, i) => {
            const gid = 2 + i * 2
            return [
              { id: gid, type: 'get_local_variable' as const, args: [{ type: t.irType, value: t.irValue }] },
              {
                id: gid + 1,
                type: 'set_local_variable' as const,
                args: [
                  { type: 'conn', value: { node_id: gid, index: 0, type: 'local_variable' } },
                  { type: t.irType, value: t.irValue }
                ]
              }
            ]
          })
        ],
        edges: null
      }
    ]
    const irPath3 = join(tmp2, 'pair.json')
    writeFileSync(irPath3, JSON.stringify(pairIr))
    const giaPath3 = join(tmp2, 'pair.gia')
    writeGiaFromIrJsonFile(irPath3, giaPath3, {}, () => {})
    const bytes3 = new Uint8Array(readFileSync(giaPath3))
    const root3 = rootMessage.decode(bytes3.slice(20, -4))
    const nodes3 = root3.graph?.graph?.inner?.graph?.nodes ?? []
    const sets3 = nodes3.filter((n) => n.genericId?.nodeId === 19)
    assert.equal(sets3.length, TYPES.length, 'six typed Set nodes')
    for (const t of TYPES) {
      const cid = SET_CID_BY_TYPE[t.irType]
      const n = sets3.find((x) => x.concreteId?.nodeId === cid)
      assert.ok(n, `Set node with cid ${cid} must exist`)
      const inPin = n.pins.find((p) => p.i1?.kind === 3 && p.i1?.index === 1)
      assert.ok(inPin?.value, `Set cid ${cid} InParam[1] value`)
      const hex = Buffer.from(inPin.value.$type.encode(inPin.value).finish()).toString('hex')
      assert.equal(hex, SET_VALUE_BY_CID[cid], `Set cid ${cid} value must match editor bytes`)
    }
    // ===== v13：int_list 局部变量（Get cid 2661 / Set cid 2679，ioc=7，空 ArrayBase） =====
    const listIr = [
      {
        ir_version: 1,
        ir_type: 'node_graph',
        graph: {
          type: 'server',
          mode: 'beyond',
          sub_type: 'entity',
          id: 1073741825,
          name: '_GSTS_lv_list'
        },
        variables: [],
        nodes: [
          { id: 1, type: 'when_custom_variable_changes', next: [] },
          { id: 2, type: 'get_local_variable', args: [{ type: 'int_list', value: [] }] },
          {
            id: 3,
            type: 'set_local_variable',
            args: [
              { type: 'conn', value: { node_id: 2, index: 0, type: 'local_variable' } },
              { type: 'int_list', value: [] }
            ]
          }
        ],
        edges: null
      }
    ]
    const irPath4 = join(tmp2, 'list.json')
    writeFileSync(irPath4, JSON.stringify(listIr))
    const giaPath4 = join(tmp2, 'list.gia')
    writeGiaFromIrJsonFile(irPath4, giaPath4, {}, () => {})
    const bytes4 = new Uint8Array(readFileSync(giaPath4))
    const root4 = rootMessage.decode(bytes4.slice(20, -4))
    const nodes4 = root4.graph?.graph?.inner?.graph?.nodes ?? []
    const getL = nodes4.find((n) => n.genericId?.nodeId === 18)
    const setL = nodes4.find((n) => n.genericId?.nodeId === 19)
    assert.ok(getL && setL, 'list Get/Set nodes')
    assert.equal(getL.concreteId?.nodeId, 2661, 'Get int_list cid 2661')
    assert.equal(setL.concreteId?.nodeId, 2679, 'Set int_list cid 2679')
    for (const [n, idx] of [
      [getL, 0],
      [setL, 1]
    ] as const) {
      const inPin = n.pins.find((p) => p.i1?.kind === 3 && p.i1?.index === idx)
      assert.ok(inPin?.value, 'list pin value')
      assert.equal(inPin.value.bConcreteValue?.indexOfConcrete, 7, 'int_list ioc 7')
      const hex = Buffer.from(inPin.value.$type.encode(inPin.value).finish()).toString('hex')
      assert.equal(hex, EDITOR_LIST_VALUE, 'int_list value must match editor bytes')
    }
    // ===== v14：str_list 周期 + 拼装列表元素（非默认值 alreadySetVal） =====
    const strListIr = [
      {
        ir_version: 1,
        ir_type: 'node_graph',
        graph: {
          type: 'server',
          mode: 'beyond',
          sub_type: 'entity',
          id: 1073741825,
          name: '_GSTS_lv_str'
        },
        variables: [],
        nodes: [
          { id: 1, type: 'when_custom_variable_changes', next: [] },
          { id: 2, type: 'get_local_variable', args: [{ type: 'str_list', value: [] }] },
          {
            id: 3,
            type: 'set_local_variable',
            args: [
              { type: 'conn', value: { node_id: 2, index: 0, type: 'local_variable' } },
              { type: 'str_list', value: [] }
            ]
          }
        ],
        edges: null
      }
    ]
    const irPath5 = join(tmp2, 'strlist.json')
    writeFileSync(irPath5, JSON.stringify(strListIr))
    const giaPath5 = join(tmp2, 'strlist.gia')
    writeGiaFromIrJsonFile(irPath5, giaPath5, {}, () => {})
    const bytes5 = new Uint8Array(readFileSync(giaPath5))
    const root5 = rootMessage.decode(bytes5.slice(20, -4))
    const nodes5 = root5.graph?.graph?.inner?.graph?.nodes ?? []
    const getS = nodes5.find((n) => n.genericId?.nodeId === 18)
    const setS = nodes5.find((n) => n.genericId?.nodeId === 19)
    assert.ok(getS && setS, 'str_list Get/Set nodes')
    assert.equal(getS.concreteId?.nodeId, 2662, 'Get str_list cid 2662')
    assert.equal(setS.concreteId?.nodeId, 2680, 'Set str_list cid 2680')
    for (const [n, idx] of [
      [getS, 0],
      [setS, 1]
    ] as const) {
      const inPin = n.pins.find((p) => p.i1?.kind === 3 && p.i1?.index === idx)
      assert.ok(inPin?.value, 'str_list pin value')
      assert.equal(inPin.value.bConcreteValue?.indexOfConcrete, 8, 'str_list ioc 8')
      const hex = Buffer.from(inPin.value.$type.encode(inPin.value).finish()).toString('hex')
      assert.equal(hex, EDITOR_STR_LIST_VALUE, 'str_list value must match editor bytes')
    }

    // 拼装列表元素（int 169 / str 170）：cid 变体 + 元素 ioc + 非默认值 alreadySetVal
    const assyIr = [
      {
        ir_version: 1,
        ir_type: 'node_graph',
        graph: {
          type: 'server',
          mode: 'beyond',
          sub_type: 'entity',
          id: 1073741825,
          name: '_GSTS_assy'
        },
        variables: [],
        nodes: [
          { id: 1, type: 'when_custom_variable_changes', next: [] },
          { id: 2, type: 'assembly_list', args: [{ type: 'int', value: 0 }, { type: 'int', value: 23 }, { type: 'int', value: 0 }, { type: 'int', value: 489 }] },
          { id: 3, type: 'assembly_list', args: [{ type: 'str', value: '' }, { type: 'str', value: '' }, { type: 'str', value: '' }, { type: 'str', value: '' }, { type: 'str', value: '' }] }
        ],
        edges: null
      }
    ]
    const irPath6 = join(tmp2, 'assy.json')
    writeFileSync(irPath6, JSON.stringify(assyIr))
    const giaPath6 = join(tmp2, 'assy.gia')
    writeGiaFromIrJsonFile(irPath6, giaPath6, {}, () => {})
    const bytes6 = new Uint8Array(readFileSync(giaPath6))
    const root6 = rootMessage.decode(bytes6.slice(20, -4))
    const nodes6 = root6.graph?.graph?.inner?.graph?.nodes ?? []
    const assyInt = nodes6.find((n) => n.concreteId?.nodeId === 169)
    const assyStr = nodes6.find((n) => n.concreteId?.nodeId === 170)
    assert.ok(assyInt && assyStr, 'assembly variants 169/170')
    assert.equal(assyStr.concreteId?.nodeId, 170, 'str assembly cid 170')
    const elem = (n: any, idx: number) => {
      const p = n.pins.find((x) => x.i1?.kind === 3 && x.i1?.index === idx)
      assert.ok(p?.value, `assembly element ${idx}`)
      return p.value.bConcreteValue
    }
    assert.equal(elem(assyInt, 2).value.alreadySetVal, true, 'int 23 element keeps alreadySetVal')
    assert.equal(elem(assyInt, 2).value.bInt.val, 23, 'int 23 payload')
    assert.equal(elem(assyInt, 4).value.alreadySetVal, true, 'int 489 element keeps alreadySetVal')
    assert.equal(
      Object.prototype.hasOwnProperty.call(elem(assyInt, 1).value, 'alreadySetVal'),
      false,
      'default element has no alreadySetVal'
    )
    assert.equal(elem(assyStr, 1).indexOfConcrete, 1, 'str element ioc 1')
  } finally {
    rmSync(tmp2, { recursive: true, force: true })
  }

  console.log(
    JSON.stringify(
      {
        getNode: true,
        setNodes: setNodes.length,
        typedTypes: TYPES.length,
        setTypedTypes: TYPES.length,
        intListCycle: true,
        ok: true
      },
      null,
      2
    )
  )
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
