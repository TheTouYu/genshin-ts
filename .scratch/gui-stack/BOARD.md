# gui-stack 推进看板

> 设计权威：[`DESIGN.md`](DESIGN.md)（本板只管"推进到哪"，不复制设计）
> 上游主线：[`../three-games/BOARD.md`](../three-games/BOARD.md)（三个 3D 游戏）
> 建立：2026-10-17 ｜ 依据：当天 15 条错误的归因分布（仪器 5 / 前提 3 / 判据 1 / 缺机制 2 / 被测对象 0）

## ① 资产速查（高频引用）

| 事实 | 值 |
|---|---|
| 原神窗 id | `0x01400001`（=20971521） |
| 屏 | 2560×1440（逻辑 1707×960，×1.5） |
| **注入唯一通道** | `ys-gui-slot 0x01400001 <秒> <cmd>`（裸调 ydotool → 键进前台别的窗口） |
| 环境固化 | `source ../three-games/env.sh`（GSTS_LOCALLOW_DIR / YS_UID=110170759 / YS_MAP_ID=1073741832 / YS_SAVEDIR） |
| 调试日志 | `$GSTS_LOCALLOW_DIR/miHoYo/原神/BeyondLocal/110170759/Beyond_Debug_Log/*.gia` |
| 工具目录 | `tools/ys-editor/` |

## ② 当前前沿

**阶段 D 进行中（AGI 基准，2026-10-18 用户裁决「A，这就是我要的」）**
✅ 票 23（真值 285 单元 + 记分器：**基线 30.5%**）；✅ 服务原型（同帧稳态 **147–162ms**，缓存 **1.1ms**，1.27s→148ms = 8.6×）
⇒ 下一步：**24（学习型检测，GPU 已复验可用）**｜**34（live 取帧窗口身份 fail-open，必须先修）**｜32（编排）

> **权威判据**：[`AGI-BAR.md`](AGI-BAR.md)（四条量化口径 + 六层 L1–L6 + schema v0 + 预算门禁 + 反馈轮协议）。
> **用户裁决（2026-10-18）**：形态 **A = 常驻世界状态服务 + 单一 schema + 三动词**；旧工具退化为其内部实现；
> **难或不确定的任务点必须停下来把用户引入反馈轮**（AGI-BAR §六）。
>
> **用户裁决（2026-10-17）**：① 阶段 A 按 **4 票**走（01-04，不合并）；② 阶段 A 期间**完全不碰地图**；③ 票 08 排最后。

## ③ 票据清单

### 阶段 A：让读数与动作可信（P0，本阶段不碰游戏）

| # | 票 | blocked by | 状态 |
|---|---|---|---|
| 01 | [ys-observe 观测层](issues/01-observe.md) | — | ✅ |
| 02 | [ys-state 状态层 + 回归集](issues/02-state.md) | — | ✅ |
| 03 | [ys-do 动作层 + 动作账本](issues/03-do.md) | 01,02 | ✅ |
| 04 | [ys-loop 编排层 + M4 产物监控](issues/04-loop.md) | 03 | ✅ |

### 阶段 B：监控与自进化（P1）

| # | 票 | blocked by | 状态 |
|---|---|---|---|
| 05 | [M1 窗口/焦点 + M6 进程健康监控](issues/05-watch-win.md) | 01 | ⬜ |
| 06 | [标定库 + 自动失效 + ys-find](issues/06-calib.md) | 02 | ⬜ |
| 07 | [归因四分类 + 不确定性清单](issues/07-attrib.md) | 04 | ⬜ |
| 08 | [ys-probe 主动发现新控件](issues/08-probe.md) | 06 | ⬜ |

### 阶段 C：回到游戏（P0，用新栈打通）

| # | 票 | blocked by | 状态 |
|---|---|---|---|
| 09 | [game① 一轮闭环（退出试玩 + 跳跃读数）](issues/09-game1-loop.md) | 04 | ⬜ |
| 10-12 | game① 完整可玩 / game② / game③（**待 09 完成后拆票**） | 09 | 未拆 |

### 阶段 D：AGI 基准（P0，2026-10-18 起）

| # | 票 | blocked by | 状态 |
|---|---|---|---|
| 23 | [bbox 级真值 + 覆盖率记分器](issues/23-coverage-truth.md) | — | ✅ |
| 24 | [对象检测换路线（学习型 GPU）](issues/24-object-detection.md) | 23 | 🟡 GPU 已复验可用，待权重授权 |
| 25 | [切块 + 分块并行 OCR + 切片索引](issues/25-slices-parallel-ocr.md) | 24 | ⬜ |
| 26 | [L2 结构：parent/分组/两层页签](issues/26-structure-groups.md) | 24 | ⬜ |
| 32 | [编排技能化 + 失败自愈三招](issues/32-orchestration-skills.md) | — | ⬜ |
| 27 | L3 状态（选中/焦点/红点/已领取，组内相对） | 26 | 未拆 |
| 28 | L4 可点性 affordance | 26 | 未拆 |
| 29 | L5 主动补全（自动下滑并集） | 26 | 未拆 |
| 30 | L6 否定闸门 | 29 | 未拆 |
| 31 | LOADING 标定 + 转移账本 + 下一稳态契约 | 25,26 | 未拆 |
| 33 | 热路径 ms 级（消灭 16× 默认慢路径） | 24,25 | 未拆 |
| 34 | [live 取帧窗口身份未验证（fail-open）](issues/34-live-attribution.md) | — | ⬜ |

## ④ 已完成划掉区

- ~~**23 bbox 真值 + 覆盖率记分器**~~ ✅ 2026-10-18
  - 14 帧 + 负样本共 **285 单元**真值；`tools/ys-coverage`（755 行，自测 4/4 PASS）
  - **首份客观基线：hit=87/285 = 30.5%**，fp=24，degen=2，负样本违规 1（世界帧 2 个假阳性）
  - 分层读数：**tile 56/56=100%**｜row 20.9%｜card 1/14｜button 2/46=4.3%｜**icon 0/38、avatar 0/8、chip 0/4**
  - 坑：`containers[].bbox` 是 **xyxy**（AGI-BAR schema 写 xywh，已加 `--pred-format` 与醒目登记）；按 xywh 读时 19 格全变 0 命中且不报错

- ~~**04 ys-loop 编排层 + M4 产物监控**~~ ✅ 2026-10-17
  - `tools/ys-editor/ys-loop`：一轮 9 步全绿（focus/map_leave/build/map_enter/playtest_start/input/
    playtest_stop/**artifact_new_log**/**artifact_marker**）
  - **M4 是压舱石**：产物判据完全不经过屏幕——新 `.gia` 文件 + **原始字节**里有标记
  - 关键区分写进代码与报告：**没有新日志 = 退出没走完，≠ 图没执行**
  - 四件产出齐全：report.md / ledger.jsonl / uncertainties.md / evidence/

- ~~**03 ys-do 动作层 + 动作账本**~~ ✅ 2026-10-17
  - `tools/ys-editor/ys-do`：意图级动作 + 账本（append-only JSONL，jq 可解析）
  - **试玩进出全链路打通**：`playtest-start`（EDITOR→MENU→试玩→PLAYTEST）与
    `playtest-stop`（→SETTLE→EDITOR + **新日志落盘**）双通，退出码 0
  - 真因（卡了数小时）：我手写点击的两处错误——① 指针走 `xdotool mousemove` 在 Xwayland 下**无效**
    （可用的是 `ydotool mousemove` 相对+闭环）② 游戏内 UI 按住必须 **≥500ms**（6~11 FPS，130ms 被吞）
  - 载入时校验「不存在没有 post 判据的动作」；`only_if_state` 条件步；后置态**轮询**（退出到编辑器 >10s）
  - 新控件类型 `signature`：为低纹理 UI 准备（结算页模板余量仅 0.02，不可用）

- ~~**02 ys-state 状态层 + 回归集**~~ ✅ 2026-10-17
  - `tools/ys-editor/ys-state`：7 态（MENU/SAVELIST/EDITOR/PLAYTEST/PAUSE/SETTLE/UNKNOWN），每态 2 判据
  - **回归集 `calib/regress/`（7 样本）全绿**，含当天那个「草地阴影被误判成 SAVELIST」的头号反例
  - 子态层级 `PAUSE/SETTLE ⊂ PLAYTEST` 声明化 ⇒ 父态子态重叠不算矛盾；非同层同时成立才报 AMBIGUOUS
  - 阈值全部由 7 样本逐点量出（非拍脑袋）：sidebar 1.00 vs 0.71｜playtest-mark 1.00 vs 0.86｜
    save-card-title 1.00 vs 0.71｜pause-abort 1.00 vs 0.73｜pause-resume 1.00 vs 0.82｜settle-leave 1.00 vs 0.56
  - **修掉 ncc 未定义语义 bug**（平坦块上返回 4e9 被当成命中）——影响面超出本票
  - `tests/ncc.selftest.sh` + `ys-state --regress`

- ~~**01 ys-observe 观测层**~~ ✅ 2026-10-17
  - `tools/ys-editor/ys-observe`：唯一取数入口，读数带新鲜度证明
  - **拒绝而非撒谎**：原神不在栈顶 → `NOT_ATOP` + 退出 2，**不返回像素值**（正是今天踩的坑）
  - 越界探针 → `PROBE_OUT_OF_RANGE` 退出 3（ImageMagick 会**钳制**坐标，必须自己校验）
  - `--reuse` 显式复用旧帧并标注 `reused:true`
  - 自测 `tests/observe.selftest.sh` 13 项全绿
  - 顺带确认：原神在栈顶时 liveness `diff=936375` ⇒ **取数管线是活的**，
    坐实了今天"0 像素差分"的结论（当时原神不在栈顶，看到的确是陈旧帧）

## ⑤ 递归判据（每票收轮时更新）

> **「未验证的动作数」与「单判据态数」应当单调下降。**

| 轮 | 未验证动作数 | 单判据态数 | 归因分布（仪器/前提/判据/对象） |
|---|---|---|---|
| 基线（2026-10-17） | 全部（无账本） | 3（EDITOR/MENU/SAVE 各单判据） | 5 / 3 / 1 / 0 |
| 票 01 后 | 全部（账本待票 03） | 3 | 仪器新增 2 条已修（ys-wins 无 id 误判 / magick 钳制坐标） |
| 票 02 后 | 全部（账本待票 03） | **0**（7 态各 2 判据） | 判据新增 1 条已修（ncc 平坦块未定义） |
| 票 03 后 | **0**（账本覆盖 playtest-start/stop 全步） | 0（回归 **9/9** 全绿） | 仪器 2 条已修（指针通道 / 按住时长）；判据 2 条已修（SAVELIST、SETTLE 在游戏内误触发） |
| **票 04 后（阶段 A 完成）** | **0**（一轮 9 步全绿） | **0** | 本轮无新增被测对象级错误 |
