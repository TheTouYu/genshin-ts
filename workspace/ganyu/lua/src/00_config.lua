-- ============================================================================
-- 《霜华纪》 · 配置 / 色板 / 双主题令牌 / 数据与文案
-- 纯图元 2D UI：rect / circle / triangle / fourstar / fivestar / ring
-- 设计坐标 1280x720（中心原点，+y 向上）
-- ============================================================================
T = T or {}

T.VERSION = '1.0.0'
T.BUILD_ID = '__BUILD_ID__'
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
      scrim = T.C(176, 3, 13, 24), glow = T.C(90, 170, 232, 255),
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
