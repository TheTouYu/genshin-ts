# 进度记录 — 3×3 魔方客户端计算改造（examples/rubik-3x3-client）

> 本目录 = rubik-3x3 的客户端计算路径改造工作区。原目录 `examples/rubik-3x3` 保持不动。
> 来源完整变更史见 `examples/rubik-3x3/PROGRESS.md`。

## 基本信息

| 项 | 值 |
|---|---|
| 基线来源 | `examples/rubik-3x3`（2026-08-29 完整复制工作树状态） |
| 目标地图 | **1073741914「魔方3x3_1」**（用户 2026-08-29 复制自 1073741899，文件同大小 793972B） |
| 图 ID | 与 1073741899 一致：game 1073741830 / relay 1073741831 / visual 1073741832 / solver 1073741833 / solverPlan 1073741834 / turn 1073741835 / solverEPlan 1073741836 / testPanel 1073741837 / solverLPlan 1073741838（另有「切换镜头」1073741839，非本任务） |
| 编译配置 | `gsts.config.ts`（inject.mapId 已改 1073741914）、`gsts.relay.config.ts` |
| 参考地图 | 1073741913「魔方-客户端优化版本」（SHA-256 f90ac5438c…；客户端图 1082130436 type=20010，191 节点；信号「旋转信号」6 参数） |

## 任务目标（双层）

1. **玩法层**：把旋转计算从纯服务器图迁移为客户端图计算（参照参考地图架构但独立取舍——
   例如参考图"服务器每块还要重算一遍位置"是否值得照搬，由探索判断）。
2. **编译器层**：gstsClient* 客户端 DSL 从"知识 + 未核验代码"推进到"真实游戏验证可用"；
   过程中暴露的编译器局限/bug 必须记录 → 最小复现 → 沟通 → 修复，不许绕过。

## 铁律与核验标准（每轮）

- 小步迭代：改造 → 模型侧全自核验 → 提交 → 复盘 → 用户游戏验证 → 日志闭环；每轮一个可归因变更。
- 模型侧（提交前必须全过）：
  1. 编译通过 + 相关测试通过（`npm run quicktest` 保持 `--noinject` 约定）；
  2. 注入候选地图成功 + **回读真实 .gil 核对执行流/数据流与源码意图一致**（仓库红线，编译通过不算数）；
  3. 日志侧自核验：若用户已提供上一轮日志，用日志工具核对上一轮变更实际行为。
- 用户侧（每轮游戏验证）：试玩目标地图，退出游戏后提供 Beyond_Debug_Log 新日志；
  验收特征 = 客户端图记录出现（f8=2097154）、向服务器发送信号参数正确、服务器动画执行、
  perf/ops 负载对比可量化。
- 负载红线：单图 gameNodeCount ≤2000（生产红线）、单 tick/记录 <3000 帧；客户端图同口径。
- 质量铁律：一张图一个职责、单图不写冗长逻辑、复用复合节点与通用模式而不是复制粘贴。

## 轮次计划

| 轮 | 内容 | 状态 |
|---|---|---|
| 0 | 复制资源 + 基线可运行 + PROGRESS 建立 | ✅ 完成（本文件） |
| 1 | 最小客户端图注入实验：极简 20010 图打通 gstsClient DSL → 注入 → 读图回读 → 游戏日志闭环；修复 K-01 | 🟡 进行中（模型侧完成，待编辑器建图+用户确认注入） |
| 2+ | 旋转计算逐块迁移到客户端图（指令解析/向量计算/信号发送，分多个小轮） | ⬜ |
| 3+ | 服务器侧瘦身（只留动画执行）与信号参数对接 | ⬜ |
| 4+ | 负载对比与优化迭代 | ⬜ |
| 5+ | 暴露的编译器局限逐项修复 | ⬜ |

## Round 1 记录（2026-08-29，进行中）

### 1.1 K-01 修复（已提交，客户端 DSL 测试链 11/11 全绿）

- `assert-client-ts-transform.ts` 增加合成最小 SignalRegistry（4 个 fixture 信号：
  client_transform_values / gsts_feature_log / feature_probe / classic_creation_character，
  身份 ID 900001..900015 占位），传入全部 8 处 irToGia 调用点；退出码 0。
- 完整测试链：assert-client-ts-transform + 9 个 smoke + check-client-definitions-consistency = 11/11 PASS。

### 1.2 探针信号注册（CLI，游戏文件已写回）

- `gsts assets:signals register --gil 1073741914.gil --name rubik3x3_client_probe --param check:str --param val:str --write`
  → sendId=1610612762 / monitorId=1610612763 / serverId=1610612764；
  备份 `.gsts/backups/1073741914.gil.2026-08-29T02-51-42-632Z.bak`；自动提取 `src/resources/signals.ts` count=8。

### 1.3 最小客户端图 + 服务器监听（源码 + 编译 + GIA 核验）

- 新文件 `src/clientProbe.ts`：`g.characterControlSkill({ id: 1082130433 占位, name: '_GSTS_clientProbe' })`
  → on start：设置局部变量 probeCount=42 → 读回 → str 转换 → 向服务器发送信号
  rubik3x3_client_probe('client-probe', str(count))。
- `src/signals.ts` 增加 rubik3x3_client_probe 定义；`src/game.ts` 增加 onSignal 监听（printString×2，
  服务器日志 f22 可 grep 'client-probe'）。
- 踩坑并修正：客户端图的 str/int/bool 是**全局转换函数**（TS 转换改写为 dataTypeConversion），
  从 'genshin-ts/runtime/value' 导入会得到类构造器，运行时报 `Class constructor str cannot be invoked without 'new'`。
- 编译：10 GIA exit 0（clientProbe.gia id=1082130433）。
- GIA 解码核验：客户端图 = 节点图开始(200042) → 设置局部变量(200081) →[exec]→ 发送信号节点
  (genericId=1610612764=server 身份)，数据链 获取局部变量(200082/1036) → str 转换(200022) → 信号参数1，
  信号名 pin='rubik3x3_client_probe'，check 字面量 'client-probe'；信号三元组 def（发送/监听/向服务器发送）
  relatedIds 互指正确。game.gia 相对基线新增 1 监听信号调用(1610612763)+2 print 节点+信号三元组 def。

### 1.4 待办（用户侧 + 注入）

- 编辑器：在 1073741914 创建 20010 角色操控技能图 → 回填真实 id 到 `CLIENT_PROBE_GRAPH_ID`。
- 编辑器：创建技能配置并把客户端图绑定到技能「节点图事件轨道」（参照魔方-客户端优化版本），
  提供技能配置 id / 实例 id 供服务器施放链使用（或按参考架构的 UI 变量触发）。
- 注入（需用户确认）：10 GIA → 1073741914；随后回读真实 .gil 核验（仓库红线）。
- 用户游戏试玩 → Beyond_Debug_Log → 验收：客户端图记录 f8=2097154 + 服务器 f22 'client-probe' 文本。


## Round 0 记录（2026-08-29）

### 0.1 复制与自洽化

- 完整复制 `examples/rubik-3x3` 工作树状态（含未提交的 `src/resources/prefabs.ts` 增项
  `元件组魔方摆放: 1077936230`），排除 `dist/` 与 `.gsts/`（生成物/备份，可重新生成）。
- 复制版内 `examples/rubik-3x3/` 路径引用（生成表头注释、工具用法说明）统一改写为
  `examples/rubik-3x3-client/`（26 个文件）。
- `gsts.config.ts` 的 inject.mapId 1073741899 → 1073741914（目标地图）；图 ID 不变
  （克隆地图回读核实 9 张图 ID 与原图一致）。

### 0.2 基线编译证据（编译层）

- 原目录与复制目录分别 `node ./bin/gsts.mjs -c <cfg> --noinject`（主 + relay 配置）：
  各 9 GIA，exit 0。
- `gia-compare`（结构级：复合定义/节点类型分布/数据连线/执行连线/参数类型）9/9 对全部一致（exit 0）；
  文件级差异仅 `entryFile/location` 绝对路径元数据（预期）。
- 结论：复制版可运行，产物结构与原目录等价。

### 0.3 客户端 DSL 测试链（编译器层基线）

- 通过（10 项）：smoke-minimal-client-gia / smoke-generic-specialization / smoke-dict-reflect-nodes /
  smoke-local-variables / smoke-inline-id-values / smoke-ordered-start-pins / smoke-client-exec-bindings /
  smoke-enum-match / smoke-client-static-metadata / check-client-definitions-consistency。
- **K-01（已知局限，待修复）**：`assert-client-ts-transform.ts` 失败（exit 1）——第二阶段对含信号
  节点的 IR 文档调用 `irToGia(document, { protoPath })` 未传 `signalRegistry`，命中
  `client_graph.ts:1248` 的「signal registry is required when encoding signal nodes」硬错误。
  编译器行为（55437d4 起强制要求信号注册表）是正确生产行为（客户端信号节点必须绑定目标地图真实信号
  三元组），测试脚本未同步。修复方案（拟 Round 1）：脚本为 fixture 信号构造最小 SignalRegistry
  传入 irToGia；该断言本身即最小复现。

### 0.4 环境风险（非本任务引入，记录用）

- R-01：仓库级 `npm run build`/`npm run quicktest` 当前失败——(a) 项目级 tsc include 收编
  `examples/*/dist/*.gs.ts`（原目录 dist 同样贡献 101 个同类错误，预先存在；本目录 dist 已清理、
  不新增噪声）；(b) 工作区存在「变量系统」任务的并发未提交改动，期间短暂语法/类型错误属正常。
  结论：本任务基线以 gsts CLI 编译 + 客户端 DSL 测试链为准；repo 级 build 修复不属于本任务，
  待变量任务收尾后复跑 quicktest。
- R-02：客户端图打印不落服务器日志（f22 无文本）；游戏侧核验走 f8=2097154 记录 +
  官方客户端节点图日志通道（mhrnuz9izfne）。open-items O-2026-08-28-09/10 未闭合同理。

### 0.5 已核实的参考资产（探索起点）

- 参考地图客户端架构（PKC clm_D1A2082… / clm_CAE3053…，unconfirmed，待本任务实测确认）：
  技能实例施放 → 20010 图「节点图开始」顺序执行 → 客户端算完经「向服务器节点图发送信号」回传
  6 参数 → 服务器 26 块各自动画；busy 锁 = 客户端加单位状态 1077936131。
- 客户端日志编码：记录 f8=2097154 恒值、帧 head=图内节点序号、无 f6 负载字段。
- 工具：scripts/gia_log.py（ops/records --summary/frames/perf）、gia_log_flow.py（--client 事件线 +
  --trace-node 数据倒查）、tools/parse-gil-node-graph.ts + CLIENT_NODE_METADATA 重映射。

## 下一步（Round 1 计划）

在 1073741914 上做最小客户端图注入实验：用 gstsClientCharacterControlSkill 写一张极简 20010 图
（读自定义变量「指令」→ 设置局部变量 → 向服务器节点图发送信号），打通 gstsClient DSL → 注入 →
读图回读 → 用户游戏日志核验的完整链路；同轮修复 K-01（assert 脚本补 signalRegistry）。

---

## GIL 编码学习任务 Round 0（客户端图创建 + 技能配置/事件轨道绑定）

> 目标：学习两条编辑器编码规则，闭合后支持 `assets:node-graphs create --type` 建 20010 客户端图 + 设计技能 CLI。
> 证据目录：`/home/h/genshin-ts-evidence/node-graph-logic/2026-08-29-client-graph-skillconfig/`

### 基线（1073741914，锁定）
- MAP = `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741914.gil`
- BEFORE = `…/raw/1073741914.gil`，SHA-256 = `cdcb56d0f27aa5f799b17a6eeecefd91ce17a49a3e8dce0dce761764fb7b4c33`，size 795177
- 图：10 张全部 type=20000（1073741830..1073741839）；信号 8 个；无客户端图、无技能配置。

### 参考地图正样本索引（1073741913 只读，非结论）
- 客户端图 1082130436 type=20010 → root 6 folder 条目 `typeValue=7400`（folderId=67）
- 服务端图 20000 → `typeValue=800`（folderId=4，已知规则）
- 图 1073741852 type=20003 → `typeValue=2300`（folderId=15）
- 技能配置 1228931073 → folder `typeValue=7500`（folderId=68）；资产记录在 root field 15
  （field1 varint=1228931073，len=475），平行引用在 root field 16（len=465）
- 1082130433 实际 type=20001（"完全隐藏"），未在 folder 条目中定位到，按非本任务记录。

### 下一动作（等用户）
- 第 1 个最小差分：编辑器在 1073741914 新建一张 20010「角色操控技能」图并保存（不画任何节点）。
- 差分位置：root 6 folder 条目 + root 10 图记录（双层包装）。
- 第 2 个差分：创建技能配置并把客户端图绑定到「节点图事件轨道」。

### Round 1（客户端图创建差分，规则 1 闭合）

- 用户操作：编辑器新建 20010「角色操控技能」图并保存（不画节点）；AFTER hash `45267e07…`，size 795292。
- 新增图：**id=1082130433**（用户确认）、type=20010、name=`新建角色操控技能节点图`、nodeCount=1。
- 归因（相邻差分，唯一结构增量）：
  - root 6：重写「未分类页签」聚合 record（本图 folderId=67），f3 末尾追加 `f5={1:7400, 2:1082130433}` → **20010 folder typeValue=7400**。
  - root 10：在最后一张既有图 field 1 记录之后插入 `{1: NodeGraph}`（双层包装）；NodeGraph 含 Id{10000,20010,21001,1082130433} + name + 1 个自动「节点图开始」节点（genericId.nodeId=200042，concreteId.nodeId=2001，contextDeclaration f8={kind:6}）+ entrySlotIndex(f100)=1。
  - root 46：等长 113B 保存副作用（不模拟）。
  - root 2：地图名 `魔方3x3`→`魔方3x3_1`（+2B；用户确认=自动保存改名，独立于图创建）。
- 同构重放：/tmp 从 BEFORE 重放 → root 6/10 与 AFTER **逐字节一致**；`list-gil-node-graphs` 回读 11 张图（新增 type=20010/nodeCount=1）；GIL header 长度字段同步自检通过。
- 规则状态：**CONFIRMED**（编辑器真实增量 + 同构重放 + 回读）；知识已落盘 `docs/game-engine-knowledge/node-graphs.md` 与 `gil-structure-semantics.md`。
- 待闭合（open-items）：客户端图 ID 分配/复用规则；CLI `create --type 20010` 是否需自动带「节点图开始」节点。
- 下一轮：创建技能配置并把客户端图绑定到「节点图事件轨道」（规则 2）。

### Round 1b（第二样本：20002 技能图，顺带闭合 folder typeValue 2200）

- 用户操作：新增「角色技能节点图」空图并保存；AFTER hash `b45462e0…`，size 795399。
- 新增图：**id=1082130434**（用户确认）、type=**20002**（Skills，非 20010）、name=`新建角色技能节点图`、nodeCount=1。
- 归因（v1→v2 相邻差分，唯一结构增量）：
  - root 6：重写「未分类页签」record（**folderId=14**，与 20010 的 folderId=67 不同），f3 末尾追加 `f5={1:2200, 2:1082130434}` → **20002 folder typeValue=2200**。
  - root 10：在最后一张既有图 field 1 记录之后插入 `{1: NodeGraph}`；结构与 20010 完全同构，仅 Id.type=20002 / name 不同，同样含自动「节点图开始」节点 + entrySlotIndex=1。
  - root 46：等长保存副作用；root 2 本次不变。
- 同构重放：/tmp 从 v1 重放 → root 6/10 与 v2 **逐字节一致**；`list-gil-node-graphs` 回读 12 张图。
- 增量结论：图记录结构对 20002/20010 通用；客户端图 ID 连续 +1（1082130433→1082130434）；folder typeValue 映射新增 20002→2200。
- 规则状态：**CONFIRMED**（第二样本强化规则 1 + 闭合 20002）；知识已更新并提交。
- 待办：技能配置（规则 2）仍未创建——「技能配置」是资产不是节点图（参考 1228931073），下一步请用户在编辑器找「技能配置」创建入口。

### Round 2a（技能配置资产创建，规则 2 前半闭合）

- 用户操作：新增「技能配置」（用户确认：技能类型=普通技能，技能 ID=1228931073）并保存；AFTER hash `33e0084f…`，size 796430。
- 归因（v2→v3 相邻差分，唯一结构增量）：
  - root 6：重写「未分类页签」record（**folderId=68**），f3 末尾追加 `f5={1:7500, 2:1228931073}` → **技能配置 folder typeValue=7500**。
  - root 15：追加技能配置资产记录（512B）：`{1:1228931073, 2:36(技能配置类别，固定), 4[*]×4}`；4[0]=名称「操控技能」，4[1]=技能体(21/30)，4[2]=节点图事件轨道(35/45)，4[3]=尾节。
  - root 16：追加平行引用记录（502B）：`{1:1228931073, 2:1228931073, 3[*] 同构 root15.4[*]}`（双写，名称在 root16 为空）。
  - root 46：等长保存副作用；root 2 不变。
- 同构重放：/tmp 从 v2 重放 → root 6/15/16 与 v3 **逐字节一致**；size 与 v3 相等（796430）。
- 规则状态：**CONFIRMED（2a）**；客户端图引用字段未出现（默认未绑定图），是 2b 缺口。
- 2b 待办：把客户端图 1082130433 绑定到技能 1228931073 的「节点图事件轨道」并保存，差分归因客户端图引用字段。

### Round 2b（技能类型瞬发 + 绑定客户端图，规则 2 闭合）

- 用户操作：技能类型改为「瞬发技能」+ 在技能动画里挂载角色操控节点图 1082130433；AFTER hash `6dd93842…`，size 796360。
- 归因（v3→v4 相邻差分，root 15/16 记录整体重写，folder/图清单不变）：
  - **技能类型普通→瞬发** = `4[1].30.1.1` 去掉 `f4:2`（普通=`{4:2,7:20001}`，瞬发=`{7:20001}`）；顶层 `f2=36` 不变（是技能配置类别，非普通/瞬发）。
  - **客户端图引用字段** = `4[1].30.1.5 = {f1:1082130433, f2:1073741825}`（绑定后新增；与参考地图 bound 样本 `{f1:1082130436, f2:1073741825}` 同构）。
  - **事件轨道** `4[2].45`：默认 72B → 25B（移除默认「节点图事件轨道」条目 + f16，`f45.f2` 61→62），与参考 bound 样本一致。
- 同构重放：/tmp 从 v3 逐字节重放（去 f4:2 + 插 f5 + 换事件轨道）→ root15/root16 与 v4 **逐字节一致**。
- 规则状态：**规则 2 部分闭合**（技能配置创建 + 单图节点图引用已 CONFIRMED；多图绑定/类型取值/打点语义 OPEN）；已更新知识。
- 未闭合（open-items，用户 2026-08-29 明确）：**多图绑定编码**（一个技能支持绑定多个节点图，当前仅单图样本）；`f5.f2=1073741825` 语义；事件轨道 `f45.f2` 计数与打点结构语义；`4[1].30.1.1.4` 普通/瞬发是否还有更多取值。
- CLI 预留（用户要求）：技能类型参数（默认瞬发）、多图绑定逻辑。
- 下一步：继续差分——①多图绑定编码；②技能类型取值表。

### Round 1c（补齐客户端图类型 folder typeValue，规则 1 扩展）

- 用户操作：新增 4 张不同客户端图类型空图（带名字）；AFTER hash `9822b7b1…`，size 796920。
- 新图：1082130435=20008 造物技能、1082130436=20006 整数过滤器、1082130437=20001 布尔过滤器、1082130438=20009 造物状态（均 nodeCount=1）。
- folder typeValue 归因（v4→v5 相邻差分）：20001→**2100**、20006→**6300**、20008→**6700**、20009→**6800**；连同已闭合的 20000→800、20002→2200、20003→2300、20010→7400，已补入 `src/injector/folder.ts` 的 `DEFAULT_GRAPH_TYPE_VALUES`。
- 图类别结构差异：技能类（20002/20008/20010）自动节点=节点图开始(200042/2001)+f100=1；造物状态(20009)=200126/4000+f100=1；过滤器类(20001/20006)=过滤节点(200000/200122)+evaluationInterval f101=0.3。
- 未采样：20007 造物状态决策（CreationStatusDecision）folder typeValue 待补；20004/20005 代码有值未实测。
- 下一步：仍待①多图绑定编码；②20007 folder typeValue。

### Round 1d（补 20007 + 第二张 20010 预备）

- 用户操作：补上造物状态决策空图 + 额外新增第二张 20010（为多图绑定差分做前置准备）；AFTER hash `0355b486…`，size 797153。
- 新图：1082130439=20007 造物状态决策、1082130440=20010 角色操控技能（第二张）。
- folder typeValue：**20007→6600**（folderId=58）；第二张 20010 仍=**7400**（folderId=67，与首张一致）。
- 已补 `src/injector/folder.ts`：20007→6600。至此 20001..20010 的 folder typeValue 全部有真实样本（20004/20005 沿用代码值 2400/4300，未实测）。
- 下一步：多图绑定差分（技能 1228931073 绑定第二张 20010 = 1082130440）。

### Round 2c（多图绑定，规则 2 关键缺口闭合）

- 用户操作：给技能 1228931073 额外挂载第二张 20010（1082130440）；AFTER hash `a5f413fd…`，size 797181。
- 归因（v6→v7 相邻差分，root 15/16 记录重写，各 +14B）：
  - **`f5` 是 repeated 字段**：每绑一张图 = 一条 `f5={f1:图ID, f2:轨道点ID}`。
  - 首绑 `{1082130433, 1073741825}`，次绑 `{1082130440, 1073741832}`；事件轨道 `4[2].45` 本次不变（首绑时已简化）。
- 同构重放：/tmp 从 v6 插第二条 f5 → root15/root16 与 v7 **逐字节一致**。
- 规则状态：**多图绑定结构 CONFIRMED**；`f5.f2` 轨道点 ID 分配规则仍 INSUFFICIENT（首绑 1073741825 / 次绑 1073741832）。
- 下一步：CLI 设计（技能配置命令支持 `--graph-id` 多值 repeated f5 + `--skill-type` 默认瞬发）；PKC 知识树落盘。

### Round 2d（第三个绑定，f5.f2 顺序规则闭合）

- 用户操作：再挂第三个节点图；AFTER hash `a1b537ef…`，size 797209。
- 三绑 f5 读回：顺序1=`{1082130433,1073741825}`、顺序2=`{1082130440,1073741832}`、顺序3=`{1082130433,1073741839}`。
- **`f5.f2` = 放置顺序 = 1073741825 + 7×(顺序-1)**（步长 7，用户确认瞬发技能按顺序即可；非瞬发按动画时长打点另说）。
- 观察：`f5[*]` 允许同一图 ID 重复挂多个顺序位（1082130433 出现两次）。
- 规则状态：**规则 2 结构 + 瞬发顺序规则 CONFIRMED**；非瞬发打点时间编码 INSUFFICIENT。

### Round 2e（角色自定义技能配置，技能类型映射）

- 用户操作：创建「角色自定义技能」技能配置；AFTER hash `e2c5c005…`，size 798303。
- 新技能配置：**ID=1098907649**、`f2=6`（自定义技能）、folder typeValue=**2800**（folderId=12，区别于普通技能的 7500）。
- 类型字段：`4[1].30.1.1={4:2,7:20001}`（与普通技能同，4:2=有延时）；默认事件轨道 2 条：节点图事件轨道(f6=805306369) + 状态轨道(f6=805306376)。
- 映射：普通/瞬发技能 f2=36→7500；自定义技能 f2=6→2800；ID 段 0x49400001 vs 0x41800001。
- 下一步：给自定义技能绑定节点图 → 学非瞬发「按动画时长/时刻」打点编码。

### Round 2f（非瞬发普通释放绑定，事件轨道打点结构闭合）

- 用户操作：给自定义技能 1098907649 挂载角色技能图（1082130434），触发位置 0.0s；AFTER hash `283a84a3…`，size 798495。
- 归因（v9→v10）：**非瞬发绑定不走 body f5，走事件轨道 `4[2].45.1`**：
  - `f3[*]` = 3 个动画打点（动画资源 ID 1001/1004/1007，拍点ID=268435457+7×(n-1)）；
  - `f4[*]` = 节点图绑定 `{1:图ID, 3:触发点ID(1073741825=0.0s), 4:拍点ID(268435457)}`。
- 同构重放：从 v9 事件轨道插 3×f3 + 1×f4 → root15/root16 与 v10 **逐字节一致**。
- 约束（用户确认）：自定义技能(f2=6) 只能挂角色技能图(20002)；普通技能(f2=36) 挂角色操控技能图(20010)。
- 动画资源=官方预制（时长 2.01/0.53/3.16s，整轨 5s），仅了解不入 CLI。
- 规则状态：**规则 2 非瞬发绑定结构 CONFIRMED**；`f4.f4`/`f3.f6` 拍点 ID 与 `f4.f3` 触发点 ID 的关系已定位。

### Round 2g（自定义造物技能，第三模板 + root 20 发现）

- 用户操作：新增「自定义造物」技能，类型瞬发；AFTER hash `235df6f7…`，size 800683。
- 新技能配置：**ID=1191182337**、`f2=28`（自定义造物模板）、folder typeValue=**6900**（folderId=61）、瞬发释放。
- body 紧凑：`4[1]` 仅 26B（`{1:73,78:{…20001/10007001…}}`）；事件轨道已简化（f45.f2=52）。
- **新发现 root 20（1970B）= 造物模型容器**：创建自定义造物时联动生成骨骼（GI_MonsterRoot/RootNode/Chest/Hand/Foot/NamePlate/HeadMark 等）+ 受击/被击倒特效引用。
- 模板映射补全：f2=28→6900；ID 段 0x47000001。root 20 造物模型装配 = 编辑器联动（CLI 是否复刻列为 open-item）。
