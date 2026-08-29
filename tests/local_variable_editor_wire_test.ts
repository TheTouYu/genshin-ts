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

// v15 客户端局部变量（编辑器样本 var-v15-client-graph.gil sha e12fc8d7…，图 1082130433
// 角色操控 20010）：按名字访问（与 server 的 E<1016> 完全不同）——节点图开始(200042/cid 2001) →
// Set(200081/cid 2000) + Get(200082/cid 1036)；名字 pin（type 9）= StringBase bString 名字；
// 值 pin = ConcreteBase{内层 {class, itemType{1:2,101:{2:type}}, 空 payload}}，**无 ioc**；
// Set 无流 pin（执行走 ClientExec）；start contextDeclaration={1:6}、无位置字段
const EDITOR_CLIENT_VALUE =
  '08904e1001f20610120e080222070802aa06021003b20600'
const EDITOR_CLIENT_NAME =
  '0805100122070802aa06021009ca06080a06e6b58be8af95'

// v16 客户端更多类型（编辑器样本 var-v16-client-more-types.gil sha 8c6370c6…，图 1082130433）：
// Get 10 类型值 pin 全部对齐（client ioc 表 int=0 省略/str=1/ety=2/gid=3/flt=4/vec=5/bool=6/
// str_list=8/flt_list=11/vec3_list=12；clientVarType 码 int=3/str=9/vec=11/ety=1/flt=7/bool=5/
// gid=14/str_list=10/flt_list=8/vec3_list=12；entity 内层无 class 无 payload）
// v16b 客户端剩余类型（项目表 CLIENT_VAR_TYPE_BY_IR_TYPE / LOCAL_VAR_IOC_BY_IR 交叉核对闭合）：
// 采样 10/10 命中项目表 → 表即编辑器规则 → 剩余 11 类型（int_list/entity_list/bool_list/
// guid_list/config_id/prefab_id/faction/config_id_list/prefab_id_list/faction_list/dict）
// 全部闭合（Get+Set 同构；dict 走 MapBase 特殊形式）
const EDITOR_CLIENT_TYPE_VALUES: Record<string, string> = {
  测试: '08904e1001f20610120e080222070802aa06021003b20600',
  字符串: '08904e1001f206120801120e080522070802aa06021009ca0600',
  三维向量: '08904e1001f2061408051210080722070802aa0602100bda06020a00',
  实体: '08904e1001f2060d0802120922070802aa06021001',
  浮点数: '08904e1001f206120804120e080422070802aa06021007c20600',
  布尔: '08904e1001f206120806120e080622070802aa06021005d20600',
  GUID: '08904e1001f206120803120e080122070802aa0602100eaa0600',
  字符串列表: '08904e1001f206130808120f08924e22070802aa0602100aea0600',
  三维向量列表: '08904e1001f20613080c120f08924e22070802aa0602100cea0600',
  浮点数列表: '08904e1001f20613080b120f08924e22070802aa06021008ea0600'
}

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
    // ===== v15：客户端局部变量（按名字，角色操控图） =====
    const clientIr = [
      {
        ir_version: 1,
        ir_type: 'node_graph',
        graph: {
          type: 'client',
          mode: 'beyond',
          sub_type: 'character_control_skill',
          id: 1082130433,
          name: 'client-lv-wire'
        },
        variables: [],
        nodes: [
          { id: 1, type: 'node_graph_begins', next: [3] },
          { id: 2, type: 'get_local_variable', args: [{ type: 'str', value: '测试' }] },
          {
            id: 3,
            type: 'set_local_variable',
            args: [
              { type: 'str', value: '测试' },
              { type: 'conn', value: { node_id: 2, index: 0, type: 'int' } }
            ]
          }
        ],
        edges: null
      }
    ]
    const irPath7 = join(tmp2, 'client.json')
    writeFileSync(irPath7, JSON.stringify(clientIr))
    const giaPath7 = join(tmp2, 'client.gia')
    writeGiaFromIrJsonFile(irPath7, giaPath7, {}, () => {})
    const bytes7 = new Uint8Array(readFileSync(giaPath7))
    const root7 = rootMessage.decode(bytes7.slice(20, -4))
    const nodes7 = root7.graph?.graph?.inner?.graph?.nodes ?? []
    const startN = nodes7.find((n) => n.genericId?.nodeId === 200042)
    const getN = nodes7.find((n) => n.genericId?.nodeId === 200082)
    const setN = nodes7.find((n) => n.genericId?.nodeId === 200081)
    assert.ok(startN && getN && setN, 'client start/get/set nodes')
    assert.equal(startN.concreteId?.nodeId, 2001, 'start cid 2001')
    assert.equal(getN.concreteId?.nodeId, 1036, 'get cid 1036')
    assert.equal(setN.concreteId?.nodeId, 2000, 'set cid 2000')
    // start：contextDeclaration={1:6} 无 2:0、无位置字段（proto3 缺省读 0，查 own property）
    assert.ok(
      !Object.prototype.hasOwnProperty.call(startN, 'x') &&
        !Object.prototype.hasOwnProperty.call(startN, 'y'),
      'start no zero position'
    )
    const cd = JSON.parse(JSON.stringify(startN.contextDeclaration ?? {}))
    assert.deepEqual(cd, { kind: 'ClientSignal' }, 'start contextDeclaration {1:6}')
    // 名字 pin（InParam[0]，type 9）= StringBase bString 名字
    const nameOf = (n: any) => n.pins.find((p) => p.i1?.kind === 3 && p.i1?.index === 0)
    for (const n of [getN, setN]) {
      const p = nameOf(n)
      assert.equal(p.type, 9, 'name pin type 9')
      const hex = Buffer.from(p.value.$type.encode(p.value).finish()).toString('hex')
      assert.equal(hex, EDITOR_CLIENT_NAME, 'name pin value must match editor')
    }
    // 值 pin：ConcreteBase 内层无 alreadySetVal + bInt 空；无 ioc；hex == 编辑器
    const valuePin = (n: any, kind: number, index: number) =>
      n.pins.find((p) => p.i1?.kind === kind && p.i1?.index === index)
    for (const [n, kind, idx] of [
      [getN, 4, 0],
      [setN, 3, 1]
    ] as const) {
      const p = valuePin(n, kind, idx)
      assert.ok(p?.value, 'client value pin')
      assert.equal(p.value.bConcreteValue?.indexOfConcrete ?? 0, 0, 'client pins have no ioc')
      assert.ok(
        !Object.prototype.hasOwnProperty.call(p.value.bConcreteValue, 'indexOfConcrete'),
        'client pins have no ioc (own)'
      )
      const inner = p.value.bConcreteValue.value
      assert.equal(
        Object.prototype.hasOwnProperty.call(inner, 'alreadySetVal'),
        false,
        'default value pin has no alreadySetVal'
      )
      assert.equal(
        Object.prototype.hasOwnProperty.call(inner, 'bInt') &&
          !Object.prototype.hasOwnProperty.call(inner.bInt, 'val'),
        true,
        'empty bInt payload'
      )
      const hex = Buffer.from(p.value.$type.encode(p.value).finish()).toString('hex')
      assert.equal(hex, EDITOR_CLIENT_VALUE, 'client value pin must match editor')
    }
    // Set：值 pin 连线自 Get OutParam[0]；有 ClientExec；无流 pin
    const setValue = valuePin(setN, 3, 1)
    assert.equal(setValue.connects?.length, 1, 'set value connected from getter')
    assert.equal(setValue.connects[0].connect?.kind, 4, 'source OutParam')
    assert.ok(setN.pins.some((p) => p.i1?.kind === 5), 'set has ClientExec pin')
    assert.ok(
      !setN.pins.some((p) => p.i1?.kind === 1 || p.i1?.kind === 2),
      'set has no flow pins'
    )
    // ===== v16：客户端 10 类型值 pin（名字=类型标记） =====
    const CLIENT_TYPES: Array<[string, string]> = [
      ['int', '测试'],
      ['str', '字符串'],
      ['vec3', '三维向量'],
      ['entity', '实体'],
      ['float', '浮点数'],
      ['bool', '布尔'],
      ['guid', 'GUID'],
      ['str_list', '字符串列表'],
      ['vec3_list', '三维向量列表'],
      ['float_list', '浮点数列表']
    ]
    const moreIr = [
      {
        ir_version: 1,
        ir_type: 'node_graph',
        graph: {
          type: 'client',
          mode: 'beyond',
          sub_type: 'character_control_skill',
          id: 1082130433,
          name: 'client-more-types'
        },
        variables: [],
        nodes: [
          { id: 1, type: 'node_graph_begins', next: [] },
          ...CLIENT_TYPES.flatMap(([t, name], i) => {
            const gid = 2 + i * 2
            return [
              { id: gid, type: 'get_local_variable', args: [{ type: 'str', value: name }] },
              {
                id: gid + 1,
                type: 'set_local_variable',
                args: [
                  { type: 'str', value: name },
                  { type: 'conn', value: { node_id: gid, index: 0, type: t } }
                ]
              }
            ]
          })
        ],
        edges: null
      }
    ]
    const irPath8 = join(tmp2, 'more.json')
    writeFileSync(irPath8, JSON.stringify(moreIr))
    const giaPath8 = join(tmp2, 'more.gia')
    writeGiaFromIrJsonFile(irPath8, giaPath8, {}, () => {})
    const bytes8 = new Uint8Array(readFileSync(giaPath8))
    const root8 = rootMessage.decode(bytes8.slice(20, -4))
    const nodes8 = root8.graph?.graph?.inner?.graph?.nodes ?? []
    const gets8 = nodes8.filter((n) => n.genericId?.nodeId === 200082)
    assert.equal(gets8.length, CLIENT_TYPES.length, 'ten typed client Gets')
    for (const [t, name] of CLIENT_TYPES) {
      const n = gets8.find((x) => {
        const namePin = x.pins.find((p) => p.i1?.kind === 3 && p.i1?.index === 0)
        return namePin?.value?.bString?.val === name
      })
      assert.ok(n, `Get node for ${name}`)
      const outPin = n.pins.find((p) => p.i1?.kind === 4 && p.i1?.index === 0)
      assert.ok(outPin?.value, `${name} value pin`)
      const hex = Buffer.from(outPin.value.$type.encode(outPin.value).finish()).toString('hex')
      assert.equal(hex, EDITOR_CLIENT_TYPE_VALUES[name], `${name} value must match editor`)
    }
    // ===== v16b：剩余 11 类型（项目表交叉核对，get+set 同构） =====
    // 期望值来自项目表：LOCAL_VAR_IOC_BY_IR（ioc）+ CLIENT_VAR_TYPE_BY_IR_TYPE（clientType）
    const REST_TYPES: Array<[string, number, number]> = [
      ['int_list', 7, 4],
      ['entity_list', 9, 2],
      ['bool_list', 13, 6],
      ['guid_list', 10, 15],
      ['config_id', 14, 18],
      ['prefab_id', 15, 19],
      ['faction', 18, 16],
      ['config_id_list', 16, 20],
      ['prefab_id_list', 17, 21],
      ['faction_list', 19, 25],
      ['dict', 20, 24]
    ]
    const restIr = [
      {
        ir_version: 1,
        ir_type: 'node_graph',
        graph: {
          type: 'client',
          mode: 'beyond',
          sub_type: 'character_control_skill',
          id: 1082130433,
          name: 'client-rest-types'
        },
        variables: [],
        nodes: [
          { id: 1, type: 'node_graph_begins', next: [] },
          ...REST_TYPES.flatMap(([t], i) => {
            const gid = 2 + i * 2
            const conn: Record<string, unknown> = { node_id: gid, index: 0, type: t }
            if (t === 'dict') conn.dict = { k: 'str', v: 'int' }
            return [
              { id: gid, type: 'get_local_variable', args: [{ type: 'str', value: t }] },
              {
                id: gid + 1,
                type: 'set_local_variable',
                args: [{ type: 'str', value: t }, { type: 'conn', value: conn }]
              }
            ]
          })
        ],
        edges: null
      }
    ]
    const irPath9 = join(tmp2, 'rest.json')
    writeFileSync(irPath9, JSON.stringify(restIr))
    const giaPath9 = join(tmp2, 'rest.gia')
    writeGiaFromIrJsonFile(irPath9, giaPath9, {}, () => {})
    const bytes9 = new Uint8Array(readFileSync(giaPath9))
    const root9 = rootMessage.decode(bytes9.slice(20, -4))
    const nodes9 = root9.graph?.graph?.inner?.graph?.nodes ?? []
    for (const [t, ioc, ctype] of REST_TYPES) {
      const getN = nodes9.find((n) => {
        if (n.genericId?.nodeId !== 200082) return false
        const namePin = n.pins.find((p) => p.i1?.kind === 3 && p.i1?.index === 0)
        return namePin?.value?.bString?.val === t
      })
      const setN = nodes9.find((n) => {
        if (n.genericId?.nodeId !== 200081) return false
        const namePin = n.pins.find((p) => p.i1?.kind === 3 && p.i1?.index === 0)
        return namePin?.value?.bString?.val === t
      })
      assert.ok(getN && setN, `get/set for ${t}`)
      for (const [n, kind, idx] of [
        [getN, 4, 0],
        [setN, 3, 1]
      ] as const) {
        const p = n.pins.find((x) => x.i1?.kind === kind && x.i1?.index === idx)
        assert.ok(p?.value, `${t} value pin`)
        assert.equal(p.value.bConcreteValue?.indexOfConcrete, ioc, `${t} ioc ${ioc}`)
        const inner = p.value.bConcreteValue.value
        assert.equal(inner.itemType?.type_client?.type, ctype, `${t} clientType ${ctype}`)
        if (t === 'dict') {
          assert.equal(inner.class, 10003, `${t} MapBase`)
          assert.ok(inner.bMap, `${t} bMap form`)
        } else {
          assert.equal(inner.class, t.endsWith('_list') || t === 'config_id_list' ? 10002 : 1, `${t} inner class`)
        }
      }
    }
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
