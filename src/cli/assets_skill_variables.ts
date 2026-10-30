// assets:skill-variables —— 技能变量的创建与回读（root15 记录，f2 类型码 30）
//
// 规则来源（真实编辑器相邻差分，2026-10-24，地图 1073741827「真实足球v3」）：
//   证据目录 .scratch/editor-incremental-evidence/2026-10-24-skillvars-1827/
//   before sha=56bab843… (365166B) → after sha=4945c21d… (365187B)，Δ+21B
//   root15 子记录 5→6，新增 28B：
//     1=1207959553（配置 ID，段起点固定、按创建顺延）
//     2=30（资产类型码「技能变量」；对照同图：12=包裹模型 / 26=真实… / 4=玩家 / 28=自定义造物技能）
//     4={1=1, 11={1="技能变量"}}（第一个 4 段 kind=1 带名字 UTF-8；名字默认"技能变量"）
//   **root6 无登记**（同轮唯一 folder 变化是一条无关 400:1082130443 被编辑器回收）；
//   root21 是编辑器侧计数（23 → [23,6401]），与资产必要性无关，本命令不写。
//
// ✅ 2026-10-24 事故已闭合：写回曾被判「存档已损坏」，真因=整文件重建时 **header 两个长度字段**
//   （hdr[0:4]=size-4、hdr[16:20]=payload 长度）停在旧值——root15 记录字节本来就是对的。
//   修复=改用共享 injector/binary.buildFile；验收=实验图 1073741837 写入后编辑器打开正常 + 游玩正常
//   （用户 2026-10-24 14:03 确认），root46/root21/root6 均无需写（后续差分实测只 root15 变）。
//   防线：tools/gil-header-check.py（门禁 gil-header-selftest）+ 本命令写回前的内联不变量断言。
//
// 用法：
//   gsts assets:skill-variables list  --gil <map.gil> [--json]
//   gsts assets:skill-variables create --gil <map.gil> --id 1207959553 --name kit_a [--output cand.gil | --write]

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { buildFile, readUint32BE } from '../injector/binary.js'
import { resolveGilTarget, saveLevelDirOf, syncGilToTemp } from './gil_paths.js'
import type { GstsInjectConfig } from '../compiler/gsts_config.js'
import { emitWireMessage, parseWireMessage, printableWireText, type WireField } from './static_assembly/wire.js'

export const SKILL_VARIABLE_TYPE_CODE = 30
/** 技能变量配置 ID 段起点（官方固定；数量按地图而异） */
export const SKILL_VARIABLE_ID_BASE = 1207959553

export type SkillVariableView = { id: number; name: string }

function u8(value: unknown): Uint8Array {
  return value as Uint8Array
}

function innerOf(record: WireField): WireField[] {
  const parsed = parseWireMessage(u8(record.value))
  return parsed ?? []
}

function varintAt(fields: readonly WireField[], number: number): number | undefined {
  const hit = fields.find((f) => f.number === number && f.wire === 0)
  return hit ? Number(hit.value) : undefined
}

function recordsOfRoot(payload: Uint8Array, rootN: number): WireField[] {
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
  const container = root.find((f) => f.number === rootN && f.wire === 2)
  if (!container) return []
  return innerOf(container).filter((f) => f.number === 1 && f.wire === 2)
}

/** 回读：root15 里 f2=30 的记录 → { id, name }（名字取第一个 4 段 kind=1 的 f11.f1 文本） */
export function listSkillVariables(payload: Uint8Array): SkillVariableView[] {
  const out: SkillVariableView[] = []
  for (const rec of recordsOfRoot(payload, 15)) {
    const inner = innerOf(rec)
    if (varintAt(inner, 2) !== SKILL_VARIABLE_TYPE_CODE) continue
    const id = varintAt(inner, 1)
    if (id === undefined) continue
    let name = ''
    for (const sec of inner.filter((f) => f.number === 4 && f.wire === 2)) {
      const secMsg = innerOf(sec)
      if (varintAt(secMsg, 1) !== 1) continue
      const f11 = secMsg.find((f) => f.number === 11 && f.wire === 2)
      const nameMsg = f11 ? innerOf(f11) : []
      const textField = nameMsg.find((f) => f.number === 1 && f.wire === 2)
      if (textField) name = printableWireText(u8(textField.value)) ?? ''
      break
    }
    out.push({ id, name })
  }
  return out
}

/** 记录编码：与编辑器逐字节一致（28B 样本 name="技能变量"） */
export function encodeSkillVariableRecord(opts: { id: number; name: string }): Uint8Array {
  if (!Number.isSafeInteger(opts.id) || opts.id <= 0) throw new Error('[error] id 必须是正整数')
  const nameBytes = new Uint8Array(Buffer.from(opts.name, 'utf8'))
  const nameMsg = emitWireMessage([{ number: 1, wire: 2, value: nameBytes }])
  const section = emitWireMessage([
    { number: 1, wire: 0, value: 1 },
    { number: 11, wire: 2, value: nameMsg }
  ])
  return emitWireMessage([
    { number: 1, wire: 0, value: opts.id },
    { number: 2, wire: 0, value: SKILL_VARIABLE_TYPE_CODE },
    { number: 4, wire: 2, value: section }
  ])
}

/** 追加到 root15（容器缺失时按字段号升序补建；不碰 root6 / root21——差分实证无需登记） */
export function appendSkillVariable(
  payload: Uint8Array,
  opts: { id: number; name: string }
): Uint8Array {
  if (listSkillVariables(payload).some((v) => v.id === opts.id)) {
    throw new Error(`[error] 技能变量 ${opts.id} 已存在于 root15`)
  }
  const record = encodeSkillVariableRecord(opts)
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
  const hasRoot15 = root.some((f) => f.number === 15 && f.wire === 2)
  if (!hasRoot15) {
    const created: WireField = {
      number: 15,
      wire: 2,
      value: emitWireMessage([{ number: 1, wire: 2, value: record }])
    }
    const insertAt = root.findIndex((f) => f.number > 15)
    const next =
      insertAt === -1 ? [...root, created] : [...root.slice(0, insertAt), created, ...root.slice(insertAt)]
    return emitWireMessage(next)
  }
  return emitWireMessage(
    root.map((f) => {
      if (f.number !== 15 || f.wire !== 2) return f
      const inner = innerOf(f)
      return { ...f, value: emitWireMessage([...inner, { number: 1, wire: 2, value: record }]) }
    })
  )
}

type Args = {
  sub: 'list' | 'create'
  gil: string
  id?: number
  name?: string
  write: boolean
  outputPath?: string
  json: boolean
  count: number
}

function usage(exitCode = 1): never {
  const output = [
    '技能变量（root15 / type=30）：创建与回读。',
    '',
    'Usage: gsts assets:skill-variables list    --gil <map.gil> [--json]',
    '       gsts assets:skill-variables create  --gil <map.gil> --id <id> [--name <name>]',
    '                                           [--output <candidate.gil> | --write]',
    '',
    'Options:',
    '  --config <file>   project config（用 --map-id 定位地图时必填）',
    '  --map-id <id>     target map ID',
    '  --gil <file>      explicit GIL source',
    '  --id <id>         技能变量配置 ID（段起点 1207959553，按创建顺延）',
    '  --name <string>   变量名（默认「技能变量」）；--count>1 时按 <name><序号> 顺延（序号从 1）',
    '  --count <n>       一次建 n 个（id 从 --id 起顺延；一次写回、一次备份）',
    '  --output <file>   候选输出（不覆盖）',
    '  --write           备份后写回源 GIL（并同步 Temp）',
    '  --json            list：机器可读',
    '  -h, --help        显示帮助'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function parseArgs(argv: string[]): Args {
  const sub = (argv[0] ?? '') as Args['sub']
  if (sub !== 'list' && sub !== 'create') usage()
  let gil = ''
  let write = false
  let json = false
  let count = 1
  let id: number | undefined
  let name: string | undefined
  let outputPath: string | undefined
  let configPath: string | undefined
  let mapId: number | undefined
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const v = argv[++i]
      if (!v || v.startsWith('--')) usage()
      return v
    }
    if (arg === '-h' || arg === '--help') usage(0)
    else if (arg === '--config') configPath = next()
    else if (arg === '--map-id') mapId = Number(next())
    else if (arg === '--gil') gil = next()
    else if (arg === '--id') id = Number(next())
    else if (arg === '--name') name = next()
    else if (arg === '--output') outputPath = next()
    else if (arg === '--write') write = true
    else if (arg === '--json') json = true
    else if (arg === '--count') count = Number(next())
    else usage()
  }
  if (write && outputPath) throw new Error('[error] --write 与 --output 互斥')
  if (!gil && configPath && mapId !== undefined) {
    gil = resolveGilTarget({ gameRegion: 'China', mapId } as GstsInjectConfig).gilPath
  }
  if (!gil) throw new Error('[error] 需要 --gil，或 --config + --map-id')
  if (sub === 'create' && (!id || !Number.isSafeInteger(id))) throw new Error('[error] create 需要 --id')
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('[error] --count 必须是正整数')
  return { sub, gil, id, name, write, outputPath, json, count }
}

/**
 * 用**共享** buildFile 重建整文件——头部有 5 个 32 位字段，其中
 * word0 = payload.length + 20、word16 = payload.length 都是**长度派生**的。
 * 2026-10-24 事故：本命令曾用「复制前 20 字节」的自造实现，payload 变长后头部长度字段没更新
 * ⇒ 编辑器读到的 payload 长度与实际不符，直接判「存档已损坏」（root15 记录字节本身是对的）。
 */
export function buildGilFile(source: Uint8Array, payload: Uint8Array): Uint8Array {
  const header = {
    schema: readUint32BE(source, 4),
    headTag: readUint32BE(source, 8),
    fileType: readUint32BE(source, 12),
    tailTag: readUint32BE(source, source.length - 4)
  }
  return new Uint8Array(buildFile(payload, header))
}

/** 头部两条长度不变量（2026-10-24 事故：这两条没跟上 = 编辑器判存档损坏） */
export function assertHeaderInvariants(file: Uint8Array): void {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const total = file.byteLength
  const w0 = view.getUint32(0, false)
  const w16 = view.getUint32(16, false)
  const tail = view.getUint32(total - 4, false)
  if (w0 !== total - 4) {
    throw new Error(`[error] 头部 hdr[0:4]=${w0} ≠ size-4=${total - 4}（拒绝写出）`)
  }
  if (w16 !== total - 24) {
    throw new Error(`[error] 头部 hdr[16:20]=${w16} ≠ size-24=${total - 24}（拒绝写出）`)
  }
  if (tail !== 0x0679) throw new Error(`[error] trailer=0x${tail.toString(16)} ≠ 0x0679`)
}

export async function runAssetsSkillVariables(argv: string[]): Promise<void> {
  const args = parseArgs(argv)
  const gil = path.resolve(args.gil)
  const sourceBytes = new Uint8Array(fs.readFileSync(gil))
  const payload = sourceBytes.slice(20, sourceBytes.length - 4)

  if (args.sub === 'list') {
    const vars = listSkillVariables(payload)
    if (args.json) {
      console.log(JSON.stringify({ gilPath: gil, skillVariables: vars }, null, 2))
    } else {
      console.log(`gilPath=${gil}`)
      console.log(`skillVariables=${vars.length}`)
      for (const v of vars) console.log(`  ${v.id}\t${v.name || '(无名)'}`)
      if (vars.length === 0) {
        console.log(`  该段零命中（段起点 ${SKILL_VARIABLE_ID_BASE}）`)
      }
    }
    return
  }

  let next: Uint8Array = payload
  for (let i = 0; i < args.count; i++) {
    const id = args.id! + i
    const baseName = args.name ?? '技能变量'
    const name = args.count > 1 ? `${baseName}${i + 1}` : baseName
    next = appendSkillVariable(next, { id, name })
  }
  const check = listSkillVariables(next)
  for (let i = 0; i < args.count; i++) {
    if (!check.some((v) => v.id === args.id! + i)) {
      throw new Error(`[error] 回读失败：create 后 root15 里找不到 ${args.id! + i}`)
    }
  }
  const newFile = buildGilFile(sourceBytes, next)
  assertHeaderInvariants(newFile)

  if (args.write) {
    const now = new Uint8Array(fs.readFileSync(gil))
    if (Buffer.compare(Buffer.from(now), Buffer.from(sourceBytes)) !== 0) {
      throw new Error('[error] 源 GIL 读后被改动，放弃写回')
    }
    const backupDir = path.join(path.dirname(gil), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(backupDir, `${path.basename(gil)}.${stamp}.skill-variable.bak`)
    fs.copyFileSync(gil, backup)
    fs.writeFileSync(gil, newFile)
    try {
      syncGilToTemp(saveLevelDirOf(gil), path.basename(gil))
    } catch {
      // best-effort
    }
    console.log(`backup=${backup}`)
    console.log(`written=${gil}`)
  } else if (args.outputPath) {
    const absolute = path.resolve(args.outputPath)
    if (fs.existsSync(absolute)) throw new Error(`[error] output 已存在：${absolute}`)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, newFile)
    console.log(`written=${absolute}`)
  } else {
    console.log(`preview=${gil}`)
  }
  console.log(
    `command=create id=${args.id}${args.count > 1 ? `..${args.id! + args.count - 1}` : ''} ` +
      `count=${args.count} name=${args.name ?? '技能变量'} ` +
      `sourceBytes=${sourceBytes.length} candidateBytes=${newFile.length}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsSkillVariables(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
