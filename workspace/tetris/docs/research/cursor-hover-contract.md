# 光标事件契约与「菜单项 hover / pressed」可行方案

> 状态：待验证
> 最近校验：2026-10-28
> 范围说明：模拟器侧结论**已用实验闭合**（§3 复现步骤可重跑）；真机侧关键环节（Enter/Exit 是否派发、cursor 模板能否实例化）**未验证**，见 ④。

适用对象：`workspace/tetris` 的标题页四模式菜单（运行时 `game.InstantiateClientUIControl` 造的 image 卡 + textbox 文字），目标态 = 常态 / 悬浮 / 按下 三视觉态。

---

## ① 结论摘要（可执行）

1. 光标事件只有 **8 种**：CursorDown / CursorUp / CursorEnter / CursorExit / CursorDrag / CursorBeginDrag / CursorEndDrag / CursorClick（官方 API 文档 3161–3260）。
2. **只有两类控件**有 `AddCursorEventListener`：**预设按钮 ClientUIPresetButtonControl** 与 **光标检测区域 ClientUICursorEventAreaControl**；image / textbox **没有**（文档全文只有这两处方法表；基类只有按键/导航监听）。
3. 运行期实例**能挂**，前提是模板根 kind 是 `cursor`（或 `button`）：本文实验里实例化的 cursor 拿到 8 个监听并实收 Enter/Down/Up/Click/Exit。**只能实例化模板根节点**，模板子节点与主屏控件都不支持动态创建（官方教程 293–295）。
4. 命中：`acceptsPlayPointer` 对 image/textbox/container 要求 `raycastTarget === true`（默认 false ⇒ 穿透），且**只有 container/grid/textwindow/reference/button 会把指针下钻给子级**。所以「图片挡不住同级热区、但会挡住自己的子级热区」——HR-22 的准确含义是“image 不是布局宿主”。
5. 叠一层透明 cursor 热区**在模拟器里成立**（已实测，含创建顺序无关）；必须满足两个门控：①祖先链上存在 `container.showCursor === true`（否则监听静默不触发）；②热区是**独立模板根**，不是图片的子节点。
6. 官方推荐的三态替代是**预设按钮的四态子节点**（不可用/悬浮/按下/选中，编辑器配置，引擎自动切显隐，不用写监听）；Lua 侧无 `SetPressed`，只有 `SimulateCursorClick()`。
7. 模拟器自测必须用 **pointer move/down/up 带坐标**（画布像素、原点左下、+y 向上）；`click`（按名字点击）**绕过命中与 pressed 状态**，测不出 hover/pressed。
8. 可断言的引擎读数：`control` 断言的 `pressed` / `visible` / `text`（实验实测 down 期间 `pressed=true`，up 后 false）。

---

## ② 逐条答案

### Q1 光标事件有哪几种？

**官方枚举全 8 值**（`/home/h/genshin-ts/research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md`）：

| 枚举值 | 中文含义 | 文档行 |
| --- | --- | --- |
| `CursorDown` | 光标按下 | 3165 / 3169 |
| `CursorUp` | 光标抬起 | 3178 / 3182 |
| `CursorEnter` | 光标进入检测区域 | 3191 / 3195 |
| `CursorExit` | 光标离开检测区域 | 3204 / 3208 |
| `CursorDrag` | 光标拖拽 | 3217 / 3221 |
| `CursorBeginDrag` | 开始拖拽 | 3230 / 3234 |
| `CursorEndDrag` | 结束拖拽 | 3243 / 3247 |
| `CursorClick` | 完成点击 | 3256 / 3260 |

**模拟器派发时机**（`/home/h/miliastra-beyond-simulator/studio/play/session.js:902-1040`，`injectPlayPointer`）：

- `move`：命中变化时对旧 hit 发 `CursorExit`、对新 hit 发 `CursorEnter`（**Enter/Exit 只在 move 上产生**）；按下期间位移 >5px 发 `CursorBeginDrag`，之后每次 move 发 `CursorDrag`（:951-976）。
- `down`：`setPressed(hit,true)` + `CursorDown`（:1005-1010）。
- `up`：对 **down 时那个控件**发 `CursorUp`；只有 `hit === down` 且不在滚动条上才发 `CursorClick`，随后 `setPressed(false)`（:1013-1028）。
- `cancel`：`CursorUp` +（若拖拽中）`CursorEndDrag`（:889-902）。
- `wheel`：只滚视窗，**不产生光标事件**（:918-928）。

**CursorEventData 面**：字段只有 `dragging`（只读）与 `touchId`（只读），坐标走方法 `GetUIPos()` / `GetPressUIPos()` / `GetUIPosDelta()`；`GetUIPos` 明确「以画布左下角为原点」（文档 6364–6460，尤其 6437）。模拟器同构：`client/lua-runtime/src/runtime.js:233-262`。
**真机注意**（我方实测记录，非文档）：真机 Lua 侧 `d.x/d.y` 读回 nil，必须用三个 `Get*` 方法；真机「拖拽结束后仍会补发 CursorClick」，模拟器不发（历史记录 D229 / D296，PR #11 回信）。

### Q2 哪些控件能挂光标事件？实例化出来的能挂吗？

**官方文档面**（同前文件）：

- 11 类客户端控件全部继承 `ClientUIBaseControl`（4299–4350）；基类提供的是 `AddKeyEventListener` 系列（5095 起）与 `AddNavigationEventListener` 系列，**没有** `AddCursorEventListener`。
- 全文档 `AddCursorEventListener` 只出现两处：
  - **17. ClientUIPresetButtonControl**（6102 起，原文「预设按钮控件，提供按钮交互与光标事件监听」），方法表 6188 起；字段仅 `interactable` / `clickAudioId` / `raycastTarget`（6159 = 可被光标射线检测）。
  - **18. ClientUICursorEventAreaControl**（6250 起，原文「光标检测区域控件，检测该控件区域内的光标事件」），方法表 6302 起；字段仅 `raycastTarget`。
  - 两类都有 `RemoveCursorEventListener` / `RemoveCursorEventListeners` / `RemoveAllCursorEventListeners` / `SimulateCursorClick()`（6240 / 6354：「按顺序模拟 CursorDown、CursorUp 与 CursorClick」）。
- **image / textbox 无此方法**：图片控件字段表（5246 起）含 `imageSource`/`imageId`/`imageColor`/`mask`/`fill` 等，**没有** `raycastTarget`，也没有任何光标方法。

**模拟器面**：`client/lua-runtime/src/scene.js:60-70` 的 `CURSOR_METHODS` 只挂到 `button` 与 `cursor` 两种 kind；`:100-112` 的 `luaFieldAccess` 白名单里 `image` 无 `raycastTarget`，`cursor`/`button` 有。与文档一致。

**运行期实例能不能挂**：

- **能，条件是模板根的 kind 是 cursor/button**。本文实验（§5）用 `addTemplate(kind:'cursor')` 建模板 → `game.InstantiateClientUIControl(guid, root)` → `AddCursorEventListener` 注册 8 个事件 → 实际收到 `Enter / Down / Up / Click / Exit`。实例 `typeofName = ClientUICursorEventAreaControl`、`raycastTarget=true`、`pressed` 随 down/up 变 true/false。
- **官方对“哪些能动态创建”有硬约束**（`官方教程-客户端控件和客户端脚本.md:293-295`）：
  - 「仅存为模板的客户端控件的父节点，支持通过接口 ClientUIBaseControl 被动态创建」；
  - 「挂载在主屏中的客户端控件，以及存为模板的客户端控件的子节点，均不支持通过脚本接口动态创建」。
  ⇒ 热区必须是**独立模板根**；不能把 cursor 塞进 image 模板当子节点再实例化。
- **真机口径（未验证）**：本工程记录过「容器组模板 `1073741865` 在真机 `InstantiateClientUIControl` 返回 nil ⇒ 容器整棵实例化在真机不支持」（`lua/main.lua:54`）；叶子模板（image/textbox）可用。cursor 模板在真机是否可实例化**未证实**，工程里已用「能力探测」而非硬编码：`probeTemplate(候选 guid, needCursor=true)` 逐个试，方法有无不符就销毁换下一个（`lua/main.lua:529-541`、`:3548-3601`）。

### Q3 命中判定：`acceptsPlayPointer` / `raycastTarget` / 光标检测区语义

**`acceptsPlayPointer`**（`studio/play/session.js:777-783`，原文逐字）：

```js
function acceptsPlayPointer(control) {
  if (control.kind === 'button') return control.raycastTarget !== false && control.interactable !== false
  if (control.kind === 'cursor' || control.kind === 'grid') return control.raycastTarget !== false
  if (control.kind === 'textwindow') return control.interactable !== false
  // 容器/装饰图/文本默认穿透，与真机一致；只有显式开启射线才接收。
  return control.raycastTarget === true
}
```

- **cursor / button**：默认**接收**（`raycastTarget` 缺省视为 true；`compile.js:110` button 取 `!== false`，`:118` cursor 同）。
- **image / textbox / container**：默认**穿透**（要求严格 `=== true`）。`compile.js:92` image 取 `node.raycastTarget === true`（缺省 false）。
- button 另受 `interactable` 约束；textwindow 看 `interactable`。

**“图片不把指针传给子级”的确切条件**（`session.js:785-791`，注释原文即真机结论）：

```js
function pointerRecursesInto(control) {
  // Device: a CursorEventArea nested under an image never receives
  // events. Only layout hosts forward the pointer to children.
  return control.kind === 'container' || control.kind === 'grid' || control.kind === 'textwindow'
    || control.kind === 'reference' || control.kind === 'button'
}
```

⇒ 命中递归**只在布局宿主上下钻**；`image` 不是布局宿主，`hitPlayControl` 走到 image 时既不会把它当命中（默认穿透），也**不会进入它的 children**，于是子级 cursor 区永远收不到指针。**同级兄弟不受影响**（不是“图片吃掉点击”，是“图片这一支到此为止”）。

**`hitPlayControl`**（`session.js:809-840`）要点：

1. 坐标系 = 画布空间 `canvasBox(0,0,W,H)`（原点左下、+y 向上，见 `studio/ui/layout.js:126` 注释「bottom-left coordinate system」）。
2. 根节点**逆序**遍历（后建的根盖前面的）；进入控件后先用逆矩阵把点变到本地坐标再判矩形。
3. 只在 `pointerRecursesInto` 的父级里下钻子级；`subtreeCanHit`（:793-807）会剪掉“整棵子树没有可接收者”的分支。
4. 最终返回 `acceptsPlayPointer(control) ? control : null`。
5. `active === false` / `visible === false` / 祖先不可见 ⇒ 不命中（:814）。

**容器门控 `showCursor`**（关键坑）：

- 官方：「showCursor … 是否显示常驻光标；**CursorEvent相关方法都需设置该参数为真后才可正常使用**」（文档 7034–7046）。
- 模拟器实现 `runtime.js:164-170`：沿 parent 链找 `kind === 'container' && showCursor === true`，找不到就返回 false；`scene.js:478` 的 `emitCursor` 直接 return ⇒ **监听器静默不触发，无报错**。
- container 默认 `showCursor: false`（`scene.js:133`、`compile.js:68-69`）。

**叠放次序（记录，不作断言）**：命中在容器内按 `children[0..n]` 正向遍历（`session.js:832-837`），绘制 `paintList` 按 children `n..0` 反向入表（`session.js:375-381`）；两者与“children[0] 在最前”自洽。但工程清单另记「运行时实例追加末尾 ⇒ 层级更上」为已验规则（`docs/v2-device-checklist.md` 表行 13）——**两者口径未统一，视觉 z 序以截图复核为准**。本方案不依赖它：热区不可见，且 image/textbox 不接指针。

### Q4 方案可行性、真机风险、官方替代

**在 image 卡上面叠一个透明 cursor 热区 —— 模拟器成立（已实测）**：

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 实例化 cursor 模板 → 有 `AddCursorEventListener` | 是，8 个事件全部注册成功 | 实验 §3.3，`listeners=8` |
| move 进入 → `CursorEnter` | 是 | 实验日志 `pHit CursorEnter` |
| down/up → `CursorDown` / `CursorUp` / `CursorClick` | 是，顺序 Down→Up→Click | 实验日志 |
| 移出 → `CursorExit` | 是 | 实验日志 |
| 热区**先建**（在 image 之下）是否仍能收到 | 是（image 不挡同级） | 实验 hit-first 变体 |
| 热区**嵌套在 image 里**是否收到 | **否，零事件** | 实验 nested 变体（与 `pointerRecursesInto` 一致） |
| 祖先 `showCursor=false` 是否收到 | **否，零事件** | 实验 showCursor=false 变体 |
| 画布坐标 → 命中矩形 | 1280×720 画布，锚点 (-420,+104)、424×104 ⇒ box `{left:8,bottom:412,w:424,h:104}`，指针 (220,464) 命中 | 实验 `playGet({inspect:true})` |

**真机已知风险（全部标未验证/待验）**：

1. **`showCursor` 门控**：官方要求为真；本工程在挂载容器上设了 `root.showCursor = true`（`lua/main.lua:3171`）。真机上“服务端挂载容器 → 客户端实例”这条链是否继承门控**未验证**；失败形态是**静默无事件**（无报错），最容易假绿。
2. **Enter/Exit 是否在真机派发**：工程里从未在真机注册过 CursorEnter/CursorExit（`lua/main.lua:3585` 只注册 `CursorDown`）；触摸设备没有 hover，PC 鼠标是否有 Enter/Exit **未验证**。⇒ 真机可能只有按下态。
3. **cursor 模板可实例化性**：模板 guid 导入后重编号（`lua/main.lua:46-56`）；容器模板在真机返回 nil（`:54`）；cursor 叶子模板**未证实**。必须走能力探测 + `node qxqy/deploy.mjs --calibrate` 校准。
4. **常驻光标副作用**：`showCursor` 语义是“显示常驻光标”，打开后是否在屏幕上画出光标 **未验证**（正是先按 `:3171` 打开的那个字段）。
5. **多指/多指针**：模拟器是单活动指针（`studio/docs/control-support.md:158`「单活动鼠标/触点」）；真机多点同时按两个菜单项的行为未验证。
6. **真机 Click 语义差异**：真机拖拽后仍补发 `CursorClick`（历史实测 D296 / PR #11），模拟器不发（`session.js:1013-1022`）⇒ 若将来加“按住拖动”交互，点击回调要自带拖拽判据。
7. **`CursorEventData` 字段差异**：真机只能用 `GetUIPos()` 系列，读 `d.x` 得 nil（历史实测 D229/D296）。
8. **`raycastTarget` 需在模板上确认为真**：cursor 模板默认 true（`compile.js:118`），但若编辑器里关掉即为 false，且无报错。

**官方推荐替代（更省事的一条路）**：

- **预设按钮四态**：官方教程原文「预设按钮 … 可以配置四种状态的图标和显示文本」（`官方教程-客户端控件和客户端脚本.md:122-126`）；四态 = 不可用 / 悬浮 / 按下 / 选中（编辑器字段 `unavailableChildId` / `hoverChildId` / `pressedChildId` / `selectedChildId`）。模拟器完整实现：`session.js:707-760`（`prepareButtonStates` 把四态子控件 `active=true, visible=false`；`refreshButtonState` 只把当前态子控件 `visible=true`，优先级 `interactable=false → pressed → hover → selected`），authoring 透传在 `compile.js:110-116`。
- 代价：需要在模板里为按钮准备 4 个状态子节点（各自一套图标/文字），四态 id 是**编辑器侧字段**，Lua 运行期**不能**设置（文档按钮字段只有 interactable/clickAudioId/raycastTarget）；且与热区一样受“真机模板可实例化性”约束。
- **`SetPressed` 不存在**：客户端控件文档全文无 `SetPressed`；脚本能主动触发的只有 `SimulateCursorClick()`（文档 6240 / 6354，模拟器 `scene.js:470-476`）。想脚本驱动“按下态”只能自己改 `imageColor`/`scale`。

**裁决建议**：贴图态（image 卡变色/发光）用**cursor 热区 + 自绘三态**（本工程已用同一机制做手机按钮热区：`lua/main.lua:3536-3601`，用例 `tests/08-click-pad.json` 已验证点击链）；若将来菜单项改成“一张按钮皮肤图 + 三态子图”，再考虑预设按钮四态（少写监听、多写模板）。

---

## ③ 推荐实现方案（含模拟器 JSON 自测）

### 3.1 代码侧（Lua）

1. **确认门控**：`OnStart` 里已有 `root.showCursor = true`（`lua/main.lua:3171`）。四模式菜单卡片都是 `root` 的子实例，命中门控成立；若哪天改成挂在新容器下，新容器也要 `showCursor = true`。
2. **热区实例**：沿用工程已有的 `hit` 模板（`qxqy/build.mjs:27` `addTemplate kind:'cursor' name:'hit'`；`TPL_GUIDS.hit` 候选表 + `probeTemplate(..., true)` 能力探测，`lua/main.lua:529-541`）。
3. **位置**：与菜单项同锚点、覆盖整行命中区（A 版菜单行中心 = `MC_ROW[i]`，`lua/main.lua:2251`；行内文字锚点见 `:2289-2301`）。热区尺寸取“整行可点”而非文字框，避免只点中字才生效。
4. **事件**：
   - `CursorEnter` → `modeHover(i, true)`；`CursorExit` → `modeHover(i, false)` + 解除按下态（移出后不解除会“卡在按下”）。
   - `CursorDown` → `modePressed(i, true)`；`CursorUp` → `modePressed(i, false)`。
   - `CursorClick` → 选中该模式（现有 Digit 选择入口同一函数）。
5. **三视觉态**（image/textbox 实例都能改，工程内已验证 `imageColor` / `fontColor` / `fontSize` 可写）：
   - 常态 = 现在样子；
   - 悬浮 = 文字亮一档 + 左侧 5×44 色柱加宽/增亮 +（可选）整行高亮 image 显隐；
   - 按下 = 文字/色柱压暗一档 + 行整体 `SetLocalScale(0.98, 0.98)`（松开复原）。
   - **把“是否有悬浮态”落到一个可断言的布尔**：建议悬停时把 `menuHover<i>`（高亮 image）`SetVisible(true)`——`visible` 是 autotest `control` 断言能读到的字段。
6. **清理**：`destroyMenuCards`（`lua/main.lua:2060-2067`）里连同热区一起销毁，避免重开累积监听/实例。

### 3.2 模拟器自测（可直接跑的 JSON）

放到 `tests/35-menu-hover.json`，跑 `node qxqy/runner.mjs 35`。**注意：用例里的 `menuHit<n>` / `menuHover<n>` 是方案落地后才存在的控件名，现在对本工程跑必然红（找不到控件）——它同时充当实现验收单。** 该 JSON 的**结构与时序已端到端验证**：在 `/tmp` 的 mock 实现（同模板、同控件名、同事件注册）上 `playRunCase` 返回 `passed: true`、7/7 断言绿（见 §3.3 末尾）。坐标口径：**画布像素，原点左下、+y 向上**；`mobile-16-9` = 1280×720，画布中心 (640,360)，模式 1 行锚点 (-420,+104) ⇒ 行中心 (220,464)（实验实测命中矩形 `{left:8,bottom:412,w:424,h:104}`）。

```json
{
  "format": "qxqy-autotest",
  "version": 1,
  "name": "35 标题页菜单 悬浮/按下 三态（cursor 热区）",
  "dt": 0.016666666666666666,
  "canvasId": "mobile-16-9",
  "events": [
    { "t": 0.2, "kind": "pointer", "type": "move", "x": 220, "y": 464 },
    { "t": 0.4, "kind": "pointer", "type": "down", "x": 220, "y": 464 },
    { "t": 0.5, "kind": "pointer", "type": "move", "x": 40, "y": 40 },
    { "t": 0.6, "kind": "pointer", "type": "up", "x": 40, "y": 40 }
  ],
  "asserts": [
    { "at": 0.3, "kind": "log", "contains": "menu hover 1 on", "source": "client" },
    { "at": 0.3, "kind": "control", "name": "menuHover1", "field": "visible", "equals": true },
    { "at": 0.45, "kind": "control", "name": "menuHit1", "field": "pressed", "equals": true },
    { "at": 0.45, "kind": "log", "contains": "menu press 1 on", "source": "client" },
    { "at": 0.55, "kind": "log", "contains": "menu hover 1 off", "source": "client" },
    { "at": 0.7, "kind": "control", "name": "menuHit1", "field": "pressed", "equals": false },
    { "at": 0.7, "kind": "control", "name": "menuHover1", "field": "visible", "equals": false }
  ]
}
```

为什么这样写（每条都是实测口径）：

- **必须用 `pointer` 而不是 `click`**：`click`（按控件名）走 `injectPlayClick` → `SimulateCursorClick()`，**不经过 hitPlayControl、不设 `pressed`、不产生 hover**（`session.js:702-710`、`scene.js:470-476`）。用它测三态一定假绿。
- **为什么 move 到 (40,40) 再 up**：up 时 `hit !== down` ⇒ 不派发 `CursorClick`（`session.js:1013-1022`），避免真的选中模式、销毁菜单卡导致后续断言找不到控件。要测选中链路，另写一条用例用 `click`（现有 `tests/08-click-pad.json` 就是这条路）。
- **`pressed` 是引擎侧读数**：`setPressed` 在 down 时置 true、up 时置 false（`session.js:858-863`），并由快照暴露（`session.js:113` `pressed: control.pressed === true`）。实验实测：move 后 false → down 后 true → up 后 false。
- `at` 时间必须卡在事件之间（down 0.4 之后、move 0.5 之前）。
- 断言字段可选：`control` 能读 `pressed/visible/text/active/interactable`（`studio/autotest/assert.js` 的 `readField`）；`imageColor` **不在**快照里（只在 paint 列表 `visualFields`），所以“变色”不能直接断言，要落到 `visible` 或 `log`。

### 3.3 复现实验（本文数字的来源）

在 `/tmp` 下用模拟器 studio 起一个干净工程（不碰本工程任何文件）：

```js
const s = createStudio()                       // /home/h/miliastra-beyond-simulator/studio/index.js
patch({op:'newAsset', assetType:'client-control-template'})
patch({op:'addTemplate', kind:'image',   name:'cell'})
patch({op:'addTemplate', kind:'cursor',  name:'hit'})
patch({op:'addTemplate', kind:'textbox', name:'text'})
// Lua: root.showCursor = true
//      cell(300x160) / text(260x60) / hit(300x160) 同锚点
//      hit:AddCursorEventListener(每种事件, print('pHit <事件>'))
//      另在 cell 下再实例化一个 cursor 当反例（nested）
s.playStart()
s.playPointer('move', 800, 450)   // 1600x900 默认画布中心
s.playPointer('down', 800, 450)
s.playPointer('up',   800, 450)
s.playPointer('move',  30,  30)
// 读 s.playGet({}).logs
```

实测输出：`["pHit CursorEnter","pHit CursorDown","pHit CursorUp","pHit CursorClick","pHit CursorExit"]`；反例分支 **零日志**。把 `showCursor` 改成 false ⇒ **零日志**。把热区改成**先于** image 创建 ⇒ 事件照旧（顺序无关）。

§3.2 那段 JSON 也在同一 mock（只把控件名换成 `menuHit1`/`menuHover1`、加 `SetVisible` 与 4 条日志）上跑过 `playRunCase`：**`passed: true`，7/7 断言通过**，退出码 0 ⇒ 用例格式、坐标、断言字段与 `at` 时序都是对的。

---

## ④ 真机风险与未验证项（汇总）

| # | 项目 | 现状 | 判据 / 下一步 |
| --- | --- | --- | --- |
| U1 | 真机 `CursorEnter` / `CursorExit` 是否派发 | **未验证** | 全屏 cursor 区注册 8 个监听 + `print`，真机移动鼠标后看 Debug_Log |
| U2 | 真机能实例化 cursor 模板 | **未验证**（容器模板已证不可，`main.lua:54`） | `probeTemplate(TPL_GUIDS.hit, true)` 的 `hit guid=` 日志 |
| U3 | 挂载容器 `showCursor` 能否门控到客户端实例 | **未验证** | 同上探针：无事件先查 `showCursor` |
| U4 | 打开 `showCursor` 是否出现常驻光标 | **未验证** | 真机截图目视（本工程 `:3171` 已打开） |
| U5 | 多指同按两个菜单项 | **未验证** | 真机双指实验 |
| U6 | 预设按钮四态在真机模板里可用 | **未验证** | 需先有带四态子节点的 button 模板 |
| U7 | 视觉 z 序（同级实例谁在上） | **口径冲突** | 以截图复核；本方案不依赖 |
| U8 | 真机 drag 后补发 Click | 有历史实测 | 点击回调加拖拽判据（若需要） |

另：本文“模拟器已验证”均指 **play session 行为层**（`injectPlayPointer` + Lua 回调 + 快照），不是渲染层；观感需出图（`node qxqy/shot.mjs`）复核。

---

## ⑤ 参考文件清单

**官方（镜像）**
- `/home/h/genshin-ts/research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md` — 3161-3260（CursorEventType 8 值）、4299-4350（继承关系/11 类）、5095 起（基类方法）、5246 起（图片控件）、6102-6248（预设按钮+光标方法+SimulateCursorClick）、6250-6362（光标检测区域）、6364-6460（CursorEventData）、6960-7046（容器 showCursor / 穿透字段）
- `/home/h/genshin-ts/research/千星知识图谱/learn-lua71/官方教程-客户端控件和客户端脚本.md` — 122-126（预设按钮四态）、140-142（光标检测区域）、277-295（模板索引与动态创建限制）
- `/home/h/genshin-ts/docs/knowledge-graph/d/d3d-客户端Lua脚本.md` — :55 HR-08（光标监听只挂预设按钮/光标检测区）、:75 HR-22（图片不把指针传给子级光标区；绘制与命中同树）

**模拟器源码**
- `/home/h/miliastra-beyond-simulator/studio/play/session.js` — 702-710（按名点击）、777-783（acceptsPlayPointer）、785-791（pointerRecursesInto，含真机注释）、793-807（subtreeCanHit）、809-840（hitPlayControl）、858-863（setPressed）、902-1040（injectPlayPointer 全分支）、951-976（5px 拖拽死区）、707-760（按钮四态）
- `/home/h/miliastra-beyond-simulator/client/lua-runtime/src/scene.js` — 60-70（CURSOR_METHODS 只挂 button/cursor）、100-112（字段白名单）、133（container showCursor 默认 false）、454-481（AddCursorEventListener / SimulateCursorClick / emitCursor 门控）
- `/home/h/miliastra-beyond-simulator/client/lua-runtime/src/runtime.js` — 164-170（cursorEventsEnabled 门控）、233-262（makeCursorEventData）、652-670（instantiate）、1488-1495（injectCursor）
- `/home/h/miliastra-beyond-simulator/studio/play/compile.js` — 68-69（container 字段）、92（image raycastTarget 默认 false）、110-118（button/cursor 默认 true + 四态 id）、143（animation 恒 false）
- `/home/h/miliastra-beyond-simulator/studio/autotest/format.js` — 5-6（事件/断言种类）、23-39（pointer/click payload）、69-98（断言字段）
- `/home/h/miliastra-beyond-simulator/studio/autotest/runner.js` — 10-14（pointer/click 分派）、46-51（有 tree/lua 断言时取 inspect 快照）
- `/home/h/miliastra-beyond-simulator/studio/autotest/assert.js` — readField/可断言字段
- `/home/h/miliastra-beyond-simulator/studio/ui/layout.js` — 89-123（computeRect）、126（左下坐标系注释）、233-243（canvasBox）
- `/home/h/miliastra-beyond-simulator/studio/docs/control-support.md` — :9（容器 showCursor 门控）、:12（预设按钮四态）、:13（光标检测区域能力 + 「与真机复杂穿透规则不完全一致」）、:158（单活动指针）
- `/home/h/miliastra-beyond-simulator/studio/index.js` — playPointer / playStart / playGet 入口

**本工程（只读核对，未改动）**
- `workspace/tetris/lua/main.lua` — 46-56（模板 guid 候选表 + 真机不可实例化记录）、204-208（MC/MS 表与函数前向声明）、2060-2067（销毁菜单卡）、2251（MC_ROW 四模式行位）、2287-2301（A 版菜单项控件与锚点）、2382+（buildMenuCards）、3171（root.showCursor = true）、529-541（probeTemplate 能力探测）、3536-3601（手机按钮 cursor 热区先例）
- `workspace/tetris/qxqy/build.mjs` — 25-27（cursor 模板 `hit`）、120（文字+热区布局注释）
- `workspace/tetris/tests/08-click-pad.json` — 现有按名点击链用例（只证点击，不证 hover/pressed）
- `workspace/tetris/docs/v2-device-checklist.md` — 表行 11（AddCursorEventListener 仅 cursor/button，真机待验）、表行 13（实例层级口径）
