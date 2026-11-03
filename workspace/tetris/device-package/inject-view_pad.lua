--[[==========================================================================
 tetris/view_pad.lua —— 移动端触控面板的**纯描述**（state → node 列表，零引擎调用）
 ----------------------------------------------------------------------------
 为什么要有这个文件：
   触屏键位原来是「声明（config.NUM.PHONE）+ 几何（ui.lua planMobile 现算）+ 落地
   （ui.lua makeBtn 里 4 次 InstantiateClientUIControl）」三处拼出来的，于是
   「按钮画得漂亮但点不到」「两颗键视觉重叠」「标题页漏出游戏键」这类问题只能开模拟器
   出图 + 人眼。这里把**同一份槽位数据**算成 render.lua 认的节点描述：

     node = { key, layer='touch', tpl, name, pos, size, color/text/font/fcolor,
              align, valign, cursor={'Click'}, on={Click=fn}, seq }

   渲染由 render.lua 负责（层序 = layer 号 = view_layers L.touch = 70，永远压在面板之上），
   所以这份描述在 lua5.3 headless 里就能被 view_node.lint 检（越界/重叠/文字放不下/层号过低）。

 数值**全部照抄**现有实现，不许重新设计（重构纪律：观感不变，只换落地通道）：
   · 尺寸/标签/动作：config.NUM.PHONE（SIDE_W/SIDE_H=120×72、SKILL=100×58、NAV=116×56、
     ACT=208×64，items/nav/actions 三条声明表，config.lua:759-791）
   · 几何公式：ui.lua planMobile 的单盘/双盘/结算/说明四支（ui.lua:302-398、461-473、450-453），
     连注释里的间距理由一并保留（144/92 净距、底边留 6px、避开底部名卡…）
   · 颜色：config.NUM.UI_COL（btnBg/btnEdge/btnText，config.lua:741-752）+ UI_KIT.EDGE=2
   · 服务端旧按钮 btnA..btnF 的几何在 M.LEGACY 里留档（qxqy/build.mjs:124-125），
     它们已退役（main.lua layout() 里 SetVisible(false)+挪出画布）——留档是为了防止
     "又照着旧坐标新建一套"，测试会拿 build.mjs 原文逐值核对。

 触屏动作 = **同一套动作名**（input_map.ACTIONS 的子集 + 一个触屏专属 helpPage）：
   手机上点「旋转」派发 action='rot'，与键盘 36 键进同一条动作链，不另起第二套语义。
   `phone tap <id>` 这条日志是既有用例契约（tests/08、44、61），由接线方在 onAction 里打
   （本模块不 print）。

 契约：Lua 5.3；不 require 任何 tetris 模块（config 由 spec 注入）；不 print；
       不调用引擎 API；chunk 顶层不建控件（只有表与函数）。
 验证：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/input_map_test.lua
 ========================================================================]]

local M = {}

-- NUM.PHONE 的 act → 本工程的**规范动作名**（input_map.ACTIONS 的键）。
-- 说明：'switch' 归一到 skillSwitch、'closeHelp' 与说明键同义、'home' 归一到 back（= V）、
--       'detail' 归一到 settle（= Q）；'page' 没有键盘对应键 ⇒ 触屏专属 helpPage。
M.ACT = {
  left = 'left', right = 'right', rot = 'rot', soft = 'soft', hard = 'hard', hold = 'hold',
  skill1 = 'skill1', skill2 = 'skill2', switch = 'skillSwitch',
  help = 'help', closeHelp = 'help', roster = 'roster', closeRoster = 'roster',
  home = 'back', page = 'helpPage',
  restart = 'restart', detail = 'settle',
}

-- 服务端旧按钮（v4.0，已退役）：qxqy/build.mjs:124-125 原文逐值留档。
-- 真机上它们是**服务端 textbox**（永远在运行时实例之下），退役原因是触屏键位改由
-- 客户端实例层承载（NUM.PHONE + ui.lua），这里只作历史坐标的证据，不参与渲染。
M.LEGACY = {
  { id = 'btnA', label = '←',     x = -410, y = -185, w = 150, h = 56 },
  { id = 'btnB', label = '→',     x = -410, y = -250, w = 150, h = 56 },
  { id = 'btnC', label = '↓',     x = -410, y = -315, w = 150, h = 56 },
  { id = 'btnD', label = '旋转',  x = 410,  y = -185, w = 150, h = 56 },
  { id = 'btnE', label = '直落',  x = 410,  y = -250, w = 150, h = 56 },
  { id = 'btnF', label = '重开',  x = 410,  y = -315, w = 150, h = 56 },
}

M.new = function(spec)
  spec = spec or {}
  local cfg = spec.config
  if not cfg then error('view_pad: 需要 spec.config（config.lua）') end
  local NUM = cfg.NUM or {}
  local PH = NUM.PHONE or {}
  local KIT = NUM.UI_KIT or {}
  local UCOL = NUM.UI_COL or {}

  local EDGE = KIT.EDGE or 2
  local FS = KIT.FS or 22
  local MARGIN = KIT.MARGIN or 18

  local PAD = { screens = { 'title', 'game', 'settle', 'help', 'roster' } }

  -- ===== ① 槽位（纯几何 + 语义；不涉及控件）=====
  -- 返回 {{ id, group, label, act, action, x, y, w, h, fs, key? }, ...}
  -- group：'' = 拇指簇 / 'n' = 导航 / 'a' = 结算行动键（与 ui.lua makeBtn 的分组前缀一致）
  function PAD.slots(screen, canvas, dual, mobile)
    screen = screen or 'game'
    canvas = canvas or { 1280, 720 }
    if mobile == false then return {} end   -- PC：不建触屏键（ui.lua planPC 的 slots 恒空）
    local W, H = canvas[1] or 1280, canvas[2] or 720
    local halfW, halfH = W / 2, H / 2
    -- ui.lua bands(W,H) 原式（ui.lua:258-271）
    local colL = -(halfW + 160) / 2
    local colR = (halfW + 160) / 2
    local botY = -(halfH - 30)
    local pad = MARGIN
    local bw, bh = PH.SIDE_W or 120, PH.SIDE_H or 72
    local sw, sh = PH.SKILL_W or 100, PH.SKILL_H or 58
    local nw, nh = PH.NAV_W or 116, PH.NAV_H or 56
    local aw, ah = PH.ACT_W or 208, PH.ACT_H or 64

    -- 标签/动作查表（唯一数据源 = config.NUM.PHONE）
    local info = {}
    for _, it in ipairs(PH.items or {}) do
      info[it.id] = { label = it.label, act = it.act, rep = it.rep, group = '' }
    end
    for _, it in ipairs(PH.nav or {}) do
      info[it.id] = { label = it.label, act = it.act, group = 'n' }
    end
    for _, it in ipairs(PH.actions or {}) do
      info[it.id] = { label = it.label, act = it.act, group = 'a', key = it.key, rank = it.rank }
    end

    local order, geom = {}, {}
    local function slot(id, x, y, w, h, fs)
      order[#order + 1] = id
      geom[id] = { x = x, y = y, w = w, h = h, fs = fs or FS }
    end

    if screen == 'title' or screen == 'roster' then
      return {}                            -- 标题页/角色页不出游戏键（ui.lua:426、480）
    elseif screen == 'help' then
      -- ui.lua:450-453：翻页/回标题放左下角（避开右上角「合上」与底部展台 H 热区）
      slot('page', -halfW + pad + nw / 2, -(halfH - pad - nh / 2), nw, nh)
      slot('home', -halfW + pad + nw / 2, -(halfH - pad - nh / 2) + 70, nw, nh)
    elseif screen == 'settle' then
      -- ui.lua:461-473：三颗行动键贴底；rank1 = 主按钮 ×1.35 尺寸（此处沿用 ×1.15 宽度现值）
      local y = -(halfH - pad - ah / 2)
      slot('again', 0, y + 90, aw * 1.15, ah, FS + 2)
      slot('home', -(aw * 0.62), y, aw, ah)
      slot('detail', (aw * 0.62), y, aw, ah)
    elseif dual then
      -- ui.lua:349-397：双盘侧栏只剩 206px ⇒ 拇指簇竖排、技能行放中缝列
      local gutL, gutR = -(halfW - 103), halfW - 103
      local col0 = botY + 6                -- 底边留 6px（首版 -330 出画布，审计抓到 oob）
      slot('left', gutL, col0, bw, bh)
      slot('right', gutL, col0 + 86, bw, bh)
      slot('rot', gutL, col0 + 172, bw, bh)
      slot('hard', gutR, col0, bw, bh)
      slot('soft', gutR, col0 + 86, bw, bh)
      slot('hold', gutR, col0 + 172, bw, bh)
      slot('skill1', 0, 150, sw, sh)
      slot('skill2', 0, 80, sw, sh)
      slot('switch', 0, 10, sw, sh)
      slot('help', halfW - pad - nw / 2, halfH - pad - nh / 2, nw, nh)
      slot('roster', -halfW + pad + nw / 2, halfH - pad - nh / 2, nw, nh)
    else
      -- ui.lua:302-327：单盘拇指簇（左右各两排，144/92 净距；技能三键右列竖排避开底部名卡）
      slot('left', colL - 72, botY + 30, bw, bh)
      slot('right', colL + 72, botY + 30, bw, bh)
      slot('rot', colL - 72, botY + 122, bw, bh)
      slot('hold2', colL + 72, botY + 122, bw, bh)
      slot('hard', colR + 72, botY + 30, bw, bh)
      slot('soft', colR - 72, botY + 30, bw, bh)
      slot('hold', colR - 72, botY + 122, bw, bh)
      slot('rot2', colR + 72, botY + 122, bw, bh)
      slot('skill1', colR, 60, sw, sh)
      slot('skill2', colR, -10, sw, sh)
      slot('switch', colR, -80, sw, sh)
      slot('help', halfW - pad - nw / 2, halfH - pad - nh / 2, nw, nh)
      slot('roster', -halfW + pad + nw / 2, halfH - pad - nh / 2, nw, nh)
    end

    local out = {}
    for i = 1, #order do
      local id = order[i]
      local g = geom[id]
      local meta = info[id] or { label = id, act = id, group = '' }
      out[#out + 1] = {
        id = id, group = meta.group or '', label = meta.label or id,
        act = meta.act, action = M.ACT[meta.act] or meta.act,
        x = g.x, y = g.y, w = g.w, h = g.h, fs = g.fs,
        rep = meta.rep, key = meta.key, rank = meta.rank,
      }
    end
    return out
  end

  -- ===== ② 节点描述（render.lua 的输入）=====
  -- opts = { screen, canvas={W,H}, dual, mobile, onAction=fn(action,id), colors={bg,edge,text} }
  -- 每个按钮 4 个节点：描边（外扩 EDGE）+ 底胶囊 + 文字 + 热区。
  -- **热区最后建**（同层内按 seq 落序，后建在上）⇒ 命中优先，且不会被自己的文字挡住。
  function PAD.pad(opts)
    opts = opts or {}
    local slots = PAD.slots(opts.screen or 'game', opts.canvas, opts.dual, opts.mobile)
    local colors = opts.colors or {}
    local bg = colors.bg or UCOL.btnBg
    local edge = colors.edge or UCOL.btnEdge
    local ink = colors.text or UCOL.btnText
    local onAction = opts.onAction
    local nodes = {}
    local seq = 0
    local function nextSeq() seq = seq + 1 return seq end
    for i = 1, #slots do
      local s = slots[i]
      local gp = s.group or ''
      local gk = (gp == '') and 'thumb' or (gp == 'n' and 'nav' or 'act')
      local base = 'pad.' .. gk .. '.' .. s.id
      nodes[#nodes + 1] = {
        key = base .. '.edge', layer = 'touch', tpl = 'cell',
        name = 'pe' .. gp .. s.id, pos = { s.x, s.y },
        size = { s.w + EDGE * 2, s.h + EDGE * 2 }, color = edge, seq = nextSeq(),
      }
      nodes[#nodes + 1] = {
        key = base .. '.bg', layer = 'touch', tpl = 'cell',
        name = 'pb' .. gp .. s.id, pos = { s.x, s.y },
        size = { s.w, s.h }, color = bg, seq = nextSeq(),
      }
      nodes[#nodes + 1] = {
        key = base .. '.txt', layer = 'touch', tpl = 'stext',
        name = 'pt' .. gp .. s.id, pos = { s.x, s.y },
        size = { s.w, s.h }, text = s.label, font = s.fs, fcolor = ink,
        bg = 0, align = 'Middle', valign = 'Middle', seq = nextSeq(),
      }
      local action, id = s.action, s.id
      nodes[#nodes + 1] = {
        key = base .. '.hit', layer = 'touch', tpl = 'hit',
        name = 'ph' .. gp .. s.id, pos = { s.x, s.y }, size = { s.w, s.h },
        cursor = { 'Click' },
        on = { Click = function() if onAction then onAction(action, id) end end },
        seq = nextSeq(),
      }
    end
    return nodes
  end

  -- 便捷：本屏按钮数（接线方给 `phone build n=` 日志用）
  function PAD.count(opts)
    opts = opts or {}
    return #PAD.slots(opts.screen or 'game', opts.canvas, opts.dual, opts.mobile)
  end

  return PAD
end

return M
