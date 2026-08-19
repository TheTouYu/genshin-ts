// 2026-08-19 回归：复合内「复合输入 capture 直接设变量」的 value 引脚 wire。
//
// 背景（cap_set_repro 差分实证）：set_node_graph_variable / set_custom_variable 的 value
// 引脚在复合内使用 capture 值时，必须是 ConcreteBase 包裹（class:10000 + alreadySetVal:true +
// bConcreteValue{indexOfConcrete:0}）。此前 buildConnPin 默认产出 {class:2, alreadySetVal:false,
// bInt:{val:0}} 占位 → 编辑器/游戏按「值未设置」处理，类型判定失败（curMove 事故）。
// 本测试锁定三兄弟的修复产物 wire。
//
// set_local_variable 是第三形态（2026-08-19 lv_set_repro 差分闭合）：value 引脚 = ConcreteBase，
// 但 indexOfConcrete 由 vendor concrete map 决定（int→1 / float→5 / vec3→6，非固定 0），
// 且内层 value = IntBase（class 2 + itemType + bInt 空），与编辑器样本逐字节一致。
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { bool, entity, int, str, vec3 } from '../../src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const cvCapture = g.defineComposite('probe_cv_capture', {
  inputs: { v: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ v }, f) => {
    const s = f.registerExecNode('set_custom_variable', [
      new entity(0),
      new str('cv_int'),
      v,
      new bool(false)
    ])
    f.outflow('done', s, 0)
    return {}
  }
})

const gvCapture = g.defineComposite('probe_gv_capture', {
  inputs: { v: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ v }, f) => {
    const s = f.registerExecNode('set_node_graph_variable', [new str('cap'), v, new bool(false)])
    f.outflow('done', s, 0)
    return {}
  }
})

const lvCapture = g.defineComposite('probe_lv_capture', {
  inputs: { v: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ v }, f) => {
    const lv = f.getLocalVariable(0n)
    const s = f.registerExecNode('set_local_variable', [lv.localVariable, v])
    f.outflow('done', s, 0)
    return {}
  }
})

// float/bool/vec3 变体（2026-08-19 扩展）：每个 setter 验证 ioc 非 0 的场景（cap/cv 写死 0 修复后
// 改为 vendor ioc：cv float→4/bool→6/vec3→5、gv float→1/bool→2/vec3→11、lv float→5/bool→0/vec3→6）。
// 注意：vec3 字面量/参数必须用 new vec3([x,y,z])（数组参数）——new vec3(1,2,3) 三参数
// 静默丢分量（value=1），曾误判为 vendor 编码 bug（2026-08-19 差分核实为用法坑）。
const mkSet = (name: string, input: string, init: any) =>
  g.defineComposite(name, {
    inputs: { v: { type: input } },
    outputs: {},
    outflows: ['done'],
    build: ({ v }, f) => {
      const s = f.registerExecNode(
        name.startsWith('probe_lv') ? 'set_local_variable' : name.startsWith('probe_cv') ? 'set_custom_variable' : 'set_node_graph_variable',
        name.startsWith('probe_lv')
          ? [f.getLocalVariable(init).localVariable, v]
          : name.startsWith('probe_cv')
            ? [new entity(), new str('cv_' + input), v, new bool(false)]
            : [new str('cap_' + input), v, new bool(false)]
      )
      f.outflow('done', s, 0)
      return {}
    }
  })

const cvFloatCapture = mkSet('probe_cv_float', 'float', 0)
const cvBoolCapture = mkSet('probe_cv_bool', 'bool', false)
const cvVec3Capture = mkSet('probe_cv_vec3', 'vec3', [0, 0, 0])
const gvFloatCapture = mkSet('probe_gv_float', 'float', 0)
const gvBoolCapture = mkSet('probe_gv_bool', 'bool', false)
const gvVec3Capture = mkSet('probe_gv_vec3', 'vec3', [0, 0, 0])
const lvFloatCapture = mkSet('probe_lv_float', 'float', 0)
const lvBoolCapture = mkSet('probe_lv_bool', 'bool', false)
const lvVec3Capture = mkSet('probe_lv_vec3', 'vec3', [0, 0, 0])

g.server({ id: 1073741994, variables: { cap: new int(0) } }).on(
  'whenEntityIsCreated',
  (_e: any, f: any) => {
    f.callComposite(cvCapture, { v: new int(1) })
    f.callComposite(gvCapture, { v: new int(2) })
    f.callComposite(lvCapture, { v: new int(3) })
    f.callComposite(cvFloatCapture, { v: 1.5 })
    f.callComposite(cvBoolCapture, { v: true })
    f.callComposite(cvVec3Capture, { v: new vec3([1, 2, 3]) })
    f.callComposite(gvFloatCapture, { v: 1.5 })
    f.callComposite(gvBoolCapture, { v: true })
    f.callComposite(gvVec3Capture, { v: new vec3([1, 2, 3]) })
    f.callComposite(lvFloatCapture, { v: 1.5 })
    f.callComposite(lvBoolCapture, { v: true })
    f.callComposite(lvVec3Capture, { v: new vec3([1, 2, 3]) })
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'capture-wire-verify' })
const doc = docs.at(-1)
assert.ok(doc, 'must have server IR doc')

const outputPath = join(tmpdir(), 'gsts-capture-wire-verify.gia')
const bytes = irToGia(doc, {
  graphId: 1073741994,
  name: 'capture-wire-verify',
  protoPath: PROTO_PATH
})
writeFileSync(outputPath, Buffer.from(bytes))
const decoded = decode_gia_file(outputPath, PROTO_PATH)

function implGraphByName(name: string) {
  const defAcc = decoded.accessories?.find((a: any) => a.name === name && a.which === 12)
  if (!defAcc) return undefined
  const graphId = defAcc.relatedIds?.[0]?.id
  if (graphId === undefined) return undefined
  const graphAcc = decoded.accessories?.find((a: any) => a.which === 9 && a.id?.id === graphId)
  return graphAcc?.graph?.inner?.graph
}

function valuePinOf(implGraph: any, nodeType: number, pinIndex: number) {
  const node = implGraph.nodes.find((n: any) => n.genericId?.nodeId === nodeType)
  assert.ok(node, `impl graph must contain nodeType ${nodeType}`)
  const pin = node.pins.find((p: any) => p.i1?.kind === 3 && p.i1?.index === pinIndex)
  assert.ok(pin, `node ${nodeType} must have data-in pin ${pinIndex}`)
  return pin
}

// set_custom_variable（genericId 22）：value 引脚 index 2
const cvGraph = implGraphByName('probe_cv_capture')
assert.ok(cvGraph, 'cv capture impl graph exists')
const cvValuePin = valuePinOf(cvGraph, 22, 2)
assert.equal(cvValuePin.value?.class, 10000, 'set_custom_variable value pin must be ConcreteBase')
assert.equal(cvValuePin.value?.alreadySetVal, true, 'alreadySetVal must be true')
assert.equal(cvValuePin.value?.bConcreteValue?.indexOfConcrete, 0)

// set_node_graph_variable（genericId 323）：value 引脚 index 1
const gvGraph = implGraphByName('probe_gv_capture')
assert.ok(gvGraph, 'gv capture impl graph exists')
const gvValuePin = valuePinOf(gvGraph, 323, 1)
assert.equal(gvValuePin.value?.class, 10000, 'set_node_graph_variable value pin must be ConcreteBase')
assert.equal(gvValuePin.value?.alreadySetVal, true, 'alreadySetVal must be true')
assert.equal(gvValuePin.value?.bConcreteValue?.indexOfConcrete, 0)

// set_local_variable（genericId 19）：value 引脚 index 1（lv_set_repro 差分闭合）
const lvGraph = implGraphByName('probe_lv_capture')
assert.ok(lvGraph, 'lv capture impl graph exists')
const lvValuePin = valuePinOf(lvGraph, 19, 1)
assert.equal(lvValuePin.value?.class, 10000, 'set_local_variable value pin must be ConcreteBase')
assert.equal(lvValuePin.value?.alreadySetVal, true, 'alreadySetVal must be true')
assert.equal(
  lvValuePin.value?.bConcreteValue?.indexOfConcrete,
  1,
  'set_local_variable int capture ioc must be 1 (vendor map, lv_set_repro sample)'
)
assert.equal(
  lvValuePin.value?.bConcreteValue?.value?.class,
  2,
  'set_local_variable capture inner value must be IntBase (user sample)'
)
assert.equal(
  lvValuePin.value?.bConcreteValue?.value?.itemType?.type_server?.type,
  3,
  'IntBase inner itemType must be Integer'
)
// handle 引脚（E<1016> 身份线）：set 的局部变量引用连到 get 的 handle 输出
const lvSetter = lvGraph.nodes.find((n: any) => n.genericId?.nodeId === 19)
const lvHandlePin = lvSetter.pins.find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
assert.ok(lvHandlePin, 'set_local_variable must have handle pin 0')
assert.equal(lvHandlePin.type, 16, 'handle pin type must be LocalVariable')
assert.equal(lvHandlePin.connects?.length, 1, 'handle pin must connect to Get Local Variable ref')

// 其他值类型变体：ioc 按 vendor map、内层按类型生成对应 VarBase
// cv(set_custom_variable 22, pin2)：float→4/bool→6/vec3→5；gv(set_node_graph_variable 323, pin1)：float→1/bool→2/vec3→11
// lv(set_local_variable 19, pin1)：float→5/bool→0/vec3→6；内层 class：FloatBase=4 / EnumBase=6 / VectorBase=7；varType：Float=5 / Boolean=4 / Vector=12
const TYPE_CASES: Array<{ name: string; nodeType: number; pinIndex: number; ioc: number; innerClass: number; varType: number }> = [
  { name: 'probe_cv_float', nodeType: 22, pinIndex: 2, ioc: 4, innerClass: 4, varType: 5 },
  { name: 'probe_cv_bool', nodeType: 22, pinIndex: 2, ioc: 6, innerClass: 6, varType: 4 },
  { name: 'probe_cv_vec3', nodeType: 22, pinIndex: 2, ioc: 5, innerClass: 7, varType: 12 },
  { name: 'probe_gv_float', nodeType: 323, pinIndex: 1, ioc: 1, innerClass: 4, varType: 5 },
  { name: 'probe_gv_bool', nodeType: 323, pinIndex: 1, ioc: 2, innerClass: 6, varType: 4 },
  { name: 'probe_gv_vec3', nodeType: 323, pinIndex: 1, ioc: 11, innerClass: 7, varType: 12 },
  { name: 'probe_lv_float', nodeType: 19, pinIndex: 1, ioc: 5, innerClass: 4, varType: 5 },
  { name: 'probe_lv_bool', nodeType: 19, pinIndex: 1, ioc: 0, innerClass: 6, varType: 4 },
  { name: 'probe_lv_vec3', nodeType: 19, pinIndex: 1, ioc: 6, innerClass: 7, varType: 12 }
]
for (const tc of TYPE_CASES) {
  const graph = implGraphByName(tc.name)
  assert.ok(graph, `${tc.name} impl graph exists`)
  const pin = valuePinOf(graph, tc.nodeType, tc.pinIndex)
  assert.equal(pin.value?.class, 10000, `${tc.name} value pin must be ConcreteBase`)
  assert.equal(pin.value?.alreadySetVal, true, `${tc.name} alreadySetVal must be true`)
  assert.equal(
    pin.value?.bConcreteValue?.indexOfConcrete,
    tc.ioc,
    `${tc.name} ioc must be ${tc.ioc} (vendor map)`
  )
  assert.equal(
    pin.value?.bConcreteValue?.value?.class,
    tc.innerClass,
    `${tc.name} inner value must be VarBase class ${tc.innerClass}`
  )
  assert.equal(
    pin.value?.bConcreteValue?.value?.itemType?.type_server?.type,
    tc.varType,
    `${tc.name} inner itemType varType must be ${tc.varType}`
  )
}

console.log('PASS capture wire: 3 setters + set_local_variable 全类型 (int/float/bool)')
