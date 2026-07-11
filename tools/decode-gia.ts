/**
 * 解码 GIA 文件并输出完整 JSON。
 * 配合 jq 使用: npx tsx tools/decode-gia.ts <file.gia> | jq '.'
 *
 * 常用 jq 查询:
 *   # 查看所有 CompositeDef 名称
 *   npx tsx tools/decode-gia.ts <file> 2>/dev/null | jq '[.accessories[] | select(.which==12).name]'
 *
 *   # 查看第一个 CompositeDef 的完整定义
 *   npx tsx tools/decode-gia.ts <file> 2>/dev/null | jq '.accessories[] | select(.which==12) | .compositeDef.inner.def'
 *
 *   # 查看主图节点
 *   npx tsx tools/decode-gia.ts <file> 2>/dev/null | jq '.graph.graph.inner.graph.nodes[]'
 *
 *   # 查看特定 CompositeDef 的 compositePins
 *   npx tsx tools/decode-gia.ts <file> 2>/dev/null | jq '.accessories[] | select(.which==9) | .graph.inner.graph.compositePins'
 *
 *   # 统计 accessories 类型分布
 *   npx tsx tools/decode-gia.ts <file> 2>/dev/null | jq '[.accessories[].which] | sort | unique | map({which: ., count: [.accessories[] | select(.which==.)] | length})'
 */
import { readFileSync, writeFileSync } from 'node:fs'

import { decode_gia_file } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.ts'

function printHelp() {
  console.log(`用法: npx tsx tools/decode-gia.ts [选项] <file.gia>

选项:
  -c, --compact       输出单行 JSON
  --check-header      校验 GIA 文件头和尾部
  -o, --output <file> 将 JSON 写入文件，而不是 stdout
  -h, --help          显示帮助

file.gia 可以使用 - 从 stdin 读取。stdout 始终只包含 JSON，诊断信息写入 stderr。`)
}

function fail(message: string): never {
  console.error(`decode-gia: ${message}`)
  process.exit(1)
}

function unwrapStdin(data: Uint8Array, checkHeader: boolean): Uint8Array {
  if (data.byteLength < 24) fail('stdin 数据不是完整 GIA 文件')

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const leftSize = view.getUint32(0, false)
  const schemaVersion = view.getUint32(4, false)
  const headTag = view.getUint32(8, false)
  const fileType = view.getUint32(12, false)
  const protoSize = view.getUint32(16, false)
  const tailTag = view.getUint32(data.byteLength - 4, false)
  const valid = leftSize === data.byteLength - 4 &&
    schemaVersion === 1 && headTag === 0x0326 && fileType === 3 &&
    protoSize === data.byteLength - 24 && tailTag === 0x0679

  if (!valid) fail('stdin 数据不是有效的 GIA 容器')
  if (checkHeader) console.error('Gia file header Check Pass!')
  return data.slice(20, -4)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    return
  }

  let compact = false
  let checkHeader = false
  let output: string | undefined
  let file: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-c' || arg === '--compact') compact = true
    else if (arg === '--check-header') checkHeader = true
    else if (arg === '-o' || arg === '--output') output = args[++i] ?? fail(`${arg} 需要一个路径`)
    else if (arg.startsWith('-') && arg !== '-') fail(`未知选项: ${arg}`)
    else if (file === undefined) file = arg
    else fail(`多余参数: ${arg}`)
  }

  if (file === undefined) fail('缺少输入文件；使用 --help 查看用法')

  try {
    const input = file === '-' ? unwrapStdin(new Uint8Array(readFileSync(0)), checkHeader) : file
    const originalInfo = console.info
    console.info = console.error
    let decoded
    try {
      decoded = decode_gia_file(input, undefined, file === '-' ? false : checkHeader)
    } finally {
      console.info = originalInfo
    }
    const json = JSON.stringify(decoded, null, compact ? 0 : 2) + '\n'

    if (output) writeFileSync(output, json)
    else process.stdout.write(json)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

void main()
