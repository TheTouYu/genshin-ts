---
name: editor-incremental-gia-investigator
description: Investigate and accumulate Genshin editor engine rules through user-saved, adjacent map snapshots. Always use this skill when adding a game-engine feature, studying how a level asset/node/pin/connection/parameter/component/UI/variable is encoded, comparing before/after GIL files, or preparing a learned rule for Genshin-TS implementation. It first reads the project's human-readable game-engine knowledge graph to reuse known concepts and evidence, then performs only the missing incremental experiment, preserves immutable snapshots and hashes, derives bounded rules, hand-replays them in temporary GIA/GIL, and keeps real-map writes behind explicit or scoped standing authorization.
compatibility: Genshin-TS repository with Node.js, tsx, tools/pkc.py, tools/list-gil-node-graphs.ts, and tools/compare-gil-node-graph.ts.
---

# 游戏引擎增量学习与 GIA/GIL 调查

把用户在游戏编辑器中的小变化转换成可复查的相邻快照、定点差分和同构重放证据，并把稳定规则接回 `docs/game-engine-knowledge/`。目标是持续还原游戏引擎，而不是在每个新会话中重新调查，或只为当前生产代码打补丁。

## 硬约束

- 默认全程只读；复制快照到 `/tmp` 不构成真实地图写回。
- 先判断本轮是冷启动、已有任务续作还是阶段切换，再按最小恢复路径加载；不要把冷启动清单机械用于续作。概念知识、真实编码和当前实现三者分开，不从头重做已有调查。
- 默认每轮一个可唯一归因的编辑器变化。“一个变化”按编辑器可实现的最小原子操作定义；编辑器必然自动生成的默认子对象或联动值属于该操作事实，不要求用户执行做不到的理想空操作。若多个变化均有已验证规则且能逐项断言，可组合验证；任何可独立控制的未知增量都停止推广并拆分。
- 不猜 `mapId`、`nodeGraphId`、图类型、信号 ID、pin index 或版本；都从当前地图和相邻快照读取。
- 未知规则闭合前，不改生产代码，不调用待修 production lowering/finalize 链生成“规则证明”。
- 不未经规模评估打印完整地图、整图 JSON 或 100 槽列表节点；默认只输出摘要和 PASS/FAIL。
- 手工重放只写临时 GIA/GIL；真实注入前必须单独展示目标、当前 hash、命令、修改范围和回滚路径，并获得明确确认。
- 用户可以对一个已锁定实验授予持续写回授权。授权后，同一 `map path/mapId/nodeGraphId`、同一实验目录和同一候选验证流程内，不再逐轮请求确认：候选通过严格回读后，先核对真实地图当前 hash 与锁定前快照一致，再创建唯一备份并原子写回，同时把同一候选 GIA 以不覆盖的清晰文件名复制到 `Beyond_Local_Export/` 根目录，随后直接通知用户测试。路径、ID、实验范围或预期 hash 任一变化时，持续授权失效并停止确认；授权不扩展到其他地图、图或实验。
- 自动比较、临时注入、真实写回、GIA 导出、编辑器导入和游戏行为是不同证据层，分别报告。

## 新功能与调查入口

处理任何游戏引擎新功能前，先回答：

```text
引擎概念：它属于关卡、资产、组件、UI、节点图、复合节点、控制流、数据流、变量还是镜头？
已有知识：知识目录已确认什么，证据层级是什么？
真实缺口：缺的是游戏概念、GIA/GIL 编码，还是项目某个编译层的实现？
```

按 `docs/game-engine-knowledge/project-pipeline.md` 定位层级：

```text
高级 TS → 扁平原生 API TS → JSON/IR → 特殊规则 + 第三方编码 → GIA → GIL
```

- 游戏规则和编码已知：直接进入对应生产层的 red/green，不要求用户重复实验。
- 概念已知、编码未知：进入本 Skill 的相邻快照流程。
- 游戏功能尚未开放或项目尚未设计：记录边界，不虚构 API。
- 仅当前实现未知：查源码和测试，不用编辑器实验替代代码调查。

## 模块路由

主 Skill 只承载通用调查、安全和证据流程。先判断领域，只加载一个匹配模块；模块不存在时才按冷启动流程定位缺口。

| 领域                                         | 模块                                     |
| -------------------------------------------- | ---------------------------------------- |
| GIL 根层、整体字段树、自由新建或自由修改对象 | `references/gil-whole-structure.md`      |
| 节点图逻辑：信号注册、发送、监听、参数或连接 | `references/node-graph-logic/signals.md` |

模块记录领域恢复字段、专项断言和比较入口，不复制通用安全规则或整份领域知识。新增模块应等规则和重复流程稳定后再建，不为尚无复用价值的单例预先搭架子。

## 最小恢复路由

开始前只选一种模式，不叠加执行：

### A. 已有任务续作（优先）

出现任一条件即走续作：用户说“继续/好了/已保存”、会话中已有明确 handoff/快照路径，或已锁定地图、图和下一轮变化。

只读取匹配模块和一个**恢复锚点**：优先使用用户或当前会话明确给出的 handoff/status 文件；没有 handoff 时，读取模块指向的领域 Authority。从锚点取得前快照、地图路径、`nodeGraphId`、已确认规则和下一缺口后直接工作。不要再次加载索引、`project-pipeline.md`、导航 Skill、通用领域文档或 PKC，除非锚点明确指出 coverage gap。

### B. 冷启动

没有可用恢复锚点时：

1. 读取根 `AGENTS.md`、本 Skill和必要的 `.gia/.gil` 安全导航规则；
2. 读取 `docs/game-engine-knowledge/index.md`；
3. 沿索引只读取一个本轮领域文件；仅当无法判断项目转换层级时再读 `project-pipeline.md`；
4. 只在领域文件没有所需编码结论时，运行一次 bounded PKC 查询。

PKC 查询优先使用索引、Authority 或 handoff 已给出的精确 Topic ID。自然语言查询出现 `coverage_gap` 时停止扩散：它不等于传统 Authority 没有内容，也不授权连续尝试多个近似 Topic。最多根据返回结果改用一个明确候选 Topic；仍无关键规则就报告缺口。

### 修改信号的生产复用规则

信号修改应复用创建信号的生产编码路径，不再编写独立的递归文本替换脚本。当前入口为 `gsts assets:signals update`，底层复用参数模板池、注册表索引构建、send/monitor/server 三份定义构建和规范回读；目标信号的三个 identity ID 自动读取并保持不变。

写回流程固定为：读取源 hash → 生成临时候选 → 规范 `readRegisteredSignalsFromGil()` 回读 ID、名称和参数类型顺序 → 确认源 hash 未变 → 创建备份 → 写回 → 再次读取真实地图。候选回读或 hash 竞态失败时不得写回。原位修改成功不等于编辑器导入或游戏行为验证成功。

多模型调查时，主模型维护共享 manifest 和 Authority，实验 Agent 可在自己的独立实验目录内捕获/比较并写 `diff.json`、局部 manifest 和 `result.json`，只有主模型执行真实地图写回。连续批次先固定每个相邻快照对，再并行调查并串行运行 Validator；用户编辑器每轮只做一个可归因变化，未知伴随变化标记 `INSUFFICIENT`，不推广规则。可直接复用 `references/parallel-investigation-prompts.md` 的提示词模板；完整流程见 `docs/operations/gil-parallel-investigation.md`。

### C. 阶段切换

从真实增量切到手工 GIA、写回、生产修复或知识回填时，只补读新阶段要求的安全规则和最小 Authority，不重放前一阶段的加载清单。

## 开始一轮

先复述用户声明的唯一变化，例如：

```text
本轮唯一变化：未绑定发送节点 → 绑定信号 foo；没有新增连接或其他节点。
```

若用户只说“好了/已保存”，沿用上一轮明确约定的唯一变化；若没有明确约定，先问一个问题，不扫描猜测。用户补充“这是编辑器允许的最小操作”时，按实际原子操作更新声明：自动生成的默认子对象不视为越界，但仍须与手工附加修改区分。用户报告多个界面值时，明确分成“实际修改”“只读观察”“编辑器联动”，只有实际修改进入唯一变化 claim。

只有冷启动、用户明确切换地图，或**同一固定关卡中新建实验图但当前会话缺少 map path** 时才运行 `gsts maps`。后一种是续作恢复，不要先反问用户路径：只运行一次 `gsts maps`，选择工具标记的最新修改地图；若最新地图不唯一或与用户描述冲突，再请用户确认。

若用户明确指定第三方逆向仓库、分支和用途，可以在不读取实时地图的情况下做一次有界只读交叉检查：固定 commit，读取最小 schema/工具片段，只报告与锁定快照候选字段的 wire 相容性和有限计数。第三方字段名、注释、递归可解析性和成功解码都只能作为实验选题线索，不能命名 GIL 根字段或替代真实相邻差分；交叉检查结论必须记录为 `INSUFFICIENT`，直到独立 Validator 接受真实编辑器增量。

只有新图尚未识别时才运行：

```bash
npx tsx tools/list-gil-node-graphs.ts <map.gil>
```

对于“每个实验都在同一关卡新增一个节点图”的固定流程：

1. 优先沿用已锁定 map path；缺失时按上面的最新地图恢复一次；
2. 对当前地图列图一次，并优先用用户给出的图名定位；
3. 没有图名时，用上一实验不可变快照与当前地图的图集合差确认唯一新增图；
4. 用户提供的“上一图 ID + 1”只能用于筛选候选，必须由实际列表和图集合差验证，不能直接推算；
5. 立即把当前地图保存为新实验的 v0，并锁定 map path、`nodeGraphId`、图名、前快照和 hash；后续轮次进入快速续轮，不再运行 `gsts maps` 或全图列表。

若缺少可比较的旧快照、集合差不唯一且用户也未给图名，才询问一个最小澄清问题。通过明确 graph ID、图名或唯一图集合差定位目标，不能按常见 ID 推断。已锁定路径和图后进入快速续轮。

### 已锁定实验的快速续轮

当上一轮已经锁定 `map path/mapId`、`nodeGraphId`、前快照和下一轮唯一变化，且用户只回复“好了/已保存”时，不重复执行 PKC 查询、`gsts maps`、全图列表、全仓状态或无关文档加载。直接沿用锁定上下文：

```text
当前地图 SHA-256
→ 复制到新的不可变快照并复核 SHA-256
→ 对固定 nodeGraphId 做相邻定点差分
→ 更新规则覆盖矩阵并约定下一轮唯一变化
```

只有以下情况才退出快速续轮并重新定位：

- 当前地图 hash 未变化；
- 锁定路径不存在，或用户明确切换地图/图；
- 目标图出现约定外 metadata、节点或多项字段变化；
- 观察与已有规则冲突；
- 进入 GIA 重放、真实写回、生产修复或知识回填等新阶段。

若一批变化全部属于已由真实证据确认的同一编码骨架，可以让用户一次填写多个值并逐项断言；仍须保留每项的类型、值字段、序号和定义 pinIndex 检查，任何一项不匹配就停止整批推广。不要为重复的一致样本继续消耗一轮单变化实验。

单属性操作若穷尽叶子集合后只改变一个叶子，且独立 Validator 从 raw 快照接受该映射，则该
属性路径已受限闭合；默认直接转向下一个未知问题，不要求反向恢复。只有 missing/default
presence、量化、可逆性或冲突本身是当前缺口时才追加恢复或边界样本，并预先写明停止条件；
新样本提供额外精度证据，但不能把已闭合路径重新变成待确认项。

## 保存不可变快照

规则证据默认持久化到：

```text
${GTS_EVIDENCE_HOME:-$HOME/genshin-ts-evidence}/<module>/<experiment>/raw/
```

单个证据文件使用 Skill 自带脚本做不覆盖复制和 SHA-256 复核：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/capture-evidence.py \
  <source-file> <destination-directory>
```

连续编辑器调查优先用实验封装一次锁定 before/after；它拒绝未变化地图和已有目标，
并只输出包含路径、SHA-256 和大小的小型 JSON：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/capture-experiment.py \
  <current-map> <before-snapshot> <experiment-directory>
```

相邻快照使用明确语义名：

```text
<task>-v0-<semantic>.gil
<task>-v1-<semantic>.gil
```

脚本会生成同名 `.sha256`。不得覆盖旧快照。`/tmp` 只用于可丢弃的解码输出或临时注入副本；凡被规则、文档或 handoff 引用的原始 GIL/GIA、手工候选和重放结果都必须持久化。

记录最小基线：

```text
map path / mapId
map SHA-256 / size / mtime
nodeGraphId / type / name / node count
用户声明的对象 identity、旧值 → 新值和唯一变化
snapshot path / SHA-256
```

用户只说“又修改了”且对象 identity 或旧值不明确时，先问一个澄清问题；不要依赖差分反推用户意图。用户声明与 raw-wire 不一致时，以文件事实为准并标记 `CONFLICT`。

每个实验在 `notes/manifest` 中维护可续作的最小状态，不依赖聊天上下文恢复：

```text
锁定的 map path / mapId / nodeGraphId
当前前快照及 SHA-256
本轮唯一变化和 donor
候选 GIA/GIL 路径及 SHA-256
自动结构 / 临时回读 / 真实写回 / 编辑器导入 / 游戏验证状态
下一缺口
```

manifest 只记录已发生的证据，不能把“文件被扫描或消失”写成“编辑器导入成功”。

## 比较相邻快照

整体 GIL 语义树调查先比较**每个 root occurrence 的完整 raw encoded bytes**，不能只比较字段总大小；后者会漏掉等长内容变化。使用：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/compare-gil-root-wire.py \
  <before.gil> <after.gil> \
  --output <experiment>/coordinator/root-wire-diff.json
```

固定顺序为：文件大小/哈希/presence → 全 root raw bytes → 仅变化 root 的直接子记录集合差 → 唯一目标记录定点解码。完整流程见 `references/gil-whole-structure.md`。等长同步字段只记录变化，不能按重复出现猜测语义。

定点解码优先复用 `scripts/` 下已有资产（如 `inspect-gil-root-container.py <before> <after> <rootField>`、各领域专用 inspect 脚本和 NodeGraph 比较器），不手写一次性解析；动手前先读模块 references 的工具清单，避免重复实现已有能力。现有资产不覆盖目标时才允许临时解码，同一解码模式重复三轮后必须按下方规则资产化。

已锁定 NodeGraph 的专项差分命令（`compare-gil-node-graph.ts` 摘要 → `--full` 定点提取）、
字段清单和 raw-wire 形态断言速查见匹配模块的 reference「快速相邻比较」。原则：先摘要确认
唯一变化（added/removed/changed、nodeIndex 重建、identity 与 pin 数），再加 `--full`
定点提取；protobuf 默认值不能证明 wire presence，需要区分“缺失”和“默认值”时补
raw-wire 或 round-trip 断言。

### 同步记录与多 ID 命名空间消歧

一个编辑器单变化仍可能同步创建 definition、instance、owner registry、auxiliary 或派生索引。不要因 ID 与用户对象相等、相邻或首次出现，就直接决定哪一条记录代表编辑器对象。

第一轮出现多记录或多 ID 歧义时，优先追加一个同类型、保持默认设置的第二样本：

```text
基线 → 对象 A → 对象 B
     相邻差分 A   相邻差分 B
```

分别计算两轮唯一新增记录、稳定引用路径和同步 registry 变化。只有两轮根字段集合稳定、目标容器各有唯一可归因记录、引用使用相同 raw-wire 子路径，并经独立 Validator 复核后，才能合并受对象类型、地图和版本限制的 `CONFIRMED`。否则保持 `INSUFFICIENT`；不要为了重复采样而无限追加第三个样本。

### Validator 原始证据独立性

Validator 可以读取 Investigator 结果以知道待裁决 claim，但关键断言必须直接从原始 before/after 快照重新计算，包括 SHA-256、相邻链、字段 presence、记录集合差、引用方向和目标 ID。不得仅检查 `result.json` 内部一致性，或调用 Investigator 生成的中间 JSON/辅助函数后把同一结果称为独立验证。

Validator 只能写自己的 `validation.json`。裁决中逐项记录重新计算的检查、`ACCEPT/CONFLICT/INSUFFICIENT`、适用范围和未验证层级；Coordinator 只合并这些独立检查通过的 claim。Validator 断言失败时公开定位失败检查，优先排除 encoded bytes/value bytes、presence 或路径筛选错误；修正断言后必须从原始快照重跑，不得放宽语义 claim 来制造 `ACCEPT`。

## 第三方 schema 交叉检查

第三方仓库只作为辅助证据源，不是当前 GIL Authority。执行前固定：

```text
仓库路径 / 分支或 tag / commit
读取的 schema 或工具文件
对应锁定快照及 SHA-256
只检查的候选字段和输出上限
```

检查必须满足：

- 不切换或修改第三方工作树，不读取无关大型数据文件；
- 不扫描实时地图，不进行写回、round-trip、编辑器导入或游戏验证；
- 先报告候选字段的 wire type、长度、UTF-8/varint 摘要和有限嵌套计数；
- 将“schema 与当前 wire 相容”与“编辑器语义已确认”分开记录；
- 与真实相邻差分不一致时，以文件事实为准并标记 `CONFLICT/INSUFFICIENT`；
- 只有真实相邻差分和独立 Validator 接受后，才能把受限语义写入 Authority。

## 每轮输出

每轮只给一个结论块：

```text
快照：路径 + SHA-256
目标图：ID / 名称 / 类型 / 节点数前后
唯一增量：added / removed / changed
规则状态：CONFIRMED / CONFLICT / INSUFFICIENT
证据边界：真实编辑器观察 / 自动结构断言 / 尚未游戏验证
下一轮：只做一个最小变化（若规则已闭合则停止索要编辑器操作）
```

如果观察与已有知识冲突，标 `CONFLICT` 并停止；不静默覆盖旧规则。

## 重复操作资产化

每轮开始先查 `scripts/` 目录与模块 references 的工具清单：已资产化的解析/差分/Validator 前置断言直接复用，缺什么再写什么。手写临时解码只允许在无覆盖时发生，并记录缺什么；同一模式三次重复后必须提炼为参数化资产。

同一只读解析、路径提取或 Validator 前置断言在至少三轮重复，且对应路径已由独立
Validator 接受后，将它提炼为 `scripts/` 下的最小参数化资产；单例和仍在变化的规则继续留在
实验目录。资产不得内置实时地图路径、对象名或一次性 ID，必须在差分不唯一时失败，并用至少
一条真实正常路径和一条失败路径验证。稳定的长恢复路径写入 manifest 顶部恢复块，并在命令中用
`SIG/MAP/GID/LOCKED_BEFORE/LOCKED_HASH` 等短变量引用，减少重复上下文；变量
只缩短表达，不扩大授权或证据范围。每会话开跑前粘贴一次恢复块，`LOCKED_BEFORE/LOCKED_HASH`
随每轮更新。

## 手工同构重放

当相邻增量已经唯一且字段闭合时：

1. 从前快照读取完整目标 NodeGraph；
2. 只应用刚观察到的节点/pin/connection 增量；
3. 复用项目正式 GIA 包装器生成编辑器可导入文件，不从 injector 单元测试 fixture 复制最小 Root/header；至少断言正式 `fileType`、Root identity、`filePath` 和 `gameVersion`，同时不调用待验证 production lowering；
4. 用现有 `createInjector().injectBytes()` 对 `/tmp` GIL 副本按明确 `targetId` 整图替换；
5. 回读目标 NodeGraph，与后一真实快照做 protobuf bytes 或严格结构比较；
6. 同一次候选生成同源的正式 `.gia` 和临时 `.gil`，分别验证编辑器导入包装与目标图回读；
7. 留下一个最小 runnable 断言，只输出 PASS/FAIL 和关键摘要。

目标图一致即可；编辑器可能同步改动地图其他记录，因此不要要求整个 GIL 文件 hash 相同。文件被扫描、移动或消失只说明文件处理状态；编辑器显示候选、导入成功、节点结构正确和游戏行为正确必须由各自证据确认。

## 验证成本分级

只运行覆盖改动层级的最小验证：

- 仅修改 Skill、调查脚本或 `tools/`/Skill 下由 `tsx` 直接运行的工具：运行目标脚本的正常/失败路径（适用时）和 `git diff --check`，默认不运行 `npm run build`；
- 修改生产 TypeScript、公共编译/注入 seam、构建入口或被 `tsconfig` 编译的发布代码：运行 focused regression、`npm run build` 和 `git diff --check`；
- 不用全量构建替代目标脚本的真实输入验证，也不因“工具能运行”宣称编辑器或游戏验证通过。

## 生产实现比对与红灯锁定

真实规则闭合后、进入生产修复前，先做一次只读比对（不改生产代码）：把已闭合规则逐项
对照 production 实现，差异点写成总表（实现 vs 真实 vs 测试），并为每个可断言差异写
focused regression 锁定红灯。真实样本已覆盖的方向（数据连接、控制流连接、fork、链式、
pin 字段 presence）按以下模板检查：

```text
数据连接：挂目标 InParam；connect=源 OutParam（含 index）；connect2 例外表
控制流连接：挂源 OutFlow；connects.id=目标；connect/connect2 的 kind 与 index presence
fork/链式：同源 pin 多 connects 保序；中间节点自己的 OutFlow
exec pin：i1/i2 的 kind 与 index presence；SysCall 无 CPI / SysGraph 有 CPI
目标侧：InExec 是否落盘
```

protobufjs encode 对 proto3 普通标量的默认值（如 `index: 0`）会写出**显式字段**
（`{kind:1,index:0}` → `08 01 10 00`，而 `{kind:1}` → `08 01`）。因此"解码层 index=0"
与"wire 缺失"必须用 raw-wire 形态断言区分：搜 2B 无 index 形态必须存在、4B 显式
index=0 形态必须不存在。红灯测试输出 wire diagnostics 总表，当前生产实现不满足真实
规则时测试预期 RED，并在注释中写明真实证据实验与修复方向。

## 进入生产修复的门

只有以下条件全部满足才读取并修改 production seam：

- 已有知识与本轮增量的边界清楚；
- 相邻快照确为单变化；
- 手工同构重放通过，或明确记录为什么不适用；
- 已有一个在旧生产实现上失败的 focused regression；
- 用户要求进入修复。

之后执行最小 red→green 修复，重新用生产代码生成同样的最小候选，并把自动结果与用户编辑器/游戏核验分开报告。

## 知识回填

规则通过真实增量和同构重放后，更新 `docs/game-engine-knowledge/` 中适用范围最小的文件：

- 先写人能读懂的游戏概念和行为；
- 再写节点、参数、连接或资产的具体编码规则；
- 记录真实快照、命令、观察、适用图类型和验证层级；
- 更新 `index.md` 的关联，不复制相同结论到多个文件；
- 当前生产实现另写源码、测试和架构文档，不把实现状态混成游戏规则。

工作中的 `/tmp` 快照和聊天内容不是长期知识。稳定结论进入跟踪文件后，才可在后续会话中作为恢复入口。

## 知识与提交

稳定流程或规则先更新最小 Authority 并提交；只从已提交基线创建 PKC knowledge-plan。一个 plan 串行完成 Claim、Authority Ref 和必要 stale refresh，finalize 后展示精确 Bundle content hash，等待用户确认后才能 approve/apply。局部路径、一次性 ID 和未验证猜测不进入 `AGENTS.md`。
