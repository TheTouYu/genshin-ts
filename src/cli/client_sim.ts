// gsts client:sim —— 千星沙箱模拟器桥接命令层。
// 背景（2026-10-16，D269）：模拟器仓库 studio/cli.mjs 是 headless job worker
// （--in job.json --out out.json，cmd = get/patch/playStart/playRun/playStop），
// 本命令把它桥接进 gsts：组装 job → spawn 模拟器 cli.mjs → 回读结果。
// 进程隔离（spawn 而非 import）：genshin-ts 不依赖模拟器仓的模块解析，
// 模拟器升级自动跟随（cli.mjs job 协议稳定），超时控制简单。
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const USAGE = [
  'usage: gsts client:sim <get|patch|playStart|playRun|playStop> [options]',
  '  模拟器 headless 桥接：job 协议与模拟器 studio/cli.mjs 一致',
  '',
  '  --job <json>        完整 job JSON（cmd 字段可省，由位置参数填）',
  '  --job-file <f>      从文件读 job JSON',
  '  --project <file>    快捷：模拟器存档路径（job.project）',
  '  --frames <n>        playRun 帧数',
  '  --canvas <id>       画布（如 pc-16-9 / mobile-16-9）',
  '  --op <json>         patch 单操作 JSON（job.op）',
  '  --scripts <json>    脚本数组 JSON（job.scripts）',
  '  --timeout <ms>      模拟器超时（默认 12000）',
  '  --sim-root <dir>    模拟器仓库根（默认 $QXQY_SIMULATOR_ROOT 或',
  '                      /home/h/miliastra-beyond-simulator）',
  '  --out <file>        结果 JSON 全量落盘（stdout 只打摘要）',
  '  --full              stdout 打全量 JSON（默认 get 只打摘要）'
]

type SimArgs = {
  command?: string
  job?: string
  jobFile?: string
  project?: string
  frames?: number
  canvas?: string
  op?: string
  scripts?: string
  timeout?: number
  simRoot?: string
  out?: string
  full?: boolean
}

const SIM_CMDS = new Set(['get', 'patch', 'playStart', 'playRun', 'playStop'])

function parseArgs(argv: readonly string[]): SimArgs {
  const args: SimArgs = {}
  args.command = argv[0]
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    const next = (): string => {
      const value = argv[++i]
      if (value === undefined) throw new Error(`[error] ${arg} requires a value`)
      return value
    }
    switch (arg) {
      case '--job':
        args.job = next()
        break
      case '--job-file':
        args.jobFile = next()
        break
      case '--project':
        args.project = next()
        break
      case '--frames':
        args.frames = Number(next())
        break
      case '--canvas':
        args.canvas = next()
        break
      case '--op':
        args.op = next()
        break
      case '--scripts':
        args.scripts = next()
        break
      case '--timeout':
        args.timeout = Number(next())
        break
      case '--sim-root':
        args.simRoot = next()
        break
      case '--out':
        args.out = next()
        break
      case '--full':
        args.full = true
        break
      default:
        throw new Error(`[error] unknown option: ${arg}`)
    }
  }
  return args
}

function parseJsonInput(label: string, raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`[error] invalid JSON in ${label}: ${(error as Error).message}`)
  }
}

function summarizeGet(data: unknown): Record<string, unknown> {
  if (data === null || typeof data !== 'object') return { data }
  const d = data as Record<string, unknown>
  const scripts = Array.isArray(d.scripts) ? (d.scripts as unknown[]).length : null
  const tree = Array.isArray(d.tree) ? (d.tree as unknown[]).length : null
  const save = d.save as Record<string, unknown> | undefined
  const canvas = d.canvas as Record<string, unknown> | undefined
  return {
    meta: d.meta ?? null,
    canvas: canvas ? `${canvas.id} ${canvas.width}x${canvas.height}` : d.canvasId ?? null,
    treeNodes: tree,
    scripts,
    saveName: save?.name ?? null,
    workspace: d.workspace ?? null,
    serverRules: (d.serverLogic as Record<string, unknown> | undefined)?.rules ?? null
  }
}

export async function runClientSim(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  if (!args.command || !SIM_CMDS.has(args.command)) {
    console.log(USAGE.join('\n'))
    if (args.command) throw new Error(`[error] unknown command: ${args.command}`)
    return
  }

  let job: Record<string, unknown> = {}
  const jobRaw = args.jobFile
    ? fs.readFileSync(path.resolve(args.jobFile), 'utf8')
    : args.job
  if (jobRaw !== undefined) {
    const parsed = parseJsonInput(args.jobFile ?? '--job', jobRaw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('[error] job JSON must be an object')
    }
    job = parsed as Record<string, unknown>
  }
  job.cmd = args.command
  if (args.project !== undefined) job.project = JSON.parse(fs.readFileSync(path.resolve(args.project), 'utf8'))
  if (args.frames !== undefined) job.frames = args.frames
  if (args.canvas !== undefined) job.canvasId = args.canvas
  if (args.op !== undefined) job.op = parseJsonInput('--op', args.op)
  if (args.scripts !== undefined) job.scripts = parseJsonInput('--scripts', args.scripts)

  const simRoot = path.resolve(
    args.simRoot ??
      process.env.QXQY_SIMULATOR_ROOT ??
      '/home/h/miliastra-beyond-simulator'
  )
  const cliPath = path.join(simRoot, 'studio', 'cli.mjs')
  if (!fs.existsSync(cliPath)) {
    throw new Error(
      `[error] simulator cli not found: ${cliPath} (set --sim-root or QXQY_SIMULATOR_ROOT)`
    )
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsts-client-sim-'))
  const inPath = path.join(tmpDir, 'job.json')
  const outPath = path.join(tmpDir, 'out.json')
  fs.writeFileSync(inPath, JSON.stringify(job))

  const timeoutMs = args.timeout ?? 12_000
  try {
    await execFileAsync(process.execPath, [cliPath, '--in', inPath, '--out', outPath], {
      timeout: timeoutMs + 5_000,
      env: { ...process.env, QXQY_CLI_TIMEOUT_MS: String(timeoutMs) }
    })
    const result = JSON.parse(fs.readFileSync(outPath, 'utf8')) as {
      ok: boolean
      data: unknown
      error: string | null
    }
    if (!result.ok) throw new Error(`[simulator] ${result.error ?? 'unknown error'}`)

    if (args.out) {
      const outAbs = path.resolve(args.out)
      fs.mkdirSync(path.dirname(outAbs), { recursive: true })
      fs.writeFileSync(outAbs, JSON.stringify(result, null, 2))
      console.log(`out=${outAbs}`)
    }
    if (args.command === 'get' && !args.full) {
      console.log(JSON.stringify(summarizeGet(result.data), null, 2))
    } else if (args.full || !args.out) {
      console.log(JSON.stringify(result.data, null, 2))
    } else {
      console.log(`ok=true cmd=${args.command} (full result in ${args.out})`)
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}
