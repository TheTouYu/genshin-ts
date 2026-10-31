--[[==========================================================================
 tests-lua/input_map_test.lua —— 输入层单源的 headless 验收（不依赖模拟器）
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/input_map_test.lua
 判据：输出全 PASS、退出码 0。

 这一份测试要证明四件事（对应任务书的 ①②③④）：
   A 动作表自洽：每个动作都有键；同一个键只属于一个动作（一键多动作必须在 M.ALIAS
     显式标 alias=true 并写理由——这里先造一个冲突证明闸门真的会响）
   B 跟 main.lua 的**现有注册点全量对照**：源码里每个 listen('...') 都已在表里；
     43 键兜底池与 ACTIONS 零交集；手柄 bases/PROBE 覆盖；收表前后的监听条数可复算
   C 触屏面板描述：槽位数/坐标（照抄 ui.lua 的公式）/层号 touch/lint 0 issue/越界 0；
     服务端退役按钮 btnA..btnF 的坐标与 qxqy/build.mjs 原文逐值相等
   D 注册与分发行为：一次注册（每键一条、dupes=0）、mock 下真走注册回调、
     栈式分发（上层消费后不再下传）、兜底池不抢已有动作的键
 ========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end
local function readfile(path)
  local f = io.open(ROOT .. '/' .. path, 'rb')
  if not f then return nil end
  local s = f:read('a')
  f:close()
  return s
end

local cfg      = load('lua/tetris/config.lua')
local layers   = load('lua/tetris/view_layers.lua')
local vnode    = load('lua/tetris/view_node.lua')
local platform = load('lua/tetris/platform.lua')
local imap     = load('lua/tetris/input_map.lua')
local vpadM    = load('lua/tetris/view_pad.lua')

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then
    pass = pass + 1
    print('PASS  ' .. name)
  else
    fail = fail + 1
    print('FAIL  ' .. name .. (extra ~= nil and (' :: ' .. tostring(extra)) or ''))
  end
end

local function has(list, v)
  for i = 1, #list do if list[i] == v then return true end end
  return false
end

-- 收集一个 issues 列表里是否有某 code
local function hasCode(issues, code, key)
  for i = 1, #issues do
    if issues[i].code == code and (key == nil or issues[i].key == key) then return true, issues[i] end
  end
  return false, nil
end

-- 从键名里抠出工匠槽号（KeyboardCraftspersonKey38Down → 38）
local function craftNum(name)
  return tonumber(name:match('KeyboardCraftspersonKey(%d+)Down'))
end

local V = vnode.new { layers = layers }
local PAD = vpadM.new { config = cfg }
local allKeys = imap.allKeys()

-- ===== A 动作表自洽（①②）=====
print('--- A 动作表')

local issues = imap.audit()
ok(#issues == 0, 'A1 动作表体检 0 issue（A1..A8 全过）',
  issues[1] and (issues[1].code .. ' ' .. issues[1].msg))

local st = imap.stats()
ok(st.actions == 22, 'A2 动作数 = 22（' .. st.actions .. '）')
ok(st.keys == 47, 'A3 动作表认领的键数 = 42 down + 5 up = 47（' .. st.keys .. '）')

-- 每个动作至少 1 个键（A1 已经兜住，但逐个点名更好读日志）
local emptyAction = nil
for _, a in ipairs({ 'left', 'right', 'rot', 'soft', 'hard', 'hold', 'restart', 'settle', 'help',
  'debugFill', 'back', 'level', 'mode1', 'mode2', 'mode3', 'mode4', 'confirm', 'roster',
  'skill1', 'skill2', 'skillSwitch', 'debugUnlock' }) do
  if #imap.namesOf(imap.ACTIONS, a) == 0 then emptyAction = a break end
end
ok(emptyAction == nil, 'A4 22 个动作每个都有键名', emptyAction)

-- 6 个玩家动作名必须与 main.lua doPlay 的分支字面量一致
local gameplay = { 'left', 'right', 'rot', 'soft', 'hard', 'hold' }
local missingGame = nil
for _, a in ipairs(gameplay) do
  if not imap.ACTIONS[a] then missingGame = a end
end
ok(missingGame == nil, 'A5 玩法 6 动作名与 doPlay 分支一致（left/right/rot/soft/hard/hold）', missingGame)

-- 任务书点名的语义齐全（重开/结算/说明/调试填行/模式选择/确认/返回；暂停=help 的既有语义）
ok(imap.ACTIONS.restart and imap.ACTIONS.settle and imap.ACTIONS.help
  and imap.ACTIONS.debugFill and imap.ACTIONS.mode1 and imap.ACTIONS.confirm
  and imap.ACTIONS.back, 'A6 restart/settle/help/debugFill/mode1/confirm/back 都在表里')

-- 同一个键不许出现在两个动作里（逐键建反查表，而不是信 audit 的实现）
local owner, dupKey = {}, nil
for a, list in pairs(imap.ACTIONS) do
  for i = 1, #list do
    if owner[list[i]] and owner[list[i]] ~= a then dupKey = list[i] end
    owner[list[i]] = a
  end
end
ok(dupKey == nil, 'A7 同一个键不在两个动作里', dupKey)

-- 松开键不能同时被当成按下键
local overlapUp = nil
for _, list in pairs(imap.UPKEYS) do
  for i = 1, #list do if owner[list[i]] then overlapUp = list[i] end end
end
ok(overlapUp == nil, 'A8 UPKEYS 与 ACTIONS 零交集', overlapUp)

-- 键名合法性（拼错的键在真机只打 listen fail，日志里很难看出来）
local badKey = nil
for i = 1, #allKeys do
  local okk, why = imap.validKey(allKeys[i])
  if not okk then badKey = allKeys[i] .. ' :: ' .. why end
end
ok(badKey == nil, 'A9 47 个键名全部合法（Keyboard*/Controller* + Down/Up）', badKey)

-- 别名闸门真的会响：造一个冲突 → A2；显式 alias=true + 理由 → 放行
local bad = {}
for a, list in pairs(imap.ACTIONS) do
  bad[a] = {}
  for i = 1, #list do bad[a][i] = list[i] end
end
bad.left[#bad.left + 1] = 'KeyboardCraftspersonKey14Down'      -- hold 的键塞进 left
local badIssues = imap.audit(bad)
local okA2, a2 = hasCode(badIssues, 'A2', 'KeyboardCraftspersonKey14Down')
ok(okA2, 'A10 一键两动作 → audit 报 A2（闸门有效）', a2 and a2.msg)
local aliasOk = { ['KeyboardCraftspersonKey14Down'] = { alias = true, note = '测试：显式认领' } }
local aliasIssues = imap.audit(bad, { alias = aliasOk })
local stillA2 = hasCode(aliasIssues, 'A2', 'KeyboardCraftspersonKey14Down')
ok(not stillA2, 'A11 显式 alias=true + note 后放行（A2 消失）')
local noNote = imap.audit(bad, { alias = { ['KeyboardCraftspersonKey14Down'] = { alias = true } } })
ok(hasCode(noNote, 'A7', 'KeyboardCraftspersonKey14Down'), 'A12 别名缺理由 → A7')
-- 真表当前是"零别名"，机制在位但没被用上
ok(next(imap.ALIAS) == nil, 'A13 当前零别名（收表后没有一键两动作）')

-- ===== B 与 main.lua 现有注册点全量对照（③）=====
print('--- B 对照 main.lua')

-- 本节是**迁移闸门**（两种口径，随 main.lua 的接线状态自动选）：
--   迁移前：main.lua 自己 listen ⇒ 把它的每个注册点逐个对照回动作表（全量，不许漏）
--   迁移后：main.lua 不再 listen ⇒ 改查"接线到位 + 没有回退"（不许又冒出第二条注册路径）
-- 判据：源码里还有 `local function listen(` / `local mapped = {` / 任何 listen('...') 字面量，
--       或 config 里还有 NUM.KEYMAP，就按迁移前口径。
local mainSrc = readfile('lua/main.lua')
ok(mainSrc ~= nil, 'B0 读得到 lua/main.lua')
mainSrc = mainSrc or ''

local literals = {}
for n in mainSrc:gmatch("listen%(%s*'([%w_]+)'") do literals[#literals + 1] = n end
local full, partial = {}, {}
for i = 1, #literals do
  if literals[i]:match('Down$') or literals[i]:match('Up$') then
    full[#full + 1] = literals[i]
  else
    partial[#partial + 1] = literals[i]
  end
end
local hasListenDef = mainSrc:find('local function listen(name, fn)', 1, true) ~= nil
local hasMapped = mainSrc:find('local mapped = {', 1, true) ~= nil
local mainLegacy = hasListenDef or hasMapped or #full > 0
local configLegacy = cfg.NUM.KEYMAP ~= nil
local legacy = mainLegacy or configLegacy
print('      mode = main:' .. (mainLegacy and 'legacy' or 'wired')
  .. ' config:' .. (configLegacy and 'legacy' or 'clean'))

ok(#full == 15 or #full == 0,
  'B1 main.lua 的字面 listen 数量 = 15（迁移前）/ 0（迁移后）（' .. #full .. '）', #full)

local missLit = nil
for i = 1, #full do
  if not has(allKeys, full[i]) then missLit = full[i] end
end
ok(missLit == nil, 'B2 每个字面键名都已收进 ACTIONS/UPKEYS（未收的必须显式列入 RETIRED）', missLit)

ok((#partial == 2 and partial[1] == 'KeyboardCraftspersonKey') or #partial == 0,
  'B3 模板串（…Key .. i .. Down）不算键名（' .. #partial .. ' 处）')

-- 模式键 1-4（不论迁移与否，动作表里必须都有）
local modeOk = true
for i = 1, 4 do
  local k = 'KeyboardCraftspersonKey' .. i .. 'Down'
  if not has(imap.namesOf(imap.ACTIONS, 'mode' .. i), k) then modeOk = false end
end
ok(modeOk, 'B4 模式键 1-4 收进 mode1..mode4')

-- 43 键兜底池：迁移前对照 main 的排除表；迁移后确认兜底循环已被杀掉
local mappedNums = {}
for n in mainSrc:gmatch('%[(%d+)%]%s*=%s*true') do mappedNums[tonumber(n)] = true end
local mappedCount = 0
for _ in pairs(mappedNums) do mappedCount = mappedCount + 1 end
local mainFallback = {}
for i = 1, 43 do
  if not mappedNums[i] then mainFallback[#mainFallback + 1] = i end
end

if hasMapped then
  -- 10 条 = 历史形态；16 条 = 接线第 1 步把 6 个重复注册的键补进排除表后的形态
  ok(mappedCount == 10 or mappedCount == 16,
    'B5 迁移前：main.lua 兜底排除表 10 条（Step1 补 6 条后 = 16）（' .. mappedCount .. '）', mappedCount)
  ok(#mainFallback == 43 - mappedCount,
    'B6 迁移前：兜底循环注册 ' .. (43 - mappedCount) .. ' 个键（10 条时 = 33；Step1 后 = 27）',
    #mainFallback)
else
  ok(mainSrc:find('for i = 1, 43 do', 1, true) == nil,
    'B5 迁移后：43 键兜底循环已删除（改由 fallbackPool 自动派生）')
  ok(mainSrc:find("'KeyboardCraftspersonKey' .. i", 1, true) == nil,
    'B6 迁移后：不再有 …Key' .. "'" .. '.. i .. 的字符串拼键名')
end

local pool = imap.fallbackPool()
ok(#pool == 27, 'B7 兜底池 27 个键（43 - 16 个已被动作认领；迁移前 main 是 33）', #pool)
-- 迁移进度读数：main 的兜底比收表池多注册几个键。6 = 6 个重复注册还在（接线 Step1 前）；
-- 0 = 已修。别的数字说明又冒出新的交叉，立刻红。
if hasMapped then
  local dupLeft = #mainFallback - #pool
  ok(dupLeft == 0 or dupLeft == 6,
    'B7b main 兜底比收表池多注册 ' .. dupLeft .. ' 个键（0=已修 / 6=待接线 Step1）', dupLeft)
end

local poolLeak = nil
local I0 = imap.new { log = function() end }
for i = 1, #pool do
  local a = I0:actionOf(pool[i])
  if a then poolLeak = pool[i] .. '→' .. a end
end
ok(poolLeak == nil, 'B8 兜底池与动作表零交集（每个键最多一条注册）', poolLeak)

-- 迁移前多注册、迁移后合并掉的 6 个键 = 本文件发现的历史重复注册点
local retiredKeys = {}
for i = 1, #imap.RETIRED do retiredKeys[imap.RETIRED[i].key] = imap.RETIRED[i] end
local expectRetired = { 11, 12, 13, 14, 16, 30 }
local retiredOk, retiredBad = true, nil
for _, n in ipairs(expectRetired) do
  local rec = retiredKeys['KeyboardCraftspersonKey' .. n .. 'Down']
  if not rec or not rec.action or not rec.reason or rec.reason == '' then
    retiredOk = false
    retiredBad = 'CraftspersonKey' .. n
  end
end
ok(#imap.RETIRED == 6 and retiredOk,
  'B9 6 个历史重复注册点（11/12/13/14/16/30）都在 RETIRED 里带 action+reason', retiredBad)

-- 退役条不能是"删了动作还留着退役条"：A6 已在 audit 里查，这里再点名一次
local retiredAudit = {}
for i = 1, #imap.RETIRED do
  if select(1, I0:actionOf(imap.RETIRED[i].key)) == nil then retiredAudit[i] = imap.RETIRED[i].key end
end
ok(#retiredAudit == 0, 'B10 RETIRED 的键仍然有动作（退役的是重复注册，不是动作）',
  retiredAudit[1])

-- 手柄：config.NUM.PAD.KEYS 16 条 + PROBE_NAMED 10 条
local PADK = cfg.NUM.PAD or {}
local padKeys = {}
for _, list in pairs(PADK.KEYS or {}) do
  for i = 1, #list do padKeys[#padKeys + 1] = list[i] end
end
local probeKeys = {}
for i = 1, #(PADK.PROBE_NAMED or {}) do
  probeKeys[#probeKeys + 1] = 'Controller' .. PADK.PROBE_NAMED[i] .. 'Down'
end
local unbound = {}
for i = 1, #imap.PAD_UNBOUND do unbound[imap.PAD_UNBOUND[i].key] = imap.PAD_UNBOUND[i] end

if padKeys[1] then
  ok(#padKeys == 16 and #probeKeys == 10,
    'B11 config.NUM.PAD.KEYS 16 条 + PROBE_NAMED 10 条', #padKeys .. '/' .. #probeKeys)
  local uncoveredPad = nil
  for i = 1, #padKeys do
    local k = padKeys[i]
    if not has(allKeys, k) and not unbound[k] then uncoveredPad = k end
  end
  ok(uncoveredPad == nil, 'B12 手柄 16 条映射全部有归属（动作表或 PAD_UNBOUND）', uncoveredPad)
  local unboundOk = true
  for i = 1, #imap.PAD_UNBOUND do
    if not has(padKeys, imap.PAD_UNBOUND[i].key) then unboundOk = false end
  end
  ok(unboundOk, 'B13 PAD_UNBOUND 的 2 个死映射确实在 config.NUM.PAD.KEYS 里（MoveLeft/MoveRight）')
else
  ok(#padKeys == 0, 'B11 迁移后：config.NUM.PAD.KEYS 已并入 input_map（config 里不再有第二份）', #padKeys)
  ok(#imap.PROBE == 10, 'B12 探针键仍是 10 个（真机学键名的通道不变）', #imap.PROBE)
  ok(#imap.PAD_UNBOUND == 2, 'B13 两个死映射仍登记在 PAD_UNBOUND（不静默丢）', #imap.PAD_UNBOUND)
end

-- 不论迁移与否：当前真正注册的手柄键必须仍是 24（tests/48 断言 `pad bind n=24`）
local ctrlInTable, ctrlInProbe = 0, 0
for i = 1, #allKeys do
  if allKeys[i]:match('^Controller') and not unbound[allKeys[i]] then ctrlInTable = ctrlInTable + 1 end
end
for i = 1, #imap.PROBE do
  if imap.PROBE[i]:match('^Controller') then ctrlInProbe = ctrlInProbe + 1 end
end
ok(ctrlInTable == 14 and ctrlInProbe == 10 and (ctrlInTable + ctrlInProbe) == 24,
  string.format('B14 手柄注册量 = 24（动作 %d + 探针 %d）—— 保持 tests/48 的 `pad bind n=24`',
    ctrlInTable, ctrlInProbe), ctrlInTable + ctrlInProbe)

-- 死代码：skillKeyUpWatch 只被定义、从未调用（技能键 Up 只有 CraftspersonKey12Up 那条真注册）
local nDef = 0
for _ in mainSrc:gmatch('skillKeyUpWatch') do nDef = nDef + 1 end
ok(nDef <= 1, 'B15 skillKeyUpWatch 最多 1 次（定义处）⇒ 若存在即死代码，Up 监听从未注册', nDef)

-- 收表前后的监听条数（可复算，不是拍脑袋）
local newRegs = st.keys + st.fallback + st.probe
local keymapDown, keymapUp = 0, 0
for _, m in ipairs(cfg.NUM.KEYMAP or {}) do
  keymapDown = keymapDown + 1
  if m.up then keymapUp = keymapUp + 1 end
end
ok(newRegs == 84, 'B16 收表后注册 84 次（47 动作键 + 27 兜底 + 10 探针）', newRegs)
ok(#imap.RETIRED == 6 and (newRegs + 6) == 90,
  'B17 90 - 84 = 6 = RETIRED 条数（重复注册正好被吃掉）', newRegs + #imap.RETIRED)
if hasMapped and keymapDown == 10 then
  local oldRegs = #full + keymapDown + keymapUp + 4 + 24 + #mainFallback
  ok(oldRegs == 90 or oldRegs == 84,
    'B18 现存注册次数 = 90（Step1 前）/ 84（Step1 补掉 6 个重复后 = 收表后）（' .. oldRegs .. '）',
    oldRegs)
else
  ok(keymapDown == 0 or keymapDown == 10,
    'B18 config.NUM.KEYMAP 处于迁移中（10 down）或已清空（0）——两条路都不许出现第三份键位',
    keymapDown .. ' down / ' .. keymapUp .. ' up')
end

-- 迁移后：接线点必须存在（loadModule + bindAll + view_pad.pad），否则"单源"只是摆设
if not mainLegacy then
  ok(mainSrc:find("loadModule('input_map')", 1, true) ~= nil,
    'B19 迁移后：main.lua 用 loadModule("input_map") 装载（真机 4 级候选路径）')
  ok(mainSrc:find('bindAll(', 1, true) ~= nil, 'B20 迁移后：调用 bindAll 一次注册')
  -- 触屏描述通道（Step 4b）是独立一步：接上了就断言 pad( 调用存在，没接就断言现状并打 PENDING，
  -- 两种状态都算"如实"——不把未接线写成绿，也不让本套件因为别人还没接而变红。
  local hasViewPad = mainSrc:find("loadModule('view_pad')", 1, true) ~= nil
  if hasViewPad then
    ok(mainSrc:find('pad(', 1, true) ~= nil, 'B21 已接：view_pad 装载 + pad( 调用都在（触屏描述通道）')
  else
    ok(mainSrc:find('phone tap', 1, true) == nil and mainSrc:find('UI4.dispatch', 1, true) ~= nil,
      'B21 PENDING Step 4b：触屏仍走 ui.lua + UI4.dispatch（未接 view_pad；接线需同步 ui.lua 布局段）')
  end
else
  ok(#full == 15, 'B19 迁移前：15 条字面注册点已逐个对照', #full)
  ok(hasListenDef, 'B20 迁移前：listen() 定义仍在（此段将被 bindAll 取代）')
  ok(hasMapped, 'B21 迁移前：兜底排除表仍在（此段将被 fallbackPool 取代）')
end

-- ===== C 触屏面板描述（④）=====
print('--- C 触屏面板')

local function byId(list, id)
  for i = 1, #list do if list[i].id == id then return list[i] end end
  return nil
end
local function near(a, b) return a ~= nil and math.abs(a - b) < 1e-6 end

local game = PAD.slots('game', { 1280, 720 }, false, true)
ok(#game == 13, 'C1 单盘游戏屏 13 个槽位（8 拇指 + 3 技能 + 2 导航）', #game)

local left = byId(game, 'left')
ok(left and near(left.x, -472) and near(left.y, -300) and near(left.w, 120) and near(left.h, 72),
  'C2 ◀ = (-472,-300,120×72)（照抄 ui.lua:308）',
  left and (left.x .. ',' .. left.y .. ' ' .. left.w .. 'x' .. left.h))
local rot = byId(game, 'rot')
ok(rot and near(rot.x, -472) and near(rot.y, -208), 'C3 旋转 = (-472,-208)（ui.lua:310）')
local hard = byId(game, 'hard')
ok(hard and near(hard.x, 472) and near(hard.y, -300), 'C4 锁定 = (472,-300)（ui.lua:312）')
local sk1 = byId(game, 'skill1')
ok(sk1 and near(sk1.x, 400) and near(sk1.y, 60) and near(sk1.w, 100) and near(sk1.h, 58),
  'C5 技能1 = (400,60,100×58)（ui.lua:320）')
local navHelp = byId(game, 'help')
ok(navHelp and near(navHelp.x, 564) and near(navHelp.y, 314) and near(navHelp.w, 116),
  'C6 导航「说明」= (564,314,116×56)（ui.lua:326 + MARGIN=18）')

local game1600 = PAD.slots('game', { 1600, 900 }, false, true)
local l1600 = byId(game1600, 'left')
ok(l1600 and near(l1600.x, -552) and near(l1600.y, -390),
  'C7 1600×900 下 ◀ = (-552,-390)（bands 公式随画布走）',
  l1600 and (l1600.x .. ',' .. l1600.y))
local game2340 = PAD.slots('game', { 2340, 1080 }, false, true)
local l2340 = byId(game2340, 'left')
ok(l2340 and near(l2340.x, -737) and near(l2340.y, -480),
  'C8 2340×1080 下 ◀ = (-737,-480)', l2340 and (l2340.x .. ',' .. l2340.y))

local dual = PAD.slots('game', { 1280, 720 }, true, true)
ok(#dual == 11, 'C9 双盘游戏屏 11 个槽位（6 拇指 + 3 技能 + 2 导航）', #dual)
local dLeft = byId(dual, 'left')
ok(dLeft and near(dLeft.x, -537) and near(dLeft.y, -324),
  'C10 双盘 ◀ = (-537,-324)（gutL / botY+6，ui.lua:373-375）',
  dLeft and (dLeft.x .. ',' .. dLeft.y))

local settle = PAD.slots('settle', { 1280, 720 }, false, true)
ok(#settle == 3, 'C11 结算屏 3 颗行动键（再来一局/回主页/明细）', #settle)
local again = byId(settle, 'again')
ok(again and near(again.x, 0) and near(again.y, -220) and near(again.h, 64),
  'C12 「再来一局」= (0,-220,239.2×64)（ui.lua:466-470）',
  again and (again.x .. ',' .. again.y .. ' ' .. again.w))
ok(byId(settle, 'again').action == 'restart' and byId(settle, 'home').action == 'back'
  and byId(settle, 'detail').action == 'settle',
  'C13 结算三键的动作 = restart/back/settle（与 R/V/Q 同一套动作名）')

local help = PAD.slots('help', { 1280, 720 }, false, true)
ok(#help == 2 and byId(help, 'page').action == 'helpPage' and byId(help, 'home').action == 'back',
  'C14 说明页 2 键：翻页=helpPage（触屏专属）、回标题=back')

ok(#PAD.slots('title', { 1280, 720 }, false, true) == 0, 'C15 标题页不出游戏键（ui.lua:426）')
ok(#PAD.slots('roster', { 1280, 720 }, false, true) == 0, 'C16 角色页不出游戏键（ui.lua:480）')
ok(#PAD.slots('game', { 1280, 720 }, false, false) == 0, 'C17 PC（mobile=false）不出触屏键')

-- 节点描述：4 节点/键、层号 touch、热区最后、点击回调
local clicks = {}
local nodes = PAD.pad {
  screen = 'game', canvas = { 1280, 720 }, dual = false, mobile = true,
  onAction = function(action, id) clicks[#clicks + 1] = action .. '/' .. id end,
}
ok(#nodes == 13 * 4, 'C18 描述节点数 = 13 槽 × 4（描边/底/文字/热区）= 52', #nodes)

local badLayer, touchOrder = nil, layers.order('touch')
for i = 1, #nodes do
  if nodes[i].layer ~= 'touch' then badLayer = nodes[i].key end
  if layers.order(nodes[i].layer) ~= touchOrder then badLayer = nodes[i].key end
end
ok(badLayer == nil, 'C19 52 个节点全部 layer=touch（= 层号 70，压在所有面板之上）', badLayer)

local seenKey, seenName, dupName = {}, {}, nil
for i = 1, #nodes do
  local n = nodes[i]
  if seenKey[n.key] then dupName = n.key end
  seenKey[n.key] = true
  if n.name then
    if seenName[n.name] then dupName = n.name end
    seenName[n.name] = true
  end
end
ok(dupName == nil, 'C20 node.key / name 在同屏唯一（GetChild 寻址不歧义）', dupName)

local hitOk, hitBad = true, nil
for i = 1, 13 do
  local hitKey = nodes[(i - 1) * 4 + 4]
  if hitKey.cursor == nil or hitKey.cursor[1] ~= 'Click' then hitOk = false hitBad = 'cursor ' .. hitKey.key end
  if type(hitKey.on ~= nil and hitKey.on.Click) ~= 'function' then hitOk = false hitBad = 'on ' .. hitKey.key end
  for j = 1, 3 do
    if nodes[(i - 1) * 4 + j].seq >= hitKey.seq then
      hitOk = false
      hitBad = 'seq ' .. hitKey.key
    end
  end
end
ok(hitOk, 'C21 每颗键的最后一个是热区（cursor=Click + on.Click 函数 + seq 最大）', hitBad)

local function clickNode(keyPart)
  for i = 1, #nodes do
    if nodes[i].key == keyPart then
      nodes[i].on.Click()
      return true
    end
  end
  return false
end
ok(clickNode('pad.thumb.left.hit'), 'C22 点到 ◀ 热区')
clickNode('pad.nav.help.hit')
ok(clicks[1] == 'left/left' and clicks[2] == 'help/help',
  'C23 触屏派发的动作名 = 键位表同一套（left / help）', table.concat(clicks, ' '))

-- 触屏动作必须都在动作表里（或显式列为触屏专属）
local actionBad = nil
for _, screen in ipairs({ 'game', 'settle', 'help' }) do
  for _, dualFlag in ipairs({ false, true }) do
    local slots = PAD.slots(screen, { 1280, 720 }, dualFlag, true)
    for i = 1, #slots do
      local a = slots[i].action
      if not imap.ACTIONS[a] and not imap.TOUCH_ONLY[a] then actionBad = screen .. ':' .. a end
    end
  end
end
ok(actionBad == nil, 'C24 触屏动作全部落在 input_map 的动作表里（或 TOUCH_ONLY）', actionBad)

-- lint：三种画布 × 三种屏，0 issue（越界/遮挡/文字放不下/层号过低都在这里抓）
local lintBad, lintMsg, lintCount = nil, nil, 0
for _, cv in ipairs({ { 1280, 720 }, { 1600, 900 }, { 2340, 1080 } }) do
  for _, screen in ipairs({ 'game', 'settle', 'help' }) do
    for _, dualFlag in ipairs({ false, true }) do
      local tree = PAD.pad { screen = screen, canvas = cv, dual = dualFlag, mobile = true }
      if #tree > 0 then
        local is = V.lint(tree)
        lintCount = lintCount + 1
        if #is > 0 then lintBad = screen .. '@' .. cv[1] .. 'x' .. cv[2] lintMsg = is[1].code .. ' ' .. is[1].msg end
      end
    end
  end
end
ok(lintBad == nil, 'C25 lint 0 issue（' .. lintCount .. ' 种屏×画布组合）', lintBad and (lintBad .. ' :: ' .. lintMsg))

-- 越界：底/文字/热区必须严格在画布内；描边节点允许超出 EDGE 像素（= 现有 ui.lua 同款，
-- 见 C27 的缺陷登记：双盘拇指簇贴画布下沿 0 留白，2px 描边正好压出界）
local oobBad, nonDualOver, maxOver = nil, nil, 0
for _, cv in ipairs({ { 1280, 720 }, { 1600, 900 }, { 2340, 1080 } }) do
  for _, screen in ipairs({ 'game', 'settle', 'help' }) do
    for _, dualFlag in ipairs({ false, true }) do
      local tree = PAD.pad { screen = screen, canvas = cv, dual = dualFlag, mobile = true }
      for i = 1, #tree do
        local n = tree[i]
        local isEdge = n.key:match('%.edge$') ~= nil
        local tol = isEdge and (cfg.NUM.UI_KIT.EDGE or 2) or 0
        local x0, y0, x1, y1 = V.rect(n)
        if x0 < -cv[1] / 2 - tol or x1 > cv[1] / 2 + tol
          or y0 < -cv[2] / 2 - tol or y1 > cv[2] / 2 + tol then
          oobBad = n.key .. ' @' .. cv[1] .. 'x' .. cv[2]
        elseif isEdge then
          local over = math.max(-cv[1] / 2 - x0, x1 - cv[1] / 2,
            -cv[2] / 2 - y0, y1 - cv[2] / 2, 0)
          if over > maxOver then maxOver = over end
          if over > 0 and not dualFlag then
            nonDualOver = n.key .. ' @' .. cv[1] .. 'x' .. cv[2]
          end
        end
      end
    end
  end
end
ok(oobBad == nil, 'C26 底/文字/热区全部在画布内（0 越界）', oobBad)
-- 已知缺陷留档：双盘底排贴下沿（col0=botY+6 让 72 高的键正好触边），描边 2px 溢出画布。
-- 数值照抄没改（重构纪律"观感不变"）。判据取两条：①单盘/结算/说明屏必须 0 溢出（回归闸门）
-- ②已知例外的溢出量不得超过描边宽度（几何若被改动放大溢出，这里立刻红）。
ok(nonDualOver == nil, 'C27 单盘/结算/说明屏 0 溢出（描边也不出界）', nonDualOver)
ok(maxOver <= (cfg.NUM.UI_KIT.EDGE or 2),
  string.format('C28 双盘底排描边溢出 %.0fpx ≤ EDGE=%d（已知例外，见 report 缺陷清单）',
    maxOver, cfg.NUM.UI_KIT.EDGE or 2), maxOver)

-- 服务端退役按钮：坐标与 qxqy/build.mjs 原文逐值相等
local buildSrc = readfile('qxqy/build.mjs') or ''
local legacyFromBuild = {}
for id, label, x, y in buildSrc:gmatch("%['(btn%a)', '([^']*)', (-?%d+), (-?%d+)%]") do
  legacyFromBuild[#legacyFromBuild + 1] = { id = id, label = label, x = tonumber(x), y = tonumber(y) }
end
ok(#legacyFromBuild == 6, 'C29 qxqy/build.mjs 里解析出 6 个旧按钮（btnA..btnF）', #legacyFromBuild)
local legacyOk, legacyBad = true, nil
for i = 1, #legacyFromBuild do
  local b = legacyFromBuild[i]
  local mine = nil
  for j = 1, #vpadM.LEGACY do if vpadM.LEGACY[j].id == b.id then mine = vpadM.LEGACY[j] end end
  if not (mine and mine.label == b.label and mine.x == b.x and mine.y == b.y
    and mine.w == 150 and mine.h == 56) then
    legacyOk = false
    legacyBad = b.id
  end
end
ok(legacyOk, 'C30 M.LEGACY 的 6 条旧按钮坐标/尺寸与 build.mjs 逐值相等（150×56）', legacyBad)

-- ===== D 注册与分发行为 =====
print('--- D 注册与分发')

local P = platform.new {
  mock = true, canvas = { 1280, 720 },
  templates = { cell = { kind = 'image' }, hit = { kind = 'cursor' }, stext = { kind = 'text' } },
}
local calls = {}
local function record(action, key, phase) calls[#calls + 1] = action .. '|' .. key .. '|' .. phase return true end
local I = imap.new { platform = P, log = function() end }
I:bindAll(record)

ok(#I:boundKeys() == 84, 'D1 bindAll 注册 84 个键（= st.keys 47 + 兜底 27 + 探针 10）', #I:boundKeys())
ok(#I:dupes() == 0, 'D2 零重复注册（同一个键只挂一条回调）', #I:dupes())
local nHandlers = 0
for _ in pairs(P.keys()) do nHandlers = nHandlers + 1 end
ok(nHandlers == 84, 'D3 mock 引擎侧也只收到 84 条 AddKeyEventListener（平台表可数）', nHandlers)

calls = {}
I:press('left')
ok(calls[1] == 'left|KeyboardCraftspersonKey38Down|down', 'D4 press(left) 走注册回调 → 工匠 38 键',
  calls[1])
calls = {}
I:press('hold')
ok(calls[1] == 'hold|KeyboardCraftspersonKey14Down|down', 'D5 press(hold) → 工匠 14 键', calls[1])
calls = {}
I:pressKey('KeyboardCraftspersonKey14Down')
ok(#calls == 1 and calls[1]:match('^hold|'), 'D6 按 Hold 键只派发一次（历史重复注册已消灭）',
  table.concat(calls, ' '))
calls = {}
I:pressKey('KeyboardCraftspersonKey5Down')
ok(#calls == 1 and calls[1]:match('^anyKey|'), 'D7 兜底池仍工作：未映射键 → anyKey', calls[1])
calls = {}
I:release('left')
ok(calls[1] == 'left|KeyboardCraftspersonKey38Up|up', 'D8 release(left) → 松开事件走同一条动作链',
  calls[1])
local a1, ph1 = I:actionOf('KeyboardCraftspersonKey38Up')
ok(a1 == 'left' and ph1 == 'up', 'D9 actionOf 能反查松开键（left/up）', tostring(a1) .. '/' .. tostring(ph1))
ok(select(1, I:actionOf('KeyboardCraftspersonKey5Down')) == nil,
  'D10 actionOf 对兜底键返回 nil（它不是动作）')

-- bindOne：只绑一个动作
local P2 = platform.new { mock = true, templates = {} }
local J = imap.new { platform = P2, log = function() end }
ok(J:bindOne('rot') == 4, 'D11 bindOne(rot) 绑 4 个键（2 键鼠 + 2 手柄）', J:bindOne('rot'))
local P3 = platform.new { mock = true, templates = {} }
local K = imap.new { platform = P3, log = function() end }
ok(K:bindOne('left') == 5, 'D12 bindOne(left) 绑 5 个键（3 down + 2 up）', K:bindOne('left'))
ok(#K:boundKeys() == 5, 'D13 bindOne 不牵连别的动作', #K:boundKeys())

-- 栈式分发：上层消费后不再下传；出栈后回到下层
local P4 = platform.new { mock = true, templates = {} }
local L = imap.new { platform = P4, log = function() end }
local seen = {}
L:setDefault(function(action, key) seen[#seen + 1] = 'default:' .. action end)
L:push('game', function(action)
  seen[#seen + 1] = 'game:' .. action
  if action == 'left' then return true end
  return false
end)
L:push('help', function(action)
  seen[#seen + 1] = 'help:' .. action
  if action == 'help' then return true end
  return false
end)
L:bindAll()
seen = {}
L:press('left')
ok(seen[1] == 'help:left' and seen[2] == 'game:left' and #seen == 2,
  'D14 栈式分发：说明页先看（未消费）→ 玩法层消费后停止下传', table.concat(seen, ','))
seen = {}
L:press('help')
ok(seen[1] == 'help:help' and #seen == 1, 'D15 说明页消费 help 后不再下传（不用在每个回调写 if helpOpen）',
  table.concat(seen, ','))
seen = {}
L:press('hold')
ok(seen[1] == 'help:hold' and seen[3] == 'default:hold',
  'D16 谁都不消费 → 落到默认派发（三层顺序可复现）', table.concat(seen, ','))
L:pop('help')
ok(L:top() == 'game' and L:depth() == 1, 'D17 pop 后栈顶回到 game（depth=1）', L:top())
seen = {}
L:press('help')
ok(seen[1] == 'game:help' and seen[2] == 'default:help', 'D18 出栈后 help 交给下一层',
  table.concat(seen, ','))

-- 无默认派发时：未消费的动作必须被记账（"注册了但没人用"的读数）
local P5 = platform.new { mock = true, templates = {} }
local Q = imap.new { platform = P5, log = function() end }
Q:bindAll()
Q:press('help')
ok(Q:unhandled().help == 1, 'D19 没有消费者时记 unhandled.help = 1（不静默吞键）', Q:unhandled().help)

-- ===== 汇总 =====
print(string.format('\n== input_map_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
