import type { NodeView } from './graph_edit.js'

// 书页式布局参数（2026-08-11 用户确认：长线横向从左到右、事件块纵向堆叠、数据源跟随消费者）
export const NODE_X_STEP = 800 // 行内节点横向间距
export const ROW_Y_STEP = 900 // 行（长线）间距：拆线后线变多，2026-08-11 用户确认加大（600→900）
export const BLOCK_Y_GAP = 1200 // 事件块（长方形）纵向间距
export const LINE_LIMIT = 10 // 一条长线最大控制流节点数，超限由 planFlowUpgrade 升级为分叉线（lint 提示合并复合）
export const DATA_GAP = 400 // 数据源与消费者间隙
export const NODE_W = 350 // 冲突检测：节点近似宽
export const NODE_H = 250 // 冲突检测：节点近似高

export type LayoutResult = Map<number, { x: number; y: number }>

/** 控制流连接升级编辑：断开支叉，把超限段注册为新线。 */
export type FlowEdit =
  | { op: 'remove'; node: number; dst: number }
  | { op: 'append'; node: number; dst: number }

/**
 * 长线自动升级为分叉线（2026-08-11 用户 main 图手工分叉闭合）：
 * 入口单出口链超过 LINE_LIMIT 时，断开超限点（cur→next），把 next 注册到
 * 入口 OutFlow 末尾（追加，成为新线）；重复直到链尾。
 * 副作用：就地修改 nodes 视图连接（幂等：升级后入口多出口，不再处理）。
 */
export function planFlowUpgrade(nodes: NodeView[]): FlowEdit[] {
  const edits: FlowEdit[] = []
  const byIdx = new Map(nodes.map((n) => [n.index, n]))
  const consumers = dataConsumers(nodes)
  const hasInFlow = new Set<number>()
  for (const n of nodes) for (const dst of flowTargets(n)) hasInFlow.add(dst)
  const isDataSource = (n: NodeView): boolean => {
    if (flowTargets(n).length > 0 || hasInFlow.has(n.index)) return false
    return (consumers.get(n.index)?.length ?? 0) > 0
  }
  const removeConn = (n: NodeView, dst: number): void => {
    for (const p of n.pins) {
      if (p.kind !== 2) continue
      p.connects = p.connects.filter((c) => c.id !== dst)
    }
  }
  const appendConn = (n: NodeView, dst: number): void => {
    for (const p of n.pins) {
      if (p.kind !== 2) continue
      p.connects = [...p.connects, { id: dst, kind: 1, index: 0 }]
      return
    }
  }
  for (const entry of nodes) {
    if (hasInFlow.has(entry.index) || isDataSource(entry)) continue
    if (flowTargets(entry).length !== 1) continue // 多出口已分叉（或孤立），不升级
    let cur = entry.index
    let count = 1
    const seen = new Set<number>()
    while (true) {
      if (seen.has(cur)) break
      seen.add(cur)
      const n = byIdx.get(cur)
      if (!n) break
      const targets = flowTargets(n)
      if (targets.length !== 1) break // 叉子/终点
      const next = targets[0]
      if (count + 1 > LINE_LIMIT) {
        removeConn(n, next)
        appendConn(entry, next)
        edits.push({ op: 'remove', node: cur, dst: next })
        edits.push({ op: 'append', node: entry.index, dst: next })
        cur = next
        count = 1
        continue
      }
      cur = next
      count += 1
    }
  }
  return edits
}

export type Violation = {
  kind:
    | 'flow-upward'
    | 'flow-backward'
    | 'chain-vertical'
    | 'long-chain'
    | 'block-order'
    | 'line-align'
    | 'data-detached'
    | 'data-chain-long'
    | 'island'
    | 'overlap'
  node: number
  detail: string
}

/** OutFlow 目标（kind=InFlow 的 connects id）。 */
function flowTargets(n: NodeView): number[] {
  const out: number[] = []
  for (const p of n.pins) {
    if (p.kind !== 2) continue // OutFlow
    for (const c of p.connects) out.push(c.id)
  }
  return out
}

/** InParam 数据来源（connects id），用于数据源吸附。 */
function dataSources(n: NodeView): number[] {
  const out: number[] = []
  for (const p of n.pins) {
    if (p.kind !== 3) continue // InParam
    for (const c of p.connects) out.push(c.id)
  }
  return out
}

/** OutParam 被哪些节点消费。 */
function dataConsumers(nodes: NodeView[]): Map<number, number[]> {
  const m = new Map<number, number[]>()
  for (const n of nodes) {
    for (const src of dataSources(n)) {
      if (!m.has(src)) m.set(src, [])
      m.get(src)!.push(n.index)
    }
  }
  return m
}

/**
 * 自动布局（书页式）：返回 node index → 新坐标。
 * 未覆盖任何节点的图返回空 Map（调用方视为无可布局内容）。
 *
 * 模型（用户 2026-08-11 确认）：
 * - 每个事件起点 = 一个长方形代码块，块从上到下堆叠（y）
 * - 块内控制流为横向长线（从左到右，像看书），一条长线 ≤ LINE_LIMIT 节点，超限折行
 * - 多出口分支 = 叉子：分支节点放行首，每个出口从分支节点向右开一条新行（从上到下）
 * - 数据源节点（无控制流、OutParam 被引用）跟随消费者：单节点贴边上留间隙；
 *   多轮运算链横排成一条长线；超长 lint 提示写复合节点
 */
export function autoLayout(nodes: NodeView[]): LayoutResult {
  const result: LayoutResult = new Map()
  if (nodes.length === 0) return result

  const byIdx = new Map(nodes.map((n) => [n.index, n]))
  const consumers = dataConsumers(nodes)
  // 引擎语义：控制流连接只写在源侧 OutFlow 的 connects；目标侧 InFlow pin 通常不落盘。
  // 因此“有 InFlow” = 被任何 OutFlow 指向（并集），不能查 InFlow pin 的 connects。
  const hasInFlow = new Set<number>()
  for (const n of nodes) {
    for (const dst of flowTargets(n)) hasInFlow.add(dst)
  }
  const visited = new Set<number>()
  const placed = new Set<number>()

  // 数据源节点：无 OutFlow、无 InFlow、但 OutParam 被引用
  const isDataSource = (n: NodeView): boolean => {
    if (flowTargets(n).length > 0 || hasInFlow.has(n.index)) return false
    return (consumers.get(n.index)?.length ?? 0) > 0
  }

  const conflicts = (x: number, y: number): boolean => {
    for (const [i, p] of result) {
      if (Math.abs(p.x - x) < NODE_W && Math.abs(p.y - y) < NODE_H) return true
      void i
    }
    return false
  }

  // 放置：与已放节点冲突时自动下移一行（叉子分支行可能撞车）
  const place = (idx: number, x: number, y: number): void => {
    let py = y
    while (conflicts(x, py)) py += ROW_Y_STEP
    result.set(idx, { x, y: py })
    placed.add(idx)
  }

  // 块内 DFS：横向长线从左到右，超限由 planFlowUpgrade 升级为分叉线；多出口 = 叉子。
  // 入口分叉（自动升级的第二条线）：入口留行首，out[0] 同行（第一条线），其余出口各开新行（行首）。
  const walk = (idx: number, blockX: number, x: number, y: number, lineCount: number, entry = false): void => {
    if (visited.has(idx)) return
    visited.add(idx)
    const n = byIdx.get(idx)
    if (!n || isDataSource(n)) return
    const targets = flowTargets(n)

    if (targets.length > 1 && entry) {
      place(idx, blockX, y)
      walk(targets[0], blockX, blockX + NODE_X_STEP, y, 1)
      for (let i = 1; i < targets.length; i++) walk(targets[i], blockX, blockX, y + i * ROW_Y_STEP, 1)
      return
    }

    // 行中叉子：分支留在当前行（与上游水平对齐，2026-08-11 tab-input 用户修正），
    // 出口 out[0] 同行右侧，其余出口同列垂直排列（从上到下）
    let px = x
    let py = y
    let pc = lineCount
    if (targets.length > 1 && lineCount > 0) {
      px = x
      py = y
      pc = 0
    }
    place(idx, px, py)

    if (targets.length === 0) return
    if (targets.length === 1) {
      if (pc + 1 > LINE_LIMIT) walk(targets[0], blockX, blockX, py + ROW_Y_STEP, 1)
      else walk(targets[0], blockX, px + NODE_X_STEP, py, pc + 1)
      return
    }
    // 叉子：out[0] 同行（第一条出口线），其余出口同列垂直排列
    for (let i = 0; i < targets.length; i++) {
      const dy = i === 0 ? 0 : i * ROW_Y_STEP
      walk(targets[i], blockX, px + NODE_X_STEP, py + dy, 1)
    }
  }

  // 入口 = 无 InFlow 连入 且非数据源（含事件/监听/孤立链头）
  const entries = nodes.filter((n) => !hasInFlow.has(n.index) && !isDataSource(n))
  const chained = entries.filter((n) => flowTargets(n).length > 0) // 事件起点
  const loose = entries.filter((n) => flowTargets(n).length === 0) // 孤立节点

  // 事件块从上到下堆叠：每块一个入口，块起点 y 递增
  let blockY = 0
  for (const n of chained) {
    if (visited.has(n.index)) continue
    const startY = blockY
    walk(n.index, 0, 0, startY, 1, true)
    let maxY = startY
    for (const [k, p] of result) {
      if (p.y >= startY && p.y > maxY) maxY = p.y
      void k
    }
    blockY = maxY + ROW_Y_STEP + BLOCK_Y_GAP
  }

  // 数据源跟随：单节点贴消费者边上（同行左侧优先，其次上方）；运算链横排成线
  const placedPos = (idx: number): { x: number; y: number } | undefined => result.get(idx)
  // 数据链：从数据源沿 InParam 回溯到字面量源头，返回 [源头 … 数据源]（控制流节点中止）
  const collectChain = (src: number): number[] => {
    const chain = [src]
    let cur = src
    while (true) {
      const n = byIdx.get(cur)
      if (!n) return chain
      const inps = dataSources(n).filter((s) => !flowTargets(byIdx.get(s)!).length)
      if (inps.length !== 1) return chain
      const prev = inps[0]
      const pn = byIdx.get(prev)
      if (!pn || flowTargets(pn).length > 0 || hasInFlow.has(prev)) return chain
      chain.unshift(prev)
      cur = prev
    }
  }
  for (const n of nodes) {
    if (placed.has(n.index) || !isDataSource(n)) continue
    const cs = consumers.get(n.index) ?? []
    let anchor: { x: number; y: number } | undefined
    for (const c of cs) {
      const p = placedPos(c)
      if (p) {
        anchor = p
        break
      }
    }
    if (!anchor) continue // 消费者未布局（罕见），收尾处理
    const chain = collectChain(n.index)
    const len = chain.length
    // 候选锚点（从优到劣）：同行左侧 / 上方一行 / 上方两行 / 消费者下方
    // 同行左侧是否可用由 conflicts() 实际检测（行中间但间距足够时也允许）
    const anchors: Array<{ x: number; y: number }> = [
      { x: anchor.x - DATA_GAP, y: anchor.y },
      { x: anchor.x, y: anchor.y - ROW_Y_STEP },
      { x: anchor.x, y: anchor.y - 2 * ROW_Y_STEP },
      { x: anchor.x, y: anchor.y + ROW_Y_STEP }
    ]

    let placedChain = false
    for (const a of anchors) {
      // 链尾（最后一个数据节点）贴近锚点，链头向左排
      let ok = true
      const xs: number[] = []
      for (let i = 0; i < len; i++) {
        const x = a.x - (len - 1 - i) * NODE_X_STEP
        const y = a.y
        const idx = chain[i]
        const existing = result.get(idx)
        if (existing) {
          // 已放置（被其他消费者引用）→ 不再重复放置
          ok = true
          xs.push(existing.x)
          continue
        }
        if (conflicts(x, y)) {
          ok = false
          break
        }
        xs.push(x)
      }
      if (!ok) continue
      for (let i = 0; i < len; i++) {
        const idx = chain[i]
        if (result.has(idx)) continue
        result.set(idx, { x: xs[i], y: a.y })
        placed.add(idx)
      }
      placedChain = true
      break
    }
    if (!placedChain) {
      // 全部冲突：放消费者正上方同一 x（最小代价）
      result.set(n.index, { x: anchor.x, y: anchor.y - ROW_Y_STEP })
      placed.add(n.index)
    }
  }

  // 收尾：仍未放置的节点（孤立、消费者未布局）→ 最后一块横排
  let spareY = blockY
  let spareX = 0
  for (const n of nodes) {
    if (placed.has(n.index)) continue
    result.set(n.index, { x: spareX, y: spareY })
    placed.add(n.index)
    spareX += NODE_X_STEP
  }
  return result
}

/**
 * 布局检查（lint）：只读，不修改。
 * 返回违规清单；空数组 = 符合规范。
 *
 * 规则（书页式，2026-08-11 用户确认）：
 * 1. flow-upward：控制流目标 y 比源小 → 执行流向上（块/行必须从上到下）
 * 2. flow-backward：同一行内（y 差 < 200）控制流 x 递减 → 长线必须从左到右（折行除外：y 变大）
 * 3. chain-vertical：入口主链累计 dy > dx → 竖排链（应横向）
 * 4. long-chain：同一行内控制流节点 > LINE_LIMIT → 建议合并复合节点
 * 5. block-order：事件起点块必须从上到下（入口 y 递增）
 * 6. line-align：入口分叉（多出口）的后续线行首 x 必须与入口 x 对齐（2026-08-11）
 * 7. data-detached：数据源离最近消费者 > 1200 → 未跟随
 * 8. data-chain-long：数据链 > 5 个节点 → 建议写复合节点
 * 9. island：与最近节点距离 > 2000
 * 10. overlap：坐标重叠
 */
export function checkLayout(nodes: NodeView[]): Violation[] {
  const out: Violation[] = []
  if (nodes.length === 0) return out
  const byIdx = new Map(nodes.map((n) => [n.index, n]))
  const consumers = dataConsumers(nodes)

  // 0. 引擎语义：被任何 OutFlow 指向 = 有 InFlow
  const hasInFlow = new Set<number>()
  const firstTarget = new Map<number, number>()
  for (const n of nodes) {
    const targets = flowTargets(n)
    for (const dst of targets) hasInFlow.add(dst)
    if (targets.length > 0 && !firstTarget.has(n.index)) firstTarget.set(n.index, targets[0])
  }
  const isDataSource = (n: NodeView): boolean => {
    if (flowTargets(n).length > 0 || hasInFlow.has(n.index)) return false
    return (consumers.get(n.index)?.length ?? 0) > 0
  }

  // 1. 向上流 / 2. 同行向左
  for (const n of nodes) {
    for (const dst of flowTargets(n)) {
      const d = byIdx.get(dst)
      if (!d) continue
      if (d.y < n.y - 50) {
        out.push({
          kind: 'flow-upward',
          node: n.index,
          detail: `n${n.index}(${Math.round(n.y)}) → n${dst}(${Math.round(d.y)})：执行流向上（块/行必须从上到下）`
        })
      } else if (Math.abs(d.y - n.y) < 200 && d.x < n.x - 100) {
        out.push({
          kind: 'flow-backward',
          node: n.index,
          detail: `n${n.index}(${Math.round(n.x)}) → n${dst}(${Math.round(d.x)})：同行执行流向左（长线应从左到右）`
        })
      }
    }
  }

  // 3. 竖排链：入口主链同行内横移不足（横向布局下纵向链违规；折行回行首是合法的）
  const visited = new Set<number>()
  for (const n of nodes) {
    if (hasInFlow.has(n.index) || visited.has(n.index)) continue
    let cur = n.index
    let dx = 0
    let dy = 0
    let rowDx = 0 // 同行内（|dy|<200）横移累计：折行布局的横向阅读距离
    let steps = 0
    const chain = [n.index]
    while (true) {
      visited.add(cur)
      const curN = byIdx.get(cur)
      if (!curN) break
      const targets = flowTargets(curN)
      // 多出口（分支）停止：叉子出口行竖走合法，不参与主链走向判定
      if (targets.length > 1) break
      const next = targets[0]
      if (next === undefined || visited.has(next) || byIdx.get(next) === undefined) break
      const c = byIdx.get(cur)!
      const t = byIdx.get(next)!
      const ex = t.x - c.x
      const ey = t.y - c.y
      dx += ex
      dy += ey
      if (Math.abs(ey) < 200) rowDx += ex
      steps++
      chain.push(next)
      cur = next
    }
    // 竖排判据：至少 2 步、纵向进展显著（|dy| > 800）、同行横向阅读距离不足
    if (steps >= 2 && Math.abs(dy) > 800 && rowDx < 1200) {
      out.push({
        kind: 'chain-vertical',
        node: n.index,
        detail: `入口链 n${chain[0]}→n${chain[chain.length - 1]} 沿 y 展开 (dx=${Math.round(dx)}, dy=${Math.round(dy)})：长线应横向`
      })
    }
  }

  // 4. 长链：同一行（y 差 < 250）内控制流节点数 > LINE_LIMIT
  const rows = new Map<number, NodeView[]>()
  for (const n of nodes) {
    const key = Math.round(n.y / 250)
    if (!rows.has(key)) rows.set(key, [])
    rows.get(key)!.push(n)
  }
  for (const [y, group] of rows) {
    const flowNodes = group.filter((n) => flowTargets(n).length > 0 || hasInFlow.has(n.index))
    const sorted = [...flowNodes].sort((a, b) => a.x - b.x)
    // 同一行内连续控制流节点（x 间距 ≤ NODE_X_STEP+100）
    let run = 1
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x - sorted[i - 1].x <= NODE_X_STEP + 100) run++
      else run = 1
      if (run > LINE_LIMIT) {
        out.push({
          kind: 'long-chain',
          node: sorted[i].index,
          detail: `y≈${y * 250} 行连续 ${run} 个控制流节点，超过 ${LINE_LIMIT} 上限（建议合并为复合节点）`
        })
        run = 1
      }
    }
  }

  // 5. 事件块顺序：入口（无入流且有控制流出口）y 应按节点序递增
  const entries = nodes
    .filter((n) => !hasInFlow.has(n.index) && flowTargets(n).length > 0)
    .sort((a, b) => a.index - b.index)
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].y < entries[i - 1].y + 300) {
      out.push({
        kind: 'block-order',
        node: entries[i].index,
        detail: `事件起点 n${entries[i].index}(y=${Math.round(entries[i].y)}) 未在 n${entries[i - 1].index}(y=${Math.round(entries[i - 1].y)}) 下方（事件块应从上到下）`
      })
    }
  }

  // 6. 线间对齐：入口分叉（无 InFlow 多出口）的后续线（out[1..]）行首 x 与入口 x 对齐
  for (const n of entries) {
    const targets = flowTargets(n)
    if (targets.length <= 1) continue
    for (let i = 1; i < targets.length; i++) {
      const head = byIdx.get(targets[i])
      if (!head) continue
      if (Math.abs(head.x - n.x) > 100) {
        out.push({
          kind: 'line-align',
          node: targets[i],
          detail: `线 n${targets[i]} 行首 x=${Math.round(head.x)} 未与入口 n${n.index} x=${Math.round(n.x)} 对齐`
        })
      }
    }
  }

  // 7. 数据源未跟随：到最近消费者的距离 > 1200
  for (const n of nodes) {
    if (!isDataSource(n)) continue
    const cs = consumers.get(n.index) ?? []
    let minDist = Infinity
    for (const c of cs) {
      const d = byIdx.get(c)
      if (!d) continue
      const dist = Math.hypot(d.x - n.x, d.y - n.y)
      if (dist < minDist) minDist = dist
    }
    if (minDist > 1200) {
      out.push({
        kind: 'data-detached',
        node: n.index,
        detail: `数据源 n${n.index} (${Math.round(n.x)},${Math.round(n.y)}) 距消费者 ${Math.round(minDist)}，应贴在消费者边上`
      })
    }
  }

  // 8. 数据链过长：数据源沿 InParam 回溯链 > 5 → 建议复合
  for (const n of nodes) {
    if (!isDataSource(n)) continue
    let len = 1
    let cur = n.index
    while (len <= 10) {
      const nn = byIdx.get(cur)
      if (!nn) break
      const inps = dataSources(nn).filter((s) => {
        const sn = byIdx.get(s)
        return sn && flowTargets(sn).length === 0 && !hasInFlow.has(s)
      })
      if (inps.length !== 1) break
      cur = inps[0]
      len++
    }
    if (len > 5) {
      out.push({
        kind: 'data-chain-long',
        node: n.index,
        detail: `数据链 n${n.index} 回溯 ${len} 个节点，建议封装为复合节点`
      })
    }
  }

  // 9. 孤岛：与最近节点距离 > 2000
  for (const n of nodes) {
    let minDist = Infinity
    for (const o of nodes) {
      if (o.index === n.index) continue
      const d = Math.hypot(o.x - n.x, o.y - n.y)
      if (d < minDist) minDist = d
    }
    if (minDist > 2000) {
      out.push({ kind: 'island', node: n.index, detail: `n${n.index} (${n.x},${n.y}) 距最近节点 ${Math.round(minDist)}` })
    }
  }

  // 10. 重叠：不同节点坐标几乎相同
  const seen = new Map<string, number>()
  for (const n of nodes) {
    const key = `${Math.round(n.x / 10)},${Math.round(n.y / 10)}`
    const prev = seen.get(key)
    if (prev !== undefined) {
      out.push({ kind: 'overlap', node: n.index, detail: `n${n.index} 与 n${prev} 重叠于 (${n.x},${n.y})` })
    } else {
      seen.set(key, n.index)
    }
  }

  return out
}
