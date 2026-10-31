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
-- v6.6：TEMPLATES 是模板探测结果的唯一载体（cell/hit/stext），由 templates 模块在 OnStart 填充；
-- 先建空表 ⇒ 早于 OnStart 的读取是 nil 而不是"未定义全局"（可读，也不会静默假绿）。
TEMPLATES = { cell = nil, hit = nil, stext = nil }
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
pendingMode, pendingT = nil, 0
-- v2.1 ③：H 游戏说明层（v2.7 起改成独立整页 + 常驻入口；任意键=先关层不开局）
-- v6.3 说明页：纯描述 + 独立 render 实例（与 SETTLEV 同一套手法，绝不复用棋盘 BR）
-- 为什么必须独立：BR 每帧只喂棋盘那 200+ 个 key，把手册喂给它会把棋盘当场判成"不在列表"销毁。
HLV = { M = loadModule('view_help'), KIT_M = loadModule('view_kit'), KIT = nil, S = nil,
        R = nil, live = false, n = 0, nodes = nil }
-- v2.8 ④：结算三动作挂表（200-local 红线，D612 先例）——实现在 OnStart 赋值，showGameOver 热区引用
local SETTLE_ACT = {}
-- v6.2 结算屏：`view_settle` 纯描述 + **独立** render 实例 SR（不复用棋盘协调器 BR）。
-- 为什么必须独立：BR 每帧 `BR.apply(...)` 只喂棋盘那 200+ 个 key，把结算描述喂给它，它会把
-- 棋盘全部判成"不在列表里"当场销毁。SR 只在结算时 SR.clear()→SR.apply(一份描述)，离开即 clear()。
-- 为什么挂表不挂 local：main chunk 的 local 数量贴着 Lua 5.3 硬上限 200（D591/D612 教训）。
local SETTLEV = { M = nil, KIT_M = nil, KIT = nil, S = nil, SR = nil, live = false }
-- v6.4 标题屏：`view_title` 纯描述 + **独立** render 实例 TR（与 SETTLEV/HLV 同一套手法，绝不复用棋盘 BR）。
-- 为什么独立：BR 每帧只喂棋盘那 200+ 个 key，把展台/卡片喂给它 ⇒ 棋盘会被当场判成"不在列表"销毁。
-- 为什么挂一张表：main chunk 的 local 贴着 200 上限（D591/D612），整屏的状态都收进字段。
local TITLEV = { M = nil, KIT_M = nil, KIT = nil, S = nil, R = nil, live = false, n = 0,
  zones = {}, hover = nil, press = nil, sel = nil, noteIdx = 1, noteKey = nil,
  hintKey = nil, pendingMode = nil, pendingSize = nil }
-- v6.5 预览列：`view_preview` 纯描述 + **独立** render 实例 R（理由同 SETTLEV/TITLEV：
-- 绝不复用棋盘 BR——BR 每帧只喂棋盘那 200 个 key，喂它别的东西会把棋盘当场销毁）。
-- 12 颗格子（下下块 8 + 暂存 4）每帧重算描述交给 render 做 diff：值没变就不写控件。
-- 标题「下一个/暂存」仍由服务端 textbox（hudNext/holdLab）负责 ⇒ 描述带 noLabel。
-- 引擎侧控件名沿用现网 next1..next8 / hold1..hold4（legacyNames），render 键仍是 pv*。
local PVW = { M = loadModule('view_preview'), S = nil, R = nil, n = 0, sig = nil, parked = false }
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
  t.settleOn, t.settleT, t.settleDone = false, 0, false
  t.settleFade = -1
  t.settleSize = 44
  t.settleTitleY = 150
  t.settleTitleOff = 420
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
local settleDestroy                   -- 定义见「结算层」段（前向声明；v6.2 只剩它）
local layout                              -- 布局函数前向声明（exitToMenu 在它定义之前就调用）
bestScore = 0                                  -- 历史最佳（全局共享，裁决⑥）
-- v2.4 ① 标题页「展台」实例表（MS）：v6.4 起渲染全部交给 view_title 的纯描述，
-- 这张表只剩配色/文案常量、背景池告警位与几个**行为**入口（teardown/tick/hover/select 转到
-- TITLEV 的实现；startIfWaiting 更早就调 MS.teardown()，那时方法已在运行时挂好）。
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
  -- 浮层（帮助/结算/档案）打开时，服务端 textbox 仍在运行时实例**之上**（实测 sk1name z=42
  -- 压着结算卡 z=51），只能靠"不写"来隐藏。以前只在 HUD_INST.txt 一条通道做了抑制，
  -- 技能名/状态这类走裸 setText 的控件就会透出来（2026-10-31 出图抓到的"纳西妲"）。
  -- 这里做成系统性抑制：任何服务端 textbox 写入在浮层期间一律不生效，除非显式强制（清空时用）。
  -- 只抑制**非空写入**：清空（''）必须放行，否则"浮层时收起技能条"这类既有清屏逻辑
  -- 会被自己拦住（写空被挡 ⇒ 文字留在屏幕上，正好反了）。
  -- 🔴 v6.4 修「结算遮罩下透出"纳西妲"」：以前这里是**两条** return——
  --   ①非空写入丢弃（对）；②`if FN.textLayerHidden then return end`（**把清空也吞了**）。
  -- 于是 syncStage 每帧都在清 sk1name/sk1state…（置 textForce=true 后 setText(c,'')），
  -- 每一帧都被第②条拦回 ——"清了但还在"的真因就是它（探针实测：hidden=true force=true 仍 DROP）。
  -- 现在只保留一条：浮层期间**除强制清屏外**一律不写；清屏阶段靠 textForce 放行。
  if FN.textLayerHidden and not FN.textForce then return end
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
local INPUT_M = loadModule('input_map')   -- v6.1 键位唯一真源（动作表 + 一次注册 + 栈式分发）
SETTLEV.M = loadModule('view_settle')     -- v6.2 结算屏纯描述（opts → node 数组，零引擎调用）
SETTLEV.KIT_M = loadModule('view_kit')    -- 结算屏要用的控件工厂（胶囊/热区/文字）
TITLEV.M = loadModule('view_title')       -- v6.4 标题屏纯描述（展台 + 四模式卡 + 入口卡 + 三态热区）
TITLEV.KIT_M = loadModule('view_kit')     -- 标题屏共用的控件工厂（与结算/说明各持一份实例）
if not (PLATFORM_M and VIEW_LAYERS_M and RENDER_M and VIEW_BOARD_M) then
  print('v6 modules MISSING: platform/view_layers/render/view_board（棋盘会退回旧路径）')
end
if not INPUT_M then print('v6 input_map MISSING（键位退回散装 listen 路径）') end
if not (SETTLEV.M and SETTLEV.KIT_M) then
  print('v6 settle modules MISSING: view_settle/view_kit（结算屏退回旧实现）')
end
if not (TITLEV.M and TITLEV.KIT_M) then
  print('v6 title modules MISSING: view_title/view_kit（标题屏退回旧实现）')
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
  -- v6.2：结算屏只剩这一个 render 实例（SR）。D581 的教训不变：运行时实例靠**销毁**收场，
  -- SetVisible(false) 在真机对实例不生效。这里同时把本盘结算态归零（重开/回菜单都走它，幂等）。
  local had = SETTLEV.live and 1 or 0
  if SETTLEV.live then SETTLEV.close() end
  g.settleReady, g.settleV2 = false, false
  g.settleOn, g.settleT, g.settleDone, g.settleFade = false, 0, false, -1
  g.dimRatio, g.dimApplied = 0, -1
  print('settle destroy n=' .. had)
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

-- ② 单控件（textbox）模板：只探 guid（探针实例用完就销毁——否则它先造出来会被后造的遮罩盖住）
-- 文字模板：必须按**能力**探测（通用探测会挑到没有 text 字段的 guid）
function probeTextRaw()
  for _, g in ipairs(TPL_GUIDS.settleText) do
    local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, root) end)
    if ok and ctl then pcall(function() game.DestroyClientUIControl(ctl) end) return g end
  end
  return nil
end
local function probeSettleTextbox() return TEMPLATES and TEMPLATES:text() or nil end

-- 结算动画（0→0.9s）：①0→0.45s 文字 alpha 淡入 + 棋盘压到 45% 亮度
-- ②0.15s 起标题自上滑入（0.35s ease-out）③0.55s 起标题脉冲 44→48→44
-- （v6.2：选项带的落位改为静态——它由 view_settle 按卡底反解，不再参与滑入）
-- 通道分流：v2 的每一帧写入都走 SR（write/writePos），不碰任何 ctl 句柄；
-- S3 已把旧实现（buildSettleLayer/layoutSettle/settleSetColors/settleTick 旧分支/MS.opts）整段删除。
-- 三条硬理由（S1 已写进装配处注释）：①SR 必须独立于棋盘 BR；②每次打开 SR.clear() 再 apply；
-- ③淡入不重建——一次性建 alpha=255，之后只写字段。
SETTLEV.ACTS = { R = 'restart', V = 'backHome', Q = 'detail' }   -- 与键盘 R/V/Q 同一张动作表
SETTLEV.TITLE_Y, SETTLEV.TITLE_OFF = 140, 192                  -- 标题终值 y 与滑入起点（原 layoutSettle 常量）

SETTLEV.fade = function(a)
  local SR = SETTLEV.SR
  if not (SR and SETTLEV.live) then return end
  local nr = g.settleNoteRGB or { 96, 112, 132 }
  SR.write('settleTitle', 'fontColor', C(a, 185, 138, 60))                     -- 深金
  SR.write('settleScore', 'fontColor', C(a, 214, 126, 46))                     -- 暖橙
  SR.write('settleBest', 'fontColor', C(a, 62, 74, 99))                        -- 墨
  SR.write('settleInfo', 'fontColor', C(math.floor(a * 0.82), 124, 140, 168))
  SR.write('settleNote', 'fontColor', C(math.floor(a * 0.88), nr[1], nr[2], nr[3]))
end

SETTLEV.placeTitle = function(y)
  if SETTLEV.live then SETTLEV.SR.writePos('settleTitle', 0, y) end
end

SETTLEV.pulse = function(size)
  if SETTLEV.live then SETTLEV.SR.write('settleTitle', 'fontSize', size) end
end

SETTLEV.detail = function(text, on)
  local SR = SETTLEV.SR
  if not (SR and SETTLEV.live) then return end
  SR.write('settleNote', 'text', on and text or '')
end

-- 三态混色：与旧 MS.opts 的 mix 同款（k>0 向白靠、k<0 向墨靠）——三态色板在节点的 state 里
SETTLEV.mix = function(c, k)
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

-- 悬停/按下三态 + 按钮音效（v6.3 回归修复）：旧 MS.opts 挂的 CursorEnter/Exit/Up/Down 补回新路径。
-- 有界实现：只对**已存在**的控件写字段（不重建节点）；三态色板来自 view_settle 的 node.state：
--   fill（主）= mix(base, -0.13/-0.26)      line（次）= mix(accent, +0.78/+0.60)（白底要染模式色才看得见）
--   flat（三）= mix(base, +0.04/-0.10) 并把字色推到墨色（浅底胶囊提亮 4% 肉眼几乎无差，真正的信号是字色）
--   rim 一律 mix(base, +0.10/-0.34)；按下整组下沉 3px（fill/rim/label 一起，热区不动）。
SETTLEV.bindHover = function(nodes, accent, deep)
  local SR = SETTLEV.SR
  local groups = {}
  for i = 1, #nodes do
    local n = nodes[i]
    if n.opt and n.optId then
      local t = groups[n.optId]
      if not t then
        t = { fill = {}, rim = {}, sink = {} }
        groups[n.optId] = t
      end
      t.state = t.state or n.state
      if n.role == 'capFill' then
        t.fill[#t.fill + 1] = { key = n.key, base = n.color }
        t.sink[#t.sink + 1] = { key = n.key, x = n.pos[1], y = n.pos[2] }
      elseif n.role == 'capRim' then
        t.rim[#t.rim + 1] = { key = n.key, base = n.color }
        t.sink[#t.sink + 1] = { key = n.key, x = n.pos[1], y = n.pos[2] }
      elseif n.role == 'capLabel' then
        t.label = { key = n.key, base = n.fcolor }
        t.sink[#t.sink + 1] = { key = n.key, x = n.pos[1], y = n.pos[2] }
      elseif n.role == 'hit' then
        t.hit, t.hitKey = n.key, n.hitKey
      end
    end
  end
  local bound, okCnt = 0, 0
  for _, t in pairs(groups) do
    local ctl = t.hit and SR.get(t.hit) or nil
    local st = t.state
    if ctl and st then
      bound = bound + 1
      local function paint(mode)
        local down, hov = (mode == 'down'), (mode == 'hover')
        for i = 1, #t.fill do
          local f = t.fill[i]
          local k = down and st.pressK or (hov and st.hoverK or nil)
          local col = f.base
          if k then
            col = (st.kind == 'line') and SETTLEV.mix(accent, k) or SETTLEV.mix(f.base, k)
          end
          SR.write(f.key, 'imageColor', col)
        end
        for i = 1, #t.rim do
          local r = t.rim[i]
          local k = down and (st.rimPressK or -0.34) or (hov and (st.rimHoverK or 0.10) or nil)
          SR.write(r.key, 'imageColor', k and SETTLEV.mix(r.base, k) or r.base)
        end
        if t.label then
          local lc = t.label.base
          if st.kind == 'flat' then
            if down then lc = SETTLEV.mix(deep or lc, -0.12)
            elseif hov then lc = SETTLEV.mix(THEME.textMain or lc, 0.18) end
          else
            lc = down and SETTLEV.mix(lc, -0.12) or (hov and SETTLEV.mix(lc, 0.10) or lc)
          end
          SR.write(t.label.key, 'fontColor', lc)
        end
        local dy = down and (st.dy or -3) or 0
        for i = 1, #t.sink do
          SR.writePos(t.sink[i].key, t.sink[i].x, t.sink[i].y + dy)
        end
      end
      if PT.onCursor(ctl, 'CursorEnter', function()
        paint('hover') sfx(SFX.hover, true) print('settle hover ' .. tostring(t.hitKey))
      end) then okCnt = okCnt + 1 end
      PT.onCursor(ctl, 'CursorExit', function()
        paint('normal') print('settle hover out ' .. tostring(t.hitKey))
      end)
      PT.onCursor(ctl, 'CursorDown', function()
        paint('down') sfx(SFX.press, true) print('settle press ' .. tostring(t.hitKey))
      end)
      PT.onCursor(ctl, 'CursorUp', function()
        paint('hover') print('settle release ' .. tostring(t.hitKey))
      end)
    end
  end
  print('settle hover bind n=' .. bound .. ' enter=' .. okCnt)
end

SETTLEV.close = function()
  if SETTLEV.SR then SETTLEV.SR.clear() end
  SETTLEV.live = false
  g.settleV2 = false
end

-- 打开结算屏：一份描述 → SR（双屏也只产一份：render 的 key 是全局表，各盘 apply 会撞 key）
SETTLEV.open = function(overTitle)
  if not (SETTLEV.SR and SETTLEV.S) then return false end
  local noteRecs = CFG.COPY and CFG.COPY.settle
  if type(noteRecs) ~= 'table' or #noteRecs < 1 then return false end
  g.settleNoteIdx = (g.settleNoteIdx or 0) % #noteRecs + 1
  local noteRec = noteRecs[g.settleNoteIdx]
  g.settleNoteRGB = { (noteRec.color // 65536) % 256, (noteRec.color // 256) % 256,
    noteRec.color % 256 }
  local function onKey(key)
    return function()
      print('hot settle ' .. key)
      local fn = SETTLE_ACT[SETTLEV.ACTS[key] or '']
      if fn then fn() end
    end
  end
  local optv = CFG.SETTLE_OPT or {}
  local nodes = SETTLEV.S.settle {
    canvas = { CANVAS_W, CANVAS_H },
    device = IS_MOBILE and 'mobile' or 'pc',
    -- 裁决 2026-10-31：PC 保持**胶囊**（就是今天的样子，用户红线是"PC 单人不退化"）。
    -- 模块自己的缺省是 PC=键位提示 ⇒ 这里必须显式给 'pill'；config 加 style='text' 才切回纯提示。
    style = optv.style or 'pill',
    mode = MODE,
    score = g.score, best = bestScore, lines = g.lines, level = g.level,
    pieceCount = g.pieceCount,
    noteIdx = g.settleNoteIdx,             -- 旁白文案与配色由模块从 copy.settle 取（零复制）
    title = overTitle or '游戏结束',
    onRestart = onKey('R'), onHome = onKey('V'), onDetail = onKey('Q'),
  }
  SETTLEV.SR.clear()                       -- 每次打开先清（引擎实例上限 430，常驻约 240）
  SETTLEV.SR.apply(nodes)
  SETTLEV.live = true
  local mtS = MODE_THEME[MODE] or MODE_THEME.casual or {}
  SETTLEV.bindHover(nodes, mtS.accent or THEME.textMain, mtS.frame or THEME.textMain)
  UI4.regScreen('settle')
  local made = 0
  for i = 1, #nodes do
    local n = nodes[i]
    if n.role == 'hit' then
      local ctl = SETTLEV.SR.get(n.key)
      if ctl then
        UI4.regAdd('settle.' .. tostring(n.hitKey), ctl, n.size[1], n.size[2])
        made = made + 1
      end
    end
  end
  -- 契约锚（tests/37 逐字断言这一行；tests/40 只断言前缀 'settle hotzones n=3'）
  print('settle hotzones n=' .. made .. ' v=' .. tostring(optv.variant or 'P'):upper())
  UI4.dump('settle')
  if not g.settleSignaled then
    g.settleSignaled = true
    sendSettleSignal()                     -- 建好即上报一次（原 buildSettleLayer 的责任）
  end
  -- 旧实现的那条日志锚（tests/40-ai-takeover-death 逐字断言它）⇒ v2 也照打，
  -- 但含义变成「描述已落地成控件」；紧跟着的 v2 专用锚才是"新路径真的在跑"的证明。
  print('settle build ok n=' .. #nodes)
  g.settleTitleY, g.settleTitleOff = SETTLEV.TITLE_Y, SETTLEV.TITLE_OFF   -- settleTick 读这两个
  SETTLEV.fade(0)                          -- 动画起点：文字 alpha 归 0
  SETTLEV.placeTitle(SETTLEV.TITLE_OFF)    -- 标题先放屏外（旧口径 192）
  g.settleReady = true                     -- 既有「结算在位」判据（actSettleQ / dump 状态）继续成立
  g.settleV2 = true
  g.settleSize, g.settleT, g.settleFade, g.settleDone, g.settleOn = 44, 0, -1, false, true
  print('settle v2 open nodes=' .. #nodes)
  return true
end

local function settleTick(d)
  if not g.settleOn or g.settleDone then return end
  g.settleT = g.settleT + d
  local t = g.settleT
  local r1 = t / 0.45
  if r1 > 1 then r1 = 1 end
  if math.abs(r1 - g.settleFade) >= 0.05 or (r1 >= 1 and g.settleFade < 1) then
    g.settleFade = r1
    SETTLEV.fade(math.floor(255 * r1))        -- v6.2：走 SR 的 fontColor 通道（不重建）
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
    SETTLEV.placeTitle(g.settleTitleOff + (g.settleTitleY - g.settleTitleOff) * p2)
  end
  -- v6.2：选项带落位由 view_settle 按卡底反解（静态不参与滑入）⇒ 原 p3 段删除
  local p4 = (t - 0.55) / 0.3
  if p4 > 0 and p4 < 1 then
    local size = 44 + math.floor(4 * math.sin(math.pi * p4) + 0.5)
    if size ~= g.settleSize then
      g.settleSize = size
      SETTLEV.pulse(size)
    end
  elseif p4 >= 1 and g.settleSize ~= 44 then
    g.settleSize = 44
    SETTLEV.pulse(44)
  end
  if t >= 0.9 then
    g.settleDone = true
    SETTLEV.placeTitle(g.settleTitleY)
    SETTLEV.pulse(44)
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

-- v6.5 预览列描述：NEXT 两块（8 格）+ HOLD 一块（4 格）—— 老 renderNext 的三段逻辑一一对应：
--   ① 主预览 18px/20 距/满色；没 nextName（或结算）⇒ 8 格停靠 —— v3.5 ⑩ 的脏格就此绝迹
--      （旧实现先刷 COL_BG 再 return，格子留在原位）
--   ② 下下块 14px/14 距/白化 0.46（bagQ[1] 只读不取：渲染永不改出块序列）
--   ③ 暂存左栏镜像、18px/20 距；canHold=false 白化 0.5；空槽 4 格停靠 (-4000,-4000)
-- 标题不在这里出（noLabel）：现网「下一个/暂存」是服务端 textbox，再出一份就是双影。
local function previewDesc(parked)
  local nodes = {}
  if not (PVW.S and g) then return nodes end
  local cx, cw, ch = RIGHT_CX, CANVAS_W or 1280, CANVAS_H or 720
  local dev, dual = IS_MOBILE and 'mobile' or 'pc', (G[2] ~= nil)
  local queue = { g.nextName, g.bagQ[1] and g.bagQ[1].name }
  if g.gameOver then queue = {} end               -- 结算期不出预览（同旧语义）
  local function push(list) for i = 1, #list do nodes[#nodes + 1] = list[i] end end
  push(PVW.S.next({ cx = cx, canvas = { cw, ch }, device = dev, dual = dual,
    noLabel = true, legacyNames = true, queue = queue, slots = 2 }))
  push(PVW.S.hold({ cx = cx, canvas = { cw, ch }, device = dev, dual = dual,
    noLabel = true, legacyNames = true,
    holdName = g.st and g.st.name or nil, canHold = g.st and g.st.can }))
  if parked then
    -- 浮层期把 12 格挪出画布（旧实现同手法：运行时实例的 SetVisible 不可靠）
    for i = 1, #nodes do nodes[i].pos = { 0, -4000 } end
  end
  return nodes
end

local function renderNext()
  -- 预览列只反映 G[1]（双屏时 G[2] 的 renderHud 也调本函数；旧实现因 G[2].preview 为空而天然 no-op）
  if not (PVW.S and PVW.R) or (G[1] and g ~= G[1]) then return end
  PVW.R.apply(previewDesc(PVW.parked))
  -- 引擎侧读数（签名变化才打一行，避免 60fps 刷日志）：
  --   pvN   = render 键里 pv* 前缀的控件数（应为 12）
  --   holdX = 暂存首格的实际坐标（空槽时应为 -4000 —— v3.5 脏格守卫的对象级读数）
  local cnt = 0
  for k in pairs(PVW.R.controls()) do
    if tostring(k):sub(1, 2) == 'pv' then cnt = cnt + 1 end
  end
  local hc = PVW.R.get('pvHoldC1')
  local hx = (hc and PT) and PT.get(hc, 'anchoredPositionX') or nil
  local sig = cnt .. '/' .. tostring(hx) .. '/' .. tostring(PVW.parked)
  if sig ~= PVW.sig then
    PVW.sig, PVW.n = sig, cnt
    print(string.format('preview v2 apply pvN=%d holdX=%s parked=%s', cnt, tostring(hx),
      tostring(PVW.parked)))
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
  if not HUD_INST.hud then
    for _, t in ipairs(HUD_TEXT) do                    -- 名单单源（textbox 份复位）
      local c = HUD_TEXT.boxOf(t[1])
      if c and t[3] then tryCall(c, 'SetVisible', true) end
    end
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
  -- v6.2 结算屏：新路径优先（一份描述 → 独立 SR）；不可用才回落到旧实现（S3 删除）
  if SETTLEV.open and SETTLEV.open(overTitle) then
    setText(topBanner, '') setText(botBanner, '') setText(hint, '')
    renderAll()
    return
  end
  -- 兜底：结算屏不可用（模块缺失/依赖不全）时仍用布局横幅
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
-- 别加新模板（task-12 约束）：色块复用 TEMPLATES.cell、文字复用 settleText 模板，全运行时实例化。
-- ===== v2.7 ④ 独立规则说明页（H 常驻入口；整页三栏讲全：操作/计分判定/四种模式）=====
-- 用户原话（2026-10-28 反馈④）：「h按钮应该常驻，并且目前按下没有任何反应，h按钮请设计一个独立的页面，
local function destroyHelpLayer()
  local n = HLV.n or 0
  if HLV.R and HLV.live then
    if APP then APP.closeOverlay() else HLV.R.clear() end   -- 只清自己那份（BR/SR 的 key 不归它管）
    if n > 0 then print('guide help off n=' .. n) end
  end
  HLV.live, HLV.n, HLV.nodes = false, 0, nil
end
-- v6.3：说明页整页由 view_help 纯描述产出（271–289 节点，按画布 fit；旧 A/B/C 三版式全退役）。
local function buildHelpLayer()
  if not (HLV.M and HLV.S and HLV.R) then
    print('guide help module=none（view_help 未装配）')
    return
  end
  local W, H = CANVAS_W or 1280, CANVAS_H or 720
  local nodes = HLV.S.help {
    canvas = { W, H },
    device = IS_MOBILE and 'mobile' or 'pc',
    page = helpPage or 1,
    pages = 1,                          -- 单页 v1：文案一页讲全（翻页是 view_help 的新几何，未启用）
    onClose = function()                -- 右上「合上手册」热区（PC 透明 / mobile 金边胶囊由模块决定）
      sfx(SFX.press, true)
      print('tap help close')
      closeHelp()
    end,
  }
  -- 试点：走场景栈的 openOverlay（内部 = 先 clear 再 apply + push 场景；隔离仍是 HLV.R 这个独立实例）
  if APP then
    APP.openOverlay('help', { name = 'help', view = 'view_help', opaque = true }, nodes)
  else
    HLV.R.clear()
    HLV.R.apply(nodes)
  end
  HLV.live, HLV.n, HLV.nodes = true, #nodes, nodes
  local z = HLV.R.get('helpCloseHit')
  local s = math.min(W / 1600, H / 900)
  if s <= 0 then s = 1 end
  UI4.regScreen('help')
  if z then
    UI4.regAdd('help.close', z, 196 * s, 56 * s)
    UI4.dump('help')
  else
    print('help close zone=none（描述里没有 helpCloseHit）')
  end
  print('guide help on n=' .. #nodes)
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
  if not TEMPLATES.stext then TEMPLATES.stext = probeSettleTextbox() end
  if not TEMPLATES.stext then return nil end
  destroyCountBig()
  local c = game.InstantiateClientUIControl(TEMPLATES.stext, root)
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
    -- 标题页开手册前必须先把展台拆掉：层序=创建顺序，展台是后建的（在上），
    -- 而 `SetAsLastSibling` 在本引擎是空操作（实测 helpTitle=256 < menuBig=320 ⇒ 双层叠印）。
    -- 关页时再建回来（buildMenuCards 本身是"先拆后建"的幂等函数）。
    if guideStage == 0 then
      local okS = pcall(MS.teardown)
      local okC = pcall(destroyMenuCards)
      print('help stage hide ok=' .. tostring(okS and okC))
    end
    -- v6.3：不再做"复用现有层"（旧实现的 #7 优化）。每次开页 clear()+apply 一份描述——
    -- 层序靠创建顺序，重建一次就天然浮在最上（旧实现靠 SetAsLastSibling，而它是本引擎的空操作）。
    buildHelpLayer()
    if UI4.refreshHelpLabel then UI4.refreshHelpLabel(true) end
    if guideStage == 1 and not g.gameOver then print('help pause') end   -- v2.8 ② 局内时停锚
  end
end

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
  -- 判据＝**只是浮层打开时**才藏文字层（对局中一律照常显示）：角色页/帮助页会把 guideStage 改成 2
  -- （时停），所以不能要求 guideStage==0；v5.36 曾因 `hide = not want` 在局内清空导致 HUD 全消失。
  -- 覆盖屏集合必须含结算（SETTLEV.live），否则结算期 textbox 照写（出图实测 sk1name 透出）。
  local overlayNow = (helpOpen or (ROSTER and ROSTER.on) or (UI4 and UI4.noteOn) or MODE_OVER
    or (SETTLEV and SETTLEV.live)) and true or false
  local hide = overlayNow
  if hide ~= FN.textLayerHidden then print('textlayer hidden=' .. tostring(hide) .. ' guide=' .. tostring(guideStage)) end
  FN.textLayerHidden = hide and true or false
  if hide then
    -- 每轮都清（不是只在翻转时）：标题页常驻提示是**每帧重写**的（showPersistTip/renderHud），
    -- 清一次会被下一帧写回来 —— 这是「清了但还在」的原因。
    -- 每轮都清（不是只在翻转时）：常驻提示是每帧重写的，清一次会被下一帧写回来。
    -- 名单只走 HUD_TEXT（单源）：textbox 份 → setText('')；实例份 → 直接写 .text
    -- （setTextRaw 走 textbox 通道，对实例不生效；实测残留在底部那行就是 ibotBanner）。
    FN.textForce = true
    for _, t in ipairs(HUD_TEXT) do
      if t[3] then
        local box = HUD_TEXT.boxOf(t[1])
        if box then setText(box, '') end
      end
      local inst = HUD_INST and HUD_INST[t[1]]
      if inst then pcall(function() inst.text = '' end) end
    end
    FN.textForce = false
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
    -- v6.5：预览列改由描述层停靠（12 格统一挪出画布），不再逐个 SetAnchoredPosition
    PVW.parked = overlayOn and true or false
    if renderNext then pcall(renderNext) end
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

-- @region ui-menu BEGIN (writer: ui-mobile)
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
  TITLEV.sel = i
  print('mode=' .. MODE)                             -- 选模式锚（用例断言）
  MS.select(i)                                       -- 选中反馈（字放大 + 卡染色 + 宝珠变大）
  MS.focusLock(i, mname)                             -- 展台标题变模式名大字（0.5s 窗里 26→64 脉冲）
  pendingMode, pendingT = mname, 0                   -- 0.5s 动画窗后 enterMode 开局
  setText(topBanner, MODE_TITLE[mname] or mname)
  trySet(topBanner, 'fontColor', MODE_INFO[i].color)
  setText(botBanner, '')
end

-- ===== v6.4 标题屏：`view_title` 纯描述 + 独立 render 实例 TITLEV.R =====
-- 为什么换：现网这一屏是**三套账**——MC（卡片+热区实例）、MS.parts（展台零件）、MS.zones（手柄焦点），
-- 层序靠 buildMenuCards 里「先建舞台、再建卡、最后建热区」的调用顺序维持（SetAsLastSibling 在本引擎
-- 是空操作），三态靠 MS.cardStyle 逐字段写、退出靠 MS.destroy 逐个 Destroy。用户点名的
-- 「多层级菜单展示」正是坏在这里：谁盖谁由调用顺序决定，浮层一开一关就要靠"先拆展台"的手写纪律。
-- 纯描述后：一份 node 数组 → render 按**语义层号**建/更/删（bg 展台墙 → hud 横幅大字 → card 卡片
-- → touch 热区）；三态 = 改描述参数后**同 key 集重 apply**（render 字段级 diff，不销毁重建）；
-- 提示条呼吸 / 手记轮播 / 模式名大字脉冲这些逐帧动效走 render.write / writePos（不重建）。
-- 回调用闭包只捕获下标 i（控件只在首次创建时注册监听 ⇒ 重 apply 不会重复注册）。

-- 描述参数：唯一入口（hover/press/选中/展台状态都从这里进）
TITLEV.opts = function()
  local function rosterClick()
    print('entry click roster')
    keyConsumedFrame = frameSeq
    if FN.rosterToggle then FN.rosterToggle() end
  end
  local function helpClick()
    keyConsumedFrame = frameSeq
    print('menu help card tap')
    if helpOpen then closeHelp() else toggleHelp() end
  end
  return {
    canvas = { CANVAS_W or 1280, CANVAS_H or 720 },
    device = IS_MOBILE and 'mobile' or 'pc',
    active = TITLEV.sel, hover = TITLEV.hover, pressed = TITLEV.press,
    -- stage.mode ⇒ 模式名大字（MS.focusLock 的 0.5s 动画窗 = pendingMode 期）
    stage = { on = true, visible = true, mode = TITLEV.pendingMode },
    hints = MS.hintText,
    noteIdx = TITLEV.noteIdx,
    buildTag = BUILD_TAG,
    onPick = function(i) sfx(SFX.hover, true) MS.pressCard(i) end,   -- 按下即高亮（触屏反馈通道）
    onConfirm = function(i) menuSelectMode(i) end,                  -- 点一下即开（现网语义）
    onRoster = rosterClick,
    onHelp = helpClick,
  }
end

-- 一份描述 → TITLEV.R；顺带刷新手柄焦点表与 MS.zones（UI4.focusMove 读它）
TITLEV.apply = function()
  local R, S = TITLEV.R, TITLEV.S
  if not (R and S) then return false end
  local nodes = S.title(TITLEV.opts())
  R.apply(nodes)                        -- 同 key 集 ⇒ 只写变化字段（不销毁重建）
  TITLEV.nodes, TITLEV.n = nodes, #nodes
  local zones = {}
  for i = 1, #MODE_INFO do
    local ctl = R.get('menuZone' .. i)
    if ctl then zones[i] = ctl end
  end
  TITLEV.zones = zones
  MS.zones = zones                      -- 手柄/焦点导航的既有入口
  return true
end

-- 悬停/按下/抬起三态：描述层只声明 CursorDown / CursorClick（render 按 cursor 表注册），
-- 其余三个光标事件在接线层补——只写字段，不重建（与 SETTLEV.bindHover 同一手法）。
TITLEV.bindZones = function()
  local R = TITLEV.R
  if not (R and PT) then return 0 end
  local n = 0
  for i = 1, #MODE_INFO do
    local ctl = R.get('menuZone' .. i)
    if ctl then
      PT.onCursor(ctl, 'CursorEnter', function() sfx(SFX.hover, true) MS.hoverCard(i) end)
      PT.onCursor(ctl, 'CursorExit', function() MS.hoverOut(i) end)
      PT.onCursor(ctl, 'CursorUp', function() MS.hoverCard(i) end)
      n = n + 1
    end
  end
  -- 入口卡：现网有 hover 音与日志，行为保留（三态色不跟，按钮语汇已收进描述）
  local rz, hz = R.get('menuRosterZone'), R.get('menuHelpZone')
  if rz then PT.onCursor(rz, 'CursorEnter', function() sfx(SFX.hover, true) print('entry hover roster') end) end
  if hz then PT.onCursor(hz, 'CursorEnter', function() sfx(SFX.hover, true) print('entry hover help') end) end
  return n
end

-- 命中注册表（qxqy/audit-controls.mjs 与 UI4 审计读它；现网只有热区控件，这里同样只登记热区）
TITLEV.reg = function()
  local R = TITLEV.R
  if not (R and UI4 and UI4.regAdd) then return end
  UI4.regScreen('menu')
  for i = 1, #MODE_INFO do
    local z = R.get('menuZone' .. i)
    if z then UI4.regAdd('menu.mode' .. i, z, 416, 108) end
  end
  local rz, hz, kz = R.get('menuRosterZone'), R.get('menuHelpZone'), R.get('menuHintZone')
  if rz then UI4.regAdd('menu.entryRoster', rz, 290, 96) end
  if hz then UI4.regAdd('menu.entryHelp', hz, 176, 78) end
  if kz then UI4.regAdd('menu.help', kz, 260, 56) end
  UI4.dump('menu')
  print('menu zones n=' .. (#TITLEV.zones + (rz and 1 or 0) + (hz and 1 or 0) + (kz and 1 or 0)))
  if kz then print('menu help zone=ok') else print('menu help zone=none（仅键盘 H/E 可开说明页）') end
end

TITLEV.open = function()
  if not (TITLEV.R and TITLEV.S) then
    print('menu cards no view（view_title 未装配）')
    return false
  end
  TITLEV.R.clear()                      -- 再清自己那份（实例上限 430 是全工程总账，先清后建）
  TITLEV.hover, TITLEV.press, TITLEV.sel = nil, nil, nil   -- 重建即清三态（复局防串）
  TITLEV.pendingMode, TITLEV.pendingSize = nil, nil
  TITLEV.noteIdx, TITLEV.noteKey, TITLEV.hintKey = 1, nil, nil
  if not TITLEV.apply() then return false end
  TITLEV.live = true
  MS.stageOn = true
  TITLEV.bindZones()
  TITLEV.reg()
  print('menu stage n=' .. TITLEV.n)
  print('menu cards n=' .. TITLEV.n .. ' style=view')
  print('menu entries via view ok=true/true')
  return true
end

TITLEV.close = function()
  if not TITLEV.R then return end
  local n = TITLEV.n or 0
  TITLEV.R.clear()
  TITLEV.live, TITLEV.n, TITLEV.nodes = false, 0, nil
  TITLEV.zones = {}
  MS.zones = TITLEV.zones
  MS.stageOn = false
  -- 服务端两条横幅的颜色还给游戏（真机唯一验过的通道是 fontColor 的 A）
  trySet(topBanner, 'fontColor', C_GOLD2)
  trySet(botBanner, 'fontColor', C_ACCENT2)
  if n > 0 then print('menu cards destroy n=' .. n) end
end

-- 底栏动效（逐帧）：提示条 26↔28 号 + alpha 呼吸；旅行者手记 6 条轮播（入 0.5s → 停 5s → 出 0.6s）。
-- 两者都走 render.write / writePos（现网是 trySet 直接写控件；同一件事，只是让缓存保持诚实）。
TITLEV.tick = function()
  local R = TITLEV.R
  if not (R and TITLEV.live) then return end
  local t = introT
  local breathe = 0.5 + 0.5 * math.sin(t * 2.2)
  local size = 26 + math.floor(2 * breathe + 0.5)
  local alpha = math.floor(190 + 60 * breathe)
  local k = size * 1000 + alpha
  if TITLEV.hintKey ~= k then
    TITLEV.hintKey = k
    for i = 1, 3 do
      R.write('menuHint' .. i, 'fontSize', size)
      R.write('menuHint' .. i, 'fontColor', C(alpha, 46, 58, 74))
    end
  end
  local notes = CFG.COPY and CFG.COPY.title
  if notes and notes[1] then
    local span = 6.1
    local n = #notes
    local idx = math.floor(t / span) % n + 1
    local ph = t - math.floor(t / span) * span
    local a = 255
    if ph < 0.5 then a = math.floor(255 * ph / 0.5)
    elseif ph > 5.5 then a = math.floor(255 * (span - ph) / 0.6) end
    if a < 0 then a = 0 elseif a > 255 then a = 255 end
    local key = idx * 1000 + a
    if TITLEV.noteKey ~= key then
      TITLEV.noteKey = key
      local rec = notes[idx]
      local cc = rec.color or THEME.textSub
      TITLEV.noteIdx = idx
      R.write('menuNote', 'text', rec.text)
      R.write('menuNote', 'fontColor', C(a, (cc // 65536) % 256, (cc // 256) % 256, cc % 256))
      R.writePos('menuNote', -420, -215 + math.floor((255 - a) / 128))
    end
  end
end

-- ===== 三态 / 选中 / 展台退场：改描述参数再 apply（不销毁重建）=====
-- 日志锚与音效语义与现网一致（tests/41 断言 menu hover i= / menu hover out i= / menu press i=）。
MS.hoverCard = function(i)
  if helpOpen or pendingMode or FN.overlayOpen() then return end
  if TITLEV.sel and TITLEV.sel ~= i then return end   -- 已有选中项时不再抢样式
  TITLEV.hover, TITLEV.press = i, nil
  TITLEV.apply()
  print('menu hover i=' .. i)
end
MS.hoverOut = function(i)
  if helpOpen or pendingMode or FN.overlayOpen() then return end
  if TITLEV.sel and TITLEV.sel ~= i then return end
  if TITLEV.hover == i then TITLEV.hover = nil end
  TITLEV.press = nil
  TITLEV.apply()
  print('menu hover out i=' .. i)
end
MS.pressCard = function(i)
  if helpOpen or pendingMode or FN.overlayOpen() then return end
  if TITLEV.sel and TITLEV.sel ~= i then return end
  TITLEV.press = i
  TITLEV.apply()
  print('menu press i=' .. i)
end
-- 选中态：字放大 + 卡染色 + 宝珠变大（全在描述层算，这里只切参数）
MS.select = function(i)
  TITLEV.sel = i
  TITLEV.hover, TITLEV.press = nil, nil   -- 选中即吃掉悬停态（否则卡停在 hover 高度）
  TITLEV.apply()
end
-- 模式名大字独占画面（pendingMode 的 0.5s 窗）：描述切到 stage.mode ⇒ 大字变模式名、横幅让位
MS.focusLock = function(idx, mname)
  if TITLEV.pendingMode then return end
  TITLEV.pendingMode = mname
  TITLEV.pendingSize = nil
  TITLEV.apply()
end
MS.tick = function() TITLEV.tick() end
MS.teardown = function() TITLEV.close() end

-- 入口函数改名不变：全体调用点（startIfWaiting / exitToMenu / closeHelp / OnStart / FN.syncStage）
-- 继续走这两个名字，只是实现换成"清一份 + apply 一份描述"。
buildMenuCards = function() return TITLEV.open() end
destroyMenuCards = function() return TITLEV.close() end

-- @region ui-menu END (writer: ui-mobile)
-- ===== T6b-2 双屏控件与布局 =====
-- G[2] 棋盘（p2cell/p2frame 前缀防与 G[1] 撞名；坐标=基准+boardOX）。
local function buildBoardControls(inst)
  if not TEMPLATES.cell or not inst then return false end
  local save = g
  g = inst
  local plate = game.InstantiateClientUIControl(TEMPLATES.cell, root)
  if plate then                            -- v2.4 ①：对家盘同样需要背板（缝里不漏亮底）
    plate.name = 'p2plate'
    plate:SetSizeDelta(COLS * PITCH + 6, ROWS * PITCH + 6)
    plate:SetAnchoredPosition(0, 0)
    plate.imageColor = (MODE_THEME[MODE] or MODE_THEME.casual).plate   -- v3.0 双屏第二盘也要跟着模式换色
    g.plate = plate
  end
  g.cells = {}
  for i = 1, COLS * ROWS do
    local c = game.InstantiateClientUIControl(TEMPLATES.cell, root)
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
    local fr = game.InstantiateClientUIControl(TEMPLATES.cell, root)
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
  -- 中缝装饰（v6.6）：改由 view_board.dualDeco 出描述 + BR.spawn 按需建（despawn 退场时删）。
  -- 为什么不用整表 apply：那会把 200 格颜色重置成底色；为什么不能常驻隐藏：
  -- 真机 SetVisible(false) 对运行时实例不生效（D581），单人局会露出来。
  if not DUAL_DECO.on and TEMPLATES.cell then
    DUAL_DECO.on = true
    BR.spawn(VB.dualDeco { halfH = CANVAS_H, laneColor = THEME.gold, starColor = THEME.goldDeep })
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
  for _, t in ipairs(HUD_TEXT) do
    local box = t[3] and HUD_TEXT.boxOf(t[1]) or nil
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
-- v6.5 ③：HUD 文字控件**唯一名单**（单源）。此前同一份名字散在 6 处（建实例两段/隐藏/layoutDual 收口/hideAll-hideStats-showStats/syncStage 三段清空）⇒ 新增控件要改 6 处，「技能列 4 个漏做镜像」就是这么漏的。
-- 字段：
--   [1] name  [2] mirror=建运行时实例  [3] hideBox=隐藏服务端 textbox 份
--   [4] stats=属于"战况列"（结算只下架这些：横幅要留作兜底文案）  [5] show=settle 结束后重新上架
HUD_TEXT = {
  { 'hud', true, true, true, true },      { 'best', true, true, true, true },
  { 'keyA', true, true, true, false },    { 'keyB', true, true, true, false },
  { 'keyC', true, true, true, false },    { 'hint', true, true, true, true },
  { 'hudNext', true, true, true, true },  { 'holdLab', true, true, false, false },
  { 'botBanner', true, true, false, false }, { 'topBanner', true, true, false, false },
  { 'sk1name', true, true, true, true },  { 'sk1state', true, true, true, true },
  { 'sk2name', true, true, true, true },  { 'sk2state', true, true, true, true },
}
-- textbox 份：直连局部优先（layout 里抓到的句柄），其余递归找（技能列挂在 n1 之下）
HUD_TEXT.boxOf = function(name)
  local direct = ({ hud = hud, best = best, keyA = keyA, keyB = keyB, keyC = keyC, hint = hint,
    hudNext = hudNext, topBanner = topBanner, botBanner = botBanner })[name]
  if direct then return direct end
  local ok, c = pcall(findIn, root, { name })
  if ok then return c end
  return nil
end
HUD_INST.build = function()
  if not TEMPLATES.stext then TEMPLATES.stext = probeSettleTextbox() end
  if not TEMPLATES.stext then print('hud inst none（无模板，HUD 走 textbox）') return end   -- 保留降级路径
  local made = 0
  for _, t in ipairs(HUD_TEXT) do
    local nm, box = t[1], HUD_TEXT.boxOf(t[1])
    if t[2] then
      local ok, c = pcall(function() return game.InstantiateClientUIControl(TEMPLATES.stext, root) end)
      if ok and c then
        c.name = 'i' .. nm
        local isBanner = (nm == 'botBanner' or nm == 'topBanner')
        local isSk = nm:sub(1, 2) == 'sk'
        local fs = isBanner and 22 or (nm == 'hudNext' and 22) or 20
        local w = isBanner and (CANVAS_W or 1280) - 120 or (nm == 'hint' and 700)
          or (nm == 'hudNext' and 240) or 640
        local hh = (nm == 'hudNext') and 44 or (nm == 'topBanner') and 64
          or (nm == 'botBanner') and 48 or math.floor(fs * 1.45 + 8)
        if isSk and box then
          -- 技能列：几何/字号从 textbox **现读现拷**（位置由关卡 UI 定，硬编码会随布局漂移）
          w = tonumber(PT and PT.get(box, 'sizeDeltaX')) or 210
          hh = tonumber(PT and PT.get(box, 'sizeDeltaY')) or 36
          fs = tonumber(PT and PT.get(box, 'fontSize')) or 20
          local sx, sy = 0, 0
          local okP, px, py = pcall(function() return box:GetAnchoredPosition() end)
          if okP then sx, sy = tonumber(px) or 0, tonumber(py) or 0 end
          tryCall(c, 'SetAnchoredPosition', sx, sy)
        end
        trySet(c, 'fontSize', fs)
        trySet(c, 'fontColor', THEME.textMain)
        tryCall(c, 'SetSizeDelta', w, hh)
        -- 对齐必须显式（v3.5 ④ / v5.5：模板缺省 Top/Left 会裁掉字形，真机右侧被切半个字）
        trySet(c, 'verticalAlignment', 'Middle')
        trySet(c, 'horizontalAlignment', 'Middle')
        HUD_INST[nm] = c
        made = made + 1
      end
    end
    if t[3] and box then tryCall(box, 'SetVisible', false) end   -- 断言读 text 字段，不受 visible 影响
  end
  local halfH = (CANVAS_H or 720) / 2
  local function put(nm, x, y) local c = HUD_INST[nm] if c then tryCall(c, 'SetAnchoredPosition', x, y) end end
  put('topBanner', 0, halfH - 36)
  if HUD_INST.topBanner then trySet(HUD_INST.topBanner, 'fontSize', 34) end
  put('botBanner', 0, -(halfH - 40))          -- v5.4：离底缘 28px 会被裁 ⇒ 上移 12px
  put('hudNext', RIGHT_CX or 570, 255)        -- 贴预览块正上方（原位置像独立标题）
  -- keyA-C 常驻文案最长 24 全角 ⇒ 实例份字号降 14（fits 判据过；textbox 份字号不变）
  for _, nm in ipairs({ 'keyA', 'keyB', 'keyC' }) do
    local c = HUD_INST[nm]
    if c then trySet(c, 'fontSize', 14) end
  end
  print('hud inst n=' .. made .. ' (textbox hidden)')
end

HUD_INST.hideAll = function()
  for _, t in ipairs(HUD_TEXT) do
    local c = HUD_INST[t[1]]
    if c then
      tryCall(c, 'SetVisible', false)
      tryCall(c, 'SetAnchoredPosition', 0, -4000)   -- 真机 SetVisible 对实例不一定生效 ⇒ 挪出画布兜底
    end
  end
end
HUD_INST.hideStats = function()      -- 只下架「战况列」：横幅要留作结算兜底文案
  for _, t in ipairs(HUD_TEXT) do
    local c = HUD_INST[t[1]]
    if c and t[4] then tryCall(c, 'SetVisible', false) end
  end
end
HUD_INST.showStats = function()
  for _, t in ipairs(HUD_TEXT) do
    local c = HUD_INST[t[1]]
    if c and t[5] then tryCall(c, 'SetVisible', true) end
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
  -- ⚠ TEMPLATES.stext 是**懒探测**的（第一次建结算/帮助/模式卡文字时才赋值）。fx 池在首次技能时才建，
  -- 若此刻它还是 nil，名卡就只有色块没有字（2026-10-29 实测：`fx pool ok ctl=21 bad=0 text=0`）。
  -- 这里主动补探一次（probeSettleTextbox 内部有缓存 + pcall 护栏，重复调用无副作用）。
  if not TEMPLATES.stext and probeSettleTextbox then
    TEMPLATES.stext = probeSettleTextbox()
    print('fx tpl text resolve=' .. tostring(TEMPLATES.stext))
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
    tpl = { card = TEMPLATES.cell, text = TEMPLATES.stext },
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
  -- 覆盖屏（帮助/结算/档案）打开时整块不画：技能名/状态是**服务端 textbox**，
  -- 在真机上压在运行时实例之上（实测 sk1name z=42 < 结算卡 z=51），遮罩盖不住，
  -- 只能靠"不写"。这里直接不画，比逐控件清空可靠（清空后别的路径又会写回来）。
  if (SETTLEV and SETTLEV.live) or (ROSTER and ROSTER.on) or helpOpen or MODE_OVER then return end
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
        FN.SK[(sfx1 or ((i == 1) and 'sk1' or 'sk2')) .. 'name'] = cName
        -- v5.5（用户 2026-10-30 二轮反馈：「前后台和已就绪的说明增加玩家负担，用特效和动画区分」）：
        -- 名字行只留**角色名**（键位标签在可点时才有意义）；台前/台后靠卡面亮度+描边+能量条表达。
        -- v6.5 ②：覆盖屏开着时**不写**（syncStage 每帧清空 textbox 份，这里再写回就等于没清——
        -- 出图实测：结算帧里 sk1name 仍是「纳西妲」）。判据与 HUD_INST.txt 的抑制同源。
        if not FN.textLayerHidden then
          setText(cName, nm)
          trySet(cName, 'fontColor', active and FN.skillInk(role) or C(190, 96, 108, 126))
          local mi = HUD_INST[cName.name]
          if mi then trySet(mi, 'fontColor', active and FN.skillInk(role) or C(190, 96, 108, 126)) end
        end
      end
      if cState then
        FN.SK[(sfx1 or ((i == 1) and 'sk1' or 'sk2')) .. 'state'] = cState
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
        if not FN.textLayerHidden then          -- v6.5 ②：同上，覆盖屏期不写
          setText(cState, short)
          trySet(cState, 'fontColor', active and FN.skillInk(role) or C(200, 96, 108, 126))
          local ms = HUD_INST[cState.name]
          if ms then trySet(ms, 'fontColor', active and FN.skillInk(role) or C(200, 96, 108, 126)) end
        end
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
-- v6.4 档案页注入面：**分两段——先建表、OnStart 回填**。
-- 为什么不能直接写成字面量（`platform = PT`）：本段在 **chunk 装载期**执行，而 PT / RENDER_M 的实例
-- 是 **OnStart 里**才创建的 ⇒ 字面量读到的全是 nil ⇒ roster 的 v2able() 恒 false ⇒ 它会一直
-- 悄悄走 `roster v2 skip :: 需要 main 注入 …` 的老路（**看着接线了、其实没接**；与 D744
-- 「loadModule 写在首次使用之后 ⇒ 读到全局 nil ⇒ 假绿」同一族）。
-- 所以：env 表挂全局、字段留空；OnStart 里按字段回填；roster.lua 只在**开页那一刻**读 env.xxx
-- （不是装载期拷贝）⇒ 后回填成立。
-- **接线的判据（两条都要看）**：①启动日志里 `roster v2 skip` 消失；②开页日志变成
-- `char codex open n=<数> … v=2 issues=0`（v1 那条没有 `v=2`）。缺任一条就是没真接上。
ROSTER_ENV = {
  FN = FN, C = C, THEME = THEME, CP = FN.COPY, sk = function() return SK end,
  SKILLS = SKILLS, NUM = NUM, UI4 = UI4,
  game = game, setText = setText, trySet = trySet, tryCall = tryCall, addCursor = addCursor,
  roster = ROSTER, canvas = function() return CANVAS_W or 1600, CANVAS_H or 900 end,
  canvasH = function() return CANVAS_H or 900 end,
  viewRoster = loadModule('view_roster'),   -- v6.4 档案页纯描述（模块级纯函数，装载期可读）
}
do
  local RM = loadModule('roster')
  local okm = RM and RM.new(ROSTER_ENV)
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
  if DUAL_DECO.on then                 -- v2.4 ③/v6.6：中缝装饰交给 render 记总账（防实例累积）
    DUAL_DECO.on = nil
    if BR then BR.despawn({ 'dualDeco1', 'dualDeco2' }) end
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
  -- v6.5：预览列位置唯一真源 = renderNext（下面的 layout 末尾会调它）；
  -- 原来这里手写 400/400/-400 三套坐标（hold 还是 175-(i-9)*22 的斜排），与 renderNext 打架。
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
    if DUAL_DECO.on then
      DUAL_DECO.on = nil
      if BR then BR.despawn({ 'dualDeco1', 'dualDeco2' }) end
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
        if not TEMPLATES.stext then TEMPLATES.stext = probeSettleTextbox() end
        if not TEMPLATES.stext then return nil end
        local ok, c = pcall(function() return game.InstantiateClientUIControl(TEMPLATES.stext, root) end)
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
        if not TEMPLATES.hit then return nil end
        local ok, z = pcall(function() return game.InstantiateClientUIControl(TEMPLATES.hit, root) end)
        if not ok or not z then return nil end
        z.name = nm
        tryCall(z, 'SetSizeDelta', w, h)
        return z
      end,
      instHit = function(nm, w, h)
        if not TEMPLATES.hit then return nil end
        local z = instInto({ TEMPLATES.hit }, root, true)
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
  if not TEMPLATES.stext then return nil end
  local ok, c = pcall(function() return game.InstantiateClientUIControl(TEMPLATES.stext, root) end)
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
  if not TEMPLATES.hit then return nil end
  local z = instInto({ TEMPLATES.hit }, root, true)
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
-- v6.1：padBind 退役——手柄键的登记进了 input_map.ACTIONS/PROBE，由 INPUT:bindAll 一次注册；
-- `pad ev <键> act=<动作>` 与 `pad bind n=` 两条日志锚由派发段照原样打出（tests/48 契约）。

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
  -- v6.5 预览列装配（S1 只装配；S2 起 renderNext 改走描述，旧 12 颗手建实例删除）
  if PVW.M and PT and VIEW_LAYERS_M and RENDER_M then
    PVW.S = PVW.M.new({ config = CFG, layers = VIEW_LAYERS_M })
    PVW.R = RENDER_M.new({ platform = PT, layers = VIEW_LAYERS_M, log = function(m) print(m) end })
    print('v6 preview assembled')
  elseif not PVW.M then
    print('v6 preview MISSING: view_preview（预览列退回旧路径）')
  end
  -- v6.2 结算屏装配：独立 render 实例（S1 只装配不接线；S2 起由 settleOpenV2 使用）
  if SETTLEV.M and SETTLEV.KIT_M and PT then
    SETTLEV.KIT = SETTLEV.KIT_M.new({ layers = VIEW_LAYERS_M })
    SETTLEV.S = SETTLEV.M.new({ config = CFG, layers = VIEW_LAYERS_M, kit = SETTLEV.KIT })
    SETTLEV.SR = RENDER_M.new({ platform = PT, layers = VIEW_LAYERS_M, log = function(m) print(m) end })
    print('v6 settle view ok')
  end
  -- v6.3 说明页装配：自己一份 kit 实例 + 自己一个 render 实例（与结算 SR 互不相干）
  if HLV.M and HLV.KIT_M and PT then
    HLV.KIT = HLV.KIT_M.new({ layers = VIEW_LAYERS_M })
    HLV.S = HLV.M.new({ config = CFG, layers = VIEW_LAYERS_M, kit = HLV.KIT })
    HLV.R = RENDER_M.new({ platform = PT, layers = VIEW_LAYERS_M, log = function(m) print(m) end })
  APP = loadModule('app').new({ platform = PT, render = HLV.R, layers = VIEW_LAYERS_M,
    scenes = loadModule('scenes').new(), overlayRender = HLV.R, log = function(m) print(m) end })
    print('v6 help view ok')
  else
    print('v6 help view MISSING: view_help/view_kit')
  end
  -- v6.4 标题屏装配：独立 kit + 独立 render 实例（与前两屏同一套手法，绝不复用 BR/SR/HLV.R）
  if TITLEV.M and TITLEV.KIT_M and PT then
    TITLEV.KIT = TITLEV.KIT_M.new({ layers = VIEW_LAYERS_M })
    TITLEV.S = TITLEV.M.new({ config = CFG, layers = VIEW_LAYERS_M, kit = TITLEV.KIT })
    TITLEV.R = RENDER_M.new({ platform = PT, layers = VIEW_LAYERS_M, log = function(m) print(m) end })
    print('v6 title view ok')
  else
    print('v6 title view MISSING: view_title/view_kit')
  end
  -- v6.4 档案页 v2 注入面回填（ROSTER_ENV 在 chunk 期就建好了，但 PT/RENDER_M 到这里才存在）
  -- 缺任一字段 ⇒ roster.lua 自动回落旧实现并打 `roster v2 skip :: …`（游戏不会坏，只是没换新版式）。
  ROSTER_ENV.platform = PT
  ROSTER_ENV.render = RENDER_M
  ROSTER_ENV.layers = VIEW_LAYERS_M
  ROSTER_ENV.config = CFG
  ROSTER_ENV.kit = SETTLEV.KIT        -- 复用结算屏那份 kit 实例（省一次实例化）
  ROSTER_ENV.app = APP                -- v6.8：档案页也走场景栈（openOverlay/closeOverlay）

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
  -- v6.6：模板探测集中到 templates 模块（返回一张表 + 每个失败都有明确日志与降级清单）
  TEMPLATES = loadModule('templates').new({ guids = TPL_GUIDS, probeOne = probeTemplate,
    probeTextOne = probeTextRaw, log = print })
  local firstCell, tplGuid = TEMPLATES:probeCell()
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
  TEMPLATES.cell = tplGuid                    -- T6b-2：G[2] 棋盘控件复用同模板（enterMode 里建）
  -- v2.7 ⑤：cursor 模板 guid **提前**探测（标题页四模式三态热区要用它建实例，
  -- 而 buildMenuCards 在本函数中段就跑；原来这段探测在按钮段，太晚）。探针实例复用给手机热区。
  local hitSeed
  hitSeed, TEMPLATES.hit = TEMPLATES:probeHit()
  TEMPLATES.stext = TEMPLATES:probeText()
  TEMPLATES:report()
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

  -- v6.5 NEXT/HOLD 预览改由 view_preview 纯描述创建（PVW.R.apply，键 pv*、引擎侧名 next1..8/hold1..4），
  -- 不再手建 12 个实例：那 12 颗的几何/配色/停靠逻辑已收进描述层，由 headless 用例逐值钉住。

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

  -- v6.1：键位注册不再是「每处 listen 一行」——唯一入口是文件末尾的 INPUT:bindAll(dispatch)。
  -- 旧的本地 listen(name, fn) 已并入 platform.bindKey（同样的枚举/字符串双路径回退，
  -- 同样的日志字面量 `listen ok … via enum|string` 与 `listen fail …`，tests 与真机日志都认它）。

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
  -- 「这颗键归哪块盘」的**唯一真源**已搬进 input_map（M.P2KEYS / M.playerOf）
  local function isP2(keyName) return INPUT_M.playerOf(keyName) == 'p2' end
  local function routePlayer(keyName)
    if MODE == 'pvp' and isP2(keyName) and G[2] then return G[2] end
    return G[1]
  end
  -- coop 分工过滤（裁决① 用户方案）：P1=旋转手（只 rot/hold），P2=行动手（只 left/right/soft/hard）
  local function coopAllowed(keyName, action)
    if MODE ~= 'coop' then return true end
    local isP1Key = not isP2(keyName)
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
        if ROSTER and ROSTER.on and INPUT_M.isOverlayClose(keyName) then
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
        if isP2(keyName) then GK.p2ready = true
        else GK.p1ready = true end
        if MODE == 'ai-battle' then GK.p2ready = true end
        if GK.p1ready then HUD_INST.txt(keyA, 'P1 准备好了 ✓') end
        if GK.p2ready and MODE ~= 'ai-battle' then HUD_INST.txt(keyB, 'P2 准备好了 ✓') end
        setText(hint, (GK.p1ready and GK.p2ready) and '都准备好了！'
          or (GK.p1ready and '等待 P2 准备…' or '等待 P1 准备…'))   -- v2.8 ① ready 进度
        print('guide ready ' .. (isP2(keyName) and 'p2' or 'p1'))
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
    if MODE == 'coop' then print('coop act=' .. action .. ' p=' .. (isP2(keyName) and 2 or 1)) end
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
  -- v6.1：玩法键与模式键不再在这里逐条 listen —— 它们进了 input_map.ACTIONS，由文件末尾的
  -- INPUT:bindAll(dispatch) 一次注册。对应关系：
  --   left/right/rot/soft/hard/hold（含 pvp 补丁键 X=Drop、F=Interact）→ act(...)+doPlay(...)
  --   mode1..mode4 → menuSelectMode(i)（仍带 keyConsumedFrame 同帧让位）
  -- 双屏路由（routePlayer）与 coop 过滤（coopAllowed）都还在 act/doPlay 里，按 keyName 判定不变。
  local function actLevel()                                -- T5 调试切档（具名键不被 anyKeyStart 抢）
    if guideStage ~= 0 then return end
    NUM.AI_LEVEL = NUM.AI_LEVEL % 3 + 1
    local lv2 = NUM.AI_LEVELS[NUM.AI_LEVEL]
    RHO.pieces, RHO.lines = 0, 0
    print('demo level=' .. lv2.name)
    demoLoopReset()
  end
  -- v2.6 ④：V = 结算后回主页（CraftspersonKey22；所有模式结算通用出口）
  -- v2.7 修用户反馈②③（V 回不到真正的开始页 / 第二次按 1-4 没反应）：
  -- V 自身也落在 43 键兜底池里（v1「任意键开始」），exitToMenu 把 guideStage 置 0 之后，
  -- 同一个按键事件继续派发给兜底监听 ⇒ 刚建好的标题页立刻被 startIfWaiting 吃掉。
  -- 双保险：① mapped 表排除 22（兜底循环不再注册它）② 同帧消费标记让兜底让位。
  local function actRestart()                              -- R 重开（键位表态也允许）
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
  end
  -- Q：结算明细（结算态才有意义）。明细走左栏 hint（棋盘外，不会被实例格子盖住）
  local function actSettleQ()
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
      if SETTLEV.live then
        SETTLEV.detail(detail, true)
      else
        setText(hint, '本局落块 ' .. g.pieceCount .. '　消行 ' .. g.lines .. '　最高 ' .. bestScore)
      end
      print('settle detail on')
    else
      if SETTLEV.live then
        SETTLEV.detail('', false)
      else
        setText(hint, '')
      end
      print('settle detail off')
    end
  end
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
    -- v6.2：明细写进 view_settle 的旁白行（settleNote）；结算屏不在场才退回左栏 hint
    if g.settleOpen then
      if SETTLEV.live then
        SETTLEV.detail(detail, true)
      else
        setText(hint, '本局落块 ' .. g.pieceCount .. '　消行 ' .. g.lines .. '　最高 ' .. bestScore)
      end
      print('settle detail on')
    else
      if SETTLEV.live then
        SETTLEV.detail('', false)
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
  -- 鼠标/触屏：标题页常驻的「H 规则说明」热区（cursor 实例，PC 也可点）
  -- 由标题屏描述（view_title 的 menuHintZone）出控件，回调在 TITLEV.opts 的 onHelp 里注册
  -- T：调试填满最底两行（不消行）。消行必须走真实路径——下一次锁定（硬降/落地）时
  -- 由 doLock -> clearLines 处理，用例 04 因此覆盖的是真实消行链路而不是调试旁路。
  local function actDebugFill()
    act('KeyboardCharacterSkill4KeyDown', function()
      for rr = ROWS - 1, ROWS do
        for c = 1, COLS do g.board[rr][c] = CFG.COL_BLUE end
      end
      print('debug-fill')
      renderAll()
      renderHud()
    end)()
  end

  -- ===== v4.0 设备适配接线（移动端按钮 / 手柄 / 焦点导航）=====
  -- 动作派发一律走键盘同一条链（act(key, fn) + doPlay）：于是"帮助页开着先关页""入场态按键
  -- 既开局也执行动作""MODE_OVER 冻结输入""接管中按键交还"这些语义自动一致，不用重写第二套。
  UI4.runAct = function(action)                 -- 手机按钮冒充的键名：真源在 input_map.M.PHONE
    local key = INPUT_M.PHONE[action]
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
  -- 手柄 24 条 Controller 事件（14 映射 + 10 探针）已并入 INPUT:bindAll（见文件末尾派发段）
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
  -- 第二参数是**动作名**（不是键名）：键位真源在 input_map，这里只留"同一动作再按一次可关闭"的判断
  local function skillKey(fn, mark)
    return function()
      FN.skillKeyHoldSec = tonumber(FN.skillKeyHoldSec) or 0
      if helpOpen then closeHelp() return end
      -- v5.7（用户 2026-10-30「兄弟一堆 bug」）：角色页开着时，**同一颗开关键必须还能关**。
      -- 之前 skillKey 不看 ROSTER.on、act() 又把所有键吞掉 ⇒ 只能鼠标点「合上」，
      -- 键盘玩家直接**卡在角色页里出不来**（真机日志：连续 30+ 条 key blocked by overlay，零条 roster close）。
      if ROSTER and ROSTER.on then
        if mark == 'roster' then
          keyConsumedFrame = frameSeq
          if FN.rosterToggle then FN.rosterToggle() end
        else
          print('key blocked by overlay ' .. tostring(mark))
        end
        return
      end
      startIfWaiting()
      -- 角色页/说明页**不要求** guideStage==1：它们从标题页就能开，也就必须能关
      if guideStage ~= 1 or MODE_OVER or (g and g.gameOver) then
        if mark == 'roster' and FN.rosterToggle then FN.rosterToggle() end
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
  local function actSkill1Down()
    skillDownT = (g and g.elapsed) or 0
    if skillFrontName() ~= 'keqing' then
      skillKey(function() FN.skillCast(1) end)()
    end
  end
  local function actSkill1Up()
    if skillFrontName() == 'keqing' then
      FN.skillKeyHoldSec = math.max(0, ((g and g.elapsed) or 0) - skillDownT)
      skillKey(function() FN.skillCast(1) end)()
    end
  end
  local function actSkill2() skillKey(function() FN.skillCast(2) end, 'skill2')() end
  local function actSkillSwitch() skillKey(function()
    -- 模块没有 switchRole：state.active 是 party 的 1-based 下标，翻一格即可（一局最多 2 人 ⇒ 1↔2）
    if not (SK and SK.party and #SK.party > 0) then return end
    local n = #SK.party
    SK.active = ((SK.active or 1) % n) + 1
    FN.skillHud()
    print('skill switch ok=true active=' .. tostring(SK.active) .. ' role=' .. tostring(SK.party[SK.active]))
  end)() end
  local function actRoster() skillKey(function() FN.rosterToggle() end, 'roster')() end
  -- 调试：Key30 = 解锁全部角色（只给用例/开发用；真机玩家拿不到这张键位表说明）
  local function actDebugUnlock() skillKey(function()
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
  end)() end

  -- 入场态兜底：43 个可编程键位里凡是没被动作表认领的，都只做"开始游戏"这一件事。
  -- v6.1：43 次 listen 与排除表 mapped 已退役，兜底池由 input_map.fallbackPool() 派生
  local function anyKeyStart()
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

  -- ===== v6.1 输入单源：动作表在 input_map.lua，这里只留一张「动作 → 现有执行体」派发表 =====
  -- 收表前：90 次 AddKeyEventListener / 84 个键 / 其中 6 个键注册两次（谁先注册谁先派发，
  -- 输入类 bug 因此不可复现）。收表后：84 次 / 84 个键 / 0 重复；改键位只动 input_map.lua。
  -- 返回值 true = 已消费（栈式分发约定）；INPUT:dispatch 还会先问栈顶（说明页/结算等场景可压栈）。
  local INPUT
  local function dispatch(action, keyName, phase)
    -- 手柄：先打 tests/48 的锚 `pad ev <键> act=<动作>`（未映射的探针键只有键名）
    if keyName:match('^Controller') then
      local shown = (action == 'confirm') and 'ok' or action   -- 保持既有日志词（PAD.KEYS 用的是 ok）
      print('pad ev ' .. keyName .. ((action ~= 'probe') and (' act=' .. shown) or ''))
      if action == 'probe' then return true end
      if UI4.padAct then UI4.padAct(shown, keyName) end
      return true
    end
    -- 玩法六动作（Down 走 act 链；Up 只清 DAS 方向）
    if action == 'left' or action == 'right' or action == 'rot'
      or action == 'soft' or action == 'hard' or action == 'hold' then
      if phase == 'up' then
        local dk = keyName:gsub('Up$', 'Down')
        g = routePlayer(dk)   -- 事件回调必须先路由（ai-battle 下 g 会被 OnUpdate 留成 G[2]）
        if action == 'left' and g.das.dir == -1 then g.das.dir = 0 end
        if action == 'right' and g.das.dir == 1 then g.das.dir = 0 end
        return true
      end
      act(keyName, function() doPlay(action, keyName) end)()
      return true
    end
    local modeN = tonumber(action:match('^mode(%d)$') or '')
    if modeN then
      if keyConsumedFrame == frameSeq then return true end
      menuSelectMode(modeN)
      return true
    end
    if action == 'level' then actLevel() return true end
    if action == 'back' then SETTLE_ACT.backHome() return true end
    if action == 'restart' then actRestart() return true end
    if action == 'settle' then actSettleQ() return true end
    if action == 'help' then onHelpKey() return true end
    if action == 'debugFill' then actDebugFill() return true end
    if action == 'skill1' then
      if phase == 'up' then actSkill1Up() else actSkill1Down() end
      return true
    end
    if action == 'skill2' then actSkill2() return true end
    if action == 'skillSwitch' then actSkillSwitch() return true end
    if action == 'roster' then actRoster() return true end
    if action == 'debugUnlock' then actDebugUnlock() return true end
    if action == 'anyKey' then anyKeyStart() return true end
    return false
  end

  if INPUT_M and PT then
    INPUT = INPUT_M.new({ platform = PT, log = function(m) print(m) end })
    INPUT:bindAll(dispatch, { padMoveKeys = false })   -- MoveLeft/MoveRight 是死映射，启用需同步 tests/48
    local nPad = 0
    for _, k in ipairs(INPUT:boundKeys()) do
      if k:match('^Controller') then nPad = nPad + 1 end
    end
    print('pad bind n=' .. nPad)     -- tests/48 契约：手柄 24 条（14 映射 + 10 探针）
  else
    print('input: 跳过表格注册（缺 input_map 或 platform）——本局将收不到按键')
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
      if TITLEV.live then
        if size ~= TITLEV.pendingSize then   -- 展台大字演模式名（服务端横幅被墙压住，只能走实例层）
          TITLEV.pendingSize = size
          TITLEV.R.write('menuBig', 'fontSize', size)   -- 只写字段，不重建
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
