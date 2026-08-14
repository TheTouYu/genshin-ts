// @ts-nocheck
/**
 * 复合节点族覆盖验证（2026-08-14 方法论：编译层批量 + 失败定位 + 收敛迭代）
 *
 * 理论锚点（用户）：复合能支持主图所有节点（甚至整图打包）。本测试按节点族批量构造
 * 最小复合用例，自动迭代：构建全部 → 失败按复合名定位 → 移除失败项 → 重试收敛，
 * 一次暴露一批生产缺口（同因同修，见 fix-series-extension 技能）。
 *
 * Run:
 *   npx tsx tests/composite/test-composite-node-family-coverage.ts
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../src/runtime/core.js'
import { dictLiteral, entity, float, int, listLiteral, str, vec3 } from '../../src/runtime/value.js'
import assert from 'node:assert/strict'

type FamilyCase = { name: string; family: string; def: () => unknown }

const cases: FamilyCase[] = [
  {
    name: 'fam_arith_add', family: 'arithmetic',
    def: () => g.defineComposite('fam_arith_add', {
      inputs: { a: { type: 'float' }, b: { type: 'float' } },
      outputs: { r: { type: 'float' } },
      build: ({ a, b }, f) => ({ r: f.addition(a, b) })
    })
  },
  {
    name: 'fam_arith_mul', family: 'arithmetic',
    def: () => g.defineComposite('fam_arith_mul', {
      inputs: { a: { type: 'float' }, b: { type: 'float' } },
      outputs: { r: { type: 'float' } },
      build: ({ a, b }, f) => ({ r: f.multiplication(a, b) })
    })
  },
  {
    name: 'fam_cmp_eq', family: 'compare',
    def: () => g.defineComposite('fam_cmp_eq', {
      inputs: { a: { type: 'int' }, b: { type: 'int' } },
      outputs: { r: { type: 'bool' } },
      build: ({ a, b }, f) => ({ r: f.equal(a, b) })
    })
  },
  {
    name: 'fam_vec_add', family: 'vector',
    def: () => g.defineComposite('fam_vec_add', {
      inputs: { a: { type: 'vec3' }, b: { type: 'vec3' } },
      outputs: { r: { type: 'vec3' } },
      build: ({ a, b }, f) => ({ r: f._3dVectorAddition(a, b) })
    })
  },
  {
    name: 'fam_vec_cross', family: 'vector',
    def: () => g.defineComposite('fam_vec_cross', {
      inputs: { a: { type: 'vec3' }, b: { type: 'vec3' } },
      outputs: { r: { type: 'vec3' } },
      build: ({ a, b }, f) => ({ r: f._3dVectorCrossProduct(a, b) })
    })
  },
  {
    name: 'fam_vec_create', family: 'vector',
    def: () => g.defineComposite('fam_vec_create', {
      inputs: {},
      outputs: { r: { type: 'vec3' } },
      build: (_c, f) => ({ r: f.create3dVector(1, 2, 3) })
    })
  },
  {
    name: 'fam_trig_sin', family: 'trig',
    def: () => g.defineComposite('fam_trig_sin', {
      inputs: { a: { type: 'float' } },
      outputs: { r: { type: 'float' } },
      build: ({ a }, f) => ({ r: f.sineFunction(a) })
    })
  },
  {
    name: 'fam_list_index', family: 'list',
    def: () => g.defineComposite('fam_list_index', {
      inputs: { i: { type: 'int' } },
      outputs: { r: { type: 'entity' } },
      build: ({ i }, f) => ({
        r: f.getCorrespondingValueFromList(f.getNodeGraphVariable('blocks').asType('entity_list'), i)
      })
    })
  },
  {
    name: 'fam_dict_query', family: 'dictionary',
    def: () => g.defineComposite('fam_dict_query', {
      inputs: { k: { type: 'int' } },
      outputs: { r: { type: 'vec3' } },
      build: ({ k }, f) => ({
        r: f.queryDictionaryValueByKey(f.getNodeGraphVariable('axes').asDict('int', 'vec3'), k)
      })
    })
  },
  {
    name: 'fam_dict_keys', family: 'dictionary',
    def: () => g.defineComposite('fam_dict_keys', {
      inputs: {},
      outputs: { r: { type: 'int_list' } },
      build: (_c, f) => ({
        r: f.getListOfKeysFromDictionary(f.getNodeGraphVariable('axes').asDict('int', 'vec3'))
      })
    })
  },
  {
    name: 'fam_dict_setadd', family: 'dictionary',
    def: () => g.defineComposite('fam_dict_setadd', {
      inputs: { k: { type: 'int' }, v: { type: 'vec3' } },
      outputs: {},
      outflows: ['done'],
      build: ({ k, v }, f) => {
        const tail = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
          f.getNodeGraphVariable('axes').asDict('int', 'vec3'),
          k,
          v
        ])
        f.outflow('done', tail, 0)
        return {}
      }
    })
  },
  {
    name: 'fam_gv_get', family: 'graph_variable',
    def: () => g.defineComposite('fam_gv_get', {
      inputs: {},
      outputs: { r: { type: 'bool' } },
      build: (_c, f) => ({ r: f.getNodeGraphVariable('lock').asType('bool') })
    })
  },
  {
    name: 'fam_gv_set', family: 'graph_variable',
    def: () => g.defineComposite('fam_gv_set', {
      inputs: { v: { type: 'bool' } },
      outputs: {},
      outflows: ['done'],
      build: ({ v }, f) => {
        const tail = f.registerExecNode('set_node_graph_variable', [new str('lock'), v])
        f.outflow('done', tail, 0)
        return {}
      }
    })
  },
  {
    name: 'fam_query_loc', family: 'query',
    def: () => g.defineComposite('fam_query_loc', {
      inputs: { e: { type: 'entity' } },
      outputs: { r: { type: 'vec3' } },
      build: ({ e }, f) => ({ r: f.getEntityLocationAndRotation(e).location })
    })
  },
  {
    name: 'fam_exec_print', family: 'exec_action',
    def: () => g.defineComposite('fam_exec_print', {
      inputs: { s: { type: 'str' } },
      outputs: {},
      outflows: ['done'],
      build: ({ s }, f) => {
        const tail = f.registerExecNode('print_string', [s])
        f.outflow('done', tail, 0)
        return {}
      }
    })
  },
  {
    name: 'fam_exec_motion', family: 'exec_action',
    def: () => g.defineComposite('fam_exec_motion', {
      inputs: { e: { type: 'entity' }, v: { type: 'vec3' } },
      outputs: {},
      outflows: ['done'],
      build: ({ e, v }, f) => {
        const tail = f.registerExecNode('add_uniform_basic_linear_motion_device', [
          e,
          new str('m1'),
          new float(0.2),
          v
        ])
        f.outflow('done', tail, 0)
        return {}
      }
    })
  },
  {
    name: 'fam_ctl_dbranch', family: 'control_flow',
    def: () => g.defineComposite('fam_ctl_dbranch', {
      inputs: { c: { type: 'bool' }, s: { type: 'str' } },
      outputs: {},
      outflows: ['hit', 'miss'],
      build: ({ c, s }, f) => {
        f.doubleBranch(c, () => {
          const tail = f.registerExecNode('print_string', [s])
          f.outflow('hit', tail, 0)
        }, () => {
          const tail = f.registerExecNode('print_string', [s])
          f.outflow('miss', tail, 0)
        })
        return {}
      }
    })
  },
  {
    name: 'fam_cv_get', family: 'custom_variable',
    def: () => g.defineComposite('fam_cv_get', {
      inputs: {},
      outputs: { r: { type: 'int' } },
      build: (_c, f) => ({ r: f.getCustomVariable(new entity(0), 'cv_int').asType('int') })
    })
  },
  {
    name: 'fam_cv_set', family: 'custom_variable',
    def: () => g.defineComposite('fam_cv_set', {
      inputs: { v: { type: 'int' } },
      outputs: {},
      outflows: ['done'],
      build: ({ v }, f) => {
        const tail = f.registerExecNode('set_custom_variable', [new entity(0), new str('cv_int'), v])
        f.outflow('done', tail, 0)
        return {}
      }
    })
  },
  {
    name: 'fam_ctl_mbranch', family: 'control_flow',
    def: () => g.defineComposite('fam_ctl_mbranch', {
      inputs: { v: { type: 'int' }, s: { type: 'str' } },
      outputs: {},
      outflows: ['b0', 'b1', 'b2', 'b3'],
      build: ({ v, s }, f) => {
        f.multipleBranches(v, [
          () => {
            const tail = f.registerExecNode('print_string', [s])
            f.outflow('b0', tail, 0)
          },
          () => {
            const tail = f.registerExecNode('print_string', [s])
            f.outflow('b1', tail, 0)
          },
          () => {
            const tail = f.registerExecNode('print_string', [s])
            f.outflow('b2', tail, 0)
          },
          () => {
            const tail = f.registerExecNode('print_string', [s])
            f.outflow('b3', tail, 0)
          }
        ])
        return {}
      }
    })
  },
  {
    name: 'fam_exec_prefab', family: 'exec_action',
    def: () => g.defineComposite('fam_exec_prefab', {
      inputs: { x: { type: 'float' }, y: { type: 'float' }, z: { type: 'float' } },
      outputs: { e: { type: 'entity' } },
      outflows: ['done'],
      build: ({ x, y, z }, f) => {
        const e = f.createPrefab(1077936129, f.create3dVector(x, y, z), f.create3dVector(0, 0, 0), new entity(0), false, 0, new listLiteral('int', []))
        const meta = (e as unknown as { getMetadata?: () => { record?: { id: number } } }).getMetadata?.()
        if (meta?.record) f.outflow('done', meta.record as never, 0)
        return { e }
      }
    })
  },
  {
    name: 'fam_combo_loc_vec', family: 'combination',
    def: () => g.defineComposite('fam_combo_loc_vec', {
      inputs: { e: { type: 'entity' } },
      outputs: { r: { type: 'float' } },
      build: ({ e }, f) => {
        const loc = f.getEntityLocationAndRotation(e).location
        return { r: f._3dVectorDotProduct(loc, loc) }
      }
    })
  },
  {
    name: 'fam_combo_dict_loop', family: 'combination',
    def: () => g.defineComposite('fam_combo_dict_loop', {
      inputs: { k: { type: 'int' } },
      outputs: { r: { type: 'vec3' } },
      build: ({ k }, f) => {
        const axis = f.queryDictionaryValueByKey(f.getNodeGraphVariable('axes').asDict('int', 'vec3'), k)
        return { r: f._3dVectorZoom(axis, 2) }
      }
    })
  },
  {
    name: 'fam_convert_dtc', family: 'conversion',
    def: () => g.defineComposite('fam_convert_dtc', {
      inputs: { v: { type: 'float' } },
      outputs: { r: { type: 'str' } },
      build: ({ v }, f) => ({ r: f.dataTypeConversion(v, 'str') })
    })
  }
]

// —— 迭代收敛：构建全部 → 失败定位 → 移除 → 重试 ——
let remaining = [...cases]
const failures: Array<{ name: string; family: string; error: string }> = []
const passes: string[] = []
let iteration = 0

while (remaining.length > 0 && iteration < 12) {
  iteration++
  const currentNames = remaining.map((c) => c.name)
  const registry = new Map<string, unknown>()
  for (const c of remaining) registry.set(c.name, c.def())
  const graphId = 1073741825 + iteration
  // 声明图变量（axes/blocks/lock）
  g.server({ id: graphId, variables: {
    lock: false,
    blocks: new listLiteral('entity', []),
    axes: new dictLiteral([{ k: 1, v: [0, 0, 0] }])
  } }).on('whenTabIsSelected', (_evt, f) => {
    for (const name of currentNames) {
      f.callComposite(registry.get(name) as never, {})
    }
  })
  try {
    buildServerGraphRegistriesIRDocuments()
    passes.push(...remaining.map((c) => c.name))
    remaining = []
    break
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const m = msg.match(/failed to encode Composite "([^"]+)"/)
    if (!m) {
      failures.push({ name: 'ALL', family: 'pipeline', error: msg.slice(0, 300) })
      break
    }
    const failed = remaining.find((c) => c.name === m[1])
    if (!failed) {
      failures.push({ name: m[1], family: 'unknown', error: msg.slice(0, 300) })
      break
    }
    failures.push({ name: failed.name, family: failed.family, error: msg.slice(0, 300) })
    remaining = remaining.filter((c) => c.name !== m[1])
  }
}

console.log('=== 复合节点族覆盖收敛结果 ===')
console.log('PASS:', passes.length, 'FAIL:', failures.length, '迭代:', iteration)
for (const p of passes) console.log('  PASS', p)
for (const f of failures) console.log('  FAIL', f.name, '[' + f.family + ']', f.error.split('\n')[0].slice(0, 180))
assert.ok(passes.length > 0, 'at least some families must pass')
