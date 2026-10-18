# 官方 Lua API 学习笔记（input-probe 依据）

> 状态：已学完（2026-10-13）
> 来源：`research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md`（11359 行，官方 web v2.5.1 全文镜像，2026-09-29 抓取；**2026-10-13 复核官方 wiki 仍为 v2.5.1，无增量**） + `官方教程-客户端控件和客户端脚本.md`（318 行）
> 用途：input-probe 探针的官方依据；PR #11/#12 上游回复的官方引用

## 一、键位默认物理映射（官方 KeyEventType 表 8545 行起，决定性）

| KeyEventType | 默认物理键 |
| --- | --- |
| KeyboardMoveForward/Backward/Left/RightKey | W / S / A / D |
| KeyboardJumpKey | Space |
| KeyboardDropKey | X |
| KeyboardOpenShortcutWheelKey | Tab |
| KeyboardInteractKey | F |
| KeyboardNormalAttackKey | 鼠标左键 |
| KeyboardSprintKey | 鼠标右键 |
| KeyboardSwitchToWalkOrRunKey | 左Ctrl |
| KeyboardCharacterSkill1/2/3/4Key | E / Q / R / T |
| KeyboardCraftspersonKey1–9 | 数字 1–9 |
| KeyboardCraftspersonKey10 | 数字 0 |
| **KeyboardCraftspersonKey11–43** | **无默认物理键（自定义绑定槽）** |
| Controller*（14+10 键） | 手柄侧 |

- 键盘事件总数 164 = 82 键 × Down/Up，与模拟器 `enums.js` **完全一致**（无官方新增键）。
- **推论（对 PR #12）**：模拟器 `browser-session.js` 的 Key11=U … Key22=V 字母面板映射是**模拟器自设约定**，官方无默认绑定依据。真机协议 B 测的就是真机默认绑定下这些物理键触发什么——测量结果直接裁决 PR#12 映射是否需要改。
- WASD→Move、Digit1-9→Key1-9 与官方一致（PR#12 此部分有官方背书；注意 Digit0→Key10 官方成立，PR#12 未映射 Digit0，可顺带补）。

## 二、CursorEventData（官方 6364 行，证实模拟器发现）

- **字段仅 2 个**：`dragging`(boolean 只读)、`touchId`(integer 只读)。**不存在 x/y/pressX/pressY 字段**（任务书说法系对 JS 层 makeCursorEventData 的误读）。
- 坐标三方法（均返回 x,y）：`GetUIPos()`（当前，画布左下原点）/ `GetPressUIPos()`（按下时）/ `GetUIPosDelta()`（本事件位移）。
- 位移 = `math.sqrt(dx^2+dy^2)`，dx,dy 取 GetUIPosDelta 或 GetUIPos-GetPressUIPos。

## 三、CursorEventArea 控件（官方 6250 行）

- 字段：`raycastTarget`(boolean 读写)。
- 方法：AddCursorEventListener(type, callback) / RemoveCursorEventListener(type, callback) / RemoveCursorEventListeners(type) / RemoveAllCursorEventListeners() / **SimulateCursorClick()=按顺序模拟 Down+Up+Click**（与模拟器实现一致；坐标行为官方未承诺，仍按探针 bonus 记录）。
- Enum.CursorEventType 8 项 = Down/Up/Enter/Exit/Drag/BeginDrag/EndDrag/Click（与模拟器一致）。

## 四、键盘监听语义（官方 5095 行）

- `AddKeyEventListener(eventType, callback)`：**回调返回 boolean**；同一容器内若交互按键事件被 lua 回调响应并标记已处理，容器内其他按键不再响应该次按键（互斥）。
- 按键事件按**控件渲染顺序**传递，层级靠前优先（教程 §5.4）。

## 五、生命周期与 Script（官方 364/737 行）

- 7 回调：OnInit / OnStart / OnEnable / OnDisable / **OnUpdate(dt，不受关卡时停)** / **OnLevelUpdate(dt，受关卡时停)** / OnDestroy。
- `script:EnableUpdate(bool)` 控制 Tick；script 字段：alive / scriptMappingId / **object（宿主控件）** / path / enabled。
- `script:GetParam(name)` 读编辑器配置的脚本变量（探针可用于参数化，暂不用）。
- `script:Invoke(funcName, ...)` 跨脚本调用。

## 六、game 函数（官方 945 行，零参点号）

GetUICanvasSize / GetCursorUIPos / GetDevice / SetControllerFocus / GetControllerFocus / GetControllerLeftStickAxis / GetControllerRightStickAxis / InstantiateClientUIControl(prefabIndex, parent) / DestroyClientUIControl / GetClientUIControl(controlId) / FindClientUIRoot(name) / GetClientUIRoots / **PrintClientUITree()（打印控件树到日志，调试利器）** / Tween / TweenSequence / ServerSignal / GetGlobalCustomVariableValue / PauseLevelTime / IsLevelTimePaused / PlayAudio2D / StopAudio / IsAudioAlive / GetLanguageType / GetStageMode / **IsTestPlay()** / GetText。

## 七、日志与读出通道（教程 §5.8）

- `print` 官方可用（写普通日志不阻断）、`printerr`（错误级）、`debug.traceback`。
- 调试：日志面板勾选「客户端脚本」。
- **本地日志 ErrorLog.txt 与客户端脚本存储路径一致**（= 地图目录 `external_lua_file/`），仅正常日志无法报告的错误才创建。
- 运行环境：Lua 5.3；禁 io.*/coroutine.*/string.dump/os(除 time/date/clock/difftime)/debug(除 traceback)；补 math.isnan/isinf。

## 八、架构与挂载规则（教程全文，真机操作路径）

1. **客户端控件入口**：界面控件组管理 → 界面控件组库/客户端控件模板（存模板）或 界面布局 → 添加界面控件 → 客户端控件容器 → 画布设置 → 前往编辑（画布内加控件）。
2. **层级铁律**：客户端控件必须全部在「客户端控件容器」（本身是服务器控件）内；容器**激活且可见**时脚本才生效；容器隐藏/关闭/销毁 → 内部控件销毁。
3. **脚本入口**：千星沙箱 → 客户端脚本资源管理器 → 客户端脚本映射文件夹；右键 新建脚本映射（关联本地文件）或 新建客户端脚本（本地建文件+映射+关联，同名）。
4. **上传规则**：只有建立了映射的 lua 文件才被打包上传——本地裸文件不生效。
5. **脚本挂载**：任意客户端控件 → 脚本页签 → 添加脚本（挂脚本映射）。
6. **动态创建边界**：仅「存为模板的客户端控件的父节点」支持 InstantiateClientUIControl 动态创建；挂主屏的控件、模板的子节点均不支持。
7. **断线重连**：客户端控件全部销毁回初始态；需自行恢复界面。
8. 通信：客户端→服务器 `ServerSignal:SendSignal()`；服务器→客户端 节点【发送客户端脚本信号】+ `script:RegisterServerSignalHandler(name, cb)`；联机延迟最低 100ms。
9. 变量监听：`script:RegisterCustomVariableChangedHandler(entityType, name, cb)`（回调只给名字，值用 game.GetGlobalCustomVariableValue 读）。
10. 手柄导航：需已聚焦控件才响应；SetControllerFocus 定默认聚焦。

## 九、对探针工程的三点直接修正/确认

1. **探针 Lua v1 的 GetUIPos 读法官方证实**，无需改；d.x 字段探测保留（真机若返回非 nil 即模拟器桥差异证据）。
2. **真机挂载路径已明确**（教程 §6/§7）：先建脚本映射（本地 lua 文件）→ 控件脚本页签挂载 → 客户端控件容器要激活可见。差分实验即按此路径做。
3. TextBox 写文本 = `c.text = '...'` 字段赋值（官方无 SetText），与探针现状一致。
