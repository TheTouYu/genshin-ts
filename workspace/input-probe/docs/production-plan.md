# input-probe 生产计划（千星真机输入探针）

## 任务

为 miliastra-beyond-simulator PR #11（网页试玩层 5px 拖拽死区）补真机证据：

1. 测真机 CursorClick → CursorBeginDrag 临界位移（`studio/play/session.js:946` 的 `Math.hypot(px-press.x, py-press.y) > 5` 常数待校准）。
2. 顺带验证 PR #12 物理键 → `Enum.KeyEventType` 事件名映射（`studio/play/browser-session.js:6-34`，现仅代码注释自证）。
3. 测得数字回传 miliastra-beyond-simulator 会话，回复上游 1475505/miliastra-beyond-simulator PR #11 作者（其主动提出帮忙在真机跑）。

## 步骤裁剪说明

测量工具非玩法游戏：跳过 GDD / HTML / 美术（步骤 1/3/4）。测试用例 = 探针自验证清单（见 `records/`），
直接走 5（Lua 实现）→ 6（模拟器验证）→ 7（真机测量 = 交付本体）。

## 知识来源与可用性（PREFLIGHT 2026-10-14）

| 来源 | 状态 | 用途 |
| --- | --- | --- |
| 模拟器 runtime 白名单 `client/lua-runtime/src/runtime.js:964-971,1058`、`scene.js:454-506` | 本会话已读 | AddCursor/AddKeyEventListener、SimulateCursorClick、EnableUpdate 签名复核；按键回调 `fn()` 无参（事件名须闭包捕获）；光标回调 `fn(data)` |
| `client/lua-runtime/docs/observed-contract.md`（21 条真机观察） | 本会话已读 | 条 7 按键 true 中断 / 条 8 SimulateCursorClick 发 Click / 条 12 光标监听只挂 button+cursor / 条 13a 动态实例后创建在上 / 条 21 回调内写值当帧生效 |
| `client/lua-runtime/src/enums.js:74-92` | 本会话已读 | KeyEventType 全集 164 项（Keyboard Craftsperson1-43 + 具名 15、Controller Craftsperson1-14 + 具名 10，各 Down/Up）；CursorMove 不在枚举内 |
| hmlt-qixia `lua/main.lua`（真机玩过） | 本会话已读 | 生命周期模式（OnInit 读画布 / OnStart 构建 + EnableUpdate）、mkc 工厂、FieldArea 全屏写法 `SetAnchoredPosition(0,0)+SetSizeDelta(CW,CH)`、按钮与全屏光标区共存实证；其 `Enum.CursorEventType.CursorMove` 引用在模拟器枚举中不存在（探针顺带探测真机有无） |
| PR #11 现场 commit `fd72ecc` | 本会话已读 | `studio/play/session.js:946` 待校准常数 |
| PR #12 现场 `studio/play/browser-session.js:6-34` | 本会话已读 | 待验证映射：Key11-22=U Z Y G H I O P J K L V 面板、Key36-39=方向键、Digit1-9→Key1-9、WASD→KeyboardMove*Key |
| 官方 API 加工稿 `knowledge/guide/Lua客户端UI脚本API.md` | 本机未找到 | 本轮 API 面已被模拟器白名单 + 契约 + 真机代码覆盖，不阻塞；需要官方原文时再补 |

## 设计决策

- **读出通道 = 屏上 7 行 textbox**（真机唯一可靠读出，print 不可靠）+ 关键数字自动统计：
  `clickMaxD`（所有 CursorClick 的最大抬起位移）与 `dragMinD`（所有 CursorBeginDrag 的最小触发位移）
  自动夹出阈值区间 `[clickMaxD, dragMinD]`——人工无需精确控制每档位移，操作误差被统计量吸收。
- **键盘监听双层**：核心 20 项（J/K/WASD/方向键 Down+Up）静态点号绑定（hmlt 真机验证过的写法），
  其余 144 项动态 `KE[name]` + pcall 绑定；成功/失败计数上屏（`KEYS ok/total`），真机一眼看出挂载健康度。
- **顺带探测**：CursorMove 枚举挂载（模拟器 enums.js 无此项，真机若有 = 模拟器缺口证据）、
  SimulateCursorClick 行为（SIM 按钮）、CursorEnter/Exit 是否触发、`game.GetDevice()`、`GetCursorUIPos` 10Hz 节流。
- **挂载**：`assets.scripts[0] = {id:'main', path:'main', controlId:'n1', controlAsset:'server-control-template'}`（显式 controlId+controlAsset，防两棵树同名 ID 静默挂错）。
- **控件树**：server `sc1→n1`（stretch 全屏, showCursor=true）；client 模板 t2 tx=1073742301 / t3 btn=1073742302 / t5 cursor=1073742304。
- **文本全 ASCII**（规避 D226 中文 textbox 裁剪坑），每行显式 `SetSizeDelta` 宽度防裁剪；读出行集中上半屏，下半屏留白做拖拽测试区，SIM/RST 按钮在左下角（顶层，协议注明避开）。
- 坐标系：千星原点左下、Y 向上；逻辑场 444×250，K=CW/444 运行时缩放。

## 当前状态

- [x] PREFLIGHT
- [x] 步骤 5：`lua/main.lua` + `qxqy/build.py` 组装存档（v1.1：坐标读法改 GetUIPos 方法 + d.x 字段探测）
- [x] 步骤 6：模拟器验证（build 冒烟无错；MCP 交互：KEYS 164/164、拖拽 `Dn En Bd(60.0) Dg Up Ed`、DISP=60.0 精确、T 区间显示、键盘注入→line4 显示、CM=NO、d.x=nil）
- [x] 步骤 7a：device-package 五件套导出（整合包.gia 推荐）+ device-handoff.md + measurement-template.md + tech-architecture.md
- [x] 步骤 7a2：真机执行包同步 `/home/h/miliastra-beyond-simulator/probes/input-probe/`（整合包.gia + main.lua + measurement-template.md + 自包含 README；落盘未 commit，推送由用户定）
- [ ] 步骤 7b：**真机测量**（用户/上游作者执行协议 A/B → records/measurement.md）
- [ ] 步骤 7c：数字回传 miliastra-beyond-simulator（probes/ + session.js 常数 + PR #11 回复）

## 模拟器验证记录（2026-10-13）

- 首跑 Red：`OnStart:75 attempt to call a nil value (method 'SetText')` → textbox 无 SetText，改 `c.text=`。
- 二跑 Red：事件坐标恒 (0,0) → CursorEventData 的 x/y 在 Lua 侧非字段，改 `GetUIPos()/GetPressUIPos()` 方法（模拟器 runtime.js:911 mtCursor 白名单仅 dragging/touchId）。
- Green：pointer down(640,180)→move(700,180)→up → `SEQ Dn(640,180) En Bd(60.0) Dg(60.0) Up(60.0) Ed(60.0)`，`DISP=60.0`，`BD n=1 min=60.0`，`T < 60.0`；纯点击 → `Dn Up Cl`，`CL n=1 max=0.0`；key 注入（MCP 参数名 `key` 非 typeName）→ `KEYS 164/164 | KeyboardCraftspersonKey19Down`。
- GIA 导出 warning 已核：分件脚本 GIA 不含挂载关系（导入后需手工挂 n1）→ 真机推荐整合包单文件。

## 阻塞项

无（等真机执行者跑协议 A/B）。
