# 03 输入（键位 / DAS / 鼠标三态 / 事件路由）

> **本章是全技能返工最贵的一章**：同一个「按一下方块一直走」用户报了 **4 次**（跨 2 天），
> 我们错判了 **2 次**（"旧构建" / "模拟器转发链失效"），最后靠用户一句「休闲模式正常」才收敛。
> 所以本章的每条规则都写清"不这么做会怎样"。
>
> 出处：`18-evidence.md` B 组；代码：`lua/tetris/config.lua:100-131`、`lua/main.lua:4403-4449`、`4765-4784`。

## 1. 键位必须先实证，不能想当然

**平台事实（模拟器键池）**：
- 具名键：WASD（`KeyboardMoveForward/Backward/Left/Right`）、`KeyboardJumpKey`（=Space）、`KeyboardDropKey`（=X）、`KeyboardInteractKey`（=F）、`KeyboardCraftspersonKey1..40`、双 Ctrl。
- **字母 C 不在任何键池**——想用 C 做 Hold 会注册不上，只能改 **G = `KeyboardCraftspersonKey14`**。
- 方向键 = `KeyboardCraftspersonKey36/37/38/39`（上/下/左/右）；数字 1-4 = `KeyboardCraftspersonKey1-4`。

**枚举名必须逐字完整**：
```lua
-- config.lua:119-131（真实 KEYMAP，一字不差）
KEYMAP = {
  { key = 'KeyboardCraftspersonKey38Down', up = 'KeyboardCraftspersonKey38Up', action = 'left'  },
  { key = 'KeyboardCraftspersonKey39Down', up = 'KeyboardCraftspersonKey39Up', action = 'right' },
  { key = 'KeyboardCraftspersonKey36Down', action = 'rot'  },
  { key = 'KeyboardCraftspersonKey37Down', action = 'soft' },
  { key = 'KeyboardMoveLeftKeyDown',       up = 'KeyboardMoveLeftKeyUp',       action = 'left'  },
  { key = 'KeyboardMoveRightKeyDown',      up = 'KeyboardMoveRightKeyUp',      action = 'right' },
  { key = 'KeyboardMoveForwardKeyDown',    action = 'rot'  },
  { key = 'KeyboardMoveBackwardKeyDown',   action = 'soft' },
  { key = 'KeyboardJumpKeyDown',           action = 'hard' },
  { key = 'KeyboardCraftspersonKey14Down', action = 'hold' },   -- G
}
```

**拼错的后果**：拼成 `KeyboardJumpDown`（少了 `Key`）之类 → **静默吞键**，不报错、`listen` 也"成功"，探针全静默却看似注册好了。
**判定法**：启动日志里查 `listen ok ×N`（N 必须等于键位数）；或日志查一个只在按键后才会出现的锚点（如 `guide stage=1`）。

**判据**：新增键位后，必须有一条用例断言"按这个键会发生那个动作"；不能只看"注册没报错"。

## 2. DAS/ARR：三件事缺一就会「按一下一直走」

**参数（`config.lua:100-111`）**：
```lua
DAS_DELAY = 0.25,   -- 按住方向键多少秒后开始自动连移
ARR_RATE  = 0.05,   -- 自动连移的间隔秒数
DAS_HOLD  = 0.35,   -- ARR 激活后累计多久强制停（Up 丢失自愈）
```

**① Down：先归零再走一格（不依赖 ARR 相位）**
```lua
-- main.lua:4415-4419（节选）
if action == 'left' then
  g.das.dir, g.das.t, g.das.arr, g.das.hold = -1, 0, 0, 0
  moveBy(-1)
elseif action == 'right' then
  g.das.dir, g.das.t, g.das.arr, g.das.hold = 1, 0, 0, 0
  moveBy(1)
end
```

**② 每帧推进 + 时间上限兜底**
```lua
-- main.lua:4765-4784（原文，含注释里的教训）
if g.das.dir ~= 0 and not g.gameOver then
  g.das.t = g.das.t + d
  if g.das.t >= NUM.DAS_DELAY then
    g.das.hold = g.das.hold + d
    g.das.arr  = g.das.arr + d
    while g.das.arr >= NUM.ARR_RATE and g.das.dir ~= 0 do
      g.das.arr = g.das.arr - NUM.ARR_RATE
      moveBy(g.das.dir)
    end
    if g.das.hold >= NUM.DAS_HOLD then
      g.das.dir = 0            -- 强制停（Up 丢失自愈）
      print('das stop reason=timeout hold=' .. string.format('%.2f', g.das.hold))
    end
  end
end
```

**③ Up：先路由实例，再只清自己按住的方向**
```lua
-- main.lua:4443-4450（原文，注释就是根因记录）
listen(m.up, function()
  g = routePlayer(m.key)   -- v3.3 根修：事件回调必须先路由
                           -- （ai-battle 下 OnUpdate 循环每帧把 g 留成 G[2]，Up 曾清错实例 = 玩家盘连移永不停）
  if m.action == 'left'  and g.das.dir == -1 then g.das.dir = 0 end
  if m.action == 'right' and g.das.dir ==  1 then g.das.dir = 0 end
end)
```

**为什么需要三件套（每件都有翻车）**：
| 缺什么 | 会怎样 | 真实案例 |
|---|---|---|
| 缺 Up 路由 | 多盘模式下清错实例 → 玩家盘方向永不清 → **连移不停** | 用户报 4 次，最终真因 |
| 缺时间上限 | 平台 Up 丢失（焦点转移/网页转发失败）→ 点一下走到底 | 网页端复现；加了上限后"最多多滑 4 格" |
| Down 不归零 | 上一块的 ARR 相位残留 → 新块一按下就多走一格 | 手感不一致 |

**⚠️ 只用"步数上限"是错的防御**：v2.1 试过"连走满 12 格强制停"——慢帧率下这会**一次放出很多格**（一帧算多次 moveBy），而且治不了"方向不清"的根因。**用时间上限**（与帧率解耦）。

**判据**：
- 用例：按住左键 1s → `move` 次数 ∈ [3,4] 且停在左墙 `x=1`（`tests/18-das-arr.json`）。
- 日志：兜底触发时出现 `das stop reason=timeout hold=0.35`；正常松开时**不出现**这行。
- 单击：`grep -c "^move x=" 日志`，单次 Down/Up 恰好 1 条。
- 双屏：在 ai-battle/pvp 模式下单独验一次（**这是缺陷唯一能露头的地方**）。

## 3. 锁定延迟（触底缓冲）

```lua
-- config.lua:98-99
LD_DELAY  = 0.5,   -- 重力触底后的缓冲秒数
LD_RESETS = 15,    -- 移动/旋转成功各计一次，超限强制锁定
```
**规则**：重力触底 → 启动 0.5s 计时；期间成功移动/旋转 → 重置计时（最多 15 次）；到时仍触底 → 锁定。
**玩家主动落（软降/硬降）触底即时锁**（保持旧手感）；**AI 路径不吃锁定延迟**（`aiDrop` 直锁）——两任务并行零冲突的由来。

**判据**：用例断言"触底后 0.4s 内移动仍可救回 / 0.6s 后不可"；上限 15 次后强制锁。

## 4. 鼠标三态（关键交互必须能点）

**平台事实（五条，缺一条就白做）**：
1. **只有 cursor / button 类控件收光标事件**（image/textbox 静默失效 → 只能降级为键盘）。
2. **父链门控**：`container.showCursor = true` 必须置上，否则 `AddCursorEventListener` **注册成功、日志无报错、回调永不触发**（`lua/main.lua:2919`、`4149`）。
   > 这是本工程**花过一整轮**才定位的坑：注册成功 ≠ 能收到事件。
3. **热区必须是卡片的同级兄弟，不能是子节点**：image 不接收指针也不下钻子级，把 cursor 塞进卡片 image 下面永远收不到事件。
4. **cursor 实例没有 `imageColor` 字段**（实测报错 `cannot set imageColor, no such field`）→ 三态只能用**字号/文字色/宝珠直径**表达。
5. **注册事件要双形态**：真机要 `Enum.CursorEventType.*` 枚举，模拟器接受字符串 → 先试枚举、失败回落字符串，两条都失败要打日志（`cursor listen fail <kind> :: <err>`）。

**三态设计（已验证的手感）**：
| 态 | 视觉 | 音 |
|---|---|---|
| 常态 | 基准字号/色 | — |
| 悬浮 | 提亮 + 放大一档（如标题 38→40） | 短音 **84ms**（防快速扫过多区时的连续噪） |
| 按下 | 下沉 1~3px + 加深（如 38→42 + 深色） | **151ms** |
| 离开 | 恢复 | **静音**（否则来回扫会双倍噪声） |

**两个易漏的细节**：
- **已有选中项时 hover 不要抢样式**，否则鼠标划过别的卡会把"已选高亮"擦掉。
- **反向判据**：只跑键盘用例**测不出**鼠标热区——必须有一条 `kind:"click"` / pointer 事件的用例，否则漏 `showCursor` 也不会红。

**结算三选项的主次 + 三态**（`18-evidence.md` E4）：
- 主（再来一局）= 模式色**实心胶囊** + 金环 + 25 号白字
- 次（回主页）= 白胶囊金边
- 弱（明细）= 纯文字次色
- 悬停**加深 13%**、按下**加深 26% + 下沉 3px**。
  > **注意：提亮是错的**——白字压在提亮的绿上对比会垮掉（第一版出图实测后改的）。

**判据**：
- 每个"看起来像按钮"的东西都必须是真热区（标题四模式、结算三键、帮助 H）。
- 出图三张（常态/悬浮/按下）**可区分**才算过；只有一个命中判定不算。
- 热区尺寸 ≥ 视觉尺寸（否则"看得到点不到"）。

## 5. 事件路由（多盘/多人的生命线）

**先定义清楚这两个函数**（零上下文实测指出：全技能出现多次但没给签名）：
```lua
-- routePlayer(触发键名) -> 该键所属的目标实例（G[1] 或 G[2]）
--   规则：按 MODE + 键组判定。单盘模式恒返回 G[1]；双屏模式按该键属于 P1 组还是 P2 组。
-- P2_KEYS = { [键名] = true, … }   -- P2 的键集合（方向键 / X / F 之类），集中一张表
-- coopAllowed(keyName, action) -> bool   -- coop 下越权键过滤（旋转手 vs 行动手）
```
**铁律**：**任何事件回调的第一行必须是 `g = routePlayer(key)`（或等价的目标实例解析），然后才做事。**

> 更稳的写法是**用局部变量**而不是改写全局游标：
> `local inst = routePlayer(key); if inst.das.dir == -1 then inst.das.dir = 0 end`
> （改写 `g` 也成立，但会把全局游标留在回调里的实例上，别的作用域可能受影响。）

```lua
-- main.lua:4403 附近的 act() 思路
local function act(keyName, fn)
  return function()
    g = routePlayer(keyName)     -- 按模式/键组解析目标实例
    fn()
  end
end
```

**为什么**：模块级 `g` 是"当前实例"的游标，任何地方都可能改它。双屏模式下 `OnUpdate` 每帧循环两个实例，**帧末 `g` 停在最后一个实例上**——此时任何用 `g` 的回调都会操作**错误的那一盘**。
> 这就是 DAS 的真因，也是"coop 的 P2 键全算 p1ready"（用例 27 抓到）与"`G[2]` 的 `flashT` nil 每帧炸断 OnUpdate"（v2.1 修）的同族根因。

**跨实例交互**（如给对手送垃圾行）：
```
保存当前 g → 切到目标实例 → 操作 → 还原 g
```

**判据**：每个模式下都有一条"事件作用于正确实例"的用例（双屏最容易漏）。

## 6. 模拟器试玩页按键「五重门」（做 headless 实验前必读）

网页试玩页的按键要被转发到游戏，必须同时满足：
1. `keydown` 绑在 **canvas** 上（不是 document）→ 没点过画布/没 focus，按键进不来；
2. 必须等**首个带 view 的快照**应用完成（只有"会话 running"不够）；
3. **epoch 串行链**：任何 device/view 切换都会让排队中的按键**静默丢弃**；
4. 合成键过滤（输入法/表单内产生的键被丢弃）；
5. 键必须在映射表内。

**代价**：不知道这五条 → headless 实验得出「按键转发 POST 零条 = 上游有缺陷」的**错误结论**，白写了一轮"上游报告"。
**判据**：headless 实验必须加**阳性对照**（一个已知会成功的键在同样条件下能成功），否则结论无效。

**真实浏览器里的按键行为**只能靠**开日志面板复现**来定案：
> 「试玩时开着「客户端脚本日志」面板，进游戏后按几下左/右，把带 `move`/`das` 的行发我——一条序列就能定案。」
> 这是本次**唯一**有效的取证请求方式（前面两次"你能再试一次吗"都没有得到有效信息）。

## 7. 音效与输入的耦合

- **帧闸**：连续动作（连移/抖动）不要每帧播音，用最小间隔（连移 60~80ms）。
- **强制音**（`force`）：同一帧内可能和别的音撞车时，锁定音/消行音要能打断（`sfx(SFX.lock, true)`）。
- **hover 音不能省 Exit 静音**（见 §4）。
- **浏览器禁止自动播放**：网页首次交互前音效不响 → 视觉上补一个可感知反馈（如 HUD 分数弹跳），并把"先点一下画面"写进给用户的说明。

## 8. 交付前自检（复制粘贴）

```bash
grep -n "KEYMAP" lua/tetris/config.lua            # 键位表在不在
grep -n "das stop reason=timeout" lua/main.lua    # 时间上限兜底在不在
grep -n "routePlayer" lua/main.lua                # Up/事件回调有没有路由
grep -n "showCursor" lua/main.lua                 # cursor 热区的父链门控
grep -n "AddCursorEventListener" lua/main.lua     # 热区注册
node qxqy/runner.mjs 18 das keymap                # 相关用例（选择性跑）
```
**必答**：
0. AI 对弈的准备态是否把所有真人玩法键归为 P1？不能直接复用双人 P2 键组。
   真实回归须分别按方向键、WASD、空格进入倒计时，并保留 PVP/合作双方准备门禁；
   `playerOf(key)` 只判键组，准备席位还要结合模式。准备 UI/倒计时转换共用一个入口。
1. 每个键位都有用例吗？
2. 按住类操作有时间上限吗？
3. 多盘模式下每个事件回调都路由了吗？
4. 每个"像按钮"的东西三态可区分吗（出图三张）？
