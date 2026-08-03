// 红灯回归：同一复合 id 二次注入时，实现（compositeDef / impl graph）必须被新版本覆盖
// 背景：2026-08-03 bug 汇报（star-cube-nexus）——注入器按 id 去重合并 accessories，
// 保留 gil 侧旧定义，导致复合节点内部实现更新永不生效（主图可更新、复合不可，无报错）。
// 保护语义仅适用于信号定义 accessories（携带游戏内注册 signal id，覆盖会破坏路由，
// 2026-07-31 真实故障）；普通复合节点传入前已被 isSignalDefinitionAccessory 过滤。
import assert from 'node:assert/strict'

import { buildFile, encodeVarint, readFieldBytes, readFieldMessages } from '../../src/injector/binary.js'
import { createInjector } from '../../src/injector/index.js'
import { loadGiaProto } from '../../src/injector/proto.js'

function concat(...parts: Uint8Array[]): Uint8Array {
  return Buffer.concat(parts.map((part) => Buffer.from(part)))
}

function varintField(field: number, value: number): Uint8Array {
  return concat(encodeVarint(field << 3), encodeVarint(value))
}

function bytesField(field: number, value: Uint8Array): Uint8Array {
  return concat(encodeVarint((field << 3) | 2), encodeVarint(value.length), value)
}

const proto = loadGiaProto()
const compositeDefMessage = proto.root.lookupType('CompositeDef')

const targetId = 1082130436 // 主图 id
const compId = 1610700002 // 复合定义 id（编译期全局自增，跨编译稳定）
const implId = 1610710002 // 实现图 id（def id + 10000）

const entryNode = {
  nodeIndex: 1,
  genericId: { class: 10001, type: 20002, kind: 22000, nodeId: 200042 },
  concreteId: { class: 10001, type: 20002, kind: 22000, nodeId: 2001 }
}

const targetGraph = proto.nodeGraphMessage.create({
  id: { class: 10000, type: 20010, kind: 21001, id: targetId },
  name: '主图',
  nodes: []
})

const compositeDef = (name: string) => ({
  id: { genericId: { class: 10000, type: 20002, kind: 21001, id: compId } },
  name,
  type: { kind: 1000 }
})

const implGraph = (nodeCount: number) =>
  proto.nodeGraphMessage.create({
    id: { class: 10000, type: 20002, kind: 21001, id: implId },
    name: `BindUFaceToPivot_impl`,
    nodes: Array.from({ length: nodeCount }, (_, i) => ({ ...entryNode, nodeIndex: i + 1 }))
  })

const folderEntry = (typeValue: number, id = targetId) =>
  bytesField(
    6,
    bytesField(
      1,
      bytesField(3, bytesField(5, concat(varintField(1, typeValue), varintField(2, id))))
    )
  )

// GIL：主图 + 旧版复合定义（9 节点实现）
const gilBytes = buildFile(
  concat(
    folderEntry(200),
    folderEntry(7400),
    bytesField(
      10,
      concat(
        bytesField(1, bytesField(1, proto.nodeGraphMessage.encode(targetGraph).finish())),
        bytesField(2, bytesField(1, compositeDefMessage.encode(compositeDef('旧实现') as never).finish())),
        bytesField(4, bytesField(1, proto.nodeGraphMessage.encode(implGraph(9)).finish()))
      )
    )
  ),
  { schema: 1, headTag: 0x0326, fileType: 0, tailTag: 0x0679 }
)

// GIA：同一复合 id 的新版定义（13 节点实现）
const giaBytes = (() => {
  const root = proto.rootMessage.create({
    graph: {
      id: { class: 1, type: 3, id: targetId },
      name: '_GSTS_main',
      which: 64,
      graph: { inner: { graph: targetGraph } }
    },
    accessories: [
      {
        id: { class: 1, type: 3, id: compId },
        name: 'BindUFaceToPivot',
        which: 12,
        compositeDef: { inner: { def: compositeDef('新实现') } }
      },
      {
        id: { class: 1, type: 3, id: implId },
        name: 'BindUFaceToPivot_impl',
        which: 12,
        graph: { inner: { graph: implGraph(13) } }
      }
    ]
  })
  return buildFile(proto.rootMessage.encode(root).finish(), {
    schema: 1,
    headTag: 0x0326,
    fileType: 0,
    tailTag: 0x0679
  })
})()

const result = createInjector({ lang: 'en' }).injectBytes({ gilBytes, giaBytes })
assert.equal(result.mode, 'replace')

const payload = result.bytes.slice(20, -4)
const top10Bytes = readFieldBytes(payload, 10)
assert.ok(top10Bytes, 'top-level field 10 (NodeGraph container) present')

const defs = readFieldMessages(top10Bytes, 2).map((wrapper) =>
  compositeDefMessage.decode(readFieldBytes(wrapper, 1) as Uint8Array)
)
const impls = readFieldMessages(top10Bytes, 4).map((wrapper) =>
  proto.nodeGraphMessage.decode(readFieldBytes(wrapper, 1) as Uint8Array)
)

// 同 id 不得重复追加；实现必须被新版本覆盖（bug 症状：保留旧实现、静默失效）
const def = defs.find((d: any) => Number(d.id?.genericId?.id) === compId)
assert.equal(defs.length, 1, 'compositeDef 不应按 id 重复追加')
assert.equal((def as { name?: string })?.name, '新实现', '同 id 复合定义应被新版本覆盖')
const impl = impls.find((g: any) => Number(g.id?.id) === implId)
assert.equal(impls.length, 1, 'impl graph 不应按 id 重复追加')
assert.equal(
  ((impl as { nodes?: unknown[] })?.nodes ?? []).length,
  13,
  '同 id 实现图应被新版本覆盖（旧 9 节点 → 新 13 节点）'
)
