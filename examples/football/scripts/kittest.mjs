#!/usr/bin/env node
// 生产图 / 测试图 切换器（改载体技能条目 #1 绑定的技能配置，不改图、不改代码）
//   node examples/football/scripts/kittest.mjs on     → 绑定「物理测试台」(1191182342 → 图 1082130440)
//   node examples/football/scripts/kittest.mjs off    → 绑回生产 (1191182341 → 图 1082130436)
//   node examples/football/scripts/kittest.mjs status → 只读：打印当前技能配置列表
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const mode = process.argv[2] ?? 'status'
const root = path.resolve(import.meta.dirname, '../../..')
const cli = path.join(root, 'dist/src/cli/gsts.js')
const MAP = '1073741827'
const TARGET = '1082130445'
const PROD = '1191182341'
const TEST = '1191182343' // template=28(自定义造物)，与载体原技能条目同模板；1191182342 是 36(普通技能)，绑上去不会执行

const run = (args) =>
  execFileSync('node', [cli, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

if (mode === 'status') {
  process.stdout.write(run(['assets:skill-config', 'list', '--map-id', MAP]))
} else if (mode === 'on' || mode === 'off') {
  const cfg = mode === 'on' ? TEST : PROD
  const out = run([
    'assets:creations', 'skill', 'bind',
    '--map-id', MAP, '--target', TARGET, '--index', '1',
    '--skill-config', cfg, '--cd', '0.03', '--ignore-public-cd', '--write'
  ])
  process.stdout.write(out)
  run(['maps:resync', '--map-id', MAP])
  console.log(`\n[kittest] 已切到 ${mode === 'on' ? '测试图 _GSTS_kitLoopTest' : '生产图 _GSTS_kitLoop'}（config=${cfg}）`)
} else {
  console.error('用法: node kittest.mjs on|off|status')
  process.exit(2)
}
