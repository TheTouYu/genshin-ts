/**
 * 客户端 send 映射 smoke：向服务器节点图发送信号（gid 占位 300002，注入期按
 * 信号定义回填；cid 恒 2000）。信号名在 kind5#1 str 引脚（bString），参数按
 * 信号定义逐类型排在 kind3#0.. 普通引脚（无 ConcreteBase 包裹）——
 * 客户端信号_局部变量类型补充.gia 实证（10 标量 + 8 列表全类型）。
 * 覆盖 f.sendSignalToServerNodeGraph 与 scoped global send() 两个入口，
 * IR -> GIA -> decode 后逐引脚断言与语料一致。
 */
import assert from 'node:assert'
import fs from 'node:fs'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { buildClientGraphRegistriesIRDocuments, defineSignal, g } from '../../src/runtime/core.js'
import { guid } from '../../src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
const OUT_FILE = 'tests/client_generated/smoke_send_signal.gia'

// 与 客户端信号_局部变量类型补充.gia 的两个自定义信号同款参数表
const SignalAllParams1 = defineSignal('信号_1_all_params1', [
  ['参数_1', 'int'],
  ['参数_2', 'float'],
  ['参数_3', 'str'],
  ['参数_4', 'vec3'],
  ['参数_5', 'bool'],
  ['参数_6', 'guid'],
  ['参数_7', 'entity'],
  ['参数_8', 'prefab_id'],
  ['参数_9', 'config_id'],
  ['参数_10', 'float_list']
] as const)
const SignalAllParams2 = defineSignal('信号_1_all_params2', [
  ['参数_1', 'str_list'],
  ['参数_2', 'vec3_list'],
  ['参数_3', 'bool_list'],
  ['参数_4', 'guid_list'],
  ['参数_5', 'entity_list'],
  ['参数_6', 'prefab_id_list'],
  ['参数_7', 'config_id_list'],
  ['参数_8', 'int_list']
] as const)

g.characterSkill({ id: 1082130444, name: 'SendSignal' }).on('start', (_evt, f) => {
  const self = f.getSelfEntity()
  // send#0: 样本节点 1 同款——6 标量字面量 + entity/prefab/config/float_list 连线
  f.sendSignalToServerNodeGraph(
    SignalAllParams1,
    435n,
    345,
    '5435435fdf',
    [123, 32, 43],
    true,
    new guid(4),
    self,
    f.getCustomVariable(self, 'pf').asType('prefab_id'),
    f.getCustomVariable(self, 'cfg').asType('config_id'),
    f.getCustomVariable(self, 'fl').asType('float_list')
  )
  // send#1: 样本节点 2 同款——8 个列表参数全连线（走 scoped global send()）
  send(
    SignalAllParams2,
    f.getCustomVariable(self, 'sl').asType('str_list'),
    f.getCustomVariable(self, 'vl').asType('vec3_list'),
    f.getCustomVariable(self, 'bl').asType('bool_list'),
    f.getCustomVariable(self, 'gl').asType('guid_list'),
    f.getCustomVariable(self, 'el').asType('entity_list'),
    f.getCustomVariable(self, 'pl').asType('prefab_id_list'),
    f.getCustomVariable(self, 'cl').asType('config_id_list'),
    f.getCustomVariable(self, 'il').asType('int_list')
  )
  // send#2: 字面量信号名、零参数（旧行为回归）
  send('plain_signal')
})

const doc = buildClientGraphRegistriesIRDocuments().find((d) =>
  d.graph.name?.includes('SendSignal')
)!
const bytes = irToGia(doc, { protoPath: PROTO_PATH })
fs.writeFileSync(OUT_FILE, bytes)
const decoded = decode_gia_file(OUT_FILE, undefined, true)
const nodes = decoded.graph.graph?.inner.graph?.nodes ?? []

const PLACEHOLDER_GID = 300002
const sends = nodes.filter((n: any) => Number(n.genericId?.nodeId) === PLACEHOLDER_GID)
assert.strictEqual(sends.length, 3, `expected 3 send nodes, got ${sends.length}`)

type PinExpect = {
  index: number
  type: number
  wired: boolean
  /** VarBase 载荷断言：字段名 -> 期望值（bArray 用 entries 长度） */
  payload?: Record<string, unknown>
  set?: boolean
}

function checkSend(label: string, nth: number, signalName: string, pins: PinExpect[]) {
  const node = sends[nth] as any
  assert.strictEqual(Number(node.concreteId?.nodeId), 2000, `${label}: concreteId`)
  const namePin = (node.pins ?? []).find(
    (p: any) => Number(p.i1?.kind) === 5 && Number(p.i1?.index) === 1
  )
  assert.ok(namePin, `${label}: signal name pin missing`)
  assert.strictEqual(String(namePin.value?.bString?.val ?? ''), signalName, `${label}: signal name`)
  const paramPins = (node.pins ?? []).filter((p: any) => Number(p.i1?.kind) === 3)
  assert.strictEqual(paramPins.length, pins.length, `${label}: param pin count`)
  for (const exp of pins) {
    const pin = paramPins.find((p: any) => Number(p.i1?.index) === exp.index)
    assert.ok(pin, `${label}: pin #${exp.index} missing`)
    assert.strictEqual(Number(pin.type ?? 0), exp.type, `${label}: pin #${exp.index} type`)
    assert.strictEqual(
      (pin.connects ?? []).length > 0,
      exp.wired,
      `${label}: pin #${exp.index} wired`
    )
    if (exp.set !== undefined) {
      assert.strictEqual(
        Boolean(pin.value?.alreadySetVal),
        exp.set,
        `${label}: pin #${exp.index} alreadySetVal`
      )
    }
    for (const [field, want] of Object.entries(exp.payload ?? {})) {
      const v = pin.value?.[field]
      if (field === 'bArray') {
        assert.strictEqual((v?.entries ?? []).length, want, `${label}: pin #${exp.index} entries`)
      } else if (field === 'bVector') {
        assert.deepStrictEqual(
          [Number(v?.val?.x ?? 0), Number(v?.val?.y ?? 0), Number(v?.val?.z ?? 0)],
          want,
          `${label}: pin #${exp.index} bVector`
        )
      } else {
        assert.strictEqual(Number(v?.val ?? 0), want, `${label}: pin #${exp.index} ${field}`)
      }
    }
  }
  console.log(`[ok] ${label}: ${pins.length} param pins verified`)
}

// 样本节点 1 同形（t3/t7/t9/t11/t5/t14 字面量 + t1/t19/t18/t8 连线）
checkSend('send all_params1', 0, '信号_1_all_params1', [
  { index: 0, type: 3, wired: false, set: true, payload: { bInt: 435 } },
  { index: 1, type: 7, wired: false, set: true, payload: { bFloat: 345 } },
  { index: 2, type: 9, wired: false, set: true },
  { index: 3, type: 11, wired: false, set: true, payload: { bVector: [123, 32, 43] } },
  { index: 4, type: 5, wired: false, set: true, payload: { bEnum: 1 } },
  { index: 5, type: 14, wired: false, set: true, payload: { bId: 4 } },
  { index: 6, type: 1, wired: true, set: false },
  { index: 7, type: 19, wired: true, set: false, payload: { bId: 0 } },
  { index: 8, type: 18, wired: true, set: false, payload: { bId: 0 } },
  { index: 9, type: 8, wired: true, set: false, payload: { bArray: 0 } }
])
const strPin = (sends[0] as any).pins.find(
  (p: any) => Number(p.i1?.kind) === 3 && Number(p.i1?.index) === 2
)
assert.strictEqual(String(strPin.value?.bString?.val), '5435435fdf', 'send#0 str literal')

// 样本节点 2 同形（8 个列表参数全连线，bArray 空占位）
checkSend(
  'send all_params2 (global send)',
  1,
  '信号_1_all_params2',
  [10, 12, 6, 15, 2, 21, 20, 4].map((type, index) => ({
    index,
    type,
    wired: true,
    set: false,
    payload: { bArray: 0 }
  }))
)

// 零参数字面量信号名（旧行为）
checkSend('send literal name no params', 2, 'plain_signal', [])

fs.rmSync(OUT_FILE, { force: true })
console.log('[ok] send signal encoding verified (2 typed sends + 1 plain)')
