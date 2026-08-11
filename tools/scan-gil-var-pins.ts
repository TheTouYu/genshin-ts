// @ts-nocheck
/**
 * 全量扫描 GIL 中"变量类节点"的变量名 pin 完整性：
 * Set/Get Custom Variable（22/50，变量名=IN_PARAM shell 1）
 * Set/Get Node Graph Variable（323/337，变量名=IN_PARAM shell 0）。
 *
 * 背景（2026-08-12 split2 复盘）：控制图 init 链 9 个 Set Custom Variable 节点
 * 漏填变量名 pin（构建脚本只写了 value/target 的 link，没写 name 的 param），
 * explain/parse/layout --check 全部通过 → 编辑器加载后变量名下拉为空 → 运行时写不进变量。
 * 本脚本把"变量名 pin 必须存在且非空"变成一条命令可查。
 *
 * 用法:
 *   npx tsx tools/scan-gil-var-pins.ts <map.gil>           # 扫描全部图（主图+impl），有违规退出码 1
 *   npx tsx tools/scan-gil-var-pins.ts <map.gil> --json    # 结构化输出
 *   npx tsx tools/scan-gil-var-pins.ts <map.gil> --list-names  # 附带打印全部出现的变量名（与声明集合核对）
 *   npx tsx tools/scan-gil-var-pins.ts <map.gil> --graph 1073741846  # 只扫指定图
 */
import { readFileSync } from 'fs'
import { createHash } from 'node:crypto'
import { listGraphs, locateGraphField, parseGraphNodes, PIN_KIND } from '../src/cli/static_assembly/graph_edit.js'

const FAMILIES = [
  { generic: 22, nameShell: 1, label: 'Set Custom Variable' },
  { generic: 50, nameShell: 1, label: 'Get Custom Variable' },
  { generic: 323, nameShell: 0, label: 'Set Node Graph Variable' },
  { generic: 337, nameShell: 0, label: 'Get Node Graph Variable' }
]

function usage(exitCode = 0) {
  const text = [
    '用法: npx tsx tools/scan-gil-var-pins.ts <map.gil> [选项]',
    '',
    '选项:',
    '  --graph <id>      只扫描指定图（默认全部主图 + impl 图）',
    '  --json            输出 JSON（violations/summary/names）',
    '  --list-names      附带打印全部变量类节点出现的变量名（与实体/图变量声明核对用）',
    '  -h, --help        显示帮助',
    '',
    '退出码: 0 = 全部变量名 pin 完整；1 = 存在违规（缺失/为空）',
    '',
    '检查对象: Set/Get Custom Variable(22/50 家族) 的 IN_PARAM shell 1、',
    '          Set/Get Node Graph Variable(323/337 家族) 的 IN_PARAM shell 0。',
    '违规分类: name-pin-missing = 节点有 pin 但缺变量名（构建漏参，编辑器加载后下拉为空）；',
    '          name-pin-empty = 变量名 pin 为空字符串；',
    '          bare-node = 节点无任何 pin（编辑器丢弃残骸，历史现场）。'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](text)
  process.exit(exitCode)
}

function parseArgs(args) {
  if (args.includes('-h') || args.includes('--help')) usage(0)
  const filePath = args[0]
  if (!filePath || filePath.startsWith('-')) usage(1)
  const options = { graph: undefined, json: false, listNames: false }
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    const next = () => args[++i]
    if (arg === '--graph') {
      options.graph = Number(next())
      if (!Number.isFinite(options.graph)) usage(1)
    } else if (arg.startsWith('--graph=')) {
      options.graph = Number(arg.slice(8))
      if (!Number.isFinite(options.graph)) usage(1)
    }
    else if (arg === '--json') options.json = true
    else if (arg === '--list-names') options.listNames = true
    else usage(1)
  }
  return { filePath, options }
}

// 从 pin 的 valueText（如 `C5 Str "busy"` / `未设置`）提取引号内的名字；取不到 = 未填
function nameOf(pin) {
  const m = /"((?:[^"\\]|\\.)*)"/.exec(pin?.valueText ?? '')
  return m ? m[1] : undefined
}

function scan(filePath, options) {
  const bytes = readFileSync(filePath)
  const payload = bytes.slice(20, -4)
  const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  const byGeneric = new Map(FAMILIES.map((f) => [f.generic, f]))
  const violations = []
  const names = new Set()
  let varNodes = 0
  let graphsScanned = 0

  for (const g of listGraphs(bytes)) {
    if (options.graph !== undefined && g.id !== options.graph) continue
    let graphField
    try {
      graphField = locateGraphField(payload, g.id).field
    } catch {
      continue // 图记录定位失败（罕见），跳过
    }
    const nodes = parseGraphNodes(payload.subarray(graphField.dataStart, graphField.dataEnd))
    graphsScanned++
    for (const n of nodes) {
      const fam = byGeneric.get(n.genericId)
      if (!fam) continue
      varNodes++
      const pins = n.pins ?? []
      const namePin = pins.find((p) => p.kind === PIN_KIND.IN_PARAM && p.index === fam.nameShell)
      if (pins.length === 0) {
        // 裸节点：无任何 pin（编辑器丢弃残骸，如 now-main.gil 的 bug 现场）——与"活了但缺名字 pin"不同类
        violations.push({
          graphId: g.id, graphName: g.name ?? '(无名)', node: n.index,
          genericId: n.genericId, concreteId: n.concreteId,
          kind: 'bare-node', detail: `${fam.label} 无任何 pin（疑似编辑器丢弃残骸）`
        })
        continue
      }
      const name = namePin ? nameOf(namePin) : undefined
      if (namePin === undefined) {
        violations.push({
          graphId: g.id, graphName: g.name ?? '(无名)', node: n.index,
          genericId: n.genericId, concreteId: n.concreteId,
          kind: 'name-pin-missing', detail: `${fam.label} 变量名 pin(IN_PARAM shell ${fam.nameShell}) 缺失`
        })
      } else if (name === undefined || name === '') {
        violations.push({
          graphId: g.id, graphName: g.name ?? '(无名)', node: n.index,
          genericId: n.genericId, concreteId: n.concreteId,
          kind: 'name-pin-empty', detail: `${fam.label} 变量名 pin 为空（valueText=${namePin.valueText}）`
        })
      } else {
        names.add(name)
      }
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ gil: filePath, sha256: sha, graphsScanned, varNodes, violations, names: [...names].sort() }, null, 2))
  } else {
    console.log(`scan-gil-var-pins ${filePath} sha256=${sha} graphs=${graphsScanned} var-nodes=${varNodes}`)
    for (const v of violations) {
      console.log(`violation: graph ${v.graphId} ${v.graphName} n${v.node} (${v.genericId}/${v.concreteId}) ${v.detail}`)
    }
    if (options.listNames && names.size > 0) {
      console.log(`names: ${[...names].sort().join(', ')}`)
    }
    console.log(violations.length === 0 ? 'result: ok（全部变量名 pin 完整）' : `result: ${violations.length} 处违规`)
  }
  process.exit(violations.length === 0 ? 0 : 1)
}

const { filePath, options } = parseArgs(process.argv.slice(2))
scan(filePath, options)
