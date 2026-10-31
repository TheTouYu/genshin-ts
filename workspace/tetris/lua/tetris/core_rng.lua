--[[==========================================================================
 tetris/core_rng.lua —— 确定性随机源 + 7-bag 出块（core_*：零引擎、零全局）
 ----------------------------------------------------------------------------
 从 main.lua:97-100（LCG）与 main.lua:202-226（refillBag/takeFromBag）逐字搬出。
 为什么搬：出块序列是全游戏**一切随机性的源头**（出块、障碍洞位、垃圾洞位），
 它以前只能靠「跑一遍模拟器看日志 bag=/piece=」才能验证；现在 lua5.3 里 50ms 就能
 断言「7-bag 保底 / 首袋不 S/Z / 同种子同序列」。
 ----------------------------------------------------------------------------
 契约（docs/ARCH.md §3）：模块不 require 彼此；依赖从 M.new(spec) 注入；
 chunk 顶层不实例化控件、不读写脚本全局。
 ----------------------------------------------------------------------------
 接口（state 全部显式：函数不读也不写调用方的隐式状态）：
   R = M.new{ bag = {'I','O','T','S','Z','J','L'}, seed = 20261023 }
   R.rand(n)                  -> 1..n          （LCG 一步，等价 main.lua:97-100）
   R.setSeed(s)               -> 重置 LCG 种子
   R.refill(queue, opt)       -> seq          （洗一整袋，追加进 queue）
   R.take(queue)              -> name, bag    （queue 空则自动 refill）
   R.reset()                  -> bagSeq 归零（对应 newGame 的 g.bagQ/g.bagSeq 复位）
   R.bagSeq                   -> 已洗出的袋数（= main 的 g.bagSeq，出块日志 bag= 用它）
 ----------------------------------------------------------------------------
 ⚠ 语义陷阱（写给接线的人，别顺手"优化"）：
   1. LCG 的**乘子/模/取位**一个数都不能改：改了整条出块序列与全部既有日志断言
      （bag=/piece= 逐块对）一起变。中文注释里的数字是真源，不是示例。
   2. 首袋排 S/Z 只在 **bagSeq == 0** 时生效（main.lua:211）。它是「与袋内第一个
      非 S/Z 交换」，不是重洗——重洗会多消耗一次 rand，序列跟着变。
   3. 双屏第二盘（G[2]）用的是**另一个** LCG 实例（main 的 aiRand），不是本对象共享；
      共享会让两盘互相干扰出块序列。接线时一个实例一个 R。
=======================================================================]]

local M = {}

local DEFAULT_BAG = { 'I', 'O', 'T', 'S', 'Z', 'J', 'L' }
local DEFAULT_SEED = 20261023        -- main.lua:96 的初值（同种子 ⇒ 同序列 ⇒ 日志可复现）
local LCG_MUL = 1103515245
local LCG_INC = 12345
local LCG_MOD = 2147483648           -- 2^31
local LCG_SHIFT = 65536

function M.new(spec)
  spec = spec or {}
  local bag = spec.bag or DEFAULT_BAG
  local seed = spec.seed
  if seed == nil then seed = DEFAULT_SEED end
  -- 可选：外部随机源（返回 1..n）。用于「出块必须与现网共用同一条随机流」的盘：
  -- main.lua:211 的 G[2] 出块走的是 aiRand，而 aiRand **同时**被 AI 决策/垃圾洞位/障碍洞位消耗
  -- ⇒ 若给 G[2] 一个独立 LCG，AI 与出块的交错序列会整体改变（用例 13/20 的日志会漂）。
  -- 接线时给 G[2] 传 rand = aiRand、给 G[1] 不传（用本模块 LCG，种子与 main.lua:96 一致）。
  local externalRand = spec.rand

  local R = {}
  R.bagSeq = 0

  -- LCG：**逐字**照 main.lua:97-100，连 `(seed // 65536) % n + 1` 的取位都不能改。
  function R.rand(n)
    if externalRand then return externalRand(n) end
    seed = (seed * LCG_MUL + LCG_INC) % LCG_MOD
    return (seed // LCG_SHIFT) % n + 1
  end

  function R.setSeed(s)
    seed = s
  end

  function R.seed()
    return seed
  end

  -- 洗一整袋（Fisher-Yates：6 次 rand()）并追加进 queue。
  -- opt.firstBag 显式覆盖"是不是首袋"；缺省用 R.bagSeq（与 main 的 g.bagSeq 同义）。
  function R.refill(queue, opt)
    opt = opt or {}
    local t = {}
    for i = 1, #bag do t[i] = bag[i] end
    for i = #t, 2, -1 do
      local j = R.rand(i)
      t[i], t[j] = t[j], t[i]
    end
    local firstBag = opt.firstBag
    if firstBag == nil then firstBag = (R.bagSeq == 0) end
    if firstBag and (t[1] == 'S' or t[1] == 'Z') then
      -- 首袋排除 S/Z 开局：与袋内第一个非 S/Z **交换**（不重洗，见文件头陷阱 2）
      for i = 2, #t do
        if t[i] ~= 'S' and t[i] ~= 'Z' then
          t[1], t[i] = t[i], t[1]
          break
        end
      end
    end
    R.bagSeq = R.bagSeq + 1
    for i = 1, #t do queue[#queue + 1] = { name = t[i], bag = R.bagSeq } end
    return R.bagSeq
  end

  function R.take(queue)
    if #queue == 0 then R.refill(queue) end
    local e = table.remove(queue, 1)
    return e.name, e.bag
  end

  -- newGame 用：袋序归零（队列由调用方清空——本模块不持有队列）
  function R.reset()
    R.bagSeq = 0
  end

  return R
end

return M
