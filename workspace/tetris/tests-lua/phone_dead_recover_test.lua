--[[==========================================================================
 tests-lua/phone_dead_recover_test.lua —— 拇指键「坐标被冻结」的回归（v6.33）
 跑法：cd <root> && lua5.3 tests-lua/phone_dead_recover_test.lua

 真机形态（2026-11-20 01:40 日志，`ctl dump screen=game`）：
   hold/hard/rot2/left/right 都在双盘几何（±454 / ±584），只有 `soft` 停在单盘几何（+228）
   ⇒ 「缓降」在屏幕上比同列的「暂存」整整左移一列。

 根因假设（本用例守的就是它）：`U.paint` 探测失败会把 `b.dead` 置真（本意只是"别涂三态"），
   而 `placeBtnNow` 把 `dead` 当**永久**跳过 ⇒ 这颗键的坐标从此冻结在那一刻的布局上。
   判据：dead 只该挡涂色，控件只要还能读到坐标(mock: 未被销毁)就必须能被重新摆位。

 U1 单盘 apply 后强制 dead（模拟一次 paint 失败）→ 切双盘 apply → 必须移到双盘几何
 U2 控件真被销毁（GetAnchoredPosition 抛错）→ dead 保持，不抛错、不崩
==========================================================================]]
local ROOT = os.getenv('QxqyUiRoot') or os.getenv('TETRIS_ROOT') or '.'
local function load(p) return assert(loadfile(ROOT .. '/' .. p))() end
local CFG = load('lua/tetris/config.lua')
local UIM = load('lua/tetris/ui.lua')

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end

-- 假控件：`alive=false` 时 GetAnchoredPosition 抛错（等价真机上对象被销毁）
local function mk(name)
  local c = { __name = name, __pos = { 0, 0 }, __alive = true }
  function c:SetAnchoredPosition(x, y) self.__pos[1], self.__pos[2] = x, y end
  function c:GetAnchoredPosition()
    if not self.__alive then error('invalid object') end
    return self.__pos[1], self.__pos[2]
  end
  function c:SetSizeDelta() end
  function c:SetImage() end
  function c:SetLocalRotation() end
  return c
end

local function build(W, H)
  local spec = {
    game = setmetatable({}, { __index = function() return function() end end }),
    cfg = CFG,
    widgets = {
      trySet = function(c, k, v) if c and c['Set' .. k] then c['Set' .. k](c, v) end end,
      tryCall = function(c, k, ...) if c and c[k] then return c[k](c, ...) end end,
      addCursor = function() end,
    },
    canvas = function() return W, H end,
    mobile = function() return true end,
    device = function() return 'mobile' end,
    log = function() end,
    tb = function() return nil end,
    instHud = function() return nil end,
    instInto = function() return nil end,
    onSkillArea = function() end,
    bindCursor = function() end,
    makeHit = function(nm) return mk(nm) end,
    instCell = function(nm) return mk(nm) end,
    instText = function(nm) local c = mk(nm); c.text = '' return c end,
    instHit = function(nm) return mk(nm) end,
    mode = function() return 'casual' end,
  }
  local U = UIM.new(spec)
  U.padBuildNow(true)
  return U
end

local function btn(U, id)
  for _, b in ipairs(U.allBtns or {}) do if b.id == id then return b end end
end

-- U1 ────────────────────────────────────────────────────────────────────────
local U = build(1698, 719)
U.apply('game', false, 'casual')
local soft, hold = btn(U, 'soft'), btn(U, 'hold')
ok(soft ~= nil and hold ~= nil, 'U0 拇指键 soft/hold 都建出来了', soft and hold and 'ok' or 'nil')
local singleX = soft and math.floor(soft.gx + 0.5)
U.paint(soft, 'hover')          -- 正常涂色：不该置 dead
ok(not soft.dead, 'U1a 正常 paint 不会把键判死')
soft.dead = true                -- 模拟一次探测失败（真机上的历史状态）
U.apply('game', true, 'casual') -- 切双盘：几何整体外推
local dualSoftX = math.floor(soft.gx + 0.5)
local dualHoldX = math.floor(hold.gx + 0.5)
ok(not soft.dead, 'U1b 活着的控件会清掉 dead 标记（不再永久冻结）', tostring(soft.dead))
ok(dualSoftX == dualHoldX and dualSoftX ~= singleX,
  string.format('U1c 切盘后 soft 与 hold 同列（single=%d dual=%d hold=%d）', singleX, dualSoftX, dualHoldX))
ok(math.abs((soft.hit and soft.hit.__pos[1] or -9999) - dualHoldX) < 1.5,
  'U1d soft 的命中区真的被搬到了新位置', tostring(soft.hit and soft.hit.__pos[1]))

-- U2 ────────────────────────────────────────────────────────────────────────
local U2 = build(1698, 719)
U2.apply('game', false, 'casual')
local s2 = btn(U2, 'soft')
s2.hit.__alive = false                       -- 命中区被销毁
s2.bg.parts[1].__alive = false               -- 胶囊**实体**也被销毁 ⇒ aliveCtl 探测失败
s2.dead = true
local okRun = pcall(function() U2.apply('game', true, 'casual') end)
ok(okRun, 'U2a 控件销毁后 apply 不抛错')
ok(s2.dead == true, 'U2b 真销毁的键保持 dead（不会被误清）', tostring(s2.dead))

print(string.format('\n== phone_dead_recover_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
