// 保存当前地图状态快照 + 节点图指标，用于精确差分校准
// 用法：npx tsx examples/rubik-3x3-client/tools/snapshot-state.ts <label> [actualCount]
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { compositeNodeBudget } from '../../../src/cli/static_assembly/graph_edit.js'

const MAP = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741899.gil'
const OUT_DIR = '.gsts/analysis'
const label = process.argv[2]
const actual = process.argv[3] ? Number(process.argv[3]) : undefined
if (!label) {
  console.error('用法: npx tsx examples/rubik-3x3-client/tools/snapshot-state.ts <label> [actualCount]')
  process.exit(1)
}
mkdirSync(OUT_DIR, { recursive: true })
const bytes = readFileSync(MAP)
const hash = createHash('md5').update(bytes).digest('hex')
const gilPath = `${OUT_DIR}/rubik-3x3-state-${label}.gil`
copyFileSync(MAP, gilPath)

const visual = compositeNodeBudget(bytes, 1073741827)
const main = compositeNodeBudget(bytes, 1073741825)
const relay = compositeNodeBudget(bytes, 1073741826)

const stats = {
  label,
  hash,
  actual,
  visual: {
    mainExpanded: visual.mainExpanded,
    implTotal: visual.implTotal,
    direct: visual.direct,
    compositeInstances: visual.compositeInstances,
    mbCases: visual.mbCases,
    unconnectedCompositeNodes: visual.unconnectedCompositeNodes,
    controlNodes: visual.controlNodes,
    dataFlowNodes: visual.dataFlowNodes,
    dataFlowConsumed: visual.dataFlowConsumed,
    dataFlowUnconsumed: visual.dataFlowUnconsumed,
    flowEdges: visual.flowEdges,
    dataFlowEdges: visual.dataFlowEdges,
    gameNodeCount: visual.gameNodeCount
  },
  main: {
    mainExpanded: main.mainExpanded,
    direct: main.direct
  },
  relay: {
    mainExpanded: relay.mainExpanded,
    direct: relay.direct
  }
}
writeFileSync(`${OUT_DIR}/rubik-3x3-state-${label}.json`, JSON.stringify(stats, null, 2))
console.log(JSON.stringify(stats, null, 2))
console.log(`snapshot=${gilPath}`)
