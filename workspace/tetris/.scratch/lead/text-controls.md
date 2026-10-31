# 文字控件台账（HUD / 横幅 / 技能列）—— 路线 A 前置

> 读者=接双屏与常驻 HUD 的代理。**没有这张表就别改**：这类缺陷的根因一半是"两个地方写同一个控件"。
> 生成方式：`setText(<控件>, …)` / `trySet(<控件>, 'text', …)` 全量归因（`lua/main.lua`），
> 加上 `HUD_INST.*` 的双写路径与三张 hide/show 名单。时间基准：main.lua 5837 行。

## 一、两套载体（这是全部复杂性的来源）

| 载体 | 是谁 | 层序 | 谁读它 |
|---|---|---|---|
| **服务端 textbox**（`hud/best/hint/hudNext/topBanner/botBanner/keyA-C/sk1name/sk1state/sk2name/sk2state`） | 关卡 UI 里声明的文本框，`findIn(root,{name})` 取到 | **永远压在运行时实例之上**（帧级实测 `sk1name` z=42 vs 结算卡 z=51） | `tests/*.json` 的 `control` 断言（读 `text` 字段——**`SetVisible(false)` 不影响 `text`**） |
| **运行时实例**（`HUD_INST[nm]`，引擎名 `i<nm>`） | `HUD_INST.build()` 用 `TPL_TEXT` 实例化 | 与其它实例同级，层号说话 | 玩家眼睛 |

**双写契约**：`setText(ctl, v)`（main.lua:350）先写 textbox（`setTextRaw`），再写实例（`HUD_INST[ctl.name]`）。
⇒ **只要实例存在，textbox 就可以一直隐藏**：断言读 `text`（照样有新值），玩家看实例（可被覆盖屏盖住）。
这才是路线 A 的支点：不是"换控件"，是"**补实例 + 隐藏 textbox**"。

## 二、逐控件台账

| 控件 | 写入者（行） | 实例镜像 | textbox 状态 | 隐藏/恢复 |
|---|---|---|---|---|
| `hud` | `renderHud` 1089（`HUD_INST.txt`） | ✅ `ihud` | 隐藏（build 末尾 + layoutDual 2588） | `hideStats` 1422 / `showStats` 3661 |
| `best` | `renderHud` 1092 | ✅ `ibest` | 隐藏 | `hideStats`/`showStats` |
| `hudNext` | `renderHud` 1091 | ✅ `ihudNext` | 隐藏 | `hideStats`/`showStats` |
| `keyA/keyB/keyC` | `renderHud` 1074-1076（双屏对家盘）、1310/1315（键位表）、5058-5059（准备态）、5418 | ✅ `ikeyA-C` | 隐藏 | `hideStats`/`showStats` |
| `hint` | **21 处**：`CORE.onClearEvent` 536、`showGameOver` 1426/1442、`layout` 4977、`restartMatch` 3664、`FN.skillHud` 3268（`hasCtrl` 兜底）、1300-1370 若干 | ✅ `ihint` | 隐藏 | `hideStats`/`showStats` |
| `topBanner` | **19 处**：`menuSelectMode` 2041、`FN.skillText` 2942、`showGameOver` 1426/1436、`layout` 4978、`restartMatch` 3686 等 | ✅ `itopBanner` | 隐藏 | **不进 `hideStats`**（结算兜底文案要用，注释 2179） |
| `botBanner` | **34 处**（最多）：`CORE.onClearEvent` 514-600、`CORE.dispatch` 600、`showGameOver` 1417/1440、`layout` 4978/5000/5013 | ✅ `ibotBanner` | 隐藏 | 同上（不藏） |
| `holdLab` | 由 hold 区逻辑写 | ✅ `iholdLab`（build 会建） | **未隐藏** ⚠ 双份叠字风险 | ❌ 不在任何 hide 列表 |
| **`sk1name`** | `FN.skillHud` 3211（`setText(cName, nm)`，`cName = findIn(root,{'sk1name'})`） | ❌ **没有镜像** | **可见** ⚠ | 只在 `syncStage` 用 `textForce` **清空**（1961），不清则会透出 |
| **`sk1state`** | `FN.skillHud` 3243 | ❌ | **可见** ⚠ | 同上 |
| **`sk2name`** | `FN.skillHud` 3211（i==2） | ❌ | **可见** ⚠ | 同上 |
| **`sk2state`** | `FN.skillHud` 3243（i==2） | ❌ | **可见** ⚠ | 同上 |

## 三、结论（这就是缺陷结构）

1. **HUD/横幅已走实例双轨**（v2.8 ⑤ 起），textbox 隐藏、断言读 `text` ⇒ 这条线**已经解决了层序**。
2. **技能列（`sk1name/sk1state/sk2name/sk2state`）是唯一没有实例镜像、且可见的文字** ⇒ 覆盖屏（结算/档案/说明）打开时，
   它仍带着"纳西妲"这类角色名压在面板之上 —— **就是 lead 复现的那条透出**。
   现有兜底是 `FN.syncStage` 每帧清空（`textForce`），但那是"不写内容"而不是"不显示"，且依赖每帧判定。
3. **`holdLab` 建了镜像却没隐藏** ⇒ 潜在双份叠字（本次一并收口）。

## 四、本轮的修法（与路线 A 一致，且最小）

- 给 4 个技能列控件**补实例镜像**（尺寸/位置/字号从 textbox 现读现拷，避免硬编码），建完即隐藏 textbox；
- `setText` 的双写已经把内容同步过去了（`HUD_INST[ctl.name]` 查表），只需补 `fontColor` 的镜像；
- `hideAll/hideStats/showStats` 三张名单补 `sk*` 与 `holdLab`，让覆盖屏只靠**层号**就能盖住，不再依赖"清空"；
- `FN.syncStage` 的 `textForce` 清空逻辑**保留**（降级路径：模板缺失/实例建不出来时仍要清）。
