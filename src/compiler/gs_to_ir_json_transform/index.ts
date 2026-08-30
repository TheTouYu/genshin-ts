import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const tsxCli = require.resolve('tsx/cli')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const runnerPath = path.join(__dirname, 'runner.js')

export type GsToJsonOptions = {
  maxParallel?: number
  compact?: boolean
  cwd?: string
  runtimeOptions?: {
    precompileExpression?: boolean
    removeUnusedNodes?: boolean
  }
}

export function hasEntryMarker(text: string): boolean {
  const cleaned = text.replace(/^\uFEFF/, '')
  const firstLine = cleaned.split(/\r?\n/, 1)[0]
  return /^\s*\/\/\s*@gsts:entry\s*$/.test(firstLine)
}

export function resolveIrOutputPath(entryFile: string): string {
  return entryFile.replace(/\.gs\.ts$/i, '.json')
}

function spawnRunner(
  entryFile: string,
  outFile: string,
  compact: boolean,
  cwd?: string,
  runtimeOptions?: GsToJsonOptions['runtimeOptions']
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [tsxCli, runnerPath, entryFile, outFile, compact ? '1' : '0']
    // tsx 默认读 tsconfig.json 的 paths（genshin-ts/* → src），会把 .gs.ts 的包 import
    // 解析到 src 副本，与 CLI 本体（dist）形成双副本 → gsts.ctx 栈分裂（kCtxStack symbol
    // 不同实例）。用无 paths 的 tsconfig.tsx.json 让运行时统一 dist 单副本
    // （tsc 类型检查仍用 tsconfig.json）。
    const env: Record<string, string | undefined> = {
      ...process.env,
      TSX_TSCONFIG_PATH: path.join(__dirname, '..', '..', '..', '..', 'tsconfig.tsx.json')
    }
    if (runtimeOptions && runtimeOptions.precompileExpression !== undefined) {
      env.GSTS_PRECOMPILE_EXPR = runtimeOptions.precompileExpression ? '1' : '0'
    }
    if (runtimeOptions && runtimeOptions.removeUnusedNodes !== undefined) {
      env.GSTS_REMOVE_UNUSED_NODES = runtimeOptions.removeUnusedNodes ? '1' : '0'
    }
    const child = spawn(process.execPath, args, { stdio: 'inherit', cwd, env })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`[error] gs_to_ir_json failed: ${entryFile}`))
    })
  })
}

async function runWithLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0
  const slots = Math.min(limit, items.length)
  const runners = Array.from({ length: slots }, async () => {
    while (true) {
      if (index >= items.length) break
      const current = items[index++]
      await worker(current)
    }
  })
  await Promise.all(runners)
}

export async function emitIrJsonForEntries(entries: string[], opts: GsToJsonOptions = {}) {
  if (!entries.length) return
  const list = entries.map((entry) => {
    const absEntry = path.resolve(entry)
    const outFile = resolveIrOutputPath(absEntry)
    return { entry: absEntry, outFile }
  })
  const maxParallel = Math.max(1, opts.maxParallel ?? Math.max(1, os.cpus().length - 1))
  await runWithLimit(list, maxParallel, (item) =>
    spawnRunner(item.entry, item.outFile, !!opts.compact, opts.cwd, opts.runtimeOptions)
  )
}
