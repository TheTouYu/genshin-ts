-- ============================================================================
-- lua/tetris/roster.lua —— 角色档案页（角色列表 / 立绘 / 页签 / 天赋与解锁文案）
-- 从 main.lua 拆出：main chunk 有 Lua 5.3 的 200-local 硬上限（真机编译期拒载整份脚本），
-- 整页搬进模块后主文件少 420 行、少 2 个 local；模块自己有一份 local 预算。
-- 契约见 docs/research/lua-module-contract.md（require 期不跑生命周期、顶层不实例化控件）。
-- 依赖全部由 main 注入（env）：FN 就是 main 的 FN 表本身 ⇒ 模块内的 FN.xxx 自引用天然可用。
-- ============================================================================
local M = {}

function M.new(env)
  local FN = env.FN
  local C, THEME, CP, SKILLS, NUM, UI4 = env.C, env.THEME, env.CP, env.SKILLS, env.NUM, env.UI4
  -- SKG() 在 OnStart 才由 skills.new() 创建 ⇒ 必须惰性取（模块 require 时它还是 nil）
  local env_sk = env.sk
  local function SKG() return env_sk() end
  local game = env.game
  local setText, trySet, tryCall, addCursor = env.setText, env.trySet, env.tryCall, env.addCursor
  local ROSTER = env.roster

  -- ROSTER 由 main 注入（同一张表，外部也读它）
  FN.rosterDestroy = function()
    if FN.rosterV2Close then FN.rosterV2Close() end     -- v6.4：新路径的实例必须在这里清掉
    if ROSTER.savedTop or ROSTER.savedBot then
      setText(topBanner, ROSTER.savedTop or '')
      setText(botBanner, ROSTER.savedBot or '')
      ROSTER.savedTop, ROSTER.savedBot = nil, nil
    end
    for i = #ROSTER.items, 1, -1 do
      pcall(function() game.DestroyClientUIControl(ROSTER.items[i]) end)
      ROSTER.items[i] = nil
    end
  end

  -- ===== 角色 · 契约与技能（v5.1 用户反馈：主页看不到"角色"这个大模块的入口，
  --        玩家无法"所见所得"地了解四个角色各自的机制/技能/主题）
  -- 交互：左侧四人列表（点一行切换）→ 右侧详情（主题色/元素/技能名/机制 3 行/键位/解锁条件/当前等级）。
  -- 关闭：同键（Key16 / 名册按钮）或「合上」按钮。
  FN.charSel = 1
  FN.charAnim = 0
  FN.charPulse = nil

  FN.rosterToggle = function()
    if not (SKG() and SKILLS) then print('roster skip (no skills)') return end
    if ROSTER.on then
      FN.rosterDestroy()
      ROSTER.on = false
      print('roster close')
      -- 关页后把标题展台建回来（打开时被拆掉了，见下）
      if env.rebuildMenu then env.rebuildMenu() end
      return
    end
    -- 层序铁律：想盖住已有控件，只能在它们之后建。标题页的展台（入口卡/模式卡/底部提示）
    -- 是更早建的一批实例，且 SetAsLastSibling 不可靠 ⇒ 开页前先把展台拆掉，关页再建。
    if env.teardownMenu then env.teardownMenu() end
    FN.rosterBuild()
  end

  -- ===== 角色图鉴（v5.3：对齐官方角色页的做法 —— 左页签/中立绘/右天赋清单 + 详情 + 数值）=====
  -- 用户 2026-10-29 反馈：①没用心做 UI 审美 ②这里是消费角色文案的绝佳位置，却没文案
  -- ③技能和机制介绍不全（主动技能之外，被动/机制/数值/解锁都要讲） ④要学官方角色页
  --   （每个天赋都有图标、名称、等级、长文介绍、详细数值，升级还有数值变化预览）
  FN.charTab = 1        -- 1 技能 / 2 机制 / 3 数值 / 4 解锁
  FN.charSel = 1

  local CHAR_TAB_NAME = { '技能', '机制', '数值', '解锁', '规则' }

  -- 取某角色的详情页数据（纯数据，渲染层只读）
  local function charData(role)
    local CP = FN.COPY
    local e = (CP and CP.of and CP.of(role)) or {}
    local s = SKG() or {}
    local lv = tonumber(s.lv and s.lv[role]) or 1
    local pr = {}
    if SKILLS and SKILLS.params then
      local ok, v = pcall(SKILLS.params, s, role)
      if ok and type(v) == 'table' then pr = v end
    end
    -- 下一级参数（构造一个等级 +1 的临时 state）
    local nx = {}
    if SKILLS and SKILLS.params then
      local lvT = {}
      for k, v in pairs(s.lv or {}) do lvT[k] = v end
      lvT[role] = lv + 1
      local ok, v = pcall(SKILLS.params, { lv = lvT, nodes = s.nodes }, role)
      if ok and type(v) == 'table' then nx = v end
    end
    local N = (SKILLS and SKILLS.NUM) or {}
    local cd = (N.CD and N.CD[role]) or 0
    local cost = (N.COST and N.COST[role]) or 0
    local skillNm = tostring(e.skill or '技能')
    local d = { role = role, e = e, lv = lv, pr = pr, nx = nx, cd = cd, cost = cost,
      skill = skillNm, help = (CP and CP.help and CP.help(role)) or {},
      tips = (CP and CP.tips and CP.tips(role)) or {} }
    -- 台词：取该角色的 cast/hold 文案（官方角色页也有语音台词区）
    local says = {}
    if CP and CP.sayList then
      local okL, list = pcall(CP.sayList, role, 10)
      if okL and type(list) == 'table' then
        for i2 = 1, #list do
          local it = list[i2]
          if type(it) == 'table' and it.body then says[#says + 1] = tostring(it.body) end
        end
      end
    end
    d.says = says
    -- 技能详情（技能页第 1 条）
    local durTxt = ''
    if role == 'nahida' then durTxt = '接管 ' .. tostring(math.floor((pr.aiDur or 0) + 0.5)) .. ' 秒 · AI 档位 ' .. tostring(pr.aiTier or 1)
    elseif role == 'ganyu' then durTxt = '冻结 ' .. tostring(pr.freezeRows or 0) .. ' 行 · ' .. tostring(pr.freezeSec or 0) .. ' 秒'
    elseif role == 'keqing' then
      local KL = ((N.KEQING or {}).LOCK) or { 0.2 }
      durTxt = '瞬落锁定 ' .. string.format('%.2f', KL[1] or 0.2) .. ' 秒'
    elseif role == 'columbina' then durTxt = '给对手压 ' .. tostring(#((N.COLUMBINA or {}).LAYERS or { 2 })) .. ' 档层数 · 削锁定延迟 ' .. tostring(math.floor(pr.holdCutMs or 0)) .. ' 毫秒'
    end
    d.durTxt = durTxt
    return d
  end

  FN.charShow = function(sel)
    FN.charSel = sel or FN.charSel or 1
    FN.rosterBuild(FN.charSel, FN.charTab)
  end

  -- ===== v6.4 档案页：纯描述（view_roster）+ 独立 render 实例 ROSTERV.R =====
  -- 为什么独立实例：基础层（棋盘/预览/HUD）每帧增量更新同一张 key 表，覆盖屏是整屏重建；
  -- 共用一张表时 apply 会把基础层节点当成"不在列表里"全部销毁（D762 记过同族事故）。
  -- 需要的注入面（缺任一则自动回落旧实现并打一行 skip 日志，游戏不会坏）：
  --   env.platform(PT) / env.render(RENDER_M) / env.layers(VIEW_LAYERS_M) /
  --   env.config(CFG) / env.kit(VIEW_KIT_M.new{layers}) / env.viewRoster(view_roster 模块)
  local ROSTERV = { R = nil, S = nil, live = false, nodes = nil }
  local function v2able()
    return env.platform and env.render and env.layers and env.config and env.kit
      and env.viewRoster
  end
  local function v2mix(c, k)          -- k>0 向白 / k<0 向墨（与 MS.opts 同款）
    if not k or k == 0 then return c end
    local a = (c // 16777216) % 256
    local r0, g0, b0 = (c // 65536) % 256, (c // 256) % 256, c % 256
    local tt = (k > 0) and 255 or 16
    local kk = (k < 0) and -k or k
    local function ch(v)
      local n = math.floor(v + (tt - v) * kk + 0.5)
      if n < 0 then n = 0 end
      if n > 255 then n = 255 end
      return n
    end
    return C(a, ch(r0), ch(g0), ch(b0))
  end
  -- 三态：胶囊三块 + 文字逐件写字段（不重建）；组按热区 key 反查同一前缀的部件
  local function v2bind(nodes)
    local R = ROSTERV.R
    local idx = {}
    local function put(k, n) if k and not idx[k] then idx[k] = n end end
    for i = 1, #nodes do
      local n = nodes[i]
      put(n.key, n)
      put(n.name, n)
    end
    for i = 1, #nodes do
      local n = nodes[i]
      if n.role == 'hit' and n.name then
        local base = tostring(n.name):gsub('Hit$', '')
        local parts = {}
        for _, suf in ipairs({ 'B', 'L', 'R' }) do
          local p = idx[base .. suf]
          if p and p.color then parts[#parts + 1] = { key = p.key, base = p.color, x = p.pos[1], y = p.pos[2] } end
        end
        local lb = idx[base .. 'T']
        local sub = idx[base .. 'S']
        local hitKey, hitName = n.key, n.name
        local ctl = R.get(hitKey)
        if ctl and #parts > 0 then
          local function paint(k)
            for j = 1, #parts do
              R.write(parts[j].key, 'imageColor', k and v2mix(parts[j].base, k) or parts[j].base)
            end
            if lb and lb.fcolor then R.write(lb.key, 'fontColor', k and v2mix(lb.fcolor, k * -1) or lb.fcolor) end
          end
          env.addCursor(ctl, 'CursorEnter', function() paint(-0.06) end)
          env.addCursor(ctl, 'CursorExit', function() paint(nil) end)
          env.addCursor(ctl, 'CursorDown', function() paint(-0.12) end)
          env.addCursor(ctl, 'CursorUp', function() paint(-0.06) end)
        end
        if ROSTERV.actions and ROSTERV.actions[hitName] then
          env.addCursor(ctl, 'CursorClick', ROSTERV.actions[hitName])
        end
      end
    end
  end

  -- 诊断/测试入口：拿到新路径的 render 实例与最近一次描述（headless 测试读字段用）
  FN.rosterV2R = function() return ROSTERV.R end
  FN.rosterV2Nodes = function() return ROSTERV.nodes end

  FN.rosterV2Close = function()
    if ROSTERV.R then ROSTERV.R.clear() end
    ROSTERV.live = false
    ROSTERV.nodes = nil
    if UI4 and UI4.regScreen then pcall(UI4.regScreen, 'roster') end
  end

  FN.rosterV2Build = function(keepSel, keepTab)
    if not v2able() then print('roster v2 skip :: 需要 main 注入 platform/render/layers/config/kit/viewRoster') return false end
    if not (SKG() and SKILLS) then print('roster skip (no skills)') return false end
    if keepSel then FN.charSel = keepSel end
    if keepTab then FN.charTab = keepTab end
    local roles = (SKG().roles and #SKG().roles > 0) and SKG().roles
      or { 'nahida', 'keqing', 'ganyu', 'columbina' }
    local sel = FN.charSel or 1
    if sel < 1 or sel > #roles then sel = 1 end
    local tab = FN.charTab or 1
    if tab < 1 or tab > 5 then tab = 1 end
    FN.charSel, FN.charTab = sel, tab
    local role = roles[sel]
    local d = charData(role)
    local st = SKG() or {}
    local open = st.unlocked and st.unlocked[role] == true
    local W, H = env.canvas()
    if not ROSTERV.S then
      ROSTERV.S = env.viewRoster.new({ config = env.config, layers = env.layers,
        kit = env.kit, copy = FN.COPY, roster = ROSTER })
    end
    if not ROSTERV.R then
      ROSTERV.R = env.render.new({ platform = env.platform, layers = env.layers,
        log = function(m) print(m) end })
    end
    -- 交互：页签 / 关闭 / 角色行 / 条目卡（热区 key 见 view_roster：charTab<i>Hit、charCloseHit、
    -- charRow<i>Hit、charItemHit<i>）
    local actions = {}
    for i = 1, 5 do
      local ii = i
      actions['charTab' .. i .. 'Hit'] = function()
        print('char tab tap ' .. ii)
        FN.rosterV2Build(nil, ii)
      end
    end
    actions['charCloseHit'] = function()
      print('roster close')
      FN.rosterV2Close()
      ROSTER.on = false
      if env.rebuildMenu then env.rebuildMenu() end
    end
    for i = 1, #roles do
      local ii = i
      actions['charRow' .. i .. 'Hit'] = function()
        FN.charSel = ii
        print('char select i=' .. ii .. ' role=' .. tostring(roles[ii]))
        FN.rosterV2Build(ii, nil)
      end
    end
    for i = 1, 3 do
      local ii = i
      actions['charItemHit' .. i] = function()
        print('char detail open ' .. ii)   -- 全文浮层未接（见交付报告"未接清单"）
      end
    end
    ROSTERV.actions = actions
    local nodes = ROSTERV.S.roster {
      canvas = { W, H },
      device = (IS_MOBILE and 'mobile') or 'pc',
      role = role, tab = tab, roles = roles,
      party = (st.party or {}), unlocked = (st.unlocked or {}),
      lv = (st.lv and st.lv[role]) or 1, cnt = (st.cnt or {}),
      cd = d.cd or 0, partyMax = (SKILLS.NUM and SKILLS.NUM.PARTY_MAX) or 2,
      skillDesc = d.durTxt or nil, open = open,
      onTab = function(i) if actions['charTab' .. i .. 'Hit'] then actions['charTab' .. i .. 'Hit']() end end,
      onClose = actions['charCloseHit'],
      onSwap = function(i) actions['charRow' .. i .. 'Hit']() end,
      onEntry = function(i) actions['charItemHit' .. i]() end,
    }
    ROSTERV.R.clear()          -- 先清再 apply：引擎实例上限约 430，常驻约 240 + 本屏 111
    ROSTERV.R.apply(nodes)
    ROSTERV.live, ROSTERV.nodes = true, nodes
    v2bind(nodes)
    if UI4 and UI4.regScreen then pcall(UI4.regScreen, 'roster') end
    if UI4 and UI4.regAdd then
      for i = 1, #nodes do
        local n = nodes[i]
        if n.role == 'hit' then
          local ctl = ROSTERV.R.get(n.key)
          if ctl then pcall(UI4.regAdd, 'roster.' .. tostring(n.name), ctl, n.size[1], n.size[2]) end
        end
      end
    end
    ROSTER.on = true
    print('char codex open n=' .. #nodes .. ' sel=' .. tostring(role) .. ' tab=' .. tostring(tab)
      .. ' v=2 issues=' .. #ROSTERV.R.issues())
    return true
  end

  FN.rosterToggle = function()
    if not (SKG() and SKILLS) then print('roster skip (no skills)') return end
    if ROSTER.on then
      FN.rosterDestroy()
      ROSTER.on = false
      print('roster close')
      return
    end
    -- 能力齐 ⇒ 只走新路径（覆盖屏自带独立 render 实例，不再需要"先拆展台再建页"）
    if FN.rosterV2Build() then return end
    if env.teardownMenu then env.teardownMenu() end
    FN.rosterBuild()
  end

  -- CJK 折行：引擎的单行 textbox 不会自动换行，长文案必须自己拆成多行
  local function wrapCJK(txt, per)
    txt = tostring(txt or '')
    local out, line, n = {}, {}, 0
    local chars = {}
    local ok = pcall(function()
      for _, cp in utf8.codes(txt) do chars[#chars + 1] = utf8.char(cp) end
    end)
    if not ok then
      for i = 1, #txt do chars[#chars + 1] = txt:sub(i, i) end
    end
    for _, ch in ipairs(chars) do
      if ch == '\n' then
        out[#out + 1] = table.concat(line); line, n = {}, 0
      else
        line[#line + 1] = ch; n = n + 1
        if n >= per then
          -- 断行禁则（评审：0.05 秒断成 0./05、skills.lua 断成 ski/lls）：
          -- 从行尾回退到最近的一个"安全断点"——ASCII 字母数字串整体不拆，句读不落行首
          local tail = {}
          local back = 0
          while #line - back > 1 do
            local c = line[#line - back]
            if c:match('[%w%.%%]') then back = back + 1 else break end
          end
          if back > 0 and back < #line then
            for b = #line - back + 1, #line do tail[#tail + 1] = line[b] end
            for b = #line, #line - back + 1, -1 do line[b] = nil end
          end
          out[#out + 1] = table.concat(line)
          line, n = tail, #tail
        end
      end
    end
    if #line > 0 then out[#out + 1] = table.concat(line) end
    if #out == 0 then out[1] = '' end
    return out
  end

  -- #6（真机日志：`char codex open n=135` ×33）重建开销：
  -- 同角色 + 同页签的重复打开**不重建**，直接复用现有控件（真机上每次重建 135 个实例，
  -- 33 次 = 4455 次实例化，是卡顿与 invalid object 的主要来源）。
  -- 判据：日志里 `char codex open` 只在真正变化时出现。
  FN.rosterBuild = function(keepSel, keepTab)
    if UI4 and UI4.regScreen then pcall(UI4.regScreen, 'roster') end
    -- 组件工厂是懒创建的（main 的 MS.build 里才建）⇒ 每次构建时现取
    local CTL = env.ctl and env.ctl() or nil
    FN.rosterDestroy()
    if env.pollCanvas then pcall(env.pollCanvas) end   -- 先对齐真实画布，再算缩放
    local W, H = env.canvas()
    local CP = FN.COPY
    local roles = (SKG().roles and #SKG().roles > 0) and SKG().roles or { 'nahida', 'keqing', 'ganyu', 'columbina' }
    local snap = (SKILLS.snapshot and SKILLS.snapshot(SKG())) or {}
    local sel = keepSel or FN.charSel or 1
    if sel < 1 or sel > #roles then sel = 1 end
    FN.charSel = sel
    local tab = keepTab or FN.charTab or 1
    if tab < 1 or tab > 5 then tab = 1 end
    FN.charTab = tab
    -- v5.38（手机实测：角色页内容溢到画布下沿外，最低件到 screen y=699 / 画布 720）
    -- 设计稿按 1600×900 画，但页面内容比卡片高 ⇒ 高度按 980 收口，给上下各留 ~28px 安全边。
    local k = math.min(W / 1600, H / 980)
    if k <= 0 then k = 1 end
    local function u(v) return v * k end
    local add
    add = function(c) if c then ROSTER.items[#ROSTER.items + 1] = c end return c end
    local function BOX(name, w, h, color) return add(UI4.pill(name, w, h, color)) end
    local function TXT(name, txt, w, size, color, align)
      local fs = math.floor(u(size) + 0.5)          -- ⚠ 字号必须整数，否则静默回落 24 号
      local hh = math.max(math.floor(fs * 1.45 + 6), fs + 8)
      local c = UI4.label(name, tostring(txt), w, hh, fs, color)
      if c and align then trySet(c, 'horizontalAlignment', align) end
      return add(c)
    end
    local R = {}
    -- 面板：1400×800
    -- v5.38 修「手机画布上角色页溢出画布下沿」（1560×720 实测：面板 1120×640 居中后底边到 -320，
    -- 页脚在 -PH/2+28 仍超屏）⇒ 面板高度按**画布实际高度**收口，页脚永远留 28 内边距。
    local PW = u(1400)
    local PH = math.min(u(800), (env.canvasH and env.canvasH() or 900) - u(56))
    local PL, PR = -PW / 2, PW / 2          -- 面板左右沿（设计单位）
    R.dim = BOX('charDim', W + 40, H + 40, C(176, 20, 34, 50))
    R.card = BOX('charCard', PW, PH, C(252, 250, 244, 252))
    R.top = BOX('charTop', PW, u(92), C(255, 250, 240, 246))
    R.rule = BOX('charRule', PW - u(80), u(2), THEME.gold)
    R.title = TXT('charTitle', '角色档案 · 契约与技能', u(620), 32, THEME.textMain, 'Left')
    R.sub = TXT('charHint', '左边点角色 · 右边切页签　·　I / F 关闭 · 右上角「合上」也行', u(620), 17, THEME.textSub, 'Left')
    -- 左列：四人
    local rows = {}
    for i, role in ipairs(roles) do
      local e = (CP and CP.of and CP.of(role)) or {}
      local open = SKG().unlocked and SKG().unlocked[role] == true
      local inParty = false
      for _, rr in ipairs(SKG().party or {}) do if rr == role then inParty = true end end
      -- v5.23（用户：角色页那么多按钮，为什么不用我们现在这套组件）：角色行改由
      -- controls.lua 的 CTL.btn 生成 —— 胶囊底/文字版式/键帽/热区/命中注册/三态+音效 全在组件里，
      -- 这里只给坐标与文案。
      rows[i] = { role = role, name = (e.name or role) .. (inParty and ' ▲' or ''),
        state = open and (inParty and ('台前 · Lv' .. tostring(snap.lv or 1)) or '已缔结 · 后台')
          or '未缔结 · 点开看解锁条件',
        color = e.color, color2 = e.color2, open = open, idx = i }
    end
    -- 中列：立绘区（角色主题色大色块 + 名字/元素/称号 + 台词）+ 状态
    local d = charData(roles[sel])
    local e = d.e
    local open = SKG().unlocked and SKG().unlocked[roles[sel]] == true
    -- v5.29（用户：语音文案那块四行字做成组件了吗）——整块交给 CTL.textPanel：
    -- 圆角卡片 + 顶部主题色细带 + 角色名/元素称号/本局等级 + 描金分隔线 + 4 行台词 + 页脚技能行
    local midX, midW, midH = PL + u(430), u(380), u(430)
    if CTL and CTL.textPanel then
      local panel = CTL.textPanel({
        id = 'charPanel', x = midX + midW / 2, y = u(30), w = midW, h = midH,
        accent = e.color2 or e.color or C(127, 207, 106),
        cardFill = (env.over and env.over(C(252, 250, 244, 255), e.color or C(127, 207, 106), 0.20))
          or C(244, 246, 240, 255),
        title = e.name or roles[sel], titleFs = 38, titleInk = e.color2 or THEME.textMain,
        subtitle = (e.element or '') .. '元素 · ' .. (e.title or '') .. '　｜　本局 Lv' .. tostring(d.lv)
          .. '　' .. (open and '已缔结' or '未缔结'),
        lines = { d.says[1] or (d.help[1] or ''), d.says[2] or (d.help[2] or ''),
          d.says[3] or '', d.says[4] or '' },
        footer = '技能「' .. d.skill .. '」　冷却 ' .. tostring(d.cd) .. ' 秒',
        fs = 18, lineGap = 36, onPart = function(c) add(c) end,
      })
      R.panel = panel
    end
    -- 右列：页签 + 内容
    local tabs, tabsHit = {}, {}
    for i = 1, 5 do
      -- v5.23：页签已改由 CTL.btn 在布局阶段生成（胶囊+热区+命中注册+三态+音效），
      -- 这里不再建 BOX/TXT/热区 —— 残留的未摆位控件会漂到画面中央（实测那块白方块就是它）。
    end
    -- 内容条目（每条：图标 + 名称 + 正文）
    local items = {}
    local function entry(iconCol, nm, desc, desc2, valTxt, full)
      items[#items + 1] = { icon = iconCol, nm = nm, desc = desc, desc2 = desc2, val = valTxt,
        full = full or desc }
    end
    if tab == 1 then
      -- 被动清单改为读 skills.lua 的 M.talents（v6：每角色 4 条，文案与数值同源，
      -- 不再在 main 里硬编码一份 —— 硬编码那份就是"四个角色被动看着一样"的根因）
      local tal = (SKILLS.talents and SKILLS.talents(SKG(), d.role)) or {}
      local talMax = math.min(#tal, 4)   -- 面板高度只放得下 4 条（第 5 条在「数值」页有）
      for ti = 1, talMax do
        local t = tal[ti]
        local live = ''
        if type(t.live) == 'table' then
          local parts = {}
          for kk, vv in pairs(t.live) do parts[#parts + 1] = tostring(kk) .. ' ' .. tostring(vv) end
          live = table.concat(parts, '　')
        elseif t.live ~= nil then
          live = tostring(t.live)
        end
        -- v5.7：列表摘要 = 按框宽折行的**前两行**（放不下就点开看全文）
        -- ⚠ 旧实现按"字节"截 + PER=34 固定值，而 410px 的框在 15 号字下只放得下约 17 个汉字
        --   ⇒ 文字被引擎自己补「…」（这就是满屏省略号的真正来源，不是 utf8Cut）。
        local rawBody = tostring(t.map or t.desc or '')
        local body = rawBody          -- 全文交给渲染层按框宽折行、只留前 2 行 + 点开看全文
        if live == '' then live = tostring(t.official or t.verify or '天赋已生效') end
        local rawLive = live
        live = FN.utf8Cut(live, 96)
        -- 数值/读数单独一行（不参与折行截断），正文只留前 2 行 + 点开看全文
        entry(t.accent or e.accent or e.color2, tostring(t.name or ('天赋 ' .. ti)), body, nil, live,
          rawBody .. '\n' .. rawLive)
      end
    elseif tab == 5 then
      entry(e.accent or e.color2, '成长与编成（全角色通用）',
        '每个角色独立计经验：施放 +10、有效收益 +25、前台每 10 块 +15、后台每 10 块 +5；等级越高天赋数值越强。',
        'Y 键换台前，冷却 ' .. tostring((SKILLS.NUM and SKILLS.NUM.SWITCH_CD) or 8) .. ' 秒；一局最多 '
          .. tostring((SKILLS.NUM and SKILLS.NUM.PARTY_MAX) or 2) .. ' 个可前台发力的主动角色。')
      entry(e.accent or e.color2, '与对手的交互',
        '对战/合作里垃圾行由消行数决定（消 2/3/4 行 → 送 1/2/4 行），技能可以拦截或反向。',
        'AI 盘使用同一套规则（同样的出块序列、同样的垃圾结算），不存在作弊路径。')
      entry(e.color2 or C(150, 150, 150), '局外与解锁',
        '角色初始只解锁纳西妲；其余按累计条件开放（见「解锁」页）。',
        '局内等级是会话内成长，跨局不继承——目前的养成只发生在「一局之内」。')
    else
      local req = (SKILLS.NUM and SKILLS.NUM.UNLOCK and SKILLS.NUM.UNLOCK[d.role]) or nil
      local cnt = SKG().cnt or {}
      local function need(k, v) return tostring(k) .. ' ' .. tostring(cnt[k] or 0) .. '/' .. tostring(v) end
      local KEYNAME = { lines = '累计消行', games = '总局数', pvp = '对战局数', tetris = '四消次数', time = '累计时长(秒)' }
      if req then
        local parts = {}
        for _, kk in ipairs({ 'lines', 'games', 'pvp', 'tetris', 'time' }) do
          if req[kk] then
            parts[#parts + 1] = (KEYNAME[kk] or kk) .. ' ' .. tostring(cnt[kk] or 0) .. ' / ' .. tostring(req[kk])
          end
        end
        entry(e.accent or e.color2, '解锁进度（满足任一条即缔结）',
          table.concat(parts, '　·　'),
          open and '已达成，可直接使用。' or '两条通道任选其一：打出更多行，或打更多局。')
      end
      entry(e.color or C(127, 207, 106), open and '已缔结' or '未缔结',
        open and ('你已经和' .. tostring(e.name or d.role) .. '立下契约，可直接在局内使用她的技能。')
          or '满足下面任意一条即可缔结（自动解锁，不需要额外操作）：',
        req and ((req.lines and ('累计消行 ' .. tostring(cnt.lines or 0) .. '/' .. tostring(req.lines)) or '')
          .. '　' .. (req.games and ('总局数 ' .. tostring(cnt.games or 0) .. '/' .. tostring(req.games)) or '')
          .. '　' .. (req.pvp and ('对战局数 ' .. tostring(cnt.pvp or 0) .. '/' .. tostring(req.pvp)) or '')
          .. '　' .. (req.tetris and ('四消次数 ' .. tostring(cnt.tetris or 0) .. '/' .. tostring(req.tetris)) or '')
          .. '　' .. (req.time and ('累计时长 ' .. tostring(cnt.time or 0) .. '/' .. tostring(req.time) .. ' 秒') or ''))
          or '无解锁条件（初始角色）')
      entry(e.accent or e.color2, '当前累计（全角色共用）',
        '累计消行 ' .. tostring(cnt.lines or 0) .. '　局数 ' .. tostring(cnt.games or 0) ..
        '　对战 ' .. tostring(cnt.pvp or 0) .. '　四消 ' .. tostring(cnt.tetris or 0) ..
        '　时长 ' .. tostring(cnt.time or 0) .. 's',
        '这些计数跨局累积，存在本例存档里；换存档会重置。')
      entry(e.accent or e.color2, '编成规则',
        '一局最多 ' .. tostring((SKILLS.NUM and SKILLS.NUM.PARTY_MAX) or 2) .. ' 个可前台发力的主动角色；初始只有纳西妲。',
        '解锁顺序：纳西妲 → 刻晴 → 甘雨 → 少女（按条件达成先后）。')
    end
    -- 渲染条目：图标 + 名称 + 正文（自动折行）+ 数值行
    local rightX = PL + u(840)
    local rightW = u(470)
    -- 每行能放几个汉字：CJK 在 15 号字下约占 1.55×字号宽 ⇒ PER = 可用宽 / 23.2
    local PER = math.max(12, math.floor((rightW - u(60)) / (15 * 1.55)))
    local itemRows = {}
    for idx, it in ipairs(items) do
      -- 先算版式（行数决定卡高），再建**卡片底**，最后建文字 —— 层序=创建顺序，卡必须在字下面。
      local src = (it.desc or '')
      if it.desc2 and it.desc2 ~= '' then src = src .. (src ~= '' and '　' or '') .. it.desc2 end
      local wrapped = wrapCJK(src, PER)
      local CAP = 2
      local shown = math.min(#wrapped, CAP)
      local hasV = (it.val and it.val ~= '')
      local cardH = u(34) + shown * u(22) + (hasV and u(22) or 0) + u(18)
      -- 卡片底要比面板纸再深一档才看得出来（第一版只叠 7% 角色色，和纸面几乎同色 ⇒ 看不见）
      -- 卡片底：用**组件工厂的胶囊**（圆角），与页面其他元素同一语汇；
      -- 组件不可用时退回直角 BOX（不崩，只是不好看）。
      local cardFill = (env.over and env.over(C(244, 236, 222, 255), e.color or C(127, 207, 106), 0.16))
        or C(244, 238, 228, 255)
      local card, cardParts
      if CTL and CTL.pill then
        cardParts = CTL.pill('charItemCard' .. idx, 0, 0, rightW - u(8), cardH - u(10), cardFill,
          function(c) add(c) end)
      else
        card = BOX('charItemCard' .. idx, rightW - u(8), cardH - u(10), cardFill)
      end
      -- 不再画左侧色条：上次刚因为"圆角按钮外面多一条线"被打回，卡片本身已带角色色
      local edge = nil
      local icon = BOX('charItemIcon' .. idx, u(30), u(30), it.icon or C(180, 180, 180))
      if icon and Enum and Enum.ImageSource then
        local GLYPH = { 100002, 100004, 100005, 100003, 100006 }
        local gid = GLYPH[((idx - 1) % #GLYPH) + 1]
        pcall(function() icon:SetImage(Enum.ImageSource.StaticReference, gid) end)
      end
      local nm = TXT('charItemNm' .. idx, it.nm, rightW - u(84), 19, THEME.textMain, 'Left')
      local lines = {}
      for li = 1, shown do
        local lineTxt = wrapped[li]
        if li == shown and #wrapped > shown then lineTxt = lineTxt .. '…' end
        lines[li] = TXT('charItemL' .. idx .. '_' .. li, lineTxt, rightW - u(84), 15, THEME.textSub, 'Left')
      end
      local vv = nil
      if hasV then
        vv = TXT('charItemV' .. idx, it.val, rightW - u(84), 15, e.color2 or THEME.textMain, 'Left')
      end
      itemRows[idx] = { card = card, cardParts = cardParts, edge = edge, icon = icon, nm = nm, lines = lines, v = vv, it = it, h = cardH }
      -- 整条当热区：点开看全文（放不下的长文案不再靠省略号）
      local ihit = add(UI4.hit('charItemHit' .. idx, rightW, u(60)))
      if ihit then
        tryCall(ihit, 'SetSizeDelta', rightW, u(60))
        addCursor(ihit, 'CursorClick', function() if FN.charDetail then FN.charDetail(idx) end end)
        itemRows[idx].hit = ihit
      end
    end
    -- ===== 条目详情浮层（v5.7 用户：「文案不要出现省略号，放不下就点击展开」）=====
    -- 做法：每条天赋压成 2 行摘要 + 一颗覆盖整条的 cursor 热区；点开 = 一整块奶油面板放全文。
    ROSTER.detail = nil
    local DK = {}                                  -- 浮层控件（随 rosterDestroy 一起走：都进 ROSTER.items）
    FN.charDetail = function(idx)
      local it = items[idx]
      if not it then return end
      -- 先拆上一块
      if ROSTER.detail then
        for i = #ROSTER.detail, 1, -1 do
          pcall(function() game.DestroyClientUIControl(ROSTER.detail[i]) end)
          ROSTER.detail[i] = nil
        end
      end
      local acc = it.icon or C(150, 150, 150)
      local dw, dh = u(760), u(460)
      local parts = {}
      parts[#parts + 1] = UI4.pill('charDetailDim', W + 40, H + 40, C(150, 16, 24, 40))
      parts[#parts + 1] = UI4.pill('charDetailCard', dw, dh, C(252, 250, 244, 253))
      parts[#parts + 1] = UI4.pill('charDetailBar', dw, u(6), acc)
      parts[#parts + 1] = UI4.label('charDetailTitle', tostring(it.nm or ''), dw - u(60),
        math.floor(u(22) * 1.45 + 6), math.floor(u(22)), THEME.textMain)
      local body = tostring(it.desc or '')
      if it.desc2 and it.desc2 ~= '' then body = body .. '\n' .. tostring(it.desc2) end
      if it.val and it.val ~= '' then body = body .. '\n' .. tostring(it.val) end
      local wrapped = wrapCJK(body, math.max(14, math.floor((dw - u(70)) / (16 * 1.55))))
      for li = 1, math.min(#wrapped, 12) do
        parts[#parts + 1] = UI4.label('charDetailL' .. li, wrapped[li], dw - u(70),
          math.floor(u(16) * 1.45 + 6), math.floor(u(16)), THEME.textSub)
        trySet(parts[#parts], 'horizontalAlignment', 'Left')
      end
      parts[#parts + 1] = UI4.label('charDetailTip', '点击任意处关闭', dw - u(60),
        math.floor(u(14) * 1.45 + 6), math.floor(u(14)), THEME.hint)
      -- 摆位（浮层压在最上层：后建即在上面）
      local seq = 1
      local function place(c, x, y, w, h)
        if not c then return end
        tryCall(c, 'SetSizeDelta', w, h)
        tryCall(c, 'SetAnchoredPosition', x, y)
        ROSTER.items[#ROSTER.items + 1] = c
      end
      place(parts[1], 0, 0, W + 40, H + 40)
      place(parts[2], 0, 0, dw, dh)
      place(parts[3], 0, dh / 2 - u(3), dw, u(6))
      place(parts[4], 0, dh / 2 - u(38), dw - u(60), math.floor(u(22) * 1.45 + 6))
      local y = dh / 2 - u(76)
      for li = 5, #parts - 1 do
        place(parts[li], -dw / 2 + u(35) + (dw - u(70)) / 2, y, dw - u(70), math.floor(u(16) * 1.45 + 6))
        y = y - u(26)
      end
      place(parts[#parts], 0, -dh / 2 + u(26), dw - u(60), math.floor(u(14) * 1.45 + 6))
      ROSTER.detail = parts
      -- 点任意处关闭：整块面板当热区
      local hit = add(UI4.hit('charDetailHit', dw + 200, dh + 120))
      if hit then
        tryCall(hit, 'SetSizeDelta', dw + 200, dh + 120)
        tryCall(hit, 'SetAnchoredPosition', 0, 0)
        addCursor(hit, 'CursorClick', function()
          for i = #ROSTER.detail, 1, -1 do
            pcall(function() game.DestroyClientUIControl(ROSTER.detail[i]) end)
            ROSTER.detail[i] = nil
          end
          ROSTER.detail = nil
        end)
        ROSTER.detail[#ROSTER.detail + 1] = hit
      end
      print('char detail open ' .. tostring(it.nm))
    end

    R.foot = TXT('charFoot', '与四位角色缔结契约，她们会在你手忙脚乱时替你守住棋盘——按名册键随时回来看看。',
      u(1260), 17, THEME.hint)
    -- ── 摆位 ──（约定：TXTL 传的是**左沿**，内部再换算成框中心，避免"左对齐文字跑到画布外"）
    local function at(c, x, y, w, h)
      if not c then return end
      tryCall(c, 'SetSizeDelta', w, h)
      tryCall(c, 'SetAnchoredPosition', x, y)
    end
    -- 文本行高：引擎 requiredHeight = fs×1.45 + 4，这里再留 2px 余量（算少 0.4px 就整条不画）
    local function th(size) local fs = math.floor(u(size) + 0.5) return math.max(math.floor(fs * 1.5 + 10), fs + 12) end
    local function put(c, xLeft, y, w, h) at(c, xLeft + w / 2, y, w, h) end
    at(R.dim, 0, 0, W + 40, H + 40)
    at(R.card, 0, 0, PW, PH)
    at(R.top, 0, PH / 2 - u(46), PW, u(92))
    at(R.rule, 0, PH / 2 - u(94), PW - u(80), u(2))
    put(R.title, PL + u(40), PH / 2 - u(46), u(560), th(32))
    put(R.sub, PL + u(40), PH / 2 - u(78), u(560), th(17))
    if CTL then
      CTL.btn({ id = 'roster.close', x = PR - u(110), y = PH / 2 - u(46), w = u(150), h = u(50),
        label = '合上', fs = 20, preset = 'gold',
        onPart = function(c) add(c) end,
        onClick = function()
          print('roster close btn')
          if FN.rosterToggle then FN.rosterToggle() end
        end })
    end
    local listX = PL + u(40)
    for i = 1, #rows do
      local r = rows[i]
      local y = u(200) - (i - 1) * u(108)
      if CTL then
        -- 选中行＝角色主题色实底 + 白字（用户：选甘雨却没高亮、还留着草神的绿）
        local on = (i == sel)
        local fill = on and (r.color or C(127, 207, 106)) or C(240, 250, 252, 244)
        local b = CTL.btn({
          id = 'roster.row' .. i, x = listX + u(180), y = y, w = u(360), h = u(96),
          label = r.name, sub = r.state, fs = 22, subFs = 15, pad = 26, titleDy = 16, subDy = 20,
          fill = fill, hoverColor = C(252, 246, 250, 246), pressColor = C(246, 236, 244, 250),
          ink = on and C(255, 255, 255, 255) or (r.open and THEME.textMain or THEME.textSub),
          subInk = on and (r.color2 or C(70, 90, 80, 255))
            or (r.open and (r.color2 or THEME.textMain) or THEME.textSub),
          onPart = function(c) add(c) end,   -- 归本页清理表，别进 MS.parts
          onClick = function()
            print('char select i=' .. tostring(r.idx) .. ' role=' .. tostring(r.roleId or r.id or '?'))
            FN.charShow(r.idx)
          end,
        })
        if b then add(b.parts[1].ctl) add(b.parts[2].ctl) add(b.parts[3].ctl) end
        -- v5.27（用户：「明明就是个圆角按钮，多出来一条线像什么话」）：删掉左竖条。
        -- 角色色已经由选中行的实底表达，外挂竖条只会破坏胶囊轮廓。
      end
    end
    -- 中列立绘区
    local midX = PL + u(430)
    local midW = u(380)
    -- 右列：页签 + 条目
    local rightX = PL + u(860)
    local rightW = u(500)
    for i = 1, 5 do
      local tx = rightX + (i - 1) * u(100)
      if CTL then
        local on = (i == tab)
        local b = CTL.btn({ id = 'roster.tab' .. i, x = tx + u(48), y = u(232), w = u(96), h = u(46),
          label = CHAR_TAB_NAME[i], fs = 18, pad = 10, lift = 3,
          fill = on and (e.color or C(127, 207, 106)) or C(240, 244, 244, 246),
          hoverColor = on and (e.color or C(127, 207, 106)) or C(232, 238, 240, 250),
          pressColor = on and (e.color or C(127, 207, 106)) or C(224, 232, 236, 252),
          ink = on and C(255, 255, 255, 255) or THEME.textMain,
          onPart = function(c) add(c) end,
          onClick = function() print('char tab tap ' .. tostring(i)) FN.rosterBuild(sel, i) end })
        if b then add(b.parts[1].ctl) add(b.parts[2].ctl) add(b.parts[3].ctl) end
      end
    end
    local yy = u(150)
    for idx, row in ipairs(itemRows) do
      local ch = row.h or u(120)
      if row.card then at(row.card, rightX + rightW / 2, yy - ch / 2 + u(6), rightW - u(8), ch - u(10)) end
      if row.cardParts then
        for ci = 1, #row.cardParts do
          local q = row.cardParts[ci]
          if q.ctl then tryCall(q.ctl, 'SetAnchoredPosition', q.x + rightX + rightW / 2, q.y + yy - ch / 2 + u(6)) end
        end
      end
      at(row.icon, rightX + u(40), yy - u(6), u(30), u(30))
      put(row.nm, rightX + u(76), yy - u(4), rightW - u(96), th(19))
      local ly = yy - u(30)
      for li, ln in ipairs(row.lines or {}) do
        put(ln, rightX + u(76), ly, rightW - u(96), th(15))
        ly = ly - u(22)
      end
      if row.v then put(row.v, rightX + u(76), ly, rightW - u(96), th(14)) end
      -- 整条热区（位置必须自己摆：建出来默认在 (0,0)）；cursor 的 y 轴与图片相反 ⇒ 取负
      if row.hit then
        tryCall(row.hit, 'SetSizeDelta', rightW, row.h or u(120))
        tryCall(row.hit, 'SetAnchoredPosition', rightX + rightW / 2, -(yy - (row.h or u(120)) / 2))
      end
      yy = yy - (row.h or u(120))
    end
    put(R.foot, PL + u(70), -PH / 2 + u(28), PW - u(140), th(17))
    -- 服务端 textbox 永远在运行时实例之上 ⇒ 打开面板必须把横幅清空，否则"纳西妲：再不动手…"会压在面板上
    ROSTER.savedTop = tostring(topBanner and topBanner.text or '')
    ROSTER.savedBot = tostring(botBanner and botBanner.text or '')
    setText(topBanner, '')
    setText(botBanner, '')
    bannerTimer = 0
    ROSTER.on = true
    print('char codex open n=' .. #ROSTER.items .. ' sel=' .. tostring(roles[sel]) .. ' tab=' .. tostring(tab)
      .. ' items=' .. tostring(#items))
  end

  -- @region ui-roster END (writer: ui-mobile)
  return ROSTER
end

return M
