// qxqy/buildtag.mjs —— 版本戳的**唯一来源**（build.mjs / deploy.mjs 共用）
//
// 为什么需要它：版本戳原来靠人手改 `lua/main.lua` 的 `BUILD_TAG = '...'`。
// 实测代价：v6.10 · 11-02 的戳在 v6.26 的代码上活了 15 天，用户截图右下角看到的是假版本，
// 于是「我反馈的是旧构建体验」这种归因错误反复发生（D663 同一形态）。
//
// 规则：`main.lua` 只写**人手维护的语义版本**（如 `v6.27`），日期与 commit 由构建期注入。
//   - 人手忘了 bump ⇒ 日期/sha 仍然暴露出真实构建；
//   - 两个脚本读同一个函数 ⇒ 存档名（meta.name）与游戏内戳不会分叉。
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

/** 取语义版本（main.lua 的 BUILD_TAG 原文，去掉可能存在的 ` · …` 尾巴） */
export function humanVersion(root) {
  const src = readFileSync(join(root, 'lua/main.lua'), 'utf8')
  const m = /^BUILD_TAG = '([^']*)'/m.exec(src)
  const raw = (m && m[1]) || 'dev'
  return raw.split(' · ')[0] || 'dev'
}

/** 「v6.27 · 11-17 16:2x 1e1eb43」；不在 git 仓里时退回人手版本 */
export function buildTag(root) {
  const human = humanVersion(root)
  const r = spawnSync('git', ['log', '-1', '--format=%cd|%h', '--date=format:%m-%d %H:%M'],
    { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) return human
  const [date, sha] = String(r.stdout || '').trim().split('|')
  if (!date || !sha) return human
  return `${human} · ${date} ${sha}`
}

/**
 * 模块指纹：lua/ 下全部 .lua 按路径排序后取 sha256 前 8 位。
 * 用途（2026-11-20 定）：真机启动打 `build <tag> fp=<fp> modules=<n>`，
 * 这是"跑的是哪份代码"的唯一判据——文件里有新字符串不算证据（当日误判两次）。
 * build.mjs 与 deploy.mjs **共用本函数**，禁止各自算一份。
 */
export function moduleFingerprint(root) {
  const files = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.lua')) files.push(full)
    }
  }
  walk(`${root}/lua`)
  files.sort()
  const h = createHash('sha256')
  for (const f of files) { h.update(f.slice(root.length)); h.update(readFileSync(f)) }
  return { fp: h.digest('hex').slice(0, 8), count: files.length }
}
