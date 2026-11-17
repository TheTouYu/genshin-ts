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
import { readFileSync } from 'node:fs'
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
