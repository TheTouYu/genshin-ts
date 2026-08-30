# 复盘账本（Review Ledger）

复盘发现项的**带状态追踪**：复盘开始先查本文件 + `git log --oneline -20`，**已落地（DONE）的项直接跳过，不重复分析**；未落地（OPEN）项才是本次复盘的分析对象。

## 使用说明（复盘/派活前必读）

1. 查 `git log --oneline -20`：最近的落地提交（如"复盘落地"）= 已处理过的问题集合，读提交信息即可知道覆盖了什么。
2. 查本文件：DONE 区已登记的项不再分析；OPEN 区是待办。
3. 复盘产出新发现 → 落地后登记 DONE（日期 + 证据 + 落地方式），未落地登记 OPEN。
4. 保持轻量：每条 1-3 行，只记"发现 + 证据 + 落地方式"，不复制细节（细节在提交 diff 里）。

## 已落地（DONE）

### 2026-08-30 构建门禁修复 + tsx 运行时单副本（build 888 错到 0，quicktest 恢复绿）

- client_graph.ts normalizeClientNodesEditorWire 用未定义 ClientGiaPin 类型 + 对必填 number 字段赋
  undefined（编辑器 wire 归一化）——EditorWire 类型收窄修复（243bf0e）。
- types-local/gsts 同时引用 src 全局 + dist 模块双副本；08-16 加 private brand 后 branded 类型
  （entity 等）nominal 不兼容，build 门禁实际从 08-16 断，期间提交均未跑通全量 build（888 错）。
  修复：types-local export 改指 src + tsconfig paths（genshin-ts/* 到 src/*）统一 src 单副本；
  D2 白名单漏 localVariable（ClientSyntheticFlowMethod）补上（243bf0e）。
- tsx 运行时读 tsconfig paths，把 .gs.ts 的包 import 解析到 src 副本，与 CLI（dist）双副本，
  kCtxStack unique symbol 分裂，所有 gsts.f 访问报 ctx=javascript（quicktest 7+1 失败、football
  编译失败）。修复：新增 tsconfig.tsx.json（无 paths）+ 三处 tsx spawn 注入 TSX_TSCONFIG_PATH
  （gs_to_ir_json / ir_to_gia / config_loader，235bdff）——tsc 类型检查用 tsconfig.json（src 单
  副本），运行时统一 dist 单副本。
- 验证：npm run build exit 0；npm run quicktest exit 0（67 GIA）。
- football 状态机重构（并行工作，R0 用户已确认）：new str() 缺 import + 旧生成物 dribble.gs.ts
  残留已修/清理；重构主体保留工作树（REFACTOR-PLAN.md 跟踪）。

### 2026-08-25 UI 分支细搬合并（genshin-ts-ui → 主项目）

| 发现 | 证据 | 落地方式 |
|---|---|---|
| UI 分支（~/genshin-ts-ui @ b6bc986）与主项目分叉：主项目独有 144 / UI 独有 35，双方同改 165 文件 | `git merge-base` = 50fc059 | “细搬”而非一把 merge：35 新文件 + 49 UI-only 改动 + `src/cli/gsts.ts` 三方合并（保留 maps:init + 加入 image/library 命令）；提交 `3ffe4bc` |
| 本地垃圾目录与 examples 下 .gsts 备份进入 git 视野 | `git status --short`（.dsh/.jspace/.probe 等） | `.gitignore` 增补根规则 + `examples/*/.gsts/`；提交 `f2f674c` |
| image-editor 缺 `image_template.gia` 与 `golden-image-mode.gia`，golden 测试 ENOENT | `tests/image-editor/gia-image-mode.test.ts` 失败 | 从 UI clone 复制并豁免 `*.gia` 忽略（它们是“输入数据”非生成产物）；提交 `f66f771`，测试 PASS |

### 2026-08-15 P4-4 构建门禁修复（examples 类型问题全链）

| 发现 | 证据 | 落地方式 |
|---|---|---|
| `npm run build` 红：34 个类型错误集中在 examples（provenance/FlowMarkerRef/裸 exec 参数伪装类型/unitTagIndexList list 实例 + 历史 timerName 缺口） | `npx tsc -p tsconfig.json --noEmit` EXIT=2 | 类型契约修复（value.ts/core.ts/nodes.ts/server_globals.d.ts）+ `tests/timer_global_overload_type_safety_test.ts` 回归；TASKS.md P4-4 关闭、PROGRESS.md 新增变更记录 |
| 定时器类型回归顺带暴露 Stage-1 新 bug：类型级 `typeof a.b`（QualifiedName）被 timer capture 误当运行时变量 → 生成跨作用域引用 `timerName` 并在 IR 阶段 ReferenceError | quicktest 红灯 `ReferenceError: timerName is not defined`（生成 .gs.ts 捕获块跨作用域） | `shouldCaptureIdentifier` 排除 `QualifiedName.right`；同文件类型断言保留为永久回归 |
| 完整 `npm run gen` 再次产出 ~5.5k 行资源漂移（nodes/events/prefab 生成物） | 本次 gen 后 `git diff --stat`：nodes.ts 5520 行、events 561 行等 | 按 compiler-practical-optimization-backlog §7.1 恢复无关生成结果，改用 `--composite-contracts-only` 最小生成；**漂移仍需独立审计，不属于 P4-4** |

### 2026-08-23 football 运动器叠加 + 物理状态机复盘

| 发现 | 证据 | 落地方式 |
|---|---|---|
| 固定点运动器（匀速直线）与旋转运动器同链激活时直线设备被秒停，球原位不动；旧修复只改 move_speed 无效 | 日志 2828：ballPos 正常推进但 GetEntityLocation 连续多 tick (0,0.25,0)；提交 6fdcfa3 | motion-devices.md §10 新增定点器叠加规则；同族扫描无其他该组合 |
| 落地状态机只看 pos.y 就转 ROLL，吞掉弹跳；滚滑沿用初旋方向导致方向错、摩擦 0.985 太滑 | 日志 2829：rec11 落地即 state=2，滚滑 ballSpin 恒绕 Z；提交 48b680d | football physics.ts 弹跳阈值 + 摩擦 0.8 + ω=(v_z/R,0,-v_x/R)；retrospective-2026-08-23-football-motion-and-rolling.md |
| 施力首段视觉目标用 v0·dt、物理用 v1·dt → 首段过冲+反向回拉，空中速度突变 | 日志 2830：高吊/横传首段 linvel 反向回拉；提交 e23b817 | kickLaunch 复用 physIntegrate 预积分首步；retrospective 文档 2.5 节 + dsl 技能错误表补行 |
| kickLaunch 纯数据复合多消费且中途写回输入图变量 → 引擎重新求值二次积分，低弹道球往草里扎 | 日志 2832：同一 physIntegrate 第二次输入使用已积分 ballVel；提交 9b0d261 | 消费顺序 setPos→physApplyMotion→setVel/setSpin；dsl 技能补行 |
| 复位 lockRotation=true 保留上一段朝向，导致第二次横传 local axis≠world axis、旋转方向错 | 日志 2832：复位后球朝向仍 z≈105.7°；提交 9b0d261 | motionInstant 改 lockRotation=false；motion-devices.md §10 补语义 |
| 同族：physFlyTick/physRollTick 也先写回 ball* 再消费 integ.*，goal/ground 二次积分 | 代码审查同族扩展；提交 5f2fc97 | 单 tick 物化 tmpPos/tmpVel/tmpSpin 快照；fly/roll 的 goal 只读快照 |
| 上旋低平施力首段视觉目标未贴地 clamp，y=-0.1 扎草 | 日志 2836 DBG_KICK=6：rec188/484 首段 pos y=-0.1；提交 60308a7 | kickLaunch 首段目标 max(y,0.25) 贴地，速度用 integ.nvel；用户复测通过 |
| 运动中再施力触发同名 physics 运动器冲突，球卡住后速度误算 | 日志 2839/2841：DBG_LOC 卡顿、add_uniform 速度升到 -64 | 状态分支 + 唯一名冲量运动器叠加（impulseSeq→str）；b23f7eb |
| 内层 doubleBranch 前放 exec 复合调用导致两分支都执行 | 日志 2841：kickLaunch 与 kickApplyImpulse 同 record 帧 | 公共复合调用移入各分支；dsl 技能补规则；4e8c55a |
| 快静止 ROLLING 球补力 y 被砍 0，能量接近 0 | 用户复测 + code 审查；提交 703a9ca | 冲量保留 y 分量且补力后写 state=1 |
| 8 选项方向单一无法绕场 | 用户反馈；提交 66321f1 | 重排 y 力度与水平方向向量 |
| kickApplyImpulse 分支链出现 n7↔n8 循环控制流，地图启动失败 | 真实 GIL parse flow；提交 341815c | 分支链线性化 setVel→setSpin→state→seq→impulse |

### 2026-08-13 eval-tabbar-cli 复盘（tabBar 区域配置子代理，1500s 贴顶）

| 发现 | 证据 | 落地方式 |
|---|---|---|
| 子代理 7 次 stash + 14 次 build 自证"HEAD 已存在的构建阻塞"，~31 调用/~10 分钟 | trace L26690-34626 | `isolated-model-evaluator/SKILL.md` 新条目：派活前跑基线、把已知失败清单写进任务文件（含快捷判定：git diff HEAD 空 + git show HEAD 有缺陷 = 已证明） |
| `npm run build` 每次冷启 ~47s（prebuild rm -rf dist），改码循环全用 build | 实测 47.3s vs noEmit 增量热态 4-5s | `static-gil-model-builder/SKILL.md` 新节「验证回路与 CLI 约定」：fast typecheck 回路 / plan blocked 看 stdout JSON（本次 18 调用考古） / fixture f5-f6 形状坑 / 槽字节探针片段 |
| plan CLI blocked 时 exit 1 且 stderr 空，失败原因只在 stdout JSON | trace call 74-88（L30279-34626） | `src/cli/assets_static_assemblies.ts` 应用补丁：blocked 时 stderr 输出错误码摘要（routing 测试信息 1!==0 → plan blocked: prefab-id-out-of-range） |
| 复盘技能"超时即未完成"判定粗糙（本次 exit 124 但 final.md 完整、agent_end 干净） | trace L64583/64584 时序 | `task-trace-review/SKILL.md` Step 1.5：按时序区分 agent_end 前后被掐；tool_errors 逐条分类（grep 无匹配是假错误） |
| 子代理无 edit 工具，13 处仓库源码编辑 + 3 处 /tmp 脚本 patch 全走 python3 heredoc（/tmp 脚本被打坏 2 次） | invocation.json 工具集 + trace L43267/L46000 | OPEN 区 O3 登记（evaluate.py 派活加 edit 工具） |

### 2026-08-12 四技能专项复盘（本轮，commit 75c2541）

| 发现 | 证据 | 落地方式 |
|---|---|---|
| reading 技能缺 parse --json 输出键名速查（子代理 42 次 python -c 探测结构） | cube-v5/eval-main、eval-bindhold trace | `gil-node-graph-reading/SKILL.md` Step 2.6（真实键名：input/target/graph/status/discovery + nodes/dataflow/flow） |
| reading 技能缺节点名→ID 查询速查（turn-ctl 审计建议只落了写技能） | skill-audit-report.md #6 | `gil-node-graph-reading/SKILL.md` Step 2.7（grep + python 解析，与写技能同源） |
| editing 技能 parse --json 行无键名指引 | 同上 | 该行补交叉引用 Step 2.6 |
| debug-log 技能脚本路径指引不清（子代理 find 3 轮） | eval-loglab-r3-parse trace | `debug-log-investigator/SKILL.md` 补绝对路径 + 旧位置警告 |
| production-workflow 缺 maps/entities export 键名速查（cube-blocks5 16 次探测） | gil-eval-cube-blocks5 trace | `production-workflow.md` 补实测键名 |
| 等角螺线 V9→V11 缝隙处理演进未沉淀 | spiral-v12-eval + 会话 019fef2f 用户反馈 | `curve-path-decoration.md` 新增节（V11 楔子方案真实样本确认；V11.1 标注未定稿） |

### 2026-08-11 及之前已落地（git log 索引，详情见提交）

- `7c2f124` 魔方重构系列 2-5 轮复盘落地（tooling+skills）
- `745e339` V10 派活复盘：production-workflow 补 inspect JSON 键名速查 + root-diff-summary 管道用法
- `221899a` ops 表补 node-add 4 参/add-inflow 闭合标记 + diff-gil-files CompositeDef 记录级比对
- `f499993` 等角螺线 V4-V7 经验（曲线铺放/圆柱横放/箭头比例/ID 双查/--gil 导入）
- `42ab3ab` debug-log gia_log.py v2（图名/节点名/Vector/枚举解码 + dump_gil_index.ts）
- `dae3b1f` 文件级 diff / 清空图 / 跨图复制 op（turn-ctl 复盘 11 个自写脚本 → 3 个正式能力）
- `205b88f` cases/node-copy/graph-var-add ops + 图变量注册/Str 变体 Set/DoubleBranch 语义闭合

## 未落地（OPEN）

### O-2026-08-30-01 注入器重建 top field 10 保留 field>5（f7=1 信号标记）【已修复 fcea719，待 PKC 录入】

- 证据：2026-08-30 足球拒载四版本对照（39f54330/e180bbbe/db162dd1/用户修复版）——
  注入后 `06 38 01 5a eb 02` 变 `06 5a eb 02`，f7=1 丢失 → 游戏不识别信号参数拒载。
- 落地：src/injector/binary.ts readFieldRawTail + index.ts 两处重建点追加（fcea719）。
- 待办：PKC 录入（信号注册后注入链路完整性规则）。

### O-2026-08-30-02 复合内信号发送节点完整 patch（collectSignalUsages 扫复合 IR）【已修复 3af8745，待 PKC 录入】

- 证据：dribble_field_tick 内 f.sendSignal 生成的发送节点在 .gia 中仍是占位 300000
  （无 signalVersion/clientExecNode.kind=6/compositePinIndex）→ 游戏拒载；
  用户提示"信号发送那里"定位。
- 落地：collectSignalUsages 扩展扫描 ir.compositeDefs[].implNodes（3af8745）。
- 待办：PKC 录入（信号节点完整生命周期规则）。

### O-2026-08-30-03 信号名 pin 零字段对齐编辑器实样（protobufjs delete 陷阱）【已修复 3af8745，待 PKC 录入】

- 证据：我的编码 type=0/type_server={0,0}/i1.index=0/i2 vs 编辑器省略；
  vendor Message 上 delete 无效（getter 复活默认值）→ 须赋 undefined。
- 落地：patchEncodedSignalNodes 零字段置 undefined + send name pin 移最后（3af8745）。
- 待办：PKC 录入。

### O-2026-08-30-04 复合内监听节点 / 客户端图信号节点 patch 路径未验证【OPEN 待验证】

- 复合内 monitor_signal：collectSignalUsages 已覆盖但无真实样本验证 patch 输出。
- 客户端图（client_graph.ts）信号路径无 patchEncodedSignalNodes 调用——同族风险未排查。
- 何时做：下次涉及复合内监听或客户端信号时先查本项。

### O-2026-08-30-05 物理链断链：状态迁移必须显式启动物理链【已修复 a45bf3b，待 PKC 录入】

- 证据：日志 3005 完整时间线——脱脚（CARRIED→ROLLING）后球冻结（rec263 与 rec287
  位置相同 -29.5347,0.25,-4.4614）；冻结后 impulse 射门激活唯一名设备，旧分发器只响应
  name==physics → 物理 tick 永不执行。
- 规则：物理链由设备停止事件驱动时，任何状态迁移若球上无对应设备在跑即断链——
  状态迁移必须显式启动物理链；分发器按 state 分发（不按设备名）。
- 待办：PKC 录入；kickApplyImpulse dv/nv 0.2s 边界过渡 + 同名替换语义（clm_36A5D97）待验证。

### O-2026-08-29-01 变量系统三层打通任务（跨会话）

- 证据：用户 2026-08-29 发起「完整打通游戏变量相关」三层任务；第一层全景地图已落盘
  `docs/maintenance/variable-system-panorama.md`（官方 KB/米游社/PKC/本地文档/源码四路探索）。
- 状态：第一层完成；第二层（差分清单 D1-D14）需用户配合编辑器最小差分；第三层修复候选 F1-F9 待排期。
- 何时做：每会话读 panorama §6 检查点继续；第二层逐项闭合后录入 docs/game-engine-knowledge/ + PKC。

### O-2026-08-29-03 我方节点 id 引用写显式 indexOfConcrete=0，编辑器首存会省略（字节漂移）

- 证据（2026-08-29 变量实验 v3 差分）：注入图 2 的 getter 节点（337/344）经用户编辑器保存后，
  节点记录 f3 136→124 B——编辑器省略 id 引用里的默认 indexOfConcrete=0（与 GraphVariable 修复
  同族「默认字段省略」）；id 数值/类型/pinCount 不变，语义无损。v10 差分再确认：pin i1/i2 的
  indexOfConcrete=0 同样被编辑器省略（我们写显式 10 00）。
- 影响：仅注入后首存产生一次性字节漂移（编辑器簿记），无功能影响；但可让生产编码直接对齐编辑器形态。
- 何时做：低优先；下次改节点引用编码（nodeRefWire/pin index）窗口顺手归一化 + 样本回归。

### O-2026-08-29-04 局部变量常量 init 的节点数优化（F10 候选）【已闭合 2026-08-29 本任务】

- 证据（2026-08-29 v10 差分）：编辑器把常量初始值直接放在 Get Local Variable 的 R<T> pin 上
  （Get 节点自带 Default(0)）；我方编译器 initLocalVariable(type, init) 编译为 get(empty)+set(init)，
  常量 init 会多一个 Set 节点（定义注释：该模式是为动态 init 防重复求值）。
- 落地（M2）：`src/definitions/nodes.ts` `initLocalVariable` 运行时对字面量 init（value 实例
  metadata.kind==='literal'）直接作为 Get InParam[0] 初始值（每常量 init 省 1 个 Set 节点）；
  动态 init（pin ref/复合输出）保持 get+set 防重复求值。折叠后 Get bool true 内层保留
  alreadySetVal + OutParam[1] 类型默认锚，与批次 7 编辑器实样逐字节一致。
- 回归：`tests/local_variable_list_literal_test.ts` Part D（Get 直带值 + 动态不漂移 + GIA hex）；
  三个 wire 回归 + 17 样本 verify 全 0 DIFF；批量编译 67 GIA 全过。

### O-2026-08-29-02 dict int key CLI 缺口【已闭合 2026-08-29 goal 第 1 轮】

- 证据：int key 支持其实已在代码（`dictKeyOf`+f13+marker keyBase=40），技能文档陈旧；混合键/混合值
  类型却静默生成畸形 wire（f503/f504 只取首 pair）——真缺口是校验。
- 结论：编辑器样本（after-dict-keytypes 新增变量11 等）字节级确认 marker (3,11)=56、f13 key 同构；
  `assertUniformDictPairs` fail closed 落地；回归 gil_level/custom_variables_full 通过。
- 剩余：dict 的 entity/guid/阵营/元件ID/配置ID 键无真实样本（编辑器中编辑器允许与否未验）；编辑器/游戏核验待用户。

### O-2026-08-28-05 parse/explain 工具把客户端图节点错标成服务端 API 名【已闭合 2026-08-29 元复盘修复】

- 证据：魔方-客户端优化版本.gil（SHA f90ac5438c…）客户端图 1082130436（type=20010）191 节点全错标：
  多分支→"Set Custom Variable Dict Str List Int"、节点图开始→"Set Custom Variable Dict Str List Bool"、
  获取自定义变量→"When Custom Variable Changes …"。
- 修复：tools/parse-gil-node-graph.ts describeNode 按 graph.Id.type 分流——非 20000 图优先查
  client_node_metadata.ts 的 genericId→displayName（命中 297 个 id，200042→节点图开始、200016→获取
  自定义变量、200082→获取局部变量等已验证），未收录节点输出中性占位 `客户端API#<gid>`，不再落错
  服务端条目；explain 复用 parse 的解析自动生效。
- 验证：服务端样本 cube-e1-base.gil 回归无变化（42 节点名与修复前一致，type=20000 路径未动）；
  explain 同一样本输出正常；**真实客户端图复核通过（2026-08-29）**——
  `Beyond_Local_Save_Level/1073741913.gil`（魔方-客户端优化版本，SHA 496e1b5d…）图 1082130436
  （type=20010，191 节点）`parse --json` 实测：多分支×26 / 设置局部变量×38 / 获取局部变量×22 /
  获取自定义变量×8 / 双分支×7，服务端错名数=0、中性占位=0——与 08-28 复盘手工重映射结果完全一致。
- 残余：无（本轮实测 191 节点全部命中 displayName，含信号节点）。若未来新增客户端节点元数据缺口，
  对照 client_zh_aliases.ts / 日志上下文补映射（技能 Step 2.8 保留手工脚本作后备）。

### O-2026-08-28-06 客户端「遍历实体列表」out_flow[0]/[1] 语义未闭合【已闭合 2026-08-28 日志 2979 实证】

- 结论：遍历实体列表 out_flow[0]=**完成**（循环后一次，发信号 1 次）/ [1]=**每次**（每元素，26 块
  各加一次单位状态），与有限循环（0=循环体/1=完成）相反。
- 证据：日志 2026-08-28_23-15-38_2979 rec2 整体旋转 1438 帧：n=4 遍历实体列表 27 帧（26 块+1 完成）、
  添加单位状态 26 帧（Entity=5..30 各一）、向服务器发信号 1 帧（IN0=旋转时长 0.5 等 6 参数）。
  已固化进 gil-node-graph-reading 技能 Step 2.8-4 与 debug-log-format.md 客户端日志章节。

### O-2026-08-28-08 客户端图读法待录入 PKC【已闭合 2026-08-28 第二轮 bundle 应用】

- 已录：bundle bnd_9bf56357567e299b1b291865c6（content_hash
  9bf56357567e299b1b291865c69c02ab79996672e1a3b793e835acde8fc59b83）审批应用成功——
  新 topic knowledge/game-engine-knowledge/client-server-call-chain.md + claim
  clm_D1A208295BD4F1E3FE（服务端调用客户端节点图全链路，含客户端图识别/错标名重映射/
  角色操控技能触发链，fact-class external_game_evidence；验证：claims 329→330 通过）。
- 复盘：retrospective-2026-08-28-client-server-call-chain.md（第二轮）。

### O-2026-08-28-07 玩家-界面图 n=62 计数链执行流入口读不到【已闭合 2026-08-28 日志 2979 实证=死链】

- 结论：n=62 List Iteration Loop（head=0x3e）在会话 2979 全部玩家-界面记录（rec0/1/29/57-59/202）
  中 0 帧——**编辑器遗留死链**，不是信号触发后运行；玩家界面图监听信号 n=88 也无执行出边（同死）。
- 佐证：运动完成计数实际由「选中状态」图（1073741852，When Unit Status Changes/Ends，日志 rec3-28
  每块各一条 780B 记录）承担，n=62 链无需执行。
- 建议：后续编辑该地图时可清理 n=62 链（先备份快照，按 gil-node-graph-editing 安全流程）。

### O-2026-08-27-04 求解执行器定时器叠加（同秒 3 面转，2931 实测）【已闭合 2026-08-27】

- 证据：2931 日志 sec454 内 rec93/97/101 三个完整面转（89KB×3）同秒连续执行，无 emitTick 1.52s 间隔——节拍失控。
- 结论：solveBuf 清空修复（abd3673）后用户游戏复测通过（第一层可完成、不再循环）——同秒 3 面转是残留 moveId 导致序列错乱/重算风暴的次生现象，随根因修复消失。
- 状态：✅ 闭合（用户游戏验证）；若未来节拍异常复发，再按执行器防重入方向排查。

### O-2026-08-27-05 solve_len=16 但有效 moveId 少于 16（solverAppendCode sl 表达式二次物化候选）【已闭合 2026-08-27】

- 证据：2931 solve_seq 发布 solve_len=16 但前 16 个值混入 8 个残留 -1；0403 执行序列中无对应 8 连 -1 展开。
- 结论：solve_len=16 是残留值参与 solveLen 累加的次生现象（新宏追加步数少于旧序列时 solveLen 基于旧残留继续累加）；solveBuf 清空后用户复测通过。
- 状态：✅ 闭合（用户游戏验证）。

### O-2026-08-27-06 solverCornerMask 的 c4..c7 输入参数未使用（hardcode 4/5/6/7）

- 证据：solverCore.ts solverCornerMask 的 build 内 bit() 硬编码 4n/5n/6n/7n，c4..c7 输入未引用。
- 影响：当前调用方固定传 4/5/6/7，功能正常；属代码质量/误导风险。
- 何时做：下次 solverCore 改动窗口顺手清理。

### O-2026-08-27-07 solverEPlan（中二层 stage 3）待用户游戏复测【修复已注入，待复测】

- 证据：日志 2944 死循环（solverEPlan 缺 CF_MOVE_CODE_* → 追加全失败 → solveLen=0 → solver 空序列）；修复 60222d7 注入 ok 7 fail 0 + resync md5 367ad52a。
- 期望形态：打乱→自动还原→E 层真正转动并逐步归位（每步 ~3.2s，E 层 ~2.5 分钟），最终 plan-done。
- 何时做：用户复测；复测通过后闭合并更新 PROGRESS/复盘。

### O-2026-08-27-08 全 0 int_list 图变量短物化长度机制未解释（2/3/25 项各异）

- 证据：历史实证 cornerOrient=2/edgeOrient=3；本次 solveBuf 声明 100 项全 0 被物化成 25 项（日志 2944 pStep4 完成帧 [0×25]，写 0..99 后仍 25 项）。
- 影响：越界写被静默丢弃；已用尾部哨兵 1n 规避（与 seo/sco 同模式），但「长度由什么决定」仍开放。
- **进展（2026-08-29 差分实验 v1）**：编辑器 int_list 声明 wire 已闭合——列表长度 = f109 元素记录条数，
  全 0 列表也逐元素写独立 VarBase（payload 空）；我方生产编码旧形态（元素 alreadySetVal=1 +
  itemType.kind=0 + 显式 val=0）已归一化为编辑器形态，GraphVariable 记录与样本 1668 hex 逐字节一致
  （`tests/graph_variable_int_list_editor_wire_test.ts` + variables.md 新节）。
  **待用户游戏内核验**：编码对齐后「全 0 短物化」是否消失；不消失则机制在引擎运行时侧，哨兵模式继续。
- 何时做：用户实机复测（声明 int50 → 读第 49 下标是否越界）。

### O-2026-08-27-09 solverEPlan 与 solverPlan 同实体同名图变量建议 e 前缀隔离

- 证据：日志 2944 实证图变量按图隔离（solverPlan phase 恒 0 未被 solverEPlan 串改），当前无功能冲突；但 14 个同名变量（solveBuf/sep/seo/phase/pStep/…）有编辑器编辑/引擎版本变化风险。
- 期望形态：solverEPlan 变量改 e 前缀（eSolveBuf/eSep/eSeo/ePhase/…），或至少 solveBuf/phase 关键项。
- 何时做：下次 solverEPlan 改动窗口（避免单独为改名字重启验证链）。

### O-2026-08-27-01 编译器 optimize_timer_dispatch 有 default 分支的 >10 case dispatch 不 chunking → 静默截断【已修复 2026-08-30】

- 证据（2026-08-27 3×3 整转回归）：src/compiler/ir_to_gia_transform/optimize_timer_dispatch.ts 的
  parseMultipleBranchesDispatch 遇到 next sourceIndex=0（default 分支）返回 null → 跳过 chunking；
  有 default 的 multipleBranches 超过 10 命名 case 时原样进 GIA，被引擎 Multiple Branches 节点
  （上限 10 命名 case + 1 default）截断，第 11/12 个 case 分支体变孤立执行链，无编译/注入报错。
  日志 2927 实锤（orbit22/orbit23 → default 空操作）。
- 落地（2026-08-30，提交 4298282 + e00bf6b）：parseMultipleBranchesDispatch 允许唯一 default 边
  （source_index=0）；chunking 时 default 保留在首 chunk（buildDispatch 先写 source_index=0 边）；
  有 default 的 dispatch 不参与多 dispatch 合并（default 语义唯一，避免合并丢分支）。
  回归 tests/timer_dispatch_default_chunk_test.ts 4 场景 PASS（12 case+default 分块无截断 /
  两 default dispatch 不合并 / 无 default 合并保持 / 11 case 无 default 分块保持）。
- 剩余：真实地图（rubik-3x3 整转 orbit22/23 场景）注入核验待做。

### 2026-08-25 PKC 双 UI bundle 生命周期已 applied、主库 authority 未同步（待治理 apply）

- 证据：`python tools/pkc.py bundle-status` 显示 `bnd_653120d3a0906059bbd5835820` / `bnd_d9f9975041799b355db4d4d896` 为 applied；但主库 `data/knowledge/registry.json` / `authority-refs.json` 不含其 `clm_EB75B5FADE88856C52F62DE148` / `aref_e1c878c0ae99d453936294fccb`（UI clone 含）。
- 期望：用 PKC `bundle-apply`（先 dry-run，L3 经用户确认 content_hash）或 `bundle-recover` 把两 bundle 的 claim/ref 应用到主库，禁止直接改 JSON。
- 何时做：本次 UI 合并收尾时，与 fixture golden 一起处理（用户已选 A）。

### 2026-08-23 长期记忆复盘（本次 LTM review，范围=只审 genshin-ts 主战场）

- git 未落盘积压（genshin-ts，最高优先）：13+ 个 src/ 修改、3 个 docs/game-engine-knowledge/retrospective-2026-08-21-*.md、data/knowledge/bundles/bnd_a1fc4455* 与 bnd_fab275183*.json、examples/rubik-3x3/、cube-replica-c4/、football/evidence/ 均为 modified/untracked（证据：git status --short，08-23 复盘）。期望形态：活跃会话按小点主动提交（AGENTS.md 已授权）；bundle 数据文件与 .approval/.applied 一并提交。何时做：各活跃会话收尾时。
- git 未落盘积压（genshin-ts-ui，最高优先）：src/cli 修改 + untracked retrospective-2026-08-21-football-field-arcs.md / orientation-table-convention.md / terrain-grass.md + resources/first-save-template.gil + examples/football/ 与 ui-interact-test/ + 已删除 assets/images/guide-arrow-right.css（证据：git status --short）。期望形态/何时做：同上。
- 忆侧纪律缺口（触发太晚，非内容缺口）：Sa296f579 在 08-22 12:20 前实际 PKC/历史检索 = 0，用户两度提醒（12:20 写知识树、12:42 搜历史会话找定稿方案）才触发；知识树已有 节点<3000拒载/预算公式。期望形态：验证 AGENTS.md 检索优先级真的在任务中被第一动作执行，不重复加知识。何时做：下一轮复盘看 卡住第一动作是否检索 指标。
- 量化工具跨项目 bug（本轮不动 hub，仅登记）：portable-knowledge/tools/memory-health-report.py 调用 pkc query ... --status any，rc5 CLI 报 unrecognized arguments: --status，一键健康报告不可用。期望形态：在枢纽修正 --status 调用。何时做：hub 维护窗口。

### O2. `build_fixture.ts` 的 def name 形状（f5）与 `exportStaticAssemblies`（f6.f11.f1）不符

- 证据：eval-tabbar-cli trace L50845（exported count 0）→ L53722（复制 buildMiniMap 60+ 行）；fixture 只服务 plan 类测试所以没暴露。
- 期望形态：修 fixture 的 name 字段到 f6 或抽共享 buildMiniMap helper。
- 何时做：下次回读/export 类测试需要 fixture 时。

### O3. evaluate.py 派活默认给子代理加 edit 工具

- 证据：eval-tabbar-cli 13 处源码编辑全走 python3 heredoc（无 edit 工具），/tmp 脚本 patch 坏 2 次；评估类任务保持 read,bash。
- 何时做：下次派活前改 evaluate.py 的 --tools 默认值。

### O4. `npx tsx -e` 不可用（输出 tsx register 包乱码），探针脚本必须写 /tmp/*.mts 再跑

- 证据：eval-tabbar-cli trace L32112。
- 期望形态：技能/任务文件注记。
- 何时做：下次派活任务文件模板加一行。

### O5. 注入器 merge 复合定义不清理残留 → 类型错位拒载（fail-closed 治本）

- 证据（2026-08-20 魔方注入事故）：`src/injector/index.ts` mergeWrappedFieldMessages 合并复合定义只覆盖同 ID、
  不删除地图残留旧 def；删除/新增复合使 defineComposite 按定义顺序分配的 ID 前移，残留 def（如 gsts_in_layer）
  引用被覆盖的 ID（现为 orbit_scheduler）→ 类型错位 → 游戏拒载（加载期无日志）。备份
  `.gsts/backups/1073741882.gil.2026-08-20.broken-pre-inject.bak`、当前修复 `ed645c0a`。
- 已落流程层防线：`tools/check-gil-composite-refs.ts`（注入后必跑，gil-node-graph-reading Step 3.5）。
- 治本候选（二选一或都做）：① 注入器 merge 后对残留 def 做**类型校验**（impl 调用参数类型 vs 目标 def 接口），
  不匹配即报错拒注入；② 编译器保留未调用 defineComposite 定义（不剔除）→ GIA 恒全量 → merge 全覆盖无残留。
- 何时做：下次注入器/编译器改动窗口；改注入器需 tests/injector 回归 + 真实地图注入核验。


### O1. GIA 解析/编码无独立 CLI（已由 genshin-model-studio 覆盖，登记为指针）

- 证据：`/tmp/gms-eval-b/trace.jsonl`——子代理 100 次手写脚本自建 parser；结论已落入 `/home/h/genshin-model-studio/docs/gia-format.md` + `src/gia/`。
- 期望形态：genshin-ts 内如需解析 .gia，复用 genshin-model-studio/src/gia/。
- 何时做：出现 genshin-ts 内部 GIA 解析需求时（目前无）。

### O2. 图变量跨图复制仍是临时脚本

- 证据：`gil-node-graph-editing/SKILL.md` 已标注"图变量跨图复制仍是临时脚本（f6 记录搬移）"。
- 期望形态：`node-copy-from` 扩展支持 graph variables，或技能给出可复制的 f6 搬移模板。
- 何时做：再次出现跨图复制图变量需求时（turn-ctl 已用过一次）。

### O3. 等角螺线 V11.1 动态放大/少转一圈未定稿

- 证据：`/tmp/spiral-v12-eval/` + 会话 019fef2f 用户反馈（三角形突出、内圈凸起）。
- 期望形态：用户重新分析结论闭合后，补入 `curve-path-decoration.md` 的 V11.1 小节（当前已标注"未定稿"）。
- 何时做：用户给出下一轮反馈并核验通过后。

### O-2026-08-16-1. DSH 环境 write 工具与 bash 沙箱的 /tmp 不同视图

- 证据：2026-08-16 用 write 工具创建 `/tmp/probe-components.mts` 返回成功，但 bash `ls /tmp` 不可见、
  无法执行；改用 bash heredoc 写 /tmp 后正常（与协作手册 A5"不跨 bash 持久"叠加，探针脚本必须
  单调用内完成或落仓库/证据目录）。
- 期望形态：DSH 环境技能注记（探针/临时脚本用 bash heredoc 写 /tmp，或直接写证据目录；
  跨调用数据放 `~/genshin-ts-evidence/`）。
- 何时做：下次 DSH 会话写探针脚本前。

### O-2026-08-16-2. U1 跨图信号投递未验证（第二 demo 架构命门）

- 证据：S4 测评（eval-s4-signal-puzzle/final.md U1）——2698 日志只验证了**同图内**
  send→onSignal；信号在"图 A 发送、图 B 监听"的跨图投递从未游戏验证；signals.md"监听信号
  实际触发及参数值的游戏行为"仍标"尚未闭合"。
- 进度（2026-08-16）：差分 case 已备好并编译通过——`verify/u1-cross-graph/send.ts`（图 1833，
  whenTabIsSelected→sendSignal verify_ping2）与 `recv.ts`（图 1832，onSignal→print ×4）；
  GIA wire 断言通过（send=1610612744 / monitor=1610612745 与注册表精确一致，参数字面量
  ping-u1/tag-u1 在位）。
- 期望形态：注入验证地图 1073741888（2 个 placeholder 图 → 逐图注入 → attach 实体 1077936151
  → 用户游戏核验 → 日志判定：`u1-send-fire` + `u1-recv-msg/ping-u1/u1-recv-tag/tag-u1` 全现 =
  跨图成立；只有 send 无 recv = 不成立，第二 demo 降级单图信号链并明示用户）。
- **已核验通过（2026-08-16，2699 日志）**：跨图投递成立——图 1830 send 5 次，图 1831 与
  1828 均收到且参数完整（ping-u1/tag-u1）；信号广播到所有监听图。证据
  `~/genshin-ts-evidence/u1-u2-verify/`（SHA ac82e67a…）；signals.md 尚未闭合条目已闭合；
  verified-cases.md 已登记。

### O-2026-08-16-3. PKC progressive-query 可用 context 清单未文档化

- 证据：S4 测评子代理对任意 --context 报 `RETRIEVAL_CONTEXT_UNKNOWN` 后绕路 knowledge-search
  （tool 报告 + 主会话复验：仅 compiler-diagnostics 等注册 context 可用，报错不提示候选列表）。
- 期望形态：documentation-map 或 pkc 帮助补"已注册 context 清单"；progressive-query 报错时
  枚举可用 context。
- 何时做：下次文档/工具维护轮。

### O-2026-08-16-4. 测评 --assert-no-changes 与主会话并行写互相污染

- 证据：eval-s4 运行期间主会话并行编辑 docs/roadmap.md、PROGRESS.md 并 finalize PKC bundle
  （data/knowledge/bundles/bnd_bbda2fb9…json）→ 断言 no_workspace_changes 失败，changed 全为
  主会话产物（子代理 0 工具错误、纯只读，报告已核）。
- 期望形态：评估运行期间主会话暂停工作树写操作，或 evaluate.py 用 --exclude 排除已知变动路径 /
  独立 worktree。
- 何时做：下次跑 --assert-no-changes 评估前。

### O-2026-08-16-5. DSH 环境 CLI 自动语言检测失败（Invalid language tag: C）

- 证据：2026-08-16 本会话多次复现——`gsts assets:mounts list`、`assets:signals inspect`、
  编译均先报 `[error] Invalid language tag: C`，加 `--lang zh-CN` 后正常（auto 检测在 DSH
  bash 沙箱 locale 下失效）。
- 期望形态：DSH 环境技能/协作手册注记"gsts 命令一律显式 --lang zh-CN"。
- 何时做：下次 DSH 会话跑 gsts 命令前。

### O-2026-08-16-6. 普通场景实体 type 1 自定义变量无 CLI 写入口（灯阵设计直接障碍）

- 证据：S5 第二轮测评（eval-s4-r2/final.md T2）——`staticAssemblies[].components` 仅支持
  basicMotion(4)/followMotion(9)/tabBar(17)；`assets:entities import` 不支持组件；
  `assets:custom-variables` 只覆盖玩家/CustomPrefab/角色初始变量；**普通场景实体上的
  自定义变量组件（type 1）无 CLI 写入口**（源码 gil_static_assemblies/gil_entities/
  gil_custom_variables 复核确认）。
- 期望形态：CLI 新增普通实体 type 1 组件写入口（GIL 资产槽编码已有编辑器样本证据）或
  灯阵设计改为不依赖实体变量（信号参数携带状态，eval 已给出规避设计）。
- 何时做：第二 demo 立项后按需求决定；M4 编译器快速迭代候选。

### O-2026-08-16-7. signals.md 候选"注册布局池"段落未落地

- 证据：S5 第二轮测评（eval-s4-r2/final.md T6）——signals.md 尾部有一份 2026-08-11
  eval-split 建议的"候选：注册布局池"追加段落（同类型参数每出现一次须消费一套真实且不同
  布局，套数不足 fail-closed），未并入正式章节。
- 期望形态：决定并入正式章节或标注废弃。
- 何时做：下次信号相关文档维护轮。

### O-2026-08-16-8. gen 本地化节点级错配修复（M4 候选，根因已实证）

- 证据：2026-08-16 诊断（backlog §7.1 根因实证小节）——`sectionParameterShape` 排序扁平签名
  无法区分节点身份；英文 `Insert Value Into List`(3 参) 与中文"拼接列表"(2 参) 同处形状
  同构的 7 节点 section，按 index 错配注释；`Modify Value In List` 类在中文无对应节点时
  函数消失/被替换。诊断脚本：resources/node_definitions.json 只读比对。
- **生成器修复已完成（2026-08-16）**：matchLocalizedNode（名称映射全局搜索→sig rank→降级+warn）
  + resources/node_name_zh_map.json（489 官方 + 59 人工，含 10 条事件名）；nodes+events 双修复，
  完整 gen 0 报错；关键注释验证正确；events 漂移（事件参数清空/消失）同根因修复。
- **同步仍阻塞（用户决策项），已确认 4 处影响面**：① `modifyValueInList`→`setListValue`
  （GenericValue 单签名）——expr.ts（list[id]=v 降级）/zh_aliases/tests/generated 引用；
  ② `modifyGlobalTimer`→`increaseGlobalTimerValue`（参数变化）——Stage 1 timer 转换器 +
  tests/timer_global_overload_type_safety_test.ts 类型断言失败（恢复 definitions 后 tsc 回绿，
  归因已实证）；③ events 生成内容变化；④ 新定义全量 diff ~4700 行需审阅。
- **映射收敛完成（2026-08-16）**：85 条人工补全（含 10 事件名 + query/装备/商店/任务等），
  完整 gen **0 警告**——全部 406 节点 + 62 事件走名称映射配对，无 sig 兜底；
  修正 1 处误补（Aggro List→仇恨列表）。
- **同步第一层完成（2026-08-16，提交 7e752f4）**：生成器全家桶修复——mapType 容错
  （空串/unknown→generic、Emtity→entity）、payload 类型映射（str→string 等）、
  GenericValue/EnumerationValue 幂等导入补丁、映射表 2 处修正（Loot 装备/GUID 对调）。
  验证：gen + generate-zh-aliases.mjs 全链 0 错，nodes.ts 生成物自身类型 0 错。
- **同步中止（2026-08-16 决策）**：第二层排查发现**节点集差异阻塞**——新资源缺失
  modifyModelColorAndMaterial(835)、操控运动器系列、光标系列等**旧快照独有节点**
  （manual_verify 断言 30+ 处引用）；835 是灯阵变色玩法关键节点（U4 未验证），
  完全同步将删除其 DSL 支持 = 能力回退。**决策：保持 committed definitions，不同步**；
  生成器修复（第一层，7e752f4）独立保留（未来资源更新时 gen 产物正确性有保证）。
- **后续路径**：① 先做 U4 差分（835 游戏行为，灯阵前置）→ ② 若 835 有效，生成器加
  "保留节点清单"机制做受控同步（新资源 + 旧独有节点）→ ③ 若 835 无效，评估 308 替代。
- 第三层（expr.ts/timer 适配）随同步取消而取消（committed 定义不变，无需适配）。

### O-2026-08-16-9. U2 同图多实体挂载未验证（灯阵架构选项）

- 证据：S4 测评未知清单 U2——"同一节点图挂载到多个实体"从未游戏验证；知识库标注
  "节点图多实例运行时变量隔离未验证"；决定灯阵是"1 图×9 挂载"还是"9 份同源图"。
- 进度（2026-08-16）：case 已备好并编译通过——`verify/u2-multi-mount/u2-multi-mount.ts`
  （图 1834，whenEntityIsCreated→printString('u2-fire')）；GIA wire 断言通过
  （whenEntityIsCreated=genericId 71 + printString 字面量在位）；挂载计划：1077936151 +
  1086324737「默认模版」（编辑器自动补占位实体，position 2000 高处，与触发无关）。
- 期望形态：用户授权后注入验证地图 1073741888 → attach 两实体 → 游戏核验 →
  日志判定：u2-fire 出现 N 次（N=挂载数）= 多挂载各实例独立执行（灯阵可用 1 图×9 挂载）；
  1 次 = 仅首实体执行；0 次 = 未执行。图变量实例隔离为次要问题，可后续单独差分。
- **已核验通过（2026-08-16，2699 日志）**：u2-fire ×2（图 1832 在 1077936151 与
  1086324738 独立执行，rec0/rec9）——同图多实体挂载成立，灯阵可用 1 图×9 挂载。
- 备注：attach 目标是 1086324737，日志执行实体为 1086324738（默认模版同 def 实例，
  挂载共享/实例映射细节未深究，不影响结论）。

### O-2026-08-16-10. U4 变色差分（节点 835）已注入待核验

- 证据：M4 同步第二层发现新资源缺 835（modifyModelColorAndMaterial）等旧快照独有节点，
  同步会删除其 DSL 支持；835 是灯阵变色玩法关键节点。
- 进度（2026-08-16）：case `verify/u4-color-change/`（图 1835 DSL）编译 + wire 断言通过
  （genericId 307/835/1）；已注入验证地图 1073741888 图 1833 `_GSTS_u4-color-change`
  + attach 1077936151 + Temp 同步（SHA 3f3fd3c8…）；提交 b3b461d。
- **已核验（2026-08-16，2701 日志）**：**835 判定为无效节点 ID**——节点完整执行且参数
  全部正确（帧 IN3 Integer=16711680、IN4 Float=100.0、事件源实体正确、printString 触发）
  但游戏内无颜色变化；三重重证据（编辑器 data.json 无 835 / server 静态元数据无 835 /
  游戏执行无效果）→ 835 为旧快照错误遗产，**灯阵变色不可用 835，改用 308 显隐方案**
  （activate_disable_model_display，data.json 有官方定义）。证据
  `~/genshin-ts-evidence/u4-color-change/`（SHA 见该目录）。
- M4 同步影响：835 无效支持"新资源删除方向正确"，但操控运动器系列等其他旧独有节点
  仍待逐个验证，同步保持中止。
- **替代方案已核验（U4b，2702 日志）**：节点 308（activateDisableModelDisplay，官方
  Set_Model_Visible）**生效**——R 隐藏/L 重现（u4b-hide-fire ×1 + u4b-show-fire ×5）；
  灯阵明暗方案确定（亮=显示/暗=隐藏）；verified-cases.md 已登记。

### O-2026-08-16-11. SKELETON_AUX_ID=1073741828 占位符递归替换 bug（生产缺陷，M4 候选）→ DONE

- 证据：W1 候选回读（子代理 9d6603cb，2026-08-16）——配置 instanceAuxiliaryIds=[1073741828]
  时，候选 top27 field2（实例侧 aux）记录 ID 被改写为 def aux ID（1073741827），闭包
  incomplete（missing-instance-auxiliary）。
- 根因（源码定位）：src/cli/official_prefabs.ts 的 buildAuxiliaryRecord（实例侧）两步
  replaceVarint：先写 SKELETON_AUX_INSTANCE_ID(1829)→params.id(1828)，再递归替换
  SKELETON_AUX_ID(1828)→definitionAuxiliaryId(1827)——第二步把刚写入的 1828 也替换了。
- 影响：任何 instanceAuxiliaryIds 含 1073741828 的资产配置生成坏闭包。
- 修复方向：实例侧回链替换改用独立占位符/精确位置替换；短期规避：aux 避开 1073741828
  （灯阵已改用 1073741830，探针验证闭包 complete）。
- 落地（2026-08-15 commit ceb8fe6）：替换顺序反转——先 1828→definitionAuxiliaryId（f12
  回链），再 1829→params.id（f1），id=1828 不再被二次替换；tests/official_prefabs.ts 新增
  id=1828/1830 双场景回归（PASS）。附带修复：i18n detectLang 对 locale=C/POSIX 过滤+兜底
  en-US（修复 4 个 CLI 测试的环境性失败）；static-assembly 测试 fixture prefabId
  300→1077936139（prefab-id-out-of-range）、official_prefabs 实体 id 800→1077936150。

### O-2026-08-16-12. assets:entities patch 为单实体命令（--entities 仅 import）

- 证据：W2 派活（2026-08-16）主代理误用 `patch --entities <json>` 形态；子代理 9d6603cb
  读源码 assets_entities.ts 确认：`patch <entity-id> --position x,y,z` 为单实体操作，
  `--entities` 仅 import 专用。两次 patch 串联可改多实体。
- 影响：派活/文档中该命令形态需用单实体形式；灯阵实体位置调整已按正确形态完成
  （灯柱/灯头 → [5,0,5]/[5,0.95,5]，写回 SHA e09f6e2a…）。
- 何时做：下次 assets:entities 相关派活/文档维护时同步（production-workflow 或
  static-gil-model-builder 参考补命令形态）。

### O-2026-08-16-13. DSL 无法传实体字面量（entityLiteral IR=null）——编译器能力缺口

- 证据：游戏开发子代理（b914c930）三关实现 trace（2026-08-15）——尝试在 DSL 中引用指定实体
  （按 ID 获取/字面量），grep ir_builder/toIRLiteral/declaredGuid 多处后实测 entityLiteral IR=null；
  绕路：锁定/解锁全部由灯柱 self 完成，管理图纯信号编排。
- 影响：无法在节点图代码中定向引用场景实体，设计被逼用信号回执/self 模式。
- 方向：评估 DSL 增加实体字面量/按 GUID 引用能力，或文档明确限制 + 提供推荐模式。

### O-2026-08-16-14. 屏幕 UI 控件 CLI 无创建入口——编译器能力缺口

> 状态：已解决（2026-08-19 复核：`assets:ui create/clone/update/template` 已存在）。

- 原始证据：同 trace——当时查 ui-controls.md + src/cli/ui.ts 确认 CLI 无屏幕 UI 创建能力；
  用选项卡（tabBar）替代开始界面。
- 当前实现：`gsts assets:ui list|clone|create|update|template`（root9 文本框/交互按钮/自定义按钮），
  入口在 `src/cli/assets_ui.ts`，已收入 `genshin-ts-asset-operations` 技能。
- 仍待验证：UI 控件运行时显示/隐藏/禁用差异、按钮事件进角色、多人隔离；这些属于游戏行为验证，不是 CLI 缺口。

### O-2026-08-16-15. 注入覆盖陷阱：多图注入需分别建占位图——流程/技能缺口

- 证据：同 trace——四图（1073741825-28）逐图注入时发现注入互相覆盖，需分别建占位图+逐图注入。
- 影响：多图项目注入流程摩擦；技能未覆盖。
- 方向：gil-node-graph-editing/verify-injection 技能补"多图注入"章节。

### O-2026-08-16-16. setCustomVariable 类型变体规则（胜利 bug 根因，已文档化）

- 证据：同 trace（日志 2712）——number→float(cid=26)、bigint→int(cid=22)，读写变体分裂导致
  winCount 恒 1。
- 落地：docs/game-engine-knowledge/variable-scopes.md 已新增规则；待知识库录入（clm 待建）。

### O-2026-08-16-17. DSL 不支持数组 forEach/闭包循环——手写展开绕路（编译器能力缺口）

- 证据：游戏开发子代理 trace（t11.21/t11.37）——三关解锁需 activateDisableTab 50 个实体，
  想用 forEach/列表循环，确认"没有实体列表循环的现成简单方式/编译器可能不支持数组 forEach
  回调"后**手写展开 50 个调用**（"就 50 个吧"）。
- 影响：批量实体操作（解锁/禁用/批量设置）被迫手写展开，节点数爆炸（50 个节点 vs 1 循环）。
- 方向：评估 DSL 增加有限循环（finite loop 映射）/集合迭代支持，或文档明确"批量操作手写展开"
  并提供模板模式。

### O-2026-08-16-18. 无按 ID/定向实体查询 + 信号无定向投递——设计受限

- 证据：同 trace（t9.1/t9.18/t11.47）——"Get Entity by GUID 可能不存在"、"无法定向只能广播"、
  "activateDisableTab 需要实体 ID 引用（DSL 无法）"。
- 影响：胜利判定（查每灯状态）、关卡解锁（定向激活）都被逼用 self+广播/信号回执模式，图复杂度上升。
- 方向：评估 DSL 实体字面量/按 GUID 引用（O-13 同族）；信号定向投递需引擎能力调查（可能不支持，
  文档明确限制与推荐模式）。

### O-2026-08-16-19. 信号节点已连接 InParam 默认值规则（第 4 次信号错误根因，已修复+文档化+已录入知识树）

- 证据：三版本差分闭环（v3 我们注入/ v4 自动保存 / v5 用户修复）——发送信号节点 vec3 参数
  空 VectorBase 默认值 → 引擎"参数错误"拒载（级别极高无日志）；修复后 GIA 与用户修复版逐字段
  一致，游戏核验通过。
- 落地：src/compiler/ir_to_gia_transform/index.ts 修复（commit 0b52395）；signals.md 规则段 +
  retrospective-2026-08-16-signal-param-default.md 已写入；**已录入知识树（clm_168E839F，
  bundle bnd_303f3d8f，commit 26bdbee）**。
- 关联方法论：①"变更消失"先核对 hash（旧编辑器内存保存覆盖假象，v19 教训复发）
  ②加载期拒载错误不落 Beyond_Debug_Log，进不去游戏走三版本差分。
- 未闭合风险：客户端 send_signal_to_server_node_graph conn 参数默认载荷（client_graph.ts
  SIGNAL_PARAM_DEFAULT_BY_TYPE）从未端到端游戏验证，若引擎对客户端同样严格校验则存在同类风险。

### O-2026-08-16-20. 信号参数 n3 field2 序号规则（第 5 次信号错误根因，已修复+文档化+已录入知识树）

- 证据：三信号差分闭环（用户逐个重建 lamp_toggle/win_check/win_ack）——builtin 模板 n3 field2
  沿用历史样本常量（vec3=2/int=0/entity=1…）→ 参数序号错位 → 引擎拒载；str/int 单参数
  field2=0 恰好正确，掩盖 bug 至第 5 次才暴露。
- 规则：n3 field2 = 参数在信号内全局序号（send/server = 序号 0 省略；monitor = 3 + 序号）。
- 落地：src/cli/gil_signal_registrations.ts rewriteParamN3Field2（commit 9e8fd76）；
  signals.md 规则段 + retrospective-2026-08-16-signal-registration-series.md 已写入；
  **已录入知识树（clm_ABB786BA，bundle bnd_303f3d8f，commit 26bdbee）**。
- 系统性教训：①从样本抄字节必须提炼语义规律 ②静态检查 ≠ 引擎校验，需编辑器重建样本对照
  ③一次修复不能靠用户手工中间产物掩盖下一个 bug，修复后必须用生产工具独立跑全链路。

### O-2026-08-17-01. assets:entities import 缺编辑器“未分类页签”文件夹记录（root 6）

- 证据：2026-08-17 CLI 场景实体创建对比（地图 1073741892/1073741893）——CLI `assets:entities import`
  创建实体后 root 6 只登记实体组条目；编辑器首次保存会追加一条 31B 文件夹记录
  `{f2={f1='root',f3=1}, f3={f1='未分类页签',f3=2}}`（root6 直接子记录）。
- 影响：CLI 写回后编辑器首次保存会补这条记录；游戏/编辑器当前可正常打开，不影响加载，
  但 CLI 与编辑器“首次保存后状态”不完全一致。
- 方向：评估 `assets:entities import` 在 root 6 补写该文件夹记录（需确认是否会影响编辑器列表/分类语义）。

### O-2026-08-20-1. root46 语义未闭合（CLI create --static 不写 root46）

- 证据：2026-08-20 五个样本（圆柱转换/三棱锥/木质花圃/球体切静态/放置实体）——每次元件/实体操作
  root46 +1 或替换最新条（总数 1→4 后稳定）；条目 {f1, f2}，f1 非单调（球体 720578525 < 三棱锥
  720580506）、f2 高 16 位恒 0x46E7 低 16 位无规律；CLI `create --static` 未写 root46。
- 判别：编辑器是否识别无 root46 的 CLI 元件——用户重载 1073741896 看 CLI 圆柱 1077936141
  是否显示；若显示则 root46 与识别无关，CLI 可永久 fail-closed。
- 期望形态：闭合 root46 分配规则后 CLI 补写（或确认 fail-closed 安全并文档标注）。
- 何时做：用户重载 1073741896 核验后。

### O-2026-08-20-2. "带装饰物的元件+定义"一键创建未实现

- 证据：用户新增"带装饰物的元件+定义"（after-prefab-with-aux）：定义 1077936186 f501=[def aux]、
  模型 1077936182 f501=[inst aux 回链 def]。当前 CLI 需两步：`create` 定义 + `assets:aux attach` 定义；
  create 动态也不建页面模型（编辑器保存时才补）。
- 期望形态：`assets:prefabs create --aux <resId>` 一键生成 定义+模型+装饰物组（或 create 补建模型）。
- 何时做：下一轮 CLI 迭代。

### O-2026-08-20-3. 多出口执行流节点（finiteLoop/doubleBranch/multipleBranches）分支体入口写法不优雅，编译器待支持更自然写法

- 证据：2026-08-20 3×3 魔方日志 2763/2765——`finiteLoop` 循环体入口和 `f.doubleBranch` 分支体内
  第一个 exec 节点用 `f.node()` 会 detached 不执行（循环体写入帧 0、分支 Set 帧 0、胜利误判）。
  当前可靠写法必须用 `f.registerExecNode(...)` 或显式 `f.link`/`f.connect`，对使用者不直观。
- 期望形态：编译器/DSL 让 `f.node()` 在 `finiteLoop` 循环体、`doubleBranch`/`multipleBranches`
  分支回调内自动成为该出口的入口节点（自动挂 OutFlow/InFlow），或在类型层强制报错提示用
  `f.registerExecNode`。
- 何时做：下一轮编译器/DSL 迭代。

### O-2026-08-20-4. 不稳定 exec API 组合待弃用/编译器提供稳定封装

- 证据：2026-08-20 3×3 魔方连续两轮回归——①公共 done 用 `f.registerExecNode` 放在 `doubleBranch`
  前导致执行流死循环（游戏检测 execution flow loop）；②`f.callComposite` 后跟 `f.registerExecNode`
  （start_timer）因 auto-chain 多拉一条入边，同一节点执行两次、定时器不触发、指令无反应（日志 2777）。
- 根因：`f.registerExecNode` 同时承担“自动接进当前执行链”和“创建普通 exec 节点”两个语义，和显式
  `f.connect` 混用时会产生重复入边/循环；`f.node` 是 detached，但作为分支/循环体首节点又不会自动挂链，
  两个 API 的边界对使用者不友好。
- 期望形态：编译器/DSL 收敛为一套稳定 API，例如：
  - `f.registerExecNode` 只用于“当前执行链的下一个节点”（自动接链）；
  - `f.node` 只用于“detached 节点 + 显式 connect”；
  - 新增/改进高层 API（如 `f.after(...)` / `f.merge(...)`）让公共 done、链尾节点不再需要手写
    `f.node` + `f.connect` 的脆弱组合。
- 当前落地：dsl-nodegraph-development 技能已加入“推荐稳定 API / 待弃用 API”表，新代码按稳定写法；
  旧代码逐步迁移。
- 何时做：下一轮编译器/DSL API 迭代。

### O-2026-08-20-5. 编译器需支持复合节点“定义/调用/实现”三要素的 ID 稳定性与残留清理

- 证据：2026-08-21 尝试“新建视觉调度节点图”拆分逻辑时，新增/移动复合定义导致后续复合 ID 前移，
  `check-gil-composite-refs` 报告残留 `flow_tab_dispatch` 引用的 ID 被本次注入覆盖（可能类型错位/游戏拒载）。
- 用户明确：复合节点有三个要点——1. 定义 2. 调用 3. 实现；编译器需要支持解决这个问题。
- 期望形态：编译器/注入器对复合定义分配稳定 ID（不因新增/删除/移动定义而前移），或提供残留 def 自动清理/
  类型校验，使“新增节点图拆分逻辑”成为安全操作。
- 当前落地：已回滚到稳定版（主图 2741 <3000，仅主图挂载）；新图拆分方案暂缓，待编译器支持后再实施。
- 何时做：下一轮编译器/注入器迭代。

#### 设计要点（2026-08-21 补充）

- 复合定义 ID 建议改为基于“定义名 + 文件顺序 hash”的稳定 ID，或维护显式 ID 映射表；
- 删除定义时写入 tombstone（`_deprecated` 桩），不释放 ID，避免后续定义前移；
- 注入器在写入新 def 集合时，对地图残留 def 做“未引用且 ID 被覆盖”检测并自动隔离/清理；
- `check-gil-composite-refs` 增加 `--clean` 候选模式，输出可安全移除的残留 def 清单。

#### 进展（2026-08-21 Round 4）

- 已实现 `g.defineComposite` 的 `id` 可选参数；现有玩法复合已全部显式锁定 ID。
- 这解决了“定义顺序变化导致 ID 前移”的一半问题；剩余仍需“残留 def 自动清理”以安全移除旧 def（如 viewOrbitTrigger 在拆分后不再被主图调用时）。

#### 进展（2026-08-21 Round 6）

- 已实现“未调用显式 ID 复合输出空 stub”的编译器策略，配合显式 ID 后，新图拆分不再产生残留 def 引用被覆盖错误。
- `check-gil-composite-refs` 对旧 viewOrbitTrigger 等 def 现在报告“死代码，无害”。
- 新图拆分已在魔方地图落地：主图 1990 / 视觉图 1220，均 <3000。

#### 新发现（2026-08-21 Round 9）

- visual GIA 中未调用但被间接引用（view.ts → flow.ts）的复合，会被编译器自动生成占位 def，ID 变成 `2000000000+`（graphId `2000010000+`），而不是显式 ID `1610700000+`。
- 这是“stub 覆盖 full def”方案失败的根因：stub 的 ID 命名空间与 full def 不一致，注入器无法按 ID 合并。
- 需要编译器在生成占位 def 时保留显式 ID，或禁止生成这种占位 def。

#### 进展（2026-08-21 Round 10）

- 已用编辑器最小差分闭合“删除复合定义”的 wire 规则：用户新增仅定义无调用的 `打印`（id 1610612737）→ 保存快照 `a74c437d…`；用户再删除 → 保存快照 `abf2891c…`。
- 结构 diff 结论：删除 = 移除 root10 section2 的 CompositeDef 记录 + section4 的 impl 图记录；root46 条目变化是保存副作用，不模拟（已写入 `docs/game-engine-knowledge/gil-structure-semantics.md`）。
- 已实现 `gsts assets:node-graphs def-clean`：支持 `<id|name>` 或 `--all-unused`，`--dry-run`（默认）/`--output`/`--write`，`--include-system`，`--force`；有调用者时默认拒绝，避免悬空引用。
- 验证：`def-clean 1610612737 --output` 从添加态快照产出与编辑器删除态同尺寸/同 def 集合（仅 root46 保存副作用不同）；`--all-unused --dry-run` 在当前地图默认跳过系统信号复合，`--include-system` 可列出未使用的 `1610612743 向服务器节点图发送信号`。
- 遗留：`view_orbit_trigger` 当前仍被主图 n7 调用，`def-clean` 会拒绝删除；若确需清理需先移除该调用或确认 `--force` 的悬空风险。

#### 进展（2026-08-21 Round 11）

- 用户提供“修改已弃用复合定义”的编辑器差分：`view_orbit_trigger`（1610700029）改名 `view_orbit_trigger——2` + impl 图新增 Print String 节点（n1，接到 When Timer Is Triggered 的 OutFlow[0]）。
- 结构 diff 结论：修改定义只动 root10 section2 的 def 记录（field200 name）+ section4 的 impl 图记录（新增节点/连线）；root46 为保存副作用。
- 已实现编译器 `forceFull` 选项：`g.defineComposite(name, { id, forceFull: true, build })`——即使该复合未被任何图调用，也随 GIA 输出完整 impl（不再只是空 stub），从而让注入器用 full def 覆盖地图残留旧 def，支持“修改已弃用复合定义”。
- 实现位置：`src/runtime/composite_registry.ts`（`forceFull` 存储）、`src/runtime/core.ts`（`forceFullIds` 加入 expandedIds）。
- 验证：`tests/composite/force-full-test.ts` 断言 forceFull 未调用复合输出 2 节点 full，普通未调用复合仍为 0 节点 stub。
- 使用方式：在需要更新地图旧 def 的复合定义上加 `forceFull: true`，重新编译注入即可。

### O-2026-08-21-1. 球场线弧段数（折线感）与角球区小弧未做

- 真实足球球场（地图 1073741901）第一版：中圈 32 段、罚球弧 16 段折线逼近圆弧，用户核验通过未反馈折线感。
- 未闭合/可选：① 若放大看弧线有棱角，可增段数（中圈 32→48、罚球弧 16→24），弦高 ≈ R(1−cos(Δθ/2))，16 段/9.15m 半径弦高约 0.28m；② 四角角球区小弧（半径 1m 的四分之一圆）第一版从简未画，需时用 calibration-and-geometry.md「圆弧折线逼近与切线旋转」节同公式，端点由边线/底线交点约束。
- 证据：`~/genshin-ts-evidence/static-assembly/football-real-v1/`、`examples/football/assets/plans/gen-field.mjs`。

### O-2026-08-21-2. 足球升级4全开闭包含展示底座（y=-4.2 托盘）埋地

- 导入的「足球·升级4全开」(224 items) 闭包含一个展示底座 item（position y=-4.2、scale 1.6×0.4×1.6，颜色 0x9AA0A8），实体 scale 0.25 后底座埋入地下约 0.8m，不可见但随球移动。
- 影响：无害（埋地不可见），但若后续要给足球做物理/踢球逻辑或整体缩放，底座会随动；若要移除需记录级 patch 三侧 aux 的该 item（def/prefab-inst/scene-entity）。
- 证据：`examples/football/evidence/` export 回读 item 索引（min-y item）。

### O-2026-08-21-3. P0-1 analytic blockOrient 增量维护待游戏核验

- 实现：`logicApplyFace/Middle/Whole` 在写回位置/朝向时同步写 `blockOrient[piece] = moveOrientTransition[moveId][oldOrient]`。
- `flowAfterTurn` 删除 `flowUpdateOrient` 物理回读，新增 `blockOrientPre = blockOrient` 同步。
- 待核验：游戏内旋转行为是否正常（无黑面/错位），负载是否有明显下降。
- 若核验通过：关闭本项；记录验证日志 SHA 和结论到复盘文档。
- 若失败：回退 P0-1，或改用 `flowUpdateOrientAnalytic`（保留 `flowAfterTurn` 中的循环，但用 analytic 表代替物理回读）。

### O-2026-08-21-4. check-gil-composite-refs --incoming 把信号定义单元误报为「复合缺失」【已修复 2026-08-30】

- `check-gil-composite-refs.ts --incoming <gia>` 的 incoming 对比把 GIA 中 which=12（监听信号）/14（发送信号/向服务器发送信号）的定义单元也收进 incomingIds，与复合 impl 图区间（161070xxxx）对比 → 报「GIA 复合 xxx 注入后在地图中缺失」。
- 本轮实证：3×3 注入（map 1073741899）报 1610612741/42/43 三个「缺失」，实为信号定义单元（`发送信号`/`监听信号`/`向服务器节点图发送信号`，class=10001），地图中信号 `rubik3x3_tab` 注册正常（scan-gil-signals：发送2/监听1），属工具误报。
- 落地（2026-08-30，提交 89ba917）：实测 unit.which 与 def.class 均无法区分信号单元（监听信号 which=12 同复合、class 全 10001），**id 区间是唯一可靠判据**——incoming 收集排除内置 SysGraph 信号区间（1610612736~1610700000）；mapIds 扩展覆盖默认命名空间区间（2000000000+，football motion_by_vel 等同族误报一并修）。验证：rubik-3x3 --incoming 0 误报；football 只剩真实版本不一致报错。
- 证据：`tools/check-gil-composite-refs.ts`（--incoming 分支）、`examples/rubik-3x3/dist/src/game.gia` decode 输出、`scan-gil-signals` 输出。

### O-2026-08-21-5. 悬空检测器增强：重复入边（auto-chain + 显式 connect 冲突）静态检测【已修复 2026-08-30】

- 现检测器（`src/compiler/ir_lint_dangling_exec.ts`）只抓「有出边无入边」的悬空 exec 节点，抓不到**重复入边**（同一 exec 节点多条 exec 入边）。
- 本轮实证：2×2 `gstsDoWhole` 若 start_timer 用 `f.registerExecNode()`（auto-chain 从当前 tail 串一条）同时又有 `connect(t7→startTimer)`，会形成两条 InFlow，同一节点执行两次（日志特征：Start Timer 同节点两帧）。当前靠 `gil-node-graph-reading` 读 `flow` 列表人工核对。
- 落地（2026-08-30，提交 edfcac3）：新增 `GSTS-DUPLICATE-EXEC-INPUT` warning——同一 target 收到 ≥2 条同 source_index 且不同非入口来源的 exec 边即告警。豁免：事件入口 fan-in（timer dispatch 聚合）、同 from 多边（分支 join）、复合 inflow 目标、分支 join（来源 from 唯一入边来自同一分支节点）。6 场景回归 PASS；真实项目告警量：rubik-3x3 9 / football 1（测试合并图 41 为聚合特殊性）。
- 证据：`examples/rubik-2x2/src/game.ts` 修复注释（2026-08-21）、`docs/game-engine-knowledge/retrospective-2026-08-21-dangling-exec-fix.md` 第二节、`tests/ir_lint_dangling_exec_test.ts`。

### O-2026-08-22-1. 复合节点 enum 类型输入无法用于 enumerationsEqual（编译器 bug）【已修复 2026-08-30】

- 现象：复合节点声明 `inputs: { status: { type: 'enumeration' } }`，build 内 `f.enumerationsEqual(status, SettlementStatus.Victory)` 编译报 `Error: Invalid value type: enum`。
- 根因（已定位）：`src/runtime/core.ts` 的 `createTypedValue(type)` switch **没有 `enum`/`enumeration` 分支**，enum 类型复合输入落到 `default` 返回 `new generic()`；而 `enumerationsEqual` 里 `parseValue(enumeration1, 'enum')` 要求 `z.instanceof(enumeration)`，generic 实例不满足 → 抛错。
- 影响：无法用 DSL 复刻「枚举→整数/字符串/执行分支」类复合节点（原版资源包 1610612755/1610612759/1610612757/1610612758 等），因为复合输入无法传 enum。
- 落地（2026-08-30，提交 5c6e94a）：`createTypedValue` 补 `case 'enum'/'enumeration'` 返回 `new enumeration()`（三处调用点全覆盖）；`enumerationsEqual` 的 className mismatch 检查放宽——捕获阶段占位值 className 为空时跳过校验（两个具体枚举类名不同仍报错）。回归 `tests/composite_enum_input_test.ts` PASS + enum_operator_equal + build 绿。
- 关联：`RuntimeValueTypeMap` 已含 `enum: enumeration`，类型与实现现已一致。

### O-2026-08-22-2. composite-docs-navigator/maintainer 不在会话技能加载列表（DSH 发现机制疑点，框架层待排查）

- 现象：`.agents/skills/composite-docs-navigator/` 与 `composite-docs-maintainer/` 的 `SKILL.md` frontmatter 完全正常（name kebab-case + description，无 `disable-model-invocation`），但**不在会话 available_skills 目录**，`skill` 工具加载报 "not available for model invocation"。
- 排查过程（2026-08-22 技能全景审计）：对比 frontmatter 格式、description 长度（756/676，未超 907 的可加载上限）、特殊字符（em dash/弯引号——maintainer 无特殊字符也排除）、冒号模式（均无冒号+空格）——**均非根因**；且刚改 `genshin-ts-project-adapter` 的 description 后目录实时刷新，说明 watcher 活跃，排除「未刷新」。
- 根因判断：DSH skill-filesystem 发现机制层（`@deepseek-ai/dsh-skill-filesystem`）对这两个技能有未定位的排除规则，非项目文件可修。
- 务实缓解（已做）：两者实际是「read 直接读」的知识文档（`genshin-ts-project-adapter` 第 7 条已用文件路径 read 引用）；AGENTS.md 路由表已标注「知识文档，直接 read 引用，勿用 skill 工具加载」。待 DSH 框架层定位根因后决定是否改回可加载。

### O-2026-08-23-1. rubik-3x3 求解接线清理（queue 自动播放方案落定后的残留）

- 背景：game 主图 3054 超标已按"灌 queue 复用自动播放"修复；旧逐条 solve_* 协议废弃。
- 残留待清理（均不影响当前进图，先记录）：
  - 控制器 A(1077936201) 挂载列表残留已删除的 graph 1073741825（detach 报 graph not found，需编辑器清理）。
  - exec 图 1073741828 在 op4/6 无人发后已成死图（已挂 1077936230，可卸载）。
  - 地图仍注册旧 5 个信号 solve_req/ready/move/ack/done（DSL 已不用，死注册；待 assets:signals 清理能力确认后删）。
- 证据：提交 723f679；真实地图 1073741899 回读（mounts list / signals inspect）。

### O-2026-08-23-2. Stage3 复合 pin 路由两条谱系（真实根因已修正）

- 谱系1（原判 shared-vendor 丢「复合 data 输出→输入」路由）：**已证伪**。真实 `.gia` decode + 最小 case 均显示该 conn 物化在位；面转锁死的真实根因是视觉图 `_GSTS_visual` 的 `whenTimerIsTriggered` 对 `execMove` 定时器误走 `view_handle_turn_core`（slot=0）。已在 `a71c4ea` 修 DSL（`visual.ts` default 置 handlerMode=2）。见 `docs/game-engine-knowledge/retrospective-2026-08-24-rubik3x3-stage3-turn-lock.md`。
- 谱系2（legacy 下 get_corresponding_value_from_list 丢 InParam）：**已修** `4717aa0`（`buildImplNodePins` 补 `ordinaryConcreteNid` 门，列表反射边界 capture 保留物理 InParam），回归 `tests/composite/test-stage3-list-boundary-capture-physical-pin.ts` PASS。
- 未闭合：Stage3 独立边界 capture 回归（p2w3/p2w8/p5w9/p5w10/p5w1）的修复在 `backup-stage3-fix-attempts` 分支（0d457a2/9a4fc6e），尚未合入主干；与面转游戏 bug 分开验收。

### O-2026-08-24-1. rubik-3x3 视觉图挂载错位（已修地图，待游戏复测）

- 现象：修掉 execMove 误触发后，面转“没有任何反应”。日志 2862 回读：turnblock/orbit2 定时器发到 `1077936203`，但视觉图 `1073741832` 挂在 `1077936201`。
- 修复：`assets:mounts detach 1077936201 --graph 1073741832` + `attach 1077936203 --graph 1073741832` + `maps:resync`。回读 `1077936201=game`、`1077936203=relay+visual`。
- 待办：游戏内复测面转（9 块逐槽位转 + 解锁）。

### O-2026-08-24-2. 初始化负载拆分 setTimeout 待验证

- `570ca46` 把 `logicReset` 用 `setTimeout(new float(5000))` 延后 5s（spawn 仍即时）。这是“进入负载”的独立缓解，不是“没反应”的根因。
- 风险：5s 内手速触发转动时，列表可能尚未 reset。需连同挂载修复一起游戏复测；若 setTimer 反而引入首转越界/未初始化，需回退。

### O-2026-08-24-3. solverTick 限载已按锚点定 0.7s，待日志复核 + 后续层预算预案

- 已做：`solver_start_tick` 按「面转 0.3s 极限」锚点标定为 0.7s（一次面转主路径 flow_do_move 展开 553 节点 → 可接受 ≈1843 节点/s；求解单 tick 最坏约 1095 节点 → 间隔≥0.59s，取 0.7s）。提交 `bce8cde`。
- 待验证：游戏内核验 0.7s 求解是否不再踢；抓一次 Beyond_Debug_Log 用 `scripts/gia_log.py perf` 复核求解秒段每秒负载。
- 未闭合优化：
  - `solverCrossStep` 内算一次 `solver_cross_mask`（展开 359）+ 外层判定再算一次，可合并省约 1/3 单 tick 展开；
  - 第二层/OLL/PLL 求解更重，必须沿用同一锚点标定法先估 tick 间隔与单 tick 拆分粒度，禁止再拍值。
- O-2026-08-26-1：rubik-3x3 负向 3+1 拆分与队列守卫修复待游戏复测（最小路径：反向开关+手动 U；自动打乱→自动还原全程走完第一层）。
- O-2026-08-26-2：`gsts/server-repeated-evaluation` ESLint 规则未在 examples 上跑（negPhase 二次物化 2899 未被拦截）——补 examples lint 门禁或 CI 脚本。
- O-2026-08-26-3：rubik-3x3 反向旋转仅覆盖面转 1..6；中层 M/E/S 与整体转 x/y/z 仍正方向；`inverseTables.ts` 预研资产闲置。
- O-2026-08-26-4：新节拍（planTick 0.15s / emitTick 1.8s / doneTick 0.7s）的完整自动还原日志 + perf 每秒负载复核未完成；通过后再评估 emitTick 调 1.5s 的空间。
- O-2026-08-26-5：gsts 注入某图失败时不产生醒目失败摘要/非零退出码（2906 事故中 error 行被输出截断掩盖）——给 inject 管线加统一的 FAIL 计数与退出码，供脚本/模型可靠判断。
- 观察项（2026-08-26）：rubik-3x3 game.ts 根回调 finiteLoop 内 registerExecNode（destroy_entity 等）与 turn.ts busyNop 同类形态但为既有工作代码、本轮无回归，未动；若未来再碰 `Generic parameter not matched` 按同法改成高层 API 或挪进复合。

### O-2026-08-27-02 复合输出二次求值：编译器层自动物化/报错（防运动器速度翻倍类 bug）【部分落地 2026-08-30】

- 背景：`kickApply`/`physSlideTick` 中 `callComposite` 输出被 exec 链消费 ≥2 次、中间夹 set 图变量 → 引擎按消费点重新求值 → npos 翻倍 → 运动器速度=逻辑球速×2 → 球瞬移（足球实证，日志 2026-08-27_16-43-43；提交 73b0ca6/e463c1c）。
- 已做（DSL 层）：复合作者手动物化 tmp* 快照防翻倍，技能 + PKC 已沉淀纪律。
- 落地（2026-08-30，提交 0ec799b）：新增 `GSTS-COMPOSITE-OUTPUT-REUSE` warning（独立 linter `ir_lint_composite_reuse.ts`，挂 IR→GIA 必经点）——同一 `__composite_call__` 输出被 ≥2 消费点引用即告警（含写变量消费点标记更高风险），提示物化 tmp* 快照。**选 warning 级**：rubik-3x3 实测 29+ 处多消费，error 会破坏编译；纯数据多消费（无中间写回）可能无害，保守提示。
- 剩余：rubik-3x3 的 29+ 处告警逐处核对清理（部分可能需物化重构）；「中间夹 set 的 exec 链判定」精确版需执行链可达性分析（当前为简化版任意多消费）；未来可评估 --strict-warnings 升级。

### O-2026-08-27-03 运动器传导链：实体滞后机制 + 引擎速度超限阈值未破译

- 已修（motionByVel，提交 9a86262）：运动器直接取逻辑球速，不再用 (target−实体位置)/0.2 反推——消除"实体滞后→delta 放大→速度 20~35 超限→引擎不驱动→更滞后"恶性循环。技能 + PKC 已沉淀。
- 未闭合：
  - 实体位置为何滞后 ballPos（运动器被打断/替换的触发机制）未彻底定位——motionByVel 绕开后果，未根治打断源；
  - 引擎对运动器速度的上限阈值未知（实测 25 m/s 触发异常，具体阈值待破译）；
  - motionToPoint 已无调用（死代码），保留作防御，后续可清理。

### O-2026-08-27-10 页签内部组件（t46/t47/t48/t49/t43/t11）语义未闭合

- 状态已由 `assets:ui states`（t58）覆盖；但页签项的 t46（状态尺寸）、t47（页签项列表 ~180B/条）、
  t48（页签项状态配置）、t49（页签项选择配置）内部结构未解析，CLI 无列出命令。
- 优先级：低（页签创建/编辑功能未提上日程）。

### O-2026-08-27-11 素材组 f12 子类型码语义未闭合（1-196 大量单值）

- 学习资产素材组 f12 子类型码分布 1..196（文本框=188/图片=189/按钮组=55/悬浮页组=13 等少量已知），
  其余多数单值未映射到控件类型。CLI list 已按"素材组"分类，不依赖具体子类型码。
- 优先级：低（不影响列出；创建素材库时按需差分）。

### O-2026-08-27-04 auto_check 定时器链路（f.startTimer 单位秒）已修待验证

- 已修（ada095c）：f.startTimer 延迟单位是秒，[200]=200 秒 → [0.2]。技能已加纪律。
- 未闭合：
  - whenEntityIsCreated 里直接 startTimer 注册是否真的丢失（setTimeout 延迟是规避还是必要）——未做对照实验确认；
  - 4fef286 push_lock 触发也调 autoCheckTick 的结构问题（888df04 已重写，未深挖为什么）；
  - 命中检测路线（onSignal 禁用中）后续是否恢复。

### O-2026-08-27-05 编译器：复合输出 pin 缺失（push_auto_check predDist 输出 = |rolePos|）

- 铁证（22-55-56 日志 + parse push_auto_check impl）：kick 判定用 n=11（正确 predDist），但 predDist **输出**用 n=13，其输入 n=12 Subtraction 第二个输入 present=False（缺失）→ 输出 = |rolePos|。
- 影响：仅该输出值错误（埋点/外部消费），kick 功能正常。
- 待办：构造最小复现（单一复合多 float 输出、一个减法缺减数）判断是否编译器通用缺陷；检查同族复合输出（distNow/vP/vB）。

### O-2026-08-28-02 让位清理重复 set（solverPlan/solverEPlan 5 处）待合并【代码质量，下次窗口】

- 证据：37584a8 给 solveLen/solveLen 重算入口加 bufPos 清零时，5 处重复 `set solveLen+set bufPos` 是复制展开（坏味道）。
- 期望形态：抽一个 solverResetPlanState 复合（清 solveLen/bufPos/mIdx/mLen/mP/pStep），新增共享状态只改一处。
- 何时做：下次 solverCore 改动窗口顺手做（与 O-2026-08-27-06 同窗口）。

### O-2026-08-28-03 复合新增输出引脚+分支内赋值=高危反模式【已闭合 2026-08-28 用户复测通过】

- 证据：日志 2956 rec13「发送信号」吃到 String=bufPos、rec22 stage 图变量读空、视觉 blockOrient 错乱黑块——solverAppendCode 上一版把 pos/next 设计成复合输入/输出引脚 + nextOut 在 doubleBranch 分支内赋值，GIL 数据边错乱（调用方 append 节点 outputs 出现悬空 next:Integer 引脚，被相邻节点参数污染）。
- 修复（0cd996b9）：撤销数据引脚设计，附录游标改回复合内读写独立图变量（bufPos），调用方零引脚变化；已回读核验 call node inputs=[code,raw] outputs=[]。
- 教训：**给带 doubleBranch 的复合新增数据输出引脚，且输出值在分支内赋值 = 高危反模式**（数据边在分支 join 时错位）。
- 何时做：用户复测（转动手感/无黑块/无错位）后闭合。

### O-2026-08-28-01 solveSeq 追加竞态修复【已闭合 2026-08-28 用户复测通过】

- 证据：日志 2954 rec138 solveBuf 残留 [255×9,1,3,3,1]（不可能序列，离线角块宏最长负连发=3）+ 实测 op3 发码 -1×6 连发；根因 = solverAppendCode 读写 solveLen 图变量，op5 重算与 pStep4 追加在相邻 tick 写序交错 → solve_seq 重复/跳码 → 宏残缺 → 十字破坏 → 卡十字/角块循环。
- 修复：solverAppendCode 改显式 pos 入参（pStep4 用独立 bufPos 图变量推进），复合内不再读写 solveLen；所有让位/重算入口（op5/op12/op13/op8/stage 转场）统一清 bufPos+solveLen。
- 何时做：用户复测多次自动还原（至少 3-5 次）确认无偶发；通过则闭合 O-2026-08-27-05（同族）与本条。

### O-2026-08-27-15 魔方独立测试台待用户游戏复测【修复已注入，待复测】

- 证据：b38bdeb 独立测试台（实体 1077936231 + tabBar 选项[二层测试状态,快速模式] + testPanel 图 1073741837 挂载）+ f326224 列表 101→100 修复；注入 ok 8 fail 0，resync md5 5d27b788。
- 期望形态：① 地图能启动；② 测试台实体出现且含 2 个选项；③ tab1 二层测试状态 → tab14 自动还原 → E 层直接求解成功；④ tab2 快速模式生效。
- 何时做：用户复测后闭合；复测通过更新 PROGRESS。

### O-2026-08-27-16 setTabBarOptions 写回修复未经编辑器/游戏核验【已通过导出回读，待游戏核验】

- 证据：修复后导出回读 options 正确（dbg_tab2.mjs），但 patch 输出明确 editorOrGameValidation=not-performed。
- 期望形态：下次任何 --tab-options patch 后，编辑器打开确认选项展示与选择行为。
- 何时做：随 O-2026-08-27-15 复测一并观察（测试台 tabBar 是否正常显示两个选项）。

### O-2026-08-27-12 最小页签 wire 未差分（富版创建的前提）

- 背景：富版悬浮交互页贪心实现事故（retrospective-2026-08-27-rich-floating-page-greedy）教训——
  知识库只有复杂页签（6 页签项 2008）的观察，无最小页签（1 页签项）wire。
- 待办：申请用户做 10 秒编辑器最小实验（加 1 个页签→保存）→ 提取 wire → 落盘 → 再实现富版创建。
- 纪律：任何 UI 创建先有「编辑器最小形态」的 wire 知识；知识不足先差分。

### O-2026-08-27-13 页签 t47 页签项内部 ~180B 结构未闭合

- 每项含返回服务器事件开关？/素材组引用/配置，结构待差分。

### O-2026-08-27-14 状态素材组子记录素材引用依赖

- 学习资产状态组子记录（文本 2010/图片 1991）引用素材 1884（纸本-牌类）在目标图缺失；
  状态组在目标图创建需要独立素材或空引用策略（待差分）。

### O-2026-08-28-01 带球玩家测速依赖 buff 已修待验证

- 已修（e6c0cbe）：queryCharacter 依赖「监听移动速率」buff 返回 0 → 改位置差分测速（不依赖 buff）。
- 未闭合：位置差分测速精度（急停/转身滞后）；参数（VKICK_ADD=1.0/KICK_DIST=2.0/ROLL_DECEL=3.0）待手感微调；motionByVel grounded 视觉修正未拆。

### O-2026-08-28-09 gia_log_flow 工具后续改进项

- ① 服务端图模式：head=动态帧 ID，需复用 gia_log.py 的节点名映射（当前 --client 专用）【**已闭合 2026-08-28**：服务端模式实现——head 首字节=主图节点序号 + gia_log.py 节点链标注 + 双语控制流关键词 + 同节点连续机制帧合并 ×N + trace-node 主图节点 + 图解析 /tmp 缓存】② 多分支 case 精确匹配【**已落地 2026-08-30（ae481ef）**：控制值匹配 case 列表 → `命中 case[N]`，无匹配 → `default` 标注】③ 双分支 true/false 走向【**已落地 2026-08-30（ae481ef）**：按条件值标注 `TRUE/FALSE 分支`；受控小样本 PASS，端到端待真实多分支日志验证】④ 客户端打印不落服务器日志（官方客户端节点图日志通道 mhrnuz9izfne 另查）。
- 证据：魔方会话 2979 rec2/rec163 事件线视图验证输出（rec2 65 行含循环体×26 折叠、rec163 58 行、--trace-node 115 六参数来源链到源头）；会话 2980 完整游玩日志服务端模式验证（魔方块-旋转 137 帧→15 行事件线、trace-node 主图节点）。
- 何时做：④ 客户端打印通道另查；②③ 端到端在下次读真实多分支日志时顺带核验。

### O-2026-08-28-10 完整游玩日志（会话 2980）新发现待闭合项

- ① 类型码 25/26（结构体）内部字段结构：局内存档 1_chip_1/2 数据（`25=[8,10,18,4,...]` 原始字节 + 拆分结构体/修改结构体复合 1610612796/1610612797）——需读图 1073741853 或编辑器差分。
- ② 服务端 List Iteration Loop 的循环体级折叠：当前仅"同节点连续机制帧合并 ×N"，3 轮循环体（Assembly List+取整+写回）仍逐轮展开；有限循环 0d05/0d09 精确语义同待。
- ③ trace-node 服务端复合 impl 帧参数：当前仅主图节点（head 首字节）；复合内节点数据流需读 impl 图（parse-gil --json 已有 children）。
- ④ 结算合法图（1073741854）：When Global Timer Is Triggered（全局计时器1）周期与判胜链未读图核验（日志已见 36 帧）。
- ⑤ PKC claim 修正：按钮字典 L=1073741870（claim 现写 1073741937~1073741940 连续），需重跑 pkc capture 更新 client-log-encoding claim。
  **2026-08-30 尝试被 PKC 工具约束阻塞**：revise-claim 后 add-authority-ref 报 PLAN_CLAIM_REVISED_NEEDS_REFRESH
  （只许 refresh），而该 claim 为 not_registered（authority-refs.json 0 条）无法 refresh 单条；
  `refresh --all-stale` 会拉全库 130 条 stale ref（范围事故，已 abandon）。精确映射已落已提交文档
  `docs/game-engine-knowledge/debug-log-format.md`「按钮字典精确映射」节（F=1937/B=1938/L=1870/R=1936/
  U=1939/D=1940，commit 9cfbc58）——claim 与文档暂时不一致，待 PKC 支持 revise 无 ref claim 补 ref
  或批量维护轮统一处理（与 O-2026-08-29-11 stale refs 积压同窗口）。
  **2026-08-31 第 0 轮复现完成**：四错误码全部落码复现（revise→add 拒 PLAN_CLAIM_REVISED_NEEDS_REFRESH /
  refresh 无目标 PLAN_AUTHORITY_REF_MISSING / check PLAN_CLAIM_AUTHORITY_INSUFFICIENT / 对照直接 add
  PLAN_CLAIM_MISSING），与本记录一致；推荐修复候选 A（add_authority_ref 对零 ref revised claim 放行，
  有 ref 仍走 refresh）影响面分析见 `docs/maintenance/O-28-10-pkc-deadlock-round0-design.md`——
  待用户裁决后才动上游（R1 红绿测试 → R2 修复 → R3 本项目 plan-upgrade+复现 → R4 bundle 审批提交）。
  **已闭合（2026-08-31）**：用户裁决候选 A 后全链落地——上游修复 bccf0c9（红绿测试：新增
  zero_ref_revised 用例 + 1728 守护断言保持，198 测试全绿）+ 0c86356（SKILL.md 语义同步）；本项目
  plan-upgrade fe838a0→0c86356（校验链绿）；复现场景 revise→add-ref→check delta 0 错→finalize 全程
  无 PLAN_* 错误；bundle bnd_afd9abe3（精确 hash afd9abe33124947dfd14149ce59fd28b4a7d24164534d30d382614edfe43777d）
  经用户审批 apply——claim 精确映射 F=1937/B=1938/L=1870/R=1936/U=1939/D=1940 已落知识文档，
  首条 authority ref aref_430adf7d（debug-log-format.md 按钮字典精确映射节）补齐 coverage。
- ⑥ f10=8（结算合法=5）的组件定义 ID 语义、魔方动画=1 的写入方（服务端图未读）、指令异常始终空的触发条件。
- 证据：日志 2026-08-28_23-51-57_2980（5 次操作 ops 时间线）+ 地图 SHA f90ac5438c…。
- 何时做：下次读服务端图日志/读图窗口补 ①②③；读结算图窗口补 ④；pkc 录入窗口补 ⑤。

### O-2026-08-29-07 server 局部变量列表字面量静默丢值（DSL 缺口）【已闭合 2026-08-29 修复层】

- 证据修正（2026-08-29 本任务第 0 轮三探针复核）：`f.initLocalVariable('int_list', [1,2,3])`
  经正式 DSL 管线编译时值**不丢**——Stage 1 `tryTransformWrappedArrayLiteral` 把数组字面量包装为
  `gsts.f.assemblyList([...])`；Stage 3 `expandListLiterals`（preprocess.ts）对手写 IR 的
  `*_list` 字面量 arg 也自动展开为拼装列表节点(169)，元素/count pin 全部保留（`.local/vars-explore/`
  lv-list-literal / lit-list-ir 探针实证）。**真正的静默面是运行时收到原始数组（绕过 Stage 1）**：
  bigint 数组 → matchTypes 报 "Generic parameter not matched"（非静默）；**三元 number 数组
  [1,2,3] 被 matchTypes 误判为 vec3 字面量 → set_local_variable 值 arg 类型错位且无任何报错**
  （静默错值）。原记录"只生成空类型锚 54 hex"与当前源码行为不符（疑为当时陈旧 dist 实验），已修正。
- 修复：`ir_to_gia_transform/index.ts` 新增 `validateLocalVariableTypeConsistency`（Stage 3
  编译期硬拦截）：server `set_local_variable` 的 InParam[1] 值类型必须与 E<1016> 身份连线指向的
  Get 声明类型一致（variables.md "Get/Set 类型必须一致"实证）；不一致抛错并提示用
  `f.assemblyList([...])` 拼装。client 以名字识别自动跳过（类型由 Stage 1 检查保证）。
- 回归：`tests/local_variable_list_literal_test.ts`（A：DSL 路径数组字面量 → assemblyList 包装；
  B：*_list 字面量 → 拼装节点元素/连线保留；C：vec3/int 错位值 → 编译期报错）+ fixture
  `tests/local_variable_list_literal_fixture.ts`。三个 wire 回归 + 17 样本 verify 全 0 DIFF。
- 剩余：`f.concatenateList(c, d)` 类运行时直调原始数组仍报 "Generic parameter not matched"
  （非静默，报错信息泛化）——可后续优化提示；不影响本闭合。client 列表字面量元素形态
  （alreadySetVal+显式 bInt{0}）无编辑器样本，不得声称 verified（维持原标注）。

### O-2026-08-29-08 技能配置绑定未闭合规则（CLI 边界）

- ① **f5 wire 顺序三绑重排**：双绑=绑定顺序（v4/v7 样本）；第三绑编辑器重排（v8
  wire=[440@1832, 433@1825, 433@1839]），重排规则未闭合——CLI 多绑按传入顺序生成，
  语义按轨道点序列保证，>2 绑逐字节对齐需编辑器样本。
- ② **普通释放打点资源语义**：36=3001（无 f9）、28=7001001（带 f9）各 1 样本；
  6=1001/1004/1007 官方预制动画（时长 2.01/0.53/3.16s，整轨 5s）。
- ③ **普通释放多图绑定 / 非 0.0s 触发点**：打点复用与触发点 ID 语义未采样，CLI 限 1 图/0.0s。
- ④ **28+普通 绑定**：编辑器须先手动添加造物动画再挂图，CLI 仅 list（用户确认）。
- ⑤ **root20 记录 ID 分配**：记录 ID 与图 ID 共用池（1082130435/436），复制+1 语义未解析；
  CLI 按固定模板复制；多造物技能共用 root20 容器（用户确认合法）。
- 证据：1073741914 快照 v3~v18（manifest Round 2a~3e）+ tests/gil_client_graph_skillconfig_test.ts。
- 何时做：需要编辑器差分补样本时（三绑重排 UI 操作细节；普通释放第二绑）。

### O-2026-08-29-09 客户端图注入链路待游戏核验

- clientProbe 已注入 1082130441（_GSTS_clientProbe，5 节点，读图核验通过）；
  游戏实测待做：服务端主动施放技能实例（技能配置 1228931074「测试-CLI技能」36+瞬发绑定该图）
  → 客户端图记录 f8=2097154 + 服务器 f22 'client-probe' 文本。
- 前置：服务端图需加施放逻辑（参考「魔方-客户端优化版本」架构：技能实例创建→施放指定技能实例）。
- 何时做：用户安排真实技能触发测试时。

### O-2026-08-29-10 PKC post-apply 评估门行为与新知识合法重叠流程（二轮复盘 R2 记录）

- 事实：二轮复盘 R2 capture（bnd_81d5378d，claims 339→357）apply 后，post-apply 评估门报
  full-closure-and-id-integrity-1 失败（exit 1），但事务已落盘（validate ok、357 claims）。
  根因：新 R12 claim（模板 ID 审计/引用完整性）与评估 query「静态拼装 闭包 ID 完整性」**语义合法重叠**，
  把旧期望 topic 挤出 top-3（断言 topic_top_n=3）。
- 处理（用户逐门批准）：①topic 关键词去竞争（bnd_f5dc558f）②claim 标题修订（bnd_253802ff）
  ③评估夹具 expected_topic_ids 增加 static-assembly-family（语义断言不变）。
- 残留问题：post-apply 评估门对 **affected_by 不相交** 的用例也做阻塞判定（本例 affected_by=static-gil-assets，
  而计划只动 game-engine-knowledge 节点）——与「无关用例失败只告警不卡」的既定口径不符；
  是否需在 PKC 运行时修正，待后续维护轮确认。
- **答复（2026-08-29，portable-knowledge 92ab7d2）**：已在运行时修正——post-apply 全量跑用例但只阻塞
  affected 用例（与 preflight 同一 select 口径），不相交失败降级 `PLAN_EVALUATION_NON_BLOCKING` 告警；
  阻塞时报错附 `PLAN_POST_APPLY_TRANSACTION_STATE`（applied/not rolled back + bundle-status 指引）。
  副本复现验证：修复前 exit 1 只报 case_id → 修复后同场景 exit 0、该用例仅告警。
- **已关闭（2026-08-29）**：本项目运行时已 plan-upgrade 至 portable-knowledge `fe838a0`（含 92ab7d2 的 R10 修复，升级校验含 knowledge-check 全绿），本项残留问题随之关闭。
- 流程沉淀：新知识合法改变检索格局时，正确杠杆顺序 = topic 元数据 → claim 标题措辞（clarify）→
  夹具更新（用户审阅精确 diff）；禁止为迁就检索删改 claim 正文语义。

### O-2026-08-29-11 PKC 补录轮遗留（2026-08-29 复盘登记）

- 事实：补录轮后工作树仍有 7 个未跟踪 bundle 文件（bnd_60015fd1f/bnd_9838cbe/bnd_9b1f27e/
  bnd_bc159e/bnd_c9263d/bnd_f7a55d6，含 approval/draft），属**进行中工作**（非本会话创建）——
  任何提交只精确暂存本次相关文件，**勿扫入这些文件**；其所有者应自行完成或明确移交。
- 126 条 historical stale/invalidated refs 维护积压仍待处理（非阻塞，单独维护 plan 消化）。
- 可选改进：topic Markdown 头（title/summary）与 registry 无一致性校验——2026-08-29 测试夹具
  暴露 registry/markdown summary 不一致仍通过 validate；真实项目若出现同类漂移当前只能靠 apply 时
  update-topic 的重建顺带修正。登记给 portable-knowledge 作为候选校验项。

### O-2026-08-30-01 其他地图注入残留扫描（2026-08-30 足球拒载复盘登记）

- 事实：足球 1073741908 注入切版本后残留旧冲量踢球复合链（auto_check_tick→dribble_decide）类型错位 → 游戏拒载无日志。
  已清理 7 个残留（SHA 0ae6f5d1→7130d60d）。同族风险：**其他地图（rubik-3x3、lights-out、cube-replica-c4 等）
  历史上多次注入，复合目录可能也有 (1) 后缀残留或旧 def 残留**——游戏校验目录全部复合，零引用错误副本照样拒载。
- 排查命令：`npx tsx tools/parse-gil-node-graph.ts <map.gil> --list` 看多版本/残留；
  `npx tsx tools/check-gil-composite-refs.ts <map.gil> --incoming <本次.gia>` 看类型错位。
- 清理流程：见 gil-node-graph-editing 技能「残留复合清理」（def-clean --force 残留链整体删）。
- 状态：备份快照已扫描（2026-08-30）——rubik-3x3（1073741899）/ lights-out（1889+1890）/
  football（1073741908）最新备份 parse --list 均无 (1) 后缀副本、无重复 def（rubik-3x3 有历史删除
  留下的 ID 空洞，属正常）。注意：备份为写回前快照，真实游戏端地图残留仍需下次注入时 --incoming
  校验；未主动动其他地图。

### O-2026-08-30-02 CI/本地门禁缺失——build 断裂约 2 周无人知（2026-08-30 构建门禁复盘登记）

- 事实：08-16 加 private brand 后 `npm run build` 实际一直红（888 类型错误），期间多笔提交用
  「src-only tsc 无新增错误」局部验证代替全量门禁；quicktest 同理从未跑通（第一步 build 即失败）。
  本次（2026-08-30）才一次性暴露并修复（243bf0e + 235bdff，双门禁恢复绿）。
- 期望形态：本地一键门禁脚本（build + quicktest + git diff --check）或 GitHub Actions；提交前必跑。
- 何时做：下一次工具链维护轮。

### O-2026-08-30-03 双副本消费方检查清单（新增 tsx spawn / CLI 入口时必须带 TSX_TSCONFIG_PATH）

- 事实：tsconfig paths（genshin-ts/* → src）对 tsc 类型检查必需（src 单副本），但 tsx 运行时也读
  tsconfig.json paths，导致 .gs.ts 包 import 走 src 与 CLI（dist）双副本，kCtxStack unique symbol
  分裂 → 所有 gsts.f 访问报 ctx=javascript（quicktest 7+1、football 编译失败）。
  修复：tsconfig.tsx.json（无 paths）+ 三处 spawn 注入 TSX_TSCONFIG_PATH（235bdff）。
- 检查点（新增 spawn/入口时）：① spawn tsx 必须带 TSX_TSCONFIG_PATH；② 验证命令
  `node --import tsx -e "console.log(import.meta.resolve('genshin-ts/runtime/core'))"`；
  ③ __dirname 跳数按目录深度逐处核对（src 与 dist 下深度不同）。
- 详见 CLAUDE.md「类型与运行时单副本」节 + retrospective-2026-08-30-build-gate-and-dual-copy.md。

### O-2026-08-30-04 根目录命令残留垃圾文件待删（无意义文件名）

- 文件：`<, v) for k,v in d[scripts].items() if k in (build,test,quicktest,typecheck)]`（根目录，
  会话命令解析残留，约 0 字节）。删除即可（非 git 跟踪）。
