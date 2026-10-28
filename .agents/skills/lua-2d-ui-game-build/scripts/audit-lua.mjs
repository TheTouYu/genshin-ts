#!/usr/bin/env node
/**
 * audit-lua.mjs —— 千星沙箱 2D UI（Lua）工程静态审计
 *
 * 把技能里"能机械判定"的判据做成可跑命令。**它不是证明，是报警器**：
 *   PASS 只表示这一项没命中已知风险形态；界面是否正确仍必须出图核对。
 *
 * 用法：
 *   node audit-lua.mjs lua/main.lua
 *   node audit-lua.mjs lua/main.lua lua/tetris/config.lua
 *   node audit-lua.mjs --dir lua/            # 递归扫该目录下全部 .lua
 *   node audit-lua.mjs lua/main.lua --json   # 机器可读
 *
 * 退出码：0 = 无 FAIL；1 = 有 FAIL（WARN 不影响退出码）
 *
 * 判据出处：见技能 references/13-device.md（200-local / SetVisible）、
 *   12-deploy.md（注入版占位符）、05-layer.md（ipairs 截断 / pcall 静默）、
 *   03-input.md（DAS 兜底）、17-symptoms.md（锚点清单）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const LOCAL_BUDGET = 150 // 真机硬限 200，留 50 余量给 "local function 近似双计"

/** 关键日志锚点：缺了就说明某条链路可能没接上（或没实现） */
const ANCHORS = [
  ['hud inst n=', 'HUD 双写计数（层序 05-layer.md §2）'],
  ['das stop reason=', 'DAS 时间上限兜底（03-input.md §2）'],
  ['settle reorder', '结算层重建顺序（05-layer.md §3）'],
  ['lua-error', '运行时错误落盘（01-verification.md 陷阱 4）'],
  ['bg overflow', '背景池溢出报警（11-performance.md §6）'],
  ['hold swap', 'Hold 交换（02-gameplay.md §3）'],
  ['module ok', '模块加载（12-deploy.md §3）'],
  ['tpl guid=', '模板探测（12-deploy.md §4）'],
]

function collect(files) {
  const out = []
  for (const f of files) {
    let st
    try { st = statSync(f) } catch { console.error(`skip (not found): ${f}`); continue }
    if (st.isDirectory()) {
      for (const e of readdirSync(f)) out.push(...collect([join(f, e)]))
    } else if (f.endsWith('.lua')) {
      out.push(f)
    }
  }
  return out
}

function audit(file) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  const res = []
  const push = (level, name, detail) => res.push({ level, name, detail })

  // 1) local 预算（真机 200-local 硬限，本机 loadfile 会放过）
  const localDecl = lines.filter(l => /^local\s/.test(l)).length
  const localFn = lines.filter(l => /^local\s+function\s/.test(l)).length
  const est = localDecl + localFn // local function 近似双计
  if (localDecl > LOCAL_BUDGET) {
    push('FAIL', 'local 预算', `${localDecl} > ${LOCAL_BUDGET}（真机硬限 200；把大函数改成 FN.x = function() 挂表）`)
  } else if (est > 180) {
    push('WARN', 'local 预算', `行首 local ${localDecl}（含 local function ${localFn}，估计实占 ≈${est}）——逼近 200 上限`)
  } else {
    push('PASS', 'local 预算', `行首 local ${localDecl} / 预算 ${LOCAL_BUDGET}（含 local function ${localFn}）`)
  }

  // 2) 注入版占位符（真机白屏的头号原因）
  const placeholder = lines
    .map((l, i) => ({ l, i: i + 1 }))
    .filter(({ l }) => /__GUID_[A-Z]+__/.test(l) && !/^\s*--/.test(l))
  if (placeholder.length) {
    push('FAIL', '注入版占位符', `非注释行出现 ${placeholder.length} 处 __GUID_*__（首处 L${placeholder[0].i}）——必须用 build 注入版；判据用 /\\w+ = \\{ [0-9]+/ 数字形态`)
  } else {
    push('PASS', '注入版占位符', '非注释行无 __GUID_*__（注意：用原文直写会 nil→ipairs 截断→探测失败→无声死）')
  }

  // 3) ipairs({...}) 成员表（遇 nil 静默截断）
  const ipairsLit = lines.filter(l => /ipairs\s*\(\s*\{/.test(l) && !/^\s*--/.test(l)).length
  if (ipairsLit) {
    push('WARN', 'ipairs 字面量表', `${ipairsLit} 处 ipairs({...})——表里出现 nil 会静默截断；销毁/成员表改用固定槽 + 数字 for`)
  } else {
    push('PASS', 'ipairs 字面量表', '无 ipairs({...}) 用法')
  }

  // 4) pcall 静默（吞错误不留痕）
  const pcallN = (src.match(/\bpcall\s*\(/g) || []).length
  const failLog = (src.match(/ui fail|pcall fail|cursor listen fail|noteFail/g) || []).length
  if (pcallN > 0 && failLog === 0) {
    push('FAIL', 'pcall 静默', `${pcallN} 处 pcall 但没有任何失败日志——真机 API 报错会被吞，表现为"文字乱位/大问号"且无错误`)
  } else if (pcallN > 0) {
    push('PASS', 'pcall 静默', `${pcallN} 处 pcall，失败日志 ${failLog} 处`)
  } else {
    push('PASS', 'pcall 静默', '无 pcall')
  }

  // 5) SetVisible（真机对运行时实例不可靠）
  const setVis = (src.match(/SetVisible/g) || []).length
  push(setVis ? 'WARN' : 'PASS', 'SetVisible 使用',
    setVis ? `${setVis} 处——真机对「运行时实例」不可靠（D581）；确认目标是服务端控件，实例用"挪出画布"兜底`
           : '未使用 SetVisible')

  // 6) 事件回调是否先路由实例（双屏连移的真因）
  // 兼容两种写法：listen('KeyboardXxxUp', fn) 与 listen(m.up, fn)（表驱动）
  const upCallbacks = (src.match(/listen\s*\(\s*(?:'[^']*Up'|"[^"]*Up"|[A-Za-z_][\w.]*\.up\b)/g) || []).length
  const route = (src.match(/routePlayer|routeTo/g) || []).length
  if (upCallbacks > 0 && route === 0) {
    push('FAIL', '事件路由', `${upCallbacks} 个 *Up 回调但无 routePlayer——多盘模式下会清错实例（按一下一直走）`)
  } else if (upCallbacks > 0) {
    push('PASS', '事件路由', `*Up 回调 ${upCallbacks} 个，路由函数 ${route} 处`)
  } else {
    push('PASS', '事件路由', '未发现 *Up 回调')
  }

  // 7) DAS 时间上限兜底
  const hasDasHold = /DAS_HOLD/.test(src)
  const hasDasStop = /das stop reason/.test(src)
  if (hasDasHold && hasDasStop) push('PASS', 'DAS 兜底', 'DAS_HOLD + das stop 日志都在')
  else if (hasDasHold || hasDasStop) push('WARN', 'DAS 兜底', `只有一半（DAS_HOLD=${hasDasHold} / das stop=${hasDasStop}）——上限触发时必须有日志`)
  else push('WARN', 'DAS 兜底', '未见 DAS 时间上限——若平台 Up 事件丢失会"按一下一直走"（建议加）')

  // 8) 文字收口（双写的前提）
  const setTextDef = /function\s+setText\s*\(/.test(src)
  const setTextCalls = (src.match(/\bsetText\s*\(/g) || []).length
  const hudInst = /HUD_INST/.test(src)
  if (setTextCalls > 20 && !hudInst) {
    push('WARN', '文字收口', `${setTextCalls} 处 setText 但无 HUD_INST 双写表——常驻文字可能被实例层盖住（层序铁律）`)
  } else if (setTextCalls > 0) {
    push('PASS', '文字收口', `setText 调用 ${setTextCalls} 处，HUD 双写表 ${hudInst ? '在' : '无'}`)
  }

  // 9) 框高判据（能不能找到 1.45 这个常量/算法）
  const hasFit = /1\.45/.test(src) || /FIT_RATIO/.test(src)
  push(hasFit ? 'PASS' : 'WARN', '框高判据',
    hasFit ? '找到 1.45 系数（h ≥ 1.45×size+4）' : '未见 1.45 系数——框高可能没按字号算（整行不画的高发原因）')

  // 10) 关键锚点齐全度
  const missing = ANCHORS.filter(([a]) => !src.includes(a)).map(([a, why]) => `${a}(${why})`)
  push(missing.length ? 'WARN' : 'PASS', '日志锚点',
    missing.length ? `缺 ${missing.length}/${ANCHORS.length}：${missing.map(m => m.split('(')[0]).join(' ')}`
                   : `全部 ${ANCHORS.length} 个锚点在位`)

  // 11) 规模信息（不是判据，是上下文）
  push('INFO', '规模', `${lines.length} 行 / ${(src.length / 1024).toFixed(0)}KB / setText ${setTextCalls} 处 / pcall ${pcallN} 处`)

  return { file, results: res }
}

// ---- CLI ----
const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const dirIdx = argv.indexOf('--dir')
let targets = argv.filter(a => !a.startsWith('--'))
if (dirIdx >= 0 && argv[dirIdx + 1]) targets = [argv[dirIdx + 1]]
if (!targets.length) {
  console.error('用法: node audit-lua.mjs <file.lua|dir> [--json]')
  process.exit(2)
}
const files = collect(targets)
if (!files.length) { console.error('没有找到 .lua 文件'); process.exit(2) }

let failed = 0
const report = files.map(f => {
  const r = audit(f)
  if (r.results.some(x => x.level === 'FAIL')) failed++
  return r
})

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  for (const r of report) {
    console.log(`\n=== ${r.file} ===`)
    for (const x of r.results) {
      const tag = x.level === 'FAIL' ? 'FAIL' : x.level === 'WARN' ? 'WARN' : x.level === 'INFO' ? 'INFO' : 'PASS'
      console.log(`[${tag}] ${x.name}: ${x.detail}`)
    }
  }
  const total = report.reduce((a, r) => a + r.results.length, 0)
  const fails = report.reduce((a, r) => a + r.results.filter(x => x.level === 'FAIL').length, 0)
  const warns = report.reduce((a, r) => a + r.results.filter(x => x.level === 'WARN').length, 0)
  console.log(`\nAUDIT-RESULT files=${files.length} checks=${total} fail=${fails} warn=${warns} verdict=${fails ? 'FAIL' : 'PASS'}`)
  console.log('注意：PASS 只代表没命中已知风险形态；界面正确性仍必须出图逐字核对（01-verification.md §4）。')
}
process.exit(failed ? 1 : 0)
