# 已核验分支记录

按 SKILL.md 闭环流程登记。日期格式 YYYY-MM-DD；证据分层：自动（编译/wire/注入）与用户游戏证据分开。

## verify-signal（2026-08-06，用户游戏核验通过）

- 背景：新地图 1073741853「gsts-verify」上验证自定义信号全链路（`assets:signals register`
  自动初始化注册表 field 10.5 + sendSignal/onSignal 注入）。
- 地图：`1073741853.gil`（`maps:create` 新建，无 --graphs 的最小骨架；分支 placeholder
  `verify-graph-1` id=1073741825，注入后替换为 `_GSTS_verify-signal`，7 节点）。
- 信号：`verify_signal`（send=1610612741/monitor=1610612742/server=1610612743，
  params=[face:str direction:str]），donor=1073741848 的 cube_turn 模板。
- case 源：`verify/verify-signal/verify-signal.ts`（DSL id=1073741826，多分支共存规则）。
- 自动证据：GIA 解码 sendId=1610612741/monitorId=1610612742 节点存在；单文件注入成功；
  注入后回读 7 节点完好；`assets:signals inspect` 回读 `verify_signal` 带参数。
- 用户游戏证据：编辑器打开正常、信号行为符合预期，核验通过。
- 踩坑记录（已回写 SKILL.md 关键点）：信号 case 编译必须配 inject（GIA 生成从
  `cfg.inject` 读注册表）+ `--noinject`；多分支 DSL id 必须互不相同（merge 按图 id 合并）。

## verify-inflow-index（2026-08-06，用户游戏核验通过）

- 背景：修复 `applyEditorConnectionWireRules()` 无条件删除 InFlow connect index 的生产 gap
  （真实证据 case3：非默认目标 InFlow 显式写目标 ShellIndex）。
- 地图：`1073741852.gil`「InFlow核验」（`maps:create` 新建，首个验证地图实例；mapId=max+1，
  placeholder 图 id=1073741825）。
- 分支图：placeholder `verify-inflow-index` → 注入后替换为 `_GSTS_inflow-index-repro`
  （id=1073741825，8 节点：事件→打印→有限循环→循环体打印→双分支→break_loop→打印）。
- case 源：`verify/inflow-index/inflow-index-repro.ts`（当时目录为 `verify-inflow-index/`，
  迁移后路径见仓库）。
- 自动证据：
  - 单元测试 red→green（默认 InFlow[0] 省略 index / 非默认保留 index=1，connect 与 connect2 均断言）；
  - 生成 GIA 解码：break_loop（genericId.nodeId=6）→ finite_loop 的
    `connect/connect2 = {kind: InFlow, index: 1}`，与 case3 真实证据逐字节同构；
  - 注入后 `.gil` 回读同一 wire 形态保持。
- 用户游戏证据：编辑器打开正常、行为符合预期（loop-body 仅 1 次 + after 打印），核验通过。

## verify-u1-cross-graph + verify-u2-multi-mount（2026-08-16，用户游戏核验通过）

- 背景：S4 测评暴露 U1（跨图信号投递未验证）与 U2（同图多实体挂载未验证）——信号灯阵
  第二 demo 的架构命门。
- 地图：`1073741888.gil`「GSTS核验-复合族4」（现有实例，未新建）。
- 分支图：placeholder 1830/1831/1832 → 注入后 `_GSTS_send`（3 节点）/`_GSTS_recv`（5 节点）/
  `_GSTS_u2-multi-mount`（2 节点）；attach：1830/1831→1077936151，1832→1077936151+1086324737
  （日志实际执行实体 1086324738——默认模版实例，与 attach 目标同 def）。
- case 源：`verify/u1-cross-graph/send.ts|recv.ts`（verify_ping2）、`verify/u2-multi-mount/u2-multi-mount.ts`。
- 自动证据：GIA wire 断言（send=1610612744/monitor=1610612745 与注册表精确一致、字面量在位）；
  注入后图名索引逐节点吻合；Temp 同步 MD5 一致。
- 用户游戏证据：2699 日志——**U1 跨图投递成立**（send 图 1830 发送 5 次 → 图 1831 与 1828
  均收到，参数 ping-u1/tag-u1 完整传递）；**U2 多挂载成立**（图 1832 在两个实体上独立执行，
  u2-fire ×2）。证据 `~/genshin-ts-evidence/u1-u2-verify/`（SHA ac82e67a…）。
- 规则结论：跨图信号投递 = 广播语义（所有监听该信号的图均收到）；同图可挂多实体且各实例
  独立执行（whenEntityIsCreated 每实体触发）。已同步 signals.md「尚未闭合」条目闭合。

## verify-u4-color-change + verify-u4b-model-display（2026-08-16，用户游戏核验）

- 背景：U4 判定节点 835（modifyModelColorAndMaterial）有效性 + 灯阵明暗方案选择；
  835 不在编辑器 data.json/server 静态元数据，committed DSL 支持为旧快照遗产。
- 地图：`1073741888.gil`；分支图 1833 `_GSTS_u4-color-change`（835）/ 1834
  `_GSTS_u4b-model-display`（308），均 attach 1077936151。
- case：`verify/u4-color-change/`（图 1835 DSL：whenTabIsSelected → 835 改色 0xFF0000/
  opacity 100）+ `verify/u4b-model-display/`（图 1836 DSL：tabId==1 → 308 false 隐藏，
  其他 → 308 true 显示）。
- 自动证据：GIA wire 断言（835 帧 IN3=16711680、IN4=100.0 参数正确；308 双分支结构）。
- 用户游戏证据（2701/2702 日志）：**835 执行但不变色 → 无效节点 ID**（三重重证据）；
  **308 生效**——点 R 实体隐藏（u4b-hide-fire ×1）、点 L 重现（u4b-show-fire ×5）。
- 结论：灯阵明暗用 308 显隐（亮=显示/暗=隐藏）；835 从 M4 同步保留清单移除（新资源
  删除方向正确）。证据 `~/genshin-ts-evidence/u4-color-change/` + `u4b-model-display/`。

## verify-d2-lv + verify-d2-client + verify-d2-client-skill（2026-08-30，用户游戏核验）

- 背景：D2 对象式局部变量 API（LocalVariable<T> .set/.value）server/client 双端游戏内行为核验
  + 服务端调用客户端技能完整链路。
- 地图：`1073741915.gil`；图 1828 `_GSTS_verify-d2-lv`（server d2-lv，attach 1077936129）、
  1829 `_GSTS_verify-d2-skill`（server 施放/监听，attach 1077936129）、1082130434（20010 客户端图）、
  1082130435（20002 角色技能客户端图，6 配置 1098907654 瞬发绑定）。
- 链路：1829 定时器 → getAllCharacterEntitiesOfSpecifiedPlayer(player)[0]（角色实体，非玩家）
  → addCharacterSkill(角色, 1098907654, CustomSkillSlot1, Destroy) → createCustomSkillInstance
  → setCustomVariable(角色所属玩家, "技能实例ID", 实例) → castSpecifiedSkillInstance(角色,
  getCustomVariable("技能实例ID").asType(int), false) → 20002 客户端图 start → D2 链 → 信号回传。
- 用户游戏证据（2997 日志）：**客户端图记录 f8=2097154 ×32**；B 组 `set → 100 / len → 3`；
  客户端帧 Get('score')=100（Set 后读回）、拼装列表 [1,2,3] → getListLength=3、信号 send×2。
- 结论（D2 客户端 API 游戏内闭环）：localVariable 显式名 + set 后 value 读回 = 新值 ✓；
  列表字面量值保留 ✓；服务器→客户端技能链路（6 模板 20002 图 + 玩家变量中转实例 id）✓。
- 教训（链路上多轮归因）：① cast 需**技能实例 id**（非配置 id）；② 施放/创建需**角色实体**
  （Get All Character Entities of Specified Player[0]，非玩家实体）；③ **6 模板必须绑 20002 图、
  36 绑 20010**（类型约束）；④ 36 角色操控技能需**操控状态**（未受控 Cast 静默无效）；
  ⑤ 技能装配 = 编辑器战斗预设（root16 变体记录，魔方 9 条 vs 我们 3 条——装配 wire 未闭合，
  CLI 待补）；⑥ getCustomVariable 仅 2 参（asType 显式定型）。

## verify-d2-lv 编译器双缺陷修复闭环（2026-08-30，用户游戏核验 3001）

- 背景：2998 日志比对发现两处编译缺陷——`d2lv|set|`=100（源码期望 101，Addition IN1
  字面量 1 丢失）与 `d2lv|dyn|`=恒 0（源码期望 timerSequenceId 递增）。
- 缺陷 ① set=100：**非编译缺陷**——.gia 与注入器产物中 Addition IN1 均完好（内层
  alreadySetVal=1 + bInt=1，内存注入差分实证），真实 .gil 里被清是历史旧产物（fc44db1
  前注入）+ 编辑器保存清零遗留；编辑器差分（用户改 Addition IN1=1 保存）证明编辑器
  保留 alreadySetVal=1 的值 → 重新注入当前产物即恢复 101。
- 缺陷 ② dyn=0：**whenTimerIsTriggered 输出 pin 顺序**——官方/vendor 定义（定时器序列序号
  index 3、循环次数 index 4，用户编辑器实测）与**引擎运行时顺序相反**（帧参数自报 index：
  OUT3 恒空、OUT4 按定时器各自计数 d2lv:1,2,3 / d2skill:1,2,3）→ timerSequenceId 必须连
  index 4。修复：vendor 保持官方顺序，`scripts/generate-definitions.ts` buildEvents 加
  whenTimerIsTriggered 换序 override（提交 7ef46b8）。
- 用户游戏证据（3001 日志，注入后首测）：`d2lv|set|`=**101** ✓、`d2lv|dyn|`=**1,1,2,2,3,3**
  ✓（每定时器独立序列，与帧证据一致）；init=42/len=3/elem0=1 不变；B 组 set=100/len=3 照旧。
- 知识：定时器事件节点"官方定义顺序 ≠ 引擎运行时输出顺序"（详见
  docs/game-engine-knowledge/node-graphs.md「定时器事件」节）。

## verify-c2s-cv（2026-08-30，用户游戏核验通过 3008——手段 3 闭环）

- 背景：服务端↔客户端通信手段矩阵第 1 轮——自定义变量共享存储（S 写→C 读）在新地图闭环。
- 地图：**新建** 1073741916「GSTS核验-变量C2S」（用户指示：旧变量图 1073741915 仅作参考）；
  服务端图 `_GSTS_verify-c2s-cv`（1073741825，28 节点，挂载空模型 1077936129）、客户端图
  `_GSTS_verify-c2s-cv-client`（1082130433，20002，5 节点）、信号 `d2cv`（tag:str val:int）、
  技能配置 1098907660（6 模板瞬发绑定）。
- 链路：cv_write 定时器(4s) setCustomVariable(玩家, d2c_counter, 序列) → cv_cast 定时器(10s)
  施放链（addCharacterSkill→createCustomSkillInstance→set 技能实例ID→cast）→ 客户端图
  getCurrentCharacter→getPlayerEntityToWhichTheCharacterBelongs(带参)→getCustomVariable
  ('d2c_counter')→sendSignalToServerNodeGraph → 服务端 onSignal 打印。
- 自动证据：wire 断言（WhenTimer OUT4 值链/技能实例ID set-get 对/monitor tag→OP3、val→OP4；
  客户端 5 节点链+信号名 pin）；注入后 .gil 回读两图执行流一致；复合 0 悬空；Temp md5 一致。
- 用户游戏证据（3007 首测→3008 复测，**受控差分定论**）：
  - 3007（未预注册）：写入/施放/客户端图执行全正常（施放链 CreateInstance=10000002、
    Set/Get 技能实例ID 当 tick 读写正常），但客户端「获取自定义变量」**无 OUT 帧**→信号
    val=None→monitor 不触发。动态创建的变量**客户端不可见**。
  - 3008（预注册 d2c_counter+技能实例ID 到玩家 prefab 顶层+9 副本后，编译产物零改动）：
    客户端 OUT0:Integer=2 → 信号 IN1:Integer=2 → f22 `cv`=2；N=2,4,7 三次一致全链闭环。
- 规则结论：①**自定义变量必须资产侧预注册才能被客户端图读取**（官方文档前置要求 + 实证；
  已沉淀 genshin-ts-asset-operations 技能红线）；②服务端动态创建变量仅服务端当 tick 读写
  可见（跨端不可见）；③附带观察：同 tick 双定时器 cv_cast 分支先于 cv_write 执行（单样本）。
- 踩坑（已回写）：新分支图 id 必须先查 verify/ 全部 g.server id（与 d2-lv 1073741840 撞 id
  → merge 污染 60 节点，parse 回读发现）；客户端 helper 类实现是带参版（interface 无参版
  未落到类，调无参版传 undefined 报 Invalid value type: entity）。

## verify-c2s-nt（2026-08-30，用户游戏核验通过 3011——手段 4b 闭环）

- 背景：通知服务器节点图（notifyServerNodeGraph）→ whenSkillNodeIsCalled 通道闭环 + 事件定向规则定论。
- 资产：同图 1073741826（7 节点：When Skill Node Is Called + 6 打印）；客户端图 1082130433 加 notify
  节点（gid 200039，三字面量 c2s-nt/p2-fixed/p3-fixed，串行在 sendSignal 后）。
- 用户游戏证据（四轮差分链，3009→3011）：
  - 3009（图挂空模型）：客户端 notify 帧完整执行（head=06 三参数）但事件零触发。
  - 3010（玩家侧挂载 root4 def+root5 副本）：仍零触发（含 9 副本 f6）。
  - 用户编辑器教学差分：特殊实体挂载真实 wire（root4 f7 + root5 副本 f6 双写；条目 {1:1,2:gid,501:20000}）。
  - 3011（CLI 复现编辑器形态 27 槽 0 差异 + 角色侧挂载）：每 10s 施放 → **恰好 1 条事件记录
    （f8=角色实体）**，nt-p/q/r 三组打印 ×4 次全对，回归正常。
- 规则结论：①whenSkillNodeIsCalled = 实体定向事件（只触发挂调用者角色实体的图，挂玩家副本不触发）；
  ②notify 三参必须字面量（assertClientLiteralValue 编译期断言，通道定位=静态通知，动态值走信号通道）；
  ③特殊实体挂载 = root4 f7 + root5 副本 f6 双写（编辑器自动同步副本，CLI 需 --def + 循环 --entity）。
- 踩坑：CLI attach 无参默认 entity 单槽（与编辑器 def 双写形态不同）；hex 误读教训——`a81f a09c01`
  = f501:20000（挂载类型标记），非独立字段。
