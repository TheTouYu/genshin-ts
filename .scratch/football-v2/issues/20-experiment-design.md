# 票 20 · 实验设计单（实验 1+2 合并轮，2026-09-04）

> 状态：**设计定稿待执行**（本轮不写 DSL 文件、不编译、不注入）。
> 配套账：`20-blackboard-capacity.md`（容量/带宽/判负线）｜前置票：`20-multi-creature-orchestration.md`
> 授权：用户 2026-09-04 一次性授权「实验 1+2 合并注入」+ 载体选型「新建独立 lab 图 + 新技能配置」；
> 本单定稿后，注入仍需四件套（游戏退出确认 + 备份 + 写前双 SHA + 注入后读图核验）。

## 0. 架构定稿（用户三问裁决，本单所有设计的前提）

```
L0 私有寄存器 = 技能变量（1207959553~57）   写：本实例｜读：本实例同拍零延迟｜隔离=19 票 3145 帧铁证
L1 共享黑板   = 造物自身 transform（6 float/造物）写：仅自身（瞬移）｜读：任意实体（getEntityLocation/Rotation）
L2 一致性点   = 服务端 + 实体自定义变量        写：服务端｜读：全体客户端（只读）｜取证面=事件序/帧流
```

三条裁决落地为设计约束：

| 裁决 | 后果 |
|---|---|
| 黑板=**造物自身 transform**（不选球） | N 造物 = 6N float 阵列；写者=身体主人 → **单写者纪律天然成立**，不需要原子量 |
| **零跳**（不接受中转读回） | **HP 不进黑板**（20008 无属性读 API，`[结构]` 已穷举）；L1 只剩 transform（6f）+ 单位状态 bool（可选第 4 实验） |
| **以 demo 实测为准** | 纸面容量（N=2 → 12f ≥ 11 需求）只作可行性论证；判决交给接力 demo 的实测推进率 |

## 0.5 架构修订 v2（2026-09-04 用户方向补充，**优先级重排以本节为准**）

用户两条情报 + 结构层核验（行号见 git 提交说明）：

1. **单位状态升级为 L1 黑板第二载体 + 触发器本体**：
   `addUnitStatus/removeUnitStatus/whether…`（三节点在 character_skill 与 creation_skill **双图族**，
   入参任意实体可连、无 literal 断言 `[结构]`）；官方《单位状态》确认**层数/运行时长/跨施加者叠加**
   语义（official-guide-concepts.md:9809-9931），UI 层"单位状态层数=总层数"旁证层数是真实读数
   （客户端仍只有 bool 读，层数读回经 L2）。**持续时间可配** → "0.01s 脉冲标记"方案官方语义支持。
2. **算力载体首选从造物换成角色（E0 新增，本轮头号实验）**：
   状态特殊功能「**定时触发技能**：让指定槽位的技能按触发间隔触发」（official-guide-auxiliary-appendix.md:1009）
   + **character_skill 图族独有** `getCurrentClientTime`/`getCurrentClientTimeHighPrecision(s+ms)`/
   `addKeyBehavior`/`getCurrentKeyBehaviorHighPrecision`（client_method_modes.ts:58-61，creation_skill 全无）
   + 20002 还有 `castSkillFromSpecifiedSlot`/`castSpecifiedSkillInstance`（client_nodes.d.ts:1087/1100，
   图内自施放=第二条自驱动链）。
   → 理论上限：施放率脱离造物 AI 距离节流（引擎调度）；单次施放内 finiteLoop+高精度时钟做
   **时间驱动子调度**（0.1s 大拍 × 0.01s 小步），等效计算频率=施放率×圈配额。
   技能配置模板：6↔20002（瞬发，程序化友好）；36↔20010（需操控状态，技能标 ❌ 未闭环——备选）。

**未证项（E0 全部要答案，一个不许当结论）**：触发间隔真实下限；6+瞬发可否被定时触发状态指向；
**角色施放的技能变量隔离粒度**（19 票只测了造物——若角色每次施放=新隔离实例，L0 跨拍计数器换载体，
方案改走 transform/状态）；公共冷却是否同样钉角色；忙等子循环负载。

**修订后实验顺序**：E0（角色载体，新增头号）→ E1（transform 黑板，原实验 1，仍做——它现在同时
回答"角色↔造物"与"造物↔造物"两种跨载体可见性）→ E2/E3（瞬移目标复核/HP 取证，降级为对照组与
可选轮，注入窗口顺路带，不单独占轮）。原 §2 之后各节继续有效（fb20-loop 四分支设计不动），
E0 探针另建 `fb20c-loop`（20002）+ 装配链，设计见 §7。

**补充（09-04 用户裁定）**：预设状态（Preset Status）与单位状态（Unit Status）是引擎**两套体系**，
与本票黑板无直接关联；其客户端写通道=官方可支持功能，已另立**票 21** 挂账后续做
（`issues/21-client-preset-status-write.md`，AGENTS 新规首例）。**本票任何实验不得把两者混用**，
容量账（`20-blackboard-capacity.md`）亦不预支票 21 的收益。

## 1. 本轮（实验 1+2）要闭合的两个未知量

| # | 未知量 | 判据（帧级） | 判负出口 |
|---|---|---|---|
| **E1** | 造物 B 能否**本拍直读**造物 A 的 transform（=L1 黑板是否存在） | 448 回传的 447-位置/旋转值随 447 计数器 n **跟随变化**（相位滞后 ≤2 拍） | 恒定/EMPTY/等于自身值 → 黑板不存在 → 集中化判负，收 R1 |
| **E2** | 瞬移的隐式目标槽能否作用于**非施放者**实体（球） | 449 执行瞬移后：自身位置变？**球位置变**？（客户端读 + 服务端轮询双证） | 仅自身变、球不动 → 14 票"仅限自身"运行时确认（**E1 仍活，架构不塌**） |

**为什么 E1 是收口实验而非开放探索**：服务端读 4 只造物 transform 已在票 18 收证
（`18-criteria-data.md:12`「fb_tp_x1..4 全部跟随」）；20008 读任意实体位置在参数层合法
（`[结构]` client_nodes.ts:21391/21417 + vendor genericId 200030/200031 `connectable:true`）。
两边都在，**中间那一跳（客户端→客户端）从没测过**——它就是整个集中化课题的枢纽。`[未实测]`

## 2. lab 图设计（fb20-loop 客户端 / fb20-listen 服务端读回）

### 2.1 四分支分工（一只造物一个角色，互不污染）

| 实体 | 角色 | 每拍动作 | 回传 tag |
|---|---|---|---|
| **447** | **WRITER**（黑板写方） | `n=chanIncr(cfg53)` → 瞬移自身到 `pos=(2·sin(0.3n), 0, Z447)`、`rot=(0, 9n, 0)` → 自读对照 | `WB7`=n（权威计数器）｜`WS7`=自读 x×100 |
| **448** | **READER**（E1 主角，**不瞬移**） | `m=chanIncr(cfg54)` → 读 447 的 loc/rot（`queryEntityByGuid(447n)`）→ 回传 | `RX8`=x447×100｜`RY8`=rot447.y 取整｜`MW8`=自身 m（证明它没瞬移=读数非自致） |
| **449** | **ATTRIBUTION**（E2 主角） | 瞬移**前**读球 x → 瞬移自身到标记位 → 瞬移**后**读自身 x + 再读球 x | `BT9`=球 x（前）｜`SF9`=自身 x（后）｜`BA9`=球 x（后） |
| **450** | **IDLE 对照** | 只递增计数器，不写任何实体属性 | `IDLE`=k（用于相位/重复度基线：4.6× 假并发的现形对照） |

设计理由（每条都对应踩过的坑）：
- **448 刻意不瞬移**：若它也写自己身体，则读到 447 新值时无法排除"是自己触发刷新"的干扰（单变量纪律）。
- **每分支独立 cfg**（53/54/…）：18 票实证并发写同 cfg 丢步。
- **450 空写对照**：给"同相位重复"留一条可量化基线，也验证 449 的瞬移没波及他人。
- **else 分支留空**：防第 5 造物误绑污染（`chanDispatch` 约定）。
- **全程零 print**：数据走信号 + 按图详情开窗（打印纪律 2026-09-03）。
- **不挂 HP/扣血循环**：本轮 HP 已按"零跳"裁决退出黑板 → fb20-listen **不需要** `fb_hp_drain`
  定时器，球血不被动过（相对票 18 的一次显式减负，副作用面缩小）。

### 2.2 lab 图源码草案（**设计稿，未落文件**；执行轮按 `dsl-nodegraph-development` + `client-nodegraph-development` 写）

```ts
// examples/football/src-fb/fb20-loop.ts（20008 客户端探针图，图 ID 待 assets:node-graphs create 分配）
import { g } from 'genshin-ts/runtime/core'
import { Fb20Signal } from './signals20.js'        // ← 新建文件：signals.ts 在本票不碰清单内

const BALL = 1077936135n
const E447 = 1082130447n, E448 = 1082130448n, E449 = 1082130449n, E450 = 1082130450n
const Z447 = -12.7, Z449 = 11.1            // 各自原位置常量（18 票防叠点）
const MARK_X = -20, MARK_Z = 0             // 449 标记位：场**外**空旷点（不与球/玩家重叠）

g.creationSkill({ id: <图ID>, name: '_GSTS_fb20Loop' }).on('start', (_evt, f) => {
  const guid = f.queryGuidByEntity(f.getSelfEntity())

  // —— 447 WRITER：写自己身体 = 写黑板 ——
  f.doubleBranch(f.equal(guid, E447), () => {
    const q = f.querySkillVariableValue(1207959553n)
    const n = f.dataTypeConversion(q, 'int') + 1n
    f.setSkillVariable(1207959553n, f.dataTypeConversion(n, 'float'))
    f.complexCreationTeleport(
      f.create3dVector(f.multiplication(2, f.sineFunction(f.multiplication(f.dataTypeConversion(n, 'float'), 0.3))), 0, Z447),
      f.create3dVector(0, f.multiplication(f.dataTypeConversion(n, 'float'), 9), 0))
    const self = f.getEntityLocation(f.getSelfEntity())          // 自读对照（写方视角）
    f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'WB7', n)
    f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'WS7',
      f.dataTypeConversion(f.multiplication(self.x, 100), 'int'))
  }, () => {
    // —— 448 READER：只读不写（E1 判据主角）——
    f.doubleBranch(f.equal(guid, E448), () => {
      const m = f.dataTypeConversion(f.querySkillVariableValue(1207959554n), 'int') + 1n
      f.setSkillVariable(1207959554n, f.dataTypeConversion(m, 'float'))
      const other = f.queryEntityByGuid(E447)                     // ← 任意实体寻址
      const loc = f.getEntityLocation(other)
      const rot = f.getEntityRotation(other)
      f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'MW8', m)
      f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'RX8',
        f.dataTypeConversion(f.multiplication(loc.x, 100), 'int'))
      f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'RY8',
        f.dataTypeConversion(rot.y, 'int'))                       // 9n mod 360 ⇒ n mod 40，可分辨滞后 ≤39 拍
    }, () => {
      // —— 449 ATTRIBUTION：E2 三分归因（自身/球/都没动）——
      f.doubleBranch(f.equal(guid, E449), () => {
        const k = f.dataTypeConversion(f.querySkillVariableValue(1207959555n), 'int') + 1n
        f.setSkillVariable(1207959555n, f.dataTypeConversion(k, 'float'))
        const ball0 = f.getEntityLocation(f.queryEntityByGuid(BALL))
        f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'BT9',
          f.dataTypeConversion(f.multiplication(ball0.x, 100), 'int'))
        f.complexCreationTeleport(f.create3dVector(MARK_X, 0, MARK_Z), f.create3dVector(0, 0, 0))
        const self1 = f.getEntityLocation(f.getSelfEntity())
        const ball1 = f.getEntityLocation(f.queryEntityByGuid(BALL))
        f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'SF9',
          f.dataTypeConversion(f.multiplication(self1.x, 100), 'int'))
        f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'BA9',
          f.dataTypeConversion(f.multiplication(ball1.x, 100), 'int'))
      }, () => {
        // —— 450 IDLE 对照：零写入 ——
        f.doubleBranch(f.equal(guid, E450), () => {
          const j = f.dataTypeConversion(f.querySkillVariableValue(1207959556n), 'int') + 1n
          f.setSkillVariable(1207959556n, f.dataTypeConversion(j, 'float'))
          f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'IDLE', j)
        }, () => {})
      })
    })
  })
})
```

**编译期已知雷（先登记，执行时逐条对撞）**：
1. `creation_skill` 无 `%`/无 moduloOperation → 计数器映射到位置只能用 sin（票 14 先例），**不要用取模**。
2. `float()` 类构造器禁止裸调 → 全用数字字面量（票 14 门禁实录）。
3. 分支体内 `registerExecNode` 后不再手动 connect（football AGENTS 不变量 8，防双入边）。
4. `queryEntityByGuid` 入参是否接受 bigint 字面量待编译验证；若拒收 → 备选=用
   `getEntityLocation(entity(...))` 形态（服务端先例）或 `getEntityListByUnitTag` 取实体。
   **这是本设计最大的实现不确定点，执行轮第一个编译目标就是打穿它**。
5. cfg 字面量约束：`1207959553n` 等必须 const/字面量（config_id 只收原生 bigint）。

### 2.3 服务端读回图草案（fb20-listen，挂球实体 1077936135）

```ts
// 挂载球实体（与票 18 的 fb-svlisten 并存但定时器名不冲突：fb20_poll）
g.server({ id: <图ID>, name: '_GSTS_fb20Listen' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.startTimer(f.getSelfEntity(), 'fb20_poll', true, [0.06])     // 引擎粒度 ~0.09s ⇒ 实得 ≤11/s
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    const ball = f.getSelfEntity()
    f.doubleBranch(f.equal(evt.timerName, 'fb20_poll'), () => {
      // 第三方见证面：4 造物 transform + 球位置（E2 的铁证来自这里，不依赖客户端自报）
      f.setCustomVariable(ball, 'fb20_p1x', f.getEntityLocationAndRotation(entity(E447)).location.x, false)
      f.setCustomVariable(ball, 'fb20_r1y', f.getEntityLocationAndRotation(entity(E447)).rotate.y, false)
      f.setCustomVariable(ball, 'fb20_p2x', f.getEntityLocationAndRotation(entity(E448)).location.x, false)
      f.setCustomVariable(ball, 'fb20_p3x', f.getEntityLocationAndRotation(entity(E449)).location.x, false)
      f.setCustomVariable(ball, 'fb20_p4x', f.getEntityLocationAndRotation(entity(E450)).location.x, false)
      f.setCustomVariable(ball, 'fb20_bx',  f.getEntityLocationAndRotation(ball).location.x, false)
      f.setCustomVariable(ball, 'fb20_bz',  f.getEntityLocationAndRotation(ball).location.z, false)
    }, () => {})
  })
  .onSignal(Fb20Signal.fb20_echo, (evt, f) => {
    const ball = f.getSelfEntity()
    const c = f.getCustomVariable(ball, 'fb20_sig_n').asType('int')
    f.setCustomVariable(ball, 'fb20_sig_n', c + 1n, false)
    f.setCustomVariable(ball, 'fb20_sig_last', evt.params.e, false)   // 分 tag 计数不进变量——判读从帧流取（票 18 口径）
  })
```

**为什么必须有这张图**：E1 若只靠 448 自报，遇到"客户端读到的其实是本地预测值"这一类引擎行为时无法自证；
服务端轮询 447 真实 transform 作**第三方见证**，才能把「448 读到滞后 k 拍」解释成复制延迟而不是读数假象。
（19 票教训：客户端帧/服务端事件序为铁证，两侧都要有。）

## 3. 期望帧签名（判读前写死，禁止事后凑）

| 观察项 | 可行签名（E1 成立） | 判负签名 |
|---|---|---|
| 448→`RY8` 序列 vs 447→`WB7` 序列 | `RY8 = 9·(n − lag)`，lag ∈ {0,1,2} 且**随 n 单调跟随** | `RY8` 恒 0 / 恒为某定值 / 等于 448 自身 rot（=读错对象） |
| 448→`RX8` vs 447→`WS7` | 两者差值 <1e-2（同值=客户端读到同一 transform） | 长期背离且 448 值不动 |
| 448 `MW8` | 递增率 ~13-15/s，与 `RX8` 同拍出现（证其未瞬移） | — |
| 447→`WS7` vs 服务端 `fb20_p1x` | 一致（服务端与客户端读同一份数据） | 客户端=预测值、服务端=权威值且长期背离 |
| 450→`IDLE` | 与其余三路**独立递增**（各 ~13-15/s，聚合 ~53/s=每实例节流独立的再现证） | 聚合钉在 ~15/s → 施放节流**全局共享**，堆率法失效（架构需改分槽） |
| 449→`SF9` ≈ `MARK_X·100` | 瞬移对**自身**生效（对照组通过） | 不生效 → 20008 瞬移节点根本没执行（链路问题，先修再判 E2） |
| 449→`BA9` vs `BT9`；服务端 `fb20_bx/bz` | **不变**（球未被写） ⇒ E2 判负=14 票结论运行时确认 | 球 x 跳到 MARK_X ⇒ **E2 判胜=球=全局黑板（6f/拍直写），集中化上限重估** |
| 瞬移节点 `API#200247` 帧形态 | 若出现 `IN0:Entity=…` → 隐式目标槽存在（E2 的编码入口） | 仅 `IN1/IN2` 两 vec3（=票 18 现见形态）→ 目标由引擎固定注入 |

**判读脚本要点**（执行轮按 `debug-log-investigator` 流程，复用现成件）：

```bash
# 1) 两图帧流 dump（大日志必须落文件）
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <日志.gia> frames --gil <地图.gil> --graph <fb20-loop图ID> > analysis/20-loop.txt
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <日志.gia> frames --gil <地图.gil> --graph <fb20-listen图ID> > analysis/20-listen.txt
# 2) 施放率/信号到达率（票 18 现成脚本，按 tag 分桶）
python3 .agents/skills/client-nodegraph-development/references/native-write-channel/scripts/extract_rates.py analysis/20-loop.txt analysis/20-listen.txt <日志.gia>
# 3) 新增：滞后互相关（WB7 n 序列 vs RY8/9 → 最优 lag + 跟随率）→ scripts/20-blackboard-lag.py（本票新写）
# 4) 详情开窗核对（流程 0.4：无记录≠未执行；频率按开窗内计）
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <日志.gia> records --summary
```

新脚本 `scripts/20-blackboard-lag.py` 的三件事：①按 tag 抽 `WB7/RY8/RX8/WS7` 时间序列
②对 (n, RY8/9) 做 lag 扫描取最小 Hamming 距离的 k（**允许 ±40 圈歧义**，因 rot.y 已 mod 360）
③输出「跟随率 %（=|ΔRY8/9 − Δn| ≤1 的拍占比）+ 滞后分布 + 逐秒缺失率」。

## 4. 资产清单与注册（执行轮第一步；全部「候选→回读→--write」）

| 资产 | 值 | 状态 |
|---|---|---|
| lab 客户端图 | `fb20-loop` type **20008** | 待 `assets:node-graphs create` 分配 ID |
| lab 服务端图 | `fb20-listen` type 20000 | 同上 |
| 挂载 | `assets:mounts attach 1077936135 --graph <fb20-listen>` | 球实体（与 1831 并存） |
| 信号 | `fb20_echo(tag:str, e:int)` | 待 register（**两参免 donor**，票 14 先例 777/778/779） |
| 本地信号文件 | `examples/football/src-fb/signals20.ts` | 新建——**不得改 `signals.ts`**（本票不碰清单） |
| 变量 | `fb20_p1x/p2x/p3x/p4x/r1y/bx/bz:float`，`fb20_sig_n/sig_last:int`（9 个，挂球实体） | 待 `assets:custom-variables --vars` |
| 技能配置 | 28 模板瞬发绑 `fb20-loop`，**CD 0.01s + 忽略公共冷却**（缺一被钉 ~1/s） | 待 `assets:skill-config create` |
| 复用 | cfg 1207959553~56（L0 私有寄存器，已存在）＋ 造物 447-450（已绑票 18 配置，**新增绑定=第 2 技能槽**） | 现成 |

保留票 18 的 `fb-loop`/`fb-svlisten` **一字不改**作回退锚（用户选「新建独立 lab 图」的实质收益）。

## 5. 用户侧动作（执行轮注入后要做的三件事）

1. 编辑器重载地图 → 给 447-450 各加绑 `fb20-skill` 配置（**决策层不动，执行技能槽新增**）
2. **把球踢停或原地不动等到 REST**（避免渲染驱动节拍 `fb_p_drive=0.18` 覆写球位置污染 E2 判据）
3. 详情只开 `fb20-loop` + `fb20-listen` 两图 → 进图近距站定 30-60s → 完全退出 → 告我日志名

副作用清单（如实告知）：447/449 会**可见移位**（447 ±2m 摆动 + 自旋、449 每拍在场内与标记位之间跳）；
球血本轮**不动**（无扣血循环）；旧票 18 的 `fb-loop` 若仍绑在造物上会与本轮并行触发 →
**建议执行轮先把 447-450 的票 18 配置解除绑定**，避免两探针链互相污染（需你在编辑器操作或授权我 detach）。

## 6. 下一轮（实验 3+）分支预告（不进本轮）

- **E2 判胜** → 球=全局黑板（6f/拍）路线：直接做「写球 transform + 全体读球」的接力 demo（容量一步到 12f/球）。
- **E2 判负 + E1 判胜** → N 造物分槽阵列接力 demo（pos 用主人 transform、tick 编 rot、vel 由接收方重建；见容量文档 §2.3）。
- **E1 判负** → 黑板不存在：落否定链 + 收口 R1「1 真算 + N 冗余哨兵 + 分片」，本票按票面第 2 出口关闭。
- **实验 4（可选，补 L1 第二载体）** → 单位状态 bool 跨实例可见性（前置=你在编辑器预配 1 个状态资产）。

## 7. 实验 0（新增头号轮）：角色技能「定时触发 + 图内时钟」载体可行性

> 假设来源=用户 2026-09-04 情报 + 结构层核验（§0.5）。**全部为候选假设，须受控实测。**

### 7.1 要闭合的未知量（一轮实验五问）

| # | 未知量 | 探针 | 帧级判据 |
|---|---|---|---|
| Q1 | 6+瞬发+20002 能否被「定时触发技能」状态**按 0.01~0.1s 间隔自动施放**（无需按键/无需服务端 cast） | 角色挂该状态 → 图内每拍 chanIncr + 信号 `RTAG1` | 服务端事件流到达率 ≥30/s（远超造物 15/s 顶）⇒ 触发器成立；钉在 ~1/s ⇒ 被公共冷却/瞬发模板限制 |
| Q2 | 触发间隔下限（引擎实际能多密） | 状态配 0.01s 起，逐轮抬高对照 | 秒桶施放数分布——**先测最小可用间隔** |
| Q3 | 图内时钟真实行为：`getCurrentClientTimeHighPrecision` 出参单位/起点/精度 | 每拍读一次（s, ms）→ 信号回传 `CTIME`（ms）+ 与施放时间戳对照 | ms 单调递增、跨拍间隔≈Q2 实测间隔 ⇒ 时钟可用 |
| Q4 | **角色施放的技能变量隔离粒度**（19 票只测了造物！） | `chanIncr(cfgA)` 后立即 `chanReadF(cfgA)`；跨施放看是否保持 | 逐拍严格递增 ⇒ 角色侧跨施放保持（L0 可用）；恒 1 ⇒ **角色每次施放新隔离实例** → L0 载体换 transform/状态，E0 结论改 |
| Q5 | 单次施放内 `finiteLoop` + 时钟预算做**时间驱动子调度**的代价 | 循环体：每圈读时钟比对 budget，累计 K 圈；回传 `SUB_K`（本拍圈数）+ `SUB_DT`（末圈时刻） | 实测圈数/秒 vs 目标 100/s；负载帧数是否可接受（详情开窗内计） |

### 7.2 资产（E0 专用，最小集）

| 资产 | 说明 |
|---|---|
| `fb20c-loop`（type **20002**） | 探针图：`g.characterSkill({id, name}).on('start', …)` —— Q1-Q5 全在这一张图里，节点预算 <60 |
| 技能配置 **6 模板 + 瞬发** 绑 `fb20c-loop` | CLI 可建（模板×图型硬约束 6↔20002） |
| **单位状态（用户编辑器新建）** | 效果=定时触发技能，指定槽位=上面的配置；触发间隔首轮 **0.1s**（保守），第二轮起探下限；持续时间建议**无限**（否则需每拍重补） |
| 角色装配 | 服务端一次性 `addCharacterSkill(角色, cfg, CustomSkillSlot1, Destroy)`（技能一 §链路） |
| 状态施加 | 服务端 `addUnitStatus(applier, 角色, statusId, 1, dict)` 挂到角色实体上（**引擎定时器语义在状态里，不在节点图里**） |
| 信号 / 变量 | 复用 `fb20_echo(tag:str, e:int)` + `fb20_*` 变量组（与 §4 同套，不新建） |

### 7.3 关键风险与规避（写死，执行时逐条对照）

1. **忙等不可无界**：`finiteLoop` 必须有**圈数上界 + 时钟预算双闸**（高频循环必须有停止条件——AGENTS 负载铁律；单圈 >3000 帧截断风险）。
2. **禁无限循环递归/无界 while**（DSL 受限子集）。
3. **观测信号事件门控**（技能五C：常态回声零 print 零每拍信号；Q3/Q5 的时钟读数按秒抽样回传，勿每圈发）。
4. **禁锢类状态拦截**=决策树③第一嫌疑：若 cast 帧全对但图零执行，先查角色身上有无编辑器侧控制状态（技能二-4）。
5. 角色寻址必须"玩家列表[0]→角色列表[0]"动态取（技能二-1，GUID 字面量对角色返回空实体）。
6. E0 若 Q1 判负（间隔钉 ~1/s 或状态无法触发瞬发技能）→ **回到造物路线**（fb20-loop 设计原样有效），并在票面登记"定时触发技能≠可用高频触发器"的实证口径。

### 7.4 E0 若判胜的架构后果（先写清，避免事后改口）

- 算力载体 = 角色（1 个就够，无需 N 造物）；**"多造物集中化"课题被替换为"单角色高频载体"**，
  但 L1 黑板需求**不会消失**：角色图算出的状态仍要交给服务端/其它消费者，且**若要用 N 个角色/多端协作**，
  统一写载体（transform + 单位状态）仍是必需件 → E1 与 E4（状态 bool 跨实例可见性）**继续做**。
- 接力 demo 的目标数字改为：载体施放率 × 圈配额 ≥20Hz（负载 <2.5k 帧/s 不变）。

## 8. 待验证登记（不虚构、不推广）

- **E0 五问全部**（触发间隔下限/6+瞬发可否被定时触发/角色技能变量隔离粒度/公共冷却对角色的影响/子循环负载）——见 §7.1，判据已预注册
- `queryEntityByGuid` 在 20008 的 bigint 字面量接受度（§2.2 雷 4）
- 客户端读到的 transform 是**复制态**还是**本地预测态**（§3 第 4 行对照判据）
- 200247 隐式 i2Index-0 槽的 wire 形态（解码 fb-loop.gia 即可静态先看一眼，执行轮顺手做）
- `setCustomVariable` 未预注册即写是否静默失败（本轮已先注册，留作对照知识）
- **E0 第 1 轮新增（2026-09-04，代码已实现但语义未实测，判读时先看这两条是否成立）**：
  ① **整数除法截断**——抽样门用 `residue = t1 − (t1/1000)·1000` 求秒内余数（20002 无取模节点，
    票 14 先例套路）；若引擎 int 除法不截断（四舍五入/浮点化），residue 恒 ≠ 预期 →
    SUB_K/SUB_DT 可能整轮零发射（**不影响 Q1/Q3/Q4 判据**，仅 Q5 观测面缺失，需换形态）；
  ② **时钟起点/单调性**——`getCurrentClientTimeHighPrecision` 出参 pin0=S/pin1=MS 的
    选择已按定义断言到产物层（decode 断言「7 条数据边全取 pin1」），但**起点是 0 还是 epoch、
    是否单调**仍待帧值实测（Q3 本体）。
- **技能变量段真实边界（09-04 字节取证）**：地图 **1908 实际存在 1207959553..602 共 50 个**
  （不是 1914 复盘文里写的 100 个/553..652 —— 那是 **1914** 地图的段，跨图引用 603..652
  会命中**不存在**的变量）。取证法=直读 .gil 字节 `raw.count(varint(1207959553+i))`，
  命中 1 次=仅声明空闲、≥3 次=有图引用。E0 用的 1207959581 已确认在位且空闲。
- **工具侧债（不属本票实验，登记勿夹带）**：`GSTS-DUPLICATE-EXEC-INPUT` lint 按
  `source_index` 归组、不看**目标** InFlow 引脚序号 → 把 `break_loop → finite_loop InFlow[1]`
  的合法回连误报为冲突（对照样本 `verify/inflow-index/inflow-index-repro.ts` 编译报同一条警告）。
  修法=按 (target, 目标 inflow index) 归组；本票只甄别不修，避免把他人 WIP 图的告警一起搅动。
