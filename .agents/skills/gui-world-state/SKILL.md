---
name: gui-world-state
description: GUI 世界状态模块（感知层）的入口——用 `.scratch/gui-service/worldsvc.py` 的 look/act/wait 三动词与 `ys-lookd cmd=world` 读「状态 / 对象 / 结构 / 文本」，在真机里完成「看清在哪 → 找到对象 → 动作 → 复验」。当任务涉及：读界面状态、判断当前在哪个界面（含原神本体的派蒙菜单/好友/角色/活动页）、按文字找可点对象、验证动作是否真的生效、黑屏或空白帧、窗口在别的虚拟桌面、或要给 GUI 自动化加判据与防线时使用。区别于 `device-playtest-loop`（负责把真机实验跑起来：开试玩、注入、取日志、焦点归还）：本技能只管**感知与判断**这一层，不复制任何判据。
---

# GUI 世界状态（感知层）

## 0. 一句话

**「我以为」必须有模块读数支撑。** 读不到就说读不到，判不出就报 UNKNOWN，绝不用手工像素试探代替模块判断。

## 0.1 这个模块的立场（为什么它不是「点点看」）

每次判断都要能回答三个问题，缺一个就不许动：

| 问题 | 读哪里 | 答不上来时 |
|---|---|---|
| **在哪** | `state.state` + `confidence` | `UNKNOWN` / `AMBIGUOUS`（**不猜**） |
| **看到什么** | `objects.containers[] / free_text[]` | 说"没找到"，别说"没有" |
| **有多确定** | `confidence` / `ambiguous` / `degraded[]` / `settled.same_as_prev` | 降级或停手 |

- 动作返回值只说明**注入成功**，不说明**世界变了**——复验必须落在独立观测上（重读 `world` 或 `expect`）。
- 前置断言为假就停：`settled=false` 不动、`attribution` 不过不动、`degraded` 含致命项不动。

## 1. 三条命令（唯一入口）

**先跑这一条**——它 1 次调用给全能力自述（verbs / 字段 / 退出码 / 不变量 / **已知缺口**），
别再去 ls/sed/grep 读源码猜（实测有会话为此花了 20 次调用）：

```bash
python3 .scratch/gui-service/worldsvc.py capabilities
```

```bash
# 看：状态 + 对象 + 结构 + 文本（常驻服务，热路径 ~1.1s）
python3 .scratch/gui-service/worldsvc.py look --backend daemon-world --summary
python3 .scratch/gui-service/worldsvc.py look --backend daemon-world      # 全量回执

# 快看：跳过检测+结构层（省 ~40–90ms）；OCR/判态/容器照常，稳态 ≤50ms 靠复用
python3 .scratch/gui-service/worldsvc.py look --backend daemon-world --fast --summary

# 动：按文字/对象解析后注入（默认 dry-run，真动要 --live + 焦点授权）
# ⚠️ `--expect` 是**必填**：漏了直接 rc=2、stdout 为空（2026-10-21 实测连跑两次都静默失败，
#    日志里只看到 resolved=None/injected=None）。动作后要判"世界变没变"，本来也不该省它。
python3 .scratch/gui-service/worldsvc.py act --object-id <id> --action '{"type":"click"}' --live \
  --expect '{"type":"state_in","states":["GAME_FRIENDS"]}' --expect-timeout-ms 10000

# 等：谓词等待（禁裸 sleep）
python3 .scratch/gui-service/worldsvc.py wait --predicate '{"state_in":["GAME_PAIMON"]}' --timeout 10

# 自述 + 辅助动词（先跑 capabilities，别读源码猜能力）
python3 .scratch/gui-service/worldsvc.py capabilities      # verbs / 退出码 / 不变量 / known_gaps / skills
python3 .scratch/gui-service/worldsvc.py drill --at 900,600 # 对 uncertainty 下钻局部（不重处理整帧）
python3 .scratch/gui-service/worldsvc.py vocab              # 13 态词表（单一源 ys-state）
python3 .scratch/gui-service/worldsvc.py intents            # 列出 ys-do 意图（actions/*.json）
python3 .scratch/gui-service/worldsvc.py cache --clear      # 帧级缓存
```

底层就是 `ys-lookd` 的 `cmd=world`（socket 一行 JSON）：

```python
req = {"cmd": "world", "ocr": True, "objects": True, "cache": False, "structure": True}
```

## 2. 回执怎么读

| 字段 | 真实形状（2026-10-21 干净房间核验实测） | 纪律 |
|---|---|---|
| **`state`** | **dict `{name, confidence, ambiguous, evidence, channel}`** | 状态名在 **`state["name"]`**，⚠️ 不是 `state["state"]`（写错会让新代理整轮判 UNKNOWN） |
| `state.evidence` | 每条判据的 value/passed | 判不出时看这里 |
| **`objects`** | **list**（实测 58–88 项），每项 `{id,parent,bbox,kind,text,text_source,glyphs,badges}` | ⚠️ **不是** `objects["containers"]`；`kind ∈ row/button/tile/panel/chip` |
| **`bbox`** | `[x, y, w, h]` = **xywh**，物理像素（2560×1440） | 中心 = `(x+w/2, y+h/2)`。**自检**：按 xyxy 解释若得到**负高度**，就是 xywh。以 `capabilities.invariants` 为准，别凭单帧推断（2026-10-21 我写错过一次） |
| **`free_text`** | **list[str]**（实测 33 条），**没有 bbox** | 要 bbox+text 的目标只能走 `objects[]`；`free_text` 只适合"有没有这段文字" |
| `structure` | `{detector, detections[]}` | 检测框来源 |
| `settled` | `{same_as_prev, tol_text, n_text_changed, ...}` | ⚠️ 实测**画面静止时 `same_as_prev` 仍可能连续 5 帧为 false** ⇒ **它不是动作前的硬门**。替代判据：连取两次 look，比较**首行行名+行数**是否一致；一致即可动 |
| `frame_id` | `sha256:...` | 证据引用用它 |
| **`advice[]`** | 模块主动给的策略建议（如 `SCANNING_LINEARLY` / `LINEAR_ONLY_NO_SEEK`） | **先读它再决定策略**，但⚠️ 它需要**常驻 daemon 的进程级累积**（≥3 次 observe 才出建议）⇒ **CLI 单次调用（新进程）永远拿到空数组**；要它生效必须走 `look --backend daemon-world` 连续调用。等不到建议时别以为功能坏了 |
| `daemon.handled_ms` | 服务端处理耗时 | 冒烟用 |

> **坐标空间**：所有 bbox / `--at` 都是**物理像素 2560×1440**；窗口逻辑尺寸是 1707×960，
> **不要**把逻辑坐标传给 `--at`（y 会超出窗口高）。实测踩过：按逻辑 853,709 传参 → 滚动无效。

## 2.5 一步看目标：`look --summary --grep <子串>`（**默认工作方式**，2026-10-21 用户纠偏后固化）

> 用户原话：「工具给出信息，模型执行打开角色……然后工具给出布局和大致的框+文字信息，
> 模型执行轮询切换，直到满足条件。**所以应该两次就结束了**。」

**界面上的字，常驻 OCR 早就读出来了——要按文字找东西，第一步就是问它，别去抓整帧读图。**

```bash
# ① 当前界面 + 目标在不在（一次调用：state、命中文字、bbox）
python3 .scratch/gui-service/worldsvc.py look --backend daemon-world --summary --grep 甘雨
#   → {"state":"GAME_CHARACTER","texts_n":3,"match_count":2,
#      "matches":[{"text":"…冰元素／甘雨 Q 属性…","bbox":[0,0,1206,1440]}]}

# ② 不在 ⇒ 切一个（本身就是"动作 + 等画面真的变了"）
tools/ys-editor/ys-key e --wait-change 150,25,760,105

# ③ 再读一次 → 命中就结束
```

**必须先过"稳定"这一关**（2026-10-21 用户抓到的真 bug）：角色界面切换时**名字先变、头像/立绘后变**，
单帧很容易拍到「新名字 + 旧头像」的混合态——那天我拼的扫描序列因此顺序不可信。所以读文字用：

```bash
tools/ys-editor/ys-read --grep 甘雨        # 读两次，两次文字集合一致才 rc=0
# → {"ok":true,"consistent":true,"state":"GAME_CHARACTER","match_count":2,"matches":[...]}
# 不一致 ⇒ rc=9 UNSTABLE_UI（界面还在动，**拿这一帧下结论就是错的**）
```

**匹配纪律**
- **先整名，再单字**（`甘雨` → `甘`/`雨`），最后才退回看框：OCR 会把一条横幅并成**一个大容器文本**
  （实测 bbox 覆盖整屏），所以**按子串匹配，不要按"独立对象"匹配**。
- 找不到就说"没找到"，不要说"没有"；`match_count=0` 是判据，不是失败。
- **`--summary` 里 `state` 就是状态名**（全量回执里是 dict；两者不同型是历史包袱，别混用）。
- OCR 是**常驻 `ys-lookd`（GPU）**：`look`（活体/`--frame` 离线帧）都走它。
  **不要**截整帧 Read 图、**不要**用 `.scratch/gui-grounding/venv-rapidocr`（与守护抢 GPU 会
  `Failed to allocate memory`——那天就是这么绕远的）。离线 venv 只在"守护没起、要读历史帧"时用。

## 3. 状态词表（13 态，`PRECEDENCE` 消歧）

编辑器侧：`EDITOR / MENU / SAVELIST / PLAYTEST / PAUSE / SETTLE / LOADING`
原神本体：`GAME_WORLD / GAME_PAIMON / GAME_ACTIVITY / GAME_FRIENDS / GAME_CHARACTER`
兜底：`UNKNOWN`

- 同层多态同时成立时按 `PRECEDENCE`（面板 3 > 派蒙/活动 2 > 世界 1）取**唯一最高**；
  仍并列就报 `AMBIGUOUS`（**不猜**）。
- 本体判据靠 OCR 文本：派蒙菜单 = 「冒险等阶 / 世界等级 / 左 UID」；世界 = 「右下 UID + 底部数字 + 无派蒙面板」；
  好友 = 「好友标题 + `x/200` 计数」；角色 = 「命之座 + 圣遗物」。
- **黑屏/无内容帧必须判 UNKNOWN**（当前尚未落地，见账本 F-20261021-48）。

**屏幕占用契约（2026-10-21 重设计：许可 / 占用 / 观测三件事解耦）**：这个桌面不是只有我们在用。

> 旧模型把三者绑在**一个秒表**上，实测反作用：租期是稀缺资源 ⇒ 代理为省租期把整条流程
> 预写死（用预判代替观察，用户当场点破）；且「有效期内禁续期」与 `ys-session begin` 自带的
> grant 互斥 ⇒ 两次 60s 租期 0 次注入。

① **先看屏幕在谁手上**：`ys-lease kwin-state` 的 `active`（KWin 权威；`xdotool getactivewindow` 会给 1×1 幽灵窗）。
② **许可 = 任务级，一次知情**：问用户「我要做 X，预计 N 分钟，期间会占用屏幕 M 次点击，你随时可以叫停」，
   同意后 `ys-screen-grant grant --task <任务id> --eta 120 --reason '做什么' --user-said '<用户原话>'`。
   **同一 `--task` 内续期不打断用户**（累计上限 1800s）；换任务必须重新问（无 `--user-said` ⇒ `TASK_MISMATCH`）。
③ **占用 = 动作级，空闲即还**：租期**不等于**屏幕被占。`ys-focus-guard` 每 0.5s 轮询，会话静默超过
   `idle_ms`（缺省 **3s**，`YS_SESSION_IDLE_MS`）就把屏幕交还用户；下一个动作由 `ys-scroll`/`ys-pointer-click`/`ys-esc`
   **内部自动重取焦点**（模型无感，照常调同一个工具；取不回焦点 ⇒ **rc=7/rc=4 拒绝注入**，绝不打进你的窗口）。
   ⇒ **模型思考的时间不计费**，也就没有"为省租期批量跑"的动机。
④ **凭据**单次 `--eta ≤300s`、必须带 `--user-said`；**切虚拟桌面是更重的动作**（会话内授权即含桌面借用，
   非会话的 `ys-follow-win` 额外要 `YS_ALLOW_DESKTOP_SWITCH=1`）；没有有效凭据时 `ys-gui-slot` 以 **rc=6 NO_GRANT** 拒绝（自测走 `YS_SLOT_TEST=1`）。
⑤ **禁止批量**：租期不再限制思考时间 ⇒ **没有"趁租期把后面几步一起跑完"的理由**。一步一看是默认形态
   （2026-10-21 用户原话：「你连好友页面都没打开，凭什么判断剩下的步骤可以一次不错就完成」）。
**反模式**：不要自授——那天代理 64s 处 `grant --seconds 1200` 没问用户，65s 就切走了桌面。发现「自己在给自己发凭据」= 立刻停下问用户。
缺这一步的代价：用户同时在操作屏幕 ⇒ 焦点/画面被夺 ⇒ 出现"莫名其妙的 bug"（已记 F-20261021-50）。

## 4. 仪器健康（先看这两个，再谈判据）

| 东西 | 怎么查 | 判据 |
|---|---|---|
| `ys-lookd`（GPU 常驻判态） | `systemctl --user status ys-lookd` | 单请求有界：`YS_LOOKD_RECV_TIMEOUT=10s` / `YS_LOOKD_HANDLER_TIMEOUT=90s`，超时回 `RECV_TIMEOUT`/`HANDLER_TIMEOUT`——**不再允许静默挂住** |
| `ys-capture`（XShm 常驻抓帧） | `tools/ys-editor/ys-capture status` | `daemon_alive && seq>0 && last_err==""`——**进程活着 ≠ 在产帧** |
| 一键拉起 | `tools/ys-editor/ys-eyes-up` | exit 0 就绪 / 2 没窗口 / 3 守护不产帧 / **5 在产帧但窗不在当前桌面** |
| 跨桌面 | `tools/ys-editor/ys-follow-win` | 只读探测不加 `--switch`；KWin 报 `desktop=all` 就是「在所有桌面」 |

## 4.5 回归测试默认不许碰屏幕（2026-10-21 用户反馈「说完成了却还有操作音」）

任何走 `ys-gui-slot` 的测试 = **真的抬窗、真的抢焦点、用户会听到声音**。
所以「动真屏」的测试必须显式开门：`YS_ALLOW_SCREEN_TEST=1`，否则 SKIP。
已加闸门：`tests/focus-default.selftest.sh`、`tests/screen-grant.selftest.sh` 的 T6。

**为什么这条重要**：`failure-ledger check --fast` 每次都会跑这些测试。那天代理跑完门禁说"已完成"，
用户却又听到操作音——因为 T6 传的是 `true`（空命令）却照样占屏。
**判据：测试里的 `ys-gui-slot` 只允许出现在 `YS_ALLOW_SCREEN_TEST=1` 分支里。**

## 4.55 读帧层级必须自报（2026-10-21 用户当场纠正）

`--allow-background` 读的是**后台缓冲帧**：它能证明「*看得见*」（像素真实、OCR 坐标真实），
**证不了「动得了」**（画面在不在栈顶、动作真的发没发出去、用户看不看得见）。
⇒ 报告里必须写清验证层级：**感知层（后台帧）/ 可见交互层（抬窗 + 真实注入）**。
把后台帧结果写成「真机复验通过」= 过度表述，已记 F-20261021-58 的措辞纠正。

## 4.6 听到「提示音」先查 X11 铃（2026-10-21 三次复盘）

**判据**：`pactl list sink-inputs` 看到 `application.name=KWin` 且 `media.name=bell` ⇒ 是 X11 响铃，
不是窗口操作、也不是游戏音效。**最常见来源 = ImageMagick `import` 抓帧**（每次抓帧敲一次铃）。
本仓所有 `import` 调用必须带 `-silent`；闸门 `no-xbell` 静态扫描裸调用。
抓帧后的旧守护进程不会自动加载新代码——改完要 `systemctl --user restart ys-lookd`。

## 4.6 跨虚拟桌面（2026-10-21 第 3 次撞到）

**现象**：`ys-lease resolve-window` 回 `TARGET_NOT_FOUND`，但 `ys-wins --attrib` 明明能看到游戏窗。

**根因**：`kwin_state()` 基于 `stackingOrder()`，**只列当前桌面的窗口**；游戏在别的桌面时必然落空。
（`ys-wins` 走的是 `windowList()`，能跨桌面 —— 两个通道的**视野不同**，别拿一个的结论否定另一个。）

**现在的失败输出**（已修，`F-20261021-61`）：
```json
{"error":"TARGET_NOT_FOUND",
 "reason":"目标窗在另一个虚拟桌面：KWin 当前桌面窗口表里没有它",
 "state":{"found":true,"window_desktop":"3","current_desktop":"2","minimized":"0"},
 "next_action":[ys-follow-win --dry, ys-follow-win（需授权）, 请用户手动拖回]}
```

**两条路，必须让用户选**：
| 选项 | 做法 | 代价 |
|---|---|---|
| A 手动 | 用户把窗口拖到当前桌面 | 零打扰，最快 |
| B 自动 | `YS_ALLOW_DESKTOP_SWITCH=1 ys-follow-win yuanshen.exe` | **换掉用户整屏**，需用户明确说一句 |

**2026-10-21 用户令（简化）**：`ys-session` 内**屏幕授权即含桌面借用**——游戏在别的桌面就自动切过去，
`end` 时自动切回 `prev_desktop`（firefox 所在桌面）。不需要另设 `YS_ALLOW_DESKTOP_SWITCH`；
那个变量只给**非会话**的 `ys-follow-win` 单独使用。

**选 B 时的交还判据是三件套**：`active=用户窗` **且** `idx(用户窗)>idx(游戏)` **且**
**当前桌面 = 开始时那张**。只把焦点还回去、桌面留在游戏那张，等于没还。

## 4.7 三条实测坑（2026-10-21 二次真机会话复盘）

1. **`grant` 必须单独成条**：把 `grant … && <100s 的 slot 操作>` 串成一条命令，
   耗时全部算到 grant 头上（实测一次 78.4s，而 grant 本身 1.1s）⇒ 复盘/归因全错。
2. **`ys-esc` 自带槽，不要再套**：`ys-gui-slot <win> 20 ys-esc` 是双层占用（实测 12.2s）。
3. **不要用裸 `import -window` 抓图**：会敲 X11 铃（用户听到莫名声音）且拿到旧缓冲；
   要帧用 `ys-capture latest`，要判读用 `worldsvc look`。会话里的临时命令不受仓库门禁 `no-xbell` 保护，
   所以这条只能靠技能记住。

## 4.8 干净房间核验暴露的 4 条硬坑（2026-10-21，新代理 120s 未完成）

> 一个只加载本技能的干净代理，120s 内**没做完任务**，卡点全在这里。以下每条都实测过。

1. **`ys-session begin` 之后的前 1–2 次 `look` 可能回 `ATTRIBUTION_OTHER_DESKTOP`**（归属闸门竞态，
   而且错误正文可能自相矛盾，如"窗口在 ds=3、当前 ds=3"）。
   ⇒ 判据：begin 后**第一次 look 失败就重试，最多 3 次、每次间隔 ~1s**；3 次都失败才停手。
2. **`ys-scroll` 的 `rc=5` ≠ 动作失败**：`budget.over=true`（超过 500ms 目标）就会给 rc=5，
   而 `moved_confirmed` 可能同时是 true。
   ⇒ 判据：**先看 `moved_confirmed` 与首行文本**；只有 `ok:false` 且 `moved_confirmed:false` 才算失败。
   按"rc≠0 立即停手"会把一次滚动做成两次注入（实测 14 次里 7 次是重复的）。
3. **`moved_confirmed` 会假阳性**：实测 7 帧逐字一致（首行 y、末行 y 完全没变）却报 `true`。
   ⇒ 判据：**用"本帧首行行名是否变化"作为唯一滚动判据**；`moved_confirmed` 只当辅助信号。
4. **滚动前必须确认坐标空间**：`--at` 吃**物理像素**（2560×1440），y 必须 < 窗口逻辑高 960 的
   物理对应值；传逻辑坐标会"回执成功但画面不动"。

## 4.9 seek（跳到列表任意位置）——2026-10-21 新增，**有滚动条就能一跳到位**

长列表不要一屏屏线性扫。先看**有没有滚动条**，有就直接跳。

```bash
# ① 读滚动条（只读像素，不占屏，84–200ms/帧）
tools/ys-scrollbar /tmp/frame.png --json
#   ⚠️ 即使给 --json，stdout 也是「一行人读行 `SCROLLBAR-RESULT …` + 一行 JSON」。
#   json.loads(整个 stdout) 会抛 Extra data ⇒ 解析崩 ⇒ **seek 根本没执行**，
#   而后面的 look 画面没变，很容易被误读成"seek 失败/拖动无效"（2026-10-21 实际踩过）。
#   ⇒ 解析时取**最后一行以 `{` 开头**的 JSON。
# → {"found":true,"orientation":"v","track_bbox":[...],"thumb_bbox":[...],
#     "position_ratio":0.012,"estimated_pages":17.31}
```
```bash
# ② 跳到目标位置（在 ys-session 内；物理像素坐标）
ys-scroll --at <thumb中心物理x>,<thumb中心物理y> --seek-rows 91 --total-rows 173 --frame /tmp/frame.png
#   --at 是**拖动起点**（必填，取 thumb_bbox 的中心）；不给会报 required: --at
#   --total-rows 只在 --seek-rows 时必需（从标题 `x/y` OCR，如「我的好友 173/200」）；
#   **二分用 --seek-ratio 不需要 total_rows，应作首选**
#   不给会报 MISSING_TOTAL_ROWS —— estimated_pages 实测偏小 ~1.45×，用它会把 r 算成 0.80（真值 0.54）
#   --seek-ratio 0.0–1.0 也可以（已知目标比例时）
```

**判据**
- `found=false` ⇒ 该界面**没有滚动条**（或不是列表）⇒ 退回滚轮小步，**别假装能跳**。
- 有滚动条 ≠ 一定能拖到：`after_ratio` 与目标的差 >0.08 就补一次微调，不要连拖。
- ⚠️ **seek 后 `after_found:false` 不代表失败**（实测 4 次里 3 次为 false 而画面已跳对，且 `error/reason` 为 null）。
  判据：**以 before 帧的 `found` 为准决定"能不能 seek"**；跳没跳对**只看 look 后首行行名**。
  若照"found=false ⇒ 退回滚轮"执行，会在第一次成功跳转后就放弃 seek。
- 帧从哪来：`ys-capture latest --out /tmp/f.png --format png --encode-if-needed`（`ys-scrollbar` 吃 png）。
- `estimated_pages` **不可用于 seek**（偏小 1.45×），只作"这列表大概几页"的粗估。
- 6px 宽的滚动条在**容器层/OCR 层完全看不见**，但像素通道能稳定检出（滑块比槽亮 +110 灰阶）。
  ⇒ **"结构层看不见" ≠ "视觉不可见"**：先跑 `ys-scrollbar` 再下结论。

## 4.10 「能力存在 ≠ 可达」——三环缺一，干净代理就退回笨办法

2026-10-21 实证：`ys-scrollbar`（工具）+ `ys-gates`（门禁）+ 技能章节，是三件独立的事。
当天工具与门禁都已绿，但**技能 §4.9 比干净核验晚写了几个小时** ⇒ 那个代理只能用滚轮线性扫，
173 行扫不动。补齐技能后同一能力被第三方 4 次 `--seek-ratio` 二分用成。

**判据（每次做完新能力都自问）**：
1. 工具能跑吗（有 CLI、有自测）？
2. 门禁在跑吗（`ys-gates` 里能看到它、注入用例会变红）？
3. **技能里写清"什么时候用它、怎么用、判据是什么"了吗？**

三环缺任一环，能力对"只读技能的新代理"就等于不存在。只做前两环是给自己看的，不是给接手者的。

## 5. 五条实测坑（都交过学费）

1. **坐标会漂**：菜单刚打开时布局还在动（tile 网格 y 从 478/668/856/1046 漂到 452/572/760/950，≈94px）。
   照首读 bbox 点击会落到**相邻格子**。⇒ 用 `settled.same_as_prev==true` 当动作门。
   ⚠️ 但**别把「稳定」实现成「逐字相等」**：2026-10-21 实测那样连续 12.5s 都等不到 true（OCR 抖一个字符就废），
   而点击其实是对的。容差判据见 §2，唯一实现 `ys_settle.py`。
2. **滚动会假成功**：`ys-scroll` 旧版画面逐像素一致仍 `rc=0`。现在有 `frame_diff` + `moved_confirmed` 三态，
   没动即 **`rc=6 NO_MOVEMENT`**；`--no-verify` 时不回答「动没动」，别拿它当成功。
3. **跨仪器会打架**：`ys-capture`（XShm 直读窗口）能拿到**全黑帧**，同一刻 `ys-lookd`（`import -window`）
   可能拿**旧缓冲**并照旧判态。⇒ 状态异常先问「这一帧是哪台仪器、多老」（F-20261021-48）。
4. **对话框会吞 ESC**：游戏内对话/选项打开时 ESC 先关对话、不开派蒙菜单。判据：`free_text` 出现
   「临时 / 1 / 2 / 3」这类选项文本 ⇒ 别连续空按 ESC。
5. **服务卡死时客户端要出声**：`daemon_rpc` 默认 60s、超时单列 `DAEMON_TIMEOUT`，消息里直接给
   `systemctl --user restart ys-lookd`；看到 `DAEMON_DOWN` 但服务 active ⇒ 去看守护自己的 `stage=grab` 日志。

## 6. 证据与防线（改这个模块时必须一起动）

- **证据最小集**：`evidence/<case>/` 里的 `s*.json`（模块原始回执）+ `round.json`，**不是截图**。
  实例：`.scratch/gui-service/evidence/friends-run/`（s0_world → s3_boundary，能重推出边界行的 frame_id；**具体答案不写在这里**——写进技能会让后续代理"背答案"而不是"做任务"）。
- **失败账本**：新踩的坑登记到 `tools/failure-ledger`，`prevented` 必须绑一条**可跑闸门**且带**注入用例**
  （`tools/ys-editor/tests/ledger-inject.sh`），否则全量 `check` 会报 `UNPROVEN` 并判 FAIL。
- **门禁**：`./tools/ys-gates --only 2`（含 lookd-wedge / scroll-movement / state-precedence 三个套件）、
  `--only 5`（单一源：判据不许复制）、`tools/ys-guards`（白名单投影等）。
- **架构真相**：`docs/architecture/gui-world-state.md`（schema、三动词、成本口径、§6 单一源表）。

## 6.5 能力边界：我们**没有**的东西（写清楚，防止假装有）

| 没有 | 现状 | 后果 / 应对 |
|---|---|---|
| `clickable` 置信度 | 只有占位符 `unknown` | 不能回答"这个能不能点"；靠 `kind` + 经验，别声称有把握 |
| 容器置信度分级 | 无 | 假阳性与真对象同权；跨帧比对（settled）只能事后发现不稳定 |
| 界面全集 | **单帧只看得见 65–71%** | 「这个界面有 N 个操作点」必须乘 1.4–1.5，且要滚动枚举（`ys-states`） |
| 黑屏/空白帧判别 | **没有**（账本 F-20261021-48，open） | 帧全黑时仍可能沿用旧判定；异常时先看帧亮度/来源 |
| 跨帧对象追踪 | 无稳定 id | 只能比"前后两帧一致"，不能追踪"那个按钮去哪了" |
| 字体/分辨率鲁棒性 | 判据靠 OCR 文本 | 换字体/缩放会掉字 → 掉判据 → 掉态 |
| 后台帧用于动作 | 明令禁止 | `--allow-background` 只给离线分析，拿它做动作会点到别处 |

**写新判据前先看这张表**：表里"没有"的东西，不要在技能/汇报里写成"有"。

## 6.6 与 `computer-use`（全局技能）的分工

| 目标 | 用哪个 | 判据 |
|---|---|---|
| 原生 GTK/Qt 应用（有 AT-SPI 语义树） | `computer-use` 的 `cu` | `cu apps` 里能看到它 |
| **Wine 应用（原神/千星编辑器）** | **本技能** | `cu apps` 里没有它；`cu state` 空文本 |
| 「这个界面一共有几个操作点」 | 本技能 + 滚动枚举 | 单帧 × 1.4–1.5，且必须滚动 |
| 「这个词在屏幕上哪里」 | 本技能（对象级 OCR）/ `paddle-vl-ocr` | 需要精确文字时 |

> `computer-use` 的 Wine 那一节已经改成"转本技能"——两条路不要各写一份判据。

## 7. 什么时候转别的技能

| 要去哪 | 转给 |
|---|---|
| 开试玩、注入键鼠、取节点图日志、焦点归还 | `device-playtest-loop` |
| 给界面帧标 bbox 真值、造检测训练集 | `gui-annotation` |
| 解析 `.gia` 日志、还原节点执行 | `debug-log-investigator` |
| 改被感知的界面本身（编辑器/UI 资产） | `genshin-ts-asset-operations` / `ui/AGENTS.md` |

## 8. 技能缺口与能力缺口同账（用户令 2026-10-21）

**能力 = 工具 + 判据 + 技能。** 只把能力做进代码，下一个会话就没有它——技能是生效载体，不是文档。
所以：新增 verb / 新判据 / 新退出码 / 新 known_gap ⇒ **同一轮写进本文件**，否则等于没做。

机械校验：`python3 tools/ys-editor/tests/skill-coverage.selftest.py`
（`capabilities` 里列出的每个 verb 必须能在本技能里 grep 到；三个技能文件必须存在；
本段规则本身也在检查范围内）。闸门名 `skill-coverage`，接在 `failure-ledger check` 里。

**触发条件→动作**：写完任何新能力 → 立刻在 `capabilities` 里登记 verb 与 skills 指针 →
跑 skill-coverage；红了说明"代码有、技能没有"，别交付。

## 9. 占用会话 `ys-session`（2026-10-21 反馈轮新增）

一次 grant 内多个动作共享一次窗口上下文；别再「一动作一 slot」（真机实测 4–5s/次）。

```bash
# begin 内部**自己**会跑一次 `ys-screen-grant grant`（不绕过用户授权）。
# 2026-10-21 重设计后这条不再互斥：先把任务 id 想好，begin 用同一个 --task 即可；
# 同一个任务内重复 begin/grant 是**续期**（回 "renewed": true），不会 GRANT_FAILED。
tools/ys-editor/ys-session begin --seconds 90 --task friends-scan --reason '扫好友列表' --user-said '<用户原话>'
# 会话内 ys-scroll / ys-pointer-click / ys-esc 自动直注入（读 ~/.ys/session.json）
tools/ys-editor/ys-session status      # 回 left_s / released / reacquires / idle_ms
tools/ys-editor/ys-session focus       # 动作前自动重取焦点（**动作工具内部已自动调用**，通常不用手敲）
tools/ys-editor/ys-session end         # 统一 restore firefox + revoke
```

**层 2 行为（2026-10-21 用户令）**：模型思考时 `ys-focus-guard` 会在静默 `idle_ms`（缺省 **3s**）后
**自动把屏幕交还用户**；下一个动作到达时动作工具**内部自动重取焦点**，模型侧调用方式完全不变。
`released / reacquires / release_reason` 三个字段就是这条链的读数。
取不回焦点 ⇒ `ys-scroll` rc=7 / `ys-session focus` rc=4，**拒绝注入**（绝不打进用户窗口）。

**指标口径（2026-10-21 纠正）**：`有效占用比 = (inject_ms+verify_ms)/占用总时长` 是**利用率**指标，
它奖励"把屏幕占满"，与用户利益相反 ⇒ **降级为诊断项，不作为 KPI**。
对用户汇报的是**成本**：打扰总时长、抬窗次数、知情次数、交还延迟；数字必须能从 `~/.ys/` 的回执重算，
不许只报自算的百分比。

### 9.1 按键一律走 `ys-key`（2026-10-21 找甘雨实任务回灌）

```bash
tools/ys-editor/ys-key e --wait-change 150,25,760,105      # 切下一个角色，等名字条真的变了
tools/ys-editor/ys-key c --plan                            # 只解析键码，不注入（离线可测）
tools/ys-editor/ys-key esc --hold-ms 80
```

它把三件事合成一步，**别再手写 `ydotool` 循环**：
1. **心跳**：先跑 `ys-session focus`（刷新 `last_action_ts`，必要时重取焦点）；取不回 ⇒ **rc=7 一个键都不发**。
2. **按键**：键名→Linux input code（`c=46 e=18 q=16 esc=1 space=57`），`--repeat`/`--interval-ms`。
3. **变化判据**：`--wait-change x,y,w,h` 按下后轮询该区域像素哈希，变了才 rc=0；超时 **rc=8 `changed=false`**
   （即"这一下可能被动画吞了"，扫描循环据此重发，而不是连拍同一帧）。

**为什么重要（同一天真机踩出来的）**：裸 `ydotool` 不刷心跳 ⇒ 守护按静默 3s 把屏幕交还用户、
桌面切走 ⇒ 后续按键**打进了用户正在用的窗口**（那天往 firefox 里发了 e/q）。凡是要连续注入的循环，
每一步都必须经过 `ys-key`（或自己调 `ys-session focus`）。

live 帧默认走 `ys-capture latest`（~32–46ms），失败回退 import 并在 `look` 回执
`timing.frame_source` 标 `ys-capture|import-fallback|import`；归属类拒绝仍 fail-closed。

## 10. `advice[]`：模块主动指出「笨办法」（2026-10-21 用户令）

`world` 顶层新增 `advice[]`（**只建议、不阻断**；空数组=没有）。当前规则：

- 有序列表：≥3 个 `kind=row`（高度 ±20%）+ 标题 `\d+/\d+` + 可排序属性（`N天前/小时前/分钟前`，`今日内`=0）。
- 线性扫：同一 `list_sig` 连续 ≥3 次 look，净推进 < 视口且 count >> 已见 ⇒
  `SCANNING_LINEARLY`（带 `attribute` + `order` + `estimate{net_rows_per_step,linear_screens_remaining,
  linear_seconds,bisection_probes,bisection_seconds}`；estimate 只用实测数）。
- 单调度不成立 ⇒ `SUGGEST_JUMP_ONLY`（不给二分估算）。
- `look --no-advice` 关闭并清空 daemon 会话状态；换界面/换列表自动清。

唯一实现：`tools/ys-editor/ys_advice.py`；回放自测 `tools/ys-editor/tests/advice.selftest.py`
（机读行 `ADVICE-RESULT ... verdict=PASS`），已登记 `ys-gates --only 2` 套件与账本 F-20261021-63。

## 11. 测试夹具纪律（2026-10-21 门禁红回灌）

**夹具不许放 `.scratch/gui-service/evidence/**`**——那是真机跑会覆盖的生产目录，门禁会随机变红且分不清"夹具没了"还是"逻辑坏了"。
- 稳定夹具放 `tools/ys-editor/tests/fixtures/<topic>/`（例：`fixtures/advice/screens.json`）。
- 夹具缺失必须显式 `error=FIXTURE_MISSING` + 非零退出，禁止静默 FAIL。
- 账本 F-20261021-64；注入用例 `ledger-inject.sh advice-fixture-neg` 证明删夹具必报该错。
- 回归：`tools/failure-ledger check --fast` 要 `gate_fail=0`。
