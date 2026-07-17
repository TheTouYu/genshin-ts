// @ts-nocheck
/**
 * 复现 user_edit/复合节点/数字参数.gia 的最小复合节点。
 *
 * 参考接口：
 *   (float, float, int, int) -> (bool, bool)
 * 参考 impl：less_than(float) 与 less_than_or_equal_to(int)，分别消费 float 和 int 参数。
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { float, int } from '../../dist/src/runtime/value.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = 'tests/composite/output'
const OUT_PATH = `${OUT_DIR}/数字参数-当前实现复现.gia`

const digitalParameter = g.defineComposite('数字参数-当前实现复现', {
  inputs: {
    浮点左值: { type: 'float' },
    浮点右值: { type: 'float' },
    整数左值: { type: 'int' },
    整数右值: { type: 'int' }
  },
  outputs: {
    浮点比较结果: { type: 'bool' },
    整数比较结果: { type: 'bool' }
  },
  build({ 浮点左值, 浮点右值, 整数左值, 整数右值 }, f) {
    return {
      浮点比较结果: f.lessThan(浮点左值, 浮点右值),
      整数比较结果: f.lessThanOrEqualTo(整数左值, 整数右值)
    }
  }
})

g.server({ name: '数字参数-当前实现复现', id: 1073741994 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.callComposite(digitalParameter, {
      浮点左值: new float(3.5),
      浮点右值: new float(1.5),
      整数左值: new int(8),
      整数右值: new int(2)
    })
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: '数字参数-当前实现复现' })
const doc = docs.at(-1)
assert.ok(doc)

mkdirSync(OUT_DIR, { recursive: true })
const bytes = irToGia(doc, {
  graphId: 1073741994,
  name: '数字参数-当前实现复现',
  protoPath: PROTO_PATH
})
writeFileSync(OUT_PATH, Buffer.from(bytes))

const decoded = decode_gia_file(OUT_PATH, PROTO_PATH)
const accessory = decoded.accessories?.find(
  (item) => item.name === '数字参数-当前实现复现' && item.which === 12
)
const def = accessory?.compositeDef?.inner?.def
assert.ok(def)

const impl = decoded.accessories?.find(
  (item) => item.id?.id === digitalParameter.id + 10000 && item.which === 9
)?.graph?.inner?.graph

console.log(`输出: ${OUT_PATH}`)
console.log(`大小: ${bytes.length} 字节`)
console.log('接口 inputs:', JSON.stringify(def.inputs, null, 2))
console.log('接口 outputs:', JSON.stringify(def.outputs, null, 2))
console.log('impl nodes:', JSON.stringify(impl?.nodes, null, 2))
console.log('compositePins:', JSON.stringify(impl?.compositePins, null, 2))

assert.deepEqual(def.inputs?.map((input) => [input.type?.class, input.type?.type1, input.type?.type2]), [
  [4, 5, 5],
  [4, 5, 5],
  [2, 3, 3],
  [2, 3, 3]
])
assert.deepEqual(def.outputs?.map((output) => [output.type?.class, output.type?.type1, output.type?.type2]), [
  [6, 4, 4],
  [6, 4, 4]
])
assert.deepEqual(def.outputs?.map((output) => output.type?.enumId?.val), [1, 1])

console.log('PASS: 复现接口类型为 (float, float, int, int) -> (bool, bool)')
