import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'

// Collect all unique type abbreviations from inputs/outputs
const types = new Set<string>()
for (const r of NODE_PIN_RECORDS) {
  for (const t of (r.inputs ?? [])) types.add(t)
  for (const t of (r.outputs ?? [])) types.add(t)
  if (r.pins) {
    for (const p of r.pins) {
      if (p.type) types.add(String(p.type))
    }
  }
}

// Check each abbreviation in context
const commonTypes: Record<string, string> = {
  'Ety': 'Entity 实体',
  'Gid': 'GUID',
  'Int': 'Int 整数',
  'Flt': 'Float 浮点',
  'Bol': 'Bool 布尔',
  'Str': 'String 字符串',
  'Vec': 'Vector 向量',
  'Cfg': 'Config 配置ID',
  'R<': 'Reference<...> 引用',
  'L<': 'List<...> 列表',
  'S<': 'Selector<...> 选择器',
}

console.log('=== Type abbreviations found in pin records ===')
for (const t of [...types].sort()) {
  let match = ''
  for (const [prefix, name] of Object.entries(commonTypes)) {
    if (t.startsWith(prefix)) { match = name; break }
  }
  console.log(`  ${t.padEnd(16)} ${match}`)
}
