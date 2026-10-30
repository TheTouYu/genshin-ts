# 21 · 控件组件工厂：一个"合格按钮"就是六件套

> **用户 2026-10-30 的原话（这条规则的全部来源）**：
> 「添加一个样式好看的按钮，带有按键，可以点击，有动态样式，有音效反馈，这东西就是一个**最基本的要求**。
> 就应该做出**组件**一样的东西。之后 10s 一个，可以量产的，并且定制的。这就是我今天批评你的地方。
> 这个一个事情，你反反复复给你强调。」
>
> 对照事实：同一个"按钮"在这一个工程里被我**手写了四遍**（模式卡 / 入口卡 / 结算三键 / 手机拇指键），
> 每遍漏掉的东西还不一样，最惨的一次是**漏了命中注册**——卡面画得漂亮，鼠标和触屏完全够不到。
> 所以：**不要再手写第五遍。用工厂。**

---

## 1. 六件套（缺一即"没做完"，不是"差一点"）

| # | 零件 | 判据（能读出来） | 漏掉的症状 |
|---|---|---|---|
| ① | **形状** | 胶囊 = 中段矩形 + 左右两个半圆（引擎没有圆角矩形图元），三块同色同高 | 直角面板混在圆角体系里 = "这质量能交付吗" |
| ② | **文字** | 框高 ≥ `⌊fontSize×1.45+6⌋`；`fits=false` 时引擎**整条不画** | 按钮上是空的 / 只有一半字 |
| ③ | **键帽** | 小圆角块 + 按键字母（PC 玩家要知道按什么） | PC 玩家看着卡片不知道按哪个键 |
| ④ | **热区** | cursor 实例，**坐标 y 取负**（cursor 的 y 轴与图片相反） | 看得见点不到 / 点上面选中下面 |
| ⑤ | **命中注册** | `UI4.regAdd(名字, 热区, w, h)`，`ctl dump` 里能看到 `ctl <名字> px=.. py=..` | **画得漂亮但完全点不动**（本工程真实事故） |
| ⑥ | **三态 + 音效** | Enter/Exit/Down/Up/Click 五个回调；hover 抬起 4px+升温，press 下沉 2px+压深；进入播 hover 音、按下播 press 音 | "鼠标经过没有音效和高亮" |

一条可复制的判据：**`ctl dump` 里没有这一行 = 这个按钮不存在**（不管你画了多好看）。

---

## 2. 工厂 API（`lua/tetris/controls.lua`，本项目已落地）

```lua
-- ① 接一次模块（main 里全局 CTL，不新增 local —— main chunk 有 200 local 硬限）
CTL = loadModule('controls').new({
  trySet = trySet, tryCall = tryCall, addCursor = addCursor, sfx = sfx, SFX = SFX,
  addShape = function(n, sp) return MS.addShape(n, sp) end,          -- 图元（矩形/圆）
  addText  = function(n, t, x, y, w, h, fs, col) return MS.addText(...) end,
  addHit   = function(n, w, h) ... end,                              -- cursor 模板实例
  regAdd   = function(n, c, w, h) UI4.regAdd(n, c, w, h) end,        -- ⑤ 强制注册
  onPart   = function(c) MS.parts[#MS.parts + 1] = c end,            -- 生命周期登记
  wall = MS.WALL, gold = THEME.gold, goldDeep = THEME.goldDeep,
  cyan = MS.CYAN, ink = THEME.textMain, subInk = THEME.textSub,
  over = function(base, c, k) return MS.over(base, c, k) end,
})

-- ② 造一个按钮 = 一次调用（这就是"10 秒一个"）
local btn = CTL.btn{
  id = 'menu.entryRoster', screen = 'menu',
  x = 520, y = 302, w = 290, h = 96,
  label = '角色档案', sub = 'I 键 · 点我看契约与技能', key = 'I',
  preset = 'gold', fs = 22, dx = 46,           -- dx = 内容整体偏移（左边放色点/图标时用）
  onClick = function() FN.rosterToggle() end,
}
btn.style('hover')   -- 需要时手动置态（键盘聚焦等）
```

内置色板三套：`preset = 'gold' | 'cyan' | 'plain'`；要定制就传 `fill/hoverColor/pressColor/ink/subFs/lift`。
**装饰件不进组件**（四色点这类插画由调用方自己叠，组件只管"能按的那块"）。

---

## 3. 四个必踩的坑（全部实测过，每条都让按钮"看起来对、其实坏"）

1. **漏 `UI4.regAdd` = 按钮不存在**。命中派发走 UI4 注册表，不是控件本身。
   判据：`ctl dump screen=menu n=7` 里有没有 `ctl menu.entryRoster px=1320 py=148 w=290 h=96`。
2. **cursor 热区 y 轴与图片相反**。摆位写 `SetAnchoredPosition(x, -y)`；写错的表现是"点第 3 行中第 1 行"。
3. **不能给控件挂自定义字段**。控件是带严格 metatable 的 userdata：`c.__bx = 1` 会抛
   `cannot set __bx, no such field`，而它在 `pcall` 里 → **整个 build 函数被静默中断**，
   后面的零件（包括热区）全都不建。基准坐标一律记 side table。
4. **状态串和色板键不一致**：状态是 `'normal'/'hover'/'down'`，色板键是 `normal/hover/press`。
   `fill[st]` 取不到 `press` 会静默回落成正常色 ⇒ 按下只有位移没有变色（实测读数：
   hover `#f3edde`、press 也 `#f3edde`，修后 press `#f1e8d3`）。**映射写显式**。

---

## 4. 验收四读数（10 秒一轮，不用真机）

```js
// ① 注册表里有没有它（有 = 指针够得到）
node -e "...playStart(); console.log(logs.filter(t=>/ctl menu\./.test(t)))"
// 输出应有：ctl menu.entryRoster px=1320 py=148 w=290 h=96

// ② 三态颜色/位移（数值，不是肉眼）
normal #f5f6f1 y=148   →   hover #f3edde y=144（抬起 4）  →   down #f1e8d3 y=150（下沉 2）

// ③ 点击真的进了下一页
点完日志出现 `screen=roster ui layout w=1600 h=900`

// ④ 音效（模拟器侧看 audio 通道计数）
hover/press 各一次，`audio: 50883×1 50872×1`
```

四条全绿才算"这个按钮做完了"；只有 ①③ 绿 = 能点但没反馈；只有 ② 绿 = 好看但点不动（本工程踩过）。

---

## 5. 新增同类控件的标准动作（照着做，别即兴）

1. **先查有没有现成 preset**（gold / cyan / plain）。没有就加一个 preset，不要就地写死颜色。
2. **`CTL.btn{...}` 一行搞定**，只填 spec 的七八个字段：`id/screen/x/y/w/h/label/key/preset/onClick`。
3. **装饰物**（色点、图标、进度条）单独 `addShape/addCell`，位置相对按钮中心。
4. **跑第 4 节的四读数**，把读数贴进提交说明。
5. **同步更新** `17-symptoms.md`：如果又踩了新坑，把它写成"症状 → 根因 → 判据"三行。

---

## 6. 什么时候**不**用这个工厂

- **手机拇指键**：它是"按住连发、位置由布局算"的另一类控件（`04/03-input` 管），
  尺寸/按下语义不同，走 `ui.lua` 的 `U.btn` 体系；但它**同样必须**走 `U.regAdd` 注册。
- **纯装饰胶囊**（背景面板、横幅底）：只需要 `pill`，不需要热区与三态，别硬套 `btn`。
