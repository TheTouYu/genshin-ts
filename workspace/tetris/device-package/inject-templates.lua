--[[==========================================================================
 tetris/templates.lua —— 模板 guid 探测（cell / hit / stext）的**唯一入口**
 ----------------------------------------------------------------------------
 为什么抽这一块（不是搬行数）：探测结果原来是 OnStart 里三个 local
 （TPL_CELL / TPL_HIT / TPL_TEXT），探测失败**静默留 nil** —— 后果是"某一屏的文字或热区
 整片不见"，只能靠人眼看出来（v6 重构里踩过：技能列无镜像、热区没有、文字不画）。
 抽成模块后：探测集中一处、失败**必有日志**、降级清单**写死在 M.DEGRADE 里**（见下）。

 设计约束（与其它 view_* 一致）：
   · 不 require 任何 tetris 模块；引擎能力（InstantiateClientUIControl）由 main 注入 probeOne；
   · 不 print（日志走注入的 log，mock/headless 也能接）；
   · 探测**只读**：探针实例由 probeOne 负责销毁（本模块不碰 game.*）。

 降级表（nil 模板 ⇒ 哪几屏会怎样）：
   cell  : 棋盘 200 格 / 展台墙 / 胶囊底 / 圆角贴片 全部建不出来
           ⇒ main 仍然 error（不可玩）——这是**硬失败**，不允许静默降级
   hit   : 所有鼠标/触屏热区都没有 ⇒ 标题卡/入口卡/结算选项/说明关闭 点不动（键盘仍可用）
   stext : 运行时文字实例没有 ⇒ HUD/结算/说明/标题/预览的**描述层文字**缺失
           ⇒ HUD 回退服务端 textbox（已有 log 'hud inst none'）；其它屏只出图形不出字
========================================================================]]

local M = {}

-- 降级清单：给"nil 模板 ⇒ 哪几屏会怎样"一个**可读、可测**的单一出处（报告与文档都引它）
M.DEGRADE = {
  cell = '棋盘/展台/胶囊/圆角贴片全部建不出来 ⇒ 开局 error（不可玩）',
  hit = '鼠标/触屏热区全无 ⇒ 标题卡/入口卡/结算选项/说明关闭 点不动（键盘仍可用）',
  stext = '运行时文字实例全无 ⇒ HUD/结算/说明/标题/预览的描述层文字缺失（HUD 回退服务端 textbox）',
}

M.new = function(spec)
  spec = spec or {}
  local guids = assert(spec.guids, 'templates: 需要 spec.guids（config.TPL_GUIDS）')
  local probeOne = assert(spec.probeOne, 'templates: 需要 spec.probeOne(candidates, wantCursor)')
  -- 文字模板必须走**能力探测**（建出来得有 children/是 textbox），不能复用 cell/hit 的通用探测：
  -- 实测 settleText 候选表里第一个能实例化的 guid 其实没有 text 字段（写 text 会抛 "no such field"）
  local probeTextOne = spec.probeTextOne
  local log = spec.log or function() end
  local T = { cell = nil, hit = nil, stext = nil, ok = {}, guids = guids }

  local function note(name, value, extra)
    T[name] = value
    T.ok[name] = value ~= nil
    if value then
      log(string.format('tpl %s=%s cand=%d%s', name, tostring(value),
        #(guids[name == 'stext' and 'settleText' or name] or {}), extra or ''))
    else
      local cand = name == 'stext' and guids.settleText or guids[name]
      log(string.format('tpl %s=NONE cand=%d degrade=%s', name, #(cand or {}), M.DEGRADE[name] or '?'))
    end
  end

  -- cell：image 模板（无光标事件）。返回 (第一个可用 guid, 探针实例) —— 探针实例必须由调用方销毁
  -- （A13：探针是整屏最先建的控件，复用它当 cell1 会被后建的 wash/背板盖住）
  function T:probeCell()
    local first, guid = probeOne(guids.cell, false)
    note('cell', guid)
    return first, guid
  end
  -- hit：cursor 模板（有光标事件）。返回 (探针实例, guid)
  function T:probeHit()
    local seed, guid = probeOne(guids.hit, true)
    note('hit', guid)
    return seed, guid
  end
  -- stext：文字模板（探针实例由 probeOne 内部建/销；这里只要 guid）
  function T:probeText()
    local guid = probeTextOne and probeTextOne() or nil
    note('stext', guid)
    return guid
  end
  -- 懒探测（原 probeSettleTextbox 的语义）：第一次要建文字实例时才解析，已解析则直接返回
  function T:text()
    if T.stext == nil then T:probeText() end
    return T.stext
  end
  -- 一行汇总（接线自证：新路径真的跑过，且三个模板各自有没有）
  function T:report()
    log(string.format('tpl report cell=%s hit=%s stext=%s',
      T.cell and 'ok' or 'NONE', T.hit and 'ok' or 'NONE', T.stext and 'ok' or 'NONE'))
    return T
  end
  return T
end

return M
