--[[==========================================================================
tetris/ui.lua —— v5.0 UI 布局**唯一实现**（背景满幅 / 五屏逐屏布局 / 手机按钮 / 技能 HUD）
----------------------------------------------------------------------------
为什么要有这个文件（用户 2026-10-29 试玩打回五条）：
  1) 「壁纸没有覆盖游戏，两侧有部分缺失」——背景构图按 1280×720 设计板摆，换宽画布只剩底色；
     且 applyModeTheme 在标题页**从未被调用**（真机日志 mode theme= / bg cover 都是 0 条）。
  2) 「移动端的按键位置设置不合理，没有去每个画面核验美观和大小」——旧实现只有一套位置走到底。
  3) 「没有为每个动画单独核验美术」——控件三态/尺寸/字号没有统一来源。
  4) 「移动端没法体验核心玩法：和 AI 对抗，错误判定为双人玩法了」——模式门禁在 main 里判 i>1。
  5) 「PC 和移动端 UI 不一致」——两套坐标各写一份。
本文件把「同一套数据算两种画布」写成一条路径：**plan(screen) 产出 rect，apply(plan) 落控件**；
PC 的 rect 逐字保留 v4.0 的数值（所以 PC 观感不变），移动端另给一套（逐屏重排）。

契约（docs/research/lua-module-contract.md）：本文件**未挂载、只被 require**；chunk 在 OnInit
阶段执行 ⇒ 顶层不许实例化控件；`script`/`game` 由 main 注入。真机方法签名严格（SetVisible 两参、
SetLocalRotation 三参），一律走 widgets 的 pcall 护栏。
=========================================================================]]

local M = {}

M.new = function(spec)
  local game = spec.game
  local cfg = spec.cfg
  local NUM = cfg.NUM
  local KIT = NUM.UI_KIT or {}
  local COL = NUM.UI_COL or {}
  local C = cfg.C
  local WID = spec.widgets
  local trySet, tryCall, addCursor = WID.trySet, WID.tryCall, WID.addCursor
  local U = { screen = 'title', page = 1 }
  local BG_IMG = { rect = 100001, circle = 100002, triangle = 100003, fourstar = 100004,
                   fivestar = 100005, ring = 100006 }

  local THEMEDARK = (cfg.THEME and cfg.THEME.textMain) or 0xFF3E4A63
  local function f1(v) return string.format('%.2f', v or 0) end
  local function log(s) print(s) end
  local function canvas()
    local W, H = spec.canvas()
    return W or 1280, H or 720
  end
  local function mobile() return spec.mobile() and true or false end
  local function center(c, x, y, w, h)
    if not c then return end
    if w then tryCall(c, 'SetSizeDelta', w, h) end
    tryCall(c, 'SetAnchoredPosition', x, y)
  end

  ----------------------------------------------------------------------------
  -- ① 背景满幅（cover）：wash 整屏底 + 构图按 bs=max(W/1280,H/720) 缩放
  ----------------------------------------------------------------------------
  local function skinItem(ctl, sp)
    if not ctl then return false end
    tryCall(ctl, 'SetSizeDelta', sp.w, sp.h)
    tryCall(ctl, 'SetAnchoredPosition', sp.x, sp.y)
    trySet(ctl, 'imageColor', sp.c)
    -- SetLocalRotation 真机三参：tryCall 按实参个数分发最多两个 ⇒ 必须显式三参 pcall
    if not pcall(function() ctl:SetLocalRotation(0, 0, sp.rot or 0) end) then
      pcall(function() ctl:SetLocalRotation(0, 0) end)
    end
    local img = BG_IMG[sp.s or 'rect'] or BG_IMG.rect
    local enumT = (type(Enum) == 'table' and Enum.ImageSource) or nil
    local ok = false
    if enumT and enumT.StaticReference ~= nil then
      ok = pcall(function() ctl:SetImage(enumT.StaticReference, img) end)
    end
    if not ok then ok = pcall(function() ctl:SetImage('StaticReference', img) end) end
    return true
  end

  -- 五屏共用同一条背景路径：wash（整屏不透明底，保证四边 0 缺口）+ cover 构图（保证有美术）
  U.bgApply = function(mode, screen)
    local m = mode or 'casual'
    local t = cfg.MODE_THEME[m] or cfg.MODE_THEME.casual
    local specs = cfg.MODE_BG[m] or cfg.MODE_BG.casual
    local pool = spec.pool()
    local W, H = canvas()
    local bs = math.max(W / (NUM.BG_BASE_W or 1280), H / (NUM.BG_BASE_H or 720))
    local n = 0
    local extL, extR, extB, extT = 0, 0, 0, 0
    if pool then
      local wash = pool[1]
      if wash then
        -- wash 比画布大 20px：抗锯齿边缘不留 1px 缝
        tryCall(wash, 'SetSizeDelta', W + 20, H + 20)
        tryCall(wash, 'SetAnchoredPosition', 0, 0)
        trySet(wash, 'imageColor', t.bg)
        extL, extR, extB, extT = -(W / 2 + 10), (W / 2 + 10), -(H / 2 + 10), (H / 2 + 10)
      end
      for i = 1, #pool - 1 do
        local sp0 = specs[i]
        local ctl = pool[i + 1]
        if sp0 then
          -- 外接圆半径按**缩放后**尺寸算（旋转矩形用外接圆是保守上界，不会高估覆盖）
          local sp = { s = sp0.s, x = (sp0.x or 0) * bs, y = (sp0.y or 0) * bs,
                       w = (sp0.w or 0) * bs, h = (sp0.h or 0) * bs, c = sp0.c, rot = sp0.rot }
          if skinItem(ctl, sp) then
            n = n + 1
            -- 旋转矩形的 AABB（旧实现用**外接圆**：1760×44 的云带 y 方向被高估成 ±880，
            -- 于是判据永远"过"或永远"不过"，两头都不可信）。ex/ey 是半宽/半高。
            local rad = math.rad(sp.rot or 0)
            local ca, sa = math.abs(math.cos(rad)), math.abs(math.sin(rad))
            local ex = (sp.w / 2) * ca + (sp.h / 2) * sa
            local ey = (sp.w / 2) * sa + (sp.h / 2) * ca
            if sp.x - ex < extL then extL = sp.x - ex end
            if sp.x + ex > extR then extR = sp.x + ex end
            if sp.y - ey < extB then extB = sp.y - ey end
            if sp.y + ey > extT then extT = sp.y + ey end
          end
        elseif ctl then
          -- 空槽：缩 1×1 挪出画布（真机 SetVisible 对实例不可靠 ⇒ 只信坐标）
          tryCall(ctl, 'SetSizeDelta', 1, 1)
          tryCall(ctl, 'SetAnchoredPosition', 0, -4000)
        end
      end
    end
    if spec.theme then
      local th = spec.theme()
      if th then
        if spec.plate() then trySet(spec.plate(), 'imageColor', t.plate) end
        -- v5.4：框色优先交给 main 的 FN.paintFrames（席位身份色）；没有该钩子才退回模式色。
        -- 旧实现无条件涂模式色 ⇒ 角色/席位配色被每屏主题覆盖（美术评审 A14/A9 的根因）。
        local fr = spec.frames()
        local painted = spec.paintFrames and spec.paintFrames()
        if fr and not painted then
          for i = 1, 4 do if fr[i] then trySet(fr[i], 'imageColor', t.frame) end end
        end
      end
    end
    -- 判据（用户/lead 2026-10-29 定）：**四边 0 缺口**，不是 92%
    local needX, needY = W / 2, H / 2
    local scr = screen or U.screen or '?'
    if extL <= -needX and extR >= needX and extB <= -needY and extT >= needY then
      log('bg cover ok bs=' .. f1(bs) .. ' w=' .. math.floor(W) .. ' h=' .. math.floor(H)
        .. ' screen=' .. scr .. ' comps=' .. n .. '/' .. #specs .. ' wash=' .. (pool and pool[1] and 1 or 0)
        .. ' ext=' .. math.floor(extL) .. ',' .. math.floor(extR) .. ',' .. math.floor(extB) .. ',' .. math.floor(extT))
    else
      log('bg cover GAP bs=' .. f1(bs) .. ' screen=' .. scr
        .. ' dxL=' .. math.floor(-needX - extL) .. ' dxR=' .. math.floor(needX - extR)
        .. ' dyB=' .. math.floor(-needY - extB) .. ' dyT=' .. math.floor(needY - extT)
        .. ' comps=' .. n .. '/' .. #specs)
    end
    log('mode theme=' .. tostring(m) .. ' bg=' .. n .. '/' .. #specs)
    return n
  end

  ----------------------------------------------------------------------------
  -- ② 布局数据：五屏 × 两画布族。**唯一数据源**（plan → apply）
  ----------------------------------------------------------------------------
  -- 文字框统一记账：name = 控件名（服务端 textbox + HUD 实例双写），fs = 字号
  local function T(name, x, y, w, h, fs) return { name = name, x = x, y = y, w = w, h = h, fs = fs } end
  local function B(id, x, y, w, h, fs) return { id = id, x = x, y = y, w = w, h = h, fs = fs } end

  -- PC：逐字保留 v4.0 `layout()` 的数值（PC 不许因为移动端改动而变样）
  local function planPC(W, H)
    local halfW, halfH = W / 2, H / 2
    local panelW = 420
    local leftCX = -(halfW - panelW / 2 - 20)
    local rightCX = halfW - panelW / 2 - 20
    local t = {
      title = T('title', leftCX, 130, panelW, 100),
      hud = T('hud', leftCX, 40, panelW + 40, 40, 20),
      best = T('best', leftCX, -10, panelW, 36, 20),
      hint = T('hint', leftCX, -95, panelW, 150, 22),
      hudNext = T('hudNext', rightCX, 255, 200, 44, 22),
      keyA = T('keyA', rightCX, -40, panelW, 38, 22),
      keyB = T('keyB', rightCX, -80, panelW, 38, 22),
      keyC = T('keyC', rightCX, -120, panelW, 38, 22),
      topBanner = T('topBanner', 0, halfH - 36, W - 180, 64, 34),
      botBanner = T('botBanner', 0, -(halfH - 28), W - 180, 48, 22),
    }
    -- 实例份尺寸与 textbox 份不同（历史上按实测定的，见 v3.5 ④）：hudNext 240 / 其余同宽
    local ti = {
      hud = T('hud', leftCX, 40, panelW + 40, 40, 20),
      best = T('best', leftCX, -10, panelW, 36, 20),
      hint = T('hint', leftCX, -95, panelW, 150, 22),
      hudNext = T('hudNext', rightCX, 255, 240, 44, 22),
      keyA = T('keyA', rightCX, -40, panelW, 38, 22),
      keyB = T('keyB', rightCX, -80, panelW, 38, 22),
      keyC = T('keyC', rightCX, -120, panelW, 38, 22),
      topBanner = T('topBanner', 0, halfH - 36, W - 180, 64, 34),
      botBanner = T('botBanner', 0, -(halfH - 28), W - 180, 48, 22),
    }
    -- 技能 HUD（PC 也上屏：用户 2026-10-29「四个角色技能和没做没区别」）；摆在左栏 hint 下方
    local sk = {}
    sk.skRole = T('skRole', leftCX, -186, panelW, 36, 20)
    sk.sk1name = T('sk1name', leftCX - 105, -226, 210, 36, 20)
    sk.sk1state = T('sk1state', leftCX + 105, -226, 190, 36, 20)
    sk.sk1bar = T('sk1bar', leftCX - 95, -248, 220, 14)
    sk.sk1barBg = T('sk1barBg', leftCX - 95, -248, 220, 14)
    sk.sk2name = T('sk2name', leftCX - 105, -284, 210, 36, 20)
    sk.sk2state = T('sk2state', leftCX + 105, -284, 190, 36, 20)
    sk.sk2bar = T('sk2bar', leftCX - 95, -306, 220, 14)
    sk.sk2barBg = T('sk2barBg', leftCX - 95, -306, 220, 14)
    return { text = t, inst = ti, slots = {}, nav = {}, acts = {}, skill = sk,
             rightCX = rightCX, leftCX = leftCX, panelW = panelW }
  end

  -- PC 双盘：**照抄 layoutDual 的数值**（双盘几何的唯一真源仍在 main.lua 的 FN.layoutDual，
  -- 这里只是"同一份数据"，避免模块在 layoutDual 之后把字号/框宽改回单盘值 —— 那会让
  -- ikeyA 在 360×40 的框里塞 22 号长文案，出图判据 fits=false（首版实测）。
  local function planPCDual(W, H, guide)
    local halfW, halfH = W / 2, H / 2
    local gutterX = -(halfW - 186)
    local rightCX = halfW - 210 - 20
    local t = {
      hud = T('hud', gutterX, 250, 348, 40, 17),
      best = T('best', gutterX, 202, 330, 36, 20),
      hint = T('hint', gutterX, -95, 330, 150, 22),
      hudNext = T('hudNext', rightCX, 255, 240, 44, 22),
      -- keyA-C 的 x 由 FN.layoutDual 负责；本模块只**改框高与行位**（qa-shots 实测 ikeyA 需高 73.3、
      -- ikeyB 需 51.7，而旧框都是 40 ⇒ 折行被裁）。coop 模式下这两行装的是协作键位说明（x=∓280），
      -- 位置由 coop 分支自己写，本模块一律不碰（用例 33 断言 keyA.x=-280）。
      topBanner = T('topBanner', 0, halfH - 36, W - 180, 64, 34),
      botBanner = T('botBanner', 0, -(halfH - 28), W - 180, 48, 22),
      title = T('title', gutterX, 130, 420, 100),
    }
    if spec.mode and spec.mode() ~= 'coop' then
      if guide then
        -- v5.4 修 A5（5 份评审 2/5：「双盘准备屏右侧键位说明被右缘裁字/折出孤字」）：
        -- 准备期 keyA/B 装的是**长键位串**（P1 一行 24~30 全角），塞进右栏 360 宽 ⇒ 折行孤字。
        -- 席位的语义位置就在**各自棋盘正下方**（P1 左 / AI·P2 右），与 main 准备态写位同一份数值；
        -- 540×44 + 18 号实测单行可容纳，中缝留 320 给「按任意键开始」。
        -- v5.4（用户 2026-10-30 二-1「两盘往中间靠一点」）：盘心 ±280 → ±236，
        -- 席位卡改成**以盘心对称**的 460 宽（18 → 17 号字仍单行放得下），中缝 12px 不打架。
        local seatW = 460
        local rowY = -(H / 2 - 110)
        local seatX = 236
        t.keyA = T('keyA', -seatX, rowY, seatW, 44, 17)
        t.keyB = T('keyB', seatX, rowY, seatW, 44, 17)
        t.keyC = T('keyC', 0, -4000, 40, 40, 16)     -- 准备期第三行空（main 隐藏）
        -- 准备提示从"中缝挤一行"挪到**顶部标题下方**（中缝只有 172px，塞不下提示语）
        t.hint = T('hint', 0, H / 2 - 108, 460, 40, 18)
      else
        t.keyA = T('keyA', 600, -40, 360, 76, 18)   -- 3 行折行需 73.3
        t.keyB = T('keyB', 600, -104, 360, 56, 16)  -- 2 行需 51.7
        t.keyC = T('keyC', 600, -162, 360, 56, 16)
      end
    end
    local ti = {}
    for k, v in pairs(t) do ti[k] = v end
    -- 双盘左栏只有 390px（21:9 时 x∈[-1050,-660]）⇒ 技能卡按 330 宽收，名字/状态各 150
    local sk = {
      skRole = T('skRole', gutterX, -186, 330, 36, 20),
      sk1name = T('sk1name', gutterX - 75, -226, 150, 36, 20),
      sk1state = T('sk1state', gutterX + 75, -226, 150, 36, 20),
      sk1bar = T('sk1bar', gutterX, -248, 330, 12),
      sk1barBg = T('sk1barBg', gutterX, -248, 330, 12),
      sk2name = T('sk2name', gutterX - 75, -284, 150, 36, 20),
      sk2state = T('sk2state', gutterX + 75, -284, 150, 36, 20),
      sk2bar = T('sk2bar', gutterX, -306, 330, 12),
      sk2barBg = T('sk2barBg', gutterX, -306, 330, 12),
    }
    return { text = t, inst = ti, slots = {}, nav = {}, acts = {}, skill = sk,
             rightCX = rightCX, leftCX = gutterX, panelW = 420, dual = true }
  end

  -- 移动端公共量：棋盘 300×600 居中 ⇒ 左右各一列、上下各一条 60px 带（720 画布）
  local function bands(W, H)
    local halfW, halfH = W / 2, H / 2
    local pad = KIT.MARGIN or 18
    return {
      halfW = halfW, halfH = halfH,
      colW = halfW - 160,                       -- 侧列宽（1280: 480）
      colL = -(halfW + 160) / 2,                -- 侧列中心 x（1280: -400）
      colR = (halfW + 160) / 2,
      textW = halfW - 200,                      -- 侧列文字框宽（1280: 440）
      topY = halfH - 28,                        -- 上带中线（1280: 332）
      botY = -(halfH - 30),                     -- 下带中线（1280: -330）
      pad = pad,
    }
  end

  local function planMobile(W, H, dual, guide)
    local g5 = bands(W, H)
    local halfH, halfW = g5.halfH, g5.halfW
    local colL, colR, tw = g5.colL, g5.colR, g5.textW
    local t, ti, slots, nav = {}, {}, {}, {}
    if not dual then
      -- ── 单盘：侧列放 HUD/技能/拇指簇；下带放技能行 + 导航；上带放常驻提示 ──
      t.hud = T('hud', colL, halfH - 80, tw, 40, 20)
      t.best = T('best', colL, halfH - 116, tw, 34, 20)
      t.hint = T('hint', colL, halfH - 186, tw, 96, 20)
      -- 预览列心 RIGHT_CX 沿用 PC 公式（1280 → 410）：用例 15/16 断言预览块绝对 x，
      -- 擅自改成侧列中线 400 会让它们红（实测 400→390），且 410 仍在右列内。
      local rcx = halfW - 230
      t.hudNext = T('hudNext', rcx, halfH - 60, 240, 44, 22)
      -- v5.4（用户 2026-10-30 真机截图：手机上这条横幅横穿棋盘）：手机画布只有 720 高、
      -- 棋盘 600 高居中 ⇒ 顶部只剩 60px，横幅放不下，原来 y=+60（屏幕 y=300）正好压在棋盘腰部。
      -- 改到**画布底部中央**（棋盘下沿之下、两块拇指簇之间）：常驻键位提示仍在顶部，二者不再打架。
      t.topBanner = T('topBanner', 0, -((H / 2) - 34), math.min(820, W - 200), 40, 22)
      t.botBanner = T('botBanner', 0, g5.topY, W - 360, 44, 20)
      t.keyA = T('keyA', colR, -4000, tw, 34, 18)      -- 单盘无对家盘：挪出画布
      t.keyB = T('keyB', colR, -4000, tw, 34, 18)
      t.keyC = T('keyC', colR, -4000, tw, 34, 18)
      t.title = T('title', colL, -4000, tw, 80, 20)
      ti.hud, ti.best, ti.hint = t.hud, t.best, t.hint
      ti.hudNext = T('hudNext', rcx, halfH - 60, 240, 44)
      ti.topBanner = T('topBanner', 0, 60, math.min(560, W - 160), 72)
      ti.botBanner = t.botBanner
      ti.keyA, ti.keyB, ti.keyC = t.keyA, t.keyB, t.keyC
      -- 拇指簇：左 [◀ ▶] 一行 + 旋转 上方；右 [锁定 缓降] + 暂存（镜像）
      local bw, bh = NUM.PHONE.SIDE_W, NUM.PHONE.SIDE_H
      -- v5.32（用户：手机端左右两边都要有「旋转」和「暂存」）：
      --   左簇上排 = 旋转(rot) + 暂存(hold2)；右簇上排 = 暂存(hold) + 旋转(rot2)。
      --   两侧对称，单手都能按到；act 与主键相同，逻辑零改动。
      -- v5.35（用户：按钮直接重叠了）：原间距 130/76 对 120×72 的键只留 10/4px，
      -- 再加上描边外扩 2px ⇒ 相邻两键贴死甚至视觉重叠。改成 144/92（净距 20/16）。
      slots[#slots + 1] = B('left', colL - 72, g5.botY + 30, bw, bh, KIT.FS)
      slots[#slots + 1] = B('right', colL + 72, g5.botY + 30, bw, bh, KIT.FS)
      slots[#slots + 1] = B('rot', colL - 72, g5.botY + 122, bw, bh, KIT.FS)
      slots[#slots + 1] = B('hold2', colL + 72, g5.botY + 122, bw, bh, KIT.FS)
      slots[#slots + 1] = B('hard', colR + 72, g5.botY + 30, bw, bh, KIT.FS)
      slots[#slots + 1] = B('soft', colR - 72, g5.botY + 30, bw, bh, KIT.FS)
      slots[#slots + 1] = B('hold', colR - 72, g5.botY + 122, bw, bh, KIT.FS)
      slots[#slots + 1] = B('rot2', colR + 72, g5.botY + 122, bw, bh, KIT.FS)
      -- 中下技能行（棋盘正下方 60px 带里）
      local sw, sh = NUM.PHONE.SKILL_W, NUM.PHONE.SKILL_H
      -- 技能三键：**右列竖排**（底部中间被 fx 的角色名卡占住 —— lead 2026-10-29 复核：
      -- 「技能1/技能2/换人 不见了，名卡正好落在底部中间」）。竖排避开名卡、也避开右簇的拇指键。
      slots[#slots + 1] = B('skill1', colR, 60, sw, sh, KIT.FS)
      slots[#slots + 1] = B('skill2', colR, -10, sw, sh, KIT.FS)
      slots[#slots + 1] = B('switch', colR, -80, sw, sh, KIT.FS)
      -- 导航键：左列空带（y=-70/-140）。放下带右侧会压右手簇（首版就是这么错的，审计抓到
      -- overlap:hard∩help），放右上角又会压常驻提示条 —— 左列在 sk2bar 与拇指簇之间有一条 130px 空带。
      local nw, nh = NUM.PHONE.NAV_W, NUM.PHONE.NAV_H
      nav[#nav + 1] = B('help', halfW - g5.pad - nw / 2, halfH - g5.pad - nh / 2, nw, nh, KIT.FS)
      nav[#nav + 1] = B('roster', -halfW + g5.pad + nw / 2, halfH - g5.pad - nh / 2, nw, nh, KIT.FS)
      -- 技能 HUD：**紧凑卡片**（lead 2026-10-29 复核：旧版横向铺满屏宽、条 500×8 看不出是能量条）
      -- 每卡 300×64：左侧 6px 主题色竖条 + 第一行「角色名 + 台前」+ 第二行「状态/倒计时」+ 底部 220×14 能量条
      local sk = {}
      sk.skRole = T('skRole', colL, halfH - 250, tw, 36, 20)
      -- 卡 300×76（框高判据：18 号需 30.1、16 号需 27.2 ⇒ 32 / 30）；两卡竖排间距 8
      local cy1, cy2 = -58, -142
      sk.sk1card = T('sk1card', colL, cy1, 300, 76)
      sk.sk1strip = T('sk1strip', colL - 147, cy1, 6, 68)
      sk.sk1name = T('sk1name', colL - 20, cy1 + 18, 230, 32, 18)
      sk.sk1state = T('sk1state', colL - 20, cy1 - 12, 230, 30, 16)
      sk.sk1bar = T('sk1bar', colL - 20, cy1 - 32, 220, 14)
      sk.sk1barBg = T('sk1barBg', colL - 20, cy1 - 32, 220, 14)
      sk.sk2card = T('sk2card', colL, cy2, 300, 76)
      sk.sk2strip = T('sk2strip', colL - 147, cy2, 6, 68)
      sk.sk2name = T('sk2name', colL - 20, cy2 + 18, 230, 32, 18)
      sk.sk2state = T('sk2state', colL - 20, cy2 - 12, 230, 30, 16)
      sk.sk2bar = T('sk2bar', colL - 20, cy2 - 32, 220, 14)
      sk.sk2barBg = T('sk2barBg', colL - 20, cy2 - 32, 220, 14)
      return { text = t, inst = ti, slots = slots, nav = nav, acts = {}, skill = sk,
               rightCX = rcx, dual = false }
    end
    -- ── 双盘（AI 对抗 / 双人）：棋盘 ±280，侧栏只剩 206px ⇒ 拇指簇竖排，技能行放中缝列 ──
    -- 双盘：棋盘 ±280（x∈[-430,-130] / [130,430]），侧栏各 206px、中缝列 260px。
    -- 布局分区（自上而下，三个区互不重叠）：上带=战况一行 / 中缝列=横幅+技能行+技能HUD+导航 / 侧栏=标题+拇指簇
    local gutL, gutR = -(halfW - 103), halfW - 103
    t.hud = T('hud', 0, g5.topY, W - 360, 44, 20)
    t.best = T('best', gutL, -4000, 200, 34, 18)   -- 顶部两角让给导航键（最高分已在底栏/结算页）
    t.hint = T('hint', 0, -4000, 240, 96, 18)          -- 双盘局内 hint 由 layoutDual 自己藏（此处同口径）
    t.hudNext = T('hudNext', gutR, -4000, 200, 40, 20)  -- 同 best：避免被右上角「说明」压住
    t.topBanner = T('topBanner', 0, 250, 240, 60, 24)
    t.botBanner = T('botBanner', 0, -4000, W - 40, 40, 18)   -- 底带让给拇指簇：手机上常驻键位提示本就不需要
    -- 引导态（guideStage==3）keyA-C 装的是长句键位说明（24 全角 ≈ 430px），手机侧栏只有 200px
    -- ⇒ 手机上「键位说明就是按钮本身」，这三行整体挪出画布；对局期它们换回 3 条短战况再回来。
    local kx = -4000      -- 手机双盘侧栏 200px 装不下 2 行长句（lead 机检 ikeyA 需高 73.3）⇒ 三条全部不出；
                          -- 手机上的"AI 盘战况"由两块棋盘本身可见，不需要文字复述
    t.keyA = T('keyA', kx, 60, 200, 32, 18)
    t.keyB = T('keyB', kx, 26, 200, 32, 18)
    t.keyC = T('keyC', kx, -8, 200, 32, 18)
    t.title = T('title', gutL, -4000, 200, 80, 18)
    ti.hud, ti.best, ti.hint = t.hud, t.best, t.hint
    ti.hudNext = t.hudNext
    ti.topBanner = t.topBanner
    ti.botBanner = t.botBanner
    ti.keyA, ti.keyB, ti.keyC = t.keyA, t.keyB, t.keyC
    local bw, bh = NUM.PHONE.SIDE_W, NUM.PHONE.SIDE_H
    -- 拇指簇竖排：底边必须留 6px（首版直接放 botY=-330，72 高 ⇒ 底边 -366 出画布，审计抓到 oob）
    local col0 = g5.botY + 6
    slots[#slots + 1] = B('left', gutL, col0, bw, bh, KIT.FS)
    slots[#slots + 1] = B('right', gutL, col0 + 86, bw, bh, KIT.FS)
    slots[#slots + 1] = B('rot', gutL, col0 + 172, bw, bh, KIT.FS)
    slots[#slots + 1] = B('hard', gutR, col0, bw, bh, KIT.FS)
    slots[#slots + 1] = B('soft', gutR, col0 + 86, bw, bh, KIT.FS)
    slots[#slots + 1] = B('hold', gutR, col0 + 172, bw, bh, KIT.FS)
    local sw, sh = NUM.PHONE.SKILL_W, NUM.PHONE.SKILL_H
    slots[#slots + 1] = B('skill1', 0, 150, sw, sh, KIT.FS)
    slots[#slots + 1] = B('skill2', 0, 80, sw, sh, KIT.FS)
    slots[#slots + 1] = B('switch', 0, 10, sw, sh, KIT.FS)
    local nw, nh = NUM.PHONE.NAV_W, NUM.PHONE.NAV_H
    nav[#nav + 1] = B('help', halfW - g5.pad - nw / 2, halfH - g5.pad - nh / 2, nw, nh, KIT.FS)
    nav[#nav + 1] = B('roster', -halfW + g5.pad + nw / 2, halfH - g5.pad - nh / 2, nw, nh, KIT.FS)
    local sk = {}
    sk.skRole = T('skRole', 0, -50, 240, 32, 18)
    sk.sk1name = T('sk1name', 0, -82, 240, 30, 16)
    sk.sk1state = T('sk1state', 0, -106, 240, 30, 16)
    sk.sk1bar = T('sk1bar', 0, -124, 240, 12)
    sk.sk2name = T('sk2name', 0, -150, 240, 30, 16)
    sk.sk2state = T('sk2state', 0, -174, 240, 30, 16)
    sk.sk2bar = T('sk2bar', 0, -192, 240, 12)
    return { text = t, inst = ti, slots = slots, nav = nav, acts = {}, skill = sk,
             rightCX = gutR, dual = true }
  end

  -- 逐屏：title / help / settle / roster 只出本屏要用的键
  -- 把一组控件整体挪出画布（真机 SetVisible 对实例不可靠 ⇒ "藏"的唯一实现是坐标）
  local PARK_TEXT = { 'hud', 'best', 'hint', 'hudNext', 'keyA', 'keyB', 'keyC' }
  -- v5.38：技能卡是**实例侧**的一组贴片（card/strip/barBg），原来只停了文字份，
  -- 于是角色页左侧会露出那条 6×68 的深色竖条与卡片底（用户截图那两个残留）。
  local PARK_SKILL = { 'skRole', 'sk1name', 'sk1state', 'sk1bar', 'sk1barBg', 'sk1card', 'sk1strip',
    'sk2name', 'sk2state', 'sk2bar', 'sk2barBg', 'sk2card', 'sk2strip' }
  local function parkGroup(p, names)
    for _, nm in ipairs(names) do
      local r = p.text and p.text[nm]
      if r then p.text[nm] = T(nm, r.x or 0, -4000, r.w, r.h, r.fs) end
      local ri = p.inst and p.inst[nm]
      if ri then p.inst[nm] = T(nm, ri.x or 0, -4000, ri.w, ri.h, ri.fs) end
      local rs = p.skill and p.skill[nm]
      if rs then p.skill[nm] = T(nm, rs.x or 0, -4000, rs.w, rs.h, rs.fs) end
    end
  end
  local function planScreen(screen, W, H, isMobile, dual, guide)
    local p
    if not isMobile then p = dual and planPCDual(W, H, guide) or planPC(W, H)
    else p = planMobile(W, H, dual, guide) end
    local halfW, halfH = W / 2, H / 2
    local nw, nh = NUM.PHONE and NUM.PHONE.NAV_W or 116, NUM.PHONE and NUM.PHONE.NAV_H or 56
    local pad = KIT.MARGIN or 18
    if screen == 'title' then
      -- 标题页：**不出游戏键**（旧实现把 ◀▶ 锁定 缓降 摆在标题页底角，压住提示条且毫无用处）
      p.slots = {}
      p.acts = {}
      -- v5.7（用户：「移动端和 PC 不一致」）：标题页两端统一用**入口卡**（角色档案 + 说明），
      -- 不再另开两颗导航按钮 —— 手机上那两颗小按钮既和卡片重复、又会压住卡片。
      p.nav = {}
      -- v5.1（用户 2026-10-29：「主页看不到角色这个大模块的入口」）：PC 标题页也出导航按钮，
      -- 鼠标点 ≡ 键盘（H 说明 / 名册键 角色）。旧实现在 PC 上把 p.nav 清空，导致只有键盘路径。
      if isMobile then parkGroup(p, PARK_TEXT) parkGroup(p, PARK_SKILL) end
      -- 标题页两条横幅：上带留给展台标题（实例），服务端条只留底部操作提示
      p.text.topBanner = T('topBanner', 0, -4000, W, 64, 34)
      p.inst.topBanner = T('topBanner', 0, -4000, W, 64)
      p.text.botBanner = T('botBanner', 0, -(halfH - 28), W - 180, 48, 20)
      p.inst.botBanner = p.text.botBanner
      return p
    end
    if screen == 'help' then
      p.slots = {}
      p.acts = {}
      -- 帮助页自己的「合上」热区由 main 的 buildHelpLayer 建；这里只留移动端可点的
      -- 合上 / 回标题 / 翻页 三颗（触屏没有 H / Q 物理键）
      -- 帮助页 nav 放**顶部两角**：底部中间是标题展台的「H 游戏说明」热区（menuHelpZone
      -- x∈[160,420]），叠上去 qa-shots 判 overlap 24.6%（点下去只有上层收得到）。
      -- 帮助页 nav：**不放合一键**（帮助层自带「合上手册」热区 helpCloseHit，放重叠会被判
      -- 点不动）；回标题/翻页放左下角，避开顶部右上合上键与底部中间的展台 H 热区。
      p.nav = isMobile and {
        B('page', -halfW + pad + nw / 2, -(halfH - pad - nh / 2), nw, nh, KIT.FS),
        B('home', -halfW + pad + nw / 2, -(halfH - pad - nh / 2) + 70, nw, nh, KIT.FS),
      } or {}
      p.text.topBanner = T('topBanner', 0, -4000, W, 64, 34)
      p.inst.topBanner = T('topBanner', 0, -4000, W, 64)
      p.text.botBanner = T('botBanner', 0, -4000, W - 180, 48, 20)
      p.inst.botBanner = p.text.botBanner
      if isMobile then parkGroup(p, PARK_TEXT) parkGroup(p, PARK_SKILL) end
      return p
    end
    if screen == 'settle' then
      -- 结算页：只出三颗行动键（再来一局 / 回主页 / 明细），不出游戏键
      p.slots = {}
      local aw, ah = NUM.PHONE.ACT_W or 208, NUM.PHONE.ACT_H or 64
      local y = isMobile and -(halfH - pad - ah / 2) or -4000
      p.acts = {
        B('again', 0, y + 90, aw * 1.15, ah, KIT.FS + 2),
        B('home', -(aw * 0.62), y, aw, ah, KIT.FS),
        B('detail', aw * 0.62, y, aw, ah, KIT.FS),
      }
      if not isMobile then p.acts = {} end
      p.nav = {}
      return p
    end
    if screen == 'roster' then
      p.slots = {}
      p.acts = {}
      -- v5.38：角色页**自带右上角「合上」**（CTL.btn）⇒ 不再额外给一颗底部导航键，
      -- 否则手机上会多出一个叠在面板下沿的假按钮（用户截图里那颗没内容的「合上」）。
      p.nav = {}
      if isMobile then parkGroup(p, PARK_TEXT) parkGroup(p, PARK_SKILL) end
      return p
    end
    return p   -- game
  end

  U.plan = function(screen, dual, guide)
    local W, H = canvas()
    return planScreen(screen or U.screen, W, H, mobile(), dual, guide)
  end

  ----------------------------------------------------------------------------
  -- ③ 手机按钮工厂（胶囊底 + 描边 + 文字 + 命中热区；三态统一）
  ----------------------------------------------------------------------------
  -- 胶囊 = 中段矩形 + 两端半圆（真机没有圆角矩形图元）。描边 = 外扩 EDGE 的同类胶囊垫在下面。
  local function pill(name, w, h, color)
    local iw = math.max(2, w - h)
    local parts = {}
    local body = spec.instCell(name .. 'b')
    if not body then return nil end
    tryCall(body, 'SetSizeDelta', iw, h)
    trySet(body, 'imageColor', color)
    parts[#parts + 1] = body
    for _, sx in ipairs({ -1, 1 }) do
      local cap = spec.instCell(name .. (sx < 0 and 'l' or 'r'))
      if cap then
        -- v5.33（用户：圆角设计哦）：半圆必须把图元换成 **circle(100002)**，否则虽然尺寸是方的
        -- 也照样画成一个方块 ⇒ 胶囊两端是直角（实测手机按钮全是直角，就是这个原因）。
        if Enum and Enum.ImageSource then
          pcall(function() cap:SetImage(Enum.ImageSource.StaticReference, 100002) end)
        end
        tryCall(cap, 'SetSizeDelta', h, h)
        trySet(cap, 'imageColor', color)
        parts[#parts + 1] = cap
      end
    end
    return { parts = parts, iw = iw, w = w, h = h, name = name }
  end
  local function placePill(p, x, y)
    if not p then return end
    local iw, h = p.iw, p.h
    tryCall(p.parts[1], 'SetAnchoredPosition', x, y)
    if p.parts[2] then tryCall(p.parts[2], 'SetAnchoredPosition', x - iw / 2, y) end
    if p.parts[3] then tryCall(p.parts[3], 'SetAnchoredPosition', x + iw / 2, y) end
  end
  local function setPillColor(p, color)
    if not p then return end
    for i = 1, #p.parts do trySet(p.parts[i], 'imageColor', color) end
  end

  local function makeBtn(def, w, h, fs, group)
    local id = def.id
    local gp = group or ''
    local b = { id = id, act = def.act, w = w, h = h, rep = def.rep, fs = fs, label = def.label }
    -- 名字带分组前缀（pad/nav/act）：`home` 在帮助页与结算页各有一颗，重名会让按名锚定的
    -- 巡检抓到两个不同坐标（qa-shots 报 `phhome×2`）
    b.edge = pill('pe' .. gp .. id, w + (KIT.EDGE or 3) * 2, h + (KIT.EDGE or 3) * 2, COL.btnEdge)
    b.bg = pill('pb' .. gp .. id, w, h, COL.btnBg)
    b.txt = spec.instText('pt' .. gp .. id, def.label, w, h, fs)
    -- 热区最后建（层序惯例：后建在上，命中优先）
    b.hit = (spec.instHit2 or spec.instHit)('ph' .. gp .. id, w, h)
    if not (b.bg and b.hit) then return nil end
    if b.txt then
      trySet(b.txt, 'verticalAlignment', 'Middle')
      trySet(b.txt, 'horizontalAlignment', 'Middle')
    end
    addCursor(b.hit, 'CursorEnter', function() U.paint(b, 'hover') end)
    addCursor(b.hit, 'CursorExit', function() U.paint(b, 'normal') end)
    addCursor(b.hit, 'CursorUp', function() U.paint(b, 'hover') U.stopRep(b) end)
    addCursor(b.hit, 'CursorDown', function()
      if spec.sfx then spec.sfx() end
      U.paint(b, 'down')
      print('phone tap ' .. id)
      if U.dispatch then U.dispatch(b.act, id) end
      if b.rep then U.rep = { b = b, t = 0, n = 0 } end
    end)
    -- v5.4：按钮建完立刻挪出画布，**等到 applyButtons 给它几何才回到屏幕**。
    -- 旧实现建在原点（屏幕正中），只要有一次 apply 没覆盖到（标题页只登记 help/roster），
    -- 结算三键就会躺在画面中央（手机标题页实测：棋盘正中一块胶囊形贴片）。
    -- ⚠ 这里不能用 park(b)：`local function park` 声明在 makeBtn 之后，
    -- 闭包里解析成全局 nil（Lua 词法作用域），必须就地展开。
    placePill(b.edge, 0, -4000)
    placePill(b.bg, 0, -4000)
    if b.txt then tryCall(b.txt, 'SetAnchoredPosition', 0, -4000) end
    if b.hit then tryCall(b.hit, 'SetAnchoredPosition', 0, -4000) end
    return b
  end

  U.paint = function(b, st)
    if not b then return end
    local col = COL.btnBg
    if st == 'hover' then col = COL.btnHover elseif st == 'down' then col = COL.btnPress end
    setPillColor(b.bg, col)
    local dy = (st == 'down') and -(KIT.PRESS_DY or 4) or 0
    if b.x then
      placePill(b.bg, b.x, b.y + dy)
      if b.txt then tryCall(b.txt, 'SetAnchoredPosition', b.x, b.y + dy) end
    end
  end

  U.stopRep = function(b)
    local r = U.rep
    if not r then return end
    if b and r.b ~= b then return end
    if (r.n or 0) >= 2 then print('phone rep done id=' .. r.b.id .. ' n=' .. r.n) end
    U.rep = nil
  end

  -- 建按钮**延到第一帧**（OnStart 里建出来的实例收不到光标事件：menuZone 也是 OnStart 建，
  -- 但标题页 demo 循环每次复位都会重建它，所以它"看起来正常"；实证见 docs/v5-layout-spec.md）
  U.padBuild = function(isMobile)
    U.wantBuild = isMobile and true or false
    print('phone build queued device=' .. (U.wantBuild and 'mobile' or 'pc'))
  end

  U.padBuildNow = function(isMobile)
    U.mobile = isMobile and true or false
    U.btns, U.navBtns, U.actBtns = {}, {}, {}
    U.regScreen('play')
    if not U.mobile then
      print('phone build skip device=pc')
      return
    end
    local n = 0
    for _, it in ipairs(NUM.PHONE.items or {}) do
      local w, h = NUM.PHONE.SIDE_W, NUM.PHONE.SIDE_H
      if it.slot and it.slot:sub(1, 1) == 'M' then w, h = NUM.PHONE.SKILL_W, NUM.PHONE.SKILL_H end
      local b = makeBtn(it, w, h, KIT.FS, 'p')
      if b then b.slot = it.slot U.btns[#U.btns + 1] = b n = n + 1 end
    end
    for _, it in ipairs(NUM.PHONE.nav or {}) do
      local b = makeBtn(it, NUM.PHONE.NAV_W, NUM.PHONE.NAV_H, KIT.FS, 'n')
      if b then U.navBtns[#U.navBtns + 1] = b n = n + 1 end
    end
    -- 帮助页翻页键（第 2/2 页才标「次页」，U.sync 里改字）
    local pb = makeBtn({ id = 'page', label = '次页', act = 'page' }, NUM.PHONE.NAV_W, NUM.PHONE.NAV_H, KIT.FS, 'n')
    if pb then U.pageBtn = pb n = n + 1 end
    for _, it in ipairs(NUM.PHONE.actions or {}) do
      local b = makeBtn(it, NUM.PHONE.ACT_W, NUM.PHONE.ACT_H, KIT.FS, 'a')
      if b then U.actBtns[#U.actBtns + 1] = b n = n + 1 end
    end
    U.allBtns = {}
    for _, list in ipairs({ U.btns, U.navBtns, { pb }, U.actBtns }) do
      for _, b in ipairs(list) do if b then U.allBtns[#U.allBtns + 1] = b end end
    end
    print('phone build n=' .. n .. ' (pad=' .. #U.btns .. ' nav=' .. #U.navBtns
      .. ' act=' .. #U.actBtns .. ')')
  end

  local function park(b)
    if not b then return end
    b.x, b.y = 0, -4000
    placePill(b.edge, 0, -4000)
    placePill(b.bg, 0, -4000)
    if b.txt then tryCall(b.txt, 'SetAnchoredPosition', 0, -4000) end
    if b.hit then tryCall(b.hit, 'SetAnchoredPosition', 0, -4000) end
  end

  local function placeBtn(b, r)
    if not b then return end
    if not r then park(b) return end
    b.x, b.y, b.w, b.h = r.x, r.y, r.w, r.h
    placePill(b.edge, r.x, r.y)
    placePill(b.bg, r.x, r.y)
    if b.txt then
      tryCall(b.txt, 'SetSizeDelta', r.w, r.h)
      tryCall(b.txt, 'SetAnchoredPosition', r.x, r.y)
    end
    if b.hit then
      tryCall(b.hit, 'SetSizeDelta', r.w, r.h)
      tryCall(b.hit, 'SetAnchoredPosition', r.x, r.y)
    end
  end

  -- 按 id 找几何：先槽位键（游戏键）→ 导航键 → 结算键
  local function applyButtons(p)
    if not U.mobile then return end
    local byId = {}
    for _, list in ipairs({ p.slots or {}, p.nav or {}, p.acts or {} }) do
      for _, r in ipairs(list) do byId[r.id] = r end
    end
    for _, b in ipairs(U.allBtns or {}) do
      local r = byId[b.id]
      if not r and b.id == 'page' then
        -- 翻页键只在帮助页出现
        for _, rr in ipairs(p.nav or {}) do if rr.id == 'page' then r = rr end end
      end
      placeBtn(b, r)
      -- 注册到巡检表：`ctl dump screen=game` 会打印每颗拇指键的**实际屏幕坐标**
      -- （测试拿它算点击坐标，别再手写会漂移的魔数）
      if r and b.hit then U.regAdd('phone.' .. tostring(b.id), b.hit, r.w, r.h) end
    end
    -- 唯一收口：任何一次摆位（apply/reapply/navRecreate 都走这里）之后，若浮层开着就再收一次。
    if U.padHidden and U.padVisible then U.padVisible(false) end
    if U.mobile and U.dump then pcall(U.dump, U.cur or 'game') end
  end

  ----------------------------------------------------------------------------
  -- ④ 技能 HUD（lead 按控件名写值：sk1name/sk1state/sk1bar/sk2name/sk2state/sk2bar + skRole）
  ----------------------------------------------------------------------------
  U.skillBuild = function()
    if U.skill then return end
    if not spec.instText then return end
    U.skill = {}
    -- 层序铁律：运行时实例**后建在上** ⇒ 卡底/竖条/条底必须先建，文字与能量条后建，
    -- 否则白卡把角色名/状态/条全盖住（lead 2026-10-29 复核："技能 HUD 变成一块空白白条"）。
    for _, k in ipairs({ 'sk1card', 'sk2card' }) do
      local c = spec.instCell(k)
      if c then trySet(c, 'imageColor', COL.panel) end
      U.skill[k] = c
    end
    for _, k in ipairs({ 'sk1strip', 'sk2strip' }) do
      local c = spec.instCell(k)
      if c then trySet(c, 'imageColor', COL.stripe or COL.btnEdge) end
      U.skill[k] = c
    end
    for _, k in ipairs({ 'sk1barBg', 'sk2barBg' }) do
      local c = spec.instCell(k)
      if c then trySet(c, 'imageColor', COL.barBg or COL.btnBg) end
      U.skill[k] = c
    end
    local function txt(name, w, h, fs)
      local c = spec.instText(name, '', w, h, fs or 18)
      if c then
        trySet(c, 'horizontalAlignment', 'Middle')
        trySet(c, 'verticalAlignment', 'Middle')
        trySet(c, 'fontColor', THEMEDARK)
      end
      return c
    end
    U.skill.skRole = txt('skRole', 240, 32, 18)
    U.skill.sk1name = txt('sk1name', 230, 32, 18)
    U.skill.sk1state = txt('sk1state', 230, 30, 16)
    U.skill.sk2name = txt('sk2name', 230, 32, 18)
    U.skill.sk2state = txt('sk2state', 230, 30, 16)
    for _, k in ipairs({ 'sk1bar', 'sk2bar' }) do
      local c = spec.instCell(k)
      if c then trySet(c, 'imageColor', COL.barFill or COL.btnPress) end
      U.skill[k] = c
    end
    -- v5.4 用户 2026-10-30 三-1：两张技能卡做成**可点区域**——移动端点卡即放技能，
    -- PC 鼠标也能点（键盘 Z/U 仍走同一入口）。热区单独建、由 applyText 跟随卡片摆位。
    if spec.makeHit and spec.bindCursor and spec.onSkillArea then
      U.skillHit = {}
      for i = 1, 2 do
        local z = spec.makeHit('skHit' .. i, 234, 40)
        if z then
          spec.bindCursor(z, 'CursorClick', function() spec.onSkillArea(i) end)
          U.skillHit[i] = z
        end
      end
      if U.skillHit[1] then print('skill hit zones n=' .. #U.skillHit) end
    end
    print('skill hud build n=' .. (U.skill and 11 or 0))
  end

  local function applyText(p)
    local W, H = canvas()
    local t, ti = p.text or {}, p.inst or {}
    -- 服务端 textbox 份（名字由 main 的 find 提供）
    for name, r in pairs(t) do
      local ctl = spec.tb(name)
      if ctl then
        center(ctl, r.x, r.y, r.w, r.h)
        if r.fs then trySet(ctl, 'fontSize', r.fs) end
      end
    end
    -- 实例份（层序铁律：看得见的文字只能是实例份）
    for name, r in pairs(ti) do
      local inst = spec.instHud(name)
      if inst then
        center(inst, r.x, r.y, r.w, r.h)
        if r.fs then trySet(inst, 'fontSize', r.fs) end
      end
    end
    -- 技能 HUD（第二格空槽 = **整格挪出画布**：真机 SetVisible 对实例不可靠，只用坐标）
    if U.skill then
      local sk = p.skill or {}
      local party = spec.party and spec.party() or 2
      for name, ctl in pairs(U.skill) do
        local r = sk[name]
        if ctl then
          local hide = (party < 2) and (name:sub(1, 3) == 'sk2')
          if hide or not r then
            center(ctl, 0, -4000, (r and r.w) or 8, (r and r.h) or 8)
          elseif r then
            center(ctl, r.x, r.y, r.w, r.h)
            if r.fs then trySet(ctl, 'fontSize', r.fs) end
          end
        end
      end
    end
    -- 技能热区跟随卡面（卡面 = 名字行 + 状态行 + 能量条，取一个 234×40 的命中盒）
    if U.skillHit then
      local party2 = spec.party and spec.party() or 2
      local skr = p.skill or {}
      for i = 1, 2 do
        local z = U.skillHit[i]
        local r = skr['sk' .. i .. 'name']
        if z then
          if party2 < i or not r then
            center(z, 0, -4000, 8, 8)
          else
            center(z, r.x, r.y + 14, (r.w or 210) + 24, 40)
          end
        end
      end
    end
    return W, H
  end

  ----------------------------------------------------------------------------
  -- ⑤ 应用一屏（唯一入口）：背景 + 文字 + 按钮 + 预览列心
  ----------------------------------------------------------------------------
  -- v5.6：帮助页关闭后 main 会重建整套展台（新实例=更上层），导航键虽在却会被盖住
  -- （用户二-3「关掉帮助后角色/说明看不见了但仍可点」）。引擎层序=创建序且 SetAsLastSibling
  -- 在模拟器不分层，唯一可靠做法=**销毁重建**这两颗键，再按最后一次 plan 摆回去。
  U.reapply = function()
    if U.lastPlan then pcall(applyButtons, U.lastPlan) end
  end
  U.navRecreate = function()
    if not U.mobile then return end
    local function kill(c)
      if c then pcall(function() game.DestroyClientUIControl(c) end) end
    end
    local function killPill(pl)
      if not pl then return end
      for _, c in ipairs(pl.parts or {}) do kill(c) end
    end
    local keep = {}
    for _, b in ipairs(U.navBtns or {}) do
      if b.id == 'help' or b.id == 'roster' then
        killPill(b.edge) killPill(b.bg) kill(b.txt) kill(b.hit)
      else
        keep[#keep + 1] = b
      end
    end
    U.navBtns = keep
    for _, it in ipairs(NUM.PHONE.nav or {}) do
      if it.id == 'help' or it.id == 'roster' then
        local b = makeBtn(it, NUM.PHONE.NAV_W, NUM.PHONE.NAV_H, KIT.FS, 'n')
        if b then U.navBtns[#U.navBtns + 1] = b end
      end
    end
    U.allBtns = {}
    for _, list in ipairs({ U.btns or {}, U.navBtns or {}, { U.pageBtn }, U.actBtns or {} }) do
      for _, b in ipairs(list) do if b then U.allBtns[#U.allBtns + 1] = b end end
    end
    U.reapply()
    -- 重建出来的导航键默认在屏幕上 ⇒ 浮层期间必须再收一次（角色页底部那颗「合上」就是它）
    if U.padHidden and U.padVisible then U.padVisible(false) end
    print('phone nav recreate n=' .. #U.navBtns)
  end

  -- v5.38：浮层（角色页/说明页/结算）打开时把手机按键整体收走 —— 否则它们会浮在浮层上
  -- （用户截图：角色页底部多出一颗「合上」、左侧还留着绿色圆点与黑条）。
  -- park=true 全部挪到 y=-4000；false 用最后一次 plan 摆回来（不改任何状态）。
  U.padVisible = function(show)
    if not U.mobile then return end
    U.padHidden = not show
    -- 不依赖 b.x/b.y（那套字段只有 applyButtons 分支会写）：直接**读控件当前位置**再存/还，
    -- 这样 pad/nav/act 三组、以及 pen* 边缘胶囊都能一起收放（角色页底部残留「合上」就是这个漏的）。
    -- 权威清单 = U.allBtns（applyButtons 就是按它摆的）；三组表会漏掉按 plan 现造的导航键
    -- （角色页底部那颗「合上」= plan.nav 的 close，不在三组里 ⇒ 一直收不走）
    local function each(fn)
      if U.allBtns and #U.allBtns > 0 then
        for _, b in ipairs(U.allBtns) do fn(b) end
        return
      end
      for _, tbl in ipairs({ U.btns or {}, U.navBtns or {}, U.actBtns or {} }) do
        for _, b in ipairs(tbl) do fn(b) end
      end
    end
    local function parkOne(c)
      if not c then return nil end
      local x, y = U.pos(c)
      tryCall(c, 'SetAnchoredPosition', 0, -4000)
      return { c = c, x = x, y = y }
    end
    if not show then
      U.padSaved = {}
      each(function(b)
        local t = parkOne(b.txt)
        if t then t.label = b.label end
        U.padSaved[#U.padSaved + 1] = { parkOne(b.edge), parkOne(b.bg), t, parkOne(b.hit) }
      end)
    else
      -- 还原**必须按存档坐标**，不能用 applyButtons(U.lastPlan)：那时 lastPlan 是角色页的
      -- （没有 pad 的 label）⇒ 一还原就把所有按键文字清空（本轮实测的二次回归）。
      for _, rec in ipairs(U.padSaved or {}) do
        for i = 1, #rec do
          local v = rec[i]
          if v then
            tryCall(v.c, 'SetAnchoredPosition', v.x, v.y)
            -- 位置回来了但**文字被上一次 plan（角色页没有 pad 标签）清空**过 ⇒ 一并写回标签
            if v.label and v.c then pcall(function() v.c.text = v.label end) end
          end
        end
      end
      U.padSaved = nil
    end
    print('pad visible=' .. tostring(show) .. ' n=' .. #(U.padSaved or {}))
  end

  U.apply = function(screen, dual, mode, guide)
    if screen then U.screen = screen end
    local W, H = canvas()
    local p = U.plan(U.screen, dual, guide)
    applyText(p)
    U.lastPlan = p
    applyButtons(p)
    -- 浮层期间的重排会把刚收走的按键摆回来（角色页底部残留「合上」的真因）⇒ 重排后再收一次
    if U.padHidden and U.padVisible then U.padVisible(false) end
    if p.rightCX and spec.setRightCX then spec.setRightCX(p.rightCX) end
    if U.mobile then
      print('phone layout w=' .. math.floor(W) .. ' h=' .. math.floor(H)
        .. ' n=' .. #(U.allBtns or {}) .. ' screen=' .. tostring(U.screen))
      U.auditPlan(p, W, H, U.screen)
    end
    return p
  end

  U.enter = function(screen, dual, mode, guide)
    U.screen = screen or U.screen
    local p = U.apply(U.screen, dual, mode, guide)
    U.bgApply(spec.mode and spec.mode() or mode, U.screen)
    local W, H = canvas()
    print('screen=' .. U.screen .. ' ui layout w=' .. math.floor(W) .. ' h=' .. math.floor(H)
      .. ' mobile=' .. tostring(U.mobile and true or false) .. ' dual=' .. tostring(dual and true or false)
      .. ' pad=' .. #(p.slots or {}) .. ' nav=' .. #(p.nav or {}) .. ' act=' .. #(p.acts or {}))
  end

  -- 每帧廉价签名比对：屏幕/模式/画布任一变化 ⇒ 重新 apply（真机 SetVisible 不可靠，
  -- 所以"藏"= 挪出画布，"显示"= 挪回几何；唯一判据是坐标）。
  U.sync = function(dt)
    U.frames = (U.frames or 0) + 1
    if U.wantBuild ~= nil and U.frames >= 6 then
      local want = U.wantBuild
      U.wantBuild = nil
      pcall(U.padBuildNow, want)
      pcall(U.skillBuild)
      U.sig = nil
    end
    local st = spec.state and spec.state() or {}
    local sc = 'game'
    if st.helpOpen then sc = 'help'
    elseif st.roster then sc = 'roster'
    elseif st.settle then sc = 'settle'
    elseif st.guideStage == 0 then sc = 'title' end
    local dual = st.dual and true or false
    local guide = (st.guideStage == 3)
    local W, H = canvas()
    local sig = sc .. '|' .. tostring(dual) .. '|' .. tostring(st.mode) .. '|' .. tostring(guide) .. '|'
      .. math.floor(W) .. 'x' .. math.floor(H) .. '|' .. tostring(st.page or 1)
    if sig ~= U.sig then
      U.sig = sig
      U.page = st.page or 1
      U.enter(sc, dual, st.mode, guide)
      if U.screen == 'title' and st.mode == nil then
        -- 标题页主题恒 casual（与入口一致），避免上一次模式的底色残留
      end
    end
    if U.rep then
      local r = U.rep
      r.t = r.t + (dt or 0)
      if r.t >= (KIT.HOLD_DELAY or 0.26) then
        r.t = r.t - (KIT.HOLD_RATE or 0.075)
        r.n = (r.n or 0) + 1
        if r.n == 1 then print('phone rep start id=' .. r.b.id) end
        if U.dispatch then U.dispatch(r.b.act, r.b.id, true) end
      end
    end
  end

  ----------------------------------------------------------------------------
  -- ⑥ 控件登记 + 机器审计（越界 / 同屏可点区相交 / 空名）
  ----------------------------------------------------------------------------
  U.reg = {}
  U.regScreen = function(name)
    U.cur = name
    for i = #U.reg, 1, -1 do if U.reg[i].screen == name then table.remove(U.reg, i) end end
  end
  U.regAdd = function(name, ctl, w, h)
    if not ctl then return end
    U.reg[#U.reg + 1] = { screen = U.cur, name = name, ctl = ctl, w = w or 0, h = h or 0 }
  end
  U.pos = function(ctl)
    if not ctl then return 0, 0 end
    local ok, a, b = pcall(function() return ctl:GetAnchoredPosition() end)
    if not ok then return 0, 0 end
    if type(a) == 'table' then return tonumber(a[1] or a.x) or 0, tonumber(a[2] or a.y) or 0 end
    if type(a) == 'number' then return a, tonumber(b) or 0 end
    return 0, 0
  end
  -- 注册表回读 + 审计：调用方（main）在每屏布局后调一次，日志锚 `ui audit`
  U.dump = function(tag)
    local W, H = canvas()
    local n = 0
    local rects = {}
    for _, r in ipairs(U.reg) do
      if r.screen == tag then
        n = n + 1
        local x, y = U.pos(r.ctl)
        rects[#rects + 1] = { name = r.name, x = W / 2 + x, y = H / 2 + y, w = r.w, h = r.h }
      end
    end
    print('ctl dump screen=' .. tostring(tag) .. ' n=' .. n
      .. ' canvas=' .. math.floor(W) .. 'x' .. math.floor(H))
    for _, c in ipairs(rects) do
      print('ctl ' .. c.name .. ' px=' .. math.floor(c.x + 0.5) .. ' py=' .. math.floor(c.y + 0.5)
        .. ' w=' .. math.floor(c.w) .. ' h=' .. math.floor(c.h))
    end
    return U.audit(rects, W, H, tag)
  end

  -- 布局审计（唯一入口，日志锚 `ui audit screen=… bad=…`）：
  -- 判据四条（用户 2026-10-29 打回的直接翻译）：①按钮不出画布 ②同屏两个可点区不相交
  -- ③按钮不压棋盘（棋盘矩形按模式算：单盘 300×600 居中 / 双盘 ±280）④按钮不压 HUD 文字框
  local function rectOf(r)
    return { name = r.id, cx = r.x, cy = r.y, w = r.w, h = r.h }
  end
  local function hitRect(a, b)
    local ox = math.min(a.cx + a.w / 2, b.cx + b.w / 2) - math.max(a.cx - a.w / 2, b.cx - b.w / 2)
    local oy = math.min(a.cy + a.h / 2, b.cy + b.h / 2) - math.max(a.cy - a.h / 2, b.cy - b.h / 2)
    return ox > 2 and oy > 2, ox, oy
  end
  U.auditPlan = function(p, W, H, tag)
    local bad, list = 0, {}
    local rects = {}
    for _, r in ipairs(p.slots or {}) do rects[#rects + 1] = rectOf(r) end
    for _, r in ipairs(p.nav or {}) do rects[#rects + 1] = rectOf(r) end
    for _, r in ipairs(p.acts or {}) do rects[#rects + 1] = rectOf(r) end
    local function note(s)
      bad = bad + 1
      if bad <= 12 then list[#list + 1] = s end
    end
    for _, a in ipairs(rects) do
      if a.cx - a.w / 2 < -W / 2 - 1 or a.cx + a.w / 2 > W / 2 + 1
        or a.cy - a.h / 2 < -H / 2 - 1 or a.cy + a.h / 2 > H / 2 + 1 then
        note('oob:' .. tostring(a.name))
      end
      if a.w < (KIT.MIN_W or 96) - 0.5 or a.h < (KIT.MIN_H or 56) - 0.5 then
        note('tiny:' .. tostring(a.name) .. '(' .. math.floor(a.w) .. 'x' .. math.floor(a.h) .. ')')
      end
    end
    for i = 1, #rects do
      for j = i + 1, #rects do
        local ov = hitRect(rects[i], rects[j])
        if ov then note('overlap:' .. rects[i].name .. '∩' .. rects[j].name) end
      end
    end
    -- 棋盘（按钮禁区）：单盘 300×600 居中；双盘 = 两块 ±280
    local boards = {}
    if #(p.slots or {}) > 0 then     -- 只有局内屏才有"棋盘"这回事（覆盖层棋盘被面板盖住）
      boards = p.dual and { { cx = -280, cy = 0, w = 304, h = 604 },
                            { cx = 280, cy = 0, w = 304, h = 604 } }
        or { { cx = 0, cy = 0, w = 304, h = 604 } }
    end
    for _, a in ipairs(rects) do
      for _, b in ipairs(boards) do
        if hitRect(a, b) then note('over-board:' .. tostring(a.name)) end
      end
    end
    -- HUD 文字框（按钮禁区）：只查真的在本屏可见的（y>-4000）
    for _, nm in ipairs({ 'hud', 'best', 'hint', 'hudNext', 'botBanner', 'topBanner' }) do
      local t = (p.text or {})[nm]
      if t and t.y and t.y > -4000 then
        local b = { cx = t.x, cy = t.y, w = t.w, h = t.h }
        for _, a in ipairs(rects) do
          if hitRect(a, b) then note('over-text:' .. tostring(a.name) .. '@' .. nm) end
        end
      end
    end
    print('ui audit screen=' .. tostring(tag) .. ' btns=' .. #rects .. ' bad=' .. bad)
    for _, s in ipairs(list) do print('ui audit !! ' .. s) end
    return bad
  end

  -- 机器审计（纯函数，可在 JS 侧复用同一判据）：越界 / 两个可点区相交 / 空名 / 命中区下限
  U.audit = function(rects, W, H, tag)
    local bad = {}
    for i = 1, #rects do
      local a = rects[i]
      if a.name == nil or a.name == '' then bad[#bad + 1] = 'unnamed#' .. i end
      if a.x - a.w / 2 < -1 or a.x + a.w / 2 > W + 1 or a.y - a.h / 2 < -1 or a.y + a.h / 2 > H + 1 then
        bad[#bad + 1] = 'oob:' .. a.name .. '(x=' .. math.floor(a.x) .. ' y=' .. math.floor(a.y)
          .. ' w=' .. math.floor(a.w) .. ' h=' .. math.floor(a.h) .. ')'
      end
      for j = 1, i - 1 do
        local b = rects[j]
        local ox = math.min(a.x + a.w / 2, b.x + b.w / 2) - math.max(a.x - a.w / 2, b.x - b.w / 2)
        local oy = math.min(a.y + a.h / 2, b.y + b.h / 2) - math.max(a.y - a.h / 2, b.y - b.h / 2)
        if ox > 2 and oy > 2 then bad[#bad + 1] = 'overlap:' .. a.name .. '∩' .. b.name end
      end
    end
    local head = 'ui audit screen=' .. tostring(tag) .. ' n=' .. #rects .. ' bad=' .. #bad
    print(head)
    for _, s in ipairs(bad) do print('ui audit !! ' .. s) end
    return bad
  end

  return U
end

return M
