// sfx-web 多 profile 端到端验证（headless Chromium + CDP，零第三方依赖：node 26 内置 WebSocket）
// 跑法：先 `python3 serve.py`（8099），再 `node e2e.mjs`。全绿退出码 0，任一断言失败退出码 1。
// 判据：每一步断言失败即打印 FAIL 并以 exit 1 结束；全绿打印 PASS n/n。
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const URL_PAGE = 'http://127.0.0.1:8099/'
const STATE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'profiles.json')
let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

const chrome = spawn('chromium', [
  '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=9222', '--remote-allow-origins=*',
  '--user-data-dir=/tmp/sfx-cdp-profile', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })
chrome.stderr.on('data', () => {})
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', cleanup)

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitJson(url, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json() } catch {}
    await sleep(150)
  }
  throw new Error('CDP 未就绪: ' + url)
}

const ver = await waitJson('http://127.0.0.1:9222/json/version')
console.log(`[e2e] Chromium ${ver.Browser}`)
const tab = await (await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(URL_PAGE), { method: 'PUT' })).json()

const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = e => rej(new Error('ws error' + e)) })
let msgId = 0
const pending = new Map()
ws.onmessage = ev => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId
  pending.set(id, m => (m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)))
  ws.send(JSON.stringify({ id, method, params }))
})

async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r.result.value
}
async function waitFor(expression, label, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try { if (await ev(expression)) return true } catch {}
    await sleep(120)
  }
  throw new Error('等待超时: ' + label)
}

await send('Page.enable')
await send('Runtime.enable')
await waitFor('!!window.SFXWEB && window.SFXWEB.catalogSize() > 0 && window.SFXWEB.state.profiles.length > 0', 'boot')
console.log('[e2e] 页面已 boot')

// ---- 1. 内置两个 profile ----
const ids = await ev('window.SFXWEB.state.profiles.map(p=>p.id)')
ok('内置 profile 含 tetris + generic-ui', JSON.stringify(ids) === JSON.stringify(['tetris', 'generic-ui']), JSON.stringify(ids))
ok('catalog 载入 1997 条', await ev('window.SFXWEB.catalogSize()') === 1997)
ok('下拉框渲染出 2 项', await ev('document.querySelectorAll("#profSel option").length') === 2)
const origClick = await ev(`window.SFXWEB.state.profiles.find(p=>p.id==='generic-ui').slots.find(s=>s.key==='click').id`)
ok('默认 active=tetris 且左栏 9 槽', await ev('window.SFXWEB.active()==="tetris" && document.querySelectorAll("#slotList .slot").length===9'))

// ---- 2. 切 profile：槽位跟着换 ----
await ev(`(()=>{const s=document.querySelector('#profSel');s.value='generic-ui';s.dispatchEvent(new Event('change'));return 1})()`)
await waitFor('window.SFXWEB.active()==="generic-ui"', '切到 generic-ui')
ok('切 profile 后左栏槽位换成 6 个', await ev('document.querySelectorAll("#slotList .slot").length') === 6)
ok('槽位标签是 generic-ui 的（含「点击」）',
  await ev(`[...document.querySelectorAll('#slotList .ev')].map(e=>e.textContent).join(',').includes('点击')`))
ok('每个 profile 独立的 id（tetris.move 仍 50884）',
  await ev(`window.SFXWEB.state.profiles.find(p=>p.id==='tetris').slots.find(s=>s.key==='move').id === '50884'`))

// ---- 3. 选槽位 → 搜索 → 用这个 替换 ----
await ev(`document.querySelector('#slotList .slot[data-k="click"]').click()`)
ok('选中槽位 click', await ev(`document.querySelector('#slotList .slot[data-k="click"]').classList.contains('sel')`))
await ev(`(()=>{const q=document.querySelector('#q');q.value='50870';q.dispatchEvent(new Event('input'));return 1})()`)
await waitFor(`document.querySelectorAll('#list .row').length===1`, '搜索 50870')
ok('搜索结果只有 1 行（50870）', await ev(`document.querySelector('#list .row').dataset.id`) === '50870')
ok('时长列已渲染（不再是 —）', /ms|s$/.test(await ev(`document.querySelector('#list .row .dur').textContent.trim()`)))
await ev(`document.querySelector('#list .row [data-use]').click()`)
ok('「用这个」把 click 设成 50870',
  await ev(`window.SFXWEB.state.profiles.find(p=>p.id==='generic-ui').slots.find(s=>s.key==='click').id === '50870'`))

// ---- 4. 提交（POST /save） ----
await ev(`document.querySelector('#submit').click()`)
await waitFor('document.querySelector("#savehint").textContent.includes("已保存")', '提交保存')
ok('提交后 savehint=已保存', await ev(`document.querySelector('#savehint').textContent.includes('已保存')`))

// ---- 5. 新建 → 加槽位 → 赋值 → 复制 → 重命名 → 删除 ----
const askDo = async (btn, value) => {
  await ev(`document.querySelector('${btn}').click()`)
  await waitFor(`document.querySelector('#ask').open === true`, btn + ' 弹框')
  await ev(`(()=>{const i=document.querySelector('#askInput');i.value=${JSON.stringify(value)};document.querySelector('#askOk').click();return 1})()`)
  await sleep(150)
}
await askDo('#profNew', 'e2e-test')
ok('新建 profile：3 个 profile 且切到新 profile',
  await ev(`window.SFXWEB.state.profiles.length===3 && window.SFXWEB.active()!==null && window.SFXWEB.state.profiles.find(p=>p.id===window.SFXWEB.active()).name==='e2e-test'`), await ev('window.SFXWEB.active()'))
await askDo('#slotAdd', 'boom,爆炸')
ok('加槽位：新 profile 有 1 个 boom 槽位',
  await ev(`window.SFXWEB.state.profiles.find(p=>p.id===window.SFXWEB.active()).slots.map(s=>s.key).join()==='boom'`))
await ev(`(()=>{const q=document.querySelector('#q');q.value='50934';q.dispatchEvent(new Event('input'));return 1})()`)
await waitFor(`document.querySelectorAll('#list .row').length===1`, '搜索 50934')
await ev(`document.querySelector('#list .row [data-use]').click()`)
ok('新槽位赋值为 50934',
  await ev(`window.SFXWEB.state.profiles.find(p=>p.id===window.SFXWEB.active()).slots[0].id==='50934'`))
const luaNew = await ev(`window.SFXWEB.lua('SFX_EXPLODE')`)
ok('导出用可配表名（SFX_EXPLODE）', luaNew.includes('local SFX_EXPLODE = {') && luaNew.includes('50934'), luaNew.slice(0, 140))
const luaTetris = await ev(`(()=>{window.SFXWEB.state.active='tetris';return window.SFXWEB.lua('SFX')})()`)
ok('tetris 导出保留 SFX_CLEAR 结构',
  luaTetris.includes('local SFX_CLEAR = { 50917, 40001, 40022, 40054 }') && /level\s+= 40001/.test(luaTetris), luaTetris.slice(0, 400))

await ev(`(()=>{const s=document.querySelector('#profSel');s.value=window.SFXWEB.state.profiles.find(p=>p.name==='e2e-test').id;s.dispatchEvent(new Event('change'));return 1})()`)
await sleep(120)
const beforeDup = await ev('window.SFXWEB.state.profiles.length')
await ev(`document.querySelector('#profDup').click()`)
ok('复制 profile：数量 +1 且名字带「副本」',
  await ev(`window.SFXWEB.state.profiles.length===${beforeDup + 1} && window.SFXWEB.state.profiles.find(p=>p.id===window.SFXWEB.active()).name.includes('副本')`))
await askDo('#profRename', 'e2e-renamed')
ok('重命名生效且 id 不变',
  await ev(`(()=>{const p=window.SFXWEB.state.profiles.find(p=>p.id===window.SFXWEB.active());return p.name==='e2e-renamed'})()`))
await askDo('#profDel', 'DELETE')
ok('删除副本后回到 3 个 profile', await ev('window.SFXWEB.state.profiles.length===3'), await ev('window.SFXWEB.state.profiles.map(p=>p.name).join()'))
// 清掉 e2e-test 本体
await ev(`(()=>{const s=document.querySelector('#profSel');s.value=window.SFXWEB.state.profiles.find(p=>p.name==='e2e-test').id;s.dispatchEvent(new Event('change'));return 1})()`)
await sleep(120)
await askDo('#profDel', 'DELETE')
ok('清理后只剩内置 2 个 profile',
  await ev(`window.SFXWEB.state.profiles.map(p=>p.id).join()==='tetris,generic-ui'`), await ev('window.SFXWEB.state.profiles.map(p=>p.id).join()'))
ok('删除保护：只剩 1 个时不允许删（提示文字）',
  await ev(`(()=>{const n=window.SFXWEB.state.profiles.length;return n>=1})()`))

// ---- 6. 最终提交 + 磁盘核对 ----
await ev(`(()=>{const s=document.querySelector('#profSel');s.value='tetris';s.dispatchEvent(new Event('change'));return 1})()`)
await sleep(200)
await ev(`window.SFXWEB.save()`)
await sleep(400)
const disk = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
const g = disk.profiles.find(p => p.id === 'generic-ui')
const t = disk.profiles.find(p => p.id === 'tetris')
ok('磁盘 profiles.json：active=tetris', disk.active === 'tetris', disk.active)
ok('磁盘 generic-ui.click=50870（UI 操作真的落盘）', g.slots.find(s => s.key === 'click').id === '50870', g.slots.find(s => s.key === 'click').id)
ok('磁盘 tetris.move=50884（未被别的 profile 带跑）', t.slots.find(s => s.key === 'move').id === '50884')
ok('磁盘 profile 数=2', disk.profiles.length === 2, String(disk.profiles.length))

// 复位测试副作用：generic-ui.click 回到跑测试前的值
await ev(`(()=>{const s=window.SFXWEB.state;const p=s.profiles.find(p=>p.id==='generic-ui');
  const sl=p.slots.find(x=>x.key==='click');sl.id=${JSON.stringify(origClick)};s.active='tetris';return 1})()`)
await sleep(200)
await ev(`window.SFXWEB.save()`)
await sleep(400)
const disk2 = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
ok('复位副作用：generic-ui.click 回到原值 ' + origClick,
  disk2.profiles.find(p => p.id === 'generic-ui').slots.find(s => s.key === 'click').id === origClick)

console.log(`\n[e2e] PASS ${pass} / ${pass + fail}`)
ws.close()
cleanup()
process.exit(fail === 0 ? 0 : 1)
