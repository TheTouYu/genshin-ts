# 真机实测回报：5px 拖拽死区（PR #11）与完整键位面板（PR #12）

我们把这两个改动拿到**真机**（千星沙箱实机客户端，Linux/Wine，**不是模拟器**）上做了验证。
结论先说：**5px 死区与真机完全吻合**，**字母语义优先的键位映射逐条得分**；只发现一处行为差异，见第三节。

## 一、我们是怎么测的

**探针（客户端 Lua，跑在真实试玩里）**，挂在一个容器控件上：

- 绑定**全部 164 个 `KeyEventType`**，每次按键记录事件名；
- 一块**全屏光标检测区域**，挂全 8 个监听（`Down/Up/Click/Enter/Exit/BeginDrag/Drag/EndDrag`），每次事件记录：事件名、`GetUIPos()`、`GetPressUIPos()`、位移 `d = |pos − press|`。

> 给后来做同类验证的人提个醒：真机上 `CursorEventData` 只有 `dragging` / `touchId` 两个成员，
> 读 `d.x / d.y / d.pressX / d.pressY` **返回 nil 且不报错**——坐标必须走 `Get*UIPos()` **方法**。

**注入**：用 `ydotool` 在 evdev 层向游戏窗口注入。

- 键盘：一次爆发 40 键（约 8 秒），覆盖 43 槽面板 + 具名键；
- 拖拽：两个会话共 **69 个脚本化手势**。每个手势 = 把指针移到起点（闭环：`xdotool getmouselocation` 读回 + `ydotool mousemove` 相对步进）→ 按下 → 按目标位移分 1~8 步移动 → 抬起；另加真人最慢速手势若干。

**取数（这一步很关键）**：游戏内渲染有 2 秒以上延迟、甚至整帧冻结，**截屏判读不可靠**。所以流程是：

1. 先注入整批；
2. **退出试玩**，客户端 `Debug_Log` 落盘；
3. **离线解析日志**（Lua `print` 落在日志记录的 field 23）。

判定以**日志里记录的位移 `d`** 为准，不用注入步长——注入的「单位 → 游戏像素」传递比会漂移，只有日志值可比。

环境：游戏窗口 2560×1440，游戏内画布 1600×900 ⇒ **1 游戏像素 = 1.6 屏幕像素**。

## 二、拖拽死区：`> 5` 屏幕像素是对的

| 手势 | 位移（游戏像素） |
|---|---|
| 未触发 `BeginDrag`（纯点击）的最大位移 | **2.5** |
| 触发 `BeginDrag` 的最小位移 | **3.1** |

⇒ 阈值 ∈ **(2.5, 3.1] 游戏像素 = (4.0, 4.96] 屏幕像素**，即约等于你选的 5px，且**从按下点起算**。
另外两点：

- **与速度无关**：单次 8 单位的大位移 与 10×1 单位的慢拖，触发位移一致。
- 事件序列为 `Dn → En → Bd → Dg×n → Up → Cl → Ed`——**`Enter` 先于 `BeginDrag`**，所以 `Enter` 不能当"仅悬停"用。

## 三、唯一的行为差异：拖拽后照样发 Click

真机日志里 **42 次 `Down` ↔ 42 次 `Click`**：**每一次 `Up` 都发 `Click`，拖拽之后同样发**。
模拟器目前拖拽不发 `Click`。若要和真机完全对齐，可以「`Up` 无条件发 `Click`」；
若保持现状，建议在代码里加一句注释——游戏侧完全可能把「拖拽」和「点击」当作互斥事件处理。

## 四、键位面板（PR #12）逐条证实

43 个奇匠槽与具名键全部在真机核对：

| 槽位 | 物理键 | 槽位 | 物理键 |
|---|---|---|---|
| Key1–Key9 | 数字 1–9 | Key29–Key35 | `` ` `` `-` `=` `[` `]` `\` `,` |
| Key10 | 数字 0 | Key36–Key39 | ↑ ↓ ← → |
| **Key11–Key22** | **U Z Y G H I O P J K L V** | Key40–Key43 | 右Ctrl 右Shift Backspace CapsLock |
| Key23–Key28 | F5–F10 | | |

具名键：WASD → `KeyboardMoveForward/Left/Backward/Right`，Space → `JumpKey`，左Ctrl → `WalkOrRunKey`，
F → `InteractKey`，E/Q/R/T → `KeyboardCharacterSkill1–4`，X → `DropKey`，Tab → `OpenShortcutWheelKey`；
鼠标左键 → `KeyboardNormalAttackKey`，右键 → `KeyboardSprintKey`。

**C / B / N（以及 `.` `/`、鼠标滚轮）完全不产生 `KeyEventType`**——它们本就不在 43 槽面板里，与官方键位表一致。

⇒ PR #12 的「字母语义优先」映射与真机逐条一致，包括 `J/K/L/V` = `Key19/20/21/22` 这个反直觉顺序。

## 五、复现

需要的话我可以贴出探针脚本与日志片段。整条链路是：
客户端 Lua 探针 → `ydotool` 爆发注入 → 退出试玩 → 离线解析日志（`Beyond_Debug_Log/*.gia`，Lua `print` 在 field 23）。
两个会话、69 个手势、40 键爆发，全程无 OCR、无截屏判读。
