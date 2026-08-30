# 完整复盘：足球状态机重构注入后信号拒载二连（2026-08-30）

> 范围：足球 demo 状态机重构（R0-R3 代码/编译/注入）+ 注入后游戏拒载排查（信号注册 → 注入 → 拒载 → 两层根因 + 编辑器形态对照）
> 视角：编译器/注入器/信号编码三层的端到端一致性
> 证据：提交 784a93d / fcea719 / 3af8745；四版本 GIL 快照（39f54330 备份、e180bbbe 注册后、db162dd1/b9c279e6 注入后、用户编辑器修复版 199645af/d4075d2d/4e161294）；.gia 解码（decode-gia.ts）；用户游戏测试反馈（拒载 ×3、修复 ×3）
> 状态：两层根因已修复并注入（SHA 5419a64f），待用户游戏核验

## 一、错误谱系总览

| # | 日期 | 根因层 | 具体错误 | 修复 | 提交 |
|---|---|---|---|---|---|
| 1 | 08-30 | 环境 | 编译器并发修改：根图数组字面量 → `gsts.f.assemblyList` 触发 ctx 错误（旧代码同失败，已实证非本重构引入） | 显式 `f.assemblyList([...],'float')` 规避 + 同事修复编译器 | 784a93d（代码侧规避） |
| 2 | 08-30 | 设计 | dribble_field_tick 双 outflow：脱脚分支在 outflow[1]，宿主只连 outflow[0] → 脱脚信号永不发（多 outflow 续链陷阱自踩） | 脱脚信号移入复合内直发 + 复合无 outflow | 784a93d |
| 3 | 08-30 | 设计 | goalNew 在 scored 写回后多处消费 → 重求值读到 true 变 false（重复求值家族） | tmpGoal 物化（写回前 set 一次，消费点读快照） | 784a93d |
| 4 | 08-30 | 注入器 | 重建顶层 field 10 只保留 field 1-5 → 信号注册表后的 f7=1 标记丢失 → 游戏不识别信号参数拒载 | readFieldRawTail 保留 field>5（两处重建点） | fcea719 |
| 5 | 08-30 | Stage3 | 复合内发送节点从未被信号 patch：collectSignalUsages 只扫主图 IR → 发送节点缺 signalVersion/clientExecNode.kind=6/compositePinIndex（注入器只补 ID） | 扩展扫描 ir.compositeDefs[].implNodes | 3af8745 |
| 6 | 08-30 | Stage3 | 信号名 pin 显式零字段（type=0/type_server={0,0}/i1.index=0/i2）与编辑器实样不符；protobufjs Message 上 delete 无效（getter 复活默认值） | 赋 undefined + send 节点 name pin 移到 OutFlow 后 | 3af8745 |

历史同族（2026-08-16 灯阵五连错，`retrospective-2026-08-16-signal-registration-series.md`）：版本一致性 → 版本下限 → 版本阈值 → 参数默认值 → 参数布局——"游戏拒载无日志"的谱系仍在扩展。

## 二、最近一次错误的完整调查链（复合内发送节点不 patch）

**现象**：修复 f7=1 后重新注入，游戏仍拒载。用户提示："信号发送那里还是老问题？你检查一下，注入生效了吗？"

**调查链**（方法 > 结论）：
1. **注入生效确认**：当前地图 SHA/Temp 双查 + top10 字段序列（f7 在，71 字段）→ 注入已生效，问题不在 f7。
2. **按用户提示查发送端**：提取 dribble_field_tick 复合实现（impl 1610710004）→ 与用户修复版 diff → 差异遍布全 impl（3730B）。
3. **.gia 解码定位**：发送节点 genericId 仍是占位 300000、signalVersion 缺失、clientExecNode.kind=5、name pin 无 compositePinIndex → **patch 从未作用于它**。
4. **代码路径追因**：`collectSignalUsages(ir)` 只扫 `ir.nodes`（主图）；复合 IR 的 send_signal 不被收集 → `finalizeSignalEncoding` 对 dribble-field.gia 早退（usages 空）→ 复合内信号节点只剩 composite.ts 的无 identities patch（跳过）+ 注入器 ID 补丁。
5. **修复**：collectSignalUsages 扩展扫描 `ir.compositeDefs[].implNodes`；同时把信号名 pin 的显式零字段（type/type_server/i1.index/i2）对齐编辑器实样（赋 undefined，非 delete）；send 节点 name pin 移到最后。
6. **验证**：.gia 与注入副本中发送节点 `[InParam(91), OutFlow(5), name(43)] + signalVersion=3` 与用户修复版逐字节一致；真实地图注入（SHA 5419a64f）+ f7 + 图结构核验通过。

## 三、为什么反复出问题——系统性根因

1. **信号节点全链路跨三层，无端到端 golden 对照**：注册 def（CLI）→ GIA 节点编码（Stage3）→ 注入器改写（ID/f7）。任何一层与编辑器实样偏离 → 拒载无日志。修复 #1（f7）后 #2/#3 仍在——每层都要单独对照编辑器产物验证，不能"注入成功"就交付。
2. **只读工具归一化掩盖差异**：scan-gil-signal-registry / parse / explain 输出在"我的注入版 vs 编辑器修复版"之间显示一致（注册表 615B、监听节点结构、pin 摘要），但游戏拒载——**字节级四版本对照**（备份/注册后/注入后/编辑器修复版）才是最终证据；工具只用于快速筛选。
3. **用户原话提示是最高价值信号**：两次"信号有问题"、"信号发送那里"直接导向根因层（第一层注册表附近 → 第二层发送节点）。排查中段陷入"监听节点字节考古"时，是用户的提示把方向拉回发送端。

## 四、流程与方法论教训

- **四版本字节对照法**（本次最有效）：同一现象（拒载）下，按时间线保留 备份→操作后→注入后→编辑器修复版 的快照，逐字节 diff 定位"哪一步丢了什么"（f7=1 就是 `06 38 01 5a eb 02` vs `06 5a eb 02` 一字节级证据）。
- **旧代码 stash 对照**：编译器不稳定时，`git stash push -- examples/football` 编译旧代码——"旧代码也失败"证明是环境/编译器问题，避免在错误的方向上修自己的代码。
- **protobufjs 陷阱**：vendor Message 的字段是原型 getter/setter，`delete pin.type` 会复活默认值（编码仍写出）→ 必须赋 `undefined`。本次 `delete` 版修复后解码仍显示字段，改为赋值才生效。
- **工具归一化 vs 原始字节**：decode-gia/parse 对缺失字段显示默认值（index:0/type:0），容易误判"没修好"或"已一致"——判据必须是 .gia/地图原始字节窗口。
- **多 outflow 续链陷阱自踩**（设计层）：复合多 outflow 只有 [0] 被宿主续链——设计时"分支各自 outflow"是错误姿势；复合内直发信号 + 无 outflow 更简单可靠。

## 五、风险探索与未闭合项

- [ ] 复合内**监听**节点（monitor_signal 在复合 IR）：collectSignalUsages 已覆盖，但复合内监听节点的 patch（OutParam 过滤等）无真实样本验证——标记待验证，勿推广。
- [ ] **客户端图**信号路径（client_graph.ts / sendSignalToServerNodeGraph）：无 patchEncodedSignalNodes 调用，客户端信号节点是否同样"不完整 patch"未验证。
- [ ] 发送节点 **pin 顺序**（name 在 OutFlow 后）：按编辑器实样对齐，但未确认游戏是否真的校验 pin 顺序（可能是编辑器显示要求）。
- [ ] 本波修复后**游戏核验未做**（用户将测试）——核验通过前状态为"已修复待验证"。
- [ ] PKC 录入：O-2026-08-30-01/02/03 待知识库录入（见 open-items）。

## 六、产出清单

| 类别 | 内容 | 状态 |
|---|---|---|
| 修复-注入器 | fcea719：readFieldRawTail 保留 top10 field>5（f7=1） | 已提交+注入 |
| 修复-Stage3 | 3af8745：复合内信号节点完整 patch + 信号 pin 对齐编辑器 | 已提交+注入 |
| 修复-足球 | 784a93d：状态机唯一仲裁重构 R1-R3 | 已提交 |
| 证据快照 | /tmp/user-fixed3.gil（4e161294）、backups/*.bak（39f54330/d4075d2d/4e161294）、/tmp/inject-v3.gil | 留存 |
| 待录入 | PKC：注入器 top10 重建保留 field>5；复合内信号节点需完整 patch；信号 pin 零字段与编辑器对照 | open-items O-2026-08-30-01/02/03 |
| 技能迭代 | verify-injection 核验清单补充（f7/信号节点字节对照） | 见技能文件改动 |

**规则反馈检查**：本轮无与 AGENTS.md/CLAUDE.md 冲突的发现；CLAUDE.md 已由同事更新（单副本修复），无需追加。
---

# 附章：物理链断链二连（同日第二轮，提交 a45bf3b）

> 现象：游戏核验通过（拒载修复）后，用户反馈"信号修复了，但是没有补上参数？"；完整日志解析后发现脱脚后球冻结、冻结后射门全部无效。
> 证据：日志 3005（548 记录，游戏 36s 会话）；rec263 vs rec287 球位置逐字节相同（-29.5347, 0.25, -4.4614）= 冻结铁证；状态时间线 rec88→518。

## 一、本附章错误谱系

| # | 根因层 | 具体错误 | 修复 | 提交 |
|---|---|---|---|---|
| 1 | 状态迁移 | 脱脚（CARRIED→ROLLING）：ball_dropped 只写 ballVel+stateCommit，球上最后的设备是 dribbleCtrl，其停止事件被旧分发忽略 → 无 physics 停止事件 → 物理链断裂 → 球冻结 | ball_dropped 提交 ROLLING 后立即执行 physRollTick（激活 physics 0.2s，链自持续） | a45bf3b |
| 2 | 分发器 | 旧分发器只响应 name=='physics'；kickApplyImpulse 用唯一名设备（"1"/"2"…），停止事件被忽略 → 冻结后射门（impulse 分支）fly_tick 永不执行 → 球永远冻结 | 分发器改为按 state 分发（FLY/ROLL/SLIDE/FREE 任何设备停止都恢复物理链；CARRIED/GOAL 忽略） | a45bf3b |

## 二、完整调查链（用户三次提示驱动）

1. 用户："信号修复了，但是没有补上参数？"——我最初只查信号参数（发送 IN0 / 接收 OUT3 vel 都有值），误判"信号正常"。
2. 用户："检查完整执行日志"——才做**完整状态时间线还原**（548 记录：FREE→FLY×3→SLIDE×9→ROLL×2→FREE→CARRIED→脱脚→FLY×3），发现脱脚后无任何物理 tick。
3. 铁证：rec263 与 rec287 球位置相同 = 冻结；impulse 设备（"1"）停止事件被分发忽略 = 断链。
4. 用户："对照真实世界的物理运动。而不是以旧版本老代码为标准"——纠正修复哲学：状态迁移 ⇒ 物理规则立即生效（不依赖设备名巧合），而非延续旧分发器怪癖。

## 三、系统性根因

1. **物理链由"设备停止事件"驱动，任何状态迁移若球上无对应设备在跑就断链**——真实物理中运动是连续的，状态迁移必须显式启动物理链（或保证触发源）。
2. **只查单点（信号参数）≠ 完整验证**——第一次只验证了信号帧，漏掉了下游物理链；完整时间线还原（状态×位置×设备）才能暴露"状态对了但运动没接上"。
3. **旧代码怪癖会掩盖设计缺陷**——分发器按设备名过滤是"能跑"的旧实现，不是"正确"的实现；修复标准应是真实物理语义。

## 四、方法论教训

- **完整日志解析流程**：记录概览 → 状态提交序列（带 rec 号）→ 球位置时间线 → 设备激活/停止配对——比单点 grep 高效得多（本次 3 次提示后才走全流程）。
- **位置不变铁证**：两个时间点位置逐字节相同 = 冻结的硬证据，比"看起来没动"可靠。
- **用户提示的语义层级**："参数"可能指信号参数，也可能指物理运动参数——先做完整解析再理解用户指意，不要急于下结论。

## 五、未闭合项

- kickApplyImpulse 冲量设备速度=dv（纯冲量）在无 physics 链边界场景有 0.2s 视觉过渡（physics 链正常时叠加=v_old+dv=nv 自洽）；更真实做法依赖"同名设备替换"语义（PKC 未确认）——待用户测试反馈是否可见。
- 同名运动器替换语义（PKC clm_36A5D97…"新添加替换旧的，无论同名"未确认）——闭合后可简化 kickApplyImpulse。

## 六、产出

| 类别 | 内容 | 状态 |
|---|---|---|
| 修复 | a45bf3b：ball_dropped→physRollTick + 分发器按 state | 已提交+注入（SHA d2036c95） |
| 待录入 | PKC：物理链断链（状态迁移必须显式启动物理链）；分发器按状态不按设备名 | open-items O-2026-08-30-05 |
| 待验证 | 用户游戏测试（脱脚惯性滚动、滚动中射门） | 进行中 |
