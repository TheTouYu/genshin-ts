# 客户端 Lua API 面清单（结构化）

> 状态：**当前实现**（2026-09-30 建）｜唯一事实源：官方《客户端控件API文档》全文镜像 `../千星知识图谱/learn-lua71/官方API文档-客户端控件.md`（11359 行，源 act.mihoyo.com wiki `mhtakr07vej4`）
> 用途：A2 预研（TS→Lua 生成器）的 TS 类型面设计与转换器范围依据；`issues/01-api-surface.md` 主交付物
> 提取方法：折叠空行+签名模式脚本提取（167 条）+ 关键区段人工核读；行号=镜像行号
> 官方章节骨架：2 生命周期 / 3 全局API / 4 Color / 5 Script / 6 game / 7 Tween / 8 TweenSequence / 9 ServerSignal / 10 EnumItem / 11 枚举系统(25) / 12 继承关系 / 13-25 控件类 / 26 按键输入

## 一、脚本生命周期（7 函数，:381-459）

| 函数 | 参数 | 官方语义 |
|---|---|---|
| `OnInit()` | — | 脚本初始化时调用 |
| `OnStart()` | — | 脚本启动时调用 |
| `OnEnable()` | — | 脚本启用时调用 |
| `OnDisable()` | — | 脚本停用时调用 |
| `OnUpdate(dt)` | `dt: number` | **逐帧更新，不受关卡时停影响** |
| `OnLevelUpdate(dt)` | `dt: number` | **关卡逐帧更新，受关卡时停影响**（与 OnUpdate 的区别是官方语义，模拟器契约亦区分） |
| `OnDestroy()` | — | 脚本销毁时调用 |

`script:EnableUpdate(enabled: boolean)`（:484）：控制当前脚本 Tick 更新，false 关闭 true 重开。

## 二、全局 API（:494-660）

| 函数 | 返回 | 语义 |
|---|---|---|
| `typeof(value)` | string | 运行时类型名称，识别宿主对象 |
| `print(...)` | — | 普通级别日志，不阻断 |
| `printerr(...)` | — | 错误级别日志，不抛 Lua 错误不阻断 |
| `math.isnan(n)` | boolean | NaN 判断（数值校验） |
| `math.isinf(n)` | boolean | 正负无穷判断 |

全局变量：`script: Script`（当前脚本）、`Enum: Enum`（枚举表）。

## 三、Color（:661-736）

| API | 返回 | 语义 |
|---|---|---|
| `Color(r,g,b,a?)` | ColorValue | 0-255 RGBA 构造，a 省略/nil=255 |
| `Color.FromRGB(r,g,b)` | ColorValue | 0-255 RGB |
| `Color.FromRGBA(r,g,b,a?)` | ColorValue | 同上带 alpha |
| `Color.ToRGBA(colorValue)` | r,g,b,a | 拆分为 0-255 四值 |

## 四、Script（:737-944）

字段（5，:741-841）：`alive:boolean 只读` / `scriptMappingId:integer 只读` / `object:any 只读`（宿主对象）/ `path:string 只读` / `enabled:boolean 读写`。

方法（6）：
| 方法 | 返回 | 语义 |
|---|---|---|
| `script:GetParam(paramName: string)` | any | 读脚本内参数（编辑器配置的 Param） |
| `script:Invoke(funcName: string, ...: any)` | — | 调用当前脚本环境中名称为 funcName 的函数（跨脚本交互通道） |
| `script:EnableUpdate(enabled: boolean)` | — | Tick 开关 |
| `script:RegisterServerSignalHandler(signalName, callback)` | — | 注册服务器信号监听；回调 `fun(signalName, signalParams: any[])` |
| `script:UnregisterServerSignalHandler(signalName)` | — | 移除监听 |
| `script:RegisterCustomVariableChangedHandler(entityType, customVariableName, callback)` | — | 监听全局自定义变量变化；**回调只给类型+名，当前值须另读 game.GetGlobalCustomVariableValue** |
| `script:UnregisterCustomVariableChangedHandler(...)` | — | 移除监听 |

## 五、game.*（20 函数，:945-1323）

**UI 与层级（7）**：`PrintClientUITree()`（控件树写日志）/ `InstantiateClientUIControl(controlPrefabIndex:integer, parent)→ClientUIBaseControl`（按模板索引实例化）/ `DestroyClientUIControl(control)` / `GetClientUIControl(controlId:integer)`（按运行时ID）/ `FindClientUIRoot(nodeName:string)` / `GetClientUIRoots()→ClientUIBaseControl[]`（画布默认容器）/ `GetUICanvasSize()→x,y`。

**输入与聚焦（6）**：`GetCursorUIPos()→x,y` / `GetDevice()→Device` / `SetControllerFocus(control)` / `GetControllerFocus()` / `GetControllerLeftStickAxis()→h,v` / `GetControllerRightStickAxis()→h,v`。

**补间/信号/变量（4）**：`Tween(object:any, tweenDataTable:table, duration:number)→Tween`（tweenable 字段名为键）/ `TweenSequence()→TweenSequence` / `ServerSignal(signalName:string)→ServerSignal` / `GetGlobalCustomVariableValue(entityType, customVariableName:string)→any`（支持列表/字典/结构体复杂变量）。

**关卡/音效/本地化（7）**：`PauseLevelTime(pause:boolean)`（**单人模式**；不暂停脚本自身）/ `IsLevelTimePaused()→boolean` / `PlayAudio2D(audioId:integer)→integer`（返回实例ID）/ `StopAudio(audioInstanceId)` / `IsAudioAlive(audioInstanceId)→boolean` / `GetLanguageType()→LanguageType` / `GetStageMode()→StageMode` / `IsTestPlay()→boolean` / `GetText(textMapId:string)→string`（本地化文本）。

## 六、Tween（:1324-1507）

创建：`game.Tween(object, tweenDataTable, duration)`。

方法（13，链式）：`SetEase(easeType:EaseType)→Tween` / `SetRelative(relative:boolean)→Tween`（false 绝对 true 增量）/ `Play()→Tween` / `Pause()` / `Resume()` / `Restart()` / `Complete()`（立即到终态）/ `Kill(complete:boolean)` / `SetOnComplete(cb:fun())` / `SetOnStepComplete(cb:fun())`（步骤完成回调）/ `SetLoops(times:integer)`（**循环**）。

## 七、TweenSequence（:1508-1743）

创建：`game.TweenSequence()`。

方法（13）：`Append(tween)→TweenSequence` / `AppendInterval(interval:number)` / `AppendCallback(cb)` / `Join(tween)`（与队尾同时播放，最晚结束者为准）/ `Insert(time, tween)` / `InsertCallback(time, cb)` / `Play()→自身` / `Pause()` / `Resume()` / `Restart()` / `Complete()` / `Kill(complete)` / `SetOnComplete(cb)`。

## 八、ServerSignal（:1744-2044）

创建：`game.ServerSignal(signalName: string)`（**约定名称**——须服务器侧已注册同名自定义信号）。

方法（20，全部经验证在官方原文 :1773-2044）：通用 `AddParam(paramType:ParamType, paramValue:any)` / `SendSignal()`；类型快捷族 `AddInt` `AddIntList` `AddFloat` `AddFloatList` `AddString` `AddStringList` `AddVector3(vector3Value:table)` `AddVector3List(table[])` `AddBool(boolean)` `AddBoolList` `AddGuid(integer)` `AddGuidList` `AddEntity(integer)` `AddEntityList` `AddPrefabId(integer)` `AddPrefabIdList` `AddConfigId(integer)` `AddConfigIdList`。
→ **9 种参数类型 × 标量/列表两形态**——与我方服务端信号 wire 的参数类型族对照（02 票任务）。

## 九、EnumItem（:2045-2110）

字段（3，全只读）：`Name:string` / `FullName:string` / `EnumType:string`。

## 十、枚举系统（25 个，:2112-4298）

`EaseType`（缓动，Tween 用）、`CustomVariableEntityType`、`Device`、`StageMode`、`LanguageType`、`ParamType`、`CursorEventType`、`ScrollDirection`、`ScrollLayoutConstraint`、`ScrollAlignType`、`ControllerNavigationDir`、`ControllerNavigationEventType`、`ControllerNavigationMode`、`TextHorizontalAlignment`、`TextVerticalAlignment`、`ImageType`、`ImageSource`、`ImageFillType`、`ImageFillHorizontalType`、`ImageFillVerticalType`、`ImageFillRadial`、`ImageFillRadialType`、`ImageMaskSoftEdgeMode`、`UIAnimationLayer`、`ControllerKeyCode`。
（`KeyboardKeyCode` 在 :7085 第 26 章，键值大表约 4300 行，规模级枚举）

## 十一、控件类（:4299-7084）

**继承关系（官方原文）**：所有具体控件继承 `ClientUIBaseControl`。11 派生类：Image图片 / TextBox文本框 / TextWindow文本视窗 / PresetButton预设按钮 / CursorEventArea光标检测区域 / GridScroller网格视窗 / KeyHint按键提示 / Animation界面动效 / FullscreenAnimation全屏动效 / Container容器节点 / Reference模板引用控件。

**ClientUIBaseControl 基类（29 方法）**：
- 层级与可见性（8）：`GetChildren()→[]` / `GetChild(name)` / `FindChild(path)` / `SetActive(active)`（**false=不可见+脚本逻辑停止**）/ `SetVisible(visible)`（只改可见）/ `GetSiblingIndex()` / `SetSiblingIndex(index)→boolean` / `SetAsFirstSibling()` / `SetAsLastSibling()`
- 布局与变换（14，x,y / x,y,z 模式）：`Get/SetAnchoredPosition`（无父=画布左下原点；有父=与父中心相对偏移）/ `Get/SetSizeDelta` / `Get/SetAnchorMin` / `Get/SetAnchorMax` / `Get/SetPivot` / `Get/SetLocalScale` / `Get/SetLocalRotation`
- 脚本访问（3）：`GetScriptByPath(scriptPath)→Script` / `GetScript(scriptMappingId)→Script` / `GetScripts()→Script[]`
- 按键事件（4）：`AddKeyEventListener(eventType, callback)`（回调返回 boolean 标记已处理；同容器内已处理则其他按键不响应）/ `RemoveKeyEventListener(eventType, callback)`（**须同一引用**）/ `RemoveKeyEventListeners(eventType)` / `RemoveAllKeyEventListeners()`
- 手柄导航（4+2）：`Add/Remove/RemoveAll NavigationEventListener` + `SetControllerNavigation(dir, mode, target)` / `GetControllerNavigation(dir)→mode,target`

**派生类专有 API**：
- Image（8 方法）：`SetImage(imageSource, imageId)` / `SetSoftEdgeWidth(wX,wY)` / `SetFillUnused` / `SetFillHorizontal/Vertical(type, fillAmount)` / `SetFillRadial90/180/360(type, fillAmount)`（进度 fillAmount）
- TextBox 字段（Tweenable 标注）：`text:string` / `fontSize:integer★` / `fontColor:ColorValue★` / `bgColor:ColorValue★` / `enableOutline:boolean` / 描边色★ / 字号自适应最小字号★ 等
- TextWindow 字段：同族文本字段（含 Tweenable）
- PresetButton（5）：`Add/Remove/RemoveAll CursorEventListener(eventType, callback)`（回调收 CursorEventData）/ `SimulateCursorClick()`（按序模拟 Down/Up/Click）
- CursorEventArea（5）：同 PresetButton 光标事件族
- GridScroller（6）：`RefreshItems(itemCount, refreshCallback: fun(control, index))`（逐项回调）/ `GetItemIndex(control)→integer` / `GetItemSize()→x,y` / `GetItemSpacing()→x,y` / `GetPadding()→t,b,l,r` / `ScrollToItemAt(index, scrollAlignType)` / `GetContentLength()→number`
- KeyHint：字段型（少量）
- Animation（2）：`PlayAnimation()` / `StopAnimation()`（界面动效）
- FullscreenAnimation 字段：`animationId:integer` / `playSoundEffect:boolean`
- Container 字段：`isolateNavigation:boolean` / `disableKeyEventPassthrough:boolean` / `disableCursorEventPassthrough:boolean` / `showCursor:boolean`
- Reference 字段：`referencedPrefabIndex:integer`

**CursorEventData**（:6364-6464，光标回调数据类）：字段 `dragging:boolean 只读`（是否拖拽）/ `touchId:integer 只读`（触点ID）；方法 `GetUIPos()→x,y`（画布左下原点）/ `GetPressUIPos()→x,y`（按下时坐标）/ `GetUIPosDelta()→x,y`（位移）。

**Tween/TweenSequence 补充语义**：`TweenSequence:SetLoops(times)` **负数=无限循环**（:1743 附近原文）；TweenSequence 亦有 `SetOnStepComplete`/`SetLoops`。

## 十二、与 miliastra-lua-types 对照（2026-09-30，v 修订 2026-09-24）

对照对象：`github.com/DreamedWorker/miliastra-lua-types`（`mihoyo_client_ui_api.d.lua`，1425 行 / 161 函数定义 / LuaLS `---@meta` 格式），来源**同一官方文档** `mhtakr07vej4`。

| 对照维度 | 结果 |
|---|---|
| 文档有/类型库无 | **未发现**（game 26 / Script 7 / 控件类方法全部覆盖，含我首轮提取截断遗漏的 ServerSignal 20 方法与 CursorEventData 3 方法） |
| 类型库有/文档无 | **未发现**（多出的方法经验证均在官方原文） |
| 签名不一致 | 未逐参比对（本轮只做名称集对照）；类型库 2026-09-24 修订说明自称「修正只读字段写法、补类方法值绑定」→ 晚于我方 09-29 镜像前的文档状态，可信 |
| 枚举形态 | 类型库把每个枚举做成 `EnumXxx : EnumItem` class + 成员字段（如 EaseType 27 个缓动成员）——**TS 侧可直接套用此结构**（enum + Namespace） |

**结论**：miliastra-lua-types 与官方文档**零名称冲突**，可当 A2 类型面的 Lua 侧参照物与交叉验证源；TS .d.ts 设计时按 02 票自行从官方镜像生成（不依赖该库，但用它做回归对照）。

## 十三、裁剪面备注（模拟器契约对照，:observed-contract.md）

- Lua 环境=裁剪沙箱：`_VERSION=nil`；fengari 语义（模拟器 lua-runtime README 契约表）
- `print` 被宿主覆写为日志通道，不是 stdout
- Color 是 AARRGGBB  userdata 构造（模拟器契约）vs 官方 0-255 RGBA 函数——**模拟器行为推测，真机以官方为准**（HR-06 调用三分法：game 点号 / script 冒号 / 控件冒号）
- 回调引用相等性（Remove*EventListener 须同引用）→ TS 侧生成代码须保持函数引用稳定（禁止每次生成新闭包）
- 多返回值模式（`GetUICanvasSize()→x,y`）→ TS 侧需元组类型或包装对象

## 十四、TS 类型面设计输入（给 02 票）

1. **规模**：API 总量约 120 函数/方法 + 25 枚举 + 12 类 + 1 数据类——d.ts 体量可控（预估 <2000 行）
2. **三类接收者**（三分法）：`game`（全局单例）/ `script`（脚本实例）/ 控件实例（ClientUIBaseControl 族）→ TS 三个命名空间/类
3. **多返回值**：官方大量 `→x,y` / `→h,v` 双值返回 → TS 元组 `[number, number]`
4. **Tweenable 字段**：TextBox/TextWindow 的 fontSize/fontColor 等标 Tweenable → 可被 game.Tween 插值 → 类型上可用特殊标记（ branded type 或接口标注）
5. **回调引用稳定**：Add/Remove 事件监听对 → TS 侧要求具名函数或稳定引用，ESLint 可检
6. **Vector3 是 table**：`AddVector3(vector3Value: table)` → TS 侧 `[number,number,number]` 元组或 Vec3 接口
