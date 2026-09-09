# G3-PLAN — 玩法逻辑实现细化（2026-09-09，依据 RG-DESIGN §1/§2/§4）

> 前置：G2 已落账（9 图迁移+信号 7+挂载还原，checks/g2-map.mjs ALL GREEN）。
> 本文件=票05/06 执行蓝图；实现顺序=玩家输入图→对局状态机图→提示/自由图。

## 输入方案定案：方案 A（solver 信号通道复用）

依据：①turn 图零改动原则（用户裁决基线，不污染主线参照结构）；②rubik3x3_solve[op,val] 通道已实测可驱动任意面转序列（solver 还原即此模式）；③打乱与玩家转动同构=发 move 序列。
- 打乱：对局图生成随机序列（避免连续同面互逆）→ 逐 move 发 rubik3x3_solve → par=序列长度（3/5/8/12 档）。
- 玩家转动：HUD 按钮 → 玩家输入图（玩家节点图，UI 事件专属）→ 新信号 rubikgame_input[btnId] → 对局图计数（moves+1）→ 转发 rubik3x3_solve。
- 方案 B（turn 图入口手术）仅当 A 通道行为层受阻（打乱序列与 solver 节拍冲突）才启用，启用前须用户确认。

## 状态机变量表（关卡变量，HUD 文本框插值实时刷新依赖）

| # | 变量 | 类型 | 语义 |
|---|---|---|---|
| 1 | rg_stage | int | IDLE=0/SELECTING=1/SCRAMBLING=2/PLAYING=3/SETTLED=4 |
| 2 | rg_level | int | 档位（3/5/8/12；0=自由模式） |
| 3 | rg_par | int | par 步数（=打乱步数） |
| 4 | rg_moves | int | 已用步数 |
| 5 | rg_hint_used | int | 是否用提示（0/1，星级判定：用提示最高 2★） |

星级：3★=moves≤par 且未用提示；2★=moves≤par+3 或（未用提示但超 par+3 前）；1★=完成。（实现口径：3★ moves≤par&&hint=0；2★ moves≤par+3；否则 1★——与 RG-DESIGN §1.2 一致。）

## 新图分配与预算两笔账

| 图 | id | 类型 | 用途 | 节点预算 | 帧预算 |
|---|---|---|---|---|---|
| _GSTS_rg_input | 1073741837 | 服务端（挂玩家模板） | UI 事件入口（控件组触发/悬浮页操作）→ rubikgame_input 信号 | ≤300 | 事件驱动单 tick<100 帧 |
| _GSTS_rg_state | 1073741835 | 服务端 | 对局状态机（选档→打乱调度→计步→星级→结算→解锁；监听 solve_done/input） | ≤900 | 打乱 12 步≈12 tick×<200 帧；零轮询 |
| _GSTS_rg_hint | 1073741836 | 服务端 | 提示（inverseTables 12 move 逆表接线+当前态求解单步）+自由模式计步 | ≤500 | 事件驱动单 tick<200 帧 |

- 1835/1836/1837 分配依据：root10 当前 max=1834 → 顺序分配；不与 aux 1941+ 段冲突（root 隔离，donor 同构先例）。
- **玩家节点图实证（2026-09-09，genshin-ts-asset-operations SKILL.md:96/155）**：玩家节点图=普通 20000 服务端图，挂玩家模板 1086324737（root4 def+root5 九副本 737..745）；挂载=`attach --def`+循环 `attach --entity` 每副本（CLI --def 只同步 root8 不同步 root5 副本）；per-player 执行——全局一次语义须去重门控。
- 挂载：rg_input 1837→玩家模板 def+9 副本；rg_state 1835/rg_hint 1836→实体 1077936260（空模型锚点，donor 语义）。
- 预算红线：单图 gameNodeCount≤2000、单记录<3000 帧、零高频轮询（全事件驱动）；写图前 `assets:node-graphs nodes` 复核。

## 信号清单（新增 2 + 复用 3）

- 新增：rubikgame_input[btnId:int]（玩家图→服务端）；rubikgame_state[ev:int, val:int]（对局图广播状态/数据变化，HUD 与结算页监听刷新）。
- 复用：rubik3x3_solve[op,val]（转动通道）、rubik3x3_solve_done[ok]（完成判定→SETTLED）、rubik3x3_solve_move[moveId]（提示监听当前步）。
- 注册形态（G2 实证）：`register --param 名:型` 一次性显式带全参数。

## 实现顺序（票05/06 拆步）

1. 信号×2 注册+玩家输入图（UI 事件→信号，先于 UI 资产可先跑 tabBar 临时入口？否——UI v3 优先，输入图与票04 UI 资产联调）。
2. 对局状态机图骨架（变量+状态转移+打乱调度+计步）→ 编译注入 → 读图核验。
3. 胜利判定接线（solve_done 监听→星级计算→rg_stage=SETTLED+rgame_state 广播）。
4. 提示图（逆表接线+单步提示+hint_used 置位）+自由模式（rg_level=0 无 par 计步）。
5. 行为层联调（用户游戏核验：三档打乱/转动/提示/结算/星级/解锁）。

## 风险与核验点

- UI 事件→玩家节点图挂载：玩家图 id 段与挂载方式待首建实测（create --type 输出确认）。
- 打乱与 solver 节拍共存：solver emitTick 1.52s 固定；打乱期间禁用输入（rg_stage 门）。
- solve_done[ok] 的 op7 语义=最终完成（donor 实证）；打乱后中间态不触发（ok=0 路径核验）。
