#!/usr/bin/env npx tsx
/**
 * GIA 复合文档覆盖率分析工具
 *
 * 分析 .gia 文件中每个 CompositeDef 并对照已知文档模式分类，
 * 输出覆盖率报告，识别需要新文档的缺口。
 *
 * 用法: npx tsx tools/coverage.ts <file.gia>
 *
 * 依赖: node_modules 已安装，.gia 文件存在
 *
 * 输出: 逐复合分类 + 汇总统计
 *
 * 注意: 需要真实的 .gia 文件进行测试。在无 .gia 文件的情况下运行
 *       会提示文件不存在而非报错。
 */

import { decode_gia_file } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.ts'

// ─── 模式分类 ───────────────────────────────────────────────

interface PatternMatch {
  name: string           // 模式名，如 "纯数据复合"
  matches: (def: CompositeDefSummary) => boolean
  documented: boolean    // 是否已在现有文档中覆盖
  docRef: string         // 文档引用
}

interface CompositeDefSummary {
  name: string
  id: number
  inflows: number
  outflows: number
  inputs: number
  outputs: number
  implNodes: number
  nestedCalls: number    // impl 图中 kind=22001 节点数
  graphId: number
  relatedIds: number[]
}

// 已知模式列表（来自现有文档）
const PATTERNS: PatternMatch[] = [
  {
    name: '纯数据复合',
    matches: d => d.inflows === 0 && d.outflows === 0 && d.implNodes >= 0,
    documented: true,
    docRef: '01-ir-types.md §1.1 / 03-validation-basics.md #6',
  },
  {
    name: '基本执行型',
    matches: d => d.inflows === 1 && d.outflows === 1,
    documented: true,
    docRef: '01-ir-types.md §1.1 / 03-validation-basics.md #1',
  },
  {
    name: '终端下沉型',
    matches: d => d.inflows === 1 && d.outflows === 0,
    documented: true,
    docRef: '01-ir-types.md §1.1 / 03-validation-basics.md #1',
  },
  {
    name: '多 OutFlow',
    matches: d => d.inflows === 1 && d.outflows >= 2,
    documented: true,
    docRef: '06-advanced-patterns.md §3',
  },
  {
    name: '信号型（内置）',
    matches: d => d.inflows === 0 && d.outflows >= 1 && d.graphId === 0,
    documented: true,
    docRef: '04-validation-signal.md',
  },
  {
    name: '多 InFlow',
    matches: d => d.inflows >= 2,
    documented: true,
    docRef: '03-validation-basics.md #14',
  },
  {
    name: '有限循环',
    matches: d => d.inflows === 2 && d.outflows === 2 && d.nestedCalls === 0,
    documented: true,
    docRef: '03-validation-basics.md #16',
  },
  {
    name: '纯原生复合（零嵌套）',
    matches: d => d.inflows >= 1 && d.outflows >= 1 && d.implNodes >= 8 && d.nestedCalls === 0,
    documented: true,
    docRef: '06-advanced-patterns.md §8',
  },
  {
    name: '嵌套复合',
    matches: d => d.implNodes >= 1 && d.nestedCalls >= 1 && d.nestedCalls <= 2,
    documented: true,
    docRef: '03-validation-basics.md #7',
  },
  {
    name: '编排器复合',
    matches: d => d.nestedCalls >= 3,
    documented: true,
    docRef: '06-advanced-patterns.md §4.1',
  },
  {
    name: '事件触发器',
    matches: d => d.inflows === 0 && d.outflows >= 1 && d.graphId > 0,
    documented: true,
    docRef: '06-advanced-patterns.md §9',
  },
  {
    name: '切换开关（高扇出纯数据）',
    matches: d => d.inflows === 0 && d.outflows === 0 && d.inputs === 1 && d.outputs >= 6,
    documented: true,
    docRef: '06-advanced-patterns.md §7',
  },
]

// ─── 分类逻辑 ───────────────────────────────────────────────

function buildImplGraphs(accs: any[]): Map<number, any> {
  const implGraphs = new Map<number, any>()
  for (const a of accs) {
    if (a.which === 9) {
      const graphId = a.id?.id ?? 0
      const graph = a.graph?.inner?.graph
      if (graph) implGraphs.set(graphId, graph)
    }
  }
  return implGraphs
}

function classify(s: CompositeDefSummary): PatternMatch[] {
  const matched: PatternMatch[] = []
  for (const p of PATTERNS) {
    if (p.matches(s)) matched.push(p)
  }
  return matched
}

function summarizeFromAccessory(a: any, implGraphs: Map<number, any>): CompositeDefSummary {
  const def = a.compositeDef?.inner?.def ?? {}
  // graphId 位于 compositeDef.inner.def.id.graphId.id
  const graphId = def?.id?.graphId?.id ?? 0
  const implNodes = implGraphs.get(graphId)?.nodes ?? []
  const nestedCalls = implNodes.filter((n: any) => n.genericId?.kind === 22001).length
  const inflows = def.inflows?.length ?? 0
  const outflows = def.outflows?.length ?? 0
  const inputs = def.inputs?.length ?? 0
  const outputs = def.outputs?.length ?? 0
  const relatedIds = (a.relatedIds ?? []).map((r: any) => r.id ?? r)
  return {
    name: a.name ?? '(unnamed)',
    id: a.id?.id ?? 0,
    inflows,
    outflows,
    inputs,
    outputs,
    implNodes: implNodes.length,
    nestedCalls,
    graphId,
    relatedIds,
  }
}

// ─── 主函数 ─────────────────────────────────────────────────

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('用法: npx tsx tools/coverage.ts <file.gia>')
    console.error('分析 .gia 文件中每个 CompositeDef 并对照已知文档模式分类。')
    process.exit(1)
  }

  let r: any
  try {
    r = await decode_gia_file(file, undefined, false)
  } catch (e: any) {
    console.error(`❌ 无法解码 ${file}: ${e.message}`)
    process.exit(1)
  }

  const allUnits = [r.graph, ...(r.accessories ?? [])]
  const compositeDefs = allUnits.filter((a: any) => a && a.which === 12)

  if (compositeDefs.length === 0) {
    console.log(`⚠️  ${file} 中未找到 CompositeDef（which=12）`)
    return
  }

  // 构建 impl graph 查找表（which=9 → 节点列表）
  const accs = r.accessories ?? []
  const implGraphs = buildImplGraphs(accs)

  console.log(`═══ 覆盖率报告: ${file} ═══\n`)
  console.log(`CompositeDef 总数: ${compositeDefs.length}\n`)

  // 逐个分类
  let documentedCount = 0
  let undocCount = 0
  const undocPatterns = new Map<string, number>()

  for (const a of compositeDefs) {
    const s = summarizeFromAccessory(a, implGraphs)
    const matched = classify(s)

    const docStatus = matched.some(m => m.documented) ? '✅ 已记录' : '⚠️ 未覆盖'
    if (matched.some(m => m.documented)) documentedCount++
    else { undocCount++; undocPatterns.set(s.name, (undocPatterns.get(s.name) || 0) + 1) }

    console.log(`${a.name} (id=${s.id})`)
    console.log(`  接口: I=${s.inflows} O=${s.outflows} In=${s.inputs} Out=${s.outputs}`)
    console.log(`  impl 节点: ${s.implNodes} (其中 ${s.nestedCalls} 个嵌套调用)`)
    console.log(`  状态: ${docStatus}`)
    console.log(`  匹配模式: ${matched.length > 0 ? matched.map(m => `"${m.name}"`).join(', ') : '(无匹配)'}`)
    if (matched.length > 0) console.log(`  文档: ${matched.map(m => m.docRef).join('; ')}`)
    console.log()
  }

  // 汇总
  console.log('─── 汇总 ───\n')
  console.log(`  总计:       ${compositeDefs.length} 个 CompositeDef`)
  console.log(`  已记录:     ${documentedCount} 个 (${Math.round(documentedCount / compositeDefs.length * 100)}%)`)
  console.log(`  未覆盖:     ${undocCount} 个 (${Math.round(undocCount / compositeDefs.length * 100)}%)`)

  if (undocPatterns.size > 0) {
    console.log(`\n  潜在新模式:`)
    for (const [name, count] of undocPatterns) {
      console.log(`    ⚠️  "${name}" (${count} 个实例)`)
    }
  }

  // 其他 accessory 类型统计
  const otherWhich = new Set<number>()
  for (const a of accs) {
    if (a.which !== 12) otherWhich.add(a.which)
  }
  if (otherWhich.size > 0) {
    console.log(`\n  其他 accessory 类型: which = ${[...otherWhich].sort().join(', ')}`)
  }
}

main()
