import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { GiaWriteResult, WriteGiaFromIrJsonFileOptions } from './ir_to_gia_transform/shared.js'
import type { SignalRegistry } from './signal_registry.js'

export { writeGiaFromIrJsonFile } from './ir_to_gia_transform/shared.js'
export type { GiaWriteResult, WriteGiaFromIrJsonFileOptions } from './ir_to_gia_transform/shared.js'

const require = createRequire(import.meta.url)
const tsxCli = require.resolve('tsx/cli')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const runnerPath = path.join(__dirname, 'ir_to_gia_transform', 'runner.js')

export function resolveGiaOutputPath(irJsonPath: string): string {
  return irJsonPath.replace(/\.json$/i, '.gia')
}

export type IrToGiaParallelOptions = {
  maxParallel?: number
  cwd?: string
  signalRegistry?: SignalRegistry
  /**
   * Called when runner emits an `[ok] ...` progress line.
   * The argument is the message part after `[ok] ` (e.g. `path (id=123)`).
   */
  onOkLine?: (msg: string) => void
}

type GiaTask = { irPath: string; outFile?: string; opts?: WriteGiaFromIrJsonFileOptions }

function spawnRunner(
  task: GiaTask,
  opts?: Pick<IrToGiaParallelOptions, 'cwd' | 'onOkLine' | 'signalRegistry'>
): Promise<GiaWriteResult[]> {
  return new Promise((resolve, reject) => {
    const absIr = path.resolve(task.irPath)
    const out = task.outFile ? path.resolve(task.outFile) : ''
    const preserve = task.opts?.preserveIndices ? '1' : '0'
    const indices = task.opts?.includeIndices?.length ? task.opts.includeIndices.join(',') : ''
    const registry = opts?.signalRegistry ? JSON.stringify([...opts.signalRegistry.values()]) : ''
    const args = [tsxCli, runnerPath, absIr, out, preserve, indices, registry]
    const child = spawn(process.execPath, args, {
      cwd: opts?.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      // tsx 默认读 tsconfig.json 的 paths（genshin-ts/* → src），会把 .gs.ts 的包 import
      // 解析到 src 副本，与 CLI 本体（dist）形成双副本 → ctx 栈分裂。用无 paths 的
      // tsconfig.tsx.json 让运行时统一 dist 单副本（tsc 类型检查仍用 tsconfig.json）。
      env: { ...process.env, TSX_TSCONFIG_PATH: path.join(__dirname, '..', '..', '..', 'tsconfig.tsx.json') }
    })
    let stdout = ''
    let stderrBuf = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (d) => (stdout += d))
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (d) => {
      stderrBuf += d
      while (true) {
        const idx = stderrBuf.indexOf('\n')
        if (idx < 0) break
        const line = stderrBuf.slice(0, idx).replace(/\r$/, '')
        stderrBuf = stderrBuf.slice(idx + 1)
        const m = /^\[ok\]\s+(.*)$/.exec(line)
        if (m) {
          opts?.onOkLine?.(m[1] ?? '')
        } else if (line.length) {
          process.stderr.write(line + '\n')
        }
      }
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`[error] ir_to_gia failed: ${absIr}`))
        return
      }
      if (stderrBuf.length) {
        const line = stderrBuf.replace(/\r$/, '')
        const m = /^\[ok\]\s+(.*)$/.exec(line)
        if (m) opts?.onOkLine?.(m[1] ?? '')
        else process.stderr.write(line + '\n')
      }
      try {
        const parsed = JSON.parse(stdout || '[]') as GiaWriteResult[]
        resolve(parsed)
      } catch {
        reject(new Error(`[error] ir_to_gia runner invalid output: ${absIr}`))
      }
    })
  })
}

async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  let nextIndex = 0
  const slots = Math.min(limit, items.length)
  const results: R[] = []
  const runners = Array.from({ length: slots }, async () => {
    while (true) {
      if (nextIndex >= items.length) break
      const i = nextIndex++
      const item = items[i]
      results[i] = await worker(item, i)
    }
  })
  await Promise.all(runners)
  return results
}

export async function writeGiaFromIrJsonFiles(
  tasks: GiaTask[],
  opts: IrToGiaParallelOptions = {}
): Promise<GiaWriteResult[]> {
  if (!tasks.length) return []
  const maxParallel = Math.max(1, opts.maxParallel ?? Math.max(1, os.cpus().length - 1))
  const perTask = await runWithLimit(tasks, maxParallel, (t) => spawnRunner(t, opts))
  return perTask.flat()
}
