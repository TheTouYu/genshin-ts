// @ts-nocheck
/**
 * 复合 impl 图共享 compositePin 注入（2026-08-12 bind-hold 复盘正式化）。
 *
 * 背景：add-input 只能给每个新接口绑 1 条 inner 映射；"共享映射"（1 个 outer pin
 * 同时供给多个 inner 节点 pin，如 pivot→668 IP1×4、c1→668/99/365 IP0×3）需要直接调
 * graph_edit.addCompositePin。上一轮（eval-bindhold）为此自写临时脚本 inject_cp.ts，
 * 本次收编为通用工具。
 *
 * 用法:
 *   npx tsx tools/inject-composite-pin.ts <in.gil> <out.gil> <implId> \
 *       --pin <outerShell> <innerNode> <innerShell> [outerKind] [innerKind] ...
 *   outerKind/innerKind 默认 3（InParam），可选 1=InFlow 2=OutFlow 4=OutParam
 *
 * 示例（Bind 复合 1610710002，pivot 第 5 条共享 + c1..c4 各 2 条共享）:
 *   npx tsx tools/inject-composite-pin.ts s4.gil s5.gil 1610710002 \
 *       --pin 0 1 0 --pin 1 11 0 --pin 2 12 0 --pin 3 13 0 --pin 4 14 0 \
 *       --pin 1 3 0 --pin 2 5 0 --pin 3 7 0 --pin 4 9 0
 *
 * 验证:
 *   - 注入后 layout --check 零违规；
 *   - 悬空引用 0（注入的 innerNode/innerShell 必须真实存在，否则引擎加载即错）；
 *   - 与真实复合共享映射（pivot×4）字节形态同构：按 (outerKind,outerShell) 升序、
 *     同 outer 相邻插入（addCompositePin 内置排序）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseWireMessage } from '../src/cli/static_assembly/wire.js'
import { patchRecord, addCompositePin, locateGraphField, parseGraphNodes } from '../src/cli/static_assembly/graph_edit.js'

function usage(exitCode = 0) {
  const text = [
    '用法: tsx tools/inject-composite-pin.ts <in.gil> <out.gil> <implId> --pin <outerShell> <innerNode> <innerShell> [outerKind] [innerKind]',
    '  --pin 可重复；outerKind/innerKind 默认 3=InParam（1=InFlow 2=OutFlow 4=OutParam）',
    '示例: tsx tools/inject-composite-pin.ts s4.gil s5.gil 1610710002 --pin 0 1 0 --pin 1 11 0'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](text)
  process.exit(exitCode)
}

const args = process.argv.slice(2)
if (args.length < 4 || args.includes('-h') || args.includes('--help')) usage(args.length < 4 ? 1 : 0)
const [inFile, outFile, implIdStr] = args
const implId = Number(implIdStr)
if (!Number.isInteger(implId)) throw new Error(`[error] implId must be integer: ${implIdStr}`)

const pins: Array<[number, number, number, number, number]> = []
let i = 3
while (i < args.length) {
  if (args[i] !== '--pin') throw new Error(`[error] unexpected arg: ${args[i]}`)
  const base = [Number(args[i + 1]), Number(args[i + 2]), Number(args[i + 3])]
  if (!base.every(Number.isInteger))
    throw new Error(`[error] --pin needs integer args: ${args.slice(i + 1, i + 4).join(' ')}`)
  // 可选：后跟 1-2 个整数则视为 outerKind/innerKind，否则下一个必须是 --pin
  const extra: number[] = []
  let j = i + 4
  while (j < args.length && args[j] !== '--pin' && extra.length < 2) {
    const v = Number(args[j])
    if (!Number.isInteger(v)) throw new Error(`[error] unexpected arg: ${args[j]}`)
    extra.push(v)
    j++
  }
  pins.push([base[0], base[1], base[2], extra[0] ?? 3, extra[1] ?? 3])
  i = j
}

// fail closed：impl 图必须存在，且 inner 节点必须真实存在（否则产出悬空 compositePin）
let bytes = readFileSync(inFile)
const payload = bytes.slice(20, -4)
const loc = locateGraphField(payload, implId)
const nodeIndexes = new Set(parseGraphNodes(payload.subarray(loc.field.dataStart, loc.field.dataEnd)).map((n) => n.index))
for (const [, innerNode] of pins) {
  if (!nodeIndexes.has(innerNode))
    throw new Error(`[error] inner node ${innerNode} not found in impl ${implId} (${[...nodeIndexes].sort((a, b) => a - b).join(',')})`)
}

for (const [outerShell, innerNode, innerShell, outerKind, innerKind] of pins) {
  bytes = patchRecord(bytes, 4, implId, (b) =>
    addCompositePin(b, outerKind, outerShell, innerNode, innerShell, innerKind)
  )
}
writeFileSync(outFile, bytes)
console.log(`written ${outFile}: impl=${implId} pins=${pins.length}`)
for (const p of pins) console.log(`  outer(${p[3]},${p[0]}) → inner n${p[1]} (${p[4]},${p[2]})`)
