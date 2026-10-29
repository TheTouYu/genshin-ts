-- 由 qxqy/build.mjs 从 lua/src/*.lua 生成，请勿手改本文件

-- ===== 00_config.lua =====
-- ============================================================================
-- 《霜华纪》 · 配置 / 色板 / 双主题令牌 / 数据与文案
-- 纯图元 2D UI：rect / circle / triangle / fourstar / fivestar / ring
-- 设计坐标 1280x720（中心原点，+y 向上）
-- ============================================================================
T = T or {}

T.VERSION = '1.0.0'
T.BUILD_ID = '1793250631252'
T.DESIGN_W, T.DESIGN_H = 1280, 720
T.DEBUG = false

-- ---------- 颜色工具（ARGB 整数） ----------
T.C = function(a, r, g, b)
  return a * 16777216 + r * 65536 + g * 256 + b
end
T.withA = function(c, a) return a * 16777216 + (c % 16777216) end
T.alphaOf = function(c) return math.floor(c / 16777216) % 256 end
T.mix = function(c1, c2, t)
  local a1, r1, g1, b1 = math.floor(c1 / 16777216) % 256, math.floor(c1 / 65536) % 256,
    math.floor(c1 / 256) % 256, c1 % 256
  local a2, r2, g2, b2 = math.floor(c2 / 16777216) % 256, math.floor(c2 / 65536) % 256,
    math.floor(c2 / 256) % 256, c2 % 256
  local function m(x, y) return math.floor(x + (y - x) * t + 0.5) end
  return T.C(m(a1, a2), m(r1, r2), m(g1, g2), m(b1, b2))
end

-- ---------- 基础色板 ----------
T.P = {
  ink      = T.C(255, 16, 43, 58),
  ink2     = T.C(255, 62, 100, 120),
  ink3     = T.C(255, 124, 154, 168),
  ink4     = T.C(255, 175, 197, 206),
  white    = T.C(255, 255, 255, 255),
  snow     = T.C(255, 247, 252, 255),
  moon     = T.C(255, 244, 252, 255),
  panel    = T.C(255, 250, 254, 255),
  ice0     = T.C(255, 232, 247, 254),
  ice1     = T.C(255, 211, 239, 251),
  ice2     = T.C(255, 179, 226, 244),
  ice3     = T.C(255, 127, 205, 232),
  ice4     = T.C(255, 74, 170, 205),
  ice5     = T.C(255, 42, 124, 158),
  deep     = T.C(255, 23, 81, 107),
  night0   = T.C(255, 8, 23, 38),
  night1   = T.C(255, 14, 39, 64),
  night2   = T.C(255, 23, 65, 95),
  night3   = T.C(255, 42, 106, 138),
  gold     = T.C(255, 232, 192, 126),
  gold2    = T.C(255, 201, 154, 85),
  goldPale = T.C(255, 248, 230, 192),
  violet   = T.C(255, 185, 170, 216),
  violet2  = T.C(255, 142, 125, 184),
  mint     = T.C(255, 159, 227, 204),
  rose     = T.C(255, 242, 196, 206),
  roseDeep = T.C(255, 214, 132, 154),
  skin     = T.C(255, 255, 232, 219),
  skin2    = T.C(255, 242, 205, 188),
  blush    = T.C(255, 247, 168, 184),
  danger   = T.C(255, 224, 112, 126),
  ok       = T.C(255, 127, 214, 168),
}

-- ---------- 双主题令牌 ----------
T.theme = 'day'
T.th = {}
T.setTheme = function(name)
  T.theme = name
  if name == 'night' then
    T.th = {
      key = 'night',
      text = T.C(255, 238, 250, 255), text2 = T.C(255, 178, 214, 232), text3 = T.C(255, 124, 168, 190),
      panel = T.C(255, 13, 40, 62), panel2 = T.C(255, 20, 56, 82), panelHi = T.C(255, 31, 78, 110),
      border = T.C(255, 56, 120, 150), borderSoft = T.C(255, 34, 84, 110),
      line = T.C(255, 40, 96, 124), accent = T.P.ice3, accent2 = T.P.gold,
      accentSoft = T.C(255, 18, 56, 80), onAccent = T.C(255, 8, 26, 40),
      bgTop = T.C(255, 6, 18, 32), bgMid = T.C(255, 12, 36, 60), bgBot = T.C(255, 26, 72, 102),
      scrim = T.C(212, 3, 13, 24), glow = T.C(90, 170, 232, 255),
      card = T.C(255, 15, 44, 68), cardBorder = T.C(255, 46, 104, 134),
      slotBg = T.C(255, 10, 32, 52), slotBorder = T.C(255, 38, 90, 118),
      gold = T.P.gold, ice = T.P.ice3,
    }
  else
    T.th = {
      key = 'day',
      text = T.P.ink, text2 = T.P.ink2, text3 = T.P.ink3,
      panel = T.C(255, 251, 254, 255), panel2 = T.C(255, 236, 248, 254), panelHi = T.P.white,
      border = T.C(255, 186, 223, 239), borderSoft = T.C(255, 212, 237, 246),
      line = T.C(255, 205, 231, 242), accent = T.P.ice4, accent2 = T.P.gold2,
      accentSoft = T.P.ice1, onAccent = T.P.white,
      bgTop = T.C(255, 244, 252, 255), bgMid = T.C(255, 226, 244, 252), bgBot = T.C(255, 201, 231, 246),
      scrim = T.C(150, 12, 34, 48), glow = T.C(120, 255, 255, 255),
      card = T.C(255, 252, 255, 255), cardBorder = T.C(255, 196, 228, 242),
      slotBg = T.C(255, 240, 250, 255), slotBorder = T.C(255, 201, 231, 243),
      gold = T.P.gold2, ice = T.P.ice4,
    }
  end
  return T.th
end
T.setTheme('day')

-- ---------- 字体级距 / 间距 ----------
T.FS = { hero = 96, h1 = 46, h2 = 32, h3 = 24, body = 19, small = 15, tiny = 12 }
T.M = 64          -- 页边距
T.HEAD_Y = 296    -- 页头基线

-- ---------- 音效（官方 id，见 game-sfx-kit 选型表） ----------
T.SFX = {
  hover   = 50908,  -- 按钮点击_中_通用_06  47ms
  click   = 50884,  -- 按钮点击_轻_卡通_03 151ms
  confirm = 50917,  -- 确认按钮_中        785ms
  back    = 50863,  -- 取消按钮_中        504ms
  tab     = 50942,  -- 切换_轻_选择_01    404ms
  error   = 50937,  -- 提示性UI_中_锁定   521ms
  reward  = 50928,  -- 提示性UI_重_提示_03 781ms
  victory = 50926,  -- 提示性UI_重_提示_01 1976ms
  fail    = 50931,  -- 提示性UI_轻_失败   285ms
  shoot   = 40028,  -- 战斗_远程攻击_弓箭_03  400ms
  impact  = 40210,  -- 战斗_受击_命中_弓箭受击_08 406ms
  ice     = 40264,  -- 战斗_受击_命中_爆炸_冰_06 1000ms
  ambient = 10002,  -- 环境_风声_温和   69.7s
}

-- ---------- 角色 ----------
T.chars = {
  {
    id = 1, name = '甘雨', en = 'GANYU', title = '循循守月', element = '冰', weapon = '弓',
    star = 5, hair = T.C(255, 62, 92, 132), hair2 = T.C(255, 34, 58, 92), hair3 = T.C(255, 128, 168, 204),
    eye = T.C(255, 168, 96, 138), cloth = T.C(255, 236, 246, 252), cloth2 = T.C(255, 122, 170, 196),
    accent = T.C(255, 185, 170, 216), motif = 'qilin',
    quote = '月海亭的文书还没批完……不过，陪你一会儿也好。',
    desc = '半仙之兽麒麟的后裔，璃月七星的秘书。她把人间的契约写得工工整整，也把千年的孤独藏进了雪里。',
  },
  {
    id = 2, name = '申鹤', en = 'SHENHE', title = '孤辰茕怀', element = '冰', weapon = '长柄武器',
    star = 5, hair = T.C(255, 226, 240, 246), hair2 = T.C(255, 168, 196, 208), hair3 = T.C(255, 255, 255, 255),
    eye = T.C(255, 214, 154, 168), cloth = T.C(255, 44, 66, 92), cloth2 = T.C(255, 28, 44, 66),
    accent = T.C(255, 214, 92, 96), motif = 'crane',
    quote = '山里的雪比人间的安静。你若怕冷，就靠过来一点。',
    desc = '被仙人收养的孤女，以红绳缚住杀性。她的冰，比雪更冷，也比雪更干净。',
  },
  {
    id = 3, name = '云堇', en = 'YUN JIN', title = '红毹婵婉', element = '岩', weapon = '长柄武器',
    star = 4, hair = T.C(255, 74, 56, 92), hair2 = T.C(255, 46, 34, 62), hair3 = T.C(255, 238, 140, 160),
    eye = T.C(255, 208, 120, 138), cloth = T.C(255, 244, 236, 240), cloth2 = T.C(255, 190, 74, 92),
    accent = T.C(255, 232, 192, 126), motif = 'opera',
    quote = '今日这出戏，唱的是雪落璃月、故人归来。',
    desc = '璃月戏班的云老板，一开腔便是满堂春。她说，戏文里的英雄也要有人递一盏热茶。',
  },
}
T.charById = {}
for _, c in ipairs(T.chars) do T.charById[c.id] = c end

-- 甘雨养成数值（模板展示用，非战斗平衡）
T.hero = {
  level = 60, maxLevel = 70, ascension = 4, exp = 2680, expMax = 4600,
  hp = 10875, atk = 326, def = 630, em = 92,
  critRate = 24.2, critDmg = 88.4, iceBonus = 61.6, energyRecharge = 118.0,
  stats = {
    { name = '生命值', value = '10,875', pct = 0.62 },
    { name = '攻击力', value = '326', pct = 0.46 },
    { name = '防御力', value = '630', pct = 0.38 },
    { name = '暴击率', value = '24.2%', pct = 0.48 },
    { name = '暴击伤害', value = '88.4%', pct = 0.74 },
    { name = '冰元素伤害', value = '61.6%', pct = 0.62 },
  },
}

T.talents = {
  { id = 1, name = '流天射术', kind = '普通攻击', level = 6, max = 10, icon = 'bow',
    desc = '蓄力瞄准，霜华凝于箭尖。二段蓄力命中后，霜华矢绽开如花。' },
  { id = 2, name = '山泽麟迹', kind = '元素战技', level = 8, max = 12, icon = 'flower',
    desc = '留下冰莲吸引敌人，退步抽身。莲华散开时，为甘雨恢复元素能量。' },
  { id = 3, name = '降众天华', kind = '元素爆发', level = 8, max = 12, icon = 'snow',
    desc = '召来霜寒领域，冰棱如雨。领域中的敌人受到的冰元素伤害提升。' },
}

T.consts = {
  { id = 1, name = '饮露', on = true, desc = '霜华矢命中时，降低敌人的冰元素抗性。' },
  { id = 2, name = '瞿染', on = true, desc = '山泽麟迹可额外使用一次。' },
  { id = 3, name = '云行', on = true, desc = '降众天华等级提升 3 级。' },
  { id = 4, name = '西狩', on = false, desc = '霜寒领域内的敌人受到伤害提升。' },
  { id = 5, name = '折草', on = false, desc = '元素爆发等级提升 3 级。' },
  { id = 6, name = '履冰', on = false, desc = '霜华矢蓄力时间缩短，暴击率提升。' },
}

T.mats = {
  { id = 'crystal', name = '冰晶核', count = 18, icon = 'crystal', color = T.P.ice3, desc = '冰史莱姆凝结的核心，握在手里凉丝丝的。' },
  { id = 'qingxin', name = '清心', count = 42, icon = 'flower', color = T.P.violet, desc = '生于绝壁的花，只饮晨露，不染尘埃。' },
  { id = 'snow', name = '霜华之蕊', count = 6, icon = 'snow', color = T.P.ice2, desc = '麒麟之血凝成的花蕊，是突破的凭证。' },
  { id = 'mora', name = '摩拉', count = 128400, icon = 'coin', color = T.P.gold, desc = '璃月通用的货币，闪着温润的金光。' },
  { id = 'page', name = '「诗文」的教导', count = 9, icon = 'book', color = T.P.mint, desc = '天赋书页上写着关于霜与月的句子。' },
}

-- ---------- 关卡 ----------
T.chapters = {
  { id = 1, name = '霜华初临', sub = '第一章 · 雪落璃月', desc = '雪线越过山脊，月海亭的灯还亮着。', color = T.P.ice3 },
  { id = 2, name = '麒麟旧誓', sub = '第二章 · 千年之约', desc = '麒麟的誓言刻在冰层之下，等一个人来读。', color = T.P.violet },
}

T.stages = {
  { id = 1, chapter = 1, code = '1-1', name = '雪原哨戒', sub = '霜风掠过山脊', rec = 40, locked = false,
    objective = '在 90 秒内清空 3 波来敌', reward = { '摩拉 ×1200', '冒险阅历 ×150', '冰晶核 ×2' },
    enemies = { 'slime', 'slime', 'fly' }, time = 90, waves = 3 },
  { id = 2, chapter = 1, code = '1-2', name = '冰湖回响', sub = '湖面下有什么在呼吸', rec = 45, locked = false,
    objective = '保护冰莲，撑过 3 波攻势', reward = { '摩拉 ×1600', '冒险阅历 ×200', '清心 ×3' },
    enemies = { 'slime', 'fly', 'guard' }, time = 90, waves = 3 },
  { id = 3, chapter = 1, code = '1-3', name = '月海亭的委托', sub = '一份没有署名的契书', rec = 50, locked = true,
    objective = '击败霜甲守卫，取回契书', reward = { '摩拉 ×2400', '冒险阅历 ×300', '霜华之蕊 ×1' },
    enemies = { 'guard', 'fly', 'guard' }, time = 100, waves = 3 },
  { id = 4, chapter = 2, code = '2-1', name = '麒麟旧誓', sub = '冰层之下的名字', rec = 55, locked = true,
    objective = '在 90 秒内找到麒麟的印记', reward = { '摩拉 ×2800', '冒险阅历 ×350', '冰晶核 ×4' },
    enemies = { 'fly', 'guard', 'slime' }, time = 90, waves = 3 },
  { id = 5, chapter = 2, code = '2-2', name = '霜风之眼', sub = '风眼中央出奇地安静', rec = 60, locked = true,
    objective = '顶住霜风，击破眼核', reward = { '摩拉 ×3200', '冒险阅历 ×400', '清心 ×5' },
    enemies = { 'guard', 'guard', 'fly' }, time = 100, waves = 3 },
  { id = 6, chapter = 2, code = '2-3', name = '月下长歌', sub = '唱给千年前的自己', rec = 65, locked = true,
    objective = '击败霜华兽王，完成旧誓', reward = { '摩拉 ×4800', '冒险阅历 ×600', '霜华之蕊 ×2' },
    enemies = { 'guard', 'fly', 'boss' }, time = 110, waves = 3 },
}
T.stageById = {}
for _, s in ipairs(T.stages) do T.stageById[s.id] = s end

-- ---------- 敌人 ----------
T.enemies = {
  slime = { id = 'slime', name = '冰史莱姆', sub = '受寒潮滋养的史莱姆', hp = 3, color = T.P.ice2,
    desc = '它在雪里滚了一圈就变成了这样，撞人的时候还是有点疼的。', tag = '普通' },
  fly = { id = 'fly', name = '霜翼虫', sub = '翅膀上结着霜的飞虫', hp = 2, color = T.P.ice3,
    desc = '振翅时洒下细小的冰屑，落在皮肤上像针尖。', tag = '普通' },
  guard = { id = 'guard', name = '霜甲守卫', sub = '不知为谁守夜的铠甲', hp = 5, color = T.P.ice4,
    desc = '甲胄里没有身体，只有一整块化不开的冰。', tag = '精英' },
  boss = { id = 'boss', name = '霜华兽王', sub = '旧誓的看守者', hp = 9, color = T.P.violet2,
    desc = '麒麟旧誓的看守者，它的咆哮能让整座山谷结冰。', tag = '首领' },
}

-- ---------- 图鉴额外条目（装备 / 材料 / 世界） ----------
T.codex = {
  { group = 'enemy', id = 'slime', name = '冰史莱姆', tag = '普通', icon = 'slime', color = T.P.ice2,
    desc = '受寒潮滋养的史莱姆。被击破时会溅出一小片雪花。' },
  { group = 'enemy', id = 'fly', name = '霜翼虫', tag = '普通', icon = 'fly', color = T.P.ice3,
    desc = '翅膀上结着霜的飞虫，喜欢绕着冰莲打转。' },
  { group = 'enemy', id = 'guard', name = '霜甲守卫', tag = '精英', icon = 'guard', color = T.P.ice4,
    desc = '不知为谁守夜的铠甲，胸口嵌着一枚不会融化的冰晶。' },
  { group = 'enemy', id = 'boss', name = '霜华兽王', tag = '首领', icon = 'boss', color = T.P.violet2,
    desc = '麒麟旧誓的看守者，只在月圆之夜现身。' },
  { group = 'gear', id = 'bow', name = '阿莫斯之弓', tag = '五星 · 弓', icon = 'bow', color = T.P.gold,
    desc = '传说中的猎弓，弓弦震动时，风会为它让路。' },
  { group = 'gear', id = 'flower', name = '冰风迷途的勇士', tag = '圣遗物 · 生之花', icon = 'bloom', color = T.P.ice3,
    desc = '在风雪中跋涉的人，最终把脚印留在了冰层里。' },
  { group = 'gear', id = 'plume', name = '勇士的羽饰', tag = '圣遗物 · 死之羽', icon = 'plume', color = T.P.ice2,
    desc = '一根不会融化的羽毛，替主人记着风的方向。' },
  { group = 'gear', id = 'hourglass', name = '勇士的时计', tag = '圣遗物 · 时之沙', icon = 'hourglass', color = T.P.goldPale,
    desc = '沙漏里的不是沙，而是极细的冰晶。' },
  { group = 'mat', id = 'crystal', name = '冰晶核', tag = '突破材料', icon = 'crystal', color = T.P.ice3,
    desc = '冰史莱姆的核心，晶莹剔透，握久了指尖会发麻。' },
  { group = 'mat', id = 'qingxin', name = '清心', tag = '璃月特产', icon = 'flower', color = T.P.violet,
    desc = '生于绝壁的花，只饮晨露。甘雨说，它尝起来有点苦。' },
  { group = 'mat', id = 'snow', name = '霜华之蕊', tag = '稀有材料', icon = 'snow', color = T.P.ice2,
    desc = '麒麟之血凝成的花蕊，只在霜降之夜开放。' },
  { group = 'world', id = 'moon', name = '月海', tag = '世界', icon = 'moon', color = T.P.goldPale,
    desc = '璃月的海，映着月亮，也映着千年前的那场雪。' },
  { group = 'world', id = 'bowl', name = '月海亭', tag = '世界', icon = 'tower', color = T.P.ice4,
    desc = '七星议事的地方，甘雨的案头永远堆着一摞公文。' },
  { group = 'world', id = 'bowl2', name = '清心坡', tag = '世界', icon = 'mountain', color = T.P.ice5,
    desc = '山脊上开满清心的斜坡，风大，云低。' },
}

-- ---------- 成就 ----------
T.achv = {
  { id = 'first_shot', name = '初雪', desc = '射出第一支霜华矢。', icon = 'bow' },
  { id = 'combo3', name = '三连霜华', desc = '一次挑战中达成 3 连击。', icon = 'snow' },
  { id = 'clear1', name = '雪原踏步', desc = '完成任意关卡。', icon = 'mountain' },
  { id = 'stars12', name = '满庭霜色', desc = '累计获得 12 颗星。', icon = 'star' },
  { id = 'const4', name = '命之座·四', desc = '点亮第四层命之座。', icon = 'const' },
  { id = 'codex10', name = '雪中记事', desc = '图鉴收录 10 条。', icon = 'book' },
}
T.achvById = {}
for _, a in ipairs(T.achv) do T.achvById[a.id] = a end

-- ---------- 设置项 ----------
T.opt = {
  sfx = true,
  ambient = false,
  motion = 2,      -- 1 柔和 / 2 标准 / 3 丰富
  outline = false,
  quality = 2,     -- 1 省电 / 2 均衡 / 3 极致
}

-- ---------- 进度存档（内存态） ----------
T.records = {
  stars = { 0, 0, 0, 0, 0, 0 },
  best = { 0, 0, 0, 0, 0, 0 },
  unlocked = { true, true, false, false, false, false },
  visited = { false, false, false, false, false, false },
  clears = 0,
  maxCombo = 0,
  totalShots = 0,
  achv = {},
  consts = { true, true, true, false, false, false },
  level = 60,
  exp = 2680,
  mats = { crystal = 18, qingxin = 42, snow = 6, mora = 128400, page = 9 },
}

T.TIPS = {
  '霜华矢蓄力越久，绽开的冰花越大。',
  '冰莲会吸引敌人的注意——也可以用来争取时间。',
  '被冻结的敌人，受击时会发出清脆的声响。',
  '命之座点亮到第四层，霜寒领域会变得更深。',
  '清心只生长在绝壁，采的时候要小心脚下。',
}

-- ---------- 图形 id ----------
T.SHAPE_ID = {
  rect = 100001, circle = 100002, triangle = 100003,
  fourstar = 100004, fivestar = 100005, ring = 100006,
}


-- ===== 10_core.lua =====
-- ============================================================================
-- 核心：画布 / 控件工厂 / 焦点 / 补间 / 弹层 / 转场 / 音效 / 震屏
-- 层序铁律：同一层里「后建的在上」；服务端 textbox 永远在运行时实例之下。
-- 每屏固定顺序：背景图 → 内容图 → 全部文字 → hits → 焦点框（finishScreen）。
-- ============================================================================
T = T or {}
T.tpl = { prim = 1073742105, label = 1073742106, hit = 1073742107 }
T.ev = {}
T.controls, T.texts, T.items, T.hits = {}, {}, {}, {}
T.tweens, T.anims, T.pos = {}, {}, {}
T.overlays = {}
T.overlay = nil
T.focus = 0
T.mode = 'boot'
T.time = 0
T.frame = 0
T.transition = nil
T.toastSet = nil
T.ambient = { handle = nil, timer = 0 }
T.lastAction, T.lastActionFrame = '', -1
T.seed = 20261028
T.shakeT, T.shakeAmp = 0, 0
T.shakeFrom = nil
T.prefix = '[frost]'

T.log = function(...)
  local t = {}
  for i = 1, select('#', ...) do t[#t + 1] = tostring(select(i, ...)) end
  print(T.prefix .. ' ' .. table.concat(t, ' '))
end
T.warn = function(...)
  local t = {}
  for i = 1, select('#', ...) do t[#t + 1] = tostring(select(i, ...)) end
  print(T.prefix .. '[warn] ' .. table.concat(t, ' '))
end

-- ---------- 数学 ----------
T.clamp = function(v, lo, hi)
  if v < lo then return lo end
  if v > hi then return hi end
  return v
end
T.lerp = function(a, b, t) return a + (b - a) * t end
T.pulse = function(speed, lo, hi)
  lo, hi = lo or 0, hi or 1
  return lo + (hi - lo) * (0.5 + 0.5 * math.sin(T.time * (speed or 1)))
end

-- ---------- 随机数（确定性，用例可复现） ----------
T.setSeed = function(n) T.seed = n % 2147483648 end
T.rand = function(n)
  T.seed = (T.seed * 1103515245 + 12345) % 2147483648
  return math.floor(T.seed / 65536) % n + 1
end
T.randf = function() return T.rand(100000) / 100000 end

-- ---------- 画布 ----------
T.layout = function()
  local ok, w, h = pcall(function() return game.GetUICanvasSize() end)
  if ok and tonumber(w) and tonumber(h) and w > 0 and h > 0 then
    T.W, T.H = w, h
  else
    T.W, T.H = T.DESIGN_W, T.DESIGN_H
  end
  T.S = math.min(T.W / T.DESIGN_W, T.H / T.DESIGN_H)
  T.CX, T.CY = T.W / 2, T.H / 2
  T.log('canvas', T.W .. 'x' .. T.H, 'scale=' .. string.format('%.3f', T.S))
end
T.sx = function(x) return x * T.S end
T.sy = function(y) return y * T.S end

-- ---------- 安全写控件 ----------
T.trySet = function(ctl, key, value)
  if not ctl then return false end
  if (key == 'horizontalAlignment' or key == 'verticalAlignment') and type(value) == 'string' then
    local enums = (type(Enum) == 'table')
      and ((key == 'horizontalAlignment' and Enum.TextHorizontalAlignment) or Enum.TextVerticalAlignment) or nil
    if enums and enums[value] ~= nil then value = enums[value] end
  end
  local ok, err = pcall(function() ctl[key] = value end)
  if not ok then T.warn('pcall fail set ' .. tostring(key) .. ' :: ' .. tostring(err)) end
  return ok
end
T.tryCall = function(ctl, method, a, b, c)
  if not ctl then return false end
  local ok, err
  if c ~= nil then ok, err = pcall(function() ctl[method](ctl, a, b, c) end)
  elseif b ~= nil then ok, err = pcall(function() ctl[method](ctl, a, b) end)
  elseif a ~= nil then ok, err = pcall(function() ctl[method](ctl, a) end)
  else ok, err = pcall(function() ctl[method](ctl) end) end
  if not ok then T.warn('pcall fail call ' .. tostring(method) .. ' :: ' .. tostring(err)) end
  return ok
end
T.destroy = function(ctl)
  if not ctl then return false end
  local ok, err = pcall(function() game.DestroyClientUIControl(ctl) end)
  if not ok then T.warn('pcall fail destroy :: ' .. tostring(err)) end
  return ok
end
-- 销毁并从台账里摘除（战斗粒子必须走这条，否则 T.controls 无限增长）
T.destroyCtl = function(ctl)
  if not ctl then return end
  for i = #T.controls, 1, -1 do
    if T.controls[i] == ctl then table.remove(T.controls, i) break end
  end
  T.pos[ctl] = nil
  T.destroy(ctl)
end
T.inst = function(guid, parent)
  local ok, ctl = pcall(function() return game.InstantiateClientUIControl(guid, parent or T.root) end)
  if not ok or not ctl then
    T.warn('pcall fail instantiate guid=' .. tostring(guid) .. ' :: ' .. tostring(ctl))
    return nil
  end
  return ctl
end
T.setPos = function(ctl, x, y)
  if not ctl then return end
  T.tryCall(ctl, 'SetAnchoredPosition', x * T.S, y * T.S)
  T.pos[ctl] = { x = x, y = y }
end
T.setSize = function(ctl, w, h)
  if ctl then T.tryCall(ctl, 'SetSizeDelta', math.max(1, w * T.S), math.max(1, h * T.S)) end
end
T.setColor = function(ctl, c) if ctl then T.trySet(ctl, 'imageColor', c) end end
T.setAlpha = function(ctl, c, a) if ctl then T.trySet(ctl, 'imageColor', T.withA(c % 16777216, a)) end end
T.setScale = function(ctl, s)
  if ctl then T.tryCall(ctl, 'SetLocalScale', s, s) end
end

-- ---------- 图片工厂 ----------
T.img = function(x, y, w, h, shape, color, rot)
  local ctl = T.inst(T.tpl.prim)
  if not ctl then return nil end
  local id = T.SHAPE_ID[shape or 'rect'] or 100001
  if not pcall(function() ctl:SetImage(Enum.ImageSource.StaticReference, id) end) then
    T.warn('SetImage ' .. tostring(id))
  end
  T.setSize(ctl, w, h)
  T.setPos(ctl, x, y)
  if rot and rot ~= 0 then T.trySet(ctl, 'localRotationZ', rot) end
  T.setColor(ctl, color or T.P.white)
  T.controls[#T.controls + 1] = ctl
  return ctl
end
T.imgRaw = function(x, y, w, h, shape, color, rot)
  local ctl = T.inst(T.tpl.prim)
  if not ctl then return nil end
  local id = T.SHAPE_ID[shape or 'rect'] or 100001
  pcall(function() ctl:SetImage(Enum.ImageSource.StaticReference, id) end)
  T.tryCall(ctl, 'SetSizeDelta', w, h)
  T.tryCall(ctl, 'SetAnchoredPosition', x, y)
  if rot and rot ~= 0 then T.trySet(ctl, 'localRotationZ', rot) end
  T.setColor(ctl, color or T.P.white)
  T.controls[#T.controls + 1] = ctl
  return ctl
end

-- ---------- 文字工厂 ----------
-- 高度按 1.45×fontSize 留足，避免「整行不画 / 裁半字」（04-text 铁律）
T.textH = function(size, lines)
  lines = lines or 1
  return lines * size * 1.28 + size * 0.55 + 12
end
T.txt = function(x, y, w, h, size, text, color, align, valign, opts)
  opts = opts or {}
  local ctl = T.inst(T.tpl.label)
  if not ctl then return nil end
  local fs = math.max(8, math.floor(size * T.S + 0.5))
  local cw = math.max(16, math.floor(w * T.S + 0.5))
  -- 铁律：框高不足会让整行不画（textLayout.visibleLineCount=0）。
  -- 统一按行数抬到 requiredHeight = lines*1.2*fs + blockInset(10) 之上。
  local lines = 1
  for _ in string.gmatch(text or '', '\n') do lines = lines + 1 end
  local need = math.ceil(lines * fs * 1.2 + fs * 0.5 + 10)
  local ch = math.max(fs + 8, need, math.floor(h * T.S + 0.5))
  local px = x
  if align == 'Left' then px = x + w / 2
  elseif align == 'Right' then px = x - w / 2 end
  T.tryCall(ctl, 'SetSizeDelta', cw, ch)
  T.tryCall(ctl, 'SetAnchoredPosition', px * T.S, y * T.S)
  T.trySet(ctl, 'fontSize', fs)
  T.trySet(ctl, 'fontColor', color or T.th.text)
  T.trySet(ctl, 'text', text or '')
  T.trySet(ctl, 'enableOutline', opts.outline or T.opt.outline or false)
  T.trySet(ctl, 'outlineColor', opts.outlineColor or T.C(150, 255, 255, 255))
  if opts.bg then T.trySet(ctl, 'bgColor', opts.bg) end
  T.trySet(ctl, 'horizontalAlignment', align or 'Middle')
  T.trySet(ctl, 'verticalAlignment', valign or 'Middle')
  T.controls[#T.controls + 1] = ctl
  T.texts[#T.texts + 1] = ctl
  T.pos[ctl] = { x = px, y = y }
  return ctl
end
T.txtAuto = function(x, y, w, size, text, color, align, opts)
  local lines = 1
  for _ in string.gmatch(text or '', '\n') do lines = lines + 1 end
  return T.txt(x, y, w, T.textH(size, lines) + 2, size, text, color, align, 'Middle', opts)
end
T.setTxt = function(ctl, text) if ctl then T.trySet(ctl, 'text', text) end end
T.setTxtColor = function(ctl, color) if ctl then T.trySet(ctl, 'fontColor', color) end end

-- 逐字标题（可做字距、逐字入场；中文标题的唯一优雅做法）
T.logo = function(cx, cy, chars, size, gap, color, opts)
  opts = opts or {}
  local n = #chars
  local list = {}
  for i = 1, n do
    local x = cx + (i - (n + 1) / 2) * gap
    local c = T.txt(x, cy, gap * 0.98, T.textH(size), size, chars[i], color or T.th.text, 'Middle', 'Middle',
      { outline = opts.outline, outlineColor = opts.outlineColor })
    list[#list + 1] = c
    if opts.shadow then
      T.trySet(c, 'enableOutline', true)
      T.trySet(c, 'outlineColor', opts.shadowColor or T.C(90, 255, 255, 255))
    end
  end
  if opts.decor then
    T.img(cx - (n * gap) / 2 - gap * 0.45, cy, 3, size * 0.66, 'rect', opts.decor)
    T.img(cx + (n * gap) / 2 + gap * 0.45, cy, 3, size * 0.66, 'rect', opts.decor)
  end
  return list
end

-- ---------- 补间 ----------
T.easeOut = function(t) return 1 - (1 - t) ^ 3 end
T.easeIn = function(t) return t * t * t end
T.easeInOut = function(t) return t < 0.5 and 4 * t * t * t or 1 - (-2 * t + 2) ^ 3 / 2 end
T.easeOutQuint = function(t) return 1 - (1 - t) ^ 5 end
T.easeBack = function(t)
  local c1, c3 = 1.70158, 2.70158
  return 1 + c3 * (t - 1) ^ 3 + c1 * (t - 1) ^ 2
end
T.easeOutBack = function(t)
  local c1, c3 = 1.70158, 2.70158
  return 1 + c3 * (t - 1) ^ 3 + c1 * (t - 1) ^ 2
end

-- tween(dur, fn(eased, raw), done, ease, ui)  ui=true 表示弹层内动画（暂停时不冻结）
T.tween = function(dur, fn, done, ease, ui)
  local tw = { t = 0, dur = math.max(0.001, dur), fn = fn, done = done, ease = ease or T.easeOut, ui = ui }
  T.tweens[#T.tweens + 1] = tw
  return tw
end
T.after = function(dur, fn, ui)
  return T.tween(dur, function() end, fn, nil, ui)
end
T.anim = function(fn) T.anims[#T.anims + 1] = fn end
T.clearAnims = function() T.anims = {} end

-- 入场：从偏移位置滑入（图形与文字都走 setPos，保留原始基准）
T.slideIn = function(list, dx, dy, dur, delay, ease)
  for i = 1, #list do
    local ctl = list[i]
    local p = ctl and T.pos[ctl]
    if p then
      T.setPos(ctl, p.x + dx, p.y + dy)
      local bx, by = p.x, p.y
      T.after(delay or 0, function()
        T.tween(dur or 0.3, function(k)
          if ctl then T.tryCall(ctl, 'SetAnchoredPosition', (bx + dx * (1 - k)) * T.S, (by + dy * (1 - k)) * T.S) end
        end, nil, ease or T.easeOut)
      end, true)
    end
  end
end

-- ---------- 逐帧更新 ----------
T.tick = function(dt)
  T.time = T.time + dt
  T.frame = T.frame + 1
  local paused = T.overlay and T.overlay.pausesGame
  local list = T.tweens
  for i = #list, 1, -1 do
    local tw = list[i]
    if tw and not (paused and not tw.ui) then
      tw.t = tw.t + dt
      local k = math.min(1, tw.t / tw.dur)
      local keep = tw.fn(tw.ease(k), k)
      if k >= 1 or keep == false then
        -- 必须用 table.remove（数组保持紧凑）：留 nil 洞会让 #list 变小，
        -- 之后 append 的新 tween 可能落在 #list 之外，永远不会被遍历到。
        table.remove(list, i)
        if tw.done then tw.done() end
      end
    end
  end
  local alist = T.anims
  for i = #alist, 1, -1 do
    local fn = alist[i]
    if fn then
      local ok, keep = pcall(fn, dt, T.time)
      if not ok then
        T.warn('anim error :: ' .. tostring(keep))
        table.remove(alist, i)
      elseif keep == false then
        table.remove(alist, i)
      end
    end
  end
  T.updateShake(dt)
  T.updateTransition(dt)
  T.updateAmbient(dt)
  if T.screen and T.screen.update and not (T.overlay and T.overlay.pausesGame) then
    local ok, err = pcall(T.screen.update, dt)
    if not ok then T.warn('screen update :: ' .. tostring(err)) end
  end
end

-- ---------- 震屏（只移动本屏从 shakeFrom 起的控件，0.2s 内衰减） ----------
T.shake = function(amp, dur)
  T.shakeAmp = amp or 6
  T.shakeT = dur or 0.22
  T.shakeBase = T.shakeAmp
  if not T.shakeFrom then T.shakeFrom = 1 end
end
T.updateShake = function(dt)
  if T.shakeT <= 0 then return end
  T.shakeT = T.shakeT - dt
  local k = math.max(0, T.shakeT / 0.22)
  local amp = (T.shakeBase or 6) * k
  local ox = math.sin(T.time * 61) * amp
  local oy = math.cos(T.time * 47) * amp * 0.7
  local from = T.shakeFrom or 1
  for i = from, #T.controls do
    local ctl = T.controls[i]
    local p = ctl and T.pos[ctl]
    if p then
      T.tryCall(ctl, 'SetAnchoredPosition', (p.x + ox) * T.S, (p.y + oy) * T.S)
    end
  end
  if T.shakeT <= 0 then T.shakeFrom = nil end
end
T.markShake = function() T.shakeFrom = #T.controls + 1 end

-- ---------- 音效 ----------
T.sfxFrame = -1
T.sfx = function(id, force)
  if not id or not T.opt.sfx then return false end
  if not force and T.sfxFrame == T.frame then return false end
  T.sfxFrame = T.frame
  local ok, err = pcall(function() game.PlayAudio2D(id) end)
  if not ok then T.warn('PlayAudio2D ' .. tostring(id) .. ' :: ' .. tostring(err)) return false end
  return true
end
T.updateAmbient = function(dt)
  T.ambient.timer = (T.ambient.timer or 0) + dt
  if not T.opt.ambient then
    if T.ambient.handle then
      pcall(function() if game.IsAudioAlive(T.ambient.handle) then game.StopAudio(T.ambient.handle) end end)
      T.ambient.handle = nil
    end
    return
  end
  if T.ambient.timer < 1 then return end
  T.ambient.timer = 0
  if T.ambient.handle then
    local ok, alive = pcall(function() return game.IsAudioAlive(T.ambient.handle) end)
    if ok and alive then return end
  end
  local ok, handle = pcall(function() return game.PlayAudio2D(T.SFX.ambient) end)
  if ok then
    T.ambient.handle = handle
    T.log('ambient play', T.SFX.ambient, 'handle=' .. tostring(handle))
  end
end
T.setAmbient = function(on)
  T.opt.ambient = on and true or false
  if not on and T.ambient.handle then
    pcall(function() game.StopAudio(T.ambient.handle) end)
    T.ambient.handle = nil
  end
  if on then T.ambient.timer = 1 end
end

-- ---------- 命中区 ----------
T.hitEv = function()
  if T.ev.CursorDown then return end
  local e = (type(Enum) == 'table' and Enum.CursorEventType) or nil
  T.ev.CursorDown = e and e.CursorDown or 'CursorDown'
  T.ev.CursorUp = e and e.CursorUp or 'CursorUp'
  T.ev.CursorClick = e and e.CursorClick or 'CursorClick'
  T.ev.CursorEnter = e and e.CursorEnter or 'CursorEnter'
  T.ev.CursorExit = e and e.CursorExit or 'CursorExit'
end
T.hit = function(name, x, y, w, h, opts)
  opts = opts or {}
  T.hitEv()
  local ctl = T.inst(T.tpl.hit)
  if not ctl then return nil end
  ctl.name = name
  T.setSize(ctl, w, h)
  T.setPos(ctl, x, y)
  T.trySet(ctl, 'raycastTarget', true)
  local function add(ev, fn)
    if pcall(function() ctl:AddCursorEventListener(ev, fn) end) then return true end
    return false
  end
  add(T.ev.CursorDown, function(data)
    if opts.onDown then opts.onDown(data) end
  end)
  add(T.ev.CursorUp, function(data)
    if opts.onUp then opts.onUp(data) end
  end)
  add(T.ev.CursorClick, function(data)
    if opts.clickSfx ~= false then T.sfx(opts.sfxId or T.SFX.click) end
    if opts.onClick then opts.onClick(data) end
  end)
  add(T.ev.CursorEnter, function(data)
    if opts.hoverSfx ~= false then T.sfx(T.SFX.hover) end
    if opts.onEnter then opts.onEnter(data) end
  end)
  add(T.ev.CursorExit, function(data)
    if opts.onExit then opts.onExit(data) end
  end)
  T.controls[#T.controls + 1] = ctl
  T.hits[name] = ctl
  return ctl
end
T.moveHit = function(name, x, y, w, h)
  local ctl = T.hits[name]
  if not ctl then return end
  if w then T.setSize(ctl, w, h) end
  T.setPos(ctl, x, y)
end
T.parkHit = function(name)
  local ctl = T.hits[name]
  if ctl then T.setPos(ctl, 0, -100000) end
end

-- ---------- 焦点项 ----------
T.item = function(o)
  o.x, o.y, o.w, o.h = o.x or 0, o.y or 0, o.w or 100, o.h or 40
  T.items[#T.items + 1] = o
  local idx = #T.items
  o.index = idx
  if o.name then
    o.hit = T.hit(o.name, o.x, o.y, o.w, o.h, {
      onEnter = function(data) T.setFocus(idx) end,
      onDown = function(data) if o.onDown then o.onDown(data) end end,
      onUp = function(data) if o.onUp then o.onUp(data) end end,
      onClick = function(data)
        T.setFocus(idx, true)
        if o.onConfirm then o.onConfirm() end
      end,
      clickSfx = o.clickSfx,
      hoverSfx = o.hoverSfx,
    })
  end
  return o
end
T.updateFocusFrame = function()
  local f = T.focusFrame
  if not f then return end
  local it = T.items[T.focus]
  if not it then
    for i = 1, #f do T.setPos(f[i], 0, -100000) end
    return
  end
  local pad = it.focusPad or 7
  local x, y, w, h = it.x + (it.offX or 0), it.y + (it.offY or 0), it.w + pad * 2, it.h + pad * 2
  local t = 2.4
  local hw, hh = w / 2, h / 2
  local arm = math.min(18, math.min(w, h) * 0.22)
  -- 四角 L 形括号（每角两条短臂）
  local corners = {
    { x - hw, y + hh, 1, 1 }, { x + hw, y + hh, -1, 1 },
    { x - hw, y - hh, 1, -1 }, { x + hw, y - hh, -1, -1 },
  }
  local ci = 1
  for _, c in ipairs(corners) do
    local cx, cy, sx, sy = c[1], c[2], c[3], c[4]
    local hctl = f[ci]
    local vctl = f[ci + 1]
    T.setSize(hctl, arm, t); T.setPos(hctl, cx + sx * arm / 2, cy)
    T.setSize(vctl, t, arm); T.setPos(vctl, cx, cy - sy * arm / 2)
    ci = ci + 2
  end
  local gi = ci
  for _, c in ipairs(corners) do
    local g = f[gi]
    if g then T.setSize(g, 7, 7); T.setPos(g, c[1], c[2]) end
    gi = gi + 1
  end
end
T.makeFocusFrame = function()
  local col = T.th.accent2
  local f = {}
  for i = 1, 8 do f[i] = T.img(0, -100000, 10, 2.4, 'rect', col) end
  for i = 9, 12 do f[i] = T.img(0, -100000, 7, 7, 'circle', T.th.accent) end
  T.focusFrame = f
end
T.setFocus = function(i, silent)
  if #T.items == 0 then T.focus = 0; T.updateFocusFrame(); return end
  if i < 1 then i = 1 end
  if i > #T.items then i = #T.items end
  local old = T.items[T.focus]
  if old and old.onFocus then old.onFocus(false) end
  T.focus = i
  local it = T.items[i]
  if it and it.onFocus then it.onFocus(true) end
  if not silent and old ~= it then T.sfx(T.SFX.hover) end
  T.updateFocusFrame()
end
T.moveFocus = function(dx, dy)
  if #T.items == 0 then return end
  local cur = T.items[T.focus] or T.items[1]
  if not T.focus or T.focus == 0 then T.focus = 1 end
  local best, bestScore = nil, 1e9
  for i, it in ipairs(T.items) do
    if i ~= T.focus then
      local vx, vy = it.x - cur.x, it.y - cur.y
      local primary = dx ~= 0 and vx * dx or vy * dy
      if primary > 4 then
        local ortho = dx ~= 0 and math.abs(vy) or math.abs(vx)
        local score = primary + ortho * 1.55
        if score < bestScore then bestScore = score; best = i end
      end
    end
  end
  if best then
    T.setFocus(best)
  else
    local wrap, wrapScore = nil, -1e9
    for i, it in ipairs(T.items) do
      local vx, vy = it.x - cur.x, it.y - cur.y
      local primary = dx ~= 0 and vx * dx or vy * dy
      if primary > 0 and primary > wrapScore then wrapScore = primary; wrap = i end
    end
    if wrap then T.setFocus(wrap) end
  end
end
T.confirmFocus = function()
  local it = T.items[T.focus]
  if it and it.onConfirm then
    T.sfx(T.SFX.confirm)
    it.onConfirm()
  end
end

-- ---------- 屏幕构建 ----------
T.clearScreen = function()
  local n, fail = 0, 0
  for i = #T.controls, 1, -1 do
    local ctl = T.controls[i]
    if ctl then
      local ok = pcall(function() game.DestroyClientUIControl(ctl) end)
      if ok then n = n + 1 else fail = fail + 1 end
    end
  end
  if fail > 0 then T.warn('pcall fail clear screen fail=' .. fail) end
  T.controls, T.texts, T.items, T.hits = {}, {}, {}, {}
  T.tweens, T.anims, T.pos = {}, {}, {}
  T.focus = 0
  T.focusFrame = nil
  T.screen = nil
  T.overlay = nil
  T.overlays = {}
  T.toastSet = nil
  T.shakeT, T.shakeFrom = 0, nil
end
T.finishScreen = function(defaultFocus)
  T.makeFocusFrame()
  T.setFocus(defaultFocus or 1, true)
  T.updateFocusFrame()
  if T.screen then
    T.log('screen=' .. tostring(T.screen.name), 'items=' .. #T.items, 'controls=' .. #T.controls,
      'hits=' .. #T.hits)
  end
end
T.build = function(name, params)
  T.clearScreen()
  T.mode = name
  T.screen = { name = name, params = params or {} }
  local fn = T.screenFns and T.screenFns[name]
  if not fn then
    T.warn('no screen builder: ' .. tostring(name))
    return
  end
  local ok, err = xpcall(function() fn(T.screen.params) end, function(e)
    return tostring(e) .. '\n' .. debug.traceback('', 2)
  end)
  if not ok then
    T.warn('build ' .. name .. ' FAILED :: ' .. tostring(err))
    return
  end
  T.finishScreen(T.screen.defaultFocus or 1)
  if T.screen.afterBuild then
    local ok2, err2 = pcall(T.screen.afterBuild)
    if not ok2 then T.warn('afterBuild ' .. name .. ' :: ' .. tostring(err2)) end
  end
end

-- ---------- 转场：霜色百叶（5 条冰带错落滑入，再滑出） ----------
T.transitionPanels = function(offset)
  local ps = {}
  local n = 5
  local bh = T.H / n + 2
  for i = 1, n do
    local y = T.H / 2 - (i - 0.5) * (T.H / n) + offset * (1 + (i % 2) * 0.10)
    ps[i] = T.imgRaw(0, y, T.W + 2, bh, 'rect', (i % 2 == 1) and T.C(255, 240, 250, 255) or T.C(255, 224, 244, 252))
    ps[i + n] = T.imgRaw(0, y - bh * 0.36, T.W + 2, 3, 'rect', T.C(255, 160, 216, 238))
  end
  return ps
end
T.movePanels = function(ps, offset)
  if not ps then return end
  local n = 5
  local bh = T.H / n + 2
  for i = 1, n do
    local base = T.H / 2 - (i - 0.5) * (T.H / n)
    local y = base + offset * (1 + (i % 2) * 0.10)
    if ps[i] then T.tryCall(ps[i], 'SetAnchoredPosition', 0, y) end
    if ps[i + n] then T.tryCall(ps[i + n], 'SetAnchoredPosition', 0, y - bh * 0.36) end
  end
end
T.destroyPanels = function(ps)
  if not ps then return end
  for i = 1, #ps do T.destroy(ps[i]) end
end
T.go = function(name, params)
  if T.transition then return end
  T.transition = { phase = 'cover', t = 0, dur = 0.18, name = name, params = params, panels = T.transitionPanels(-T.H) }
  T.sfx(T.SFX.tab)
end
T.updateTransition = function(dt)
  local tr = T.transition
  if not tr then return end
  tr.t = tr.t + dt
  if tr.phase == 'cover' then
    local k = math.min(1, tr.t / tr.dur)
    T.movePanels(tr.panels, -T.H + T.easeInOut(k) * T.H)
    if k >= 1 then
      T.destroyPanels(tr.panels)
      tr.panels = nil
      T.clearScreen()
      local ok, err = pcall(T.build, tr.name, tr.params)
      if not ok then T.warn('transition build :: ' .. tostring(err)) end
      tr.phase, tr.t, tr.dur = 'reveal', 0, 0.2
      tr.panels = T.transitionPanels(0)
    end
  else
    local k = math.min(1, tr.t / tr.dur)
    T.movePanels(tr.panels, T.easeInOut(k) * T.H)
    if k >= 1 then
      T.destroyPanels(tr.panels)
      T.transition = nil
    end
  end
end

-- ---------- 弹层 ----------
T.openOverlay = function(name, builder, opts)
  opts = opts or {}
  if T.transition then return end
  local base = {
    items = T.items, hits = T.hits, focus = T.focus, focusFrame = T.focusFrame,
    screen = T.screen, mode = T.mode, controlsStart = #T.controls + 1,
    name = name, pausesGame = opts.pausesGame, onClose = opts.onClose,
  }
  T.overlays[#T.overlays + 1] = base
  T.overlay = base
  -- 旧焦点框要移出屏幕：makeFocusFrame 会新建一套，旧的一套不 park 就会在弹层背后残留
  if T.focusFrame then
    for i = 1, #T.focusFrame do T.setPos(T.focusFrame[i], 0, -100000) end
  end
  T.items, T.hits, T.focus, T.focusFrame = {}, {}, 0, nil
  T.mode = 'overlay'
  local prev = T.screen
  T.screen = { name = 'overlay:' .. name, params = {}, update = opts.update, defaultFocus = opts.defaultFocus }
  local ok, err = xpcall(function() builder(base) end, function(e)
    return tostring(e) .. '\n' .. debug.traceback('', 2)
  end)
  if not ok then T.warn('overlay ' .. name .. ' FAILED :: ' .. tostring(err)) end
  T.makeFocusFrame()
  T.setFocus(opts.defaultFocus or 1, true)
  T.updateFocusFrame()
  T.screen.key = opts.key
  T.log('overlay=' .. name, 'items=' .. #T.items, 'controls=' .. #T.controls,
    'pause=' .. tostring(opts.pausesGame and true or false))
end
T.closeOverlay = function()
  local o = table.remove(T.overlays)
  if not o then return end
  for i = #T.controls, o.controlsStart, -1 do
    local ctl = T.controls[i]
    if ctl then pcall(function() game.DestroyClientUIControl(ctl) end); T.pos[ctl] = nil end
    T.controls[i] = nil
  end
  T.items, T.hits, T.focus, T.focusFrame = o.items, o.hits, o.focus, o.focusFrame
  T.screen, T.mode = o.screen, o.mode
  T.overlay = T.overlays[#T.overlays] or nil
  T.updateFocusFrame()
  if o.onClose then pcall(o.onClose) end
  T.log('overlay close=' .. tostring(o.name))
end
T.closeAllOverlays = function()
  while #T.overlays > 0 do T.closeOverlay() end
end
-- 弹层通用底板：遮罩 + 面板 + 标题（返回 panel 尺寸便于内容排版）
T.overlayPanel = function(w, h, title, sub, opts)
  opts = opts or {}
  local W, H = T.W, T.H
  local scrim = T.imgRaw(0, 0, W, H, 'rect', T.th.scrim)
  local ps = { scrim }
  local px, py = 0, 0
  T.spread(ps, T.rrect(px + 10, py - 12, w + 16, h + 16, 22, T.C(70, 4, 16, 28)))
  T.spread(ps, T.rrect(px, py, w, h, 20, T.th.border))
  T.spread(ps, T.rrect(px, py, w - 4, h - 4, 18, T.th.panel))
  local top = T.img(px, py + h / 2 - 34, w - 60, 1.6, 'rect', T.th.line)
  ps[#ps + 1] = top
  if title then
    local t = T.txt(px, py + h / 2 - 62, w - 100, 46, 28, title, T.th.text, 'Middle', 'Middle')
    ps[#ps + 1] = t
    if sub then
      local s = T.txt(px, py + h / 2 - 96, w - 100, 28, 13, sub, T.th.text3, 'Middle', 'Middle')
      ps[#ps + 1] = s
    end
  end
  local deco = T.img(px - w / 2 + 34, py + h / 2 - 34, 8, 8, 'fourstar', T.th.accent2)
  local deco2 = T.img(px + w / 2 - 34, py + h / 2 - 34, 8, 8, 'fourstar', T.th.accent2)
  ps[#ps + 1] = deco; ps[#ps + 1] = deco2
  -- 入场：整体上浮 + 回弹
  for i = 1, #ps do
    local c = ps[i]
    local p = T.pos[c]
    if p then
      T.setPos(c, p.x, p.y - 26)
      local bx, by = p.x, p.y
      T.after(0.02, function()
        T.tween(0.34, function(k)
          T.tryCall(c, 'SetAnchoredPosition', bx * T.S, (by - 26 * (1 - k)) * T.S)
        end, nil, T.easeOutBack, true)
      end, true)
    end
  end
  return { panel = panel, scrim = scrim, w = w, h = h, parts = ps }
end
T.closeButton = function(x, y, onClick, name)
  local c = T.img(x, y, 34, 34, 'circle', T.th.panel2)
  local c2 = T.img(x, y, 26, 26, 'circle', T.th.accentSoft)
  local a = T.img(x, y, 12, 2.4, 'rect', T.th.text2, 45)
  local b = T.img(x, y, 12, 2.4, 'rect', T.th.text2, -45)
  T.hit(name or 'hit_close', x, y, 46, 46, {
    onEnter = function() T.setColor(c, T.th.accent); T.setTxtColor(nil) end,
    onExit = function() T.setColor(c, T.th.panel2) end,
    onClick = function() T.sfx(T.SFX.back); onClick() end,
  })
end

-- ---------- Toast（冰晶胶囊） ----------
T.toast = function(text, color, icon)
  if T.toastSet then
    for i = #T.controls, 1, -1 do
      local c = T.controls[i]
      for _, tc in ipairs(T.toastSet) do
        if c == tc then T.controls[i] = nil; T.destroy(c); T.pos[c] = nil; break end
      end
    end
    T.toastSet = nil
  end
  local w = math.max(280, T.ulen(text) * 15 + 90)
  local y = 250
  local ps = {}
  local outer = T.rrect(0, y, w, 46, 23, T.th.border)
  local inner = T.rrect(0, y, w - 6, 38, 19, T.th.panel)
  for _, c in ipairs(outer) do ps[#ps + 1] = c end
  for _, c in ipairs(inner) do ps[#ps + 1] = c end
  ps[#ps + 1] = T.img(-w / 2 + 30, y, 8, 8, 'fourstar', color or T.th.accent2)
  ps[#ps + 1] = T.txt(12, y, w - 70, 34, 15, text, color or T.th.text, 'Middle', 'Middle')
  T.toastSet = ps
  local function move(dy)
    for i = 1, #ps do
      local c = ps[i]
      local p = T.pos[c]
      if p then T.tryCall(c, 'SetAnchoredPosition', p.x * T.S, (y + dy) * T.S) end
    end
  end
  move(20)
  T.tween(0.22, function(k) move(20 * (1 - k)) end, function()
    T.after(1.8, function()
      T.tween(0.2, function(k) move(-14 * k) end, function()
        for i = 1, #ps do
          local c = ps[i]
          for j = #T.controls, 1, -1 do if T.controls[j] == c then table.remove(T.controls, j) end end
          T.pos[c] = nil
          T.destroy(c)
        end
        T.toastSet = nil
      end, nil, true)
    end, true)
  end, nil, true)
end

-- ---------- 成就 ----------
T.unlock = function(id)
  if T.records.achv[id] then return end
  T.records.achv[id] = true
  local a = T.achvById[id]
  if a then T.toast('成就解锁 · ' .. a.name, T.th.accent2) end
  T.log('achievement', id)
end

-- ---------- 基础几何 ----------
-- 圆角矩形：2 矩形 + 4 圆，颜色必须不透明预混（半透明叠加会出接缝）
T.rrect = function(cx, cy, w, h, r, color, opts)
  local list = {}
  r = math.max(0, math.min(r or 10, w / 2, h / 2))
  local function push(c) if c then list[#list + 1] = c end end
  push(T.img(cx, cy, w - 2 * r, h, 'rect', color))
  push(T.img(cx, cy, w, h - 2 * r, 'rect', color))
  local off = { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }
  for _, o in ipairs(off) do
    push(T.img(cx + o[1] * (w / 2 - r), cy + o[2] * (h / 2 - r), r * 2, r * 2, 'circle', color))
  end
  return list, (opts and opts)
end
T.rrectOne = function(cx, cy, w, h, r, color)
  local list = T.rrect(cx, cy, w, h, r, color)
  return list[1]
end
-- 分组工具：rrect/card 返回的是「控件组」，改色/位移/展平必须走这两个
T.tint = function(group, color)
  if not group then return end
  if type(group) == 'table' then
    for i = 1, #group do T.setColor(group[i], color) end
  else
    T.setColor(group, color)
  end
end
T.spread = function(dst, group)
  if not group then return end
  if type(group) == 'table' then
    for i = 1, #group do dst[#dst + 1] = group[i] end
  else
    dst[#dst + 1] = group
  end
end
T.captureBase = function(dst, group)
  if not group then return end
  if type(group) == 'table' then
    for i = 1, #group do
      local p = T.pos[group[i]]
      if p then dst[#dst + 1] = { group[i], p.x, p.y } end
    end
  else
    local p = T.pos[group]
    if p then dst[#dst + 1] = { group, p.x, p.y } end
  end
end
T.shiftBase = function(base, dx, dy)
  for i = 1, #base do
    local b = base[i]
    T.tryCall(b[1], 'SetAnchoredPosition', (b[2] + (dx or 0)) * T.S, (b[3] + (dy or 0)) * T.S)
  end
end
-- 卡片：阴影 + 描边 + 面板 + 顶部高光
T.card = function(cx, cy, w, h, opts)
  opts = opts or {}
  local r = opts.radius or 16
  local fill = opts.fill or T.th.card
  local border = opts.border or T.th.cardBorder
  local parts = {}
  if opts.shadow ~= false then
    local sh = T.rrect(cx + (opts.shX or 4), cy - (opts.shY or 7), w, h, r, opts.shadowColor or T.C(46, 12, 40, 66))
    for i = 1, #sh do parts[#parts + 1] = sh[i] end
  end
  local b = T.rrect(cx, cy, w, h, r, border)
  for i = 1, #b do parts[#parts + 1] = b[i] end
  local p = T.rrect(cx, cy, w - (opts.borderW or 2), h - (opts.borderW or 2), math.max(2, r - 1), fill)
  for i = 1, #p do parts[#parts + 1] = p[i] end
  if opts.hi then
    local hl = T.img(cx, cy + h / 2 - (opts.hiY or 12), w - 40, 1.6, 'rect', opts.hi)
    parts[#parts + 1] = hl
  end
  return parts
end
T.hline = function(cx, cy, w, color, t)
  return T.img(cx, cy, w, t or 1.4, 'rect', color or T.th.line)
end
T.vline = function(cx, cy, h, color, t)
  return T.img(cx, cy, t or 1.4, h, 'rect', color or T.th.line)
end
T.dot = function(cx, cy, d, color)
  return T.img(cx, cy, d, d, 'circle', color or T.th.accent)
end
T.glowDot = function(cx, cy, r, color, alpha)
  T.img(cx, cy, r * 2.6, r * 2.6, 'circle', T.withA(color or T.th.accent, alpha or 26))
  T.img(cx, cy, r * 1.8, r * 1.8, 'circle', T.withA(color or T.th.accent, (alpha or 26) * 2))
  return T.img(cx, cy, r * 2, r * 2, 'circle', color or T.th.accent)
end
-- 六角冰晶：3 根 60° 交叠细矩形 + 6 个端点
T.snowflake = function(cx, cy, size, color, opts)
  opts = opts or {}
  local n = 3
  local list = {}
  for i = 0, n - 1 do
    local rot = i * 60
    list[#list + 1] = T.img(cx, cy, size * 2, size * 0.13, 'rect', color, rot)
    local a = math.rad(rot)
    list[#list + 1] = T.img(cx + math.cos(a) * size, cy + math.sin(a) * size, size * 0.28, size * 0.28,
      (opts.star and 'fourstar' or 'circle'), color)
    list[#list + 1] = T.img(cx - math.cos(a) * size, cy - math.sin(a) * size, size * 0.28, size * 0.28,
      (opts.star and 'fourstar' or 'circle'), color)
  end
  if opts.core then list[#list + 1] = T.img(cx, cy, size * 0.42, size * 0.42, 'circle', opts.core) end
  return list
end
-- 云：扁圆 + 两圆
T.cloudRaw = function(x, y, s, color)
  T.imgRaw(x, y, 120 * s, 46 * s, 'circle', color)
  T.imgRaw(x - 52 * s, y - 8 * s, 70 * s, 38 * s, 'circle', color)
  T.imgRaw(x + 58 * s, y - 5 * s, 84 * s, 42 * s, 'circle', color)
  T.imgRaw(x + 6 * s, y + 13 * s, 62 * s, 30 * s, 'circle', color)
end
T.cloud = function(x, y, s, color)
  T.img(x, y, 120 * s, 46 * s, 'circle', color)
  T.img(x - 52 * s, y - 8 * s, 70 * s, 38 * s, 'circle', color)
  T.img(x + 58 * s, y - 5 * s, 84 * s, 42 * s, 'circle', color)
  T.img(x + 6 * s, y + 13 * s, 62 * s, 30 * s, 'circle', color)
end
T.flowerRaw = function(x, y, r, color, center)
  for i = 0, 4 do
    local a = (i / 5) * math.pi * 2 - math.pi / 2
    T.imgRaw(x + math.cos(a) * r, y + math.sin(a) * r, r * 1.1, r * 1.1, 'circle', color)
  end
  T.imgRaw(x, y, r * 0.85, r * 0.85, 'circle', center or T.th.accent2)
end
T.flower = function(x, y, r, color, center)
  for i = 0, 4 do
    local a = (i / 5) * math.pi * 2 - math.pi / 2
    T.img(x + math.cos(a) * r, y + math.sin(a) * r, r * 1.1, r * 1.1, 'circle', color)
  end
  T.img(x, y, r * 0.85, r * 0.85, 'circle', center or T.th.accent2)
end
T.stars = function(x, y, n, size, color, emptyColor)
  for i = 1, 5 do
    local col = i <= n and color or (emptyColor or T.th.line)
    T.img(x + (i - 3) * (size + 8), y, size, size, 'fivestar', col)
  end
end
T.starRow = function(x, y, n, size, color, emptyColor)
  for i = 1, 3 do
    local col = i <= n and color or (emptyColor or T.th.line)
    T.img(x + (i - 2) * (size + 10), y, size, size, 'fivestar', col)
  end
end
T.bgGradient = function(top, mid, bot)
  local n = 18
  local h = T.H / n
  for i = 1, n do
    local t = (i - 0.5) / n
    local col
    if t < 0.58 then col = T.mix(top, mid, t / 0.58) else col = T.mix(mid, bot, (t - 0.58) / 0.42) end
    T.imgRaw(0, T.H / 2 - (i - 0.5) * h, T.W + 2, h + 1, 'rect', col)
  end
end

-- ---------- 数字/文本工具 ----------
-- UTF-8 字符数（#s 是字节数：中文标签按 # 算宽会放大 3 倍，出图实测溢出）
T.ulen = function(s)
  local n = 0
  for _ in string.gmatch(s or '', '[%z\1-\127\194-\244][\128-\191]*') do n = n + 1 end
  return n
end
T.fmt = function(n)
  local s = tostring(math.floor(n or 0))
  local out = s:reverse():gsub('(%d%d%d)', '%1,'):reverse()
  out = out:gsub('^,', '')
  return out
end
T.pad2 = function(n) return string.format('%02d', n) end
T.wrap = function(text, per)
  local out, line = {}, ''
  for ch in string.gmatch(text or '', '[%z\1-\127\194-\244][\128-\191]*') do
    line = line .. ch
    if #line >= per * 3 then out[#out + 1] = line; line = '' end
  end
  if line ~= '' then out[#out + 1] = line end
  return table.concat(out, '\n')
end


-- ===== 15_ui.lua =====
-- ============================================================================
-- UI 组件库：统一视觉语言（按钮 / 卡片 / 页头 / 页签 / 进度条 / 图标 / 槽位）
-- 规则：所有可点组件必须同时支持 鼠标悬停 与 键盘焦点；所有文字框高度走 T.textH。
-- ============================================================================
T = T or {}

-- ---------- 页头 / 页脚 ----------
T.header = function(title, sub, opts)
  opts = opts or {}
  local x = opts.x or (-T.DESIGN_W / 2 + 176)
  local y = opts.y or T.HEAD_Y
  T.img(x + 3, y, 4, 40, 'rect', T.th.accent2)
  T.img(x + 3, y + 26, 34, 2, 'rect', T.th.line)
  local tc = T.txt(x + 22, y + 4, 520, 52, opts.size or 34, title, T.th.text, 'Left', 'Middle')
  if sub then
    T.txt(x + 22, y - 30, 640, 26, 13, sub, T.th.text3, 'Left', 'Middle')
  end
  if opts.right then T.txt(T.DESIGN_W / 2 - T.M, y, 220, 30, 13, opts.right, T.th.text3, 'Right', 'Middle') end
  return tc
end
T.footer = function(parts)
  -- parts: { {key='↑↓', label='选择'}, ... } 或 字符串
  local y = -326
  if type(parts) == 'string' then
    T.txt(0, y, 1000, 30, 13, parts, T.th.text3, 'Middle', 'Middle')
    return
  end
  local widths, total = {}, 0
  for i, p in ipairs(parts) do
    local kw = p.key and (#p.key * 11 + 16) or 0
    widths[i] = kw + 8 + T.ulen(p.label) * 13 + 22
    total = total + widths[i]
  end
  local x = -total / 2
  for i, p in ipairs(parts) do
    local cw = widths[i]
    local cx = x + cw / 2
    local tx = cx
    if p.key then
      local kw = T.ulen(p.key) * 11 + 16
      local kx = cx - cw / 2 + kw / 2
      T.rrect(kx, y, kw, 22, 6, T.th.borderSoft)
      T.txt(kx, y, kw, 20, 11, p.key, T.th.text2, 'Middle', 'Middle')
      tx = kx + kw / 2 + (T.ulen(p.label) * 13) / 2 + 8
    end
    T.txt(tx, y, T.ulen(p.label) * 15 + 20, 24, 13, p.label, T.th.text3, 'Middle', 'Middle')
    x = x + cw
  end
end
T.backBtn = function(onClick, label)
  local x, y = -T.DESIGN_W / 2 + 54, T.HEAD_Y
  local bg = T.img(x, y, 36, 36, 'circle', T.th.panel2)
  local ring = T.img(x, y, 34, 34, 'ring', T.th.border)
  local arrow = T.img(x - 1, y, 12, 12, 'triangle', T.th.text2, -90)
  local ctl = T.txt(x + 30, y, 100, 34, 14, label or '返回', T.th.text2, 'Left', 'Middle')
  T.item({
    x = x + 20, y = y, w = 120, h = 44, name = 'hit_back', focusPad = 4,
    onConfirm = function() T.sfx(T.SFX.back); onClick() end,
    onFocus = function(on)
      T.setColor(bg, on and T.th.accent or T.th.panel2)
      T.setTxtColor(ctl, on and T.th.text or T.th.text2)
      T.setColor(arrow, on and T.th.onAccent or T.th.text2)
    end,
  })
end

-- ---------- 图标系统（纯图元，统一线条/填充） ----------
T.icon = function(kind, x, y, s, color)
  color = color or T.th.text2
  s = s or 10
  if kind == 'bow' then
    T.img(x + s * 0.1, y + s * 0.15, s * 0.26, s * 1.75, 'rect', color, -14)
    T.img(x - s * 0.02, y - s * 0.95, s * 0.26, s * 0.5, 'rect', color, 26)
    T.img(x + s * 0.42, y + s * 0.1, s * 0.07, s * 1.8, 'rect', T.withA(color, 170))
    T.img(x - s * 0.55, y + s * 0.2, s * 1.25, s * 0.12, 'rect', color)
    T.img(x + s * 0.62, y + s * 0.2, s * 0.42, s * 0.42, 'triangle', color, 90)
    T.img(x - s * 0.85, y + s * 0.05, s * 0.4, s * 0.36, 'triangle', color, 90)
  elseif kind == 'arrow' then
    T.img(x, y - s * 0.1, s * 0.16, s * 1.7, 'rect', color, 0)
    T.img(x, y + s * 0.85, s * 0.55, s * 0.55, 'triangle', color, 0)
    T.img(x - s * 0.28, y - s * 0.95, s * 0.5, s * 0.4, 'triangle', color, 90)
    T.img(x + s * 0.28, y - s * 0.95, s * 0.5, s * 0.4, 'triangle', color, -90)
  elseif kind == 'snow' then
    T.snowflake(x, y, s, color)
  elseif kind == 'crystal' then
    T.img(x, y, s * 1.1, s * 2.1, 'triangle', color, 0)
    T.img(x, y - s * 1.05, s * 1.1, s * 0.9, 'triangle', color, 180)
    T.img(x, y, s * 0.3, s * 1.5, 'rect', T.withA(T.P.white, 90))
  elseif kind == 'flower' then
    T.flower(x, y, s * 0.62, color, T.th.accent2)
  elseif kind == 'coin' then
    T.img(x, y, s * 1.9, s * 1.9, 'circle', color)
    T.img(x, y, s * 1.35, s * 1.35, 'ring', T.withA(T.P.ink, 90))
    T.img(x, y, s * 0.5, s * 0.5, 'circle', T.withA(T.P.gold2, 160))
  elseif kind == 'book' then
    T.img(x - s * 0.35, y, s * 1.5, s * 1.9, 'rect', color)
    T.img(x + s * 0.4, y, s * 0.16, s * 1.9, 'rect', T.withA(T.P.ink, 80))
    T.img(x - s * 0.35, y, s * 1.2, s * 0.12, 'rect', T.withA(T.P.white, 120))
  elseif kind == 'star' then
    T.img(x, y, s * 2, s * 2, 'fivestar', color)
  elseif kind == 'const' then
    for i = 0, 5 do
      local a = i * math.pi / 3 - math.pi / 2
      T.img(x + math.cos(a) * s * 0.82, y + math.sin(a) * s * 0.82, s * 0.3, s * 0.3, 'circle', color)
    end
    T.img(x, y, s * 0.9, s * 0.9, 'fourstar', color)
    T.img(x, y, s * 0.34, s * 0.34, 'circle', T.th.panel)
  elseif kind == 'mountain' then
    T.img(x - s * 0.5, y - s * 0.2, s * 1.7, s * 1.5, 'triangle', color, 0)
    T.img(x + s * 0.6, y - s * 0.35, s * 1.2, s * 1.2, 'triangle', color, 0)
    T.img(x - s * 0.5, y + s * 0.5, s * 0.6, s * 0.5, 'triangle', T.withA(T.P.white, 170), 0)
  elseif kind == 'tower' then
    T.img(x, y - s * 0.15, s * 1.4, s * 1.8, 'rect', color)
    T.img(x, y + s * 0.95, s * 2.1, s * 0.5, 'triangle', color, 0)
    T.img(x, y + s * 0.2, s * 0.4, s * 0.7, 'rect', T.th.panel)
    T.img(x, y - s * 0.75, s * 1.4, s * 0.18, 'rect', color)
  elseif kind == 'moon' then
    T.img(x, y, s * 2, s * 2, 'circle', color)
    T.img(x + s * 0.55, y - s * 0.2, s * 1.7, s * 1.7, 'circle', T.th.panel)
  elseif kind == 'plume' then
    T.img(x, y, s * 0.55, s * 2.1, 'rect', color, 18)
    T.img(x - s * 0.55, y, s * 0.5, s * 1.5, 'rect', color, 42)
    T.img(x + s * 0.5, y - s * 0.1, s * 0.45, s * 1.3, 'rect', color, -6)
  elseif kind == 'hourglass' then
    T.img(x, y + s * 0.55, s * 1.5, s * 0.9, 'triangle', color, 180)
    T.img(x, y - s * 0.55, s * 1.5, s * 0.9, 'triangle', color, 0)
    T.img(x, y, s * 1.7, s * 0.16, 'rect', color)
  elseif kind == 'bloom' then
    T.flower(x, y, s * 0.7, color, T.withA(T.P.white, 200))
  elseif kind == 'slime' then
    T.img(x, y, s * 2, s * 1.6, 'circle', color)
    T.img(x - s * 0.4, y + s * 0.5, s * 0.9, s * 0.7, 'triangle', T.withA(T.P.white, 160), 0)
    T.img(x - s * 0.4, y + s * 0.1, s * 0.22, s * 0.3, 'circle', T.withA(T.P.ink, 180))
    T.img(x + s * 0.35, y + s * 0.1, s * 0.22, s * 0.3, 'circle', T.withA(T.P.ink, 180))
  elseif kind == 'fly' then
    T.img(x - s * 0.55, y + s * 0.15, s * 1.1, s * 0.8, 'circle', color, 24)
    T.img(x + s * 0.55, y + s * 0.15, s * 1.1, s * 0.8, 'circle', color, -24)
    T.img(x, y, s * 0.45, s * 1.14, 'rect', T.withA(T.P.ink, 170))
  elseif kind == 'guard' then
    T.img(x, y - s * 0.4, s * 1.5, s * 1.5, 'rect', color)
    T.img(x, y + s * 0.62, s * 1.05, s * 0.9, 'rect', T.withA(T.P.ice1, 200))
    T.img(x, y + s * 0.55, s * 0.5, s * 0.16, 'rect', T.withA(T.P.ink, 190))
    T.img(x, y - s * 0.3, s * 0.6, s * 0.6, 'fourstar', T.withA(T.P.gold, 220))
  elseif kind == 'boss' then
    T.img(x, y + s * 0.1, s * 1.9, s * 1.9, 'circle', color)
    T.img(x - s * 0.62, y + s * 1.0, s * 0.62, s * 0.9, 'triangle', T.P.gold, -22)
    T.img(x + s * 0.62, y + s * 1.0, s * 0.62, s * 0.9, 'triangle', T.P.gold, 22)
    T.img(x - s * 0.42, y + s * 0.2, s * 0.3, s * 0.4, 'circle', T.P.ink)
    T.img(x + s * 0.42, y + s * 0.2, s * 0.3, s * 0.4, 'circle', T.P.ink)
  elseif kind == 'shield' then
    T.img(x, y + s * 0.1, s * 1.7, s * 1.9, 'rect', color)
    T.img(x, y - s * 0.85, s * 1.7, s * 1.0, 'triangle', color, 180)
    T.img(x, y, s * 0.5, s * 0.8, 'rect', T.th.panel)
  elseif kind == 'heart' then
    T.img(x - s * 0.4, y + s * 0.25, s * 1.05, s * 1.05, 'circle', color)
    T.img(x + s * 0.4, y + s * 0.25, s * 1.05, s * 1.05, 'circle', color)
    T.img(x, y - s * 0.45, s * 1.4, s * 1.4, 'triangle', color, 180)
  elseif kind == 'energy' then
    T.img(x, y, s * 1.2, s * 1.8, 'triangle', color, 12)
    T.img(x, y, s * 0.5, s * 1.1, 'triangle', T.withA(T.P.white, 160), 12)
  elseif kind == 'clock' then
    T.img(x, y, s * 2, s * 2, 'ring', color)
    T.img(x, y + s * 0.35, s * 0.14, s * 0.9, 'rect', color)
    T.img(x + s * 0.32, y, s * 0.7, s * 0.14, 'rect', color)
  elseif kind == 'lock' then
    T.img(x, y - s * 0.35, s * 1.3, s * 1.2, 'rect', color)
    T.img(x, y + s * 0.55, s * 0.9, s * 1.0, 'ring', color)
  elseif kind == 'check' then
    T.img(x - s * 0.25, y - s * 0.1, s * 0.9, s * 0.25, 'rect', color, 42)
    T.img(x + s * 0.28, y + s * 0.15, s * 0.25, s * 1.1, 'rect', color, -40)
  elseif kind == 'plus' then
    T.img(x, y, s * 1.6, s * 0.28, 'rect', color)
    T.img(x, y, s * 0.28, s * 1.6, 'rect', color)
  elseif kind == 'sword' then
    T.img(x, y + s * 0.3, s * 0.3, s * 1.8, 'rect', color)
    T.img(x, y - s * 0.55, s * 1.4, s * 0.2, 'rect', color)
    T.img(x, y - s * 1.0, s * 0.5, s * 0.6, 'rect', T.withA(T.P.gold, 200))
  elseif kind == 'map' then
    T.img(x, y, s * 1.9, s * 1.5, 'rect', T.withA(color, 60))
    T.img(x - s * 0.58, y, s * 0.1, s * 1.5, 'rect', color)
    T.img(x + s * 0.58, y, s * 0.1, s * 1.5, 'rect', color)
    T.img(x, y + s * 0.02, s * 1.3, s * 0.1, 'rect', color, 0)
    T.img(x, y + s * 0.72, s * 0.34, s * 0.34, 'circle', color)
    T.img(x, y + s * 0.72, s * 0.14, s * 0.14, 'circle', T.th.panel)
  elseif kind == 'gear' then
    for i = 0, 7 do
      local a = i * math.pi / 4
      T.img(x + math.cos(a) * s * 0.78, y + math.sin(a) * s * 0.78, s * 0.34, s * 0.34, 'rect', color, i * 45)
    end
    T.img(x, y, s * 1.3, s * 1.3, 'circle', color)
    T.img(x, y, s * 0.52, s * 0.52, 'circle', T.th.panel)
  elseif kind == 'user' then
    T.img(x, y + s * 0.55, s * 1.0, s * 1.0, 'circle', color)
    T.img(x, y - s * 0.85, s * 1.9, s * 1.2, 'circle', color)
  elseif kind == 'gift' then
    T.img(x, y - s * 0.2, s * 1.9, s * 1.4, 'rect', color)
    T.img(x, y + s * 0.85, s * 1.9, s * 0.35, 'rect', T.withA(color, 190))
    T.img(x, y, s * 0.22, s * 1.4, 'rect', T.withA(T.P.panel, 220))
  elseif kind == 'wind' then
    T.img(x, y, s * 1.9, s * 0.2, 'rect', color, 8)
    T.img(x, y + s * 0.55, s * 1.3, s * 0.2, 'rect', color, 8)
    T.img(x, y - s * 0.55, s * 1.5, s * 0.2, 'rect', color, 8)
  elseif kind == 'eye' then
    T.img(x, y, s * 1.9, s * 1.1, 'circle', color)
    T.img(x, y, s * 0.6, s * 0.6, 'circle', T.th.panel)
  elseif kind == 'spark' then
    T.img(x, y, s * 1.9, s * 1.9, 'fourstar', color)
  elseif kind == 'pause' then
    T.img(x - s * 0.35, y, s * 0.4, s * 1.5, 'rect', color)
    T.img(x + s * 0.35, y, s * 0.4, s * 1.5, 'rect', color)
  elseif kind == 'play' then
    T.img(x + s * 0.12, y, s * 1.5, s * 1.6, 'triangle', color, 90)
  elseif kind == 'home' then
    T.img(x, y + s * 0.35, s * 1.8, s * 1.5, 'triangle', color, 0)
    T.img(x, y - s * 0.55, s * 1.3, s * 0.9, 'rect', color)
  elseif kind == 'retry' then
    T.img(x, y, s * 1.8, s * 1.8, 'ring', color)
    T.img(x + s * 0.72, y + s * 0.7, s * 0.55, s * 0.55, 'triangle', color, 40)
    T.img(x - s * 0.9, y - s * 0.9, s * 0.7, s * 0.3, 'rect', T.th.panel)
  elseif kind == 'skull' then
    T.img(x, y + s * 0.2, s * 1.6, s * 1.5, 'circle', color)
    T.img(x, y - s * 0.9, s * 1.1, s * 0.8, 'rect', color)
    T.img(x - s * 0.35, y + s * 0.25, s * 0.3, s * 0.36, 'circle', T.th.panel)
    T.img(x + s * 0.35, y + s * 0.25, s * 0.3, s * 0.36, 'circle', T.th.panel)
  elseif kind == 'feather' then
    T.img(x, y, s * 0.75, s * 1.75, 'circle', color, 18)
    T.img(x - s * 0.1, y - s * 0.05, s * 0.12, s * 1.8, 'rect', T.withA(T.P.white, 150), 18)
    T.img(x + s * 0.05, y + s * 0.92, s * 0.4, s * 0.5, 'triangle', color, 18)
    T.img(x - s * 0.05, y - s * 0.95, s * 0.1, s * 0.5, 'rect', color, 18)
  elseif kind == 'drop' then
    T.img(x, y + s * 0.3, s * 1.2, s * 1.4, 'circle', color)
    T.img(x, y + s * 0.95, s * 0.95, s * 0.9, 'triangle', color, 0)
  else
    T.img(x, y, s * 1.6, s * 1.6, 'circle', color)
  end
end

-- ---------- 按钮 ----------
-- opts: kind='primary'|'secondary'|'ghost'|'danger'  w/h  icon  name  sub
T.button = function(x, y, w, h, label, onClick, opts)
  opts = opts or {}
  local kind = opts.kind or 'primary'
  local r = opts.radius or math.min(h / 2, 14)
  local parts, base = {}, {}
  local fillGroup, glowGroup, glossGroup = nil, nil, nil
  local textCtl, iconCtl
  local baseFill, hoverFill, textColor, hoverText
  if kind == 'primary' then
    -- 主按钮是淡金底：文字用深墨色，白字在浅金上对比不足（出图实测）
    baseFill, hoverFill = T.th.accent2, T.mix(T.th.accent2, T.P.white, 0.20)
    textColor, hoverText = T.C(255, 44, 62, 74), T.C(255, 30, 46, 58)
  elseif kind == 'secondary' then
    baseFill, hoverFill = T.th.panel2, T.th.panelHi
    textColor, hoverText = T.th.text, T.th.accent
  elseif kind == 'danger' then
    baseFill, hoverFill = T.withA(T.P.danger, 40), T.P.danger
    textColor, hoverText = T.P.danger, T.P.white
  else
    textColor, hoverText = T.th.text2, T.th.text
  end
  if baseFill then
    if kind == 'secondary' or kind == 'danger' then
      local bd = T.rrect(x, y, w, h, r, T.th.border)
      T.spread(parts, bd)
      fillGroup = T.rrect(x, y, w - 2, h - 2, math.max(2, r - 1), baseFill)
    else
      fillGroup = T.rrect(x, y, w, h, r, baseFill)
    end
    T.spread(parts, fillGroup)
    -- 顶部高光：单条不透明预混色（半透明 rrect 会在四角叠出淡斑，出图实测）
    local gloss = T.rrect(x, y + h * 0.22, w - 18, h * 0.34, math.max(2, r - 4),
      T.mix(baseFill, T.P.white, 0.18))
    for _, c in ipairs(gloss) do parts[#parts + 1] = c end
    T.captureBase(base, gloss)
    glossGroup = gloss
  end
  local labelW = w - (opts.icon and 44 or 20)
  local tx = x + (opts.icon and 10 or 0)
  textCtl = T.txt(tx, y, labelW, h - 6, opts.size or 18, label, textColor, 'Middle', 'Middle')
  parts[#parts + 1] = textCtl
  if opts.icon then
    iconCtl = T.icon(opts.icon, x - w / 2 + 26, y, opts.iconSize or 9, textColor)
  end
  if opts.badge then
    local bw = math.max(30, T.ulen(opts.badge) * 11 + 12)
    local bx = x + w / 2 - bw / 2 - 10
    T.rrect(bx, y, bw, 20, 6, T.th.panel2)
    T.txt(bx, y, bw, 18, 10, opts.badge, T.th.text2, 'Middle', 'Middle')
  end
  T.captureBase(base, parts)
  local function shift(dy) T.shiftBase(base, 0, dy) end
  local function repaint(fill, fg)
    if fillGroup then T.tint(fillGroup, fill) end
    if textCtl then T.setTxtColor(textCtl, fg) end
    if iconCtl then T.setColor(iconCtl, fg) end
  end
  local item = T.item({
    x = x, y = y, w = w, h = h, name = opts.name, focusPad = opts.focusPad or 6,
    onConfirm = onClick,
    onDown = function() if kind ~= 'ghost' then shift(-2) end end,
    onUp = function() if kind ~= 'ghost' then shift(0) end end,
    onFocus = function(on)
      if kind == 'ghost' then
        T.setTxtColor(textCtl, on and T.th.text or T.th.text2)
        if iconCtl then T.setColor(iconCtl, on and T.th.accent2 or T.th.text3) end
        return
      end
      repaint(on and hoverFill or baseFill, on and hoverText or textColor)
      if glossGroup then T.tint(glossGroup, T.mix(on and hoverFill or baseFill, T.P.white, 0.18)) end
      shift(on and 3 or 0)
    end,
  })
  return item
end

-- 小圆图标按钮（顶部工具）
T.iconBtn = function(x, y, d, kind, onClick, opts)
  opts = opts or {}
  local bg = T.img(x, y, d, d, 'circle', T.th.panel2)
  local ring = T.img(x, y, d - 2, d - 2, 'ring', T.th.border)
  local ic = T.icon(kind, x, y, opts.iconSize or 9, T.th.text2)
  local item = T.item({
    x = x, y = y, w = d + 8, h = d + 8, name = opts.name, focusPad = 4,
    onConfirm = onClick,
    onFocus = function(on)
      T.setColor(bg, on and T.th.accent or T.th.panel2)
      T.setColor(ic, on and T.th.onAccent or T.th.text2)
      T.setColor(ring, on and T.th.accent2 or T.th.border)
    end,
  })
  return item
end

-- ---------- 页签 ----------
T.tabs = function(cx, y, w, labels, active, onSelect, opts)
  opts = opts or {}
  local n = #labels
  local gap = opts.gap or 6
  local tw = (w - gap * (n - 1)) / n
  local items = {}
  for i, label in ipairs(labels) do
    local x = cx - w / 2 + tw / 2 + (i - 1) * (tw + gap)
    local on = (i == active)
    local fill = T.rrect(x, y, tw, 40, 10, on and T.th.accent or T.th.panel2)
    local txt = T.txt(x, y, tw - 12, 32, 15, label, on and T.th.onAccent or T.th.text2, 'Middle', 'Middle')
    if on then T.img(x, y - 22, tw * 0.5, 2.4, 'rect', T.th.accent2) end
    items[i] = T.item({
      x = x, y = y, w = tw, h = 44, name = (opts.namePrefix or 'hit_tab_') .. i, focusPad = 4,
      onConfirm = function() T.sfx(T.SFX.tab); onSelect(i) end,
      onFocus = function(f)
        for j = 1, #fill do T.setColor(fill[j], f and T.th.accent or T.th.panel2) end
        T.setTxtColor(txt, f and T.th.onAccent or (on and T.th.onAccent or T.th.text2))
      end,
    })
  end
  return items
end

-- ---------- 胶囊 / 徽章 / 计数 ----------
T.chip = function(x, y, label, color, opts)
  opts = opts or {}
  local fs = opts.size or 12
  local w = math.max(opts.minW or 64, T.ulen(label) * fs * 1.05 + 30)
  local h = opts.h or 24
  local parts = T.rrect(x, y, w, h, h / 2, opts.fill or T.th.accentSoft)
  T.txt(x, y, w - 10, h - 4, fs, label, opts.text or color or T.th.text2, 'Middle', 'Middle')
  if opts.dot then T.dot(x - w / 2 + 12, y, 6, color or T.th.accent) end
  return w
end
T.badge = function(x, y, label, opts)
  opts = opts or {}
  local fs = opts.size or 11
  local w = math.max(40, T.ulen(label) * fs * 1.1 + 18)
  T.rrect(x, y, w, opts.h or 20, (opts.h or 20) / 2, opts.fill or T.th.accentSoft)
  T.txt(x, y, w - 6, (opts.h or 20) - 4, fs, label, opts.text or T.th.accent, 'Middle', 'Middle')
  return w
end
T.resChip = function(x, y, icon, value, opts)
  opts = opts or {}
  local w = opts.w or 116
  T.rrect(x, y, w, 30, 15, T.th.panel2)
  T.icon(icon, x - w / 2 + 17, y, 8, opts.color or T.th.accent2)
  T.txt(x + 8, y, w - 40, 26, 12, value, T.th.text, 'Right', 'Middle')
  return w
end

-- ---------- 进度条 / 分隔 ----------
T.bar = function(x, y, w, h, pct, color, bg, opts)
  opts = opts or {}
  local bgc = bg or T.th.panel2
  T.rrect(x, y, w, h, h / 2, bgc)
  local fw = math.max(h, w * T.clamp(pct or 0, 0, 1))
  local fill = T.rrect(x - (w - fw) / 2, y, fw, h, h / 2, color or T.th.accent)
  if opts.shine ~= false then
    T.img(x - (w - fw) / 2, y + h * 0.18, fw - 8, h * 0.28, 'circle', T.withA(T.P.white, 46))
  end
  return fill
end
T.segBar = function(x, y, w, h, filled, total, color, opts)
  opts = opts or {}
  local gap = opts.gap or 3
  local seg = (w - gap * (total - 1)) / total
  for i = 1, total do
    local sx = x - w / 2 + seg / 2 + (i - 1) * (seg + gap)
    T.rrect(sx, y, seg, h, math.min(h / 2, 4), i <= filled and (color or T.th.accent) or T.th.line)
  end
end
T.divider = function(cx, cy, w, opts)
  opts = opts or {}
  T.img(cx, cy, w, 1.2, 'rect', opts.color or T.th.line)
  T.img(cx - w / 2, cy, 6, 6, 'fourstar', opts.mark or T.th.accent2)
  T.img(cx + w / 2, cy, 6, 6, 'fourstar', opts.mark or T.th.accent2)
end
T.sectionLabel = function(x, y, text, opts)
  opts = opts or {}
  T.img(x - 2, y, 3, 18, 'rect', opts.color or T.th.accent2)
  T.txt(x + 12, y, opts.w or 320, 26, opts.size or 15, text, T.th.text, 'Left', 'Middle')
  if opts.right then T.txt(opts.rightX or (x + (opts.w or 320)), y, 160, 24, 12, opts.right, T.th.text3, 'Right', 'Middle') end
end

-- ---------- 头像 / 槽位 ----------
T.avatar = function(x, y, r, ch, opts)
  opts = opts or {}
  T.img(x, y, r * 2 + 8, r * 2 + 8, 'circle', opts.ring or T.th.accent2)
  T.img(x, y, r * 2 + 2, r * 2 + 2, 'circle', T.th.panel)
  T.img(x, y, r * 2 - 2, r * 2 - 2, 'circle', ch.hair2)
  T.portraitHead(x, y - r * 0.06, (r * 2.2) / 120, ch)
  if opts.level then
    local bw = 40
    T.rrect(x, y - r - 2, bw, 18, 9, T.th.panel)
    T.txt(x, y - r - 2, bw, 16, 10, 'Lv.' .. opts.level, T.th.text, 'Middle', 'Middle')
  end
end
T.slot = function(x, y, w, h, icon, label, opts)
  opts = opts or {}
  local fill = T.rrect(x, y, w, h, 12, opts.empty and T.th.slotBg or T.th.panel2)
  local ring = T.img(x, y, w - 2, h - 2, 'ring', opts.empty and T.th.slotBorder or T.th.border)
  if icon then
    T.icon(icon, x, y + (label and 6 or 0), opts.iconSize or 14, opts.color or T.th.accent)
  end
  if label then
    T.txt(x, y - h / 2 + 14, w - 8, 20, 11, label, T.th.text3, 'Middle', 'Middle')
  end
  if opts.plus then
    T.img(x + w / 2 - 12, y + h / 2 - 12, 18, 18, 'circle', T.th.accent)
    T.icon('plus', x + w / 2 - 12, y + h / 2 - 12, 5, T.th.onAccent)
  end
  return { fill = fill, ring = ring }
end

-- 关卡星级（3 星）
T.star3 = function(x, y, n, size, opts)
  opts = opts or {}
  local col = opts.color or T.th.accent2
  for i = 1, 3 do
    local sx = x + (i - 2) * (size + 7)
    if i <= n then
      T.img(sx, y, size, size, 'fivestar', col)
    else
      T.img(sx, y, size, size, 'fivestar', opts.empty or T.th.line)
    end
  end
end

-- 箭头（chevron）
T.chevron = function(x, y, size, color, rot)
  local c = color or T.th.text3
  local r = rot or 0
  T.img(x - size * 0.05, y + size * 0.17, size * 0.72, size * 0.13, 'rect', c, r - 45)
  T.img(x - size * 0.05, y - size * 0.17, size * 0.72, size * 0.13, 'rect', c, r + 45)
end

-- 竖排资源条（右侧）
T.sideRail = function(x, y, items)
  for i, it in ipairs(items) do
    local yy = y - (i - 1) * 46
    T.rrect(x, yy, 132, 36, 18, T.th.panel2)
    T.icon(it.icon, x - 50, yy, 8, it.color or T.th.accent2)
    T.txt(x + 12, yy, 82, 30, 12, it.value, T.th.text, 'Right', 'Middle')
  end
end

-- 鼠标悬停放大（用于缩略图）
T.hoverScale = function(ctl, on, scale)
  if not ctl then return end
  T.setScale(ctl, on and (scale or 1.04) or 1)
end


-- ===== 20_art.lua =====
-- ============================================================================
-- 美术：双主题背景 / 雪峰山脊 / 甘雨立绘 / 冰晶装饰 / 敌人 / 道具 / 场景小景
-- 六种图元：rect circle triangle fourstar fivestar ring
-- 立绘局部坐标：头中心 (0,0)，身高约 470 单位；调用方用 s 缩放。
-- ============================================================================
T = T or {}

T.SKIN = T.P.skin
T.SKIN2 = T.P.skin2
T.BLUSH = T.P.blush
T.INK = T.P.ink

-- ---------------------------------------------------------------------------
-- 雪峰：主峰 + 肩峰 + 同顶点雪帽 + 亮边
-- apexY = 峰顶 y（设计坐标）；峰值越高越靠上
-- ---------------------------------------------------------------------------
T.peak = function(x, apexY, w, h, fill, opts)
  opts = opts or {}
  local cy = apexY - h / 2
  if opts.rim then T.img(x, cy, w + 7, h + 7, 'triangle', opts.rim) end
  T.img(x, cy, w, h, 'triangle', fill)
  if opts.shade then
    T.img(x + w * 0.20, cy - h * 0.01, w * 0.58, h * 0.97, 'triangle', opts.shade)
  end
  if opts.cap then
    local ratio = opts.capRatio or 0.32
    local capH = h * ratio
    local capW = w * ratio
    T.img(x, apexY - capH / 2, capW, capH, 'triangle', opts.cap)
  end
  if opts.line then
    local len = math.sqrt((w / 2) ^ 2 + h ^ 2) * 0.82
    local ang = math.deg(math.atan(w / 2, h))
    T.img(x - w * 0.22, cy + h * 0.02, 2, len, 'rect', opts.line, ang)
  end
end

T.ridge = function(peaks, opts)
  opts = opts or {}
  if opts.base then
    local lowest = T.DESIGN_H
    for _, p in ipairs(peaks) do
      local baseY = p[2] - p[4]
      if baseY < lowest then lowest = baseY end
    end
    T.img(0, lowest - T.DESIGN_H / 2, T.DESIGN_W + 80, T.DESIGN_H, 'rect', opts.base)
  end
  for _, p in ipairs(peaks) do
    T.peak(p[1], p[2], p[3], p[4], opts.fill, {
      rim = opts.rim, shade = opts.shade, cap = opts.cap,
      capRatio = opts.capRatio, line = opts.line,
    })
  end
end

T.haze = function(y, h, color, alpha)
  local c = color % 16777216
  local a = alpha or 28
  T.img(0, y, T.DESIGN_W * 1.25, h, 'circle', T.withA(c, math.floor(a * 0.8)))
  T.img(0, y - h * 0.35, T.DESIGN_W * 1.5, h * 0.8, 'circle', T.withA(c, math.floor(a * 0.55)))
  T.img(0, y + h * 0.3, T.DESIGN_W * 1.4, h * 0.6, 'circle', T.withA(c, math.floor(a * 0.5)))
end

-- ---------------------------------------------------------------------------
-- 雪花粒子（设计坐标；支持多层纵深）
-- ---------------------------------------------------------------------------
T.snowfall = function(n, opts)
  opts = opts or {}
  local m = T.opt.motion or 2
  local count = math.max(4, math.floor(n * (m == 1 and 0.55 or (m == 3 and 1.55 or 1))))
  local list = {}
  local W, H = T.DESIGN_W, T.DESIGN_H
  local baseColor = opts.color or T.P.white
  for i = 1, count do
    local x = (T.rand(1000) / 1000 - 0.5) * W * 1.04
    local y = (T.rand(1000) / 1000 - 0.5) * H * 1.04
    local size = (1.8 + T.rand(40) / 10) * (opts.scale or 1)
    local alpha = 70 + T.rand(150)
    local sp = 14 + T.rand(30)
    local sway = 8 + T.rand(26)
    if i % 6 == 0 and size > 3.3 then
      local parts = T.snowflake(x, y, size * 1.5, T.withA(baseColor % 16777216, alpha), { core = T.withA(T.P.white % 16777216, alpha) })
      local rel = {}
      for _, c in ipairs(parts) do
        local bp = T.pos[c]
        if bp then rel[#rel + 1] = { c, bp.x - x, bp.y - y } end
      end
      list[#list + 1] = { parts = rel, x = x, y = y, sp = sp * 0.6, ph = T.rand(628) / 100, sway = sway * 0.6 }
    else
      local ctl = T.img(x, y, size, size, 'circle', T.withA(baseColor % 16777216, alpha))
      list[#list + 1] = { ctl = ctl, x = x, y = y, sp = sp, ph = T.rand(628) / 100, sway = sway }
    end
  end
  T.anim(function(dt, time)
    if opts.pauseWithGame and T.overlay and T.overlay.pausesGame then return end
    for _, p in ipairs(list) do
      p.y = p.y - p.sp * dt
      if p.y < -H / 2 - 30 then
        p.y = H / 2 + 30
        p.x = (T.rand(1000) / 1000 - 0.5) * W * 1.04
      end
      local px = p.x + math.sin(time * 0.5 + p.ph) * p.sway
      if p.parts then
        for _, r in ipairs(p.parts) do
          T.tryCall(r[1], 'SetAnchoredPosition', (px + r[2]) * T.S, (p.y + r[3]) * T.S)
        end
      else
        T.tryCall(p.ctl, 'SetAnchoredPosition', px * T.S, p.y * T.S)
      end
    end
  end)
  return list
end

-- ---------------------------------------------------------------------------
-- 冰晶装饰
-- ---------------------------------------------------------------------------
T.iceShardCluster = function(x, y, s, color, opts)
  opts = opts or {}
  local col = color or T.P.ice2
  local spec = {
    { 0, 0, 14, 54, 0 }, { -14, -4, 9, 36, -22 }, { 13, -6, 8, 30, 20 },
    { -6, -8, 6, 22, -8 }, { 7, -2, 5, 18, 10 },
  }
  local list = {}
  for _, p in ipairs(spec) do
    list[#list + 1] = T.img(x + p[1] * s, y + p[2] * s, p[3] * s, p[4] * s, 'triangle', col, p[5])
    if opts.hi ~= false then
      list[#list + 1] = T.img(x + p[1] * s, y + (p[2] + p[4] * 0.18) * s, p[3] * s * 0.28, p[4] * s * 0.5,
        'triangle', T.withA(T.P.white, 150), p[5])
    end
  end
  return list
end

T.cornerCrystals = function(w, h, color, opts)
  opts = opts or {}
  local c = color or T.th.accent
  local a = opts.alpha or 120
  for _, sx in ipairs({ -1, 1 }) do
    for _, sy in ipairs({ -1, 1 }) do
      local cx, cy = sx * (w / 2 - 16), sy * (h / 2 - 16)
      T.img(cx, cy, 9, 9, 'fourstar', T.withA(c % 16777216, a))
      T.img(cx - sx * 7, cy, 5, 1.2, 'rect', T.withA(c % 16777216, a * 0.6))
    end
  end
end

-- 月光 / 光晕：多层低 alpha 圆，越外越淡（不要硬描边环）
T.glow = function(x, y, r, color, steps, alphaMax)
  steps = steps or 9
  alphaMax = alphaMax or 54
  for i = steps, 1, -1 do
    local k = i / steps
    T.img(x, y, r * 2 * (1 + k * 1.6), r * 2 * (1 + k * 1.6), 'circle',
      T.withA(color % 16777216, math.floor(alphaMax * (1 - k) ^ 2)))
  end
end

T.moon = function(x, y, r)
  T.glow(x, y, r, T.P.ice2, 20, 26)
  T.glow(x, y, r * 1.05, T.P.white, 8, 12)
  T.img(x, y, r * 2, r * 2, 'circle', T.C(255, 251, 253, 255))
  T.img(x, y, r * 1.86, r * 1.86, 'circle', T.C(255, 247, 251, 255))
  T.img(x - r * 0.32, y + r * 0.3, r * 0.34, r * 0.34, 'circle', T.C(30, 208, 230, 242))
  T.img(x + r * 0.34, y - r * 0.24, r * 0.26, r * 0.26, 'circle', T.C(26, 208, 230, 242))
  T.img(x + r * 0.05, y + r * 0.02, r * 0.16, r * 0.16, 'circle', T.C(20, 208, 230, 242))
end

-- 极光缎带：5 条相邻薄矩形，同角度、无重叠（避免 α 叠加）
T.auroraRibbon = function(x, y, w, h, color, rot, alpha)
  local n = 5
  for i = 1, n do
    local k = (i - 0.5) / n
    local a = math.floor(alpha * (0.35 + 0.65 * math.sin(k * math.pi)))
    T.img(x, y + (0.5 - k) * h, w * (0.72 + 0.28 * math.sin(k * math.pi)), h / n + 1, 'rect',
      T.withA(color % 16777216, a), rot)
  end
end

T.aurora = function(opts)
  opts = opts or {}
  T.auroraRibbon(-40, 238, 900, 62, T.P.mint, 4, 22)
  T.auroraRibbon(140, 206, 720, 44, T.P.ice3, -3, 18)
  -- 亮边（两端用圆点收口，避免硬边）
  T.img(-40, 268, 760, 1.2, 'rect', T.withA(T.P.mint, 40), 4)
  T.img(180, 226, 520, 1, 'rect', T.withA(T.P.ice2, 34), -3)
end

-- 星星（带闪烁）
T.starfield = function(n, opts)
  opts = opts or {}
  local list = {}
  for i = 1, n do
    local x = (T.rand(1000) / 1000 - 0.5) * T.DESIGN_W
    local y = T.rand(1000) / 1000 * T.DESIGN_H * 0.66 + T.DESIGN_H * 0.02
    local s = 1 + T.rand(3) * 0.7
    local a = 60 + T.rand(150)
    local ctl = T.img(x, y, s, s, (i % 9 == 0) and 'fourstar' or 'circle', T.withA(T.P.ice0 % 16777216, a))
    list[#list + 1] = { ctl = ctl, ph = T.rand(628) / 100, base = a }
  end
  T.anim(function(dt, t)
    for _, p in ipairs(list) do
      local a = p.base * (0.55 + 0.45 * math.sin(t * 1.4 + p.ph))
      T.trySet(p.ctl, 'imageColor', T.withA(T.P.ice0 % 16777216, math.floor(a)))
    end
  end)
  return list
end

-- 雪松 / 雪丘 / 边角框
T.pine = function(x, y, s, color, snow)
  color = color or T.C(255, 18, 42, 58)
  snow = snow or T.C(150, 230, 244, 252)
  T.img(x, y + 10 * s, 6 * s, 26 * s, 'rect', T.mix(color, T.INK, 0.2))
  T.img(x, y + 26 * s, 34 * s, 36 * s, 'triangle', color)
  T.img(x, y + 44 * s, 26 * s, 30 * s, 'triangle', color)
  T.img(x, y + 58 * s, 17 * s, 24 * s, 'triangle', color)
  T.img(x, y + 44 * s, 20 * s, 12 * s, 'triangle', snow)
  T.img(x, y + 60 * s, 13 * s, 9 * s, 'triangle', snow)
end

T.drift = function(x, y, w, h, color)
  T.img(x, y, w, h, 'circle', color or T.C(255, 246, 252, 255))
  T.img(x - w * 0.28, y - h * 0.18, w * 0.5, h * 0.7, 'circle', color or T.C(255, 246, 252, 255))
  T.img(x + w * 0.3, y - h * 0.12, w * 0.44, h * 0.6, 'circle', color or T.C(255, 246, 252, 255))
end

T.screenFrame = function(color, inset, mark)
  inset = inset or 14
  local w, h = T.DESIGN_W - inset * 2, T.DESIGN_H - inset * 2
  local c = color or T.withA(T.P.gold, 60)
  T.img(0, h / 2, w, 1.2, 'rect', c)
  T.img(0, -h / 2, w, 1.2, 'rect', c)
  T.img(-w / 2, 0, 1.2, h, 'rect', c)
  T.img(w / 2, 0, 1.2, h, 'rect', c)
  for _, sx in ipairs({ -1, 1 }) do
    for _, sy in ipairs({ -1, 1 }) do
      T.img(sx * w / 2, sy * h / 2, 14, 14, 'fourstar', mark or T.withA(T.P.goldPale, 120))
    end
  end
end

-- ---------------------------------------------------------------------------
-- 背景：夜
-- ---------------------------------------------------------------------------
T.bgNight = function(opts)
  opts = opts or {}
  T.bgGradient(T.C(255, 7, 20, 34), T.C(255, 14, 42, 66), T.C(255, 30, 78, 106))
  T.starfield(opts.stars or 52)
  if opts.aurora ~= false then T.aurora() end
  local mx = opts.moonX or 0
  local my = opts.moonY or 176
  T.moon(mx, my, opts.moonR or 88)
  -- 远山（低对比）
  T.haze(-150, 130, T.C(255, 34, 82, 110), 24)
  -- 远山：宽基底（w≈2.6h）+ 少量肩峰
  T.ridge({
    { -560, -118, 380, 110 }, { -300, -92, 340, 140 }, { -40, -124, 360, 100 },
    { 220, -84, 380, 150 }, { 520, -112, 360, 120 },
  }, { fill = T.C(255, 32, 74, 100), base = T.C(255, 32, 74, 100), cap = T.C(255, 172, 214, 238), capRatio = 0.16, rim = T.C(255, 42, 90, 118) })
  -- 中景
  T.haze(-236, 100, T.C(255, 24, 60, 84), 30)
  T.ridge({
    { -620, -210, 480, 130 }, { -240, -166, 520, 170 }, { 200, -206, 460, 140 }, { 560, -176, 440, 160 },
  }, { fill = T.C(255, 22, 54, 76), base = T.C(255, 22, 54, 76), cap = T.C(255, 194, 226, 246), capRatio = 0.14, rim = T.C(255, 32, 72, 98), shade = T.C(56, 12, 34, 50) })
  -- 近景：矮宽山脊，只露一条边
  T.haze(-300, 90, T.C(255, 18, 44, 62), 26)
  T.ridge({
    { -520, -300, 680, 120 }, { -40, -276, 640, 140 }, { 460, -306, 620, 120 },
  }, { fill = T.C(255, 16, 40, 58), base = T.C(255, 16, 40, 58), cap = T.C(255, 214, 240, 253), capRatio = 0.12, rim = T.C(255, 24, 58, 78), line = T.C(50, 200, 238, 250) })
  T.snowfield(-352, T.C(255, 30, 70, 94))
  -- 地平线雪松
  for i = 1, 15 do
    local px = -660 + (i - 1) * 96 + (T.rand(30) - 15)
    local sz = 0.5 + T.rand(30) / 100
    T.pine(px, -338 + T.rand(18), sz * T.S, T.C(255, 16, 38, 54), T.C(110, 190, 220, 238))
  end
  T.imgRaw(0, -T.DESIGN_H / 2 + 2, T.W + 4, 8, 'rect', T.C(255, 20, 50, 70))
  return { moon = { x = mx, y = my, r = opts.moonR or 88 } }
end

T.snowfield = function(y, color, opts)
  opts = opts or {}
  local W = T.DESIGN_W
  local c = color or T.C(255, 236, 249, 255)
  T.img(0, y - 26, W * 1.3, 150, 'circle', c)
  T.img(-W * 0.34, y + 6, W * 0.72, 110, 'circle', T.mix(c, T.P.white, 0.10))
  T.img(W * 0.36, y + 2, W * 0.66, 100, 'circle', T.mix(c, T.P.white, 0.06))
  if opts.sparkle ~= false then
    for i = 1, 16 do
      local sx = (T.rand(1000) / 1000 - 0.5) * W * 0.94
      local sy = y - 10 + T.rand(60)
      T.img(sx, sy, 2.6, 2.6, 'fourstar', T.withA(T.P.white, 90))
    end
  end
end

-- ---------------------------------------------------------------------------
-- 背景：昼（清爽 / 高调）
-- ---------------------------------------------------------------------------
T.bgDay = function(opts)
  opts = opts or {}
  T.bgGradient(T.C(255, 250, 254, 255), T.C(255, 230, 247, 254), T.C(255, 205, 234, 248))
  -- 太阳光晕
  local sx, sy = opts.sunX or 380, opts.sunY or 168
  T.glow(sx, sy, 96, T.P.goldPale, 8, 30)
  T.img(sx, sy, 128, 128, 'circle', T.C(255, 253, 252, 240))
  -- 云
  T.cloudRaw(-420, 190, 1.15 * T.S, T.C(130, 255, 255, 255))
  T.cloudRaw(360, 150, 0.9 * T.S, T.C(110, 255, 255, 255))
  T.cloudRaw(120, 232, 0.68 * T.S, T.C(80, 255, 255, 255))
  -- 远山（白 / 冰蓝）
  T.ridge({
    { -560, -110, 400, 110 }, { -290, -80, 360, 140 }, { -30, -116, 380, 100 },
    { 230, -76, 400, 150 }, { 530, -104, 380, 120 },
  }, { fill = T.C(255, 240, 250, 255), base = T.C(255, 240, 250, 255), cap = T.C(255, 255, 255, 255), capRatio = 0.2, rim = T.C(255, 218, 240, 251) })
  T.cloudRaw(-260, -150, 1.4 * T.S, T.C(120, 255, 255, 255))
  T.ridge({
    { -620, -214, 520, 130 }, { -200, -166, 560, 170 }, { 240, -210, 500, 140 }, { 600, -178, 460, 160 },
  }, { fill = T.C(255, 215, 240, 252), base = T.C(255, 215, 240, 252), cap = T.C(255, 252, 255, 255), capRatio = 0.16, rim = T.C(255, 196, 229, 247), shade = T.C(20, 172, 216, 238) })
  T.cloudRaw(280, -238, 1.7 * T.S, T.C(110, 255, 255, 255))
  T.haze(-286, 80, T.C(255, 190, 226, 246), 36)
  T.ridge({
    { -520, -310, 700, 120 }, { -20, -286, 660, 140 }, { 480, -316, 620, 120 },
  }, { fill = T.C(255, 224, 245, 253), base = T.C(255, 224, 245, 253), cap = T.C(255, 255, 255, 255), capRatio = 0.12 })
  T.snowfield(-352, T.C(255, 250, 254, 255))
  -- 零星清心
  for i = 1, 3 do
    local fx = -520 + i * 380 + (T.rand(60) - 30)
    T.flower(fx, -280 + T.rand(30), 6, T.withA(T.P.violet, 170), T.P.goldPale)
  end
  return { sun = { x = sx, y = sy } }
end

-- 前景雪堤
T.snowBank = function(color, y)
  local W = T.DESIGN_W
  local c = color or T.C(255, 250, 254, 255)
  T.img(-W * 0.26, y or (-T.DESIGN_H * 0.47), W * 0.82, 120, 'circle', c)
  T.img(W * 0.28, (y or (-T.DESIGN_H * 0.47)) - 8, W * 0.78, 110, 'circle', c)
  T.img(0, (y or (-T.DESIGN_H * 0.47)) - 34, W * 1.2, 100, 'circle', c)
end

-- ---------------------------------------------------------------------------
-- 甘雨 / 角色立绘
-- ---------------------------------------------------------------------------
T.portraitHead = function(x, y, s, ch)
  -- 头像：剪影优先（后发→肩→脸→发帘→角→五官），60px 内可辨识
  T.img(x, y + 2 * s, 116 * s, 122 * s, 'circle', ch.hair2)
  T.img(x - 58 * s, y - 24 * s, 24 * s, 64 * s, 'circle', ch.hair)
  T.img(x + 58 * s, y - 24 * s, 24 * s, 64 * s, 'circle', ch.hair)
  T.img(x, y - 64 * s, 66 * s, 30 * s, 'circle', ch.cloth)
  T.img(x, y - 50 * s, 24 * s, 22 * s, 'circle', ch.cloth2)
  T.img(x, y, 86 * s, 98 * s, 'circle', T.SKIN)
  -- 发帘：5 片扇形（三角朝下）
  for i = 1, 5 do
    local bx = (i - 3) * 18 * s
    local hh = (i == 3) and 26 or 32
    T.img(x + bx, y + 30 * s, 30 * s, hh * s, 'triangle', ch.hair, 180 + (i - 3) * 5)
  end
  T.img(x - 40 * s, y + 10 * s, 22 * s, 54 * s, 'triangle', ch.hair, 190)
  T.img(x + 40 * s, y + 10 * s, 22 * s, 54 * s, 'triangle', ch.hair, 170)
  -- 角
  if ch.motif == 'qilin' then
    T.img(x - 30 * s, y + 52 * s, 15 * s, 26 * s, 'triangle', T.P.gold2, -14)
    T.img(x - 40 * s, y + 68 * s, 11 * s, 22 * s, 'triangle', T.P.gold, -30)
    T.img(x + 30 * s, y + 52 * s, 15 * s, 26 * s, 'triangle', T.P.gold2, 14)
    T.img(x + 40 * s, y + 68 * s, 11 * s, 22 * s, 'triangle', T.P.gold, 30)
  elseif ch.motif == 'crane' then
    T.img(x - 34 * s, y + 50 * s, 7 * s, 24 * s, 'rect', T.P.white, -14)
    T.img(x + 34 * s, y + 50 * s, 7 * s, 24 * s, 'rect', T.P.white, 14)
  else
    T.img(x + 34 * s, y + 46 * s, 20 * s, 10 * s, 'circle', T.P.danger, -14)
  end
  -- 五官
  T.img(x - 17 * s, y - 4 * s, 17 * s, 20 * s, 'circle', T.P.white)
  T.img(x + 17 * s, y - 4 * s, 17 * s, 20 * s, 'circle', T.P.white)
  T.img(x - 17 * s, y - 3 * s, 12 * s, 15 * s, 'circle', ch.eye)
  T.img(x + 17 * s, y - 3 * s, 12 * s, 15 * s, 'circle', ch.eye)
  T.img(x - 17 * s, y - 5 * s, 6 * s, 8 * s, 'circle', T.INK)
  T.img(x + 17 * s, y - 5 * s, 6 * s, 8 * s, 'circle', T.INK)
  T.img(x - 20 * s, y + 1 * s, 3 * s, 3 * s, 'circle', T.P.white)
  T.img(x + 14 * s, y + 1 * s, 3 * s, 3 * s, 'circle', T.P.white)
  T.img(x - 17 * s, y + 6 * s, 17 * s, 2.2 * s, 'rect', T.INK, -4)
  T.img(x + 17 * s, y + 6 * s, 17 * s, 2.2 * s, 'rect', T.INK, 4)
end

-- 立绘：剪影优先 + 分片明暗；1:4.2 头身
T.portrait = function(ch, cx, cy, s, opts)
  opts = opts or {}
  s = s or 1
  local hair, hair2, hair3 = ch.hair, ch.hair2, ch.hair3
  local cloth = ch.cloth
  local cloth2 = ch.cloth2
  local shade = T.mix(cloth, T.P.ice4, 0.30)
  local shade2 = T.mix(cloth, T.P.deep, 0.16)
  local rim = T.mix(hair, hair3, 0.55)
  local parts = {}
  local function put(lx, ly, w, h, shape, color, rot, tag)
    local ctl = T.img(cx + lx * s, cy + ly * s, w * s, h * s, shape, color, rot or 0)
    if ctl then
      parts[#parts + 1] = { ctl = ctl, lx = lx, ly = ly, tag = tag }
      return ctl
    end
  end
  local skin, skin2 = T.SKIN, T.SKIN2

  -- ===== 1 后发（轮廓 + 边缘光） =====
  put(0, -26, 136, 162, 'circle', rim, 0, 'hairRim')
  put(-64, -140, 44, 190, 'circle', rim, -3, 'hairRim')
  put(64, -140, 44, 190, 'circle', rim, 3, 'hairRim')
  put(0, -28, 124, 150, 'circle', hair2, 0, 'hairBack')
  put(-60, -136, 38, 178, 'circle', hair2, -3, 'hairBack')
  put(60, -136, 38, 178, 'circle', hair2, 3, 'hairBack')
  put(-66, -238, 30, 64, 'triangle', hair2, 176, 'hairBack')
  put(66, -238, 30, 64, 'triangle', hair2, 184, 'hairBack')

  -- ===== 2 肩披 =====
  put(0, -128, 194, 56, 'circle', cloth2, 0, 'mantle')
  put(0, -122, 150, 40, 'circle', T.mix(cloth2, T.P.ice4, 0.35), 0, 'mantle')
  put(0, -152, 180, 6, 'rect', T.P.gold, 0, 'mantleTrim')

  -- ===== 3 裙 / 身体 =====
  put(0, -276, 190, 170, 'triangle', cloth, 180, 'skirt')
  put(0, -352, 168, 46, 'circle', cloth, 0, 'skirtHem')
  put(-62, -282, 56, 146, 'triangle', shade, 184, 'skirtShade')
  put(62, -282, 56, 146, 'triangle', shade, 176, 'skirtShade')
  put(0, -356, 120, 10, 'rect', cloth2, 0, 'hem')
  put(0, -354, 120, 3, 'rect', T.P.gold, 0, 'hemTrim')
  -- 左缘高光
  put(-70, -280, 5, 130, 'rect', T.mix(cloth, T.P.white, 0.75), 6, 'rimLight')
  put(0, -208, 96, 20, 'rect', cloth2, 0, 'belt')
  put(0, -207, 96, 3, 'rect', T.P.gold, 0, 'trim')
  put(0, -160, 92, 112, 'rect', cloth, 0, 'torso')
  put(-38, -160, 13, 108, 'rect', shade, 0, 'torsoShade')
  put(38, -160, 13, 108, 'rect', shade, 0, 'torsoShade')
  put(0, -136, 38, 46, 'triangle', cloth2, 180, 'chest')
  put(0, -146, 58, 16, 'circle', T.mix(cloth, T.P.white, 0.8), 0, 'bib')
  put(0, -116, 24, 20, 'rect', cloth2, 0, 'collar')
  put(0, -105, 24, 3, 'rect', T.P.gold, 0, 'trim')
  -- 冰元素神之眼
  put(42, -196, 12, 16, 'circle', T.P.ice3, 0, 'vision')
  put(42, -196, 6, 8, 'fourstar', T.P.white, 0, 'vision')
  -- 铃铛
  put(-31, -176, 10, 10, 'circle', T.P.gold, 0, 'bell')
  put(-31, -182, 5, 5, 'circle', T.P.gold2, 0, 'bell')
  -- ===== 4 手臂 =====
  put(-54, -146, 28, 74, 'rect', cloth, 12, 'arm')
  put(54, -146, 28, 74, 'rect', cloth, -12, 'arm')
  put(-66, -220, 22, 66, 'rect', cloth, 5, 'arm')
  put(66, -220, 22, 66, 'rect', cloth, -5, 'arm')
  put(-68, -254, 26, 13, 'rect', cloth2, 5, 'cuff')
  put(68, -254, 26, 13, 'rect', cloth2, -5, 'cuff')
  put(-69, -272, 17, 17, 'circle', skin, 0, 'hand')
  put(69, -272, 17, 17, 'circle', skin, 0, 'hand')
  -- 手中冰晶
  put(69, -290, 16, 16, 'fourstar', T.withA(T.P.ice2, 120), 0, 'holdFx')
  put(69, -290, 6, 6, 'circle', T.P.white, 0, 'holdFx')

  -- ===== 5 颈 / 头 =====
  put(0, -74, 22, 26, 'rect', skin2, 0, 'neck')
  put(0, 0, 100, 112, 'circle', skin, 0, 'face')
  put(-51, -2, 14, 20, 'circle', skin, 0, 'ear')
  put(51, -2, 14, 20, 'circle', skin, 0, 'ear')
  put(-53, -14, 7, 7, 'circle', T.P.gold, 0, 'earring')
  put(53, -14, 7, 7, 'circle', T.P.gold, 0, 'earring')

  -- ===== 6 发帘（中分：5 片，中间短） =====
  put(0, 32, 98, 50, 'circle', hair, 0, 'bang')
  local fringe = {
    { -40, 24, 34, 50, -10, hair }, { -20, 27, 30, 54, -4, hair },
    { 0, 30, 26, 30, 0, hair2 }, { 20, 27, 30, 54, 4, hair }, { 40, 24, 34, 50, 10, hair },
  }
  for _, f in ipairs(fringe) do
    put(f[1], f[2], f[3], f[4], 'triangle', f[6], 180 + f[5], 'bang')
  end
  put(-25, 30, 18, 6, 'circle', hair3, -16, 'hairHi')
  put(27, 28, 14, 5, 'circle', hair3, 12, 'hairHi')
  -- 侧发（前）
  put(-52, 0, 26, 84, 'triangle', hair, 172, 'bang')
  put(52, 0, 26, 84, 'triangle', hair, 188, 'bang')
  put(-58, -56, 28, 82, 'circle', hair, -4, 'sideHair')
  put(58, -56, 28, 82, 'circle', hair, 4, 'sideHair')
  put(-63, -108, 22, 52, 'triangle', hair, 176, 'sideHair')
  put(63, -108, 22, 52, 'triangle', hair, 184, 'sideHair')
  put(-53, -58, 6, 68, 'rect', T.mix(hair, hair3, 0.55), -3, 'hairHi')
  put(53, -58, 6, 68, 'rect', T.mix(hair, hair3, 0.55), 3, 'hairHi')
  put(-43, -96, 3, 40, 'rect', T.mix(hair, hair3, 0.35), -5, 'hairHi')
  put(43, -96, 3, 40, 'rect', T.mix(hair, hair3, 0.35), 5, 'hairHi')
  -- 头顶轮廓光
  for i = -2, 2 do
    put(i * 16, 52 - math.abs(i) * 3, 14, 5, 'circle', T.mix(hair3, T.P.white, 0.35), 0, 'hairHi')
  end

  -- ===== 7 麒麟角（叠压成连续弯角） =====
  if ch.motif == 'qilin' then
    for _, sg in ipairs({ -1, 1 }) do
      -- 珠链式：沿曲线排布逐渐变小的圆，天然连续且可弯
      local beads = {
        { 26, 44, 15 }, { 28, 60, 14 }, { 32, 76, 12.5 }, { 38, 92, 11 },
        { 46, 106, 9 }, { 55, 118, 7 }, { 63, 128, 5 },
      }
      for i, b in ipairs(beads) do
        local col = (i <= 2) and T.P.gold2 or (i <= 5 and T.P.gold or T.P.goldPale)
        put(sg * b[1], b[2], b[3] * 2, b[3] * 2, 'circle', col, 0, 'horn')
      end
      put(sg * 26, 48, 8, 16, 'circle', T.withA(T.P.white, 110), 0, 'horn')
    end
  elseif ch.motif == 'crane' then
    put(-46, 78, 8, 54, 'rect', T.P.white, -18, 'horn')
    put(46, 78, 8, 54, 'rect', T.P.white, 18, 'horn')
    put(-56, 104, 6, 20, 'triangle', T.P.white, -34, 'horn')
    put(56, 104, 6, 20, 'triangle', T.P.white, 34, 'horn')
  else
    put(-42, 72, 26, 34, 'circle', hair2, -16, 'horn')
    put(42, 72, 26, 34, 'circle', hair2, 16, 'horn')
    put(-38, 80, 15, 16, 'circle', T.P.gold, -16, 'horn')
    put(38, 80, 15, 16, 'circle', T.P.gold, 16, 'horn')
  end

  -- ===== 8 五官 =====
  for _, sg in ipairs({ -1, 1 }) do
    local ex = sg * 22
    put(ex, -4, 21, 25, 'circle', T.P.white, 0, 'eyeWhite')
    put(ex, -3, 16, 21, 'circle', ch.eye, 0, 'eye')
    put(ex, -7, 12, 14, 'circle', T.mix(ch.eye, T.INK, 0.35), 0, 'eye')
    put(ex, -6, 8, 10, 'circle', T.INK, 0, 'pupil')
    put(ex - sg * 4, -10, 5.5, 5.5, 'circle', T.P.white, 0, 'eyeHi')
    put(ex + sg * 4, 0, 3, 3, 'circle', T.withA(T.P.white, 200), 0, 'eyeHi')
    put(ex, 9, 24, 3.4, 'rect', T.INK, -sg * 7, 'lash')
    put(ex + sg * 12, 11, 7, 3, 'triangle', T.INK, sg * 40, 'lash')
    put(ex, -18, 15, 1.6, 'rect', T.withA(T.P.roseDeep, 120), 0, 'lowerLid')
    put(ex, 25, 19, 2.4, 'rect', hair2, -sg * 9, 'brow')
  end
  local bl1 = T.img(cx - 22 * s, cy - 6 * s, 20 * s, 2.6 * s, 'rect', T.INK, -7)
  local bl2 = T.img(cx + 22 * s, cy - 6 * s, 20 * s, 2.6 * s, 'rect', T.INK, 7)
  parts[#parts + 1] = { ctl = bl1, lx = -22, ly = -6, parked = true, tag = 'blinkLine' }
  parts[#parts + 1] = { ctl = bl2, lx = 22, ly = -6, parked = true, tag = 'blinkLine' }
  T.setPos(bl1, -100000, 0)
  T.setPos(bl2, -100000, 0)
  put(-40, -26, 23, 8, 'circle', T.withA(T.BLUSH, 110), 0, 'blush')
  put(40, -26, 23, 8, 'circle', T.withA(T.BLUSH, 110), 0, 'blush')
  put(0, -22, 2.6, 4, 'circle', T.withA(T.SKIN2, 110), 0, 'nose')
  put(0, -34, 11, 2.4, 'rect', T.withA(T.P.roseDeep, 210), 0, 'mouth')
  put(-5.5, -32, 4, 3, 'triangle', T.withA(T.P.roseDeep, 210), 200, 'mouth')
  put(5.5, -32, 4, 3, 'triangle', T.withA(T.P.roseDeep, 210), 160, 'mouth')

  -- ===== 9 发饰 =====
  if ch.motif == 'qilin' then
    put(46, 48, 13, 13, 'flower', T.P.violet, 0, 'hairAcc')
    put(46, 48, 5, 5, 'circle', T.P.goldPale, 0, 'hairAcc')
    put(54, 34, 5, 9, 'rect', T.P.gold, 0, 'hairAcc')
  elseif ch.motif == 'crane' then
    put(-50, 32, 24, 10, 'circle', T.P.danger, -20, 'hairAcc')
    put(0, -150, 5, 40, 'rect', T.P.danger, 0, 'cord')
  else
    put(38, 46, 26, 9, 'circle', T.P.danger, -14, 'hairAcc')
    put(-40, 44, 20, 7, 'circle', T.P.gold, 12, 'hairAcc')
    put(0, -200, 80, 6, 'rect', T.P.danger, 0, 'trim')
  end

  -- ===== 待机 =====
  if opts.idle ~= false then
    local amp = (opts.amp or 2.2) * (T.opt.motion == 1 and 0.6 or (T.opt.motion == 3 and 1.3 or 1))
    local phase = (ch.id or 1) * 1.7
    local blinkT, nextBlink = 0, 2.6 + (ch.id or 1)
    T.anim(function(dt, time)
      if opts.pauseWithGame and T.overlay and T.overlay.pausesGame then return end
      local bob = math.sin(time * 1.25 + phase) * amp
      for _, p in ipairs(parts) do
        if not p.parked and p.ctl then
          local sway = 0
          if p.tag == 'hairBack' or p.tag == 'hairRim' or p.tag == 'sideHair' then
            sway = math.sin(time * 0.8 + phase) * amp * (p.tag == 'sideHair' and 0.7 or 0.4)
          end
          T.tryCall(p.ctl, 'SetAnchoredPosition', (cx + (p.lx + sway) * s) * T.S, (cy + (p.ly + bob) * s) * T.S)
        end
      end
      if opts.blink ~= false then
        nextBlink = nextBlink - dt
        if nextBlink <= 0 and blinkT <= 0 then blinkT = 0.1 end
        if blinkT > 0 then
          blinkT = blinkT - dt
          for _, p in ipairs(parts) do
            if p.ctl then
              if p.tag == 'eye' or p.tag == 'eyeHi' or p.tag == 'eyeWhite' or p.tag == 'pupil' then
                T.setPos(p.ctl, -100000, 0)
              elseif p.tag == 'blinkLine' then
                T.tryCall(p.ctl, 'SetAnchoredPosition', (cx + p.lx * s) * T.S, (cy + (p.ly + bob) * s) * T.S)
              end
            end
          end
          if blinkT <= 0 then
            nextBlink = 2.6 + T.rand(30) / 10
            for _, p in ipairs(parts) do
              if p.ctl then
                if p.tag == 'eye' or p.tag == 'eyeHi' or p.tag == 'eyeWhite' or p.tag == 'pupil' then
                  T.tryCall(p.ctl, 'SetAnchoredPosition', (cx + p.lx * s) * T.S, (cy + (p.ly + bob) * s) * T.S)
                elseif p.tag == 'blinkLine' then
                  T.setPos(p.ctl, -100000, 0)
                end
              end
            end
          end
        end
      end
    end)
  end
  return parts
end

T.portraitCard = function(cx, cy, w, h, ch, opts)
  opts = opts or {}
  local parts = T.card(cx, cy, w, h, {
    radius = opts.radius or 20, fill = opts.fill or T.th.panel2,
    border = opts.border or T.th.cardBorder, hi = opts.hi,
  })
  T.img(cx, cy + h * 0.14, w * 0.62, w * 0.62, 'circle', T.withA(ch.hair3, 22))
  T.img(cx, cy + h * 0.14, w * 0.40, w * 0.40, 'circle', T.withA(T.P.white, 18))
  T.portrait(ch, cx, cy + h * 0.32, (opts.scale or 0.58) * (h / 470), { idle = opts.idle, mood = opts.mood })
  return parts
end

-- ---------------------------------------------------------------------------
-- 敌人
-- ---------------------------------------------------------------------------
T.enemyArt = function(kind, x, y, s, opts)
  opts = opts or {}
  s = s or 1
  local body = T.P.ice2
  if kind == 'slime' then
    T.img(x, y - 10 * s, 92 * s, 64 * s, 'circle', T.withA(T.P.deep, 60))
    T.img(x, y, 88 * s, 64 * s, 'circle', body)
    T.img(x, y + 12 * s, 62 * s, 26 * s, 'circle', T.mix(body, T.P.white, 0.35))
    -- 背部冰刺
    T.img(x - 26 * s, y + 20 * s, 12 * s, 30 * s, 'triangle', T.withA(T.P.white, 170), -16)
    T.img(x + 4 * s, y + 26 * s, 10 * s, 24 * s, 'triangle', T.withA(T.P.white, 150), 6)
    -- 眼睛 / 嘴
    T.img(x - 18 * s, y + 2 * s, 12 * s, 15 * s, 'circle', T.INK)
    T.img(x + 16 * s, y + 2 * s, 12 * s, 15 * s, 'circle', T.INK)
    T.img(x - 21 * s, y + 6 * s, 3.4 * s, 3.4 * s, 'circle', T.P.white)
    T.img(x + 13 * s, y + 6 * s, 3.4 * s, 3.4 * s, 'circle', T.P.white)
    T.img(x, y - 12 * s, 16 * s, 5 * s, 'circle', T.withA(T.P.ink, 120))
    T.img(x + 30 * s, y - 20 * s, 14 * s, 14 * s, 'fourstar', T.withA(T.P.white, 160))
  elseif kind == 'fly' then
    T.img(x - 26 * s, y + 10 * s, 44 * s, 30 * s, 'circle', T.withA(T.P.white, 170), 24)
    T.img(x + 26 * s, y + 10 * s, 44 * s, 30 * s, 'circle', T.withA(T.P.white, 170), -24)
    T.img(x - 26 * s, y + 10 * s, 36 * s, 22 * s, 'circle', body, 24)
    T.img(x + 26 * s, y + 10 * s, 36 * s, 22 * s, 'circle', body, -24)
    T.img(x, y, 16 * s, 44 * s, 'circle', T.P.ink)
    T.img(x, y + 18 * s, 14 * s, 10 * s, 'circle', T.withA(T.P.ice3, 230))
    T.img(x - 4 * s, y + 12 * s, 3 * s, 4 * s, 'circle', T.P.white)
    T.img(x + 4 * s, y + 12 * s, 3 * s, 4 * s, 'circle', T.P.white)
  elseif kind == 'guard' then
    T.img(x, y - 6 * s, 62 * s, 76 * s, 'rect', T.P.ice4)
    T.img(x, y + 34 * s, 48 * s, 44 * s, 'rect', T.P.ice2)
    T.img(x, y + 32 * s, 26 * s, 6 * s, 'rect', T.withA(T.P.ink, 200))
    T.img(x - 24 * s, y - 4 * s, 12 * s, 40 * s, 'rect', T.P.gold, 0)
    T.img(x + 24 * s, y - 4 * s, 12 * s, 40 * s, 'rect', T.P.gold, 0)
    T.img(x, y - 2 * s, 22 * s, 22 * s, 'fourstar', T.P.goldPale)
    T.img(x - 40 * s, y - 10 * s, 22 * s, 54 * s, 'rect', T.P.ice5, 8)
    T.img(x + 40 * s, y - 10 * s, 22 * s, 54 * s, 'rect', T.P.ice5, -8)
  elseif kind == 'boss' then
    T.img(x, y + 6 * s, 140 * s, 140 * s, 'circle', T.withA(T.P.violet2, 60))
    T.img(x, y, 112 * s, 112 * s, 'circle', T.P.deep)
    T.img(x, y + 4 * s, 84 * s, 84 * s, 'circle', T.P.ice5)
    T.img(x - 42 * s, y + 46 * s, 34 * s, 52 * s, 'triangle', T.P.gold, -22)
    T.img(x + 42 * s, y + 46 * s, 34 * s, 52 * s, 'triangle', T.P.gold, 22)
    T.img(x - 24 * s, y + 14 * s, 20 * s, 26 * s, 'circle', T.P.ice2)
    T.img(x + 24 * s, y + 14 * s, 20 * s, 26 * s, 'circle', T.P.ice2)
    T.img(x - 24 * s, y + 12 * s, 9 * s, 12 * s, 'circle', T.INK)
    T.img(x + 24 * s, y + 12 * s, 9 * s, 12 * s, 'circle', T.INK)
    T.img(x, y - 30 * s, 40 * s, 12 * s, 'rect', T.withA(T.P.ink, 190))
    T.img(x, y + 4 * s, 30 * s, 30 * s, 'fourstar', T.withA(T.P.gold, 220))
    for i = 0, 5 do
      local a = i / 6 * math.pi * 2
      T.img(x + math.cos(a) * 66 * s, y + math.sin(a) * 66 * s, 10 * s, 10 * s, 'fourstar', T.withA(T.P.ice3, 200))
    end
  end
end

-- ---------------------------------------------------------------------------
-- 卡面小景
-- ---------------------------------------------------------------------------
T.stageArt = function(cx, cy, w, h, stage, opts)
  opts = opts or {}
  local sc = math.min(w / 320, h / 150)
  local warm = stage and stage.chapter == 2
  -- 天空（黄昏/夜，独立于页面主题，保证在浅底深底上都立得住）
  local top = warm and T.C(255, 58, 48, 84) or T.C(255, 34, 56, 92)
  local mid = warm and T.C(255, 106, 78, 116) or T.C(255, 62, 96, 132)
  local bot = warm and T.C(255, 196, 150, 166) or T.C(255, 150, 186, 210)
  local bands = 6
  for i = 1, bands do
    local t = (i - 0.5) / bands
    local col = (t < 0.55) and T.mix(top, mid, t / 0.55) or T.mix(mid, bot, (t - 0.55) / 0.45)
    T.img(cx, cy + h * 0.5 - (i - 0.5) * (h / bands), w, h / bands + 1, 'rect', col)
  end
  -- 月 / 落日光
  local mx, my = cx + w * 0.3, cy + h * 0.22
  T.img(mx, my, 54 * sc, 54 * sc, 'circle', T.withA(T.P.white, 60))
  T.img(mx, my, 30 * sc, 30 * sc, 'circle', T.C(255, 252, 246, 255))
  -- 远山
  T.peak(cx - w * 0.2, cy + h * 0.12, w * 0.72, h * 0.42, T.mix(bot, T.P.white, 0.35),
    { cap = T.mix(bot, T.P.white, 0.75), capRatio = 0.2 })
  T.peak(cx + w * 0.24, cy + h * 0.04, w * 0.62, h * 0.36, T.mix(bot, T.P.deep, 0.16),
    { cap = T.mix(bot, T.P.white, 0.6), capRatio = 0.18 })
  -- 近景雪地
  T.img(cx, cy - h * 0.46, w * 0.98, h * 0.42, 'circle', T.C(255, 236, 246, 253))
  -- 雪松
  local px = cx - w * 0.34
  for i = 0, 2 do
    T.pine(px + i * w * 0.1, cy - h * 0.22, 0.55 * sc, T.C(255, 30, 46, 66), T.C(255, 210, 234, 246))
  end
  -- 路径与目标
  if stage then
    for i = 1, 5 do
      local t = (i - 1) / 4
      T.img(cx + w * 0.02 + t * w * 0.26, cy - h * 0.3 + math.sin(t * math.pi) * h * 0.08, 4 * sc, 4 * sc,
        'circle', T.withA(T.P.goldPale, 190))
    end
    local gx = cx + w * 0.3
    T.img(gx, cy - h * 0.24, 12 * sc, 34 * sc, 'rect', T.withA(T.P.goldPale, 200))
    T.img(gx + 10 * sc, cy - h * 0.1, 20 * sc, 14 * sc, 'triangle', T.P.danger, 90)
  end
  -- 飘雪
  for i = 1, 8 do
    local x = cx + (T.rand(1000) / 1000 - 0.5) * w * 0.9
    local y = cy + (T.rand(1000) / 1000 - 0.5) * h * 0.8
    T.img(x, y, (1.6 + T.rand(3)) * sc, (1.6 + T.rand(3)) * sc, 'circle', T.withA(T.P.white, 150))
  end
end

-- 大冰晶 / 弓 / 圣遗物
T.crystalArt = function(cx, cy, s, color)
  local c = color or T.P.ice3
  T.img(cx, cy + 20 * s, 78 * s, 78 * s, 'circle', T.withA(c, 26))
  T.img(cx, cy, 26 * s, 96 * s, 'triangle', c, 0)
  T.img(cx, cy - 46 * s, 26 * s, 46 * s, 'triangle', T.mix(c, T.P.white, 0.35), 0)
  T.img(cx + 26 * s, cy - 6 * s, 18 * s, 52 * s, 'triangle', T.mix(c, T.P.white, 0.5), 18)
  T.img(cx - 26 * s, cy - 10 * s, 16 * s, 44 * s, 'triangle', T.mix(c, T.P.deep, 0.18), -18)
  T.img(cx, cy + 16 * s, 6 * s, 34 * s, 'rect', T.withA(T.P.white, 150))
end

T.weaponArt = function(cx, cy, s, color)
  local c = color or T.P.gold
  T.img(cx, cy, 120 * s, 190 * s, 'ring', c)
  T.img(cx - 58 * s, cy, 30 * s, 130 * s, 'rect', T.th.panel2, 0)
  T.img(cx + 58 * s, cy, 30 * s, 130 * s, 'rect', T.th.panel2, 0)
  T.img(cx, cy, 4 * s, 168 * s, 'rect', T.withA(T.P.white, 160))
  T.img(cx, cy, 16 * s, 118 * s, 'rect', T.P.deep)
  T.img(cx, cy - 78 * s, 10 * s, 10 * s, 'fourstar', T.P.goldPale)
  T.img(cx, cy + 78 * s, 10 * s, 10 * s, 'fourstar', T.P.goldPale)
end

T.artifactArt = function(kind, cx, cy, s, color)
  local c = color or T.P.ice3
  if kind == 'flower' or kind == 'bloom' then
    T.flower(cx, cy, 26 * s, c, T.P.white)
    T.img(cx, cy, 14 * s, 14 * s, 'circle', T.withA(T.P.gold, 200))
  elseif kind == 'plume' then
    T.img(cx, cy, 18 * s, 96 * s, 'rect', c, 18)
    T.img(cx - 16 * s, cy, 14 * s, 60 * s, 'rect', T.mix(c, T.P.white, 0.3), 42)
    T.img(cx + 14 * s, cy, 12 * s, 50 * s, 'rect', T.mix(c, T.P.white, 0.2), -6)
  elseif kind == 'hourglass' then
    T.img(cx, cy + 26 * s, 56 * s, 40 * s, 'triangle', c, 180)
    T.img(cx, cy - 26 * s, 56 * s, 40 * s, 'triangle', c, 0)
    T.img(cx, cy, 64 * s, 6 * s, 'rect', T.P.gold)
    T.img(cx, cy, 50 * s, 8 * s, 'rect', T.withA(T.P.white, 180))
  elseif kind == 'bow' then
    T.weaponArt(cx, cy, s * 0.9, c)
  else
    T.crystalArt(cx, cy, s, c)
  end
end

-- ---------------------------------------------------------------------------
-- 统一入口
-- ---------------------------------------------------------------------------
T.pageBg = function(kind, opts)
  opts = opts or {}
  if kind == 'night' then
    T.setTheme('night')
    return T.bgNight(opts)
  elseif kind == 'dusk' then
    T.setTheme('night')
    T.bgGradient(T.C(255, 54, 52, 86), T.C(255, 96, 86, 122), T.C(255, 226, 170, 180))
    T.starfield(22)
    T.moon(T.DESIGN_W * 0.1, -20, 92)
    T.ridge({
      { -560, -120, 380, 240 }, { -180, -60, 340, 260 }, { 220, -140, 300, 200 }, { 540, -80, 360, 260 },
    }, { fill = T.C(255, 74, 62, 92), cap = T.C(255, 236, 220, 232), capRatio = 0.22 })
    T.snowfield(-240, T.C(255, 84, 76, 104))
    return
  end
  T.setTheme('day')
  return T.bgDay(opts)
end

T.frostFrame = function(cx, cy, w, h, opts)
  opts = opts or {}
  local c = opts.color or T.th.border
  local t = opts.thick or 2
  T.img(cx, cy + h / 2, w, t, 'rect', c)
  T.img(cx, cy - h / 2, w, t, 'rect', c)
  T.img(cx - w / 2, cy, t, h, 'rect', c)
  T.img(cx + w / 2, cy, t, h, 'rect', c)
  for _, sx in ipairs({ -1, 1 }) do
    for _, sy in ipairs({ -1, 1 }) do
      T.img(cx + sx * w / 2, cy + sy * h / 2, 10, 10, 'fourstar', opts.mark or T.th.accent2)
    end
  end
end

T.titleFlourish = function(cx, cy, w, color)
  local c = color or T.th.accent2
  T.img(cx, cy, w, 1.2, 'rect', c)
  T.img(cx - w / 2, cy, 7, 7, 'fourstar', c)
  T.img(cx + w / 2, cy, 7, 7, 'fourstar', c)
  T.img(cx, cy, 10, 10, 'fourstar', c)
end


-- 侧向渐隐遮罩（让标题区压在暗底上；用竖条近似，无硬边）
T.sideScrim = function(side, color, alpha, bands)
  bands = bands or 10
  local c = color % 16777216
  local w = T.DESIGN_W / 2 / bands
  for i = 1, bands do
    local k = i / bands
    local a = math.floor(alpha * (1 - k) ^ 1.4)
    local x = (side == 'left') and (-T.DESIGN_W / 2 + (i - 0.5) * w) or (T.DESIGN_W / 2 - (i - 0.5) * w)
    T.img(x, 0, w + 1, T.DESIGN_H, 'rect', T.withA(c, a))
  end
end


-- 弓形光环（甘雨的弓，作标题/画像背景；弧用圆点拼，避免遮挡问题）
T.bowHalo = function(cx, cy, r, color, opts)
  opts = opts or {}
  local c = color or T.P.gold
  local n = 16
  for i = 0, n do
    local a = math.pi * (0.18 + 0.64 * (i / n)) + math.pi * 0.5
    local x = cx + math.cos(a) * r
    local y = cy + math.sin(a) * r * 1.05
    T.img(x, y, 7, 7, 'circle', c)
  end
  -- 弦
  local top = math.pi * 0.5 + math.pi * 0.18
  local bot = math.pi * 0.5 + math.pi * 0.82
  local x1, y1 = cx + math.cos(top) * r, cy + math.sin(top) * r * 1.05
  local x2, y2 = cx + math.cos(bot) * r, cy + math.sin(bot) * r * 1.05
  local len = math.sqrt((x2 - x1) ^ 2 + (y2 - y1) ^ 2)
  local ang = math.deg(math.atan(y2 - y1, x2 - x1))
  T.img((x1 + x2) / 2, (y1 + y2) / 2, 1.6, len, 'rect', T.withA(c, 140), ang)
  if opts.grip ~= false then
    T.img(cx, cy + r * 1.02, 12, 30, 'rect', T.mix(c, T.P.ink, 0.25))
  end
end


-- ===== 30_home.lua =====
-- ============================================================================
-- 页面 1：启动 / 标题 / 主菜单
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

-- ---------------------------------------------------------------- 启动
T.screenFns.boot = function()
  T.pageBg('night', { moonX = 0, moonY = 76, moonR = 128, stars = 64, aurora = true })
  T.snowfall(26, { scale = 0.8 })
  T.snowBank(T.C(255, 108, 154, 184), -346)
  T.screenFrame(T.withA(T.P.goldPale, 54), 16, T.withA(T.P.goldPale, 110))
  local cx = 0
  -- 冰晶徽记
  local markY = 96
  T.img(cx, markY, 190, 190, 'circle', T.withA(T.P.ice3, 16))
  T.img(cx, markY, 150, 150, 'ring', T.withA(T.P.ice2, 70))
  T.snowflake(cx, markY, 66, T.P.ice2, { core = T.P.white })
  T.snowflake(cx, markY, 40, T.withA(T.P.white, 180))
  T.img(cx, markY, 12, 12, 'fourstar', T.P.goldPale)
  -- 标题
  local logoY = -14
  T.logo(cx, logoY, { '霜', '华', '纪' }, 86, 104, T.P.white, { shadow = true, shadowColor = T.C(90, 160, 220, 250) })
  T.titleFlourish(cx, logoY - 72, 300, T.withA(T.P.goldPale, 200))
  T.txt(cx, logoY - 104, 520, 26, 14, 'F R O S T B L O O M', T.P.ice2, 'Middle', 'Middle')
  T.txt(cx, logoY - 134, 560, 26, 14, '甘雨 · 月海亭的守夜人', T.P.ice1, 'Middle', 'Middle')
  -- 进度
  local barY = -196
  T.rrect(0, barY, 380, 6, 3, T.C(90, 160, 210, 240))
  local fill = T.img(-190 + 4, barY, 8, 6, 'rect', T.P.ice3)
  local pctText = T.txt(0, barY - 24, 400, 24, 12, '正在唤醒霜雪… 0%', T.P.ice2, 'Middle', 'Middle')
  local prompt = T.txt(0, barY - 56, 520, 30, 14, '', T.P.goldPale, 'Middle', 'Middle')
  T.txt(0, -318, 620, 22, 11, 'v' .. T.VERSION .. '  ·  BUILD ' .. T.BUILD_ID .. '  ·  千星模拟器 2D UI', T.withA(T.P.ice1, 150), 'Middle', 'Middle')
  -- 装饰角标
  T.txt(-T.DESIGN_W / 2 + 40, 316, 300, 24, 11, 'GANYU  ·  CRYO', T.withA(T.P.ice1, 130), 'Left', 'Middle')
  T.txt(T.DESIGN_W / 2 - 40, 316, 300, 24, 11, 'MIHOYO FAN CONCEPT UI', T.withA(T.P.ice1, 110), 'Right', 'Middle')

  T.bootReady = false
  local w = 380
  T.tween(1.15, function(k)
    T.tryCall(fill, 'SetSizeDelta', math.max(6, w * k) * T.S, 6 * T.S)
    T.tryCall(fill, 'SetAnchoredPosition', (-w / 2 + (w * k) / 2) * T.S, barY * T.S)
    T.setTxt(pctText, '正在唤醒霜雪… ' .. math.floor(k * 100) .. '%')
  end, function()
    T.bootReady = true
    T.setTxt(pctText, '准备就绪')
    T.setTxt(prompt, '点击任意处 · 或按空格进入')
    T.setTxtColor(prompt, T.P.goldPale)
    local scr = T.screen
    scr.key = function(a)
      if a == 'confirm' or a == 'back' then T.go('title') end
    end
  end, T.easeOut)
  -- 提示呼吸
  T.anim(function(dt, t)
    if T.bootReady then
      T.setTxtColor(prompt, T.mix(T.P.goldPale, T.P.white, 0.5 + 0.5 * math.sin(t * 3)))
    end
  end)
  T.screen.key = function(a)
    if a == 'confirm' then T.go('title') end
  end
  T.screen.afterBuild = function()
    T.hit('hit_boot_any', 0, 0, T.DESIGN_W, T.DESIGN_H, {
      clickSfx = false,
      onClick = function() T.log('boot enter ready=' .. tostring(T.bootReady)); T.go('title') end,
    })
  end
end

-- ---------------------------------------------------------------- 标题
T.screenFns.title = function()
  T.pageBg('night', { moonX = 300, moonY = 86, moonR = 138, stars = 58, aurora = false })
  T.sideScrim('left', T.P.night0, 150, 12)
  T.snowfall(30, {})
  -- 立绘（月轮作背景光；雪丘在人物之前建，人站在丘上）
  T.glow(300, 92, 186, T.P.ice2, 10, 22)
  T.img(300, -330, 640, 150, 'circle', T.C(255, 130, 172, 200))
  T.img(300, -318, 520, 120, 'circle', T.C(255, 160, 196, 220))
  T.portrait(T.chars[1], 300, 8, 0.84, { idle = true, mood = 'smile' })
  T.img(300, -314, 220, 34, 'circle', T.withA(T.P.ink, 46))
  -- 漂浮冰晶
  for _, p in ipairs({ { 190, 96, 12 }, { 418, 40, 9 }, { 452, 168, 7 }, { 168, -66, 8 } }) do
    T.snowflake(p[1], p[2], p[3], T.withA(T.P.ice1, 150), { core = T.withA(T.P.white, 180) })
  end
  -- 前景冰台
  T.img(300, -352, 480, 54, 'circle', T.C(255, 196, 226, 240))
  T.iceShardCluster(150, -336, 0.95, T.C(255, 214, 240, 252))
  T.iceShardCluster(470, -340, 0.8, T.C(255, 200, 232, 248))
  -- 前景飘雪（覆在人身上，制造纵深）
  T.snowfall(10, { scale = 1.5 })

  -- 标题
  T.logo(-306, 118, { '霜', '华', '纪' }, 104, 116, T.P.white,
    { shadow = true, shadowColor = T.C(140, 120, 200, 250) })
  T.titleFlourish(-306, 44, 348, T.P.goldPale)
  T.txt(-300, 16, 520, 26, 14, 'F R O S T B L O O M', T.P.ice2, 'Middle', 'Middle')
  T.txt(-300, -14, 560, 28, 15, '甘雨 · 月海亭的守夜人', T.P.ice1, 'Middle', 'Middle')
  T.txt(-300, -46, 620, 26, 12, '冰雪 · 射击 · 关卡 · 养成 · 清新', T.withA(T.P.ice2, 200), 'Middle', 'Middle')
  T.rrect(-300, 214, 204, 28, 14, T.C(255, 30, 58, 80))
  T.rrect(-300, 214, 198, 24, 12, T.C(255, 14, 34, 50))
  T.txt(-300, 214, 190, 22, 11, '序章 · 月海亭的灯', T.P.goldPale, 'Middle', 'Middle')

  -- 开始
  local btnY = -112
  local fill = T.rrect(-306, btnY, 306, 62, 31, T.P.gold)
  T.rrect(-306, btnY, 296, 52, 26, T.mix(T.P.goldPale, T.P.gold, 0.35))
  local label = T.txt(-306, btnY + 2, 280, 40, 24, '进 入 霜 华', T.C(255, 44, 62, 74), 'Middle', 'Middle')
  local sub = T.txt(-306, btnY - 48, 300, 24, 12, '点击开始 · 空格确认', T.withA(T.P.ice1, 180), 'Middle', 'Middle')
  local startItem = T.item({
    x = -306, y = btnY, w = 306, h = 62, name = 'hit_start', focusPad = 8,
    onConfirm = function() T.go('menu') end,
    onFocus = function(on)
      T.tint(fill, on and T.P.white or T.P.gold)
      T.setTxtColor(label, on and T.C(255, 30, 60, 88) or T.C(255, 44, 62, 74))
      T.setTxtColor(sub, on and T.P.goldPale or T.withA(T.P.ice1, 180))
    end,
  })
  -- 次级入口
  local sx = -430
  local settingsTxt = T.txt(sx, -252, 120, 30, 13, '设置', T.withA(T.P.ice1, 200), 'Middle', 'Middle')
  T.item({ x = sx, y = -252, w = 120, h = 34, name = 'hit_title_settings', focusPad = 4,
    onConfirm = function() T.go('settings') end,
    onFocus = function(on) T.setTxtColor(settingsTxt, on and T.P.goldPale or T.withA(T.P.ice1, 200)) end })
  local creditsTxt = T.txt(sx + 118, -252, 140, 30, 13, '制作名单', T.withA(T.P.ice1, 200), 'Middle', 'Middle')
  T.item({ x = sx + 118, y = -252, w = 140, h = 34, name = 'hit_title_credits', focusPad = 4,
    onConfirm = function() T.go('credits') end,
    onFocus = function(on) T.setTxtColor(creditsTxt, on and T.P.goldPale or T.withA(T.P.ice1, 200)) end })
  local helpTxt = T.txt(sx + 244, -252, 120, 30, 13, '玩法说明', T.withA(T.P.ice1, 200), 'Middle', 'Middle')
  T.item({ x = sx + 244, y = -252, w = 120, h = 34, name = 'hit_title_help', focusPad = 4,
    onConfirm = function() T.openHelp('title') end,
    onFocus = function(on) T.setTxtColor(helpTxt, on and T.P.goldPale or T.withA(T.P.ice1, 200)) end })

  -- 右上角版本 / 左下角提示
  T.txt(T.DESIGN_W / 2 - 44, 320, 340, 22, 11, 'v' .. T.VERSION .. '  ·  ' .. T.BUILD_ID, T.withA(T.P.ice1, 120), 'Right', 'Middle')
  T.txt(-T.DESIGN_W / 2 + 44, -314, 460, 22, 11, '一个关于雪、契约与归途的故事', T.withA(T.P.ice1, 120), 'Left', 'Middle')
  T.txt(T.DESIGN_W / 2 - 44, -314, 460, 22, 11, '方向键选择 · 空格确认 · H 帮助', T.withA(T.P.ice1, 120), 'Right', 'Middle')

  local screen = T.screen
  screen.key = function(a)
    if a == 'confirm' then T.go('menu')
    elseif a == 'back' then T.openConfirm('离开霜华纪？', '当前进度会保留在本次会话中。', function() T.log('title leave') end)
    end
  end
end

-- ---------------------------------------------------------------- 主菜单
T.screenFns.menu = function()
  T.pageBg('day', { sunX = 360, sunY = 176 })
  T.snowfall(16, { color = T.P.white, scale = 0.8 })
  T.snowBank(T.C(255, 250, 254, 255), -T.H * 0.42)

  -- 顶栏
  T.img(0, 336, T.DESIGN_W + 40, 52, 'rect', T.withA(T.P.white, 120))
  T.img(0, 311, T.DESIGN_W + 40, 1.4, 'rect', T.withA(T.P.ice4, 60))
  T.txt(-T.DESIGN_W / 2 + T.M, 336, 240, 40, 22, '霜华纪', T.th.text, 'Left', 'Middle')
  T.txt(-T.DESIGN_W / 2 + T.M + 86, 336, 200, 30, 11, 'FROSTBLOOM', T.th.text3, 'Left', 'Middle')
  -- 玩家
  local avX = T.DESIGN_W / 2 - 392
  T.img(avX, 336, 38, 38, 'circle', T.th.accentSoft)
  T.portraitHead(avX, 338, 0.30, T.chars[1])
  T.txt(avX + 30, 344, 120, 22, 13, '旅行者', T.th.text, 'Left', 'Middle')
  T.txt(avX + 30, 326, 120, 20, 10, 'Lv.' .. T.records.level .. ' · 璃月', T.th.text3, 'Left', 'Middle')
  T.resChip(452, 336, 'coin', T.fmt(T.records.mats.mora), { w = 110 })
  T.resChip(568, 336, 'crystal', T.fmt(T.records.mats.crystal), { w = 104, color = T.P.ice4 })

  -- 左侧立绘区
  local px, py = -366, -6
  T.glow(px, py + 60, 210, T.P.white, 8, 40)
  T.txt(px, py + 30, 420, 180, 128, 'GANYU', T.withA(T.P.ice4, 20), 'Middle', 'Middle')
  T.img(px, py + 40, 440, 440, 'ring', T.withA(T.ice4 and T.P.ice4 or T.P.ice4, 70))
  T.img(px, py + 40, 412, 412, 'ring', T.withA(T.th.border, 120))
  for i = 0, 5 do
    local a = math.pi * (i / 6) - math.pi / 2
    T.img(px + math.cos(a) * 206, py + 40 + math.sin(a) * 206, 12, 12, 'fourstar', T.withA(T.P.ice4, 170))
  end
  T.img(px, -318, 400, 96, 'circle', T.C(255, 240, 249, 255))
  T.portrait(T.chars[1], px, py + 88, 0.90, { idle = true })
  T.img(px, -330, 320, 64, 'circle', T.C(255, 250, 254, 255))
  T.img(px, -300, 200, 22, 'circle', T.withA(T.P.ink, 28))
  -- 雪丘
  T.img(px - 40, py - 176, 320, 96, 'circle', T.C(255, 252, 255, 255))
  T.img(px + 76, py - 188, 250, 86, 'circle', T.C(255, 250, 254, 255))
  -- 名牌
  local nameY = -262
  T.rrect(px, nameY, 324, 68, 18, T.th.border)
  T.rrect(px, nameY, 318, 62, 16, T.th.panel)
  T.img(px - 140, nameY, 4, 40, 'rect', T.th.accent2)
  T.txt(px - 118, nameY + 12, 150, 34, 24, '甘雨', T.th.text, 'Left', 'Middle')
  T.txt(px - 118, nameY - 14, 170, 22, 11, 'GANYU · 冰 · 弓', T.th.text2, 'Left', 'Middle')
  T.txt(px + 128, nameY + 10, 60, 24, 13, 'Lv.' .. T.records.level, T.th.text2, 'Right', 'Middle')
  T.segBar(px + 62, nameY - 12, 130, 5, 8, 12, T.th.accent)

  -- 右侧菜单卡片
  local defs = {
    { '冒险', '霜原关卡 · 霜华试炼', 'map', T.P.ice4, function() T.go('map') end },
    { '养成', '等级 · 天赋 · 命之座', 'const', T.P.violet2, function() T.go('growth') end },
    { '图鉴', '敌人 · 装备 · 材料', 'book', T.P.mint, function() T.go('codex', { tab = 1 }) end },
    { '设置', '声音 · 动效 · 画质', 'gear', T.P.ink2, function() T.go('settings') end },
    { '制作名单', '霜华纪制作组', 'feather', T.P.gold2, function() T.go('credits') end },
  }
  local cardX, startY, gap = 246, 206, 90
  local cards = {}
  for i, d in ipairs(defs) do
    local y = startY - (i - 1) * gap
    local w, h = 512, 76
    local sh = T.rrect(cardX + 4, y - 6, w, h, 18, T.withA(T.P.ink, 16))
    local bd = T.rrect(cardX, y, w, h, 18, T.withA(T.P.ice4, 60))
    local pn = T.rrect(cardX, y, w - 3, h - 3, 17, T.withA(T.P.white, 232))
    local idx = T.txt(cardX - 232, y + 2, 54, 40, 20, '0' .. i, T.withA(T.P.ice4, 150), 'Middle', 'Middle')
    local iconBg = T.img(cardX - 190, y, 46, 46, 'circle', T.withA(d[4], 26))
    local iconRing = T.img(cardX - 190, y, 44, 44, 'ring', T.withA(d[4], 90))
    local ic = T.icon(d[3], cardX - 190, y, 11, d[4])
    local title = T.txt(cardX - 154, y + 14, 220, 34, 22, d[1], T.th.text, 'Left', 'Middle')
    local subtitle = T.txt(cardX - 154, y - 13, 300, 24, 12, d[2], T.th.text2, 'Left', 'Middle')
    local chev = {}; T.spread(chev, {}) ; T.chevron(cardX + 220, y, 16, T.withA(T.P.ice4, 150))
    local moved = {}
    T.spread(moved, sh); T.spread(moved, bd); T.spread(moved, pn)
    moved[#moved + 1] = idx; moved[#moved + 1] = iconBg; moved[#moved + 1] = iconRing
    moved[#moved + 1] = ic; moved[#moved + 1] = title; moved[#moved + 1] = subtitle; moved[#moved + 1] = chev
    local basePos = {}
    for j = 1, #moved do
      local p = T.pos[moved[j]]
      if p then basePos[j] = { p.x, p.y } end
    end
    local function shift(dx)
      for j = 1, #moved do
        local bp = basePos[j]
        if bp then T.tryCall(moved[j], 'SetAnchoredPosition', (bp[1] + dx) * T.S, bp[2] * T.S) end
      end
    end
    local cardItem
    cardItem = T.item({
      x = cardX, y = y, w = w, h = h, name = 'hit_menu_' .. i, focusPad = 4,
      onConfirm = d[5],
      onFocus = function(on)
        cardItem.offY = on and 4 or 0
        T.updateFocusFrame()
        T.tint(pn, on and T.P.white or T.withA(T.P.white, 232))
        T.tint(bd, on and d[4] or T.withA(T.P.ice4, 60))
        T.setTxtColor(title, on and d[4] or T.th.text)
        T.setTxtColor(idx, on and d[4] or T.withA(T.P.ice4, 150))
        T.tint(chev, on and d[4] or T.withA(T.P.ice4, 150))
      end,
    })
  end

  -- 底部提示
  T.txt(0, -296, 900, 24, 12, '今日提示：' .. T.TIPS[1], T.th.text2, 'Middle', 'Middle')
  T.footer({ { key = '↑↓', label = '选择' }, { key = '空格', label = '确认' }, { key = 'H', label = '帮助' }, { key = 'Q', label = '返回标题' } })

  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('title') end
  end
  -- 入场：卡片错落
  for i = 1, #cards do
    local it = cards[i]
    local base = it.y
    T.after(0.05 + i * 0.04, function()
      T.tween(0.34, function(k)
        if it.offX == nil then it.offX = 0 end
      end, nil, T.easeOut, true)
    end, true)
  end
end


-- ===== 32_quest.lua =====
-- ============================================================================
-- 页面 2：关卡地图 / 出战准备
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

-- ---------------------------------------------------------------- 关卡地图
T.mapNode = function(x, y, d, stage, state, selected, chapterColor)
  -- state: 'locked' | 'open' | 'clear'
  local col = chapterColor or T.th.accent
  local parts = {}
  if selected then
    T.img(x, y, d + 46, d + 46, 'circle', T.withA(col, 34))
    T.img(x, y, d + 26, d + 26, 'ring', T.withA(col, 150))
  end
  local outer = T.img(x, y, d + 8, d + 8, 'circle', state == 'locked' and T.th.line or col)
  local inner = T.img(x, y, d, d, 'circle', T.th.panel)
  local inner2 = T.img(x, y, d - 12, d - 12, 'circle', state == 'locked' and T.th.slotBg or T.th.panel2)
  local label
  if state == 'locked' then
    T.icon('lock', x, y, 13, T.th.text3)
  else
    label = T.txt(x, y + 2, d - 16, d - 30, 26, tostring(stage.id), T.th.text, 'Middle', 'Middle')
    if state == 'clear' then
      T.img(x + d * 0.34, y - d * 0.34, 22, 22, 'circle', T.th.accent2)
      T.icon('check', x + d * 0.34, y - d * 0.34, 7, T.th.onAccent)
    end
  end
  return { outer = outer, inner = inner, inner2 = inner2, label = label, col = col }
end

T.screenFns.map = function(params)
  params = params or {}
  local chapter = params.chapter or 1
  local sel = params.sel or 1
  T.pageBg('day', { sunX = 420, sunY = 190 })
  T.screenFrame(T.withA(T.th.border, 90), 16, T.withA(T.th.accent2, 90))
  T.snowfall(10, { scale = 0.7 })

  local ch = T.chapters[chapter]
  T.header('霜原', '沿着雪线，把每一道风都走一遍', { right = ch.sub })
  T.backBtn(function() T.go('menu') end)
  local tabNames = {}
  for i, c in ipairs(T.chapters) do tabNames[i] = c.name end
  T.tabs(-30, 232, 420, tabNames, chapter, function(i) T.go('map', { chapter = i, sel = 1 }) end,
    { namePrefix = 'hit_map_chapter_' })

  -- 章节信息
  T.txt(-T.DESIGN_W / 2 + T.M, 198, 380, 30, 19, ch.name, T.th.text, 'Left', 'Middle')
  T.txt(-T.DESIGN_W / 2 + T.M, 172, 400, 22, 11, ch.desc, T.th.text2, 'Left', 'Middle')
  local starTotal = 0
  for _, st in ipairs(T.stages) do
    if st.chapter == chapter then starTotal = starTotal + (T.records.stars[st.id] or 0) end
  end
  T.chip(-T.DESIGN_W / 2 + T.M + 34, 140, '★ ' .. starTotal .. ' / 9', T.th.accent2, { fill = T.th.accentSoft, minW = 84 })

  -- 地图面板
  local px, py, pw, ph = -150, -76, 764, 372
  T.card(px, py, pw, ph, { radius = 22, fill = T.th.panel, border = T.th.cardBorder })
  T.img(px, py + ph / 2 - 40, pw - 60, 1.2, 'rect', T.th.line)
  T.txt(px - pw / 2 + 26, py + ph / 2 - 40, 240, 24, 12, '璃月 · 霜原', T.th.text3, 'Left', 'Middle')
  T.txt(px + pw / 2 - 26, py + ph / 2 - 40, 240, 24, 12, '点击节点查看关卡', T.th.text3, 'Right', 'Middle')

  local stages = {}
  for _, st in ipairs(T.stages) do
    if st.chapter == chapter then stages[#stages + 1] = st end
  end
  local pos = { { -400, 2 }, { -160, 56 }, { 80, -22 } }
  local function drawPath(a, b, bright)
    local n = 12
    for i = 1, n do
      local t = (i - 0.5) / n
      local dx = a[1] + (b[1] - a[1]) * t
      local dy = a[2] + (b[2] - a[2]) * t + math.sin(t * math.pi) * 20
      T.img(dx, dy, bright and 5 or 4, bright and 5 or 4, 'circle',
        bright and T.withA(T.th.accent2, 200) or T.withA(T.th.border, 160))
    end
  end
  for i = 1, #pos - 1 do
    local st = stages[i]
    local done = st and (T.records.stars[st.id] or 0) > 0
    drawPath(pos[i], pos[i + 1], done)
  end
  for i, st in ipairs(stages) do
    local p = pos[i]
    local state = 'open'
    if st.locked and not T.records.unlocked[st.id] then state = 'locked' end
    if (T.records.stars[st.id] or 0) > 0 then state = 'clear' end
    local n = T.mapNode(p[1], p[2], 80, st, state, (i == sel), ch.color)
    T.txt(p[1], p[2] - 64, 220, 26, 15, st.name, T.th.text, 'Middle', 'Middle')
    T.txt(p[1], p[2] - 84, 200, 20, 11, st.code .. ' · 推荐 ' .. st.rec, T.th.text3, 'Middle', 'Middle')
    T.star3(p[1], p[2] + 58, T.records.stars[st.id] or 0, 14, { empty = T.th.line })
    T.item({
      x = p[1], y = p[2], w = 108, h = 108, name = 'hit_map_stage_' .. i, focusPad = 8,
      onConfirm = function()
        if state == 'locked' then
          T.log('map locked stage=' .. st.id)
          T.sfx(T.SFX.error, true)
          T.toast('关卡尚未解锁 · 先完成上一关', T.th.text2)
        else
          T.sfx(T.SFX.tab)
          T.go('map', { chapter = chapter, sel = i })
        end
      end,
      onFocus = function(on)
        T.setColor(n.outer, on and T.th.accent2 or (state == 'locked' and T.th.line or ch.color))
      end,
    })
  end

  -- 详情卡
  local st = stages[sel] or stages[1]
  local state = 'open'
  if st.locked and not T.records.unlocked[st.id] then state = 'locked' end
  local cx, cy, w, h = 424, 0, 388, 500
  T.card(cx, cy, w, h, { radius = 20, fill = T.th.card, border = T.th.cardBorder })
  local artY = cy + 170
  T.stageArt(cx, artY, 348, 150, st)
  T.badge(cx - 152, cy + 76, st.code, { fill = T.th.accent, text = T.th.onAccent })
  T.star3(cx + 96, cy + 76, T.records.stars[st.id] or 0, 16)
  T.txt(cx - 152, cy + 46, 300, 34, 24, st.name, T.th.text, 'Left', 'Middle')
  T.txt(cx - 152, cy + 20, 300, 22, 11, st.sub, T.th.text3, 'Left', 'Middle')
  T.divider(cx, cy - 2, 320)
  T.txt(cx - 152, cy - 24, 120, 22, 11, '目标', T.th.text3, 'Left', 'Middle')
  T.txt(cx - 152, cy - 50, 304, 40, 13, st.objective, T.th.text, 'Left', 'Middle')
  T.txt(cx - 152, cy - 90, 120, 22, 11, '来敌', T.th.text3, 'Left', 'Middle')
  local ex = cx - 108
  for _, eid in ipairs(st.enemies) do
    local e = T.enemies[eid]
    if e then
      T.rrect(ex + 32, cy - 90, 66, 24, 12, T.th.accentSoft)
      T.txt(ex + 32, cy - 90, 60, 20, 11, e.name, T.th.text2, 'Middle', 'Middle')
      ex = ex + 72
    end
  end
  T.txt(cx - 152, cy - 122, 120, 22, 11, '奖励', T.th.text3, 'Left', 'Middle')
  for i, rw in ipairs(st.reward) do
    local yy = cy - 146 - (i - 1) * 22
    T.icon(i == 1 and 'coin' or (i == 2 and 'book' or 'crystal'), cx - 140, yy, 7, T.th.accent2)
    T.txt(cx - 122, yy, 280, 22, 12, rw, T.th.text2, 'Left', 'Middle')
  end
  T.txt(cx - 152, cy - 222, 140, 22, 11, '最佳 ' .. T.fmt(T.records.best[st.id] or 0), T.th.text3, 'Left', 'Middle')
  local btnLabel = (state == 'locked') and '尚未解锁' or '开始挑战'
  T.button(cx + 58, cy - 222, 196, 46, btnLabel, function()
    if state == 'locked' then
      T.sfx(T.SFX.error, true)
      T.toast('关卡尚未解锁 · 先完成上一关', T.th.text2)
      return
    end
    T.go('prepare', { stage = st.id })
  end, { kind = (state == 'locked') and 'secondary' or 'primary', name = 'hit_map_start' })

  T.footer({ { key = '←→', label = '选择关卡' }, { key = '空格', label = '查看' }, { key = 'Q', label = '返回' } })
  T.txt(0, -302, 720, 22, 11, '「沿着雪线走，你会遇到一些还没有名字的风。」', T.th.text3, 'Middle', 'Middle')

  local screen = T.screen
  screen.key = function(a)
    if a == 'left' or a == 'right' then
      if (T.focus or 0) <= 2 then
        local n = (a == 'right') and 1 or -1
        local t = chapter + n
        if t < 1 then t = #T.chapters end
        if t > #T.chapters then t = 1 end
        T.go('map', { chapter = t, sel = 1 })
      else
        T.moveFocus(-1, 0)
      end
    elseif a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('menu') end
  end
  T.screen.defaultFocus = sel
  T.screen.afterBuild = function() T.setFocus(sel, true) end
  T.log('map chapter=' .. chapter .. ' sel=' .. sel .. ' stage=' .. st.id .. ' state=' .. state)
end

-- ---------------------------------------------------------------- 出战准备
T.screenFns.prepare = function(params)
  params = params or {}
  local stage = T.stageById[params.stage or 1] or T.stages[1]
  T.pageBg('night', { moonX = -420, moonY = 170, moonR = 96, stars = 40, aurora = false })
  T.snowfall(16, {})
  T.snowBank(T.C(255, 26, 62, 86), -352)
  T.header('出战准备', stage.code .. ' · ' .. stage.name, { right = '推荐等级 ' .. stage.rec })
  T.backBtn(function() T.go('map', { chapter = stage.chapter, sel = ((stage.id - 1) % 3) + 1 }) end)

  -- 左：甘雨立绘
  local lx, ly = -390, 6
  T.glow(lx, ly + 40, 190, T.P.ice2, 8, 20)
  T.card(lx, ly, 380, 500, { radius = 20, fill = T.th.panel, border = T.th.cardBorder })
  T.drift(lx, -190, 300, 92, T.C(255, 46, 96, 126))
  T.portrait(T.chars[1], lx, 46, 0.68, { idle = true })
  T.txt(lx - 150, -120, 160, 30, 22, '甘雨', T.th.text, 'Left', 'Middle')
  T.txt(lx - 150, -144, 200, 20, 11, 'Lv.' .. T.records.level .. ' · 冰 · 弓', T.th.text2, 'Left', 'Middle')
  T.chip(lx + 96, -120, '主控', T.th.accent2, { fill = T.th.accentSoft })

  -- 中：队伍 + 装备
  local mx = 10
  T.sectionLabel(mx - 250, 248, '出战队伍', { w = 260, right = '元素共鸣 · 双冰', rightX = mx + 200 })
  local team = { { 1, '主控' }, { 2, '支援' }, { 3, '支援' } }
  for i, t in ipairs(team) do
    local cx = mx - 180 + (i - 1) * 150
    local ch = T.charById[t[1]]
    local parts = T.card(cx, 172, 138, 132, { radius = 14, fill = i == 1 and T.th.panelHi or T.th.panel, border = i == 1 and T.th.accent or T.th.cardBorder })
    T.portraitHead(cx, 196, 0.44, ch)
    T.txt(cx, 138, 120, 24, 13, ch.name, T.th.text, 'Middle', 'Middle')
    T.txt(cx, 120, 120, 20, 10, t[2] .. ' · ' .. ch.element, T.th.text3, 'Middle', 'Middle')
    T.item({
      x = cx, y = 172, w = 138, h = 132, name = 'hit_prepare_team_' .. i, focusPad = 4,
      onConfirm = function()
        if i == 1 then
          T.toast('甘雨已就位 · 霜华矢随时可以拉开', T.th.accent2)
        else
          T.sfx(T.SFX.error, true)
          T.toast(ch.name .. ' 将在后续版本加入出战', T.th.text2)
        end
      end,
      onFocus = function(on)
        T.tint(parts, on and T.th.panelHi or (i == 1 and T.th.panelHi or T.th.panel))
      end,
    })
  end

  -- 武器 + 圣遗物
  T.sectionLabel(mx - 250, 62, '装备', { w = 260, right = '战力 12,480', rightX = mx + 200 })
  local wParts = T.card(mx - 60, 4, 380, 84, { radius = 14, fill = T.th.panel, border = T.th.cardBorder })
  T.icon('bow', mx - 208, 8, 13, T.th.accent2)
  T.txt(mx - 182, 16, 220, 26, 15, '阿莫斯之弓', T.th.text, 'Left', 'Middle')
  T.txt(mx - 182, -8, 240, 20, 11, 'Lv.60 · 精炼 1 阶 · 攻击力 +49', T.th.text3, 'Left', 'Middle')
  T.chip(mx + 128, 6, '弓', T.th.accent, { fill = T.th.accentSoft })
  T.item({ x = mx - 60, y = 4, w = 380, h = 84, name = 'hit_prepare_weapon', focusPad = 4,
    onConfirm = function() T.toast('武器详情将在「养成」中查看', T.th.text2) end,
    onFocus = function(on) T.tint(wParts, on and T.th.panelHi or T.th.panel) end })

  local artNames = { { 'bloom', '生之花' }, { 'plume', '死之羽' }, { 'hourglass', '时之沙' }, { 'drop', '空之杯' } }
  for i, a in ipairs(artNames) do
    local cx = mx - 196 + (i - 1) * 96
    local slot = T.slot(cx, -86, 86, 86, nil, a[2], { empty = false })
    T.artifactArt(a[1], cx, -78, 0.5, i % 2 == 0 and T.P.ice2 or T.P.ice3)
    T.item({ x = cx, y = -86, w = 86, h = 86, name = 'hit_prepare_art_' .. i, focusPad = 4,
      onConfirm = function() T.toast('圣遗物 · 冰风迷途的勇士（4）', T.th.accent2) end,
      onFocus = function(on) T.tint(slot.ring, on and T.th.accent or T.th.border) end })
  end

  -- 右：关卡情报
  local rx = 428
  T.card(rx, 40, 384, 400, { radius = 20, fill = T.th.panel, border = T.th.cardBorder })
  T.stageArt(rx, 160, 336, 140, stage)
  T.txt(rx - 156, 76, 300, 30, 20, stage.name, T.th.text, 'Left', 'Middle')
  T.txt(rx - 156, 52, 300, 22, 11, stage.objective, T.th.text2, 'Left', 'Middle')
  T.divider(rx, 30, 300)
  T.txt(rx - 156, 6, 300, 24, 12, '来敌', T.th.text3, 'Left', 'Middle')
  for i, eid in ipairs(stage.enemies) do
    local e = T.enemies[eid]
    if e then
      local yy = -22 - (i - 1) * 30
      T.enemyArt(eid, rx - 130, yy, eid == 'boss' and 0.30 or 0.26)
      T.txt(rx - 94, yy + 6, 160, 22, 12, e.name, T.th.text, 'Left', 'Middle')
      T.txt(rx + 146, yy + 6, 60, 20, 10, e.tag, T.th.text3, 'Right', 'Middle')
    end
  end
  T.txt(rx - 156, -116, 300, 22, 11, '霜华纪 · 第 ' .. stage.chapter .. ' 章', T.th.text3, 'Left', 'Middle')
  T.button(rx, -196, 300, 54, '进入战斗', function()
    T.go('battle', { stage = stage.id })
  end, { kind = 'primary', name = 'hit_prepare_start' })
  T.txt(rx, -236, 340, 22, 11, '提示：悬停敌人瞄准，点击射出霜华矢', T.th.text3, 'Middle', 'Middle')

  T.footer({ { key = '↑↓←→', label = '选择' }, { key = '空格', label = '确认' }, { key = 'Q', label = '返回' } })
  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('map', { chapter = stage.chapter, sel = ((stage.id - 1) % 3) + 1 }) end
  end
  T.screen.defaultFocus = #T.items
  T.log('prepare stage=' .. stage.id)
end


-- ===== 34_battle.lua =====
-- ============================================================================
-- 页面 3：战斗（可操作的演示层：悬停瞄准 → 点击射箭 → 命中碎裂 → 波次）
-- 设计口径：数值只服务手感，不做平衡；三波清空即胜利，计时归零即失败。
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

T.BATTLE_WAVES = 3

T.battleEnemyDef = function(id)
  local d = T.enemies[id]
  return {
    id = id, name = d and d.name or id, tag = d and d.tag or '',
    hp = (id == 'boss') and 5 or (id == 'guard' and 3 or 2),
    size = (id == 'boss') and 1.05 or 0.86,
  }
end

T.battle = nil

-- 爆炸碎片（用完自动销毁，必须从 T.controls 摘掉）
T.burst = function(x, y, color, n, scale)
  n = n or 8
  scale = scale or 1
  for i = 1, n do
    local a = (i / n) * math.pi * 2 + T.rand(40) / 40
    local ctl = T.img(x, y, 7 * scale, 16 * scale, 'triangle', color, T.rand(360))
    if ctl then
      local dist = (28 + T.rand(46)) * scale
      local tx, ty = x + math.cos(a) * dist, y + math.sin(a) * dist
      local rot = T.rand(200) - 100
      T.tween(0.42, function(k)
        T.tryCall(ctl, 'SetAnchoredPosition', (x + (tx - x) * k) * T.S, (y + (ty - y) * k - 16 * k) * T.S)
        T.trySet(ctl, 'localRotationZ', rot * k)
        T.trySet(ctl, 'imageColor', T.withA(color % 16777216, math.floor(230 * (1 - k))))
      end, function() T.destroyCtl(ctl) end, T.easeOut)
    end
  end
end

T.battleFloat = function(x, y, text, color, size)
  local b = T.battle
  local seq = 0
  if b then b.floatSeq = ((b.floatSeq or 0) + 1) % 5; seq = b.floatSeq end
  local ox = (seq - 2) * 18
  local oy = (seq % 3) * 10
  local ctl = T.txt(x + ox, y + oy, 160, 34, size or 20, text, color or T.th.accent2, 'Middle', 'Middle',
    { outline = true, outlineColor = T.C(180, 6, 22, 36) })
  if not ctl then return end
  local py = y + oy
  T.tween(0.7, function(k)
    T.tryCall(ctl, 'SetAnchoredPosition', (x + ox) * T.S, (py + 42 * k) * T.S)
    T.trySet(ctl, 'fontColor', T.withA(color % 16777216, math.floor(255 * (1 - k * k))))
  end, function() T.destroyCtl(ctl) end, T.easeOut)
end

T.battleReticleAt = function(x, y, visible)
  local r = T.battle and T.battle.reticle
  if not r then return end
  for i = 1, #r do
    local c = r[i].ctl
    local ox, oy = r[i].ox, r[i].oy
    T.tryCall(c, 'SetAnchoredPosition', (x + (visible and ox or 0)) * T.S, ((visible and y or -1000) + (visible and oy or 0)) * T.S)
  end
end

T.battleSpawnWave = function(n)
  local b = T.battle
  if not b then return end
  b.wave = n
  b.enemies = {}
  local stage = b.stage
  local e1 = stage.enemies[1]
  local e2 = stage.enemies[2]
  local e3 = stage.enemies[3]
  local defs
  local pos
  if n == 1 then
    defs = { e1, e2 }
    pos = { { -250, 76 }, { 210, 108 } }
  elseif n == 2 then
    defs = { e2, e3 }
    pos = { { -300, 96 }, { 250, 64 } }
  else
    defs = { e3, (e3 == 'boss') and e2 or e1 }
    if stage.id == 3 or stage.id == 6 then
      defs = { 'boss', e2 }
      pos = { { 0, 132 }, { 300, 60 } }
    else
      pos = { { -240, 72 }, { 240, 110 } }
    end
  end
  b.totalEnemies = #defs
  for i, id in ipairs(defs) do
    local d = T.battleEnemyDef(id)
    local px, py = pos[i][1], pos[i][2]
    local start = #T.controls + 1
    T.enemyArt(id, px, py, d.size, {})
    local parts = {}
    for k = start, #T.controls do parts[#parts + 1] = T.controls[k] end
    local base = {}
    for _, c in ipairs(parts) do
      local p = T.pos[c]
      if p then base[c] = { p.x, p.y } end
    end
    -- 血条（小圆点）
    local pips = {}
    for k = 1, d.hp do
      local pxp = px - ((d.hp - 1) * 11) / 2 + (k - 1) * 11
      pips[k] = T.img(pxp, py + 62 * d.size, 9, 9, 'circle', T.P.ice2)
    end
    -- 名字
    local nameCtl = T.txt(px, py + 78 * d.size, 200, 22, 11, d.name, T.th.text2, 'Middle', 'Middle')
    local e = {
      i = i, id = id, name = d.name, x = px, y = py, hp = d.hp, maxHp = d.hp,
      size = d.size, parts = parts, base = base, pips = pips, nameCtl = nameCtl, alive = true,
      phase = T.rand(100) / 20,
    }
    b.enemies[i] = e
    e.hit = T.hit('hit_battle_enemy_' .. i, px, py, 120 * d.size, 120 * d.size, {
      clickSfx = false,
      onClick = function() T.battleFire(e) end,
      onEnter = function()
        b.aim = i
        T.battleReticleAt(px, py, true)
        for k, c in ipairs(b.aimLine) do
          local t = k / (#b.aimLine + 1)
          T.tryCall(c, 'SetAnchoredPosition', (-470 + (px + 470) * t) * T.S, (-266 + (py + 266) * t) * T.S)
        end
      end,
      onExit = function()
        if b.aim == i then b.aim = nil end
        T.battleReticleAt(px, py, false)
        for _, c in ipairs(b.aimLine) do T.tryCall(c, 'SetAnchoredPosition', -470 * T.S, -1000 * T.S) end
      end,
    })
  end
  -- 敌人漂浮
  T.anim(function(dt, t)
    if T.overlay and T.overlay.pausesGame then return end
    local bb = T.battle
    if not bb then return false end
    for _, e in ipairs(bb.enemies) do
      if e.alive then
        local bob = math.sin(t * 1.4 + e.phase) * 6
        for _, c in ipairs(e.parts) do
          local p = e.base[c]
          if p then T.tryCall(c, 'SetAnchoredPosition', p[1] * T.S, (p[2] + bob) * T.S) end
        end
      end
    end
  end)
  -- 波次横幅
  local banner = T.txt(0, 70, 420, 60, 32, '第 ' .. n .. ' 波', T.th.text, 'Middle', 'Middle',
    { outline = true, outlineColor = T.C(170, 4, 16, 28) })
  if banner then
    T.setScale(banner, 0.7)
    T.tween(0.3, function(k) T.setScale(banner, 0.7 + 0.3 * k) end, nil, T.easeBack, true)
    T.after(1.1, function()
      if banner then
        T.tween(0.3, function(k) T.trySet(banner, 'fontColor', T.withA(T.th.text % 16777216, math.floor(255 * (1 - k)))) end,
          function() T.destroyCtl(banner) end, T.easeOut, true)
      end
    end, true)
  end
  T.log('battle wave=' .. n .. ' n=' .. #defs)
end

T.battleFire = function(e)
  local b = T.battle
  if not b or b.over or not e or not e.alive then return end
  if (b.shootCd or 0) > 0 then return end
  b.shootCd = 0.18
  b.shots = b.shots + 1
  T.records.totalShots = T.records.totalShots + 1
  T.sfx(T.SFX.shoot)
  -- 箭：一条细长矩形从甘雨位置射向敌人
  local sx, sy = 0, -168
  local dx, dy = e.x - sx, e.y - sy
  local len = math.sqrt(dx * dx + dy * dy)
  local ang = math.deg(math.atan(dy, dx))
  local arrow = T.img(sx, sy, 34, 3, 'rect', T.P.ice2, ang)
  local trail = T.img(sx, sy, 60, 2, 'rect', T.withA(T.P.white, 120), ang)
  T.tween(0.12, function(k)
    local px, py = sx + dx * k, sy + dy * k
    T.tryCall(arrow, 'SetAnchoredPosition', px * T.S, py * T.S)
    T.tryCall(trail, 'SetAnchoredPosition', (px - dx / len * 26) * T.S, (py - dy / len * 26) * T.S)
  end, function()
    T.destroyCtl(arrow)
    T.destroyCtl(trail)
    T.battleHit(e)
  end, T.easeIn)
end

T.battleHit = function(e, isSkill)
  local b = T.battle
  if not b or not e.alive then return end
  e.hp = e.hp - 1
  if not isSkill then b.hits = b.hits + 1 end
  b.combo = b.combo + 1
  b.comboT = 2.4
  if b.combo > T.records.maxCombo then T.records.maxCombo = b.combo end
  T.sfx(T.SFX.impact)
  T.battleFloat(e.x, e.y + 20, '-' .. 1, T.P.ice1, 22)
  T.burst(e.x, e.y, T.P.ice2, 5, 0.9)
  if e.pips[e.hp + 1] then T.setColor(e.pips[e.hp + 1], T.th.line) end
  b.energy = math.min(100, b.energy + 14)
  b.score = b.score + math.floor(120 * (1 + (b.combo - 1) * 0.15))
  T.log('battle hit enemy=' .. e.i .. ' hp=' .. e.hp .. ' combo=' .. b.combo)
  if e.hp <= 0 then T.battleKill(e) end
end

T.battleKill = function(e)
  local b = T.battle
  if not e.alive then return end
  e.alive = false
  T.sfx(T.SFX.ice)
  T.burst(e.x, e.y, T.P.ice3, 12, 1.2)
  T.burst(e.x, e.y, T.P.white, 6, 0.8)
  for _, c in ipairs(e.parts) do T.destroyCtl(c) end
  for _, c in ipairs(e.pips) do T.destroyCtl(c) end
  if e.nameCtl then T.destroyCtl(e.nameCtl) end
  if e.hit then T.destroy(e.hit) end
  T.battleReticleAt(0, 0, false)
  b.aim = nil
  T.log('battle kill enemy=' .. e.i)
  local alive = 0
  for _, x in ipairs(b.enemies) do if x.alive then alive = alive + 1 end end
  if alive == 0 then
    if b.wave >= T.BATTLE_WAVES then
      b.over = true
      T.after(0.7, function() T.battleFinish(true) end)
    else
      T.log('battle wave clear=' .. b.wave)
      T.log('battle schedule next wave=' .. (b.wave + 1))
      T.after(0.9, function()
        T.log('battle next wave fire=' .. (b.wave + 1) .. ' same=' .. tostring(T.battle == b) .. ' over=' .. tostring(b.over))
        if T.battle == b and not b.over then T.battleSpawnWave(b.wave + 1) end
      end)
    end
  end
end

T.battleSkill = function()
  local b = T.battle
  if not b or b.over then return end
  if b.energy < 100 then
    T.log('battle skill denied energy=' .. math.floor(b.energy))
    T.sfx(T.SFX.error, true)
    T.toast('元素能量不足 · ' .. math.floor(b.energy) .. ' / 100', T.th.text2)
    return
  end
  b.energy = 0
  b.skillUsed = (b.skillUsed or 0) + 1
  T.sfx(T.SFX.ice, true)
  T.log('battle skill used=' .. b.skillUsed)
  -- 全屏霜闪
  local flash = T.img(0, 0, T.DESIGN_W, T.DESIGN_H, 'rect', T.withA(T.P.ice1, 190))
  T.tween(0.5, function(k)
    T.trySet(flash, 'imageColor', T.withA(T.P.ice1, math.floor(190 * (1 - k) ^ 2)))
  end, function() T.destroyCtl(flash) end, T.easeOut)
  local ring = T.img(0, 30, 120, 120, 'ring', T.withA(T.P.ice2, 220))
  T.tween(0.5, function(k)
    T.tryCall(ring, 'SetSizeDelta', (120 + 900 * k) * T.S, (120 + 420 * k) * T.S)
    T.trySet(ring, 'imageColor', T.withA(T.P.ice2, math.floor(220 * (1 - k))))
  end, function() T.destroyCtl(ring) end, T.easeOut)
  T.burst(0, 30, T.P.ice2, 14, 1.6)
  T.shake(12, 0.3)
  for _, e in ipairs(b.enemies) do
    if e.alive then
      for _ = 1, 2 do
        if e.alive then T.battleHit(e, true) end
      end
    end
  end
end

T.battleFinish = function(win)
  local b = T.battle
  if not b or b.finished then return end
  b.finished = true
  local ratio = b.timeLeft / b.stage.time
  local stars = 0
  if win then
    stars = (ratio > 0.55) and 3 or ((ratio > 0.28) and 2 or 1)
  end
  T.log('battle end win=' .. tostring(win) .. ' stars=' .. stars .. ' time=' .. string.format('%.1f', b.timeLeft))
  T.go('result', {
    stage = b.stage.id, win = win, stars = stars, score = b.score,
    combo = T.records.maxCombo, shots = b.shots, hits = b.hits, timeLeft = b.timeLeft,
  })
end

T.screenFns.battle = function(params)
  params = params or {}
  local stage = T.stageById[params.stage or 1] or T.stages[1]
  T.pageBg('night', { moonX = 286, moonY = 226, moonR = 54, stars = 44, aurora = false })
  T.snowfall(22, { pauseWithGame = true })
  -- 冰面场地
  T.img(0, -300, 1600, 300, 'circle', T.C(255, 44, 88, 114))
  T.img(0, -246, 1200, 200, 'circle', T.C(255, 58, 106, 134))
  T.img(0, -214, 980, 120, 'circle', T.C(255, 74, 126, 156))
  T.img(0, -212, 900, 100, 'ring', T.withA(T.P.ice2, 40))
  -- 角落冰晶
  T.iceShardCluster(-560, -250, 1.5, T.withA(T.P.ice3, 200))
  T.iceShardCluster(560, -244, 1.3, T.withA(T.P.ice3, 180))
  -- 甘雨（底部）
  T.img(-470, -300, 320, 260, 'circle', T.withA(T.P.ice4, 26))
  T.portrait(T.chars[1], -470, -266, 0.56, { idle = true, pauseWithGame = true, amp = 1.4 })

  T.img(0, -424, 1600, 190, 'circle', T.withA(T.P.night0, 130))
  local b = {
    stage = stage, stageId = stage.id, wave = 0, timeLeft = stage.time,
    score = 0, combo = 0, comboT = 0, energy = 0, health = 100,
    shots = 0, hits = 0, over = false, finished = false, aim = nil,
  }
  T.battle = b
  T.log('battle start stage=' .. stage.id .. ' waves=' .. T.BATTLE_WAVES .. ' time=' .. stage.time)

  -- 准星（先建，敌人之后建 → 准星在敌人下层？不会：准星停在屏幕外，悬停时移到敌人处会盖住敌人，可接受）
  local reticle = {}
  local ring = T.img(0, -1000, 74, 74, 'ring', T.withA(T.P.gold, 210))
  reticle[#reticle + 1] = { ctl = ring, ox = 0, oy = 0 }
  for _, p in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
    local ox, oy = p[1] * 26, p[2] * 26
    reticle[#reticle + 1] = { ctl = T.img(0, -1000, 12, 2.4, 'rect', T.P.gold, p[1] * p[2] * 45), ox = ox, oy = oy }
    reticle[#reticle + 1] = { ctl = T.img(0, -1000, 2.4, 12, 'rect', T.P.gold, p[1] * p[2] * 45), ox = ox, oy = oy }
  end
  reticle[#reticle + 1] = { ctl = T.img(0, -1000, 6, 6, 'circle', T.P.goldPale), ox = 0, oy = 0 }
  b.reticle = reticle
  -- 瞄准虚线（悬停时从甘雨的弓到目标）
  local aimLine = {}
  for i = 1, 12 do
    aimLine[i] = T.img(-470, -1000, 5, 5, 'circle', T.withA(T.P.gold, 150))
  end
  b.aimLine = aimLine

  -- HUD 左上：角色
  local hx, hy = -470, 286
  T.card(hx, hy, 344, 92, { radius = 16, fill = T.th.panel, border = T.th.cardBorder, shadow = false })
  T.img(hx - 128, hy + 2, 60, 60, 'circle', T.th.accent)
  T.portraitHead(hx - 128, hy + 4, 0.36, T.chars[1])
  T.txt(hx - 92, hy + 22, 120, 24, 15, '甘雨', T.th.text, 'Left', 'Middle')
  T.txt(hx - 92, hy + 2, 130, 20, 10, 'Lv.' .. T.records.level .. ' · 冰', T.th.text3, 'Left', 'Middle')
  local hpBg = T.rrect(hx + 18, hy - 10, 190, 8, 4, T.th.slotBg)
  local hpFill = T.img(hx + 18, hy - 10, 186, 6, 'rect', T.P.ok)
  local enBg = T.rrect(hx + 18, hy - 26, 190, 6, 3, T.th.slotBg)
  local enFill = T.img(hx + 18, hy - 26, 2, 4, 'rect', T.P.ice3)
  b.hpFill, b.enFill = hpFill, enFill

  -- HUD 顶部中：波次 / 计时
  T.rrect(0, 312, 240, 34, 17, T.th.panel)
  local waveTxt = T.txt(0, 312, 200, 28, 13, '', T.th.text, 'Middle', 'Middle')
  local aliveTxt = T.txt(0, 286, 200, 20, 10, '', T.th.text3, 'Middle', 'Middle')
  -- HUD 右上：分数 / 连击
  T.txt(500, 340, 200, 20, 10, 'SCORE', T.th.text3, 'Right', 'Middle')
  local scoreTxt = T.txt(500, 320, 200, 30, 18, '0', T.th.text, 'Right', 'Middle')
  local comboTxt = T.txt(500, 294, 200, 26, 13, '', T.th.accent2, 'Right', 'Middle')
  T.iconBtn(600, 320, 36, 'pause', function() T.openPause() end, { name = 'hit_battle_pause' })
  b.waveTxt, b.scoreTxt, b.comboTxt, b.aliveTxt = waveTxt, scoreTxt, comboTxt, aliveTxt

  -- 技能按钮（右下）
  local sx, sy = 520, -258
  local skillRing = T.img(sx, sy, 96, 96, 'ring', T.th.border)
  local skillBg = T.img(sx, sy, 84, 84, 'circle', T.th.panel2)
  local skillIcon = T.icon('snow', sx, sy + 2, 15, T.th.text3)
  local skillKey = T.txt(sx, sy - 58, 40, 20, 10, 'E', T.th.text3, 'Middle', 'Middle')
  b.skillRing, b.skillBg, b.skillIcon, b.skillKey = skillRing, skillBg, skillIcon, skillKey
  T.item({
    x = sx, y = sy, w = 100, h = 100, name = 'hit_battle_skill', focusPad = 6,
    onConfirm = function() T.battleSkill() end,
    onFocus = function(on) b.skillFocus = on end,
  })
  T.txt(sx - 74, sy - 4, 120, 22, 11, '降众天华', T.th.text2, 'Right', 'Middle')
  T.txt(sx - 74, sy - 26, 120, 20, 10, '能量满后释放', T.th.text3, 'Right', 'Middle')

  -- 底部提示
  T.txt(0, -340, 760, 22, 11, '悬停敌人瞄准 · 点击射出霜华矢 · E 释放技能 · Q 暂停', T.th.text3, 'Middle', 'Middle')

  T.battleSpawnWave(1)

  -- 逐帧
  T.screen.update = function(dt)
    if b.over then return end
    b.shootCd = math.max(0, (b.shootCd or 0) - dt)
    b.timeLeft = math.max(0, b.timeLeft - dt)
    b.comboT = math.max(0, b.comboT - dt)
    if b.comboT <= 0 and b.combo ~= 0 then b.combo = 0 end
    -- 计时文字
    local mm = math.floor(b.timeLeft / 60)
    local ss = math.floor(b.timeLeft % 60)
    T.setTxt(b.waveTxt, '第 ' .. b.wave .. ' / ' .. T.BATTLE_WAVES .. ' 波　　' .. string.format('%02d:%02d', mm, ss))
    T.setTxt(b.scoreTxt, T.fmt(b.score))
    T.setTxt(b.comboTxt, b.combo > 1 and ('COMBO ×' .. b.combo) or '')
    local alive = 0
    for _, e in ipairs(b.enemies) do if e.alive then alive = alive + 1 end end
    T.setTxt(b.aliveTxt, '来敌 ' .. alive)
    -- 能量与技能
    local e = b.energy
    local fw = math.max(2, 186 * e / 100)
    T.tryCall(b.enFill, 'SetSizeDelta', fw * T.S, 4 * T.S)
    T.tryCall(b.enFill, 'SetAnchoredPosition', (-547 + fw / 2) * T.S, (286 - 26) * T.S)
    local ready = e >= 100
    T.setColor(b.skillRing, ready and T.th.accent2 or T.th.border)
    T.setColor(b.skillBg, ready and T.th.panelHi or T.th.panel2)
    T.setColor(b.skillIcon, ready and T.th.accent2 or T.th.text3)
    T.setTxtColor(b.skillKey, ready and T.th.accent2 or T.th.text3)
    if ready then
      local p = 0.5 + 0.5 * math.sin(T.time * 4)
      T.tryCall(b.skillRing, 'SetSizeDelta', (96 + p * 8) * T.S, (96 + p * 8) * T.S)
    else
      T.tryCall(b.skillRing, 'SetSizeDelta', 96 * T.S, 96 * T.S)
    end
    -- 血量（模板：不接伤害逻辑，保持满）
    T.tryCall(b.hpFill, 'SetSizeDelta', 186 * T.S, 6 * T.S)
    -- 失败
    if b.timeLeft <= 0 and not b.finished then
      b.finished = true
      b.over = true
      T.battleFinish(false)
    end
  end

  local screen = T.screen
  screen.key = function(a)
    if a == 'skill' then T.log('battle key skill'); T.battleSkill()
    elseif a == 'confirm' then T.battleSkill()
    elseif a == 'back' then T.openPause()
    elseif a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0) end
  end
  T.screen.defaultFocus = #T.items
end


-- ===== 36_result.lua =====
-- ============================================================================
-- 页面 4：结算（胜负 / 星级 / 奖励 / 经验与升级）
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

T.recordResult = function(params)
  local st = T.stageById[params.stage] or T.stages[1]
  local rec = T.records
  local out = { stage = st, levelUp = false, unlockedNext = nil }
  if params.win then
    rec.stars[st.id] = math.max(rec.stars[st.id] or 0, params.stars or 0)
    rec.best[st.id] = math.max(rec.best[st.id] or 0, params.score or 0)
    rec.plays = (rec.plays or 0) + 1
    rec.clears = (rec.clears or 0) + 1
    rec.visited[st.id] = true
    local nxt = T.stages[st.id + 1]
    if nxt then
      rec.unlocked[nxt.id] = true
      out.unlockedNext = nxt
    end
    -- 经验
    local gain = 320 + (params.stars or 0) * 60
    rec.exp = (rec.exp or 0) + gain
    T.hero.exp = rec.exp
    local maxExp = 4600
    if rec.exp >= maxExp then
      rec.exp = rec.exp - maxExp
      rec.level = (rec.level or 60) + 1
      T.hero.level = rec.level
      T.hero.exp = rec.exp
      T.hero.level = rec.level
      out.levelUp = true
    end
    T.hero.exp = rec.exp
    T.hero.level = rec.level
    -- 成就
    T.unlock('first_shot')
    if (rec.maxCombo or 0) >= 3 then T.unlock('combo3') end
    T.unlock('clear1')
    local sum = 0
    for _, v in ipairs(rec.stars) do sum = sum + v end
    if sum >= 12 then T.unlock('stars12') end
    local got = 0
    for _ in pairs(rec.achv) do got = got + 1 end
    if got >= 6 then T.unlock('codex10') end
    out.gain = gain
  else
    rec.plays = (rec.plays or 0) + 1
  end
  T.log('records stage=' .. st.id .. ' stars=' .. tostring(rec.stars[st.id]) ..
    ' clears=' .. tostring(rec.clears) .. ' level=' .. tostring(rec.level))
  return out
end

T.screenFns.result = function(params)
  params = params or {}
  local st = T.stageById[params.stage] or T.stages[1]
  local win = params.win and true or false
  local info = T.recordResult({ stage = st.id, win = win, stars = params.stars, score = params.score })
  T.pageBg('night', { moonX = 0, moonY = 236, moonR = 78, stars = 34, aurora = false })
  T.snowfall(16, {})
  T.snowBank(T.C(255, 30, 70, 96), -352)

  T.sfx(win and T.SFX.victory or T.SFX.fail, true)
  local cx, cy, w, h = 0, -4, 780, 560
  T.card(cx, cy, w, h, { radius = 24, fill = T.th.panel, border = T.th.cardBorder })
  T.img(cx, cy + h / 2 - 8, w - 80, 1.2, 'rect', T.th.line)

  -- 标题
  local title = win and '挑战成功' or '挑战失败'
  local tcol = win and T.P.goldPale or T.P.ice2
  local titleChars = win and { '挑', '战', '成', '功' } or { '挑', '战', '失', '败' }
  T.logo(cx, cy + h / 2 - 62, titleChars, 38, 46, tcol,
    { shadow = true, shadowColor = T.C(120, 6, 20, 34) })
  T.txt(cx, cy + h / 2 - 108, 560, 26, 13,
    win and (st.code .. ' · ' .. st.name .. '　已完成') or (st.code .. ' · ' .. st.name .. '　时间耗尽'),
    T.th.text2, 'Middle', 'Middle')
  T.titleFlourish(cx, cy + h / 2 - 132, 260, T.withA(win and T.P.goldPale or T.P.ice2, 170))

  -- 星级
  local starY = cy + 100
  local stars = params.stars or 0
  for i = 1, 3 do
    local col = (i <= stars) and T.P.gold or T.th.line
    local ctl = T.img(cx + (i - 2) * 62, starY, 54, 54, 'fivestar', col)
    if ctl then
      T.setScale(ctl, 0.2)
      T.after(0.15 + i * 0.14, function()
        T.sfx(i <= stars and T.SFX.reward or T.SFX.click, i == 1)
        T.tween(0.34, function(k)
          T.setScale(ctl, 0.2 + 0.8 * k + (k > 0.8 and (1 - k) * 0.6 or 0))
        end, nil, T.easeBack, true)
      end, true)
    end
  end
  T.txt(cx, starY - 48, 360, 22, 11, win and ('本关最佳 ' .. T.fmt(math.max(T.records.best[st.id] or 0, params.score or 0))) or '再接一次，风会记得你的箭',
    T.th.text3, 'Middle', 'Middle')

  -- 统计
  local panelY = cy - 12
  T.rrect(cx, panelY, w - 120, 64, 12, T.th.panel2)
  local stats = {
    { '得分', T.fmt(params.score or 0) },
    { '最高连击', tostring(params.combo or 0) },
    { '命中', tostring(params.hits or 0) .. ' / ' .. tostring(params.shots or 0) },
    { '剩余时间', string.format('%02d:%02d', math.floor((params.timeLeft or 0) / 60), math.floor((params.timeLeft or 0) % 60)) },
  }
  for i, s in ipairs(stats) do
    local x = cx - (w - 120) / 2 + (i - 0.5) * ((w - 120) / 4)
    T.txt(x, panelY + 10, 160, 24, 11, s[1], T.th.text3, 'Middle', 'Middle')
    T.txt(x, panelY - 11, 160, 26, 15, s[2], T.th.text, 'Middle', 'Middle')
  end

  -- 奖励
  local ry = cy - 88
  T.txt(cx - 300, ry + 6, 120, 24, 12, win and '奖励' or '未获得奖励', T.th.text3, 'Left', 'Middle')
  if win then
    for i, rw in ipairs(st.reward) do
      local yy = ry - 22 - (i - 1) * 28
      T.icon(i == 1 and 'coin' or (i == 2 and 'book' or 'crystal'), cx - 284, yy, 9, T.th.accent2)
      T.txt(cx - 266, yy, 300, 22, 12, rw, T.th.text2, 'Left', 'Middle')
    end
  else
    T.txt(cx - 300, ry - 30, 360, 40, 12, '调整一下队伍与天赋，再来一次。', T.th.text3, 'Left', 'Middle')
  end
  -- 经验条
  T.txt(80, ry + 4, 150, 24, 12, '冒险阅历', T.th.text3, 'Left', 'Middle')
  T.txt(372, ry + 4, 180, 24, 12, T.fmt(T.hero.exp or 0) .. ' / 4,600', T.th.text2, 'Right', 'Middle')
  T.bar(226, ry - 24, 292, 12, (T.hero.exp or 0) / 4600, T.th.accent, T.th.slotBg)
  if info.levelUp then
    T.chip(226, ry - 56, 'Lv.' .. T.hero.level .. ' 已提升', T.th.accent2, { fill = T.th.accentSoft })
  end

  -- 按钮
  local by = cy - h / 2 + 60
  T.button(cx - 236, by, 200, 52, '再次挑战', function()
    T.go('battle', { stage = st.id })
  end, { kind = 'secondary', name = 'hit_result_retry' })
  T.button(cx, by, 200, 52, win and '下一关' or '返回地图', function()
    if win and T.stages[st.id + 1] then
      T.go('prepare', { stage = st.id + 1 })
    else
      T.go('map', { chapter = st.chapter, sel = ((st.id - 1) % 3) + 1 })
    end
  end, { kind = 'primary', name = 'hit_result_next' })
  T.button(cx + 236, by, 200, 52, '返回地图', function()
    T.go('map', { chapter = st.chapter, sel = ((st.id - 1) % 3) + 1 })
  end, { kind = 'ghost', name = 'hit_result_map' })

  T.txt(0, -338, 900, 22, 11, win and '「雪会记得每一支箭落下的地方。」' or '「风停了。下一次，把弓拉满一些。」',
    T.th.text3, 'Middle', 'Middle')

  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('map', { chapter = st.chapter, sel = ((st.id - 1) % 3) + 1 }) end
  end
  T.screen.defaultFocus = 2
  T.log('result win=' .. tostring(win) .. ' stars=' .. tostring(params.stars) .. ' score=' .. tostring(params.score))
end


-- ===== 38_growth.lua =====
-- ============================================================================
-- 页面：养成（甘雨 · 循循守月）
-- 三栏：左 立绘 / 信息 / 命之座 ｜ 中 属性 / 武器 / 圣遗物 ｜ 右 天赋 / 材料
-- 弹层：突破（ascend）、天赋（talent），均 pausesGame
-- 三栏基准：外边距 20、栏距 16（372 + 416 + 420 + 2×16 + 2×20 = 1280）
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

T.GY = { lx = -434, mx = -24, rx = 410, lw = 372, mw = 416, rw = 420 }

-- ---------------------------------------------------------------- 属性行
T.gyStatRow = function(cx, y, w, row, color)
  local x0 = cx - w / 2
  T.txt(x0, y, w - 104, 26, 13, row.name, T.th.text2, 'Left', 'Middle')
  T.txt(x0 + w, y, 104, 26, 13, row.value, T.th.text, 'Right', 'Middle')
  T.bar(cx, y - 18, w, 5, row.pct, color or T.th.accent, T.th.line)
end

-- ---------------------------------------------------------------- 命之座节点
T.gyConstNode = function(x, y, c, lit, idx)
  local halo = T.img(x, y, 50, 50, 'circle', T.withA(T.th.accent, 0))
  local ring = T.img(x, y, 36, 36, 'circle', lit and T.th.accent2 or T.th.line)
  local core = T.img(x, y, 30, 30, 'circle', lit and T.th.panel or T.th.panel2)
  T.icon('const', x, y, 7, lit and T.th.accent2 or T.th.text3)
  local label = T.txt(x, y - 30, 60, 20, 10, c.name, lit and T.th.text2 or T.th.text3, 'Middle', 'Middle')
  T.item({
    x = x, y = y, w = 42, h = 42, name = 'hit_growth_const_' .. idx, focusPad = 3,
    onConfirm = function()
      if lit then
        T.log('growth const open id=' .. idx)
        T.toast('命之座 · ' .. c.name .. '：' .. c.desc, T.th.accent2)
      else
        T.log('growth const locked id=' .. idx)
        T.sfx(T.SFX.error, true)
        T.toast('命之座未解锁 · 需要「甘雨之命星」', T.th.text)
      end
    end,
    onFocus = function(on)
      T.setColor(halo, T.withA(T.th.accent, on and 64 or 0))
      T.setColor(ring, on and T.th.accent or (lit and T.th.accent2 or T.th.line))
      T.setColor(core, on and T.th.panelHi or (lit and T.th.panel or T.th.panel2))
      T.setTxtColor(label, on and T.th.text or (lit and T.th.text2 or T.th.text3))
    end,
  })
end

-- ---------------------------------------------------------------- 天赋行
T.gyTalentRow = function(i)
  local t = T.talents[i]
  local x, y = T.GY.rx, 162 - (i - 1) * 90
  local bg = T.rrect(x, y, 396, 76, 12, T.th.panel2)
  T.img(232, y, 46, 46, 'circle', T.th.accentSoft)
  T.icon(t.icon, 232, y, 9, T.th.accent)
  local name = T.txt(262, y + 12, 190, 28, 16, t.name, T.th.text, 'Left', 'Middle')
  T.txt(262, y - 12, 190, 22, 11, t.kind, T.th.text3, 'Left', 'Middle')
  T.txt(478, y + 12, 130, 22, 12, 'Lv.' .. t.level .. ' / ' .. t.max, T.th.text2, 'Right', 'Middle')
  T.bar(370, y - 32, 216, 4, t.level / t.max, T.th.accent, T.th.line)
  -- 整行可点（大命中区，先建，让下面的「提升」按钮压在其上）
  T.item({
    x = x, y = y, w = 396, h = 76, name = 'hit_growth_talent_row_' .. i, focusPad = 3,
    onConfirm = function() T.gyOpenTalent(i) end,
    onFocus = function(on)
      T.tint(bg, on and T.th.panelHi or T.th.panel2)
      T.setTxtColor(name, on and T.th.accent or T.th.text)
    end,
  })
  T.button(548, y, 84, 36, '提升', function() T.gyOpenTalent(i) end,
    { kind = 'secondary', name = 'hit_growth_talent_' .. i, size = 12 })
end

-- ---------------------------------------------------------------- 「突破」弹层
T.gyOpenAscend = function()
  local ch = T.chars[1]
  local rows = {
    { icon = 'snow', name = '霜华之蕊', own = T.records.mats.snow or 0, need = 1 },
    { icon = 'crystal', name = '冰晶核', own = T.records.mats.crystal or 0, need = 3 },
    { icon = 'coin', name = '摩拉', own = T.records.mats.mora or 0, need = 120000 },
  }
  T.openOverlay('ascend', function(base)
    local p = T.overlayPanel(620, 420, '突破',
      'Lv.' .. T.hero.level .. ' → Lv.' .. T.hero.maxLevel .. ' · 第四阶段')
    local w, h = p.w, p.h
    -- 左半：霜华冰晶
    T.img(-182, 22, 164, 164, 'ring', T.th.borderSoft)
    T.glow(-182, 20, 68, T.th.accentSoft, 6, 60)
    T.crystalArt(-182, 24, 1.15, T.th.accent)
    T.snowflake(-250, 86, 9, T.withA(T.th.accent, 140), { core = T.th.panelHi })
    T.snowflake(-112, 62, 6, T.withA(T.th.accent2, 170))
    -- 右半：材料清单
    T.txt(-14, 72, 240, 24, 12, '突破所需', T.th.text3, 'Left', 'Middle')
    T.txt(280, 72, 150, 24, 12, '拥有 / 需要', T.th.text3, 'Right', 'Middle')
    for i, r in ipairs(rows) do
      local y = 38 - (i - 1) * 42
      local enough = r.own >= r.need
      local col = enough and T.th.text2 or T.P.danger
      T.icon(r.icon, 2, y, 9, enough and T.th.accent or T.P.danger)
      T.txt(28, y, 150, 24, 13, r.name, T.th.text, 'Left', 'Middle')
      T.txt(280, y, 150, 24, 12, T.fmt(r.own) .. ' / ' .. T.fmt(r.need), col, 'Right', 'Middle')
      T.hline(133, y - 21, 294, T.th.line)
    end
    -- 描述（截到两行）
    T.txtAuto(0, -96, 540, 12, T.wrap(ch.desc, 30), T.th.text3)
    T.button(112, -158, 200, 50, '确认突破', function()
      T.closeOverlay()
      T.log('growth ascend')
      T.sfx(T.SFX.reward)
      T.toast('突破完成 · 霜华更盛', T.th.accent2)
    end, { name = 'hit_ascend_ok' })
    T.button(-112, -158, 180, 50, '再想想', function() T.closeOverlay() end,
      { kind = 'secondary', name = 'hit_ascend_cancel' })
    T.closeButton(w / 2 - 40, h / 2 - 40, function() T.closeOverlay() end, 'hit_ascend_close')
  end, {
    pausesGame = true, defaultFocus = 1,
    key = function(a) if a == 'back' then T.closeOverlay() end end,
  })
end

-- ---------------------------------------------------------------- 「天赋」弹层
T.gyNextGain = {
  [1] = '伤害提升 6%',
  [2] = '冷却时间缩短 0.5 秒',
  [3] = '领域持续时间延长 2 秒',
}

T.gyOpenTalent = function(i)
  local t = T.talents[i]
  if not t then return end
  local gain = T.gyNextGain[i] or '伤害提升 6%'
  T.openOverlay('talent', function(base)
    local p = T.overlayPanel(560, 380, t.name, t.kind .. ' · 当前 Lv.' .. t.level)
    local w, h = p.w, p.h
    T.txtAuto(0, 46, 440, 13, T.wrap(t.desc, 30), T.th.text2)
    T.hline(0, 8, 440, T.th.line)
    T.txt(0, -22, 460, 30, 15, '下一级：' .. gain, T.th.accent2, 'Middle', 'Middle')
    T.txt(0, -46, 460, 24, 12, '提升至 Lv.' .. (t.level + 1) .. ' · 消耗「诗文」的教导 ×3', T.th.text3,
      'Middle', 'Middle')
    T.bar(0, -74, 440, 8, t.level / t.max, T.th.accent, T.th.line)
    T.txt(-220, -92, 120, 22, 11, 'Lv.' .. t.level, T.th.text2, 'Left', 'Middle')
    T.txt(220, -92, 120, 22, 11, 'Lv.' .. t.max, T.th.text3, 'Right', 'Middle')
    T.txt(0, -108, 500, 24, 11, '甘雨：「' .. T.chars[1].quote .. '」', T.th.text3, 'Middle', 'Middle')
    T.button(112, -152, 200, 50, '升级', function()
      T.closeOverlay()
      T.log('growth talent up id=' .. t.id)
      T.sfx(T.SFX.reward)
      T.toast('天赋已提升 · Lv.' .. (t.level + 1), T.th.accent2)
    end, { name = 'hit_talent_up' })
    T.button(-112, -152, 180, 50, '关闭', function() T.closeOverlay() end,
      { kind = 'secondary', name = 'hit_talent_close' })
    T.closeButton(w / 2 - 40, h / 2 - 40, function() T.closeOverlay() end, 'hit_talent_close_btn')
  end, {
    pausesGame = true, defaultFocus = 1,
    key = function(a) if a == 'back' then T.closeOverlay() end end,
  })
end

-- ---------------------------------------------------------------- 养成页
T.screenFns.growth = function(params)
  T.pageBg('day', { sunX = 360, sunY = 176 })
  T.snowfall(12, { scale = 0.7 })
  T.snowBank(T.C(255, 250, 254, 255), -300)
  T.backBtn(function() T.go('menu') end)
  T.header('养成', '甘雨 · 循循守月', { right = '璃月 · 月海亭', x = -496 })

  local lx, mx, rx = T.GY.lx, T.GY.mx, T.GY.rx

  -- ================= 左栏：立绘卡 =================
  T.card(lx, 84, 372, 340, { radius = 20, fill = T.th.panel, border = T.th.cardBorder, hi = T.th.panelHi })
  T.glow(lx, 132, 74, T.th.accentSoft, 5, 44)
  T.img(lx, 132, 236, 236, 'ring', T.th.borderSoft)
  T.snowflake(-586, 220, 8, T.withA(T.th.accent, 120), { core = T.th.panelHi })
  T.snowflake(-286, 232, 6, T.withA(T.th.accent2, 140))
  T.drift(lx, -50, 330, 64, T.mix(T.th.panelHi, T.th.accentSoft, 0.85))
  T.portrait(T.chars[1], lx, 152, 0.62, { idle = true })
  T.img(lx, -72, 156, 22, 'circle', T.withA(T.th.accent, 26))
  T.drift(lx - 54, -64, 196, 34, T.th.panelHi)

  -- 信息区
  T.txt(-606, -108, 200, 44, 26, '甘雨', T.th.text, 'Left', 'Middle')
  T.txt(-260, -108, 150, 28, 13, 'Lv.' .. T.hero.level .. ' / ' .. T.hero.maxLevel, T.th.text2,
    'Right', 'Middle')
  T.txt(-606, -140, 120, 24, 11, '经验', T.th.text3, 'Left', 'Middle')
  T.txt(-260, -140, 150, 24, 11, T.hero.exp .. ' / ' .. T.hero.expMax, T.th.text2,
    'Right', 'Middle')
  T.bar(lx, -158, 330, 8, T.hero.exp / T.hero.expMax, T.th.accent, T.th.line)
  T.button(lx, -196, 220, 48, '突破', function() T.gyOpenAscend() end, { name = 'hit_growth_ascend' })

  -- 命之座
  local litCount = 0
  for i = 1, 6 do if T.records.consts[i] then litCount = litCount + 1 end end
  T.txt(-606, -234, 150, 22, 11, '命之座', T.th.text3, 'Left', 'Middle')
  T.txt(-260, -234, 150, 22, 11, litCount .. ' / 6', T.th.text3, 'Right', 'Middle')
  T.img(lx, -264, 326, 1.4, 'rect', T.th.line)
  for i = 1, 6 do
    T.gyConstNode(-579 + (i - 1) * 58, -264, T.consts[i], T.records.consts[i] and true or false, i)
  end

  -- ================= 中栏：属性 =================
  T.card(mx, 111, 416, 286, { radius = 18, fill = T.th.card, border = T.th.cardBorder, hi = T.th.panelHi })
  T.txt(-210, 228, 150, 30, 18, '属性', T.th.text, 'Left', 'Middle')
  T.txt(162, 228, 140, 22, 11, 'Lv.' .. T.hero.level .. ' · 满级 ' .. T.hero.maxLevel, T.th.text3,
    'Right', 'Middle')
  T.hline(mx, 208, 372, T.th.line)
  for i, row in ipairs(T.hero.stats) do
    T.gyStatRow(mx, 188 - (i - 1) * 38, 372, row, i >= 5 and T.th.accent2 or T.th.accent)
  end

  -- 武器卡
  T.card(mx, -92, 416, 96, { radius = 16, fill = T.th.panel, border = T.th.cardBorder, hi = T.th.panelHi })
  T.rrect(-186, -92, 68, 68, 14, T.th.panel2)
  T.icon('bow', -186, -92, 13, T.th.text2)
  T.txt(-142, -80, 230, 28, 16, '阿莫斯之弓', T.th.text, 'Left', 'Middle')
  T.txt(-142, -104, 230, 22, 11, 'Lv.' .. T.hero.level .. ' · 精炼 1 阶', T.th.text3, 'Left', 'Middle')
  T.chip(138, -92, '弓', T.th.text2, { fill = T.th.accentSoft, text = T.th.accent, size = 12 })

  -- 圣遗物
  T.sectionLabel(-210, -152, '圣遗物', { w = 220 })
  T.txt(184, -152, 140, 22, 11, '2 件套 · 冰伤 15%', T.th.text3, 'Right', 'Middle')
  local arts = {
    { 'bloom', '生之花' }, { 'plume', '死之羽' }, { 'hourglass', '时之沙' }, { 'bloom', '空之杯' },
  }
  for i = 1, 4 do
    local cx = -174 + (i - 1) * 100
    T.slot(cx, -222, 84, 84, nil, arts[i][2], {})
    T.artifactArt(arts[i][1], cx, -208, 0.58, T.th.accent)
  end

  -- ================= 右栏：天赋 =================
  T.card(rx, 84, 420, 330, { radius = 18, fill = T.th.card, border = T.th.cardBorder, hi = T.th.panelHi })
  T.txt(222, 228, 150, 30, 18, '天赋', T.th.text, 'Left', 'Middle')
  T.txt(598, 228, 180, 22, 11, '「诗文」系列 · 教导', T.th.text3, 'Right', 'Middle')
  T.hline(rx, 208, 376, T.th.line)
  for i = 1, #T.talents do T.gyTalentRow(i) end

  -- 材料
  T.card(rx, -166, 420, 150, { radius = 18, fill = T.th.card, border = T.th.cardBorder, hi = T.th.panelHi })
  T.txt(222, -110, 150, 26, 16, '材料', T.th.text, 'Left', 'Middle')
  T.txt(598, -110, 160, 22, 11, '月海亭库存', T.th.text3, 'Right', 'Middle')
  T.hline(rx, -126, 376, T.th.line)
  local order = { 'crystal', 'qingxin', 'snow', 'mora' }
  for i = 1, 4 do
    local m
    for _, mm in ipairs(T.mats) do if mm.id == order[i] then m = mm end end
    if m then
      local col = (i - 1) % 2
      local rw = math.floor((i - 1) / 2)
      local x0 = 212 + col * 200
      local y = -156 - rw * 48
      T.img(x0 + 22, y, 36, 36, 'circle', T.withA(T.th.accent, 20))
      T.icon(m.icon, x0 + 22, y, 8, m.color)
      T.txt(x0 + 46, y, 70, 24, 11, m.name, T.th.text2, 'Left', 'Middle')
      T.txt(x0 + 196, y, 80, 24, 12, T.fmt(m.count), T.th.text, 'Right', 'Middle')
    end
  end

  -- ================= 底部 =================
  T.txt(0, -294, 520, 24, 12, '提升天赋需要「诗文」的教导与摩拉', T.th.text3, 'Middle', 'Middle')
  T.footer({
    { key = '↑↓', label = '选择' }, { key = '空格', label = '确认' },
    { key = 'H', label = '帮助' }, { key = 'Q', label = '返回' },
  })

  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('menu') end
  end
  screen.afterBuild = function()
    T.setFocus(2, true)
    T.log('growth open', 'consts=' .. litCount .. '/6', 'mats=' .. #T.mats,
      'exp=' .. tostring(T.hero.exp) .. '/' .. tostring(T.hero.expMax))
  end
end


-- ===== 40_codex.lua =====
-- ============================================================================
-- 40_codex.lua —— 霜华图鉴 / 设置 / 制作名单
-- 三张「后台页」：图鉴把 T.codex 的 14 条索引成可翻的册子，设置把 T.opt 做成可点的
-- 开关，制作名单排成一张冷调的谢幕卡。色值只取 T.th.*；控件组改色走 T.tint，
-- 整组位移走 T.captureBase / T.shiftBase（T.rrect 返回的是 6 个控件，不是单个控件）。
-- ============================================================================
T = T or {}

do
  local GROUP_OF_TAB = { 'enemy', 'gear', 'mat', 'world' }
  local TAB_LABELS = { '敌人', '装备', '材料', '世界' }

  -- 图鉴补记：正文之外的一句闲笔，让详情面板的段落有 3~5 行的呼吸
  local FLAVOR = {
    slime = '在雪线上走夜路时，常听见它们黏在一起的声响。',
    fly = '翅上的霜粉落在袖口，很久都不会化。',
    guard = '铠甲里没有人。守夜这件事，自己成了执念。',
    boss = '它记得每一个抬眼看过它的人。',
    bow = '拉开它，需要一整个冬天的力气。',
    flower = '花语是「别忘了回来的路」。',
    plume = '摸上去很轻，像一句没说出口的话。',
    hourglass = '把它倒过来，时间也不会真的回去。',
    crystal = '冷到手心发疼时，它反而暖了一点。',
    qingxin = '采的时候要留一半，山才肯再开。',
    snow = '花期只有一个晚上，天亮就谢。',
    moon = '潮水退去后，滩上会剩一层细白的霜。',
    bowl = '灯点得最晚的那间，就是她待的地方。',
    bowl2 = '风从坡上下来，会捎来一点清心的气味。',
  }

  -- ---------------------------------------------------------------- 收录状态
  -- 默认：除「清心坡」外全部收录（世界组第 3 条用来展示锁定态）；
  -- 重置进度后整册回到未收录，页头计数随之归零。
  local function codexSeen(id)
    if T.codexSeen == nil then
      T.codexSeen = {}
      for i = 1, #T.codex do T.codexSeen[T.codex[i].id] = (T.codex[i].id ~= 'bowl2') end
    end
    return T.codexSeen[id] == true
  end

  local function codexCount()
    local n = 0
    for i = 1, #T.codex do
      if codexSeen(T.codex[i].id) then n = n + 1 end
    end
    return n
  end

  -- 弓（详情大图）：9 段短矩形沿圆弧拼出弓臂 + 直弦 + 握把。
  -- 库里的 weaponArt 是「金环 + 深色芯」，放大后读不出弓，这里自绘一支。
  local function bowArt(cx, cy, s, color)
    local c = color or T.th.accent2
    local R = 74 * s
    local ox = cx + 0.75 * R
    for i = 1, 9 do
      local deg = 121 + (239 - 121) * (i - 0.5) / 9
      local a = math.rad(deg)
      T.img(ox + math.cos(a) * R, cy + math.sin(a) * R, 7 * s, 27 * s, 'rect', c, deg)
    end
    T.img(cx + 0.25 * R, cy, 2.4 * s, 1.72 * R, 'rect', T.withA(c, 170))
    T.img(ox - R, cy, 11 * s, 36 * s, 'rect', T.mix(c, T.th.panelHi, 0.42))
    T.img(ox - R, cy + 0.2 * R, 7 * s, 7 * s, 'circle', T.th.panelHi)
  end

  -- 图鉴插图分派：k=0.5 是索引格（用给 14px 设计的图元图标 + 淡色底圆），
  -- k=1 是详情大图（用整套美术：enemyArt / artifactArt / crystalArt / icon）。
  -- 索引格里 enemyArt/artifactArt 在这个尺寸会糊成色块，所以两套分开。
  local function codexArt(it, x, y, k)
    local found = codexSeen(it.id)
    if k < 1 then
      T.img(x, y, 66, 66, 'circle', found and T.mix(it.color, T.th.panel, 0.82) or T.th.line)
      T.icon(found and it.icon or 'lock', x, y, 14, found and it.color or T.th.text3)
      return
    end
    if not found then
      T.icon('lock', x, y, 34, T.th.text3)
      T.snowflake(x, y + 56, 16, T.withA(T.th.text3, 90))
      return
    end
    if it.group == 'enemy' then
      local s = ({ slime = 1.35, fly = 1.5, guard = 1.12, boss = 0.86 })[it.icon] or 1.2
      T.enemyArt(it.icon, x, y, s, {})
    elseif it.group == 'gear' then
      if it.icon == 'bow' then
        bowArt(x, y, 1, it.color)
      else
        local s = ({ bloom = 1.15, plume = 1.25, hourglass = 1.3 })[it.icon] or 1.2
        T.artifactArt(it.icon, x, y, s, it.color)
      end
    elseif it.group == 'mat' then
      if it.icon == 'crystal' then
        T.crystalArt(x, y, 0.85, it.color)
      elseif it.icon == 'snow' then
        T.snowflake(x, y, 52, it.color, { core = T.th.panelHi, star = true })
      else
        T.icon('bloom', x, y, 48, it.color)
      end
    else
      local s = ({ moon = 54, tower = 46, mountain = 42 })[it.icon] or 44
      T.icon(it.icon, x, y, s, it.color)
    end
  end

  -- 收集「从第 b0 个控件之后新建的控件」，供整组位移使用
  local function since(b0)
    local out = {}
    for k = b0 + 1, #T.controls do out[#out + 1] = T.controls[k] end
    return out
  end

  -- 字符数：T.badge 内部按 #label（字节）算宽度，中文标签会被撑成两倍宽并溢出卡片，
  -- 所以图鉴里的徽章自己画（宽度按字符数算）。
  local function charLen(s)
    local n, i = 0, 1
    while i <= #s do
      local b = string.byte(s, i)
      i = i + ((b >= 240 and 4) or (b >= 224 and 3) or (b >= 192 and 2) or 1)
      n = n + 1
    end
    return n
  end

  local function badgeW(label, size)
    size = size or 11
    return math.max(44, charLen(label) * size + 22)
  end

  local function mkBadge(x, y, label, fill, fg, size)
    size = size or 11
    local w = badgeW(label, size)
    T.rrect(x, y, w, 20, 10, fill)
    T.txt(x, y, w - 8, 17, size, label, fg, 'Middle', 'Middle')
    return w
  end

  -- 中文排版的禁则字：不允许出现在行首
  local NOSTART = {
    ['。'] = true, ['，'] = true, ['、'] = true, ['！'] = true, ['？'] = true, ['：'] = true,
    ['；'] = true, ['」'] = true, ['』'] = true, ['）'] = true, ['·'] = true, ['…'] = true,
  }

  -- 自己折行：引擎的排版宽度是「控件宽 - 4」，CJK 字宽 = 字号，每行可容
  -- floor((width-4)/size) 字；顺手做中文禁则（标点不落行首，把上一个字一起挪下来）。
  -- 返回「折好行的文本 + 行数」——文本框高度必须按这个行数算，否则超出的行会被
  -- visibleLineCount 整段截掉（表现为「正文后半段消失」）。
  local function wrapCJK(text, per)
    per = math.max(4, per)
    local out = {}
    for para in string.gmatch(text .. '\n', '([^\n]*)\n') do
      local chars, i = {}, 1
      while i <= #para do
        local b = string.byte(para, i)
        local step = (b >= 240 and 4) or (b >= 224 and 3) or (b >= 192 and 2) or 1
        chars[#chars + 1] = string.sub(para, i, i + step - 1)
        i = i + step
      end
      local line, count = {}, 0
      for k = 1, #chars do
        local c = chars[k]
        if count >= per then
          if NOSTART[c] and count > 1 then
            local moved = table.remove(line)
            out[#out + 1] = table.concat(line)
            line, count = { moved }, 1
          else
            out[#out + 1] = table.concat(line)
            line, count = {}, 0
          end
        end
        line[#line + 1] = c
        count = count + 1
      end
      out[#out + 1] = table.concat(line)
    end
    return table.concat(out, '\n'), #out
  end

  -- 面板内按钮：T.button 的 secondary/danger 在浅色面板上底色几乎与面板同色（看不出是按钮），
  -- 这里自绘带描边的胶囊——常态 panel2 / 淡红，聚焦时 accent / 实红。
  local function panelBtn(x, y, w, h, label, onClick, name, danger)
    local bdOff, bdOn, fillOff, fillOn, txtOff, txtOn
    if danger then
      bdOff = T.mix(T.P.danger, T.th.panel, 0.55)
      bdOn = T.th.accent2
      fillOff = T.mix(T.P.danger, T.th.panel, 0.86)
      fillOn = T.P.danger
      txtOff, txtOn = T.P.danger, T.P.white
    else
      bdOff, bdOn = T.th.borderSoft, T.th.accent2
      fillOff, fillOn = T.th.panel2, T.th.accent
      txtOff, txtOn = T.th.text2, T.th.onAccent
    end
    local r = 14
    local b0 = #T.controls
    local bd = T.rrect(x, y, w, h, r, bdOff)
    local face = T.rrect(x, y, w - 2, h - 2, r - 1, fillOff)
    local tc = T.txt(x, y, w - 16, h - 8, 16, label, txtOff, 'Middle', 'Middle')
    local base = {}
    T.captureBase(base, since(b0))
    local function paint(on)
      T.tint(bd, on and bdOn or bdOff)
      T.tint(face, on and fillOn or fillOff)
      T.setTxtColor(tc, on and txtOn or txtOff)
      T.shiftBase(base, 0, on and 2 or 0)
    end
    paint(false)
    T.item({
      x = x, y = y, w = w, h = h, name = name, focusPad = 6,
      onConfirm = function()
        T.sfx(T.SFX.click)
        onClick()
      end,
      onFocus = paint,
      onDown = function() T.shiftBase(base, 0, 0) end,
      onUp = function() T.shiftBase(base, 0, 2) end,
    })
  end

  -- ==========================================================================
  -- A. 图鉴
  -- ==========================================================================
  T.screenFns.codex = function(params)
    params = params or {}
    local tab = math.floor(tonumber(params.tab) or 1)
    if tab < 1 then tab = 1 elseif tab > 4 then tab = 4 end
    local group = GROUP_OF_TAB[tab]
    local list = {}
    for i = 1, #T.codex do
      if T.codex[i].group == group then list[#list + 1] = T.codex[i] end
    end
    local sel = math.floor(tonumber(params.sel) or 1)
    if sel < 1 then sel = 1 elseif sel > #list then sel = #list end

    T.pageBg('day', { sunX = 380, sunY = 168 })
    T.header('霜华图鉴', '敌人、装备、材料与世界的记录',
      { right = '收录 ' .. codexCount() .. ' / ' .. #T.codex })
    T.backBtn(function() T.go('menu') end)

    -- ---- 页签 ----------------------------------------------------------
    -- T.tabs 在失焦时会把 active 页签的底色刷回 panel2（组件既有行为，字色却仍是
    -- onAccent），在浅色底上会变成「白字看不见」。这里接管每个页签的 onFocus，
    -- 自己维护「当前页签 = accentSoft + 强调字色，聚焦 = accent + onAccent」。
    local tabItems, tabFills, tabTxts = {}, {}, {}
    do
      local caps = {}
      local origRrect, origTxt = T.rrect, T.txt
      T.rrect = function(...)
        local g, o = origRrect(...)
        caps[#caps + 1] = { 'fill', g }
        return g, o
      end
      T.txt = function(...)
        local c = origTxt(...)
        caps[#caps + 1] = { 'text', c }
        return c
      end
      tabItems = T.tabs(0, 222, 520, TAB_LABELS, tab, function(i)
        T.go('codex', { tab = i, sel = 1 })
      end, { namePrefix = 'hit_codex_tab_' })
      T.rrect, T.txt = origRrect, origTxt
      for k = 1, #caps do
        if caps[k][1] == 'fill' then
          tabFills[#tabFills + 1] = caps[k][2]
        else
          tabTxts[#tabTxts + 1] = caps[k][2]
        end
      end
    end

    local function paintTab(i, focused)
      if tabFills[i] then
        T.tint(tabFills[i], focused and T.th.accent or (i == tab and T.th.accentSoft or T.th.panel2))
      end
      if tabTxts[i] then
        T.setTxtColor(tabTxts[i], focused and T.th.onAccent or (i == tab and T.th.accent or T.th.text2))
      end
    end

    for i = 1, #tabItems do
      local idx = i
      tabItems[i].onFocus = function(f) paintTab(idx, f) end
    end
    paintTab(tab, false)

    -- ---- 版面：≤4 条走 2×2，5~6 条走 3×2；「网格 + 详情」整组居中 --------
    local cols = (#list <= 4) and 2 or 3
    local GAP = 18
    local gridW = cols * 218 + (cols - 1) * GAP
    local compLeft = -(gridW + 40 + 340) / 2
    local gridX = compLeft + gridW / 2
    local px, py = compLeft + gridW + 40 + 170, -24

    -- ---- 右侧详情：先摆好本组每一条，只留选中那条可见 --------------------
    local panel = T.card(px, py, 340, 420,
      { radius = 18, fill = T.th.card, border = T.th.cardBorder, hi = T.withA(T.P.white, 110) })
    local detailBases = {}
    local descTop, descW, descSize = -52, 310, 13
    for i, it in ipairs(list) do
      local found = codexSeen(it.id)
      local b0 = #T.controls
      codexArt(it, px, 116, 1)
      local tag = found and it.tag or '未收录'
      mkBadge(px, -10, tag, found and T.th.accentSoft or T.th.line,
        found and T.th.accent or T.th.text3)
      local body
      local nLines = 1
      if found then
        body = it.desc .. '\n\n' .. (FLAVOR[it.id] or '')
      else
        body = '尚未在霜华纪中留下记录。\n\n雪落在这页纸上，还没有化开。'
      end
      local perLine = math.floor((descW - 4) / descSize)
      body, nLines = wrapCJK(body, perLine)
      local th = T.textH(descSize, nLines)
      T.txt(px, descTop - th / 2, descW, th, descSize, body, T.th.text2, 'Middle', 'Middle')
      local base = {}
      T.captureBase(base, since(b0))
      if i ~= sel then T.shiftBase(base, 0, -2400) end
      detailBases[i] = base
    end
    T.divider(px, -34, 280, { color = T.th.line })
    local selIt = list[sel]
    local nameTxt = T.txt(px, 26, 300, 44, 24, codexSeen(selIt.id) and selIt.name or '？？？',
      T.th.text, 'Middle', 'Middle')
    local capTxt = T.txt(px, -196, 300, 24, 12,
      codexSeen(selIt.id) and '收录于 霜华纪 · 第 1 章' or '尚未收录 · 未知的风景',
      T.th.text3, 'Middle', 'Middle')

    -- ---- 左侧网格：2 列（≤4 条）或 3 列（5~6 条）------------------------
    local COLX, ROWY = {}, {}
    for c = 1, cols do
      COLX[c] = gridX - (cols - 1) * (218 + GAP) / 2 + (c - 1) * (218 + GAP)
    end
    local rows = math.ceil(#list / cols)
    if rows <= 1 then
      ROWY = { 12 }
    else
      ROWY = { 96, -72 }
    end
    local function setDetail(i)
      for j = 1, #detailBases do
        T.shiftBase(detailBases[j], 0, j == i and 0 or -2400)
      end
      local it = list[i]
      local found = codexSeen(it.id)
      T.setTxt(nameTxt, found and it.name or '？？？')
      T.setTxt(capTxt, found and '收录于 霜华纪 · 第 1 章' or '尚未收录 · 未知的风景')
    end

    for i, it in ipairs(list) do
      local cx = COLX[(i - 1) % cols + 1]
      local cy = ROWY[math.floor((i - 1) / cols) + 1]
      local found = codexSeen(it.id)
      local b0 = #T.controls
      T.rrect(cx + 4, cy - 7, 218, 150, 16, T.withA(T.th.text, 14))
      local bd = T.rrect(cx, cy, 218, 150, 16, found and T.th.borderSoft or T.th.line)
      local face = T.rrect(cx, cy, 214, 146, 15, found and T.th.card or T.th.panel2)
      codexArt(it, cx, cy + 22, 0.5)
      T.txt(cx, cy - 44, 190, 26, 16, found and it.name or '未收录 · ？？？',
        found and T.th.text or T.th.text3, 'Middle', 'Middle')
      local tag = found and it.tag or '未收录'
      local bw = badgeW(tag)
      mkBadge(cx + 99 - bw / 2, cy + 56, tag, found and T.th.accentSoft or T.th.line,
        found and T.th.accent or T.th.text3)
      local base = {}
      T.captureBase(base, since(b0))
      local function paint(on)
        T.tint(bd, on and T.th.accent or (found and T.th.borderSoft or T.th.line))
        T.tint(face, on and T.th.panelHi or (found and T.th.card or T.th.panel2))
        T.shiftBase(base, 0, on and 2 or 0)
      end
      if i == sel then paint(true) end
      T.item({
        x = cx, y = cy, w = 218, h = 150, name = 'hit_codex_item_' .. i, focusPad = 6,
        onConfirm = function() T.go('codex', { tab = tab, sel = i, focus = 5 + i }) end,
        onFocus = function(on)
          paint(on)
          if on then setDetail(i) end
        end,
      })
    end

    -- ---- 网格下方的册页题记：把 2 行网格以下的空当收住 ------------------
    T.divider(gridX, -176, gridW, { color = T.withA(T.th.accent, 80) })
    T.txt(gridX - gridW / 2, -202, 380, 24, 12, '霜华纪 · 第一章「雪线」', T.th.text3, 'Left', 'Middle')
    T.txt(gridX + gridW / 2, -202, 260, 24, 12, '雪落时记下的旧事', T.th.text3, 'Right', 'Middle')

    T.footer({
      { key = '←→', label = '切换页签' },
      { key = '↑↓', label = '选择' },
      { key = 'Q', label = '返回' },
    })

    T.screen.defaultFocus = params.focus or (1 + tab)
    T.screen.key = function(a)
      local f = T.focus or 0
      if (a == 'left' or a == 'right') and f >= 2 and f <= 5 then
        local nt = tab + ((a == 'right') and 1 or -1)
        if nt < 1 then nt = 4 elseif nt > 4 then nt = 1 end
        T.go('codex', { tab = nt, sel = 1 })
        return
      end
      if a == 'up' then T.moveFocus(0, 1)
      elseif a == 'down' then T.moveFocus(0, -1)
      elseif a == 'left' then T.moveFocus(-1, 0)
      elseif a == 'right' then T.moveFocus(1, 0)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.go('menu') end
    end
  end

  -- ==========================================================================
  -- B. 设置
  -- ==========================================================================
  T.screenFns.settings = function(params)
    params = params or {}
    T.pageBg('day')
    T.header('设置', '声音、动效与画面', { right = '设置会立即生效' })
    T.backBtn(function() T.go('menu') end)

    T.card(0, -24, 880, 500, { radius = 20, fill = T.th.card, border = T.th.cardBorder })

    local ROWY = { 160, 96, 32, -32, -96 }
    local rows = {
      { label = '音效', hint = '按钮、命中的反馈音', icon = 'spark' },
      { label = '环境音', hint = '雪原的风，会一直陪着你', icon = 'wind' },
      { label = '动效强度', hint = '转场、悬停与飘雪的幅度', icon = 'snow' },
      { label = '文字描边', hint = '浅色画面上的字会更清楚', icon = 'book' },
      { label = '画质', hint = '粒子与光晕的密度', icon = 'eye' },
    }
    for i, r in ipairs(rows) do
      local y = ROWY[i]
      T.icon(r.icon, -378, y + 7, 11, T.th.accent)
      T.txt(-352, y + 7, 250, 30, 17, r.label, T.th.text, 'Left', 'Middle')
      T.txt(-352, y - 17, 300, 22, 12, r.hint, T.th.text3, 'Left', 'Middle')
    end

    -- ---- 自绘开关（轨道 + 圆 knob）-------------------------------------
    local function mkSwitch(y, name, on, apply)
      local cx = 320
      local track = T.rrect(cx, y, 92, 36, 18, on and T.th.accent or T.th.line)
      local knob = T.img(cx - 28, y, 28, 28, 'circle', T.P.white)
      local kb = {}
      T.captureBase(kb, knob)
      local stateTxt = T.txt(248, y, 44, 24, 12, on and '开' or '关',
        on and T.th.accent or T.th.text3, 'Right', 'Middle')
      local function paint(v)
        T.tint(track, v and T.th.accent or T.th.line)
        T.shiftBase(kb, v and 56 or 0, 0)
        T.setTxt(stateTxt, v and '开' or '关')
        T.setTxtColor(stateTxt, v and T.th.accent or T.th.text3)
      end
      paint(on)
      T.item({
        x = cx, y = y, w = 116, h = 48, name = name, focusPad = 6,
        onConfirm = function()
          local v = not on
          on = v
          paint(v)
          apply(v)
        end,
        onFocus = function(f)
          T.setTxtColor(stateTxt, f and T.th.accent2 or (on and T.th.accent or T.th.text3))
        end,
      })
    end

    -- ---- 三选胶囊 ------------------------------------------------------
    local function mkPills(y, cur, labels, names, onPick)
      for i = 1, 3 do
        local x = 116 + (i - 1) * 106
        local on = (i == cur)
        local g = T.rrect(x, y, 96, 34, 17, on and T.th.accent or T.th.panel2)
        local t = T.txt(x, y, 88, 28, 12, labels[i],
          on and T.th.onAccent or T.th.text2, 'Middle', 'Middle')
        T.item({
          x = x, y = y, w = 100, h = 40, name = names[i], focusPad = 5,
          onConfirm = function() onPick(i) end,
          onFocus = function(f)
            if on then return end
            T.tint(g, f and T.th.accentSoft or T.th.panel2)
            T.setTxtColor(t, f and T.th.accent or T.th.text2)
          end,
        })
      end
    end

    mkSwitch(ROWY[1], 'hit_settings_sfx', T.opt.sfx, function(v)
      T.opt.sfx = v
      T.log('opt sfx=' .. tostring(v))
      if v then T.sfx(T.SFX.click) end
    end)

    mkSwitch(ROWY[2], 'hit_settings_ambient', T.opt.ambient, function(v)
      T.opt.ambient = v
      T.setAmbient(v)
      T.log('opt ambient=' .. tostring(v))
    end)

    mkPills(ROWY[3], T.opt.motion, { '柔和', '标准', '丰富' },
      { 'hit_settings_motion_1', 'hit_settings_motion_2', 'hit_settings_motion_3' },
      function(i)
        T.opt.motion = i
        T.log('opt motion=' .. i)
        T.go('settings', { focus = 3 + i })
      end)

    mkSwitch(ROWY[4], 'hit_settings_outline', T.opt.outline, function(v)
      T.opt.outline = v
      for i = 1, #T.texts do T.trySet(T.texts[i], 'enableOutline', v) end
      T.log('opt outline=' .. tostring(v))
    end)

    mkPills(ROWY[5], T.opt.quality, { '省电', '均衡', '极致' },
      { 'hit_settings_quality_1', 'hit_settings_quality_2', 'hit_settings_quality_3' },
      function(i)
        T.opt.quality = i
        T.log('opt quality=' .. i)
        T.go('settings', { focus = 7 + i })
      end)

    T.divider(0, -140, 780, { color = T.th.line })

    panelBtn(-130, -200, 220, 48, '操作说明', function()
      T.openHelp('settings')
    end, 'hit_settings_help', false)

    panelBtn(130, -200, 220, 48, '重置进度', function()
      T.openConfirm('重置霜华纪记录？', '关卡星级、图鉴与养成进度都会清空。', function()
        local rec = T.records
        rec.stars = { 0, 0, 0, 0, 0, 0 }
        rec.best = { 0, 0, 0, 0, 0, 0 }
        rec.unlocked = { true, true, false, false, false, false }
        rec.visited = { false, false, false, false, false, false }
        rec.consts = { true, true, true, false, false, false }
        rec.clears = 0
        rec.maxCombo = 0
        rec.totalShots = 0
        rec.achv = {}
        rec.exp = 0
        rec.mats = { crystal = 0, qingxin = 0, snow = 0, mora = 0, page = 0 }
        T.codexSeen = {}
        T.log('records reset')
        T.toast('记录已重置')
      end)
    end, 'hit_settings_reset', true)

    T.footer('↑↓ 选择 · 空格切换 · Q 返回')

    T.screen.defaultFocus = params.focus or 2
    T.screen.key = function(a)
      if a == 'up' then T.moveFocus(0, 1)
      elseif a == 'down' then T.moveFocus(0, -1)
      elseif a == 'left' then T.moveFocus(-1, 0)
      elseif a == 'right' then T.moveFocus(1, 0)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.go('menu') end
    end
  end

  -- ==========================================================================
  -- C. 制作名单
  -- ==========================================================================
  T.screenFns.credits = function(params)
    T.pageBg('night', { moonX = 0, moonY = 120, moonR = 100, stars = 40, aurora = false })
    T.snowfall(22, {})
    T.screenFrame()

    local px, py, pw, ph = 0, -14, 860, 520
    T.card(px, py, pw, ph, {
      radius = 20,
      fill = T.th.panel,
      border = T.withA(T.th.accent2, 150),
      hi = T.withA(T.th.accent2, 46),
    })

    -- 标题：字距拉开的三字牌
    local chars = { '霜', '华', '纪' }
    for i = 1, #chars do
      T.txt((i - (#chars + 1) / 2) * 62, 196, 60, 60, 40, chars[i], T.th.accent2, 'Middle', 'Middle')
    end
    T.titleFlourish(0, 158, 300, T.withA(T.th.accent2, 170))
    T.txt(0, 134, 420, 24, 11, 'F R O S T B L O O M', T.th.accent, 'Middle', 'Middle')
    T.txt(0, 108, 460, 26, 13, '一个关于雪、契约与归途的故事', T.th.text2, 'Middle', 'Middle')

    T.divider(0, 82, 700, { color = T.th.line })

    -- 两列名单
    local leftCol, rightCol = -370, 60
    local function columnHead(x, title)
      T.txt(x, 58, 260, 24, 12, title, T.th.accent2, 'Left', 'Middle')
      T.img(x + 165, 42, 330, 1.2, 'rect', T.withA(T.th.accent2, 90))
    end
    local function credit(x, y, role, name)
      T.txt(x, y, 170, 24, 12, role, T.th.text3, 'Left', 'Middle')
      T.img(x + 176, y, 1.2, 13, 'rect', T.withA(T.th.accent2, 110))
      T.txt(x + 186, y, 200, 24, 14, name, T.th.text, 'Left', 'Middle')
    end

    columnHead(leftCol, '企划 · 设计')
    credit(leftCol, 16, '企划 · 世界观', '霜华纪制作组')
    credit(leftCol, -16, '角色设计', '甘雨 · 麒麟')
    credit(leftCol, -48, '界面设计', '雪原事务所')

    columnHead(rightCol, '实现 · 打磨')
    credit(rightCol, 16, '程序', '千星 Lua 客户端')
    credit(rightCol, -16, '美术实现', '纯图元手绘')
    credit(rightCol, -48, '音效', '霜风与铃')
    credit(rightCol, -80, '测试', '看到这里的你')

    T.divider(0, -110, 560, { color = T.th.line })
    T.txt(0, -136, 560, 26, 14, '特别感谢：愿意在落雪时停下来的你', T.th.accent2, 'Middle', 'Middle')

    -- 底部小饰：细线 + 六角冰晶
    T.img(-150, -170, 260, 1.2, 'rect', T.withA(T.th.accent, 70))
    T.img(150, -170, 260, 1.2, 'rect', T.withA(T.th.accent, 70))
    T.snowflake(0, -170, 11, T.withA(T.th.accent, 200), { core = T.th.accent2 })

    T.txt(0, -194, 420, 24, 11, 'v' .. tostring(T.VERSION) .. ' · Build ' .. tostring(T.BUILD_ID),
      T.th.text3, 'Middle', 'Middle')

    T.button(0, -238, 240, 44, '返回主菜单', function()
      T.go('menu')
    end, { kind = 'primary', name = 'hit_credits_back', radius = 22 })

    T.footer('Q / 空格 返回主菜单')

    T.screen.defaultFocus = 1
    T.screen.key = function(a)
      if a == 'back' or a == 'confirm' then
        T.go('menu')
      elseif a == 'up' then T.moveFocus(0, 1)
      elseif a == 'down' then T.moveFocus(0, -1)
      elseif a == 'left' then T.moveFocus(-1, 0)
      elseif a == 'right' then T.moveFocus(1, 0) end
    end
  end
end


-- ===== 45_overlays.lua =====
-- ============================================================================
-- 弹层：暂停 / 指南 / 确认
-- ============================================================================
T = T or {}

T.openPause = function()
  if T.overlay then return end
  local ctx = T.mode
  T.openOverlay('pause', function()
    local p = T.overlayPanel(520, 430, '暂停', '霜雪暂歇，风还在等你')
    local panel, w, h = p.panel, p.w, p.h
    local y0 = 46
    T.button(0, y0, 320, 54, '继续挑战', function() T.closeOverlay() end,
      { kind = 'primary', name = 'hit_pause_resume' })
    T.button(0, y0 - 70, 320, 50, '重新开始', function()
      T.closeOverlay()
      T.go('battle', { stage = T.battle and T.battle.stageId or 1 })
    end, { kind = 'secondary', name = 'hit_pause_retry' })
    T.button(0, y0 - 130, 320, 50, '设置', function()
      T.closeAllOverlays()
      T.go('settings')
    end, { kind = 'secondary', name = 'hit_pause_settings' })
    T.button(0, y0 - 190, 320, 50, '返回地图', function()
      T.closeAllOverlays()
      T.go('map', { chapter = 1, sel = 1 })
    end, { kind = 'ghost', name = 'hit_pause_quit' })
    T.txt(0, -h / 2 + 34, 380, 22, 11, '当前进度：' .. (ctx == 'battle' and '战斗进行中' or ctx), T.th.text3, 'Middle', 'Middle')
    T.closeButton(w / 2 - 40, h / 2 - 40, function() T.closeOverlay() end, 'hit_pause_close')
  end, {
    pausesGame = true, defaultFocus = 1,
    key = function(a)
      if a == 'up' then T.moveFocus(0, 1)
      elseif a == 'down' then T.moveFocus(0, -1)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.closeOverlay() end
    end,
  })
end

T.openHelp = function(context)
  if T.overlay then return end
  T.openOverlay('help', function()
    local p = T.overlayPanel(920, 560, '霜华指南', '操作、战斗与养成')
    local panel, w, h = p.panel, p.w, p.h
    local cols = {
      { x = -300, title = '操作', icon = 'user', items = {
        { '鼠标悬停', '瞄准敌人，出现霜华准星' },
        { '鼠标点击', '射出霜华矢' },
        { '↑ ↓ ← →', '选择 / 移动焦点' },
        { '空格 / J', '确认' },
        { 'E', '释放元素战技 / 爆发' },
        { 'Q', '返回上一层' },
        { 'H', '打开本指南' },
      } },
      { x = 0, title = '战斗', icon = 'snow', items = {
        { '瞄准', '把光标停在敌人身上' },
        { '射击', '点击命中，积攒元素能量' },
        { '连击', '短时间内连续命中会累计 COMBO' },
        { '冰莲', '能量满后按 E 释放降众天华' },
        { '波次', '清空三波敌人即可完成挑战' },
        { '计时', '在限定时间内完成，星级更高' },
      } },
      { x = 300, title = '养成', icon = 'const', items = {
        { '等级', '通过冒险阅历提升，上限受突破限制' },
        { '突破', '消耗霜华之蕊与冰晶核，提升上限' },
        { '天赋', '提升霜华矢与降众天华的威力' },
        { '命之座', '点亮相应的命星，解锁额外效果' },
        { '图鉴', '记录遇到过的敌人与拾得的材料' },
      } },
    }
    for _, col in ipairs(cols) do
      T.img(col.x - 148, -26, 1.2, 272, 'rect', T.th.line)
      T.icon(col.icon, col.x - 124, 128, 10, T.th.accent2)
      T.txt(col.x - 104, 128, 200, 28, 17, col.title, T.th.text, 'Left', 'Middle')
      for i, it in ipairs(col.items) do
        local yy = 86 - (i - 1) * 42
        T.txt(col.x - 128, yy + 8, 260, 24, 13, it[1], T.th.accent, 'Left', 'Middle')
        T.txt(col.x - 128, yy - 11, 268, 22, 11, it[2], T.th.text2, 'Left', 'Middle')
      end
    end
    T.button(0, -h / 2 + 40, 220, 44, '知道了', function() T.closeOverlay() end,
      { kind = 'primary', name = 'hit_help_close' })
    T.closeButton(w / 2 - 36, h / 2 - 36, function() T.closeOverlay() end, 'hit_help_x')
  end, {
    pausesGame = true, defaultFocus = 1,
    key = function(a)
      if a == 'back' or a == 'confirm' or a == 'help' then T.closeOverlay() end
    end,
  })
end

T.openConfirm = function(title, desc, onYes, opts)
  opts = opts or {}
  if T.overlay then return end
  T.openOverlay('confirm', function()
    local p = T.overlayPanel(560, 280, title, desc)
    local w, h = p.w, p.h
    T.button(-96, -h / 2 + 58, 160, 48, opts.cancelLabel or '取消', function() T.closeOverlay() end,
      { kind = 'secondary', name = 'hit_confirm_cancel' })
    T.button(96, -h / 2 + 58, 160, 48, opts.okLabel or '确定', function()
      T.closeOverlay()
      if onYes then onYes() end
    end, { kind = 'danger', name = 'hit_confirm_ok' })
  end, {
    pausesGame = true, defaultFocus = 2,
    key = function(a)
      if a == 'left' then T.moveFocus(-1, 0)
      elseif a == 'right' then T.moveFocus(1, 0)
      elseif a == 'up' then T.moveFocus(0, 1)
      elseif a == 'down' then T.moveFocus(0, -1)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.closeOverlay() end
    end,
  })
end


-- ===== 50_main.lua =====
-- ============================================================================
-- 入口：OnStart / OnUpdate / 键位映射
-- 键位实证：Enum.KeyboardKeyCode = CraftspersonKey1..43 + 具名键（见 D137）
-- ============================================================================
T = T or {}

T.keyMap = {
  KeyboardCraftspersonKey36Down = 'up', KeyboardMoveForwardKeyDown = 'up',
  KeyboardCraftspersonKey37Down = 'down', KeyboardMoveBackwardKeyDown = 'down',
  KeyboardCraftspersonKey38Down = 'left', KeyboardMoveLeftKeyDown = 'left',
  KeyboardCraftspersonKey39Down = 'right', KeyboardMoveRightKeyDown = 'right',
  KeyboardJumpKeyDown = 'confirm', KeyboardInteractKeyDown = 'confirm',
  KeyboardCharacterSkill2KeyDown = 'back', KeyboardCraftspersonKey42Down = 'back',
  KeyboardCraftspersonKey15Down = 'help',
  KeyboardNormalAttackKeyDown = 'attack',
  KeyboardDropKeyDown = 'skill',
  KeyboardCharacterSkill4KeyDown = 'debug',
}

T.onKey = function(action)
  if not action or T.transition then return end
  if T.lastAction == action and T.lastActionFrame == T.frame then return end
  T.lastAction, T.lastActionFrame = action, T.frame
  if action == 'debug' then
    T.log('debug hotkey, screen=' .. tostring(T.mode))
    return
  end
  if action == 'help' and not (T.overlay and T.overlay.name == 'help') then
    T.openHelp(T.mode)
    return
  end
  if T.screen and T.screen.key then T.screen.key(action); return end
  if T.overlay and T.overlay.key then T.overlay.key(action); return end
  if action == 'up' then T.moveFocus(0, 1)
  elseif action == 'down' then T.moveFocus(0, -1)
  elseif action == 'left' then T.moveFocus(-1, 0)
  elseif action == 'right' then T.moveFocus(1, 0)
  elseif action == 'confirm' then T.confirmFocus()
  end
end

T.probeOne = function(guid, kind)
  local ok, ctl = pcall(function() return game.InstantiateClientUIControl(guid, T.root) end)
  if not ok or not ctl then return false end
  local good = false
  if kind == 'prim' then
    good = pcall(function()
      ctl.imageColor = T.P.white
      ctl:SetImage(Enum.ImageSource.StaticReference, 100002)
      ctl:SetSizeDelta(10, 10)
    end)
  elseif kind == 'label' then
    good = pcall(function()
      ctl.text = '霜'
      ctl.fontSize = 20
      ctl.fontColor = T.P.ink
    end)
    if good then
      local isWindow = pcall(function() ctl.showScrollBar = false end)
      if isWindow then good = false end
    end
  elseif kind == 'hit' then
    local hasFn = pcall(function() return ctl.AddCursorEventListener end)
    local fn = hasFn and ctl.AddCursorEventListener or nil
    local isButton = pcall(function() ctl.interactable = true end)
    good = type(fn) == 'function' and not isButton
  end
  pcall(function() game.DestroyClientUIControl(ctl) end)
  return good
end
T.discoverTemplates = function()
  local missing = {}
  for _, k in ipairs({ 'prim', 'label', 'hit' }) do
    if not T.probeOne(T.tpl[k], k) then missing[#missing + 1] = k end
  end
  if #missing == 0 then return true end
  T.log('discover missing=' .. table.concat(missing, ','))
  local ranges = { { 1073741825, 1073742050 }, { 1073742100, 1073742150 }, { 1073742400, 1073742600 } }
  for _, r in ipairs(ranges) do
    for guid = r[1], r[2] do
      for i = #missing, 1, -1 do
        local k = missing[i]
        if T.probeOne(guid, k) then
          T.tpl[k] = guid
          T.log('discover ' .. k .. '=' .. guid)
          table.remove(missing, i)
          if #missing == 0 then return true end
        end
      end
    end
  end
  T.log('discover incomplete: ' .. table.concat(missing, ','))
  return false
end
T.probeTemplates = function()
  local all = true
  for _, k in ipairs({ 'prim', 'label', 'hit' }) do
    local ok = T.probeOne(T.tpl[k], k)
    T.log('probe', k, tostring(T.tpl[k]), ok and 'ok' or 'FAIL')
    if not ok then all = false end
  end
  if not all then
    local ok = T.discoverTemplates()
    T.log('discover result=' .. tostring(ok))
  end
end

function OnStart()
  local ok, err = xpcall(function()
    T.root = script.object
    if not T.root then error('script.object is nil') end
    T.root.showCursor = true
    script:EnableUpdate(true)
    T.layout()
    T.log('onstart version=' .. T.VERSION .. ' build=' .. T.BUILD_ID)
    T.probeTemplates()
    T.setSeed(20261028)
    if type(Enum) == 'table' and Enum.KeyCode then T.keyEnum = Enum.KeyCode end
    for raw, action in pairs(T.keyMap) do
      local okKey, errKey
      if T.keyEnum and T.keyEnum[raw] ~= nil then
        okKey, errKey = pcall(function()
          T.root:AddKeyEventListener(T.keyEnum[raw], function() T.onKey(action) end)
        end)
      end
      if not okKey then
        okKey, errKey = pcall(function()
          T.root:AddKeyEventListener(raw, function() T.onKey(action) end)
        end)
      end
      if not okKey then T.warn('key fail ' .. raw .. ' :: ' .. tostring(errKey)) end
    end
    T.log('keys registered')
    T.build('boot')
  end, function(e)
    return tostring(e) .. '\n' .. debug.traceback('', 2)
  end)
  if not ok then
    T.warn('OnStart FAILED :: ' .. tostring(err))
    print(T.prefix .. ' OnStart FAILED :: ' .. tostring(err))
  end
end

function OnUpdate(dt)
  if not T.root then return end
  local ok, err = xpcall(function()
    T.tick(math.min(dt or 0.016, 0.05))
  end, function(e)
    return tostring(e) .. '\n' .. debug.traceback('', 2)
  end)
  if not ok then T.warn('OnUpdate FAILED :: ' .. tostring(err)) end
end

