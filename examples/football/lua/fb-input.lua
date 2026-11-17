--[[==========================================================================
fb-input.lua v3 —— 真实足球 v3 · 客户端 Lua（HUD 面板 + 按键 → 服务器信号 + 力输入套件）
职责四件：
  ①HUD 排版：11 个 client-textbox 的字号/颜色/对齐/文案全部在运行时设
    （.gil 只管控件存在与初始位置尺寸；client-textbox 的文案/字号 CLI 改不了）
  ②本地计时：hud_timer 从 OnStart 起累计，按秒刷新
  ③按键 → 服务器信号 fb_input(key:int, state:int)，同时点亮横幅与状态行
  ④力输入套件（2026-11-17，design/FORCE-KIT-DESIGN.md）：fk_* 面板渲染 +
    23 个 cursor 热区（含 6 个叠在 hud_k1..k6 上的踢球热区=按键按钮化）→ fb_input；
    FK 本地镜像与服务端 zz-force-kit.ts 双端同 clamp（aimPanel 漂移教训）
【数据边界】比分写 hud_score，来源两路（都在 pcall 里，缺就不生效）：
  a) 全局自定义变量 fb_score_a / fb_score_b（Enum.CustomVariableEntityType.PlayerSelf）
     —— 服务端图「设置自定义变量」写玩家变量后，变化回调即刷新（待真机验证）
  b) 外部调用 setScore(a, b)（等通道接上后由事件驱动）
【真机事实】AddKeyEventListener 收 Enum.KeyEventType 枚举；Lua 无 try/catch，
  一句抛错整段中断 ⇒ 全部 pcall + 带名日志；写文本 = 字段赋值 c.text（无 SetText）；
  字号/颜色/对齐同为字段赋值（真机形态见 workspace/hmlt-qixia 霜华纪，已跑通）。
【文字判据】框高 ≥ 字号×1.45+4 —— 本文件只调字号不改尺寸，尺寸表见 design/HUD-v1.md。
==========================================================================]]

local SIGNAL = 'fb_input'

-- ARGB 整数色（真机形态：a*16777216 + r*65536 + g*256 + b）
local function C(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end
local COL = {
  gold  = C(255, 232, 200, 138),  -- 标题描金
  white = C(255, 255, 253, 248),  -- 比分主字
  gray  = C(255, 185, 195, 212),  -- 计时/状态弱字
  skill = C(255, 226, 233, 244),  -- 技能条常规
  hot   = C(255, 127, 207, 106),  -- 横幅/触发强调（草绿）
  warm  = C(255, 255, 200, 120)   -- 进球提示
}

-- id=发给服务端的 keyId；names=候选枚举名（按序试）；line=HUD 文案
-- 每个动作绑两种物理键：**动作键（左键/E/空格/右键/F/X）+ 数字键 1~6**
-- 2026-10-29 真机实证：只绑动作键时「按 1~6 完全没反应」（用户按的是数字键）；两种都绑最稳
-- 2026-10-31 用户口径：**只认数字键 1-6**。
-- 之前每题还挂了游戏具名键作别名（左键/E/空格/右键/F/X），其中 E 与角色技能同键 ⇒
-- 把用户在编辑器里配的角色技能触发抢掉了（真机实测：按 E 只踢球、技能不施放）。别名全部移除。
local KEYS = {
  { id = 1, names = { 'KeyboardCraftspersonKey1Down' }, line = '① 推射 / 抢断  · 1' },
  { id = 2, names = { 'KeyboardCraftspersonKey2Down' }, line = '② 抽射 / 解围  · 2' },
  { id = 3, names = { 'KeyboardCraftspersonKey3Down' }, line = '③ 吊射 / 停球  · 3' },
  { id = 4, names = { 'KeyboardCraftspersonKey4Down' }, line = '④ 短传（地滚）· 4' },
  { id = 5, names = { 'KeyboardCraftspersonKey5Down' }, line = '⑤ 弧线球  · 5' },
  { id = 6, names = { 'KeyboardCraftspersonKey6Down' }, line = '⑥ 球放回正前  · 6' },
  -- 力输入套件（v3，design/FORCE-KIT-DESIGN.md；服务端 _GSTS_forceKit）
  { id = 7, names = { 'KeyboardCraftspersonKey7Down' }, line = '⑦ 施力（力套件）· 7' },
  { id = 8, names = { 'KeyboardCraftspersonKey8Down' }, line = '⑧ 清力（急停）· 8' },
  { id = 9, names = { 'KeyboardCraftspersonKey9Down' }, line = '⑨ 套件复位 · 9' },
  -- —— 调参面板（2026-10-31 用户口径）：点一次永久累加，之后每脚踢球都按「朝向×力度 + 右偏/上偏」 ——
  { id = 23, names = { 'KeyboardCraftspersonKey23Down' }, line = '⚙ 力度 +5%   · F5',  panel = 'pow', m = 1.05 },
  { id = 24, names = { 'KeyboardCraftspersonKey24Down' }, line = '⚙ 力度 −5%   · F6',  panel = 'pow', m = 1 / 1.05 },
  { id = 25, names = { 'KeyboardCraftspersonKey25Down' }, line = '⚙ 角度 +5°   · F7',  panel = 'ang', d = 5 },
  { id = 26, names = { 'KeyboardCraftspersonKey26Down' }, line = '⚙ 角度 −5°   · F8',  panel = 'ang', d = -5 },
  { id = 27, names = { 'KeyboardCraftspersonKey27Down' }, line = '⚙ 上偏 +1    · F9',  panel = 'up',  d = 1.0 },
  { id = 28, names = { 'KeyboardCraftspersonKey28Down' }, line = '⚙ 上偏 −1    · F10', panel = 'up',  d = -1.0 },
  { id = 10, names = { 'KeyboardCraftspersonKey10Down' }, line = '⚙ 复位 1.0/0/0 · 0',  panel = 'reset' }
}

-- 控件名 → 字号/颜色（文案在 setStatic / 事件里写）
local STYLE = {
  title = { name = 'hud_title', fs = 24, color = COL.gold },
  score = { name = 'hud_score', fs = 46, color = COL.white },
  timer = { name = 'hud_timer', fs = 22, color = COL.gray },
  toast = { name = 'hud_toast', fs = 40, color = COL.hot },
  state = { name = 'hud_state', fs = 24, color = COL.gray },
  k1 = { name = 'hud_k1', fs = 20, color = COL.skill },
  k2 = { name = 'hud_k2', fs = 20, color = COL.skill },
  k3 = { name = 'hud_k3', fs = 20, color = COL.skill },
  k4 = { name = 'hud_k4', fs = 20, color = COL.skill },
  k5 = { name = 'hud_k5', fs = 20, color = COL.skill },
  k6 = { name = 'hud_k6', fs = 20, color = COL.skill }
}

local SLOTS = { 'k1', 'k2', 'k3', 'k4', 'k5', 'k6' }

local ref = {}          -- 控件名 → 控件对象
local missing = {}      -- 取不到的控件名（只报一次）
local G = {
  t = 0,                -- 本局累计秒（OnUpdate 累加）
  sec = -1,             -- 上次刷新的整秒
  toastT = 0,           -- 横幅剩余秒
  scoreA = 0,
  scoreB = 0,
  lastLine = '',
  globals = 0
}

local function log(msg) print('[fb-in] ' .. tostring(msg)) end

local function send(keyId, state)
  local ok, err = pcall(function()
    local sig = game.ServerSignal(SIGNAL)
    if sig == nil then error('game.ServerSignal(' .. SIGNAL .. ') returned nil') end
    sig:AddInt(keyId)
    sig:AddInt(state)
    sig:SendSignal()
  end)
  if not ok then log('pcall fail err send ' .. tostring(err)) end
  return ok
end

-- 宿主 = 容器节点；子控件直接挂在它下面（真机跑通形态）
local function host()
  local ok, obj = pcall(function() return script.object end)
  if not ok or obj == nil then return nil end
  return obj
end

local function getCtl(name)
  if ref[name] ~= nil then return ref[name] end
  local h = host()
  if h == nil then
    if not missing[name] then log('err host nil ' .. name); missing[name] = true end
    return nil
  end
  local ok, child = pcall(function() return h:GetChild(name) end)
  if ok and child ~= nil then ref[name] = child; return child end
  if not missing[name] then log('hud-miss ' .. name); missing[name] = true end
  return nil
end

local function setText(name, value)
  local c = getCtl(name)
  if c == nil then return end
  local ok, err = pcall(function() c.text = value end)
  if not ok then log('pcall fail text ' .. name .. ' ' .. tostring(err)) end
end

local function setColor(name, color)
  local c = getCtl(name)
  if c == nil then return end
  local ok, err = pcall(function() c.fontColor = color end)
  if not ok then log('pcall fail color ' .. name .. ' ' .. tostring(err)) end
end

local function setStyle(name, fs, color)
  local c = getCtl(name)
  if c == nil then return end
  -- 每条属性单独 pcall：一条失败不挡其余（真机属性名/类型按版本有差异）
  if fs ~= nil then
    local ok, err = pcall(function() c.fontSize = fs end)
    if not ok then log('pcall fail fontSize ' .. name .. ' ' .. tostring(err)) end
  end
  if color ~= nil then
    local ok, err = pcall(function() c.fontColor = color end)
    if not ok then log('pcall fail fontColor ' .. name .. ' ' .. tostring(err)) end
  end
  -- 对齐：真机**只收枚举**（2026-10-29 真机日志实证，字段 f23：
  --   `bad argument #2 to 'horizontalAlignment' (TextHorizontalAlignment expected, got string)`）；
  -- 模拟器（fengari）收字符串 ⇒ 先取枚举，取不到再回落字符串，两边都能跑。
  local hAlign = nil
  local vAlign = nil
  pcall(function() hAlign = Enum.TextHorizontalAlignment.Middle end)
  pcall(function() vAlign = Enum.TextVerticalAlignment.Middle end)
  local okh, errh = pcall(function() c.horizontalAlignment = hAlign or 'Middle' end)
  if not okh then log('pcall fail alignH ' .. name .. ' ' .. tostring(errh)) end
  local okv, errv = pcall(function() c.verticalAlignment = vAlign or 'Middle' end)
  if not okv then log('pcall fail alignV ' .. name .. ' ' .. tostring(errv)) end
end

local function two(n)
  if n < 10 then return '0' .. tostring(n) end
  return tostring(n)
end

local function fmtClock(sec)
  local s = math.floor(sec)
  return two(math.floor(s / 60)) .. ':' .. two(s % 60)
end

local function renderScore()
  setText(STYLE.score.name, tostring(G.scoreA) .. ' : ' .. tostring(G.scoreB))
end

local function renderTimer()
  setText(STYLE.timer.name, fmtClock(G.t))
end

-- 横幅：显示 text 共 dur 秒；空串 = 隐藏（不依赖 SetVisible，真机该 API 不可靠）
local function showToast(text, dur, color)
  setText(STYLE.toast.name, text or '')
  G.toastT = dur or 1.2
  if color ~= nil then setColor(STYLE.toast.name, color) end
end

-- 对外：setScore(a, b) 由进球事件调用；也可被后续通道直接调
function setScore(a, b)
  G.scoreA = math.floor(tonumber(a) or 0)
  G.scoreB = math.floor(tonumber(b) or 0)
  renderScore()
  showToast('进球！' .. tostring(G.scoreA) .. ' : ' .. tostring(G.scoreB), 2.5, COL.warm)
end

local function setState(line)
  if line == G.lastLine then return end
  G.lastLine = line
  setText(STYLE.state.name, line)
end

-- 比分通道（未接线，标死）：服务端进球事件还没接到 HUD。
-- 现只保留 setScore(a,b) 作为对外接口，等通道接上再调用；轮询全局变量的旧实现已删除（无消费者）。
-- setStatic/applyStyles 定义已移到 FK 块之后（FKSTYLE/FKZONES 必须先于其词法位置，pairs(nil) 教训）

-- —— 面板本地镜像（服务端 _GSTS_aimPanel 同步做同一组运算，clamp 边界逐字对齐 ⇒ 不漂）——
-- S6（2026-11-02）：力度=百分比步进（×1.05 / ÷1.05，clamp [0.2,2.2]），右偏 m/s 改角度 ±5°（±75）。
-- ⚠️ clamp 必须与 zz-aim-panel.ts 的 POW_MIN/POW_MAX/ANG_MAX/OFF_LIM 完全一致，漂移教训见上。
local PANEL = { pow = 1.0, ang = 0, up = 0 }
local function panelText()
  return string.format('⚙ 力度 %d%% · 角 %+d° · 上 %+d', math.floor(PANEL.pow * 100 + 0.5), PANEL.ang, PANEL.up)
end
local function panelApply(entry)
  if entry.panel == 'reset' then
    PANEL.pow, PANEL.ang, PANEL.up = 1.0, 0, 0
  elseif entry.panel == 'pow' then
    PANEL.pow = PANEL.pow * entry.m
    if PANEL.pow < 0.2 then PANEL.pow = 0.2 end
    if PANEL.pow > 2.2 then PANEL.pow = 2.2 end
  elseif entry.panel == 'ang' then
    PANEL.ang = PANEL.ang + entry.d
    if PANEL.ang > 75 then PANEL.ang = 75 end
    if PANEL.ang < -75 then PANEL.ang = -75 end
  elseif entry.panel == 'up' then
    PANEL.up = PANEL.up + entry.d
    if PANEL.up > 8 then PANEL.up = 8 end
    if PANEL.up < -8 then PANEL.up = -8 end
  end
  setText(STYLE.k6.name, panelText())
end

-- —— 力输入套件（v3，design/FORCE-KIT-DESIGN.md §3/§5）——
-- .gil 控件名对照：文本框 fk_* / 热区 fk_az_*（± 步进/预设/动作）+ fk_kick1..6（叠 hud_k1..k6）
-- ⚠️ FK 镜像 clamp 必须与 zz-force-kit.ts 的 XYZ_LIM(±100)/S_MIN(0.1)/S_MAX(10) 逐字一致
local FKSTYLE = {
  title  = { name = 'fk_title',  fs = 22, color = COL.gold },
  status = { name = 'fk_status', fs = 18, color = COL.gray },
  vx = { name = 'fk_vx', fs = 20, color = COL.skill },
  vy = { name = 'fk_vy', fs = 20, color = COL.skill },
  vz = { name = 'fk_vz', fs = 20, color = COL.skill },
  vs = { name = 'fk_vs', fs = 20, color = COL.skill },
  xm = { name = 'fk_xm', fs = 20, color = COL.skill }, xp = { name = 'fk_xp', fs = 20, color = COL.skill },
  ym = { name = 'fk_ym', fs = 20, color = COL.skill }, yp = { name = 'fk_yp', fs = 20, color = COL.skill },
  zm = { name = 'fk_zm', fs = 20, color = COL.skill }, zp = { name = 'fk_zp', fs = 20, color = COL.skill },
  sm = { name = 'fk_sm', fs = 20, color = COL.skill }, sp = { name = 'fk_sp', fs = 20, color = COL.skill },
  p1 = { name = 'fk_p1', fs = 20, color = COL.skill }, p2 = { name = 'fk_p2', fs = 20, color = COL.skill },
  p3 = { name = 'fk_p3', fs = 20, color = COL.skill }, p4 = { name = 'fk_p4', fs = 20, color = COL.skill },
  p5 = { name = 'fk_p5', fs = 20, color = COL.skill },
  apply = { name = 'fk_apply', fs = 20, color = COL.gold },
  clear = { name = 'fk_clear', fs = 20, color = COL.skill },
  reset = { name = 'fk_reset', fs = 20, color = COL.skill },
  step  = { name = 'fk_step',  fs = 18, color = COL.skill }
}

-- FK 本地镜像（服务端 zz-force-kit.ts 持有真值，这里只做显示与即时反馈）
local FK = { x = 1.0, y = 0.0, z = 0.0, s = 1.0, step = 1 }  -- step: 0=×0.1 1=×1 2=×10
local FK_STEPS = { 0.1, 1, 10 }
local FK_PRESETS = {
  { 1.0, 0.0, 0.0, 1.0, '推射' },
  { 1.0, 0.5, 0.0, 1.6, '抽射' },
  { 0.5, 1.2, 0.0, 1.0, '吊射' },
  { 1.0, 0.1, 0.0, 1.2, '短传' },
  { 1.0, 0.25, 0.7, 1.4, '弧线' }
}
local FK_AXIS = { x = 'x 前后', y = 'y 上下', z = 'z 左右', s = 's 缩放' }

local function fkClamp(v, lo, hi)
  if v < lo then return lo elseif v > hi then return hi end
  return v
end

local function fkRender()
  setText(FKSTYLE.vx.name, string.format('%s %+.1f', FK_AXIS.x, FK.x))
  setText(FKSTYLE.vy.name, string.format('%s %+.1f', FK_AXIS.y, FK.y))
  setText(FKSTYLE.vz.name, string.format('%s %+.1f', FK_AXIS.z, FK.z))
  setText(FKSTYLE.vs.name, string.format('%s %.1f', FK_AXIS.s, FK.s))
  setText(FKSTYLE.step.name, '步进×' .. tostring(FK_STEPS[FK.step + 1]))
end

local function fkStatus(msg)
  setText(FKSTYLE.status.name, msg)
end

-- 按键语义（与 zz-force-kit.ts multipleBranches 同表）：先更新本地镜像再发信号
local function fkFire(key)
  if key >= 31 and key <= 38 then
    local axis = (key <= 32) and 'x' or ((key <= 34) and 'y' or ((key <= 36) and 'z' or 's'))
    local sign = (key % 2 == 0) and 1 or -1  -- 偶数键=+，奇数键=−
    local lo, hi = -100, 100
    if axis == 's' then lo, hi = 0.1, 10 end
    FK[axis] = fkClamp(FK[axis] + FK_STEPS[FK.step + 1] * sign, lo, hi)
    fkStatus(string.format('%s %+0.1f（步进×%s）', FK_AXIS[axis], FK[axis], tostring(FK_STEPS[FK.step + 1])))
  elseif key == 39 then
    FK.step = (FK.step + 1) % 3
    fkStatus('步进 → ×' .. tostring(FK_STEPS[FK.step + 1]))
  elseif key >= 41 and key <= 45 then
    local p = FK_PRESETS[key - 40]
    FK.x, FK.y, FK.z, FK.s = p[1], p[2], p[3], p[4]
    fkStatus(string.format('预设 %s (%.2f, %.2f, %.2f, s=%.1f)', p[5], p[1], p[2], p[3], p[4]))
  elseif key == 9 then
    FK.x, FK.y, FK.z, FK.s, FK.step = 1.0, 0.0, 0.0, 1.0, 1
    fkStatus('套件复位 (1, 0, 0, s=1)')
  end
  fkRender()
  send(key, 1)
end

-- 热区接线：动作挂 CursorClick（Down 会连发，tetris 结算键教训）；
-- 枚举先行 string 兜底（AddKeyEventListener 同款真机纪律 D561）
local function armZone(zoneName, fn)
  local c = getCtl(zoneName)
  if c == nil then return false end
  local ok, err = pcall(function()
    pcall(function() c.raycastTarget = true end)
    local ev = nil
    pcall(function() ev = Enum.CursorEventType.CursorClick end)
    if ev ~= nil then
      c:AddCursorEventListener(ev, function() fn() end)
    else
      c:AddCursorEventListener('CursorClick', function() fn() end)
    end
  end)
  if ok then
    log('zone ' .. zoneName .. ' armed')
  else
    log('zone fail ' .. zoneName .. ' ' .. tostring(err))
  end
  return ok
end

-- 热区表：t=视觉文本框名（setStatic 用），z=热区名，k=fb_input 键
local FKZONES = {
  { t = 'fk_xm', z = 'fk_az_xm', k = 31 }, { t = 'fk_xp', z = 'fk_az_xp', k = 32 },
  { t = 'fk_ym', z = 'fk_az_ym', k = 33 }, { t = 'fk_yp', z = 'fk_az_yp', k = 34 },
  { t = 'fk_zm', z = 'fk_az_zm', k = 35 }, { t = 'fk_zp', z = 'fk_az_zp', k = 36 },
  { t = 'fk_sm', z = 'fk_az_sm', k = 37 }, { t = 'fk_sp', z = 'fk_az_sp', k = 38 },
  { t = 'fk_p1', z = 'fk_az_p1', k = 41 }, { t = 'fk_p2', z = 'fk_az_p2', k = 42 },
  { t = 'fk_p3', z = 'fk_az_p3', k = 43 }, { t = 'fk_p4', z = 'fk_az_p4', k = 44 },
  { t = 'fk_p5', z = 'fk_az_p5', k = 45 },
  { t = 'fk_apply', z = 'fk_az_apply', k = 7 },
  { t = 'fk_clear', z = 'fk_az_clear', k = 8 },
  { t = 'fk_reset', z = 'fk_az_reset', k = 9 },
  { t = 'fk_step', z = 'fk_az_step', k = 39 }
}

local function setStatic()
  setText(STYLE.title.name, '⚽ 千星足球 · 技能演练')
  for i, slot in ipairs(SLOTS) do
    setText(STYLE[slot].name, KEYS[i].line)
  end
  -- 力套件静态文案（数值行/步进由 fkRender 刷）
  local FKBTN_TEXT = {
    fk_xm = '−', fk_xp = '+', fk_ym = '−', fk_yp = '+',
    fk_zm = '−', fk_zp = '+', fk_sm = '−', fk_sp = '+',
    fk_p1 = '推射', fk_p2 = '抽射', fk_p3 = '吊射', fk_p4 = '短传', fk_p5 = '弧线',
    fk_apply = '施力 7', fk_clear = '清力 8', fk_reset = '复位 9'
  }
  setText(FKSTYLE.title.name, '力输入试验台 · 7=施力')
  for _, b in ipairs(FKZONES) do
    setText(b.t, FKBTN_TEXT[b.t] or '')
  end
  renderScore()
  renderTimer()
  setText(STYLE.toast.name, '')
  setState('技能演练 · 按 ①~⑥ 触发 · 左侧力试验台')
end

local function applyStyles()
  for _, s in pairs(STYLE) do setStyle(s.name, s.fs, s.color) end
  for _, s in pairs(FKSTYLE) do setStyle(s.name, s.fs, s.color) end
end

-- 统一开火：键盘 handler 与踢球热区共用（同一条日志/横幅/状态行路径）
local function fireEntry(entry)
  log('key ' .. tostring(entry.id))
  if entry.panel ~= nil then
    panelApply(entry)
    showToast(entry.line, 0.8, COL.gold)
  else
    setState(entry.line .. ' · 已触发')
    showToast(entry.line, 1.2, COL.hot)
  end
  send(entry.id, 1)
end

local function fireKey(i)
  local entry = KEYS[i]
  if entry ~= nil then fireEntry(entry) end
end

local function armForceKit()
  local armed = 0
  for _, b in ipairs(FKZONES) do
    if armZone(b.z, function()
      if b.k == 7 then
        fkStatus(string.format('施力 (%+.1f, %+.1f, %+.1f, s=%.1f) → 沿连线', FK.x, FK.y, FK.z, FK.s))
      end
      fkFire(b.k)
    end) then armed = armed + 1 end
  end
  -- 踢球热区：叠在 hud_k1..k6 上（按键 1-6 按钮化，移动端可用）
  for i = 1, 6 do
    local idx = i
    if armZone(string.format('fk_kick%d', idx), function() fireKey(idx) end) then armed = armed + 1 end
  end
  return armed
end

local function makeHandler(entry)
  return function()
    fireEntry(entry)
    return true
  end
end

local function listen(entry)
  local handler = makeHandler(entry)
  local h = host()
  if h == nil then
    log('err host ' .. tostring(h) .. ' (key ' .. tostring(entry.id) .. ')')
    return false
  end
  local bound = 0
  for _, enumName in ipairs(entry.names) do
    local ok, err = pcall(function()
      local ev = Enum.KeyEventType[enumName]
      if ev == nil then error('Enum.KeyEventType.' .. enumName .. ' is nil') end
      h:AddKeyEventListener(ev, handler)
    end)
    if ok then
      bound = bound + 1
      log('listen ' .. enumName .. ' via enum')
    else
      local ok2 = pcall(function() h:AddKeyEventListener(enumName, handler) end)
      if ok2 then
        bound = bound + 1
        log('listen ' .. enumName .. ' via string')
      else
        log('miss ' .. enumName .. ' enum=' .. tostring(err))
      end
    end
  end
  if bound == 0 then log('err listen key ' .. tostring(entry.id) .. ' (all names failed)') end
  return bound > 0
end

function OnInit()
end

-- HUD 控件命中数（0..34 = STYLE 11 + FKSTYLE 23）：心跳自检用
local function countHud()
  local n = 0
  for _, s in pairs(STYLE) do if getCtl(s.name) ~= nil then n = n + 1 end end
  for _, s in pairs(FKSTYLE) do if getCtl(s.name) ~= nil then n = n + 1 end end
  return n
end

function OnStart()
  log('onstart v3')
  applyStyles()
  setStatic()
  fkRender()
  fkStatus('x/y/z 连线系 · z 侧向 · s 倍率')
  send(0, 100 + countHud())       -- 心跳 1：100+HUD 命中数（34 = 全部找到）
  local n = 0
  for _, k in ipairs(KEYS) do if listen(k) then n = n + 1 end end
  send(0, n)                      -- 心跳 2：成功注册的键数
  local z = armForceKit()
  send(0, 200 + z)                -- 心跳 3：200+热区接线数（23 = 全部就位）
  log('listen ok ' .. tostring(n) .. '/' .. tostring(#KEYS) .. ' zones ' .. tostring(z) .. '/23')
end

function OnUpdate(dt)
  local step = tonumber(dt) or 0
  G.t = G.t + step
  -- 时间同步已删除（2026-10-31 用户口径）：客户端造物图稳定 15 次/秒，内核步长 = 1/15s，
  -- 时间参数在**球实体变量 fb_dt** 上调；服务端渲染用自己的 fb_dur。Lua 不再上报帧时长。
  local s = math.floor(G.t)
  if s ~= G.sec then
    G.sec = s
    renderTimer()
  end
  if G.toastT > 0 then
    G.toastT = G.toastT - step
    if G.toastT <= 0 then
      G.toastT = 0
      setText(STYLE.toast.name, '')
    end
  end
end

function OnDestroy()
end
