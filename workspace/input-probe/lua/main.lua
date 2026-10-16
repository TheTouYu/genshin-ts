-- ============================================================
-- input-probe 千星真机输入探针 v1
-- ①真机 CursorClick→CursorBeginDrag 临界位移（校准模拟器 PR#11 5px 死区常数）
-- ②物理键→Enum.KeyEventType 事件名映射（校准 PR#12 映射表）
-- ③顺带：SimulateCursorClick 行为 / CursorEnter-Exit / CursorMove 枚举有无 /
--        game.GetDevice / game.GetCursorUIPos
-- 挂载：服务端控件模板 n1「探针层」（stretch 全屏容器，showCursor=true）
-- 模板：T_TXT=1073741871(textbox) T_BTN=1073741872(button) T_AREA=1073741873(cursor)
-- （1829 槽导入重编号 guid，v4 差分定谳；模拟器 save 内为 2301/2302/2304）
-- 逻辑场 444×250，千星 Y 向上；读出=屏上文本行（真机唯一可靠读出）
-- 统计核心：clickMaxD=所有 Click 的最大抬起位移；dragMinD=所有 BeginDrag 的最小触发位移
--           阈值 T 满足 clickMaxD ≤ T ≤ dragMinD（自动夹区间，无需人工精确控位移）
-- ============================================================
local T_TXT, T_BTN, T_AREA = 1073741854, 1073741855, 1073741856
local KE, CE = Enum.KeyEventType, Enum.CursorEventType
local FW, FH = 444, 250

-- ===== 运行时状态 =====
local K, CW, CH, HX, HY
local area
local L = {}                        -- 显示文本控件
local clickN, clickMaxD = 0, -1     -- CursorClick 抬起位移统计
local dragN, dragMinD = 0, 1e9      -- CursorBeginDrag 触发位移统计
local pressTxt, upTxt, upD = '-', '-', '-'
local SEQ_SZ = 10                   -- 事件序列环形缓冲（连续 Drag 折叠一格）
local seq, seqHead, seqCnt = {}, 1, 0
local keyLast1, keyLast2 = '', ''
local keyOkN, keyFailN = 0, 0
local bound = {}
local cmState = '?'                 -- CursorMove 枚举探测结果
local cursorPosTxt = '-'
local uiT = 0

-- ===== 工具 =====
local f1 = function(v) return string.format('%.1f', v) end
-- 坐标读取：GetUIPos()/GetPressUIPos() 方法为主（hmlt 真机验证路径；模拟器元表只暴露
-- dragging/touchId 字段，x/y 非字段）。字段探测记录真机 d.x 行为（nil=无字段/数值=有字段）。
local fieldX = nil   -- 'nil' / 'num' / 'ERR'
local function evPos(d)
  local ok, x, y = pcall(function() return d:GetUIPos() end)
  if ok and x ~= nil then return x, y end
  return d.x or 0, d.y or 0
end
local function evPress(d, fx, fy)
  local ok, px, py = pcall(function() return d:GetPressUIPos() end)
  if ok and px ~= nil then return px, py end
  return d.pressX or fx, d.pressY or fy
end
local function dispOf(d)
  local x, y = evPos(d)
  local px, py = evPress(d, x, y)
  local dx, dy = x - px, y - py
  return math.sqrt(dx * dx + dy * dy)
end
local function probeField(d)
  if fieldX == nil then
    local ok, v = pcall(function() return d.x end)
    if not ok then fieldX = 'ERR'
    elseif type(v) == 'number' then fieldX = 'num'
    else fieldX = 'nil' end
  end
end
local function ptStr(d)
  local x, y = evPos(d)
  return f1(x) .. ',' .. f1(y)
end

-- ===== 事件序列 =====
local function pushSeq(s)
  if seqCnt < SEQ_SZ then
    seq[(seqHead + seqCnt - 1) % SEQ_SZ + 1] = s
    seqCnt = seqCnt + 1
  else
    seq[seqHead] = s
    seqHead = seqHead % SEQ_SZ + 1
  end
end
local function seqText()
  local t = {}
  for i = 0, seqCnt - 1 do
    t[#t + 1] = seq[(seqHead + i - 1) % SEQ_SZ + 1]
  end
  return table.concat(t, ' ')
end
local function lastSeqIs(tag)
  if seqCnt == 0 then return false end
  local s = seq[(seqHead + seqCnt - 2) % SEQ_SZ + 1] or ''
  return string.sub(s, 1, string.len(tag)) == tag
end

-- ===== 渲染 =====
local function render()
  local cMax = clickMaxD < 0 and '-' or f1(clickMaxD)
  local dMin = dragMinD > 1e8 and '-' or f1(dragMinD)
  local thr
  if clickMaxD < 0 and dragMinD > 1e8 then thr = '?'
  elseif dragMinD > 1e8 then thr = '> ' .. cMax
  elseif clickMaxD < 0 then thr = '< ' .. dMin
  else thr = '[' .. cMax .. ',' .. dMin .. ']' end
  L.line1.text = 'PRESS(' .. pressTxt .. ') UP(' .. upTxt .. ') DISP=' .. upD
  L.line2.text = 'SEQ ' .. seqText()
  L.line3.text = 'CL n=' .. clickN .. ' max=' .. cMax .. ' | BD n=' .. dragN .. ' min=' .. dMin .. ' | T ' .. thr
  local k2 = keyLast2 ~= '' and (' ; ' .. keyLast2) or ''
  L.line4.text = 'KEYS ' .. keyOkN .. '/' .. (keyOkN + keyFailN) .. ' | ' .. keyLast1 .. k2
  L.line5.text = 'CUR ' .. cursorPosTxt .. ' | CM=' .. cmState .. ' | d.x=' .. (fieldX or '-')
end

-- ===== 控件工厂 =====
local function mkc(prefab, name)
  local c = game.InstantiateClientUIControl(prefab, script.object)
  if c then c.name = name end
  return c
end
local function txtc(key, str, size, r, g, b, gx, gy, w, h)
  local c = mkc(T_TXT, key)
  c.text = str or ''
  c.fontSize = math.max(10, math.floor(size * K + 0.5))
  c.fontColor = Color(r, g, b, 255)
  c.bgColor = Color(0, 0, 0, 0)
  c.enableOutline = true
  -- v11: 模板默认锚点疑似 stretch（sizeDelta 沦为偏移、宽盒推出屏幕=九轮"只有SIM/RST"根因）
  -- 显式中心点锚 + SetSizeDelta 才是真实盒尺寸（官方 API SetAnchorMin/Max）
  c:SetAnchorMin(0.5, 0.5)
  c:SetAnchorMax(0.5, 0.5)
  c:SetAnchoredPosition(gx * K - HX, gy * K - HY)
  -- v13: 真机 textbox 按盒高裁剪文字行（v12 实证：盒高/字高 1.25 不可见、1.54 可见）
  -- 盒高下限 = 字高 × 1.8，杜绝整行被裁
  local fontPx = math.max(10, math.floor(size * K + 0.5))
  c:SetSizeDelta(w * K, math.max(h * K, fontPx * 1.8))
  L[key] = c
  return c
end

-- ===== 键盘绑定 =====
local function onKeyEv(name)
  keyLast2 = keyLast1
  keyLast1 = name
  print('[key] ' .. name)
  render()
  return false
end
local function bindEv(name, ev)
  if bound[name] then return end
  bound[name] = true
  local ok = pcall(function()
    script.object:AddKeyEventListener(ev, function() return onKeyEv(name) end)
  end)
  if ok then keyOkN = keyOkN + 1 else keyFailN = keyFailN + 1 end
end
local function bindName(name)
  if bound[name] then return end
  local ok, ev = pcall(function() return KE[name] end)
  if ok and ev then
    bindEv(name, ev)
  else
    bound[name] = true
    keyFailN = keyFailN + 1
  end
end

-- ===== 生命周期 =====
function OnInit()
  CW, CH = game.GetUICanvasSize()
  K = CW / FW
  HX, HY = CW / 2, CH / 2
end

function OnStart()
  script.object.showCursor = true
  CW, CH = game.GetUICanvasSize()
  -- v6 根因修复：宿主实例真机 sizeDelta=0x0（v5 print 实证；模板 stretch 未在实例生效）
  --   → 运行时强设全屏。after 读回 print 验证；若全行显=闭环。
  do
    local ok = pcall(function() script.object:SetSizeDelta(CW, CH) end)
    local w = 0; local h = 0
    pcall(function() w = script.object.sizeDeltaX; h = script.object.sizeDeltaY end)
    print('[probe-parent] before=0,0 after=' .. tostring(w) .. ',' .. tostring(h)
      .. ' setOk=' .. tostring(ok) .. ' CW=' .. tostring(CW))
  end
  -- v7 官方诊断：打印运行时控件树（指南核对：容器激活链/层级/挂载结构一次看清）
  pcall(function() game.PrintClientUITree() end)
  do
    local okn, nm = pcall(function() return script.object.name end)
    print('[probe-host] name=' .. (okn and tostring(nm) or 'ERR'))
    end
  K = CW / FW
  HX, HY = CW / 2, CH / 2

  -- v9: 读出行移至最后创建（z-order 实验：textbox 在光标区/按钮之上）
  do
    local ok1, pw = pcall(function() return script.object.sizeDeltaX end)
    local ok2, ph = pcall(function() return script.object.sizeDeltaY end)
    print('[probe-parent] size=' .. (ok1 and tostring(pw) or 'ERR') .. ','
      .. (ok2 and tostring(ph) or 'ERR'))
  end
  for _, k in ipairs({ 'title', 'line1', 'line5', 'diagP', 'diagQ', 'simLbl', 'rstLbl' }) do
    local c = L[k]
    if c then
      local ok1, w = pcall(function() return c.sizeDeltaX end)
      local ok2, h = pcall(function() return c.sizeDeltaY end)
      print('[probe-geo] ' .. k .. ' size=' .. (ok1 and tostring(w) or 'ERR') .. ','
        .. (ok2 and tostring(h) or 'ERR'))
    end
  end
  print('[input-probe] OnStart done CW=' .. tostring(CW) .. ' CH=' .. tostring(CH)
    .. ' K=' .. tostring(K) .. ' DEV=' .. tostring(devTxt))

  -- 全屏光标区（先建=最底层；读出行在上，按钮最后建=顶层）
  area = mkc(T_AREA, 'ProbeArea')
  -- v11: stretch 锚（0,0-1,1）+ 零偏移 = 真全屏（sizeDelta 在 stretch 下是偏移，不再当尺寸用）
  area:SetAnchorMin(0, 0)
  area:SetAnchorMax(1, 1)
  area:SetAnchoredPosition(0, 0)
  area:SetSizeDelta(0, 0)

  local function onCur(tag, d)
    local disp = dispOf(d)
    probeField(d)
    -- 测量用打印：每个光标事件的类型/位置/按下点/位移（一次短爆发注入后可离线读 Debug_Log）
    do
      local cxp, cyp = evPos(d)
      local pxp, pyp = evPress(d, cxp, cyp)
      print('[cur] ' .. tag .. ' x=' .. f1(cxp) .. ' y=' .. f1(cyp)
        .. ' pr=' .. f1(pxp) .. ',' .. f1(pyp) .. ' d=' .. f1(disp))
    end
    if tag == 'Dn' then
      local x, y = evPos(d)
      pressTxt = ptStr(d); upTxt = '-'; upD = '-'
      pushSeq('Dn(' .. math.floor(x + 0.5) .. ',' .. math.floor(y + 0.5) .. ')')
    elseif tag == 'Up' then
      upTxt = ptStr(d); upD = f1(disp)
      pushSeq('Up(' .. upD .. ')')
    elseif tag == 'Cl' then
      clickN = clickN + 1
      if disp > clickMaxD then clickMaxD = disp end
      pushSeq('Cl(' .. f1(disp) .. ')')
    elseif tag == 'Bd' then
      dragN = dragN + 1
      if disp < dragMinD then dragMinD = disp end
      pushSeq('Bd(' .. f1(disp) .. ')')
    elseif tag == 'Ed' then
      pushSeq('Ed(' .. f1(disp) .. ')')
    elseif tag == 'Dg' then
      local s = 'Dg(' .. f1(disp) .. ')'
      if lastSeqIs('Dg') then
        seq[(seqHead + seqCnt - 2) % SEQ_SZ + 1] = s
      else
        pushSeq(s)
      end
    elseif tag == 'En' or tag == 'Ex' then
      pushSeq(tag)
    end
    render()
    return false
  end
  local CURS = {
    { 'CursorDown', 'Dn' }, { 'CursorUp', 'Up' }, { 'CursorClick', 'Cl' },
    { 'CursorBeginDrag', 'Bd' }, { 'CursorEndDrag', 'Ed' }, { 'CursorDrag', 'Dg' },
    { 'CursorEnter', 'En' }, { 'CursorExit', 'Ex' },
  }
  for _, m in ipairs(CURS) do
    local ev = CE[m[1]]
    if ev then
      pcall(function()
        area:AddCursorEventListener(ev, function(d) return onCur(m[2], d) end)
      end)
    end
  end
  -- CursorMove 枚举探测：模拟器 enums.js 无此项；真机若有 = 模拟器缺口证据
  local okm, evm = pcall(function() return CE.CursorMove end)
  if okm and evm then
    local okb = pcall(function()
      area:AddCursorEventListener(evm, function()
        pushSeq('Mv')
        render()
        return false
      end)
    end)
    cmState = okb and 'YES' or 'FAIL'
  else
    cmState = 'NO'
  end

  -- 键盘：核心 20 项静态点号绑定（hmlt 真机验证过的写法；J/K/WASD/方向键）
  bindEv('KeyboardCraftspersonKey19Down', KE.KeyboardCraftspersonKey19Down)
  bindEv('KeyboardCraftspersonKey19Up', KE.KeyboardCraftspersonKey19Up)
  bindEv('KeyboardCraftspersonKey20Down', KE.KeyboardCraftspersonKey20Down)
  bindEv('KeyboardCraftspersonKey20Up', KE.KeyboardCraftspersonKey20Up)
  bindEv('KeyboardMoveForwardKeyDown', KE.KeyboardMoveForwardKeyDown)
  bindEv('KeyboardMoveForwardKeyUp', KE.KeyboardMoveForwardKeyUp)
  bindEv('KeyboardMoveBackwardKeyDown', KE.KeyboardMoveBackwardKeyDown)
  bindEv('KeyboardMoveBackwardKeyUp', KE.KeyboardMoveBackwardKeyUp)
  bindEv('KeyboardMoveLeftKeyDown', KE.KeyboardMoveLeftKeyDown)
  bindEv('KeyboardMoveLeftKeyUp', KE.KeyboardMoveLeftKeyUp)
  bindEv('KeyboardMoveRightKeyDown', KE.KeyboardMoveRightKeyDown)
  bindEv('KeyboardMoveRightKeyUp', KE.KeyboardMoveRightKeyUp)
  bindEv('KeyboardCraftspersonKey36Down', KE.KeyboardCraftspersonKey36Down)
  bindEv('KeyboardCraftspersonKey36Up', KE.KeyboardCraftspersonKey36Up)
  bindEv('KeyboardCraftspersonKey37Down', KE.KeyboardCraftspersonKey37Down)
  bindEv('KeyboardCraftspersonKey37Up', KE.KeyboardCraftspersonKey37Up)
  bindEv('KeyboardCraftspersonKey38Down', KE.KeyboardCraftspersonKey38Down)
  bindEv('KeyboardCraftspersonKey38Up', KE.KeyboardCraftspersonKey38Up)
  bindEv('KeyboardCraftspersonKey39Down', KE.KeyboardCraftspersonKey39Down)
  bindEv('KeyboardCraftspersonKey39Up', KE.KeyboardCraftspersonKey39Up)
  -- 其余全量动态绑定（Craftsperson1-43 / Keyboard 具名 / Controller 全系）
  for i = 1, 43 do
    bindName('KeyboardCraftspersonKey' .. i .. 'Down')
    bindName('KeyboardCraftspersonKey' .. i .. 'Up')
  end
  for _, k in ipairs({
      'MoveForwardKey', 'MoveBackwardKey', 'MoveLeftKey', 'MoveRightKey',
      'SwitchToWalkOrRunKey', 'SprintKey', 'JumpKey', 'DropKey',
      'OpenShortcutWheelKey', 'InteractKey', 'NormalAttackKey',
      'CharacterSkill1Key', 'CharacterSkill2Key', 'CharacterSkill3Key', 'CharacterSkill4Key',
    }) do
    bindName('Keyboard' .. k .. 'Down')
    bindName('Keyboard' .. k .. 'Up')
  end
  for i = 1, 14 do
    bindName('ControllerCraftspersonKey' .. i .. 'Down')
    bindName('ControllerCraftspersonKey' .. i .. 'Up')
  end
  for _, k in ipairs({
      'SprintKey', 'JumpKey', 'InteractKey', 'NormalAttackKey',
      'CharacterSkill1Key', 'CharacterSkill2Key', 'CharacterSkill3Key', 'CharacterSkill4Key',
      'MenuConfirmKey', 'MenuBackKey',
    }) do
    bindName('Controller' .. k .. 'Down')
    bindName('Controller' .. k .. 'Up')
  end

  -- SIM / RST 按钮（最后建=顶层可点；测试时避开左下角）
  local sim = mkc(T_BTN, 'SIM')
  sim:SetAnchorMin(0.5, 0.5)
  sim:SetAnchorMax(0.5, 0.5)
  sim:SetAnchoredPosition(38 * K - HX, 16 * K - HY)
  sim:SetSizeDelta(56 * K, 22 * K)
  pcall(function()
    sim:AddCursorEventListener(CE.CursorClick, function()
      local ok = pcall(function() area:SimulateCursorClick() end)
      pushSeq(ok and 'SIM' or 'SIM-FAIL')
      render()
      return false
    end)
  end)
  local rst = mkc(T_BTN, 'RST')
  rst:SetAnchorMin(0.5, 0.5)
  rst:SetAnchorMax(0.5, 0.5)
  rst:SetAnchoredPosition(104 * K - HX, 16 * K - HY)
  rst:SetSizeDelta(56 * K, 22 * K)
  pcall(function()
    rst:AddCursorEventListener(CE.CursorClick, function()
      clickN, clickMaxD = 0, -1
      dragN, dragMinD = 0, 1e9
      pressTxt, upTxt, upD = '-', '-', '-'
      seqCnt, seqHead = 0, 1
      pushSeq('RST')
      render()
      return false
    end)
  end)
  txtc('simLbl', 'SIM', 8, 255, 255, 255, 38, 16, 56, 12)
  txtc('rstLbl', 'RST', 8, 255, 255, 255, 104, 16, 56, 12) -- v4: 回滚 56K（v3 加宽消失=宽度因素证据）

  -- 读出行（下半屏往上排，全 ASCII；v14: 行距按盒高(字高×1.8)重排，消除 v13 重叠）
  local devTxt = '?'
  local okd, dev = pcall(function() return game.GetDevice() end)
  if okd and dev and dev.Name then devTxt = dev.Name end
  txtc('title', 'INPUT-PROBE v1  CANVAS ' .. math.floor(CW + 0.5) .. 'x' .. math.floor(CH + 0.5)
    .. ' DEV=' .. devTxt, 11, 235, 235, 235, 222, 32, 438, 14)
  txtc('line1', 'PRESS(-) UP(-) DISP=-', 12, 255, 220, 90, 222, 54, 438, 15)
  txtc('line2', 'SEQ', 10, 235, 235, 235, 222, 76, 438, 13)
  txtc('line3', 'CL n=0 max=- | BD n=0 min=- | T ?', 11, 120, 255, 120, 222, 96, 438, 14)
  txtc('line4', 'KEYS 0/0', 9, 160, 205, 255, 222, 114, 438, 12)
  txtc('line5', 'CUR - | CM=?', 9, 190, 190, 190, 222, 130, 438, 12)
  txtc('hint', 'drag test = upper screen | SIM/RST at bottom-left', 8, 170, 170, 170, 222, 142, 438, 11)

  -- v8 模板索引对照：prefabIndex 只读字段（ClientUIBaseControl）——直接读创建返回值
    local function describe(tag, c)
      if not c then print('[probe-mk] ' .. tag .. ' = nil'); return end
      local a, b, d, p = '?', '?', '?', '?'
      pcall(function() a = tostring(c.prefabIndex) end)
      pcall(function() b = tostring(c.id) end)
      pcall(function() d = tostring(c.alive) end)
      pcall(function() p = tostring(c:GetParent().name) end)
      -- v12: 矩形读回诊断（锚点/位置/尺寸 getter——真机可见性排查）
      local r = {}
      local function grab(name, fn)
        local ok, x, y = pcall(fn)
        r[#r+1] = name .. '=' .. (ok and (tostring(x) .. ',' .. tostring(y)) or 'ERR')
      end
      grab('aMin', function() return c:GetAnchorMin() end)
      grab('aMax', function() return c:GetAnchorMax() end)
      grab('pos', function() return c:GetAnchoredPosition() end)
      grab('sz', function() return c:GetSizeDelta() end)
      local okv, vis = pcall(function() return tostring(c.visible) end)
      print('[probe-mk] ' .. tag .. ' prefabIndex=' .. a .. ' id=' .. b .. ' alive=' .. d
        .. ' vis=' .. (okv and vis or 'ERR') .. ' ' .. table.concat(r, ' '))
    end
    describe('host', script.object)
    describe('area', area)
    describe('sim', sim)
    describe('rst', rst)
    describe('title', L.title)
    describe('line1', L.line1)
    describe('simLbl', L.simLbl)

  render()
  script:EnableUpdate(true)
end

function OnUpdate(dt)
  uiT = uiT + dt
  if uiT >= 0.1 then
    uiT = 0
    local ok, x, y = pcall(function() return game.GetCursorUIPos() end)
    if ok and x then
      cursorPosTxt = f1(x) .. ',' .. f1(y)
    else
      cursorPosTxt = 'ERR'
    end
    render()
  end
end
