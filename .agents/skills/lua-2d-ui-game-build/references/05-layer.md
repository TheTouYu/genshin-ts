# 05 层序与双写（"接线了但画面没有"的根源）

> **这一章解决本技能最高频、最贵的失败**：代码改对了、控件属性对了、探针读数对了，**但玩家看不见**。
> 用户为此打回 ≥4 次，原话包括「全部的积分没有了」「底栏操作指南是没有的」「和没修一样」。
>
> **核心铁律（一句话）**：
> **运行时实例永远在服务端控件（textbox/image）之上；所以"要被看见的文字"必须用实例，"要被断言的文字"用 textbox，两者用一处收口同步。**
>
> 出处：`18-evidence.md` C1/C2/C3/C7；代码：`lua/main.lua:286-296`、`3263-3327`、`583-612`。

## 1. 层序规则（两个宿主同规则）

| 规则 | 事实 | 后果 |
|---|---|---|
| **实例「后建在上」** | 运行时创建的实例按创建顺序叠放，没有 z-index 概念 | 先建文字后建面板 ⇒ 面板压文字（灰雾） |
| **实例层 > 服务端控件层** | 服务端 textbox/image（编辑器里摆的那些）永远在运行时实例之下 | 200 格棋盘/全屏背景 wash 实例一盖，textbox 文字就没了 |
| **同一父级内才有可比性** | 跨父级的层级不可预测 | 整屏浮层要**同一父级 + 显式置顶** |

**判断口诀**：
- 元素会不会被"后来出现的东西"盖住？→ 它必须和盖它的东西**同父级**，并且**后建**。
- 文字要不要被玩家看见？→ 用**实例份**。
- 断言要不要读文字？→ 读 **textbox 份的 `text` 字段**（`visible=false` 也能读）。

## 2. HUD 双写（本技能最该抄的一段）

**问题**：v2.7 加了全屏背景 wash（实例）→ 盖住所有 HUD 文字（服务端 textbox）→ 用户报"全部的积分没有了"。

**正确结构**（三层职责分离）：

```lua
-- ① 单点收口：写 textbox 的同时写同名实例份
--    lua/main.lua:292-300
local function setText(ctl, value)
  setTextRaw(ctl, value)
  local inst = ctl and ctl.name and HUD_INST[ctl.name]
  if inst and inst ~= ctl then pcall(function() inst.text = value end) end
end
```

```lua
-- ② 建实例份：名单必须覆盖所有"常驻可见"的文字位
--    lua/main.lua:3263-3305（节选）
for _, nm in ipairs({ 'hud', 'best', 'keyA', 'keyB', 'keyC',
                      'botBanner', 'topBanner', 'hint', 'hudNext' }) do
  local ok, c = pcall(function() return game.InstantiateClientUIControl(TPL_TEXT, root) end)
  if ok and c then
    c.name = 'i' .. nm
    local isBanner = (nm == 'botBanner' or nm == 'topBanner')
    local w  = isBanner and (CANVAS_W or 1280) - 120 or 640
    local fs = isBanner and 22 or 20
    trySet(c, 'fontSize', fs)
    trySet(c, 'fontColor', THEME.textMain)
    local hh = math.floor(fs * 1.45 + 8)     -- 框高判据（见 04-text）
    c:SetSizeDelta(w, hh)
    trySet(c, 'verticalAlignment', 'Middle') -- 模板缺省 Top 会裁字顶
    HUD_INST[nm] = c
    made = made + 1
  end
end
```

```lua
-- ③ 隐藏 textbox 份（防双份叠字）+ 打印计数锚点
--    lua/main.lua:3320-3327
for _, nm in ipairs({ 'hud', 'best', 'keyA', 'keyB', 'keyC',
                      'botBanner', 'topBanner', 'hint', 'hudNext' }) do
  local box = ... -- 对应的服务端控件
  if box then tryCall(box, 'SetVisible', false) end
end
print('hud inst n=' .. made .. ' (textbox hidden)')
```

**判据（缺一不可）**：
1. 启动日志出现 `hud inst n=<名单长度> (textbox hidden)` —— **n 必须等于名单长度**（少一个 = 某个实例化失败被静默跳过）。
2. 出图里同一个信息只出现一次（没有双份小字）。
3. 任何 `setText` 调用点都不直接写 textbox（除非那个位不需要被看见）。

**为什么必须单点收口**（血泪）：
> v3.3 把 textbox 份 `SetVisible(false)` 之后，全仓 **40+ 处** `setText(botBanner/hint/topBanner, …)` 变成"写了但看不见"——
> 出图实测：常驻键位提示、开场句、纳西妲接管文案**全都没有墨迹**。
> 调用点分散在演出/结算/接管各段，逐处改必然漏。所以收口在 `setText`。

**容易漏的位**（真实漏过）：`botBanner`（底栏操作说明）、`topBanner`（顶部横幅/接管提示）、`hint`（准备提示）、`hudNext`（"下一个"标签）。
**规则**：**凡常驻文字一律实例份**——判断标准是"它是不是会一直/经常出现在画面上"。

## 3. 整屏浮层（结算 / 帮助 / 说明页）

**必须整套实例化的理由**（`lua/main.lua:386` 注释原话）：
> 「布局里的服务端 textbox 层级低于运行时实例（200 个棋盘格永远在上面），文字只要落在棋盘区域就会被吃掉。」

**结算层的正确构建顺序**（`lua/main.lua:583-612`）：
```lua
-- 顺序：① 全屏遮罩 → ② 面板外沿 → ③ 面板底 → ④ 六行文字
g.settleScrim  = instInto(TPL_GUIDS.cell, root, nil)   -- 盖住棋盘与左右栏
g.settleBorder = instInto(TPL_GUIDS.cell, root, nil)   -- 4px 描边感
g.settleCard   = instInto(TPL_GUIDS.cell, root, nil)   -- 面板底
for i = 1, 6 do                                        -- 文字在最上层
  local ok, c = pcall(function() return game.InstantiateClientUIControl(textGuid, root) end)
  if ok and c then c.name = 'settleText' .. i end
end
print('settle reorder scrim=y border=y card=y texts=6')
```
得到的层级：`棋盘/左右栏 < 遮罩 < 边框 < 面板 < 文字`。

**整页浮层（帮助/说明）额外加保险**：
```lua
-- lua/main.lua:2459-2464
for i = 1, #HL do
  if HL[i] then tryCall(HL[i], 'SetAsLastSibling') end   -- 显式置顶
end
```
创建序 + 显式置顶双保险：防"后来又有实例被创建"的回归。

**判据**：
- 日志 `settle reorder scrim=y border=y card=y texts=6`，三个 `y` 任一为 `n` → 视觉一定错。
- 出图：棋盘被压暗但仍可见（遮罩有效）、文字在面板之上（不是灰雾）。
- **进出结算两次**，成员数不变（销毁漏成员会导致第二次出现两个面板）。

## 4. 成员表用「固定槽 + 数字 for」

```lua
-- lua/main.lua:249-255 的注释（原文）
-- 结算层成员表：**固定 9 槽 + 数字 for 遍历**，绝不能用 ipairs({...})——
-- 里面只要有一个 nil（比如没造 border），ipairs 就在那里停住，后面的成员会被静默跳过（销毁会漏）。
local function settleMembers()
  return { g.settleScrim, g.settleCard, g.settleBorder, g.settleTitle,
           g.settleScore, g.settleBest, g.settleInfo, g.settleExtra, g.settleOpts }
end
-- 遍历用 for i = 1, 9
```

**同一个坑的另一个形态**（真机白屏）：模板候选表 `TPL_GUIDS.cell = { '  __GUID_CELL__', 1073741849, … }`，用原文（未注入）时第一个元素是 `nil` → `ipairs` 在第一项停 → 候选表空 → 探测失败 → `error()` 无声死。详见 `12-deploy.md §3`。

**通用规则**：Lua 里凡是"可能有 nil 的表"，用**数字 for + 长度常量**，不要用 `ipairs`。

## 4b. 两个"看起来能用其实不能用"的 API 怪癖

### `SetVisible(false)` 对运行时实例**真机不生效**（D581）
真机上隐藏一个运行时实例**不能靠 `SetVisible`** → 用**挪出画布**兜底（`SetAnchoredPosition` 到画布外）。
> 这也是为什么"浮层不要用常驻+隐藏"（`07-overlays.md` §1）——懒创建 + 销毁才是可靠路径。

### 客户端模板导入后会**重编号**
- 同一个模板在 authoring 里是 `1073742105`，导入真机后变成 `1073741849`（实测）。
- 所以模板 GUID 要写成**候选表**逐个试：`TEMPLATE_GUIDS = { 真机值, authoring值 }`，探测成功才继续。
- 服务端 textbox 按 **name** 寻址最稳（不受重编号影响）。

## 5. `pcall` 与静默失败

真机字段写入可能抛错（`SetVisible` 严格计参、对齐只收枚举），所以每个字段写都包 `pcall`：
```lua
-- lua/tetris/widgets.lua 的 trySet/tryCall 思路
local ok, err = pcall(function() ctl[field] = v end)
if not ok then print('ui fail: ' .. name .. '.' .. field .. ' ' .. tostring(err)) end
```

**关键**：**吞掉错误必须留痕**。
> 真实案例：真机三条 `ui fail` 被 `pcall` 静默吞掉 → 所有对齐设置真机全 fail → 文字默认 Top/Left 乱位/裁切 → 用户看到"一个很大的问号"。
> 如果当时有 `print('ui fail …')`，这个 bug 在第一分钟就能定位。

**判据**：出图/真机日志里搜 `ui fail`，有就必须解释清楚。

## 6. 层序问题的排查动作（三步）

怀疑"看不见"是层序问题：
1. **临时把可疑元素移到最上层**（或换显眼颜色/字号）→ 重出图。
   - 看得见了 → 确认是层序。
   - 仍看不见 → 是"没创建/被隐藏/坐标出界"。
2. 查它的**父级**和创建顺序。
3. 查同一层的**全部兄弟**（层序问题往往成片出现——只修一个位，用户会立刻报剩下的）。

**真实教训**：HUD 双写第一版只覆盖 5 个键（`hud/best/keyA-C`），漏了 `botBanner/topBanner` → 用户报"底栏没有/H 帮助没有/接管提示没看到"。
**规则**：修层序类问题必须扫"**同一层的所有位**"，不是只修报出来的那一个。
