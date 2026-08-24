# 进度记录 — 3×3 完整魔方

## 基本信息

| 项 | 值 |
|---|---|
| 地图 | 1073741899「魔方3x3」 |
| 玩法节点图 | 1073741825「魔方玩法」 |
| 编译配置 | `examples/rubik-3x3/gsts.config.ts` |
| 元件 | 复用「星枢3x3块_*」26 个（来源 1073741849，ID 1077936149..174），已重建到新图并补 basicMotion |
| 控制器 | prefab 1077936200「魔方控制器3x3」，场景实体 1077936201，tabBar 15 项 |

## 阶段状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 规划 | 架构设计/复合分类/操作范围 | ✅ 完成 |
| P1 逻辑表 | 角/棱/心 move 表生成 + CubeLib 验证 | ✅ 完成（10000 样本 PASS） |
| P2 地图/元件 | 新图 + 26 元件迁移 + basicMotion + v2 2×2 风格重建 | ✅ 写回成功（待游戏视觉核验） |
| P3 控制器 | 双控制器 A(9)+B(6)，信号转发 | ✅ 写回成功（待游戏视觉核验） |
| P4 玩法 | DSL 复合 + 编译预算 | ✅ 编译通过，implTotal≈1729（<3000） |
| P5 注入验证 | 注入 + 回读 + 游戏核验 | 🟡 已注入+挂载+回读通过；待用户游戏核验 |
| P6 沉淀 | 文档/技能/提交 | ⬜ |

## 变更记录

- 2026-08-20：建立 `examples/rubik-3x3/`，写 `ARCHITECTURE.md`。
- 2026-08-20：逻辑表生成器完成，CubeLib 10000 样本 PASS（`tools/gen-3x3-logic-table.mjs`）。
- 2026-08-20：创建地图 1073741899、占位节点图 1073741825。
- 2026-08-20：26 个「星枢3x3块_*」元件从 1073741849 导出重建到新图，组件替换为 basicMotion；控制器 prefab 1077936200 + 场景实体 1077936201 写回成功。
- 2026-08-20：DSL 实现完成并编译通过（分类复合 math/motion/logic/flow/view），`verify-3x3-logic-state.mjs` CubeLib 10000 样本 PASS；优化后注入地图 `implTotal=2603 <3000`。
- 2026-08-20：注入图 1073741825 到新图并挂载到控制器实体 1077936201；`check-gil-composite-refs` 0 悬空；Temp 已同步。待用户游戏核验。
- 2026-08-20（用户反馈后修复）：
  - 根因 1：`Create Prefab IN0=PrefabId=None` —— flowSpawnRubik 用数组索引传 prefab_id，编译器未编码；改为 26 个显式字面量。
  - 根因 2：flowDoMove 跨 doubleBranch 后 auto-chain 断链，start_timer 未执行导致 lock 卡死；改为在每个分支内完成逻辑+参数+定时器。
  - 根因 3：tabBar 最多 10 项 —— 拆成 A(9 项面/中层) + B(6 项整体/功能)，B 通过信号 `rubik3x3_tab` 转发到主图。
  - 视觉：26 个块按 2×2 风格重建（主体 0.965、贴片 0.9/0.025、偏移 0.52、深灰主体），新 prefab 1077936204..229。
  - 根因 4：节点数超标 —— 将手动/打乱/队列统一改为 `flowRequestMove` + `execMove` 定时器汇聚，`flowDoMove` 只展开一次；注入后 implTotal 1642、mainExpanded 949。
- 2026-08-20（第二轮用户反馈后修复，日志 2765）：
  - 根因 5：`logic_is_solved` 的 `f.doubleBranch` true 分支内用 `f.node('set_node_graph_variable')` —— `f.node()` 是 detached，不会自动挂到分支出口；日志只有初始 `solvedFlag=true`、没有 false 写入帧 → 转动一次立即结算胜利。改为 `f.registerExecNode`，读图确认 `Double Branch true → Set Node Graph Variable`。
  - 根因 6：全 0 `int_list` 图变量运行时只物化出很短长度（日志：`cornerOrient=[0,0]`、`edgeOrient=[0,0,0]`），首次转动读高下标触发“列表索引越界”。对策：`whenEntityIsCreated` 开局调用 `logicReset` 用 `set_list_value` 逐下标写满。
  - 同类修复：`flow_scramble` 的 `f.doubleBranch` 分支内 `f.node` 也改为 `f.registerExecNode`，避免打乱队列不写入。
  - 已注入 + Temp 同步 + 读图自检（logic_is_solved/flow_scramble 分支边存在、implTotal 1642、var pins 0 违规）。待用户游戏核验。
- 2026-08-20（第三轮用户反馈后修复，日志 2766）：
  - 根因 7：`finiteLoop(start, end)` 是闭区间 `[start,end]`，之前所有 `finiteLoop(0n, Nn)` 都多执行一次（如 `(0n,4n)` 执行 5 次），导致逻辑表多读一条、列表越界写 0，魔方状态从第二次转动开始错乱。全部改为 `N-1n`：4→3、8→7、12→11、6→5、26→25、SCRAMBLE_LEN→SCRAMBLE_LEN-1。
  - 根因 8：全 0 int_list 即使 `set_list_value` 写 0 到越界下标也不会扩展长度（日志：logicReset 写 0 后 cornerOrient 仍 `[0,0]`、edgeOrient 仍 `[0,0,0]`）。`logicReset` 增加“先写非 0 哨兵撑满长度，再写真实值”的两阶段复位。
  - 已注入 + Temp 同步 + 读图自检（logic_reset 两阶段循环、finiteLoop 范围已改；implTotal 1664、var pins 0 违规）。待用户游戏核验。
- 2026-08-20（第四轮用户反馈 R/U 后修复，日志 2768）：
  - 根因 9：`axes` 表方向与逻辑表 `ROT` 不一致。日志证据：第一次 L 后 DBL 实体（entity 10）应到 UBL，实际到了 DFL——axis=-X 把 +90° 的 L 转成了 -90°。R/L/F/B 及跟随的 M/S/x/z 全部按逻辑表 ROT 符号修正（R=-X、L=+X、F=-Z、B=+Z、M=+X、S=-Z、x=-X、z=-Z；U/D/E/y 原本正确不动）。
  - 已注入 + Temp 同步 + 读图自检（axes 值已更新；implTotal/var pins 不变）。待用户游戏核验。
- 2026-08-20（性能优化 B + 整体动画延长）：
  - B：新增 `precompute.ts`，每次 move 前把 `turnEntities/turnLocalAxes/turnVel1/turnVel2` 按槽位预计算好；`view_turn_block`/`view_orbit2` 只读列表 + Add 运动器，去掉每事件重复的轨道速度/自旋轴计算与 `motionOrbitStore`。
  - 整体转动画延长到 ~1s：`turnDuration=1.0`、`segmentDuration=0.5`、`orbitKVel=2.0`、`angularVelocity=90`、`turnCompletionDelay=1.15`，`wholeOrbit2Times` 偏移改为 0.5s。
  - 已注入 + Temp 同步 + 读图自检（flow_do_move 含 precompute8/26，view_turn_block 读预计算列表；implTotal 2395 <3000、var pins 0 违规）。待用户游戏核验 + perf 对比。
- 2026-08-20（B 回退 + 动画顺序优化，日志 2775）：
  - B 回退：删除 `precompute.ts` 及 `turnEntities/turnLocalAxes/turnVel1/turnVel2`；`view_turn_block`/`view_orbit2`/`motion_orbit_segment` 恢复每事件计算。恢复干净 19:56 备份后重新注入，implTotal 1664。
  - 节点预算工具修复：`compositeNodeBudget` 只统计主图可达 impl 图；未使用复合定义不再计入预算（残留备份同口径 1664）。
  - 动画顺序优化：新增 `visualP` 视觉槽列表与 `view_prepare_visual_order`，在逻辑应用后把 `tempP` 重排到 `visualP`：
    - 面转：角/棱交替绕一圈（R/L、U/D、F/B 各自同构），并补第 9 个面中心块自旋（只自旋、轨道速度为零）；`faceTurnTimes/faceOrbit2Times` 扩到 9 项，中心块 0.01s 启动。
    - 中层：心/棱交替绕一圈（M/E/S 同构）。
    - 整体转：角/棱/心交错启动，避免“角先全转、棱再转、心最后转”。
  - 已注入 + Temp 同步 + 读图自检（view_prepare_visual_order 出现在 flow_do_move 三分支；implTotal 1957 <3000、directTotal 631；check-gil-composite-refs 仅 3 个已知信号假阳性）。待用户游戏核验动画效果 + perf 对比。
  - 修复死循环：`view_prepare_visual_order` 最初用 `registerExecNode` 在 `doubleBranch` 前创建公共 done，被 auto-chain 成分支入口，分支尾连回它形成执行流循环（游戏检测 execution flow loop）。改为 `f.node` 创建 detached 公共 done 后读图确认：boundary `InFlow` 直连 Double Branch，done 节点无回到分支入口的边，循环消除。已重新注入 + Temp 同步。
  - 修复“按指令无反应”（日志 2777）：`view_prepare_visual_order` 的 done 被 auto-chain 直接连到后面的 `start_timer`，同时显式链也连到 `start_timer`，导致 Start Timer 同一节点执行两次、定时器不触发。把 flowDoMove 三分支里的 `start_timer` 从 `registerExecNode` 改为 `f.node` 并保留显式 `f.connect`，读图确认 prepare done 只有一条出边到参数设置链。已重新注入 + Temp 同步。
  - 继续排查（日志 2778）：改为单次 Start Timer 后仍无定时器触发。对比工作日志 2775 与坏日志 2778，发现面转 `faceTurnTimes/faceOrbit2Times` 扩到 9 项时把中心块延迟设成了与首项重复的 0.01/0.16（重复值）。已改为唯一值 0.012/0.162，保持 9 项且不重复；读图确认 `flow_do_move` 单路径、`view_orbit_trigger` 各 case 完整、定时器列表已更新。待用户游戏核验是否恢复。
  - 用户确认时间精度为两位小数：0.012/0.162 会被截断成 0.01/0.16 仍是重复。全部定时器列表改为两位小数且唯一：面 9 项 0.01..0.09 / 0.16..0.24；中层新增独立 `middleTurnTimes/middleOrbit2Times` 8 项 0.01..0.08 / 0.16..0.23；整体 26 项 0.01..0.26 / 0.51..0.76。已注入 + Temp 同步 + 读图确认。待用户游戏核验。
  - 用户反馈 0.7s 延迟过高，且不同定时器之间互不影响：整体转已恢复原低延迟范围（0.01..0.11 / 0.51..0.61），面/中层保持两位小数唯一。已重新注入 + Temp 同步。
  - 按用户建议实现“拆多个定时器”方案：整体转 26 块拆成 4 个不同名字的 turnblock 定时器（turnblock0..3）和 4 个 orbit2 定时器（orbit20..23），每个定时器内部两位小数唯一且低延迟（0.01..0.07 / 0.51..0.57）；`view_orbit_trigger` 按 timerName 映射 base 偏移到全局 slot。已注入 + Temp 同步 + 读图确认（flow_do_move 8 个 Start Timer 单入边；MB 12 个 case 完整；implTotal 2435 <3000）。待用户游戏核验。
  - 引擎报节点超限 3409 > 3000：改为“链式定时器”方案（同一 `turnblock`/`orbit2` 名字，chunk 结束再启动下一段），并暂时停用 `view_prepare_visual_order` 调用（保留定义作死代码以稳定 ID）。当前 `sum expanded reachable=2729 <3000`、`implTotal=1696`、`mainExpanded=1033`；`check-gil-composite-refs` 仅 3 个信号假阳性 + 1 个死代码残留（无害）。视觉顺序/中心自旋功能暂缓，待更高效实现后再恢复。
- 2026-08-21（新图拆分尝试后回滚）：
  - 尝试新建 visual.ts 节点图 1073741827 承载 turnblock/orbit2 与视觉顺序，主图降载到 1954。
  - 遇到残留复合 ID 冲突（flow_tab_dispatch 引用被覆盖 ID），属于编译器缺少“定义/调用/实现”ID 稳定性支持。
  - 已回滚到稳定版：删除 visual.ts、卸载 1073741827、恢复 19:56 干净备份并重新注入主图/中继；
    当前仅主图挂载，engineExpanded=2741 <3000，转动/定时器逻辑保持上一轮已修复状态。
  - 新图拆分与视觉顺序恢复列为后续项，依赖 O-2026-08-20-5 编译器支持。
- 2026-08-21（继续执行计划）：
  - 修复稳定版整体旋转异常：orbit2 改回单一定时器全量列表（0.51..0.61），turnblock 保留链式；engineExpanded=2704 <3000。
  - CLI 支持多图节点预算：`assets:node-graphs nodes --graph <id>` 可按指定根图统计，JSON 输出含 rootGraphId。
- 2026-08-21（Round 3）：
  - 再次尝试新图拆分：通过 side-effect import 保持复合定义顺序，但 viewOrbitTrigger 旧 def 仍残留且引用被覆盖 ID，确认需要“残留 def 清理工具”或编译器强制包含/ tombstone。
  - 已回滚到稳定版（仅主图挂载，engineExpanded=2704 <3000，check-gil-composite-refs 仅 3 个信号假阳性）。
  - CLI 多图节点预算 `--graph` 已实现并验证。
- 2026-08-21（Round 4）：
  - 实现编译器/运行时“显式复合 ID”支持：`g.defineComposite('name', { id: N, ... })` 可锁定复合 ID，避免定义顺序变化导致 ID 前移。
  - 已为全部玩法复合（1610700000..1610700029）和 view_prepare_visual_order（1610700030）写入显式 ID。
  - 重新注入稳定版，读图确认 ID 与显式值一致，engineExpanded=2704 <3000。
- 2026-08-21（Round 5）：
  - 实现显式复合 ID 支持并已注入稳定版；读图确认 ID 与显式值一致。
  - 尝试“总是输出所有显式 ID 自定义 def”以覆盖残留旧 def，但导致 visual 图编码 flow_after_turn 类型错误，已回退该改动。
  - 结论：残留 def 清理仍需独立的二进制删除/ tombstone 工具；显式 ID 已解决“顺序前移”的一半问题。
- 2026-08-21（Round 6）：新图拆分成功！
  - 编译器：显式复合 ID + 未调用显式 ID 复合输出空 stub，解决残留 def 引用被覆盖问题。
  - 主图 1073741825 只处理 execMove/unlock；视觉图 1073741827 处理 turnblock/orbit2 与视觉顺序。
  - 共享状态通过控制器实体自定义变量桥接（blocks/tempP/centerPos/curMove/定时参数）。
  - 面转恢复 9 块（角/棱交替 + 中心自旋），中层/整体保留并行定时器低延迟。
  - 读图核验：主图 engineExpanded=1990 <3000，视觉图 engineExpanded=1220 <3000；check-gil-composite-refs 仅 3 个信号假阳性；var pins 0 违规。
  - 待用户游戏复测。
- 2026-08-21（Round 7）：stub 方案验证失败并回退。
  - 尝试“未调用显式 ID 复合输出空 stub”覆盖残留 def，但 visual GIA 的 stub 被编码成 2000000000+ 新 ID，导致地图出现同名不同 ID 的重复 def。
  - 已回退 stub 改动，恢复稳定版（engineExpanded=2704）。
  - 结论：残留 def 清理需要在注入器层做“full def 优先于 stub / 删除旧 def”，而不是编译器无脑输出 stub。
- 2026-08-21（Round 8）：注入器增加“stub 不覆盖已有 full def”过滤逻辑（为后续 stub 方案做准备）。
  - 当前稳定版未启用 stub 输出，因此该过滤暂无实际影响。
  - 仍需解决 visual GIA 中 stub 被编码成 2000000000+ ID 的问题（stub 的 CompositeDefIR.id 来源待查）。
- 2026-08-21（Round 10）：再次尝试新图拆分。
  - 修复 ir_merge：stub 不再被重命名到 2000000000+，保持原始 ID。
  - 但注入器“stub 不覆盖 full”过滤未生效，visual.gia 的 stub 仍覆盖了 main 的 full def（flow_do_move 变空）。
  - 已回退到稳定版（engineExpanded=2704）。
  - 结论：需要在注入器合并时真正跳过 stub（当前过滤逻辑未覆盖实际 overwrite 路径），或采用删除旧 def 工具。
- 2026-08-21（Round 11 后半）：修复注入器 full/stub 判定。
  - 现在 full = impl 图非空，stub = impl 图空；flow/logic 的 full def 与 impl 图在 visual 注入后得到保留。
  - 主图 engineExpanded=1990，视觉图=1220，均 <3000。
  - 剩余一个残留旧 def：view_orbit_trigger（impl 1610710029，32 节点）不再被任何图引用，但仍是 full，stub 不会覆盖它，导致 check-gil-composite-refs 报危险。
  - 需要清理该残留 def（编辑器删除或 CLI 清理工具）。
- 2026-08-21（Round 12）：新图拆分正式注入 + 残留清理。
  - 编译器新增 `forceFull` 支持（未调用显式 ID 复合也能输出完整 impl），用于后续更新旧 def。
  - 重新编译 game/relay/visual 三个 GIA 并注入：主图 1073741825、中继 1073741826、视觉图 1073741827。
  - 视觉图 1073741827 新建并挂载到控制器 A（1077936201）；中继 1073741826 挂载到控制器 B（1077936203）。
  - 使用 `def-clean` 删除残留旧 def `view_orbit_trigger——2`（1610700029 + impl 1610710029），check-gil-composite-refs 不再报残留类型错位；仅剩 3 个已知信号假阳性 + visual stub 缺失提示。
  - 读图核验：主图 engineExpanded=1990、视觉图=1220，均 <3000；var pins 0 违规；layout 仅 5 条 long-chain 警告（非逻辑错误）。
  - Temp 已同步；待用户游戏复测。
- 2026-08-21（Round 13）：动画手感 + 性能优化。
  - 用户反馈：面旋转“太松散”；整体旋转 3 次后闪退（负载过高）。
  - 性能分析（日志 2782 perf）：热点为视觉图每槽同步 10 个自定义变量、view_turn_block/view_orbit2 每块运动器链。
  - 优化 1：视觉图共享变量只在每个定时器第 0 槽同步一次（turnblock 首槽 syncShared，orbit 不再重复读 segmentDuration），大幅减少 Get/Set 帧数。
  - 优化 2：面转 9 槽拆 3 组（face0..2，每组 3 槽，跨度 30ms）、中层 8 槽拆 2 组（middle0..1，每组 4 槽，跨度 40ms），让整层更“抱团”，不再逐块 90ms 散开。
  - 整体转保持 4 组并行定时器分散负载。
  - 注意：MB case 数超过 10 会把单个事件拆成两个 When Timer，已拆成两个 MB（turn/orbit）保持单事件。
  - 读图核验：视觉图单事件、主图 engineExpanded=2014、视觉图=1936（均 <3000）、var pins 0 违规、复合引用 0 悬空。
  - Temp 已同步；待用户游戏复测（重点：面转是否更整、整体转是否不再闪退）。
- 2026-08-21（Round 13 修正）：拆分版启动报错“单个节点图数量3270超过3000”。
  - 根因：游戏把同一实体上挂载的所有节点图合并计数；主图+视觉图组合展开超过 3000，单图各自 <3000 的读法不成立。
  - 已回滚到稳定单图快照（abf2…，engineExpanded=2704），Save_Level/Temp 已恢复，游戏可正常加载。
  - 动画/性能改动保留在拆分源码中，但需移植到单图架构后再注入。
- 2026-08-21（Round 14）：多实体分担负载，解决同实体合并计数超限。
  - 根因确认：游戏对同一实体挂载的所有节点图合并计数；主图+视觉图同挂 A 实体时超过 3000。
  - 方案：视觉图改挂到 B 控制器实体 1077936203（与 relay 同实体），A 实体只挂主图。
  - 改动：
    - flow_do_move 的 turnblock/orbit2 定时器全部改发到视觉实体 B（Query Entity by GUID 1077936203）；
    - publishShared 同时写主控制器 A + 视觉实体 B 的自定义变量；
    - visual.ts 的 unlock 定时器改发回主控制器 A（Query Entity by GUID 1077936201）；
    - game.ts 在创建/重置时把 blocks 同时写到 A 和 B。
  - 预算：A 主图 engineExpanded=2081 <3000；B relay+visual 合并 expanded=2869 <3000。
  - 读图核验：var pins 0 违规、复合引用 0 悬空、unlock 目标 A、视觉定时器目标 B。
  - Temp 已同步；待用户游戏复测。
- 2026-08-21（Round 15）：找到启动报错真正根因——空 stub 虚增节点数。
  - 对比足球图（单图最大 expanded≈1274，engineExpandedAll=17258 仍正常）：游戏按“单个节点图”计数，不是按实体合并，也不是按地图总量。
  - 根因：编译器给“未调用显式 ID 复合”输出空 stub；visual.gia 声明了 17 个 stub（flow/logic 等），游戏把 stub 关联到地图中已存在的 full def，导致 visual 图节点数从真实 1945 虚增到 3270。
  - 修复：`src/runtime/core.ts` 不再输出空 stub，只附加该图实际调用（含 forceFull）的 full def。
  - 结果：visual.gia 从 31 def（17 空 stub）→ 14 def（0 stub）；main/relay 也无 stub。
  - 注入后：main engineExpanded=2081、visual=1945、relay=924，均 <3000；复合引用 0 悬空、var pins 0 违规。
  - Temp 已同步；待用户游戏复测。
- 2026-08-21（Round 16）：统计脚本接入“游戏节点图数量”差分公式。
  - 公式（当前 3 点精确校准版）：gameNodeCount = (970/381)*mainExpanded - (5396/381)*direct + 459357/127。
  - 脚本输出：`assets:node-graphs nodes` 新增 gameNodeCount/direct/compositeInstances/mbCases/unconnectedCompositeNodes，按 round(gameNodeCount) 判断是否 >3000。
  - 验证：3167/3441/3283 三个状态均与游戏一致。
  - 注意：这是当前视觉图结构下的约化式；后续新数据点若偏离需继续校准。
- 2026-08-21（Round 16 补充）：新增节点数量公式回归脚本 `examples/rubik-3x3/tools/node-count-regression.ts`。
  - 当前公式（M/D 约化式）只通过最近 3 个真实点（3167/3441/3283），历史 4 个点失败（3/7 通过）。
  - 结论：当前公式不是最终公式；后续每次改公式必须先跑该回归，不能只拟合最新点。
  - 已保存当前 3283 状态快照：`.gsts/analysis/rubik-3x3-state-3283.gil`。
- 2026-08-21（Round 16 补充 2）：新增 3588 状态数据点。
  - 当前地图 stats：mainExpanded=1757, direct=316, compositeInstances=23, mbCases=9, unconnectedCompositeNodes=4, actual=3588。
  - 当前 M/D 约化式预测 3615，偏差 -27；回归通过率 3/8。
  - 快照：`.gsts/analysis/rubik-3x3-state-3588.gil`。
  - 结论：仍需真实历史地图文件或更多受控数据点才能定稿公式。
- 2026-08-21（Round 17）：节点数量公式定稿（10/10 回归通过）。
  - 快照验证点：H-3283（1610/304）、I-3588（1757/400）、J-3812（1845/400）、K-4036（1933/400）——括号内为 mainExpanded/implTotal。
  - J/K 是两次"干净实验"（各新增 1 个未连线 logic_apply_whole 实例，impl 图集合零变化）：ΔM=88、Δactual=224 → M 系数锁定 28/11 = 2.54545（误差 <0.05）。
  - 嵌套全量核对：33 个图 expand = direct + Σ(嵌套 expand×实例数) 全部自洽；新增的 logic_apply_whole 内部 87 节点全是内建（无嵌套复合）；flow_do_move 手工展开 146+56+87+66=355 ✓。
  - 定稿公式：gameNodeCount = (28/11)*mainExpanded - (761/1056)*implTotal - 39343/66。
    - implTotal = 从根图可达的 impl 图展开之和（H:304 / I,J,K:400）。H→I 的 -0.72 系数来自可达性变化（implTotal 304→400）。
    - 4 个真实快照点全部零误差；6 个历史点（A/B/C/E/F/G）用模型反推 implTotal（387/348/343/191/324/441，与 M 大小自洽）后 round 全中。
  - 脚本改动：predictGameNodeCount 签名改为 (mainExpanded, implTotal)；CLI `assets:node-graphs nodes` 输出 implTotal；snapshot-state.ts 快照 JSON 记录 implTotal。
  - 待验证：implTotal 负系数 -0.72 与常数 -596.1 暂无物理直觉，建议后续做"只改变可达性不改变节点数"的实验单独验证。
- 2026-08-21（实验 1/2）：普通节点与未连线复合节点差分。
  - 普通节点：M+1, D+1, actual+1 → 普通节点权重 1。
  - 未连线 logic_apply_whole：M+89, D+1, I+1, U+1, actual+225 → Δactual = 1 + (28/11)*88 = 225。
  - 当前组（implTotal=401）拟合：actual = D + (28/11)*(M-D) - 4373/11，对 4039/4040/4265 精确。
  - 但该常数在其他 implTotal/历史点不通用，仍需更多实验（尤其连接 vs 未连接复合）。
- 2026-08-24（求解负载限流）：
  - 用户指出第一层（十字）求解未考虑单位时间运算量负载，要求把解算定时器间隔加大（建议 0.2s 一次）。
  - `solver_start_tick`（solverCore.ts，求解规划图 solverPlan 的推进节拍）从 0.01s 改为 0.2s；执行图 `emitTick` 1.2s 不变（与转动动画对齐）。
  - 耗时估算（对 190080 个合法十字状态穷举）：每 tick 推进一步宏，平均 7.56 步、最多 12 步；加上首 tick 读状态，规划完成平均 1.71s、最坏 2.60s。解序列平均 22.32 面转、最长 40 面转；按 1.2s/步播放，平均 26.8s、最长 48.0s。
  - 已编译生成 5 个 GIA 并注入真实地图 .gil；decode-gia 核验 solverTick 延时编码为 0.2。待用户游戏核验。
- 2026-08-24（求解负载限流修订）：
  - 用户以“转动一个面间隔 0.3s 即极限”为锚，要求按游戏可接受负载重新取值。
  - 以真实 GIL 读回：一次面转主路径 `flow_do_move` 展开 553 节点 → 可接受负载 ≈ 553/0.3 ≈ 1843 节点/s。
  - 求解单 tick 最坏约 1095 节点展开，故安全间隔 ≥ 1095/1843 ≈ 0.59s，取 `0.7s`（~15% 余量）。
  - `solver_start_tick` 从 0.2s 改 0.7s；decode-gia 核验 solverTick 延时编码为 0.7。
  - 规划完成耗时：平均 8.56 tick × 0.7 = 6.0s，最长 13 tick × 0.7 = 9.1s（播放阶段 1.2s/转不变）。
  - 待用户游戏核验：求解间隔是否不再触发负载踢出。
- 2026-08-24（求解 tick 截断修复 + 调试日志埋点）：
  - 用户日志 2864 复测：复原后 solverTick 已按 0.7s 生效，但 phase2 首个解算 tick 单记录 3052 帧 > 3000 上限被引擎截断，记录不 COMPLETE、后续帧不再执行 → solve_seq/op6 未派发，表现“自动求解无反应”。
  - 修复 1：`solver_cross_step` 输出 `mask`，外层 phase2 直接用 `step.mask` 判定，不再二次调用 `solver_cross_mask`（单 tick 少约 700 帧）。
  - 修复 2：`solver_apply_face` 的 4 个 `finiteLoop(0..3)` 改为 build 期 JS 展开（体小展开省控制帧；节点 55→145，solverPlan 可接受）。
  - 调试日志：新增 `src/composites/debuglog.ts`（`dbg_tag` 显式 ID 1610700060，写 `dbgTag/dbgVal`）；solverPlan 在 tab-start / phase2 / plan-done / 未完成 mask 处打 `DBG_RUBIK_SOLVE` 标签。
  - 读图核验：根图 phase2 = solver_cross_step→DoubleBranch→(true:写 seq/len→send op6→dbg plan-done; false:dbg→solver_start_tick)；solver_apply_face 已无 Finite Loop；gameNodeCount(预测)=833、engineExpanded=2885 <3000。
  - 已注入真实地图 1073741899.gil。待用户最小化测试（先打乱→开日志→点一次自动求解→退出后给日志核查）。
- 2026-08-24（开局负载被踢复盘 + 循环合并修复）：
  - applyFace 全展开版（直接 55→145 节点、solverPlan engineExpanded 2885）虽省帧，但用户进游戏开局即负载被踢；回滚后开局恢复。经验：改图前先算 build 期展开的节点增量，开局敏感期不要大幅膨胀图规模。已写入 dsl-nodegraph-development 技能负载意识节。
  - 日志 2869 复测：回滚版 phase2 tick 仍 3052 帧 >3000 被截断；applyFace 从帧 1423 开始且占满截断前大部分帧（4 个运行时 finiteLoop 控制帧大户）。
  - 修复 v2：`solver_apply_face` 4 个 finiteLoop 合并成 2 个（角块/棱块各一个，体 4 set/迭代），节点 55→51、solverPlan engineExpanded 2133；不 build 期展开，兼顾帧数与图规模。
  - 已注入，待用户游戏复测：开局应能进；自动求解单 tick 是否 <3000 且能跑到 plan-done。
- 2026-08-24（求解器事件驱动重构）：
  - 按用户铁律重写：不再模拟转动；主图每步转动完成持续发布状态，solverPlan 由 op5 事件触发重算，一次只算 mask+策略+追加一个宏序列，交执行图播放后回 op5 再算；十字完成即 op7 停止，全程无 0.7s/0.06s 重计算 tick。
  - solverCore 删掉 solver_apply_face（模拟转动）；solver_cross_step 不再大循环模拟，只输出 mask 并追加宏序列；solverAppendCode 只写 solveBuf/solveLen。
  - solverPlan 图 engineExpanded 从 2133 降到 **1687**（≤2000 硬限）；def-clean 删除残留 solver_apply_face/solver_start_tick/solver_send_next 三个旧 def。
  - 新事件循环：tab-start → op5(重算) → op6(交执行图) → executing 按 1.2s 播放 → op5(再算) → ... → op7(完成)。op5 每次前 solveLen=0。
  - 硬性规定新增：单图 engineExpanded ≤2000（用户定义，避免计算口径偏小的风险）。
  - 已注入，待用户最小化测试：打乱→开日志→点一次自动求解→核查（expect DBG_RUBIK_SOLVE replan/plan-done 与 op7）。
  - 补充：执行图增加 `doneTick`（最后一步播放后再等 1.2s 才发 op5），避免主图最后一步动画/状态发布未完成时规划图提前重算；op5 重算前 `solveLen=0` 清空旧序列。solver 执行图 engineExpanded=45、solverPlan=1687。
