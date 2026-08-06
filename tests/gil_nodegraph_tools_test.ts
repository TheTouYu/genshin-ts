import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const fixture = path.join(root, 'tests/fixtures/signals/monitor-consume-donor.gil')

function run(tool: string, args: string[]): string {
  return execFileSync(
    process.execPath,
    ['--import', 'tsx', path.join(root, `tools/${tool}`), fixture, ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--no-deprecation' }
    }
  )
}

const control = JSON.parse(run('trace-gil-exec-flow.ts', ['--auto', '--json']))
assert.equal(control.target.name, '信号调试-监听信号')
assert.deepEqual(Object.keys(control), [
  'input',
  'target',
  'event_entries',
  'nodes',
  'execution_edges',
  'paths',
  'composite_interfaces'
])
assert.equal(Object.hasOwn(control, 'dataflow'), false)

const data = JSON.parse(
  run('trace-gil-dataflow.ts', ['--auto', '--node', '6', '--all-inputs', '--json'])
)
const folded = data.dependency_paths.find(
  (branch: { folded_count?: number }) => branch.folded_count
)
assert.equal(folded.index, 3)
assert.equal(folded.index_end, 100)
assert.equal(folded.folded_count, 98)
assert.equal(
  data.terminal_sources.some((source: { input_end?: number }) => source.input_end === 100),
  true
)
assert.deepEqual(Object.keys(data), [
  'input',
  'target_node',
  'target_inputs',
  'dependency_paths',
  'terminal_sources'
])
assert.equal(Object.hasOwn(data, 'execution_edges'), false)

const human = run('trace-gil-dataflow.ts', ['--auto', '--node', '6', '--all-inputs'])
assert.match(human, /InParam\[3-100\]/)
assert.match(human, /重复 98 次/)
assert.equal((human.match(/InParam\[3\]/g) ?? []).length, 0)

for (const name of ['trace-gil-exec-flow.ts', 'trace-gil-dataflow.ts', 'scan-gil-signals.ts', 'explain-gil-node-graph.ts']) {
  assert.deepEqual(
    readFileSync(path.join(root, 'tools', name)),
    readFileSync(path.join(root, 'create-genshin-ts/templates/start/tools', name))
  )
}

// explain-gil-node-graph.ts：一键解读（事件入口 + 控制流树 + 参数来源 + 系统/复合节点）
const story = run('explain-gil-node-graph.ts', ['--auto'])
assert.match(story, /图解读: 信号调试-监听信号/)
assert.match(story, /系统:监听信号：系统节点，无内部图；信号名 "信号测试全参数"/)
assert.match(story, /【参数来源】/)
assert.match(story, /n=10 复合:监听信号\.伤害值/) // 参数来源引用系统节点输出
const comp = run('explain-gil-node-graph.ts', ['--composite', '定时任务'])
assert.match(comp, /接口: inputs=\[目标实体:Entity, 定时器名称:String/)
assert.match(comp, /impl图=/)
assert.match(comp, /← 接口 目标实体/) // 复合 impl 内部输入标注外部接口映射
const compNested = run('explain-gil-node-graph.ts', ['--composite', '定时任务', '--depth', '1'])
assert.match(compNested, /复合内部:.*\(5 节点\)/)
assert.match(compNested, /When Timer Is Triggered/)

// scan-gil-signals.ts：全量信号使用扫描（主图 + 复合 impl 图）
const sig = run('scan-gil-signals.ts', ['--signal', '信号测试全参数'])
assert.match(sig, /信号测试全参数 信号使用清单/)
assert.match(sig, /主图 1073741842 信号调试-监听信号: n=10 监听信号/)
assert.match(sig, /合计: 1 节点 \/ 1 图 \(发送 0、监听 1、其他 0\)/)
const sigJson = JSON.parse(run('scan-gil-signals.ts', ['--signal', '信号测试全参数', '--json']))
assert.equal(sigJson.summary.listen, 1)
assert.equal(sigJson.summary.graphs, 1)
assert.equal(sigJson.usages[0].composite, '监听信号')
assert.equal(sigJson.usages[0].compIndex, 99)

// foldableChain：线性链折叠探测（单入单出、无真实条件、visited 中止）
const { foldableChain } = await import('../tools/explain-gil-node-graph.js')
const nm = (ids: number[]) =>
  new Map(ids.map((i) => [i, { index: i, api: `N${i}`, inputs: [] }]))
const flowFrom = new Map([
  [1, [{ to: 2, via: 'Branch[0]' }]],
  [2, [{ to: 3, via: 'Branch[0]' }]],
  [3, [{ to: 4, via: 'Branch[0]' }]],
  [4, [{ to: 5, via: 'Branch[0]' }]]
])
const flowTo = new Map([
  [2, 1],
  [3, 1],
  [4, 1],
  [5, 1]
])
const ids = [1, 2, 3, 4, 5]
let chain = foldableChain(1, 'Branch[0]', flowFrom, flowTo, nm(ids), new Set())
assert.deepEqual(
  chain.map((c: { nid: number }) => c.nid),
  [1, 2, 3, 4, 5]
)
flowTo.set(4, 2) // 汇合点中止
chain = foldableChain(1, 'Branch[0]', flowFrom, flowTo, nm(ids), new Set())
assert.deepEqual(
  chain.map((c: { nid: number }) => c.nid),
  [1, 2, 3]
)
flowTo.set(4, 1)
flowFrom.set(3, [
  { to: 4, via: 'true' },
  { to: 9, via: 'false' }
]) // 分支点中止
chain = foldableChain(1, 'Branch[0]', flowFrom, flowTo, nm(ids), new Set())
assert.deepEqual(
  chain.map((c: { nid: number }) => c.nid),
  [1, 2]
)
flowFrom.set(3, [{ to: 4, via: 'Branch[0]' }])
chain = foldableChain(1, 'Branch[0]', flowFrom, flowTo, nm(ids), new Set([3])) // visited 中止
assert.deepEqual(
  chain.map((c: { nid: number }) => c.nid),
  [1, 2]
)
const nmCond = new Map([
  [1, { index: 1, api: 'N1', inputs: [] }],
  [
    2,
    {
      index: 2,
      api: 'N2',
      inputs: [
        {
          name: 'Bol',
          type: 'Bol',
          present: true,
          sources: [{ node: 7, api: 'X', pin_name: 'Out' }]
        }
      ]
    }
  ],
  [3, { index: 3, api: 'N3', inputs: [] }]
])
chain = foldableChain(1, 'Branch[0]', flowFrom, flowTo, nmCond, new Set()) // 真实条件中止
assert.deepEqual(
  chain.map((c: { nid: number }) => c.nid),
  [1]
)

console.log('PASS GIL NodeGraph tool selection, contracts, literal folding, and template parity')
