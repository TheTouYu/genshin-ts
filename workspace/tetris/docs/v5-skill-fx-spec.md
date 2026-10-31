# v5.0 角色技能 · 特效与文案规格（人可核）

> 交付物：`lua/tetris/fx.lua`（特效引擎）、`lua/tetris/copy.lua`（文案库 + 主题色）、本文件。
> 写于 2026-10-29，作者 = fx-copy。**判据来源 = 用户原话**：
> 「四个角色都有自己的主题颜色，那么它的机制，文案等触发的时候，就一定要体现出来」
> 「新增的文案，我体验下来，没有一点实感」
> 「四个角色技能，和没做一样——按钮、触发动画、音效、文案、说明、主题色一点都没做」

## 0. 一句话结论

每个角色施放时，屏幕上同时发生 **5 类可见变化**（主题色全屏闪 → 界内环波 → 棋盘描边脉冲 →
名卡 + 浮字 → 屏幕四边呼吸光），配 **1 条专属音效** 与 **2 行实感文案**；
全部元素按棋盘矩形（`spec.boardRect`）限幅，**不进左右两栏、不压常驻提示**。

---

## 1. 触发点 × 反馈清单（每角色 6 个触发点）

| 触发点 | 机制（真实现） | 屏幕上的东西 | 代码出口 |
|---|---|---|---|
| 施放成功 | `skills.cast` → effect | 全屏主题色闪(0.24s) + 界内双环(0.8s) + 棋盘描边追光(0.7s) + 名卡(1.4s) + 浮字 + 边缘光(1.0s) + 音效 | `FN.skillFeedback` → `fx.burst/banner/boardOutline/edgeGlow/floatText` |
| 施放失败 | why=cd/energy/locked | 主题色浮字（含真实差值）+ 特效层抖动 0.16s + 失败音 | `FN.skillFail` → `fx.shake/floatText` |
| 持续中（每 2.4s） | 纳西妲接管 6~10s / 甘雨冰封 3s+ / 少女涟漪 | 边缘光续时 + 文案轮播（**由 main 的 `FN.skillTick` 驱动**，见 §7） | `COPY.hold(role, elapsed, left, n)` + `fx.edgeGlow` |
| 结束/命中 | 技能收手 / 结算 | 名卡 + 一次短环波 + 收尾文案 | `FN.skillFeedback(kind='end')` → `COPY.settle` |
| 局内升级 | `skills.addExp` | 名卡 Lv(n) + 环波 + 升级音 | `COPY.level` + `fx.banner` |
| 解锁 | `skills.tryUnlock` | 名卡「契约缔结」+ 主题色闪 + 环波 | `COPY.unlock` + `fx.banner/burst` |

**每角色的主题色贯穿**：全屏闪 = 主题色；环波 = 主题色；棋盘描边 = 主题色；名卡描边/底线/标题 =
主题色；浮字 = 主题色；边缘光 = 主题色。四角色同屏可区分（见 §4 主题色表）。

### 表 1：9 种 burst 形态（每个都是多元素合成，不是"发光一下"）

| kind | 合成元素 | 用它的角色 |
|---|---|---|
| `flash` | 全屏主题色闪 + 6 火花 | 通用/失败 |
| `ring` | 界内双环 + 8 火花 | 通用兜底 |
| `spark` | 5 火花 + 小环 | 通用 |
| `shard` | 5 碎片（旋转下坠）+ 微闪 | 通用/清底 |
| `wave` | 5 条横扫带（错峰推过棋盘）+ 双环 | 少女（对战） |
| `frost` | 霜蓝闪 + 双环 + 7 冰晶（三角上浮）+ 3 条冷横扫 | **甘雨** |
| `vine` | 草绿闪 + 双环 + 8 叶片（四芒星螺旋）+ 5 火花 | **纳西妲** |
| `bolt` | 雷紫闪 + 4 雷楔短段（闪烁）+ 9 电火花 + 环 | **刻晴** |
| `petal` | 青白闪 + 双环 + 8 花瓣（五芒星飘落） | **少女（单人）** |

---

## 2. 特效引擎规格（`lua/tetris/fx.lua`）

### 2.1 对象池：**同屏 24 个控件，一次建好，永不新建**

| 组 | 槽位数 | 用途 |
|---|---|---|
| flash | 1 | 全屏闪 |
| edge | 4 | 屏幕四边呼吸光 |
| frame | 4 | 棋盘描边（上下左右追光） |
| part | 5 | 粒子（火花/碎片/冰晶/叶/花瓣/雷楔） |
| ring | 2 | 界内双环（椭圆，用内置 ring 图元 100006） |
| band | 2 | 横扫带 |
| card | 3 | 名卡（外框 + 内板 + 底线） |
| text | 3 | 名卡上行 / 下行 / 浮字 |
| **合计** | **24** | 池满即复用最老的（每组环形游标） |

`fx.stats()` 打印 `ctl=24`；重复触发不新建（mock 自测断言）。

### 2.2 三条硬技术约束怎么落

1. **图像只用模板实例**：`game.InstantiateClientUIControl(tpl.card, root)`；形状靠
   `ctl:SetImage(Enum.ImageSource.StaticReference, <id>)` 切内置六类代理图元
   （rect 100001 / circle 100002 / triangle 100003 / fourstar 100004 / fivestar 100005 / ring 100006）。
2. **alpha 只走 imageColor 高字节**（ARGB），文字透明度走 fontColor 高字节；全模块不用 `SetVisible`。
3. **每帧零分配**：建池时给每个槽位预绑定写函数（`function(x,y) ctl:SetAnchoredPosition(x,y) end`），
   热路径是 `pcall(slot.wPos, x, y)`——不再每帧造闭包；冷路径（建池/出生）走 main 传入的
   `trySet/tryCall`（保留枚举映射与失败日志）。

### 2.3 几何与位置（Lead 2026-10-29 打回后的定案）

| 元素 | 规则 | 为什么 |
|---|---|---|
| 环波 | **椭圆**，宽高各自涨到 `(boardRect.w, boardRect.h)` 即淡出（`UPD[5]`） | 打回原文"直径 700~900px 的同心圆盖到左右两栏，像随手画圈"。现在永远收束在棋盘里侧 |
| 棋盘描边 | 4 条贴 `boardRect ±3px` 的亮边，按「左右上下」顺序 0.9s 转一圈（`UPD[3]`） | Lead："沿棋盘矩形转一圈的亮边比大圆更像接管" |
| 名卡 | 420×(96 或 52) 紧凑卡片：外框(主题色) + 内板(深墨) + 底线(主题色)。**高画布放棋盘正上方**；低画布（1280×720 棋盘上方只剩 60px）改放棋盘下方空带并自适应压到 52 高 | 打回原文"一整条横贯屏幕的半透明绿带 + 左端挂个空心小圆，很掉价" |
| 浮字 | 名卡在场时移到**名卡右侧同高**（`x = cardRight + 132`, `y = card.cy - 8`） | 放正上方会被上浮 40px 顶出画布（实测被裁）；放棋盘里会压方块/当前块 |
| 边缘光 | 屏幕四边 7px，呼吸 | 不参与"界内"约束（它本来就贴屏幕边） |
| 抖动 | `fx.shake` **只抖特效层**（给特效坐标叠 sdx/sdy） | 整屏抖动归 main 的 `startShake`（Lead 裁决） |

### 2.4 时长与判据自查

- 首帧可见：`burst` 在同一帧就写颜色（`pcall(wCol, ...)`）⇒ **0ms 起可见**
  （mock 自测：每个 kind 首帧 ≥3 件 alpha>8）。
- 总长：flash 0.53s / ring 0.73s / spark 0.73s / shard 0.83s / wave 0.67s / frost 1.10s /
  vine 0.80s / bolt 0.57s / petal 1.37s；名卡 ≤2.4s（`banner` 内部硬夹）⇒ **全部 ≤2.5s**。
- 池上限 24 ⇒ 同屏 fx 控件数上限 = 24（名卡+浮字+环+粒子+闪全开也超不过）。

---

## 3. 文案 → 数值溯源（「实感」= 数字必须是真的）

| 文案里出现的数字 | 出处（`lua/tetris/skills.lua`） | 生效条件 |
|---|---|---|
| 纳西妲「接管 6~10 秒」 | `NAHIDA.TAKE_DUR = {6, 8, 10}`（按 N1 等级）+ `META.AI_DUR_PER_LV = 0.04/lv` | N1 lv1→6s，lv2→8s，lv3→10s；角色等级每级 +0.04s |
| 纳西妲「冷却 25 秒」 | `CD.nahida = 25` | 固定 |
| 刻晴「冷却 7.5 秒，升级后 4.5 秒」 | `KEQING.BLINK_CD = {7.5, 6.0, 4.5}` | 由 N2 等级取档（N2 未开时 = 7.5） |
| 刻晴「落地后 0.2 秒不能横移」 | `KEQING.LOCK = {0.20, 0.15, 0.10}` | 由 N3 等级取档 |
| 甘雨「冰封 3 秒起，每级多 0.05 秒」 | `GANYU.FREEZE_SEC = 3` + `META.FREEZE_SEC_PER_LV = 0.05` | lv1 恰为 3.0s |
| 甘雨「冷却 12 秒」 | `CD.ganyu = 12` | 固定 |
| 甘雨「对家的盘不受影响」 | `main.lua` `raiseGarbage`：`SK.freezeT > 0 and target == G[1]` 才拦 | 只封玩家自己的盘（AI 盘公平） |
| 少女「推 2~4 行」 | `COLUMBINA.LAYERS = {2, 3, 4}`（按 N1）+ 对手板高 ≥ `PRESSURE_H = 15` 再 +1，`LAYER_CAP = 4` | 对战模式 |
| 少女「单人清底一行」 | `COLUMBINA.CLEAR_ROWS = 1`、`SOLO_COST = 0` | 单人/合作降级分支（不耗能） |
| 少女「对战一次耗能 60，回能 6 点每秒」 | `COST.columbina = 60`、`ENERGY_REGEN = 6` | 约 10s 攒满 |

**刻意没写的数字（写了就是假的）**：

- 甘雨「冻结行数」：`freezeRows` 只进日志，真正生效的是 `freezeT` 秒内不收垃圾
  ⇒ 文案写"秒"不写"行"。
- 少女「削减对手锁定延迟」：`LD_CUT` 在 `skills.lua` 里算出来了，但 `main.lua` 的 ripple 分支
  目前走的是 `raiseGarbage(opp, layers)`（推垃圾），**没有消费 `holdCutMs`** ⇒ 文案不写这条。

---

## 4. 文案表（全量，机检：`copy.audit()`）

判据：每条正文 **≤22 字**（按 UTF-8 字符数，标点算一格，最保守）；四角色每个触发点 ≥3 条。
`copy.audit()` 实测：**total=113、maxLen=21、over=0、ok=true**。
（2026-10-29 二轮：按 Lead 文案评审改了 4 处口吻硬伤 + 每角色补 1 条带真数字的 `settleBig`；
三轮：少女补 1 条带真层数的 `holdN`，hold 改为四参契约 `hold(role, elapsed, left, n)`。）

| # | 触发点 | 可判定条件 | 文案 | 字数 |
|---|---|---|---|---|
| nahida.cast1 | 施放（Z/U） | skillFeedback kind=cast | 松手吧，这盘我来落子。 | 11 |
| nahida.cast2 | 施放（Z/U） | skillFeedback kind=cast | 这几秒别碰键，我摆给你看。 | 13 |
| nahida.cast3 | 施放（Z/U） | skillFeedback kind=cast | 你听着，落子声我替你数。 | 12 |
| nahida.hold1 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 还在落，别急，我数着。 | 11 |
| nahida.hold2 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 这一块我摆右边，记住。 | 11 |
| nahida.hold3 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 快好了，准备接手。 | 9 |
| nahida.fail-cd | 失败·冷却 | skills.cast → why=cd | 树影没散，还等 {n} 秒。 | 14 |
| nahida.fail-energy | 失败·能量 | why=energy（少女对战 60 点） | 草元素还没回满，还差 {n} 点。 | 17 |
| nahida.fail-locked | 失败·未解锁 | why=locked | 树还没认你，别急着按。 | 11 |
| nahida.settle1 | 结算 | skillFeedback kind=end / 结算旁白 | 这一盘收好了，树记得。 | 11 |
| nahida.settle2 | 结算 | skillFeedback kind=end / 结算旁白 | 你把盘面守住了，我看见了。 | 13 |
| nahida.settle3 | 结算 | skillFeedback kind=end / 结算旁白 | 手还热着，再来一盘？ | 10 |
| nahida.win | 结算·胜利 | res.win == true | 赢了。去树下坐一会儿。 | 11 |
| nahida.quad | 结算·四消 | res.lines >= 4 | 一次四行——你比我预想的快。 | 14 |
| nahida.settleBig | 结算·战果（带真数字） | res.lines >= 8 | 清了 {lines} 行，树都记住了。 | 19 |
| nahida.level1 | 局内升级 | skills.addExp → leveled | 树根又深一寸。 | 7 |
| nahida.level2 | 局内升级 | skills.addExp → leveled | 我又看清了一层。 | 8 |
| nahida.level3 | 局内升级 | skills.addExp → leveled | 长一级，替你落子更稳。 | 11 |
| nahida.unlock | 解锁 | skills.tryUnlock ok=true | 契约已立，按 Y 换我上场。 | 14 |
| nahida.idle1 | 标题/帮助页 | M.idle(role) | 树荫下，棋盘还没开。 | 10 |
| nahida.idle2 | 标题/帮助页 | M.idle(role) | 想好了再落，不急。 | 9 |
| nahida.help1 | 帮助页说明 | M.help(role)[i] | Z：纳西妲接管盘面替你落子。 | 14 |
| nahida.help2 | 帮助页说明 | M.help(role)[i] | 接管 6~10 秒，冷却 25 秒。 | 18 |
| nahida.help3 | 帮助页说明 | M.help(role)[i] | 接管期间的分数照算你的。 | 12 |
| nahida.tip1 | 玩法提示 | M.tips(role)[i] | 盘面快顶死时按，能救一手。 | 13 |
| nahida.tip2 | 玩法提示 | M.tips(role)[i] | 台前角色按 Z，第二人按 U。 | 15 |
| nahida.tip3 | 玩法提示 | M.tips(role)[i] | 按 Y 换人，两个角色各一招。 | 15 |
| keqing.cast1 | 施放（Z/U） | skillFeedback kind=cast | 雷楔落定，这一手不回头。 | 12 |
| keqing.cast2 | 施放（Z/U） | skillFeedback kind=cast | 让开半步，落点已经定了。 | 12 |
| keqing.cast3 | 施放（Z/U） | skillFeedback kind=cast | 这块我钉到底，你别管。 | 11 |
| keqing.hold1 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 雷还在剑上，接着来。 | 10 |
| keqing.hold2 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 这块到位了，下一块给我。 | 12 |
| keqing.hold3 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 别停手，节奏跟上来。 | 10 |
| keqing.fail-cd | 失败·冷却 | skills.cast → why=cd | 剑还没回鞘，等 {n} 秒。 | 14 |
| keqing.fail-energy | 失败·能量 | why=energy（少女对战 60 点） | 雷元素不够，还差 {n} 点。 | 15 |
| keqing.fail-locked | 失败·未解锁 | why=locked | 剑还没认主，别急着按。 | 11 |
| keqing.settle1 | 结算 | skillFeedback kind=end / 结算旁白 | 这一局收得利落。 | 8 |
| keqing.settle2 | 结算 | skillFeedback kind=end / 结算旁白 | 雷楔没白用。 | 6 |
| keqing.settle3 | 结算 | skillFeedback kind=end / 结算旁白 | 再快半拍，就更像我了。 | 11 |
| keqing.win | 结算·胜利 | res.win == true | 赢了，这是玉衡星的速度。 | 12 |
| keqing.quad | 结算·四消 | res.lines >= 4 | 四行一起没了，我看见了。 | 12 |
| keqing.settleBig | 结算·战果（带真数字） | res.lines >= 8 | {lines} 行，这一盘够快。 | 16 |
| keqing.level1 | 局内升级 | skills.addExp → leveled | 剑更快了。 | 5 |
| keqing.level2 | 局内升级 | skills.addExp → leveled | 落点更准了。 | 6 |
| keqing.level3 | 局内升级 | skills.addExp → leveled | 雷音更短了。 | 6 |
| keqing.unlock | 解锁 | skills.tryUnlock ok=true | 刻晴到。雷楔借你一次。 | 11 |
| keqing.idle1 | 标题/帮助页 | M.idle(role) | 玉衡星的事很多，棋盘算一件。 | 14 |
| keqing.idle2 | 标题/帮助页 | M.idle(role) | 这一手，我替你算过了。 | 11 |
| keqing.help1 | 帮助页说明 | M.help(role)[i] | Z：当前方块瞬落到底并锁定。 | 14 |
| keqing.help2 | 帮助页说明 | M.help(role)[i] | 冷却 7.5 秒，升级后 4.5 秒。 | 19 |
| keqing.help3 | 帮助页说明 | M.help(role)[i] | 落地后 0.2 秒不能横移。 | 14 |
| keqing.tip1 | 玩法提示 | M.tips(role)[i] | 井口对好了再按，落点不会改。 | 14 |
| keqing.tip2 | 玩法提示 | M.tips(role)[i] | 冷却很短，卡住了就用。 | 11 |
| keqing.tip3 | 玩法提示 | M.tips(role)[i] | 按 Y 换人，两人各一招。 | 13 |
| ganyu.cast1 | 施放（Z/U） | skillFeedback kind=cast | 霜落下来，脏东西进不来了。 | 13 |
| ganyu.cast2 | 施放（Z/U） | skillFeedback kind=cast | 这几秒你不用管垃圾行。 | 11 |
| ganyu.cast3 | 施放（Z/U） | skillFeedback kind=cast | 我盖一层雪，你先摆。 | 10 |
| ganyu.hold1 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 冰还在，放心堆。 | 8 |
| ganyu.hold2 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 雪没化，继续。 | 7 |
| ganyu.hold3 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 要化了，自己当心。 | 9 |
| ganyu.fail-cd | 失败·冷却 | skills.cast → why=cd | 霜还没积够，等 {n} 秒。 | 14 |
| ganyu.fail-energy | 失败·能量 | why=energy（少女对战 60 点） | 寒气不够，还差 {n} 点。 | 14 |
| ganyu.fail-locked | 失败·未解锁 | why=locked | 契书还没盖印，先别按。 | 11 |
| ganyu.settle1 | 结算 | skillFeedback kind=end / 结算旁白 | 这一局，稳住了。 | 8 |
| ganyu.settle2 | 结算 | skillFeedback kind=end / 结算旁白 | 雪停了，棋盘也干净。 | 10 |
| ganyu.settle3 | 结算 | skillFeedback kind=end / 结算旁白 | 月海亭的活，也算干完了。 | 12 |
| ganyu.win | 结算·胜利 | res.win == true | 赢了。回去的路上留意脚下。 | 13 |
| ganyu.quad | 结算·四消 | res.lines >= 4 | 四行，一口气。像削雪。 | 11 |
| ganyu.settleBig | 结算·战果（带真数字） | res.lines >= 8 | {lines} 行，路算是铺平了。 | 17 |
| ganyu.level1 | 局内升级 | skills.addExp → leveled | 霜气又厚了一分。 | 8 |
| ganyu.level2 | 局内升级 | skills.addExp → leveled | 冰封更久了一点。 | 8 |
| ganyu.level3 | 局内升级 | skills.addExp → leveled | 我看得更远了。 | 7 |
| ganyu.unlock | 解锁 | skills.tryUnlock ok=true | 甘雨在。要我堵住缺口吗。 | 12 |
| ganyu.idle1 | 标题/帮助页 | M.idle(role) | 月海亭的公文堆着，棋盘也堆着。 | 15 |
| ganyu.idle2 | 标题/帮助页 | M.idle(role) | 雪落在肩上，落子声很轻。 | 12 |
| ganyu.help1 | 帮助页说明 | M.help(role)[i] | Z：冰封自己的盘，垃圾进不来。 | 15 |
| ganyu.help2 | 帮助页说明 | M.help(role)[i] | 冰封 3 秒起，每级多 0.05 秒。 | 19 |
| ganyu.help3 | 帮助页说明 | M.help(role)[i] | 冷却 12 秒，对家的盘不受影响。 | 17 |
| ganyu.tip1 | 玩法提示 | M.tips(role)[i] | 被连打时按，最值。 | 9 |
| ganyu.tip2 | 玩法提示 | M.tips(role)[i] | 冰封只保你的盘，别忘反击。 | 13 |
| ganyu.tip3 | 玩法提示 | M.tips(role)[i] | 按 Y 换人，两人各一招。 | 13 |
| girl.cast1 | 施放（Z/U） | skillFeedback kind=cast | 潮水翻了，垃圾推回对面。 | 12 |
| girl.cast2 | 施放（Z/U） | skillFeedback kind=cast | 风向变了，你接着摆。 | 10 |
| girl.cast3 | 施放（Z/U） | skillFeedback kind=cast | 我把这一圈涟漪送给他。 | 11 |
| girl.hold1 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 垃圾已经压过去了，别停。 | 12 |
| girl.hold2 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 对面盘面在变高，接着摆。 | 12 |
| girl.hold3 | 持续中（每 2.4s） | left>2.5 轮播 / left<=2.5 出收尾句 | 推完这层就收手。 | 8 |
| girl.holdN | 持续中·带真数字 | n>=2 且 left>2.5（n=给对手挂的层数） | 已经压过去 {n} 层，别停。 | 15 |
| girl.fail-cd | 失败·冷却 | skills.cast → why=cd | 潮还没起，等 {n} 秒。 | 13 |
| girl.fail-energy | 失败·能量 | why=energy（少女对战 60 点） | 月华不够，还差 {n} 点。 | 14 |
| girl.fail-locked | 失败·未解锁 | why=locked | 潮水还没认你，别按。 | 10 |
| girl.settle1 | 结算 | skillFeedback kind=end / 结算旁白 | 潮退了，收拾一下。 | 9 |
| girl.settle2 | 结算 | skillFeedback kind=end / 结算旁白 | 这一局，我替你看了水。 | 11 |
| girl.settle3 | 结算 | skillFeedback kind=end / 结算旁白 | 风向没变，接着来。 | 9 |
| girl.win | 结算·胜利 | res.win == true | 赢了。月还在头顶。 | 9 |
| girl.quad | 结算·四消 | res.lines >= 4 | 四行沉下去，一声都没响。 | 12 |
| girl.settleBig | 结算·战果（带真数字） | res.lines >= 8 | {lines} 行沉下去，水面很静。 | 18 |
| girl.level1 | 局内升级 | skills.addExp → leveled | 潮声更清楚了。 | 7 |
| girl.level2 | 局内升级 | skills.addExp → leveled | 引力又紧了一分。 | 8 |
| girl.level3 | 局内升级 | skills.addExp → leveled | 我看得见更远的水面。 | 10 |
| girl.unlock | 解锁 | skills.tryUnlock ok=true | 哥伦比娅应你了。按 Y 换我。 | 15 |
| girl.idle1 | 标题/帮助页 | M.idle(role) | 水面很平，正好下棋。 | 10 |
| girl.idle2 | 标题/帮助页 | M.idle(role) | 月亮跟着我，落子也轻。 | 11 |
| girl.help1 | 帮助页说明 | M.help(role)[i] | Z：往对手盘里推 2~4 行垃圾。 | 17 |
| girl.help2 | 帮助页说明 | M.help(role)[i] | 对手板越高，推的层数越多。 | 13 |
| girl.help3 | 帮助页说明 | M.help(role)[i] | 单人局改成清掉盘底一行。 | 12 |
| girl.tip1 | 玩法提示 | M.tips(role)[i] | 对手板快满时按，层数更高。 | 13 |
| girl.tip2 | 玩法提示 | M.tips(role)[i] | 单人局不耗能，卡住就按。 | 12 |
| girl.tip3 | 玩法提示 | M.tips(role)[i] | 对战一次耗能 60，回能 6 点每秒。 | 19 |

合计 **81 条**（四角色：纳西妲 / 刻晴 / 甘雨 / 少女）。纳西妲/刻晴/甘雨各 28 条、少女 29 条（多一条带真层数的持续句）：施放3 + 持续3 + 失败3 + 结算3 + 胜1 + 四消1 + 战果1 + 升级3 + 解锁1 + 风味2 + 帮助3 + 提示3（+少女 holdN 1）。

### 主题色（`copy.ROLES[*].color` 等，ARGB 高字节 alpha；UI 与特效共用同一张表）

| 角色 | 键 | 元素 | 主色 color | 辅色 color2 | 高亮 accent | 边缘光 glow |
|---|---|---|---|---|---|---|
| 纳西妲 | `nahida` | 草 | `0xFF7FCF6A` | `0xFF4E9A3C` | `0xFFE2FAB4` | `0x5A7FCF6A` |
| 刻晴 | `keqing` | 雷 | `0xFFB18CFF` | `0xFF7A4FD0` | `0xFFECDAFF` | `0x5AB18CFF` |
| 甘雨 | `ganyu` | 冰 | `0xFF8FDAF0` | `0xFF4A9FC4` | `0xFFE8F9FF` | `0x5A8FDAF0` |
| 少女 | `columbina` | 风 | `0xFF6FD3E8` | `0xFFBFF3EA` | `0xFFFFD9E8` | `0x5A6FD3E8` |

### 机制一句话（`skillDesc`，帮助页与 HUD 共用）

- **纳西妲 · 所闻遍计**：`AI 替你落子，接管 6~10 秒。` —— Z：纳西妲接管盘面替你落子。 / 接管 6~10 秒，冷却 25 秒。 / 接管期间的分数照算你的。
- **刻晴 · 星斗归位**：`当前方块瞬落到底并锁定。` —— Z：当前方块瞬落到底并锁定。 / 冷却 7.5 秒，升级后 4.5 秒。 / 落地后 0.2 秒不能横移。
- **甘雨 · 降众天华**：`冰封自己的盘，垃圾进不来。` —— Z：冰封自己的盘，垃圾进不来。 / 冰封 3 秒起，每级多 0.05 秒。 / 冷却 12 秒，对家的盘不受影响。
- **少女 · 引力涟漪**：`对战推 2~4 行垃圾回去；单人清底一行。` —— Z：往对手盘里推 2~4 行垃圾。 / 对手板越高，推的层数越多。 / 单人局改成清掉盘底一行。

---

## 5. 验收证据（这一节是"我真的看了图"，不是"代码写了"）

### 5.1 出图方法（可复现）

```bash
# 一次性 harness（在 .scratch/fx-demo/，不进交付链路）
node .scratch/fx-demo/make-strips.mjs pc-16-9 pc         # 1600×900
node .scratch/fx-demo/make-strips.mjs mobile-16-9 mobile  # 1280×720
lua  .scratch/fx-demo/mock-test.lua                       # 逻辑/池/性能自测
```

两个**真会话叠图**：会话 A 跑真 `main.lua` 走到局内（真实棋盘/HUD/背景作底盘），会话 B 只挂
`.scratch/fx-demo/demo-fx.lua`（真 fx.lua + 真 copy.lua）出特效层；两次 paint 用
`renderPaintPng` 叠成一张图——所以下面的图就是"玩家会看到的样子"，不是示意图。

### 5.2 产物与判词

**pc-16-9（1600×900）**

| 路径 | 判词（我逐张 read_image 看过） |
|---|---|
| `out/pc/backdrop-pc-16-9.png` | 真界面底盘：棋盘/HUD/预览/提示都对；确认叠图底座不是伪造 |
| `out/pc/role-nahida-t0.png` | 0.1s：草绿全屏闪 + 棋盘内两道椭圆环 + 棋盘描边亮边 + 名卡（草绿描边/卡内两行字）+ 浮字在名卡右侧 + 四边绿光。**不裁边、不压左右两栏** ✅ |
| `out/pc/role-nahida-t1.png` / `-t2.png` | 0.4s / 1.2s：环已撑到棋盘边缘并淡出；名卡在 1.2s 淡出中；棋盘描边由亮转暗 ⇒ **在动且有收尾**，不是常驻遮罩 |
| `out/pc/role-keqing-t0.png` | 雷紫同构；环/描边/名卡/浮字全部换成紫色系 ⇒ **主题色确实跟着角色走** |
| `out/pc/role-ganyu-t0.png` / `role-columbina-t0.png` | 冰蓝 / 风青白 同上（四角色同屏可区分） |
| `out/pc/strip-<kind>.png`（9 个，4×2 格 = 8 帧 @1/30s） | 9 种 kind 逐条看过：都能辨认出元素与运动方向 |
| `out/pc/strip-combo.png` | 技能四件套合成（名卡+环+描边+浮字+抖动）8 帧 |

**mobile-16-9（1280×720）**

| 路径 | 判词 |
|---|---|
| `out/mobile/role-ganyu-t1.png` | 720 高画布上棋盘上方只剩 60px ⇒ **名卡自动落到棋盘下方空带**（甘雨青边），不压键盘提示条、不压棋盘 ✅ |
| `out/mobile/role-<role>-t0/t1/t2.png`（12 张） | 四角色 × 0.1/0.4/1.2s；环始终在棋盘内 |
| `out/mobile/strip-combo.png` 等 | 同上 |

### 5.3 帧间像素差（真解码 PNG 后逐像素比，证明它在动）

pc-16-9（0..255 尺度，全帧均值；`f0→f1` = 触发帧到下一帧，`f0→f7` = 到第 8 帧）：

| kind | 叠图节点 | f0→f1 | f0→f7 | 场景变化节点 |
|---|---|---|---|---|
| `flash` | 40 | 3.38 | 10.54 | 12 |
| `ring` | 40 | 0.69 | 1.67 | 12 |
| `spark` | 40 | 0.78 | 1.73 | 12 |
| `shard` | 40 | 4.16 | 9.67 | 12 |
| `wave` | 40 | 0.69 | 1.54 | 8 |
| `frost` | 40 | 5.61 | 21.23 | 14 |
| `vine` | 40 | 3.20 | 10.09 | 13 |
| `bolt` | 40 | 5.45 | 10.24 | 13 |
| `petal` | 40 | 4.27 | 12.18 | 13 |

mobile-16-9：

| kind | 叠图节点 | f0→f1 | f0→f7 | 场景变化节点 |
|---|---|---|---|---|
| `flash` | 40 | 4.58 | 14.26 | 12 |
| `ring` | 40 | 1.02 | 2.37 | 12 |
| `spark` | 40 | 1.16 | 2.46 | 12 |
| `shard` | 40 | 4.24 | 9.94 | 12 |
| `wave` | 40 | 1.03 | 2.24 | 8 |
| `frost` | 40 | 5.95 | 21.60 | 14 |
| `vine` | 40 | 3.36 | 10.34 | 13 |
| `bolt` | 40 | 5.71 | 10.64 | 13 |
| `petal` | 40 | 4.49 | 12.55 | 13 |

四角色 0.1s→1.2s（pc-16-9）：

| 角色 | 单帧（原生 1600×900） | 像素差 |
|---|---|---|
| nahida | `out/pc/role-nahida-t0.png` | 4.86 |
| keqing | `out/pc/role-keqing-t0.png` | 3.44 |
| ganyu | `out/pc/role-ganyu-t0.png` | 10.94 |
| columbina | `out/pc/role-columbina-t0.png` | 5.59 |

（所有 kind 的 f0→f1 与 f0→f7 都 > 0 ⇒ 帧间确在变化；f0→f7 明显大于 f0→f1
⇒ 是单向演进，不是抖动噪声）

### 5.4 性能（判据 p95 < 0.3ms）

`lua .scratch/fx-demo/mock-test.lua`（Lua 5.3 + 假控件，满载 24 个特效同时活）：

```
满载 1500 帧: mean=0.0285ms p95=0.0340ms  active@burst=24 ctl=24
空载对照    : mean=0.0273ms p95=0.0320ms
```

模拟器内（fengari = 纯 JS 解释器，比真机 Lua 慢一个量级）：`demo bench ... msPerFrame=0.29~0.59`。
真机读数请接线后跑 `fx.bench(1500)`（模块内已备）。

### 5.5 逻辑自测（`mock-test.lua`，全绿）

① 建池 24 个控件、重复触发不新建 ② 9 种 burst + banner/edgeGlow/boardOutline/floatText/shake
都有真实写入 ③ 每帧 alpha 全落在 0..255 ④ 帧间确有变化 ⑤ 播完 200 帧全部归位
（size 1×1, y=-4000）⑥ 名卡文字写进 textbox ⑦ 每个 kind 首帧 ≥3 件可见、总长 ≤2.5s
⑧ 环/描边峰值 186×606（棋盘 180×600 + 6px，未越界）⑨ p95 0.034ms ⑩ 音效触发 274 次

---

## 6. 未验证 / 已知取舍（不粉饰）

1. **真机未部署**（按约定不部署、不 commit）。真机上 `imageColor` 的 alpha 行为、`SetImage(100006)`
   是否可用，只有模拟器证据；`ring` 已写降级路径（SetImage 失败 ⇒ 换 circle 椭圆并打日志
   `fx ring degrade`）。
2. **只验了 pc-16-9 与 mobile-16-9 两块画布**。`pc-21-9` / `mobile-19.5-9` / `mobile-4-3` 未出图。
   双屏模式（ai-battle/pvp/coop，棋盘在 x=±280）只做了**逻辑推演**：名卡/浮字都在 `bh/2` 之上的
   带子里，双屏棋盘上沿同样是 ±300 ⇒ 理论不压盘，但**没有出 dual 图**。
3. **720 高画布的浮字位置**：main 传 `y = H/2-96`，在 720 画布上这个点本身就在棋盘里；
   fx 只保证"不压名卡"。若要去掉，把调用点改成 `y = H/2-24` 即可。
4. **性能读数来自 Lua 5.3 + 假控件**（真机是引擎方法调用，成本略高）。
5. **音效 id 借用现有音效表**（`50884/50883/50872/40017/40001/50924/50929`），未做人耳听感确认；
   `audio.lua` 的 `SFX.skill` 四角色专属音效仍缺，等 Lead 统一挑。
6. `copy.lua` 的文案质量由 Lead 另评；本文件只保证「字数达标 + 数字与 skills.lua 一致 + 每触发点条数达标」。

---

## 7. 给 Lead 的接线契约（3 条）

```lua
FN.FXM.new({
  game = game, rootOf = function() return root end,
  W = function() return CANVAS_W end, H = function() return CANVAS_H end,
  trySet = trySet, tryCall = tryCall, sfx = sfx,
  colorOf = FN.skillColor,                                         -- 或 copy.colorOf
  tpl = { card = <cell 模板 guid>, text = <stext 模板 guid> },       -- nil ⇒ 自动降级
  boardRect = { w = 180, h = 600, cell = 28, cols = 6, rows = 20 },  -- 环波/描边限幅依据
  bannerText = true,   -- ★ 见下
})
```

- **`bannerText`**：`false`（或省略）⇒ 名卡只画框/板/底线，不画字（适合 main 的 topBanner 已在写
  同一句的情况）；`true` ⇒ 名卡内部居中画 `title` 与 `sub`（Lead 要的"内部居中文案"）。
  **两者选一，否则会重影**。
- `copy.ROLES` 同时有 `girl` 与 `columbina` 两个键（指向同一张表）；`copy.of()` 吃
  `girl / columbina / 少女 / 哥伦比娅` 四种写法。
- `fx.banner` 与 `fx.floatText` 的 `dur` 内部硬夹 2.4s，避免盖住下一次操作。
- **持续期文案链（谁驱动谁）**：`main.lua` 的 `FN.skillTick(dt)` 在接管/领域持续期**每 2.4s** 调一次
  `COPY.hold(role, elapsed, left, n)`；`elapsed` = 已持续秒数，`left` = 剩余秒数，`n` = 本次施放的
  效果量纲（纳西妲=AI 持续秒数 / 少女=给对手挂的层数 2~4 / 其余按 `skills.lua` 的 `res.n`）。
  **`left <= 2.5s` 时改出"收手"句**；**`n` 为 nil 或 <2 时绝不编数字**（少女单人分支 n=CLEAR_ROWS=1，
  写"压过去 1 层"会很怪）。
- **`spec.quiet = true`**：main 用 `SFX.skill[role]` 统一播技能音时传它，fx 不再自己播 burst 音
  （否则同帧两条音都 force 播放）。
- **`tpl.text` 可能是 nil**：`fn.fxInit()` 那一刻模板 guid 往往还没探测出来（实测
  `fx pool ok ctl=21 bad=0 text=0`）⇒ 拿到之后调一次 `FN.FX:setTpl{ text = <guid> }`，
  fx 会补建 3 个文字槽（总池仍是 24）并打日志 `fx text slots later ok n=3`。
