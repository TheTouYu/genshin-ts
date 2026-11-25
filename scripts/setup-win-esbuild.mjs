#!/usr/bin/env node
// @status: active (2026-11-25, verified on Win11: copy path + registry download path, idempotent, --check)
// setup-win-esbuild.mjs -- 给 Windows 准备与本仓库 esbuild 同版本的 win32 esbuild.exe（可重复运行）
//
//   node scripts/setup-win-esbuild.mjs            # 安装到 node_modules/.cache/gsts/esbuild-win32-x64-<版本>/
//   node scripts/setup-win-esbuild.mjs --check    # 只检查：已就位 exit 0，否则 exit 1
//
// 为什么：node_modules 可能是在 Linux 上装的（只带 linux-x64 二进制），Windows 上 CLI 起不来；
// 又不想往共享的依赖树里加平台包。做法 = 把官方包里的 esbuild.exe 解到仓库自己的缓存目录，
// examples/football/gsts-win.mjs 会自动从这里找。
// 来源优先级：已有的同版本副本（先例放在 %LOCALAPPDATA%\Temp） > npm registry 下载（校验 sha512，需联网；
// registry 取 npm_config_registry，缺省官方源）。不经 shell、不碰 package.json / lock / node_modules 依赖。
// 非 Windows x64 平台无需处理，直接 exit 0。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const checkOnly = process.argv.includes('--check')
const PKG = '@esbuild/win32-x64'

function fail(msg) {
  console.error(`[setup-win-esbuild] ${msg}`)
  process.exit(1)
}

if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.log(`[setup-win-esbuild] ${process.platform}/${process.arch} 无需处理（只有 win32/x64 需要单独的 esbuild.exe）`)
  process.exit(0)
}

let version
try {
  version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'node_modules', 'esbuild', 'package.json'), 'utf8')).version
} catch (error) {
  fail(`读不到 node_modules/esbuild/package.json（依赖装好了吗？）：${error.message}`)
}
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`esbuild 版本号形态异常：${version}`)

const destDir = path.join(repoRoot, 'node_modules', '.cache', 'gsts', `esbuild-win32-x64-${version}`)
const destExe = path.join(destDir, 'esbuild.exe')

function versionOf(exe) {
  const res = spawnSync(exe, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
  return res.status === 0 ? (res.stdout ?? '').trim() : null
}

const current = fs.existsSync(destExe) ? versionOf(destExe) : null
if (current === version) {
  console.log(`[setup-win-esbuild] 已就位：${destExe}（esbuild ${version}）`)
  process.exit(0)
}
if (checkOnly) fail(`未就位：${destExe} 不存在或版本不是 ${version}（实际 ${current ?? '无'}）`)

fs.mkdirSync(destDir, { recursive: true })
const staged = path.join(destDir, 'esbuild.exe.staging')
let origin = ''

// 来源 1：先例副本（同版本才用）
const legacy = path.join(process.env.LOCALAPPDATA ?? '', 'Temp', 'genshin-ts-win-deploy', 'package', 'esbuild.exe')
if (legacy && fs.existsSync(legacy) && versionOf(legacy) === version) {
  fs.copyFileSync(legacy, staged)
  origin = `已有副本 ${legacy}`
} else {
  // 来源 2：从 npm registry 下载官方包，并按元数据里的 sha512 校验完整性
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsts-esbuild-'))
  try {
    const registry = (process.env.npm_config_registry || 'https://registry.npmjs.org/').replace(/\/?$/, '/')
    const metaUrl = `${registry}@esbuild%2Fwin32-x64/${version}`
    const meta = await fetch(metaUrl)
    if (!meta.ok) fail(`取包信息失败 HTTP ${meta.status}：${metaUrl}`)
    const { dist } = await meta.json()
    const res = await fetch(dist.tarball)
    if (!res.ok) fail(`下载失败 HTTP ${res.status}：${dist.tarball}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const [algo, expected] = String(dist.integrity).split('-')
    const actual = createHash(algo).update(buf).digest('base64')
    if (actual !== expected) fail(`完整性校验不符（${algo}）：${dist.tarball}`)
    const tgz = path.join(tmp, 'package.tgz')
    fs.writeFileSync(tgz, buf)
    const tar = spawnSync('tar', ['-xzf', tgz, '-C', tmp], { encoding: 'utf8', windowsHide: true })
    if (tar.status !== 0) fail(`解包失败（exit ${tar.status}）：${(tar.stderr || '').trim()}`)
    const extracted = path.join(tmp, 'package', 'esbuild.exe')
    if (!fs.existsSync(extracted)) fail(`包里没有 package/esbuild.exe（临时目录 ${tmp}）`)
    fs.copyFileSync(extracted, staged)
    origin = `npm registry ${dist.tarball}`
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

const stagedVersion = versionOf(staged)
if (stagedVersion !== version) {
  fs.rmSync(staged, { force: true })
  fail(`解出的 esbuild.exe 版本是 ${stagedVersion ?? '未知'}，应为 ${version}；未安装`)
}
fs.renameSync(staged, destExe)
const sha = createHash('sha256').update(fs.readFileSync(destExe)).digest('hex')
console.log(`[setup-win-esbuild] 来源：${origin}`)
console.log(`[setup-win-esbuild] 已安装：${destExe}`)
console.log(`[setup-win-esbuild] esbuild ${stagedVersion}  ${fs.statSync(destExe).size} B  sha256 ${sha}`)
