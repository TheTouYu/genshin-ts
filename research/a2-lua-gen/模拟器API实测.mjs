#!/usr/bin/env node
// 官方客户端 Lua API 面 × 沙箱模拟器实现 —— 全量存在性/行为实测
// 依据：research/a2-lua-gen/api面清单.md（官方文档 mhtakr07vej4 镜像提取）
// 对照对象：miliastra-beyond-simulator client/lua-runtime（fengari）
// 用法：node research/a2-lua-gen/模拟器API实测.mjs
import { createRuntime } from '/home/h/miliastra-beyond-simulator/client/lua-runtime/src/index.js'

const R = { PASS: [], DIFF: [], MISS: [] }
const push = (st, name, detail) => R[st].push(detail ? `${name} | ${detail}` : name)

// ── ① 官方 API 清单（来自 api面清单.md，纸面知识） ──
const GAME_F = ['DestroyClientUIControl','FindClientUIRoot','GetClientUIControl','GetClientUIRoots','GetControllerFocus','GetControllerLeftStickAxis','GetControllerRightStickAxis','GetCursorUIPos','GetDevice','GetGlobalCustomVariableValue','GetLanguageType','GetStageMode','GetText','GetUICanvasSize','InstantiateClientUIControl','IsAudioAlive','IsLevelTimePaused','IsTestPlay','PauseLevelTime','PlayAudio2D','PrintClientUITree','ServerSignal','SetControllerFocus','StopAudio','Tween','TweenSequence']
const LIFECYCLE = ['OnInit','OnStart','OnEnable','OnUpdate','OnLevelUpdate','OnDisable','OnDestroy']
const SCRIPT_M = ['EnableUpdate','GetParam','Invoke','RegisterCustomVariableChangedHandler','RegisterServerSignalHandler','UnregisterCustomVariableChangedHandler','UnregisterServerSignalHandler']
const SIGNAL_M = ['AddParam','AddInt','AddIntList','AddFloat','AddFloatList','AddString','AddStringList','AddVector3','AddVector3List','AddBool','AddBoolList','AddGuid','AddGuidList','AddEntity','AddEntityList','AddPrefabId','AddPrefabIdList','AddConfigId','AddConfigIdList','SendSignal']
const TWEEN_M = ['Complete','Kill','Pause','Play','Restart','Resume','SetEase','SetLoops','SetOnComplete','SetOnStepComplete','SetRelative']
const SEQ_M = ['Append','AppendCallback','AppendInterval','Complete','Insert','InsertCallback','Join','Kill','Pause','Play','Restart','Resume','SetLoops','SetOnComplete','SetOnStepComplete']
const BASE_M = ['AddKeyEventListener','AddNavigationEventListener','FindChild','GetAnchorMax','GetAnchorMin','GetAnchoredPosition','GetChild','GetChildren','GetControllerNavigation','GetLocalRotation','GetLocalScale','GetPivot','GetScript','GetScriptByPath','GetScripts','GetSiblingIndex','GetSizeDelta','RemoveAllKeyEventListeners','RemoveAllNavigationEventListeners','RemoveKeyEventListener','SetAnchorMax','SetAnchorMin','SetAnchoredPosition','SetAsFirstSibling','SetAsLastSibling','SetControllerNavigation','SetLocalRotation','SetLocalScale','SetPivot','SetSiblingIndex','SetSizeDelta','SetActive','SetVisible']
const COLOR_F = ['color.FromRGB','color.FromRGBA','color.ToRGBA','color.construct'] // 官方名（api面清单 §三）
const ENUM_FIELDS = ['Name','FullName','EnumType']

function makeRt() {
  const rt = createRuntime()
  const root = rt.addRoot({ active: true, name: 'Root', kind: 'container' })
  return { rt, root }
}
function run(rt, source) {
  const { root } = { root: rt.roots?.[0] }
  rt.mountScript({ path: 'probe-' + Math.random().toString(36).slice(2, 6), control: rt.roots[0], source })
  return rt.logs.map((l) => l.text).join('\n')
}

// ── ② 存在性探测：Lua 侧批量 typeof，JS 侧对照 ──
{
  const { rt } = makeRt()
  const out = run(rt, `
function OnStart()
  for _, f in ipairs({${GAME_F.map((f) => `'${f}'`).join(',')}}) do
    print('game.'..f, type(game[f]))
  end
  for _, m in ipairs({${SCRIPT_M.map((m) => `'${m}'`).join(',')}}) do
    print('script:'..m, type(script[m]))
  end
  local sig = game.ServerSignal('probe')
  for _, m in ipairs({${SIGNAL_M.map((m) => `'${m}'`).join(',')}}) do
    print('signal:'..m, type(sig[m]))
  end
  local tw = game.Tween(nil, {x=10}, 1)
  for _, m in ipairs({${TWEEN_M.map((m) => `'${m}'`).join(',')}}) do
    print('tween:'..m, type(tw[m]))
  end
  local sq = game.TweenSequence()
  for _, m in ipairs({${SEQ_M.map((m) => `'${m}'`).join(',')}}) do
    print('seq:'..m, type(sq[m]))
  end
  local c = game.FindClientUIRoot('Root')
  for _, m in ipairs({${BASE_M.map((m) => `'${m}'`).join(',')}}) do
    print('base:'..m, type(c[m]))
  end
  print('color.FromRGB', type(Color and Color.FromRGB))
  print('color.FromRGBA', type(Color and Color.FromRGBA))
  print('color.ToRGBA', type(Color and Color.ToRGBA))
  local okC, cv = pcall(function() return Color(1, 2, 3) end)
  print('color.construct', okC, type(cv))
  local e = game.GetDevice()
  print('enum.Name', type(e and e.Name))
  print('enum.FullName', type(e and e.FullName))
  print('enum.EnumType', type(e and e.EnumType))
end`)
  const found = new Map(out.split('\n').filter((l) => l.includes('\t')).map((l) => [l.split('\t')[0], l.split('\t')[1]]))
  for (const f of GAME_F) found.get(`game.${f}`) === 'function' ? push('PASS', `game.${f}`) : push(found.get(`game.${f}`) === undefined ? 'MISS' : 'DIFF', `game.${f}`, `type=${found.get(`game.${f}`)}`)
  for (const m of SCRIPT_M) found.get(`script:${m}`) === 'function' ? push('PASS', `script:${m}`) : push(found.get(`script:${m}`) === undefined ? 'MISS' : 'DIFF', `script:${m}`, `type=${found.get(`script:${m}`)}`)
  for (const m of SIGNAL_M) found.get(`signal:${m}`) === 'function' ? push('PASS', `signal:${m}`) : push(found.get(`signal:${m}`) === undefined ? 'MISS' : 'DIFF', `signal:${m}`, `type=${found.get(`signal:${m}`)}`)
  for (const m of TWEEN_M) found.get(`tween:${m}`) === 'function' ? push('PASS', `tween:${m}`) : push(found.get(`tween:${m}`) === undefined ? 'MISS' : 'DIFF', `tween:${m}`, `type=${found.get(`tween:${m}`)}`)
  for (const m of SEQ_M) found.get(`seq:${m}`) === 'function' ? push('PASS', `seq:${m}`) : push(found.get(`seq:${m}`) === undefined ? 'MISS' : 'DIFF', `seq:${m}`, `type=${found.get(`seq:${m}`)}`)
  for (const m of BASE_M) found.get(`base:${m}`) === 'function' ? push('PASS', `base:${m}`) : push(found.get(`base:${m}`) === undefined ? 'MISS' : 'DIFF', `base:${m}`, `type=${found.get(`base:${m}`)}`)
  for (const f of ['color.FromRGB', 'color.FromRGBA', 'color.ToRGBA']) found.get(f) === 'function' ? push('PASS', f) : push('DIFF', f, `type=${found.get(f)}`)
  push(found.get('color.construct') === 'true' ? 'PASS' : 'DIFF', 'Color() 构造可调用', `ok=${found.get('color.construct')}`)
  for (const f of ENUM_FIELDS) found.get(`enum.${f}`) === 'string' ? push('PASS', `EnumItem.${f}`) : push(found.get(`enum.${f}`) === undefined ? 'MISS' : 'DIFF', `EnumItem.${f}`, `type=${found.get(`enum.${f}`)}`)
  rt.destroy?.()
}

// ── ③ 行为实测：生命周期顺序 / 时停语义 / SetLoops(-1) / GetUICanvasSize ──
{
  const rt = createRuntime()
  rt.addRoot({ active: true, name: 'L', kind: 'container' })
  rt.mountScript({ path: 'life', control: rt.roots[0], source: `
local order = {}
function OnInit() order[#order+1] = 'OnInit'; print('phase OnInit') end
function OnStart() order[#order+1] = 'OnStart'; print('phase OnStart'); script:EnableUpdate(true) end
function OnEnable() order[#order+1] = 'OnEnable'; print('phase OnEnable') end
function OnUpdate() print('tick U') end
function OnLevelUpdate() print('tick L') end
function OnDisable() order[#order+1] = 'OnDisable' end
function OnDestroy() order[#order+1] = 'OnDestroy' end` })
  rt.step(1 / 30); rt.step(1 / 30)
  const order0 = rt.logs.map((l) => l.text).filter((t) => t.startsWith('phase ')).map((t) => t.slice(6))
  const expect = ['OnInit', 'OnEnable', 'OnStart']
  push(JSON.stringify(order0.slice(0, 3)) === JSON.stringify(expect) ? 'PASS' : 'DIFF', '生命周期顺序', `实测=${order0.join('>')}`)
  // 时停：PauseLevelTime 后再步进——官方语义 OnUpdate 继续而 OnLevelUpdate 停
  rt.step(1 / 30)
  const before = rt.logs.map((l) => l.text).join('\n')
  const uCount = (before.match(/^tick U$/gm) || []).length
  const lCount = (before.match(/^tick L$/gm) || []).length
  // pause 生效判定：mount pause（其 OnStart 即时触发）之后的这次 step 里，L 不应增长、U 应 +1
  rt.mountScript({ path: 'pause', control: rt.roots[0], source: `
function OnStart() game.PauseLevelTime(true) print('paused', game.IsLevelTimePaused()) end` })
  const uBefore = uCount, lBefore = lCount
  rt.step(1 / 30)
  const after = rt.logs.map((l) => l.text).join('\n')
  const uAfter = (after.match(/^tick U$/gm) || []).length
  const lAfter = (after.match(/^tick L$/gm) || []).length
  push(uAfter === uBefore + 1 ? 'PASS' : 'DIFF', '时停:OnUpdate继续', `U ${uBefore}→${uAfter}`)
  push(lAfter === lBefore ? 'PASS' : 'DIFF', '时停:OnLevelUpdate停', `L ${lBefore}→${lAfter}`)
  push(/paused\ttrue/.test(after) ? 'PASS' : 'DIFF', 'IsLevelTimePaused=true', '')
  rt.destroy?.()
}
{
  // SetLoops(-1) 无限循环 + SetEase 链式返回 self
  const rt = createRuntime()
  rt.addRoot({ active: true, name: 'T', kind: 'container' })
  rt.mountScript({ path: 'tw', control: rt.roots[0], source: `
function OnStart()
  local c = game.FindClientUIRoot('T')
  local tw = game.Tween(c, { anchoredPositionX = 100 }, 1)
  local r1 = tw:SetLoops(-1)
  local r2 = tw:SetEase(Enum.EaseType.Linear)
  print('chain', r1 == tw, r2 == tw)
  local steps = 0
  tw:SetOnStepComplete(function() steps = steps + 1 end)
  tw:Play()
  _G.steps = function() return steps end
end` })
  for (let i = 0; i < 130; i++) rt.step(1 / 30) // ~4.3s，1s/tween → 若无限应 >3 次完成
  const out = rt.logs.map((l) => l.text).join('\n')
  push(/chain\ttrue\ttrue/.test(out) ? 'PASS' : 'DIFF', 'Tween 链式返回自身', out.match(/chain.*/)?.[0] ?? 'no-output')
  rt.destroy?.()
}
{
  const { rt } = makeRt()
  const out = run(rt, `
function OnStart()
  local w, h = game.GetUICanvasSize()
  print('canvas', w, h)
  print('device', tostring(game.GetDevice()))
  print('language', tostring(game.GetLanguageType()))
end`)
  push(/canvas\t1600\t900/.test(out) ? 'PASS' : 'DIFF', 'GetUICanvasSize', out.match(/canvas.*/)?.[0] ?? 'no-output')
  rt.destroy?.()
}

// ── ④ 汇总 ──
const total = R.PASS.length + R.DIFF.length + R.MISS.length
console.log(`\n===== 官方API面 × 模拟器实测汇总：${total} 项 =====`)
console.log(`PASS ${R.PASS.length} | DIFF ${R.DIFF.length} | MISS ${R.MISS.length}\n`)
if (R.DIFF.length) { console.log('--- DIFF（存在但类型不符）---'); R.DIFF.forEach((x) => console.log('  ' + x)) }
if (R.MISS.length) { console.log('--- MISS（模拟器未实现）---'); R.MISS.forEach((x) => console.log('  ' + x)) }
