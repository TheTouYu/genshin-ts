# 复盘账本（Review Ledger）

复盘发现项的**带状态追踪**：复盘开始先查本文件 + `git log --oneline -20`，**已落地（DONE）的项直接跳过，不重复分析**；未落地（OPEN）项才是本次复盘的分析对象。

## 使用说明（复盘/派活前必读）

1. 查 `git log --oneline -20`：最近的落地提交（如"复盘落地"）= 已处理过的问题集合，读提交信息即可知道覆盖了什么。
2. 查本文件：DONE 区已登记的项不再分析；OPEN 区是待办。
3. 复盘产出新发现 → 落地后登记 DONE（日期 + 证据 + 落地方式），未落地登记 OPEN。
4. 保持轻量：每条 1-3 行，只记"发现 + 证据 + 落地方式"，不复制细节（细节在提交 diff 里）。

## 已落地（DONE）

### 2026-08-15 P4-4 构建门禁修复（examples 类型问题全链）

| 发现 | 证据 | 落地方式 |
|---|---|---|
| `npm run build` 红：34 个类型错误集中在 examples（provenance/FlowMarkerRef/裸 exec 参数伪装类型/unitTagIndexList list 实例 + 历史 timerName 缺口） | `npx tsc -p tsconfig.json --noEmit` EXIT=2 | 类型契约修复（value.ts/core.ts/nodes.ts/server_globals.d.ts）+ `tests/timer_global_overload_type_safety_test.ts` 回归；TASKS.md P4-4 关闭、PROGRESS.md 新增变更记录 |
| 定时器类型回归顺带暴露 Stage-1 新 bug：类型级 `typeof a.b`（QualifiedName）被 timer capture 误当运行时变量 → 生成跨作用域引用 `timerName` 并在 IR 阶段 ReferenceError | quicktest 红灯 `ReferenceError: timerName is not defined`（生成 .gs.ts 捕获块跨作用域） | `shouldCaptureIdentifier` 排除 `QualifiedName.right`；同文件类型断言保留为永久回归 |
| 完整 `npm run gen` 再次产出 ~5.5k 行资源漂移（nodes/events/prefab 生成物） | 本次 gen 后 `git diff --stat`：nodes.ts 5520 行、events 561 行等 | 按 compiler-practical-optimization-backlog §7.1 恢复无关生成结果，改用 `--composite-contracts-only` 最小生成；**漂移仍需独立审计，不属于 P4-4** |

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

- 证据：同 trace——查 ui-controls.md + src/cli/ui.ts 确认 CLI 无屏幕 UI 创建能力；
  用选项卡（tabBar）替代开始界面。
- 影响：游戏无法用 CLI 做屏幕 UI（开始界面/计分板等），只能选项卡/实体替代。
- 方向：文档标注限制（已有 ui-controls.md）；评估 CLI 增加 UI 入口（需编辑器预置语义调查）。

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
