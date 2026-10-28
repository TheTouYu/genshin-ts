--[[==========================================================================
tetris/audio.lua —— 音效引擎（id 表 + 同帧帧闸 + 全 pcall）
----------------------------------------------------------------------------
纪律（2026-10-25 定，别改）：
  ① 只在「动作真的发生」时播（移动/旋转成功、锁定、消行、结束），不在每帧播；
  ② 同一帧最多播一条（真机一帧内可能连来两个动作）；force=true 的节点性反馈可破例；
  ③ 全走 pcall —— 真机缺 PlayAudio2D 时一处抛错会中断整段 OnStart（2026-10-24 踩过）。
契约：未挂载模块、只被 require；顶层不碰控件（docs/research/lua-module-contract.md）。
  spec = { game, frameOf = function() -> frameSeq }
=========================================================================]]

local M = {}

local SFX = {
  move   = 50884,   -- 按钮点击_轻_卡通_03 (0.151s)
  rotate = 50883,   -- 按钮点击_轻_卡通_02 (0.151s)
  lock   = 50872,   -- 按钮点击_重_通用_01 (1.024s)
  over   = 50929,   -- 提示性UI_轻_整理背包 (0.978s)
  level  = 40001,   -- 战斗_治疗_回复_01 (1.653s) ← 升级音
  tspin  = 50924,   -- 拍照分享 (1.418s) ← T-spin 专属正反馈（T8）
  -- T7 垃圾行（裁决⑩：波 3 实施时挑；真机人耳确认归 T9 清单⑥）
  garbageSend = 40017,   -- 战斗_远程攻击_投掷_飞刀_01 (1.161s) ← 送出（攻方反馈）
  garbageRecv = 20004,   -- 动物叫声_鬼兜虫_重受击_01 (0.459s) ← 受击（被打方警报）
  -- v3.1 四：鼠标三态音效（用户「给所有悬停变样区加音效」）——50-150ms UI 短音
  hover  = 50870,   -- 按钮点击_轻_卡通_01 (0.084s) ← 悬停进入（最短，连扫防噪）
  press  = 50884,   -- 按钮点击_轻_卡通_03 (0.151s) ← 按下（同 move 音色族）
}
-- 消行按行数换 id：四档互不相同 ⇒ 1 行与 4 行听得出差别（音高关系未确认）
local SFX_CLEAR = { 50917, 40001, 40022, 40054 }   -- 0.785 / 1.653 / 1.064 / 2.000s
local SFX_MUTE = false      -- 调试开关：true 全静音
local sfxFrame = -1         -- 上一次播声的帧号（同一帧最多一条）

-- 引擎状态（本模块私有）：只保留「同帧最多一条」所需的 sfxFrame 与计数。
-- frameSeq 属于 main（按键回调与 OnUpdate 共用同一个帧号），由 spec.frameOf 注入。
local sfxCount = 0          -- 本会话已播条数（探针读数）

M.new = function(spec)
  local game = spec.game
  local frameOf = spec.frameOf or function() return 0 end
  local function noteFail(tag, err) print('audio fail ' .. tag .. ' :: ' .. tostring(err)) end
  local function play(id, force)
    if SFX_MUTE or not id then return false end
    local f = frameOf()
    -- f == 0 表示 OnUpdate 还一次没跑（真机上若不派发就别把音全吞了）⇒ 此时不做帧闸
    if not force and f > 0 and sfxFrame == f then return false end
    sfxFrame = f
    local ok, err = pcall(function() game.PlayAudio2D(id) end)
    if not ok then noteFail('PlayAudio2D', err) return false end
    sfxCount = sfxCount + 1
    return true
  end
  return { play = play, ids = SFX, clear = SFX_CLEAR, count = function() return sfxCount end }
end

return M
