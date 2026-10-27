// 空登记表 f50 的解析/自举单测（2026-10-27）：编辑器保存过、但从未导入过脚本的图，
// 顶层 f50 内容就是**空容器** `{f2:1}`（真图 1073741827 实证）。修复前 parse/register
// 都会误报 `script registry wrapper has no inner f50`，导致这类真图上登记链完全无法自举。
// 运行：npx tsx tests/gil_scripts_empty_registry.ts   （纯内存，不读真图、不写盘）
import {
  parseScriptRegistry,
  registerScriptInPayload,
  SCRIPT_PATH_PREFIX
} from '../src/cli/gil_scripts.js'
import { emitWireMessage, parseWireMessage } from '../src/cli/static_assembly/wire.js'

let failed = 0
function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) failed++
}

// 编辑器空登记表形态：顶层 f50(wire2) → 容器 {f2: 1}（无 f1 条目）
const emptyRegistry = emitWireMessage([
  { number: 9, wire: 2, value: emitWireMessage([{ number: 501, wire: 0, value: 1 }]) },
  { number: 50, wire: 2, value: emitWireMessage([{ number: 2, wire: 0, value: 1 }]) }
])

// ① 解析不抛错、返回空表
let parsed: ReturnType<typeof parseScriptRegistry> | null = null
try {
  parsed = parseScriptRegistry(emptyRegistry)
} catch (e) {
  check('empty registry parses', false, String(e))
}
check('empty registry parses', parsed !== null, `entries=${parsed?.length ?? 'n/a'}`)
check('empty registry has 0 entries', parsed !== null && parsed.length === 0)

// ② 在空登记表上登记：追加 1 条、保留容器尾字段 f2=1、顶层其它字段字节透传
const source = 'print("[t] hi")\n'
const result = registerScriptInPayload(emptyRegistry, {
  name: 't',
  filePath: 't.lua',
  source
})
check('register guid = FIRST_SCRIPT_GUID', result.entry.guid === 1073741825, `guid=${result.entry.guid}`)
check(
  'register path prefixed',
  result.entry.filePath === `${SCRIPT_PATH_PREFIX}t.lua`,
  result.entry.filePath
)
const roundTrip = parseScriptRegistry(result.payload)
check('registered entry readable', roundTrip.length === 1 && roundTrip[0]!.name === 't')
check('registered source inlined', roundTrip[0]?.source === source)

const top = parseWireMessage(result.payload)!
const container = parseWireMessage(top.find((f) => f.number === 50)!.value as Uint8Array)!
check(
  'container keeps trailing f2=1',
  container.some((f) => f.number === 2 && f.wire === 0 && f.value === 1)
)
check(
  'top-level passthrough kept',
  top.some((f) => f.number === 9 && f.wire === 2)
)

// ③ 无 f50 的图仍在顶层末尾新建登记表（回归：这条路径别被本次修复影响）
const noRegistry = emitWireMessage([{ number: 9, wire: 2, value: emitWireMessage([]) }])
check('no registry parses as empty', parseScriptRegistry(noRegistry).length === 0)
const created = registerScriptInPayload(noRegistry, { name: 'n', filePath: 'n.lua', source })
check('created registry readable', parseScriptRegistry(created.payload).length === 1)

// ④ fail-closed 回归：f50 内容既不是容器（无 f1/f2 字段）也无内层 f50 ⇒ 仍报原错误，
//    避免把「别的语义的 f50」当登记表写坏。
const alienRegistry = emitWireMessage([
  { number: 50, wire: 2, value: emitWireMessage([{ number: 7, wire: 2, value: emitWireMessage([]) }]) }
])
let alienErr = ''
try {
  parseScriptRegistry(alienRegistry)
} catch (e) {
  alienErr = String(e)
}
check('alien f50 still fails closed', alienErr.includes('has no inner f50'), alienErr)

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
