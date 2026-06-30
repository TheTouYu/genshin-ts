#!/usr/bin/env npx tsx
/**
 * GIA 文档缺口扫描工具
 *
 * 使用启发式方法检测 .gia 文件中可能未被现有文档覆盖的 CompositeDef 模式。
 * 与 coverage.ts 不同（匹配已知模式），本工具专注于"寻找未知的模式"。
 *
 * 用法: npx tsx tools/gap-scan.ts <file.gia>
 *
 * 启发式规则:
 *   1. 大 impl 图异常值 — impl 节点数 > 10
 *   2. 嵌套调用密度 — 嵌套调用数 / impl 节点数 > 0.3
 *   3. 不寻常的 pin 配置 — I=0/O>=1（事件触发器）、I=0/O=0（纯数据高位扇出）等
 *   4. Pin 扇出 — 同一 outerPinIndex 在 compositePins 中出现多次
 *   5. relatedIds 非空 — SignalingDef 和 structureDef 网关
 *
 * 依赖: node_modules 已安装，.gia 文件存在
 */

import { decode_gia_file } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.ts'

// ─── 启发式分析 ─────────────────────────────────────────────

interface GapReport {
  composites: CompositeGap[]
  accessorySummary: { which: number; count: number }[]
}

interface CompositeGap {
  name: string
  id: number
  reasons: string[]
  stats: {
    implNodes: number
    nestedCalls: number
    nestedDensity: number
    inflows: number
    outflows: number
    inputs: number
    outputs: number
    compositePins: number
    pinFanouts: Map<number, number>
  }
}

function analyzeComposite(a: any, implGraphs: Map<number, any>): CompositeGap {
  const def = a.compositeDef?.inner?.def ?? {}
  // graphId 位于 compositeDef.inner.def.id.graphId.id
  const graphId = def?.id?.graphId?.id ?? 0
  const implGraph = implGraphs.get(graphId)
  const nodes = implGraph?.nodes ?? []
  const compositePins = implGraph?.compositePins ?? []

  // 基本统计
  const inflows = def.inflows?.length ?? 0
  const outflows = def.outflows?.length ?? 0
  const inputs = def.inputs?.length ?? 0
  const outputs = def.outputs?.length ?? 0
  const implNodes = nodes.length
  const nestedCalls = nodes.filter((n: any) => n.genericId?.kind === 22001).length
  const nestedDensity = implNodes > 0 ? nestedCalls / implNodes : 0

  // Pin 扇出分析
  const pinFanouts = new Map<number, number>()
  for (const cp of compositePins) {
    const key = cp.outerPin?.kind ?? 0
    pinFanouts.set(key, (pinFanouts.get(key) ?? 0) + 1)
  }

  const reasons: string[] = []

  // 规则 1: 大 impl 图
  if (implNodes > 10) {
    reasons.push(`impl 图异常大 (${implNodes} 个节点)`)
  }

  // 规则 2: 高嵌套密度
  if (nestedDensity > 0.3 && nestedCalls >= 2) {
    reasons.push(`嵌套密度高 (${nestedCalls}/${implNodes}=${(nestedDensity * 100).toFixed(0)}%) — 可能是编排器模式`)
  }

  // 规则 3: 不寻常的 pin 配置
  if (inflows === 0 && outflows >= 1 && nestedCalls === 0) {
    // 非信号、非嵌套的事件触发器
    reasons.push(`0 InFlow / ${outflows} OutFlow — 事件触发器候选`)
  }
  if (inflows === 0 && outflows === 0 && inputs >= 1 && outputs >= 4) {
    reasons.push(`0 InFlow/OutFlow + 高扇出 (${inputs}→${outputs}) — 切换开关/分配器候选`)
  }
  if (inflows >= 2) {
    reasons.push(`${inflows} 个 InFlow — 多入口复合`)
  }

  // 规则 4: Pin 扇出（同一 outerPinKind 出现多次）
  for (const [kind, count] of pinFanouts) {
    const kindName = ['?', 'InFlow', 'OutFlow', 'InParam', 'OutParam'][kind] ?? `kind=${kind}`
    if (count > 3) {
      reasons.push(`${kindName} 扇出高 (${count} 条映射)`)
    }
  }

  // 规则 5: 嵌套调用密度低但 impl 图大
  if (implNodes >= 8 && nestedCalls === 0) {
    reasons.push(`纯原生实现 (${implNodes} 个节点, 0 嵌套调用) — 纯原生复合候选`)
  }

  // 规则 6: OutParam 多
  if (outputs >= 5) {
    reasons.push(`${outputs} 个 OutParam — 多返回值复合`)
  }

  // 规则 7: InParam 多
  if (inputs >= 5) {
    reasons.push(`${inputs} 个 InParam — 大参数复合`)
  }

  return {
    name: a.name ?? '(unnamed)',
    id: a.id?.id ?? 0,
    reasons,
    stats: { implNodes, nestedCalls, nestedDensity, inflows, outflows, inputs, outputs, compositePins: compositePins.length, pinFanouts },
  }
}

// ─── 主函数 ─────────────────────────────────────────────────

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('用法: npx tsx tools/gap-scan.ts <file.gia>')
    console.error('使用启发式方法检测 .gia 文件中可能未被文档覆盖的 CompositeDef 模式。')
    process.exit(1)
  }

  let r: any
  try {
    r = await decode_gia_file(file, undefined, false)
  } catch (e: any) {
    console.error(`❌ 无法解码 ${file}: ${e.message}`)
    process.exit(1)
  }

  const accs = r.accessories ?? []
  const compositeDefs = accs.filter((a: any) => a.which === 12)

  if (compositeDefs.length === 0) {
    console.log(`⚠️  ${file} 中未找到 CompositeDef（which=12）`)
    return
  }

  console.log(`═══ 缺口扫描: ${file} ═══\n`)
  console.log(`CompositeDef 总数: ${compositeDefs.length}`)

  // 构建 impl graph 查找表（which=9 → 节点列表）
  const implGraphs = new Map<number, any>()
  for (const a of accs) {
    if (a.which === 9) {
      const implGraphId = a.id?.id ?? 0
      const graph = a.graph?.inner?.graph
      if (graph) implGraphs.set(implGraphId, graph)
    }
  }

  // 逐个分析
  let gapCount = 0
  let totalHints = 0

  // 按原因分组
  const reasonGroups = new Map<string, string[]>()

  for (const a of compositeDefs) {
    const g = analyzeComposite(a, implGraphs)

    if (g.reasons.length > 0) {
      gapCount++
      totalHints += g.reasons.length

      console.log(`\n⚠️  "${g.name}" (id=${g.id})`)
      console.log(`   接 口: I=${g.stats.inflows} O=${g.stats.outflows} In=${g.stats.inputs} Out=${g.stats.outputs}`)
      console.log(`   节 点: ${g.stats.implNodes} (${g.stats.nestedCalls} 嵌套, 密度=${(g.stats.nestedDensity * 100).toFixed(0)}%)`)
      console.log(`   线 索:`)
      for (const reason of g.reasons) {
        console.log(`     → ${reason}`)
      }

      // 按原因分组
      for (const reason of g.reasons) {
        const key = reason.split('—')[0].trim() // 取主标签
        const existing = reasonGroups.get(key) ?? []
        existing.push(g.name)
        reasonGroups.set(key, existing)
      }
    }
  }

  // 汇总
  console.log(`\n─── 缺口汇总 ───\n`)
  console.log(`  总计:      ${compositeDefs.length} 个 CompositeDef`)
  console.log(`  有疑点:    ${gapCount} 个 (${Math.round(gapCount / compositeDefs.length * 100)}%)`)
  console.log(`  线索数:    ${totalHints} 条线索`)

  if (reasonGroups.size > 0) {
    console.log(`\n  按线索分组:`)
    // 按出现次数降序排列
    const sorted = [...reasonGroups.entries()].sort((a, b) => b[1].length - a[1].length)
    for (const [reason, names] of sorted) {
      console.log(`    [${names.length}个] ${reason}`)
    }
  }

  // 其他 accessory 类型
  const otherAccs = accs.filter((a: any) => a.which !== 12)
  const whichCounts = new Map<number, number>()
  for (const a of otherAccs) {
    whichCounts.set(a.which, (whichCounts.get(a.which) ?? 0) + 1)
  }
  if (whichCounts.size > 0) {
    console.log(`\n  其他 accessory 类型:`)
    for (const [which, count] of whichCounts) {
      const name = which === 14 ? 'SignalDef' : which === 29 ? 'structureDef' : which === 9 ? 'EntityNode' : `which=${which}`
      console.log(`    [${count}个] ${name} (which=${which})`)
    }
  }
}

main()
