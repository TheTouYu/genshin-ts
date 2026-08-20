---
name: game-from-scratch
description: 从零开始做一个完整的千星沙箱（原神 Genshin-TS）游戏 demo 的端到端工作流：规划玩法与输入机制、创建地图骨架、元件建模、资产候选与安全写回、视觉核验循环、输入配置、节点图逻辑、编译注入、游戏日志验证与知识沉淀。当用户说"从零/新做/开始一个游戏或玩法 demo"、"把某个玩法做成一个完整示例"、"指导怎么做完整游戏"、或要参照 rubik-2x2 示例复制整条管线时必须使用本技能，即使用户没有明说"技能"。它把专门技能（static-gil-model-builder、genshin-ts-asset-operations、gil-node-graph-editing、verify-injection、debug-log-investigator 等）串成固定阶段，每个阶段有验收标准，防止"建模成功就以为游戏完成"。
---

# 从零开始做一个完整游戏（端到端管线）

把"一个玩法想法"变成"游戏内可玩、可验证、有文档"的完整 demo。以 `examples/rubik-2x2/`（2×2 魔方）为已走通的参考案例。

## 阶段总览

```text
0 规划（玩法→输入→节点图能力映射，写 CONTEXT/ADR，设计意图留档）
→ 1 地图骨架（maps:create + 占位节点图）
→ 2 元件建模（static-gil-model-builder 流程）
→ 3 资产写回 + 视觉核验循环（候选→安全门→写回→用户看）
→ 4 输入机制（选项卡/事件组件，编辑器配置）
→ 5 节点图逻辑（读图/改图技能 + 玩法逻辑架构模式 + 治理/调试）
→ 6 编译注入（verify-injection，注入后先回读核验）
→ 7 游戏日志验证（debug-log-investigator，与游戏核验同闭环）
→ 8 知识沉淀与收尾（PROGRESS、Authority、PKC、提交）
→ 9 子代理分包（大任务可选：独立工作包 + 复盘两类优化）
```

阶段 2/3 会循环多次（用户视觉反馈），每轮独立证据目录。阶段 4-7 相互依赖（输入事件→节点图→注入→日志），常需一起迭代。阶段 3 的变量、节点图挂载、屏幕 UI、信号等资源操作统一走 `genshin-ts-asset-operations`；静态视觉模型仍走 `static-gil-model-builder`。

## 0. 规划与域建模

- 先回答三个问题：玩法是什么 / 输入用什么机制（选项卡、按钮、碰撞…）/ 节点图有哪些现成能力（查 miliastra-knowledge + docs-search，官方无"设置 Transform"节点、有"恒定旋转运动器"等，直接改运行时 Transform 不被官方支持）。
- 输出：仓库根 `CONTEXT.md` 术语定义 + `docs/adr/` 关键决策（如"方块为独立实体""旋转语义用标准 ±90°"）。
- **设计意图必须留档**：模型自由发挥的设计（如控制器造型）也要写进 ADR/案例文档，防止后续"设计丢了"靠翻历史找回（rubik 控制器 v8 造型丢过一次，用户要求查历史恢复）。
- 案例：rubik-2x2 输入=实体选项卡（选中事件直达实体挂载的节点图）、旋转=服务端"恒定旋转"运动器。

## 1. 地图骨架

```bash
node ./bin/gsts.mjs maps:create --name "<游戏名>" --player 110170759 --region china
```

- 记录新地图 ID、初始 SHA-256、名称；**必须确认 `temp=` 输出（Temp 双写 + gip 注册，编辑器可见）**。
  当前 CLI 的 maps:create **不会自动 resync**（旧命令的 `--player/--region` 已移除）——若创建输出无 `temp=`，
  编辑器列表看不到该图，需补：`node ./bin/gsts.mjs maps:resync --map-id <新图id>`（2026-08-19 实证）。
- ⚠️ **maps:create 只建空地图骨架，本身没有可注入的节点图**——必须额外创建占位节点图
  （2026-08-19 capture-set 复现实证：直接注入报 `target NodeGraph not found`）：
  `node ./bin/gsts.mjs assets:node-graphs create --gil <地图.gil> --name "<图名>" --write`
  （图 id 自动分配 1073741825 起；--write 前自动备份；`--graphs` 只命名不落可注入图记录）
- 验收：新地图 inspect 显示 0 definition/instance/entity，且骨架预置 root 4/8/27 段（旧骨架会报 `unsupported GIL layout`）。

## 2. 元件建模

路由：加载 `static-gil-model-builder`，读 `calibration-and-geometry.md` 已闭合资源表 + `production-workflow.md`。

**已闭合基础资源速查**（2026-08-12 验证）：

| resID | 规则 |
|---|---|
| 10009001 长方体 | scale=1 = 1×1×1（边长 1 米）；scale 就是边长；面片外贴 = ±0.5×scale + 半厚 + 间隙 0.005~0.01 |
| 10009003 平面 | 零旋转平躺、法线 +Y、XZ 平面 1×1（外接圆直径 1）、绕 Y 水平旋转；**scale 厚度不生效，要厚度用长方体** |
| 10005018 空模型 | 隐藏 1×1×1 正方体体积（坐标在中心点）；与同尺寸装饰物重叠会闪烁；宿主 scale 连带装饰物缩放（缩宿主需反比放大装饰物）；**可用场景：缩成小点（如 scale 0.1）当旋转中心/挂载点** |
| 10009004/5 棱柱 | 高度轴 Y、底面外接圆直径 1、顶点朝 -Z |
| 10009008 圆柱 | 零旋转轴向 Y |

**建模要点**（rubik-2x2 实战结论）：
- 元件模板**直接用基础元件当可见主体**（如长方体设灰黑颜色），避免"空模型 + 同尺寸装饰物"（隐藏 1×1×1 体积与装饰物重叠会闪烁）。**空模型不是禁用**：按场景选——若需要"点"（如旋转中心/挂载点），把空模型缩成 0.1 小点，挂载的装饰物缩放需额外 ×10（宿主缩放会连带装饰物）；同尺寸重叠才闪烁，错开尺寸即可。
- 薄片/贴片**用长方体**（scale=[边长, 厚度, 边长]）才有真厚度；平面缩放厚度不生效。
- 薄片外贴 = 表面(±0.5×scale) + 半厚 + 间隙 0.005~0.01，旋转按法线推导（平面法线 +Y → 目标方向，YXZ 内旋）。
- 元件 def/inst/entity ID ≥ 1077936129（0x40400000 区间，否则游戏加载时整体丢弃）；aux ID 可用 0x4000xxxx。
- **命名规范**：节点图要引用元件名，必须一眼可识别。魔方块用 WCA 角块名（角块_UBL/UBR/UFL/UFR/DBL/DBR/DFL/DFR）；未来 3×3 延续 WCA。
- 块间留缝：元件 scale 0.965（缝 0.035）等，薄片随比例自动保持贴面。
- 白色贴片用明显更暗的浅灰白（0xD0D0D0；纯白/近白 0xE8E8E8 均刺眼，透明度方案效果弱）；
- 场景实体**不预置**：游戏开始时由节点图动态创建（方便整体移位，改一个基准位置即可）。

## 3. 资产写回 + 视觉核验循环

```text
生成器/配置 → plan（status=ready，源 SHA 锁定）→ 候选 → 回读（export 逐 item 核对颜色/Transform/ID）
→ 展示安全门（目标/源 SHA/候选 SHA/新对象/触及 root/备份回滚）→ hash-gated 写回 → 写后回读 → 用户游戏核验
```

- 写回命令（固定候选原子入口）：
```bash
node ./bin/gsts.mjs assets:entities apply-candidate \
  --map-id <mapId> --candidate <candidate.gil> --expect-source-hash <sourceSha256>
```
- 自动备份在 `.gsts/backups/<mapId>.gil.<ts>.bak`；回滚 = 恢复备份 + `maps:resync`。
- **视觉迭代循环**：用户反馈 → 恢复上一次写回的备份（回到干净源）→ 改生成器 → 新证据目录 vN（不覆盖旧候选）→ 重走候选/回读/写回。证据目录：`~/genshin-ts-evidence/static-assembly/<game>-vN/`。
- 每次写回前确认游戏已关闭或编辑器未打开该地图（编辑器旧内存保存会覆盖磁盘写回）。
- 写回成功 ≠ 视觉通过：必须用户核验后才算建模阶段完成。

## 4. 输入机制

- 首选"实体选项卡"（entity option tabs）：官方知识确认选项卡选中事件直达挂载该实体节点图。
- **组件前置依赖**：选选项卡做输入，实体/元件必须先配置 **tabBar 组件**（regionName、options、regionType `box|sphere` + regionSize/regionRadius/regionCenter，CLI `assets:entities` 配置支持，编码见 `components.md`）——没配组件就没有选项显示、不会触发选中事件。
- 编辑器配置最小样本后，用相邻快照调查闭合 GIL 编码（editor-incremental-gia-investigator 流程），再做批量配置。
- **编辑器保存行为**：地图刚创建后，用户在编辑器**第一次手动保存**时，游戏引擎会自动补全地图**骨架定义**（默认实体 11 个、布局规范化等，与信号无关）；保存后必须重新比对/回读，不能假设磁盘与编辑器内存一致。
- rubik-2x2：魔方实体上 6 个选项卡 R/L/U/D/F/B（tabId 1~6，2026-08-13 已闭合）。

## 5. 节点图逻辑

- 读图：`gil-node-graph-reading`（从关卡全景到单节点数据源的追踪 + explain 词汇表）。
- 改图：`gil-node-graph-editing`（快照备份→候选→回读→写回，fail closed 不猜字节）。
- 事件挂载：`docs/game-engine-knowledge/graph-mounting.md`（实体挂载节点图、事件→节点入口）。
- **引擎规则速查（先查再问）**：`references/engine-rules.md`——坐标系（Y 垂直上、XZ 地面）、运动器 6 类全表与选择准则（无椭圆类，轨迹用分段直线）、关键事件 payload（含 whenEntityIsCreated / whenBasicMotionDeviceStops / whenTimerIsTriggered）、关卡实体（g.stage）、动态创建（createPrefab 无 GUID）、定时器同步推进、输入锁模式。设计/实现前先翻它，避免向用户重复问已沉淀的规则。
- **组件前置依赖**：运动类节点（如旋转运动器）要求目标实体带**基础运动器组件（basicMotion）**，否则节点执行时报错（P4 最小实验真实踩坑：用户手动补组件后日志恢复正常；基础元件模板自带 preset=default）。

### 复合节点编写（2026-08-14 方法论沉淀——重要技能）

- **原则：能做成复合节点的，一定往这个方向靠**——即使未被别处使用也不亏（布局清晰），
  别处复用更赚，跨项目复用是巨大资产。
- 两种价值：**复用型**（多处调用）+ **封装型**（单次调用但"一件事"范围清晰，如自旋/层筛选）。
- 能力边界与编写步骤见 `references/composite-authoring.md`；通用型复合（比较/数学扩展）是跨项目资产。
- **使用层总纲见 `docs/game-engine-knowledge/composite-usage-guide.md`**（何时复合化 5-7 节点标准、
  四种形态分类、接口设计、调用流/事件流/混合三模式参考实现、已知边界、验证流程、设计检查清单）。
### 玩法逻辑架构模式（用户 2026-08-10/12 亲手教学，rubik 旋转）

旋转类玩法拆成**两大块独立实现**：
1. **内部状态变化**：独立复合节点，施加旋转后更新逻辑状态（图变量：位置/旋转/累计值）；
2. **旋转效果表现**：已知旋转方向 → 确定该层 4 块 → 每块施加"自旋 + 分段公转"两个运动器（ADR-0003，2026-08-13 替代旧"绑定枢轴跟随"方案）：
   - 自旋 = 匀速旋转运动器（90°/1s；axis 为**相对朝向（局部轴）**——绕世界层轴须传 localAxis = R^T·worldAxis，见 engine-rules.md）；
   - 公转 = **N 段匀速直线折线逼近 90° 圆弧**（官方无椭圆/圆弧运动器；速度向量 = 段弦向量 ÷ 段时长，不依赖当前位置）；
   - 段推进用**定时器序列同步**（startTimer + whenTimerIsTriggered，timerSequenceId=段号），不要用停止事件驱动多实体（停止事件交错会弄乱共享段号变量）；
   - **输入锁**：bool 图变量，旋转期间忽略新输入，完成解锁。

硬约束（踩坑换来的）：
- 旋转时用的 direction 变量与结束计算方向必须是**同一个变量**；变量名定义/设置/使用三处一致。
- 单图节点上限约 **2000**（4000 实测跑不了）：超限拆多个节点图，用信号/自定义变量变更事件跨图触发；拆复合节点不解决负载（复合 impl 计入宿主图）。
- 新节点编码以 CLI 权威 `node_pin_records.ts` 为准（第三方元数据只作补充）；新节点先"实验图最小注入 → 游戏加载确认保留且执行"再写生产。**"引擎不认"不是无害**：可能整图解析失败/面板渲染失败/重存时被游戏删除。
- 每轮只改一个可唯一归因的变量；生产版 = 验证通过才算。

### 节点图治理要求（用户 2026-08-12 严格三要求）

- 结构要合理复用（同逻辑抽复合/共用子图，不复制粘贴）。
- 布局合理：变量可多处引用，但消费节点离变量定义处不能太远，否则跨线交叉混乱（自动布局算法本身没问题）。
- 避免细节问题：严禁"设置节点变量为空"（变量名不填/值不填）。

### 调试与验证工作流（2026-08-13/14 魔方 P4 实证）

1. **编译 + IR 断言**：编译后检查节点统计（总数 < 2000、关键节点族）；用 dump_gil_index.ts 回读注入后真实图结构。
2. **日志驱动调试**：用户反馈 → 最新 Beyond_Debug_Log（退出游戏落盘）→ gia_log.py records/frames --gil 逐帧核对
   （位置读取、字典查询、运动器参数——帧值是铁证，不猜）→ 根因 → 修复 → 注入 → 复验。
3. **每层证据独立**：编译成功 ≠ 注入成功 ≠ 游戏行为正确（v5.1 注入成功但字典空 → 实体不动）。
4. **引擎语义用矩阵反推**：rotation 欧拉（YXZ 内旋）→ 矩阵 → 对比候选语义（轴局部/世界）。
5. **修复链留痕**：每版缺陷/证据/日志文件记录（PROGRESS + motion-devices.md 验证记录节）。
6. 编辑器兼容性：某些结构"能执行但日志出问题"；逐节点添加/删除再添加回来，游戏可能自动修复（重存会规范化/删除引擎不认的节点）。

> 新技能：DSL 生产路径方法论（受限子集/节点预算/踩坑）用 dsl-nodegraph-development；
> 日志逐帧分析用 debug-log-investigator。

## 6. 编译注入

- 加载 `verify-injection`：专用验证地图 + `verify/<分支>/<分支>.ts` + `gsts.verify.config.ts` 编译注入。
- config 平时不配 inject（否则编译报 `target gil not found`），注入前临时加。
- 每分支一个验证点，编码成功/自动测试/注入/游戏内验证分层报告。
- **挂载图到实体**（事件触发前提，P4 用）：`gsts assets:mounts attach <实体ID> --graph <图ID> --gil <地图.gil> --write`；挂载后 whenTabIsSelected 等事件才会在实体上触发。
- **注入后先回读核验再进游戏**（用户 2026-08-13 要求）：直接写代码生成的节点图可能有 bug，先读真实 GIL 确认节点/连线/参数与意图一致，再让用户去游戏。

### 端到端注入顺序纪律（2026-08-16 灯阵回归实证——按此顺序一次性跑对）

```text
1 信号注册（assets:signals register 每条 --write；全部注册完后用 inspect 核验版本一致性）
2 玩法图注入（node-graphs create 占位图 → injectGilFile / gsts 单文件注入 → 回读节点数）
3 实体 import（assets:entities import --write；先确认 root4 定义已就位）
4 挂载（assets:mounts attach <实体> --graph <图> --write）
5 提醒用户重新加载编辑器 → 保存 → 游戏测试
```

关键规则（每条都是真实踩坑换来的）：
- **顺序不可颠倒**：实体 import 会重写 root 5/6，晚于它执行的挂载才保留；先 attach 再 import
  会导致挂载丢失。信号注册、图注入、实体 import、挂载互相独立但共用 root 10/5/8/6，
  后写者覆盖先写者的风险按上述顺序规避。
- **实体 import 前置条件——root4 元件定义必须在目标地图**：import 的 definitionId 若不在目标
  root4，CLI 会误判为"官方 res 直引"（relation 带 f2:1）→ 编辑器加载时实体被丢弃（场景实体空）。
  先 `assets:entities import` 前用 `assets:static-assemblies`/donor 把定义补齐，或确认
  `--definitions-gil` 已提供。有效自定义定义实体 relation = `{定义ID}` 无 f2:1。
- **信号注册后必须核验版本一致性**：inspect 输出每信号的 v= 与 defs=[..] 应一致且
  ≥ 阈值（N 个被引用信号 → ≥ max(3, ceil(3N/4))）；CLI register 已全表回填只升不降。
- **每次写回（register/inject/import/attach）后，用户必须先重新加载编辑器再保存**：
  编辑器旧内存保存会覆盖磁盘写回（v19 教训复发：灯柱实体两次"消失"、信号 v4 出错版均因此）。
  排查"变更消失"先核对当前 hash 是否等于写回后 hash。
- **游戏拒载类错误无日志**：进不去地图时 Beyond_Debug_Log 不产生新文件（加载期错误不落
  执行日志）。"进不去 + 无新日志"走三版本差分（我们版/自动保存版/用户修复版逐字段对比），
  不要等日志。

### 信号参数默认值规则（第 4 次信号错误根因，2026-08-16 已修）

- 发送信号（send_signal）节点的**已连接 InParam 不得携带默认值**——vendor Pin.encode 对
  value=null 的 Vector 会补空 VectorBase，引擎信号参数校验拒绝 → 游戏报"参数错误"拒载。
  编译链 post-encode 已统一清除（占位 300000/300001），写新玩法代码无需额外处理；
  若手工构造 GIA 需遵守：已连接参数 value 必须为 null，字面量参数（如 hop=1）可带值。
- 完整规则与三版本差分证据见 `docs/game-engine-knowledge/signals.md`「信号节点参数默认值」。

### 编译产物验证与真实地图注入（2026-08-20 魔方性能优化实证）

- **编译产物 `.gia` 验证用项目根 `tools/decode-gia.ts`**（配 jq 查 accessories 复合名/compositePins/主图节点）；
  `dump_gil_index` / `explain-gil-node-graph` / `parse-gil-node-graph` 只吃 .gil 地图，对 .gia 报"未找到节点图"。
- **注入前先备份**：`cp <地图.gil> .gsts/backups/<名>.bak` 并 sha256sum 记录；注入后 sha 变化与候选一致才算成功。
- **注入环境坑**：注入器备份目录 `~/.genshin-ts/backups` 只读 → 注入命令加 `APPDATA=<项目可写目录>`
  （如 `.gsts/appdata`）重定向；`/mnt/c` 只读挂载时注入命令需宽权限。
- **注入后两件事**：① 读图自检（`explain-gil-node-graph --composite` 验证被调复合 inflows 非空/执行流条数、
  `scan-gil-var-pins` 0 违规）② **Temp 同步**：编辑器活动目录 `.../Temp/` 的同一 .gil 需手动复制，
  否则编辑器显示旧图（2026-08-20 实证：注入命令不自动同步 Temp）。

## 7. 游戏日志验证

- 加载 `debug-log-investigator`：Beyond_Debug_Log 逐节点执行记录（执行顺序、输入输出、变量、控制流分支）。具体命令/脚本/格式踩坑全部在该技能内（如 `gia_log.py latest` 定位最新日志、脚本在技能目录 `scripts/`），这里不重复。
- 改图 → 编译 → 注入 → 用户运行 → 落盘日志 → 解析比对，还原节点执行过程破译引擎规则。
- **节奏**：用户每次去游戏真实玩一次就会产生新日志（“我每次玩一下就有新日志”）；游戏核验与日志解析是同一闭环的两面，缺一不可。
- 游戏内日志面板缺失 ≠ 没有执行记录：`.gia` 文件里可能完整（FaceTurnU 面板缺失但 .gia 有 44~48 帧记录）；先查 .gia 再怀疑图本身。

## 8. 知识沉淀与收尾

- 每轮更新 `examples/<game>/PROGRESS.md`（状态表：规划/建模/输入/逻辑/验证 + 变更记录 + 待闭合规则清单）。
- 新闭合规则同步两份文档：`static-gil-model-builder` 技能参考（建模技能）+ `docs/game-engine-knowledge/`（知识引擎权威）；局部经验只进案例文档。
- 工作流/结论变化时按 PKC 流程录入（`python tools/pkc.py`，pending→Authority 已提交基线后 approved）。
- **git 提交纪律**：未经用户明确指示不提交；用户指示"提交"时按主题分批（如：①工作区其他未提交文件 ②游戏项目相关文件含新技能），每批一个 commit，提交前 `git diff --check`。
- 每轮结束做规则反馈检查：本轮的源码/测试/真实 GIA/用户反馈是否与 AGENTS.md 冲突。

## 9. 子代理分包（大任务可选）

- 任务拆成独立工作包（如 W1 只读验证 / W2 小手术 / W3 核心重建），每包独立验收；用 `isolated-model-evaluator` 派子代理执行，主代理校验后写回真实地图。
- 子代理完成后复盘（`task-trace-review`），产出两类优化：通用类（任务分配/信息提供方式）+ 项目类（本项目踩的坑）。

## 状态分层（禁止混称"完成"）

```text
计划就绪 → 候选就绪 → 写回成功 → 用户视觉核验通过 → 游戏行为验证通过
```

## 案例速查

详细案例（地图 ID、元件清单、已闭合规则出处、视觉迭代历史）见 `references/rubik-2x2-case.md`；引擎通用规则（坐标系/运动器/事件/关卡实体/定时器）见 `references/engine-rules.md`。