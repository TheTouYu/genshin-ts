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
- **第二层剩余（77 个依赖方错误）**：manual_verify_*（44）、server-nodegraph（12）、
  list_dict_placeholder（8）、core.ts 事件映射（5）、signal_parameters（3）、
  enum_updates（3）——断言期望更新 + core.ts 事件表适配；**事件集收缩决策点**
  （官方资源删除 whenPlayerFollowsControlMotor 等 3 事件，DSL 表面收缩）。
- **第三层**：expr.ts modifyValueInList→setListValue（签名语义：10 重载→GenericValue
  单签名，需游戏验证 list[id]=v）；timer 转换器 modifyGlobalTimer→increaseGlobalTimerValue
  （targetEntity 参数变化）。
- 何时做：用户授权范围内继续（第二层断言更新可自主完成）。

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
