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
