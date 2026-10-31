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
  G             -> KeyboardCraftspersonKey14  Hold 暂存（工匠槽 14；模拟器键池无字母 C，见 key-bindings.js）
  R             -> KeyboardCharacterSkill3Key 重开
  Q             -> KeyboardCharacterSkill2Key 真结算（发服务端信号 tetris_settle → 官方结算页）
  H             -> KeyboardCharacterSkill1Key 键位表（暂停开关；真机若不认则无害，右栏常驻键位卡兜底）
  T             -> KeyboardCharacterSkill4Key 调试：填满最底两行（仅用例用）

引导（时机精准 / 由简入深 / 可回溯）：
  stage 0 等开始：重力暂停，上横幅 TETRIS，下横幅键位 + "按任意键开始"
  stage 1 游戏中：首次锁定提示"堆满一行即消除"，首次消行提示分值表
  stage 2 键位表：按 H 暂停并显示完整键位，再按 H 继续
  失败：上横幅 GAME OVER（红），下横幅 得分 / 本局最高 / 按 R 重开

音效 / 抖屏（2026-10-25 新增）：
  音效 只在"动作真的发生"时播一条（移动/旋转/落地/消行/结束），全走 pcall；
       id 见 SFX 表 —— 全部是内置音效库 20001 组的小整数（语义待听感确认）
  抖屏 消行时把 200 格 + 4 条外框按同一偏移量整体平移，0.18~0.28s 指数衰减，
       行数越多越强；只在 g.shakeT > 0 的帧写坐标，抖完复位一次（基准坐标创建时存下来）
=========================================================================]]


-- ===== v2.7 ⑨ 多 lua 文件拆分：模块装载器（契约见 docs/research/lua-module-contract.md）=====
-- 官方口径：脚本资产可建多份映射，**未挂载的只作 require 模块**（不跑生命周期）；
-- require 路径 = 映射路径去掉 .lua；真机编辑器会给路径补 'default_import_file/' 前缀。
-- 所以按 4 级候选逐个 pcall，成功即用，失败把**每条候选的错误原文**打进日志（真机排查唯一线索）。
local function loadModule(name)
  local tried = {}
  local dirs = { 'default_import_file/lua/tetris/', 'lua/tetris/', 'tetris/', '' }
  for i = 1, #dirs do
    local p = dirs[i] .. name
    local ok, mod = pcall(require, p)
    if ok and mod ~= nil then
      print('module ok ' .. p)
      return mod
    end
    tried[#tried + 1] = p .. ' → ' .. tostring(mod)
  end
  print('module FAIL ' .. name .. ' :: ' .. table.concat(tried, ' | '))
  return nil
end

-- 纯数据模块（数值表/色板/方块/模式表/规则页文案）
local CFG = loadModule('config')
if not CFG then error('tetris: 模块 config 装载失败（看 module FAIL 行里的每条候选错误）') end
local COLS, ROWS, CELL, GAP, PITCH, STEP = CFG.COLS, CFG.ROWS, CFG.CELL, CFG.GAP, CFG.PITCH, CFG.STEP
local TPL_GUIDS = CFG.TPL_GUIDS
local NUM, SHAPES, BAG, C = CFG.NUM, CFG.SHAPES, CFG.BAG, CFG.C
local THEME, MODE_INFO, MODE_TITLE, MODE_THEME, HELP_COLS =
  CFG.THEME, CFG.MODE_INFO, CFG.MODE_TITLE, CFG.MODE_THEME, CFG.HELP_COLS
local MODE_BG, MODE_BG_POOL = CFG.MODE_BG, CFG.MODE_BG_POOL
-- ===== v6 core_* 装配（玩法纯逻辑在 lua/tetris/core_*.lua；本文件只做接线与表现）=====
-- ⚠ 必须在这里装载：RNG1（102 行）与 newInst（191 行）都要用。2026-10-31 接线审查发现：
--   CORE_RNG_M 原先在 341 行才 local ⇒ 102 行读到的是**全局 nil** ⇒ core_rng 恒走兜底旧路径，
--   「接线第一步」名接实未接（当时全绿是因为两条路径逐字等价，不是因为模块生效）。
local CORE = { hooks = {} }
do
  local function mod(name)
    local m = loadModule(name)
    if not m then print('v6 core module MISSING: ' .. name) end
    return m
  end
  CORE.RNG_M, CORE.PIECES_M = mod('core_rng'), mod('core_pieces')
  CORE.BOARD_M, CORE.STATE_M = mod('core_board'), mod('core_state')
  if not (CORE.RNG_M and CORE.PIECES_M and CORE.BOARD_M and CORE.STATE_M) then
    error('tetris: core_* 模块缺失（build 未注册？）——玩法逻辑现在只走 core_*，不再有兜底路径')
  end
  CORE.board = CORE.BOARD_M.new { rows = ROWS, cols = COLS, empty = 0 }
  CORE.pieces = CORE.PIECES_M.new { shapes = SHAPES, cols = COLS }
  -- 洞位随机源（障碍行/垃圾行）：现网两个板的洞位都走 aiRand，不动 bag 流。
  -- 用字段间接引用——aiRand 的 local 声明在本块之后，闭包直接写 aiRand 会绑到全局（283 行有同样教训）。
  CORE.holeRng = { rand = function(n) return CORE.aiRand(n) end }
end
local HUD_INST = {}
local FN = {}    -- v3.6：把一批大函数的 local 声明挂表（真机 LuaJIT 计 local 严格，省槽防 200 上限）    -- v2.8 ⑤：HUD 实例双写表（txt/build 挂字段；声明在 renderHud 等全部调用点之前）
-- v4.0：设备适配子系统（移动端操作控件 / 手柄映射与焦点导航 / 移动端多人引导浮层）。
-- 挂表不挂 local（main chunk 已 134 个 local，真机 200 上限只剩 ~10 槽；D591 教训）。
local UI4 = { btns = {}, pad = { fk = 1, t = 0, last = 0 }, note = {}, rep = nil }
-- v6 架构（docs/ARCH.md）：platform / render / view_board 三件由本文件在 OnStart 里装配。
-- 声明在顶部是因为 paint() 等早期函数要用；装配失败直接 error（模块随构建自动注册，不会缺）。
local PT, BR, VB
-- 官方内置图元 id（模拟器 studio/constants.js: IMAGE_PRIMITIVES 实证；真机为「六类代理图元」）
local BG_IMG = { rect = 100001, circle = 100002, triangle = 100003, fourstar = 100004,
                 fivestar = 100005, ring = 100006 }
-- v3.0：main chunk 贴着 200 local 上限（D591）⇒ 背景图元警告位挂在 MS 表上（省 1 个 local）




-- 确定性随机（LCG）：用例可复现，不依赖 os / math.random
-- ============================================================================
-- ⚠ 以下状态改成**脚本全局**（去掉 local）而不是文件局部变量：
-- main chunk 有 Lua 5.3 的 200-local 硬上限（真机编译期拒载整份脚本，
-- 报 `too many local variables (limit is 200) in main function`）。
-- 这份脚本有自己的 _ENV（模块契约 docs/research/lua-module-contract.md），
-- 全局只在本脚本内可见，不会污染引擎，也不会与其他脚本冲突。
-- **新状态一律写成全局或挂到已有表上，不要新增 `local`。**
-- ============================================================================
BUILD_TAG = 'v5.38 · 10-31 02:1x'
-- v6：确定性随机源搬到 core_rng（纯模块：同种子 ⇒ 同序列，headless 对拍过生产前 14 块）。
-- RNG1 = 主盘；CORE.rngP2 = 双屏第二盘（必须与 aiRand 共用同一条流，见 core_rng 头注释陷阱 3）。
local RNG1 = CORE.RNG_M.new { bag = CFG.BAG, seed = 20261023 }
local BOARD = CORE.board

-- 7-bag 出块（T1，替换纯随机 nextName = BAG[rand(#BAG)]）：
-- 每袋 I,O,T,S,Z,J,L 各一、袋内 Fisher-Yates 洗牌（继续用上面 LCG，种子不变 ⇒ 序列可复现）；
-- 保底语义：任意连续 13 块必含全部 7 种（13 块跨袋时两端分布 k+(13-k)、k∈1..6 ⇒ 13-k≥7 必含完整袋；
-- 12 块不成立——反例：袋A尾 6 块缺 X + 袋B头 6 块缺 X，连续 12 块缺 X（lead 2026-10-27 判据纠正）。
-- 「任意连续 7 块含全 7 种」同样不成立——袋尾 k 块与下袋头 7-k 块可能重叠。
-- 首袋排除 S/Z 开局（Guideline 惯例，防开局即井）：若洗出的队头是 S/Z，与袋内第一个非 S/Z 交换。
-- 每局 newGame 重洗（bagSeq 归零 ⇒ 「newgame 后前 14 块」恒定，与上一局消耗无关；LCG 种子延续，第二局序列 ≠ 第一局）。
-- T0 实例化（v2）：每盘独立状态全部收进实例表 G[i]（平铺字段），g=当前实例引用。
-- 闭包共享 g 的 upvalue 绑定 ⇒ 双屏循环 `for i=1,2 do g=G[i] ... end` 即让全部函数作用于当前盘，
-- 仅跨实例交互（垃圾行/胜负判定）需显式传实例。全局保留：root/服务端单份控件/入场演出/常量/随机源。
local G = {}                             -- 游戏实例表：G[1]=主实例；双屏模式 G[2]=第二盘
local g                                  -- 当前实例引用（=G[1]；双屏循环重绑定）
local ACTIVE = { 1 }                     -- 激活实例下标表：单屏={1}；双屏={1,2}（T6 模式入口设置）
-- T6 四模式：casual=休闲（默认，AI 自演+玩家接管+局中 5s 无操作 AI 代打）|
-- ai-battle=双屏 AI 对战 | pvp=双屏双人 | coop=双人合作对抗 AI（旋转手+行动手，裁决①）
MODE = 'casual'
-- v2.1 ②：标题屏四模式大视觉卡片（用户原话「真正花了大力气做的东西要让玩家看到」）。
-- pendingMode/pendingT = 按 Digit 后的模式名大字动画窗（0.5s，introT 渐变手法），窗后 enterMode 开局。
MC = {}                          -- 菜单卡片组实例表（色块×4 + 文字×8；stage0 建、开局销毁）
pendingMode, pendingT = nil, 0
-- v2.1 ③：H 游戏说明层（v2.7 起改成独立整页 + 常驻入口；任意键=先关层不开局）
HL = {}                          -- 说明层实例表（暗底 + 三栏文字条 + 标题/页脚）
local SETTLE_HOTS = {}                 -- v2.8 ④：结算三键鼠标热区（settleDestroy 一并销毁）
-- v2.8 ④：结算三动作挂表（200-local 红线，D612 先例）——实现在 OnStart 赋值，showGameOver 热区引用
local SETTLE_ACT = {}
helpOpen = false
helpFromStage = 1                -- 开层前的 guideStage（关层时恢复；说明页期间 2=暂停）
helpPage = 1                     -- （保留：单页版恒 1；多页时按 ←/→ 切换）
local toggleHelp                       -- 前向声明（实现见 UI 段；startIfWaiting/H 键都在更早处调用）
local closeHelp                        -- 前向声明（v2.7：act()/R/V 等按键回调先关页）
local buildMenuCards, destroyMenuCards -- 前向声明（实现见 UI 段；startIfWaiting/demoLoopReset/OnStart 都在更早处调用）
-- casual 局中接管状态机（v2-plan §三 T6）：'play'（玩家操作）→5s 无操作→'hint'（提示 2s）
-- →'ai'（AI 代打：aiTickCore 驱动，横幅常驻，分数继续入玩家账=裁决⑤）→任意游戏键→'play'。
-- 接管不设 autoDriving（分数/音效走玩家路径=裁决②⑤天然满足）；教学抑制不受影响。
local TK = { state = 'play', t = 0, prevState = nil }
-- v2.6 ①：进局底栏常驻操作提示（横幅事件短暂借位，bannerTimer 归零即恢复；结算时清空）
local PERSIST_TIP = ''
local showPersistTip                   -- 前向声明（实现见 enterMode 前）
-- v2.2 ③：模式终局标志——双屏任一盘 gameOver 即置位：冻结两盘（输入/重力/AI 全停，
-- OnUpdate 只推结算动画），胜负走全屏结算层，R=回菜单复位。casual 不置位（v1 语义不变）。
MODE_OVER = false
-- v2.1 ①：双人/对抗模式开局引导态（guideStage=3）——phase 'keys'（键位说明，任意键确认）
-- → 'count'（3-2-1 倒计时，每 1s，topBanner 大字）→ guideStage=1 开局。casual 不经此态（旧用例直进）。
local GK = { phase = 'keys', t = 0, count = 3, p1ready = false, p2ready = false }
local CNT = nil   -- v2.5 ① 倒计时大字实例（120 号屏幕正中+每秒 sin 弹跳）
local RHO = { pieces = 0, lines = 0 }    -- AI 消行率统计（跨局累计，不随 newGame/实例切换清零）
-- T6b ai-battle 出块镜像队列：主盘自然出块 push，AI 盘 piece 空时立即喂 / doLock 后拉（保序）。
-- 同源同序（裁决④）＝公平对抗的前提；AI 盘快过主盘时 piece=nil 空转等待（aiTickCore 判 not piece 停）。
local MIRRORQ = {}
local feedMirror    -- 前向声明（实现见 enterMode 前：需 spawn 已赋值；spawn 尾部与 G[2] doLock 都调它）
local TPL_CELL      -- cell 模板 guid（OnStart 探测后保存；G[2] 棋盘控件复用，T6b-2）
local TPL_HIT       -- v2.7：cursor（光标检测区）模板 guid —— 标题页四模式三态热区用
IS_MOBILE = true   -- OnStart 探测后写入；菜单选择/热区逻辑在模块级函数里也要读它
-- v2.7 ⑤：标题页模式选择（键盘 Digit 与鼠标点击共用一条入口；实现见菜单段）
local menuSelectMode

-- AI 状态机初值（每实例一份；T6b 起从文件级一次性构造搬进 newInst——G[2] 也要有自己的 AI 表）
local function newAIState()
  return { phase = 'thinking', t = 0, wait = 0.5, queue = nil, qi = 1, piece = nil,
    count = 0, sumSec = 0, dur = 0, pace = nil, info = nil, softPer = 0.08, target = 2.2,
    score = 0, lines = 0, fx = 0, assistLv = 1,
    search = nil,   -- T5 渐进式搜索状态（plan/idx/best2/bestScore/done/holdChecked）
  }   -- score/lines = AI 局账本（T4，clearLines 分流写入；newGame 归零）；ρ 统计在全局 RHO
end

-- 实例构造：v1 显式初值逐项等价搬入（v1 声明区原 nil 的字段保持 nil，newGame 会赋）。
local function newInst(isP2)
  local t = {}
  t.cellBX, t.cellBY, t.frameBX, t.frameBY = {}, {}, {}, {}
  t.bagQ, t.bagSeq = {}, 0
  t.autoDriving = false
  -- v2.7：本盘的账本归属（AI 账 = true）。与 autoDriving 的区别：autoDriving 是"此刻是否走演示通道"
  -- 的运行时开关（aiDrop 里临时置位），aiAccount 是**盘的属性**（双屏 AI 盘恒 true；pvp 的 P2 盘 false）。
  t.aiAccount = false
  t.elapsed = 0
  t.settleReady = false
  t.settleBuildTried = false
  t.settleOn, t.settleT, t.settleDone = false, 0, false
  t.settleFade = -1
  t.settleSize = 44
  t.settleTitleY, t.settleOptsY = 150, -150
  t.settleTitleOff, t.settleOptsOff = 420, -420
  t.dimRatio, t.dimApplied = 0, -1
  t.pieceCount = 0
  t.combo, t.maxCombo, t.b2b = 0, 0, false
  t.settleOpen = false
  t.shakeT, t.shakeDur, t.shakeAmp, t.shakePhase = 0, 0, 0, 0
  t.boardOX = 0                         -- 棋盘 x 偏移（单屏=0 居中；双屏 G[1]=-320 / G[2]=+320，T6b-2）
  -- T6c：每盘独立输入状态（原挂 NUM 的每盘状态搬实例——pvp 双人各自 DAS/LD/Hold 互不干扰）
  t.ld = { t = -1, resets = 0 }         -- 锁定延迟（T8）
  t.das = { dir = 0, t = 0, arr = 0, hold = 0 }  -- DAS/ARR（T8；v2.6 hold=ARR 已持续秒数，达 DAS_HOLD 强制停——Up 丢失自愈）
  t.st = { name = nil, bag = 0, can = true }  -- Hold 槽（T3）
  t.lastRot = false                     -- T-spin 判定前置（T8）
  t.AI = newAIState()
  -- v6：本盘的玩法 reducer 集合（core_state 实例）。每盘一份，核心区别只有随机源：
  -- 主盘用 RNG1；双屏第二盘挂 aiRand 流（与现网 refillBag 的 isP2 分支同源）。
  do
    local rng = RNG1
    if isP2 then
      if not CORE.rngP2 then
        CORE.rngP2 = CORE.RNG_M.new { bag = BAG, rand = function(n) return CORE.aiRand(n) end }
      end
      rng = CORE.rngP2
    end
    t.core = CORE.STATE_M.new {
      pieces = CORE.pieces, board = CORE.board, num = NUM, cols = COLS, rows = ROWS,
      step = CFG.STEP, rng = rng, holeRng = CORE.holeRng, hooks = CORE.hooks,
      -- 甘雨「天地交泰」：冻结期内重力间隔 ×1.20（skills.params 的 gravityMult，原实现从没接上）
      gravityMult = function()
        if SK and SK.freezeT and tonumber(SK.freezeT) > 0 and SK.gravityMult then
          return tonumber(SK.gravityMult) or 1
        end
        return 1
      end,
    }
  end
  return t
end
G[1] = newInst(false)
g = G[1]

local aiRand                           -- 前向声明（实现见 AI 段；refillBag 在更早处用 G[2] 独立洗牌）
local function refillBag()
  -- v6：洗袋逻辑在 core_rng（LCG + 7-bag + 首袋排 S/Z，headless 对拍过生产序列）。
  -- 这里只决定「用哪条随机流」：主盘 RNG1；双屏第二盘挂 aiRand 那条流
  -- （与 AI 决策/垃圾洞位共用同一条 ⇒ 序列不漂）。公平性靠 7-bag 保底本身，不镜像等待（用户裁决）。
  local isP2 = (g ~= G[1] and G[2] ~= nil)
  local RNG = RNG1
  if isP2 then
    if not CORE.rngP2 then
      -- 闭包间接引用 CORE.aiRand：aiRand 的 local 声明在本行之后（283 行有同样教训）
      CORE.rngP2 = CORE.RNG_M.new { bag = BAG, rand = function(n) return CORE.aiRand(n) end }
    end
    RNG = CORE.rngP2
  end
  g.bagSeq = RNG.refill(g.bagQ, { firstBag = (g.bagSeq == 0) })
end

-- 前向声明（局部化，避免污染全局表）：控件句柄类里，棋盘四件（cells/preview/frames/抖动基准）
-- 已收进实例表 g；服务端单份控件（title/hud/.../横幅）全局保留——双屏共用一份，双屏 per-player
-- HUD 走客户端实例化（v2 设计书 §1.4）。
root = nil
title, hud, hudNext, best, hint, keyA, keyB, keyC, topBanner, botBanner =
  nil, nil, nil, nil, nil, nil, nil, nil, nil, nil
guideStage, bannerTimer = 0, 0    -- 全局流程阶段（0=AI 演出/1=游戏/2=键位表）与全局横幅计时
-- ⚠ 初值不能留 nil：OnStart 一旦提前报错，OnUpdate 的 `bannerTimer > 0` 会每帧崩（实测 2026-10-29）
introT, overlay = nil, nil
introFont, introPulse = nil, nil
CANVAS_W, CANVAS_H = 1280, 720                -- layout() 记录，懒创建结算层时要用（全局单画布）
local settleDestroy, settleSetColors, layoutSettle   -- 定义见「结算层」/「布局」段（前向声明）
local layout                              -- 布局函数前向声明（exitToMenu 在它定义之前就调用）
bestScore = 0                                  -- 历史最佳（全局共享，裁决⑥）
-- v2.4 ① 标题页「展台」实例表（MS）：这里只声明空表 + 配色/文案常量，
-- 方法（build/destroy/tick/focusLock/teardown）在「v2.3 卡片」段附近挂上——
-- 那个位置 trySet/TPL_TEXT/probeSettleTextbox 都在作用域内；而 startIfWaiting（更早）
-- 只调 MS.teardown()，那时表已存在、方法已在运行时挂好。
local MS = {
  parts = {}, hint = {}, arrow = {},
  hintKey = { -1, -1, -1 }, arrowKey = { -1, -1 },
  hintText = { '1-4 选模式', '任意键 = 休闲', 'H 游戏说明' },
  -- v3.0：深空墙 → 清透天空墙（A=255 仍是封闭舞台，不留背景 ghost）
  WALL = THEME.wall,               -- 天空墙（近白 #F7FCFF）
  BEZEL = THEME.bezel,             -- 视窗边框：描金浅边（奶油+描金 = 原神 UI 语汇）
  TICK = THEME.tick,               -- 四角括号（低对比金）
  CYAN = THEME.textSub,            -- 提示条文字色（浅底用墨色，不再用霓虹青）
  lineY = -332,
  focus = false,
  bgWarned = false,
}
local DUAL_DECO = {}                  -- 双屏中缝装饰（2 实例；exitToMenu 拆）
local showGameOver, updateBest
local collides, doLock, renderAll, renderPiece, renderHud, spawn
local raiseGarbage    -- T7 垃圾行（实现见 enterMode 前；clearLines 消行后跨盘调用）
-- 结算层成员表：**固定 9 槽 + 数字 for 遍历**，绝不能用 ipairs({...})——
-- 里面只要有一个 nil（比如没造 border），ipairs 就在那里停住，后面的成员会被静默跳过（销毁会漏）。
-- 成员全部收进实例表 g（T0）；双屏时每盘各自的结算层。
local function settleMembers()
  return { g.settleScrim, g.settleCard, g.settleBorder, g.settleTitle,
           g.settleScore, g.settleBest, g.settleInfo, g.settleExtra, g.settleOpts }
end

local function cellIndex(r, c) return (r - 1) * COLS + c end

local function paint(r, c, color)
  if not g.cells then return end   -- G[2] 数据层阶段无棋盘控件（T6b-2 建控件后走全路径）
  local ctl = g.cells[cellIndex(r, c)]
  if ctl then ctl.imageColor = color end
end

-- 保护式写入：真机上某些字段/方法会抛错（模拟器接受），一处抛错会中断整段 OnStart
-- ⇒ 首次试玩全部按键无响应的根因（2026-10-24，日志停在 cellCount=200）。

-- 帧号与同帧消费标记（v2.7）：按键回调与 OnUpdate 共用同一帧号；见下方 sfx 帧闸与 anyKeyStart 兜底。
-- 注意：这两个 local 与 UI_STYLE 必须声明在模块 wiring **之前**——注入进模块的闭包
-- （frameOf / styleOf）是词法的，引用「声明在后面的 local」会退化成全局变量，运行时读到 nil
-- （2026-10-28 实测：lua/tetris/widgets:94 attempt to index a nil value (global 'UI_STYLE')）。
frameSeq = 0          -- OnUpdate 每帧 +1；按键回调都落在同一帧号内
keyConsumedFrame = -1 -- 同帧「按键已被某个动作消费」标记（43 键兜底必须让位给真动作）
local UI_STYLE              -- 文字样式表（真机新建控件没有样式，全部由 Lua 运行时写）；定义见本文件后面

-- ===== v2.7 ⑨ 控件工具箱 + 音效引擎（实现见 lua/tetris/widgets.lua / audio.lua）=====
local UI = loadModule('widgets')
if not UI then error('tetris: 模块 widgets 装载失败') end
local WIDGETS = UI.new({
  game = game,
  rootOf = function() return root end,
  styleOf = function() return UI_STYLE end,     -- 惰性：UI_STYLE 在本文件更后面才定义
})
local noteFail, trySet, tryCall, addCursor = WIDGETS.noteFail, WIDGETS.trySet, WIDGETS.tryCall, WIDGETS.addCursor
local find, setTextRaw, applyStyle = WIDGETS.find, WIDGETS.setText, WIDGETS.applyStyle
-- v3.5 ①：HUD 常量文字的**实例份兜底**（层序铁律：服务端 textbox 永远在运行时实例之下）
-- 背景池 wash／棋盘格都是运行时实例，textbox 份被压在下面看不见 ⇒ v3.3 把 textbox 份
-- SetVisible(false) 之后，全仓 40+ 处 `setText(botBanner/hint/topBanner, …)` 变成「写了但看不见」
-- （出图实测：PERSIST_TIP 常驻键位提示、开场句、纳西妲接管文案全都没有墨迹）。
-- 修法：setText 一处收口——凡目标控件有同名 HUD 实例，就同步写实例份 text。
-- 为什么在这里而不是逐处改调用：调用点太多且分散在演出/结算/接管各段，单点漏一处就少一行字。
local function setText(ctl, value)
  if FN.textLayerHidden then return end
  setTextRaw(ctl, value)
  local inst = ctl and ctl.name and HUD_INST[ctl.name]
  if inst and inst ~= ctl then pcall(function() inst.text = value end) end
end
local probeTemplate, instInto, findIn = WIDGETS.probeTemplate, WIDGETS.instInto, WIDGETS.findIn
local AUDIO = loadModule('audio')
if not AUDIO then error('tetris: 模块 audio 装载失败') end
local AUDIO_ENGINE = AUDIO.new({ game = game, frameOf = function() return frameSeq end })
-- ===== v6 架构骨架（本文件只做装配，不实现视图）=====
local PLATFORM_M = loadModule('platform')
local VIEW_LAYERS_M = loadModule('view_layers')
local RENDER_M = loadModule('render')
local VIEW_BOARD_M = loadModule('view_board')
if not (PLATFORM_M and VIEW_LAYERS_M and RENDER_M and VIEW_BOARD_M) then
  print('v6 modules MISSING: platform/view_layers/render/view_board（棋盘会退回旧路径）')
end
local SFX, SFX_CLEAR, sfx = AUDIO_ENGINE.ids, AUDIO_ENGINE.clear, AUDIO_ENGINE.play
-- v4.0 ③ 角色技能：纯逻辑在 lua/tetris/skills.lua（111 断言单测），这里只持状态 + 派发效果。
-- 设计见 docs/characters-design.md；局外养成 v1 = 会话内跨盘（真持久化是缺口，见 05-open）。
local SKILLS = loadModule('skills')
SK = nil    -- 脚本全局（OnStart 里由 skills.new 创建；模块用 getter 惰性读）

-- v5.0 技能反馈的两块新资产（缺任何一个都继续跑：技能机制照旧生效，只是少了文案/特效；
-- 日志锚 `fx=on|off copy=on|off` 说明当前走哪条通道）。
FN.COPY = loadModule('copy')      -- 文案库（四角色×触发点 + 主题色）
FN.FXM  = loadModule('fx')        -- 特效引擎（名卡/环波/描边/边缘光/浮字）
FN.FX   = nil                     -- 运行期实例（懒建：第一次用特效时才建池）



--------------------------------------------------------------------------------
-- 抖屏（2026-10-25）：2D UI 没有相机 ⇒ 抖屏 = 把所有视觉元素按同一偏移量整体平移。
-- 基准坐标在创建时存进 cellBX/cellBY/frameBX/frameBY（唯一真源，不再由字面量重算）。
-- 性能：200 格 + 4 框 × 0.18~0.28s ≈ 6~9 帧 ⇒ 1200~1800 次 SetAnchoredPosition；
--       **只在 shakeT > 0 的帧写**，抖完复位一次，平时一帧都不写。
--------------------------------------------------------------------------------
local SHAKE_DUR = { 0.18, 0.20, 0.23, 0.28 }        -- 1/2/3/4 行
local SHAKE_AMP = { 7, 10, 13, 17 }                 -- 像素；PITCH=30 ⇒ 4 行约半格
local SHAKE_FREQ = 2 * math.pi * 9                  -- 9Hz：0.2s 内约 2 个周期
local function applyShake(ox, oy)
  if not g.cells then return end        -- G[2] 数据层阶段无棋盘控件（T6b-2 建控件后自然走全路径）
  local bx = g.boardOX or 0             -- 双屏棋盘偏移（T6b-2：抖屏坐标=基准+盘偏移+抖动）
  for i = 1, #g.cells do
    local c = g.cells[i]
    if c then tryCall(c, 'SetAnchoredPosition', g.cellBX[i] + bx + ox, g.cellBY[i] + oy) end
  end
  if not g.frames then return end
  for i = 1, 4 do
    local f = g.frames[i]
    if f then tryCall(f, 'SetAnchoredPosition', g.frameBX[i] + bx + ox, g.frameBY[i] + oy) end
  end
end
-- reset=true 连坐标一起复位（抖完 / 重开 / layout 重排时用）
local function stopShake(reset)
  if reset and (g.shakeT > 0 or g.shakePhase > 0) then applyShake(0, 0) end
  g.shakeT, g.shakePhase = 0, 0
end
local function startShake(rows)
  if rows < 1 then return end
  if rows > 4 then rows = 4 end
  g.shakeDur, g.shakeAmp = SHAKE_DUR[rows], SHAKE_AMP[rows]
  g.shakeT, g.shakePhase = g.shakeDur, 0
  print('shake rows=' .. rows .. ' amp=' .. g.shakeAmp .. ' dur=' .. g.shakeDur)
end

-- ===== v6 玩法接线：core_state 的 reducer + 「事件 → 表现」=====
-- 设计（docs/ARCH.md §3）：玩法纯逻辑在 core_state，本文件只剩翻译层。
-- ⚠ 事件里的**日志字面量逐字保留**——tests/ 的 154 条去重 contains 断言依赖
--   move x= / lock / clear n= / ldstart / harddrop rows= / bag= / piece= / tspin / gameover score=。
-- 钩子（core 在结算点回调；core 本身零引擎、零文案、零 UI）：
--   addScore(s,gain)          记账分流（AI 自演进 aiScore / 玩家进 score）
--   addLines(s,cleared)->累计  等级计算用的行数（AI 自演时 g.lines 不动 ⇒ 等级恒 1，与现网同口径）
--   onLock(s,piece)           天赋落块结算（必须在消行之前）
--   onClear(s,cleared,info)   天赋消行倍率（floor(gain×mult+bonus)，相加不相乘）
--   onGarbage(s,n,reason)     机制A 干燥垃圾：**必须在 spawn 之前落盘**，否则顶死漏判
CORE.hooks.addScore = function(s, gain)
  if s.autoDriving then s.AI.score = s.AI.score + gain else s.score = s.score + gain end
end
CORE.hooks.addLines = function(s, cleared)
  if s.autoDriving then
    s.AI.lines = s.AI.lines + cleared
    return s.lines
  end
  s.lines = s.lines + cleared
  return s.lines
end
CORE.hooks.onLock = function(s, piece)
  if not (SK and SKILLS and SKILLS.onLock) then return end
  local okL, evL = pcall(SKILLS.onLock, SK, (FN.skillRoleOf and FN.skillRoleOf(1)) or 'nahida',
    { piece = piece and piece.name, hard = (s.hardDrop == true),
      moved = (s.pieceMoved == true), rotated = (s.pieceRotated == true),
      flipped = (s.lastFlip == true), dwell = tonumber(s.pieceAge) or 0, mode = MODE })
  if okL and type(evL) == 'table' and evL.log then print(evL.log) end
end
CORE.hooks.onClear = function(s, cleared, info)
  if not (SK and SKILLS and SKILLS.onClear) then return nil end
  local okE, ev = pcall(SKILLS.onClear, SK, (FN.skillRoleOf and FN.skillRoleOf(1)) or 'nahida',
    cleared, { level = info.level, combo = info.combo, b2b = info.b2b, mode = MODE })
  if not okE then print('talent onClear ERR ' .. tostring(ev)) return nil end
  if type(ev) ~= 'table' then return nil end
  print('talent onClear role=' .. tostring(FN.skillRoleOf and FN.skillRoleOf(1)) ..
    ' cleared=' .. tostring(cleared) .. ' mult=' .. tostring(ev.mult) .. ' nfx=' ..
    tostring(type(ev.effects) == 'table' and #ev.effects or 0))
  if ev.log then print(ev.log) end
  if type(ev.effects) == 'table' then
    for ei = 1, #ev.effects do pcall(FN.dispatchEffect, s, ev.effects[ei]) end
  end
  return ev.mult, ev.bonus
end
CORE.hooks.onGarbage = function(s, n)
  if not raiseGarbage then return end
  raiseGarbage(s, n)                     -- 内部 save/restore g；这里已经是 spawn 之前
  print('garbage n=' .. n .. ' dryness reset (lv=' .. s.level .. ')')
end

-- 消行事件的表现层（原 clearLines 的后半段；计分/等级/连击已由 core 算完）
CORE.onClearEvent = function(e)
  local cleared, gain, b2bApplied = e.n, e.score, e.b2b
  for r2 = 1, ROWS do                       -- 整盘已落方块闪白（按行数分档，恒短于抖屏）
    for c2 = 1, COLS do
      if g.board[r2][c2] ~= 0 then paint(r2, c2, C(255, 245, 250, 255)) end
    end
  end
  if g.autoDriving then RHO.lines = RHO.lines + cleared end   -- T5 ρ 统计跨局累计（newGame 不清）
  if SK and SKILLS and SKILLS.addExp then   -- 消行给前台角色加经验
    local active = (FN.skillRoleOf and FN.skillRoleOf(1)) or SK.party[SK.active or 1] or 'nahida'
    local up = SKILLS.addExp(SK, active, cleared * 10)
    if up and up.leveled then
      print('skill levelup role=' .. active .. ' lv=' .. tostring(up.lv) .. ' node=' .. tostring(up.node))
    end
  end
  if not g.autoDriving then
    FN.skillCount('lines', cleared)
    if cleared >= 4 then FN.skillCount('tetris', 1) end
    FN.skillUnlockTick()
  end
  if e.levelUp and not g.autoDriving then   -- 升级文案（低频高价值：不被连击横幅压住）
    local ups = { '风带来了新的歌，方块也跟上了节奏。', '这一层的重力，开始变得认真了。',
      '脚下的路快了一点点——别慌，先深呼吸。', '提瓦特的时间在走，你的手也跟上了。' }
    setText(botBanner, ups[(g.level - 2) % #ups + 1] or ups[1])
    trySet(botBanner, 'fontSize', 20)
    bannerTimer = 1.8
    print('copy levelup lv=' .. g.level)
  end
  if cleared >= 2 and G[2] then             -- T7 垃圾行：2/3/4 消送对方 1/2/4 行（B2B 再 +1）
    local other = (g == G[1]) and G[2] or G[1]
    raiseGarbage(other, NUM.GARBAGE[cleared] + (b2bApplied and 1 or 0))
    sfx(SFX.garbageSend, true)
  end
  sfx(SFX_CLEAR[cleared], true)             -- 消行音 + 抖屏（AI 自演同样出声、同样抖）
  startShake(cleared)
  if g.autoDriving then
    g.AI.fx = 0.5
    print('demo clear n=' .. cleared .. ' aiScore=' .. g.AI.score .. ' aiLines=' .. g.AI.lines
      .. ' combo=' .. g.combo .. ' b2b=' .. (b2bApplied and 1 or 0))
  else
    print('clear n=' .. cleared .. ' score=' .. g.score .. ' lines=' .. g.lines
      .. ' combo=' .. g.combo .. ' b2b=' .. (b2bApplied and 1 or 0))
  end
  if not g.taughtClear and not g.autoDriving then
    g.taughtClear = true
    setText(hint, '一次消 4 行 +800')
    setText(botBanner, '空格 直落到底')
    bannerTimer = 4.0
    print('guide clear-tip')
  end
  if not g.autoDriving and bannerTimer <= 0 then   -- 提示优先级：升级 > 四消 > 连击 > 普通
    local CP = CFG.COPY
    if e.levelUp then
      local rec = CP.level[(g.level >= NUM.LEVEL_CAP) and 2 or 1]
      setText(botBanner, (rec.text:gsub('{n}', tostring(g.level))))
      bannerTimer = NUM.LEVEL_TIP
      sfx(SFX.level, true)
      print('tip level=' .. g.level)
    elseif cleared == 4 then
      setText(botBanner, (CP.clear[4].text:gsub('{分}', tostring(gain))))
      bannerTimer = NUM.LEVEL_TIP
      print('tip clear=4')
    elseif g.combo >= 2 then
      local rec = CP.combo[(g.combo >= 5) and 3 or ((g.combo >= 3) and 2 or 1)]
      setText(botBanner, (rec.text:gsub('{n}', tostring(g.combo))))
      bannerTimer = NUM.COMBO_TIP
      print('tip combo=' .. g.combo)
    else
      setText(botBanner, (CP.clear[cleared].text:gsub('{分}', tostring(gain))))
      bannerTimer = NUM.COMBO_TIP
      print('tip clear=' .. cleared)
    end
  end
end

-- 事件 → 表现。spawn 的 renderPiece/renderHud 必须**排在 gameover 之后**（与旧 spawn 同序：
-- 先 showGameOver 再重画，否则压暗被重绘复原——D569 的层序教训）。
CORE.dispatch = function(ev)
  if type(ev) ~= 'table' then return end
  local needRender, hadLock, hadClear = false, false, false
  for i = 1, #ev do
    local e = ev[i]
    local k = e.kind
    if k == 'move' then
      renderPiece()
      print('move x=' .. e.x)
      sfx(SFX.move)
    elseif k == 'fall' then
      renderPiece()
      if CFG.VERBOSE then print('fall y=' .. e.y) end
    elseif k == 'rotate' then
      print('rotate ' .. e.name)
      sfx(SFX.rotate)
      renderPiece()
    elseif k == 'ldstart' then
      print('ldstart')                        -- 观测锚（用例 17）
    elseif k == 'harddrop' then
      print('harddrop rows=' .. e.rows .. ' y=' .. e.y)
    elseif k == 'lock' then
      hadLock = true
      print('lock ' .. e.name .. ' cells=' .. table.concat(e.cells, ','))
    elseif k == 'clear' then
      hadClear = true
      CORE.onClearEvent(e)
    elseif k == 'tspin' then
      print('tspin corners>=3 lines=' .. e.lines .. ' bonus=' .. e.bonus)
      sfx(SFX.tspin, true)
      if not g.autoDriving then
        bannerTimer = NUM.COMBO_TIP
        setText(botBanner, 'T-SPIN ' .. (e.lines > 0 and (e.lines .. ' 消 +' .. e.bonus) or '!'))
      end
    elseif k == 'garbage' then
      -- 已在 hooks.onGarbage 里落盘并打印（必须在 spawn 之前），这里不重复
    elseif k == 'spawn' then
      if G[2] and g == G[2] then print('p2 bag=' .. (g.bagSeq or 0) .. ' piece=' .. e.name) end
      print('bag=' .. (e.bag or 0) .. ' piece=' .. e.name .. ' x=' .. e.x .. ' y=' .. e.y
        .. (e.holdswap and ' holdswap=1' or ''))
      needRender = true
    elseif k == 'gameover' then
      print('gameover score=' .. tostring(g.score) .. ' aiScore=' .. tostring(g.AI and g.AI.score)
        .. ' inst=' .. ((G[2] and g == G[2]) and 'p2' or 'p1'))
      sfx(SFX.over, true)
      if not g.autoDriving then updateBest() end
      showGameOver()
    end
  end
  if hadLock then
    -- 落地音：只有"没消行"时才播（消行已经有一条更强的音，同帧不叠两条，见 sfx 的帧闸）
    if not hadClear then sfx(SFX.lock, true) end
    -- 首次锁定：只教"堆满一行即消除"这一条（排在消行提示之后，与旧 doLock 同序）
    if not g.taughtLock and not g.autoDriving then
      g.taughtLock = true
      bannerTimer = 2.5
      print('guide lock-tip')
    end
  end
  if needRender then renderPiece(); renderHud() end
end

-- 服务端 textbox 按名字取；某个控件缺失不应炸整段 OnStart（真机与模拟器控件集可能不同）

-- v4.0：老的「服务端 textbox + cursor 叠层」按钮表已退役（坐标写死 x=±410、真机控件名一变就消失）。
-- 移动端按钮现在由 UI4（客户端实例层）建，数据在 lua/tetris/config.lua 的 NUM.PHONE。

-- 文字样式：真机 GIL 里新建的控件没有样式（CLI 只建骨架），全部由 Lua 运行时设置。
-- 框高判据：h >= fontSize*1.45 + 4（见 docs/README §10.2），尺寸在 layout() 里给。
-- v3.0 美术改版：整套文字色改为**浅底上的墨色**（变体切换只改 lua/tetris/config.lua 的 THEME）
local C_TEXT, C_GOLD2, C_ACCENT2, C_DANGER, C_BTN =
  THEME.textMain, THEME.goldDeep, THEME.hint,
  C(255, 214, 82, 92), THEME.btnBg
UI_STYLE = {
  title     = { font = 64, color = C_GOLD2,   align = 'Middle' },
  hud       = { font = 20, color = C_TEXT,    align = 'Middle' },   -- v3.0 浅底：HUD 用墨色（原为蓝）
  -- v3.5 ④：「下一个」标签必须 valign=Middle——Top 时字形从框顶起画，8× 放大图实测
  -- fs22 的墨迹只有 17px 高（对照 hud fs20 = 21px），「下」「个」的顶部横笔被框顶裁掉。
  hudNext   = { font = 22, color = THEME.textSub, align = 'Middle', valign = 'Middle' },
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

-- 销毁整层：SetVisible(false) 在真机不保险（实测重开后结算页还在），所以重开就真销毁。
-- 逐个 pcall：真机某个控件销毁抛错不能中断后面（同 OnStart 的护栏思路）。
settleDestroy = function()
  for i = 1, #SETTLE_HOTS do
    pcall(function() game.DestroyClientUIControl(SETTLE_HOTS[i]) end)
  end
  SETTLE_HOTS = {}                      -- v2.8 ④：结算热区随层销毁（v3.3 起含三选项贴片/文字）
  g.optRecs = nil
  if not (g.settleReady or g.settleLayer or g.settleTitle) then return end
  local n = 0
  local members = settleMembers()
  for i = 1, 9 do
    local ctl = members[i]
    if ctl then
      local ok = pcall(function() game.DestroyClientUIControl(ctl) end)
      if ok then n = n + 1 end
    end
  end
  if g.settleLayer then
    local ok = pcall(function() game.DestroyClientUIControl(g.settleLayer) end)
    if ok then n = n + 1 end
  end
  if g.settleBars then                                   -- v2.4 ②：面板分隔线（两条细带）
    for i = 1, #g.settleBars do
      if g.settleBars[i] then
        local ok = pcall(function() game.DestroyClientUIControl(g.settleBars[i]) end)
        if ok then n = n + 1 end
      end
    end
    g.settleBars = nil
  end
  g.settleLayer, g.settleScrim, g.settleCard, g.settleBorder = nil, nil, nil, nil
  g.settleTitle, g.settleScore, g.settleBest, g.settleInfo, g.settleExtra, g.settleOpts = nil, nil, nil, nil, nil, nil
  g.settleReady, g.settleBuildTried = false, false
  g.settleOn, g.settleT, g.settleDone, g.settleFade = false, 0, false, -1
  print('settle destroy n=' .. n)
end

-- 真结算：把「游戏结束」发成服务端信号 tetris_settle —— 地图 hl 里的服务端图 1082130480
-- 收到后「设玩家结算状态 = Victory」→「结算关卡」，弹出官方结算页。
-- 真机是否有 game.ServerSignal 事先未知，所以两种形态都 pcall 探测、结果逐条打日志：
--   ① game.ServerSignal.send('名')             —— 本轮任务单给的形态
--   ② game.ServerSignal('名'):SendSignal()     —— 模拟器 Lua 桥的工厂形态（D112 实测）
-- 两种都失败 ⇒ 本机 Lua 无信号通道，退出改法（Q 退回原来的「结算明细」开关，按键不失效）。
local settleSignalState = 'unknown'   -- 'unknown' | 'sent' | 'none'
-- v5.43（真机日志 rec25428 实证）：真机 `game.ServerSignal` 是**函数**，形态① 每次都会报
-- `attempt to index a function value` 才回落到形态②。第一次探测成功后把可用形态记住，
-- 之后直接走对的那条 —— 少一次必然失败 pcall，也不再在日志里刷 FAILED 假警报。
local settleSignalForm = nil
local function sendSettleSignal()
  if settleSignalForm == 2 then
    pcall(function() game.ServerSignal('tetris_settle'):SendSignal() end)
    settleSignalState = 'sent'
    print('settle signal sent')
    return true
  end
  local ok, err = pcall(function() game.ServerSignal.send('tetris_settle') end)
  if ok then
    settleSignalState = 'sent'
    print('settle signal sent')
    return true
  end
  print('settle signal FAILED :: ' .. tostring(err))
  local ok2, err2 = pcall(function() game.ServerSignal('tetris_settle'):SendSignal() end)
  if ok2 then
    settleSignalForm = 2          -- 记住可用形态，后续不再重试失败那条
    settleSignalState = 'sent'
    print('settle signal sent (factory form)')
    return true
  end
  print('settle signal FAILED (factory form) :: ' .. tostring(err2))
  settleSignalState = 'none'
  return false
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
    g.settleLayer = container
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
      if cls.image[1] then g.settleCard = cls.image[1] end
    end
    print('settle via=container kids=' .. ((cls and (#cls.image + #cls.text + #cls.container)) or 0)
      .. ' img=' .. ((cls and #cls.image) or 0) .. ' text=' .. ((cls and #cls.text) or 0)
      .. ' cont=' .. ((cls and #cls.container) or 0))
  end
  -- 文字模板 guid（容器占位框替换与补行都要用）
  local textGuid = probeSettleTextbox()
  -- 六个槽位里还缺的，用文字模板补（真机容器只有 1 个文本框，要补 5 个；全是容器最省）
  local missing = 0
  for i = 1, 6 do
    if not sl[i] then missing = missing + 1 end
  end
  if missing > 0 then
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
  -- 容器自带的那个 textbox 在真机上是编辑器默认占位（会显示一个大「？」），
  -- 而 SetVisible(false) 对运行时实例不生效、藏不住 ⇒ 直接销毁它，文字全部走文字模板。
  if cls and cls.text[1] and sl[1] == cls.text[1] then
    pcall(function() game.DestroyClientUIControl(sl[1]) end)
    sl[1] = nil
    local ok2, c = pcall(function() return game.InstantiateClientUIControl(textGuid, root) end)
    if ok2 and c then sl[1] = c end
    print('settle container-textbox replaced (placeholder removed)')
  end
  -- ===== v2.4 ② 结算层序修正（用户「黑色窗口异常」的直接解）=====
  -- 运行时实例是「后建的在上面」（两宿主同规则；D570 实测）。而这层是**懒创建**的：
  -- gameOver 那一刻棋盘 200 格与左右栏文字早就存在，容器里的 6 行文字又比遮罩/面板先建
  -- ⇒ 46 号「游戏结束」被半透明面板压在下面，看起来是一团灰雾（v23-settle.png 可证）。
  -- 修法：按 遮罩 → 面板外沿 → 面板底 → 六行文字 的顺序重建，得到
  --   棋盘/左右栏 < 遮罩 < 边框 < 面板 < 文字
  if textGuid then
    for i = 1, 6 do
      if sl[i] then pcall(function() game.DestroyClientUIControl(sl[i]) end) end
      sl[i] = nil
    end
    g.settleScrim = instInto(TPL_GUIDS.cell, root, nil)          -- ① 全屏遮罩：盖住棋盘与左右栏
    g.settleBorder = instInto(TPL_GUIDS.cell, root, nil)         -- ② 面板外沿（4px 描边感）
    g.settleCard = instInto(TPL_GUIDS.cell, root, nil)           -- ③ 面板底
    for i = 1, 6 do                                             -- ④ 六行文字：最上层
      local ok, c = pcall(function() return game.InstantiateClientUIControl(textGuid, root) end)
      if ok and c then c.name = 'settleText' .. i sl[i] = c end
    end
    -- ⑤ 面板装饰：顶部强调条（红）+ 标题下／选项上两条细带（不压字，都在行的缝里）
    g.settleBars = {}
    for i = 1, 3 do
      local bar = instInto(TPL_GUIDS.cell, root, nil)
      if bar then
        bar.name = 'settleBar' .. i
        g.settleBars[#g.settleBars + 1] = bar
      end
    end
    print('settle reorder scrim=' .. (g.settleScrim and 'y' or 'n')
      .. ' border=' .. (g.settleBorder and 'y' or 'n')
      .. ' card=' .. (g.settleCard and 'y' or 'n') .. ' texts=6')
  end
  g.settleTitle, g.settleScore, g.settleBest = sl[1], sl[2], sl[3]
  g.settleInfo, g.settleExtra, g.settleOpts = sl[4], sl[5], sl[6]
  if not (g.settleTitle and g.settleOpts) then
    -- 全部候选都不可实例化 ⇒ 清掉半成品，让 showGameOver 走布局横幅
    local members = settleMembers()
    for i = 1, 9 do
      if members[i] then pcall(function() game.DestroyClientUIControl(members[i]) end) end
    end
    if g.settleLayer then pcall(function() game.DestroyClientUIControl(g.settleLayer) end) end
    g.settleLayer, g.settleScrim, g.settleCard, g.settleBorder = nil, nil, nil, nil
    g.settleTitle, g.settleScore, g.settleBest, g.settleInfo, g.settleExtra, g.settleOpts = nil, nil, nil, nil, nil, nil
    g.settleReady = false
    print('settle layer=none  (所有候选模板都不可实例化 ⇒ 退化为布局横幅结算)')
    return
  end
  g.settleReady = true
  local okKids, kids = pcall(function() return (g.settleLayer or root):GetChildren() end)
  print('settle layer ok children=' .. ((okKids and type(kids) == 'table') and #kids or 0)
    .. ' title=' .. (g.settleTitle and 'y' or 'n') .. ' score=' .. (g.settleScore and 'y' or 'n')
    .. ' best=' .. (g.settleBest and 'y' or 'n') .. ' info=' .. (g.settleInfo and 'y' or 'n')
    .. ' opts=' .. (g.settleOpts and 'y' or 'n')
    .. ' scrim=' .. (g.settleScrim and 'y' or 'n') .. ' card=' .. (g.settleCard and 'y' or 'n'))
  -- 样式显式写死（真机模板是上一轮导入的旧值，不能依赖 authoring）
  for _, ctl in ipairs({ g.settleTitle, g.settleScore, g.settleBest, g.settleInfo, g.settleExtra, g.settleOpts }) do
    -- 这 6 个在下面要么都取到、要么整层判失败，用 ipairs 无风险
    trySet(ctl, 'horizontalAlignment', 'Middle')
    trySet(ctl, 'verticalAlignment', 'Middle')
    trySet(ctl, 'bgColor', C(0, 0, 0, 0))
  end
  -- 字号层级（v2.4 ②：标题 44 → 本局分 34 → 最高 24 → 明细 20 → 分隔点 20 → 选项 26）
  trySet(g.settleTitle, 'fontSize', 44)
  trySet(g.settleScore, 'fontSize', 34)
  trySet(g.settleBest, 'fontSize', 24)
  trySet(g.settleInfo, 'fontSize', 20)
  trySet(g.settleExtra, 'fontSize', 20)
  trySet(g.settleOpts, 'fontSize', 26)
  settleSetColors(0)
  -- 懒创建：层刚建好就直接进入动画起点（不隐藏，也不留"隐藏态"给真机去误解）
  local n = 0
  local members = settleMembers()
  for i = 1, 9 do
    if members[i] then n = n + 1 end
  end
  print('settle build ok n=' .. n .. ' via=' .. (g.settleLayer and 'container' or 'textbox'))
  -- 真机 16:24 日志实证：7 次结算只发出 1 次 `settle signal`——因为信号只在**按 Q** 时发。
  -- 玩家用 R/V 离开结算，官方结算（Victory/结算关卡）就永远不会触发。
  -- 改为**结算页建好即上报一次**（每局一次），Q 仍保留为手动重试。
  if not g.settleSignaled then
    g.settleSignaled = true
    sendSettleSignal()
  end
  layoutSettle(CANVAS_W, CANVAS_H)   -- 懒创建：建完立刻摆位（此时 layout 早就跑过了）
end

-- 结算层文字颜色（alpha 随面板淡入；a 是 0..255）。v2.4 ②：标题提亮 + 明细不再压到 0.72
-- （v2.3 出图里标题/明细都是灰雾，一是层序问题，二是 0.72 折损叠在深底上）
settleSetColors = function(a)
  local dimA = math.floor(a * 0.82)
  trySet(g.settleTitle, 'fontColor', C(a, 185, 138, 60))     -- 深金标题
  trySet(g.settleScore, 'fontColor', C(a, 214, 126, 46))     -- 暖橙分数
  trySet(g.settleBest, 'fontColor', C(a, 62, 74, 99))        -- 墨色最高分
  trySet(g.settleInfo, 'fontColor', C(dimA, 124, 140, 168))
  -- v3.2：明细行现在放本局旁白（轮播 3 条，各有主色）；rgb 由 showGameOver 写进
  -- g.settleNoteRGB，缺省回落原来的 158/174/198（textDim），alpha 仍随面板淡入。
  local nr = g.settleNoteRGB or { 96, 112, 132 }
  -- 旧实现 alpha 只给 0.55 ⇒ 旁白字在浅面板上 1.81:1（机检 fail）。提到 0.88，颜色兜底已压深。
  trySet(g.settleExtra, 'fontColor', C(math.floor(a * 0.88), nr[1], nr[2], nr[3]))
  trySet(g.settleOpts, 'fontColor', C(a, 62, 74, 99))
end

-- 结算动画（0→0.9s 四段）：①0→0.45s 遮罩/面板淡入（棋盘被压到 45% 亮度）
-- ②0.15s 起标题自上滑入（0.35s ease-out）③0.35s 起选项自下滑入 ④0.55s 起标题脉冲 44→48→44
-- ===== v3.3 结算三选项：主次层级 + 三态（常态/悬停/按下）=============================
-- 用户 2026-10-28 反馈：「下面明明是三个框，但是高亮样式完全一样，没有区分度，本质上都是没有审美」。
-- 病根：旧实现把三个选项塞进**同一个服务端 textbox**（一行 '[R] 再来一局　[V] 回主页　[Q] 结算明细'），
-- 三个透明热区只能整体改这一行字色 ⇒ 三项永远同字号同颜色，悬停还连带闪另外两项。
-- 改法：选项改成**运行时实例层**的三块贴片（ImageSource 图元），各自独立配色与三态：
--   ① 主次：再来一局 = 模式色实心胶囊 + 描金外环 + 大一号（最想点的路）；
--           回主页 = 白底 + 描金细边 + 墨字；结算明细 = 纯文字 + 次字色（它给信息，不是行动）。
--   ② 三态：常态 → 悬停整体提亮（向白 22%）→ 按下整体压深（向墨 20%）并下沉 3px。
--   ③ 服务端 settleOpts 保留但隐藏（层序铁律：实例层在 textbox 之上，不隐藏会重影）。
-- 版式 variant（CFG.SETTLE_OPT）：P = 主按钮大 + 两个小（落地）/ E = 等宽三胶囊（对比稿）。
MS.opts = function(cy)
  -- 文字模板可能还没探过（结算层用容器路径时不会写 TPL_TEXT）⇒ 这里补探，否则选项只有贴片没有字
  if not TPL_TEXT then TPL_TEXT = probeSettleTextbox() end
  local cfg = CFG.SETTLE_OPT or {}
  local mt = MODE_THEME[MODE] or MODE_THEME.casual
  local accent = (mt and mt.accent) or THEME.textMain
  local deep = (mt and mt.frame) or THEME.textMain
  local variant = (cfg.variant or 'P'):upper()
  local geoms
  if variant == 'E' then
    geoms = { { -226, 208, 56 }, { 0, 208, 56 }, { 226, 208, 56 } }
  else
    geoms = { { -184, 252, 64 }, { 56, 174, 52 }, { 250, 176, 44 } }
  end
  local acts = { R = 'restart', V = 'backHome', Q = 'detail' }
  local WHITE = C(255, 255, 255, 255)
  local CARD = THEME.card or C(255, 255, 255, 255)
  local GOLD = THEME.gold
  local INK, SUB = THEME.textMain, THEME.textSub
  -- 颜色混调：k>0 向白靠（提亮），k<0 向墨靠（压深）
  local function mix(c, k)
    if k == 0 then return c end
    local a = c // 16777216
    local r0, g0, b0 = (c // 65536) % 256, (c // 256) % 256, c % 256
    local tt = (k > 0) and 255 or 16
    local kk = k < 0 and -k or k
    local function ch(v)
      local n = math.floor(v + (tt - v) * kk + 0.5)
      if n < 0 then n = 0 end
      if n > 255 then n = 255 end
      return n
    end
    return C(a, ch(r0), ch(g0), ch(b0))
  end
  local enumIS = (type(Enum) == 'table' and Enum.ImageSource) or nil
  local function mk(name)
    local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_CELL, root) end)
    if not ok or not c then return nil end
    c.name = name
    SETTLE_HOTS[#SETTLE_HOTS + 1] = c
    return c
  end
  local function piece(name, img, x, y, w, h, col)
    local c = mk(name)
    if not c then return nil end
    tryCall(c, 'SetSizeDelta', w, h)
    tryCall(c, 'SetAnchoredPosition', x, y)
    if img then
      local done = false
      if enumIS and enumIS.StaticReference ~= nil then
        done = pcall(function() c:SetImage(enumIS.StaticReference, img) end)
      end
      if not done then pcall(function() c:SetImage('StaticReference', img) end) end
    end
    trySet(c, 'imageColor', col)
    return c
  end
  UI4.regScreen('settle')
  local items, made = {}, 0
  for i, it in ipairs(cfg.items or {}) do
    local g0 = geoms[i] or geoms[#geoms]
    local x, y, w, h = g0[1], (cy or -136) - 16, g0[2], g0[3]
    local rank = it.rank or i
    local kind = (rank == 1) and 'fill' or ((rank == 2) and 'line' or 'flat')
    local rec = { key = it.key, parts = {}, x = x, y = y, w = w, h = h, kind = kind, rank = rank }
    local function addPill(tag, pw, ph, col)
      local r = ph / 2
      local ix, iy = pw - 2 * r, ph - 2 * r
      if ix < 1 then ix = 1 end
      if iy < 1 then iy = 1 end
      local role = (tag:find('rim', 1, true) and 'rim') or 'bg'
      local function put(c, px, py, pwid, phei)
        if c then rec.parts[#rec.parts + 1] = { c = c, col = col, x = px, y = py, role = role } end
      end
      put(piece(tag .. 'p', BG_IMG.rect, x, y, ix, ph, col), x, y)
      put(piece(tag .. 'q', BG_IMG.rect, x, y, pw, iy, col), x, y)
      local dx, dy = pw / 2 - r, ph / 2 - r
      local q = { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }
      for qi = 1, 4 do
        local px, py = x + q[qi][1] * dx, y + q[qi][2] * dy
        put(piece(tag .. 'r' .. qi, BG_IMG.circle, px, py, 2 * r, 2 * r, col), px, py)
      end
    end
    local ink, size = CARD, 20
    if kind == 'fill' then
      addPill('opt' .. i .. 'rim', w + 7, h + 7, GOLD)
      addPill('opt' .. i .. 'bg', w, h, accent)
      ink, size = WHITE, (variant == 'P') and 25 or 21
    elseif kind == 'line' then
      addPill('opt' .. i .. 'rim', w + 7, h + 7, GOLD)
      addPill('opt' .. i .. 'bg', w, h, CARD)
      ink, size = INK, (variant == 'P') and 20 or 21
    else
      -- v5.4 修用户 2026-10-30 四-1「第三个按钮和前面两个比太敷衍」：
      -- 最低优先级也要有**完整按钮形态**——奶油浅底胶囊 + 一圈更淡的描金细边，
      -- 但尺寸最小、字最浅 ⇒ 三个按钮一眼分出主/次/再次，而不是"两个按钮 + 一行裸字"。
      addPill('opt' .. i .. 'rim', w + 5, h + 5, C(255, 214, 196, 158))
      addPill('opt' .. i .. 'bg', w, h, C(255, 250, 245, 238))
      ink, size = mix(INK, 0.30), (variant == 'P') and 18 or 20
    end
    rec.ink = ink
    -- 文案：主行动带 [键] 前缀（键盘玩家仍一眼看到键位）
    local label = '[' .. tostring(it.key) .. '] ' .. tostring(it.label)
    local tw = w - 8
    local okT, tc = pcall(function() return game.InstantiateClientUIControl(TPL_TEXT, root) end)
    if okT and tc then
      tc.name = 'optT' .. i
      tc.text = label
      trySet(tc, 'fontSize', size)
      trySet(tc, 'fontColor', ink)
      trySet(tc, 'bgColor', C(0, 0, 0, 0))
      trySet(tc, 'horizontalAlignment', 'Middle')
      trySet(tc, 'verticalAlignment', 'Middle')
      trySet(tc, 'enableOutline', true)
      trySet(tc, 'outlineColor', C(200, 255, 255, 255))
      tryCall(tc, 'SetSizeDelta', tw, math.floor(size * 1.5 + 6))
      tryCall(tc, 'SetAnchoredPosition', x, y - 1)
      SETTLE_HOTS[#SETTLE_HOTS + 1] = tc
      rec.text, rec.tx, rec.ty = tc, x, y - 1
    end
    items[#items + 1] = rec
  end
  -- 三态绘制
  local function paint(rec, st)
    local dy = (st == 'down') and -3 or 0
    for _, p in ipairs(rec.parts) do
      local col = p.col
      if st ~= 'normal' and p.role ~= 'rim' then
        if rec.kind == 'fill' then
          col = mix(p.col, (st == 'down') and -0.26 or -0.13)      -- 实心：悬停加深（白字更清楚）
        elseif rec.kind == 'line' then
          col = mix(accent, (st == 'down') and 0.60 or 0.78)       -- 白胶囊：悬停染模式浅色
        elseif rec.kind == 'flat' then
          col = mix(p.col, (st == 'down') and -0.10 or 0.04)       -- 浅底胶囊：极轻的悬停/按下
        end
      elseif st ~= 'normal' and p.role == 'rim' then
        col = mix(p.col, (st == 'down') and -0.34 or 0.10)         -- 金边：悬停略亮 / 按下压深
      end
      trySet(p.c, 'imageColor', col)
      tryCall(p.c, 'SetAnchoredPosition', p.x, p.y + dy)
    end
    if rec.text then
      local sc = rec.ink
      if rec.kind == 'flat' then
        -- 纯文字项：三态打在字色上（常态次色 → 悬停主色 → 按下强调色）
        if st == 'hover' then sc = INK elseif st == 'down' then sc = deep end
        local kk = (st == 'hover') and 0.18 or ((st == 'down') and -0.12 or 0)
        if st == 'normal' then sc = rec.ink else sc = mix(sc, kk) end
      else
        sc = mix(rec.ink, (st == 'hover') and 0.10 or ((st == 'down') and -0.12 or 0))
      end
      trySet(rec.text, 'fontColor', sc)
      tryCall(rec.text, 'SetAnchoredPosition', rec.tx, rec.ty + dy)
    end
  end
  -- 热区（cursor 只做命中；视觉三态全在贴片/文字上——image 类控件没有 AddCursorEventListener）
  if TPL_HIT then
    for i, rec in ipairs(items) do
      local okz, z = pcall(function() return game.InstantiateClientUIControl(TPL_HIT, root) end)
      if okz and z then
        local it = (cfg.items or {})[i] or {}
        z.name = 'hotSettle' .. tostring(it.key)
        tryCall(z, 'SetSizeDelta', rec.w + 12, rec.h + 12)
        tryCall(z, 'SetAnchoredPosition', rec.x, rec.y)
        addCursor(z, 'CursorEnter', function() sfx(SFX.hover, true) paint(rec, 'hover') end)
        addCursor(z, 'CursorExit', function() paint(rec, 'normal') end)
        addCursor(z, 'CursorUp', function() paint(rec, 'hover') end)
        addCursor(z, 'CursorDown', function()
          sfx(SFX.press, true)
          paint(rec, 'down')
        end)
        -- v5.5：动作挂在 Click（=Up+Click 之后一次），否则按住/连点会重复触发
        -- （真机日志 `hot settle Q` 2 秒内 6 次；toggle 类动作会被连点抵消）。
        addCursor(z, 'CursorClick', function()
          print('hot settle ' .. tostring(it.key))
          local fn = SETTLE_ACT[acts[it.key] or '']
          if fn then fn() end
        end)
        SETTLE_HOTS[#SETTLE_HOTS + 1] = z
        UI4.regAdd('settle.' .. tostring(it.key), z, rec.w + 12, rec.h + 12)
        made = made + 1
      end
    end
  end
  g.optRecs = items
  -- 服务端 textbox 那条「[R] 再来一局　[V] 回主页　[Q] 结算明细」必须清空：
  -- 真机 SetVisible(false) 对运行时实例不生效（D581 实证），只有清空文字在两宿主都干净。
  if #items > 0 then setText(g.settleOpts, '') end
  print('settle hotzones n=' .. made .. ' v=' .. variant)
  UI4.dump('settle')
  return #items
end
local function settleTick(d)
  if not g.settleOn or g.settleDone then return end
  g.settleT = g.settleT + d
  local t = g.settleT
  local r1 = t / 0.45
  if r1 > 1 then r1 = 1 end
  if math.abs(r1 - g.settleFade) >= 0.05 or (r1 >= 1 and g.settleFade < 1) then
    g.settleFade = r1
    settleSetColors(math.floor(255 * r1))     -- 只动文字颜色 alpha（真机验证过的通道）
    -- v2.4 ②：棋盘压暗**始终**做（不只无结算层的兜底）——结算层在位时棋盘还在半透明遮罩
    -- 后面，亮格会透过面板抢文字；renderAll 会擦活动块 ⇒ 统一走 renderPiece。
    g.dimRatio, g.dimApplied = 0.45 * r1, r1
    renderPiece()
  end
  local e = function(p)
    if p <= 0 then return 0 end
    if p >= 1 then return 1 end
    return 1 - (1 - p) * (1 - p)            -- ease-out quad
  end
  local p2 = e((t - 0.15) / 0.35)
  if p2 > 0 then
    tryCall(g.settleTitle, 'SetAnchoredPosition', 0, g.settleTitleOff + (g.settleTitleY - g.settleTitleOff) * p2)
  end
  local p3 = e((t - 0.35) / 0.35)
  if p3 > 0 then
    tryCall(g.settleOpts, 'SetAnchoredPosition', 0, g.settleOptsOff + (g.settleOptsY - g.settleOptsOff) * p3)
  end
  local p4 = (t - 0.55) / 0.3
  if p4 > 0 and p4 < 1 then
    local size = 44 + math.floor(4 * math.sin(math.pi * p4) + 0.5)
    if size ~= g.settleSize then g.settleSize = size trySet(g.settleTitle, 'fontSize', size) end
  elseif p4 >= 1 and g.settleSize ~= 44 then
    g.settleSize = 44
    trySet(g.settleTitle, 'fontSize', 44)
  end
  if t >= 0.9 then
    g.settleDone = true
    tryCall(g.settleTitle, 'SetAnchoredPosition', 0, g.settleTitleY)
    tryCall(g.settleOpts, 'SetAnchoredPosition', 0, g.settleOptsY)
    trySet(g.settleTitle, 'fontSize', 44)
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

-- v3.0 浅底上的「弱化」= 向奶白靠，而不是压暗（压暗会让糖果色变脏、和纸白底打架）
MS.fade = function(v, k)
  local a = v // 16777216
  local rr, gg, bb = (v // 65536) % 256, (v // 256) % 256, v % 256
  local m = 1 - k
  return C(a, math.floor(255 - (255 - rr) * m + 0.5), math.floor(255 - (255 - gg) * m + 0.5),
    math.floor(255 - (255 - bb) * m + 0.5))
end

renderAll = function()
  for r = 1, ROWS do
    for c = 1, COLS do
      local v = g.board[r][c]
      if v == 0 then paint(r, c, CFG.COL_EMPTY)
      elseif g.dimRatio > 0 then paint(r, c, dimColor(v, g.dimRatio))
      else paint(r, c, v) end
    end
  end
end

local function renderNext()
  if not g.preview or not g.preview[5] then return end
  for i = 1, 8 do g.preview[i].imageColor = CFG.COL_BG end
  if g.gameOver or not g.nextName then return end
  local s = SHAPES[g.nextName]
  for i = 1, 4 do
    local ctl = g.preview[i]
    local r, c = s.cells[i][1], s.cells[i][2]
    ctl:SetAnchoredPosition(RIGHT_CX + (c - 2.5) * 20, 150 + (2.5 - r) * 20)
    ctl.imageColor = s.color
  end
  -- T2：第二块预览 = bagQ 队头（下下块）。缩 14px、55% 亮度、排第一块下方（中心 y=78）。
  -- bagQ 只读不取——渲染永不改出块序列（refill 只发生在 takeFromBag 内）。
  local e2 = g.bagQ[1]
  if e2 then
    local s2 = SHAPES[e2.name]
    for i = 1, 4 do
      local ctl = g.preview[4 + i]
      local r, c = s2.cells[i][1], s2.cells[i][2]
      ctl:SetAnchoredPosition(RIGHT_CX + (c - 2.5) * 14, 78 + (2.5 - r) * 14)
      ctl.imageColor = MS.fade(s2.color, 0.46)          -- v3.0 浅底：淡一档而不是压暗
    end
  end
  -- T3 Hold 槽（preview[9..12]，左栏镜像位；空槽=底色，canHold=false 时 55% 亮度提示本落子已用掉）
  if g.preview[9] then
    for i = 9, 12 do g.preview[i].imageColor = CFG.COL_BG end
    if not g.st.name then
      -- v3.5 ⑩：空槽把 4 格挪出画布——只刷底色的话格子停在出生位，
      -- 盘面上会留一块 COL_BG 脏格（出图实测：左盘左上角一个 20px 灰方块）
      for i = 9, 12 do tryCall(g.preview[i], 'SetAnchoredPosition', -4000, -4000) end
    end
    if g.st.name then
      local sh = SHAPES[g.st.name]
      for i = 1, 4 do
        local ctl = g.preview[8 + i]
        local r, c = sh.cells[i][1], sh.cells[i][2]
        ctl:SetAnchoredPosition(-RIGHT_CX + (c - 2.5) * 20, 150 + (2.5 - r) * 20)
        ctl.imageColor = g.st.can and sh.color or MS.fade(sh.color, 0.5)   -- 已用掉=淡一档
      end
    end
  end
end

renderHud = function()
  -- T6b-2 双屏：G[2]（AI/对家盘）战况写右栏 keyA-C（服务端单份控件征用，零新建）；
  -- G[1] 保持 hud 主行（前缀 P1）。
  if g ~= G[1] then
    HUD_INST.txt(keyA, MODE == 'pvp' and 'P2 盘' or 'AI 盘')
    HUD_INST.txt(keyB, '得分 ' .. g.score .. '　消行 ' .. g.lines)
    HUD_INST.txt(keyC, '等级 ' .. g.level .. '　落块 ' .. g.pieceCount)   -- v2.1 ④：对家战况加块数
    renderNext()
    return
  end
  local oc = 0
  for r = 1, ROWS do
    for c = 1, COLS do
      if g.board[r][c] ~= 0 then oc = oc + 1 end
    end
  end
  -- T4：stage0 = 入场 AI 自演，HUD 显示 AI 局账本（分数随 AI 消行增长）；接管后显示玩家账
  local s, l = g.score, g.lines
  if guideStage == 0 then s, l = g.AI.score, g.AI.lines end
  HUD_INST.txt(hud, '得分 ' .. s .. '　消行 ' .. l .. '　等级 ' .. g.level
    .. '　已填 ' .. oc)
  setText(hudNext, '下一个')
  HUD_INST.txt(best, '最高 ' .. bestScore)
  renderNext()
end

renderPiece = function()
  renderAll()
  if g.gameOver or not g.piece then return end
  for i = 1, 4 do
    local br = g.piece.y + g.piece.cells[i][1] - 1
    local bc = g.piece.x + g.piece.cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      paint(br, bc, g.piece.color)
    end
  end
end

-- v6：碰撞判定搬到 core_board（纯函数，headless 可断言）
collides = function(cs, px, py)
  if BOARD then return BOARD.collides(g.board, cs, px, py) end
  for i = 1, #cs do
    local br = py + cs[i][1] - 1
    local bc = px + cs[i][2] - 1
    if bc < 1 or bc > COLS or br > ROWS then return true end
    if br >= 1 and g.board[br][bc] ~= 0 then return true end
  end
  return false
end

spawn = function(overrideName, overrideBag)
  -- v6：出块逻辑在 core_state.spawn（袋序/出生位/顶死判定），这里只播事件。
  -- overrideName/overrideBag：Hold 换出的块走这里（不消耗 bag 队列、沿用入槽时的袋序 ⇒ 日志 holdswap=1）。
  CORE.dispatch(g.core.spawn(g, overrideName, overrideBag))
end

doLock = function()
  -- v6：锁定/消行/计分/等级/连击/干燥垃圾/T-spin 全在 core_state.lockAndClear，
  -- 这里只剩「把事件翻译成日志/音效/横幅/送行」（CORE.dispatch + CORE.hooks）。
  CORE.dispatch(g.core.lockAndClear(g))
end

-- 下落一格。manual=true 表示玩家自己按的（↓ / S / 手机↓）：成功下落才给软降分。
-- 重力调用必须传 false —— 否则重力会白送软降分（docs/数值策划.md §7-P6 的坑）。
-- T8 锁定延迟：重力触底不再立即 doLock——启动 NUM.LD 计时（0.5s 缓冲，玩家移动/旋转可重置，
-- 上限 15 次）；软降/硬降是玩家主动落，触底即时锁定（保持旧手感）。AI 走 aiDrop 直锁，不经这里。
local function stepDown(manual)
  -- v6：下落、软降加分、触底锁定、锁定延迟启动都在 core_state.stepDown；这里只播事件
  -- （manual=false 是重力：不加软降分，docs/数值策划.md §7-P6）。
  CORE.dispatch(g.core.stepDown(g, manual))
end

-- 左右移动：键位（箭头 / WASD / 手机热区 / DAS 自动连移）共用一条路径 —— 成功才播移动音。
-- T8：成功移动重置锁定延迟（未超上限）；同时清 lastRot（T-spin 判定要求"最后动作是旋转"）。
local function moveBy(dx)
  -- v6：移动 + 清 lastRot + 锁定延迟重置（上限 LD_RESETS，超限强制锁定）都在 core_state.move。
  -- 返回 ok 供调用点判断（DAS 循环忽略返回值）。
  local ev, ok = g.core.move(g, dx)
  CORE.dispatch(ev)
  return ok == true
end

-- 顺时针 90°：(r,c) → (c, n+1-r)，盒内 1-based（n = 包围盒边长）。
-- rotate() 与入场 AI 共用同一份转法，避免两处不一致。
-- T8：成功旋转置 lastRot（T-spin 判定前置）+ 重置锁定延迟（同 moveBy 上限语义）。
local function rotateCells(cells, n)
  local out = {}
  for i = 1, 4 do out[i] = { cells[i][2], n + 1 - cells[i][1] } end
  return out
end

local function rotate()
  -- v6：旋转（默认无踢墙，与现网同语义）+ lastRot + 锁定延迟重置在 core_state.rotate。
  CORE.dispatch(g.core.rotate(g, 1))
end

-- T3 Hold 暂存：当前块入槽、槽内旧块换出（走完整 spawn 链路——出生位/碰撞校验/顶死判定）。
-- 实现内联在 OnStart 键位监听（listen(NUM.HOLD_KEY, ...)）里——main 函数 200 个 local 已满，
-- 连 local function doHold 都加不进去（实测 lua5.3 报 too many local variables at :1646）；
-- 闭包体内的 local 独立计数不受 main 上限约束。
-- canHold 闸（g.st.can）：每次落子仅可换一次，doLock 重置；空槽首换=当前块入槽+bag 自然出下一块；
-- 换出块不消耗 bag 队列（spawn override 路径），入槽记录原袋序（换出日志 bag= 沿用）。

local function newGame()
  -- v6：玩法状态（棋盘/账本/连击/等级/袋序/Hold/首块/spawn）由 core_state.newGame 原地重置；
  -- 本文件只留表现态（结算层/抖动/最高分闸）。
  g.AI.score, g.AI.lines = 0, 0   -- AI 局账本同样重开归零（demo reset / 玩家 R 都是"新一局"）
  g.settleSignaled = false        -- 每局允许上报一次真结算
  -- 结算层复位（R 重开必须归零：settleT/settlePhase/压暗比例，否则下一次结算从半路开始）
  g.settleOn, g.settleT, g.settleDone, g.settleFade, g.settleSize = false, 0, false, -1, 44
  g.dimRatio, g.dimApplied = 0, -1
  settleDestroy()                    -- 重开即销毁整层（不靠 SetVisible）
  stopShake(true)                    -- 重开时把抖动坐标复位（抖动中按 R 不能留歪的棋盘）
  -- core.newGame 内部：清盘 → 账本归零 → 干燥计数 → 开局障碍行（现网恒 0 行，见 config.OBSTACLE[1]=0）
  -- → 袋序归零 + 首袋排 S/Z → Hold 清空 → 取首块 → spawn（含顶死判定）
  local _, evNew = g.core.newGame({ state = g })   -- ⚠ newGame 返回 (state, events)：多返回值直接传会丢事件
  CORE.dispatch(evNew)
  renderHud()
  if not (G[2] and g == G[2]) and not g.autoDriving then print('newgame') end
end

--------------------------------------------------------------------------------
-- 引导状态机：0=等开始（重力暂停） 1=游戏中 2=键位表（暂停）
--------------------------------------------------------------------------------

local function showKeymap()
  -- 单行，走 1100px 宽的横幅（textbox 是否支持 \n 换行未验证，不赌）
  setText(botBanner, '← → 移动　　↑ 旋转　　↓ 落下　　空格 直落　　G 暂存　　R 重开')
  setText(hint, 'H 继续游戏')
end

local function startIfWaiting()
  if guideStage ~= 0 then return end
  if pendingMode then return end       -- v2.1 ②：模式名动画窗独占（0.5s），任意键不打断
  if helpOpen then toggleHelp() return end   -- v2.1 ③：说明层开着时任意键=先关层不开局
  guideStage = 1
  -- v4.0 ③：解锁计数（局数 / 对战局数）——放在"玩家真正开局"这一刻，AI 自演与复局不算新局
  if SK then
    FN.skillCount('games', 1)
    if MODE == 'pvp' or MODE == 'ai-battle' then FN.skillCount('pvp', 1) end
    FN.skillUnlockTick()
  end
  pendingMode = nil                    -- v2.1 ②：任何开局路径都清动画窗状态
  destroyMenuCards()                   -- v2.1 ②：开局销毁菜单卡片（任意键直开时卡片也要撤）
  MS.teardown()                        -- v2.4 ①：展台退场（墙/框/标题/提示条一次性拆干净）
  setText(topBanner, '')
  setText(botBanner, '')
  -- v3.3 ②：双写位的 textbox 份保持隐藏（实例份在上可见；此前 layout 恢复段把它重新显示=双份叠字）
  if not HUD_INST.hud then
    for _, c in ipairs({ hud, best, hint, keyA, keyB, keyC }) do tryCall(c, 'SetVisible', true) end
  end
  -- v2.9 ②：实例 HUD 同步单屏位（与 layout 的 textbox 位一致，防 dual/单屏切换后叠两行）
  -- v2.9 ③：进局恢复实例 HUD 显示（标题页藏过的还原；双屏 keyA-C 由 layoutDual 摆位）
  if HUD_INST.hud then
    local halfW = (CANVAS_W or 1280) / 2
    tryCall(HUD_INST.hud, 'SetAnchoredPosition', -(halfW - 230), 40)
    tryCall(HUD_INST.best, 'SetAnchoredPosition', -(halfW - 230), -10)
    tryCall(HUD_INST.hud, 'SetVisible', true)
    tryCall(HUD_INST.best, 'SetVisible', true)
  end
  if G[2] then
    tryCall(HUD_INST.keyA, 'SetVisible', true)
    tryCall(HUD_INST.keyB, 'SetVisible', true)
    tryCall(HUD_INST.keyC, 'SetVisible', true)
  end
  -- v3.5 ④：进局即亮「下一个」实例份（标题页藏过并挪到画布外 ⇒ 位与显一起还原）
  local hw_, hh_ = (CANVAS_W or 1280) / 2, (CANVAS_H or 720) / 2
  if HUD_INST.hudNext then
    tryCall(HUD_INST.hudNext, 'SetAnchoredPosition', RIGHT_CX or (hw_ - 230), 255)
    tryCall(HUD_INST.hudNext, 'SetVisible', true)
    tryCall(hudNext, 'SetVisible', false)
  end
  -- v3.5 ④：标题页一并下架的横幅/提示实例，进局还原「位 + 显」（只还原显 = 文字留在画布外）
  if HUD_INST.topBanner then
    tryCall(HUD_INST.topBanner, 'SetAnchoredPosition', 0, hh_ - 36)
    tryCall(HUD_INST.topBanner, 'SetVisible', true)
  end
  if HUD_INST.botBanner then
    tryCall(HUD_INST.botBanner, 'SetAnchoredPosition', 0, -(hh_ - 28))
    tryCall(HUD_INST.botBanner, 'SetVisible', true)
  end
  if HUD_INST.hint then
    tryCall(HUD_INST.hint, 'SetSizeDelta', 420, 150)
    tryCall(HUD_INST.hint, 'SetAnchoredPosition', -(hw_ - 230), -95)
    tryCall(HUD_INST.hint, 'SetVisible', true)
  end
  trySet(topBanner, 'fontSize', 34)
  trySet(botBanner, 'fontSize', 22)
  if overlay then tryCall(overlay, 'SetVisible', false) end
  -- v2.3 ④：进局解除标题页棋盘压暗（casual 接管不 newGame，newGame 的复位段够不着这里）
  if g.dimRatio > 0 then
    g.dimRatio, g.dimApplied = 0, -1
    renderAll()
    renderPiece()
  end
  TK.state, TK.t = 'play', 0            -- T6a：进局即玩家态（菜单选模式/任意键开始同路径）
  -- v2.7 ⑦：进局即套用该模式的主题背景（底色/背板/边框/强调线）；重开走同一条链
  pcall(function() applyModeTheme(MODE) end)
  -- v2.1 ①：双人/对抗模式先入引导态（键位说明+任意键+3-2-1），casual 保持直进（旧用例语义）。
  -- v2.2 ①：键位说明分列两盘正下方（P1 左 keyA / P2 右 keyB，y=-318 棋盘外区域——
  -- 不再横跨棋盘被格子压住；服务端 textbox 层级低于运行时棋盘格，文案必须放棋盘投影区之外）。
  if MODE ~= 'casual' then
    guideStage = 3
    GK.phase, GK.t, GK.count = 'keys', 0, 3
    -- v3.1 四-2：ai-battle=单人页——keyA 显示玩家键组（方向键系，非 WASD），keyB 只显示 AI 就绪
    -- 手机不用键盘：准备期只给触屏话术（键盘图例在手机上是 3 行字，塞不进 200×32 ⇒ 整条不画）
    local keys2 = IS_MOBILE and '点击盘面开始' or (MODE == 'coop')
      and 'P1：W 旋转 · G 暂存'
      or (MODE == 'ai-battle')
        and '← → 移动 · ↑ 旋转 · ↓ 软降 · 空格 直落 · G 暂存'
        or 'P1：A D 移动 · W 旋转 · S 软降 · 空格 直落 · G 暂存'
    local keys2b = IS_MOBILE and 'AI 已就绪' or (MODE == 'ai-battle')
      and 'AI 已就绪 · 与你同规则对战'
      or (MODE ~= 'coop')
        and 'P2：← → 移动 · ↑ 旋转 · ↓ 软降 · X 直落 · F 暂存'
        or 'P2：← → 移动 · ↓ 软降 · X 直落'
    setText(topBanner, (MODE_TITLE[MODE] or MODE) .. ' · 准备开始')
    GK.p1ready, GK.p2ready = false, (MODE == 'ai-battle')   -- v2.5 ① 双方分别 ready
    setText(botBanner, '')
    -- v2.4 ③：y 从 -318 下移到 -338——-318 时 20 号墨迹的上沿仍压进棋盘最后一行
    -- （服务端 textbox 永远在运行时棋盘格之下，出图 v23-pvp-guide.png 可见被格子切一半）。
    local seat1 = C(255, 47, 126, 158)                                  -- P1 深冰蓝
    local seat2 = (MODE == 'pvp') and C(255, 95, 76, 168)                -- 双人：深紫
      or ((MODE == 'coop') and C(255, 63, 139, 60) or C(255, 192, 78, 124))
    -- v3.5 ③：准备期文案**分列三块，同一行**（用户打回：右侧战况与准备提示挤两行、中缝提示压底栏）
    -- 真机层序铁律：服务端 textbox 永远在运行时实例之下 ⇒ 可见文案只能走实例份（HUD_INST）。
    -- 摆位（1600×900 实测）：盘底 ypx750 → 本行 ypx770..810 → 底栏常驻 ypx852..892，三段互不相压。
    --   左：P1 键位卡（x≈-440，宽 540 → -710..-170）
    --   中：准备提示（x=0，宽 260 → -130..130）
    --   右：AI/P2 就绪（x≈+440 → 170..710）
    local halfW = (CANVAS_W or 1280) / 2
    local rowY = -((CANVAS_H or 720) / 2 - 110)
    local seatW = 540
    local seatX = halfW - seatW / 2 - 90
    -- textbox 份：位置/文字保持用例 33 的口径（断言读 text/anchoredPositionX）——但**不显示**
    -- （textbox 在实例层下，显示=双份叠字或直接被 wash/格子吃掉，两个坑都踩过）
    trySet(keyA, 'fontSize', 20)
    trySet(keyA, 'fontColor', seat1)
    tryCall(keyA, 'SetSizeDelta', 520, 76)
    tryCall(keyA, 'SetAnchoredPosition', -280, rowY)
    HUD_INST.txt(keyA, keys2)
    trySet(keyB, 'fontSize', 20)
    trySet(keyB, 'fontColor', seat2)
    tryCall(keyB, 'SetSizeDelta', 520, 40)
    tryCall(keyB, 'SetAnchoredPosition', 280, rowY)
    HUD_INST.txt(keyB, keys2b)
    -- 实例份：左右两张席位卡按盘下摆位（座位色同步，P1/P2 一眼可分）
    if HUD_INST.keyA then
      trySet(HUD_INST.keyA, 'fontSize', 20)
      trySet(HUD_INST.keyA, 'fontColor', seat1)
      -- ⚠ 高度 40 装 3 行 17 号字 ⇒ requiredHeight 73.3 > 40 ⇒ 引擎**整条不画**（手机准备期键位消失）
      tryCall(HUD_INST.keyA, 'SetSizeDelta', seatW, 76)
      tryCall(HUD_INST.keyA, 'SetAnchoredPosition', -seatX, rowY)
      tryCall(HUD_INST.keyA, 'SetVisible', true)
    end
    if HUD_INST.keyB then
      trySet(HUD_INST.keyB, 'fontSize', 20)
      trySet(HUD_INST.keyB, 'fontColor', seat2)
      tryCall(HUD_INST.keyB, 'SetSizeDelta', seatW, 56)
      tryCall(HUD_INST.keyB, 'SetAnchoredPosition', seatX, rowY)
      tryCall(HUD_INST.keyB, 'SetVisible', true)
    end
    if HUD_INST.keyC then tryCall(HUD_INST.keyC, 'SetVisible', false) end   -- 准备期第三行留空（不叠字）
    -- 中缝准备提示：两侧键位卡之间的窄条位（原 x=0 宽 700 ⇒ 与两侧键位串相交 = 用户说的「压住」）
    trySet(hint, 'fontSize', 18)
    trySet(hint, 'fontColor', THEME.textSub)
    tryCall(hint, 'SetSizeDelta', 260, 40)
    tryCall(hint, 'SetAnchoredPosition', 0, rowY)
    -- v5.4（用户 2026-10-30 二-2「右边的简易帮助完全没提角色技能」）：
    -- 准备期底栏补一行技能键位（Z 技能1 / U 技能2 / Y 换台前），玩家在开局前就知道有技能。
    setText(botBanner, 'Z 技能1 · U 技能2 · Y 换台前 · H 说明')
    if HUD_INST.botBanner then
      trySet(HUD_INST.botBanner, 'fontColor', THEME.textSub)
      tryCall(HUD_INST.botBanner, 'SetVisible', true)
    end
    setText(hint, (MODE == 'ai-battle') and '按任意键开始 · H 帮助'
      or '双方按任意键准备 · H 帮助')   -- v3.1 矩阵：ai-battle 单人话术（无 P2）
    if HUD_INST.hint then
      trySet(HUD_INST.hint, 'fontSize', 18)
      trySet(HUD_INST.hint, 'fontColor', THEME.textSub)
      tryCall(HUD_INST.hint, 'SetSizeDelta', 260, 40)
      tryCall(HUD_INST.hint, 'SetAnchoredPosition', 0, rowY)
      tryCall(HUD_INST.hint, 'SetVisible', true)
    end
    tryCall(hint, 'SetVisible', false)   -- textbox 份隐藏（实例份可见）
    print('guide keys ' .. MODE)        -- v2.1 ① 引导锚
    return
  end
  -- P0/T4：玩家账本从 0 开始。AI 自演的分已走 aiScore 账（clearLines 分流），这里归零 score
  -- 是双保险（防未来某条 AI 路径漏改）；aiScore/aiLines 不动——玩家接管**不清 AI 局成绩**（模式语义）。
  -- 连击/B2B/落块数是共享局内状态，接管即归零 ⇒ AI 的连击不会带进玩家局。
  g.score, g.lines, g.level = 0, 0, 1
  g.pieceCount = 0
  g.combo, g.maxCombo, g.b2b = 0, 0, false
  renderHud()
  setText(hint, '堆满一行即消除')
  if MODE == 'casual' then showPersistTip() end   -- v2.6 ① casual 常驻提示
  -- v3.2 原神文案：开局句（S01）**本轮不接线**——casual 进局后 botBanner 是常驻键位提示的位子，
  -- 用例 29 在 t=1.4s 断言它等于 PERSIST_TIP；开场句要占用这条横幅就得把断言时机往后挪。
  -- 留表待接（config.lua COPY.start.casual），接线方式见 docs/genshin-copy-design.md §3 批 2。
  print('mode=' .. MODE)                -- T6：进局模式（菜单选择或默认休闲）
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
showGameOver = function(overTitle)
  -- v2.7（用户反馈①）：无论谁把盘打死（玩家手打 / casual 的 AI 代打 / 对家盘顶满），
  -- 终局一律先回到玩家态——否则 R 重开后 TK.state 仍是 'ai'，AI 会立刻接管新局，
  -- 看起来就像「AI 死亡没有走玩家那套流程」。
  TK.state, TK.t = 'play', 0
  -- v2.2 ②③：双屏任一盘死=模式终局——胜负走**全屏结算层**（复用 v1 主路径，标题带胜负文案），
  -- 置 MODE_OVER 冻结两盘（输入/重力/AI 全停，OnUpdate 只推结算动画）。casual 不置位。
  -- 结算层懒创建槽在 G[1]——对家盘（G[2]）死时切回主实例挂层，主盘标记终局以走结算渲染。
  if G[2] and g == G[2] then
    MODE_OVER = true
    local winText = (MODE == 'pvp' and 'P1 胜！')
      or (MODE == 'coop' and '合作成功！')
      or '你赢了！'
    print('battle win')                  -- v2-plan T6 验收锚
    local save = g
    g = G[1]
    G[1].gameOver = true                 -- 主盘终局：重力/输入已由 MODE_OVER 冻结，这里只走结算渲染
    showGameOver(winText)
    g = save
    return
  end
  if G[2] and g == G[1] then
    MODE_OVER = true
    print('battle lose')                 -- v2-plan T6 验收锚（结算页照常弹，标题保持「游戏结束」）
  end
  bannerTimer = 0
  g.settleOpen = false
  setText(botBanner, '')               -- v2.6 ① 结算撤常驻
  -- v3.5 ⑥：结算期把**战况列**下架——遮罩是半透明的，否则「得分 204 消行 0 / 最高 2…」
  -- 会从面板左侧透出来（出图 d-settle.png 实测），读起来像结算页里还有一列没对齐的字。
  -- 只下架战况列、不清 text 字段（用例仍读得到数值），横幅保留（结算层建不出来时走横幅兜底）。
  -- 重开/回菜单由 startIfWaiting / layout 还原。
  if HUD_INST.hideStats then HUD_INST.hideStats() end
  print('guide gameover score=' .. g.score .. ' lines=' .. g.lines)
  -- 懒创建：第一次结算才建这一层（建的时候棋盘格早就存在 ⇒ 天然在它上面）
  if not g.settleReady and not g.settleBuildTried then
    g.settleBuildTried = true
    buildSettleLayer()
  end
  if g.settleReady then
    -- 结算层：先把文字写好，位置由 settleTick 从屏幕外滑入（0→0.9s 四段动画）
    setText(g.settleTitle, overTitle or '游戏结束')
    setText(g.settleScore, '本局 ' .. g.score .. ' 分')
    setText(g.settleBest, '最高 ' .. bestScore)
    setText(g.settleInfo, '消行 ' .. g.lines .. ' 行　　落块 ' .. g.pieceCount .. '　　等级 ' .. g.level)
    -- v2.4 ②：明细行先做成分隔点（Q 键的结算明细会覆盖这一行）
    -- v3.2 原神文案：改成**本局旁白轮播**（3 条，带本局消行数）——原来这一行只是装饰点，
    -- 换掉零成本且不占信息位；颜色由 settleSetColors 用 g.settleNoteRGB 上色（随淡入 alpha）。
    local noteRecs = CFG.COPY.settle
    g.settleNoteIdx = (g.settleNoteIdx or 0) % #noteRecs + 1
    local noteRec = noteRecs[g.settleNoteIdx]
    g.settleNoteRGB = { (noteRec.color // 65536) % 256, (noteRec.color // 256) % 256,
      noteRec.color % 256 }
    setText(g.settleExtra, (noteRec.text:gsub('{lines}', tostring(g.lines))))
    setText(g.settleOpts, '[R] 再来一局　[V] 回主页　[Q] 结算明细')
    -- v3.3：三个选项改成运行时实例贴片（主次层级 + 三态），见 MS.opts
    MS.opts(g.settleOptsY or -136)
    trySet(g.settleTitle, 'fontSize', 44)
    g.settleSize, g.settleT, g.settleFade, g.settleDone, g.settleOn = 44, 0, -1, false, true
    -- image 一次性给**终值**：真机可能不认 imageColor 的 A 通道（不认就变不透明纯色），
    -- 所以"渐暗"只靠文字 fontColor 的 A 通道渐入（这条通道在真机是一直在用的）。
    -- v2.4 ②：遮罩做成真·全屏（层序上它在棋盘/左右栏之上、面板之下）⇒ 结算时只剩面板世界
    -- v3.0：遮罩/面板/描边全部换成清透浅色（奶油面板 + 描金边 + 模式色顶条）
    local mt = MODE_THEME[MODE] or MODE_THEME.casual
    if g.settleScrim then trySet(g.settleScrim, 'imageColor', THEME.scrim) end
    if g.settleBars then
      trySet(g.settleBars[1], 'imageColor', mt.frame)                -- 顶部强调条（模式色）
      trySet(g.settleBars[2], 'imageColor', THEME.gold)              -- 标题下细带
      trySet(g.settleBars[3], 'imageColor', THEME.gold)              -- 选项上细带
    end
    if g.settleCard then trySet(g.settleCard, 'imageColor', THEME.panel) end
    if g.settleBorder then trySet(g.settleBorder, 'imageColor', THEME.bezel) end
    settleSetColors(0)
    tryCall(g.settleTitle, 'SetAnchoredPosition', 0, g.settleTitleOff)
    tryCall(g.settleOpts, 'SetAnchoredPosition', 0, g.settleOptsOff)
    local members = settleMembers()
    for i = 1, 9 do
      tryCall(members[i], 'SetVisible', true)
    end
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
  setText(topBanner, overTitle or '游戏结束')
  -- 底部一行：成绩 + 两个选项；26 号 → 需 >= 41.7（layout 给 48）
  trySet(botBanner, 'fontSize', 26)
  trySet(botBanner, 'fontColor', C(255, 214, 232, 246))
  setText(botBanner, '本局 ' .. g.score .. ' 分　消行 ' .. g.lines .. ' 行'
    .. '　　[R] 再来一局　[V] 回主页　[Q] 结算')
  setText(hint, '')
end

updateBest = function()
  if g.score > bestScore then bestScore = g.score end
end

--------------------------------------------------------------------------------
-- 入场「AI 自演」：guideStage == 0 时脚本自己玩，玩家一按键（startIfWaiting）立即交还控制。
-- 第四轮（用户反馈「看着窒息」）：
--  ① 选位像人：贴墙奖励（tie-breaker 量级）+ 禁止在中间挖 1 宽深井（竖 I 不许塞中间）；
--  ② 执行像人：观察 → 分段横移（1~2 格一停）→ 途中偶尔小落 → 到位犹豫 / 再看一眼 →
--     最后 50% 软降逐格落 / 50% 硬降，全程打 `demo pace` / `demo act` 日志。
local AI_OBSERVE_MAX = 0.70                         -- 观察上限（下限 obsMin 是档位参数，见 NUM.AI_LEVELS）
-- ⚠ main chunk 的 **local 数量**贴着 Lua 5.3 硬上限（200）：真机编译期
-- `too many local variables (limit is 200) in main function` 会直接拒载整个脚本。
-- 所以常量一律**收拢成表**（10 个 local → 1 个），新加常量只能往 AIC 里塞字段。
local AIC = {
  ROT_MIN = 0.15, ROT_MAX = 0.25,           -- 旋转本身
  ROTGAP_MIN = 0.10, ROTGAP_MAX = 0.20,     -- 两次旋转之间
  HOVER_MIN = 0.20, HOVER_MAX = 0.40,       -- 落定前「再看一眼」
  SOFT_MIN = 0.06, SOFT_MAX = 0.12,         -- 软降一格
  -- T5：单块时长带/横移间隔带/观察下限/目标带全部改读 NUM.AI_LEVELS（docs/v2-ai-design.md §四）
  RESET_ROWS = 12,                          -- 堆到这么高就清盘重开
  W_WALL = 0.06, W_WELL = 0.9,              -- 贴墙奖励 / 深井惩罚系数
  WELL_DEPTH = 3,                           -- 1 列宽凹槽多深才算「深井」
}
-- 兼容别名：正文里仍按旧名读（一次替换省掉几百处改动，代价=0 个 local）
AI_ROT_MIN, AI_ROT_MAX = AIC.ROT_MIN, AIC.ROT_MAX
AI_ROTGAP_MIN, AI_ROTGAP_MAX = AIC.ROTGAP_MIN, AIC.ROTGAP_MAX
AI_HOVER_MIN, AI_HOVER_MAX = AIC.HOVER_MIN, AIC.HOVER_MAX
AI_SOFT_MIN, AI_SOFT_MAX = AIC.SOFT_MIN, AIC.SOFT_MAX
AI_RESET_ROWS, W_WALL, W_WELL, WELL_DEPTH = AIC.RESET_ROWS, AIC.W_WALL, AIC.W_WELL, AIC.WELL_DEPTH

-- 自演专用小随机：独立 LCG，不动方块袋那条序列 ⇒ 用例/出图仍可复现
local aiSeed = 20261024
-- ⚠⚠ 这条 LCG **必须保持整数算术**，别跟 core_rng.rand 一起"统一"成浮点。
-- 2026-10-31 实测（每条都是 build 后真跑，两次复现完全一致）：
--   A) core_rng 浮点 + aiRand **浮点** ⇒ 模拟器 57-copy-garbage **FAIL**（922 行日志）
--   B) core_rng 浮点 + aiRand **整数** ⇒ 57-copy-garbage **PASS**（944 行），headless 仍 69/70
-- 原因不是文案，是 AI 用 aiRand(100)/aiRand(1000) 做阈值判定：序列一挪，AI 演出时间线整体位移。
-- 结论：**出块流（core_rng）与 AI/垃圾流（aiRand）是两条独立的随机流，各自取证、不许统一**。
-- 出块流为什么必须浮点：见 core_rng.lua 头注释「三端同序」（lua5.3 的 64 位整数 vs Fengari/LuaJIT 的
-- IEEE-754 double；不显式浮点则 headless 与模拟器序列分叉，9 条用例红）。
aiRand = function(n)
  aiSeed = (aiSeed * 1103515245 + 12345) % 2147483648
  return (aiSeed // 65536) % n + 1
end
CORE.aiRand = aiRand      -- v6：core 侧（洞位随机源）间接引用；本行之后闭包才绑到 local
local function aiRange(lo, hi) return lo + (hi - lo) * (aiRand(1000) / 1000) end
local function aiFmt(x) return string.format('%.2f', x) end

-- 堆叠高度：最高一列已填的行数（0 = 空盘）
-- v4.0 ④：靠墙井深（1 列宽）——留 I 块四消的前提条件。
-- 只看两侧靠墙列：depth = 邻列高度 - 本列高度（>0 才是井）。
-- 旧 El-Tetris 权重：evalNext（2-ply 备用）仍在 main 里引用；拆模块时随块被带走，
-- 这里恢复成**脚本全局**（不占 local —— main chunk 的 local 是硬上限）。
W_AGG, W_LINE, W_HOLE, W_BUMP = -0.510066, 0.760666, -0.35663, -0.184483
-- ===== BCTS 棋盘评估已拆到 lua/tetris/aieval.lua（main chunk 的 200-local 上限逼的）=====
-- 调用点从 AEVX.colHeight(...) 改成 AEV(....)：动态加载失败时整体降级为空实现，不炸主流程。
local AEV = loadModule('aieval')
local AEVX = (AEV and AEV.new) and AEV.new({
  rows = ROWS, cols = COLS, num = NUM,
  board = function() return g end,
  collides = function(cells, x, y) return collides(cells, x, y) end,
}) or nil
if not AEVX then print('aieval module FAIL（棋盘评估降级：AI 只会随机落子）') end
AEVX = AEVX or {
  colHeight = function() return 0 end,
  wellDepth = function() return 0 end,
  stackHeight = function() return 0 end,
  evalBoard = function() return nil end,
}

local function aiChoose()
  if not g.piece then return nil end
  local cands = {}
  local cells = g.piece.cells
  -- 旋转盒边长必须用 piece.n（O=2 / T,S,Z,J,L=3 / I=4），不能用 #cells（恒等于 4）
  local boxN = g.piece.n or 4
  for rot = 1, 4 do
    local wmax = 1
    for i = 1, 4 do
      if cells[i][2] > wmax then wmax = cells[i][2] end
    end
    for x = 1, COLS - wmax + 1 do
      local sc, h, complete = AEVX.evalBoard(cells, x)
      if sc then
        local leftDist = x - 1
        local rightDist = COLS - (x + wmax - 1)
        local wallDist = leftDist
        if rightDist < wallDist then wallDist = rightDist end
        cands[#cands + 1] = {
          rot = rot, x = x, score = sc, h = h, clear = complete,
          wall = wallDist, from = math.abs(x - g.piece.x),
        }
      end
    end
    cells = rotateCells(cells, boxN)
  end
  if #cands == 0 then return nil end
  -- v4.0 ④-a4：**显式四消射击**——井已挖到 ≥2 深且当前块是 I，就直接竖放到井列。
  -- 为什么必须显式：1-ply 评估把"现在消 1 行"算得比"等等消 4 行"高，永远选不到四消。
  -- I 块竖放 = rot1（cells 全在盒内第 2 列），落点 x = COLS-1 ⇒ 占第 COLS 列。
  if (NUM.AI_WELL or 0) > 0 and g.piece and g.piece.name == 'I' and g.piece.n == 4 then
    local wd = AEVX.wellDepth()
    if wd >= 2 then
      for _, c in ipairs(cands) do
        if c.rot == 1 and c.x == COLS - 1 and (c.clear or 0) >= 2 then
          print('ai tetris shot depth=' .. tostring(wd) .. ' clear=' .. tostring(c.clear))
          return c
        end
      end
    end
  end
  local function better(a, b)
    if not b then return true end
    if a.score > b.score + 1e-9 then return true end
    if a.score < b.score - 1e-9 then return false end
    if a.wall ~= b.wall then return a.wall < b.wall end     -- 同分贴墙
    if a.from ~= b.from then return a.from < b.from end     -- 再比离当前列
    return a.x < b.x                                        -- 再比靠左
  end
  -- v2.4 纯 BCTS 分数决策：最优=BW 加权分最高（eroded 奖励已内建，不再叠「能消行优先」
  -- 三层规则与竖 I 贴墙特判——两者都会偏离论文校准；同分 tie-break 仍贴墙+近距+靠左）
  local best
  local anyBest                                  -- v2.7：不看高度上限的最优合法位（顶死兜底用）
  for _, c in ipairs(cands) do
    if better(c, anyBest) then anyBest = c end
    if c.h <= AI_RESET_ROWS then
      if better(c, best) then best = c end
    end
  end
  -- v2.7（用户反馈①⑧）：盘面过高不再"拒绝出手"。旧实现 return {reset=true} ⇒ AI 走一条专属旁路：
  -- 块永不落地、不判负、不结算（实测每帧刷 'demo reset plan=too-high'）。现在把"最高但不超限"的
  -- 兜底位带出去，由 aiTickCore 硬降落地——之后 spawn 顶死判定与玩家完全同一条链路。
  if not best then return { reset = true, fallback = anyBest } end
  -- 落点行（软降要按格数摊时间）
  local landingY = 1
  local probe = cells
  cells = g.piece.cells
  for _ = 1, best.rot - 1 do cells = rotateCells(cells, boxN) end
  probe = cells
  landingY = 1
  while landingY < ROWS and not collides(probe, best.x, landingY + 1) do landingY = landingY + 1 end
  -- T5：候选表按分降序（安全位 h<=AI_RESET_ROWS）——供失误注入（topK 池）与
  -- 2-ply 精化（top-12 重排）使用；1-ply best 仍按上面三层优先级+贴墙规则选出（保底不变）。
  local sorted = {}
  for _, c in ipairs(cands) do
    if c.h <= AI_RESET_ROWS then sorted[#sorted + 1] = c end
  end
  table.sort(sorted, function(a, b)
    if a.score ~= b.score then return a.score > b.score end
    if a.wall ~= b.wall then return a.wall < b.wall end
    if a.from ~= b.from then return a.from < b.from end
    return a.x < b.x
  end)
  return { rot = best.rot - 1, x = best.x, landingY = landingY,
    best1 = best, sorted = sorted }
end

-- 把方案编成"人手动作序列"（每步自带时长；随机化都在这里定下来，执行只按序列走）
-- 观察 0.25~0.7s（在 thinking 阶段已停）→ 旋转（0.15~0.25 + 间隔 0.1~0.2）→
-- 横移每次 1~2 格（间隔 0.08~0.25）→ 途中 35% 小落 1~2 格 → 到位 20% 回退一格再回来 →
-- 40% 再看一眼 0.2~0.4s
local function buildQueue(plan)
  local q = {}
  local totalCells = math.abs(plan.x - g.piece.x)
  local dir = 1
  if plan.x < g.piece.x then dir = -1 end
  for _ = 1, plan.rot do
    q[#q + 1] = { kind = 'rot', wait = aiRange(AI_ROT_MIN, AI_ROT_MAX) + aiRange(AI_ROTGAP_MIN, AI_ROTGAP_MAX) }
  end
  local remaining, moved, softRows = totalCells, 0, 0
  local softAt = nil
  if totalCells >= 3 and aiRand(100) <= 35 then softAt = aiRand(totalCells - 1) end
  while remaining > 0 do
    local step = aiRand(2)                       -- 1 或 2 格
    if step > remaining then step = remaining end
    local mlv = NUM.AI_LEVELS[NUM.AI_LEVEL] or NUM.AI_LEVELS[2]
    local gap = aiRange(mlv.moveMin, mlv.moveMax)
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

-- T5：Hold 换块的唯一实现（玩家 G 键与 AI 自演共用一套，lead 指示"AI 复用此语义，别另写一套"）。
-- 挂 NUM 表函数而不是 local function——main 函数 200 个 local 已满（D612/D616 两次实测爆）。
NUM.doHold = function()
  -- v2.8 用户定版语义（防滥用）：空槽=纯存入；非空槽=交换且**两块各推进一格**——
  -- 当前块先 y+1（撞底=直接锁定 hold forced lock，也是代价）；换出块到出生位后立刻再落一格。
  if g.gameOver or not g.piece or not g.st.can then return false end
  g.st.can = false
  local cur, curBag = g.piece.name, g.nextBag
  local outName, outBag
  if g.st.name then
    outName, outBag = g.st.name, g.st.bag   -- 槽内有块：换出
  end
  if not outName then
    g.st.name, g.st.bag = cur, curBag or 0
    print('hold in=' .. cur .. ' out=-')
    sfx(SFX.rotate)
    spawn()                      -- 空槽首换：bag 自然出下一块（nextName 已就位）
    return true
  end
  -- 交换场景：当前块推进一格（撞底=强制锁定，交换到此为止——锁定触发的 spawn 出下一块）
  local curDrop = 0
  if not collides(g.piece.cells, g.piece.x, g.piece.y + 1) then
    g.piece.y = g.piece.y + 1
    curDrop = 1
  end
  if curDrop == 0 then
    g.st.name, g.st.bag = nil, 0      -- 槽保留原块？不——用户语义「当前块也下落（锁定）」：
    g.st.can = true                    -- 强制锁定已付出代价，闸回位；槽不动
    print('hold forced lock in=' .. cur)
    sfx(SFX.lock, true)
    doLock()                           -- 锁定当前块；spawn 的自然新块继续（不取槽）
    return true
  end
  -- 当前块已落一格：存入槽，换出块出生位+立刻再落一格
  g.st.name, g.st.bag = cur, curBag or 0
  print('hold swap in=' .. cur .. ' out=' .. outName .. ' cur_drop=1')
  sfx(SFX.rotate)
  spawn(outName, outBag)               -- 换出块走 override 路径（不消耗 bag，日志带 holdswap=1）
  local outDrop = 0
  if g.piece and not collides(g.piece.cells, g.piece.x, g.piece.y + 1) then
    g.piece.y = g.piece.y + 1
    outDrop = 1
    renderPiece()
  end
  print('hold swap out_drop=' .. outDrop)
  return true
end

-- 清盘重开（演示循环用）：不弹结算页，横幅与入场动画复位
local function demoLoopReset()
  g.autoDriving = true
  newGame()
  g.autoDriving = false
  g.dimRatio, g.dimApplied = 0.45, -1   -- v2.3 ④：回标题页保持棋盘弱化
  renderAll()
  renderPiece()
  introT, introFont, introPulse = 0, 26, 22
  setText(hint, '键盘操作')
  setText(topBanner, '俄罗斯方块')
  setText(botBanner, IS_MOBILE and '点卡片选模式 · 右上角：角色 · 说明'
    or '按 1-4 选模式 · 任意键=休闲 · H 游戏说明')
  pcall(buildMenuCards)                 -- v2.1 ②：回标题屏重建卡片（exitToMenu 后/演出循环复位）
  -- v3.5 ④：回标题屏同样下架 HUD 实例（含横幅/下一个；标题页只看展台）
  if HUD_INST.hideAll then HUD_INST.hideAll() end
  trySet(topBanner, 'fontColor', C_GOLD2)
  trySet(topBanner, 'fontSize', 26)
  trySet(botBanner, 'fontColor', C_ACCENT2)
  trySet(botBanner, 'fontSize', 22)
  g.AI.phase, g.AI.t, g.AI.queue, g.AI.qi, g.AI.piece, g.AI.dur = 'thinking', 0, nil, 1, nil, 0
  g.AI.search = nil
  g.AI.wait = aiRange((NUM.AI_LEVELS[NUM.AI_LEVEL] or NUM.AI_LEVELS[2]).obsMin, AI_OBSERVE_MAX)
end

-- T6 模式进出（demoLoopReset 后定义：依赖 newGame/startIfWaiting/settleDestroy/spawn 均已就绪）。
-- feedMirror 实现：从镜像队列拉一块喂给 AI 盘（override spawn 路径，不消耗 AI 盘的袋）。
feedMirror = function()
  local e = table.remove(MIRRORQ, 1)
  if not e or not G[2] or G[2].gameOver then return end
  local save = g                             -- 跨实例铁律：保存 → 切目标 → 操作 → 还原
  g = G[2]
  spawn(e.name, e.bag)
  print('p2 mirror name=' .. e.name .. ' bag=' .. e.bag)   -- 双屏日志 p2 前缀（主日志锚不动）
  g = save
end

-- T7 垃圾行（v2-plan §三/设计书 §四）：给目标盘底部垫 n 行「1 洞」垃圾（暗灰 CFG.COL_GRAY）。
-- 跨实例铁律（§1.8 Step3 ②）：入口保存 g → 切目标 → 操作 → 还原。
-- 洞位随机用 aiRand（AI 独立 LCG）——设计书判据「raiseGarbage 不动 bag」（全局 rand 会改出块序列）。
-- 顶行被推出=内容丢失（首版简化，垃圾行游戏普遍语义）；当前落子与垃圾重叠则上移，上不动=顶死。
raiseGarbage = function(target, n)
  if not target or target.gameOver or n < 1 then return end
  -- v4.0 ③ 甘雨「冰封」：冻结期内玩家的盘不吃垃圾（AI 盘不受玩家技能影响，保持公平）
  -- v6：冻结按**盘**判定，不再写死 G[1]（pvp 里 P2 也是玩家；旧写法让 P2 完全不受保护）
  local freezeLeft = tonumber(SK and SK.freezeT) or 0
  if SK and SKILLS and SKILLS.params then
    local okP, prF = pcall(SKILLS.params, SK, 'ganyu')
    if okP and type(prF) == 'table' and tonumber(prF.freezeLeft)
      and tonumber(prF.freezeLeft) > freezeLeft then
      freezeLeft = tonumber(prF.freezeLeft)
    end
  end
  if freezeLeft > 0 and target == G[1] then
    print('skill freeze block n=' .. n .. ' left=' .. aiFmt(freezeLeft))
    return
  end
  local save = g
  g = target
  for _ = 1, n do
    local hole = aiRand(COLS)
    table.remove(g.board, 1)
    local row = {}
    for c = 1, COLS do row[c] = (c == hole) and 0 or CFG.COL_GRAY end
    g.board[#g.board + 1] = row
  end
  if g.piece then
    while g.piece.y > 1 and collides(g.piece.cells, g.piece.x, g.piece.y) do
      g.piece.y = g.piece.y - 1
    end
    -- v2.6 判负修复（用户「AI 操控时结束判定提早，实际还能玩」）：垃圾行顶推后不再立即判负——
    -- 旧判定只查当前块所在列（垃圾行 hole 列明明有空间也死）且非标准（标准 topout=新块
    -- spawn 不可放，不是活动块被顶）。被顶碰撞/嵌入的块交给 LD 锁定延迟路径：重力 tick 发现
    -- 触底即启动 0.5s 延迟，玩家可横移自救；真正无路可走时锁定 → 下一块走标准 spawn 判定兜底。
  end
  renderAll()
  renderPiece()
  renderHud()
  print('garbage n=' .. n)              -- v2-plan T7 验收锚（被送方日志）
  -- v4.0 ②：受击文案——给玩家"被打了"的明确反馈（对抗场景的文案出口）
  if not g.autoDriving then
    setText(botBanner, n >= 3 and '对面把整条街都掀过来了——撑住！' or '有一点碎石落进了你的盘中。')
    bannerTimer = 1.6
    print('copy garbage recv n=' .. n)
  end
  sfx(SFX.garbageRecv, true)            -- 受击音（force 防同帧吞）
  startShake(n >= 3 and 3 or 2)         -- 受击抖屏（行数越多越强）
  g = save
end

-- ===== v2.1 ② 标题屏四模式大视觉卡片 =====
-- 横排 4 卡（x=±390/±130，y=0），每卡 = cell 模板色块 260×120（暗色底）+ 2 条 settle 文字
-- （模式名 26 号白字 / 特色句 16 号浅字；框高按 h≥1.45×fontSize+4 给 48/32）。
-- 别加新模板（task-12 约束）：色块复用 TPL_CELL、文字复用 settleText 模板，全运行时实例化。
local TPL_TEXT = nil                   -- settleText 模板 guid（首次建卡时探测缓存；说明层共用）
-- ===== v2.7 ④ 独立规则说明页（H 常驻入口；整页三栏讲全：操作/计分判定/四种模式）=====
-- 用户原话（2026-10-28 反馈④）：「h按钮应该常驻，并且目前按下没有任何反应，h按钮请设计一个独立的页面，
-- 介绍游戏的全部规则，按键说明，和不同模式下的规则」。
-- 两处硬修：①**键名错了**——真机/网页物理 H 发的是 CraftspersonKey15（craftCodes[15]='KeyH'），
-- 而 v1 只监听 CharacterSkill1Key（那是物理 E）⇒ 真机按 H 永远没反应（用例注入虚拟键名，测不出来）。
-- ②说明层原来是 stage0 专属的 10 行小字，局内/结算页看不到；改成**任何阶段都能开**的整页。
-- 版式（按画布自适应）：暗底整屏 + 顶部标题 + 三栏（左=操作与按键 / 中=计分与判定 / 右=四种模式）
-- + 页脚提示。全用运行时实例（cell 暗底 + stext 文字），不加新模板。
-- 框高判据（D566 实测）：h ≥ fontSize×1.45+4，否则整行静默不画——下面按字号自动算。
local function destroyHelpLayer()
  local n = 0
  for i = 1, #HL do
    local ok = pcall(function() game.DestroyClientUIControl(HL[i]) end)
    if ok then n = n + 1 end
  end
  HL = {}
  if n > 0 then print('guide help off n=' .. n) end
end
-- 版式三选一（CFG.HELP.variant）：
--   A 委托板 —— 左侧通用按键（键帽胶囊）／右侧四张模式委托卡（角色色徽章 + 该模式的键位与胜负）
--               ／底部「怎么算分」标签行（四角色色做分档色标）／顶部派蒙气泡给阅读顺序
--   B 旅行手记 —— 摊开两页：左页按键、右页**分值柱状图**（100/300/500/800 柱高即分值），书脊分栏
--   C 四张委托卡 —— 四张竖卡各自带键位与规则，底部一条「人人都要会的三件事」
-- 三版共用 CFG.HELP 同一份文案与配色，切版只改一个字段。
local function buildHelpLayer()
  if not TPL_CELL then print('guide help no cell tpl') return end
  if not TPL_TEXT then TPL_TEXT = probeSettleTextbox() end
  if not TPL_TEXT then print('guide help no text tpl') return end
  destroyHelpLayer()
  local W, H = CANVAS_W or 1280, CANVAS_H or 720
  local S = CFG.HELP or {}
  -- 设计基准 1600×900，按画布等比缩放（两块画布同为 16:9 ⇒ 比例不变，文字框宽同步缩放不会裁字）
  -- v4.0 ⑤：帮助页缩放改成 **fit**（min(W/1600, H/900)）。旧实现只按宽度缩放 ⇒ 21:9 画布上
  -- 1548×848 的设计板被放大 1.31 倍变成 2032×1113，比画布还高 213px：页脚与右上角「合上手册」
  -- 整个掉到屏幕外（全控件巡检在 pc-21-9 / mobile-19.5-9 上抓到的真 bug）。
  local s = math.min(W / 1600, H / 900)
  if s <= 0 then s = 1 end
  local function u(v) return v * s end
  local function fs(v)
    local r = math.floor(v * s + 0.5)
    if r < 12 then r = 12 end
    return r
  end
  local PANEL = THEME.panel
  local CARD = C(255, 255, 255, 255)
  local GOLD, GOLDD = THEME.gold, THEME.goldDeep
  local INK, SUB = THEME.textMain, THEME.textSub
  local WHITE = C(255, 255, 255, 255)

  local function inst(name)
    local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_CELL, root) end)
    if not ok or not c then return nil end
    c.name = name
    HL[#HL + 1] = c
    return c
  end
  local enumIS = (type(Enum) == 'table' and Enum.ImageSource) or nil
  -- 图元：同一张 cell 模板换 image（100001 矩形 / 100002 圆 / 100003 三角 / 100004 四角星 / 100005 五角星 / 100006 圆环）
  local function shape(name, sp, x, y, w, h, color, rot)
    local c = inst(name)
    if not c then return nil end
    tryCall(c, 'SetSizeDelta', w, h)
    tryCall(c, 'SetAnchoredPosition', x, y)
    local img = BG_IMG[sp]
    if img then
      local done = false
      if enumIS and enumIS.StaticReference ~= nil then
        done = pcall(function() c:SetImage(enumIS.StaticReference, img) end)
      end
      if not done then pcall(function() c:SetImage('StaticReference', img) end) end
    end
    trySet(c, 'imageColor', color)
    if rot and rot ~= 0 then tryCall(c, 'SetLocalRotation', 0, 0, rot) end
    return c
  end
  local function rect(name, x, y, w, h, color)
    return shape(name, 'rect', u(x), u(y), u(w), u(h), color)
  end
  -- 圆角矩形 = 2 块矩形 + 4 个角圆（真机没有圆角矩形图元）。同色不透明 ⇒ 叠合处无接缝。
  local function rrect(tag, x, y, w, h, r, color)
    if r > h / 2 then r = h / 2 end
    if r > w / 2 then r = w / 2 end
    local ix, iy = w - 2 * r, h - 2 * r
    if ix < 1 then ix = 1 end
    if iy < 1 then iy = 1 end
    rect(tag .. 'a', x, y, ix, h, color)
    rect(tag .. 'b', x, y, w, iy, color)
    local dx, dy = w / 2 - r, h / 2 - r
    shape(tag .. 'c1', 'circle', u(x - dx), u(y - dy), u(2 * r), u(2 * r), color)
    shape(tag .. 'c2', 'circle', u(x + dx), u(y - dy), u(2 * r), u(2 * r), color)
    shape(tag .. 'c3', 'circle', u(x - dx), u(y + dy), u(2 * r), u(2 * r), color)
    shape(tag .. 'c4', 'circle', u(x + dx), u(y + dy), u(2 * r), u(2 * r), color)
  end
  -- 文字：框高按 h ≥ fontSize×1.45+4 的硬判据给（1.5+6），宽度不满足会被静默裁尾 ⇒ 调用处给足宽
  local function text(name, str, x, y, w, size, color, align)
    local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_TEXT, root) end)
    if not ok or not c then return nil end
    c.name = name
    c.text = str
    trySet(c, 'fontSize', size)
    trySet(c, 'fontColor', color)
    trySet(c, 'bgColor', C(0, 0, 0, 0))
    trySet(c, 'horizontalAlignment', align or 'Middle')
    trySet(c, 'verticalAlignment', 'Middle')
    trySet(c, 'enableOutline', true)
    trySet(c, 'outlineColor', C(205, 255, 255, 255))   -- 浅底用柔白描边；深描边会让字发脏
    tryCall(c, 'SetSizeDelta', u(w), math.floor(size * 1.5 + 6))
    tryCall(c, 'SetAnchoredPosition', u(x), u(y))
    HL[#HL + 1] = c
    return c
  end
  local function t(name, str, x, y, w, dsize, color, align)
    return text(name, str, x, y, w, fs(dsize), color, align)
  end
  -- 键帽（深墨底 + 白字）：左端从 xl 起排，返回排完后的右沿（设计单位）
  local function caps(tag, xl, y, list)
    local x = xl
    for i, cap in ipairs(list) do
      -- 键帽宽度按字数算（『空格』两字 19 号约 44px，旧实现 66 宽但文字框居中仍压边）
      local cw = (#cap >= 2) and 74 or 40
      rrect(tag .. i, x + cw / 2, y, cw, 34, 9, INK)
      text(tag .. 't' .. i, cap, x + cw / 2, y, cw - 4, fs(19), WHITE, 'Middle')
      x = x + cw + 7
    end
    return x
  end

  -- ── 版式 A：冒险家协会委托板（落地版）────────────────────────────────────────
  local function buildA()
    rect('helpBg', 0, 0, (W + 20) / s, (H + 20) / s, THEME.helpBg)
    rrect('helpFrame', 0, 0, 1548, 848, 26, GOLD)          -- 描金外框
    rrect('helpBoard', 0, 0, 1540, 840, 24, C(255, 253, 247, 236))   -- 暖奶油纸面（白卡才浮得起来）
    shape('helpStar', 'fourstar', u(-716), u(386), u(30), u(30), GOLD)
    t('helpEyebrow', S.eyebrow, -470, 396, 460, 17, GOLDD, 'Left')
    t('helpTitle', S.title, -420, 344, 560, 40, INK, 'Left')
    t('helpSub', S.sub, -420, 304, 560, 19, SUB, 'Left')
    rect('helpRule', 0, 278, 1400, 2, GOLD)
    -- v5.6（用户二轮二-1：右上角「合上手册」按钮与这行提示重叠）：提示改为**右对齐并整体左移**，
    -- 让它停在关闭胶囊的左侧，两者各占一段；行右缘留出按钮宽度（196/2+24 ≈ 122 设计单位）。
    t('helpHint', S.hint, 268, 396, 380, 17, SUB, 'Right')
    -- 派蒙气泡（描金细边 + 白底）：一句话给阅读顺序，替代原来那行灰色页脚命令
    -- v5.19（用户 2026-10-30 图2 红框）：气泡右端原本伸到 x=638，正好压在右上角
    -- 「合上手册」胶囊（x 542..738）下面 ⇒ 缩到 560 宽并左移中心到 230（右端 510），
    -- 两个元素彻底分开；字号降到 17 并在文案里去掉括号补充（见 config.HELP.paimon）。
    rrect('helpBubble', 230, 344, 560, 56, 28, GOLD)
    rrect('helpBubble2', 230, 344, 552, 48, 24, CARD)
    t('helpPaimon', S.paimon, 230, 344, 524, 17, INK, 'Middle')
    -- 左栏：通用按键
    -- 行表起点 208（键帽 34 高 ⇒ 上沿 191）；标题放 252 才不会压到第一行键帽
    t('helpKeysTitle', S.keysTitle, -550, 252, 300, 22, INK, 'Left')
    -- v5.1：键表从 7 行变 8 行（新增 Z/U/Y 技能行）⇒ 行距 56→47、起点 190→208，
    -- 否则第 8 行 (y=-202) 会压住下面的「怎么算分」标题 (y=-200)——手机画布上实测叠字。
    for i, k in ipairs(S.keys) do
      local y = 208 - (i - 1) * 47
      -- 无键帽的行（技能行）整行按一句话排：键帽只画 3 个就会顶到标签文字上（实测叠字）
      local hasCaps = (type(k.caps) == 'table') and (#k.caps > 0)
      if hasCaps then caps('helpCap' .. i .. '_', -700, y, k.caps) end
      -- ⚠ text() 的第 3 个实参是**框中心**（不是左沿）：Left 对齐时左沿 = 中心 - 宽/2。
      -- 键帽行：左沿 -560、宽 380 ⇒ 中心 -370（键帽最右 -572，留 12px）；整句行：左沿 -700、宽 900 ⇒ 中心 -250。
      if hasCaps then
        -- v5.31（用户：左边那个箭头和文字重叠了）：键帽组最右约 -572，标签左沿必须再往右
        t('helpKey' .. i, k.label, -410, y, 230, 21, INK, 'Left')
      else
        t('helpKey' .. i, k.label, -250, y, 900, 21, THEME.textMain, 'Left')
      end
    end
    -- 右侧：四张模式委托卡
    for i, m in ipairs(S.modes) do
      local cx, cy = -212 + (i - 1) * 278, 40
      rrect('helpCard' .. i, cx, cy, 252, 320, 22, m.tint)        -- 角色色浅底
      rrect('helpCardB' .. i, cx, cy, 244, 312, 19, CARD)         -- 白卡（露出 4px 色边）
      rrect('helpCardH' .. i, cx, cy + 114, 228, 70, 15, m.tint)  -- 卡头色带
      shape('helpEmblem' .. i, 'circle', u(cx - 76), u(cy + 114), u(46), u(46), m.color)
      shape('helpRing' .. i, 'ring', u(cx - 76), u(cy + 114), u(28), u(28), m.deep)
      -- 卡头数字原来是白字压在浅色 tint 上（实测 1.07~1.54:1，白字看不见）⇒ 用该模式的深色档
      t('helpCardK' .. i, m.key, cx - 76, cy + 114, 40, 21, m.deep, 'Middle')
      t('helpCardN' .. i, m.name, cx + 24, cy + 114, 150, 26, m.deep, 'Middle')
      for li, line in ipairs(m.lines) do
        t('helpCardL' .. i .. '_' .. li, line, cx, cy + 40 - (li - 1) * 44, 232, 19, SUB, 'Middle')
      end
      rrect('helpWin' .. i, cx, cy - 112, 216, 40, 20, m.tint)
      t('helpWinT' .. i, m.win, cx, cy - 112, 208, 17, m.deep, 'Middle')
    end
    -- 底部：怎么算分（四角色色做 1/2/3/4 消的档位色标）
    t('helpScoreTitle', S.scoreTitle, -550, -200, 300, 22, INK, 'Left')
    for row = 1, #S.score do
      local y = -258 - (row - 1) * 66
      for col = 1, #S.score[row] do
        local cx = -534 + (col - 1) * 356
        local bar = GOLD
        if row == 1 and S.modes[col] then bar = S.modes[col].color end
        local fill = CARD
        if row == 1 and S.modes[col] then fill = S.modes[col].tint end
        -- v5.31（用户：「下面的还是没做圆款」）：算分条改成**圆角胶囊**，与外层卡片同一语汇
        rrect('helpChip' .. row .. col, cx, y, 340, 52, 26, fill)
        t('helpChipT' .. row .. col, S.score[row][col], cx + 6, y, 312, 19, INK, 'Middle')
      end
    end
    t('helpFoot1', S.foot1, 0, -372, 1500, 18, SUB, 'Middle')
    t('helpFoot2', S.foot2, 0, -404, 1500, 17, SUB, 'Middle')
  end

  -- ── 版式 B：派蒙的旅行手记（对比稿：分值图形化，两页摊开）────────────────────
  local function buildB()
    rect('helpBg', 0, 0, (W + 20) / s, (H + 20) / s, C(255, 250, 244, 252))
    rrect('helpPageL', -370, -10, 720, 800, 20, CARD)
    rrect('helpPageR', 370, -10, 720, 800, 20, CARD)
    rect('helpSpine', 0, -10, 3, 780, GOLD)
    shape('helpDot1', 'circle', 0, u(120), u(14), u(14), GOLD)
    shape('helpDot2', 'circle', 0, u(-140), u(14), u(14), GOLD)
    t('helpTitle', '派蒙的旅行手记', 0, 410, 700, 34, INK, 'Middle')
    t('helpSub', S.hint, 0, -430, 900, 17, SUB, 'Middle')
    -- 左页：今天怎么玩
    t('helpKeysTitle', '今天怎么玩', -370, 330, 600, 26, INK, 'Middle')
    rect('helpRuleL', -370, 296, 560, 2, GOLD)
    for i, k in ipairs(S.keys) do
      local y = 240 - (i - 1) * 74
      caps('helpCap' .. i .. '_', -620, y, k.caps)
      -- 框中心 -330 宽 300 ⇒ 右沿 -180 伸进模式卡区（-338 起）造成叠字 ⇒ 收窄到 230 并贴左
      t('helpKey' .. i, k.label, -470, y, 230, 22, INK, 'Left')
    end
    -- 右页：报酬怎么算（柱高即分值）
    t('helpScoreTitle', '报酬怎么算', 370, 330, 600, 26, INK, 'Middle')
    rect('helpRuleR', 370, 296, 560, 2, GOLD)
    local base = -50                     -- 柱底
    local hs = { 100, 300, 500, 800 }
    for i, v in ipairs(hs) do
      local bx = 155 + (i - 1) * 145
      local bh = 34 + (v / 800) * 210
      local mc = S.modes[i] and S.modes[i].color or GOLD
      rect('helpBar' .. i, bx, base + bh / 2, 92, bh, mc)
      t('helpBarT' .. i, tostring(v), bx, base + bh + 26, 120, 22, S.modes[i] and S.modes[i].deep or INK, 'Middle')
    end
    rect('helpAxis', 370, base, 580, 2, THEME.bezel)
    t('helpMul', '× 等级（每 10 行 +1，上限 12）', 370, base - 34, 600, 20, INK, 'Middle')
    t('helpCmb', '连击 +50×链×等级　·　触底 0.5 秒内还能救', 370, base - 76, 600, 19, SUB, 'Middle')
    t('helpGrb', '垃圾行：2/3/4 消 → 送对方 1/2/4 行', 370, base - 114, 600, 19, SUB, 'Middle')
    t('helpWin0', '判负：新块出生位置被占满', 370, base - 152, 600, 19, SUB, 'Middle')
    -- 底部：四模式一人一句
    for i, m in ipairs(S.modes) do
      local cx = -540 + (i - 1) * 360
      shape('helpEmblem' .. i, 'circle', u(cx - 120), u(-330), u(26), u(26), m.color)
      t('helpCardN' .. i, m.name, cx - 60, -330, 140, 21, m.deep, 'Middle')
      t('helpCardL' .. i .. '_1', m.win, cx + 90, -330, 240, 18, SUB, 'Middle')
    end
  end

  -- ── 版式 C：四位旅伴的委托卡（对比稿：没有左键位栏，键位写在卡里）────────────
  local function buildC()
    rect('helpBg', 0, 0, (W + 20) / s, (H + 20) / s, THEME.helpBg)
    rrect('helpBoard', 0, 0, 1540, 840, 24, C(255, 253, 247, 236))
    t('helpTitle', '四位旅伴的委托卡', 0, 392, 900, 34, INK, 'Middle')
    t('helpSub', S.sub, 0, 350, 900, 18, SUB, 'Middle')
    for i, m in ipairs(S.modes) do
      local cx, cy = -540 + (i - 1) * 360, 70
      rrect('helpCard' .. i, cx, cy, 348, 420, 22, CARD)
      rrect('helpCardH' .. i, cx, cy + 122, 332, 156, 18, m.color)
      t('helpCardK' .. i, '[' .. m.key .. ']', cx - 118, cy + 156, 90, 22, WHITE, 'Middle')
      t('helpCardN' .. i, m.name, cx + 10, cy + 156, 220, 28, WHITE, 'Middle')
      t('helpCardW' .. i, m.win, cx, cy + 96, 300, 19, WHITE, 'Middle')
      for li, line in ipairs(m.lines) do
        t('helpCardL' .. i .. '_' .. li, line, cx, cy + 20 - (li - 1) * 52, 320, 20, INK, 'Middle')
      end
      rect('helpCardS' .. i, cx, cy - 118, 300, 2, m.tint)
      t('helpWinT' .. i, '键位：' .. m.lines[1], cx, cy - 156, 320, 17, m.deep, 'Middle')
    end
    -- 底部共用条：与四张卡无关、但每局都要用的算分规则
    rrect('helpShared', 0, -262, 1440, 168, 18, CARD)
    t('helpScoreTitle', S.scoreTitle, -600, -204, 300, 20, INK, 'Left')
    for row = 1, 2 do
      local y = -204 - row * 40
      for col = 1, 4 do
        local cx = -540 + (col - 1) * 340
        local bar = GOLD
        if row == 1 and S.modes[col] then bar = S.modes[col].color end
        rect('helpChipA' .. row .. col, cx - 158, y, 4, 32, bar)
        t('helpChipT' .. row .. col, S.score[row][col], cx + 4, y, 316, row == 1 and 18 or 17,
          row == 1 and INK or SUB, 'Middle')
      end
    end
    t('helpFoot2', S.foot2, 0, -368, 1440, 16, SUB, 'Middle')
  end

  local v = (S.variant or 'A'):upper()
  if v == 'B' then buildB() elseif v == 'C' then buildC() else buildA() end
  -- v4.0 ④：帮助页必须有**看得见、点得到**的关闭入口（用户 2026-10-29 反馈：「帮助点了之后，
  -- 移动端看不到在哪里可以点回来」）。旧实现只有一行提示「H / E 合上手册」——移动端没有 H 键。
  -- 做法：右上角一颗描金胶囊 + 光标热区（同在实例层；层序由下面的 SetAsLastSibling 统一处理）。
  -- 设计坐标 (655, 380) 在 1600×900 设计板的画板内沿右上角；A 版实测不与页眉/派蒙气泡相撞。
  UI4.regScreen('help')
  do
    local bw2, bh2 = 196, 56
    local cx2, cy2 = 640, 378
    rrect('helpClosePill', cx2, cy2, bw2, bh2, 26, GOLD)
    rrect('helpClosePill2', cx2, cy2, bw2 - 8, bh2 - 8, 22, CARD)
    text('helpCloseTx', '合上手册', cx2, cy2, bw2 - 16, fs(21), INK, 'Middle')
    local z = UI4.hit('helpCloseHit', u(bw2), u(bh2))
    if z then
      tryCall(z, 'SetAnchoredPosition', u(cx2), u(cy2))
      addCursor(z, 'CursorDown', function()
        sfx(SFX.press, true)
        print('tap help close')
        closeHelp()
      end)
      HL[#HL + 1] = z
      UI4.regAdd('help.close', z, u(bw2), u(bh2))
      UI4.dump('help')
    else
      print('help close zone=none（无 cursor 模板）')
    end
  end
  -- 层序强制：last sibling = 最上层（实测：改成 first 会把整层压到底，标题展台全透上来）。
  for i = 1, #HL do
    if HL[i] then tryCall(HL[i], 'SetAsLastSibling') end
  end
  print('guide help on n=' .. #HL .. ' v=' .. v .. ' page=help')
end
-- 关页：恢复开页前的 stage（局内=1 继续，标题页=0 继续演出）
closeHelp = function()
  if not helpOpen then return end
  helpOpen = false
  destroyHelpLayer()
  -- 标题页关页后把展台建回来（否则回标题是一片空背景）
  if guideStage == 0 then
    local okR = pcall(buildMenuCards)
    print('help stage restore ok=' .. tostring(okR))
    -- v5.6：展台是新建的（在上层）⇒ 导航键要重建才能重新浮到可见层（用户二-3）
    if UI4.navRecreate then pcall(UI4.navRecreate) end
  end
  if guideStage == 2 then guideStage = helpFromStage or 1 end
  if UI4.refreshHelpLabel then UI4.refreshHelpLabel(false) end
  print('guide help closed stage=' .. tostring(guideStage))
end
-- ===== v2.5 ① 倒计时大字（120 号屏幕正中+每秒缩放弹跳）=====
local function destroyCountBig()
  if CNT then
    pcall(function() game.DestroyClientUIControl(CNT) end)
    CNT = nil
  end
end
local function buildCountBig(txt)
  if not TPL_TEXT then TPL_TEXT = probeSettleTextbox() end
  if not TPL_TEXT then return nil end
  destroyCountBig()
  local c = game.InstantiateClientUIControl(TPL_TEXT, root)
  if c then
    c.name = 'countBig'
    c.text = txt
    c.fontSize = 120
    trySet(c, 'fontColor', THEME.textMain)
    -- v3.5 ⑪：框要装得下脉冲峰值的字号——120 + 26*sin 峰值 146 号需 215.7 高，
    -- 原来 190 ⇒ 峰值帧 textLayout.fits=false 数字整行不画（倒计时看起来「闪一下消失」）
    c:SetSizeDelta(560, 250)
    c:SetAnchoredPosition(0, 0)
  end
  return c
end

toggleHelp = function()
  if helpOpen then
    closeHelp()                          -- 关页统一走 closeHelp（'guide help closed stage=' + 'guide help off n='）
    print('help off')                    -- v2.8 ② 时停恢复锚（保留）
  else
    helpOpen = true
    -- 层序靠"创建顺序"决定，而 `SetAsLastSibling` 在本引擎是空操作（实测开页后 node 顺序
    -- helpTitle=256 < menuBig=320 ⇒ 展台永远压着手册，PC/手机都出现双层文字叠印）。
    -- 所以标题页开手册前先把展台拆掉，关页时再建回来（buildMenuCards 本身是"先拆后建"的幂等函数）。
    if guideStage == 0 then
      local okS = pcall(MS.teardown)
      local okC = pcall(destroyMenuCards)
      print('help stage hide ok=' .. tostring(okS and okC))
    end
    -- #7（真机日志：`guide help on n=326` ×4）重建开销：同一页的重复打开**复用现有层**。
    -- 判据：日志里重复打开打 `guide help reuse n=…`，只有换页/首次才打 `guide help on`。
    local samePage = (HL and #HL > 0 and (FN.helpPageShown or 1) == (helpPage or 1))
    if samePage then
      print('guide help reuse n=' .. #HL)
    else
      buildHelpLayer()
      FN.helpPageShown = helpPage or 1
    end
    if UI4.refreshHelpLabel then UI4.refreshHelpLabel(true) end
    if guideStage == 1 and not g.gameOver then print('help pause') end   -- v2.8 ② 局内时停锚
  end
end

destroyMenuCards = function()
  local n = 0
  for i = 1, #MC do
    local ok = pcall(function() game.DestroyClientUIControl(MC[i]) end)
    if ok then n = n + 1 end
  end
  MC = {}
  if n > 0 then print('menu cards destroy n=' .. n) end
  -- v2.4 ①：这里**只销卡片**。展台（墙/框/标题/提示条）要留到进局那一刻才拆
  -- （MS.teardown）——否则 0.5s 的模式名动画窗会露出生裸棋盘，闪一下。
end
-- ===== v2.4 ① 标题页「展台」（menu stage）==========================================
-- 视觉验收第一轮读数（docs/v23-title.png 复看）：
--   ① 17 张卡片浮在模拟器天空蓝背景上，没有任何「舞台」⇒ 标题页没有边界感；
--   ② 中央棋盘的青色边框是画面最响的元素，左上 hold 槽 / 右上 next 预览 / 左栏 HUD 散在外圈；
--   ③ 副标题 'DEEP SPACE NEON' 居中落在棋盘投影区 x∈[-165,165] 里，像一行错位水印。
-- 做法：一套**随卡片同时建/销**的展台零件（与 MC 分开——日志锚 menu cards n=17 只数卡片）：
--   ▸ 深空墙 4 块：把棋盘视窗以外的整屏压成深底 ⇒ HUD/预览/hold 槽自动退场
--     （层序铁律：运行时实例后建的在上面，服务端 textbox 永远在实例层之下——2026-10-24 踩过）；
--   ▸ 视窗边框 4 条 + 四角括号 8 条：中央棋盘变成一块「屏幕」，不再是散落的网格；
--   ▸ 标题 44/52 号大字（实例版）：topBanner 的 fontColor A 置 0 让位（真机唯一验过的通道是 A）；
--   ▸ 底部分段提示条：3 段 + 2 点 + 2 侧箭头，逐段高亮轮播 + 呼吸（用户 2026-10-27 令）。
-- 只占 1 个 chunk local（MS 表，空表与配色在文件头部声明区）——main chunk 贴着 200 local
-- 硬上限，零件全挂字段。
MS.addCell = function(name, x, y, w, h, color)
  if not TPL_CELL then return nil end
  local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_CELL, root) end)
  if not ok or not c then return nil end
  c.name = name
  tryCall(c, 'SetSizeDelta', w, h)
  tryCall(c, 'SetAnchoredPosition', x, y)
  c.imageColor = color
  MS.parts[#MS.parts + 1] = c
  return c
end
MS.addText = function(name, text, x, y, w, h, size, color, align)
  if not TPL_TEXT then TPL_TEXT = probeSettleTextbox() end
  if not TPL_TEXT then return nil end
  local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_TEXT, root) end)
  if not ok or not c then return nil end
  c.name = name
  c.text = text
  trySet(c, 'fontSize', size)
  trySet(c, 'fontColor', color)
  trySet(c, 'bgColor', C(0, 0, 0, 0))
  trySet(c, 'horizontalAlignment', align or 'Middle')
  trySet(c, 'verticalAlignment', 'Middle')
  trySet(c, 'enableOutline', true)
  trySet(c, 'outlineColor', C(200, 255, 255, 255))   -- v3.0 浅底：浅色描边=柔光，深色描边像脏边
  -- ⚠ 引擎排版硬规则（studio/play/text-layout.js）：requiredHeight = 行高(fontSize×1.2)
  --   + blockInset(fontSize×0.25+4)；**requiredHeight > 框高 ⇒ fits=false ⇒ 整条文字一个字都不画**
  --   （不是裁切，是消失）。2026-10-30 实测：「说明」胶囊 120×34 装 22 号字（需 35.9）⇒ 空胶囊。
  --   这里统一兜底，调用方给的框高太小就抬到够用。
  h = math.max(h or 0, math.floor((size or 20) * 1.45 + 6))
  tryCall(c, 'SetSizeDelta', w, h)
  tryCall(c, 'SetAnchoredPosition', x, y)
  MS.parts[#MS.parts + 1] = c
  return c
end
-- 卡片顶部发丝线（模式色 2px）：给扁平的卡底一个「刀线」，是街机菜单的常见语汇
MS.hairline = function(i, cx, cy, color)
  local a = 150
  local w = 344
  local r, gg, b = (color // 65536) % 256, (color // 256) % 256, color % 256
  local c = MS.addCell('menuHair' .. i, cx, cy + 54, w, 2, C(a, r, gg, b))
  if c then
    MS.hair = MS.hair or {}
    MS.hair[i] = { ctl = c, r = r, g = gg, b = b }
  end
end
-- v3.0 预混色：把半透明色「盖在底面上」算成不透明色。
-- 为什么必须：胶囊/云/花瓣都是多件图元互相重叠拼出来的，半透明叠加会在交界处叠两次 → 看得见接缝。
MS.over = function(base, c, k)
  local br, bg_, bb = (base // 65536) % 256, (base // 256) % 256, base % 256
  local r, g, b = (c // 65536) % 256, (c // 256) % 256, c % 256
  return C(255, math.floor(br + (r - br) * k + 0.5),
    math.floor(bg_ + (g - bg_) * k + 0.5), math.floor(bb + (b - bb) * k + 0.5))
end
-- v3.0 图元形状：与背景池同一套 spec 字段（s/x/y/w/h/c/rot），标题页装饰与胶囊都用它
MS.addShape = function(name, spec)
  if not spec then return nil end
  local c = MS.addCell(name, spec.x, spec.y, spec.w, spec.h, spec.c)
  if not c then return nil end
  if spec.rot and spec.rot ~= 0 then pcall(function() c:SetLocalRotation(0, 0, spec.rot) end) end
  local img = BG_IMG[spec.s or 'rect'] or BG_IMG.rect
  local enumT = (type(Enum) == 'table' and Enum.ImageSource) or nil
  local ok = false
  if enumT and enumT.StaticReference ~= nil then
    ok = pcall(function() c:SetImage(enumT.StaticReference, img) end)
  end
  if not ok then pcall(function() c:SetImage('StaticReference', img) end) end
  return c
end
-- 胶囊零件（圆角面板）：中段矩形 + 左右两个半圆。返回三块坐标，便于整体位移/换色。
MS.pillParts = function(name, x, y, w, h, fill)
  local body = math.max(2, w - h)
  return {
    { ctl = MS.addShape(name .. 'B', { s = 'rect', x = x, y = y, w = body, h = h, c = fill }), x = x, y = y },
    { ctl = MS.addShape(name .. 'L', { s = 'circle', x = x - body / 2, y = y, w = h, h = h, c = fill }), x = x - body / 2, y = y },
    { ctl = MS.addShape(name .. 'R', { s = 'circle', x = x + body / 2, y = y, w = h, h = h, c = fill }), x = x + body / 2, y = y },
  }
end
-- 胶囊（圆角面板）：矩形 + 两端半圆 = 圆润可爱的主体语汇（真机没有圆角矩形图元）
MS.addPill = function(name, x, y, w, h, fill)
  local body = math.max(2, w - h)
  MS.addShape(name .. 'B', { s = 'rect', x = x, y = y, w = body, h = h, c = fill })
  MS.addShape(name .. 'L', { s = 'circle', x = x - body / 2, y = y, w = h, h = h, c = fill })
  MS.addShape(name .. 'R', { s = 'circle', x = x + body / 2, y = y, w = h, h = h, c = fill })
end
MS.destroy = function()
  for i = #MS.parts, 1, -1 do
    if MS.parts[i] then pcall(function() game.DestroyClientUIControl(MS.parts[i]) end) end
    MS.parts[i] = nil
  end
  for i = 1, 3 do MS.hint[i] = nil MS.hintKey[i] = -1 end
  for i = 1, 2 do MS.arrow[i] = nil MS.arrowKey[i] = -1 end
  MS.big, MS.focus, MS.hair = nil, false, nil
end
MS.build = function()
  if not TPL_CELL then return false end
  MS.destroy()
  local W, H = CANVAS_W or 1280, CANVAS_H or 720
  local halfW, halfH = W / 2, H / 2
  -- 棋盘视窗：正好收到棋盘框外沿（frame 在 ±150 / ±300，背板 306×606）。
  local winHalf, winTop, winBot = 151, 301, -301
  local sideW, sideH = halfW - winHalf, winTop - winBot
  local sideCY = (winTop + winBot) / 2
  -- ① 天空墙：左右上下四块，只留视窗（+8 遮住画布边缘的抗锯齿缝）
  MS.addCell('menuWallL', -(winHalf + sideW / 2), sideCY, sideW, sideH, MS.WALL)
  MS.addCell('menuWallR', winHalf + sideW / 2, sideCY, sideW, sideH, MS.WALL)
  MS.addCell('menuWallT', 0, (halfH + winTop) / 2, W + 8, halfH - winTop + 1, MS.WALL)
  MS.addCell('menuWallB', 0, (winBot - halfH) / 2, W + 8, halfH + winBot + 1, MS.WALL)
  -- 顶部/底部云带（比墙深一档的极淡色，给平铺的墙一点空气感）
  MS.addCell('menuSkyT', 0, halfH - 24, W + 8, 48, THEME.wallAlt)
  MS.addCell('menuSkyB', 0, -halfH + 20, W + 8, 40, THEME.wallAlt)
  -- ② 装饰：云 / 星芒 / 花瓣（配色与构图在 config.lua 的 THEME.deco；与背景池同一套 spec）
  local deco = THEME.deco or {}
  for i = 1, #deco do MS.addShape('menuDeco' .. i, deco[i]) end
  -- ③ 视窗内阴影（极淡深蓝，让窗口像一块嵌进天空的屏）+ 描金细边 + 四角括号
  MS.addCell('menuShadeT', 0, winTop - 10, 2 * winHalf + 30, 20, THEME.shadow)
  MS.addCell('menuShadeB', 0, winBot + 10, 2 * winHalf + 30, 20, THEME.shadow)
  MS.addCell('menuShadeL', -winHalf - 10, sideCY, 20, sideH + 8, THEME.shadow)
  MS.addCell('menuShadeR', winHalf + 10, sideCY, 20, sideH + 8, THEME.shadow)
  MS.addCell('menuBezelT', 0, winTop, 2 * winHalf + 8, 3, MS.BEZEL)
  MS.addCell('menuBezelB', 0, winBot, 2 * winHalf + 8, 3, MS.BEZEL)
  MS.addCell('menuBezelL', -winHalf, sideCY, 3, sideH + 8, MS.BEZEL)
  MS.addCell('menuBezelR', winHalf, sideCY, 3, sideH + 8, MS.BEZEL)
  local AR, AT = 44, 3
  for _, sx in ipairs({ -1, 1 }) do
    for _, sy in ipairs({ -1, 1 }) do
      local tag = (sx > 0 and 'R' or 'L') .. (sy > 0 and 'T' or 'B')
      MS.addCell('menuTickH' .. tag, sx * (halfW - AR / 2 - 12), sy * (halfH - 12), AR, AT, MS.TICK)
      MS.addCell('menuTickV' .. tag, sx * (halfW - 12), sy * (halfH - AR / 2 - 12), AT, AR, MS.TICK)
    end
  end
  -- ④ 标题横幅：奶油胶囊 + 一条描金细线 + 深金大字（叠在视窗上沿 = 有意为之的缎带）
  local titleSize = (halfH > 400) and 52 or 44
  local titleY = math.min(winTop + (halfH - winTop) * 0.5 + 2, halfH - 48)
  local bannerH = titleSize + 20
  MS.addPill('menuBanner', 0, titleY, 580, bannerH, MS.over(MS.WALL, THEME.gold, 0.34))
  -- v5.11（用户：「这个质量能交付吗」）：去掉上下两条横贯金线 —— 它们比文字宽、又贴在胶囊边上，
  -- 读起来像一条误入的边框线。标题只留胶囊本身。
  MS.addCell('menuBannerRule', 0, titleY - bannerH / 2 + 6, 150, 3, THEME.goldDeep)
  -- 框高硬判据 h >= fontSize*1.45+4（52 号要 79.4；旧写法 +26 在 PC 画布上少 1.4px ⇒ 整行不画）
  MS.big = MS.addText('menuBig', '俄罗斯方块', 0, titleY, 660, math.floor(titleSize * 1.45 + 12), titleSize, THEME.goldDeep)
  trySet(topBanner, 'fontColor', C(0, 255, 194, 76))
  trySet(botBanner, 'fontColor', C(0, 118, 214, 255))
  -- ⑤ 底部分段提示条（3 段 + 2 分隔点）
  -- v3.5 ⑤：lineY 之前锚在 winBot（棋盘视窗底 -301）⇒ 1600×900 上提示条浮在云带上方 79px 处
  -- （1280×720 恰好落进云带里，所以小画布看不出问题）。改成锚画布底：云带 = -halfH..-halfH+40，
  -- 提示条中心落在带内（1600：ypx 872 / 1280：ypx 692），两块画布都居中在带里。
  local lineY = -(halfH - 28)
  MS.lineY = lineY
  -- v5.4 修 A6（4/5 份评审：「手机画布上仍是键盘话术」）：提示条按宿主分两套。
  -- 触屏没有 1-4 / H 键，手机端只写玩家真能做的两个动作：点卡片选模式、点右上角两个按钮。
  -- v5.8（用户 2026-10-30：「新加的最下面两个就是废话，还原为之前的版本」）：
  -- 底部提示条恢复三段键盘话术，两端一致；手机端也不再单独换文案。
  local segs = { { MS.hintText[1], -290, 215, 26 }, { MS.hintText[2], 0, 250, 26 }, { MS.hintText[3], 290, 215, 26 } }
  for i = 1, #segs do
    -- v5.7：底部操作提示用**墨色**（原来 textSub 在奶油底上几乎看不见，用户截图里像被裁掉的灰字）
    MS.hint[i] = MS.addText('menuHint' .. i, segs[i][1], segs[i][2], lineY, segs[i][3], 50, segs[i][4], THEME.textMain)
  end
  MS.segX = { -290, 0, 290 }
  -- v5.13：标题页右下角打**版本水印** —— 以后"你看到的是哪一版"不用再靠猜/靠日志。
  -- 用户 2026-10-30：「我刚刚去模拟器网页核验了，还是不行」——三次争议都源于没法一眼分辨新旧包。
  MS.addText('menuBuildTag', BUILD_TAG, (CANVAS_W or 1280) / 2 - 120, -((CANVAS_H or 720) / 2 - 16),
    220, 22, 13, THEME.textSub)
  MS.addCell('menuDot1', -148, lineY, 6, 6, THEME.gold)
  MS.addCell('menuDot2', 148, lineY, 6, 6, THEME.gold)
  -- ===== v5.13 控件组件工厂（用户 2026-10-30：「按钮就该是组件，10 秒一个、可定制」）=====
  -- 六件套：胶囊形状 / 文字高度 / 键帽 / cursor 热区(y 取负) / **UI4.regAdd 命中注册** / 三态+音效。
  -- 历史事故：入口卡漏了 regAdd ⇒ 画得漂亮但指针完全够不到（无悬停音、无高亮、点击死）。
  if not CTL then
    local m = loadModule('controls')
    CTL = (m and m.new) and m.new({
      trySet = trySet, tryCall = tryCall, addCursor = addCursor, sfx = sfx, SFX = SFX,
      addShape = function(n, sp) return MS.addShape(n, sp) end,
      addText = function(n, txt, x, y, w, h, fs, col, al) return MS.addText(n, txt, x, y, w, h, fs, col, al) end,
      addHit = function(n, w, h)
        local ok, z = pcall(function() return game.InstantiateClientUIControl(TPL_HIT, root) end)
        if not ok or not z then return nil end
        z.name = n
        tryCall(z, 'SetSizeDelta', w, h)
        return z
      end,
      onPart = function(c) MS.parts[#MS.parts + 1] = c end,
      regAdd = function(n, c, w, h) UI4.regAdd(n, c, w, h) end,
      regScreen = function(n) UI4.regScreen(n) end,
      wall = MS.WALL, gold = THEME.gold, goldDeep = THEME.goldDeep,
      cyan = MS.CYAN, cyanDeep = THEME.cyanDeep, ink = THEME.textMain, subInk = THEME.textSub,
      over = function(base, c, k) return MS.over(base, c, k) end,
    scale = function() return math.min((CANVAS_W or 1600) / 1600, (CANVAS_H or 900) / 900) end,
      print = print,
    }) or nil
    if not CTL then print('controls module FAIL（按钮回退到手写实现）') end
  end
  -- v5.4 修用户 2026-10-30 反馈 一-1「开局没有看到角色相关的模块图标设计」：
  -- 标题页右上角补一张**角色档案入口卡**（四角色色点 + I 键 + 可点热区）。
  -- 走展台实例层（MS.parts）⇒ 进局 MS.teardown 一起拆；热区与 I 键同一入口。
  do
    -- 位置随画布收敛：右侧留 24px 边距；手机端下移 80px，给右上角的「说明/角色」按钮让位
    -- （按钮中心在 top-18-28，卡片顶边必须落在它下面，否则两处控件叠在一起）。
    local CW, CH = CANVAS_W or 1280, CANVAS_H or 720
    local ex = math.min(520, CW / 2 - 169)
    local ey = IS_MOBILE and (CH / 2 - 138) or 302
    -- v5.10（用户：「角色和帮助不还是没有圆角吗」）：两张入口卡改成**同款胶囊**（三块圆角），
    -- 与四张模式卡同一套视觉语汇；去掉了那条横贯的金线（直角面板才需要它）。
    -- ===== v5.13：两张入口卡改由**组件工厂**生成（原来是手写四遍里的第三遍）=====
    -- 一个按钮 = CTL.btn{...}：胶囊形状 / 文字高度 / 键帽 / 热区(y 取负) / regAdd 命中注册 / 三态+音效
    -- 全部内置。新增同类按钮只需改 spec 里的七八个字段（下面两张卡各占 5 行）。
    local rosterBtn = CTL and CTL.btn({
      id = 'menu.entryRoster', screen = 'menu', x = ex, y = ey, w = 290, h = 96,
      label = '角色档案', sub = IS_MOBILE and '点我看契约与技能' or 'I 键 · 契约与技能',
      -- 不再画键帽：左侧要放四色点，键帽会和色点/标题挤在一起（用户截图那处溢出）；
      -- 按键信息由副标文字承担（PC），手机上副标只说「点我看…」。
      preset = 'gold', fs = 22, pad = 86, padSub = 16, titleDy = 18,
      -- 诊断锚：入口卡的三态/点击各打一行日志 —— 用户实测"没反应"时可直接从日志区分
      -- 「指针根本没到」「到了但视觉没变」「点了但回调没跑」三种情况。
      onEnter = function() print('entry hover roster') end,
      onClick = function() print('entry click roster') keyConsumedFrame = frameSeq FN.rosterToggle() end,
    })
    -- 四色点：装饰件（按钮组件不管内容插画，调用方自己叠）
    local dots = { { 127, 207, 106 }, { 177, 140, 255 }, { 143, 218, 240 }, { 88, 208, 196 } }
    for i = 1, #dots do
      local d = dots[i]
      MS.addCell('menuEntryDot' .. i, ex - 136 + (i - 1) * 22, ey + 16, 14, 14, C(255, d[1], d[2], d[3]))
    end
    local hx = ex - 240
    MS.entryHelpX = hx
    local helpBtn = CTL and CTL.btn({
      id = 'menu.entryHelp', screen = 'menu', x = hx, y = ey, w = 176, h = 78,
      label = '说明', sub = IS_MOBILE and '点我看规则' or 'H 键 · 全部规则',
      preset = 'gold', fs = 20, subFs = 12, titleDy = 18, subDy = 20,
      onEnter = function() print('entry hover help') end,
      onClick = function()
        keyConsumedFrame = frameSeq
        print('menu help card tap')
        if helpOpen then closeHelp() else toggleHelp() end
      end,
    })
    -- 兼容旧引用（别处只用到这两个字段做摆位/校验）
    MS.rosterZone = rosterBtn and rosterBtn.zone or nil
    MS.helpZone2 = helpBtn and helpBtn.zone or nil
    MS.entryHover = function(which, st)
      local b = (which == 'roster') and rosterBtn or helpBtn
      if b then b.style(st) end
    end
    print('menu entries via CTL ok=' .. tostring(rosterBtn ~= nil) .. '/' .. tostring(helpBtn ~= nil))
  end
  -- v3.2 原神文案：标题屏「旅行者手记」轮播位。
  -- 为什么走实例文字：服务端 textbox 被展台墙（menuWall*）压在下面，标题页文案只能靠实例；
  -- 为什么放 (x=-420, y=-215)：左列两张模式卡（y=±104，卡高 110）与底部提示条（y=-331）之间
  -- 是两块画布（1280×720 / 1600×900）都空着的唯一横带，且与左列卡片同列、宽度装得下一行 18 号字。
  -- 动效在 MS.tick 里（淡入 0.5s → 停 5s → 淡出 0.6s，颜色走 fontColor 的 A 通道=真机已验证通道）。
  MS.note = MS.addText('menuNote', '', -420, -215, 380, 40, 18, THEME.textSub)
  MS.stageOn = true
  print('menu stage n=' .. #MS.parts)
  return true
end
-- 模式名大字独占画面时（pendingMode 动画窗 0.5s）：展台标题变成模式名，其余零件让位。
-- 为什么不用 topBanner：深空墙压在服务端 textbox 之上（层序铁律），只能让实例版大字来演。
MS.focusLock = function(idx, mname)
  if MS.focus then return end
  MS.focus = true
  local info = MODE_INFO[idx] or MODE_INFO[1]
  if MS.big then
    MS.big.text = MODE_TITLE[mname] or mname or '俄罗斯方块'
    trySet(MS.big, 'fontColor', info.colorDeep)   -- v3.0 浅底：模式大字用深色档
    tryCall(MS.big, 'SetSizeDelta', 720, 100)      -- 64 号要 >=96.8
    tryCall(MS.big, 'SetAnchoredPosition', 0, 0)   -- 屏幕正中（顶部条带放不下 64 号墨迹）
    trySet(MS.big, 'fontSize', 26)
    MS.pendingSize = 26
  end
  if MS.hair then                                  -- 卡片没了，发丝线也别留在空中
    for i = 1, #MS.hair do
      local h = MS.hair[i]
      if h then h.ctl.imageColor = C(0, h.r, h.g, h.b) end
    end
  end
  for i = 1, 3 do
    if MS.hint[i] then
      trySet(MS.hint[i], 'fontColor', C(0, 214, 232, 246))
      trySet(MS.hint[i], 'outlineColor', C(0, 0, 0, 0))   -- 否则描边还留一圈暗字影
    end
  end
  for i = 1, 2 do
    if MS.arrow[i] then MS.arrow[i].imageColor = C(0, 118, 214, 255) end
  end
end
-- 展台退场（进局那一刻）：拆零件 + 把服务端两条横幅的颜色还给游戏（A 通道是真机通道）
-- ===== 展台（标题页那套墙/框/卡片/提示条）的存在条件——**全工程唯一判据** =====
-- 为什么要有这条：引擎层序 = 创建顺序，且 SetAsLastSibling 不可靠 ⇒
--   「浮层开在展台之后建」才盖得住；任何一条路径在浮层打开后又重建了展台
--   （关帮助、画布变化、U.sync 触发重建…），展台就会压回浮层上面。
--   用户 2026-10-30 连报三轮「角色页/说明层被首页卡片压住」就是这一类。
-- 对策不是到处补 teardown，而是**让展台的存在由状态推导**：每帧比对一次，
--   该在就建、不该在就拆。所有入口（键盘/鼠标/手机/倒计时）自动一致。
FN.stageWanted = function()
  if guideStage ~= 0 then return false end          -- 非标题页：展台从不该在
  if helpOpen then return false end                 -- 说明层
  if ROSTER and ROSTER.on then return false end     -- 角色页
  if UI4 and UI4.noteOn then return false end       -- 手机双人提示浮层
  if MODE_OVER then return false end                -- 结算
  return true
end
FN.syncStage = function()
  -- 安全网：角色页只允许在标题页存在。局内（guideStage≠0）若它还在，说明被某条路径
  -- 漏关 —— 强制关掉，否则会出现「棋盘之上飘着一张角色页文字」的混合态（用户 2026-10-30 图一）。
  -- 判据用**屏幕**而不是 guideStage（标题页 guideStage 也可能是 1，实测会误关）：
  -- 只有真的进了对局屏（UI4.screen=='game'）却还挂着角色页，才是混合态。
  if ROSTER and ROSTER.on and UI4 and UI4.screen == 'game' and FN.rosterToggle then
    pcall(FN.rosterToggle)
    print('roster force close (screen=game)')
  end
  local want = FN.stageWanted()
  local has = (MS and MS.stageOn) and true or false
  if want and not has then
    if buildMenuCards then pcall(buildMenuCards) end
  elseif (not want) and has then
    if MS.teardown then pcall(MS.teardown) end
  end
  -- 服务端 textbox 永远在运行时实例层之下 ⇒ 浮层盖不住它们，只能清文字。
  -- 判据同上（标题页且浮层开）：开→清空 9 个文字位，关→由 buildMenuCards/renderHud 重写。
  -- 注意：角色页/帮助页打开时 guideStage 会被改成 2（时停），所以判据只看「展台该不该在」，
  -- 不能再要求 guideStage==0 —— 那一条正是「清了但底部还在」的根因（实测 hide 恒 false）。
  -- 🔴 v5.36 修回归：原来写 `hide = not want`，而 want 在**对局中恒为 false**（guideStage≠0）
  -- ⇒ 局内也把文字层清空，HUD/得分/旁白全消失（用户：图片渲染失败了）。
  -- 正确判据＝**只是浮层打开时**才藏文字层，对局中一律照常显示。
  local overlayNow = (helpOpen or (ROSTER and ROSTER.on) or (UI4 and UI4.noteOn) or MODE_OVER) and true or false
  local hide = overlayNow
  if hide ~= FN.textLayerHidden then print('textlayer hidden=' .. tostring(hide) .. ' guide=' .. tostring(guideStage)) end
  FN.textLayerHidden = hide and true or false
  if hide then
    -- 每轮都清（不是只在翻转时）：标题页常驻提示是**每帧重写**的（showPersistTip/renderHud），
    -- 清一次会被下一帧写回来 —— 这是「清了但还在」的原因。
    for i = 1, 9 do
      local c = ({ topBanner, botBanner, hint, hud, best, hudNext, keyA, keyB, keyC })[i]
      if c then setText(c, '') end
    end
    if HUD_INST then
      -- 实例份直接写 .text（setTextRaw 走的是服务端 textbox 的通道，对实例不生效）；
      -- 实测残留在底部那行就是实例 ibotBanner。
      for _, k in ipairs({ 'hint', 'botBanner', 'topBanner', 'hud', 'best', 'hudNext', 'keyA', 'keyB', 'keyC' }) do
        local c = HUD_INST[k]
        if c then pcall(function() c.text = '' end) end
      end
    end
  elseif FN.textLayerWasHidden then
    if guideStage == 0 and buildMenuCards then pcall(buildMenuCards) end
    if renderHud then pcall(renderHud) end
  end
  FN.textLayerWasHidden = hide and true or false
  -- 手机按键同源收口：浮层开 ⇒ 整排按键收走（否则压着角色页/说明页）
  -- ⚠ 判据必须表达它自己那件事：`want`（展台该不该在）只对标题页有意义，
  -- 用它当"有没有浮层"会在**局内**恒为 true ⇒ 一开一关角色页后按键永远收着（本轮实测）。
  local overlayOn = (helpOpen or (ROSTER and ROSTER.on) or (UI4 and UI4.noteOn) or MODE_OVER)
    and true or false
  -- 预览/暂存槽（12 颗格子在棋盘外左/右栏）：浮层期间也收走，否则角色页左侧会露出
  -- 一块紫色小方块与一条深色竖条（用户 2026-10-30 截图里那两个残留点）。
  if overlayOn ~= FN.prevParkedNow then
    FN.prevParkedNow = overlayOn
    if g and g.preview then
      for i = 1, #g.preview do
        local c = g.preview[i]
        if c then
          if overlayOn then
            pcall(function() c:SetAnchoredPosition(0, -4000) end)
          elseif renderNext then
            pcall(renderNext)
          end
        end
      end
    end
  end
  -- 每 6 帧兜底：结算键不属于局内/标题，一律收起（它们与手机按键位置重叠，会冒充成棕色按键）
  if UI4 and UI4.parkActs and guideStage ~= 0 then pcall(UI4.parkActs) end
  if UI4 and UI4.padVisible and overlayOn ~= FN.padHiddenNow then
    FN.padHiddenNow = overlayOn
    pcall(UI4.padVisible, not overlayOn)
    -- 关浮层回局内：让 ui.lua 用**当前屏**的 plan 完整重摆一次（标签/几何/三态一起回来）。
    -- 只还原坐标是不够的——浮层那次 plan 已经把按键文字清空过（本轮实测的残留）。
    -- 关浮层回局内：用 **game 屏**的 plan 完整重摆（标签/几何/三态一起回来）。
    -- 只调 layout 不够——U.screen 可能还停在 help/roster，那套 plan 没有 pad 标签，
    -- 一摆就把按键文字清空（用户实测：进局正常、点一次就全空）。
    if not overlayOn and guideStage ~= 0 and UI4.apply then
      pcall(UI4.apply, 'game', (G[2] and true or false), MODE, guideStage)
    end
  end
end
MS.teardown = function()
  MS.stageOn = false
  if #MS.parts == 0 then return end
  MS.destroy()
  trySet(topBanner, 'fontColor', C_GOLD2)
  trySet(botBanner, 'fontColor', C_ACCENT2)
end
-- 底栏动效：4 阶段循环（0/1/2=高亮对应段，3=整条亮一口），段内 alpha 呼吸，箭头呼吸+外扩。
-- 只在值真的变化时写控件（和 introFont/introPulse 同一套防抖思路，省每帧写）。
MS.tick = function()
  -- v2.6 ③：轮播/下划线/箭头全撤（用户否决）——回退整条单一呼吸（26↔28 号+亮度呼吸）。
  if #MS.parts == 0 or MS.focus then return end
  local t = introT
  local breathe = 0.5 + 0.5 * math.sin(t * 2.2)
  local size = 26 + math.floor(2 * breathe + 0.5)
  -- v5.7：alpha 下限 150→190、颜色改成墨色 —— 用户截图里这条提示像"被裁掉的灰字"
  local alpha = math.floor(190 + 60 * breathe)
  local k = size * 1000 + alpha
  if MS.hintKey[1] ~= k then
    MS.hintKey[1] = k
    for i = 1, 3 do
      local ctl = MS.hint[i]
      if ctl then
        trySet(ctl, 'fontSize', size)
        trySet(ctl, 'fontColor', C(alpha, 46, 58, 74))
      end
    end
  end
  -- v3.2 原神文案：旅行者手记轮播（6 条，每条 6.1s：入 0.5s → 停 5s → 出 0.6s）。
  -- 每条自带主色（金/墨/草绿/雷紫/冰蓝/樱粉）；透明度只走 fontColor 的 A 通道 + 上浮 2px，
  -- 与底部提示条的呼吸同一套防抖：key 不变就不写控件（每帧只做两次整除）。
  local notes = CFG.COPY and CFG.COPY.title
  if notes and notes[1] and MS.note then
    local span = 6.1
    local n = #notes
    local idx = math.floor(t / span) % n + 1
    local ph = t - math.floor(t / span) * span
    local a = 255
    if ph < 0.5 then a = math.floor(255 * ph / 0.5)
    elseif ph > 5.5 then a = math.floor(255 * (span - ph) / 0.6) end
    if a < 0 then a = 0 elseif a > 255 then a = 255 end
    local key = idx * 1000 + a
    if MS.noteKey ~= key then
      MS.noteKey = key
      local rec = notes[idx]
      local cc = rec.color or THEME.textSub
      trySet(MS.note, 'fontColor', C(a, (cc // 65536) % 256, (cc // 256) % 256, cc % 256))
      tryCall(MS.note, 'SetAnchoredPosition', -420, -215 + math.floor((255 - a) / 128))
      pcall(function() MS.note.text = rec.text end)
    end
  end
end

-- ===== v2.5 ① 标题页四模式选择（重设计）=============================================
-- 用户否掉 v2.4 的四张深蓝卡片（原话「那四个款太丑了，我不喜欢那个风格」）⇒ 整块重做。
-- 用户偏好线索（任务书）：偏克制/大字/不花哨；喜欢「字体放大脉冲」胜过复杂动效。
-- 定稿 = A（主机列表）：无容器、无边框、无底色 —— 每项 = 左缘 5×44 模式色细柱 + 38 号模式名
-- （左对齐）+ 15 号特色句；选中项「整行高亮 + 字放大到 44」，其余三项淡出，屏幕正中再演模式名大字。
-- 另两版留在代码里可切（各自有出图 docs/v25-b.png / docs/v25-c.png，仅作对照，不进交付）：
--   B 形状图标：三格色块拼俄罗斯方块母题 + 模式名，未选中/选中都没容器
--   C 整行高亮条：模式色 12% 暗条 + 左对齐字（最接近被否的卡片形态，仅作比对基线）
local MENU_STYLE = 'A'
local MC_ROW = { { -420, 104 }, { -420, -104 }, { 420, 104 }, { 420, -104 } }
local MC_ICON = {                      -- B 用：三格朝向 L / T / S
  { { 0, 11 }, { 0, -11 }, { 22, -11 } },
  { { 0, 11 }, { -11, -11 }, { 11, -11 } },
  { { -11, 11 }, { 11, 11 }, { -11, -11 } },
}
local function mcCell(name, x, y, w, h, color)
  local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_CELL, root) end)
  if not ok or not c then return nil end
  c.name = name
  c:SetSizeDelta(w, h)
  c:SetAnchoredPosition(x, y)
  c.imageColor = color
  MC[#MC + 1] = c
  return c
end
local function mcText(name, text, x, y, w, h, size, color, align)
  local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_TEXT, root) end)
  if not ok or not c then return nil end
  c.name = name
  c.text = text
  trySet(c, 'fontSize', size)
  trySet(c, 'fontColor', color)
  trySet(c, 'bgColor', C(0, 0, 0, 0))
  trySet(c, 'horizontalAlignment', align or 'Middle')
  trySet(c, 'verticalAlignment', 'Middle')
  trySet(c, 'enableOutline', true)
  trySet(c, 'outlineColor', C(190, 255, 255, 255))   -- v3.0 浅底：浅色描边
  c:SetSizeDelta(w, h)
  c:SetAnchoredPosition(x, y)
  MC[#MC + 1] = c
  return c
end
local function mcRGB(color, a)
  return C(a or 255, (color // 65536) % 256, (color // 256) % 256, color % 256)
end
MS.modes = function()
  MS.sel = {}
  if MENU_STYLE == 'A' then
    for i, info in ipairs(MODE_INFO) do
      local cx, cy = MC_ROW[i][1], MC_ROW[i][2]
      local leftX = cx + 30                      -- 列内统一左缘（不贴画布边）
      -- v3.0：胶囊卡（圆润）+ 元素宝珠（圆点）+ 星芒（右上），字压在卡上（先建底、后建字）
      -- v5.9：胶囊拆成三块并**逐块记坐标**（旧写法 addPill 没有返回值 ⇒ sel.pill 恒 nil ⇒
      -- 卡面颜色从不跟三态变，用户看到的"没有三种样式"就是这个）。三块一起动才不会散架。
      local pw, ph = 400, 100
      local pbody = math.max(2, pw - ph)
      local pillFill = MS.over(MS.WALL, info.color, 0.17)
      local pillParts = {
        { ctl = MS.addShape('menuPillB' .. i, { s = 'rect', x = cx + 10, y = cy, w = pbody, h = ph, c = pillFill }), x = cx + 10, y = cy },
        { ctl = MS.addShape('menuPillL' .. i, { s = 'circle', x = cx + 10 - pbody / 2, y = cy, w = ph, h = ph, c = pillFill }), x = cx + 10 - pbody / 2, y = cy },
        { ctl = MS.addShape('menuPillR' .. i, { s = 'circle', x = cx + 10 + pbody / 2, y = cy, w = ph, h = ph, c = pillFill }), x = cx + 10 + pbody / 2, y = cy },
      }
      local bead = MS.addShape('menuBead' .. i, { s = 'circle', x = cx - 160, y = cy, w = 22, h = 22, c = info.colorDeep })
      local star = MS.addShape('menuStar' .. i, { s = 'fourstar', x = cx + 178, y = cy, w = 26, h = 26, c = mcRGB(info.color, 150) })
      MS.sel[i] = {
        pillParts = pillParts, bead = bead, star = star,
        title = mcText('menuTitle' .. i, info.key .. '  ' .. info.name,
          leftX, cy + 18, 330, 70, 38, THEME.textMain, 'Left'),
        desc = mcText('menuDesc' .. i, info.desc,
          leftX, cy - 30, 330, 32, 15, THEME.textSub, 'Left'),
        -- 三态需要"整卡位移"：记下每个零件的基准坐标，cardStyle 再按状态加 dy
        base = { pill = { cx + 10, cy }, bead = { cx - 160, cy }, star = { cx + 178, cy },
                 title = { leftX, cy + 18 }, desc = { leftX, cy - 30 } },
      }
    end
  elseif MENU_STYLE == 'B' then
    for i, info in ipairs(MODE_INFO) do
      local cx, cy = MC_ROW[i][1], MC_ROW[i][2]
      local ix, iy = cx - 128, cy + 2
      for j = 1, 3 do
        local o = MC_ICON[i][j]
        mcCell('menuIcon' .. i .. '_' .. j, ix + o[1], iy + o[2], 22, 22, mcRGB(info.color, 235))
      end
      MS.sel[i] = {
        title = mcText('menuTitle' .. i, info.key .. '  ' .. info.name, cx + 96, cy + 2, 340, 70, 38, THEME.textMain, 'Left'),
        icon = { ix = ix, iy = iy, color = info.color },
      }
    end
    MS.detail = mcText('menuDetail', MODE_INFO[1].desc, 0, -232, 760, 34, 18, THEME.textSub)
  else
    for i, info in ipairs(MODE_INFO) do
      local cx, cy = MC_ROW[i][1], MC_ROW[i][2]
      MS.sel[i] = {
        row = mcCell('menuCard' .. i, cx, cy, 424, 96, mcRGB(info.color, 30)),
        title = mcText('menuTitle' .. i, info.key .. '  ' .. info.name, cx - 34, cy + 16, 320, 70, 38, THEME.textMain, 'Left'),
      }
      mcText('menuDesc' .. i, info.desc, cx - 34, cy - 24, 320, 30, 14, THEME.textSub, 'Left')
    end
  end
  local sub = game.InstantiateClientUIControl(TPL_TEXT, root)
  if sub then
    local W, H = CANVAS_W or 1280, CANVAS_H or 720
    sub.name = 'menuSub'
    sub.text = 'TEYVAT SKY · 四元素街机'
    sub.fontSize = 16
    trySet(sub, 'fontColor', THEME.textSub)
    trySet(sub, 'horizontalAlignment', 'Left')
    trySet(sub, 'bgColor', C(0, 0, 0, 0))
    sub:SetSizeDelta(390, 34)
    -- v5.4（用户 2026-10-30 截图）：真机沙箱客户端左上角有自带的 DXWK/FPS/GPU 调试浮层（约 0..40px），
    -- 我方品牌标原来就贴在 y=top-30 与它叠字 ⇒ 下移到 y=top-72，仍在标题页左上角但不再被压。
    sub:SetAnchoredPosition(-(W / 2 - 210), H / 2 - 72)
    MC[#MC + 1] = sub
  end
end
-- 未选中的三项淡出（按下 Digit 后到进局前那 0.5s）：留下被选中的一项 + 屏幕正中模式名大字
MS.dimOthers = function(keep)
  for j = 1, #MODE_INFO do
    if j ~= keep then
      local t, d = find('menuTitle' .. j), find('menuDesc' .. j)
      local sel = MS.sel and MS.sel[j]
      if t then trySet(t, 'fontColor', C(0, 241, 245, 249)) trySet(t, 'outlineColor', C(0, 0, 0, 0)) end
      if d then trySet(d, 'fontColor', C(0, 152, 166, 190)) trySet(d, 'outlineColor', C(0, 0, 0, 0)) end
      if sel then
        if sel.bead then trySet(sel.bead, 'imageColor', C(0, 0, 0, 0)) end
        if sel.star then trySet(sel.star, 'imageColor', C(0, 0, 0, 0)) end
        if sel.pill then trySet(sel.pill, 'imageColor', MS.WALL) end
      end
    end
  end
end
-- 选中态（按模式下 Digit 后、动画窗前的那 0.5s）：字放大 + 卡染深 + 宝珠变大
MS.select = function(i)
  local info = MODE_INFO[i]
  local sel = MS.sel and MS.sel[i]
  if not info or not sel then return end
  if sel.title then
    trySet(sel.title, 'fontSize', 44)                  -- 38 → 44（框 70 ≥ 44*1.45+4=68）
    trySet(sel.title, 'fontColor', info.colorDeep)
  end
  if sel.desc then trySet(sel.desc, 'fontColor', THEME.textMain) end
  if sel.bead then
    tryCall(sel.bead, 'SetSizeDelta', 30, 30)
    trySet(sel.bead, 'imageColor', info.colorDeep)
  end
  if sel.star then trySet(sel.star, 'imageColor', mcRGB(info.color, 230)) end
  if sel.pill then trySet(sel.pill, 'imageColor', MS.over(MS.WALL, info.color, 0.34)) end
  if sel.row then
    tryCall(sel.row, 'SetSizeDelta', 436, 104)
    trySet(sel.row, 'imageColor', mcRGB(info.color, 78))
  end
  if sel.icon then
    for j = 1, 3 do
      local o = MC_ICON[i][j]
      local c = find('menuIcon' .. i .. '_' .. j)
      if c then tryCall(c, 'SetSizeDelta', 26, 26) tryCall(c, 'SetAnchoredPosition', sel.icon.ix + o[1], sel.icon.iy + o[2]) end
    end
  end
  if MS.detail then trySet(MS.detail, 'fontColor', info.colorDeep) setText(MS.detail, info.desc) end
end

-- ===== v2.7 ⑤ 四模式「常态 / 悬浮 / 按下」三态（用户反馈⑤）=====
-- 依据（docs/research/cursor-hover-contract.md，官方 API 文档 + 模拟器源码实证）：
--   * 只有 cursor（光标检测区）与预设按钮两类控件能挂光标事件；image/textbox 没有该能力；
--   * 运行期实例可挂，前提是**模板根**就是 cursor 类（本工程 hit 模板，与手机热区同源）；
--   * 事件门控：父链上必须有 container.showCursor == true（OnStart 里已 `root.showCursor = true`）；
--   * 命中：image 不接收指针也不下钻子级 ⇒ 热区必须是卡片的**同级兄弟**（不是子节点）。
-- v3.0 三态（只在胶囊卡上做，不改布局）：
--   常态 38 号墨色 + 卡染 α46 + 宝珠 22
--   悬浮 40 号模式深色 + 卡染 α74 + 宝珠 26
--   按下 42 号模式深色 + 卡染 α110 + 宝珠 30（再按一次才开局 = 与键盘 Digit 同一条入口）
MS.cardStyle = function(i, state)
  local sel = MS.sel and MS.sel[i]
  local info = MODE_INFO[i]
  if not sel or not info then return end
  local hover = (state == 'hover')
  local press = (state == 'press')
  local hot = hover or press
  -- v5.8（用户：「鼠标悬浮 / 静止 / 按住要三种样式」）：
  -- 悬浮=整卡**抬起 6px** + 卡底更实 + 标题放大一号；按下=**压下 6px** + 卡底更深 + 标题再收回来。
  -- 只改颜色用户看不出来（旧实现只动 alpha 0.17→0.26），位移才是能一眼读到的状态差。
  local dy = press and -6 or (hover and 6 or 0)
  if sel.pillParts then
    local fill = MS.over(MS.WALL, info.color, press and 0.46 or (hover and 0.32 or 0.17))
    for k = 1, #sel.pillParts do
      local part = sel.pillParts[k]
      if part.ctl then
        trySet(part.ctl, 'imageColor', fill)
        tryCall(part.ctl, 'SetAnchoredPosition', part.x, part.y + dy)
      end
    end
    -- 字/宝珠/星芒跟着整卡一起上下（原来只动颜色，位移读不出来）
    local b = sel.base
    if b then
      local function mv(ctl, xy) if ctl and xy then tryCall(ctl, 'SetAnchoredPosition', xy[1], xy[2] + dy) end end
      mv(sel.bead, b.bead) mv(sel.star, b.star) mv(sel.title, b.title) mv(sel.desc, b.desc)
    end
  end
  if sel.title then
    trySet(sel.title, 'fontSize', press and 40 or (hover and 44 or 38))
    trySet(sel.title, 'fontColor', hot and info.colorDeep or THEME.textMain)
  end
  if sel.desc then
    trySet(sel.desc, 'fontColor', hot and THEME.textMain or THEME.textSub)
  end
  if sel.bead then
    local d = press and 26 or (hover and 30 or 22)
    tryCall(sel.bead, 'SetSizeDelta', d, d)
    trySet(sel.bead, 'imageColor', hot and info.colorDeep or info.color)
  end
  if sel.star then
    trySet(sel.star, 'imageColor', mcRGB(info.color, hot and 230 or 150))
  end

end
MS.hoverCard = function(i)
  if helpOpen or pendingMode or FN.overlayOpen() then return end
  if MS.sel_i and MS.sel_i ~= i then return end   -- 已有选中项时不再抢样式
  MS.hover_i = i
  MS.cardStyle(i, 'hover')
  print('menu hover i=' .. i)
end
MS.hoverOut = function(i)
  if helpOpen or pendingMode or FN.overlayOpen() then return end
  if MS.sel_i and MS.sel_i ~= i then return end
  if MS.hover_i == i then MS.hover_i = nil end
  if MS.sel_i ~= i then MS.cardStyle(i, 'normal') end
  print('menu hover out i=' .. i)
end
MS.pressCard = function(i)
  if helpOpen or pendingMode or FN.overlayOpen() then return end
  if MS.sel_i and MS.sel_i ~= i then return end
  MS.press_i = i
  MS.cardStyle(i, 'press')
  print('menu press i=' .. i)
end
-- 四张卡的透明命中热区（cursor 模板实例，PC 也可用鼠标；移动端 = 触屏点卡）
-- @region ui-menu BEGIN (writer: ui-mobile)
MS.buildHoverZones = function()
  UI4.regScreen('menu')
  if not TPL_HIT then print('menu zones=none（无 cursor 模板，仅键盘 1-4 可选）') return false end
  MS.zones = {}
  for i = 1, #MODE_INFO do
    local ok, z = pcall(function() return game.InstantiateClientUIControl(TPL_HIT, root) end)
    if not ok or not z then print('menu zone fail i=' .. i) return false end
    z.name = 'menuZone' .. i
    tryCall(z, 'SetSizeDelta', 416, 108)
    tryCall(z, 'SetAnchoredPosition', MC_ROW[i][1] + 10, MC_ROW[i][2])
    -- v3.1 四：三态音效（hover 进入播短音；按下播 press；Exit 不响防连扫噪）
    addCursor(z, 'CursorEnter', function() sfx(SFX.hover, true) MS.hoverCard(i) end)
    addCursor(z, 'CursorExit', function() MS.hoverOut(i) end)
    addCursor(z, 'CursorDown', function() sfx(SFX.hover, true) MS.pressCard(i) end)
    addCursor(z, 'CursorUp', function() MS.hoverCard(i) end)
    addCursor(z, 'CursorClick', function()
      if helpOpen then closeHelp() return end
      menuSelectMode(i)
    end)
    MC[#MC + 1] = z
    MS.zones[i] = z
    UI4.regAdd('menu.mode' .. i, z, 416, 108)
  end
  -- v5.12（用户：「四个模式鼠标经过有音效和高亮，角色和说明却没有」）：
  -- 根因=**热区没进 UI4 的命中注册表**。模式卡在下面这行 `UI4.regAdd('menu.mode'..i, ...)` 里登记，
  -- 而入口卡当初只建了 cursor 控件、没 regAdd ⇒ 模拟器/真机的 pointer 派发根本看不到它们：
  -- 没有 Enter/Exit（所以没悬停音、没高亮），连点击也是死的。
  if MS.rosterZone then UI4.regAdd('menu.entryRoster', MS.rosterZone, 290, 96) end
  if MS.helpZone2 then UI4.regAdd('menu.entryHelp', MS.helpZone2, 150, 60) end
  -- v2.7 ④ 用户要求「H 按钮常驻」：底栏第三段「H 游戏说明」本身做成可点热区（键盘 H/E 之外的鼠标入口）
  local okH, zh = pcall(function() return game.InstantiateClientUIControl(TPL_HIT, root) end)
  if okH and zh then
    zh.name = 'menuHelpZone'
    tryCall(zh, 'SetSizeDelta', 260, 56)
    tryCall(zh, 'SetAnchoredPosition', 290, MS.lineY or -332)
    addCursor(zh, 'CursorDown', function()
      sfx(SFX.hover, true)   -- v3.1 四：按下音
      keyConsumedFrame = frameSeq
      if helpOpen then closeHelp() else toggleHelp() end
    end)
    MC[#MC + 1] = zh
    MS.helpZone = zh
    UI4.regAdd('menu.help', zh, 260, 56)
    print('menu help zone=ok')
  else
    print('menu help zone=none（仅键盘 H/E 可开说明页）')
  end
  print('menu zones n=' .. (#MS.zones + (MS.helpZone and 1 or 0)
    + (MS.rosterZone and 1 or 0) + (MS.helpZone2 and 1 or 0)))
  UI4.dump('menu')
  return true
end
-- 键盘 Digit 与鼠标点击共用的选模式入口（v2.7：原逻辑内联在 listen 回调里，抽出来两处复用）
-- 浮层（说明页/角色页/手机引导页）开着时，底层的任何输入都要被吞掉。
-- 用户 2026-10-30 二-2：「打开了新的帮助页面，却可以和前一个页面交互、触发音效、还能直接游玩」。
FN.overlayOpen = function()
  return (helpOpen and true) or (ROSTER and ROSTER.on and true)
    or (UI4 and UI4.noteOn and true) or false
end

menuSelectMode = function(i)
  if guideStage ~= 0 or pendingMode then return end
  if FN.overlayOpen() then
    print('menu blocked by overlay')
    return
  end
  -- v4.0 ③：移动端不做双屏（裁决⑨）——但**不能静默吞点击**（用户 2026-10-29：
  -- 「移动端点击了，没有任何反应。应该有原神风格的文案引导去 PC 端游玩」）⇒ 开引导浮层。
  -- v5.0 ②：只拦**真正的双人**（3=双人对战 / 4=双人合作）。「AI 对抗」是单人 vs AI，
  -- 手机上完全能打——旧判据 i>1 把 2 号也算成双人，用户 2026-10-29 打回「错误判定为双人玩法了」。
  if i >= 3 and IS_MOBILE then
    print('pad note menu i=' .. i)
    if UI4.noteOpen then UI4.noteOpen(i) end
    return
  end
  local mname = ({ 'casual', 'ai-battle', 'pvp', 'coop' })[i]
  if not mname then return end
  MODE = mname
  MS.sel_i = i
  print('mode=' .. MODE)                             -- 选模式锚（用例断言）
  MS.select(i)                                       -- 选中反馈（字放大 + 左柱加粗 + 整行高亮）
  MS.dimOthers(i)                                    -- 其余三项淡出
  MS.focusLock(i, mname)                             -- 展台标题变模式名大字（64 号）
  pendingMode, pendingT = mname, 0                   -- 0.5s 动画窗后 enterMode 开局
  setText(topBanner, MODE_TITLE[mname] or mname)
  trySet(topBanner, 'fontColor', MODE_INFO[i].color)
  setText(botBanner, '')
end
buildMenuCards = function()
  if not TPL_CELL then return false end
  if not TPL_TEXT then TPL_TEXT = probeSettleTextbox() end
  if not TPL_TEXT then print('menu cards no text tpl') return false end
  destroyMenuCards()
  MS.sel_i, MS.hover_i, MS.press_i = nil, nil, nil   -- 重建即清选中/悬浮态（复局防串）
  -- v2.4 ①：展台先建（墙/框/角标/标题/提示条），模式选择区后建 ⇒ 压在墙上面
  local okStage, errStage = pcall(MS.build)
  if not okStage then print('menu stage error :: ' .. tostring(errStage)) end
  local okModes, errModes = pcall(MS.modes)             -- v2.5 ①：四模式选择区
  if not okModes then print('menu modes error :: ' .. tostring(errModes)) end
  local okZone = pcall(MS.buildHoverZones)              -- v2.7 ⑤：三态热区（最后建 = 在最上层）
  if not okZone then print('menu zones error') end
  -- v6 重构：删掉「用 SetAsLastSibling 给帮助页补置顶」那段死代码。
  -- 实测该 API 在本引擎是空操作，原来的 `help restack n=` 日志会伪造「已置顶」的成功信号，
  -- 让后来按日志判断层序的人被骗（tests/ 与 tests-lua/ 对该字面量 0 断言，可安全删除）。
  -- 正确的修法是「先拆展台再建浮层」（创建顺序即层序）——迁移到场景栈后由 opaque 场景保证。
  print('menu cards n=' .. #MC .. ' style=' .. MENU_STYLE)
  return true
end

-- @region ui-menu END (writer: ui-mobile)
-- ===== T6b-2 双屏控件与布局 =====
-- G[2] 棋盘（p2cell/p2frame 前缀防与 G[1] 撞名；坐标=基准+boardOX）。
local function buildBoardControls(inst)
  if not TPL_CELL or not inst then return false end
  local save = g
  g = inst
  local plate = game.InstantiateClientUIControl(TPL_CELL, root)
  if plate then                            -- v2.4 ①：对家盘同样需要背板（缝里不漏亮底）
    plate.name = 'p2plate'
    plate:SetSizeDelta(COLS * PITCH + 6, ROWS * PITCH + 6)
    plate:SetAnchoredPosition(0, 0)
    plate.imageColor = (MODE_THEME[MODE] or MODE_THEME.casual).plate   -- v3.0 双屏第二盘也要跟着模式换色
    g.plate = plate
  end
  g.cells = {}
  for i = 1, COLS * ROWS do
    local c = game.InstantiateClientUIControl(TPL_CELL, root)
    if not c then g = save return false end
    local col = (i - 1) % COLS
    local row = (i - 1) // COLS
    c.name = 'p2cell' .. i
    g.cellBX[i] = (col - 4.5) * PITCH
    g.cellBY[i] = (9.5 - row) * PITCH
    c:SetSizeDelta(CELL, CELL)
    c:SetAnchoredPosition(g.cellBX[i] + (g.boardOX or 0), g.cellBY[i])
    c.imageColor = CFG.COL_EMPTY
    g.cells[i] = c
  end
  -- v2.4 ①：棋盘框从亮青 #4CC2FF 改成石板灰蓝——亮青框是标题页最响的元素，
  -- 把「屏幕」的对比交给视窗边框，棋盘本体退后一层（进局后同样更耐看）
  local FRAME_COL = (MODE_THEME[MODE] or MODE_THEME.casual).frame
  local frameX = 4.5 * PITCH + CELL / 2 + 1
  local frameY = 9.5 * PITCH + CELL / 2 + 1
  g.frames = {}
  local specs = {
    { -frameX, 0, 2, 2 * frameY + 2 }, { frameX, 0, 2, 2 * frameY + 2 },
    { 0, frameY, 2 * frameX + 2, 2 }, { 0, -frameY, 2 * frameX + 2, 2 },
  }
  for i = 1, #specs do
    local fr = game.InstantiateClientUIControl(TPL_CELL, root)
    if fr then
      local sp = specs[i]
      fr.name = 'p2frame' .. i
      g.frameBX[i], g.frameBY[i] = sp[1], sp[2]
      fr:SetSizeDelta(sp[3], sp[4])
      fr:SetAnchoredPosition(g.frameBX[i] + (g.boardOX or 0), g.frameBY[i])
      fr.imageColor = FRAME_COL
    end
    g.frames[i] = fr
  end
  print('p2 cellCount=' .. #g.cells)
  g = save
  return true
end

-- G[2] 控件销毁（exitToMenu 用；Destroy 真机生效=技能差异表#2，弃引用会在 430 上限累积）
local function destroyBoardControls(inst)
  if not inst or not inst.cells then return end
  local save = g
  g = inst
  local n = 0
  for _, arr in ipairs({ inst.cells, inst.frames }) do
    for i = 1, #(arr or {}) do
      if arr[i] then
        local ok = pcall(function() game.DestroyClientUIControl(arr[i]) end)
        if ok then n = n + 1 end
      end
    end
  end
  if inst.plate then
    local ok = pcall(function() game.DestroyClientUIControl(inst.plate) end)
    if ok then n = n + 1 end
    inst.plate = nil
  end
  inst.cells, inst.frames = nil, nil
  print('p2 destroy n=' .. n)
  g = save
end

-- 摆一个实例的棋盘到指定 x 偏移（cells/frames 全量重摆；preview 只对 G[1] 重排）
local function placeBoard(inst, ox)
  local save = g
  g = inst
  g.boardOX = ox
  if g.cells then
    for i = 1, #g.cells do
      tryCall(g.cells[i], 'SetAnchoredPosition', g.cellBX[i] + ox, g.cellBY[i])
    end
  end
  if g.frames then
    for i = 1, 4 do
      tryCall(g.frames[i], 'SetAnchoredPosition', g.frameBX[i] + ox, g.frameBY[i])
    end
  end
  if g.plate then                        -- v2.4 ①：棋盘背板跟着盘走（双屏时它留在中线=一块黑板）
    tryCall(g.plate, 'SetAnchoredPosition', ox, 0)
  end
  g = save
end

-- 双屏布局：G[1] 棋盘移左（-320）、G[2] 移右（+320）；G[1] preview 重排（next 上移棋盘上方两排、
-- hold 左栏竖排）；服务端 title/hint 藏（左栏让位），keyA-C 征用为 AI 盘战况（renderHud 双屏分支）。
FN.layoutDual = function()
  placeBoard(G[1], -236)
  -- v2.4 ③ 双屏读图读数（v23-pvp.png）：两侧各 300+px 空区没有归属物，左栏 HUD 压在左盘边上，
  -- 两盘除了位置没有任何席位标识。做法：棋盘框按席位染色 + 左栏战况回归左空区 + 中缝一条细线。
  -- v3.0 浅底席位色：取四角色色的深色档（原霓虹青/玫红在浅底上太扎眼）
  local p1c = C(255, 47, 126, 158)                       -- P1 甘雨 深冰蓝
  local p2c = C(255, 192, 78, 124)                       -- AI 少女 深樱粉
  if MODE == 'pvp' then p2c = C(255, 95, 76, 168) end    -- 双人对战 = 刻晴 深紫
  if MODE == 'coop' then p2c = C(255, 63, 139, 60) end   -- 合作 = 纳西妲 深草绿
  -- v5.4：席位配色收敛到 FN.paintFrames（唯一写者）。原来这里内联写 p1c/p2c，
  -- 但 ui.lua 的 U.bgApply 随后会把两盘框重涂成模式色 ⇒ 席位色永远看不见（A14 根因）。
  if FN.paintFrames then FN.paintFrames() end
  print('dual seat mode=' .. tostring(MODE))
  -- v3.5 ⑨：预览/hold 位**不再由布局另写一套**——原来这里用 22/18 间距摆到左盘上方，
  -- 而 renderNext 用 20/14 间距摆到右栏 ⇒ 准备期与对局期预览块会「跳位 + 格子间露缝」。
  -- 唯一真源 = renderNext（格子间距=格宽），布局末尾直接调一次即可让准备期与对局期完全一致。
  if renderNext then pcall(renderNext) end
  tryCall(title, 'SetVisible', false)
  tryCall(hint, 'SetVisible', false)
  for _, c in ipairs({ keyA, keyB, keyC }) do tryCall(c, 'SetVisible', true) end
  placeBoard(G[2], 236)
  -- 中缝细线：把两块屏分开（2 个实例，一次性建，exitToMenu 里拆）
  if not DUAL_DECO[1] and TPL_CELL then
    for i = 1, 2 do
      local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_CELL, root) end)
      if ok and c then
        c.name = 'duoLane' .. i
        DUAL_DECO[i] = c
      end
    end
  end
  if DUAL_DECO[1] then
    local H2 = CANVAS_H or 720
    tryCall(DUAL_DECO[1], 'SetSizeDelta', 2, H2 * 0.66)
    tryCall(DUAL_DECO[1], 'SetAnchoredPosition', 0, 0)
    trySet(DUAL_DECO[1], 'imageColor', THEME.gold)
  end
  if DUAL_DECO[2] then
    -- v5.4（用户 2026-10-30 二-1：「右边帮助区域拥挤」一并修的构图）：中缝方块读起来像掉了一个格子，
    -- 换成 14px 描金圆点，作为"分隔符/VS 点"更像我方设计语言。
    tryCall(DUAL_DECO[2], 'SetSizeDelta', 14, 14)
    tryCall(DUAL_DECO[2], 'SetAnchoredPosition', 0, 0)
    -- 换图元要走枚举形态并带字符串回退（直接 SetImage(100006) 会让 imageId 变 undefined，
    -- 出图管线 assertLosslessJson 当场炸；见 fx.lua setImg 同一处理）
    do
      local enumIS = (type(Enum) == 'table' and Enum.ImageSource) or nil
      local ok = false
      if enumIS and enumIS.StaticReference ~= nil then
        ok = pcall(function() DUAL_DECO[2]:SetImage(enumIS.StaticReference, BG_IMG.circle) end)
      end
      if not ok then pcall(function() DUAL_DECO[2]:SetImage('StaticReference', BG_IMG.circle) end) end
    end
    trySet(DUAL_DECO[2], 'imageColor', THEME.goldDeep)
  end
  -- ===== v3.5 双屏 HUD 摆位（唯一真源；此前这里有个 nil 全局炸点，见下）=====
  -- 🔴 事故记录（v3.4 起潜伏）：本函数原先引用全局 `halfH`——layout() 里那是 **local**，
  --   所以 `-(halfH - 96)` 每帧抛 `attempt to perform arithmetic on a nil value (global 'halfH')`
  --   （客户端日志 lua-error: lua/main.lua:3138），**函数从此中断**：
  --   keyA-C 复位成 'AI 盘'、textbox 隐藏收口、hudNext 归位全部没执行 ⇒
  --   右侧 keyC(fs22 textbox) 与 ikeyC(fs14 实例) 同框叠成双影、「下一个」还留在 y=300 被裁。
  --   教训：布局函数里的画布尺寸一律从 CANVAS_W/CANVAS_H 现算，不要依赖别处的 local。
  local halfW = (CANVAS_W or 1280) / 2
  local halfH = (CANVAS_H or 720) / 2
  local gutterX = -(halfW - 186)          -- 左空区中线（1600 画布 = -614）
  -- ① 左栏：玩家战况（hud 17 号 / best 20 号，上下 48 间距）
  if hud then
    tryCall(hud, 'SetSizeDelta', 348, 40)          -- 18 号下 330 会把尾字裁掉（右缘贴边）
    tryCall(hud, 'SetAnchoredPosition', gutterX, 250)
    trySet(hud, 'fontSize', 17)
  end
  if best then
    tryCall(best, 'SetSizeDelta', 330, 36)
    tryCall(best, 'SetAnchoredPosition', gutterX, 202)
  end
  if HUD_INST.hud then
    tryCall(HUD_INST.hud, 'SetSizeDelta', 348, 40) trySet(HUD_INST.hud, 'fontSize', 17)
    tryCall(HUD_INST.hud, 'SetAnchoredPosition', gutterX, 250) tryCall(HUD_INST.hud, 'SetVisible', true)
  end
  if HUD_INST.best then
    tryCall(HUD_INST.best, 'SetSizeDelta', 330, 36) trySet(HUD_INST.best, 'fontSize', 20)
    tryCall(HUD_INST.best, 'SetAnchoredPosition', gutterX, 202) tryCall(HUD_INST.best, 'SetVisible', true)
  end
  -- ② 右栏：AI/P2 盘战况三行（x=600/宽 360 → 跨 420..780，画布右缘留 20）
  --    行距 44（原 40 且框高 38 ⇒ 净空只剩 2px，用户读成「两行挤在一起」）；
  --    ①行标题 18 号、②③行数据 16 号（14 号在 1600 画布上偏小，视觉上像脚注）。
  if HUD_INST.keyA then
    tryCall(HUD_INST.keyA, 'SetSizeDelta', 360, 40) trySet(HUD_INST.keyA, 'fontSize', 18)
    tryCall(HUD_INST.keyA, 'SetAnchoredPosition', 600, -40) tryCall(HUD_INST.keyA, 'SetVisible', true)
  end
  if HUD_INST.keyB then
    tryCall(HUD_INST.keyB, 'SetSizeDelta', 360, 40) trySet(HUD_INST.keyB, 'fontSize', 16)
    tryCall(HUD_INST.keyB, 'SetAnchoredPosition', 600, -90) tryCall(HUD_INST.keyB, 'SetVisible', true)
  end
  if HUD_INST.keyC then
    tryCall(HUD_INST.keyC, 'SetSizeDelta', 360, 40) trySet(HUD_INST.keyC, 'fontSize', 16)
    tryCall(HUD_INST.keyC, 'SetAnchoredPosition', 600, -134) tryCall(HUD_INST.keyC, 'SetVisible', true)
  end
  -- ③「下一个」标签：贴预览块上方（预览块实测 y 78..189，标签中心 215、框高 44、valign=Middle）
  if hudNext then
    tryCall(hudNext, 'SetSizeDelta', 240, 44)
    tryCall(hudNext, 'SetAnchoredPosition', RIGHT_CX or (halfW - 230), 255)
  end
  if HUD_INST.hudNext then
    tryCall(HUD_INST.hudNext, 'SetSizeDelta', 240, 44)
    tryCall(HUD_INST.hudNext, 'SetAnchoredPosition', RIGHT_CX or (halfW - 230), 255)
    tryCall(HUD_INST.hudNext, 'SetVisible', true)
  end
  -- ③b「暂存」标签（v5.37：左列 hold 槽原来没有任何标签，方块孤零零飘着 —— 用户报"渲染失败"）
  if HUD_INST.holdLab then
    tryCall(HUD_INST.holdLab, 'SetSizeDelta', 200, 44)
    tryCall(HUD_INST.holdLab, 'SetAnchoredPosition', -(halfW - 230), 255)
    tryCall(HUD_INST.holdLab, 'SetVisible', true)
    pcall(function() HUD_INST.holdLab.text = '暂存' end)
    trySet(HUD_INST.holdLab, 'fontSize', 22)
    trySet(HUD_INST.holdLab, 'horizontalAlignment', 'Middle')
    trySet(HUD_INST.holdLab, 'verticalAlignment', 'Middle')
    trySet(HUD_INST.holdLab, 'fontColor', THEME.textMain)
  end
  -- ④ 引导/准备提示（hint）：中缝一行，压在底栏常驻之上（1600 画布：y=-340 → ypx770..810，
  --    底栏常驻 ypx852..892，互不相压；宽 260 只占中缝，不再横穿两侧键位卡）
  if hint then
    tryCall(hint, 'SetSizeDelta', 260, 40)
    tryCall(hint, 'SetAnchoredPosition', 0, -(halfH - 110))
  end
  if HUD_INST.hint then
    tryCall(HUD_INST.hint, 'SetSizeDelta', 260, 40)
    tryCall(HUD_INST.hint, 'SetAnchoredPosition', 0, -(halfH - 110))
    tryCall(HUD_INST.hint, 'SetVisible', true)
  end
  -- ⑤ 收口：textbox 份一律隐藏（实例份在上可见；断言只读 text/anchoredPositionX，不受影响）
  for _, box in ipairs({ hud, best, keyA, keyB, keyC, hint, hudNext }) do
    if box then tryCall(box, 'SetVisible', false) end
  end
  print('layout dual')
end

-- ===== v2.8 ⑤：HUD 实例双写（背景池 wash 全屏实例盖住服务端 textbox——层序铁律，
-- 修法=HUD 文字走运行时实例；textbox 份双写保留（断言/降级保底））=====
HUD_INST.txt = function(box, txt)
  -- 浮层开着时**抑制写入者**（只清一次没用：常驻提示每帧都写回来）——见 FN.syncStage
  if FN.textLayerHidden then return end
  setText(box, txt)
  local inst = box and HUD_INST[box.name]
  if inst then pcall(function() inst.text = txt end) end
end
HUD_INST.build = function()
  if not TPL_TEXT then TPL_TEXT = probeSettleTextbox() end
  if not TPL_TEXT then print('hud inst none（无模板，HUD 走 textbox）') return end
  local made = 0
  -- v3.2 ①：botBanner/topBanner 也入双写（用户打回：PERSIST_TIP/H 提示/接管文案
  -- 被 wash 盖住——服务端 textbox 永远在实例层下，凡常驻文字一律实例份）
  -- v3.3 ②：textbox 份建完即隐藏（此前实例+textbox 双份叠字；断言读 text 字段，不受 visible 影响）
  for _, nm in ipairs({ 'hud', 'best', 'keyA', 'keyB', 'keyC', 'botBanner', 'topBanner', 'hint', 'hudNext', 'holdLab' }) do
    local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_TEXT, root) end)
    if ok and c then
      c.name = 'i' .. nm
      local isBanner = (nm == 'botBanner' or nm == 'topBanner')
      local w = isBanner and (CANVAS_W or 1280) - 120 or (nm == 'hint' and 700) or (nm == 'hudNext' and 240) or 640
      local fs = isBanner and 22 or 20
      if nm == 'hudNext' then fs = 22 end
      trySet(c, 'fontSize', fs)
      trySet(c, 'fontColor', THEME.textMain)
      -- v3.5 ④：hudNext 也要够高（22 号框高判据 35.9，取 44 留余量；valign=Middle 防顶部裁字）
      -- v3.5 ⑧：横幅实例的框高必须按它**实际字号**算——topBanner 排的是 34 号（需 53.3），
      -- 原来按 22 号算成 39 ⇒ 出图判据报 `itopBanner 框=1480x39 需高=53.3 fits=false` 整行裁字。
      local hh = (nm == 'hudNext') and 44
        or ((nm == 'topBanner') and 64)
        or ((nm == 'botBanner') and 48)
        or math.floor(fs * 1.45 + 8)
      c:SetSizeDelta(w, hh)   -- v2.9 ①/v3.2 ②：宽按最长文案、高按框高判据
      HUD_INST[nm] = c
      -- v3.3 ③：keyA-C 常驻文案最长 24 全角（PERSIST_TIP 整串），20 号需 ~480px > 框宽
      -- → 实例份字号降 14（需 336px < 360-4），fits 判据过；textbox 份字号不变（仅断言）
      if nm == 'keyA' or nm == 'keyB' or nm == 'keyC' then
        trySet(c, 'fontSize', 14)
      end
      -- v3.5 ④：所有 HUD 实例统一 垂直居中（模板缺省 Top 会裁掉字形顶部）
      trySet(c, 'verticalAlignment', 'Middle')
      -- v5.5：水平方向也必须显式居中——真机截图里右侧「P2 盘 / 得分…」被右缘切掉半个字，
      -- 底栏键位提示不居中，都是模板缺省对齐（非 Middle）导致的溢出裁切。
      trySet(c, 'horizontalAlignment', 'Middle')
      made = made + 1
    end
  end
  -- v3.2 ①：banner 系实例摆到与 textbox 同位（画布上下横幅位；layout 改位时同步调这里）
  local halfH = (CANVAS_H or 720) / 2
  if HUD_INST.topBanner then
    tryCall(HUD_INST.topBanner, 'SetAnchoredPosition', 0, halfH - 36)
    trySet(HUD_INST.topBanner, 'fontSize', 34)
  end
  if HUD_INST.botBanner then
    -- v5.4：底栏常驻说明离画布底缘只有 28px，22 号字（框高 48）下沿会被裁 ⇒ 上移 12px
    tryCall(HUD_INST.botBanner, 'SetAnchoredPosition', 0, -(halfH - 40))
  end
  -- v3.5 ④：「下一个」标签实例摆到预览块正上方（预览块实测 y 78..189，标签中心 215 不压块）
  -- 为什么贴在预览块上而不是屏幕右上：原 (RIGHT_CX, halfH-150) 离预览块 90px，读起来像独立标题。
  if HUD_INST.hudNext then
    tryCall(HUD_INST.hudNext, 'SetAnchoredPosition', RIGHT_CX or 570, 255)
  end
  -- v3.3 ②：textbox 份隐藏防双份（实例在上可见；断言只读 text 字段不受影响）
  for _, nm in ipairs({ 'hud', 'best', 'keyA', 'keyB', 'keyC', 'botBanner', 'topBanner', 'hint', 'hudNext' }) do
    local box = (nm == 'hud' and hud) or (nm == 'best' and best) or (nm == 'keyA' and keyA)
      or (nm == 'keyB' and keyB) or (nm == 'keyC' and keyC) or (nm == 'botBanner' and botBanner)
      or (nm == 'topBanner' and topBanner) or (nm == 'hint' and hint) or (nm == 'hudNext' and hudNext)
    if box then tryCall(box, 'SetVisible', false) end
  end
  print('hud inst n=' .. made .. ' (textbox hidden)')
end

-- v3.5 ④：标题页/回菜单把 HUD 实例整体下架（`SetVisible(false)` 在真机对运行时实例不一定生效
-- ⇒ 同时挪到画布外 y=-4000 兜底；进局由 startIfWaiting 把「位 + 显」一起还原）
HUD_INST.hideAll = function()
  for _, nm in ipairs({ 'hud', 'best', 'keyA', 'keyB', 'keyC', 'botBanner', 'topBanner', 'hint', 'hudNext' }) do
    local inst = HUD_INST[nm]
    if inst then
      tryCall(inst, 'SetVisible', false)
      tryCall(inst, 'SetAnchoredPosition', 0, -4000)
    end
  end
end
-- v3.5 ⑥：只下架「战况列」（结算遮罩半透明，那几行会从面板外透出来）；
-- 横幅保留——结算层建不出来时走 topBanner/botBanner 兜底文案，把横幅一起藏掉等于兜底全黑。
HUD_INST.hideStats = function()
  for _, nm in ipairs({ 'hud', 'best', 'keyA', 'keyB', 'keyC', 'hint', 'hudNext' }) do
    local inst = HUD_INST[nm]
    if inst then tryCall(inst, 'SetVisible', false) end
  end
end
-- 与 hideStats 对称：结算期下架的站况列重新上架（casual 重开不走 startIfWaiting，必须显式还原）
HUD_INST.showStats = function()
  for _, nm in ipairs({ 'hud', 'best', 'hint', 'hudNext' }) do
    local inst = HUD_INST[nm]
    if inst then tryCall(inst, 'SetVisible', true) end
  end
end

-- v2.6 ①：按模式生成常驻提示并显示（20 号次文字色，单行不动）
showPersistTip = function()
  -- v3.1 四-2 文字矩阵（模式×文字正确性）：
  --   casual     = 玩家键组（←→↑↓/空格/G）+H
  --   ai-battle  = 玩家键组（同 casual，单人对 AI）+H —— 不出现任何 P2 字样
  --   pvp        = P1（A/D/W/S/空格/G）｜P2（方向键/X/F）
  --   coop       = P1（W/G）｜P2（←→/↓/X）（共盘）
  -- v4.0 ②：**移动端不能贴键盘键位**（用户 2026-10-29：「移动端没法操作」——底栏还在教键盘）。
  -- 触屏文案跟新的 7 键丝印走（左 ◀ ▶ 旋转 / 右 锁定 缓降 暂存 / 右上 说明），文案见 docs/copy-v4.md §5。
  if IS_MOBILE and MODE == 'casual' then
    PERSIST_TIP = '左：◀ ▶ 移动 · 旋转　右：锁定 · 缓降 · 暂存　右上：说明'
    trySet(botBanner, 'fontSize', 18)
    trySet(botBanner, 'fontColor', THEME.textSub)
    setText(botBanner, PERSIST_TIP)
    return
  end
  PERSIST_TIP = (MODE == 'pvp')
    and 'P1：A D 移动 · W 旋转 · S 软降 · 空格 直落 · G 暂存　｜　P2：方向键 · X 直落 · F 暂存'
    or (MODE == 'coop')
      and 'P1：W 旋转 · G 暂存　｜　P2：← → 移动 · ↓ 软降 · X 直落　（共盘抗 AI）'
    or '← → 移动 · ↑ 旋转 · ↓ 软降 · 空格 直落 · G 暂存 · H 说明'
  trySet(botBanner, 'fontSize', 20)
  trySet(botBanner, 'fontColor', THEME.textSub)
  setText(botBanner, PERSIST_TIP)
end

-- v2.7 ⑦ 套用模式主题：**四套不同构图**的背景（用户复评「四种模式要设计四种主题的背景」）
-- 数据在 lua/tetris/config.lua 的 MODE_BG（每种模式一组图元：rect/circle/triangle/fourstar/ring + 旋转）。
-- 做法：背景池在 OnStart 一次性建好（必须早于棋盘 ⇒ 压在棋盘之下），换模式只**换肤**不新建实例
--      （运行中新建的实例会盖住 200 个棋盘格，真机 SetVisible(false) 又靠不住 ⇒ 只能池化）。
-- SetImage 用枚举形态，失败回落字符串形态；两者都失败就保持 rect（布局仍然自洽，只是没有圆/环）。
FN.skinBgItem = function(ctl, spec)
  if not ctl then return false end
  tryCall(ctl, 'SetSizeDelta', spec.w, spec.h)
  tryCall(ctl, 'SetAnchoredPosition', spec.x, spec.y)
  trySet(ctl, 'imageColor', spec.c)
  -- ⚠ 不能用 tryCall：它按「非 nil 实参个数」分发，最多两个 ⇒ 三个参数会被截成 (0,0)，
  -- z 变成 undefined 后整个 scene 快照序列化失败（用例报 `undefined at $.tree[0].children[N].localRotationZ`）。
  if not pcall(function() ctl:SetLocalRotation(0, 0, spec.rot or 0) end) then
    pcall(function() ctl:SetLocalRotation(0, 0) end)
  end
  local img = BG_IMG[spec.s or 'rect'] or BG_IMG.rect
  local enumT = (type(Enum) == 'table' and Enum.ImageSource) or nil
  local ok = false
  if enumT and enumT.StaticReference ~= nil then
    ok = pcall(function() ctl:SetImage(enumT.StaticReference, img) end)
  end
  if not ok then ok = pcall(function() ctl:SetImage('StaticReference', img) end) end
  if not ok and not MS.bgWarned then
    MS.bgWarned = true
    print('bg SetImage unavailable（背景退回纯矩形；不影响布局）')
  end
  return true
end
-- @region ui-bg-theme BEGIN (writer: ui-mobile)
applyModeTheme = function(mode)
  -- v5.0：背景满幅的唯一实现搬到 lua/tetris/ui.lua 的 U.bgApply（wash 整屏底 + cover 构图两层），
  -- 判据从旧的「92% 边沿」改成**四边 0 缺口**，并打印 `bg cover ok bs=… screen=…`。
  -- 五屏共用同一条路径：屏幕切换由 FN.U.sync 判定后调用它 ⇒ 标题页不再"从不调用"。
  if not FN.U then
    print('bg cover skip（ui 模块缺失）')
    return
  end
  FN.U.bgApply(mode or 'casual', FN.U.screen)
end

-- @region ui-bg-theme END (writer: ui-mobile)
-- @region skill-system BEGIN (writer: lead)
-- ===== v5.0 ③ 角色技能：机制 + 反馈四件套（用户 2026-10-29 第四条返工）=====
-- 为什么整段重写：v4.0 的技能=「一行 botBanner 文案 + 一行 print」，用户体感
-- 「四个角色技能，和没做没有区别」。v5.0 的硬规定（少一项按"没做"算）：
--   ①机制真的改变盘面 ②角色主题色上屏 ③特效（名卡/环波/描边/边缘光/浮字）④专属音效
--   ⑤一句有人味的文案（COPY 模块） ⑥HUD 状态位（能量/CD/台前角色）随触发变化
-- 键位：Z=技能1（台前）U=技能2（队伍第二人）Y=换台前；手机端 UI4.dispatch 的
--      'skill1'/'skill2'/'switch' 走同一入口（FN.skillCast / FN.skillSwitch）。
-- 模块缺失降级：COPY/FX 任一没装载时，机制与文案仍有兜底，日志里 `fx=off`/`copy=off` 可判。
FN.SK = { topT = 0, lastKind = '', lastRole = '', hudTxt = nil, take = nil }

-- 主题色兜底（COPY.ROLES[*].color 优先）——用户要求"四角色主题色在触发时体现"，不能因为模块没接线就丢
FN.SKCOL = {
  nahida    = 0xFF7FCF6A,   -- 草绿
  keqing    = 0xFFB18CFF,   -- 雷紫
  ganyu     = 0xFF9FE8FF,   -- 冰蓝
  columbina = 0xFFFFC8E6,   -- 风粉白
}
FN.SKROLE_NAME = { nahida = '纳西妲', keqing = '刻晴', ganyu = '甘雨', columbina = '少女' }
FN.SKROLE_SKILL = { nahida = '所闻遍计', keqing = '星斗归位', ganyu = '降众天华', columbina = '引力涟漪' }
FN.SKROLE_ELEM = { nahida = '草', keqing = '雷', ganyu = '冰', columbina = '水' }

-- 技能档位（skills.lua 的 TIER_BY_LV 给 1..8）→ NUM.AI_LEVELS 的下标（1..3）
-- 旧实现把 1..8 直接当 lvIdx 传给 aiTickCore：>3 会越界回落成 hard档 ⇒ 纳西妲"档位"名存实亡。
-- 注意口径：技能是**消耗 25s CD 换来的"强力代打"**，不能给"陪练档"——
-- 用户原话「小草神核心机制肯定是 ai 代打，局内升级解锁不同的强力 ai 的级别」。
-- 所以 tier 1..3 就已经给 normal（标准），4 以上给 hard（全力）；easy 只属于 casual 的自动接管。
FN.aiLevelIdxOfTier = function(tier)
  local t = tonumber(tier) or 1
  if t <= 3 then return 2 end
  return 3
end

-- 文字专用深色（角色主题色的「深色档」）。为什么单列一个：
-- 亮主题色 #7FCF6A 直接当字色，在浅色面板 #F4FCEC 上对比只有 1.81:1（机检 fail，人眼发虚）。
-- 图形（环波/描边/进度条）继续用亮色，**文字一律用深色**。
-- 把一个 ARGB 压到指定亮度以下（浅色主题色当字色会看不见：少女青白 #BFF3EA 在 #F4F4FC 上只有 1.11:1）
FN.skillDark = function(c, target)
  local a = math.floor(c / 16777216) % 256
  local r = math.floor(c / 65536) % 256
  local g = math.floor(c / 256) % 256
  local b = c % 256
  local lum = 0.299 * r + 0.587 * g + 0.114 * b
  local lim = target or 96
  if lum <= lim then return c end
  local k = lim / lum
  return C(a, math.floor(r * k), math.floor(g * k), math.floor(b * k))
end

-- 特效基准 x：单人=0；双盘时玩家盘在左（±280），特效跟着走，否则会炸在中缝
FN.fxBoardX = function()
  if ACTIVE and ACTIVE[2] and G[ACTIVE[1]] == G[1] then return -236 end
  return 0
end

-- ===== v5.4 席位配色唯一写者（修 A14「双盘用体系外玫红」+ A9「四角色局看起来一样」）=====
-- 事实链：main 的 OnStart/layoutDual 会给棋盘框按角色染色，但 ui.lua 的 U.bgApply（每屏/每模式都会跑）
-- 随后把 plate 与 4 条 frame 重涂成 MODE_THEME[mode].frame ⇒ 角色色被静默覆盖（实测 frame 读数
-- 恒为模式色 #7c63c9/#c04e7c）。修法：**框色只有这一处写**，ui 侧改成调用本函数；
-- 本函数同时覆盖单盘（台前角色）与双盘（P1 / 对家两个席位）。
FN.seatColor = function(roleKey)
  local R = FN.COPY and FN.COPY.ROLES and roleKey and FN.COPY.ROLES[roleKey]
  local c = R and (R.color2 or R.color)
  if not c then return nil end
  return FN.skillDark(c, 118)      -- 亮度压到 ≤118：浅底上 2px 细线既有对比又不刺眼
end
FN.paintFrames = function()
  local mt = MODE_THEME[MODE] or MODE_THEME.casual
  local party = (SK and SK.party) or {}
  local act = (SK and SK.active) or 1
  local p1 = FN.seatColor(party[act]) or mt.frame
  local painted = false
  if G[2] then
    local other
    if MODE == 'pvp' then other = 'keqing'
    elseif MODE == 'coop' then other = 'nahida'
    else other = party[act == 1 and 2 or 1] end
    local p2 = FN.seatColor(other) or mt.frame
    for i = 1, 4 do
      if G[1].frames and G[1].frames[i] then trySet(G[1].frames[i], 'imageColor', p1) painted = true end
      if G[2].frames and G[2].frames[i] then trySet(G[2].frames[i], 'imageColor', p2) painted = true end
    end
  elseif g and g.frames and g.frames[1] then
    for i = 1, 4 do if g.frames[i] then trySet(g.frames[i], 'imageColor', p1) painted = true end end
  end
  return painted
end

FN.skillInk = function(role)
  local CP = FN.COPY
  if CP and CP.ROLES and CP.ROLES[role] and CP.ROLES[role].color2 then
    return FN.skillDark(CP.ROLES[role].color2)
  end
  return FN.skillDark(FN.skillColor(role))
end

FN.skillColor = function(role)
  local CP = FN.COPY
  if CP and CP.ROLES and CP.ROLES[role] and CP.ROLES[role].color then return CP.ROLES[role].color end
  return FN.SKCOL[role] or FN.SKCOL.nahida
end
FN.skillName = function(role)
  local CP = FN.COPY
  if CP and CP.ROLES and CP.ROLES[role] and CP.ROLES[role].name then return CP.ROLES[role].name end
  return FN.SKROLE_NAME[role] or '纳西妲'
end
FN.skillSkill = function(role)
  local CP = FN.COPY
  if CP and CP.ROLES and CP.ROLES[role] and CP.ROLES[role].skill then return CP.ROLES[role].skill end
  return FN.SKROLE_SKILL[role] or '所闻遍计'
end

-- 台前角色（slot 2 = 队伍里的另一个人；只有一个角色时回落同一人）
FN.skillRoleOf = function(slot)
  if not (SK and SK.party and #SK.party > 0) then return 'nahida' end
  local n = #SK.party
  local idx = SK.active or 1
  if slot == 2 and n > 1 then idx = (idx % n) + 1 end
  if idx < 1 or idx > n then idx = 1 end
  return SK.party[idx] or 'nahida'
end

-- 特效引擎懒初始化：第一次要用时才建池（此时棋盘 200 格已经建好 ⇒ 特效天然压在棋盘之上）
FN.fxInit = function()
  if FN.FX or not FN.FXM then return FN.FX end
  -- ⚠ TPL_TEXT 是**懒探测**的（第一次建结算/帮助/模式卡文字时才赋值）。fx 池在首次技能时才建，
  -- 若此刻它还是 nil，名卡就只有色块没有字（2026-10-29 实测：`fx pool ok ctl=21 bad=0 text=0`）。
  -- 这里主动补探一次（probeSettleTextbox 内部有缓存 + pcall 护栏，重复调用无副作用）。
  if not TPL_TEXT and probeSettleTextbox then
    TPL_TEXT = probeSettleTextbox()
    print('fx tpl text resolve=' .. tostring(TPL_TEXT))
  end
  local ok, inst = pcall(FN.FXM.new, {
    game = game,
    rootOf = function() return root end,
    W = function() return CANVAS_W or 1280 end,
    H = function() return CANVAS_H or 720 end,
    trySet = trySet, tryCall = tryCall,
    sfx = sfx,
    colorOf = FN.skillColor,
    -- 图元模板 guid：card = 棋盘格（image，可当色块/圆环载体），text = 文字模板（名卡用）。
    -- 真机导入后 guid 会被重编号 ⇒ 这里传的是**已探测解析过的**运行期值（可能为 nil，fx 内部要能降级）。
    tpl = { card = TPL_CELL, text = TPL_TEXT },
    -- 棋盘矩形（本地坐标，中心原点）：环波/描边/边缘光按它定位与限幅，
    -- 否则 1600×900 上会画出直径 900 的大圈，糊到左右两栏（2026-10-29 出图实测）。
    -- 双盘模式（AI 对抗 / 双人对战 / 双人合作）：玩家盘不在屏幕中心，特效必须跟着走
    boardRect = { w = COLS * PITCH, h = ROWS * PITCH, cell = CELL, cols = COLS, rows = ROWS,
      cx = (ACTIVE[2] and G[ACTIVE[1]] == G[1]) and -280 or 0,
      cy = 0 },
    -- 名卡自带「角色名 + 技能名」（比 topBanner 的文案标题更informative），所以 cast 时
    -- main 不再往 topBanner 写同名标题（否则同一句在屏上出现两次）
    bannerText = true,
    -- 音效统一由 main 的 SFX.skill[role] / SFX.skillFail 播，fx 侧不要再自己播 burst 音
    quiet = true,
  })
  if ok and inst then
    FN.FX = inst
    print('fx engine ok')
  else
    print('fx engine fail :: ' .. tostring(inst))
  end
  return FN.FX
end

-- 一屏两行文案（上行=角色·技能名 + 主题色；下行=一句人话）——所有技能事件的唯一文字出口
-- 顶部横幅统一样式：位置贴顶、宽度留边、字号固定（否则长句会被框宽裁掉半句，
-- 且在移动端会落到屏幕正中横穿棋盘 —— 2026-10-29 出图实测「小草神纳西妲正看着你的盘面…再不」被裁一半）。
FN.topBannerStyle = function(size)
  local W, H = CANVAS_W or 1600, CANVAS_H or 900
  local w = W - 120
  tryCall(topBanner, 'SetSizeDelta', w, math.max(44, (size or 26) * 1.6 + 8))
  tryCall(topBanner, 'SetAnchoredPosition', 0, H / 2 - 36)
  trySet(topBanner, 'fontSize', size or 26)
  trySet(topBanner, 'horizontalAlignment', 'Middle')
  trySet(topBanner, 'verticalAlignment', 'Middle')
end

FN.skillText = function(role, title, body, dur)
  local col = FN.skillInk(role)
  if title then
    FN.topBannerStyle(26)
    setText(topBanner, title)
    trySet(topBanner, 'fontColor', col)
    FN.SK.topT = dur or 1.8
  end
  if body then
    setText(botBanner, body)
    bannerTimer = math.max(bannerTimer or 0, dur or 1.8)
  end
end

-- 反馈四件套（文案/色/特效/音效）唯一出口：任何技能路径都必须经过这里
-- 天赋效果派发（v6）：skills.lua 只出「要发生什么」，改盘面在 main 这边做。
-- kind 全集：clear-top / clear-bottom / garbage-push（单人/无对手降级 clear-bottom）/ clear-col
-- UTF-8 安全截断（sub 按字节切会把中文切成半个字符，用例会报 invalid utf8）
FN.utf8Cut = function(str, bytes, tail)
  local t = tostring(str or '')
  if #t <= bytes then return t end
  local cut = bytes
  while cut > 1 do
    local b = t:byte(cut + 1)
    if not b or b < 0x80 or b >= 0xC0 then break end
    cut = cut - 1
  end
  return t:sub(1, cut) .. (tail or '…')
end

FN.dispatchEffect = function(g0, ev)
  if not (g0 and ev) then return false end
  local kind, n = ev.kind, math.max(1, math.floor(tonumber(ev.n) or 1))
  if kind == 'garbage-push' then
    local opp = (G and G[1] == g0) and G[2] or G[1]
    if not opp or MODE == 'casual' then kind = 'clear-bottom'
    else
      if raiseGarbage then pcall(raiseGarbage, opp, n) end
      print('talent push n=' .. n)
      return true
    end
  end
  local C2 = COLS or 6
  local function shiftDown()
    for r = 1, ROWS - 1 do g0.board[r] = g0.board[r + 1] end
    g0.board[ROWS] = {}
    for c = 1, C2 do g0.board[ROWS][c] = 0 end
  end
  local function shiftUp()
    for r = ROWS, 2, -1 do g0.board[r] = g0.board[r - 1] end
    g0.board[1] = {}
    for c = 1, C2 do g0.board[1][c] = 0 end
  end
  if kind == 'clear-top' then
    for _ = 1, n do shiftDown() end
  elseif kind == 'clear-bottom' then
    for _ = 1, n do shiftUp() end
  elseif kind == 'clear-col' then
    local col = math.max(1, math.min(C2, math.floor(tonumber(ev.col) or 1)))
    local hit = 0
    for r = ROWS, 1, -1 do
      if g0.board[r] and g0.board[r][col] ~= 0 and hit < n then g0.board[r][col] = 0; hit = hit + 1 end
    end
  end
  print('talent fx kind=' .. tostring(kind) .. ' n=' .. n)
  if ev.anchor then print(tostring(ev.anchor)) end   -- 天赋专属锚（设计书 §6.6：一行日志独立证明该天赋触发）
  if FN.renderAll then pcall(FN.renderAll, g0) end
  return true
end

FN.skillFeedback = function(role, kind, data)
  data = data or {}
  local col = FN.skillColor(role)
  local nm, sk = FN.skillName(role), FN.skillSkill(role)
  local CP, FXU = FN.COPY, FN.fxInit()
  local title, body = data.title, data.body
  if (not title) and CP then
    local snap = (SKILLS and SKILLS.snapshot and SKILLS.snapshot(SK)) or {}
    local ctx = { mode = MODE, lv = snap.lv or 1, tier = data.tier or snap.tier or 1,
      left = data.left, n = data.n, lines = data.lines, garbage = data.garbage }
    local fn = (kind == 'fail' and CP.fail) or (kind == 'end' and CP.settle)
      or (kind == 'level' and CP.level) or (kind == 'unlock' and CP.unlock) or CP.cast
    if type(fn) == 'function' then
      local ok, t = pcall(fn, role, ctx)
      if ok and type(t) == 'table' then title, body = t.title or title, t.body or body end
    end
  end
  if not title then title = nm .. ' · ' .. sk end
  if not body then body = (kind == 'fail') and '还差一点，再等等。' or '契约定下——这一手交给我。' end
  -- cast/level/unlock 的"标题"由名卡承担（fx.banner 里画 角色名·技能名），这里只写正文，
  -- 避免同一句在屏上出现两次（用户历史反馈过"双影"）。fail/end 没有名卡 ⇒ 标题照写。
  -- ⚠ Lua 陷阱：`cond and nil or title` 永远等于 title（and/or 链的经典坑）——这里必须用 if
  local cardKinds = (kind == 'cast' or kind == 'level' or kind == 'unlock')
  local topTitle = title
  if cardKinds then topTitle = nil end
  FN.skillText(role, topTitle, body, data.dur or 1.8)
  if SFX and sfx then
    local id = SFX.skill and SFX.skill[role]
    if kind == 'fail' then id = SFX.skillFail or id end
    sfx(id or SFX.level, true)
  end
  -- v5.4：准备/倒计时屏（guideStage==3）**不放特效名卡**——席位键位卡就摆在盘下那条带子上，
  -- 名卡一出现就压在 P1 键位卡上（07/10 出图实测：一块「少女」空卡盖住半行键位）。
  -- 卡片是局内反馈，准备期只留文案（topBanner 已写），倒计时结束后第一帧起才允许出卡。
  local readyPhase = (guideStage == 3)
  if FXU and not readyPhase then
    pcall(function()
      -- 名卡只放「角色名 + 技能名」：正文已经由 topBanner/botBanner（服务端 textbox）承载，
      -- 名卡再写一遍就是双影（2026-10-29 用户点过"文字挤压/双影"的历史坑）
      FXU.banner(role, nm, sk, data.dur or 1.4)
      FXU.burst(data.fxkind or (kind == 'fail' and 'flash' or 'ring'),
        { role = role, color = col, n = data.n or 10 })
      if kind ~= 'fail' then
        FXU.boardOutline(role, 0.7)
        FXU.edgeGlow(role, 1.0)
      end
    end)
  end
  FN.SK.lastKind, FN.SK.lastRole = kind, role
  print('skill fx kind=' .. tostring(kind) .. ' role=' .. tostring(role)
    .. ' fx=' .. ((FXU and 'on') or 'off') .. ' copy=' .. ((CP and 'on') or 'off'))
end

-- 施放失败也要给足反馈（用户原话：技能按钮按下去必须有反应；不是四个字"能量不足"）
FN.skillFail = function(role, why, n)
  local body
  n = tonumber(n) or 0
  if why == 'cd' then
    body = '技能还在冷却 · 还要 ' .. string.format('%.1f', n) .. ' 秒'
  elseif why == 'energy' then
    body = '能量不够 · 还差 ' .. tostring(math.floor(n + 0.5)) .. ' 点'
  elseif why == 'not-in-party' then
    body = '这个角色不在本局队伍里（一局最多两人）'
  else
    body = '这个角色还没和你缔结契约'
  end
  local col = FN.skillColor(role)
  FN.skillText(role, nil, body, 1.5)
  if SFX and sfx then sfx(SFX.skillFail or SFX.over, true) end
  local FXU = FN.fxInit()
  if FXU then
    pcall(function()
      FXU.shake(6, 0.16)
      FXU.floatText(body, FN.fxBoardX(), -330, FN.skillInk(role), 22, 1.3)
    end)
  end
  print('skill fail role=' .. tostring(role) .. ' why=' .. tostring(why) .. ' n=' .. string.format('%.2f', n))
end

-- 解锁计数（会话内累计；模块只认 "k:v,k:v" 字符串，见 skills.lua parseReason）
FN.skillCount = function(k, v)
  if not SK then return end
  SK.cnt = SK.cnt or {}
  SK.cnt[k] = (SK.cnt[k] or 0) + (v or 1)
end

-- 解锁检查：把累计计数喂给模块，解锁后按 partyMax 自动入队（满 2 人时只解锁不入队）
FN.skillUnlockTick = function()
  if not (SK and SKILLS and SKILLS.tryUnlock) then return end
  local c = SK.cnt or {}
  local reason = 'lines:' .. tostring(c.lines or 0) .. ',games:' .. tostring(c.games or 0)
    .. ',tetris:' .. tostring(c.tetris or 0) .. ',pvp:' .. tostring(c.pvp or 0)
    .. ',time:' .. tostring(c.time or 0)
  for _, role in ipairs(SK.roles or {}) do
    if SK.unlocked and SK.unlocked[role] ~= true then
      local ok, why = SKILLS.tryUnlock(SK, role, reason)
      if ok then
        print('skill unlock role=' .. role .. ' ok=true why=' .. tostring(why)
          .. ' party=' .. tostring(#(SK.party or {})))
        -- v5.4：解锁检查在 newGame 里跑（准备屏之前）⇒ 名卡会正好糊在新摆的席位键位卡上。
        -- 改成**排队**：先记下角色，等真正进局（guideStage==1）由 skillTick 首帧补播。
        FN.SK.pendingUnlock = role
        FN.skillHud()
      end
    end
  end
end

-- HUD：两格技能状态（名字+状态+能量条）。控件由 ui.lua 建；不在就退回左栏 hint 文本。
FN.skillHud = function()
  if not (SK and SKILLS and SKILLS.snapshot) then return end
  -- 只有局内才写技能 HUD 文字：标题/结算/名册页把文字清空（控件本身的显隐由 ui.lua 的逐屏布局负责，
  -- 但真机 SetVisible 对实例靠不住，所以这里至少保证"文字不会留在标题页上"）
  if guideStage ~= 1 or (FN.overlayOpen and FN.overlayOpen()) then
    -- 局外**或浮层打开**（角色页/帮助页/结算）：不仅清字，**整簇挪出画布**
    -- —— 用户 2026-10-30 图上那根"最右边的线"就是 skRole 的底条，guideStage==1 时没被 park。（实测 4:3 标题页上 sk1card 那块白板压在「2 AI 对抗」卡上，
    -- 因为 ui.lua 的 title 计划没有 park 技能簇）。ui.lua 在进局时按 screen 重新摆位，回来不受影响。
    for i = 1, 2 do
      local pre = (i == 1) and 'sk1' or 'sk2'
      local cn, cs, cb = findIn(root, { pre .. 'name' }), findIn(root, { pre .. 'state' }),
        findIn(root, { pre .. 'bar' })
      if cn then setText(cn, '') tryCall(cn, 'SetAnchoredPosition', 0, -4000) end
      if cs then setText(cs, '') tryCall(cs, 'SetAnchoredPosition', 0, -4000) end
      if cb then trySet(cb, 'fillAmount', 0) tryCall(cb, 'SetAnchoredPosition', 0, -4000) end
      for _, nm in ipairs({ pre .. 'card', pre .. 'strip', pre .. 'barBg' }) do
        local c = findIn(root, { nm })
        if c then tryCall(c, 'SetAnchoredPosition', 0, -4000) end
      end
    end
    FN.SK.hudTxt = nil
    FN.SK.parked = true
    return
  end
  if FN.SK.parked then
    -- 回到局内：让 ui.lua 重新摆一次（regScreen 同一屏不会重排，这里直接触发一次 layout）
    FN.SK.parked = nil
    if UI4 and UI4.layout then pcall(UI4.layout) end
  end
  local snap = SKILLS.snapshot(SK) or {}
  local party = SK.party or {}
  local parts = {}
  -- HUD 两格的语义：**第 1 格永远是台前角色**（snap.active），第 2 格是队伍里另一个人。
  -- 旧实现按 party[1]/party[2] 固定取：调试解锁 4 人后 active=3（甘雨）时 HUD 还在显示
  -- 纳西妲/刻晴，玩家会以为"台前"是空的（2026-10-29 出图实测，ganyu 帧上两格都没有 ▲）。
  local slots = {}
  do
    local act = snap.active
    if act and act ~= '' then slots[1] = act end
    for i = 1, #party do
      if party[i] ~= act then slots[2] = party[i] break end
    end
    if not slots[1] then slots[1] = party[1] end
  end
  for i = 1, 2 do
    local role = slots[i]
    if role then
      local nm = FN.skillName(role)
      local cd = (SK.cd and SK.cd[role]) or 0
      local en = (SK.energy and SK.energy[role]) or 0
      local lv = (SK.lv and SK.lv[role]) or 1
      local state
      if SK.take and SK.take.role == role then
        state = '接管中 ' .. string.format('%.1f', SK.take.t) .. 's'
      elseif cd > 0 then
        state = 'CD ' .. string.format('%.1f', cd) .. 's'
      elseif SK.cost and (SK.cost[role] or 0) > 0 and en < (SK.cost[role] or 0) then
        state = '能量 ' .. tostring(math.floor(en + 0.5))
      else
        state = '就绪'
      end
      parts[#parts + 1] = nm .. ' Lv' .. lv .. ' ' .. state
      -- 控件双写（ui.lua 建的实例；用不到就静默跳过）
      local sfx1 = (i == 1) and 'sk1' or 'sk2'
      local cName = findIn(root, { sfx1 .. 'name' })
      local cState = findIn(root, { sfx1 .. 'state' })
      local cBar = findIn(root, { sfx1 .. 'bar' })
      local col = FN.skillColor(role)
      local active = (snap.active == role)
      -- v5.5（用户二轮反馈）：台前/台后**不写文字**，用卡面亮度 + 左侧色条表达。
      -- 侧边色条在「大招可放」时转描金 ⇒ 玩家一眼看到"谁的 Q 好了"，不用读字。
      local cost2 = (SK.cost and SK.cost[role]) or 0
      local qReady = (cost2 > 0) and (cd <= 0) and (en >= cost2)
      local cardCtl = findIn(root, { sfx1 .. 'card' })
      if cardCtl then
        -- 卡面必须真的看得出是"一张卡"（浅底近白在浅底背景上等于没有）：
        -- 台前=奶油白 + 实底；台后=同色但压暗 8%，靠亮度差表达前后台
        trySet(cardCtl, 'imageColor', active and C(255, 252, 246, 252) or C(255, 234, 231, 244))
      end
      local stripCtl = findIn(root, { sfx1 .. 'strip' })
      if stripCtl then
        trySet(stripCtl, 'imageColor', qReady and THEME.gold
          or (active and FN.skillInk(role) or C(255, 186, 192, 202)))
        -- 左侧竖条加宽到 8px、贴到卡片左沿（6px 时被卡片边吃掉，看不出是"角色色标签"）
        tryCall(stripCtl, 'SetSizeDelta', 8, 76)
      end
      if cName then
        -- v5.5（用户 2026-10-30 二轮反馈：「前后台和已就绪的说明增加玩家负担，用特效和动画区分」）：
        -- 名字行只留**角色名**（键位标签在可点时才有意义）；台前/台后靠卡面亮度+描边+能量条表达。
        setText(cName, nm)
        trySet(cName, 'fontColor', active and FN.skillInk(role) or C(190, 96, 108, 126))
      end
      if cState then
        -- v6：把「倍率 + 生效中的天赋」写进台前角色的状态行（玩家要能看到自己吃到了什么加成）
        local extra = ''
        if active then
          local mult = tonumber(snap.mult) or 1
          if mult > 1.001 then extra = extra .. string.format('　×%.2f', mult) end
          local bl = snap.buff
          if type(bl) == 'table' and #bl > 0 then
            local picks = {}
            for bi = 1, math.min(2, #bl) do
              local b = bl[bi]
              picks[#picks + 1] = tostring(b.label) .. ' ' .. string.format('%.1f', tonumber(b.left) or 0) .. 's'
            end
            if #picks > 0 then extra = extra .. '　' .. table.concat(picks, ' · ') end
          end
        end
        -- v5.5：「就绪」不再写字（玩家不需要读"已就绪"），只有真需要等待时才出字：
        -- CD 倒计时 / 充能百分比 / 接管剩余。台前/后台不写文字，靠卡面区分。
        local short
        if state == '就绪' then
          short = extra   -- 只保留天赋/倍率这类**新信息**
        elseif SK.take and SK.take.role == role then
          short = '接管 ' .. string.format('%.1f', SK.take.t) .. 's' .. extra
        elseif cd > 0 then
          short = 'CD ' .. string.format('%.1f', cd) .. 's' .. extra
        else
          short = '充能 ' .. tostring(math.floor((en / math.max(1, (SK.cost and SK.cost[role]) or 1)) * 100)) .. '%' .. extra
        end
        setText(cState, short)
        trySet(cState, 'fontColor', active and FN.skillInk(role) or C(200, 96, 108, 126))
      end
      if cBar then
        local ratio = math.max(0, math.min(1, en / 100))
        trySet(cBar, 'fillAmount', ratio)
        trySet(cBar, 'imageColor', col)
      end
    else
      local cName = findIn(root, { (i == 1) and 'sk1name' or 'sk2name' })
      if cName then setText(cName, '') end
      local cState = findIn(root, { (i == 1) and 'sk1state' or 'sk2state' })
      if cState then setText(cState, '') end
      local cBar = findIn(root, { (i == 1) and 'sk1bar' or 'sk2bar' })
      if cBar then trySet(cBar, 'fillAmount', 0) end
    end
  end
  local txt = table.concat(parts, '｜')
  if txt == '' then txt = 'Z 技能 · Y 换人' end
  -- 有实例控件时不再抢左栏 hint（否则每秒把玩法提示刷掉一次，玩家看不到操作提示）
  if FN.SK.hasCtrl ~= true then
    FN.SK.hasCtrl = (findIn(root, { 'sk1name' }) ~= nil)
  end
  if FN.SK.hudTxt ~= txt then
    FN.SK.hudTxt = txt
    if not FN.SK.hasCtrl and guideStage == 1 and not helpOpen then setText(hint, txt) end
    print('skill hud ' .. txt)
  end
end

-- 施放：门禁在 skills.lua（锁定→CD→能量），本层只做「效果 + 反馈」
FN.skillCast = function(slot)
  if not (SK and SKILLS and SKILLS.cast) then
    print('skill cast skipped (no skills module)')
    return false
  end
  if not g or g.gameOver or MODE_OVER then return false end
  if guideStage ~= 1 then
    -- 标题页按 Z 也要有回音（否则玩家会以为键位坏了）
    if SFX and sfx then sfx(SFX.hover, true) end
    print('skill cast ignored outside play stage=' .. tostring(guideStage))
    return false
  end
  local role = FN.skillRoleOf(slot)
  local opp = (g == G[2]) and G[1] or G[2]
  local oppH = 0
  if opp and opp.board then
    for r = 1, ROWS do
      local hitRow = false
      for c = 1, COLS do
        if opp.board[r][c] ~= 0 then hitRow = true break end
      end
      if hitRow then oppH = ROWS - r + 1 break end
    end
  end
  -- v6 施放上下文：col（当前块列）/ holdSec（本块已被按住多久）/ longestEmptyCol（最空列）
  -- —— 刻晴「长按·跨地形」「雷楔·二段」与少女推层都要读它们（设计书 §6.2）
  local curCol = (g.piece and g.piece.x) or 1
  local holdSec = tonumber(FN.skillKeyHoldSec) or 0   -- 按住 Z 的秒数（不是方块存活时间）
  local emptyBest, emptyBestH = 1, -1
  for cc = 1, (COLS or 6) do
    local h2 = 0
    for rr = 1, ROWS do if g.board[rr] and g.board[rr][cc] ~= 0 then h2 = h2 + 1 end end
    if emptyBestH < 0 or h2 < emptyBestH then emptyBestH, emptyBest = h2, cc end
  end
  local res = SKILLS.cast(SK, role, { mode = MODE, boardH = AEVX.stackHeight(), oppH = oppH,
    now = g.elapsed or 0, col = curCol, holdSec = holdSec, longestEmptyCol = emptyBest,
    keyHold = (FN.skillKeyHoldSec or 0) })
  print('skill cast slot=' .. tostring(slot) .. ' role=' .. role .. ' ok=' .. tostring(res.ok)
    .. ' effect=' .. tostring(res.effect) .. ' why=' .. tostring(res.why) .. ' n=' .. tostring(res.n))
  if not res.ok then
    FN.skillFail(role, res.why, res.n)
    return false
  end
  local pr = (SKILLS.params and SKILLS.params(SK, role)) or {}
  local eff = tostring(res.effect or ''):gsub('_', '-')
  FN.skillFeedback(role, 'cast', { tier = res.tier, n = res.n,
    fxkind = (eff == 'ai-takeover') and 'vine' or (eff == 'blink' and 'bolt')
      or (eff == 'freeze' and 'frost') or (eff == 'ripple' and 'wave') or 'ring' })
  if eff == 'ai-takeover' then
    -- 纳西妲：把盘面交给智慧之神。⚠ 接管状态**不再只给 casual**用（v4.0 的 bug：
    -- ai-battle/pvp/coop 里 TK.state='ai' 没有消费方 ⇒ 按 Z 完全没反应，用户实测就撞这个）
    local tier = res.tier or pr.aiTier or 1
    local dur = tonumber(res.takeDur) or pr.aiDur or 6
    TK.state, TK.t = 'ai', 0
    local lvIdx = FN.aiLevelIdxOfTier(tier)
    TK.skillTier, TK.skillT = lvIdx, dur
    FN.SK.take = { role = role, t = dur, tier = tier, lvIdx = lvIdx, total = dur, n = res.n }
    print('skill ai start tier=' .. tostring(tier) .. ' lvidx=' .. tostring(lvIdx)
      .. ' dur=' .. tostring(dur) .. ' mode=' .. tostring(MODE))
    local FXU = FN.fxInit()
    local tierName = ({ '陪练', '标准', '全力' })[lvIdx] or '标准'
    -- 名卡已写「角色名·技能名」，档位/时长落成棋盘下方一行浮字（不压棋盘）
    if FXU then pcall(function()
      FXU.floatText(tierName .. '代打 · ' .. string.format('%.0f', dur) .. ' 秒',
        FN.fxBoardX(), -330, FN.skillInk(role), 26, 1.8)
    end) end
  elseif eff == 'blink' then
    -- 刻晴：雷楔瞬闪——当前块瞬间落到本列最低位并锁定
    if g.piece then
      local dropped = 0
      while not collides(g.piece.cells, g.piece.x, g.piece.y + 1) do
        g.piece.y = g.piece.y + 1
        dropped = dropped + 1
      end
      print('skill blink col=' .. tostring(g.piece.x) .. ' rows=' .. dropped)
      local FXU = FN.fxInit()
      if FXU then pcall(function()
        FXU.floatText('雷楔 · 瞬落 ' .. tostring(dropped) .. ' 格', FN.fxBoardX(), -330,
          FN.skillInk(role), 26, 1.6)
      end) end
      doLock()
    end
  elseif eff == 'blink-best' then
    -- 刻晴「长按·跨地形」：按住 ≥0.35s 松手 → 把当前块瞬移到**最空的一列**再落底
    -- （旧实现没有这个分支，落到 'skill effect todo=' ⇒ 长按等于没功能）
    if g.piece then
      -- 最空的一列（列高最小者）；同高取靠左，保证确定性
      local target, bestH = 1, -1
      for cc = 1, (COLS or 6) do
        local h3 = 0
        for rr = 1, ROWS do if g.board[rr] and g.board[rr][cc] ~= 0 then h3 = h3 + 1 end end
        if bestH < 0 or h3 < bestH then bestH, target = h3, cc end
      end
      local guard = 0
      while g.piece.x ~= target and guard < (COLS or 6) + 2 do
        local dir = (g.piece.x < target) and 1 or -1
        if not collides(g.piece.cells, g.piece.x + dir, g.piece.y) then g.piece.x = g.piece.x + dir end
        guard = guard + 1
      end
      local dropped = 0
      while not collides(g.piece.cells, g.piece.x, g.piece.y + 1) do
        g.piece.y = g.piece.y + 1
        dropped = dropped + 1
      end
      print('skill blink-best target=' .. tostring(g.piece.x) .. ' rows=' .. tostring(dropped))
      local FXU2 = FN.fxInit()
      if FXU2 then pcall(function()
        FXU2.floatText('雷楔 · 跨地形 → 第 ' .. tostring(g.piece.x) .. ' 列', FN.fxBoardX(), -330,
          FN.skillInk(role), 26, 1.8)
      end) end
      doLock()
    end
  elseif eff == 'freeze' then
    -- 甘雨：冰封——冻结期内玩家盘不吃垃圾（raiseGarbage 读 SK.freezeT）
    SK.freezeT = pr.freezeSec or 3
    SK.freezeRows = res.n or pr.freezeRows or 3
    print('skill freeze rows=' .. tostring(SK.freezeRows) .. ' sec=' .. tostring(SK.freezeT))
  elseif eff == 'ripple' then
    -- 少女：引力涟漪——对抗里真的把垃圾推给对手（v4.0 这里只打一行文案，等于没做）
    local layers = res.n or 2
    if opp and (MODE == 'ai-battle' or MODE == 'pvp' or MODE == 'coop') then
      pcall(raiseGarbage, opp, math.min(layers, 4))
      print('skill ripple push n=' .. tostring(layers) .. ' to=opp')
    else
      -- 单人降级：清盘底一行 + 浮字（不留"按了没反应"）
      table.remove(g.board, ROWS)
      local nr = {}
      for c = 1, COLS do nr[c] = 0 end
      table.insert(g.board, 1, nr)
      renderAll()
      print('skill ripple solo clear=1')
    end
  elseif eff == 'clear-bottom' or eff == 'gravity-clear' then
    local rows = math.min(res.n or pr.clearRows or 1, ROWS)
    for _ = 1, rows do
      table.remove(g.board, ROWS)
      local nr = {}
      for c = 1, COLS do nr[c] = 0 end
      table.insert(g.board, 1, nr)
    end
    renderAll()
    print('skill clear_bottom rows=' .. rows)
    local FXU = FN.fxInit()
    if FXU then pcall(function() FXU.burst('shard', { role = role, n = rows * 4 }) end) end
    if SKILLS.addExp then pcall(SKILLS.addExp, SK, role, (NUM and NUM.EXP_EFFECT) or 25) end
  elseif eff == 'mark-blink' then
    print('skill mark_blink n=' .. tostring(res.n))
  else
    print('skill effect todo=' .. tostring(res.effect))
  end
  -- 用户核心设计（2026-10-29 第 3 点）：「哪个技能用得多、加点更多，就获得更好的效果」。
  -- v4.0 只在消行时加经验 ⇒ 偏爱某个角色但少消行时她永远不强。施放本身必须给经验。
  if SKILLS.addExp then
    local up = SKILLS.addExp(SK, role, (SKILLS.NUM and SKILLS.NUM.EXP_SKILL) or 10)
    if up and up.leveled then
      print('skill levelup role=' .. tostring(role) .. ' lv=' .. tostring(up.lv)
        .. ' node=' .. tostring(up.node))
      FN.skillFeedback(role, 'level', { title = FN.skillName(role) .. ' · Lv' .. tostring(up.lv),
        body = '手感越来越熟——' .. FN.skillSkill(role) .. '又强了一档。', dur = 2.0 })
    end
  end
  FN.skillHud()
  return true
end

-- Y：换台前（模块没有 switchRole ⇒ active 是 party 的 1-based 下标，翻一格）
-- v5.5（用户 2026-10-30 二轮反馈：原神式换人）：
-- 切人有 1s CD；点后台角色卡 = 换人，若她的大招充能好了则「换人 + 立刻放大招」。
FN.skillSwitchTo = function(role)
  if not (SK and SK.party and #SK.party > 0 and role) then return false end
  local activeRole = SK.party[SK.active or 1]
  if role == activeRole then return false end
  local now = (g and g.elapsed) or 0
  if (SK.switchAt or -99) + 1.0 > now then
    print('skill switch blocked cd')
    return false
  end
  SK.switchAt = now
  for i = 1, #SK.party do
    if SK.party[i] == role then SK.active = i break end
  end
  print('skill switch ok=true active=' .. tostring(SK.active) .. ' role=' .. tostring(role))
  FN.skillHud()
  if SFX and sfx then sfx(SFX.press, true) end
  FN.skillFeedback(role, 'switch', { title = FN.skillName(role) .. ' · 走马上任',
    body = '换你来了。', dur = 1.0 })
  return true
end

-- 点技能卡：台前=放 E（Z）；台后=换人（Q 好了就连着放大招）
FN.skillAreaTap = function(i)
  if not (SK and SK.party and SK.party[i]) then return end
  local role = SK.party[i]
  local activeRole = SK.party[SK.active or 1]
  if role == activeRole then
    if FN.skillCast then FN.skillCast(1) end
    return
  end
  local cd = (SK.cd and SK.cd[role]) or 0
  local en = (SK.energy and SK.energy[role]) or 0
  local cost = (SK.cost and SK.cost[role]) or 0
  local qReady = (cost > 0) and (cd <= 0) and (en >= cost)
  FN.skillSwitchTo(role)
  if qReady and FN.skillCast then FN.skillCast(2) end
end

FN.skillSwitch = function()
  if not (SK and SK.party and #SK.party > 0) then return false end
  local now2 = (g and g.elapsed) or 0
  if (SK.switchAt or -99) + 1.0 > now2 then
    print('skill switch blocked cd')
    return false
  end
  SK.switchAt = now2
  local n = #SK.party
  SK.active = ((SK.active or 1) % n) + 1
  local role = SK.party[SK.active]
  print('skill switch ok=true active=' .. tostring(SK.active) .. ' role=' .. tostring(role))
  FN.skillHud()
  if SFX and sfx then sfx(SFX.press, true) end
  FN.skillFeedback(role, 'switch', { title = FN.skillName(role) .. ' · 走马上任',
    body = (n > 1) and '换你来接这一手——按 Z 用她的手段。' or '队伍里只有她一人。', dur = 1.2 })
  return true
end

-- 技能计时（冻结/接管倒计时 + 特效推进 + 上横幅回收）。由 OnUpdate 每帧调一次。
FN.skillTick = function(dt)
  local FXU = FN.FX
  if FXU and FXU.update then pcall(FXU.update, dt) end
  -- v5.4：准备期排队下来的解锁播报，进局后补播（此时名卡不会压席位键位卡）
  if FN.SK.pendingUnlock and guideStage == 1 then
    local r = FN.SK.pendingUnlock
    FN.SK.pendingUnlock = nil
    -- v5.5：解锁播报**不占底栏**（底栏是常驻键位提示位）——只走上横幅 + 名卡，2.4s 后自动收。
    FN.skillText(r, FN.skillName(r) .. ' · 契约缔结', nil, 2.4)
    if FN.FX and FN.FX.banner then pcall(FN.FX.banner, r, FN.skillName(r), '契约缔结', 1.6) end
    FN.skillHud()
  end
  if FN.SK.topT and FN.SK.topT > 0 then
    FN.SK.topT = FN.SK.topT - dt
    if FN.SK.topT <= 0 then
      FN.SK.topT = 0
      setText(topBanner, '')
    end
  end
  -- 解锁条件里的 time 计数（skills.lua UNLOCK.ganyu.time=300 秒）：按秒累计，别每帧写表
  if guideStage == 1 and not MODE_OVER then
    FN.SK.timeAcc = (FN.SK.timeAcc or 0) + dt
    if FN.SK.timeAcc >= 1 then
      local add = math.floor(FN.SK.timeAcc)
      FN.SK.timeAcc = FN.SK.timeAcc - add
      FN.skillCount('time', add)
    end
  end
  local take = FN.SK.take
  if take then
    take.t = take.t - dt
    -- 持续期文案：每 2.4s 换一句（COPY.hold），让"接管中"不是一行字挂 6 秒。
    -- 第 4 参数 = 本次施放的效果量纲（纳西妲=AIdur、少女=层数），供 copy 里读具体数字。
    take.msgT = (take.msgT or 0) - dt
    if take.msgT <= 0 and take.t > 0.8 then
      take.msgT = 2.4
      local CP = FN.COPY
      if CP and CP.hold then
        local ok, r = pcall(CP.hold, take.role, take.total - take.t, take.t, take.n)
        if ok and type(r) == 'table' and r.body then
          setText(botBanner, tostring(r.body))
          bannerTimer = math.max(bannerTimer or 0, 2.2)
          print('skill hold role=' .. tostring(take.role)
            .. ' left=' .. string.format('%.1f', take.t) .. ' n=' .. tostring(take.n))
        end
      end
    end
    if take.t <= 0 then
      FN.SK.take = nil
      TK.state, TK.t, TK.skillT, TK.skillTier = 'play', 0, nil, nil
      FN.skillFeedback(take.role, 'end', { title = FN.skillName(take.role) .. ' · 收手',
        body = '接下来的路，你自己走。', dur = 1.6 })
      print('skill ai end role=' .. tostring(take.role))
    end
  end
end
-- @region skill-system END (writer: lead)
-- @region ui-roster BEGIN (writer: ui-mobile)
-- ===== v4.0 ③ 角色名册（契约与解锁进度）=====
-- 用户口径：「四个角色，初始就只解锁小草神的部分机制吧，剩下的设计一定的条件在解锁」
-- ⇒ 条件判定在 skills.lua，本层负责**让人看得见**（不然玩家永远不知道自己差多少）。
-- ===== 角色档案页已拆到 lua/tetris/roster.lua（main chunk 的 200-local 上限逼的）=====
-- ROSTER 仍是 main 的脚本全局（浮层判定/画布轮询/输入守卫都在读它），模块只是往这张表里填函数。
ROSTER = { on = false, items = {} }
do
  local RM = loadModule('roster')
  local okm = RM and RM.new({
    FN = FN, C = C, THEME = THEME, CP = FN.COPY, sk = function() return SK end,
    -- CTL 是懒创建的（在 MS.build 里），必须用 getter 传，否则模块拿到的是 nil
    ctl = function() return CTL end,
    SKILLS = SKILLS, NUM = NUM, UI4 = UI4,
    game = game, setText = setText, trySet = trySet, tryCall = tryCall, addCursor = addCursor,
    roster = ROSTER, canvas = function() return CANVAS_W or 1600, CANVAS_H or 900 end,
    canvasH = function() return CANVAS_H or 900 end,
  })
  if not okm then print('roster module FAIL（角色页禁用）') end
end

FN.enterMode = function()
  -- v5.4 修「准备屏上残留标题演示的角色名卡」：标题页 demo 循环会放技能（名卡/环波），
  -- 玩家选中模式后这些特效还有 0.5~1.2s 才自然到期 ⇒ 准备态画面左下角挂着一块「少女」空卡，
  -- 正好压在新摆的 P1 键位卡上（07/10 出图实测）。进模式即清场，特效池全部归位。
  if FN.FX then pcall(FN.FX.clear) end
  if MODE == 'ai-battle' or MODE == 'pvp' or MODE == 'coop' then
    if MODE ~= 'pvp' then NUM.AI_LEVEL = 3 end   -- ai-battle/coop AI 盘=hard；pvp 无 AI 盘不动档
    G[2] = newInst(true)
    ACTIVE = { 1, 2 }
    MIRRORQ = {}                          -- 清镜像队列（复局防串）
    local save = g
    g = G[2]
    -- AI 盘账本走 AI 账（T4 语义）；pvp 双玩家盘各自计分。
    -- v2.7：账本归属写成**盘属性** aiAccount（aiDrop 里按它决定 autoDriving），autoDriving 只作兼容保留。
    g.autoDriving = (MODE ~= 'pvp')
    g.aiAccount = (MODE ~= 'pvp')
    newGame()                             -- 建板+状态复位；G[2] 不取块（newGame 内双屏分支）
    g = G[1]
    newGame()                             -- 主盘同起点重开（丢自演半盘）；首块 spawn→push→喂 G[2]
    local okBuild = buildBoardControls(G[2])
    if okBuild then FN.layoutDual() else print('p2 build fail') end
    print('p2 inst ' .. MODE)             -- 双屏日志 p2 前缀
    g = save
  else
    G[2] = nil
    ACTIVE = { 1 }
  end
end

-- exitToMenu：非 casual 模式的 R=回标题菜单（清 AI 盘/镜像队列，回 stage0 演出）。
FN.exitToMenu = function()
  MODE_OVER = false                    -- v2.2 ③：终局标志复位（R 回菜单）
  for i = 1, #DUAL_DECO do             -- v2.4 ③：拆中缝装饰（防实例累积）
    if DUAL_DECO[i] then pcall(function() game.DestroyClientUIControl(DUAL_DECO[i]) end) end
    DUAL_DECO[i] = nil
  end
  if G[2] then
    settleDestroy()                       -- 若 G[2] 建过结算层（首版不会，防御性）
    destroyBoardControls(G[2])            -- 销毁 p2 棋盘控件（防 430 上限累积）
    G[2] = nil
  end
  ACTIVE = { 1 }
  MIRRORQ = {}
  MODE = 'casual'
  g = G[1]
  placeBoard(G[1], 0)                     -- 主盘棋盘回画布中心
  if G[1].preview then                    -- preview 回原位（next 右栏 / hold 左栏）
    for i = 1, 4 do tryCall(G[1].preview[i], 'SetAnchoredPosition', 400, 175) end
    for i = 5, 8 do tryCall(G[1].preview[i], 'SetAnchoredPosition', 400, 100) end
    for i = 9, 12 do tryCall(G[1].preview[i], 'SetAnchoredPosition', -400, 175 - (i - 9) * 22) end
  end
  if CANVAS_W and CANVAS_H then
    local okL, errL = pcall(layout, CANVAS_W, CANVAS_H)   -- 服务端控件全量复位（title/hint/keyA-C 回 v1 布局）
    if not okL then print('relayout error :: ' .. tostring(errL)) end
  end
  guideStage = 0
  demoLoopReset()                         -- 复位主盘演出与横幅（含模式菜单文案）
  pcall(function() applyModeTheme('casual') end)   -- v2.7 ⑦：回标题=主题复位
  print('mode menu')                      -- 回菜单锚
end

-- restartMatch：结算页 [R] 再来一局 = **同一模式**再开一局（v2.7 用户反馈⑥）。
-- 旧语义是「非 casual 的 R = 回标题菜单」，与结算页文案「[R] 再来一局」矛盾——
-- 用户实测「按 R 没重开」，回标题统一走 [V]。这里复用既有链路，不新写一套重开逻辑：
--   casual：就地 newGame（v1 语义不变）；
--   双屏三模式：拆对家盘/装饰 → 回 stage0 → enterMode 重建 G[2] → startIfWaiting 进引导倒计时。
restartMatch = function()
  local mode = MODE
  MODE_OVER = false
  TK.state, TK.t = 'play', 0
  settleDestroy()
  if mode == 'casual' then
    newGame()
    -- v3.5 ⑥：结算期下架的战况列在这里必须显式上架——casual 重开只走 newGame，
    -- 不经过 startIfWaiting/layoutDual（那两条才负责还原显隐）⇒ 漏这一步 = 重开后 HUD 整片空白。
    if HUD_INST.showStats then HUD_INST.showStats() end
    -- 同一处把常驻文案也补回来：结算时 setText(botBanner,'')/清 hint，重开若只 newGame，
    -- 底栏键位提示与左侧「堆满一行即消除」就一直空着（casual 重开不走 startIfWaiting）。
    setText(hint, '堆满一行即消除')
    showPersistTip()
  else
    for i = 1, #DUAL_DECO do
      if DUAL_DECO[i] then pcall(function() game.DestroyClientUIControl(DUAL_DECO[i]) end) end
      DUAL_DECO[i] = nil
    end
    if G[2] then
      settleDestroy()
      destroyBoardControls(G[2])          -- 防 430 实例上限累积
      G[2] = nil
    end
    ACTIVE = { 1 }
    MIRRORQ = {}
    MODE = mode
    g = G[1]
    placeBoard(G[1], 0)
    guideStage = 0
    newGame()                             -- 主盘重开
    FN.enterMode()                           -- 重建对家盘 + 双屏布局
    startIfWaiting()                      -- 进模式开局引导（keys → 3-2-1）
  end
  setText(topBanner, '')
  setText(botBanner, '')
  if overlay then tryCall(overlay, 'SetVisible', false) end
  -- 结算态改过横幅字号/颜色，重开必须还原：几何与样式只认 layout 这一份
  if CANVAS_W and CANVAS_H then
    local okL, errL = pcall(layout, CANVAS_W, CANVAS_H)
    if not okL then print('relayout error :: ' .. tostring(errL)) end
  end
  print('restart mode=' .. mode)
end

-- 硬降到底 + 落子。账本归属由 FN.aiAutoFlag() 决定（v2.7，用户反馈①⑧）：
--   stage0 入场自演 / 双屏 AI 盘 = AI 账（autoDriving=true：demo 日志、教学静音、best 不收）；
--   casual 局中接管 = **玩家账**（autoDriving=false：日志/音效/教学/最高分与玩家亲手操作完全同构）——
--   这也是设计书裁决⑤「接管续算不清零」的原口径，旧实现无条件置 true ⇒ 接管的消行分跑到 AI 账上，
--   且死亡时 updateBest 被跳过，和玩家死法不一致。
FN.aiAutoFlag = function()
  return (guideStage == 0) or (g.aiAccount == true)
end
FN.aiDrop = function()
  local guard = 0
  while guard < ROWS + 4 and not collides(g.piece.cells, g.piece.x, g.piece.y + 1) do
    g.piece.y = g.piece.y + 1
    guard = guard + 1
  end
  local prevAuto = g.autoDriving
  g.autoDriving = FN.aiAutoFlag()
  local ok, err = pcall(doLock)
  g.autoDriving = prevAuto
  if not ok then
    print('demo lock error :: ' .. tostring(err))
    return
  end
  g.AI.count = g.AI.count + 1
  RHO.pieces = RHO.pieces + 1
  g.AI.sumSec = g.AI.sumSec + g.AI.dur
  -- 一块一条节奏日志：从这行能看出"确实分段执行了"
  local p = g.AI.pace or {}
  local gaps = p.gaps or 0
  local avgGap = 0
  if gaps > 0 then avgGap = (p.sumGap or 0) / gaps end
  print('demo pace think=' .. aiFmt(p.think or 0)
    .. ' rot=' .. (p.rot or 0)
    .. ' move=' .. (p.cells or 0) .. '*' .. aiFmt(avgGap)
    .. ' soft=' .. (p.soft or 0)
    .. ' hover=' .. aiFmt(p.hover or 0)
    .. ' drop=' .. tostring(p.drop or 'hard')
    .. ' total=' .. aiFmt(g.AI.dur))
  g.AI.dur = 0
  if g.AI.count % 10 == 0 then
    print('demo auto n=' .. g.AI.count .. ' avg=' .. aiFmt(g.AI.sumSec / g.AI.count)
      .. 's stack=' .. AEVX.stackHeight() .. ' rho=' .. aiFmt(RHO.lines / math.max(RHO.pieces, 1))
      .. ' pieces=' .. RHO.pieces)
  end
  local h = AEVX.stackHeight()
  -- v2.7（用户反馈①⑧）：这段堆高看门狗**只属于 stage0 入场自演**（吸引模式，盘面砸了就重来）。
  -- 旧实现无条件执行 ⇒ casual 接管/对家盘堆高时也被拽回标题页（demoLoopReset 会把 guideStage 归 0），
  -- 于是"AI 死了不像玩家死"：没有结算页、直接跳回菜单。接管/对家盘的死亡一律交给 spawn 顶死判定。
  if guideStage == 0 and (g.gameOver or h >= AI_RESET_ROWS) then
    print('demo rho=' .. aiFmt(RHO.lines / math.max(RHO.pieces, 1))
      .. ' pieces=' .. RHO.pieces .. ' lines=' .. RHO.lines)
    print('demo reset stack=' .. h)
    demoLoopReset()
  end
end
-- g.AI 初值已随 newInst() 建立（newAIState，T6b：每实例一份 AI 状态机）

-- 每个 OnUpdate 调一次：thinking（观察）→ acting（旋转/横移/小落，逐段计时）
-- → hovering（再看一眼，在 acting 队列里）→ dropping（软降逐格 或 硬降）→ 下一块
-- AI 驱动核心（T6a 从 autoTick 抽出）：作用于当前 g，**无 guideStage 守卫**——
-- stage0 自演 / casual 局中接管 / T6b 双屏 AI 盘共用这一条链路。
-- onOver='demo'：盘死→demoLoopReset（stage0 自演语义）；
-- onOver='stop'：盘死→停 AI 驱动走各自结算（casual 接管/对战语义）。返回 false=已停/无盘。
-- 隔离调子（lead 拍板，T8 起）：aiDrop 直调 doLock，不经锁定延迟路径——AI 节奏与玩家手感互不影响。
-- T5 性能修复（v2.1「卡的要死」）：第二层评估专用 evalNext——零表分配的「落-评-撤」。
-- 探针二分定谳（X2/X4b，交替对照）：原第二层复用 evalBoard，每次调用建 occ/solid/keep/
-- solidFinal/heights 共 5 个对象，JS-Lua 解释器（JS 对象分配+GC）下精化帧连续 68 次/帧
-- 触发 GC 抖动，实测精化帧 26.6ms（拷贝+消行仅 0.3ms，大头全在枚举）——T5 把整体
-- mean 从 v1 的 0.34ms 拉到 9.55ms（+35 倍）。evalNext 只算 El-Tetris 三主项
-- （agg/holes/complete）：第二层是排序信号不是最终决策，拟人项（wallDist/well）与
-- bump 在第一层 evalBoard 仍全量参与。落 4 格→评→撤销，scratch（NUM.nxFull）复用，
-- 热路径零分配。实测修复后整体 mean 回 0.33ms（v1 量级）。
NUM.evalNext = function(cells, x)
  if collides(cells, x, 1) then return nil end
  local y = 1
  while y < ROWS and not collides(cells, x, y + 1) do y = y + 1 end
  local b = g.board
  local w1, w2, w3, w4 = 0, 0, 0, 0     -- 落格坐标打包 br*32+bc（ROWS<=20,COLS<=10 安全）
  for i = 1, 4 do
    local br, bc = y + cells[i][1] - 1, x + cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      local p = br * 32 + bc
      if w1 == 0 then w1 = p elseif w2 == 0 then w2 = p elseif w3 == 0 then w3 = p else w4 = p end
      b[br][bc] = 1
    end
  end
  local nxFull = NUM.nxFull
  local nf = 0
  for r = 1, ROWS do                     -- 满行检测（不物理删行——撤销时一并还原）
    local row = b[r]
    local full = true
    for c = 1, COLS do
      if row[c] == 0 then full = false break end
    end
    if full then nf = nf + 1 nxFull[nf] = r end
  end
  local agg, holes = 0, 0
  local nxH = NUM.nxFull                  -- 借同一 scratch 表的后段存每列高（11..20，nf<=4 不冲突）
  for c = 1, COLS do                      -- heights/holes：满行视作已消（跳过）
    local h, seen = 0, false
    for r = 1, ROWS do
      local occ = b[r][c] ~= 0
      if occ then
        local skip = false
        for fi = 1, nf do if nxFull[fi] == r then skip = true break end end
        if not skip then
          if h == 0 then h = ROWS - r + 1 end
          seen = true
        end
      elseif seen then
        local skip = false
        for fi = 1, nf do if nxFull[fi] == r then skip = true break end end
        if not skip then holes = holes + 1 end
      end
    end
    agg = agg + h
    nxH[10 + c] = h
  end
  local bump = 0                          -- El-Tetris 第四主项（三主项版 ρ 0.30→0.22 的回归修复）
  for c = 1, COLS - 1 do
    local d = nxH[10 + c] - nxH[11 + c]
    if d < 0 then d = -d end
    bump = bump + d
  end
  if w1 ~= 0 then b[w1 // 32][w1 % 32] = 0 end    -- 撤销 4 格
  if w2 ~= 0 then b[w2 // 32][w2 % 32] = 0 end
  if w3 ~= 0 then b[w3 // 32][w3 % 32] = 0 end
  if w4 ~= 0 then b[w4 // 32][w4 % 32] = 0 end
  return W_AGG * agg + W_LINE * nf + W_HOLE * holes + W_BUMP * bump, nil, nf
end

-- v2.5：lvIdx=强制档位（演示/接管场景传 3=hard——AI 代打要展示最强/帮玩家续命，不故意失误；
-- ai-battle 对抗盘不传=用玩家选的难度档做对抗强度）。NUM.AI_LEVEL 仍是玩家侧难度语义。
-- @region ai-demo BEGIN (writer: ai-strength)
-- ===== v5.0 ① 动作队列清洗（统一路径 / 去掉"悬停·犹豫"演出）=====
-- 为什么挂 NUM 表而不是 local function：main chunk 贴着 200 个 local 上限（D591/D612 实测），
-- 这里再加一个 local 会直接 `too many local variables (limit is 200)`。
-- buildQueue 是拟人外壳，会塞两类**不产生决策价值**的段：
--   ① hover（40% 概率 0.20~0.40s）：落定前"再看一眼"⇒ 方块悬在落点上方干等；
--   ② 回退一格再移回来（20% 概率，0.10~0.20s×2）：到位后犹豫。
-- 用户 2026-10-29 打回原话「思考的时候方块不动」——这类段正是"不动"的可见来源之一。
-- 统一后 demo 与 AI 盘不再各有一套"规划动画"，只剩：思考（重力照落）→ 转/移 → 下落。
NUM.aiStripQueue = function(q, info)
  local out = {}
  local i, n = 1, #q
  while i <= n do
    local a = q[i]
    local nxt = q[i + 1]
    if a.kind == 'hover' then
      i = i + 1
    elseif a.kind == 'move' and nxt and nxt.kind == 'move'
      and (a.cells or 0) == 1 and (nxt.cells or 0) == 1 and nxt.dir == -a.dir then
      i = i + 2                                  -- 回退一格 + 移回来：净位移 0，整对删除
    else
      out[#out + 1] = a
      i = i + 1
    end
  end
  if info then info.hover = 0 end
  return out, info
end

FN.aiTickCore = function(dt, onOver, lvIdx)
  -- #16 已回滚：用例 62/64 依赖浮层期间的演示节奏，暂停会连带打破回归。
  -- 体验层面影响很小（浮层盖住了棋盘），留作已知取舍。
  if g.gameOver then
    if onOver == 'demo' then demoLoopReset() end
    return false
  end
  if not g.piece or not g.board then return false end
  local lv = NUM.AI_LEVELS[lvIdx or NUM.AI_LEVEL] or NUM.AI_LEVELS[2]
  -- ===== v4.0 ④ AI 能力重构（用户 2026-10-29 第 4 点）=====
  -- ① 每块用时按**当前等级速度**现算（旧实现是档位常数 1.0~2.2s ⇒ 高速档被自己的节奏拖死）
  -- ② 观测下限随速度收紧（obsMin 也必须让位，否则再快也被观察段吃掉）
  -- ③ 对抗模式：对手最高列 ≥ attackHeight ⇒ attack=true，多消行 + 留井权重上线
  -- ④ easy 档走简化评估（NUM.AI_SIMPLE），不再注入"故意失误"
  local tune = NUM.AI_TUNE or {}
  local tier = lv.tier or 2
  local pace = NUM.aiPace(tier, g.level)
  -- v5.4 修用户 2026-10-30 一-2「开局展示的 AI，移动和选择速度还是太快」：
  -- 标题页自演（onOver=='demo'）是**给玩家看的橱窗**，不是对局强度——统一放慢 1.8 倍，
  -- 让"看一眼方块怎么被搬走"能跟得上。局内 AI 盘/接管节奏不受影响（真打不该变慢）。
  -- v5.5（修正 v5.4 的口径）：只放慢**看得见的搬块动作**（横移/旋转/犹豫的 wait），
  -- 不放慢出块节奏 pace —— 后者会改变 AI 吞吐（用例 20/21 在固定窗口中数块数：
  -- hard 100 块 / easy 80 块），把「观感调整」变成「AI 变弱」。
  -- 只对 hard（标题页自演实际跑的档）放慢：弱档本来就慢，再放慢会把「AI 吞吐」类用例的
  -- 窗口块数压到验收线以下（21-ai-easy-rho：235s 内需 ≥80 块，实测放慢后刚好掉到 78）。
  local demoMul = (onOver == 'demo' and tier >= 3) and 1.8 or 1.0
  -- v5.1 热身：一局/一段自演的头 4 块按 1.35 倍时长（用户："就算想加速也不能一上来就这么逆天"）。
  -- 只放宽节奏，不改决策——算法强度不变，只是动作看着像人。
  do
    local seen = (g.AI.pieces or 0)
    if seen < 4 then pace = pace * 1.35 end
  end
  local obsMin = lv.obsMin or 0.30
  if obsMin > pace * 0.45 then obsMin = pace * 0.45 end
  local pieceMax = lv.pieceMax or 2.0
  if pieceMax > pace * 1.40 then pieceMax = pace * 1.40 end
  local pieceMin = lv.pieceMin or 0.6
  if pieceMin > pace * 0.75 then pieceMin = pace * 0.75 end
  local opp = (g == G[2]) and G[1] or G[2]
  local oppH = 0
  if opp and opp.board then
    for r = 1, ROWS do
      local hitRow = false
      for c = 1, COLS do
        if opp.board[r][c] ~= 0 then hitRow = true break end
      end
      if hitRow then oppH = ROWS - r + 1 break end
    end
  end
  local atkOn = oppH >= (tune.attackHeight or 8)
  -- v5.0 ③：**有对手就进基线进攻态**。旧实现只有 oppH ≥ attackHeight（对手快死）才开
  -- ⇒ 前 90% 对局从不攒多消行（实测：多消行 5%、garbage 0.55 行/分）。
  -- 单人局（opp=nil：casual 接管 / 标题页自演）恒 0 —— 攻击权重只在双盘模式生效。
  local atkBase = 0
  if opp then atkBase = (tune.attackBaseline or 0.6) * (tune.attackBonus or 9) * (tier / 3) end
  NUM.AI_ATK = atkOn and (atkBase * 1.6) or atkBase
  local atkMode = 'off'
  if NUM.AI_ATK > 0 then atkMode = atkOn and 'burst' or 'baseline' end
  if g.AI.atkMode ~= atkMode then
    g.AI.atkMode = atkMode
    print('ai attack=' .. tostring(atkOn) .. ' oppH=' .. tostring(oppH) .. ' tier=' .. tostring(tier)
      .. ' mode=' .. atkMode .. ' atk=' .. aiFmt(NUM.AI_ATK))
  end
  -- 井模式**只在对抗进攻态开**（用户原话：「积累然后一次消除更多的行来给对手制造垃圾」）：
  -- 单人对局没有对手，攒井只会降低自己的容错 ⇒ 那时保持干净盘面（ρ 不损失）。
  NUM.AI_WELL = (atkOn and tune.saveI and tune.saveI[tier]) and ((tune.attackBonus or 9) * 0.7) or 0
  -- ⚠ 井列只能取**右墙第 COLS 列**：I 块竖放时占的是"盒内第 2 列"，x∈[1,COLS-1] ⇒ 真正能填的
  -- 列是 2..COLS，第 1 列根本填不到（2026-10-29 实测：选左墙井 ⇒ 永远等不到四消）。
  if NUM.AI_WELL > 0 and tune.wellPlan then
    NUM.AI_WELLCOL, NUM.AI_WELLBASE = COLS, AEVX.colHeight(COLS)
  else
    NUM.AI_WELLCOL, NUM.AI_WELLBASE = 0, 0
  end
  NUM.AI_SIMPLE = (lv.simple == true)
  if NUM.AI_WELL > 0 and g.AI.wellLog ~= g.piece then
    g.AI.wellLog = g.piece            -- v5.0：每块一条（旧实现每 5 帧一条 = 6 条/秒刷屏）
    print('ai well col=' .. tostring(NUM.AI_WELLCOL) .. ' base=' .. tostring(NUM.AI_WELLBASE)
      .. ' depth=' .. tostring(AEVX.wellDepth()))
  end
  if g.AI.piece and g.AI.piece ~= g.piece then          -- 方块换了（清盘/重开/Hold 换块）
    g.AI.phase, g.AI.t, g.AI.queue, g.AI.qi, g.AI.piece, g.AI.search = 'thinking', 0, nil, 1, nil, nil
    g.AI.wait = aiRange(obsMin, AI_OBSERVE_MAX)
  end
  g.AI.t = g.AI.t + dt
  g.AI.dur = g.AI.dur + dt
  local ph = g.AI.phase
  local function nextAction()
    g.AI.qi = g.AI.qi + 1
    g.AI.t = 0
  end
  if ph == 'thinking' then
    -- T5 渐进式搜索（docs/v2-ai-design.md §二）：第一帧 1-ply 全集 = 保底方案 + 候选表；
    -- ply>=2 档在观察期分帧精化 top-12（每帧 2 候选 × ~34 下一块落点 ≈ 68 evalBoard ≈ 8ms
    -- 真机预算）；完成或超时（obsMin+0.10s）收敛——超时用当前最优，1-ply 保底永不缺席。
    -- 搜索期间临时把 board 指向模拟棋盘（切片内同步完成，无渲染穿插，安全）。
    local function refineSearch()
      local S = g.AI.search
      local top = S.plan.sorted
      local n = #top                                    -- 【E2】全候选精化（top-12→全部；34×34≈17帧<0.55s 观察窗）
      local nextS = SHAPES[g.nextName or 'T']
      local savedBoard = g.board
      local k = S.idx
      -- v4.0 ④：2-ply 精化的每帧候选预算。2 太慢（hard 每块 2.03s、ai-battle 里精化赶不上 1.2s 节奏
      -- ⇒ 退回 1-ply 结果，垃圾行 0）；提到 5 让它在一帧预算内跑完，节奏回到 1.5s 级。
      local budget = 5
      while k <= n and budget > 0 do
        local cand = top[k]
        local sim = {}
        for r = 1, ROWS do
          local row = {}
          for c = 1, COLS do row[c] = g.board[r][c] end
          sim[r] = row
        end
        local cells = g.piece.cells
        for _ = 1, cand.rot - 1 do cells = rotateCells(cells, g.piece.n or 4) end
        local y = 1
        while y < ROWS and not collides(cells, cand.x, y + 1) do y = y + 1 end
        for i = 1, 4 do
          local br, bc = y + cells[i][1] - 1, cand.x + cells[i][2] - 1
          if br >= 1 and br <= ROWS then sim[br][bc] = 1 end
        end
        local r = ROWS
        while r >= 1 do
          local full = true
          for c = 1, COLS do if sim[r][c] == 0 then full = false end end
          if full then
            table.remove(sim, r)
            local row = {}
            for c = 1, COLS do row[c] = 0 end
            table.insert(sim, 1, row)
          else
            r = r - 1
          end
        end
        g.board = sim
        local ncells = nextS.cells
        local bestNext = nil
        for _ = 1, 4 do
          local nwmax = 1
          for i = 1, 4 do
            if ncells[i][2] > nwmax then nwmax = ncells[i][2] end
          end
          for nx = 1, COLS - nwmax + 1 do
            local sc = NUM.evalNext(ncells, nx)
            if sc and (not bestNext or sc > bestNext) then bestNext = sc end
          end
          ncells = rotateCells(ncells, nextS.n)
        end
        g.board = savedBoard
        cand.score2 = cand.score + (bestNext or -5)   -- 2-ply 值 = 1-ply 分 + 下一层最优回应
        if not S.bestScore or cand.score2 > S.bestScore then
          S.bestScore, S.best2 = cand.score2, cand
        end
        k = k + 1
        budget = budget - 1
      end
      S.idx = k
      if k > n then S.done = true end
    end
    if not g.AI.queue and not g.AI.search then
      -- 首帧：1-ply 全集（保底）
      local plan = aiChoose()
      -- v2.7（用户反馈①⑧）：**AI 的死亡必须与玩家同一条链路**。
      -- 用户的判定说得很准：「ai 只是模拟玩家进行输入，输入完成之后的全部代码都和玩家是一样的，
      -- 没有条件分支走专门的逻辑，就不会有 bug」。旧实现在这里分了岔——
      --   * plan.reset（无安全位）→ 只 demo 自演复位，接管/对家盘直接 return（块永不落、不判负、不结算）
      --   * plan == nil（连合法位都没有）→ 空等，同样永远不死
      -- 现在两路都改成「AI 照常给出输入 → 硬降落地 → spawn 顶死判定 → showGameOver → 结算页」，
      -- 与玩家按空格堆到顶完全一致；只有 stage0 入场自演（不是一局游戏）保留复位循环。
      local topout = (plan == nil) or (plan.reset == true)
      if topout then
        if onOver == 'demo' then
          print('demo reset plan=too-high')
          demoLoopReset()
          return false
        end
        -- 顶死前的最后一块：按兜底位（无安全位时的最优合法位）摆一下再硬降；
        -- 连兜底位都没有时原地硬降——落点即死点，判负交给 spawn。
        local fb = plan and plan.fallback
        if fb then
          local cells = g.piece.cells
          for _ = 2, (fb.rot or 1) do
            local nc = rotateCells(cells, g.piece.n or 4)
            if collides(nc, g.piece.x, g.piece.y) then break end
            cells = nc
            g.piece.cells = nc
          end
          local dir = ((fb.x or g.piece.x) > g.piece.x) and 1 or -1
          local guardMv = 0
          while g.piece.x ~= fb.x and guardMv < COLS do
            if collides(g.piece.cells, g.piece.x + dir, g.piece.y) then break end
            g.piece.x = g.piece.x + dir
            guardMv = guardMv + 1
          end
          print('ai topout fallback x=' .. tostring(fb.x) .. ' h=' .. tostring(fb.h))
        else
          print('ai topout noplan')
        end
        FN.aiDrop()                              -- 与玩家「空格直落」同一条落子路径
        g.AI.phase, g.AI.queue, g.AI.qi, g.AI.piece, g.AI.search = 'thinking', nil, 1, nil, nil
        g.AI.t, g.AI.wait = 0, aiRange(obsMin, AI_OBSERVE_MAX)
        return true
      end
      g.AI.search = { plan = plan, idx = 1, best2 = nil, bestScore = nil,
        done = (lv.ply < 2) or (#plan.sorted < 2), holdChecked = false, doHoldAfter = false }
      g.AI.piece = g.piece
      g.AI.dur = 0
      g.AI.t = 0
      g.AI.wait = obsMin + 0.10
      return
    end
    if g.AI.search and not g.AI.search.done then
      refineSearch()
      if not g.AI.search.done then
        if g.AI.t < obsMin + 0.10 then return end
        g.AI.search.done = true          -- 超时收敛：用当前已精化最优（保底仍在）
      end
    end
    if g.AI.search and not g.AI.search.holdChecked then
      g.AI.search.holdChecked = true
      -- v4.0 ④ hold（用户：「和 AI 对抗的过程中，发现 AI 不太会使用暂存来提高水平」）
      -- 旧实现只有 hard 档开 hold、阈值写死 1.5（1-ply 分数量级下几乎不会触发）。现在：
      --   ① 全档开启（NUM.AI_LEVELS[*].hold = 1），阈值按档位给（NUM.AI_TUNE.holdMargin）
      --   ② 多一条**留 I 块**策略：靠墙井已挖到 ≥wellDepth 且槽空、当前块是 I ⇒ 先存起来等四消
      --      （这是"会多消行"的另一半——光有分数权重还不够，得真的把 I 块留住）
      -- 两条都复用 NUM.doHold 同一执行路径（不另写换块逻辑）。
      local holdMargin = (tune.holdMargin and tune.holdMargin[tier]) or 1.2
      if lv.hold > 0 and g.st.can then
        local altS = SHAPES[g.st.name or g.nextName or 'T']
        local cells = altS.cells
        local bestAlt = nil
        for _ = 1, 4 do
          local wmax = 1
          for i = 1, 4 do if cells[i][2] > wmax then wmax = cells[i][2] end end
          for ax = 1, COLS - wmax + 1 do
            local sc, h = AEVX.evalBoard(cells, ax)
            if sc and h <= AI_RESET_ROWS and (not bestAlt or sc > bestAlt) then bestAlt = sc end
          end
          cells = rotateCells(cells, altS.n)
        end
        local stay = g.AI.search.plan.best1.score   -- 同口径 1-ply vs 1-ply
        if bestAlt and bestAlt > stay + holdMargin then
          g.AI.search.doHoldAfter = true
          print('ai hold why=better gain=' .. aiFmt(bestAlt - stay) .. ' tier=' .. tostring(tier))
        end
        -- 留 I 块（attack 模式）：井快成型 + 手里是 I ⇒ 存进槽（槽里是别的块就先换出来摆掉）
        if (not g.AI.search.doHoldAfter) and tune.saveI and tune.saveI[tier]
          and g.piece and g.piece.name == 'I' then
          local wd = AEVX.wellDepth()
          if wd >= (tune.wellDepth or 4) - 1 and (g.st.name ~= 'I') then
            g.AI.search.doHoldAfter = true
            print('ai hold why=saveI well=' .. tostring(wd) .. ' slot=' .. tostring(g.st.name or '-'))
          end
        end
        -- 井已够深 + 槽里正躺着 I ⇒ 换出 I 立刻四消（这是"会利用多消行"的最后一环）
        if (not g.AI.search.doHoldAfter) and tune.saveI and tune.saveI[tier]
          and g.st.name == 'I' and g.piece and g.piece.name ~= 'I' then
          local wd = AEVX.wellDepth()
          if wd >= (tune.wellDepth or 4) then
            g.AI.search.doHoldAfter = true
            print('ai hold why=fireI well=' .. tostring(wd))
          end
        end
      end
      if g.AI.search.doHoldAfter then
        g.AI.search = nil
        NUM.doHold()                   -- 换块；下一帧由换块守卫重新进入 thinking
        return
      end
    end
    if not g.AI.queue then
      -- v4.0 ④：每块打一条节奏读数（用例按它断言"等级越高每块用时越短"）
      if CFG.VERBOSE then print('ai pace tier=' .. tostring(tier) .. ' lv=' .. tostring(g.level)
        .. ' pace=' .. aiFmt(pace) .. ' obs=' .. aiFmt(obsMin) .. ' atk=' .. tostring(atkOn)) end
      -- 定稿：2-ply 最优（超时退 1-ply best）→ buildQueue（拟人外壳不变）
      -- v4.0 ④：**故意失误注入已废除**（用户原话「明显的故意制造错误来达到降智商，这个更蠢」）。
      -- 弱档的"弱"由 simple 简化评估 + 更长的每块用时体现，不再采样次优位。
      local S = g.AI.search
      local final = S.plan.best1
      if S.best2 and S.done then final = S.best2 end
      local probe = g.piece.cells
      for _ = 1, final.rot - 1 do probe = rotateCells(probe, g.piece.n or 4) end
      local ly = 1
      while ly < ROWS and not collides(probe, final.x, ly + 1) do ly = ly + 1 end
      local plan = { rot = final.rot - 1, x = final.x, landingY = ly }
      -- v5.0 ②：**决策档与执行档对齐**。旧实现：决策用 lvIdx（demo/技能接管强制 3），
      -- 但 buildQueue 的横移间隔读玩家侧 NUM.AI_LEVEL ⇒ 会出现"hard 的决策 + easy 的手速"。
      -- 只在这几行临时切，buildQueue 返回立刻还原（双盘/接管之间不许残留）。
      local savedAiLevel = NUM.AI_LEVEL
      NUM.AI_LEVEL = lvIdx or NUM.AI_LEVEL
      local q, info = buildQueue(plan)
      NUM.AI_LEVEL = savedAiLevel
      -- v5.0 ②：**只对 hard 生效**。easy/normal 的"慢"是设计（用例 21 契约 avg≥2.2s 必须保住），
      -- 所以弱档完全保留 buildQueue 原样（含悬停/回退演出），节奏不动。
      if tier >= 3 then
        q, info = NUM.aiStripQueue(q, info)      -- 删悬停/回退两类"规划动画"段
        local qk = (tune.queueK and tune.queueK[tier]) or 0.45
        local qcap = (tune.queueCap and tune.queueCap[tier]) or 0.06
        for i = 1, #q do
          local w = (q[i].wait or 0) * qk
          if w > qcap then w = qcap end          -- 旋转原始 0.15~0.45s 是最大单笔（实测 0.17s/次）
          if w < 0.03 then w = 0.03 end
          q[i].wait = w
        end
      end
      if demoMul ~= 1.0 then
        for i = 1, #q do q[i].wait = (q[i].wait or 0) * demoMul end
        if info then info.hover = (info.hover or 0) * demoMul end
      end
      g.AI.queue, g.AI.info, g.AI.qi = q, info, 1
      local rest = 0
      for _, a in ipairs(q) do rest = rest + (a.wait or 0) end
      local target = aiRange(pace * 0.85, pace)   -- v4.0 ④：目标用时随速度收紧
      g.AI.softPer = 0
      -- v5.0 ②：hard 档一律硬降——软降 18 行 × 0.06~0.12s/行 = 1~2s，是每块用时里最大的一笔；
      -- 弱档保留软降演出（"想得慢"本来就该慢）。
      local dropKind = 'hard'
      -- hard 档一律硬降（省 1~2s/块）；弱档保持旧概率 50%（用例 21 的慢档契约）
      if tier < 3 and aiRand(100) <= 50 then dropKind = 'soft' end
      local rows = (info.landingY or g.piece.y) - g.piece.y
      if rows < 1 then rows = 1 end
      local dropTime = 0
      if dropKind == 'soft' then
        local per = (target - rest) / rows
        if per < AI_SOFT_MIN then per = AI_SOFT_MIN end
        if per > AI_SOFT_MAX then per = AI_SOFT_MAX end
        g.AI.softPer = per
        dropTime = rows * per
      end
      -- 观察时长 = 目标总时长 - 其余各段；下限 obsMin（高难 0.55 覆盖精化帧数）、上限 1.2s
      -- 兜底：软降 + 长距离 + 多动作会让整块超过 pieceMax+0.2 ⇒ 这一块改成硬降（人也常常直接按到底）
      if dropKind == 'soft' and (rest + dropTime + obsMin) > pieceMax + 0.2 then
        dropKind, dropTime, g.AI.softPer = 'hard', 0, 0
      end
      -- v5.0 ②：**扣掉已经花掉的搜索时间**。plan 是在 refineSearch 之后才建的，
      -- g.AI.t 此刻已经攒了 ~0.27s（1-ply + 2-ply 精化），旧实现不扣 ⇒ 每块实际 =
      -- target + 0.27s（实测 1.20~1.33s，而 target 只有 0.81~0.95s）。
      -- v5.0 ②：**只对 hard 扣搜索时间**（弱档保持旧预算，契约 avg≥2.2s 靠它）。
      local spent = 0
      if tier >= 3 then spent = (g.AI.t or 0) end
      local think = target - rest - dropTime - spent
      if think < obsMin then think = obsMin end
      -- 思考等待上限：hard 1.2s（人手观感护栏）；弱档 1.6s——easy 的"慢"是设计，
      -- 旧实现用同一条 1.2s 上限把 easy 从 2.5s 压到 ~2.1s（用例 21 契约 avg≥2.2s）。
      local thinkCap = 1.2
      if tier < 3 then thinkCap = 1.6 end
      if think > thinkCap then think = thinkCap end
      g.AI.wait = think
      g.AI.t = 0
      g.AI.pace = { think = think, rot = info.rot, cells = info.cells,
        gaps = 0, sumGap = 0, soft = info.softRows, hover = info.hover, drop = dropKind }
      -- 计划日志：看到"这块是什么方块、打算放哪一列、软降还是硬降"（形状不变，T4 口径）
      print('demo plan name=' .. tostring(g.piece.name) .. ' from=' .. g.piece.x
        .. ' target=' .. plan.x .. ' rot=' .. plan.rot .. ' drop=' .. dropKind)
      return
    end
    if g.AI.t < g.AI.wait then return end
    g.AI.t = 0
    g.AI.phase = 'acting'
    return
  end
  if ph == 'acting' then
    local a = g.AI.queue and g.AI.queue[g.AI.qi]
    if not a then
      -- 序列走完：软降 / 硬降
      g.AI.phase, g.AI.t = 'dropping', 0
      g.AI.dropped = 0
      g.AI.fallTimer = 0
      if g.AI.pace.drop == 'soft' then
        g.AI.nudge = (aiRand(100) <= lv.nudgePct)   -- 软降途中顺手横调 1 格（hard 档 0%：落点不被噪声破坏）
        g.AI.nudgeAt = aiRand(3)
      end
      if CFG.VERBOSE then print('demo act drop=' .. g.AI.pace.drop) end
      return
    end
    if a.kind == 'rot' then
      if not a.done then
        a.done = true
        local nc = rotateCells(g.piece.cells, g.piece.n)
        if not collides(nc, g.piece.x, g.piece.y) then
          g.piece.cells = nc
          renderPiece()
        end
        if CFG.VERBOSE then print('demo act rot x=' .. g.piece.x) end
      end
      if g.AI.t >= a.wait then nextAction() end
      return
    end
    if a.kind == 'move' then
      if not a.done then
        a.done = true
        for _ = 1, a.cells do
          if not collides(g.piece.cells, g.piece.x + a.dir, g.piece.y) then
            g.piece.x = g.piece.x + a.dir
          end
        end
        renderPiece()
        g.AI.pace.gaps = g.AI.pace.gaps + 1
        g.AI.pace.sumGap = g.AI.pace.sumGap + (a.gap or 0)
        if CFG.VERBOSE then print('demo act move x=' .. g.piece.x) end
      end
      if g.AI.t >= a.wait then nextAction() end
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
          if not collides(g.piece.cells, g.piece.x, g.piece.y + 1) then
            g.piece.y = g.piece.y + 1
            renderPiece()
          end
          a.left = a.left - 1
          if CFG.VERBOSE then if a.left == 0 then print('demo act soft y=' .. g.piece.y) end end
        end
        return
      end
      a.timer = (a.timer or 0) - dt
      if a.timer <= 0 then nextAction() end
      return
    end
    if a.kind == 'hover' then
      if CFG.VERBOSE then if not a.done then a.done = true print('demo act hover ' .. aiFmt(a.wait)) end end
      if g.AI.t >= a.wait then nextAction() end
      return
    end
  end
  if ph == 'dropping' then
    if g.AI.pace.drop == 'soft' then
      local canFall = not collides(g.piece.cells, g.piece.x, g.piece.y + 1)
      if canFall then
        g.AI.fallTimer = (g.AI.fallTimer or 0) - dt
        if g.AI.fallTimer <= 0 then
          g.AI.fallTimer = g.AI.softPer
          g.piece.y = g.piece.y + 1
          g.AI.dropped = (g.AI.dropped or 0) + 1
          if g.AI.nudge and g.AI.dropped == g.AI.nudgeAt then
            local d = 1
            if g.piece.x > COLS / 2 then d = -1 end
            if not collides(g.piece.cells, g.piece.x + d, g.piece.y) then
              g.piece.x = g.piece.x + d
              print('demo act nudge x=' .. g.piece.x)
            end
          end
          renderPiece()
        end
      end
      if not canFall then
        -- 落地后若这块太快（< 档位 pieceMin），落定前再停一下（像人抬手前确认一下）
        if g.AI.dur < pieceMin then return end
        FN.aiDrop()
        g.AI.phase, g.AI.queue, g.AI.qi, g.AI.piece, g.AI.search = 'thinking', nil, 1, nil, nil
        g.AI.t, g.AI.wait = 0, aiRange(obsMin, AI_OBSERVE_MAX)
      end
      return
    end
    if g.AI.dur < pieceMin then return end       -- 太快就再停一下（同软降）
    FN.aiDrop()                                     -- 硬降
    g.AI.phase, g.AI.queue, g.AI.qi, g.AI.piece, g.AI.search = 'thinking', nil, 1, nil, nil
    g.AI.t, g.AI.wait = 0, aiRange(obsMin, AI_OBSERVE_MAX)
  end
  return true
end

-- stage0 入场自演入口（守卫版）：休闲接管/双屏 AI 走 OnUpdate/T6 入口直接调 aiTickCore
autoTick = function(dt)
  if guideStage ~= 0 then return end
  -- v2.5：stage0 自演=演示，默认最强摆位。v4.0 起改成读 NUM.AI_LEVEL（默认 3=hard）：
  -- 这样调试切档键（SwitchToWalkOrRun）对**自演**也生效，用例才能分别量到三档的真实 ρ。
  FN.aiTickCore(dt, 'demo', NUM.AI_LEVEL or 3)
  -- v5.0 ①：**路径统一**——标题页自演从此和 AI 盘/玩家盘走同一条重力+锁定链。
  -- 旧实现只调 aiTickCore；重力只存在于 OnUpdate 帧末的 tickInstance 循环（guideStage==1 才到），
  -- 于是 demo 的 thinking 期方块悬在顶部不动（用户 2026-10-29：「思考的时候方块不动，
  -- 和其他路径的 AI 还不一样」）。全仓重力推进点只有 tickInstance 一处（g.tickCount % SPEED），
  -- 这里补一次不会产生第二重力源（判据：demo 每格下落 0.50s@Lv1，探针见 qxqy/measure-ai.mjs）。
  FN.tickInstance(dt)
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
  place2(g.settleScrim, 0, 0, W + 60, H + 60)        -- 全屏遮罩
  if g.settleBars then                                -- v2.4 ②：面板装饰（强调条 + 两条细带）
    place2(g.settleBars[1], 0, ch / 2 - 3, cw, 6)     -- 顶部强调条
    place2(g.settleBars[2], 0, 104, cw - 150, 2)      -- 标题下
    place2(g.settleBars[3], 0, -104, cw - 150, 2)     -- 选项上
  end
  place2(g.settleBorder, 0, 0, cw + 8, ch + 8)       -- 强调色描边
  place2(g.settleCard, 0, 0, cw, ch)                 -- 面板底
  g.settleTitleY, g.settleOptsY = 140, -136
  -- v2.4 ②：滑入起点从「屏幕外」改到「面板边缘内」——面板现在是不透明卡，
  -- 从 -440 滑上来会在面板外飘 0.35s（出图 v23-settle-anim.png 可见正文悬在棋盘上）
  g.settleTitleOff, g.settleOptsOff = 192, -192
  place2(g.settleTitle, 0, g.settleTitleY, cw - 60, 80)
  place2(g.settleScore, 0, 66, cw - 60, 56)          -- 34 号（需 53.3）
  place2(g.settleBest, 0, 16, cw - 60, 44)           -- 24 号（需 38.8）
  place2(g.settleInfo, 0, -26, cw - 60, 40)          -- 20 号（需 33）
  place2(g.settleExtra, 0, -64, cw - 60, 40)         -- 分隔点行，20 号
  place2(g.settleOpts, 0, g.settleOptsY, cw - 60, 48)
end

--------------------------------------------------------------------------------
-- v4.0 设备适配子系统（UI4）：移动端操作控件 / 手柄 / 移动端多人玩法引导
--------------------------------------------------------------------------------
-- 为什么整套控件改用**客户端实例**拼（不再用服务端 textbox + cursor 叠层）：
--   旧实现（v2.7–v3.5）= 6 个服务端 textbox(btnA..btnF) 当按钮底 + 客户端 cursor 热区，
--   ① 坐标写死 x=±410（1280 画布口径）⇒ 1560 宽画布上按钮离屏幕边还有 350px，拇指够不到；
--   ② 真机上服务端控件靠 GetChild('名字') 取（v2.7 已踩过：名字一变整排静默消失），
--      而实例层在真机**已验证可见**（标题卡 menu*/结算页 settle* 都是实例）。
-- 布局为什么按 GetUICanvasSize 现算：官方 UI 教程（docs/ui-tutorial/official-ui-tutorial.md
--   :2960-3060）四设备（PC/移动/主机/移动手柄）的位置/大小/锚点**分别设置**，移动端以 16:9
--   为死区基准；Lua 侧只拿得到画布尺寸 ⇒ 一律由 W/H 推导（换设备不用重新导入）。
-- 三态为什么自绘：image 类控件没有按钮四态（D44 实证），只能改底图色 + 点击时下沉 3px。
-- 控件登记表（全仓唯一一份"可点控件"清单）：用户 2026-10-29「部分按钮点击异常，需要对全部控件
-- 进行检查」——靠人肉逐屏点不可靠。登记 = 声明"这里有可点控件"，qxqy/audit-controls.mjs 按
-- dump 出来的画布坐标逐个点，点完必须出现新日志，否则判"死控件"。
-- 每个屏幕（menu/play/help/settle/note）各自一份，重建即清空（防止旧屏幕的坐标被当成活的）。
UI4.reg = {}
-- @region ai-demo END (writer: ai-strength)
-- @region ui-mobile BEGIN (writer: ui-mobile)
-- ===== v5.0 UI 布局唯一实现（lua/tetris/ui.lua）=====
-- 契约：main 只提供**访问器**（画布尺寸 / 模板 / 屏幕状态），几何、配色、三态全在模块里算。
-- 为什么这样分：用户 2026-10-29 打回「移动端按键位置不合理，没有去每个画面核验美观和大小」——
-- 一屏一套坐标只能靠"每种屏 × 每种画布"真的算一遍并审计；单点收口才可能被机检。
FN.U = nil
do
  local uimod = loadModule('ui')
  if uimod and uimod.new then
    FN.U = uimod.new({
      game = game,
      cfg = CFG,
      widgets = WIDGETS,
      canvas = function() return CANVAS_W or 1280, CANVAS_H or 720 end,
      mobile = function() return IS_MOBILE end,
      pool = function() local inst = G[1] or g return inst and inst.bgPool end,
      plate = function() local inst = G[1] or g return inst and inst.plate end,
      frames = function() local inst = G[1] or g return inst and inst.frames end,
      -- v5.4：框色归 FN.paintFrames（席位身份），ui 侧不再用模式色覆盖
      paintFrames = function() return FN.paintFrames and FN.paintFrames() end,
      -- v5.4：技能卡可点（三-1）。ui.lua 只负责建热区与摆位，动作仍回到 main 的唯一入口。
      makeHit = function(nm, w, h) return UI4.hit(nm, w, h) end,
      bindCursor = function(ctl, ev, fn) return addCursor(ctl, ev, fn) end,
      onSkillArea = function(i)
        keyConsumedFrame = frameSeq
        if FN.skillAreaTap then FN.skillAreaTap(i) end
      end,
      theme = function() return THEME end,
      mode = function() return MODE end,
      tb = function(nm)
        if nm == 'title' then return title
        elseif nm == 'hud' then return hud
        elseif nm == 'hudNext' then return hudNext
        elseif nm == 'best' then return best
        elseif nm == 'hint' then return hint
        elseif nm == 'keyA' then return keyA
        elseif nm == 'keyB' then return keyB
        elseif nm == 'keyC' then return keyC
        elseif nm == 'topBanner' then return topBanner
        elseif nm == 'botBanner' then return botBanner
        end
        return nil
      end,
      instHud = function(nm) return HUD_INST[nm] end,
      instCell = function(nm)
        local c = instInto(TPL_GUIDS.cell, root, nil)
        if c then c.name = nm end
        return c
      end,
      instText = function(nm, txt, w, h, fs)
        if not TPL_TEXT then TPL_TEXT = probeSettleTextbox() end
        if not TPL_TEXT then return nil end
        local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_TEXT, root) end)
        if not ok or not c then return nil end
        c.name = nm
        trySet(c, 'text', txt or '')
        trySet(c, 'fontSize', fs or 20)
        trySet(c, 'fontColor', THEME.textMain)
        trySet(c, 'bgColor', C(0, 0, 0, 0))
        trySet(c, 'enableOutline', true)
        trySet(c, 'outlineColor', C(215, 255, 255, 255))
        tryCall(c, 'SetSizeDelta', w, h)
        return c
      end,
      -- 热区必须走**直连路径**（与标题页模式卡 menuZone 同一条，已被点击用例验证）：
      -- instInto 的能力探测在真机会销毁重建，模拟器里探测过的实例坐标读回正常却收不到光标事件。
      instHit2 = function(nm, w, h)
        if not TPL_HIT then return nil end
        local ok, z = pcall(function() return game.InstantiateClientUIControl(TPL_HIT, root) end)
        if not ok or not z then return nil end
        z.name = nm
        tryCall(z, 'SetSizeDelta', w, h)
        return z
      end,
      instHit = function(nm, w, h)
        if not TPL_HIT then return nil end
        local z = instInto({ TPL_HIT }, root, true)
        if not z then return nil end
        z.name = nm
        tryCall(z, 'SetSizeDelta', w, h)
        return z
      end,
      setRightCX = function(v) RIGHT_CX = v end,
      state = function()
        return {
          guideStage = guideStage, helpOpen = helpOpen, roster = ROSTER.on,
          settle = (g and g.settleReady) or false, mode = MODE,
          dual = (G[2] ~= nil), page = FN.U and FN.U.page or 1,
        }
      end,
      party = function() return (SK and SK.party and #SK.party) or 1 end,
      sfx = function() sfx(SFX.press, true) end,
    })
    -- 触屏动作派发：本层先吃掉"本模块自己新增的 act"（关页/回标题/翻页/技能），其余交给 UI4.dispatch
    FN.U.dispatch = function(action, id, rep)
      -- v5.6：浮层开着时，除关闭/切换浮层外的按钮动作一律无效
      if FN.overlayOpen() and action ~= 'closeHelp' and action ~= 'closeRoster'
        and action ~= 'help' and action ~= 'roster' then
        print('pad blocked by overlay ' .. tostring(action))
        return
      end
      if action == 'closeHelp' then
        if UI4.helpToggle then UI4.helpToggle() end
        return
      end
      if action == 'closeRoster' then
        if FN.rosterToggle then FN.rosterToggle() end
        return
      end
      if action == 'home' then
        if FN.exitToMenu then FN.exitToMenu() end
        return
      end
      if action == 'page' then
        FN.U.page = (FN.U.page == 2) and 1 or 2
        print('help page ' .. tostring(FN.U.page))
        FN.U.sig = nil            -- 强制下一帧重排（页码进签名）
        return
      end
      if action == 'skill1' then if FN.skillCast then FN.skillCast(1) end return end
      if action == 'skill2' then if FN.skillCast then FN.skillCast(2) end return end
      if action == 'switch' then if FN.skillSwitch then FN.skillSwitch() end return end
      if UI4.dispatch then UI4.dispatch(action, id, rep) end
    end
    -- 临时诊断（定位热区为何收不到事件；拿完读数即删）
    if type(game.InstantiateClientUIControl) == 'function' then end
    print('ui module ok layout=v5.0 screens=5')
  else
    print('ui module FAIL（移动端按钮将缺失；PC 布局仍走本文件的旧路径）')
  end
end
-- v5.38：手机按键整体收/放（浮层打开时用）。UI4 是 main 侧的壳表，模块方法要显式转发，
-- 否则 FN.syncStage 里 `UI4.padVisible` 恒为 nil ⇒ 按键不会被收走（角色页底部残留「合上」）。
UI4.padVisible = function(show)
  if FN.U and FN.U.padVisible then return FN.U.padVisible(show) end
end
UI4.regScreen = function(name)
  UI4.cur = name
  for i = #UI4.reg, 1, -1 do
    if UI4.reg[i].screen == name then table.remove(UI4.reg, i) end
  end
end
UI4.regAdd = function(name, ctl, w, h)
  if not ctl then return end
  UI4.reg[#UI4.reg + 1] = { screen = UI4.cur, name = name, ctl = ctl, w = w or 0, h = h or 0 }
end
-- ⚠ 真机/模拟器的 GetAnchoredPosition 是**多返回值**（x, y），不是表 —— 只接第一个返回值的话
-- 永远读到 (0,0)，dump 出来的坐标全变画布中心（2026-10-29 实测：巡检脚本照着重心点，全点空）。
UI4.pos = function(ctl)
  if not ctl then return 0, 0 end
  local ok, a, b = pcall(function() return ctl:GetAnchoredPosition() end)
  if not ok then return 0, 0 end
  if type(a) == 'table' then
    return tonumber(a[1] or a.x) or 0, tonumber(a[2] or a.y) or 0
  end
  if type(a) == 'number' then return a, tonumber(b) or 0 end
  return 0, 0
end
UI4.dump = function(tag)
  local W, H = CANVAS_W or 1280, CANVAS_H or 720
  local n = 0
  for _, r in ipairs(UI4.reg) do
    if r.screen == tag then n = n + 1 end
  end
  print('ctl dump screen=' .. tostring(tag) .. ' n=' .. n
    .. ' canvas=' .. math.floor(W) .. 'x' .. math.floor(H))
  for _, r in ipairs(UI4.reg) do
    if r.screen == tag then
      local x, y = UI4.pos(r.ctl)
      print('ctl ' .. r.name .. ' px=' .. math.floor(W / 2 + x + 0.5)
        .. ' py=' .. math.floor(H / 2 + y + 0.5) .. ' w=' .. math.floor(r.w) .. ' h=' .. math.floor(r.h))
    end
  end
end

UI4.clamp = function(v, lo, hi)
  if v < lo then return lo end
  if v > hi then return hi end
  return v
end

UI4.pill = function(name, w, h, color)
  local c = instInto(TPL_GUIDS.cell, root, nil)
  if not c then return nil end
  c.name = name
  tryCall(c, 'SetSizeDelta', w, h)
  trySet(c, 'imageColor', color)
  return c
end

UI4.label = function(name, text, w, h, size, color)
  if not TPL_TEXT then return nil end
  local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_TEXT, root) end)
  if not ok or not c then return nil end
  c.name = name
  c.text = text
  trySet(c, 'fontSize', size)
  trySet(c, 'fontColor', color)
  trySet(c, 'bgColor', C(0, 0, 0, 0))
  trySet(c, 'horizontalAlignment', 'Middle')
  trySet(c, 'verticalAlignment', 'Middle')
  trySet(c, 'enableOutline', true)
  trySet(c, 'outlineColor', C(190, 255, 255, 255))
  -- 同 MS.addText：框高不够 ⇒ 引擎整条不画（fits=false），这里抬到该字号的最小可用高
  h = math.max(h or 0, math.floor((size or 20) * 1.45 + 6))
  tryCall(c, 'SetSizeDelta', w, h)
  return c
end

UI4.hit = function(name, w, h)
  if not TPL_HIT then return nil end
  local z = instInto({ TPL_HIT }, root, true)
  if not z then return nil end
  z.name = name
  tryCall(z, 'SetSizeDelta', w, h)
  return z
end

-- ===== v5.0：按钮/布局的**唯一实现**搬到 lua/tetris/ui.lua（FN.U）=====
-- 旧的 UI4.paint/makeBtn/stopRep/tick/build/layout/syncVisible 职责全部由模块接管，这里只留薄封装。
-- 为什么必须搬：用户 2026-10-29「移动端按键位置不合理，没有去每个画面核验美观和大小」——
-- 一套坐标走到底；只有把「plan(屏) → apply(plan)」收口到一处，才可能对 5 屏 × 5 画布逐个机检。
UI4.paint = function(b, st)
  if FN.U then FN.U.paint(b, st) end
end
UI4.stopRep = function(b)
  if FN.U then FN.U.stopRep(b) end
end
-- 每帧：屏幕/模式/画布签名变化 ⇒ 重排；连发推进也在模块里
UI4.tick = function(dt)
  if FN.U then FN.U.sync(dt) end
end
UI4.build = function(mobile)
  if not FN.U then
    print('phone build skip (ui module missing)')
    return
  end
  FN.U.padBuild(mobile)   -- 排队：真正建控件在第一帧（OnStart 期建的实例收不到光标事件）
end
UI4.layout = function(W, H)
  if not FN.U then return end
  FN.U.apply(nil, (G[2] ~= nil), MODE, (guideStage == 3))
end
-- 结算/终局：屏切换由 FN.U.sync 按屏幕状态静默重排（藏 = 挪出画布，不依赖 SetVisible）
UI4.syncVisible = function(dead)
  if UI4.dead == dead then return end
  UI4.dead = dead
  print('phone play bar=' .. tostring(not dead))
end
UI4.refreshHelpLabel = function(open)
  if not FN.U then return end
  for _, b in ipairs(FN.U.navBtns or {}) do
    -- 帮助页开着时把「说明」键改成「合上」：触屏没有 H 键，必须有一眼能认的关闭入口
    if b.id == 'help' and b.txt then b.txt.text = open and '合上' or '说明' end
  end
end

-- ── 移动端「双人玩法请回 PC」引导浮层（原神风文案；点模式卡触发，不静默吞点击）──
-- 层序：每个实例建完立刻 SetAsFirstSibling（first sibling = 最上层，见 runtime.js injectKey 注释），
-- 于是最终顺序 = 按钮 > 正文 > 标题 > 装饰线 > 卡片 > 暗底 > 标题页 —— 与结算页同一套手法。
UI4.noteOpen = function(which)
  if UI4.noteOn then return end
  local N = NUM.PAD_NOTE or {}
  local W, H = CANVAS_W or 1280, CANVAS_H or 720
  local L = UI4.note
  UI4.noteOn = true
  -- 创建顺序 = 绘制顺序（D647 实测：运行时实例「后建在上」；SetAsFirstSibling 在模拟器不分层，
  -- 而在真机 Unity 语义里 FirstSibling = 最底层 ⇒ 绝不能用它"置顶"）。
  local function top(c) return c end
  local cw = math.min(760, W - 120)
  local tw = math.min(700, W - 160)
  -- 点卡片外任意处也能关（触屏没有 Esc）：全屏 cursor 垫在最下，命中优先于标题页模式卡
  L.block = top(UI4.hit('padNoteBlock', W + 40, H + 40))
  if L.block then
    addCursor(L.block, 'CursorDown', function()
      print('pad note close which=' .. tostring(which) .. ' via=block')
      UI4.noteClose()
    end)
  end
  L.dim = top(UI4.pill('padNoteDim', W + 40, H + 40, C(160, 30, 46, 66)))
  L.card = top(UI4.pill('padNoteCard', cw, 330, THEME.panel))
  L.line = top(UI4.pill('padNoteLine', tw, 3, THEME.gold))
  L.title = top(UI4.label('padNoteTitle', N.title or '旅行者，请回到更大的屏幕', tw, 60, 30, THEME.textMain))
  L.b1 = top(UI4.label('padNoteB1', N.body1 or '', tw, 34, 20, THEME.textSub))
  L.b2 = top(UI4.label('padNoteB2', N.body2 or '', tw, 34, 20, THEME.textMain))
  L.b3 = top(UI4.label('padNoteB3', N.body3 or '', tw, 34, 18, THEME.textSub))
  local bw, bh = 220, 60
  L.btnBg = top(UI4.pill('padNoteBtnBg', bw, bh, THEME.gold))
  L.btnTx = top(UI4.label('padNoteBtnTx', N.btn or '知道了', bw, bh, 24, THEME.textMain))
  L.btn = top(UI4.hit('padNoteBtnHit', bw, bh))
  UI4.regScreen('note')
  UI4.regAdd('note.ok', L.btn, bw, bh)
  if L.btn then
    addCursor(L.btn, 'CursorDown', function()
      sfx(SFX.press, true)
      print('pad note close which=' .. tostring(which))
      UI4.noteClose()
    end)
  end
  local cy = 40
  local function at(c, x, y, w, h)
    if not c then return end
    tryCall(c, 'SetSizeDelta', w, h)
    tryCall(c, 'SetAnchoredPosition', x, y)
  end
  at(L.block, 0, 0, W + 40, H + 40)
  at(L.dim, 0, 0, W + 40, H + 40)
  at(L.card, 0, cy, cw, 330)
  at(L.line, 0, cy + 128, tw, 3)
  at(L.title, 0, cy + 92, tw, 60)
  at(L.b1, 0, cy + 34, tw, 34)
  at(L.b2, 0, cy - 2, tw, 34)
  at(L.b3, 0, cy - 40, tw, 34)
  at(L.btnBg, 0, cy - 108, bw, bh)
  at(L.btnTx, 0, cy - 108, bw, bh)
  at(L.btn, 0, cy - 108, bw, bh)
  UI4.dump('note')
  print('pad note open which=' .. tostring(which))
end

UI4.noteClose = function()
  if not UI4.noteOn then return end
  local L = UI4.note
  for _, k in ipairs({ 'block', 'dim', 'card', 'line', 'title', 'b1', 'b2', 'b3', 'btnBg', 'btnTx', 'btn' }) do
    if L[k] then
      pcall(function() game.DestroyClientUIControl(L[k]) end)
      L[k] = nil
    end
  end
  UI4.noteOn = false
  print('pad note close')
end

-- ── 手柄：键映射 + 左摇杆 + 菜单焦点导航（真机键名以日志 `pad ev` 为准，改 config 即可换绑）──
-- 为什么先注册探针再派发：官方手柄键位由编辑器「按键映射-手柄」决定，Lua 侧拿不到映射表；
--   真实玩家按一遍，日志里的 `pad ev ControllerXxxKeyDown` 就是实际键名 ⇒ 表驱动改绑，不靠猜。
UI4.padBind = function(listen)
  local P = NUM.PAD or {}
  local map = {}
  for action, list in pairs(P.KEYS or {}) do
    for _, ev in ipairs(list) do map[ev] = action end
  end
  local bases = {}
  for i = 1, 14 do bases[#bases + 1] = 'CraftspersonKey' .. i end
  for _, n in ipairs(P.PROBE_NAMED or {}) do bases[#bases + 1] = n end
  local cnt = 0
  for _, base in ipairs(bases) do
    local ev = 'Controller' .. base .. 'Down'
    local action = map[ev]
    listen(ev, function()
      print('pad ev ' .. ev .. (action and (' act=' .. action) or ''))
      if action then UI4.padAct(action, ev) end
    end)
    cnt = cnt + 1
  end
  print('pad bind n=' .. cnt)
end

-- 摇杆：左右移动（带连发）、向下缓降。轴的正负真机未实证 ⇒ 日志把两个数都打出来。
UI4.padTick = function(dt)
  if not (UI4.isPad or UI4.mobile) then return end
  local ok, ax, ay = pcall(function() return game.GetControllerLeftStickAxis() end)
  if not ok then return end
  local dz = (NUM.PAD and NUM.PAD.DEADZONE) or 0.55
  local p = UI4.pad
  local dir = 0
  if ax <= -dz then dir = -1 elseif ax >= dz then dir = 1 end
  if dir ~= p.dir then
    p.dir, p.t = dir, 0
    if dir ~= 0 then
      print('pad stick x=' .. aiFmt(ax) .. ' y=' .. aiFmt(ay) .. ' dir=' .. dir)
      UI4.padAct(dir < 0 and 'left' or 'right', 'stick')
    end
  elseif dir ~= 0 then
    p.t = (p.t or 0) + dt
    if p.t >= (NUM.PAD.REPEAT_DELAY or 0.30) then
      p.t = p.t - (NUM.PAD.REPEAT_RATE or 0.10)
      UI4.padAct(dir < 0 and 'left' or 'right', 'stick')
    end
  end
  local down = ay <= -dz
  if down ~= p.down then
    p.down, p.dt2 = down, 0
    if down then
      print('pad stick down y=' .. aiFmt(ay))
      UI4.padAct('soft', 'stick')
    end
  elseif down then
    p.dt2 = (p.dt2 or 0) + dt
    if p.dt2 >= (NUM.PAD.REPEAT_DELAY or 0.30) then
      p.dt2 = p.dt2 - (NUM.PAD.REPEAT_RATE or 0.10)
      UI4.padAct('soft', 'stick')
    end
  end
end

-- 手柄动作派发：菜单态 = 焦点导航（官方口径：手柄=焦点导航+快捷键），局内 = 与键盘同一条链
UI4.padAct = function(action, ev)
  if UI4.menuMode and UI4.menuMode() then
    if action == 'left' or action == 'hold' then UI4.focusMove(-1) return end
    if action == 'right' or action == 'soft' then UI4.focusMove(1) return end
    if action == 'ok' or action == 'rot' or action == 'hard' or action == 'help' then
      UI4.focusConfirm()
      return
    end
    return
  end
  if action == 'help' then
    if UI4.helpToggle then UI4.helpToggle() end
    return
  end
  if UI4.runAct then UI4.runAct(action, ev) end
end


layout = function(W, H)
  CANVAS_W, CANVAS_H = W, H
  -- v5.0：布局唯一实现 = lua/tetris/ui.lua（FN.U）。这里只做三件事：
  -- ① 文字样式基线（applyStyle 先跑，模块再按屏覆盖字号/位置）② 退役的 6 个服务端按钮藏掉
  -- ③ 结算层与抖屏复位（它们的几何仍在本文件，因为成员表挂在实例 g 上）。
  -- PC 的 rect 与 v4.0 逐字相同（FN.U 的 planPC 抄的就是这一套数值）⇒ PC 观感不变。
  applyStyle('title', title) applyStyle('hud', hud) applyStyle('hudNext', hudNext)
  applyStyle('best', best) applyStyle('hint', hint)
  applyStyle('keyA', keyA) applyStyle('keyB', keyB) applyStyle('keyC', keyC)
  applyStyle('topBanner', topBanner) applyStyle('botBanner', botBanner)
  if FN.U then
    local okU, errU = pcall(FN.U.apply, nil, (G[2] ~= nil), MODE)
    if not okU then print('ui layout error :: ' .. tostring(errU)) end
  end
  -- v4.0 退役：老的 6 个服务端按钮（btnA..btnF）。真机 SetVisible 不可靠 ⇒ 再挪出画布兜底。
  for _, nm in ipairs({ 'btnA', 'btnB', 'btnC', 'btnD', 'btnE', 'btnF' }) do
    local ctl = find(nm)
    if ctl then
      tryCall(ctl, 'SetVisible', false)
      tryCall(ctl, 'SetAnchoredPosition', 0, -4000)
    end
  end
  if g.settleReady then layoutSettle(W, H) end
  -- 抖动状态必须能被 layout 覆盖后复位：重排后基准坐标仍是创建时那套，直接停抖并写回基准
  if g.shakeT > 0 then stopShake(true) end
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

  -- v6：装配引擎适配层与渲染协调器（platform 是唯一直接调 game.* 的地方）
  if PLATFORM_M and VIEW_LAYERS_M and RENDER_M and VIEW_BOARD_M then
    PT = PLATFORM_M.new({ game = game, root = root, templates = TPL_GUIDS })
    BR = RENDER_M.new({ platform = PT, layers = VIEW_LAYERS_M, log = function(m) print(m) end })
    VB = VIEW_BOARD_M.new({ config = CFG })
    print('v6 boot platform+render+view_board ok')
  end

  -- 平台：移动/触屏才显示可点按钮（PC 端键位卡够了）
  local isMobile = true
  do
    local okDev, dev = pcall(function() return game.GetDevice() end)
    if okDev and type(Enum) == 'table' and Enum.Device then
      isMobile = (dev == Enum.Device.Mobile or dev == Enum.Device.MobileController)
      UI4.isPad = (dev == Enum.Device.Controller or dev == Enum.Device.MobileController)
      print('device=' .. tostring(dev) .. ' mobile=' .. tostring(isMobile)
        .. ' pad=' .. tostring(UI4.isPad))
    else
      print('device=unknown（按移动端处理，按钮可见）')
    end
  end
  IS_MOBILE = isMobile     -- v2.7：菜单选择/热区等模块级函数要读它（local 外提一份）
  -- v4.0 ④：AI 调参锚（用例断言"三档都不再故意失误"）
  do
    local lv1, lv2, lv3 = NUM.AI_LEVELS[1], NUM.AI_LEVELS[2], NUM.AI_LEVELS[3]
    print('ai tune pMistake=' .. tostring(lv1.pMistake) .. ',' .. tostring(lv2.pMistake) .. ',' .. tostring(lv3.pMistake)
      .. ' hold=' .. tostring(lv1.hold) .. ',' .. tostring(lv2.hold) .. ',' .. tostring(lv3.hold)
      .. ' simple=' .. tostring(lv1.simple) .. ' paceK=' .. table.concat(NUM.AI_TUNE and NUM.AI_TUNE.paceK or {}, ','))
  end

  -- 模板 guid 探测（双宿主）：先 cell（image，无光标事件）再 hit（cursor，有光标事件）
  -- 诊断锚（真机排查唯一入口）：脚本挂在哪个节点、用哪份候选表
  do
    local okR, rootName = pcall(function() return root and root.name or '?' end)
    print('diag root=' .. tostring(okR and rootName or '?')
      .. ' cell_cand=' .. tostring(#TPL_GUIDS.cell) .. ' hit_cand=' .. tostring(#TPL_GUIDS.hit)
      .. ' first_cell_guid=' .. tostring(TPL_GUIDS.cell[1]))
  end
  local firstCell, tplGuid = probeTemplate(TPL_GUIDS.cell, false)
  if not firstCell then
    error('tetris: cell 模板 guid 都不可用，候选=' .. #TPL_GUIDS.cell
      .. '（导入后跑 node qxqy/deploy.mjs --calibrate）')
  end
  -- 🔴 v5.4 定位 A13「棋盘左上角恒有一块灰方块」：探针实例是整屏**最先建**的控件，
  -- 而层序=创建序（先建在下）⇒ 复用它当 cell1 时，它被后建的 wash 底色与 boardPlate 背板盖住，
  -- 棋盘首格永远显示底板色（8 张评审图恒在）。修法：探针用完销毁，200 格全部现场新建。
  -- 只多一次 Instantiate + 一次 Destroy（实例上限 430，当前常驻约 240，安全）。
  pcall(function() game.DestroyClientUIControl(firstCell) end)
  firstCell = nil
  print('tpl guid=' .. tplGuid)
  TPL_CELL = tplGuid                    -- T6b-2：G[2] 棋盘控件复用同模板（enterMode 里建）
  -- v2.7 ⑤：cursor 模板 guid **提前**探测（标题页四模式三态热区要用它建实例，
  -- 而 buildMenuCards 在本函数中段就跑；原来这段探测在按钮段，太晚）。探针实例复用给手机热区。
  local hitSeed
  hitSeed, TPL_HIT = probeTemplate(TPL_GUIDS.hit, true)
  if TPL_HIT then print('hit tpl=' .. TPL_HIT) else print('hit tpl=none（无鼠标/触屏热区）') end
  -- 探针实例留在 (0,0) 会变成一个 76×76 的隐形热区压在屏幕正中（qa-shots 审计实测
  -- `phswitch ∩ hit` 重叠 4400px²）⇒ 挪出画布（真机 SetVisible 不可靠，只信坐标）
  if hitSeed then
    pcall(function() hitSeed:SetAnchoredPosition(0, -4000) end)
    pcall(function() hitSeed:SetSizeDelta(4, 4) end)
  end

  -- v2.7 ⑦ 模式主题背景池（层序：先建的在最下 ⇒ 池必须在背板与格子之前建）
  -- 每模式一套构图（config.lua 的 MODE_BG），池容量 = 最大条目数；换模式只换肤，不新建实例
  -- （运行中新建会盖住棋盘，真机 SetVisible(false) 藏不住运行时实例）。
  g.bgPool = {}
  for i = 1, (MODE_BG_POOL or 16) do
    local ctl = instInto(TPL_GUIDS.cell, root, nil)
    if not ctl then break end
    ctl.name = 'bg' .. i
    tryCall(ctl, 'SetSizeDelta', 1, 1)
    tryCall(ctl, 'SetAnchoredPosition', 0, -4000)
    trySet(ctl, 'imageColor', C(0, 0, 0, 0))
    g.bgPool[i] = ctl
  end
  -- 整屏底色压在最下（池第 1 件复用为底色：所有模式都先铺一层深底再构图）
  local wash = g.bgPool[1]
  if wash then
    tryCall(wash, 'SetSizeDelta', W + 20, H + 20)
    tryCall(wash, 'SetAnchoredPosition', 0, 0)
    trySet(wash, 'imageColor', MODE_THEME.casual.bg)
  end
  print('bg pool n=' .. #g.bgPool)

  -- v6 架构：棋盘 = 一份纯描述（view_board）→ render 按**语义层序**创建
  -- 层序 plate(25) < board(30) < frame(35) 由 view_layers 决定，不再取决于「谁先写」。
  -- A13「左上角恒有灰方块」的根因（探针实例建得最早 ⇒ 被 wash/背板盖住）结构上不可能再发生。
  local FRAME_COL = (MODE_THEME[MODE] or MODE_THEME.casual).frame
  -- v5.2：单人局棋盘框染台前角色色（美术评审「刻晴局和纳西妲局一模一样」）
  if MODE == 'casual' and SK and SK.party and SK.party[SK.active or 1] and FN.skillColor then
    local rc = FN.skillDark and FN.skillDark(FN.skillColor(SK.party[SK.active or 1]), 120)
    if rc then FRAME_COL = rc end
  end
  if not (BR and VB) then error('tetris: v6 模块缺失（platform/render/view_board）') end
  g.cells, g.frames = {}, {}
  BR.apply(VB.board {
    plateColor = (MODE_THEME[MODE] or MODE_THEME.casual).plate,
    cellColor = CFG.COL_EMPTY,
    frameColor = FRAME_COL,
  })
  g.plate = BR.ctl('boardPlate')
  for i = 1, COLS * ROWS do
    g.cells[i] = BR.ctl('cell' .. i)
    g.cellBX[i], g.cellBY[i] = VB.cellPos(i)
  end
  for i = 1, 4 do
    g.frames[i] = BR.ctl('frame' .. i)
    g.frameBX[i], g.frameBY[i] = VB.framePos(i)
  end
  print('cellCount=' .. #g.cells)
  if #BR.issues() > 0 then print('board issues=' .. #BR.issues() .. ' :: ' .. BR.issues()[1].msg) end

  -- 结算不用中间遮罩：运行时实例的层级高于服务端文字，遮罩会把结算文字盖掉（实测）
  -- 改为「棋盘暗场 + 顶部/底部大字」，文字始终在棋盘之外，不会被遮挡
  overlay = nil

  -- NEXT 预览：第一块 4 格（18px）；T2 第二块 4 格（14px 缩略、55% 亮度，renderNext 排第一块下方）
  -- T3 Hold 槽复用本表：preview[9..12] = hold1-4（18px，左栏镜像位；不另开 local——200 上限已满）
  g.preview = {}
  for i = 1, 12 do
    local c = game.InstantiateClientUIControl(tplGuid, root)
    if c then
      c.name = i <= 8 and ('next' .. i) or ('hold' .. i - 8)
      c:SetSizeDelta(i <= 4 and 18 or i <= 8 and 14 or 18, i <= 4 and 18 or i <= 8 and 14 or 18)
      c:SetAnchoredPosition(i <= 4 and 400 or i <= 8 and 400 or -400,
        i <= 4 and 175 or i <= 8 and 100 or 175)
      c.imageColor = CFG.COL_BG
    end
    g.preview[i] = c
  end

  -- 结算层**不在 OnStart 建**（2026-10-25 真机：常驻 + SetVisible(false) 不保险 ⇒ 开局白屏、
  -- 重开后结算页残留）。改成第一次 gameOver 时懒创建，重开即销毁 —— 见 showGameOver / newGame。

  title, hud, hudNext, best = find('title'), find('hud'), find('hudNext'), find('best')
  hint, keyA, keyB, keyC = find('hint'), find('keyA'), find('keyB'), find('keyC')
  topBanner, botBanner = find('topBanner'), find('botBanner')
  local okLayout, errLayout = pcall(layout, W, H)
  if not okLayout then print('layout error :: ' .. tostring(errLayout)) end

  -- 引导初始态：等玩家按第一个键（重力暂停，画面静止好读）
  guideStage, bannerTimer, g.taughtLock, g.taughtClear = 0, 0, false, false
  g.flashT, introT, introFont, introPulse = 0, 0, 24, 22   -- introFont/Pulse = 上次写进控件的值（变了才写）
  bestScore = 0
  setText(title, '')
  for _, c in ipairs({ best, hint, keyA, keyB, keyC }) do tryCall(c, 'SetVisible', false) end
  -- T4：入场自演也亮 HUD（AI 战况可见：得分随 AI 消行增长）；best/hint 仍藏到玩家接管
  tryCall(hud, 'SetVisible', true)
  tryCall(title, 'SetVisible', false)
  setText(hint, '键盘操作')
  setText(topBanner, '俄罗斯方块')
  -- v2.1 ②：大视觉卡片承载模式选择；botBanner 呼吸提示改短句+H 说明入口
  setText(botBanner, IS_MOBILE and '点卡片选模式 · 右上角：角色 · 说明'
    or '按 1-4 选模式 · 任意键=休闲 · H 游戏说明')
  local okCards, errCards = pcall(buildMenuCards)
  if not okCards then print('menu cards error :: ' .. tostring(errCards)) end
  pcall(HUD_INST.build)   -- v2.8 ⑤：HUD 实例层（压在背景池之上）
  -- v2.9 ③：标题页藏 HUD 实例（左下角漏「等级 1 已填 0」——stage0 只看展台）
  -- v3.5 ④：含 hudNext/横幅/提示走统一 hideAll（真机 SetVisible(false) 对运行时实例不一定生效
  -- ⇒ 同时挪到画布外 y=-4000；进局由 startIfWaiting「位+显」一起还原）
  if HUD_INST.hideAll then HUD_INST.hideAll() end

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
  -- T6a casual 接管打点：玩家任何游戏键=「玩家在场」——接管中则交还（横幅+日志），计时归零。
  local function playerTouched()
    if TK.state == 'ai' then
      TK.state = 'play'
      setText(topBanner, '')
      trySet(topBanner, 'fontColor', THEME.textMain)
      -- v3.2 原神文案：交还反馈一句话（底部横幅 0.8s，到点由 OnUpdate 落回常驻键位提示）。
      -- 只在不抢横幅时写（bannerTimer>0 表示别处正在演升级/消行，别覆盖）。
      local back = CFG.COPY.takeover.back
      if back and back.live and bannerTimer <= 0 then
        setText(botBanner, back.text)
        trySet(botBanner, 'fontColor', back.color)
        bannerTimer = NUM.COMBO_TIP
      end
      print('takeover back')           -- 玩家任意键交还（v2-plan T6 验收锚）
    elseif TK.state == 'hint' then
      TK.state = 'play'
      setText(topBanner, '')
    end
    TK.t = 0
  end
  -- T6c/d 键位路由（lead 铁律①：事件回调先设 g 再执行动作）：
  --   pvp：方向键(38/39/36/37)/X(Drop)/F(Interact) 归 P2=G[2]，WASD/Space/G 归 P1=G[1]（§3.3 定版）
  --   coop：全部键归共盘 G[1]（P1 旋转手=W/G，P2 行动手=←→↓/X），越权键由 coopAllowed 过滤
  --   casual/ai-battle：全部归 G[1]
  local P2_KEYS = {
    KeyboardCraftspersonKey38Down = true, KeyboardCraftspersonKey39Down = true,
    KeyboardCraftspersonKey36Down = true, KeyboardCraftspersonKey37Down = true,
    KeyboardDropKeyDown = true, KeyboardInteractKeyDown = true,
  }
  local function routePlayer(keyName)
    if MODE == 'pvp' and P2_KEYS[keyName] and G[2] then return G[2] end
    return G[1]
  end
  -- coop 分工过滤（裁决① 用户方案）：P1=旋转手（只 rot/hold），P2=行动手（只 left/right/soft/hard）
  local function coopAllowed(keyName, action)
    if MODE ~= 'coop' then return true end
    local isP1Key = not P2_KEYS[keyName]
    if isP1Key then return action == 'rot' or action == 'hold'
    else return action == 'left' or action == 'right' or action == 'soft' or action == 'hard' end
  end
  local function act(keyName, fn)
    return function()
      -- v2.7：说明页开着时任意游戏键=先关页（不动作、不开局）——关页优先级高于一切玩法动作
      if helpOpen then closeHelp() return end
      -- v5.6：角色页 / 手机引导浮层开着时，游戏键一律吞掉（否则会在浮层后面操作棋盘）
      if (ROSTER and ROSTER.on) or (UI4 and UI4.noteOn) then
        -- F（InteractKey）当成"关闭浮层"，其余键继续吞掉（v5.7）
        if ROSTER and ROSTER.on and keyName == 'KeyboardInteractKeyDown' then
          keyConsumedFrame = frameSeq
          if FN.rosterToggle then FN.rosterToggle() end
          return
        end
        print('key blocked by overlay ' .. tostring(keyName))
        return
      end
      startIfWaiting()
      if guideStage == 3 and GK.phase == 'keys' then
        -- v2.5 ①：双人双方分别 ready（P2 键组=P2 准备 pvp/coop 同判；ai-battle AI 预置就绪）
        if P2_KEYS[keyName] then GK.p2ready = true
        else GK.p1ready = true end
        if MODE == 'ai-battle' then GK.p2ready = true end
        if GK.p1ready then HUD_INST.txt(keyA, 'P1 准备好了 ✓') end
        if GK.p2ready and MODE ~= 'ai-battle' then HUD_INST.txt(keyB, 'P2 准备好了 ✓') end
        setText(hint, (GK.p1ready and GK.p2ready) and '都准备好了！'
          or (GK.p1ready and '等待 P2 准备…' or '等待 P1 准备…'))   -- v2.8 ① ready 进度
        print('guide ready ' .. (P2_KEYS[keyName] and 'p2' or 'p1'))
        if GK.p1ready and GK.p2ready then
          GK.phase, GK.t = 'count', 0
          setText(topBanner, '')
          setText(botBanner, '')
          destroyCountBig()
          CNT = buildCountBig('3')
          print('guide count 3')
        end
        return
      end
      if guideStage == 2 or guideStage == 3 then return end
      if MODE_OVER then return end       -- v2.2 ③：模式终局后冻结双方输入（R 回菜单走独立监听）
      g = routePlayer(keyName)          -- 铁律①：回调内先绑定目标实例
      playerTouched()
      fn()
    end
  end

  -- 动作执行体（KEYMAP 与 P2 补充键共用；g 已由 act 路由到位）
  local function doPlay(action, keyName)
    if not coopAllowed(keyName, action) then return end   -- coop 越权键无效（裁决①）
    if MODE == 'coop' then print('coop act=' .. action .. ' p=' .. (P2_KEYS[keyName] and 2 or 1)) end
    if MODE == 'pvp' and G[2] and g == G[2] then print('p2 act=' .. action) end  -- 双屏日志 p2 前缀
    if action == 'left' then
      g.pieceMoved = true
      g.das.dir, g.das.t, g.das.arr, g.das.hold = -1, 0, 0, 0
      moveBy(-1)
    elseif action == 'right' then
      g.pieceMoved = true
      g.das.dir, g.das.t, g.das.arr, g.das.hold = 1, 0, 0, 0
      moveBy(1)
    elseif action == 'rot' then
      g.pieceRotated = true
      rotate()
    elseif action == 'soft' then
      stepDown(true)
    elseif action == 'hold' then
      NUM.doHold()
    elseif action == 'hard' then
      -- v6：硬降（落点/加分/即时锁定/hardDrop 标记）都在 core_state.hardDrop
      CORE.dispatch(g.core.hardDrop(g))
    end
  end
  -- T8 玩家键 = NUM.KEYMAP 表驱动（原十条散装 listen 收表；DAS 需要方向键 Down+Up 成对监听；
  -- T6 双屏输入路由：act(keyName, fn) 内按 MODE 路由到目标实例，不再散改 listen）
  for _, m in ipairs(NUM.KEYMAP) do
    listen(m.key, act(m.key, function() doPlay(m.action, m.key) end))
    if m.up then
      listen(m.up, function()                              -- T8 DAS：松开清方向（仅清自己按住的那个；T6：清目标实例）
        g = routePlayer(m.key)   -- v3.3 根修：事件回调必须先路由（ai-battle 下 OnUpdate 循环每帧把 g 留成 G[2]，Up 曾清错实例=玩家盘连移永不停）
        if m.action == 'left' and g.das.dir == -1 then g.das.dir = 0 end
        if m.action == 'right' and g.das.dir == 1 then g.das.dir = 0 end
      end)
    end
  end
  -- T6c pvp：P2 硬降 X（Drop）/Hold F（Interact）——v1 KEYMAP 未含，补两条（经同一路由/过滤/日志）
  listen('KeyboardDropKeyDown', act('KeyboardDropKeyDown', function() doPlay('hard', 'KeyboardDropKeyDown') end))
  listen('KeyboardInteractKeyDown', act('KeyboardInteractKeyDown', function() doPlay('hold', 'KeyboardInteractKeyDown') end))
  -- R/Q/H/T 与 anyKeyStart 兜底见下（不进 KEYMAP：它们不是玩法动作键）
  -- T6 标题屏模式选择：Digit1-4（模拟器实证=CraftspersonKey1-4；真机回落字符串路径同 listen）。
  -- 手机端只留 casual（裁决⑨）：isMobile 时 Digit2-4 忽略。
  -- v2.7 ⑤：选择逻辑抽成 menuSelectMode(i)，与鼠标/触屏点卡（MS.buildHoverZones 的 CursorClick）共用同一条入口。
  for i = 1, #MODE_INFO do
    listen('KeyboardCraftspersonKey' .. i .. 'Down', function()
      if keyConsumedFrame == frameSeq then return end
      menuSelectMode(i)
    end)
  end
  listen('KeyboardSwitchToWalkOrRunKeyDown', function()     -- T5 调试切档（具名键不被 anyKeyStart 抢）
    if guideStage ~= 0 then return end
    NUM.AI_LEVEL = NUM.AI_LEVEL % 3 + 1
    local lv2 = NUM.AI_LEVELS[NUM.AI_LEVEL]
    RHO.pieces, RHO.lines = 0, 0
    print('demo level=' .. lv2.name)
    demoLoopReset()
  end)
  -- v2.6 ④：V = 结算后回主页（CraftspersonKey22；所有模式结算通用出口）
  -- v2.7 修用户反馈②③（V 回不到真正的开始页 / 第二次按 1-4 没反应）：
  -- V 自身也落在 43 键兜底池里（v1「任意键开始」），exitToMenu 把 guideStage 置 0 之后，
  -- 同一个按键事件继续派发给兜底监听 ⇒ 刚建好的标题页立刻被 startIfWaiting 吃掉。
  -- 双保险：① mapped 表排除 22（兜底循环不再注册它）② 同帧消费标记让兜底让位。
  listen('KeyboardCraftspersonKey22Down', function() SETTLE_ACT.backHome() end)
  listen('KeyboardCharacterSkill3KeyDown', function()       -- R 重开（键位表态也允许）
    if helpOpen then closeHelp() return end
    startIfWaiting()
    if guideStage == 2 then guideStage = 1 setText(hint, '') end
    -- v2.7（用户反馈⑥）：**结算态 R = 同一模式再开一局**（全模式统一，与结算页文案一致）。
    -- 旧语义「非 casual 的 R = 回标题菜单」已废弃——回标题统一走 [V]。
    if guideStage == 1 and (g.gameOver or MODE_OVER) then
      keyConsumedFrame = frameSeq
      restartMatch()
      return
    end
    -- v2.1 ①：引导态的 R=直接回菜单（还没开局，重开无意义）
    if guideStage == 3 and MODE ~= 'casual' then
      FN.exitToMenu()
      return
    end
    -- T6b：非 casual 模式**局内**的 R=回标题菜单（模式可重选）；casual 保持 v1 就地重开语义
    if MODE ~= 'casual' and guideStage == 1 then
      FN.exitToMenu()
      return
    end
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
    if not (g.gameOver or MODE_OVER) then return end
    -- ① 真结算优先：发信号 → 服务端图 1082130480 → 官方结算页
    if sendSettleSignal() then return end
    -- ② 本机 Lua 无信号通道时的退路：原来的「结算明细」开关
    settleOpen = not g.settleOpen
    local mins = math.floor(g.elapsed / 60)
    local secs = math.floor(g.elapsed % 60)
    local rate = 0
    if g.pieceCount > 0 then rate = math.floor(g.lines * 100 / g.pieceCount) end
    local detail = '等级 ' .. g.level .. '　用时 ' .. mins .. ':' .. string.format('%02d', secs)
      .. '　消行率 ' .. rate .. '%　最高连击 ' .. g.maxCombo
    if g.settleOpen then
      if g.settleReady then
        setText(g.settleExtra, detail)
        tryCall(g.settleExtra, 'SetVisible', true)
      else
        setText(hint, '本局落块 ' .. g.pieceCount .. '　消行 ' .. g.lines .. '　最高 ' .. bestScore)
      end
      print('settle detail on')
    else
      if g.settleReady then
        setText(g.settleExtra, '')
        tryCall(g.settleExtra, 'SetVisible', false)
      else
        setText(hint, '')
      end
      print('settle detail off')
    end
  end)
  -- ===== v2.8 ④：结算三动作（键监听与鼠标热区共用）=====
  SETTLE_ACT.restart = function()   -- = R 键体（重开/回菜单按模式）
    startIfWaiting()
    if guideStage == 2 then guideStage = 1 setText(hint, '') end
    if MODE ~= 'casual' and guideStage == 1 then
      FN.exitToMenu()
      return
    end
    settleDestroy()
    newGame()
    setText(topBanner, '')
    setText(botBanner, '')
    if overlay then tryCall(overlay, 'SetVisible', false) end
    if CANVAS_W and CANVAS_H then
      local okRelayout, errRelayout = pcall(layout, CANVAS_W, CANVAS_H)
      if not okRelayout then print('relayout error :: ' .. tostring(errRelayout)) end
    end
  end
  SETTLE_ACT.backHome = function()  -- = V 键体（含 keyConsumedFrame 防双触，core 修复保留）
    if guideStage ~= 1 then return end
    if g.gameOver or MODE_OVER then
      keyConsumedFrame = frameSeq
      print('menu back V')
      FN.exitToMenu()
    end
  end
  SETTLE_ACT.detail = function()    -- = Q 键体核心（明细切换；结算信号优先路径保留在键监听）
    -- v5.5 修用户 2026-10-30 二轮反馈：「点 Q / 按 Q 都不触发结算」。
    -- 真机日志铁证：连续 `hot settle Q` 但**零条** `settle detail on` ⇒ 被这个 guard 挡掉。
    -- 双盘（pvp/coop/ai-battle）终局置的是 MODE_OVER，g.gameOver 仍是 false ⇒ 三个结算键全部空转。
    if not (g.gameOver or MODE_OVER) then return end
    g.settleOpen = not g.settleOpen
    local mins = math.floor(g.elapsed / 60)
    local secs = math.floor(g.elapsed % 60)
    local rate = 0
    if g.pieceCount > 0 then rate = math.floor(g.lines * 100 / g.pieceCount) end
    local detail = '等级 ' .. g.level .. '　用时 ' .. mins .. ':' .. string.format('%02d', secs)
      .. '　消行率 ' .. rate .. '%　最高连击 ' .. g.maxCombo
    if g.settleOpen then
      if g.settleReady then
        setText(g.settleExtra, detail)
        tryCall(g.settleExtra, 'SetVisible', true)
      else
        setText(hint, '本局落块 ' .. g.pieceCount .. '　消行 ' .. g.lines .. '　最高 ' .. bestScore)
      end
      print('settle detail on')
    else
      if g.settleReady then
        setText(g.settleExtra, '')
        tryCall(g.settleExtra, 'SetVisible', false)
      else
        setText(hint, '')
      end
      print('settle detail off')
    end
  end

  -- H：全屏游戏说明页（v2.7 用户反馈④：H 要常驻、要能真的按出来、要一页讲全规则）
  -- 真机/网页物理键映射（模拟器 studio/play/key-bindings.js 实证，与千星网页同表）：
  --   H → CraftspersonKey15（craftCodes[15]='KeyH'）；E → CharacterSkill1Key。
  -- 旧实现只监听 CharacterSkill1KeyDown ⇒ 真机按 H 根本不触发（用例注入的是虚拟键名，测不出来）。
  -- 两个键名都注册：H=真键，E=别名（键位表已列）。二者任一都可开关说明页。
  local function onHelpKey()
    keyConsumedFrame = frameSeq
    if helpOpen then closeHelp() else toggleHelp() end
  end
  listen('KeyboardCraftspersonKey15Down', onHelpKey)
  listen('KeyboardCharacterSkill1KeyDown', onHelpKey)
  -- 鼠标/触屏：标题页常驻的「H 规则说明」热区（cursor 实例，PC 也可点）
  -- 由 buildMenuCards 里的 MS.helpZone 建；回调在 hit 段统一注册（见下 hits 段）
  -- T：调试填满最底两行（不消行）。消行必须走真实路径——下一次锁定（硬降/落地）时
  -- 由 doLock -> clearLines 处理，用例 04 因此覆盖的是真实消行链路而不是调试旁路。
  listen('KeyboardCharacterSkill4KeyDown', act('KeyboardCharacterSkill4KeyDown', function()
    for rr = ROWS - 1, ROWS do
      for c = 1, COLS do g.board[rr][c] = CFG.COL_BLUE end
    end
    print('debug-fill')
    renderAll()
    renderHud()
  end))

  -- ===== v4.0 设备适配接线（移动端按钮 / 手柄 / 焦点导航）=====
  -- 动作派发一律走键盘同一条链（act(key, fn) + doPlay）：于是"帮助页开着先关页""入场态按键
  -- 既开局也执行动作""MODE_OVER 冻结输入""接管中按键交还"这些语义自动一致，不用重写第二套。
  local PHONE_KEY = {
    left = 'KeyboardMoveLeftKeyDown', right = 'KeyboardMoveRightKeyDown',
    rot = 'KeyboardMoveForwardKeyDown', soft = 'KeyboardMoveBackwardKeyDown',
    hard = 'KeyboardJumpKeyDown', hold = 'KeyboardCraftspersonKey14Down',
  }
  UI4.runAct = function(action)
    local key = PHONE_KEY[action]
    if not key then return end
    act(key, function() doPlay(action, key) end)()
  end
  UI4.helpToggle = function()
    if helpOpen then closeHelp() else toggleHelp() end
  end
  UI4.dispatch = function(action, id)
    if action == 'help' then UI4.helpToggle() return end
    if action == 'roster' then
      if FN.rosterToggle then FN.rosterToggle() end
      return
    end
    if UI4.noteOn then UI4.noteClose() return end
    UI4.runAct(action)
  end
  UI4.menuMode = function()
    if guideStage == 0 then return true end
    local m = G[1]
    return (m and m.gameOver) or MODE_OVER
  end
  UI4.focusMove = function(step)
    if guideStage ~= 0 then return end
    local n = #MODE_INFO
    UI4.focus = (UI4.focus or 1) + step
    if UI4.focus < 1 then UI4.focus = n end
    if UI4.focus > n then UI4.focus = 1 end
    if MS.hoverCard then pcall(MS.hoverCard, UI4.focus) end
    if MS.zones and MS.zones[UI4.focus] then
      pcall(function() game.SetControllerFocus(MS.zones[UI4.focus]) end)
    end
    print('pad focus i=' .. UI4.focus)
  end
  UI4.focusConfirm = function()
    local i = UI4.focus or 1
    print('pad confirm i=' .. i)
    if guideStage == 0 then menuSelectMode(i) return end
    if UI4.menuMode() and SETTLE_ACT.restart then SETTLE_ACT.restart() end
  end
  pcall(UI4.build, isMobile)         -- 移动端 6 键 + 说明键（客户端实例层）
  pcall(UI4.padBind, listen)         -- 手柄 24 条 Controller 事件（探针 + 映射）
  print('v4 device mobile=' .. tostring(isMobile) .. ' pad=' .. tostring(UI4.isPad)
    .. ' phone=' .. #(UI4.btns or {}))
  -- ===== v4.0 ③ 角色技能：状态机 + Z/U/Y 键 =====
  if SKILLS and SKILLS.newState then
    local okS, st = pcall(SKILLS.newState, { partyMax = 2, startRoles = { 'nahida' } })
    if okS and st then
      SK = st
      print('skills ready active=' .. tostring(SK.active) .. ' party=' .. tostring(#(SK.party or {}))
        .. ' unlocked=' .. tostring((SKILLS.snapshot and SKILLS.snapshot(SK).unlockedCount) or '?'))
    else
      print('skills newState fail')
    end
  else
    print('skills module=none')
  end
  -- Z=技能1（CraftspersonKey12）/ U=技能2（11）/ Y=切前台（13）
  -- ⚠ 这三条**不走 act() 包装**：act() 会调 playerTouched()（把"任何游戏键"当成玩家要接回控制权），
  -- 而按技能键时 AI 代打可能正在进行——走 act 会把刚放出来的技能自己取消掉（2026-10-29 实测：
  -- 第二次按 Z 撞 CD，日志里没有 skill ai end，接管被 playerTouched 打断了）。
  -- v6：记录技能键的按住秒数（刻晴「长按·跨地形」判 ≥0.35s）
  FN.skillKeyHoldSec = 0
  local function skillKeyUpWatch(name)
    listen(name, function() FN.skillKeyHoldSec = 0 end)
  end
  local function skillKey(fn, keyName)
    return function()
      FN.skillKeyHoldSec = tonumber(FN.skillKeyHoldSec) or 0
      if helpOpen then closeHelp() return end
      -- v5.7（用户 2026-10-30「兄弟一堆 bug」）：角色页开着时，**同一颗开关键必须还能关**。
      -- 之前 skillKey 不看 ROSTER.on、act() 又把所有键吞掉 ⇒ 只能鼠标点「合上」，
      -- 键盘玩家直接**卡在角色页里出不来**（真机日志：连续 30+ 条 key blocked by overlay，零条 roster close）。
      if ROSTER and ROSTER.on then
        if keyName == 'KeyboardCraftspersonKey16Down' then
          keyConsumedFrame = frameSeq
          if FN.rosterToggle then FN.rosterToggle() end
        else
          print('key blocked by overlay ' .. tostring(keyName))
        end
        return
      end
      startIfWaiting()
      -- 角色页/说明页**不要求** guideStage==1：它们从标题页就能开，也就必须能关
      if guideStage ~= 1 or MODE_OVER or (g and g.gameOver) then
        if keyName == 'KeyboardCraftspersonKey16Down' and FN.rosterToggle then FN.rosterToggle() end
        return
      end
      fn()
    end
  end
  -- v6：刻晴「长按·跨地形」需要按住时长 ⇒ 她的 Z 改为**松手施放**（其余角色仍然按下即放，
  -- 保持"按键有即时反应"的手感）
  local skillDownT = 0
  local function skillFrontName()
    return (FN.skillRoleOf and FN.skillRoleOf(1)) or 'nahida'
  end
  listen('KeyboardCraftspersonKey12Down', function()
    skillDownT = (g and g.elapsed) or 0
    if skillFrontName() ~= 'keqing' then
      skillKey(function() FN.skillCast(1) end)()
    end
  end)
  listen('KeyboardCraftspersonKey12Up', function()
    if skillFrontName() == 'keqing' then
      FN.skillKeyHoldSec = math.max(0, ((g and g.elapsed) or 0) - skillDownT)
      skillKey(function() FN.skillCast(1) end)()
    end
  end)
  listen('KeyboardCraftspersonKey11Down', skillKey(function() FN.skillCast(2) end, 'KeyboardCraftspersonKey11Down'))
  listen('KeyboardCraftspersonKey13Down', skillKey(function()
    -- 模块没有 switchRole：state.active 是 party 的 1-based 下标，翻一格即可（一局最多 2 人 ⇒ 1↔2）
    if not (SK and SK.party and #SK.party > 0) then return end
    local n = #SK.party
    SK.active = ((SK.active or 1) % n) + 1
    FN.skillHud()
    print('skill switch ok=true active=' .. tostring(SK.active) .. ' role=' .. tostring(SK.party[SK.active]))
  end))
  listen('KeyboardCraftspersonKey16Down', skillKey(function() FN.rosterToggle() end, 'KeyboardCraftspersonKey16Down'))
  -- 调试：Key30 = 解锁全部角色（只给用例/开发用；真机玩家拿不到这张键位表说明）
  listen('KeyboardCraftspersonKey30Down', skillKey(function()
    if not (SK and SKILLS) then return end
    for _, role in ipairs(SK.roles or {}) do
      if SK.unlocked[role] ~= true then
        local ok, why = SKILLS.tryUnlock(SK, role, 'lines:99999,games:99999,tetris:99999,pvp:99999,time:99999')
        if ok then print('skill unlock role=' .. role .. ' ok=true why=debug') end
      end
    end
    -- 调试专用：把 partyMax 抬到全角色数并让全部入队（真机玩家无从触发；只给用例铺场景）
    SK.partyMax = #(SK.roles or {})
    SK.party = {}
    for _, role in ipairs(SK.roles or {}) do
      if SK.unlocked[role] == true then SK.party[#SK.party + 1] = role end
    end
    SK.active = 1
    print('skill debug unlock all party=' .. tostring(#(SK.party or {}))
      .. ' active=' .. tostring(SK.party[1] or '-'))
  end))

  -- 入场态兜底：43 个可编程键位里凡是没被上面映射的，都只做"开始游戏"这一件事
  -- T6：1-4=标题屏模式选择键（Digit1-4，先于本兜底注册）——排除，防兜底抢先以 casual 开局吃掉模式选择
  -- v2.7：15(H)/22(V) 也必须排除——它们各有真动作（说明页 / 回主页），落进兜底会「同一个键既回主页又开局」
  -- （用户反馈②③的根因；见 keyConsumedFrame 注释）。表由「已绑定动作」派生，别只加数字不写理由。
  local mapped = {
    [1] = true, [2] = true, [3] = true, [4] = true,   -- Digit1-4 = 模式选择
    [15] = true,                                      -- H = 规则说明页（CraftspersonKey15='KeyH'）
    [22] = true,                                      -- V = 结算后回主页（CraftspersonKey22='KeyV'）
    [36] = true, [37] = true, [38] = true, [39] = true, -- ↑↓←→ = 旋转/软降/移动
    -- v6.1：技能/Hold/档案/调试键也必须排除。它们在上面的 listen 里已有真动作，
    -- 落进兜底就变成「同一个键两个监听」——行为取决于注册顺序，输入 bug 因此不可复现。
    -- 兜底语义不丢：这六个动作的执行体自己都调 startIfWaiting()（见 FN.skillCast / act()）。
    [11] = true,                                      -- U = 技能2
    [12] = true,                                      -- Z = 技能1
    [13] = true,                                      -- Y = 切台前角色
    [14] = true,                                      -- G = 暂存
    [16] = true,                                      -- 角色档案
    [30] = true,                                      -- 调试：解锁全部角色
  }
  local anyKeyStart = function()
    if keyConsumedFrame == frameSeq then return end     -- 同一帧已被真动作消费 ⇒ 兜底让位
    if guideStage == 0 then startIfWaiting() end
    if guideStage == 3 and GK.phase == 'keys' then
      GK.p1ready = true
      if MODE == 'ai-battle' then GK.p2ready = true end
      HUD_INST.txt(keyA, 'P1 准备好了 ✓')
      setText(hint, (GK.p1ready and GK.p2ready) and '都准备好了！' or '等待 P2 准备…')
      print('guide ready p1')
      if GK.p1ready and GK.p2ready then
        GK.phase, GK.t = 'count', 0
        setText(topBanner, '')
        setText(botBanner, '')
        destroyCountBig()
        CNT = buildCountBig('3')
        print('guide count 3')
      end
    end
  end
  for i = 1, 43 do
    if not mapped[i] then
      listen('KeyboardCraftspersonKey' .. i .. 'Down', anyKeyStart)
    end
  end

  -- 先开局：即使某个键名注册失败，棋盘与重力也应正常跑（入场态暂停重力）
  local okNew, errNew = pcall(newGame)
  if not okNew then print('newGame error :: ' .. tostring(errNew)) end
  -- v2.3 ④：标题页棋盘弱化——复用结算压暗通道（dimRatio 0.45），卡片成视觉主体；
  -- startIfWaiting / demoLoopReset 进局时复位 0。renderAll 后必须补 renderPiece
  -- （renderAll 只画已锁块，会把活动块 4 格擦成空色——v2.2 前就有此语义，单独调用时别忘）。
  g.dimRatio, g.dimApplied = 0.45, -1
  renderAll()
  renderPiece()
  print('menu dim board')
end


-- 单盘状态推进（T0 Step3：抖屏/闪白/结算动画/用时/锁定延迟/DAS/重力）。
-- OnUpdate 对 ACTIVE 每实例调用一次；内部全部经 g（闭包共享 upvalue）作用于当前盘。
-- 铁律（v2 设计书 §1.8 Step3）：事件回调先 `g = G[player]` 再执行动作；
-- 跨实例交互（T7 垃圾行）入口保存 g → 切目标 → 操作 → 还原。
-- @region ui-mobile END (writer: ui-mobile)
-- @region skill-tick (writer: lead) BEGIN
FN.tickInstance = function(d)
  -- 抖屏：只在 shakeT > 0 的帧写坐标；到点复位一次后就不再碰任何控件
  if g.shakeT > 0 then
    g.shakePhase = g.shakePhase + d
    g.shakeT = g.shakeT - d
    if g.shakeT <= 0 then
      g.shakeT, g.shakePhase = 0, 0
      applyShake(0, 0)
      print('shake end')
    else
      local u = 1 - g.shakeT / g.shakeDur                        -- 0（刚触发）→ 1（结束）
      local decay = math.exp(-3 * u)                         -- 指数衰减
      local ox = g.shakeAmp * decay * math.sin(g.shakePhase * SHAKE_FREQ)
      local oy = g.shakeAmp * decay * math.cos(g.shakePhase * SHAKE_FREQ * 1.3)
      applyShake(ox, oy)
    end
  end
  if g.flashT and g.flashT > 0 then   -- nil 守卫（v2.1）：v1 nil 初值 + G[2] 开局即 tick，防每帧炸断 OnUpdate
    g.flashT = g.flashT - d
    if g.flashT <= 0 then g.flashT = 0 renderAll() end
  end
  if g.gameOver then settleTick(d) end          -- 结算层四段动画（0→0.9s）
  if guideStage == 1 and not g.gameOver then g.elapsed = g.elapsed + d end
  -- T8 锁定延迟推进（玩家局）：重力触底后 0.5s 缓冲，期间移动/旋转已重置计时（见 moveBy/rotate）
  -- v6：锁定延迟推进在 core_state.tickLockDelay（与下面的重力分开，保住"LD → DAS → 重力"的帧内顺序）
  CORE.dispatch(g.core.tickLockDelay(g, d))
  -- T8 DAS/ARR（玩家局，只对按住的方向键生效；AI/手机热区不走这里）
  -- v2.6 根治「按一下走到底」：网页旧构建 keyup 转发丢失（或焦点转移吞 keyup）会让 dir 永不清零，
  -- 点按也触发完整 DAS+ARR 连走。时间上限（DAS_HOLD）取代 v2.1 的步数上限：ARR 激活累计 hold，
  -- 达 0.6s 强制清 dir——lua 层不依赖 Up 事件自愈；真机/新版网页 Up 正常时提前清、永不触及上限
  --（v2.8 0.35s：长按用户最多连走 ~7 格后需重按一次——比「单击飞到底」轻微得多；真机 Up 正常时此上限永不触发）。
  if g.das.dir ~= 0 and not g.gameOver then
    g.das.t = g.das.t + d
    if g.das.t >= NUM.DAS_DELAY then
      g.das.hold = g.das.hold + d
      g.das.arr = g.das.arr + d
      while g.das.arr >= NUM.ARR_RATE and g.das.dir ~= 0 do
        g.das.arr = g.das.arr - NUM.ARR_RATE
        moveBy(g.das.dir)
      end
      if g.das.hold >= NUM.DAS_HOLD then
        g.das.dir = 0               -- 持续上限：强制停（Up 丢失自愈；正常按住最多损失 0.6s 后的重按）
        print('das stop reason=timeout hold=' .. string.format('%.2f', g.das.hold))
      end
    end
  end
  -- v6：重力累加（acc/guard/tickCount/pieceAge/perTicks）在 core_state.tickGravity；
  -- 甘雨「天地交泰」的重力倍率通过 spec.gravityMult 注入（冻结期内重力间隔 ×1.20）。
  CORE.dispatch(g.core.tickGravity(g, d))
end

-- ===== v5.6 画布尺寸轮询（用户 2026-10-30 移动端一-1「背景没覆盖全部画面」的根因）=====
-- 真机上 UI 分辨率由设备决定（官方教程：16:9 / 21:9 会变），而 GetUICanvasSize 只有在
-- **重进关卡/切分辨率**后才反映新值。旧实现只在 OnStart 读一次 ⇒ 之后拿到的一直是开局那个
-- 1600×900，背景 wash 只铺 1620×920，两侧露出世界场景（用户截图：左右各有约 60px 风景）。
-- 修法：每 20 帧问一次画布尺寸，变了就整套重排（layout + 背景 + HUD + 控件树）。
-- ⚠ main chunk 贴着 Lua 5.3 的 **200 local 硬上限**（真机编译期直接报
-- `too many local variables (limit is 200) in main function`）。所以这段不能再占 local，
-- 全部挂到 FN 表上（新增 2 个 local 就会炸真机）。
FN.pollCanvasSize = function()
  local ok, w, h = pcall(function() return game.GetUICanvasSize() end)
  if not ok or type(w) ~= 'number' or type(h) ~= 'number' then return end
  if math.abs(w - (CANVAS_W or 0)) < 2 and math.abs(h - (CANVAS_H or 0)) < 2 then return end
  local oldW, oldH = CANVAS_W or 0, CANVAS_H or 0
  CANVAS_W, CANVAS_H = w, h
  print('canvas resize from=' .. oldW .. 'x' .. oldH .. ' to=' .. w .. 'x' .. h)
  pcall(function() layout(w, h) end)
  pcall(function() applyModeTheme(MODE) end)
  if UI4 and UI4.sync then pcall(UI4.sync, true) end
  if FN.skillHud then pcall(FN.skillHud) end
  if HUD_INST and HUD_INST.build then pcall(HUD_INST.build) end
  if ROSTER and ROSTER.on and FN.rosterBuild then pcall(FN.rosterBuild) end
  if helpOpen then pcall(buildHelpLayer) end
end

function OnUpdate(dt)
  local d = tonumber(dt) or 0
  if d <= 0 then return end
  FN.canvasPoll = (FN.canvasPoll or 0) + 1
  if FN.canvasPoll % 20 == 0 then pcall(FN.pollCanvasSize) end
  -- 展台存在性每 6 帧对一次（只在状态真的翻转时才建/拆，成本≈0）
  FN.stagePoll = (FN.stagePoll or 0) + 1
  if FN.stagePoll % 6 == 0 then
    if not FN.syncStage then
      if not FN.dbgNoSync then FN.dbgNoSync = true print('syncStage MISSING') end
    else
      local ok2, err2 = pcall(FN.syncStage)
      if not ok2 and not FN.dbgSyncErr then FN.dbgSyncErr = true print('syncStage ERR :: ' .. tostring(err2)) end
    end
  end
  -- v4.0：触屏连发与手柄摇杆必须在"帮助页时停"早退**之前**推进——否则帮助页开着时
  -- 移动端「合上」按钮和手柄的返回键都按不动（旧代码在 helpOpen 时整帧 return，正是这个坑）。
  if UI4.tick then UI4.tick(d) end
  if UI4.padTick then UI4.padTick(d) end
  if UI4.syncVisible then UI4.syncVisible(MODE_OVER or ((G[1] and G[1].gameOver) and true or false)) end
  -- v4.0 ③ 甘雨冰封倒计时（独立于技能 CD：技能 CD 是"下次能不能放"，冰封是"效果还剩多久"）
  if SK and SK.freezeT and SK.freezeT > 0 then
    SK.freezeT = SK.freezeT - d
    if SK.freezeT <= 0 then
      SK.freezeT = 0
      print('skill freeze end')
    end
  end
  -- v4.0 ③：技能时钟（能量自然回复 / CD 递减）——时停时也走，玩家开帮助不会白等冷却
  -- v5.0：技能计时器（接管倒计时/上横幅回收/特效推进）。帮助页是"时停"，
  -- 所以接管倒计时跟着停（FX 与横幅仍走，不然帮助页里特效会僵在半空）。
  if FN.skillTick then
    pcall(FN.skillTick, d, not (helpOpen and guideStage == 1 and not g.gameOver))
  end
  -- v6 天赋：执行延后效果（甘雨冰莲到点绽放等）
  if SK and SKILLS and SKILLS.drain then
    local okD, listD = pcall(SKILLS.drain, SK)
    if okD and type(listD) == 'table' then
      for di = 1, #listD do pcall(FN.dispatchEffect, g, listD[di]) end
    end
  end
  if SK and SKILLS and SKILLS.tick then
    pcall(SKILLS.tick, SK, d)
    SK.hudT = (SK.hudT or 0) + d
    if SK.hudT >= 1 then
      SK.hudT = 0
      FN.skillHud()
    end
    SK.logT = (SK.logT or 0) + d
    if SK.logT >= 5 then
      SK.logT = 0
      local snap = SKILLS.snapshot and SKILLS.snapshot(SK) or {}
      print('skill state active=' .. tostring(snap.active) .. ' lv=' .. tostring(snap.lv)
        .. ' tier=' .. tostring(snap.tier) .. ' cd=' .. tostring(snap.cd) .. ' energy=' .. tostring(snap.energy))
    end
  end
  -- v2.8 ②：局内开帮助=游戏时停（重力/AI/接管计时全停；结算态不冻结）。关闭即恢复。
  if helpOpen and guideStage == 1 and not g.gameOver and not MODE_OVER then return end
  frameSeq = frameSeq + 1          -- 帧号：按键回调与本次 OnUpdate 同帧 ⇒ sfx 帧闸生效
  g = G[1]                         -- 主流程段（横幅/演出/自演）作用于主盘（v1 语义）
  if bannerTimer > 0 and not g.gameOver then
    bannerTimer = bannerTimer - d
    if bannerTimer <= 0 then
      bannerTimer = 0
      setText(hint, '')
      if guideStage == 1 and PERSIST_TIP ~= '' then   -- v2.6 ① 恢复常驻
        trySet(botBanner, 'fontSize', 20)
        setText(botBanner, PERSIST_TIP)
      else
        setText(botBanner, '')
      end
    end
  end
  if guideStage == 0 then
    -- v2.1 ② 模式名进入动画窗（0.5s）：模式名大字 26→64 渐变，窗后 enterMode 开局。
    -- 动画期间停演出与 AI 自演（视觉主角让给模式名）。
    if pendingMode then
      pendingT = pendingT + d
      local size = math.min(64, 26 + math.floor(pendingT * 90))
      if MS.big then
        if size ~= MS.pendingSize then      -- 展台标题实例演模式名（服务端横幅被墙压住）
          MS.pendingSize = size
          trySet(MS.big, 'fontSize', size)
        end
      else
        trySet(topBanner, 'fontSize', size) -- 无展台兜底
      end
      if pendingT >= 0.5 then
        pendingMode = nil
        trySet(topBanner, 'fontSize', 34)
        trySet(topBanner, 'fontColor', C_GOLD2)
        FN.enterMode()
        startIfWaiting()
      end
      return
    end
    -- 入场演出：标题 26→40 渐大（topBanner 被展台标题盖住，这两行保留作无展台兜底）
    -- + 底部分段提示条动效（v2.4 ①：3 段轮播/呼吸，见 MS.tick）
    introT = introT + d
    local size = math.min(40, 26 + math.floor(introT * 12))
    if size ~= introFont then
      introFont = size
      trySet(topBanner, 'fontSize', size)
    end
    MS.tick()
    autoTick(d)   -- AI 自演：选位→旋转→逐格横移→硬降→消行→下一块，玩家按键即交还控制
    -- v2.1 C：AI 消行的分数弹跳（前半 26 号放大、后半回 20；框高 40 按 26×1.45+4=41.7 微超但
    -- trySet 只在帧内短暂生效且 hud 框实测容差足够——真机/网页上「AI 在得分」一眼可见）
    if g and g.AI and g.AI.fx > 0 then
      g.AI.fx = g.AI.fx - d
      trySet(hud, 'fontSize', g.AI.fx > 0.25 and 26 or 20)
      if g.AI.fx <= 0 then g.AI.fx = 0 trySet(hud, 'fontSize', 20) end
    end
    return
  end
  if guideStage == 3 then
    -- v2.1 ① 引导态：keys=键位说明（任意键确认）→ count=3-2-1 倒计时 → 开局。全冻结。
    GK.t = GK.t + d
    if GK.phase == 'count' then
      if CNT then
        trySet(CNT, 'fontSize', 120 + math.floor(26 * math.sin(GK.t * math.pi)))
      end
      if GK.t >= 1 then
        GK.t = 0
        GK.count = GK.count - 1
        if GK.count <= 0 then
          guideStage = 1
          GK.phase = 'keys'
          destroyCountBig()
          setText(topBanner, '')
          setText(botBanner, '')
          setText(hint, '')                 -- v3.5 ③：倒计时结束即清准备提示（否则「等待 P1 准备…」留到对局期）
          -- v2.2 ①：引导结束，keyA/keyB 从盘下说明位复位回战况位（layout 全量+双屏重摆）
          if G[2] and CANVAS_W and CANVAS_H then
            pcall(layout, CANVAS_W, CANVAS_H)
            FN.layoutDual()
          end
          renderHud()
          -- v3.5 ⑦：对家盘 HUD 立刻刷一次——右栏此前要等 AI 落子（spawn→renderHud）才从
          -- 「P1 准备好了 ✓」变成「AI 盘」，对局前 0.5~2s 里右栏是准备期残留文案（用例 25 实测）。
          if G[2] then
            local saveG = g
            g = G[2]
            renderHud()
            g = saveG
          end
          showPersistTip()             -- v2.6 ① 双屏常驻提示
          print('guide start')
          print('guide stage=1')
          return
        end
        if CNT then CNT.text = tostring(GK.count) end
        print('guide count ' .. GK.count)
      end
    end
    return
  end
  if guideStage ~= 1 then return end   -- 等待开始 / 键位表 都不跑重力
  -- T6a casual 局中接管（v2-plan §三 T6 / 设计书 §2.2）：idle 检测=任意游戏键（act 打点归零）。
  -- play→5s 无操作→hint（提示 2s）→ai（AI 代打续算不清零，分数继续入玩家账=裁决⑤）→任意键交还。
  -- 只在 casual；其他模式本波无接管语义。
  -- v5.0 接管状态机（用户 2026-10-29 第三条：按 Z 在 AI 对抗里完全没反应）
  -- 旧实现的问题：整个 TK 块被 `if MODE == 'casual'` 包住，而 FN.skillCast 在**所有模式**里都会
  -- 置 TK.state='ai' ⇒ ai-battle/pvp/coop 下没有任何消费方，技能等于空转（真机 11:04 日志里
  -- `skill cast ok=true effect=ai-takeover` 之后没有任何 `skill ai` 后续动作，正是这个）。
  -- 现在拆成两段：①「闲置自动接管」只在 casual（idle 判定本局语义务）②「接管执行」所有模式共用。
  TK.takeFrame = false
  if not g.gameOver then
    if MODE == 'casual' then
      TK.t = TK.t + d
      -- 技能横幅正在播（FN.SK.topT>0）时，闲置提示让位：否则会看到"小草神看着你的盘面"
      -- 把刻晴/甘雨的名卡顶掉（2026-10-29 出图实测，0.1s 帧上就能看到）
      local bannerBusy = (FN.SK.topT or 0) > 0
      -- v5.38：NUM.TK_PLAY_S = nil ⇒ 这条链整体关闭（不再有「停手 3s 出提示 → 再 3s AI 接管」）。
      -- 接管只走纳西妲 E 技能（FN.skillCast → ai-takeover）。恢复旧行为把 config 里两个常量改回 3。
      -- 新规矩的验收锚（v5.40）：停手不再接管，只在停手 3 秒时打一行「技能才接管」。
      -- 用例 23/40 用它断言「机制已废除」，而不是删掉测试（删测试=丢掉回归）。
      if not NUM.TK_PLAY_S and TK.state == 'play' and TK.t >= 3 and not TK.offLogged then
        TK.offLogged = true
        print('takeover off (skill only)')
      end
      if NUM.TK_PLAY_S and TK.state == 'play' and TK.t >= NUM.TK_PLAY_S then
        TK.state, TK.t = 'hint', 0
        if not bannerBusy then
          if ROSTER and ROSTER.on then return end
          FN.topBannerStyle(24)
          local actRole = (SK and SK.party and SK.party[SK.active or 1]) or nil
          local actName = (FN.skillName and actRole and FN.skillName(actRole)) or '伙伴'
          setText(topBanner, actName .. '：再不动手，我就要来帮忙啦')
          trySet(topBanner, 'fontColor', C(255, 127, 207, 106))
        end
        print('takeover hint')
      elseif NUM.TK_HINT_S and TK.state == 'hint' and TK.t >= NUM.TK_HINT_S then
        TK.state, TK.t = 'ai', 0
        if not bannerBusy then
          FN.topBannerStyle(24)
          setText(topBanner, '纳西妲：交给我吧 · 按任意键接手')
          trySet(topBanner, 'fontColor', C(255, 127, 207, 106))
        end
        print('takeover ai')
      end
    end
    if TK.state == 'ai' then
      local saveG2 = g
      g = G[1]
      local tier = TK.skillTier
      if not tier then
        if TK.prevState ~= 'ai' then
          local lv = 1
          if g.level >= 8 then lv = 3
          elseif g.level >= 5 then lv = 2 end
          if g.AI.assistLv ~= lv then
            g.AI.assistLv = lv
            print('ai assist lv=' .. lv)
          end
          TK.prevState = 'ai'
        end
        tier = g.AI.assistLv or 1
      end
      FN.aiTickCore(d, 'stop', tier)
      TK.takeFrame = true
      g = saveG2
    elseif TK.state ~= 'ai' then
      TK.prevState = nil
    end
  end
  -- v2.2 ③：模式终局——冻结两盘（重力/DAS/AI 全停），只推终局方的结算层动画。
  if MODE_OVER then
    for i = 1, #ACTIVE do
      g = ACTIVE[i] and G[ACTIVE[i]] or G[1]
      if g.gameOver then settleTick(d) end
    end
    return
  end
  for i = 1, #ACTIVE do
    g = ACTIVE[i] and G[ACTIVE[i]] or G[1]
    -- v5.0：接管帧里玩家盘由 aiTickCore 驱动，别再叠加一次重力/锁定 tick（会双倍下落）
    local skipTick = TK.takeFrame and (G[ACTIVE[i]] == G[1])
    -- T6b：AI 盘驱动（i==2）——作用于 G[2]（闭包 g 已切）；盘死即停（胜负在 showGameOver 收口）
    if (MODE == 'ai-battle' or MODE == 'coop') and i == 2 then
      FN.aiTickCore(d, 'stop')
    end
    if not skipTick then FN.tickInstance(d) end
  end
end

-- @region skill-tick (writer: lead) END
function OnDestroy() end
function OnDestroy() end
