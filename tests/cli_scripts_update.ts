// gsts assets:scripts list/register/update 端到端断言（读真图副本，不写真实地图）。
// 覆盖（2026-10-16）：两层 f50 wire（D268 定谳）解析 + update 子命令 byte-equal 往返。
// 运行：npx tsx tests/cli_scripts_update.ts
//   环境变量 GSTS_SCRIPTS_TEST_GIL 可指定样本图（缺省用 1829 真图拷贝；无样本时 SKIP）
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = path.resolve(import.meta.dirname, '..')
const GSTS = path.join(REPO, 'src', 'cli', 'gsts.ts')
// 缺省用 evidence 只读快照（含 f50 登记表，tests/AGENTS.md：优先 evidence/user_edit，
// 不依赖本机游戏目录）；GSTS_SCRIPTS_TEST_GIL 可覆盖为其他样本。
const REAL_GIL =
  process.env.GSTS_SCRIPTS_TEST_GIL ??
  path.join(REPO, 'evidence', '2026-10-16-clientui-templates', 'raw', 'resize-container-v2.gil')

if (!fs.existsSync(REAL_GIL)) {
  console.log('SKIP: sample gil not found:', REAL_GIL)
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsts-scripts-test-'))
let failed = 0
const check = (name: string, ok: boolean, detail?: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) failed++
}

function runCli(args: string[]): string {
  return execFileSync('npx', ['tsx', GSTS, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, GSTS_LOCALLOW_DIR: process.env.GSTS_LOCALLOW_DIR ?? '/tmp/gsts-test-localow' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

try {
  // ① list：两层 wire 解析（修复前报 wrapper has no inner f50）
  const listJson = runCli(['assets:scripts', 'list', '--gil', REAL_GIL, '--format', 'json'])
  const list = JSON.parse(listJson.slice(listJson.indexOf('{')))
  check('list parses two-layer f50', Array.isArray(list.entries), `count=${list.count}`)
  const main = list.entries.find((e: { name: string }) => e.name === 'main')
  check('entry main present', Boolean(main), main ? `guid=${main.guid}` : 'none')

  // ② update → candidate → list 回读 byte-equal
  const luaPath = path.join(REPO, 'workspace', 'input-probe', 'lua', 'main.lua')
  if (fs.existsSync(luaPath)) {
    const candidate = path.join(tmp, 'updated.gil')
    runCli([
      'assets:scripts', 'update', '--gil', REAL_GIL, '--name', 'main',
      '--source-file', luaPath, '--output', candidate
    ])
    const verifyJson = runCli(['assets:scripts', 'list', '--gil', candidate, '--format', 'json'])
    const verify = JSON.parse(verifyJson.slice(verifyJson.indexOf('{')))
    const updated = verify.entries.find((e: { name: string }) => e.name === 'main')
    const orig = fs.readFileSync(luaPath, 'utf8')
    check(
      'update source roundtrip',
      updated !== undefined && updated.sourceHead === orig.slice(0, 80),
      `head=${updated ? updated.sourceHead.slice(0, 30) : 'n/a'}`
    )
    check('guid preserved', updated !== undefined && updated.guid === main.guid)
  } else {
    console.log('SKIP: probe lua not found, update roundtrip untested')
  }

  // ③ update 定位失败路径
  let err = ''
  try {
    runCli(['assets:scripts', 'update', '--gil', REAL_GIL, '--name', 'no-such-script', '--source', 'x'])
  } catch (e) {
    err = String(e)
  }
  check('update unknown name fails', err.includes('not found'))
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
