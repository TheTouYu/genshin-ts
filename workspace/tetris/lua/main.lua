--[[==========================================================================
Tetris —— 千星模拟器 2D 路线技术验证 demo（服务端驱动渲染）
----------------------------------------------------------------------------
架构：
  * 本脚本挂在服务端控件 n1（服务端容器）上 —— 客户端模板树零脚本铁律，脚本不进模板。
  * 棋盘 10x20 = 200 格：OnStart 用 game.InstantiateClientUIControl(模板 guid, root)
    实例化 200 个 image 实例并按格位摆放；之后只改 imageColor 上色。
  * 所有文字（logo/统计/键位卡/提示/上下横幅）都是**服务端 textbox**，按 name 寻址：
    GetChild 不受"模板 guid 重编号"影响，是跨宿主最稳的一条寻址路。
  * 模板块指引：客户端模板只有一个 cell。模板 guid 在模拟器（authoring）与真机
    （导入后编辑器重编号）不同（实测 1073742105 vs 1073741849），多一个模板就多一处
    导入后校准 —— 所以"覆盖棋盘的引导层"改成上下横幅（不遮棋盘，也更简洁）。
  * 逻辑固定步长：OnUpdate(dt) 只累加，逻辑在 STEP=1/60 的 tick 内跑。

满幅布局（按 GetUICanvasSize 计算，换设备不用重新导入）：
  | 左栏 420 | 棋盘 300 | 右栏 420 |     上横幅（46 高）/ 下横幅（46 高）

键位（官方具名键，模拟器与真机均已实测可用）：
  ArrowLeft/A   -> KeyboardCraftspersonKey38Down / KeyboardMoveLeftKeyDown   左移
  ArrowRight/D  -> KeyboardCraftspersonKey39Down / KeyboardMoveRightKeyDown  右移
  ArrowUp/W     -> KeyboardCraftspersonKey36Down / KeyboardMoveForwardKeyDown 顺时针旋转
  ArrowDown/S   -> KeyboardCraftspersonKey37Down / KeyboardMoveBackwardKeyDown 软降
  Space         -> KeyboardJumpKey            硬降
  R             -> KeyboardCharacterSkill3Key 重开
  H             -> KeyboardCharacterSkill1Key 键位表（暂停开关；真机若不认则无害，右栏常驻键位卡兜底）
  T             -> KeyboardCharacterSkill4Key 调试：填满最底两行（仅用例用）

引导（时机精准 / 由简入深 / 可回溯）：
  stage 0 等开始：重力暂停，上横幅 TETRIS，下横幅键位 + "按任意键开始"
  stage 1 游戏中：首次锁定提示"堆满一行即消除"，首次消行提示分值表
  stage 2 键位表：按 H 暂停并显示完整键位，再按 H 继续
  失败：上横幅 GAME OVER（红），下横幅 得分 / 本局最高 / 按 R 重开
=========================================================================]]

local COLS, ROWS    = 10, 20
local CELL, GAP     = 28, 2
local PITCH         = CELL + GAP
-- 模板 guid 候选表：`__GUID_*__` 由 qxqy/build.mjs 注入本工程的实际值（模拟器恒命中）；
-- 真机导入后编辑器会重新编号，所以把真机已知值也列进来。探测按「能力」判类型，不靠名字：
--   cell = image（无光标事件方法） / hit = cursor（有 AddCursorEventListener）。
-- 真机首次导入 hit 后若仍点不动，跑 `node qxqy/deploy.mjs --calibrate` 自动把新 guid 写进这里。
local TPL_GUIDS = {
  cell = { __GUID_CELL__, 1073741849, 1073741854 },
  hit  = { __GUID_HIT__, 1073741884, 1073741865, 1073741866 },
  -- 结算层**容器模板**候选：真机地图里的两个容器组 + 它们的容器节点 + 模拟器模板。
  -- 2026-10-24 真机日志实证：容器组 1073741865 在真机 `InstantiateClientUIControl` 返回 nil
  -- ⇒ 容器整棵实例化在真机不支持（要么容器不在可实例化表里，要么引擎只认叶子控件），
  -- 所以下面还有一组 settleText（单控件模板）退路，并把每条候选的探测结果打进日志。
  -- 2026-10-25 两个实验：容器模板 2210（整棵复用）/ 文字模板 2202（逐个数实例化）
  settle = { 1073742210, 1073741865, 1073741921, 1073742107 },
  -- 结算层**单控件（textbox）模板**候选：模拟器 stext + 真机模板区里的 textbox 记录（逐个试）
  -- 1073742200 = 2026-10-24 用 `gsts assets:ui template clone 1073741935 --id 1073742200 --top-level`
  -- 新建的**顶层 textbox 模板**（真机容器模板实例化不了，这个才是真机能用的那条）
  settleText = { 1073742202, 1073742200, 1073741935, 1073741923, 1073741937, 1073741934,
                 1073741933, 1073741922, __GUID_STEXT__ },
}
local STEP          = 1 / 60
local GRAVITY_TICKS = 30           -- 每 30 拍下坠一格（0.5s）

local function C(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end
local COL_EMPTY  = C(255, 26, 29, 38)
local COL_CYAN   = C(255, 60, 220, 240)
local COL_YELLOW = C(255, 245, 210, 60)
local COL_PURPLE = C(255, 170, 80, 240)
local COL_GREEN  = C(255, 90, 220, 110)
local COL_RED    = C(255, 240, 80, 90)
local COL_BLUE   = C(255, 70, 130, 240)
local COL_ORANGE = C(255, 245, 160, 60)
local COL_BG     = C(255, 18, 20, 27)

-- 七种方块：n = 包围盒边长，cells = 盒内 1-based {row, col}
local SHAPES = {
  I = { n = 4, color = COL_CYAN,   cells = {{2,1},{2,2},{2,3},{2,4}} },
  O = { n = 2, color = COL_YELLOW, cells = {{1,1},{1,2},{2,1},{2,2}} },
  T = { n = 3, color = COL_PURPLE, cells = {{1,2},{2,1},{2,2},{2,3}} },
  S = { n = 3, color = COL_GREEN,  cells = {{1,2},{1,3},{2,1},{2,2}} },
  Z = { n = 3, color = COL_RED,    cells = {{1,1},{1,2},{2,2},{2,3}} },
  J = { n = 3, color = COL_BLUE,   cells = {{1,1},{2,1},{2,2},{2,3}} },
  L = { n = 3, color = COL_ORANGE, cells = {{1,3},{2,1},{2,2},{2,3}} },
}
local BAG = { 'I', 'O', 'T', 'S', 'Z', 'J', 'L' }

-- 确定性随机（LCG）：用例可复现，不依赖 os / math.random
local seed = 20261023
local function rand(n)
  seed = (seed * 1103515245 + 12345) % 2147483648
  return (seed // 65536) % n + 1
end

-- 前向声明（局部化，避免污染全局表）
local root, cells, preview, frames
local title, hud, hudNext, best, hint, keyA, keyB, keyC, topBanner, botBanner
local board, piece, nextName
local score, lines, level, bestScore
local gameOver, tickCount, acc
local guideStage, bannerTimer, taughtLock, taughtClear
local flashT, introT, overlay
local introFont, introPulse
local autoDriving = false   -- true = 本次落子由入场 AI 驱动（抑制教学提示与高频日志）
local elapsed = 0           -- 本局用时（结算明细用）
local settleLayer, settleScrim, settleCard, settleBorder   -- 结算层（运行时实例化，层级高于棋盘格）
local settleReady = false   -- 结算层当前是否存活（按需创建、重开即销毁）
local settleBuildTried = false  -- 这一局试过创建没有（避免每帧重试；销毁时复位）
local settleTitle, settleScore, settleBest, settleInfo, settleExtra, settleOpts
-- 结算层成员表：**固定 9 槽 + 数字 for 遍历**，绝不能用 ipairs({...})——
-- 里面只要有一个 nil（比如没造 border），ipairs 就在那里停住，后面的成员会被静默跳过（销毁会漏）。
-- 注意必须声明在**上面 10 个 settle 变量之后**：写在前面会把后面那些当全局（nil），成员数恒为 2（踩过）。
local function settleMembers()
  return { settleScrim, settleCard, settleBorder, settleTitle,
           settleScore, settleBest, settleInfo, settleExtra, settleOpts }
end
local settleOn, settleT, settleDone = false, 0, false
local settleFade = -1       -- 遮罩/面板淡入进度（0..1，只在变化够大时写 UI）
local settleSize = 44       -- 标题当前字号（脉冲 44→48→44）
local CANVAS_W, CANVAS_H = 1280, 720                -- layout() 记录，懒创建结算层时要用
local settleTitleY, settleOptsY = 150, -150        -- 标题 / 选项的落位
local settleTitleOff, settleOptsOff = 420, -420     -- 滑入起点（屏幕外）
local dimRatio, dimApplied = 0, -1                  -- 兜底压暗（结算层不可用时才用）
local settleDestroy, settleSetColors, layoutSettle   -- 定义见「结算层」/「布局」段（前向声明）
local AI                    -- 入场自演状态机（定义见「AI 自演」段）
local pieceCount = 0        -- 本局已落方块数（结算明细用）
local settleOpen = false    -- 结算明细是否展开（Q 切换）
local RIGHT_CX = 410
local showGameOver, updateBest
local collides, doLock, renderAll, renderPiece, renderHud, spawn, clearLines

local function cellIndex(r, c) return (r - 1) * COLS + c end

local function paint(r, c, color)
  local ctl = cells[cellIndex(r, c)]
  if ctl then ctl.imageColor = color end
end

-- 保护式写入：真机上某些字段/方法会抛错（模拟器接受），一处抛错会中断整段 OnStart
-- ⇒ 首次试玩全部按键无响应的根因（2026-10-24，日志停在 cellCount=200）。
local FAILED = {}
local function noteFail(tag, err)
  if FAILED[tag] then return end
  FAILED[tag] = true
  print('ui fail ' .. tag .. ' :: ' .. tostring(err))
end
local function trySet(ctl, key, value)
  if not ctl then return false end
  local ok, err = pcall(function() ctl[key] = value end)
  if not ok then noteFail(tostring(key), err) return false end
  return true
end
local function tryCall(ctl, method, a, b)
  if not ctl then return false end
  local ok, err = pcall(function() ctl[method](ctl, a, b) end)
  if not ok then noteFail(tostring(method), err) return false end
  return true
end

-- 服务端 textbox 按名字取；某个控件缺失不应炸整段 OnStart（真机与模拟器控件集可能不同）
local function find(name)
  if not root then return nil end
  local ok, ctl = pcall(function() return root:GetChild(name) end)
  if ok then return ctl end
  return nil
end

local function setText(ctl, value)
  if ctl then trySet(ctl, 'text', value) end
end

-- 手机按钮：标签是服务端 textbox（bgColor 当底），点击热区是客户端 cursor 实例（透明，叠在上面）
local BUTTONS = {
  -- 三行按钮：最下一行留 18px 离画布底边（-332 时整块贴边被裁，实测）
  { name = 'btnA', label = '←',    x = -410, y = -185 },
  { name = 'btnB', label = '→',    x = -410, y = -250 },
  { name = 'btnC', label = '↓',    x = -410, y = -315 },
  { name = 'btnD', label = '旋转', x =  410, y = -185 },
  { name = 'btnE', label = '直落', x =  410, y = -250 },
  { name = 'btnF', label = '重开', x =  410, y = -315 },
}
local BTN_W, BTN_H = 150, 56
local hits = {}

-- 文字样式：真机 GIL 里新建的控件没有样式（CLI 只建骨架），全部由 Lua 运行时设置。
-- 框高判据：h >= fontSize*1.45 + 4（见 docs/README §10.2），尺寸在 layout() 里给。
local C_TEXT, C_GOLD2, C_ACCENT2, C_DANGER, C_BTN =
  C(255, 214, 232, 246), C(255, 255, 194, 76), C(255, 118, 214, 255),
  C(255, 255, 77, 77), C(179, 26, 29, 38)
local UI_STYLE = {
  title     = { font = 64, color = C_GOLD2,   align = 'Middle' },
  hud       = { font = 20, color = C_ACCENT2, align = 'Middle' },
  hudNext   = { font = 22, color = C_ACCENT2, align = 'Middle' },
  best      = { font = 20, color = C_GOLD2,   align = 'Middle' },
  hint      = { font = 22, color = C_ACCENT2, align = 'Middle', valign = 'Middle' },
  keyA      = { font = 22, color = C_TEXT,    align = 'Middle' },
  keyB      = { font = 22, color = C_TEXT,    align = 'Middle' },
  keyC      = { font = 22, color = C_TEXT,    align = 'Middle' },
  topBanner = { font = 34, color = C_GOLD2,   align = 'Middle', valign = 'Middle' },
  botBanner = { font = 22, color = C_ACCENT2, align = 'Middle', valign = 'Middle' },
  btnA = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnB = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnC = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnD = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnE = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnF = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
}
local function applyStyle(name, ctl)
  local st = UI_STYLE[name]
  if not ctl or not st then return end
  if st.font then trySet(ctl, 'fontSize', st.font) end
  if st.color then trySet(ctl, 'fontColor', st.color) end
  if st.bg then trySet(ctl, 'bgColor', st.bg) end
  if st.align then trySet(ctl, 'horizontalAlignment', st.align) end
  if st.valign then trySet(ctl, 'verticalAlignment', st.valign) end
end

-- 按候选 guid 探测模板：needCursor=true 要求该控件具备光标事件方法（cursor/button）
local function probeTemplate(candidates, needCursor)
  for _, g in ipairs(candidates) do
    local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, root) end)
    if ok and ctl then
      local okFn, fn = pcall(function() return ctl.AddCursorEventListener end)
      local isCursor = okFn and type(fn) == 'function'
      if isCursor == needCursor then return ctl, g end
      pcall(function() game.DestroyClientUIControl(ctl) end)
    end
  end
  return nil, nil
end

--------------------------------------------------------------------------------
-- 结算层（2026-10-24 第三轮）：整套结算界面是**运行时实例化出来的一层**，不复用布局横幅。
-- 为什么必须单独一层：布局里的服务端 textbox 层级低于运行时实例（200 个棋盘格永远在上面），
-- 文字只要落在棋盘区域就会被吃掉（第二轮踩过：用 cell 遮罩盖文字，文字没了）。
-- 做法：整棵实例化客户端控件模板（容器 + 子 textbox），再往这层里塞 2 个 image 实例
--      （cell 模板）当「全屏遮罩」与「面板底」——它们同在实例层，压得住棋盘。
-- 兼容：模拟器模板 = build.mjs 里的 settle（子控件名 settleTitle/…）；
--      真机模板 = 地图里已有的「控件模板:客户端控件容器_1」（子控件名 title/hud/best/hint/botBanner）
--      ⇒ 取控件一律走「候选名列表」，两宿主同一份代码。
--------------------------------------------------------------------------------
local function instInto(candidates, parent, needCursor)
  for _, g in ipairs(candidates) do
    local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, parent) end)
    if ok and ctl then
      if needCursor == nil then return ctl end
      local okFn, fn = pcall(function() return ctl.AddCursorEventListener end)
      if (okFn and type(fn) == 'function') == needCursor then return ctl end
      pcall(function() game.DestroyClientUIControl(ctl) end)
    end
  end
  return nil
end

local function findIn(node, names)
  if not node then return nil end
  for _, n in ipairs(names) do
    local ok, child = pcall(function() return node:GetChild(n) end)
    if ok and child then return child end
  end
  return nil
end

-- 销毁整层：SetVisible(false) 在真机不保险（实测重开后结算页还在），所以重开就真销毁。
-- 逐个 pcall：真机某个控件销毁抛错不能中断后面（同 OnStart 的护栏思路）。
settleDestroy = function()
  if not (settleReady or settleLayer or settleTitle) then return end
  local n = 0
  local members = settleMembers()
  for i = 1, 9 do
    local ctl = members[i]
    if ctl then
      local ok = pcall(function() game.DestroyClientUIControl(ctl) end)
      if ok then n = n + 1 end
    end
  end
  if settleLayer then
    local ok = pcall(function() game.DestroyClientUIControl(settleLayer) end)
    if ok then n = n + 1 end
  end
  settleLayer, settleScrim, settleCard, settleBorder = nil, nil, nil, nil
  settleTitle, settleScore, settleBest, settleInfo, settleExtra, settleOpts = nil, nil, nil, nil, nil, nil
  settleReady, settleBuildTried = false, false
  settleOn, settleT, settleDone, settleFade = false, 0, false, -1
  print('settle destroy n=' .. n)
end

-- 每个结算槽位在"容器模板"里的候选子控件名（模拟器的 settle 模板 / 真机的 客户端控件容器_1 两套命名）
local SETTLE_KEY_NAMES = {
  title = { 'settleTitle', 'title' },
  score = { 'settleScore', 'hud' },
  best  = { 'settleBest', 'best' },
  info  = { 'settleInfo', 'hint' },
  extra = { 'settleExtra', 'keyA' },
  opts  = { 'settleOpts', 'botBanner' },
}

-- 按 kind 分类子控件（typeof 返回的是 ClientUIImageControl / ClientUITextBoxControl /
-- ClientUIContainerControl 这类名字；**不按控件名挑**——编辑器新建的容器模板子件就叫「图片/文本框/容器节点」）
local function classifyKids(ctl)
  local out = { image = {}, text = {}, container = {} }
  if not ctl then return out end
  local ok, kids = pcall(function() return ctl:GetChildren() end)
  if not (ok and type(kids) == 'table') then return out end
  for i = 1, #kids do
    local kid = kids[i]
    local okT, t = pcall(function() return typeof(kid) end)
    local low = (okT and type(t) == 'string') and string.lower(t) or ''
    if string.find(low, 'image') then
      out.image[#out.image + 1] = kid
    elseif string.find(low, 'text') then
      out.text[#out.text + 1] = kid
    elseif string.find(low, 'container') then
      out.container[#out.container + 1] = kid
    end
  end
  return out
end

-- ① 容器整棵实例化：逐条候选打印结果（真机 2026-10-24 实证容器组返回 nil，所以这里是排查主入口）
local function probeSettleContainer()
  for _, g in ipairs(TPL_GUIDS.settle) do
    local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, root) end)
    if ok and ctl then
      local okc, kids = pcall(function() return ctl:GetChildren() end)
      local n = (okc and type(kids) == 'table') and #kids or -1
      local cls = classifyKids(ctl)
      print('settle try tpl=' .. g .. ' -> ok kids=' .. n
        .. ' img=' .. #cls.image .. ' text=' .. #cls.text .. ' cont=' .. #cls.container
        .. ' title=' .. tostring(findIn(ctl, SETTLE_KEY_NAMES.title) ~= nil)
        .. ' opts=' .. tostring(findIn(ctl, SETTLE_KEY_NAMES.opts) ~= nil))
      -- 按**结构**判定可用：有 figure 也行（图片=面板底、文本框=至少一行字）
      if (#cls.text >= 1) then return ctl, cls end
      -- 名字命中的老模板（模拟器 settle / 真机上一版容器）也接受
      if findIn(ctl, SETTLE_KEY_NAMES.title) and findIn(ctl, SETTLE_KEY_NAMES.opts) then
        return ctl, cls
      end
      pcall(function() game.DestroyClientUIControl(ctl) end)   -- 不命中别留垃圾
    else
      print('settle try tpl=' .. g .. ' -> nil')
    end
  end
  return nil, nil
end

-- ② 单控件（textbox）模板：只探 guid（探针实例用完就销毁——否则它先造出来会被后造的遮罩盖住）
local function probeSettleTextbox()
  for _, g in ipairs(TPL_GUIDS.settleText) do
    local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, root) end)
    if ok and ctl then
      local okc, kids = pcall(function() return ctl:GetChildren() end)
      print('settle try text tpl=' .. g .. ' -> ok kids='
        .. ((okc and type(kids) == 'table') and #kids or -1))
      pcall(function() game.DestroyClientUIControl(ctl) end)
      return g
    end
    print('settle try text tpl=' .. g .. ' -> nil')
  end
  return nil
end

local function buildSettleLayer()
  local container, cls = probeSettleContainer()
  local textGuid                       -- 文字模板 guid（容器里文字不够时补行用）
  local sl = {}                        -- 六个文字槽位，按顺序分配
  if container then
    settleLayer = container
    -- 先按现在这套模板的名字取（模拟器 settle / 早期真机容器）
    sl[1] = findIn(container, SETTLE_KEY_NAMES.title)
    sl[2] = findIn(container, SETTLE_KEY_NAMES.score)
    sl[3] = findIn(container, SETTLE_KEY_NAMES.best)
    sl[4] = findIn(container, SETTLE_KEY_NAMES.info)
    sl[5] = findIn(container, SETTLE_KEY_NAMES.extra)
    sl[6] = findIn(container, SETTLE_KEY_NAMES.opts)
    -- 名字取不到 ⇒ 按结构取：编辑器新建的容器模板子件就叫「图片/文本框/容器节点」
    if cls then
      for i = 1, 6 do
        if not sl[i] and cls.text[i] then sl[i] = cls.text[i] end
      end
      if cls.image[1] then settleCard = cls.image[1] end
    end
    print('settle via=container kids=' .. ((cls and (#cls.image + #cls.text + #cls.container)) or 0)
      .. ' img=' .. ((cls and #cls.image) or 0) .. ' text=' .. ((cls and #cls.text) or 0)
      .. ' cont=' .. ((cls and #cls.container) or 0))
  end
  -- 六个槽位里还缺的，用文字模板补（真机容器只有 1 个文本框，要补 5 个；全是容器最省）
  local missing = 0
  for i = 1, 6 do
    if not sl[i] then missing = missing + 1 end
  end
  if missing > 0 then
    textGuid = probeSettleTextbox()
    if textGuid then
      for i = 1, 6 do
        if not sl[i] then
          local ok, c = pcall(function() return game.InstantiateClientUIControl(textGuid, root) end)
          if ok and c then sl[i] = c end
        end
      end
      print('settle via=textbox guid=' .. tostring(textGuid) .. ' filled=' .. missing)
    end
  end
  settleTitle, settleScore, settleBest = sl[1], sl[2], sl[3]
  settleInfo, settleExtra, settleOpts = sl[4], sl[5], sl[6]
  -- 遮罩：cell image（两宿主都能实例化）；它必须画在**所有东西下面** ⇒ 造完挪到根的第一个子节点
  if settleTitle then
    settleScrim = instInto(TPL_GUIDS.cell, root, nil)
    tryCall(settleScrim, 'SetAsFirstSibling')
  end
  -- 面板底：容器自带图片就用它，否则用 cell 现造一块
  if settleTitle and not settleCard then settleCard = instInto(TPL_GUIDS.cell, root, nil) end
  if not settleLayer and settleCard then tryCall(settleCard, 'SetAsFirstSibling') end
  if not (settleTitle and settleOpts) then
    -- 全部候选都不可实例化 ⇒ 清掉半成品，让 showGameOver 走布局横幅
    local members = settleMembers()
    for i = 1, 9 do
      if members[i] then pcall(function() game.DestroyClientUIControl(members[i]) end) end
    end
    if settleLayer then pcall(function() game.DestroyClientUIControl(settleLayer) end) end
    settleLayer, settleScrim, settleCard, settleBorder = nil, nil, nil, nil
    settleTitle, settleScore, settleBest, settleInfo, settleExtra, settleOpts = nil, nil, nil, nil, nil, nil
    settleReady = false
    print('settle layer=none  (所有候选模板都不可实例化 ⇒ 退化为布局横幅结算)')
    return
  end
  settleReady = true
  local okKids, kids = pcall(function() return (settleLayer or root):GetChildren() end)
  print('settle layer ok children=' .. ((okKids and type(kids) == 'table') and #kids or 0)
    .. ' title=' .. (settleTitle and 'y' or 'n') .. ' score=' .. (settleScore and 'y' or 'n')
    .. ' best=' .. (settleBest and 'y' or 'n') .. ' info=' .. (settleInfo and 'y' or 'n')
    .. ' opts=' .. (settleOpts and 'y' or 'n')
    .. ' scrim=' .. (settleScrim and 'y' or 'n') .. ' card=' .. (settleCard and 'y' or 'n'))
  -- 样式显式写死（真机模板是上一轮导入的旧值，不能依赖 authoring）
  for _, ctl in ipairs({ settleTitle, settleScore, settleBest, settleInfo, settleExtra, settleOpts }) do
    -- 这 6 个在下面要么都取到、要么整层判失败，用 ipairs 无风险
    trySet(ctl, 'horizontalAlignment', 'Middle')
    trySet(ctl, 'verticalAlignment', 'Middle')
    trySet(ctl, 'bgColor', C(0, 0, 0, 0))
  end
  trySet(settleTitle, 'fontSize', 44)
  trySet(settleScore, 'fontSize', 30)
  trySet(settleBest, 'fontSize', 24)
  trySet(settleInfo, 'fontSize', 22)
  trySet(settleExtra, 'fontSize', 22)
  trySet(settleOpts, 'fontSize', 28)
  settleSetColors(0)
  -- 懒创建：层刚建好就直接进入动画起点（不隐藏，也不留"隐藏态"给真机去误解）
  local n = 0
  local members = settleMembers()
  for i = 1, 9 do
    if members[i] then n = n + 1 end
  end
  print('settle build ok n=' .. n .. ' via=' .. (settleLayer and 'container' or 'textbox'))
  layoutSettle(CANVAS_W, CANVAS_H)   -- 懒创建：建完立刻摆位（此时 layout 早就跑过了）
end

-- 结算层文字颜色（alpha 随面板淡入；a 是 0..255）
settleSetColors = function(a)
  local dimA = math.floor(a * 0.72)
  trySet(settleTitle, 'fontColor', C(a, 255, 77, 77))
  trySet(settleScore, 'fontColor', C(a, 255, 194, 76))
  trySet(settleBest, 'fontColor', C(a, 232, 236, 244))
  trySet(settleInfo, 'fontColor', C(dimA, 214, 232, 246))
  trySet(settleExtra, 'fontColor', C(dimA, 214, 232, 246))
  trySet(settleOpts, 'fontColor', C(a, 232, 236, 244))
end

-- 结算动画（0→0.9s 四段）：①0→0.45s 遮罩/面板淡入（棋盘被压到 45% 亮度）
-- ②0.15s 起标题自上滑入（0.35s ease-out）③0.35s 起选项自下滑入 ④0.55s 起标题脉冲 44→48→44
local function settleTick(d)
  if not settleOn or settleDone then return end
  settleT = settleT + d
  local t = settleT
  local r1 = t / 0.45
  if r1 > 1 then r1 = 1 end
  if math.abs(r1 - settleFade) >= 0.05 or (r1 >= 1 and settleFade < 1) then
    settleFade = r1
    settleSetColors(math.floor(255 * r1))     -- 只动文字颜色 alpha（真机验证过的通道）
    if not settleReady then
      -- 兜底（没有结算层）：压暗棋盘本身
      dimRatio = 0.45 * r1
      dimApplied = r1
      renderAll()
    end
  end
  local e = function(p)
    if p <= 0 then return 0 end
    if p >= 1 then return 1 end
    return 1 - (1 - p) * (1 - p)            -- ease-out quad
  end
  local p2 = e((t - 0.15) / 0.35)
  if p2 > 0 then
    tryCall(settleTitle, 'SetAnchoredPosition', 0, settleTitleOff + (settleTitleY - settleTitleOff) * p2)
  end
  local p3 = e((t - 0.35) / 0.35)
  if p3 > 0 then
    tryCall(settleOpts, 'SetAnchoredPosition', 0, settleOptsOff + (settleOptsY - settleOptsOff) * p3)
  end
  local p4 = (t - 0.55) / 0.3
  if p4 > 0 and p4 < 1 then
    local size = 44 + math.floor(4 * math.sin(math.pi * p4) + 0.5)
    if size ~= settleSize then settleSize = size trySet(settleTitle, 'fontSize', size) end
  elseif p4 >= 1 and settleSize ~= 44 then
    settleSize = 44
    trySet(settleTitle, 'fontSize', 44)
  end
  if t >= 0.9 then
    settleDone = true
    tryCall(settleTitle, 'SetAnchoredPosition', 0, settleTitleY)
    tryCall(settleOpts, 'SetAnchoredPosition', 0, settleOptsY)
    trySet(settleTitle, 'fontSize', 44)
    print('settle anim done')
  end
end

-- 兜底压暗（只在结算层不可用时用）：已落方块按比例降到 45% 亮度。
-- 必须做在 renderAll 里而不是只做一次——renderPiece/renderAll 每次重绘都会用 board 原色覆盖。
local function dimColor(v, ratio)
  local k = 100 - math.floor(45 * ratio)
  local a = v // 16777216
  local rr = (v // 65536) % 256
  local gg = (v // 256) % 256
  local bb = v % 256
  return C(a, rr * k // 100, gg * k // 100, bb * k // 100)
end

renderAll = function()
  for r = 1, ROWS do
    for c = 1, COLS do
      local v = board[r][c]
      if v == 0 then paint(r, c, COL_EMPTY)
      elseif dimRatio > 0 then paint(r, c, dimColor(v, dimRatio))
      else paint(r, c, v) end
    end
  end
end

local function renderNext()
  if not preview then return end
  for i = 1, 4 do preview[i].imageColor = COL_BG end
  if gameOver or not nextName then return end
  local s = SHAPES[nextName]
  for i = 1, 4 do
    local ctl = preview[i]
    local r, c = s.cells[i][1], s.cells[i][2]
    ctl:SetAnchoredPosition(RIGHT_CX + (c - 2.5) * 20, 150 + (2.5 - r) * 20)
    ctl.imageColor = s.color
  end
end

renderHud = function()
  local oc = 0
  for r = 1, ROWS do
    for c = 1, COLS do
      if board[r][c] ~= 0 then oc = oc + 1 end
    end
  end
  setText(hud, '得分 ' .. score .. '　消行 ' .. lines .. '　等级 ' .. level
    .. '　已填 ' .. oc)
  setText(hudNext, '下一个')
  setText(best, '最高 ' .. bestScore)
  renderNext()
end

renderPiece = function()
  renderAll()
  if gameOver or not piece then return end
  for i = 1, 4 do
    local br = piece.y + piece.cells[i][1] - 1
    local bc = piece.x + piece.cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      paint(br, bc, piece.color)
    end
  end
end

collides = function(cs, px, py)
  for i = 1, #cs do
    local br = py + cs[i][1] - 1
    local bc = px + cs[i][2] - 1
    if bc < 1 or bc > COLS or br > ROWS then return true end
    if br >= 1 and board[br][bc] ~= 0 then return true end
  end
  return false
end

spawn = function()
  local name = nextName or 'T'
  nextName = BAG[rand(#BAG)]
  local s = SHAPES[name]
  piece = {
    name = name, n = s.n, color = s.color,
    cells = { { s.cells[1][1], s.cells[1][2] }, { s.cells[2][1], s.cells[2][2] },
              { s.cells[3][1], s.cells[3][2] }, { s.cells[4][1], s.cells[4][2] } },
    x = (COLS - s.n) // 2 + 1,
    y = 1,
  }
  if not autoDriving then
    print('piece=' .. name .. ' x=' .. piece.x .. ' y=' .. piece.y)
  end
  if collides(piece.cells, piece.x, piece.y) then
    gameOver = true
    print('gameover score=' .. score)
    updateBest()
    showGameOver()
  end
  renderPiece()
  renderHud()
end

clearLines = function()
  local cleared = 0
  local r = ROWS
  while r >= 1 do
    local full = true
    for c = 1, COLS do
      if board[r][c] == 0 then full = false end
    end
    if full then
      table.remove(board, r)
      local row = {}
      for c = 1, COLS do row[c] = 0 end
      table.insert(board, 1, row)
      cleared = cleared + 1
      -- 不递减 r：删除并把空行插到顶部后，原 r-1 行已落到索引 r，要再判一次
    else
      r = r - 1
    end
  end
  if cleared > 0 then
    -- 视觉反馈：整盘已落方块闪白 0.12s（每行都触发，不只是首次）
    for r2 = 1, ROWS do
      for c2 = 1, COLS do
        if board[r2][c2] ~= 0 then paint(r2, c2, C(255, 245, 250, 255)) end
      end
    end
    flashT = 0.12
    local pts = { 100, 300, 500, 800 }   -- 1/2/3/4 行
    score = score + pts[cleared] * level
    lines = lines + cleared
    level = lines // 10 + 1
    if autoDriving then
      print('demo clear n=' .. cleared .. ' lines=' .. lines)   -- 自演也在消行（心跳级日志）
    else
      print('clear n=' .. cleared .. ' score=' .. score .. ' lines=' .. lines)
    end
    -- 首次消行：由简入深——把"分值表"这项进阶信息押到玩家已经会消行之后
    -- （入场 AI 自演期间的消行不算，否则玩家真正上手时这条引导已经被吃掉）
    if not taughtClear and not autoDriving then
      taughtClear = true
      setText(hint, '一次消 4 行 +800')
      setText(botBanner, '空格 直落到底')
      bannerTimer = 4.0
      print('guide clear-tip')
    end
  end
end

doLock = function()
  for i = 1, 4 do
    local br = piece.y + piece.cells[i][1] - 1
    local bc = piece.x + piece.cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      board[br][bc] = piece.color
    end
  end
  local landed = {}
  for i = 1, 4 do
    local br = piece.y + piece.cells[i][1] - 1
    local bc = piece.x + piece.cells[i][2] - 1
    if br >= 1 and br <= ROWS then landed[#landed + 1] = (br - 1) * COLS + bc end
  end
  pieceCount = pieceCount + 1
  if not autoDriving then
    print('lock ' .. piece.name .. ' cells=' .. table.concat(landed, ','))
  end
  clearLines()
  -- 首次锁定：只教"堆满一行即消除"这一条，不叠加其它信息
  if not taughtLock and not autoDriving then
    taughtLock = true
    bannerTimer = 2.5
    print('guide lock-tip')
  end
  if not gameOver then spawn() end   -- spawn 内部 renderPiece() 会重画棋盘+新方块
  renderHud()
end

local function stepDown()
  if gameOver or not piece then return end
  if not collides(piece.cells, piece.x, piece.y + 1) then
    piece.y = piece.y + 1
    renderPiece()
    print('fall y=' .. piece.y)
  else
    doLock()
  end
end

-- 顺时针 90°：(r,c) → (c, n+1-r)，盒内 1-based（n = 包围盒边长）。
-- rotate() 与入场 AI 共用同一份转法，避免两处不一致。
local function rotateCells(cells, n)
  local out = {}
  for i = 1, 4 do out[i] = { cells[i][2], n + 1 - cells[i][1] } end
  return out
end

local function rotate()
  if gameOver or not piece then return end
  local nc = rotateCells(piece.cells, piece.n)
  if not collides(nc, piece.x, piece.y) then
    piece.cells = nc
    print('rotate ' .. piece.name)
    renderPiece()
  end
end

local function newGame()
  board = {}
  for r = 1, ROWS do
    local row = {}
    for c = 1, COLS do row[c] = 0 end
    board[r] = row
  end
  score, lines, level = 0, 0, 1
  pieceCount = 0
  elapsed = 0
  gameOver, tickCount, acc = false, 0, 0
  -- 结算层复位（R 重开必须归零：settleT/settlePhase/压暗比例，否则下一次结算从半路开始）
  settleOn, settleT, settleDone, settleFade, settleSize = false, 0, false, -1, 44
  dimRatio, dimApplied = 0, -1
  settleDestroy()                    -- 重开即销毁整层（不靠 SetVisible）
  nextName = BAG[rand(#BAG)]
  spawn()                            -- spawn 内部 renderPiece() 已重画整盘+方块
  renderHud()
  if not autoDriving then print('newgame') end
end

--------------------------------------------------------------------------------
-- 引导状态机：0=等开始（重力暂停） 1=游戏中 2=键位表（暂停）
--------------------------------------------------------------------------------

local function showKeymap()
  -- 单行，走 1100px 宽的横幅（textbox 是否支持 \n 换行未验证，不赌）
  setText(botBanner, '← → 移动　　↑ 旋转　　↓ 落下　　空格 直落　　R 重开')
  setText(hint, 'H 继续游戏')
end

local function startIfWaiting()
  if guideStage ~= 0 then return end
  guideStage = 1
  setText(topBanner, '')
  setText(botBanner, '')
  for _, c in ipairs({ hud, best, hint, keyA, keyB, keyC }) do tryCall(c, 'SetVisible', true) end
  trySet(topBanner, 'fontSize', 34)
  trySet(botBanner, 'fontSize', 22)
  if overlay then tryCall(overlay, 'SetVisible', false) end
  setText(hint, '堆满一行即消除')
  print('guide stage=1')
end

local function toggleKeymap()
  if guideStage == 2 then
    guideStage = 1
    setText(hint, '')
    setText(botBanner, '')
    print('guide stage=1 resume')
  else
    guideStage = 2
    showKeymap()
    print('guide stage=2 keymap')
  end
end

-- 结算页：棋盘暗场 + 顶部大字 + 底部「成绩 + 两个选项」。
-- 位置全部在棋盘之外（顶部/底部横幅）：运行时 InstantiateClientUIControl 造的格子层级高于
-- 服务端文字，中间放任何大字都会被吃掉（真机硬约束）。
showGameOver = function()
  bannerTimer = 0
  settleOpen = false
  print('guide gameover score=' .. score .. ' lines=' .. lines)
  -- 懒创建：第一次结算才建这一层（建的时候棋盘格早就存在 ⇒ 天然在它上面）
  if not settleReady and not settleBuildTried then
    settleBuildTried = true
    buildSettleLayer()
  end
  if settleReady then
    -- 结算层：先把文字写好，位置由 settleTick 从屏幕外滑入（0→0.9s 四段动画）
    setText(settleTitle, '游戏结束')
    setText(settleScore, '本局 ' .. score .. ' 分')
    setText(settleBest, '最高 ' .. bestScore)
    setText(settleInfo, '消行 ' .. lines .. ' 行　落块 ' .. pieceCount .. '　等级 ' .. level)
    setText(settleExtra, '')
    setText(settleOpts, '[R] 再来一局　　[Q] 结算明细')
    trySet(settleTitle, 'fontSize', 44)
    settleSize, settleT, settleFade, settleDone, settleOn = 44, 0, -1, false, true
    -- image 一次性给**终值**：真机可能不认 imageColor 的 A 通道（不认就变不透明纯色），
    -- 所以"渐暗"只靠文字 fontColor 的 A 通道渐入（这条通道在真机是一直在用的）。
    if settleScrim then trySet(settleScrim, 'imageColor', C(140, 0, 0, 0)) end
    if settleCard then trySet(settleCard, 'imageColor', C(232, 20, 24, 34)) end
    if settleBorder then trySet(settleBorder, 'imageColor', C(120, 76, 194, 255)) end
    settleSetColors(0)
    tryCall(settleTitle, 'SetAnchoredPosition', 0, settleTitleOff)
    tryCall(settleOpts, 'SetAnchoredPosition', 0, settleOptsOff)
    local members = settleMembers()
    for i = 1, 9 do
      tryCall(members[i], 'SetVisible', true)
    end
    tryCall(settleExtra, 'SetVisible', false)
    -- 布局横幅不参与结算（避免与结算层重复信息）
    setText(topBanner, '') setText(botBanner, '') setText(hint, '')
    renderAll()
    return
  end
  -- 兜底：结算层不可用（模板探测失败）时仍用布局横幅
  renderAll()
  -- 顶部大字：40 号 → 框高必须 >= 40*1.45+4 = 62（layout 给 64），否则整行静默不画
  -- 为什么不是更大：棋盘顶框在屏幕 y=59，上方净空只有 59px，40 号居中后墨迹 16..56 恰好不压框
  trySet(topBanner, 'fontSize', 40)
  trySet(topBanner, 'fontColor', C(255, 255, 96, 96))
  setText(topBanner, '游戏结束')
  -- 底部一行：成绩 + 两个选项；26 号 → 需 >= 41.7（layout 给 48）
  trySet(botBanner, 'fontSize', 26)
  trySet(botBanner, 'fontColor', C(255, 214, 232, 246))
  setText(botBanner, '本局 ' .. score .. ' 分　消行 ' .. lines .. ' 行'
    .. '　　[R] 再来一局　　[Q] 结算明细')
  setText(hint, '')
end

updateBest = function()
  if score > bestScore then bestScore = score end
end

--------------------------------------------------------------------------------
-- 入场「AI 自演」：guideStage == 0 时脚本自己玩，玩家一按键（startIfWaiting）立即交还控制。
-- 第四轮（用户反馈「看着窒息」）：
--  ① 选位像人：贴墙奖励（tie-breaker 量级）+ 禁止在中间挖 1 宽深井（竖 I 不许塞中间）；
--  ② 执行像人：观察 → 分段横移（1~2 格一停）→ 途中偶尔小落 → 到位犹豫 / 再看一眼 →
--     最后 50% 软降逐格落 / 50% 硬降，全程打 `demo pace` / `demo act` 日志。
local AI_OBSERVE_MIN, AI_OBSERVE_MAX = 0.25, 0.70   -- 算完之后先看清局面（完全不动）
local AI_MOVE_MIN, AI_MOVE_MAX = 0.08, 0.25         -- 两次横移之间
local AI_ROT_MIN, AI_ROT_MAX = 0.15, 0.25           -- 旋转本身
local AI_ROTGAP_MIN, AI_ROTGAP_MAX = 0.10, 0.20     -- 两次旋转之间
local AI_HOVER_MIN, AI_HOVER_MAX = 0.20, 0.40       -- 落定前"再看一眼"
local AI_SOFT_MIN, AI_SOFT_MAX = 0.06, 0.12         -- 软降一格
local AI_PIECE_MIN = 1.5                            -- 单块总时长下限（上限 3.5 由 planTiming 的预算 + 3.4s 兜底守住）
local AI_RESET_ROWS = 12                            -- 堆到这么高就清盘重开
local W_WALL, W_WELL = 0.06, 0.9                    -- 贴墙奖励 / 深井惩罚系数
local WELL_DEPTH = 3                                -- 1 列宽凹槽多深才算"深井"

-- 自演专用小随机：独立 LCG，不动方块袋那条序列 ⇒ 用例/出图仍可复现
local aiSeed = 20261024
local function aiRand(n)
  aiSeed = (aiSeed * 1103515245 + 12345) % 2147483648
  return (aiSeed // 65536) % n + 1
end
local function aiRange(lo, hi) return lo + (hi - lo) * (aiRand(1000) / 1000) end
local function aiFmt(x) return string.format('%.2f', x) end

-- 堆叠高度：最高一列已填的行数（0 = 空盘）
local function stackHeight()
  for r = 1, ROWS do
    for c = 1, COLS do
      if board[r][c] ~= 0 then return ROWS - r + 1 end
    end
  end
  return 0
end

-- 评估「cells 放到 x 列、自然落地」之后：返回 分数 / 落点高度 / 消行数；放不进返回 nil
-- 四项（El-Tetris / Lee 2013 公开权重，原样）+ 两项"像人"的小修正：
--   -0.06 × 离最近墙的列距（贴边偏好，只做同分/近似分的 tie-breaker）
--   -0.9  × 深度，对每个 1 列宽、深度 >= 3 的中间凹槽（不许为了塞竖 I 在中间挖井）
local W_AGG, W_LINE, W_HOLE, W_BUMP = -0.510066, 0.760666, -0.35663, -0.184483
local function evalBoard(cells, x)
  if collides(cells, x, 1) then return nil end
  local y = 1
  while y < ROWS and not collides(cells, x, y + 1) do y = y + 1 end
  local occ = {}
  for i = 1, 4 do
    local br, bc = y + cells[i][1] - 1, x + cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      occ[(br - 1) * COLS + bc] = true
    end
  end
  local solid = function(r, c)
    if r < 1 or r > ROWS or c < 1 or c > COLS then return false end
    return occ[(r - 1) * COLS + c] == true or board[r][c] ~= 0
  end
  -- 先认满行（消掉），再用「消行后的棋盘」算高度/洞/崎岖
  local keep = {}
  local complete = 0
  for r = 1, ROWS do
    local full = true
    for c = 1, COLS do
      if not solid(r, c) then
        full = false
        break
      end
    end
    if full then
      complete = complete + 1
    else
      keep[#keep + 1] = r
    end
  end
  local floorRows = #keep
  local function solidFinal(r, c)
    local src = keep[r]
    if not src then return false end
    return solid(src, c)
  end
  local heights = {}
  local agg, holes = 0, 0
  for c = 1, COLS do
    local h, seen = 0, false
    for r = 1, floorRows do            -- 从上往下扫：第一个实心格才是堆顶（从底扫会恒得 1）
      if solidFinal(r, c) then
        h = floorRows - r + 1
        break
      end
    end
    heights[c] = h
    agg = agg + h
    for r = 1, floorRows do
      if solidFinal(r, c) then
        seen = true
      elseif seen then
        holes = holes + 1
      end
    end
  end
  local bump = 0
  for c = 1, COLS - 1 do
    local d = heights[c] - heights[c + 1]
    if d < 0 then d = -d end
    bump = bump + d
  end
  -- 深井：只数"被两边夹住"的 1 列宽凹槽（墙边的空列不算井——竖 I 贴墙是允许且鼓励的）
  local wells = 0
  for c = 2, COLS - 1 do
    local nb = heights[c - 1]
    if heights[c + 1] < nb then nb = heights[c + 1] end
    local d = nb - heights[c]
    if d >= WELL_DEPTH then wells = wells + W_WELL * d end
  end
  -- 贴墙奖励：离最近墙的列距越小越好
  local wmax = 1
  for i = 1, 4 do
    if cells[i][2] > wmax then wmax = cells[i][2] end
  end
  local wallDist = x - 1
  local rightDist = COLS - (x + wmax - 1)
  if rightDist < wallDist then wallDist = rightDist end
  local top = 0
  for c = 1, COLS do
    if heights[c] > top then top = heights[c] end
  end
  return W_AGG * agg + W_LINE * complete + W_HOLE * holes + W_BUMP * bump
    - W_WALL * wallDist - wells, top, complete
end

-- 选位：4 朝向 × 每个合法列，三层优先级（能消行且不超高 > 不超高 > 清盘）；
-- 同分先取离墙更近的列（像人贴着边放），再取离当前列更近的，最后取更靠左的。
local function aiChoose()
  if not piece then return nil end
  local cands = {}
  local cells = piece.cells
  -- 旋转盒边长必须用 piece.n（O=2 / T,S,Z,J,L=3 / I=4），不能用 #cells（恒等于 4）
  local boxN = piece.n or 4
  for rot = 1, 4 do
    local wmax = 1
    for i = 1, 4 do
      if cells[i][2] > wmax then wmax = cells[i][2] end
    end
    for x = 1, COLS - wmax + 1 do
      local sc, h, complete = evalBoard(cells, x)
      if sc then
        local leftDist = x - 1
        local rightDist = COLS - (x + wmax - 1)
        local wallDist = leftDist
        if rightDist < wallDist then wallDist = rightDist end
        cands[#cands + 1] = {
          rot = rot, x = x, score = sc, h = h, clear = complete,
          wall = wallDist, from = math.abs(x - piece.x),
        }
      end
    end
    cells = rotateCells(cells, boxN)
  end
  if #cands == 0 then return nil end
  local function better(a, b)
    if not b then return true end
    if a.score > b.score + 1e-9 then return true end
    if a.score < b.score - 1e-9 then return false end
    if a.wall ~= b.wall then return a.wall < b.wall end     -- 同分贴墙
    if a.from ~= b.from then return a.from < b.from end     -- 再比离当前列
    return a.x < b.x                                        -- 再比靠左
  end
  local clearBest, safeBest
  for _, c in ipairs(cands) do
    if c.h <= AI_RESET_ROWS then
      if better(c, safeBest) then safeBest = c end
      if c.clear > 0 and better(c, clearBest) then clearBest = c end
    end
  end
  local best = clearBest or safeBest
  if not best then return { reset = true } end
  -- 竖 I 特别容易"立在中间"显得假 ⇒ 贴墙候选只要不比最优差 1.2 分就改放墙边
  -- （左右都能放时先比平不平，一样平则取左墙——用户口径"优先最左"）
  if piece.name == 'I' then
    local wallBest
    for _, c in ipairs(cands) do
      if c.h <= AI_RESET_ROWS and (c.x == 1 or c.x == COLS - 1) and c.score >= best.score - 1.2 then
        if not wallBest then
          wallBest = c
        elseif c.score > wallBest.score + 1e-9 then
          wallBest = c
        elseif math.abs(c.score - wallBest.score) <= 1e-9 then
          local a = math.min(c.x, COLS - c.x)
          local b = math.min(wallBest.x, COLS - wallBest.x)
          if a < b then wallBest = c end
        end
      end
    end
    if wallBest then best = wallBest end
  end
  -- 落点行（软降要按格数摊时间）
  local landingY = 1
  local probe = cells
  cells = piece.cells
  for _ = 1, best.rot - 1 do cells = rotateCells(cells, boxN) end
  probe = cells
  landingY = 1
  while landingY < ROWS and not collides(probe, best.x, landingY + 1) do landingY = landingY + 1 end
  return { rot = best.rot - 1, x = best.x, landingY = landingY }
end

-- 把方案编成"人手动作序列"（每步自带时长；随机化都在这里定下来，执行只按序列走）
-- 观察 0.25~0.7s（在 thinking 阶段已停）→ 旋转（0.15~0.25 + 间隔 0.1~0.2）→
-- 横移每次 1~2 格（间隔 0.08~0.25）→ 途中 35% 小落 1~2 格 → 到位 20% 回退一格再回来 →
-- 40% 再看一眼 0.2~0.4s
local function buildQueue(plan)
  local q = {}
  local totalCells = math.abs(plan.x - piece.x)
  local dir = 1
  if plan.x < piece.x then dir = -1 end
  for _ = 1, plan.rot do
    q[#q + 1] = { kind = 'rot', wait = aiRange(AI_ROT_MIN, AI_ROT_MAX) + aiRange(AI_ROTGAP_MIN, AI_ROTGAP_MAX) }
  end
  local remaining, moved, softRows = totalCells, 0, 0
  local softAt = nil
  if totalCells >= 3 and aiRand(100) <= 35 then softAt = aiRand(totalCells - 1) end
  while remaining > 0 do
    local step = aiRand(2)                       -- 1 或 2 格
    if step > remaining then step = remaining end
    local gap = aiRange(AI_MOVE_MIN, AI_MOVE_MAX)
    q[#q + 1] = { kind = 'move', cells = step, dir = dir, wait = gap, gap = gap }
    moved = moved + step
    remaining = remaining - step
    if softAt and softRows == 0 and moved >= softAt then
      softRows = aiRand(2)                       -- 小落 1~2 格（"看看落点再决定"）
      local per = aiRange(0.07, 0.12)
      q[#q + 1] = { kind = 'soft', rows = softRows, per = per, left = softRows, wait = softRows * per }
    end
  end
  if aiRand(100) <= 20 and totalCells > 0 then    -- 到位后犹豫：回退一格再移回来
    q[#q + 1] = { kind = 'move', cells = 1, dir = -dir, wait = aiRange(0.10, 0.20) }
    q[#q + 1] = { kind = 'move', cells = 1, dir = dir, wait = aiRange(0.08, 0.16) }
  end
  local hover = 0
  if aiRand(100) <= 40 then                       -- 落定前"再看一眼"
    hover = aiRange(AI_HOVER_MIN, AI_HOVER_MAX)
    q[#q + 1] = { kind = 'hover', wait = hover }
  end
  return q, { cells = totalCells, softRows = softRows, hover = hover, rot = plan.rot, landingY = plan.landingY }
end

-- 清盘重开（演示循环用）：不弹结算页，横幅与入场动画复位
local function demoLoopReset()
  autoDriving = true
  newGame()
  autoDriving = false
  introT, introFont, introPulse = 0, 26, 22
  setText(hint, '键盘操作')
  setText(topBanner, '俄罗斯方块')
  setText(botBanner, '按任意键开始')
  trySet(topBanner, 'fontColor', C_GOLD2)
  trySet(topBanner, 'fontSize', 26)
  trySet(botBanner, 'fontColor', C_ACCENT2)
  trySet(botBanner, 'fontSize', 22)
  AI.phase, AI.t, AI.queue, AI.qi, AI.piece, AI.dur = 'thinking', 0, nil, 1, nil, 0
  AI.wait = aiRange(AI_OBSERVE_MIN, AI_OBSERVE_MAX)
end

-- 硬降到底 + 落子；期间的日志与教学提示全部静音（autoDriving）
local function aiDrop()
  local guard = 0
  while guard < ROWS + 4 and not collides(piece.cells, piece.x, piece.y + 1) do
    piece.y = piece.y + 1
    guard = guard + 1
  end
  autoDriving = true
  local ok, err = pcall(doLock)
  autoDriving = false
  if not ok then
    print('demo lock error :: ' .. tostring(err))
    return
  end
  AI.count = AI.count + 1
  AI.sumSec = AI.sumSec + AI.dur
  -- 一块一条节奏日志：从这行能看出"确实分段执行了"
  local p = AI.pace or {}
  local gaps = p.gaps or 0
  local avgGap = 0
  if gaps > 0 then avgGap = (p.sumGap or 0) / gaps end
  print('demo pace think=' .. aiFmt(p.think or 0)
    .. ' rot=' .. (p.rot or 0)
    .. ' move=' .. (p.cells or 0) .. '*' .. aiFmt(avgGap)
    .. ' soft=' .. (p.soft or 0)
    .. ' hover=' .. aiFmt(p.hover or 0)
    .. ' drop=' .. tostring(p.drop or 'hard')
    .. ' total=' .. aiFmt(AI.dur))
  AI.dur = 0
  if AI.count % 10 == 0 then
    print('demo auto n=' .. AI.count .. ' avg=' .. aiFmt(AI.sumSec / AI.count)
      .. 's stack=' .. stackHeight())
  end
  local h = stackHeight()
  if gameOver or h >= AI_RESET_ROWS then
    print('demo reset stack=' .. h)
    demoLoopReset()
  end
end

AI = { phase = 'thinking', t = 0, wait = 0.5, queue = nil, qi = 1, piece = nil,
  count = 0, sumSec = 0, dur = 0, pace = nil, info = nil, softPer = 0.08, target = 2.2 }

-- 每个 OnUpdate 调一次：thinking（观察）→ acting（旋转/横移/小落，逐段计时）
-- → hovering（再看一眼，在 acting 队列里）→ dropping（软降逐格 或 硬降）→ 下一块
autoTick = function(dt)
  if guideStage ~= 0 then return end
  if gameOver then
    demoLoopReset()
    return
  end
  if not piece or not board then return end
  if AI.piece and AI.piece ~= piece then          -- 方块换了（清盘/重开）
    AI.phase, AI.t, AI.queue, AI.qi, AI.piece = 'thinking', 0, nil, 1, nil
    AI.wait = aiRange(AI_OBSERVE_MIN, AI_OBSERVE_MAX)
  end
  AI.t = AI.t + dt
  AI.dur = AI.dur + dt
  local ph = AI.phase
  local function nextAction()
    AI.qi = AI.qi + 1
    AI.t = 0
  end
  if ph == 'thinking' then
    -- 进入思考的**那一刻**就把方案与整段时长算好：这样才能把"观察"补到单块 >= 1.5s
    if not AI.queue then
      local plan = aiChoose()
      if plan and plan.reset then
        print('demo reset plan=too-high')
        demoLoopReset()
        return
      end
      if not plan then
        AI.wait = aiRange(AI_OBSERVE_MIN, AI_OBSERVE_MAX)
        AI.t = 0
        return
      end
      local q, info = buildQueue(plan)
      AI.queue, AI.info, AI.qi = q, info, 1
      AI.piece = piece
      AI.dur = 0
      local rest = 0
      for _, a in ipairs(q) do rest = rest + (a.wait or 0) end
      local target = aiRange(1.8, 3.2)
      AI.softPer = 0
      local dropKind = 'hard'
      if aiRand(100) <= 50 then dropKind = 'soft' end
      local rows = (info.landingY or piece.y) - piece.y
      if rows < 1 then rows = 1 end
      local dropTime = 0
      if dropKind == 'soft' then
        local per = (target - rest) / rows
        if per < AI_SOFT_MIN then per = AI_SOFT_MIN end
        if per > AI_SOFT_MAX then per = AI_SOFT_MAX end
        AI.softPer = per
        dropTime = rows * per
      end
      -- 观察时长 = 目标总时长 - 其余各段；夹在 0.25~1.2s（够长才像"人在看"）
      -- 兜底：软降 + 长距离 + 多动作会让整块超过 3.4s ⇒ 这一块改成硬降（人也常常直接按到底）
      if dropKind == 'soft' and (rest + dropTime + AI_OBSERVE_MIN) > 3.4 then
        dropKind, dropTime, AI.softPer = 'hard', 0, 0
      end
      local think = target - rest - dropTime
      if think < AI_OBSERVE_MIN then think = AI_OBSERVE_MIN end
      if think > 1.2 then think = 1.2 end
      AI.wait = think
      AI.t = 0
      AI.pace = { think = think, rot = info.rot, cells = info.cells,
        gaps = 0, sumGap = 0, soft = info.softRows, hover = info.hover, drop = dropKind }
      -- 计划日志：看到"这块是什么方块、打算放哪一列、软降还是硬降"
      print('demo plan name=' .. tostring(piece.name) .. ' from=' .. piece.x
        .. ' target=' .. plan.x .. ' rot=' .. plan.rot .. ' drop=' .. dropKind)
      return
    end
    if AI.t < AI.wait then return end
    AI.t = 0
    AI.phase = 'acting'
    return
  end
  if ph == 'acting' then
    local a = AI.queue and AI.queue[AI.qi]
    if not a then
      -- 序列走完：软降 / 硬降
      AI.phase, AI.t = 'dropping', 0
      AI.dropped = 0
      AI.fallTimer = 0
      if AI.pace.drop == 'soft' then
        AI.nudge = (aiRand(100) <= 30)        -- 软降途中 30% 顺手横调 1 格
        AI.nudgeAt = aiRand(3)
      end
      print('demo act drop=' .. AI.pace.drop)
      return
    end
    if a.kind == 'rot' then
      if not a.done then
        a.done = true
        local nc = rotateCells(piece.cells, piece.n)
        if not collides(nc, piece.x, piece.y) then
          piece.cells = nc
          renderPiece()
        end
        print('demo act rot x=' .. piece.x)
      end
      if AI.t >= a.wait then nextAction() end
      return
    end
    if a.kind == 'move' then
      if not a.done then
        a.done = true
        for _ = 1, a.cells do
          if not collides(piece.cells, piece.x + a.dir, piece.y) then
            piece.x = piece.x + a.dir
          end
        end
        renderPiece()
        AI.pace.gaps = AI.pace.gaps + 1
        AI.pace.sumGap = AI.pace.sumGap + (a.gap or 0)
        print('demo act move x=' .. piece.x)
      end
      if AI.t >= a.wait then nextAction() end
      return
    end
    if a.kind == 'soft' then
      -- 用倒计时而不是绝对时刻：AI.t 会在每次 nextAction 归零，绝对时刻会变成"等很久"
      if not a.done then
        a.done = true
        a.timer = 0
      end
      if a.left > 0 then
        a.timer = (a.timer or 0) - dt
        if a.timer <= 0 then
          a.timer = a.per
          if not collides(piece.cells, piece.x, piece.y + 1) then
            piece.y = piece.y + 1
            renderPiece()
          end
          a.left = a.left - 1
          if a.left == 0 then print('demo act soft y=' .. piece.y) end
        end
        return
      end
      a.timer = (a.timer or 0) - dt
      if a.timer <= 0 then nextAction() end
      return
    end
    if a.kind == 'hover' then
      if not a.done then a.done = true print('demo act hover ' .. aiFmt(a.wait)) end
      if AI.t >= a.wait then nextAction() end
      return
    end
  end
  if ph == 'dropping' then
    if AI.pace.drop == 'soft' then
      local canFall = not collides(piece.cells, piece.x, piece.y + 1)
      if canFall then
        AI.fallTimer = (AI.fallTimer or 0) - dt
        if AI.fallTimer <= 0 then
          AI.fallTimer = AI.softPer
          piece.y = piece.y + 1
          AI.dropped = (AI.dropped or 0) + 1
          if AI.nudge and AI.dropped == AI.nudgeAt then
            local d = 1
            if piece.x > COLS / 2 then d = -1 end
            if not collides(piece.cells, piece.x + d, piece.y) then
              piece.x = piece.x + d
              print('demo act nudge x=' .. piece.x)
            end
          end
          renderPiece()
        end
      end
      if not canFall then
        -- 落地后若这块太快（< 1.5s），落定前再停一下（像人抬手前确认一下）
        if AI.dur < AI_PIECE_MIN then return end
        aiDrop()
        AI.phase, AI.queue, AI.qi, AI.piece = 'thinking', nil, 1, nil
        AI.t, AI.wait = 0, aiRange(AI_OBSERVE_MIN, AI_OBSERVE_MAX)
      end
      return
    end
    if AI.dur < AI_PIECE_MIN then return end     -- 太快就再停一下（同软降）
    aiDrop()                                     -- 硬降
    AI.phase, AI.queue, AI.qi, AI.piece = 'thinking', nil, 1, nil
    AI.t, AI.wait = 0, aiRange(AI_OBSERVE_MIN, AI_OBSERVE_MAX)
  end
end

--------------------------------------------------------------------------------
-- 布局：按画布尺寸算三栏 + 上下横幅（换设备不用重新导入）
--------------------------------------------------------------------------------

-- 结算层几何（懒创建：层在 gameOver 那一刻才建，所以建完要立刻用它摆位）
-- 框高仍按 h >= fontSize*1.45+4：标题 44（脉冲到 48 ⇒ 需 73.6）⇒ 给 80；30→52；24→44；22→40；28→48。
layoutSettle = function(W, H)
  local halfH = H / 2
  local function place2(ctl, x, y, w, h)
    if not ctl then return end
    tryCall(ctl, 'SetSizeDelta', w, h)
    tryCall(ctl, 'SetAnchoredPosition', x, y)
  end
  local cw = W - 240
  if cw > 780 then cw = 780 end
  local ch = 400
  place2(settleScrim, 0, 0, W + 60, H + 60)        -- 全屏遮罩
  place2(settleBorder, 0, 0, cw + 8, ch + 8)       -- 强调色描边
  place2(settleCard, 0, 0, cw, ch)                 -- 面板底
  settleTitleY, settleOptsY = 140, -136
  settleTitleOff, settleOptsOff = halfH + 80, -(halfH + 80)
  place2(settleTitle, 0, settleTitleY, cw - 60, 80)
  place2(settleScore, 0, 72, cw - 60, 52)
  place2(settleBest, 0, 20, cw - 60, 44)
  place2(settleInfo, 0, -28, cw - 60, 40)
  place2(settleExtra, 0, -66, cw - 60, 40)
  place2(settleOpts, 0, settleOptsY, cw - 60, 48)
end

local function layout(W, H)
  CANVAS_W, CANVAS_H = W, H
  local halfW, halfH = W / 2, H / 2
  local panelW = 420
  local leftCX, rightCX = -(halfW - panelW / 2 - 20), halfW - panelW / 2 - 20
  RIGHT_CX = rightCX
  local function place(ctl, x, y, w, h)
    if not ctl then return end
    tryCall(ctl, 'SetSizeDelta', w, h)
    tryCall(ctl, 'SetAnchoredPosition', x, y)
  end
  -- 框高硬判据（渲染器实测）：h >= fontSize*1.45 + 4 才画这一行，否则整行静默不画。
  -- 64 号 -> >=96.8（h=96 曾整块消失）、34 -> >=53.3、26 -> >=41.7、22 -> >=35.9。
  -- 左栏：标题/统计/最高/提示 作为一个整组垂直居中（贴顶贴底会显得散）
  place(title, leftCX, 130, panelW, 100)             -- 64 号
  place(hud, leftCX, 40, panelW + 40, 40)            -- 20 号：22 号时尾部一个字被裁，实测
  place(best, leftCX, -10, panelW, 36)               -- 20 号
  place(hint, leftCX, -95, panelW, 150)              -- 22 号
  place(hudNext, rightCX, halfH - 150, 200, 40)      -- 22 号
  place(keyA, rightCX, -40, panelW, 38)              -- 22 号
  place(keyB, rightCX, -80, panelW, 38)              -- 22 号
  place(keyC, rightCX, -120, panelW, 38)             -- 22 号
  for _, b in ipairs(BUTTONS) do
    local ctl = find(b.name)
    if ctl then
      if isMobile then
        place(ctl, b.x, b.y, BTN_W, BTN_H)
        tryCall(ctl, 'SetVisible', true)
      else
        tryCall(ctl, 'SetVisible', false)   -- PC 端不展示移动按钮
      end
    end
  end
  applyStyle('title', title) applyStyle('hud', hud) applyStyle('hudNext', hudNext)
  applyStyle('best', best) applyStyle('hint', hint)
  applyStyle('keyA', keyA) applyStyle('keyB', keyB) applyStyle('keyC', keyC)
  applyStyle('topBanner', topBanner) applyStyle('botBanner', botBanner)
  for _, b in ipairs(BUTTONS) do applyStyle(b.name, find(b.name)) end
  -- 横幅框高按判据算「同时装得下的最大字号」：入场标题会长到 40、结算大字 40（都需 62）
  -- ⇒ topBanner 给 64；旧实现 56 高，标题长过 35 号就整行静默消失（实测）。
  -- 纵向位置：框 64 居中在屏幕上 4..68 那条带子里（棋盘顶框在 59，40 号墨迹 16..56 不压框）
  place(topBanner, 0, halfH - 36, W - 180, 64)
  -- 底行：结算 26 号（需 41.7）、入场呼吸 22~23 号 ⇒ 给 48
  place(botBanner, 0, -(halfH - 28), W - 180, 48)

  if settleReady then layoutSettle(W, H) end
end

--------------------------------------------------------------------------------
-- 生命周期
--------------------------------------------------------------------------------

function OnStart()
  root = script.object
  if not root then error('tetris: script.object is nil') end
  root.showCursor = true
  script:EnableUpdate(true)      -- 默认 false：不显式打开就不会派发 OnUpdate

  local W, H = game.GetUICanvasSize()
  print('canvas ' .. tostring(W) .. 'x' .. tostring(H))

  -- 平台：移动/触屏才显示可点按钮（PC 端键位卡够了）
  local isMobile = true
  do
    local okDev, dev = pcall(function() return game.GetDevice() end)
    if okDev and type(Enum) == 'table' and Enum.Device then
      isMobile = (dev == Enum.Device.Mobile or dev == Enum.Device.MobileController)
      print('device=' .. tostring(dev) .. ' mobile=' .. tostring(isMobile))
    else
      print('device=unknown（按移动端处理，按钮可见）')
    end
  end

  -- 模板 guid 探测（双宿主）：先 cell（image，无光标事件）再 hit（cursor，有光标事件）
  local firstCell, tplGuid = probeTemplate(TPL_GUIDS.cell, false)
  if not firstCell then
    error('tetris: cell 模板 guid 都不可用，候选=' .. #TPL_GUIDS.cell
      .. '（导入后跑 node qxqy/deploy.mjs --calibrate）')
  end
  print('tpl guid=' .. tplGuid)

  cells = {}
  for i = 1, COLS * ROWS do
    local c = firstCell
    firstCell = nil
    if not c then c = game.InstantiateClientUIControl(tplGuid, root) end
    if not c then error('tetris: InstantiateClientUIControl failed at ' .. i) end
    local col = (i - 1) % COLS
    local row = (i - 1) // COLS
    c.name = 'cell' .. i
    c:SetSizeDelta(CELL, CELL)
    c:SetAnchoredPosition((col - 4.5) * PITCH, (9.5 - row) * PITCH)
    c.imageColor = COL_EMPTY
    cells[i] = c
  end
  print('cellCount=' .. #cells)

  -- 棋盘外框：4 条细长实例（后建 ⇒ 在棋格之上），给棋盘一个清晰边界
  local FRAME_COL = C(255, 76, 194, 255)
  local boardEdgeW = 4.5 * PITCH + CELL / 2      -- 149
  frames = {}
  -- 四条框线与棋盘边缘对齐：竖线高 / 横线宽都取「框到框」的跨度，否则四角会伸出约 16px（实测）
  local frameX = boardEdgeW + 1                      -- 150
  local frameY = 9.5 * PITCH + CELL / 2 + 1          -- 300
  local specs = {
    { -frameX, 0, 2, 2 * frameY + 2 },               -- 左
    { frameX, 0, 2, 2 * frameY + 2 },                -- 右
    { 0, frameY, 2 * frameX + 2, 2 },                -- 上
    { 0, -frameY, 2 * frameX + 2, 2 },               -- 下
  }
  for i = 1, #specs do
    local fr = game.InstantiateClientUIControl(tplGuid, root)
    if fr then
      local sp = specs[i]
      fr.name = 'frame' .. i
      fr:SetSizeDelta(sp[3], sp[4])
      fr:SetAnchoredPosition(sp[1], sp[2])
      fr.imageColor = FRAME_COL
    end
    frames[i] = fr
  end

  -- 结算不用中间遮罩：运行时实例的层级高于服务端文字，遮罩会把结算文字盖掉（实测）
  -- 改为「棋盘暗场 + 顶部/底部大字」，文字始终在棋盘之外，不会被遮挡
  overlay = nil

  -- NEXT 预览四格（同一模板，缩到 18px）
  preview = {}
  for i = 1, 4 do
    local c = game.InstantiateClientUIControl(tplGuid, root)
    if c then
      c.name = 'next' .. i
      c:SetSizeDelta(18, 18)
      c:SetAnchoredPosition(400, 175)
      c.imageColor = COL_BG
    end
    preview[i] = c
  end

  -- 结算层**不在 OnStart 建**（2026-10-25 真机：常驻 + SetVisible(false) 不保险 ⇒ 开局白屏、
  -- 重开后结算页残留）。改成第一次 gameOver 时懒创建，重开即销毁 —— 见 showGameOver / newGame。

  title, hud, hudNext, best = find('title'), find('hud'), find('hudNext'), find('best')
  hint, keyA, keyB, keyC = find('hint'), find('keyA'), find('keyB'), find('keyC')
  topBanner, botBanner = find('topBanner'), find('botBanner')
  local okLayout, errLayout = pcall(layout, W, H)
  if not okLayout then print('layout error :: ' .. tostring(errLayout)) end

  -- 引导初始态：等玩家按第一个键（重力暂停，画面静止好读）
  guideStage, bannerTimer, taughtLock, taughtClear = 0, 0, false, false
  flashT, introT, introFont, introPulse = 0, 0, 24, 22   -- introFont/Pulse = 上次写进控件的值（变了才写）
  bestScore = 0
  setText(title, '')
  for _, c in ipairs({ hud, best, hint, keyA, keyB, keyC }) do tryCall(c, 'SetVisible', false) end
  tryCall(title, 'SetVisible', false)
  setText(hint, '键盘操作')
  setText(topBanner, '俄罗斯方块')
  setText(botBanner, '按任意键开始')

  -- 按键注册一律 pcall：真机上某个键名可能不存在，抛错会整段 OnStart 中断（2026-10-24 首轮实证）
  -- 真机要求 KeyEventType **枚举值**（传字符串报 bad argument #2: KeyEventType expected, got string，
  -- 2026-10-24 日志实证）；模拟器接受字符串。两种都试：先枚举，失败回落字符串。
  local enumKeys = (type(Enum) == 'table' and Enum.KeyEventType) or nil
  local function listen(name, fn)
    local ok, err, how
    if enumKeys and enumKeys[name] ~= nil then
      ok, err = pcall(function() root:AddKeyEventListener(enumKeys[name], fn) end)
      how = 'enum'
    end
    if not ok then
      ok, err = pcall(function() root:AddKeyEventListener(name, fn) end)
      how = 'string'
    end
    if ok then
      print('listen ok ' .. name .. ' via ' .. how)
    else
      print('listen fail ' .. name .. ' :: ' .. tostring(err))
    end
  end

  -- 每个动作前先 startIfWaiting()：入场态按的第一个键既开始游戏也执行该动作
  -- （不吞键，用例与手感一致）；stage 2 键位表期间除 H/R 外全部忽略。
  local function act(fn)
    return function()
      startIfWaiting()
      if guideStage == 2 then return end
      fn()
    end
  end

  listen('KeyboardCraftspersonKey38Down', act(function()   -- ←
    if gameOver or not piece then return end
    if not collides(piece.cells, piece.x - 1, piece.y) then
      piece.x = piece.x - 1
      renderPiece()
      print('move x=' .. piece.x)
    end
  end))
  listen('KeyboardCraftspersonKey39Down', act(function()   -- →
    if gameOver or not piece then return end
    if not collides(piece.cells, piece.x + 1, piece.y) then
      piece.x = piece.x + 1
      renderPiece()
      print('move x=' .. piece.x)
    end
  end))
  listen('KeyboardCraftspersonKey36Down', act(rotate))     -- ↑
  listen('KeyboardCraftspersonKey37Down', act(stepDown))   -- ↓
  listen('KeyboardJumpKeyDown', act(function()             -- Space
    if gameOver or not piece then return end
    local dropped = 0
    while not collides(piece.cells, piece.x, piece.y + 1) do
      piece.y = piece.y + 1
      dropped = dropped + 1
    end
    print('harddrop rows=' .. dropped .. ' y=' .. piece.y)
    doLock()
  end))
  -- WASD（真机常用；具名键 MoveLeft/Right/Forward/Backward）
  listen('KeyboardMoveLeftKeyDown', act(function()          -- A
    if gameOver or not piece then return end
    if not collides(piece.cells, piece.x - 1, piece.y) then
      piece.x = piece.x - 1
      renderPiece()
      print('move x=' .. piece.x)
    end
  end))
  listen('KeyboardMoveRightKeyDown', act(function()         -- D
    if gameOver or not piece then return end
    if not collides(piece.cells, piece.x + 1, piece.y) then
      piece.x = piece.x + 1
      renderPiece()
      print('move x=' .. piece.x)
    end
  end))
  listen('KeyboardMoveForwardKeyDown', act(rotate))         -- W
  listen('KeyboardMoveBackwardKeyDown', act(stepDown))      -- S
  listen('KeyboardCharacterSkill3KeyDown', function()       -- R 重开（键位表态也允许）
    startIfWaiting()
    if guideStage == 2 then guideStage = 1 setText(hint, '') end
    settleDestroy()          -- 双保险：newGame 里还会再调一次（幂等），保证 R 一定销毁结算层
    newGame()
    setText(topBanner, '')
    setText(botBanner, '')
    if overlay then tryCall(overlay, 'SetVisible', false) end
    -- 结算态改过横幅字号/颜色，重开必须还原：几何与样式只认 layout 这一份
    local okRelayout, errRelayout = pcall(layout, W, H)
    if not okRelayout then print('relayout error :: ' .. tostring(errRelayout)) end
  end)
  -- Q：结算明细（结算态才有意义）。明细走左栏 hint（棋盘外，不会被实例格子盖住）
  listen('KeyboardCharacterSkill2KeyDown', function()
    startIfWaiting()
    if not gameOver then return end
    settleOpen = not settleOpen
    local mins = math.floor(elapsed / 60)
    local secs = math.floor(elapsed % 60)
    local rate = 0
    if pieceCount > 0 then rate = math.floor(lines * 100 / pieceCount) end
    local detail = '等级 ' .. level .. '　用时 ' .. mins .. ':' .. string.format('%02d', secs)
      .. '　消行率 ' .. rate .. '%'
    if settleOpen then
      if settleReady then
        setText(settleExtra, detail)
        tryCall(settleExtra, 'SetVisible', true)
      else
        setText(hint, '本局落块 ' .. pieceCount .. '　消行 ' .. lines .. '　最高 ' .. bestScore)
      end
      print('settle detail on')
    else
      if settleReady then
        setText(settleExtra, '')
        tryCall(settleExtra, 'SetVisible', false)
      else
        setText(hint, '')
      end
      print('settle detail off')
    end
  end)
  listen('KeyboardCharacterSkill1KeyDown', function()       -- H 键位表
    startIfWaiting()
    toggleKeymap()
  end)
  -- T：调试填满最底两行（不消行）。消行必须走真实路径——下一次锁定（硬降/落地）时
  -- 由 doLock -> clearLines 处理，用例 04 因此覆盖的是真实消行链路而不是调试旁路。
  listen('KeyboardCharacterSkill4KeyDown', act(function()
    for rr = ROWS - 1, ROWS do
      for c = 1, COLS do board[rr][c] = COL_BLUE end
    end
    print('debug-fill')
    renderAll()
    renderHud()
  end))

  -- 手机按钮热区：优先用布局里已存在的光标检测区（gsts assets:ui create 建档，无需导入）；
  -- 取不到时退化为客户端 cursor 模板实例（老路线）。
  local function hitOf(name)
    local c = find(name .. 'hit')
    if c then return c end
    return nil
  end
  local anyHit = hitOf(BUTTONS[1].name)
  local firstHit, hitGuid
  if not anyHit then
    firstHit, hitGuid = probeTemplate(TPL_GUIDS.hit, true)
  end
  if anyHit or firstHit then
    if hitGuid then print('hit guid=' .. hitGuid) else print('hit source=layout') end
    local cursorDown = (type(Enum) == 'table' and Enum.CursorEventType
      and Enum.CursorEventType.CursorDown) or nil
    local actions = {
      btnA = function() if guideStage ~= 2 and not gameOver and piece
        and not collides(piece.cells, piece.x - 1, piece.y) then
        piece.x = piece.x - 1 renderPiece() print('move x=' .. piece.x) end end,
      btnB = function() if guideStage ~= 2 and not gameOver and piece
        and not collides(piece.cells, piece.x + 1, piece.y) then
        piece.x = piece.x + 1 renderPiece() print('move x=' .. piece.x) end end,
      btnC = function() if guideStage ~= 2 then stepDown() end end,
      btnD = function() if guideStage ~= 2 then rotate() end end,
      btnE = function()
        if guideStage == 2 or gameOver or not piece then return end
        while not collides(piece.cells, piece.x, piece.y + 1) do piece.y = piece.y + 1 end
        print('touchdrop y=' .. piece.y)
        doLock()
      end,
      btnF = function()
        if guideStage == 2 then guideStage = 1 setText(hint, '') end
        newGame()
        setText(topBanner, '') setText(botBanner, '')
      end,
    }
    for i, b in ipairs(BUTTONS) do
      local h = hitOf(b.name)
      if not h then
        h = firstHit
        firstHit = nil
        if not h then h = game.InstantiateClientUIControl(hitGuid, root) end
      end
      if h then
        h.name = b.name .. 'hit'
        if h.name ~= b.name .. 'hit' then
          h:SetSizeDelta(BTN_W, BTN_H)
          h:SetAnchoredPosition(b.x, b.y)
        end
        local act = actions[b.name]
        local okReg = pcall(function() h:AddCursorEventListener(cursorDown, function()
          startIfWaiting()
          if act then act() end
        end) end)
        if not okReg then print('hit listen fail ' .. b.name) end
        hits[i] = h
      end
    end
    print('hits=' .. #hits)
  else
    print('hits=0 click disabled（真机导入后跑 node qxqy/deploy.mjs --calibrate）')
  end

  -- 入场态兜底：43 个可编程键位里凡是没被上面映射的，都只做"开始游戏"这一件事
  local mapped = { [36] = true, [37] = true, [38] = true, [39] = true }
  local anyKeyStart = function()
    if guideStage == 0 then startIfWaiting() end
  end
  for i = 1, 43 do
    if not mapped[i] then
      listen('KeyboardCraftspersonKey' .. i .. 'Down', anyKeyStart)
    end
  end

  -- 先开局：即使某个键名注册失败，棋盘与重力也应正常跑（入场态暂停重力）
  local okNew, errNew = pcall(newGame)
  if not okNew then print('newGame error :: ' .. tostring(errNew)) end
end


function OnUpdate(dt)
  local d = tonumber(dt) or 0
  if d <= 0 then return end
  if bannerTimer > 0 and not gameOver then
    bannerTimer = bannerTimer - d
    if bannerTimer <= 0 then
      bannerTimer = 0
      setText(botBanner, '')
      setText(hint, '')
    end
  end
  if flashT > 0 then
    flashT = flashT - d
    if flashT <= 0 then flashT = 0 renderAll() end
  end
  if gameOver then settleTick(d) end          -- 结算层四段动画（0→0.9s）
  if guideStage == 1 and not gameOver then elapsed = elapsed + d end
  if guideStage == 0 then
    -- 入场演出：标题 26→40 渐大 + 底部提示呼吸（框高 72 按 46 号算过，40 号不会被裁）
    introT = introT + d
    local size = math.min(40, 26 + math.floor(introT * 12))
    if size ~= introFont then
      introFont = size
      trySet(topBanner, 'fontSize', size)
    end
    local pulse = 22 + math.floor(2 * (0.5 + 0.5 * math.sin(introT * 5)))
    if pulse ~= introPulse then
      introPulse = pulse
      trySet(botBanner, 'fontSize', pulse)
    end
    autoTick(d)   -- AI 自演：选位→旋转→逐格横移→硬降→消行→下一块，玩家按键即交还控制
    return
  end
  if guideStage ~= 1 then return end   -- 等待开始 / 键位表 都不跑重力
  acc = acc + d
  local guard = 0
  while acc >= STEP and guard < 8 do
    acc = acc - STEP
    guard = guard + 1
    tickCount = tickCount + 1
    if not gameOver and tickCount % GRAVITY_TICKS == 0 then
      stepDown()   -- 判负在 spawn -> showGameOver 里收口
    end
  end
end

function OnDestroy() end
