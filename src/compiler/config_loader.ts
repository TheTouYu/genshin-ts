import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GstsConfig } from './gsts_config.js'

export function existsFile(p: string) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

export function existsDir(p: string) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isGstsConfig(v: unknown): v is GstsConfig {
  if (!isRecord(v)) return false
  if (typeof v.compileRoot !== 'string') return false
  if (!isStringArray(v.entries) || v.entries.length === 0) return false
  if (typeof v.outDir !== 'string') return false
  return true
}

export async function loadGstsConfig(configPath: string): Promise<GstsConfig> {
  const ext = path.extname(configPath).toLowerCase()
  const isTs = ext === '.ts' || ext === '.mts' || ext === '.cts'

  const loadViaImport = async (): Promise<unknown> => {
    const mod = (await import(pathToFileURL(configPath).href)) as unknown
    return isRecord(mod) && 'default' in mod ? ((mod as { default?: unknown }).default ?? mod) : mod
  }

  const loadViaTsx = (): unknown => {
    const require = createRequire(import.meta.url)
    let tsxCli: string
    try {
      tsxCli = require.resolve('tsx/cli')
    } catch {
      throw new Error('[error] ts config requires tsx (install it or use gsts.config.js)')
    }

    const tmp = path.join(os.tmpdir(), `gsts-load-config-${process.pid}-${Date.now()}.mjs`)
    const code = [
      `import { pathToFileURL } from 'node:url'`,
      `const cfgPath = process.argv[2]`,
      `const mod = await import(pathToFileURL(cfgPath).href)`,
      `const out = (mod && typeof mod === 'object' && 'default' in mod) ? (mod.default ?? mod) : mod`,
      `process.stdout.write(JSON.stringify(out, (key, value) => key === 'assets' ? undefined : value))`
    ].join('\n')

    fs.writeFileSync(tmp, code, 'utf8')
    try {
      const res = spawnSync(process.execPath, [tsxCli, tmp, configPath], {
        encoding: 'utf8',
        windowsHide: true
      })
      if (res.error) throw res.error
      if (res.status !== 0) {
        const msg = (res.stderr || res.stdout || '').trim()
        throw new Error(msg || `exit code ${String(res.status)}`)
      }
      return JSON.parse(res.stdout)
    } finally {
      try {
        fs.unlinkSync(tmp)
      } catch {
        // ignore
      }
    }
  }

  const exported = isTs ? loadViaTsx() : await loadViaImport()
  if (!isGstsConfig(exported)) {
    throw new Error('[error] config must provide compileRoot, entries, outDir')
  }
  return exported
}
