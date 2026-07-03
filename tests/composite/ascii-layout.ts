/**
 * ASCII 布局可视化工具
 *
 * 将 .gia 文件中的节点布局渲染为 2D ASCII 制表符图形。
 * 用于不依赖游戏快速验证节点位置、连线拓扑和布局质量。
 *
 * 功能:
 *   - 节点制表符盒子渲染（含名称/索引/坐标）
 *   - 正交连线路由（exec 连线，支持分支）
 *   - 多图支持（主图 + accessories）
 *   - 节点名解析（NODE_PIN_RECORDS → NODE_ID）
 *   - 碰撞/孤立/回边检测
 *   - --compact 紧凑模式
 *
 * 用法:
 *   npx tsx tests/composite/ascii-layout.ts <file.gia> [files...]
 *   npx tsx tests/composite/ascii-layout.ts --compact <file.gia>
 *   npx tsx tests/composite/ascii-layout.ts tests/composite/output/*.gia
 */

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../../dist/src/compiler/gia_vendor.js'

// ============================================================
// 类型定义
// ============================================================

interface GraphNodeProto {
  nodeIndex: number
  x: number
  y: number
  genericId?: { class?: number; type?: number; kind?: number; nodeId?: number }
  pins?: Array<{
    i1?: { kind?: number; index?: number }
    connects?: Array<{ id: number }>
  }>
}

interface Edge {
  from: number
  to: number
}

interface GraphInfo {
  label: string
  name: string
  nodes: GraphNodeProto[]
  edges: Edge[]
  nodeNames: Map<number, string>
}

interface NodeBox {
  nodeIndex: number
  label: string
  col: number
  row: number
  width: number
  height: number
}

interface CharPos {
  col: number
  row: number
}

interface RenderOptions {
  compact: boolean
  terminalCols: number
}

// ============================================================
// 图提取
// ============================================================

function extractGraphs(data: any): GraphInfo[] {
  const results: GraphInfo[] = []

  // ---- 第一遍：从 CompositeDefWrapper(which=12) 收集名称和 implGraphId 的映射 ----
  const implNameMap = new Map<number, string>() // implGraphId → composite name
  for (const a of data.accessories ?? []) {
    const name = a.compositeDef?.inner?.def?.name || a.name || ''
    if (!name) continue
    // relatedIds[0].id 指向 impl graph 的 id
    const relId = a.relatedIds?.[0]?.id
    if (relId != null && name) {
      implNameMap.set(relId, name)
    }
  }

  // 主图
  const mainG = data.graph?.graph?.inner?.graph
  if (mainG?.nodes?.length) {
    results.push({
      label: '<主图>',
      name: '',
      nodes: mainG.nodes,
      edges: extractEdges(mainG.nodes),
      nodeNames: resolveNames(mainG.nodes),
    })
  }

  // Accessories
  for (let i = 0; i < (data.accessories?.length ?? 0); i++) {
    const a = data.accessories[i]
    const g = a.graph?.inner?.graph ?? a.implGraph?.inner?.graph
    if (!g?.nodes?.length) continue

    // 查名称
    let defName = implNameMap.get(a.id?.id) || '?'
    // 回退：看自身的 name 字段
    if (defName === '?' && a.name) defName = a.name

    results.push({
      label: `acc[${i}] "${defName}"`,
      name: defName,
      nodes: g.nodes,
      edges: extractEdges(g.nodes),
      nodeNames: resolveNames(g.nodes),
    })
  }

  return results
}

function extractEdges(nodes: GraphNodeProto[]): Edge[] {
  const edges: Edge[] = []
  for (const n of nodes) {
    for (const pin of n.pins ?? []) {
      // OutFlow = kind 2
      if (pin.i1?.kind !== 2) continue
      for (const conn of pin.connects ?? []) {
        edges.push({ from: n.nodeIndex, to: conn.id })
      }
    }
  }
  return edges
}

// ============================================================
// 节点名称映射
// ============================================================

function buildNodeNameMap(): Map<number, string> {
  const map = new Map<number, string>()

  // 优先用 NODE_PIN_RECORDS（含人类可读名称）
  for (const rec of NODE_PIN_RECORDS) {
    if (rec.name && !map.has(rec.id)) {
      map.set(rec.id, rec.name)
    }
  }

  // 回退用 NODE_ID 常量（下划线命名转空格）
  for (const [key, id] of Object.entries(NODE_ID)) {
    if (typeof id !== 'number') continue
    if (!map.has(id)) {
      const name = key.replace(/__Generic$/, '').replace(/_/g, ' ')
      map.set(id, name)
    }
  }

  return map
}

const _nodeNameCache: Map<number, string> = buildNodeNameMap()

function resolveNodeLabel(genericId: GraphNodeProto['genericId']): string {
  if (!genericId) return '?'

  const nodeId = genericId.nodeId
  const kind = genericId.kind

  if (nodeId != null) {
    const name = _nodeNameCache.get(nodeId)
    if (name) return name
    return `nid=${nodeId}`
  }

  return `kind=${kind}`
}

function resolveNames(nodes: GraphNodeProto[]): Map<number, string> {
  const map = new Map<number, string>()
  for (const n of nodes) {
    map.set(n.nodeIndex, resolveNodeLabel(n.genericId))
  }
  return map
}

// ============================================================
// 文件名处理
// ============================================================

function shortName(p: string): string {
  const m = p.match(/\/([^/]+)\.gia$/)
  return m ? m[1] + '.gia' : p
}

// ============================================================
// 坐标映射 & 缩放
// ============================================================

function computeScale(
  nodes: GraphNodeProto[],
  edges: Edge[],
  terminalCols: number,
  nodeBoxWidth: number,
): { scale: number; warnings: string[] } {
  const warnings: string[] = []
  if (nodes.length <= 1) return { scale: 0.08, warnings }

  const xs = nodes.map(n => n.x)
  const rangeX = Math.max(Math.max(...xs) - Math.min(...xs), 350)

  const margin = 4
  const availCols = terminalCols - margin * 2

  // max scale that fits terminal width
  const scaleFitWidth = availCols / rangeX

  // min scale needed to prevent adjacent connected pairs from overlapping
  let minConnectedDx = Infinity
  for (const e of edges) {
    const from = nodes.find(n => n.nodeIndex === e.from)
    const to = nodes.find(n => n.nodeIndex === e.to)
    if (from && to) {
      const dx = Math.abs(to.x - from.x)
      if (dx > 1) minConnectedDx = Math.min(minConnectedDx, dx)
    }
  }
  // For nodes with no edges, use overall min X gap
  if (minConnectedDx === Infinity) {
    const sortedByX = [...nodes].sort((a, b) => a.x - b.x)
    for (let i = 1; i < sortedByX.length; i++) {
      const dx = sortedByX[i].x - sortedByX[i - 1].x
      if (dx > 1) minConnectedDx = Math.min(minConnectedDx, dx)
    }
  }
  if (minConnectedDx === Infinity) minConnectedDx = 350

  const minGap = nodeBoxWidth + 4
  const scaleMin = minGap / minConnectedDx

  // Final scale: need at least scaleMin to avoid overlap
  let scale = Math.min(scaleFitWidth, 0.25)
  if (scale < scaleMin) {
    // 无法避免重叠
    warnings.push(`  ⚠ 节点间距不足 (scale=${scale.toFixed(3)} < 需要 ${scaleMin.toFixed(3)})，建议 --compact`)
  } else {
    scale = scaleMin
  }

  // 保证最低可读性
  scale = Math.max(scale, 0.02)

  return { scale, warnings }
}

function mapNodeToGrid(
  x: number, y: number,
  minX: number, minY: number,
  scale: number, margin: number,
): CharPos {
  return {
    col: Math.round((x - minX) * scale + margin),
    row: Math.round((y - minY) * scale + margin),
  }
}

// ============================================================
// 节点盒子渲染
// ============================================================

function renderNodeBox(
  node: GraphNodeProto,
  name: string,
  col: number,
  row: number,
  compact = false,
): { box: NodeBox; lines: string[] } {
  const idxStr = `n=${node.nodeIndex}`
  const coordStr = `(${Math.round(node.x)}, ${Math.round(node.y)})`
  const nameStr = name || `kind=${node.genericId?.kind}`

  if (compact) {
    // 紧凑模式：更窄的盒子，节省水平空间
    const shortName = nameStr.length > 12 ? nameStr.substring(0, 10) + '…' : nameStr
    const line1 = `n${node.nodeIndex} ${shortName}`
    const line2 = coordStr
    const contentWidth = Math.max(line1.length, line2.length) + 2
    const boxWidth = contentWidth + 2

    const top = `┌─${'─'.repeat(boxWidth - 4)}─┐`
    const mid1 = `│ ${line1.padEnd(boxWidth - 4)} │`
    const mid2 = `│ ${line2.padEnd(boxWidth - 4)} │`
    const bot = `└─${'─'.repeat(boxWidth - 4)}─┘`

    return {
      box: { nodeIndex: node.nodeIndex, label: shortName, col, row, width: boxWidth, height: 4 },
      lines: [top, mid1, mid2, bot],
    }
  }

  // 标准模式：4 行（含标题栏）

  // 行内容（不含边框）
  const line2 = `${idxStr}  ${nameStr}`
  const line3 = coordStr

  const contentWidth = Math.max(line2.length, line3.length) + 2 // 左右各 1 空格
  const boxWidth = contentWidth + 2 // +2 边框字符

  // 顶部标题文本截断
  const titleMax = boxWidth - 6 // ┌─  x ─┐ 需要 6 边框字符
  const title = nameStr.length > titleMax
    ? nameStr.substring(0, titleMax - 1) + '…'
    : nameStr

  const top = `┌─ ${title} ─${'─'.repeat(Math.max(0, boxWidth - 6 - title.length))}┐`
  const mid2 = `│ ${line2.padEnd(boxWidth - 4)} │`
  const mid3 = `│ ${line3.padEnd(boxWidth - 4)} │`
  const bot = `└─${'─'.repeat(boxWidth - 4)}─┘`

  return {
    box: {
      nodeIndex: node.nodeIndex,
      label: nameStr,
      col,
      row,
      width: boxWidth,
      height: 4,
    },
    lines: [top, mid2, mid3, bot],
  }
}

// ============================================================
// 连线渲染
// ============================================================

/**
 * 在字符网格上绘制一条连接线（正交路由）。
 * 使用简化的三点路由：从 source 右缘中点 → 水平 → 如果需要则垂直 → 水平 → target 左缘中点
 */
function drawEdge(
  grid: string[][],
  fromBox: NodeBox,
  toBox: NodeBox,
): void {
  // 起始点：source 右缘中部
  const sx = fromBox.col + fromBox.width
  const sy = fromBox.row + 1 // 第 2 行中部（跳过顶部边框）

  // 目标点：target 左缘中部
  const tx = toBox.col
  const ty = toBox.row + 1

  // 查找连接线是否需要经过的中间自由列
  const midCol = Math.round((sx + tx) / 2)

  if (sy === ty) {
    // 同行 → 简单水平线
    drawHLine(grid, sx, tx, sy, '─')
    setChar(grid, tx, ty, '▶')
  } else {
    // 不同行 → L 形或 Z 形
    const cornerH = midCol
    const turnLen = 2

    // 水平段 1: source → corner
    drawHLine(grid, sx, cornerH, sy, '─')
    // 垂直段: corner → target row
    const dir = ty > sy ? 1 : -1
    for (let r = sy + dir; r !== ty; r += dir) {
      mergeChar(grid, cornerH, r, '│')
    }
    // 水平段 2: corner → target
    drawHLine(grid, cornerH, tx, ty, '─')
    setChar(grid, tx, ty, '▶')

    // 拐角字符
    if (dir > 0) {
      // 向下: ┌ (右上转下)
      mergeChar(grid, cornerH, sy, '┬')
      mergeChar(grid, cornerH, ty, '┴')
    } else {
      // 向上: └ (右下转上)
    }
  }
}

/**
 * 在分支场景中，多个 child 共享同一个 parent。
 * 在 midCol 处绘制一条垂直 spine，每个 child 从 spine 水平连接。
 */
function drawBranchEdges(
  grid: string[][],
  fromBox: NodeBox,
  toBoxes: NodeBox[],
): void {
  if (toBoxes.length === 0) return
  if (toBoxes.length === 1) {
    drawEdge(grid, fromBox, toBoxes[0])
    return
  }

  // Spine 列: source 右侧固定间距
  const spineCol = fromBox.col + fromBox.width + 2
  const spineTop = Math.min(...toBoxes.map(b => b.row))
  const spineBot = Math.max(...toBoxes.map(b => b.row + 1))
  const fromRow = fromBox.row + 1

  // 从 source 右缘到 spine
  drawHLine(grid, fromBox.col + fromBox.width, spineCol, fromRow, '─')

  // 垂直 spine
  for (let r = spineTop - 1; r <= spineBot + 1; r++) {
    mergeChar(grid, spineCol, r, '│')
  }

  // 每个 child 的连接
  for (const b of toBoxes) {
    const childRow = b.row + 1
    // spine → child 左缘
    drawHLine(grid, spineCol, b.col, childRow, '─')
    setChar(grid, b.col, childRow, '▶')
    // spine 交汇处
    mergeChar(grid, spineCol, childRow, '├')
  }
}

function drawHLine(grid: string[][], fromCol: number, toCol: number, row: number, ch: string): void {
  const minC = Math.min(fromCol, toCol)
  const maxC = Math.max(fromCol, toCol)
  for (let c = minC; c <= maxC; c++) {
    mergeChar(grid, c, row, ch)
  }
}

function setChar(grid: string[][], col: number, row: number, ch: string): void {
  if (row < 0 || row >= grid.length) return
  if (col < 0 || col >= (grid[row]?.length ?? 0)) return
  grid[row][col] = ch
}

function mergeChar(grid: string[][], col: number, row: number, ch: string): void {
  if (row < 0 || row >= grid.length) return
  if (col < 0 || col >= (grid[row]?.length ?? 0)) return
  const existing = grid[row][col]
  if (existing === ' ' || existing === undefined) {
    grid[row][col] = ch
    return
  }
  // 处理交叉
  grid[row][col] = mergeBoxChars(existing, ch)
}

/** 两个制表符字符的交汇合并 */
function mergeBoxChars(a: string, b: string): string {
  // 简单规则：同向叠加保持，垂直/水平交叉用 ┼
  const horiz = new Set(['─', '━', '═'])
  const vert = new Set(['│', '┃', '║'])

  const aH = horiz.has(a)
  const aV = vert.has(a)
  const bH = horiz.has(b)
  const bV = vert.has(b)

  if ((aH && bH) || (aV && bV)) return a // 同向保持
  if ((aH && bV) || (aV && bH)) return '┼' // 交叉

  // 特殊: ─ + ├ = ├ 等
  if (a === '─' && b === '│') return '┼'
  if (a === '│' && b === '─') return '┼'
  if (a === '─' && b === '├') return '├'
  if (a === '┤' && b === '─') return '┤'

  // box-drawing 交汇: 用最全的 ┼
  return '┼'
}

// ============================================================
// 图渲染
// ============================================================

function renderGraph(graph: GraphInfo, opts: RenderOptions): string {
  const { nodes, edges, nodeNames } = graph
  if (nodes.length === 0) return '  (empty graph)'

  // ---- 预估节点盒子宽度 ----
  let maxLabelLen = 0
  for (const n of nodes) {
    const name = nodeNames.get(n.nodeIndex) || `kind=${n.genericId?.kind}`
    maxLabelLen = Math.max(maxLabelLen, name.length + 8) // 8 = "n=XX  " + padding
  }
  const nodeBoxWidth = Math.max(Math.min(maxLabelLen, 36) + 4, 16)

  // ---- 计算缩放 ----
  const { scale, warnings: scaleWarnings } = computeScale(nodes, edges, opts.terminalCols, nodeBoxWidth)
  const xs = nodes.map(n => n.x)
  const ys = nodes.map(n => n.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const margin = 4

  // ---- 构建节点盒子 ----
  const boxes: NodeBox[] = []
  const renderedLines: Map<number, string[]> = new Map()

  for (const n of nodes) {
    const pos = mapNodeToGrid(n.x, n.y, minX, minY, scale, margin)
    const name = nodeNames.get(n.nodeIndex) || ''
    const { box, lines } = renderNodeBox(n, name, pos.col, pos.row, opts.compact)
    boxes.push(box)
    renderedLines.set(n.nodeIndex, lines)
  }

  // ---- 计算网格尺寸 —— 不截断宽度，让水平滚动处理宽图 ----
  const maxCol = Math.max(...boxes.map(b => b.col + b.width)) + margin
  const maxRow = Math.max(...boxes.map(b => b.row + b.height)) + 2
  const canvasH = Math.min(maxRow, 200) // 防止内存爆炸
  const canvasW = maxCol

  // ---- 初始化网格 ----
  const grid: string[][] = []
  for (let r = 0; r < canvasH; r++) {
    grid[r] = new Array(canvasW).fill(' ')
  }

  // ---- 先绘制连线（底层） ----
  const boxMap = new Map<number, NodeBox>()
  for (const b of boxes) boxMap.set(b.nodeIndex, b)

  // 按 parent 分组
  const parentToChildren = new Map<number, NodeBox[]>()
  for (const e of edges) {
    const childBox = boxMap.get(e.to)
    if (!childBox) continue
    if (!parentToChildren.has(e.from)) parentToChildren.set(e.from, [])
    parentToChildren.get(e.from)!.push(childBox)
  }

  for (const [fromIdx, children] of parentToChildren) {
    const fromBox = boxMap.get(fromIdx)
    if (!fromBox) continue
    drawBranchEdges(grid, fromBox, children)
  }

  // ---- 再放置节点（覆盖连线） ----
  for (const n of nodes) {
    const lines = renderedLines.get(n.nodeIndex)
    if (!lines) continue
    const box = boxes.find(b => b.nodeIndex === n.nodeIndex)
    if (!box) continue
    for (let i = 0; i < lines.length; i++) {
      const row = box.row + i
      if (row >= canvasH) break
      for (let c = 0; c < lines[i].length; c++) {
        const col = box.col + c
        if (col < canvasW) {
          grid[row][col] = lines[i][c]
        }
      }
    }
  }

  // ---- 检测碰撞 ----
  const warnings: string[] = []
  const usedPositions = new Map<string, number[]>()
  for (const n of nodes) {
    const key = `${Math.round(n.x)},${Math.round(n.y)}`
    if (!usedPositions.has(key)) usedPositions.set(key, [])
    usedPositions.get(key)!.push(n.nodeIndex)
  }
  for (const [pos, indices] of usedPositions) {
    if (indices.length > 1) {
      warnings.push(`  ⚠ OVERLAP: 节点 ${indices.join(', ')} 在位置 (${pos}) 重叠`)
    }
  }

  // ---- 检测孤立节点 ----
  const hasIncoming = new Set<number>()
  const hasOutgoing = new Set<number>()
  for (const e of edges) {
    hasOutgoing.add(e.from)
    hasIncoming.add(e.to)
  }
  const orphans = nodes
    .filter(n => !hasIncoming.has(n.nodeIndex) && !hasOutgoing.has(n.nodeIndex))
    .filter(n => nodes.length > 1) // 单节点不算孤立
  for (const n of orphans) {
    warnings.push(`  ⚠ ORPHAN: 节点 ${n.nodeIndex} (${nodeNames.get(n.nodeIndex) || ''}) 无 exec 连接`)
  }

  // ---- 检测向后的边 ----
  let backEdgeCount = 0
  for (const e of edges) {
    const fb = boxMap.get(e.from)
    const tb = boxMap.get(e.to)
    if (fb && tb && tb.col < fb.col - 2) {
      backEdgeCount++
    }
  }
  if (backEdgeCount > 0) {
    warnings.push(`  ⚠ BACKWARD: ${backEdgeCount} 条向后边`)
  }

  // ---- 组装输出 ----
  const header = `=== ${graph.label} (${nodes.length} 节点, ${edges.length} 边) ===`
  const lines: string[] = [header]

  // 如果有警告，先输出
  for (const w of warnings) {
    lines.push(w)
  }

  // 输出网格 — 裁剪首尾空行和每行尾部空白
  const trimmedLines: string[] = []
  let firstNonEmpty = -1
  let lastNonEmpty = -1
  for (let r = 0; r < canvasH; r++) {
    let end = canvasW - 1
    while (end >= 0 && grid[r][end] === ' ') end--
    if (end >= 0) {
      if (firstNonEmpty === -1) firstNonEmpty = r
      lastNonEmpty = r
    }
  }

  for (let r = firstNonEmpty; r <= lastNonEmpty; r++) {
    let end = canvasW - 1
    while (end >= 0 && grid[r][end] === ' ') end--
    trimmedLines.push('  ' + grid[r].slice(0, end + 1).join(''))
  }

  lines.push(trimmedLines.join('\n'))

  return lines.join('\n')
}

// ============================================================
// 文件渲染
// ============================================================

function renderFile(file: string, opts: RenderOptions): string {
  const lines: string[] = []
  lines.push('='.repeat(opts.terminalCols))
  lines.push(`## ${shortName(file)}`)
  lines.push('')

  let data: any
  try {
    data = decode_gia_file(file)
  } catch (e: any) {
    lines.push(`  ❌ 解码失败: ${e.message ?? e}`)
    return lines.join('\n')
  }

  const graphs = extractGraphs(data)
  if (graphs.length === 0) {
    lines.push('  (no graphs found)')
    return lines.join('\n')
  }

  let totalNodes = 0
  let totalEdges = 0
  for (let i = 0; i < graphs.length; i++) {
    const g = graphs[i]
    if (i > 0) lines.push('')
    lines.push(renderGraph(g, opts))
    totalNodes += g.nodes.length
    totalEdges += g.edges.length
  }

  lines.push('')
  lines.push(`总计: ${graphs.length} 图, ${totalNodes} 节点, ${totalEdges} 边`)
  return lines.join('\n')
}

// ============================================================
// CLI 入口
// ============================================================

function main(): void {
  const args = process.argv.slice(2)
  const opts: RenderOptions = {
    compact: false,
    terminalCols: process.stdout.columns || 100,
  }

  const files: string[] = []
  for (const arg of args) {
    if (arg === '--compact') { opts.compact = true; continue }
    if (arg === '--simple' || arg.startsWith('--')) {
      console.error(`未知选项: ${arg}`)
      process.exit(1)
    }
    files.push(arg)
  }

  if (files.length === 0) {
    console.error('用法: npx tsx tests/composite/ascii-layout.ts [--compact] <file.gia> [files...]')
    process.exit(1)
  }

  let hasError = false
  for (const file of files) {
    console.log(renderFile(file, opts))
    console.log()
  }

  if (hasError) process.exit(1)
}

main()
