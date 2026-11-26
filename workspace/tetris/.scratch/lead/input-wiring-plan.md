# input_map 接线计划（lead 审 diff 用的对照表）

> 状态：2026-10-31 立。执行者 = input-map 的子窗口（core-play 交回 main.lua 之后）。
> 定位方式：**只认锚文本，不认行号**。main.lua 正被 core-play 改（我写这份文档的 20 分钟里它就漂了三次：
> 6842 → 6864 → 6885 → …），任何写进文档的行号都有保质期。开工第一步先跑这条自检，把锚点映到**当时**的行号：
>
> ```bash
> cd /home/h/genshin-ts/workspace/tetris && grep -n \
>   "local function listen(name, fn)\|local enumKeys\|for _, m in ipairs(NUM.KEYMAP)\|listen('KeyboardDropKeyDown'\|for i = 1, #MODE_INFO do\|local mapped = {\|local anyKeyStart\|for i = 1, 43 do\|UI4.padBind = function\|pcall(UI4.padBind\|FN.U.dispatch = function\|UI4.runAct = function\|UI4.dispatch = function\|local PHONE_KEY\|local P2_KEYS\|local function skillKeyUpWatch\|PT = PLATFORM_M.new\|v6 模块缺失" \
>   lua/main.lua
> ```
> 目标：把「一张动作表 + 一次注册 + 栈式分发」接进 main.lua，**全程可运行、每步可回退**。
> 交付物已在位（不用再写）：`lua/tetris/input_map.lua`（565 行）、`lua/tetris/view_pad.lua`（229 行）、
> `tests-lua/input_map_test.lua`（85 条断言，`lua5.3 tests-lua/input_map_test.lua` → exit 0）。

---

## 0. 硬契约（违反即停，先报 lead）

这三条日志字面量是 L1 用例契约，接线时**一个字都不能改**：

| 字面量 | 断言它的用例 | 谁打 |
|---|---|---|
| `pad bind n=24` | `tests/48-pad-keys.json`（精确值断言） | 现：`UI4.padBind`（`print('pad bind n=' .. cnt)`） |
| `pad ev <ControllerXxxKeyDown> act=<action>` | tests/48 逐键 5 条 | 现：padBind 的 listen 回调 |
| `phone tap <id>` | tests/08、44、61 | 现：`ui.lua makeBtn` 的 CursorDown |

**数字若从 24 变了（变 22/26…）立刻停下报 lead** —— 那说明 pad 的键集被动了，不是接线问题。
`input_map_test` 的 B14 会把「手柄注册量必须仍 = 24（动作 14 + 探针 10）」钉住，改了会红。

另外两条既有日志**保持原样**（不是硬契约但真机排查靠它）：
`listen ok <name> via enum|string`、`listen fail <name> :: <err>` —— lead 已把 platform.bindKey 改成打同字面量。

---

## 1. 现状读数（接线前，可复算）

| 面 | 数 | 出处 |
|---|---|---|
| 键位真源 | **6 份**（任务书说 5 份，多出来的是 `P2_KEYS`） | `config.NUM.KEYMAP` / `config.NUM.HOLD_KEY` / `config.NUM.PAD.KEYS` / main 的 `PHONE_KEY` / 头注释键位表 / `P2_KEYS` |
| 注册次数 | **90 次**（15 字面 + 10 键位 + 4 松开 + 4 模式 + 24 手柄 + 33 兜底） | `listen(` 逐个点出的和，`input_map_test` B18 复算 |
| 不同键 | **84** | 同上 |
| 重复注册 | **6 个键注册两次**：`KeyboardCraftspersonKey{11,12,13,14,16,30}` | 技能/Hold 各一条真动作（6424-6466）+ 43 键兜底循环（6495-6499） |
| 收表后 | **84 次 / 84 键 / 0 重复**（键盘系 66→60，手柄 24→24） | `input_map.M.stats()` |

`applied` 判据：接线完成后 `input_map_test` 的 B 段自动从 "migrating" 切到 "wired" 口径
（断言 `loadModule('input_map')` / `bindAll(` / `loadModule('view_pad')` / `pad(` 在位，且兜底循环已删）。

---

## 2. 补丁计划（5 步，每步单独可回退）

> 顺序按 lead 指定：**先删重复注册 → 再收表 → 再删兜底循环 → 最后接 pad**。
> 每步都要求：`lua5.3 tests-lua/run_all.lua` 全绿 + 当步点名的 L1 子集绿，才进下一步。

### Step 0 · 基线读数（不改代码）

> ⚠ **假绿陷阱（D591 实证）**：`qxqy/runner.mjs` 加载的是 `tetris.save.json`，而存档里**存着一份 Lua 源码副本**。
> **改完 lua 必须先 `node qxqy/build.mjs` 再跑 runner**，否则跑的是旧代码、四条本该红的用例全绿。
> 判据：`grep -c <新改动里的字面量> tetris.save.json`（>0 才算进去了）。
> 另外：`main.lua` 的 main chunk 现在 **158 locals / 上限 200（余量 42）**，本计划净增约 +2（`INPUT` + `dispatch`）；
> 注意 `do … end` 块里的局部变量**在块内也占槽**，别一次塞十几个。

```bash
cd /home/h/genshin-ts/workspace/tetris
lua5.3 tests-lua/run_all.lua                     # 期望 11/11 green
node qxqy/runner.mjs 08                          # 触屏拇指键
node qxqy/runner.mjs 48                          # 手柄 pad ev / pad bind n=24
node qxqy/runner.mjs 44                          # 触屏长按连发
node qxqy/runner.mjs 61                          # 手机按钮建出
```
期望日志：`phone build n=13 (pad=11 nav=2 …)`、`pad bind n=24`、`phone tap left`。

### Step 1 · 先删重复注册（最小、独立、可回退）

**删哪段**：不改循环，只扩排除表。位置锚 `local mapped = {`（整块到紧随其后的 `}` 为止；那 4 行注释也一起保留）。
**换成什么**：在 `[39] = true` 之后追加 6 条 + 一行理由注释：

```lua
    [36] = true, [37] = true, [38] = true, [39] = true, -- ↑↓←→ = 旋转/软降/移动
    -- 收表前先掐掉重复注册：这 6 个键在 6424-6466 已有真动作（技能/Hold），
    -- 兜底循环再注册一遍会让"同一个键两个回调、行为取决于顺序"。
    -- 兜底语义不丢：它们的执行体自己都调 startIfWaiting()（act() / skillKey()）。
    [11] = true, [12] = true, [13] = true, [14] = true, [16] = true, [30] = true,
```

**等价性论据**：`act()`（6060-6085）与 `skillKey()`（6393-6420）内部都调 `startIfWaiting()`，
所以「入场态按这 6 个键仍会开局」；区别只是不再多跑一次 `anyKeyStart`。
**跑**：`lua5.3 tests-lua/run_all.lua`（期望 11/11；`input_map_test` 会打
`B7b main 兜底比收表池多注册 0 个键`、`B18 现存注册次数 = 84`），外加 `runner 48`（手柄未动，应仍绿）。
**期望日志**：无新增；`pad bind n=24` 不变。
**回退**：删掉这 6 行。

### Step 2 · 收表（listen → input_map，分 2a/2b/2c 三个小步）

#### 2a · `listen` 换成 PT.bindKey（零语义变化，先让日志锚落到平台层）

**删哪段**：`local function listen(name, fn) … end` 整段（从 `local enumKeys = …` 起，到 `print('listen fail …)` 那个 `else` 之后的 `end`）。
**换成什么**：

```lua
  -- 键位注册唯一实现 = platform.bindKey（enum/string 双形态回退 + listen ok/fail 诊断行）
  local listen = function(name, fn) return PT.bindKey(name, fn) end
```
（`PT` 在 5835 装配，5927 处已有"缺模块即 error"的守卫 ⇒ 输入段里 PT 必非 nil。）
**跑**：`run_all` + `runner 48`。
**期望日志**：`listen ok ControllerCraftspersonKey2Down via enum`（lead 新加的 platform 诊断行）。
**回退**：恢复原 `listen` 定义。

#### 2b · KEYMAP 循环 + 两条 P2 补丁键 → bindOne

**删哪段**：
- `for _, m in ipairs(NUM.KEYMAP) do … end`（含 Down/Up 两条 listen）
- `listen('KeyboardDropKeyDown', …)` / `listen('KeyboardInteractKeyDown', …)` 两条

**换成什么**（在 `doPlay`/`act` 定义之后、原来的位置）：

```lua
  local INPUT = IMAP.new { platform = PT, log = print }
  -- 6 个玩法动作：键位表（含 P2 的 X/F、手柄方向键）全在 input_map.ACTIONS 里
  local function dispatch(action, keyName, phase)
    -- phase == 'up' ⇒ DAS 清方向（原 6142 的回调体原样搬进来）
    ...
  end
  for _, a in ipairs({ 'left', 'right', 'rot', 'soft', 'hard', 'hold' }) do
    INPUT:bindOne(a, dispatch)
  end
```

`dispatch` 的写法（**结构建议，不是唯一解**）：

```lua
  local function dispatch(action, keyName, phase)
    if action == 'anyKey' then return anyKeyStart() end          -- Step 3 之后才会出现
    if action == 'probe' then print('pad ev ' .. keyName) return true end
    if phase == 'up' then
      g = routePlayer(keyName)                                   -- 原 6142 的 v3.3 根修：先路由
      local m = (action == 'left') and -1 or 1
      if action == 'left' or action == 'right' then
        if g.das.dir == m then g.das.dir = 0 end
      elseif action == 'skill1' then
        -- 刻晴松手施放（原 6430 的回调体）
      end
      return true
    end
    if helpOpen then closeHelp() return true end                 -- 原 6040-6042 的语义
    ...
    act(keyName, function() doPlay(action, keyName) end)()
    return true
  end
```

> 注意：`act(keyName, fn)` 的签名保留（它内部已经做了 helpOpen / ROSTER / 引导态 / MODE_OVER /
> `g = routePlayer(keyName)` / `playerTouched()` 这一整套）。收表**只换注册方式，不动这套语义**。

**跑**：`run_all` + `runner 08`（触屏拇指键仍走同一 act 链）+ `runner 48`。
**期望日志**：`listen ok KeyboardCraftspersonKey38Down via enum` 等；`p2 act=…` / `coop act=…` 不变。
**回退**：恢复这两段（KEYMAP 循环两行 + Drop/Interact 两行）。

#### 2c · 15 条字面 listen → dispatch 分支

逐条替换（每条独立可回退，位置按锚文本）：

| 锚 | 现动作 | 换成 |
|---|---|---|
| `listen('KeyboardCharacterSkill3KeyDown'` | restart（R） | `dispatch` 里 `if action == 'restart' then … end`；注册由 `INPUT:bindOne('restart')` 或最终 `bindAll` |
| `listen('KeyboardCharacterSkill2KeyDown'` | settle（Q） | 同上 `action == 'settle'` |
| `listen('KeyboardCraftspersonKey15Down', onHelpKey)` + `listen('KeyboardCharacterSkill1KeyDown', onHelpKey)` | help（H/E） | `action == 'help'` → `onHelpKey()`；两键在 ACTIONS.help 里 |
| `listen('KeyboardCharacterSkill4KeyDown'` | debugFill（T） | `action == 'debugFill'` |
| `listen('KeyboardCraftspersonKey22Down'` | back（V） | `action == 'back'` |
| `listen('KeyboardSwitchToWalkOrRunKeyDown'` | level | `action == 'level'` |
| `for i = 1, #MODE_INFO do listen('KeyboardCraftspersonKey' .. i .. 'Down'` | mode1..4 | `action == 'mode1'..'mode4'` → `menuSelectMode(i)`（可用 `modeActionIndex(action)` 反查） |
| `listen('KeyboardCraftspersonKey12Down'` / `…12Up'` | skill1 | `action == 'skill1'` + `phase` 区分记时/施放 |
| `listen('KeyboardCraftspersonKey11Down'` | skill2 | `action == 'skill2'` |
| `listen('KeyboardCraftspersonKey13Down'` | skillSwitch | `action == 'skillSwitch'` |
| `listen('KeyboardCraftspersonKey16Down'` | roster | `action == 'roster'` |
| `listen('KeyboardCraftspersonKey30Down'` | debugUnlock | `action == 'debugUnlock'` |

**同时删死代码**：`local function skillKeyUpWatch(name)`（紧随 `FN.skillKeyHoldSec = 0` 之后那个）定义后**从未调用**
⇒ 整段删（技能 Up 只有 `KeyboardCraftspersonKey12Up` 一条真注册，已在 ACTIONS.UPKEYS）。

**跑**：`run_all` + `runner 08/44/48/61` + 全量 `runner.mjs`（这一步影响面最大）。
**期望日志**：`guide ready p1/p2`、`key blocked by overlay …`、`menu back V`、`settle detail on/off`、
`debug-fill`、`skill switch ok=true` 全部与接线前一致（把基线日志 diff 一遍）。
**回退**：按表逐条恢复（建议每条一个 commit，message 写 `input-map step2c: <action>`）。

#### 2d · 数字键段确认

`for i = 1, #MODE_INFO do listen('KeyboardCraftspersonKey' .. i .. 'Down'` **第二处**（第一处是 `buildMenuCards`
里的同名循环，不是注册点）已在 2c 的表里（mode1..4）；注意**不要**把它并进兜底池 —— 它在 ACTIONS 里，`fallbackPool` 会自动排除。

### Step 3 · 删 43 键兜底循环（改由 fallbackPool 自动派生）

**删哪段**：
- `local mapped = { … }`（Step 1 扩过的那个）
- `local anyKeyStart = function() … end` **函数体保留**，搬进 `dispatch` 的 `anyKey` 分支
- `for i = 1, 43 do … listen('KeyboardCraftspersonKey' .. i .. 'Down', anyKeyStart) … end` 整段

**换成什么**：一次注册（放在所有这些定义之后、`newGame()` 之前）：

```lua
  -- 一次注册：动作键 42 + 松开 5 + 兜底 27（自动排除已被认领的 16 个工匠槽）+ 探针 10 = 84
  INPUT:bindAll(dispatch, { fallback = true, probe = true })
```

**跑**：`run_all`（`input_map_test` 此时切到 wired 口径）+ 全量 `runner.mjs`。
**期望日志**：`input bind all actions=22 down=42 up=5 fallback=27 probe=10 padMove=0 total=84 dupes=0`，
且**再没有** `listen ok KeyboardCraftspersonKey5Down`（那是兜底键，现在由 input_map 注册）。
**判据**：日志里 `listen ok` 行数 = 84；`input dup` 行 0 条。
**回退**：恢复 mapped 表 + 兜底循环，删 `bindAll` 一行。

### Step 4 · 接 pad（4a 收表注册，4b 触屏描述通道）

#### 4a · 手柄注册收表（不改渲染）

**删哪段**：`pcall(UI4.padBind, listen)` 那一行；旧实现 `UI4.padBind = function(listen)` 整段（其中 `local bases = {}` + `for i = 1, 14 do … end` + `PROBE_NAMED` 循环就是"不含 MoveLeft/MoveRight"的那三行）。
**换成什么**：
- `bindAll` 已覆盖 controller 24 条（动作 14 + 探针 10）⇒ 不再单独注册
- `pad bind n=24` 由 main 打印（数字从 input_map 统计，**必须 24**）：

```lua
  do
    local nAct, nProbe = 0, 0
    for _, a in ipairs({ 'left','right','rot','soft','hard','hold','help','confirm' }) do
      for _, k in ipairs(INPUT:names(a)) do
        if k:sub(1, 10) == 'Controller' then nAct = nAct + 1 end
      end
    end
    for _, k in ipairs(IMAP.PROBE) do if k:sub(1, 10) == 'Controller' then nProbe = nProbe + 1 end end
    print('pad bind n=' .. (nAct + nProbe))     -- 期望 24
  end
```
- `pad ev <键> act=<动作>`：`dispatch` 的 `probe` 分支打 `pad ev <键>`；
  有动作的键要打 **`pad ev <键> act=<动作>`**（tests/48 逐键断言，` act=` 尾巴不能省）

**跑**：`runner 48`（24 + 5 条 `pad ev … act=`）+ `run_all`。
**期望日志**：`pad bind n=24`、`pad ev ControllerCraftspersonKey2Down act=right`、
`pad ev ControllerJumpKeyDown act=rot`、`pad ev ControllerCharacterSkill1KeyDown act=soft`、
`pad ev ControllerCharacterSkill2KeyDown act=hold`、`pad ev ControllerNormalAttackKeyDown act=hard`。
**回退**：恢复 `pcall(UI4.padBind, listen)`（input_map 里 controller 键先 `skip` 掉，避免双触发）。

#### 4b · 触屏走同一套动作名（**只加通道，不删旧路**）

本轮不替换 `ui.lua` 的 pad（三态/悬停/连发/11 屏重排都在那边，属于另一张票）。
只做两件事：

1. `FN.U.dispatch`（技能分支是末尾三行 `if action == 'skill1'/'skill2'/'switch'`）与 `UI4.dispatch`、`UI4.runAct` 改调
   `INPUT:dispatch(action, 'touch:' .. tostring(id))`，动作名先过 `view_pad.ACT` 归一
   （`switch→skillSwitch`、`home→back`、`detail→settle`、`page→helpPage`、`closeHelp→help`）。
2. 新增可关开关 `FN.PAD_DESC = false`（默认关）：为 true 时
   `BR.apply(VPAD.new{ config = CFG }.pad{ screen = FN.U.screen, canvas = { CANVAS_W, CANVAS_H },
   dual = (G[2] ~= nil), onAction = function(a, id) print('phone tap ' .. id) INPUT:dispatch(a, 'touch:' .. id) end })`
   —— 用于 A/B 对照出图，验收后再决定是否把 ui.lua 的 pad 段退役（另票）。

**跑**：`runner 08/44/61`（`phone tap <id>` 字面量必须还在）+ `shots-v5.mjs --all` 出图对比（`FN.PAD_DESC=true` 前后各一组）。
**期望日志**：`phone tap left`、`ctl phone.left px=… py=…`（UI4.regAdd 的检测行）。
**回退**：`FN.PAD_DESC=false`。

---

## 3. 已知缺陷 · 待修（本轮**不修**，lead 裁决 2026-10-31）

> 这一节是**下一张票的输入**，不是本轮的 TODO。复现方法都写在下面，可直接照做。

### 3.1 触屏技能键绕开 act() 链（AI 接管不交还 / 说明页不关）

**现象**：手机上点「技能1/技能2/换人」，与键盘 Z/U/Y **语义不一致**——
不触发 `playerTouched()`（所以 AI 代打中按技能**不会把它交还**，与键盘按 Z 相反），
也不走 `if helpOpen then closeHelp() return end`（说明页开着时点技能**不会先关页**）。
**根因**：`FN.U.dispatch` 末尾三行把 `skill1/skill2/switch` 直接接到 `FN.skillCast` / `FN.skillSwitch`，
绕过了 `act()`；而 `UI4.runAct` 只覆盖 `PHONE_KEY` 里的 6 个玩法动作。
**复现**：①进入 AI 代打态（等接管横幅出现）→ 点手机「技能1」→ 观察日志里 **无** `takeover back`；
键盘按 Z 会出现 `takeover back`。②打开说明页（H / 「说明」键）→ 点「技能1」→ 说明页仍在。
**修法（下一票）**：`FN.U.dispatch` 的 skill 分支改走 `INPUT:dispatch('skill1', 'touch:skill1')`，
让技能键与玩法键共用同一条 act 语义；注意 `act()` 会 `playerTouched()`——这正是键盘已有的行为。

### 3.2 手柄具名方向键是死映射（永不可达）

**现象**：`ControllerMoveLeftKeyDown` / `ControllerMoveRightKeyDown` 在
`config.NUM.PAD.KEYS`（config.lua 的 `NUM.PAD.KEYS`，`left`/`right` 两行的第二个键名）里映射成 left/right，
但 `UI4.padBind` 的 `bases` 只生成 `CraftspersonKey1..14` + `PROBE_NAMED` ⇒ **这两条从来没注册过**。
真机上手柄"具名方向键"按了零响应（只有 CraftspersonKey1/2 生效）。
**复现**：真机/模拟器握手柄，按"左方向键对应的具名键"→ 日志无 `pad ev ControllerMoveLeftKeyDown`。
**修法（下一票）**：`INPUT:bindAll{ padMoveKeys = true }`（input_map 已把两条登记在 `M.PAD_UNBOUND`），
**同时**把 `tests/48` 的 `pad bind n=24` 期望改成 `26`，并在 48 里补两条 `pad ev … act=` 断言。
→ 这也解释了为什么本轮默认不注册：先动契约再动代码。

### 3.3 其余已数据化登记的缺陷（`input_map.lua` 里可查，不需要另找）

| 缺陷 | 登记位置 | 影响 |
|---|---|---|
| 6 键重复注册（11/12/13/14/16/30） | `M.RETIRED`（带 action + reason + 行号） | Step 1 修掉 |
| `skillKeyUpWatch` 死代码 | 本节 + Step 2c | 技能键 Up 从未注册 |
| 10 条纯探针手柄键 | `M.PROBE` | 只打 `pad ev`，不产动作（设计如此） |
| `P2_KEYS` 是第 6 份键位真源 | 本节 | 用**键名**判 P1/P2，加键必漏；建议给 ACTIONS 加 `player` 字段 |
| 手柄确认键局内无消费者 | 本节 | `padAct('ok')` 局内 → `runAct('ok')` → PHONE_KEY 无 'ok' → 静默丢 |
| `UI4.runAct` 对未知 action 静默 return | 本节 | 新增手机键 act 名没接时点击无声消失 |
| 双盘拇指簇描边 2px 溢出画布 | `view_pad` 测试 C28 | 视觉小瑕疵（ui.lua 原值照抄） |

---

## 4. 验证矩阵（每步都跑，别跨级）

| 级 | 命令 | 期望 | 说明 |
|---|---|---|---|
| L0 | `lua5.3 tests-lua/run_all.lua` | `11/11 files green` exit 0 | 秒级；输入表单源/触屏描述/lint 全在这 |
| L0' | `lua5.3 tests-lua/input_map_test.lua` | `85 passed, 0 failed`（wired 态 `84/84`） | B 段自动切口径 |
| L1-0 | `node qxqy/build.mjs` | `lua compile ok` + 存档更新 | **任何 L1 之前必须先跑**（否则 runner 跑的是存档里的旧 Lua = 假绿） |
| L1-a | `node qxqy/runner.mjs 08` | 触屏 ◀/旋转/锁定/缓降/暂存 全打到 act 链 | Step 2/4 必跑 |
| L1-b | `node qxqy/runner.mjs 48` | `pad bind n=24` + 5 条 `pad ev … act=` | **Step 4 的硬判据** |
| L1-c | `node qxqy/runner.mjs 44` | `phone tap/rep start/done` | 长按连发 |
| L1-d | `node qxqy/runner.mjs 61` | `phone build n≥9` + `phone tap left` | 手机按钮建出 |
| L1-e | `node qxqy/runner.mjs`（全量，387s） | 70/70 | Step 2c 与 Step 3 后各一次 |
| L2 | `node qxqy/shots-v5.mjs --all --out …` | 30 张 + 人眼对比 | 只有 4b 需要 |

**回报格式**：每步给「跑了什么 / 工作目录 / 退出码 / 关键日志行」，L0 绿 ≠ L1 绿 ≠ L2 对。

---

## 5. 回退表

| Step | 回退动作 | 代价 |
|---|---|---|
| 1 | 删 6 行 mapped | 0（回到 90 次注册） |
| 2a | 恢复 `local function listen(...)` 原体 | 0 |
| 2b | 恢复 KEYMAP 循环 + 2 条 P2 补丁键；`INPUT` 行删掉 | 0 |
| 2c | 按表逐条恢复（建议一条 commit） | 低（每条独立） |
| 3 | 恢复 mapped + 兜底循环；删 `bindAll` 一行 | 低 |
| 4a | 恢复 `pcall(UI4.padBind, listen)`；input_map 里 controller 键加 `skip` | 低 |
| 4b | `FN.PAD_DESC=false` | 0 |

---

## 6. 别踩的三件事（来自本轮实测）

1. **别把 `mapped` 表当"派生"**——它注释自称派生，实为手抄 10 个数字；Step 3 删掉后由
   `fallbackPool(ACTIONS)` 真派生（这就是 6 键重复注册的结构性根因）。
2. **别在 `act()` 之外新开第二条动作派发路径**——触屏技能键绕开 act 链就是缺陷 3.1 的成因。
   一切动作都走 `INPUT:dispatch(action, source)`，需要新语义就加 handler 层，不要加旁路。
3. **`INPUT:dispatch` 的返回值语义**：`true` = 已消费；**`nil` 也算已消费**（兼容 main 现有无返回值回调）；
   只有显式 `false` 才继续往栈下传。栈：`INPUT:push('help'|'roster'|'settle'|'game', handler)`，
   handler 返回 true 即"关页且不动作"——替代 6040-6052 那两段 if。

---

## 7. 执行状态（2026-10-31 18:45 收表完成）

| 步 | 状态 | 读数 |
|---|---|---|
| Step 1 扩 mapped 6 条 | ✅ 已提交 `b6086e75` | listen ok **90 → 84**；runner 08/44/48/61/02/03/05 **7/7**；run_cases 69/70 |
| Step 2 收表（listen→dispatch） | ✅ 已提交 `2aa98849` | 全量 runner **70/70 · 375.1s · exit 0**；run_cases 69/70；locals 154→155 |
| Step 3 删 mapped + 43 键循环 | ✅ 并入 Step 2（INPUT:bindAll 的落点正是兜底循环的位置） | 兜底池 27 条由 `fallbackPool()` 自动派生；`listen ok` 仍 84 |
| Step 4a 手柄收表 | ✅ 并入 Step 2（`UI4.padBind` 退役） | `pad bind n=24`（14 映射 + 10 探针）一字未变；tests/48 全绿 |
| Step 4b 触屏描述通道 | ⏸ 未做（需动 ui.lua 布局段 = 场景栈那一波） | input_map_test 的 B21 已是 PENDING 双口径 |

**顺带交付的仪器**：`.scratch/lead/count-listen.lua` —— 用 engine_shim 起一次 `load_main()` 数 `engine.logs`
里的 `listen ok/fail`、`pad bind n=`，**秒级**，不必跑 350s 的 runner（runner 不把客户端 print 打到 stdout）。

**收表后 main.lua 的输入段形态**（给下一位接线者）：
`dispatch(action, keyName, phase)` 一张派发表 + `INPUT:bindAll(dispatch, {padMoveKeys=false})` 一次注册；
手柄分支先打 `pad ev` 再走 `UI4.padAct`（菜单焦点/帮助/runAct 三支不变）；
玩法六动作 Down 走 `act()+doPlay`，Up 用 `keyName:gsub('Up$','Down')` 还原对应 Down 键再 `routePlayer`（P2 路由依赖键名）。
