/**
 * 解析 .gia 文件里全部节点图（which=9/11，payload 在 f13）的节点类型构成。
 *
 * 背景：decode-gia.ts 只保留 Root.f1 的最后一个 GraphUnit（protobuf 单数语义），
 * 且素材/.gia 的 which=9 图在 f13（NodeGraphWrapper）——本项目 explain 工具只接受 .gil。
 * 本工具遍历 Root.f1/f2 全部单元，用 protobufjs 解 f13，并用 vendor NODE_PIN_RECORDS
 * 把 genericId.nodeId 映射为节点显示名。
 *
 * 用法:
 *   npx tsx tools/parse-gia-graphs.ts <file.gia> [--filter <含>>] [--summary]
 *     --filter  只显示名称含该子串的图（图名或单元名）
 *     --summary 只输出每张图的节点类型计数（不输出逐节点）
 *     --nodes   输出逐节点明细（默认）
 *   -h, --help
 *
 * 只读工具：不修改任何输入文件。
 * 试点样本：千星音乐播放器元件版（MP-悬浮交互页 159 节点构成 2026-08-27）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import proto from 'protobufjs'

import { parseWireMessage } from '../src/cli/static_assembly/wire.js'
import { NODE_PIN_RECORDS } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'

const PROTO =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log('用法: npx tsx tools/parse-gia-graphs.ts <file.gia> [--filter <子串>] [--summary|--nodes]')
    process.exit(args.length === 0 ? 1 : 0)
  }
  const file = args[0]
  const filterIdx = args.indexOf('--filter')
  const filter = filterIdx >= 0 ? args[filterIdx + 1] : undefined
  const summary = args.includes('--summary')

  const nameById = new Map<number, string>()
  for (const rec of NODE_PIN_RECORDS) {
    if (typeof rec.id === 'number' && rec.name) nameById.set(rec.id, rec.name)
  }

  const bytes = readFileSync(file)
  const top = parseWireMessage(bytes.subarray(20, bytes.length - 4))
  if (!top) throw new Error('[error] malformed GIA payload')

  const root = new proto.Root().loadSync(path.resolve(PROTO), { keepCase: true })
  const Wrapper = root.lookupType('NodeGraphWrapper')

  let graphCount = 0
  for (const f of top) {
    if (f.wire !== 2 || (f.number !== 1 && f.number !== 2)) continue
    const unit = parseWireMessage(f.value as Uint8Array)
    if (!unit) continue
    const which = unit.find((x) => x.number === 5 && x.wire === 0)?.value as number | undefined
    if (which !== 9 && which !== 11) continue
    const nameField = unit.find((x) => x.number === 3 && x.wire === 2)
    const unitName = nameField ? Buffer.from(nameField.value as Uint8Array).toString('utf8') : ''
    const f13 = unit.find((x) => x.number === 13 && x.wire === 2)
    if (!f13) continue
    const wrapper = Wrapper.decode(f13.value as Uint8Array) as {
      inner?: { graph?: { name?: string; nodes?: { nodeIndex?: number; genericId?: { nodeId?: number }; concreteId?: { nodeId?: number } }[] } }
    }
    const graph = wrapper?.inner?.graph
    if (!graph) continue
    if (filter && !graph.name?.includes(filter) && !unitName.includes(filter)) continue
    graphCount++
    const nodes = graph.nodes ?? []
    console.log('== 图:', graph.name, '(' + nodes.length + ' 节点)')
    if (summary) {
      const counts = new Map<string, number>()
      for (const n of nodes) {
        const gid = n.genericId?.nodeId
        const nm = nameById.get(gid ?? -1) ?? '???' + '(' + gid + ')'
        counts.set(nm, (counts.get(nm) ?? 0) + 1)
      }
      for (const [nm, cnt] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log('   ' + String(cnt).padStart(3) + '  ' + nm)
      }
    } else {
      for (const n of nodes) {
        const gid = n.genericId?.nodeId
        const cid = n.concreteId?.nodeId
        const nm = nameById.get(gid ?? -1) ?? '???' + '(' + gid + ')'
        console.log('   n' + n.nodeIndex + ' ' + nm + (cid !== undefined ? ' con=' + cid : ''))
      }
    }
  }
  if (graphCount === 0) console.log('(无匹配节点图)')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}

