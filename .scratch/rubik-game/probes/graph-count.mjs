// graph-count.mjs — root10 图数探针（rubik-game 迁移对账复用）
// 用法：node graph-count.mjs <map.gil>
// 输出：graph_count=<N>（有内容图数；空占位不计）
import { execFileSync } from 'node:child_process'

const gil = process.argv[2]
if (!gil) {
  console.error('usage: node graph-count.mjs <map.gil>')
  process.exit(1)
}
const out = execFileSync('npx', ['tsx', 'tools/list-gil-node-graphs.ts', gil], {
  cwd: '/home/h/genshin-ts',
  encoding: 'utf8',
})
const n = (out.match(/nodeCount/g) || []).length
console.log(`graph_count=${n}`)
