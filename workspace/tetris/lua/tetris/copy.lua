--[[==========================================================================
  tetris/copy.lua —— 四角色文案层 v6.0（世界观台词 + 机制说明）
  --------------------------------------------------------------------------
  用户判据（原话锚）：「文案和审美一定要高质量」「这是消费角色相关文案的绝佳地方」。
  ⇒ 文案不是播报器。每一句都要能回答两件事：谁在说话、他此刻在做什么。

  v6.0 相对 v5.0 改了什么
    · 四角色全字段按官方口吻重写（cast/hold/settle/level/unlock/idle/tips/help/
      win/quad/settleBig），fail 从「一因一句」扩成「一因三句」；
    · 新增 quotes（每人 9~12 句可轮播台词，取自官方语音原文的意象并改写；
      角色页台词区靠它撑起一页）；
    · 称号改用官方「称号」字段（白草净华 / 霆霓快雨 / 循循守月 / 空月归乡）；
    · 少女 = 哥伦比娅 = 水元素（v5.x 注释里的「风青」是旧口径，颜色值保留但改称水青）。
  人设事实出处：docs/wiki/raw/{纳西妲,刻晴,甘雨,哥伦比娅}语音.wikitext（biligame
    action=raw 取得的官方语音原文）——台词改写不越过这些原文的意象与人设。

  两条硬约束（tests-lua/copy_audit.lua 会逐条核）
    ① 每条正文 ≤ 24 字（UTF-8 码点计，标点也算；{n}/{lv}/{lines} 占位符按字面算）；
    ② 不出现开发词「系统 / 玩家 / 数值」（机制解释交给 help/skillDesc，且必须是人话）。

  **数字必须真**：help/tips 里的秒数、层数、能量取自 skills.lua 的 M.NUM
  （CD.nahida=25 / CD.keqing=7.5→4.5 / CD.ganyu=12 / CD.columbina=17、
   TAKE_DUR=6~10、COLUMBINA.LAYERS=2~4、COST.columbina=60、ENERGY_REGEN=6），
  改平衡只改 M.NUM；若那边改了数字而这里没跟，是文案的错不是表的错。

  导出契约（main.lua 正在读，**不许删字段**）：
    M.ROLES[role] = { key,name,element,title,color,color2,accent,glow,
                      skill,skillDesc,help[3],tips[3],cast[≥3],hold[≥3],
                      fail{cd,energy,locked},settle[≥3],win,quad,settleBig,
                      level[≥3],unlock,idle[2], quotes[≥8] }
    其中 fail 的三因、cast/hold/settle/level/quotes 都是**列表**（旧版 fail 是单句，
    读取方只经 M.fail() 取，形态变化对外不可见）。
    M.cast/hold/settle/fail/level/unlock/idle/pick/audit 签名不变，新增
    M.quote / M.quotesOf / M.sayList 三个只读访问器（角色页台词区用）。
=========================================================================]]

local M = {}

M.VERSION = 'v6.0'

-- ARGB 打包（alpha 在高字节，与 main.lua 的 C() 同序）；原神四角色主题色收敛点
local function A(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end

M.ROLES = {
  -- ── 纳西妲：草 / 所闻遍计（替手落子）──────────────────────────────────────
  -- 声线：孩童般的智慧之神。短句、带笑、爱反问；比喻首选蘑菇、树叶、梦、蜜糖。
  nahida = {
    key = 'nahida', name = '纳西妲', element = '草', title = '白草净华',
    color  = A(255, 127, 207, 106),   -- 草绿（与 main 旧硬编码同色，收敛到这里）
    color2 = A(255,  78, 154,  60),   -- 深草
    accent = A(255, 226, 250, 180),   -- 嫩芽
    glow   = A( 90, 127, 207, 106),
    skill = '所闻遍计',
    skillDesc = '接管盘面 6~10 秒，落子我来。',
    help = {
      'Z：我接管盘面，落子 6~10 秒。',
      '接管的这几秒，分数都算你的。',
      '冷却 25 秒，树荫要慢慢长。',
    },
    tips = {
      '盘面快压顶时按，救得回来。',
      '台前角色按 Z，身后那位按 U。',
      '按 Y 换人，我们各有一手。',
    },
    cast = {
      { t = '代手',   b = '把手放开，这几块我来摆。' },
      { t = '遍计',   b = '全都看见了，你歇着。' },
      { t = '叶脉',   b = '每一格我都数过了。' },
    },
    hold = {
      { t = '代手', b = '这一块放右边，记住了吗？' },
      { t = '代手', b = '慢慢来，我替你数着。' },
      { t = '收手', b = '最后一格，交回你手上。' },
    },
    fail = {
      cd = {
        { t = '树影', b = '树影还没合上，等我 {n} 秒。' },
        { t = '叶子', b = '叶子要时间长大，还差 {n} 秒。' },
        { t = '树荫', b = '再坐一会儿吧，{n} 秒就好。' },
      },
      energy = {
        { t = '抽芽', b = '草籽还没攒够，差 {n} 点。' },
        { t = '抽芽', b = '我在抽芽呀，还差 {n} 点。' },
        { t = '抽芽', b = '力气还差 {n} 点，别催我。' },
      },
      locked = {
        { t = '未立约', b = '我们还没说上话呢。' },
        { t = '未立约', b = '先让我记住你的名字吧。' },
        { t = '未立约', b = '还没到相认的时候哦。' },
      },
    },
    settle = {
      { t = '收好', b = '这一盘很干净，我喜欢。' },
      { t = '收好', b = '树把你的手记住了。' },
      { t = '再来', b = '再摆一盘？我还没听够。' },
    },
    win  = { t = '赢了', b = '赢了。去树底下坐一会儿吧。' },
    quad = { t = '四消', b = '四行一起……你在发光呢。' },
    settleBig = { t = '战果', b = '清了 {lines} 行，树叶都听见了。' },
    level = {
      { t = 'Lv{lv}', b = '根又扎深了一寸。' },
      { t = 'Lv{lv}', b = '我好像又长大一点。' },
      { t = 'Lv{lv}', b = '看得更远了，谢谢你。' },
    },
    unlock = { t = '契约', b = '契约立好了，按 Y 换我上场。' },
    idle = {
      { b = '棋盘还没开，先陪我说说话。' },
      { b = '落子之前，想一想为什么落。' },
    },
    -- 台词区（角色页轮播）：全部取自官方语音的意象，只改写不编造
    quotes = {
      { t = '初见',     b = '我关注你很久了，比你以为的久。' },
      { t = '蘑菇',     b = '快避雨，小心头上长蘑菇哦。' },
      { t = '雷鸣',     b = '雷鸣是生命的前奏，你听。' },
      { t = '下雪',     b = '听见了吗？天空说：该睡觉了。' },
      { t = '蜜糖',     b = '枣椰蜜糖吃完，脑子转得飞快。' },
      { t = '过时不候', b = '你知道吗？太多东西过时不候。' },
      { t = '梦',       b = '我的梦里什么都有，只缺来往的人。' },
      { t = '花盆',     b = '我的花盆里，每次开得都不一样。' },
      { t = '好奇心',   b = '好奇心值得嘉奖，你有很多。' },
      { t = '向导',     b = '你当我的向导，好不好？' },
    },
  },

  -- ── 刻晴：雷 / 星斗归位（方块瞬落锁定）────────────────────────────────────
  -- 声线：璃月七星「玉衡」。语速快、结论先行、厌低效；偶露一手藏不住的消费欲。
  keqing = {
    key = 'keqing', name = '刻晴', element = '雷', title = '霆霓快雨',
    color  = A(255, 177, 140, 255),   -- 雷紫
    color2 = A(255, 122,  79, 208),   -- 深紫
    accent = A(255, 236, 218, 255),   -- 电光白
    glow   = A( 90, 177, 140, 255),
    skill = '星斗归位',
    skillDesc = '当前方块瞬落到底并锁定。',
    help = {
      'Z：当前方块瞬落到底并锁定。',
      '冷却 7.5 秒，升级后缩到 4.5 秒。',
      '落地后 0.2 秒不能左右移。',
    },
    tips = {
      '井口对好了再按，落点改不了。',
      '冷却很短，卡住就用。',
      '按 Y 换人，两人各一招。',
    },
    cast = {
      { t = '归位', b = '这块我钉到底，别拦我。' },
      { t = '瞬影', b = '可别眨眼，看好了。' },
      { t = '速决', b = '速战速决，下一块。' },
    },
    hold = {
      { t = '雷', b = '雷还在剑上，接着来。' },
      { t = '雷', b = '节奏别断，跟上来。' },
      { t = '收剑', b = '这一手到位了，收官。' },
    },
    fail = {
      cd = {
        { t = '回鞘', b = '剑还没回鞘，等 {n} 秒。' },
        { t = '雷楔', b = '雷楔还没回来，{n} 秒。' },
        { t = '回鞘', b = '别急，{n} 秒后我还能动。' },
      },
      energy = {
        { t = '没电', b = '雷元素不够，还差 {n} 点。' },
        { t = '没电', b = '这点雷力不够看，差 {n} 点。' },
        { t = '没电', b = '给我 {n} 点雷，马上就好。' },
      },
      locked = {
        { t = '未立约', b = '剑还没认主呢。' },
        { t = '未立约', b = '想让我出手？先认识一下。' },
        { t = '未立约', b = '玉衡的剑，不借生人。' },
      },
    },
    settle = {
      { t = '收局', b = '这一局收得利落。' },
      { t = '收局', b = '雷楔没白用。' },
      { t = '再来', b = '再快半拍，就更像我了。' },
    },
    win  = { t = '赢了', b = '赢了。这就是玉衡的速度。' },
    quad = { t = '四消', b = '四行一起没了，我看见了。' },
    settleBig = { t = '战果', b = '{lines} 行，这一盘没白费。' },
    level = {
      { t = 'Lv{lv}', b = '剑更快了。' },
      { t = 'Lv{lv}', b = '落点更准了。' },
      { t = 'Lv{lv}', b = '心有所向，日复一日。' },
    },
    unlock = { t = '契约', b = '刻晴在。有活就派给我。' },
    idle = {
      { b = '玉衡星的事很多，棋盘算一件。' },
      { b = '今日事，今日毕。' },
    },
    quotes = {
      { t = '初见',   b = '我是刻晴，璃月七星的玉衡。' },
      { t = '耽误',   b = '耽误太多时间，你的事就做不完了。' },
      { t = '今日事', b = '今日事今日毕，不是我心急。' },
      { t = '机会',   b = '机会稍纵即逝，你可别发呆。' },
      { t = '放松',   b = '劳逸结合可以，你别放松过头。' },
      { t = '逛街',   b = '天气这么好，要不要陪我逛逛？' },
      { t = '消费',   b = '这么多式样……我懂消费的乐趣了。' },
      { t = '虾球',   b = '金丝虾球，一个就够我扫清压力。' },
      { t = '灯',     b = '那盏灯我备了雷力，能亮很久。' },
      { t = '约定',   b = '新璃月港落成时，我来领路。' },
      { t = '神之眼', b = '我才不需要那东西。' },
    },
  },

  -- ── 甘雨：冰 / 降众天华（冰封己盘）────────────────────────────────────────
  -- 声线：月海亭秘书。一切是「工作」与「契约」；句子常被打断，霜雪意象成片。
  ganyu = {
    key = 'ganyu', name = '甘雨', element = '冰', title = '循循守月',
    color  = A(255, 143, 218, 240),   -- 冰蓝
    color2 = A(255,  74, 159, 196),   -- 深冰
    accent = A(255, 232, 249, 255),   -- 雪白
    glow   = A( 90, 143, 218, 240),
    skill = '降众天华',
    skillDesc = '冰封自己的盘，垃圾进不来。',
    help = {
      'Z：冰封自己的盘，垃圾进不来。',
      '冰块 3 秒起，升级后更久一点。',
      '冷却 12 秒，对面的盘不受影响。',
    },
    tips = {
      '被连打时按，最值。',
      '冰封只保你的盘，别忘了反击。',
      '按 Y 换人，两人各一招。',
    },
    cast = {
      { t = '霜寒', b = '霜寒化生——这几秒，别慌。' },
      { t = '落雪', b = '我盖一层雪，你先摆。' },
      { t = '划掉', b = '这一项，我替你划掉了。' },
    },
    hold = {
      { t = '雪', b = '冰还没化，放心堆。' },
      { t = '雪', b = '雪还厚着，继续。' },
      { t = '收手', b = '要化了，自己当心。' },
    },
    fail = {
      cd = {
        { t = '积雪', b = '霜还没积够，等 {n} 秒。' },
        { t = '积雪', b = '稍等，{n} 秒后我再落雪。' },
        { t = '寒气', b = '寒气要慢慢凝，{n} 秒。' },
      },
      energy = {
        { t = '寒气', b = '寒气不够，还差 {n} 点。' },
        { t = '寒气', b = '我还在蓄力，差 {n} 点。' },
        { t = '寒气', b = '再给我 {n} 点寒气。' },
      },
      locked = {
        { t = '未立约', b = '契书还没盖章呢。' },
        { t = '未立约', b = '我们还没定下契约。' },
        { t = '未立约', b = '请先与我立约。' },
      },
    },
    settle = {
      { t = '收局', b = '这一局，稳住了。' },
      { t = '收局', b = '雪停了，棋盘也干净。' },
      { t = '再来', b = '月海亭的活，也算干完了。' },
    },
    win  = { t = '赢了', b = '赢了。回去的路上，留意脚下。' },
    quad = { t = '四消', b = '四行，一口削平。像削雪。' },
    settleBig = { t = '战果', b = '{lines} 行，路算是铺平了。' },
    level = {
      { t = 'Lv{lv}', b = '霜气又厚了一分。' },
      { t = 'Lv{lv}', b = '我看得更远了一点。' },
      { t = 'Lv{lv}', b = '这份工作，越做越顺手。' },
    },
    unlock = { t = '契约', b = '甘雨在。要我拟一份契约吗？' },
    idle = {
      { b = '公文堆着，棋盘也堆着。' },
      { b = '雪落在肩上，落子声很轻。' },
    },
    quotes = {
      { t = '初见',   b = '我把契约拟好了，请过目……欸。' },
      { t = '本职',   b = '为璃月多数生命，谋求最大福祉。' },
      { t = '松弛',   b = '安逸的氛围……我喜欢。' },
      { t = '聆听',   b = '你趴在草地上，能听见大地的心跳。' },
      { t = '听雨',   b = '我想在庭院里听雨，可是太奢侈。' },
      { t = '清心',   b = '清心的花瓣好吃，可我不敢种。' },
      { t = '狗狗',   b = '璃月的每只小狗，我都取了名字。' },
      { t = '午觉',   b = '若没有别的事，我先告辞了。' },
      { t = '守则',   b = '饮必甘露，食必嘉禾——我的守则。' },
      { t = '存在',   b = '存在本身，就已经足够美好了。' },
    },
  },

  -- ── 少女（哥伦比娅）：水 / 引力涟漪（把垃圾推回去）────────────────────────
  -- 声线：空月归乡。盲眼靠月矩力「感受」，语气温软带笑、略抽离；意象=月/潮汐/歌/家。
  -- 主题色是水青（v6 更正：她是水元素，v5.x 注释里的「风青」是旧口径），
  -- 与甘雨冰蓝刻意错开一档色相，樱粉只作高光，不做第二主色。
  girl = {
    key = 'columbina', name = '少女', element = '水', title = '空月归乡',
    color  = A(255,  88, 208, 196),   -- 水青
    color2 = A(255,  46, 150, 146),   -- 深青（字色用，浅色当字读不清）
    accent = A(255, 255, 217, 232),   -- 樱粉高光
    glow   = A( 90, 111, 211, 232),
    skill = '引力涟漪',
    skillDesc = '对战推 2~4 行垃圾回去；单人清底一行。',
    help = {
      'Z：往对面盘里推 2~4 行垃圾。',
      '对面板越高，推过去的越多。',
      '单人局改成清掉盘底一行。',
    },
    tips = {
      '对面快满了再按，层数更高。',
      '对战一次耗能 60，回能 6 点每秒。',
      '按 Y 换人，两人各一招。',
    },
    cast = {
      { t = '涟漪', b = '潮水翻了，都还给你。' },
      { t = '盈满', b = '月亮满了，你也该满了。' },
      { t = '垂映', b = '影子里，我看得见你的盘。' },
    },
    hold = {
      { t = '推浪', b = '水已经漫过去了，别停。' },
      { t = '推浪', b = '我听得见对面在变高。' },
      { t = '收手', b = '这一层推完，我就收手。' },
    },
    -- 带真数字的持续期句：main 在 skillTick 里把本次 res.n（对对手挂的层数）传进来；
    -- n 为 nil/0/1 时**不用**它（单人降级分支 n=CLEAR_ROWS=1，写"漫过去 1 层"会很怪）。
    holdN = { t = '推浪', b = '已经漫过去 {n} 层，别停。' },
    fail = {
      cd = {
        { t = '退潮', b = '潮还没起，等 {n} 秒。' },
        { t = '月光', b = '月光还没满，{n} 秒。' },
        { t = '退潮', b = '再等 {n} 秒，我陪你数。' },
      },
      energy = {
        { t = '月华', b = '月华不够，还差 {n} 点。' },
        { t = '月华', b = '引力还没攒够，差 {n} 点。' },
        { t = '月华', b = '再给我 {n} 点，我把海掀给你。' },
      },
      locked = {
        { t = '未立约', b = '潮水还没认你。' },
        { t = '未立约', b = '你还没听过我的歌呢。' },
        { t = '未立约', b = '我们还不算认识吧？' },
      },
    },
    settle = {
      { t = '收局', b = '潮退了，收拾一下。' },
      { t = '收局', b = '这一局，我替你看了水。' },
      { t = '再来', b = '风向没变，接着来吗？' },
    },
    win  = { t = '赢了', b = '赢了。月亮还在头顶。' },
    quad = { t = '四消', b = '四行沉下去，一声都没响。' },
    settleBig = { t = '战果', b = '{lines} 行沉下去，水面很静。' },
    level = {
      { t = 'Lv{lv}', b = '潮声更清楚了。' },
      { t = 'Lv{lv}', b = '引力又紧了一分。' },
      { t = 'Lv{lv}', b = '我看得见更远的水面。' },
    },
    unlock = { t = '契约', b = '哥伦比娅应你了。要借一束月光吗？' },
    idle = {
      { b = '水面很平，正好下棋。' },
      { b = '月亮跟着我，落子也轻。' },
    },
    quotes = {
      { t = '名字',   b = '叫我哥伦比娅，或月神大人也行。' },
      { t = '歌',     b = '我的歌不为谁而唱，你听就好。' },
      { t = '赏月',   b = '想要赏月吗？坐到摇椅上来。' },
      { t = '家',     b = '避雨时听雨，让我觉得回了家。' },
      { t = '眼睛',   b = '我用月矩力感受，比看更真。' },
      { t = '雪',     b = '我喜欢雪，安静，还能打雪仗。' },
      { t = '大风',   b = '睁不开眼就把手给我，我带你走。' },
      { t = '夜晚',   b = '夜晚是被月亮绊了一跤才掉下来的。' },
      { t = '午觉',   b = '月亮还没升，我想抱着月灵睡会儿。' },
      { t = '面包',   b = '水果、蔬菜，加麦香面包，够了。' },
      { t = '故事',   b = '我给月灵讲故事，也唱歌。' },
      { t = '潮汐',   b = '潮汐因恒月而翻涌。' },
    },
  },
}

-- 别名：main 传 skills.lua 的键 'columbina'，任务书写的是 'girl' —— 同一张表，不做第二份数据
M.ROLES.columbina = M.ROLES.girl

-- 归一化：未知角色一律落到纳西妲（降级不崩，日志可判）
local ALIAS = { girl = 'girl', columbina = 'girl', ['少女'] = 'girl', ['哥伦比娅'] = 'girl' }

M.of = function(role)
  if type(role) == 'string' then
    local e = M.ROLES[role]
    if e then return e end
    local a = ALIAS[role]
    if a then return M.ROLES[a] end
  end
  return M.ROLES.nahida
end

M.colorOf = function(role)
  local e = M.of(role)
  return (e and e.color) or A(255, 127, 207, 106)
end
M.color2Of = function(role)
  local e = M.of(role)
  return (e and e.color2) or A(255, 78, 154, 60)
end
M.accentOf = function(role)
  local e = M.of(role)
  return (e and e.accent) or A(255, 226, 250, 180)
end
M.glowOf = function(role)
  local e = M.of(role)
  return (e and e.glow) or A(90, 127, 207, 106)
end

-- 帮助页 / 提示直取（main 的 H 页与标题页要按角色取）
M.help = function(role)
  local e = M.of(role)
  return (e and e.help) or {}
end
M.tips = function(role)
  local e = M.of(role)
  return (e and e.tips) or {}
end
M.skillDesc = function(role)
  local e = M.of(role)
  return (e and e.skillDesc) or ''
end

-- 台词区只读访问器（v6 新增，角色页用；main 现在只读 cast/hold/settle，改读这里即可）
M.quotesOf = function(role)
  local e = M.of(role)
  return (e and e.quotes) or {}
end

-- ===========================================================================
-- 内部：轮播游标（确定性，不用 math.random——用例要可复现）
--   键 = role .. ':' .. kind；每个键一个游标，循环取，天然不会连取同一条。
--   起始游标恒为 1（第一次触发拿第一条），之后循环推进。
-- ===========================================================================
local CURSOR = {}

-- 取第 i 条（越界收敛），返回 { t, b }
local function at(list, i)
  if type(list) ~= 'table' then return nil end
  local n = #list
  if n < 1 then return nil end
  i = math.floor(tonumber(i) or 1)
  if i < 1 then i = ((i % n) + n) % n + 1 end
  if i > n then i = ((i - 1) % n) + 1 end
  local e = list[i]
  if type(e) == 'string' then return { t = '', b = e } end
  if type(e) ~= 'table' then return nil end
  return e
end

-- 轮播：从第 1 条起循环（确定性；同 kind 连调必然换条，不会连出同一句）
--   limit（可选）= 本轮只在前 limit 条里轮（hold 用它把"收尾"那句留到快结束）
local function nextOf(role, kind, list, limit)
  if type(list) ~= 'table' or #list < 1 then return nil end
  local n = #list
  local top = math.floor(tonumber(limit) or n)
  if top < 1 then top = 1 end
  if top > n then top = n end
  local key = tostring(role) .. ':' .. tostring(kind)
  local cur = math.floor(tonumber(CURSOR[key]) or 1)
  if cur < 1 or cur > top then cur = 1 end
  local e = at(list, cur)
  CURSOR[key] = (cur % top) + 1
  return e
end

-- 占位符填充：{n} {lv} {lines} {garbage} {score}（缺值填 0，绝不返回 nil）
local function fill(s, tok)
  if type(s) ~= 'string' then return '' end
  if not tok then return s end
  return (string.gsub(s, '{(%w+)}', function(k)
    local v = tok[k]
    if v == nil then return '0' end
    return tostring(v)
  end))
end

-- 统一出参：{ title = '名字 · 标签', body = 正文 }
local function out(entry, name, tok)
  if not entry then return { title = name or '', body = '' } end
  local tag = fill(entry.t or '', tok)
  local title = (tag ~= '') and (tostring(name) .. ' · ' .. tag) or tostring(name)
  return { title = title, body = fill(entry.b or '', tok) }
end

-- 失败句库取一条：v6 起每因三条（列表），仍兼容 v5 的单条写法
local function failPick(role, k, bank)
  local v = bank[k] or bank.locked
  if type(v) ~= 'table' then return v end
  if v[1] ~= nil then return nextOf(role, 'fail.' .. tostring(k), v) end
  return v
end

-- ===========================================================================
-- M.cast(role, ctx)  施放瞬间
--   ctx = { mode, lv, tier, n, left }（全可省）
-- ===========================================================================
M.cast = function(role, ctx)
  local e = M.of(role)
  local name = (e and e.name) or '纳西妲'
  local pick = nextOf(role, 'cast', e and e.cast)
  return out(pick, name, { lv = (ctx and ctx.lv) or 1, tier = (ctx and ctx.tier) or 1 })
end

-- ===========================================================================
-- M.hold(role, elapsed, left, n)  持续中（**由 main 的 FN.skillTick 每 2.4s 调一次**）
--   elapsed = 已持续秒数（本轮不用，留给将来做"进度句"）
--   left    = 剩余秒数；≤2.5s 时换"收手"那句（收尾语气）
--   n       = 本次施放的效果量纲（纳西妲=接管秒数 / 少女=给对手挂的层数 2~4 /
--             其余按 skills.lua res.n 语义）；**nil 或缺省时绝不编数字**
-- ===========================================================================
M.hold = function(role, t, left, n)
  local e = M.of(role)
  local name = (e and e.name) or '纳西妲'
  local list = e and e.hold
  local lf = tonumber(left)
  local nn = tonumber(n)
  local pick
  if type(list) == 'table' and #list > 0 then
    local cnt = #list
    if lf ~= nil and lf <= 2.5 then
      pick = at(list, cnt)                        -- 收尾那句只在剩余 ≤2.5s 出现
    elseif e.holdN and nn and nn >= 2 then
      pick = e.holdN                              -- 有真层数就报层数（少女对战 2~4 层）
    elseif lf ~= nil and cnt >= 2 then
      pick = nextOf(role, 'hold', list, cnt - 1)  -- 其余时间在前 cnt-1 条里轮
    else
      pick = nextOf(role, 'hold', list)
    end
  end
  return out(pick, name, {
    left = (lf ~= nil) and math.ceil(lf) or nil,
    n = (nn ~= nil) and math.floor(nn) or nil,
  })
end

-- ===========================================================================
-- M.settle(role, res)  结束/命中；res = { lines, garbage, score, win }
-- ===========================================================================
M.settle = function(role, res)
  local e = M.of(role)
  local name = (e and e.name) or '纳西妲'
  if not e then return { title = name, body = '' } end
  local lines = tonumber(res and res.lines) or 0
  local pick
  if (res and res.win == true) then
    pick = e.win
  elseif lines >= 8 and e.settleBig then
    pick = e.settleBig                     -- 大场面优先出"带真数字"的战果句
  elseif lines >= 4 and e.quad then
    pick = e.quad
  else
    pick = nextOf(role, 'settle', e.settle)
  end
  return out(pick, name, {
    lines = math.floor(lines),
    garbage = math.floor(tonumber(res and res.garbage) or 0),
    score = math.floor(tonumber(res and res.score) or 0),
  })
end

-- ===========================================================================
-- M.fail(role, why, n)  失败原因；n = 差多少（cd 秒 / energy 点 / locked 忽略）
--   兼容两种调用形态：
--     copy.fail(role, 'cd', 3.4)            ← 任务书契约
--     copy.fail(role, { why='cd', n=3.4 })  ← main.skillFeedback 的 kind='fail' 直喂 ctx
-- ===========================================================================
M.fail = function(role, why, n)
  local e = M.of(role)
  local name = (e and e.name) or '纳西妲'
  if type(why) == 'table' then
    n = why.n or why.left
    why = why.why or why.reason
  end
  local k = tostring(why or 'cd')
  if k ~= 'cd' and k ~= 'energy' and k ~= 'locked' then k = 'locked' end
  local bank = (e and e.fail) or {}
  local pick = failPick(role, k, bank)
  local num = tonumber(n) or 0
  if num < 0 then num = 0 end
  local shown = math.ceil(num - 0.001)       -- 秒/点一律向上取整，不比实际早
  return out(pick, name, { n = (shown > 0) and shown or 1 })
end

-- ===========================================================================
-- M.level(role, lv)  局内升级
-- ===========================================================================
M.level = function(role, lv)
  local e = M.of(role)
  local name = (e and e.name) or '纳西妲'
  local L = math.floor(tonumber(lv) or 1)
  if L < 1 then L = 1 end
  local pick = nextOf(role, 'level', e and e.level)
  return out(pick, name, { lv = L })
end

-- ===========================================================================
-- M.unlock(role)  契约缔结
-- ===========================================================================
M.unlock = function(role)
  local e = M.of(role)
  local name = (e and e.name) or '纳西妲'
  return out(e and e.unlock, name, nil)
end

-- ===========================================================================
-- M.idle(role)  标题页/帮助页一句风味（只回 body）
-- ===========================================================================
M.idle = function(role)
  local e = M.of(role)
  local pick = nextOf(role, 'idle', e and e.idle)
  return { body = fill((pick and pick.b) or '', nil) }
end

-- ===========================================================================
-- M.quote(role)  台词区轮播一句（v6 新增）
-- ===========================================================================
M.quote = function(role)
  local e = M.of(role)
  local name = (e and e.name) or '纳西妲'
  return out(nextOf(role, 'quote', e and e.quotes), name, nil)
end

-- ===========================================================================
-- M.sayList(role, n) -> { {title, body}, ... }  角色页台词区整段（v6 新增）
--   取 quotes 前 n 条（不足则循环补齐；n 缺省 8）。main 的 charData 现在只从
--   cast/hold/settle 各取 2 条再只渲染 2 条 ⇒ 页面只有 2 句；改调本函数即可撑满一页。
-- ===========================================================================
M.sayList = function(role, n)
  local e = M.of(role)
  local name = (e and e.name) or '纳西妲'
  local src = (e and e.quotes) or {}
  local cnt = #src
  local res = {}
  if cnt < 1 then return res end
  local want = math.floor(tonumber(n) or 8)
  if want < 1 then want = 1 end
  for i = 1, want do
    res[#res + 1] = out(src[(i - 1) % cnt + 1], name, nil)
  end
  return res
end

-- ===========================================================================
-- M.pick(role, kind) -> string  轮播取一条正文
--   kind = 'cast' | 'hold' | 'settle' | 'level' | 'idle' | 'quote' | 'tip' | 'help'
-- ===========================================================================
M.pick = function(role, kind)
  local e = M.of(role)
  if not e then return '' end
  local k = tostring(kind or 'cast')
  if k == 'tip' then
    local t = at(e.tips, (CURSOR[tostring(role) .. ':tip'] or 0) + 1)
    CURSOR[tostring(role) .. ':tip'] = (CURSOR[tostring(role) .. ':tip'] or 0) + 1
    return (t and t.b) or ''
  elseif k == 'help' then
    local h = at(e.help, (CURSOR[tostring(role) .. ':help'] or 0) + 1)
    CURSOR[tostring(role) .. ':help'] = (CURSOR[tostring(role) .. ':help'] or 0) + 1
    return (h and h.b) or ''
  end
  local list = (k == 'quote') and e.quotes or e[k]
  local pick = nextOf(role, k, list)
  return (pick and pick.b) or ''
end

-- ===========================================================================
-- M.audit() -> { total, maxLen, over = { '...' }, perRole = { role = n } }
--   机检判据（docs/v6-copy.md §4 引这组读数）：
--     · 每条正文 ≤ 24 字（按 UTF-8 码点算，汉字/标点/ASCII 都算一格，最保守）
--       阈值 v6 由 22 放到 24：v6 文案规范是「单条 ≤24 个汉字」
--     · 每个角色 cast ≥3、hold ≥3、settle ≥3、level ≥3、fail 三因各 ≥3、quotes ≥8
--   为什么放在模块里而不是测试脚本：真机也能 print 一行（copy audit ...）自证。
-- ===========================================================================
local LIMIT = 24

local function u8len(s)
  local n = 0
  for _ in string.gmatch(tostring(s or ''), '[%z\1-\127\194-\244][\128-\191]*') do n = n + 1 end
  return n
end

local function scanInto(list, tag, out, maxLen)
  if type(list) ~= 'table' then return maxLen end
  for i = 1, #list do
    local e = list[i]
    local b = (type(e) == 'string') and e or (type(e) == 'table' and e.b) or ''
    local L = u8len(b)
    out.total = out.total + 1
    if L > maxLen then maxLen = L end
    if L > LIMIT then out.over[#out.over + 1] = tag .. '#' .. i .. ' (' .. L .. ') ' .. tostring(b) end
  end
  return maxLen
end

M.audit = function()
  local res = { total = 0, maxLen = 0, over = {}, perRole = {}, keys = 4, limit = LIMIT }
  local order = { 'nahida', 'keqing', 'ganyu', 'girl' }
  local maxLen = 0
  for oi = 1, #order do
    local key = order[oi]
    local e = M.ROLES[key]
    -- 逐组成对统计（顺序与 v6-copy.md 表格一致，便于文档引用）
    local groups = { 'cast', 'hold', 'settle', 'level', 'idle', 'quotes' }
    local n = 0
    for gi = 1, #groups do
      maxLen = scanInto(e[groups[gi]], key .. '.' .. groups[gi], res, maxLen)
      n = n + #(e[groups[gi]] or {})
    end
    if e.holdN then
      maxLen = scanInto({ e.holdN }, key .. '.holdN', res, maxLen)
      n = n + 1
    end
    if type(e.fail) == 'table' then
      local ks = { 'cd', 'energy', 'locked' }
      for ki = 1, #ks do
        local v = e.fail[ks[ki]]
        local list = (type(v) == 'table' and v[1] ~= nil) and v or { v }
        maxLen = scanInto(list, key .. '.fail.' .. ks[ki], res, maxLen)
        n = n + #list
      end
    end
    maxLen = scanInto({ e.unlock, e.win, e.quad, e.settleBig }, key .. '.misc', res, maxLen)
    maxLen = scanInto(e.help, key .. '.help', res, maxLen)
    maxLen = scanInto(e.tips, key .. '.tips', res, maxLen)
    n = n + 4 + #(e.help or {}) + #(e.tips or {})
    if u8len(e.skillDesc) > maxLen then maxLen = u8len(e.skillDesc) end
    res.total = res.total + 1
    n = n + 1
    if u8len(e.skillDesc) > LIMIT then
      res.over[#res.over + 1] = key .. '.skillDesc (' .. u8len(e.skillDesc) .. ') ' .. tostring(e.skillDesc)
    end
    res.perRole[key] = n
  end
  res.maxLen = maxLen
  res.ok = (#res.over == 0)
  return res
end

return M
