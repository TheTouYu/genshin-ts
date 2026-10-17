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

**票 03（ys-do 动作层 + 动作账本）** —— 下一票；票 01/02 已闭环。

> **用户裁决（2026-10-17）**：① 阶段 A 按 **4 票**走（01-04，不合并）；② 阶段 A 期间**完全不碰地图**
> （避免「半成品地图 + 换栈」双向失血）；③ 票 08（ys-probe）**保留但排最后**。

## ③ 票据清单

### 阶段 A：让读数与动作可信（P0，本阶段不碰游戏）

| # | 票 | blocked by | 状态 |
|---|---|---|---|
| 01 | [ys-observe 观测层](issues/01-observe.md) | — | ✅ |
| 02 | [ys-state 状态层 + 回归集](issues/02-state.md) | — | ✅ |
| 03 | [ys-do 动作层 + 动作账本](issues/03-do.md) | 01,02 | ⬜ |
| 04 | [ys-loop 编排层 + M4 产物监控](issues/04-loop.md) | 03 | ⬜ |

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

## ④ 已完成划掉区

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
