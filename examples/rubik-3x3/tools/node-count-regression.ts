// 游戏“节点图数量”定稿公式回归（PROGRESS.md Round 17，10/10 回归校准）
// 公式：(28/11) * mainExpanded - (761/1056) * implTotal - 39343/66
// 拟合点：H-3283 / I-3588 / J-3812 / K-4036（actual 为引擎口径“节点图数量”，>3000 为拒载超限点）
// 运行：npx tsx examples/rubik-3x3/tools/node-count-regression.ts
import { predictGameNodeCount } from '../../../src/cli/static_assembly/graph_edit.js'

type Point = {
  label: string
  mainExpanded: number
  implTotal: number
  actual: number
}

const TOLERANCE = 1

// PROGRESS.md Round 17 实测拟合点（签名 (mainExpanded, implTotal)）
const POINTS: Point[] = [
  { label: 'H-3283', mainExpanded: 1610, implTotal: 304, actual: 3283 },
  { label: 'I-3588', mainExpanded: 1757, implTotal: 400, actual: 3588 },
  { label: 'J-3812', mainExpanded: 1845, implTotal: 400, actual: 3812 },
  { label: 'K-4036', mainExpanded: 1933, implTotal: 400, actual: 4036 }
]

let failed = 0
for (const p of POINTS) {
  const pred = predictGameNodeCount(p.mainExpanded, p.implTotal)
  const round = Math.round(pred)
  const err = Math.abs(round - p.actual)
  const ok = err <= TOLERANCE
  if (!ok) failed++
  console.log(`${ok ? '✅' : '❌'} ${p.label}: actual=${p.actual} pred=${pred.toFixed(2)} round=${round} Δ=${round - p.actual}（容差 ±${TOLERANCE}）`)
}
console.log(`\n${POINTS.length - failed}/${POINTS.length} passed (定稿公式，容差 ±${TOLERANCE})`)
if (failed > 0) process.exitCode = 1
