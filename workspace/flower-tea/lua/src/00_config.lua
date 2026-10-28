-- ============================================================================
-- 《花间茶会》 · 配置与文案
-- 纯图元 2D UI（circle / rect / triangle / fourstar / fivestar / ring）
-- ============================================================================
T = T or {}

T.VERSION = '1.0.0'
T.BUILD_ID = '__BUILD_ID__'
T.DESIGN_W, T.DESIGN_H = 1280, 720
T.DEBUG = false

-- 颜色：ARGB 整数
T.C = function(a, r, g, b)
  return a * 16777216 + r * 65536 + g * 256 + b
end
T.withA = function(c, a)
  return a * 16777216 + (c % 16777216)
end
T.alphaOf = function(c) return math.floor(c / 16777216) % 256 end
T.mix = function(c1, c2, t)
  local a1, r1, g1, b1 = math.floor(c1 / 16777216) % 256, math.floor(c1 / 65536) % 256,
    math.floor(c1 / 256) % 256, c1 % 256
  local a2, r2, g2, b2 = math.floor(c2 / 16777216) % 256, math.floor(c2 / 65536) % 256,
    math.floor(c2 / 256) % 256, c2 % 256
  local function m(x, y) return math.floor(x + (y - x) * t + 0.5) end
  return T.C(m(a1, a2), m(r1, r2), m(g1, g2), m(b1, b2))
end

-- 主色板：奶油底 + 低饱和马卡龙色
T.P = {
  ink       = T.C(255, 74, 58, 74),
  ink2      = T.C(255, 122, 104, 120),
  ink3      = T.C(255, 167, 150, 162),
  cream     = T.C(255, 255, 253, 248),
  cream2    = T.C(255, 255, 248, 238),
  paper     = T.C(255, 252, 243, 232),
  white     = T.C(255, 255, 255, 255),
  line      = T.C(255, 236, 220, 210),
  shadow    = T.C(255, 229, 215, 207),
  rose      = T.C(255, 242, 167, 190),
  roseDeep  = T.C(255, 217, 108, 147),
  roseLight = T.C(255, 253, 228, 236),
  mint      = T.C(255, 168, 223, 196),
  mintDeep  = T.C(255, 95, 175, 138),
  mintLight = T.C(255, 227, 246, 236),
  sky       = T.C(255, 169, 205, 240),
  skyDeep   = T.C(255, 92, 134, 200),
  skyLight  = T.C(255, 229, 242, 252),
  lilac     = T.C(255, 205, 180, 232),
  lilacDeep = T.C(255, 138, 107, 191),
  lilacLight= T.C(255, 239, 230, 251),
  butter    = T.C(255, 247, 216, 139),
  butterDeep= T.C(255, 217, 169, 78),
  butterLight=T.C(255, 255, 246, 218),
  peach     = T.C(255, 247, 203, 176),
  gold      = T.C(255, 232, 184, 92),
  goldLight = T.C(255, 250, 226, 168),
  red       = T.C(255, 214, 99, 99),
  green     = T.C(255, 95, 175, 138),
  bgTop     = T.C(255, 255, 249, 240),
  bgMid     = T.C(255, 253, 240, 244),
  bgBot     = T.C(255, 233, 247, 239),
}

-- 音效 id（tetris 已实测白名单；语义待听感确认，均为内置小整数 id）
T.SFX = {
  click   = 50884,  -- 0.151s
  hover   = 50883,  -- 0.151s
  confirm = 50884,
  back    = 50872,  -- 1.024s
  match   = 50917,  -- 0.785s
  combo   = 40001,  -- 1.653s
  win     = 40054,  -- 2.000s
  lose    = 50929,  -- 0.978s
  ambient = 10002,  -- 环境_风声_温和 69.736s（每 69s 手动续播）
}

-- 四席角色（立绘由 20_art.lua 的纯图元画法生成）
T.chars = {
  {
    id = 1, name = '甘雨', en = 'GANYU', title = '月下冰露', element = '冰',
    chapter = 1, quote = '若是不嫌弃……我可以再陪你坐一会儿。',
    desc = '循着清心的香气来的半仙少女。她泡的茶微凉，回甘却很长。',
    likes = '清心 · 甜甜花 · 午后的云',
    stats = { 3, 5, 3 }, statNames = { '甜度', '清香', '暖意' },
    main = T.P.sky, deep = T.P.skyDeep, light = T.P.skyLight, accent = T.P.rose,
  },
  {
    id = 2, name = '刻晴', en = 'KEQING', title = '紫电晚风', element = '雷',
    chapter = 2, quote = '既然来了，就尝尝我亲手泡的茶吧。',
    desc = '把茶会流程精确到分钟的玉衡星。茶点摆盘意外地很有少女心。',
    likes = '金鱼草 · 杏仁豆腐 · 干净的桌面',
    stats = { 4, 4, 3 }, statNames = { '甜度', '清香', '暖意' },
    main = T.P.lilac, deep = T.P.lilacDeep, light = T.P.lilacLight, accent = T.P.butter,
  },
  {
    id = 3, name = '少女', en = 'THE GIRL', title = '甜梦花园', element = '梦',
    chapter = 3, quote = '嘘——茶会开始之前，先做一个甜甜的梦吧。',
    desc = '从梦与花瓣之间来的神秘客人。她总能在茶杯里变出新的糖霜。',
    likes = '糖霜 · 星星 · 没有尽头的下午',
    stats = { 5, 2, 4 }, statNames = { '甜度', '清香', '暖意' },
    main = T.P.rose, deep = T.P.roseDeep, light = T.P.roseLight, accent = T.P.butter,
  },
  {
    id = 4, name = '小草神', en = 'NAHIDA', title = '青芽晨露', element = '草',
    chapter = 4, quote = '今天的茶，是刚长出来的味道哦。',
    desc = '把整座花园当作茶桌的小小神明。她说，每一片新叶都值得被庆祝。',
    likes = '薄荷 · 童话书 · 刚发芽的种子',
    stats = { 3, 4, 5 }, statNames = { '甜度', '清香', '暖意' },
    main = T.P.mint, deep = T.P.mintDeep, light = T.P.mintLight, accent = T.P.butter,
  },
}

T.chapters = {
  { id = 1, char = 1, name = '月下冰露', sub = '第一章 · 璃月山间的清茶', goal = 1500, moves = 20,
    desc = '山风把云吹得很低，甘雨在石桌边温着一壶清心茶。' },
  { id = 2, char = 2, name = '紫电晚风', sub = '第二章 · 玉京台的黄昏', goal = 1900, moves = 19,
    desc = '刻晴把最后一份公文收进抽屉，晚风正好吹动茶旗。' },
  { id = 3, char = 3, name = '甜梦花园', sub = '第三章 · 云端的花园', goal = 2300, moves = 18,
    desc = '少女在云上摆好了糖霜与星星，等你推开梦的门。' },
  { id = 4, char = 4, name = '青芽晨露', sub = '第四章 · 须弥的清晨', goal = 2700, moves = 17,
    desc = '小草神踮着脚，把第一片新叶放进你的茶杯里。' },
}

T.desserts = {
  { id = 1, name = '草莓马卡龙', short = '马卡龙', icon = 'ring', base = T.P.rose, inner = T.P.roseLight,
    deep = T.P.roseDeep, desc = '两片杏仁小圆饼夹着草莓奶油，甜得像一句悄悄话。' },
  { id = 2, name = '蜂蜜蛋糕', short = '蛋糕', icon = 'triangle', base = T.P.butter, inner = T.P.butterLight,
    deep = T.P.butterDeep, desc = '刚出炉的蜂蜜蛋糕，边角有一点点焦香。' },
  { id = 3, name = '薄荷糖果', short = '糖果', icon = 'fourstar', base = T.P.mint, inner = T.P.mintLight,
    deep = T.P.mintDeep, desc = '薄荷糖在舌尖化开，像一阵穿过花园的风。' },
  { id = 4, name = '蓝莓清茶', short = '清茶', icon = 'circle', base = T.P.sky, inner = T.P.skyLight,
    deep = T.P.skyDeep, desc = '蓝莓与清茶的比例刚刚好，杯底沉着两颗小星星。' },
  { id = 5, name = '紫花酥', short = '花酥', icon = 'fivestar', base = T.P.lilac, inner = T.P.lilacLight,
    deep = T.P.lilacDeep, desc = '做成五瓣花形状的酥点，中间点着一小团蜜。' },
}

T.achv = {
  { id = 'first_tea', name = '初赴茶会', desc = '完成第一杯茶。', icon = 'flower' },
  { id = 'combo3', name = '三连好茶', desc = '在一次结算中达成 3 连击。', icon = 'star' },
  { id = 'score3000', name = '满桌茶点', desc = '单局得分达到 3000。', icon = 'cake' },
  { id = 'all_chapters', name = '四季巡礼', desc = '四席茶会都留下过脚印。', icon = 'leaf' },
  { id = 'perfect', name = '完美茶席', desc = '任意茶席拿到三颗星。', icon = 'crown' },
}

T.opt = {
  sfx = true,
  ambient = false,
  motion = 2,       -- 1 柔和 / 2 标准 / 3 丰富
  outline = false,  -- 正文描边（提高复杂背景可读性）
}

T.records = {
  best = { 0, 0, 0, 0 },
  stars = { 0, 0, 0, 0 },
  plays = 0,
  clears = 0,
  totalCleared = 0,
  maxCombo = 0,
  visited = { false, false, false, false },
  achv = {},
}

T.achievementById = {}
for _, a in ipairs(T.achv) do T.achievementById[a.id] = a end

T.SHAPE_ID = {
  rect = 100001, circle = 100002, triangle = 100003,
  fourstar = 100004, fivestar = 100005, ring = 100006,
}
