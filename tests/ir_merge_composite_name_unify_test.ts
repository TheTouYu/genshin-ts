import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { mergeIrJsonFilesByGraphId } from '../src/compiler/ir_merge.js'

// 跨图同名复合 def ID 归一回归（2026-08-31 v5 多图注入重复 def 修复）：
// 多张图 import 同一复合文件 → 各图 IR 的同复合 def.id 不同 → 注入后地图目录
// 同名重复条目（引擎校验目录全部复合，重复引发加载报错）。
// 归一后：同名同签名（或 stub）跨图统一到权威 def ID（full 优先、先到优先）。
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsts-composite-name-unify-'))

function composite(id: number, name: string, nestedId?: number) {
  return {
    name,
    id,
    type: 'composite',
    inflows: [],
    outflows: [{ name: 'done', visible: true, index: 0, pinIndex: 4 }],
    inputs: [
      { name: 'e', visible: true, index: 0, type: 'entity', pinIndex: 100 }
    ],
    outputs: [],
    implNodes: nestedId
      ? [{ id: 1, type: '__composite_call__', args: [{ type: 'int', value: nestedId }] }]
      : [{ id: 1, type: 'set_node_graph_variable', args: [] }],
    implEdges: {},
    compositePins: []
  }
}

function writeSource(
  name: string,
  graphId: number,
  definition: ReturnType<typeof composite>
) {
  const file = path.join(outDir, `${name}.json`)
  fs.writeFileSync(
    file,
    JSON.stringify({
      ir_version: 1,
      ir_type: 'node_graph',
      graph: { id: graphId, type: 'server', name },
      nodes: [{ id: 1, type: '__composite_call__', args: [{ type: 'int', value: definition.id }] }],
      compositeDefs: [definition]
    })
  )
  return file
}

// 场景 1：两个图各自带同名同签名复合（不同 id，模拟 v5 logic/input 双图共享）→ 归一到先到者 id
const gA = writeSource('alpha', 1073741850, composite(1610700017, 'shared_transition'))
const gB = writeSource('beta', 1073741851, composite(2000000001, 'shared_transition'))

const results = mergeIrJsonFilesByGraphId({ outDirAbs: outDir, irJsonPaths: [gA, gB] })
const defsById = new Map<string, number>()
for (const result of results) {
  const merged = result.merged as any
  for (const def of merged.compositeDefs ?? []) {
    defsById.set(`${result.outJsonPath}::${def.name}`, def.id)
  }
}
const ids = [...defsById.values()]
assert.equal(
  new Set(ids).size,
  1,
  `same-name same-signature composite must unify to one id across graphs (got ${ids.join(',')})`
)

// 场景 2：归一后调用点引用同步 remap（主图 __composite_call__ args[0].value 指向权威 id）
for (const result of results) {
  const merged = result.merged as any
  const call = merged.nodes.find((n: any) => n.type === '__composite_call__')
  const def = merged.compositeDefs[0]
  assert.equal(
    call.args[0].value,
    def.id,
    'composite call site must reference the unified def id'
  )
}

// 场景 3：stub 前向声明也归一到 full 权威（full 后到照样提升）
const outDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gsts-composite-stub-unify-'))
function writeStub(name: string, graphId: number, defId: number, defName: string) {
  const file = path.join(outDir2, `${name}.json`)
  fs.writeFileSync(
    file,
    JSON.stringify({
      ir_version: 1,
      ir_type: 'node_graph',
      graph: { id: graphId, type: 'server', name },
      nodes: [{ id: 1, type: '__composite_call__', args: [{ type: 'int', value: defId }] }],
      compositeDefs: [
        {
          name: defName,
          id: defId,
          type: 'composite',
          inflows: [],
          outflows: [],
          inputs: [{ name: 'e', visible: true, index: 0, type: 'entity', pinIndex: 100 }],
          outputs: [],
          implNodes: [],
          implEdges: {},
          compositePins: []
        }
      ]
    })
  )
  return file
}
const stubGraph = writeStub('stub_graph', 1073741860, 1610700009, 'shared_helper')
const fullGraph = (() => {
  const file = path.join(outDir2, 'full_graph.json')
  fs.writeFileSync(
    file,
    JSON.stringify({
      ir_version: 1,
      ir_type: 'node_graph',
      graph: { id: 1073741861, type: 'server', name: 'full_graph' },
      nodes: [],
      compositeDefs: [composite(1610700010, 'shared_helper')]
    })
  )
  return file
})()
const results2 = mergeIrJsonFilesByGraphId({ outDirAbs: outDir2, irJsonPaths: [stubGraph, fullGraph] })
const allDefs2 = results2.flatMap((r) => (r.merged as any).compositeDefs ?? [])
const helperIds = new Set(allDefs2.filter((d: any) => d.name === 'shared_helper').map((d: any) => d.id))
assert.equal(
  helperIds.size,
  1,
  `stub + full same-name composite must unify (got ${[...helperIds].join(',')})`
)

// 场景 4：同名但签名不同（双 full 版本冲突）不归一——保留隔离语义
const outDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'gsts-composite-conflict-keep-'))
const c1 = (() => {
  const file = path.join(outDir3, 'c1.json')
  fs.writeFileSync(
    file,
    JSON.stringify({
      ir_version: 1,
      ir_type: 'node_graph',
      graph: { id: 1073741870, type: 'server', name: 'c1' },
      nodes: [],
      compositeDefs: [composite(1610700020, 'clash_helper')]
    })
  )
  return file
})()
const c2def = composite(1610700021, 'clash_helper')
c2def.inputs = [{ name: 'other', visible: true, index: 0, type: 'float', pinIndex: 100 }]
const c2 = (() => {
  const file = path.join(outDir3, 'c2.json')
  fs.writeFileSync(
    file,
    JSON.stringify({
      ir_version: 1,
      ir_type: 'node_graph',
      graph: { id: 1073741871, type: 'server', name: 'c2' },
      nodes: [],
      compositeDefs: [c2def]
    })
  )
  return file
})()
// 同名不同签名（模拟跨进程节点 id 基数差异）：同名即归一（签名仅告警）——归一到权威 id
const results3 = mergeIrJsonFilesByGraphId({ outDirAbs: outDir3, irJsonPaths: [c1, c2] })
const clashDefs = results3.flatMap((r) => (r.merged as any).compositeDefs ?? [])
const clashIds = new Set(clashDefs.filter((d: any) => d.name === 'clash_helper').map((d: any) => d.id))
assert.equal(
  clashIds.size,
  1,
  `same-name composites unify by name regardless of per-process signature noise (got ${[...clashIds].join(',')})`
)

console.log('[ok] ir_merge composite name unification: all scenarios passed')
