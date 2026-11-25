#!/usr/bin/env node
// @status: active (2026-11-25, verified: maps / maps:resync / assets:* read-back on Win11)
// gsts-win.mjs -- run the gsts CLI against the Win11 save with the env this repo needs on Windows.
//
//   node examples/football/gsts-win.mjs maps
//   node examples/football/gsts-win.mjs maps:resync --map-id 1073741827
//   node examples/football/gsts-win.mjs assets:scripts mounts --gil <map.gil>
//
// Why this exists: node_modules was installed on Linux, so it only carries the linux-x64
// esbuild binary, and the save root is not next to the game install (E:\ys\...) but under the
// user's LocalLow. Both are resolved here so a command does not have to repeat them.
// An environment variable that is already set always wins; nothing is persisted.
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const cli = path.join(repoRoot, 'bin', 'gsts.mjs')
const env = { ...process.env }

// 1) save root: CLI wants the LocalLow level (it appends miHoYo/<game>/BeyondLocal itself).
env.GSTS_LOCALLOW_DIR ??= path.join(process.env.USERPROFILE ?? '', 'AppData', 'LocalLow')

// 2) esbuild: same version as node_modules/esbuild, win32 build, not installed into node_modules.
function resolveEsbuildBinary() {
  if (env.ESBUILD_BINARY_PATH) return env.ESBUILD_BINARY_PATH
  const local = process.env.LOCALAPPDATA ?? ''
  const candidates = [
    path.join(local, 'Temp', 'genshin-ts-win-deploy', 'package', 'esbuild.exe'),
    path.join(repoRoot, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe'),
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

const esbuild = resolveEsbuildBinary()
if (!esbuild) {
  const version = JSON.parse(readFileSync(path.join(repoRoot, 'node_modules', 'esbuild', 'package.json'), 'utf8')).version
  console.error(
    `[gsts-win] no win32 esbuild.exe found (need ${version} to match node_modules/esbuild).\n` +
      '  Unpack @esbuild/win32-x64@' + version + ' outside node_modules and set ESBUILD_BINARY_PATH,\n' +
      '  or drop it at %LOCALAPPDATA%\\Temp\\genshin-ts-win-deploy\\package\\esbuild.exe.\n' +
      '  Rule: .agents/skills/lua-2d-ui-game-build/references/12-deploy.md section 6.'
  )
  process.exit(2)
}
env.ESBUILD_BINARY_PATH = esbuild

const args = process.argv.slice(2)
const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env })
if (result.error) {
  console.error('[gsts-win] failed to start gsts:', result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
