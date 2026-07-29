import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GstsConfig } from './gsts_config.js'

export type GstsConfigProfile = 'compile' | 'project' | 'static-assemblies'

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

function fail(
  configPath: string,
  profile: GstsConfigProfile,
  field: string,
  detail: string
): never {
  throw new Error(
    `[error] config ${path.resolve(configPath)} (profile=${profile}): ${field} ${detail}`
  )
}

function validateConfig(
  exported: unknown,
  configPath: string,
  profile: GstsConfigProfile
): GstsConfig {
  if (!isRecord(exported)) fail(configPath, profile, 'default', 'must export an object')
  if (profile === 'compile') {
    if (typeof exported.compileRoot !== 'string')
      fail(configPath, profile, 'compileRoot', 'must be a string')
    if (!Array.isArray(exported.entries) || exported.entries.length === 0)
      fail(configPath, profile, 'entries', 'must be a non-empty string array')
    if (!exported.entries.every((value) => typeof value === 'string'))
      fail(configPath, profile, 'entries', 'must contain only strings')
    if (typeof exported.outDir !== 'string') fail(configPath, profile, 'outDir', 'must be a string')
  }
  if (profile === 'static-assemblies') {
    if (!isRecord(exported.assets)) fail(configPath, profile, 'assets', 'must be an object')
    const assemblies = exported.assets.staticAssemblies
    const updates = exported.assets.staticPrefabUpdates
    const categories = exported.assets.staticPrefabCategories
    if (
      (!Array.isArray(assemblies) || assemblies.length === 0) &&
      (!Array.isArray(updates) || updates.length === 0) &&
      (!Array.isArray(categories) || categories.length === 0)
    ) {
      fail(
        configPath,
        profile,
        'assets',
        'must contain a non-empty staticAssemblies, staticPrefabUpdates, or staticPrefabCategories array'
      )
    }
  }
  return exported as GstsConfig
}

export async function loadGstsConfig(
  configPath: string,
  options: { profile?: GstsConfigProfile } = {}
): Promise<GstsConfig> {
  const absolutePath = path.resolve(configPath)
  const profile = options.profile ?? 'compile'
  const ext = path.extname(absolutePath).toLowerCase()
  const isTs = ext === '.ts' || ext === '.mts' || ext === '.cts'

  const loadViaImport = async (): Promise<unknown> => {
    const mod = (await import(pathToFileURL(absolutePath).href)) as unknown
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
      `process.stdout.write(JSON.stringify(out, (_key, value) => typeof value === 'bigint' ? { __gstsBigInt: String(value) } : value))`
    ].join('\n')

    fs.writeFileSync(tmp, code, 'utf8')
    try {
      const res = spawnSync(process.execPath, [tsxCli, tmp, absolutePath], {
        encoding: 'utf8',
        windowsHide: true
      })
      if (res.error) throw res.error
      if (res.status !== 0) {
        const msg = (res.stderr || res.stdout || '').trim()
        throw new Error(msg || `exit code ${String(res.status)}`)
      }
      return JSON.parse(res.stdout, (_key, value: unknown) => {
        if (
          isRecord(value) &&
          Object.keys(value).length === 1 &&
          typeof value.__gstsBigInt === 'string'
        ) {
          return BigInt(value.__gstsBigInt)
        }
        return value
      })
    } finally {
      try {
        fs.unlinkSync(tmp)
      } catch {
        // ignore
      }
    }
  }

  const exported = isTs ? loadViaTsx() : await loadViaImport()
  return validateConfig(exported, absolutePath, profile)
}
