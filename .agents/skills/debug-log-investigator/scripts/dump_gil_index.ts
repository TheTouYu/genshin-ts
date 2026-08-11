// @ts-nocheck
/**
 * 输出 GIL 地图的"节点图索引"JSON，供 gia_log.py --gil 标注图名/节点名。
 * 用法: npx tsx dump_gil_index.ts <map.gil> [--json-file <out.json>]
 * 输出: {"graphs": {id: {name, nodes: {index: "文本"}}}, "defs": {id: {name, impl}}}
 * 依赖: 项目 src/cli/static_assembly/graph_edit.js（复用已测试解析函数）
 */
import { readFileSync, writeFileSync } from 'fs'
import {
  listGraphs,
  locateGraphField,
  parseGraphNodes,
  nodeName,
  listCompositeDefs,
  compositeImplGraphId
} from '../../../../src/cli/static_assembly/graph_edit.js'

const gil = process.argv[2]
if (!gil) {
  console.error('usage: npx tsx dump_gil_index.ts <map.gil> [--json-file <out.json>]')
  process.exit(1)
}
const bytes = readFileSync(gil)
const payload = bytes.slice(20, -4)

function nodeText(n: any, defs: any[]): string {
  const defName = defs.find((d) => d.id === n.genericId)?.name
  const name = defName ? `复合:${defName}` : (nodeName(n.genericId) ?? `API#${n.genericId}`)
  const cid = n.concreteId !== undefined && n.concreteId !== n.genericId ? ` cid=${n.concreteId}` : ''
  return `${name} (${n.genericId}${cid})`
}

const defs = listCompositeDefs(bytes)
const out: any = { graphs: {}, defs: {} }

for (const d of defs) {
  let impl: number | undefined
  try { impl = compositeImplGraphId(payload, d.id) } catch { impl = undefined }
  out.defs[String(d.id)] = { name: d.name ?? '', impl }
}

for (const g of listGraphs(bytes)) {
  let field
  try { field = locateGraphField(payload, g.id) } catch { continue }
  const blob = payload.subarray(field.field.dataStart, field.field.dataEnd)
  const nodes: any = {}
  for (const n of parseGraphNodes(blob)) {
    nodes[String(n.index)] = nodeText(n, defs)
  }
  out.graphs[String(g.id)] = { name: g.name ?? '', nodes }
}

const json = JSON.stringify(out)
const fi = process.argv.indexOf('--json-file')
if (fi > 0 && process.argv[fi + 1]) writeFileSync(process.argv[fi + 1], json)
else console.log(json)
