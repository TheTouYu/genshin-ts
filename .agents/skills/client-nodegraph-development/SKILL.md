---
name: client-nodegraph-development
description: 服务端调用客户端节点图的完整开发链路：客户端计算路线选型与最小通路（角色技能 20002 按需单次 / 造物 20008 常驻 15Hz 循环 / 五D seqlock 可靠通道三路线）→ 技能配置（6+瞬发绑 20002 图）→ addCharacterSkill 装配 → createCustomSkillInstance → castSpecifiedSkillInstance 施放 → 客户端图「节点图开始」执行 → 信号/变量回传服务器，以及客户端图 DSL 编译注入差异、通信手段矩阵、"链路帧级全对但客户端图不触发"排查决策树（禁锢状态/技能类型/绑定形态/装配四嫌疑）。当任务涉及：客户端节点、客户端图、客户端计算、把计算搬到客户端/客户端算力分载/最小通路、gstsClient*/g.characterSkill、20002/20008/20010 等客户端图类型、服务端调用客户端、技能实例创建与施放、客户端图不执行/不触发、客户端信号回传、客户端读变量——必须使用本技能，哪怕用户没明说"客户端"。
---

# 客户端节点图开发（client-nodegraph-development）

把计算/逻辑放到客户端节点图执行（降服务端负载、做客户端表现）的完整方法论。核心是一条
**已验证的服务端→客户端调用链**与一套**排查决策树**——这条链 2026-08-31 在魔方 A 线上
踩了六轮坑才闭合，全部坑已固化为本文检查点。

## 证据基线（2026-08-31）

- 足球 1908 造物+seqlock 通路 E1 收口（2026-09-02 日志 3089：fb-phys 15.4/s、
  37/37 信号零丢失；E2 局部变量不跨施放保持定论）。
- 跑通地图：**1073741915「变量」**（日志 3040/3044，6+瞬发+20002 全链）与
  **1073741916「GSTS核验-变量C2S」**（日志 3008，手段 3 闭环）双参照；
  官方参照 1073741913（日志 3030）。
- 标准源码模板：`verify/d2-client/d2-skill.ts`（服务端施放图）+ `d2-client-skill.ts`
  （客户端图）+ `signals.ts`——照抄起步。
- 排查案例库：verify-injection 技能 `references/verified-cases.md`「D2 客户端」节教训①~⑦。

## 〇、路线选型与最小通路（新任务从这里进，2026-09-01 补）

**选型表**——"把计算放到客户端"先问计算形态，三条已验证路线：

| 计算形态 | 路线 | 频率/时序 | 前置成本 | 什么时候不选它 |
|---|---|---|---|---|
| 事件驱动单次（按键/触发时算一次） | **角色技能 20002**（一节链路） | 按需单次，服务端主动 cast | 最低：图+技能配置+信号，全 CLI 可做，零编辑器环节 | 常驻高频循环（每次都要服务端再 cast 一次） |
| 常驻高频循环（物理 tick/持续轮询计算） | **造物 20008**（五C 章） | 15~16/s 自主循环，客户端 AI 触发，服务端零施放节点 | 中：多 20007/20009 两图 + 用户编辑器配置 4 项（README ⑦） | 单次触发（牛刀杀鸡，还要麻烦用户配编辑器） |
| 多变量批量任务下发，要零丢失零撕裂 | 造物 + **五D seqlock 门** | ~5 任务/s 可靠通道 | 高：寄存器组+dispatcher+门控全套 | 单变量、单写者、低频（人手速率）任务——先走最简形态：任务变量+epoch 回声确认即可；出现并发写者或撕裂再上全套（实测：单写者复制延迟 0~1s、并发双写者 6 任务丢 2） |

**最小通路的定义**：一条数据端到端走通 = 服务端写任务 → 客户端读到 → 计算 → 信号回传 →
服务端 onSignal 收到结果。**先打通这条链**，可靠性（五D）与吞吐扩展（复制通道）按需再加。

**三条通用前置（缺一必在编译期或运行期失败，全部实证）**：
1. 回传信号必须**先真实写回目标地图**（`assets:signals register --write`）——干跑 `--output`
   候选不算数：信号类客户端图编译期从**真实地图**解析信号注册表，干跑状态下编译直接报信号
   编码错误（2026-09-01 足球最小通路会话实证，浪费一轮编译）。
2. 客户端图要读的**实体自定义变量**必须资产预注册（见三-8）；**图变量** DSL 声明即生效免注册。
3. 源码里的图 ID/configId/信号名必须**回填真实值**再编译——占位 ID 编译能过但注入到错图位。

**造物路线最小通路**（逐步命令 runbook 见 `references/creation-path/README.md` ①~⑧；
基础模板 `templates/zaowu-basic/` 5 件套+编译配置，可靠性层 `templates/zt-lane/` 六件套）：
只读盘点 → CLI 写资产（信号 / 20008 技能图 / 20009 状态图 / **20007 决策图** / 20000 监听图
挂载 / 28+瞬发技能配置；20007 于 2026-09-02 接入 CLI：自动节点与 20009 同族 200126/4000+f11，
folderId 58/typeValue 6600，1915 差分证据同构验证）→ 复杂造物 4 项编辑器配置 →
回填 ID 编译 → wire 断言 → 批量注入 → 用户测试。
验收 = 服务端 f22 onSignal 打印 + **20008 图族 f8=4194308** 客户端记录 + 小体型模型 15~16/s
（客户端记录需详情日志且**按图开：只开目标 20008 图**，服务端图/同链图/旧高频图都不开——细则
与频率判定表见 creation-path/README ⑧）。

**角色技能路线最小通路**（一节链路 + `verify/d2-client/` 模板）：
20002 图 + 6+瞬发技能配置（body-f5 绑图）+ 信号注册 → 服务端 add→create→cast 链编译注入 →
验收 = 五节四层签名（armed/created/cast-fired 打印 + f8=2097154 + onSignal）。

**断言/排障速查（执行者高频踩坑，2026-09-01 会话实证回灌）**：
- decode-gia 输出 JSON 的节点通常在 `.graph.graph.inner.graph.nodes[]`，节点类型字段在
  `genericId.nodeId`——先照这条路径取，取不到再逐层 `keys()` 探测；**不要上来就徒手逐层挖**
  （完整 decode/wire 断言 playbook 见 gil-node-graph-reading 技能 Step 3.5/3.6）。
- 20008 图局部变量**不跨施放保持**（2026-09-02 足球 1908 实测推翻旧断言：15Hz 反复施放下
  `tick.set(tick.value + 1n)` 单名形态回传**恒 1**——每次施放=新图执行上下文，Get 重新按默认值
  创建、执行结束即丢弃）。跨拍状态需求走实体自定义变量（服务端单写者）或物理降频，勿依赖图内
  局部变量跨拍存活。
- 信号参数布局 `(tag:str, e:int)` 免 donor；重复的非 str 参数类型必须有同构 donor，否则注册
  fail closed。

## 一、调用链模板（已验证形态，直接抄）

完整可抄代码与帧级预期见 `references/cast-chain-template.md`。骨架：

```
【资产准备·一次性】
1. 客户端图：g.characterSkill({id, name}) → type 20002 角色技能图（编译注入同服务端图）
2. 技能配置：assets:skill-config create → 6 模板(自定义技能)+瞬发 → body-f5 绑 20002 图
   · 模板×图类型硬约束：6↔20002、36↔20010、28↔20008（错配 fail closed）
   · 程序化施放选 6+瞬发；36 普通技能需按键/操控状态（未受控 Cast 静默无效）
3. 回传信号：assets:signals register（客户端发送节点必须绑定真实信号三元组）

【服务端施放链·每次调用】（角色实体动态获取四步 + 装配 + 实例 + 施放）
玩家列表[0] → getAllCharacterEntitiesOfSpecifiedPlayer(player)[0] → 角色
→ addCharacterSkill(角色, configId, CustomSkillSlot1, OriginalSlotSkillHandling.Destroy)
→ createCustomSkillInstance(角色, configId) → 实例ID
→ castSpecifiedSkillInstance(角色, 实例ID, false)   // 实例ID 非配置ID！
→ 客户端图「节点图开始」顺序执行（一次 start 全算完，无定时器）
→ sendSignalToServerNodeGraph(信号, 参数...) → 服务器图 onSignal 监听
```

- **cast 施放的是技能实例 ID**（create 的返回值），不是配置 ID——首坑。
- **实体必须是角色实体**（角色列表[0]），不是玩家实体——玩家无角色技能组件。
- 同 tick 装配→创建→施放可行（3044 一条记录内全链完成）；实例 ID 跨 tick 中转用
  玩家实体自定义变量（官方形态）或图变量（DSL 声明即可，无需注册）。
- `addCharacterSkill` 的装配前提：d2-skill.ts 注释"create 前提=角色已装配该配置"——
  但 1915 无装配节点也通（3044），装配状态可能在地图存档持久化；对新角色保守起见保留装配步骤。

## 二、写链前四问（前置检查，全部实证过）

1. **角色实体寻址**：角色实体**不可 GUID 查询**（`entity(字面量)` 编译成 Query Entity by
   GUID，对角色返回空实体，链路静默失败）——必须 玩家列表[0]→角色列表[0] 动态取。
   静态控制器/物件实体才可用 entity(id) 字面量。
2. **变量注册**：编辑器/CLI 未注册的**实体自定义变量**读写=读不到（set 后 get 空）；
   **图变量** DSL `variables:{}` 声明即生效无需注册；跨节点传值优先节点返回值数据流直连。
3. **timer capture**：定时器回调不能 capture 外层实体变量——回调内字面量重建或节点现取。
4. **角色控制状态**：角色带控制类单位状态（**'禁锢'**等，常为编辑器侧施加）时——
   **cast 帧全对但技能静默不释放、客户端图零执行、addCharacterSkill 返回空**。
   排查判据见第五节决策树③。

## 三、客户端图 DSL 与编译注入差异（八条实证）

1. **单文件 entry 编译失败**：`entries:['./src/xxx.ts']` 只编客户端图会报
   `gsts.fCharacterSkill is only available in client_character_skill_* ctxType` ——
   必须用**主配置**（含全部图）`--noinject` 编译出 .gia，再单文件注入。
2. **gsts 类型守卫**：20010 内容注入 20002 图位被拒（`client graph types cannot be
   auto-corrected`）——fail closed 正确行为，改 DSL 入口类型（g.characterControlSkill ↔
   g.characterSkill）匹配目标图。
3. **客户端图 ID 段**：起始 1082130433（用户地图实测），`assets:node-graphs create --type
   20002|20010|...` 自动分配；folder typeValue：20001→2100、20002→2200、20006→6300、
   20007→6600、20008→6700、20009→6800、20010→7400。
4. **不经 mounts attach**：客户端图的执行通道=技能配置绑定（body-f5/事件轨道），不是实体挂载；
   注入后哨兵=图名变 `_GSTS_<gia基名>` + nodeCount 变化。
5. **信号类客户端图编译期需 inject 指向目标 gil**（读信号注册表），主配置 inject 已含 mapId 即可。
6. **str/int/bool 是全局转换函数**：从 'genshin-ts/runtime/value' 导入得到类构造器，运行时报
   `Class constructor str cannot be invoked without 'new'` —— 用客户端图 DSL 上下文的全局版。
7. **entity helper 无参陷阱**：`f.getPlayerEntityToWhichTheCharacterBelongs()` 无参 self 版
   只在 interface 声明、类实现只有带参版——TS 不报错但运行时 undefined → `Invalid value type:
   entity`。客户端图拿玩家实体用 `f.getCurrentCharacter()` + 带参版。
8. **客户端图读自定义变量必须资产预注册**：动态创建变量客户端读无 OUT 帧（判据：客户端帧
   head=04 只有 IN0/IN1 无 OUT 行 = 变量不可见；3007/3008 受控差分实证）。

## 四、客户端↔服务端通信手段矩阵

| 方向 | 手段 | 状态 | 备注 |
|---|---|---|---|
| S→C 触发 | 技能施放（本技能主线） | ✅ 6+瞬发+20002 闭环 | 36+20010 需操控状态 |
| S→C 数据 | 自定义变量共享（手段 3） | ✅ 3008 闭环 | 客户端读须预注册（三-8）；N 变量批量+同步保障走五D seqlock 门 |
| C→S 数据 | 信号 sendSignalToServerNodeGraph（手段 4） | ✅ str/int 已验；float/vec3 未验 | 20002 图内运行时合法（1915 实证） |
| C→S 事件 | notifyServerNodeGraph（手段 4b） | ✅ 3011 闭环 | 三字面量参数 |
| — | 操控状态（手段 2） | ❌ 未闭环 | 勿走 |
| C busy 锁 | addUnitStatus（客户端加状态） | 官方用法 | 我方待验 |

## 五、日志验证与排查决策树

**成功签名**（四层全齐才算通）：
1. 服务端 print（armed/created/cast-fired 等链路打点）
2. cast 帧：`IN0:Entity=角色 IN1:Integer=实例ID IN2:Boolean=`（false）
3. **f8=2097154 客户端图记录紧随 cast 记录之后**（一条技能释放=一条大记录；客户端帧
   head=图内节点序号、无 f6 负载字段、客户端打印不落服务器 f22）
4. 服务器 onSignal 触发（监听图 print / 变量写入）

**决策树**（按日志缺失层定位）：
- ① 无 armed print → 服务端链没跑：查图挂载（server 图须 attach 实体）/图内容。
- ② armed 有、create 帧无 OUT 或 OUT 空 → 实体链断：查角色寻址（二-1）。
- ③ **cast 帧全对但无 f8=2097154 记录**（六轮排查主战场，按命中概率排序）：
  1. **角色控制类单位状态（禁锢等）**——第一嫌疑！addCharacterSkill 同链返回空 =
     状态拦截铁证；状态可能是编辑器侧施加（节点图里搜不到），问用户/查编辑器角色配置。
  2. 技能模板：36 普通技能需操控状态（未受控 Cast 静默无效）→ 换 6+瞬发。
  3. 绑定形态：body-f5（瞬发）/事件轨道 f4（普通）与技能类型匹配；同一图被多技能
     重复绑定时先去重再测。
  4. 客户端图类型与模板匹配（三-2）。
- ④ f8 记录有、服务器 onSignal 无 → 信号 def/参数类型：scan-gil-signals 核注册表；
  客户端帧里信号节点是否执行、参数类型是否已验（float/vec3 未验）。
- ⑤ 跨地图对照法：拿 1915/1916 做阳性对照，把可疑变量逐个对齐（本轮方法论核心——
  六轮里配置字节级 diff、结构化 .gia diff 都是靠它收敛的）。

**客户端图日志读法**：`gia_log.py records --summary` 看 f8=2097154 条目；帧名映射用
client_node_metadata.ts（服务端名字表撞号不可信）；客户端多分支 OutFlow[0]=default/
[i]=case[i-1]；遍历实体列表 out_flow[0]=完成/[1]=每次（与有限循环相反）。


## 五C、造物技能路径（第二条通信路径，2026-08-31 首验通过，1915）

> **资源包**：逐步 runbook（盘点→资产→编译→断言→注入→编辑器配置→日志定论）+ 占位符表见
> `references/creation-path/README.md`；**基础模板 `templates/zaowu-basic/`**（5 源码+编译配置，
> 与仓库 `verify/zaowu-client/` 同源）与**可靠性层 `templates/zt-lane/`**（六件套，五D 用）都在
> 同目录 templates/ 下——高频使用直接照抄起步，别手写从零。

与角色技能路径（服务端 cast）本质不同：**服务端零施放节点，触发权完全在客户端 AI**。

```
【资产准备】
1. 技能配置：assets:skill-config create --template 28(自定义造物) --skill-type instant
   --graph-id <20008图>（CLI 已支持，root20 联动自动处理；模型固定遗迹守卫 10005001）
2. 20008 图：g.creationSkill({id, name}).on('start', f => f.sendSignalToServerNodeGraph(...))
3. 20009 状态图：g.creationStatus({id}).on('start1', f => f.executeSkill(true, 1n))
   ——start1..start10=按顺序唯一执行行为；前一行为失败(如CD中)才走下一个
4. 20007 决策图：g.creationStatusDecision({id}).on('start1', f =>
   f.switchToSelfExecutionStatus(true, configId(<20009图ID>n), <模板序号>n))
【用户编辑器配置（一次性）】
5. 元件库→复杂造物→遗迹守卫→放置；造物技能管理→引用技能（记序号，对应 executeSkill 参数）
   +设 CD；自主逻辑参数→新增模板_1 初始生效（对应 switch 第三参）；特化配置绑定决策图
【运行时链（全自动）】
6. 造物 AI 持续执行决策图→切状态→状态图 executeSkill→技能施放→20008 图跑→信号回服务器
```

- 已验证形态（2026-08-31，1915）：编译产物与编辑器原生节点**逐结构一致**
  （switch=200128/4011，入口 200126/4000+f11 块）——详见 verify/zaowu-client/ 源码与
  ~/genshin-ts-evidence/zaowu-creation-skill/notes/manifest.md。
- **频率上限=三重冷却**：技能 CD 区间清零后仍被「公共冷却时间」（实体槽 81 外层 f2，
  默认 1.0s）钉在 ~1 次/秒；提频须同时调小公共冷却。
- 20007 决策图：CLI 已支持（2026-09-02 接入，commit 1da3fae：自动节点与 20009 同族
  200126/4000+f11，folderId 58/6600，1915 真实图逐字节同构验证）；编辑器手建的默认名图
  仍会被注入器安全门拒 → patch graph-clear 后注入；造物实体特化配置组件槽：
  80=决策图绑定/81=技能管理/82=自主逻辑模板（f501=图类型标记在槽 80）。

- **带宽表（2026-08-31 定论，用户三实验交叉验证）**：触发频率上限 = 造物模型施法占用——
  小体型模型（打手丘丘人等）≈4 帧/次 = **15~16 次/秒**；遗迹守卫 ≈8 帧/次 = 7.5 次/秒。
  CD 配置：冷却组 0.01s + 忽略公共冷却，之后 CD 不再是瓶颈。模型选择 = 带宽选择。
- **施放带宽 = 游戏帧率 ÷ 模型每次施放占用帧数**（1908 实测 2026-09-02：详情日志洪泛拖帧
  ~20fps → 4~5/s；正常 60fps → 15~16/s——详情日志不仅可能被踢，还会直接拖低客户端算力带宽；
  生产态不开日志只会更好）。
- **拆分算力架构模式**：服务端写变量（计算任务）→ 决策图 → 状态图 executeSkill →
  20008 图高频计算（15Hz）→ 信号回传。每个计算逻辑一张 20008 图（一个 28+瞬发配置），
  多计算单元 = 多技能/多造物并行。与角色技能路径（服务端按需单次）互补：造物路径是常驻高频循环。
- 编译的 20007 图可与第三方造物资产互换（实测嵌入大佬资产跑满 15~16/s）。

## 五D、计算通道同步机制（服务端→客户端大带宽数据，2026-08-31 两轮游戏验证，1915）

> **问题**：服务端写 N 个任务变量后立即触发客户端计算，客户端执行时变量可能尚未复制过来
> （读到旧值）或只复制了一半（读到撕裂混合）。实测：单写者下延迟 0~1s；并发双写者 6 任务丢 2。
> **资源包**：全套可抄源码（门控图/dispatcher/邮箱生产者/信号/配置）见
> references/creation-path/templates/zt-lane/；复盘与全部数字见
> docs/game-engine-knowledge/retrospective-2026-08-31-compute-lane-sync.md。

**机制骨架（seqlock 门 + 单写者仲裁，全部实测）**：

```
生产者×N（只写邮箱 ztq_*，挂 dispatcher 图实体=同实体挂载）
   → 唯一 dispatcher（1s 轮询 + 收到回声立即补位 + 4s 看门狗重提交 sum+epoch）
   → 寄存器：zt1..ztN + zt_sum + zt_epoch + zt_ack（挂玩家实体，不挂造物——换造物不丢）
   → 客户端 20008 图 15Hz 轮询门：epoch≠ack → 读全量 → 求和比对 zt_sum
     → 二读 epoch（防读取中被覆盖）→ 全过才算 → sendSignal(tag='ok', epoch)
   → 服务端 onSignal：ack 只前进不回退；epoch 匹配才链下一步（重复回声幂等吸收）
```

**实测数字（日志 3064/3067）**：单通道 ~5 任务/秒、同秒往返、11/11 零丢失零撕裂；
求和校验在「载荷随 epoch 严格单调」前提下是**确定性**撕裂检测；吞吐不够=复制通道（每通道
一套寄存器+技能+造物），不是加宽单通道。

**DSL 写法要点（全部踩过的坑）**：
- 20008 图取玩家实体：`getCorrespondingValueFromList(0n, f.getListOfPlayerEntitiesOnTheField())`
  ——**客户端参数序是 (iD,list)，服务端相反是 (list,iD)**；20008 **没有** getCurrentCharacter。
- 写图前用独立 tsconfig + 真实 DSL 类型做静态门（本节资源包配套 .local/tsconfig.zt.json 模式），
  参数序/方法可用性错误在编译前就能抓出。
- 空分支闭包 ` () => {} ` 编译合法（空转门/名单制分发都靠它）。
- 变量挂**玩家实体**（getList.../setCustomVariable(owner,...)），客户端读须**资产预注册**（三-8）。

**工程纪律**：
- **定时器名单制分发**：同实体多图共享定时器事件广播——whenTimerIsTriggered 分支必须逐一
  匹配本图定时器名，else 一律空分支（宽松 else 会吃进他图事件多发发布，3062 实证）。
- **节点预算先算成本账**：setCustomVariable ≈3~4 节点/次；百变量寄存器×多调用点必超 2000 红线。
  优先数学等价压缩：服务端哈希用闭式解（Σvᵢ=pe·K+常量，1 个表达式替代 100 节点链）；
  单写者不变量下看门狗只需重提交 (sum+epoch) 对，不重写载荷。
- **诊断读活图**：槽 81/挂载等状态断言必须读活地图并带 SHA——分析脚本硬编码证据快照路径
  曾导致完全反向的误诊（3062）。

**日志判读速查**：ok/ack 链=正常；每任务双 ack=回声 dup（幂等，无害）；tearH/tearE=撕裂被门
拒绝（查是否有第二个写者）；repub=看门狗重提交（对在途回声冗余亦无害）；stale=过期回声被守卫
拦下；enq 无 dsp=dispatcher 未取货（查邮箱变量挂载实体与轮询图）。

## 六、参照资产与文档

| 资产 | 用途 |
|---|---|
| 地图 1073741915「变量」 | 6+瞬发+20002 全链阳性参照（graphs 1828/1829/1082130435） |
| 地图 1073741916「GSTS核验-变量C2S」 | 手段 3 变量共享闭环参照 |
| 地图 1073741913「魔方-客户端优化版本」 | 官方 191 节点客户端图 + 官方 cast 链（日志 3030） |
| `verify/d2-client/` | 角色技能路径标准模板（d2-skill/d2-client-skill/signals） |
| `verify/zaowu-client/` | 造物技能路径标准模板（20007/20008/20009 三图+监听图+signals，1915 首验通过） |
| `verify/zt-lane/` | 计算通道同步机制标准模板（门控图/dispatcher/邮箱生产者，3064/3067 两轮验证） |
| `retrospective-2026-08-31-compute-lane-sync.md` | 五D 机制的完整错误谱系与实测数字（game-engine-knowledge/） |
| `verify-injection/references/verified-cases.md` D2 节 | 教训①~⑦ 案例库 |
| `docs/game-engine-knowledge/graph-mounting.md` | 特殊实体（玩家/角色 def 1090519041）挂载 |
| `docs/game-engine-knowledge/debug-log-format.md` | 客户端日志编码速查 |

配套技能：服务端图 DSL → dsl-nodegraph-development；编译产物核验/读图 →
gil-node-graph-reading（Step 2.8 客户端图读法）；注入纪律 → verify-injection（2pre 系列）；
技能配置资产创建 → genshin-ts-asset-operations。

## 成长机制

新发现（新图类型 folder 值、新信号参数类型验证、新状态拦截案例）按 debug-log-investigator
技能的成长机制同步到本表与 references；每轮游戏验收后更新 verified-cases 案例库。
