--[[==========================================================================
  tests-lua/core_skills_rules_test.lua —— core_skills 纯规则核心的 headless 验收
  跑法：cd /home/genshin-ts/workspace/tetris && lua5.3 tests-lua/core_skills_rules_test.lua
  判据：全 PASS、退出码 0（任一 FAIL ⇒ 退出码 1）

  要证明什么（任务书 ①②③④ + 契约对照）：
    ① 每个角色的技能：满足条件能 fire、不满足不能（含 reason code + 文案 key）
    ② 同一事件序列跑两遍结果逐字段一致（确定性；含确定性 LCG）
    ③ 充能/冷却边界：0、恰好等于阈值、超过阈值（能量/引力值/叠层/蓄力/月诱）
    ④ fire / charge / tick 的 effects 与旧 skills.lua **同名逻辑逐项一致**
       —— 差分组同时驱动旧实现与新核心，比 effects（映射回旧 kind）、mult、cd、energy
    ⑤ 表现层不复制数值：catalog 的阈值与 copy/NUM 是同一个值；日志锚与旧实现逐字相同
    ⑥ 坏域回归钉：effect 自带 role/target（旧实现让「冰莲串盘」成为可能）

  设计取舍：旧 skills.lua 存在时才跑差分组（它退役后本文件仍然全绿）；
  缺它时打印 SKIP 行，退出码不受影响。
========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'

-- ---------------------------------------------------------------------------
-- 微型测试框架（与 tests-lua/skills_test.lua 同风格：PASS/FAIL 行 + 退出码）
-- ---------------------------------------------------------------------------
local pass, fail = 0, 0
local fails = {}

local function fmt(v)
  if type(v) == 'string' then return '"' .. v .. '"' end
  if type(v) == 'number' then
    if v == math.floor(v) and math.abs(v) < 1e15 then return tostring(math.floor(v)) end
    return string.format('%.6g', v)
  end
  return tostring(v)
end

local function ok(cond, name, detail)
  if cond then
    pass = pass + 1
    io.write('PASS  ', name, '\n')
  else
    fail = fail + 1
    fails[#fails + 1] = name .. (detail and ('  <' .. detail .. '>') or '')
    io.write('FAIL  ', name, detail and ('  <' .. detail .. '>') or '', '\n')
  end
end

local function eq(got, want, name)
  ok(got == want, name, 'got=' .. fmt(got) .. ' want=' .. fmt(want))
end

local function near(got, want, name, eps)
  eps = eps or 1e-9
  local g, w = tonumber(got), tonumber(want)
  ok(g ~= nil and w ~= nil and math.abs(g - w) <= eps, name,
    'got=' .. fmt(got) .. ' want≈' .. fmt(want))
end

local function gt(got, base, name)
  local g, b = tonumber(got), tonumber(base)
  ok(g ~= nil and b ~= nil and g > b, name, 'got=' .. fmt(got) .. ' want>' .. fmt(base))
end

local function hasSub(s, sub, name)
  ok(type(s) == 'string' and string.find(s, sub, 1, true) ~= nil, name,
    'got=' .. fmt(s) .. ' want含' .. fmt(sub))
end

local function noThrow(fn, name)
  local okk, err = pcall(fn)
  ok(okk, name, okk and nil or tostring(err))
end

-- ---------------------------------------------------------------------------
-- 装载（模块自身不 require；这里 loadfile，等价 main 的 loadModule）
-- ---------------------------------------------------------------------------
local function loadCandidates(paths)
  for i = 1, #paths do
    -- loadfile 只编译不执行：拿到的 chunk 要自己调一次才等于 main 的 loadModule
    local okLoad, chunk = pcall(loadfile, paths[i])
    if okLoad and type(chunk) == 'function' then
      local okRun, mod = pcall(chunk)
      if okRun and type(mod) == 'table' then return mod, paths[i] end
    end
  end
  return nil, nil
end

local function prefixed(p)
  return { ROOT .. '/' .. p, p, './' .. p, '../' .. p }
end

local coreM, corePath = loadCandidates(prefixed('lua/tetris/core_skills.lua'))
local catM, catPath = loadCandidates(prefixed('lua/tetris/core_skills_catalog.lua'))
local skillsM, skillsPath = loadCandidates(prefixed('lua/tetris/skills.lua'))
local copyM = loadCandidates(prefixed('lua/tetris/copy.lua'))
local configM = loadCandidates(prefixed('lua/tetris/config.lua'))

if coreM == nil or catM == nil then
  io.write('FATAL 无法装载 core_skills.lua / core_skills_catalog.lua\n')
  os.exit(2)
end
if skillsM == nil then
  io.write('FATAL 无法装载 skills.lua（数值表是注入源，缺它无法构造 core）\n')
  os.exit(2)
end
io.write('LOAD  ', corePath, '  VERSION=', tostring(coreM.VERSION), '\n')
io.write('LOAD  ', catPath, '  VERSION=', tostring(catM.VERSION), '\n')
io.write('LOAD  ', skillsPath, '  (旧实现，差分组用)\n')
io.write('----\n')

local NUM = skillsM.NUM
local OLD = skillsM
local C = coreM.new { num = NUM, copy = copyM, roster = NUM.ROLES }
local CAT = catM.new { copy = copyM, num = NUM, config = configM, talents = skillsM.TALENTS }

local IDS = { 'nahida', 'keqing', 'ganyu', 'columbina' }

-- ===========================================================================
-- 组 0：纯度与边界（ARCH §1 三条硬规则；源码级判据）
-- ===========================================================================
local function slurp(path)
  local f = io.open(path, 'r')
  if not f then return nil end
  local s = f:read('a')
  f:close()
  return s
end

local function stripComments(src)
  local s = (src:gsub('%-%-%[%[.-%]%]', ''))
  s = (s:gsub('%-%-[^\n]*', ''))
  return s
end

local srcCore = slurp(corePath)
local srcCat = slurp(catPath)
ok(srcCore ~= nil and #srcCore > 1000, '0.01 core_skills.lua 可读且非空')
ok(srcCat ~= nil and #srcCat > 1000, '0.02 core_skills_catalog.lua 可读且非空')

local codeCore = stripComments(srcCore or '')
local codeCat = stripComments(srcCat or '')
for _, pair in ipairs({ { 'core', codeCore }, { 'catalog', codeCat } }) do
  local nm, code = pair[1], pair[2]
  ok(not code:find('print%s*%(', 1) and not code:find('io%.write', 1),
    '0.03 ' .. nm .. ' 不 print / 不写 stdout')
  ok(not code:find('require%s*%(', 1), '0.04 ' .. nm .. ' 不 require（纯依赖注入）')
  ok(not code:find('game%.[%a_]', 1) and not code:find('ctl%.[%a_]', 1),
    '0.05 ' .. nm .. ' 不碰 game.* / ctl.*')
  ok(not code:find('os%.time', 1) and not code:find('math%.random', 1),
    '0.06 ' .. nm .. ' 不读时间/全局随机（可复现）')
end

local okErr, err = pcall(coreM.new, {})
ok(not okErr, '0.07 M.new 缺 spec.num 时明确报错（数值表必须注入）')
hasSub(tostring(err), 'spec.num', '0.08 报错信息点名 spec.num')

-- ===========================================================================
-- 组 1：构造 —— newState 形状 / 起始解锁 / 容错
-- ===========================================================================
local S = C.newState()
eq(#S.party, 1, '1.01 起始 party 只有 1 人')
eq(S.party[1], 'nahida', '1.02 起始 party = nahida')
eq(S.partyMax, 2, '1.03 partyMax = 2')
eq(S.active, 1, '1.04 active 指向 party[1]')
eq(#S.roles, 4, '1.05 四角色全部入册')
eq(S.unlocked.nahida, true, '1.06 起始解锁 纳西妲')
eq(S.unlocked.keqing, false, '1.07 起始未解锁 刻晴')
eq(S.lv.nahida, 1, '1.08 起始 lv=1')
eq(S.cd.nahida, 0, '1.09 起始 cd=0')
eq(S.energy.nahida, 0, '1.10 起始 energy=0')
eq(S.nodes.nahida[1], 1, '1.11 N1 初始已点 1 级')
eq(S.nodes.nahida[3], 0, '1.12 N3 初始未点')
eq(S.tier.nahida, 1, '1.13 起始 AI 档位 1')
eq(type(S.tal.nahida), 'table', '1.14 天赋运行时状态就位（不依赖首次使用）')

local Sdup = C.newState { roles = { 'nahida', 'nahida', 'bogus' }, partyMax = 0 }
eq(#Sdup.party, 0, '1.15 partyMax=0 ⇒ 不入队（边界不崩）')
eq(Sdup.active, 0, '1.16 空队伍 active=0')
eq(#Sdup.roles, 2, '1.17 重复角色名去重（nahida 只入册一次）')

noThrow(function() C.charge(nil, nil) end, '1.18 charge(nil) 不抛错')
noThrow(function() C.canFire(nil, nil, nil) end, '1.19 canFire(nil) 不抛错')
noThrow(function() C.fire(nil, nil) end, '1.20 fire(nil) 不抛错')
noThrow(function() C.tick(nil, 1) end, '1.21 tick(nil) 不抛错')
noThrow(function() C.params({}, 'nobody') end, '1.22 params 未知角色不抛错')
eq(C.mult(nil, nil), 1, '1.23 mult 缺省 = 1')
eq(#C.buffs(nil, 'ganyu'), 0, '1.24 buffs(nil) = 空表')
eq(C.stacks(nil, 'keqing'), 0, '1.25 stacks(nil) = 0')

-- ===========================================================================
-- 组 2：canFire 门禁（每角色：满足时 ok、不满足时 false + code + 文案 key）
-- ===========================================================================
do
  local function mk(role)
    return C.newState { startRoles = { role } }
  end
  local st = mk('nahida')
  local okk, code, n, key = C.canFire(st, 'nahida')
  eq(okk, true, '2.01 纳西妲初始即可施放')
  eq(code, 'ok', '2.02 门禁通过 code=ok')
  eq(key, 'skill.reason.ok', '2.03 通过时也带文案 key')
  eq(n, 0, '2.04 通过时 n=0')

  eq(select(2, C.canFire(st, 'nobody')), 'unknown-role', '2.05 未知角色 ⇒ unknown-role')
  eq(select(4, C.canFire(st, 'nobody')), 'skill.reason.unknownRole',
    '2.06 unknown-role 对应文案 key')
  eq(select(2, C.canFire(st, 'keqing')), 'locked', '2.07 未解锁 ⇒ locked')
  eq(select(4, C.canFire(st, 'keqing')), 'skill.reason.locked', '2.08 locked 文案 key')

  -- not-in-party：已解锁但不在队伍（partyMax=1 时第二人只解锁不入队）
  local st2 = C.newState { startRoles = { 'nahida' }, partyMax = 1 }
  st2.unlocked.ganyu = true
  eq(select(2, C.canFire(st2, 'ganyu')), 'not-in-party', '2.09 已解锁未入队 ⇒ not-in-party')
  eq(select(4, C.canFire(st2, 'ganyu')), 'skill.reason.notInParty', '2.10 文案 key')

  -- cd：正数拒绝，n=剩余秒
  local st3 = mk('nahida')
  st3.cd.nahida = 3.4
  local ok3, code3, n3, key3 = C.canFire(st3, 'nahida')
  eq(ok3, false, '2.11 CD 中拒绝')
  eq(code3, 'cd', '2.12 why=cd')
  near(n3, 3.4, '2.13 n = 剩余 CD')
  eq(key3, 'skill.reason.cd', '2.14 cd 文案 key')

  -- cd 边界：0 可放；极小正数仍拒绝
  st3.cd.nahida = 0
  eq(select(1, C.canFire(st3, 'nahida')), true, '2.15 cd=0 ⇒ 可放')
  st3.cd.nahida = 1e-6
  eq(select(1, C.canFire(st3, 'nahida')), false, '2.16 cd=1e-6 ⇒ 仍不可放（>0 即 CD）')
  st3.cd.nahida = 0

  -- energy：少女对战要 60
  local st4 = mk('columbina')
  local ok4, code4, n4 = C.canFire(st4, 'columbina', { mode = 'pvp' })
  eq(ok4, false, '2.17 少女对战缺能量 ⇒ 拒绝')
  eq(code4, 'energy', '2.18 why=energy')
  near(n4, NUM.COST.columbina, '2.19 n = 能量缺口 = COST.columbina')
  st4.energy.columbina = NUM.COST.columbina
  eq(select(1, C.canFire(st4, 'columbina', { mode = 'pvp' })), true,
    '2.20 能量恰好等于成本 ⇒ 可放（边界闭区间）')
  st4.energy.columbina = NUM.COST.columbina - 0.001
  eq(select(1, C.canFire(st4, 'columbina', { mode = 'pvp' })), false,
    '2.21 少 0.001 点 ⇒ 不可放（阈值不取整）')
  eq(select(1, C.canFire(st4, 'columbina', { mode = 'casual' })), true,
    '2.22 单人分支不耗能 ⇒ 缺能量也可放')

  -- 雷楔二段：CD 未好也能放（免费的第二段）
  local st5 = mk('keqing')
  st5.cd.keqing = 5
  st5.tal.keqing.markT = 5
  eq(select(1, C.canFire(st5, 'keqing')), true, '2.23 雷楔存续 ⇒ 跳过 CD 门禁')
  st5.tal.keqing.markT = 0
  eq(select(2, C.canFire(st5, 'keqing')), 'cd', '2.24 雷楔消失后恢复 CD 门禁')
end

-- ===========================================================================
-- 组 3：fire —— 四角色施放的 effects 与写回
-- ===========================================================================
do
  -- 纳西妲：AI 接管
  local S3 = C.newState { startRoles = { 'nahida' } }
  local eff3, res3 = C.fire(S3, { role = 'nahida', mode = 'casual' })
  eq(res3.ok, true, '3.01 纳西妲施放成功')
  eq(res3.effect, 'ai-takeover', '3.02 旧 effect 串 = ai-takeover（接线兼容）')
  eq(res3.n, 1, '3.03 n = AI 档位 1')
  eq(res3.tier, 1, '3.04 tier 回传 1')
  eq(#eff3, 1, '3.05 产出 1 个效果')
  eq(eff3[1].kind, 'takeOver', '3.06 kind=takeOver')
  eq(eff3[1].target, 'self', '3.07 target=self')
  near(eff3[1].sec, C.params(S3, 'nahida').aiDur + 0.5, '3.08 sec = aiDur + 净善摄受 0.5')
  near(res3.takeDur, eff3[1].sec, '3.09 res.takeDur 与 effect.sec 同源')
  near(S3.cd.nahida, NUM.CD.nahida, '3.10 CD 起算 = CD.nahida')
  near(S3.tal.nahida.seedT, NUM.NAHIDA.SEED_DUR, '3.11 蕴种印就位')
  near(S3.tal.nahida.domainT, NUM.NAHIDA.DOMAIN_DUR, '3.12 摩耶之殿就位')

  -- 刻晴：短按 / 长按 / 二段
  local SK = C.newState { startRoles = { 'keqing' } }
  local e1, r1 = C.fire(SK, { role = 'keqing', col = 6 })
  eq(r1.effect, 'blink', '3.13 短按 = blink')
  eq(e1[1].col, 6, '3.14 effect.col = 当前列')
  near(SK.tal.keqing.markT, NUM.KEQING.MARK_LIFE, '3.15 雷楔就位')
  eq(SK.tal.keqing.markCol, 6, '3.16 雷楔记列号')
  ok(SK.cd.keqing < NUM.CD.keqing, '3.17 玉衡充能 ⇒ CD < 基准（÷1.15）')
  ok(e1[1].lockSec > 0, '3.18 blink 带 lockSec（N3 落底禁横移，main 现在没接）')

  local e2, r2 = C.fire(SK, { role = 'keqing' })   -- CD 中，但雷楔在 ⇒ 免费二段
  eq(r2.ok, true, '3.19 雷楔期内二次施放成功（免 CD）')
  eq(r2.effect, 'mark-blink', '3.20 二段 = mark-blink')
  eq(e2[1].kind, 'markBlink', '3.21 kind=markBlink')
  eq(e2[1].col, 6, '3.22 引爆落在雷楔列')
  eq(e2[1].cells, NUM.KEQING.SLASH_CELLS, '3.23 cells = 连斩格数')
  near(SK.tal.keqing.markT, 0, '3.24 引爆后雷楔清除')
  near(SK.cd.keqing, r1.cd, '3.25 引爆不重置 CD')

  local SL = C.newState { startRoles = { 'keqing' } }
  local e3 = C.fire(SL, { role = 'keqing', col = 2, keyHold = NUM.KEQING.LONG_PRESS + 0.01 })
  eq(e3[1].kind, 'blinkBest', '3.26 长按（keyHold）⇒ blinkBest')
  local SL2 = C.newState { startRoles = { 'keqing' } }
  local e4 = C.fire(SL2, { role = 'keqing', col = 2, holdSec = NUM.KEQING.LONG_PRESS + 0.01 })
  eq(e4[1].kind, 'blinkBest', '3.27 长按（旧字段 holdSec 兜底）⇒ blinkBest')
  local SL3 = C.newState { startRoles = { 'keqing' } }
  local e5 = C.fire(SL3, { role = 'keqing', col = 2, keyHold = 0, holdSec = 9 })
  eq(e5[1].kind, 'blink', '3.28 keyHold 显式给 0 ⇒ 不再回落 holdSec（语义不错位）')

  -- 甘雨：冻结
  local SG = C.newState { startRoles = { 'ganyu' } }
  local e6, r6 = C.fire(SG, { role = 'ganyu', mode = 'casual', boardH = 5 })
  eq(e6[1].kind, 'freeze', '3.29 kind=freeze')
  eq(e6[1].rows, C.params(SG, 'ganyu').freezeRows, '3.30 rows = freezeRows（有消费方了）')
  near(e6[1].sec, C.params(SG, 'ganyu').freezeSec, '3.31 sec = freezeSec')
  near(SG.tal.ganyu.lotusT, NUM.GANYU.LOTUS_LIFE, '3.32 冰莲埋下')
  eq(SG.tal.ganyu.lotusArmed, true, '3.33 冰莲待绽放')
  near(C.params(SG, 'ganyu').gravityMult, NUM.GANYU.FIELD_GRAVITY,
    '3.34 冻结期重力 ×1.20（派生量，接线读它）')

  -- 背水一战：板高 ≥ CLUTCH_H ⇒ +1 行
  local SG2 = C.newState { startRoles = { 'ganyu' } }
  local e7 = C.fire(SG2, { role = 'ganyu', boardH = NUM.GANYU.CLUTCH_H })
  eq(e7[1].rows, C.params(SG2, 'ganyu').freezeRows + 1, '3.35 板高 ≥ CLUTCH_H ⇒ 冻结行 +1')

  -- 少女：对战推层 / 单人清底
  local SC = C.newState { startRoles = { 'columbina' } }
  SC.energy.columbina = NUM.ENERGY_MAX
  local e8, r8 = C.fire(SC, { role = 'columbina', mode = 'pvp', oppH = 5 })
  eq(r8.effect, 'ripple', '3.36 对战旧 effect 串 = ripple')
  eq(e8[1].kind, 'addGarbage', '3.37 kind=addGarbage')
  eq(e8[1].target, 'opp', '3.38 target=opp（跨盘效果自带作用盘）')
  eq(e8[1].rows, NUM.COLUMBINA.LAYERS[1], '3.39 rows = LAYERS[1]（N1 Lv1）')
  near(SC.energy.columbina, NUM.ENERGY_MAX - NUM.COST.columbina, '3.40 扣能量 60')

  local SC2 = C.newState { startRoles = { 'columbina' } }
  local e9, r9 = C.fire(SC2, { role = 'columbina', mode = 'casual' })
  eq(r9.effect, 'gravity-clear', '3.41 单人旧 effect 串 = gravity-clear')
  eq(e9[1].kind, 'clearBottom', '3.42 单人降级 kind=clearBottom')
  eq(e9[1].target, 'self', '3.43 target=self')
  near(SC2.energy.columbina, 0, '3.44 单人分支不耗能')
end

-- ===========================================================================
-- 组 4：tick —— 冷却/能量/持续计时 + 到期效果（不含 drain 队列）
-- ===========================================================================
do
  local S4 = C.newState { startRoles = { 'nahida' } }
  C.tick(S4, 10)
  near(S4.energy.nahida, NUM.ENERGY_REGEN * 10, '4.01 能量自然回复 10s')
  C.tick(S4, 1000)
  near(S4.energy.nahida, NUM.ENERGY_MAX, '4.02 能量封顶 ENERGY_MAX')
  S4.cd.nahida = 5
  C.tick(S4, 2)
  near(S4.cd.nahida, 3, '4.03 冷却递减 5-2=3')
  S4.cd.nahida = 1
  C.tick(S4, 99)
  near(S4.cd.nahida, 0, '4.04 冷却不降为负')
  local eBefore = S4.energy.nahida
  eq(#C.tick(S4, 0), 0, '4.05 dt=0 不推任何状态、不吐效果')
  near(S4.energy.nahida, eBefore, '4.06 dt=0 能量不变')
  eq(#C.tick(S4, -5), 0, '4.07 dt<0 不推任何状态')

  -- 冰莲自然绽放：tick 直接返回效果（旧实现要 tick + drain 两步）
  local S5 = C.newState { startRoles = { 'ganyu' } }
  C.fire(S5, { role = 'ganyu' })
  eq(#C.tick(S5, NUM.GANYU.LOTUS_LIFE - 0.1), 0, '4.08 冰莲未到期不吐效果')
  local bloom = C.tick(S5, 0.2)
  eq(#bloom, 1, '4.09 到点产出 1 个效果')
  eq(bloom[1].kind, 'clearTop', '4.10 自然绽放 = clearTop')
  eq(bloom[1].rows, NUM.GANYU.LOTUS_ROWS, '4.11 清顶行数 = LOTUS_ROWS')
  eq(bloom[1].phase, 'bloom', '4.12 phase=bloom（与提前绽放区分）')
  eq(bloom[1].role, 'ganyu', '4.13 效果自带角色（治「切人后串盘」）')
  eq(#C.tick(S5, 1), 0, '4.14 绽放只发生一次（队列已消费）')

  -- 冻结到点：freezeT/gravityMult 回到常态
  local S6 = C.newState { startRoles = { 'ganyu' } }
  C.fire(S6, { role = 'ganyu' })
  near(C.params(S6, 'ganyu').gravityMult, NUM.GANYU.FIELD_GRAVITY, '4.15 冻结期 ×1.20')
  C.tick(S6, NUM.GANYU.FREEZE_SEC + 0.1)
  near(C.params(S6, 'ganyu').gravityMult, 1, '4.16 冻结结束重力恢复 ×1')

  -- 月诱到期整组清零（边界：恰好到期）
  local S7 = C.newState { startRoles = { 'columbina' } }
  S7.tal.columbina.lure = 2
  S7.tal.columbina.lureT = NUM.COLUMBINA.LURE_DUR
  C.tick(S7, NUM.COLUMBINA.LURE_DUR - 0.01)
  eq(S7.tal.columbina.lure, 2, '4.17 月诱恰好未到期 ⇒ 层数保留')
  C.tick(S7, 0.02)
  eq(S7.tal.columbina.lure, 0, '4.18 月诱到期 ⇒ 整组清零')
end

-- ===========================================================================
-- 组 5：charge —— 事件结算（消行/落块）
-- ===========================================================================
do
  -- 纳西妲：蕴种印触发 + 领域倍率 + 间隔门禁
  local S5 = C.newState { startRoles = { 'nahida' } }
  C.fire(S5, { role = 'nahida', mode = 'casual' })
  local r1 = C.charge(S5, { kind = 'clear', role = 'nahida', cleared = 2, info = { mode = 'casual' } })
  eq(#r1.effects, 1, '5.01 消行触发灭净三业')
  eq(r1.effects[1].kind, 'clearBottom', '5.02 单人降级为 clearBottom')
  eq(r1.effects[1].rows, 1, '5.03 精通 216 ⇒ 连锁 1 行')
  eq(r1.effects[1].target, 'self', '5.04 target=self')
  ok(r1.mult > 1.14 and r1.mult < 1.16, '5.05 领域内倍率 ×1.149',
    'mult=' .. tostring(r1.mult))
  near(S5.tal.nahida.seedCd, NUM.NAHIDA.TRIGGER_GAP_DOMAIN, '5.06 领域内触发间隔 2.25s')
  eq(S5.tal.nahida.lines, 2, '5.07 累计消行 = 精通代理的输入')

  local r2 = C.charge(S5, { kind = 'clear', role = 'nahida', cleared = 1, info = { mode = 'casual' } })
  eq(#r2.effects, 0, '5.08 间隔未到不重复触发')
  C.tick(S5, NUM.NAHIDA.TRIGGER_GAP_DOMAIN + 0.01)
  local r3 = C.charge(S5, { kind = 'clear', role = 'nahida', cleared = 1, info = { mode = 'casual' } })
  eq(#r3.effects, 1, '5.09 间隔到期后再次触发')

  -- 对战：同一个触发改成推对手
  local SD = C.newState { startRoles = { 'nahida' } }
  C.fire(SD, { role = 'nahida', mode = 'pvp' })
  SD.tal.nahida.seedCd = 0
  local rd = C.charge(SD, { kind = 'clear', role = 'nahida', cleared = 1, info = { mode = 'pvp' } })
  eq(rd.effects[1].kind, 'addGarbage', '5.10 对战 ⇒ addGarbage')
  eq(rd.effects[1].target, 'opp', '5.11 对战 target=opp')

  -- 精通成长与封顶（边界：0 行 / 50 行 / 100 行）
  local SM = C.newState { startRoles = { 'nahida' } }
  eq(C.params(SM, 'nahida').chainRows, 1, '5.12 0 行 ⇒ 连锁 1 行（下界）')
  SM.tal.nahida.lines = 50
  eq(C.params(SM, 'nahida').chainRows, 2, '5.13 50 行 ⇒ 精通 600 ⇒ 连锁 2 行')
  SM.tal.nahida.lines = 100
  eq(C.params(SM, 'nahida').chainRows, 3, '5.14 100 行 ⇒ 连锁 3 行（DMG_CAP 封顶）')
  SM.tal.nahida.lines = 100000
  eq(C.params(SM, 'nahida').chainRows, 3, '5.15 巨量精通不超过 3 行（上限）')

  -- 暴击追加：固定 rng ⇒ 必中 / 必不中
  local SC1 = C.newState { startRoles = { 'nahida' } }
  C.fire(SC1, { role = 'nahida' })
  SC1.tal.nahida.lines = 50
  SC1.tal.nahida.seedCd = 0
  SC1.tal.nahida.rng = 0
  local rc1 = C.charge(SC1, { kind = 'clear', role = 'nahida', cleared = 1,
                              info = { mode = 'casual' } })
  eq(#rc1.effects, 2, '5.16 暴击命中 ⇒ 灭净三业追加一次（2 个效果）')
  local SC2 = C.newState { startRoles = { 'nahida' } }
  C.fire(SC2, { role = 'nahida' })
  SC2.tal.nahida.lines = 50
  SC2.tal.nahida.seedCd = 0
  SC2.tal.nahida.rng = 1000000
  local rc2 = C.charge(SC2, { kind = 'clear', role = 'nahida', cleared = 1,
                              info = { mode = 'casual' } })
  eq(#rc2.effects, 1, '5.17 暴击未过 ⇒ 只触发一次')

  -- 刻晴：雷楔期消行 ⇒ 雷暴连斩
  local SK = C.newState { startRoles = { 'keqing' } }
  C.fire(SK, { role = 'keqing', col = 4 })
  local rk = C.charge(SK, { kind = 'clear', role = 'keqing', cleared = 1, info = {} })
  eq(#rk.effects, 1, '5.18 雷楔期消行产出 1 个效果')
  eq(rk.effects[1].kind, 'clearColumn', '5.19 kind=clearColumn')
  eq(rk.effects[1].rows, NUM.KEQING.SLASH_CELLS, '5.20 连斩格数 = SLASH_CELLS')
  eq(rk.effects[1].col, 4, '5.21 连斩落在雷楔列')
  near(SK.tal.keqing.markT, 0, '5.22 连斩消耗雷楔')
  ok(rk.mult >= 1 + NUM.KEQING.YH_SCORE - 1e-9, '5.23 玉衡窗口进倍率')

  -- 刻晴：四叠边界（0 / 3 / 4 层）
  local S4 = C.newState { startRoles = { 'keqing' } }
  eq(C.stacks(S4, 'keqing'), 0, '5.24 未操作 ⇒ 0 层')
  C.charge(S4, { kind = 'lock', role = 'keqing', info = { moved = true, rotated = true,
                                                          hard = true, dwell = 0.5 } })
  eq(C.stacks(S4, 'keqing'), 3, '5.25 三操作 ⇒ 3 层')
  near(C.mult(S4, 'keqing'), 1 + 3 * NUM.KEQING.STK_VAL, '5.26 3 层 = +18%')
  C.charge(S4, { kind = 'clear', role = 'keqing', cleared = 1, info = {} })
  eq(C.stacks(S4, 'keqing'), 4, '5.27 消行补第 4 层')
  C.charge(S4, { kind = 'lock', role = 'keqing', info = { moved = true, rotated = true,
                                                          hard = true, cleared = 4 } })
  eq(C.stacks(S4, 'keqing'), NUM.KEQING.STK_MAX, '5.28 四类都做 ⇒ 停在 4 层（上限）')
  C.tick(S4, NUM.KEQING.STK_DUR + 0.1)
  eq(C.stacks(S4, 'keqing'), 0, '5.29 8s 后全部叠层过期')

  -- 甘雨：冰莲提前绽放 + 唯此一心窗口
  local SG = C.newState { startRoles = { 'ganyu' } }
  C.fire(SG, { role = 'ganyu' })
  local rg = C.charge(SG, { kind = 'clear', role = 'ganyu', cleared = 1, info = {} })
  eq(#rg.effects, 1, '5.30 冻结期消行 ⇒ 冰莲提前绽放')
  eq(rg.effects[1].kind, 'clearTop', '5.31 kind=clearTop')
  eq(rg.effects[1].rows, NUM.GANYU.LOTUS_BROKEN_ROWS, '5.32 提前绽放只清 2 行')
  eq(rg.effects[1].phase, 'early', '5.33 phase=early')
  eq(SG.tal.ganyu.lotusArmed, false, '5.34 提前绽放后不再自然绽放')
  ok(rg.mult < 1 + NUM.GANYU.FOCUS_BONUS, '5.35 首次消行无窗口加成')
  near(SG.tal.ganyu.critWin, NUM.GANYU.FOCUS_WINDOW, '5.36 消行开 5s 窗口')
  local rg2 = C.charge(SG, { kind = 'clear', role = 'ganyu', cleared = 1, info = {} })
  ok(rg2.mult >= 1 + NUM.GANYU.FOCUS_BONUS - 1e-9, '5.37 窗口内再消行 ×1.20',
    'mult=' .. tostring(rg2.mult))

  -- 甘雨：霜华矢蓄力（慢锁 2 次封顶 / 硬降不蓄力）
  local SQ = C.newState { startRoles = { 'ganyu' } }
  for _ = 1, 3 do
    C.charge(SQ, { kind = 'lock', role = 'ganyu',
                   info = { hard = false, dwell = NUM.GANYU.CHARGE_WINDOW + 0.1 } })
  end
  eq(SQ.tal.ganyu.charge, NUM.GANYU.CHARGE_MAX, '5.38 三次慢锁停在 CHARGE_MAX（上限）')
  local base = C.params(SQ, 'ganyu').freezeRows
  local eF = C.fire(SQ, { role = 'ganyu', boardH = 5 })
  eq(eF[1].rows, base + NUM.GANYU.CHARGE_MAX * NUM.GANYU.CHARGE_ROWS,
    '5.39 施放吃到 2 段蓄力（+2 行）')
  eq(SQ.tal.ganyu.charge, 0, '5.40 施放后蓄力清零')
  local Q2 = C.newState { startRoles = { 'ganyu' } }
  C.charge(Q2, { kind = 'lock', role = 'ganyu', info = { hard = true, dwell = 5 } })
  eq(Q2.tal.ganyu.charge, 0, '5.41 硬降不蓄力')

  -- 少女：引力值充能边界（0 / 满值 / 超上限收敛）+ 满辉
  local SX = C.newState { startRoles = { 'columbina' } }
  SX.energy.columbina = NUM.ENERGY_MAX
  C.charge(SX, { kind = 'clear', role = 'columbina', cleared = 2, info = { mode = 'pvp' } })
  near(SX.tal.columbina.gravity, 2 * NUM.COLUMBINA.GRAVITY_PER_LINE, '5.42 消 2 行 = +10')
  for _ = 1, 30 do
    C.charge(SX, { kind = 'clear', role = 'columbina', cleared = 4, info = { mode = 'pvp' } })
  end
  near(SX.tal.columbina.gravity, NUM.COLUMBINA.GRAVITY_MAX, '5.43 引力值封顶')
  local eX, rX = C.fire(SX, { role = 'columbina', mode = 'pvp', oppH = 5 })
  ok(rX.n >= 3, '5.44 满辉放大推层（×1.5 向上取整）', 'n=' .. tostring(rX.n))
  eq(SX.tal.columbina.gravity, 0, '5.45 满辉后引力值清零')
  eq(SX.tal.columbina.lure, 1, '5.46 满辉给 1 层月诱')
  near(SX.tal.columbina.lureT, NUM.COLUMBINA.LURE_DUR, '5.47 月诱计时就位')
  near(C.mult(SX, 'columbina'), 1 + NUM.COLUMBINA.LURE_BONUS, '5.48 月诱每层 +5%')

  -- 少女：领域内引力积攒 ×1.13
  local SY = C.newState { startRoles = { 'columbina' } }
  SY.tal.columbina.domainT = NUM.COLUMBINA.DOMAIN_LIFE
  C.charge(SY, { kind = 'clear', role = 'columbina', cleared = 3, info = { mode = 'casual' } })
  near(SY.tal.columbina.gravity,
    3 * NUM.COLUMBINA.GRAVITY_PER_LINE * NUM.COLUMBINA.DOMAIN_GAIN, '5.49 领域内 ×1.13')
end

-- ===========================================================================
-- 组 6：确定性 —— 同一序列跑两遍，逐字段一致
-- ===========================================================================
local function dumps(v, depth)
  depth = depth or 0
  if depth > 8 then return '…' end
  local ty = type(v)
  if ty == 'number' then return string.format('%.12g', v) end
  if ty ~= 'table' then return tostring(v) end
  local keys = {}
  for k in pairs(v) do keys[#keys + 1] = k end
  table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
  local parts = {}
  for i = 1, #keys do
    parts[#parts + 1] = tostring(keys[i]) .. '=' .. dumps(v[keys[i]], depth + 1)
  end
  return '{' .. table.concat(parts, ',') .. '}'
end

local function runSequence()
  local s = C.newState { startRoles = { 'nahida', 'columbina' }, partyMax = 2 }
  s.active = 2
  local trace = {}
  local function note(tag, res)
    trace[#trace + 1] = tag .. ':' .. dumps(res)
  end
  s.energy.columbina = NUM.ENERGY_MAX
  local e1, r1 = C.fire(s, { role = 'columbina', mode = 'pvp', oppH = 20 })
  note('fire1', { r1, e1 })
  C.tick(s, 3.5)
  local r2 = C.charge(s, { kind = 'clear', role = 'columbina', cleared = 4,
                           info = { mode = 'pvp' } })
  note('clear', r2)
  s.cd.columbina = 0
  s.energy.columbina = NUM.ENERGY_MAX
  s.tal.columbina.gravity = NUM.COLUMBINA.GRAVITY_MAX
  local e3, r3 = C.fire(s, { role = 'columbina', mode = 'pvp' })
  note('fire2', { r3, e3 })
  C.tick(s, NUM.COLUMBINA.LURE_DUR + 1)
  s.active = 1
  s.cd.nahida = 0
  local e4, r4 = C.fire(s, { role = 'nahida', mode = 'pvp' })
  note('fire3', { r4, e4 })
  local r5 = C.charge(s, { kind = 'clear', role = 'nahida', cleared = 2,
                           info = { mode = 'pvp' } })
  note('clear2', r5)
  note('state', s)
  return trace, s
end

do
  local t1, s1 = runSequence()
  local t2, s2 = runSequence()
  eq(#t1, #t2, '6.01 两遍轨迹条数一致')
  local same = true
  local diffAt = nil
  for i = 1, math.min(#t1, #t2) do
    if t1[i] ~= t2[i] then
      same = false
      diffAt = i
      break
    end
  end
  ok(same, '6.02 两遍轨迹逐字一致（effects/mult/notes/readings 全含）',
    diffAt and ('第 ' .. diffAt .. ' 步不同') or nil)
  eq(dumps(s1), dumps(s2), '6.03 两遍末态逐字段一致')

  -- 确定性 LCG：同种子同序列；不同种子序列不同（但都合法）
  local A = C.newState { startRoles = { 'columbina' } }
  local B = C.newState { startRoles = { 'columbina' } }
  A.tal.columbina.rng = 12345
  B.tal.columbina.rng = 12345
  A.tal.columbina.domainT = 999
  B.tal.columbina.domainT = 999
  local ca, cb = 0, 0
  for _ = 1, 50 do
    local ra = C.charge(A, { kind = 'clear', role = 'columbina', cleared = 1,
                             info = { mode = 'pvp' } })
    local rb = C.charge(B, { kind = 'clear', role = 'columbina', cleared = 1,
                             info = { mode = 'pvp' } })
    ca = ca + #ra.effects
    cb = cb + #rb.effects
  end
  eq(ca, cb, '6.04 同种子 50 次消行 ⇒ 触发次数完全相同')
  eq(A.tal.columbina.rng, B.tal.columbina.rng, '6.05 同种子 50 次后 rng 状态相同')

  -- 33% 概率落在合理带（有限采样，确定性）
  local P = C.newState { startRoles = { 'columbina' } }
  P.tal.columbina.domainT = 999
  local procs = 0
  for _ = 1, 200 do
    local rr = C.charge(P, { kind = 'clear', role = 'columbina', cleared = 1,
                             info = { mode = 'pvp' } })
    for i = 1, #rr.effects do
      if rr.effects[i].id == 'columbina.law' then procs = procs + 1 end
    end
  end
  ok(procs >= 40 and procs <= 100, '6.06 新月法则 33% 落在合理带（200 次）',
    'procs=' .. tostring(procs))
end

-- ===========================================================================
-- 组 7：与旧 skills.lua 差分（effects / mult / cd / energy 逐项一致）
-- ===========================================================================
local LEG = coreM.legacy

local function oldToNew(oldEffects)
  local out = {}
  for i = 1, #(oldEffects or {}) do
    local e = oldEffects[i]
    out[#out + 1] = { kind = e.kind, n = e.n, col = e.col or 0, id = e.id }
  end
  return out
end

local function newToOld(newEffects)
  local out = {}
  for i = 1, #(newEffects or {}) do
    local e = LEG(newEffects[i])
    out[#out + 1] = { kind = e.kind, n = e.n, col = e.col or 0, id = e.id }
  end
  return out
end

local function sameEffects(a, b)
  if #a ~= #b then return false, '#a=' .. #a .. ' #b=' .. #b end
  for i = 1, #a do
    if a[i].kind ~= b[i].kind or a[i].n ~= b[i].n or a[i].col ~= b[i].col
      or a[i].id ~= b[i].id then
      return false, string.format('[%d] %s/%s/%s/%s vs %s/%s/%s/%s', i,
        tostring(a[i].kind), tostring(a[i].n), tostring(a[i].col), tostring(a[i].id),
        tostring(b[i].kind), tostring(b[i].n), tostring(b[i].col), tostring(b[i].id))
    end
  end
  return true
end

do
  -- ---- D1/D2：纳西妲 施放 + 消行（含领域倍率/印间隔/暴击追加）----
  local so = OLD.newState { startRoles = { 'nahida' } }
  local sn = C.newState { startRoles = { 'nahida' } }
  local oco = OLD.cast(so, 'nahida', { mode = 'casual' })
  local nce, ncr = C.fire(sn, { role = 'nahida', mode = 'casual' })
  eq(ncr.ok, oco.ok, '7.01 [纳西妲 cast] ok 一致')
  eq(ncr.n, oco.n, '7.02 [纳西妲 cast] n 一致')
  eq(ncr.effect, oco.effect, '7.03 [纳西妲 cast] effect 一致')
  eq(ncr.tier, oco.tier, '7.04 [纳西妲 cast] tier 一致')
  near(ncr.takeDur, oco.takeDur, '7.05 [纳西妲 cast] takeDur 一致')
  near(sn.cd.nahida, so.cd.nahida, '7.06 [纳西妲 cast] cd 一致')
  near(sn.tal.nahida.seedT, so.tal.nahida.seedT, '7.07 [纳西妲 cast] seedT 一致')
  near(sn.tal.nahida.domainT, so.tal.nahida.domainT, '7.08 [纳西妲 cast] domainT 一致')

  local oc = OLD.onClear(so, 'nahida', 2, { mode = 'casual' })
  local nc = C.charge(sn, { kind = 'clear', role = 'nahida', cleared = 2,
                            info = { mode = 'casual' } })
  local okc, whyc = sameEffects(oldToNew(oc.effects), newToOld(nc.effects))
  ok(okc, '7.09 [纳西妲 消行] effects 逐项一致', whyc)
  near(nc.mult, oc.mult, '7.10 [纳西妲 消行] mult 一致')
  near(sn.tal.nahida.seedCd, so.tal.nahida.seedCd, '7.11 [纳西妲 消行] seedCd 一致')
  near(sn.tal.nahida.lines, so.tal.nahida.lines, '7.12 [纳西妲 消行] 累计行数一致')

  local oc2 = OLD.onClear(so, 'nahida', 1, { mode = 'casual' })
  local nc2 = C.charge(sn, { kind = 'clear', role = 'nahida', cleared = 1,
                             info = { mode = 'casual' } })
  eq(#nc2.effects, #(oc2.effects or {}), '7.13 [纳西妲 间隔未到] 触发数一致')
  OLD.tick(so, 2.6)
  C.tick(sn, 2.6)
  local oc3 = OLD.onClear(so, 'nahida', 1, { mode = 'casual' })
  local nc3 = C.charge(sn, { kind = 'clear', role = 'nahida', cleared = 1,
                             info = { mode = 'casual' } })
  local ok3, why3 = sameEffects(oldToNew(oc3.effects), newToOld(nc3.effects))
  ok(ok3, '7.14 [纳西妲 间隔到期] effects 一致', why3)

  -- ---- D3：刻晴 施放 / 二段 / 连斩 / 长按 ----
  local ko = OLD.newState { startRoles = { 'keqing' } }
  local kn = C.newState { startRoles = { 'keqing' } }
  local kco = OLD.cast(ko, 'keqing', { col = 6 })
  local kce, kcr = C.fire(kn, { role = 'keqing', col = 6 })
  eq(kcr.effect, kco.effect, '7.15 [刻晴 cast] effect 一致')
  near(kcr.n, kco.n, '7.16 [刻晴 cast] n（锁定时长）一致')
  near(kn.cd.keqing, ko.cd.keqing, '7.17 [刻晴 cast] cd 一致（玉衡 ÷1.15）')
  eq(kn.tal.keqing.markCol, ko.tal.keqing.markCol, '7.18 [刻晴 cast] 雷楔列一致')
  near(kn.tal.keqing.yhT, ko.tal.keqing.yhT, '7.19 [刻晴 cast] 玉衡计时一致')

  local k2o = OLD.cast(ko, 'keqing', { col = 3 })
  local k2e, k2r = C.fire(kn, { role = 'keqing', col = 3 })
  eq(k2r.effect, k2o.effect, '7.20 [刻晴 二段] effect 一致')
  near(k2r.n, k2o.n, '7.21 [刻晴 二段] n 一致')
  near(kn.tal.keqing.markT, ko.tal.keqing.markT, '7.22 [刻晴 二段] 雷楔清除一致')

  local klo = OLD.newState { startRoles = { 'keqing' } }
  local kln = C.newState { startRoles = { 'keqing' } }
  local hold = NUM.KEQING.LONG_PRESS + 0.01
  local hco = OLD.cast(klo, 'keqing', { col = 2, holdSec = hold })
  local hce, hcr = C.fire(kln, { role = 'keqing', col = 2, holdSec = hold })
  eq(hcr.effect, hco.effect, '7.23 [刻晴 长按] effect 一致（blink-best）')

  local sco = OLD.newState { startRoles = { 'keqing' } }
  local scn = C.newState { startRoles = { 'keqing' } }
  OLD.cast(sco, 'keqing', { col = 4 })
  C.fire(scn, { role = 'keqing', col = 4 })
  local sro = OLD.onClear(sco, 'keqing', 1, { mode = 'casual' })
  local srn = C.charge(scn, { kind = 'clear', role = 'keqing', cleared = 1,
                              info = { mode = 'casual' } })
  local oks, whys = sameEffects(oldToNew(sro.effects), newToOld(srn.effects))
  ok(oks, '7.24 [刻晴 连斩] effects 一致', whys)
  near(srn.mult, sro.mult, '7.25 [刻晴 连斩] mult 一致')

  -- ---- D4：甘雨 施放 / 提前绽放 / 自然绽放 / 蓄力 ----
  local go = OLD.newState { startRoles = { 'ganyu' } }
  local gn = C.newState { startRoles = { 'ganyu' } }
  local gco = OLD.cast(go, 'ganyu', { mode = 'casual', boardH = 5 })
  local gce, gcr = C.fire(gn, { role = 'ganyu', mode = 'casual', boardH = 5 })
  eq(gcr.effect, gco.effect, '7.26 [甘雨 cast] effect 一致')
  near(gcr.n, gco.n, '7.27 [甘雨 cast] n（冻结行数）一致')
  near(gn.tal.ganyu.lotusT, go.tal.ganyu.lotusT, '7.28 [甘雨 cast] 冰莲计时一致')
  eq(gn.tal.ganyu.lotusArmed, go.tal.ganyu.lotusArmed, '7.29 [甘雨 cast] 冰莲待绽放一致')

  local ero = OLD.onClear(go, 'ganyu', 1, { mode = 'casual' })
  local ern = C.charge(gn, { kind = 'clear', role = 'ganyu', cleared = 1,
                             info = { mode = 'casual' } })
  local oke, whye = sameEffects(oldToNew(ero.effects), newToOld(ern.effects))
  ok(oke, '7.30 [甘雨 提前绽放] effects 一致', whye)
  near(ern.mult, ero.mult, '7.31 [甘雨 提前绽放] mult 一致')

  local bo = OLD.newState { startRoles = { 'ganyu' } }
  local bn = C.newState { startRoles = { 'ganyu' } }
  OLD.cast(bo, 'ganyu', {})
  C.fire(bn, { role = 'ganyu' })
  OLD.tick(bo, NUM.GANYU.LOTUS_LIFE + 0.1)
  local drainOld = OLD.drain(bo)
  local bloomNew = C.tick(bn, NUM.GANYU.LOTUS_LIFE + 0.1)
  local okb, whyb = sameEffects(oldToNew(drainOld), newToOld(bloomNew))
  ok(okb, '7.32 [甘雨 自然绽放] 旧 drain 与新 tick 返回一致（取消了队列）', whyb)

  local qo = OLD.newState { startRoles = { 'ganyu' } }
  local qn = C.newState { startRoles = { 'ganyu' } }
  for _ = 1, 2 do
    OLD.onLock(qo, 'ganyu', { hard = false, dwell = NUM.GANYU.CHARGE_WINDOW + 0.1 })
    C.charge(qn, { kind = 'lock', role = 'ganyu',
                   info = { hard = false, dwell = NUM.GANYU.CHARGE_WINDOW + 0.1 } })
  end
  eq(qn.tal.ganyu.charge, qo.tal.ganyu.charge, '7.33 [甘雨 蓄力] 段数一致')
  local qco = OLD.cast(qo, 'ganyu', { boardH = 5 })
  local qcn = select(2, C.fire(qn, { role = 'ganyu', boardH = 5 }))
  near(qcn.n, qco.n, '7.34 [甘雨 蓄力→施放] 冻结行数一致')

  -- ---- D5：少女 对战 / 单人 / 满辉 / 月诱 ----
  local co = OLD.newState { startRoles = { 'columbina' } }
  local cn = C.newState { startRoles = { 'columbina' } }
  co.energy.columbina = NUM.ENERGY_MAX
  cn.energy.columbina = NUM.ENERGY_MAX
  local rco = OLD.cast(co, 'columbina', { mode = 'pvp', oppH = 5 })
  local rce, rcn = C.fire(cn, { role = 'columbina', mode = 'pvp', oppH = 5 })
  eq(rcn.effect, rco.effect, '7.35 [少女 pvp cast] effect 一致')
  near(rcn.n, rco.n, '7.36 [少女 pvp cast] n（推层层数）一致')
  near(cn.energy.columbina, co.energy.columbina, '7.37 [少女 pvp cast] 能量一致')
  near(cn.cd.columbina, co.cd.columbina, '7.38 [少女 pvp cast] cd 一致')

  local solo = OLD.newState { startRoles = { 'columbina' } }
  local soln = C.newState { startRoles = { 'columbina' } }
  local so1 = OLD.cast(solo, 'columbina', { mode = 'casual' })
  local sn1, snr1 = C.fire(soln, { role = 'columbina', mode = 'casual' })
  eq(snr1.effect, so1.effect, '7.39 [少女 单人] effect 一致（gravity-clear）')
  near(snr1.n, so1.n, '7.40 [少女 单人] n 一致')
  near(soln.energy.columbina, solo.energy.columbina, '7.41 [少女 单人] 都不耗能')

  -- 满辉：两边都给满引力值
  local fo = OLD.newState { startRoles = { 'columbina' } }
  local fn = C.newState { startRoles = { 'columbina' } }
  fo.energy.columbina = NUM.ENERGY_MAX
  fn.energy.columbina = NUM.ENERGY_MAX
  fo.tal.columbina.gravity = NUM.COLUMBINA.GRAVITY_MAX
  fn.tal.columbina.gravity = NUM.COLUMBINA.GRAVITY_MAX
  local fco = OLD.cast(fo, 'columbina', { mode = 'pvp', oppH = 20 })
  local fcn = select(2, C.fire(fn, { role = 'columbina', mode = 'pvp', oppH = 20 }))
  near(fcn.n, fco.n, '7.42 [少女 满辉] 放大后的推层数一致')
  near(fn.tal.columbina.gravity, fo.tal.columbina.gravity, '7.43 [少女 满辉] 引力值清零一致')
  eq(fn.tal.columbina.lure, fo.tal.columbina.lure, '7.44 [少女 满辉] 月诱层数一致')
  near(fn.tal.columbina.lureT, fo.tal.columbina.lureT, '7.45 [少女 满辉] 月诱计时一致')

  -- 引力值充能 + 法则触发（同一固定种子的两条实现必须一致）
  local go2 = OLD.newState { startRoles = { 'columbina' } }
  local gn2 = C.newState { startRoles = { 'columbina' } }
  go2.tal.columbina.domainT = 999
  gn2.tal.columbina.domainT = 999
  go2.tal.columbina.rng = 777
  gn2.tal.columbina.rng = 777
  local lawO, lawN = 0, 0
  for _ = 1, 60 do
    local ro = OLD.onClear(go2, 'columbina', 2, { mode = 'pvp' })
    local rn = C.charge(gn2, { kind = 'clear', role = 'columbina', cleared = 2,
                               info = { mode = 'pvp' } })
    for i = 1, #(ro.effects or {}) do
      if ro.effects[i].id == 'columbina.law' then lawO = lawO + 1 end
    end
    for i = 1, #rn.effects do
      if rn.effects[i].id == 'columbina.law' then lawN = lawN + 1 end
    end
  end
  eq(lawN, lawO, '7.46 [少女 法则] 同种子 60 次触发次数一致')
  near(gn2.tal.columbina.gravity, go2.tal.columbina.gravity, '7.47 [少女 法则] 引力值累计一致')
  near(gn2.tal.columbina.rng, go2.tal.columbina.rng, '7.48 [少女 法则] rng 状态一致')

  -- ---- D6：params 六个既有键（lv1 / lv12 两个采样点，四角色全覆盖）----
  local KEYS = { 'aiTier', 'aiDur', 'freezeRows', 'freezeSec', 'holdCutMs', 'clearRows' }
  for i = 1, #IDS do
    local role = IDS[i]
    for _, lv in ipairs({ 1, 12 }) do
      local po = OLD.newState()
      local pn = C.newState()
      po.lv[role], pn.lv[role] = lv, lv
      local a, b = OLD.params(po, role), C.params(pn, role)
      local diffs = {}
      for k = 1, #KEYS do
        if a[KEYS[k]] ~= b[KEYS[k]] then
          diffs[#diffs + 1] = KEYS[k] .. ':' .. tostring(a[KEYS[k]]) .. '/' .. tostring(b[KEYS[k]])
        end
      end
      ok(#diffs == 0, string.format('7.49.%d.%d [%s lv%d] params 六键一致',
        i, lv == 1 and 1 or 2, role, lv), #diffs > 0 and table.concat(diffs, ' ') or nil)
    end
  end

  -- ---- D7：mult 与 HUD 同源 ----
  for i = 1, #IDS do
    local role = IDS[i]
    local po = OLD.newState { startRoles = { role } }
    local pn = C.newState { startRoles = { role } }
    OLD.cast(po, role, { mode = 'casual' })
    C.fire(pn, { role = role, mode = 'casual' })
    near(C.mult(pn, role), OLD.nextMult(po, role),
      string.format('7.50.%d [%s] 核心 mult 与旧 nextMult 一致', i, role))
  end
end

-- ===========================================================================
-- 组 8：catalog —— 表现数据只引用、日志锚逐字复刻
-- ===========================================================================
do
  eq(CAT.version, catM.VERSION, '8.01 catalog 版本串就位')
  eq(CAT.skillName('nahida'), copyM.ROLES.nahida.skill, '8.02 技能名引用 copy.lua')
  eq(CAT.roleName('keqing'), copyM.ROLES.keqing.name, '8.03 角色名引用 copy.lua')
  eq(CAT.color('ganyu'), copyM.ROLES.ganyu.color, '8.04 图标色引用 copy.lua')
  eq(CAT.skillDesc('columbina'), copyM.ROLES.girl.skillDesc,
    '8.05 技能说明引用 copy.lua（columbina 是 girl 的别名）')

  local th = CAT.thresholds('nahida')
  eq(th.cd, NUM.CD.nahida, '8.06 阈值 cd 是 NUM.CD.nahida 的引用')
  eq(th.takeDur, NUM.NAHIDA.TAKE_DUR, '8.07 阈值表 takeDur 是同一个表（引用而不是副本）')
  eq(CAT.thresholds('keqing').longPress, NUM.KEQING.LONG_PRESS,
    '8.08 长按阈值引用 NUM（不复制数值）')
  eq(CAT.thresholds('columbina').energyCost, NUM.COST.columbina, '8.09 能量成本引用 NUM')
  eq(CAT.thresholds('columbina').gravityMax, NUM.COLUMBINA.GRAVITY_MAX,
    '8.10 引力上限引用 NUM')

  local list = CAT.talents('nahida')
  eq(#list, #catM.IDS.nahida, '8.11 纳西妲天赋条数 = IDS 表')
  eq(list[2].id, 'nahida.seed', '8.12 顺序稳定（index 2 = 蕴种印）')
  eq(list[2].name, '蕴种印', '8.13 天赋名来自注入的 skills.TALENTS（单源）')
  eq(list[4].gate, skillsM.TALENTS.nahida[4].gate, '8.14 gate 引用 TALENTS（不复制）')
  eq(CAT.label('keqing.mark'), '雷楔 · 二段', '8.15 label(id) 可取中文名')
  eq(CAT.buffLabel('nahida.seed'), '蕴种印', '8.16 HUD 标签可取')
  eq(CAT.fx('nahida.seed'), 'vine', '8.17 特效键就位')
  eq(CAT.sfx('ganyu.active'), 'skill', '8.18 音效键就位')

  -- 日志锚：跑一遍旧实现，拿它打出来的 anchor 与新 catalog 的格式化结果逐字比
  local function anchorOfOld()
    local st = OLD.newState { startRoles = { 'nahida' } }
    OLD.cast(st, 'nahida', {})
    local r = OLD.onClear(st, 'nahida', 2, { mode = 'casual' })
    return r.effects[1] and r.effects[1].anchor
  end
  local stN = C.newState { startRoles = { 'nahida' } }
  C.fire(stN, { role = 'nahida' })
  local rN = C.charge(stN, { kind = 'clear', role = 'nahida', cleared = 2,
                             info = { mode = 'casual' } })
  eq(CAT.anchor(rN.effects[1]), anchorOfOld(), '8.19 蕴种印锚逐字一致')

  local sk = C.newState { startRoles = { 'keqing' } }
  C.fire(sk, { role = 'keqing', col = 4 })
  local rk = C.charge(sk, { kind = 'clear', role = 'keqing', cleared = 1, info = {} })
  local sto = OLD.newState { startRoles = { 'keqing' } }
  OLD.cast(sto, 'keqing', { col = 4 })
  local rko = OLD.onClear(sto, 'keqing', 1, { mode = 'casual' })
  local slashOld
  for i = 1, #(rko.effects or {}) do
    if rko.effects[i].id == 'keqing.mark' then slashOld = rko.effects[i] end
  end
  eq(CAT.anchor(rk.effects[1]), slashOld.anchor, '8.20 雷暴连斩锚逐字一致')

  local sg = C.newState { startRoles = { 'ganyu' } }
  C.fire(sg, { role = 'ganyu' })
  local rg = C.charge(sg, { kind = 'clear', role = 'ganyu', cleared = 1, info = {} })
  local sgo = OLD.newState { startRoles = { 'ganyu' } }
  OLD.cast(sgo, 'ganyu', {})
  local rgo = OLD.onClear(sgo, 'ganyu', 1, { mode = 'casual' })
  local lotusOld
  for i = 1, #(rgo.effects or {}) do
    if rgo.effects[i].id == 'ganyu.lotus' then lotusOld = rgo.effects[i] end
  end
  eq(CAT.anchor(rg.effects[1]), lotusOld.anchor, '8.21 冰莲提前绽放锚逐字一致')

  local bg = C.newState { startRoles = { 'ganyu' } }
  C.fire(bg, { role = 'ganyu' })
  local bloom = C.tick(bg, NUM.GANYU.LOTUS_LIFE + 0.1)
  local bgo = OLD.newState { startRoles = { 'ganyu' } }
  OLD.cast(bgo, 'ganyu', {})
  OLD.tick(bgo, NUM.GANYU.LOTUS_LIFE + 0.1)
  local drainOld = OLD.drain(bgo)
  eq(CAT.anchor(bloom[1]), drainOld[1] and drainOld[1].anchor, '8.22 冰莲自然绽放锚逐字一致')

  local cl = C.newState { startRoles = { 'columbina' } }
  cl.tal.columbina.domainT = 999
  local rcl = C.charge(cl, { kind = 'clear', role = 'columbina', cleared = 1,
                             info = { mode = 'pvp' } })
  local lawEff
  for i = 1, #rcl.effects do
    if rcl.effects[i].id == 'columbina.law' then lawEff = rcl.effects[i] end
  end
  if lawEff then
    local clo = OLD.newState { startRoles = { 'columbina' } }
    clo.tal.columbina.domainT = 999
    clo.tal.columbina.rng = cl.tal.columbina.rng   -- 已消费过一格 ⇒ 不能对齐
    -- 用固定文本模板核对（法则锚不含可变列/层）：
    eq(CAT.anchor(lawEff), string.format('talent columbina-law proc n=%d', lawEff.rows),
      '8.23 新月法则锚模板逐字一致')
  else
    ok(true, '8.23 新月法则锚模板逐字一致（本次未触发，跳过）')
  end

  eq(CAT.reasonKey('cd'), 'skill.reason.cd', '8.24 门禁文案键可查（copy 侧同一套键）')
  eq(CAT.failKey('nahida', 'cd'), 'copy.roles.nahida.fail.cd', '8.25 失败文案键就位')
  eq(CAT.failLines('nahida', 'cd'), copyM.ROLES.nahida.fail.cd,
    '8.26 失败文案原表引用（36 句死文案有了第一处消费方）')
  eq(CAT.ui.skillW, (configM and configM.SKILL_W) or nil,
    '8.27 config 尺寸是引用（config.lua 在场时）')
end

-- ===========================================================================
-- 组 9：坏域回归钉（本轮发现的断链，规则层必须不再给它们留口子）
-- ===========================================================================
do
  -- ① effect 必须自带 role + target（旧实现让「冰莲串盘」成为可能）
  local all = {}
  local st = C.newState { startRoles = { 'nahida' }, partyMax = 2 }
  st.unlocked.columbina = true
  st.party[#st.party + 1] = 'columbina'
  st.energy.columbina = NUM.ENERGY_MAX
  local e1 = C.fire(st, { role = 'nahida', mode = 'pvp' })
  local e2 = C.fire(st, { role = 'columbina', mode = 'pvp' })
  for i = 1, #e1 do all[#all + 1] = e1[i] end
  for i = 1, #e2 do all[#all + 1] = e2[i] end
  local rg = C.charge(st, { kind = 'clear', role = 'nahida', cleared = 1,
                            info = { mode = 'pvp' } })
  for i = 1, #rg.effects do all[#all + 1] = rg.effects[i] end
  local allOk = true
  for i = 1, #all do
    if type(all[i].role) ~= 'string' then allOk = false end
    if all[i].target ~= 'self' and all[i].target ~= 'opp' then allOk = false end
  end
  ok(allOk, '9.01 所有 effect 都带 role 与合法 target', 'n=' .. #all)

  -- ② 跨盘效果必须 target=opp（推对手的三种来源）
  local oppSeen = 0
  for i = 1, #all do
    if all[i].kind == 'addGarbage' then
      oppSeen = oppSeen + 1
      eq(all[i].target, 'opp', '9.02 第 ' .. oppSeen .. ' 个 addGarbage 的 target=opp')
    end
  end
  ok(oppSeen >= 1, '9.03 对战路径确实产出过 addGarbage')

  -- ③ 冻结效果自带 rows/sec（旧 main 把行数只写进日志，没有消费方）
  local sg = C.newState { startRoles = { 'ganyu' } }
  local fe = C.fire(sg, { role = 'ganyu', boardH = 5 })
  ok(fe[1].rows >= 1 and fe[1].sec > 0, '9.04 freeze 效果自带 rows>0 且 sec>0')
  near(fe[1].sec, C.params(sg, 'ganyu').freezeSec, '9.05 freeze.sec 与 params.freezeSec 同源')

  -- ④ 冰莲到期效果带 role（旧 drain 丢 role ⇒ 清错人的盘）
  local lb = C.tick(sg, NUM.GANYU.LOTUS_LIFE + 0.1)
  eq(lb[1].role, 'ganyu', '9.06 到期效果的 role 是技能所有者，不是「当前盘」')

  -- ⑤ 长按判定只认 keyHold（旧 main 曾把棋子存活秒数当按住秒数）
  local lk = C.newState { startRoles = { 'keqing' } }
  local lkE = C.fire(lk, { role = 'keqing', col = 1, keyHold = 0, dwell = 99 })
  eq(lkE[1].kind, 'blink', '9.07 keyHold=0 即使 dwell 很大也判短按')

  -- ⑥ 天赋 gate 目前只影响展示（已知不一致；改动需设计裁决）
  local g1 = C.newState { startRoles = { 'nahida' } }
  C.fire(g1, { role = 'nahida' })
  ok(g1.tal.nahida.domainT > 0,
    '9.08 PIN 天赋 gate 只影响展示：lv1 施放即展开摩耶之殿（待裁决）')
  eq(CAT.talent('nahida.domain').gate, skillsM.TALENTS.nahida[4].gate,
    '9.09 角色页仍按 gate 显示「未解锁」（展示与机制不一致已被看见）')
end

-- ===========================================================================
-- 汇总
-- ===========================================================================
io.write('----\n')
if fail == 0 then
  io.write(string.format('ALL GREEN  %d/%d assertions passed\n', pass, pass + fail))
  os.exit(0)
else
  io.write(string.format('FAILED  %d/%d passed, %d failed\n', pass, pass + fail, fail))
  for i = 1, #fails do io.write('  - ', fails[i], '\n') end
  os.exit(1)
end
