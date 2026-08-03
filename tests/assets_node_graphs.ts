import assert from 'node:assert/strict'

import { buildFile } from '../src/injector/binary.js'
import { buildEmptyNodeGraph } from '../src/cli/assets_node_graphs.js'
import { emitWireMessage, parseWireMessage, type WireField } from '../src/cli/static_assembly/wire.js'

// 最小 GIL fixture：root 10 空（无图）、root 6 含"未分类页签"聚合 record。
// 结构依据：真实地图（1073741850/1073741851）编辑器证据，见
// docs/game-engine-knowledge/gil-structure-semantics.md 与
// .agents/skills/editor-incremental-gia-investigator/references/node-graph-logic/node-graph-creation.md
function fixture(includeTab: boolean): Uint8Array {
  const tab: WireField[] = [{ number: 1, wire: 2, value: new TextEncoder().encode('未分类页签') }]
  const folderRecord = emitWireMessage([
    { number: 1, wire: 0, value: 4 },
    { number: 3, wire: 2, value: emitWireMessage(tab) }
  ])
  const root10 = emitWireMessage([])
  // includeTab=false 时 root 6 存在但没有 #1=4 的"未分类页签"记录
  const root6 = emitWireMessage([
    { number: 1, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: 2 }]) }
  ])
  const top = [
    { number: 10, wire: 2, value: root10 },
    { number: 6, wire: 2, value: includeTab ? emitWireMessage([{ number: 1, wire: 2, value: folderRecord }]) : root6 }
  ] as WireField[]
  return buildFile(emitWireMessage(top), { schema: 1, headTag: 2, fileType: 3, tailTag: 4 })
}

function graphIdOf(record: Uint8Array): number | undefined {
  const inner = parseWireMessage(record)
  const nodeGraph = inner?.find((f) => f.number === 1 && f.wire === 2)
  if (!nodeGraph) return undefined
  const ng = parseWireMessage(nodeGraph.value as Uint8Array)
  const id = ng?.find((f) => f.number === 1 && f.wire === 2)
  if (!id) return undefined
  const idMsg = parseWireMessage(id.value as Uint8Array)
  const nodeId = idMsg?.find((f) => f.number === 5 && f.wire === 0)
  return typeof nodeId?.value === 'number' ? nodeId.value : undefined
}

function folderGraphIds(bytes: Uint8Array): number[] {
  const root = parseWireMessage(bytes.slice(20, -4))
  assert.ok(root)
  const root6 = parseWireMessage(
    root.find((f) => f.number === 6 && f.wire === 2)!.value as Uint8Array
  )!
  const ids: number[] = []
  for (const rec of root6.filter((f) => f.number === 1 && f.wire === 2)) {
    const inner = parseWireMessage(rec.value as Uint8Array)!
    if (inner.find((f) => f.number === 1)?.value !== 4) continue
    const tab = parseWireMessage(
      inner.find((f) => f.number === 3 && f.wire === 2)!.value as Uint8Array
    )!
    for (const entry of tab.filter((f) => f.number === 5 && f.wire === 2)) {
      const entryFields = parseWireMessage(entry.value as Uint8Array)!
      const type = entryFields.find((f) => f.number === 1)?.value
      const id = entryFields.find((f) => f.number === 2)?.value
      if (type === 800 && typeof id === 'number') ids.push(id)
    }
  }
  return ids
}

// 1. 创建成功：root 10 双层包装（{1: NodeGraph}，NodeGraph = {1: Id, 2: name}）
const result = buildEmptyNodeGraph(fixture(true).slice(20, -4), 1073741825, '测试图')
const root = parseWireMessage(result)
assert.ok(root)
const top10 = parseWireMessage(root.find((f) => f.number === 10 && f.wire === 2)!.value as Uint8Array)!
const wrappers = top10.filter((f) => f.number === 1 && f.wire === 2)
assert.equal(wrappers.length, 1)
assert.equal(graphIdOf(wrappers[0].value as Uint8Array), 1073741825)
const inner = parseWireMessage(wrappers[0].value as Uint8Array)!
const nodeGraph = parseWireMessage(
  inner.find((f) => f.number === 1 && f.wire === 2)!.value as Uint8Array
)!
const nameField = nodeGraph.find((f) => f.number === 2 && f.wire === 2)!
assert.equal(new TextDecoder().decode(nameField.value as Uint8Array), '测试图')

// 2. root 6 folder 条目：typeValue=800 + 图 ID
assert.deepEqual(folderGraphIds(buildFile(result, { schema: 1, headTag: 2, fileType: 3, tailTag: 4 })), [
  1073741825
])

// 3. 重复创建报错
assert.throws(
  () => buildEmptyNodeGraph(result, 1073741825, '重复图'),
  /graph 1073741825 already exists in root 10/
)

// 4. 无"未分类页签"记录报错
assert.throws(
  () => buildEmptyNodeGraph(fixture(false).slice(20, -4), 1073741826, '无页签图'),
  /未分类页签/
)

// 5. 连续创建第二张图：两张图共存，folder 追加第二条
const second = buildEmptyNodeGraph(result, 1073741826, '第二张图')
const secondRoot = parseWireMessage(second)
assert.ok(secondRoot)
const secondTop10 = parseWireMessage(
  secondRoot.find((f) => f.number === 10 && f.wire === 2)!.value as Uint8Array
)!
const secondWrappers = secondTop10.filter((f) => f.number === 1 && f.wire === 2)
assert.equal(secondWrappers.length, 2)
assert.deepEqual(
  folderGraphIds(buildFile(second, { schema: 1, headTag: 2, fileType: 3, tailTag: 4 })),
  [1073741825, 1073741826]
)

console.log('PASS: assets_node_graphs assertions (create/read-back/duplicate/missing-tab/multi-graph)')
