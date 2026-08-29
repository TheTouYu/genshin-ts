// @ts-nocheck
/**
 * 图变量列表 wire 对齐编辑器样本回归（2026-08-29 最小差分）。
 *
 * 背景：用户编辑器在图 1073741825 声明 int_list 图变量「int50」（map 1073741915 变量）：
 *  v1 = 50×0（快照 sha b7ca3d9f…）；v4 = 49×0 + 末位 1234（快照 sha 48b79d7f…）。
 * 之前多次踩坑：声明长度 50/100 的 int_list 运行时索引越界（引擎「全 0 int_list 短物化」R2，
 * retrospective-2026-08-22-rubik-record-limit-fixes.md）。
 *
 * 编辑器 wire 规律（两样本锁定）：
 *  - 零值/默认值元素 = {class:IntBase(2), itemType{1:1,100:{1:3}}, 空 payload}，无 alreadySetVal；
 *  - 非默认值元素 = 保留 alreadySetVal=1 + 显式 payload {102:{1:1234}}；
 *  - itemType.type_server.kind=0 与 GraphVariable 的 exposed/structId 默认值一律省略。
 * 我方 vendor 旧编码对零值元素多写 alreadySetVal=1、kind=0、显式 val=0——已归一化（
 * src/compiler/ir_to_gia_transform/index.ts normalizeGraphVarListEditorWire）。
 *
 * 测试：用真实管线（writeGiaFromIrJsonFile）把最小 IR 编成 .gia，重编码 GraphVariable 消息，
 * 断言与编辑器样本 hex 逐字节相等（编辑器/游戏内核验由用户执行，见 panorama 检查点）。
 *
 * Run: npx tsx tests/graph_variable_int_list_editor_wire_test.ts
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeGiaFromIrJsonFile } from '../src/compiler/ir_to_gia_pipeline.js'
import { loadGiaProto } from '../src/injector/proto.js'

// 编辑器样本 v1：int50 = 50×0
const EDITOR_GRAPH_VARIABLE_HEX =
  '1205696e743530180822b20608924e100122070801a206020808ea06a0060a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b2060038064006'

// 编辑器样本 v4：末位（下标 49）改为 1234，其余 49 个 0
const EDITOR_GRAPH_VARIABLE_HEX_LAST_1234 =
  '1205696e743530180822b70608924e100122070801a206020808ea06a5060a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a13' +
  '0802100122070801a206020803b2060308d20938064006'

function runCase(value: number[], expectedHex: string, label: string): string {
  const ir = {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: {
      type: 'server',
      mode: 'beyond',
      sub_type: 'entity',
      id: 1073741825,
      name: `_GSTS_int_list_editor_wire_${label}`
    },
    variables: [{ name: 'int50', type: 'int_list', value }],
    nodes: [
      // irToGia 要求至少一个节点；用图变量 getter 占位（无消费者，纯数据节点不参与执行流）
      { id: 1, type: 'get_node_graph_variable', args: [{ type: 'str', value: 'int50' }] }
    ],
    edges: {}
  }

  const tmp = mkdtempSync(join(tmpdir(), 'gsts-graph-var-list-wire-'))
  try {
    const irPath = join(tmp, 'case.json')
    writeFileSync(irPath, JSON.stringify(ir))
    const giaPath = join(tmp, 'case.gia')
    writeGiaFromIrJsonFile(irPath, giaPath, {}, () => {})

    const { rootMessage } = loadGiaProto()
    const bytes = new Uint8Array(readFileSync(giaPath))
    const root = rootMessage.decode(bytes.slice(20, -4))
    const graphValues = root.graph?.graph?.inner?.graph?.graphValues
    assert.ok(graphValues && graphValues.length === 1, 'graphValues must contain the int50 variable')

    const graphVarType = rootMessage.root.lookupType('GraphVariable')
    const reEncoded = Buffer.from(graphVarType.encode(graphValues[0]).finish()).toString('hex')
    assert.equal(
      reEncoded,
      expectedHex,
      `case ${label}: GraphVariable record must be byte-identical to the editor sample`
    )
    return reEncoded
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const hex1 = runCase(Array.from({ length: 50 }, () => 0), EDITOR_GRAPH_VARIABLE_HEX, 'all-zero')
const values2 = Array.from({ length: 50 }, () => 0)
values2[49] = 1234
const hex2 = runCase(values2, EDITOR_GRAPH_VARIABLE_HEX_LAST_1234, 'last-1234')

// 标量图变量（顶层与列表元素同一 VarBase 形态，2026-08-29 由元素规则推广闭合；
// Str 模板 2026-08-09 编辑器验证 {f105:空}）：
// 零值/空值 → 无 kind、无 alreadySetVal、空 payload；非默认值 → alreadySetVal + 显式 payload
function runScalarCase(
  name: string,
  type: 'int' | 'float' | 'str' | 'bool',
  value: unknown,
  expectClass: number,
  expectNonDefault: boolean
): string {
  const ir = {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: {
      type: 'server',
      mode: 'beyond',
      sub_type: 'entity',
      id: 1073741825,
      name: `_GSTS_scalar_${name}`
    },
    variables: [{ name, type, value }],
    nodes: [
      { id: 1, type: 'get_node_graph_variable', args: [{ type: 'str', value: name }] }
    ],
    edges: {}
  }
  const tmp = mkdtempSync(join(tmpdir(), 'gsts-graph-var-scalar-'))
  try {
    const irPath = join(tmp, 'case.json')
    writeFileSync(irPath, JSON.stringify(ir))
    const giaPath = join(tmp, 'case.gia')
    writeGiaFromIrJsonFile(irPath, giaPath, {}, () => {})
    const { rootMessage } = loadGiaProto()
    const bytes = new Uint8Array(readFileSync(giaPath))
    const root = rootMessage.decode(bytes.slice(20, -4))
    const gv = root.graph?.graph?.inner?.graph?.graphValues?.[0]
    assert.ok(gv, 'graph variable must exist')
    const val = gv.values
    assert.equal(val.class, expectClass, `${name}: class`)
    const valJson = JSON.parse(JSON.stringify(val))
    assert.equal('kind' in (valJson.itemType?.type_server ?? {}), false, `${name}: kind must be omitted`)
    assert.equal(val.alreadySetVal, expectNonDefault, `${name}: alreadySetVal`)
    const payload = JSON.parse(JSON.stringify(val.bInt ?? val.bFloat ?? val.bString ?? val.bEnum ?? {}))
    if (expectNonDefault) {
      assert.ok('val' in payload, `${name}: non-default payload must be explicit`)
    } else {
      assert.deepEqual(payload, {}, `${name}: payload must be empty`)
    }
    const graphVarType = rootMessage.root.lookupType('GraphVariable')
    return Buffer.from(graphVarType.encode(gv).finish()).toString('hex')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
const scalar0 = runScalarCase('aint0', 'int', 0, 2, false)
const scalar7 = runScalarCase('aint7', 'int', 7, 2, true)
const scalarStr = runScalarCase('astr', 'str', '', 5, false)
const scalarFlt = runScalarCase('aflt', 'float', 0, 4, false)

// v6 样本（2026-08-29，用户编辑器图 1 新增 10 变量全默认值；快照 var-v6-six-types.gil
// sha 66109c04…）：str/int/float/bool/vec3 标量 + 5 种空列表，逐字节锁定
const EDITOR_V6_HEXES: Record<string, string> = {
  变量_1: '1208e58f98e9878f5f311806220e080522070801a206020806ca060038064006',
  变量_2: '1208e58f98e9878f5f321803220e080222070801a206020803b2060038064006',
  变量_3: '1208e58f98e9878f5f331805220e080422070801a206020805c2060038064006',
  变量_4: '1208e58f98e9878f5f341804220e080622070801a206020804d2060038064006',
  变量_5: '1208e58f98e9878f5f35180c2210080722070801a20602080cda06020a0038064006',
  变量_6: '1208e58f98e9878f5f36180b220f08924e22070801a20602080bea060038064006',
  变量_7: '1208e58f98e9878f5f371808220f08924e22070801a206020808ea060038064006',
  变量_8: '1208e58f98e9878f5f38180a220f08924e22070801a20602080aea060038064006',
  变量_9: '1208e58f98e9878f5f391809220f08924e22070801a206020809ea060038064006',
  变量_10: '1209e58f98e9878f5f3130180f220f08924e22070801a20602080fea060038064006'
}

function runV6Case(): void {
  const variables = [
    { name: '变量_1', type: 'str', value: '' },
    { name: '变量_2', type: 'int', value: 0 },
    { name: '变量_3', type: 'float', value: 0 },
    { name: '变量_4', type: 'bool', value: false },
    { name: '变量_5', type: 'vec3', value: [0, 0, 0] },
    { name: '变量_6', type: 'str_list', value: [] },
    { name: '变量_7', type: 'int_list', value: [] },
    { name: '变量_8', type: 'float_list', value: [] },
    { name: '变量_9', type: 'bool_list', value: [] },
    { name: '变量_10', type: 'vec3_list', value: [] }
  ]
  const ir = {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: {
      type: 'server',
      mode: 'beyond',
      sub_type: 'entity',
      id: 1073741825,
      name: '_GSTS_ten_vars'
    },
    variables,
    nodes: [
      { id: 1, type: 'get_node_graph_variable', args: [{ type: 'str', value: '变量_1' }] }
    ],
    edges: {}
  }
  const tmp = mkdtempSync(join(tmpdir(), 'gsts-graph-var-v6-'))
  try {
    const irPath = join(tmp, 'case.json')
    writeFileSync(irPath, JSON.stringify(ir))
    const giaPath = join(tmp, 'case.gia')
    writeGiaFromIrJsonFile(irPath, giaPath, {}, () => {})
    const { rootMessage } = loadGiaProto()
    const bytes = new Uint8Array(readFileSync(giaPath))
    const root = rootMessage.decode(bytes.slice(20, -4))
    const graphValues = root.graph?.graph?.inner?.graph?.graphValues
    assert.equal(graphValues.length, variables.length, '10 graph variables')
    const graphVarType = rootMessage.root.lookupType('GraphVariable')
    for (const gv of graphValues) {
      const name = gv.name
      assert.ok(EDITOR_V6_HEXES[name], `unexpected variable ${name}`)
      const hex = Buffer.from(graphVarType.encode(gv).finish()).toString('hex')
      assert.equal(hex, EDITOR_V6_HEXES[name], `v6 variable ${name} must match editor bytes`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
runV6Case()

console.log(
  JSON.stringify(
    {
      allZeroHexLength: hex1.length,
      last1234HexLength: hex2.length,
      scalarInt0: scalar0.length,
      scalarInt7: scalar7.length,
      scalarStr: scalarStr.length,
      scalarFloat0: scalarFlt.length,
      v6TenVars: true,
      ok: true
    },
    null,
    2
  )
)
