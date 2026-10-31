--[[==========================================================================
 tetris/view_layers.lua —— 语义层序（单源）
 ----------------------------------------------------------------------------
 铁律（本项目两次踩实）：运行时实例的绘制顺序 = **创建顺序**，后建在上；
 SetAsLastSibling / SetAsFirstSibling 在模拟器里对分层没准（实测）。
 ⇒ 层序不能在创建点手写，必须由「语义层号」决定，由 render.lua 按层号顺序创建。

 层号留出间隔，新增层不必改别人的号。数字只在这里出现一次。
========================================================================]]

local M = {}

M.L = {
  wash   = 10,   -- 整屏底色（bgPool[1] 复用）
  bg     = 20,   -- 背景图元/装饰（深空墙、标题展台）
  plate  = 25,   -- 棋盘背板（格缝里的网格线来源）
  board  = 30,   -- 200 格
  frame  = 35,   -- 棋盘外框
  hud    = 40,   -- 常驻 HUD / 预览槽 / 键位卡（服务端 textbox 例外，见下）
  panel  = 50,   -- 面板底板（结算卡、说明页底）
  card   = 60,   -- 面板上的内容（文字、色块、条目）
  touch  = 70,   -- 触控按钮/pad（必须在面板之上，否则等于隐形）
  toast  = 80,   -- 飘字/横幅
  modal  = 90,   -- 模态遮罩与模态内容
  debug  = 99,   -- 探针/调试
}

-- 服务端 textbox 永远在运行时实例之下（引擎事实）⇒ 它们的层号只用于
-- 「同属服务端控件之间」的排序，不能用来压运行时实例。
M.SERVER_TEXT_CEILING = 0

function M.order(name)
  local v = M.L[name]
  if not v then error('view_layers: 未知层 ' .. tostring(name)) end
  return v
end

-- 返回 true 表示 a 应该排在 b 之前（a 在下面）
function M.before(a, b)
  return M.order(a) < M.order(b)
end

return M
