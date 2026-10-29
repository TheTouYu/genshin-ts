--[[==========================================================================
 tests-lua/hud_test.lua —— fb-input.lua（HUD + 输入桥）的离线单测（不依赖游戏/模拟器）
 跑法：cd /home/h/genshin-ts/examples/football && lua5.3 tests-lua/hud_test.lua
 判据：退出码 0 = 全绿；任一 FAIL ⇒ 打印得到/期望 + 退出码 1
 说明：纯 Lua 5.3。用假控件/假 game/假 script 触发真实脚本逻辑，验证 L1 逻辑层
      （文案、计时、横幅生命周期、按键→信号、全局变量读取、缺控件兜底）。
      它证明"逻辑算得对"，不证明"真机画得出来"（渲染仍需真机）。
=========================================================================]]

local SRC = 'lua/fb-input.lua'

local pass, fail = 0, 0
local fails = {}

local function fmt(v)
  if type(v) == 'string' then return '"' .. v .. '"' end
  if type(v) == 'number' then
    if v == math.floor(v) and math.abs(v) < 1e15 then return tostring(math.floor(v)) end
    return string.format('%.6g', v)
  end
  return tostring(v)
end

local function ok(cond, name, detail)
  if cond then
    pass = pass + 1
    io.write('PASS  ', name, '\n')
  else
    fail = fail + 1
    fails[#fails + 1] = name .. (detail and ('  <' .. detail .. '>') or '')
    io.write('FAIL  ', name, detail and ('  <' .. detail .. '>') or '', '\n')
  end
end

local function eq(got, want, name)
  ok(got == want, name, 'got=' .. fmt(got) .. ' want=' .. fmt(want))
end

-- ---------------------------------------------------------------- 假宿主
local function newControl(name)
  return { name = name, text = '', fontSize = 0, fontColor = 0,
           horizontalAlignment = '', verticalAlignment = '' }
end

local NAMES = { 'hud_title', 'hud_score', 'hud_timer', 'hud_toast', 'hud_state',
                'hud_k1', 'hud_k2', 'hud_k3', 'hud_k4', 'hud_k5', 'hud_k6' }

local function makeWorld()
  local w = { controls = {}, logs = {}, sent = {}, listeners = {}, globals = {}, handlers = {}, reads = {} }
  for _, n in ipairs(NAMES) do w.controls[n] = newControl(n) end
  w.host = {
    GetChild = function(_, name)
      local c = w.controls[name]
      if c == nil then error('no such child: ' .. tostring(name)) end
      return c
    end,
    AddKeyEventListener = function(_, ev, fn)
      w.listeners[#w.listeners + 1] = { ev = ev, fn = fn }
    end
  }
  return w
end

local function install(w)
  _G.script = { object = w.host, RegisterCustomVariableChangedHandler = function(_, et, name, cb)
    w.handlers[name] = cb
  end }
  _G.Enum = {
    KeyEventType = {
      KeyboardNormalAttackKeyDown = 'ev.p1', KeyboardCharacterSkill1KeyDown = 'ev.p2',
      KeyboardJumpKeyDown = 'ev.p3', KeyboardSprintKeyDown = 'ev.p4',
      KeyboardInteractKeyDown = 'ev.p5', KeyboardDropKeyDown = 'ev.p6'
    },
    CustomVariableEntityType = { PlayerSelf = 'ps', Level = 'lv' },
    -- 真机形态：对齐只收枚举（2026-10-29 日志 f23 实证）；模拟器收字符串
    TextHorizontalAlignment = { Left = 'hL', Middle = 'hM', Right = 'hR' },
    TextVerticalAlignment = { Top = 'vT', Middle = 'vM', Bottom = 'vB' }
  }
  _G.game = {
    ServerSignal = function(name)
      -- 一条信号 = 一次 AddInt×N + 一次 SendSignal；这里按"信号"计数（不是按参数个数）
      local params = {}
      return {
        AddInt = function(_, v) params[#params + 1] = v end,
        SendSignal = function()
          local sig = { name = name, params = params }
          sig.v = params[1]
          sig.state = params[2]
          w.sent[#w.sent + 1] = sig
        end
      }
    end,
    GetGlobalCustomVariableValue = function(et, name)
      w.reads[#w.reads + 1] = { et = et, name = name }
      return w.globals[name]
    end
  }
  _G.print = function(...)
    local parts = {}
    for i = 1, select('#', ...) do parts[#parts + 1] = tostring((select(i, ...))) end
    w.logs[#w.logs + 1] = table.concat(parts, ' ')
  end
end

local function hasLog(w, needle)
  for _, line in ipairs(w.logs) do
    if line:find(needle, 1, true) then return true, line end
  end
  return false
end

-- ---------------------------------------------------------------- 场景
local function boot()
  local w = makeWorld()
  install(w)
  -- 清掉上一轮注册的全局函数/表
  for _, k in ipairs({ 'OnStart', 'OnUpdate', 'OnDestroy', 'OnInit', 'setScore' }) do _G[k] = nil end
  dofile(SRC)
  return w
end

-- ① 加载 + OnStart 静态排版
local w = boot()
ok(type(OnStart) == 'function', '导出 OnStart', type(OnStart))
OnStart()

eq(w.controls.hud_title.text, '⚽ 千星足球 · 技能演练', 'title 文案')
eq(w.controls.hud_score.text, '0 : 0', 'score 初始 0 : 0')
eq(w.controls.hud_timer.text, '00:00', 'timer 初始 00:00')
eq(w.controls.hud_toast.text, '', 'toast 初始为空')
eq(w.controls.hud_state.text, '技能演练 · 按 ①~⑥ 触发', 'state 初始文案')
eq(w.controls.hud_k1.text, '① 推射 / 抢断', 'k1 文案')
eq(w.controls.hud_k6.text, '⑥ 球放回正前', 'k6 文案')

eq(w.controls.hud_score.fontSize, 46, 'score 字号 46')
eq(w.controls.hud_title.fontSize, 24, 'title 字号 24')
eq(w.controls.hud_k1.fontSize, 20, 'k1 字号 20')
eq(w.controls.hud_title.horizontalAlignment, 'hM', 'title 水平居中=枚举 TextHorizontalAlignment.Middle')
eq(w.controls.hud_title.verticalAlignment, 'vM', 'title 垂直居中=枚举 TextVerticalAlignment.Middle')
ok(w.controls.hud_title.fontColor ~= 0, 'title 颜色已设', tostring(w.controls.hud_title.fontColor))

eq(#w.listeners, 6, '注册 6 个键监听')
ok(hasLog(w, '[fb-in] onstart v2'), '日志 onstart v2')
ok(hasLog(w, 'listen ok 6/6'), '日志 listen ok 6/6')
ok(#w.sent >= 1 and w.sent[1].v == 0, 'OnStart 发心跳 key=0', fmt(w.sent[1] and w.sent[1].v))

-- ② 计时（OnUpdate 累计到整秒才刷）
OnUpdate(0.4)
eq(w.controls.hud_timer.text, '00:00', '0.4s 仍是 00:00')
OnUpdate(0.7)
eq(w.controls.hud_timer.text, '00:01', '1.1s → 00:01')
OnUpdate(60)
eq(w.controls.hud_timer.text, '01:01', '61.1s → 01:01')

-- ③ 按键 → 信号 + 横幅 + 状态行
local before = #w.sent
w.listeners[1].fn()                    -- ①
eq(#w.sent, before + 1, '按 ① 发一条信号')
eq(w.sent[#w.sent].v, 1, '信号 keyId=1')
eq(w.controls.hud_toast.text, '① 推射 / 抢断', '按 ① 横幅文案')
eq(w.controls.hud_state.text, '① 推射 / 抢断 · 已触发', '按 ① 状态行')
ok(hasLog(w, '[fb-in] key 1'), '日志 key 1')

-- ④ 横幅生命周期（1.2s 后自清）
OnUpdate(0.6)
eq(w.controls.hud_toast.text, '① 推射 / 抢断', '0.6s 横幅仍在')
OnUpdate(0.7)
eq(w.controls.hud_toast.text, '', '1.3s 横幅自清')

-- ⑤ 全局自定义变量读取（服务端写 fb_score_a/b → OnStart 读到）
local w2 = makeWorld()
w2.globals.fb_score_a = 3
w2.globals.fb_score_b = 2
install(w2)
for _, k in ipairs({ 'OnStart', 'OnUpdate', 'OnDestroy', 'OnInit', 'setScore' }) do _G[k] = nil end
dofile(SRC)
OnStart()
eq(w2.controls.hud_score.text, '3 : 2', '启动即读到全局变量 3:2')
ok(w2.handlers.fb_score_a ~= nil, '注册了 fb_score_a 变化回调')
-- 服务端改值 → 回调刷新
w2.globals.fb_score_a = 4
w2.handlers.fb_score_a()
eq(w2.controls.hud_score.text, '4 : 2', '变量变化回调刷新 4:2')

-- ⑥ 外部 setScore（进球事件驱动）
setScore(5, 4)
eq(w2.controls.hud_score.text, '5 : 4', 'setScore 改比分')
eq(w2.controls.hud_toast.text, '进球！5 : 4', 'setScore 弹进球横幅')

-- ⑦ 缺控件兜底：删掉 hud_state，脚本不崩且只报一次
local w3 = makeWorld()
w3.controls.hud_state = nil
install(w3)
for _, k in ipairs({ 'OnStart', 'OnUpdate', 'OnDestroy', 'OnInit', 'setScore' }) do _G[k] = nil end
dofile(SRC)
local okStart = pcall(OnStart)
ok(okStart, '缺控件时 OnStart 不抛错')
ok(hasLog(w3, 'hud-miss hud_state'), '日志 hud-miss hud_state')
local okUpd = pcall(OnUpdate, 0.5)
ok(okUpd, '缺控件时 OnUpdate 不抛错')

-- ⑧ 未知键事件（枚举缺名时的兜底路径）：把 KeyEventType 清空，listen 应全失败但不崩
local w4 = makeWorld()
install(w4)
_G.Enum.KeyEventType = {}
for _, k in ipairs({ 'OnStart', 'OnUpdate', 'OnDestroy', 'OnInit', 'setScore' }) do _G[k] = nil end
dofile(SRC)
local okNoEnum = pcall(OnStart)
ok(okNoEnum, '枚举缺名时 OnStart 不抛错（走字符串兜底）')
ok(hasLog(w4, 'listen ok 6/6'), '枚举缺名仍靠字符串兜底注册 6 个键')

-- ---------------------------------------------------------------- 汇总
io.write('\n========================================\n')
io.write(string.format('HUD 单测：PASS %d / FAIL %d\n', pass, fail))
if fail > 0 then
  io.write('失败项：\n')
  for _, f in ipairs(fails) do io.write('  - ', f, '\n') end
  os.exit(1)
end
io.write('总判定: PASS ✅\n')
os.exit(0)
