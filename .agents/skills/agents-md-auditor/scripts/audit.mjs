#!/usr/bin/env node
// 注入文件引用完整性审计：node .agents/skills/agents-md-auditor/scripts/audit.mjs [仓库根]
// 检查全部 git 跟踪的 AGENTS.md/CLAUDE.md：相对链接/反引号路径存在性 + npm 脚本引用（就近 package.json）
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = path.resolve(process.argv[2] || '.')
process.chdir(root)
const files = execSync('git ls-files "*AGENTS.md" "*CLAUDE.md"').toString().trim().split('\n').filter(Boolean).sort()

const pkgScriptsAt = (dir) => {
  let d = dir
  for (let i = 0; i < 6; i++) {
    const p = path.join(d, 'package.json')
    if (fs.existsSync(p)) { try { return new Set(Object.keys(JSON.parse(fs.readFileSync(p, 'utf8')).scripts || {})) } catch {} }
    const up = path.dirname(d)
    if (up === d) break
    d = up
  }
  return new Set()
}

// npm 脚本以根包 ∪ 就近包 联合判定（说明文字常假定在仓库根执行）
const nearestPkgScripts = (dir) => {
  const s = new Set([...pkgScriptsAt('.'), ...pkgScriptsAt(dir)])
  return s
}

let issues = 0
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8')
  const dir = path.dirname(f)
  const problems = []
  const linkRe = /\]\(([^)\s]+)\)/g
  const codeRe = new RegExp('\\u0060((?:src|docs|tests|scripts|tools|examples|configs|types|types-local|data|create-genshin-ts|\.agents)/[^\\s\\u0060]+)\\u0060', 'g')
  const targets = new Set()
  for (const re of [linkRe, codeRe]) {
    let m
    while ((m = re.exec(txt))) {
      const p = m[1]
      if (/^(https?:|#|mailto:)/.test(p)) continue
      if (/[{}*|]/.test(p)) continue // 通配符/多路径不算缺失
      if (/\.\.\.$|…/.test(p)) continue // 省略号占位路径不算缺失
      targets.add(p)
    }
  }
  for (const p of targets) {
    const clean = p.split('#')[0]
    if (!clean) continue
    if (!fs.existsSync(path.join(dir, clean)) && !fs.existsSync(path.join(root, clean))) {
      problems.push('缺失引用: ' + p); issues++
    }
  }
  const scripts = nearestPkgScripts(dir)
  for (const s of new Set([...txt.matchAll(/npm run ([a-zA-Z:_-]+)/g)].map((x) => x[1]))) {
    if (scripts.size && !scripts.has(s)) { problems.push('npm 脚本不存在(就近包): ' + s); issues++ }
  }
  if (problems.length) {
    console.log('### ' + f)
    for (const p of problems) console.log('  - ' + p)
  }
}
console.log('(审计完: ' + files.length + ' 个注入文件, ' + issues + ' 个问题)')