--------------------------------------------------------------------------------
-- 千星音效模板（game-sfx-kit）
-- 用法：把本段粘进 lua/main.lua，按 §3 预算换 id，并在 OnUpdate 里 frameSeq = frameSeq + 1。
-- 三条纪律（缺一条就会出坑，见 SKILL.md §5/§8）：
--   ① 只在动作真的发生时播（移动/旋转成功、锁定、消行、结束），不在每帧播；
--   ② 帧闸：同一帧最多一条（真机一帧内可能连来两个动作）；
--   ③ 全走 pcall —— 真机缺这个 API 时一处抛错会中断整段 OnStart。
-- 每条 id 后面写「中文名 (时长)」。名字/时长出处：
--   .agents/skills/game-sfx-kit/assets/sfx-library-full-20261027.md（名字）
--   .agents/skills/game-sfx-kit/assets/audio-index.json（类目+时长）
--   查询：node .agents/skills/game-sfx-kit/scripts/pick.mjs --cat 6 --dur 0.3-1.0
-- **语义未试听确认的条目必须标「占位：未试听」**——名字对 ≠ 听起来对。
--------------------------------------------------------------------------------

-- 一次性/低频事件：key = 事件名
local SFX = {
  move   = 50884,   -- 按钮点击_轻_卡通_03 (0.151s)
  rotate = 50883,   -- 按钮点击_轻_卡通_02 (0.151s)
  lock   = 50872,   -- 按钮点击_重_通用_01 (1.024s)
  over   = 50929,   -- 提示性UI_轻_整理背包 (0.978s)
  level  = 40001,   -- 战斗_治疗_回复_01 (1.653s) —— 占位：未试听
}

-- 分档事件（消行 1/2/3/4 行）：四档必须互不相同，否则听不出差别
-- 预算 0.5~2s（低于 0.5s 像点击，高于 2s 会盖住下一手）
local SFX_CLEAR = { 50917, 40001, 40022, 40054 }   -- 0.785 / 1.653 / 1.064 / 2.000s

local SFX_MUTE = false      -- 调试开关；业务静音不要用它
local sfxFrame = -1         -- 上一次播声的帧号
local frameSeq = 0          -- OnUpdate 每帧 +1（本段之外要自己加）
local sfxCount = 0          -- 本会话已播条数（探针读数，供断言/日志）

local function sfx(id, force)
  if SFX_MUTE or not id then return false end
  -- frameSeq == 0 表示 OnUpdate 还一次没跑（真机若不派发就别把音全吞了）⇒ 此时不做帧闸
  if not force and frameSeq > 0 and sfxFrame == frameSeq then return false end
  sfxFrame = frameSeq
  local ok, err = pcall(function() game.PlayAudio2D(id) end)
  if not ok then
    -- 缺 API 时只记一笔，不中断 OnStart
    if noteFail then noteFail('PlayAudio2D', err) end
    return false
  end
  sfxCount = sfxCount + 1
  return true
end

--------------------------------------------------------------------------------
-- 长音效（环境/BGM 尝试）：必须存实例 id 并 StopAudio，否则换场景后还在响。
--------------------------------------------------------------------------------
local bgmInst = nil
local function playBgm(id)
  if bgmInst then pcall(function() game.StopAudio(bgmInst) end) end
  local ok, inst = pcall(function() return game.PlayAudio2D(id) end)
  bgmInst = (ok and inst) or nil
end
local function stopBgm()
  if not bgmInst then return end
  local ok, alive = pcall(function() return game.IsAudioAlive(bgmInst) end)
  if ok and alive then pcall(function() game.StopAudio(bgmInst) end) end
  bgmInst = nil
end

--------------------------------------------------------------------------------
-- 调用点示例（放在业务分支里，不要放每帧路径）：
--   OnUpdate:  frameSeq = frameSeq + 1
--   移动成功:  sfx(SFX.move)
--   旋转成功:  sfx(SFX.rotate)
--   落地锁定:  sfx(SFX.lock)
--   消 n 行:   sfx(SFX_CLEAR[n], true)     -- force：与锁定同帧也要响
--   升级:      sfx(SFX.level, true)
--   游戏结束:  sfx(SFX.over, true)         -- 结算页滑入同帧
--   自演/教程: 只播结果音（消行/结束/升级），跳过 move/rotate/lock
--------------------------------------------------------------------------------
return { SFX = SFX, SFX_CLEAR = SFX_CLEAR, sfx = sfx, playBgm = playBgm, stopBgm = stopBgm }
