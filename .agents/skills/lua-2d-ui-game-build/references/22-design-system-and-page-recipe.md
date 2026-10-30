# 22 · 设计系统 + 「一页 20 行」配方（组件化批量生产）

> **为什么有这份文档**（用户 2026-10-30 的原话）：
> 「这个帮助页看着是还可以，但是代价是我们花了很多轮才修复好，我反馈了很多次。
>  我现在在把这些做的好的部分，抽离出来，作为组件和技能模组，是为了之后，可以批量生产这些东西。」
>
> 也就是说：**目标不是"再做一页好看的"，是"下一批页面一次做对"**。
> 这份文档 = 令牌（长什么样）+ 组件（怎么拼）+ 配方（怎么一次成型）+ 判据（怎么 30 秒验完）。

---

## 1. 设计令牌（2026-10-30 定稿，取值见 `lua/tetris/config.lua` 的 `STYLE_D`）

| 类别 | 令牌 | 值（D 版取紫雷柔光系） | 用法 |
|---|---|---|---|
| 纸面 | `panel` | `#FDFBF7` 系浅奶油 | 页面大底 |
| 卡片 | `card` | `#FFFFFF` | 卡片底（叠在 tint 上露出 4px 色边） |
| 描边 | `gold` / `goldDeep` | `#E2C67A` / `#B08A3C` | 分隔线、卡片描边、强调 |
| 正文 | `textMain` | `#3E3668` 深墨紫 | 标题、正文 |
| 次要 | `textSub` / `textDim` | `#4C4664` / `#5A556B` | 副标、注脚 |
| 主题色 | 每角色/模式 `color` / `color2(deep)` | 草绿/雷紫/冰蓝/青 | 选中态、卡片 tint、标题 |
| 圆角 | — | 卡片 19~22 · 胶囊 = 高/2 · 键帽 9 | **不允许直角**（直角只能出现在分隔线） |
| 字号 | 标题 / 卡头 / 正文 / 小字 | 38 / 26 / 18~19 / 15~17 | 一律整数（小数会静默回落 24 号） |
| 行距 | 正文 | 字号 × 1.9~2.0 | 四行文案用 36（18 号字） |
| 间距 | 卡内边距 / 卡间距 | 20~24 / 12~16 | 卡与卡之间必须留白，靠 tint 区分相邻卡 |

**对比度铁律**：正文对比 ≥ 4.5:1。做法＝**浅底放深字**（`textMain`），不要"浅底 + 半透明白字"（我们为此返工过三次）。

---

## 2. 组件清单（`lua/tetris/controls.lua`）

| 组件 | 签名 | 何时用 |
|---|---|---|
| `CTL.pill(name,x,y,w,h,fill,partSink)` | 返回 3 块零件 | 胶囊底/圆角卡片底（连装饰也用，保证圆角） |
| `CTL.btn(spec)` | `{id,screen,x,y,w,h,label,sub,key,preset,fs,pad,titleDy,subDy,fill,hoverColor,pressColor,ink,subInk,onPart,onClick,onEnter}` | **任何可点元素**（自动带热区 + `UI4.regAdd` + 三态 + 音效） |
| `CTL.textPanel(spec)` | `{id,x,y,w,h,accent,cardFill,title,titleFs,subtitle,lines[],footer,fs,lineGap,onPart}` | **任何大段文案区**（标题/副标/分隔线/多行左对齐/页脚） |

两条归属规则（踩过）：
- `onPart` 决定生命周期归属：标题页按钮 → `MS.parts`（随展台拆）；浮层页按钮 → 该页自己的清理表。
- 组件是**懒创建**的（在 `MS.build` 里），模块里必须用 getter 取：`ctl = function() return CTL end`。

---

## 3. 「一页 20 行」配方（照抄即可）

```lua
-- ① 页面骨架（遮罩 + 纸面 + 顶栏 + 分隔线）
local W,H = canvas(); local k = math.min(W/1600, H/900); local u = function(v) return v*k end
BOX('xxxDim', W+40, H+40, C(176,20,34,50))                     -- 半透明遮罩
BOX('xxxCard', u(1400), u(800), THEME.panel)                    -- 纸面
text('xxxTitle', '标题 · 副题', -420, 344, 560, 40, INK, 'Left')
BOX('xxxRule', u(1400), 2, THEME.gold)                          -- 分隔线（唯一允许的直线）

-- ② 页签（组件，选中态用实底色）
for i, name in ipairs(TABS) do
  local on = (i == tab)
  CTL.btn{ id='xxx.tab'..i, x=..., y=..., w=u(96), h=u(46), label=name, fs=18, pad=10,
    fill=on and accent or C(240,244,244,246), ink=on and WHITE or INK,
    onPart=add, onClick=function() rebuild(i) end }
end

-- ③ 列表（每行 = btn；选中行 = 主题色实底 + 白字，未选 = 浅底深字）
CTL.btn{ id='xxx.row'..i, x=..., y=..., w=u(360), h=u(96), label=名字, sub=状态, fs=22, subFs=15,
  fill=on and roleColor or C(240,250,252,244), ink=on and WHITE or INK,
  onPart=add, onClick=function() select(i) end }

-- ④ 详情/文案（组件，四行以内）
CTL.textPanel{ id='xxxPanel', x=..., y=..., w=u(380), h=u(430), accent=roleDeep,
  cardFill=over(C(252,250,244,255), roleColor, 0.20),
  title=名字, subtitle=元素·称号 ｜ 本局 Lv, lines={l1,l2,l3,l4}, footer=技能·冷却,
  fs=18, lineGap=36, onPart=add }

-- ⑤ 右上关闭（组件）
CTL.btn{ id='xxx.close', x=PR-u(110), y=PH/2-u(46), w=u(150), h=u(50), label='合上', preset='gold',
  onPart=add, onClick=function() toggle() end }
```

---

## 4. 交付前四步（缺一步就是"再返工一轮"）

1. **静态**：`luac5.3 -p` 全绿 + `main locals ≤ 190`（构建闸门已内置 `node qxqy/build.mjs`）。
2. **交互**：`ctl dump` 里能看到本页每个可点元素（`ctl xxx.row1 px=… py=…`）——**没有这一行就等于点不到**。
3. **文字**：全屏扫 `textLayout.fits=false`（`.scratch/lead/audit-text.mjs` 一类脚本），一个都不许有。
4. **看图**：把页面渲染成 PNG，**自己 read_image 看**，并按下面清单逐项过：
   - 有没有直角混进圆角体系？有没有元素"外挂"在胶囊外面（色条/徽章）？
   - 文字有没有压边、重叠、被裁、`…` 截断在奇怪的地方？
   - 相邻卡/行之间的留白一致吗？选中态一眼能看出来吗？
   - 对比度：浅底上有没有浅色字？（最深的一次事故：饱和色块 + 深墨字 = 2:1）

---

## 5. 反模式清单（本轮返工的亲历清单，逐条都花过一轮以上）

| 反模式 | 症状 | 正解 |
|---|---|---|
| 圆角按钮外挂一条竖条/徽章 | 「像什么话」 | 选中态用**实底变色**表达，不外加装饰 |
| 直角面板混在圆角体系里 | 「这个质量能交付吗」 | 一律用 `pill`/`rrect`，直线只留分隔线 |
| 饱和色块 + 深墨字 | 看不清、像糊了 | 淡彩卡片（奶油 + 主题色 20%）+ 深字 |
| 手写第二遍按钮 | 少注册/少热区/少三态 | 一律 `CTL.btn` |
| 只清一次就以为隐藏了 | 常驻提示又写回来 | 隐藏时**同时闸住写入者**（`setText`/`HUD_INST.txt`） |
| 用 `SetAsLastSibling` 调层序 | 无效 | 用"创建顺序"或"状态推导的建/拆" |
| 说"改好了"但没看图 | 用户连发三张截图 | 每次交付附一张自验图 + 读数 |
