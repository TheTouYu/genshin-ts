// gia-verify-pin.ts — .gia 编译产物核验速查（只读）
//
// 背景（2026-08-31 足球四点合一轮实证）：核"常量折叠落位 / 信号三件套 / 复合执行序"
// 若靠手写 JSON 结构探测，平均浪费 6+ 轮工具调用。本工具把三类核验压成一条命令。
//
// 用法: npx tsx tools/gia-verify-pin.ts <file.gia> [选项]
//
//   --vals <a,b,c>     数值落位核验：float32 容差匹配（TS 0.12 → .gia 0.11999999731779099，
//                      字符串 grep 会 0 命中，必须数值扫描），报告每个命中的容器位置
//   --composite <名>   dump 该复合 impl 的执行边（--data 追加数据边）
//   --data             与 --composite 连用
//   --json             机器可读输出
//   -h, --help         显示本帮助
//
// 默认（无选项）输出摘要：主图节点数 + accessories 名录（def/impl 成对 + 节点数）+ 信号三件套。
// 值定位速记：decode 后的值在 pins[N].value.bConcreteValue.value（或裸 pins[N].value）；
// 复合 def 条目带名字，其 impl 条目 id = def id + 10000 且名字为空。
// 样例:
//   npx tsx tools/gia-verify-pin.ts dist.gia --vals 0.12,3.5,1.5,0.35
//   npx tsx tools/gia-verify-pin.ts game.gia --composite state_commit --data
import { readFileSync } from 'node:fs'

import { decode_gia_file } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.ts'

function fail(message: string): never {
  console.error(`gia-verify-pin: ${message}`)
  process.exit(1)
}

function printHelp() {
  console.log(`用法: npx tsx tools/gia-verify-pin.ts <file.gia> [选项]

选项:
  --vals <a,b,c>     数值落位核验（float32 容差；TS 常量会被折叠成 float32 形态）
  --composite <名>   dump 该复合 impl 的执行边（--data 追加数据边）
  --data             与 --composite 连用
  --json             机器可读输出
  -h, --help         显示本帮助`)
}

// 常用节点 gid → 名（仅收录实证过的；未收录显示 gid 原样，用 explain/records 查名）
const GID_NAMES: Record<number, string> = {
  2: 'DoubleBranch',
  10: 'V3Add',
  11: 'V3Sub',
  14: 'Equal',
  22: 'SetCustomVariable',
  84: 'LinMotionDevice',
  85: 'RotMotionDevice',
  200: 'Add',
  202: 'Sub',
  204: 'Mul',
  206: 'Div',
  216: 'Abs',
  220: 'V3Mod',
  225: 'Create3DVector',
  231: 'Le',
  232: 'Gt',
  233: 'Ge',
  323: 'SetVar',
  337: 'GetVar'
}

const SIGNAL_NAMES = new Set(['发送信号', '监听信号', '向服务器节点图发送信号'])

type Hit = { val: number; target: number; where: string; kind: string }

function scanNumbers(node: unknown, where: string, hits: Hit[], targets: number[]) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanNumbers(v, `${where}[${i}]`, hits, targets))
    return
  }
  if (node === null || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  // 已设值容器：bFloat/bInt/bId/bEnum（decode 形态）或裸数字 value
  // bId = config_id 字面量（技能变量槽 / 技能配置 ID / 单位状态 ID），bEnum = 枚举（技能槽位等）。
  // 2026-09-04 票 20 E0 实证同族漏报：`--vals 1207959581`（技能变量槽，落 wire 为 bId）
  // 在只扫 bFloat/bInt 时报 **0 命中**，看起来像"常量没折叠进去"，实为形态漏分类
  // （与 .agents/skills/gil-node-graph-reading/references/decode-gia-constant-scan.py 同族，两处同步修）。
  for (const key of ['bFloat', 'bInt', 'bId', 'bEnum']) {
    const box = obj[key]
    if (box !== null && typeof box === 'object' && typeof (box as any).val === 'number') {
      const v = (box as any).val as number
      for (const t of targets) {
        if (Math.abs(v - t) <= Math.max(Math.abs(t) * 1e-6, 1e-9)) {
          hits.push({ val: v, target: t, where, kind: key })
        }
      }
    }
  }
  if (typeof obj.value === 'number') {
    const v = obj.value
    for (const t of targets) {
      if (Math.abs(v - t) <= Math.max(Math.abs(t) * 1e-6, 1e-9)) {
        hits.push({ val: v, target: t, where, kind: 'raw' })
      }
    }
  }
  for (const key of Object.keys(obj)) scanNumbers(obj[key], `${where}.${key}`, hits, targets)
}

function nodeCount(entry: any): number {
  return entry?.graph?.inner?.graph?.nodes?.length ?? 0
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    return
  }
  let file: string | undefined
  let vals: number[] | undefined
  let composite: string | undefined
  let wantData = false
  let json = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--vals') {
      vals = (args[++i] ?? fail('--vals 需要逗号分隔数值')).split(',').map((s) => {
        const n = Number(s.trim())
        if (!Number.isFinite(n)) fail(`非法数值: ${s}`)
        return n
      })
    } else if (arg === '--composite') {
      composite = args[++i] ?? fail('--composite 需要复合名')
    } else if (arg === '--data') wantData = true
    else if (arg === '--json') json = true
    else if (arg.startsWith('-') && arg !== '-') fail(`未知选项: ${arg}`)
    else if (file === undefined) file = arg
    else fail(`多余参数: ${arg}`)
  }
  if (file === undefined) fail('缺少输入文件；使用 --help 查看用法')
  if (!file.endsWith('.gia')) fail('本工具只吃 .gia（编译产物）；真实 .gil 用 explain/parse 工具链')

  const originalInfo = console.info
  console.info = console.error
  let decoded: any
  try {
    decoded = decode_gia_file(file, undefined, false)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  } finally {
    console.info = originalInfo
  }

  const accessories: any[] = decoded?.accessories ?? []
  const mainGraph = decoded?.graph?.graph?.inner?.graph

  // accessories 标注：def（带名）与其 impl（id+10000、无名）配对
  const labels = new Map<number, string>()
  for (let i = 0; i < accessories.length; i++) {
    const a = accessories[i]
    const nm = typeof a?.name === 'string' ? a.name : ''
    const id = a?.id?.id
    if (nm && !SIGNAL_NAMES.has(nm) && typeof id === 'number') {
      labels.set(id + 10000, nm)
    }
  }
  const labelOf = (i: number): string => {
    const a = accessories[i]
    const nm = typeof a?.name === 'string' ? a.name : ''
    const id = a?.id?.id
    if (nm) return nm
    if (typeof id === 'number' && labels.has(id)) return `${labels.get(id)}(impl)`
    return `acc[${i}]`
  }

  const out: Record<string, unknown> = {}

  // 摘要：主图 + 复合名录 + 信号三件套
  const signals = accessories
    .map((a, i) => ({ i, name: a?.name ?? '', id: a?.id?.id }))
    .filter((a) => SIGNAL_NAMES.has(a.name))
  const composites = accessories
    .map((a, i) => ({ i, name: a?.name ?? '', id: a?.id?.id, nodes: nodeCount(a) }))
    .filter((a) => a.name !== '' && !SIGNAL_NAMES.has(a.name))
  out.summary = {
    file,
    mainGraphNodes: mainGraph?.nodes?.length ?? 0,
    composites: composites.map((c) => `${c.i} ${c.name} id=${c.id} (impl=${nodeCount(accessories[c.i + 1] ?? {})})`),
    signals: signals.map((s) => `${s.i} ${s.name} id=${s.id}`)
  }

  // 数值落位
  if (vals) {
    const hits: Hit[] = []
    scanNumbers(mainGraph, 'mainGraph', hits, vals)
    accessories.forEach((a, i) => scanNumbers(a, `acc[${i}] ${labelOf(i)}`, hits, vals))
    out.valHits = hits.map((h) => ({
      target: h.target,
      actual: h.val,
      kind: h.kind,
      where: h.where.replace(/\.(pins|graph|inner)\./g, '.').replace(/^acc\[(\d+)\] ([^ ]+)/, '$2')
    }))
  }

  // 复合执行序
  if (composite) {
    const defIdx = accessories.findIndex(
      (a) => a?.name === composite && !SIGNAL_NAMES.has(a?.name ?? '')
    )
    if (defIdx < 0) fail(`未找到复合 def: ${composite}`)
    const impl = accessories[defIdx + 1]
    const nodes: any[] = impl?.graph?.inner?.graph?.nodes ?? []
    const nodeLines = nodes.map(
      (n) => `n${n.nodeIndex} gid=${n.genericId?.nodeId}${GID_NAMES[n.genericId?.nodeId] ? `(${GID_NAMES[n.genericId?.nodeId]})` : ''}`
    )
    const edges: string[] = []
    for (const n of nodes) {
      const pins = Array.isArray(n.pins) ? n.pins : []
      pins.forEach((p: any, pi: number) => {
        for (const c of p?.connects ?? []) {
          const kind = c?.connect?.kind
          if (kind === 1 || (wantData && kind === 4)) {
            edges.push(
              `n${n.nodeIndex}.p${pi} -${kind === 1 ? 'exec' : 'data'}-> n${c.id}`
            )
          }
        }
      })
    }
    out.compositeDump = { composite, nodeLines, edges }
  }

  const j = JSON.stringify(out, null, 2)
  if (json) process.stdout.write(j + '\n')
  else {
    const s = out.summary as any
    console.log(`== ${s.file}`)
    console.log(`主图节点: ${s.mainGraphNodes}`)
    console.log(`复合 def: ${s.composites.join(' | ')}`)
    console.log(`信号单元: ${s.signals.join(' | ')}`)
    if (out.valHits) {
      const byTarget = new Map<number, any[]>()
      for (const h of out.valHits as any[]) {
        if (!byTarget.has(h.target)) byTarget.set(h.target, [])
        byTarget.get(h.target)!.push(h)
      }
      for (const [t, list] of byTarget) {
        console.log(`-- 值 ${t}: ${list.length} 处命中`)
        for (const h of list) console.log(`   ${h.actual} (${h.kind}) @ ${h.where}`)
      }
    }
    if (out.compositeDump) {
      const d = out.compositeDump as any
      console.log(`-- 复合 ${d.composite} 执行序（${d.nodeLines.length} 节点 / ${d.edges.length} 边）`)
      for (const l of d.nodeLines) console.log(`   ${l}`)
      for (const e of d.edges) console.log(`   ${e}`)
    }
  }
}

main()
