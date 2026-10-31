# v5.0 布局规格（ui-mobile 写域）

> 作者：ui-mobile · 2026-10-29 · 状态：**已实现并出图核验（部分判据未过，见末尾「未闭合」）**
> 唯一实现：`lua/tetris/ui.lua`（模块，未挂载、只被 require）。数据段：`lua/tetris/config.lua` 的
> `NUM.BG_BASE_*` / `NUM.UI_KIT` / `NUM.UI_COL` / `NUM.PHONE` / `NUM.PAD_NOTE`。
> main.lua 只在 `-- @region ui-menu` / `ui-bg-theme` / `ui-mobile` / `ui-roster` 里做薄封装。

## 1. 一条路径：plan → apply

```
屏幕状态（guideStage / helpOpen / ROSTER.on / settleReady / dual / page）
  └─ FN.U.sync(dt)           每帧比对签名（换屏/换模式/换画布才重排）
       └─ FN.U.enter(screen) ┬─ plan(screen)   纯数据：text/inst/slots/nav/acts/skill + rightCX
                             ├─ applyText()     服务端 textbox 份 + HUD 实例份 + 技能卡片
                             ├─ applyButtons()  11 键（pad 9 + nav 2）+ 结算 3 键
                             └─ bgApply(mode)   wash 整屏底 + cover 构图
```

- **PC 与移动同一份数据**：`planPC/planPCDual` 逐字保留 v4.0 `layout()`/`layoutDual()` 的数值
  （PC 观感不变，用例 15/16 的预览列心 `RIGHT_CX` 也沿用 PC 公式）；`planMobile` 另给一套。
- **藏 = 坐标**：真机 `SetVisible` 对运行时实例不可靠，所有"不显示"一律 `SetAnchoredPosition(0,-4000)`
  + `SetSizeDelta(8,8)`。审计按"y<-3000 视为停用"处理。
- **热区**：按钮 = 描边胶囊 + 底胶囊 + 文字 + cursor 热区（后建 ⇒ 命中优先），三态由
  `U.paint(kind)` 统一（normal/hover/press，按下下沉 4px）。

## 2. 背景满幅（用户第 1 条）

- `bs = max(W/1280, H/720)`（cover）。构图坐标与尺寸同乘 `bs`。
- 两层保证：① wash = `W+20 × H+20` 不透明底 ② 构图 cover。
- 判据：**四边 0 缺口**（旧实现是 92%）：`extL ≤ -W/2 ∧ extR ≥ W/2 ∧ extB ≤ -H/2 ∧ extT ≥ H/2`。
  外接盒按**旋转矩形 AABB** 算（`ex = w/2·|cos| + h/2·|sin|`），不再用外接圆（1760×44 的云带
  会被高估成 ±880，判据永远失真）。
- 打印锚：`bg cover ok bs=… w=… h=… screen=… comps=14/14 wash=1 ext=…` / `bg cover GAP … dxL/dxR/dyB/dyT`。
- **五屏同一条路径**：屏幕切换由 `U.sync` 判定 → `U.enter` → `U.bgApply`。标题页此前从不调用
  `applyModeTheme`（真机日志 0 条），现在每屏都有锚。

实测读数（5 画布 × 6 屏，均为 `bg cover ok`）：

| 画布 | bs | ext（x,y） | 需要（W/2,H/2） |
|---|---|---|---|
| pc-16-9 1600×900 | 1.25 | −1101…1100 / −470…503 | 800 / 450 |
| pc-21-9 2100×900 | 1.64 | −1444…1443 / −617…660 | 1050 / 450 |
| mobile-16-9 1280×720 | 1.00 | −880…880 / −376…403 | 640 / 360 |
| mobile-19.5-9 1560×720 | 1.22 | −1073…1072 / −458…491 | 780 / 360 |
| mobile-4-3 1280×960 | 1.33 | −1173…1173 / −501…537 | 640 / 480 |

## 3. 五屏逐屏布局（用户第 2/5 条）

移动端把画布切成四区，**每屏只出本屏要用的键**：

| 屏 | 出哪些键 | 其它 |
|---|---|---|
| 标题 | nav 说明/名册（右上/左上角） | 4 张模式卡；局内 HUD/技能卡全部停用 |
| 游戏（单盘） | pad 9（左下 ◀▶ + 旋转 / 右下 锁定·缓降·暂存 / 底中 技能1·技能2·换人）+ nav 2（顶部两角） | 左列 HUD + 技能卡 2 张；右列 下一个 + 预览 |
| 游戏（双盘） | 同上（侧栏竖排，中缝列放技能行） | 棋盘 ±280；keyA-C 停用（侧栏 200px 装不下长句） |
| 帮助 | nav 合上/回标题/翻页（底部） | 帮助页本身由 main 的 buildHelpLayer 建（见未闭合） |
| 结算 | 3 颗行动键（再来一局/回主页/明细） | 不出游戏键 |
| 名册 | nav 合上（底部居中） | 不出游戏键 |

- 命中区：侧键 120×72、技能键 100×58、导航 116×56、结算 208×64（下限 96×56 @1280）。
- 字号：按钮 22（下限 20）；密集战况 18/16。框高一律 ≥ `1.45×fs+4`（18→32、20→36、16→30）。
- 机检：`ui audit screen=… btns=… bad=…`（越界 / 两键相交 / 压棋盘 / 压可见 HUD 文字框）。

## 4. 移动端核心玩法（用户第 4 条）

- 门禁 `menuSelectMode`：`if i >= 3 and IS_MOBILE`（旧 `i > 1` 把 2 号「AI 对抗」也算成双人）。
- 引导文案 `NUM.PAD_NOTE` 重写：只提「双人对战 / 双人合作」，明确「休闲与 AI 对抗手机上直接开打」。
- 引导可关（知道了 / 点卡外任意处）、可回标题（`home` act → `FN.exitToMenu`）。

## 5. 技能 HUD 契约（lead 写值）

- 控件名：`sk1name / sk1state / sk1bar / sk2name / sk2state / sk2bar` + 本模块附加
  `skRole / sk1card / sk1strip / sk2card / sk2strip / sk1barBg / sk2barBg`。
- `skXbar` = image 控件，充能由 lead 写 `fillAmount`（本条**未在模拟器验证** fillAmount 生效与否）。
- 卡 300×76：左 6px 主题色竖条 + 第一行「角色名 + ▲台前」(fs18/h32) + 第二行「状态」(fs16/h30) +
  底部 220×14 能量条；两卡竖排 y=−58/−142。
- **空槽整格停用**（`SK.party < 2` 时 sk2* 全套挪出画布）——修复「单人时第二条深蓝满条」。

## 6. 未闭合（明确没做到的）

1. **触屏热区在本模拟器里点不动**：自建 cursor 实例（无论 `instInto` 还是直连
   `InstantiateClientUIControl(TPL_HIT, root)`）收不到 CursorDown/Enter；而标题页 `menuZone`、
   `padNote*` 这类**运行时**建的同类热区正常。已排除：位置/尺寸/visible/active/raycastTarget/父节点
   监听注册（都是正确值，`cursor listen fail` 0 条）。**未定位**。键盘等价通道（H / 1-4 / Key16）全通。
2. **帮助页排版**：`buildHelpLayer`（main.lua 约 2359–2700）不在我的 `ui-*` 区段内 ⇒ 未改。
   lead 机检的 PC/手机叠字属该函数。要修需给我 `ui-help` 区段。
3. **帮助页第 2 页（角色与技能）**：未实现（同上，且需要 `COPY.ROLES` 数据）。
4. **手柄可见证据**：未做（未注入 Controller 键出图）。
5. lead 的 `qxqy/audit-ui.mjs` 读数：`fail 56 / warn 655`，主要是 **contrast**（浅底上 textSub/hint
   的配色对比 <1.88）与装饰出血 warn，不是本轮布局坐标引入；配色在 `config.lua` 的 THEME（美术口径）。
