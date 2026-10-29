# 13 真机限制与模拟器差异（"本机能过 ≠ 真机能过"）

> **本章的由来**：用户原话（T48 13:05）：「**真机存在限制，修复并更新技能**」——
> 这句话之前，我们已经被真机上的三个差异各骗过一次（白屏 / 文字乱位 / 200-local 编译失败）。
>
> **核心判据**：**模拟器能过 ≠ 真机能过**；但**模拟器不过一定不许上真机**。
> 每次真机首试都要当"第一次见这个平台"来对待。
>
> 出处：`18-evidence.md` C8 / F2 / F4 / F5、L 组 L9。

## 1. 真机 Lua 200-local 硬限（最致命：整段不编译、白屏、零日志）

**症状**：真机弹「脚本编译报错: ... `too many local variables (limit is 200) in main function near '('`」——**整段不编译、白屏、零日志**。
**关键事实**：**编译错误不进 runner**（runner 是本机 lua 跑逻辑，永远看不到这个错）。

**两条实测事实**：
1. **本机 `lua5.3 loadfile` 会放过**（行首 `local` 只有 141 个），真机在第 200 个 `local function` 处报错。
2. 真机的计数比"行首 local 数"更严：`local function` **占槽且近似双计**（`local` 声明 + 函数对象），顶层循环变量也计。

**修法：把晚期大函数从 `local function X()` 改成挂表 `FN.X = function()`**（表只占 1 槽）：
```lua
-- 改前（每个占 ~2 槽）
local function tickInstance(d) … end
local function layoutDual() … end
local function enterMode(m) … end
local function exitToMenu() … end
local function aiTickCore(dt, onOver, lvIdx) … end
local function aiDrop() … end
local function skinBgItem(ctl, spec) … end
local function aiAutoFlag() … end

-- 改后（8 个函数共省 ~8 槽）
local FN = {}
FN.tickInstance = function(d) … end
-- 调用点全量替换：tickInstance(x) → FN.tickInstance(x)
```
**实测结果**：行首 local **141 → 134**（安全余量 66），45/45 用例回归绿。

**判据**：
```bash
grep -cE '^local ' lua/main.lua            # 目标 ≤150（不是 200——留余量给"近似双计"）
grep -cE '^local function' lua/main.lua    # 这些每个都占更多槽，越多越危险
grep -cE '^FN\.[a-zA-Z]+ = function' lua/main.lua   # 挂表函数数（本项目 8）
```
**改完必须真机首试**（看弹窗/日志）——这条没有替代验证。

## 2. 真机 API 三差异（"文字乱位 / 一个巨大的问号"）

真机日志抓到三条被 `pcall` 吞掉的报错：

| API | 真机行为 | 模拟器行为 | 后果 |
|---|---|---|---|
| `SetVisible` | **严格计参**（只收 1 参） | 宽容 | 传 2 参会抛错 → 该控件隐藏失败 → 双份/残留 |
| `horizontalAlignment` / `verticalAlignment` | **只收枚举**（`Enum.TextHorizontalAlignment` 之类） | 字符串也收 | 传字符串抛错 → 对齐全 fail → 文字默认 Top/Left → 乱位/裁切/大问号 |
| `imageColor` | 有符号 int32（透明度通道是否生效**未验证**） | 宽容 | 颜色断言对不上；遮罩可能变纯色 |

**修法：适配层双形态**（一处修，37 处调用点受益）：
```lua
-- 思路：先试枚举，失败回落字符串；每次都记失败
local function trySet(ctl, field, value) … end
-- 对齐字段特殊处理：
--   trySet(ctl, 'verticalAlignment', Enum.VerticalAlignment.Middle)   -- 真机
--   回落：trySet(ctl, 'verticalAlignment', 'Middle')                   -- 模拟器
```

**关键纪律**：**`pcall` 吞错误必须留痕**（`print('ui fail: <field> <err>')`）。
> 如果没有这三行日志，这个 bug 我们永远定位不到——它表现为"文字位置怪"，而代码里每一行看起来都对。

## 2b. `SetVisible(false)` 对运行时实例真机不生效（D581）

真机上要"隐藏"一个运行时创建的实例，`SetVisible(false)` **不可靠** → 用**挪出画布**（坐标移到画布外）兜底。
**影响**：所有"常驻 + 隐藏"式的浮层设计在真机上会露馅；改用**懒创建 + 销毁**。

## 3. 模板与容器差异

> **换地图必做的一件事（2026-10-29 实证）**：设备版 Lua 里的模板 GUID 是**烘死的常量**
> （`T.tpl = {prim=…, label=…, hit=…}`，由 `qxqy/build-device.mjs` 用 `FLOWER_PRIM/LABEL/HIT`
> 注入）。GIA 导入或 `maps:clone` 到新地图后模板会被**重新编号**，脚本里还是旧数字 ⇒
> `InstantiateClientUIControl(旧guid, root)` 全失败（被 pcall 吞掉）⇒ 界面空。
> 判据：`grep -m1 'T.tpl' <地图目录>/external_lua_file/default_import_file/**/*.lua` 的三个数字必须
> **都能在 `assets:ui list` 的 `控件模板:` 里找到**。修法：重新 build 设备版（烘本图真实 GUID）→
> `assets:scripts update --source-file <新.lua> --map-id <id> --write`。


| 项 | 模拟器 | 真机 |
|---|---|---|
| 文本模板 | `build.mjs` 里的 `settle`（子控件名 `settleTitle/…`） | 地图里已有的「控件模板:客户端控件容器_1」（子控件名 `title/hud/best/hint/botBanner`） |
| 模板可实例化 | 是 | **是**（D582 修正：GIA 容器模板可实例化） |
| 模板 GUID | build 时注入占位符 | 注入后有具体数字；**注入点可能在模块里** |
| 模板编号 | authoring 值（如 `1073742105`） | **导入后会重编号**（如 `1073741849`）→ 用候选表逐个试 |

**判据**：模板探测必须打日志（`tpl guid=<n> / hit=<n>`）；探测失败要打印**尝试过的全部候选**（不要无声 `error()`）。

## 4. 内存版与切图重载（"CLI 全绿但真机没变"）

编辑器把地图**常驻内存**，离开一张图时会把**内存版写回磁盘**。
- 所以：CLI 写完 → **让用户切出地图再切回**（强制从磁盘重载）。
- 反过来的纪律：**先切出，再写盘，再切回**（顺序反了会被内存版覆盖）。

## 5. 浏览器（模拟器网页）特有

| 现象 | 真因 | 处理 |
|---|---|---|
| 音效不响 | 浏览器禁止自动播放，需用户先交互 | 提示「先点一下画面」；同时加视觉反馈补偿 |
| 按键没反应 / 一次按键多格 | 五重门（`03-input.md` §6） | 先满足门，再判转发 |
| 卡顿 | 网页 DOM/解释器开销 ≠ 真机开销 | 性能结论要注明是**哪个宿主**的读数；**网页卡先双重分诊**：①按键/转发问题走 `03-input.md §6` 五重门 ②真性能问题走 `11-performance.md §1` 帧探针 |
| 试玩服务僵死 | 进程挂了/端口占住 | 重启服务，自证 `pid` + HTTP 200；旧页面会话失效需刷新 |

## 6. 无法在模拟器验证、只能真机验的项（诚实清单）

写报告时必须把这些列在"尚未验证"栏：

1. **真机 `imageColor` 的透明度通道**是否生效（若被忽略，遮罩/深色墙会变纯色）。
2. **真机 `SetVisible` 对运行时实例**是否可靠（已用"挪出画布"兜底，最终只有真机能验）。
3. **真机字体缺字**（特殊符号/生僻字可能显示为方框或问号）。
4. **真机鼠标/触屏事件**（如果平台支持）。
5. **真机编译**（200-local、语法严格性）。
6. **真机帧率/性能**（模拟器是解释器，真机是游戏内嵌）。

## 7. 差异对照表（一页速查）

| 维度 | 模拟器 | 真机 | 影响 |
|---|---|---|---|
| Lua 编译 | `lua5.3 loadfile`，宽松 | 内嵌，**200 local 硬限**，严格 | 本机能过 ≠ 能过 |
| `SetVisible` | 宽容 | 严格计参 | 隐藏失败 → 双份 |
| 对齐字段 | 字符串/枚举都收 | **只收枚举** | 乱位/裁切 |
| `imageColor` | 宽容 | 有符号 int32 | 颜色/透明度 |
| 脚本挂载 | 单文件为主 | 多模块要**逐个 register** | 跑旧版 |
| 模板来源 | build 注入 | 地图内已有模板 | 子控件名不同 |
| 热区 | 浏览器原生事件 | `showCursor` 父链门控 + `AddCursorEventListener` | 注册成功但不触发 |
| 持久化 | 每次刷新重载 | **内存版会覆盖写盘** | 写了但没生效 |
| 日志 | 页面日志面板 | `Beyond_Debug_Log` 文件 | 采集方式不同 |

## 8. 真机首试清单（每次都要走）

```bash
# ① 部署前：静态三项
grep -cE '^local ' lua/main.lua                       # ≤150
grep -E '/cell = \{ [0-9]+/' <注入版.lua>             # 数字形态（不是占位符）
grep -cE '^local function' lua/main.lua               # 心里有数

# ② 部署：注册数对账
#    registryEntries == 主脚本数 + 模块数
#    输出 temp-sync=success，Save_Level 与 Temp 同 sha

# ③ 真机：让用户切出再切回 → 取日志
#    必须出现的行：canvas / tpl guid= / cellCount= / listen ok / module ok ×M / hud inst n=
#    必须没有的行：lua-error / ui fail（有就必须逐条解释）
```
**判据**：以上全绿才算"真机通过"。**任何一项缺失，都按"没部署成功"处理**，不要假设"应该没问题"。
