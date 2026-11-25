#!/usr/bin/env node
// @status: active (2026-11-25, verified: --selftest on Win11; real commits through the hook)
// py.mjs -- 以仓库统一的方式找到 Python 并运行脚本（Linux 与 Win11 同一条命令）。
//
//   node scripts/py.mjs scripts/doc_health.py --staged   # 运行一个 Python 件（参数原样透传，退出码透传）
//   node scripts/py.mjs - < script.py                   # 从标准输入读脚本（等价 python -）
//   node scripts/py.mjs --print                          # 只打印解析结果（解释器路径、版本、来源）
//   node scripts/py.mjs --check                          # 能解析到 >= 3.9 的解释器则 exit 0，否则 127
//   node scripts/py.mjs --selftest                       # 发现逻辑自测（含负例，见下）
//
// 为什么要它：仓库的门禁与工具是 Python 件，而各机器的入口名不同——Linux 是 python3；
// Win11 的 PATH 里可能一个都没有（2026-11-25 实证：pre-commit 钩子写死 python3，rc=127 拦下全部提交）。
//
// 发现顺序（显式优先，不猜）：
//   1) GSTS_PYTHON 环境变量——给非标准位置一个出口。指定了就只用它：坏了直接报错，不静默换人。
//   2) PATH 里的 python3 / python / py -3（后者仅 Windows）
//   3) DSH 运行时自带的解释器（DeepSeek Harness 的依赖目录）——只是候选之一，不是依赖
// 每个候选都用 `--version` 实测：Windows 应用商店的 python 假桩会在这一步被淘汰（它 exit 9009）。
// 子进程一律 PYTHONUTF8=1：门禁要读中文输出，Win11 默认 GBK（2026-11-25 实证，账本 F-20261125-96）。
// 环境事实：Windows 给子进程自动补回 USERPROFILE / PATH / HOMEDRIVE 等 7 个用户级变量——想在子进程里
// 「拿掉」它们只能显式给值（2026-11-25 实测，--selftest 的负例靠这一点才构造得出来）。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const MIN = [3, 9]
const UTF8_ENV = { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
// 负例子进程仍需的系统变量：Windows 上没有 SystemRoot 连 node 都起不来
const KEEP_ENV = ['SystemRoot', 'WINDIR', 'COMSPEC', 'SystemDrive', 'TEMP', 'TMP']

function parseVersion(text) {
  const m = /Python (\d+)\.(\d+)(?:\.(\d+))?/.exec(text ?? '')
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null
}

function probe(command, env) {
  const res = spawnSync(command[0], [...command.slice(1), '--version'], {
    encoding: 'utf8',
    env: { ...env, ...UTF8_ENV },
    windowsHide: true,
    timeout: 15000,
  })
  if (res.error) return { ok: false, why: `无法启动（${res.error.code ?? res.error.message}）` }
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`
  const ver = parseVersion(out)
  if (res.status !== 0 || !ver) {
    const first = out.trim().split('\n')[0]?.slice(0, 60) ?? ''
    return { ok: false, why: `不是可用的 Python（exit ${res.status}${first ? `：${first}` : ''}）` }
  }
  if (ver[0] < MIN[0] || (ver[0] === MIN[0] && ver[1] < MIN[1])) {
    return { ok: false, why: `版本过低 ${ver.join('.')}（需 >= ${MIN.join('.')}）` }
  }
  return { ok: true, version: ver.join('.') }
}

function candidates(env) {
  if (env.GSTS_PYTHON) {
    return [{ label: `GSTS_PYTHON=${env.GSTS_PYTHON}`, command: [env.GSTS_PYTHON] }]
  }
  const list = []
  for (const name of ['python3', 'python']) list.push({ label: `PATH 里的 ${name}`, command: [name] })
  if (process.platform === 'win32') list.push({ label: 'PATH 里的 py -3（Windows 启动器）', command: ['py', '-3'] })
  const home = env.USERPROFILE || env.HOME || ''
  if (home) {
    const base = path.join(home, '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python')
    const exe = process.platform === 'win32' ? path.join(base, 'python.exe') : path.join(base, 'bin', 'python3')
    list.push({ label: `DSH 运行时 ${exe}`, command: [exe] })
  }
  return list
}

/** 返回 { command, exe, label, version }；找不到时 command 为 null，并带 tried（逐候选的失败原因）。 */
export function resolvePython(env = process.env) {
  const tried = []
  for (const c of candidates(env)) {
    const r = probe(c.command, env)
    if (r.ok) return { command: c.command, exe: c.command[0], label: c.label, version: r.version }
    tried.push(`${c.label}：${r.why}`)
  }
  return { command: null, tried }
}

function reportMissing(result) {
  console.error('[py] 找不到可用的 Python（需 >= ' + MIN.join('.') + '）。逐个候选都试过了：')
  for (const line of result.tried) console.error(`  - ${line}`)
  console.error('  怎么办：安装 Python 3 并加入 PATH，或设 GSTS_PYTHON=<解释器完整路径>（之后所有仓库 Python 件都用它）。')
}

function selftest() {
  const fails = []
  // ① 正例：本机应能解析到
  const ok = resolvePython()
  if (!ok.command) fails.push(`本机应能解析到 Python，实际没有：${ok.tried.join('；')}`)
  // ② 显式坏值：必须报错，不得静默回退到别的候选
  const envBad = { ...process.env, GSTS_PYTHON: path.join(os.tmpdir(), 'no-such-python', 'python') }
  if (resolvePython(envBad).command) fails.push('GSTS_PYTHON 指向不存在的解释器时不应回退到别的候选')
  // ③ 负例：子进程里把 PATH 与 home 都指向空目录，--check 必须 exit 127 并给出 GSTS_PYTHON 指引。
  //    注意不能靠「不传这些变量」来构造——Windows 会给子进程自动补回 USERPROFILE / PATH / HOMEDRIVE 等
  //    7 个用户级变量（2026-11-25 实测：只传 6 个系统变量，子进程里却有 13 个），必须显式给值。
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'py-empty-'))
  try {
    const bare = {}
    for (const k of KEEP_ENV) if (process.env[k]) bare[k] = process.env[k]
    const root = path.parse(emptyDir).root
    Object.assign(bare, {
      USERPROFILE: emptyDir,
      HOME: emptyDir,
      HOMEDRIVE: root,
      HOMEPATH: emptyDir.slice(root.length),
      PATH: emptyDir,
    })
    const sub = spawnSync(process.execPath, [SELF, '--check'], { encoding: 'utf8', env: bare })
    const out = `${sub.stdout ?? ''}${sub.stderr ?? ''}`
    if (sub.status !== 127) fails.push(`无候选环境应 exit 127，实际 ${sub.status}${sub.error ? `（${sub.error.message}）` : ''}`)
    if (!out.includes('GSTS_PYTHON')) fails.push('无候选环境必须给出 GSTS_PYTHON 指引')
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true })
  }
  for (const f of fails) console.error(`FAIL  py.mjs --selftest  ${f}`)
  console.log(`SELFTEST py.mjs: ${fails.length ? 'FAIL' : 'PASS'}${ok.command ? `  (python ${ok.version} via ${ok.label})` : ''}`)
  return fails.length ? 1 : 0
}

function usage() {
  console.error('用法：node scripts/py.mjs <脚本.py> [参数…] | --print | --check | --selftest')
  return 2
}

function main() {
  const [flag] = process.argv.slice(2)
  if (flag === '--selftest') return selftest()
  if (flag === '--print' || flag === '--check') {
    const r = resolvePython()
    if (!r.command) return reportMissing(r), 127
    console.log(`python: ${r.exe} (${r.version}) via ${r.label}`)
    return 0
  }
  if (!flag || (flag.startsWith('-') && flag !== '-')) return usage() // "-" = 从标准输入读脚本，等价 python -
  const r = resolvePython()
  if (!r.command) return reportMissing(r), 127
  const res = spawnSync(r.exe, [...r.command.slice(1), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, ...UTF8_ENV },
  })
  if (res.error) {
    console.error(`[py] 无法启动 ${r.exe}：${res.error.message}`)
    return 1
  }
  return res.status ?? 1
}

process.exit(main())
