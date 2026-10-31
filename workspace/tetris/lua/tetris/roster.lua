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
  local C, CP, SKILLS, NUM, UI4 = env.C, env.CP, env.SKILLS, env.NUM, env.UI4
  -- SKG() 在 OnStart 才由 skills.new() 创建 ⇒ 必须惰性取（模块 require 时它还是 nil）
  local env_sk = env.sk
  local function SKG() return env_sk() end
  local addCursor = env.addCursor
  local ROSTER = env.roster

  -- ROSTER 由 main 注入（同一张表，外部也读它）
  FN.rosterDestroy = function()
    if FN.rosterV2Close then FN.rosterV2Close() end     -- v6.4：新路径的实例必须在这里清掉
  end

  -- ===== 角色 · 契约与技能（v5.1 用户反馈：主页看不到"角色"这个大模块的入口，
  --        玩家无法"所见所得"地了解四个角色各自的机制/技能/主题）
  -- 交互：左侧四人列表（点一行切换）→ 右侧详情（主题色/元素/技能名/机制 3 行/键位/解锁条件/当前等级）。
  -- 关闭：同键（Key16 / 名册按钮）或「合上」按钮。
  FN.charSel = 1
  FN.charAnim = 0
  FN.charPulse = nil


  -- ===== 角色图鉴（v5.3：对齐官方角色页的做法 —— 左页签/中立绘/右天赋清单 + 详情 + 数值）=====
  -- 用户 2026-10-29 反馈：①没用心做 UI 审美 ②这里是消费角色文案的绝佳位置，却没文案
  -- ③技能和机制介绍不全（主动技能之外，被动/机制/数值/解锁都要讲） ④要学官方角色页
  --   （每个天赋都有图标、名称、等级、长文介绍、详细数值，升级还有数值变化预览）
  FN.charTab = 1        -- 1 技能 / 2 机制 / 3 数值 / 4 解锁
  FN.charSel = 1


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
  local ROSTERV = { R = nil, S = nil, D = nil, live = false, nodes = nil, dopen = false }
  local function v2able()
    return env.platform and env.render and env.layers and env.config and env.kit
      and env.viewRoster
  end
  local function v2mix(c, k)          -- k>0 向白 / k<0 向墨（语义同 v1 的 MS.opts，后者已删）
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
        -- 条目卡的热区在描述里已经带 on={CursorClick=…}（view_roster 的 hit 工厂会挂），
        -- 这里再挂一次就会出现「点一次、开两次浮层」——实测日志连着两条 char detail open 1。
        local hasOwnClick = n.on and n.on.CursorClick
        if not hasOwnClick and ROSTERV.actions and ROSTERV.actions[hitName] then
          env.addCursor(ctl, 'CursorClick', ROSTERV.actions[hitName])
        end
      end
    end
  end

  -- ===== 条目详情浮层：第二份描述 + 第二个 render 实例（modal 层压住档案页）=====
  FN.rosterV2DetailClose = function()
    if ROSTERV.D then ROSTERV.D.clear() end
    ROSTERV.dopen = false
  end
  -- 给 main 的 Esc 用：一行判断"浮层是否开着"（打开时优先关浮层，别直接关整页）
  FN.rosterV2DetailOpen = function() return ROSTERV.dopen == true end

  FN.rosterV2Detail = function(idx)
    if not v2able() then return false end
    local S = ROSTERV.S
    local list = S and S.lastEntries or nil
    local it = list and list[idx] or nil
    if not it then return false end
    if not ROSTERV.D then
      ROSTERV.D = env.render.new({ platform = env.platform, layers = env.layers,
        log = function(m) print(m) end })
    end
    local W, H = env.canvas()
    local nodes = S.detail {
      canvas = { W, H },
      device = (IS_MOBILE and 'mobile') or 'pc',
      title = tostring(it.nm or ''),
      body = tostring(it.full or it.desc or ''),
      hint = '点任意处关闭',
      onClose = function() FN.rosterV2DetailClose() end,
    }
    ROSTERV.dnodes = nodes
    ROSTERV.D.clear()
    ROSTERV.D.apply(nodes)
    local ctl = ROSTERV.D.get('charDetailHit')
    if ctl then env.addCursor(ctl, 'CursorClick', function() FN.rosterV2DetailClose() end) end
    ROSTERV.dopen = true
    print('char detail v2 nodes=' .. #nodes .. ' idx=' .. tostring(idx)
      .. ' issues=' .. #ROSTERV.D.issues())
    return true
  end

  -- 诊断/测试入口：拿到新路径的 render 实例与最近一次描述（headless 测试读字段用）
  FN.rosterV2R = function() return ROSTERV.R end
  FN.rosterV2Nodes = function() return ROSTERV.nodes end
  FN.rosterV2D = function() return ROSTERV.D end
  FN.rosterV2DNodes = function() return ROSTERV.dnodes end

  FN.rosterV2Close = function()
    if ROSTERV.D then ROSTERV.D.clear() end
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
        print('char detail open ' .. ii)
        FN.rosterV2Detail(ii)
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
    -- v6.4 S3：只剩一条路（v1 已删）。能力不齐时明确报缺口，不再静默回落到旧实现。
    if FN.rosterV2Build() then return end
    print('roster skip (v2 未接线：需要 ROSTER_ENV 注入 platform/render/layers/config/kit/viewRoster)')
  end

  -- ===== v6.4 S3：v1 手建实现已整体删除（搬迁完成）=====
  -- 保留这个名字作为**转发壳**：main / 用例里的旧调用点（FN.rosterBuild / FN.charShow）不断链。
  FN.rosterBuild = function(keepSel, keepTab)
    return FN.rosterV2Build(keepSel, keepTab)
  end

  return true                      -- M.new 的契约：装配成功（main 会 assert 这个值）
end

return M
