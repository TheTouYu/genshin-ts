# 霜华纪 · UI 施工手册（协作者必读）

> 本文件是 `workspace/ganyu` 的界面施工约定。读完应该能回答：坐标怎么算、控件怎么造、层序怎么保证、验证怎么过。

## 0. 工程与命令

```bash
cd /home/h/genshin-ts/workspace/ganyu
node qxqy/build.mjs          # 拼 lua/src/*.lua → lua/main.lua → ganyu.save.json + GIA（约 6s）
node qxqy/shot.mjs           # 出图到 docs/preview/*.png（3 屏 ~3s）
node qxqy/runner.mjs         # 回归用例（tests/*.json）
python3 -c "from PIL import Image; Image.open('docs/preview/x.png').crop((a,b,c,d)).resize((W,H)).save('/tmp/x.png')"
```

- 只改你被分配的那个 `lua/src/*.lua`（文件名见任务），**不要动** 00/10/15/20/30/50、build.mjs、别人的文件。
- 需要新美术函数就写在自己文件里，用 `T.<你的前缀>...` 命名，避免撞名。
- 出图验收：`build` 必须 0 警告（`[frost][warn]` 一条都不许有），`shot` 退出码 0。

## 1. 坐标 / 层序 / 文字三铁律

- 设计坐标 **1280×720，中心原点，+y 向上**。所有 `x/y` 都是设计坐标，内部自动乘 `T.S`（画布自适应）。
- **层序 = 创建顺序**（后建在上）。每屏顺序：背景 → 装饰 → 面板 → 图形 → **文字** → 命中区 → 焦点框（`finishScreen` 自动建）。
- **服务端 textbox 永远在运行时实例之下**，所以文字必须在图形之后创建。
- 文本框高度**不足会整段不画**（`textLayout.visibleLineCount=0`）。`T.txt` 已自动抬到 `行数×1.2×字号+12`，但**不要传过大的字号配过小的宽度**；居中文字用 `align='Middle'`。
- 不要用半透明叠同色做「一个形状」（会出接缝/重影）——要圆角就走 `T.rrect`/`T.card`。

## 2. 主题令牌

每屏开头调用 `T.pageBg('day')` 或 `T.pageBg('night')`，它会设置 `T.th`：

| 令牌 | 用途 |
| --- | --- |
| `T.th.text` / `text2` / `text3` | 主文字 / 次文字 / 弱化文字 |
| `T.th.panel` / `panel2` / `panelHi` | 卡片底 / 次级底 / 悬停底 |
| `T.th.card` / `cardBorder` | 卡片底 / 卡片描边 |
| `T.th.border` / `borderSoft` / `line` | 描边 / 弱描边 / 分割线 |
| `T.th.accent` / `accent2` / `accentSoft` / `onAccent` | 主强调（冰蓝）/ 次强调（金）/ 浅底 / 压在强调上的字色 |
| `T.th.scrim` | 弹层遮罩 |

**禁止**直接用 `T.P.*` 当界面文字/底色（那是美术色板）；界面一律走 `T.th.*`。

## 3. 组件 API（15_ui.lua）

```lua
T.header(title, sub, { right='右上小字' })
T.backBtn(function() T.go('menu') end)              -- 生成 hit_back
T.footer({ {key='↑↓',label='选择'}, {key='空格',label='确认'} })  -- 或 T.footer('一句话提示')
T.button(x, y, w, h, label, onClick, { kind='primary'|'secondary'|'ghost'|'danger', name='hit_x', icon='gear' })
T.iconBtn(x, y, 36, 'gear', onClick, { name='hit_x' })
T.tabs(cx, y, totalW, {'敌人','装备'}, active, function(i) ... end, { namePrefix='hit_codex_tab_' })
T.chip(x, y, '标签', color, { fill=, text=, size=12 })        -- 返回宽度
T.badge(x, y, '普通', { fill=, text=, size=11 })
T.resChip(x, y, 'coin', '128,400', { w=116, color= })
T.bar(x, y, w, h, pct, color, bg)                              -- pct 0..1，返回填充组
T.segBar(x, y, w, h, filled, total, color)
T.sectionLabel(x, y, '标题', { right='右侧说明', w=320 })
T.divider(cx, cy, w)
T.avatar(x, y, r, ch, { level=60 })
T.slot(x, y, w, h, 'bow', '武器', { empty=false, plus=true })
T.star3(x, y, n, 16)
T.chevron(x, y, 16, T.th.text3)
T.icon(kind, x, y, size, color)
```

可用图标 kind：
`bow arrow snow crystal flower coin book star const mountain tower moon plume hourglass bloom
slime fly guard boss shield heart energy clock lock check plus sword map gear user gift wind eye
spark pause play home retry skull feather drop`

## 4. 图形组合（10_core.lua）

```lua
T.img(x, y, w, h, 'rect'|'circle'|'triangle'|'fourstar'|'fivestar'|'ring', color, rot)
T.txt(x, y, w, h, size, text, color, 'Left'|'Middle'|'Right', 'Middle')
T.txtAuto(x, y, w, size, text, color, align)
T.card(cx, cy, w, h, { radius=16, fill=, border=, hi=, shadow=true })   -- 返回「扁平控件列表」
T.rrect(cx, cy, w, h, r, color)        -- ⚠ 返回「控件组」不是单个控件
T.tint(group, color)                   -- 组改色
T.spread(dstList, group)               -- 组展平进列表
T.captureBase(baseList, group) / T.shiftBase(baseList, dx, dy)  -- 整组位移
T.hline(cx, cy, w, color) / T.vline(cx, cy, h, color)
T.glow(x, y, r, color, steps, alpha)   -- 柔光（多层圆）
T.snowflake(cx, cy, size, color, { core= })
T.flower(x, y, r, color, center)
T.snowfall(n, { color=, scale= })
```

**hover 改色一条龙**：把要改色的控件/组收集起来，`onFocus(on)` 里 `T.tint(group, on and hi or base)`。
**整组位移**：`T.captureBase(base, parts)` 后 `T.shiftBase(base, 0, 4)`，不要用 `T.pos[group]`（组是 table，取不到）。

## 5. 交互与日志

```lua
T.item({ x=, y=, w=, h=, name='hit_<screen>_<what>', focusPad=4,
  onConfirm=function() ... end,
  onFocus=function(on) ... end,
  onDown=function() ... end })
```

- 每个可点元素都要有 `name`，命名 `hit_<screen>_<what>`（同一屏唯一）。
- 屏幕键盘路由：
  ```lua
  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('menu') end
  end
  ```
- 交互要有日志锚点：`T.log('screen=growth items=' .. #T.items)` 由 `finishScreen` 自动打；自定义事件打 `T.log('growth upgrade talent=2')`、`T.log('opt sfx=false')`、`T.log('overlay=ascend')`（`openOverlay` 自动打）。
- 不可用按钮：`onConfirm` 里 `T.sfx(T.SFX.error); T.toast('材料不足 · 冰晶核', T.th.accent2)`，不要静默。
- 音效只用 `T.SFX.*`（hover/click/confirm/back/tab/error/reward/victory/fail）。

## 6. 弹层

```lua
T.openOverlay('ascend', function(base)
  local p = T.overlayPanel(620, 420, '突破', '霜华之蕊 ×1 · 冰晶核 ×3')
  local panel = p.panel; local w, h = p.w, p.h
  T.button(0, -h/2 + 60, 220, 52, '确认突破', function() T.closeOverlay(); ... end, { name='hit_ascend_ok' })
  T.closeButton(w/2 - 44, h/2 - 44, function() T.closeOverlay() end, 'hit_ascend_close')
end, { pausesGame = true, defaultFocus = 1, key = function(a)
  if a == 'back' then T.closeOverlay() end
end })
```

## 7. 数据（00_config.lua）

`T.chars[1..3]`（甘雨/申鹤/云堇，含 `hair/hair2/eye/cloth/cloth2/motif/quote/desc`）、`T.hero`（等级/属性/经验）、
`T.talents[3]`、`T.consts[6]`、`T.mats[5]`、`T.codex[14]`（group = enemy/gear/mat/world）、`T.stages[6]`、
`T.enemies`（slime/fly/guard/boss）、`T.records`（进度）、`T.opt`（设置）、`T.SFX`、`T.VERSION/T.BUILD_ID`。

## 8. 验收流程（缺一不可）

1. `node qxqy/build.mjs` → `[frost][warn]` 0 条；
2. 写自己的小 shot（复制 `qxqy/shot.mjs` 改名），从 boot/title 点到自己那屏，出图；
3. `read_image` **逐字核对**：标题/正文/数值/按钮文案有没有被裁、被盖、重叠、越界；焦点框是否套住选中项；
4. 至少覆盖：默认态、选中态（焦点在第一个/最后一个按钮）、一个弹层、一个「不可用」反馈；
5. 把出图路径与结论写进交付说明；**没出图的界面等于没做**。
