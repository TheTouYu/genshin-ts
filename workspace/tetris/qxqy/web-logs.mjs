#!/usr/bin/env node
// ============================================================================
// qxqy/web-logs.mjs —— 网页模拟器**全量日志落盘**（解决"只能看最近 100 行"）
//
// 背景（2026-10-30 用户令：「'只看得到最近 100 行' 那你就把这个修改好呀，这次是提高效率的关键」）：
//   模拟器网页的 `POST /api/play {action:"get"}` 只回**最后 100 条** Lua 日志，
//   而启动锚（`ctl menu.*`、`module ok`、`screen=`）通常在几十秒后就被演示日志刷掉。
//   于是排查用户真机/网页操作时，我只能靠"让用户再做一次、我立刻抓"这种低效往返。
//
// 做法：轮询 get，把每次返回的 100 行与本地已存缓冲做**最长后缀重叠**匹配，
//       只把新增部分追加进磁盘文件；日志文件是无上限的全量历史。
//
// 用法：
//   node qxqy/web-logs.mjs                      # 默认 127.0.0.1:4173，写 .scratch/logs/web-<时间>.log
//   node qxqy/web-logs.mjs --grep 'entry|ctl '  # 只把匹配行打到终端（文件仍是全量）
//   node qxqy/web-logs.mjs --out /tmp/x.log --interval 200
//   node qxqy/web-logs.mjs --once               # 抓一次快照就退出（给脚本用）
//
// 输出：
//   · 文件每行形如 `12:34:56.789 | <lua 日志原文>`
//   · 终端每 10s 一行心跳：`[web-logs] +N 行 / 累计 M 行 / 会话 canvas=WxH running=yes`
// ============================================================================
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k)
  if (i < 0) return d
  const v = process.argv[i + 1]
  return (v === undefined || v.startsWith('--')) ? true : v
}
const URL_BASE = String(arg('url', 'http://127.0.0.1:4173')).replace(/\/+$/, '')
const INTERVAL = Number(arg('interval', 250))
const GREP = arg('grep', null)
const ONCE = arg('once', false) === true
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '').replace(/-/g, '')
const OUT = resolve(String(arg('out', `.scratch/logs/web-${stamp}.log`)))

const re = GREP ? new RegExp(String(GREP)) : null
let buffer = []          // 已落盘的全量行（只保留尾部用于重叠匹配）
let total = 0
let lastBeat = Date.now()
let pending = 0

function logLine(text) {
  const ts = new Date().toTimeString().slice(0, 12)
  const line = `${ts} | ${text}`
  appendFileSync(OUT, line + '\n')
  total++
  pending++
  if (re && re.test(text)) console.log(line)
}

// 最长后缀重叠：找出 buffer 的尾部与 incoming 头部最长的公共段
function merge(incoming) {
  if (!incoming.length) return
  let k = Math.min(buffer.length, incoming.length)
  while (k > 0) {
    let ok = true
    for (let i = 0; i < k; i++) {
      if (buffer[buffer.length - k + i] !== incoming[i]) { ok = false; break }
    }
    if (ok) break
    k--
  }
  for (let i = k; i < incoming.length; i++) logLine(incoming[i])
  buffer = buffer.concat(incoming)
  if (buffer.length > 400) buffer = buffer.slice(-400)
}

const EDITOR = arg('editor', null)   // 传 sessionId 时改走编辑器会话（/editor/api/*）
const STARTER = arg('start', false) === true
let autoStarted = false
async function call(action, args) {
  // 两条通道：/api/play（预览页）与 /editor/api/*（编辑器页的试玩窗口，靠 sessionId 区分）
  const editor = EDITOR
  const url = editor
    ? (action === 'get' ? URL_BASE + '/editor/api/get' : URL_BASE + '/editor/api/play')
    : URL_BASE + '/api/play'
  const body = editor
    ? (action === 'get' ? { sessionId: editor } : { sessionId: editor, action, args })
    : { action, args }
  const r = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (editor && action === 'get' && j.ok) {
    const snap = j.value || {}
    // 编辑器 get 返回 { ...controller.get() }，日志可能挂在 logs 或 snapshot.logs
    return { ok: true, value: snap.snapshot || snap }
  }
  return j
}
async function fetchState() {
  let j = await call('get', { view: true, compact: true })
  if (EDITOR && j.ok) return j.value || {}
  // 会话没启动时自动拉起来（否则用户刷新页面也看不到东西，而我还以为在录）
  if (!j.ok && /has not started/i.test(String(j.error)) && (STARTER || !autoStarted)) {
    autoStarted = true
    console.log('[web-logs] 会话未启动 → 自动 start')
    j = await call('start', {})
  }
  if (!j.ok) {
    const msg = String(j.error || 'api error')
    if (/has not started/i.test(msg) && !EDITOR) {
      throw new Error(msg + ' —— 预览页没在跑。若你在**编辑器页**（/editor/）里试玩，'
        + '请带 --editor <sessionId>（试玩窗口地址栏 # 后面那串），那是另一条会话通道')
    }
    throw new Error(msg)
  }
  return j.value || {}
}

function extractLogs(v) {
  const logs = v.logs || []
  return logs.map((x) => (typeof x === 'string' ? x : String(x.text ?? x.line ?? JSON.stringify(x))))
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `# web-logs ${new Date().toISOString()} url=${URL_BASE}\n`)
console.log(`[web-logs] → ${OUT}`)

async function tick() {
  const v = await fetchState()
  merge(extractLogs(v))
  const now = Date.now()
  if (now - lastBeat > 10000) {
    lastBeat = now
    console.log(`[web-logs] +${pending} 行 / 累计 ${total} 行 / canvas=${v.canvasWidth}x${v.canvasHeight} running=${v.running}`)
    pending = 0
  }
}

if (ONCE) {
  await tick()
  console.log(`[web-logs] once: ${total} 行 → ${OUT}`)
  process.exit(0)
}

process.on('SIGINT', () => { console.log(`\n[web-logs] 停止，累计 ${total} 行 → ${OUT}`); process.exit(0) })
for (;;) {
  try { await tick() } catch (e) { console.error('[web-logs] ' + e.message) }
  await new Promise((r) => setTimeout(r, INTERVAL))
}
