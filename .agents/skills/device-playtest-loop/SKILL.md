---
name: device-playtest-loop
description: 千星真机（编辑器 + 沙箱客户端）试玩与取数的完整闭环。当任务需要**在真实游戏里验证玩法/资产/UI 行为**，或涉及：开试玩、退试玩、真机输入注入（键盘/鼠标/拖拽）、取节点图日志与负载、桌面 GUI 自动化点按钮、编辑器卡死自救、焦点占用与归还、截图判据、GPU 图像识别、试玩批次编排——必须使用本技能。它给出 `tools/ys-editor/` 工具链（ys-gui-slot / ys-playtest-start / ys-playtest-stop / ys-pointer-click / _ys-ui.sh / ys_look.py + ys-lookd 常驻服务 / 故障处置件）的用法、坐标与像素判据表、真机输入事件实测事实（43 键槽映射、拖拽阈值）、以及"一个试玩周期做完所有实验"的纪律。区别于 debug-log-investigator（只管日志格式与解析）与 qxqy-simulator（模拟器路线）：本技能负责**把真机实验跑起来、把数据取到手**。
---

# 真机试玩与取数闭环（device-playtest-loop）

> 最近校验：2026-10-17（技能族刷新 T01–T05：口径/命令面/权威指针/正向表述）

## 定位

把「人手工去游戏里点一遍、看一眼、记一下」变成**机器可执行的闭环**：

```text
准备（编辑器/沙箱就绪） → 试玩 ys-playtest-start → 注入实验批次（一次拿焦点跑完）
→ 退出 ys-playtest-stop（让 Debug_Log 落盘） → 离线解析 gia_log.py → 反馈 → 下一轮
```

本技能**只管"怎么把实验跑起来、把数据取到手"**；日志格式与语义解析归 `debug-log-investigator`，
玩法管线归 `game-from-scratch`，最小注入核验归 `verify-injection`。

**职责分离（与全局 `computer-use` 技能）**：

| 层 | 技能 | 内容 |
|---|---|---|
| 通用方法论 | **`computer-use`**（全局技能） | 桌面自动化的通用方法：成本链、优化四步、常驻服务通用式、`cu` 通道（AT-SPI 优先 / 截图 / OCR 兜底）、焦点协商通用规范 |
| **千星专属资产** | **本技能** | `tools/ys-editor/` 工具链、试玩流程与坐标判据表、真机输入事件事实、日志取数通道、编辑器故障处置件 |

**两者相互引用**：要做通用 GUI 自动化（非千星）→ 走 `computer-use`；要动千星编辑器/沙箱 → 走本技能，
方法层仍复用 `computer-use` 的成本链与优化四步。

## 何时用 / 不用于

| 用 | 不用于 |
|---|---|
| 真机验证玩法/资产/UI 行为、取输入事件、取节点图日志与负载 | 纯静态资产比对（走 `assets:*` 的 `--output` 候选回读） |
| 编辑器/沙箱窗口层故障（点不动、启动不了、焦点被抢） | 模拟器路线（走 `qxqy-simulator` 技能 / `gsts client:sim`） |
| 需要"点按钮→等画面→再点"的 GUI 编排 | 纯离线 GIA/GIL 分析（走 `tools/*.ts`） |

**先模拟器后真机**是默认顺序：能在模拟器验证的（UI 树/字段/试玩）先用 `qxqy-simulator` 或 `gsts client:sim`，
真机只留"模拟器证明不了的事"（真实输入、真实渲染、真实负载、真机 API 差异）。

## 铁律（违反 = 白烧十分钟以上）

> 完整条文见根 `AGENTS.md`「真机实验铁律」；这里给可执行版本。

0. **动手前先跑 `ys-preflight`**（2026-10-17 复盘产出）——它把「默认前提」做成一条命令：
   仪器是否走对通道、原神窗在不在栈顶、画面有没有停在结算页、编辑器在哪个态、**节点图挂载还在不在**。
   为什么是第 0 条：2026-10-17 那晚 15 个错误里最大一族是**默认前提未取读数就往下建**
   （用户原话「你又缺少探索就定目标」，出现两次），每条都白烧 ≥10 分钟。
   实测：首次跑就抓出「0 个宿主挂载 ⇒ 图不会执行」——那正是反复「日志里没有我的标记」的根因。
   退出码 1 = 有 FAIL，先修；2 = 有 WARN，读过再继续。
1. **注入必须在 `ys-gui-slot` 槽内**（2026-10-17 实证，**本技能最贵的一条**）：
   `ydotool` 只负责把事件送进内核，**事件进哪个窗口由当时的焦点决定**。
   实测：原神窗在堆叠序第 **[9]** 位、ACTIVE 是 **Firefox**，此时裸调 `ydotool key` 的键
   **全部送进 Firefox**——表现是「ESC 没反应」「按 W 玩家不动」「连按 6 次菜单都不开」，
   而真因是**根本没送到游戏**。正确写法：
   ```bash
   ys-gui-slot 0x01400001 90 bash -c 'ydotool key 17:1; sleep 3; ydotool key 17:0'
   ```
   槽内回读 `xdotool getactivewindow` 必须等于目标窗 id 才算数。
   ⚠️ `ys-kwin-raise` 的第一个参数是**标题子串**（如 `原神`）**不是窗口 id**；
   传 id 它会回报 `FAIL not-found`，读起来像"窗口不存在"，实际窗口好好的——**别信这条报错**。
2. **截图新鲜度判据**（2026-10-17 实证）：`import -window <id>` 在**窗口被别的东西压住**时
   返回**陈旧帧**——实测按空格前后两帧 **差异 0 像素（字节完全相同）**。
   ⇒ **「画面没变化」不能推出「输入没生效」**（本轮因此把一条待定结论误写成"玩家不能跳"）。
   判据：抓两帧必须**不相同**才算新鲜；否则先真抬升窗口（`ys-peek` 会抬升+抓图+还原焦点）再抓。
3. **一个试玩周期内把所有实验跑完**——一次进出周期 ≥3 分钟（UI 抖动 5~25s + 加载 30~60s）。做法：先把键盘/鼠标/拖拽/UI 操作**整批注入完**，再退出取日志。
4. **一个批次只切一次焦点**——用 `ys-gui-slot` 完成「拿到 → 跑完 → 归还」，批次内部保持同一个焦点时段。
5. **取数走「爆发注入 + 退出落盘 + 离线解析」**——屏幕有 2s+ 延迟甚至整帧冻结；这条通道又快又准。
6. **等待用「轮询 + 判据」**——按判据轮询（实测弹窗约 7s 出现、暂停菜单 >8s，固定 `sleep` 会漏）。
7. **读界面用 `read_image`（原生视觉）**——中文界面可读且零额外依赖。
   **OCR 只是文本通道，不是"读界面"**：`名字旁边有没有图标 / 区域是否被叠加层遮住 / 两个控件是不是一行`
   这类信息 **只在图里**（2026-10-17 实证：ESC 菜单页存档名右侧的圆形铅笔按钮 (523,96) 在本地/云端 OCR
   里**完全不存在**，我因此绕去右键菜单瞎试 40 分钟才被用户点破）。⇒ **抓帧后先看一眼整图，再查 OCR**。
8. **动作前身份断言，动作后同对象读回**（2026-10-17 实证）：列表/卡片类界面**坐标不稳定**——
   同一个 (1681,387) 在去程指向「输入探针v2」、回程指向「未分类页签_存档_1」。
   正确形态：`OCR 断言目标名在列 → 点 → 读确认框原文（会点名目标）→ 提交 → 在同一对象上读回`。
9. **rc 与 stderr 不许吞**：`ys-pointer-click` 的 `rc=5` = **12 轮未命中**（stderr 带目标与当前坐标），
   `rc=4` = 步进过小。调用点写 `2>/dev/null 2>&1` 会让"点空了"看起来像"点到了"（本轮同族 4 处已修）。
10. **命令限时**（全局守则第 5 条）：预计 >5s 就先优化、单条 ≤20s、长任务放后台。

## 三条 2026-10-19 用户/实测回灌（GUI 工作里反复踩）

1. **找东西先看已知索引，再考虑全仓搜索**（用户原话：「别扫盘，教程目录很明显」）。
   我为找本地官方教程跑全仓 `grep -rl`，60s 超时转后台；而 `docs/ui-tutorial/README.md` 第一张表就是文件地图。
   ⇒ 顺序恒为 **`ls` 一层 → 该目录 README/文档地图 → 定向 grep → 全仓搜索（需理由）**。
2. **评测通道过了 ≠ 生产线过了**（★ 常驻进程改代码不重启 = 没改）。
   `ys_lookd` 是常驻服务，检测器实例按路径缓存在 `_DETS`：**改 `gui_det.py`/`ys_lookd.py` 后必须重启 lookd**，
   且任何模型/解码改动都要额外报一条**生产入口 `gui_det.Detector.detect()`** 的读数（不能只报评测台数字）。
   重启姿势（`pgrep -f` 会自匹配，必须精确解析）：
   ```bash
   PID=$(pgrep -f '^python3 ys_lookd.py$' | head -1)     # 只取精确 cmdline
   [ "$(tr '\0' ' ' < /proc/$PID/cmdline)" = "python3 ys_lookd.py " ] && kill "$PID"
   rm -f /run/user/1000/ys-lookd.sock
   cd tools/ys-editor && DISPLAY=:1 XAUTHORITY=/run/user/1000/xauth_oypYEi \
     setsid nohup python3 ys_lookd.py > /tmp/ys-lookd.log 2>&1 < /dev/null &
   ```
3. **"恒定值 / 空列表"先判它是读数还是没接上**。2026-10-19 一天踩了三次同形态：
   判据只写在两条路径之一（state 漂移）、结果算出来没透出去（detections 不暴露）、
   条件回退被单个假阳性短路（"容器为空才回退"，世界里 CV 吐 1 个假 panel ⇒ 57 个真框全丢）。

## 四条 2026-10-21 回灌（「仪表说没事、其实没做事」）

1. **服务活着 ≠ 在产帧**。`systemctl --user is-active ys-capture` 是 active、`latest` 却回
   `DAEMON_DOWN`：因为守护进程起来了但每帧 `XShmGetImage xerr=8`（窗口 id 写死旧值 / 发现逻辑挑到同
   class 的子窗），而失败**零日志**。判据：`ys-capture status` 看 `state.seq` 是否在涨、`last_err` 是否空；
   排查看守护自己的 stdout 有没有 `stage=grab` 行。现在它是 systemd 常驻（`ys-capture.service`），
   机械防线 = 失败账本 `capture-liveness` 闸门。
2. **滚动必须能回答「动没动」**。`ys-scroll` 画面逐像素一致时**旧版照样 rc=0**，我因此连吃 3 次空滚。
   现在回执有 `frame_diff` + `moved_confirmed`（`null`/`false`/`true`），没动即 **rc=6 NO_MOVEMENT**；
   `--no-verify` 只用于「只要注入、不要证据」的场合，它**不回答**动没动。
3. **动作前先等 `settled`**。`world` 回执的 `settled.same_as_prev` 必须是 `true` 再点击：
   派蒙菜单打开后布局还在漂移（实测 tile 网格 y 从 478/668/856/1046 变成 452/572/760/950，约 94px），
   照首读 bbox 点 (677,556) 会落到「角色」而不是「好友」；稳定要 **8.8s**。
4. **游戏内有对话框时 ESC 先关对话框，不开派蒙菜单**（2026-10-21 实测）：连发两次 ESC
   （`ys-esc` 与槽内 `ydotool key 1:1/1:0`）后 `world` 仍回 `GAME_WORLD`，且 free_text 出现
   「临时」「3」这类对话选项文本 ⇒ 不是注入坏了，是**当前界面在吃 ESC**。判据：先读 free_text，
   看到对话/选项文本就先结束对话，别连续空按 ESC。
5. **状态词表已经细分到面板级**：`GAME_FRIENDS`（「好友」标题 + `/200` 计数）、`GAME_CHARACTER`
   （「命之座」+「圣遗物」）。同层冲突由 `PRECEDENCE` 消歧（面板 3 > 派蒙/活动 2 > 世界 1），
   并列仍 `AMBIGUOUS`。**走到派蒙菜单里的二级页面时，别再用 `GAME_WORLD` 当判据**。

**屏幕占用契约（用户令 2026-10-21，已做成设计）**：这个桌面不是只有我们在用。**每次长时间占用前**：
① 先看**当前活动窗口**（KWin 权威，`ys-lease kwin-state` 的 `active`；`xdotool getactivewindow` 会给 1×1 幽灵窗）；
② 在对话里**申请时长**，拿到同意后再 `tools/ys-editor/ys-screen-grant grant --seconds N --reason '做什么'`；
③ 凭据到期即失效。没有有效凭据时 `ys-gui-slot` 会以 **rc=6 NO_GRANT** 拒绝执行（自测走 `YS_SLOT_TEST=1`）。
缺这一步的代价：用户同时在操作屏幕 ⇒ 焦点/画面被夺 ⇒ 出现"莫名其妙的 bug"（已记 F-20261021-50）。

## 🖐「交还屏幕」= 切回默认屏（firefox），不是"恢复到我拿之前的窗"

用户口径（2026-10-21 第 N 次强调，已两次投诉）：
- 判据两条同时成立：`activeWindow == firefox` **且** `stacking.index(firefox) > stacking.index(原神)`。
  只 activate 不 raise = 焦点回去了、画面没回去（D424）。
- **占用时目标已在焦点也要切回**：那是 noop 租约，但释放仍必须归 firefox。旧实现直接 `return`，
  用户仍盯着游戏而回执 ok:true（已记 F-20261021-49）。
- 失败、超时、看守放弃 —— **一律切回 firefox**，且**非零退出**（rc=9），不许给调用方"可忽略的失败"。
- 底层：`ys-lease _restore(None)` + `ys-gui-slot` 的 `ALREADY_FOCUSED` 分支；
  回归 `tools/ys-editor/tests/focus-default.selftest.sh`（闸门 `focus-default`）。
- **报"屏幕已还"之前必须先取一次 KWin 权威读数**——`xdotool getactivewindow` 在 KWin/Wayland 下
  返回 1×1 幽灵窗（`0x200000`），拿它当"焦点还在游戏"会得出完全相反的结论（D428）。

## 受控槽内的环境边界（2026-10-17 实测，会反复踩）

`ys-gui-slot` 里跑的命令，与槽外**不是同一个文件系统视图**——以下四条都在槽内实测踩过：

1. **路径必须写对（2026-10-17 更正，原「槽内绝对路径不存在」结论作废）**：
   仓库在 `/home/h/**genshin-ts**`；写成 `/home/genshin-ts`（漏 `/h`）在**槽内外都** ENOENT，
   而 `stat /home/h/genshin-ts` 与 `stat .` 的 dev:inode 两域相同（`49:2794949`）⇒ **不是文件系统差异**。
   **教训**：rc=127 的报错文本里就有错误路径，我只看了退出码就归因成"环境不同"并写进契约（归因错误）。
   现行口径：绝对路径可用，但**用前先解析**（`ys-slot-check --lint '<cmd>'`：ABS-STALE）；槽内**优先** `./` 相对路径；
   **任何 rc≠0 先读消息文本，逐字核对里面的路径**，再谈归因。
2. **中文输入只能走剪贴板**：`xdotool type --clearmodifiers '云阶'` → 输入框出现 **`??`**（Unicode keysym 不被 Wine 接受）。
   可用做法（实测成功，OCR 读回 1.00）：
   ```bash
   ( printf '云阶' | xclip -selection clipboard >/dev/null 2>&1 & )   # 常驻，不能加 -loops 1
   xdotool key --clearmodifiers ctrl+v
   ```
   `-loops 1` 会在**第一次读取请求**（TARGETS）之后自杀 ⇒ 粘贴拿不到数据；用完 `pkill -x xclip`。
   槽**外**设剪贴板（没有 DISPLAY/XAUTHORITY）会静默失败，粘进去的是**原有剪贴板内容**（实测粘进了我自己的聊天文本）。
3. **`pkill -f` 会自匹配**：`pkill -f "xclip -selection clipboard"` 匹配到发起它的那条 bash 命令行本身 ⇒ 自杀。
   用 `pkill -x xclip`。
4. **ESC 有生效延迟**：按完立刻判会读到旧态（`MENU`），3s 后才变 `EDITOR` ⇒ 按键后用
   `ys-state --wait-state <态> --timeout N --poll 0.3` 轮询，别立刻判。

## 未知界面探索循环（2026-10-18 实测固化；遇到"从没见过的界面"时照做）

> 背景：用户出"未知任务"三个（回本体 / 打开活动 / 完成活动领奖），暴露的核心缺陷是
> **"在没见过的界面上找到该点哪里"仍依赖人给提示**。下面是把人眼判据变成流程的第一步。

```
① ys-screen <png>                 # 先拿整屏结构：text / controls / regions / adjacency / occlusion
② ys-layer <png>                  # 我在几层？有没有 scrim / modal？这层怎么退（close_controls）
③ ys-afford <png>                 # 可点性打分：红点 > 一小一大 > 局部亮度对比 > 圆环 > 邻近文字
④ 点 top-1（图标类用 --anchor <邻近文字> --offset dx,dy；有文字的直接 --text）
⑤ ys-watch --roi 断言变化         # 文字/颜色/数值/时间 变化事件；NO-CHANGE = 没点中或不可点
⑥ 无变化 → 回 ③ 取下一个候选；连续 3 个无变化 → 停，回到 ② 重新判层
```

**四条实测判据（用户给的设计语言，务必内建）**：
1. **红点/徽标（badge）** = "这里有待办"，可点性问题里**权重最高**（用户原话：「ui 上的红点设计，引导玩家去交付的设计」）。
2. **一小一大**：大背景里的小图形/小面板 = 设计出来的交互位（映影板的 ▶ 圆钮 125×130 就是入口，而队名/卡片全是死的）。
3. **暗面不可点**：多层级时被压暗的一边是 scrim，模态挡住的地方点不到——**交互遮挡 ≠ 视觉遮挡**。
4. **变化即证据**：点击后必须能在**同一 ROI** 上测到文字/颜色/数值/时间变化；只验证"终态"不算留证（账本 F-3-02）。

**两条反直觉事实（本轮踩过）**：
- `前往查看` 不是"关闭窗口"，而是去世界里的**映影板装置** ⇒ **窗口消失 ≠ 我点错了**，先判层级再判对错。
- 列表类界面**禁止固定坐标连点**：领一次奖列表就会滚动 ⇒ 一律"行标签 + offset"（账本 F-3-01）。

## 工具地图

| 工具 | 用途 | 关键点 |
|---|---|---|
| **`ys-preflight`** | **动手前的前提核验器**（铁律 0） | 12 条默认前提一条命令跑完；退出码 1=有 FAIL / 2=有 WARN；实测首次就抓出「挂载 0 个」 |
| **`ys-observe`** | **唯一取数入口**（读像素一律走它） | 读数**自带新鲜度证明**：窗口不在栈顶 → 打印 `NOT_ATOP` 并退 2，**拒绝给旧值**；越界探针报 `PROBE_OUT_OF_RANGE`（ImageMagick 会**钳制**坐标，必须自己校验） |
| **`ys-atop`** | **真正在最上层的窗口** | `ys-wins \| tail -1` 永远是 plasmashell 任务栏（1707×62）⇒ 整晚 `NOT_ATOP` 假警报；`ys-atop` 忽略高<200 或宽<800 的面板后取最上层 |
| **`ys-state`** | **13 态判据 + 回归集（唯一实现）** | 编辑器 MENU/SAVELIST/EDITOR/PLAYTEST/PAUSE/SETTLE/LOADING + 本体 GAME_WORLD/GAME_PAIMON/GAME_ACTIVITY/GAME_FRIENDS/GAME_CHARACTER + UNKNOWN（2026-10-21 补：面板态压过世界态由 PRECEDENCE 消歧，细则见 `gui-world-state`），每态 ≥2 判据；回归集 `calib/regress/` **19 帧含 8 负样本**，两通道 100%（`--regress --channel both`，门槛①）；子态 `PAUSE/SETTLE ⊂ PLAYTEST`；LOADING 尚无真实正样本（未验证） |
| **`ys-map`** | **按态决定动作的确定性切图** | `ys-switch-save` 是**奇偶切换 + 盲切**：方向反一次，编辑器就把内存旧版写回磁盘**静默覆盖 CLI 新增**；`ys-map` 先判态再动，切后 `ys-where2` 核验 |
| **`ys-loop`** | **一轮 9 步编排器** | focus → goto_my_map → map_leave → build(重挂) → map_enter → playtest_start → refocus → input → playtest_stop → artifact_new_log；**门禁只到「有日志/有标记」，不代表玩法通过**（见「验收标准」节） |
| **`ys-time-audit`** | **自我行为计量** | 从会话事件流按类别统计时间占比；实测推翻自我认知（等循环 70% / GUI 19%）；每轮跑一次，占比异常即链路有问题 |
| `ys-peek <out.png>` | **抓真值图** | 真抬升窗口 + 全屏 `spectacle` + **自动还原焦点**；被遮挡时 `import -window` 会返回陈旧帧 |
| `ys-act <脚本> <out.png>` | **「抬升→动作→抓新鲜图→还原」一条龙** | GUI 的主力工作单元；脚本内可用 `_ys-ui.sh` 的判据函数 |
| `ys-wins` | **KWin 堆叠序**（底→顶） | 判「屏幕上那点是谁」的**唯一权威**；`import -window`/xdotool 都答不了这个 |
| `ys-put <x> <y>` | 指针绝对定位（**只移动不点**） | **只用外部回读**（`xdotool getmouselocation`）验证，不匹配即非零退出、**绝不打印 OK** |
| `ys-kwin-cursor` | 读指针位置（逻辑坐标） | X11 回读失效时的权威通道；`ys-kwin-put` 已废弃（自证陷阱），改转发到 `ys-put` |
| `ys-drag <x1> <y1> <x2> <y2>` | 绝对坐标拖拽 | 按下 → 分步移动 → 抬起；用于相机环绕/视野转动/滑块 |
| `ys-reload-map` / `ys-reload-keep` | **让编辑器从磁盘重载** | `-keep` 版会**保住 CLI 写入**（快照→离开→还原→重进）；CLI 写回 .gil 后必走 |
| `ys-esc` / `ys-goto-map enter\|leave` | 发一次 ESC / 确定性切图 | `ys-goto-map` 每步用 `ys-where2` 核验，不靠奇偶 |
| `ys-state` | **界面态判定唯一实现**（13 态 + 两测量通道 + 具名探针） | `ys-state --json`（活体）/`--frame PNG`（离线）/`--print-state --fast`（给脚本用）。判据（像素坐标/阈值/投票规则）**只在 ys-state 一个文件里**；旧 `ys-fast`(三态) / `ys-ui-state` 已改为薄封装转发 |
| `ys-state --probe/--wait` | 具名探针（按钮/弹窗可见性） | `--probes` 列 8 条探针与判据数；`--wait <探针> --expect visible|hidden --timeout N --poll 0.2` 是**唯一的同步等待方式**（禁裸 sleep） |
| `ys-where2` | **当前地图身份** | 系统菜单标题模板匹配（score 0.9999）；须先处于 MENU 态 |
| `ys-round` | **一轮执行器**（自带证据） | 离开→构建→进入→试玩→注入→退出→判定→`~/ys-round/<ts>/report.md`；判据已改用 `ys-where2` |
| `ys-gui-slot <win> <秒> <命令…>` | **焦点占用包装器** | 记原焦点 → 激活并核验 → 硬时限 → `trap EXIT` 严格归还（前焦不可用时回落 firefox/DSH 页）。**一批次只调一次** |
| `ys-playtest-start [win]` | 开始试玩 | 判页面（磁贴可见就直接点）→ 点「试玩」→**轮询**弹窗→「直接上传」→「开始游戏」；实测 ~8.3s |
| `ys-playtest-stop [win]` | 退出试玩 | ESC →「中断挑战」→「离开」；**已改轮询式**（去 11.5s 固定 sleep）；暂停菜单可能 >8s 才出现，判据超时要给足 |
| `ys-pointer-click <x> <y> [tol] [ratio]` | 闭环定位 + 点击 | 本机**无绝对指针定位**（`ydotool -a` 无效、XTEST 在 Xwayland 死）⇒ `xdotool getmouselocation` 读回 + 相对步进，第 N 轮命中 |
| `_ys-ui.sh` | **判据库** | `judge/is_light/is_dark/wait_light/wait_dark`；**只截 40×40**（84ms vs 全窗 5893ms） |
| `ys_look.py` | 模板匹配 | CPU=积分图+FFT 精确 NCC（小图）／GPU=torch FFT+cumsum（大区）；**按成本链自适应** |
| `ys-lookd.py` + `ys-lookd.service` | **GPU 常驻服务** | 摊掉 `import torch` 2~3s + CUDA ~1s；客户端自动优先走服务、连不上回退本地；实测全窗 **4.4s → 1.0s** |
| **`ys-screen`** | **屏幕摘要层**（像素→界面：文本/控件/分区/邻接/遮挡/人读摘要） | `ys-screen <png> [--json]`；离线只读帧；稳态 0.7~1.0s/帧（冷跑 4.5~8.6s 是 RapidOCR 自身开销）。**邻接**是核心：`「云阶」→ circle@(516,86) 右侧 338px` 这种"名字旁边有颗钮"的关系，OCR 永远给不出来 |
| **`ys-layer`** | **层级/模态/压暗层**（我在第几层？怎么退？） | `ys-layer <png> [--json]` 输出 `scrim/modal/panels/close_controls/advice`；**交互遮挡**（模态压暗）与 `ys-screen` 的**视觉遮挡**（DXVK 叠加层）是两回事。自测 `tests/layer-selftest.sh` 5 帧 9 断言 |
| **`ys-find`** | 多通道找控件 + 单目标解析 | `ys-find --frame <png> --text <标签> [--expect x,y] [--tol N]`；**解析实现只此一处**（`ys-pointer-click --text/--anchor` 内部调它）；文本匹配 NFKC+去空白+casefold 全等，**不做模糊** |
| **`ys-safe-kill`** | 安全杀进程 | `/proc` 先解析（pid/ppid/comm/cmdline）→ 排除自身+全部祖先+pid1+他人进程 → 打印"将要动谁" → `--yes` 才动；只剩自身时 `SAFE-KILL-SELFMONLY` |
| **`ys-safe-rm`** | 安全删文件 | realpath 解析 + 拒未展开 glob/`$` + 保护 `/`、家目录、仓库根、cwd 及其祖先、`.git`、系统目录；目录必须 `-r` |
| **`ys-slot-check`** | **执行域自检**（槽内/槽外能力对账） | 20~24ms；`--in-slot/--outside` 断言域、`--lint '<cmd>'` 动作前审（`ABS-STALE`/`CLIP-NO-DISPLAY`/`SELFKILL`）、`--need cap,...` 前置闸门；期望写在 `domain.json` |
| **`ys-env.sh`** | 源出桌面环境变量（`DISPLAY`/`XAUTHORITY`/`YDOTOOL_SOCKET`） | 每个 `ys-*` 脚本开头都会 source。**槽内/槽外是两套环境**：槽外设的剪贴板进不了槽（见「受控槽内的环境边界」）；手跑命令前先 `. tools/ys-editor/ys-env.sh`，否则 `xdotool`/`xclip` 报 `DISPLAY is empty` |
| **`ys-gates`** | **六门槛唯一验收器**（能力层过没过，一条命令给读数） | `./tools/ys-gates` 退出码 0 只在全 PASS（1=有 FAIL / 2=有 BLOCKED）；六条=①判定回归 ②假成功 ③性能 ④证据 ⑤单一源 ⑥操作目录；**不重实现任何判据**，只聚合；契约 `docs/maintenance/gui-gate-contract-2026-10-17.md` |
| **`ys-wait`** | **谓词等待**（禁裸 sleep 的执行体） | `ys-wait --until '<命令>' --expect <值> --timeout N --poll 0.3`；命令失败/超时即非零退出并打印最后读数（别用 `sleep N` 冒充同步） |
| **`ys-nav`** | 状态驱动的编辑器导航 | 判据全部委托 `ys-state`（本文件无坐标/阈值）；替代旧的 `ys-ui-state`(11.2s)/`ys-map where`(13.5s) 慢路径 |
| **`ys-verify-vision`** | **视觉判定双通道对账**（V3/V4） | 两条独立通道各判一次，输出 PASS/DIFF；单通道的失败模式是**你根本不知道它错了**（草地阴影被当成存档页那次） |
| `ys-game-env` | 游戏侧环境变量 | 提供 `GSTS_LOCALLOW_DIR` 等（CLI 读写 `.gil`/日志目录必须），脚本 `source` 后再调 `gsts` |
| `tools/ys-editor/README.md` | 完整 playbook | 坐标表、判据表、注入/取数实测事实 |
| 故障处置 | `ys-unstick`（程序化 1px 往返）／`ys-unstick2`（最小化→恢复，Wine 59965）／`ys-editor-rescue.sh`（取消置顶/最小化全部窗口）／`ys-orphans`（清 CEF 孤儿）／`ys-stuck-report`（点不动瞬间取证）／`ys-editor-guard`（试玩归来僵尸自愈）／`ys-selfconnect-vaccine`（内核层自环疫苗，需 root） | 先查 `tools/ys-editor/README.md` 版本与已知 bug，再白盒 |


## 步骤 0（**任何桌面操作之前**，2026-10-17 事故回灌）

**先加载 `computer-use`（全局技能）= 桌面协议载体**，读它的「🖐 共享桌面默契」段，然后才允许动手。三条硬约束（协议原文）：

1. **硬通道**：所有注入经 `tools/ys-editor/ys-gui-slot <win> <秒> <命令>`；**禁止**绕过它裸调 `wmctrl` / `ydotool` / 直写 KWin 脚本。
2. **硬不变量**：**执行前是什么窗口，执行后就必须是什么窗口（exact）**——包装器负责记焦点/核验/`trap EXIT` 精确还原；核验不一致时它会**拒绝执行**。
3. **机械兜底已上线（2026-10-17）**：裸调 `ydotool`/`wmctrl`/`xdotool` 的**动作类**会被 PATH shim 拦下（退出码 77 + 提示）。
   注入类工具自带自包装；确需绕过用 `YS_ALLOW_RAW=1`（须先向用户说明）。截图用 `ys-shot`（先校验窗口再截，不会挂死）。
4. **用户在场判据**（本技能补充）：收到用户消息、用户正在打字、前台是他正看的窗口——命中任一条，**先报「做什么 + 预计几秒 + 占哪个窗口」，等确认再动**。

> 事故（2026-10-17，D308）：我未加载载体、绕过硬通道，裸调 ydotool/KWin 连续十几轮抢窗口去开日志窗，
> 期间**最小化用户窗口、挪动沙箱窗、改置顶**，最终**零结果**且严重干扰用户。判据缺失只是表因，**没读协议**才是根因——
> 载体技能我这个会话编辑过两次，协议段就在我改的那段下面 20 行。

## 标准流程（单周期）

```bash
export DISPLAY=:1 YDOTOOL_SOCKET=/run/user/1000/.ydotool_socket
# ① 开始（轮询式，UI 抖动 5~25s）
tools/ys-editor/ys-playtest-start
# ② 一个焦点时段内跑完所有注入批次（示例：键盘 + 拖拽）
tools/ys-editor/ys-gui-slot 0x01400001 150 bash -c '/tmp/exp-keys.sh; sleep 1; /tmp/exp-drag.sh'
# ③ 退出 → Debug_Log 落盘
tools/ys-editor/ys-playtest-stop
# ④ 离线解析（不碰桌面）
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <最新会话>.gia records | grep -oP "'lua': '\K\[[a-z]+\][^']*"
```

## 坐标与像素判据（窗口 0x01400001 / 2560×1440；游戏内 UI 与窗口 1:1）

| 目标 | 坐标 | 判据 |
|---|---|---|
| 首页图标（房子） | (60, 20) | 被 DXVK 覆盖层遮挡，肉眼不可见 |
| 「试玩」磁贴 | (185, 336) | 首页成立：(185,320) 亮白 R>200；摆放页同点 = srgb(45,71,138) 或 (79,128,255) |
| 「烘焙网格体」弹窗 | (1000, 600) | 深色(~49,53,67)=弹窗在；绿色草地(G≫B)=无 |
| 「直接上传」 | (1444, 811) | 同弹窗判据；**可能需点两次**（真机点击偶发丢失） |
| 「试玩选项」弹窗 | (900, 400) | 深色(~42,46,61) |
| 「开始游戏」 | (1282, 1051) | |
| ESC 菜单「中断挑战」 | (1280, 880) | 浅色药丸（R>200,G>190） |
| 结算页「离开」 | (1833, 1365) | 浅色 |

## 取数通道（按成本排序，能用便宜的就不用贵的）

```text
程序自身日志（离线解析） > 窗口属性/进程状态 > 小区域像素判据 > 全屏截图 > OCR
```

- **首选**：让被测方自己打印。Lua `print` 落 `Beyond_Debug_Log/*.gia` 的 **field 23**（内嵌 `f2{utf8}`）⇒ `gia_log.py records` 直接取。
- 节点图日志：`gia_log.py records/frames/text/perf/ops`；事件线用 `gia_log_flow.py`（详见 `debug-log-investigator`）。
- **负载**：`gia_log.py perf`（每秒负载）。官方"负载记录"报告（峰值截图）**尚未取证**，见下节。
- 屏幕读数只在**无法自打印**时用，且走**小区域 + 判据**（40×40 裁切，84ms/次）。

## 真机实测事实（输入事件，行为层铁证）

**键盘**：43 个奇匠槽全映射（`KeyEventType` 共 164 项）

| 槽位 | 物理键 | 槽位 | 物理键 |
|---|---|---|---|
| Key1–Key9 / Key10 | 数字 1–9 / 0 | Key29–Key35 | `` ` `` `-` `=` `[` `]` `\` `,` |
| **Key11–Key22** | **U Z Y G H I O P J K L V** | Key36–Key39 | ↑ ↓ ← → |
| Key23–Key28 | F5–F10 | Key40–Key43 | 右Ctrl 右Shift Backspace CapsLock |

具名键：WASD → `KeyboardMove*`，Space → `JumpKey`，左Ctrl → `WalkOrRunKey`，F → `InteractKey`，
E/Q/R/T → `KeyboardCharacterSkill1–4`，X → `DropKey`，Tab → `OpenShortcutWheelKey`；
鼠标左 → `KeyboardNormalAttackKey`，右 → `KeyboardSprintKey`。
**C / B / N / `.` / `/` / 鼠标滚轮：零事件**（不在 43 槽面板内）。

**鼠标/拖拽**：判据 = **从按下点起的累计位移超阈**，阈值 ∈ **(2.5, 3.1] 游戏px = (4.0, 4.96] 屏幕px**
（画布 1600×900 / 窗口 2560×1440，比例 1.6）；与速度无关。
事件序列 `Dn → En → Bd → Dg×n → Up → Cl → Ed`——**`Enter` 先于 `BeginDrag`**；**每次 `Up` 都发 `Click`（含拖拽后）**。

**注入通道**：`ydotool`（内核 uinput，sock=`/run/user/1000/.ydotool_socket`）：`key <evdev>:1 <码>:0`、
`click 0xC0`（左键完整）/`0x40`/`0x80`、`mousemove -x dx -y dy`（相对）。

**探针侧硬坑**：真机上 `CursorEventData` 只有 `dragging`/`touchId`——读 `d.x/d.y/d.pressX/d.pressY`
**返回 nil 且不报错**，坐标必须走 `GetUIPos()` / `GetPressUIPos()` / `GetUIPosDelta()` **方法**。

## 成本链与性能读数（优化时的判据）

**进程启动 > I/O 面积 > 计算**：

| 项 | 实测 |
|---|---|
| 全窗 `import -window` 2560×1440 | **5893ms**（PNG 编码占大头） |
| 同窗口 40×40 裁切 | **84ms**（70×） |
| `import torch` | 2~3s（+ CUDA 初始化 ~1s）⇒ 做成常驻服务 |
| 全窗模板匹配（GPU，常驻） | **1.0s**（服务前 4.4s） |
| 试玩双流程（优化后） | start 8.3s + stop 8.2s = **16.5s**（用户手工宽松基准 43s） |


### 日志窗的三个已知坑（来自 2026-10-12 既有记录，**先查再动**）

1. **最大化自伤**：用户/误操作点了日志窗最大化 → `_NET_WM_STATE_MAXIMIZED_HORZ+VERT` 全屏 → **内容点不到**（Wine+WPF+Xwayland 1.5 缩放下该应用的最大化按钮自伤）。
   **KWin 脚本 3 秒可救，不需要重启应用**：
   ```js
   // 选中：stackingOrder 里 caption 含'日志' 且 resourceClass 含 beyondeditor
   w.setMaximize(false, false);
   w.maximizedHorizontally = false; w.maximizedVertically = false;   // 属性双保险
   ```
   恢复目标几何：**物理 900×800 @ (1660,0) = 逻辑 600×533.33 @ (1106.67,0)**（÷1.5 吻合）。
2. **KWin 脚本 `start()` 挂在 `/Scripting` 本体**（`org.kde.kwin.Scripting.start` 无参=启动全部已载入脚本）；**不存在 `/Scripting/<名>` 对象**。
3. **wineserver 是 prefix 跨会话单例**：不清旧 `wineserver`（与 ZFGameBrowser 残留）就改配置/重启，新会话会被旧环境变量污染；
   另：`pgrep` 匹配到残留/僵尸进程再读 `environ` 会得到**假阴性**。


### 编辑器僵尸 / 卡窗处置（**先判后动**；`ys-editor-guard kill` = 用户指认的「优雅清理」）

```bash
ys-editor-guard status   # 先取读数：编辑器进程 / 连接 / 重连风暴计数
ys-editor-guard check    # 单次判定并打印结论（不动手）
ys-editor-guard kill     # 优雅清理：**只杀编辑器进程，绝不碰游戏 / wineserver**
ys-editor-guard daemon   # 常驻自愈守护（systemd 用户服务用；YS_GUARD_MODE=dry 只记录）
```
**判僵尸的两条判据（任一命中）**：A 持续性重连风暴（NLog 的 "Tcp Connector fail" 连续 ≥8s 且累计 ≥300 条；
健康重连风暴只持续 ~40ms/约 20 条 → 不误杀）；B 断连滞留（该代编辑器曾真连接过，之后 ≥20s 无真连接；
**真连接 = ESTAB 且本地端口 ≠ 对端端口**，自环 socket 不算）。

**窗口点不动（不是僵尸，只是卡住）**：`ys-unstick`（程序化激活 + WM 级 1px 往返 = 等价于手动拖动，可脚本化）
／`ys-unstick2`（最小化 → 稍等 → 恢复；Wine bug 59965 的 ReleaseCapture 重置法）。
**取证**：`ys-stuck-report`（一次性 dump 窗口状态/编辑器活性/连接/日志到 `~/.cache/ys-stuck/`）。

## 窗口激活铁则（2026-10-17 实测更正；此前误判为"环境阻塞"）

- **可用写法**：KWin 脚本里 **`workspace.activeWindow = t`（直赋）**。
- **`w.activate()` 对 Wine/X11 窗不存在** —— 报 `TypeError: Property 'activate' of object KWin::X11Window is not a function`；
  脚本里若写 `try { t.activate(); } catch(e) {}`，这个异常被吞掉 ⇒ **每次"激活"都静默失败，注入打到前台别的窗口**。
- **回读判据**：必须断言 **`workspace.activeWindow === t`**；只判"找到了目标窗"会把失败判成成功（旧工具就这么写的）。
- 工具已修：`ys-gui-slot` / `ys-kwin-raise` 改「KWin 直赋优先 + 严格回读」；
  实测 `ys-gui-slot 0x01400001 3 true` → `已取得焦点｜前焦=20971521（原神）` ✅ ⇒ **无需重登、无需用户动作**。
- `xdotool search --name` 对 Wine 窗返回空；**已知窗口 id 时** `getwindowname` / `getwindowpid` 可用（激活逻辑依赖这两条）。

**教训（方法论）**：激活失败先分层判别 —— 原生窗与 Wine 窗**同现象**就排除了"Wine 特有/版本回归"，
再去读脚本自己的异常原文；**别把工具 bug 归因给环境**（本轮为此白写了一条"需重新登录"的阻塞）。

## 试玩进出与取证的实测配方（2026-10-17 逐点实测，坐标 = 物理像素 2560×1440）

> 这一节是本技能最贵的部分：每个坐标与判据都是**点了错的地方、白烧一整轮之后**量出来的。
> 改任何一条之前先问：我拿什么读数证明新的对？

| 步 | 动作 | 坐标 / 判据 |
|---|---|---|
| ① | 开系统菜单 | `ESC`（**首次常被吞**）→ `ys-state --wait menu_open --expect visible --timeout 8`（判据只在 ys-state，别再内联像素阈值） |
| ② | 「试玩」磁贴 | **(183,389)** ← 旧记录 (174,328)/(185,336) **少 53px**，点在空白处 =「试玩起不来」的真因 |
| ③ | 「直接上传」 | (1444,811) |
| ④ | 「开始游戏」 | (1280,1052)，**必须长按 ≥1.2s**（`YS_CLICK_HOLD=1.2`；0.13s 按放会被整帧吞掉） |
| ⑤ | 中断挑战 | (1280,877) |
| ⑥ | **结算页「离开」** | **(1818,1356)** |

**三条会让人误判「图没执行」的读法（全部实测踩过）**：

1. **`gia_log.py records` 不显示 printString 载荷** —— 拿它 grep 标记**必然得 0**。
   查打印内容必须读**原始字节**：`strings -n 2 <log> | grep <标记>`。用 records 视图下结论 = 量错了对象。
2. **日志只在走完退出流程后才落盘** —— 停在结算页不点「离开」，`Beyond_Debug_Log/` 下**根本不出现新文件**。
   ⇒ 「没有新日志」**不构成**「图没执行」的证据，只说明**退出没走完**。
3. **试玩会静默抹掉节点图挂载** —— 表现是图还在（`assets:node-graphs read` 看得见）但 `graphs=(none)`，
   于是试玩能进游戏、日志窗「暂无日志」。**每轮构建步都要重挂 + 核验**（`ys-preflight` 第 ④ 段就是查这个）。

## 待覆盖（登记；用到这些能力时**先补工具，再依赖**）

| 缺口 | 官方出处 | 现状 |
|---|---|---|
| ~~日志窗口筛选勾选~~ | `docs/ui-tutorial/official-guide-auxiliary-appendix.md:1472`、`:1529` | ✅ **2026-10-17 已完成**（步骤/坐标/判据/三坑见本文末节） |
| **负载记录**（试玩时监控每位玩家负载、峰值截图、结束出报告） | 同上 `:51` | ⬜ 入口已知 = 日志窗右侧「检测节点图运行时负载」开关；**报告产物从未找过** |
| **编辑器重载/保存的可靠流程** | — | ✅ **2026-10-17 已工具化**：`ys-switch-save`（奇偶切换）/ `ys-round`（离开→写盘→进入的状态机）；顺序铁律见下 |
| **沙箱就绪判据**（冷启动 → 可试玩） | — | ⬜ 现状从「能点到试玩磁贴」开始，隐含假设地图已加载 |
| **试玩残留检测** | — | ✅ **2026-10-17 已入 `ys-preflight`**：px(1000,600) 纯白 且 px(1280,700) 暗蓝 ⇒ 停在结算页（6/6 判别正确） |

**顺序铁律（错了会静默丢改动，2026-10-17 两轮铁证）**：
编辑器**离开一张图时会把它常驻内存的版本写回磁盘**，静默覆盖 CLI 刚写的字节（零报错）。
⇒ 正确顺序恒为 **先切走 → CLI 写盘 → 切回 → 试玩**。

**身份判据不要用 SHA**：`ys-switch-save` 是奇偶切换，一次失手奇偶就翻、之后步步反着走（实测跑的是别的空图）。
SHA 变化也**不能**当判据——编辑器内存与磁盘一致时，离开写回的字节完全相同、SHA 不变。
**唯一可信的是 `ys-where2`**（系统菜单标题模板匹配）。

## 与其它技能的分工

- `debug-log-investigator`：日志格式、f23、解析脚本、负载语义 ← **本技能只负责把日志弄到手**
- `game-from-scratch` 阶段 7：本技能是它的真机执行器（把"提醒用户去玩一次"升级为"机器跑 + 用户终裁"）
- `verify-injection`：最小核验注入通道（编译/注入/回读）；真机行为验证接本技能
- `qxqy-simulator` / `gsts client:sim`：模拟器路线（更快、更早）
- `computer-use`（全局技能）：通用桌面自动化方法（成本链、优化四步、常驻服务通用式、`cu` 通道）——**方法层向上引用，资产层留在本技能**

## 命令耗时监控（2026-10-18 用户令：有命令 ≠ 会起作用）

> 机制：`tools/cmdmon`（常驻 `cmdmon.service`，2s 增量）→ `~/.dsh/cmdlog/commands.jsonl` →
> `tools/agent-coach` 生成 3~5 条可省时间建议 → daemon **每 5 分钟自动刷新** `~/.dsh/cmdlog/last-coach.md`。
> **这是设计保障，不是纪律提醒**：卡片不靠模型记得跑，也跑不掉（daemon 自己在刷）。

**为什么必须做成设计**（本节的来历，别再重犯）：`cmdmon`（采集）+ `agent-coach`（生成）两天前就建好了、
daemon 一直在跑、账本一直在写，但设计文档里最后一步写的是「**模型侧约定：每阶段自查一次 agent-coach**」——
把闭环交给了模型自觉。实测后果：`injections.jsonl` 从未被创建、`last-coach.md` 停了一整天
（2026-10-17 16:06 → 2026-10-18 10:33 才被重启刷新），而那一轮本身：**仪器 57.4 分钟 / 人等待 59.2 分钟**
（人等待比仪器还长！）/ ≥30s 慢调用 25 次共 47.5 分钟 / `job_output(wait:true)` 空等 4/8 次共 10.8 分钟。
**卡片写得再好，不被调用就等于没有。**

**判据（可机检）与对应动作**：

| 读数 | 判据 | 动作 |
|---|---|---|
| 单条命令时长 | ≤20s | >20s 一律 `run_in_background` |
| `job_output(wait:true)` | 空等 = 0 | 先发独立任务再等；或 `wait:false` + 判据轮询 |
| 裸 `sleep <数字>` | 0 条 | 用 `ys-wait` / `wait_until` 谓词等待 |
| 同命令 10 分钟内 ≥3 次 | 0 | 多半是参数猜错：先读源码/文档再跑 |
| 人等待（`wait_human`） | 应远小于仪器耗时 | 提问要「一次问全 + 问完能自己往前走」——ask_user_question 要给选项而不要开放问 |

**用法**：
```bash
tools/cmdmon report --since 2h        # 本轮类别占比/最慢/失败/裸 sleep
tools/cmdmon alerts --since 2h        # 报警清单（slow/fail/sleep/repeat/guistorm）
tools/agent-coach --window 2h --dry-run --format text   # 临时要一份卡片（daemon 已自动刷到 last-coach.md）
```

**纪律（已两次踩）**：新监控件落地**必须同轮接进主链并打一行读数**——`ys-time-audit`/`accept-meter`
当年就是"写好了但没接进主链"，等于没有。判据：**问一句"谁在不看文档的情况下会被它触发？"** 答不出就是没接。

## 视觉识别性能：先问「走的是哪条通道」（2026-10-18 实测，本机 RTX 3060）

> 同一台机、同一批帧，**换实现差一个数量级**是常态。动手前先量，再决定用哪条。

| 做法 | 单帧耗时 | 备注 |
|---|---|---|
| RapidOCR 2.x 每次新进程（CPU） | **3673ms** | 自带 venv，pip 装的 GPU 版实际仍是 CPU |
| RapidOCR 3.10 常驻（CPU） | **3020ms** | pacman `python-rapidocr` |
| **RapidOCR 3.10 常驻 + CUDA** | **489~552ms（5.5×）** | 桶数一致（33），结果不变 |
| 模板匹配 ys-lookd batch（GPU） | **147ms** | 能用模板就别 OCR |

**让 CUDA 真生效的三个条件（缺一个就静默退回 CPU，只留一行 warning）**：
1. `ctypes.CDLL('/usr/lib/libcudnn.so.9', RTLD_GLOBAL)` —— 否则 ORT 加载 provider 报
   `undefined symbol: cudnnGetConvolutionBackwardDataAlgorithm_v7`（符号其实在，是加载顺序问题）。
2. `ort.register_execution_provider_library('CUDAExecutionProvider', <capi>/libonnxruntime_providers_cuda.so)`
   —— ORT ≥1.29 把 CUDA EP 拆成独立 so，装了包也不会自动注册。
3. `ort.get_device()` 在本机返回 **`'GPU-DNNL'`**（装了 DnnlExecutionProvider），而 RapidOCR 3.10
   的判断是 `get_device() == "GPU"` ⇒ **永远为假**。这是 RapidOCR 的 bug，用 `ort.get_device = lambda: 'GPU'`
   绕过；**升级 RapidOCR 后必须重验这一条**。

**安装口径**：用 pacman（`python-onnxruntime-cuda` + `python-rapidocr` + `python-rapidocr-models-onnx`），
**不要**再往 venv 里 pip 装 `onnxruntime-gpu`——两者抢同一个 `onnxruntime` 包名，且 pip 版还要
额外塞 nvidia-cu12 运行库（本机系统是 CUDA 13，两者不匹配）。`YS_OCR_CPU=1` 可强制对照。

**必须在常驻进程里跑**：引擎加载 + 首帧 CUDA context 约 9s，只付一次；每次新进程都付 = 白花。
`ys_ocr.py` 现在是唯一引擎入口（`_engine()` 进程内复用），`ys-screen` 与 `ys-lookd` 都复用它。

**顺带修掉的测量缺陷**：`ys-screen` 的 `pixel_ms` 原先算 `t_end - t_load`，而 t_load 在 OCR **之前**
⇒ OCR 耗时被重复计进"像素"（实测 1262ms 里绝大部分是等 daemon）。现在分开计时，
读数才能指向真瓶颈。

## 单帧感知慢？先看「起了几个外部进程」（2026-10-19 实测，判态 398→125ms）

> 判据：单帧感知类工具 >100ms 时，**先问这一步是不是起了一个外部进程**，再谈算法。

`ys-state --fast` 曾 398ms，账是这样的（daemon 响应已带 `parts{}` 分项，直接读，不要猜）：

| 项 | 修复前 | 修复后 | 手段 |
|---|---|---|---|
| 抓帧 ROI 1401×1440 | **116ms** | 27ms | `import -window` 子进程 → **进程内 `XShmGetImage`（9ms）** |
| UID 小条 360×100 | **82ms** | **0ms** | 不单独抓，从同一张整帧裁 |
| 39 个像素取点 | 13–34ms | ~5ms | 免一次 24MB GPU→CPU 回传（numpy 已在手） |
| 12 锚点 / GPU / decide | 35 / 6 / 0ms | 不变 | — |

三条可直接照抄：
1. **一次请求只抓一张整帧**（11MB，XShm 约 9ms），其余区域（判据点、UID 条、缩略图）**就地裁**；
   "按需抓两次小区域"比抓一次整帧贵得多。
2. **别在 GPU 张量上取几十个像素**——那会触发整帧回传；numpy 已经在手里就从 numpy 取。
3. **改抓帧来源必须重验判据**：`ys-state --regress --channel both`（24 帧含 8 负样本）必须仍 100%，
   `tools/ys-gates --only 1` 必须 PASS。变快不等于没变错。

两个必踩的坑：
- **daemon 从无 X 环境的 shell 启动 ⇒ `DISPLAY` 为空串 ⇒ 抓帧全 0 字节**。正确姿势：
  `cd tools/ys-editor && . ./ys-env.sh && setsid nohup python3 ys_lookd.py`。
- **`pgrep -f "ys_lookd.py" | xargs kill` 会匹配到自己的 shell 命令行**，把自己杀掉（实测连中两次）。
  改用遍历 `/proc/*/cmdline` 且要求 cmdline 以 `python3` 开头。

## 变更记录


| 日期 | 变更 |
|---|---|
| 2026-10-17 | 首版：从 `tools/ys-editor/` 工具链 + 真机实测事实收拢（T02，skill-refresh 票板） |
| 2026-10-18 | 新增「命令耗时监控」节：把遥测闭环从"模型自查"改成"daemon 自动刷新"，附判据表与两次"只写不接"的实证 |

---

## 试玩前：打开日志窗口并勾选节点图（M1 缺口①，2026-10-17 实测）

> **为什么必须做**：官方明文「**仅勾选的目标节点图会返回日志信息**」——不勾就没有取证物，后面所有分析都是空的。
> 出处：`docs/ui-tutorial/official-guide-auxiliary-appendix.md:1523`（窗口→日志）、`:1529`（筛选面板）。

### 步骤（附实测坐标，2026-10-17 沙箱几何 (203,0) 1503×914 逻辑）

| # | 动作 | 坐标/判据 |
|---|---|---|
| 1 | 千星沙箱 → **窗口** 菜单 | 菜单栏按钮 = 沙箱客户区左上，逻辑 **(x+50, y+14)** |
| 2 | 点菜单里的「**日志**」项 | 菜单项 = 窗口按钮 **+(29, +116)**（第 5 项：资源管理器/客户端节点图/客户端脚本/节点管理器/**日志**/服务器信号/负载检测） |
| 3 | **轮询等窗口出现** | `xdotool search --name "日志"`；物理 (1660,0) **900×800** = 逻辑 (1106.7,0) 600×533（与 D140 记录一致）。**启动慢，像试玩加载，实测 ~15s 内出现** |
| 4 | 筛选面板勾选 | 左栏「选择单位」：**服务器节点图 ☐（已选择 0/10 项）**、**客户端节点图 ☐（已选择 0/99 项）**、**客户端脚本 ☐** —— 复选框即官方「**勾选所有该类型**」；底部「**清空 / 确认选择**」 |
| 5 | 右侧同窗还有 **「检测节点图运行时负载」开关** | = M1 缺口②（负载记录）的入口，与本步同窗，可一并做 |

**面板判据**：勾选后行内文本变成「已选择 N/上限」→ 机器可判（无需 OCR，比色差更稳：直接看 `N>0`）。

### 三个坑（全部实测踩过）

1. **窗口尺寸**：沙箱子窗（日志窗等）按**编辑器窗口**定位。沙箱窗若高过屏幕（曾见逻辑 959 高、物理底边超出屏 81px），子窗会开到**屏幕外**→ 表现为"点了没反应"。**先确认沙箱窗完整在屏内**（重开沙箱后实测变为 1451×914 ✓ 在屏内）。
2. **点击必须真人节奏**：`ydotool click 0xC0`（~10ms 瞬时按放）**不被 Wine 菜单接受**；改用**按下 → ≥120ms → 抬起**（`ydotool click 0x40; sleep 0.12; ydotool click 0x80`）✓ 实测有效。
3. **注入前必须真正激活目标窗**：`ys-gui-slot` 内部走 `wmctrl -i -a`，而 **wmctrl 对 Wine 窗静默失败**（D136）⇒ 注入会打在**前台的其他窗口**上（本轮实证：时段内全屏截图里出现的仍是 Firefox）。**权威激活 = KWin 脚本 `w.activate()`**（工具 `ys-kwin-raise`），激活后**回读 `workspace.activeWindow`** 才算数。

> ✅ **激活层已修（2026-10-17 夜）**：`ys-gui-slot` / `ys-kwin-raise` 已改 **KWin 直赋 `workspace.activeWindow = t` + 严格回读**，
> 实测「已取得 0x01400001（原神）焦点」通过 ⇒ **不再需要重新登录**，本步自动化的注入落点已可信。
> 旧的「KWin 6.7.5 ⇒ 激活不可靠 ⇒ 需重登」结论**已作废**（那是把工具 bug 归因给了环境，见「窗口激活铁则」）。

---

## 验收标准：试玩"有日志"≠ 游戏"玩得通"（2026-10-17 教训，本技能最贵的一条）

> 实证：24 轮循环全绿（9 步每步有判据、每轮出报告、日志有标记），产出 **0 个已验证的游戏**。
> 用户原话：「很多测试都做的很敷衍」「对没兴趣的东西会没耐心，模型会更敷衍」。

### 两种验收标准的差别（照抄这张表）
| 错的标准（我用的） | 对的标准 |
|---|---|
| 回合跑完不报错 | **玩家能不能把玩法玩通** |
| 日志里有我打的标记 | 日志里有**通关/关键行为**的证据 |
| 截图里角色在平台上 | 日志里**到达终点的坐标或事件** |

**判据**：这一轮的验收条款里，有没有**一条关于"玩家做到了什么"**的读数？
只有"系统没崩"就是没验收。

### 每轮必须交两样东西
1. **一条可复现的配方**（进本技能/看板）
2. **一条游戏事实（数字）**——如「玩家能跨 3.2m 间隙」「出生后第 7 秒到达顶峰」
没有第 2 条 = 这轮白跑，不许记成"完成"。

### 设计前先标定（单变量）
不知道能力上限时**不许**设计多档参数（实测：设计了 3.0/3.5/4.0/4.5/4.5m 五段间隙，全是猜的，
结果是玩家掉出跑道）。**正确顺序**：建**标定台**（单一变量：间隙距离）→ 二分 → 拿到数字 → 再设计。

### 被作废的结论要显式划掉
本轮 5 条曾当事实写进看板的结论后来被推翻（「玩家不能跳」「ESC 没反应」「试玩磁贴点不动」
「点标题回存档页」「图没执行」）。**静默替换成新结论 = 把旧结论带到新口径下继续用**。
凡引用历史结论，先查它是不是已被作废的版本。

---

## 自我监控：按时间占比度量自己的行为（2026-10-17 用户点拨）

> 用户原话：「监控到你在 gui 操作上花费了不对等的时间……系统的做法是用非常少的代价
> 统计你执行的命令花费的时间占比，就得到这个灵感」「尝试从不同的角度对自己的行为监控或许有奇效」。

```bash
tools/ys-editor/ys-time-audit            # 取本工作区最新会话
tools/ys-editor/ys-time-audit <jsonl> --top 12
```

**读法**（本会话实测 1083 次调用）：
| 类别 | 次数 | 耗时 | 占比 |
|---|---|---|---|
| 等循环（job_output） | 80 | 223 min | **70%** |
| GUI 操作 | 293 | 61 min | 19% |
| 自己 sleep | 23 | 21 min | 6% |

**它推翻了我的自我认知**：我以为「GUI 占大头」，实际是**等循环**占 70%（每轮 10+ 分钟）。
⇒ 优化方向应该是**缩短单轮时长**，不是"少点几下"。

**用法**：每轮结束后跑一次。GUI 占比异常膨胀 / 单轮时长变长，都说明链路出了问题，
比"感觉今天很忙"可靠。

---

## 模块准入门槛（2026-10-17 用户令 → 已入 `AGENTS.md`「仪器优先」节）

> 用户原话：「**在关键的 GUI 操作模块没有完成高质量验收就强行进入后续游戏开发和核验反馈迭代，
> 只会加大问题的复杂度，最终拖垮整个项目。**」
> 实测背景：一轮试玩 426s 里 **92% 是仪器开销**（离开 148s / 切回 115s / 启动 74s / 死等 30s），
> 真正必须的只有 33s；判定层有 **6 份重复的状态实现**，同一个错两处并存。

全景图（分层/开闭环/时间分布/维度矩阵）：`docs/maintenance/ys-editor-system-map.html`
同源说明：`docs/maintenance/design-2026-10-17-ys-editor-system.md`

### 开工前先过五条（每条都能跑）
| # | 门槛 | 判据 |
|---|---|---|
| 1 | 判定 | 回归集 ≥16 张（含 5 负样本：结算/加载/存档/菜单/游戏内互判），双通道一致率 100% |
| 2 | 假成功 | 注入 3 类失败（前置不成立/动作无效/日志未落盘），执行器 **≤10s** 停止并报「哪条断言为假 + 观测值」 |
| 3 | 性能 | 写盘轮 ≤90s、纯试玩轮 ≤40s、取帧 ≤12 次/轮、取焦点 1 次/轮、固定 `sleep` **0** 条 |
| 4 | 证据 | 只给 `round.json` + 引用帧 + `.gia`，外人能重算出同一结论 |
| 5 | 可维护 | `grep -l "LOADING\|SETTLE" tools/` 只命中 **1** 个文件 |

### 四条纪律（写新脚本时照做）
1. **状态判定单一源**：向 `tools/ys-editor/ysd`（或 `ys-state`）查询，**不许自己写判据**；发现第二份实现当轮合并。
2. **等待用判据不用时长**：`wait_until(判据, 超时, 轮询)`；裸 `sleep <数字>` 视为缺陷。
3. **反馈环闭环**：每步有前置断言，为假立即停并记账；失败轮 ≤10s，不许"跑完整轮再看"。
4. **证据=能重推结论的最小集**：`round.json`（断言/观测/判据值/耗时）+ 被引用的帧 + 日志；截图不是证据。

### 已经踩过的三个具体代价（写给下一次）
- **`sleep 22` 冒充"存档切换完成"**（`ys-switch-save:63`）：两次切换白等 44s，且状态没到也照点。
- **全窗截图 2893ms**：判据应走 40x40 裁块（~166ms）；证据帧才要全窗。
- **只写不接**：`ys-time-audit`/`accept-meter`/`ys-stuck-report` 建好了却没进主链 ⇒ 等于没有。
  新监控件落地时**必须**同时改主链调用 + 在报告里打一行读数。

---

## 与用户的组合反馈轮（2026-10-17 用户令：他要按层给真实反馈）

> 用户的纠错是这个系统里**最高价值的信号**：他能看到真实界面，我们只看得到像素。
> 但纠错留在对话里 = 一次性；**必须当场变成回归样本**。

### 每交付一层，只给一张三行卡
```
数字：<改前 → 改后>        证据：<1 张裁切图 / 1 行日志>        待你判：<一句具体问题>
```
用户回三种之一即可：**对** / **不对（我看到的其实是…）** / **跳过**。
不要让他读过程——`tools/round-report` 已经是一页账。

### 他的反馈按价值排序（照这个顺序问）
1. **判据纠错**（"你以为 X，实际是 Y"）→ 最高价值，直接进回归集。
2. **真机事实**（"这个要长按 600ms"、"这个界面 2 秒会自己跳走"）→ 我拿不到。
3. **取舍**（"这条不值得做"）→ 决定下一步顺序。
   最不值：让我解释过程。

### 落地通道（30 秒闭环）
```bash
tools/ys-editor/ys-sample grab SETTLE "实拍结算页，曾被判成 SAVELIST"   # 从当前屏幕抓 + 入回归集
tools/ys-editor/ys-sample add /tmp/x.png PLAYTEST "亮蓝水面，曾误触发 SAVELIST"
tools/ys-editor/ys-sample list
```
加入时立刻用现行判据复核：**不一致就打印"这条样本现在会红，正是要修的"**——
不一致的样本才是好样本，全绿的回归集说明样本太容易。

### 反馈节奏
每完成一层（P1/P2/P3）**一次**，而不是每轮都看：他的注意力是稀缺资源，
批处理反馈 = 单次上下文更完整 = 判断更准。
| 2026-10-18 | 新增「视觉识别性能」节：GPU OCR 的 5.5× 与三个必须同时满足的生效条件（含 RapidOCR 的 `get_device()` bug） |

## 游戏本体（原神）反馈轮的四条硬事实（2026-10-19 实测，与千星沙箱不同）

> 本波在**原神本体**里跑了 20 格菜单遍历 + 背包/好友/地图滚动 + 焦点事故。以下四条**沙箱侧不存在**，别照搬。

1. **ESC 是开关，不是"关闭"**
   `世界 --ESC--> 派蒙菜单 --ESC--> 世界`；`面板 --ESC--> 派蒙菜单`。
   盲按 ESC 会让界面在 菜单/世界 之间横跳——实测 5 步里有 2 步点在了世界画面上。
   **菜单判据（两像素，6 帧零歧义）**：`px(467,556)≈(236,229,216)` ∧ `px(600,900)≈(80,89,107)`。
   **快捷键 B/M/C 只在世界态生效**；在派蒙菜单里按 B 什么都不会发生（会把菜单本身当成背包扫）。

2. **3D 世界鼠标被游戏捕获**
   指针钉死在 `(1280,720)`，`ydotool mousemove` 只转相机不动指针（闭环 12 轮 0 命中、同期帧差 91%）。
   **按住 Alt（`ydotool key 56:1`）释放捕获**后闭环第 5 轮命中 `(72,82)`；但 **Alt 的时序不稳定**——第二次实测请求 `(1667,700)` 落在 `(2500,1050)`。
   ⇒ **世界态目前做不到"把动作对准某个 UI"**（未闭合）。菜单/面板里指针本来就自由，不需要 Alt。

3. **焦点归还的失败路径比成功路径更重要**
   见 `retrospective-2026-10-19-gui-agi.md` 第三部：守护无限重试 + 游戏独占全屏抢焦点 = 反复夺屏。
   **纪律**：任何 `enable --now` 的守护，启用前必答「它的失败路径是放大还是收敛」——放大就不许上。
   租约 `prev == target` 必须记 **noop**（release 零窗口操作），否则永远恢复不了。

4. **抓帧不抢焦点，采数据要用 `ys-collect`**
   `tools/ys-collect new <case> --at menu|world --n 8` 一次落四件套：帧 + `ys-screen --json` 原样 + 指纹（ruleset/模型 sha/git HEAD）+ 真值模板。
   **单帧计数不能当基线**（同一界面 8 帧计数差 2–3 倍）；任何"N 个"必须注明帧数。
   下钻用 `tools/ys-detail --at x,y` 或 `worldsvc drill`（给已切好的那一块，不重处理整帧）。

5. **滚动：文本判据在纯图形列表上必然假阴性**
   背包实测：文本集 Jaccard **0.7826**（>0.15 阈值 ⇒ 判"没变"），而区域像素变化 **0.6553**、滚回原图 **0.0006**。
   `ys-scroll-scan` 已改为**双通道**（文本变了 OR 像素大面积变了，`--pixdelta` 缺省 0.25）。
   **副作用警告**：指针没对准时它给的是"**无效测试**"而不是"不可滚"——别把 `at_bottom=true` 当负样本。

### 焦点租约与守卫（2026-10-19 补齐；此前这几个工具在任何技能里都没有记载）

| 工具 | 干什么 | 关键判据 |
|---|---|---|
| **`ys-lease`** | 焦点租约：一次取焦点，期间动作零槽位开销 | `acquire` 时目标已在焦点 ⇒ 记 **noop**（release 零 raise）；release 验证 `activeWindow==prev` **且** `idx(prev)>idx(game)`，3 次重试后**非零退出并保留租约**；连续 3 次失败标 `abandoned` |
| **`ys-gui-slot`** | 焦点占用包装器（调用面最广的那个） | 与 `ys-lease` 同一套 KWin 权威判据；**`trap` 里设的退出码必须在 `trap` 之后才被读到**——检查点放在 trap 之前等于白设（本波第 4 个 bug） |
| **`ys-focus-guard`** | 常驻看门狗：租约过期/持有者死 ⇒ 自动归还 | **无租约时纯只读**；连续失败 3 次 ⇒ abandoned + 停止动作；连续 5 次 ⇒ CRITICAL + `systemctl stop` 自身 |
| **`ys-guards`** | 源码纪律守卫（14 条） | `G-SLEEP / G-PKILL / G-IDX / G-CAPTURE-EMPTY / G-CLIPBOARD / G-FOCUS-RETURN / G-WHITELIST / G-OBJECT / G-BBOX …`；`G-OBJECT` = 文件里出现记录型判据（`MainPID`/`is-active`/pidfile）却没有任何对象探针 ⇒ 红 |
| `ys-collect` | 采集器：一次落 帧+模块输出+指纹+真值模板 | 见上节 |
| `ys-detail` | 下钻：动作前后只看这一小块 | 局部+全局双坐标；`--ocr` 慢（子进程），图本身就是信息 |

**失败路径的验收口径（新增）**：任何守护/重试逻辑的自测，**必须包含「永远失败」场景**，并报两个数——
① 连续失败几次后停止；② 该场景下用户被打扰次数。只有成功路径全绿 = 没测完。
