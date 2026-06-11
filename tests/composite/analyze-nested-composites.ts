import { readFileSync, writeFileSync } from 'fs'
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL('../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname

const file = process.argv[2]
if (!file) { console.error('用法: npx tsx explore-nested.ts <path-to-gia>'); process.exit(1) }

const ref = decode_gia_file(file, PROTO_PATH)
const km: Record<number,string> = {0:'Unk',1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam',5:'CliExec',6:'CliSignal'}

// 建立 composite/signal def 索引
const defById = new Map<number, any>()
for (const acc of ref.accessories ?? []) {
  if (acc.which === 12 || acc.which === 13) {
    const def = acc.compositeDef?.inner?.def
    if (def) {
      defById.set(acc.id?.id ?? 0, {
        name: def.name,
        inflows: def.inflows?.length ?? 0,
        outflows: def.outflows?.length ?? 0,
        inputs: def.inputs?.length ?? 0,
        outputs: def.outputs?.length ?? 0,
        inPinIndexes: (def.inputs ?? []).map((i: any) => i.pinIndex),
        outPinIndexes: (def.outputs ?? []).map((i: any) => i.pinIndex),
        outflowPinIndexes: (def.outflows ?? []).map((i: any) => i.pinIndex),
        inflowPinIndex: def.inflows?.[0]?.pinIndex,
      })
    }
  }
  if (acc.which === 14) {
    const sdef = acc.signalDef?.inner?.def
    if (sdef) {
      defById.set(acc.id?.id ?? 0, {
        name: sdef.name,
        isSignal: true,
        inflows: sdef.inflows?.length ?? 0,
        outflows: sdef.outflows?.length ?? 0,
        inputs: sdef.inputs?.length ?? 0,
        outputs: sdef.outputs?.length ?? 0,
        inPinIndexes: (sdef.inputs ?? []).map((i: any) => i.pinIndex),
        outPinIndexes: (sdef.outputs ?? []).map((i: any) => i.pinIndex),
        outflowPinIndexes: (sdef.outflows ?? []).map((i: any) => i.pinIndex),
      })
    }
  }
}

console.log('=== 嵌套复合分析: ' + file.split('/').pop() + ' ===')
console.log('总 accessory: ' + (ref.accessories?.length ?? 0))
console.log('已索引 def: ' + defById.size)

// 统计分类
const nestedNodes: any[] = []

for (let ai = 0; ai < (ref.accessories ?? []).length; ai++) {
  const acc = ref.accessories![ai]
  const g = acc.graph?.inner?.graph
  if (!g) continue

  for (const n of g.nodes ?? []) {
    if ((n.genericId as any)?.kind !== 22001) continue

    const gid = n.genericId as any
    const def = defById.get(gid?.nodeId)

    const pins = (n.pins ?? []).map((p: any) => ({
      kind: p.i1?.kind ?? 0,
      kindName: km[p.i1?.kind] ?? '?',
      index: p.i1?.index ?? 0,
      cpi: p.compositePinIndex ?? 0,
      hasConnects: (p.connects?.length ?? 0) > 0,
      connectTargets: (p.connects ?? []).map((c: any) => c.id + ':' + km[c.connect?.kind] + ':' + c.connect?.index)
    }))

    // 判断此 pin 是否有对应的 compositePin
    const compositePins = (g.compositePins ?? []).filter((cp: any) => cp.innerNodeId === n.nodeIndex)
    const cpKinds = new Set(compositePins.map((cp: any) => km[cp.innerPin?.kind]))

    nestedNodes.push({
      nodeIndex: n.nodeIndex,
      compositeId: gid?.nodeId,
      compositeName: def?.name ?? '?',
      isSignal: def?.isSignal ?? false,
      isExec: (def?.inflows ?? 0) > 0,
      inflows: def?.inflows ?? 0,
      outflows: def?.outflows ?? 0,
      inputs: def?.inputs ?? 0,
      outputs: def?.outputs ?? 0,
      pins,
      compositePinsKinds: [...cpKinds],
      accIndex: ai,
      parentName: (() => {
        const defAcc = ref.accessories![ai % 2 === 1 ? ai - 1 : ai + 1]
        return defAcc?.compositeDef?.inner?.def?.name ?? defAcc?.signalDef?.inner?.def?.name ?? '?'
      })(),
    })
  }
}

// === 统计 ===
console.log('\n总共 kind=22001 节点: ' + nestedNodes.length)

// 按 exec/数据分类
const execNodes = nestedNodes.filter(n => n.isExec)
const dataNodes = nestedNodes.filter(n => !n.isExec)
const signalNodes = nestedNodes.filter(n => n.isSignal)
console.log('Exec 型: ' + execNodes.length + ', 纯数据型: ' + dataNodes.length + ', 信号型: ' + signalNodes.length)

// Pin 统计
const execWithPins = execNodes.filter(n => n.pins.length > 0)
const execWith0Pins = execNodes.filter(n => n.pins.length === 0)
console.log('\nExec 型: ' + execWithPins.length + ' 个有 pin, ' + execWith0Pins.length + ' 个 0 pin')

// 按 pin 种类统计
const pinKindStats = new Map<string, number>()
const zeroPinExecNames = new Set(execWith0Pins.map(n => n.compositeName))
for (const n of nestedNodes) {
  for (const p of n.pins) {
    const key = p.kindName
    pinKindStats.set(key, (pinKindStats.get(key) ?? 0) + 1)
  }
}
console.log('Pin 种类分布:', Object.fromEntries(pinKindStats))
if (zeroPinExecNames.size > 0) console.log('0-pin exec 复合:', [...zeroPinExecNames])

// Exec 复合的 InParam 模式
console.log('\n--- Exec 复合 InParam 编码模式 ---')
let fullInParamCount = 0, partialInParamCount = 0, noInParamCount = 0
for (const n of execNodes) {
  const inParamPins = n.pins.filter((p: any) => p.kindName === 'InParam')
  if (n.inputs === 0) continue // 无输入
  if (inParamPins.length === n.inputs) fullInParamCount++
  else if (inParamPins.length > 0) { partialInParamCount++; console.log('  部分 InParam: n[' + n.nodeIndex + '] "' + n.compositeName + '" 有' + inParamPins.length + '/' + n.inputs + ' InParam, pins=' + JSON.stringify(n.pins.map((p: any) => p.kindName + ':' + p.index + ' cpi=' + p.cpi))) }
  else { noInParamCount++; console.log('  无 InParam: n[' + n.nodeIndex + '] "' + n.compositeName + '" exec(' + n.inflows + '/' + n.outflows + ' out) inputs=' + n.inputs + ', pins=' + JSON.stringify(n.pins.map((p: any) => p.kindName + ':' + p.index + ' cpi=' + p.cpi))) }
}
console.log('  全量 InParam: ' + fullInParamCount + ', 部分: ' + partialInParamCount + ', 零: ' + noInParamCount)

// Exec 复合的 OutFlow 模式
console.log('\n--- Exec 复合 OutFlow 编码模式 ---')
let fullOutflowCount = 0, partialOutflowCount = 0, noOutflowCount = 0
for (const n of execNodes) {
  const ofPins = n.pins.filter((p: any) => p.kindName === 'OutFlow')
  if (n.outflows === 0) { noOutflowCount++; continue }
  if (ofPins.length === n.outflows) fullOutflowCount++
  else if (ofPins.length > 0) partialOutflowCount++
  else noOutflowCount++
  
  if (ofPins.length > 0 && ofPins.length !== n.outflows) {
    console.log('  部分 OutFlow: n[' + n.nodeIndex + '] "' + n.compositeName + '" ' + ofPins.length + '/' + n.outflows + ' OutFlows: ' + JSON.stringify(ofPins.map((p: any) => ({idx: p.index, cpi: p.cpi, hasCs: p.hasConnects}))))
  }
}
console.log('  全量: ' + fullOutflowCount + ', 部分: ' + partialOutflowCount + ', 零: ' + noOutflowCount)

// CliExec 模式
console.log('\n--- ClientExecNode (kind=5) 出现模式 ---')
const cliExecNodes = nestedNodes.filter(n => n.pins.some((p: any) => p.kind === 5))
console.log('  共 ' + cliExecNodes.length + ' 个节点有 ClientExecNode pin')
for (const n of cliExecNodes) {
  const ce = n.pins.find((p: any) => p.kind === 5)
  console.log('  n[' + n.nodeIndex + '] "' + n.compositeName + '" isSignal=' + n.isSignal + ' exec=' + n.isExec + ' cpi=' + ce.cpi + ' parent=' + n.parentName)
}

// 纯数据复合 pin 检查
const dataWithPins = dataNodes.filter(n => n.pins.length > 0)
console.log('\n--- 纯数据复合 pin 检查 ---')
console.log('  纯数据复合总数: ' + dataNodes.length + ', 有 pin 的: ' + dataWithPins.length)
for (const n of dataWithPins) {
  console.log('  n[' + n.nodeIndex + '] "' + n.compositeName + '" pins=' + JSON.stringify(n.pins.map((p: any) => p.kindName + ':' + p.index + ' cpi=' + p.cpi + (p.hasConnects ? ' CONNECTED' : ''))))
}

// OutParam 检查（所有类型）
console.log('\n--- OutParam (kind=4) 在嵌套节点上的出现 ---')
const outParamNodes = nestedNodes.filter(n => n.pins.some((p: any) => p.kind === 4))
console.log('  有 OutParam pin 的节点: ' + outParamNodes.length)
for (const n of outParamNodes) {
  const op = n.pins.filter((p: any) => p.kind === 4)
  console.log('  n[' + n.nodeIndex + '] "' + n.compositeName + '" exec=' + n.isExec + ': ' + JSON.stringify(op.map((p: any) => ({idx: p.index, cpi: p.cpi, hasCs: p.hasConnects}))))
}

// InFlow 检查
console.log('\n--- InFlow (kind=1) 在嵌套节点上的出现 ---')
const inFlowNodes = nestedNodes.filter(n => n.pins.some((p: any) => p.kind === 1))
console.log('  有 InFlow pin 的节点: ' + inFlowNodes.length)
for (const n of inFlowNodes) {
  console.log('  n[' + n.nodeIndex + '] "' + n.compositeName + '" exec=' + n.isExec + ': ' + JSON.stringify(n.pins.filter((p: any) => p.kind === 1).map((p: any) => p.index)))
}

// OutParam 通过 compositePins 的模式
console.log('\n--- OutParam compositePins 映射 ---')
for (const n of nestedNodes) {
  const outParamCPs = n.compositePinsKinds.filter(k => k === 'OutParam')
  if (outParamCPs.length > 0) {
    const hasOutParamPin = n.pins.some((p: any) => p.kind === 4)
    if (!hasOutParamPin) {
      // OutParam 仅通过 compositePins，节点上无 pin
      // console.log('  n[' + n.nodeIndex + '] "' + n.compositeName + '": ' + outParamCPs.length + ' OutParam via compositePins only')
    }
  }
}

// 边缘 case：相同 composite 多次实例化
console.log('\n--- 同 composite 多实例 ---')
const idCounts = new Map<number, number>()
for (const n of nestedNodes) idCounts.set(n.compositeId, (idCounts.get(n.compositeId) ?? 0) + 1)
const multiInstance = [...idCounts.entries()].filter(([_, c]) => c > 1).sort((a, b) => b[1] - a[1])
for (const [id, count] of multiInstance.slice(0, 15)) {
  const instances = nestedNodes.filter(n => n.compositeId === id)
  const pinCounts = instances.map(n => n.pins.length)
  const allSame = new Set(pinCounts).size === 1
  console.log('  "' + instances[0].compositeName + '" (id=' + id + '): ' + count + ' 实例, pins=' + pinCounts.join(',') + (allSame ? '' : ' ← 不一致!'))
}

// Unknown kind (0) pins
console.log('\n--- Unknown kind=0 pins ---')
const unkNodes = nestedNodes.filter(n => n.pins.some((p: any) => p.kind === 0))
console.log('  共 ' + unkNodes.length + ' 个节点有 kind=0 pin')
for (const n of unkNodes.slice(0, 10)) {
  const up = n.pins.filter((p: any) => p.kind === 0)
  console.log('  n[' + n.nodeIndex + '] "' + n.compositeName + '" isSignal=' + n.isSignal + ': ' + JSON.stringify(up.map((p: any) => ({idx: p.index, cpi: p.cpi}))))
}
