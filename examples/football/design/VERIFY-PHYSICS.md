# 物理内核验证方案（一条试玩周期验完四条链）

> doc-type: R · status: 待验证 · updated: 2026-10-29
> 作者=主线代理 · 读者=用户在游戏内执行 + 后续解析者
> 背景读数：地图 1073741827 的 .gil 与 Temp 已同 sha；近 32 份 `Beyond_Debug_Log/*.gia` 里
> **没有任何一份含 `[fb-in]`**（= Lua 从未在带日志的试玩里跑过），`fb-heartbeat` 只在
> 2026-10-28 07:22 那份 256B 的短日志出现过一次 ⇒ **整条链目前只有结构层证据，行为层为零**。

## 0. 为什么用一条周期验四条链

编辑器里重开图 → 试玩一次，能同时验证：Lua 是否加载、按键是否到服务端、物理内核是否在跑、
HUD 是否显示。分开验要开四轮试玩，成本 ×4（`device-playtest-loop`：一个周期做完所有实验）。

## 1. 现有链路（结构层已核，2026-10-29 实测）

```
Lua fb-input(1073741825，挂在容器节点 1073741863)
   ├─ 按键 → game.ServerSignal('fb_input', key, state)
   └─ HUD：11 个 client-textbox 的文案/字号/颜色/对齐（运行时设）
        ↓ fb_input（send=1610612747 monitor=1610612748 server=1610612749 clientScript=1610612739）
服务端 kitListen(1073741826，挂在算力载体 1082130445 打手丘丘人)
        ↓ 写实体变量 fb_seq / fb_key
客户端造物技能图 kitLoop(1082130436，技能配置 1191182341 绑定，instant)
        ↓ 六态物理积分 → kit_state(tag,tick,pos,vel,spin,state)
服务端 kitRender(1073741828，挂在真足球 1077936135)
        ↓ 线性运动器 fb_movex / 旋转运动器 fb_spinx → 球在场上动；进球时 print('fb-goal')
```

## 2. 四条判据（每条都有"看哪里"）

| # | 论断 | 行为层判据（日志/画面） | 不成立时先查 |
|---|---|---|---|
| V1 | Lua 加载了 | 日志含 `[fb-in] onstart v2` 与 `[fb-in] listen ok 6/6`（缺 = 脚本没跑或键注册失败） | 脚本是否挂在容器节点；`OnStart` 是否抛错（`pcall fail` 行） |
| V2 | 按键链路通 | 按 ①~⑥ → 日志 `[fb-in] key N`（Lua 侧）+ `fb-key`（服务端 kitListen）；**`kit-dup` 必须 0 条** | 脚发双份 = 多条脚本挂同一节点（本轮已 unmount fb-input2，mounts=1） |
| V3 | 物理内核在跑 | 球能被身体带球（贴脚 1.3m）、能被 ①/②/③ 踢出并弹地/滚动；服务端 kitRender 的运动器节点在日志里按约 7.5Hz 出记录 | 技能配置是否 instant 触发；载体是否被创建；技能变量段 1207959553..568 是否越界（段外会让图运行期崩且零日志） |
| V4 | HUD 显示正确 | 画面：顶部记分牌（标题/比分/计时）、中央横幅、右侧 6 条技能、下方状态行；日志 `hud-miss` 0 条、`pcall fail` 0 条 | 控件名是否与 Lua 表一致（hud_title/score/timer/toast/state/k1..k6）；`script.object` 是不是容器节点 |

**客户端图没有 print 能力**（`kit-loop.ts` 头注：遥测只走 kit_state）⇒ V3 不能靠"内核打了日志"证明，
只能靠「球真的动」+ 服务端 kitRender 的运动器节点记录。

## 3. 用户执行步骤（约 3 分钟）

1. 编辑器里**先退出当前地图再重新打开 1073741827「真实足球v3」**（盘外写入只有重开地图才读到），
   确认地图列表里此图时间/大小已更新。
2. 点「试玩」进入。
3. 进图后**站着不动 3 秒**（让 Lua 跑 OnStart、服务端收心跳）。
4. 依次按 **① ② ③ ④ ⑤ ⑥** 各一次（键位：普攻/技能1/跳跃/冲刺/交互/丢弃）。
5. 走到球边**带球跑 5 秒**（看球是否贴脚跟随），再按 ① 射一次、② 重射一次、③ 高吊一次。
6. 退出试玩（此时日志已落盘）。

## 4. 我这边解析（用户完成后自动跑）

```bash
L=~/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Debug_Log
NEW=$(ls -t $L/*.gia | head -1)
strings -n 5 "$NEW" | grep -E "\[fb-in\]|fb-key|fb-heartbeat|kit-dup|fb-goal" | head -40
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py "$NEW" records --summary
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py "$NEW" perf
```

## 5. 失败分支 → 下一步（不要跳步）

| 症状 | 最可能原因 | 下一步 |
|---|---|---|
| 日志无 `[fb-in]` 任何行 | Lua 没进 playtest 加载 / 未挂到容器节点 | `assets:scripts mounts --map-id 1073741827` 复核；`assets:scripts list` 看 external 大小 |
| 有 `onstart` 无 `listen ok 6/6` | 枚举名不对（真机要 `Enum.KeyEventType[...]`） | 看 `miss <名> enum=...` 行，换枚举名 |
| 有 `[fb-in] key` 无 `fb-key` | 信号没到服务端（kitListen 未挂/信号 def 缺） | `assets:signals inspect --map-id 1073741827`；`assets:mounts list` 看 1082130445 是否挂 kitListen |
| 有 `fb-key` `kit-dup` 多条 | 同节点挂了多份脚本 | `assets:scripts mounts` 确认 mounts=1 |
| 球完全不动 | 载体没施放 / 技能配置没绑 kitLoop / 球没挂 kitRender | 依次查 `assets:creations inspect --target 1082130445`（skills=1、decision 20007）、`assets:skill-config list`（1191182341 → graphId=1082130436）、`assets:mounts list`（1077936135 → kitRender） |
| 球动但不跟脚 | 物理参数/带球判定（2.4m & 球速<8） | 回 kit-loop.ts 带球分支与 `S_*` 槽位自检 |
| HUD 只有部分行 | 控件名对不上 / `GetChild` 取不到 | 日志 `hud-miss <名>`；`assets:ui list` 对名字 |
| 字号/颜色没生效 | 属性名与真机不一致 | 日志 `pcall fail fontSize/fontColor/alignH/alignV <名>` |

## 6. 已知结构缺口（会影响 V3 判据强度）

- 服务端 kitRender **只在进球时 print**，没有每拍遥测；V3 的"频率"判据只能靠日志记录级计数，
  若要精确拍频证据，需给 kitRender 加低频心跳（每 30 拍一条），属下一轮改动（要重新编译+注入）。
