--[[==========================================================================
 tests-lua/roster_wire_test.lua —— 档案页「新路径」（view_roster + 独立 render 实例）接线测试
 ----------------------------------------------------------------------------
 为什么要有这条：档案页这一屏原来由 roster.lua 手写 ~420 行控件拼出来，
 病根是移动端字号不缩放而框宽缩放 ⇒ 引擎 fits=false ⇒ **整条文字一个字都不画**
 （charPanelL1/L4 需 51.7、charPanelS 需 46.4，实测逐字吻合）。新路径改成
 「view_roster 出纯描述 → 独立 render 实例 apply」，本条测试把三件事钉在 headless：
   ① 应用后节点数恒定（切 5 个页签都是 111，不再每次重建 135 实例）；
   ② 每个文字控件的框高 ≥ 引擎公式 requiredHeight（fits 的结构前提）；
   ③ 页签 2/3/4 内容签名两两不同（现网三页同质）；
   ④ 热区能点击并真的切页/关页，悬停只写字段不重建（色值变化可读）。

 ⚠ 这条测的是 **mock 平台 + 真 render** 的字段层读数，不等于真引擎排版；
   真引擎 fits 读数要 main 注入 platform/render/layers/config/kit/viewRoster 后
   跑 `node qxqy/runner.mjs 58`（见交付报告"需要 main 配合"那一节）。
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/roster_wire_test.lua
========================================================================]]
local pass, fail = 0, 0
local function ok(cond, msg, extra)
  if cond then
    pass = pass + 1
    print('PASS  ' .. msg)
  else
    fail = fail + 1
    print('FAIL  ' .. msg .. (extra and ('  <<实测: ' .. tostring(extra) .. '>>') or ''))
  end
end
local function loadM(p) return assert(loadfile(p))() end

local cfg = loadM('lua/tetris/config.lua')
local copyM = loadM('lua/tetris/copy.lua')
local copy = (type(copyM) == 'function') and copyM() or copyM
local layers = loadM('lua/tetris/view_layers.lua')
local KIT_M = loadM('lua/tetris/view_kit.lua')
local RENDER = loadM('lua/tetris/render.lua')
local PLATFORM = loadM('lua/tetris/platform.lua')
local VNODE = loadM('lua/tetris/view_node.lua')
local VROSTER = loadM('lua/tetris/view_roster.lua')
local ROSTER_M = loadM('lua/tetris/roster.lua')

local W, H = 1280, 720                     -- mobile-16-9
local K = KIT_M.new({ layers = layers })
local V = VNODE.new({ layers = layers })
local P = PLATFORM.new({ mock = true, canvas = { W, H },
  templates = { cell = { kind = 'image' }, stext = { kind = 'text' }, hit = { kind = 'cursor' } },
  accepts = { cell = 'image', hit = 'cursor', stext = 'text' } })
local RN                       -- 由 roster.lua 内部创建（FN.rosterV2R() 取），测试不另建实例

-- 假 env：字段名与 main.lua 的 RM.new({...}) 逐一对齐（多给的 6 个就是本轮要 main 注入的）
local FN = {}
local DESTROYED = 0
local REG = {}
local state = { roles = { 'nahida', 'keqing', 'ganyu', 'columbina' },
  lv = { nahida = 3, keqing = 1, ganyu = 1, columbina = 1 }, cnt = { lines = 12, games = 4 },
  party = { 'nahida' }, unlocked = { nahida = true, keqing = true } }
local env = {
  FN = FN, C = cfg.C, THEME = cfg.THEME, CP = copy,
  SKILLS = { NUM = { PARTY_MAX = 2 }, params = function() return {} end },
  NUM = cfg.NUM,
  UI4 = { regScreen = function() end, regAdd = function(...) REG[#REG + 1] = { ... } end },
  sk = function() return state end,
  game = { DestroyClientUIControl = function() DESTROYED = DESTROYED + 1 end },
  setText = function() end, trySet = function() return true end, tryCall = function() return true end,
  addCursor = function(ctl, kind, fn) return P.onCursor(ctl, kind, fn) end,
  roster = { items = {} },
  canvas = function() return W, H end, canvasH = function() return H end,
  -- ↓↓↓ 这 6 个是 main 目前没注入的（本测试直接给上，报告里点名）
  platform = P, render = RENDER, layers = layers, config = cfg, kit = K, viewRoster = VROSTER,
}
FN.COPY = copy
local okm = ROSTER_M.new(env)
assert(okm, 'roster.new 失败')

print('== A. 新路径能否起来 ==')
local built = FN.rosterV2Build()
RN = FN.rosterV2R()
ok(built == true, 'A1 FN.rosterV2Build() 起来（能力齐时走 view_roster 描述）', built)
local function cnt() local n = 0 for _ in pairs(RN.controls()) do n = n + 1 end return n end
local live0 = cnt()
ok(live0 == 111, 'A2 应用后实例数 111（描述整页节点数）', live0)
ok(#RN.issues() == 0, 'A3 render 0 issue（层序/实例化都干净）', #RN.issues())
local nreg = #REG
ok(nreg >= 12, 'A4 UI4.regAdd 注册了 ' .. nreg .. ' 个热区（≥12：4 行 + 5 页签 + 关闭 + 3 卡）', nreg)

print('== B. 引擎侧：读 ctl.textLayout（mock 按引擎公式算，524fc25e）==')
do
  -- 先证 mock 本身有引擎语义（负控：这两组数字与真机实测一致，见 lead 2026-10-31 读数）
  local neg1 = PLATFORM.textMetrics({ text = string.rep('字', 16), fontSize = 18, sizeDeltaX = 240, sizeDeltaY = 32 })
  local neg2 = PLATFORM.textMetrics({ text = string.rep('字', 13), fontSize = 16, sizeDeltaX = 200, sizeDeltaY = 46 })
  ok(neg1.fits == false and math.abs(neg1.requiredHeight - 51.7) < 0.05 and neg1.visibleLineCount == 0,
    'B0 负控：18 号/宽 240/高 32 ⇒ 2 行、需 51.7、fits=false（与真机实测一致）',
    string.format('req=%.1f lines=%d', neg1.requiredHeight, neg1.lines))
  ok(neg2.fits == false and math.abs(neg2.requiredHeight - 46.4) < 0.05,
    'B0b 负控：16 号/宽 200/高 46 ⇒ 需 46.4、fits=false',
    string.format('req=%.1f', neg2.requiredHeight))

  local bad, checked, shown = nil, 0, {}
  local want = { charPanelL1 = true, charPanelL4 = true, charPanelS = true }
  local ctrls = RN.controls()
  for _, c in pairs(ctrls) do
    if c.__kind == 'text' and type(c.text) == 'string' and c.text ~= '' then
      checked = checked + 1
      local tl = c.textLayout
      local line = string.format('%s f=%d lines=%d req=%.1f h=%.0f fits=%s vlc=%d',
        tostring(c.name), c.fontSize, tl.lines, tl.requiredHeight, c.sizeDeltaY,
        tostring(tl.fits), tl.visibleLineCount)
      if want[c.name] then shown[#shown + 1] = line end
      if tl.fits ~= true or tl.visibleLineCount <= 0 then bad = line end
    end
  end
  print('      B1 关键三段读数: ' .. table.concat(shown, ' | '))
  ok(bad == nil and checked >= 20,
    'B1 ' .. checked .. ' 个非空文字控件：ctl.textLayout.fits == true 且 visibleLineCount > 0'
      .. '（失败会打出 requiredHeight 与实际高）', bad)

  -- 漂移守卫：模块自己算的框高必须 ≥ 引擎认的需高（两处公式不许各自漂）
  local drift = nil
  for _, key in ipairs({ 'charPanelL1', 'charPanelL4', 'charPanelS', 'charFoot', 'charTitle' }) do
    local c = RN.get(key)
    if c and c.textLayout then
      local mine = VROSTER.boxH(c.fontSize, c.textLayout.lines)
      if mine + 0.51 < c.textLayout.requiredHeight then
        drift = string.format('%s mine=%.1f engine=%.1f', key, mine, c.textLayout.requiredHeight)
      end
    end
  end
  ok(drift == nil, 'B2 漂移守卫：view_roster.boxH(字号, 引擎行数) ≥ 引擎 requiredHeight（5 个关键控件）', drift)
end

print('== C. 切页签：节点数恒定 + 内容签名两两不同 ==')
do
  local counts, sigs = {}, {}
  for tab = 1, 5 do
    assert(FN.rosterV2Build(nil, tab))
    RN = FN.rosterV2R()
    counts[#counts + 1] = cnt()
    local parts = {}
    local ctrls = RN.controls()
    for _, c in pairs(ctrls) do
      if type(c.text) == 'string' and c.text ~= '' then parts[#parts + 1] = c.text end
    end
    table.sort(parts)
    sigs[tab] = table.concat(parts, '|')
  end
  local same = true
  for i = 1, #counts do if counts[i] ~= 111 then same = false end end
  ok(same, 'C1 五个页签各自 apply 后实例数都恒为 111（切页签不增删控件）',
    table.concat(counts, ','))
  local dup = nil
  for a = 1, 5 do
    for b = a + 1, 5 do
      if sigs[a] == sigs[b] then dup = a .. '=' .. b end
    end
  end
  ok(dup == nil, 'C2 五个页签的内容签名两两不同（现网 tab 2/3/4 同质已修）', dup)
  ok(sigs[2] ~= sigs[3] and sigs[3] ~= sigs[4] and sigs[2] ~= sigs[4],
    'C3 机制(2)/数值(3)/解锁(4) 三页内容各不相同')
end

print('== D. 交互：点击真切页/真关页，悬停只写字段 ==')
do
  assert(FN.rosterV2Build(1, 1))
  RN = FN.rosterV2R()
  local hit3 = RN.get('charTab3Hit')
  ok(hit3 ~= nil and type(hit3.__cursors) == 'table' and hit3.__cursors['CursorClick'] ~= nil,
    'D1 charTab3Hit 挂上了 CursorClick（P.onCursor 注册成功）')
  if hit3 and hit3.__cursors['CursorClick'] then hit3.__cursors['CursorClick']() end
  ok(FN.charTab == 3 and cnt() == 111, 'D2 点页签 3 ⇒ charTab=3 且实例数仍 111',
    tostring(FN.charTab) .. '/' .. tostring(cnt()))

  local row1 = RN.get('charRow1Hit')
  local base = RN.get('charRow1B').imageColor
  if row1 and row1.__cursors['CursorEnter'] then row1.__cursors['CursorEnter']() end
  local hov = RN.get('charRow1B').imageColor
  ok(hov ~= base, 'D3 悬停 charRow1 ⇒ charRow1B.imageColor 变了（写字段，不重建）',
    string.format('%08X → %08X', base, hov))
  if row1 and row1.__cursors['CursorExit'] then row1.__cursors['CursorExit']() end
  ok(RN.get('charRow1B').imageColor == base, 'D4 移出后颜色复位')
  ok(cnt() == 111, 'D5 三态全程实例数不变（111）', cnt())

  local closeHit = RN.get('charCloseHit')
  if closeHit and closeHit.__cursors['CursorClick'] then closeHit.__cursors['CursorClick']() end
  ok(cnt() == 0 and RN.get('charRow1B') == nil, 'D6 点「合上」⇒ clear() 后实例 0（只清自己那份）',
    cnt())
end


print('== F. 条目详情浮层（第二份描述 + 第二个 render 实例）==')
do
  assert(FN.rosterV2Build(1, 1))
  RN = FN.rosterV2R()
  local n0 = cnt()
  local okOpen = FN.rosterV2Detail(1)
  local D = FN.rosterV2D()
  ok(okOpen == true and D ~= nil, 'F1 FN.rosterV2Detail(1) 打开浮层并建出独立实例 D', tostring(okOpen))
  local dnodes = FN.rosterV2DNodes()
  ok(type(dnodes) == 'table' and #dnodes > 5, 'F2 浮层是一份完整描述（节点数 ' ..
    tostring(#dnodes) .. '）')
  local dIssues = #V.lint(dnodes)
  ok(dIssues == 0, 'F3 浮层描述 lint 0 issue（modal 层 + 不透明预混 + 文字放得下）', dIssues)
  local dcount = 0
  for _ in pairs(D.controls()) do dcount = dcount + 1 end
  ok(dcount > 5 and cnt() == n0, 'F4 浮层实例 ' .. dcount .. ' 件，档案页实例仍 ' .. cnt() ..
    '（两份描述/两个实例互不干扰）')
  ok(dcount == #dnodes, 'F5 浮层实例数 == 描述节点数（无实例化失败）', dcount .. '/' .. #dnodes)
  ok(FN.rosterV2DetailOpen() == true, 'F10 打开时 FN.rosterV2DetailOpen() == true')
  local hit = D.get('charDetailHit')
  ok(hit ~= nil and type(hit.__cursors) == 'table' and hit.__cursors['CursorClick'] ~= nil,
    'F6 浮层关闭热区挂上了 CursorClick')
  if hit and hit.__cursors['CursorClick'] then hit.__cursors['CursorClick']() end
  local d2 = 0
  for _ in pairs(D.controls()) do d2 = d2 + 1 end
  ok(d2 == 0 and cnt() == n0, 'F7 点任意处 ⇒ 浮层实例归零、档案页原封不动（' .. d2 .. '/' .. cnt() .. '）')
  ok(FN.rosterV2DetailOpen() == false, 'F9 关闭后 FN.rosterV2DetailOpen() == false（给 main 的 Esc 一行判断用）')
  ok(env.layers.order('modal') > env.layers.order('card')
    and env.layers.order('modal') > env.layers.order('touch'),
    'F8 层号 modal(' .. env.layers.order('modal') .. ') > card(' .. env.layers.order('card') ..
    ')/touch(' .. env.layers.order('touch') .. ') ⇒ 浮层天然压住档案页，不靠创建顺序')
end

print('== E. 降级：能力不齐时不能炸（回落旧实现）==')
do
  local FN2 = {}
  local env2 = { FN = FN2, C = cfg.C, THEME = cfg.THEME, CP = copy,
    SKILLS = { NUM = { PARTY_MAX = 2 }, params = function() return {} end }, NUM = cfg.NUM,
    UI4 = { regScreen = function() end, regAdd = function() end },
    sk = function() return state end, game = { DestroyClientUIControl = function() end },
    setText = function() end, trySet = function() return true end, tryCall = function() return true end,
    addCursor = function() return false end, roster = { items = {} },
    canvas = function() return W, H end, canvasH = function() return H end }
  FN2.COPY = copy
  assert(ROSTER_M.new(env2))
  local okRun, res = pcall(FN2.rosterV2Build)
  ok(okRun and res == false, 'E1 缺 platform/render/layers/config/kit/viewRoster ⇒ 返回 false 不抛错', tostring(res))
end

print('')
print(string.format('== roster_wire_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
