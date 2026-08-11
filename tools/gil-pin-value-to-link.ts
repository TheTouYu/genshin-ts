// @ts-nocheck
/**
 * Fixed 节点 value pin → 数据连线转换（2026-08-12 bind-hold 复盘正式化）。
 *
 * 背景：CLI `link` 对"已有 value 无 connects"的 Fixed InParam 是**静默 no-op**
 * （linkInParam 只替换已有 f5；没有 f5 就什么都不做也不报错，graph_edit.ts:689）。
 * 真实 wire 规则"值/连线二选一"（setParam 清 connects；反过来需要删 f3 写 f5）。
 * 上一轮（eval-bindhold）自写临时脚本 rewire_ip3.ts 处理 668 IP3 固定坐标→动态连线，
 * 本次收编为通用工具。
 *
 * 用法:
 *   npx tsx tools/gil-pin-value-to-link.ts <in.gil> <out.gil> <graphId> \
 *       --fix <nodeIdx> <shell> <srcNode> [srcShell] ...
 *   graphId 可为 impl 图（section 4 自动探测）；srcShell 默认 0（OutParam[0]）。
 *
 * 示例（Bind impl 1610710002：668 n2/n4/n6/n8 的 IP3 ← 减法节点 n10/n15/n16/n17）:
 *   npx tsx tools/gil-pin-value-to-link.ts s6.gil s7.gil 1610710002 \
 *       --fix 2 3 10 --fix 4 3 15 --fix 6 3 16 --fix 8 3 17
 *
 * 验证: 转换后 read --node 显示 InParam[shell] → srcNode OutParam[0]（无 value）；
 *       与编辑器"连数据线清空 value"行为一致；layout --check 零违规。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseWireMessage, emitWireMessage } from '../src/cli/static_assembly/wire.js'
import { patchGraphNode } from '../src/cli/static_assembly/graph_edit.js'

function usage(exitCode = 0) {
  const text = [
    '用法: tsx tools/gil-pin-value-to-link.ts <in.gil> <out.gil> <graphId> --fix <nodeIdx> <shell> <srcNode> [srcShell]',
    '  --fix 可重复；graphId 可为 impl 图（section 4）；srcShell 默认 0=OutParam[0]',
    '示例: tsx tools/gil-pin-value-to-link.ts s6.gil s7.gil 1610710002 --fix 2 3 10 --fix 4 3 15'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](text)
  process.exit(exitCode)
}

const args = process.argv.slice(2)
if (args.length < 5 || args.includes('-h') || args.includes('--help')) usage(args.length < 5 ? 1 : 0)
const [inFile, outFile, graphIdStr] = args
const graphId = Number(graphIdStr)
if (!Number.isInteger(graphId)) throw new Error(`[error] graphId must be integer: ${graphIdStr}`)

const fixes: Array<[number, number, number, number]> = []
let i = 3
while (i < args.length) {
  if (args[i] !== '--fix') throw new Error(`[error] unexpected arg: ${args[i]}`)
  const v = [args[i + 1], args[i + 2], args[i + 3], args[i + 4]].map(Number)
  if (!v.slice(0, 3).every(Number.isInteger))
    throw new Error(`[error] --fix needs: <nodeIdx> <shell> <srcNode> [srcShell]`)
  fixes.push([v[0], v[1], v[2], Number.isInteger(v[3]) ? v[3] : 0])
  i += 4
}

function connectWire(id: number, kind: number, index?: number): Uint8Array {
  const ref = (() => {
    const f: Array<{ number: number; wire: 0 | 2; value: number | Uint8Array }> = [{ number: 1, wire: 0, value: kind }]
    if (index !== undefined && index !== 0) f.push({ number: 2, wire: 0, value: index })
    return emitWireMessage(f)
  })()
  return emitWireMessage([
    { number: 1, wire: 0, value: id },
    { number: 2, wire: 2, value: ref },
    { number: 3, wire: 2, value: ref }
  ])
}

function isPin(pin: Uint8Array, shell: number): boolean {
  const pf = parseWireMessage(pin) ?? []
  const i1 = pf.find((x) => x.number === 1 && x.wire === 2)
  if (!i1) return false
  const idx = parseWireMessage(i1.value as Uint8Array) ?? []
  return idx.find((x) => x.number === 1)?.value === 3 && (idx.find((x) => x.number === 2)?.value ?? 0) === shell
}

let bytes = readFileSync(inFile)
for (const [nodeIdx, shell, srcNode, srcShell] of fixes) {
  bytes = patchGraphNode(bytes, graphId, nodeIdx, (node) => {
    const nf = parseWireMessage(node)
    if (!nf) throw new Error('[error] node unparseable')
    let done = false
    const next = nf.map((f) => {
      if (f.number !== 4 || f.wire !== 2 || !isPin(f.value as Uint8Array, shell)) return f
      done = true
      // 删 value(f3) + 旧 connects(f5)，写新 connects（与编辑器"连线清空值"一致）
      const pf = (parseWireMessage(f.value as Uint8Array) ?? []).filter(
        (x) => !(x.number === 3 && x.wire === 2) && !(x.number === 5 && x.wire === 2)
      )
      pf.push({ number: 5, wire: 2, value: connectWire(srcNode, 4, srcShell) })
      pf.sort((a, b) => a.number - b.number)
      return { ...f, value: emitWireMessage(pf) }
    })
    if (!done) throw new Error(`[error] node ${nodeIdx} InParam[${shell}] pin not found`)
    return emitWireMessage(next)
  }, 4)
}
writeFileSync(outFile, bytes)
console.log(`written ${outFile}: graph=${graphId} fixes=${fixes.length}`)
for (const [n, s, src, ss] of fixes) console.log(`  n${n} InParam[${s}] ← n${src} OutParam[${ss}]（value 已清）`)
