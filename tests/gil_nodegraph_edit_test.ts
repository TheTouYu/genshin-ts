// @ts-nocheck
/**
 * 节点图编辑库同构重放测试（2026-08-08）。
 *
 * 每个用例 = 真实相邻快照 before/after（编辑器单变化）→ 用库原语在 before 上
 * 重放该变化 → 断言目标记录（NodeGraph blob / CompositeDef blob / GraphNode）
 * 与 after 逐字节一致。证据目录：~/genshin-ts-evidence/node-graph-logic/。
 *
 * 运行：npx tsx tests/gil_nodegraph_edit_test.ts
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { parseWireMessage } from '../src/cli/static_assembly/wire.js'

import {
  addCompositePin,
  addGraphNode,
  addOutFlow,
  addParamFlow,
  blobId,
  blobName,
  buildCompositeDef,
  buildCompositeImplGraph,
  buildVarValue,
  chooseMovedIndex,
  chooseRebuildIndex,
  compositePinWire,
  createComposite,
  delCompositePin,
  delGraphNode,
  delInstanceCompositePin,
  delParamFlow,
  flowMetas,
  linkInParam,
  locateBlobField,
  paramFlowTypeBytes,
  parseGraphNodes,
  parseNodeRecord,
  patchGraphNode,
  patchRecord,
  removeOutFlow,
  renameCompositeDef,
  renameParamFlow,
  renumberGraphNode,
  setNodePos,
  setParam,
  swapCompositePinInners,
  swapInstancePins,
  swapParamFlows,
  unlinkInParam
} from '../src/cli/static_assembly/graph_edit.js'

const EVIDENCE = '/home/h/genshin-ts-evidence/node-graph-logic/node-graph-systematic/2026-08-06-connection-v1/experiments'
const SYSTEMATIC = '/home/h/genshin-ts-evidence/node-graph-logic/node-graph-systematic/2026-08-05-systematic-v1/raw'
const GID = 1073741836

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function read(file: string): Uint8Array {
  return new Uint8Array(readFileSync(file))
}

function graphBlob(file: Uint8Array, graphId: number): Uint8Array {
  const payload = file.slice(20, -4)
  const field = locateBlobField(payload, 1, graphId)
  return payload.subarray(field.dataStart, field.dataEnd)
}

function defBlob(file: Uint8Array, defId: number): Uint8Array {
  const payload = file.slice(20, -4)
  const field = locateBlobField(payload, 2, defId)
  return payload.subarray(field.dataStart, field.dataEnd)
}

function nodeRecord(file: Uint8Array, graphId: number, nodeIndex: number): Uint8Array {
  const payload = file.slice(20, -4)
  const field = locateBlobField(payload, 1, graphId)
  const blob = payload.subarray(field.dataStart, field.dataEnd)
  const nodeFields = blob
  const view = parseGraphNodes(nodeFields).find((n) => n.index === nodeIndex)
  assert.ok(view, `node ${nodeIndex} exists`)
  // 重新定位原始 node 字节（按 index 匹配 f3 记录）
  const records = parseWireMessage(nodeFields)!.filter((f) => f.number === 3 && f.wire === 2)
  const target = records.find((f) => parseNodeRecord(f.value as Uint8Array).index === nodeIndex)
  assert.ok(target, `node ${nodeIndex} raw`)
  return target.value as Uint8Array
}

let passed = 0
function replay(name: string, beforeFile: string, afterFile: string, apply: (b: Uint8Array) => Uint8Array) {
  const before = read(beforeFile)
  const after = read(afterFile)
  const patched = apply(before)
  const a = sha256(graphBlob(patched, GID))
  const b = sha256(graphBlob(after, GID))
  assert.equal(a, b, `${name}: graph blob mismatch`)
  passed++
  console.log(`PASS ${name}`)
}

// ===== 数据连线（data-flow.md 闭合规则）=====

replay(
  'dataflow-case1 新建 InParam pin + connects（shell1 ← node12）',
  `${EVIDENCE}/dataflow-case1-node12-to-node24-v15-v16/raw/before.gil`,
  `${EVIDENCE}/dataflow-case1-node12-to-node24-v15-v16/raw/after.gil`,
  (b) => patchGraphNode(b, GID, 24, (n) => linkInParam(n, 1, 12, 0, 3))
)

replay(
  'dataflow-case2 两条新线（非默认源 Shell1 显式 index）',
  `${EVIDENCE}/dataflow-case2-multi-wire-v16-v17/raw/before.gil`,
  `${EVIDENCE}/dataflow-case2-multi-wire-v16-v17/raw/after.gil`,
  (b) => {
    const step1 = patchGraphNode(b, GID, 16, (n) => linkInParam(n, 1, 13, 1, 5))
    return patchGraphNode(step1, GID, 24, (n) => linkInParam(n, 2, 12, 0, 3))
  }
)

replay(
  'dataflow-case4 多 pin 目标 Shell0 插入头部（升序）',
  `${EVIDENCE}/dataflow-case4-node30-to-node24-v18-v19/raw/before.gil`,
  `${EVIDENCE}/dataflow-case4-node30-to-node24-v18-v19/raw/after.gil`,
  (b) => patchGraphNode(b, GID, 24, (n) => linkInParam(n, 0, 30, 0, 1))
)

// ===== 控制流连线（control-flow.md 闭合规则）=====

replay(
  'control-flow-case1 OutFlow[1]（非默认源显式 index）→ 默认 InFlow',
  `${EVIDENCE}/control-flow-case1-node11-to-node24-v11-v12/raw/before.gil`,
  `${EVIDENCE}/control-flow-case1-node11-to-node24-v11-v12/raw/after.gil`,
  (b) => patchGraphNode(b, GID, 11, (n) => addOutFlow(n, 1, 24, 0))
)

replay(
  'control-flow-case2 OutFlow[2]',
  `${EVIDENCE}/control-flow-case2-node11-to-node27-v12-v13/raw/before.gil`,
  `${EVIDENCE}/control-flow-case2-node11-to-node27-v12-v13/raw/after.gil`,
  (b) => patchGraphNode(b, GID, 11, (n) => addOutFlow(n, 2, 27, 0))
)

replay(
  'dataflow-case5 默认 OutFlow[0]（index 省略）',
  `${EVIDENCE}/dataflow-case5-node27-to-node24-v19-v20/raw/before.gil`,
  `${EVIDENCE}/dataflow-case5-node27-to-node24-v19-v20/raw/after.gil`,
  (b) => patchGraphNode(b, GID, 27, (n) => addOutFlow(n, 0, 24, 0))
)

// case3 同时新增了节点 2（node-add 未闭合），只断言 node 11 的 pin 逐字节一致
{
  const dir = `${EVIDENCE}/control-flow-case3-node11-to-node5-v13-v14/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const patched = patchGraphNode(before, GID, 11, (n) => addOutFlow(n, 3, 2, 1))
  const a = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.index === 11)
  const b = parseGraphNodes(graphBlob(after, GID)).find((n) => n.index === 11)
  assert.equal(JSON.stringify(a.pins), JSON.stringify(b.pins), 'case3 node11 pins')
  passed++
  console.log('PASS control-flow-case3 OutFlow[3]→非默认 InFlow[1]（node 级，node-add 未闭合）')
}

// ===== 参数固定值（node-graphs.md v4→v5 闭合）=====

{
  const before = read(`${SYSTEMATIC}/1073741849-v4-create-component.gil`)
  const after = read(`${SYSTEMATIC}/1073741849-v5-param-1234.gil`)
  const gid = 1073741835
  const patched = patchGraphNode(before, gid, 4, (n) => setParam(n, 0, { type: 21, bytes: buildVarValue(21, 1234) }))
  const payload = patched.slice(20, -4)
  const field = locateBlobField(payload, 1, gid)
  const a = sha256(payload.subarray(field.dataStart, field.dataEnd))
  const apayload = after.slice(20, -4)
  const afield = locateBlobField(apayload, 1, gid)
  const b = sha256(apayload.subarray(afield.dataStart, afield.dataEnd))
  assert.equal(a, b, 'v5 param 1234')
  passed++
  console.log('PASS 参数固定值 Pfb 1234（v4→v5）')
}

// ===== 复合定义（composite-nodes.md 闭合规则）=====

{
  const dir = `${EVIDENCE}/composite-case2-rename-v23-v24/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const defId = 1610612744
  const patched = patchRecord(before, 2, defId, (b) => renameCompositeDef(b, '复合节点'))
  const a = sha256(defBlob(patched, defId))
  const b = sha256(defBlob(after, defId))
  assert.equal(a, b, 'composite rename')
  passed++
  console.log('PASS composite rename（case2）')
}

{
  const dir = `${EVIDENCE}/composite-case5-rename-input-v26-v27/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const defId = 1610612744
  const patched = patchRecord(before, 2, defId, (blob) => renameParamFlow(blob, 3, 1, '复合节点-变量名字'))
  const a = sha256(defBlob(patched, defId))
  const b = sha256(defBlob(after, defId))
  assert.equal(a, b, 'composite input rename')
  passed++
  console.log('PASS composite 输入参数改名（case5）')
}

// ===== 复合实例调用侧（composite-nodes.md case6/7 闭合）=====

const DEF_ID = 1610612744

function instanceMeta(file: Uint8Array, nodeIndex: number) {
  // 从宿主图实例节点 genericId 解析定义，取 def inputs/outflows 的 type/pinIndex
  const node = parseNodeRecord(nodeRecord(file, GID, nodeIndex))
  assert.equal(node.genericId, DEF_ID, 'instance def id')
  const metas = flowMetas(defBlob(file, DEF_ID))
  return { node, metas }
}

{
  // case6：实例输入 shell1 填值 str:"arst"（f7=48）
  const dir = `${EVIDENCE}/composite-case6-call-input2-v27-v28/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const { metas } = instanceMeta(before, 7)
  const input = metas.find((m) => m.kind === 3 && m.shell === 1)
  assert.ok(input?.pinIndex !== undefined, 'input shell1 pinIndex')
  const patched = patchGraphNode(before, GID, 7, (n) =>
    setParam(n, 1, { type: 6, bytes: buildVarValue(6, 'arst') }, input.pinIndex)
  )
  const a = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.index === 7)
  const b = parseGraphNodes(graphBlob(after, GID)).find((n) => n.index === 7)
  assert.equal(JSON.stringify(a.pins), JSON.stringify(b.pins), 'case6 instance pins')
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(after, GID)), 'case6 whole blob')
  passed++
  console.log('PASS 复合实例输入填值 str:arst（case6）')
}

{
  // case7：实例输入 shell0 连线 ← node30（f7=47，type=Ety）
  const dir = `${EVIDENCE}/composite-case7-call-input1-wire-v28-v29/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const { metas } = instanceMeta(before, 7)
  const input = metas.find((m) => m.kind === 3 && m.shell === 0)
  assert.ok(input?.pinIndex !== undefined && input.type === 1, 'input shell0 meta')
  const patched = patchGraphNode(before, GID, 7, (n) =>
    linkInParam(n, 0, 30, 0, input.type, input.pinIndex)
  )
  const a = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.index === 7)
  const b = parseGraphNodes(graphBlob(after, GID)).find((n) => n.index === 7)
  assert.equal(JSON.stringify(a.pins), JSON.stringify(b.pins), 'case7 instance pins')
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(after, GID)), 'case7 whole blob')
  passed++
  console.log('PASS 复合实例输入连线 ← node30（case7）')
}

// ===== 可逆性（断线/删流 = 加线/加流的逆，整文件级）=====

{
  const dir = `${EVIDENCE}/dataflow-case1-node12-to-node24-v15-v16/raw`
  const before = read(`${dir}/before.gil`)
  const linked = patchGraphNode(before, GID, 24, (n) => linkInParam(n, 1, 12, 0, 3))
  const unlinked = patchGraphNode(linked, GID, 24, (n) => unlinkInParam(n, 1))
  assert.equal(sha256(unlinked), sha256(before), 'unlink(link(x)) == x (Fixed 目标整 pin 移除)')
  passed++
  console.log('PASS unlink∘link = identity（Fixed 目标）')
}

{
// flowrm-case1（v53→v54）：删除 n11 OutFlow[1] → n24 的控制流线
// 真实形态 = 从 connects 列表删 f1=target 的整条记录（pin 保留、其余逐字节一致、目标侧不动）
{
  const dir = `${EVIDENCE}/flowrm-case1-node11-unlink-n24-v53-v54/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const patched = patchGraphNode(before, GID, 11, (n) => removeOutFlow(n, 1, 24))
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(after, GID)), 'flowrm-case1 全图 blob 一致')
  const view = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.index === 11)!
  const flow1 = view.pins.filter((p) => p.kind === 2 && p.index === 1)
  assert.equal(flow1.length, 1, 'pin 保留（不只删 connects）')
  assert.deepEqual(flow1[0].connects.map((c) => c.id), [51], '剩一条 connects → n51')
  // 删到空（flowrm-case2 v54→v55 闭合）：单 connects 的 OutFlow[2] → n27 断线 = 整 pin 移除
  {
    const dir = `${EVIDENCE}/flowrm-case2-node11-unlink-n27-v54-v55/raw`
    const before = read(`${dir}/before.gil`)
    const after = read(`${dir}/after.gil`)
    const patched = patchGraphNode(before, GID, 11, (n) => removeOutFlow(n, 2, 27))
    assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(after, GID)), 'flowrm-case2 全图 blob 一致')
    const view = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.index === 11)!
    assert.equal(view.pins.filter((p) => p.kind === 2).length, 3, 'OutFlow[2] 整 pin 移除，剩 3 个 OutFlow')
    passed++
    console.log('PASS flowrm-case2 断线（删到空 = 整 pin 移除）')
  }
  passed++
  console.log('PASS flowrm-case1 断线（多 connects 删一条；删空整 pin 移除）')
}
}

// node-add-case1（v55→v56）：新增定时器触发时（genericId 83），nodeIndex=最小空闲空洞 3
// 真实形态 = f1=3 + f2/f3 克隆 donor + f5/f6 坐标，无 pin，升序插入，root4 def 不新增
{
  const dir = `${EVIDENCE}/node-add-case1-weighted-random-v55-v56/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const patched = patchRecord(before, 1, GID, (blob) => addGraphNode(blob, 83, -908, 1274))
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(after, GID)), 'node-add-case1 全图 blob 一致')
  const view = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.index === 3)!
  assert.equal(view.genericId, 83)
  assert.equal(view.concreteId, 83)
  assert.equal(view.pins.length, 0)
  // donor 是 Variant（genericId≠concreteId）：fail closed；无 donor 时验证构造路径
  assert.throws(() => patchRecord(before, 1, GID, (b) => addGraphNode(b, 3, 0, 0)), /Variant/)
  // 有 pin 的 Fixed donor（node 1 genericId 1 有 InParam）：允许克隆
  const pinDonor = patchRecord(before, 1, GID, (b) => addGraphNode(b, 1, 100, 200))
  const pd = parseGraphNodes(graphBlob(pinDonor, GID)).find((n) => n.genericId === 1 && n.index !== 1)!
  assert.equal(pd.concreteId, 1)
  const noDonor = patchRecord(before, 1, GID, (b) => addGraphNode(b, 9999, 10, 20))
  const nd = parseGraphNodes(graphBlob(noDonor, GID)).find((n) => n.genericId === 9999)!
  assert.equal(nd.concreteId, 9999)
  assert.equal(nd.index, 3, '无 donor 时同样取最小空闲号')
  passed++
  console.log('PASS node-add-case1 新增节点（最小空闲空洞 + 引用构造 + 升序插入）')
}

// node-del-case1（v56→v57）：删除 node 3 = 移除记录，其余逐字节不动；与 add 互为镜像
// （node-del-case1.before == node-add-case1.after，且 del∘add = identity 整文件）
{
  const delDir = `${EVIDENCE}/node-del-case1-remove-node3-v56-v57/raw`
  const addDir = `${EVIDENCE}/node-add-case1-weighted-random-v55-v56/raw`
  const delBefore = read(`${delDir}/before.gil`)
  const delAfter = read(`${delDir}/after.gil`)
  const patched = patchRecord(delBefore, 1, GID, (blob) => delGraphNode(blob, 3))
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(delAfter, GID)), 'node-del-case1 全图 blob 一致')
  // del∘add = identity：add 快照的 before 上加 83，再删 3，回到 add 快照的 before（整文件）
  const addBefore = read(`${addDir}/before.gil`)
  const roundtrip = patchRecord(patchRecord(addBefore, 1, GID, (b) => addGraphNode(b, 83, -908, 1274)), 1, GID, (b) => delGraphNode(b, 3))
  assert.equal(sha256(roundtrip), sha256(addBefore), 'del∘add = identity（整文件）')
  assert.throws(() => patchRecord(delBefore, 1, GID, (b) => delGraphNode(b, 99)), /not found/)
  passed++
  console.log('PASS node-del-case1 删除节点（移除记录；del∘add = identity）')
}

// node-add-case2（v57→v58）：新增打印字符串（genericId 1，有默认 string 参数但无 pin 落盘）
// 关键：node 3 刚被删除（v56→v57）但新增取 4 —— 删除空洞不复用（编辑器会话墓碑）
{
  const dir = `${EVIDENCE}/node-add-case2-print-string-v57-v58/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const patched = patchRecord(before, 1, GID, (blob) => addGraphNode(blob, 1, -794.6666870117188, 1414, new Set([3])))
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(after, GID)), 'node-add-case2 全图 blob 一致')
  const view = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.index === 4)!
  assert.equal(view.genericId, 1)
  assert.equal(view.pins.length, 0, '有默认参数的节点新增也不落 pin')
  // 不传墓碑集合时取 3（与编辑器不一致的已知边界）
  const naive = patchRecord(before, 1, GID, (blob) => addGraphNode(blob, 1, 0, 0))
  assert.equal(parseGraphNodes(graphBlob(naive, GID)).find((n) => n.genericId === 1)!.index, 3)
  passed++
  console.log('PASS node-add-case2 新增有参数节点（无默认 pin；删除空洞不复用需墓碑集）')
}

// ety-wire-case1（v58→v59）：Ety 参数连线与普通数据线完全同构
// （i1/i2 kind=3 + type=1 + connects→n30 OutParam[0]，无特殊编码）；
// 编辑器不支持 Ety 填固定值（动态值，游戏未启动无值），`ety:` 前缀保持报错
{
  const dir = `${EVIDENCE}/ety-wire-case1-entity-input-link-v58-v59/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const patched = patchGraphNode(before, GID, 48, (n) => linkInParam(n, 0, 30, 0, 1))
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(after, GID)), 'ety-wire-case1 全图 blob 一致')
  const view = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.index === 48)!
  assert.equal(view.pins[0].type, 1, 'Ety type=1')
  assert.deepEqual(view.pins[0].connects.map((c) => c.id), [30])
  passed++
  console.log('PASS ety-wire-case1 Ety 参数连线（与普通数据线同构；Ety 固定值编辑器不支持）')
}

// composite-add-param-case1（v59→v60）：提升 impl node 3 R<T> 输入为复合输入「控制表达式 Int」
// 联动 = def 参数流追加（pinIndex=60，无删除史单调 max+1）+ impl compositePin 升序插入
// {outer=08031002, innerNode=3, inner=0803} + 实例 51→3（排除自身后最小空闲=3，非原位）
// 注：case1 的 impl node 3 另有 +2 pins 污染（用户额外操作），impl 只断言新增项形态
{
  const dir = `${EVIDENCE}/composite-add-param-case1-v59-v60/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const DEF = 1610612744
  const newIndex = chooseRebuildIndex(graphBlob(before, GID), 51, 3)
  assert.equal(newIndex, 3, 'case1 实例 51→3（排除自身后最小空闲）')
  let patched = patchRecord(before, 2, DEF, (b) => addParamFlow(b, 3, 2, '控制表达式', 3))
  patched = patchRecord(patched, 4, DEF, (b) => addCompositePin(b, 3, 2, 3, 0))
  patched = patchRecord(patched, 1, GID, (b) => renumberGraphNode(b, 51, newIndex))
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(after, GID)), 'composite-add-param 图 blob 一致')
  assert.equal(sha256(defBlob(patched, DEF)), sha256(defBlob(after, DEF)), 'composite-add-param def blob 一致（pinIndex=60 无删除史单调）')
  const inst = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.genericId === DEF)!
  assert.equal(inst.index, 3)
  const flow1 = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.index === 11)!
  assert.deepEqual(flow1.pins[0].connects.map((c) => c.id), [3], '源侧 connects 51→3')
  // impl 图 compositePins 12 条（f4），新增项 = {1:{1:3,2:2}, 2:3, 3:{1:3}, 4:{1:3}}（嵌套 outerPin）
  const implPayload = patched.slice(20, -4)
  const impl = implPayload.subarray(locateBlobField(implPayload, 4, DEF).dataStart, locateBlobField(implPayload, 4, DEF).dataEnd)
  const pins4 = parseWireMessage(impl)!.filter((f) => f.number === 4 && f.wire === 2)
  assert.equal(pins4.length, 12, 'impl compositePins 11→12')
  const added = pins4[9] // 升序插入：kind=3 shell=2 在 shell=1 后、OutParam(4) 前
  assert.equal(
    Buffer.from(added.value as Uint8Array).toString('hex'),
    '0a040803100210031a02080322020803',
    '新增 compositePin 嵌套形态 {outer:{1:3,2:2}, innerNode:3, inner:{1:3}, 双写}'
  )
  passed++
  console.log('PASS composite-add-param 加输入参数（def+impl 嵌套 pin+实例重编号+connects）')
}

// composite-add-param-case2（v60→v61）：提升 node 1 Bol 输入「是否触发事件」（Shell3）
// 实例原位（3→3：排除自身后最小空闲==原位 → undefined 不重建）；def/impl 结构追加。
// 注：pinIndex=89 是全局分配器（61-88 被其他 def 占用/墓碑），工具 def 内 max+1=61 无法重放
// → def 只断言新增项结构（name/shell/type），pinIndex 差异为文档标记边界
{
  const dir = `${EVIDENCE}/composite-add-param-case2-v60-v61/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const DEF = 1610612744
  const newIndex = chooseRebuildIndex(graphBlob(before, GID), 3, 1)
  assert.equal(newIndex, undefined, 'case2 实例原位（3→3，不重建）')
  let patched = patchRecord(before, 2, DEF, (b) => addParamFlow(b, 3, 3, '是否触发事件', 4))
  patched = patchRecord(patched, 4, DEF, (b) => addCompositePin(b, 3, 3, 1, 2))
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(before, GID)), 'case2 宿主图零变化（原位重建）')
  // impl 新增项 = {1:{1:3,2:3}(outer Shell3), 2:1, 3:{1:3,2:2}(inner Shell2), 4:双写}
  const implPayload = patched.slice(20, -4)
  const impl = implPayload.subarray(locateBlobField(implPayload, 4, DEF).dataStart, locateBlobField(implPayload, 4, DEF).dataEnd)
  const pins4 = parseWireMessage(impl)!.filter((f) => f.number === 4 && f.wire === 2)
  const added = pins4[10]
  assert.equal(
    Buffer.from(added.value as Uint8Array).toString('hex'),
    '0a040803100310011a0408031002220408031002',
    'case2 新增 compositePin {outer:{1:3,2:3}, innerNode:1, inner:{1:3,2:2}双写}'
  )
  // def inputs 新增项结构（name/shell/type），pinIndex 工具 61 vs 真实 89（文档边界）
  const defF = parseWireMessage(defBlob(patched, DEF))!
  const inputs = defF.filter((f) => f.number === 102 && f.wire === 2)
  assert.equal(inputs.length, 4, 'case2 inputs 3→4')
  const last = parseWireMessage(inputs[3].value as Uint8Array)!
  assert.equal(
    Buffer.from((last.find((x) => x.number === 4)!.value as Uint8Array)).toString('hex'),
    '080618042004aa06020801',
    'case2 Bol type={1:6,3:4,4:4,101:{1:1}}'
  )
  assert.equal((last.find((x) => x.number === 8)!).value, 61, 'case2 pinIndex 工具值 61（真实 89，全局分配器边界）')
  passed++
  console.log('PASS composite-add-param case2（实例原位判定 + Bol type + pinIndex 边界标记）')
}

// composite-promote-input-case6（v65→v66）：提升 node 1 Bol 输入（回收池 pinIndex=51）
// 实例 6→3（排除自身后最小空闲=3）；impl blob 逐字节一致（impl 不含 pinIndex）
{
  const dir = `${EVIDENCE}/composite-promote-input-case6-v65-v66/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const DEF = 1610612744
  const newIndex = chooseRebuildIndex(graphBlob(before, GID), 6, 1)
  assert.equal(newIndex, 3, 'case6 实例 6→3')
  let patched = patchRecord(before, 2, DEF, (b) => addParamFlow(b, 3, 2, '是否触发事件', 4))
  patched = patchRecord(patched, 4, DEF, (b) => addCompositePin(b, 3, 2, 1, 2))
  patched = patchRecord(patched, 1, GID, (b) => renumberGraphNode(b, 6, newIndex))
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(after, GID)), 'case6 图 blob 一致')
  const implPayload = patched.slice(20, -4)
  const afterPayload = after.slice(20, -4)
  const implA = implPayload.subarray(locateBlobField(implPayload, 4, DEF).dataStart, locateBlobField(implPayload, 4, DEF).dataEnd)
  const implB = afterPayload.subarray(locateBlobField(afterPayload, 4, DEF).dataStart, locateBlobField(afterPayload, 4, DEF).dataEnd)
  assert.equal(sha256(implA), sha256(implB), 'case6 impl blob 逐字节一致')
  // def pinIndex 工具 60 vs 真实 51（回收池，删除史不可推断）
  const defF = parseWireMessage(defBlob(patched, DEF))!
  const inputs = defF.filter((f) => f.number === 102 && f.wire === 2)
  assert.equal((parseWireMessage(inputs[2].value as Uint8Array)!.find((x) => x.number === 8)!).value, 60, 'case6 pinIndex 工具值 60（真实 51，回收池边界）')
  passed++
  console.log('PASS composite-promote-input case6（实例 6→3 + impl blob 一致 + 回收池边界标记）')
}

// composite-promote-input-case7（v66→v67）：提升 node 3 R<T>（回收池 pinIndex=52）
// innerNode==实例 nodeIndex（3==3）→ 编辑器排除原位取 5（单样本）→ 工具 fail closed
{
  const dir = `${EVIDENCE}/composite-promote-input-case7-v66-v67/raw`
  const before = read(`${dir}/before.gil`)
  assert.throws(
    () => chooseRebuildIndex(graphBlob(before, GID), 3, 3),
    /innerNode 与实例 nodeIndex 冲突/,
    'case7 innerNode==实例位置 → fail closed'
  )
  passed++
  console.log('PASS composite-promote-input case7（innerNode 冲突 fail closed，单样本未闭合）')
}

// ParameterFlow type 编码（case2/3/4/6/7 双样本 CONFIRMED）：
// Ety={3:1,4:1}（无 class）；Int={1:2,3:3,4:3}；Bol={1:6,3:4,4:4,101:{1:1}}；Flt={1:4,3:5,4:5}；Str={1:5,3:6,4:6}
{
  const hex = (v: number) => Buffer.from(paramFlowTypeBytes(v)).toString('hex')
  assert.equal(hex(1), '18012001', 'Ety type 无 class f1')
  assert.equal(hex(3), '080218032003', 'Int type')
  assert.equal(hex(4), '080618042004aa06020801', 'Bol type 含 field101')
  assert.equal(hex(5), '080418052005', 'Flt type')
  assert.equal(hex(6), '080518062006', 'Str type')
  assert.throws(() => paramFlowTypeBytes(2), /无真实样本/, 'Gid 无样本 fail closed')
  passed++
  console.log('PASS ParameterFlow type 编码（5 类型 hex 断言 + fail closed）')
}

// ===== 位置修改（fixed32 回读自洽）=====

{
  const dir = `${EVIDENCE}/dataflow-case5-node27-to-node24-v19-v20/raw`
  const before = read(`${dir}/before.gil`)
  const patched = patchGraphNode(before, GID, 27, (n) => setNodePos(n, 1234.5, -678.25))
  const view = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.index === 27)
  assert.equal(view.x, 1234.5)
  assert.equal(view.y, -678.25)
  // 幂等：再设同值字节不变
  const twice = patchGraphNode(patched, GID, 27, (n) => setNodePos(n, 1234.5, -678.25))
  assert.equal(sha256(twice), sha256(patched), 'pos idempotent')
  passed++
  console.log('PASS 节点位置修改（setNodePos 回读/幂等）')
}

// ===== 读侧冒烟：blob id/name 解析 =====

{
  const dir = `${EVIDENCE}/dataflow-case5-node27-to-node24-v19-v20/raw`
  const before = read(`${dir}/before.gil`)
  const payload = before.slice(20, -4)
  const field = locateBlobField(payload, 1, GID)
  const blob = payload.subarray(field.dataStart, field.dataEnd)
  assert.equal(blobId(blob, 1), GID)
  assert.equal(blobName(blob, 1), '样本-01')
  passed++
  console.log('PASS 读侧 blob id/name')
}

// ===== 复合创建（composite-create-multinode-case8 v67→v68 闭合骨架）=====

{
  const dir = `${EVIDENCE}/composite-create-multinode-v67-v68/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const NEW = 1610612745
  const patched = createComposite(before, GID, '创建复合节点', [1, 11], 1, 57)
  // 三个 blob 逐字节一致（宿主图 43→42、新 def、新 impl 图）
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(after, GID)), 'create 宿主图 blob')
  assert.equal(sha256(defBlob(patched, NEW)), sha256(defBlob(after, NEW)), 'create 新 def blob')
  {
    const payload = patched.slice(20, -4)
    const impl = payload.subarray(locateBlobField(payload, 4, NEW).dataStart, locateBlobField(payload, 4, NEW).dataEnd)
    const apayload = after.slice(20, -4)
    const aimpl = apayload.subarray(locateBlobField(apayload, 4, NEW).dataStart, locateBlobField(apayload, 4, NEW).dataEnd)
    assert.equal(sha256(impl), sha256(aimpl), 'create 新 impl 图 blob')
  }
  // 实例 = 锚点 node 1 原位变实例：3 个 OutFlow pins（cpi=57/58/60）承接原出口连线
  const inst = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.index === 1)!
  assert.equal(inst.genericId, NEW)
  assert.deepEqual(inst.pins.map((p) => [p.kind, p.index, p.compositePinIndex]), [[2, 0, 57], [2, 1, 58], [2, 2, 60]])
  assert.deepEqual(inst.pins[0].connects.map((c) => c.id), [5])
  assert.deepEqual(inst.pins[1].connects.map((c) => c.id), [2])
  assert.deepEqual(inst.pins[1].connects.map((c) => c.index), [1])
  assert.deepEqual(inst.pins[2].connects.map((c) => c.id), [2])
  assert.deepEqual(inst.pins[2].connects.map((c) => c.index), [0])
  // node 11 删除；内部节点搬入（OutFlow 剥落 + 节点级旧式 connects 并入 InParam[0]）
  assert.equal(parseGraphNodes(graphBlob(patched, GID)).some((n) => n.index === 11), false, 'node 11 删除')
  {
    const payload = patched.slice(20, -4)
    const impl = payload.subarray(locateBlobField(payload, 4, NEW).dataStart, locateBlobField(payload, 4, NEW).dataEnd)
    const inner = parseGraphNodes(impl)
    assert.deepEqual(inner.map((n) => n.index), [1, 11])
    const n11 = inner.find((n) => n.index === 11)!
    assert.equal(n11.pins.filter((p) => p.kind === 2).length, 0, '内部 OutFlow 剥落')
    assert.deepEqual(n11.pins[0].connects.map((c) => c.id), [1], '旧式节点级 connects 并入 InParam[0]')
    assert.deepEqual(inner.find((n) => n.index === 1)!.pins.map((p) => p.kind), [3, 4], '内部数据 pin 保留')
  }
  passed++
  console.log('PASS composite create（case8：宿主/def/impl 逐字节 + 锚点原位 + 出口提升 + 内部搬入）')
}

// ===== 复合删输入（del-param-case4 v62→v63 闭合；case5 跨轮墓碑为文档边界）=====

{
  const dir = `${EVIDENCE}/composite-del-param-case4-v62-v63/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const DEF = 1610612744
  const target = flowMetas(defBlob(before, DEF)).find((m) => m.kind === 3 && m.shell === 2)!
  assert.equal(target.pinIndex, 60, '删控制表达式 cpi=60')
  const newIndex = chooseMovedIndex(graphBlob(before, GID), 3)
  assert.equal(newIndex, 5, '实例 3→5（排除原位取最小空闲）')
  let patched = patchRecord(before, 2, DEF, (b) => delParamFlow(b, 3, 2))
  patched = patchRecord(patched, 4, DEF, (b) => delCompositePin(b, 3, 2))
  patched = patchGraphNode(patched, GID, 3, (n) => delInstanceCompositePin(n, 3, 2, target.pinIndex!))
  patched = patchRecord(patched, 1, GID, (b) => renumberGraphNode(b, 3, newIndex))
  assert.equal(sha256(graphBlob(patched, GID)), sha256(graphBlob(after, GID)), 'del 宿主图 blob（实例 pin 前移 + 重编号）')
  assert.equal(sha256(defBlob(patched, DEF)), sha256(defBlob(after, DEF)), 'del def blob（删 flow + 后续 ShellIndex 前移）')
  {
    const payload = patched.slice(20, -4)
    const impl = payload.subarray(locateBlobField(payload, 4, DEF).dataStart, locateBlobField(payload, 4, DEF).dataEnd)
    const apayload = after.slice(20, -4)
    const aimpl = apayload.subarray(locateBlobField(apayload, 4, DEF).dataStart, locateBlobField(apayload, 4, DEF).dataEnd)
    assert.equal(sha256(impl), sha256(aimpl), 'del impl blob（compositePin 整删）')
  }
  const inst = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.genericId === DEF)!
  assert.deepEqual(inst.pins.filter((p) => p.kind === 3).map((p) => [p.index, p.compositePinIndex]), [[0, 47], [1, 48], [2, 89]], '实例 InParam 前移 3→2（cpi 保持）')
  passed++
  console.log('PASS composite del-input（case4：def/compositePins/实例/重编号逐字节）')
}

{
  // case5（连续删，跨轮墓碑）：工具无会话史取最小空闲 3 ≠ 编辑器 6 —— 文档边界，断言工具行为
  const dir = `${EVIDENCE}/composite-del-param-case5-v63-v64/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const DEF = 1610612744
  assert.equal(chooseMovedIndex(graphBlob(before, GID), 5), 3, '工具取 3（编辑器 6，跨轮墓碑文档边界）')
  const target = flowMetas(defBlob(before, DEF)).find((m) => m.kind === 3 && m.shell === 2)!
  assert.equal(target.pinIndex, 89)
  let patched = patchRecord(before, 2, DEF, (b) => delParamFlow(b, 3, 2))
  patched = patchRecord(patched, 4, DEF, (b) => delCompositePin(b, 3, 2))
  patched = patchGraphNode(patched, GID, 5, (n) => delInstanceCompositePin(n, 3, 2, target.pinIndex!))
  patched = patchRecord(patched, 1, GID, (b) => renumberGraphNode(b, 5, chooseMovedIndex(graphBlob(before, GID), 5)))
  // def/impl 逐字节一致；宿主图除重编号外一致（工具 n3 vs 编辑器 n6）
  assert.equal(sha256(defBlob(patched, DEF)), sha256(defBlob(after, DEF)), 'case5 def')
  {
    const payload = patched.slice(20, -4)
    const impl = payload.subarray(locateBlobField(payload, 4, DEF).dataStart, locateBlobField(payload, 4, DEF).dataEnd)
    const apayload = after.slice(20, -4)
    const aimpl = apayload.subarray(locateBlobField(apayload, 4, DEF).dataStart, locateBlobField(apayload, 4, DEF).dataEnd)
    assert.equal(sha256(impl), sha256(aimpl), 'case5 impl')
  }
  const mine = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.genericId === DEF)!
  const editor = parseGraphNodes(graphBlob(after, GID)).find((n) => n.genericId === DEF)!
  assert.deepEqual(mine.pins, editor.pins, 'case5 实例 pins 一致（仅 nodeIndex 差异）')
  passed++
  console.log('PASS composite del-input case5（def/impl/pins 逐字节；重编号跨轮墓碑 = 文档边界）')
}

// ===== 复合换位（swap-inputs-case8 v29→v30 闭合）=====

{
  const dir = `${EVIDENCE}/composite-case8-swap-inputs-v29-v30/raw`
  const before = read(`${dir}/before.gil`)
  const after = read(`${dir}/after.gil`)
  const DEF = 1610612744
  // 工具重编号取最小空闲 3（3-6 为跨轮墓碑）≠ 编辑器 8 —— 文档边界；def/impl/pins 仍逐字节
  assert.equal(chooseMovedIndex(graphBlob(before, GID), 7), 3, '工具取 3（编辑器 8，跨轮墓碑文档边界）')
  let patched = patchRecord(before, 2, DEF, (b) => swapParamFlows(b, 3, 0, 1))
  patched = patchRecord(patched, 4, DEF, (b) => swapCompositePinInners(b, 3, 0, 1))
  patched = patchGraphNode(patched, GID, 7, (n) => swapInstancePins(n, 3, 0, 1))
  assert.equal(sha256(defBlob(patched, DEF)), sha256(defBlob(after, DEF)), 'swap def（内容互换 + field3 重写）')
  {
    const payload = patched.slice(20, -4)
    const impl = payload.subarray(locateBlobField(payload, 4, DEF).dataStart, locateBlobField(payload, 4, DEF).dataEnd)
    const apayload = after.slice(20, -4)
    const aimpl = apayload.subarray(locateBlobField(apayload, 4, DEF).dataStart, locateBlobField(apayload, 4, DEF).dataEnd)
    assert.equal(sha256(impl), sha256(aimpl), 'swap impl（outer 不动、inner 互换）')
  }
  // 实例 node 7 的 pins 交换（shell 身份重写）后与 after 的 node 8 一致
  const mine = parseGraphNodes(graphBlob(patched, GID)).find((n) => n.genericId === DEF)!
  const editor = parseGraphNodes(graphBlob(after, GID)).find((n) => n.genericId === DEF)!
  assert.deepEqual(mine.pins, editor.pins, 'swap 实例 pins（整 pin 互换 + 身份跟随位置）')
  passed++
  console.log('PASS composite swap-input（case8：def/compositePins/实例 pins；重编号跨轮墓碑边界）')
}

console.log(`\n${passed} tests passed`)
