-- hmlt-qixia main.lua —— 《虹猫蓝兔七侠传》千星复刻（clean-room 重迁移）
-- 规格真源：prototype/index.html（1098 行，行为逐段对齐）
-- 平台：单脚本挂 n1「游戏层」；逻辑场 444×250 原点左下 Y 上；K=画布宽/444 缩放
-- 测试契约：tests/*.json 15 用例（fail lives / bomb_clear / WaveText 纯波号 等 v2 修正以用例为准）
-- 美术：基础图元 100001-100006（rect/circle/triangle/fourstar/fivestar/ring）+ imageColor

-- ============================ 数据表（照抄 index.html） ============================
local FIELD_W, FIELD_H = 444, 250

local N = {
  player = { vx = 175, vy = 100, xMin = 25, xMax = 415, yMin = 34, yMax = 220 },
  zdlv = { 12, 16, 11, 8.5, 4.4 },
  ps = { hongmao = 70, lantu = 65 },
  chargeRate = 35,
  ships = {
    hongmao = { bullet = 'changhong', bspeed = 420, fireCd = 0.7, dmgMul = 4.3, ps = 70,
      wing = 'wingA', wingBullet = 'fdzd', wingSpeed = 700, chargeType = 'guanri' },
    lantu = { bullet = 'jezd', bspeed = 620, fireCd = 0.4, dmgMul = 1.8, ps = 65, range = 178,
      wing = 'wingB', wingBullet = 'jezd', wingSpeed = 700, chargeType = 'sword' },
  },
  enemy = {
    dj1 = { hp = 1, spd = 250, score = 10 },
    dj2 = { hp = 220, zdsd = 150, score = 300 },
    dj3 = { hp = 420, zdsd = 150, score = 300 },
    dj4 = { hp = 100, zdsd = 137, score = 300 },
    nq = { hp = 140, zdsd = 125, score = 300, w = 24, h = 24 },
    lsfj = { hp = 160, zdsd = 150, score = 200, w = 26, h = 36 },
    jbdj = { hp = 320, zdsd = 125, score = 500, w = 52, h = 36 },
    lfj = { hp = 1, score = 15, w = 30, h = 12 },
    jbfjg = { hp = 1700, zdsd = 175, score = 2000, w = 104, h = 64 },
    boss1 = { hp = 3000, zdsd = 150, score = 1000 },
    boss2 = { hp = 3600, zdsd = 150, score = 1500, phases = { 1800, 1800 } },
    nq2 = { hp = 160, zdsd = 150, score = 350, w = 30, h = 30 },
    jxr1 = { hp = 340, zdsd = 160, score = 250, w = 50, h = 40 },
    dgp = { hp = 380, zdsd = 170, score = 300, w = 60, h = 26, roller = true },
    dxdd = { hp = 99999, score = 0, w = 43, h = 16, hazard = true },
    jdlj = { hp = 3000, zdsd = 170, score = 1000, w = 46, h = 88 },
    hzz = { hp = 2500, zdsd = 180, score = 1000, w = 40, h = 54 },
    cw = { hp = 2500, zdsd = 170, score = 1000, w = 70, h = 60 },
    boss3 = { hp = 4200, zdsd = 180, score = 1500, phases = { 1800, 2400 } },
    jxjq = { hp = 4800, zdsd = 170, score = 1500, phases = { 2800, 2000 } },
    black = { hp = 5400, zdsd = 180, score = 5000, phases = { 2100, 1600, 1700 } },
    cw1 = { hp = 6000, zdsd = 170, score = 1500 },
  },
  bombDmg = 50, phoenixDps = 50, scroll = 100, scrollBoss = 175,
}

local wavesDef1 = {
  { spawns = { { 'dj3', 130 } } },
  { spawns = { { 'dj4', 95 }, { 'dj4', 60 } } },
  { spawns = { { 'dj3', 130 }, { 'dj3', 45 } } },
  { spawns = { { 'dj2', 90 } } }, { spawns = { { 'dj2', 140 } } },
  { spawns = { { 'dj2', 50 } } }, { spawns = { { 'dj2', 80 } } },
  { spawns = { { 'dj4', 70 } } }, { boss = 'boss1' },
}
local wavesDef2 = {
  { t = 0.8, spawns = { { 'nq', 170 }, { 'nq', 130 } } },
  { t = 2.3, spawns = { { 'dj3', 60 } } },
  { t = 4.1, spawns = { { 'dj4', 190 }, { 'dj4', 130 }, { 'dj4', 60 } } },
  { t = 5.3, spawns = { { 'nq', 150 }, { 'nq', 60 } } },
  { t = 7.5, spawns = { { 'nq', 200 }, { 'nq', 130 } } },
  { t = 9.0, spawns = { { 'nq', 140 }, { 'nq', 80 } } },
  { t = 9.8, spawns = { { 'dj3', 140 } } },
  { t = 11.2, spawns = { { 'jbdj', 180 } } }, { t = 11.6, spawns = { { 'jbdj', 140 } } },
  { t = 12.0, spawns = { { 'jbdj', 80 } } },
  { t = 12.4, spawns = { { 'nq', 200 }, { 'nq', 50 } } },
  { t = 12.7, spawns = { { 'nq', 150 }, { 'nq', 100 } } },
  { t = 13.6, midBoss = 'jbfjg' },
  { t = 14.4, spawns = { { 'lsfj', 200 }, { 'lsfj', 150 } } },
  { t = 15.6, spawns = { { 'lsfj', 100 } } },
  { t = 16.8, spawns = { { 'lsfj', 200 }, { 'lsfj', 70 } } },
  { t = 18.0, spawns = { { 'dj3', 120 } } },
  { t = 19.4, boss = 'boss2' },
}
local wavesDef3 = {
  { t = 0.3, spawns = { { 'jxr1', 60 }, { 'lsfj', 80 }, { 'lsfj', 180 } } },
  { t = 1.8, spawns = { { 'lsfj', 200 }, { 'lsfj', 130 }, { 'dj4', 70 } } },
  { t = 3.6, spawns = { { 'dj4', 130 }, { 'dj4', 60 }, { 'nq2', 100 } } },
  { t = 5.4, spawns = { { 'jxr1', 60 }, { 'nq2', 170 } } },
  { t = 7.0, spawns = { { 'jxr1', 140 }, { 'jxr1', 70 }, { 'lsfj', 120 } } },
  { t = 8.8, spawns = { { 'nq2', 50 }, { 'nq2', 110 } } },
  { t = 10.2, spawns = { { 'dj3', 50 }, { 'nq2', 100 }, { 'nq2', 160 }, { 'dgp', 45 } } },
  { t = 12.4, midBoss = 'jdlj' },
  { t = 14.5, spawns = { { 'dgp', 45 }, { 'nq2', 80 } } },
  { t = 16.2, spawns = { { 'dgp', 45 }, { 'dgp', 45 }, { 'nq2', 190 } } },
  { t = 18.2, spawns = { { 'nq2', 190 }, { 'nq2', 150 }, { 'nq2', 100 }, { 'nq2', 50 } } },
  { t = 21.0, spawns = { { 'nq2', 130 }, { 'nq2', 60 }, { 'nq', 100 }, { 'dgp', 45 } } },
  { t = 23.5, spawns = { { 'dj3', 100 }, { 'dj4', 50 }, { 'dj4', 150 }, { 'nq2', 80 } } },
  { t = 26.0, spawns = { { 'dgp', 45 }, { 'jxr1', 180 } } },
  { t = 28.0, spawns = { { 'jxr1', 70 }, { 'jxr1', 150 }, { 'lsfj', 100 } } },
  { t = 30.5, spawns = { { 'dj4', 190 }, { 'dj4', 50 }, { 'nq2', 120 } } },
  { t = 33.0, spawns = { { 'nq2', 60 }, { 'dj3', 140 }, { 'dgp', 45 } } },
  { t = 35.5, boss = 'boss3' },
}
local wavesDef4 = {
  { t = 0.3, spawns = { { 'nq2', 80 }, { 'nq2', 150 }, { 'nq', 50 } } },
  { t = 2.0, spawns = { { 'nq', 190 }, { 'nq', 50 }, { 'lsfj', 120 } } },
  { t = 3.8, spawns = { { 'dgp', 45 }, { 'nq2', 100 } } },
  { t = 5.6, spawns = { { 'dgp', 45 }, { 'dgp', 45 } } },
  { t = 7.6, spawns = { { 'dj3', 110 }, { 'nq2', 60 } } },
  { t = 9.4, spawns = { { 'nq2', 50 }, { 'nq2', 200 }, { 'nq2', 100 } } },
  { t = 11.2, spawns = { { 'lsfj', 120 }, { 'lsfj', 50 }, { 'lsfj', 150 } } },
  { t = 13.0, spawns = { { 'lsfj', 190 }, { 'lsfj', 80 }, { 'dgp', 45 } } },
  { t = 14.8, spawns = { { 'dj3', 120 }, { 'nq2', 170 } } },
  { t = 16.6, spawns = { { 'nq2', 50 }, { 'nq2', 200 }, { 'nq2', 120 } } },
  { t = 18.4, spawns = { { 'nq', 80 }, { 'nq', 170 }, { 'lsfj', 110 } } },
  { t = 20.2, midBoss = 'jbfjg' },
  { t = 22.6, spawns = { { 'dgp', 45 }, { 'dgp', 45 } } },
  { t = 24.4, spawns = { { 'dgp', 45 }, { 'dgp', 45 } } },
  { t = 26.2, spawns = { { 'dgp', 45 }, { 'dgp', 45 }, { 'dj3', 60 } } },
  { t = 28.2, spawns = { { 'dj3', 50 }, { 'nq2', 140 } } },
  { t = 30.2, boss = 'jxjq' },
}
local wavesDef5 = {
  { t = 0.4, spawns = { { 'nq2', 100 }, { 'nq2', 150 } } },
  { t = 2.2, midBoss = 'jbfjg' },
  { t = 4.1, midBoss = 'cw' },
  { t = 20.5, midBoss = 'jdlj' },
  { t = 23.5, midBoss = 'hzz' },
  { t = 27.0, spawns = { { 'nq2', 110 }, { 'nq2', 170 }, { 'lsfj', 60 } } },
  { t = 28.8, spawns = { { 'dj3', 110 }, { 'nq2', 80 } } },
  { t = 30.6, spawns = { { 'dj4', 50 }, { 'dj4', 200 }, { 'dgp', 45 } } },
  { t = 32.4, spawns = { { 'dgp', 45 }, { 'lsfj', 50 }, { 'nq2', 140 } } },
  { t = 34.2, spawns = { { 'lsfj', 120 }, { 'dgp', 45 } } },
  { t = 36.0, spawns = { { 'nq2', 50 }, { 'nq2', 200 }, { 'dj3', 120 } } },
  { t = 37.8, spawns = { { 'nq', 100 }, { 'nq', 150 }, { 'lsfj', 70 } } },
  { t = 39.6, spawns = { { 'nq2', 90 }, { 'dgp', 45 } } },
  { t = 42.5, boss = 'black' },
}
local function wavesDef6()
  local w = {}
  for i = 0, 29 do
    local sp = {}
    for _ = 1, 2 do sp[#sp + 1] = { 'xkl', 40 + math.floor(math.random() * 160) } end
    if i % 2 == 1 then sp[#sp + 1] = { 'xkl', 40 + math.floor(math.random() * 160) } end
    sp[#sp + 1] = { 'bsrain', 40 + math.floor(math.random() * 160) }
    w[#w + 1] = { t = 0.3 + i * 0.33, spawns = sp }
  end
  w[#w + 1] = { t = 12.5, boss = 'cw1' }
  return w
end
local LEVELS = {
  { name = '第一关 · 长虹出鞘', waves = wavesDef1, mode = 'gate' },
  { name = '第二关 · 冰魄试炼', waves = wavesDef2, mode = 'time', env = 'lfj' },
  { name = '第三关 · 蛟龙怒涛', waves = wavesDef3, mode = 'time', mul = 1.25 },
  { name = '第四关 · 机械咆哮', waves = wavesDef4, mode = 'time', mul = 1.4 },
  { name = '第五关 · 魔神降临', waves = wavesDef5, mode = 'time', env = 'dxdd', mul = 1.6 },
  { name = '终关 · 弹雨终局', waves = wavesDef6(), mode = 'time', mul = 1.8 },
}
local TRAITS = {
  { 'yizhen', '一针见血' }, { 'zhenman', '针满则锐' }, { 'guiqia', '飞针归匣' },
  { 'xinhuo', '薪火相传' }, { 'renjian', '人剑合一' }, { 'qiudao', '险中求道' },
  { 'beishui', '背水一战' },
}
local CODEX = {
  { 'guanri_full', '满编贯日' }, { 'jiejian', '贯日接剑' }, { 'rifeng', '日凤连环' },
  { 'xuli_zouwei', '蓄力走位' }, { 'jian_bu_zhen', '剑哺针' }, { 'dong_sui', '冻碎' },
  { 'bing_lun', '冰轮舞' }, { 'yi_xian_chuan', '一线穿' }, { 'tie_lian', '贴脸斩' },
  { 'man_zhen', '满针预瞄' },
}

local function C(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end
local WHITE = C(255, 255, 255, 255)
local VIS = {
  hongmao = { 100004, C(255, 255, 170, 60), 30, 30 },
  lantu = { 100002, C(255, 130, 210, 255), 30, 26 },
  flame = { 100003, C(255, 255, 150, 60), 10, 10 },
  wingA = { 100004, C(255, 255, 220, 130), 18, 14 },
  wingB = { 100002, C(255, 160, 240, 255), 16, 16 },
  changhong = { 100001, C(255, 255, 200, 70), 34, 9 },
  jezd = { 100001, C(255, 120, 220, 255), 24, 7 },
  fdzd = { 100001, C(255, 255, 245, 190), 12, 5 },
  bingpoj = { 100001, C(255, 90, 200, 255), 40, 14 },
  yinzhen = { 100001, C(255, 235, 250, 255), 20, 5 },
  szd = { 100002, C(255, 255, 110, 80), 9, 9 },
  szd2 = { 100002, C(255, 230, 90, 160), 9, 9 },
  bingjing = { 100002, C(255, 200, 240, 255), 9, 9 },
  dianran = { 100003, C(255, 255, 140, 50), 12, 15 },
  dj1 = { 100001, C(255, 130, 150, 170), 34, 14 },
  dj2 = { 100001, C(255, 120, 200, 120), 34, 34 },
  dj3 = { 100001, C(255, 200, 220, 90), 40, 18 },
  dj4 = { 100001, C(255, 170, 190, 90), 30, 29 },
  nq = { 100002, C(255, 90, 220, 200), 22, 22 },
  nq2 = { 100002, C(255, 160, 140, 230), 26, 26 },
  lsfj = { 100003, C(255, 190, 130, 240), 26, 34 },
  jbdj = { 100001, C(255, 220, 90, 90), 50, 34 },
  lfj = { 100003, C(255, 140, 200, 250), 28, 11 },
  jxr1 = { 100001, C(255, 130, 140, 230), 46, 36 },
  dgp = { 100001, C(255, 150, 160, 175), 54, 22 },
  dxdd = { 100001, C(255, 70, 100, 190), 40, 14 },
  jbfjg = { 100003, C(255, 200, 120, 220), 96, 58 },
  jdlj = { 100001, C(255, 80, 170, 220), 42, 80 },
  hzz = { 100001, C(255, 90, 90, 110), 38, 50 },
  cw = { 100003, C(255, 120, 110, 190), 64, 56 },
  boss1 = { 100001, C(255, 240, 120, 120), 74, 92 },
  boss2 = { 100001, C(255, 130, 230, 160), 66, 70 },
  boss2b = { 100001, C(255, 90, 200, 130), 60, 110 },
  boss3 = { 100001, C(255, 110, 180, 240), 74, 56 },
  jxjq = { 100001, C(255, 170, 170, 190), 136, 92 },
  black = { 100001, C(255, 120, 100, 200), 64, 96 },
  cw1 = { 100003, C(255, 150, 120, 210), 56, 50 },
  pow = { 100004, C(255, 255, 220, 90), 16, 7 },
  bom1 = { 100001, C(255, 255, 150, 60), 16, 7 },
  bs = { 100002, C(255, 255, 210, 110), 14, 14 },
  shield = { 100006, C(255, 160, 240, 255), 44, 44 },
  guanri = { 100001, C(255, 255, 240, 170), 150, 30 },
  huofeng = { 100004, C(255, 255, 130, 50), 70, 58 },
  boom = { 100002, C(255, 255, 190, 90), 40, 40 },
  die = { 100002, C(255, 255, 100, 70), 100, 100 },
  spark = { 100002, C(255, 255, 230, 150), 8, 8 },
  xinhuo = { 100002, C(255, 255, 170, 100), 10, 10 },
}

-- ============================ 工具 ============================
local function clamp(v, a, b) if v < a then return a elseif v > b then return b end return v end
local function hypot(x, y) return math.sqrt(x * x + y * y) end
local function hit(a, b) return math.abs(a.x - b.x) * 2 < a.w + b.w and math.abs(a.y - b.y) * 2 < a.h + b.h end
local function aimed(x, y, tx, ty, sp)
  local dx, dy = tx - x, ty - y
  local L = hypot(dx, dy)
  if L < 0.001 then L = 1 end
  return dx / L * sp, dy / L * sp
end

-- ============================ 渲染层 ============================
local T_IMG, T_TX, T_BTN, T_PANEL, T_CURSOR = 1073742300, 1073742301, 1073742302, 1073742303, 1073742304
local root, K = nil, 1
local CW, CH = 444, 250
local pool, poolN, poolCursor = {}, 0, 0

local function newInst(guid, name)
  local n = game.InstantiateClientUIControl(guid, root)
  n.name = name or ''
  return n
end

local function initRender()
  CW, CH = game.GetUICanvasSize()
  K = CW / FIELD_W
  poolN = 0
  local total = 24 + 72 + 148 + 26 + 34 + 10 + 4
  for i = 1, total do
    local c = newInst(T_IMG, 'sp' .. i)
    c:SetVisible(false)
    poolN = poolN + 1
    pool[poolN] = { c = c, used = false, lvis = false, lx = -9e3, ly = -9e3, lw = -1, lh = -1, lcol = -1, lart = '' }
  end
end

local function draw(artKey, x, y, w, h, colorOverride)
  if poolCursor >= poolN then return nil end
  poolCursor = poolCursor + 1
  local p = pool[poolCursor]
  local v = VIS[artKey] or VIS.boom
  w = w or v[3]; h = h or v[4]
  local col = colorOverride or v[2]
  local c = p.c
  if p.lart ~= artKey then c:SetImage('StaticReference', v[1]); p.lart = artKey end
  if p.lcol ~= col then c.imageColor = col; p.lcol = col end
  if p.lw ~= w or p.lh ~= h then c:SetSizeDelta(w * K, h * K); p.lw = w; p.lh = h end
  local px, py = (x - FIELD_W / 2) * K, (y - FIELD_H / 2) * K
  if p.lx ~= px or p.ly ~= py then c:SetAnchoredPosition(px, py); p.lx = px; p.ly = py end
  return p
end

-- ============================ 游戏状态 ============================
local G = nil
local keys = {}
local jEdge, kEdge, rEdge = false, false, false
local touch = { on = false, x = 0, y = 125 }
local boundLogT = {}
local UI = {}

local function log(s) print(s) end
local function say(g, s)
  g.msgs[#g.msgs + 1] = { txt = s, t = 0, life = 1.8 }
  if #g.msgs > 4 then table.remove(g.msgs, 1) end
end

local function traitName(id)
  for _, t in ipairs(TRAITS) do if t[1] == id then return t[2] end end
  return id
end

local function syncWings(g)
  local want = g.lv - 1
  while #g.wings < want do
    g.wings[#g.wings + 1] = { x = g.ship.x - 20, y = g.ship.y, fireCd = 0,
      bspd = 250 + math.random() * 100, k = 0.6 + math.random() * 0.8 }
  end
  while #g.wings > want do table.remove(g.wings) end
end

local function mkItem(g, kind, x, y)
  return { kind = kind, x = x, y = y, w = kind == 'bs' and 16 or 20, h = kind == 'bs' and 16 or 12,
    vx = (math.random() - 0.5) * 50, vy = (math.random() - 0.5) * 50,
    life = kind == 'bs' and 10 or 4, tx = 20 + math.random() * 350, ty = 20 + math.random() * 200 }
end

local function resetGame()
  if UI and UI.gameOverPanel then clearGameOverPanel() end
  G = {
    state = 'select', selIdx = 0, t = 0,
    score = 0, life = 4, bomm = 3, lv = 1, neng = 0,
    shipKey = 'hongmao', ship = { x = 45, y = 100, w = 10, h = 8 }, fireCd = 0,
    bullets = {}, ebullets = {}, enemies = {}, items = {}, booms = {},
    wings = {}, shield = 0, wave = 0, waveGap = 0, boss = nil,
    wingBurst = 0, flashT = 0, flyIn = false, fashez = 0,
    levelIdx = 0, levelT = 0, mode = 'gate', env = nil, levelMul = 1,
    stats = { kills = 0, hits = 0, pick = 0, time = 0 },
    needles = 0, wallSeq = 0, wallHits = {},
    guanri = nil, phoenix2 = nil, freezeT = 0, chargeGraze = 0,
    traitCard = nil, traitT = {}, fxAura = {}, recyc = 0, sparkSeeds = {}, traitQ = {},
    zmArmed = false, zmFull = false, jTapT = 0, jHeld = false, jPressFull = false, holdT = 0, lastHold = 0,
    renjianWin = 0, renjianLeft = 0, renjianCd = 0, qiudaoCd = 0,
    loopMark = { shot = -99, sword = -99, wall = -99 }, unlockFx = nil, slowT = 0, slowK = 0.35,
    shake = 0, winPending = 0, wingBurst2 = 0,
    scrollX = 0, scrollSpd = N.scroll, dj1Timer = 1.5, dxddT = 2.6, invuln = 0, lock = 0,
    msgs = {}, waves = LEVELS[1].waves,
    autoPlay = false, chargeTier = 0, chargeFull = false, chargeMax = false,
    needleSalvo = nil, readyFx = 0,
    codexUnlocked = {}, traitsSeen = {}, patDelay = {},
    floaters = {}, dmgAcc = {}, dmgAccT = 0.5,
  }
end

local function loadLevel(g, i)
  g.levelIdx = i
  local L = LEVELS[i]
  g.waves = L.waves; g.mode = L.mode; g.env = L.env; g.levelMul = L.mul or 1
  g.wave = 0; g.levelT = 0; g.waveGap = 0; g.boss = nil
  g.enemies = {}; g.ebullets = {}; g.items = {}; g.booms = {}
  g.needles = 0; g.neng = 0; g.guanri = nil; g.phoenix2 = nil; g.freezeT = 0
  g.traitCard = nil; g.traitT = {}; g.fxAura = {}; g.recyc = 0; g.sparkSeeds = {}; g.traitQ = {}
  g.zmArmed = false; g.zmFull = false; g.jTapT = 0; g.jHeld = false; g.jPressFull = false
  g.holdT = 0; g.lastHold = 0
  g.renjianWin = 0; g.renjianLeft = 0; g.renjianCd = 0; g.qiudaoCd = 0
  g.scrollSpd = N.scroll; g.dxddT = 2.6
  g.needleSalvo = nil; g.patDelay = {}
  g.winPending = 0
  g.floaters = {}; g.dmgAcc = {}; g.dmgAccT = 0.5
  say(g, L.name); log('level ' .. i)
end

local function startRun(g)
  g.state = 'playing'
  g.shipKey = g.selIdx == 1 and 'lantu' or 'hongmao'
  g.ship = { x = 45, y = 100, w = 10, h = 8 }
  g.fireCd = 0; g.neng = 0
  g.wings = {}
  g.life = 4; g.bomm = 3; g.lv = 1; g.score = 0
  loadLevel(g, 1)
  g.stats = { kills = 0, hits = 0, pick = 0, time = 0 }
  g.items[#g.items + 1] = mkItem(g, 'pow', 130, 110)
  log('game_start'); log('char_select ' .. g.shipKey)
end

local function unlock(g, id)
  if g.codexUnlocked[id] then return end
  g.codexUnlocked[id] = 1
  local e
  for _, c in ipairs(CODEX) do if c[1] == id then e = c end end
  g.unlockFx = { t = 2.5, n = e and e[2] or id }
  g.slowT = 0.5; g.slowK = 0.35
  log('insight ' .. id)
end

local function setLv(g, n)
  g.lv = clamp(n, 1, 5); syncWings(g); g.neng = 0
  say(g, '武器 LV' .. g.lv .. (g.lv > 1 and ' · 按住J蓄力' or ''))
end

local function eshoot(g, e, vx, vy, art)
  if #g.ebullets > 140 then return end
  g.ebullets[#g.ebullets + 1] = { x = e.x, y = e.y, vx = vx * 0.75, vy = vy * 0.75, w = 6, h = 6, art = art or 'szd' }
end

local function fireVolley(g)
  local S, cfg = g.ship, N.ships[g.shipKey]
  local dmg = math.floor(N.zdlv[g.lv] * (cfg.dmgMul or 1) + 0.5)
  local sp = cfg.bspeed
  local fan = cfg.bullet == 'changhong'
  local bw = cfg.bullet == 'jezd' and 24 + g.lv * 2 or (fan and 28 or 27)
  local bh = cfg.bullet == 'jezd' and 8 or (fan and 9 or ({ 10, 15, 12, 15, 15 })[g.lv])
  local offs
  if fan then
    offs = (g.lv <= 2 and { { 0, 0 } }) or (g.lv == 3 and { { 0, -50 }, { 0, 50 } })
      or (g.lv == 4 and { { 0, -70 }, { 0, 0 }, { 0, 70 } })
      or { { 0, -105 }, { 0, -63 }, { 0, -21 }, { 0, 21 }, { 0, 63 }, { 0, 105 } }
  else
    offs = (g.lv <= 2 and { { 0, 0 } }) or (g.lv == 3 and { { -4, 0 }, { 4, 0 } })
      or (g.lv == 4 and { { -8, 0 }, { 0, 0 }, { 8, 0 } })
      or { { -15, 0 }, { -9, 0 }, { -3, 0 }, { 3, 0 }, { 9, 0 }, { 15, 0 } }
  end
  for _, o in ipairs(offs) do
    g.bullets[#g.bullets + 1] = { x = S.x + 16, y = S.y + o[1], vx = sp, vy = o[2],
      w = bw, h = bh, dmg = dmg, art = cfg.bullet, maxD = cfg.range or 0, dist = 0 }
  end
  g.loopMark.shot = g.t
  if g.shipKey == 'hongmao' then
    for _, w in ipairs(g.wings) do
      g.bullets[#g.bullets + 1] = { x = w.x + 10, y = w.y, vx = w.bspd or cfg.wingSpeed, vy = 0,
        w = 16, h = 7, dmg = math.floor(N.zdlv[g.lv] * 1.2 + 0.5), art = cfg.wingBullet }
      g.booms[#g.booms + 1] = { x = w.x + 13, y = w.y, t = 0.08, spark = true }
    end
  elseif g.needles < g.lv * (2 + g.lv) then
    g.needles = g.needles + 1
  end
end

local function traitFire(g, id)
  if g.state ~= 'playing' then return end
  local armed
  for _, q in ipairs(g.traitQ) do if q.id == id then armed = true end end
  if not g.traitsSeen[id] and not armed then
    g.traitQ[#g.traitQ + 1] = { id = id, t = 2.5 }
    log('trait_arm ' .. id)
  elseif g.traitsSeen[id] and (g.traitT[id] or 0) < g.t then
    g.traitT[id] = g.t + 4
    say(g, traitName(id) .. '!')
    log('trait ' .. id)
  end
end

local function critRate(g, kind)
  local r = 0.05
  if g.life == 1 then r = r + 0.2 end
  if kind == 'needle' and g.shipKey == 'lantu' and g.freezeT > 0 then r = r + 0.5 end
  return math.min(r, 0.95)
end

local DMGCOL = {
  normal = C(255, 232, 241, 255), crit = C(255, 255, 90, 90),
  burn = C(255, 255, 154, 61), frost = C(255, 127, 216, 255), skill = C(255, 255, 209, 102),
}
local function dmgFloat(g, e, d, kind, crit)
  if not d or d < 1 or not e or e.x == nil then return end
  local sz = math.min(11 + d * 0.1, 40) * (crit and 1.15 or 1)
  g.floaters[#g.floaters + 1] = {
    x = e.x + (math.random() * 18 - 9), y = e.y - 12 + (math.random() * 12 - 6),
    txt = tostring(math.floor(d + 0.5)),
    col = DMGCOL[kind] or DMGCOL.normal, sz = math.floor(sz), t = 0.7,
  }
  if #g.floaters > 60 then table.remove(g.floaters, 1) end
end

local function traitBulletDmg(g, b, e)
  local d = b.dmg
  local kind = b.wallId and 'needle' or (b.art == 'changhong' and 'sword' or (b.art == 'bingpoj' and 'blade' or 'wing'))
  if kind == 'needle' and g.shipKey == 'lantu' and g.freezeT > 0 then traitFire(g, 'yizhen') end
  if kind == 'needle' and b.zm then traitFire(g, 'zhenman'); g.fxAura.zhenman = 0.6 end
  local crit = math.random() < critRate(g, kind)
  if crit then
    d = d * 2
    g.booms[#g.booms + 1] = { x = e.x, y = e.y, t = 0.25, crit = true }
  end
  dmgFloat(g, e, d, b.art == 'bingpoj' and 'frost' or 'normal', crit)
  return math.floor(d + 0.5)
end

local function fireSmallSwords(g, n, fxId)
  local cfg = N.ships[g.shipKey]
  local S = g.ship
  local dmg = math.floor((95 + 28 * g.lv) * 0.35 + 0.5)
  for i = 0, n - 1 do
    local oy = (i - (n - 1) / 2) * 12
    g.bullets[#g.bullets + 1] = { x = S.x + 16, y = S.y + oy, vx = cfg.bspeed * 1.2, vy = 0,
      w = 16, h = 6, dmg = dmg, art = 'changhong', maxD = 0, dist = 0 }
  end
  g.booms[#g.booms + 1] = { x = S.x + 20, y = S.y, t = 0.2, spark = true }
  if fxId then g.fxAura[fxId] = 0.6 end
  log('small_sword ' .. n)
end

local function needleBarrage(g, mult, big, keep, zm)
  local S = g.ship
  local n = g.needles
  if n == 0 then return end
  local fire = math.max(1, math.ceil(n * keep))
  local gone = n - fire
  g.needleSalvo = { x = S.x, y = S.y, n = fire, mult = mult, big = big, int = 0.12, rows = g.lv, zm = zm and true or false }
  for _ = 1, gone do
    g.booms[#g.booms + 1] = { x = S.x + (math.random() - 0.5) * 54, y = S.y + (math.random() - 0.5) * 38, t = 0.3, spark = true }
  end
  g.needles = 0
  log('needle_wall')
  g.loopMark.wall = g.t
  if g.t - g.loopMark.shot < 12 then unlock(g, 'bing_lun') end
end

local function releaseCharge(g)
  local cfg = N.ships[g.shipKey]
  local S = g.ship
  local tier = g.chargeTier
  g.fashez = 2.0
  log('phoenix ' .. g.lv)
  if cfg.chargeType == 'guanri' then
    local n = #g.wings
    if tier < 1 then
      g.wingBurst2 = 2.4 * 0.3
      say(g, '长虹未满·仅僚机齐射'); log('charge_weak'); return
    end
    g.guanri = { t = 3.2, x = S.x + 20, w = 12 + 7 * (g.lv - 2), y = S.y,
      dmg = 95 + 28 * g.lv, hitset = {} }
    if n >= 3 then unlock(g, 'guanri_full') end
    g.wingBurst2 = 2.4
    g.renjianLeft = 2; say(g, '长虹贯日!')
    return
  else
    local tgt
    for _, e in ipairs(g.enemies) do
      if not e.dead and e.x > S.x then if not tgt or e.x < tgt.x then tgt = e end end
    end
    local ang = 0
    if tgt then ang = clamp(math.atan(tgt.y - S.y, tgt.x - S.x) or 0, -0.5, 0.5) end
    local cnt = math.max(1, math.floor(g.lv * tier + 0.5))
    for k = 0, cnt - 1 do
      local a = ang + (k - (cnt - 1) / 2) * 0.09
      g.bullets[#g.bullets + 1] = { x = S.x + 16, y = S.y, vx = math.cos(a) * 750, vy = math.sin(a) * 750,
        w = 40, h = 24,
        dmg = math.floor((95 + 40 * g.lv) * tier * (0.4 + 0.6 * g.needles / (g.lv * (2 + g.lv))) + 0.5),
        maxD = 200, dist = 0, art = 'bingpoj' }
    end
    say(g, tier == 1 and '冰魄剑!' or '冰魄剑·残形')
    g.loopMark.sword = g.t
    needleBarrage(g, tier == 1 and 2.0 or 0.6, true, tier == 1 and 1 or 0.25, g.zmArmed)
    g.zmArmed = false
  end
end

local function tryBomb(g)
  if g.state ~= 'playing' or g.lock > 0 or g.bomm <= 0 then return end
  g.bomm = g.bomm - 1; g.shield = 2.0; log('bomb ' .. g.bomm)
  g.flashT = 0.4; g.slowT = 0.8; g.slowK = 0.08; g.shake = 0.7
  if g.shipKey == 'hongmao' then
    g.phoenix2 = { x = g.ship.x + 20, y = g.ship.y, vx = 240, t = 5, hitset = {} }
    g.ebullets = {}
    say(g, '火凤燎原!')
  else
    g.freezeT = 4; say(g, '冰封千里!')
    for _, b in ipairs(g.ebullets) do b.vx = 0; b.vy = 0; b.frozen = true end
  end
  log('bomb_clear')
end

local function onKill(g, e)
  g.score = g.score + (e.def.score or 0); g.stats.kills = g.stats.kills + 1
  log('score ' .. g.score)
  g.booms[#g.booms + 1] = { x = e.x, y = e.y, t = 0.5, big = e.isBoss }
  if g.ship and hypot(e.x - g.ship.x, e.y - g.ship.y) < 40 then unlock(g, 'tie_lian') end
  if e.isMid then g.items[#g.items + 1] = mkItem(g, 'pow', e.x, e.y); say(g, '能量块出现!') end
  if g.shipKey == 'hongmao' and (e.burn or 0) > 0 and not e.isBoss then
    local best, bd
    for _, x in ipairs(g.enemies) do
      if not x.dead and not x.gone and not ((x.burn or 0) > 0) and x ~= e then
        local d = hypot(x.x - e.x, x.y - e.y)
        if d < 90 and (not bd or d < bd) then best = x; bd = d end
      end
    end
    if best then g.sparkSeeds[#g.sparkSeeds + 1] = { x = e.x, y = e.y, tgt = best, sp = 320 } end
  end
  local drops = {}
  if e.kind == 'dj2' then drops = { 'bs', 'bs' } end
  if e.kind == 'dj4' and math.random() < 0.5 then drops = { 'bs' } end
  if e.kind == 'nq' or e.kind == 'nq2' or e.kind == 'jxr1' or e.kind == 'lsfj' then drops = { 'bs', 'bs' } end
  if e.kind == 'dgp' then drops = { 'bs', 'bs', 'bs' } end
  if e.kind == 'cw' then drops = { 'pow' } end
  if e.kind == 'jbdj' then
    if math.random() < 0.3 then drops = { 'pow' } else drops = { 'bs', 'bs', 'bs' } end
  end
  for _, k in ipairs(drops) do g.items[#g.items + 1] = mkItem(g, k, e.x, e.y) end
  if e.isMid then g.items[#g.items + 1] = mkItem(g, 'bom1', e.x, e.y) end
  if e.isBoss then
    g.boss = nil; g.ebullets = {}
    local pw = mkItem(g, 'pow', e.x - 20, e.y + 10); pw.life = 9; g.items[#g.items + 1] = pw
    local bm = mkItem(g, 'bom1', e.x + 20, e.y + 10); bm.life = 9; g.items[#g.items + 1] = bm
    g.invuln = 99; g.winPending = 6
  end
end

local function damage(g, e, dmg)
  e.hp = e.hp - dmg; e.flash = 0.09
  if e.hp <= 0 and not e.dead and e.isBoss and e.phases and e.phaseIdx < #e.phases then
    e.phaseIdx = e.phaseIdx + 1
    e.hp = e.phases[e.phaseIdx]
    g.score = g.score + 1000; log('score ' .. g.score)
    g.ebullets = {}
    say(g, e.kind .. ' 变形!'); e.flash = 0.15
    return
  end
  if e.hp <= 0 and not e.dead then e.dead = true; onKill(g, e) end
end

local function playerHit(g)
  if g.invuln > 0 or g.lock > 0 then return end
  g.booms[#g.booms + 1] = { x = g.ship.x, y = g.ship.y, t = 0.6, big = true }
  g.lv = 1; g.wings = {}; g.neng = 0; g.needles = 0; g.stats.hits = g.stats.hits + 1
  g.items[#g.items + 1] = mkItem(g, 'pow', g.ship.x, g.ship.y)
  g.life = g.life - 1
  log('life ' .. math.max(g.life, 0)); log('respawn'); log('pow 1')
  if g.life == 1 then traitFire(g, 'beishui'); g.fxAura.beishui = 0.6 end
  if g.life <= 0 then
    g.state = 'fail'
    log('fail lives')
    ensureGameOverPanel()
    syncScreens()
    return
  end
  g.bomm = 3; g.shield = 1.2
  g.ship.x = -20; g.ship.y = 100; g.invuln = 1.8; g.flyIn = true
end

local function spawnWave(g)
  g.wave = g.wave + 1
  local nw = g.waves[g.wave]
  if not nw then return end
  if nw.boss then
    local def = N.enemy[nw.boss]
    local sz = ({ boss3 = { 80, 60 }, jxjq = { 150, 100 }, black = { 70, 105 }, cw1 = { 60, 55 } })[nw.boss] or { 80, 100 }
    g.boss = { kind = nw.boss, def = def, hp = def.phases and def.phases[1] or def.hp,
      phases = def.phases, phaseIdx = 1,
      x = nw.boss == 'jxjq' and 330 or FIELD_W + 70,
      y = nw.boss == 'jxjq' and -70 or (nw.boss == 'cw1' and 130 or 150),
      w = sz[1], h = sz[2], isBoss = true, phase = 'enter', pt = 0, patT = 0, pat = 0,
      win18 = 0, winT = 0, dead = false }
    g.scrollSpd = N.scrollBoss; g.lock = 1.0; g.ebullets = {}
    log('boss_spawn')
    return
  end
  if nw.midBoss then
    local mk = nw.midBoss
    local def = N.enemy[mk]
    g.enemies[#g.enemies + 1] = { kind = mk, def = def, hp = math.floor(def.hp * (g.levelMul or 1) + 0.5),
      x = FIELD_W + 40, y = mk == 'cw' and 100 or 190, w = def.w, h = def.h, t = 0,
      fireT = 1.2, dead = false, isMid = true, hoverX = mk == 'cw' and 260 or 345,
      bob = 0, escT = mk == 'cw' and 15.6 or nil }
    log('midboss')
    return
  end
  for _, sp in ipairs(nw.spawns) do
    local kind, y = sp[1], sp[2]
    if kind == 'xkl' then
      g.ebullets[#g.ebullets + 1] = { x = FIELD_W + 20, y = y,
        vx = -(170 + math.random() * 190) * 0.75, vy = (math.random() - 0.5) * 40, w = 13, h = 9, art = 'szd2' }
    elseif kind == 'bsrain' then
      local it = mkItem(g, 'bs', FIELD_W - 10, y); it.vx = -110; it.free = true
      g.items[#g.items + 1] = it
    else
      local def = N.enemy[kind]
      g.enemies[#g.enemies + 1] = { kind = kind, def = def,
        hp = math.floor(def.hp * (g.levelMul or 1) + 0.5), x = FIELD_W + 30, y = y,
        w = def.w or 30, h = def.h or 22, t = 0, fireT = 1 + math.random(), dead = false,
        hoverX = 320 + math.random() * 60, bob = math.random() * 6.28 }
    end
  end
  log('wave ' .. g.wave)
end

-- ============================ 更新 ============================
local function jFireCore(g)
  local cfg = N.ships[g.shipKey]
  fireVolley(g)
  g.fireCd = (cfg.fireCd or 0.3) / (g.life == 1 and 1.2 or 1)
  if g.renjianWin > 0 and g.renjianLeft > 0 and g.shipKey == 'hongmao' then
    g.renjianLeft = g.renjianLeft - 1; g.renjianWin = 0; g.renjianCd = g.t + 1.2
    traitFire(g, 'renjian'); fireSmallSwords(g, 2, 'renjian')
  end
end

local function update(g, dt)
  if g.traitCard then
    if kEdge then
      g.traitCard = nil; g.invuln = math.max(g.invuln, 1.5)
      syncScreens()
    end
    return
  end
  if #g.traitQ > 0 then
    for _, q in ipairs(g.traitQ) do q.t = q.t - dt end
    if g.traitQ[1].t <= 0 then
      local q = table.remove(g.traitQ, 1)
      g.traitsSeen[q.id] = 1
      g.traitCard = { id = q.id }
      log('trait_unlock ' .. q.id)
      syncScreens()
      return
    end
  end
  g.t = g.t + dt; g.stats.time = g.stats.time + dt
  for i = #g.msgs, 1, -1 do
    g.msgs[i].t = g.msgs[i].t + dt
    if g.msgs[i].t >= g.msgs[i].life then table.remove(g.msgs, i) end
  end
  for _, sd in ipairs(g.sparkSeeds) do
    local dx, dy = sd.tgt.x - sd.x, sd.tgt.y - sd.y
    local L = hypot(dx, dy)
    if L < 0.001 then L = 1 end
    sd.x = sd.x + dx / L * sd.sp * dt; sd.y = sd.y + dy / L * sd.sp * dt
    if L < 14 then
      sd.done = true
      if not sd.tgt.dead then
        sd.tgt.burn = 12; sd.tgt.burnTick = 3
        traitFire(g, 'xinhuo'); g.fxAura.xinhuo = 0.6
      end
    end
  end
  for i = #g.sparkSeeds, 1, -1 do if g.sparkSeeds[i].done then table.remove(g.sparkSeeds, i) end end

  if g.state == 'select' then
    if keys['a'] or keys['arrowleft'] then g.selIdx = 0 end
    if keys['d'] or keys['arrowright'] then g.selIdx = 1 end
    if jEdge or keys['enter'] then startRun(g); syncScreens() end
    return
  end
  if g.state == 'clear' then
    if kEdge then nextLevel(g) end
    return
  end
  if g.state ~= 'playing' then return end

  if g.slowT > 0 then g.slowT = g.slowT - dt; dt = dt * (g.slowK or 0.35) end
  if g.winPending > 0 then
    g.winPending = g.winPending - dt; g.invuln = 99
    if g.winPending <= 0 and g.state == 'playing' then win(g); return end
  end

  local S, cfg = g.ship, N.ships[g.shipKey]
  if g.autoPlay then
    g.invuln = 99
    S.x = clamp(S.x + 60 * dt, 80, 200)
  end
  if g.lock > 0 then g.lock = g.lock - dt end
  if g.flyIn then
    g.ship.x = g.ship.x + 280 * dt
    if g.ship.x >= 40 then g.ship.x = 40; g.flyIn = false end
  end
  if g.invuln > 0 and g.invuln < 90 then g.invuln = g.invuln - dt end
  if g.shield > 0 then g.shield = g.shield - dt end
  if g.freezeT > 0 then
    g.freezeT = g.freezeT - dt
    if g.freezeT <= 0 then for _, b in ipairs(g.ebullets) do if b.frozen then b.x = 1e4 end end end
  end
  if g.shake > 0 then g.shake = g.shake - dt end
  if g.flashT > 0 then g.flashT = g.flashT - dt end

  local mvx, mvy = 0, 0
  if g.lock <= 0 then
    if keys['a'] or keys['arrowleft'] then mvx = mvx - 1 end
    if keys['d'] or keys['arrowright'] then mvx = mvx + 1 end
    if keys['w'] or keys['arrowup'] then mvy = mvy + 1 end
    if keys['s'] or keys['arrowdown'] then mvy = mvy - 1 end
    if touch.on then
      local dx, dy = touch.x - S.x, touch.y - S.y
      local L = hypot(dx, dy)
      if L > 4 then mvx = dx / L; mvy = dy / L end
    end
  end
  local spd = g.life == 1 and 1.2 or 1
  S.x = clamp(S.x + mvx * N.player.vx * spd * dt, N.player.xMin, N.player.xMax)
  S.y = clamp(S.y + mvy * N.player.vy * spd * dt, N.player.yMin, N.player.yMax)
  if mvx ~= 0 or mvy ~= 0 then
    local function bl(dir, key)
      if (boundLogT[key] or -9) < g.t - 0.5 then log('bound ' .. dir); boundLogT[key] = g.t end
    end
    if S.x <= N.player.xMin + 0.01 then bl('left', 'l') end
    if S.x >= N.player.xMax - 0.01 then bl('right', 'r') end
    if S.y <= N.player.yMin + 0.01 then bl('down', 'd') end
    if S.y >= N.player.yMax - 0.01 then bl('up', 'u') end
  end

  local firing = keys['j'] == true or touch.on or g.autoPlay
  if firing then g.holdT = g.holdT + dt
  else if g.holdT > 0 then g.lastHold = g.holdT end; g.holdT = 0 end
  local jNow = keys['j'] == true
  if jNow and not g.jHeld then
    g.jTapT = g.t + 0.25
    g.jPressFull = (g.shipKey == 'lantu' and g.needles >= g.lv * (2 + g.lv))
    if g.lock <= 0 and g.state == 'playing' and g.fireCd <= 0 then jFireCore(g) end
  end
  if not jNow and g.jHeld and g.jTapT > 0 then
    g.jTapT = 0
    if g.jPressFull and g.shipKey == 'lantu' and g.needles >= g.lv * (2 + g.lv) then
      needleBarrage(g, 0.7, false, 1, false)
    end
  end
  g.jHeld = jNow
  if g.jTapT > 0 and g.t >= g.jTapT then g.jTapT = 0 end
  local wasCd = g.fireCd
  g.fireCd = g.fireCd - dt
  if wasCd > 0 and g.fireCd <= 0 then g.readyFx = 0.14 end
  if touch.on and g.lock <= 0 and g.fireCd <= 0 then jFireCore(g) end
  if g.autoPlay and g.lock <= 0 and g.fireCd <= 0 then jFireCore(g) end
  if g.readyFx > 0 then g.readyFx = g.readyFx - dt end
  if g.renjianWin > 0 then g.renjianWin = g.renjianWin - dt end
  for k, v in pairs(g.fxAura) do if v > 0 then g.fxAura[k] = v - dt end end

  if g.shipKey == 'lantu' then
    local full = g.needles >= g.lv * (2 + g.lv)
    if full and not g.zmFull then g.fxAura.zhenman = 0.6; say(g, '针匣已满：点按倾匣 · 长按蓄力') end
    g.zmFull = full
  end
  if g.fashez > 0 then g.fashez = g.fashez - dt; g.neng = 0
  elseif firing and g.lv > 1 and g.holdT >= 0.25 then
    local cr = N.chargeRate
    if g.shipKey == 'lantu' and g.needles >= g.lv * (2 + g.lv) then cr = cr * 1.3 end
    g.neng = math.min(g.neng + cr * dt, cfg.ps * 1.5)
  end
  if g.lv > 1 then
    if g.neng >= cfg.ps then
      if not g.chargeFull then
        g.chargeFull = true
        if g.shipKey == 'lantu' and g.needles >= g.lv * (2 + g.lv) then g.zmArmed = true end
        if g.chargeGraze >= 3 then unlock(g, 'xuli_zouwei') end
        g.chargeGraze = 0
      end
      if g.neng >= cfg.ps * 1.5 and not g.chargeMax then g.chargeMax = true; say(g, '过载!') end
    else g.chargeFull = false; g.chargeMax = false end
  end
  if g.neng <= 0 then g.chargeGraze = 0 end
  if not firing and g.neng > 0 and g.lastHold >= 0.25 then
    if g.neng >= 0.7 * cfg.ps then
      g.chargeTier = g.neng >= cfg.ps * 1.5 and 1 or 0.25
      releaseCharge(g)
    end
    g.neng = 0
  end
  if g.wingBurst > 0 then g.wingBurst = g.wingBurst - dt end
  if kEdge then tryBomb(g) end

  local charging = g.lv > 1 and g.neng > 0 and g.fashez <= 0
  if g.needleSalvo then
    local sv = g.needleSalvo
    sv.int = sv.int - dt
    if sv.int <= 0 and sv.n > 0 then
      sv.int = 0.07; sv.n = sv.n - 1
      local row = sv.n % sv.rows
      g.wallSeq = g.wallSeq + 1
      g.bullets[#g.bullets + 1] = { x = sv.x, y = sv.y + (row - (sv.rows - 1) / 2) * 11,
        vx = 560, vy = (row - (sv.rows - 1) / 2) * 18,
        w = 30, h = 9, dmg = math.floor((12 + 7 * g.lv) * sv.mult + 0.5), pierce = sv.big,
        art = 'yinzhen', maxD = sv.big and 240 or 300, dist = 0,
        wallId = g.wallSeq, zm = sv.zm }
    end
    if sv.n <= 0 then g.needleSalvo = nil end
  end
  if g.wingBurst2 > 0 then g.wingBurst2 = g.wingBurst2 - dt end
  for i, w in ipairs(g.wings) do
    local tx, ty
    if charging and g.shipKey == 'hongmao' then
      local a = g.t * 4 + i * 6.28 / math.max(1, #g.wings)
      tx = S.x + math.cos(a) * 26; ty = S.y + math.sin(a) * 26
    elseif charging then
      tx = S.x + 22 - i * 10; ty = S.y + (i % 2 == 1 and 6 or -6)
    elseif g.shipKey == 'lantu' then
      tx = S.x - 26 - i * 15; ty = S.y - 8 - i * 11 + math.sin(g.t * 2.2 + i) * 3
    else
      tx = S.x - 26 - i * 16; ty = S.y - 10
    end
    local k2 = math.min(1, dt * 5 * (w.k or 1))
    w.x = w.x + (tx - w.x) * k2 * 1.4; w.y = w.y + (ty - w.y) * k2
    w.fireCd = w.fireCd - dt
    if g.wingBurst2 > 0 and w.fireCd <= 0 and g.lock <= 0 then
      g.bullets[#g.bullets + 1] = { x = w.x + 10, y = w.y, vx = 360 + math.random() * 140, vy = 0,
        sine = { amp = 110 + math.random() * 40, freq = 3.5 + math.random(), ph = math.random() * 6.28 },
        w = 14, h = 6, dmg = math.floor(N.zdlv[g.lv] * 0.9 + 0.5), art = 'fdzd' }
      w.fireCd = 2.4 / (8 + 2 * g.lv)
    end
  end

  g.scrollX = g.scrollX + g.scrollSpd * dt

  if g.env == 'dxdd' then
    g.dxddT = g.dxddT - dt
    if g.dxddT <= 0 then
      g.dxddT = 1.9 + math.random() * 0.8
      g.enemies[#g.enemies + 1] = { kind = 'dxdd', def = N.enemy.dxdd, hp = 99999,
        x = 320 + math.random() * 100, y = 12, w = 43, h = 16, t = 0, dead = false,
        yy = 30 + math.random() * 150, spp = 70 + math.random() * 60, sp = 300 + math.random() * 220,
        charging = false, fireT = 99, hoverX = 999, bob = 0 }
    end
  end
  g.dj1Timer = g.dj1Timer - dt
  if g.dj1Timer <= 0 and #g.enemies + (g.boss and 1 or 0) < 14 then
    g.dj1Timer = 0.12
    if math.random() < 0.1 then
      local y = 40 + math.random() * 150
      if g.env == 'lfj' then
        g.enemies[#g.enemies + 1] = { kind = 'lfj', def = N.enemy.lfj, hp = 1, x = FIELD_W + 20, y = y,
          w = 30, h = 12, t = 0, dead = false, spd = 125 + math.random() * 50, fired = false, fireT = 99 }
      else
        g.enemies[#g.enemies + 1] = { kind = 'dj1', def = N.enemy.dj1, hp = 1, x = FIELD_W + 20, y = y,
          w = 34, h = 14, t = 0, dead = false, spd = 200 + math.random() * 100, fired = false, fireT = 99 }
      end
    end
  end

  g.waveGap = g.waveGap - dt
  local NW = #g.waves
  if g.mode == 'time' then
    g.levelT = g.levelT + dt
    local bossHold = g.boss ~= nil
    if not bossHold then for _, e in ipairs(g.enemies) do if e.isMid then bossHold = true end end end
    if not bossHold then
      while g.wave < NW and g.waves[g.wave + 1] and g.waves[g.wave + 1].t and g.waves[g.wave + 1].t <= g.levelT do
        spawnWave(g)
      end
    end
  else
    local gateClear = not g.boss
    for _, e in ipairs(g.enemies) do
      if e.kind ~= 'dj1' and e.kind ~= 'lfj' then gateClear = false end
    end
    if gateClear and g.wave < NW and g.waveGap <= 0 then
      spawnWave(g); g.waveGap = 1.2
    end
  end

  for _, e in ipairs(g.enemies) do
    local fdt = g.freezeT > 0 and 0 or dt
    e.t = e.t + fdt
    if (e.flash or 0) > 0 then e.flash = e.flash - dt end
    local fs = g.freezeT > 0 and 0 or 1
    if (e.burn or 0) > 0 then
      e.burn = e.burn - dt
      e.burnTick = (e.burnTick == nil and 3 or e.burnTick) - dt
      if e.burnTick <= 0 then
        e.burnTick = 3
        damage(g, e, 35)
        dmgFloat(g, e, 35, 'burn', false)
      end
    end
    if e.kind == 'dxdd' then
      if not e.charging then
        e.y = e.y + e.spp * dt * fs
        if e.y >= e.yy then e.charging = true end
      else
        e.x = e.x - e.sp * dt * fs
      end
      if e.x < -40 then e.gone = true end
    elseif e.def.roller then
      e.x = e.x - 110 * dt * fs
      e.fireT = e.fireT - dt * fs
      if e.fireT <= 0 and e.x < FIELD_W and g.lock <= 0 and g.freezeT <= 0 then
        e.fireT = 2.2 + math.random()
        local vx, vy = aimed(e.x, e.y, S.x, S.y, 170)
        eshoot(g, e, vx, vy)
      end
      if e.x < -40 then e.gone = true end
    elseif e.escT ~= nil then
      if e.x > e.hoverX then e.x = e.x - 140 * dt * fs
      elseif fs > 0 then e.x = e.hoverX + math.sin(e.t * 0.7 + e.bob) * 14 end
      e.escT = e.escT - dt * fs
      if e.escT <= 0 then
        e.y = e.y + 150 * dt; e.fireT = 99
        if e.y > 270 then e.gone = true; say(g, '黑翼蛟遁走了…'); log('cw_escape') end
      end
      e.fireT = e.fireT - dt * fs
      if e.escT > 0 and e.fireT <= 0 and e.x < FIELD_W and g.lock <= 0 and g.freezeT <= 0 then
        e.fireT = 1.8
        for i = 0, 3 do eshoot(g, e, -110, (i - 1.5) * 38, 'szd2') end
      end
    elseif e.kind == 'dj1' or e.kind == 'lfj' then
      e.x = e.x - e.spd * dt
      if not e.fired and e.x < S.x then e.fired = true end
      if e.fired and math.random() < dt * 1.2 and e.x < FIELD_W and e.x > S.x then
        local vx, vy = aimed(e.x, e.y, S.x, S.y, 150)
        eshoot(g, e, vx, vy)
      end
      if e.x < -30 then e.gone = true end
    else
      if e.x > e.hoverX then e.x = e.x - 140 * dt * fs
      elseif fs > 0 then e.x = e.hoverX + math.sin(e.t * 0.7 + e.bob) * 18 end
      if fs > 0 then e.y = clamp(e.y + math.sin(e.t * 1.8 + e.bob) * 14 * dt, 55, 205) end
      e.fireT = e.fireT - dt * fs
      if e.fireT <= 0 and e.x < FIELD_W + 5 and g.lock <= 0 and g.freezeT <= 0 then
        e.fireT = 1.5 + math.random() * 0.9
        local sp = e.def.zdsd or 150
        local vx, vy = aimed(e.x, e.y, S.x, S.y, sp)
        eshoot(g, e, vx, vy)
        if e.kind == 'dj2' or e.kind == 'dj3' then
          local vx2, vy2 = aimed(e.x, e.y, S.x, S.y + 40, sp)
          eshoot(g, e, vx2, vy2)
        end
      end
      if e.x < 180 then e.x = 180 end
    end
    if g.invuln <= 0 and g.lock <= 0 and hit(e, S) then playerHit(g) end
  end
  for i = #g.enemies, 1, -1 do
    local e = g.enemies[i]
    if e.dead or e.gone then table.remove(g.enemies, i) end
  end

  local b = g.boss
  if b then
    local bfs = g.freezeT > 0 and 0 or 1
    b.pt = b.pt + dt * bfs; b.patT = b.patT + dt * bfs
    if (b.flash or 0) > 0 then b.flash = b.flash - dt end
    if b.phase == 'enter' then
      if b.kind == 'jxjq' then
        b.y = b.y + 70 * dt
        if b.y >= 110 then b.phase = 'fight'; g.scrollSpd = N.scroll end
      else
        b.x = b.x - 90 * dt
        if b.x <= 360 then b.x = 360; b.phase = 'fight'; g.scrollSpd = N.scroll end
      end
    else
      if b.kind == 'boss3' and b.phaseIdx > 1 then
        if not b.aiT or b.aiT <= 0 then
          b.aiT = 3; b.tx = 280 + math.random() * 100; b.ty = 60 + math.random() * 140
        end
        b.aiT = b.aiT - dt * bfs
        b.x = b.x + (b.tx - b.x) * math.min(1, dt * 0.5)
        b.y = b.y + (b.ty - b.y) * math.min(1, dt * 0.5)
      elseif b.kind == 'jxjq' then
        b.y = 110 + math.sin(b.pt * 0.5) * 16; b.x = 300 + math.sin(b.pt * 0.3) * 24
      else
        b.y = 125 + math.sin(b.pt * 0.9) * 30
      end
      local cd = 2.4
      if b.kind == 'boss2' then cd = b.phaseIdx > 1 and 1.8 or 2.2 end
      if b.kind == 'boss3' then cd = 1.8 end
      if b.kind == 'jxjq' then cd = 2.0 end
      if b.kind == 'black' then cd = b.phaseIdx == 3 and 1.3 or 1.6 end
      if b.kind == 'cw1' then cd = 2.0 end
      if b.patT > cd and g.lock <= 0 and g.freezeT <= 0 then
        b.patT = 0; b.pat = (b.pat + 1) % 3
        if b.kind == 'boss2' then
          if b.pat == 0 then
            for _, dy in ipairs({ -40, 0, 40 }) do
              local vx, vy = aimed(b.x, b.y, S.x, S.y + dy, b.phaseIdx > 1 and 172 or 150)
              eshoot(g, b, vx, vy)
            end
          elseif b.pat == 1 then
            b.win18 = 6; b.winT = 0
          else
            for _, a in ipairs({ -0.3, 0, 0.3 }) do
              local vx, vy = aimed(b.x, b.y, S.x, S.y, 150)
              local c2, s2 = math.cos(a), math.sin(a)
              eshoot(g, b, vx * c2 - vy * s2, vx * s2 + vy * c2)
            end
          end
        elseif b.kind == 'boss3' then
          if b.pat == 0 then
            for _, dy in ipairs({ -50, 0, 50 }) do
              local vx, vy = aimed(b.x, b.y, S.x, S.y + dy, 190)
              eshoot(g, b, vx, vy)
            end
          elseif b.pat == 1 then
            for i = 0, 5 do eshoot(g, b, -120, (i - 2.5) * 36, 'szd2') end
          else
            local n = b.phaseIdx > 1 and 14 or 8
            for i = 0, n - 1 do
              local a = i / n * 6.28 + b.pt
              eshoot(g, b, math.cos(a) * 100, math.sin(a) * 100, 'szd2')
            end
          end
        elseif b.kind == 'jxjq' then
          if b.pat == 0 then
            for _, dy in ipairs({ -50, 0, 50 }) do
              local vx, vy = aimed(b.x, b.y, S.x, S.y + dy, 170)
              eshoot(g, b, vx, vy)
            end
          elseif b.pat == 1 then
            for i = 0, 7 do eshoot(g, b, -130, (i - 3.5) * 34, 'szd2') end
          else
            for _, a in ipairs({ -0.5, -0.25, 0, 0.25, 0.5 }) do
              local vx, vy = aimed(b.x, b.y, S.x, S.y, 150)
              local c2, s2 = math.cos(a), math.sin(a)
              eshoot(g, b, vx * c2 - vy * s2, vx * s2 + vy * c2)
            end
          end
        elseif b.kind == 'black' then
          if b.pat == 0 then
            for i = 0, 7 do
              local a = (i - 3.5) * 0.18
              local vx, vy = aimed(b.x, b.y, S.x, S.y, 130)
              local c2, s2 = math.cos(a), math.sin(a)
              eshoot(g, b, vx * c2 - vy * s2, vx * s2 + vy * c2, 'szd2')
            end
          elseif b.pat == 1 then
            for i = 0, 9 do
              local a = i / 10 * 6.28 + b.pt
              eshoot(g, b, math.cos(a) * 110, math.sin(a) * 110, 'szd2')
            end
          else
            for _, dy in ipairs({ -30, 0, 30 }) do
              local vx, vy = aimed(b.x, b.y, S.x, S.y + dy, 185)
              eshoot(g, b, vx, vy)
            end
          end
        elseif b.kind == 'cw1' then
          if b.pat ~= 1 then
            for i = 0, 4 do eshoot(g, b, -110, (i - 2) * 40, 'szd2') end
          else
            for _, dy in ipairs({ -40, 0, 40 }) do
              local vx, vy = aimed(b.x, b.y, S.x, S.y + dy, 160)
              eshoot(g, b, vx, vy)
            end
          end
        else
          if b.pat == 0 then
            for _, a in ipairs({ -0.22, 0, 0.22 }) do
              local vx, vy = aimed(b.x, b.y, S.x, S.y, 163)
              local c2, s2 = math.cos(a), math.sin(a)
              eshoot(g, b, vx * c2 - vy * s2, vx * s2 + vy * c2)
            end
          elseif b.pat == 1 then
            for i = 0, 9 do
              local a = i / 10 * 6.28 + b.pt
              eshoot(g, b, math.cos(a) * 120, math.sin(a) * 120, 'szd2')
            end
          else
            for i = 0, 2 do
              g.patDelay[#g.patDelay + 1] = { t = i * 0.12, i = i }
            end
          end
        end
      end
      if b.win18 > 0 then
        b.winT = b.winT - dt
        if b.winT <= 0 then
          b.winT = 0.36; b.win18 = b.win18 - 1
          for _, dy in ipairs({ -80, 0, 80 }) do
            local vx, vy = aimed(b.x, b.y, S.x, S.y + dy, b.phaseIdx > 1 and 180 or 160)
            eshoot(g, b, vx, vy)
          end
        end
      end
    end
    if g.invuln <= 0 and g.lock <= 0 and hit(b, S) then playerHit(g) end
  end
  for i = #g.patDelay, 1, -1 do
    local pd = g.patDelay[i]
    pd.t = pd.t - dt
    if pd.t <= 0 then
      if g.boss and not g.boss.dead and g.state == 'playing' and g.freezeT <= 0 then
        local vx, vy = aimed(g.boss.x, g.boss.y, g.ship.x + pd.i * 30 - 30, g.ship.y, 175)
        eshoot(g, g.boss, vx, vy)
      end
      table.remove(g.patDelay, i)
    end
  end

  if g.guanri then
    local gr = g.guanri
    gr.t = gr.t - dt; gr.x = gr.x + 156 * dt
    local tgts = {}
    for _, e in ipairs(g.enemies) do tgts[#tgts + 1] = e end
    if g.boss and not g.boss.dead then tgts[#tgts + 1] = g.boss end
    for _, e in ipairs(tgts) do
      if not e.dead and not gr.hitset[e] and math.abs(e.x - gr.x) * 2 < gr.w + (e.w or 30)
        and math.abs(e.y - gr.y) * 2 < gr.w + (e.h or 20) then
        gr.hitset[e] = true
        local gd = e.isBoss and gr.dmg * 1.5 or gr.dmg
        local gc = false
        if math.random() < critRate(g, 'guanri') then
          gd = gd * 2; gc = true
          g.booms[#g.booms + 1] = { x = e.x, y = e.y, t = 0.25, crit = true }
        end
        dmgFloat(g, e, gd, 'skill', gc)
        damage(g, e, math.floor(gd + 0.5))
        e.burn = 12; e.burnTick = 3
        if g.renjianLeft > 0 and g.t > g.renjianCd and g.fireCd <= 0 then g.renjianWin = 0.3 end
        g.booms[#g.booms + 1] = { x = e.x, y = e.y, t = 0.25, spark = true }
      end
    end
    if gr.t <= 0 or gr.x > FIELD_W + 160 then g.guanri = nil end
  end

  if g.phoenix2 then
    local p = g.phoenix2
    p.t = p.t - dt; p.x = p.x + p.vx * dt; p.y = S.y + 60 * math.sin(g.t * 3)
    g.booms[#g.booms + 1] = { x = p.x - 50, y = p.y + (math.random() - 0.5) * 50, t = 0.35, spark = true }
    local tgts = {}
    for _, e in ipairs(g.enemies) do tgts[#tgts + 1] = e end
    if g.boss and not g.boss.dead then tgts[#tgts + 1] = g.boss end
    for _, e in ipairs(tgts) do
      if not e.dead and math.abs(e.x - p.x) < 52 and math.abs(e.y - p.y) < 40 then
        if (e.burn or 0) > 0 then unlock(g, 'rifeng') end
        if not p.hitset[e] then
          p.hitset[e] = true
          e.burn = 12; e.burnTick = 3
          if g.renjianLeft > 0 and g.t > g.renjianCd and g.fireCd <= 0 then g.renjianWin = 0.3 end
        end
        damage(g, e, ((e.burn or 0) > 0 and 220 or 150) * dt)
        g.dmgAcc[e] = (g.dmgAcc[e] or 0) + ((e.burn or 0) > 0 and 220 or 150) * dt
      end
    end
    if p.t <= 0 or p.x > FIELD_W + 60 then g.phoenix2 = nil end
  end

  for _, bl in ipairs(g.bullets) do
    if bl.x < 1e3 then
      bl.x = bl.x + bl.vx * dt; bl.y = bl.y + bl.vy * dt
      if bl.sine then
        bl.sine.ph = bl.sine.ph + dt * bl.sine.freq
        bl.y = bl.y + math.cos(bl.sine.ph) * bl.sine.amp * dt
      end
      if bl.pierce or bl.maxD then bl.dist = bl.dist + hypot(bl.vx, bl.vy) * dt end
      for _, e in ipairs(g.enemies) do
        if not e.dead and not e.def.hazard and hit(bl, e) then
          if bl.pierce then
            if not bl.hitSet then bl.hitSet = {} end
            if not bl.hitSet[e] then
              bl.hitSet[e] = true
              local d = bl.dmg
              if bl.wallId then
                if g.shipKey == 'lantu' and g.freezeT > 0 then traitFire(g, 'yizhen') end
                if bl.zm then traitFire(g, 'zhenman'); g.fxAura.zhenman = 0.6 end
                if math.random() < critRate(g, 'needle') then
                  d = d * 2
                  g.booms[#g.booms + 1] = { x = e.x, y = e.y, t = 0.25, crit = true }
                end
              end
              if g.freezeT > 0 and bl.art == 'bingpoj' then
                d = d * 2; unlock(g, 'dong_sui')
              end
              dmgFloat(g, e, d, bl.art == 'bingpoj' and 'frost' or 'normal', false)
              damage(g, e, d)
              if bl.art == 'bingpoj' then
                g.needles = math.min(g.lv * (2 + g.lv), g.needles + 1)
                local cnt = 0
                for _ in pairs(bl.hitSet) do cnt = cnt + 1 end
                if cnt >= 2 then unlock(g, 'jian_bu_zhen') end
              end
              if bl.wallId then
                g.wallHits[bl.wallId] = (g.wallHits[bl.wallId] or 0) + 1
                if g.wallHits[bl.wallId] >= 3 then unlock(g, 'yi_xian_chuan') end
                if g.wallHits[bl.wallId] >= 5 then unlock(g, 'man_zhen') end
              end
              if bl.wallId and g.shipKey == 'lantu' and hypot(e.x - S.x, e.y - S.y) < 90 then
                g.recyc = g.recyc + 1
                traitFire(g, 'guiqia'); g.fxAura.guiqia = 0.6
                if g.recyc % 2 == 0 then
                  g.needles = math.min(g.lv * (2 + g.lv), g.needles + 1)
                end
              end
            end
          else
            if bl.art == 'bingpoj' then g.needles = math.min(g.lv * (2 + g.lv), g.needles + 1) end
            if bl.wallId and g.shipKey == 'lantu' and hypot(e.x - S.x, e.y - S.y) < 90 then
              g.recyc = g.recyc + 1
              traitFire(g, 'guiqia'); g.fxAura.guiqia = 0.6
              if g.recyc % 2 == 0 then
                g.needles = math.min(g.lv * (2 + g.lv), g.needles + 1)
              end
            end
            damage(g, e, traitBulletDmg(g, bl, e))
            bl.x = 1e4
            break
          end
        end
      end
    end
  end
  if g.boss and not g.boss.dead then
    for _, bl in ipairs(g.bullets) do
      if bl.x < 1e3 and hit(bl, g.boss) then
        if bl.pierce then
          if not bl.hitSet then bl.hitSet = {} end
          if not bl.hitSet[g.boss] then
            bl.hitSet[g.boss] = true
            damage(g, g.boss, bl.dmg)
            g.booms[#g.booms + 1] = { x = g.boss.x, y = g.boss.y, t = 0.18 }
          end
        else
          damage(g, g.boss, traitBulletDmg(g, bl, g.boss))
          bl.x = 1e4
        end
      end
    end
  end
  for i = #g.bullets, 1, -1 do
    local bl = g.bullets[i]
    if bl.x > FIELD_W + 30 or bl.y < -20 or bl.y > FIELD_H + 20 or (bl.maxD and bl.maxD > 0 and bl.dist > bl.maxD) then
      table.remove(g.bullets, i)
    end
  end

  for _, bl in ipairs(g.ebullets) do
    bl.x = bl.x + bl.vx * dt; bl.y = bl.y + bl.vy * dt
    if g.shield > 0 and math.abs(bl.x - S.x) * 2 < 45 + bl.w and math.abs(bl.y - S.y) * 2 < 45 + bl.h then
      bl.x = 1e4
    end
    if not bl.frozen and g.invuln <= 0 and g.lock <= 0 and hit(bl, S) then
      bl.x = 1e4; playerHit(g)
    elseif not bl.frozen and g.invuln <= 0 and g.neng > 0 and hypot(bl.x - S.x, bl.y - S.y) < 16 then
      g.chargeGraze = g.chargeGraze + 1
      if g.shipKey == 'hongmao' and g.t > g.qiudaoCd then
        g.qiudaoCd = g.t + 0.5
        fireSmallSwords(g, 1, 'qiudao')
        g.neng = math.min(g.neng + cfg.ps * 0.15, cfg.ps * 1.5)
        traitFire(g, 'qiudao')
      end
    end
  end
  for i = #g.ebullets, 1, -1 do
    local bl = g.ebullets[i]
    if bl.x < -20 or bl.x > FIELD_W + 20 or bl.y < -20 or bl.y > FIELD_H + 20 then table.remove(g.ebullets, i) end
  end

  for _, it in ipairs(g.items) do
    it.life = it.life - dt
    if it.kind == 'bs' then
      if it.free then
        it.x = it.x + it.vx * dt; it.y = it.y + it.vy * dt
        it.vx = it.vx * 0.99; it.vy = it.vy * 0.99
      end
    else
      local vx, vy = aimed(it.x, it.y, it.tx, it.ty, 28)
      it.x = it.x + vx * dt; it.y = it.y + vy * dt
      if hypot(it.tx - it.x, it.ty - it.y) < 6 then
        it.tx = 20 + math.random() * 350; it.ty = 20 + math.random() * 200
      end
    end
    if math.abs(it.x - S.x) * 2 < 26 + it.w and math.abs(it.y - S.y) * 2 < 20 + it.h then
      it.life = -1
      g.stats.pick = g.stats.pick + 1
      if it.kind == 'pow' then
        if g.lv < 5 then
          g.lv = g.lv + 1; syncWings(g)
          log('pow ' .. g.lv); say(g, '武器升级 LV' .. g.lv .. '!')
        else
          g.score = g.score + 1000; log('score ' .. g.score); say(g, '满级 +1000 分')
        end
      elseif it.kind == 'bom1' then
        g.bomm = math.min(g.bomm + 1, 7); log('bomb ' .. g.bomm)
      elseif it.kind == 'bs' then
        onKill(g, { kind = 'bsx', hp = 1, def = { score = 500 }, x = it.x, y = it.y, w = 14, h = 14, dead = false })
      end
    end
  end
  for i = #g.items, 1, -1 do if g.items[i].life <= 0 then table.remove(g.items, i) end end

  for _, bm in ipairs(g.booms) do bm.t = bm.t - dt end
  for i = #g.booms, 1, -1 do if g.booms[i].t <= 0 then table.remove(g.booms, i) end end

  for _, f in ipairs(g.floaters) do f.t = f.t - dt; f.y = f.y + 26 * dt end
  for i = #g.floaters, 1, -1 do if g.floaters[i].t <= 0 then table.remove(g.floaters, i) end end
  g.dmgAccT = g.dmgAccT - dt
  if g.dmgAccT <= 0 then
    g.dmgAccT = 0.5
    for e, ad in pairs(g.dmgAcc) do
      if ad >= 1 and not e.dead then dmgFloat(g, e, ad, 'skill', false) end
    end
    g.dmgAcc = {}
  end
end

-- ============================ 渲染 ============================
local function render(g)
  for i = 1, poolN do pool[i].used = false end
  poolCursor = 0
  if g.state == 'playing' or g.state == 'clear' then
    local S = g.ship
    for _, it in ipairs(g.items) do draw(it.kind, it.x, it.y) end
    for _, e in ipairs(g.enemies) do
      local col
      if (e.flash or 0) > 0 then col = WHITE
      elseif g.freezeT > 0 then col = C(255, 190, 235, 255) end
      draw(e.kind, e.x, e.y, nil, nil, col)
      if (e.burn or 0) > 0 then draw('dianran', e.x + 11, e.y + 17) end
    end
    if g.boss then
      local artk = g.boss.kind
      if g.boss.kind == 'boss2' and g.boss.phaseIdx > 1 then artk = 'boss2b' end
      if g.boss.kind == 'cw1' then artk = 'cw' end
      if not VIS[artk] then artk = g.boss.kind end
      draw(artk, g.boss.x, g.boss.y, nil, nil, (g.boss.flash or 0) > 0 and WHITE or nil)
    end
    if g.needleSalvo then
      local sv = g.needleSalvo
      for i = 0, sv.n - 1 do
        local row = i % sv.rows
        draw('yinzhen', sv.x - math.floor(i / sv.rows) * 10, sv.y + (row - (sv.rows - 1) / 2) * 11,
          sv.big and 30 or 20, sv.big and 9 or 6)
      end
    end
    if g.invuln <= 0 or math.floor(g.t * 12) % 2 == 0 then
      for _, w in ipairs(g.wings) do draw(N.ships[g.shipKey].wing, w.x, w.y) end
      draw('flame', S.x - 18, S.y, 10 + math.random() * 4, 11 + math.random() * 4)
      draw(g.shipKey, S.x, S.y)
      if g.shipKey == 'lantu' then
        for i = 0, g.needles - 1 do
          local a = i / math.max(1, g.needles) * 6.28 + g.t * 1.6
          draw('yinzhen', S.x + math.cos(a) * 40, S.y + math.sin(a) * 17, 17, 5)
        end
      end
    end
    if g.shield > 0 then draw('shield', S.x, S.y) end
    if g.guanri then draw('guanri', g.guanri.x, g.guanri.y, 164, math.max(12, g.guanri.w * 1.15)) end
    if g.phoenix2 then draw('huofeng', g.phoenix2.x, g.phoenix2.y, 120, 94) end
    for _, bl in ipairs(g.bullets) do
      if bl.x < 1e3 then draw(bl.art, bl.x, bl.y) end
    end
    for _, bl in ipairs(g.ebullets) do
      if bl.x < 1e3 then draw(bl.frozen and 'bingjing' or (bl.art or 'szd'), bl.x, bl.y) end
    end
    for _, bm in ipairs(g.booms) do
      if bm.spark then draw('spark', bm.x, bm.y)
      elseif bm.shard then draw('bingjing', bm.x, bm.y, 20, 20)
      elseif bm.big then draw('die', bm.x, bm.y)
      else draw('boom', bm.x, bm.y) end
    end
    for _, sd in ipairs(g.sparkSeeds) do draw('xinhuo', sd.x, sd.y) end
    if UI.lastScore ~= g.score then UI.scoreText.text = tostring(g.score); UI.lastScore = g.score end
    local wv = math.max(g.wave, 1)
    if UI.lastWave ~= wv then UI.waveText.text = tostring(wv); UI.lastWave = wv end
    if UI.lastLv ~= g.lv then UI.lvText.text = 'LV' .. g.lv; UI.lastLv = g.lv end
    if UI.lastBomm ~= g.bomm then UI.bommText.text = '宝' .. g.bomm; UI.lastBomm = g.bomm end
    UI.hpBar:SetSizeDelta(CW * 0.03 * math.max(g.life, 0), 12 * K)
    local ps = N.ships[g.shipKey].ps
    local mx = math.min(g.neng / (ps * 1.5), 1)
    UI.chgBar.fillAmount = mx
    if g.neng >= ps * 1.5 then UI.chgBar.imageColor = C(255, 255, 90, 74)
    elseif g.neng >= ps * 0.7 then UI.chgBar.imageColor = C(255, 255, 210, 63)
    else UI.chgBar.imageColor = C(255, 79, 168, 255) end
    if g.boss and g.boss.phase == 'fight' then
      UI.bossBar:SetVisible(true); UI.bossBarBg:SetVisible(true)
      local full = g.boss.def.phases and g.boss.def.phases[1] or g.boss.def.hp
      UI.bossBar:SetSizeDelta(CW * 0.7 * math.max(g.boss.hp, 0) / full, 8 * K)
    else
      UI.bossBar:SetVisible(false); UI.bossBarBg:SetVisible(false)
    end
  else
    UI.bossBar:SetVisible(false); UI.bossBarBg:SetVisible(false)
  end
  if g.traitCard then
    UI.traitCardT.text = '特性 · ' .. traitName(g.traitCard.id) .. '\n按 K 继续（触屏点击）· 已获 1.5 秒无敌'
  end
  for i = 1, 4 do
    local m = g.msgs[#g.msgs - i + 1]
    if m then UI.msgs[i].text = m.txt else UI.msgs[i].text = '' end
  end
  -- 伤害数字渲染（前 10 条）
  for i = 1, 10 do
    local slot = UI.dmg[i]
    local f = g.floaters[i]
    if f then
      local px, py = (f.x - FIELD_W / 2) * K, (f.y - FIELD_H / 2) * K
      local s = math.max(9, math.floor(f.sz * K * 0.55))
      if slot.lt ~= f.txt then slot.c.text = f.txt; slot.lt = f.txt end
      if slot.lc ~= f.col then slot.c.fontColor = f.col; slot.lc = f.col end
      if slot.ls ~= s then slot.c.fontSize = s; slot.ls = s end
      if slot.lx ~= px or slot.ly ~= py then slot.c:SetAnchoredPosition(px, py); slot.lx = px; slot.ly = py end
      if not slot.vis then slot.c:SetVisible(true); slot.vis = true end
    elseif slot.vis then
      slot.c:SetVisible(false); slot.vis = false
    end
  end
  for i = 1, poolN do
    local p = pool[i]
    if p.used ~= p.lvis then
      p.c:SetVisible(p.used)
      p.lvis = p.used
    end
  end
end

-- ============================ 屏幕与控件 ============================
local function mkTx(name, txt, size, color, w, h, x, y, align)
  local t = newInst(T_TX, name)
  t.text = txt or ''
  t.fontSize = math.max(9, math.floor(size * K))
  t.fontColor = color or WHITE
  t.horizontalAlignment = align or 'Middle'
  t.verticalAlignment = 'Middle'
  t:SetSizeDelta(w * K, h * K)
  t:SetAnchoredPosition(x * K, y * K)
  return t
end

function nextLevel(g)
  if g.levelIdx >= #LEVELS then
    g.state = 'win'
    log('game_win'); log('restart')
    resetGame(); syncScreens()
    return
  end
  g.life = math.min(g.life + 1, 9); g.bomm = 3; g.invuln = 1.8
  g.chargeFull = false; g.chargeMax = false
  loadLevel(g, g.levelIdx + 1)
  g.state = 'playing'
  syncScreens()
end

function win(g)
  g.invuln = 0
  g.state = 'clear'
  log('level_clear')
  local st = g.stats
  local r = st.hits == 0 and '甲' or (st.hits <= 2 and '乙' or '丙')
  local last = g.levelIdx >= #LEVELS
  UI.winTitle.text = LEVELS[g.levelIdx].name .. ' · 评级 ' .. r
  UI.winStats.text = ('击破 %d · 受击 %d\n用时 %ds · 拾取 %d\n奖励：+1 命 · 宝回满')
    :format(st.kills, st.hits, math.floor(st.time), st.pick)
  UI.nextLabel.text = last and '再来一轮' or '下一关 (K)'
  syncScreens()
end

function ensureGameOverPanel()
  if not UI.gameOverPanel then
    UI.goBg = mkBg('GoBg', C(235, 30, 12, 18), 272, 140, 0, 0)
    UI.gameOverPanel = newInst(T_PANEL, 'GameOverPanel')
    UI.gameOverPanel:SetSizeDelta(CW * 0.6, CH * 0.5)
    UI.gameOverPanel:SetAnchoredPosition(0, 0)
    UI.goTitle:SetVisible(true); UI.goSub:SetVisible(true); UI.restartBtn:SetVisible(true)
  end
end

function clearGameOverPanel()
  if UI.gameOverPanel then
    game.DestroyClientUIControl(UI.gameOverPanel)
    UI.gameOverPanel = nil
    if UI.goBg then game.DestroyClientUIControl(UI.goBg); UI.goBg = nil end
    UI.goTitle:SetVisible(false); UI.goSub:SetVisible(false); UI.restartBtn:SetVisible(false)
  end
end

function syncScreens()
  if not UI.selectPanel or not G then return end
  local st = G.state
  UI.selectPanel:SetActive(st == 'select')
  UI.selectBg:SetActive(st == 'select')
  UI.cardBgHM:SetActive(st == 'select'); UI.cardBgLT:SetActive(st == 'select')
  UI.hongmaoCard:SetVisible(st == 'select')
  UI.lantuCard:SetVisible(st == 'select')
  UI.selTitle:SetVisible(st == 'select'); UI.selHint:SetVisible(st == 'select')
  UI.selHM:SetVisible(st == 'select'); UI.selLT:SetVisible(st == 'select')
  UI.winPanel:SetActive(st == 'clear')
  UI.winBg:SetActive(st == 'clear')
  UI.winTitle:SetVisible(st == 'clear'); UI.winStats:SetVisible(st == 'clear')
  UI.nextBtn:SetVisible(st == 'clear'); UI.nextLabel:SetVisible(st == 'clear')
  UI.goTitle:SetVisible(st == 'fail'); UI.goSub:SetVisible(st == 'fail')
  UI.restartBtn:SetVisible(st == 'fail')
  UI.traitCardT:SetVisible(G.traitCard ~= nil)
  UI.optionCtrl:SetActive(st == 'playing' and G.shipKey == 'lantu')
  local hud = (st == 'playing' or st == 'clear')
  UI.hudBg:SetActive(hud)
  UI.scoreText:SetVisible(hud); UI.waveText:SetVisible(hud)
  UI.lvText:SetVisible(hud); UI.bommText:SetVisible(hud); UI.hpBar:SetVisible(hud)
  UI.chgBar:SetVisible(hud)
  if G.traitCard then
    UI.traitCardT.text = '特性 · ' .. traitName(G.traitCard.id) .. '\n按 K 继续 · 已获 1.5 秒无敌'
  end
end

local function selectClick(g, px)
  g.selIdx = px > FIELD_W / 2 and 1 or 0
  startRun(g)
  syncScreens()
end

function mkBg(name, color, w, h, x, y)
  local b = newInst(T_IMG, name)
  b:SetImage('StaticReference', 100001)
  b.imageColor = color
  b:SetSizeDelta(w * K, h * K)
  b:SetAnchoredPosition(x * K, y * K)
  return b
end

local function initScreens()
  -- 触屏场最先建=最底层（不挡后建按钮）
  UI.fieldArea = newInst(T_CURSOR, 'FieldArea')  UI.fieldArea.raycastTarget = true
  UI.fieldArea:SetSizeDelta(CW, CH); UI.fieldArea:SetAnchoredPosition(0, 0)
  UI.fieldArea:AddCursorEventListener('CursorDown', function(ev)
    if G then
      if G.traitCard then G.traitCard = nil; G.invuln = math.max(G.invuln, 1.5); syncScreens() return end
      if G.state == 'select' then
        local lx = (ev and ev.x or CW / 2) / K
        selectClick(G, lx)
        return
      end
      touch.on = true
      touch.x = clamp((ev and ev.x or 0) / K, 0, FIELD_W)
      touch.y = clamp((ev and ev.y or 125) / K, 0, FIELD_H)
    end
  end)
  UI.fieldArea:AddCursorEventListener('CursorDrag', function(ev)
    if touch.on then
      touch.x = clamp((ev and ev.x or touch.x * K) / K, 0, FIELD_W)
      touch.y = clamp((ev and ev.y or touch.y * K) / K, 0, FIELD_H)
    end
  end)
  UI.fieldArea:AddCursorEventListener('CursorUp', function() touch.on = false end)

  -- 面板背景层（container 无背景色，垫深色 image；image 默认穿透不挡触屏）
  UI.selectBg = mkBg('SelectBg', C(215, 10, 14, 30), 444, 250, 0, 0)
  UI.cardBgHM = mkBg('CardBgHM', C(230, 26, 30, 52), 118, 128, -CW * 0.22 / K, -CH * 0.02 / K)
  UI.cardBgLT = mkBg('CardBgLT', C(230, 22, 32, 48), 118, 128, CW * 0.22 / K, -CH * 0.02 / K)
  UI.hudBg = mkBg('HudBg', C(170, 6, 8, 18), 444, 26, 0, CH * 0.44 / K)
  UI.winBg = mkBg('WinBg', C(235, 22, 28, 50), 318, 175, 0, 0)
  UI.goBg = nil
  UI.bossBarBg = mkBg('BossBarBg', C(255, 44, 0, 0), 318, 10, 0, -CH * 0.46 / K)

  UI.selectPanel = newInst(T_PANEL, 'CharSelectPanel')
  UI.selectPanel:SetSizeDelta(CW * 0.94, CH * 0.84); UI.selectPanel:SetAnchoredPosition(0, 0)
  UI.hongmaoCard = newInst(T_BTN, 'HongmaoCard')
  UI.hongmaoCard.interactable = true; UI.hongmaoCard.raycastTarget = true
  UI.hongmaoCard:SetSizeDelta(CW * 0.24, CH * 0.42)
  UI.hongmaoCard:SetAnchoredPosition(-CW * 0.22, -CH * 0.02)
  UI.hongmaoCard:AddCursorEventListener('CursorClick', function()
    if G and G.state == 'select' then selectClick(G, FIELD_W * 0.25) end
  end)
  UI.lantuCard = newInst(T_BTN, 'LantuCard')
  UI.lantuCard.interactable = true; UI.lantuCard.raycastTarget = true
  UI.lantuCard:SetSizeDelta(CW * 0.24, CH * 0.42)
  UI.lantuCard:SetAnchoredPosition(CW * 0.22, -CH * 0.02)
  UI.lantuCard:AddCursorEventListener('CursorClick', function()
    if G and G.state == 'select' then selectClick(G, FIELD_W * 0.75) end
  end)

  UI.selTitle = mkTx('SelTitle', '选择侠士', 20, C(255, 255, 210, 63), 200, 34, 0, CH * 0.36)
  UI.selHint = mkTx('SelHint', 'A/D 或 ←/→ 切换 · J 或点击确认', 11, C(255, 150, 170, 190), 300, 22, 0, CH * 0.42)
  UI.selHM = mkTx('SelHM', '虹猫\n长虹剑·重击·蓄力贯日\nK=火凤燎原', 11, C(255, 255, 210, 140), 100, 60, -CW * 0.22, -CH * 0.26)
  UI.selLT = mkTx('SelLT', '蓝兔\n快射·攒银针·冰魄剑\nK=冰封千里', 11, C(255, 150, 210, 255), 100, 60, CW * 0.22, -CH * 0.26)

  UI.scoreText = mkTx('ScoreText', '0', 13, WHITE, 120, 24, -CW * 0.35, CH * 0.44, 'Left')
  UI.waveText = mkTx('WaveText', '1', 13, WHITE, 40, 24, -CW * 0.05, CH * 0.44, 'Left')
  UI.lvText = mkTx('LvText', 'LV1', 13, WHITE, 50, 24, CW * 0.05, CH * 0.44)
  UI.bommText = mkTx('BommText', '宝3', 13, C(255, 255, 200, 120), 50, 24, CW * 0.16, CH * 0.44)
  UI.hpBar = newInst(T_IMG, 'HpBar')
  UI.hpBar:SetImage('StaticReference', 100001)
  UI.hpBar.imageColor = C(255, 120, 255, 140)
  UI.hpBar:SetSizeDelta(CW * 0.12, 12 * K); UI.hpBar:SetAnchoredPosition(CW * 0.38, CH * 0.44)
  UI.chgBar = newInst(T_IMG, 'ChargeBar')
  UI.chgBar:SetImage('StaticReference', 100001)
  UI.chgBar.imageColor = C(255, 79, 168, 255); UI.chgBar.fillAmount = 0
  UI.chgBar:SetSizeDelta(CW * 0.1, 10 * K); UI.chgBar:SetAnchoredPosition(-CW * 0.18, CH * 0.44)
  UI.bossBar = newInst(T_IMG, 'BossBar')
  UI.bossBar:SetImage('StaticReference', 100001)
  UI.bossBar.imageColor = C(255, 255, 80, 80)
  UI.bossBar:SetSizeDelta(CW * 0.7, 8 * K); UI.bossBar:SetAnchoredPosition(0, -CH * 0.46)
  UI.msgs = {}
  for i = 1, 4 do
    UI.msgs[i] = mkTx('Msg' .. i, '', 14, C(255, 255, 224, 138), 340, 26, 0, CH * 0.3 - i * 28)
  end

  UI.optionCtrl = newInst(T_CURSOR, 'OptionControl')
  UI.optionCtrl.raycastTarget = false
  UI.optionCtrl:SetSizeDelta(60 * K, 60 * K)
  UI.optionCtrl:SetActive(false)

  UI.winPanel = newInst(T_PANEL, 'WinPanel')
  UI.winPanel:SetSizeDelta(CW * 0.7, CH * 0.66); UI.winPanel:SetAnchoredPosition(0, 0)
  UI.winTitle = mkTx('WinTitle', '通 关', 24, C(255, 255, 210, 63), 340, 44, 0, CH * 0.2)
  UI.winStats = mkTx('WinStats', '', 15, WHITE, 280, 160, 0, -CH * 0.02)
  UI.nextLabel = mkTx('NextLabel', '下一关 (K)', 15, WHITE, 160, 30, 0, -CH * 0.22)
  UI.nextBtn = newInst(T_BTN, 'NextBtn')
  UI.nextBtn.interactable = true; UI.nextBtn.raycastTarget = true
  UI.nextBtn:SetSizeDelta(CW * 0.2, CH * 0.12); UI.nextBtn:SetAnchoredPosition(0, -CH * 0.22)
  UI.nextBtn:AddCursorEventListener('CursorClick', function()
    if G and G.state == 'clear' then nextLevel(G) end
  end)
  UI.nextBtn:SetAsLastSibling()

  -- GameOverPanel 动态创建/销毁（tree exists=false 断言要求真离树）
  UI.goTitle = mkTx('GoTitle', '任务失败', 24, C(255, 240, 90, 90), 240, 44, 0, CH * 0.12)
  UI.goSub = mkTx('GoSub', '从关 1 重来（街机 run）', 13, C(255, 150, 170, 190), 280, 26, 0, 0)
  UI.restartBtn = newInst(T_BTN, 'RestartBtn')
  UI.restartBtn.interactable = true; UI.restartBtn.raycastTarget = true
  UI.restartBtn:SetSizeDelta(CW * 0.2, CH * 0.12); UI.restartBtn:SetAnchoredPosition(0, -CH * 0.16)
  UI.restartBtn:AddCursorEventListener('CursorClick', function()
    if G then log('restart'); resetGame(); syncScreens() end
  end)

  UI.traitCardT = mkTx('TraitCardText', '', 20, C(255, 255, 210, 102), CW * 0.9, CH * 0.5, 0, 0)

  -- 伤害数字池（D203：暴击红/字大随伤害/分色）
  UI.dmg = {}
  for i = 1, 10 do
    local d = newInst(T_TX, 'DmgFloat' .. i)
    d.text = ''
    d.fontSize = 12
    d.fontColor = WHITE
    d.horizontalAlignment = 'Middle'
    d.verticalAlignment = 'Middle'
    d:SetSizeDelta(120 * K, 46 * K)
    d:SetVisible(false)
    UI.dmg[i] = { c = d, lt = '', lc = -1, ls = -1, lx = -9e3, ly = -9e3 }
  end
  syncScreens()
end

-- ============================ Debug 信号 ============================
local function regSignal(name, fn)
  script:RegisterServerSignalHandler(name, function(_, params) fn(params or {}) end)
end

local function initDebug()
  regSignal('DebugAutoPlay', function(p) G.autoPlay = (p[1] == 1) end)
  regSignal('DebugSkipToBoss', function()
    if G.state ~= 'playing' then return end
    G.enemies = {}; G.ebullets = {}; G.items = {}
    G.wave = #G.waves - 1
    spawnWave(G)
  end)
  regSignal('DebugKillBoss', function()
    if G.state ~= 'playing' then return end
    if G.boss and not G.boss.dead then
      damage(G, G.boss, 99999)
      return
    end
    for _, e in ipairs(G.enemies) do
      if e.isMid and not e.dead then damage(G, e, 99999) end
    end
  end)
  regSignal('DebugDamage', function()
    if G.state == 'playing' then playerHit(G) end
  end)
  regSignal('DebugSetLife', function(p) if G.state == 'playing' then G.life = p[1] or G.life end end)
  regSignal('DebugGrantPow', function(p)
    if G.state == 'playing' then setLv(G, p[1] or 1); log('pow ' .. G.lv) end
  end)
  regSignal('DebugGrantBomb', function(p)
    if G.state == 'playing' then G.bomm = p[1] or G.bomm; log('bomb ' .. G.bomm) end
  end)
  regSignal('DebugInvuln', function(p) if G.state == 'playing' then G.invuln = p[1] or 0 end end)
  regSignal('DebugGotoLevel', function(p)
    if G.state == 'playing' then
      loadLevel(G, clamp(p[1] or 1, 1, #LEVELS))
    end
  end)
  regSignal('DebugNoop', function() end)
end

-- ============================ 输入 ============================
local function onKey(typeName)
  local down = typeName:sub(-4) == 'Down'
  local base = down and typeName:sub(1, -5) or typeName:sub(1, -3)
  local k
  if base == 'KeyboardMoveLeftKey' then k = 'a'
  elseif base == 'KeyboardMoveRightKey' then k = 'd'
  elseif base == 'KeyboardMoveForwardKey' then k = 'w'
  elseif base == 'KeyboardMoveBackwardKey' then k = 's'
  elseif base == 'KeyboardCraftspersonKey19' then k = 'j'
  elseif base == 'KeyboardCraftspersonKey20' then k = 'k'
  elseif base == 'KeyboardCraftspersonKey11' then k = 'enter'
  elseif base == 'KeyboardCraftspersonKey36' then k = 'arrowup'
  elseif base == 'KeyboardCraftspersonKey37' then k = 'arrowdown'
  elseif base == 'KeyboardCraftspersonKey38' then k = 'arrowleft'
  elseif base == 'KeyboardCraftspersonKey39' then k = 'arrowright'
  elseif base == 'KeyboardCharacterSkill3Key' then k = 'r'
  elseif base == 'KeyboardJumpKey' then k = 'space'
  end
  if not k then return end
  if down then
    if not keys[k] then
      if k == 'j' then jEdge = true end
      if k == 'k' then kEdge = true end
      if k == 'r' then rEdge = true end
    end
    keys[k] = true
  else
    keys[k] = false
  end
end

-- ============================ 生命周期 ============================
HMLT = { wave = 0, bullets = 0 }

function OnStart()
  root = script.object
  if not root then error('hmlt-qixia: 入口脚本必须挂在控件上', 2) end
  root.showCursor = true
  script:EnableUpdate(true)
  initRender()
  resetGame()
  initScreens()
  initDebug()
  local keyList = {
    'KeyboardMoveForwardKey', 'KeyboardMoveBackwardKey', 'KeyboardMoveLeftKey', 'KeyboardMoveRightKey',
    'KeyboardCraftspersonKey11', 'KeyboardCraftspersonKey19', 'KeyboardCraftspersonKey20',
    'KeyboardCraftspersonKey36', 'KeyboardCraftspersonKey37', 'KeyboardCraftspersonKey38', 'KeyboardCraftspersonKey39',
    'KeyboardCharacterSkill3Key', 'KeyboardJumpKey',
  }
  for _, base in ipairs(keyList) do
    for _, suf in ipairs({ 'Down', 'Up' }) do
      root:AddKeyEventListener(base .. suf, function() onKey(base .. suf) end)
    end
  end
  log('game_start')
end

function OnUpdate(dt)
  local ok, err = pcall(function()
    dt = math.min(dt, 0.1)
    if dt <= 0 then return end
    if rEdge and G and G.state ~= 'select' then
      log('restart'); resetGame(); syncScreens()
    end
    update(G, dt)
    render(G)
    HMLT.wave = G.wave
    HMLT.bullets = #G.bullets + #G.ebullets
  end)
  if not ok then print('ERR ' .. tostring(err)) end
  jEdge = false; kEdge = false; rEdge = false
end
