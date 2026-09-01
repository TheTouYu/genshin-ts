# 足球重建 v2 —— 客户端算力基座 + 球独立物理体（M0 训练场）· R0 交付

> 状态：**R0 待裁决**（2026-09-01 会话；两清单/骨架/退役方案/配置清单交用户确认后才进 R1）。
> 架构代号 **v6**（仓库序列，接 v5；任务书称"足球重建 v2"，指第二次整体重建）。
> 证据分层标注：【已验】=日志/GIL/游戏实测铁证；【静态】=本轮源码定义/配置只读盘点；【设计】=待 R1+ 实验定。
> 输入材料：client-nodegraph-development 技能全文、PROGRESS.md（08-30~08-31 全轮）、sim/PORTING-MAP.md、
> examples/football/AGENTS.md、docs/game-engine-knowledge/retrospective-2026-08-31-compute-lane-sync.md、
> ARCHITECTURE-V5.md（另补读）。

---

## 一、两清单（交用户裁决）

### 1.1 退役清单（旧架构决策 → 替代物）

| # | 退役项 | 旧位置 | 替代物 | 备注 |
|---|---|---|---|---|
| 1 | 服务端全量物理积分（0.12s 定时器三图 loop：logic tick / dribble 决策 / render 设备） | 825/828 注入版（v4 系）+ ARCHITECTURE-V5.md v5 三层 | 客户端 20008 常驻积分图（15Hz 造物路径）+ 服务端真相镜像 | 负载根因（0.12s×3 图全帧日志洪泛）整体消失 |
| 2 | v5 三层架构（使用层/逻辑层/渲染层，全服务端分工） | ARCHITECTURE-V5.md | 计算层（客户端）/ 真相层（服务端）两层；v5 文档转历史 | v5 Stage 3 本就 blocked（信号注册未完成），无沉没成本 |
| 3 | 服务端黑板契约（impVel/impSpin += 队列、逻辑层唯一写 pos/vel/spin） | ARCHITECTURE-V5.md §四 | 任务邮箱（seqlock 通道）+ 回传提交的真相镜像；镜像变量集缩为 pos/vel/spin/state/goalCount | += 队列语义整体不需要（任务通道是覆盖式） |
| 4 | v5 信号协议五件（ball_impulse/ball_kick/ball_reset/ball_set_state/render_now） | ARCHITECTURE-V5.md §三（未完成注册） | 不注册、不实现；新信号集见 §二.4 | Stage 3 blocked 项随之消灭 |
| 5 | phys_loop 0.12s 定时器遥控启停 + state_changed 广播驱动 | v5 设计（825） | 客户端拍内自持循环（15Hz 技能触发）；服务端零高频定时器（dispatcher 1s 轮询） | "静止零定时器"目标由架构天然达成 |
| 6 | 设备停止事件链驱动 tick（whenBasicMotionDeviceStops 分发） | v4 残留模式（3012 事故源） | 不再存在：服务端只挂视觉运动器（(a) 路径），不依赖停止事件 | 3012 双触发级联、0.15>0.12 排队顶替两事故类别整体消除 |
| 7 | 服务端带球连续速度控制器（dribble-field/dribble-v5 0.12s 决策 loop） | 828 | R4 移植客户端：玩家速度客户端直取【静态】getControlMotorCurrentVelocity，速度场全客户端算 | 三不变量保留（见继承 #8），实现位置迁移 |
| 8 | 渲染层独立图（829 读黑板挂设备 / render_now 插队） | v5 render.ts（未注入） | 服务端主图 onSignal 内直接挂球运动器（(a) 路径，见 §二.7） | render 图退役；"IMMEDIATE 插队帧"语义不再需要 |
| 9 | 物理常量 R4 手感三调注入版（ROLL_DECEL 2.0 等偏移 sim 基准的手感妥协） | 825 物理复合（08-31 注入） | 按 PORTING-MAP 定稿值重定基线（ROLL_DECEL=1.0 等） | **裁决点 A**：滚停 15~35m 验收带要求 sim 基准；手感偏差留给 R5 调参层 |
| 10 | tab 输入服务端直调链（input 图 ballApplyImmediate 914 节点/实例） | 826 | 操作台意图入口进服务端主图（只组任务包，不计算）——预算缩 ~90% | 意图→任务包组装是轻链 |

不退役（明确保留）：旧信号 def 三组（football_kick/ball_dropped/state_changed）已注册在地图，保留不动（**裁决点 C**，删除无收益有风险）；`src/*.v4.ts` 隔离区（纪律参照）；sim/（物理单一事实源）；DESIGN.md（玩法设计权威，架构无关）。

### 1.2 继承清单（引擎规则与已验证链路 ← 来源）

| # | 继承项 | 来源 | 适用位置 |
|---|---|---|---|
| 1 | 不变量八条：物化快照/跨图实体变量/outflows 声明/min-max 对称/覆盖式写禁+=/单图 ≤2000 节点/loop 停止条件/不手动 connect | examples/football/AGENTS.md §一（四修+七轮复测代价） | 全部新图（含客户端图） |
| 2 | 客户端调用链矩阵：角色路径（6+瞬发+20002、cast 实例 ID、四步动态寻址）；造物路径（28 模板+20008/20009/20007 三图、CLI 建不了 20007）；C↔S 手段四类与 float/vec3 未验边界 | client-nodegraph-development 技能 §一/四/五C【已验 1915/1916】 | R1 起全部轮次 |
| 3 | seqlock 门全套：单写者 dispatcher（1s 轮询+回声补位+4s 看门狗）、寄存器挂玩家实体、epoch/sum/ack、~5 任务/s、并发双写者丢任务 | 技能 §五D + retrospective-2026-08-31（日志 3064/3067）【已验】 | 同步层 |
| 4 | 客户端 DSL 八条差异：主配置全图编译再单文件注入、(iD,list) 参数序、无 getCurrentCharacter、str/int/bool 图内全局版、变量读取资产预注册、gsts 类型守卫、信号类编译指向目标 gil、entity helper 带参版 | 技能 §三（全部实证） | 客户端图编码 |
| 5 | 同实体多图定时器名单制分发（else 一律空分支）；诊断读活图带 SHA | retrospective 错误谱系 #5/#3【已验 3062】 | 服务端图 |
| 6 | 角色实体不可 GUID 查询（Query by GUID 对角色返回空、链路静默失败）→ 玩家列表[0]→角色列表[0] 四步；球等静态物件可 entity(id) | 技能 §二-1【已验】 | 两端图 |
| 7 | sim 物理单一事实源 + PORTING-MAP 参数四分法 + 半径方案 A + 验收锚点（2m 落体回高 0.7~1.2m / 侧旋 20m 横偏 2~5m / 8m/s 滚停 15~35m） | sim/（31 门 PASS）+ PORTING-MAP §5（用户已确认） | R2 移植 |
| 8 | 服务端图物理纪律：运动器同名顶替（时长略大于拍距）、whenBasicMotionDeviceStops 按 motionDeviceName 过滤、贴地不积分重力、反射 v'=v−(1+e)(v·n)n、图变量与实体位置双真相对账（幽灵球边界） | PROGRESS 各轮 + AGENTS【已验】 | 服务端视觉链 + 对账 |
| 9 | 带球三不变量：设备永不断供/速度=带记忆的状态/反馈=每拍实时几何；参考图『足球地面运动』行为基线 | PORTING-MAP §1.5 + football-dribble-velocity-field.md | R4 客户端带球 |
| 10 | 手感参数 v4 调优值（TOUCH_GAIN 1.8/CONV_C 2.0/COAST_C 4.0/FWD_WEIGHT 0.3/REL_WEIGHT 0.7/ROLL_DECEL 手感版 2.0） | PROGRESS 08-31 R4 三调（用户反馈校准） | R4 客户端带球初始参数——**裁决点 B** |
| 11 | 客户端链路四层成功签名（服务端 print→cast/决策帧→f8=2097154 客户端记录→onSignal）+ cast 静默失败四嫌疑决策树（禁锢第一嫌疑） | 技能 §五【已验】 | R1 起每轮核验 |
| 12 | 带宽铁律：模型选择=带宽选择（小体型 15~16/s、遗迹守卫 7.5/s）；CD 冷却组 0.01s+忽略公共冷却；CLI 28 模板焊死遗迹守卫→用户编辑器手动换小模型 | 技能 §五C 带宽表【已验，用户三实验交叉】 | 造物配置 |
| 13 | 地图资产复用不重建：1073741908 + 白线/门/球元件 + 实体场 1077936132/左右门 …33/…34/球 …35（basicMotion 已配）/操作台 …37（tabBar 9 选项） | PROGRESS 基本信息 + 任务书五 | 全程 |
| 14 | 复测协议：确认进对图 1073741908（名字极近「足球/足球_2」）、注入后重载地图、注入与游戏会话不重叠、Temp 手动同步双 SHA、写回后用户重载编辑器再保存 | AGENTS §五 + 根 AGENTS【已验（白测教训）】 | 每轮复测 |
| 15 | 写回安全流程（SHA 锁定→候选→回读→写回→Temp 双 SHA）与确认制、一次性授权仅当轮有效 | 根 AGENTS + 资产技能 | 一切地图写回 |
| 16 | 客户端图变量读写能力边界【静态，R0 本轮盘点】：有 setLocalVariable（图内变量写）/getCustomVariable（只读预注册变量）/**无** setCustomVariable（不能写实体变量） | src/definitions/client_nodes.ts | 客户端自持状态设计依据 |

---

## 二、架构骨架 v6

### 2.1 分层与职责

```
┌─ 计算层（客户端）────────────────────────────────────────────┐
│ 造物链：20007 决策图 → 20009 状态图(executeSkill) → 20008 物理图 │
│   fb-phys(20008)：15Hz 常驻循环                              │
│     · seqlock 门（epoch≠ack→读任务→sum 校验→二读 epoch）        │
│     · 图内自持球态 pos/vel/spin/state（setLocalVariable）【E2 验】│
│     · 六态积分一拍（重力+阻力+马格努斯+反弹+滑动摩擦+滚动衰减）    │
│     · 回传打包 sendSignal(fb_ball_state)                      │
│   fb-ondemand(20002)：服务端按需单次触发（踢球意图直达，R3 接入）  │
├─ 同步层 ────────────────────────────────────────────────────┤
│ S→C 任务：邮箱 fb_mq_*（挂 dispatcher 图实体）→ 唯一 dispatcher │
│   → 寄存器 fb_task_*(N)+fb_sum+fb_epoch+fb_ack（玩家实体，预注册）│
│   （seqlock 门在客户端 15Hz 轮询；单通道 ~5 任务/s，够用不扩）     │
│ C→S 数据：信号 fb_ball_state（str/int 起步，float R1 验）        │
│ 优先级分流：踢球/复位=20002 单次（即时）；连续参数=seqlock（可延迟）│
├─ 真相层（服务端）────────────────────────────────────────────┤
│ fb-server（新服务端图，挂球实体 1077936135，唯一写者）：          │
│   · dispatcher（1s 轮询+回声补位+4s 看门狗，重提交对）           │
│   · onSignal(fb_ball_state)：ack 前进+提交真相镜像（球实体变量）   │
│     + 挂视觉运动器（(a) 路径：同名顶替 0.1s 级）                 │
│   · 进球判定（镜像 pos 过门线）→ 比分 → 复位任务进邮箱            │
│   · tab 意图入口（操作台 9 选项 → 组任务包写邮箱 / 走 20002）      │
└──────────────────────────────────────────────────────────────┘
```

核心原则：**球任何时刻服从客户端自持的物理**（无玩家介入时踢一脚→飞→弹→滑→滚→停全程连续）；球员只施加影响（踢=冲量任务、带球=速度场参数、停球=阻尼参数），**无任何"球瞬移到脚下"路径**——服务端唯一的位置写操作是复位（GOAL 后/会话种子），走任务通道由客户端执行。

### 2.2 数据流（常态一拍，15Hz）

```
[C] 20008 触发（造物技能施放，~66ms/拍）
  → 门：读 fb_epoch/fb_ack（玩家实体变量，预注册）
  → 有新任务：读 fb_task_* 全量 → Σ校验 fb_sum → 二读 fb_epoch → 应用（冲量/参数/复位）
  → 六态积分一拍（sim 公式按 PORTING-MAP 四分法移植）
  → sendSignal(fb_ball_state, tag='ok', epoch, px,py,pz, vx,vy,vz, state[, spin])
[S] onSignal → ack 只前进 → 镜像写球实体变量 → 挂运动器（速度=(回传位−当前位)/时长）
  → 进球判定（服务端独立，防客户端漂移）→ 比分+复位任务
```

会话启动种子：fb-server whenEntityIsCreated → 写初始任务（球 pos/vel 种子）进邮箱 → 客户端首拍初始化自持态（对齐幽灵球教训：种子+周期对账，见 §2.7-D）。

### 2.3 图与资产清单（全部新 ID，不改旧四图）

| 资产 | 类型/模板 | ID | 产生方式 |
|---|---|---|---|
| fb-phys | 客户端 20008（creation_skill） | 1082130433 段新建 | assets:node-graphs create --type + 编译注入 |
| fb-ondemand | 客户端 20002（character_skill） | 同段新建 | 同上（R3） |
| fb-status 20009 / fb-decision 20007 | 造物状态/决策图 | 同段新建 | 20009=CLI 建；20007=**编辑器建空图**（ID=段内 max+1），注入器 patch graph-clear 后注入 |
| fb-server | 服务端图 | 107374182x 段新建 | assets:node-graphs create + 编译注入，挂球实体 |
| 造物技能配置 | 28 模板+瞬发 → 绑 fb-phys | assets:skill-config create | CLI（root20 联动） |
| 角色技能配置（R3） | 6 模板+瞬发 → 绑 fb-ondemand | 同上 | CLI |
| 信号 | fb_ball_state（+踢球直达用，R3 定） | assets:signals register | CLI（donor 同源法） |
| 自定义变量 | 寄存器组+镜像组（~20 个，见 2.4） | assets:custom-variables | CLI，**客户端读的全部预注册**（铁律） |
| 造物实体 | 小体型模型（15~16/s） | 用户编辑器放置 | 用户一次性配置（§五） |

### 2.4 变量与信号设计（初稿，R1 定稿）

**寄存器（挂玩家实体，int 为主，全部预注册）**——单写者=fb-server dispatcher：
`fb_t0..fb_t7`（任务载荷：type + kick vel/spin 定点 int×6 或复位坐标）、`fb_sum`、`fb_epoch`、`fb_ack`。
邮箱 `fb_mq_*`（同构一套，挂 fb-server 图实体=球实体）。闭式 sum 压缩纪律照抄（防 2437>2000 事故）。

**真相镜像（挂球实体 1077936135）**：`pos/vel/spin:vec3、state:int、goalCount:int`——仅 fb-server onSignal 写。

**回传信号 `fb_ball_state`**：起步 `tag:str + epoch,px,py,pz,vx,vy,vz,state:int`（8 int，定点 ×1000，范围 ±60m/±50m/s 足够）；spin 仅状态切换拍携带或拆第二信号（参数个数上限未验，R1 E3 一并定）。E3 float PASS → 直接 float 参数简化。

### 2.5 两笔账（写图前预算，Stage 2 IR 后实测复核）

| 图 | 节点估算 | 依据 | 帧数估算 |
|---|---|---|---|
| fb-phys（20008） | **700~1100** <2000 ✓ | 门 ~150-250（zt-client 同构）+ 六态积分 ~400-700（v4 物理复合族 implTotal 776 先例）+ 任务应用/打包 ~100-150 | 一拍一记录、无循环叠加，**~800-1500** <3000 ✓ |
| fb-server | **500~800** <2000 ✓ | dispatcher ~250-400（zt-main 100 变量版 1737 → 10 变量版缩比）+ onSignal 提交 ~80（7 变量×3-4 节点+运动器链）+ tab 入口 ~100-150 + 判定 ~60-100 | dispatcher 1 条/s ~200-400 帧；onSignal ~80-120 帧/条 ✓ |
| 20009/20007 | <50（照抄模板） | 已验证形态 | 极小 |
| fb-ondemand（20002，R3） | ~100-200 | d2-client 模板+冲量应用 | 单次一记录 ✓ |

超预算拆图预案：fb-server → 拆 dispatcher 独立图；fb-phys → 门与积分拆两图（同造物多技能，槽 81 多条目+20009 按序号，复盘 open-item 的扩展轴）。

### 2.6 带宽账与负载对比预估

| 通道 | 频率 | 依据 |
|---|---|---|
| 造物触发（S→C 计算节拍） | 15~16 次/s | 小体型模型 4 帧/施放；CD 组 0.01s+忽略公共冷却【已验】 |
| C→S 回传信号 | 15/s（可降 5/s，E4 对比） | 1 拍 1 条 |
| S→C 任务（seqlock 单通道） | ~5 任务/s | 3067 实测上限；踢球/带球参数频率 ≪ 此值 |
| 变量复制 | 寄存器 ~12 变量单通道 | 不加宽单通道，不够=复制通道（每通道一套寄存器+技能+造物） |

**服务端负载预估**（帧值口径，待 R5 用 gia_log perf 新旧同期对比核实）：
- 旧架构：3 图 × 8.3 tick/s × ~276 帧/记录 ≈ **~6900 帧/s**（服务端做全部物理积分；0.12s×3 全量日志洪泛曾被踢）。
- 新架构：onSignal 15 条/s × ~100 帧 + dispatcher 1 条/s ≈ **~1600 帧/s**（服务端零积分计算）；回传降 5Hz 则 **~600 帧/s**。降 **75%~90%**。

### 2.7 关键架构决策与证据（R0 定盘）

- **A. 客户端自持连续状态（非每拍从服务端读）**：15Hz 要求上拍状态 <70ms 可用，变量复制实测延迟 0~1s【已验 3064】不可用；客户端又无 setCustomVariable【静态】→ 唯一位置=20008 图内变量（setLocalVariable）。**风险：图变量跨技能施放是否保持未验（zt-lane 客户端无跨拍状态先例）→ R1 E2 最高优先验证**。失败兜底：物理降频至 seqlock 通道可支撑的 ~5Hz（计算仍在客户端，负载收益保留，手感损失 R1 评估）。
- **B. 视觉驱动走 (a) 回传-服务端挂运动器**：(b) 客户端图内直驱运动器**静态判死**——client_nodes.ts 节点面【静态】无 addBasicMotionDevice/setEntityLocation 类方法（有 getEntityLocation 只读；characterBlink/tacticMove 是角色与造物自身移动，不适用球物件）。保留 10 秒编辑器差分反证口：用户在编辑器任一客户端图节点库搜"运动/位置"类节点，若存在则 (b) 复活重评。**R1 主实验= (a) 全链量化**（E4）。
- **C. 双通道意图分流**：踢球/复位（手感延迟敏感）走 20002 单次触发（cast 链同记录完成【已验 3044】）；带球速度场参数（缓变）走 seqlock。避免 seqlock 0~1s 复制延迟伤踢球手感。
- **D. 幽灵球防线**：真相镜像（服务端）与客户端自持态（计算）是两个真相域——服务端不做位置纠偏回写（会打架），只在 GOAL 复位/会话种子时经任务通道单向重置客户端态；进球判定用服务端镜像独立做（防客户端漂移误判）。
- **E. 服务端"静止零定时器"仍成立**：dispatcher 1s 轮询是唯一常驻定时器（低频；可评估 whenCustomVariableChanges 事件驱动替代——open item，非 R1）。

---

## 三、R1 实验设计（客户端算力通道最小闭环）

照抄 `verify/zaowu-client/` + `verify/zt-lane/` 模板在足球地图落地，五个实验（E1 主线，E2/E3 并行，E4 收官）：

| # | 实验 | 方法 | 通过判据 | 失败兜底 |
|---|---|---|---|---|
| E1 | 最小闭环全链 | 服务端写任务→寄存器→客户端 15Hz 门读→sendSignal→onSignal 提交+print（照抄模板，足球地图新图新 ID） | 客户端链路四层成功签名全齐（服务端 print/决策帧/f8=2097154/onSignal）+ 11/11 零丢失零撕裂量级复现 | 按技能决策树排查（禁锢第一嫌疑） |
| E2 | 图内变量跨拍保持 | 20008 图内 setLocalVariable 写计数器/上拍 pos，下拍读回比对（日志帧值） | 连续拍读回上拍值 | 物理降频 5Hz；或状态外置方案重议 |
| E3 | 信号参数形态 | ①float 参数信号最小验证 ②8 int 多参信号注册+回传 | 服务端 onSignal 收到且帧值类型正确 | float 弃用→int 定点 ×1000；多参不行→拆信号/裁参数 |
| E4 | (a) 视觉链路端到端 | 15Hz 回传 pos→服务端挂同名运动器（0.1s 级）驱动球实体；对比变体 5Hz+0.25s | 球连续平滑移动；日志量化回传→运动器帧延迟；用户观感 | 调运动器时长/回传频率；(b) 若编辑器差分复活则对比再定 |
| E0 | 阳性对照 | 不重跑 1915/1916，仅对照配置字节 | — | 排查时用跨地图对照法 |

R1 明确不做：物理公式移植（R2）、踢球意图（R3）、带球（R4）。

---

## 四、旧四图退役方案（825/826/828/829，待用户确认后执行）

原则：改名保留（删除复合定义会 ID 前移→拒载）；球实体挂载互斥（新图接管与旧图摘除同批）；不动旧信号 def。

1. **活图盘点（先做，带 SHA）**：SHA 锁定读取 1073741908 现状——四图的挂载关系（825/828→球实体？826→操作台 1077936137、829 是否已创建/挂载）、当前注入内容代号（预期 825/828=v4 R4 三调版、826/829=v5 半成品或空）。盘点结果回填本节再执行。
2. **src 侧隔离**：`logic.ts/input.ts/render.ts/dribble-v5.ts` → 改名 `*.v5.ts`（同 `*.v4.ts` 模式，entries 已排除 `*.v4.ts` 需同步扩为排除两个模式）；gsts.config.ts 注释更新。
3. **图改名**：四图资源名加前缀 `RETIRED-v6-`（走 gil-node-graph-editing patch 安全流程：SHA 锁定→候选→回读→写回）。
4. **摘挂载（与新图注入同批执行）**：825/828 从球实体 1077936135 摘除（与 fb-server 挂上同批——双图同驱=双 loop 干扰事故铁律）；826 从操作台摘除（tab 意图入口已在新 fb-server）；829 按盘点结果处理。
5. **收尾**：Temp 手动同步双 SHA → 用户重载编辑器再保存 → 日志确认零旧图 tick 记录。

执行时点：R1 注入 fb-server 之前同批完成（旧图物理 loop 与新通道并行会互相干扰）。

---

## 五、用户编辑器一次性配置清单（R1 前草稿）

> 客户端路径硬前置（CLI 建不了的部分）；照抄 1915 配置经验，约 5 分钟：

1. **确认地图**：进入 **1073741908「真实足球」**（勿进「足球/足球_2」）。
2. **造物实体放置**：元件库 → 复杂造物 → **选小体型模型**（如打手丘丘人；CLI 建的默认遗迹守卫仅 7.5/s，**模型选择=带宽选择**）→ 放置球场角落（不挡玩法）。
3. **造物技能管理**：引用 fb 造物技能配置（记下**序号**，对应 20009 executeSkill 参数）→ CD 设置：**冷却组 0.01s + 忽略公共冷却**（默认公共冷却 1.0s 会把频率钉死 1 次/s）。
4. **自主逻辑参数**：新增模板 → 初始生效（对应 20007 switch 第三参）。
5. **决策图特化绑定**：编辑器新建空 20007 图（ID=段内 max+1）→ 造物实体特化配置组件槽 80 绑定该图。
6. **（R3 时）角色侧确认**：角色无禁锢类控制状态（cast 静默失败第一嫌疑，编辑器侧施加搜不到）。
7. 完成后留一局 Beyond_Debug_Log 供四层签名核验。

---

## 六、裁决点汇总（进 R1 前需用户拍板）

| # | 问题 | 建议 |
|---|---|---|
| A | ROLL_DECEL 基线：PORTING-MAP 1.0（sim 基准，8m/s 滚停 ~23m 配验收带）vs v4 手感版 2.0 | **1.0**（验收锚点配套；手感偏差 R5 调参层解决） |
| B | R4 带球初始参数是否继承 v4 调优值（TOUCH_GAIN 1.8/CONV_C 2.0/COAST_C 4.0/FWD 0.3/REL 0.7） | **继承**（用户手感校准过的锚点，避免 R4 从零再调七轮） |
| C | 旧信号 def 三组（football_kick/ball_dropped/state_changed）保留 or 清除 | **保留**（删除无收益、动注册表有风险） |
| D | 退役命名 `RETIRED-v6-` 前缀 + src 改名 `*.v5.ts` | 照此执行 |
| E | 回传频率起点：15Hz 全速 vs 5Hz 降频+运动器插值 | **15Hz 起步**，E4 出数后定生产值 |
| F | 两清单（§一）整体确认 | — |

## 七、R0 静态证据附录（本轮只读盘点）

| 命令/文件 | 结论 |
|---|---|
| `grep -ril "motionDevice\|BasicMotion\|addMotion" src/definitions/` | 仅服务端定义命中；client_* 零命中 |
| `src/definitions/client_nodes.ts` 方法枚举 | 有 getEntityLocation/getCustomVariable/setLocalVariable/getControlMotorCurrentVelocity；**无** setCustomVariable/addBasicMotionDevice/setEntityLocation |
| `src/definitions/client_graph_modes.ts` | 客户端图 7 子类型（character_skill/character_control_skill/creation_skill/creation_status/creation_status_decision/bool_filter/int_filter） |
| `examples/football/gsts.config.ts` | v5 注释态：entries 排除 *.v4.ts；inject→1073741825；skipSafeCheck=true（弹球图遗留，新架构需复核此项是否仍适用） |
| `.agents/skills/client-nodegraph-development/references/creation-path/templates/{,zt-lane/}` | 模板 5 源码+zt-lane 全套在位可抄 |
| `verify/zaowu-client/ verify/zt-lane/ verify/d2-client/` | 工作源码副本在位 |
