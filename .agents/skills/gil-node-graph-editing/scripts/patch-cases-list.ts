/**
 * patch-cases-list: 写入 MultiBranch 节点 cases 列表值（IntegerList）
 *
 * 用法:
 *   npx tsx .agents/skills/gil-node-graph-editing/scripts/patch-cases-list.ts \
 *     <map.gil> <graphId> <nodeIndex> <v1,v2,...> [--output <候选.gil>] [--write]
 *
 * 行为:
 *   - 只改目标节点 InParam[1]（cases）的 value bytes，其余记录逐字节保留
 *   - 无 --output/--write 时打印 preview
 *   - --write: 先校验源 hash 未变 → 备份到 .gsts/backups/ → 写回 → 打印 backup=/written=
 *
 * 编码依据（2026-08-09 tab-input-multibranch 快照闭合）:
 *   cases value = ConcreteBase{1:10000, 2:1, 110:{2:{1:10002(ArrayBase), 2:1,
 *     4:{1:1,6:{2:8}}, 109:[entries], 4:8}}}（字段号以 parseWireMessage 为准）
 *   条目 = {1:2, 2:1, 4:{1:1,6:{2:3}}, 102:{1:val}}，102=IntBaseValue，val 在字段 1
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname, basename, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { parseWireMessage, emitWireMessage } from '../../../../src/cli/static_assembly/wire.js'
import { patchGraphNode, setParam, locateGraphField } from '../../../../src/cli/static_assembly/graph_edit.js'

function sha256(b: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(b)).digest('hex')
}

function main(): void {
  const args = process.argv.slice(2)
  const gil = args[0]
  const graphId = Number(args[1])
  const nodeIndex = Number(args[2])
  const values = (args[3] ?? '').split(',').map((s) => Number(s.trim()))
  if (!gil || !Number.isFinite(graphId) || !Number.isFinite(nodeIndex) || values.some((v) => !Number.isFinite(v))) {
    console.error('usage: patch-cases-list <map.gil> <graphId> <nodeIndex> <v1,v2,...> [--output <cand.gil>] [--write]')
    process.exit(1)
  }
  const outIdx = args.indexOf('--output')
  const output = outIdx >= 0 ? args[outIdx + 1] : undefined
  const write = args.includes('--write')
  if (output && write) throw new Error('[error] --output and --write are mutually exclusive')

  const source = new Uint8Array(readFileSync(gil))
  const sourceSha = sha256(source)
  const result = patchGraphNode(source, graphId, nodeIndex, (node) => {
    const nodeFields = parseWireMessage(node)
    if (!nodeFields) throw new Error('[error] node unparseable')
    const pinField = nodeFields.find((f) => f.number === 4 && f.wire === 2 && isCasesPin(f.value as Uint8Array))
    if (!pinField) throw new Error(`[error] node ${nodeIndex} has no InParam[1] (cases) pin`)
    const pin = parseWireMessage(pinField.value as Uint8Array)!
    const vf = pin.find((x) => x.number === 3 && x.wire === 2)
    if (!vf) throw new Error('[error] cases pin has no value')
    const v = parseWireMessage(vf.value as Uint8Array)!
    const l1 = v.find((x) => x.wire === 2 && x.number === 110)
    if (!l1) throw new Error('[error] cases value has no f110')
    const l1m = parseWireMessage(l1.value as Uint8Array)!
    const l2 = l1m.find((x) => x.wire === 2 && x.number === 2)
    if (!l2) throw new Error('[error] f110 has no f2')
    const l2m = parseWireMessage(l2.value as Uint8Array)!
    const arr = l2m.find((x) => x.wire === 2 && x.number === 109)
    if (!arr) throw new Error('[error] ArrayBase has no bArray(109)')
    const entries = parseWireMessage(arr.value as Uint8Array)!
    const entryList = entries.filter((x) => x.wire === 2 && x.number === 1)
    if (entryList.length === 0) throw new Error('[error] cases list empty; cannot clone entry template')
    const template = parseWireMessage(entryList[0].value as Uint8Array)!
    // 替换语义：只用第一条作模板，新列表 = values 全量生成（幂等）
    const newEntries = emitWireMessage(values.map((val) => ({
        number: 1,
        wire: 2,
        value: emitWireMessage(template.map((x) =>
          x.number === 102 && x.wire === 2
            ? { ...x, value: emitWireMessage([{ number: 1, wire: 0, value: val }]) }
            : x
        ))
      })))
    const newL2 = emitWireMessage(l2m.map((x) => (x.number === 109 && x.wire === 2 ? { ...x, value: newEntries } : x)))
    const newL1 = emitWireMessage(l1m.map((x) => (x.number === 2 && x.wire === 2 ? { ...x, value: newL2 } : x)))
    const newV = emitWireMessage(v.map((x) => (x.number === 110 && x.wire === 2 ? { ...x, value: newL1 } : x)))
    const newPin = emitWireMessage(pin.map((x) => (x.number === 3 && x.wire === 2 ? { ...x, value: newV } : x)))
    return emitWireMessage(nodeFields.map((f) => (f === pinField ? { number: 4, wire: 2, value: newPin } : f)))
  })

  if (output) {
    const abs = resolve(output)
    if (exists(abs)) throw new Error(`[error] output already exists: ${abs}`)
    writeFileSync(abs, result)
    console.log(`written=${abs}`)
  } else if (write) {
    const nowSha = sha256(new Uint8Array(readFileSync(gil)))
    if (nowSha !== sourceSha) throw new Error('[error] source GIL changed since read; aborting write')
    const backupDir = resolve(dirname(gil), '.gsts', 'backups')
    mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = resolve(backupDir, `${basename(gil)}.${stamp}.cases-list.bak`)
    copyFileSync(gil, backup)
    writeFileSync(gil, result)
    console.log(`backup=${backup}`)
    console.log(`written=${gil}`)
  } else {
    console.log(`preview=${gil} graph=${graphId} node=${nodeIndex} cases=[${values.join(',')}]`)
  }
  console.log(`sourceSha256=${sourceSha} resultSha256=${sha256(result)} size=${source.length}->${result.length}`)
}

function isCasesPin(b: Uint8Array): boolean {
  const f = parseWireMessage(b)
  if (!f) return false
  const i1 = f.find((x) => x.number === 1 && x.wire === 2)
  if (!i1) return false
  const idx = parseWireMessage(i1.value as Uint8Array)!
  return idx.find((x) => x.number === 1)?.value === 3 && (idx.find((x) => x.number === 2)?.value ?? 0) === 1
}

function exists(p: string): boolean {
  try { readFileSync(p); return true } catch { return false }
}

main()
