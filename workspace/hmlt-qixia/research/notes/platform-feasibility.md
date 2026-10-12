# 横版动作射击 · 千星 2D UI+Lua 沙箱平台可行性裁决

> 任务：设计文档前的硬性前置，回答四个裁决问题。
> 证据等级标注：`官方`＝act.mihoyo.com 官方文档原文；`真机`＝observed-contract 真机探针回传；`模拟器`＝miliastra-beyond-simulator 源码/实测；`社区`＝B站案例（标题级，未亲测）；`未证实`＝查遍下述来源未见。
> 主要来源清单：
> - 官方《客户端控件API文档》全文镜像：`research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md`（11359 行，源 act.mihoyo.com wiki mhtakr07vej4；下引行号=此镜像）
> - 结构化 API 面清单：`research/a2-lua-gen/api面清单.md`（2026-09-30，从上镜像提取+模拟器 125 项实测交叉）
> - 模拟器源码：`/home/h/miliastra-beyond-simulator/client/lua-runtime/src/`（enums.js / runtime.js / lua-bridge.js）
> - 真机契约：`/home/h/miliastra-beyond-simulator/client/lua-runtime/docs/observed-contract.md`（21 条，三轮真机探针 7.0.50）
> - 官方指南《编辑项范围限制》：act.mihoyo.com/ys/ugc/tutorial/detail/mh74ae9fsg8i（经 miliastra-knowledge KB 取全文，2026-10-12）
> - 插件文档：`/home/h/.dsh/profiles/web/node_modules/dsh-plugin-beyond-simulator/dsh-plugin/skill.md`

---

## Q1 键盘输入面

**结论：键盘方案成立（PC）。真实客户端 Lua 可监听 58 个键位 ×Down/Up 共 116 种键盘事件，WASD/方向键/空格/鼠标左右键全部在内；没有通用 OnKeyDown/GetKeyState 轮询 API，输入是纯事件驱动（控件级监听器），按键状态需自行维护。**

### 键位全集（官方第 26 章按键输入，:7085 起，表带「默认物理键」列）

- `Enum.KeyboardKeyCode` = CraftspersonKey1–43（43 个「奇匠按键」）+ 15 个具名键 + None；`Enum.KeyEventType` = Keyboard/Controller × 全部键 × Down/Up 全积。
- 奇匠键默认物理键映射（官方表逐行）：
  - Key1–10 = 数字键 1 2 3 4 5 6 7 8 9 0
  - Key11–22 = U Z Y G H I O P J K L V
  - Key23–28 = F5 F6 F7 F8 F9 F10
  - Key29–35 = \` - = [ , . /
  - **Key36–39 = ↑ ↓ ← →（方向键可用）**
  - Key40 = 右Ctrl，Key41 = 右Shift，Key42 = Backspace，Key43 = CapsLock
- 具名键默认物理键（官方表）：
  - **MoveForwardKey=W / MoveBackwardKey=S / MoveLeftKey=A / MoveRightKey=D（WASD 可用）**
  - JumpKey=Space、SprintKey=鼠标右键、NormalAttackKey=鼠标左键、InteractKey=F、DropKey=X
  - CharacterSkill1–4Key = E Q R T、OpenShortcutWheelKey=Tab、SwitchToWalkOrRunKey=左Ctrl
- 具名键**有对应事件类型**，可直听：官方 KeyEventType 表含 `KeyboardMoveForwardKeyDown`(:9300)、`KeyboardSprintKeyDown`(:9385)、`KeyboardJumpKeyDown`(:9402)、`KeyboardNormalAttackKeyDown`(:9470)、Up 变体(:10286)、手柄变体(:10779 起)。模拟器 enums.js:58-96 `keyEvents()` 同覆盖：键盘 (43+15)×2、手柄 (14+10)×2。
- 「默认物理键」措辞暗示键位可被玩家改绑（监听写 `Enum.KeyEventType.XXX` 跟随改键）——改键机制本身未见官方专文，未证实细节。

### 监听 API（控件方法，非全局）

```
control:AddKeyEventListener(eventType, callback)   -- callback 返回 boolean 标记已处理
control:RemoveKeyEventListener(eventType, callback) -- 须保留同一回调引用
control:RemoveKeyEventListeners(eventType)
control:RemoveAllKeyEventListeners()
```

官方原文（:5095-5103）：「注册指定按键事件监听；回调返回 boolean；移除单个监听时需保留该回调引用。**同一个容器中，如果交互按键事件被 lua 回调响应，并标记为已处理，容器内的其他按键不会也响应此次按键事件**」（= return true 可吞键）。

### 无轮询 API（查证为否定结论）

- game 全局 26 函数（官方 :945-1323，api面清单 §五逐条）中**无 GetKeyState/IsKeyDown/OnKeyDown** 类 API；输入面只有：键监听（上述）、光标 `game.GetCursorUIPos()→x,y`、`CursorEventArea/PresetButton:AddCursorEventListener`、手柄 `game.GetControllerLeftStickAxis()/GetControllerRightStickAxis()→h,v` 与导航事件。
- 派发顺序（模拟器契约，lua-runtime README）：按键按当前同级显示层序**从上到下**派发；Lua 改 sibling 顺序后下次按键用新顺序（新版真机待验）。
- 回调时机（真机 KEYRD v1，observed-contract #21，2026-10-01 PC）：按键/点击回调都在**第 N 帧 OnUpdate 结束后、第 N+1 帧之前**执行，回调内写位置/文本/启 Tween 当帧生效。

### 模拟器测试通道限制（非客户端 API 面）

- 网页试玩层只转发数字键：`studio/play/browser-session.js:6-10` `keyEventName()` 仅 Digit1-9 → `KeyboardCraftspersonKeyN{Down,Up}`，其余键名返回空串——**手工浏览器试玩只能测数字键**。
- MCP 通道不受此限：`qxqy_studio_play {action:"key"}` 按脚本注册监听的**任意键名**注入（插件 skill.md 工具速查），自动化用例可覆盖 WASD/空格/方向键全套。
- 手机端（Device 枚举 KeyboardAndMouse/Mobile/Controller/MobileController）无物理键盘：触屏走光标事件（CursorEventData `GetUIPos/GetPressUIPos/GetUIPosDelta→x,y`，画布左下原点）。键盘 58 键是 PC 专属能力。

---

## Q2 每帧驱动机制

**结论：有每帧回调 OnUpdate(dt)/OnLevelUpdate(dt)，且必须显式 EnableUpdate(true)（模拟器默认关，官方未写默认值）；没有 setTimeout/setInterval 等定时器；Tween 体系完整（31 缓动/循环/时间线），适合表现层动效，gameplay 移动建议 OnUpdate 自算。**

### 每帧回调（官方 :381-459）

| 函数 | 官方语义 |
|---|---|
| `OnUpdate(dt)` | 「脚本逐帧更新时调用，**不受关卡时停影响**」(:441) |
| `OnLevelUpdate(dt)` | 「关卡逐帧更新时调用，**受关卡时停影响**」(:454) |
| `script:EnableUpdate(enabled)` | 「控制当前脚本的逐帧更新；false 关闭，true 重新启用」(:484/:492) |

- **默认值是文档缺口**：官方未写 EnableUpdate 默认态；模拟器默认关闭（runtime.js:1163 `updateEnabled:false`，须 OnInit 显式开启；api面清单 §一实测注）。真机默认值**未证实**——工程上 OnInit 必写 `script:EnableUpdate(true)` 消除歧义。
- 帧率数字官方未给（未证实具体 Hz）；模拟器固定 1/60 步进，真机为变步长 dt（D94 真机 Tween 探针观察）。dt 参数官方只标 `number`，单位按模拟器契约为秒（真机单位未单独证实，属低风险假设）。

### 定时器：没有（查证为否定结论）

- 客户端 Lua API 全清单（生命周期 7 / 全局 5 / Script 7 / game 26 / Tween / TweenSequence / ServerSignal / 控件类）**无 setTimeout/setInterval 等价物**；官方 API 文档全文 grep「定时/setTimeout/setInterval/Timer」零命中（仅 TweenSequence 的 AppendInterval/InsertCallback 两处时间点语义，:1612/:1625）。
- 可用的三种定时手段：
  1. **OnUpdate 内自累计 dt**（gameplay 主选）；
  2. `TweenSequence:AppendInterval(sec)` / `AppendCallback(fn)` / `Insert(time, tween)` / `InsertCallback(time, fn)`（时间线回调）；
  3. 服务端节点图定时器（官方《定时器》文档 mhufb90zbnts：定时器序列最小间隔 **0.03 秒**、全局计时器上限 50）——但那是服务端玩法侧，客户端脚本不经此路。
- 负载限制：客户端脚本无官方逐帧负载红线数字（未证实）；参照官方 FAQ（`docs/ui-tutorial/official-guide-faq.md`:289）服务端大计算节点图有执行次数上限并会提示——性能预算思维同源。OnUpdate 默认关这一设计本身即是官方的高频回调控制暗示。

### Tween 能力边界（官方 :1324-1743 + 真机探针）

- 创建：`game.Tween(object, tweenDataTable, duration)`——data 表的键=**控件字段名**（如 `anchoredPositionX`、`fontColor`），非通用 x/y。
- Tween 方法链：`SetEase(easeType)` / `SetRelative(bool)`（false 绝对=true 增量）/ `Play/Pause/Resume/Restart/Complete/Kill(complete)/SetOnComplete/SetOnStepComplete/SetLoops(times)`。
- `Enum.EaseType` 官方表 31 项（:2112-2530 逐行数得，Linear→InOutBounce），与模拟器 enums.js 一致。
- TweenSequence：`Append/AppendInterval/AppendCallback/Join/Insert/InsertCallback` + 播放控制族；**SetLoops 负数=无限循环**（:1743 附近原文）。
- 真机语义（observed-contract + 2026-10-03 对齐轮）：
  - 循环到达终点帧显示终值并触发步骤完成，下一帧从头**丢弃溢出**（真机变步长 dt 的相位差）——精确运动学勿依赖循环 Tween；
  - 播放中再 `Play()` 无效果；`Kill(false)` 后 `Play()` 无效果；时长 0 的 Tween 下一次更新直接到终值；
  - 旋转字段读写走 Z-X-Y 四元数往返，读回恒为 [0,360) 浮点（写 -116 读回 244）；
  - 颜色字段（fontColor/bgColor/outlineColor/imageColor）可 lerp；`fontSize` 赋值只收整数。
- Tween 并发数量上限：未见任何官方数字（未证实）。

---

## Q3 动态实体能力

**结论：三项全能——运行时实例化（按模板索引）、SetAnchoredPosition 逐帧移动、DestroyClientUIControl 销毁。官方预算：单屏可显示控件上限 10000、单控件组内 1000、自定义控件模板 2000。**

### 实例化/销毁/查找（官方 game 面，:945-1323）

```
game.InstantiateClientUIControl(controlPrefabIndex:integer, parent) → ClientUIBaseControl
game.DestroyClientUIControl(control)
game.GetClientUIControl(controlId:integer)
game.FindClientUIRoot(nodeName:string) / game.GetClientUIRoots() → table
```

- 模板=「UI控件-客户端」资产（插件 skill.md：可被 Lua 实例化的模板）；首参是**模板索引**（GIA 导入真机可能重映射，走 controlGuidChanges 同步工作流——插件 skill.md §5）。
- **时机限制（真机）**：Instantiate 仅在 OnStart 及之后有效，OnInit/OnDestroy 中调用返回 nil（observed-contract #2 真机探针）。动态实例默认置于同父兄弟最上。
- 移动/变换（官方基类 14 个 Get/Set 对）：`Get/SetAnchoredPosition(x,y)`（无父=画布左下原点，有父=相对父中心偏移；千星 Y 轴向上）、`Get/SetSizeDelta`、`Get/SetAnchorMin/Max`、`Get/SetPivot`、`Get/SetLocalScale(x,y,z)`、`Get/SetLocalRotation(x,y,z)`。
- 显隐两档：`SetActive(false)`=不可见**且该控件脚本逻辑停止**；`SetVisible(false)`=只改可见（脚本仍跑）。层级：`SetSiblingIndex/SetAsFirstSibling/SetAsLastSibling`。
- 模板引用控件（Reference 类）字段 `referencedPrefabIndex:integer`——模板嵌套模板可行。

### 官方数量预算（《编辑项范围限制》mh74ae9fsg8i，逐行引用）

| 项 | 上限 |
|---|---|
| **单次玩家屏幕内可显示的界面控件最大数量** | **10000** |
| **单个界面控件组内界面控件最大数量** | **1000** |
| **自定义控件模板最大数量** | **2000** |
| 界面布局最大数量 | 100 |
| （对照）运行时实体最大数量 | 1000 |
| （对照）字符串最大长度 | 1000 |

### 性能实证与红线

- 客户端控件**逐帧行为无官方红线数字**（未证实）；模拟器也未内置预算告警。
- 社区量级参照（`research/千星知识图谱/learn-lua71/知识提炼.md` §九，标题级未亲测）：「一万控件硬算光追 25帧」（BV1SWat6GEtm，柚子漂流中）——万控件极限压力下仍可跑 25fps；「DOOM 翻译成 Lua」（BV1Jraq6QEgE）——逐帧 raycast 级负载可移植。
- 移动端更紧：官方 FAQ（official-guide-faq.md:164）「移动端的性能优化逻辑导致，同时播放的音效数量有上限」——手机预算需另行保守。

---

## Q4 碰撞与数值

**结论：无内置矩形相交/碰撞 API（碰撞/命中组件是 3D 实体侧能力，不在客户端 Lua 控件面），碰撞检测须手写 AABB；math 库≈Lua 5.3 标准库全量+官方扩展 isnan/isinf，浮点运算无碍。**

### 碰撞 API：没有（查证为否定结论）

- 官方 API 全清单（game 26 + ClientUIBaseControl 29 方法 + 11 派生类 + Color 4 + EnumItem 3，api面清单 §五/§十一逐条）无任何相交/命中/距离类 API。
- 官方《编辑项范围限制》表中「碰撞触发器组件/命中检测组件/额外碰撞」均为**3D 实体组件**（触发器≤5/实体、命中实体≤1100 等），属服务端玩法侧，不是客户端 Lua 可调面。
- 结论：横版射击的子弹×敌人碰撞在 OnUpdate 里手写 AABB/圆形相交，纯 math 运算。

### math 库与数值（真机契约 #17/#18 + 官方 :494-660）

- 官方文档明确的全局扩展：`math.isnan(n):boolean`、`math.isinf(n):boolean`。
- 真机探针证实保留：`math.modf`、`math.ult`（正式服探针，observed-contract #17）；模拟器 fengari 提供完整 Lua 5.3 math 库且 lua-bridge.js:337-358 **只增补不裁剪**（sin/cos/sqrt/abs/floor/ceil/max/min/random/huge/pi/fmod 等标准面在）。
- 沙箱裁剪面（#18，真机+模拟器一致）：`load/loadfile/dofile/package/coroutine/collectgarbage`、`string.dump/pack/unpack` 裁掉；保留 `utf8`、`os.time/date/clock/difftime`、`debug.traceback`。**fengari 整数 32 位是模拟器底层限制，不能当客户端整数位宽结论**（真机整数位宽未证实——游戏数值用 double 语义运算即可规避）。
- 数值精度参照：服务端 float 自定义变量设置精度 0.0001（《编辑项范围限制》表尾注「变化低于该精度可能不会生效」——服务端变量侧限制；客户端控件字段读写无此条）。
- integer 标注字段（fontSize/Id/imageId 等）读回整数、赋值只收整数（真机契约/D94）；`number` 字段读回浮点。

---

## 对横版动作射击的裁决建议

1. **输入：键盘优先（PC），具名键位方案，自维护按键状态表。**
   - 移动 WASD＝`KeyboardMoveForward/Backward/Left/RightKeyDown/Up`；跳＝`KeyboardJumpKeyDown`（Space）；开火＝`KeyboardNormalAttackKeyDown`（鼠标左键——官方映射即鼠标左键，键鼠通吃）；技能/道具＝`KeyboardCharacterSkill1-4KeyDown`（Q/E/R/T）。写 Enum 键名而非物理键，天然跟随玩家改键。
   - 事件驱动补轮询缺口：Down 置 true / Up 置 false 维护 `pressed` 表，OnUpdate 查表推进——因为没有 GetKeyState。
   - `return true` 吞键慎用（同容器其他控件收不到该键）；监听器挂在少量常驻控件上、回调用稳定引用（Remove 须同引用）。
   - **手机端必须做光标方案分支**：`game.GetDevice()` 判 Mobile → 虚拟摇杆/按键（CursorEventArea Down/Up + `CursorEventData:GetUIPosDelta()`）；横版动作射击 P0 至少 PC 键盘+手机触屏双方案（模拟器 `start {canvasId}` 可分别回归）。
   - 测试通道注意：浏览器手工试玩只转发数字键 1-9（browser-session.js:6-10）；WASD 全套自动化走 MCP `key` 动作。
2. **帧驱动：OnUpdate(dt) 单一主循环 + EnableUpdate(true) 必写。**
   - 子弹飞行/敌人移动/碰撞全在 OnUpdate 里按 dt 推进（真机变步长，禁用「每帧固定距离」假设）；时停要影响 gameplay 就用 OnLevelUpdate（受时停），UI 呼吸动效用 OnUpdate。
   - 冷却/波次/刷怪计时＝OnUpdate 累计 dt（无定时器 API）。
   - Tween 只用于表现层（受击闪白、死亡淡出、UI 进出场），循环 Tween 有「丢弃溢出」语义，勿用于 gameplay 运动学；Tween 目标字段名=控件属性名（anchoredPositionX）。
   - Instantiate 只能在 OnStart 及之后（真机），所以实体池在 OnStart 预建。
3. **实体预算：官方硬顶 10000/屏，工程建议活动实体 ≤200–300 同屏。**
   - 依据：官方单屏 10000 上限 vs 社区「万控件硬算光追仅 25fps」——万级是压力测试下限不是设计线；子弹+敌人+粒子特效合计 ≤200–300 动态实例，配合池化（OnStart 预建、SetActive 开关复用——注意 SetActive(false) 会停挂在该控件上的脚本，玩法逻辑全部集中在管理器脚本，实体控件保持无脚本）。
   - 单控件组 1000 上限：子弹/敌人分组建组，静态地形背景走模板静态摆放不占动态预算。
   - 手机端预算再砍半（移动端资源更紧，官方音效并发上限为证）。
4. **碰撞：手写 AABB，预算内免空间分箱。**
   - 中心点+半宽比较（`math.abs(ax-bx) < wa+wb` 型），200 子弹×30 敌人＝6000 比较/帧，远低于社区实证的极限负载；超标再上网格分箱。
   - 数值一律 double 语义，避免依赖整数位宽（真机位宽未证实）；fontSize 等整数字段取整写。

**遗留未证实项（设计时按保守假设处理）**：EnableUpdate 真机默认值；官方帧率数字；客户端脚本逐帧负载红线；Tween 并发上限；玩家改键机制专文；真机 Lua 整数位宽。以上均已在各节标注，真机试玩阶段（步骤 7）逐项回收。
