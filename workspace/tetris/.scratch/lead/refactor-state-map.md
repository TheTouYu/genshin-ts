# tetris 状态地图（重构切分基线）

> **快照**：`lua/main.lua` = 6859 行，sha256 前三段 `3df969b5…4669`，取自 HEAD `207d01b7`（2026-10-31 17:39）。
> 同目录 `lua/tetris/` 共 **15 个模块** = 10 个旧模块（config/widgets/audio/skills/copy/fx/aieval/controls/roster/ui）
> + 5 个新架构骨架（`platform/render/view_board/view_layers/view_node`，HEAD 同提交引入，**main.lua 尚未 require**）。
> ⚠ **并发提示（重要）**：本图生成期间工作树正被另一代理连续重构 —— 17:42 起 main.lua 被改（17:51 = 6864 行、sha `a598e059…`），
> 17:52 前已落三个提交：`d9e634f2` 纯核心层四路抽取（play/ai/skills/input）、`d3995220` 接线第一步、`3b6bce5a` 输入单源 + HUD 文案契约；
> 当前树已有 **28 个模块**（`core_*/view_*/input_map/app/scenes` 等）。
> 因此本图是**抽取前基线**（6859 行）——它的用法是**切分检查清单**：逐项核对新模块是否已把对应状态从本图这几张表里搬走，
> 而不是拿它当当前树的行号索引。
> 本报告所有行号指向 **6859 行基线**；复跑命令见附录 A（`sha256sum lua/main.lua` 对不上时重跑一遍即可复现全部表）。

## 0 结论先行

1. **最大耦合点 = `g`（当前实例引用）**：28 处重绑定（`g = G[i]` / `g = routePlayer(...)`）、107 个字段、466 行读引用，
   **65 个顶层函数**直接读写它；切盘靠"重绑定 upvalue"而不是参数——**任何屏想独立运行，第一个要回答的问题就是"我的 g 是谁"**。
2. **第二耦合点 = `FN` 命名空间**：roster.lua 反写 **14 个键**（9 个 `FN.*` + 5 个 `ROSTER.*`），其中 **12 个 main 从不读**（模块把 main 的函数表当自己的注册表）。
3. **第三耦合点 = `OnStart`（716 行）**：建控件 + 注册输入 + 生命周期 + 模式入口挤在一个函数里；
   输入路由 `routePlayer` 是它的内嵌局部函数（6027），而 `OnUpdate` 内又在 **7 处**重新绑定 `g`（6670/6753/6755/6815/6832/6840/6846）。
4. **最该先拆的三处**：① **输入路由**（OnStart 5991–6506 输入段：23 处 `listen` 注册 + `routePlayer`(6027) + 结算三动作热键）② **结算层**（`g` 的 26 个 `settle*` 字段 + `SETTLE_HOTS`/`SETTLE_ACT`）
   ③ **"当前屏"判据**（`MODE` / `guideStage` / `helpOpen` / `ROSTER.on` 四套判据并存，没有单一屏栈）。

> **本图不覆盖**：模块内部状态（skills 的 SK 状态机字段、ui 的 U 表、fx 的池）、测试断言、控件 GUID 表。
> 它只回答「main.lua 的状态住在哪、谁写谁读、拆屏时各自需要什么」。

## 1 全局状态表

列义：**写入点** = 赋值 / 下标写 / 字段写（不含 `local` 声明）；**读取点** = 该行出现该名字且不是纯赋值目标；
读写同行各计一次。行号为 6859 行基线真实行号。「双屏重绑定」= 双屏时是否随 `g = G[i]` 切换。

### 1.1 脚本全局（`_ENV` 上的名字；本脚本自有 _ENV，不污染引擎）

| 名字 | 类型 | 声明行 | 全部写入点 | 全部读取点 | 语义 | 屏/子系统 | 跨屏共享 | 双屏按实例重绑定 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `BUILD_TAG` | 字符串 | 95 脚本全局 | 赋值 95 | 2693（1） | 构建水印（标题页角标/存档名/日志锚） | 全局·诊断 | 是 | 否 |
| `seed` | 整数 | 96 脚本全局 | 赋值 96,98 | 99（1） | LCG 随机种子；`rand()` 每次调用推进 | 玩法·随机源 | 是 | 否（AI 盘走 aiRand 独立流） |
| `MODE` | 字符串 | 117 脚本全局 | 赋值 117,3285,4578,4627 | **66 处** → 附录 B | 当前模式 casual/ai-battle/pvp/coop | 流程·屏选择 | 是 | 否 |
| `MODE_OVER` | 布尔 | 142 脚本全局 | 赋值 142,1699,1712,4566,4603 | 2830,2856,2883,4236,4477,6092,6177,6204,6253,6263,6342,6406,6630,6668,6838（15） | 双屏终局冻结标志（输入/重力/AI 全停） | 结算 | 是 | 否 |
| `MC` | 表(数组) | 120 脚本全局 | 赋值 120,2514 / 下标写 2992,3009,3082,3227,3248 | 2510–2511,3314（3） | 标题屏四模式卡实例（色块×4+文字×8） | 标题屏 | 否 | 否 |
| `HL` | 表(数组) | 123 脚本全局 | 赋值 123,2137 / 下标写 2175,2230,2426 | 2133–2134,2434–2435,2437,2496,2498,3310–3312（10） | 规则说明页实例（暗底+三栏+标题页脚） | 帮助屏 | 否 | 否 |
| `pendingMode` | 字符串/nil | 121 脚本全局(多目标) | 赋值 121,1512,3291,6699 | 1503,3186,3193,3200,3269,6687（6） | 按 Digit 后待进入的模式名（0.5s 大字窗） | 标题屏 | 否 | 否 |
| `pendingT` | 数字 | 121 脚本全局(多目标) | 赋值 121,3291,6688 | 6689,6698（2） | pendingMode 动画倒计时 | 标题屏 | 否 | 否 |
| `helpOpen` | 布尔 | 127 脚本全局 | 赋值 127,2442,2485 | **24 处** → 附录 B | 说明页是否打开（输入门控第一判据） | 帮助屏 | 是(门控) | 否 |
| `helpFromStage` | 整数 | 128 脚本全局 | 赋值 128 | 2451（1） | 开层前的 guideStage，关层时恢复 | 帮助屏 | 是 | 否 |
| `helpPage` | 整数 | 129 脚本全局 | 赋值 129 | 2496,2501（2） | 说明页页码（单页版恒 1） | 帮助屏 | 否 | 否 |
| `IS_MOBILE` | 布尔 | 154 脚本全局 | 赋值 154,5813 | 1576,1581,2038,2732,2740,2759,3278,3666,5359,5981（10） | 平台探测结果（OnStart 写） | 全局·平台 | 是 | 否 |
| `SK` | 表/nil | 320 脚本全局 | 赋值 320,6370 / 下标写 4054 / 字段写 16 处/9 键：cnt@4053；freezeT@4345,6633,6635；freezeRows@4346；switchAt@4408,4444；active@4446,6436,6456；partyMax@6451；party@6452；hudT@6654,6656；…另 1 键 | **90 处** → 附录 B | skills 状态机实例（OnStart 建，模块 getter 惰性取） | 技能 | 是 | 否（仅玩家盘消耗） |
| `ROSTER` | 表 | 4520 脚本全局 | 赋值 4520 | 2828,2838,2856,2883,3264,4529,5430,6060,6062,6395,6607,6795（12） | 角色档案页共享表 on/items/detail/savedTop/savedBot | 名册屏 | 是 | 否 |
| `CANVAS_W` | 整数 | 238 脚本全局(多目标) | 赋值 238,5761,6600 | **28 处** → 附录 B | 画布宽（layout/pollCanvasSize 写） | 全局·布局 | 是 | 否 |
| `CANVAS_H` | 整数 | 238 脚本全局(多目标) | 赋值 238,5761,6600 | **29 处** → 附录 B | 画布高 | 全局·布局 | 是 | 否 |
| `guideStage` | 整数 | 234 脚本全局(多目标) | 赋值 234,1505,1572,1676,1681,4590,4630,5430,5970,6737 | **49 处** → 附录 B | 全局流程阶段 0=AI 演出/1=游戏/2=键位表/3=开局引导 | 流程 | 是 | 否 |
| `bannerTimer` | 数字 | 234 脚本全局(多目标) | 赋值 234,1201,1229,1241,1246,1251,1255,1333,1348,1715,2109,3911,4498,5970,6026,6672,6674 | 1236,6023,6671,6673（4） | 顶部横幅倒计时（>0 时显示事件文字） | HUD | 是 | 否 |
| `frameSeq` | 整数 | 286 脚本全局 | 赋值 286,6669 | 315,2747,2763,3245,5369,6063,6153,6178,6254,6296,6397,6472（12） | 帧号（OnUpdate 每帧 +1；按键回调共用同帧号） | 输入 | 是 | 否 |
| `keyConsumedFrame` | 整数 | 287 脚本全局 | 赋值 287,2763,3245,5369,6063,6178,6254,6296,6397 | 2747,6153,6472（3） | 同帧「键已被动作消费」标记（43 键兜底让位） | 输入 | 是 | 否 |
| `bestScore` | 整数 | 241 脚本全局 | 赋值 241,5972 | 1054,1733,1790,5010,6220,6276（6） | 历史最佳分（结算页/标题页显示） | 结算/标题 | 是 | 否 |
| `introT` | 数字/nil | 236 脚本全局(多目标) | 赋值 236,2035,5971,6709 | 2929,6710（2） | 标题页入场演出计时 | 标题屏 | 否 | 否 |
| `overlay` | 控件/nil | 236 脚本全局(多目标) | 赋值 236,5943 | 1558,3271,4637,5443,6067,6196,6245,6400（8） | 标题页暗角覆盖件 | 标题屏 | 否 | 否 |
| `introFont` | 数字/nil | 237 脚本全局(多目标) | 赋值 237,2035,5971,6712 | 6711（1） | 入场大字号插值 | 标题屏 | 否 | 否 |
| `introPulse` | 数字/nil | 237 脚本全局(多目标) | 赋值 237,2035,5971 | —（0） | 入场脉冲相位 | 标题屏 | 否 | 否 |
| `root` | 控件 | 231 脚本全局 | 赋值 231,5792 / 字段写 1 处/1 键：showCursor@5794 | **61 处** → 附录 B | 脚本根控件（script.object） | 全局 | 是 | 否 |
| `title` | 控件 | 232 脚本全局(多目标) | 赋值 232,377,486,3036,3042,3054,3064,5963 | 526,658,3438,3901,3903,3905,3976–3977,3985,3988,3994,4388,4415,4451,4507,5375,5668,5766,5973,5977（20） | 标题文字控件 | 标题屏 | 是(服务端单份) | 否 |
| `hud` | 控件 | 232 脚本全局(多目标) | 赋值 232,378,5963 | **24 处** → 附录 B | 主 HUD 文本框（分数/等级） | HUD | 是(单份) | 否 |
| `hudNext` | 控件 | 232 脚本全局(多目标) | 赋值 232,381,5963 | 1053,1540,2864,2870,3519–3521,3551,3573,3578,3580,3586,3621,3624,3633,3644,3651,5377,5766（19） | “下一个”标签 | HUD | 是(单份) | 否 |
| `best` | 控件 | 232 脚本全局(多目标) | 赋值 232,382,488,5963 / 字段写 1 处/1 键：x@1921 | **26 处** → 附录 B | 最佳分显示 | 标题/HUD | 是(单份) | 否 |
| `hint` | 控件 | 232 脚本全局(多目标) | 赋值 232,383,5964 | **50 处** → 附录 B | 底部键位提示条 | HUD | 是(单份) | 否 |
| `keyA` | 控件 | 232 脚本全局(多目标) | 赋值 232,384,5964 | **23 处** → 附录 B | 键位卡 A | 标题/HUD | 是(单份) | 否 |
| `keyB` | 控件 | 232 脚本全局(多目标) | 赋值 232,385,5964 | 1037,1519,1611–1615,2864,2870,3440,3551,3573,3594,3621,3623,3633,3644,5381,5768,5974,6077（21） | 键位卡 B | 标题/HUD | 是(单份) | 否 |
| `keyC` | 控件 | 232 脚本全局(多目标) | 赋值 232,386,5964 | 1038,1519,2864,2870,3440,3551,3573,3594,3621,3623,3633,3644,5382,5768,5974（15） | 键位卡 C | 标题/HUD | 是(单份) | 否 |
| `topBanner` | 控件 | 232 脚本全局(多目标) | 赋值 232,387,5965 | **50 处** → 附录 B | 顶部横幅 | HUD | 是(单份) | 否 |
| `botBanner` | 控件 | 232 脚本全局(多目标) | 赋值 232,388,5965 | **57 处** → 附录 B | 底部横幅 | HUD | 是(单份) | 否 |
| `btnA` | 控件 | 389 脚本全局 | 赋值 389 | 5775（1） | 退役按钮 A（仅每屏挪出画布） | 死代码 | 是 | 否 |
| `btnB` | 控件 | 390 脚本全局 | 赋值 390 | 5775（1） | 退役按钮 B | 死代码 | 是 | 否 |
| `btnC` | 控件 | 391 脚本全局 | 赋值 391 | 5775（1） | 退役按钮 C | 死代码 | 是 | 否 |
| `btnD` | 控件 | 392 脚本全局 | 赋值 392 | 5775（1） | 退役按钮 D | 死代码 | 是 | 否 |
| `btnE` | 控件 | 393 脚本全局 | 赋值 393 | 5775（1） | 退役按钮 E | 死代码 | 是 | 否 |
| `btnF` | 控件 | 394 脚本全局 | 赋值 394 | 5775（1） | 退役按钮 F | 死代码 | 是 | 否 |
| `TPL_TEXT` | 字符串/nil | 2121 local | 赋值 3853 | **27 处** → 附录 B | textbox 模板 guid（OnStart 探测） | 全局·模板 | 是 | 否 |
| `UI_STYLE` | 表 | 288 local | 赋值 376 | 288,296（2） | 文字样式基线（font/color/align） | 布局 | 是 | 否 |
| `CTL` | 表/nil | 2702 脚本全局 | 赋值 2702 | 2700,2722,2738,2757,2775,4526（6） | controls 工厂实例（懒建：首次标题布局时） | 标题/结算/名册 | 是 | 否 |
| `AEV` | 表 | 1837 local | — | 1837–1838（2） | aieval 模块句柄 | AI | 是 | 否 |
| `AEVX` | 表 | 1838 local | 赋值 1844 | 1838,1843,1863,1882,4265,4686,4689,4876,4884,5042,5055,5064（12） | AI 评估扩展表（colHeight/stackHeight/wellDepth 等） | AI | 是 | 否 |
| `MODE_BG` | 表 | 72 local | — | 72（1） | 模式→背景图元池配置 | 标题/背景 | 是 | 否 |
| `BG_IMG` | 表(常量) | 79 local | — | 79,796–797,802,2185,2592,3469,3471,3698（9） | 六类内置代理图元 id（rect/circle/triangle/fourstar/fivestar/ring） | 全局·素材 | 是 | 否 |

### 1.2 main chunk 局部状态（`local`；`luac5.3` 实测 **146 locals / 200**，余量 54）

| 名字 | 类型 | 声明行 | 全部写入点 | 全部读取点 | 语义 | 屏/子系统 | 跨屏共享 | 双屏按实例重绑定 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `G` | 表(数组) | 112 local | 下标写 198,4542,4559,4574,4623 | **70 处** → 附录 B | 游戏实例表：G[1] 主盘、双屏 G[2] 第二盘；`newInst()` 造 | 玩法 | 是 | **是**（按下标） |
| `g` | 表引用 | 113 local | 赋值 199,1318,1705,1708,2058,2061,2085,2114,3324,3370,3378,3395,3401,3416,4546,4552,4557,4579,4628,6093,6138,6670,6753,6755,6815,6832,6840,6846 / 下标写 633,1441,2091,3340–3341,3345,3362,3367,5866,5899–5900,5904,5933,5938,5957 / 字段写 305 处/107 键：bagSeq@219,1475；shakeT@355,361,6519,6521；shakePhase@355,361,6518,6521；shakeDur@360；shakeAmp@360；optRecs@416,906；settleBars@438,628；settleLayer@440,563,649；…另 99 键 | **466 处** → 附录 B | 当前实例引用；双屏循环 `for i=1,2 do g=G[i]` 即全函数切盘 | 玩法 | 是 | **是**（重绑定即切盘） |
| `ACTIVE` | 表(数组) | 114 local | 赋值 4543,4560,4576,4625 | 114,3775,3871,6839–6840,6845–6846,6848（8） | 激活实例下标：单屏 {1}、双屏 {1,2} | 玩法 | 是 | 是 |
| `SETTLE_HOTS` | 表(数组) | 124 local | 赋值 415 / 下标写 761,839,900 | 124,412–413（3） | 结算三键鼠标热区（settleDestroy 一并销毁） | 结算 | 是(单份) | 否（双屏后建覆盖） |
| `SETTLE_ACT` | 表 | 126 local | 字段写 3 处/3 键：restart@6234；backHome@6251；detail@6259 | 126,897,6170,6360（4） | 结算三动作函数 restart/detail/backHome（OnStart 赋值） | 结算 | 是 | 否 |
| `TK` | 表 | 136 local | 字段写 27 处/7 键：state@1565,1694,4284,4506,4604,6017,6030,6793,6804；t@1565,1694,4284,4506,4604,6033,6780,6793,6804；skillTier@4286,4506；skillT@4286,4506；takeFrame@6777,6831；offLogged@6789；prevState@6826,6834 | 136,6016,6029,6788,6792,6803,6813,6816,6818,6833,6848（11） | casual 局中接管状态机（state/t/prevState/skillT/skillTier/takeFrame/offLogged 7 键） | 玩法(接管) | 否 | 否 |
| `PERSIST_TIP` | 字符串 | 138 local | 赋值 3667,3673 | 138,3670,3680,6676,6678（5） | 进局底栏常驻操作提示文案 | HUD | 是 | 否 |
| `showPersistTip` | 函数 | 139 local | 赋值 3658 | 139,1666,4614,6757（4） | 前向声明：恢复常驻提示 | HUD | 是 | 否 |
| `GK` | 表 | 145 local | 字段写 14 处/5 键：phase@1573,6082,6481,6738；t@1573,6082,6481,6728,6734；count@1573,6735；p1ready@1587,6475；p2ready@1587 | 145,6071,6073–6079,6081,6474,6476,6478,6480,6729,6731,6733,6736,6762–6763（20） | 双人开局引导阶段机 phase/t/count/p1ready/p2ready | 引导 | 是 | 否 |
| `CNT` | 表/nil | 146 local | 赋值 2459,6086,6485 | 146,2457–2458,6730–6731,6762（6） | 倒计时大字实例（120 号居中） | 倒计时 | 否 | 否 |
| `RHO` | 表 | 147 local | 字段写 3 处/2 键：pieces@4669,6161；lines@6161 | 147,1176,4686–4687,4694–4695（6） | AI 消行率统计 pieces/lines（跨局累计） | AI 统计 | 是 | 否 |
| `MIRRORQ` | 表(数组) | 150 local | 赋值 4544,4577,4626 | 150,2055（2） | ai-battle 出块镜像队列（v2.8 后仅历史路径） | AI 双屏 | 是 | 否 |
| `feedMirror` | 函数 | 151 local | 赋值 2054 | 151（1） | 从镜像队列喂 AI 盘一块 | AI 双屏 | 是 | 否 |
| `TPL_CELL` | 字符串/nil | 152 local | 赋值 5842 | 152,758,2147,2172,2533–2534,2627,2986,3297,3322,3325,3335,3358,3443,3445,3866（16） | cell 模板 guid（OnStart 探测；G[2] 复用） | 全局·模板 | 是 | 否 |
| `TPL_HIT` | 字符串/nil | 153 local | 赋值 5846 | 153,878,880,2707,3210,3213,3238,5412–5413,5420–5421,5555–5556,5847（14） | cursor 热区模板 guid | 全局·模板 | 是 | 否 |
| `menuSelectMode` | 函数 | 156 local | 赋值 3268 | 156,3225,6154,6359（4） | 模式选择统一入口（键盘 Digit 与鼠标点击共用） | 标题屏 | 是 | 否 |
| `UI` | 表 | 291 local | — | 291–293（3） | widgets 模块实例 | 控件层 | 是 | 否 |
| `WIDGETS` | 表 | 293 local | — | 293,298–299,312,5357（5） | = UI（别名） | 控件层 | 是 | 否 |
| `AUDIO` | 表 | 313 local | — | 313–315（3） | audio 模块实例 | 音效 | 是 | 否 |
| `AUDIO_ENGINE` | 表 | 315 local | — | 315–316（2） | = AUDIO 模块句柄 | 音效 | 是 | 否 |
| `SFX` | 表 | 316 local | — | **30 处** → 附录 B | 音效 id 表（audio 导出） | 音效 | 是 | 否 |
| `SKILLS` | 表 | 319 local | 赋值 4527 | **30 处** → 附录 B | skills 模块句柄 | 技能 | 是 | 否 |
| `AI_OBSERVE_MAX` | 数字 | 1799 local | — | 1799,2049,4888,5007,5265,5272（6） | AI 观察窗上限 | AI | 是 | 否 |
| `AIC` | 表 | 1803 local | — | 1803,1814–1818（6） | AI 决策常量（节奏/权重/留井） | AI | 是 | 否 |
| `MENU_STYLE` | 表 | 2978 local | — | 2978,3017,3045,3314（4） | 模式卡样式预设（常态/悬停/按下） | 标题屏 | 是 | 否 |
| `MC_ROW` | 表 | 2979 local | — | 2979,3019,3047,3061,3217（5） | 模式卡行坐标 | 标题屏 | 是 | 否 |
| `MC_ICON` | 表 | 2980 local | — | 2980,3050,3123（3） | 模式卡图标坐标 | 标题屏 | 是 | 否 |
| `MODE_BG_POOL` | 数字 | 72 local(多目标) | — | 72,5859（2） | 背景图元池容量（每模式 ≤17 槽） | 背景 | 是 | 否 |

### 1.3 充当命名空间的表（挂表状态）

| 表 | 声明/创建行 | 键数 | 写入形态 | 读点数 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `FN` | 74 | 66 | 写 77 处 / 下标写 0 处 / 重绑定 4524 | 177 | main 自有函数表（被 roster 反写） |
| `UI4` | 77 | 33 | 写 34 处 / 下标写 1 处 / 重绑定 — | 95 | 命中注册表 + 布局工具 |
| `HUD_INST` | 73 | 5 | 写 5 处 / 下标写 1 处 / 重绑定 — | 108 | HUD 实例双写的名字→控件表 |
| `MS` | 246 | 44 | 写 52 处 / 下标写 10 处 / 重绑定 — | 118 | 标题页展台/图形工厂 |
| `NUM` | 69 | 9 | 写 13 处 / 下标写 0 处 / 重绑定 — | 65 | config 数值源（被 config 与 main 共写） |
| `THEME` | 70 | — | 写 0 处 / 下标写 0 处 / 重绑定 — | 76 | 色板（config 只读给 main） |
| `ROSTER` | 4520 | — | 写 0 处 / 下标写 0 处 / 重绑定 4520 | 12 | 名册共享表 |
| `CTL` | 2702 | — | 写 0 处 / 下标写 0 处 / 重绑定 2702 | 6 | controls 工厂实例 |
| `AEVX` | 1838 | — | 写 0 处 / 下标写 0 处 / 重绑定 1844 | 12 | AI 评估扩展 |
| `SETTLE_ACT` | 126 | 3 | 写 3 处 / 下标写 0 处 / 重绑定 — | 4 | 结算动作表 |
| `TK` | 136 | 7 | 写 27 处 / 下标写 0 处 / 重绑定 — | 11 | 接管状态机 |
| `GK` | 145 | 5 | 写 14 处 / 下标写 0 处 / 重绑定 — | 20 | 引导阶段机 |

### 1.4 实例表 `g` 的字段（107 个键，全部逐实例）

> `newInst()`（168–197）显式初始化 37 个字段（23 条赋值，含多目标行），其余是运行期懒写（结算层/抖动/预览/镜像…）。
> 「读点次数」= `g.<field>` 形式出现次数（含读写同行）。完整行号见附录 B。

| g 字段 | 首次写入行 | 写点行数 | `g.<field>` 读点次数 | 归属 |
| --- | --- | --- | --- | --- |
| `AI.assistLv` | 6823 | 1 | 3 | AI 状态机 |
| `AI.atkMode` | 4866 | 1 | 2 | AI 状态机 |
| `AI.count` | 4668 | 1 | 3 | AI 状态机 |
| `AI.dropped` | 5173 | 2 | 3 | AI 状态机 |
| `AI.dryness` | 1311 | 4 | 5 | AI 状态机 |
| `AI.dur` | 2047 | 4 | 8 | AI 状态机 |
| `AI.fallTimer` | 5174 | 3 | 4 | AI 状态机 |
| `AI.fx` | 1216 | 2 | 5 | AI 状态机 |
| `AI.info` | 5116 | 1 | 1 | AI 状态机 |
| `AI.lines` | 1444 | 1 | 4 | AI 状态机 |
| `AI.nudge` | 5176 | 1 | 2 | AI 状态机 |
| `AI.nudgeAt` | 5177 | 1 | 2 | AI 状态机 |
| `AI.pace` | 5156 | 1 | 7 | AI 状态机 |
| `AI.pace.gaps` | 5204 | 1 | 1 | AI 状态机 |
| `AI.pace.sumGap` | 5205 | 1 | 1 | AI 状态机 |
| `AI.phase` | 2047 | 7 | 8 | AI 状态机 |
| `AI.piece` | 2047 | 6 | 7 | AI 状态机 |
| `AI.qi` | 2047 | 7 | 8 | AI 状态机 |
| `AI.queue` | 2047 | 6 | 9 | AI 状态机 |
| `AI.score` | 1444 | 1 | 6 | AI 状态机 |
| `AI.search` | 2048 | 7 | 22 | AI 状态机 |
| `AI.search.doHoldAfter` | 5049 | 3 | 6 | AI 状态机 |
| `AI.search.done` | 5022 | 1 | 3 | AI 状态机 |
| `AI.search.holdChecked` | 5026 | 1 | 2 | AI 状态机 |
| `AI.softPer` | 5120 | 3 | 4 | AI 状态机 |
| `AI.sumSec` | 4670 | 1 | 2 | AI 状态机 |
| `AI.t` | 2047 | 11 | 17 | AI 状态机 |
| `AI.wait` | 2049 | 7 | 8 | AI 状态机 |
| `AI.wellLog` | 4882 | 1 | 2 | AI 状态机 |
| `acc` | 1448 | 3 | 4 | 盘级玩法 |
| `aiAccount` | 4550 | 1 | 2 | 盘级玩法 |
| `autoDriving` | 2029 | 5 | 20 | 盘级玩法 |
| `b2b` | 1152 | 4 | 5 | 盘级玩法 |
| `bagQ` | 1475 | 1 | 5 | 出块袋 |
| `bagSeq` | 219 | 2 | 5 | 出块袋 |
| `bgPool` | 5858 | 1 | 4 | 控件引用/布局 |
| `board` | 1437 | 3 | 27 | 盘级玩法 |
| `boardOX` | 3402 | 1 | 4 | 控件引用/布局 |
| `cells` | 3333 | 2 | 14 | 控件引用/布局 |
| `combo` | 1147 | 4 | 13 | 盘级玩法 |
| `das.arr` | 1295 | 5 | 6 | 输入手感(T-spin/LD/DAS/Hold) |
| `das.dir` | 6106 | 3 | 8 | 输入手感(T-spin/LD/DAS/Hold) |
| `das.hold` | 6106 | 3 | 5 | 输入手感(T-spin/LD/DAS/Hold) |
| `das.t` | 1295 | 4 | 5 | 输入手感(T-spin/LD/DAS/Hold) |
| `dimApplied` | 925 | 5 | 5 | 控件引用/布局 |
| `dimRatio` | 925 | 5 | 7 | 控件引用/布局 |
| `elapsed` | 1447 | 1 | 11 | 盘级玩法 |
| `flashT` | 1144 | 3 | 5 | 抖屏/闪白动画 |
| `frames` | 3352 | 2 | 10 | 控件引用/布局 |
| `gameOver` | 1102 | 2 | 29 | 盘级玩法 |
| `hardDrop` | 1088 | 2 | 3 | 盘级玩法 |
| `lastRot` | 1100 | 4 | 5 | 输入手感(T-spin/LD/DAS/Hold) |
| `ld.resets` | 1100 | 4 | 6 | 输入手感(T-spin/LD/DAS/Hold) |
| `ld.t` | 1100 | 7 | 12 | 输入手感(T-spin/LD/DAS/Hold) |
| `level` | 1192 | 3 | 30 | 盘级玩法 |
| `lines` | 1443 | 2 | 15 | 盘级玩法 |
| `maxCombo` | 1446 | 2 | 5 | 盘级玩法 |
| `nextBag` | 1085 | 3 | 5 | 盘级玩法 |
| `nextName` | 1480 | 2 | 8 | 盘级玩法 |
| `optRecs` | 416 | 2 | 2 | 结算/选项 |
| `piece` | 1091 | 1 | 104 | 盘级玩法 |
| `piece.cells` | 1413 | 3 | 33 | 盘级玩法 |
| `piece.x` | 1383 | 4 | 46 | 盘级玩法 |
| `piece.y` | 1364 | 10 | 39 | 盘级玩法 |
| `pieceAge` | 1089 | 2 | 3 | 盘级玩法 |
| `pieceCount` | 1290 | 3 | 9 | 盘级玩法 |
| `pieceMoved` | 1088 | 3 | 4 | 盘级玩法 |
| `pieceRotated` | 1088 | 2 | 3 | 盘级玩法 |
| `plate` | 3331 | 2 | 4 | 控件引用/布局 |
| `preview` | 5947 | 1 | 13 | 控件引用/布局 |
| `score` | 1443 | 3 | 14 | 盘级玩法 |
| `settleBars` | 438 | 2 | 15 | 结算层 |
| `settleBest` | 441 | 3 | 10 | 结算层 |
| `settleBorder` | 440 | 3 | 7 | 结算层 |
| `settleBuildTried` | 442 | 2 | 3 | 结算层 |
| `settleCard` | 440 | 3 | 9 | 结算层 |
| `settleDone` | 443 | 4 | 5 | 结算层 |
| `settleExtra` | 441 | 3 | 17 | 结算层 |
| `settleFade` | 443 | 4 | 5 | 结算层 |
| `settleInfo` | 441 | 3 | 10 | 结算层 |
| `settleLayer` | 440 | 3 | 9 | 结算层 |
| `settleNoteIdx` | 1739 | 1 | 2 | 结算层 |
| `settleNoteRGB` | 1741 | 1 | 2 | 结算层 |
| `settleOn` | 443 | 3 | 4 | 结算层 |
| `settleOpen` | 1716 | 2 | 5 | 结算层 |
| `settleOpts` | 441 | 3 | 15 | 结算层 |
| `settleOptsOff` | 5318 | 1 | 3 | 结算层 |
| `settleOptsY` | 5315 | 1 | 5 | 结算层 |
| `settleReady` | 442 | 3 | 12 | 结算层 |
| `settleScore` | 441 | 3 | 10 | 结算层 |
| `settleScrim` | 440 | 3 | 8 | 结算层 |
| `settleSignaled` | 688 | 2 | 3 | 结算层 |
| `settleSize` | 946 | 3 | 5 | 结算层 |
| `settleT` | 443 | 4 | 5 | 结算层 |
| `settleTitle` | 441 | 3 | 19 | 结算层 |
| `settleTitleOff` | 5318 | 1 | 3 | 结算层 |
| `settleTitleY` | 5315 | 1 | 4 | 结算层 |
| `shakeAmp` | 360 | 1 | 4 | 抖屏/闪白动画 |
| `shakeDur` | 360 | 1 | 4 | 抖屏/闪白动画 |
| `shakePhase` | 355 | 4 | 7 | 抖屏/闪白动画 |
| `shakeT` | 355 | 4 | 10 | 抖屏/闪白动画 |
| `st.bag` | 1476 | 4 | 5 | 输入手感(T-spin/LD/DAS/Hold) |
| `st.can` | 1292 | 4 | 7 | 输入手感(T-spin/LD/DAS/Hold) |
| `st.name` | 1476 | 4 | 13 | 输入手感(T-spin/LD/DAS/Hold) |
| `taughtClear` | 1226 | 2 | 3 | 盘级玩法 |
| `taughtLock` | 1347 | 2 | 3 | 盘级玩法 |
| `tickCount` | 1448 | 2 | 3 | 盘级玩法 |

## 2 模块反写清单

### 2.1 直接反写（模块往 main 侧的表里赋值）

| 模块:行 | 被写目标.键 | 写形态 | main.lua 读取点 | 其它模块读取点 |
| --- | --- | --- | --- | --- |
| `config.lua:161` | `NUM.aiPace` | 字段赋值 | 4823（1） | config.lua×1 |
| `config.lua:513` | `THEME.deco` | 字段赋值 | 2644（1） | config.lua×1 |
| `config.lua:727` | `NUM.BG_BASE_H` | 字段赋值 | —（main 不读） | config.lua×1 ui.lua×1 |
| `config.lua:731` | `NUM.UI_KIT` | 字段赋值 | —（main 不读） | config.lua×1 ui.lua×1 |
| `config.lua:741` | `NUM.UI_COL` | 字段赋值 | —（main 不读） | config.lua×1 ui.lua×1 |
| `config.lua:759` | `NUM.PHONE` | 字段赋值 | —（main 不读） | config.lua×1 ui.lua×34 |
| `config.lua:797` | `NUM.PAD_NOTE` | 字段赋值 | 5607（1） | config.lua×1 |
| `config.lua:813` | `NUM.PAD` | 字段赋值 | 5682,5708,5720–5721,5734–5735（6） | config.lua×2 |
| `config.lua:840` | `NUM.AI_TUNE` | 字段赋值 | 4821,5819（2） | config.lua×2 |
| `roster.lua:21` | `FN.rosterDestroy` | 字段赋值 | —（main 不读） | roster.lua×4 |
| `roster.lua:25,568` | `ROSTER.savedBot` | 字段赋值 | —（main 不读） | roster.lua×4 |
| `roster.lua:29,199,437` | `ROSTER.items` | 下标写 | —（main 不读） | roster.lua×8 |
| `roster.lua:37,62,119,189` | `FN.charSel` | 字段赋值 | —（main 不读） | roster.lua×7 |
| `roster.lua:38` | `FN.charAnim` | 字段赋值 | —（main 不读） | roster.lua×1 |
| `roster.lua:39` | `FN.charPulse` | 字段赋值 | —（main 不读） | roster.lua×1 |
| `roster.lua:41,123` | `FN.rosterToggle` | 字段赋值 | 2747,2838–2839,5451,6064,6333,6398,6407,6440（9） | roster.lua×4 |
| `roster.lua:45,127,572` | `ROSTER.on` | 字段赋值 | 2828,2838,2856,2883,3264,5430,6060,6062,6395,6607,6795（11） | roster.lua×5 |
| `roster.lua:61,192` | `FN.charTab` | 字段赋值 | —（main 不读） | roster.lua×4 |
| `roster.lua:118` | `FN.charShow` | 字段赋值 | —（main 不读） | roster.lua×2 |
| `roster.lua:177` | `FN.rosterBuild` | 字段赋值 | 6607（1） | roster.lua×5 |
| `roster.lua:400,409,449,458,460,462` | `ROSTER.detail` | 下标写 | —（main 不读） | roster.lua×12 |
| `roster.lua:402` | `FN.charDetail` | 字段赋值 | —（main 不读） | roster.lua×3 |
| `roster.lua:567` | `ROSTER.savedTop` | 字段赋值 | —（main 不读） | roster.lua×4 |

**读法**：`FN.charSel/charAnim/charPulse/charShow/charDetail/charTab/rosterBuild/rosterDestroy` 这一组
**main 一次都不读**（共 8 个）——roster.lua 自己写、自己调（把 `FN` 当自己的命名空间）；
`ROSTER.items/detail/savedTop/savedBot` 同样只有 roster 自己读。
真正被 main 用到的只有 `FN.rosterToggle`（9 处调用）与 `ROSTER.on`（12 处读取：浮层判定 / 输入守卫 / 画布轮询）。
这就是「模块边界契约」要定的第一件事：**模块的对外句柄必须显式返回，不能往 main 的表里塞**。

### 2.2 间接反写（main 注入回调 → 模块回调时写 main 的表）

| main 注入点 | 注入的回调 | 回写目标 | 说明 |
| --- | --- | --- | --- |
| 2702–2721 controls env | `regAdd = function(n,c,w,h) UI4.regAdd(n,c,w,h) end`（**2714**） | `UI4.reg` | 每建一个按钮就往 UI4 命中表塞一条 |
| 同上 | `regScreen = function(n) UI4.regScreen(n) end`（**2715**） | `UI4.regScreen` | 屏幕分组 |
| 同上 | `onPart = function(c) MS.parts[#MS.parts + 1] = c end`（**2713**） | `MS.parts` | 展台零件数组被模块追加 |
| 同上 | `addShape/addText/addHit`（2704/2705/2706） | `MS.*` 工厂 + `TPL_HIT` 实例 | 复用主脚本图形工厂 |
| 4523–4532 roster env | `FN = FN`（4524）、`roster = ROSTER`（4530） | `FN.*`、`ROSTER.*` | 见 2.1 |
| 5354–5460 ui spec（`FN.U = uimod.new({…})`） | `instHud/instCell/instText/instHit/setRightCX/state` | `HUD_INST`、控件实例、`RIGHT_CX` | ui.lua 只经注入造控件，不自建 |
| 3856–3880 fx env | `trySet/tryCall/addShape/…` | 控件实例 + `FN.FX` 池 | fx 只持有自己的池 |
| 310–318 widgets/audio | `rootOf/styleOf/frameOf` getter | 读 `root`/`UI_STYLE`/`frameSeq` | **只读**（无写） |

### 2.3 模块对 main 侧状态的只读依赖（契约的另一半）

| 模块 | 读的 main 侧状态 | 证据 |
| --- | --- | --- |
| `ui.lua` | `NUM.UI_KIT`、`NUM.UI_COL`、`NUM.PHONE`（18 处）、`MODE`、`CANVAS_W/H` | `ui.lua:36–44`、`302–464` |
| `roster.lua` | `FN`、`ROSTER`、`SK`（经 `env.sk()` 惰性）、`CTL`（经 getter）、`NUM`、`UI4` | `roster.lua:13–27` |
| `fx.lua` | `NUM`、`THEME`、`CANVAS_W/H` | 模块头契约 |
| `controls.lua` | `NUM.UI_KIT`（预设色）、`THEME` | `controls.lua:60–90` |
| `config.lua` | 无（纯数据；反向写 `NUM.*` / `THEME.deco`） | 见 2.1 |

## 3 顶层函数索引

> 共 **388 个函数块**：顶层（depth-1）**196** 个、嵌套 **192** 个；★ = 行数 >100。
> **独立交叉验证**：`luac5.3 -p -l -l` 报 main chunk `146 locals … 196 functions` —— 与本节 196 条顶层函数对上。
> 「调用点」= 全文件对该名字（含 `FN.x(...)` / `:x(...)` 形式）的调用行数（排除定义行）。
> 「读/写全局」只列 §1 登记的状态名（模块句柄与常量不列）。

### 3.1 顶层函数（depth-1）

| 名字 | 定义行 | 结束行 | 行数 | 屏/子系统 | 读全局 | 写全局 | 调用点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `loadModule` | 48 | 62 | 15 | 装载/状态 | — | — | 10 |
| `rand` | 97 | 100 | 4 | 装载/状态 | — | — | 1 |
| `newAIState` | 159 | 165 | 7 | 装载/状态 | — | — | 1 |
| `newInst` | 168 | 197 | 30 | 装载/状态 | — | — | 2 |
| `refillBag` | 202 | 221 | 20 | 装载/状态 | G,g | g | 1 |
| `takeFromBag` | 222 | 226 | 5 | 装载/状态 | g | — | 3 |
| `settleMembers` | 266 | 269 | 4 | 装载/状态 | g | — | 4 |
| `cellIndex` | 271 | 271 | 1 | 装载/状态 | — | — | 1 |
| `paint` | 273 | 277 | 5 | 装载/状态 | g | — | 10 |
| `rootOf` | 295 | 295 | 1 | 控件箱/音效/结算层 | — | — | 0 |
| `styleOf` | 296 | 296 | 1 | 控件箱/音效/结算层 | — | — | 0 |
| `setText` | 306 | 311 | 6 | 控件箱/音效/结算层 | FN,HUD_INST | — | 92 |
| `<anon@315>` | 315 | 315 | 1 | 控件箱/音效/结算层 | frameSeq | — | 0 |
| `applyShake` | 339 | 351 | 13 | 控件箱/音效/结算层 | g | — | 3 |
| `stopShake` | 353 | 356 | 4 | 控件箱/音效/结算层 | g | — | 2 |
| `startShake` | 357 | 363 | 7 | 控件箱/音效/结算层 | g | — | 2 |
| `settleDestroy` | 411 | 445 | 35 | 控件箱/音效/结算层 | SETTLE_HOTS,g | SETTLE_HOTS,g | 6 |
| `sendSettleSignal` | 458 | 482 | 25 | 控件箱/音效/结算层 | — | — | 2 |
| `classifyKids` | 496 | 514 | 19 | 控件箱/音效/结算层 | — | — | 1 |
| `probeSettleContainer` | 517 | 540 | 24 | 控件箱/音效/结算层 | g | — | 1 |
| `probeSettleTextbox` | 543 | 556 | 14 | 控件箱/音效/结算层 | g | — | 9 |
| `buildSettleLayer★` | 558 | 692 | 135 | 控件箱/音效/结算层 | CANVAS_H,CANVAS_W,g | g | 1 |
| `settleSetColors` | 696 | 708 | 13 | 控件箱/音效/结算层 | g | — | 3 |
| `MS.opts★` | 722 | 913 | 192 | 结算三选项 | MODE,SETTLE_ACT,TPL_CELL,TPL_HIT,TPL_TEXT+2 | MS,SETTLE_HOTS,g | 1 |
| `settleTick` | 914 | 956 | 43 | 结算三选项 | g | g | 2 |
| `dimColor` | 960 | 967 | 8 | 渲染/玩法核心 | — | — | 1 |
| `MS.fade` | 970 | 976 | 7 | 渲染/玩法核心 | — | MS | 2 |
| `renderAll` | 978 | 987 | 10 | 渲染/玩法核心 | g | — | 11 |
| `renderNext` | 989 | 1030 | 42 | 渲染/玩法核心 | MS,RIGHT_CX,g | — | 2 |
| `renderHud` | 1032 | 1056 | 25 | 渲染/玩法核心 | HUD_INST,MODE,bestScore,guideStage,G+1 | — | 9 |
| `renderPiece` | 1058 | 1068 | 11 | 渲染/玩法核心 | g | — | 14 |
| `collides` | 1070 | 1078 | 9 | 渲染/玩法核心 | g | — | 26 |
| `spawn` | 1080 | 1116 | 37 | 渲染/玩法核心 | G,g | g | 6 |
| `clearLines★` | 1118 | 1261 | 144 | 渲染/玩法核心 | FN,MODE,SK,SKILLS,bannerTimer+2 | bannerTimer,g | 1 |
| `doLock` | 1263 | 1355 | 93 | 渲染/玩法核心 | FN,MODE,SK,SKILLS,g | bannerTimer,g | 8 |
| `stepDown` | 1361 | 1376 | 16 | 移动旋转 | g | g | 2 |
| `moveBy` | 1380 | 1398 | 19 | 移动旋转 | g | g | 3 |
| `rotateCells` | 1403 | 1407 | 5 | 移动旋转 | — | — | 9 |
| `rotate` | 1409 | 1427 | 19 | 移动旋转 | g | g | 1 |
| `newGame` | 1436 | 1489 | 54 | newGame | G,g | g | 7 |
| `showKeymap` | 1495 | 1499 | 5 | newGame | G | — | 1 |
| `startIfWaiting★` | 1501 | 1672 | 172 | 开局引导 | CANVAS_H,CANVAS_W,FN,GK,HUD_INST+9 | guideStage,g | 8 |
| `toggleKeymap` | 1674 | 1685 | 12 | 键位表 | guideStage | guideStage | 0 |
| `showGameOver` | 1690 | 1787 | 98 | 键位表 | HUD_INST,MODE,MS,TK,bestScore+2 | MODE_OVER,bannerTimer,g | 2 |
| `updateBest` | 1789 | 1791 | 3 | 键位表 | bestScore,g | — | 1 |
| `aiRand` | 1822 | 1825 | 4 | 键位表 | — | — | 12 |
| `aiRange` | 1826 | 1826 | 1 | 键位表 | — | — | 12 |
| `aiFmt` | 1827 | 1827 | 1 | 键位表 | — | — | 14 |
| `board` | 1840 | 1840 | 1 | AI 决策 | g | — | 0 |
| `collides` | 1841 | 1841 | 1 | AI 决策 | — | — | 25 |
| `colHeight` | 1845 | 1845 | 1 | AI 决策 | — | — | 0 |
| `wellDepth` | 1846 | 1846 | 1 | AI 决策 | — | — | 0 |
| `stackHeight` | 1847 | 1847 | 1 | AI 决策 | — | — | 0 |
| `evalBoard` | 1848 | 1848 | 1 | AI 决策 | — | — | 0 |
| `aiChoose` | 1851 | 1936 | 86 | AI 决策 | AEVX,g | — | 1 |
| `buildQueue` | 1942 | 1977 | 36 | AI 决策 | g | — | 1 |
| `NUM.doHold` | 1981 | 2025 | 45 | AI 决策 | g | g | 2 |
| `demoLoopReset` | 2028 | 2050 | 23 | AI 决策 | HUD_INST,g | g | 5 |
| `feedMirror` | 2054 | 2062 | 9 | AI 决策 | G,g | g | 0 |
| `raiseGarbage` | 2068 | 2115 | 48 | AI 决策 | SK,SKILLS,G,g | bannerTimer,g | 2 |
| `destroyHelpLayer` | 2131 | 2139 | 9 | 规则说明页 | HL | HL | 2 |
| `buildHelpLayer★` | 2146 | 2438 | 293 | 规则说明页 | CANVAS_H,CANVAS_W,HL,TPL_CELL,TPL_TEXT+1 | HL | 1 |
| `closeHelp` | 2440 | 2454 | 15 | 规则说明页 | UI4,guideStage,helpOpen | helpOpen | 10 |
| `destroyCountBig` | 2456 | 2461 | 6 | 倒计时大字 | — | — | 4 |
| `buildCountBig` | 2462 | 2478 | 17 | 倒计时大字 | TPL_TEXT | — | 2 |
| `toggleHelp` | 2480 | 2506 | 27 | 倒计时大字 | FN,HL,MS,UI4,guideStage+2 | FN,helpOpen | 5 |
| `destroyMenuCards` | 2508 | 2518 | 11 | 倒计时大字 | MC | MC | 2 |
| `MS.addCell` | 2532 | 2542 | 11 | 标题展台 | TPL_CELL | MS | 22 |
| `MS.addText` | 2543 | 2566 | 24 | 标题展台 | TPL_TEXT | MS | 5 |
| `MS.hairline` | 2568 | 2577 | 10 | 标题展台 | MS,g | MS | 0 |
| `MS.over` | 2580 | 2585 | 6 | 标题展台 | g | MS | 5 |
| `MS.addShape` | 2587 | 2600 | 14 | 标题展台 | MS | MS | 13 |
| `MS.pillParts` | 2602 | 2609 | 8 | 标题展台 | MS | MS | 0 |
| `MS.addPill` | 2611 | 2616 | 6 | 标题展台 | MS | MS | 1 |
| `MS.destroy` | 2617 | 2625 | 9 | 标题展台 | MS | MS | 2 |
| `MS.build★` | 2626 | 2786 | 161 | 标题展台 | CANVAS_H,CANVAS_W,CTL,FN,MS+6 | CTL,MS,keyConsumedFrame | 0 |
| `MS.focusLock` | 2789 | 2816 | 28 | 标题展台 | MS,g | MS | 1 |
| `FN.stageWanted` | 2825 | 2832 | 8 | 展台判据 | MODE_OVER,ROSTER,UI4,guideStage,helpOpen | FN | 1 |
| `FN.syncStage` | 2833 | 2916 | 84 | 展台判据 | FN,HUD_INST,MODE,MODE_OVER,MS+6 | FN | 0 |
| `MS.teardown` | 2917 | 2923 | 7 | 展台判据 | MS | MS | 1 |
| `MS.tick` | 2926 | 2968 | 43 | 展台判据 | MS | MS | 2 |
| `mcCell` | 2985 | 2994 | 10 | 模式选择 | TPL_CELL | MC | 2 |
| `mcText` | 2995 | 3011 | 17 | 模式选择 | TPL_TEXT | MC | 6 |
| `mcRGB` | 3012 | 3014 | 3 | 模式选择 | — | — | 6 |
| `MS.modes` | 3015 | 3084 | 70 | 模式选择 | CANVAS_H,CANVAS_W,MS,TPL_TEXT | MC,MS | 0 |
| `MS.dimOthers` | 3086 | 3100 | 15 | 模式选择 | MS | MS | 1 |
| `MS.select` | 3102 | 3129 | 28 | 模式选择 | MS | MS | 1 |
| `MS.cardStyle` | 3141 | 3184 | 44 | 模式卡三态 | MS | MS | 3 |
| `MS.hoverCard` | 3185 | 3191 | 7 | 模式卡三态 | FN,MS,helpOpen | MS | 2 |
| `MS.hoverOut` | 3192 | 3198 | 7 | 模式卡三态 | FN,MS,helpOpen | MS | 1 |
| `MS.pressCard` | 3199 | 3205 | 7 | 模式卡三态 | FN,MS,helpOpen | MS | 1 |
| `MS.buildHoverZones` | 3208 | 3259 | 52 | 模式卡三态 | MS,TPL_HIT,UI4,frameSeq,helpOpen | MC,MS,keyConsumedFrame | 0 |
| `FN.overlayOpen` | 3263 | 3266 | 4 | 模式卡三态 | ROSTER,UI4,helpOpen | FN | 6 |
| `menuSelectMode` | 3268 | 3295 | 28 | 模式卡三态 | FN,MODE,MS,UI4,guideStage+1 | MODE,MS | 3 |
| `buildMenuCards` | 3296 | 3316 | 21 | 模式卡三态 | HL,MC,MS,TPL_CELL,TPL_TEXT+1 | — | 0 |
| `buildBoardControls` | 3321 | 3372 | 52 | 双屏布局 | MODE,TPL_CELL,g | g | 1 |
| `destroyBoardControls` | 3375 | 3396 | 22 | 双屏布局 | g | g | 2 |
| `placeBoard` | 3399 | 3417 | 19 | 双屏布局 | g | g | 4 |
| `FN.layoutDual★` | 3421 | 3555 | 135 | 双屏布局 | CANVAS_H,CANVAS_W,FN,HUD_INST,MODE+3 | FN | 2 |
| `HUD_INST.txt` | 3559 | 3565 | 7 | HUD 实例 | FN,HUD_INST | HUD_INST | 10 |
| `HUD_INST.build` | 3566 | 3628 | 63 | HUD 实例 | CANVAS_H,CANVAS_W,HUD_INST,RIGHT_CX,TPL_TEXT | HUD_INST | 0 |
| `HUD_INST.hideAll` | 3632 | 3640 | 9 | HUD 实例 | HUD_INST | HUD_INST | 2 |
| `HUD_INST.hideStats` | 3643 | 3648 | 6 | HUD 实例 | HUD_INST | HUD_INST | 1 |
| `HUD_INST.showStats` | 3650 | 3655 | 6 | HUD 实例 | HUD_INST | HUD_INST | 1 |
| `showPersistTip` | 3658 | 3681 | 24 | HUD 实例 | MODE,G | — | 3 |
| `FN.skinBgItem` | 3688 | 3710 | 23 | HUD 实例 | MS | FN,MS | 0 |
| `applyModeTheme` | 3712 | 3721 | 10 | HUD 实例 | FN | — | 3 |
| `FN.aiLevelIdxOfTier` | 3751 | 3755 | 5 | 技能系统 | — | FN | 1 |
| `FN.skillDark` | 3761 | 3771 | 11 | 技能系统 | g | FN | 4 |
| `FN.fxBoardX` | 3774 | 3777 | 4 | 技能系统 | ACTIVE,G | FN | 4 |
| `FN.seatColor` | 3784 | 3789 | 6 | 席位配色/技能接线 | FN | FN | 2 |
| `FN.paintFrames` | 3790 | 3810 | 21 | 席位配色/技能接线 | FN,MODE,SK,G,g | FN | 2 |
| `FN.skillInk` | 3812 | 3818 | 7 | 席位配色/技能接线 | FN | FN | 8 |
| `FN.skillColor` | 3820 | 3824 | 5 | 席位配色/技能接线 | FN | FN | 5 |
| `FN.skillName` | 3825 | 3829 | 5 | 席位配色/技能接线 | FN | FN | 9 |
| `FN.skillSkill` | 3830 | 3834 | 5 | 席位配色/技能接线 | FN | FN | 2 |
| `FN.skillRoleOf` | 3837 | 3844 | 8 | 席位配色/技能接线 | SK | FN | 6 |
| `FN.fxInit` | 3847 | 3886 | 40 | 席位配色/技能接线 | ACTIVE,CANVAS_H,CANVAS_W,FN,TPL_CELL+2 | FN,TPL_TEXT | 6 |
| `FN.topBannerStyle` | 3891 | 3899 | 9 | 席位配色/技能接线 | CANVAS_H,CANVAS_W | FN | 3 |
| `FN.skillText` | 3901 | 3913 | 13 | 席位配色/技能接线 | FN,SK | FN,bannerTimer | 3 |
| `FN.utf8Cut` | 3919 | 3929 | 11 | 席位配色/技能接线 | — | FN | 0 |
| `FN.dispatchEffect` | 3931 | 3969 | 39 | 席位配色/技能接线 | FN,MODE,G | FN | 0 |
| `FN.skillFeedback` | 3971 | 4022 | 52 | 席位配色/技能接线 | FN,MODE,SK,SKILLS,guideStage | FN | 5 |
| `FN.skillFail` | 4025 | 4048 | 24 | 席位配色/技能接线 | FN | FN | 1 |
| `FN.skillCount` | 4051 | 4055 | 5 | 席位配色/技能接线 | SK | FN,SK | 5 |
| `FN.skillUnlockTick` | 4058 | 4077 | 20 | 席位配色/技能接线 | FN,SK,SKILLS | FN | 2 |
| `FN.skillHud★` | 4080 | 4228 | 149 | 席位配色/技能接线 | FN,SK,SKILLS,UI4,guideStage+1 | FN | 7 |
| `FN.skillCast★` | 4231 | 4394 | 164 | 席位配色/技能接线 | AEVX,FN,MODE,MODE_OVER,SK+5 | FN,SK,g | 7 |
| `FN.skillSwitchTo` | 4399 | 4418 | 20 | 席位配色/技能接线 | FN,SK,g | FN,SK | 1 |
| `FN.skillAreaTap` | 4421 | 4435 | 15 | 席位配色/技能接线 | FN,SK | FN | 1 |
| `FN.skillSwitch` | 4437 | 4454 | 18 | 席位配色/技能接线 | FN,SK,g | FN,SK | 1 |
| `FN.skillTick` | 4457 | 4512 | 56 | 席位配色/技能接线 | FN,MODE_OVER,SK,TK,guideStage | FN,bannerTimer | 0 |
| `<anon@4524>` | 4524 | 4524 | 1 | 名册/模式进出 | SK | FN | 0 |
| `ctl` | 4526 | 4526 | 1 | 名册/模式进出 | CTL | — | 0 |
| `<anon@4529>` | 4529 | 4529 | 1 | 名册/模式进出 | CANVAS_H,CANVAS_W,ROSTER | — | 0 |
| `canvasH` | 4530 | 4530 | 1 | 名册/模式进出 | CANVAS_H | — | 0 |
| `FN.enterMode` | 4535 | 4562 | 28 | 名册/模式进出 | FN,MODE,G,g | ACTIVE,FN,G,g | 2 |
| `FN.exitToMenu` | 4565 | 4594 | 30 | 名册/模式进出 | CANVAS_H,CANVAS_W,G | ACTIVE,FN,MODE,MODE_OVER,guideStage+2 | 5 |
| `restartMatch` | 4601 | 4644 | 44 | 名册/模式进出 | CANVAS_H,CANVAS_W,FN,HUD_INST,MODE+2 | ACTIVE,MODE,MODE_OVER,guideStage,G+1 | 1 |
| `FN.aiAutoFlag` | 4651 | 4653 | 3 | 名册/模式进出 | guideStage,g | FN | 1 |
| `FN.aiDrop` | 4654 | 4699 | 46 | 名册/模式进出 | AEVX,FN,guideStage,g | FN,g | 3 |
| `NUM.evalNext` | 4717 | 4774 | 58 | 名册/模式进出 | g | — | 1 |
| `NUM.aiStripQueue` | 4787 | 4805 | 19 | AI 主循环/结算布局 | — | — | 1 |
| `FN.aiTickCore★` | 4807 | 5275 | 469 | AI 主循环/结算布局 | AEVX,FN,bestScore,G,g | FN,g | 3 |
| `autoTick` | 5278 | 5289 | 12 | AI 主循环/结算布局 | FN,guideStage | — | 1 |
| `layoutSettle` | 5297 | 5325 | 29 | AI 主循环/结算布局 | g | — | 2 |
| `canvas` | 5358 | 5358 | 1 | UI 模块/UI4 注册表 | CANVAS_H,CANVAS_W | — | 0 |
| `mobile` | 5359 | 5359 | 1 | UI 模块/UI4 注册表 | — | — | 0 |
| `pool` | 5360 | 5360 | 1 | UI 模块/UI4 注册表 | G,g | — | 0 |
| `plate` | 5361 | 5361 | 1 | UI 模块/UI4 注册表 | G,g | — | 0 |
| `frames` | 5362 | 5362 | 1 | UI 模块/UI4 注册表 | G,g | — | 0 |
| `paintFrames` | 5364 | 5364 | 1 | UI 模块/UI4 注册表 | FN | — | 0 |
| `makeHit` | 5366 | 5366 | 1 | UI 模块/UI4 注册表 | UI4 | — | 0 |
| `bindCursor` | 5367 | 5367 | 1 | UI 模块/UI4 注册表 | — | — | 0 |
| `onSkillArea` | 5368 | 5371 | 4 | UI 模块/UI4 注册表 | FN,frameSeq | keyConsumedFrame | 0 |
| `theme` | 5372 | 5372 | 1 | UI 模块/UI4 注册表 | — | — | 0 |
| `mode` | 5373 | 5373 | 1 | UI 模块/UI4 注册表 | MODE | — | 0 |
| `tb` | 5374 | 5387 | 14 | UI 模块/UI4 注册表 | — | — | 0 |
| `instHud` | 5388 | 5388 | 1 | UI 模块/UI4 注册表 | HUD_INST | — | 0 |
| `instCell` | 5389 | 5393 | 5 | UI 模块/UI4 注册表 | — | — | 0 |
| `instText` | 5394 | 5408 | 15 | UI 模块/UI4 注册表 | TPL_TEXT | — | 0 |
| `instHit2` | 5411 | 5418 | 8 | UI 模块/UI4 注册表 | TPL_HIT | — | 0 |
| `instHit` | 5419 | 5426 | 8 | UI 模块/UI4 注册表 | TPL_HIT | — | 0 |
| `setRightCX` | 5427 | 5427 | 1 | UI 模块/UI4 注册表 | RIGHT_CX | — | 0 |
| `state` | 5428 | 5434 | 7 | UI 模块/UI4 注册表 | FN,MODE,ROSTER,helpOpen,G+1 | guideStage | 0 |
| `party` | 5435 | 5435 | 1 | UI 模块/UI4 注册表 | SK | — | 0 |
| `sfx` | 5436 | 5436 | 1 | UI 模块/UI4 注册表 | — | — | 24 |
| `FN.U.dispatch` | 5439 | 5468 | 30 | UI 模块/UI4 注册表 | FN,UI4 | FN | 1 |
| `UI4.padVisible` | 5478 | 5480 | 3 | UI 模块/UI4 注册表 | FN | UI4 | 1 |
| `UI4.regScreen` | 5481 | 5486 | 6 | UI 模块/UI4 注册表 | UI4 | UI4 | 5 |
| `UI4.regAdd` | 5487 | 5490 | 4 | UI 模块/UI4 注册表 | — | UI4 | 8 |
| `UI4.pos` | 5493 | 5502 | 10 | UI 模块/UI4 注册表 | — | UI4 | 1 |
| `UI4.dump` | 5503 | 5518 | 16 | UI 模块/UI4 注册表 | CANVAS_H,CANVAS_W,UI4 | UI4 | 4 |
| `UI4.clamp` | 5520 | 5524 | 5 | UI 模块/UI4 注册表 | — | UI4 | 0 |
| `UI4.pill` | 5526 | 5533 | 8 | UI 模块/UI4 注册表 | — | UI4 | 4 |
| `UI4.label` | 5535 | 5552 | 18 | UI 模块/UI4 注册表 | TPL_TEXT | UI4 | 5 |
| `UI4.hit` | 5554 | 5561 | 8 | UI 模块/UI4 注册表 | TPL_HIT | UI4 | 4 |
| `UI4.paint` | 5567 | 5569 | 3 | 薄封装/手柄/layout | FN | UI4 | 1 |
| `UI4.stopRep` | 5570 | 5572 | 3 | 薄封装/手柄/layout | FN | UI4 | 1 |
| `UI4.tick` | 5574 | 5576 | 3 | 薄封装/手柄/layout | FN | UI4 | 2 |
| `UI4.build` | 5577 | 5583 | 7 | 薄封装/手柄/layout | FN | UI4 | 0 |
| `UI4.layout` | 5584 | 5587 | 4 | 薄封装/手柄/layout | FN,MODE,guideStage,G | UI4 | 0 |
| `UI4.syncVisible` | 5589 | 5593 | 5 | 薄封装/手柄/layout | UI4 | UI4 | 1 |
| `UI4.refreshHelpLabel` | 5594 | 5600 | 7 | 薄封装/手柄/layout | FN | UI4 | 2 |
| `UI4.noteOpen` | 5605 | 5663 | 59 | 薄封装/手柄/layout | CANVAS_H,CANVAS_W,UI4 | UI4 | 1 |
| `UI4.noteClose` | 5665 | 5676 | 12 | 薄封装/手柄/layout | UI4 | UI4 | 3 |
| `UI4.padBind` | 5681 | 5701 | 21 | 薄封装/手柄/layout | UI4 | UI4 | 0 |
| `UI4.padTick` | 5704 | 5739 | 36 | 薄封装/手柄/layout | UI4 | UI4 | 1 |
| `UI4.padAct` | 5742 | 5757 | 16 | 薄封装/手柄/layout | UI4 | UI4 | 5 |
| `layout` | 5760 | 5785 | 26 | 薄封装/手柄/layout | CANVAS_H,CANVAS_W,FN,MODE,G+1 | — | 1 |
| `OnStart★` | 5791 | 6506 | 716 | OnStart | CANVAS_H,CANVAS_W,FN,GK,HUD_INST+18 | FN,GK,SETTLE_ACT,SK,TK+6 | 0 |
| `FN.tickInstance` | 6515 | 6585 | 71 | tickInstance | SK,guideStage,g | FN,g | 2 |
| `FN.pollCanvasSize` | 6595 | 6609 | 15 | 画布轮询 | CANVAS_H,CANVAS_W,FN,HUD_INST,MODE+3 | FN | 0 |
| `OnUpdate★` | 6611 | 6855 | 245 | OnUpdate | ACTIVE,CANVAS_H,CANVAS_W,FN,GK+14 | FN,GK,MS,SK,TK+5 | 1 |
| `OnDestroy` | 6858 | 6858 | 1 | OnUpdate | — | — | 1 |
| `OnDestroy` | 6859 | 6859 | 1 | OnUpdate | — | — | 1 |

### 3.2 嵌套函数（回调 / 局部闭包，含 OnStart 内的 `routePlayer`）

**命名嵌套函数（65 个）**

| 名字 | 定义行 | 结束行 | 行数 | 所在函数 | 调用点 |
| --- | --- | --- | --- | --- | --- |
| `mix` | 742 | 755 | 14 | `MS.opts` | 7 |
| `ch` | 748 | 753 | 6 | `mix` | 1 |
| `mk` | 757 | 763 | 7 | `MS.opts` | 1 |
| `piece` | 764 | 778 | 15 | `MS.opts` | 3 |
| `addPill` | 787 | 804 | 18 | `MS.opts` | 6 |
| `put` | 793 | 795 | 3 | `addPill` | 3 |
| `paint` | 845 | 876 | 32 | `MS.opts` | 10 |
| `e` | 928 | 932 | 5 | `settleTick` | 2 |
| `better` | 1892 | 1899 | 8 | `aiChoose` | 2 |
| `u` | 2159 | 2159 | 1 | `buildHelpLayer` | 16 |
| `fs` | 2160 | 2164 | 5 | `buildHelpLayer` | 3 |
| `inst` | 2171 | 2177 | 7 | `buildHelpLayer` | 1 |
| `shape` | 2180 | 2196 | 17 | `buildHelpLayer` | 11 |
| `rect` | 2197 | 2199 | 3 | `buildHelpLayer` | 13 |
| `rrect` | 2201 | 2214 | 14 | `buildHelpLayer` | 18 |
| `text` | 2216 | 2232 | 17 | `buildHelpLayer` | 3 |
| `t` | 2233 | 2235 | 3 | `buildHelpLayer` | 38 |
| `caps` | 2237 | 2247 | 11 | `buildHelpLayer` | 2 |
| `buildA` | 2250 | 2322 | 73 | `buildHelpLayer` | 1 |
| `buildB` | 2325 | 2367 | 43 | `buildHelpLayer` | 1 |
| `buildC` | 2370 | 2403 | 34 | `buildHelpLayer` | 1 |
| `addShape` | 2704 | 2704 | 1 | `MS.build` | 0 |
| `addText` | 2705 | 2705 | 1 | `MS.build` | 0 |
| `addHit` | 2706 | 2712 | 7 | `MS.build` | 0 |
| `onPart` | 2713 | 2713 | 1 | `MS.build` | 0 |
| `regAdd` | 2714 | 2714 | 1 | `MS.build` | 0 |
| `regScreen` | 2715 | 2715 | 1 | `MS.build` | 0 |
| `over` | 2718 | 2718 | 1 | `MS.build` | 0 |
| `scale` | 2719 | 2719 | 1 | `MS.build` | 0 |
| `onEnter` | 2746 | 2746 | 1 | `MS.build` | 0 |
| `onClick` | 2747 | 2747 | 1 | `MS.build` | 0 |
| `onEnter` | 2761 | 2761 | 1 | `MS.build` | 0 |
| `onClick` | 2762 | 2766 | 5 | `MS.build` | 0 |
| `MS.entryHover` | 2771 | 2774 | 4 | `MS.build` | 0 |
| `mv` | 3164 | 3164 | 1 | `MS.cardStyle` | 1 |
| `rootOf` | 3858 | 3858 | 1 | `FN.fxInit` | 0 |
| `W` | 3859 | 3859 | 1 | `FN.fxInit` | 0 |
| `H` | 3860 | 3860 | 1 | `FN.fxInit` | 0 |
| `shiftDown` | 3944 | 3948 | 5 | `FN.dispatchEffect` | 1 |
| `shiftUp` | 3949 | 3953 | 5 | `FN.dispatchEffect` | 1 |
| `nextAction` | 4893 | 4896 | 4 | `FN.aiTickCore` | 4 |
| `refineSearch` | 4902 | 4965 | 64 | `FN.aiTickCore` | 1 |
| `place2` | 5299 | 5303 | 5 | `layoutSettle` | 12 |
| `top` | 5613 | 5613 | 1 | `UI4.noteOpen` | 11 |
| `at` | 5645 | 5649 | 5 | `UI4.noteOpen` | 11 |
| `listen` | 5995 | 6010 | 16 | `OnStart` | 21 |
| `playerTouched` | 6015 | 6034 | 20 | `OnStart` | 1 |
| `routePlayer` | 6044 | 6047 | 4 | `OnStart` | 2 |
| `coopAllowed` | 6049 | 6054 | 6 | `OnStart` | 1 |
| `act` | 6055 | 6097 | 43 | `OnStart` | 5 |
| `doPlay` | 6100 | 6131 | 32 | `OnStart` | 4 |
| `SETTLE_ACT.restart` | 6234 | 6250 | 17 | `OnStart` | 1 |
| `SETTLE_ACT.backHome` | 6251 | 6258 | 8 | `OnStart` | 1 |
| `SETTLE_ACT.detail` | 6259 | 6288 | 30 | `OnStart` | 0 |
| `onHelpKey` | 6295 | 6298 | 4 | `OnStart` | 0 |
| `UI4.runAct` | 6322 | 6326 | 5 | `OnStart` | 2 |
| `UI4.helpToggle` | 6327 | 6329 | 3 | `OnStart` | 3 |
| `UI4.dispatch` | 6330 | 6338 | 9 | `OnStart` | 1 |
| `UI4.menuMode` | 6339 | 6343 | 5 | `OnStart` | 2 |
| `UI4.focusMove` | 6344 | 6355 | 12 | `OnStart` | 2 |
| `UI4.focusConfirm` | 6356 | 6361 | 6 | `OnStart` | 1 |
| `skillKeyUpWatch` | 6385 | 6387 | 3 | `OnStart` | 0 |
| `skillKey` | 6388 | 6412 | 25 | `OnStart` | 6 |
| `skillFrontName` | 6416 | 6418 | 3 | `OnStart` | 2 |
| `anyKeyStart` | 6471 | 6489 | 19 | `OnStart` | 0 |

**匿名回调（127 个：`pcall(function() … end)` 与内联事件闭包），按宿主函数聚合：**

| 宿主函数 | 匿名闭包数 | 首行 |
| --- | --- | --- |
| `OnStart` | 21 | 5803 |
| `MS.buildHoverZones` | 8 | 3213 |
| `buildSettleLayer` | 8 | 593 |
| `MS.opts` | 7 | 826 |
| `FN.layoutDual` | 4 | 3445 |
| `FN.skillCast` | 4 | 4293 |
| `FN.skinBgItem` | 4 | 3695 |
| `settleDestroy` | 4 | 413 |
| `FN.pollCanvasSize` | 3 | 6596 |
| `MS.addShape` | 3 | 2591 |
| `probeSettleContainer` | 3 | 519 |
| `probeSettleTextbox` | 3 | 545 |
| `sendSettleSignal` | 3 | 460 |
| `FN.exitToMenu` | 2 | 4568 |
| `FN.syncStage` | 2 | 2872 |
| `UI4.noteOpen` | 2 | 5619 |
| `classifyKids` | 2 | 499 |
| `destroyBoardControls` | 2 | 3383 |
| `listen` | 2 | 5998 |
| `piece` | 2 | 772 |
| `shape` | 2 | 2189 |
| `<anon@6419>` | 1 | 6422 |
| `<anon@6425>` | 1 | 6428 |
| `FN.skillFail` | 1 | 4042 |
| `FN.skillFeedback` | 1 | 4007 |
| `HUD_INST.build` | 1 | 3574 |
| `HUD_INST.txt` | 1 | 3564 |
| `MS.addCell` | 1 | 2534 |
| `MS.addText` | 1 | 2546 |
| `MS.destroy` | 1 | 2619 |
| `MS.tick` | 1 | 2965 |
| `UI4.focusMove` | 1 | 6352 |
| `UI4.label` | 1 | 5537 |
| `UI4.noteClose` | 1 | 5670 |
| `UI4.padBind` | 1 | 5694 |
| `UI4.padTick` | 1 | 5706 |
| `UI4.pos` | 1 | 5495 |
| `UI4.runAct` | 1 | 6325 |
| `act` | 1 | 6056 |
| `addHit` | 1 | 2707 |
| `aiChoose` | 1 | 1928 |
| `buildHelpLayer` | 1 | 2421 |
| `destroyCountBig` | 1 | 2458 |
| `destroyHelpLayer` | 1 | 2134 |
| `destroyMenuCards` | 1 | 2511 |
| `inst` | 1 | 2172 |
| `instHit2` | 1 | 5413 |
| `instText` | 1 | 5397 |
| `mcCell` | 1 | 2986 |
| `mcText` | 1 | 2996 |
| `mk` | 1 | 758 |
| `restartMatch` | 1 | 4617 |
| `setText` | 1 | 310 |
| `skillKey` | 1 | 6389 |
| `skillKeyUpWatch` | 1 | 6386 |
| `startIfWaiting` | 1 | 1567 |
| `text` | 1 | 2217 |

### 3.3 超长函数（>100 行）

| 名字 | 行范围 | 行数 | 屏/子系统 |
| --- | --- | --- | --- |
| `OnStart` | 5791–6506 | 716 | OnStart |
| `FN.aiTickCore` | 4807–5275 | 469 | AI 主循环/结算布局 |
| `buildHelpLayer` | 2146–2438 | 293 | 规则说明页 |
| `OnUpdate` | 6611–6855 | 245 | OnUpdate |
| `MS.opts` | 722–913 | 192 | 结算三选项 |
| `startIfWaiting` | 1501–1672 | 172 | 开局引导 |
| `FN.skillCast` | 4231–4394 | 164 | 席位配色/技能接线 |
| `MS.build` | 2626–2786 | 161 | 标题展台 |
| `FN.skillHud` | 4080–4228 | 149 | 席位配色/技能接线 |
| `clearLines` | 1118–1261 | 144 | 渲染/玩法核心 |
| `buildSettleLayer` | 558–692 | 135 | 控件箱/音效/结算层 |
| `FN.layoutDual` | 3421–3555 | 135 | 双屏布局 |

> **更正一条既有审计口径**：`.scratch/lead/refactor-audit.md` 写「`layout` 5760–6514（755 行）」——
> 实测 `layout` 只有 **5760–5785（26 行）**；755 是「layout + OnStart 716 行 + 中间空行」被合并计数。
> 真正的最长函数：`OnStart` 716、`FN.aiTickCore` 469、`buildHelpLayer` 293、`OnUpdate` 245。

## 4 切分建议

### 4.1 按屏/子系统分组（函数 → 屏，函数数由扫描得出）

| 屏/子系统 | 行范围 | 顶层函数数 | 最大函数（前 4） |
| --- | --- | --- | --- |
| 装载/状态 | 44–289 | 9 | `newInst` `refillBag` `loadModule` `newAIState` |
| 控件箱/音效/结算层 | 290–711 | 14 | `buildSettleLayer` `settleDestroy` `sendSettleSignal` `probeSettleContainer` |
| 结算三选项 | 712–959 | 2 | `MS.opts` `settleTick` |
| 渲染/玩法核心 | 960–1360 | 10 | `clearLines` `doLock` `renderNext` `spawn` |
| 移动旋转 | 1361–1435 | 4 | `moveBy` `rotate` `stepDown` `rotateCells` |
| newGame | 1436–1500 | 2 | `newGame` `showKeymap` |
| 开局引导 | 1501–1673 | 1 | `startIfWaiting` |
| 键位表 | 1674–1834 | 6 | `showGameOver` `toggleKeymap` `aiRand` `updateBest` |
| AI 决策 | 1835–2116 | 12 | `aiChoose` `raiseGarbage` `NUM.doHold` `buildQueue` |
| 标题模式卡 | 2117–2121 | 0 |  |
| 规则说明页 | 2122–2454 | 3 | `buildHelpLayer` `closeHelp` `destroyHelpLayer` |
| 倒计时大字 | 2455–2518 | 4 | `toggleHelp` `buildCountBig` `destroyMenuCards` `destroyCountBig` |
| 标题展台 | 2519–2817 | 10 | `MS.build` `MS.focusLock` `MS.addText` `MS.addShape` |
| 展台判据 | 2818–2969 | 4 | `FN.syncStage` `MS.tick` `FN.stageWanted` `MS.teardown` |
| 模式选择 | 2970–3130 | 6 | `MS.modes` `MS.select` `mcText` `MS.dimOthers` |
| 模式卡三态 | 3131–3318 | 8 | `MS.buildHoverZones` `MS.cardStyle` `menuSelectMode` `buildMenuCards` |
| 双屏布局 | 3319–3556 | 4 | `FN.layoutDual` `buildBoardControls` `destroyBoardControls` `placeBoard` |
| HUD 实例 | 3557–3723 | 8 | `HUD_INST.build` `showPersistTip` `FN.skinBgItem` `applyModeTheme` |
| 技能系统 | 3724–3778 | 3 | `FN.skillDark` `FN.aiLevelIdxOfTier` `FN.fxBoardX` |
| 席位配色/技能接线 | 3779–4512 | 22 | `FN.skillCast` `FN.skillHud` `FN.skillTick` `FN.skillFeedback` |
| 名册/模式进出 | 4513–4777 | 10 | `NUM.evalNext` `FN.aiDrop` `restartMatch` `FN.exitToMenu` |
| AI 主循环/结算布局 | 4778–5344 | 4 | `FN.aiTickCore` `layoutSettle` `NUM.aiStripQueue` `autoTick` |
| UI 模块/UI4 注册表 | 5345–5562 | 31 | `FN.U.dispatch` `UI4.label` `UI4.dump` `instText` |
| 薄封装/手柄/layout | 5563–5790 | 13 | `UI4.noteOpen` `UI4.padTick` `layout` `UI4.padBind` |
| OnStart | 5791–6513 | 1 | `OnStart` |
| tickInstance | 6514–6586 | 1 | `FN.tickInstance` |
| 画布轮询 | 6587–6610 | 1 | `FN.pollCanvasSize` |
| OnUpdate | 6611–6860 | 3 | `OnUpdate` `OnDestroy` `OnDestroy` |

### 4.2 跨屏耦合函数（必须优先拆）

判据：函数体触及 ≥3 个「屏组」（play/title/help/settle/skill/roster/flow/input）。共 **26** 个，前 24：

| 函数 | 行范围 | 行数 | 跨屏组数 | 触及屏组 |
| --- | --- | --- | --- | --- |
| `OnStart` | 5791–6506 | 716 | 8 | flow/help/input/play/roster/settle/skill/title |
| `OnUpdate` | 6611–6855 | 245 | 7 | flow/help/input/play/roster/skill/title |
| `startIfWaiting` | 1501–1672 | 172 | 5 | flow/help/play/skill/title |
| `FN.syncStage` | 2833–2916 | 84 | 5 | flow/help/play/roster/title |
| `FN.skillCast` | 4231–4394 | 164 | 4 | flow/play/skill/title |
| `showGameOver` | 1690–1787 | 98 | 4 | flow/play/settle/title |
| `FN.skillTick` | 4457–4512 | 56 | 4 | flow/play/skill/title |
| `FN.skillFeedback` | 3971–4022 | 52 | 4 | flow/play/skill/title |
| `toggleHelp` | 2480–2506 | 27 | 4 | flow/help/play/title |
| `FN.stageWanted` | 2825–2832 | 8 | 4 | flow/help/play/roster |
| `state` | 5428–5434 | 7 | 4 | flow/help/play/roster |
| `MS.opts` | 722–913 | 192 | 3 | play/settle/title |
| `MS.build` | 2626–2786 | 161 | 3 | help/input/title |
| `FN.skillHud` | 4080–4228 | 149 | 3 | flow/help/skill |
| `clearLines` | 1118–1261 | 144 | 3 | flow/play/skill |
| `doLock` | 1263–1355 | 93 | 3 | flow/play/skill |
| `FN.tickInstance` | 6515–6585 | 71 | 3 | flow/play/skill |
| `MS.buildHoverZones` | 3208–3259 | 52 | 3 | help/input/title |
| `raiseGarbage` | 2068–2115 | 48 | 3 | flow/play/skill |
| `restartMatch` | 4601–4644 | 44 | 3 | flow/play/title |
| `menuSelectMode` | 3268–3295 | 28 | 3 | flow/play/title |
| `renderHud` | 1032–1056 | 25 | 3 | flow/play/settle |
| `FN.skillSwitchTo` | 4399–4418 | 20 | 3 | play/skill/title |
| `FN.skillSwitch` | 4437–4454 | 18 | 3 | play/skill/title |

**解读**：`OnStart` / `OnUpdate` / `FN.enterMode` / `FN.exitToMenu` / `restartMatch` / `FN.pollCanvasSize`
是"所有屏的中转站"——同时是生命周期、屏切换器、重建器。屏栈引入后，它们应当只剩"转发给当前屏"。

### 4.3 每屏真正需要的最小状态集（脱离全局运行所需）

| 屏 | 最小状态集 | 必须移除的隐式依赖 |
| --- | --- | --- |
| title | `MS.{parts,hint,arrow,focus,WALL,BEZEL}`、`MC`、`introT/overlay/introFont/introPulse`、`bestScore`、`CANVAS_W/H`、`TPL_CELL/TPL_HIT/TPL_TEXT`、`UI_STYLE`、`IS_MOBILE`、`FN.U`、`CTL` | `g`（`MS.tick` 读 `g.bgPool/g.plate` 做对齐/换肤）→ 应改为展台自己的成员 |
| help | `HL`、`helpOpen/helpFromStage/helpPage`、`guideStage`、`TPL_TEXT` | `MS.parts`（建页复用工厂）、`g`（关闭时恢复阶段） |
| play | `g.{board,cells,piece,piece.x,piece.y,piece.cells,preview,score,level,lines,combo,b2b,elapsed,pieceCount,bagQ,bagSeq,st,ld,das,lastRot,gameOver,plate,frames,boardOX,aiAccount,autoDriving,dimRatio}`、`MODE`、`ACTIVE`、`G[2]`、`NUM`、`THEME` | `bannerTimer`（HUD 横幅）、`SETTLE_*`（局末）、`SK`（技能作用盘）、`ROSTER.on`（浮层门控）、`guideStage` |
| settle | `g.{settleScrim,settleCard,settleBorder,settleTitle,settleScore,settleBest,settleInfo,settleExtra,settleOpts,settleReady,settleOn,settleT,settleDone,settleFade,settleSize,settleSignaled}`、`SETTLE_HOTS`、`SETTLE_ACT`、`MODE_OVER`、`bestScore` | `g.score/g.level`（文案）、`FN.U`（三键布局）、**`SETTLE_HOTS` 是单份表：`settleDestroy` 415 行 `SETTLE_HOTS = {}` 一清空，另一盘的结算热区一起失效** |
| roster | `ROSTER`、`FN.charSel/charTab/charAnim/charPulse`、`SK`、`CTL`、`CANVAS_W/H` | `FN`（自注册函数，见 2.1）、`MS.parts`（**开页前必须先拆展台**——层序铁律） |
| skill | `SK`、`FN.FX`、`FN.skill*`、`NUM.SKILL*`、`CTL` | `g`（冻结/垃圾行作用于当前盘）、`ACTIVE`（双盘同时施放） |
| input / lifecycle | `frameSeq`、`keyConsumedFrame`、`ACTIVE`、`g`（唯一允许重绑定的地方）、`helpOpen`、`ROSTER.on`、`MODE_OVER`、`TK`、`GK` | 全部屏的可见性判据 |

### 4.4 建议切分顺序（每步独立可验证）

1. **P1 输入路由**：把 OnStart 5991–6506（23 处 listen / act / routePlayer / 结算热键 / 设备键）抽成 `FN.registerInputs()`，
   `routePlayer` 提升为模块级函数（**0 个新 local**，纯搬家）。验证 `node qxqy/runner.mjs`（02/03/05/06/26/27/30/31/35–38/41/43/48/52–55/61–62 全绿）。
2. **P2 结算屏**：`buildSettleLayer/settleTick/settleSetColors/layoutSettle/MS.opts` + `g.settle*` 收进 `settle` 模块，
   `settle.new({ inst=g, mode=MODE, ui=FN.U, hots=SETTLE_HOTS, act=SETTLE_ACT })` 注入；12 个 `g.settle*` 字段整体搬成模块内表。
3. **P3 屏栈（读侧先行）**：`FN.screen()` 返回 `title|help|play|settle|roster`，内部由 `MODE/guideStage/helpOpen/ROSTER.on` 推导；
   全部判据改读它，写侧暂留原变量（行为零变化）。
4. **P4 play 状态边界**：`g` 只保留 4.3 play 行的 27 个字段；`AI.*`（29 键）、`settle*`（26 键）、`shake*`（4 键）拆到子系统表。
5. **P5 标题屏**：`MS`/`MC`/`HL`/`DK` 统一成 `title` 场景（node 描述 → `render.lua`，骨架已在 `view_node/view_board/render`）。
6. **P6 名册/技能**：roster 改为 `local api = RM.new(env)` 返回 `{toggle, charSel, …}`，main 显式接收（消灭 2.1 全部反写）。

> 顺序依据：P1/P2 = 纯搬家 + 有 70 用例守，风险最低；P3 是语义变更，必须最后做且先有读侧统一。
> 每个 P 之间跑 `node qxqy/runner.mjs` + `node qxqy/shots-v5.mjs --all`，**不要连续两个 P 再验**。

## 附录 A 复现命令（全部只读；本轮**未跑** build/runner/真机）

```bash
cd /home/h/genshin-ts/workspace/tetris
sha256sum lua/main.lua                 # 基线 3df969b5…；若已变，先 git show HEAD:./lua/main.lua > 快照
git show HEAD:./lua/main.lua > .scratch/lead/tmp/head/main.lua
python3 .scratch/lead/tmp/final.py .scratch/lead/tmp/head/main.lua .scratch/lead/tmp/head/tetris
python3 .scratch/lead/tmp/render.py    # 重生成本文件
luac5.3 -p -l -l lua/main.lua | head -2   # local 预算 146/200
```

## 附录 B 全量读取点行号（重状态）

**B.g** 读 466 处：

```
40,113,205,211,220,223–224,267–268,274–275,340–344,346,348–349,354,362,417,427–428,431–434,518–519,524,536,544–545,548,551,553,576,636–638,642,648,656,658–661,663,670–675,683,687,698–701,704,706–707,909,915,917,920,935,939,944–945,947,951–953,981,983,990–993,995,1002,1006,1013–1015,1018,1020–1021,1023,1026,1035,1037–1038,1045,1049–1051,1060,1062–1063,1065,1075,1083–1084,1086,1098,1101,1105–1106,1109,1124,1127,1130,1141,1148,1150,1154,1157,1161,1170,1174–1176,1186,1191,1193,1196,1199,1202,1207,1215,1217–1218,1220–1221,1225,1236,1238–1240,1243,1248–1250,1252,1267,1271–1273,1278–1279,1281,1286–1287,1291,1299–1301,1308,1314,1316–1317,1319,1326,1328,1332,1346,1351,1362–1363,1365,1367,1371,1381–1382,1385,1388–1389,1410–1412,1414,1418–1419,1460,1469,1472,1478,1488,1560,1698,1704,1711,1723,1725,1729,1731–1734,1740,1743–1744,1746–1747,1754–1758,1760–1761,1763–1764,1784,1790,1840,1852,1854,1856,1871,1881,1917,1944,1946,1984,1986,1988–1989,2000,2018,2057,2084,2088,2093–2094,2107,2504,2575,2582,2584,2889–2891,3323,3336,3343,3364,3369,3377,3400,3403–3405,3408,3410,3413–3414,3764,3766,3770,3806–3807,4236,4244,4257,4262,4266,4299,4301,4305,4316,4321,4325–4327,4331,4335,4338,4356,4359,4366,4369,4403,4439,4545,4652,4656,4660,4672,4682,4684–4685,4693,4721,4810,4814,4823,4836,4845,4865,4881,4886,4892,4903,4906–4907,4917,4920–4921,4966,4987,4989–4990,4994,4996–4997,5018,5020–5021,5025,5034–5035,5047,5053–5054,5056,5058,5062–5063,5071,5077,5079,5084,5087–5088,5126,5146,5159,5163,5169,5175,5179,5185–5186,5190,5192,5199,5206,5208,5221,5226,5236,5241–5242,5245,5249,5251–5252,5254,5262,5269,5307–5311,5313–5314,5319–5324,5360–5362,5431,5782,5784,5869,5875,5902,5906,5935,6103,6121,6123,6127,6139–6140,6177,6204,6208–6210,6212–6218,6220,6224–6226,6253,6263,6265–6266,6268–6274,6276,6280–6282,6307,6406,6420,6427,6517,6520,6525,6527–6528,6532,6534,6536–6537,6539,6541,6543,6553,6555,6558,6560,6562,6564,6570,6576,6581,6643,6649,6668,6671,6719,6721–6722,6752,6778,6814,6820–6822,6828,6841
```

**B.G** 读 70 处：

```
24,112,199,205,1035,1086,1106,1206–1207,1478,1497,1530,1577,1579–1580,1698,1705–1706,1711,2056,2058,2080,2913,3422,3441,3674,3676–3677,3775,3796,3803–3804,3871,3935,4244,4546,4552,4554,4571,4573,4579–4584,4620,4622,4628–4629,4845,5360–5362,5432,5586,5771,6045–6046,6103,6341,6630,6670,6744,6751,6753,6815,6840,6846,6848
```

**B.FN** 读 177 处：

```
74,307,1160,1164,1170,1179,1187–1189,1298,1508–1510,2496,2747,2838–2839,2842,2858,2875,2887,2904,3186,3193,3200,3270,3432,3561,3716,3720,3785,3788,3794,3801,3813,3815,3817,3821,3823,3826,3828,3831,3833,3848,3856,3863,3885,3902,3904,3967,3973–3975,3996,4037–4038,4040,4044,4073,4084,4104,4127,4147,4162,4170,4201,4220,4223,4225,4243,4258,4267,4271,4276,4285,4290,4295,4306,4308–4309,4336,4338–4339,4373,4388–4389,4392,4413,4415,4426,4433–4434,4449,4451,4458,4461–4462,4465–4467,4469,4471,4479–4480,4482,4485,4493,4507,4539,4555,4632,4661,5005,5263,5270,5282,5288,5364,5370,5432,5441,5451,5455,5460,5464–5466,5479,5568,5571,5575,5578,5582,5585–5586,5595–5596,5770–5771,5918–5919,6064,6184,6189,6238,6256,6333,6386,6398,6407,6417,6422,6428,6431,6437,6440,6605,6607,6615,6618–6620,6622–6623,6642–6643,6649,6657,6702,6746,6783,6796,6798,6806,6830,6851,6853
```

**B.UI4** 读 95 处：

```
77,779,901,911,2411,2418,2427–2428,2449,2452,2503,2714–2715,2829,2838,2856,2883,2903–2904,2906,2912–2913,3209,3229,3235–3236,3250,3257,3265,3280,4107,4527,5366,5447,5467,5483–5484,5506,5511,5513,5590,5606,5609,5617,5621,5624–5630,5632–5636,5641,5661,5666–5667,5696,5705,5709,5716,5722,5730,5736,5743–5745,5747,5753,5756,5808,6060,6331,6336–6337,6348–6352,6354,6357,6360,6362–6365,6604,6628–6630
```

**B.HUD_INST** 读 108 处：

```
73,309,1036–1038,1051,1054,1518,1523,1525–1528,1531–1533,1537–1539,1543–1545,1547–1549,1551–1554,1610,1615,1617–1619,1621–1623,1625–1630,1632,1641–1643,1647–1652,1722,2042,2867,2871,3495–3497,3499–3501,3506–3508,3510–3512,3514–3516,3523–3526,3529–3537,3545–3548,3563,3607–3609,3611,3613,3617–3618,3634,3645,3652,4610,5388,5985,5989,6076–6077,6477,6606
```

**B.MS** 读 118 处：

```
246,1009,1026,1514,1746,2490,2572,2589,2605–2607,2613–2615,2618–2619,2622–2623,2628,2636–2639,2641–2642,2645,2647–2654,2659–2660,2667,2670,2685,2693,2695–2696,2704–2705,2713,2716–2718,2753,2784,2790,2793,2795–2798,2801–2803,2808–2810,2814,2843,2847,2919–2920,2928,2935,2938,2949,2959,2963–2965,3026,3028–3030,3032–3033,3090,3096,3104,3116,3128,3142,3153,3187,3189,3194–3196,3201,3203,3219–3222,3235–3236,3242,3255–3256,3288–3290,3303,3305,3307,3705,6350–6352,6690–6691,6693,6715
```

**B.SK** 读 90 处：

```
1159–1160,1178–1180,1297–1298,1507,2072–2074,3792–3793,3838–3840,3843,3978,4052,4059–4060,4064–4066,4069,4081,4109–4110,4128–4130,4132–4133,4136,4151,4193–4194,4198,4232,4265,4274,4347,4375,4384,4400–4401,4404,4409–4410,4412,4422–4424,4429–4431,4438,4440,4445,4447–4448,4524,5435,5918–5919,6371–6372,6434–6435,6438,6443–6446,6453–6454,6457–6458,6578–6579,6632,6634,6646–6647,6652–6653,6655,6660,6662,6797
```

**B.NUM** 读 65 处：

```
69,1144,1149,1151,1154,1192–1193,1208,1239,1241,1246,1251,1255,1309,1326,1333,1365,1389,1419,1461,1839,1881,1956,2049,4375,4527,4541,4731,4742,4815,4821,4823,4864,4868,4875,4881,4883,4950,5073,5095,5102,5282,5607,5682,5708,5720–5721,5734–5735,5816,5819,6026,6118,6128,6134,6160,6541,6555,6558–6559,6562,6576,6788,6792,6803
```

**B.MODE** 读 66 处：

```
726,1036,1161,1301,1509,1567,1571,1576,1578,1581,1583,1586–1587,1592–1593,1645,1655,1666,1670,1700–1701,1753,2913,3287,3330,3349,3428–3429,3433,3666,3673,3675,3791,3798–3799,3936,3979,4265,4289,4351,4540–4541,4549–4550,4556,4602,5373,5431,5586,5771,5885,5911,5918,6045,6050,6075,6077,6102–6103,6183,6188,6237,6476,6603,6779,6850
```

**B.ROSTER** 读 12 处：

```
2828,2838,2856,2883,3264,4529,5430,6060,6062,6395,6607,6795
```

**B.CTL** 读 6 处：

```
2700,2722,2738,2757,2775,4526
```

**B.ACTIVE** 读 8 处：

```
114,3775,3871,6839–6840,6845–6846,6848
```


## 附录 C 每函数的 `g`/`G`/`FN`/`UI4`/`HUD_INST` 读写分布（前 40）

| 函数 | 定义行 | g 写 | g 读 | G 写 | G 读 | FN 读 | UI4 读 | HUD_INST 读 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `FN.enterMode` | 4535 | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |
| `restartMatch` | 4601 | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |
| `OnStart` | 5791 | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ |
| `startIfWaiting` | 1501 | ✓ | ✓ |  | ✓ | ✓ |  | ✓ |
| `FN.exitToMenu` | 4565 | ✓ |  | ✓ | ✓ |  |  |  |
| `OnUpdate` | 6611 | ✓ | ✓ |  | ✓ | ✓ | ✓ |  |
| `clearLines` | 1118 | ✓ | ✓ |  | ✓ | ✓ |  |  |
| `showGameOver` | 1690 | ✓ | ✓ |  | ✓ |  |  | ✓ |
| `FN.skillCast` | 4231 | ✓ | ✓ |  | ✓ | ✓ |  |  |
| `FN.aiTickCore` | 4807 | ✓ | ✓ |  | ✓ | ✓ |  |  |
| `refillBag` | 202 | ✓ | ✓ |  | ✓ |  |  |  |
| `MS.opts` | 722 | ✓ | ✓ |  |  |  | ✓ |  |
| `spawn` | 1080 | ✓ | ✓ |  | ✓ |  |  |  |
| `doLock` | 1263 | ✓ | ✓ |  |  | ✓ |  |  |
| `newGame` | 1436 | ✓ | ✓ |  | ✓ |  |  |  |
| `demoLoopReset` | 2028 | ✓ | ✓ |  |  |  |  | ✓ |
| `feedMirror` | 2054 | ✓ | ✓ |  | ✓ |  |  |  |
| `raiseGarbage` | 2068 | ✓ | ✓ |  | ✓ |  |  |  |
| `FN.syncStage` | 2833 |  | ✓ |  | ✓ | ✓ | ✓ | ✓ |
| `FN.aiDrop` | 4654 | ✓ | ✓ |  |  | ✓ |  |  |
| `settleDestroy` | 411 | ✓ | ✓ |  |  |  |  |  |
| `buildSettleLayer` | 558 | ✓ | ✓ |  |  |  |  |  |
| `settleTick` | 914 | ✓ | ✓ |  |  |  |  |  |
| `stepDown` | 1361 | ✓ | ✓ |  |  |  |  |  |
| `moveBy` | 1380 | ✓ | ✓ |  |  |  |  |  |
| `rotate` | 1409 | ✓ | ✓ |  |  |  |  |  |
| `NUM.doHold` | 1981 | ✓ | ✓ |  |  |  |  |  |
| `buildBoardControls` | 3321 | ✓ | ✓ |  |  |  |  |  |
| `destroyBoardControls` | 3375 | ✓ | ✓ |  |  |  |  |  |
| `placeBoard` | 3399 | ✓ | ✓ |  |  |  |  |  |
| `FN.tickInstance` | 6515 | ✓ | ✓ |  |  |  |  |  |
| `renderHud` | 1032 |  | ✓ |  | ✓ |  |  | ✓ |
| `toggleHelp` | 2480 |  | ✓ |  |  | ✓ | ✓ |  |
| `FN.layoutDual` | 3421 |  |  |  | ✓ | ✓ |  | ✓ |
| `FN.paintFrames` | 3790 |  | ✓ |  | ✓ | ✓ |  |  |
| `state` | 5428 |  | ✓ |  | ✓ | ✓ |  |  |
| `layout` | 5760 |  | ✓ |  | ✓ | ✓ |  |  |
| `FN.pollCanvasSize` | 6595 |  |  |  |  | ✓ | ✓ | ✓ |
| `setText` | 306 |  |  |  |  | ✓ |  | ✓ |
| `MS.build` | 2626 |  |  |  |  | ✓ | ✓ |  |

## 附录 D 抽样回验（5 处，逐条给出该行原文）

| # | 行号 | 断言 | 该行原文（strip 后） | 结果 |
| --- | --- | --- | --- | --- |
| 1 | 117 | `MODE` 初值 casual | `MODE = 'casual'` | ✅ |
| 2 | 112 / 113 | `G` / `g` 声明 | `local G = {}                             -- 游戏实例表：G[1]=主实例；双屏模式 G[2]=第二盘` ／ `local g                                  -- 当前实例引用（=G[1]；双屏循环重绑定）` | ✅ |
| 3 | 4542 | `G[2]` 下标写 | `G[2] = newInst()` | ✅ |
| 4 | 5761 | `CANVAS_W` 在 layout 内重绑定 | `CANVAS_W, CANVAS_H = W, H` | ✅ |
| 5 | 6515 | `FN.tickInstance` 定义 | `FN.tickInstance = function(d)` | ✅ |
| 6 | 机检 | main chunk local 数 / 函数数 | `luac5.3 -p -l -l lua/main.lua` → `149 slots … 146 locals … 196 functions` | ✅ 与 §1.2 / §3.1 一致 |

模块侧同法回验 8 处（`lua/tetris/` 全部取 HEAD 版本）：

| # | 文件:行 | 该行原文 | 与 §2 的对应 |
| --- | --- | --- | --- |
| 6 | `roster.lua:21` | `FN.rosterDestroy = function()` | 2.1 `FN.rosterDestroy` |
| 7 | `roster.lua:45` | `ROSTER.on = false` | 2.1 `ROSTER.on` |
| 8 | `roster.lua:177` | `FN.rosterBuild = function(keepSel, keepTab)` | 2.1 `FN.rosterBuild` |
| 9 | `roster.lua:567` | `ROSTER.savedTop = tostring(topBanner and topBanner.text or '')` | 2.1 `ROSTER.savedTop` |
| 10 | `config.lua:731` | `NUM.UI_KIT = {` | 2.1 `NUM.UI_KIT`（ui.lua 读） |
| 11 | `config.lua:759` | `NUM.PHONE = {` | 2.1 `NUM.PHONE`（ui.lua 读 18 处） |
| 12 | `config.lua:513` | `THEME.deco = STYLE.deco or {}` | 2.1 `THEME.deco` |
| 13 | `main.lua:415` | `SETTLE_HOTS = {}` | 1.2 结算热区单份表被清空 |
