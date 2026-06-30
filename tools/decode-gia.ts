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
import { decode_gia_file } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.ts'

async function main() {
  const file = process.argv[2]
  if (!file) { console.error('用法: npx tsx tools/decode-gia.ts <file.gia>'); process.exit(1) }
  // check_header=false 避免 header check log 污染 stdout，方便 pipe 到 jq
  const r = await decode_gia_file(file, undefined, false)
  console.log(JSON.stringify(r, null, 2))
}

main()
