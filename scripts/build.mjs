#!/usr/bin/env node
/**
 * 构建入口（替代原先 package.json 里的内联 shell 链）。
 *
 * 为什么需要它 —— 一个**静默丢改动**的事故（2026-09-16 复现并修复）：
 *
 *   原先的链是
 *     prebuild: 删 dist.tmp → cpSync(dist → dist.tmp) 播种 → （tsc 失败时仍会写入 tsbuildinfo）
 *     build:    tsc --outDir dist.tmp --tsBuildInfoFile <同一个info> && rm -rf dist && rename
 *
 *   触发序列：
 *     ① 改了源码 A，构建因**其它文件**的类型错误失败（exit≠0）→ rename 被 `&&` 短路，
 *        dist 未更新；**但 tsc 已经把 tsbuildinfo 推进了**，其中记着「A 已 emit」。
 *     ② 修掉那个类型错误，再构建：prebuild **删掉 dist.tmp**（连同 ① 里 A 的那份 emit），
 *        重新从**旧的 dist** 播种；tsc 读 tsbuildinfo 认为 A 没变 → **跳过 emit**。
 *     ③ 整目录替换 → dist 里的 A 是播种进来的旧副本 → **A 的改动永久消失，且构建报成功**。
 *
 *   根因不是"增量构建不可靠"，而是**两个状态描述的不是同一份产物**：
 *     dist        = 最后一次**成功**的构建
 *     tsbuildinfo = 最后一次**尝试**的构建
 *
 *   修复 = 恢复这个不变量：
 *     · tsc 写**暂存**增量态（staging），提交态（committed）在构建期间保持不动；
 *     · 只有 dist.tmp 成功替换成 dist 之后，才把 staging 提升为 committed；
 *     · 任何一步失败 → 丢弃 staging，提交态仍然**精确描述当前 dist**，
 *       下次构建因此会重新 emit 变更过的文件（而不是跳过）。
 */

import { cpSync, existsSync, mkdirSync, copyFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const ROOT = process.cwd()
const CACHE = path.join(ROOT, 'node_modules/.cache/gsts')
const COMMITTED = path.join(CACHE, 'tsconfig.tsbuildinfo')
const STAGING = path.join(CACHE, 'tsconfig.staging.tsbuildinfo')
const DIST = path.join(ROOT, 'dist')
const TMP = path.join(ROOT, 'dist.tmp')

mkdirSync(CACHE, { recursive: true })

// ① dist 缺失 = 没有可播种的基线：清掉两处增量态，强制全量 emit。
//    （否则 tsc 会认为「输出已是最新」而一个文件都不写，dist.tmp 又是空的 → 丢产物）
if (!existsSync(DIST)) {
  rmSync(COMMITTED, { force: true })
  rmSync(STAGING, { force: true })
  console.log('[build] dist 缺失 → 清增量缓存以强制全量 emit')
}

// ② 播种：tsc 的增量 emit **只写变更过的文件**，而结尾是整目录替换，
//    所以 dist.tmp 必须从完整副本起。
rmSync(TMP, { recursive: true, force: true })
if (existsSync(DIST)) {
  cpSync(DIST, TMP, { recursive: true })
  console.log('[build] 已把 dist 播种进 dist.tmp（增量 emit 只写变更文件，整目录替换必须从完整副本起）')
}

// ③ 用**提交态**播种 staging。tsc 从 staging 读写；失败时 staging 被丢弃，
//    提交态不受污染 —— 这是本次修复的核心。
rmSync(STAGING, { force: true })
if (existsSync(COMMITTED)) copyFileSync(COMMITTED, STAGING)

// ④ 编译
const tscBin = path.join(
  ROOT,
  'node_modules/.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc'
)
const tsc = spawnSync(
  tscBin,
  ['-p', 'tsconfig.json', '--outDir', TMP, '--tsBuildInfoFile', STAGING],
  { stdio: 'inherit', cwd: ROOT }
)

if (tsc.error) {
  rmSync(STAGING, { force: true })
  console.error(`[build] 无法执行 tsc: ${tsc.error.message}`)
  process.exit(1)
}

if (tsc.status !== 0) {
  // 关键：丢弃本次增量态。提交态仍然描述当前 dist（未被替换），
  // 所以下次构建会把「改了但没进 dist」的文件重新 emit 出来。
  rmSync(STAGING, { force: true })
  console.error(
    '[build] tsc 失败 → 已丢弃本次增量状态。\n' +
      '        dist 保持上一次成功构建的内容，增量态与它一致；\n' +
      '        因此修好错误后再次构建会**重新 emit** 变更过的文件（而不是跳过）。'
  )
  process.exit(tsc.status ?? 1)
}

// ⑤ 整目录替换。先确认 dist.tmp 存在且非空，避免「删了 dist 却没有替代」的窗口
//    （该窗口曾真实发生过：renameSync 失败而 dist 已被删，dist 整个消失）。
if (!existsSync(TMP) || statSync(TMP).isDirectory() === false) {
  rmSync(STAGING, { force: true })
  console.error('[build] dist.tmp 不存在，拒绝替换 dist（避免丢产物）')
  process.exit(1)
}
rmSync(DIST, { recursive: true, force: true })
renameSync(TMP, DIST)

// ⑥ 只有产物替换成功，才提升增量态 —— 两者必须始终描述同一份产物。
renameSync(STAGING, COMMITTED)
console.log('[build] dist 已更新，增量状态已提升（与 dist 一致）')
