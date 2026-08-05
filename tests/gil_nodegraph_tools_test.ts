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

for (const name of ['trace-gil-exec-flow.ts', 'trace-gil-dataflow.ts']) {
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

console.log('PASS GIL NodeGraph tool selection, contracts, literal folding, and template parity')
