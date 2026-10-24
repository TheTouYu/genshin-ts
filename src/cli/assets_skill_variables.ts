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
// 🔴 2026-10-24 事故（必读）：本命令的 --write 曾把地图 1073741827 写成**编辑器拒收**的形态
//   （报「存档已损坏」，已回滚到编辑器自存 sha 4945c21d…）。**root15 记录字节与编辑器逐字节一致，
//   仍被拒** ⇒ 缺的是地图层簿记（root21 计数 23→[23,6401] 未写 / 可能还有其它联动），
//   属**未闭合项**。因此 --write 现在必须显式 `--unsafe-write` 才放行，默认只出候选。
//   闭合路径：再取一组差分（同图建第 2 个技能变量、删 1 个）+ 在**独立实验图**上验「编辑器能打开」。
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
    '  --name <string>   变量名（默认「技能变量」；写入 f4.kind=1.f11.f1 UTF-8）',
    '  --output <file>   候选输出（不覆盖）',
    '  --write           ⚠️ 必配 --unsafe-write 才生效（见文件头事故说明）',
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
  let allowUnsafeWrite = false
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
    else if (arg === '--unsafe-write') allowUnsafeWrite = true
    else if (arg === '--json') json = true
    else usage()
  }
  if (write && outputPath) throw new Error('[error] --write 与 --output 互斥')
  if (!gil && configPath && mapId !== undefined) {
    gil = resolveGilTarget({ gameRegion: 'China', mapId } as GstsInjectConfig).gilPath
  }
  if (!gil) throw new Error('[error] 需要 --gil，或 --config + --map-id')
  if (sub === 'create' && (!id || !Number.isSafeInteger(id))) throw new Error('[error] create 需要 --id')
  if (write && !allowUnsafeWrite) {
    throw new Error(
      '[error] --write 已封锁：2026-10-24 本命令写回 1073741827 被编辑器判「存档已损坏」' +
        '（root15 字节与编辑器一致，缺地图层簿记，属未闭合项）。' +
        '先用 --output 出候选；确要写回请加 --unsafe-write，并在**非现役图**上验证编辑器能打开。'
    )
  }
  return { sub, gil, id, name, write, outputPath, json }
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

  const next = appendSkillVariable(payload, { id: args.id!, name: args.name ?? '技能变量' })
  const check = listSkillVariables(next)
  if (!check.some((v) => v.id === args.id)) {
    throw new Error('[error] 回读失败：create 后 root15 里找不到该技能变量')
  }
  const newFile = buildGilFile(sourceBytes, next)

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
    `command=create id=${args.id} name=${args.name ?? '技能变量'} ` +
      `sourceBytes=${sourceBytes.length} candidateBytes=${newFile.length}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsSkillVariables(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
