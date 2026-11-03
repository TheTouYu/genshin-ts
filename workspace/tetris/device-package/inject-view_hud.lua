--[[==========================================================================
 tetris/view_hud.lua —— HUD / 横幅 / 结算文案的**纯格式化层**
 ----------------------------------------------------------------------------
 为什么单独一层：这些字符串是**测试契约**——tests/*.json 里有 `contains` 断言逐字比对
 （例：`得分 0　消行 0　等级 1　已填 0`，注意中间是全角空格 U+3000）。
 它们以前散在 renderHud / renderNext / 结算 / 横幅 十几处字符串拼接里，
 改一个空格就会静默打红一片用例；现在集中一处，且能在 lua5.3 上 50ms 断言。

 约定：本文件只做「数字 → 字符串」和「棋盘 → 计数」，不碰控件、不读全局。
========================================================================]]

local M = {}

-- 全角空格（U+3000）：HUD 分隔符，必须与历史文案逐字一致
local SEP = '\227\128\128'

M.SEP = SEP

M.new = function(spec)
  spec = spec or {}
  local CFG = spec.config
  local H = {}

  -- 棋盘已填格数（renderHud 里手写的双循环）
  function H.filledOf(board, rows, cols)
    local n = 0
    for r = 1, rows do
      local row = board[r]
      if row then
        for c = 1, cols do
          if row[c] and row[c] ~= 0 then n = n + 1 end
        end
      end
    end
    return n
  end

  -- 主 HUD：`得分 N　消行 N　等级 N　已填 N`
  function H.hudText(o)
    return '得分 ' .. (o.score or 0)
      .. SEP .. '消行 ' .. (o.lines or 0)
      .. SEP .. '等级 ' .. (o.level or 1)
      .. SEP .. '已填 ' .. (o.filled or 0)
  end

  -- 历史最高：`最高 N`
  function H.bestText(best)
    return '最高 ' .. (best or 0)
  end

  -- 「下一个」小标题
  function H.nextLabel()
    return '下一个'
  end

  -- 双屏对家盘：得分行 / 等级行（P2 与 AI 共用，标签由调用方给）
  function H.peerScoreText(o)
    return '得分 ' .. (o.score or 0) .. SEP .. '消行 ' .. (o.lines or 0)
  end

  function H.peerLevelText(o)
    return '等级 ' .. (o.level or 1) .. SEP .. '落块 ' .. (o.pieceCount or 0)
  end

  function H.peerLabel(mode)
    return (mode == 'pvp') and 'P2 盘' or 'AI 盘'
  end

  -- 暂停/键位表页脚的「本局小结」：「本局落块 N　消行 N　最高 N」
  function H.sessionText(o)
    return '本局落块 ' .. (o.pieceCount or 0)
      .. SEP .. '消行 ' .. (o.lines or 0)
      .. SEP .. '最高 ' .. (o.best or 0)
  end

  -- 顶/底横幅的短文案（升级/消行/接管/交还等）：真源在 copy.lua，这里只做 %d 插值
  function H.fmt(tpl, ...)
    if not tpl then return '' end
    local args = { ... }
    local ok, out = pcall(string.format, tpl, table.unpack(args))
    if ok then return out end
    return tpl
  end

  return H
end

return M
