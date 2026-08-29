// @ts-nocheck
/**
 * 规律表 ↔ 回归测试常量一致性（设计文档 C4「保持常量+表双锁」的自动比对）。
 *
 * 规律表 tests/fixtures/variables-wire-rules.json 是 variables:verify 的单一事实源；
 * 三个 *_editor_wire_test.ts 里的 hex 常量是编辑器样本的回归锁。两者必须一致，
 * 否则 verify 与回归测试会各自漂移（设计文档风险节「规律表/测试双份漂移」）。
 *
 * 本测试从测试源文件提取常量并与规律表逐条比对：
 *  - graph_variable_int_list_editor_wire_test.ts：int50×2 + v6 十变量
 *  - level_variable_initial_values_test.ts：v7 九 entry + v8 普通实体 + v9 玩家/角色
 *  - level_variable_str_list_empty_test.ts：v5 str_list entry
 *  - local_variable_editor_wire_test.ts：server pin 值 + client 名字/值 pin
 *
 * Run: npx tsx tests/variables_wire_rules_consistency_test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const rules = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/variables-wire-rules.json'), 'utf8'))

function extractConst(src: string, name: string): string {
  const re = new RegExp(`const ${name}\\s*=\\s*([\\s\\S]*?)(?:\\n\\s*(?:const|//|\\[|function|assert|\\}))`, 'm')
  const m = src.match(re)
  assert.ok(m, `const ${name} must exist in test source`)
  const parts = m[1].match(/'([0-9a-f]+)'/g)
  assert.ok(parts, `const ${name} must contain hex literals`)
  return parts.map((s) => s.slice(1, -1)).join('')
}

function extractObj(src: string, name: string): Record<string, string> {
  const idx = src.indexOf(`const ${name}`)
  assert.ok(idx >= 0, `const ${name} must exist`)
  const start = src.indexOf('{', idx)
  let depth = 0
  let end = -1
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  assert.ok(end > start, `const ${name} must be an object literal`)
  const out: Record<string, string> = {}
  for (const line of src.slice(start + 1, end).split('\n')) {
    const lm = line.match(/([^:{}]+):\s*'([0-9a-f]+)'/)
    if (lm) out[lm[1].trim().replace(/^['"]|['"]$/g, '')] = lm[2]
  }
  return out
}

function extractNestedObj(src: string, name: string): Record<string, Record<string, string>> {
  const idx = src.indexOf(`const ${name}`)
  assert.ok(idx >= 0, `const ${name} must exist`)
  const start = src.indexOf('{', idx)
  let depth = 0
  let end = -1
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const out: Record<string, Record<string, string>> = {}
  let cur: string | null = null
  for (const line of src.slice(start + 1, end).split('\n')) {
    const em = line.match(/^\s*(\d+):\s*\{/)
    if (em) {
      cur = em[1]
      out[cur] = {}
      continue
    }
    const lm = line.match(/([^:{}]+):\s*'([0-9a-f]+)'/)
    if (lm && cur) out[cur][lm[1].trim().replace(/^['"]|['"]$/g, '')] = lm[2]
  }
  return out
}

let checked = 0
function checkHex(actual: string, expected: string, label: string): void {
  checked++
  assert.equal(actual, expected, `规律表与测试常量不一致：${label}`)
}

// ---- graph 段 ----
const gsrc = readFileSync(join(ROOT, 'tests/graph_variable_int_list_editor_wire_test.ts'), 'utf8')
checkHex(rules.rules.graph.fixtures.int50[0].hex, extractConst(gsrc, 'EDITOR_GRAPH_VARIABLE_HEX'), 'graph int50 50×0')
checkHex(rules.rules.graph.fixtures.int50[1].hex, extractConst(gsrc, 'EDITOR_GRAPH_VARIABLE_HEX_LAST_1234'), 'graph int50 末位1234')
for (const [k, hex] of Object.entries(extractObj(gsrc, 'EDITOR_V6_HEXES'))) {
  checkHex(rules.rules.graph.fixtures[k][0].hex, hex, `graph v6 ${k}`)
}

// ---- assets 段 ----
const asrc = readFileSync(join(ROOT, 'tests/level_variable_initial_values_test.ts'), 'utf8')
for (const [k, hex] of Object.entries(extractObj(asrc, 'EDITOR_HEXES'))) {
  checkHex(rules.rules.assets.fixtures[`1094713345:${k}`].hex, hex, `assets 关卡实体 ${k}`)
}
for (const [k, hex] of Object.entries(extractObj(asrc, 'NORMAL_ENTITY_HEXES'))) {
  checkHex(rules.rules.assets.fixtures[`1077936129:${k}`].hex, hex, `assets 普通实体 ${k}`)
}
for (const [eid, entries] of Object.entries(extractNestedObj(asrc, 'PLAYER_CHARACTER_HEXES'))) {
  for (const [k, hex] of Object.entries(entries)) {
    checkHex(rules.rules.assets.fixtures[`${eid}:${k}`].hex, hex, `assets ${eid} ${k}`)
  }
}
const ssrc = readFileSync(join(ROOT, 'tests/level_variable_str_list_empty_test.ts'), 'utf8')
checkHex(
  rules.rules.assets.fixtures['1094713345:新增变量1'].hex,
  extractConst(ssrc, 'EDITOR_ENTRY_HEX'),
  'assets v5 str_list entry'
)

// ---- local-server 段 ----
const lsrc = readFileSync(join(ROOT, 'tests/local_variable_editor_wire_test.ts'), 'utf8')
const serverFx = rules.rules['local-server'].fixtures
checkHex(serverFx['bool:false'].hex, extractConst(lsrc, 'EDITOR_VALUE_FALSE'), 'server bool false')
checkHex(serverFx['bool:true'].hex, extractConst(lsrc, 'EDITOR_VALUE_TRUE'), 'server bool true')
checkHex(serverFx['int_list'].hex, extractConst(lsrc, 'EDITOR_LIST_VALUE'), 'server int_list')
checkHex(serverFx['str_list'].hex, extractConst(lsrc, 'EDITOR_STR_LIST_VALUE'), 'server str_list')
const byCid: Record<string, string> = {
  '20': 'int',
  '2656': 'str',
  '2657': 'entity',
  '2658': 'guid',
  '2659': 'float',
  '2660': 'vec3'
}
const typeValues = extractObj(lsrc, 'EDITOR_TYPE_VALUES')
for (const [cid, irType] of Object.entries(byCid)) {
  checkHex(serverFx[irType].hex, typeValues[cid], `server ${irType}（cid ${cid}）`)
}

// ---- local-client 段 ----
const clientFx = rules.rules['local-client'].fixtures
checkHex(clientFx['测试'].namePinHex, extractConst(lsrc, 'EDITOR_CLIENT_NAME'), 'client 测试 name pin')
const clientTypeValues = extractObj(lsrc, 'EDITOR_CLIENT_TYPE_VALUES')
for (const [name, hex] of Object.entries(clientTypeValues)) {
  assert.ok(clientFx[name], `client fixture 缺 ${name}`)
  checkHex(clientFx[name].valuePinHex, hex, `client ${name} value pin`)
}

// ---- 样本 sha 完整性（raw 目录存在时）----
let sampleShas = 0
try {
  const rawDir = join(process.env.HOME ?? '', 'genshin-ts-evidence/variable-system/raw')
  for (const s of rules.samples) {
    if (!s.file) continue
    const p = join(rawDir, s.file)
    const sha = createHash('sha256').update(readFileSync(p)).digest('hex')
    assert.equal(sha, s.sha256, `样本 sha 不匹配：${s.file}`)
    sampleShas++
  }
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  console.log('raw 样本目录不存在，跳过 sha 完整性校验')
}

console.log(
  JSON.stringify(
    {
      fixturesChecked: checked,
      sampleShasVerified: sampleShas,
      rulesVersion: rules.meta.version,
      samples: rules.samples.length,
      ok: true
    },
    null,
    2
  )
)
