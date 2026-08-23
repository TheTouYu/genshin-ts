// @ts-nocheck
// 回归：复合节点的 *_list 输入参数必须编码为 class=ArrayBase, type1/type2=对应列表 VarType
// 2026-08-21 真实差分实证：vec3_list → class=10002, type1=15(VectorList), type2=15(VectorList)
// 修复：build_composite_definition.ts 的 typeClassFromValueType/typeIdFromValueType

import { buildCompositeParameterType } from '../../dist/src/compiler/ir_to_gia_transform/build_composite_definition.js'

const TEST_CASES = [
  { type: 'int_list',     class: 10002, type1: 8,  type2: 8,  note: 'IntegerList' },
  { type: 'float_list',   class: 10002, type1: 10, type2: 10, note: 'FloatList' },
  { type: 'str_list',     class: 10002, type1: 11, type2: 11, note: 'StringList' },
  { type: 'bool_list',    class: 10002, type1: 9,  type2: 9,  note: 'BooleanList' },
  { type: 'entity_list',  class: 10002, type1: 13, type2: 13, note: 'EntityList' },
  { type: 'vec3_list',    class: 10002, type1: 15, type2: 15, note: 'VectorList' },
  { type: 'guid_list',    class: 10002, type1: 7,  type2: 7,  note: 'GUIDList' },
  { type: 'config_id_list', class: 10002, type1: 22, type2: 22, note: 'ConfigurationList' },
  { type: 'prefab_id_list', class: 10002, type1: 23, type2: 23, note: 'PrefabList' },
  { type: 'faction_list',   class: 10002, type1: 24, type2: 24, note: 'FactionList' },
]

let failed = 0
for (const tc of TEST_CASES) {
  const result = buildCompositeParameterType(tc.type)
  const ok = result.class === tc.class && result.type1 === tc.type1 && result.type2 === tc.type2
  if (ok) {
    console.log(`✅ ${tc.type}: class=${result.class} type1=${result.type1} type2=${result.type2} (${tc.note})`)
  } else {
    console.error(`❌ ${tc.type}: expected class=${tc.class} type1=${tc.type1} type2=${tc.type2}, got class=${result.class} type1=${result.type1} type2=${result.type2}`)
    failed++
  }
}

console.log(`\n${TEST_CASES.length - failed}/${TEST_CASES.length} passed`)
if (failed > 0) process.exit(1)
